/*
 * LOG-03 / LOG-04 — opt-in cursor paging for the audit log and the build list
 * (phase 26).
 *
 * Pure: no CouchDB, no config. Nothing here throws on bad input; the parse
 * functions follow the safepath `{ok, ...}` return convention.
 *
 * Cursor: base64url(JSON {v:1, k, i}), where k is the second element of the
 * last view key (an ISO date for the audit log, epoch ms for builds) and i is
 * the CouchDB doc id used as the startkey_docid tie-break. The cursor never
 * carries the owner: buildQuery binds BOTH range ends to the owner argument,
 * which the router takes from the session only, so replaying a cursor as
 * another owner can only move the position inside that owner's own key range.
 *
 * Locked contract (26-CONTEXT.md): no `skip` paging, no `total_rows`.
 */

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;
const MAX_CURSOR = 512;
const MAX_ID = 128;
const MAX_AUDIT_KEY = 64;

const LIMIT_RE = /^\d{1,4}$/;
const CURSOR_RE = /^[A-Za-z0-9_-]+$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

function parseLimit(raw) {
	if (typeof raw === "undefined") return { ok: true, limit: DEFAULT_LIMIT };
	if (typeof raw !== "string" || !LIMIT_RE.test(raw)) return { ok: false, reason: "invalid_limit" };
	return { ok: true, limit: Math.min(MAX_LIMIT, Math.max(1, parseInt(raw, 10))) };
}

function encodeCursor(k, id) {
	return Buffer.from(JSON.stringify({ v: 1, k: k, i: id }), "utf8").toString("base64url");
}

const INVALID = Object.freeze({ ok: false, reason: "invalid_cursor" });

function validKey(kind, k) {
	if (kind === "audit") return typeof k === "string" && k.length > 0 && k.length <= MAX_AUDIT_KEY;
	if (kind === "builds") return typeof k === "number" && Number.isFinite(k);
	return false;
}

// kind: "audit" (k a string of at most 64 chars) | "builds" (k a finite number)
function decodeCursor(raw, kind) {
	if (typeof raw === "undefined") return { ok: true, cursor: null };
	if (kind !== "audit" && kind !== "builds") return INVALID;
	if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CURSOR || !CURSOR_RE.test(raw)) return INVALID;
	let c;
	try {
		c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
	} catch (_e) {
		return INVALID;
	}
	if (!c || typeof c !== "object" || Array.isArray(c)) return INVALID;
	if (c.v !== 1) return INVALID;
	if (typeof c.i !== "string" || c.i.length === 0 || c.i.length > MAX_ID || CONTROL_RE.test(c.i)) return INVALID;
	if (!validKey(kind, c.k)) return INVALID;
	return { ok: true, cursor: { k: c.k, i: c.i } };
}

// owner MUST come from the session. `extra` (e.g. include_docs) is merged
// first, so it can never override the owner bounds, the direction or the
// limit, and never contributes a `skip` or a startkey_docid.
function buildQuery(owner, limit, cursor, extra) {
	const q = Object.assign({}, (extra && typeof extra === "object") ? extra : {});
	delete q.skip;
	delete q.startkey_docid;
	q.descending = true;
	if (cursor) {
		q.startkey = [owner, cursor.k];
		q.startkey_docid = cursor.i;
	} else {
		q.startkey = [owner, {}];
	}
	q.endkey = [owner];
	q.limit = limit + 1;
	return q;
}

function pageFromRows(rows, limit) {
	const list = Array.isArray(rows) ? rows : [];
	const has_more = list.length > limit;
	const next = has_more ? list[limit] : null;
	return {
		rows: list.slice(0, limit),
		paging: {
			limit: limit,
			has_more: has_more,
			next_cursor: (next && Array.isArray(next.key)) ? encodeCursor(next.key[1], next.id) : null
		}
	};
}

module.exports = { parseLimit, encodeCursor, decodeCursor, buildQuery, pageFromRows, MAX_LIMIT, DEFAULT_LIMIT };
