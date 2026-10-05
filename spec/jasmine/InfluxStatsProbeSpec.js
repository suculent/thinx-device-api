/*
 * InfluxStatsProbeSpec.js — Phase 27-03 (OPS-INFLUX-02, evidence tooling for
 * success criteria 1, 2 and 4)
 *
 * Pins the CLI contract of scripts/influx-stats-probe.js, the read-only,
 * aggregate-only production probe, and the read-only connector helpers it
 * uses (bucketStatus, countsDetailed, countAll, distinctOwners):
 *   - OK path: exit 0, `INFLUX-STATS-PROBE OK`, retention 7776000, counts;
 *   - every output line is `key=value` (or the final line), and the output
 *     never holds the token, the string `http` or a 64-hex value;
 *   - an absolute window adds count_window_total and 8 count_window_<KPI>;
 *   - usage errors exit 2; an absent bucket, no token and an outage exit 1
 *     with a short reason token;
 *   - the probe never creates or patches a bucket.
 *
 * Needs INFLUXDB_URL and INFLUXDB_TOKEN pointing at an InfluxDB 2 instance
 * that has org `thinx` (CI: docker-compose.test.yml influxdb + influxdb-setup).
 * Owners are random synthetic 64-hex values and are never printed.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const expect = require('chai').expect;
const { InfluxDB } = require('@influxdata/influxdb-client');
const { BucketsAPI, OrgsAPI } = require('@influxdata/influxdb-client-apis');
const InfluxConnector = require('../../lib/thinx/influx');
const EventTaxonomy = require('../../lib/thinx/event_taxonomy');
const secrets = require('../../lib/thinx/secrets');

const ROOT = path.join(__dirname, "../..");
const PROBE = "scripts/influx-stats-probe.js";
// key=value; keys are lower-case, optionally ending in an upper-case taxonomy
// name (count_7d_DEVICE_CHECKIN). The plan's literal `^[a-z0-9_]+=` cannot
// match its own count_<period>_<KPI> keys.
const LINE = /^[a-z0-9_]+(?:[A-Z][A-Z_]*)?=\S*$/;
const FINAL = /^INFLUX-STATS-PROBE (OK|FAIL reason=[A-Za-z0-9_.-]+)$/;
const HEX64 = /[0-9a-f]{64}/;

const syntheticOwner = () => crypto.randomBytes(32).toString("hex");

async function reset() {
    await InfluxConnector._resetForTests();
    secrets._resetCacheForTests();
}

async function quiet(fn) {
    const saved = { log: console.log, warn: console.warn, error: console.error };
    const drop = () => { };
    console.log = drop; console.warn = drop; console.error = drop;
    try {
        return await fn();
    } finally {
        console.log = saved.log; console.warn = saved.warn; console.error = saved.error;
    }
}

// Child env: the parent env without any INFLUXDB_* value, plus `extra`.
function childEnv(extra) {
    const env = {};
    Object.keys(process.env).forEach((k) => { if (k.indexOf("INFLUXDB_") !== 0) env[k] = process.env[k]; });
    return Object.assign(env, extra || {});
}

function probe(args, env) {
    const r = spawnSync(process.execPath, [PROBE].concat(args || []), { cwd: ROOT, env: env, timeout: 30000, encoding: "utf8" });
    const out = String(r.stdout || "") + String(r.stderr || "");
    const lines = out.split("\n").filter((l) => l.length > 0);
    return { status: r.status, signal: r.signal, out: out, lines: lines, last: lines[lines.length - 1] || "" };
}

function value(lines, key) {
    const line = lines.find((l) => l.indexOf(key + "=") === 0);
    return line ? line.substring(key.length + 1) : undefined;
}

function expectHygiene(r, token) {
    expect(r.out.indexOf("http"), "output holds a URL").to.equal(-1);
    if (token) expect(r.out.indexOf(token), "output holds the token").to.equal(-1);
    expect(HEX64.test(r.out), "output holds a 64-hex value").to.equal(false);
}

// Bucket list with ids and update stamps, read through the admin API.
async function bucketSnapshot() {
    const client = new InfluxDB({ url: process.env.INFLUXDB_URL, token: process.env.INFLUXDB_TOKEN, timeout: 5000 });
    const orgs = await new OrgsAPI(client).getOrgs({ org: process.env.INFLUXDB_ORG || "thinx" });
    const orgID = orgs.orgs[0].id;
    const res = await new BucketsAPI(client).getBuckets({ orgID: orgID, limit: 100 });
    return res.buckets.map((b) => `${b.id}|${b.name}|${b.updatedAt}|${JSON.stringify(b.retentionRules)}`).sort();
}

describe("InfluxDB stats probe CLI", function () {

    const URL = process.env.INFLUXDB_URL;
    const TOKEN = process.env.INFLUXDB_TOKEN;
    const liveEnv = () => childEnv({ INFLUXDB_URL: URL, INFLUXDB_TOKEN: TOKEN });

    beforeAll(async () => {
        expect(URL, "INFLUXDB_URL must point at an InfluxDB 2 instance").to.be.a('string');
        expect(TOKEN, "INFLUXDB_TOKEN must be set").to.be.a('string').and.not.equal("");
        await reset();
        await quiet(async () => {
            await InfluxConnector.ensureStatsBucket();
            await InfluxConnector.statsLog(syntheticOwner(), "DEVICE_CHECKIN", "probe-synthetic");
        });
    }, 30000);

    afterAll(async () => {
        await reset();
    });

    it("prints key=value aggregates and ends INFLUX-STATS-PROBE OK", function () {
        const r = probe([], liveEnv());
        expect(r.status, r.last).to.equal(0);
        expect(r.last).to.equal("INFLUX-STATS-PROBE OK");
        expect(value(r.lines, "token_present")).to.equal("1");
        expect(value(r.lines, "bucket")).to.equal("stats");
        expect(value(r.lines, "bucket_exists")).to.equal("1");
        expect(value(r.lines, "bucket_retention_s")).to.equal("7776000");
        expect(value(r.lines, "legacy_bucket_present")).to.equal("0");
        expect(value(r.lines, "bucket_names").split(",")).to.include("stats");
        expect(Number(value(r.lines, "count_all_total"))).to.be.at.least(1);
        ["all", "90d", "7d", "24h", "10m"].forEach((p) => {
            EventTaxonomy.names().forEach((k) => {
                const v = value(r.lines, `count_${p}_${k}`);
                expect(v, `count_${p}_${k}`).to.match(/^[0-9]+$/);
            });
        });
        expect(Number(value(r.lines, "count_10m_DEVICE_CHECKIN"))).to.be.at.least(1);
        expect(value(r.lines, "owners_7d")).to.match(/^[1-9][0-9]*$/);
        r.lines.slice(0, -1).forEach((l) => expect(LINE.test(l), l).to.equal(true));
        expect(FINAL.test(r.last)).to.equal(true);
        expectHygiene(r, TOKEN);
    }, 30000);

    it("adds count_window_total and 8 count_window_<KPI> lines for an absolute window", function () {
        const start = new Date(Date.now() - 3600 * 1000).toISOString();
        const stop = new Date(Date.now() + 60 * 1000).toISOString();
        const r = probe(["--window-start", start, "--window-stop", stop], liveEnv());
        expect(r.status, r.last).to.equal(0);
        expect(value(r.lines, "window")).to.equal(`${start}/${stop}`);
        expect(Number(value(r.lines, "count_window_total"))).to.be.at.least(1);
        const windowKpis = r.lines.filter((l) => /^count_window_[A-Z_]+=/.test(l));
        expect(windowKpis.length).to.equal(8);
        EventTaxonomy.names().forEach((k) => expect(value(r.lines, `count_window_${k}`), k).to.match(/^[0-9]+$/));
        r.lines.slice(0, -1).forEach((l) => expect(LINE.test(l), l).to.equal(true));
        expectHygiene(r, TOKEN);
    }, 30000);

    [
        ["an unknown bucket", ["--bucket", "bogus"]],
        ["only one window flag", ["--window-start", "2026-01-01T00:00:00Z"]],
        ["an unparseable ISO time", ["--window-start", "yesterday", "--window-stop", "2026-01-01T00:00:00Z"]],
        ["start not before stop", ["--window-start", "2026-01-02T00:00:00Z", "--window-stop", "2026-01-01T00:00:00Z"]],
        ["an unknown flag", ["--write"]]
    ].forEach(([label, args]) => {
        it(`exits 2 with usage for ${label}`, function () {
            const r = probe(args, liveEnv());
            expect(r.status).to.equal(2);
            expect(r.out).to.contain("usage:");
            expect(r.last).to.equal("INFLUX-STATS-PROBE FAIL reason=usage");
            expectHygiene(r, TOKEN);
        }, 30000);
    });

    it("exits 1 with reason=bucket_absent for an absent stats/autogen", function () {
        const r = probe(["--bucket", "stats/autogen"], liveEnv());
        expect(r.status).to.equal(1);
        expect(value(r.lines, "bucket_exists")).to.equal("0");
        expect(r.last).to.equal("INFLUX-STATS-PROBE FAIL reason=bucket_absent");
        expectHygiene(r, TOKEN);
    }, 30000);

    it("exits 1 with token_present=0 and reason=no_token without a token", function () {
        const r = probe([], childEnv({ INFLUXDB_URL: URL }));
        expect(r.status).to.equal(1);
        expect(value(r.lines, "token_present")).to.equal("0");
        expect(r.last).to.equal("INFLUX-STATS-PROBE FAIL reason=no_token");
        expectHygiene(r, TOKEN);
    }, 30000);

    it("exits 1 within 20 s with a short reason and no URL when InfluxDB is unreachable", function () {
        const started = Date.now();
        const r = probe([], childEnv({ INFLUXDB_URL: "http://127.0.0.1:9", INFLUXDB_TOKEN: TOKEN }));
        expect(Date.now() - started).to.be.below(20000);
        expect(r.status).to.equal(1);
        expect(FINAL.test(r.last), r.last).to.equal(true);
        expect(r.last).to.match(/^INFLUX-STATS-PROBE FAIL reason=/);
        expectHygiene(r, TOKEN);
    }, 30000);

    it("never creates or patches a bucket", async function () {
        const before = await bucketSnapshot();
        const r = probe([], liveEnv());
        probe(["--bucket", "stats/autogen"], liveEnv());
        const after = await bucketSnapshot();
        expect(r.status).to.equal(0);
        expect(after).to.deep.equal(before);
        const source = fs.readFileSync(path.join(ROOT, PROBE), "utf8");
        expect(source).not.to.match(/ensureStatsBucket|postBuckets|patchBuckets|writePoint|statsLog|getWriteApi/);
    }, 30000);

    describe("connector read-only helpers", function () {

        it("reject any bucket other than stats and stats/autogen with bad_bucket", async function () {
            const status = await InfluxConnector.bucketStatus({ bucket: "_monitoring" });
            expect(status.ok).to.equal(false);
            expect(status.reason).to.equal("bad_bucket");
            const influx = new InfluxConnector('stats');
            const counts = await influx.countsDetailed(null, new Date(0), { bucket: "_tasks" });
            expect(counts.ok).to.equal(false);
            expect(counts.reason).to.equal("bad_bucket");
            const all = await influx.countAll(new Date(0), { bucket: "other" });
            expect(all).to.deep.equal({ ok: false, reason: "bad_bucket", total: 0 });
            const owners = await influx.distinctOwners(new Date(0), { bucket: "other" });
            expect(owners).to.deep.equal({ ok: false, reason: "bad_bucket", n: 0 });
        });

        it("bucketStatus reports the stats bucket, its retention and sorted names", async function () {
            const status = await InfluxConnector.bucketStatus();
            expect(status.ok).to.equal(true);
            expect(status.exists).to.equal(true);
            expect(status.retentionSeconds).to.equal(7776000);
            expect(status.legacyPresent).to.equal(false);
            expect(status.names).to.deep.equal(status.names.slice().sort());
            expect(status.names).to.include("stats");
        });
    });
});
