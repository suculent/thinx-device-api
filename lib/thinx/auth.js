/*
 * This THiNX-RTM MQTT Authentication Helper
 * used by disaster recovery among others.
 */

var Auth = (function() {

	var app_config = require("../../conf/config.json");
	if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}
	var fs = require("fs-extra");
  var exec = require("child_process");

	var prefix = "";

	try {
		var pfx_path = app_config.project_root + '/conf/.thx_prefix';
		if (fs.existsSync(pfx_path)) {
			prefix = fs.readFileSync(pfx_path) + "_";
		}
	} catch (e) {
		console.log("[audit] thx_prefix_exception" + e);
	}

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

	// public
	var _public = {

		add_mqtt_credentials: function(username, password) {

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

			var CMD = toolname + " -b " + app_config.mqtt.passwords +
				" " + username + " " + password;
			var temp = exec.execSync(CMD);
			console.log("[REGISTER] Creating mqtt account...");
			if (typeof(temp.data) !== "undefined"
			&& temp.data.toString() !== "") {
				console.log("[REGISTER_ERROR] MQTT: " + JSON.stringify(temp));
			}
		},

		revoke_mqtt_credentials: function(username) {

			if (toolname === null) {
				console.log("No MQTT tool initialized.");
				return;
			}

			var passwords_path = app_config.mqtt.passwords;
			if (fs.existsSync(passwords_path)) {
				var CMD = TOOL + " -D " + passwords_path + " " + username;
				var temp = exec.execSync(CMD);
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
