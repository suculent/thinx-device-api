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
var Device = require("./device"); var device = new Device();
var Sources = require("./sources");

var sanitka = require("./sanitka"); var Sanitka = new sanitka();
var rsakey = require("./rsakey"); var RSAKey = new rsakey();

const Validator = require('../../lib/thinx/validator');
var shellescape = require('shell-escape');

var Platform = require("./platform");

module.exports = class Devices {

	constructor(messenger) {
		this.sources = new Sources();
		this.platform = new Platform();
		if (typeof (messenger) !== "undefined") {
			this.messenger = messenger;
		}
	}

	prefetch_repository(repo_path, source_id, owner) {

		if (fs.existsSync(repo_path)) {

			this.sources.list(owner, (success, response) => {

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

				if (typeof (branch) === "undefined" || branch === null) {
					branch = "origin/master";
				}

				const sanitized_branch = Sanitka.branch(branch);
				let sanitized_url = Sanitka.url(source.url);
				sanitized_url = shellescape([sanitized_url]);
				sanitized_url = sanitka.deescape(sanitized_url);

				// TODO: Do not continue if repo path does not exist!
				// TODO: add exit on error; check after clone...
				// in case repo_path is is empty
				var GIT_PREFETCH = "bash -c \"" +
					"set +e; " + "mkdir -p " + repo_path + ";" +
					" cd " + repo_path + ";" +
					"rm -rf *;" +
					"git clone -b " + sanitized_branch.replace("origin/", "") + " \"" + sanitized_url + "\";" +
					"cd *; " +
					"git pull --recurse-submodules" +
					"\"";

				console.log("[DEBUG] git prefetch command:\n", GIT_PREFETCH);

				var result;

				try {
					result = exec.execSync(GIT_PREFETCH).toString().replace("\n", "");
					console.log("git prefetch result: " + result);
				} catch (e) {
					console.log("git prefetch not successful, never mind...");
					if (typeof (result) === "undefined") {
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
						var prefetch_prefix = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
						console.log("git prefix: " + prefetch_prefix);
						try {
							result = exec.execSync(prefix + GIT_PREFETCH + "'").toString().replace("\n", "");
							console.log("[devices] git rsa clone result: " + result);
							break;
						} catch (e) {
							console.log("git rsa clone error: " + e);
						}
					}
				} else {
					console.log("GIT Fetch Result: " + result);
				}

				this.platform.getPlatform(repo_path, (update_success, watcher_platform) => {
					if (!update_success) {
						console.info("Failed this.platform.getPlatform() in sources.list()");
					}
					this.sources.updatePlatform(owner, source_id, watcher_platform);
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
				if (typeof (destroy_callback) !== "undefined" && (destroy_callback != null)) {
					destroy_callback(false, "revocation_failed");
				}
			} else {
				auth.revoke_mqtt_credentials(id);
				console.log("[OID:" + owner + "] [DEVICE_REVOCATION] " + id);
				alog.log(owner, logmessage);
				if ((typeof (destroy_callback) !== "undefined") && (destroy_callback != null)) {
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
			var a_device = body.rows[dindex].value;
			var device_udid = a_device.udid;
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
				if ((typeof (destroy_callback) !== "undefined") && (destroy_callback != null)) {
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
					if ((typeof (destroy_callback) !== "undefined") && (destroy_callback != null)) {
						destroy_callback(true, doc.udid);
					}
				}
				d_index++;
			}
		}

		if ((typeof (destroy_callback) !== "undefined") && (destroy_callback != null)) {
			destroy_callback(true, "async_progress");
		}
	}

	// public

	udidsWithSource(owner, source_id, callback) {
		this.list("*", (success, result) => {
			let udids = [];
			if (!success) {
				console.log("listing failed");
				callback(udids);
				return;
			}
			console.log("owner devices:", udids);
			for (var i = 0; i < result.length; i++) {
				let a_device = result[i];
				if ((a_device.auto_update == true) && (a_device.source_id == source_id)) {
					console.log("adding", a_device.udid, "for source", source_id);
					udids.push(a_device.udid);
				} else {
					console.log("ineligible device:", a_device);
				}
			}
			console.log("udidsWithSource returns udids", udids);
			callback(udids);
		});
	}

	list(owner, callback) {

		// prevent listing all devices with empty owner, should be validated
		if ((typeof (owner) === "undefined") || (owner == "")) {
			callback(true, {
				success: false,
				devices: []
			});
			return;
		}

		if (Validator.owner(owner) === false) {
			callback(false, {
				success: false,
				reason: "invalid_owner"
			});
			return;
		}

		devicelib.view("devicelib", "devices_by_owner", {
			"key": owner,
			"include_docs": false
		}, (err, body) => {

			if (err) {
				console.log("list error: " + err);
				if ((err.toString().indexOf("Error: missing") !== -1) && typeof (callback) !== "undefined") {
					if (typeof (callback) !== "undefined") callback(false, "none");
				}
				console.log("/api/user/devices: Error: " + err.toString());
				return;
			}

			var rows = body.rows; // devices returned
			var devices = [];
			for (var row in rows) {
				var rowData = rows[row];
				var dvc = rowData.value;

				if (typeof (dvc.source) === "undefined") {
					dvc.source = null;
				}

				var platform = "unknown";
				if (typeof (dvc.platform) !== "undefined") {
					platform = dvc.platform;
				}

				if (typeof (dvc.tags) === "undefined") {
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
			if (typeof (callback) !== "undefined")
				callback(true, {
					success: true,
					devices: devices
				});
		});
	}

	attach(owner, body, callback) {

		if (typeof (body.source_id) === "undefined") {
			callback(false, "missing_source_id");
			return;
		}

		if (typeof (body.udid) === "undefined") {
			callback(false, "missing_udid");
			return;
		}

		var source_id = body.source_id;
		var udid = Validator.udid(body.udid);

		alog.log(
			owner,
			"Attempt to attach repository: " + source_id + " to device: " + udid
		);

		console.log("[OID:" + owner + "] [DEVICE_ATTACH] " + udid);

		devicelib.get(udid, (pre_attach_err, pre_attach_body) => {

			if (pre_attach_err) {
				console.log("find error: " + pre_attach_err);
				callback(false, pre_attach_err);
				return;
			}

			if (typeof (pre_attach_body) === "undefined") {
				callback(false, "udid_not_found:" + udid);
				alog.log(owner, "Attempt to attach repository to non-existent device: " + udid);
				return;
			}

			var doc = pre_attach_body;

			deploy.initWithOwner(doc.owner);
			var repo_path = deploy.pathForDevice(doc.owner, doc.udid);

			try {
				mkdirp.sync(repo_path);
			} catch (erro) {
				if (erro) console.error(erro);
				else console.log("[ATTACH] " + repo_path + " created.");
			}

			doc.source = source_id;

			devicelib.destroy(doc._id, doc._rev, (err) => {
				delete doc._rev;
				devicelib.insert(doc, doc.udid, (reinsert_err, reinsert_body, header) => {
					if (reinsert_err) {
						console.log("/api/device/attach ERROR:" + reinsert_err);
						callback(false, "attach_failed");
						return;
					} else {
						console.log("INSERT: " + JSON.stringify(reinsert_body));
						callback(true, source_id);
					}
					this.prefetch_repository(repo_path, source_id, owner);
				});
			});
		});
	}

	detach(owner, body, callback) {

		if (typeof (body) === "undefined") {
			callback(false, "missing_body");
			return;
		}

		if (typeof (body.udid) === "undefined") {
			callback(false, "missing_udid");
			return;
		}

		var udid = Validator.udid(body.udid);

		alog.log(owner, "Attempt to detach repository from device: " + udid);

		devicelib.view("devicelib", "devices_by_udid", {
			"key": udid,
			"include_docs": true
		}, (err, detach_body) => {

			if (err) {
				console.log("ERRO:" + err);
				callback(false, err);
				return;
			}

			if (detach_body.rows.length == 0) {
				callback(false, "no_such_device");
				return;
			}

			var rows = detach_body.rows[0];
			if (typeof (rows) === "undefined") {
				callback(false, "udid_not_found(1):" + udid);
				return;
			}

			var doc;

			if (typeof (detach_body.rows[0]) === "undefined") {
				callback(false, "device_not_found(2):" + udid);
				return;
			}

			// TODO: FIXME: Support batch ops here
			doc = detach_body.rows[0].value;

			console.log("Detaching repository from device: ", { udid: doc.udid, revision: doc._rev });

			devicelib.destroy(doc._id, doc._rev, () => {
				delete doc._rev;
				doc.source = null; // this detaches the source
				devicelib.insert(doc, doc.udid, (detach_reinsert_err) => {
					if (detach_reinsert_err) {
						console.log("/api/device/detach ERROR:" + detach_reinsert_err);
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

		if (typeof (body.udid) === "undefined") {
			if (typeof (body.udids) === "undefined") {
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
		}, (err, view_body) => {

			if (err) {
				console.log(err);
				destroy_callback(false, err);
				return;
			}

			if (view_body.rows.length === 0) {
				alog.log(owner, "No devices for owner.");
				destroy_callback(false, "no_device_for_owner");
				return;
			}

			if (typeof (view_body.rows[0]) === "undefined") {
				destroy_callback(false, "devices_not_found:" + JSON.stringify(udids));
				return;
			}

			this.revoke_devices(owner, udids, view_body, destroy_callback);
		});
	}

	// Push configuration to one or more devices (store and use MQTT)
	push(owner, body, callback) {
		var udids;
		this.messenger.initWithOwner(owner, null /* no socket */, (error, response) => {
			if (typeof (body.udid) === "undefined") {
				if (typeof (body.udids) === "undefined") {
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
