/** This THiNX Device Management API module is responsible for managing userlib records. */

let Globals = require("./globals.js");
let app_config = Globals.app_config();
let prefix = Globals.prefix();

const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

const mg = mailgun.client({
	username: 'api',
	key: process.env.MAILGUN_API_KEY
});

const Database = require("./database.js");

const sha256 = require("sha256");
const fs = require("fs-extra");

const Auth = require('./auth'); 
const AuditLog = require("./audit"); let alog = new AuditLog();
const ApiKey = require("./apikey");
const Deployment = require("./deployment"); let deploy = new Deployment();
const ACL = require('./acl');
const Util = require("./util.js");

const default_repos = {
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

const html_mail_header = "<!DOCTYPE html><html><head></head><body>";
const html_mail_footer = "</body></html>";

const DEFAULT_APIKEY_NAME = "Default MQTT API Key";

module.exports = class Owner {

	constructor(redis) {		
		if (typeof(redis) === "undefined") throw new Error("Owner/User requires connected Redis client or Auth.");
		this.db = new Database();
		let db_uri = this.db.uri();
		this.userlib = require("nano")(db_uri).use(prefix + "managed_users");
		this.auth = new Auth(redis);
		this.redis = redis;
		this.apikey = new ApiKey(redis);
	}

	// private function of update(...)
	stringToBoolean(val) {
		if (typeof (val) !== "string") return val;
		let a = {
			'true': true,
			'false': false
		};
		return a[(val.toLowerCase())];
	}

	sendMail(contents, type, callback) {
		mg.messages.create(app_config.mailgun.domain, contents)
			.then((msg) => {
				console.log("[debug] mg.messages.create", msg);
				callback(true, type + "_sent");
			}) // logs response data
			.catch(err => {
				console.log(`☣️ [error] mailgun 24 err ${err}`); // receives instance of accesstoken(!?)
				callback(false, type + "_failed");
			}); // logs any error
	}

	sendGDPRExpirationEmail24(user, email, callback) {

		console.log("ℹ️ [info] Day before GDPR delete warning: " + user.owner);

		let deleteIn24Email = {
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

		let deleteIn168Email = {
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

		let port = "";
		if (app_config.debug.allow_http_login === true) {
			port = ":" + app_config.port;
		}

		let link =
			app_config.api_url + port + "/api/user/password/reset?owner=" +
			user.owner + "&reset_key=" + user.reset_key;

		let resetEmail = {
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
		if ((process.env.ENVIRONMENT === "test") || (process.env.ENVIRONMENT === "development")) {
			console.log("[test] sending reset key directly", user.reset_key);
			return callback(true, user.reset_key);
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
				console.log("[info] will send reset e-mail with key", user.reset_key);
				this.sendResetEmail(user, email, callback);
			}
		});
	}

	sendActivationEmail(object, callback) {

		let base_url = app_config.api_url;

		let port = "";
		if (app_config.debug.allow_http_login === true) {
			port = ":" + app_config.port;
		}

		let link = base_url + port + "/api/user/activate?owner=" + object.new_owner_hash +
			"&activation=" + object.new_activation_token;

		// Creates registration e-mail with activation link
		let activationEmail = {
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
			console.log("🚨 NOT sending activation e-mail on localhost! You need to open following URL in your browser:\n" + link);
			return callback(true, link);
		}

		// Normal user flows
		console.log(`ℹ️ [info] Sending activation e-mail to ${activationEmail.to} with token ${object.new_activation_token}`);

		// Skip in test
		if ((process.env.ENVIRONMENT === "test") || (process.env.ENVIRONMENT === "development")) {
			return callback(true, {
				success: true,
				response: object.new_activation_token,
				note: "activation_token"
			});
		}

		this.sendMail(activationEmail, "activation", callback);
	}

	// public

	// FIXME: does not get overridden in development mode (does not matter in test)
	avatar_path(owner) {
		return app_config.data_root + app_config.deploy_root + "/" + owner + "/avatar.json";
	}

	avatar(owner) {
		let afile = this.avatar_path(owner);
		if (fs.existsSync(afile)) {
			return fs.readFileSync(afile).toString();
		} else {
			return "";
		}
	}

	saveAvatar(owner, avatar, callback) {
		const afile = this.avatar_path(owner);
		fs.ensureFileSync(afile);
		fs.writeFileSync(afile, avatar);
		callback(true, "avatar_saved");
	}

	// Returns Default MQTT API Key or creates one
	mqtt_key(owner_id, callback) {

		// Anyway this is feature envy of apikey.list with filtering first result, should move to apikey.
		this.apikey.list(owner_id, (api_keys) => {

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
				for (let index in api_keys) {
					if (api_keys[index].alias.indexOf("Default MQTT API Key") !== -1) {
						return callback(true, api_keys[index]);
					}
				}
			}
		});
	}

	profile(owner, callback) {
		this.userlib.get(owner, (err, body) => {
			if (err) {
				return callback(false, err);
			}
			let fn = body.first_name;
			let ln = body.last_name;

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
				admin: (typeof(body.admin) === "undefined") ? false : body.admin
			});
		});
	}

	// Internal Update ETL
	process_update(body, callback) {

		let update_key = null;
		let update_value = null;

		/** 
		 * This is a coded white-list of supported values, that can be changed by calling POST /api/user/profile.
		 * Changes can:
		 * 1. call specific methods that must call the API response callback
		 * 2. or us the update_key and update_value to write single specific value in a call.
		 */

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

		if (typeof (body.transformers) !== "undefined") {
			update_key = "transformers";
			update_value = body.transformers;
		}

		if (typeof (body.repos) !== "undefined") {
			update_key = "repos";
			update_value = body.repos;
		}

		// Allows changing transmit_key for device's cssid and cpass using external API (instead of global value set by conf/config.json).
		if (typeof (body.reset_key) !== "undefined") {
			update_key = "reset_key";
			update_value = body.reset_key;
		}

		callback(update_key, update_value);
	}

	// Internal Update Writer
	apply_update(owner, update_key, update_value, callback) {
		let changes = {};
		changes[update_key] = update_value;
		this.userlib.get(owner, (error/* , user_body */) => {
			if (error) {
				alog.log(owner, "Profile update error " + error, "error");
				return callback(false, error);
			}
			this.userlib.atomic("users", "edit", owner, changes, (uerror, abody) => {
				if (error) {
					console.log("☣️ [error] " + uerror + " in changes : " + JSON.stringify(changes));
					alog.log(owner, "Profile update failed.", "error");
					return callback(false, "profile_update_failed");
				}
				alog.log(owner, "Profile updated successfully.", abody);
				callback(true, update_value);
			});
		});
	}

	update(owner, body, callback) {

		if ((typeof (owner) === "undefined") || (owner === null)) {
			return callback(false, "undefined_owner");
		}

		// User Image
		if (typeof (body.avatar) !== "undefined") {
			this.saveAvatar(owner, body.avatar, (success, err) => {
				callback(success, err);
			});
			return;
		}

		this.process_update(body, (update_key, update_value) => {
			alog.log(owner, "Attempt to update owner: " + owner + " with: " + update_key);
			if ((typeof (update_key) === "undefined") || (update_key === null)) {
				console.log("🔨 [debug] invalid_protocol_update_key_missing in", body);
				return callback(false, "invalid_protocol_update_key_missing");
			}
			this.apply_update(owner, update_key, update_value, callback);
		});
	}

	/**
	 * Check existence of a username
	 * @param {*} username - username to be checked
	 * @param {*} callback - callback to be called with result
	 * @return {any} false if not found, otherwise returns user record
	 */
	validate(username, callback) {
		// Search the user in DB
		this.userlib.view("users", "owners_by_username", {
			"key": username,
			"include_docs": false
		}, (xerr, db_body) => {
			if (xerr || (typeof (db_body) === "undefined")) {
				// do not parse rows in this case
			} else if ((typeof (db_body.rows) === "undefined") || (db_body.rows.count > 1)) {
				xerr = new Error("Too many users found.");
			}
			if (xerr !== null) {
				callback(false);
			} else {
				callback(db_body);
			}
		});
	}

	password_reset(owner, reset_key, callback) {

		if (typeof (reset_key) === "undefined") {
			console.log("☣️ [error] Missing reset key.");
			return callback(false, "missing_reset_key");
		}

		alog.log(owner, "Attempt to reset password with: " + reset_key, "warning");

		this.userlib.view("users", "owners_by_resetkey", {
			"key": reset_key,
			"include_docs": true
		}, (err, body) => {

			if (err) {
				console.log("☣️ [error] owners_by_resetkey", err);
				return callback(false, err);
			}

			if (body.rows.length === 0) {
				return callback(false, "user_not_found");
			}

			let user = body.rows[0].doc;
			let user_reset_key = user.reset_key;

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

		this.userlib.view("users", "owners_by_email", {
			"key": email,
			"include_docs": true // might be useless
		}, (err, body) => {

			if (err !== null) {
				console.log("☣️ [error] [password_reset_init]", err, "Found " + body.rows.length + " users matching this e-mail.");
				return callback(false, "user_not_found");
			}

			if (body.rows.length != 1) {
				console.log("☣️ [error] [password_reset_init] email "+email+" not found in", {body});
				return callback(false, "email_not_found");
			}

			let user = null;
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
					return callback(false, "user_not_found");
				}
			}
			this.resetUserWithKey(user, email, callback);
		});
	}

	activate(ac_owner, ac_key, callback) {

		if (typeof (ac_key) === "undefined") {
			return callback(false, "activation_key_missing");
		}

		console.log("ℹ️ [info] [activation] Activation with owner", ac_owner, "and key", ac_key);

		this.userlib.view("users", "owners_by_activation", {
			"key": ac_key,
			"include_docs": false
		}).then((/* body */) => {
			const url = app_config.public_url + "/password.html?activation=" + ac_key + "&owner=" + ac_owner;
			callback(true, {
				redirectURL: url
			});
		}).catch((err) => {
			console.log("☣️ [error] [activation]" + err);
			callback(false, "user_not_found");
		});
	}

	atomic(doc, changes, action_name, callback) {
		this.userlib.atomic("users", "edit", doc, changes, (_in_err) => {
			if (_in_err !== null) {
				console.log("Cannot edit user on password-set", { _in_err }, "changes", changes);
				// conflict also seems to mean there is no change...
				return callback(false, action_name + "_failed");
			}
			console.log(`ℹ️ [info] ${action_name} successful for ${doc}`);
			if ((action_name == "password_reset") && (process.env.ENVIRONMENT == "test")) {
				callback(true, changes.reset_key);
			} else {
				callback(true, action_name + "_successful");
			}

		});
	}

	set_password_reset(rbody, callback) {
		this.userlib.view("users", "owners_by_resetkey", {
			"key": rbody.reset_key,
			"include_docs": false
		}, (err, body) => {

			if (err) {
				console.log("☣️ [error] " + err);
				return callback(true, "reset_key_invalid");
			}

			if (typeof (body) === "undefined") {
				console.log("☣️ [error] Reset user failing... no body returned.");
				return callback(true, "no_body");
			}

			if (body.rows.length === 0) {
				console.log("☣️ [error] User not found.");
				return callback(false, "reset_user_not_found");
			}

			let userdoc = body.rows[0].value;
			alog.log(userdoc._id, "Attempt to set password with: " + rbody.reset_key, "warning");

			// invalidates the reset_key by setting password; reset_key cannot be used anymore since now
			let changes = {
				password: sha256(prefix + rbody.password),
				last_reset: new Date(),
				reset_key: null
			};

			console.log("🔨 [debug] [owner] will edit userdoc:", JSON.stringify(userdoc), "\n with changes", JSON.stringify(changes, null, 2));

			this.atomic(userdoc._id, changes, "password_reset", callback);

		});
	}

	set_password_activation(rbody, callback) {
		this.userlib.view("users", "owners_by_activation", {
			"key": rbody.activation,
			"include_docs": false
		}, (err, body) => {

			if (err) {
				console.log("☣️ [error] Activation Error: " + err);
				return callback(false, "reset_error");
			}

			if (body.rows.length === 0) {
				return callback(false, "activated_user_not_found");
			}

			let userdoc = body.rows[0].value;
			console.log("ℹ️ [info] Activating user: " + userdoc.owner);
			deploy.initWithOwner(userdoc.owner);

			let changes = {
				password: sha256(prefix + rbody.password),
				activation_date: new Date(),
				activation: null
			};

			this.atomic(userdoc._id, changes, "activation", (success, response) => {
				if (process.env.ENVIRONMENT == "test") {
					callback(success, response);
				} else {
					callback(success, "password_reset_request_accepted");
				}

			});
		});
	}

	set_password(rbody, callback) {

		if (
			(!Util.isDefined(rbody.password)) ||
			(!Util.isDefined(rbody.rpassword)) ||
			(rbody.password !== rbody.rpassword)
		) {
			return callback(false, "password_mismatch");
		}

		// Password Reset
		if (Util.isDefined(rbody.reset_key)) {
			console.log("ℹ️ [info] Resetting password " + rbody.reset_key + "using set_password_reset...");
			return this.set_password_reset(rbody, callback);
		}

		// User Activation
		if (Util.isDefined(rbody.activation)) {
			console.log("ℹ️ [info] Searching " + rbody.activation + "using set_password_activation...");
			return this.set_password_activation(rbody, callback);
		}

		return callback(false, "invalid_change_flow-" + JSON.stringify(rbody));
	}

	delete(owner, callback, res) {
		let changes = {
			deleted: true
		};
		this.userlib.atomic("users", "edit", owner, changes, (a_error, response) => {
			if (a_error) {
				console.log("☣️ [error] " + a_error + "  deleting : " + owner, response);
				this.userlib.destroy(owner, (error) => {
					alog.log(owner, "Profile update failed.", "error");
					if (error) {
						callback(res, false, "delete_failed");
					} else {
						alog.log(owner, "Owner document destroyed.", "warning");
						callback(res, true, "deleted");
					}

				});
				return;
			}
			alog.log(owner, "Owner state changed to deleted.", "warning");
			callback(res, true, "deleted");
		});
	}

	create_default_acl(owner_id, callback) {

		console.log("ℹ️ [info] Creating default ACLs for owner", owner_id);
		// Load/create ACL file
		let acl = new ACL(this.redis, owner_id);
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

	create_mqtt_access(owner_id, DEFAULT_APIKEY_NAME, callback) {
		this.apikey.create(owner_id, DEFAULT_APIKEY_NAME, (success, object) => {
			if (success) {
				console.log(`ℹ️ [info] Adding MQTT credential ${object[0].key}`);
				this.auth.add_mqtt_credentials(owner_id, object[0].key /* key, not hash! */, () => {
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

	create_default_mqtt_apikey(owner_id, callback) {

		if ((typeof (owner_id) === "undefined") || (owner_id === "") || (owner_id === null)) {
			console.log("☣️ [error] Cannot create MQTT apikey with invalid owner_id.");
			callback(false);
		}

		this.apikey.list(owner_id, (err, body) => {

			// Exit if key already found
			for (let index in body) {
				let keyObj = body[index];
				if (keyObj.alias.indexOf(DEFAULT_APIKEY_NAME) == 0) {
					console.log(`ℹ️ [info] ${DEFAULT_APIKEY_NAME} already exists, skipping create...`);
					return callback(true, keyObj);
				}
			}

			this.create_mqtt_access(owner_id, DEFAULT_APIKEY_NAME, callback);
		});
	}

	/**
	 * Create user with wrapper and optional activation (TODO: elaborate)
	 * - may fail if user exists
	 * - res is only passed back to callback
	 */
	create(body, send_activation, res, callback) {

		// Legacy Create
		const first_name = body.first_name;
		const last_name = body.last_name;
		const email = body.email;

		let username = body.username;

		// password will be set on successful e-mail activation

		if ((typeof (email) === "undefined") || (email === null)) {
			return callback(res, false, "email_required");
		}

		let new_owner_hash = sha256(prefix + email.toLowerCase());

		// OAuth Create
		if (typeof (username) === "undefined") {
			username = new_owner_hash;
		}

		this.userlib.get(new_owner_hash, (user_get_error) => {

			// test username, must mirror ../../spec/_envi.json:test_info.username; should not exist in production
			if ((process.env.ENVIRONMENT === "test") || (process.env.ENVIRONMENT === "development")) {
				console.log("[DEBUG] running in test env");
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

			// FIXME: contains username hash
			console.log("[DEBUG] [create] checking owner by username", username);

			// Check for existing username, should return error.
			this.userlib.view("users", "owners_by_username", {
				"key": username,
				"include_docs": true
			}, (err, user_view_body) => {

				if (err !== null) {
					// Should be missing
					if (err.toString().indexOf("Error: missing") === -1) {
						console.log("☣️ [error] Is the DB created? New user should not cause: " + err);
					}
				} else {
					let user_should_not_exist = user_view_body.rows.length;
					if (user_should_not_exist > 0) {
						// https://rollbar.com/thinx-dev/THiNX/items/1041/
						// causes headers to be re-set on login
						console.log("☣️ [error] Username already exists: " + username);
						return callback(res, false, "username_already_exists");
					}
				}

				let new_activation_date = new Date().toString();
				let new_activation_token = sha256(new_owner_hash + new_activation_date);

				let default_info = {
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

				console.log("[DEBUG] will create_default_mqtt_apikey");

				// should not throw
				this.create_default_mqtt_apikey(new_owner_hash, (success) => {

					if (!success) {
						console.log(`☣️ [error] Creating Default MQTT API Key Failed for ${new_owner_hash}`);
						return callback(res, false, "creating_mqtt_api_key_failed");
					}

					let activation_email_descriptor = {
						new_owner_hash: new_owner_hash,
						new_activation_token: new_activation_token,
						email: email,
						first_name: first_name,
						last_name: last_name,
						username: username
					};

					console.log(`🔨 [debug] Created Default MQTT API Key for new_owner_hash ${new_owner_hash}`);

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

					this.userlib.insert(new_user, new_owner_hash, (err_u) => {
						if (err_u) {
							if (err_u.statusCode == 409) {
								callback(res, false, "email_already_exists");
							} else {
								console.log("☣️ [error] owner_error", err_u);
								callback(res, false, "owner_error");
							}
						} else {

							// Skip e-mail dance in test, return token immediately instead.
							if (process.env.ENVIRONMENT === "test") {
								return callback(res, true, new_activation_token);
							}

							if (!send_activation) {
								return callback(res, true, "account_created");
							}
							// if this fails, should not insert the user (but may be optional in tests or local!).
							this.sendActivationEmail(activation_email_descriptor, (send_success, result) => {

								// This can fail with GitHub/Google where no mail should be sent at all!
								// This can fail in test but user will not be activated
								if (process.env.ENVIRONMENT !== "test") {
									if (!send_success) {
										if (send_activation) {
											console.log("[user create] Exiting...");
											return callback(res, false, result);
										}
									}
									console.log("activation_email_descriptor", activation_email_descriptor, "send_activation", send_activation);
								}

								callback(res, true, "email_sent");
							});
						}
					}); // insert owner
				});
			}); // create API key
		}); // view owners

	}

	//
	// Mesh Support
	//

	createMesh(owner, mesh_id, mesh_alias, callback) {

		this.userlib.get(owner, (err, body) => {

			// Guards
			if (err) {
				return callback(false, err);
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
			this.userlib.atomic("users", "edit", owner, { mesh_ids: meshes }, (a_error) => {
				if (a_error) {
					console.log("ERR: ", {a_error} ," creating mesh in owner " + owner + " : " + JSON.stringify(body));
					alog.log(body.owner, "Mesh creation failed.", "error");
					return callback(false, "create_mesh_failed");
				}
				alog.log(body.owner, "Owner Mesh Created.", "info");
				callback(true, newMesh);
			});
		});
	}

	deleteMeshes(owner, mesh_ids, callback) {

		this.userlib.get(owner, (err, body) => {

			// Guards
			if (err) {
				return callback(false, err);
			}

			let meshes = []; // current user meshes or empty array
			if (typeof (body.mesh_ids) !== "undefined") {
				meshes = body.mesh_ids;
			}

			let meshes_out = [];

			let acl = new ACL(this.redis, owner);

			acl.load(() => {

				let deleted = false;
				let deleted_ids = [];

				// Parse all user meshes
				for (let index in meshes) {
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
				this.userlib.atomic("users", "edit", owner, { mesh_ids: mout }, (a_error) => {
					if (a_error) {
						console.log("ERR: " + a_error + "  deleting mesh in : " + JSON.stringify(body));
						alog.log(body.owner, "Mesh deletion failed.", "error");
						return callback(false, "delete_mesh_failed");
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
		this.userlib.get(owner, (err, body) => {
			if (err) {
				return callback(false, err);
			}
			if (typeof (body.mesh_ids) === "undefined") {
				return callback(true, []);
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

	//
	// Login Tracking
	//

	trackUserLogin(owner_id) {
		this.userlib.atomic("users", "checkin", owner_id, {
			last_seen: new Date()
		}, (error) => {
			if (error) {
				console.log("☣️ [error] [trackUserLogin] Last-seen atomic update failed: " + error);
			}
		});

		alog.log(owner_id, "OAuth2 User logged in...");
	}

	updateLastSeen(doc, repeated = false) {
		this.userlib.atomic("users", "checkin", doc._id, {
			last_seen: new Date()
		}, (error, response) => {
			if (error !== null) {
				console.log(`[warning] Last-seen update error: ${error}`);
			}
			if ((error !== null) && (error.toString().indexOf("conflict") !== -1)) {
				console.log("[warning] [conflict] Last-seen update retry...");
				delete doc._rev;
				if (!repeated) this.updateLastSeen(doc, true);
			} else {
				if (error !== null) {
					console.log("☣️ [error] Last-seen update failed (1): ", error, response);
				}
			}
		});
	}

	//
	// GitHub Support
	//

	addGitHubAccessToken(owner, token, callback) {
		this.userlib.atomic("users", "edit", owner, { gitHubAccessToken: token }, (a_error) => {
			if (a_error) {
				console.log("ERR: " + a_error + "  adding GitHub Access Token");
				alog.log(owner, "GitHub Access Token creation failed.", "error");
				return callback(false, "add_github_token_failed");
			}
			alog.log(owner, "GitHub Token Added.", "info");
			callback(true);
		});
	}
};
