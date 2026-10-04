/*
 * CheckinLogLeakSpec — quick 261004-sdv: device check-in never logs the registration body.
 *
 * Runs without Redis, CouchDB or InfluxDB. lib/thinx/couch.js, lib/thinx/audit.js and
 * lib/thinx/deployment.js are swapped in require.cache for a scriptable fake database, a no-op
 * audit log and a no-op deployment, and a fresh copy of lib/thinx/device.js is loaded against
 * them. InfluxConnector.statsLog is a jasmine spy (restored after each spec). The swap lives in
 * the outer describe's beforeAll/afterAll, so it never leaks into other spec files.
 *
 * Pinned behaviour (log lines only; responses and writes are unchanged):
 * - Device#checkinExistingDevice (HTTP check-in of a known device), its SigFox downlink branch,
 *   and Device#register for a new device (plain and SigFox downlink) never log the
 *   registration body or the device document: no owner id, MAC, API key, key hash, env_hash,
 *   push token, AES key or status value, and no JSON object.
 * - Device#markUserBuildGoal, Device#register (missing key, failed insert), Device#revoke,
 *   Device#envs, Device#detail and Deployment#validateHasUpdateAvailable log a reason code
 *   (and at most the udid), never the raw database error, the error body or the document.
 * - The `[OID:<owner>] [DEVICE_CHECKIN|DEVICE_NEW] <udid>` stats line is the audit trail and is
 *   excluded from these checks.
 *
 * Nothing here prints an owner id, key, hash or status; assertions report sentinel names only.
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
const SWAPPED = [COUCH_PATH, AUDIT_PATH, DEPLOYMENT_PATH, DEVICE_PATH];

const OWNER = sha256("sdv-owner@example.com");
const API_KEY = sha256("sdv-api-key");
const LASTKEY = sha256(API_KEY);
const STORED_LASTKEY = sha256("sdv-stored-lastkey");
const ENV_HASH = sha256("sdv-env-hash");
const PUSH = "sdv-push-token-sentinel";
const AES = "sdv-aes-key-sentinel";
const ENV_VALUE = "sdv-env-value-sentinel";
const STATUS = "sdvstatus0123456"; // 16 chars: the SigFox downlink is the first 16 chars of status
const DB_ERROR = "sdv-db-error-sentinel";
const MAC = "5D:5D:5D:5D:5D:5D";
const SIGFOX_ID = "5D5D5D5D";
const UDID = "5d000000-0000-4000-8000-0000000000d1";
const UDID_NEW = "5d000000-0000-4000-8000-0000000000e1";

// name -> value; a log line containing any value fails the spec, reported by name only
const SECRETS = {
    owner: OWNER,
    api_key: API_KEY,
    lastkey: LASTKEY,
    stored_lastkey: STORED_LASTKEY,
    env_hash: ENV_HASH,
    push: PUSH,
    aes_key: AES,
    env_value: ENV_VALUE,
    status: STATUS,
    db_error: DB_ERROR,
    mac: MAC,
    sigfox_id: SIGFOX_ID,
    json_object: "{\"",
    object_object: "[object Object]"
};

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = {
    getError: null, getDoc: null, atomicError: null, atomics: [], inserts: [], insertError: null,
    destroyError: null, userError: null, userAtomics: 0, thrown: []
};

function later(cb, err, body) {
    setImmediate(() => {
        try {
            cb(err, body);
        } catch (e) {
            couch.thrown.push(e); // pre-existing throws stay visible without killing the run
        }
    });
}

function deviceDoc(overrides) {
    return Object.assign({
        _id: UDID,
        _rev: "1-sdvrev",
        udid: UDID,
        owner: OWNER,
        mac: MAC,
        lastkey: STORED_LASTKEY,
        aes_key: AES,
        push: PUSH,
        env_hash: ENV_HASH,
        environment: { pass: ENV_VALUE },
        status: STATUS,
        auto_update: false,
        transformers: [],
        mesh_ids: []
    }, overrides || {});
}

const deviceDb = {
    get(id, cb) {
        if (couch.getError) return later(cb, couch.getError);
        return later(cb, null, (couch.getDoc !== null) ? couch.getDoc : deviceDoc());
    },
    atomic(design, update, id, changes, cb) {
        couch.atomics.push({ id, changes: JSON.parse(JSON.stringify(changes)) });
        if (couch.atomicError) return later(cb, couch.atomicError);
        return later(cb, null, { ok: true });
    },
    insert(doc, id, cb) {
        couch.inserts.push({ id });
        if (couch.insertError) return later(cb, couch.insertError);
        // success never answers: the SigFox new-device branch has nulled its callback by then
        return undefined;
    },
    destroy(id, rev, cb) {
        if (couch.destroyError) return later(cb, couch.destroyError);
        return later(cb, null, { ok: true });
    }
};

const userDb = {
    atomic(design, update, id, changes, cb) {
        couch.userAtomics++;
        if (couch.userError) return later(cb, couch.userError, { reason: DB_ERROR, owner: OWNER, info: changes.info });
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

class AuditStub {
    log() { /* no-op: audit entries are the audit trail, out of scope */ }
}

