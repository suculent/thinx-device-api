/** This THiNX-RTM API module is responsible for managing userlib records. */

var Devices = (function() {

	var Globals = require("./globals.js");
	var app_config = Globals.app_config();
	var prefix = Globals.prefix();
	var rollbar = Globals.rollbar();

	var fs = require("fs-extra");
	var db = app_config.database_uri;
	var auth = require('./auth.js');

	var devicelib = require("nano")(db).use(prefix + "managed_devices");

	var exec = require("child_process");
	var mkdirp = require("mkdirp");
	var shellescape = require('shell-escape');

	var alog = require("./audit");
	var deploy = require("./deployment");
	var watcher = require("./repository");
	var device = require("./device");
	var sources = require("./sources");
	var messenger = require("./messenger");

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

	// public
	var _public = {
		list: function(owner, callback) {
			devicelib.view("devicelib", "devices_by_owner", {
					"key": owner,
					"include_docs": false
				},
				function(err, body) {

					if (err) {
						console.log("list error: " + err);
						if ((err.toString().indexOf("Error: missing") !== -1) && typeof(callback) !==
							"undefined") {
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

						if (typeof(dvc.tags) === "undefined") {
							dvc.tags = [];
						}

						// TODO: Get current timezone_abbr and return timezone_offset for that zone with current DST


						var deviceDescriptor = {
							alias: dvc.alias,
							artifact: dvc.artifact,
							last_build_id: dvc.last_build_id,
							last_build_date: dvc.last_build_date,
							auto_update: dvc.auto_update,
							category: dvc.category || "grey-mint",
							checksum: dvc.checksum,
							commit: dvc.commit || "Unknown",
							description: dvc.description,
							firmware: dvc.firmware,
							icon: dvc.icon,
							keyhash: dvc.keyhash,
							lastupdate: dvc.lastupdate,
							lat: dvc.lat,
							lon: dvc.lon,
							mac: device.normalizedMAC(dvc.mac),
							owner: dvc.owner,
							platform: platform,
							rssi: dvc.rssi,
							snr: dvc.snr,
							source: dvc.source,
							station: dvc.station,
							status: dvc.status,
							tags: dvc.tags,
							timezone_abbr: dvc.timezone_abbr,
							timezone_offset: dvc.timezone_offset,
							timezone_utc: dvc.timezone_utc,
							transformers: dvc.transformers,
							transformer_error: dvc.status_error,
							udid: dvc.udid,
							version: dvc.version
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

						console.log(
							"Warning: devices.js uses deprecated repository watcher instead of recommended webhooks."
						);

						if (fs.existsSync(repo_path)) {

							sources.list(owner, function(success, response) {

								if (success === true) {

									var all_sources = response;
									console.log(JSON.stringify(all_sources));
									var source = all_sources[source_id];

									// Attempt for at least some sanitation of the user input to prevent shell and JSON injection
									var sanitized_branch = branch.replace("origin/", "");
											sanitized_branch = sanitized_branch.replace(/{/g, "");
											sanitized_branch = sanitized_branch.replace(/}/g, "");
											sanitized_branch = sanitized_branch.replace(/\\/g, "");
											sanitized_branch = sanitized_branch.replace(/"/g, "");
											sanitized_branch = sanitized_branch.replace(/'/g, "");
											sanitized_branch = sanitized_branch.replace(/;/g, "");
											sanitized_branch = sanitized_branch.replace(/&/g, "");

									var sanitized_url = git.replace("'", "");
											sanitized_url = sanitized_url.replace(/{/g, "");
											sanitized_url = sanitized_url.replace(/}/g, "");
											sanitized_url = sanitized_url.replace(/\\/g, "");
											sanitized_url = sanitized_url.replace(/"/g, "");
											sanitized_url = sanitized_url.replace(/'/g, "");
											sanitized_url = sanitized_url.replace(/;/g, "");
											sanitized_url = sanitized_url.replace(/&/g, "");

									// TODO: Do not continue if repo path does not exist!
									// TODO: add exit on error; check after clone...
									// in case repo_path is is empty
									var GIT_PREFETCH = "bash -c \"set +e; cd " + repo_path +
										"; echo Cleaning workdir...; rm -rf *; git clone -b " + sanitized_branch + " " + sanitized_url +
										"; cd *; git pull origin " + sanitized_branch + " --recurse-submodules\"";

									// TODO: FIXME
									// GIT_PREFETCH = shellescape(GIT_PREFETCH);
									var nochange = "Already up-to-date.";
									var result;

									try {
										result = exec.execSync(GIT_PREFETCH).toString().replace(
										"\n", "");
										console.log("git prefetch result: " + result);
									} catch (e) {
										console.log("git prefetch not successful, never mind...");
										if (typeof(result) === "undefined") {
											result = "";
										}
									}

									// try to solve access rights issue by using owner keys...
									if (result.indexOf("Please make sure you have the correct access rights") !== -1) {

										console.log("Trying keys...");
										// 1 - find all keys for this owner
										var key_paths = fs.readdirSync(app_config.ssh_keys).filter(
											file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
										);

										// 2 - try all keys until success
										for (var kindex in key_paths) {
											// TODO: skip non-owner keys
											var prefix = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
											console.log("git prefix: " + prefix);
											try {
												result = exec.execSync(prefix + GIT_PREFETCH + "'").toString().replace("\n", "");
												console.log("[devices] git rsa clone result: " + result);
												break;
											} catch (e) {
												console.log("git rsa clone error: "+e);
											}
										}
									} else {
										console.log("GIT Fetch Result: " + result);
									}

									const platform = watcher.getPlatform(repo_path);
									sources.updatePlatform(doc.owner, source_id, platform);

									console.log("Cleaning-up repo_path: " + repo_path);
									var CLEANUP = "bash -c \"rm -rf " + repo_path + "\"";
									exec.execSync(CLEANUP);

								} else {
									console.log("Unexpected 'Source List' in 'Device Attach' error!");
								}

							});

						} else {
							console.log("[ATTACH+WATCH] " + repo_path +
								" is not a directory.");
						}
					});
				});
			});
		},

		detach: function(owner, body, callback) {

			if (typeof(body) === "undefined") {
				callback(false, "missing_body");
				return;
			}

			if (typeof(body.udid) === "undefined") {
				callback(false, "missing_udid");
				return;
			}

			console.log("Detach request body: " + JSON.stringify(body));

			var udid = body.udid;

			alog.log(owner, "Attempt to detach repository from device: " + udid);

			devicelib.view("devicelib", "devices_by_udid", {
				"key": udid,
				"include_docs": true
			}, function(err, body) {

				if (err) {
					console.log("ERRO:" + err);
					return;
				}

				var rows = body.rows[0];
				if (typeof(rows) !== "undefined") {
				} else {
					callback(false, "udid_not_found(1):" + udid);
					return;
				}

				var doc;

				if (typeof(body.rows[0]) === "undefined") {
					callback(false, "device_not_found(2):" + udid);
					return;
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
							callback(true, "detached");
						}
					});
				});
			});
		},

		revoke: function(owner, body, destroy_callback) {

			// Global Method

			function destroy_device(id, rev, owner, destroy_callback) {

				var logmessage = "Revoking device: " + JSON.stringify(id);
				alog.log(owner, logmessage);

				devicelib.destroy(id, rev, function(err) {

					if (err) {
						console.log(err);
						if (typeof(destroy_callback) !== "undefined" && (destroy_callback != null))
							destroy_callback(false, "revocation_failed");
						return;

					} else {

						auth.revoke_mqtt_credentials(id);
						console.log("[OID:" + owner + "] [DEVICE_REVOCATION] " + id);
						alog.log(owner, logmessage);

						if ( (typeof(destroy_callback) !== "undefined")
						     && (destroy_callback != null) ) {
							   destroy_callback(true, id);
						}
					}
				});
			}

			// Implementation

			var udids;

			if (typeof(body.udid) === "undefined") {
				if (typeof(body.udids) === "undefined") {
					destroy_callback(false, "missing_udids");
					return;
				} else {
					udids = body.udids;
				}
			} else {
				udids = [body.udid];
			}

			alog.log(owner, "Attempt to revoke devices: " + JSON.stringify(udids), "warning");

			devicelib.view("devicelib", "devices_by_owner", {
					"key": owner,
					"include_docs": true
				},
				function(err, body) {

					if (err) {
						console.log(err);
						destroy_callback(false, err);
						return;
					}

					if (body.rows.length === 0) {
						alog.log(owner, "No devices for owner.");
						destroy_callback(false, "no_device_for_owner");
						return;
					}

					//console.log("Device revocation: BODY ROWS3: " + JSON.stringify(body.rows[0]));

					if (typeof(body.rows[0]) === "undefined") {
						destroy_callback(false, "devices_not_found:" + JSON.stringify(udids));
						return;
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
					if (devices_for_revocation.length === 0) {
						destroy_callback(false, "devices_not_found");
						return;

					} else if (devices_for_revocation.length == 1) {
						doc = devices_for_revocation[0];
						console.log("Destroying single device: " + doc._id);
						destroy_device(doc._id, doc._rev, owner, function(err, status) {
							console.log("Simple destroy: " + err + " status: " + status);
							if ((typeof(destroy_callback) !== "undefined") && (destroy_callback != null)) {
								destroy_callback(true, doc._id);
							}
						});
						return;

					} else {

						for (var gindex in devices_for_revocation) {
							doc = devices_for_revocation[gindex];
							console.log("Destroying multiple devices at " + gindex + ": " +
								JSON.stringify(doc.udid));
							if (dindex < devices.length) {
								destroy_device(doc.udid, doc._rev, owner);
							} else {
								console.log("Destroying last device: " + doc.udid);
								if ((typeof(destroy_callback) !== "undefined") && (destroy_callback != null)) {
									destroy_device(doc.udid, doc._rev, owner);
								}
							}
						}
					}

					if ((typeof(destroy_callback) !== "undefined") && (destroy_callback != null)) {
						destroy_callback(true, "async_progress");
					}

				});
		},

		// Push configuration to one or more devices (store and use MQTT)
		push: function(owner, body, callback) {
			var udids;
			var msgr = messenger.initWithOwner(owner, null /* no socket */ ,
				function(error, response) {
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
					for (var dindex in udids) {
						messenger.publish(owner, udids[dindex], {
							configuration: body.enviros
						});
					}
					callback(true, "pushing_configuration");
				});
		}
	};

	return _public;

})();

exports.list = Devices.list;
exports.attach = Devices.attach;
exports.detach = Devices.detach;
exports.push = Devices.push;
exports.revoke = Devices.revoke;
