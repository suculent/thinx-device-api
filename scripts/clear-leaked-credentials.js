#!/usr/bin/env node
/*
 * scripts/clear-leaked-credentials.js
 *
 * D-15 (phase 26) — clear outstanding password-reset keys on user documents
 * and redact the credential objects that two audit writers copied into
 * `managed_logs` flags (whole user documents: password hash, reset key,
 * email, repos).
 *
 * Modes:
 *   (no flags) | --dry-run  DEFAULT. Reads managed_users and managed_logs
 *                           page by page and prints aggregates. NEVER writes.
 *   --apply --targets <list>
 *                           Writes only what <list> names:
 *                             reset-keys   reset_key -> null on every user doc
 *                                          that has one, through the
 *                                          _design/users updates/edit handler
 *                                          (server-side, latest revision).
 *                             audit-flags  rewrites ONLY the `flags` field of
 *                                          audit docs whose flags hold a
 *                                          non-string element, keeping the
 *                                          string elements (fallback ["info"]),
 *                                          via _bulk_docs with the scanned _rev.
 *                           <list> is comma separated; both may be given.
 *
 * Options:
 *   --batch-size <n>        Docs per page / bulk write (default 200, max 500).
 *   --help, -h              Usage, exit 0.
 *
 * Environment (no credentials in the repo):
 *   COUCHDB_USER, COUCHDB_PASS (fallback COUCHDB_PASSWORD),
 *   COUCHDB_HOST (default couchdb), COUCHDB_PORT (default 5984),
 *   THINX_PREFIX (DB-name prefix, default empty).
 *
 * Exit codes: 0 ok, 1 runtime failure or incomplete apply, 2 usage error.
 *
 * Output hygiene: aggregates and presence counts only. No doc id, owner id,
 * email, password hash, reset key or CouchDB URL is ever printed, in any
 * mode, including error paths (errors reduce to `error=<status>:<code>`).
 *
 * ONE-WAY BY DESIGN: there is no snapshot, backup or JSONL copy of what this
 * removes. A snapshot would re-store the very hashes and keys being cleared.
 * Affected users simply request a new password reset. This is the deliberate
 * divergence from scripts/redact-managed-logs.js, which snapshots before apply.
 *
 * Self-contained on purpose: it must run inside the API container through
 * `docker exec` without lib/thinx/globals.js or the config mount, so it does
 * not load audit.js. stringFlags() duplicates Audit.stringFlags (plan 26-01).
 */

"use strict";

const EXIT_OK = 0;
const EXIT_RUNTIME = 1;
const EXIT_USAGE = 2;

const DEFAULT_BATCH = 200;
const MAX_BATCH = 500;
const TARGETS = ["reset-keys", "audit-flags"];
const EMBEDDED_FIELDS = ["password", "reset_key", "email", "repos"];

// ---------------------------------------------------------------------------
// Pure helpers (exported for the spec).
// ---------------------------------------------------------------------------

function flagList(flags) {
  if (typeof flags === "undefined") return [];
  return Array.isArray(flags) ? flags : [flags];
}

// True when any element of doc.flags (a scalar is wrapped) is not a string.
function hasObjectFlag(doc) {
  if (!doc || typeof doc !== "object") return false;
  return flagList(doc.flags).some((f) => typeof f !== "string");
}

// Same rule as Audit.stringFlags: non-empty strings of at most 32 characters,
// falling back to ["info"] when nothing survives.
function stringFlags(flags) {
  const kept = flagList(flags).filter((f) => typeof f === "string" && f.length > 0 && f.length <= 32);
  return (kept.length > 0) ? kept : ["info"];
}

function hasResetKey(doc) {
  return !!doc && typeof doc.reset_key === "string" && doc.reset_key.length > 0;
}

// Which credential fields are embedded in the doc's object flags (presence only).
function embeddedFields(doc) {
  const found = {};
  for (const f of flagList(doc.flags)) {
    if (!f || typeof f !== "object") continue;
    for (const name of EMBEDDED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(f, name)) found[name] = true;
    }
  }
  return found;
}

// Reduce any error to `<status>:<code>`. Never echoes reason, message or URL.
function errorTag(err) {
  const e = (err && typeof err === "object") ? err : {};
  const status = Number.isInteger(e.statusCode) ? String(e.statusCode) : "none";
  let raw = (typeof e.error === "string") ? e.error : ((typeof e.code === "string") ? e.code : "");
  if (!raw && typeof e.message === "string") {
    // nano 11 reports socket failures only as a message ("error happened in
    // your connection. Reason: … connect ECONNREFUSED host:port"). Keep the
    // errno token alone; the rest of the message is dropped.
    const m = /\b(E[A-Z_]{2,30})\b/.exec(e.message);
    if (m) raw = m[1];
    else if (/connection/i.test(e.message)) raw = "connection_error";
  }
  const code = /^[A-Za-z_]{1,40}$/.test(raw) ? raw : "unknown";
  return status + ":" + code;
}

