#!/usr/bin/env node
/*
 * scripts/redact-managed-logs.js
 *
 * SEC-PII-02 — Operator CLI for redacting historic PII from CouchDB
 * `managed_logs` documents (raw 64-char hex reset_keys + raw email
 * addresses leaked into `message` and `flags` fields by pre-Phase-2
 * audit-log call sites).
 *
 * Modes:
 *   --scan                 Dry-run (DEFAULT). Streams docs, counts would-be
 *                          edits, prints a summary. NEVER writes to CouchDB.
 *   --apply --snapshot-to <path>
 *                          DESTRUCTIVE. Writes a JSONL snapshot of every
 *                          doc it touches to <path> BEFORE issuing any
 *                          _bulk_docs POST. Refuses to run without
 *                          --snapshot-to.
 *   --sample <N>           Verification subcommand. Picks N random recent
 *                          + N random old docs and asserts zero raw PII
 *                          shapes remain. Exits 0 on clean, 65 on leak.
 *
 * Common flags:
 *   --max-docs <N>         Cap docs touched/scanned per invocation
 *                          (default unbounded).
 *   --batch-size <N>       Docs per _bulk_docs request (default 500).
 *   --db-name <name>       Override DB name (default
 *                          `${THINX_PREFIX}managed_logs`).
 *   --help, -h             Print usage and exit 0.
 *
 * Credential resolution (env-only, ZERO repo-hardcoded creds):
 *   COUCHDB_URL            Full URL (may embed creds) or host-only URL.
 *   COUCHDB_USER           Admin user (if URL is host-only).
 *   COUCHDB_PASSWORD       Admin password (if URL is host-only).
 *   THINX_PREFIX           DB-name prefix (e.g., "" or "test_").
 *
 * Reuses the SEC-PII-01 redactor helpers (Util.redactToken /
 * Util.redactEmail) from lib/thinx/util.js for SAFE LOGGING of match
 * previews. The persisted overlay uses deterministic literal markers
 * ([REDACTED-RESET_KEY] / [REDACTED-EMAIL]) so a second --apply run is
 * a no-op (idempotency).
 *
 * Per SEC-PII-02 ROADMAP success criterion: `--sample 1000` on a
 * fully-redacted DB MUST exit 0; any raw match exits 65.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const Util = require("../lib/thinx/util.js");
const SlackNotify = require("slack-notify");

// ---------------------------------------------------------------------------
// Leak-shape regexes (module-level constants — single-source-of-truth for the
// leak shapes the script detects/overlays, and reusable from the unit spec).
// ---------------------------------------------------------------------------

// Raw 64-char lowercase hex (reset_key shape per owner.js / SEC-PII-01).
const RESET_KEY_REGEX = /[0-9a-f]{64}/g;

// RFC-5322-ish email shape (matches the SEC-PII-01 leak surface in owner.js).
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Literal overlay markers — deliberately contain `[`, `]`, and uppercase
// letters so they CANNOT match either of the regexes above (idempotency).
const RESET_KEY_MARKER = "[REDACTED-RESET_KEY]";
const EMAIL_MARKER = "[REDACTED-EMAIL]";

// CLI exit codes (documented so operators / tests can assert against them).
const EXIT_OK = 0;
const EXIT_USAGE = 64;
const EXIT_LEAK_DETECTED = 65;
const EXIT_NO_CREDS = 66;
const EXIT_BAD_SNAPSHOT_PATH = 67;
const EXIT_RUNTIME_ERROR = 70;

// ---------------------------------------------------------------------------
// Pure helpers (exported for the fixture-based unit spec — NO CouchDB).
// ---------------------------------------------------------------------------

/**
 * Returns true if any string field on `doc` contains a raw reset_key or
 * raw email pattern. Walks the top-level fields the audit.js schema
 * defines (`message`, `flags[]`) plus any other string-typed field.
 *
 * @param {object} doc — CouchDB doc (must be a plain object).
 * @returns {boolean}
 */
function containsRawPII(doc) {
  if (doc === null || typeof doc !== "object") return false;
  for (const key of Object.keys(doc)) {
    if (key === "_id" || key === "_rev") continue;
    const val = doc[key];
    if (typeof val === "string") {
      if (_matchAny(val)) return true;
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string" && _matchAny(item)) return true;
      }
    }
  }
  return false;
}

