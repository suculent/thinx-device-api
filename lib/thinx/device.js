/** This THiNX Device Management API module is responsible for managing devices. */

let Globals = require("./globals.js");

let app_config = Globals.app_config();
let prefix = Globals.prefix();

let fs = require("fs-extra");

// deepcode ignore HttpToHttps: support legacy devices in Device API
let http = require('http');
let https = require('https');

let md5 = require('md5');
let debug_device = app_config.debug.device || true;

const Database = require("./database.js");
let db_uri = new Database().uri();
let devicelib = require("./couch")(db_uri).use(prefix + "managed_devices");
let userlib = require("./couch")(db_uri).use(prefix + "managed_users");
let sha256 = require("sha256");
let Sanitka = require("./sanitka"); let sanitka = new Sanitka();

const { v1: uuidV1 } = require('uuid');

const base64 = require("base-64");
const momentTz = require("moment-timezone");
const crypto = require('crypto');

const Auth = require('./auth'); 
const Audit = require('./audit'); let alog = new Audit();
const Deployment = require('./deployment'); let deploy = new Deployment();
const ApiKey = require("./apikey"); 
const Owner = require("./owner");

const ACL = require('./acl');

const InfluxConnector = require('./influx');
const EventTaxonomy = require('./event_taxonomy.js');
const Util = require("./util.js");
const logger = require("./logger.js");

// Transformer service (quick 261004-rdf). The swarm runs it as service `transformer` on the
// `internal` network, listening on 7474 (docker-swarm.yml). TRANSFORMER_URL overrides the target;
// ENVIRONMENT=test keeps the old local target (localhost:<app_config.lambda>, 7475 when unset).
// Parsed once, here; only http/https without credentials is accepted, anything else disables
// transformers (each run then logs transformer_target_invalid).
const TRANSFORMER_DEFAULT_URL = "http://transformer:7474";
const TRANSFORMER_MAX_RESPONSE = 65536;
const TRANSFORMER_MAX_STATUS = 1024;
// Rejections services/transformer/transformer.js answers in `output` (its `error` field is
// always "transformer_error" outside ENVIRONMENT=test, so it cannot tell success from failure).
const TRANSFORMER_REJECTIONS = ["child process not allowed", "lambda function missing"];

function transformerTarget(env, config) {
	const e = ((typeof (env) === "object") && (env !== null)) ? env : {};
	const c = ((typeof (config) === "object") && (config !== null)) ? config : {};
	let raw;
	if ((typeof (e.TRANSFORMER_URL) === "string") && (e.TRANSFORMER_URL.trim() !== "")) {
		raw = e.TRANSFORMER_URL.trim();
	} else if (e.ENVIRONMENT === "test") {
		raw = "http://localhost:" + ((typeof (c.lambda) === "undefined") ? 7475 : c.lambda);
	} else {
		raw = TRANSFORMER_DEFAULT_URL;
	}
	let url;
	try {
		url = new URL(raw);
	} catch (_err) {
		return null;
	}
	if ((url.protocol !== "http:") && (url.protocol !== "https:")) return null;
	if ((url.hostname === "") || (url.username !== "") || (url.password !== "")) return null;
	return {
		protocol: url.protocol,
		hostname: url.hostname.replace(/^\[(.*)\]$/, "$1"),
		port: (url.port === "") ? undefined : parseInt(url.port, 10),
		path: url.pathname.replace(/\/+$/, "") + "/do"
	};
}

const TRANSFORMER_TARGET = transformerTarget(process.env, app_config);
if (TRANSFORMER_TARGET === null) {
	console.log("⚠️ [warning] [transformer] TRANSFORMER_URL is not an http(s) URL; transformers will not run");
}

function recordStatsEvent(owner, event, data) {
	const safeOwner = Util.isDefined(owner) ? owner : "0";
	const detail = Util.isDefined(data) ? " " + data : "";
	logger.warn(`[OID:${safeOwner}] [${event}]${detail}`);
	InfluxConnector.statsLog(safeOwner, event, data);
}

