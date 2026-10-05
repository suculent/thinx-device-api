/*
 * DeviceFirmwareOwnerSpec — quick 261003-vd4: Device#firmware loads only the device of the
 * owner whose API key it verified.
 *
 * Rule: a firmware request authenticated for owner B that names a udid owned by anyone else
 * answers exactly like an unknown udid, (false, "no_such_device") and the plain body
 * no_such_device over POST /device/firmware. The other owner's document is read once, for
 * the ownership compare only: it never reaches the deployment (initWithDevice,
 * latestFirmwareEnvelope, hasUpdateAvailable, latestFirmwarePath), its nid: notification
 * is neither read nor deleted, nothing is audited against it and no OTT is issued. A
 * malformed or missing udid never reaches CouchDB. The owner's own udid is served as before.
 *
 * Runs without Redis and without CouchDB. lib/thinx/couch.js, lib/thinx/audit.js and
 * lib/thinx/deployment.js are swapped in require.cache for an in-memory fake CouchDB (gets
 * counted), a recording audit log and a recording deployment, and a fresh copy of
 * lib/thinx/device.js is loaded against them (the DeviceRegisterOwnerSpec pattern). The
 * deployment knows two builds: A's own build for (A, UDID_A) and a stale build of B for
 * (B, UDID_A), a previous owner's leftover deploy dir. A Map-backed Redis stub records
 * get/set/del keys. The swap lives in the outer describe's beforeAll/afterAll, so it never
 * leaks into the other spec files CI runs in the same process.
 *
 * Nothing here prints a key, a key hash or a device document; assertions compare
 * booleans, counts, exact strings, sizes and udids only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const express = require("express");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const expect = require("chai").expect;
const sha256 = require("sha256");
const md5 = require("md5");

const Globals = require("../../lib/thinx/globals");
const InfluxConnector = require("../../lib/thinx/influx");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const DEPLOYMENT_PATH = require.resolve("../../lib/thinx/deployment");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const ROUTER_DEVICEAPI_PATH = require.resolve("../../lib/router.deviceapi");

const SWAPPED = [COUCH_PATH, AUDIT_PATH, DEPLOYMENT_PATH, DEVICE_PATH];

const PREFIX = Globals.prefix();

const OWNER_A = sha256(PREFIX + "vd4-owner-a@example.com");
const OWNER_B = sha256(PREFIX + "vd4-owner-b@example.com");

const KEY_A = sha256("vd4-key-a");
const KEY_B = sha256("vd4-key-b");

const MAC_A = "7D:40:00:00:00:A1";
const MAC_B = "7D:40:00:00:00:B1";

const UDID_A = "a7d40000-0000-4000-8000-0000000000a1";
const UDID_B = "b7d40000-0000-4000-8000-0000000000b1";
const UDID_FREE = "c7d40000-0000-4000-8000-0000000000c1";
const UDID_BROKEN = "d7d40000-0000-4000-8000-0000000000d1";

const SIZE_A = 2048;
const SIZE_B_STALE = 3072;

const TIMEOUT = 15000;

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = { devices: {}, gets: 0 };

function copy(x) {
    return (typeof (x) === "undefined") ? undefined : JSON.parse(JSON.stringify(x));
}

function has(map, id) {
    return (typeof (id) === "string") && Object.prototype.hasOwnProperty.call(map, id);
}

function notFound() {
    return Object.assign(new Error("Error: missing"), { statusCode: 404, reason: "missing" });
}

function seedCouch() {
    couch.devices = {};
    couch.devices[UDID_A] = {
        _id: UDID_A, _rev: "1-a1", udid: UDID_A, owner: OWNER_A, mac: MAC_A, alias: "vd4-a",
        auto_update: true, version: "1.0.0", transformers: [], mesh_ids: []
    };
    couch.devices[UDID_B] = {
        _id: UDID_B, _rev: "1-b1", udid: UDID_B, owner: OWNER_B, mac: MAC_B, alias: "vd4-b",
        auto_update: true, version: "1.0.0", transformers: [], mesh_ids: []
    };
    couch.gets = 0;
}

function answer(cb, err, body) {
    if (typeof (cb) === "function") {
        setImmediate(() => cb(err, body));
        return undefined;
    }
    return err ? Promise.reject(err) : Promise.resolve(body);
}

const deviceDb = {
    get(id, cb) {
        couch.gets++;
        if (id === UDID_BROKEN) {
            return answer(cb, Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
        }
        if (has(couch.devices, id)) return answer(cb, null, copy(couch.devices[id]));
        return answer(cb, notFound());
    }
};

function otherDbMethod() {
    return new Promise(() => { /* never settles: no other database is expected here */ });
}