class DeploymentStub {
    initWithOwner() { /* no-op */ }
    initWithDevice() { /* no-op */ }
    latestFirmwareEnvelope() { return DeploymentStub.envelope; }
    hasUpdateAvailable() { return false; }
    latestFirmwarePath(owner, udid, callback) { callback(false); }
}
DeploymentStub.envelope = undefined;

function redisStub() {
    return {
        get(key, cb) { setImmediate(() => cb(null, null)); },
        set(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, "OK")); },
        del(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, 1)); },
        expire(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, 1)); },
        on() { }
    };
}

// ---------------------------------------------------------------------------
// Log capture
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

// The stats/audit line `[OID:<owner>] [DEVICE_CHECKIN|DEVICE_NEW] <udid>` is out of scope.
const AUDIT_LINE = /\[OID:[^\]]*\] \[(DEVICE_CHECKIN|DEVICE_NEW)\]/;

function leaked(extra) {
    const needles = Object.assign({}, SECRETS, extra || {});
    const checked = lines.filter((l) => !AUDIT_LINE.test(l));
    const found = [];
    for (const name of Object.keys(needles)) {
        if (checked.some((l) => l.indexOf(needles[name]) !== -1)) found.push(name);
    }
    return found;
}

function linesWith(text) {
    return lines.filter((l) => l.indexOf(text) !== -1).length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Calls run(cb) and collects every callback invocation for `settle` ms after the first one
// (or until `limit` ms pass without any).
async function collect(run, settle = 100, limit = 1500) {
    const calls = [];
    run((...args) => calls.push(args));
    const started = Date.now();
    while (calls.length === 0 && (Date.now() - started) < limit) await sleep(10);
    await sleep(settle);
    return calls;
}

function regBody(overrides) {
    return Object.assign({
        udid: UDID,
        owner: OWNER,
        mac: MAC,
        status: STATUS,
        env_hash: ENV_HASH,
        push: PUSH,
        version: "1.0.0",
        firmware: "sdv-firmware",
        alias: "sdv-alias",
        platform: "arduino"
    }, overrides || {});
}

describe("Check-in never logs the registration body (quick 261004-sdv)", function () {

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
        couch.getDoc = null;
        couch.atomicError = null;
        couch.atomics = [];
        couch.inserts = [];
        couch.insertError = null;
        couch.destroyError = null;
        couch.userError = null;
        couch.userAtomics = 0;
        couch.thrown = [];
        DeploymentStub.envelope = undefined;
        spyOn(InfluxConnector, "statsLog").and.returnValue(Promise.resolve());
    });

    function newDevice() {
        const device = new Device(redisStub());
        device.owner = { profile: (owner, cb) => setImmediate(() => cb(true, { _id: OWNER, info: { goals: [], transformers: [] } })) };
        device.authorize_mqtt = () => { /* no-op: no Redis */ };
        device.apikey = { verify: (owner, key, b, cb) => setImmediate(() => cb(true, "ok")) };
        return device;
    }

    // -----------------------------------------------------------------------
    describe("existing device", function () {

        it("checks in without logging the registration body or the device document", async function () {
            const device = newDevice();
            captureLogs();
            const calls = await collect((cb) => device.checkinExistingDevice(deviceDoc(), regBody(), API_KEY, {}, cb));
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][1]).to.equal(true);
            expect(calls[0][2].registration.status).to.equal("OK");
            expect(couch.atomics.length, "writes").to.equal(1);
            expect(couch.atomics[0].changes.status, "status still persisted").to.equal(STATUS);
            expect(couch.atomics[0].changes.lastkey, "lastkey still persisted").to.equal(LASTKEY);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("logs the udid only on the SigFox downlink branch, and still answers the downlink", async function () {
            const device = newDevice();
            captureLogs();
            const reg = regBody({ mac: "SIGFOX" + SIGFOX_ID, ack: true });
            const calls = await collect((cb) => device.checkinExistingDevice(deviceDoc(), reg, API_KEY, {}, cb));
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][1]).to.equal(true);
            expect(calls[0][2][SIGFOX_ID].downlinkData, "downlink answered").to.equal(STATUS);
            expect(couch.atomics.length, "writes").to.equal(1);
            expect(couch.thrown.length, "throws").to.equal(0);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith(UDID), "lines naming the udid").to.be.at.least(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("new device (Device#register)", function () {

        function registerNew(device, reg, cb) {
            device.resolveRegistration = (owner, udid, mac, callback) => setImmediate(() => callback({ udid: UDID_NEW }));
            device.register(reg, API_KEY, {}, cb);
        }

        it("logs the udid only on the SigFox downlink branch, and still answers the downlink", async function () {
            const device = newDevice();
            captureLogs();
            const reg = regBody({ udid: undefined, mac: "SIGFOX" + SIGFOX_ID, ack: true, status: undefined });
            const calls = await collect((cb) => registerNew(device, reg, cb));
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][1]).to.equal(true);
            expect(typeof (calls[0][2][SIGFOX_ID]), "downlink answered").to.equal("object");
            expect(couch.inserts.length, "inserts").to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith(UDID_NEW), "lines naming the udid").to.be.at.least(1);
        });

        it("logs a reason code, not the database error, when the insert fails", async function () {
            couch.insertError = Object.assign(new Error("conflict " + DB_ERROR + " " + OWNER), { statusCode: 409 });
            const device = newDevice();
            captureLogs();
            const calls = await collect((cb) => registerNew(device, regBody({ udid: undefined }), cb));
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][1]).to.equal(false);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith("device_insert_failed"), "reason lines").to.equal(1);
        });

        it("does not log the registration body when the API key is missing", async function () {
            const device = newDevice();
            captureLogs();
            const calls = await collect((cb) => device.register(regBody(), undefined, {}, cb));
            expect(calls.length, "answers").to.equal(1);
            expect(calls[0][2]).to.equal("authentication_error");
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });
    });

    // -----------------------------------------------------------------------
    describe("Device#markUserBuildGoal", function () {

        it("does not log the database error or its body when the goal update fails", async function () {
            couch.userError = Object.assign(new Error("conflict " + DB_ERROR + " " + OWNER), { statusCode: 409 });
            const device = newDevice();
            captureLogs();
            device.markUserBuildGoal({ info: { goals: [] } }, deviceDoc(), {}, () => { /* answered or not: unchanged */ });
            await sleep(50);
            expect(couch.userAtomics, "goal writes").to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith("build_goal_update_failed"), "reason lines").to.equal(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("Device#revoke, #envs, #detail", function () {

        it("revoke does not log the read error", async function () {
            couch.getError = Object.assign(new Error("read " + DB_ERROR + " " + OWNER), { statusCode: 500 });
            const device = newDevice();
            captureLogs();
            const calls = await collect((cb) => device.revoke(UDID, cb));
            expect(calls[0][1].response).to.equal("device_not_found");
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("revoke does not log the document when it has no revision", async function () {
            couch.getDoc = deviceDoc({ _rev: undefined });
            const device = newDevice();
            captureLogs();
            const calls = await collect((cb) => device.revoke(UDID, cb));
            expect(calls[0][1].response).to.equal("no_such_revision");
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("revoke does not log the destroy error", async function () {
            couch.destroyError = Object.assign(new Error("destroy " + DB_ERROR + " " + OWNER), { statusCode: 500, reason: DB_ERROR });
            const device = newDevice();
            captureLogs();
            const calls = await collect((cb) => device.revoke(UDID, cb));
            expect(calls[0][1].response).to.equal("device_marked_deleted");
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("envs does not log the read error", async function () {
            couch.getError = Object.assign(new Error("missing " + DB_ERROR + " " + OWNER), { statusCode: 404 });
            const device = newDevice();
            captureLogs();
            const calls = await collect((cb) => device.envs(UDID, cb));
            expect(calls[0]).to.deep.equal([false, "getenv_device_not_found"]);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith("envs_read_failed"), "reason lines").to.equal(1);
        });

        it("detail does not log the read error", async function () {
            couch.getError = Object.assign(new Error("read " + DB_ERROR + " " + OWNER), { statusCode: 500 });
            const device = newDevice();
            captureLogs();
            const calls = await collect((cb) => device.detail(UDID, cb));
            expect(calls[0]).to.deep.equal([false, "detail_device_not_found"]);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith("detail_read_failed"), "reason lines").to.equal(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("Deployment#validateHasUpdateAvailable", function () {

        it("does not log the device when the owner or udid is missing", function () {
            const deploy = new RealDeployment();
            captureLogs();
            const device = deviceDoc({ platform: "arduino" });
            delete device.owner;
            expect(deploy.validateHasUpdateAvailable(device)).to.equal(false);
            const device2 = deviceDoc({ platform: "arduino", owner: OWNER });
            delete device2.udid;
            expect(deploy.validateHasUpdateAvailable(device2)).to.equal(false);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });
    });
});
