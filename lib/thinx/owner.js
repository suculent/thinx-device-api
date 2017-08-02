/** This THiNX-RTM API module is responsible for managing userlib records. */

var Owner = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var prefix = fs.readFileSync(app_config.project_root + '/conf/.thx_prefix') ? fs.readFileSync(
		app_config.project_root + '/conf/.thx_prefix') + "_" : "";
	var userlib = require("nano")(db).use(prefix + "managed_users");
	var sha256 = require("sha256");
	var fs = require("fs");
	var Emailer = require("email").Email;
	var alog = require("./audit");
	var apikey = require("./apikey");
	var deploy = require("./deployment");

	var exec = require("child_process");

	var Rollbar = require("rollbar");

	var rollbar = new Rollbar({
		accessToken: "5505bac5dc6c4542ba3bd947a150cb55",
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

	// public
	var _public = {

		avatar_path: function(owner) {
			return app_config.project_root + "/data/" + owner + "/avatar.json";
		},

		avatar: function(owner) {
			var afile = _public.avatar_path(owner);
			if (fs.existsSync(afile)) {
				return fs.readFileSync(afile).toString();
			} else {
				return app_config.default_avatar;
			}
		},

		save_avatar: function(owner, avatar, callback) {
			var afile = _public.avatar_path(owner);
			fs.open(afile, "w+", function(err, fd) {
				fs.writeFile(afile, avatar, function(err) {
					if (err) {
						console.log(err);
						callback(false, err);
					} else {
						fs.close(fd, function() {
							callback(true, "avatar_saved");
						});
					}
				});
			});
		},

		profile: function(owner, callback) {

			userlib.get(owner, function(err, body) {

				if (err) {
					callback(false, err);
					return;
				}

				var fn = body.first_name;
				var ln = body.last_name;

				if (typeof(body.info) !== "undefined") {
					if (typeof(body.info.first_name !== "undefined")) {
						fn = body.info.first_name;
					}
					if (typeof(body.info.last_name !== "undefined")) {
						ln = body.info.first_name;
					}
				}

				var profile = {
					first_name: fn,
					last_name: ln,
					username: body.username,
					owner: body.owner,
					avatar: _public.avatar(body.owner),
					info: body.info
				};

				callback(true, profile);

			});
		},

		update: function(owner, body, callback) {

			var update_key = null;
			var update_value = null;

			if (typeof(body.avatar) !== "undefined") {
				update_key = "avatar";
				update_value = body.avatar;
				_public.save_avatar(owner, update_value, function(err, response) {
					callback(err, response);
				});
				return;
			}

			if (typeof(body.info) !== "undefined") {
				update_key = "info";
				update_value = body.info;
			} else {
				callback(false, "invalid_protocol");
			}

			alog.log(owner, "Attempt to update owner: " + owner +
				" with: " + update_key);

			// Fetch complete user for editing
			userlib.get(owner, function(err, doc) {

				if (err) {
					console.log(err);
					alog.log(owner, "Profile update failed.");
					callback(false, "owner_not_found");
					return;
				}

				if (!doc) {
					console.log("Document for " + owner + " not found.");
					alog.log(owner, "Profile update failed.");
					callback(false, "document_not_found");
					return;
				}

				doc[update_key] = update_value;

				userlib.destroy(doc._id, doc._rev, function(err) {

					if (err) {
						console.log(err);
						//does not really matter, we MUST attempt to save
						//callback(false, "destroy_error");
						//return;
					}

					delete doc._rev;

					userlib.insert(doc, doc._id, function(err, body, header) {

						if (err) {
							console.log(err);
							alog.log(owner, "Profile updated.");
							callback(false, "profile_update_failed");
							return;
						} else {
							alog.log(owner, "Profile updated successfully.");
							callback(true, doc[update_key]);
						}
					});
				});
			});
		},

		password_reset: function(owner, reset_key, callback) {

			if (typeof(reset_key) === "undefined") {
				console.log("Missing reset key.");
				callback(false, "missing_reset_key");
				return;
			}

			alog.log(owner, "Attempt to reset password with: " + reset_key);

			userlib.view("users", "owners_by_resetkey", {
				"key": reset_key,
				"include_docs": true
			}, function(err, body) {

				if (err === false) {
					console.log("Error: " + err.toString());
					if (err) {
						console.log(err);
						callback(false, err);
					} else {
						callback(false, "invalid_protocol");
						console.log("Not a valid request.");
					}
					return;
				}

				if (body.rows.length === 0) {
					callback(false, "user_not_found");
					return;
				}

				var user = body.rows[0].doc;
				var user_reset_key = user.reset_key;

				if (typeof(user_reset_key) === "undefined") {
					user_reset_key = null;
				}

				console.log("Attempt to reset password with key: " +
					reset_key);

				if (reset_key != user_reset_key) {
					console.log("reset_key does not match");
					callback(false, "invalid_reset_key");
					return;
				} else {
					callback(true, {
						redirectURL: "https://rtm.thinx.cloud:443/password.html?reset_key=" +
							reset_key + "&owner=" + user.owner
					});
				}
			});

		},

		password_reset_init: function(email, callback) {

			userlib.view("users", "owners_by_email", {
				"key": email,
				"include_docs": true // might be useless
			}, function(err, body) {

				if (err) {
					console.log("Error: " + err.toString());
					callback(false, "user_not_found");
					return;
				} else {
					console.log("password reset users: " + body.rows.length);
					if (body.rows.length > 2) {
						callback(false, "too_many_users");
						return;
					}

					if (body.rows.length === 0) {
						callback(false, "email_not_found");
						return;
					}
				}

				var user = body.rows[0].doc;
				if (typeof(user) === "undefined" || user === null) {
					console.log("User not found.");
					callback(false, "user_not_found");
					return;
				}

				console.log("Creating new reset-key...");
				user.reset_key = sha256(new Date().toString());

				userlib.destroy(user._id, user._rev, function(err) {

					delete user._rev;

					userlib.insert(user, user.owner, function(err, body,
						header) {

						if (err) {
							console.log(err);
							callback(false, "insert_failed");
							return;
						}

						console.log("Resetting password for user: " +
							JSON.stringify(user));

						var resetEmail = new Emailer({
							bodyType: "html",
							from: "api@thinx.cloud",
							to: email,
							subject: "Password reset",
							body: "<!DOCTYPE html>Hello " + user.first_name +
								" " + user.last_name +
								". Someone has requested to <a href='https://rtm.thinx.cloud:7443/api/user/password/reset?owner=" +
								user.owner + "&reset_key=" + user.reset_key +
								"'>reset</a> your THiNX password.</html>"
						});

						console.log("Sending reset e-mail: " + JSON.stringify(
							resetEmail));

						resetEmail.send(function(err) {
							if (err) {
								console.log(err);
								callback(false, err);
							} else {
								console.log("Reset e-mail sent.");
								if (email == "cimrman@thinx.cloud") {
									callback(true, {
										status: "email_sent",
										key: user.reset_key
									});
								} else {
									callback(true, {
										success: true,
										status: "email_sent"
									});
								}

							}
						});
					});
					// Calling page already displays "Relax. You reset link is on its way."
				}); // insert
			}); // view

		},

		activate: function(ac_owner, ac_key, callback) {

			userlib.view("users", "owners_by_activation", {
				"key": ac_key,
				"include_docs": true
			}, function(err, body) {

				if (err === true) {
					console.log("Error: " + err.toString());
					callback(false, "user_not_found");
				} else {
					callback(true, {
						redirectURL: "https://rtm.thinx.cloud:443/password.html?activation=" +
							ac_key + "&owner=" + ac_owner
					});
				}
			});
		},

		set_password: function(body, callback) {

			var password1 = body.password;
			var password2 = body.rpassword;

			var request_owner = null;
			if (typeof(body.owner) !== "undefined") {
				request_owner = body.owner;
			} else {
				console.log("Request has no owner for fast-search.");
			}

			if (password1 !== password2) {
				callback(false, "password_mismatch");
				return;
			} else {
				console.log("Passwords match....");
			}

			if (typeof(body.reset_key) !== "undefined") {

				alog.log(request_owner, "Attempt to set password with: " + body
					.reset_key);

				console.log("Performing password reset...");

				// Validate password reset_key
				userlib.view("users", "owners_by_resetkey", {
					"key": body.reset_key,
					"include_docs": true
				}, function(err, body) {

					if (err === true) {
						console.log("Error: " + err.toString());
						if (err === true) {
							console.log(err);
							callback(true, err);
							return;
						} else {
							callback(false, "reset");
							console.log("Not a valid request.");
							return;
						}
					} else {

						console.log("resetting user: " + body.owner); // JSON.stringify(body)

						if (body.rows.length === 0) {
							callback(false, "reset_user_not_found");
							return;
						}

						var userdoc = body.rows[0].value;

						userdoc.password = sha256(password1);
						userdoc.last_reset =
							new Date();
						userdoc.reset_key = null;

						if (err !== null) {
							console.log("Cannot destroy user on password-set");
							callback(false, "user_not_reset");
							return;
						}

						console.log("Creating document...");

						userlib.destroy(userdoc._id, userdoc._rev, function(err) {
							delete userdoc._rev;
							userlib.insert(userdoc, userdoc.owner, function(err) {
								if (err) {
									console.log("Cannot insert user on password-set");
									userlib.insert(userdoc, userdoc.owner, function(err) {
										console.log("Cannot re-insert user on password-set");
										callback(false, err);
									});
									return;
								} else {
									console.log(
										"Password reset completed saving new user document."
									);
									callback(true, {
										success: true,
										status: "password_reset_successful"
									});
									return;
								}
							});
						});
					}
				});

			} else if (typeof(body.activation) !== "undefined") {

				console.log("Performing new activation...");

				alog.log(request_owner, "Attempt to activate account with: " +
					body.activation);

				userlib.view("users", "owners_by_activation", {
					"key": body.activation,
					"include_docs": true
				}, function(err, body) {

					if (err) {
						console.log("Error: " + err.toString());
						callback(false, "reset_error");
						return;

					} else {

						console.log("activating user: " + JSON.stringify(body));

						if (body.rows.length === 0) {
							callback(false, "activated_user_not_found");
							return;
						}

						console.log("Activating user: " + request_owner);

						var userdoc = body.rows[0].value;
						deploy.initWithOwner(userdoc.owner);
						console.log("Updating user document: " + JSON.stringify(
							userdoc));

						userlib.destroy(userdoc._id, userdoc._rev, function(err) {
							delete userdoc._rev;
							userdoc.password = sha256(password1);
							userdoc.activation_date = new Date();
							userdoc.activation = null;
							userlib.insert(userdoc, userdoc._id, function(err) {

								if (err) {
									console.log(err);
									console.log(
										"Could not re-insert user on new activation."
									);
									callback(false, "user_not_saved");
									return;
								} else {
									// TODO: Password-reset success page, should redirect to login.
									console.log(
										"Password reset success page, should redirect to login using response that tells webpage to go to /..."
									);
									callback(true, "//rtm.thinx.cloud:443/");
									return;
								}
							});

						});
					}
				});
			} else {
				console.log("No reset or activation? Edge assert!");
				failureResponse(res, 403, "Password change not authorized.");
			}
		},

		create: function(body, callback) {

			var first_name = body.first_name;
			var last_name = body.last_name;
			var email = body.email;
			var username = body.owner;
			// password will be set on successful e-mail activation

			var new_owner_hash = sha256(email);

			userlib.view("users", "owners_by_username", {
				"key": new_owner_hash,
				"include_docs": false
			}, function(err, body) {

				if (err) {
					if (err != "Error: missing") {
						console.log("Error: " + err.toString());
					}
				} else {
					var user_should_not_exist = body.rows.length;
					if (user_should_not_exist > 0) {
						callback(false, "email_already_exists");
						console.log("Already exists.");
						return;
					}
				}

				var new_api_keys = [];
				var new_rsa_keys = {};

				var new_activation_date = new Date().toString();
				var new_activation_token = sha256(new_activation_date);

				var default_repos = {
					"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f3": {
						"alias": "THiNX Vanilla ESP8266 Arduino",
						"url": "git@github.com:suculent/thinx-firmware-esp8266-ino.git",
						"branch": "origin/master",
						"platform": "arduino"
					},
					"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f4": {
						"alias": "THiNX Vanilla ESP8266 Platform.io",
						"url": "git@github.com:suculent/thinx-firmware-esp8266-pio.git",
						"branch": "origin/master",
						"platform": "platformio"
					},
					"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f5": {
						"alias": "THiNX Vanilla ESP8266 LUA",
						"url": "git@github.com:suculent/thinx-firmware-esp8266-lua.git",
						"branch": "origin/master",
						"platform": "nodemcu"
					},
					"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f6": {
						"alias": "THiNX Vanilla ESP8266 Micropython",
						"url": "git@github.com:suculent/thinx-firmware-esp8266-upy.git",
						"branch": "origin/master",
						"platform": "micropython"
					},
					"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f7": {
						"alias": "THiNX Vanilla ESP8266 MongooseOS",
						"url": "git@github.com:suculent/thinx-firmware-esp8266-mos.git",
						"branch": "origin/master",
						"platform": "mongoose"
					}
				};

				var default_info = {
					"first_name": first_name,
					"last_name": last_name,
					"mobile_phone": " ",
					"security": {
						"important_notifications": true
					},
					"goals": [],
					"username": username,
					"owner": new_owner_hash
				};

				apikey.create(new_owner_hash, "Default MQTT API Key",
					function(success, object) {
						if (success) {
							// will be used for mqtt messenger
							// MQTT
							var CMD = "mosquitto_passwd -b " + app_config.project_root +
								"/mqtt_passwords " + new_owner_hash +
								" " + object.key;
							var temp = exec.execSync(CMD);
							console.log("[APIKEY:CREATE:REGISTER] Creating mqtt account...");
							if (temp !== null) {
								console.log("[APIKEY:CREATE:REGISTER_ERROR] MQTT: " + temp);
							}
						} else {
							console.log("Creating Default MQTT API Key failed.");
						}
					});

				// Create user document
				var new_user = {
					owner: new_owner_hash,
					username: username,
					email: email,
					api_keys: new_api_keys,
					rsa_keys: new_rsa_keys,
					first_name: first_name,
					last_name: last_name,
					activation: new_activation_token,
					activation_date: new_activation_date,
					repos: default_repos,
					info: default_info
				};

				userlib.insert(new_user, new_owner_hash, function(err,
					body, header) {

					if (err) {
						if (err.statusCode == 409) {
							callback(false, "email_already_exists");
						} else {
							console.log(err);
						}
						return;
					}

					console.log("Sending activation email...");

					// Creates registration e-mail with activation link
					var activationEmail = new Emailer({
						bodyType: "html",
						from: "api@thinx.cloud",
						to: email,
						subject: "Account activation",
						body: "<!DOCTYPE html>Hello " + first_name +
							" " +
							last_name +
							". Please <a href='https://rtm.thinx.cloud:7443/api/user/activate?owner=" +
							username + "&activation=" +
							new_activation_token +
							"'>activate</a> your THiNX account.</html>"
					});

					console.log("Sending activation e-mail: " + JSON.stringify(
						activationEmail));

					activationEmail.send(function(err) {
						if (err) {
							console.log(err);
							callback(false, "activation_failed");
						} else {
							console.log("Activation email sent.");

							if (email == "cimrman@thinx.cloud") {
								callback(true, new_activation_token);
							} else {
								callback(true, {
									success: true,
									status: "email_sent"
								});
							}
						}
					});
				}); // insert
			}); // view

		}

	};

	return _public;

})();

exports.profile = Owner.profile;

exports.create = Owner.create;
exports.update = Owner.update;
exports.password_reset =
	Owner.password_reset;
exports.password_reset_init = Owner.password_reset_init;
exports
	.activate = Owner.activate;
exports.set_password = Owner.set_password;
