#!/usr/bin/env node
/*
 * scripts/backfill-device-timezone.js
 *
 * Repairs device documents damaged by the timezone_offset NaN bug and
 * backfills timezone_utc where it can be determined without guessing.
 *
 * Background: device registration stored `timezone_abbr` (an abbreviation such
 * as "CEST") and fed it to moment-timezone's .tz(), which expects an IANA zone
 * name. Unknown names silently fall back to the SERVER's local zone, and the
 * offset was additionally read from moment's private `_tzm` — always undefined,
 * so the computation produced NaN, persisted as null. See
 * docs/superpowers/specs/2026-09-18-device-timezone-utc-design.md
 *
 * Modes:
 *   --scan                  Dry-run (DEFAULT). Streams docs, counts would-be
 *                           edits, prints a summary. NEVER writes to CouchDB.
 *   --apply --snapshot-to <path>
 *                           DESTRUCTIVE. Writes a JSONL snapshot of every doc
 *                           it touches to <path> BEFORE issuing any _bulk_docs
 *                           POST. Refuses to run without --snapshot-to.
 *
 * Common flags:
 *   --batch-size <N>        Docs per _bulk_docs request (default 500).
 *   --max-docs <N>          Cap docs touched/scanned per invocation
 *                           (default unbounded).
 *   --db-name <name>        Override DB name (default `${THINX_PREFIX}devices`).
 *   --help, -h              Print usage and exit 0.
 *
 * Credential resolution (env-only, ZERO repo-hardcoded creds):
 *   COUCHDB_URL             Full URL (may embed creds) or host-only URL.
 *   COUCHDB_USER            Admin user (if URL is host-only).
 *   COUCHDB_PASSWORD        Admin password (if URL is host-only).
 *   THINX_PREFIX            DB-name prefix (e.g., "" or "test_").
 *
 * Idempotent: a second --apply run is a no-op, because a document carrying a
 * valid timezone_utc and a non-corrupt offset classifies as "skip".
 */

const fs = require("fs");
const path = require("path");
const Util = require("../lib/thinx/util.js");

const EXIT_OK = 0;
const EXIT_USAGE = 64;
const EXIT_NO_CREDS = 66;
const EXIT_BAD_SNAPSHOT_PATH = 67;
const EXIT_RUNTIME_ERROR = 70;

// Abbreviations that resolve to exactly one IANA zone. Deliberately tiny: of
// the 69 abbreviations in the console's timezone table only 4 are valid zone
// names, and 18 map to more than one UTC offset. Anything not listed here is
// reported for a human to re-pick rather than guessed, because assigning a
// representative zone would be offset-plausible but silently mislabel the
// device's actual location.
const UNAMBIGUOUS_ABBR = Object.freeze({
  "UTC": "UTC"
});

function isCorruptOffset(value) {
  return value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isNaN(value));
}

/*
 * Decide what a single device document needs. Pure: no I/O, no CouchDB, no
 * config — which is what makes this testable under the project's Jasmine
 * harness without infrastructure.
 *
 * Returns { action, reason, patch } where action is one of:
 *   "repair"   — offset is corrupt; patch restores it (and the zone if known)
 *   "backfill" — offset is fine but timezone_utc is derivable; patch adds it
 *   "report"   — zone cannot be determined without guessing; patch is null
 *   "skip"     — already migrated and healthy; patch is null
 */
function classifyDoc(doc) {
  const zone = Util.isValidTimezone(doc.timezone_utc) ? doc.timezone_utc : null;
  const mapped = zone === null ? (UNAMBIGUOUS_ABBR[doc.timezone_abbr] || null) : null;

  if (isCorruptOffset(doc.timezone_offset)) {
    const source = zone || mapped;
    const offset = source === null ? 0 : Util.timezoneOffsetFor(source);
    const patch = { timezone_offset: offset };
    if (zone === null && mapped !== null) patch.timezone_utc = mapped;
    return {
      action: "repair",
      reason: source === null
        ? "corrupt offset, no resolvable zone; reset to 0"
        : `corrupt offset; recomputed from ${source}`,
      patch: patch
    };
  }

  if (zone !== null) {
    return { action: "skip", reason: "already migrated", patch: null };
  }

  if (mapped !== null) {
    return {
      action: "backfill",
      reason: `abbreviation ${doc.timezone_abbr} resolves unambiguously`,
      patch: { timezone_utc: mapped, timezone_offset: Util.timezoneOffsetFor(mapped) }
    };
  }

  return {
    action: "report",
    reason: `abbreviation ${JSON.stringify(doc.timezone_abbr)} is ambiguous or unrecognised; owner must re-pick`,
    patch: null
  };
}

