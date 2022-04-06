/** This THiNX Device Management API module is responsible for managing userlib records. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
	username: 'api',
	key: app_config.mailgun.api_key
});

const Database = require("./database.js");
let db_uri = new Database().uri();
var userlib = require("nano")(db_uri).use(prefix + "managed_users");
var sha256 = require("sha256");
var fs = require("fs-extra");

var Auth = require('./auth'); var auth = new Auth();
var AuditLog = require("./audit"); var alog = new AuditLog();
var ApiKey = require("./apikey"); var apikey = new ApiKey();
var Deployment = require("./deployment"); var deploy = new Deployment();
var ACL = require('./acl');

const { v4: uuidV4 } = require('uuid');

var debug_device = app_config.debug.device || false;

var default_repos = {
	"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f3": {
		"alias": "THiNX Vanilla ESP8266 Arduino",
		"url": "https://github.com/suculent/thinx-firmware-esp8266-ino.git",
		"branch": "origin/master",
		"platform": "arduino"
	},
	"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f4": {
		"alias": "THiNX Vanilla ESP8266 Platform.io",
		"url": "https://github.com/suculent/thinx-firmware-esp8266-pio.git",
		"branch": "origin/master",
		"platform": "platformio"
	},
	"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f5": {
		"alias": "THiNX Vanilla ESP8266 Lua",
		"url": "https://github.com/suculent/thinx-firmware-esp8266-lua.git",
		"branch": "origin/master",
		"platform": "nodemcu"
	},
	"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f6": {
		"alias": "THiNX Vanilla ESP8266 Micropython",
		"url": "https://github.com/suculent/thinx-firmware-esp8266-upy.git",
		"branch": "origin/master",
		"platform": "micropython"
	},
	"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f7": {
		"alias": "THiNX Vanilla ESP8266 MongooseOS",
		"url": "https://github.com/suculent/thinx-firmware-esp8266-mos.git",
		"branch": "origin/master",
		"platform": "mongoose"
	}
};

var html_mail_header = "<!DOCTYPE html><html><head></head><body>";
var html_mail_footer = "</body></html>";

module.exports = class Owner {

	constructor() {

	}

	// private function of update(...)
	stringToBoolean(val) {
		var a = {
			'true': true,
			'false': false
		};
		return a[(val.toLowerCase())];
	}

	sendMail(contents, type, callback) {
		mg.messages.create(app_config.mailgun.domain, contents)
			.then((/* msg */) => {
				callback(true, {
					success: true,
					status: type + "_sent"
				});
			}) // logs response data
			.catch(err => {
				console.log(`☣️ [error] mailgun 24 err ${err}`);
				callback(false, type + "_failed");
			}); // logs any error
	}

	sendGDPRExpirationEmail24(user, email, callback) {

		console.log("ℹ️ [info] Day before GDPR delete warning: " + user.owner);

		var deleteIn24Email = {
			from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
			to: email,
			subject: "Your data will be deleted",
			text: "Hello " + user.first_name + " " + user.last_name +
				". This is a notification warning, that your data will be deleted in 24 hours due to GDPR regulations. In case you want to prevent data loss, log into your THiNX account.",
			html: html_mail_header + "<p>Hello " + user.first_name +
				" " + user.last_name +
				".</p><p>This is a notification warning, that your data will be deleted in 24 hours due to GDPR regulations. In case you want to prevent data loss, log into your THiNX account.</p><p>" +
				"</p><p>This e-mail was sent automatically. Please do not reply.</p>Sincerely your THiNX</p>" + html_mail_footer
		};

		this.sendMail(deleteIn24Email, "mail_24", callback);
	}

	sendGDPRExpirationEmail168(user, email, callback) {

		console.log("ℹ️ [info] Week before GDPR delete warning: " + user.owner);

		var deleteIn168Email = {
			from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
			to: email,
			subject: "Your data will be deleted",
			text: "Hello " + user.first_name + " " + user.last_name +
				". This is a notification warning, that your data will be deleted in one week due to GDPR regulations. In case you want to prevent data loss, log into your THiNX account.",
			html: html_mail_header + "<p>Hello " + user.first_name +
				" " + user.last_name +
				".</p><p>This is a notification warning, that your data will be deleted in one week due to GDPR regulations. In case you want to prevent data loss, log into your THiNX account.</p><p>" +
				"</p><p>This e-mail was sent automatically. Please do not reply.</p>Sincerely your THiNX</p>" + html_mail_footer
		};

		this.sendMail(deleteIn168Email, "mail_168", callback);
	}

	sendResetEmail(user, email, callback) {

		var port = "";
		if (app_config.debug.allow_http_login === true) {
			port = ":" + app_config.port;
		}

		var link =
			app_config.api_url + port + "/api/user/password/reset?owner=" +
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

		// Skip in test
		if (process.env.ENVIRONMENT === "test") {
			callback(true, {
				success: true,
				status: user.reset_key,
				note: "reset_key"
			});
			return;
		}

		this.sendMail(resetEmail, "reset", callback);
	}

	/**
	 * Generates new reset key and e-mail
	 * @param {Document} user User document
	 * @param {string} email User email
	 * @param {function} callback responder
	 */
	resetUserWithKey(user, email, callback) {
		user.reset_key = sha256(email + new Date().toString());
		this.update(user.owner, { reset_key: user.reset_key }, (success, message) => {
			if (!success) {
				console.log("☣️ [error] resetUserWithKey update failed", message);
				callback(false, message);
			} else {
				this.sendResetEmail(user, email, callback);
			}
		});
	}

	sendActivationEmail(object, callback) {

		let base_url = app_config.api_url;

		var port = "";
		if (app_config.debug.allow_http_login === true) {
			port = ":" + app_config.port;
		}

		var link = base_url + port + "/api/user/activate?owner=" + object.new_owner_hash +
			"&activation=" + object.new_activation_token;

		// Creates registration e-mail with activation link
		var activationEmail = {
			from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
			to: object.email,
			subject: "Your new account activation",
			text: "Hello " + object.first_name + " " + object.last_name + ". Please >activate your THiNX account" + object.username + " - " + link +
				"This e-mail was sent automatically. Please do not reply. Sincerely your THiNX",
			html: html_mail_header + "<p>Hello " + object.first_name +
				" " +
				object.last_name +
				".</p><p> Please <a href='" + link +
				"'>activate</a> your THiNX account <b>" + object.username + "</b>.</p><p>" + link +
				"</p><p>This e-mail was sent automatically. Please do not reply.</p>Sincerely your THiNX</p>" + html_mail_footer
		};



		// In case of localhost installs, admin has to activate using this logline:
		if (app_config.public_url.indexOf("localhost") !== -1) {
			console.log("🚨");
			console.log("🚨 NOT sending activation e-mail on localhost! You need to open following URL in your browser:" + link);
			console.log("🚨");
			callback(true, link);
			return;
		}

		// Normal user flows
		console.log(`ℹ️ [info] Sending activation e-mail to ${activationEmail.to} with token ${object.new_activation_token}`);

		// Skip in test
		if (process.env.ENVIRONMENT === "test") {
			callback(true, {
				success: true,
				status: object.new_activation_token,
				note: "activation_token"
			});
			return;
		}

		this.sendMail(activationEmail, "activation", callback);
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

	saveAvatar(owner, avatar, callback) {
		var afile = this.avatar_path(owner);
		fs.ensureFile(afile, (err1) => {
			if (err1) {
				console.log(`☣️ [error] error creating avatar file: ${err1}`);
				return;
			}
			fs.writeFile(afile, avatar, (err2) => {
				if (err2) {
					console.log(`☣️ [error] error saving avatar file: ${err2}`);
					callback(false, "error_saving_avatar");
					return;
				}
				callback(true, "avatar_saved");
			});
		});
	}

	// Returns Default MQTT API Key or creates one
	mqtt_key(owner_id, callback) {

		// Anyway this is feature envy of apikey.list with filtering first result, should move to apikey.
		apikey.list(owner_id, (api_keys) => {

			if (api_keys.length == 0) {
				// If no key is found, will be created and this will call back with the key
				this.create_default_mqtt_apikey(owner_id, (zuccess, key) => {
					console.log("⚠️ [warning] 'Default MQTT API Key' not found, creating new one...");
					if (zuccess) {
						callback(true, key);
					} else {
						console.log("☣️ [error] first API Key not found nor created!");
						callback(false, "default_owner_api_key_missing");
					}
				});
				return;
			}

			// In case there a key found, this will call back
			if ((typeof (api_keys) !== "undefined") && (api_keys.length > 0)) {
				for (var index in api_keys) {
					if (api_keys[index].alias.indexOf("Default MQTT API Key") !== -1) {
						callback(true, api_keys[index]);
						return;
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

			if (typeof (body.info) !== "undefined") {
				fn = body.info.first_name;
			}

			if (typeof (body.info.last_name) !== "undefined") {
				ln = body.info.last_name;
			}

			callback(true, {
				first_name: fn,
				last_name: ln,
				username: body.username,
				owner: body.owner,
				avatar: this.avatar(body.owner),
				info: body.info,
				admin: body.admin
			});
		});
	}

	update(owner, body, callback) {

		var update_key = null;
		var update_value = null;

		/** 
		 * This is a coded white-list of supported values, that can be changed by calling POST /api/user/profile.
		 * Changes can:
		 * 1. call specific methods that must call the API response callback
		 * 2. or us the update_key and update_value to write single specific value in a call.
		 */

		// User Image
		if (typeof (body.avatar) !== "undefined") {
			update_value = body.avatar;
			this.saveAvatar(owner, update_value, (err, response) => {
				callback(err, response);
			});
			return;
		}

		// Personal Details
		if (typeof (body.info) !== "undefined") {
			update_key = "info";
			update_value = body.info;
		}

		// User's GDPR preference
		if (typeof (body.gdpr) !== "undefined") {
			update_key = "gdpr_consent";
			update_value = this.stringToBoolean(body.gdpr);
		}

		// Allows changing transmit_key for device's cssid and cpass using external API (instead of global value set by conf/config.json).
		if (typeof (body.transmit_key) !== "undefined") {
			update_key = "transmit_key";
			update_value = body.transmit_key;
		}

		// Allows changing transmit_key for device's cssid and cpass using external API (instead of global value set by conf/config.json).
		if (typeof (body.reset_key) !== "undefined") {
			update_key = "reset_key";
			update_value = body.reset_key;
		}

		if (typeof (owner) === "undefined") {
			callback(false, "undefined_owner");
			return;
		}

		alog.log(owner, "Attempt to update owner: " + owner + " with: " + update_key);

		if ((typeof (update_key) === "undefined") || update_key === null) {
			callback(false, "invalid_protocol_update_key_missing");
			return;
		}

		var changes = {};
		changes[update_key] = update_value;
		userlib.get(owner, (error/* , user_body */) => {
			if (error) {
				alog.log(owner, "Profile update error " + error, "error");
				callback(false, error);
				return;
			}
			userlib.atomic("users", "edit", owner, changes, (uerror, abody) => {
				if (error) {
					console.log("☣️ [error] " + uerror + " in changes : " + JSON.stringify(changes));
					alog.log(owner, "Profile update failed.", "error");
					callback(false, "profile_update_failed");
					return;
				}
				alog.log(owner, "Profile updated successfully.", abody);
				callback(true, update_value);
			});
		});
	}

	validate(username, callback) {

		if ((typeof (callback) === "undefined") || (callback === null)) {
			console.log("🚫  [critical] Developer error: validation callback is missing!");
			throw new Error("validation callback is missing");
		}

		// Search the user in DB
		userlib.view("users", "owners_by_username", {
			"key": username,
			"include_docs": false
		}, (xerr, db_body) => {
			if (typeof (db_body) === "undefined") {
				console.log("☣️ [error] [validate] owner body undefined", xerr);
			} else if ((typeof (db_body.rows) === "undefined") || (db_body.rows.count > 1)) {
				xerr = new Error("Too many users found.");
			}
			if (xerr !== null) {
				console.log("☣️ [error] [validate] owner error: ", xerr);
				if ((typeof (callback) !== "undefined") && (callback !== null)) { // will deprecate
					callback(false);
				} else {
					console.log("🚫  [critical] Developer error: validation callback (1) missing!"); // will deprecate
				}
			} else {
				if ((typeof (callback) !== "undefined") && (callback !== null)) { // will deprecate
					callback(db_body);
				} else {
					console.log("🚫  [critical] Developer error: validation callback (2) missing!"); // will deprecate
				}
			}
		});
	}

	password_reset(owner, reset_key, callback) {

		if (typeof (reset_key) === "undefined") {
			console.log("☣️ [error] Missing reset key.");
			callback(false, "missing_reset_key");
			return;
		}

		alog.log(owner, "Attempt to reset password with: " + reset_key, "warning");

		userlib.view("users", "owners_by_resetkey", {
			"key": reset_key,
			"include_docs": true
		}, (err, body) => {

			if (err) {
				console.log("☣️ [error] owners_by_resetkey", err);
				callback(false, err);
			}

			if (body.rows.length === 0) {
				callback(false, "user_not_found");
				return;
			}

			var user = body.rows[0].doc;
			var user_reset_key = user.reset_key;

			if (typeof (user_reset_key) === "undefined") {
				user_reset_key = null;
			}

			console.log(`ℹ️ [info] Attempting to reset password with key ${reset_key}`);

			if (reset_key != user_reset_key) {
				console.log("☣️ [error] reset_key does not match");
				callback(false, "invalid_reset_key");
			} else {
				const url = app_config.public_url + "/password.html?reset_key=" + reset_key + "&owner=" + owner;
				callback(true, { redirectURL: url });
			}
		});
	}

	password_reset_init(email, callback) {

		userlib.view("users", "owners_by_email", {
			"key": email,
			"include_docs": true // might be useless
		}, (err, body) => {

			if (err) {
				callback(false, "user_not_found");
				console.log("☣️ [error] [password_reset_init]", err.toString(), "Found " + body.rows.length + " users matching this e-mail.");
				return;
			}

			if (body.rows.length != 1) {
				callback(false, "email_not_found");
				return;
			}

			var user = null;
			try {
				user = body.rows[0].doc;
			} catch (e) {
				console.log("☣️ [error] Invalid user doc fetched in password reset", body);
			}

			if (typeof (user) === "undefined" || user === null) {
				console.log("🔨 [debug] getting value instead of doc from", body.rows[0]);
				user = body.rows[0].value;
				if (typeof (user) === "undefined" || user === null) {
					console.log("☣️ [error] User not found in password reset.");
					callback(false, "user_not_found");
					return;
				}
			}
			this.resetUserWithKey(user, email, callback);
		});
	}

	activate(ac_owner, ac_key, callback) {

		if (typeof (ac_key) === "undefined") {
			callback(false, "activation_key_missing");
			return;
		}

		console.log("ℹ️ [info] [activation] Activation with owner", ac_owner, "and key", ac_key);

		userlib.view("users", "owners_by_activation", {
			"key": ac_key,
			"include_docs": false
		}).then((/* body */) => {
			const url = app_config.public_url + "/password.html?activation=" + ac_key + "&owner=" + ac_owner;
			callback(true, {
				redirectURL: url
			});
		}).catch((err) => {
			console.log("☣️ [error] [activation]" + err.toString());
			callback(false, "user_not_found");
		});
	}

	set_password_reset(rbody, callback) {
		userlib.view("users", "owners_by_resetkey", {
			"key": rbody.reset_key.status,
			"include_docs": false
		}, (err, body) => {

			alog.log(body.rows[0].value._id, "Attempt to set password with: " + rbody
				.reset_key, "warning");

			if (err === true) {
				console.log("☣️ [error] " + err.toString());
				callback(true, err);
				return;

			}

			if (typeof (body) === "undefined") {
				console.log("☣️ [error] Reset user failing... no body returned.");
				return;
			}

			if (body.rows.length === 0) {
				callback(false, "reset_user_not_found");
				console.log("☣️ [error] User not found.");
				return;
			}

			var userdoc = body.rows[0].value;

			userdoc.password = sha256(prefix + rbody.password);
			userdoc.last_reset = new Date();
			userdoc.reset_key = null;

			delete userdoc._rev;

			userlib.atomic("users", "edit", userdoc._id, userdoc, (_in_err) => {
				if (_in_err) {
					console.log("Cannot insert user on password-set", {_in_err});
					callback(false, "password_reset_failed");
					return;
				}
				console.log(`ℹ️ [info] Password reset successful for ${userdoc._id}`);
				callback(true, {
					success: true,
					status: "password_reset_successful"
				});
			});
		});
	}

	set_password_activation(rbody, callback) {
		userlib.view("users", "owners_by_activation", {
			"key": rbody.activation,
			"include_docs": false
		}, (err, body) => {

			if (err) {
				console.log("☣️ [error] Activation Error: " + err.toString());
				callback(false, "reset_error");
				return;
			}

			if (body.rows.length === 0) {
				callback(false, "activated_user_not_found");
				return;
			}

			var userdoc = body.rows[0].value;
			console.log("ℹ️ [info] Activating user: " + userdoc.owner);
			deploy.initWithOwner(userdoc.owner);
			userlib.destroy(userdoc._id, userdoc._rev, () => {
				delete userdoc._rev;
				userdoc.password = sha256(prefix + rbody.password);
				userdoc.activation_date = new Date();
				userdoc.activation = null;
				userlib.insert(userdoc, userdoc._id, (ins_err) => {
					if (ins_err) {
						console.log("☣️ [error] [activation] insert err", ins_err);
						callback(false, "user_not_saved");
						return;
					}
					callback(true, {
						success: true,
						status: "password_reset_successful"
					});
				});

			});
		});
	}

	set_password(rbody, callback) {

		// Password Reset
		if ((typeof (rbody.reset_key) !== "undefined") && (rbody.reset_key !== null)) {
			this.set_password_reset(rbody, callback);
		}

		// User Activation
		if (typeof (rbody.activation) !== "undefined") {
			console.log("ℹ️ [info] Searching " + rbody.activation + "using owners_by_activation...");
			this.set_password_activation(rbody, callback);
		}

		if ((typeof (rbody.password) == "undefined") || (rbody.password === null) ||
			(typeof (rbody.rpassword) == "undefined") || (rbody.rpassword === null) ||
			(rbody.password !== rbody.rpassword)
		) {
			callback(false, "password_mismatch");
		}
	}

	delete(owner, callback, res) {
		var changes = {
			deleted: true
		};
		userlib.atomic("users", "edit", owner, changes, (a_error) => {
			if (a_error) {
				console.log("☣️ [error] " + a_error + "  deleting : " + owner);
				alog.log(owner, "Profile update failed.", "error");
				callback(false, "delete_failed");
				return;
			}
			alog.log(owner, "Owner state changed to deleted.", "warning");
			callback(res, true, "deleted");
		});
	}

	create_default_acl(owner_id, callback) {

		console.log("ℹ️ [info] Creating default ACLs for owner", owner_id);
		// Load/create ACL file
		let acl = new ACL(owner_id);
		acl.load(() => {
			const owner_topic = "/" + owner_id;
			const owner_subtopics = "/" + owner_id + "/#";
			const shared_topic = "/" + owner_id + "/shared/#";

			acl.addTopic(owner_id, "readwrite", owner_topic);
			acl.addTopic(owner_id, "readwrite", owner_subtopics);
			acl.addTopic(owner_id, "readwrite", shared_topic);

			// Owner can see meshes automatically bsaed on owner_subtopics ACL permission
			acl.commit(() => {
				if (typeof (callback) !== "undefined") callback(true);
			});
		});
	}

	create_default_mqtt_apikey(owner_id, callback) {

		if ((typeof (owner_id) === "undefined") || (owner_id === "") || (owner_id === null)) {
			console.log("☣️ [error] Cannot create MQTT apikey with invalid owner_id.");
			callback(false);
		}

		apikey.create(owner_id, "Default MQTT API Key", (success, object) => {
			if (success) {
				console.log(`ℹ️ [info] Adding MQTT credential ${object[0].key}`);
				auth.add_mqtt_credentials(owner_id, object[0].key /* key, not hash! */, () => {
					this.create_default_acl(owner_id, () => {
						callback(true, object[0]);
					});
				});
			} else {
				console.log("🚫  [critical] Default API Key creation failed!");
				callback(false);
			}
		});
	}

	create(body, send_activation, res, callback) {

		// Legacy Create
		const first_name = body.first_name;
		const last_name = body.last_name;
		const email = body.email;

		let username = body.username;

		// password will be set on successful e-mail activation

		if ((typeof (email) === "undefined") || (email === null)) {
			callback(res, false, "email_required");
			return;
		}

		var new_owner_hash = sha256(prefix + email.toLowerCase());

		// OAuth Create
		if (typeof (username) === "undefined") {
			username = new_owner_hash;
		}

		userlib.get(new_owner_hash, (user_get_error/* , user_get_body */) => {

			// test username, must mirror ../../spec/_envi.json:test_info.username; should not exist in production
			if (process.env.ENVIRONMENT === "test") {
				if (!user_get_error && (username !== "cimrman")) {
					console.log("⚠️ [warning] User already exists", username, new_owner_hash);
					if (typeof (callback) === "undefined") {
						throw new Error("DEVELOPER ERROR: create callback missing in test, e-mail already exists");
					} else {
						callback(res, false, "email_already_exists");
					}
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
			}, (err, user_view_body) => {

				if (err) {
					// Should be missing
					if (err.toString().indexOf("Error: missing") === -1) {
						console.log("☣️ [error] Is the DB created? New user should not cause: " + err.toString());
					}
				} else {
					var user_should_not_exist = user_view_body.rows.length;
					if (user_should_not_exist > 0) {
						// https://rollbar.com/thinx-dev/THiNX/items/1041/
						// causes headers to be re-set on login
						callback(res, false, "username_already_exists");
						console.log("☣️ [error] Username already exists: " + username);
						return;
					}
				}

				var new_activation_date = new Date().toString();
				var new_activation_token = sha256(new_owner_hash + new_activation_date);

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

				this.create_default_mqtt_apikey(new_owner_hash, (success) => {

					if (!success) {
						console.log(`☣️ [error] Creating Default MQTT API Key Failed for ${new_owner_hash}`);
						callback(res, false, "creating_mqtt_api_key_failed");
						return;
					}

					let activation_email_descriptor = {
						new_owner_hash: new_owner_hash,
						new_activation_token: new_activation_token,
						email: email,
						first_name: first_name,
						last_name: last_name,
						username: username
					};

					if (debug_device) console.log(`🔨 [debug] Created Default MQTT API Key for new_owner_hash ${new_owner_hash}`);

					// if this fails, should not insert the user (but may be optional in tests or local!).
					this.sendActivationEmail(activation_email_descriptor, (send_success, result) => {

						// This can fail in test but user will not be activated
						if (process.env.ENVIRONMENT !== "test") {
							if (!send_success) {
								if (send_activation) {
									callback(res, false, result);
									console.log("[user create] Exiting...");
									return;
								}
							}
						}

						// Create user document
						let new_user = {
							owner: new_owner_hash,
							username: username,
							email: email,
							api_keys: [],
							rsa_keys: {},
							first_name: first_name,
							last_name: last_name,
							activation: (send_activation) ? new_activation_token : false, // OAuth logins without e-mail confirmation
							activation_date: new_activation_date,
							repos: default_repos,
							info: default_info
						};

						var error_correlation_id = uuidV4();

						if (process.env.ENVIRONMENT !== "test") {
							console.log("🔨 [debug] [warning] Setting user doc _id (check if it causes change collision!)", { error_correlation_id });
							new_user._id = new_owner_hash;
						}

						userlib.insert(new_user, new_owner_hash, (err_u) => {
							if (err_u) {
								console.log({ error_correlation_id }, { err_u });
								if (err_u.statusCode == 409) {
									if (typeof (callback) === "undefined") {
										throw new Error("DEVELOPER ERROR: create callback missing, e-mail already exists");
									} else {
										callback(res, false, "email_already_exists");
									}
								}
							} else {
								// Skip in test
								if (process.env.ENVIRONMENT === "test") {
									callback(res, true, new_activation_token);
									return;
								}

								if (!send_activation) {
									callback(res, true, "account_created");
								} else {
									callback(res, true, "email_sent");
								}
							}
						}); // insert owner
					});
				}); // create API key
			}); // view owners
		});
	}

	//
	// Mesh Support
	//

	createMesh(owner, mesh_id, mesh_alias, callback) {

		userlib.get(owner, (err, body) => {

			// Guards
			if (err) {
				callback(false, err);
				return;
			}

			// Make required changes
			const newMesh = {
				mesh_id: mesh_id,
				alias: mesh_alias
			};

			// Get current user's meshes or create empty array
			let meshes = [];
			if (typeof (body.mesh_ids) !== "undefined" && body.mesh_ids !== null) {
				meshes = Array.from(body.mesh_ids);
			}

			// Update if exists
			let found = false;
			for (let mindex in meshes) {
				let mesh = meshes[mindex];
				if (mesh === null) continue;
				// Update only aliases on same mesh id
				if (mesh.mesh_id == newMesh.mesh_id) {
					meshes[mindex].alias = newMesh.alias;
					found = true;
				}
			}

			// Add only if not found/updated
			if (!found) {
				meshes.push(newMesh);
			}

			// Atomically update
			userlib.atomic("users", "edit", owner, { mesh_ids: meshes }, (a_error) => {
				if (a_error) {
					console.log("ERR: " + a_error + "  creating mesh in : " + JSON.stringify(body));
					alog.log(body.owner, "Mesh creation failed.", "error");
					callback(false, "create_mesh_failed");
					return;
				}
				alog.log(body.owner, "Owner Mesh Created.", "info");
				callback(true, newMesh);
			});
		});
	}

	deleteMeshes(owner, mesh_ids, callback) {

		userlib.get(owner, (err, body) => {

			// Guards
			if (err) {
				callback(false, err);
				return;
			}

			let meshes = []; // current user meshes or empty array
			if (typeof (body.mesh_ids) !== "undefined") {
				meshes = body.mesh_ids;
			}

			let meshes_out = [];

			let acl = new ACL(owner);

			acl.load(() => {

				let deleted = false;
				let deleted_ids = [];

				// Parse all user meshes
				for (var index in meshes) {
					let mesh_deleted;
					let mesh_id = meshes[index].mesh_id;
					// Check all ids requested to be deleted
					for (let delete_index in mesh_ids) {
						let delete_id = mesh_ids[delete_index];
						if (mesh_id.indexOf(delete_id) === 0) {
							deleted_ids.push(delete_id);
							mesh_deleted = true;
						}
					}
					if (!mesh_deleted) {
						meshes_out.push(meshes[index]);
					} else {
						deleted = true;
						acl.prune(mesh_id);
					}
				}

				let mout = Array.from(meshes_out);

				// Atomically update
				userlib.atomic("users", "edit", owner, { mesh_ids: mout }, (a_error) => {
					if (a_error) {
						console.log("ERR: " + a_error + "  deleting mesh in : " + JSON.stringify(body));
						alog.log(body.owner, "Mesh deletion failed.", "error");
						callback(false, "delete_mesh_failed");
						return;
					}
					if (deleted) {
						alog.log(body.owner, "Owner Mesh(es) deleted.", "info");
					} else {
						alog.log(body.owner, "Owner Mesh(es) delete not successful.", "warning");
					}
					callback(deleted, deleted_ids);
				});

			});
		});
	}

	/* Returns all mesh_ids with respective aliases per owner */
	listMeshes(owner, callback) {
		userlib.get(owner, (err, body) => {
			if (err) {
				callback(false, err);
				return;
			}
			if (typeof (body.mesh_ids) === "undefined") {
				callback(true, []);
				return;
			}
			// Strip null objects
			let meshes = [];
			for (let index in body.mesh_ids) {
				let mesh = body.mesh_ids[index];
				if (mesh !== null) {
					meshes.push(mesh);
				}
			}
			callback(true, meshes);
		});
	}

};
