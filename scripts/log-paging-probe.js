#!/usr/bin/env node
/*
 * scripts/log-paging-probe.js
 *
 * LOG-01..LOG-04 (phase 26) — READ-ONLY production probe for the log paging
 * rollout (run by plan 26-06 after the backend push and index warm-up).
 *
 * It reads `_design/paging` and `_design/logs`, walks the owner-keyed audit
 * and build views through the same library calls the API uses
 * (Audit#fetch / Audit#fetchPage, Buildlog#list / Buildlog#listPage), checks
 * the raw view pages for ownership, order and duplicates, replays one owner's
 * cursor as another owner, and compares managed_builds doc_del_count before
 * and after the build reads (reads must be side-effect free, D-07).
 *
 * It never writes, never uses `skip`, and prints AGGREGATES ONLY: one
 * `key=value` line per check in a fixed order, then
 *   LOG-PAGING-PROBE OK
 * or
 *   LOG-PAGING-PROBE FAIL <comma-separated failed check keys>
 * No owner id, email, doc id, cursor, per-document date or CouchDB URL is ever
 * printed. Error lines (`error_<section>=<status>_<word>`) carry only an HTTP
 * status code and a short CouchDB error word.
 *
 * Usage (inside a container that has the API's CouchDB credentials in env):
 *   node scripts/log-paging-probe.js
 * Exit code: 0 on OK, 1 on FAIL.
 *
 * Specs inject everything through run({deps, auditOwners, buildOwners}).
 */

"use strict";

const crypto = require("crypto");
const paging = require("../lib/thinx/log_paging.js");
const DesignUpsert = require("../lib/thinx/design_upsert.js");

const PAGE = 100;
const LEGACY_CAP = 200;
const BATCH = 1000;
const MAX_PAGES = 10000;

const CONTRACT_VIEWS = {
	logs: ["audit_by_date", "audit_by_owner_date"],
	builds: ["builds_by_owner_time", "builds_by_time"]
};

const KEYS = [
	"ddoc_paging_logs", "ddoc_paging_builds", "ddoc_logs_rev_gen", "ddoc_logs_map_sha12",
	"index_logs_updater_running", "index_builds_updater_running",
	"audit_owners", "legacy_len", "legacy_expected", "legacy_match", "legacy_object_flags", "legacy_fallback_used",
	"audit_pages", "audit_total", "audit_expected", "audit_dupes", "audit_order_ok", "audit_foreign",
	"audit_cursor_owner_free", "audit_first_page_ms",
	"replay_rows", "replay_foreign",
	"build_owners", "build_pages", "build_total", "build_expected", "build_dupes", "build_order_ok",
	"build_foreign", "build_nested", "build_first_page_ms",
	"builds_del_before", "builds_del_after"
];

const WORD = /^[a-z_]{1,40}$/;

// "<status>_<word>" from a CouchDB/nano error; never the message or URL.
function errToken(e) {
	const code = (e && typeof e.statusCode === "number") ? String(e.statusCode) : "na";
	const word = (e && typeof e.error === "string" && WORD.test(e.error)) ? e.error : "error";
	return code + "_" + word;
}

function cb2p(fn) {
	return new Promise((resolve) => {
		fn((err, body) => resolve({ err: err, body: body }));
	});
}

function defaultDeps() {
	// Production wiring, loaded lazily so specs never touch the real modules.
	const Globals = require("../lib/thinx/globals.js");
	const Database = require("../lib/thinx/database.js");
	const couch = require("../lib/thinx/couch.js")(new Database().uri());
	const prefix = Globals.prefix() || "";
	const Audit = require("../lib/thinx/audit.js");
	const Buildlog = require("../lib/thinx/buildlog.js");
	return {
		logsDb: couch.use(prefix + "managed_logs"),
		buildsDb: couch.use(prefix + "managed_builds"),
		audit: new Audit(),
		AuditClass: Audit,
		buildlog: new Buildlog()
	};
}

