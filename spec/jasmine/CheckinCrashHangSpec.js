/*
 * CheckinCrashHangSpec — quick 261004-tgg: check-in path crash and hang bugs.
 *
 * Runs without Redis, CouchDB or InfluxDB. lib/thinx/couch.js, lib/thinx/audit.js and
 * lib/thinx/deployment.js are swapped in require.cache for a scriptable fake database, a
 * recording audit log and a no-op deployment, and a fresh copy of lib/thinx/device.js is loaded
 * against them. InfluxConnector.statsLog is a jasmine spy. The swap lives in the outer
 * describe's beforeAll/afterAll, so it never leaks into other spec files.
 *
 * Every fake database completion runs inside a try/catch that records a throw instead of
 * killing the run, so a ReferenceError/TypeError in a completion shows up as `throws`.
 *
 * Pinned behaviour:
 * 1. Device#markUserBuildGoal error path: audit entry for device.owner, callback exactly once
 *    with (res, false, "update_failed"); no ReferenceError.
 * 2. Device#register for a new SigFox device: the downlink is answered once and the insert
 *    completion (success or failure) never calls the nulled callback; the HTTP response is
 *    sent exactly once.
 * 3. Device#envs: no throw when the read returns no error and no document; logs
 *    envs_read_failed on any read error (and only then); callback exactly once.
 * 4. Deployment#validateHasUpdateAvailable(undefined | null) returns false without throwing.
 * 5. Device#register missing-MAC path answers (res, false, "no_mac").
 *
 * Nothing here prints an owner id, key or status; assertions report sentinel names only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const nodeUtil = require("util");
const expect = require("chai").expect;
const sha256 = require("sha256");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const DEPLOYMENT_PATH = require.resolve("../../lib/thinx/deployment");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const INFLUX_PATH = require.resolve("../../lib/thinx/influx");
const Util = require("../../lib/thinx/util.js");
const SWAPPED = [COUCH_PATH, AUDIT_PATH, DEPLOYMENT_PATH, DEVICE_PATH];

const OWNER = sha256("tgg-owner@example.com");
const API_KEY = sha256("tgg-api-key");
const STATUS = "tggstatus0123456";
const ENV_VALUE = "tgg-env-value-sentinel";
const MAC = "7A:7A:7A:7A:7A:7A";
const SIGFOX_ID = "7A7A7A7A";
const UDID = "7a000000-0000-4000-8000-0000000000d1";
const UDID_NEW = "7a000000-0000-4000-8000-0000000000e1";

const SECRETS = { owner: OWNER, api_key: API_KEY, status: STATUS, env_value: ENV_VALUE, mac: MAC };

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = {
    getError: null, getNothing: false, inserts: 0, insertError: null, userError: null, userAtomics: 0, thrown: []
};

function later(cb, err, body) {
    setImmediate(() => {
        try {
            cb(err, body);
        } catch (e) {
            couch.thrown.push(e);
        }
    });
}

function deviceDoc(overrides) {
    return Object.assign({
        _id: UDID,
        _rev: "1-tggrev",
        udid: UDID,
        owner: OWNER,
        mac: MAC,
        environment: { pass: ENV_VALUE },
        status: STATUS,
        transformers: [],
        mesh_ids: []
    }, overrides || {});
}

const deviceDb = {
    get(id, cb) {
        if (couch.getError) return later(cb, couch.getError);
        if (couch.getNothing) return later(cb, null, undefined);
        return later(cb, null, deviceDoc());
    },
    atomic(design, update, id, changes, cb) {
        return later(cb, null, { ok: true });
    },
    insert(doc, id, cb) {
        couch.inserts++;
        if (couch.insertError) return later(cb, couch.insertError);
        return later(cb, null, { ok: true, id: id });
    },
    destroy(id, rev, cb) {
        return later(cb, null, { ok: true });
    }
};

const userDb = {
    atomic(design, update, id, changes, cb) {
        couch.userAtomics++;
        if (couch.userError) return later(cb, couch.userError);
        return later(cb, null, { ok: true });
    }
};

function otherDbMethod() {
    const args = Array.prototype.slice.call(arguments);
    const cb = args[args.length - 1];
    if (typeof (cb) === "function") setImmediate(() => cb(new Error("not expected")));
    return new Promise(() => { /* never settles */ });
}

