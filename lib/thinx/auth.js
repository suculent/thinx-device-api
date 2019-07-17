/*
 * This THiNX-RTM MQTT Authentication Helper
 * used by disaster recovery among others.
 */

var Auth = (function() {

	var Globals = require("./globals.js");
  var app_config = Globals.app_config();

	var fs = require("fs-extra");
  var exec = require("child_process");
	var toolname = null;

	var _private = {

		checkTool: function() {
			var TOOL = exec.execSync("which mosquitto_passwd").toString().replace(
				"\n", "");
			if (TOOL.length > "mosquitto_passwd".length) {
				toolname = TOOL;
				return true;
			} else {
				console.log(
					"mosquitto_passwd tool NOT FOUND on this installation! - accounts cannot be created."
				);
				return false;
			}
		}
	};

	function systemSync(cmd) {
	  try {
	    return exec.execSync(cmd).toString();
	  }
	  catch (error) {
	    console.log(error.status);  // Might be 127 in your example.
	    console.log(error.message); // Holds the message you typically want.
	    console.log(error.stderr);  // Holds the stderr output. Use `.toString()`.
	    console.log(error.stdout);  // Holds the stdout output. Use `.toString()`.
	  }
	};

	// public
	var _public = {

		add_mqtt_credentials: function(username, password) {

			console.log("Adding MQTT credentials...");

			if (toolname === null) {
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

			var CMD = toolname + " -b " + app_config.mqtt.passwords +
				" " + username + " " + password;

			// TODO: construct from array here.
			// Username and password values can be trusted.

			var temp = systemSync(CMD);
			console.log("[REGISTER] Created new mqtt account...");
			console.log("[REGISTER] ...with result: " + temp);
			if (temp != null
			 && typeof(temp.data) !== "undefined"
			 && temp.data.toString() !== "") {
				console.log("[REGISTER_ERROR] MQTT: " + JSON.stringify(temp));
			} else {
				console.log("[MQTT_REGISTER_RESULT]: " + JSON.stringify(temp));
			}
		},

		revoke_mqtt_credentials: function(username) {

			var toolname = exec.execSync("which mosquitto_passwd").toString().replace(
				"\n", "");

			if (toolname === null) {
				console.log("No MQTT tool initialized.");
				return;
			}

			var passwords_path = app_config.mqtt.passwords;
			if (fs.existsSync(passwords_path)) {
				var CMD = toolname + " -D " + passwords_path + " " + username;
				var temp = systemSync(CMD);
				if (temp) {
					console.log("[REVOKE_ERROR] MQTT: '" + temp + "'");
					return false;
				}
				return true;
			}
			return false;
		}
	};

	_private.checkTool();

	return _public;

})();

exports.add_mqtt_credentials = Auth.add_mqtt_credentials;
exports.revoke_mqtt_credentials = Auth.revoke_mqtt_credentials;
