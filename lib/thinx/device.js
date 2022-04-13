/** This THiNX Device Management API module is responsible for managing devices. */

var Globals = require("./globals.js");

var app_config = Globals.app_config();
var prefix = Globals.prefix();

var fs = require("fs-extra");
var http = require('http');
var md5 = require('md5');
var debug_device = app_config.debug.device || true;

const Database = require("./database.js");
let db_uri = new Database().uri();
var devicelib = require("nano")(db_uri).use(prefix + "managed_devices");
var userlib = require("nano")(db_uri).use(prefix + "managed_users");
var sha256 = require("sha256");
var Sanitka = require("./sanitka"); var sanitka = new Sanitka();

const { v1: uuidV1 } = require('uuid');

const base64 = require("base-64");
const momentTz = require("moment-timezone");
const redis = require("redis");
const crypto = require('crypto');

var Auth = require('./auth'); var auth = new Auth();
var Audit = require('./audit'); var alog = new Audit();
var Deployment = require('./deployment'); var deploy = new Deployment();
var ApiKey = require("./apikey"); var apikey = new ApiKey();
var Owner = require("./owner"); var owner = new Owner();

var ACL = require('./acl');

module.exports = class Device {

	constructor() {
		this.client = redis.createClient(Globals.redis_options());
	}

	// private
	storeOTT(body, callback) {
		var body_string = JSON.stringify(body);
		var new_ott = sha256(new Date().toString());
		this.client.set("ott:" + new_ott, body_string, (err) => {
			if (!err) {
				this.client.expire("ott:" + new_ott, 86400);
				callback(true, { ott: new_ott });
			} else {
				console.log("☣️ [error] [device.js] :: storeOTT error", err);
				callback(false, "store_ott_error");
			}
		});
	}

	normalizedMAC(mac_addr) {
		if ((typeof (mac_addr) !== "string") || (mac_addr === "")) {
			return null;
		}
		var retval = mac_addr.toUpperCase();
		if (retval.length != 17) {
			var ms;
			ms = retval.replace(/:/g, "");
			retval = "";
			var m = ms.split("");
			for (var step = 0; step <= m.length - 2; step += 2) {
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
	updateFromPath(path, ott, callback) {

		// Arduino: single *.bin file only
		// Platformio: single *.bin file only
		// Lua: init.lua, config.lua (will deprecate in favor of thinx.json), thinx.lua
		// Micropython: boot.py, thinx.py, thinx.json, optionally other *.pys and data within the directory structure
		// MongooseOS: to be evaluated, should support both

		if ((typeof (path) === "undefined") || path == null) {
			callback(false);
			console.log("🚫  [critical] update path must be defined");
			return;
		}

		if (path.indexOf("/") === path.length) {
			console.log("🚫  [critical] [not-implemented] Trailing slash detected. This should be a multi-file update.");
			callback(false);
			return;
		}

		var deploy_path = path.substring(0, path.lastIndexOf("/"));
		var envelope = JSON.parse(fs.readFileSync(deploy_path + "/build.json"));
		var platform = envelope.platform;

		let firmware_path = deploy_path + "/firmware.bin";

		if (platform === "arduino" || platform === "platformio" || (platform === "pine64")) {
			this.update_binary(firmware_path, ott, callback);

		} else if ((platform === "nodemcu") || (platform === "micropython") || (platform === "mongoose") || (platform === "nodejs")) {
			console.log("⚠️ [warning] Multi-file update for " +platform+" not yet fully supported.");
			this.update_multiple(firmware_path, callback);

		} else {
			console.log("⚠️ [warning] Firmware update for " + platform + " not yet supported.");
		}
	}

	update_multiple(path, callback) {

		var artifact_filenames = [];

		// Fetch header name and language type
		var platforms_path = __dirname + "/../../platforms";
		console.log("Reading from " + platforms_path + "/descriptor.json");
		var platform_descriptor = JSON.parse(fs.readFileSync(platforms_path + "/descriptor.json"));
		var header_file_name = platform_descriptor.header;
		if (typeof (header_file_name) !== "undefined") {
			if (fs.existsSync(header_file_name)) {
				artifact_filenames.push(header_file_name);
			}
		}

		var extensions = __dirname + "/../../languages/" + platform_descriptor.language + "/descriptor.json";

		console.log("Reading from extensions " + extensions);

		// Match all files with those extensions + header
		var all_files = fs.readdirSync(path);

		var updated_files = [];
		for (var findex in artifact_filenames) {
			var file = all_files[findex];
			for (var xindex in extensions) {
				if ((file.indexOf(extensions[xindex]) !== -1) || (file.indexOf(header_file_name) !== -1)) {
					updated_files.push(file);
				}
			}
		}

		var buffer = {};
		buffer.type = "file";
		buffer.files = [];

		for (var aindex in updated_files) {
			var apath = path + "/" + updated_files[aindex];
			var descriptor = {
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

	update_binary(path, ott, upload_callback) {

		// In case this receives JSON file, it would return the JSON instead of binary causing boot-loop!
		console.log("update_binary from path: " + path);
		var buffer;

		if (path.indexOf(".json") !== -1) {
			console.log("🚫  [critical] Developer Error: sending JSON Envelope instead of path to Firmware Binary to the update_binary() function!");
			upload_callback(false);
		}

		try {
			buffer = fs.readFileSync(path);

			if (buffer.length < 1000) {
				console.log("⚠️ [warning] Input file too short for a firmware, skipping (" + buffer.length + ")");
				upload_callback(false);
				return;
			}
			if (typeof (ott) !== "undefined" && ott !== null) {
				this.client.expire("ott:" + ott, 3600); // The OTT is valid for 60 minutes after first use
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
			console.log("☣️ [error] Upload callback failed: " + e);
			if (typeof (upload_callback) !== "undefined" && upload_callback !== null) {
				upload_callback(false);
			}
		}
	}

	update_device_and_respond(udid, device, callback, repeat, reg, res) {

		delete device._rev;

		// Workaround fix for incorrect append! There's bug somewhere and those data will be lost now, but prevent blocking the request.
		delete device.doc;
		delete device.value;

		devicelib.atomic("devices", "modify", udid, { changes: device }, (error, /* body */) => {

			if (error) {

				console.log("☣️ [error] devicelib.atomic.modify failed with udid:", udid, "device:", device);

				if (!repeat) {
					if (debug_device) {
						console.log("☣️ [error] Device Update Query failed, responding...");
					}

				} else {
					// repeat failed
					console.log("ℹ️ [info] Repeating...");
					this.update_device_and_respond(udid, device, callback, true, reg, res);
					return;
				}

				if (debug_device) {
					console.log("☣️ [error] Atomic modification error:", error, body);
				}

				if (callback !== null) {
					callback(res, false, {
						registration: {
							success: false,
							status: "device_insert_failed"
						}
					});
				}
				return;
			}

			var alias_or_null = device.alias;
			var alias_or_owner = device.owner;

			var registration_response = {
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

			var update = device.auto_update;

			if (update) {
				update = deploy.hasUpdateAvailable(device);
				console.log(`ℹ️ [info] Device ${udid} has update available and enabled.`);
			} else {
				console.log(`ℹ️ [info] Device ${udid} has auto-update disabled.`);
			}

			if (update === false) {

				if (callback !== null) {
					callback(res, true, registration_response);
					if (debug_device) {
						console.log("ℹ️ [info] Check-in reply (existing): " + JSON.stringify(registration_response));
					}
				}

			} else {

				this.storeOTT(reg, (_success, result) => {

					registration_response.registration.ott = result.ott;

					var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(device.owner, udid);

					var rmac = firmwareUpdateDescriptor.mac || device.mac;
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

					if (callback !== null) {
						console.log("ℹ️ [info] Calling back with", registration_response);
						callback(res, true, JSON.stringify(registration_response));
					} else {
						console.log("☣️ [error] Missing callback in firmware update registration response.");
					}
				}); // store

			} // else

		}); // atomic
	}

	checkinExistingDevice(device, reg, api_key, res, callback) {

		// Refresh MQTT credentials on successful registration (requires plugin-based authentication Redis/GoAuth)
		this.authorize_mqtt(api_key, device);

		owner.profile(device.owner, (status, profile) => {

			if (status === false) {
				console.log("WARNING! Failed to fetch device owner profile in device checkin! Transformers will not work.");
			}

			// Do not remove, required for fetching statistics!
			console.log("[OID:" + reg.owner + "] [DEVICE_CHECKIN] Checkin Existing device: " + JSON.stringify(reg.udid, null, 4));

			// Override/update last checkin timestamp
			device.lastupdate = new Date();

			var checkins = [device.lastupdate];
			if (typeof (device.checkins) === "undefined") {
				device.checkins = checkins;
			} else {
				checkins = device.checkins.slice(-10);
				checkins.push(device.lastupdate);
				device.checkins = checkins.slice(-100); // store last 10 checkins only
			}

			// firmware from device overrides server
			if (typeof (reg.firmware) !== "undefined" && reg.firmware !== null) {

				var envelope = deploy.latestFirmwareEnvelope(device.owner, device.udid);

				if ((typeof (envelope) !== "undefined") && (typeof (envelope.firmware) !== "undefined")) {

					const reg_f_array = reg.firmware.split(":");

					if (envelope.firmware.indexOf(reg_f_array[0]) == 0) {

						var goals = profile.info.goals || [];
						var changed = false;

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
							}, (error, body) => {
								if (error) {
									console.log("ERR: " + error + " : " + JSON.stringify(body));
									alog.log(owner, "Profile update failed.", "error");
									callback(false, "update_failed");
								} else {
									alog.log(device.owner, "Owner state updated.", "warning");
									callback(true, "updated");
								}
							});
						}
					}
				}
				device.firmware = reg.firmware;
			}

			// version from device overrides server
			if (typeof (reg.version) !== "undefined" && reg.version !== null) {
				device.version = reg.version;
			}

			// env_hash from device overrides server
			if (typeof (reg.env_hash) !== "undefined" && reg.env_hash !== null) {
				device.env_hash = reg.env_hash;
			}

			// push from device overrides server
			if (typeof (reg.push) !== "undefined" && reg.push !== null) {
				device.push = reg.push;
			}

			// name from server overrides device
			if (typeof (reg.alias) !== "undefined" && reg.alias !== null) {
				if (typeof (device.alias) === "undefined") {
					device.alias = reg.alias;
				}
			}

			// platform may change under same MCU
			if (typeof (reg.platform) !== "undefined" && reg.platform !== null) {
				device.platform = reg.platform;
			}

			//
			// Extended SigFox Support
			//

			// status, snr, rssi, station, lat, long
			if (typeof (reg.status) !== "undefined" && reg.status !== null) {
				device.status = reg.status;
			}

			if (typeof (reg.snr) !== "undefined" && reg.snr !== null) {
				device.snr = reg.snr;
			} else {
				device.snr = null;
			}

			if (typeof (reg.rssi) !== "undefined" && reg.rssi !== null) {
				device.rssi = reg.rssi;
			} else {
				device.rssi = null;
			}

			if (typeof (reg.station) !== "undefined" && reg.station !== null) {
				device.station = reg.station;
			} else {
				device.station = null;
			}

			// Includes

			if (typeof (reg.lat) !== "undefined" && reg.lat !== null) {
				device.lat = reg.lat;
			}

			if (typeof (reg.lon) !== "undefined" && reg.lon !== null) {
				device.lon = reg.lon;
			}

			// COPY B
			// in case there is no status, this is an downlink request and should provide
			// response for this device
			//
			//
			//

			if ((typeof (reg.ack) !== "undefined")) {
				console.log("This is a SigFox downlink request.");
				console.log("This SigFox device asks for downlink.");
				const downlinkdata = device.status.toString('hex').substring(0, 16);
				console.log("Updating downlink for existing device " + downlinkdata);
				var downlinkResponse = {};
				var deviceID = reg.mac.replace("SIGFOX", "");
				downlinkResponse[deviceID] = {
					'downlinkData': downlinkdata
				};
				callback(true, downlinkResponse); // success = true
				callback = null;
			} else {
				console.log(JSON.stringify(reg));
			} // COPY B

			//
			// UDID Dance
			//

			var udid;

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
				callback(false, "udid_atomic_error");
			}

			// IV Compatibility

			/* Adds AES IV for devices that do not have one yet. */
			if ((typeof (device.iv) === "undefined") || (device.iv === null)) {
				device.iv = crypto.randomBytes(16).toString('base64');
			}

			if ((typeof (device.aes_key) === "undefined") || (device.aes_key === null)) {
				device.aes_key = crypto.randomBytes(32).toString('base64');
			}

			// DevSec compatibility

			if (typeof (reg.fcid) !== "undefined" && reg.fcid !== null) {
				device.fcid = reg.fcid;
			}

			// Status Transformers

			this.runDeviceTransformers(profile, device, callback, reg, res);

		}); // profile

	} // checkin

	runDeviceTransformers(profile, device, callback, reg, res) {

		// status, snr, rssi, station, lat, long
		if (typeof (device.transformers) !== "undefined" && device.transformers !== null) {

			//
			// Transformer Job List
			//

			if (device.transformers.length == 0) {
				if ((typeof (reg) !== "undefined") && (typeof (callback) !== "undefined")) {
					this.update_device_and_respond(device.udid, device, callback, false, reg, res);
				}
				return;
			}

			var jobs = [];
			for (var ti in device.transformers) {
				const utid = device.transformers[ti];
				for (var tindex in profile.info.transformers) {
					if (profile.info.transformers[tindex].utid == utid) {
						var descriptor = profile.info.transformers[tindex];
						const alias = descriptor.alias;
						var code;
						try {
							code = base64.decode(descriptor.body);
						} catch (ea) {
							try {
								console.log("[device] transformer_decode64_exception " + ea);
								code = base64.decode(descriptor.body.toString('utf8'));
							} catch (ex) {
								console.log("[device] TRANSFORMER FATAL transformer_decode128_exception " + ex);
								return;
							}

						}

						let transformedStatus;

						if (typeof (reg) !== "undefined") {
							transformedStatus = reg.status;
						} else {
							transformedStatus = device.status;
						}

						if (transformedStatus) {
							const job_stamp = new Date();
							var job = {
								id: "jsid:" + job_stamp.getTime(),
								owner: device.owner,
								codename: alias,
								code: code,
								params: {
									status: device.status,
									device: device
								}
							};
							// mask private data
							if (typeof (job.params.device.lastkey) !== "undefined") {
								delete job.params.device.lastkey;
							}
							jobs.push(job);
						}
					}
				}
			}

			if (jobs.length == 0) {
				console.log("No jobs.");
				if ((typeof (reg) !== "undefined") && (typeof (callback) !== "undefined")) {
					this.update_device_and_respond(device.udid, device, callback, false, reg, res);
				}
				return;
			}

			var port;
			if (typeof (app_config.lambda) === "undefined") {
				port = 7475;
			} else {
				port = app_config.lambda;
			}

			var options = {
				hostname: 'localhost',
				port: port,
				timeout: 5000,
				path: '/do',
				method: 'POST',
				headers: {
					'Accept': 'application/json',
					'Content-type': 'application/json',
					'Origin': 'api'
				}
			};

			var req = http.request(options, (_res) => {
				var chunks = [];
				if (typeof (_res) === "undefined") {
					console.log("No lambda server response.");
					return;
				}
				_res.on('data', (chunk) => {
					chunks.push(chunk);
				}).on('end', () => {

					var response;
					var buffer = Buffer.concat(chunks);

					try {
						response = JSON.parse(buffer);
					} catch (e) {
						console.log("Could not part Transformer resopnse as json: " + e + " response: " +
							buffer);
						response = {
							input: "error",
							output: buffer.toString()
						};
					}

					device.status = response.input;
					if (typeof (response.output) !== "undefined") {
						device.status = response.output;
						device.status_error = null;
					}
					console.log("Job response :", { response });
					devicelib.get(udid, (error, existing) => {
						if (error || (typeof (existing) === "undefined")) {
							console.log(error);
							if (typeof (callback) !== "undefined") {
								callback(res, false, "status_update_device_not_found");
							}
						} else {
							console.log("Socketing [transformer] registration status.");

							if (typeof (websocket) !== "undefined" && websocket !== null) {
								try {
									websocket.send(JSON.stringify({
										checkin: {
											udid: device.udid,
											status: device.status
										}
									}));
								} catch (e) { /* handle error */ }
							} else {
								console.log("[register] no websocket.");
							}
							if ((typeof (reg) !== "undefined") && (typeof (callback) !== "undefined")) {
								this.update_device_and_respond(existing.udid, device, callback, false, reg, res);
							}
						}
					}); // get
				}); // end
			}); // req

			req.on('error', (e) => {

				console.error("λ error: " + e);

				try {
					if (e.toString().indexOf("ECONNREFUSED") !== -1) {
						console.log(`🚫  [critical] transformer error ${e}`);
					}
				} catch (terror) {
					console.log(`🚫  [critical] transformer terror ${terror}`);
				}

				var d_status = reg.status;
				var d_status_raw = reg.status;
				var d_status_error = null;

				device.status = d_status;
				device.status_raw = d_status_raw;
				device.status_error = d_status_error;

				if ((typeof (reg) !== "undefined") && (typeof (callback) !== "undefined")) {
					this.update_device_and_respond(device.udid, device, callback, false, reg, res);
				}
			}); // req error

			var job_request_body = JSON.stringify({
				jobs: jobs
			});
			req.write(job_request_body);
			req.end();

		} // typeof(device.transformers
	}

	fetchOTT(ott, callback) {
		this.client.get("ott:" + ott, (err, json_keys) => {
			callback(err, json_keys);
		});
	}

	push(body, api_key, callback) {

		var reg = body;

		//
		// Validate input parameters
		//

		console.log("• Push Registration: " + JSON.stringify(body));

		if (typeof (reg) === "undefined") {
			callback(false, "no_push_info");
			return;
		}

		var rdict = {};

		rdict.registration = {};

		// Headers must contain Authentication header
		if (typeof (api_key) === "undefined") {
			console.log("[push] ERROR: Registration requests now require API key!");
			alog.log(reg.body.owner, "Attempt to register witout API Key!", "warning");
			callback(false, "authentication");
			return;
		}

		var push;

		// validation against object injection/prototype pollution
		if (typeof reg.push === 'string' || reg.push instanceof String) {
			push = reg.push;
		} else {
			callback(false, "invalid_type");
			return;
		}

		var udid = sanitka.udid(sanitka.udid(reg.udid));

		devicelib.get(udid, (error, existing) => {
			if (error || (typeof (existing) === "undefined") || (existing === null)) {
				callback(false, "push_device_not_found");
			} else {
				var changes = {
					"push": push,
					"udid": udid
				};
				this.edit(changes, () => {
					callback(true, "push_token_registered");
				});
			}
		}); // get
	}

	authorize_mqtt(api_key, device) {

		let udid = device.udid;
		auth.add_mqtt_credentials(udid, api_key, () => {
			// Load/create ACL file
			let acl = new ACL(udid);
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

		if (debug_device) {
			console.log("🔨 [debug] [device.register]:", { reg });
		}

		if ((typeof (reg) === "undefined") || (reg === null)) {
			callback(false, "no_registration_info");
			console.log("» no registration info!");
			return;
		}

		var rdict = {};

		rdict.registration = {};

		var mac = this.normalizedMAC(reg.mac);
		if (typeof (mac) === "undefined") {
			callback(false, "no_mac");
			console.log("Missing MAC in device.js:354");
			return;
		}
		var fw = "unknown";
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
			console.log(`☣️ [error] no API Key in ${reg}`);
			callback(false, "authentication");
			return;
		}

		// Since 2.0.0a
		var platform = "unknown";
		if (typeof (reg.platform) !== "undefined") {
			platform = reg.platform.toLowerCase();
		}

		// Since 2.8.242
		var fcid = "000000000000";
		if (typeof (reg.fcid) !== "undefined") {
			fcid = reg.fcid.toUpperCase();
		}

		var push = reg.push;
		var alias = reg.alias;

		if (typeof (reg) !== "object") {
			return;
		}

		var registration_owner = sanitka.owner(reg.owner);
		if ((registration_owner === false) || (registration_owner === null)) {
			return callback(false, "invalid owner:" + reg.owner);
		}

		var version = reg.version;

		// Since 2.9.x
		var env_hash = null;
		if (typeof (reg.env_hash) !== "undefined") {
			env_hash = reg.env_hash;
		}

		var timezone_offset = 0;
		if (typeof (reg.timezone_offset) !== "undefined") {
			timezone_offset = reg.timezone_offset;
		}

		var timezone_abbr = "UTC";
		if (typeof (reg.timezone_abbr) !== "undefined") {
			timezone_abbr = reg.timezone_abbr;
			if (momentTz().tz(timezone_abbr).isDST()) {
				timezone_offset = momentTz().tz(timezone_abbr)._tzm / 60;
				if (debug_device) console.log("🔨 [debug] [device] Ajusting timezone offset based on DST: " + timezone_offset);
			}
		}

		if (debug_device) console.log("🔨 [debug] [device] Timezone offset: " + timezone_offset);

		apikey.verify(registration_owner, api_key, true, (success, message) => {

			if (success === false) {
				alog.log(registration_owner, "Attempt to use invalid API Key: " + api_key + " on device registration.", "error");
				if (debug_device) console.log("🔨 [debug] [device] API Key verification failed!");
				return callback(false, message);
			}

			deploy.initWithOwner(registration_owner); // creates user path if does not exist

			success = false;
			var status = "OK";

			// determine device firmware version, if available
			var firmware_version = "0"; // default
			if (typeof (version) !== "undefined") {
				firmware_version = version;
			}

			var checksum = null;
			if (typeof (reg.checksum) !== "undefined") {
				checksum = reg.checksum;
			}

			let mesh_ids = [];
			var udid = uuidV1(); // is returned to device which should immediately take over this value instead of mac for new registration
			if ((typeof (reg.udid) !== "undefined") && (reg.udid !== null)) {
				udid = sanitka.udid(reg.udid);
			}

			//
			// Construct response
			//

			var response = {};

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

			var mqtt = "/" + registration_owner + "/" + udid; // lgtm [js/tainted-format-string]

			var device = {
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
				timezone: timezone_abbr,
				timezone_abbr: timezone_abbr,
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
			// Find out, whether device with presented udid exists (owner MUST match to verified API key owner)
			//

			devicelib.get(udid, (error, existing) => {

				if (!error && (typeof (existing) !== "undefined") && (existing.owner == registration_owner)) {

					// If exists, checkin as existing device...
					if (typeof (existing._rev) !== "undefined") {
						delete existing._rev;
					}
					if (debug_device) {
						console.log("ℹ️ [info] Checking as existing device [1]...");
					}
					this.checkinExistingDevice(existing, reg, api_key, res, callback);

				} else {

					// If does not exist, search by MAC address first and if not found, create new...
					devicelib.view("devices", "devices_by_mac", {
						key: this.normalizedMAC(reg.mac),
						include_docs: true
					},
						(err, body) => {

							if ((!err) && (typeof (body.rows) !== "undefined") && (body.rows.length > 1)) {
								// In case device does not declare UDID but valid MAC address instead,
								// it will be assigned that UDID.
								var xisting = body.rows[0];
								if (typeof (xisting) !== "undefined") {
									if (typeof (xisting.value) !== "undefined") {
										xisting = xisting.value;
										reg.udid = xisting.udid;
									}
									if (typeof (xisting._rev) !== "undefined") {
										delete xisting._rev;
									}
									console.log("ℹ️ [info] Checking as existing device [2]...");
									this.checkinExistingDevice(xisting, reg, api_key, res, callback);
									return;
								}
							}

							//
							// New device
							//

							console.log(`[OID:${registration_owner}] [DEVICE_NEW]: `, JSON.stringify(reg)); // lgtm [js/tainted-format-string]

							// COPY B
							// in case there is no status, this is an downlink request and should provide
							// response for this device
							//

							if ((typeof (reg.ack) !== "undefined")) {
								console.log("This is a downlink registration request.");
								console.log("This SigFox device did not provide status. Asks for downlink?");
								console.log(JSON.stringify(reg));
								var downlinkdata = device.status.toString('hex').substring(0, 16);
								console.log("Sending downlink for new device " + downlinkdata);
								var downlinkResponse = {};
								var deviceID = reg.mac.replace("SIGFOX", "");
								downlinkResponse[deviceID] = {
									'downlinkData': downlinkdata
								};
								callback(true, downlinkResponse);
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

							var payload = {};

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
									console.log("☣️ [error] Device record update failed." + create_err);
									callback(false, JSON.stringify(rdict));
									return;
								}

								callback(true, {
									registration: {
										success: true,
										owner: registration_owner,
										alias: device.alias,
										udid: udid,
										iv: device.iv,
										status: "OK",
										meshes: device.mesh_ids,
										timestamp: momentTz().tz(timezone_abbr).unix()
									}
								});

							}); // insert
						}); // view
					//});
				}
			}); // get
		}); // verify
	}

	ott_request(req, callback) {
		let ott_owner = req.owner;
		let body = req.body;
		let api_key = req.headers.authentication;
		apikey.verify(ott_owner, api_key, false, (success, message) => {
			console.log("OTTR: " + success.toString(), message);
			if (success) {
				console.log("Storing OTT...");
				this.storeOTT(body, callback);
			} else {
				callback(false, "OTT_API_KEY_NOT_VALID");
			}
		});
	}

	run_transformers(udid, transformer_owner,callback, res) {
		devicelib.get(udid, (fetch_error, device) => {
			if (fetch_error || (typeof (device) === "undefined") || (device.owner != transformer_owner)) {
				return callback(res, false, "no_such_device");
			}
			userlib.get(transformer_owner).then((profile) => {
				this.runDevieTransformers(profile, device, callback, null, res); // registration request to respond with
			}).catch((e) => {
				console.log("transformer user get error", e);
			});
		});
	}

	ott_update(ott, callback) {

		this.client.get("ott:" + ott, (err, info) => {

			if (err) {
				callback(false, "OTT_UPDATE_NOT_FOUND");
				console.log("OTT_UPDATE_NOT_FOUND: " + err);
				return;
			}

			var ott_info = JSON.parse(info);

			if ((typeof (ott_info) === "undefined") || (ott_info === null)) {
				callback(false, "OTT_INFO_NOT_FOUND");
				return;
			}

			deploy.initWithDevice(ott_info);

			deploy.latestFirmwarePath(ott_info.owner, ott_info.udid, (path) => {
				console.log("latestFirmwarePath: " + path);
				if (path === false || path === null) {
					callback(false, "OTT_UPDATE_NOT_AVAILABLE");
					return;
				}
				this.updateFromPath(path, ott, callback);
			});

		});
	}

	firmware(req, callback) {

		let rbody = req.body;
		let api_key = req.headers.authentication;

		if (typeof (rbody.registration) !== "undefined") {
			rbody = rbody.registration;
		}

		var mac = null; // will deprecate
		var forced;
		var ott = null;

		var alias = rbody.alias;
		var env_hash = rbody.env_hash;

		var udid = sanitka.udid(rbody.udid);
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
			console.log("ott: " + ott);
		}

		//
		// Standard / Forced Update
		//

		if (typeof (rbody.mac) === "undefined") {
			console.log("☣️ [error] missing_mac in " + JSON.stringify(rbody));
			callback(false, {
				success: false,
				status: "missing_mac"
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
				status: "authentication"
			});
			return;
		}

		apikey.verify(firmware_owner, api_key, false, (success, message) => {

			if ((success === false) && (ott === null)) {
				alog.log(firmware_owner, "Attempt to use invalid API Key: " + api_key + " on device registration.", "error");
				callback(false, {
					success: false,
					status: message
				});
				return;
			}

			alog.log(firmware_owner, "Attempt to register device: " + udid + " alias: " + alias);

			devicelib.get(udid, (err, device) => {

				if (err) {
					let msg = "device get in firmware failed";
					console.log(msg + err);
					callback(false, {
						success: false,
						status: msg
					});
					return;
				}

				console.log(`ℹ️ [info] Getting LFE descriptor for udid ${device.udid}`);

				deploy.initWithDevice(device);
				var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(firmware_owner, udid);
				var rmac = firmwareUpdateDescriptor.mac || mac;

				if (typeof (rmac) === "undefined") {
					console.log(`🚫  [critical] Missing MAC in firmware():apikey.verify`);
					callback(false, {
						success: false,
						status: "missing_mac"
					});
					return;
				}

				mac = this.normalizedMAC(rmac);

				if (typeof (env_hash) !== "undefined") {
					device.env_hash = env_hash; // update latest device env_hash to request immediately...
				}

				// Check update availability
				var updateAvailable = deploy.hasUpdateAvailable(device);

				if (updateAvailable === false) {
					// Find-out whether user has responded to any actionable notification regarding this device
					this.client.get("nid:" + udid, (fw_err, json_keys) => {
						if (fw_err || (json_keys === null) || (typeof (json_keys) === "undefined")) return;
						console.log("result keys: ", { json_keys });
						var not = JSON.parse(json_keys);
						if ((typeof (not) !== "undefined") && not.done === true) {
							console.log("ℹ️ [info] Device firmware current, deleting NID notification...");
							this.client.del("nid:" + udid);
						} else {
							console.log("ℹ️ [info] Keeping nid:" + udid + ", not done yet...");
						}
					});
				} else {
					console.log("ℹ️ [info] No update available.");
				}

				// Find-out whether user has responded to any actionable notification regarding this device
				this.client.get("nid:" + udid, (get_err, json_keys) => {
					if (get_err) {
						console.log("ℹ️ [info] [nid] Device has no NID for actionable notification.");
						// no NID, that's OK...
						// nid will be deleted on successful download/update (e.g. when device is current)
					} else {
						if (json_keys !== null) {
							var not = JSON.parse(json_keys);
							console.log("ℹ️ [info] [nid] Device has NID:" + json_keys);
							if (not.done === true) {
								console.log("ℹ️ [info] [nid] User sent reply.");
								// update allowed by user
							} else {
								console.log("ℹ️ [info] [nid] Device is still waiting for reply.");
								// update not allowed by user
							}
						}
					}

					deploy.latestFirmwarePath(firmware_owner, udid, (path) => {

						console.log("ℹ️ [info] latestFirmwarePath completed with", { path });

						if (path === false) {
							console.log(`ℹ️ [info] No update available for udid ${udid}`);
							callback(false, {
								success: false,
								status: "UPDATE_NOT_FOUND"
							});
							return;
						}

						if ((forced === true) && fs.existsSync(path)) {
							console.log(`ℹ️ [info] Update using force, path is set to ${path}`);
							updateAvailable = true;
						}

						if (!device.auto_update) {
							updateAvailable = false;
						}

						if (updateAvailable) {

							// Forced update
							if (forced === true) {
								console.log(`ℹ️ [info] Requesting forced update from path ${path}`);
								this.updateFromPath(path, ott, callback);
								return;
							}

							// Start OTT Update
							if (ott !== null) {
								console.log("ℹ️ [info] Requesting OTT update...");
								this.ott_request(req, callback);
								// Perform OTT Update
							} else if (ott === null) {
								console.log(`ℹ️ [info] Requesting normal update from path ${path}`);
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
		}); // apikey
	}

	update_device(udid, changes, update_callback, errors = null) {

		if (typeof (update_callback) !== "function") {
			console.log("🚫  [critical] Update callback must be function for " + udid + "with" + JSON.stringify(changes));
			return;
		}

		devicelib.get(udid, (err, doc) => {

			if (err) {
				console.log(err);
				update_callback(false, {
					success: false,
					status: "device_not_found"
				});
				return;
			}

			if (typeof (doc) === "undefined") {
				update_callback(false, {
					success: false,
					status: "no_such_device"
				});
				return;
			}

			console.log("Atomic update with changes: ", JSON.stringify(changes, null, 2));

			devicelib.atomic("devices", "modify", udid, changes, (atomic_err, body) => {
				if (atomic_err) {
					let data = JSON.stringify(changes, null, 2);
					console.log(`☣️ [error] [device] errors: ${errors} device ${udid} edit error ${atomic_err}, ${body} retry with data ${data}, updating doc ${JSON.stringify(doc)}...`);
					//if (errors < 1) this.update_device(udid, changes, update_callback, errors + 1);
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
			console.log("🚫  [critical] No device update, UDID missing in changes!");
			return callback(false, "changes.udid_undefined");
		}

		this.update_device(changes.udid, changes, callback);
	}

	revoke(udid, callback) {
		devicelib.get(udid, (err, doc) => {
			if (err) {
				console.log(err);
				return callback(false, {
					success: false,
					status: "device_not_found"
				});
			}
			if ((typeof (doc) === "undefined") || doc === null) {
				console.log("☣️ [error] no doc returned for device revocation");
				return callback(false, {
					success: false,
					status: "no_such_device"
				});
			}
			console.log(`⚠️ [warning] [device] Should revoke device ${udid} revision: ${doc._rev}`);
			if (typeof (doc._rev) === "undefined") {
				console.log("☣️ [error] revision undefined in doc", doc);
				return callback(false, {
					success: false,
					status: "no_such_revision"
				});
			}
			devicelib.destroy(udid, doc._rev, (destroy_err) => {
				if (destroy_err) {
					// already deleted, happens in test
					if (err.reason !== 'deleted') {
						console.log("☣️ [error] Device destroy error: ", err);
					}
				}
				if (typeof (callback) === "function") {
					callback(true, {
						success: true,
						status: "device_marked_deleted"
					});
				}
			});
		});
	}

	envs(udid, callback) {
		devicelib.get(udid, (error, device) => {
			if (error || (typeof (device) === "undefined")) {
				if (error.toString().indexOf("Error: missing") !== -1) console.log("[error] get envs:", error);
				if (typeof (callback) !== "undefined") callback(false, "getenv_device_not_found");
			} else {
				callback(true, device.environment);
			}
		});
	}

	detail(udid, callback) {
		devicelib.get(udid, (error, device) => {
			if ((error !== null) || (typeof (device) === "undefined")) {
				console.log("[error] detail searching for udid:", udid, ", ", error);
				if (typeof (callback) !== "undefined") callback(false, "detail_device_not_found");
				return;
			} 
			callback(true, device);
		});
	}
};
