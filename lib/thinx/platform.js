var finder = require("fs-finder");
var fs = require("fs-extra");
var YAML = require('yaml');

module.exports = class Platform {

    static getPlatform(local_path, callback) {

		if (typeof (local_path) === "undefined") {
			callback(false, "local_path not defined");
			return false; // success
		}

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
		console.log("ℹ️ [info] found xinos: " + JSON.stringify(xinos));
		if (xinos.length > 0) isArduino = true;

		// PIO

		var isPlatformio = fs.existsSync(local_path + "/platformio.ini");
		if (isPlatformio) isArduino = false;

		// JS

		var isNodeJS = fs.existsSync(local_path + "/package.json");
		if (isNodeJS) isNodeJS = true;

		// LUA

		var isLua = fs.existsSync(local_path + "/init.lua");

		// Py

		var isPython = (fs.existsSync(local_path + "/boot.py") ||
			fs.existsSync(local_path + "/main.py"));

		// MOS

		var isMOS = fs.existsSync(local_path + "/mos.yml"); // https://mongoose-os.com/downloads/esp8266.zip

		// Pine64

		var isPine64 = fs.existsSync(local_path + "/Makefile");
		if (isPine64) {
			let pineFile;
			try {
				pineFile = fs.readFileSync(local_path + "/Makefile");
				if (pineFile.toString().indexOf('BL60X') == -1) {
					console.log("ℹ️ [info] Makefile found for Pine64, but does not contain BL60X keyword.");
					isPine64 = false;
				}
			} catch(e) {
				console.log("☣️ [error] pine64 import failed", e);
			}
		}

		var platform = "unknown";
		// TODO (9): Assign platforms by plugin implementations instead of this, extact matching functions! Functions should return name or null and need no separate unit testing being always called only from here.

		if (isPlatformio) {
			platform = "platformio";
		} else if (isArduino) {
			platform = "arduino";
		} else if (isPython) {
			platform = "python";
		} else if (isLua) {
			platform = "nodemcu";
		} else if (isPine64) {
			platform = "pine64";
		} else if (isMOS) {
			platform = "mongoose";
		} else if (isNodeJS) {
			platform = "nodejs";
		} else {
			console.log("⚠️ [warning] Platform could not be inferred.");
		}

		var yml_platform = Platform.getPlatformFromPath(local_path);
		if (yml_platform !== null) {
			platform = yml_platform;
		}

		if (typeof (callback) !== "undefined") {
			callback(true, platform);
		} 

		if (platform == "unknown") {
			console.log("⚠️ [warning] Returning false instead 'unknown' platform.");
			return false; // success
		}
			
		return platform; // success
    }
    
	// can be split to getYMLFromPath and getPlatformFromYML but will be always used together
	// returning yml_path or null and platform or null
    static getPlatformFromPath(local_path) {

		var ymls = finder.from(local_path).findFiles('thinx.yml');

		if ((typeof(ymls) === "undefined") || (ymls.length === 0)) {
			return null;
		}

		const yml_path = ymls[0];
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
			console.log("ℹ️ [info] [repository] platform from thinx.yml: " + platform);
			if ((typeof (yml.arduino) !== "undefined") &&
				(typeof (yml.arduino.arch) !== "undefined")) {
				platform = platform + ":" + yml.arduino.arch;
			}
		}

		return platform;
	}
};