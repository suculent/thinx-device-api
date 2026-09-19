const { findFilesSync } = require('./finder');
var fs = require("fs-extra");
var YAML = require('yaml');

const Plugins = require("./plugins");

module.exports = class Platform {

	static getPlatform(local_path, callback) {

		if ((typeof (local_path) === "undefined") || (local_path === null)) {
			callback(false, "local_path not defined");
			return;
		}

		let manager = new Plugins(this);

		(async () => manager.loadFromConfig('./lib/thinx/plugins/plugins.json'))()
			.then(async () => manager.use(local_path))
			.then(platform => {

				var yml_platform = Platform.getPlatformFromPath(local_path);

				if (yml_platform !== null) {
					console.log("[info] using thinx.yml platform", platform);
					platform = yml_platform;
				}

				if ((typeof (platform) !== "string") || (platform == "unknown")) {
					console.log("⚠️ [warning] Platform could not be inferred.");
					callback(false, "unknown");
				} else {
					callback(true, platform);
				}

			}).catch(e => {
				console.log("[critical] getPlatform error", e); // apienv not defined?
				callback(false, e);
			});

	}

	// can be split to getYMLFromPath and getPlatformFromYML but will be always used together
	// returning yml_path or null and platform or null
	static getPlatformFromPath(local_path) {

		var ymls = findFilesSync(local_path, 'thinx.yml', true);

		if ((typeof (ymls) === "undefined") || (ymls.length === 0)) {
			return null;
		}

		const yml_path = ymls[0];
		if (!fs.existsSync(yml_path)) {
			console.log("No YAML " + yml_path + ")");
			return null;
		}

		const y_file = fs.readFileSync(yml_path, 'utf8');
		const yml = YAML.parse(y_file);
		var platform = null;

		// YAML.parse returns null for an empty file, and Object.keys(null) throws
		if ((typeof (yml) !== "undefined") && (yml !== null)) {
			platform = Object.keys(yml)[0];
			// The arch suffix used to be read from yml.arduino.arch, hardcoded to
			// the arduino block. A PlatformIO project (top-level key
			// "platformio:") therefore lost its ":<arch>" even when it declared
			// one. Read arch from whichever block names the platform.
			const section = yml[platform];
			if ((typeof (section) !== "undefined") && (section !== null) &&
				(typeof (section.arch) !== "undefined")) {
				platform = platform + ":" + section.arch;
			}
		}

		return platform;
	}
};