const otherDb = { get: otherDbMethod, view: otherDbMethod, atomic: otherDbMethod, insert: otherDbMethod, destroy: otherDbMethod };

function useDb(name) {
    if ((typeof (name) === "string") && name.endsWith("managed_devices")) return deviceDb;
    return otherDb;
}

function fakeCouch() {
    return { use: useDb, db: { use: useDb } };
}

// ---------------------------------------------------------------------------
// Audit and deployment stubs
// ---------------------------------------------------------------------------

let auditEntries = [];
class AuditStub {
    log(owner, message, level) { auditEntries.push({ owner: owner, message: message, level: level }); }
}

// Temp builds: <tmp>/a (A's own build) and <tmp>/b-stale (B's leftover for UDID_A).
let buildRoot = null;
let builds = {};

function buildFor(owner, udid) {
    if ((owner === OWNER_A) && (udid === UDID_A)) return builds.a;
    if ((owner === OWNER_B) && (udid === UDID_A)) return builds.bStale;
    return null;
}

let deployCalls = [];
class DeploymentStub {
    initWithOwner(owner) {
        deployCalls.push({ fn: "initWithOwner", owner: owner, udid: null });
    }
    initWithDevice(device) {
        const d = ((typeof (device) === "object") && (device !== null)) ? device : {};
        deployCalls.push({ fn: "initWithDevice", owner: d.owner, udid: d.udid });
    }
    latestFirmwareEnvelope(owner, udid) {
        deployCalls.push({ fn: "latestFirmwareEnvelope", owner: owner, udid: udid });
        if (buildFor(owner, udid) === null) return false;
        return { mac: MAC_A, version: "1.0.1", platform: "arduino" };
    }
    hasUpdateAvailable(device) {
        const d = ((typeof (device) === "object") && (device !== null)) ? device : {};
        deployCalls.push({ fn: "hasUpdateAvailable", owner: d.owner, udid: d.udid });
        return DeploymentStub.updateAvailable;
    }
    latestFirmwarePath(owner, udid, callback) {
        deployCalls.push({ fn: "latestFirmwarePath", owner: owner, udid: udid });
        const b = buildFor(owner, udid);
        setImmediate(() => callback(b === null ? false : b.bin));
    }
}
DeploymentStub.updateAvailable = true;

// ---------------------------------------------------------------------------
// Redis stub
// ---------------------------------------------------------------------------

function makeRedisStub() {
    const store = new Map();
    const stub = { store: store, gets: [], sets: [], dels: [] };
    function lastCallback(args) {
        for (let i = args.length - 1; i >= 0; i--) {
            if (typeof (args[i]) === "function") return args[i];
        }
        return null;
    }
    function later(cb, err, value) {
        if (cb) setImmediate(() => cb(err, value));
    }
    stub.get = function (key, ...rest) {
        stub.gets.push(key);
        later(lastCallback(rest), null, store.has(key) ? store.get(key) : null);
    };
    stub.set = function (key, value, ...rest) {
        stub.sets.push(key);
        store.set(key, String(value));
        later(lastCallback(rest), null, "OK");
    };
    stub.del = function (key, ...rest) {
        stub.dels.push(key);
        store.delete(key);
        later(lastCallback(rest), null, 1);
    };
    stub.expire = function (key, ...rest) {
        later(lastCallback(rest), null, 1);
    };
    stub.ttl = function (key, ...rest) {
        later(lastCallback(rest), null, -1);
    };
    stub.keys = function (pattern, ...rest) {
        later(lastCallback(rest), null, []);
    };
    stub.SMEMBERS = function (key, cb) {
        later(cb, null, []);
    };
    stub.sAdd = function (key, members, cb) {
        later(cb, null, Array.isArray(members) ? members.length : 1);
    };
    stub.on = function () { /* no-op */ };
    return stub;
}

