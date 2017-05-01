/*
 * This THiNX-RTM API module is responsible for managing deployment data.
 */

var Deployment = (function() {

	var fs = require("fs");
	var util = require("util");
	var semver = require("semver");

	var device;

	var owner;
	var mac;
	var version;

	var _private = {
		getFiles: function(dir, files_) {
			files_ = files_ || [];
			var files = fs.readdirSync(dir);
			for (var i in files) {
				var name = dir + "/" + files[i];
				if (fs.statSync(name).isDirectory()) {
					this.getFiles(name, files_);
				} else {
					files_.push(name);
				}
			}
			return files_;
		}
	};

	// public
	var _public = {

		initWithDevice: function(device) {
			this.device = device;
			this.owner = device.owner;
			this.mac = device.mac;
			this.version = device.version;
		},

		pathForDevice: function(owner, mac) {
			var config = require("../../conf/config.json");
			var user_path = config.deploy_root + "/" + owner;
			var device_path = user_path;
			if (mac.indexOf("ANY") != -1) {
				device_path = device_path + "/" + mac;
			}
			return device_path;
		},

		latestFirmwarePath: function() {
			var dpath = this.pathForDevice(this.owner, this.mac);
			var files = _private.getFiles(dpath);
			var latest_date = 0;
			var latest_firmware = false;
			for (var index in files) {
				if (files[index].indexOf(".bin") == files[index].length - 4) { // only .bin fiels
					var stats = fs.statSync(files[index]);
					var mtime = new Date(util.inspect(stats.mtime));
					if (mtime > latest_date) {
						latest_date = mtime;
						latest_firmware = files[index];
					}
					//console.log(mtime);
				}
			}
			return latest_firmware;
		},

		latestFirmwareVersion: function() {
			console.log("latestFirmwareVersion: " + JSON.stringify(this.latestFirmwareEnvelope()));
			var envelope = this.latestFirmwareEnvelope();
			if (envelope) {
				return envelope.version;
			} else {
				return "0.0.0";
			}
		},

		latestFirmwareEnvelope: function() {
			var path = this.latestFirmwarePath();
			if (path) {
				var envpath = path.replace(".bin", ".json"); // todo: replace only extension
				//console.log("Require: " + envpath);
				var envelope = require(envpath);
				console.log("Envelope: " + JSON.stringify(envelope));
				return envelope;
			} else {
				return false;
			}
		},

		hasUpdateAvailable: function(device) {
			var deviceVersion = device.version;
			if (typeof(deviceVersion) === "undefined" || deviceVersion === null) {
				deviceVersion = "1.0.0";
			}
			console.log("Device version: " + deviceVersion);
			var deployedVersion = this.latestFirmwareVersion();
			console.log("Deployed version: " + deployedVersion);

			if (!semver.valid(deviceVersion)) {
				console.log("Device version has invalid semantic versioning:" +
					deviceVersion);
				deviceVersion = "0.0." + deviceVersion;
			}
			if (!semver.valid(deployedVersion)) {
				console.log("Deployed version has invalid semantic versioning:" +
					deployedVersion);
				deployedVersion = "0.0." + deployedVersion;
			}
			return semver.lt(deviceVersion, deployedVersion);
		}
	};

	return _public;

})();

exports.init = Deployment.init;
exports.initWithDevice = Deployment.initWithDevice;
exports.pathForDevice = Deployment.pathForDevice;
exports.latestFirmwarePath =
	Deployment.latestFirmwarePath;
exports.hasUpdateAvailable = Deployment.hasUpdateAvailable;
exports.latestFirmwareVersion =
	Deployment.latestFirmwareVersion;
exports.latestFirmwareEnvelope = Deployment
	.latestFirmwareEnvelope;
