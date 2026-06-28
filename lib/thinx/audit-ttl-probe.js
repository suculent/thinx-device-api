/*
 * OBS-02 — Startup audit-log TTL eviction probe (DETECT-only).
 *
 * Purpose
 * -------
 * v1.9 Phase 9 SEC-PII-02 stamps a forward `expire_at` field on every
 * `managed_logs` record (90-day default, parameterized via
 * app_config.audit_retention_days). The cleanup of expired docs is the
 * CouchDB cluster's responsibility — operator-side cron or a native TTL
 * pathway prunes the rows once they cross the boundary. This module
 * verifies the guarantee from the API side: if the oldest expired doc is
 * still present beyond a GRACE_MS window (7 days default), the cleanup
 * mechanism is drifting and the operator needs to investigate.
 *
 * This module exposes a PURE, READ-ONLY, NO-LOG probe that the caller
 * (today `thinx-core.js` immediately after the cert-probe call site at
 * line 216) invokes once at startup. The probe returns a plain result
 * object; the caller decides whether to emit a warning, raise a Rollbar
 * event, or simply ignore the signal. Surfacing is intentionally NOT
 * done here — that keeps the module trivially testable and prevents
 * accidental log spam during unit tests.
 *
 * Mirrors lib/thinx/cert-probe.js structural template — same
 * PURE/READ-ONLY/NO-LOG/NEVER-throws contract per Phase 11 D-01.
 * Probes the expire_at field written by lib/thinx/audit.js _buildRecord
 * (the per-record TTL stamp that SEC-PII-02 lands on every audit row).
 *
 * Hard guarantees (verified at module-grep level + at spec level)
 * ---------------------------------------------------------------
 *   1. Module body contains NO `console.log`, `console.warn`, or
 *      `rollbar` calls. Verifiable by grep (comment-stripped).
 *   2. Module uses ONLY `nano(...).use(...).find(...)` — never
 *      `.insert`, `.bulk`, `.destroy`, `fs.writeFile*`, etc.
 *      Verifiable by grep.
 *   3. `probeTtlEviction` NEVER throws — all error paths return a
 *      well-formed result object with `ok:null` or `ok:false` and a
 *      descriptive message.
 *
 * Self-contained CouchDB client — does NOT import audit.js loglib
 * ----------------------------------------------------------------
 * The probe constructs its OWN short-lived `nano(couchdbUri).use(dbName)`
 * instance instead of reusing the audit module's module-level CouchDB
 * handle. This is intentional per Phase 12 D-03 (and matches Phase 11
 * cert-probe's "Allowlist duplication note" stance): keep the probe
 * self-contained so it has no dependency on bootstrap state, can be
 * loaded independently, and stays trivially testable without forcing the
 * spec to also bring up the full audit module. The cost is one extra
 * nano client per startup — negligible compared to the boot footprint.
 */

const nano = require("nano");

const DEFAULT_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days per D-05
const DEFAULT_TIMEOUT_MS = 5000;                  // 5s fixed per D-06

// Doc-ID redaction = first 8 chars + ellipsis (per D-08; matches OBS-01
// D-21 redaction depth so the WARN line never leaks a full _id).
function redactDocId(id) {
  if (typeof id !== "string" || id.length === 0) {
    return "<unknown>";
  }
  return id.slice(0, 8) + "...";
}

// Promise.race wrapper that rejects with a sentinel error after `ms`
// milliseconds. The sentinel ("__OBS_02_TIMEOUT__") is matched by the
// main function to distinguish a timeout from any other rejection. The
// `.finally(clearTimeout)` ensures the timer is released even when the
// underlying promise resolves first — avoids leaking a Node timer per
// boot invocation.
function withTimeout(promise, ms) {
  let timer = null;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("__OBS_02_TIMEOUT__")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}

