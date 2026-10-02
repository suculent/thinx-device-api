/*
 * InfluxDB 2 statistics connector (Phase 27: D-03, D-09, D-10, D-12).
 *
 * Talks to InfluxDB 2 through @influxdata/influxdb-client (writes, Flux
 * queries) and @influxdata/influxdb-client-apis (bucket admin at boot).
 *
 * Contract kept for every caller:
 *   - statsLog(owner, event, data?) prints `[OID:<owner>] [<EVENT>]` (plus
 *     ` <data>` only when data is given; the legacy file ETL in statistics.js
 *     counts these lines) and writes measurement <EVENT>, tag owner (plus tag
 *     data when given) and float field value=1 to bucket `stats`. It returns a
 *     promise that always resolves: a stats failure never throws into, rejects
 *     in, or blocks a device check-in, build or login path.
 *   - writePoint(point, callback) calls back `[]` exactly once, never throws.
 *   - today/week call back (true, {KPI:[n]}) keyed by EventTaxonomy.names().
 *
 * Configuration:
 *   INFLUXDB_URL  (env, default http://influxdb:8086)
 *   INFLUXDB_ORG  (env, default thinx)
 *   INFLUXDB_TOKEN (Docker secret /run/secrets/INFLUXDB_TOKEN, else env).
 *     Without a token statistics are disabled: one log line per process,
 *     writes are no-ops, queries answer zeros, boot continues.
 *
 * ensureStatsBucket() runs at boot (thinx-core.js) and converges bucket
 * `stats` to a 90-day expire rule. It resolves {ok, action, reason} and never
 * rejects:
 *
 *   no token                         → no call               action "skipped"
 *   org lookup fails / no org        → no write              action "skipped"
 *   bucket lookup fails / times out  → no write              action "skipped"
 *   `stats` at 90 d                  → no write              action "unchanged"
 *   `stats` at another retention     → PATCH retentionRules  action "updated"
 *   `stats` absent, `stats/autogen`  → PATCH name+retention  action "adopted"
 *     (same bucket id, so the v1 DBRP mapping of the upgraded data survives)
 *   both absent                      → POST bucket           action "created"
 *   a write is refused (e.g. 422)    →                       action "failed"
 *
 * Timestamps: points are written with nanosecond precision and a strictly
 * increasing per-process timestamp (wall-clock ms * 1e6, bumped by 1 ns when
 * the clock repeats or steps back). A point is identified by measurement,
 * tags and timestamp, so two identical writes (same owner, event and data)
 * inside one millisecond used to collapse into one point and undercount
 * (27-04, CI #15564). Ranges and counts read the same instants as before;
 * a timestamp runs ahead of the wall clock by at most one nanosecond per
 * write issued within the same millisecond.
 *
 * Logged reasons and errors are short tokens taken only from a status code, a
 * Node error code or "timeout". Error objects are never stringified: client
 * HttpErrors can carry the URL and the Authorization header.
 *
 * Read-only helpers for scripts/influx-stats-probe.js (27-03): bucketStatus,
 * countsDetailed, countAll and distinctOwners. They only read (no write, no
 * ensure step), accept only the buckets `stats` and `stats/autogen` (anything
 * else resolves {ok:false, reason:"bad_bucket"}), never reject and never log;
 * failures come back as a short reason token.
 *
 * This module must not require globals.js or statistics.js (it is loaded by
 * probes without any configuration).
 */

const { InfluxDB, Point, flux, fluxDuration, fluxExpression, setLogger } = require("@influxdata/influxdb-client");
const { BucketsAPI, OrgsAPI } = require("@influxdata/influxdb-client-apis");
const { readSecret } = require("./secrets.js");
const EventTaxonomy = require("./event_taxonomy.js");
const Util = require("./util");
const { withTimeout } = require("./design_upsert.js");

