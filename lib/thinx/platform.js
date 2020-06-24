var finder = require("fs-finder");
var fs = require("fs-extra");
var YAML = require('yaml');

module.exports = class Platform {

    getPlatform(local_path, callback) {

		const manifest_path = local_path + "/thinx.json";

		console.log("getPlatform on path: " + manifest_path);

		if (typeof (local_path) === "undefined") {
			callback(false, "local_path not defined");
			return false; // success
		}

		// TODO: Use manifest if exists?
		// var hasManifest = fs.existsSync(manifest_path); // try to read yml with node.js

		// Arduino

		var isArduino = false;
		var inos = finder.from(local_path).findFiles('*.ino');
		var xinos = [];

		// Ignore all files in /examples/ (Arduino libs)
		for (var inoindex in inos) {
			if (inos[inoindex].indexOf("/lib/") === -1) {
				xinos.push(inos[inoindex]);
			}
		}

		console.log("found xinos: " + JSON.stringify(xinos));

		if (xinos.length > 0) isArduino = true;

		var isPlatformio = fs.existsSync(local_path + "/platformio.ini");
		if (isPlatformio) isArduino = false;

		var isNodeJS = fs.existsSync(local_path + "/package.json");
		if (isNodeJS) isNodeJS = true;

		var isLua = fs.existsSync(local_path + "/init.lua");

		var isPython = (fs.existsSync(local_path + "/boot.py") ||
			fs.existsSync(local_path + "/main.py"));

		var isMOS = fs.existsSync(local_path + "/mos.yml"); // https://mongoose-os.com/downloads/esp8266.zip

		var platform = "unknown";
		// TODO: Assign platforms by plugin implementations instead of this, extact matching functions!

		if (isPlatformio) {
			platform = "platformio";
		} else if (isArduino) {
			platform = "arduino";
		} else if (isPython) {
			platform = "python";
		} else if (isLua) {
			platform = "nodemcu";
		} else if (isMOS) {
			platform = "mongoose";
		} else if (isNodeJS) {
			platform = "nodejs";
		} else {
			console.log("Platform could not be inferred.");
		}

		//console.log("Platform: " + platform);

		var yml_platform = this.getPlatformFromPath(local_path);
		if (yml_platform !== null) {
			platform = yml_platform;
		}

		if (platform == "unknown") {
			console.log("Exiting on unknown platform.");
			callback(false, "unknown_platform");
			return false; // success
		}

		if (typeof (callback) !== "undefined") {
			callback(true, platform);
		} 
			
		return platform; // success
    }
    
    getPlatformFromPath(local_path) {

		var yml_path = local_path + "/thinx.yml";
		yml_path = yml_path.replace("//thinx.yml", "/thinx.yml");

		const isYAML = fs.existsSync(yml_path);

		if (!isYAML) {
			console.log("No YAML " + yml_path + ")");
			return null;
		}

		const y_file = fs.readFileSync(yml_path, 'utf8');
		const yml = YAML.parse(y_file);
		var platform = null;

		if (typeof (yml) !== "undefined") {
			platform = Object.keys(yml)[0];
			// console.log("[repository] YAML-based platform: " + platform);
			if ((typeof (yml.arduino) !== "undefined") &&
				(typeof (yml.arduino.arch) !== "undefined")) {
				platform = platform + ":" + yml.arduino.arch;
			}
		}

		return platform;
	}
};