function _matchAny(s) {
  // Reset the lastIndex on each call (regex has `g` flag, so test() is stateful).
  RESET_KEY_REGEX.lastIndex = 0;
  EMAIL_REGEX.lastIndex = 0;
  return RESET_KEY_REGEX.test(s) || EMAIL_REGEX.test(s);
}

/**
 * Scans `doc` for leak shapes. Returns counts per shape + the field names
 * where the matches landed (used by --sample for forensic reporting; raw
 * matched substrings are NEVER returned to prevent log-leak amplification).
 *
 * @param {object} doc
 * @returns {{ resetKeyHits: number, emailHits: number, fields: string[] }}
 */
function scanDoc(doc) {
  const out = { resetKeyHits: 0, emailHits: 0, fields: [] };
  if (doc === null || typeof doc !== "object") return out;
  for (const key of Object.keys(doc)) {
    if (key === "_id" || key === "_rev") continue;
    const val = doc[key];
    const strings = [];
    if (typeof val === "string") strings.push(val);
    else if (Array.isArray(val)) {
      for (const item of val) if (typeof item === "string") strings.push(item);
    }
    let hitInField = false;
    for (const s of strings) {
      RESET_KEY_REGEX.lastIndex = 0;
      EMAIL_REGEX.lastIndex = 0;
      const rk = s.match(RESET_KEY_REGEX);
      const em = s.match(EMAIL_REGEX);
      if (rk) { out.resetKeyHits += rk.length; hitInField = true; }
      if (em) { out.emailHits += em.length; hitInField = true; }
    }
    if (hitInField) out.fields.push(key);
  }
  return out;
}

/**
 * Returns a new doc with raw reset_key / email substrings replaced by the
 * literal `[REDACTED-*]` markers. Preserves `_id` and `_rev` so the result
 * is directly usable in a `_bulk_docs` update. Adds forensic-audit fields
 * `redacted_by` / `redacted_at` on first redaction.
 *
 * Idempotent: a doc with no raw matches returns `{ changed: false, doc }`
 * with the original doc untouched (no `_rev` bump, no `_bulk_docs` write).
 *
 * @param {object} doc
 * @returns {{ changed: boolean, doc: object }}
 */
function redactDoc(doc) {
  if (doc === null || typeof doc !== "object") {
    return { changed: false, doc };
  }
  if (!containsRawPII(doc)) {
    return { changed: false, doc };
  }
  const next = {};
  for (const key of Object.keys(doc)) {
    const val = doc[key];
    if (typeof val === "string") {
      next[key] = _redactString(val);
    } else if (Array.isArray(val)) {
      next[key] = val.map((item) =>
        typeof item === "string" ? _redactString(item) : item
      );
    } else {
      next[key] = val;
    }
  }
  next.redacted_by = "SEC-PII-02";
  next.redacted_at = new Date().toISOString();
  return { changed: true, doc: next };
}

function _redactString(s) {
  // Reset regex lastIndex (g-flag statefulness).
  RESET_KEY_REGEX.lastIndex = 0;
  EMAIL_REGEX.lastIndex = 0;
  // Order matters: redact reset_keys FIRST (they are longer and more specific),
  // then emails. The marker strings cannot match either regex, so chaining is safe.
  return s.replace(RESET_KEY_REGEX, RESET_KEY_MARKER).replace(EMAIL_REGEX, EMAIL_MARKER);
}

