/*
 * This THiNX-RTM API module is responsible for managing deployment data.
 */

var Deployment = (function() {

	var fs = require('fs-extra');
	var util = require("util");
	var semver = require("semver");
	var mkdirp = require('mkdirp');
	var typeOf = require('typeof');

	var Rollbar = require('rollbar');

	var rollbar = new Rollbar({
		accessToken: '5505bac5dc6c4542ba3bd947a150cb55',
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

	var _private = {

		getFiles: function(dir, files_) {
			files_ = files_ || [];

			if (!fs.existsSync(dir)) {
				console.log("[getFiles] Given path is not a directory: " + dir);
				return null;
			}

			var files = fs.readdirSync(dir);
			console.log(files);
			for (var i in files) {
				var name = dir + "/" + files[i];
				console.log("[getFiles] recursive for " + name);
				if (fs.statSync(name).isDirectory()) {
					this.getFiles(name, files_);
				} else {
					files_.push(name);
				}
			}
			return files_;
		},

		pathForOwner: function(owner) {
			var config = require("../../conf/config.json");
			var user_path = __dirname + "/../.." + config.deploy_root + "/" + owner;
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
							else console.log(user_path + 'created.');
						});
					} else {
						return console.log(err);
					}
				}

				if (!fs.statSync(user_path).isDirectory()) {
					mkdirp(user_path, function(err) {
						if (err) console.log(err);
						else console.log(user_path + 'created.');
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
				if (filename.indexOf(".bin") !== -1) {
					var stats = fs.statSync(files[index]);
					var mtime = new Date(util.inspect(stats.mtime));
					if (mtime > latest_date) {
						latest_date = mtime;
						latest_firmware = filename;
					}
				}
			}
			console.log("latest_firmware: " + latest_firmware);
			return latest_firmware;
		},

		latestFirmwareVersion: function(owner, udid) {
			console.log("latestFirmwareVersion: " + JSON.stringify(_public.latestFirmwareEnvelope(
				owner, udid)));
			var envelope = _public.latestFirmwareEnvelope(owner, udid);
			if (envelope !== null) {
				return envelope.version;
			} else {
				return "0.0.0";
			}
		},

		latestFirmwareEnvelope: function(owner, udid) {
			console.log("LFP for LFE");
			var path = _public.latestFirmwarePath(owner, udid);
			console.log("latestFirmwareEnvelope path = " + path);
			if (path) {
				var envpath = path.replace(".bin", ".json"); // todo: replace only extension
				var envelope = require(envpath);
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
			console.log("[hasUpdateAvailable] Deployed version: " + deployedVersion);

			if (typeof(deployedVersion) === "undefined") {
				deployedVersion = "1.0.0";
			}


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
				var deployment_version = [0, 0, 0];
				var dep_version_array = deployedVersion.split(".");
				for (var index2 in dep_version_array) {
					deployment_version[index2] = dep_version_array[index2];
				}
				deployedVersion = deployment_version.join(".");
				console.log(
					"[hasUpdateAvailable] Deployed version has invalid semantic versioning: " +
					deployedVersion);
			}
			console.log("semver: " + deviceVersion + " < " + deployedVersion);
			Rollbar.info("semver: " + deviceVersion + " < " + deployedVersion + "?");

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
exports
	.initWithOwner = Deployment.initWithOwner;
exports.pathForDevice = Deployment
	.pathForDevice;
exports.latestFirmwarePath =
	Deployment.latestFirmwarePath;
exports.hasUpdateAvailable = Deployment.hasUpdateAvailable;
exports
	.latestFirmwareVersion =
	Deployment.latestFirmwareVersion;
exports.latestFirmwareEnvelope = Deployment
	.latestFirmwareEnvelope;
