/** This THiNX-RTM API module is responsible for managing devices. */

var Globals = require("./globals.js");

var app_config = Globals.app_config();
var prefix = Globals.prefix();
var rollbar = Globals.rollbar();

var fs = require("fs-extra");
var http = require('http');
var md5 = require('md5');
var db = app_config.database_uri;
var debug_device = app_config.debug.device || true;
var devicelib = require("nano")(db).use(prefix + "managed_devices");
var userlib = require("nano")(db).use(prefix + "managed_users");
var sha256 = require("sha256");
var uuidV1 = require("uuid/v1");
var base64 = require("base-64");
var moment = require("moment");
var redis = require("redis");

var Auth = require('./auth'); var auth = new Auth();
var Audit = require('./audit'); var alog = new Audit();
var Deployment = require('./deployment'); var deploy = new Deployment();
var ApiKey = require("./apikey"); var apikey = new ApiKey();
var Owner = require("./owner"); var owner = new Owner();

const Validator = require('../../lib/thinx/validator');

var exec = require("child_process");

console.log("device.js: base128 (gets stucked on divergent node version)...");
var base128 = require("base128");
console.log("device.js: base128 OK...");

var time = require("time");

module.exports = class Device {

  constructor() {
		this.client = redis.createClient(Globals.redis_options());
	}

	// private
	_storeOTT(body, callback) {
		if (typeof(body) === "undefined") {
			callback(false, "body_missing");
			return;
		}
		var body_string = JSON.stringify(body);
		var new_ott = sha256(new Date().toString());
		this.client.set("ott:" + new_ott, body_string, (err) => {
			if (err) {
				console.log("[device.js] :: storeOTT error");
				callback(false, err);
			} else {
				console.log("Creating OTT token: " + new_ott);
				this.client.expire("ott:" + new_ott, 86400);
				callback(true, {
					ott: new_ott
				});
			}
		});
	}

	normalizedMAC(_mac) {

		if ((typeof(_mac) === "undefined") || (_mac === null)) {
			//throw Error("Undefined MAC!");
			return "UN:DE:FI:NE:D_";
		}

		if (_mac === "") {
			//throw Error("Empty MAC!");
			return "EM:PT:YM:AC:__";
		}

		var mac_addr = _mac.toString();
		// console.log("[device.js] Normalizing MAC: '" + mac + "'");

		if (mac_addr.length == 17) {
			return mac_addr.toUpperCase();
		} else {
			var retval = "";

			var ms = mac_addr.toUpperCase();
			if (ms.indexOf(":") !== -1) {
				ms = ms.replace(/:/g, "");
			}
			var m = ms.split("");
			for (var step = 0; step <= m.length - 2; step += 2) {
				retval += m[step].toString();
				if (typeof(m[step + 1]) !== "undefined") {
					retval += m[step + 1].toString();
				}
				// add ":" of this is not last step
				if (step < m.length - 2) {
					retval += ":";
				}
			}
			return retval;
		}
	}

	updateFromPath(path, ott, callback) {

		// Arduino: single *.bin file only
		// Platformio: single *.bin file only
		// Lua: init.lua, config.lua (will deprecate in favor of thinx.json), thinx.lua
		// Micropython: boot.py, thinx.py, thinx.json, optionally other *.pys and data within the directory structure
		// MongooseOS: to be evaluated, should support both

		if (path.indexOf("/") === path.length) {
			console.log("Trailing slash detected. This should be a multi-file update.");
			return;
		}

		console.log("updateFromPath....");
		var deploy_path = path.substring(0, path.lastIndexOf("/"));
		console.log("deploy_path: " + deploy_path);
		var envelope = require(deploy_path + "/build.json");
		console.log("envelope: " + JSON.stringify(envelope, null, 4));
		var platform = envelope.platform;
		console.log("Platform: " + platform);

		if (platform === "arduino" || platform === "platformio") {
			this.update_binary(path, ott, callback);

		} else if (platform === "nodemcu") {
			console.log("Multi-file update for NodeMCU not yet fully supported.");
			this.update_multiple(path, ott, callback);

		} else if (platform === "micropython") {
			console.log("Multi-file update for Micropython not yet fully supported.");
			this.update_multiple(path, ott, callback);

		} else if (platform === "mongoose") {
			console.log("Firmware update for MongooseOS not yet supported.");
			this.update_multiple(path, ott, callback);

		} else if (platform === "nodejs") {
			console.log("Firmware update for node.js not yet supported.");

		} else {
			console.log("Firmware update for " + platform + " not yet supported.");
		}
	}

	update_multiple(path, ott, callback) {

		/* unused
		var directories = fs.readdirSync(path).filter(
			file => fs.lstatSync(path.join(path, file)).isDirectory()
		); */

		var artefact_filenames = [];

		// Fetch header name and language type
		var platforms_path = app_config.project_root + "/platforms";
		console.log("Platforms path: " + platforms_path);
		var platform_descriptor = require(platforms_path + "/descriptor.json");
		var header_file_name = platform_descriptor.header;
		// var platform_language = platform_descriptor.language;
		// var header_path = path + "/" + header_file_name;
		if (typeof(header_file_name) !== "undefined") {
			// TODO: Check file existence
			artefact_filenames.push(header_file_name);
		}

		var extensions = app_config.project_root + "/languages/" + platform_descriptor.language + "/descriptor.json";

		// Match all files with those extensions + header
		var all_files = fs.readdirSync(path);
		var artifact_filenames = [];
		var selected_files = [];
		for (var findex in artifact_filenames) {
			var file = all_files[findex];
			for (var xindex in extensions) {
				if (file.indexOf(extensions[xindex]) !== -1) {
					selected_files.push(file);
				} else if (file.indexOf(header_file_name) !== -1) {
					selected_files.push(file);
				}
			}
		}

		var buffer = {};
		buffer.type = "file";
		buffer.files = [];

		for (var aindex in selected_files) {
			var apath = path + "/" + selected_files[aindex];
			var descriptor = {
				name: selected_files[aindex],
				data: fs.readFileSync(apath)
			};
			buffer.files.push(descriptor);
		}

		// Respond with json containing all the files...
		// Callback may not be defined in case of some CircleCI tests.
		if (typeof(callback) !== "undefined" && callback !== null) {
			callback(true, buffer);
		}
	}

	update_binary(path, ott, upload_callback) {
		console.log("update_binary from " + path);
		var buffer;
		try {
			buffer = fs.readFileSync(path);
			if (typeof(ott) !== "undefined" && ott !== null) {
				this.client.expire("ott:" + ott, 3600); // The OTT is valid for 60 minutes after first use
			}
			if (typeof(upload_callback) !== "undefined" && upload_callback !== null) {
				console.log("Sending firmware update (" + buffer.length + ")");
				upload_callback(true, {
					md5: md5(buffer),
					filesize: buffer.length,
					payload: buffer
				});
			}
		} catch (e) {
			console.log("Upload callback failed: " + e);
			if (typeof(upload_callback) !== "undefined" && upload_callback !== null) {
				upload_callback(false);
			}
		}
	}

	update_device_and_respond(udid, device, callback, repeat, reg) {

		devicelib.atomic("devicelib", "modify", udid, device, (error, body) => {

			if (error) {
				if (repeat == false) {
					delete device._rev;
					if (debug_device) {
            console.log("Device Update Query successful, updating...");
					}
					this.update_device_and_respond(udid, device, callback, true, reg);
					return;
				} else {
					// repeat failed
					console.log("Repeating...");
				}

				if (debug_device) {
					console.log(error, body);
				}

				if (callback !== null) {
					callback(false, {
						registration: {
							success: false,
							status: "insert_failed"
						}
					});
				}
				return;
			}

			// FIXME: IV should not be here, only fallback...
			var registration_response = {
				registration: {
					success: true,
					status: "OK",
					owner: device.owner,
					alias: device.alias,
					udid: udid,
					// iv: device.iv, no need to send zero IV
					auto_update: device.auto_update
				}
			};

			//
			// Timezone
			//

			var timezone = "Etc/GMT"; // default should be GMT or Universal
			if (typeof(device.timezone) !== "undefined") {
				timezone = device.timezone;
			}
			var device_time = new time.Date(new Date());
			device_time.setTimezone(timezone);
			registration_response.registration.timestamp = device_time.getMilliseconds() / 1000;

			//
			// Firmware update check
			//

			var update = deploy.hasUpdateAvailable(device);

			if (update === false) {

				if (callback !== null) {
					callback(true, registration_response);
					if (debug_device) {
						console.log("» Check-in reply (existing): " + JSON.stringify(registration_response));
					}
				}

			} else {

				// console.log("Creating OTT with registration body: " + JSON.stringify(body));

				// FIXME: no body.registration available in this function
				this._storeOTT(reg, (success, result) => {
					// console.log("Result: " + JSON.stringify(result));
					console.log("[device] Firmware update available.");
					console.log("[device] OTT token: " + result.ott);
					registration_response.registration.ott = result.ott;

					var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(device.owner, udid);

					var rmac = firmwareUpdateDescriptor.mac || device.mac;
					if (typeof(rmac) === "undefined") {
						throw Error("Missing MAC in device.js:491");
					}
					registration_response.registration.status = "FIRMWARE_UPDATE";
					registration_response.registration.mac = this.normalizedMAC(rmac); // do not return MAC to device
					registration_response.registration.commit = firmwareUpdateDescriptor.commit;
					registration_response.registration.version = firmwareUpdateDescriptor.version;

					if (callback !== null) {
						callback(true, registration_response);
					}
				}); // store

			} // else

		}); // atomic
	}

	restartStatusTransformer() {
		console.log("Restarting Status Transformer Sandbox...");

		// Get running transformers if any
		const docker_check_cmd = "cd ~/thinx-node-transformer; docker-compose restart";
		var container_already_running = false;
		try {
			exec.execSync(docker_check_cmd).toString();
			container_already_running = true;
		} catch (e) {
			console.log("Status Transformer Docker check error: " + e);
		}

		if (container_already_running !== false) {
			try {
				exec.execSync("docker restart " + container_already_running);
				return;
			} catch (e) {
				console.log("Status Transformer Restart error: " + e);
			}
		}

		const docker_run_cmd = "cd ~/thinx-node-transformer && docker-compose up -d";
		try {
			exec.execSync(docker_run_cmd);
		} catch (e) {
			console.log("Status Transformer Restart error: " + e);
		}
	}

	checkinExistingDevice(device, reg, callback) {

			owner.profile(device.owner, (status, profile) => {

				if (status === false) {
					console.log("WARNING! Failed to fetch device owner profile in device checkin! Transformers will not work.");
				}

				// Do not remove, required for fetching statistics!
				console.log("[OID:" + reg.owner + "] [DEVICE_CHECKIN] Checkin Existing device: " + JSON.stringify(reg.udid, null, 4));

				// Override/update last checkin timestamp
				device.lastupdate = new Date();

				var checkins = [device.lastupdate];
				if (typeof(device.checkins) === "undefined") {
					device.checkins = checkins;
				} else {
					checkins = device.checkins.slice(-10);
					checkins.push(device.lastupdate);
					device.checkins = checkins.slice(-100); // store last 10 checkins only
				}

				// firmware from device overrides server
				if (typeof(reg.firmware) !== "undefined" && reg.firmware !== null) {

					var envelope = deploy.latestFirmwareEnvelope(device.owner, device.udid);

					if ((typeof(envelope) !== "undefined") && (typeof(envelope.firmware) !== "undefined")) {

						const reg_f_array = reg.firmware.split(":");

						if (envelope.firmware.indexOf(reg_f_array[0]) == 0) {

							var goals = profile.info.goals || [];
							var changed = false;

							if ( !goals.includes('update') ) {
							    goals.push('update');
									changed = true;
							}

							if ( !goals.includes('build') ) {
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
				if (typeof(reg.version) !== "undefined" && reg.version !== null) {
					device.version = reg.version;
				}

				// commit from device overrides server
				if (typeof(reg.commit) !== "undefined" && reg.commit !== null) {
					device.commit = reg.commit;
				}

				// push from device overrides server
				if (typeof(reg.push) !== "undefined" && reg.push !== null) {
					device.push = reg.push;
				}

				// name from server overrides device
				if (typeof(reg.alias) !== "undefined" && reg.alias !== null) {
					if (typeof(device.alias) === "undefined") {
						device.alias = reg.alias;
					}
				}

				// platform may change under same MCU
				if (typeof(reg.platform) !== "undefined" && reg.platform !== null) {
					device.platform = reg.platform;
				}

				//
				// Extended SigFox Support
				//

				// status, snr, rssi, station, lat, long
				if (typeof(reg.status) !== "undefined" && reg.status !== null) {
					device.status = reg.status;
				}

				if (typeof(reg.snr) !== "undefined" && reg.snr !== null) {
					device.snr = reg.snr;
				} else {
					device.snr = null;
				}

				if (typeof(reg.rssi) !== "undefined" && reg.rssi !== null) {
					device.rssi = reg.rssi;
				} else {
					device.rssi = null;
				}

				if (typeof(reg.station) !== "undefined" && reg.station !== null) {
					device.station = reg.station;
				} else {
					device.station = null;
				}

				// Includes

				if (typeof(reg.lat) !== "undefined" && reg.lat !== null) {
					device.lat = reg.lat;
				}

				if (typeof(reg.lon) !== "undefined" && reg.lon !== null) {
					device.lon = reg.lon;
				}

				// COPY B
				// in case there is no status, this is an downlink request and should provide
				// response for this device
				//
				//
				//

				if ((typeof(reg.ack) !== "undefined")) {
					console.log("This is a SigFox downlink request.");
					console.log("This SigFox device asks for downlink.");
					//console.log(JSON.stringify(reg));
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

				if (typeof(device._id) === "undefined") {
					console.log("Existing device should have in ID!");
				}

				if (typeof(reg.udid) !== "undefined") {
					udid = Validator.udid(reg.udid);
				}

				if (typeof(device._id) !== "undefined") {
					udid = device._id;
				}

				if (typeof(udid)=== "undefined") {
					console.log("UDID must be given, exiting");
					callback(false, "udid_atomic_error");
				}

				//
				// IV Compatibility
				//

				/* Adds AES IV for devices that do not have one yet. */
				if ((typeof(device.iv) === "undefined") || (device.iv === null)) {
					// AES Initialization Vector
					let N_BLOCK = 16;
					var iv = Array(N_BLOCK);
					for (var index in iv) {
						iv[index] = Math.floor(Math.random() * Math.floor(255));
					}
					var iv_base64 = Buffer.from(iv).toString('base64');
					device.iv = iv_base64;
				}

				//
				// Status Transformers
				//

				// status, snr, rssi, station, lat, long
				if (typeof(device.transformers) !== "undefined" && device.transformers !== null) {

					//
					// Transformer Job List
					//

					if (device.transformers.length == 0) {
						this.update_device_and_respond(device.udid, device, callback, false, reg);
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
								} catch (e) {
									console.log("[device] transformer_decode64_exception " + e);
									code = base128.decode(descriptor.body);
								}
								if (reg.status) {
									const job_stamp = new Date();
									var job = {
										id: "jsid:" + job_stamp.getMilliseconds(),
										owner: device.owner,
										codename: alias,
										code: code,
										params: {
											status: device.status,
											device: device
										}
									};
									// mask private data
									if (typeof(job.params.device.lastkey) !== "undefined") {
										delete job.params.device.lastkey;
									}
									jobs.push(job);
								}
							}
						}
					}

					if (jobs.length == 0) {
						console.log("No jobs.");
						this.update_device_and_respond(device.udid, device, callback, false, reg);
						return;
					}

					var port;
					if (typeof(app_config.lambda) === "undefined") {
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
							'Content-type': 'application/json'
						}
					};

					var req = http.request(options, (res) => {
						var chunks = [];
						if (typeof(res)=== "undefined") {
							console.log("No lambda server response.");
							return;
						}
						res.on('data', (chunk) => {
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
							if (typeof(response.output) !== "undefined") {
								device.status = response.output;
								device.status_error = null;
							}
							console.log("Job response :" , {response});
							devicelib.get(udid, (error, existing) => {
								if (error || (typeof(existing) === "undefined")) {
									console.log(error);
									callback(false, "status_update_device_not_found");
								} else {
									console.log("Socketing [transformer] registration status.");

									if (typeof(this.websocket) !== "undefined" && this.websocket !== null) {
										try {
											this.websocket.send(JSON.stringify({
												checkin: {
													udid: device.udid,
													status: device.status
												}
											}));
										} catch (e) { /* handle error */ }
									} else {
										console.log("[register] no websocket.");
									}
									this.update_device_and_respond(existing.udid, device, callback, false, reg);
									return;
								}
							}); // get
						}); // end
					}); // req

					req.on('error', (e) => {

						console.error("λ error: " + e);

						try {
							if (e.toString().indexOf("ECONNREFUSED") !== -1) {
								this.restartStatusTransformer();
							}
						} catch (terror) {
							console.log(terror);
						}

						var d_status = reg.status;
						var d_status_raw = reg.status;
						var d_status_error = null;

						device.status = d_status;
						device.status_raw = d_status_raw;
						device.status_error = d_status_error;

						this.update_device_and_respond(device.udid, device, callback, false, reg);

						return;
					}); // req error

					var job_request_body = JSON.stringify({
						jobs: jobs
					});
					req.write(job_request_body);
					req.end();
				} // typeof(device.transformers
			}); // profile
		} // checkin



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

		if (typeof(reg) === "undefined") {
			callback(false, "no_push_info");
			return;
		}

		var rdict = {};

		rdict.registration = {};

		// Headers must contain Authentication header
		if (typeof(api_key) === "undefined") {
			console.log("[push] ERROR: Registration requests now require API key!");
			alog.log(reg.body.owner, "Attempt to register witout API Key!", "warning");
			callback(false, "authentication");
			return;
		}

		var push = reg.push;
		var udid = Validator.udid(reg.udid);

		devicelib.get(udid, (error, existing) => {
			if (error || (typeof(existing) === "undefined") || (existing === null)) {
				callback(false, "push_device_not_found");
			} else {
				var changes = {
					"push": push
				};
				this.edit(existing.owner, changes, () => {
					callback(true, "push_token_registered");
				});
			}
		}); // get
	}

	register(reg, api_key, websocket, callback, req) {

		//
		// Validate input parameters
		//

		if (debug_device) {
			// console.log("» Registration: " + JSON.stringify(body));
		}

		if ((typeof(reg) === "undefined") || (reg === null)) {
			callback(false, "no_registration_info");
			console.log("» no registration info!");
			return;
		}

		var rdict = {};

		rdict.registration = {};

		var mac = this.normalizedMAC(reg.mac);
		if (typeof(mac) === "undefined") {
			throw Error("Missing MAC in device.js:354");
		}
		var fw = "unknown";
		if (!reg.hasOwnProperty("firmware")) {
			fw = "undefined";
		} else {
			fw = reg.firmware;
			//console.log("Setting firmware " + fw);
		}

		// Headers must contain Authentication header
		if (typeof(api_key) === "undefined") {
			console.log("[reg] ERROR: Registration requests should require API key (unless authenticated through MQTT)!");
			let owner;
			if (typeof(reg.owner) === "undefined") {
				owner = "undefined";
			} else {
				owner = reg.owner;
			}
			alog.log(owner, "Attempt to register witout API Key!", "warning");
			console.log("» no api key!");
			callback(false, "authentication");
			return;
		}

		// Until 2.0.0
		if (typeof(reg.owner) === "undefined") {
			console.log("searching for owner in: " + JSON.stringify(reg));
			callback(false, "old_protocol_owner:-" + reg.owner + "-");
			return;
		}

		// Since 2.0.0a
		var platform = "unknown";
		if (typeof(reg.platform) !== "undefined") {
			platform = reg.platform.toLowerCase();
		}

		var push = reg.push;
		var alias = reg.alias;
		var owner = Validator.owner(reg.owner);
		var version = reg.version;

		var timezone_offset = 0;
		if (typeof(reg.timezone_offset) !== "undefined") {
			timezone_offset = reg.timezone_offset;
		}

		var timezone_abbr = "UTC";
		if (typeof(reg.timezone_abbr) !== "undefined") {
			timezone_abbr = reg.timezone_abbr;
			if (moment(new Date()).tz(timezone_abbr).isDST()) {
				timezone_offset = moment(new Date()).tz(timezone_abbr)._tzm / 60;
				console.log("Ajusting timezone offset based on DST: " + timezone_offset);
			}
		}

    if (debug_device) {
			//console.log("» Timezone: "+timezone_offset);
      //console.log("» Verifying API Key...");
		}

		apikey.verify(owner, api_key, req, (success, message) => {

			if (success === false) {
				alog.log(owner, "Attempt to use invalid API Key: " +
					api_key +
					" on device registration.", "error");
				if (debug_device) {
					console.log("» API Key verification failed!");
				}
				callback(false, message);
				return;
			}

			deploy.initWithOwner(owner); // creates user path if does not exist

			// TODO: If device gives udid, get by udid (existing), otherwise use new.

			success = false;
			var status = "OK";
			var firmware_version = "1.0.0"; // default

			if (typeof(version) !== "undefined") {
				//console.log("Device declares version: " + version);
				firmware_version = version;
			}

			var known_owner = "";

			var checksum = null;
			if (typeof(reg.checksum) !== "undefined") {
				checksum = reg.checksum;
			}

			var udid = uuidV1(); // is returned to device which should immediately take over this value instead of mac for new registration
			if (typeof(reg.udid) !== "undefined" && reg.udid !== null) {
				if (reg.udid.length > 4) {
					udid = Validator.udid(reg.udid);
				}
			}

			//
			// Construct response
			//

			var response = {};

			if (
				(typeof(rdict.registration) !== "undefined") &&
				(rdict.registration !== null)
			) {
				response = rdict.registration;
			}

			response.success = success;
			response.status = status;

			known_owner = owner;


			//
			// Construct device descriptor and check for firmware
			//

			//console.log("Device firmware: " + fw);

			var mqtt = "/" + owner + "/" + udid;

			var device = {
				mac: mac,
				firmware: fw,
				checksum: checksum,
				push: push,
				alias: alias,
				owner: owner,
				source: null,
				version: firmware_version,
				udid: udid,
				mqtt: mqtt,
				platform: platform,
				lastupdate: new Date(),
				lastkey: sha256(api_key),
				auto_update: false,
				description: "new device",
				icon: "01",
				status: " ",
				snr: " ",
				rssi: " ",
				station: " ",
				lat: 0,
				lon: 0,
				timezone: timezone_abbr,
				timezone_offset: timezone_offset,
				timezone_abbr: timezone_abbr,
				transformers: []
			};



			// KNOWN DEVICES:
			// - see if new firmware is available and reply FIRMWARE_UPDATE with url
			// - see if alias or owner changed
			// - otherwise reply just OK

			//
			// Find out, whether device with presented udid exists (owner MUST match to verified API key owner)
			//

			devicelib.get(udid, (error, existing) => {

				if (!error && (typeof(existing) !== "undefined") && (existing.owner == owner)) {

					// If exists, checkin as existing device...
					if (typeof(existing._rev) !== "undefined") {
						delete existing._rev;
					}
					if (debug_device) {
						// console.log("» Checking as existing: " + JSON.stringify(existing));
					}
					this.checkinExistingDevice(existing, reg, callback);
					return;

				} else {

					// If does not exist, search by MAC address first and if not found, create new...
					devicelib.view("devicelib", "devices_by_mac", {
							key: this.normalizedMAC(reg.mac),
							include_docs: true
						},
						(err, body) => {

							if (err) {
								console.log("Device with this UUID/MAC not found. Seems like new one...");
								console.log(err);
							} else {
								//console.log("Known device identified by MAC address: " + normalizedMAC(reg.mac));
								if (typeof(body.rows) === "undefined") {
									console.log("ERROR: THE BODY IS:" + JSON.stringify(body));
								} else {
									if (body.rows.length === 0) {
										// device not found by mac; this is a new device...
									} else {
										// console.log("ROWS:" + JSON.stringify(body.rows));
										// In case device does not declare UDID but valid MAC address instead,
										// it will be assigned that UDID.
										var xisting = body.rows[0];
										if (typeof(xisting) !== "undefined") {
											//console.log("Checking-in existing device by known MAC...");
											if (typeof(xisting.value) !== "undefined") {
												xisting = xisting.value;
												reg.udid = xisting.udid;
											}
											if (typeof(xisting._rev) !== "undefined") {
												delete xisting._rev;
											}
											console.log("» Checking as existing device (2)...");
											this.checkinExistingDevice(xisting, reg, callback);
											return;
										}
									}
								}
							}

							//
							// New device
							//

							console.log("[OID:"+owner+"] [DEVICE_NEW]: ", JSON.stringify(reg));

							// COPY B
							// in case there is no status, this is an downlink request and should provide
							// response for this device
							//

							if ((typeof(reg.ack) !== "undefined")) {
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

							auth.add_mqtt_credentials(udid, api_key);

							// Find/create ACL file
							const acl_path = app_config.mqtt.acl;
							const device_user_line = "user " + udid;
							const device_topic = "topic readwrite /" + owner + "/" + udid + "/#";
							const shared_topic = "topic readwrite /" + owner + "/shared#";
							const status_topic = "topic readwrite /" + owner + "/status";

							var acl = device_user_line + "\n" + device_topic + "\n" + shared_topic + "\n" + status_topic + "\n\n";

							fs.ensureFile(acl_path, (err) => {
								if (err) {
									console.log("Error ensuring ACL file: " + err);
								}
								fs.appendFile(acl_path, acl, (err) => {
									if (err) {
										console.log("Error appending ACL file: " + err);
									} else {
										console.log("New ACL record created.");
										alog.log(owner, "Created MQTT ACL record for: " + udid + " alias: " + alias);

										// MQTT reload happens boath after ACL record creation and password creation.
										// Therefore it should be sufficient only once.
										// Also, this operation is now deprecated and will be removed in next version.
										var GETPID = "ps -ax | grep 'mosquitto -d' | grep -v 'grep' | awk '{print $1}'";
										var result = exec.execSync(GETPID);
										if (result !== null) {
											var process_id = result.toString();
											if (parseInt(GETPID).toString() !== "NaN") {
												console.log("MQTT has process ID "+process_id);
												var RELOADMQTT = "kill -HUP " + parseInt(GETPID).toString();
												console.log(RELOADMQTT);
												result = exec.execSync(RELOADMQTT);
												console.log("Kill MQTT result: "+result);
											}
										}
									}
								});
							});

							//
							// Device Data Validation
							//

							device.source = null;

							device.lastupdate = new Date();
							if (typeof(fw) !== "undefined" && fw !== null) {
								device.firmware = fw;
							}
							if (typeof(push) !== "undefined" && push !== null) {
								device.push = push;
							}
							if (typeof(alias) !== "undefined" && alias !== null) {
								device.alias = alias;
							} else {
								device.alias = require('sillyname')();
							}
							if (typeof(platform) !== "undefined" && platform !== null) {
								device.platform = platform;
							}

							// Extended SigFox Support

							// status, snr, rssi, station, lat, long
							if (typeof(reg.status) !== "undefined" && reg.status !== null) {
								device.status = reg.status;
							}

							if (typeof(reg.snr) !== "undefined" && reg.snr !== null) {
								device.snr = reg.snr;
							}

							if (typeof(reg.rssi) !== "undefined" && reg.rssi !== null) {
								device.rssi = reg.rssi;
							}

							if (typeof(reg.station) !== "undefined" && reg.station !== null) {
								device.station = reg.station;
							}

							// Includes

							if (typeof(reg.lat) !== "undefined" && reg.lat !== null) {
								device.lat = reg.lat;
							}

							if (typeof(reg.lon) !== "undefined" && reg.lon !== null) {
								device.lon = reg.lon;
							}

							if (typeof(reg.commit) !== "undefined" && reg.commit !== null) {
								device.commit = reg.commit;
							}

							// AES Initialization Vector

							let N_BLOCK = 16;
							var iv = Array(N_BLOCK);
							for (var index in iv) {
								iv[index] = Math.floor(Math.random() * Math.floor(255));
							}
							var iv_base64 = Buffer.from(iv).toString('base64');
							device.iv = iv_base64;
							// console.log("Creating device with initialization vector: " + iv_base64);

							// Timezone

							var timezone = "Universal";
							var payload = {};

							if (err && (typeof(req) !== "undefined")) {
								if (typeof(req.ip) !== "undefined") {
									console.log("IP: " + req.ip + " ERR: " + err);
								} else {
                  console.log(" ERR: " + err);
                }
							}

							payload.timezone = "Universal";
							payload.latitude = device.lon;
							payload.longitude = device.lat;

							// Overwrite last timezone
							if (typeof(payload.timezone) !== "undefined") {
								device.timezone = payload.timezone;
								timezone = payload.timezone;
							}

							// Do not overwrite latitude/longitude when set by device.
							if (typeof(device.lon) === "undefined") {
								device.lon = payload.longitude;
							}

							// Do not overwrite latitude/longitude when set by device.
							if (typeof(device.lat) === "undefined") {
								device.lat = payload.latitude;
							}

							// console.log("Inserting known device...");

							devicelib.insert(device, udid, (err, body, header) => {
								if (!err) {
									console.log("Device info created.");

									var device_time = new time.Date(new Date());
									device_time.setTimezone(timezone);

									var response = {
										registration: {
											success: true,
											owner: owner,
											alias: device.alias,
											udid: udid,
											iv: device.iv,
											status: "OK",
											timestamp: device_time.getMilliseconds() / 1000
										}
									};
									callback(true, response);
									return;

								} else {
									reg.success = false;
									reg.status = "Insert failed";
									console.log("Device record update failed." +
										err);
									//console.log("CHECK6:");
									//console.log(reg);
									console.log("CHECK6.1:");
									console.log(rdict);
									var json = JSON.stringify(rdict);
									callback(false, json);
								}
							}); // insert
						}); // view
					//});
				}
			}); // get
		}); // verify
	}

	ott_request(owner, body, api_key, callback) {
		apikey.verify(owner, api_key, null, (success, message) => {
			console.log("OTTR: " + success.toString(), message);
			if (success) {
				console.log("Storing OTT...");
				this._storeOTT(JSON.stringify(body), callback);
			} else {
				callback(false, "OTT_API_KEY_NOT_VALID");
			}
		});
	}

	run_transformers(udid, owner, dry, callback) {

		// Fetch transformers first...
		userlib.get(owner, (error, response) => {

			var profile = {};

			if (typeof(response) === "object") {
				profile = response;
			} else {
				try {
					console.log("Trying to parse input as JSON(!)");
					profile = JSON.parse(response);
				} catch (e) {
					profile = response;
					console.log("Not parsing content JSON: " , {response});
					console.log({
						profile, e
					});
				}

			}

			// Fetch device
			devicelib.get(udid, (error, device) => {

				if (!error && (typeof(device) !== "undefined") && (device.owner == owner)) {

					//
					// Status Transformers (Copy for dryruns)
					//

					// status, snr, rssi, station, lat, long
					if (typeof(device.transformers) !== "undefined" && device.transformers !== null) {

						var d_status = device.status_raw;
						var d_status_error = null;

						for (var ti in device.transformers) {
							var utid = device.transformers[ti];
							for (var tindex in profile.info.transformers) {
								if (profile.info.transformers[tindex].utid == utid) {
									var descriptor = profile.info.transformers[tindex];
									var code;
									try {
										code = base128.decode(descriptor.body);
									} catch (e) {
										code = base64.decode(descriptor.body);
									}
									if (device.status_raw) {
										console.log("Original status: " + device.status_raw);
										try {
											/* jshint -W061 */
                      var transformer;
											eval(unescape(code)); // should create the transformer(status, device); function
                      console.log("Transformer:", { transformer });
                      console.log("Code:", { code });
											var transformed_status = transformer(d_status, device); // may be dangerous if not running in closure with cleaned globals!
											console.log("Remotely transformed status: '" + transformed_status + "'");
											/* jshint +W061 */
											d_status = transformed_status;
										} catch (e) {
											console.log("transformer_eval_exception: " + e);
											d_status_error = JSON.stringify(e);
										}
									}
								}
							}
						}
						if (typeof(d_status_error) !== "undefined" && d_status_error !== null) {
							callback(false, d_status_error);
						} else {
							callback(true, d_status);
						}
					} else {
						callback(false, "no_transformer_attached");
					}
				}

			});
		});
	}

	ott_update(ott, callback) {

		console.log("Fetching OTT...");

		this.client.get("ott:" + ott, (err, info) => {

			if (err) {
				callback(false, {
					success: false,
					status: "OTT_UPDATE_NOT_FOUND",
					ott: ott
				});
				console.log("OTT_UPDATE_NOT_FOUND: " + err);
				return;
			}

			var ott_info = JSON.parse(info);
			console.log("ott_info JSON: " + JSON.stringify(ott_info, null, 4));

			if ((typeof(ott_info) === "undefined") || (ott_info === null)) {
				callback(false, {
					success: false,
					status: "OTT_INFO_NOT_FOUND",
					ott: ott
				});
				return;
			}

			console.log("initWithDevice: [ott_info]" );
			deploy.initWithDevice(ott_info);

			console.log("latestFirmwarePath: " + ott_info.owner + " : " + ott_info.udid );
			var path = deploy.latestFirmwarePath(ott_info.owner, ott_info.udid);
			if (path === false) {
				callback(false, {
					success: false,
					status: "OTT_UPDATE_NOT_AVAILABLE"
				});
				return;
			}
			this.updateFromPath(path, ott, callback);
		});
	}

	firmware(body, api_key, callback) {

		if (typeof(body.registration) !== "undefined") {
			body = body.registration;
		}

		var mac = null; // will deprecate
		var udid = Validator.udid(body.udid);
		// var checksum = body.checksum;
		// var commit = body.commit;
		var alias = body.alias;
		var owner = body.owner;

		var forced;
		var ott = null;

		// allow custom overrides

		// Currently supported overrides:
		// force = force update (re-install current firmware)
		// ott = return one-time URL instead of data

		if (typeof(body.forced) !== "undefined") {
			forced = body.forced;
			console.log("forced: " + forced);
		} else {
			forced = false;
		}
		if (typeof(body.ott) !== "undefined") {
			ott = body.ott;
			console.log("ott: " + ott);
		} else {
			ott = null;
		}


		//
		// Standard / Forced Update
		//

		if (typeof(body.mac) === "undefined") {
			console.log("missing_mac in " + JSON.stringify(body));
			callback(false, {
				success: false,
				status: "missing_mac"
			});
			return;
		}

		// Headers must contain Authentication header
		if (typeof(api_key) !== "undefined") {
			// OK
		} else {
			console.log("ERROR: Update requests must contain API key!");
			callback(false, {
				success: false,
				status: "authentication"
			});
			return;
		}

		apikey.verify(owner, api_key, null, (success, message) => {

			if ((success === false) && (ott === null)) {
				alog.log(owner, "Attempt to use invalid API Key: " +
					api_key +
					" on device registration.", "error");
				callback(false, message);
				return;
			}

			alog.log(owner, "Attempt to register device: " + udid + " alias: " + alias);

			devicelib.get(udid, (err, device) => {

				if (err) {
					console.log(err);
					return;
				}

				// console.log("Getting latest firmware update descriptor from envelope for: " {device});
        console.log("Getting latest firmware update descriptor from envelope with: " + device.udid);
				deploy.initWithDevice(device);
				var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(owner, udid);
				var rmac = firmwareUpdateDescriptor.mac || mac;
				if (typeof(rmac) === "undefined") {
					throw Error("Missing MAC in device.js:778");
				}
				mac = this.normalizedMAC(rmac);

				console.log("Seaching for possible firmware update... (owner:" + device.owner + ")");

				// Check update availability
				//console.log("UA check for device");
				var updateAvailable = deploy.hasUpdateAvailable(device);

				if (updateAvailable === false) {
					// Find-out whether user has responded to any actionable notification regarding this device
					this.client.get("nid:" + udid, (err, json_keys) => {
						if (!err) {
							if (json_keys !== null) {
                console.log("result keys: ", {json_keys});
  							if (typeof(json_keys) !== "undefined") {
    							var not = JSON.parse(json_keys);
    							if ((typeof(not) !== "undefined") && not.done === true) {
    								console.log("Device firmware current, deleting NID notification...");
    								this.client.expire("nid:" + udid, 0);
    							} else {
    								console.log("Keeping nid:" + udid + ", not done yet...");
    							}
                }
              }
            }
					});
				}

				// Find-out whether user has responded to any actionable notification regarding this device
				this.client.get("nid:" + udid, (err, json_keys) => {
					if (err) {
						console.log("Device has no NID for actionable notification.");
						// no NID, that's OK...
						// nid will be deleted on successful download/update (e.g. when device is current)
					} else {
						if (json_keys !== null) {
							var not = JSON.parse(json_keys);
							console.log("Device has NID:" + json_keys);
							if (not.done === true) {
								console.log("User sent reply.");
								// update allowed by user
							} else {
								console.log("Device is still waiting for reply.");
								// update not allowed by user
							}
						}
					}

					// Check path validity
					//console.log("Fetching latest firmware path for device...");

					console.log("LFP2 with: " + JSON.stringify(device.owner));

					var path = deploy.latestFirmwarePath(owner, udid);
					if (path === false) {
						console.log("No update available.");
						callback(false, {
							success: false,
							status: "UPDATE_NOT_FOUND"
						});
						return;
					}

					// Forced update is implemented through enforcing update availability,
					// BUT! TODO FIMXE what if no firmware is built yet? Pat must not be valid.
					if ((forced === true) && (path != null)) {
						console.log("Using force, path is not null...");
						updateAvailable = true;
					}

					if (updateAvailable) {

						// Forced update
						if (forced === true) {
							this.updateFromPath(path, ott, callback);
							return;
						}

						// Start OTT Update
						if (ott !== null) {
							console.log("Requesting OTT update...");
							this.ott_request(owner, body, api_key, callback);
							// Perform OTT Update
						} else if (ott === null) {
							console.log("Requesting normal update...");
							this.updateFromPath(path, ott, callback);
						}

					} else {

						console.log("No firmware update available for " +
							JSON.stringify(device));

						callback(false, {
							success: false,
							status: "OK"
						});
					}
				});
			}); // device
		}); // apikey
	}

  apply_edits_to_doc(doc, change) {
    if (typeof(change.alias) !== "undefined") {
      doc.alias = change.alias;
    }

    if (typeof(change.owner) !== "undefined") {
      doc.owner = change.owner;
    }

    if (typeof(change.keyhash) !== "undefined") {
      doc.keyhash = change.keyhash;
    }

    if (typeof(change.auto_update) !== "undefined") {
      doc.auto_update = change.auto_update;
    }

    if (typeof(change.description) !== "undefined") {
      doc.description = change.description;
    }

    if (typeof(change.category) !== "undefined") {
      doc.category = change.category;
    }

    if (typeof(change.tags) !== "undefined") {
      doc.tags = change.tags;
    }

    if (typeof(change.icon) !== "undefined") {
      doc.icon = change.icon;
    }

    if (typeof(change.transformers) !== "undefined") {
      doc.transformers = change.transformers;
    }

    if (typeof(change.timezone_offset) !== "undefined") {
      doc.timezone_offset = change.timezone_offset;
    }

    if (typeof(change.timezone_abbr) !== "undefined") {
      doc.timezone_abbr = change.timezone_abbr;
    }

    if (typeof(change.timezone_utc) !== "undefined") {
      doc.timezone_utc = change.timezone_utc;
    }

    if (typeof(change.env_vars) !== "undefined") {
      doc.env_vars = change.env_vars;
    }

    return doc;
  }

  update_device(owner, udid, changes, update_callback) {

    devicelib.get(udid, (err, doc) => {

      if (err) {
        console.log(err);
        update_callback(false, {
          success: false,
          status: "device_not_found"
        });
        return;
      }

      if (typeof(doc) === "undefined") {
        update_callback(false, {
          success: false,
          status: "no_such_device"
        });
        return;
      }

      doc = this.apply_edits_to_doc(doc, changes);

      delete doc._rev;

      devicelib.atomic("devicelib", "modify", udid, doc, (err, body) => {
        if (err) {
          console.log("/api/device/edit ERROR:" + err);
          console.log("udid: " + udid);
          if (typeof(doc) !== "undefined") {
            console.log("doc: " + JSON.stringify(doc, null, 4));
          }
          if (typeof(body) !== "undefined") {
            console.log("body: " + JSON.stringify(body, null, 4));
          }
          update_callback(false, {
            success: false,
            status: "device_not_changed"
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

	edit(owner, changes, callback) {

		if (typeof(changes) === "undefined") {
			callback(false, "changes_undefined");
			return;
		}

    if ((typeof(changes.udid) === "undefined") || (changes.udid === null)) {
      console.log("No device update, UDID undefined...");
      callback(false, "changes.udid_undefined");
      return;
    }

		if (typeof(owner) === "undefined") {
			console.log("No device update, owner undefined...");
			callback(false, "owner_undefined");
			return;
		}

		console.log("Device update with: " + JSON.stringify(changes));
		this.update_device(owner, changes.udid, changes, callback);
	}

	storeOTT(body, callback) {
		this._storeOTT(body, callback);
	}

	revoke(udid, callback) {
		devicelib.get(udid, (err, doc) => {
			if (err) {
				console.log(err);
				callback(false, {
					success: false,
					status: "device_not_found"
				});
				return;
			}
			if ((typeof(doc) === "undefined") || doc === null) {
				console.log("no doc returned for device revocation");
				callback(false, {
					success: false,
					status: "no_such_device"
				});
				return;
			}
			// var revision = doc.rev;
      console.log("Should destroy revision: ", doc._rev);
      if (typeof(doc._rev) === "undefined") {
        console.log("ERROR, revision undefined in doc", doc);
        callback(false, {
					success: false,
					status: "no_such_revision"
				});
      }
			devicelib.destroy(udid, doc._rev, (err) => {
				if (err) {
          // already deleted, happens in test
          if (err.reason !== 'deleted') {
					   console.log("Device destroy error: ", err);
          }
				}
				if (typeof(callback) === "function") {
					callback(true, {
  					success: true,
  					status: "device_marked_deleted"
  				});
				} else {
					console.log("Device document destroyed without destroy_callback.");
				}
			});
		});
	}
};