// ---------------------------------------------------------------------------
// Arguments.
// ---------------------------------------------------------------------------

const USAGE = [
  "Usage: node scripts/clear-leaked-credentials.js [--dry-run] [--batch-size <n>]",
  "       node scripts/clear-leaked-credentials.js --apply --targets <reset-keys|audit-flags|reset-keys,audit-flags>",
  "",
  "Default is a dry run: reads managed_users and managed_logs, prints aggregates, writes nothing.",
  "--apply requires --targets and changes only what the targets name:",
  "  reset-keys   sets reset_key to null through the users/edit update handler",
  "  audit-flags  rewrites only the flags field of audit docs whose flags hold objects",
  "--batch-size   docs per page and per bulk write (default 200, max 500)",
  "",
  "Env: COUCHDB_USER, COUCHDB_PASS (or COUCHDB_PASSWORD), COUCHDB_HOST, COUCHDB_PORT, THINX_PREFIX",
  "Exit: 0 ok, 1 runtime failure or incomplete apply, 2 usage error.",
  "One-way by design: no snapshot of the removed material is written."
];

function parseArgs(argv) {
  const args = { apply: false, dryRun: false, targets: null, batch: DEFAULT_BATCH, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a === "--apply") {
      args.apply = true;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--targets") {
      const v = argv[++i];
      if (typeof v !== "string" || v.length === 0 || v.indexOf("--") === 0) {
        args.error = "targets_missing";
        break;
      }
      const list = [];
      for (const t of v.split(",").map((s) => s.trim())) {
        if (TARGETS.indexOf(t) === -1) { args.error = "unknown_target"; break; }
        if (list.indexOf(t) === -1) list.push(t);
      }
      if (args.error) break;
      // Canonical order so output does not depend on how the operator typed it.
      args.targets = TARGETS.filter((t) => list.indexOf(t) !== -1);
    } else if (a === "--batch-size") {
      const v = argv[++i];
      const n = /^[0-9]+$/.test(String(v)) ? Number.parseInt(v, 10) : NaN;
      if (!Number.isInteger(n) || n < 1 || n > MAX_BATCH) { args.error = "invalid_batch_size"; break; }
      args.batch = n;
    } else {
      args.error = "unknown_argument";
      break;
    }
  }
  if (!args.error && !args.help) {
    if (args.apply && args.dryRun) args.error = "apply_and_dry_run";
    else if (args.apply && !args.targets) args.error = "targets_required";
    else if (!args.apply && args.targets) args.error = "targets_without_apply";
  }
  return args;
}

// ---------------------------------------------------------------------------
// CouchDB access.
// ---------------------------------------------------------------------------

function buildClient(env) {
  const user = env.COUCHDB_USER;
  const pass = env.COUCHDB_PASS || env.COUCHDB_PASSWORD;
  if (!user || !pass) return null;
  const host = env.COUCHDB_HOST || "couchdb";
  const port = env.COUCHDB_PORT || "5984";
  // The URL carries credentials and is never printed.
  const url = "http://" + encodeURIComponent(user) + ":" + encodeURIComponent(pass) + "@" + host + ":" + port;
  return require("../lib/thinx/couch")(url);
}

// Paged _all_docs scan: limit = batch + 1, the extra row is the next startkey.
// Design docs are skipped. onPage receives the page's docs in id order.
async function scan(db, batch, onPage) {
  let startkey;
  for (;;) {
    const params = { include_docs: true, limit: batch + 1 };
    if (typeof startkey === "string") params.startkey = startkey;
    const page = await db.list(params);
    const rows = (page && Array.isArray(page.rows)) ? page.rows : [];
    const more = rows.length > batch;
    const docs = rows.slice(0, batch)
      .filter((r) => r && r.doc && typeof r.id === "string" && r.id.indexOf("_design/") !== 0)
      .map((r) => r.doc);
    await onPage(docs);
    if (!more) return;
    startkey = rows[batch].id;
  }
}

function day(ms) { return new Date(ms).toISOString().slice(0, 10); }
function minute(ms) { return new Date(ms).toISOString().slice(0, 16) + "Z"; }

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------

