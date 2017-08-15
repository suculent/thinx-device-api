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
	if (process.env.CIRCLE_CI === true) {
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
			var user_path = __dirname + "/../.." + app_config.deploy_root + "/" +
				owner;
			return user_path;
		}

	};

	// public
	var _public = {

		initWithDevice: function(device) {
			this.device = device;
			this.owner = device.owner;
			this.udid = device.udid;
			this.version = device.version;
			_public.initWithOwner(this.owner);
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
			return device_path;
		},

		latestFirmwarePath: function(owner, udid) {

			if (typeOf(owner) == "Object") {
				console.log("Suspicious owner: " + JSON.stringify(owner));
			}

			var dpath = _public.pathForDevice(owner, udid);
			var files = _private.getFiles(dpath);
			var latest_date = 0;
			var latest_firmware = null;
			for (var index in files) {
				var filename = files[index];
				var valid = false;
				var supported_extensions = builder.supportedExtensions();
				for (var sex_index in supported_extensions) {
					var extension = "." + supported_extensions[sex_index];
					if (filename.indexOf(extension) !== -1) {
						valid = true;
					}
				}
				if (valid) {
					var stats = fs.statSync(files[index]);
					var mtime = new Date(util.inspect(stats.mtime));
					if (mtime > latest_date) {
						latest_date = mtime;
						latest_firmware = filename;
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
			var path = _public.latestFirmwarePath(owner, udid);
			if (path) {
				var envpath = path.replace(".bin", ".json");
				var supported_extensions = builder.supportedExtensions();
				for (var xindex in supported_extensions) {
					var extension = "." + supported_extensions[xindex];
					envpath = envpath.replace(extension, ".json");
				}

				console.log("Final path: " + envpath);
				envpath = envpath.replace(".jsonon", ".json"); // why does this happen?

				var envelope = require(envpath);
				console.log("[LFP] envelope: " + JSON.stringify(envelope) + " at path " +
					envpath);

				return envelope;
			} else {
				return false;
			}
		},

		hasUpdateAvailable: function(device) {
			this.device = device;
			this.owner = device.owner;
			this.udid = device.udid;

			var deviceVersion = device.version;
			if (typeof(deviceVersion) === "undefined" || deviceVersion === null) {
				deviceVersion = "0.0.1";
			}
			console.log("[hasUpdateAvailable] Device version: " + deviceVersion);
			var deployedVersion = _public.latestFirmwareVersion(this.owner, this.udid);

			if (typeof(deployedVersion) === "undefined") {
				deployedVersion = "0.0.0";
				return false;
			}

			console.log("[hasUpdateAvailable] Deployed version: " + deployedVersion);

			if (!semver.valid(deviceVersion)) {
				var device_version = [0, 0, 0];
				var dev_version_array = deviceVersion.split(".");
				for (var index1 in dev_version_array) {
					device_version[index1] = dev_version_array[index1];
				}
				deviceVersion = device_version.join(".");
				console.log(
					"[hasUpdateAvailable] Device version has invalid semantic versioning: " +
					deviceVersion);
			}

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
				console.log("Deployed version is newer than device version.");
				return true;
			} else {
				console.log("Device version is newer than deployed version.");
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
