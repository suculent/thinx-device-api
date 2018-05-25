/*
 * This THiNX-RTM API module is responsible for managing deployment data.
 */

var Deployment = (function() {

	var fs = require("fs-extra");
	var util = require("util");
	var semver = require("semver");
	var mkdirp = require("mkdirp");
	var typeOf = require("typeof");
	var finder = require("fs-finder");

	var builder = require("./builder");

	var app_config = require("../../conf/config.json");
	if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}

	var _private = {

		getFiles: function(dir, files_) {
			files_ = files_ || [];
			if (!fs.existsSync(dir)) {
				return null;
			}
			return finder.from(dir).findFiles();
		},

		pathForOwner: function(owner) {
			var user_path = app_config.project_root + app_config.deploy_root + "/" +
				owner;
			return user_path;
		},

		supportsUpdate: function(device) {

			// TODO: Parse descriptors in /platforms/ and tag "builds" there
			if ((typeof(device.platform) === "undefined") || device.platform === null) return false;

			switch (device.platform) {

				case "mongooseos":
				case "mongoose":
				case "python":
				case "micropython":
				case "nodemcu":
				case "platformio":
				case "arduino":
					return true;

				case "nodejs":
				case "sigfox":
					return false;

				default:
					return false;
			}
		},

		getNewestFolder: function(dir, regexp) {
			newest = null;
			if (!fs.existsSync(dir)) {
				console.log("No device directory found when trying to fetch newest build for device.");
				dir = dir + "/";
				if (!fs.existsSync(dir)) {
					console.log("No device directory found when trying to fetch newest build for device.");
					return null;
				}
				return null;
			}
			files = fs.readdirSync(dir);
			one_matched = 0;

			for (i = 0; i < files.length; i++) {

				if (regexp.test(files[i]) === false) {
					continue;
				} else if (one_matched === 0) {
					newest = dir + "/" + files[i];
					one_matched = 1;
					continue;
				}

				var filepath = dir + "/" + files[i];
				//console.log("STAT> " + filepath);
				f1_time = fs.statSync(filepath).mtime.getTime();
				f2_time = fs.statSync(newest).mtime.getTime();
				if (f1_time > f2_time)
					newest[i] = files[i];
			}

			if (newest !== null)
				return (newest);
			return null;
		}

	};

	// public
	var _public = {

		initWithDevice: function(device) {

			if ((typeof(device) === "undefined") || device === null) {
				console.log("[deployment] [error] Cannot init deployment without device!");
			}

			this.device = device;
			this.owner = device.owner;
			this.udid = device.udid;
			this.version = device.version;
			_public.initWithOwner(this.owner, null, function(success, response) {
				console.log("initWithDevice -- success:" + success + " response" +
					response);
			});
		},

		initWithOwner: function(owner) {

			this.owner = owner;
			var user_path = _private.pathForOwner(owner);
			if (typeof(user_path) === "undefined" || user_path === null) return;

			fs.lstat(user_path, function(err, stats) {
				if (err) {
					if (err.errno == -2) {
						mkdirp(user_path, function(err) {
							if (err) console.log(err);
							else console.log(user_path + " created.");
						});
					} else {
						return console.log(err);
					}
				}
				if (!fs.existsSync(user_path)) {
					mkdirp(user_path, function(err) {
						if (err) console.log(err);
						else console.log(user_path + " created.");
					});
				}
			});
		},

		pathForDevice: function(owner, udid) {
			this.owner = owner;
			this.udid = udid;
			var user_path = _private.pathForOwner(owner);
			var device_path = user_path + "/" + udid;
			// console.log("pathForDevice: " + device_path);
			return device_path;
		},

		latestFirmwarePath: function(in_owner, udid) {

			var owner = in_owner;

			// TODO: FIXME: Find out, why this happens (in_owner is whole object instead of identifier)
			if (typeOf(in_owner) == "object") {
				console.log("Suspicious owner: " + JSON.stringify(in_owner));
				owner = in_owner.owner;
			}

			if ((typeof(owner) === "undefined") || (typeof(udid) === "undefined")) {
				console.log("latestFirmwarePath: invalid owner: " + owner + " udid: " + udid);
				return false;
			}

			console.log("latestFirmwarePath:owner:" + JSON.stringify(owner) + ":udid:" + udid);

			var latest_firmware = false;
			var dpath = _public.pathForDevice(owner, udid);

			if (fs.existsSync(dpath)) {

				var envelope = require(dpath + "/build.json");

				// TODO: FIXME: Extend for other 'platforms' ... make variant of supportedExtensions() for platform extracted from json descriptor
				var extensions = ['*.bin', '*.py', '*.lua']; // deploy.platform.supportedExtensions();

				for (var extension in extensions) {
					var files = finder.in(dpath).findFiles(extensions[extension]);
					var latest_date = 0;
					for (var index in files) {
						var filename = files[index];
						var stats = fs.statSync(files[index]);
						var mtime = new Date(util.inspect(stats.mtime));
						if (mtime > latest_date) {
							latest_date = mtime;
							latest_firmware = filename;
						}
					}
				}
			}

			return latest_firmware;
		},

		latestFirmwareVersion: function(owner, udid) {
			var envelope = _public.latestFirmwareEnvelope(owner, udid);
			if (envelope !== null) {
				return envelope.version;
			} else {
				return "0.0.0"; // no firmware
			}
		},

		latestFirmwareEnvelope: function(owner, udid) {
			var device_path = _public.pathForDevice(owner, udid);

			console.log("[latestFirmwareEnvelope] pathForDevice: " + device_path);

			console.log("[latestFirmwareEnvelope] searching for newest folder started at " + Date().getMilliseconds());

			var path = _private.getNewestFolder(device_path, "*");

			console.log("[latestFirmwareEnvelope] searching for newest folder ended at " + Date().getMilliseconds());

			console.log("[latestFirmwareEnvelope] newestFolderForDevice: " + path);

			if (path !== null) {
				// TODO: FIXME: This is wrong... needs to find build.json in newest folder here...
				var envpath = path + "/build.json";
				if (fs.existsSync(envpath) /* && fs.statSync(envpath).size > 2 */ ) {
					var envelope = require(envpath);
					console.log("[LFP] envelope: " + JSON.stringify(envelope) +
						" at path " +
						envpath);
					return envelope;
				} else {
					console.log("[latestFirmwareEnvelope] pathForDevice not found: " + envpath);
					return false;
				}
			} else {
				console.log("[latestFirmwareEnvelope] pathForDevice: " + path);
				return false;
			}
		},

		latestFirmwareArtifact: function(owner, udid) {

			var dpath = _public.pathForDevice(owner, device);
			var files = finder.in(dpath).findFiles("*.zip");
			var latest_date = 0;
			var latest_firmware = null;

			for (var index in files) {
				var filename = files[index];
				var stats = fs.statSync(files[index]);
				var mtime = new Date(util.inspect(stats.mtime));
				if (mtime > latest_date) {
					latest_date = mtime;
					latest_firmware = filename;
				}
			}

			return latest_firmware;

		},

		artifact: function(owner, udid, build_id) {
			var dpath = _public.pathForDevice(owner, udid);
			var fpath = dpath + "/" + build_id + ".zip";
			return fs.readFileSync(fpath);
		},

		hasUpdateAvailable: function(device) {

			console.log("Checking update availability...");

			if ((typeof(device) === "undefined") || device === null) {
				console.log("[deployment] [error] Cannot init deployment without device!");
				return false;
			}

			if (_private.supportsUpdate(device) === false) {
				console.log("[hasUpdateAvailable] Device does not support updates.");
				return false;
			}

			this.device = device;
			this.owner = device.owner;
			this.udid = device.udid;

			var deviceVersion = device.version;
			if (typeof(deviceVersion) === "undefined" || deviceVersion === null) {
				deviceVersion = "0.0.1";
			}
			var pattern = /[0-9.]/;
			var pattern_valid = new RegExp(pattern).test(deviceVersion);

			if (pattern_valid === true) {
				console.log("[hasUpdateAvailable] Device version: " + deviceVersion);
			} else {
				console.log("[hasUpdateAvailable] Device version invalid: " + deviceVersion);
			}

			if (!semver.valid(deviceVersion)) {
				var device_version = [0, 0, 0];
				var dev_version_array = deviceVersion.split(".");
				for (var index1 in dev_version_array) {
					device_version[index1] = dev_version_array[index1];
				}
				console.log("[hasUpdateAvailable] Invalid semantic versioning in: " + deviceVersion);
				deviceVersion = device_version.join(".");
				console.log("[hasUpdateAvailable] Semantic versioning changed to: " + deviceVersion);
			}

			//
			// Incase of attempt to install completely different firmware, bypass version check...
			//

			var envelope = _public.latestFirmwareEnvelope(this.owner, this.udid);

			var device_flavour = device.firmware;
			var device_flavour_array = device_flavour.split(":");

			var firmware_flavour = envelope.firmware || device.firmware; // fallback to older firmware only
			var firmware_flavour_array = firmware_flavour.split(":");

			if (firmware_flavour_array[0] !== device_flavour_array[0]) {
				console.log("[hasUpdateAvailable] Firmware flavour does not match... returning true.");
				return true;
			}

			//
			// In case of same firmware flavour, check the version and upgrade only if new is available.
			//

			var deployedVersion = _public.latestFirmwareVersion(this.owner, this.udid);

			if (typeof(deployedVersion) === "undefined") {
				deployedVersion = "0.0.0";
				console.log("[hasUpdateAvailable] Deployed version not found... returning false.");
				return false;
			}

			console.log("[hasUpdateAvailable] Deployed version: " + deployedVersion);

			if (!semver.valid(deployedVersion)) {
				console.log(
					"[hasUpdateAvailable] Deployed version has invalid semantic versioning: " +
					deployedVersion);
				var deployment_version = [0, 0, 0];
				var dep_version_array = deployedVersion.split(".");
				for (var index2 in dep_version_array) {
					deployment_version[index2] = dep_version_array[index2];
				}
				deployedVersion = deployment_version.join(".");
				console.log(
					"[hasUpdateAvailable] Deployed version fixed to: " +
					deployedVersion);
			}

			if (semver.lt(deviceVersion, deployedVersion)) {
				console.log("[hasUpdateAvailable] Deployed version is newer than device version.");
				return true;
			} else {
				console.log("[hasUpdateAvailable] Device version is newer than deployed version.");
				return false;
			}
		}
	};

	return _public;

})();

exports.init = Deployment.init;
exports.initWithDevice = Deployment.initWithDevice;
exports.initWithOwner = Deployment.initWithOwner;
exports.pathForDevice = Deployment.pathForDevice;
exports.latestFirmwarePath = Deployment.latestFirmwarePath;
exports.hasUpdateAvailable = Deployment.hasUpdateAvailable;
exports.latestFirmwareVersion = Deployment.latestFirmwareVersion;
exports.latestFirmwareEnvelope = Deployment.latestFirmwareEnvelope;
exports.latestFirmwareArtifact = Deployment.latestFirmwareArtifact;
exports.artifact = Deployment.artifact;
