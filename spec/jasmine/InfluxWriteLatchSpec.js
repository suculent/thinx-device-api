/*
 * InfluxWriteLatchSpec.js — WR-02 (Phase 27 review)
 *
 * A write InfluxDB refuses for good (401 revoked token, 403, 404 missing
 * bucket) used to cost two log lines per stats event, forever, and an HTTP
 * call per event. The connector now pauses writes for a cooldown after such a
 * refusal: one log line, no HTTP call while paused, then the next write
 * probes again. Other failures (here 400) do not pause anything.
 *
 * Runs against an in-process HTTP stub standing in for InfluxDB 2, so no
 * InfluxDB server is needed. The token is a synthetic marker and must never
 * reach a log line.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const http = require('http');
const expect = require('chai').expect;
const InfluxConnector = require('../../lib/thinx/influx');
const secrets = require('../../lib/thinx/secrets');

const TOKEN = "wr02-synthetic-token-marker";
const OWNER = "c".repeat(64);

const stub = { status: 401, writes: 0 };

function stubHandler(req, res) {
    req.resume();
    req.on("end", () => {
        if (req.url.indexOf("/api/v2/write") === 0) {
            stub.writes++;
            if (stub.status === 204) {
                res.writeHead(204);
                return res.end();
            }
            res.writeHead(stub.status, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ code: "unauthorized", message: "synthetic refusal" }));
        }
        res.writeHead(404);
        res.end();
    });
}

async function captured(fn) {
    const lines = [];
    const saved = { log: console.log, warn: console.warn, error: console.error };
    const grab = (...args) => { lines.push(args.map((a) => String(a)).join(" ")); };
    console.log = grab; console.warn = grab; console.error = grab;
    try {
        await fn();
        return lines;
    } finally {
        console.log = saved.log; console.warn = saved.warn; console.error = saved.error;
    }
}

function influxLines(lines) {
    return lines.filter((l) => l.indexOf("[influx]") !== -1);
}

async function events(n) {
    for (let i = 0; i < n; i++) await InfluxConnector.statsLog(OWNER, "DEVICE_CHECKIN");
}

describe("InfluxDB write refusal latch (WR-02)", function () {

    let server;
    let saved;
    let savedCooldown;

    beforeAll((done) => {
        saved = { url: process.env.INFLUXDB_URL, token: process.env.INFLUXDB_TOKEN };
        savedCooldown = InfluxConnector.writeRefusedCooldownMs;
        server = http.createServer(stubHandler).listen(0, "127.0.0.1", () => {
            process.env.INFLUXDB_URL = `http://127.0.0.1:${server.address().port}`;
            process.env.INFLUXDB_TOKEN = TOKEN;
            done();
        });
    });

    afterAll(async () => {
        await InfluxConnector._resetForTests();
        if (typeof saved.url === "undefined") delete process.env.INFLUXDB_URL; else process.env.INFLUXDB_URL = saved.url;
        if (typeof saved.token === "undefined") delete process.env.INFLUXDB_TOKEN; else process.env.INFLUXDB_TOKEN = saved.token;
        secrets._resetCacheForTests();
        InfluxConnector.writeRefusedCooldownMs = savedCooldown;
        await new Promise((resolve) => server.close(resolve));
    });

    beforeEach(async () => {
        await InfluxConnector._resetForTests();
        secrets._resetCacheForTests();
        InfluxConnector.writeRefusedCooldownMs = 60000;
        stub.status = 401;
        stub.writes = 0;
    });

    for (const status of [401, 403, 404]) {
        it(`a ${status} pauses writes: ten events cost one request and one log line`, async function () {
            stub.status = status;
            const lines = await captured(() => events(10));
            expect(stub.writes, "write requests").to.equal(1);
            const influx = influxLines(lines);
            expect(influx).to.deep.equal([`[influx] write refused ${status}, writes paused for 60 s`]);
            expect(lines.filter((l) => l.indexOf(TOKEN) !== -1)).to.deep.equal([]);
        }, 20000);
    }

    it("writePoint still calls back [] exactly once while paused", async function () {
        await captured(() => events(1));
        const answers = [];
        await captured(() => new Promise((resolve) => {
            new InfluxConnector('stats').writePoint({ measurement: "DEVICE_CHECKIN", tags: { owner: OWNER }, fields: { value: 1 } }, (r) => {
                answers.push(r);
                setTimeout(resolve, 50);
            });
        }));
        expect(answers).to.deep.equal([[]]);
        expect(stub.writes).to.equal(1);
    }, 20000);

    it("after the cooldown the next write probes again; a success resumes with one line", async function () {
        InfluxConnector.writeRefusedCooldownMs = 100;
        const lines = await captured(async () => {
            await events(3);
            await new Promise((resolve) => setTimeout(resolve, 150));
            stub.status = 204;
            await events(3);
        });
        expect(stub.writes, "write requests").to.equal(4);
        expect(influxLines(lines)).to.deep.equal([
            "[influx] write refused 401, writes paused for 0 s",
            "[influx] writes resumed, 2 point(s) dropped while paused"
        ]);
    }, 20000);

    it("a refusal after the cooldown pauses again with one more line", async function () {
        InfluxConnector.writeRefusedCooldownMs = 100;
        const lines = await captured(async () => {
            await events(2);
            await new Promise((resolve) => setTimeout(resolve, 150));
            await events(2);
        });
        expect(stub.writes).to.equal(2);
        expect(influxLines(lines)).to.have.length(2);
    }, 20000);

    it("a 400 is not a refusal: nothing pauses", async function () {
        stub.status = 400;
        const lines = await captured(() => events(3));
        expect(stub.writes).to.equal(3);
        expect(influxLines(lines).filter((l) => l.indexOf("paused") !== -1)).to.deep.equal([]);
    }, 20000);
});
