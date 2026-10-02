/*
 * StatisticsV2Spec.js — Phase 27-03 (OPS-INFLUX-02, research F-1, D-10)
 *
 * Proves that points stored in InfluxDB 2 reach the dashboard / Visits KPIs:
 *   InfluxConnector.week/today → Statistics.week_V2/today_V2 → the router's
 *   (success, body) callback → Util.responder → {"success":true,"response":{KPI:[n]}}.
 *
 * Before 27-03 the V2 wrappers forwarded only the first callback argument, so
 * the routes always answered the empty-result failure whatever was stored.
 *
 *   - seeded counts come back per KPI, keyed by exactly EventTaxonomy.names();
 *   - another owner's points are never counted;
 *   - an invalid (quote-bearing) owner answers zeros, never throws;
 *   - with no INFLUXDB_TOKEN the answer is still success with all-zero KPIs.
 *
 * Needs INFLUXDB_URL and INFLUXDB_TOKEN pointing at an InfluxDB 2 instance
 * that has org `thinx` (CI: docker-compose.test.yml influxdb + influxdb-setup).
 * Non-ZZ on purpose: CI deletes ZZ specs. Owners are random synthetic 64-hex
 * values and are never printed.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const crypto = require('crypto');
const expect = require('chai').expect;
const InfluxConnector = require('../../lib/thinx/influx');
const Statistics = require('../../lib/thinx/statistics');
const EventTaxonomy = require('../../lib/thinx/event_taxonomy');
const Util = require('../../lib/thinx/util');
const secrets = require('../../lib/thinx/secrets');

const INJECTION = 'x") |> yield(name: "pwn';

const syntheticOwner = () => crypto.randomBytes(32).toString("hex");

async function reset() {
    await InfluxConnector._resetForTests();
    secrets._resetCacheForTests();
}

// statsLog prints the owner; this spec never echoes owners. Connector
// diagnostics (`[influx] …` lines: short reason tokens, no owner, no URL) are
// kept in `influxLines` so a failed assertion can say why a write was lost.
const influxLines = [];
async function quiet(fn) {
    const saved = { log: console.log, warn: console.warn, error: console.error };
    const keep = (...args) => {
        const line = args.map((a) => String(a)).join(" ");
        if (line.indexOf("[influx]") !== -1 && line.indexOf("[OID:") === -1) influxLines.push(line);
    };
    console.log = keep; console.warn = keep; console.error = keep;
    try {
        return await fn();
    } finally {
        console.log = saved.log; console.warn = saved.warn; console.error = saved.error;
    }
}

// The Statistics constructor also prepares the legacy file-ETL folder under
// data_root (/mnt/data), which does not exist on a developer host. The V2
// methods only need the connector, so the instance is built from the
// prototype with the same `influx` member the constructor assigns.
function v2Statistics() {
    const stats = Object.create(Statistics.prototype);
    stats.influx = new InfluxConnector('stats');
    return stats;
}

// Calls a V2 method exactly the way lib/router.user.js does: (success, body).
const call = (stats, method, owner) => quiet(() => new Promise((resolve) => {
    stats[method](owner, (success, body) => resolve({ success, body }));
}));

function expectCounts(body, expected) {
    expect(body, "body").to.be.an('object');
    expect(Object.keys(body)).to.deep.equal(EventTaxonomy.names());
    EventTaxonomy.names().forEach((k) => {
        const n = Object.prototype.hasOwnProperty.call(expected, k) ? expected[k] : 0;
        expect(body[k], `${k} (connector: ${influxLines.join(" | ") || "-"})`).to.deep.equal([n]);
    });
}

function fakeRes() {
    const res = { headers: {}, text: null };
    res.header = (k, v) => { res.headers[k] = v; };
    res.end = (s) => { res.text = String(s); };
    return res;
}

describe("Statistics V2 (InfluxDB 2)", function () {

    const ownerA = syntheticOwner();
    const ownerB = syntheticOwner();
    let stats;
    let rejections;
    const collect = (reason) => { rejections.push(reason); };

    beforeAll(async () => {
        expect(process.env.INFLUXDB_URL, "INFLUXDB_URL must point at an InfluxDB 2 instance").to.be.a('string');
        expect(process.env.INFLUXDB_TOKEN, "INFLUXDB_TOKEN must be set").to.be.a('string').and.not.equal("");
        rejections = [];
        process.on('unhandledRejection', collect);
        await reset();
        await quiet(() => InfluxConnector.ensureStatsBucket());
        await quiet(async () => {
            await InfluxConnector.statsLog(ownerA, "DEVICE_CHECKIN", "udid-synthetic");
            await InfluxConnector.statsLog(ownerA, "DEVICE_CHECKIN", "udid-synthetic");
            await InfluxConnector.statsLog(ownerA, "BUILD_SUCCESS", "build-synthetic");
            for (let i = 0; i < 3; i++) await InfluxConnector.statsLog(ownerB, "DEVICE_CHECKIN", "udid-synthetic");
        });
        stats = v2Statistics();
    }, 30000);

    afterAll(async () => {
        process.removeListener('unhandledRejection', collect);
        await reset();
    });

    it("week_V2 calls back (true, {KPI:[n]}) with the owner's seeded counts", async function () {
        const { success, body } = await call(stats, "week_V2", ownerA);
        expect(success).to.equal(true);
        expectCounts(body, { DEVICE_CHECKIN: 2, BUILD_SUCCESS: 1 });
    }, 15000);

    it("today_V2 calls back (true, {KPI:[n]}) with the owner's seeded counts", async function () {
        const { success, body } = await call(stats, "today_V2", ownerA);
        expect(success).to.equal(true);
        expectCounts(body, { DEVICE_CHECKIN: 2, BUILD_SUCCESS: 1 });
    }, 15000);

    it("another owner's points are never counted", async function () {
        const a = await call(stats, "week_V2", ownerA);
        const b = await call(stats, "week_V2", ownerB);
        expect(a.body.DEVICE_CHECKIN).to.deep.equal([2]);
        expect(b.body.DEVICE_CHECKIN).to.deep.equal([3]);
        expect(b.body.BUILD_SUCCESS).to.deep.equal([0]);
    }, 15000);

    it("the router path renders {success:true, response:body} through Util.responder", async function () {
        const { success, body } = await call(stats, "week_V2", ownerA);
        expect(body, "router would answer the empty-result failure").to.be.an('object');
        const res = fakeRes();
        Util.responder(res, success, body);
        expect(res.text).to.be.a('string');
        expect(JSON.parse(res.text)).to.deep.equal({ success: true, response: body });
    }, 15000);

    it("an invalid owner answers (true, all zeros) without throwing", async function () {
        const week = await call(stats, "week_V2", INJECTION);
        const today = await call(stats, "today_V2", INJECTION);
        expect(week.success).to.equal(true);
        expect(today.success).to.equal(true);
        expectCounts(week.body, {});
        expectCounts(today.body, {});
    }, 15000);

    describe("without INFLUXDB_TOKEN", function () {

        let savedToken;

        beforeEach(async () => {
            savedToken = process.env.INFLUXDB_TOKEN;
            delete process.env.INFLUXDB_TOKEN;
            await reset();
        });

        afterEach(async () => {
            if (typeof savedToken !== "undefined") process.env.INFLUXDB_TOKEN = savedToken;
            await reset();
        });

        it("week_V2 and today_V2 answer success with all-zero KPIs (D-10)", async function () {
            const s = v2Statistics();
            const week = await call(s, "week_V2", ownerA);
            const today = await call(s, "today_V2", ownerA);
            expect(week.success).to.equal(true);
            expect(today.success).to.equal(true);
            expectCounts(week.body, {});
            expectCounts(today.body, {});
        }, 15000);
    });

    it("leaves no unhandled rejection behind", function () {
        expect(rejections.length).to.equal(0);
    });
});
