/** This THiNX-RTM API module is responsible for managing userlib records. */

var Devices = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var devicelib = require("nano")(db).use("managed_devices");

	var fs = require("fs");
	var exec = require("child_process");
	var mkdirp = require('mkdirp');

	var alog = require("./audit");
	var deploy = require("./deployment");
	var watcher = require("./lib/thinx/repository");

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
					var devices = []; // an array by design (needs push), to be encapsulated later

					/*
					// Show all devices for admin (if not limited by query)
					if (req.session.admin === true && typeof(body.query) ==
						"undefined") {
						callback(true, {
							devices: devices
						});
						return;
					} */

					for (var row in rows) {
						var rowData = rows[row];
						var dvc = rowData.value;
						// Compare owner to device owner
						if (owner.indexOf(rowData.key) != -1) {
							if (typeof(dvc.source) === "undefined") {
								dvc.source = null;
							}

							var deviceDescriptor = {
								udid: dvc.udid,
								mac: dvc.mac,
								firmware: dvc.firmware,
								alias: dvc.alias,
								owner: dvc.owner,
								version: dvc.version,
								lastupdate: dvc.lastupdate,
								source: dvc.source
							};

							devices.push(deviceDescriptor);
						}
					}
					callback(true, {
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

			var source_id = body.source_id;

			var udid = body.udid;

			alog.log(owner, "Attempt to attach repository: " + source_id +
				" to device: " + udid);

			console.log("[OID:" + owner + "] [DEVICE_ATTACH] " + udid);

			devicelib.view("devicelib", "devices_by_udid", {
				"key": udid,
				"include_docs": true
			}, function(err, body) {

				if (err) {
					console.log("find error: " + err);
					return;
				}

				if (body.rows.length === 0) {
					callback(false, "udid_not_found");
					alog.log(owner,
						"Attempt to attach repository to non-existent device: " +
						udid);
					return;
				}

				if (typeof(body.rows[0]) === "undefined") {
					console.log("Invalid device body: " + JSON.stringify(body));
					return;
				}

				var doc;
				console.log("BODY ROWS1: " + JSON.stringify(body.rows[0]));
				if (!body.rows[0].hasOwnProperty("value")) {
					callback(false, "device_not_found:" + udid);
					return;
				} else {
					doc = body.rows[0].value;
				}

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
					else console.log("[ATTACH] " + repo_path + ' created.');
				});

				doc.source = source_id;

				devicelib.destroy(doc._id, doc._rev, function(err) {
					delete doc._rev;
					devicelib.insert(doc, doc._id, function(err, body,
						header) {
						if (err) {
							console.log("/api/device/attach ERROR:" + err);
							callback(false, "attach_failed");
							return;
						} else {
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
				if (!body.rows[0].hasOwnProperty("value")) {
					callback(false, "device_not_found:" + udid);
					return;
				} else {
					doc = body.rows[0].value;
				}

				console.log("Detaching repository from device: " + JSON.stringify(
					doc.udid));

				var repo_path = deploy.pathForDevice(doc.owner, doc.udid);
				console
					.log(
						"repo_path: " + repo_path);
				if (fs.existsSync(repo_path)) {
					watcher.unwatchRepository(repo_path);
				}

				doc.source = null;

				devicelib.destroy(doc._id, doc._rev, function(err) {

					delete doc._rev;

					devicelib.insert(doc, doc._id, function(err, body,
						header) {
						if (err) {
							console.log("/api/device/detach ERROR:" + err);
							callback(false, "detach_failed");
							return;
						} else {
							callback(true, doc.source);
						}
					});
				});
			});
		},

		revoke: function(owner, body, callback) {
			if (typeof(body.udid) === "undefined") {
				callback(false, "missing_udid");
				return;
			}

			var udid = body.udid;

			alog.log(owner, "Attempt to revoke device: " + udid);

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
						alog.log(owner, "No such device: " + udid);
						callback(false, "no_such_device");
						return;
					}

					var doc;

					for (var dindex in body.rows) {
						//if (!body.rows[dindex].hasOwnProperty("value")) continue;
						var device = body.rows[dindex].value;
						var device_udid = device.udid;
						if (device_udid.indexOf(udid) != -1) {
							doc = device;
							break;
						}
					}

					console.log("BODY ROWS3: " + JSON.stringify(body.rows[0]));

					if (!body.rows[0].hasOwnProperty("value")) {
						callback(false, "device_not_found:" + udid);
						return;
					} else {
						doc = body.rows[0].value;
					}

					var logmessage = "Revoking device: " + JSON.stringify(doc.udid);
					alog.log(
						owner, logmessage);

					devicelib.destroy(doc._id, doc._rev, function(err) {

						if (err) {
							console.log(err);
							callback(false, "revocation_failed");
							return;

						} else {

							let CMD = "mosquitto_passwd -D" + app_config.project_root +
								"/mqtt_passwords " + doc.udid;
							var temp = exec.execSync(CMD);
							if (temp) {
								// console.log("[REVOKE_ERROR] MQTT: " + temp);
							}
							console.log("[OID:" + owner +
								"] [DEVICE_REVOCATION] " +
								doc.udid);
							alog.log(owner, logmessage);
							callback(true, doc.udid);
						}
					});
				});
		}

	};

	return _public;

})();

exports.list = Devices.list;
exports.attach = Devices.attach;
exports.detach = Devices.detach;
exports.revoke = Devices.revoke;