module.exports = {
  classifyDoc,
  isCorruptOffset,
  UNAMBIGUOUS_ABBR,
  EXIT_OK,
  EXIT_USAGE,
  EXIT_NO_CREDS,
  EXIT_BAD_SNAPSHOT_PATH,
  EXIT_RUNTIME_ERROR
};

// ---------------------------------------------------------------------------
// CLI surface (only runs when invoked as a script, NEVER on `require()`).
// ---------------------------------------------------------------------------

function usage() {
  return [
    "Usage: node scripts/backfill-device-timezone.js [--scan | --apply --snapshot-to <path>] [options]",
    "",
    "Modes:",
    "  --scan                       Dry-run (DEFAULT). Never writes.",
    "  --apply --snapshot-to <p>    DESTRUCTIVE. Snapshot first, then _bulk_docs.",
    "",
    "Options:",
    "  --snapshot-to <path>         JSONL snapshot written BEFORE any write.",
    "                               Required with --apply. Parent dir must exist.",
    "  --batch-size <N>             Docs per _bulk_docs (default: 500).",
    "  --max-docs <N>               Cap docs scanned/touched (default: unbounded).",
    "  --db-name <name>             Override DB (default: ${THINX_PREFIX}devices).",
    "  --help, -h                   Print this help and exit 0.",
    "",
    "Environment:",
    "  COUCHDB_URL                  Full URL (may embed creds) or host-only.",
    "  COUCHDB_USER                 Required when COUCHDB_URL is host-only.",
    "  COUCHDB_PASSWORD             Required when COUCHDB_URL is host-only.",
    "  THINX_PREFIX                 DB-name prefix.",
    ""
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    mode: "scan",
    snapshotTo: null,
    batchSize: 500,
    maxDocs: null,
    dbName: null,
    help: false,
    _errors: []
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--scan": args.mode = "scan"; break;
      case "--apply": args.mode = "apply"; break;
      case "--help":
      case "-h": args.help = true; break;
      case "--snapshot-to": args.snapshotTo = argv[++i] || null; break;
      case "--db-name": args.dbName = argv[++i] || null; break;
      case "--batch-size": {
        const v = argv[++i];
        const n = parseInt(v, 10);
        if (!Number.isInteger(n) || n <= 0) args._errors.push(`--batch-size requires a positive integer (got: ${v})`);
        else args.batchSize = n;
        break;
      }
      case "--max-docs": {
        const v = argv[++i];
        const n = parseInt(v, 10);
        if (!Number.isInteger(n) || n <= 0) args._errors.push(`--max-docs requires a positive integer (got: ${v})`);
        else args.maxDocs = n;
        break;
      }
      default: args._errors.push(`unknown argument: ${a}`);
    }
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
  if (!url) return { ok: false, error: "COUCHDB_URL is unset" };
  if (/^https?:\/\/[^/]+:[^/]+@/.test(url)) return { ok: true, url };
  if (!user || !pass) {
    return { ok: false, error: "COUCHDB_USER / COUCHDB_PASSWORD must be set when COUCHDB_URL is host-only" };
  }
  const m = /^(https?:\/\/)(.+)$/.exec(url);
  if (!m) return { ok: false, error: `COUCHDB_URL is not a valid http(s) URL: ${url}` };
  return { ok: true, url: `${m[1]}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${m[2]}` };
}

function resolveDbName(argDbName) {
  if (argDbName) return argDbName;
  const prefix = process.env.THINX_PREFIX || "";
  return `${prefix}devices`;
}

function summarise(mode, counts, reports) {
  console.log(`${tsPrefix(mode)} scanned=${counts.scanned} repair=${counts.repair} backfill=${counts.backfill} report=${counts.report} skip=${counts.skip}`);
  if (reports.length === 0) return;
  const byOwner = {};
  for (const r of reports) {
    const owner = r.owner || "(no owner)";
    (byOwner[owner] = byOwner[owner] || []).push(r);
  }
  console.log(`${tsPrefix(mode)} devices needing a manual timezone re-pick, by owner:`);
  for (const owner of Object.keys(byOwner).sort()) {
    const list = byOwner[owner];
    console.log(`${tsPrefix(mode)}   owner=${owner} count=${list.length}`);
    for (const r of list.slice(0, 10)) {
      console.log(`${tsPrefix(mode)}     udid=${r.udid} timezone_abbr=${JSON.stringify(r.abbr)}`);
    }
    if (list.length > 10) {
      console.log(`${tsPrefix(mode)}     ... and ${list.length - 10} more`);
    }
  }
}

