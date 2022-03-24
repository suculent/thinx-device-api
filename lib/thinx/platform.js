var finder = require("fs-finder");
var fs = require("fs-extra");
var YAML = require('yaml');

const Plugins = require("./plugins");

module.exports = class Platform {

    static getPlatform(local_path, callback) {

		if ((typeof (local_path) === "undefined") || (local_path === null)) {
			callback(false, "local_path not defined");
			return false; // success
		}

		let manager = new Plugins(this);
		(async () => manager.loadFromConfig('./lib/thinx/plugins/plugins.json'))();
        let platform = (async () => manager.use(local_path))();
		
		if (typeof(platform) !== "string") {
			console.log("⚠️ [warning] Platform could not be inferred.");
			platform = "unknown";
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