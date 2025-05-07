/*
 * This THiNX Device Management API module is responsible for managing deployments for each device.
 */

var fs = require("fs-extra");
var util = require("util");
var semver = require("semver");
var mkdirp = require("mkdirp");
var typeOf = require("typeof");
var finder = require("fs-finder");

var Globals = require("./globals.js");
var app_config = Globals.app_config();

var Sanitka = require("./sanitka"); var sanitka = new Sanitka();
const Plugins = require("./plugins");
const Util = require("./util.js");
const Filez = require("./files.js");

var debug_deployment = app_config.debug.deployment || false;
var debug_device = app_config.debug.device || false;

module.exports = class Deployment {

	deployPathForOwner(owner) {
		let s_owner = sanitka.owner(owner);
		if (s_owner === false) {
			console.log("🚫  [critical] cannot provide deployPath without owner");
		}
		return app_config.data_root + app_config.deploy_root + "/" + s_owner;
	}

	latestFirmwareEnvelope(owner, xudid) {
		var udid = sanitka.udid(xudid);
		var path = Filez.deployPathForDevice(owner, udid);

		if (!Util.isDefined(path) || !Util.isDefined(udid)) {
			console.log("☣️ [error] LFE path undefined.");
			return false;
		}

		// check if any build exists for this device
		if (!fs.existsSync(path)) { // lgtm [js/path-injection]
			console.log("☣️ [error] LFE path does not exist.");
			return false;
		}

		var envpath = path + "/build.json";
		if (fs.existsSync(envpath)) { // lgtm [js/path-injection]
			return JSON.parse(fs.readFileSync(envpath)); // lgtm [js/path-injection]
		}

		console.log("ℹ️ [info] Device", udid, "has no firmware available.");
		return false;
	}

	latestFile(files) {
		var latest_date = 0;
		var latest_firmware = files[0];
		for (var index in files) {
			var filename = files[index];
			var stats = fs.statSync(filename);
			var mtime = new Date(util.inspect(stats.mtime));
			if (mtime > latest_date) {
				latest_date = mtime;
				latest_firmware = filename;
			}
		}
		return latest_firmware;
	}

	fixAvailableVersion(version) {

		if (!semver.valid(version)) {

			let version_string;
			let available_version = version.split(":");
			if (available_version.length > 1) {
				version_string = available_version[1];
			}

			let gobliiins = version_string.split(".");
			var number_of_dots = gobliiins.length - 1;

			var deployment_version;

			switch (number_of_dots) {

				case 0:
					deployment_version = [
						0,
						0,
						available_version
					];
					break;

				case 1:
					deployment_version = [
						0,
						gobliiins[0],
						gobliiins[1]
					];
					break;

				case 3:
					deployment_version = [
						gobliiins[0],
						gobliiins[1],
						parseInt(gobliiins[2]) + parseInt(gobliiins[3]),
					];
					break;

				case 4:
					deployment_version = [
						gobliiins[0],
						gobliiins[1],
						parseInt(gobliiins[2]) + parseInt(gobliiins[3]) + parseInt(gobliiins[4]),
					];
					break;

				default:
					deployment_version = [
						gobliiins[0],
						gobliiins[1],
						gobliiins[2],
					];
					break;
			}

			version = deployment_version.join(".");
			if (debug_deployment) console.log("🔨 [debug] [hasUpdateAvailable] Deployed version collapsed: " + version);
		}
		return version;
	}

	getAvailableVersion(owner, xudid) {
		// In case of attempt to install completely different firmware, bypasses version check...
		var udid = sanitka.udid(xudid);
		var envelope = this.latestFirmwareEnvelope(owner, udid);
		var available_version;

		// In case of same firmware flavour, check the version and upgrade only if new is available.
		if ((typeof (envelope) !== "undefined") &&
			(typeof (envelope.version) !== "undefined") &&
			(envelope.version !== null)) {
			console.log("ℹ️ [info] Latest Available Firmware for", xudid, "is", envelope.version);
			available_version = this.fixAvailableVersion(envelope.version);
		}
		return available_version;
	}

	getAvailableEnvironmentHash(owner, xudid) {
		// In case of attempt to install completely different firmware, bypasses version check...
		var udid = sanitka.udid(xudid);
		var envelope = this.latestFirmwareEnvelope(owner, udid);
		var available_hash = null; // should be null for no env...

		// In case of same firmware flavour, check the version and upgrade only if new is available.
		if ((typeof (envelope) !== "undefined") &&
			(typeof (envelope.env_hash) !== "undefined") &&
			(envelope.env_hash !== null)) {
			console.log("ℹ️ [info] Available (latest) firmware env_hash: " + envelope.env_hash);
			available_hash = envelope.env_hash;
		}

		if ((typeof (envelope) !== "undefined")) {
			console.log("ℹ️ [info] getAvailableEnvironmentHash envelope", envelope);
		}

		return available_hash;
	}

	parseDeviceVersion(deviceVersion) {
		if (typeof (deviceVersion) === "undefined" || deviceVersion === null) {
			deviceVersion = "0.0.1";
		}
		var pattern = /[0-9.]/;
		var pattern_valid = new RegExp(pattern).test(deviceVersion);

		if (!pattern_valid) {
			console.log("⚠️ [warning] [parseDeviceVersion] Device version invalid: " + deviceVersion);
		}

		if (!semver.valid(deviceVersion)) {
			var device_version = [0, 0, 0];
			var dev_version_array = deviceVersion.split(".");
			for (var index1 in dev_version_array) {
				device_version[index1] = dev_version_array[index1];
			}
			console.log("⚠️ [warning] [parseDeviceVersion] Invalid semantic versioning in: " + deviceVersion);
			deviceVersion = device_version.join(".");
			console.log("⚠️ [warning] [parseDeviceVersion] Semantic versioning changed to: " + deviceVersion);
		}
		return deviceVersion;
	}

	supportedPlatform(platform) {

		if (!Util.isDefined(platform)) {
			//console.log("[supportedPlatform] error: platform not defined: ", platform);
			return false;
		}

		switch (platform) {

			case "mongooseos":
			case "mongoose":
			case "python":
			case "micropython":
			case "nodemcu":
			case "pine64":
			case "platformio":
			case "arduino":
				return true;

			case "nodejs":
			case "sigfox":
			default:
				console.log("[supportedPlatform] returning unsupported platform:", platform);
				return false;
		}
	}

	platformSupportsUpdate(device) {

		if (!Util.isDefined(device)) {
			console.log("☣️ [error] [deployment] Cannot platformSupportsUpdate without device!");
			return false;
		}

		let platform;

		// Extract platform part before ':' if any
		if (Util.isDefined(device.platform)) {
			platform = device.platform; // fetch as is
			if (platform.indexOf(":") !== -1) {
				var platform_array = platform.split(":");
				platform = platform_array[0]; // strip if contains colon
			}
		}

		return this.supportedPlatform(platform);
	}

	initWithOwner(v_owner) {
		var user_path = this.deployPathForOwner(v_owner); // validates
		if (!Util.isDefined(user_path)) {
			console.log("☣️ [error] deployment.js: No deploy path with owner " + v_owner);
			return;
		}
		mkdirp(user_path); // lgtm [js/path-injection]
	}

	initWithDevice(device) {
		if (!Util.isDefined(device)) {
			console.log("☣️ [error] [deployment] Cannot init deployment without device!");
			return;
		}
		this.initWithOwner(device.owner, null, (success, response) => {
			console.log("ℹ️ [info] initWithDevice success: " + success + " response " +
				response);
		});
	}

	deploymentPathForDeviceOwner(owner, udid) {
		return this.deployPathForOwner(owner) + "/" + udid;
	}

	supportedExtensions(callback) {

		let manager = new Plugins(this);

		(async () => manager.loadFromConfig('./lib/thinx/plugins/plugins.json'))()
			.then(async () => manager.extensions())
			.then(extensions => {
				callback(extensions);
			}).catch(e => {
				console.log(e);
				callback([]);
			});
	}

	latestFirmwarePath(in_owner, udid, callback) {
		if (!Util.isDefined(in_owner) || !Util.isDefined(udid) || typeOf(in_owner) == "object") {
			console.log(`☣️ [error] invalid LFP owner ${in_owner} with udid: ${udid}`);
			callback(false);
			return;
		}
		let owner = sanitka.owner(in_owner);
		var latest_firmware = false;
		var fpath = Filez.deployPathForDevice(owner, udid) + "/build.json";
		if (!fs.existsSync(fpath)) { // lgtm [js/path-injection]
			console.log(`☣️ [error] Envelope ${fpath} not found.`);
			callback(false);
			return;
		}
		var dpath = Filez.deployPathForDevice(owner, udid);
		this.supportedExtensions((extensions) => {
			console.log("ℹ️ [info] supported extensions", extensions);
			for (var extension in extensions) {
				var files = finder.in(dpath).findFiles(extension);
				if (files.length === 0) continue;
				latest_firmware = files[0];
				let latest = this.latestFile(files);
				if (latest !== "undefined") {
					latest_firmware = latest;
				}
			}
			callback(latest_firmware);
		});
	}

	latestFirmwareArtifact(owner, udid) {
		var dpath = Filez.deployPathForDevice(owner, udid);
		var files = finder.in(dpath).findFiles("*.zip");
		return this.latestFile(files);
	}

	artifact(owner, udid, build_id) {
		var fpath = `${Filez.deployPathForDevice(owner, udid)}/${build_id}/${build_id}.zip`;
		let data = null;
		if (fs.existsSync(fpath)) {
			try {
				data = fs.readFileSync(fpath);
			} catch (e) {
				console.log("☣️ [error] caught exception", e, "while reading artifact at", fpath);
			}
		} else {
			console.log("[warning] artifact not found at", fpath);
		}
		return data; // lgtm [js/path-injection]
	}

	validateHasUpdateAvailable(device) {

		let has = true;

		if (!Util.isDefined(device)) {
			console.log("☣️ [error] [validateHasUpdateAvailable] Cannot init deployment without device!");
			has = false;
		}

		if (!Util.isDefined(device.owner)) {
			console.log("☣️ [error] [validateHasUpdateAvailable] Device has no owner.");
			console.log({ device });
			has = false;
		}

		if (!Util.isDefined(device.udid)) {
			console.log("☣️ [error] [validateHasUpdateAvailable] Device has no udid.");
			console.log({ device });
			has = false;
		}

		if (!this.platformSupportsUpdate(device)) {
			console.log("☣️ [error] [validateHasUpdateAvailable] Device does not support updates.");
			has = false;
		}

		return has;
	}

	hasUpdateAvailable(device) {

		const owner = device.owner;

		const deviceVersion = this.parseDeviceVersion(device.version);

		var available_version = this.getAvailableVersion(owner, device.udid);
		if (typeof (available_version) === "undefined") {
			if (debug_device) console.log("ℹ️ [info] No firmware update available.");
			return false;
		}

		// Device version lower than available version
		var outdated = semver.lt(deviceVersion, available_version);
		if (outdated) {
			console.log("ℹ️ [info] Device has:", deviceVersion, ", update available to:", available_version);
			return true;
		}

		// Device version same, but environment may change
		if (semver.eq(deviceVersion, available_version)) {
			// versions equal, update may happen
			if (debug_device) console.log("ℹ️ [info] Device version is up-to-date.");

			const deviceHash = device.env_hash;
			if (typeof (deviceHash) !== "undefined" && deviceHash !== null) {
				if (deviceHash.indexOf("cafebabe") === 0) {
					console.log("⚠️ [warning] Device has default environment, will not perform update (dev version).");
				} else {
					if (deviceHash.indexOf(this.getAvailableEnvironmentHash(owner, device.udid)) == -1) {
						console.log("ℹ️ [info] Device version is same but environment changed -> should provide update.");
						outdated = true;
					}
				}
			}
		} else {
			console.log("ℹ️ [info] Device version is newer than available.");
		}

		return outdated;
	}
};