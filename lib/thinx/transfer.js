/** This THiNX Device Management API module is responsible for device transfer management. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
	username: 'api',
	key: process.env.MAILGUN_API_KEY
});

var fs = require("fs-extra");

const Database = require("./database.js");
let db_uri = new Database().uri();
var userlib = require("nano")(db_uri).use(prefix + "managed_users");
var sha256 = require("sha256");

var AuditLog = require("./audit"); var alog = new AuditLog();
var Device = require("./device");
var Devices = require("./devices");

const { v4: uuidV4 } = require('uuid');
const Util = require("./util.js");
const Filez = require("./files.js");

module.exports = class Transfer {

	constructor(messenger, redis) {
		this.redis = redis;
		this.messenger = messenger;
		this.devices = new Devices(messenger, redis);
		this.device = new Device(redis);
	}

	// migration

	transfer_valid(encoded_json_keys, dtid, callback) {

		var json_keys = JSON.parse(encoded_json_keys);

		if (json_keys === null) {
			console.log("[transfer] No udids remaining, expiring record...");
			this.redis.del(dtid);
			callback(true, "transfer_completed");
			return false;
		}

		return true; // no callback called, continue with transfer...
	}

	migrate_device(original_owner, xudid, recipient, body, json_keys, callback) {

		if (recipient !== original_owner) {

			let changes = {
				udid: xudid,
				owner: recipient,
				previous_owner: original_owner
			};

			this.device.edit(changes, (success, xchanges) => {
				if (!success) console.log("🔨 [debug] [transfer] DEC", { success }, { xchanges });
			});

		} else {
			console.log("☣️ [error] owner and previous owner are the same in migration!");
		}

		delete json_keys.udids[xudid];

		// Move all data:
		const original_path = Filez.deployPathForDevice(original_owner, xudid);
		const destination_path = Filez.deployPathForDevice(recipient, xudid);
		if (fs.existsSync(original_path)) {
			this.rename(original_path, destination_path);
		} else {
			console.log("⚠️ [warning] [transfer] original device path does not exist.");
		}

		console.log("ℹ️ [info] [transfer] Device builds artefacts transfer ended.");

		// Move all repositories/move sources

		if (body.mig_sources === true) {
			var old_sources_path = original_path.replace(app_config.deploy_root, app_config.data_root + app_config.build_root);
			var new_sources_path = destination_path.replace(app_config.deploy_root, app_config.data_root + app_config.build_root);
			console.log("Should rename " + old_sources_path + " to " + new_sources_path);
			if (fs.existsSync(old_sources_path)) {
				this.rename(old_sources_path, new_sources_path);
			} else {
				console.log("Warning, old sources path does not exist.");
			}

			// TODO: FIXME: Won't work, until device is known (e.g. fetched by udid)
			/*
			const usid = device.source;
			this.move_source(usid, original_owner, recipient, (success) => {
				if (success) {
					this.attach_source(recipient, usid, xudid);
				}
			});
			*/
		}

		// Move all repositories:
		if (body.api_keys === true) {
			// #THX-396: Migrate API Keys from original owner to recipient in Redis!"
			// get device, fetch its API Key hash, find this in Redis and migrate to another user
			this.migrate_api_keys(original_owner, recipient, xudid, callback);
		} else {
			callback();
		}
	}

	migrate_api_keys(original_owner, recipient, xudid, callback) {

		var source_id = "ak:" + original_owner;
		var recipient_id = "ak:" + recipient;

		this.devices.get(xudid, (success, dev) => {
			if (!success) {
				console.log("[critical] device get for migration failed!");
				return;
			}
			const last_key_hash = dev.lastkey;

			// Get source keys
			this.redis.get(source_id, (error, json_keys) => {
				var json_array = JSON.parse(json_keys);
				var delete_this = null;
				var migrate_this = null;
				for (var ai in json_array) {
					var item = json_array[ai];
					if (sha256(item) == last_key_hash) {
						delete_this = ai;
						migrate_this = item;
					}
				}

				// Get recipient keys
				this.redis.get(recipient_id, (error, recipient_keys) => {
					var recipient_array = JSON.parse(recipient_keys);
					if (delete_this) {
						recipient_array.push(migrate_this);
						delete json_array[delete_this];
					}
					// Save array with respective API Key removed
					this.redis.set(source_id, JSON.stringify(json_array));
					// Save new array with respective API Key added
					this.redis.set(recipient_id, JSON.stringify(recipient_array));
					callback(true, "api_keys_migrated"); // ??
				});

			}); // this.redis.get

		}); // devices.get

	} // end migrate_api_keys

	rename(from, to) {
		fs.copy(from, to, (rename_err) => {
			if (rename_err) {
				console.log("☣️ [error] [transfer] caught COPY error:", rename_err);
			} else {
				fs.remove(from);
			}
		});
	}

	move_source(usid, original_owner, target_owner, callback) {

		userlib.get(original_owner, (err1, abody) => {

			if (err1) return callback(false, err1);

			userlib.get(target_owner, (err2, bbody) => {

				if (err2) return callback(false, err2);

				var osources = abody.sources;
				var tsources = bbody.sources;
				tsources[usid] = osources[usid];

				delete osources[usid];

				userlib.atomic("users", "edit", abody._id, {
					sources: tsources
				}, (error/* , response */) => {
					if (error) {
						console.log("☣️ [error] Source transfer failed: " + error);
					} else {
						alog.log(abody._id, "Source transfer succeeded.");
					}
				});

			});
		});
	}

	attach_source(target_owner, usid, udid) {
		this.devices.attach(target_owner, {
			source_id: usid,
			udid: udid
		}, (success, response) => {
			if (!success) {
				console.log("☣️ [error] Migration error:" + response);
			}
			if (response) {
				console.log("ℹ️ [info] Migration response:" + response);
			}
		});
	}

	// calls result callback (async) after checking existence of dtr:<udid> in redis
	// should be refactored to async/Promise
	exit_on_transfer(udid, result_callback) {

		this.redis.get("dtr:" + udid, (error, reply) => {
			if ((reply === null) || (reply == [])) {
				console.log("ℹ️ [info] exit_on_transfer reply", { reply });
				console.log("ℹ️ [info] Device already being transferred:", udid);
				result_callback(false);
			} else {
				result_callback(true);
			}
		});
	}

	async is_pending(udid) {
		const identifier = "dtr:" + udid;
		try {
			let data = await this.redis.get(identifier);
			if ((typeof(data) !== "undefined") && (data !== null)) {
				return Promise.resolve(true); // transfer pending
			} 
		} catch (e) {
			console.log("[debug] is_pending", e);
		}
		return Promise.resolve(false); // transfer not pending
	}

	store_pending_transfer(udid, transfer_id) {		
		this.redis.set("dtr:" + udid, transfer_id);
		this.redis.expire("dtr:" + udid, 86400); // expire pending transfer in one day...
	}

	// public

	sendMail(contents, type, callback) {
		mg.messages.create(app_config.mailgun.domain, contents)
			.then((/* msg */) => {
				callback(true, {
					success: true,
					response: type + "_sent"
				});
			})
			.catch((mail_err) => {
				console.log(`☣️ [error] mailgun error ${mail_err}`);
				callback(false, type + "_failed", mail_err);
			});
	}

	sendRecipientTransferEmail(body, transfer_uuid) {

		if (!Util.isDefined(body.udids)) { console.log("[error] [sendRecipientTransferEmail] missing body.udids"); return }

		var htmlDeviceList = "<p><ul>";
		for (var dindex in body.udids) {
			htmlDeviceList += "<li>" + body.udids[dindex] + "</li>";
		}
		htmlDeviceList += "</ul></p>";

		var plural = "";
		if (body.udids.length > 1) plural = "s";

		var port = "";
		if (typeof (app_config.debug.allow_http_login) !== "undefined" && app_config.debug.allow_http_login === true) {
			port = app_config.port;
		}

		var recipientTransferEmail = {
			from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
			to: body.to,
			subject: "Device transfer requested",
			text: "<!DOCTYPE html><p>Hello " + body.to + ".</p>" +
				"<p> User with e-mail " + body.from +
				" is transferring following device" + plural + " to you:</p>" +
				htmlDeviceList +
				"<p>You may " +
				"<a href='" + app_config.api_url + port + "/api/transfer/accept?transfer_id=" +
				transfer_uuid + "'>Accept</a> or" +
				"<a href='" + app_config.api_url + port + "/api/transfer/decline?transfer_id=" +
				transfer_uuid + "'>Decline</a> this offer.</p>" +
				"</html>"
		};

		console.log("ℹ️ [info] Sending transfer e-mail to recipient", recipientTransferEmail.to);

		this.sendMail(recipientTransferEmail, "recipient_transfer", () => { /* nop */ });

		var senderTransferEmail = {
			from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
			to: body.from,
			subject: "Device transfer requested",
			text: "<!DOCTYPE html><p>Hello " + body.from + ".</p>" +
				"<p> You have requested to transfer following devices to " +
				body.to +
				":</p>" +
				htmlDeviceList +
				"<p>You will be notified when your offer will be accepted or declined.</p>" +
				"</html>"
		};

		console.log("ℹ️ [info] Sending transfer e-mail to requestor: ", senderTransferEmail.to);

		this.sendMail(recipientTransferEmail, "recipient_transfer", () => {  /* nop */  });
	}

	request(owner, body, callback) {

		// body should look like { "to":"some@email.com", "udids" : [ "some-udid", "another-udid" ] }

		// THX-396

		// when true, sources will be COPIED to new owner as well
		if (!Util.isDefined(body.mig_sources)) body.mig_sources = false;

		// when true, API Keys will be TRANSFERRED:
		// - MQTT combination udid/apikey does not change
		// - API Keys are deleted from sender and added to recipient
		if (!Util.isDefined(body.mig_apikeys)) body.mig_apikeys = false;

		// Generic Check
		if (!Util.isDefined(body.to)) return callback(false, "missing_recipient");
		if (!Util.isDefined(body.udids)) return callback(false, "missing_subject");

		var recipient_id = sha256(prefix + body.to);

		// Skips if first of pending transfers is already in progress
		for (const udid in body.udids) {
			let state = await this.is_pending(udid);
			if (state) {
				console.log("[debug] transfer already in progress:", {state});
				return callback(false, "transfer_already_in_progress");
			}
		}

		// Fetch original owner
		userlib.get(owner, (couch_err, ownerdoc) => {

			if (couch_err) {
				console.log("Owner", owner, "unknown in transfer request!");
				return callback(false, "owner_unknown");
			}

			// Fetch new recipient
			userlib.get(recipient_id, (zerr/* , recipient */) => {

				if (zerr) {
					console.log("☣️ [error] Transfer target body.to id " + recipient_id + "not found");
					return callback(false, "recipient_unknown");
				}

				// 2. add recipient to body as "from" (ignore user-submitted value)
				body.from = ownerdoc.email;

				// 3. store as "dt:uuid()" to redis
				var transfer_uuid = uuidV4(); // used for email
				var transfer_id = "dt:" + transfer_uuid;
				this.redis.set(transfer_id, JSON.stringify(body));

				// 4. store pending transfer for each device
				for (var did in body.udids) {
					this.store_pending_transfer(did, transfer_id);
				}

				// 5. respond with success/failure to the request
				callback(true, transfer_uuid);

				// 6. send the e-mail async (later)
				this.sendRecipientTransferEmail(body, transfer_uuid);
			});
		});
	}

	save_dtid(tid, keys, ac) {
		this.redis.set(tid, JSON.stringify(keys));
		console.log(`🔨 [debug] [transfer] Accepted udids ${keys.udids}`);
		if (keys.udids.length > 1) {
			ac(true, "transfer_partially_completed");
			this.redis.expire(tid, 3600); // 3600 seconds expiration for this transfer request; should be possibly more (like 72h to pass weekends)
		} else {
			ac(true, "transfer_completed");
			this.redis.del(tid);
		}
	}

	migration_promise(_owner, _list, _rec, _body, _keys) {
		return new Promise((resolve) => {
			this.migrate_device(_owner, _list, _rec, _body, _keys, () => {
				resolve();
			});
		});
	}

	async accept(body, accept_callback) {

		// minimum body should look like { "transfer_id":"uuid" }
		// optional body should look like { "transfer_id":"uuid", "udids" : [ ... ] }

		if (typeof (body.transfer_id) === "undefined") {
			return accept_callback(false, "missing_transfer_id");
		}

		var transfer_id = body.transfer_id;
		var udids = [];

		// Possibly partial transfer but we don't know until count
		if (typeof (body.udids) !== "undefined") {
			udids = body.udids;
		}

		if (typeof (body.udid) !== "undefined") {
			udids = body.udid;
		}

		const dtid = "dt:" + transfer_id;

		let encoded_json_keys = await this.redis.get(dtid);

		let keys = JSON.stringify(encoded_json_keys);

		console.log(`🔨 [debug] [transfer] Fetched DTID: ${dtid} with keys ${{ keys }}`);

		if (keys.length == 0) {
			console.log("⚠️ [warning] [transfer] transfer_id not found (empty response array)");
			return accept_callback(false, "transfer_id_not_found");
		}

		if (encoded_json_keys === null) {
			return accept_callback(false, "transfer_id_not_found");
		}

		var json_keys = JSON.parse(encoded_json_keys);

		// In case this returns !true (=false), it calls accept_callback on its own.
		if (true !== this.transfer_valid(encoded_json_keys, dtid, accept_callback)) {
			return;
		}

		if (typeof (json_keys.udids) === "undefined") {
			json_keys.udids = [];
		}

		// perform on all devices if udids not given
		console.log(`🔨 [debug] [transfer] L1 udids: ${udids}`);
		if ((typeof (udids) !== "undefined") && (udids.length === 0)) udids = json_keys.udids;

		var recipient_email = json_keys.to;

		if (typeof (recipient_email) === "undefined" || recipient_email === null) {
			return accept_callback(false, "recipient_to_must_be_set");
		}

		var recipient = sha256(prefix + recipient_email);
		var original_owner_email = json_keys.from;

		if ((typeof (original_owner_email) === "undefined") || (original_owner_email === null)) {
			return accept_callback(false, "originator_from_must_be_set");
		}

		var original_owner = sha256(prefix + original_owner_email);

		// Check if there are some devices left
		console.log(`🔨 [debug] [transfer] L2 LEFT keys: ${json_keys.udids}`);
		if ((typeof (json_keys.udids) !== "undefined") && json_keys.udids.length === 0) {
			this.redis.del(dtid);
			for (var udid in udids) {
				this.redis.del("dtr:" + udid);
			}
			return accept_callback(true, "transfer_completed");
		}

		let sentence = `Accepting device transfer ${transfer_id} for devices ${JSON.stringify(udids)}`;
		alog.log(original_owner, sentence);
		alog.log(recipient, sentence);

		console.log("[OID:" + recipient + "] [TRANSFER_ACCEPT] ", { udids });

		const locked_udids = udids;

		let promises = [];

		for (var dindex in locked_udids) {
			let result = this.migration_promise(original_owner, locked_udids[dindex], recipient, body, json_keys);
			promises.push(result);
		}

		Promise.all(promises).then(() => {
			this.save_dtid(dtid, json_keys, accept_callback);
		}).catch(e => console.log("[transfer] promise exception", e));
	}

	storeRemainingKeys(dtid, json_keys, callback) {
		this.redis.set(dtid, JSON.stringify(json_keys));
			console.log(`🔨 [debug] [transgfer] L4 Storing remaining keys: ${json_keys.udids}`);
			if (json_keys.udids.length > 1) {
				// 1 hour to let user accept/decline different devices
				this.redis.expire(dtid, 3600);
				callback(true, "transfer_partially_completed");
			} else {
				this.redis.del(dtid);
				callback(true, "transfer_completed");
			}
	}

	decline(body, callback) {

		// minimum body should look like { "transfer_id":"uuid" }
		// optional body should look like { "transfer_id":"uuid", "udids" : [ ... ] }

		if (typeof (body.transfer_id) === "undefined") {
			return callback(false, "missing_transfer_id");
		}

		console.log(`[transfer][decline] body: ${JSON.stringify(body)}`);

		var transfer_id = body.transfer_id;
		var udids = [];

		// Possibly partial transfer but we don't know until count
		if ((typeof (body.udids) !== "undefined") && (body.udids !== null)) {
			udids = body.udids;
		}

		var dtid = "dt:" + transfer_id;

		console.log(`🔨 [debug] [transfer] getting DTID ${dtid} on decline`);

		this.redis.get(dtid, (error, json) => {

			let json_keys = JSON.parse(json);

			if (json_keys.length == 0) {
				console.log("[transfer] json_keys", json_keys);
				return callback(false, "transfer_id_invalid");
			}

			if (json_keys === null) {
				console.log("[transfer] no such transfer anymore");
				return callback(true, "decline_complete_no_such_dtid");
			}

			console.log(`🔨 [debug] [transfer] L5 udids ${udids}`);

			if ((udids.length === 0) && (typeof (json_keys) !== "undefined")) {
				// perform on all devices if udids not given
				udids = json_keys.udids;
			}

			// Check if there are some devices left
			console.log(`🔨 [debug] [transfer] L6 udids ${json_keys.udids}`);

			if (json_keys.udids.length == 0) {
				this.redis.del(dtid);
			}

			var recipient_email = json_keys.to;
			var recipient = sha256(prefix + recipient_email);
			var original_owner_email = json_keys.from;
			var original_owner = sha256(prefix + original_owner_email);


			console.log(`🔨 [debug] [transfer] Declining transfer ${transfer_id}`);

			alog.log(original_owner, "Declining device transfer: " + transfer_id + " for devices: " + JSON.stringify(udids), "warning");
			alog.log(recipient, "Declining device transfer: " + transfer_id + " for devices: " + JSON.stringify(udids), "warning");
			console.log("[OID:" + recipient + "] [TRANSFER_DECLINE] " + JSON.stringify(udids));

			for (var dindex in udids) {
				var udid = udids[dindex];
				delete json_keys.udids[udid];
			}

			// Store remaining (not declined) keys
			this.storeRemainingKeys(dtid, json_keys, callback);

			callback(true, "decline_completed");
		});
	}

};
