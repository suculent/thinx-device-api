/*
 * InfluxRetentionSpec.js — Phase 27 (D-03, D-04, OPS-INFLUX-03)
 *
 * Replaces the Rollbar #1794 guard for the 1.x retention policy with the
 * D-03 guard for the InfluxDB 2 boot step: InfluxConnector.ensureStatsBucket()
 * converges bucket `stats` to a 90-day expire rule (7776000 s), never
 * rejects, and logs exactly one `[influx] ensure bucket=` line per call.
 *
 *   - Unit (fake `opts.apis`, no InfluxDB): every branch — skipped (no token,
 *     no org, timeout), created, adopted, updated, unchanged, failed (422),
 *     and the `legacy_present` warning — with no token or URL in any line.
 *   - Live (INFLUXDB_URL / INFLUXDB_TOKEN, an InfluxDB 2 with org `thinx`):
 *     scratch buckets `p27spec-stats` and `p27spec-stats/autogen` walk
 *     created → unchanged → updated → adopted (same bucket id); the real
 *     `stats` bucket ends at 7776000; an unreachable URL is skipped in
 *     bounded time.
 *
 * An unhandledRejection collector stays armed for the whole file.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const { expect } = require('chai');
const { InfluxDB } = require('@influxdata/influxdb-client');
const { BucketsAPI, OrgsAPI } = require('@influxdata/influxdb-client-apis');
const InfluxConnector = require('../../lib/thinx/influx');

const NINETY_DAYS = 7776000;
const FAKE_TOKEN = "fake-token-p27-must-not-be-logged";
const SCRATCH = "p27spec-stats";
const SCRATCH_LEGACY = "p27spec-stats/autogen";

const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

// Error shaped like the client's HttpError; the message carries a URL so a
// leak into the log line would be visible.
function httpError(statusCode) {
    return Object.assign(new Error(`HTTP ${statusCode} http://influx.invalid/api/v2 ${FAKE_TOKEN}`), { statusCode: statusCode });
}

const expire = (seconds) => [{ type: "expire", everySeconds: seconds }];

// Fake {orgs, buckets} APIs: buckets live in a name → bucket map; any method
// can be overridden. Every call is recorded.
function fakeApis(setup) {
    const s = setup || {};
    const calls = [];
    const store = Object.assign({}, s.buckets || {});
    const apis = {
        orgs: {
            getOrgs: (q) => {
                calls.push(["getOrgs", q]);
                return Promise.resolve({ orgs: (typeof s.orgs === "undefined") ? [{ id: "org-1", name: "thinx" }] : s.orgs });
            }
        },
        buckets: {
            getBuckets: (q) => {
                calls.push(["getBuckets", q]);
                if (s.getBuckets) return s.getBuckets(q);
                const b = store[q.name];
                return b ? Promise.resolve({ buckets: [b] }) : Promise.reject(httpError(404));
            },
            postBuckets: (r) => {
                calls.push(["postBuckets", r]);
                return s.postBuckets ? s.postBuckets(r) : Promise.resolve(Object.assign({ id: "new-1" }, r.body));
            },
            patchBucketsID: (r) => {
                calls.push(["patchBucketsID", r]);
                return s.patchBucketsID ? s.patchBucketsID(r) : Promise.resolve({ id: r.bucketID });
            }
        }
    };
    const writes = () => calls.filter((c) => c[0] === "postBuckets" || c[0] === "patchBucketsID");
    return { apis, calls, writes };
}

// Calls ensureStatsBucket with console output captured; asserts the
// one-line, no-secret logging contract on every call.
async function ensure(opts) {
    const lines = [];
    const saved = console.log;
    console.log = (...args) => { lines.push(args.map((a) => String(a)).join(" ")); };
    let result;
    try {
        result = await InfluxConnector.ensureStatsBucket(opts);
    } finally {
        console.log = saved;
    }
    const ensureLines = lines.filter((l) => l.indexOf("[influx] ensure bucket=") !== -1);
    expect(ensureLines.length, "exactly one ensure line").to.equal(1);
    expect(ensureLines[0]).to.equal(`[influx] ensure bucket=${(opts && opts.bucket) || "stats"} action=${result.action} reason=${result.reason || "-"}`);
    lines.forEach((l) => {
        expect(l).to.not.include(FAKE_TOKEN);
        if (process.env.INFLUXDB_TOKEN) expect(l).to.not.include(process.env.INFLUXDB_TOKEN);
        expect(l).to.not.include("http");
    });
    return result;
}

describe("InfluxDB 2 stats bucket ensure", function () {

    let rejections = [];
    const collect = (reason) => rejections.push(reason);

    beforeAll(() => {
        process.on('unhandledRejection', collect);
    });

    afterAll(() => {
        process.removeListener('unhandledRejection', collect);
    });

    beforeEach(() => {
        rejections = [];
    });

    afterEach(async () => {
        await settle();
        expect(rejections.map((r) => String(r && (r.statusCode || r.code) || r))).to.deep.equal([]);
    });

    describe("unit (fake apis)", function () {

        it("skips without a token and calls nothing", async function () {
            const f = fakeApis();
            const r = await ensure({ token: null, apis: f.apis });
            expect(r).to.deep.equal({ ok: false, action: "skipped", reason: "no_token" });
            expect(f.calls).to.deep.equal([]);
        });

        it("skips when the org does not exist", async function () {
            const f = fakeApis({ orgs: [] });
            const r = await ensure({ token: FAKE_TOKEN, apis: f.apis });
            expect(r).to.deep.equal({ ok: false, action: "skipped", reason: "no_org" });
            expect(f.writes()).to.deep.equal([]);
        });

        it("creates stats at 90 days when neither stats nor stats/autogen exists", async function () {
            const f = fakeApis();
            const r = await ensure({ token: FAKE_TOKEN, apis: f.apis });
            expect(r).to.deep.equal({ ok: true, action: "created", reason: null });
            expect(f.writes()).to.deep.equal([
                ["postBuckets", { body: { orgID: "org-1", name: "stats", retentionRules: expire(NINETY_DAYS) } }]
            ]);
        });

        it("adopts stats/autogen by renaming it in place when stats is absent", async function () {
            const f = fakeApis({ buckets: { "stats/autogen": { id: "legacy-1", name: "stats/autogen", retentionRules: [] } } });
            const r = await ensure({ token: FAKE_TOKEN, apis: f.apis });
            expect(r).to.deep.equal({ ok: true, action: "adopted", reason: null });
            expect(f.writes()).to.deep.equal([
                ["patchBucketsID", { bucketID: "legacy-1", body: { name: "stats", retentionRules: expire(NINETY_DAYS) } }]
            ]);
        });

        it("updates a drifted retention with a retentionRules-only patch", async function () {
            const f = fakeApis({ buckets: { stats: { id: "stats-1", name: "stats", retentionRules: expire(86400) } } });
            const r = await ensure({ token: FAKE_TOKEN, apis: f.apis });
            expect(r).to.deep.equal({ ok: true, action: "updated", reason: null });
            expect(f.writes()).to.deep.equal([
                ["patchBucketsID", { bucketID: "stats-1", body: { retentionRules: expire(NINETY_DAYS) } }]
            ]);
        });

        it("leaves a converged bucket unchanged with no write", async function () {
            const f = fakeApis({ buckets: { stats: { id: "stats-1", name: "stats", retentionRules: expire(NINETY_DAYS) } } });
            const r = await ensure({ token: FAKE_TOKEN, apis: f.apis });
            expect(r).to.deep.equal({ ok: true, action: "unchanged", reason: null });
            expect(f.writes()).to.deep.equal([]);
        });

        it("reports failed/422 when the patch is refused, without rejecting", async function () {
            const f = fakeApis({
                buckets: { stats: { id: "stats-1", name: "stats", retentionRules: expire(86400) } },
                patchBucketsID: () => Promise.reject(httpError(422))
            });
            const r = await ensure({ token: FAKE_TOKEN, apis: f.apis });
            expect(r).to.deep.equal({ ok: false, action: "failed", reason: "422" });
        });

        it("skips with reason timeout when a lookup never settles", async function () {
            const f = fakeApis({ getBuckets: () => new Promise(() => { /* never settles */ }) });
            const started = Date.now();
            const r = await ensure({ token: FAKE_TOKEN, apis: f.apis, timeoutMs: 200 });
            expect(Date.now() - started).to.be.below(1000);
            expect(r).to.deep.equal({ ok: false, action: "skipped", reason: "timeout" });
            expect(f.writes()).to.deep.equal([]);
        });

        it("flags legacy_present when both stats and stats/autogen exist", async function () {
            const f = fakeApis({
                buckets: {
                    stats: { id: "stats-1", name: "stats", retentionRules: expire(NINETY_DAYS) },
                    "stats/autogen": { id: "legacy-1", name: "stats/autogen", retentionRules: [] }
                }
            });
            const r = await ensure({ token: FAKE_TOKEN, apis: f.apis });
            expect(r).to.deep.equal({ ok: true, action: "unchanged", reason: "legacy_present" });
            expect(f.writes()).to.deep.equal([]);
        });
    });

    describe("live (InfluxDB 2)", function () {

        let buckets;
        let orgID;

        const findBucket = async (name) => {
            try {
                const res = await buckets.getBuckets({ orgID: orgID, name: name });
                return (res.buckets || []).find((b) => b.name === name) || null;
            } catch (e) {
                if (e && e.statusCode === 404) return null;
                throw e;
            }
        };
        const dropBucket = async (name) => {
            const b = await findBucket(name);
            if (b) await buckets.deleteBucketsID({ bucketID: b.id });
        };
        const retentionOf = (b) => {
            const rule = (b.retentionRules || []).find((x) => x.type === "expire");
            return rule ? rule.everySeconds : 0;
        };
        const scratch = { bucket: SCRATCH, legacyBucket: SCRATCH_LEGACY };

        beforeAll(async () => {
            expect(process.env.INFLUXDB_URL, "INFLUXDB_URL must point at an InfluxDB 2 instance").to.be.a('string');
            expect(process.env.INFLUXDB_TOKEN, "INFLUXDB_TOKEN must be set").to.be.a('string');
            const client = new InfluxDB({ url: process.env.INFLUXDB_URL, token: process.env.INFLUXDB_TOKEN });
            buckets = new BucketsAPI(client);
            const orgs = await new OrgsAPI(client).getOrgs({ org: process.env.INFLUXDB_ORG || "thinx" });
            orgID = orgs.orgs[0].id;
            await dropBucket(SCRATCH);
            await dropBucket(SCRATCH_LEGACY);
        }, 30000);

        afterAll(async () => {
            if (!buckets) return;
            await dropBucket(SCRATCH).catch(() => { /* best effort */ });
            await dropBucket(SCRATCH_LEGACY).catch(() => { /* best effort */ });
        }, 30000);

        it("creates an absent bucket at 90 days", async function () {
            const r = await ensure(scratch);
            expect(r).to.deep.equal({ ok: true, action: "created", reason: null });
            expect(retentionOf(await findBucket(SCRATCH))).to.equal(NINETY_DAYS);
        });

        it("is unchanged on the next boot", async function () {
            const r = await ensure(scratch);
            expect(r).to.deep.equal({ ok: true, action: "unchanged", reason: null });
        });

        it("repairs a drifted retention", async function () {
            const b = await findBucket(SCRATCH);
            await buckets.patchBucketsID({ bucketID: b.id, body: { retentionRules: expire(86400) } });
            expect(retentionOf(await findBucket(SCRATCH))).to.equal(86400);
            const r = await ensure(scratch);
            expect(r).to.deep.equal({ ok: true, action: "updated", reason: null });
            expect(retentionOf(await findBucket(SCRATCH))).to.equal(NINETY_DAYS);
        });

        it("adopts the legacy bucket in place, keeping its id", async function () {
            await dropBucket(SCRATCH);
            const legacy = await buckets.postBuckets({ body: { orgID: orgID, name: SCRATCH_LEGACY, retentionRules: [] } });
            expect(retentionOf(legacy)).to.equal(0);
            const r = await ensure(scratch);
            expect(r).to.deep.equal({ ok: true, action: "adopted", reason: null });
            const adopted = await findBucket(SCRATCH);
            expect(adopted.id).to.equal(legacy.id);
            expect(retentionOf(adopted)).to.equal(NINETY_DAYS);
            expect(await findBucket(SCRATCH_LEGACY)).to.equal(null);
        });

        it("converges the real stats bucket to 90 days", async function () {
            const r = await ensure();
            expect(r.ok).to.equal(true);
            expect(["updated", "unchanged"]).to.include(r.action);
            expect(retentionOf(await findBucket("stats"))).to.equal(NINETY_DAYS);
        });

        it("skips an unreachable server in bounded time", async function () {
            const started = Date.now();
            const r = await ensure({ url: "http://127.0.0.1:9" });
            expect(Date.now() - started).to.be.below(6000);
            expect(r.ok).to.equal(false);
            expect(r.action).to.equal("skipped");
        }, 15000);
    });
});