module.exports = class Device {

	constructor(redis) {
		if (typeof(redis) === "undefined") throw new Error("Device now requires connected redis.");
		this.redis = redis;
		this.auth = new Auth(redis);
		this.owner =  new Owner(redis);
		this.apikey = new ApiKey(redis);
	}

	/**
	 * Stores a One-Time-Token record of exactly {owner, udid} under ott:<token> for 24 h
	 * (quick 261003-v9x). The token is 32 random bytes, hex-encoded (the same 64-char
	 * shape firmware already uses in /device/firmware?ott=), written with one SET ... EX.
	 *
	 * Validates the binding's shape only: callers must already have proven that the owner
	 * owns the udid (ott_request: fetchOwned; register path: the checked-in document).
	 * Calls back (true, {ott}), (false, "OTT_BINDING_INVALID") or (false, "OTT_STORE_FAILED").
	 */
	storeOTT(binding, callback) {
		if ((typeof (binding) !== "object") || (binding === null)) return callback(false, "OTT_BINDING_INVALID");
		const owner = (typeof (binding.owner) === "string") ? sanitka.owner(binding.owner) : null;
		const udid = sanitka.udid(binding.udid);
		if (!owner || !udid) return callback(false, "OTT_BINDING_INVALID");
		const new_ott = crypto.randomBytes(32).toString("hex");
		const record = JSON.stringify({ owner: owner, udid: udid });
		this.redis.set("ott:" + new_ott, record, "EX", 86400, (error) => {
			if (error) {
				console.log("⚠️ [warning] [ott] storing a token failed for udid", udid);
				return callback(false, "OTT_STORE_FAILED");
			}
			callback(true, { ott: new_ott });
		});
	}

	normalizedMAC(mac_addr) {
		if ((typeof (mac_addr) !== "string") || (mac_addr === "")) {
			return null;
		}
		let retval = mac_addr.toUpperCase();
		if (retval.length != 17) {
			let ms;
			ms = retval.replace(/:/g, "");
			retval = "";
			let m = ms.split("");
			for (let step = 0; step <= m.length - 2; step += 2) {
				retval += m[step].toString();
				if (typeof (m[step + 1]) !== "undefined") {
					retval += m[step + 1].toString();
				}
				// add ":" of this is not last step
				if (step < m.length - 2) {
					retval += ":";
				}
			}
		}
		return retval;
	}

	// called from `firmware` and `ott_update`
	// Fails closed (quick 261004-liv): answers callback(false) exactly once instead of
	// throwing or never answering. The multi-file branch (update_multiple) has never
	// worked — it reads platforms/descriptor.json, which does not exist, and readdirSync()s
	// the firmware.bin path — so for nodemcu/micropython/mongoose/nodejs it answers false.
	updateFromPath(path, ott, callback) {

		// Arduino: single *.bin file only
		// Platformio: single *.bin file only
		// Lua: init.lua, config.lua (will deprecate in favor of thinx.json), thinx.lua
		// Micropython: boot.py, thinx.py, thinx.json, optionally other *.pys and data within the directory structure
		// MongooseOS: to be evaluated, should support both

		let answered = false;
		const answer = (...args) => {
			if (answered) return;
			answered = true;
			if (typeof (callback) === "function") callback(...args);
		};

		if (!Util.isDefined(path)) {
			console.log("🚫  [critical] update path must be defined");
			return answer(false);
		}

		if (path.indexOf("/") === path.length) {
			console.log("🚫  [critical] [not-implemented] Trailing slash detected. This should be a multi-file update.");
			return answer(false);
		}

		let deploy_path = path.substring(0, path.lastIndexOf("/"));
		let envelope = null;
		try {
			envelope = JSON.parse(fs.readFileSync(deploy_path + "/build.json"));
		} catch (e) {
			console.log(`☣️ [error] [update] build envelope unreadable (${e.code || e.name})`);
			return answer(false);
		}
		if ((typeof (envelope) !== "object") || (envelope === null)) {
			console.log("☣️ [error] [update] build envelope is not an object");
			return answer(false);
		}
		let platform = envelope.platform;

		let firmware_path = deploy_path + "/firmware.bin";

		if (platform === "arduino" || platform === "platformio" || (platform === "pine64")) {
			this.update_binary(firmware_path, ott, answer);

		} else if ((platform === "nodemcu") || (platform === "micropython") || (platform === "mongoose") || (platform === "nodejs")) {
			console.log("⚠️ [warning] Multi-file update for " + platform + " not yet fully supported.");
			try {
				this.update_multiple(firmware_path, answer);
			} catch (e) {
				console.log(`☣️ [error] [update] multi-file update for ${platform} failed (${e.code || e.name})`);
			}
			answer(false); // no-op when update_multiple already answered

		} else {
			console.log("⚠️ [warning] Firmware update for " + platform + " not yet supported.");
			answer(false);
		}
	}

	update_multiple(path, callback) {

		let artifact_filenames = [];

		// Fetch header name and language type
		let platforms_path = __dirname + "/../../platforms";
		console.log("Reading from " + platforms_path + "/descriptor.json");
		let platform_descriptor = JSON.parse(fs.readFileSync(platforms_path + "/descriptor.json"));
		let header_file_name = platform_descriptor.header;
		if (typeof (header_file_name) !== "undefined") {
			if (fs.existsSync(header_file_name)) {
				artifact_filenames.push(header_file_name);
			}
		}

		let extensions = __dirname + "/../../languages/" + platform_descriptor.language + "/descriptor.json";

		console.log("Reading from extensions " + extensions);

		// Match all files with those extensions + header
		let all_files = fs.readdirSync(path);

		let updated_files = [];
		for (let findex in artifact_filenames) {
			let file = all_files[findex];
			for (let xindex in extensions) {
				if ((file.indexOf(extensions[xindex]) !== -1) || (file.indexOf(header_file_name) !== -1)) {
					updated_files.push(file);
				}
			}
		}

		let buffer = {};
		buffer.type = "file";
		buffer.files = [];

		for (let aindex in updated_files) {
			let apath = path + "/" + updated_files[aindex];
			let descriptor = {
				name: updated_files[aindex],
				data: fs.readFileSync(apath)
			};
			buffer.files.push(descriptor);
		}

		// Respond with json containing all the files...
		// Callback may not be defined in case of some CircleCI tests.
		if (typeof (callback) !== "undefined" && callback !== null) {
			callback(true, buffer);
		}
	}

	// `_ott` is kept for the updateFromPath signature only: the token lifetime belongs to
	// ott_update alone (quick 261003-v9x), so serving a binary never touches Redis.
	update_binary(path, _ott, upload_callback) {

		// In case this receives JSON file, it would return the JSON instead of binary causing boot-loop!
		console.log("ℹ️ [info] [update] reading the firmware binary");
		let buffer;

		if (path.indexOf(".json") !== -1) {
			console.log("🚫  [critical] Developer Error: sending JSON Envelope instead of path to Firmware Binary to the update_binary() function!");
			return upload_callback(false);
		}

		try {
			buffer = fs.readFileSync(path);

			if (buffer.length < 1000) {
				console.log("⚠️ [warning] Input file too short for a firmware, skipping (" + buffer.length + ")");
				return upload_callback(false);
			}
			if (typeof (upload_callback) !== "undefined" && upload_callback !== null) {
				console.log("ℹ️ [info] Sending firmware update (" + buffer.length + ")");
				upload_callback(true, {
					// deepcode ignore InsecureHash: required 
					md5: md5(buffer),
					filesize: buffer.length,
					payload: buffer
				});
			}
		} catch (e) {
			console.log(`☣️ [error] [update] serving the firmware binary failed (${e.code || e.name})`);
			if (typeof (upload_callback) !== "undefined" && upload_callback !== null) {
				upload_callback(false);
			}
		}
	}

	update_device_and_respond(udid, device, callback, reg, res) {

		delete device._rev;
		delete device.doc;
		delete device.value;
		// The `devices`/`modify` update handler flat-merges the request body's
		// top-level fields onto the doc. Passing `{ changes: device }` therefore
		// wrote a nested `doc.changes` blob and never updated the real top-level
		// fields (lastupdate/status/version) the console reads — so devices showed
		// a stale "last connected". Pass the device flat (matches every other
		// atomic("devices","modify",…) caller) and drop the legacy nested cruft.
		delete device.changes;

		devicelib.atomic("devices", "modify", udid, device, (error, /* body */) => {

			if (error) {
				console.log(`☣️ [error] [device] device_update_failed (${Device.errorCode(error)}), udid ${sanitka.udid(udid) || "-"}`);
				if (callback !== null) {
					return callback(res, false, {
						registration: {
							success: false,
							response: "device_update_failed"
						}
					});
				}
			}

			let alias_or_null = device.alias;
			let alias_or_owner = device.owner;

			let registration_response = {
				registration: {
					success: true,
					status: "OK",
					auto_update: device.auto_update,
					owner: alias_or_owner,
					alias: alias_or_null,
					mesh_ids: device.mesh_ids,
					udid: udid
				}
			};

			registration_response.registration.timestamp = Math.floor(new Date() / 1000);

			//
			// Firmware update check
			//

			let update = false;

			if (device.auto_update) {
				update = deploy.hasUpdateAvailable(device);
			}

			if (update === false) {

				if (device.auto_update) {
					console.log(`ℹ️ [info] Device ${udid} has no newer firmware available.`);
				} else {
					console.log(`ℹ️ [info] Device ${udid} has auto-update disabled.`);
				}

				if (Util.isDefined(callback)) callback(res, true, registration_response);

			} else {

				console.log(`ℹ️ [info] Device ${udid} has update available and enabled.`);

				// The token is bound to the device that just checked in (its owner and the udid
				// written above), never to the registration body: a body udid must not steer
				// redemption to another owner's firmware (quick 261003-v9x).
				this.storeOTT({ owner: device.owner, udid: udid }, (stored, result) => {

					if (stored !== true) {
						console.log(`⚠️ [warning] [ott] no update token for udid ${udid}: ${result}; answering status OK`);
						if (Util.isDefined(callback)) callback(res, true, registration_response);
						return;
					}

					registration_response.registration.ott = result.ott;

					let firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(device.owner, udid);

					let rmac = firmwareUpdateDescriptor.mac || device.mac;
					if (typeof (rmac) === "undefined") {
						console.log("☣️ [error] Missing MAC in device.js:491");
						return;
					}
					registration_response.registration.alias = alias_or_null;
					registration_response.registration.auto_update = update;
					registration_response.registration.status = "FIRMWARE_UPDATE";
					registration_response.registration.mac = this.normalizedMAC(rmac); // Legacy means to validate firmware without DevSec and Signing
					registration_response.registration.version = firmwareUpdateDescriptor.version;

					// cleanup update response to make it shorter
					delete registration_response.registration.owner;
					delete registration_response.registration.success;

					console.log(`ℹ️ [info] registration_response for udid ${udid}: status ${registration_response.registration.status}, version ${registration_response.registration.version}`);

					if (Util.isDefined(callback)) callback(res, true, JSON.stringify(registration_response));
				}); // store

			} // else

		}); // atomic
	}

	markUserBuildGoal(profile, device, res, callback) {

		let goals = profile.info.goals || [];
		let changed = false;

		if (!goals.includes('update')) {
			goals.push('update');
			changed = true;
		}

		if (!goals.includes('build')) {
			goals.push('build');
			changed = true;
		}

		// allow final goal leading to full CI device management
		if (changed) {
			userlib.atomic("users", "edit", device.owner, {
				"info": {
					"goals": goals
				}
			}, (error, /* body */) => {
				if (error) {
					console.log(`☣️ [error] [checkin] build_goal_update_failed (${Device.errorCode(error)}), udid ${sanitka.udid(device.udid) || "-"}`);
					alog.log(owner, "Profile update failed.", "error");
					callback(res, false, "update_failed");
				} else {
					alog.log(device.owner, "Owner state updated.", "warning");
					callback(res, true, "updated");
				}
			});
		}
	}

	updateDeviceCheckins(device) {
		let checkins = [device.lastupdate];
		if (typeof (device.checkins) === "undefined") {
			device.checkins = checkins;
		} else {
			checkins = device.checkins.slice(-10);
			checkins.push(device.lastupdate);
			device.checkins = checkins.slice(-100); // store last 10 checkins only
		}
		return device;
	}

	updateDeviceSigfoxDeprecated(reg, device) {
		// status, snr, rssi, station
		device.snr = null;
		device.rssi = null;
		device.station = null;

		if (Util.isDefined(reg.status)) device.status = reg.status;
		if (Util.isDefined(reg.snr)) device.snr = reg.snr;
		if (Util.isDefined(reg.rssi)) device.rssi = reg.rssi;
		if (Util.isDefined(reg.station)) device.station = reg.station;

		return device;
	}

	updateDeviceDataWithRegistration(reg, device) {

		device = this.updateDeviceCheckins(device);
		device = this.updateDeviceSigfoxDeprecated(reg, device);

		// version from device overrides server
		if (Util.isDefined(reg.version)) device.version = reg.version;

		// env_hash from device overrides server
		if (Util.isDefined(reg.env_hash)) device.env_hash = reg.env_hash;

		// push from device overrides server
		if (Util.isDefined(reg.push)) device.push = reg.push;

		// name from server overrides device
		if (Util.isDefined(reg.alias)) {
			if (!Util.isDefined(device.alias)) device.alias = reg.alias;
		}

		// platform may change under same MCU
		if (Util.isDefined(reg.platform)) device.platform = reg.platform;

		// Location
		if (Util.isDefined(reg.lat)) device.lat = reg.lat;
		if (Util.isDefined(reg.lon)) device.lon = reg.lon;

		// IV Compatibility
		/* Adds AES IV for devices that do not have one yet. */
		if (!Util.isDefined(device.iv)) device.iv = crypto.randomBytes(16).toString('base64');
		if (!Util.isDefined(device.aes_key)) device.aes_key = crypto.randomBytes(32).toString('base64');

		// DevSec compatibility
		if (Util.isDefined(reg.fcid)) device.fcid = reg.fcid;

		return device;
	}

	checkinExistingDevice(device, reg, api_key, res, callback) {

		// Refresh MQTT credentials on successful registration (requires plugin-based authentication Redis/GoAuth)
		this.authorize_mqtt(api_key, device);

		this.owner.profile(device.owner, (status, profile) => {

			if (status === false) {
				console.log("WARNING! Failed to fetch device owner profile in device checkin! Transformers will not work.");
			}

			recordStatsEvent(reg.owner, EventTaxonomy.NAMES.DEVICE_CHECKIN, sanitka.udid(reg.udid));
			// Override/update last checkin timestamp
			device.lastupdate = new Date();
			// The key that just verified this check-in (quick 261003-u86): lastkey identifies
			// the device's API key when the device is transferred.
			device.lastkey = sha256(api_key);

			// firmware from device overrides server data
			if (typeof (reg.firmware) !== "undefined" && reg.firmware !== null) {

				// validate firmware against latest firmware envelope
				let envelope = deploy.latestFirmwareEnvelope(device.owner, device.udid);

				// mark build goal if success
				if ((typeof (envelope) !== "undefined") && (typeof (envelope.firmware) !== "undefined")) {
					const reg_f_array = reg.firmware.split(":");
					if (envelope.firmware.indexOf(reg_f_array[0]) == 0) {
						this.markUserBuildGoal(profile, device, res, callback);
					}
				}
				device.firmware = reg.firmware;
			}

			device = this.updateDeviceDataWithRegistration(reg, device, callback);

			// Legacy SigFox Support
			// in case there is no status, this is an downlink request and should provide
			// response for this device

			if ((typeof (reg.ack) !== "undefined")) {
				// quick 261004-sdv: never the downlink data (device status), MAC or body
				console.log(`ℹ️ [info] [checkin] sigfox_downlink, udid ${sanitka.udid(device.udid) || "-"}`);
				const downlinkdata = device.status.toString('hex').substring(0, 16);
				let downlinkResponse = {};
				let deviceID = reg.mac.replace("SIGFOX", "");
				downlinkResponse[deviceID] = {
					'downlinkData': downlinkdata
				};
				callback(res, true, downlinkResponse); // success = true
				callback = null;
			} else {
				// quick 261004-sdv: never the registration body (owner id, MAC, status, env_hash, push)
				console.log(`ℹ️ [info] [checkin] existing_device, udid ${sanitka.udid(device.udid) || "-"}`);
			} // COPY B

			//
			// UDID Dance
			//

			let udid;

			if (typeof (device._id) === "undefined") {
				console.log("Existing device should have in ID!");
			}

			if (typeof (reg.udid) !== "undefined") {
				udid = sanitka.udid(reg.udid);
			}

			if (typeof (device._id) !== "undefined") {
				udid = device._id;
			}

			if (typeof (udid) === "undefined") {
				console.log("UDID must be given, exiting");
				callback(res, false, "udid_atomic_error");
			}

			// Status Transformers

			this.runDeviceTransformers(profile, device, callback, reg, res);

		}); // profile

	} // checkin

	/**
	 * Builds the transformer job list for a device (quick 261004-rdf): one job per utid in
	 * device.transformers that the owner profile defines, in device order, each carrying the
	 * base64-decoded code and params {status, device}. The device copy never carries lastkey
	 * (quick 261003-u86). A profile without info.transformers, a falsy input status or a body
	 * that does not decode yields no job for it; nothing here throws or logs the code.
	 */
	transformerJobs(profile, device, input_status) {
		const jobs = [];
		if (!input_status) return jobs;
		const utids = Device.listValues(device.transformers);
		const info = ((typeof (profile) === "object") && (profile !== null)) ? profile.info : null;
		const defs = ((typeof (info) === "object") && (info !== null)) ? Device.listValues(info.transformers) : [];
		if ((utids.length === 0) || (defs.length === 0)) return jobs;
		const udid_label = sanitka.udid(device.udid) || "-";
		for (const utid of utids) {
			for (const descriptor of defs) {
				if ((typeof (descriptor) !== "object") || (descriptor === null) || (descriptor.utid != utid)) continue;
				let code = null;
				try {
					if (typeof (descriptor.body) === "string") code = base64.decode(descriptor.body);
				} catch (_e) {
					code = null;
				}
				if (typeof (code) !== "string" || code.length === 0) {
					console.log(`⚠️ [warning] [transformer] skipped: transformer_decode_failed, udid ${udid_label}`);
					continue;
				}
				// mask private data on a copy: the device object itself is saved after
				// the job and must keep its lastkey (quick 261003-u86)
				const job_device = Object.assign({}, device);
				delete job_device.lastkey;
				jobs.push({
					id: "jsid:" + new Date().getTime(),
					owner: device.owner,
					codename: descriptor.alias,
					code: code,
					params: {
						status: input_status,
						device: job_device
					}
				});
			}
		}
		return jobs;
	}

	static transformerTarget(env, config) {
		return transformerTarget(env, config);
	}

	/**
	 * Interprets a transformer service answer (quick 261004-rdf): {ok: true, status} or
	 * {ok: false, reason}. Accepts HTTP 200 with a JSON object carrying `output`; numbers and
	 * booleans become strings, other non-strings, over-long strings and the service's own
	 * rejection texts are refused.
	 */
	static transformerResult(status_code, buffer) {
		if (status_code !== 200) return { ok: false, reason: "transformer_http_error" };
		let body;
		try {
			body = JSON.parse(Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer));
		} catch (_e) {
			return { ok: false, reason: "transformer_bad_response" };
		}
		if ((typeof (body) !== "object") || (body === null) || Array.isArray(body)) {
			return { ok: false, reason: "transformer_bad_response" };
		}
		if ((body.success === false) || !Object.prototype.hasOwnProperty.call(body, "output")) {
			return { ok: false, reason: "transformer_rejected" };
		}
		if ((typeof (body.error) !== "undefined") && (body.error !== null) && (body.error !== "transformer_error")) {
			return { ok: false, reason: "transformer_rejected" };
		}
		let output = body.output;
		if (((typeof (output) === "number") && Number.isFinite(output)) || (typeof (output) === "boolean")) {
			output = String(output);
		}
		if ((typeof (output) !== "string") || (output.length > TRANSFORMER_MAX_STATUS)) {
			return { ok: false, reason: "transformer_output_invalid" };
		}
		if (TRANSFORMER_REJECTIONS.indexOf(output) !== -1) return { ok: false, reason: "transformer_rejected" };
		return { ok: true, status: output };
	}

	static listValues(value) {
		if (Array.isArray(value)) return value;
		if ((typeof (value) === "object") && (value !== null)) return Object.values(value);
		return [];
	}

	/**
	 * Posts the jobs to the transformer service (POST <target>/do, body {jobs, device}; see
	 * services/transformer/transformer.js) and calls back exactly once:
	 * (true, transformed_status) or (false, reason_code, error_code_or_null).
	 * The target is TRANSFORMER_TARGET, parsed once at module load. The request is aborted
	 * after Device.transformerTimeoutMs; the response is capped at TRANSFORMER_MAX_RESPONSE.
	 */
	postTransformerJobs(jobs, device, done) {
		if (TRANSFORMER_TARGET === null) return done(false, "transformer_target_invalid", null);

		const body = JSON.stringify({
			jobs: jobs,
			device: (typeof (device.udid) === "string") ? device.udid : null
		});

		let settled = false;
		let timer = null;
		let req = null;
		const finish = (ok, result, code) => {
			if (settled) return;
			settled = true;
			if (timer !== null) clearTimeout(timer);
			done(ok, result, code || null);
		};

		const transport = (TRANSFORMER_TARGET.protocol === "https:") ? https : http;
		const options = {
			protocol: TRANSFORMER_TARGET.protocol,
			hostname: TRANSFORMER_TARGET.hostname,
			port: TRANSFORMER_TARGET.port,
			path: TRANSFORMER_TARGET.path,
			method: 'POST',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body),
				'Origin': 'api'
			}
		};

		// TODO: From HTTP transformer communication to some kind of secure comms (It would require self-signed certificate with only public part available to the transformer for validation)
		// Otherwise this is not an issue inside controlled network perimeter (swarm network `internal`).
		try {
			req = transport.request(options, (_res) => {
				const chunks = [];
				let size = 0;
				_res.on('data', (chunk) => {
					if (settled) return;
					size += chunk.length;
					if (size > TRANSFORMER_MAX_RESPONSE) {
						finish(false, "transformer_bad_response", null);
						req.destroy();
						return;
					}
					chunks.push(chunk);
				});
				_res.on('end', () => {
					const result = Device.transformerResult(_res.statusCode, Buffer.concat(chunks));
					finish(result.ok, result.ok ? result.status : result.reason, null);
				});
				_res.on('error', (e) => finish(false, "transformer_unreachable", Device.errorCode(e)));
			});
		} catch (e) {
			return finish(false, "transformer_target_invalid", Device.errorCode(e));
		}

		timer = setTimeout(() => {
			finish(false, "transformer_timeout", null);
			req.destroy();
		}, Device.transformerTimeoutMs);

		req.on('error', (e) => finish(false, "transformer_unreachable", Device.errorCode(e)));
		req.end(body);
	}

	/**
	 * Re-reads the device and writes only {status} (quick 261004-rdf), so a transformer run
	 * without a check-in (POST /api/transformer/run, MQTT) never writes back a document read
	 * before a concurrent edit. Skips the write when the device is gone, changed owner, or its
	 * stored status is no longer the one that was transformed (a newer status arrived).
	 * Calls back (true) or (false, reason_code).
	 */
	patchTransformedStatus(device, input_status, new_status, done) {
		const udid = device.udid;
		devicelib.get(udid, (error, existing) => {
			if (error || (typeof (existing) !== "object") || (existing === null) || (existing.owner !== device.owner)) {
				return done(false, "device_not_found");
			}
			if (existing.status !== input_status) return done(false, "status_changed");
			devicelib.atomic("devices", "modify", udid, { status: new_status }, (atomic_error) => {
				if (atomic_error) return done(false, "status_update_failed", Device.errorCode(atomic_error));
				done(true);
			});
		});
	}

	/**
	 * Runs the device's status transformers (quick 261004-rdf). Call shapes:
	 * - HTTP check-in (checkinExistingDevice): reg is the registration, callback answers the
	 *   device. The check-in is always persisted and answered once through
	 *   update_device_and_respond, with device.status set to the transformer result when one
	 *   arrives; without transformers this is exactly the old path.
	 * - No check-in (run_transformers: reg null, callback answers the owner; MQTT: reg,
	 *   callback and res null): nothing is written without a result; a result is patched as
	 *   {status} only (patchTransformedStatus). A callback, when given, is called once.
	 * A failure, timeout or skipped write leaves status untouched and logs one reason line
	 * with the udid only.
	 */
	runDeviceTransformers(profile, device, callback, reg, res) {

		const has_reg = (typeof (reg) === "object") && (reg !== null);
		const answer = (success, response) => {
			if (typeof (callback) === "function") callback(res, success, response);
		};

		if ((typeof (device) !== "object") || (device === null)) return answer(false, "no_such_device");

		const udid_label = sanitka.udid(device.udid) || "-";
		const input_status = (has_reg && Util.isDefined(reg.status)) ? reg.status : device.status;
		const jobs = this.transformerJobs(profile, device, input_status);

		if (jobs.length === 0) {
			if (has_reg) return this.update_device_and_respond(device.udid, device, callback, reg, res);
			return answer(true, "no_transformers");
		}

		const not_applied = (reason, code) => {
			console.log(`⚠️ [warning] [transformer] not applied: ${reason}${code ? " (" + code + ")" : ""}, udid ${udid_label}`);
		};

		this.postTransformerJobs(jobs, device, (ok, result, code) => {

			if (has_reg) {
				if (ok) {
					device.status = result;
					console.log(`ℹ️ [info] [transformer] applied ${jobs.length} job(s), udid ${udid_label}`);
				} else {
					not_applied(result, code);
				}
				return this.update_device_and_respond(device.udid, device, callback, reg, res);
			}

			if (!ok) {
				not_applied(result, code);
				return answer(false, result);
			}

			this.patchTransformedStatus(device, input_status, result, (patched, reason, patch_code) => {
				if (!patched) {
					not_applied(reason, patch_code);
					return answer(false, reason);
				}
				console.log(`ℹ️ [info] [transformer] applied ${jobs.length} job(s), udid ${udid_label}`);
				answer(true, "status_transformed");
			});
		});
	}

	fetchOTT(ott, callback) {
		this.redis.get("ott:" + ott, (error, json_keys) => {
			callback(json_keys ? null : true, json_keys);
		});
	}

	/**
	 * Push token registration (POST /device/addpush, quick 261003-v9d). Writes `push` only when
	 * the body names an owner (`reg.owner`), `api_key` verifies for that owner (APIKey#verify,
	 * 4-argument form: exact match, no transfer redirect, no binding consumption) and the udid
	 * is that owner's device (fetchOwned). Any key of the owner is accepted (no lastkey
	 * binding, as on check-in); lastkey and every other body field are never written.
	 * Answers: "authentication" (key/owner, decided before any device lookup),
	 * "push_device_not_found" (malformed, unknown or foreign udid, lookup error; identical),
	 * "push_token_not_registered" (write failed), "push_token_registered".
	 * Log lines name the sanitized udid only, never the key, the push token or the body.
	 */
	push(reg, api_key, callback) {

		if ((typeof (reg) !== "object") || (reg === null)) {
			return callback(false, "no_push_info");
		}

		const udid = sanitka.udid(reg.udid);
		const udid_label = (udid === null) ? "invalid" : udid;

		const refuse = (category, response) => {
			console.log(`ℹ️ [info] [push] refused ${category} for udid ${udid_label}`);
			callback(false, response);
		};

		// Headers must contain Authentication header
		if ((typeof (api_key) !== "string") || (api_key.length === 0)) {
			return refuse("no_key", "authentication");
		}

		if (typeof (reg.push) !== "string") {
			return callback(false, "invalid_type_" + typeof (reg.push));
		}
		const push = reg.push;

		console.log(`• Push Registration for udid ${udid_label}`);

		// The request must name the owner its key belongs to.
		if ((typeof (reg.owner) === "undefined") || (reg.owner === null)) {
			return refuse("no_owner", "authentication");
		}
		if (typeof (reg.owner) !== "string") {
			return refuse("invalid_owner", "authentication");
		}
		const owner = sanitka.owner(reg.owner);
		if (owner === null) {
			return refuse("invalid_owner", "authentication");
		}

		this.apikey.verify(owner, api_key, true, (success) => {
			if (success !== true) return refuse("key", "authentication");
			if (udid === null) return refuse("udid", "push_device_not_found");
			this.fetchOwned(udid, owner, (owned) => {
				if (owned !== true) return refuse("udid", "push_device_not_found");
				this.edit({ udid: udid, push: push }, (written) => {
					if (written !== true) return refuse("write", "push_token_not_registered");
					callback(true, "push_token_registered");
				});
			});
		});
	}

	authorize_mqtt(api_key, device) {

		let udid = device.udid;
		this.auth.add_mqtt_credentials(udid, api_key, () => {
			// Load/create ACL file
			let acl = new ACL(this.redis, udid);
			acl.load(() => {

				let device_topic = "/" + device.owner + "/" + udid; // device topic
				let status_topic = "/" + device.owner + "/" + udid + "/status"; // device status topic
				let shared_topic = "/" + device.owner + "/shared/#"; // owner shared topics

				acl.addTopic(udid, "readwrite", device_topic);
				acl.addTopic(udid, "readwrite", shared_topic);
				acl.addTopic(udid, "readwrite", status_topic);

				if (typeof (device.mesh_ids) !== "undefined") {
					for (let mindex in device.mesh_ids) {
						let id = device.mesh_ids[mindex];
						if (id !== null) {
							let mesh_topic = "/" + device.owner + "/" + id;
							acl.addTopic(udid, "readwrite", mesh_topic);
						}
					}
				}
				acl.commit();
			});
		});
	}

	register(reg, api_key, res, callback) {

		//
		// Validate input parameters
		//

		if ((typeof (reg) === "undefined") || (reg === null)) return callback(res, false, "no_registration_info");

		let rdict = {};

		rdict.registration = {};

		let mac = this.normalizedMAC(reg.mac);
		if (typeof (mac) === "undefined") {
			callback(false, "no_mac");
			console.log("Missing MAC in device.js:354");
			return;
		}
		let fw = "unknown";
		if (!Object.prototype.hasOwnProperty.call(reg, "firmware")) {
			fw = "undefined";
		} else {
			fw = reg.firmware;
		}

		// Headers must contain Authentication header
		let r_owner;
		if (typeof (api_key) === "undefined") {
			console.log("[reg] ERROR: Registration requests should require API key (unless authenticated through MQTT)!");
			if (typeof (reg.owner) === "undefined") {
				r_owner = "undefined";
			} else {
				r_owner = reg.owner;
			}
			alog.log(r_owner, "Attempt to register witout API Key!", "warning");
			console.log("☣️ [error] [register] refused: no_api_key");
			return callback(res, false, "authentication_error");
		}

		// Since 2.0.0a
		let platform = "unknown";
		if (typeof (reg.platform) !== "undefined") {
			platform = reg.platform.toLowerCase();
		}

		// Since 2.8.242
		let fcid = "000000000000";
		if (typeof (reg.fcid) !== "undefined") {
			fcid = reg.fcid.toUpperCase();
		}

		let push = reg.push;
		let alias = reg.alias;

		if (typeof (reg) !== "object") {
			return;
		}

		let registration_owner = sanitka.owner(reg.owner);
		if ((registration_owner === false) || (registration_owner === null)) {
			return callback(res, false, "invalid owner:" + reg.owner);
		}

		let version = reg.version;

		// Since 2.9.x
		let env_hash = null;
		if (typeof (reg.env_hash) !== "undefined") {
			env_hash = reg.env_hash;
		}

		let timezone_offset = 0;
		if (typeof (reg.timezone_offset) !== "undefined") {
			timezone_offset = reg.timezone_offset;
		}

		// Display label only. An abbreviation cannot be resolved back to a zone
		// (of 69 abbreviations in the console's table, 4 are valid zone names and
		// 18 map to more than one offset), so it is never used for computation.
		let timezone_abbr = "UTC";
		if (typeof (reg.timezone_abbr) === "string") {
			timezone_abbr = reg.timezone_abbr;
		}

		// IANA zone is the source of truth. Deliberately NOT defaulted to "UTC":
		// that would derive an offset of 0 and silently overwrite a client-supplied
		// timezone_offset. Absent means "unknown zone", which the read path handles
		// by falling back to the stored offset.
		let timezone_utc = null;
		if (Util.isValidTimezone(reg.timezone_utc)) {
			timezone_utc = reg.timezone_utc;
			// utcOffset() already accounts for DST, so no isDST() branch is needed.
			timezone_offset = Util.timezoneOffsetFor(timezone_utc);
		}

		if (debug_device) console.log("🔨 [debug] [device] Timezone offset: " + timezone_offset);

		this.apikey.verify(registration_owner, api_key, true, (success, message, current_owner) => {

			if (success === false) {
				// SEC: the rejected value may be another owner's real key; log a redacted prefix only.
				alog.log(registration_owner, "Attempt to use invalid API Key: " + Util.redactToken(api_key) + " on device registration.", "error");
				if (debug_device) console.log("🔨 [debug] [device] API Key verification failed!");
				return callback(res, false, message);
			}

			// A transferred device still presenting its previous owner id (quick 261003-u86):
			// it registers as its current owner, and the answer carries that owner id.
			if ((message === "transfer_redirect") && (typeof (current_owner) === "string") && (sanitka.owner(current_owner) === current_owner)) {
				registration_owner = current_owner;
				reg.owner = current_owner;
			}

			deploy.initWithOwner(registration_owner); // creates user path if does not exist

			success = false;
			let status = "OK";

			// determine device firmware version, if available
			let firmware_version = "0"; // default
			if (typeof (version) !== "undefined") {
				firmware_version = version;
			}

			let checksum = null;
			if (typeof (reg.checksum) !== "undefined") {
				checksum = reg.checksum;
			}

			let mesh_ids = [];
			// Only a valid udid is considered (absent or malformed -> null). Whether it is kept
			// is decided by resolveRegistration (quick 261003-tv5); the descriptor below is
			// re-pointed at the resolved udid before anything is written or authorized.
			const requested_udid = sanitka.udid(reg.udid);
			let udid = (requested_udid !== null) ? requested_udid : uuidV1(); // is returned to device which should immediately take over this value instead of mac for new registration

			//
			// Construct response
			//

			let response = {};

			if (
				(typeof (rdict.registration) !== "undefined") &&
				(rdict.registration !== null)
			) {
				response = rdict.registration; // reflection?
			}

			response.success = success;
			response.status = status;

			//
			// Construct device descriptor and check for firmware
			//

			let mqtt = "/" + registration_owner + "/" + udid; // lgtm [js/tainted-format-string]

			let device = {
				alias: alias,
				auto_update: false,
				checksum: checksum,
				description: "new device",
				env_hash: env_hash,
				fcid: fcid,
				firmware: fw,
				icon: "01",
				lastkey: sha256(api_key),
				lastupdate: new Date(),
				lat: 0,
				lon: 0,
				mac: mac,
				mesh_ids: mesh_ids,
				mqtt: mqtt,
				owner: registration_owner,
				platform: platform,
				push: push,
				rssi: " ",
				snr: " ",
				source: null,
				station: " ",
				status: " ",
				timezone_abbr: timezone_abbr,
				...(timezone_utc !== null && { timezone_utc: timezone_utc }),
				timezone_offset: timezone_offset,
				transformers: [],
				udid: udid,
				version: firmware_version
			};



			// KNOWN DEVICES:
			// - see if new firmware is available and reply FIRMWARE_UPDATE with url
			// - see if alias or owner changed
			// - otherwise reply just OK

			//
			// Resolve the registration target for the verified API-key owner (quick 261003-tv5):
			// the owner's own device by udid or by MAC, otherwise a new device of that owner.
			//

			this.resolveRegistration(registration_owner, requested_udid, mac, (target) => {

				if (typeof (target.checkin) !== "undefined") {
					let existing = target.checkin;
					if (typeof (existing._rev) !== "undefined") {
						delete existing._rev;
					}
					reg.udid = existing.udid;
					if (target.via === "udid") {
						if (debug_device) console.log("ℹ️ [info] Checking as existing device [1]...");
					} else {
						console.log("ℹ️ [info] Checking as existing device [2]...");
					}
					this.checkinExistingDevice(existing, reg, api_key, res, callback);
					return;
				}

				// New device of the key owner: point the descriptor (and its MQTT credential and
				// ACL) at the resolved udid, which is owned by nobody else.
				udid = target.udid;
				device.udid = udid;
				device.mqtt = "/" + registration_owner + "/" + udid; // lgtm [js/tainted-format-string]
				reg.udid = udid;

				//
				// New device
				//

				recordStatsEvent(registration_owner, EventTaxonomy.NAMES.DEVICE_NEW, udid);

				// COPY B
				// in case there is no status, this is an downlink request and should provide
				// response for this device
				//

				if ((typeof (reg.ack) !== "undefined")) {
					// quick 261004-sdv: never the registration body, MAC or downlink data
					console.log(`ℹ️ [info] [register] sigfox_downlink, udid ${sanitka.udid(udid) || "-"}`);
					let downlinkdata = device.status.toString('hex').substring(0, 16);
					let downlinkResponse = {};
					let deviceID = reg.mac.replace("SIGFOX", "");
					downlinkResponse[deviceID] = {
						'downlinkData': downlinkdata
					};
					callback(res, true, downlinkResponse);
					callback = null;
				} // COPY B

				this.authorize_mqtt(api_key, device);

				//
				// Device Data Validation
				//

				device.source = null;

				device.lastupdate = new Date();
				if (typeof (fw) !== "undefined" && fw !== null) {
					device.firmware = fw;
				}
				if (typeof (push) !== "undefined" && push !== null) {
					device.push = push;
				}
				if (typeof (alias) !== "undefined" && alias !== null) {
					device.alias = alias;
					if (device.alias == "unnamed") {
						device.alias = require('sillyname')();
					}
				} else {
					device.alias = require('sillyname')();
				}
				if (typeof (platform) !== "undefined" && platform !== null) {
					device.platform = platform;
				}

				// Env Hash

				if (typeof (reg.env_hash) !== "undefined" && reg.env_hash !== null) {
					device.env_hash = reg.env_hash;
				}

				// Extended SigFox Support

				// status, snr, rssi, station, lat, long
				if (typeof (reg.status) !== "undefined" && reg.status !== null) {
					device.status = reg.status;
				}

				if (typeof (reg.snr) !== "undefined" && reg.snr !== null) {
					device.snr = reg.snr;
				}

				if (typeof (reg.rssi) !== "undefined" && reg.rssi !== null) {
					device.rssi = reg.rssi;
				}

				if (typeof (reg.station) !== "undefined" && reg.station !== null) {
					device.station = reg.station;
				}

				// Includes

				if (typeof (reg.lat) !== "undefined" && reg.lat !== null) {
					device.lat = reg.lat;
				}

				if (typeof (reg.lon) !== "undefined" && reg.lon !== null) {
					device.lon = reg.lon;
				}

				if (typeof (reg.commit) !== "undefined" && reg.commit !== null) {
					device.commit = reg.commit;
				}

				// AES Initialization Vector
				device.iv = crypto.randomBytes(16).toString('base64');

				// Timezone

				let payload = {};

				payload.timezone = "Universal";
				payload.latitude = device.lon;
				payload.longitude = device.lat;

				// Do not overwrite latitude/longitude when set by device.
				if (typeof (device.lon) === "undefined") {
					device.lon = payload.longitude;
				}

				// Do not overwrite latitude/longitude when set by device.
				if (typeof (device.lat) === "undefined") {
					device.lat = payload.latitude;
				}

				devicelib.insert(device, udid, (create_err) => {

					if (create_err) {
						reg.success = false;
						reg.status = "Insert failed";
						console.log(`☣️ [error] [register] device_insert_failed (${Device.errorCode(create_err)}), udid ${sanitka.udid(udid) || "-"}`);
						callback(res, false, JSON.stringify(rdict));
						return;
					}

					callback(res, true, {
						registration: {
							success: true,
							owner: registration_owner,
							alias: device.alias,
							udid: udid,
							iv: device.iv,
							status: "OK",
							meshes: device.mesh_ids,
							// .unix() is a UTC epoch, so the zone is irrelevant here. Looking up an
							// abbreviation additionally logged a moment-timezone warning on every
							// registration, since abbreviations are never valid zone names.
							timestamp: momentTz().unix()
						}
					});

				}); // insert
			}); // resolveRegistration
		}, this.deviceKeyContext(reg.udid)); // verify
	}

	/**
	 * Device context for APIKey#verify (quick 261003-u86): the presenting device's udid and
	 * a lookup of its current owner id (null on any error, a missing document or an invalid
	 * owner). Used for old-owner continuity of transferred devices only.
	 */
	deviceKeyContext(udid) {
		return {
			udid: (typeof (udid) === "string") ? sanitka.udid(udid) : null,
			currentOwner: (device_udid, callback) => {
				devicelib.get(device_udid, (error, doc) => {
					if (error || (typeof (doc) !== "object") || (doc === null) || (typeof (doc.owner) !== "string")) return callback(null);
					callback(sanitka.owner(doc.owner));
				});
			}
		};
	}

	/**
	 * Registration target for the verified API-key owner (quick 261003-tv5).
	 *
	 * Operator decision: "/device/register, when it falls back to matching by MAC, should
	 * check in as a device of the api key's owner." `owner` is the owner the API key was
	 * verified for (exact match, quick 261003-s59); nothing else decides ownership here.
	 * Calls back exactly once with either {checkin: doc, via: "udid" | "mac"} or {udid}:
	 * - a valid requested udid naming the owner's own device checks in as that device;
	 * - a valid requested udid with no document (404, e.g. a revoked device registering
	 *   again) is kept as the udid of a new device;
	 * - any other requested udid (another owner's device, a lookup error, malformed or
	 *   absent) is never used; a fresh uuidV1 is the new device's udid;
	 * - then devices_by_mac rows are filtered to the owner's devices (Device.isOwnedBy);
	 *   the first owned row in view order is checked in as, otherwise a new device.
	 * Rows of other owners are only counted. No owner+MAC view is added: the devices
	 * design document is inserted create-only at boot (a new view would not reach
	 * production) and MAC collisions keep the rows to filter in memory small.
	 */
	resolveRegistration(owner, requested_udid, mac, callback) {

		const byMAC = (fallback_udid) => {
			devicelib.view("devices", "devices_by_mac", {
				key: mac,
				include_docs: true
			}, (err, body) => {
				// Fail safe: never check in on an unknown view result.
				if (err || (typeof (body) !== "object") || (body === null) || !Array.isArray(body.rows)) {
					return callback({ udid: fallback_udid });
				}
				const owned = [];
				let ignored = 0;
				for (const row of body.rows) {
					const doc = ((typeof (row) === "object") && (row !== null)) ? (row.doc || row.value) : null;
					if (Device.isOwnedBy(doc, owner) && (sanitka.udid(doc.udid) !== null)) {
						owned.push(doc);
					} else {
						ignored++;
					}
				}
				if (ignored > 0) {
					console.log(`ℹ️ [info] [register] MAC fallback ignored ${ignored} device(s) of other owners`);
				}
				if (owned.length > 0) return callback({ checkin: owned[0], via: "mac" });
				callback({ udid: fallback_udid });
			});
		};

		if (sanitka.udid(requested_udid) === null) return byMAC(uuidV1());

		devicelib.get(requested_udid, (error, doc) => {
			if (!error && Device.isOwnedBy(doc, owner)) {
				return callback({ checkin: doc, via: "udid" });
			}
			if (error && (error.statusCode === 404)) {
				return byMAC(requested_udid);
			}
			console.log(`ℹ️ [info] [register] ignoring registration udid ${requested_udid}: not the key owner's device`);
			byMAC(uuidV1());
		});
	}

	/**
	 * Issues an OTT for POST /device/firmware {use: "ott"} and for device.firmware with a
	 * body `ott` (quick 261003-v9x). Same rule as device check-in (tv5/u86) and addpush
	 * (v9d): the Authentication key must verify exactly for the owner the body names
	 * (APIKey#verify, 4-argument form, no transfer redirect), and the body udid must be
	 * that owner's device (Device#fetchOwned). Only {verified owner, owned udid} is stored.
	 * The key is not required to be the device's own key (lastkey): no device path
	 * enforces that today.
	 */
	ott_request(req, callback) {
		const raw = ((typeof (req) === "object") && (req !== null)) ? req.body : null;
		let body = ((typeof (raw) === "object") && (raw !== null)) ? raw : {};
		if ((typeof (body.registration) === "object") && (body.registration !== null)) {
			body = body.registration;
		}
		const owner = (typeof (body.owner) === "string") ? sanitka.owner(body.owner) : null;
		const headers = ((typeof (req) === "object") && (req !== null) && (typeof (req.headers) === "object") && (req.headers !== null)) ? req.headers : {};
		const api_key = headers.authentication;

		if (!owner) {
			console.log("⚠️ [warning] [ott] request refused: owner_invalid");
			return callback(false, "OTT_API_KEY_NOT_VALID");
		}

		this.apikey.verify(owner, api_key, false, (success) => {
			if (success !== true) {
				alog.log(owner, "Attempt to use invalid API Key: " + Util.redactToken(api_key) + " on OTT request.", "error");
				console.log("⚠️ [warning] [ott] request refused: api_key_not_valid");
				return callback(false, "OTT_API_KEY_NOT_VALID");
			}
			this.fetchOwned(body.udid, owner, (owned, doc) => {
				if (owned !== true) {
					console.log("⚠️ [warning] [ott] request refused: no_such_device");
					return callback(false, "no_such_device");
				}
				this.storeOTT({ owner: owner, udid: doc.udid }, (stored, result) => {
					if (stored === true) {
						console.log(`ℹ️ [info] [ott] issued for udid ${doc.udid}`);
					} else {
						console.log(`⚠️ [warning] [ott] request refused: ${result}`);
					}
					callback(stored, result);
				});
			});
		});
	}

	run_transformers(udid, transformer_owner, callback, res) {
		devicelib.get(udid, (fetch_error, device) => {
			if (fetch_error || (typeof (device) === "undefined") || (device.owner != transformer_owner)) {
				return callback(res, false, "no_such_device");
			}
			userlib.get(transformer_owner).then((profile) => {
				this.runDeviceTransformers(profile, device, callback, null, res); // no check-in: patches status only
			}, (e) => {
				console.log(`☣️ [error] [transformer] owner_profile_failed (${Device.errorCode(e)}), udid ${sanitka.udid(udid) || "-"}`);
				callback(res, false, "owner_not_found");
			});
		});
	}

	/**
	 * Redeems an OTT (GET /device/firmware?ott=, the token is the only credential;
	 * quick 261003-v9x). A malformed token never reaches Redis. The stored record must
	 * parse, its owner and udid must pass sanitka and the udid must still be owned by that
	 * owner (a transfer or revoke after issuance kills the token); otherwise the record is
	 * deleted. Only the sanitized, owned owner/udid reach the deployment lookup.
	 *
	 * Lifetime: 24 h unredeemed, then at most 3600 s after the first redemption, never
	 * extended. Reuse inside that window is deliberate: THiNXLib retries the same URL after
	 * a failed download.
	 */
	ott_update(ott, callback) {

		const refuse = (reason) => {
			console.log(`⚠️ [warning] [ott] redemption refused ${Util.redactToken(ott)}: ${reason}`);
			callback(false, reason);
		};

		if ((typeof (ott) !== "string") || !/^[a-f0-9]{64}$/.test(ott)) {
			return callback(false, "OTT_UPDATE_NOT_FOUND");
		}

		const key = "ott:" + ott;

		const drop = (reason) => {
			this.redis.del(key, (del_error) => {
				if (del_error) console.log("⚠️ [warning] [ott] deleting a refused token failed");
			});
			refuse(reason);
		};

		this.redis.get(key, (error, info) => {

			if (error || !info) return refuse("OTT_UPDATE_NOT_FOUND");

			let record = null;
			try {
				record = JSON.parse(info);
			} catch (_e) {
				record = null;
			}

			if ((typeof (record) !== "object") || (record === null)) return drop("OTT_INFO_NOT_FOUND");

			const owner = (typeof (record.owner) === "string") ? sanitka.owner(record.owner) : null;
			const udid = sanitka.udid(record.udid);

			if (!owner || !udid) return drop("OTT_INFO_NOT_FOUND");

			this.fetchOwned(udid, owner, (owned) => {

				if (owned !== true) return drop("OTT_INFO_NOT_FOUND");

				const serve = () => {
					deploy.initWithDevice({ owner: owner, udid: udid });
					deploy.latestFirmwarePath(owner, udid, (path) => {
						if (path === false || path === null || (typeof (path) === "undefined")) {
							return callback(false, "OTT_UPDATE_NOT_AVAILABLE");
						}
						this.updateFromPath(path, ott, callback);
					});
				};

				// Best effort; only ever lowers the remaining lifetime.
				this.redis.ttl(key, (ttl_error, remaining) => {
					if (ttl_error) {
						console.log("⚠️ [warning] [ott] reading the token lifetime failed");
						return serve();
					}
					const seconds = Number(remaining);
					if ((seconds === -1) || (seconds > 3600)) {
						return this.redis.expire(key, 3600, (expire_error) => {
							if (expire_error) console.log("⚠️ [warning] [ott] capping the token lifetime failed");
							serve();
						});
					}
					serve();
				});
			});
		});
	}

	firmware(req, callback) {

		let rbody = req.body;
		let api_key = req.headers.authentication;

		if (typeof (rbody.registration) !== "undefined") {
			rbody = rbody.registration;
		}

		let mac = null; // will deprecate
		let forced;
		let ott = null;

		let alias = rbody.alias;
		let env_hash = rbody.env_hash;

		let udid = sanitka.udid(rbody.udid);
		let firmware_owner = sanitka.owner(rbody.owner);

		// allow custom overrides

		// Currently supported overrides:
		// force = force update (re-install current firmware)
		// ott = return one-time URL instead of data

		if (typeof (rbody.forced) !== "undefined") {
			forced = rbody.forced;
			console.log("forced: " + forced);
		} else {
			forced = false;
		}
		if (typeof (rbody.ott) !== "undefined") {
			ott = rbody.ott;
			console.log("ℹ️ [info] [update] request carries ott " + Util.redactToken(ott));
		}

		//
		// Standard / Forced Update
		//

		if (typeof (rbody.mac) === "undefined") {
			console.log("☣️ [error] [update] request refused: missing_mac");
			callback(false, {
				success: false,
				response: "missing_mac"
			});
			return;
		}

		// Headers must contain Authentication header
		if (typeof (api_key) !== "undefined") {
			// OK
		} else {
			console.log("☣️ [error] Update requests must contain API key!");
			callback(false, {
				success: false,
				response: "authentication"
			});
			return;
		}

		this.apikey.verify(firmware_owner, api_key, false, (success, message, current_owner) => {

			// CR-01: a failed verify is final regardless of ott/forced; the old ott
			// exemption let a body with ott + forced fetch firmware with no valid key.
			if (success !== true) {
				alog.log(firmware_owner, "Attempt to use invalid API Key: " + Util.redactToken(api_key) + " on firmware update.", "error");
				callback(false, {
					success: false,
					response: message
				});
				return;
			}

			// A transferred device still presenting its previous owner id (quick 261003-u86).
			if ((message === "transfer_redirect") && (typeof (current_owner) === "string") && (sanitka.owner(current_owner) === current_owner)) {
				firmware_owner = current_owner;
			}

			alog.log(firmware_owner, "Attempt to register device: " + udid + " alias: " + alias);

			// quick 261003-vd4: the key was verified for firmware_owner; only that owner's
			// device is loaded. A foreign, unknown or malformed udid answers like an unknown device.
			this.fetchOwned(udid, firmware_owner, (owned, device) => {

				if (owned !== true) {
					console.log(`[error] no such device ${udid}`);
					return callback(false, "no_such_device");
				}

				console.log(`ℹ️ [info] Getting LFE descriptor for udid ${device.udid}`);

				deploy.initWithDevice(device);
				let firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(firmware_owner, udid);
				let rmac = firmwareUpdateDescriptor.mac || mac;

				if (typeof (rmac) === "undefined") {
					console.log(`🚫  [critical] Missing MAC in firmware():apikey.verify`);
					callback(false, {
						success: false,
						response: "missing_mac"
					});
					return;
				}

				mac = this.normalizedMAC(rmac);

				if (typeof (env_hash) !== "undefined") {
					device.env_hash = env_hash; // update latest device env_hash to request immediately...
				}

				// Check update availability
				let updateAvailable = deploy.hasUpdateAvailable(device);

				if (updateAvailable === false) {
					// Find-out whether user has responded to any actionable notification regarding this device
					this.redis.get("nid:" + udid, (error, json_keys) => {
						if ((json_keys === null) || (typeof (json_keys) === "undefined")) return;
						console.log("result keys: ", { json_keys });
						let not = JSON.parse(json_keys);
						if ((not !== null) && (typeof (not) !== "undefined") && (not.done === true)) {
							console.log("ℹ️ [info] Device firmware current, deleting NID notification...");
							this.redis.del("nid:" + udid);
						} else {
							console.log("ℹ️ [info] Keeping nid:" + udid + ", not done yet...");
						}
					});
				} else {
					console.log("ℹ️ [info] No update available.");
				}

				// Find-out whether user has responded to any actionable notification regarding this device
				this.redis.get("nid:" + udid, (error, json_keys) => {
					
					if (!json_keys) {
						console.log("ℹ️ [info] [nid] Device has no NID for actionable notification.");
					} 
					
					let not = JSON.parse(json_keys);
					console.log("ℹ️ [info] [nid] Device has NID:" + json_keys);
					if ((not !== null ) && (not.done === true)) {
						console.log("ℹ️ [info] [nid] User sent reply.");
						// update allowed by user
					} else {
						console.log("ℹ️ [info] [nid] Device is still waiting for reply.");
						// update not allowed by user
					}
				
					deploy.latestFirmwarePath(firmware_owner, udid, (path) => {

						console.log(`ℹ️ [info] [update] firmware lookup for udid ${udid} found ${(path === false) ? "nothing" : "a file"}`);

						if (path === false) {
							console.log(`ℹ️ [info] No update available for udid ${udid}`);
							return callback(false, {
								success: false,
								status: "UPDATE_NOT_FOUND"
							});
						}

						if ((forced === true) && fs.existsSync(path)) {
							console.log(`ℹ️ [info] Update using force for udid ${udid}`);
							updateAvailable = true;
						}

						if (!device.auto_update) {
							updateAvailable = false;
						}

						if (updateAvailable) {

							// Forced update
							if (forced === true) {
								console.log(`ℹ️ [info] Requesting forced update for udid ${udid}`);
								this.updateFromPath(path, ott, callback);
								return;
							}

							// Start OTT Update
							if (ott !== null) {
								console.log("ℹ️ [info] Requesting OTT update...");
								this.ott_request(req, callback);
								// Perform OTT Update
							} else if (ott === null) {
								console.log(`ℹ️ [info] Requesting normal update for udid ${udid}`);
								this.updateFromPath(path, ott, callback);
							}

						} else {
							console.log(`ℹ️ [info] No firmware update available for ${udid}`);
							callback(false, {
								success: false,
								status: "OK"
							});
						}
					});
				});
			}); // device
		}, this.deviceKeyContext(rbody.udid)); // apikey
	}

	/**
	 * A short, log-safe code for a database or filesystem error (quick 261004-l8k): the
	 * error code, HTTP status or error name, [A-Za-z0-9_] only. Never the message, which can
	 * carry document ids, request URLs or paths.
	 */
	static errorCode(err) {
		if ((typeof (err) !== "object") || (err === null)) return "unknown";
		const candidates = [err.code, err.statusCode, err.name];
		for (const c of candidates) {
			if ((typeof (c) === "string" || typeof (c) === "number") && /^[A-Za-z0-9_]{1,32}$/.test(String(c))) return String(c);
		}
		return "unknown";
	}

	// Shared by the HTTP edit and the MQTT status edit. Logs a reason code and the sanitized
	// udid only, never the document, the changes, the owner id, lastkey or the database error
	// (quick 261004-l8k). `_errors` is kept for the call signature.
	update_device(udid, changes, update_callback, _errors = null) {

		const udid_label = sanitka.udid(udid) || "-";

		if (typeof (update_callback) !== "function") {
			console.log(`🚫  [critical] [device] update_device_no_callback, udid ${udid_label}`);
			return;
		}

		devicelib.get(udid, (err, doc) => {

			if (err) {
				console.log(`☣️ [error] [device] device_read_failed (${Device.errorCode(err)}), udid ${udid_label}`);
				update_callback(false, {
					success: false,
					response: "device_not_found"
				});
				return;
			}

			if (typeof (doc) === "undefined") {
				update_callback(false, {
					success: false,
					response: "no_such_device"
				});
				return;
			}

			delete changes.udid;

			devicelib.atomic("devices", "modify", udid, changes, (atomic_err) => {
				if (atomic_err) {
					console.log(`☣️ [error] [device] device_edit_failed (${Device.errorCode(atomic_err)}), udid ${udid_label}`);
					update_callback(false, {
						success: false,
						change: changes
					});
				} else {
					update_callback(true, {
						success: true,
						change: changes
					});
				}
			});

		});
	}

	edit(changes, callback) {

		if (typeof (changes) === "undefined") {
			return callback(false, "changes_undefined");
		}

		if ((typeof (changes.udid) === "undefined") || (changes.udid === null)) {
			return callback(false, "changes.udid_undefined");
		}

		// The CouchDB `modify` handler copies request fields onto the document
		// with no allowlist, so this is the only gate on what lands in timezone_utc.
		if (typeof (changes.timezone_utc) !== "undefined") {
			if (!Util.isValidTimezone(changes.timezone_utc)) {
				return callback(false, "invalid_timezone_utc");
			}
			// Keep the derived cache consistent with the zone being written.
			changes.timezone_offset = Util.timezoneOffsetFor(changes.timezone_utc);
		}

		this.update_device(changes.udid, changes, callback);
	}

	revoke(udid, callback) {
		devicelib.get(udid, (err, doc) => {
			if (err) {
				console.log(`☣️ [error] [device] revoke_read_failed (${Device.errorCode(err)}), udid ${sanitka.udid(udid) || "-"}`);
				return callback(false, {
					success: false,
					response: "device_not_found"
				});
			}
			if ((typeof (doc) === "undefined") || doc === null) {
				console.log("☣️ [error] no doc returned for device revocation");
				return callback(false, {
					success: false,
					response: "no_such_device"
				});
			}
			console.log(`⚠️ [warning] [device] Should revoke device ${udid} revision: ${doc._rev}`);
			if (typeof (doc._rev) === "undefined") {
				console.log(`☣️ [error] [device] revoke_no_revision, udid ${sanitka.udid(udid) || "-"}`);
				return callback(false, {
					success: false,
					response: "no_such_revision"
				});
			}
			devicelib.destroy(udid, doc._rev, (destroy_err) => {
				if (destroy_err) {
					// already deleted, happens in test
					if (destroy_err.reason !== 'deleted') {
						console.log(`☣️ [error] [device] revoke_destroy_failed (${Device.errorCode(destroy_err)}), udid ${sanitka.udid(udid) || "-"}`);
					}
				}
				if (typeof (callback) === "function") {
					callback(true, {
						success: true,
						response: "device_marked_deleted"
					});
				}
			});
		});
	}

	envs(udid, callback) {
		devicelib.get(udid, (error, device) => {
			if (error || (typeof (device) === "undefined")) {
				if (error.toString().indexOf("Error: missing") !== -1) console.log(`☣️ [error] [device] envs_read_failed (${Device.errorCode(error)}), udid ${sanitka.udid(udid) || "-"}`);
				if (typeof (callback) !== "undefined") callback(false, "getenv_device_not_found");
			} else {
				callback(true, device.environment);
			}
		});
	}

	detail(udid, callback) {
		devicelib.get(udid, (error, device) => {
			if ((error !== null) || (typeof (device) === "undefined")) {
				console.log(`☣️ [error] [device] detail_read_failed (${Device.errorCode(error)}), udid ${sanitka.udid(udid) || "-"}`);
				if (typeof (callback) !== "undefined") callback(false, "detail_device_not_found");
				return;
			}
			callback(true, device);
		});
	}

	/*
	 * Ownership check (quick 261003-t29). isOwnedBy, fetchOwned and filterOwned are the
	 * single ownership check for the console/API device paths (lib/router.device.js,
	 * lib/thinx/transfer.js). "Not yours" answers exactly like "not found"
	 * ("no_such_device", the run_transformers precedent), so a udid never works as an
	 * existence oracle. filterOwned issues one devices_by_owner view query per call, so
	 * a long udid list cannot amplify database load.
	 */

	/** True only when doc.owner is exactly the given non-empty owner string. */
	static isOwnedBy(doc, owner) {
		if ((typeof (owner) !== "string") || (owner.length === 0)) return false;
		if ((typeof (doc) !== "object") || (doc === null)) return false;
		if (typeof (doc.owner) !== "string") return false;
		return doc.owner === owner;
	}

	/**
	 * Calls back (true, doc) for the owner's device, else (false, "no_such_device") for a
	 * missing, foreign, invalid or erroring lookup. Invalid input never reaches CouchDB.
	 */
	fetchOwned(udid, owner, callback) {
		const safe_udid = sanitka.udid(udid);
		const safe_owner = (typeof (owner) === "string") ? sanitka.owner(owner) : null;
		if ((safe_udid === null) || (safe_owner === null)) return callback(false, "no_such_device");
		devicelib.get(safe_udid, (error, doc) => {
			if (error || !Device.isOwnedBy(doc, safe_owner)) {
				console.log("ℹ️ [info] [device] ownership check refused udid", safe_udid);
				return callback(false, "no_such_device");
			}
			callback(true, doc);
		});
	}

	/**
	 * Calls back with the owner's udids among `udids`: valid udids only, deduplicated, in
	 * order of first appearance. Always an array; [] for invalid input or a view error.
	 */
	filterOwned(owner, udids, callback) {
		const safe_owner = (typeof (owner) === "string") ? sanitka.owner(owner) : null;
		if (!Array.isArray(udids) || (safe_owner === null)) return callback([]);
		devicelib.view("devices", "devices_by_owner", {
			"key": safe_owner,
			"include_docs": true
		}, (error, body) => {
			if (error || (typeof (body) !== "object") || (body === null) || !Array.isArray(body.rows)) return callback([]);
			const owned = new Set();
			for (const row of body.rows) {
				const doc = ((typeof (row) === "object") && (row !== null)) ? (row.doc || row.value) : null;
				if (Device.isOwnedBy(doc, safe_owner) && (typeof (doc.udid) === "string")) owned.add(doc.udid);
			}
			const result = [];
			for (const item of udids) {
				const safe_udid = sanitka.udid(item);
				if ((safe_udid !== null) && owned.has(safe_udid) && (result.indexOf(safe_udid) === -1)) result.push(safe_udid);
			}
			callback(result);
		});
	}
};

// Abort budget for one transformer request (quick 261004-rdf); read at call time.
module.exports.transformerTimeoutMs = 5000;