async function ddocState(db, name) {
	let doc;
	try {
		doc = await db.get("_design/paging");
	} catch (e) {
		if (e && e.statusCode === 404) return "missing";
		throw e;
	}
	const views = (doc && doc.views && typeof doc.views === "object") ? Object.keys(doc.views).sort() : [];
	if (JSON.stringify(views) !== JSON.stringify(CONTRACT_VIEWS[name])) return "mismatch";
	const desired = DesignUpsert.loadPagingDesign(name);
	if (desired && !DesignUpsert.sameDesign(doc, desired)) return "mismatch";
	return "ok";
}

async function updaterRunning(db) {
	const info = await db.get("_design/paging/_info");
	return !!(info && info.view_index && info.view_index.updater_running === true);
}

// Distinct key[0] counts over a whole view, ascending, BATCH rows at a time,
// continued with startkey/startkey_docid (never skip).
async function discoverOwners(db, view) {
	const counts = new Map();
	let q = { limit: BATCH + 1 };
	for (let i = 0; i < MAX_PAGES; i++) {
		const body = await db.view("paging", view, q);
		const rows = (body && Array.isArray(body.rows)) ? body.rows : [];
		rows.slice(0, BATCH).forEach((r) => {
			const o = (r && Array.isArray(r.key)) ? r.key[0] : null;
			if (typeof o === "string" && o.length > 0) counts.set(o, (counts.get(o) || 0) + 1);
		});
		if (rows.length <= BATCH) break;
		const next = rows[BATCH];
		q = { limit: BATCH + 1, startkey: next.key, startkey_docid: next.id };
	}
	const ranked = Array.from(counts.entries()).sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0)));
	return { count: counts.size, owners: ranked.map((e) => e[0]) };
}

// Number of rows in the owner's key range, BATCH at a time (never skip).
async function countRange(db, view, owner) {
	let total = 0;
	let cursor = null;
	for (let i = 0; i < MAX_PAGES; i++) {
		const body = await db.view("paging", view, paging.buildQuery(owner, BATCH, cursor));
		const page = paging.pageFromRows(body && body.rows, BATCH);
		total += page.rows.filter((r) => r && Array.isArray(r.key) && r.key[0] === owner).length;
		if (!page.paging.has_more) break;
		const next = body.rows[BATCH];
		cursor = { k: next.key[1], i: next.id };
	}
	return total;
}

function cmpDesc(prev, cur) {
	// true when `cur` comes at or after `prev` in descending (key[1], id) order
	const a = prev.key[1], b = cur.key[1];
	if (a > b) return true;
	if (a < b) return false;
	return prev.id >= cur.id;
}

function ownerFreeCursor(cursor, owners) {
	try {
		const json = Buffer.from(cursor, "base64url").toString("utf8");
		const obj = JSON.parse(json);
		if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
		if (JSON.stringify(Object.keys(obj)) !== JSON.stringify(["v", "k", "i"])) return false;
		if (/[a-f0-9]{64}/.test(json)) return false;
		return owners.every((o) => typeof o !== "string" || json.indexOf(o) === -1);
	} catch (_e) {
		return false;
	}
}

// Walks one owner's pages through the library call (apiPage) and, page by
// page, the raw view with the same buildQuery, for the ownership/order checks.
async function walk(opts) {
	const { db, view, owner, kind, extra, apiPage, now, owners } = opts;
	const out = {
		pages: 0, total: 0, dupes: 0, order_ok: 1, foreign: 0, cursor_owner_free: 1,
		first_page_ms: 0, nested: 0, first_cursor: null, first_row: null, mismatch: 0
	};
	const seen = new Set();
	let prev = null;
	let cursor = null;
	let lastRaw = null;
	for (let i = 0; i < MAX_PAGES; i++) {
		const t0 = now();
		const api = await apiPage(owner, PAGE, cursor);
		if (i === 0) out.first_page_ms = Math.max(0, Math.round(now() - t0));
		const body = await db.view("paging", view, paging.buildQuery(owner, PAGE, cursor, extra));
		const raw = paging.pageFromRows(body && body.rows, PAGE);
		out.pages++;
		out.total += api.count;
		if (api.count !== raw.rows.length) out.mismatch++;
		raw.rows.forEach((r) => {
			if (!r || !Array.isArray(r.key) || r.key[0] !== owner) { out.foreign++; return; }
			if (out.first_row === null) out.first_row = { k: r.key[1], i: r.id };
			if (seen.has(r.id)) out.dupes++;
			seen.add(r.id);
			if (prev !== null && !cmpDesc(prev, r)) out.order_ok = 0;
			prev = r;
			if (kind === "builds" && r.doc && typeof r.doc.owner !== "string") out.nested++;
		});
		const next = api.paging ? api.paging.next_cursor : null;
		if (!api.paging || !api.paging.has_more || typeof next !== "string") break;
		if (!ownerFreeCursor(next, owners)) out.cursor_owner_free = 0;
		if (next === lastRaw) { out.order_ok = 0; break; } // a cursor that does not advance
		lastRaw = next;
		const dec = paging.decodeCursor(next, kind);
		if (!dec.ok) { out.cursor_owner_free = 0; break; }
		if (i === 0) out.first_cursor = dec.cursor;
		cursor = dec.cursor;
	}
	return out;
}

