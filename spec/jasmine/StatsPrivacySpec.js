/*
 * StatsPrivacySpec.js — Phase 27-03 (OPS-INFLUX-02, D-12)
 *
 * Attacker-supplied values must never reach a stats point or a log line:
 *   - APIKEY_INVALID is written with the owner tag only. The rejected key is
 *     not passed to statsLog (so it is neither a tag value nor part of the
 *     statsLog console line) and no console line carries it; the audit entry
 *     keeps only the redacted form (first 6 chars + …).
 *   - LOGIN_INVALID only ever carries one of the allow-listed reason labels
 *     (LOGIN_INVALID_REASONS in lib/router.auth.js) or `unlisted`. Every call
 *     site passes an allow-listed literal, and auditLogError maps anything else
 *     to `unlisted` before logging or writing.
 *
 * Helper-free; needs no InfluxDB, CouchDB or Redis (fake redis, spied
 * statsLog, stubbed audit log). Owners and keys are synthetic, never printed.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const expect = require('chai').expect;
const InfluxConnector = require('../../lib/thinx/influx');
const APIKey = require('../../lib/thinx/apikey');
const secrets = require('../../lib/thinx/secrets');

const ROUTER_AUTH = path.join(__dirname, "../../lib/router.auth.js");
const EXPECTED_REASONS = ["wrapper_error_1", "wrapper_error", "no_userdata", "user_deleted", "not_activated", "password_mismatch", "unknown_username"];

const hex64 = () => crypto.randomBytes(32).toString("hex");

// Captures every console.log/warn/error/info line written while fn runs.
async function captured(fn) {
    const lines = [];
    const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
    const grab = (...args) => { lines.push(args.map((a) => String(a)).join(" ")); };
    console.log = grab; console.warn = grab; console.error = grab; console.info = grab;
    try {
        const value = await fn();
        return { value, lines };
    } finally {
        console.log = saved.log; console.warn = saved.warn; console.error = saved.error; console.info = saved.info;
    }
}

// Source text of `function <name>(...) { ... }` (brace-balanced).
function functionSource(source, name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) return null;
    const open = source.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") {
            depth--;
            if (depth === 0) return source.substring(start, i + 1);
        }
    }
    return null;
}

function reasonsLiteral(source) {
    const m = source.match(/const\s+LOGIN_INVALID_REASONS\s*=\s*Object\.freeze\(\s*\[([^\]]*)\]\s*\)/);
    if (!m) return null;
    return m[1].split(",").map((s) => s.trim()).filter((s) => s.length > 0).map((s) => {
        const q = s.match(/^["']([^"']*)["']$/);
        return q ? q[1] : `<non-literal:${s}>`;
    });
}

describe("Stats privacy (D-12)", function () {

    describe("APIKEY_INVALID", function () {

        let owner, probeKey, apikey, statsCalls, auditCalls;

        beforeEach(() => {
            owner = hex64();
            probeKey = hex64();
            const unrelated = hex64();
            const fakeRedis = {
                get: (key, cb) => cb(null, JSON.stringify([{ key: unrelated, hash: hex64(), alias: "unrelated" }]))
            };
            apikey = new APIKey(fakeRedis);
            // No AuditLog / CouchDB: the instance's audit sink records instead.
            auditCalls = [];
            apikey.alog = { log: (...a) => { auditCalls.push(a); } };
            statsCalls = [];
            spyOn(InfluxConnector, "statsLog").and.callFake((...a) => { statsCalls.push(a); return Promise.resolve(); });
        });

        const verifyProbe = () => captured(() => new Promise((resolve) => {
            apikey.verify(owner, probeKey, true, (ok, reason) => resolve({ ok, reason }));
        }));

        it("calls statsLog once with exactly (owner, \"APIKEY_INVALID\")", async function () {
            const { value } = await verifyProbe();
            expect(value.ok).to.equal(false);
            expect(statsCalls.length).to.equal(1);
            expect(statsCalls[0].length, "statsLog must not receive the rejected key").to.equal(2);
            expect(statsCalls[0][0]).to.equal(owner);
            expect(statsCalls[0][1]).to.equal("APIKEY_INVALID");
        });

        describe("with the real statsLog (stats disabled, no write)", function () {

            let savedToken;

            beforeEach(async () => {
                savedToken = process.env.INFLUXDB_TOKEN;
                delete process.env.INFLUXDB_TOKEN;
                await InfluxConnector._resetForTests();
                secrets._resetCacheForTests();
                InfluxConnector.statsLog.and.callThrough();
            });

            afterEach(async () => {
                if (typeof savedToken !== "undefined") process.env.INFLUXDB_TOKEN = savedToken;
                await InfluxConnector._resetForTests();
                secrets._resetCacheForTests();
            });

            it("prints no console line containing the rejected key", async function () {
                const { lines } = await verifyProbe();
                expect(lines.some((l) => l.indexOf("[APIKEY_INVALID]") !== -1), "statsLog console line").to.equal(true);
                const leaks = lines.filter((l) => l.indexOf(probeKey) !== -1);
                expect(leaks.length, "console lines carrying the full rejected key").to.equal(0);
            });
        });

        it("keeps the audit entry redacted (first 6 chars + …)", async function () {
            await verifyProbe();
            expect(auditCalls.length).to.equal(1);
            const message = String(auditCalls[0][1]);
            expect(message.indexOf(probeKey)).to.equal(-1);
            expect(message).to.contain(probeKey.substring(0, 6) + "…");
        });
    });

    describe("LOGIN_INVALID (lib/router.auth.js)", function () {

        const source = fs.readFileSync(ROUTER_AUTH, "utf8");

        it("declares LOGIN_INVALID_REASONS as a frozen array of the 7 labels", function () {
            expect(reasonsLiteral(source)).to.deep.equal(EXPECTED_REASONS);
        });

        it("passes an allow-listed string literal at every auditLogError call site", function () {
            const reasons = reasonsLiteral(source) || [];
            const calls = (source.match(/(?<!function\s)\bauditLogError\(/g) || []).length;
            const literal = [...source.matchAll(/(?<!function\s)\bauditLogError\(\s*[^,()]+?\s*,\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
            expect(calls).to.be.at.least(7);
            expect(literal.length, "call sites whose second argument is not a string literal").to.equal(calls);
            literal.forEach((label) => expect(reasons, label).to.include(label));
        });

        it("maps its input through the allow-list before the log line and the stats call", function () {
            const body = functionSource(source, "auditLogError");
            expect(body, "auditLogError definition").to.be.a('string');
            expect(body).to.contain("LOGIN_INVALID_REASONS.includes(");
            expect(body).to.match(/["']unlisted["']/);
            expect(body, "log line must not interpolate the raw parameter").not.to.match(/\$\{\s*data\s*\}/);
            expect(body, "statsLog must not receive the raw parameter").not.to.match(/statsLog\([^)]*,\s*data\s*\)/);
        });

        it("logs and writes only the allow-listed label or `unlisted` (lifted function)", function () {
            const body = functionSource(source, "auditLogError");
            const reasons = Object.freeze(reasonsLiteral(source) || []);
            const warns = [];
            const writes = [];
            const logger = { warn: (m) => warns.push(String(m)) };
            const Influx = { statsLog: (...a) => { writes.push(a); return Promise.resolve(); } };
            const Util = { isDefined: (v) => (typeof v !== "undefined") && (v !== null) };
            const auditLogError = new Function("Util", "logger", "InfluxConnector", "LOGIN_INVALID_REASONS", `${body}\nreturn auditLogError;`)(Util, logger, Influx, reasons);

            const owner = hex64();
            const raw = "attacker@example.com:hunter2";
            auditLogError(owner, raw);
            auditLogError(owner, "password_mismatch");
            auditLogError(null, undefined);

            expect(writes.map((w) => w[2])).to.deep.equal(["unlisted", "password_mismatch", "unlisted"]);
            writes.forEach((w) => expect(w[1]).to.equal("LOGIN_INVALID"));
            expect(warns.length).to.equal(3);
            warns.forEach((w) => {
                expect(w).to.contain("[LOGIN_INVALID]");
                expect(w.indexOf(raw)).to.equal(-1);
            });
            expect(warns[0]).to.match(/\[LOGIN_INVALID\] unlisted$/);
        });
    });
});
