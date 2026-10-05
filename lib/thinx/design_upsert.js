/*
 * LOG-01 — Rev-aware, never-throwing design-document upsert (phase 26).
 *
 * Database.init only ever injected design docs into a freshly created
 * database, so a design doc added later never reached production. This module
 * installs `_design/paging` on every boot, comparing it first:
 *
 *   absent (404)            → insert without _rev          action "created"
 *   canonically equal       → no write, no re-index        action "unchanged"
 *   different               → insert carrying stored _rev  action "updated"
 *   409 on insert           → re-GET; equal → "unchanged", else "conflict"
 *   GET fails / times out   → no write                     action "skipped"
 *   insert fails            →                              action "failed"
 *
 * Contract: ensureDesignDoc NEVER rejects and never calls process.exit; it
 * resolves {ok, action, reason}. `reason` is a short token taken only from a
 * status code, a CouchDB error word, a Node error code, or "timeout". The
 * error object itself is never stringified, because nano errors can carry the
 * request URL and that URL holds the CouchDB credentials.
 *
 * Only `_design/paging` is ever loaded from disk (D-13: `_design/logs` and the
 * other legacy design docs are never written by this module).
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 5000;
const PAGING_NAMES = ["logs", "builds"];
const PAGING_ID = "_design/paging";

// Deep copy with sorted object keys and every `_rev` key dropped.
function canonical(v) {
	if (Array.isArray(v)) return v.map(canonical);
	if (v && typeof v === "object") {
		const o = {};
		Object.keys(v).sort().forEach((k) => {
			if (k !== "_rev") o[k] = canonical(v[k]);
		});
		return o;
	}
	return v;
}

function sameDesign(a, b) {
	return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

// Same shape as audit-ttl-probe.js withTimeout; the timer is always released.
function withTimeout(promise, ms) {
	let timer = null;
	const timeoutPromise = new Promise((_resolve, reject) => {
		timer = setTimeout(() => {
			const e = new Error("design upsert timed out");
			e.reason = "timeout";
			e.timedOut = true;
			reject(e);
		}, ms);
	});
	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timer !== null) clearTimeout(timer);
	});
}

const TOKEN = /^[A-Za-z0-9_.-]{1,40}$/;

// Short, credential-free reason token. Never reads e.message.
function reasonOf(e) {
	if (!e || typeof e !== "object") return "error";
	if (e.timedOut === true) return "timeout";
	if (typeof e.statusCode === "number") return String(e.statusCode);
	if (typeof e.error === "string" && TOKEN.test(e.error)) return e.error;
	if (typeof e.code === "string" && TOKEN.test(e.code)) return e.code;
	return "error";
}

// Runs fn() so that a synchronous throw becomes a rejection.
function attempt(fn) {
	return new Promise((resolve) => resolve(fn()));
}

function loadPagingDesign(name) {
	if (PAGING_NAMES.indexOf(name) === -1) return null;
	try {
		const file = path.join(__dirname, "../../design/paging_" + name + ".json");
		const doc = JSON.parse(fs.readFileSync(file, "utf8"));
		if (!doc || typeof doc !== "object" || doc._id !== PAGING_ID) return null;
		return doc;
	} catch (_e) {
		return null;
	}
}

async function ensureDesignDoc(db, desired, opts) {
	const timeoutMs = (opts && typeof opts.timeoutMs === "number" && opts.timeoutMs > 0) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
	try {
		if (!db || typeof db.get !== "function" || typeof db.insert !== "function") {
			return { ok: false, action: "skipped", reason: "no_db" };
		}
		if (!desired || typeof desired !== "object" || typeof desired._id !== "string") {
			return { ok: false, action: "skipped", reason: "no_design" };
		}
		const t = (fn) => withTimeout(attempt(fn), timeoutMs);

		let existing = null;
		try {
			existing = await t(() => db.get(desired._id));
		} catch (e) {
			if (!e || e.statusCode !== 404) {
				return { ok: false, action: "skipped", reason: reasonOf(e) };
			}
			existing = null;
		}

		if (existing && sameDesign(existing, desired)) {
			return { ok: true, action: "unchanged", reason: null };
		}

		const doc = Object.assign({}, desired);
		delete doc._rev;
		if (existing && typeof existing._rev === "string") doc._rev = existing._rev;

		try {
			await t(() => db.insert(doc, doc._id));
			return { ok: true, action: existing ? "updated" : "created", reason: null };
		} catch (e) {
			if (e && e.statusCode === 409) {
				let now = null;
				try {
					now = await t(() => db.get(desired._id));
				} catch (_e) {
					now = null;
				}
				if (now && sameDesign(now, desired)) return { ok: true, action: "unchanged", reason: null };
				return { ok: false, action: "conflict", reason: "409" };
			}
			return { ok: false, action: "failed", reason: reasonOf(e) };
		}
	} catch (e) {
		return { ok: false, action: "failed", reason: reasonOf(e) };
	}
}

module.exports = { canonical, sameDesign, withTimeout, loadPagingDesign, ensureDesignDoc };