const BUCKET = "stats";
const LEGACY_BUCKET = "stats/autogen"; // the name `influxd upgrade` gives the migrated 1.x data
const READ_BUCKETS = Object.freeze([BUCKET, LEGACY_BUCKET]); // the only buckets the read-only helpers accept
const RETENTION_SECONDS = 7776000; // 90 days, shown by the CLI as 2160h0m0s
const ENSURE_TIMEOUT_MS = 5000;
const QUERY_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;
const RESET_TIMEOUT_MS = 2000;

const OWNER_RE = /^[a-zA-Z0-9_]+$/;
const TOKEN_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const EPOCH = new Date(0);

const influxUrl = () => process.env.INFLUXDB_URL || "http://influxdb:8086";
const influxOrg = () => process.env.INFLUXDB_ORG || "thinx";

// Short, credential-free reason token. Never reads e.message, e.body or e.json.
function reasonOf(e) {
    if (!e || typeof e !== "object") return "error";
    if (e.timedOut === true || e.name === "RequestTimedOutError") return "timeout";
    if (typeof e.statusCode === "number") return String(e.statusCode);
    if (typeof e.code === "string" && TOKEN_RE.test(e.code)) return e.code;
    return "error";
}

// Client messages are fixed strings; cap them anyway so nothing unexpected
// (multi-line dumps) reaches the log.
function terse(message) {
    return String(message).split("\n")[0].substring(0, 120);
}

// The default client logger dumps whole HttpError objects (headers included).
setLogger({
    error: (message, err) => console.log(`[influx] ${terse(message)} ${reasonOf(err)}`),
    warn: (message, err) => console.log(`[influx] ${terse(message)} ${reasonOf(err)}`)
});

// Runs fn() so that a synchronous throw becomes a rejection.
function attempt(fn) {
    return new Promise((resolve) => resolve(fn()));
}

function zeros() {
    const out = {};
    EventTaxonomy.names().forEach((k) => { out[k] = [0]; });
    return out;
}

function isMeasurement(name) {
    return typeof name === "string" && EventTaxonomy.names().indexOf(name) !== -1;
}

function expireSeconds(bucket) {
    const rules = (bucket && Array.isArray(bucket.retentionRules)) ? bucket.retentionRules : [];
    const rule = rules.find((r) => r && r.type === "expire");
    return (rule && typeof rule.everySeconds === "number") ? rule.everySeconds : 0;
}

// The bucket a read-only helper may query, or null when it is not allowed.
function readBucket(opts) {
    const b = (opts && typeof opts === "object" && typeof opts.bucket !== "undefined") ? opts.bucket : BUCKET;
    return (READ_BUCKETS.indexOf(b) !== -1) ? b : null;
}

// Range stop for Flux: the given Date/duration, else now() (Flux's own default).
function rangeStop(opts) {
    const stop = (opts && typeof opts === "object") ? opts.stop : undefined;
    return (typeof stop === "undefined" || stop === null) ? fluxExpression("now()") : stop;
}

// undefined = not initialised, null = disabled, otherwise {client, writeApi, queryApi}.
let state;
let disabledLogged = false;

// Last nanosecond timestamp handed out. Never reset (not even by
// _resetForTests), so timestamps stay strictly increasing for the process.
const NS_PER_MS = BigInt(1000000);
let lastNs = BigInt(0);

// Strictly increasing nanosecond timestamp as a base-10 string (a JS number
// cannot hold epoch nanoseconds exactly). Wall-clock ms * 1e6, or 1 ns past
// the previous value when the clock repeats or steps back.
function nextTimestamp() {
    const ms = Date.now();
    const wall = Number.isFinite(ms) ? BigInt(Math.trunc(ms)) * NS_PER_MS : BigInt(0);
    lastNs = (wall > lastNs) ? wall : lastNs + BigInt(1);
    return lastNs.toString();
}