// ---------------------------------------------------------------------------
// OBS-01 — Slack closure-receipt helper.
//
// SYNCHRONOUS by design (fire-and-forget per D-24). Never `await`s,
// never re-throws. Handles BOTH sync-throw AND async-reject paths from
// `slack-notify` (v2.0.7 `.send()` returns a Promise — see
// node_modules/slack-notify/src/cjs/index.js).
//
// Triggers per D-17:
//   kind === "success"   — `--apply` success path
//   kind === "failure"   — `--apply` failure path (outer catch, single site)
//   kind === "discovery" — `--sample` raw-PII discovery
//
// Missing-webhook handling per D-23: log info and return; never crash.
// ---------------------------------------------------------------------------
function postSlackSummary(kind, payload) {
  const webhook = process.env.SLACK_WEBHOOK;
  if (!webhook) {
    console.log("ℹ️ [info] SLACK_WEBHOOK not set — skipping closure notification");
    return;
  }
  const hostShort = os.hostname().split('.')[0];
  let msg;
  if (kind === "success") {
    msg = {
      text: "✅ managed_logs redaction complete — " + payload.docs_scanned + " scanned / " + payload.docs_redacted + " redacted / sample " + payload.sample_verdict + " in " + payload.runtime_ms + "ms on " + hostShort,
      username: "redact-managed-logs",
      icon_emoji: ":broom:",
      channel: "#thinx"
    };
  } else if (kind === "failure") {
    msg = {
      text: "❌ managed_logs redaction FAILED — " + payload.stage_reached + " on " + hostShort + ": " + String(payload.error_message || "").slice(0, 200),
      username: "redact-managed-logs",
      icon_emoji: ":broom:",
      channel: "#thinx",
      fields: {
        docs_scanned: payload.docs_scanned,
        docs_redacted: payload.docs_redacted,
        stage_reached: payload.stage_reached,
        snapshot_path: payload.snapshot_path || "<none>",
        sample_ids: (payload.sample_ids || []).slice(0, 5).map((id) => (typeof id === 'string' && id.length > 0 ? id.slice(0, 8) + "..." : "<missing>"))
      }
    };
  } else if (kind === "discovery") {
    msg = {
      text: "⚠️ managed_logs sample discovered raw PII — " + payload.leaks + " of " + payload.checked + " sampled docs contain raw " + payload.pii_kind + " on " + hostShort + " — operator review required (do NOT --apply blindly)",
      username: "redact-managed-logs",
      icon_emoji: ":broom:",
      channel: "#thinx"
    };
  } else {
    return;
  }
  try {
    const sendResult = SlackNotify(webhook).send(msg);
    if (sendResult && typeof sendResult["catch"] === 'function') {
      sendResult.catch((_e) => console.log("[redact] Slack send failed (async): " + (_e && _e.message ? _e.message : _e)));
    }
  } catch (_e) {
    console.log("[redact] Slack send failed (sync): " + (_e && _e.message ? _e.message : _e));
  }
  return;
}

// ---------------------------------------------------------------------------
// Module exports — pure helpers ONLY. The CLI runs in the
// `if (require.main === module)` block below.
// ---------------------------------------------------------------------------
module.exports = {
  redactDoc,
  scanDoc,
  containsRawPII,
  RESET_KEY_REGEX,
  EMAIL_REGEX,
  RESET_KEY_MARKER,
  EMAIL_MARKER,
  // Exit codes for tests:
  EXIT_OK,
  EXIT_USAGE,
  EXIT_LEAK_DETECTED,
  EXIT_NO_CREDS,
  EXIT_BAD_SNAPSHOT_PATH,
  EXIT_RUNTIME_ERROR,
  postSlackSummary,
};

// ---------------------------------------------------------------------------
// CLI surface (only runs when invoked as a script, NEVER on `require()`).
// ---------------------------------------------------------------------------

function printUsage() {
  const usage = [
    "Usage: node scripts/redact-managed-logs.js [mode] [options]",
    "",
    "Modes (mutually exclusive — pick one; default is --scan):",
    "  --scan                       Dry-run. Counts would-be edits; NEVER writes.",
    "  --apply --snapshot-to <p>    DESTRUCTIVE. Snapshot first, then _bulk_docs.",
    "  --sample <N>                 Verify: N recent + N old; exit 0 if clean.",
    "",
    "Options:",
    "  --snapshot-to <path>         REQUIRED for --apply. JSONL snapshot of",
    "                               every doc touched, written BEFORE any",
    "                               _bulk_docs POST. Parent dir must exist.",
    "  --max-docs <N>               Cap docs touched/scanned (default: unbounded).",
    "  --batch-size <N>             Docs per _bulk_docs (default: 500).",
    "  --db-name <name>             DB name (default: ${THINX_PREFIX}managed_logs).",
    "  --help, -h                   Print this help and exit 0.",
    "",
    "Environment (NO credentials in repo — env-only):",
    "  COUCHDB_URL                  Full URL (may embed creds) or host-only.",
    "  COUCHDB_USER                 Admin user (if URL is host-only).",
    "  COUCHDB_PASSWORD             Admin password (if URL is host-only).",
    "  THINX_PREFIX                 DB name prefix (default: \"\").",
    "",
    "Examples:",
    "  # 1) Dry-run survey (safe, no writes):",
    "  node scripts/redact-managed-logs.js --scan",
    "",
    "  # 2) Destructive run WITH mandatory snapshot:",
    "  node scripts/redact-managed-logs.js --apply \\",
    "    --snapshot-to /mnt/gluster/thinx/snapshots/managed_logs.$(date +%s).jsonl \\",
    "    --batch-size 500 --max-docs 50000",
    "",
    "  # 3) SEC-PII-02 sampling verification (zero leak gate):",
    "  node scripts/redact-managed-logs.js --sample 1000",
    "",
    "WARNING:",
    "  --apply OVERWRITES the original `message` field in CouchDB. The ONLY",
    "  forensic-rollback artifact is the JSONL snapshot at --snapshot-to.",
    "  The script REFUSES to run --apply without a snapshot path. Store the",
    "  snapshot on a restricted-perm path (chmod 600) — it contains PII.",
    "",
  ].join("\n");
  process.stdout.write(usage + "\n");
}

