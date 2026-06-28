/*
 * This THiNX Device Management API module is responsible for audit logging.
 */

const Globals = require("./globals.js");
const prefix = Globals.prefix();
const Database = require("./database.js");
const db_uri = new Database().uri();
const loglib = require("nano")(db_uri).use(prefix + "managed_logs");

module.exports = class Audit {

	// SEC-PII-02: read retention horizon from app_config with a 90-day fallback.
	// Wrapped in try/catch because Globals.app_config() may throw in early-boot
	// or test contexts; audit writes MUST NEVER fail because config loading fails.
	_retentionDays() {
		let retentionDays = 90;
		try {
			const cfg = (typeof Globals.app_config === "function") ? Globals.app_config() : null;
			if (cfg && typeof cfg.audit_retention_days === "number" && cfg.audit_retention_days > 0) {
				retentionDays = cfg.audit_retention_days;
			}
		} catch (_e) {
			retentionDays = 90;
		}
		return retentionDays;
	}

	// SEC-PII-02: pure record builder, additive — exposes the record shape
	// (incl. the new expire_at TTL field) so it can be asserted by spec
	// without touching the live CouchDB insert path. The log() method below
	// calls _buildRecord then loglib.insert; behavior is unchanged.
	_buildRecord(owner, message, flag, mtime) {
		if ((typeof (flag) === "undefined") || (flag === null)) {
			flag = "info";
		}
		if ((typeof (message) === "undefined") || (message === null)) {
			console.log("Audit log issue: no message for owner " + owner + " with flag " + flag);
			message = flag;
			flag = "info";
		}
		const retentionDays = this._retentionDays();
		const expire_at = new Date(mtime.getTime() + retentionDays * 24 * 60 * 60 * 1000);
		return {
			"message": message,
			"owner": owner,
			"date": mtime,
			"flags": Array.isArray(flag) ? flag : [flag],
			"expire_at": expire_at
		};
	}

	log(owner, message, flag, callback) {
		let mtime = new Date();
		let record = this._buildRecord(owner, message, flag, mtime);

		loglib.insert(record, mtime, (err/* , body, header */) => {
			const result = (err === null) ? true : false;
			if (!result) {
				console.log("Audit log insertion error: "+err);
			}
			if (typeof(callback) !== "undefined") {
				callback(result);
			}
		});
	}

	fetch(owner, callback) {
		loglib.view("logs", "logs_by_owner", {
			/*"key": owner,*/ "descending": true, "limit": 200
		}, (err, body) => {
			if (err) {
				console.log("[error] Audit Log Fetch Failed", {err});
				callback(err, body);
				return;
			}
			let auditlog = [];
			for (let index in body.rows) {
				let item = body.rows[index];
				if (item.value.owner.indexOf(owner) === -1) continue;
				let flags = item.value.flags;
				if (typeof(flags) === "undefined") {
					flags = ["info"];
				}
				auditlog.push({
					date: item.value.date,
					message: item.value.message,
					flags: flags
				});
			}
			callback(false, auditlog);
		});
	}

};