const otherDb = { get: otherDbMethod, view: otherDbMethod, atomic: otherDbMethod, insert: otherDbMethod, destroy: otherDbMethod };

function useDb(name) {
    if (typeof (name) === "string" && name.endsWith("managed_devices")) return deviceDb;
    if (typeof (name) === "string" && name.endsWith("managed_users")) return userDb;
    return otherDb;
}

function fakeCouch() {
    return { use: useDb, db: { use: useDb } };
}

const audits = [];

class AuditStub {
    log(owner, message, flag) { audits.push({ owner, message, flag }); }
}

class DeploymentStub {
    initWithOwner() { /* no-op */ }
    initWithDevice() { /* no-op */ }
    latestFirmwareEnvelope() { return undefined; }
    hasUpdateAvailable() { return false; }
    latestFirmwarePath(owner, udid, callback) { callback(false); }
}

// ---------------------------------------------------------------------------
// Log capture, HTTP response stub
// ---------------------------------------------------------------------------

let lines = [];

function captureLogs() {
    lines = [];
    if (jasmine.isSpy(console.log)) return;
    const record = (...args) => { lines.push(nodeUtil.format(...args)); };
    spyOn(console, "log").and.callFake(record);
    spyOn(console, "error").and.callFake(record);
    spyOn(console, "warn").and.callFake(record);
    spyOn(console, "info").and.callFake(record);
}

const AUDIT_LINE = /\[OID:[^\]]*\] \[(DEVICE_CHECKIN|DEVICE_NEW)\]/;

function leaked() {
    const checked = lines.filter((l) => !AUDIT_LINE.test(l));
    return Object.keys(SECRETS).filter((name) => checked.some((l) => l.indexOf(SECRETS[name]) !== -1));
}

function linesWith(text) {
    return lines.filter((l) => l.indexOf(text) !== -1).length;
}

function httpRes() {
    return {
        bodies: [],
        header() { /* no-op */ },
        end(body) { this.bodies.push(body); }
    };
}

