/*
 * InfluxSpec.js — Phase 27 (OPS-INFLUX-02, D-03, D-09, D-10, D-12)
 *
 * Proves the InfluxDB 2 connector (lib/thinx/influx.js) end to end against a
 * real InfluxDB 2 server:
 *   - the server really is v2 (`[influx-spec] server_version=` line, read by CI);
 *   - the boot ensure converges bucket `stats`;
 *   - statsLog writes one point per EventTaxonomy measurement (write → flush →
 *     Flux count), keeps the `[OID:<owner>] [<EVENT>]` console line, and never
 *     appends " undefined" when no data is given;
 *   - non-taxonomy measurements are dropped, never written;
 *   - today/week answer {KPI:[n]} keyed by exactly the taxonomy names, isolated
 *     per owner, and a quote-bearing owner can never alter the Flux query;
 *   - with no INFLUXDB_TOKEN stats are disabled (one log line, zeros, no-ops);
 *   - with InfluxDB unreachable every call finishes in bounded time, with no
 *     unhandled rejection and no log line carrying the token.
 *
 * Needs INFLUXDB_URL and INFLUXDB_TOKEN pointing at an InfluxDB 2 instance
 * that has org `thinx` (CI: docker-compose.test.yml influxdb + influxdb-setup).
 * Owners are random synthetic 64-hex values and are never printed.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const crypto = require('crypto');
const expect = require('chai').expect;
const InfluxConnector = require('../../lib/thinx/influx');
const EventTaxonomy = require('../../lib/thinx/event_taxonomy');
const secrets = require('../../lib/thinx/secrets');

const ENSURE_OK = ["created", "updated", "unchanged", "adopted"];
const INJECTION = 'x") |> yield(name: "pwn';

const syntheticOwner = () => crypto.randomBytes(32).toString("hex");

// Clears connector state (WriteApi, disabled latch) between cases.
async function reset() {
    if (typeof InfluxConnector._resetForTests === "function") await InfluxConnector._resetForTests();
    secrets._resetCacheForTests();
}

// Runs fn while capturing console.log/warn/error lines instead of printing
// them (statsLog prints the owner, which this spec never echoes).
async function captured(fn) {
    const lines = [];
    const saved = { log: console.log, warn: console.warn, error: console.error };
    const grab = (...args) => { lines.push(args.map((a) => String(a)).join(" ")); };
    console.log = grab; console.warn = grab; console.error = grab;
    try {
        const value = await fn();
        return { value, lines };
    } finally {
        console.log = saved.log; console.warn = saved.warn; console.error = saved.error;
    }
}

const countOwner = (influx, measurement, owner) => new Promise((resolve) => influx.queryOwner(measurement, owner, resolve));
const countAll = (influx, measurement) => new Promise((resolve) => influx.query(measurement, resolve));
const weekOf = (influx, owner) => new Promise((resolve) => influx.week(owner, (ok, body) => resolve({ ok, body })));
const todayOf = (influx, owner) => new Promise((resolve) => influx.today(owner, (ok, body) => resolve({ ok, body })));

function expectKpiShape(body) {
    expect(Object.keys(body)).to.deep.equal(EventTaxonomy.names());
    Object.keys(body).forEach((k) => {
        expect(body[k]).to.be.an('array').with.lengthOf(1);
        expect(Number.isInteger(body[k][0])).to.equal(true);
        expect(body[k][0] >= 0).to.equal(true);
    });
}

function allZero(body) {
    return Object.keys(body).every((k) => body[k][0] === 0);
}

describe("InfluxDB 2 connector", function () {

    let influx;
    let ensureResult;
    const ownerA = syntheticOwner();
    const ownerB = syntheticOwner();

    beforeAll(async () => {
        const url = process.env.INFLUXDB_URL;
        expect(url, "INFLUXDB_URL must point at an InfluxDB 2 instance").to.be.a('string');
        const res = await fetch(`${url}/health`);
        const health = await res.json();
        console.log(`[influx-spec] server_version=${health.version}`);
        expect(String(health.version)).to.match(/^v2\./);

        await reset();
        if (typeof InfluxConnector.ensureStatsBucket === "function") {
            ensureResult = await InfluxConnector.ensureStatsBucket();
        }
        influx = new InfluxConnector('stats');
    }, 30000);

    afterAll(async () => {
        await reset();
    });

    it("boot ensure converges the stats bucket", function () {
        expect(ensureResult).to.be.an('object');
        expect(ensureResult.ok).to.equal(true);
        expect(ENSURE_OK).to.include(ensureResult.action);
    });

    it("statsLog adds exactly one point per taxonomy measurement for the owner", async function () {
        for (const name of EventTaxonomy.names()) {
            const before = await countOwner(influx, name, ownerA);
            await captured(() => InfluxConnector.statsLog(ownerA, name, "p27-spec"));
            const after = await countOwner(influx, name, ownerA);
            expect(after, name).to.equal(before + 1);
        }
    }, 30000);

    it("statsLog without data logs exactly [OID:<owner>] [LOGIN_INVALID] and adds one point", async function () {
        const before = await countOwner(influx, "LOGIN_INVALID", ownerA);
        const { lines } = await captured(() => InfluxConnector.statsLog(ownerA, "LOGIN_INVALID"));
        const after = await countOwner(influx, "LOGIN_INVALID", ownerA);
        const oid = lines.filter((l) => l.indexOf("[OID:") !== -1);
        expect(oid).to.deep.equal([`[OID:${ownerA}] [LOGIN_INVALID]`]);
        expect(after).to.equal(before + 1);
    });

    it("writePoint drops a non-taxonomy measurement and still calls back []", async function () {
        const { value } = await captured(() => new Promise((resolve) => {
            influx.writePoint({ measurement: "APIKEY_MISUSE", tags: { owner: ownerA }, fields: { value: 1 } }, resolve);
        }));
        expect(value).to.deep.equal([]);
        expect(await countAll(influx, "APIKEY_MISUSE")).to.equal(0);
    });

    it("week and today answer {KPI:[n]} keyed by exactly the taxonomy names", async function () {
        await captured(() => InfluxConnector.statsLog(ownerA, "DEVICE_CHECKIN", "p27-spec"));
        const week = await weekOf(influx, ownerA);
        const today = await todayOf(influx, ownerA);
        expect(week.ok).to.equal(true);
        expect(today.ok).to.equal(true);
        expectKpiShape(week.body);
        expectKpiShape(today.body);
        expect(week.body.DEVICE_CHECKIN[0] >= 1).to.equal(true);
        expect(today.body.DEVICE_CHECKIN[0] >= 1).to.equal(true);
    });

    it("another owner's points do not change this owner's counts", async function () {
        const before = (await weekOf(influx, ownerA)).body.DEVICE_CHECKIN[0];
        await captured(() => InfluxConnector.statsLog(ownerB, "DEVICE_CHECKIN", "p27-spec"));
        await captured(() => InfluxConnector.statsLog(ownerB, "DEVICE_CHECKIN", "p27-spec"));
        const after = (await weekOf(influx, ownerA)).body.DEVICE_CHECKIN[0];
        const other = (await weekOf(influx, ownerB)).body.DEVICE_CHECKIN[0];
        expect(after).to.equal(before);
        expect(other).to.equal(2);
    });

    it("a quote-bearing owner yields zeros and cannot alter the Flux query", async function () {
        const week = await weekOf(influx, INJECTION);
        const today = await todayOf(influx, INJECTION);
        expect(week.ok).to.equal(true);
        expect(today.ok).to.equal(true);
        expectKpiShape(week.body);
        expect(allZero(week.body)).to.equal(true);
        expect(allZero(today.body)).to.equal(true);

        // countsByKpi takes the owner as a Flux parameter: the query must run
        // cleanly (no "query failed") and match nothing.
        const { value, lines } = await captured(() => influx.countsByKpi(INJECTION, new Date(0)));
        expectKpiShape(value);
        expect(allZero(value)).to.equal(true);
        expect(lines.filter((l) => l.indexOf("query failed") !== -1)).to.deep.equal([]);
    });

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

        it("disables stats with one log line, no-op writes and zero counts", async function () {
            const { lines } = await captured(async () => {
                await InfluxConnector.statsLog(syntheticOwner(), "DEVICE_CHECKIN", "p27-spec");
                const cb = await new Promise((resolve) => {
                    new InfluxConnector('stats').writePoint({ measurement: "DEVICE_CHECKIN", tags: { owner: "a" }, fields: { value: 1 } }, resolve);
                });
                expect(cb).to.deep.equal([]);
                const week = await weekOf(new InfluxConnector('stats'), ownerA);
                expect(week.ok).to.equal(true);
                expectKpiShape(week.body);
                expect(allZero(week.body)).to.equal(true);
                await InfluxConnector.statsLog(syntheticOwner(), "DEVICE_NEW");
            });
            const disabled = lines.filter((l) => l.indexOf("statistics disabled") !== -1);
            expect(disabled.length).to.equal(1);
        }, 30000);
    });

    describe("with InfluxDB unreachable", function () {

        let savedUrl;
        let rejections = [];
        const collect = (reason) => rejections.push(reason);

        beforeEach(async () => {
            savedUrl = process.env.INFLUXDB_URL;
            process.env.INFLUXDB_URL = "http://127.0.0.1:9";
            await reset();
            rejections = [];
            process.on('unhandledRejection', collect);
        });

        afterEach(async () => {
            process.removeListener('unhandledRejection', collect);
            process.env.INFLUXDB_URL = savedUrl;
            await reset();
        });

        it("finishes in bounded time with zeros, no unhandled rejection and no token in logs", async function () {
            const token = process.env.INFLUXDB_TOKEN;
            expect(token, "INFLUXDB_TOKEN must be set for the outage case").to.be.a('string').and.not.equal("");
            const started = Date.now();
            const { lines } = await captured(async () => {
                await InfluxConnector.statsLog(syntheticOwner(), "DEVICE_CHECKIN", "p27-spec");
                const week = await weekOf(new InfluxConnector('stats'), ownerA);
                expect(week.ok).to.equal(true);
                expect(allZero(week.body)).to.equal(true);
                await new Promise((resolve) => setTimeout(resolve, 500));
            });
            expect(Date.now() - started).to.be.below(20000);
            expect(rejections.map((r) => String(r && r.code || r))).to.deep.equal([]);
            expect(lines.filter((l) => l.indexOf(token) !== -1)).to.deep.equal([]);
        }, 30000);
    });
});
