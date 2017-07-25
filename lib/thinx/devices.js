/** This THiNX-RTM API module is responsible for managing userlib records. */

var Devices = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var devicelib = require("nano")(db).use("managed_devices");

	var fs = require("fs");
	var exec = require("child_process");
	var mkdirp = require("mkdirp");

	var alog = require("./audit");
	var deploy = require("./deployment");
	var watcher = require("./repository");

	var Rollbar = require("rollbar");

	var rollbar = new Rollbar({
		accessToken: "5505bac5dc6c4542ba3bd947a150cb55",
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

	var watcher_callback = function(result) {
		if (typeof(result) !== "undefined") {
			console.log("[devices] watcher_callback result: " + JSON.stringify(result));
			if (result === false) {
				console.log(
					"[devices] No change detected on repository so far."
				);
			} else {
				console.log(
					"[devices] CHANGE DETECTED! - TODO: Commence re-build (will notify user but needs to get all required user data first (owner/device is in path)"
				);
			}
		} else {
			console.log("[devices] watcher_callback: no result");
		}
	};

	var _private = {
		// warning, copy of same function in device! violates DRY principle. Which of those is used?
		normalizedMAC: function(mac) {
			if (mac.length == 17) {
				return mac.toUpperCase();
			} else {
				var ms = mac.toString().replace(/:/g, "");
				var m = ms.split("");
				var retval = m[0].toString() + m[1].toString() + ":" +
					m[2].toString() + m[3].toString() + ":" +
					m[4].toString() + m[5].toString() + ":" +
					m[6].toString() + m[7].toString() + ":" +
					m[8].toString() + m[9].toString() + ":" +
					m[10].toString() + m[11].toString();
				return retval.toUpperCase();
			}
		}
	};

	// public
	var _public = {
		list: function(owner, callback) {
			devicelib.view("devicelib", "devices_by_owner", {
					"key": owner,
					"include_docs": false
				},
				function(err, body) {

					if (err) {
						if (err.toString() == "Error: missing") {
							callback(false, "none");
						}
						console.log("/api/user/devices: Error: " + err.toString());
						return;
					}

					var rows = body.rows; // devices returned
					var devices = [];
					for (var row in rows) {
						var rowData = rows[row];
						var dvc = rowData.value;

						if (typeof(dvc.source) === "undefined") {
							dvc.source = null;
						}

						var platform = "unknown";
						if (typeof(dvc.platform) !== "undefined") {
							platform = dvc.platform;
						}

						var deviceDescriptor = {
							udid: dvc.udid,
							mac: _private.normalizedMAC(dvc.mac),
							firmware: dvc.firmware,
							alias: dvc.alias,
							owner: dvc.owner,
							version: dvc.version,
							lastupdate: dvc.lastupdate,
							source: dvc.source,
							platform: platform,
							keyhash: dvc.keyhash
						};

						devices.push(deviceDescriptor);
					}
					callback(true, {
						success: true,
						devices: devices
					});
				});
		},

		attach: function(owner, body, callback) {

			if (typeof(body.source_id) === "undefined") {
				callback(false, "missing_source_id");
				return;
			}

			if (typeof(body.udid) === "undefined") {
				callback(false, "missing_udid");
				return;
			}

			console.log("[devices][attach] body: " + JSON.stringify(body));

			var source_id = body.source_id;
			var udid = body.udid;

			console.log("Attach " + source_id + " to " + udid);

			alog.log(owner, "Attempt to attach repository: " + source_id +
				" to device: " + udid);

			console.log("[OID:" + owner + "] [DEVICE_ATTACH] " + udid);

			devicelib.get(udid, function(err, body) {

				if (err) {
					console.log("find error: " + err);
					return;
				}

				console.log("Got device document body: " + JSON.stringify(body));

				if (typeof(body) === "undefined") {
					callback(false, "udid_not_found:" + udid);
					alog.log(owner,
						"Attempt to attach repository to non-existent device: " +
						udid);
					return;
				}

				// TODO: FIXME: Support batch ops here
				var doc = body;
				var docstring = JSON.stringify(doc);

				alog.log(doc.owner, "Attaching repository to device: " +
					docstring);
				console.log("Attaching repository to device: " +
					docstring);

				deploy.initWithOwner(doc.owner);
				var repo_path = deploy.pathForDevice(doc.owner, doc.udid);
				console.log(
					"[ATTACH] repo_path: " + repo_path);

				mkdirp(repo_path, function(err) {
					if (err) console.error(err);
					else console.log("[ATTACH] " + repo_path + " created.");
				});

				doc.source = source_id;

				devicelib.destroy(doc._id, doc._rev, function(err) {
					delete doc._rev;
					devicelib.insert(doc, doc.udid, function(err, body,
						header) {
						if (err) {
							console.log("/api/device/attach ERROR:" + err);
							callback(false, "attach_failed");
							return;
						} else {
							console.log("INSERT: " + JSON.stringify(body));
							callback(true, source_id);
						}

						if (fs.existsSync(repo_path)) {
							watcher.watchRepository(repo_path,
								watcher_callback);
						} else {
							console.log("[ATTACH+WATCH] " + repo_path +
								" is not a directory.");
						}
					});
				});
			});
		},

		detach: function(owner, body, callback) {

			if (typeof(body.udid) === "undefined") {
				callback(false, "missing_udid");
				return;
			}

			var udid = body.udid;

			alog.log(owner, "Attempt to detach repository from device: " + udid);

			devicelib.view("devicelib", "devices_by_udid", {
				"key": udid,
				"include_docs": true
			}, function(err, body) {

				if (err) {
					console.log(err);
					return;
				}

				var rows = body.rows[0];
				if (typeof(rows) !== "undefined") {
					console.log("DETACH rows: " + JSON.stringify(rows));
				} else {
					callback(false, "udid_not_found");
					return;
				}

				var doc;
				console.log("BODY ROWS2: " + JSON.stringify(body.rows[0]));

				if (typeof(body.rows[0]) === "undefined") {
					callback(false, "device_not_found:" + udid);
				}

				// TODO: FIXME: Support batch ops here
				doc = body.rows[0].value;

				console.log("Detaching repository from device: " + JSON.stringify(
					doc.udid));

				var repo_path = deploy.pathForDevice(doc.owner, doc.udid);
				console.log("repo_path: " + repo_path);

				if (fs.existsSync(repo_path)) {
					watcher.unwatchRepository(repo_path);
				}

				devicelib.destroy(doc._id, doc._rev, function(err) {

					delete doc._rev;
					doc.source = null;

					devicelib.insert(doc, doc.udid, function(err, body,
						header) {
						if (err) {
							console.log("/api/device/detach ERROR:" + err);
							callback(false, "detach_failed");
							return;
						} else {
							callback(true, false);
						}
					});
				});
			});
		},

		revoke: function(owner, body, callback) {

			// Global Method

			function destroy_device(id, rev, owner, destroy_callback) {
				var logmessage = "Revoking device: " + JSON.stringify(id);
				alog.log(
					owner, logmessage);

				devicelib.destroy(id, rev, function(err) {

					if (err) {
						console.log(err);
						if (typeof(destroy_callback) !== "undefined") destroy_callback(
							false,
							"revocation_failed");
						return;

					} else {

						var passwords_path = app_config.project_root + "/mqtt_passwords";

						if (fs.existsSync(passwords_path)) {
							var CMD = "mosquitto_passwd -D " + passwords_path + " " + id;
							var temp = exec.execSync(CMD);
							if (temp) {
								// console.log("[REVOKE_ERROR] MQTT: " + temp);
							}
							console.log("[OID:" + owner +
								"] [DEVICE_REVOCATION] " +
								id);
							alog.log(owner, logmessage);

							if (typeof(destroy_callback) !== "undefined") destroy_callback(
								true, id);
						}
					}
				});
			}

			// Implementation

			var udids;

			if (typeof(body.udid) === "undefined") {
				if (typeof(body.udids) === "undefined") {
					callback(false, "missing_udids");
					return;
				} else {
					udids = body.udids;
				}
			} else {
				udids = [body.udid];
			}

			alog.log(owner, "Attempt to revoke devices: " + JSON.stringify(udids));

			devicelib.view("devicelib", "devices_by_owner", {
					"key": owner,
					"include_docs": true
				},
				function(err, body) {

					if (err) {
						console.log(err);
						return;
					}

					if (body.rows.count === 0) {
						alog.log(owner, "No devices for owner.");
						callback(false, "no_device_for_owner");
						return;
					}

					//console.log("Device revocation: BODY ROWS3: " + JSON.stringify(body.rows[0]));

					if (typeof(body.rows[0]) === "undefined") {
						callback(false, "devices_not_found:" + JSON.stringify(udids));
					}

					var doc;
					var devices = body.rows;
					var devices_for_revocation = [];

					for (var dindex in body.rows) {
						var device = body.rows[dindex].value;
						var device_udid = device.udid;
						if (udids.toString().indexOf(device_udid) !== -1) {
							devices_for_revocation.push(device);
						}
					}

					console.log("Devices for revocation: " + JSON.stringify(
						devices_for_revocation));

					// Simple/Group delete
					if (devices_for_revocation.count === 0) {
						callback(false, "devices_not_found");
						return;

					} else if (devices_for_revocation.count == 1) {
						doc = body.rows[0];
						console.log("Destroying single device: " + doc.udid);
						destroy_device(doc._id, doc._rev, owner, function(err, status) {
							console.log("Simple destroy: " + err + " status: " + status);
							callback(true, doc._id);
						});
						return;

					} else {

						for (var gindex in devices_for_revocation) {
							doc = devices_for_revocation[gindex];
							console.log("Destroying multiple devices at " + gindex + ": " +
								JSON.stringify(doc));
							if (dindex < devices.count) {
								destroy_device(doc.udid, doc._rev, owner);
							} else {
								console.log("Destroying last device: " + doc.udid);
								destroy_device(doc.udid, doc._rev, owner); // callback shall be undefined
							}
						}
					}

					callback(true, "async_progress");

				});
		}
	};

	return _public;

})();

exports.list = Devices.list;
exports.attach = Devices.attach;
exports.detach = Devices.detach;
exports.revoke = Devices.revoke;
