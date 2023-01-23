/** This THiNX Device Management API module is responsible for managing userlib records. */

const Globals = require("./globals.js");
const prefix = Globals.prefix();

const fs = require("fs-extra");
const mkdirp = require("mkdirp");
const chmodr = require('chmodr');

const ACL = require('./acl');
const AuditLog = require("./audit"); let alog = new AuditLog();
const Auth = require('./auth');
const Deployment = require("./deployment"); let deploy = new Deployment();
const Device = require("./device");
const Git = require("./git"); let git = new Git();
const Platform = require("./platform");
const Sanitka = require("./sanitka"); let sanitka = new Sanitka();
const Sources = require("./sources");

const Database = require("./database.js");
let db_uri = new Database().uri();
let devicelib = require("nano")(db_uri).use(prefix + "managed_devices");

const InfluxConnector = require('./influx');
const Util = require("./util.js");
const Filez = require("./files.js");
module.exports = class Devices {

	constructor(messenger, redis) {
		if (typeof (redis) === "undefined") {
			throw new Error("Devices require valid Redis for Auth");
		}
		this.sources = new Sources();
		this.messenger = messenger;
		this.auth = new Auth(redis);
		this.device = new Device(redis);
		this.client = redis;
	}

	// used on Device: Attach Repository, otherwise responsibility of sources which we already depend on
	prefetch_repository(repo_path, source_id, owner_id) {

		fs.ensureDirSync(repo_path);

		this.sources.list(owner_id, (success, response) => {

			if (success !== true) {
				console.log("☣️ [error] Unexpected 'Source List' in 'Device Attach'");
				return false;
			}

			let source = response[source_id];

			let branch = source.branch;
			if (typeof (branch) === "undefined" || branch === null) {
				branch = "origin/master";
			}

			const sanitized_branch = sanitka.branch(branch);
			if (sanitized_branch === false) {
				console.log("☣️ [error] Invalid branch name", branch);
				return false;
			}

			let sanitized_url = sanitka.url(source.url);

			let GIT_COMMAND = "set +e; " +
				"mkdir -p " + repo_path + "; " +
				"cd " + repo_path + "; " +
				"rm -rf *; " +
				"git clone  -b " + sanitized_branch.replace("origin/", "") + " \"" + sanitized_url + "\";" +
				"cd *; " +
				"git pull --recurse-submodules --ff-only; " +
				"chmod -R 776 *; ";

			if (git.fetch(owner_id, GIT_COMMAND, repo_path)) {
				// update repository privacy status asynchronously
				this.sources.update(owner_id, source_id, "is_private", true, (xuccess, error) => {
					if (xuccess) {
						console.log(`ℹ️ [info] [prefetch] repo privacy status updated to is_private=true; should prevent future public fetches`);
					} else {
						console.log(`[critical] [prefetch] updating repo privacy status failed with error ${error}`);
					}
				});
			} else {
				console.log(`[critical] [prefetch] failed with private keys after trying public fetch. This issue should be stored in audit log.`);
			}
			this.updatePlatform(repo_path, source_id, owner_id);
		});
	}

	updatePlatform(repo_path, source_id, owner_id) {
		Platform.getPlatform(repo_path, (ok, watcher_platform) => {
			if (!ok) console.log("⚠️ [warning] Failed Platform.getPlatform() in sources.list()");
			this.sources.updatePlatform(owner_id, source_id, watcher_platform, (ok, error) => {
				if (!ok) {
					console.log(`[error] failed updating platform ${watcher_platform} for ${source_id} with error ${error}`);
				} else {
					console.log(`ℹ️ [info] updated platform ${watcher_platform} for ${source_id}`);
				}
			});
		});
	}

	// private implementation
	destroy_device(id, rev, owner, destroy_callback) {
		let logmessage = "Revoking device: " + JSON.stringify(id);
		alog.log(owner, logmessage);
		devicelib.destroy(id, rev, (err) => {
			if (err) {
				console.log(err);
				if (typeof (destroy_callback) !== "undefined" && (destroy_callback != null)) {
					destroy_callback(false, "revocation_failed");
				}
			} else {
				this.auth.revoke_mqtt_credentials(id); // only call to auth in this class on destroy_device required with (id) only... from this class
				InfluxConnector.statsLog(owner, "DEVICE_REVOCATION", id);
				alog.log(owner, logmessage);
				if ((typeof (destroy_callback) !== "undefined") && (destroy_callback != null)) {
					destroy_callback(true, id);
				}
			}
		});
	}

	revoke_devices(owner, udids, body, destroy_callback, res) {

		let doc;
		let devices = body.rows;
		let devices_for_revocation = [];

		for (let dindex in body.rows) {
			let a_device = body.rows[dindex].value;
			let device_udid = a_device.udid;
			if (udids.toString().indexOf(device_udid) !== -1) {
				devices_for_revocation = [a_device];
			}
		}

		// Simple/Group delete
		if (devices_for_revocation.length === 0) {
			return destroy_callback(res, false, "devices_not_found");

		} else if (devices_for_revocation.length == 1) {
			doc = devices_for_revocation[0];
			if (typeof (doc) !== "undefined") {
				this.destroy_device(doc._id, doc._rev, owner, (/* success, status */) => {
					if ((typeof (destroy_callback) !== "undefined") && (destroy_callback != null)) {
						destroy_callback(res, true, doc._id);
					}
				});
			} else {
				if ((typeof (destroy_callback) !== "undefined") && (destroy_callback != null)) {
					destroy_callback(res, false, { devices_for_revocation });
				}
			}
			return;

		} else {

			let d_index = 0;
			for (let gindex in devices_for_revocation) {
				doc = devices_for_revocation[gindex];
				console.log("Destroying multiple devices at " + gindex + ": " +
					JSON.stringify(doc.udid));
				if (d_index < devices.length) {
					this.destroy_device(doc.udid, doc._rev, owner);
				} else {
					console.log("Destroying last device: " + doc.udid);
					if ((typeof (destroy_callback) !== "undefined") && (destroy_callback != null)) {
						destroy_callback(res, true, doc.udid);
					}
				}
				d_index++;
			}
		}

		if (typeof destroy_callback === "function") {
			destroy_callback(res, true, "async_progress");
		}
	}

	// public

	udidsWithSource(owner, source_id, callback) {
		this.list(owner, (success, resultat) => {
			let udids = [];
			if (!resultat.success) {
				console.log("listing failed");
				return callback(udids);
			}
			for (const a_device of resultat.reseponse) {
				if ((a_device.auto_update === true) && (a_device.source == source_id)) {
					udids.push(a_device.udid);
				}
			}
			console.log("udidsWithSource returns udids", udids);
			callback(udids);
		});
	}

	maskedEnvironment(dvc) {
		let masked = {};
		if (typeof (dvc.environment) !== "undefined") {
			masked = dvc.environment;
			if (typeof (masked.pass) !== "undefined") {
				masked.pass = "*****";
			}
			if (typeof (masked.ssid) !== "undefined") {
				masked.ssid = "*****";
			}
		}
		return masked;
	}

	list(in_owner, callback) {

		// prevent listing all devices with empty owner, should be validated
		let owner = sanitka.owner(in_owner);
		if (!Util.isDefined(owner) || (owner === "")) {
			return callback(false, {
				success: false,
				response: []
			});
		}

		console.log("ℹ️ [info] [devices] list for owner '%s'", owner);

		devicelib.view("devices", "devices_by_owner", {
			"key": owner,
			"include_docs": true
		}, (err, body) => {

			if (err) {
				console.log("☣️ [error] /api/user/devices: Error: " + err.toString()); // no db shards could be opened?
				
				if (err.toString().indexOf("Error: missing") !== -1) {
					if (typeof (callback) !== "undefined") return callback(false, "none");
				}

				if (err.toString().indexOf("No DB shards could be opened") !== -1) {
					let that = this;
					console.log("Will retry in 5s...");
					setTimeout(() => {
						that.list(owner, callback);
					}, 5000);
				}

				return;
			}

			let rows = body.rows; // devices returned

			let devices = [];
			for (let row in rows) {
				let rowData = rows[row];
				let dvc = rowData.value;

				if (typeof (dvc.source) === "undefined") {
					dvc.source = null;
				}

				let platform = "unknown";
				if (typeof (dvc.platform) !== "undefined") {
					platform = dvc.platform;
				}

				if (typeof (dvc.tags) === "undefined") {
					dvc.tags = [];
				}

				let deviceDescriptor = {
					alias: dvc.alias,
					artifact: dvc.artifact,
					auto_update: dvc.auto_update,
					category: dvc.category || "grey-mint",
					checksum: dvc.checksum,
					commit: dvc.commit || "Unknown",
					description: dvc.description,
					environment: this.maskedEnvironment(dvc),
					env_hash: dvc.env_hash,
					firmware: dvc.firmware,
					icon: dvc.icon,
					keyhash: dvc.keyhash,
					last_build_date: dvc.last_build_date,
					last_build_id: dvc.last_build_id,
					lastupdate: dvc.lastupdate,
					lat: dvc.lat,
					lon: dvc.lon,
					mac: this.device.normalizedMAC(dvc.mac), // feature envy, adds Redis DI!
					mesh_ids: dvc.mesh_ids || [],
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
					transformer_error: dvc.status_error,
					transformers: dvc.transformers,
					udid: dvc.udid,
					version: dvc.version
				};

				devices.push(deviceDescriptor);
			}
			if (callback)
				callback(true, {
					success: true,
					response: devices
				});
		});
	}

	attach(owner, body, callback, res) {

		// optimized guards, reuse this style everywhere
		if (!body.source_id) return callback(res, false, "missing_source_id");
		if (!body.udid) return callback(res, false, "missing_udid");

		let source_id = body.source_id;
		let udid = sanitka.udid(body.udid);

		alog.log(
			owner,
			"Attempt to attach repository: " + source_id + " to device: " + udid
		);

		console.log(`[OID:${owner}] [DEVICE_ATTACH] ${udid}`);

		devicelib.get(udid, (pre_attach_err, pre_attach_body) => {

			if (pre_attach_err) {
				console.log("find error: " + pre_attach_err);
				return callback(res, false, "pre_attach_err");
			}

			if (!Util.isDefined(pre_attach_body)) {
				alog.log(owner, "Attempt to attach repository to non-existent device: " + udid);
				return callback(res, false, "udid_not_found:" + udid);
			}

			let doc = pre_attach_body;

			deploy.initWithOwner(doc.owner);
			let device_path = Filez.deployPathForDevice(doc.owner, doc.udid);

			try {
				mkdirp.sync(device_path);
			} catch (erro) {
				if (erro) console.error(erro);
				else console.log("[ATTACH] Device path " + device_path + " created.");
			}

			// allow write access for remote builder
			chmodr(device_path, 0o776, (cherr) => {
				if (cherr) console.log('☣️ [error] Failed to execute chmodr', cherr);
			});

			doc.source = source_id;
			delete doc._rev;

			devicelib.atomic("devices", "modify", doc._id, doc, (reinsert_err) => {
				if (reinsert_err) {
					console.log("☣️ [error] /api/device/attach ERROR:" + reinsert_err);
					return callback(res, false, "attach_failed");
				} else {
					callback(res, true, source_id);
				}
				this.prefetch_repository(device_path, source_id, owner);
			});
		});
	}

	detach(body, callback, res) {

		if (typeof (body) === "undefined") {
			return callback(res, false, "missing_body");
		}

		if (typeof (body.udid) === "undefined") {
			return callback(res, false, "missing_udid");
		}

		let udid = sanitka.udid(body.udid);

		devicelib.view("devices", "devices_by_udid", {
			"key": udid,
			"include_docs": true
		}, (err, detach_body) => {

			if (err) {
				console.log("ERRO:" + err);
				return callback(res, false, err);
			}

			if (detach_body.rows.length == 0) return callback(res, false, "no_such_device");
			let rows = detach_body.rows[0];

			if (!Util.isDefined(rows)) return callback(res, false, "udid_not_found");
			if (!Util.isDefined(detach_body.rows[0])) return callback(res, false, "device_not_found");

			let doc = detach_body.rows[0].value;

			alog.log(doc.owner, "Attempt to detach repository from device: " + udid);

			console.log(`ℹ️ [info] Detaching repository ${doc.udid} from device ${doc._rev}`);

			devicelib.atomic("devices", "modify", doc._id, { source: null }, (detach_reinsert_err) => {
				if (detach_reinsert_err) {
					console.log("☣️ [error] /api/device/detach ERROR:" + detach_reinsert_err);
					callback(res, false, "detach_failed");
				} else {
					callback(res, true, "detached");
				}
			});
		});
	}

	attachMesh(owner, body, callback, res) {

		if (!Util.isDefined(body)) return callback(res, false, "missing_body");
		if (!Util.isDefined(body.mesh_id)) return callback(res, false, "missing_mesh_id");
		if (!Util.isDefined(body.udid)) return callback(res, false, "missing_udid");

		let attached_mesh_id = body.mesh_id;
		let udid = sanitka.udid(body.udid);

		devicelib.get(udid, (pre_attach_err, pre_attach_body) => {

			if (pre_attach_err) {
				console.log("☣️ [error] find error: " + pre_attach_err);
				return callback(res, false, pre_attach_err);
			}

			if (typeof (pre_attach_body) === "undefined") {
				alog.log(owner, "Attempt to attach repository to non-existent device: " + udid);
				return callback(res, false, "udid_not_found:" + udid);
			}

			let acl = new ACL(this.client, udid);
			acl.load(() => {
				let mesh_topic = "/" + owner + "/" + attached_mesh_id;
				acl.addTopic(udid, "readwrite", mesh_topic);
				acl.commit();
			});

			let doc = pre_attach_body;

			let mesh_ids = new Set();

			// Add attached
			mesh_ids.add(attached_mesh_id);

			// Merge with existing
			if (typeof (doc.mesh_ids) !== "undefined") {
				doc.mesh_ids.forEach(element => {
					mesh_ids.add(element);
				});
			}

			// Add mesh_id to existing meshes if does not exist there already.
			doc.mesh_ids = Array.from(mesh_ids);
			delete doc._rev;

			devicelib.atomic("devices", "modify", doc._id, doc, (reinsert_err) => {
				if (reinsert_err) {
					console.log("☣️ [error] /api/device/mesh/attach ERROR:" + reinsert_err);
					alog.log(owner, "Attempt to attach mesh: " + attached_mesh_id + " to device: " + udid + "failed.");
					return callback(res, false, "attach_mesh_failed");
				}
				console.log("[OID:%s] [MESH_ATTACH] %s", owner, JSON.stringify(Array.from(mesh_ids)));
				alog.log(owner, "Attempt to attach mesh: " + attached_mesh_id + " to device: " + udid + "succeeded.");
				callback(res, true, Array.from(mesh_ids));
			});
		});
	}

	detachMesh(owner, body, callback, res) {

		if (!Util.isDefined(body)) return callback(res, false, "missing_body");
		if (!Util.isDefined(body.mesh_id)) return callback(res, false, "missing_mesh_id");
		if (!Util.isDefined(body.udid)) return callback(res, false, "missing_udid");

		let udid = sanitka.udid(body.udid);
		let detached_mesh_id = sanitka.udid(body.mesh_id);

		devicelib.view("devices", "devices_by_udid", {
			"key": udid,
			"include_docs": true
		}, (err, detach_body) => {

			if (err) {
				console.log("ERRO:" + err);
				return callback(res, false, "general error");
			}

			if (detach_body.rows.length == 0) return callback(res, false, "no_such_device");

			let rows = detach_body.rows[0];
			if (typeof (rows) === "undefined") return callback(res, false, "mesh_not_found");

			let doc = detach_body.rows[0].value;

			console.log(`ℹ️ [info] Detaching mesh ${detached_mesh_id} from device ${doc.udid}`);


			delete doc._rev;

			let success = false;
			let mesh_ids = new Set(doc.mesh_ids);
			if (mesh_ids.has(detached_mesh_id)) {
				mesh_ids.delete(detached_mesh_id);
				success = true;
			}

			if (!success) return callback(res, false, "mesh_not_found");

			let acl = new ACL(this.client, udid);
			acl.load(() => {
				console.log(`ℹ️ [info] Detaching mesh from one device only using acl.removeTopic()`);
				let topic_suffix = "/" + detached_mesh_id;
				acl.removeTopic(udid, topic_suffix /* removeTopic uses indexOf */);
				acl.commit();
			});

			// Add mesh_id to existing meshes if does not exist there already.
			doc.mesh_ids = Array.from(mesh_ids);

			devicelib.atomic("devices", "modify", doc._id, doc, (detach_reinsert_err) => {
				if (detach_reinsert_err) {
					console.log("☣️ [error] /api/device/mesh/detach ERROR:" + detach_reinsert_err);
					alog.log(owner, "Attempt to detach mesh from device: " + udid + "failed.");
					return callback(res, false, "detach_mesh_failed");
				}
				console.log("[OID:%s] [MESH_ATTACH] %s", owner, JSON.stringify(Array.from(mesh_ids)));
				alog.log(owner, "Attempt to detach mesh from device: " + udid + "successful.");
				callback(res, success, Array.from(mesh_ids));
			});

		});
	}

	revoke(owner, body, destroy_callback, res) {

		let udids;

		if (typeof (body.udid) === "undefined") {
			if (typeof (body.udids) === "undefined") {
				return destroy_callback(res, false, "missing_udids");
			} else {
				udids = body.udids;
			}
		} else {
			udids = [body.udid];
		}

		alog.log(owner, "Attempt to revoke devices: " + JSON.stringify(udids), "warning");

		devicelib.view("devices", "devices_by_owner", {
			"key": owner,
			"include_docs": true
		}, (err, view_body) => {

			if (err) {
				console.log(err);
				return destroy_callback(res, false, err);
			}

			if (view_body.rows.length === 0) {
				alog.log(owner, "No devices for owner.");
				return destroy_callback(res, false, "no_device_for_owner");
			}

			if (typeof (view_body.rows[0]) === "undefined") {
				return destroy_callback(res, false, "devices_not_found:" + JSON.stringify(udids));
			}

			this.revoke_devices(owner, udids, view_body, destroy_callback, res);
		});
	}

	push(owner, body, callback) {
		if ((typeof (this.messenger) === "undefined") || (this.messenger == null)) return callback(false, "no_messenger");
		this.messenger.push(owner, body, callback);
	}
};