async function* streamDocs(db, maxDocs) {
  let lastId = null;
  let yielded = 0;
  for (;;) {
    const params = { include_docs: true, limit: 1000 };
    if (lastId !== null) params.startkey = lastId;
    const page = await db.list(params);
    const rows = lastId === null ? page.rows : page.rows.slice(1);
    if (rows.length === 0) return;
    for (const row of rows) {
      if (!row.doc) continue;
      if (row.id && row.id.startsWith("_design/")) continue;
      yield row.doc;
      yielded += 1;
      if (maxDocs !== null && yielded >= maxDocs) return;
    }
    lastId = page.rows[page.rows.length - 1].id;
  }
}

async function run(db, opts) {
  const mode = opts.mode;
  const counts = { scanned: 0, repair: 0, backfill: 0, report: 0, skip: 0 };
  const reports = [];
  const buffer = [];
  const snapshotStream = mode === "apply"
    ? fs.createWriteStream(opts.snapshotTo, { flags: "a" })
    : null;
  let conflicts = 0;

  async function flushBatch() {
    if (buffer.length === 0) return;
    // 1) Snapshot each pre-change doc FIRST (forensic), then write.
    for (const entry of buffer) {
      const line = JSON.stringify(entry.original) + "\n";
      if (!snapshotStream.write(line)) {
        await new Promise((resolve) => snapshotStream.once("drain", resolve));
      }
    }
    // 2) Issue the _bulk_docs POST.
    try {
      const resp = await db.bulk({ docs: buffer.map((e) => e.updated) });
      for (const r of resp) {
        if (r.error) {
          conflicts += 1;
          console.log(`${tsPrefix(mode)} conflict _id=${r.id} reason=${r.error}`);
        }
      }
    } catch (err) {
      console.log(`${tsPrefix(mode)} _bulk_docs ERROR: ${err && err.message ? err.message : err}`);
      throw err;
    }
    buffer.length = 0;
  }

  for await (const doc of streamDocs(db, opts.maxDocs)) {
    counts.scanned += 1;
    const result = classifyDoc(doc);
    counts[result.action] += 1;

    if (result.action === "report") {
      reports.push({ udid: doc.udid || doc._id, owner: doc.owner, abbr: doc.timezone_abbr });
      continue;
    }
    if (result.patch === null) continue;

    if (mode === "apply") {
      buffer.push({ original: Object.assign({}, doc), updated: Object.assign({}, doc, result.patch) });
      if (buffer.length >= opts.batchSize) await flushBatch();
    }
  }

  if (mode === "apply") {
    await flushBatch();
    await new Promise((resolve) => snapshotStream.end(resolve));
    console.log(`${tsPrefix(mode)} snapshot written to ${opts.snapshotTo} conflicts=${conflicts}`);
  }

  summarise(mode, counts, reports);
  return EXIT_OK;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return EXIT_OK;
  }
  if (args._errors.length > 0) {
    for (const e of args._errors) console.error(`error: ${e}`);
    process.stderr.write(usage());
    return EXIT_USAGE;
  }
  // Safety gate: destructive mode is unavailable without a forensic snapshot.
  if (args.mode === "apply" && !args.snapshotTo) {
    console.error("error: --apply refuses to run without --snapshot-to <path>");
    process.stderr.write(usage());
    return EXIT_USAGE;
  }
  if (args.mode === "apply") {
    const dir = path.dirname(path.resolve(args.snapshotTo));
    if (!fs.existsSync(dir)) {
      console.error(`error: snapshot parent directory does not exist: ${dir}`);
      return EXIT_BAD_SNAPSHOT_PATH;
    }
  }

  const creds = resolveCouchUrl();
  if (!creds.ok) {
    console.error(`error: ${creds.error}`);
    console.error("hint:  export COUCHDB_URL=http://host:5984 COUCHDB_USER=... COUCHDB_PASSWORD=...");
    return EXIT_NO_CREDS;
  }

  const dbName = resolveDbName(args.dbName);
  // Lazy-require nano so --help and the --apply safety gate need no driver.
  const nano = require("nano")(creds.url);
  const db = nano.use(dbName);

  console.log(`${tsPrefix(args.mode)} db=${dbName} batch=${args.batchSize} maxDocs=${args.maxDocs === null ? "unbounded" : args.maxDocs}`);
  return run(db, { mode: args.mode, snapshotTo: args.snapshotTo, batchSize: args.batchSize, maxDocs: args.maxDocs });
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`fatal: ${err && err.message ? err.message : err}`);
      process.exit(EXIT_RUNTIME_ERROR);
    });
}
