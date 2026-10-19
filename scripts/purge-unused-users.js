#!/usr/bin/env node
"use strict";

// Standalone maintenance tool: do not load Globals/Database (startup side effects).
// See docs/administration/purge-unused-users.md for selection and maintenance rules.
const fs = require("node:fs");
const path = require("node:path");

const has = (doc, key) => Object.prototype.hasOwnProperty.call(doc, key);

function classifyUser(doc) {
    if (!doc || typeof doc._id !== "string" || !/^[a-z0-9]{64,}$/.test(doc._id) ||
        doc.owner !== doc._id || typeof doc._rev !== "string" || !doc._rev || doc._deleted ||
        (doc._conflicts && doc._conflicts.length) || (doc._deleted_conflicts && doc._deleted_conflicts.length)) {
        return "invalid_or_conflicted";
    }
    if (has(doc, "last_seen") || has(doc, "last_login")) return "login_marker";
    if (doc.admin) return "admin";
    if (doc._attachments && Object.keys(doc._attachments).length) return "attachments";
    // performTokenLogin creates first-time OAuth users without updateLastSeen.
    if (doc.activation === false || has(doc, "gitHubAccessToken")) return "oauth";
    return "candidate";
}

function parseArgs(argv) {
    const opts = { apply: false, batchSize: 500 };
    let mode;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (["--scan", "--dry-run", "--apply"].includes(arg)) {
            const next = arg === "--apply" ? "apply" : "scan";
            if (mode && mode !== next) throw new Error("conflicting_modes");
            mode = next;
            opts.apply = next === "apply";
        } else if (arg === "--help" || arg === "-h") {
            opts.help = true;
        } else if (arg === "--snapshot-to" || arg === "--batch-size") {
            const value = argv[++i];
            if (!value || value.startsWith("--")) throw new Error("missing_option_value");
            if (arg === "--snapshot-to") opts.snapshotTo = value;
            else {
                if (!/^[1-9][0-9]*$/.test(value) || Number(value) > 10000) throw new Error("invalid_batch_size");
                opts.batchSize = Number(value);
            }
        } else throw new Error("unknown_argument");
    }
    if (opts.apply && !opts.snapshotTo && !opts.help) throw new Error("snapshot_required");
    return opts;
}

async function* documents(db, batchSize) {
    let cursor;
    for (;;) {
        const params = { include_docs: true, conflicts: true, limit: batchSize + (cursor ? 1 : 0) };
        if (cursor) params.startkey = cursor;
        const page = await db.list(params);
        if (!page || !Array.isArray(page.rows)) throw new Error("invalid_list_response");
        let advanced = false;
        for (const row of page.rows) {
            if (!row || typeof row.id !== "string") throw new Error("invalid_row");
            // No skip=1: the previous cursor might have been deleted in the meantime.
            if (row.id === cursor) continue;
            if (!row.doc || row.doc._id !== row.id || row.doc._deleted) throw new Error("missing_document");
            cursor = row.id;
            advanced = true;
            if (!row.id.startsWith("_")) yield row.doc;
        }
        if (!advanced) return;
    }
}

