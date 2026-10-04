/*
 * This THiNX Device Management API module is responsible for managing deployments for each device.
 */

var fs = require("fs-extra");
var util = require("util");
var semver = require("semver");
var mkdirp = require("mkdirp");
var typeOf = require("typeof");
const { findFilesSync } = require('./finder');

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
		// quick 261004-l8k: refuse before the path is built, not after
		var udid = sanitka.udid(xudid);
		if (!Util.isDefined(udid)) {
			console.log("☣️ [error] LFE path undefined.");
			return false;
		}

		var path = Filez.deployPathForDevice(owner, udid);
		if (!Util.isDefined(path)) {
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

	// Maps a build envelope version to semver, or answers undefined (= no update) when it
	// cannot. Envelopes carry "<repo>:<git tag>" (builder.js generate_thinx_json) or a bare
	// tag; only the part after the last ':' is compared, so the firmware name never decides
	// (operator decision 2026-10-04: version compare only). quick 261004-liv:
	//   X / name:X       -> X.0.0   (was 0.0.<array>, or a TypeError without a prefix)
	//   X.Y / name:X.Y   -> X.Y.0   (was 0.X.Y, so name:1.0 never beat a device on 0.1.0)
	//   X.Y.Z            -> X.Y.Z
	//   W.X.Y.Z(.V)      -> W.X.(Y+Z(+V))   (unchanged collapsing)
	//   longer           -> first three parts (unchanged)
	// A leading "v" is accepted; any non-numeric part answers undefined instead of throwing.
	fixAvailableVersion(version) {

		if (typeof (version) === "number") version = String(version);
		if (typeof (version) !== "string") return undefined;

		if (semver.valid(version)) return version;

		let version_string = version.substring(version.lastIndexOf(":") + 1).trim();
		if (/^v/i.test(version_string)) version_string = version_string.substring(1);

		const parts = version_string.split(".");
		if (!parts.every((part) => /^[0-9]+$/.test(part))) {
			if (debug_deployment) console.log("🔨 [debug] [hasUpdateAvailable] Deployed version not comparable: " + version);
			return undefined;
		}
		const n = parts.map((part) => parseInt(part, 10));

		let deployment_version;

		switch (n.length) {
			case 1:
				deployment_version = [n[0], 0, 0];
				break;
			case 2:
				deployment_version = [n[0], n[1], 0];
				break;
			case 4:
				deployment_version = [n[0], n[1], n[2] + n[3]];
				break;
			case 5:
				deployment_version = [n[0], n[1], n[2] + n[3] + n[4]];
				break;
			default:
				deployment_version = [n[0], n[1], n[2]];
				break;
		}

		const collapsed = deployment_version.join(".");
		if (!semver.valid(collapsed)) return undefined;
		if (debug_deployment) console.log("🔨 [debug] [hasUpdateAvailable] Deployed version collapsed: " + collapsed);
		return collapsed;
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
			// the hash and the envelope (owner id) are not logged (quick 261004-l8k)
			available_hash = envelope.env_hash;
		}

		return available_hash;
	}

	parseDeviceVersion(deviceVersion) {
		if (typeof (deviceVersion) === "undefined" || deviceVersion === null) {
			deviceVersion = "0.0.1";
		}
		if (typeof (deviceVersion) !== "string") deviceVersion = String(deviceVersion);
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
			console.log("☣️ [error] deployment.js: No deploy path for owner");
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

		// Calls back exactly once (quick 261004-liv): a failure loading the plugins answers [],
		// a throwing callback is logged, never re-invoked with [] (that second call used to
		// escape the chain as an unhandled rejection).
		(async () => manager.loadFromConfig('./lib/thinx/plugins/plugins.json'))()
			.then(() => manager.extensions())
			.catch((e) => {
				console.log(`☣️ [error] [deployment] loading plugin extensions failed (${e.code || e.name})`);
				return [];
			})
			.then((extensions) => callback(extensions))
			.catch((e) => {
				console.log(`☣️ [error] [deployment] supportedExtensions callback failed (${e.code || e.name})`);
			});
	}

	// Sink-level guard (quick 261004-l8k): a udid that fails sanitka.udid, or an owner that
	// fails sanitka.owner, answers callback(false) before any path is built or any file is
	// touched. Log lines carry the udid only, never the owner id or the deploy path.
	latestFirmwarePath(in_owner, in_udid, callback) {
		if (!Util.isDefined(in_owner) || !Util.isDefined(in_udid) || typeOf(in_owner) == "object") {
			console.log("☣️ [error] invalid LFP owner or udid");
			callback(false);
			return;
		}
		const udid = sanitka.udid(in_udid);
		const owner = sanitka.owner(in_owner);
		if (!udid || !owner) {
			console.log("☣️ [error] invalid LFP owner or udid");
			callback(false);
			return;
		}
		var latest_firmware = false;
		var dpath = Filez.deployPathForDevice(owner, udid);
		var fpath = dpath + "/build.json";
		if (!fs.existsSync(fpath)) { // lgtm [js/path-injection]
			console.log(`☣️ [error] Envelope for udid ${udid} not found.`);
			callback(false);
			return;
		}
		this.supportedExtensions((extensions) => {
			console.log("ℹ️ [info] supported extensions", extensions);
			// Each extension value ('*.bin'), not its index (quick 261004-liv); the newest
			// matching file across all extensions wins, not the last extension with matches.
			let candidates = [];
			for (const extension of extensions) {
				candidates = candidates.concat(findFilesSync(dpath, extension, false));
			}
			if (candidates.length > 0) {
				latest_firmware = this.latestFile(candidates);
			}
			callback(latest_firmware);
		});
	}

	latestFirmwareArtifact(owner, in_udid) {
		const udid = sanitka.udid(in_udid); // quick 261004-l8k
		if (!udid) return false;
		var dpath = Filez.deployPathForDevice(owner, udid);
		var files = findFilesSync(dpath, "*.zip", false);
		if (files.length === 0) return false; // no artifacts — avoid latestFile statSync(undefined)
		return this.latestFile(files);
	}

	artifact(owner, in_udid, in_build_id) {
		// quick 261004-l8k: both path parts must be udid-shaped (router.build sanitizes the
		// same way); nothing is built or read otherwise, and no log line carries the path.
		const udid = sanitka.udid(in_udid);
		const build_id = sanitka.udid(in_build_id);
		if (!udid || !build_id) return null;
		var fpath = `${Filez.deployPathForDevice(owner, udid)}/${build_id}/${build_id}.zip`;
		let data = null;
		if (fs.existsSync(fpath)) {
			try {
				data = fs.readFileSync(fpath);
			} catch (e) {
				console.log(`☣️ [error] reading artifact ${build_id} failed (${e.code || e.name})`);
			}
		} else {
			console.log(`[warning] artifact ${build_id} not found`);
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
			has = false;
		}

		if (!Util.isDefined(device.udid)) {
			console.log("☣️ [error] [validateHasUpdateAvailable] Device has no udid.");
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
		if (!semver.valid(deviceVersion)) {
			// semver.lt would throw inside check-in (quick 261004-liv)
			console.log("⚠️ [warning] [hasUpdateAvailable] Device version not comparable, no update offered.");
			return false;
		}

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

			// quick 261004-l8k: offer only when both hashes are non-empty strings and differ.
			// A missing envelope hash used to read as indexOf(null) === -1, so the same build
			// was offered on every check-in and the device reflashed forever.
			const deviceHash = device.env_hash;
			if ((typeof (deviceHash) === "string") && (deviceHash.length > 0)) {
				if (deviceHash.indexOf("cafebabe") === 0) {
					console.log("⚠️ [warning] Device has default environment, will not perform update (dev version).");
				} else {
					const availableHash = this.getAvailableEnvironmentHash(owner, device.udid);
					if ((typeof (availableHash) === "string") && (availableHash.length > 0) && (deviceHash.indexOf(availableHash) === -1)) {
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