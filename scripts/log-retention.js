#!/usr/bin/env node
/*
 * scripts/log-retention.js
 *
 * Phase 26 (LOG-04) retention job: one job for audit docs (managed_logs) and
 * build records (managed_builds) older than 365 days, plus the build folders
 * on both artifact roots. It replaces prune-on-read (D-07) and the broken
 * audit-log retention cron job (D-17).
 *
 *   D-07  pruning happens here, on a schedule, never on read
 *   D-08  365-day window for audit and builds
 *   D-09  expired records AND their folders are deleted (one-way, no backup)
 *   D-10  DRY RUN BY DEFAULT; the output is aggregates only
 *   D-11  record-driven deletion plus an orphan sweep (folders with no record)
 *   D-16  two roots (deploy, repos), containment-checked, approved per root
 *   D-17  audit and builds in one job, run from a one-shot container
 *
 * Modes:
 *   (no flags) | --dry-run
 *        DEFAULT. Reads both DBs and both roots and prints what would be
 *        deleted. Deletes nothing.
 *   --apply --roots <deploy|repos|deploy,repos|none> [--no-audit]
 *        Deletes expired audit docs (unless --no-audit), then, for the listed
 *        roots only, expired build folders and orphans, then the build
 *        records whose folders are gone. `none` leaves build records and
 *        folders untouched.
 *   --help, -h
 *
 * Environment (no credentials in the repo):
 *   COUCHDB_USER, COUCHDB_PASS (fallback COUCHDB_PASSWORD),
 *   COUCHDB_HOST (default couchdb), COUCHDB_PORT (default 5984),
 *   THINX_PREFIX (DB-name prefix, default empty),
 *   RETENTION_DEPLOY_ROOT (default /mnt/data/deploy),
 *   RETENTION_REPOS_ROOT (default /mnt/data/repos).
 *
 * Exit codes: 0 OK, 1 FAIL or INCOMPLETE, 2 usage error.
 *
 * Output hygiene: every line is `key=value` with a count, byte total, date
 * (YYYY-MM-DD) or token, or the final `LOG-RETENTION …` line. No owner id,
 * udid, build id, doc id, path below a root or CouchDB URL is ever printed.
 *
 * Self-contained on purpose: it does not load lib/thinx/globals.js or
 * database.js (globals writes a prefix file when it finds none, and the
 * one-shot container has no config mount). The client is built from env
 * through lib/thinx/couch.js.
 */

"use strict";

const LogRetention = require("../lib/thinx/log_retention");

const EXIT_OK = 0;
const EXIT_RUNTIME = 1;
const EXIT_USAGE = 2;

const ROOT_NAMES = ["deploy", "repos"];
const DEFAULT_DEPLOY_ROOT = "/mnt/data/deploy";
const DEFAULT_REPOS_ROOT = "/mnt/data/repos";

const USAGE = [
  "Usage: node scripts/log-retention.js [--dry-run]",
  "       node scripts/log-retention.js --apply --roots <deploy|repos|deploy,repos|none> [--no-audit]",
  "",
  "Default is a dry run: prints aggregates of what would be deleted, deletes nothing.",
  "--apply deletes expired audit docs (365 d) unless --no-audit, and, only in the",
  "  roots named by --roots, expired build folders and orphan folders, then the",
  "  build records whose folders are gone. --roots none leaves builds untouched.",
  "",
  "Env: COUCHDB_USER, COUCHDB_PASS (or COUCHDB_PASSWORD), COUCHDB_HOST, COUCHDB_PORT,",
  "     THINX_PREFIX, RETENTION_DEPLOY_ROOT, RETENTION_REPOS_ROOT",
  "Exit: 0 OK, 1 FAIL or INCOMPLETE, 2 usage error. Deletions are one-way."
];

// ---------------------------------------------------------------------------
// Arguments. Validated before any CouchDB or filesystem access.
// ---------------------------------------------------------------------------

function parseRoots(v) {
  if (typeof v !== "string" || v.length === 0 || v.indexOf("--") === 0) return { error: "roots_missing" };
  const parts = v.split(",").map((s) => s.trim());
  if (parts.length === 1 && parts[0] === "none") return { roots: [] };
  const list = [];
  for (const p of parts) {
    if (ROOT_NAMES.indexOf(p) === -1) return { error: "unknown_root" };
    if (list.indexOf(p) === -1) list.push(p);
  }
  // Canonical order, so output does not depend on how the operator typed it.
  return { roots: ROOT_NAMES.filter((n) => list.indexOf(n) !== -1) };
}

function parseArgs(argv) {
  const args = { apply: false, dryRun: false, roots: null, noAudit: false, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a === "--apply") {
      args.apply = true;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--no-audit") {
      args.noAudit = true;
    } else if (a === "--roots") {
      const r = parseRoots(argv[++i]);
      if (r.error) { args.error = r.error; break; }
      args.roots = r.roots;
    } else {
      args.error = "unknown_argument";
      break;
    }
  }
  if (!args.error && !args.help) {
    if (args.apply && args.dryRun) args.error = "apply_and_dry_run";
    else if (args.apply && args.roots === null) args.error = "roots_required";
    else if (!args.apply && args.roots !== null) args.error = "roots_without_apply";
    else if (!args.apply && args.noAudit) args.error = "no_audit_without_apply";
  }
  return args;
}

