/** This THiNX-RTM API module is responsible for managing userlib records. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var fs = require("fs-extra");
var db = app_config.database_uri;
var devicelib = require("nano")(db).use(prefix + "managed_devices");
var exec = require("child_process");
var mkdirp = require("mkdirp");

var Auth = require('./auth'); var auth = new Auth();
var AuditLog = require("./audit"); var alog = new AuditLog();
var Deployment = require("./deployment"); var deploy = new Deployment();
var Watcher = require("./repository"); var watcher = new Watcher();
var Device = require("./device"); var device = new Device();
var Sources = require("./sources"); var sources = new Sources();

var sanitka = require("./sanitka"); var Sanitka = new sanitka();
var rsakey = require("./rsakey"); var RSAKey = new rsakey();

const Validator = require('../../lib/thinx/validator');

module.exports = class Devices {

	constructor(messenger) {
		this.messenger = messenger;
	}

	prefetch_repository(repo_path, source_id, owner) {

		if (fs.existsSync(repo_path)) {

			sources.list(owner, (success, response) => {

				if (success !== true) {
					console.log("Unexpected 'Source List' in 'Device Attach' error!");
					return;
				}

				var all_sources = response;
				console.log(JSON.stringify(all_sources));
				var source = all_sources[source_id];
				console.log("Prefetching: ", source);

				// Attempt for at least some sanitation of the user input to prevent shell and JSON injection

				var branch = source.branch;

				if (typeof(branch) === "undefined" || branch === null) {
					branch = "origin/master";
				}

				const sanitized_branch = Sanitka.branch(branch);
				const sanitized_url = Sanitka.url(source.git);

				// TODO: Do not continue if repo path does not exist!
				// TODO: add exit on error; check after clone...
				// in case repo_path is is empty
				var GIT_PREFETCH = "bash -c \"set +e; cd " + repo_path +
					"; echo Cleaning workdir...; rm -rf *; git clone -b " + sanitized_branch + " " + sanitized_url +
					"; cd *; git pull origin " + sanitized_branch + " --recurse-submodules\"";

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
					const key_paths = RSAKey.getKeyPathsForOwner(owner);

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

				var platform = watcher.getPlatform(repo_path, (success, platform) => {
					sources.updatePlatform(owner, source_id, platform);
					//console.log("Cleaning-up repo_path: " + repo_path);
					var CLEANUP = "bash -c \"rm -rf " + repo_path + "\"";
					console.log(CLEANUP);
					exec.execSync(CLEANUP);
				});
			});

		} else {
			console.log("[ATTACH+WATCH] " + repo_path + " is not a directory.");
		}
	}

	destroy_device(id, rev, owner, destroy_callback) {
		var logmessage = "Revoking device: " + JSON.stringify(id);
		alog.log(owner, logmessage);
		devicelib.destroy(id, rev, (err) => {
			if (err) {
				console.log(err);
				if (typeof(destroy_callback) !== "undefined" && (destroy_callback != null)) {
					destroy_callback(false, "revocation_failed");
				}
			} else {
				auth.revoke_mqtt_credentials(id);
				console.log("[OID:" + owner + "] [DEVICE_REVOCATION] " + id);
				alog.log(owner, logmessage);
				if ((typeof(destroy_callback) !== "undefined") && (destroy_callback != null)) {
					destroy_callback(true, id);
				}
			}
		});
	}

	revoke_devices(owner, udids, body, destroy_callback) {

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

		// Simple/Group delete
		if (devices_for_revocation.length === 0) {
			destroy_callback(false, "devices_not_found");
			return;

		} else if (devices_for_revocation.length == 1) {
			doc = devices_for_revocation[0];
			console.log("Destroying single device: " + doc._id);
			this.destroy_device(doc._id, doc._rev, owner, (err, status) => {
				console.log("Simple destroy: " + err + " status: " + status);
				if ((typeof(destroy_callback) !== "undefined") && (destroy_callback != null)) {
					destroy_callback(true, doc._id);
				}
			});
			return;

		} else {

			var d_index = 0;
			for (var gindex in devices_for_revocation) {
				doc = devices_for_revocation[gindex];
				console.log("Destroying multiple devices at " + gindex + ": " +
					JSON.stringify(doc.udid));
				if (d_index < devices.length) {
					this.destroy_device(doc.udid, doc._rev, owner);
				} else {
					console.log("Destroying last device: " + doc.udid);
					if ((typeof(destroy_callback) !== "undefined") && (destroy_callback != null)) {
						destroy_callback(true, doc.udid);
					}
				}
				d_index++;
			}
		}

		if ((typeof(destroy_callback) !== "undefined") && (destroy_callback != null)) {
			destroy_callback(true, "async_progress");
		}
	}

	// public

	list(owner, callback) {
		devicelib.view("devicelib", "devices_by_owner", {
				"key": owner,
				"include_docs": false
			}, (err, body) => {

				if (err) {
					console.log("list error: " + err);
					if ((err.toString().indexOf("Error: missing") !== -1) && typeof(callback) !== "undefined") {
						if (typeof(callback) !== "undefined") callback(false, "none");
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
				if (typeof(callback) !== "undefined")
					callback(true, {
						success: true,
						devices: devices
					});
			});
	}

	attach(owner, body, callback) {

		if (typeof(body.source_id) === "undefined") {
			callback(false, "missing_source_id");
			return;
		}

		if (typeof(body.udid) === "undefined") {
			callback(false, "missing_udid");
			return;
		}

		//console.log("[devices][attach] body: ", {body});

		var source_id = body.source_id;
		var udid = Validator.udid(body.udid);

		console.log("Attach " + source_id + " to " + udid);

		alog.log(
			owner,
			"Attempt to attach repository: " + source_id + " to device: " + udid
		);

		console.log("[OID:" + owner + "] [DEVICE_ATTACH] " + udid);

		devicelib.get(udid, (err, body) => {

			if (err) {
				console.log("find error: " + err);
				callback(false, err);
				return;
			}

			if (typeof(body) === "undefined") {
				callback(false, "udid_not_found:" + udid);
				alog.log(
					owner,
					"Attempt to attach repository to non-existent device: " + udid
				);
				return;
			}

			// TODO: FIXME: Support batch ops here
			var doc = body;

			alog.log(doc.owner, "Attaching repository to device: " + udid);

			deploy.initWithOwner(doc.owner);
			var repo_path = deploy.pathForDevice(doc.owner, doc.udid);
			console.log("[ATTACH] repo_path: " + repo_path);

			try {
				mkdirp.sync(repo_path);
			} catch (erro) {
				if (erro) console.error(erro);
				else console.log("[ATTACH] " + repo_path + " created.");
			}

			doc.source = source_id;

			devicelib.destroy(doc._id, doc._rev, (err) => {
				delete doc._rev;
				devicelib.insert(doc, doc.udid, (err, body, header) => {
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
					this.prefetch_repository(repo_path, source_id, owner);
				});
			});
		});
	}

	detach(owner, body, callback) {

		if (typeof(body) === "undefined") {
			callback(false, "missing_body");
			return;
		}

		if (typeof(body.udid) === "undefined") {
			callback(false, "missing_udid");
			return;
		}

		//console.log("Detach request body: ", {body});

		var udid = Validator.udid(body.udid);

		alog.log(owner, "Attempt to detach repository from device: " + udid);

		devicelib.view("devicelib", "devices_by_udid", {
			"key": udid,
			"include_docs": true
		}, (err, body) => {

			if (err) {
				console.log("ERRO:" + err);
				callback(false, err);
				return;
			}

			if (body.rows.length == 0) {
				callback(false, "no_such_device");
				return;
			}

			var rows = body.rows[0];
			if (typeof(rows) === "undefined") {
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

			console.log("Detaching repository from device: ", { udid: doc.udid, revision: doc._rev });

			var repo_path = deploy.pathForDevice(doc.owner, doc.udid);
			console.log("repo_path: " + repo_path);

			devicelib.destroy(doc._id, doc._rev, (err) => {

				delete doc._rev;
				doc.source = null; // detach source

				devicelib.insert(doc, doc.udid, (err, body, header) => {
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
	}

	revoke(owner, body, destroy_callback) {

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
			(err, body) => {

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

				if (typeof(body.rows[0]) === "undefined") {
					destroy_callback(false, "devices_not_found:" + JSON.stringify(udids));
					return;
				}

				this.revoke_devices(owner, udids, body, destroy_callback);
			});
	}

	// Push configuration to one or more devices (store and use MQTT)
	push(owner, body, callback) {
		var udids;
		this.messenger.initWithOwner(owner, null /* no socket */ ,
		  (error, response) => {
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
					this.messenger.publish(owner, udids[dindex], {
						configuration: body.enviros
					});
				}
				callback(true, "pushing_configuration");
			});
	}
};
