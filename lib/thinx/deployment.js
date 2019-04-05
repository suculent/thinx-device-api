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

	var debug_deployment = app_config.debug.deployment || false;

	var _private = {

		getFiles: function(dir, files_) {
			files_ = files_ || [];
			if (!fs.existsSync(dir)) {
				return null;
			}
			return finder.from(dir).findFiles();
		},

		deployPathForOwner: function(owner) {
			var user_path = app_config.data_root + app_config.deploy_root + "/" +
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
		}

	};

	// public
	var _public = {

		initWithDevice: function(device) {

			if ((typeof(device) === "undefined") || device === null) {
				console.log("[deployment] [error] Cannot init deployment without device!");
			}

			if (typeof(device) !== "undefined" && device != null) {
				this.device = device;
			} else {
				console.log("No device to initialized deployment.");
				return;
			}


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
			var user_path = _private.deployPathForOwner(owner);
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
			this.owner = owner; // WTF
			this.udid = udid; // WTF why this sideeffect?
			var user_path = _private.deployPathForOwner(owner);
			var device_path = user_path + "/" + udid;
			console.log("[deployment.js] pathForDevice: " + device_path);
			return device_path;
		},

		deploymentPathForDeviceOwner: function(owner, udid) {
		  var user_path = config.data_root + config.deploy_root + "/" + owner;
		  var device_path = user_path + "/" + udid;
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

		latestFirmwareEnvelope: function(owner, udid) {
			var path = _public.pathForDevice(owner, udid);
			if (!fs.existsSync(path)) { // No device build succeeded yet...
				if (debug_deployment) {
					console.log("[latestFirmwareEnvelope] pathForDevice does not exist: "+path);
				}
				return false;
			}
			if (typeof(path) === "undefined" || (path === null)) {
				return false;
			}
			var envpath = path + "/build.json";
			if (fs.existsSync(envpath)) {
				var envelope = require(envpath);
				console.log("[LFP] envelope: " + JSON.stringify(envelope) + " at path " + envpath);
				return envelope;
			} else {
				console.log("[latestFirmwareEnvelope] no envelope found (notifier failed?) in " + envpath);
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

			// console.log("Checking update availability...");

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

			var available_version;

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
			// In case of attempt to install completely different firmware, bypasses version check...
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

			var available_version = device_version;

			if ((typeof(envelope) !== "undefined") &&
			    (typeof(envelope.version) !== "undefined") &&
					(envelope.version !== null)) {
				console.log("Available version: " + envelope.version);
				available_version = envelope.version;
			}

			if (typeof(available_version) === "undefined") {
				available_version = "0.0.0";
				console.log("[hasUpdateAvailable] No firmware available.");
				return false;
			} else {
				console.log("[hasUpdateAvailable] Deployed version: " + available_version);
			}

			if (!semver.valid(available_version)) {
				console.log(
					"[hasUpdateAvailable] Deployed version has invalid semantic versioning: " +
					available_version);
				var deployment_version = [0, 0, 0];
				var dep_version_array = available_version.split(".");
				for (var index2 in dep_version_array) {
					deployment_version[index2] = dep_version_array[index2];
				}
				available_version = deployment_version.join(".");
				console.log(
					"[hasUpdateAvailable] Deployed version fixed to: " +
					available_version);
			}

			if (semver.lt(deviceVersion, available_version)) {
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
exports.latestFirmwareEnvelope = Deployment.latestFirmwareEnvelope;
exports.latestFirmwareArtifact = Deployment.latestFirmwareArtifact;
exports.artifact = Deployment.artifact;
