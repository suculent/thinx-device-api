/** This THiNX-RTM API module is responsible for managing userlib records. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var mailgun = require('mailgun-js')({apiKey: app_config.mailgun.api_key, domain: app_config.mailgun.domain});
var db = app_config.database_uri;

var userlib = require("nano")(db).use(prefix + "managed_users");
var sha256 = require("sha256");
var fs = require("fs-extra");

var Auth = require('./auth'); var auth = new Auth();
var AuditLog = require("./audit"); var alog = new AuditLog();
var ApiKey = require("./apikey"); var apikey = new ApiKey();
var Deployment = require("./deployment"); var deploy = new Deployment();

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
		"alias": "THiNX Vanilla ESP8266 Lua",
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

var html_mail_header = "<!DOCTYPE html><html><head></head><body>";
var html_mail_footer = "</body></html>";

module.exports = class Owner {

	stringToBoolean(val){
			var a = {
					'true':true,
					'false':false
			};
			return a[val];
	}

	sendResetEmail(user, email, callback) {

		console.log("Resetting password for user: " + user.owner);

		var port = "7443";
		if (app_config.debug.allow_http_login == true) {
			port = "7442";
		}

		var link =
			app_config.public_url + ":"+port+"/api/user/password/reset?owner=" +
			user.owner + "&reset_key=" + user.reset_key;

		var resetEmail = {
			from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
			to: email,
			subject: "Someone has requested password reset",
			text: "Hello " + user.first_name + " " + user.last_name +
				". Someone has requested to reset your THiNX password for username " + user.username + " - " + link +
				"This e-mail was sent automatically. Please do not reply. Sincerely your THiNX",
			html: html_mail_header + "<p>Hello " + user.first_name +
				" " + user.last_name +
				".</p> Someone has requested to <a href='" + link +
				"'>reset</a> your THiNX password for username <b>" + user.username +
				"</b>.<br/><p>" + link +
				"</p><p>This e-mail was sent automatically. Please do not reply.</p>Sincerely your THiNX</p>" + html_mail_footer
		};

		console.log("Sending reset e-mail with key: " + user.reset_key);

		mailgun.messages().send(resetEmail, (error, body) => {
			if (error) {
				console.log(error);
				callback(false, "reset_failed");
			} else {
				console.log("Reset e-mail sent.");
				callback(true, {
					success: true,
					status: "email_sent"
				});
			}
		});
	}

	resetUserWithKey(user, email, callback) {
		console.log("Creating new reset-key...");
		user.reset_key = sha256(email + new Date().toString());

		// TODO: Refactor to update-handler
		userlib.destroy(user._id, user._rev, (err) => {
			if (err) {
				console.log("Owner document reset failed!");
				return;
			}
			delete user._rev;
			userlib.insert(user, user.owner, (err, body, header) => {
				if (err) {
					console.log(err);
					callback(false, "insert_failed");
					return;
				}
				this.sendResetEmail(user, email, callback);
			});
			// Calling page already displays "Relax. You reset link is on its way."
		}); // insert
	}

	sendActivationEmail(object, callback) {

		console.log("Sending activation email...");

		var port = "7443";
		if (app_config.debug.allow_http_login == true) {
			port = "7442";
		}

		var link = app_config.public_url + ":"+port+"/api/user/activate?owner=" + object.new_owner_hash +
			"&activation=" + object.new_activation_token;

		// Creates registration e-mail with activation link
		var activationEmail = {
			from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
			to: object.email,
			subject: "Your new account activation",
			text: "Hello " + object.first_name + " " + object.last_name +". Please >activate your THiNX account" + object.username + " - " + link +
				"This e-mail was sent automatically. Please do not reply. Sincerely your THiNX",
			html: html_mail_header + "<p>Hello " + object.first_name +
				" " +
				object.last_name +
				".</p><p> Please <a href='" + link +
				"'>activate</a> your THiNX account <b>" + object.username + "</b>.</p><p>" + link +
				"</p><p>This e-mail was sent automatically. Please do not reply.</p>Sincerely your THiNX</p>" + html_mail_footer
		};

		console.log("Sending activation e-mail: " + JSON.stringify(
			activationEmail));

		mailgun.messages().send(activationEmail, (error, body) => {
			if (error) {
				console.log(error);
				callback(false, "activation_failed");
			} else {
				console.log("Activation email sent.");
				callback(true, "email_sent");
			}
		});
	}

	// public

	avatar_path(owner) {
		return app_config.data_root + app_config.deploy_root + "/" + owner + "/avatar.json";
	}

	avatar(owner) {
		var afile = this.avatar_path(owner);
		if (fs.existsSync(afile)) {
			return fs.readFileSync(afile).toString();
		} else {
			return "";
		}
	}

	save_avatar(owner, avatar, callback) {
		var afile = this.avatar_path(owner);
		fs.ensureFile(afile, (err1) => {
			if (err1) {
				console.log("error creating avatar file: " + err1);
			} else {
				fs.writeFile(afile, avatar, (err) => {
					if (err) {
						console.log(err);
						callback(false, err);
					} else {
						callback(true, "avatar_saved");
					}
				});
			}
		});
	}

	// Used to fetch API Key [0]... insecure anyway but at least does not fetch all of them
	// Anyway this is feature envy of apikey.list with filtering first result, should move to apikey.
	mqtt_key(owner, callback) {
		apikey.list(owner, (success, api_keys) => {
			if (!success) {
				console.log("mqtt_key owner get success: ", {success}, {api_keys});
				callback(false, api_keys);
			} else {

				if ((typeof(api_keys) !== "undefined") && (api_keys.length > 0)) {
					const key_value = api_keys[0];
					console.log("First Key: ", { key_value });
					console.log("Searching first key in api_keys...");
					for (var index in api_keys) {
						if (api_keys[index].alias.indexOf("Default MQTT API Key") !== -1) {
							console.log("mqtt_key: listing keys from body, returning first from: ", api_keys[index]);
							callback(true, api_keys[index]);
							return;
						}
					}
					const first_key = api_keys[0];
					console.log("Returning first key ", { first_key });
					callback(true, first_key); // edge case should not happen
				} else {
					console.log("api_keys undefined or 0");
					if (owner.indexOf(app_config.mqtt.username) !== -1) {
						callback(true, app_config.mqtt.password);
					} else {
						callback(false, "default_owner_api_key_missing");
					}
				}
			}
		});
	}

	profile(owner, callback) {
		userlib.get(owner, (err, body) => {
			if (err) {
				callback(false, err);
				return;
			}
			var fn = body.first_name;
			var ln = body.last_name;
			if (typeof(body.info) !== "undefined") {
				if (typeof(body.info.first_name) !== "undefined") {
					fn = body.info.first_name;
				}
				if (typeof(body.info.last_name) !== "undefined") {
					ln = body.info.first_name;
				}
			}
			var profile = {
				first_name: fn,
				last_name: ln,
				username: body.username,
				owner: body.owner,
				avatar: this.avatar(body.owner),
				info: body.info,
				admin: body.admin
			};
			callback(true, profile);
		});
	}

	update(owner, body, callback) {

		var update_key = null;
		var update_value = null;

		if (typeof(body.avatar) !== "undefined") {
			update_value = body.avatar;
			this.save_avatar(owner, update_value, (err, response) => {
				callback(err, response);
			});
			return;
		}

		if (typeof(body.info) !== "undefined") {
			update_key = "info";
			update_value = body.info;
		}

		if (typeof(body.gdpr) !== "undefined") {
			update_key = "gdpr_consent";
			update_value = this.stringToBoolean(body.gdpr);
		}

		alog.log(owner, "Attempt to update owner: " + owner +
			" with: " + update_key);

		if ((typeof(update_key) === "undefined") || update_key === null) {
			callback(false, "invalid_protocol_update_key_missing");
			return;
		}

		if (typeof(owner) === "undefined") {
			callback(false, "undefined_owner");
			return;
		}

		var changes = {};
		changes[update_key] = update_value;
		userlib.get(owner, (gerror, body) => {
			if (!gerror) {
				userlib.atomic("users", "edit", owner, changes, (error, body) => {
					if (error) {
						console.log("ERR: " + error + " : " + JSON.stringify(body));
						alog.log(owner, "Profile update failed.", "error");
						callback(false, "profile_update_failed");
						return;
					} else {
						alog.log(owner, "Profile updated successfully.");
						callback(true, update_value);
					}
				});
			} else {
				alog.log(owner, "Profile update error " + gerror, "error");
				callback(false, gerror);
			}
		});
	}

	password_reset(owner, reset_key, callback) {

		if (typeof(reset_key) === "undefined") {
			console.log("Missing reset key.");
			callback(false, "missing_reset_key");
			return;
		}

		alog.log(owner, "Attempt to reset password with: " + reset_key, "warning");

		userlib.view("users", "owners_by_resetkey", {
			"key": reset_key,
			"include_docs": true
		}, (err, body) => {

			if (err) {
				console.log(err);
				callback(false, err);
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
				var port = "443";
				if (typeof(app_config.debug.allow_http_login) !== "undefined" && app_config.debug.allow_http_login === true) {
					port = "80";
				}
				const url = app_config.public_url + ":" + port + "/password.html?reset_key=" + reset_key + "&owner=" + owner;
				callback(true, {
					redirectURL: url
				});
			}
		});
	}

	password_reset_init(email, callback) {

		userlib.view("users", "owners_by_email", {
			"key": email,
			"include_docs": true // might be useless
		}, (err, body) => {

			if (err) {
				console.log("Error: " + err.toString());
				callback(false, "user_not_found");
				return;
			} else {
				console.log("Found " + body.rows.length + " users matching this e-mail.");
				if (body.rows.length == 1) {
					// Passes through only when length is exactly 1:
				} else {
					callback(false, "email_not_found");
					return;
				}
			}

			var user = body.rows[0].doc;
			if (typeof(user) === "undefined" || user === null) {
				user = body.rows[0].value;
				if (typeof(user) === "undefined" || user === null) {
					console.log("User not found.");
					callback(false, "user_not_found");
					return;
				}
			}

			this.resetUserWithKey(user, email, callback);
		}); // view
	}

	activate(ac_owner, ac_key, callback) {
		userlib.view("users", "owners_by_activation", {
			"key": ac_key,
			"include_docs": false
		}, (err, body) => {
			if (err === true) {
				console.log("Error: " + err.toString());
				callback(false, "user_not_found");
			} else {
				var port = "443";
				if (typeof(app_config.debug.allow_http_login) !== "undefined" && app_config.debug.allow_http_login === true) {
					port = "80";
				}
				const url = app_config.public_url + ":" + port + "/password.html?activation=" + ac_key + "&owner=" + ac_owner;
				callback(true, {
					redirectURL: url
				});
			}
		});
	}

	set_password(rbody, callback) {

		var password1 = rbody.password;
		var password2 = rbody.rpassword;
		if (password1 !== password2) {
			callback(false, "password_mismatch");
			return;
		} else {
			console.log("Passwords match....");
		}

		if ((typeof(rbody.reset_key) !== "undefined") && (rbody.reset_key !== null)) {
			console.log("Performing password reset...");
			userlib.view("users", "owners_by_resetkey", {
				"key": rbody.reset_key,
				"include_docs": false
			}, (err, body) => {

				alog.log(body.rows[0].value._id, "Attempt to set password with: " + rbody
				.reset_key, "warning");

				if (err === true) {
					console.log("Error: " + err.toString());
					callback(true, err);
					return;
				} else {

					if (typeof(rbody) === "undefined") {
						console.log("Reset user: " + JSON.stringify(rbody) +
							"failing... no body returned.");
						return;
					}

					if (body.rows.length === 0) {
						callback(false, "reset_user_not_found");
						console.log("User not found.");
						return;
					}

					var userdoc = body.rows[0].value;

					userdoc.password = sha256(prefix + password1);
					userdoc.last_reset = new Date();
					userdoc.reset_key = null;

					console.log("Creating document...");

					userlib.destroy(userdoc._id, userdoc._rev, (err) => {

						if (err !== null) {
							console.log("Cannot destroy user on password-set");
							callback(false, "user_not_reset");
							return;
						}

						delete userdoc._rev;

						userlib.insert(userdoc, userdoc.owner, (err) => {
							if (err) {
								console.log("Cannot insert user on password-set");
								userlib.insert(userdoc, userdoc.owner, (err) => {
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
		}

		if (typeof(rbody.activation) !== "undefined") {
			console.log("Searching " +rbody.activation + "using owners_by_activation...");
			userlib.view("users", "owners_by_activation", {
				"key": rbody.activation,
				"include_docs": false
			}, (err, body) => {

				if (err) {
					console.log("Activation Error: " + err.toString());
					callback(false, "reset_error");
					return;

				} else {

					if (body.rows.length === 0) {
						callback(false, "activated_user_not_found");
						return;
					}

					var userdoc = body.rows[0].value;
					console.log("Activating user: " + userdoc.owner);
					deploy.initWithOwner(userdoc.owner);
					console.log("Updating user document: " + JSON.stringify(
						userdoc));

					userlib.destroy(userdoc._id, userdoc._rev, (err) => {
						delete userdoc._rev;
						userdoc.password = sha256(prefix + password1);
						userdoc.activation_date = new Date();
						userdoc.activation = null;
						userlib.insert(userdoc, userdoc._id, (err) => {
							if (err) {
								console.log(err);
								console.log("Could not re-insert user on new activation.");
								callback(false, "user_not_saved");
								return;
							} else {
								console.log(
									"Password reset success page, should redirect to login using response that tells webpage to go to /..."
								);
								callback(true, {
									success: true,
									status: "password_reset_successful"
								}); // even for activation this is correct now!
								return;
							}
						});

					});
				}
			});
		}
	}

	delete(body, callback) {
		var changes = {
			deleted: true
		};
		userlib.atomic("users", "edit", body.owner, changes, (error, body) => {
			if (error) {
				console.log("ERR: " + error + " : " + JSON.stringify(body));
				alog.log(body.owner, "Profile update failed.", "error");
				callback(false, "delete_failed");
			} else {
				alog.log(body.owner, "Owner state changed to deleted.", "warning");
				callback(true, "deleted");
			}
		});
	}

	create(body, send_activation, callback) {

		// Legacy Create
		var first_name = body.first_name;
		var last_name = body.last_name;
		var email = body.email;
		var username = body.owner;

		// password will be set on successful e-mail activation

		if ((typeof(email) === "undefined") || (email === null)) {
			callback(false, "email_required");
			return;
		}

		var new_owner_hash = sha256(prefix + email.toLowerCase());

		// OAuth Create
		if (typeof(username) === "undefined") {
			username = new_owner_hash;
		}

		userlib.get(new_owner_hash, (err, body) => {

			if (!err) {
				if (username !== "cimrman") { // test user only
					// must return error, as the user should not exist
					callback(false, "email_already_exists");
					console.log("User already exists: " + JSON.stringify(body));
					return;
				}
			}

			// ouath username to search by, otherwise returns everything
			if (username === "" || username === null) {
				username = new_owner_hash;
			}

			// Check for existing username, should return error.
			userlib.view("users", "owners_by_username", {
				"key": username,
				"include_docs": true
			}, (err, body) => {

				if (err) {
					// Should be missing
					if (err.toString().indexOf("Error: missing") !== -1) {
						console.log("Error: " + err.toString());
					}
				} else {
					var user_should_not_exist = body.rows.length;
					if (user_should_not_exist > 0) {
						// https://rollbar.com/thinx-dev/THiNX/items/1041/
						// causes headers to be re-set on login
						callback(false, "username_already_exists");
						console.log("Username already exists: " + username);
						return;
					}
				}

				var new_api_keys = [];
				var new_rsa_keys = {};

				var new_activation_date = new Date().toString();
				var new_activation_token = sha256(new_owner_hash + new_activation_date);

				/*
				var default_transformers = [{
					"ufid": "vt:" + sha256(new_owner_hash + Date().toString()),
					"alias": "Empty",
					"body": "// Copy & Paste Javascript function here...\nvar transformer = (status, device) => {\n  return status\n};"
				}];
				*/

				var default_info = {
					"first_name": first_name,
					"last_name": last_name,
					"mobile_phone": " ",
					"security": {
						"important_notifications": false,
						"unique_api_keys": false,
						"global_push": false
					},
					"goals": [],
					"username": username,
					"owner": new_owner_hash,
					"email": email,
					"transformers": [],
					"gdpr_consent": false
				};

				console.log("Creating Default MQTT API Key...");

				apikey.create(new_owner_hash, "Default MQTT API Key", (success, object) => {

					if (success) {

						console.log("Using .key from ", {object});

						auth.add_mqtt_credentials(new_owner_hash, object.key); // key, not hash!

						console.log("[APIKEY:CREATE:REGISTER] Creating mqtt account...");

						// Find/create ACL file
						const acl_path = app_config.mqtt.acl;
						const user_line = "user " + new_owner_hash;
						const owner_topic = "topic readwrite /" + new_owner_hash + "#";
						const shared_topic = "topic read /thinx/announcements";

						var acl = user_line + "\n" + owner_topic + "\n" + shared_topic + "\n";

						// ensureACLFile(acl_path, acl, new_owner_hash)
						fs.ensureFile(acl_path, (err) => {
							if (err) {
								console.log("Error ensuring MQTT ACL file: " + err);
							}
							fs.appendFile(acl_path, acl, (err) => {
								if (err) {
									console.log("Error appending MQTT ACL file: " + err);
								} else {
									console.log("New MQTT ACL user record created.");
									alog.log(new_owner_hash, "Created MQTT ACL record.");
								}
							});
						});

					} else {

						console.log("SYSTEM ERROR: Default API Key creation failed!");

					}

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

					// OAuth logins without e-mail confirmation
					if (!send_activation) {
						new_user.activation = null;
					}

					userlib.insert(new_user, new_owner_hash, (err, body, header) => {

						if (err) {
							if (err.statusCode == 409) {
								callback(false, "email_already_exists");
							} else {
								console.log(err);
							}
							return;
						}

						if (!send_activation) {
							callback(true, {
								success: true,
								status: "account_created"
							});
							return;
						}
						var object = {
							new_owner_hash: new_owner_hash,
							new_activation_token: new_activation_token,
							email: email,
							first_name: first_name,
							last_name: last_name,
							username: username
						};
						this.sendActivationEmail(object, callback);
					}); // insert owner
				}); // create API key
			}); // view owners
		});
	}

};