/**
 * probeTtlEviction({ couchdbUri, dbName, graceMs, timeoutMs })
 *
 * DETECT-only probe. Issues a single Mango `find` against the
 * `managed_logs` database asking for the oldest doc whose `expire_at`
 * is older than `Date.now() - graceMs`. Returns a result object
 * describing the worst-case drift the caller should warn about.
 *
 * @param {object} opts
 * @param {string} opts.couchdbUri   nano-style CouchDB URI (e.g.,
 *                                   `http://user:pass@couchdb:5984`).
 * @param {string} opts.dbName       Database name (e.g.,
 *                                   `<prefix>managed_logs`).
 * @param {number} [opts.graceMs]    Grace window in ms; default 7 days.
 * @param {number} [opts.timeoutMs]  Per-query timeout in ms; default 5000.
 *
 * @returns {Promise<{
 *   ok: (boolean|null),
 *   oldestExpiredId: (string|null),
 *   staleByDays: (number|null),
 *   message: (string|null)
 * }>}
 *
 * Return semantics (mirrors cert-probe per D-02)
 * ----------------------------------------------
 *   ok:true,  message:null         — no expired-but-live docs found
 *                                    (clean cleanup-mechanism state).
 *   ok:false, message:<descriptive> — at least one expired-but-live doc
 *                                     exists; caller should emit a WARN.
 *   ok:null,  message:'probe skipped: ...'
 *                                   — probe could not produce a verdict
 *                                     (CouchDB unreachable, query
 *                                     timeout, malformed URI, missing
 *                                     parameters). Caller emits NOTHING.
 *
 * All error paths return without throwing.
 */
async function probeTtlEviction({ couchdbUri, dbName, graceMs, timeoutMs } = {}) {
  graceMs = graceMs || DEFAULT_GRACE_MS;
  timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;

  if (!couchdbUri || !dbName) {
    return {
      ok: null,
      oldestExpiredId: null,
      staleByDays: null,
      message: "probe skipped: missing couchdbUri or dbName",
    };
  }

  let db;
  try {
    db = nano(couchdbUri).use(dbName);
  } catch (e) {
    return {
      ok: null,
      oldestExpiredId: null,
      staleByDays: null,
      message: "probe skipped: " + (e && e.message ? e.message : String(e)),
    };
  }

  const nowMs = Date.now();
  const expiredBefore = nowMs - graceMs;

  // Mango find selector — per D-04, Mango is preferred over a
  // `_design/cleanup`-view query because the SEC-PII-02 design doc may
  // not be installed yet on production CouchDB. `fields` is restricted
  // to the minimal pair so the response payload never carries the full
  // audit-log doc (which could contain a PII-shaped `message` field
  // that SEC-PII-02 redacts at write time — defense-in-depth).
  const query = {
    selector: { expire_at: { "$lt": new Date(expiredBefore).toISOString() } },
    sort: [{ expire_at: "asc" }],
    limit: 1,
    fields: ["_id", "expire_at"],
  };

  let response;
  try {
    response = await withTimeout(db.find(query), timeoutMs);
  } catch (e) {
    if (e && e.message === "__OBS_02_TIMEOUT__") {
      return {
        ok: null,
        oldestExpiredId: null,
        staleByDays: null,
        message: "probe skipped: CouchDB query timed out at " + timeoutMs + "ms",
      };
    }
    return {
      ok: null,
      oldestExpiredId: null,
      staleByDays: null,
      message: "probe skipped: " + (e && e.message ? e.message : String(e)),
    };
  }

  if (!response || !Array.isArray(response.docs) || response.docs.length === 0) {
    return {
      ok: true,
      oldestExpiredId: null,
      staleByDays: null,
      message: null,
    };
  }

  const doc = response.docs[0];
  const expireAtMs = new Date(doc.expire_at).getTime();
  const staleByMs = nowMs - graceMs - expireAtMs;
  const staleByDays = Math.floor(staleByMs / (24 * 60 * 60 * 1000));
  const graceDays = Math.floor(graceMs / (24 * 60 * 60 * 1000));
  const oldestExpiredId = redactDocId(doc._id);

  return {
    ok: false,
    oldestExpiredId,
    staleByDays,
    message: "audit-log TTL eviction drift: oldest expired-but-live doc _id=" + oldestExpiredId + " is stale by " + staleByDays + " days beyond GRACE_MS=" + graceDays + "d",
  };
}

module.exports = { probeTtlEviction, redactDocId, DEFAULT_GRACE_MS, DEFAULT_TIMEOUT_MS };