// ---------------------------------------------------------------------------
// Errors and CouchDB access.
// ---------------------------------------------------------------------------

// Reduce any error to `<status>:<code>`. Never echoes reason, message or URL.
function errorTag(err) {
  const e = (err && typeof err === "object") ? err : {};
  const status = Number.isInteger(e.statusCode) ? String(e.statusCode) : "none";
  let raw = (typeof e.error === "string") ? e.error : ((typeof e.code === "string") ? e.code : "");
  if (!raw && typeof e.message === "string") {
    // nano 11 reports socket failures only through a message that includes
    // host:port. Keep the errno token alone.
    const m = /\b(E[A-Z_]{2,30})\b/.exec(e.message);
    if (m) raw = m[1];
    else if (/connection/i.test(e.message)) raw = "connection_error";
  }
  const code = /^[A-Za-z_]{1,40}$/.test(raw) ? raw : "unknown";
  return status + ":" + code;
}

function buildClient(env) {
  const user = env.COUCHDB_USER;
  const pass = env.COUCHDB_PASS || env.COUCHDB_PASSWORD;
  if (!user || !pass) return { error: "missing_credentials" };
  const host = env.COUCHDB_HOST || "couchdb";
  const port = String(env.COUCHDB_PORT || "5984");
  if (!/^[A-Za-z0-9._-]{1,253}$/.test(host)) return { error: "invalid_host" };
  if (!/^[0-9]{1,5}$/.test(port)) return { error: "invalid_port" };
  // The URL carries credentials and is never printed.
  const url = "http://" + encodeURIComponent(user) + ":" + encodeURIComponent(pass) + "@" + host + ":" + port;
  return { client: require("../lib/thinx/couch")(url) };
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------

async function run(argv, deps) {
  deps = deps || {};
  const lines = [];
  const emit = (l) => { lines.push(l); if (typeof deps.print === "function") deps.print(l); };
  const done = (code) => ({ code, lines });
  const fail = (reason, cause) => {
    if (cause) emit("error=" + errorTag(cause));
    emit("LOG-RETENTION FAIL " + reason);
    return done(EXIT_RUNTIME);
  };

  const args = parseArgs(Array.isArray(argv) ? argv : []);
  if (args.help) {
    for (const l of USAGE) emit(l);
    return done(EXIT_OK);
  }
  if (args.error) {
    emit("error=usage:" + args.error);
    emit("see --help");
    return done(EXIT_USAGE);
  }

  const env = deps.env || process.env;
  const prefix = String(env.THINX_PREFIX || "").trim();
  if (!/^[a-z0-9_]*$/.test(prefix)) {
    emit("error=usage:invalid_prefix");
    return done(EXIT_USAGE);
  }

  const mode = args.apply ? "apply" : "dry-run";

  let client = deps.client;
  if (!client) {
    let built;
    try {
      built = buildClient(env);
    } catch (e) {
      return fail("client_failed", e);
    }
    if (built.error) return fail(built.error);
    client = built.client;
  }

  let report;
  let retention;
  try {
    retention = new LogRetention({
      logsDb: client.use(prefix + "managed_logs"),
      buildsDb: client.use(prefix + "managed_builds"),
      roots: {
        deploy: env.RETENTION_DEPLOY_ROOT || DEFAULT_DEPLOY_ROOT,
        repos: env.RETENTION_REPOS_ROOT || DEFAULT_REPOS_ROOT
      },
      now: deps.now,
      fs: deps.fs
    });
    report = await retention.plan();
  } catch (e) {
    const reason = (e && typeof e.retentionReason === "string") ? e.retentionReason : "plan_failed";
    const token = /^[a-z0-9_:]{1,60}$/.test(reason) ? reason : "plan_failed";
    return fail(token, e && e.retentionReason ? e.cause : e);
  }

  if (mode === "dry-run") {
    for (const l of LogRetention.formatReport(report, "dry-run")) emit(l);
    return done(EXIT_OK);
  }

  let result;
  try {
    result = await retention.apply(report, { roots: args.roots, audit: !args.noAudit });
  } catch (e) {
    return fail("apply_failed", e);
  }
  for (const l of LogRetention.formatReport(report, "apply", result)) emit(l);
  return done(result.complete ? EXIT_OK : EXIT_RUNTIME);
}

module.exports = { run, parseArgs, errorTag, EXIT_OK, EXIT_RUNTIME, EXIT_USAGE };

if (require.main === module) {
  run(process.argv.slice(2), { print: (l) => console.log(l) })
    .then((r) => process.exit(r.code))
    .catch((e) => {
      console.log("error=" + errorTag(e));
      console.log("LOG-RETENTION FAIL unexpected");
      process.exit(EXIT_RUNTIME);
    });
}