async function run(argv, deps) {
  deps = deps || {};
  const lines = [];
  const emit = (l) => { lines.push(l); if (typeof deps.print === "function") deps.print(l); };
  const done = (code) => ({ code, lines });

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

  let client = deps.client;
  if (!client) {
    try {
      client = buildClient(env);
    } catch (e) {
      emit("error=" + errorTag(e));
      return done(EXIT_RUNTIME);
    }
    if (!client) {
      emit("error=config:missing_credentials");
      return done(EXIT_RUNTIME);
    }
  }

  const apply = args.apply;
  const targets = args.targets || [];
  const doResetKeys = apply && targets.indexOf("reset-keys") !== -1;
  const doAuditFlags = apply && targets.indexOf("audit-flags") !== -1;
  const dbUsersName = prefix + "managed_users";
  const dbLogsName = prefix + "managed_logs";

  const c = {
    users_scanned: 0, users_with_reset_key: 0,
    audit_scanned: 0, audit_with_object_flags: 0,
    password: 0, reset_key: 0, email: 0, repos: 0,
    oldest: null, newest: null,
    users_cleared: 0, users_failed: 0,
    audit_redacted: 0, audit_conflicts: 0, audit_failed: 0
  };
  const errors = [];
  const noteError = (e) => { const t = errorTag(e); if (errors.indexOf(t) === -1) errors.push(t); };

  if (apply) {
    emit("mode=apply");
    emit("targets=" + targets.join(","));
  } else {
    emit("mode=dry-run");
  }
  emit("db_users=" + dbUsersName);
  emit("db_logs=" + dbLogsName);

  let fatal = null;
  try {
    const usersDb = client.use(dbUsersName);
    const logsDb = client.use(dbLogsName);

    await scan(usersDb, args.batch, async (docs) => {
      for (const doc of docs) {
        c.users_scanned += 1;
        if (!hasResetKey(doc)) continue;
        c.users_with_reset_key += 1;
        if (!doResetKeys) continue;
        try {
          // The handler answers with the whole user doc; it is discarded unread.
          await usersDb.atomic("users", "edit", doc._id, { reset_key: null });
          c.users_cleared += 1;
        } catch (e) {
          c.users_failed += 1;
          noteError(e);
        }
      }
    });

    await scan(logsDb, args.batch, async (docs) => {
      const updates = [];
      for (const doc of docs) {
        c.audit_scanned += 1;
        if (!hasObjectFlag(doc)) continue;
        c.audit_with_object_flags += 1;
        const found = embeddedFields(doc);
        for (const name of EMBEDDED_FIELDS) if (found[name]) c[name] += 1;
        const t = Date.parse(doc.date);
        if (Number.isFinite(t)) {
          if (c.oldest === null || t < c.oldest) c.oldest = t;
          if (c.newest === null || t > c.newest) c.newest = t;
        }
        if (doAuditFlags) updates.push(Object.assign({}, doc, { flags: stringFlags(doc.flags) }));
      }
      if (updates.length === 0) return;
      const results = await logsDb.bulk({ docs: updates });
      const list = Array.isArray(results) ? results : [];
      for (const r of list) {
        if (r && r.error === "conflict") c.audit_conflicts += 1;
        else if (r && r.error) { c.audit_failed += 1; noteError({ error: r.error }); }
        else c.audit_redacted += 1;
      }
      // A short response leaves docs unaccounted for: count them as failed.
      if (list.length < updates.length) c.audit_failed += updates.length - list.length;
    });
  } catch (e) {
    fatal = e;
  }

  if (fatal && !apply) {
    emit("error=" + errorTag(fatal));
    return done(EXIT_RUNTIME);
  }

  emit("users_scanned=" + c.users_scanned);
  emit("users_with_reset_key=" + c.users_with_reset_key);
  emit("audit_scanned=" + c.audit_scanned);
  emit("audit_with_object_flags=" + c.audit_with_object_flags);
  emit("audit_object_flags_with_password=" + c.password);
  emit("audit_object_flags_with_reset_key=" + c.reset_key);
  emit("audit_object_flags_with_email=" + c.email);
  emit("audit_object_flags_with_repos=" + c.repos);
  emit("audit_object_flags_oldest=" + (c.oldest === null ? "none" : day(c.oldest)));
  emit("audit_object_flags_newest=" + (c.newest === null ? "none" : minute(c.newest)));

  if (!apply) {
    emit("CLEANUP-DRY-RUN OK");
    return done(EXIT_OK);
  }

  emit("users_cleared=" + c.users_cleared);
  emit("users_failed=" + c.users_failed);
  emit("audit_redacted=" + c.audit_redacted);
  emit("audit_conflicts=" + c.audit_conflicts);
  emit("audit_failed=" + c.audit_failed);
  for (const t of errors) emit("error=" + t);
  if (fatal) emit("error=" + errorTag(fatal));
  const complete = !fatal && c.users_failed === 0 && c.audit_conflicts === 0 && c.audit_failed === 0;
  emit(complete ? "CLEANUP-APPLY OK" : "CLEANUP-APPLY INCOMPLETE");
  return done(complete ? EXIT_OK : EXIT_RUNTIME);
}

module.exports = { run, stringFlags, hasObjectFlag, parseArgs, errorTag, EXIT_OK, EXIT_RUNTIME, EXIT_USAGE };

if (require.main === module) {
  run(process.argv.slice(2), { print: (l) => console.log(l) })
    .then((r) => process.exit(r.code))
    .catch((e) => {
      console.log("error=" + errorTag(e));
      process.exit(EXIT_RUNTIME);
    });
}