function parseArgs(argv) {
  const args = {
    scan: false,
    apply: false,
    sample: null,        // number or null
    snapshotTo: null,    // string or null
    maxDocs: null,       // number or null (null = unbounded)
    batchSize: 500,
    dbName: null,        // resolved later from THINX_PREFIX if null
    help: false,
    _errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--scan":
        args.scan = true;
        break;
      case "--apply":
        args.apply = true;
        break;
      case "--sample": {
        const v = argv[++i];
        const n = Number.parseInt(v, 10);
        if (!Number.isFinite(n) || n <= 0) {
          args._errors.push(`--sample requires a positive integer (got: ${v})`);
        } else {
          args.sample = n;
        }
        break;
      }
      case "--snapshot-to":
        args.snapshotTo = argv[++i] || null;
        break;
      case "--max-docs": {
        const v = argv[++i];
        const n = Number.parseInt(v, 10);
        if (!Number.isFinite(n) || n <= 0) {
          args._errors.push(`--max-docs requires a positive integer (got: ${v})`);
        } else {
          args.maxDocs = n;
        }
        break;
      }
      case "--batch-size": {
        const v = argv[++i];
        const n = Number.parseInt(v, 10);
        if (!Number.isFinite(n) || n <= 0) {
          args._errors.push(`--batch-size requires a positive integer (got: ${v})`);
        } else {
          args.batchSize = n;
        }
        break;
      }
      case "--db-name":
        args.dbName = argv[++i] || null;
        break;
      default:
        args._errors.push(`unknown argument: ${a}`);
        break;
    }
  }
  // Default mode: --scan if neither --apply nor --sample.
  if (!args.apply && args.sample === null && !args.help) {
    args.scan = true;
  }
  return args;
}

function tsPrefix(mode) {
  return `[${new Date().toISOString()}] [${mode}]`;
}

function resolveCouchUrl() {
  const url = process.env.COUCHDB_URL;
  const user = process.env.COUCHDB_USER;
  const pass = process.env.COUCHDB_PASSWORD;
  if (!url) {
    return { ok: false, error: "COUCHDB_URL is unset" };
  }
  // If URL already embeds creds, use as-is.
  if (/^https?:\/\/[^/]+:[^/]+@/.test(url)) {
    return { ok: true, url };
  }
  if (!user || !pass) {
    return { ok: false, error: "COUCHDB_USER / COUCHDB_PASSWORD must be set when COUCHDB_URL is host-only" };
  }
  // Inject creds between scheme and host.
  const m = /^(https?:\/\/)(.+)$/.exec(url);
  if (!m) {
    return { ok: false, error: `COUCHDB_URL is not a valid http(s) URL: ${url}` };
  }
  return { ok: true, url: `${m[1]}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${m[2]}` };
}

function resolveDbName(argDbName) {
  if (argDbName) return argDbName;
  const prefix = process.env.THINX_PREFIX || "";
  return `${prefix}managed_logs`;
}

