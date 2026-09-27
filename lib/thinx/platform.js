const { findFilesSync } = require('./finder');
const safepath = require('./safepath');
const path = require("path");
var YAML = require('yaml');

const Plugins = require("./plugins");

module.exports = class Platform {

	// Returned (instead of a platform) when the repository's thinx.yml is a
	// symlink or resolves outside the checkout. Callers must refuse the build
	// (D-11); builder.js maps it to refuseBuild(..., "unsafe_repository_file").
	static get UNSAFE_REPOSITORY_FILE() {
		return "unsafe_repository_file";
	}

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

				if (yml_platform === Platform.UNSAFE_REPOSITORY_FILE) {
					console.log("☣️ [error] refusing repository with unsafe thinx.yml in", local_path);
					callback(false, Platform.UNSAFE_REPOSITORY_FILE);
					return;
				}

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

	// Reads one thinx.yml through safepath (contained in `root`, no symlink,
	// O_NOFOLLOW) and returns its platform ("<name>" or "<name>:<arch>"), null
	// when the file is missing/empty/unparseable, or UNSAFE_REPOSITORY_FILE.
	static platformFromYamlFile(root, ymlPath) {

		const read = safepath.readFileInside(root, path.relative(root, ymlPath), "utf8");
		if (!read.ok) {
			if (read.reason === "missing") {
				console.log("No YAML " + ymlPath + ")");
				return null;
			}
			console.log("☣️ [error] refusing thinx.yml " + ymlPath + ": " + read.reason);
			return Platform.UNSAFE_REPOSITORY_FILE;
		}

		let yml;
		try {
			yml = YAML.parse(read.data);
		} catch (parse_error) {
			console.log("[warning] thinx.yml could not be parsed:", parse_error.message);
			return null;
		}

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

	// can be split to getYMLFromPath and getPlatformFromYML but will be always used together
	// returning platform, null or UNSAFE_REPOSITORY_FILE
	static getPlatformFromPath(local_path) {

		var ymls = findFilesSync(local_path, 'thinx.yml', true);

		if ((typeof (ymls) === "undefined") || (ymls.length === 0)) {
			return null;
		}

		// findFilesSync never returns a symlink, but the entry can be swapped
		// before the read; platformFromYamlFile re-checks and opens O_NOFOLLOW.
		return Platform.platformFromYamlFile(local_path, ymls[0]);
	}
};
