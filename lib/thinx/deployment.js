/*
 * This THiNX-RTM API module is responsible for managing deployments for each device.
 */

var Deployment = (function() {

	var fs = require("fs-extra");
	var util = require("util");
	var semver = require("semver");
	var mkdirp = require("mkdirp");
	var typeOf = require("typeof");
	var finder = require("fs-finder");

	var Globals = require("./globals.js");
  var app_config = Globals.app_config();

	var debug_deployment = app_config.debug.deployment || false;

	var _private = {

		deployPathForOwner: function(owner) {
			var user_path = app_config.data_root + app_config.deploy_root + "/" +
				owner;
			return user_path;
		},

		fixAvailableVersion: function(available_version) {
			if (!semver.valid(available_version)) {
				console.log(
					"[hasUpdateAvailable] Deployed version has invalid semantic versioning: " +
					available_version);
				var deployment_version = [0, 0, available_version];
				available_version = deployment_version.join(".");
				console.log("[hasUpdateAvailable] Deployed version fixed to: " + available_version);
			}
			return available_version;
		},

		getAvailableVersion: function(owner, udid) {
			// In case of attempt to install completely different firmware, bypasses version check...
			var envelope = _public.latestFirmwareEnvelope(owner, udid);
			var available_version;

			// In case of same firmware flavour, check the version and upgrade only if new is available.
			if ((typeof(envelope) !== "undefined") &&
			    (typeof(envelope.version) !== "undefined") &&
					(envelope.version !== null)) {
				console.log("Available version: " + envelope.version);
				// console.log("LFE: " + JSON.stringify(envelope, false, 2));
				available_version = fixAvailableVersion(envelope.version);
			}

			return available_version;
		},

		parseDeviceVersion: function(deviceVersion) {
			if (typeof(deviceVersion) === "undefined" || deviceVersion === null) {
				deviceVersion = "0.0.1";
			}
			var pattern = /[0-9.]/;
			var pattern_valid = new RegExp(pattern).test(deviceVersion);

			if (!pattern_valid) {
				console.log("[hasUpdateAvailable] Device version invalid: " + deviceVersion);
			}

			var available_version = deviceVersion;

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
			return deviceVersion;
		},

		platformSupportsUpdate: function(device) {

			var platform = device.platform;

			if (platform.indexOf(":") !== -1) {
				var platform_array = platform.split(":");
				platform = platform_array[0];
			}

			// TODO: Parse descriptors in /platforms/ and tag "builds" there
			if ((typeof(platform) === "undefined") || platform === null) return false;

			switch (platform) {

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
				return;
			}
			_public.initWithOwner(device.owner, null, function(success, response) {
				console.log("initWithDevice -- success:" + success + " response" +
					response);
			});
		},

		initWithOwner: function(owner) {
			var user_path = _private.deployPathForOwner(owner);
			if (typeof(user_path) === "undefined" || user_path === null) {
				console.log("deployment.js: No deploy path with owner "+owner);
				return;
			}
			mkdirp(user_path, function(err) {
				if (err) console.log(err);
				else console.log("deployment.js: " + user_path + " created.");
			});
		},

		pathForDevice: function(owner, udid) {
			var user_path = _private.deployPathForOwner(owner);
			var device_path = user_path + "/" + udid;
			return device_path;
		},

		deploymentPathForDeviceOwner: function(owner, udid) {
		  var user_path = config.data_root + config.deploy_root + "/" + owner;
		  var device_path = user_path + "/" + udid;
		  return device_path;
		},

		latestFirmwarePath: function(in_owner, udid) {
			var owner = in_owner;
			// TODO: FIXME: Find out, why this happens (in_owner is whole object instead of identifier) - log callee
			if (typeOf(in_owner) == "object") {
				console.log("Suspicious owner: " + JSON.stringify(in_owner));
				owner = in_owner.owner;
			}
			if ((typeof(owner) === "undefined") || (typeof(udid) === "undefined")) {
				console.log("latestFirmwarePath: invalid owner: " + owner + " udid: " + udid);
				return false;
			}
			var latest_firmware = false;
			var dpath = _public.pathForDevice(owner, udid);
			if (!fs.existsSync(dpath)) {
				return false;
			}
			console.log("existing dpath: " + dpath);
			const enve = fs.readFileSync(dpath + "/build.json");
			var envelope = JSON.parse(enve);
			console.log("Latest firmware path envelope: " + JSON.stringify(envelope, false, 2));
			// TODO: Extend for other 'platforms' ... make variant of supportedExtensions() for platform extracted from json descriptor
			var extensions = ['*.bin', '*.py', '*.lua']; // deploy.platform.supportedExtensions();
			for (var extension in extensions) {
				var files = finder.in(dpath).findFiles(extensions[extension]);
				var latest_date = 0;
				for (var index in files) {
					var filename = files[index];
					var stats = fs.statSync(filename);
					var mtime = new Date(util.inspect(stats.mtime));
					if (mtime > latest_date) {
						latest_date = mtime;
						latest_firmware = filename;
					}
				}
			}
			return latest_firmware;
		},

		latestFirmwareEnvelope: function(owner, udid) {
			var path = _public.pathForDevice(owner, udid);
			if (!fs.existsSync(path)) { // No device build succeeded yet...
				if (debug_deployment) {
					if (typeof(owner) === "undefined") {
						console.log("Warning, device owner undefined!");
					}
					if (typeof(udid) === "undefined") {
						console.log("Warning, device identifier undefined!");
					}
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
				console.log("[latestFirmwareEnvelope] envelope found in " + envpath);
				return envelope;
			} else {
				//console.log("[latestFirmwareEnvelope] no envelope found (notifier failed?) in " + envpath);
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

			if ((typeof(device) === "undefined") || device === null) {
				console.log("[deployment] [error] Cannot init deployment without device!");
				return false;
			}

			if (_private.platformSupportsUpdate(device) === false) {
				console.log("[hasUpdateAvailable] Device does not support updates.");
				return false;
			}

			var deviceVersion = _private.parseDeviceVersion(device.version);
			var available_version = _private.getAvailableVersion(device.owner, device.udid);
			if (typeof(available_version) === "undefined") {
				console.log("[hasUpdateAvailable] No firmware available.");
				return false;
			}

			var outdated = semver.lt(deviceVersion, available_version);
			if (outdated) {
				console.log("[hasUpdateAvailable] Device version is outdated.");
			}
			return outdated;
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
