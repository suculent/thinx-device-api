/*
 * This THiNX Device Management API module is responsible for audit logging.
 */

const Globals = require("./globals.js");
const prefix = Globals.prefix();
const Database = require("./database.js");
const db_uri = new Database().uri();
const loglib = require("./couch")(db_uri).use(prefix + "managed_logs");
const paging = require("./log_paging.js");

class Audit {

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
			console.warn("⚠️ [warning] Audit log issue: no message with flag " + flag);
			message = flag;
			flag = "info";
		}
		const retentionDays = this._retentionDays();
		const expire_at = new Date(mtime.getTime() + retentionDays * 24 * 60 * 60 * 1000);
		return {
			"message": message,
			"owner": owner,
			"date": mtime,
			// D-15: string-only flags, so no object (user document, repo map)
			// can reach managed_logs through Audit.log, whatever a caller passes.
			"flags": Audit.stringFlags(flag),
			"expire_at": expire_at
		};
	}

	log(owner, message, flag, callback) {
		let mtime = new Date();
		let record = this._buildRecord(owner, message, flag, mtime);

		loglib.insert(record, mtime, (err/* , body, header */) => {
			const result = (err === null) ? true : false;
			if (!result) {
				console.error("☣️ [error] Audit log insertion error: "+err);
			}
			if (typeof(callback) !== "undefined") {
				callback(result);
			}
		});
	}

	// D-15: keep only non-empty strings of at most 32 characters; ["info"] when
	// nothing survives. Accepts a single flag or an array of flags.
	static stringFlags(src) {
		const list = Array.isArray(src) ? src : [src];
		const flags = list.filter((f) => typeof f === "string" && f.length > 0 && f.length <= 32);
		return (flags.length > 0) ? flags : ["info"];
	}

	// LOG-02: the item shape every audit API response carries.
	static toAuditItem(value) {
		const v = (value && typeof value === "object") ? value : {};
		return {
			date: v.date,
			message: v.message,
			flags: Audit.stringFlags(v.flags)
		};
	}

	// LOG-02: the caller's own newest <= 200 entries from the owner-keyed view.
	// Falls back to the legacy view (D-19) when the new index is missing, fails
	// or is still building past VIEW_TIMEOUT_MS. The callback fires exactly once.
	fetch(owner, callback) {
		if (typeof owner !== "string" || owner.length === 0) {
			callback(false, []);
			return;
		}

		let decided = false;
		let timer = null;
		const decide = () => {
			if (decided) return false;
			decided = true;
			if (timer !== null) clearTimeout(timer);
			return true;
		};
		const fallback = (reason) => {
			Audit.fallbackCount++;
			console.log(`⚠️ [warning] [audit] owner-keyed audit view unavailable (reason=${reason}), serving the legacy view`);
			this._fetchLegacy(owner, callback);
		};

		timer = setTimeout(() => {
			if (decide()) fallback("timeout");
		}, Audit.VIEW_TIMEOUT_MS);

		let pending;
		try {
			pending = Promise.resolve(loglib.view("paging", "audit_by_owner_date", {
				startkey: [owner, {}], endkey: [owner], descending: true, limit: 200
			}));
		} catch (e) {
			pending = Promise.reject(e);
		}

		pending.then((body) => {
			if (!decide()) return; // late answer after the timeout fallback: dropped
			const rows = (body && Array.isArray(body.rows)) ? body.rows : [];
			callback(false, rows
				.filter((row) => row && Array.isArray(row.key) && row.key[0] === owner)
				.map((row) => Audit.toAuditItem(row.value)));
		}, (err) => {
			if (!decide()) return;
			const notFound = !!err && (err.statusCode === 404 || err.error === "not_found");
			fallback(notFound ? "not_found" : "error");
		}).catch(() => {
			console.error("☣️ [error] [audit] audit fetch callback failed");
		});
	}

	// LOG-03: one page of the caller's own entries, newest first, from the
	// owner-keyed view. `owner` comes from the session only; the cursor holds
	// just {k: date, i: doc id}, and buildQuery binds both range ends to owner.
	// No fallback: the paged path is new and the Vue console switches to it
	// only after the index is warm (D-12). callback(false, {items, paging}) or
	// callback(err).
	fetchPage(owner, limit, cursor, callback) {
		const L = (Number.isInteger(limit) && limit > 0) ? Math.min(limit, paging.MAX_LIMIT) : paging.DEFAULT_LIMIT;
		if (typeof owner !== "string" || owner.length === 0) {
			callback(false, { items: [], paging: { limit: L, has_more: false, next_cursor: null } });
			return;
		}
		loglib.view("paging", "audit_by_owner_date", paging.buildQuery(owner, L, cursor || null), (err, body) => {
			if (err) {
				const code = (typeof err.statusCode === "number") ? err.statusCode : "error";
				console.error("☣️ [error] [audit] audit page fetch failed", code);
				callback(err);
				return;
			}
			// Defence in depth on top of the owner-bounded range.
			const rows = ((body && Array.isArray(body.rows)) ? body.rows : [])
				.filter((row) => row && Array.isArray(row.key) && row.key[0] === owner);
			const page = paging.pageFromRows(rows, L);
			callback(false, {
				items: page.rows.map((row) => Audit.toAuditItem(row.value)),
				paging: page.paging
			});
		});
	}

	// Pre-phase-26 query, kept as the D-19 fallback. Strict owner equality
	// replaces the old substring match; flags go through toAuditItem.
	_fetchLegacy(owner, callback) {
		loglib.view("logs", "logs_by_owner", {
			/*"key": owner,*/ "descending": true, "limit": 200
		}, (err, body) => {
			if (err) {
				const code = (err && typeof err.statusCode === "number") ? err.statusCode : "error";
				console.error("☣️ [error] Audit Log Fetch Failed", code);
				callback(err, body);
				return;
			}
			const rows = (body && Array.isArray(body.rows)) ? body.rows : [];
			callback(false, rows
				.filter((item) => item && item.value && item.value.owner === owner)
				.map((item) => Audit.toAuditItem(item.value)));
		});
	}

}

// LOG-02 / D-19: how long Audit.fetch waits for the owner-keyed view before
// serving the legacy one (writable for specs), and how often it fell back
// (read by the plan 26-02 production probe).
Audit.VIEW_TIMEOUT_MS = 5000;
Audit.fallbackCount = 0;

module.exports = Audit;
