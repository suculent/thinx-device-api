/** This THiNX Device Management API module is responsible for device transfer management. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const { readSecret } = require("./secrets.js"); // #418: Docker secrets > env

// SEC-CFG-02: prefer /run/secrets/MAILGUN_API_KEY (swarm), fall back to env.
// Without a key no client is built and sendMail fails fast (D-02).
const mailgun_key = readSecret("MAILGUN_API_KEY");
let mg = null;
if (mailgun_key) {
	mg = mailgun.client({
		username: 'api',
		key: mailgun_key
	});
} else {
	console.log("ℹ️ [info] [transfer] MAILGUN_API_KEY not set — Mailgun e-mail disabled");
}

var fs = require("fs-extra");

const Database = require("./database.js");
let db_uri = new Database().uri();
var userlib = require("./couch")(db_uri).use(prefix + "managed_users");
var devicelib = require("./couch")(db_uri).use(prefix + "managed_devices");
var sha256 = require("sha256");

var AuditLog = require("./audit"); var alog = new AuditLog();
var Device = require("./device");
var Devices = require("./devices");
var APIKey = require("./apikey");

const { v4: uuidV4 } = require('uuid');
const Util = require("./util.js");
const Filez = require("./files.js");

// Mailgun renders the `html` field; the `text` field is delivered verbatim as
// plain text. Transfer e-mails previously put HTML into `text`, so clients
// showed the raw "<!DOCTYPE html>..." markup (#541). Mirror owner.js wrapping.
const html_mail_header = "<!DOCTYPE html><html><head></head><body>";
const html_mail_footer = "</body></html>";

module.exports = class Transfer {

	constructor(messenger, redis) {
		this.redis = redis;
		this.messenger = messenger;
		this.devices = new Devices(messenger, redis);
		this.device = new Device(redis);
		this.apikey = new APIKey(redis);
	}

	// migration

	transfer_valid(encoded_json_keys, dtid, callback) {

		let json_keys;
		try {
			json_keys = JSON.parse(encoded_json_keys);
		} catch (e) {
			console.log("[transfer] Failed to parse encoded_json_keys:", e);
			callback(false, "transfer_parse_error");
			return false;
		}

		if (json_keys === null) {
			console.log("[transfer] No udids remaining, expiring record...");
			this.redis.del(dtid);
			callback(true, "transfer_completed");
			return false;
		}

		return true; // no callback called, continue with transfer...
	}

	// Re-checks the current owner before anything moves (quick 261003-t29): a stale or
	// duplicate transfer never migrates a device its originator no longer owns.
	// Calls back with {ok: true} or {ok: false, reason}; a device the originator no longer
	// owns is a silent skip ({ok: true, skipped: true}).
	migrate_device(original_owner, xudid, recipient, body, json_keys, callback) {
		this.device.fetchOwned(xudid, original_owner, (owned, doc) => {
			if (!owned) {
				console.log("⚠️ [warning] [transfer] originator does not own udid " + xudid + ", migration skipped");
				return callback({ ok: true, skipped: true });
			}
			this.migrate_owned_device(original_owner, doc, recipient, body, json_keys, callback);
		});
	}

	// Per device, in this order (quick 261003-u86): the key gate (read-only), the key move
	// (one atomic swap of both key stores), the owner change, then files and sources (best
	// effort). A failed owner change moves the key back, so the device and its key always
	// end on the same side.
	migrate_owned_device(original_owner, doc, recipient, body, json_keys, callback) {

		const xudid = doc.udid;

		if (recipient === original_owner) {
			console.log("☣️ [error] owner and previous owner are the same in migration!");
			return this.finish_migration(original_owner, doc, recipient, body, json_keys, callback);
		}

		this.checkDeviceKeys(original_owner, [doc], (allowed, reason) => {

			if (!allowed) return callback({ ok: false, reason: reason });

			this.apikey.moveDeviceKey(original_owner, recipient, doc.lastkey, xudid, (moved, move) => {

				if (!moved) return callback({ ok: false, reason: move });

				let changes = {
					udid: xudid,
					owner: recipient,
					previous_owner: original_owner,
					transferred_at: move.at
				};

				this.device.edit(changes, (success) => {
					if (success) return this.key_moved(original_owner, doc, recipient, body, json_keys, callback);
					// The reply may be lost after the write landed: re-read before undoing.
					this.device.fetchOwned(xudid, recipient, (landed) => {
						if (landed) return this.key_moved(original_owner, doc, recipient, body, json_keys, callback);
						console.log("☣️ [error] [transfer] owner change failed for device " + xudid + ", moving its API key back");
						this.apikey.restoreDeviceKey(move, (restored) => {
							if (!restored) {
								console.log(`🚫  [critical] [transfer] device ${xudid} stays with ${original_owner} while its API key is with ${recipient}; reconcile manually`);
								alog.log(original_owner, "Transfer of device " + xudid + " failed; its API key could not be moved back", "error");
								alog.log(recipient, "Transfer of device " + xudid + " failed; its API key could not be moved back", "error");
							}
							callback({ ok: false, reason: "device_move_failed" });
						});
					});
				});
			});
		});
	}

	key_moved(original_owner, doc, recipient, body, json_keys, callback) {
		alog.log(original_owner, "API key moved with device " + doc.udid);
		alog.log(recipient, "API key moved with device " + doc.udid);
		this.finish_migration(original_owner, doc, recipient, body, json_keys, callback);
	}

	/**
	 * Transfer key gate (quick 261003-u86): calls back (true) when every device's API key
	 * can move with it, else (false, reason) for the first refused device:
	 * - apikey_not_identified: no lastkey, or no entry of the owner's store matches it;
	 * - apikey_ambiguous: several entries match;
	 * - apikey_owner_mqtt_key: it is the owner's Default MQTT API Key;
	 * - apikey_shared: another device (of any owner, or of this same list) uses it;
	 * - apikey_check_failed: the key store or the device lookup failed.
	 * Read-only. Logs udids and reasons only.
	 */
	checkDeviceKeys(owner, docs, callback) {

		const refuse = (udid, reason) => {
			console.log(`⚠️ [warning] [transfer] device ${udid} cannot move with its API key: ${reason}`);
			callback(false, reason);
		};

		if (!Array.isArray(docs) || (docs.length === 0)) return callback(true);

		this.redis.get("ak:" + owner, (error, raw) => {

			if (error) return refuse(docs[0].udid, "apikey_check_failed");

			let entries = [];
			if ((typeof (raw) !== "undefined") && (raw !== null)) {
				try {
					entries = JSON.parse(raw);
				} catch (_e) {
					entries = null;
				}
			}
			if (!Array.isArray(entries)) return refuse(docs[0].udid, "apikey_check_failed");

			const used = new Map();
			const candidates = [];
			for (const doc of docs) {
				const found = APIKey.findDeviceKey(entries, doc.lastkey);
				if (found.status === "ambiguous") return refuse(doc.udid, "apikey_ambiguous");
				if (found.status !== "found") return refuse(doc.udid, "apikey_not_identified");
				if (APIKey.isOwnerMqttKey(found.entry)) return refuse(doc.udid, "apikey_owner_mqtt_key");
				if (used.has(found.index)) return refuse(doc.udid, "apikey_shared");
				used.set(found.index, doc.udid);
				for (const candidate of APIKey.deviceKeyCandidates(found.entry)) {
					if (candidates.indexOf(candidate) === -1) candidates.push(candidate);
				}
			}

			// Any owner's device counts: devices transferred before this gate kept the
			// sender's key. With limit = checked devices + 1, any other device is returned.
			const checked = docs.map((doc) => doc.udid);
			devicelib.find({
				selector: { lastkey: { "$in": candidates } },
				fields: ["_id", "udid"],
				limit: docs.length + 1
			}, (find_error, body) => {
				if (find_error || (typeof (body) !== "object") || (body === null) || !Array.isArray(body.docs)) {
					return refuse(checked[0], "apikey_check_failed");
				}
				for (const other of body.docs) {
					const other_udid = ((typeof (other) === "object") && (other !== null)) ? other.udid : undefined;
					if ((typeof (other_udid) !== "string") || (checked.indexOf(other_udid) === -1)) {
						return refuse(checked[0], "apikey_shared");
					}
				}
				callback(true);
			});
		});
	}

	// The owner's documents for `udids` (one devices_by_owner view): (true, docs) in udid
	// order, (false, "no_such_device") when one is missing, (false, "apikey_check_failed")
	// when the view fails.
	ownedDocs(owner, udids, callback) {
		devicelib.view("devices", "devices_by_owner", {
			"key": owner,
			"include_docs": true
		}, (error, body) => {
			if (error || (typeof (body) !== "object") || (body === null) || !Array.isArray(body.rows)) return callback(false, "apikey_check_failed");
			const byUdid = {};
			for (const row of body.rows) {
				const doc = ((typeof (row) === "object") && (row !== null)) ? (row.doc || row.value) : null;
				if (Device.isOwnedBy(doc, owner) && (typeof (doc.udid) === "string")) byUdid[doc.udid] = doc;
			}
			const docs = [];
			for (const udid of udids) {
				if (!Object.prototype.hasOwnProperty.call(byUdid, udid)) return callback(false, "no_such_device");
				docs.push(byUdid[udid]);
			}
			callback(true, docs);
		});
	}

	// `doc` is the device document Device#fetchOwned returned before the move (quick
	// 261004-l7q: mig_sources reads its source from it).
	finish_migration(original_owner, doc, recipient, body, json_keys, callback) {

		const xudid = doc.udid;

		// The stored list is an array of udids: drop this one, so the transfer can complete.
		if (Array.isArray(json_keys.udids)) json_keys.udids = json_keys.udids.filter((udid) => udid !== xudid);

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

			const usid = doc.source;
			this.move_source(usid, original_owner, recipient, (success) => {
				if (success) {
					this.attach_source(recipient, usid, xudid);
				}
			});
		}

		callback({ ok: true });
	}

	rename(from, to) {
		fs.copy(from, to, (rename_err) => {
			if (rename_err) {
				console.log("☣️ [error] [transfer] caught COPY error:", rename_err);
			} else {
				fs.remove(from);
			}
		});
	}

	// Copies the device's source entry from the sender's `sources` map into the recipient's
	// ("sources will be COPIED", see request()). Writes only the recipient's document: it
	// used to write the recipient's whole map into the sender's document (quick 261004-l7q).
	// Calls back (true) after the write, else (false, reason) without writing.
	move_source(usid, original_owner, target_owner, callback) {

		const isMap = (x) => (typeof (x) === "object") && (x !== null) && !Array.isArray(x);

		userlib.get(original_owner, (err1, abody) => {

			if (err1) return callback(false, err1);

			userlib.get(target_owner, (err2, bbody) => {

				if (err2) return callback(false, err2);

				const osources = isMap(abody.sources) ? abody.sources : null;
				if ((typeof (usid) !== "string") || (osources === null) || !Object.prototype.hasOwnProperty.call(osources, usid)) {
					console.log("ℹ️ [info] [transfer] the device's source is not in the sender's sources; nothing copied");
					return callback(false, "source_not_found");
				}

				const tsources = isMap(bbody.sources) ? bbody.sources : {};
				tsources[usid] = osources[usid];

				userlib.atomic("users", "edit", target_owner, {
					sources: tsources
				}, (error/* , response */) => {
					if (error) {
						console.log("☣️ [error] Source transfer failed: " + error);
						return callback(false, "source_transfer_failed");
					}
					alog.log(target_owner, "Source transfer succeeded.");
					callback(true);
				});
			});
		});
	}

	attach_source(target_owner, usid, udid) {
		this.devices.attach(target_owner, {
			source_id: usid,
			udid: udid
		}, (_res, success, response) => {
			if (!success) {
				console.log("☣️ [error] Migration error:" + response);
			}
			if (response) {
				console.log("ℹ️ [info] Migration response:" + response);
			}
		});
	}

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

	/**
	 * Recipient binding (quick 261004-l7q). `caller_owner` is the authenticated owner of a
	 * POST accept/decline; it must equal the stored recipient, sha256(prefix + record.to).
	 * `undefined` is the e-mail capability link (GET, no session), which the transfer id
	 * alone authorises. Never derived from a request body.
	 */
	static boundToCaller(record, caller_owner) {
		if (typeof (caller_owner) === "undefined") return true;
		if ((typeof (record) !== "object") || (record === null)) return false;
		if ((typeof (record.to) !== "string") || (record.to.length === 0)) return false;
		return (typeof (caller_owner) === "string") && (caller_owner === sha256(prefix + record.to));
	}

	store_pending_transfer(udid, transfer_id) {
		this.redis.set("dtr:" + udid, transfer_id);
		this.redis.expire("dtr:" + udid, 86400); // expire pending transfer in one day...
	}

	// public

	// #541: build the transfer e-mail as rendered HTML (Mailgun `html` field)
	// with a plaintext `text` fallback, instead of stuffing HTML into `text`.
	buildRecipientTransferEmail(body, htmlDeviceList, plural, transfer_uuid, port) {
		let accept_url = app_config.api_url + port + "/api/transfer/accept?transfer_id=" + transfer_uuid;
		let decline_url = app_config.api_url + port + "/api/transfer/decline?transfer_id=" + transfer_uuid;
		return {
			from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
			to: body.to,
			subject: "Device transfer requested",
			text: "Hello " + body.to + ". User with e-mail " + body.from +
				" is transferring " + body.udids.length + " device" + plural + " to you. " +
				"Accept: " + accept_url + " — Decline: " + decline_url,
			html: html_mail_header +
				"<p>Hello " + body.to + ".</p>" +
				"<p> User with e-mail " + body.from +
				" is transferring following device" + plural + " to you:</p>" +
				htmlDeviceList +
				"<p>You may " +
				"<a href='" + accept_url + "'>Accept</a> or " +
				"<a href='" + decline_url + "'>Decline</a> this offer.</p>" +
				html_mail_footer
		};
	}

	buildSenderTransferEmail(body, htmlDeviceList) {
		return {
			from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
			to: body.from,
			subject: "Device transfer requested",
			text: "Hello " + body.from + ". You have requested to transfer " +
				body.udids.length + " device(s) to " + body.to +
				". You will be notified when your offer is accepted or declined.",
			html: html_mail_header +
				"<p>Hello " + body.from + ".</p>" +
				"<p> You have requested to transfer following devices to " +
				body.to +
				":</p>" +
				htmlDeviceList +
				"<p>You will be notified when your offer will be accepted or declined.</p>" +
				html_mail_footer
		};
	}

	sendMail(contents, type, callback) {
		if (mg === null) return callback(false, type + "_failed"); // D-02: logged once at load
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

	request(owner, body, callback) {

		// body should look like { "to":"some@email.com", "udids" : [ "some-udid", "another-udid" ] }

		// THX-396

		// when true, sources will be COPIED to new owner as well
		if (!Util.isDefined(body.mig_sources)) body.mig_sources = false;

		// Ignored since quick 261003-u86: the device's API key always moves with the
		// device (MQTT udid/apikey does not change; the key leaves the sender's list).
		if (!Util.isDefined(body.mig_apikeys)) body.mig_apikeys = false;

		// Generic Check
		if (!Util.isDefined(body.to)) return callback(false, "missing_recipient");
		if (!Array.isArray(body.udids) || (body.udids.length === 0)) return callback(false, "missing_subject");

		var recipient_id = sha256(prefix + body.to);

		// Reject the whole request up front if any offered device already has a
		// pending transfer (dtr:<udid> in Redis). This gate previously ran synchronously,
		// before exit_on_transfer's async Redis callbacks resolved, so `result` was always
		// still true and the check never fired; it also walked array indices via `for..in`
		// instead of the udids. Promisified so it actually gates. (resolves the legacy debt marker in
		// .planning/todos/completed/2026-09-29-resolve-legacy-fixmes-owner-transfer.md item 3)
		const udids = Array.isArray(body.udids) ? body.udids : [];
		Promise.all(udids.map((udid) => new Promise((resolve) => {
			this.exit_on_transfer(udid, (in_progress) => resolve(in_progress === true));
		}))).then((flags) => {

			if (flags.some((in_progress) => in_progress === true)) {
				return callback(false, "transfer_already_in_progress");
			}

			userlib.get(owner, (couch_err, ownerdoc) => {

				if (couch_err) {
					console.log("Owner", owner, "unknown in transfer request!");
					return callback(false, "owner_unknown");
				}

				userlib.get(recipient_id, (zerr/* , recipient */) => {

					if (zerr) {
						console.log("☣️ [error] Transfer target body.to id " + recipient_id + "not found");
						return callback(false, "recipient_unknown");
					}

					// Every offered udid must be the sender's own (quick 261003-t29). One foreign,
					// unknown or junk item refuses the whole request before anything is stored or
					// mailed: the e-mail would otherwise list devices the sender never chose.
					this.device.filterOwned(owner, body.udids, (owned) => {
						if ((owned.length === 0) || (owned.length < new Set(body.udids).size)) {
							return callback(false, "no_such_device");
						}
						body.udids = owned;
						// Each device's API key moves with it on accept (quick 261003-u86): refuse
						// before anything is stored or mailed when a key cannot move. Self-transfers
						// move nothing and keep today's behaviour.
						if (recipient_id === owner) return this.store_and_offer(body, ownerdoc, callback);
						this.ownedDocs(owner, owned, (found, docs) => {
							if (!found) return callback(false, docs);
							this.checkDeviceKeys(owner, docs, (allowed, reason) => {
								if (!allowed) return callback(false, reason);
								this.store_and_offer(body, ownerdoc, callback);
							});
						});
					});
				});
			});
		});
	}

	store_and_offer(body, ownerdoc, callback) {

		// 2. add recipient to body as "from"
		body.from = ownerdoc.email;

		// 2. add recipient to body as "from"

		// 3. store as "dt:uuid()" to redis
		var transfer_uuid = uuidV4(); // used for email
		var transfer_id = "dt:" + transfer_uuid;

		this.redis.set(transfer_id, JSON.stringify(body));

		// 4. respond with success/failure to the request. The transfer id is a capability
		// that only the recipient's e-mail links carry (quick 261004-l7q): the answer is
		// opaque; the third argument serves in-process callers (specs) only and no router
		// forwards it.
		callback(true, "transfer_requested", transfer_uuid);

		let udids = body.udids;

		if (typeof (udids) === "undefined") {
			console.log("⚠️ [warning] [transfer] request has no udids"); // never the request body
			return;
		}

		for (var did in udids) {
			this.store_pending_transfer(did, transfer_id);
		}

		var htmlDeviceList = "<p><ul>";
		for (var dindex in body.udids) {
			htmlDeviceList += "<li>" + udids[dindex] + "</li>";
		}
		htmlDeviceList += "</ul></p>";

		var plural = "";
		if (body.udids.length > 1) plural = "s";

		var port = "";
		if (typeof (app_config.debug.allow_http_login) !== "undefined" && app_config.debug.allow_http_login === true) {
			port = app_config.port;
		}

		var recipientTransferEmail = this.buildRecipientTransferEmail(body, htmlDeviceList, plural, transfer_uuid, port);

		console.log(`ℹ️ [info] Sending transfer e-mail to recipient ${Util.redactEmail(String(recipientTransferEmail.to).replace(/[\r\n]/g, ""))}`);

		this.sendMail(recipientTransferEmail, "recipient_transfer", () => { /* nop */ });

		var senderTransferEmail = this.buildSenderTransferEmail(body, htmlDeviceList);

		console.log("ℹ️ [info] Sending transfer e-mail to sender " + Util.redactEmail(String(senderTransferEmail.to).replace(/[\r\n]/g, "")));

		/* already responded on line 332, in search of headers sent
		if (process.env.ENVIRONMENT === "test") {
			return callback(true, transfer_id.replace("dt:", ""));
		} */

		// #541 fix: was sending recipientTransferEmail twice, so the
		// sender never received their copy. Send the sender's e-mail here.
		this.sendMail(senderTransferEmail, "sender_transfer", () => {
			//
		});
	}

	save_dtid(tid, keys, ac) {
		this.redis.set(tid, JSON.stringify(keys));
		console.log(`🔨 [debug] [transfer] Remaining udids ${keys.udids}`);
		// Devices are removed from the list as they move: anything left keeps it pending.
		if (keys.udids.length > 0) {
			ac(true, "transfer_partially_completed");
			this.redis.expire(tid, 3600); // 3600 seconds expiration for this transfer request; should be possibly more (like 72h to pass weekends)
		} else {
			ac(true, "transfer_completed");
			this.redis.del(tid);
		}
	}

	// Resolves with the migration result ({ok} or {ok: false, reason}); never rejects.
	migration_promise(_owner, _list, _rec, _body, _keys) {
		return new Promise((resolve) => {
			try {
				this.migrate_device(_owner, _list, _rec, _body, _keys, (result) => {
					resolve(((typeof (result) === "object") && (result !== null)) ? result : { ok: true });
				});
			} catch (e) {
				console.log("☣️ [error] [transfer] migration exception", e && e.message ? e.message : e);
				resolve({ ok: false, reason: "device_move_failed" });
			}
		});
	}

	// caller_owner: see boundToCaller (undefined only for the e-mail link).
	async accept(body, accept_callback, caller_owner) {

		// minimum body should look like { "transfer_id":"uuid" }
		// optional body should look like { "transfer_id":"uuid", "udids" : [ ... ] }

		if (typeof (body.transfer_id) === "undefined") {
			return accept_callback(false, "missing_transfer_id");
		}

		var transfer_id = body.transfer_id;

		// Possibly partial transfer but we don't know until count; body.udid overrides body.udids.
		let named = body.udids;
		if (typeof (body.udid) !== "undefined") named = body.udid;
		let requested = [];
		if (typeof (named) === "string") requested = [named];
		else if (Array.isArray(named)) requested = named;

		const dtid = "dt:" + transfer_id;

		this.redis.get(dtid, (error, encoded_json_keys) => {

			if ((typeof (encoded_json_keys) === "undefined") || (encoded_json_keys === null)) {
				return accept_callback(false, "transfer_id_not_found");
			}

			var json_keys = JSON.parse(encoded_json_keys);

			// Only the recipient may accept by session (quick 261004-l7q); anyone else gets
			// the unknown-transfer answer, before anything changes or is logged.
			if (!Transfer.boundToCaller(json_keys, caller_owner)) {
				return accept_callback(false, "transfer_id_not_found");
			}

			// In case this returns !true (=false), it calls accept_callback on its own.
			if (true !== this.transfer_valid(encoded_json_keys, dtid, accept_callback)) {
				return;
			}

			if (typeof (json_keys.udids) === "undefined") {
				json_keys.udids = [];
			}

			// Only udids that are part of the stored transfer can move (quick 261003-t29);
			// perform on all stored devices if udids not given.
			const stored = Array.isArray(json_keys.udids) ? json_keys.udids : [];
			let udids;
			if (requested.length === 0) {
				udids = stored;
			} else {
				udids = [];
				for (const item of requested) {
					if ((stored.indexOf(item) !== -1) && (udids.indexOf(item) === -1)) udids.push(item);
				}
				if (udids.length === 0) return accept_callback(false, "no_such_device");
			}
			console.log(`🔨 [debug] [transfer] L1 udids: ${udids}`);

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

			let sentence = `Accepting device transfer for devices ${JSON.stringify(udids)}`;
			alog.log(original_owner, sentence);
			alog.log(recipient, sentence);

			console.log("[OID:" + recipient + "] [TRANSFER_ACCEPT] ", { udids });

			const locked_udids = udids;

			// One device at a time (quick 261003-u86): each migration re-checks and moves that
			// device's API key before the next one starts. Any refusal answers (false, reason)
			// and keeps the transfer pending; devices that moved stay moved.
			(async () => {
				let refused = null;
				const pending_before = Array.isArray(json_keys.udids) ? json_keys.udids.length : 0;
				for (const xudid of locked_udids) {
					const result = await this.migration_promise(original_owner, xudid, recipient, body, json_keys);
					if ((refused === null) && result && (result.ok === false)) refused = result;
				}
				if (refused !== null) {
					// Keep what moved off the list (quick 261004-l7q), so the rest can complete.
					if (Array.isArray(json_keys.udids) && (json_keys.udids.length < pending_before)) {
						this.redis.set(dtid, JSON.stringify(json_keys));
						this.redis.expire(dtid, 3600);
					}
					return accept_callback(false, refused.reason);
				}
				this.save_dtid(dtid, json_keys, accept_callback);
			})().catch(e => console.log("[transfer] promise exception", e));
		});
	}

	storeRemainingKeys(dtid, json_keys, callback) {
		this.redis.set(dtid, JSON.stringify(json_keys));
			console.log(`🔨 [debug] [transfer] L4 Storing remaining keys: ${json_keys.udids}`);
			if (json_keys.udids.length > 0) {
				// 1 hour to let user accept/decline different devices
				this.redis.expire(dtid, 3600);
				callback(true, "transfer_partially_completed");
			} else {
				this.redis.del(dtid);
				callback(true, "transfer_completed");
			}
	}

	// caller_owner: see boundToCaller (undefined only for the e-mail link).
	decline(body, callback, caller_owner) {

		// minimum body should look like { "transfer_id":"uuid" }
		// optional body should look like { "transfer_id":"uuid", "udids" : [ ... ] }

		if (typeof (body.transfer_id) === "undefined") {
			return callback(false, "missing_transfer_id");
		}

		var transfer_id = body.transfer_id;

		// Possibly partial transfer: one udid (the POST route passes body.udid) or a list.
		var udids = [];
		if (typeof (body.udids) === "string") udids = [body.udids];
		else if (Array.isArray(body.udids)) udids = body.udids;

		var dtid = "dt:" + transfer_id;

		this.redis.get(dtid, (error, json) => {

			let json_keys = JSON.parse(json);

			if (json_keys === []) {
				console.log("[transfer] json_keys", json_keys);
				return callback(false, "transfer_id_invalid");
			}

			// Unknown transfer, or a session caller who is not its recipient (quick
			// 261004-l7q): the same answer, before anything changes.
			if ((json_keys === null) || !Transfer.boundToCaller(json_keys, caller_owner)) {
				console.log("[transfer] no such transfer anymore");
				return callback(true, "decline_complete_no_such_dtid");
			}

			console.log(`🔨 [debug] [transfer] L5 udids ${udids}`);

			if (!Array.isArray(json_keys.udids)) json_keys.udids = [];

			if (udids.length === 0) {
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


			console.log(`🔨 [debug] [transfer] Declining transfer`);

			alog.log(original_owner, "Declining device transfer for devices: " + JSON.stringify(udids), "warning");
			alog.log(recipient, "Declining device transfer for devices: " + JSON.stringify(udids), "warning");
			console.log("[OID:" + recipient + "] [TRANSFER_DECLINE] " + JSON.stringify(udids));

			// Drop the declined udids from the stored array (quick 261004-l7q).
			const declined = udids;
			json_keys.udids = json_keys.udids.filter((udid) => declined.indexOf(udid) === -1);

			// Store remaining (not declined) keys; this answers the caller, exactly once.
			this.storeRemainingKeys(dtid, json_keys, callback);
		});
	}

};