async function runScan(db, opts) {
  const mode = "scan";
  console.log(`${tsPrefix(mode)} starting dry-run against db=${opts.dbName} (NO WRITES)`);
  let scanned = 0;
  let dirty = 0;
  let resetKeyTotal = 0;
  let emailTotal = 0;
  let lastId = null;
  const previewSamples = [];
  while (true) {
    const params = { include_docs: true, limit: 1000 };
    if (lastId) {
      params.startkey = lastId;
      params.skip = 1;
    }
    const page = await db.list(params);
    if (!page.rows || page.rows.length === 0) break;
    for (const row of page.rows) {
      const doc = row.doc;
      if (!doc) continue;
      scanned += 1;
      const scan = scanDoc(doc);
      if (scan.resetKeyHits > 0 || scan.emailHits > 0) {
        dirty += 1;
        resetKeyTotal += scan.resetKeyHits;
        emailTotal += scan.emailHits;
        if (previewSamples.length < 5) {
          previewSamples.push({
            _id: doc._id,
            fields: scan.fields,
            resetKeyHits: scan.resetKeyHits,
            emailHits: scan.emailHits,
          });
        }
      }
      if (opts.maxDocs !== null && scanned >= opts.maxDocs) break;
    }
    lastId = page.rows[page.rows.length - 1].id;
    if (opts.maxDocs !== null && scanned >= opts.maxDocs) break;
    if (page.rows.length < 1000) break;
  }
  console.log(`${tsPrefix(mode)} scanned=${scanned} dirty=${dirty} resetKeyHits=${resetKeyTotal} emailHits=${emailTotal}`);
  if (previewSamples.length > 0) {
    console.log(`${tsPrefix(mode)} sample of leak-bearing docs (max 5; raw matches NOT logged):`);
    for (const p of previewSamples) {
      console.log(`${tsPrefix(mode)}   _id=${p._id} fields=[${p.fields.join(",")}] resetKeyHits=${p.resetKeyHits} emailHits=${p.emailHits}`);
    }
  }
  return EXIT_OK;
}

async function runApply(db, opts) {
  const mode = "apply";
  console.log(`${tsPrefix(mode)} DESTRUCTIVE MODE. snapshot=${opts.snapshotTo} db=${opts.dbName} batch=${opts.batchSize} maxDocs=${opts.maxDocs === null ? "unbounded" : opts.maxDocs}`);
  const snapshotStream = fs.createWriteStream(opts.snapshotTo, { flags: "a" });
  let touched = 0;
  let conflicts = 0;
  let lastId = null;
  const buffer = [];

  async function flushBatch() {
    if (buffer.length === 0) return;
    // 1) Write each pre-redaction doc to snapshot JSONL FIRST (forensic).
    for (const entry of buffer) {
      const line = JSON.stringify(entry.original) + "\n";
      const ok = snapshotStream.write(line);
      if (!ok) {
        await new Promise((resolve) => snapshotStream.once("drain", resolve));
      }
    }
    // 2) Issue _bulk_docs POST with the redacted overlays.
    const updates = buffer.map((e) => e.redacted);
    try {
      const resp = await db.bulk({ docs: updates });
      for (const r of resp) {
        if (r.error) {
          conflicts += 1;
          console.log(`${tsPrefix(mode)} conflict _id=${r.id} reason=${r.error}`);
        }
      }
    } catch (err) {
      console.log(`${tsPrefix(mode)} _bulk_docs ERROR: ${err && err.message ? err.message : err}`);
      if (err && typeof err === 'object') { err.stage = "bulk_docs"; }
      throw err;
    }
    buffer.length = 0;
  }

  while (true) {
    const params = { include_docs: true, limit: 1000 };
    if (lastId) {
      params.startkey = lastId;
      params.skip = 1;
    }
    const page = await db.list(params);
    if (!page.rows || page.rows.length === 0) break;
    for (const row of page.rows) {
      const doc = row.doc;
      if (!doc) continue;
      const result = redactDoc(doc);
      if (!result.changed) continue;
      buffer.push({ original: doc, redacted: result.doc });
      touched += 1;
      if (buffer.length >= opts.batchSize) {
        await flushBatch();
      }
      if (opts.maxDocs !== null && touched >= opts.maxDocs) break;
    }
    lastId = page.rows[page.rows.length - 1].id;
    if (opts.maxDocs !== null && touched >= opts.maxDocs) break;
    if (page.rows.length < 1000) break;
  }
  await flushBatch();
  await new Promise((resolve) => snapshotStream.end(resolve));
  console.log(`${tsPrefix(mode)} done touched=${touched} conflicts=${conflicts}`);
  postSlackSummary("success", { docs_scanned: touched + conflicts, docs_redacted: touched, sample_verdict: "deferred", runtime_ms: Date.now() - opts.start_ms });
  return EXIT_OK;
}