// The /device/register route's completion (lib/router.deviceapi.js), minus its log lines.
function routeCompletion(res, calls) {
    return (r, success, response) => {
        calls.push([r, success, response]);
        if (success === false) return Util.responder(res, success, response);
        Util.respond(res, response);
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(calls, ms = 100, limit = 1500) {
    const started = Date.now();
    while (calls.length === 0 && (Date.now() - started) < limit) await sleep(10);
    await sleep(ms);
}

function regBody(overrides) {
    return Object.assign({
        owner: OWNER,
        mac: MAC,
        status: STATUS,
        version: "1.0.0",
        firmware: "tgg-firmware",
        alias: "tgg-alias",
        platform: "arduino"
    }, overrides || {});
}

describe("Check-in path crash and hang bugs (quick 261004-tgg)", function () {

    const saved = {};
    let Device;
    let RealDeployment;
    let InfluxConnector;

    beforeAll(() => {
        require(DEVICE_PATH); // bind the real dependency tree first
        RealDeployment = require(DEPLOYMENT_PATH);
        InfluxConnector = require(INFLUX_PATH);
        for (const p of SWAPPED) saved[p] = require.cache[p];
        require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
        require.cache[AUDIT_PATH] = { id: AUDIT_PATH, filename: AUDIT_PATH, loaded: true, exports: AuditStub };
        require.cache[DEPLOYMENT_PATH] = { id: DEPLOYMENT_PATH, filename: DEPLOYMENT_PATH, loaded: true, exports: DeploymentStub };
        delete require.cache[DEVICE_PATH];
        Device = require(DEVICE_PATH);
    });

    afterAll(() => {
        for (const p of SWAPPED) {
            if (saved[p]) require.cache[p] = saved[p]; else delete require.cache[p];
        }
    });

    beforeEach(() => {
        couch.getError = null;
        couch.getNothing = false;
        couch.inserts = 0;
        couch.insertError = null;
        couch.userError = null;
        couch.userAtomics = 0;
        couch.thrown = [];
        audits.length = 0;
        spyOn(InfluxConnector, "statsLog").and.returnValue(Promise.resolve());
    });

    function newDevice() {
        const device = new Device({
            get(key, cb) { setImmediate(() => cb(null, null)); },
            set(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, "OK")); },
            del(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, 1)); },
            expire(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, 1)); },
            on() { }
        });
        device.owner = { profile: (owner, cb) => setImmediate(() => cb(true, { _id: OWNER, info: { goals: [], transformers: [] } })) };
        device.authorize_mqtt = () => { /* no-op: no Redis */ };
        device.apikey = { verify: (owner, key, b, cb) => setImmediate(() => cb(true, "ok")) };
        device.resolveRegistration = (owner, udid, mac, callback) => setImmediate(() => callback({ udid: UDID_NEW }));
        return device;
    }

    // -----------------------------------------------------------------------
    describe("1. Device#markUserBuildGoal", function () {

        it("answers (res, false, 'update_failed') exactly once and audits the device owner when the goal update fails", async function () {
            couch.userError = Object.assign(new Error("conflict"), { statusCode: 409 });
            const device = newDevice();
            const res = httpRes();
            const calls = [];
            captureLogs();
            device.markUserBuildGoal({ info: { goals: [] } }, deviceDoc(), res, (...args) => calls.push(args));
            await settle(calls);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][0] === res, "res passed through").to.equal(true);
            expect(calls[0][1]).to.equal(false);
            expect(calls[0][2]).to.equal("update_failed");
            expect(audits.length, "audit entries").to.equal(1);
            expect(audits[0].owner === OWNER, "audit entry names the device owner").to.equal(true);
            expect(linesWith("build_goal_update_failed"), "reason lines").to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("still answers (res, true, 'updated') exactly once when the goal update succeeds", async function () {
            const device = newDevice();
            const res = httpRes();
            const calls = [];
            captureLogs();
            device.markUserBuildGoal({ info: { goals: [] } }, deviceDoc(), res, (...args) => calls.push(args));
            await settle(calls);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][1]).to.equal(true);
            expect(calls[0][2]).to.equal("updated");
        });
    });

    // -----------------------------------------------------------------------
    describe("2. Device#register, new SigFox device", function () {

        function sigfoxReg() {
            return regBody({ mac: "SIGFOX" + SIGFOX_ID, ack: true, status: undefined });
        }

        it("answers the downlink once and does not throw when the insert succeeds", async function () {
            const device = newDevice();
            const res = httpRes();
            const calls = [];
            captureLogs();
            device.register(sigfoxReg(), API_KEY, res, routeCompletion(res, calls));
            await settle(calls, 150);
            expect(couch.inserts, "inserts").to.equal(1);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][1]).to.equal(true);
            expect(typeof (calls[0][2][SIGFOX_ID]), "downlink answered").to.equal("object");
            expect(res.bodies.length, "HTTP responses").to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("answers the downlink once and does not throw when the insert fails", async function () {
            couch.insertError = Object.assign(new Error("conflict"), { statusCode: 409 });
            const device = newDevice();
            const res = httpRes();
            const calls = [];
            captureLogs();
            device.register(sigfoxReg(), API_KEY, res, routeCompletion(res, calls));
            await settle(calls, 150);
            expect(couch.inserts, "inserts").to.equal(1);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][1]).to.equal(true);
            expect(res.bodies.length, "HTTP responses").to.equal(1);
            expect(linesWith("device_insert_failed"), "reason lines").to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("still answers a plain new device once with the registration on insert success", async function () {
            const device = newDevice();
            const res = httpRes();
            const calls = [];
            captureLogs();
            device.register(regBody(), API_KEY, res, routeCompletion(res, calls));
            await settle(calls, 150);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][1]).to.equal(true);
            expect(calls[0][2].registration.udid).to.equal(UDID_NEW);
            expect(res.bodies.length, "HTTP responses").to.equal(1);
        });

        it("still answers a plain new device once with false on insert failure", async function () {
            couch.insertError = Object.assign(new Error("conflict"), { statusCode: 409 });
            const device = newDevice();
            const res = httpRes();
            const calls = [];
            captureLogs();
            device.register(regBody(), API_KEY, res, routeCompletion(res, calls));
            await settle(calls, 150);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][1]).to.equal(false);
            expect(res.bodies.length, "HTTP responses").to.equal(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("3. Device#envs", function () {

        it("does not throw and answers once when the read returns neither an error nor a document", async function () {
            couch.getNothing = true;
            const device = newDevice();
            const calls = [];
            captureLogs();
            device.envs(UDID, (...args) => calls.push(args));
            await settle(calls);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(calls).to.deep.equal([[false, "getenv_device_not_found"]]);
            expect(linesWith("envs_read_failed"), "reason lines without an error").to.equal(0);
        });

        it("does not throw without a callback when the read returns neither an error nor a document", async function () {
            couch.getNothing = true;
            const device = newDevice();
            captureLogs();
            device.envs(UDID);
            await sleep(50);
            expect(couch.thrown.length, "throws").to.equal(0);
        });

        it("logs envs_read_failed for a read error that is not 'missing'", async function () {
            couch.getError = Object.assign(new Error("read failed"), { statusCode: 500 });
            const device = newDevice();
            const calls = [];
            captureLogs();
            device.envs(UDID, (...args) => calls.push(args));
            await settle(calls);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(calls).to.deep.equal([[false, "getenv_device_not_found"]]);
            expect(linesWith("envs_read_failed"), "reason lines").to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("still logs envs_read_failed for a 'missing' read error", async function () {
            couch.getError = Object.assign(new Error("missing"), { statusCode: 404 });
            const device = newDevice();
            const calls = [];
            captureLogs();
            device.envs(UDID, (...args) => calls.push(args));
            await settle(calls);
            expect(calls).to.deep.equal([[false, "getenv_device_not_found"]]);
            expect(linesWith("envs_read_failed"), "reason lines").to.equal(1);
        });

        it("still answers the environment once and logs nothing on success", async function () {
            const device = newDevice();
            const calls = [];
            captureLogs();
            device.envs(UDID, (...args) => calls.push(args));
            await settle(calls);
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][0]).to.equal(true);
            expect(calls[0][1].pass === ENV_VALUE, "environment answered").to.equal(true);
            expect(linesWith("envs_read_failed"), "reason lines").to.equal(0);
        });
    });

    // -----------------------------------------------------------------------
    describe("4. Deployment#validateHasUpdateAvailable", function () {

        it("returns false without throwing for an undefined or null device", function () {
            const deploy = new RealDeployment();
            captureLogs();
            let result;
            expect(() => { result = deploy.validateHasUpdateAvailable(undefined); }, "undefined").to.not.throw();
            expect(result).to.equal(false);
            expect(() => { result = deploy.validateHasUpdateAvailable(null); }, "null").to.not.throw();
            expect(result).to.equal(false);
            expect(linesWith("Cannot init deployment without device"), "reason lines").to.equal(2);
        });
    });

    // -----------------------------------------------------------------------
    describe("5. Device#register missing-MAC path", function () {

        it("answers (res, false, 'no_mac') and the HTTP request once", async function () {
            const device = newDevice();
            device.normalizedMAC = () => undefined; // the branch's own guard; see the SUMMARY
            const res = httpRes();
            const calls = [];
            captureLogs();
            device.register(regBody(), API_KEY, res, routeCompletion(res, calls));
            await settle(calls);
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][0] === res, "res passed through").to.equal(true);
            expect(calls[0][1]).to.equal(false);
            expect(calls[0][2]).to.equal("no_mac");
            expect(res.bodies.length, "HTTP responses").to.equal(1);
            expect(JSON.parse(res.bodies[0])).to.deep.equal({ success: false, response: "no_mac" });
            expect(couch.inserts, "inserts").to.equal(0);
        });
    });
});
