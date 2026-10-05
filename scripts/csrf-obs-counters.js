/*
 * csrf-obs-counters.js — read-only dump of the Phase 25 CSRF observe counters.
 *
 * lib/middleware/csrf.js bumps the Redis hash `csrf:obs:{YYYYMMDD UTC}` field
 * `{mode}:{reason}:{METHOD} {route pattern}` on every double-submit and binding
 * failure (30-day expiry). This script lists those hashes and prints counts only.
 *
 * Run inside the thinx_api container, fed over stdin (the file is not in the image):
 *
 *   docker exec -i \
 *     -e OBS_REDIS=/opt/thinx/thinx-device-api/node_modules/redis \
 *     -e OBS_GLOBALS=/opt/thinx/thinx-device-api/lib/thinx/globals.js \
 *     [-e OBS_SINCE=20260929] \
 *     {container} node - < scripts/csrf-obs-counters.js
 *
 * Output: one `{key} {field} {count}` line per counter, sorted, then
 * `OBS-TOTAL {sum}`; exit 0. On error `OBS-FAIL {code or name}` and exit 2; after
 * 20 s `OBS-TIMEOUT` and exit 3. It never prints the Redis password, a host, or
 * any value other than the counts. Read-only: KEYS and HGETALL only.
 */

"use strict";

const TIMEOUT_MS = 20000;

// Output goes through out() only. console.log is silenced so that the modules
// required below (globals.js logs its config path and reconnect notices) can
// never add a host, a path or anything else to the output.
const out = (line) => process.stdout.write(line + "\n");
console.log = () => { };
console.warn = () => { };
console.error = () => { };

let client = null;

function finish(code, line) {
    if (line) out(line);
    const quit = (client && client.isOpen) ? client.quit().catch(() => { }) : Promise.resolve();
    Promise.race([quit, new Promise((r) => setTimeout(r, 2000))]).then(() => process.exit(code));
}

function fail(err) {
    const tag = (err && (err.code || err.name)) ? String(err.code || err.name) : "unknown";
    finish(2, "OBS-FAIL " + tag.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64));
}

const timer = setTimeout(() => finish(3, "OBS-TIMEOUT"), TIMEOUT_MS);

async function main() {
    const redisPath = process.env.OBS_REDIS;
    const globalsPath = process.env.OBS_GLOBALS;
    if (!redisPath || !globalsPath) {
        const e = new Error("OBS_REDIS and OBS_GLOBALS are required");
        e.code = "ENV_MISSING";
        throw e;
    }
    const since = process.env.OBS_SINCE || "";
    if (since && !/^\d{8}$/.test(since)) {
        const e = new Error("OBS_SINCE must be YYYYMMDD");
        e.code = "BAD_SINCE";
        throw e;
    }

    const { createClient } = require(redisPath);
    const Globals = require(globalsPath);

    client = createClient(Globals.redis_options());
    // Swallow client 'error' events: a failure surfaces through the awaited
    // calls below as OBS-FAIL, never as a printed connection string.
    client.on("error", () => { });
    await client.connect();

    const keys = (await client.keys("csrf:obs:*"))
        .filter((k) => /^csrf:obs:\d{8}$/.test(k))
        .filter((k) => !since || k.slice("csrf:obs:".length) >= since)
        .sort();

    const rows = [];
    let total = 0;
    for (const key of keys) {
        const hash = await client.hGetAll(key);
        Object.keys(hash).sort().forEach((field) => {
            const n = parseInt(hash[field], 10);
            const count = isNaN(n) ? 0 : n;
            total += count;
            rows.push(key + " " + field + " " + count);
        });
    }

    rows.forEach((r) => out(r));
    clearTimeout(timer);
    finish(0, "OBS-TOTAL " + total);
}

main().catch((err) => {
    clearTimeout(timer);
    fail(err);
});
