/** This THiNX-RTM API module is responsible for managing devices. */

var Device = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var devicelib = require("nano")(db).use("managed_devices");

	var sha256 = require("sha256");
	var uuidV1 = require("uuid/v1");
	var fs = require("fs");
	var alog = require("./audit");
	var deploy = require("./deployment");
	var apikey = require("./apikey");

	var redis = require("redis");
	var client = redis.createClient();

	var _private = {

		normalizedMAC: function(mac) {

			if (mac.length == 17) {
				return mac.toUpperCase();
			} else {

				var ms = mac.replace(/:/g, "");
				var m = ms.split("");
				var retval = m[0].toString() + m[1].toString() + ":" +
					m[2].toString() + m[3].toString() + ":" +
					m[4].toString() + m[5].toString() + ":" +
					m[6].toString() + m[7].toString() + ":" +
					m[8].toString() + m[9].toString() + ":" +
					m[10].toString() + m[11].toString();
				return retval.toUpperCase();
			}
		},

		checkinExistingDevice: function(existing, reg, callback) {

				console.log("[OID:" + existing.owner +
					"] [DEVICE_CHECKIN] Known device: " + JSON.stringify(
						reg));

				var device = existing;

				devicelib.destroy(existing._id, existing._rev,

					function(err) {

						if (err) {
							console.log("Error destroying existing device on checkin! " +
								device._id + " : " + err);
						} else {
							console.log("Updating device document...");
						}

						delete device._rev;

						// Store last checkin timestamp
						device.lastupdate = new Date();

						// Assign UDID if not given
						if (typeof(reg.udid) === "undefined" || reg.udid === "") {
							if (typeof(device.udid) === "undefined") {
								device.udid = device._id;
								console.log(
									"Device found but forgotten udid (not given in request): " +
									device._id);
							}
						} else {
							if (typeof(device.udid) === "undefined") {
								device.udid = device._id;
								console.log("Device found but creating new udid: " + device.udid);
							}
						}

						if (typeof(reg.firmware) !== "undefined" && reg.firmware !== null) {
							device.firmware = reg.firmware;
						}
						if (typeof(reg.push) !== "undefined" && reg.push !== null) {
							device.push = reg.push;
						}
						if (typeof(reg.alias) !== "undefined" && reg.alias !== null) {
							device.alias = reg.alias;
						}
						// device notifies on owner change
						if (typeof(reg.owner) !== "undefined" && reg.owner !== null) {
							device.owner = reg.owner;
						}

						var udid;

						if (typeof(device._id) === "undefined") {
							device._id = uuidV1();
						}

						if (typeof(reg.udid) !== "undefined") {
							udid = reg.udid;
						}

						if (typeof(device._id) !== "undefined") {
							udid = device._id;
						}

						devicelib.insert(device, device._id, function(err,
							body, header) {
							if (!err) {
								var registration_response = {
									registration: {
										success: true,
										status: "OK",
										owner: existing.owner,
										alias: device.alias,
										udid: device.udid
									}
								};

								callback(true, registration_response);
								console.log("Device checkin complete with response: " + JSON.stringify(
									registration_response));
							} else {
								callback(false, {
									registration: {
										success: false,
										status: "insert_failed"
									}
								});
							}
						}); // insert

					}); // destroy
			} // checkin function
	};

	// public
	var _public = {

		updateFromPath: function(path, ott, callback) {
			fs.open(path, 'r', function(err, fd) {
				if (err) {
					callback(false, {
						success: false,
						status: "not_found"
					});
					return console.log(err);
				} else {
					var buffer = fs.readFileSync(path);

					fs.close(fd, function() {
						console.log(
							'Sending firmware update from ' + path + '...');
					});

					client.expire("ott:" + ott, 3600); // TODO: FIXME: Should be 0, like this the OTT is valid for 60 minutes after first use

					callback(true, buffer);

				}
			}); // fs.open
		},

		storeOTT: function(body, callback) {
			var new_ott = sha256(Date());
			client.set("ott:" + new_ott, JSON.stringify(body), function(err) {
				if (err) {
					callback(false, err);
				} else {
					callback(true, {
						ott: new_ott
					});
					client.expire("ott:" + new_ott, 86400);
				}
			});
		},

		fetchOTT: function(ott, callback) {
			client.get("ott:" + ott, function(err, json_keys) {
				callback(err, json_keys);
			});
		},

		register: function(reg, api_key, callback) {

			console.log("Registration with:" + JSON.stringify(reg));

			if (typeof(reg) === "undefined") {
				callback(false, "no_registration_info");
				return;
			}

			var rdict = {};

			rdict.registration = {};

			var mac = _private.normalizedMAC(reg.mac);
			var fw = "unknown";
			if (!reg.hasOwnProperty("firmware")) {
				fw = "undefined";
			} else {
				fw = reg.firmware;
				console.log("Setting firmware " + fw);
			}

			console.log("REGL:" + JSON.stringify(reg));

			var push = reg.push;
			var alias = reg.alias;
			var owner = reg.owner;
			var version = reg.version;
			var udid;

			// Headers must contain Authentication header
			if (typeof(api_key) === "undefined") {
				console.log("ERROR: Registration requests now require API key!");
				alog.log(owner, "Attempt to register witout API Key!");
				callback(false, "authentication");
				return;
			}

			// Until 2.0.0
			if (typeof(owner) === "undefined") {
				callback(false, "old_protocol");
			}

			// Since 2.0.0a
			var platform = "unknown";
			if (typeof(reg.platform) !== "undefined") {
				platform = reg.platform;
			}

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

				deploy.initWithOwner(owner); // creates user path if does not exist

				alog.log(owner, "Using API Key: " + api_key);

				// TODO: If device gives udid, get by udid (existing), otherwise use new.

				success = false;
				var status = "OK";
				var device_version = "1.0.0"; // default

				if (typeof(version) !== "undefined") {
					console.log("Updating device version to " + version);
					device_version = version;
				}

				var known_owner = "";

				var checksum = null;
				if (typeof(reg.checksum) !== "undefined") {
					checksum = reg.checksum;
				}

				var udid = uuidV1(); // is returned to device which should immediately take over this value instead of mac for new registration
				if (typeof(reg.udid) !== "undefined") {
					if (reg.udid.length > 1) {
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

				console.log("Device firmware: " + fw);

				var mqtt = "/" + owner + "/" + udid;

				var device = {
					mac: mac,
					firmware: fw,
					checksum: checksum,
					push: push,
					alias: alias,
					owner: owner,
					source: null,
					version: device_version,
					udid: udid,
					mqtt: mqtt,
					platform: platform,
					lastupdate: new Date(),
					lastkey: sha256(api_key)
				};

				console.log("Seaching for possible firmware update...");

				console.log("Checking update for device descriptor:\n" + JSON
					.stringify(
						device));

				var update = deploy.hasUpdateAvailable(device);
				if (update === true) {
					console.log("Firmware update available.");
					var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(
						device);
					response.status = "FIRMWARE_UPDATE";
					response.success = true;
					response.url = firmwareUpdateDescriptor.url;
					response.mac = _private.normalizedMAC(firmwareUpdateDescriptor.mac);
					response.commit = firmwareUpdateDescriptor.commit;
					response.version = firmwareUpdateDescriptor.version;
					response.checksum = firmwareUpdateDescriptor.checksum;
				} else if (update === false) {
					response.success = true;
					console.log("No firmware update available.");
				} else {
					console.log("Update semver response: " + update);
				}

				// KNOWN DEVICES:
				// - see if new firmware is available and reply FIRMWARE_UPDATE with url
				// - see if alias or owner changed
				// - otherwise reply just OK

				devicelib.get(udid, function(error, existing) {

					if (!error && (typeof(existing) !== "undefined")) {
						_private.checkinExistingDevice(existing, reg, callback);
					} else {
						devicelib.view("devicelib", "devices_by_mac", {
								key: mac,
								include_docs: true
							},

							function(err, body) {

								if (err) {
									console.log(
										"Device with this UUID/MAC not found. Seems like new one..."
									);
								} else {
									console.log("Device with this MAC already exists.");

									if (typeof(body.rows) === "undefined") {
										console.log("ERROR: THE BODY IS:" + JSON.stringify(body));
									} else {

										// Take first device as existing...
										existing = body.rows[0];

										// Delete all duplicates...
										for (var expired in body.rows) {
											console.log("Pruning expired device " + JSON.stringify(body
												.rows[
													expired]._id));
											devicelib.destroy(body.rows[expired]._id, body.rows[expired]
												._rev);
										}

										if (typeof(existing) !== "undefined") {
											_private.checkinExistingDevice(existing, reg, callback);
										}
									}
								}

								console.log("[OID:" + owner +
									"] [DEVICE_NEW] New device: " + JSON.stringify(
										reg));

								// MQTT
								var CMD = "mosquitto_passwd -b " + app_config.project_root +
									"/mqtt_passwords " + udid +
									" " +
									api_key;
								var exec = require("child_process");
								var temp = exec.execSync(CMD);
								console.log("[REGISTER] Creating mqtt account..." + CMD);
								if (typeof(temp.data) !== "undefined" && temp.data.toString() !==
									"") {
									console.log("[REGISTER_ERROR] MQTT: " + JSON.stringify(temp));
								}

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
								}
								if (typeof(platform) !== "undefined" && platform !== null) {
									device.platform = platform;
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
										reg.this.status = "Insert failed";
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
			//apikey.verify(owner, api_key, function(success, message) {
			//console.log("OTTR: " + success.toString(), message);
			//if (success) {
			console.log("Requesting OTT...");
			_public.storeOTT(body, callback);
			//} else {
			//	callback(false, "OTT_API_KEY_NOT_VALID");
			//}
			//});
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
				console.log("ott_info: " + JSON.stringify(ott_info));

				deploy.initWithDevice(ott_info);
				console.log("LFP for ott_info");

				var path = deploy.latestFirmwarePath(ott_info.owner, ott_info.udid);
				if ((path !== "undefined") && path !== null) {
					_public.updateFromPath(path, ott, callback);
				} else {
					callback(false, {
						success: false,
						status: "OTT_UPDATE_NOT_AVAILABLE"
					});
				}

			});

		},

		firmware: function(body, api_key, callback) {

			var mac = null; // will deprecate
			var udid = body.udid;
			var checksum = body.checksum;
			var commit = body.commit;
			var alias = body.alias;
			var owner = body.owner;

			var use;
			var ott;

			// allow custom overrides

			// Currently supported (or wanna-be) overrides:
			// force = force update
			// ott = return one-time URL instead of data

			if (typeof(body !== "undefined")) {
				if (typeof(body.use) !== "undefined") {
					use = body.use;
					console.log("use: " + use);
				} else {
					use = null;
				}
				if (typeof(body.ott) !== "undefined") {
					ott = body.ott;
					console.log("ott: " + ott);
				} else {
					ott = null;
				}
			}


			//
			// Standard / Forced Update (requires valid API Key and Device Owner)
			//

			if (typeof(body.mac) === "undefined") {
				console.log("missing_mac");
				/*
				callback(false, {
					success: false,
					status: "missing_mac"
				});
				*/
				return;
			}

			console.log("TODO: Validate if SHOULD update device " + udid +
				" using commit " + commit + " with checksum " + checksum +
				" and owner: " +
				owner);

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
						device);
					var mac = _private.normalizedMAC(firmwareUpdateDescriptor.mac);

					console.log(
						"Seaching for possible firmware update... (owner:" +
						device.owner + ")");

					// Check update availability
					console.log("UA check for device");
					var updateAvailable = deploy.hasUpdateAvailable(device);
					// FIXME: Uncomment after testing
					/*if (updateAvailable === false) {
						if (use !== "force") {
							callback(false, {
								success: false,
								status: "UPDATE_NOT_AVAILABLE"
							});
						}
					}*/

					// Check path validity
					console.log("LFP for device");
					var path = deploy.latestFirmwarePath(device.owner, device.udid);
					if (path === null) {
						console.log("Path not found");
						callback(false, {
							success: false,
							status: "UPDATE_NOT_FOUND"
						});
						return;
					}

					if ((use == "force") && (path !== null)) {
						console.log("Using force, path is not null...");
						// override update availability
						updateAvailable = true;
					}

					if (updateAvailable === true) {
						_public.updateFromPath(path, ott, callback);
					} else {
						console.log("No firmware update available for " +
							JSON.stringify(device));
						callback(false, {
							success: false,
							status: "YOUR_FIRMWARE_IS_CURRENT"
						});
					}

				}); // device
			}); // apikey
		},

		edit: function(owner, changes, callback) {

			console.log("CHANGES: " + JSON.stringify(changes));

			if (typeof(changes) === "undefined") {
				callback(false, "changes_undefined");
				return;
			}

			var change = changes; // bulk operations are not required so far
			var udid;

			console.log("CHANGE: " + JSON.stringify(change));
			udid = change.udid;
			console.log("Processing change " + change + " for udid " + udid);

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

				devicelib.view("devicelib", "devices_by_owner", {
						key: owner,
						include_docs: true
					},

					function(err, body) {

						if (err) {
							console.log(err);
							update_callback(false, {
								success: false,
								status: "device_not_found"
							});
							return;
						}

						if (body.rows.length === 0) {
							//console.log(JSON.stringify(body));
							update_callback(false, {
								success: false,
								status: "no_such_device"
							});
							return;
						}
						var doc;
						for (var dindex in body.rows) {
							if (body.rows[dindex].hasOwnProperty("value")) {
								var dev = body.rows[dindex].value;
								if (udid.indexOf(dev.udid) != -1) {
									doc = dev;
									break;
								}
							}
						}

						if (typeof(doc) === "undefined") return;

						// Delete device document with old alias
						devicelib.destroy(doc._id, doc._rev, function(err) {

							delete doc._rev;

							if (err) {
								console.log("/api/device/edit ERROR:" + err);
								update_callback(false, {
									success: false,
									status: "destroy_failed"
								});
								return;
							}

							if (typeof(change.alias) !== "undefined") {
								doc.alias = change.alias;
							}

							if (typeof(change.owner) !== "undefined") {
								doc.owner = change.owner;
							}

							if (typeof(change.apikey) !== "undefined") {
								doc.keyhash = change.apikey;
							}

							devicelib.destroy(doc._id, doc._rev, function(err) {

								delete doc._rev;

								// Create device document with new alias
								devicelib.insert(doc, doc.udid,
									function(err, body, header) {
										if (err) {
											console.log("/api/device/edit ERROR:" + err);
											update_callback(false, {
												success: false,
												status: "device_not_changed"
											});
											return;
										} else {
											update_callback(true, {
												success: true,
												change: change
											});
										}
									});
							});
						});
					});
			}
		}

	};

	return _public;

})();

exports.register = Device.register;
exports.ott_request = Device.ott_request;
exports.ott_update = Device.ott_update;
exports.firmware = Device.firmware;
exports.edit = Device.edit;

// Internals

exports.storeOTT = Device.storeOTT;
exports.fetchOTT = Device.fetchOTT;
exports.updateFromPath = Device.updateFromPath;
