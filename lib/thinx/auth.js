/*
 * This THiNX-RTM MQTT Authentication Helper
 * used by disaster recovery among others.
 */

var Globals = require("./globals.js");
var app_config = Globals.app_config();

var fs = require("fs-extra");
var exec = require("child_process");

module.exports = class Auth {

	constructor() {

		this.toolname = null;

		const cmd = "which mosquitto_passwd";
		var TOOL = exec.execSync(cmd).toString().replace("\n", "");
		if (TOOL.length > "mosquitto_passwd".length) {
			this.toolname = TOOL;
		} else {
			console.log(
				"mosquitto_passwd tool NOT FOUND on this installation! - accounts cannot be created."
			);
		}
	}

	systemSync(cmd) {
	  try {
	    return exec.execSync(cmd).toString();
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

		console.log("Adding MQTT credentials...");

		if (this.toolname === null) {
			console.log("No MQTT tool initialized.");
			return;
		}

		if (username === null) {
			console.log("username is not defined.");
			return;
		}

		if (password === null) {
			console.log("password is not defined for username" + username);
			return;
		}

		console.log("[auth] Calling mosquitto_passwd...");

		var CMD = this.toolname + " -b " + app_config.mqtt.passwords +
			" " + encodeURIComponent(username) + " " + encodeURIComponent(password);

		// TODO: construct from array here.
		// Username and password values can be trusted.

		var temp = this.systemSync(CMD);
		console.log("[REGISTER] Created new mqtt account...");
		console.log("[REGISTER] ...with result: " + temp);
		if (temp != null && typeof(temp.data) !== "undefined" && temp.data.toString() !== "") {
			console.log("[REGISTER_ERROR] MQTT: " + JSON.stringify(temp));
		} else {
			console.log("[MQTT_REGISTER_RESULT]: " + JSON.stringify(temp));
		}
	}

	revoke_mqtt_credentials(username) {

		var mtoolname = exec.execSync("which mosquitto_passwd").toString().replace(
			"\n", "");

		if (mtoolname === null) {
			console.log("No MQTT tool initialized.");
			return;
		}

		var passwords_path = app_config.mqtt.passwords;
		// console.log("TODO: check ", app_config.mqtt.passwords, " ==? ", passwords_path);
		if (fs.existsSync(passwords_path)) {
			var CMD = mtoolname + " -D " + passwords_path + " " + encodeURIComponent(username);
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