function seedRedis(redis) {
    redis.store.clear();
    redis.store.set("ak:" + OWNER_A, JSON.stringify([{ key: KEY_A, hash: sha256(KEY_A), alias: "vd4-key-a" }]));
    redis.store.set("ak:" + OWNER_B, JSON.stringify([{ key: KEY_B, hash: sha256(KEY_B), alias: "vd4-key-b" }]));
    redis.store.set("nid:" + UDID_A, JSON.stringify({ done: true }));
    redis.gets = [];
    redis.sets = [];
    redis.dels = [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let saved = {};
let savedStatsLog = null;
let Device = null;
let device = null;
let redis = null;
let server = null;
let ottCalls = [];
let ottAnswers = [];

function REG(owner, udid, extra) {
    const reg = { mac: MAC_A, owner: owner, alias: "vd4-reg", version: "1.0.0", platform: "arduino" };
    if (typeof (udid) !== "undefined") reg.udid = udid;
    return Object.assign(reg, extra || {});
}

function REQ(key, reg) {
    return { headers: { authentication: key }, body: { registration: reg } };
}

// Resolves on the FIRST callback, after a 50 ms settle so fire-and-forget nid reads and
// deletes are recorded before the assertions run.
function callFirmware(req) {
    return new Promise((resolve) => {
        let done = false;
        device.firmware(req, (success, response) => {
            if (done) return;
            done = true;
            setTimeout(() => resolve({ success: success, response: response }), 50);
        });
    });
}

function send(key, body) {
    return new Promise((resolve) => {
        const payload = JSON.stringify(body);
        const req = http.request({
            host: "127.0.0.1",
            port: server.address().port,
            method: "POST",
            path: "/device/firmware",
            headers: {
                Authentication: key,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
            },
            agent: false
        }, (res) => {
            let text = "";
            res.on("data", (chunk) => { text += chunk; });
            res.on("end", () => resolve({ status: res.statusCode, text: text }));
        });
        req.on("error", (e) => resolve({ status: null, text: "", error: e.code || "error" }));
        req.write(payload);
        req.end();
    });
}

function parsedJSON(text) {
    try { return JSON.parse(text); } catch (_e) { return null; }
}

function callsFor(owner) {
    return deployCalls.filter((c) => c.owner === owner);
}

function ottKeys() {
    return redis.sets.filter((k) => (typeof (k) === "string") && (k.indexOf("ott:") === 0));
}

function expectForeignUntouched(r, label) {
    const l = (label || "") + " ";
    expect(r.success, l + "success").to.equal(false);
    expect(r.response, l + "answer").to.equal("no_such_device");
    expect(deployCalls.length, l + "deployment calls").to.equal(0);
    expect(auditEntries.filter((e) => e.owner === OWNER_A).length, l + "audit entries for owner A").to.equal(0);
    expect(redis.gets.indexOf("nid:" + UDID_A), l + "nid get").to.equal(-1);
    expect(redis.dels.indexOf("nid:" + UDID_A), l + "nid del").to.equal(-1);
    expect(redis.store.has("nid:" + UDID_A), l + "nid still stored").to.equal(true);
    expect(ottCalls.length, l + "OTT entry point calls").to.equal(0);
    expect(ottKeys().length, l + "ott: keys stored").to.equal(0);
    expect(couch.gets, l + "CouchDB gets").to.equal(1);
}

describe("DeviceFirmwareOwnerSpec (quick 261003-vd4)", function () {

    beforeAll(async () => {
        // Bind the real modules (and their whole dependency tree) before the swap, so
        // nothing that stays in require.cache ever captures the fakes.
        require(DEVICE_PATH);
        require("../../lib/thinx/util.js");
        require(ROUTER_DEVICEAPI_PATH);

        saved = {};
        for (const p of SWAPPED) saved[p] = require.cache[p];

        require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
        require.cache[AUDIT_PATH] = { id: AUDIT_PATH, filename: AUDIT_PATH, loaded: true, exports: AuditStub };
        require.cache[DEPLOYMENT_PATH] = { id: DEPLOYMENT_PATH, filename: DEPLOYMENT_PATH, loaded: true, exports: DeploymentStub };
        delete require.cache[DEVICE_PATH];

        Device = require(DEVICE_PATH);

        savedStatsLog = InfluxConnector.statsLog;
        InfluxConnector.statsLog = function () { /* offline */ };

        buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vd4-builds-"));
        builds = {};
        for (const [name, dir, size, byte] of [["a", "a", SIZE_A, 0x41], ["bStale", "b-stale", SIZE_B_STALE, 0x42]]) {
            const d = path.join(buildRoot, dir);
            fs.mkdirSync(d);
            fs.writeFileSync(path.join(d, "build.json"), JSON.stringify({ platform: "arduino" }));
            const buffer = Buffer.alloc(size, byte);
            fs.writeFileSync(path.join(d, "firmware.bin"), buffer);
            builds[name] = { bin: path.join(d, "firmware.bin"), size: size, md5: md5(buffer) };
        }

        redis = makeRedisStub();
        seedRedis(redis);
        device = new Device(redis);
        device.owner = { profile: (o, cb) => cb(true, { info: { goals: [], transformers: [] } }) };
        // The API-key module was bound before the swap; keep its audit offline and recorded.
        device.apikey.alog = new AuditStub();

        // Spy on the OTT entry point firmware()'s OTT branch calls (quick 261003-v9x).
        const realOttRequest = device.ott_request.bind(device);
        device.ott_request = function (req, callback) {
            ottCalls.push({ req: req });
            realOttRequest(req, (success, response) => {
                ottAnswers.push({ success: success, response: response });
                callback(success, response);
            });
        };

        const app = express();
        app.use(express.json());
        app.device = device;
        require(ROUTER_DEVICEAPI_PATH)(app);
        server = await new Promise((resolve) => {
            const s = http.createServer(app).listen(0, "127.0.0.1", () => resolve(s));
        });
    });

    afterAll(async () => {
        if (server) await new Promise((resolve) => server.close(() => resolve()));
        server = null;
        for (const p of SWAPPED) {
            if (saved[p]) require.cache[p] = saved[p]; else delete require.cache[p];
        }
        if (savedStatsLog) InfluxConnector.statsLog = savedStatsLog;
        if (buildRoot) fs.rmSync(buildRoot, { recursive: true, force: true });
        buildRoot = null;
    });

    beforeEach(() => {
        seedCouch();
        seedRedis(redis);
        auditEntries = [];
        deployCalls = [];
        ottCalls = [];
        ottAnswers = [];
        DeploymentStub.updateAvailable = true;
    });

    // -----------------------------------------------------------------------
    describe("VD4 tracer", function () {

        it("1. A's key with A's udid is served A's own build", async function () {
            const r = await callFirmware(REQ(KEY_A, REG(OWNER_A, UDID_A)));
            expect(r.success).to.equal(true);
            expect(r.response.filesize).to.equal(SIZE_A);
            expect(r.response.md5 === builds.a.md5, "A's md5").to.equal(true);
            const init = deployCalls.filter((c) => c.fn === "initWithDevice");
            expect(init.length, "initWithDevice calls").to.equal(1);
            expect(init[0].owner === OWNER_A, "initWithDevice owner is A").to.equal(true);
            expect(init[0].udid).to.equal(UDID_A);
            const lfp = deployCalls.filter((c) => c.fn === "latestFirmwarePath");
            expect(lfp.length, "latestFirmwarePath calls").to.equal(1);
            expect(lfp[0].owner === OWNER_A, "latestFirmwarePath owner is A").to.equal(true);
            expect(lfp[0].udid).to.equal(UDID_A);
            expect(callsFor(OWNER_B).length, "deployment calls with owner B").to.equal(0);
        }, TIMEOUT);

        it("2. POST /device/firmware: A's own udid is served, B's key with A's udid answers no_such_device", async function () {
            const own = await send(KEY_A, { registration: REG(OWNER_A, UDID_A) });
            expect(own.status).to.equal(200);
            const body = parsedJSON(own.text) || {};
            expect(body.filesize).to.equal(SIZE_A);

            deployCalls = [];
            const foreign = await send(KEY_B, { registration: REG(OWNER_B, UDID_A) });
            expect(foreign.status).to.equal(200);
            expect(foreign.text).to.equal("no_such_device");
            expect(deployCalls.length, "deployment calls for the foreign request").to.equal(0);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("VD4 core: foreign udid", function () {

        it("3. B's key with A's udid, no update available, answers no_such_device and leaves A alone", async function () {
            DeploymentStub.updateAvailable = false;
            const r = await callFirmware(REQ(KEY_B, REG(OWNER_B, UDID_A)));
            expectForeignUntouched(r, "plain");
        }, TIMEOUT);

        it("4. B's key with A's udid and forced answers no_such_device and serves nothing", async function () {
            const r = await callFirmware(REQ(KEY_B, REG(OWNER_B, UDID_A, { forced: true })));
            expectForeignUntouched(r, "forced");
        }, TIMEOUT);

        it("5. B's key with A's udid and ott answers no_such_device and issues no OTT", async function () {
            const r = await callFirmware(REQ(KEY_B, REG(OWNER_B, UDID_A, { ott: "1" })));
            expectForeignUntouched(r, "ott");
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("VD4 core: unknown or invalid udid", function () {

        it("6. an unknown udid answers no_such_device with no deployment call", async function () {
            const r = await callFirmware(REQ(KEY_B, REG(OWNER_B, UDID_FREE)));
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("no_such_device");
            expect(deployCalls.length, "deployment calls").to.equal(0);
        }, TIMEOUT);

        it("7. a malformed or missing udid answers no_such_device without reaching CouchDB", async function () {
            const malformed = await callFirmware(REQ(KEY_B, REG(OWNER_B, "not-a-udid")));
            expect(malformed.success).to.equal(false);
            expect(malformed.response).to.equal("no_such_device");
            expect(couch.gets, "CouchDB gets for a malformed udid").to.equal(0);

            const missing = await callFirmware(REQ(KEY_B, REG(OWNER_B)));
            expect(missing.success).to.equal(false);
            expect(missing.response).to.equal("no_such_device");
            expect(couch.gets, "CouchDB gets for a missing udid").to.equal(0);
            expect(deployCalls.length, "deployment calls").to.equal(0);
        }, TIMEOUT);

        it("8. an unverifiable lookup (CouchDB error) answers no_such_device", async function () {
            const r = await callFirmware(REQ(KEY_B, REG(OWNER_B, UDID_BROKEN)));
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("no_such_device");
            expect(deployCalls.length, "deployment calls").to.equal(0);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("VD4 core: verified owner first", function () {

        it("9. a key that does not verify for the body owner gets the verify message before any device lookup", async function () {
            // No udid: verify has nothing to look up, so CouchDB is never read.
            const bare = await callFirmware(REQ(KEY_B, REG(OWNER_A)));
            expect(bare.success).to.equal(false);
            expect(bare.response).to.deep.equal({ success: false, response: "owner_found_but_no_key" });
            expect(couch.gets, "CouchDB gets without a udid").to.equal(0);

            // With A's udid: the only read is quick 261003-u86's transfer-redirect lookup
            // inside APIKey#verify (current owner A === presented owner A: no redirect);
            // firmware() itself never looks the device up.
            const named = await callFirmware(REQ(KEY_B, REG(OWNER_A, UDID_A)));
            expect(named.success).to.equal(false);
            expect(named.response).to.deep.equal({ success: false, response: "owner_found_but_no_key" });
            expect(couch.gets, "CouchDB gets (verify's transfer-redirect lookup only)").to.equal(1);
            expect(deployCalls.length, "deployment calls").to.equal(0);
            expect(ottCalls.length, "OTT entry point calls").to.equal(0);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("VD4 OTT branch", function () {

        it("10. A's key with A's udid and ott delegates to the OTT entry point and answers what it answers", async function () {
            const req = REQ(KEY_A, REG(OWNER_A, UDID_A, { ott: "1" }));
            const r = await callFirmware(req);
            expect(ottCalls.length, "OTT entry point calls").to.equal(1);
            expect(ottCalls[0].req === req, "the same req object").to.equal(true);
            expect(ottAnswers.length, "OTT entry point answers").to.equal(1);
            expect(r.success).to.equal(ottAnswers[0].success);
            expect(r.response).to.deep.equal(ottAnswers[0].response);
            expect(r.success).to.equal(true);
            const keys = ottKeys();
            expect(keys.length, "ott: keys stored").to.equal(1);
            const record = JSON.parse(redis.store.get(keys[0]) || "{}");
            expect(record.owner === OWNER_A, "OTT record owner is A").to.equal(true);
            expect(record.udid).to.equal(UDID_A);
        }, TIMEOUT);
    });
});
