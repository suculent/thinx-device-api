/** This THiNX-RTM API module is responsible for managing userlib records. */

var Owner = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var userlib = require("nano")(db).use("managed_users");
	var sha256 = require("sha256");

	var Emailer = require('email').Email;
	var alog = require("./audit");

	// public
	var _public = {

		profile: function(owner, callback) {

			userlib.get(owner, function(err, body) {

				if (err) {
					callback(false, err);
					return;
				}

				var avatar = app_config.default_avatar;
				if (typeof(body.avatar) !== "undefined") {
					avatar = body.avatar;
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
					avatar: avatar,
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
			} else if (typeof(body.info) !== "undefined") {
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
						callback(false, "destroy_error");
						return;
					}

					delete doc._rev;

					userlib.insert(doc, doc._id, function(err, body, header) {

						if (err) {
							console.log(err);
							alog.log(owner, "Profile updated.");
							callback(false, "profile_update_failed");
							return;
						} else {
							alog.log(owner, "Profile update failed.");
							callback(true, doc);
						}
					});
				});
			});
		},

		password_reset: function(owner, callback) {

			alog.log(owner, "Attempt to reset password with: " + reset_key);

			userlib.view("users", "owners_by_resetkey", {
				"key": reset_key,
				"include_docs": true
			}, function(err, body) {

				if (err) {
					console.log("Error: " + err.toString());
					req.session.destroy(function(err) {
						if (err) {
							console.log(err);
							res.end(err);
						} else {
							callback(false, "invalid_protocol");
							console.log("Not a valid request.");
						}
					});
					return;
				}

				if (body.rows.length === 0) {
					callback(false, "user_not_found");
					return;
				}

				var user = body.rows[0].doc;

				if (typeof(req.query.reset_key) !== "undefined") {

					var reset_key = req.query.reset_key;
					var user_reset_key = user.reset_key;

					if (typeof(user_reset_key) === "undefined") {
						user_reset_key = null;
					}

					console.log("Attempt to reset password with key: " +
						reset_key);

					if (req.query.reset_key != user_reset_key) {
						console.log("reset_key does not match");
						callback(false, "invalid_reset_key");
						return;
					} else {
						res.redirect('http://rtm.thinx.cloud:80' +
							'/password.html?reset_key=' +
							reset_key +
							'&owner=' + user.owner);
						return;
					}

				} else {

					console.log("Missing reset key.");

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
								". Someone has requested to <a href='http://rtm.thinx.cloud:7442/api/user/password/reset?owner=" +
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
								callback(true, "email_sent");
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

				if (err) {
					console.log("Error: " + err.toString());

					req.session.destroy(function(err) {
						console.log(err);
						callback(false, "user_not_found");
					});

				} else {
					res.redirect('http://rtm.thinx.cloud:80' +
						'/password.html?activation=' +
						ac_key +
						'&owner=' + ac_owner);
					return;
				}
			});
		},

		set_password: function(owner, body, callback) {
			var password1 = req.body.password;
			var password2 = req.body.rpassword;

			var request_owner = null;
			if (typeof(req.body.owner) !== "undefined") {
				request_owner = req.body.owner;
			} else {
				console.log("Request has no owner for fast-search.");
			}

			if (password1 !== password2) {
				callback(false, "password_mismatch");
			} else {
				console.log("Passwords match....");
			}

			if (typeof(req.body.reset_key) !== "undefined") {

				alog.log(request_owner, "Attempt to set password with: " + req.body
					.reset_key);

				console.log("Performing password reset...");

				// Validate password reset_key
				userlib.view("users", "owners_by_resetkey", {
					"key": req.body.reset_key,
					"include_docs": true
				}, function(err, body) {

					if (err) {
						console.log("Error: " + err.toString());
						req.session.destroy(function(err) {
							if (err) {
								console.log(err);
							} else {
								callback(false, "reset");
								console.log("Not a valid request.");
							}
						});
						return;
					} else {

						console.log("resetting user: " + JSON.stringify(body));

						if (body.rows.length === 0) {
							callback(false, "reset_user_not_found");
							return;
						}

						var userdoc = body.rows[0];

						userdoc.doc.password = sha256(password1);
						userdoc.doc.last_reset =
							new Date();
						userdoc.doc.reset_key = null;

						if (err !== null) {
							console.log("Cannot destroy user on password-set");
							callback(false, "user_not_reset");
							return;
						}

						console.log("Creating document...");

						delete userdoc.doc._rev;

						userlib.insert(userdoc.doc, userdoc.owner, function(err) {
							if (err) {
								console.log("Cannot insert user on password-set");
								callback(false, "user_not_saved");
								return;
							} else {
								console.log(
									"Password reset completed saving new user document."
								);
								callback(true, "password_reset_successful");
								return;
							}
						});
					}
				});

			} else if (typeof(req.body.activation) !== "undefined") {

				console.log("Performing new activation...");

				alog.log(request_owner, "Attempt to activate account with: " +
					req.body.activation);

				userlib.view("users", "owners_by_activation", {
					"key": req.body.activation,
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

						console.log("Activating user: " + JSON.stringify(body));

						var userdoc = body.rows[0].doc;

						deploy.initWithOwner(userdoc.owner);

						userdoc.password = sha256(password1);
						userdoc.activation_date = new Date();
						userdoc
							.activation = null;

						console.log("Updating user document: " + JSON.stringify(
							userdoc));

						userlib.destroy(userdoc._id, userdoc._rev, function(err) {

							delete userdoc._rev; // should force new revision...

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
										"Password reset success page, should redirect to login..."
									);
									callback(true, "//rtm.thinx.cloud:80/");
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

			var first_name = req.body.first_name;
			var last_name = req.body.last_name;
			var email = req.body.email;
			var username = req.body.owner;
			// password will be set on successful e-mail activation

			var new_owner_hash = sha256(email);

			userlib.view("users", "owners_by_username", {
				"key": new_owner_hash,
				"include_docs": true // might be useless
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

				var default_repo = {
					"7038e0500 a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f4": {
						alias: "THiNX Vanilla Device Firmware",
						url: "git@github.com:suculent/thinx-firmware-esp8266.git",
						branch: "origin/master",
						devices: [
							"ANY"
						]
					}
				};

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
					repos: [default_repo]
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
							". Please <a href='http://rtm.thinx.cloud:7442/api/user/activate?owner=" +
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
							callback(true, "email_sent");
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
exports.password_reset = Owner.password_reset;
exports.password_reset_init = Owner.password_reset_init;
exports.activate = Owner.activate;
exports.set_password = Owner.set_password;
