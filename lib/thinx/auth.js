/*
 * This THiNX-RTM MQTT Authentication Helper
 * used by disaster recovery among others.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();

var fs = require("fs-extra");
var exec = require("child_process");
var Sanitka = require("./sanitka"); var sanitka = new Sanitka();
const bcrypt = require('bcrypt');

module.exports = class Auth {

	constructor() {

		this.toolname = this.mosquittoInstalled();

		this.use_plugin = false;

		if ((typeof (app_config.mqtt) !== "undefined") &&
			(typeof (app_config.mqtt.use_plugin) !== "undefined")) {
			this.use_plugin = app_config.mqtt.use_plugin;
		}

		if (this.use_plugin) {
			// Connect Redis
			let options = Globals.redis_options();
			options.db = "goauth";
			this.client = require("redis").createClient(options);
		}

		console.log("Auth constructor complete...");
	}

	mosquittoInstalled() {
		const cmd = "which mosquitto_passwd";
		var TOOL = "";
		try {
			TOOL = exec.execSync(cmd).toString().replace("\n", ""); // throws!
			if (TOOL.indexOf("failed") !== -1) {
				TOOL = "";
			}
		} catch (e) {
			// console.log(e); usually "Error: Command failed: which mosquitto_passwd"
			return false;
		}

		if (TOOL.length < "mosquitto_passwd".length) {
			console.log("mosquitto_passwd tool NOT FOUND on this installation! - accounts cannot be created nor deleted.");
			return false;
		}

		return TOOL;
	}

	systemSync(cmd) {
		try {
			return exec.execSync(cmd).toString(); // lgtm [js/command-line-injection]
		}
		catch (error) {
			console.log(error.status);  // Might be 127 in your example.
			console.log(error.message); // Holds the message you typically want.
			console.log(error.stderr);  // Holds the stderr output. Use `.toString()`.
			console.log(error.stdout);  // Holds the stdout output. Use `.toString()`.
		}
	}

	//
	// public
	//

	add_mqtt_credentials(username, password) {
		if (this.use_plugin) {
			console.log("->add_mqtt_credentials_go");
			this.add_mqtt_credentials_go(username, password);
		} else {
			console.log("->add_mqtt_credentials_impl");
			this.add_mqtt_credentials_impl(username, password);
		}
	}

	add_mqtt_credentials_go(username, password) {

		console.log("Adding MQTT credentials (Redis)...");

		const hasher_cost = 10;

		console.log("->bcrypt.hash", password, hasher_cost);

		bcrypt.hash(password, hasher_cost, function (err, hash) {
			if (err) {
				console.log(err);
				return;
			}
			console.log("->bcrypt.hash result:", err, hash);
			this.client.set(username, hash);
		});
	}

	add_mqtt_credentials_impl(username, password) {

		console.log("Adding MQTT credentials (file)...");

		if (this.toolname === null) {
			console.log("No MQTT tool initialized.");
			return;
		}

		if (username === null) {
			console.log("username is not defined.");
			return;
		}

		username = sanitka.branch(username);

		if (password === null) {
			console.log("password is not defined for username" + username);
			return;
		}

		console.log("[auth] Calling mosquitto_passwd...");

		var CMD = this.toolname + " -b " + app_config.mqtt.passwords +
			" " + username + " " + password; // those are validated internal values; safe to inject into shell

		var temp = this.systemSync(CMD);

		if (temp != null && typeof (temp.data) !== "undefined" && temp.data.toString() !== "") {
			console.log("[REGISTER_ERROR] MQTT: " + JSON.stringify(temp));
		} else {
			if (temp != "") {
				console.log("[MQTT_REGISTER_RESULT]: " + JSON.stringify(temp));
			} else {
				// success
				console.log("[REGISTER] Created new MQTT account.");
			}
		}
	}

	revoke_mqtt_credentials(username) {
		if (this.use_plugin) {
			return this.revoke_mqtt_credentials_go(username);
		} else {
			return this.revoke_mqtt_credentials_impl(username);
		}
	}

	revoke_mqtt_credentials_go(username) {
		this.client.del(username);
		return true;
	}

	revoke_mqtt_credentials_impl(username) {

		if (!this.mosquittoInstalled()) return;

		var passwords_path = app_config.mqtt.passwords;
		if (fs.existsSync(passwords_path)) {
			var CMD = "mosquitto_passwd" + " -D " + passwords_path + " " + encodeURIComponent(username);
			var temp = this.systemSync(CMD);
			if (temp) {
				console.log("[REVOKE_ERROR] MQTT: '" + temp + "'");
				return false;
			}
			return true;
		}
		return false;
	}

};
