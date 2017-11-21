/** This THiNX-RTM API module is responsible for managing devices. */

var Device = (function() {

	var app_config = require("../../conf/config.json");
	if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}
	var fs = require("fs");
	var db = app_config.database_uri;

	var prefix = "";
	try {
		var pfx_path = app_config.project_root + '/conf/.thx_prefix';
		if (fs.existsSync(pfx_path)) {
			prefix = fs.readFileSync(pfx_path) + "_";
		}
	} catch (e) {
		//console.log(e);
	}

	var devicelib = require("nano")(db).use(prefix + "managed_devices");

	var sha256 = require("sha256");
	var uuidV1 = require("uuid/v1");
	var alog = require("./audit");
	var deploy = require("./deployment");
	var apikey = require("./apikey");
	var repository = require("./repository");
	var owner = require("./owner");
	var redis = require("redis");
	var client = redis.createClient();
	var base64 = require("base-64");
	var utf8 = require('utf-8');
	var exec = require("child_process");

	var _private = {

		updateFromPath: function(path, ott, callback) {

			// Arduino: single *.bin file only
			// Platformio: single *.bin file only
			// Lua: init.lua, config.lua (will deprecate in favor of thinx.json), thinx.lua
			// Micropython: boot.py, thinx.py, thinx.json, optionally other *.pys and data within the directory structure
			// MongooseOS: to be evaluated, should support both

			if (path.indexOf("/") === path.length) {
				console.log(
					"Trailing slash detected. This should be a multi-file update.");

			} else {

				console.log("Running Single-file update....");

				var deploy_path = path.substring(0, path.lastIndexOf("/"));

				console.log("deploy_path: " + deploy_path);

				var envelope = require(deploy_path + "/build.json");

				console.log("envelope: " + JSON.stringify(envelope));

				var platform = envelope.platform;

				console.log(
					"Platform: " + platform);

				if (platform === "arduino" || platform === "platformio") {
					_private.update_binary(path, ott, callback);

				} else if (platform === "nodemcu") {
					console.log(
						"Multi-file update for NodeMCU not yet fully supported.");
					_private.update_multiple(path, ott, callback);

				} else if (platform === "micropython") {
					console.log(
						"Multi-file update for Micropython not yet fully supported.");
					_private.update_multiple(path, ott, callback);

				} else if (platform === "mongoose") {
					console.log("Firmware update for MongooseOS not yet supported.");
					_private.update_multiple(path, ott, callback);

				} else if (platform === "nodejs") {
					console.log("Firmware update for node.js not yet supported.");
				} else {
					console.log("Firmware update for " + platform + " not yet supported.");
				}
			}
		},

		update_multiple: function(path, ott, callback) {

			var directories = fs.readdirSync(path).filter(
				file => fs.lstatSync(path.join(path, file)).isDirectory()
			);

			var artefact_filenames = [];

			// Fetch header name and language type
			var platforms_path = app_config.project_root + "/platforms";
			console.log("Platforms path: " + platforms_path);
			var platform_descriptor = require(platforms_path + "/descriptor.json");
			var header_file_name = platform_descriptor.header;
			var platform_language = platform_descriptor.language;
			var header_path = path + "/" + header_file_name;
			if (typeof(header_file_name) !== "undefined") {
				// TODO: Check file existence
				artefact_filenames.push(header_file_name);
			}

			var extensions = app.config.project_root + "/languages/" + language +
				"/descriptor.json";

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
			callback(true, buffer);
		},

		// Simple Single-File/OTT Update
		update_binary: function(path, ott, callback) {
			console.log("update_binary from " + path);
			var buffer = fs.readFileSync(path);
			if (typeof(ott) !== "undefined") {
				client.expire("ott:" + ott, 3600); // TODO: FIXME: Should be 0, like this the OTT is valid for 60 minutes after first use
			}
			console.log("Sending firmware update (" + buffer.length + ")");
			callback(true, buffer);
		},

		checkinExistingDevice: function(device, reg, callback) {

				owner.profile(device.owner, function(status, profile) {

					if (status === false) {
						console.log("WARNING! Failed to fetch device owner profile! Transformers will not work.");
					}

					// Do not remove, required for fetching statistics!
					console.log("[OID:" + reg.owner + "] [DEVICE_CHECKIN] Checkin Existing device: " +
						JSON.stringify(reg));

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

					if (typeof(reg.commit) !== "undefined" && reg.commit !== null) {
						device.commit = reg.commit;
					}

					//
					// Extended SigFox Support (will deprecate) ---->
					//

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

					//
					// UDID Dance
					//

					var udid;

					if (typeof(device._id) === "undefined") {
						console.log("Existing device should have in ID!");
					}

					if (typeof(reg.udid) !== "undefined") {
						udid = reg.udid;
					}

					if (typeof(device._id) !== "undefined") {
						udid = device._id;
					}

					if (typeof(udid) == "undefined") {
						console.log("UDID must be given, exiting");
						callback(false, "udid_atomic_error");
					}

					//
					// Status Transformers
					//

					/*
					var transform = (function(code) {
						return eval("function (status, device) { " + code + " }");
					})();
					*/

					// status, snr, rssi, station, lat, long
					if (typeof(device.transformers) !== "undefined" && device.transformers !== null) {

						var d_status = reg.status;
						var d_status_raw = reg.status;
						var d_status_error = false;

						for (var ti in device.transformers) {
							var utid = device.transformers[ti];
							for (var tindex in profile.info.transformers) {
								if (profile.info.transformers[tindex].utid == utid) {
									var descriptor = profile.info.transformers[tindex];
									const alias = descriptor.alias;
									var code = base64.decode(descriptor.body); // TODO: add utf8.getStringFromBytes() when ready
									if (reg.status) {
										console.log("Original status: " + reg.status);
										try {
											/* jshint -W061 */
											eval(unescape(code)); // should fetch the transformer(status, device); function
											var transformed_status = transformer(d_status, device); // may be dangerous if not running in closure with cleaned globals!
											/* jshint +W061 */
											d_status = transformed_status;
											d_status_raw = reg.status;
										} catch (e) {
											console.log(e);
											d_status_error = JSON.stringify(e);
										}
									}
								}
							}
						}
						device.status = d_status;
						device.status_raw = d_status_raw;
						device.status_error = d_status_error;
					}

					// console.log("Atomic update for device " + udid + " with data " + JSON.stringify(device));

					devicelib.atomic("devicelib", "modify", udid, device, function(error, body) {
						if (!error) {
							var registration_response = {
								registration: {
									success: true,
									status: "OK",
									owner: device.owner,
									alias: device.alias,
									udid: udid,
									auto_update: device.auto_update
								}
							};

							var update = deploy.hasUpdateAvailable(device);

							if (update === false) {

								callback(true, registration_response);
								console.log("Check-in reply (existing): " + JSON.stringify(
									registration_response));

							} else {

								console.log("Creating OTT with: " + JSON.stringify(reg));

								_public.storeOTT(reg, function(success, result) {

									console.log("Result: " + JSON.stringify(result));

									console.log("[device] Firmware update available.");
									console.log("[device] OTT token: " + result.ott);
									registration_response.registration.ott = result.ott;

									var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(
										device.owner, udid);

									var rmac = firmwareUpdateDescriptor.mac || reg.mac;
									if (typeof(rmac) === "undefined") {
										throw Error("Missing MAC in device.js:491");
									}
									registration_response.registration.status = "FIRMWARE_UPDATE";
									registration_response.registration.mac = _public.normalizedMAC(rmac);
									registration_response.registration.commit = firmwareUpdateDescriptor.commit;
									registration_response.registration.version = firmwareUpdateDescriptor.version;
									registration_response.registration.checksum = firmwareUpdateDescriptor.checksum;

									callback(true, registration_response);
									console.log("Check-in reply (new): " + JSON.stringify(
										registration_response));

								});
							}
						} else {
							console.log(error, body);
							callback(false, {
								registration: {
									success: false,
									status: "insert_failed"
								}
							});
						}
					});

				}); // owner profile

			} // checkin function
	};

	// public
	var _public = {

		normalizedMAC: function(_mac) {

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
		},

		storeOTT: function(body, callback) {
			var body_string = JSON.stringify(body);
			var new_ott = sha256();
			client.set("ott:" + new_ott, body_string, function(err) {
				if (err) {
					callback(false, err);
				} else {
					console.log("Creating OTT token: " + new_ott);
					client.expire("ott:" + new_ott, 86400);
					callback(true, {
						ott: new_ott
					});
				}
			});
		},

		fetchOTT: function(ott, callback) {
			client.get("ott:" + ott, function(err, json_keys) {
				callback(err, json_keys);
			});
		},

		push: function(body, api_key, callback) {

			var reg = body;

			//
			// Validate input parameters
			//

			console.log("• Push Registration with API Key: " + api_key + " and body " + JSON.stringify(
				body));

			if (typeof(reg) === "undefined") {
				callback(false, "no_push_info");
				return;
			}

			var rdict = {};

			rdict.registration = {};

			// Headers must contain Authentication header
			if (typeof(api_key) === "undefined") {
				console.log("ERROR: Registration requests now require API key!");
				alog.log(owner, "Attempt to register witout API Key!");
				callback(false, "authentication");
				return;
			}

			var push = reg.push;
			var udid = reg.udid;

			devicelib.get(udid, function(error, existing) {
				if (error || (typeof(existing) !== "undefined")) {
					callback(false, "push_device_not_found");
				} else {
					var changes = {
						"push": push
					};
					_public.edit(existing.owner, changes, function() {
						callback(true, "push_token_registered");
					});
				}
			}); // get
		},

		register: function(body, api_key, callback) {

			var reg = body;

			//
			// Validate input parameters
			//

			console.log("• Registration with API Key: " + api_key + " and body " + JSON.stringify(body));

			if (typeof(reg) === "undefined") {
				callback(false, "no_registration_info");
				return;
			}

			var rdict = {};

			rdict.registration = {};

			var mac = _public.normalizedMAC(reg.mac);
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
				console.log("ERROR: Registration requests now require API key!");
				alog.log(owner, "Attempt to register witout API Key!");
				callback(false, "authentication");
				return;
			}

			// Until 2.0.0
			if (typeof(reg.owner) === "undefined") {
				console.log("searching for owner in: " + JSON.stringify(reg));
				callback(false, "old_protocol_owner:-" + owner + "-");
				return;
			}

			// Since 2.0.0a
			var platform = "unknown";
			if (typeof(reg.platform) !== "undefined") {
				platform = reg.platform.toLowerCase();
			}

			var push = reg.push;
			var alias = reg.alias;
			var owner = reg.owner;
			var version = reg.version;
			var udid;

			apikey.verify(owner, api_key, function(success, message) {

				if (success === false) {
					alog.log(owner, "Attempt to use invalid API Key: " +
						api_key +
						" on device registration.");
					callback(false, message);
					return;
				}

				alog.log(owner,
					"Attempt to register device: " + reg.udid + " alias: " + alias);
				console.log(owner,
					"Attempt to register device: " + reg.udid + " alias: " + alias);

				deploy.initWithOwner(owner); // creates user path if does not exist

				alog.log(owner, "Using API Key: " + api_key);

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
				if (typeof(reg.udid) !== "undefined") {
					if (reg.udid.length > 4) {
						udid = reg.udid;
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

				if (known_owner === "") {
					known_owner = owner;
				}

				if (owner != known_owner) {
					// TODO: Fail from device side, notify admin.
					console.log("owner is not known_owner (" + owner + ", " +
						known_owner +
						")");
					response.owner = known_owner;
					owner = known_owner; // should force update in device library
				}

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
					transformers: []
				};



				// KNOWN DEVICES:
				// - see if new firmware is available and reply FIRMWARE_UPDATE with url
				// - see if alias or owner changed
				// - otherwise reply just OK

				//
				// Fiund out, whether device with presented udid exists (owner MUST match to verified API key owner)
				//

				devicelib.get(udid, function(error, existing) {

					if (!error && (typeof(existing) !== "undefined") && (existing.owner == owner)) {

						// If exists, checkin as existing device...
						_private.checkinExistingDevice(existing, reg, callback);
						return;

					} else {

						// If does not exist, search by MAC address first and if not found, create new...
						devicelib.view("devicelib", "devices_by_mac", {
								key: _public.normalizedMAC(reg.mac),
								include_docs: true
							},

							function(err, body) {

								if (err) {
									console.log(
										"Device with this UUID/MAC not found. Seems like new one..."
									);
								} else {

									console.log("Known device identified by MAC address: " + _public.normalizedMAC(
										reg.mac));

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
												console.log("Checking-in existing device by known MAC...");
												if (typeof(xisting.value) !== "undefined") {
													xisting = xisting.value;
													reg.udid = xisting.udid;
												}
												_private.checkinExistingDevice(xisting, reg, callback);
												return;
											} else {
												console.log("No existing device...");
											}
										}
									}
								}

								//
								// New device
								//

								// TODO: FIXME: Create ACL on new user creation

								// - search for ACL record
								// - if found, do nothing
								// - if not found, search for mqtt_passwords and if exists, create ACL record

								console.log("[OID:" + owner +
									"] [DEVICE_NEW] New device: " + JSON.stringify(
										reg));

								//
								// MQTT Registration
								//

								// Find password tool...
								var TOOL = exec.execSync("which mosquitto_passwd").toString()
									.replace(
										"\n", "");

								console.log("mosquitto_passwd detection result: " + TOOL);

								// Create new device/key record
								if (TOOL.length > 1) {
									var CMD = TOOL + " -b " + app_config.project_root +
										"/mqtt_passwords " + udid +
										" " +
										api_key;
									var temp = exec.execSync(CMD);
									console.log("[REGISTER] Creating mqtt account..." + CMD);
									if (typeof(temp.data) !== "undefined" && temp.data.toString() !==
										"") {
										console.log("[REGISTER_ERROR] MQTT: " + JSON.stringify(temp));
									}
								}

								// Find/create ACL file
								const acl_path = app_config.project_root + '/mosquitto.aclfile';
								const device_user_line = "user " + udid;
								const device_topic = "topic /" + owner + "/" + udid;
								const shared_topic = "topic /" + owner + "/shared/#";

								var acl = device_user_line + "\n" + device_topic + "\n" + shared_topic + "\n";

								fs.ensureFile(acl_path, err => {
									if (err) {
										console.log("Error ensuring ACL file: " + err);
									}
									fs.appendFile(acl_path, acl, function(err) {
										if (err) {
											console.log("Error appending ACL file: " + err);
										} else {
											console.log("New ACL record created.");
											alog.log(owner, "Created MQTT ACL record for: " + udid + " alias: " + alias);
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

								console.log("Inserting known device..." + JSON.stringify(
									device));

								devicelib.insert(device, udid, function(err, body,
									header) {
									if (!err) {
										console.log("Device info created.");
										callback(true, {
											registration: {
												success: true,
												owner: owner,
												alias: device.alias,
												udid: udid,
												status: "OK"
											}
										});
										return;
									} else {
										reg.success = false;
										reg.status = "Insert failed";
										console.log("Device record update failed." +
											err);
										console.log("CHECK6:");
										console.log(reg);
										console.log("CHECK6.1:");
										console.log(rdict);
										var json = JSON.stringify(rdict);
										callback(false, json);
									}
								}); // insert
							}); // view
					}
				}); // get

			}); // verify

		},

		ott_request: function(owner, body, api_key, callback) {
			apikey.verify(owner, api_key, function(success, message) {
				console.log("OTTR: " + success.toString(), message);
				if (success) {
					console.log("Requesting OTT...");
					_public.storeOTT(body, callback);
				} else {
					callback(false, "OTT_API_KEY_NOT_VALID");
				}
			});
		},

		ott_update: function(ott, callback) {

			console.log("Fetching OTT...");

			client.get("ott:" + ott, function(err, info) {

				if (err) {
					callback(false, {
						success: false,
						status: "OTT_UPDATE_NOT_FOUND",
						ott: ott
					});
					console.log(err);
					return;
				}

				var ott_info = JSON.parse(info);
				console.log("ott_info String: " + info);
				console.log("ott_info JSON: " + JSON.stringify(ott_info));

				if ((typeof(ott_info) === "undefined") || (ott_info === null)) {
					callback(false, {
						success: false,
						status: "OTT_INFO_NOT_FOUND",
						ott: ott
					});
					return;
				}

				deploy.initWithDevice(ott_info);

				var path = deploy.latestFirmwarePath(ott_info.owner, ott_info.udid);
				if ((path !== "undefined") && path !== null) {
					_private.updateFromPath(path, ott, callback);
				} else {
					callback(false, {
						success: false,
						status: "OTT_UPDATE_NOT_AVAILABLE"
					});
				}

			});

		},

		firmware: function(body, api_key, callback) {

			if (typeof(body.registration) !== "undefined") {
				body = body.registration;
			}

			var mac = null; // will deprecate
			var udid = body.udid;
			var checksum = body.checksum;
			var commit = body.commit;
			var alias = body.alias;
			var owner = body.owner;

			var forced;
			var ott = null;

			// allow custom overrides

			// Currently supported overrides:
			// force = force update (re-install current firmware)
			// ott = return one-time URL instead of data

			if (typeof(body !== "undefined")) {
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

			apikey.verify(owner, api_key, function(success, message) {

				if ((success === false) && (ott === null)) {
					alog.log(owner, "Attempt to use invalid API Key: " +
						api_key +
						" on device registration.");
					callback(false, message);
					return;
				}

				alog.log(owner, "Attempt to register device: " + udid +
					" alias: " +
					alias);

				devicelib.get(udid, function(err, device) {

					if (err) {
						console.log(err);
						return;
					}

					console.log(
						"Getting latest firmware update descriptor from envelope for: " +
						JSON.stringify(device));
					deploy.initWithDevice(device);
					var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(
						owner, udid);
					var rmac = firmwareUpdateDescriptor.mac || mac;
					if (typeof(rmac) === "undefined") {
						throw Error("Missing MAC in device.js:778");
					}
					mac = _public.normalizedMAC(rmac);

					console.log(
						"Seaching for possible firmware update... (owner:" +
						device.owner + ")");

					// Check update availability
					//console.log("UA check for device");
					var updateAvailable = deploy.hasUpdateAvailable(device);

					if (updateAvailable === false) {
						// Find-out whether user has responded to any actionable notification regarding this device
						client.get("nid:" + udid, function(err, json_keys) {
							if (!err) {
								console.log(json_keys);
								if (json_keys === null) return;
								if (typeof(json_keys) === "undefined") return;
								var not = JSON.parse(json_keys);
								if ((typeof(not) !== "undefined") && not.done === true) {
									console.log(
										"Device firmware current, deleting NID notification...");
									client.expire("nid:" + udid, 0);
								} else {
									console.log("Keeping nid:" + udid + ", not done yet...");
								}
							}
						});
					}

					// Find-out whether user has responded to any actionable notification regarding this device
					client.get("nid:" + udid, function(err, json_keys) {
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
						var path = deploy.latestFirmwarePath(device.owner, device.udid);
						if (path === null) {
							console.log("No update available.");
							callback(false, {
								success: false,
								status: "UPDATE_NOT_FOUND"
							});
							return;
						}

						// Forced update is implemented through enforcing update availability,
						// BUT! TODO FIMXE what if no firmware is built yet? Pat must not be valid.
						if ((forced === true) && (path !== null)) {
							console.log("Using force, path is not null...");
							updateAvailable = true;
						}

						if (updateAvailable) {

							// Forced update
							if (forced === true) {
								_private.updateFromPath(path, ott, callback);
								return;
							}

							// Start OTT Update
							if (ott !== null) {
								console.log("Requesting OTT update...");
								_public.ott_request(owner, body, api_key, callback);
								// Perform OTT Update
							} else if (ott === null) {
								console.log("Requesting normal update...");
								_private.updateFromPath(path, ott, callback);
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
		},

		edit: function(owner, changes, callback) {

				if (typeof(changes) === "undefined") {
					callback(false, "changes_undefined");
					return;
				}

				var change = changes; // bulk operations are not required so far
				var udid;

				udid = change.udid;
				console.log("Processing change " + JSON.stringify(change) +
					" for udid " +
					udid);

				if (udid !== null) {

					if (typeof(owner) === "undefined") {
						callback(false, "owner_undefined");
						return;
					}

					if (typeof(udid) === "undefined") {
						callback(false, "udid_undefined");
						return;
					}

					update_device(owner, udid, change, callback);
				}

				function update_device(owner, udid, changes, update_callback) {

					devicelib.get(udid, function(err, doc) {

						if (err) {
							console.log(err);
							update_callback(false, {
								success: false,
								status: "device_not_found"
							});
							return;
						}

						if (typeof(doc) === "undefined") {
							console.log(JSON.stringify(body));
							update_callback(false, {
								success: false,
								status: "no_such_device"
							});
							return;
						}

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

						devicelib.atomic("devicelib", "modify", udid, doc, function(err, body) {
							if (err) {
								console.log("/api/device/edit ERROR:" + err);
								update_callback(false, {
									success: false,
									status: "device_not_changed"
								});
							} else {
								update_callback(true, {
									success: true,
									change: change
								});
							}
						});

					});
				} // inline func end
			} // edit:
	};

	return _public;

})();

exports.register = Device.register;
exports.ott_request = Device.ott_request;
exports.ott_update = Device.ott_update;
exports.firmware = Device.firmware;
exports.edit = Device.edit;
exports.normalizedMAC = Device.normalizedMAC;

// Internals requiring <testability

exports.storeOTT = Device.storeOTT;
exports.fetchOTT = Device.fetchOTT;

// Private

//exports.updateFromPath = Device.updateFromPath;