function live() {
    if (state !== undefined) return state;
    const token = readSecret("INFLUXDB_TOKEN");
    if (!token) {
        if (!disabledLogged) {
            console.log("ℹ️ [info] [influx] INFLUXDB_TOKEN not set, statistics disabled");
            disabledLogged = true;
        }
        state = null;
        return state;
    }
    try {
        const client = new InfluxDB({ url: influxUrl(), token: token, timeout: REQUEST_TIMEOUT_MS });
        const writeApi = client.getWriteApi(influxOrg(), BUCKET, "ns", {
            batchSize: 100,
            flushInterval: 1000,
            maxRetries: 2,
            maxRetryTime: 10000,
            maxBufferLines: 1000
        });
        state = { client: client, writeApi: writeApi, queryApi: client.getQueryApi(influxOrg()) };
    } catch (e) {
        console.log(`[influx] client init failed ${reasonOf(e)}`);
        state = null;
    }
    return state;
}

module.exports = class InfluxConnector {

    // `db` is ignored (callers pass 'stats'); kept so `new InfluxConnector('stats')` works.
    constructor(_db) {
        this.bucket = BUCKET;
    }

    static statsLog(owner, event, data) {
        if (!Util.isDefined(owner)) owner = "0";
        const hasData = (typeof data !== "undefined") && (data !== null);
        console.log(`[OID:${owner}] [${event}]` + (hasData ? ` ${data}` : ""));
        const tags = { owner: owner };
        if (hasData) tags.data = data;
        return new Promise((resolve) => {
            try {
                new InfluxConnector(BUCKET).writePoint({ measurement: event, tags: tags, fields: { value: 1 } }, () => resolve());
            } catch (_e) {
                resolve();
            }
        });
    }

    static measurements() {
        // Derived from the single-source-of-truth taxonomy so the Influx
        // measurement list can never drift from statistics.js / emission sites.
        return EventTaxonomy.names();
    }

    writePoint(point, callback) {
        let called = false;
        const done = () => {
            if (called) return;
            called = true;
            if (typeof (callback) !== "function") return;
            try {
                callback([]);
            } catch (e) {
                console.log(`[influx] writePoint callback failed ${reasonOf(e)}`);
            }
        };
        try {
            const s = live();
            if (!s) return done();
            const measurement = point ? point.measurement : undefined;
            if (!isMeasurement(measurement)) {
                const length = (typeof measurement === "string") ? measurement.length : 0;
                console.log(`[influx] dropped non-taxonomy measurement (length ${length})`);
                return done();
            }
            const p = new Point(measurement);
            const tags = (point.tags && typeof point.tags === "object") ? point.tags : {};
            Object.keys(tags).forEach((k) => {
                const v = tags[k];
                if (v !== undefined && v !== null && v !== "") p.tag(k, String(v));
            });
            // The migrated field is float; an integer write is rejected with 422.
            // Distinct ns timestamps keep same-millisecond bursts as separate points.
            p.floatField("value", 1).timestamp(nextTimestamp());
            s.writeApi.writePoint(p);
            s.writeApi.flush()
                .then(done)
                .catch((e) => {
                    console.log(`[influx] write failed ${reasonOf(e)}`);
                    done();
                });
        } catch (e) {
            console.log(`[influx] write failed ${reasonOf(e)}`);
            done();
        }
    }

    // Counts per KPI since `start` (Date or Flux duration), for one owner or
    // for all owners (null). Always resolves {KPI:[n]}; zeros when disabled or
    // failed. The owner only ever reaches Flux as a template parameter.
    async countsByKpi(owner, start) {
        const r = await this.countsDetailed(owner, start);
        if (r.ok) return r.counts;
        if (r.reason !== "no_token") console.log(`[influx] query failed ${r.reason}`);
        return zeros();
    }

    // Read-only: countsByKpi with an explicit result. Optional {bucket, stop}
    // (bucket `stats` or `stats/autogen` only). Resolves {ok, reason, counts}
    // and never rejects; counts are zeros unless ok.
    async countsDetailed(owner, start, opts) {
        const bucket = readBucket(opts);
        if (!bucket) return { ok: false, reason: "bad_bucket", counts: zeros() };
        const out = zeros();
        try {
            const s = live();
            if (!s) return { ok: false, reason: "no_token", counts: out };
            const kpis = EventTaxonomy.names();
            const stop = rangeStop(opts);
            const q = (owner === null || typeof owner === "undefined")
                ? flux`from(bucket: ${bucket})
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._field == "value" and contains(value: r._measurement, set: ${kpis}))
  |> group(columns: ["_measurement"])
  |> count()`
                : flux`from(bucket: ${bucket})
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._field == "value" and contains(value: r._measurement, set: ${kpis}) and r.owner == ${String(owner)})
  |> group(columns: ["_measurement"])
  |> count()`;
            const rows = await withTimeout(s.queryApi.collectRows(q), QUERY_TIMEOUT_MS);
            rows.forEach((r) => {
                if (!r || !Object.prototype.hasOwnProperty.call(out, r._measurement)) return;
                const n = Number(r._value);
                out[r._measurement] = [(Number.isFinite(n) && n >= 0) ? Math.trunc(n) : 0];
            });
            return { ok: true, reason: null, counts: out };
        } catch (e) {
            return { ok: false, reason: reasonOf(e), counts: zeros() };
        }
    }

    // Read-only: number of `value` points across every measurement and owner
    // in [start, stop). Resolves {ok, reason, total}, never rejects.
    async countAll(start, opts) {
        const bucket = readBucket(opts);
        if (!bucket) return { ok: false, reason: "bad_bucket", total: 0 };
        try {
            const s = live();
            if (!s) return { ok: false, reason: "no_token", total: 0 };
            const q = flux`from(bucket: ${bucket})
  |> range(start: ${start}, stop: ${rangeStop(opts)})
  |> filter(fn: (r) => r._field == "value")
  |> group()
  |> count()`;
            const rows = await withTimeout(s.queryApi.collectRows(q), QUERY_TIMEOUT_MS);
            let total = 0;
            rows.forEach((r) => {
                const n = Number(r && r._value);
                if (Number.isFinite(n) && n >= 0) total += Math.trunc(n);
            });
            return { ok: true, reason: null, total: total };
        } catch (e) {
            return { ok: false, reason: reasonOf(e), total: 0 };
        }
    }

    // Read-only: how many distinct owner tag values have points since start.
    // Only the number leaves this method. Resolves {ok, reason, n}.
    async distinctOwners(start, opts) {
        const bucket = readBucket(opts);
        if (!bucket) return { ok: false, reason: "bad_bucket", n: 0 };
        try {
            const s = live();
            if (!s) return { ok: false, reason: "no_token", n: 0 };
            const q = flux`from(bucket: ${bucket})
  |> range(start: ${start})
  |> filter(fn: (r) => r._field == "value" and exists r.owner)
  |> keep(columns: ["owner"])
  |> group()
  |> distinct(column: "owner")
  |> count()`;
            const rows = await withTimeout(s.queryApi.collectRows(q), QUERY_TIMEOUT_MS);
            let n = 0;
            rows.forEach((r) => {
                const v = Number(r && r._value);
                if (Number.isFinite(v) && v >= 0) n += Math.trunc(v);
            });
            return { ok: true, reason: null, n: n };
        } catch (e) {
            return { ok: false, reason: reasonOf(e), n: 0 };
        }
    }

    async _period(owner, start, callback) {
        let body;
        try {
            body = (typeof owner === "string" && OWNER_RE.test(owner)) ? await this.countsByKpi(owner, start) : zeros();
        } catch (_e) {
            body = zeros();
        }
        if (typeof (callback) !== "function") return;
        try {
            callback(true, body);
        } catch (e) {
            console.log(`[influx] stats callback failed ${reasonOf(e)}`);
        }
    }

    /** Daily KPI counts for owner since local midnight: callback(true, {KPI:[n]}). */
    async today(owner, callback) {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        return this._period(owner, midnight, callback);
    }

    /** Weekly KPI counts for owner over the last 7 days: callback(true, {KPI:[n]}). */
    async week(owner, callback) {
        return this._period(owner, fluxDuration("-7d"), callback);
    }

    async _countOne(measurement, owner, callback) {
        let n = 0;
        try {
            if (isMeasurement(measurement) && (owner === null || (typeof owner === "string" && OWNER_RE.test(owner)))) {
                n = (await this.countsByKpi(owner, EPOCH))[measurement][0];
            }
        } catch (_e) {
            n = 0;
        }
        if (typeof (callback) !== "function") return;
        try {
            callback(n);
        } catch (e) {
            console.log(`[influx] count callback failed ${reasonOf(e)}`);
        }
    }

    /** All-time count of a taxonomy measurement across owners (spec helper): callback(n). */
    query(measurement, callback) {
        return this._countOne(measurement, null, callback);
    }

    /** All-time count of a taxonomy measurement for one owner (spec helper): callback(n). */
    queryOwner(measurement, owner, callback) {
        return this._countOne(measurement, owner, callback);
    }

    // Read-only: does `bucket` (`stats` default, or `stats/autogen`) exist in
    // the org, with which expire rule (0 = infinite), is the legacy bucket
    // present, and the sorted bucket names. Only GET calls; never rejects.
    static async bucketStatus(opts) {
        const result = (ok, reason, extra) => Object.assign({
            ok: ok, reason: reason, exists: false, retentionSeconds: 0, legacyPresent: false, names: []
        }, extra || {});
        const bucket = readBucket(opts);
        if (!bucket) return result(false, "bad_bucket");
        try {
            const token = readSecret("INFLUXDB_TOKEN");
            if (!token) return result(false, "no_token");
            const client = new InfluxDB({ url: influxUrl(), token: token, timeout: ENSURE_TIMEOUT_MS });
            const t = (fn) => withTimeout(attempt(fn), ENSURE_TIMEOUT_MS);
            const orgName = influxOrg();
            let orgs;
            try {
                orgs = await t(() => new OrgsAPI(client).getOrgs({ org: orgName }));
            } catch (e) {
                return result(false, (e && e.statusCode === 404) ? "no_org" : reasonOf(e));
            }
            const orgList = (orgs && Array.isArray(orgs.orgs)) ? orgs.orgs : [];
            const org = orgList.find((x) => x && x.name === orgName) || orgList[0];
            if (!org || !org.id) return result(false, "no_org");
            const res = await t(() => new BucketsAPI(client).getBuckets({ orgID: org.id, limit: 100 }));
            const list = (res && Array.isArray(res.buckets)) ? res.buckets : [];
            const names = list.map((b) => (b && typeof b.name === "string") ? b.name : "").filter((n) => n.length > 0).sort();
            const current = list.find((b) => b && b.name === bucket) || null;
            return result(true, null, {
                exists: current !== null,
                retentionSeconds: current ? expireSeconds(current) : 0,
                legacyPresent: names.indexOf(LEGACY_BUCKET) !== -1,
                names: names
            });
        } catch (e) {
            return result(false, reasonOf(e));
        }
    }

    // Boot step (D-03): converge the stats bucket to the declared retention.
    // `opts` are test seams only: {bucket, legacyBucket, retentionSeconds,
    // timeoutMs, url, token, org, apis:{orgs, buckets}}. Production passes nothing.
    static async ensureStatsBucket(opts) {
        const o = (opts && typeof opts === "object") ? opts : {};
        const bucket = (typeof o.bucket === "string" && o.bucket) ? o.bucket : BUCKET;
        const legacyBucket = (typeof o.legacyBucket === "string" && o.legacyBucket) ? o.legacyBucket : LEGACY_BUCKET;
        const retentionSeconds = (typeof o.retentionSeconds === "number" && o.retentionSeconds > 0) ? o.retentionSeconds : RETENTION_SECONDS;
        const timeoutMs = (typeof o.timeoutMs === "number" && o.timeoutMs > 0) ? o.timeoutMs : ENSURE_TIMEOUT_MS;

        const finish = (ok, action, reason) => {
            console.log(`[influx] ensure bucket=${bucket} action=${action} reason=${reason || "-"}`);
            return { ok: ok, action: action, reason: reason || null };
        };

        try {
            const token = Object.prototype.hasOwnProperty.call(o, "token") ? o.token : readSecret("INFLUXDB_TOKEN");
            if (!token) return finish(false, "skipped", "no_token");

            let apis = o.apis;
            if (!apis) {
                const client = new InfluxDB({ url: o.url || influxUrl(), token: token, timeout: timeoutMs });
                apis = { orgs: new OrgsAPI(client), buckets: new BucketsAPI(client) };
            }
            const t = (fn) => withTimeout(attempt(fn), timeoutMs);
            const orgName = o.org || influxOrg();

            let orgs;
            try {
                orgs = await t(() => apis.orgs.getOrgs({ org: orgName }));
            } catch (e) {
                return finish(false, "skipped", (e && e.statusCode === 404) ? "no_org" : reasonOf(e));
            }
            const orgList = (orgs && Array.isArray(orgs.orgs)) ? orgs.orgs : [];
            const org = orgList.find((x) => x && x.name === orgName) || orgList[0];
            if (!org || !org.id) return finish(false, "skipped", "no_org");
            const orgID = org.id;

            // getBuckets answers HTTP 404 when the name is absent.
            const find = async (name) => {
                try {
                    const res = await t(() => apis.buckets.getBuckets({ orgID: orgID, name: name }));
                    const list = (res && Array.isArray(res.buckets)) ? res.buckets : [];
                    return list.find((b) => b && b.name === name) || null;
                } catch (e) {
                    if (e && e.statusCode === 404) return null;
                    throw e;
                }
            };

            let current;
            try {
                current = await find(bucket);
            } catch (e) {
                return finish(false, "skipped", reasonOf(e));
            }
            let legacy = null;
            if (legacyBucket !== bucket) {
                try {
                    legacy = await find(legacyBucket);
                } catch (e) {
                    if (!current) return finish(false, "skipped", reasonOf(e));
                    legacy = null;
                }
            }

            const rules = [{ type: "expire", everySeconds: retentionSeconds }];

            if (current) {
                // Both present means the history may sit in the legacy bucket (Pitfall 1).
                const note = legacy ? "legacy_present" : null;
                if (expireSeconds(current) === retentionSeconds) return finish(true, "unchanged", note);
                try {
                    await t(() => apis.buckets.patchBucketsID({ bucketID: current.id, body: { retentionRules: rules } }));
                } catch (e) {
                    return finish(false, "failed", reasonOf(e));
                }
                return finish(true, "updated", note);
            }

            if (legacy) {
                try {
                    await t(() => apis.buckets.patchBucketsID({ bucketID: legacy.id, body: { name: bucket, retentionRules: rules } }));
                } catch (e) {
                    return finish(false, "failed", reasonOf(e));
                }
                return finish(true, "adopted", null);
            }

            try {
                await t(() => apis.buckets.postBuckets({ body: { orgID: orgID, name: bucket, retentionRules: rules } }));
            } catch (e) {
                return finish(false, "failed", reasonOf(e));
            }
            return finish(true, "created", null);
        } catch (e) {
            return finish(false, "failed", reasonOf(e));
        }
    }

    // Test seam: close the WriteApi (best effort, bounded) and clear the module
    // state and the "disabled" log latch.
    static _resetForTests() {
        const s = state;
        state = undefined;
        disabledLogged = false;
        if (!s || !s.writeApi) return Promise.resolve();
        let closing;
        try {
            closing = Promise.resolve(s.writeApi.close());
        } catch (_e) {
            closing = Promise.resolve();
        }
        return withTimeout(closing, RESET_TIMEOUT_MS).then(() => undefined, () => undefined);
    }
};