async function runSample(db, opts) {
  const mode = "sample";
  const N = opts.sample;
  console.log(`${tsPrefix(mode)} verifying N=${N} recent + N=${N} old random docs against zero-leak invariant`);
  // Recent half (descending) — first 2N pulled, then we shuffle and take N.
  const recent = await db.list({ include_docs: true, limit: 2 * N, descending: true });
  // Old half (ascending) — first 2N pulled.
  const old = await db.list({ include_docs: true, limit: 2 * N });
  const pool = [];
  for (const r of recent.rows || []) if (r.doc) pool.push({ half: "recent", doc: r.doc });
  for (const r of old.rows || []) if (r.doc) pool.push({ half: "old", doc: r.doc });
  // Take N from each half (or all if fewer exist).
  const picks = [];
  const recentDocs = pool.filter((p) => p.half === "recent");
  const oldDocs = pool.filter((p) => p.half === "old");
  _shuffleInPlace(recentDocs);
  _shuffleInPlace(oldDocs);
  for (const p of recentDocs.slice(0, N)) picks.push(p);
  for (const p of oldDocs.slice(0, N)) picks.push(p);

  let leaks = 0;
  const leakIds = [];
  for (const p of picks) {
    const scan = scanDoc(p.doc);
    if (scan.resetKeyHits > 0 || scan.emailHits > 0) {
      leaks += 1;
      leakIds.push(p.doc._id); // _id only — raw match content is NEVER logged.
    }
  }
  console.log(`${tsPrefix(mode)} checked=${picks.length} leaks=${leaks}`);
  if (leaks > 0) {
    console.log(`${tsPrefix(mode)} LEAK-BEARING doc _ids (raw matches NOT logged):`);
    for (const id of leakIds) console.log(`${tsPrefix(mode)}   _id=${id}`);
    const piiKind = "reset_key|email";
    postSlackSummary("discovery", { checked: picks.length, leaks: leaks, pii_kind: piiKind });
    return EXIT_LEAK_DETECTED;
  }
  console.log(`${tsPrefix(mode)} PASS: zero raw 64-char hex reset_keys and zero raw emails across ${picks.length} sampled docs.`);
  return EXIT_OK;
}

function _shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return EXIT_OK;
  }
  if (args._errors.length > 0) {
    for (const e of args._errors) console.error(`error: ${e}`);
    printUsage();
    return EXIT_USAGE;
  }

  // Snapshot-required invariant (CHECK BEFORE creds so the spec's CLI-gate
  // test can run in an environment without COUCHDB_* env vars).
  if (args.apply) {
    if (!args.snapshotTo || args.snapshotTo.length === 0) {
      console.error("error: --apply REFUSES to run without --snapshot-to <path>. The snapshot is the only forensic-rollback artifact (per CONTEXT.md invariant).");
      console.error("hint:  rerun with: --apply --snapshot-to /path/to/managed_logs.snapshot.jsonl");
      return EXIT_BAD_SNAPSHOT_PATH;
    }
    const parent = path.dirname(path.resolve(args.snapshotTo));
    if (!fs.existsSync(parent)) {
      console.error(`error: snapshot parent directory does not exist: ${parent}`);
      return EXIT_BAD_SNAPSHOT_PATH;
    }
  }

  // Resolve creds + DB name (env-only — ZERO repo-hardcoded creds).
  const creds = resolveCouchUrl();
  if (!creds.ok) {
    console.error(`error: ${creds.error}`);
    console.error("hint:  export COUCHDB_URL=http://host:5984 COUCHDB_USER=... COUCHDB_PASSWORD=...");
    return EXIT_NO_CREDS;
  }
  const dbName = resolveDbName(args.dbName);
  const safeUser = Util.redactToken(process.env.COUCHDB_USER || "<from-url>", 3);
  console.log(`${tsPrefix("init")} couchdb url=${creds.url.replace(/:[^@]+@/, ":<redacted>@")} db=${dbName} user=${safeUser}`);

  // Lazy-require nano so --help / --apply-without-snapshot don't even need
  // the dep tree resolved (matters for the CI snapshot-gate spec).
  const nano = require("nano")(creds.url);
  const db = nano.use(dbName);

  if (args.sample !== null) {
    return await runSample(db, { ...args, dbName });
  }
  if (args.apply) {
    return await runApply(db, { ...args, dbName, start_ms: Date.now() });
  }
  // Default fallthrough — scan.
  return await runScan(db, { ...args, dbName });
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("fatal:", err && err.stack ? err.stack : err);
      try { postSlackSummary("failure", { docs_scanned: 0, docs_redacted: 0, stage_reached: (err && err.stage) ? err.stage : "unknown", snapshot_path: "<unknown>", sample_ids: [], error_message: err && err.message ? err.message : String(err) }); } catch (_e) { /* swallow — never block the exit */ }
      process.exit(EXIT_RUNTIME_ERROR);
    });
}