async function run({ users, devices }, opts = {}) {
    const batchSize = opts.batchSize || 500;
    if (opts.apply && !opts.snapshotTo) throw new Error("snapshot_required");
    const report = { mode: opts.apply ? "apply" : "scan", scanned: 0, candidates: 0,
        deleted: 0, changed: 0, conflicts: 0, retained: {} };
    const emit = typeof opts.emit === "function" ? opts.emit : () => {};
    const retain = reason => { report.retained[reason] = (report.retained[reason] || 0) + 1; };
    const ownersWithDevices = new Set();
    // Finish both scans before issuing ANY deletion. No cached admin device counts
    // or installed design views are trusted as the source of device ownership.
    for await (const device of documents(devices, batchSize)) {
        if (device._conflicts && device._conflicts.length) throw new Error("conflicted_device");
        if (typeof device.owner !== "string" || !device.owner) throw new Error("ambiguous_device_owner");
        ownersWithDevices.add(device.owner);
    }
    const candidates = [];
    for await (const doc of documents(users, batchSize)) {
        report.scanned++;
        const reason = classifyUser(doc);
        if (reason !== "candidate") retain(reason);
        else if (ownersWithDevices.has(doc.owner)) retain("devices");
        else candidates.push(doc);
    }
    report.candidates = candidates.length;
    for (const doc of candidates) emit({ action: "candidate", owner: doc._id });
    if (!opts.apply || candidates.length === 0) return report;

    // Exclusive creation prevents overwrite/symlink following. Flush all original
    // documents to disk before the first delete. Backups contain account secrets.
    const fd = fs.openSync(opts.snapshotTo, "wx", 0o600);
    try {
        for (const doc of candidates) fs.writeFileSync(fd, JSON.stringify(doc) + "\n");
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    const directoryFd = fs.openSync(path.dirname(path.resolve(opts.snapshotTo)), "r");
    try {
        fs.fsyncSync(directoryFd);
    } finally {
        fs.closeSync(directoryFd);
    }

    try {
        for (const original of candidates) {
            let current;
            try {
                current = await users.get(original._id, { conflicts: true, deleted_conflicts: true });
            } catch (err) {
                if (err.statusCode !== 404) throw err;
            }
            if (!current || current._rev !== original._rev || classifyUser(current) !== "candidate") {
                report.changed++;
                emit({ action: "skipped_changed", owner: original._id });
                continue;
            }
            // Fresh Mango query, no stale view option; any read error aborts.
            const found = await devices.find({ selector: { owner: { $eq: current.owner } },
                fields: ["_id"], limit: 1 });
            if (!found || !Array.isArray(found.docs)) throw new Error("invalid_device_response");
            if (found.docs.length) {
                report.changed++;
                emit({ action: "skipped_device", owner: original._id });
                continue;
            }
            try {
                const result = await users.destroy(current._id, current._rev);
                if (!result || result.ok !== true) throw new Error("deletion_unconfirmed");
                report.deleted++;
                emit({ action: "deleted", owner: current._id });
            } catch (err) {
                if (err.statusCode !== 409 && err.statusCode !== 404) throw err;
                report.conflicts++;
                emit({ action: "skipped_conflict", owner: current._id });
            }
        }
    } catch (err) {
        // Preserve the partial summary without logging a credential-bearing error.
        emit({ action: "aborted", report });
        throw err;
    }
    return report;
}

const USAGE = `Usage: node scripts/purge-unused-users.js [--scan|--dry-run]
       node scripts/purge-unused-users.js --apply --snapshot-to /secure/unused-users.jsonl

Default: scan only. --batch-size N controls scan pages (default 500, max 10000).
Selects users without last_seen or last_login and with zero CouchDB devices.
Preserves administrators, OAuth users and ambiguous/conflicted records.
Apply requires an exclusive, mode-0600 JSONL backup; existing files are refused.
Stop login/registration/device writers during apply (cross-database checks are not atomic).
Deletes managed_users documents using revision-checked tombstones, not CouchDB _purge.
Does not perform GDPR cleanup of Redis, files, logs or builds.

Env: COUCHDB_URL (default http://couchdb:5984), COUCHDB_USER,
     COUCHDB_PASS (or COUCHDB_PASSWORD); Docker secrets take precedence.
     THINX_PREFIX (default empty): prefix for managed_users and managed_devices.
Output: JSON lines with owner IDs and a summary; no emails or credentials.
Exit: 0 complete, 1 runtime failure or concurrent changes, 2 usage/config error.
`;

// A short, credential-free code for the abort line. Our own errors carry a
// snake_case code as their message; CouchDB errors become couchdb_<status>,
// file-system errors their errno code. Raw messages are never printed: a
// nano error can carry the request URL, which holds the CouchDB credentials.
function failureReason(err) {
    if (err && /^[a-z][a-z0-9_]{0,63}$/.test(err.message || "")) return err.message;
    if (err && Number.isInteger(err.statusCode)) return "couchdb_" + err.statusCode;
    if (err && /^E[A-Z0-9]{1,31}$/.test(err.code || "")) return err.code;
    return "unexpected_error";
}

function connection(env, readSecret) {
    const url = new URL(env.COUCHDB_URL || "http://couchdb:5984");
    if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash) throw new Error("invalid_url");
    const user = readSecret("COUCHDB_USER");
    const pass = readSecret("COUCHDB_PASS") || readSecret("COUCHDB_PASSWORD");
    if (user && pass) {
        url.username = user;
        url.password = pass;
    }
    if (!url.username || !url.password) throw new Error("missing_credentials");
    const prefix = env.THINX_PREFIX || "";
    if (!/^[a-z0-9_]*$/.test(prefix)) throw new Error("invalid_prefix");
    return { url: url.toString(), prefix };
}

async function main(argv = process.argv.slice(2)) {
    let opts, config;
    try {
        opts = parseArgs(argv);
        if (opts.help) { process.stdout.write(USAGE); return 0; }
        config = connection(process.env, require("../lib/thinx/secrets").readSecret);
    } catch (_err) {
        console.error("Invalid arguments or CouchDB configuration; see --help.");
        return 2;
    }
    try {
        const client = require("../lib/thinx/couch")(config.url);
        const usersName = config.prefix + "managed_users";
        const devicesName = config.prefix + "managed_devices";
        const emit = event => console.log(JSON.stringify(event));
        emit({ mode: opts.apply ? "apply" : "scan", users_db: usersName, devices_db: devicesName });
        const report = await run({ users: client.use(usersName), devices: client.use(devicesName) }, { ...opts, emit });
        emit({ action: "summary", ...report });
        return report.conflicts || report.changed ? 1 : 0;
    } catch (err) {
        console.error(`Cleanup aborted (${failureReason(err)}): database or snapshot operation failed. ` +
            "Review emitted progress and docs/administration/purge-unused-users.md before retrying.");
        return 1;
    }
}

module.exports = { classifyUser, parseArgs, run, connection, failureReason, main };
if (require.main === module) main().then(code => { process.exitCode = code; });