async function run(opts) {
	const o = opts || {};
	const d = Object.assign({}, (o.deps && o.deps.logsDb) ? {} : defaultDeps(), o.deps || {});
	const now = (typeof d.now === "function") ? d.now : () => Date.now();
	const AuditClass = d.AuditClass || (d.audit && d.audit.constructor) || {};
	const v = {};
	const errors = [];
	const guard = async (section, fn) => {
		try {
			await fn();
		} catch (e) {
			errors.push("error_" + section + "=" + errToken(e));
		}
	};

	// ---- design docs and indexes (LOG-01)
	v.ddoc_paging_logs = "missing";
	v.ddoc_paging_builds = "missing";
	await guard("ddoc_paging_logs", async () => { v.ddoc_paging_logs = await ddocState(d.logsDb, "logs"); });
	await guard("ddoc_paging_builds", async () => { v.ddoc_paging_builds = await ddocState(d.buildsDb, "builds"); });
	v.ddoc_logs_rev_gen = 0;
	v.ddoc_logs_map_sha12 = "none";
	await guard("ddoc_logs", async () => {
		const logs = await d.logsDb.get("_design/logs");
		const gen = parseInt(String(logs && logs._rev).split("-")[0], 10);
		v.ddoc_logs_rev_gen = Number.isFinite(gen) ? gen : 0;
		const map = logs && logs.views && logs.views.logs_by_owner ? logs.views.logs_by_owner.map : null;
		if (typeof map === "string") v.ddoc_logs_map_sha12 = crypto.createHash("sha256").update(map).digest("hex").slice(0, 12);
	});
	v.index_logs_updater_running = false;
	v.index_builds_updater_running = false;
	await guard("index_logs", async () => { v.index_logs_updater_running = await updaterRunning(d.logsDb); });
	await guard("index_builds", async () => { v.index_builds_updater_running = await updaterRunning(d.buildsDb); });

	// ---- owner selection (never printed)
	let auditOwners = Array.isArray(o.auditOwners) ? o.auditOwners.filter((x) => typeof x === "string" && x.length > 0) : null;
	let buildOwners = Array.isArray(o.buildOwners) ? o.buildOwners.filter((x) => typeof x === "string" && x.length > 0) : null;
	v.audit_owners = auditOwners ? auditOwners.length : 0;
	v.build_owners = buildOwners ? buildOwners.length : 0;
	if (!auditOwners) {
		auditOwners = [];
		await guard("audit_owners", async () => {
			const r = await discoverOwners(d.logsDb, "audit_by_owner_date");
			v.audit_owners = r.count;
			auditOwners = r.owners.slice(0, 2);
		});
	}
	if (!buildOwners) {
		buildOwners = [];
		await guard("build_owners", async () => {
			const r = await discoverOwners(d.buildsDb, "builds_by_owner_time");
			v.build_owners = r.count;
			buildOwners = r.owners.slice(0, 2);
		});
	}
	const A = auditOwners[0] || null;
	const B = auditOwners[1] || null;
	const BA = buildOwners[0] || null;
	const known = auditOwners.concat(buildOwners);

	// ---- builds: side-effect baseline before any build read (D-07)
	v.builds_del_before = -1;
	await guard("builds_del_before", async () => {
		const info = await d.buildsDb.info();
		v.builds_del_before = (info && typeof info.doc_del_count === "number") ? info.doc_del_count : -1;
	});

	// ---- legacy audit call (LOG-02)
	v.legacy_len = -1; v.legacy_expected = -2; v.legacy_match = 0; v.legacy_object_flags = 0; v.legacy_fallback_used = 0;
	v.audit_expected = -1;
	if (A) {
		await guard("audit_expected", async () => { v.audit_expected = await countRange(d.logsDb, "audit_by_owner_date", A); });
		await guard("legacy", async () => {
			const before = (typeof AuditClass.fallbackCount === "number") ? AuditClass.fallbackCount : 0;
			const r = await cb2p((cb) => d.audit.fetch(A, cb));
			const after = (typeof AuditClass.fallbackCount === "number") ? AuditClass.fallbackCount : 0;
			v.legacy_fallback_used = Math.max(0, after - before);
			if (r.err) throw r.err;
			const items = Array.isArray(r.body) ? r.body : [];
			const raw = await d.logsDb.view("paging", "audit_by_owner_date", {
				startkey: [A, {}], endkey: [A], descending: true, limit: LEGACY_CAP
			});
			const rawDates = ((raw && Array.isArray(raw.rows)) ? raw.rows : [])
				.filter((x) => x && Array.isArray(x.key) && x.key[0] === A)
				.map((x) => x.key[1]);
			v.legacy_len = items.length;
			v.legacy_expected = Math.min(LEGACY_CAP, v.audit_expected);
			v.legacy_object_flags = items.filter((it) => !it || !Array.isArray(it.flags) || it.flags.some((f) => typeof f !== "string")).length;
			v.legacy_match = (items.length === rawDates.length && items.every((it, i) => it && it.date === rawDates[i])) ? 1 : 0;
		});
	}

	// ---- paged audit (LOG-03)
	let auditWalk = { pages: 0, total: -1, dupes: 0, order_ok: 0, foreign: 0, cursor_owner_free: 0, first_page_ms: 0, first_cursor: null, first_row: null, mismatch: 0 };
	if (A) {
		await guard("audit_walk", async () => {
			auditWalk = await walk({
				db: d.logsDb, view: "audit_by_owner_date", owner: A, kind: "audit", extra: undefined, now: now, owners: known,
				apiPage: async (owner, limit, cursor) => {
					const r = await cb2p((cb) => d.audit.fetchPage(owner, limit, cursor, cb));
					if (r.err) throw r.err;
					return { count: Array.isArray(r.body.items) ? r.body.items.length : 0, paging: r.body.paging };
				}
			});
		});
	}
	v.audit_pages = auditWalk.pages;
	v.audit_total = auditWalk.total;
	v.audit_dupes = auditWalk.dupes;
	v.audit_order_ok = (auditWalk.order_ok === 1 && auditWalk.mismatch === 0) ? 1 : 0;
	v.audit_foreign = auditWalk.foreign;
	v.audit_cursor_owner_free = auditWalk.cursor_owner_free;
	v.audit_first_page_ms = auditWalk.first_page_ms;

	// ---- cross-owner replay: A's first cursor queried as B
	v.replay_rows = 0;
	v.replay_foreign = 0;
	const replayCursor = auditWalk.first_cursor || auditWalk.first_row;
	if (B && replayCursor) {
		await guard("replay", async () => {
			const body = await d.logsDb.view("paging", "audit_by_owner_date", paging.buildQuery(B, PAGE, replayCursor));
			const page = paging.pageFromRows(body && body.rows, PAGE);
			v.replay_rows = page.rows.length;
			v.replay_foreign = page.rows.filter((r) => !r || !Array.isArray(r.key) || r.key[0] !== B).length;
		});
	}

	// ---- builds (LOG-04): legacy list, then the full paged walk
	let buildWalk = { pages: 0, total: -1, dupes: 0, order_ok: 0, foreign: 0, nested: 0, first_page_ms: 0, mismatch: 0 };
	v.build_expected = -1;
	if (BA) {
		await guard("build_expected", async () => { v.build_expected = await countRange(d.buildsDb, "builds_by_owner_time", BA); });
		await guard("build_legacy", async () => {
			const r = await cb2p((cb) => d.buildlog.list(BA, cb));
			if (r.err) throw (typeof r.err === "object" ? r.err : {});
		});
		await guard("build_walk", async () => {
			buildWalk = await walk({
				db: d.buildsDb, view: "builds_by_owner_time", owner: BA, kind: "builds", extra: { include_docs: true }, now: now, owners: known,
				apiPage: async (owner, limit, cursor) => {
					const r = await cb2p((cb) => d.buildlog.listPage(owner, limit, cursor, cb));
					if (r.err) throw r.err;
					return { count: Array.isArray(r.body.rows) ? r.body.rows.length : 0, paging: r.body.paging };
				}
			});
		});
	}
	v.build_pages = buildWalk.pages;
	v.build_total = buildWalk.total;
	v.build_dupes = buildWalk.dupes;
	v.build_order_ok = (buildWalk.order_ok === 1 && buildWalk.mismatch === 0) ? 1 : 0;
	v.build_foreign = buildWalk.foreign;
	v.build_nested = buildWalk.nested;
	v.build_first_page_ms = buildWalk.first_page_ms;

	v.builds_del_after = -2;
	await guard("builds_del_after", async () => {
		const info = await d.buildsDb.info();
		v.builds_del_after = (info && typeof info.doc_del_count === "number") ? info.doc_del_count : -2;
	});

	// ---- verdict
	const failed = [];
	const check = (key, okay) => { if (!okay) failed.push(key); };
	check("ddoc_paging_logs", v.ddoc_paging_logs === "ok");
	check("ddoc_paging_builds", v.ddoc_paging_builds === "ok");
	check("audit_owners", v.audit_owners >= 1 && A !== null);
	check("legacy_len", v.legacy_len === v.legacy_expected);
	check("legacy_match", v.legacy_match === 1);
	check("legacy_object_flags", v.legacy_object_flags === 0);
	check("legacy_fallback_used", v.legacy_fallback_used === 0);
	check("audit_total", v.audit_total === v.audit_expected && v.audit_total >= 0);
	check("audit_dupes", v.audit_dupes === 0);
	check("audit_order_ok", v.audit_order_ok === 1);
	check("audit_foreign", v.audit_foreign === 0);
	check("audit_cursor_owner_free", v.audit_cursor_owner_free === 1);
	check("replay_foreign", v.replay_foreign === 0);
	check("build_owners", v.build_owners >= 1 && BA !== null);
	check("build_total", v.build_total === v.build_expected && v.build_total >= 0);
	check("build_dupes", v.build_dupes === 0);
	check("build_order_ok", v.build_order_ok === 1);
	check("build_foreign", v.build_foreign === 0);
	check("builds_del_after", v.builds_del_after === v.builds_del_before && v.builds_del_before >= 0);
	errors.forEach((line) => {
		const key = line.slice("error_".length, line.indexOf("="));
		if (failed.indexOf("error_" + key) === -1) failed.push("error_" + key);
	});

	const lines = KEYS.map((k) => k + "=" + String(v[k]));
	errors.forEach((line) => lines.push(line));
	const ok = failed.length === 0;
	lines.push(ok ? "LOG-PAGING-PROBE OK" : "LOG-PAGING-PROBE FAIL " + failed.join(","));
	return { ok: ok, lines: lines };
}

async function main() {
	const r = await run({});
	r.lines.forEach((line) => console.log(line));
	return r.ok ? 0 : 1;
}

module.exports = { run, KEYS, errToken, ownerFreeCursor };

if (require.main === module) {
	main()
		.then((code) => process.exit(code))
		.catch(() => {
			// never print the error object: it can carry the credentialed URL
			console.log("LOG-PAGING-PROBE FAIL probe_crashed");
			process.exit(1);
		});
}
