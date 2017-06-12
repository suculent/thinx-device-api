/** This THiNX-RTM API module is responsible for managing devices. */

var Device = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var devicelib = require("nano")(db).use("managed_devices");

	var sha256 = require("sha256");
	var uuidV1 = require("uuid/v1");

	var alog = require("./audit");
	var deploy = require("./deployment");
	var apikey = require("./apikey");

	// public
	var _public = {

		register: function(reg, api_key, callback) {

			console.log("Registration with:" + JSON.stringify(reg));

			if (typeof(reg) === "undefined") {
				callback(false, "no_registration_info");
				return;
			}

			var rdict = {};

			rdict.registration = {};

			var mac = reg.mac;
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

			// Headers must contain Authentication header
			if (typeof(api_key) !== "undefined") {
				//
			} else {
				console.log("ERROR: Registration requests now require API key!");
				alog.log(owner, "Attempt to register witout API Key!");
				callback(false, "authentication");
				return;
			}

			if (typeof(owner) === "undefined") {
				callback(false, "old_protocol");
			}

			apikey.verify(owner, api_key, function(success, message) {

				if (success === false) {
					alog.log(owner, "Attempt to use invalid API Key: " +
						api_key +
						" on device registration.");
					callback(false, message);
					return;
				}

				alog.log(owner, "Attempt to register device: " + hash +
					" alias: " +
					alias);

				deploy.initWithOwner(owner); // creates user path if does not exist

				alog.log(owner, "Using API Key: " + api_key);

				// TODO: If device gives udid, get by udid (existing)
				// TODO: If device gives owner, search by owner_id
				// TODO: If device gives username, search by username

				success = false;
				var status = "OK";
				var device_version = "1.0.0"; // default

				if (typeof(version) !== "undefined") {
					console.log("Updating device version to " + version);
					device_version = version;
				}

				var known_owner = "";

				var hash = null;
				if (typeof(reg.hash) !== "undefined") {
					hash = reg.hash;
				}

				var checksum = hash;
				if (typeof(reg.checksum) !== "undefined") {
					checksum = reg.checksum;
				}

				var udid = uuidV1(); // is returned to device which should immediately take over this value instead of mac for new registration
				if (typeof(reg.udid) !== "undefined") {
					udid = reg.udid; // overridden
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

				var mqtt = "/devices/" + udid;

				var device = {
					mac: mac,
					firmware: fw,
					hash: hash,
					checksum: checksum,
					push: push,
					alias: alias,
					owner: owner,
					source: null,
					version: device_version,
					udid: udid,
					mqtt: mqtt,
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
					response.mac = firmwareUpdateDescriptor.mac;
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

					if (!error && existing) {

						console.log("[OID:" + owner +
							"] [DEVICE_CHECKIN] Known device: " + JSON.stringify(
								reg));

						existing.lastupdate = new Date();
						if (typeof(fw) !== "undefined" && fw !== null) {
							existing.firmware = fw;
						}
						if (typeof(hash) !== "undefined" && hash !== null) {
							existing.hash = hash;
						}
						if (typeof(push) !== "undefined" && push !== null) {
							existing.push = push;
						}
						if (typeof(alias) !== "undefined" && alias !== null) {
							existing.alias = alias;
						}
						// device notifies on owner change
						if (typeof(owner) !== "undefined" && owner !== null) {
							existing.owner = owner;
						}

						devicelib.destroy(existing._id, existing._rev,
							function(err) {

								delete existing._rev;

								devicelib.insert(existing, udid, function(err,
									body, header) {
									if (!err) {
										callback(true, {
											registration: {
												success: true,
												owner: owner,
												alias: alias,
												udid: existing.udid,
												status: "OK"
											}
										});
										return;
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

					} else {

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
						console.log("[REGISTER] Creating mqtt account...");
						if (temp !== null) {
							console.log("[REGISTER_ERROR] MQTT: " + temp);
						}

						device.source = null;

						device.lastupdate = new Date();
						if (typeof(fw) !== "undefined" && fw !== null) {
							device.firmware = fw;
						}
						if (typeof(hash) !== "undefined" && hash !== null) {
							device.hash = hash;
						}
						if (typeof(push) !== "undefined" && push !== null) {
							device.push = push;
						}
						if (typeof(alias) !== "undefined" && alias !== null) {
							device.alias = alias;
						}

						console.log("Inserting device..." + JSON.stringify(
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
										udid: device.udid,
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
					}
				}); // get
			}); // verify
		},

		firmware: function(body, api_key, callback) {

			if (typeof(body.mac) === "undefined") {
				callback(false, {
					success: false,
					status: "missing_mac"
				});
				return;
			}

			var mac = body.mac; // will deprecate
			var udid = body.udid;
			var checksum = body.checksum;
			var commit = body.commit;
			var alias = body.alias;
			var owner = body.owner;

			console.log("TODO: Validate if SHOULD update device " + mac +
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

				if (success === false) {
					alog.log(owner, "Attempt to use invalid API Key: " +
						api_key +
						" on device registration.");
					callback(false, message);
					return;
				}

				alog.log(owner, "Attempt to register device: " + udid +
					" alias: " +
					alias);

				devicelib.view("devicelib", "devices_by_id", {
					"key": udid,
					"include_docs": true
				}, function(err, existing) {

					if (err) {
						console.log(err);
						return;
					}

					var device = {
						mac: existing.mac,
						owner: existing.owner,
						version: existing.version
					};

					var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(
						device);
					var mac = firmwareUpdateDescriptor.mac;

					console.log(
						"Seaching for possible firmware update... (owneer:" +
						device.owner + ")");

					deploy.initWithDevice(device);

					var update = deploy.hasUpdateAvailable(device);
					if (update === true) {
						var path = deploy.latestFirmwarePath(owner, udid);
						fs.open(path, 'r', function(err, fd) {
							if (err) {
								callback(false, {
									success: false,
									status: "not_found"
								});
								return console.log(err);
							} else {
								var buffer = fs.readFileSync(path);
								res.end(buffer);
								fs.close(fd, function() {
									console.log(
										'Sending firmware update from ' +
										path + '...');
								});

								devicelib.insert(existing, mac, function(err,
									body, header) {
									if (!err) {
										console.log("Device updated.");
										return;
									} else {
										console.log(
											"Device record update failed." +
											err);
									}
								}); // insert

							}
						}); // fs.open

					} else {
						callback(true, {
							success: true,
							status: "OK"
						});
						console.log("No firmware update available for " +
							JSON.stringify(
								device));
					}
				}); // device
			}); // apikey
		},

		edit: function(owner, changes, callback) {

			console.log("CHANGES: " + JSON.stringify(changes));

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

				if (typeof(changes) === "undefined") {
					callback(false, "changes_undefined");
					return;
				}

				update_device(owner, udid, change);
			}

			function update_device(owner, udid, changes, callback) {

				devicelib.view("devicelib", "devices_by_owner", {
						key: owner,
						include_docs: true
					},

					function(err, body) {

						if (err) {
							console.log(err);
							callback(false, {
								success: false,
								status: "device_not_found"
							});
							return;
						}

						if (body.rows.length === 0) {
							console.log(JSON.stringify(body));
							callback(false, {
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
								callback(false, {
									success: false,
									status: "destroy_failed"
								});
								return;
							}

							if (typeof(change.alias) !== "undefined") {
								doc.alias = change.alias;

							}

							devicelib.destroy(doc._id, doc._rev, function(err) {

								delete doc._rev;

								// Create device document with new alias
								devicelib.insert(doc, doc.udid,
									function(err, body, header) {
										if (err) {
											console.log("/api/device/edit ERROR:" + err);
											callback(false, {
												success: false,
												status: "device_not_changed"
											});
											return;
										} else {
											callback(true, {
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
exports.firmware = Device.firmware;
exports.edit = Device.edit;
