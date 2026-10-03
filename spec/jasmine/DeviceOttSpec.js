/*
 * DeviceOttSpec — quick 261003-v9x: One-Time-Token (OTT) firmware tokens are bound to the
 * verified key owner's device.
 *
 * Runs without Redis and without CouchDB. lib/thinx/couch.js, lib/thinx/audit.js and
 * lib/thinx/deployment.js are swapped in require.cache for an in-memory fake CouchDB, a
 * no-op audit log and a deployment stub whose firmware lives in a temporary directory,
 * and a fresh copy of lib/thinx/device.js is loaded against them. A Map-backed Redis stub
 * records reads, SET arguments, TTLs and EXPIRE calls. The swap lives in the outer
 * describe's beforeAll/afterAll, so it never leaks into the other spec files CI runs in
 * the same process.
 *
 * Pinned behaviour:
 * - POST /device/firmware {use: "ott", owner, udid} with the exact key of the body owner,
 *   for a device that owner owns, answers {ott: <64 lowercase hex>} and stores under
 *   ott:<token> exactly {owner, udid} with a 24 h expiry set by the same SET command;
 * - no key, another owner's key, a missing/malformed/non-string owner → OTT_API_KEY_NOT_VALID;
 *   another owner's, absent, malformed, traversal or missing udid → no_such_device; nothing
 *   is written under ott: in either case;
 * - redemption (GET /device/firmware?ott=) serves only the bound owner's latest firmware
 *   for the bound udid: a malformed token never reaches Redis; a record that does not
 *   parse, fails sanitka or is no longer owned is refused (OTT_INFO_NOT_FOUND) and deleted;
 * - tokens are 32 random bytes; the first redemption lowers the lifetime to at most
 *   3600 s and nothing ever raises it again (reuse inside that window is deliberate:
 *   THiNXLib retries the same URL);
 * - a FIRMWARE_UPDATE check-in stores {owner: the checked-in device's owner, udid: the
 *   checked-in udid}, never the registration body; a failed store answers status OK;
 * - no console line of the OTT issue/redeem paths contains a full token.
 *
 * Nothing here prints a key, a token or a stored record; assertions compare booleans,
 * counts, exact strings and udids only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const express = require("express");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const nodeUtil = require("util");
const expect = require("chai").expect;
const sha256 = require("sha256");
const md5 = require("md5");

const Globals = require("../../lib/thinx/globals");
const Sanitka = require("../../lib/thinx/sanitka");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const DEPLOYMENT_PATH = require.resolve("../../lib/thinx/deployment");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const ROUTER_DEVICEAPI_PATH = require.resolve("../../lib/router.deviceapi");

const SWAPPED = [COUCH_PATH, AUDIT_PATH, DEPLOYMENT_PATH, DEVICE_PATH];

const PREFIX = Globals.prefix();

const OWNER_A = sha256(PREFIX + "v9x-owner-a@example.com");
const OWNER_B = sha256(PREFIX + "v9x-owner-b@example.com");

const KEY_A = sha256("v9x-key-a");
const KEY_B = sha256("v9x-key-b");

const UDID_A = "a9900000-0000-4000-8000-0000000000a1";
const UDID_B = "b9900000-0000-4000-8000-0000000000b1";
const UDID_B2 = "b9900000-0000-4000-8000-0000000000b2";
const UDID_FREE = "c9900000-0000-4000-8000-0000000000c1";

const MAC_A = "7E:59:00:00:00:A1";
const MAC_B = "7E:59:00:00:00:B1";
const MAC_B2 = "7E:59:00:00:00:B2";

const TRAVERSAL = "../" + OWNER_A + "/" + UDID_A;

const MARK_A = "v9x-fw-A";
const MARK_B = "v9x-fw-B";

const ENV_SENTINEL = "v9x-env-sentinel-pass";
const PUSH_SENTINEL = "v9x-push-sentinel";

const HEX64 = /^[a-f0-9]{64}$/;

const TIMEOUT = 15000;

let ROOT = null;
let FW_A = null;
let FW_B = null;

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = { devices: {}, writes: [] };

function copy(x) {
    return (typeof (x) === "undefined") ? undefined : JSON.parse(JSON.stringify(x));
}

function has(map, id) {
    return (typeof (id) === "string") && Object.prototype.hasOwnProperty.call(map, id);
}

function notFound() {
    return Object.assign(new Error("Error: missing"), { statusCode: 404, reason: "missing" });
}

function deviceDoc(udid, owner, mac, alias, extra) {
    return Object.assign({
        _id: udid, _rev: "1-" + udid.slice(-2), udid: udid, owner: owner, mac: mac, alias: alias,
        mesh_ids: [], transformers: [], auto_update: false
    }, extra || {});
}

function seedCouch() {
    couch.devices = {};
    const docs = [
        deviceDoc(UDID_A, OWNER_A, MAC_A, "v9x-a1", { auto_update: true, environment: { pass: ENV_SENTINEL } }),
        deviceDoc(UDID_B, OWNER_B, MAC_B, "v9x-b1", { auto_update: true }),
        deviceDoc(UDID_B2, OWNER_B, MAC_B2, "v9x-b2", { auto_update: false })
    ];
    for (const d of docs) couch.devices[d._id] = copy(d);
    couch.writes = [];
}

// Answers through the trailing callback (deferred, like nano), or a promise without one.
function answer(cb, err, body) {
    if (typeof (cb) === "function") {
        setImmediate(() => cb(err, body));
        return undefined;
    }
    return err ? Promise.reject(err) : Promise.resolve(body);
}

const deviceDb = {
    get(id, cb) {
        if (has(couch.devices, id)) return answer(cb, null, copy(couch.devices[id]));
        return answer(cb, notFound());
    },
    view(design, name, params, cb) {
        const key = params ? params.key : undefined;
        let docs = Object.keys(couch.devices).map((k) => couch.devices[k]);
        if (name === "devices_by_mac") docs = docs.filter((d) => d.mac === key);
        else if (name === "devices_by_owner") docs = docs.filter((d) => d.owner === key);
        else docs = [];
        docs.sort((x, y) => (x._id < y._id ? -1 : (x._id > y._id ? 1 : 0)));
        return answer(cb, null, { rows: docs.map((d) => ({ id: d._id, key: key, value: copy(d), doc: copy(d) })) });
    },
    atomic(design, update, id, changes, cb) {
        couch.writes.push({ op: "atomic", id: id });
        if (!has(couch.devices, id)) return answer(cb, notFound());
        Object.assign(couch.devices[id], copy(changes));
        return answer(cb, null, { ok: true });
    },
    insert(doc, id, cb) {
        couch.writes.push({ op: "insert", id: id });
        if (has(couch.devices, id)) {
            return answer(cb, Object.assign(new Error("Document update conflict."), { statusCode: 409, error: "conflict" }));
        }
        const docId = (typeof (id) === "string") ? id : ("auto-" + couch.writes.length);
        couch.devices[docId] = copy(doc);
        return answer(cb, null, { ok: true, id: docId });
    },
    destroy(id, rev, cb) {
        couch.writes.push({ op: "destroy", id: id });
        if (!has(couch.devices, id)) return answer(cb, notFound());
        delete couch.devices[id];
        return answer(cb, null, { ok: true });
    }
};

function otherDbMethod() {
    const args = Array.prototype.slice.call(arguments);
    const cb = args[args.length - 1];
    if (typeof (cb) === "function") setImmediate(() => cb(notFound()));
    return new Promise(() => { /* never settles: no other database is expected here */ });
}

const otherDb = { get: otherDbMethod, view: otherDbMethod, atomic: otherDbMethod, insert: otherDbMethod, destroy: otherDbMethod };

function useDb(name) {
    if (typeof (name) === "string" && name.endsWith("managed_devices")) return deviceDb;
    return otherDb;
}

function fakeCouch() {
    return { use: useDb, db: { use: useDb } };
}

class AuditStub {
    log() { /* no-op */ }
}

// Firmware lives under ROOT/<owner>/<udid>/ (build.json + firmware.bin). The directory is
// built by plain concatenation, like Filez.deployPathForDevice, so a traversal udid really
// reaches another owner's directory when it gets this far.
let deployCalls = [];
class DeploymentStub {
    initWithOwner() { /* no-op */ }
    initWithDevice() { /* no-op */ }
    hasUpdateAvailable() { return DeploymentStub.updateAvailable; }
    latestFirmwareEnvelope(owner, udid) {
        const doc = has(couch.devices, udid) ? couch.devices[udid] : {};
        return { mac: doc.mac, version: "9.9.9" };
    }
    latestFirmwarePath(owner, udid, callback) {
        deployCalls.push({ owner: owner, udid: udid });
        const dir = ROOT + "/" + owner + "/" + udid;
        const found = fs.existsSync(dir + "/build.json") ? dir + "/firmware.bin" : false;
        setImmediate(() => callback(found));
    }
}
DeploymentStub.updateAvailable = false;

// ---------------------------------------------------------------------------
// Redis stub
// ---------------------------------------------------------------------------

function makeRedisStub() {
    const store = new Map();
    const ttls = new Map();
    const stub = {
        store: store, ttls: ttls, gets: [], sets: [], expires: [], sadds: [], failSetPrefix: null
    };
    function split(args) {
        const list = args.slice();
        let cb = null;
        if (list.length > 0 && typeof (list[list.length - 1]) === "function") cb = list.pop();
        return { args: list, cb: cb };
    }
    function later(cb, err, value) {
        if (cb) setImmediate(() => cb(err, value));
    }
    stub.get = function (key, ...rest) {
        stub.gets.push(key);
        later(split(rest).cb, null, store.has(key) ? store.get(key) : null);
    };
    stub.set = function (key, value, ...rest) {
        const s = split(rest);
        stub.sets.push({ key: key, args: s.args.map((a) => String(a)) });
        if ((typeof (stub.failSetPrefix) === "string") && (String(key).indexOf(stub.failSetPrefix) === 0)) {
            return later(s.cb, new Error("v9x redis set failure"));
        }
        store.set(key, String(value));
        if ((s.args.length >= 2) && (String(s.args[0]).toUpperCase() === "EX")) ttls.set(key, Number(s.args[1]));
        else ttls.delete(key);
        later(s.cb, null, "OK");
    };
    stub.expire = function (key, seconds, ...rest) {
        stub.expires.push({ key: key, seconds: Number(seconds) });
        const present = store.has(key);
        if (present) ttls.set(key, Number(seconds));
        later(split(rest).cb, null, present ? 1 : 0);
    };
    stub.ttl = function (key, ...rest) {
        let value = -2;
        if (store.has(key)) value = ttls.has(key) ? ttls.get(key) : -1;
        later(split(rest).cb, null, value);
    };
    stub.del = function (key, ...rest) {
        const present = store.delete(key);
        ttls.delete(key);
        later(split(rest).cb, null, present ? 1 : 0);
    };
    stub.keys = function (pattern, ...rest) {
        later(split(rest).cb, null, []);
    };
    stub.SMEMBERS = function (key, cb) {
        later(cb, null, []);
    };
    stub.sAdd = function (key, members, cb) {
        stub.sadds.push({ key: key });
        later(cb, null, Array.isArray(members) ? members.length : 1);
    };
    stub.on = function () { /* no-op */ };
    return stub;
}

function seedRedis(redis) {
    redis.store.clear();
    redis.ttls.clear();
    redis.store.set("ak:" + OWNER_A, JSON.stringify([{ key: KEY_A, hash: sha256(KEY_A), alias: "v9x-key-a" }]));
    redis.store.set("ak:" + OWNER_B, JSON.stringify([{ key: KEY_B, hash: sha256(KEY_B), alias: "v9x-key-b" }]));
    redis.gets = [];
    redis.sets = [];
    redis.expires = [];
    redis.sadds = [];
    redis.failSetPrefix = null;
    deployCalls = [];
    DeploymentStub.updateAvailable = false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let saved = {};
let Device = null;
let device = null;
let redis = null;
let server = null;

// Resolves with the arguments of the first callback; rejects after 2000 ms without one.
function call(fn) {
    return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
            if (!done) { done = true; reject(new Error("no callback")); }
        }, 2000);
        fn((...args) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(args);
        });
    });
}

// Captures console.log/info/warn/error during fn; returns the lines (util.format'ed).
async function capture(fn) {
    const names = ["log", "info", "warn", "error"];
    const original = {};
    const lines = [];
    for (const n of names) {
        original[n] = console[n];
        console[n] = (...args) => { lines.push(nodeUtil.format(...args)); };
    }
    try {
        await fn();
    } finally {
        for (const n of names) console[n] = original[n];
    }
    return lines;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// Waits until no Redis or CouchDB write was recorded for 200 ms (max 3000 ms), so a
// test's fire-and-forget MQTT authorization lands before the next test reseeds.
async function quiesce() {
    const deadline = Date.now() + 3000;
    let last = -1;
    let stableSince = Date.now();
    for (;;) {
        const n = redis.sets.length + redis.sadds.length + couch.writes.length;
        if (n !== last) {
            last = n;
            stableSince = Date.now();
        } else if (Date.now() - stableSince >= 200) {
            return;
        }
        if (Date.now() > deadline) return;
        await sleep(10);
    }
}

function reqOf(body, key) {
    return { body: body, headers: (typeof (key) === "string") ? { authentication: key } : {} };
}

function ottKeys() {
    return Array.from(redis.store.keys()).filter((k) => (typeof (k) === "string") && k.indexOf("ott:") === 0);
}

function ottSets() {
    return redis.sets.filter((s) => (typeof (s.key) === "string") && s.key.indexOf("ott:") === 0);
}

function record(token) {
    const raw = redis.store.get("ott:" + token);
    if (typeof (raw) !== "string") return null;
    try { return JSON.parse(raw); } catch (_e) { return null; }
}

function expectBinding(token, owner, udid, label) {
    const l = (label || "") + " ";
    const r = record(token);
    expect((typeof (r) === "object") && (r !== null), l + "stored record parses to an object").to.equal(true);
    expect(Object.keys(r).sort().join(","), l + "stored record keys").to.equal("owner,udid");
    expect(r.owner === owner, l + "stored owner is the expected owner").to.equal(true);
    expect(r.udid).to.equal(udid);
}

function seedToken(value, ttl) {
    const token = crypto.randomBytes(32).toString("hex");
    redis.store.set("ott:" + token, (typeof (value) === "string") ? value : JSON.stringify(value));
    if (typeof (ttl) === "number") redis.ttls.set("ott:" + token, ttl);
    return token;
}

async function issue(owner, udid, key) {
    const [ok, resp] = await call((cb) => device.ott_request(reqOf({ owner: owner, udid: udid }, key), cb));
    const token = ((typeof (resp) === "object") && (resp !== null)) ? resp.ott : undefined;
    return { ok: ok, resp: resp, token: token };
}

function redeem(token) {
    return call((cb) => device.ott_update(token, cb));
}

function servedMarker(resp) {
    if ((typeof (resp) !== "object") || (resp === null) || !Buffer.isBuffer(resp.payload)) return null;
    const text = resp.payload.toString("latin1");
    if (text.indexOf(MARK_A) !== -1) return "A";
    if (text.indexOf(MARK_B) !== -1) return "B";
    return "?";
}

function REG(owner, mac, extra) {
    return Object.assign({
        mac: mac, firmware: "v9x-fw", version: "1.0.0", alias: "v9x-reg", owner: owner, platform: "arduino"
    }, extra || {});
}

// Resolves on the FIRST register callback.
function register(reg, key) {
    return new Promise((resolve) => {
        let done = false;
        device.register(reg, key, { end() { /* no-op */ } }, (_res, success, response) => {
            if (done) return;
            done = true;
            resolve({ success: success, response: response });
        });
    });
}

function regOf(result) {
    let parsed = result.response;
    if (typeof (parsed) === "string") {
        try { parsed = JSON.parse(parsed); } catch (_e) { parsed = {}; }
    }
    const r = ((typeof (parsed) === "object") && (parsed !== null)) ? parsed.registration : null;
    return ((typeof (r) === "object") && (r !== null)) ? r : {};
}

// Issue one request to the bare express app. opts: { key, body, headOnly }.
// headOnly resolves with status and headers and destroys the response unread.
function send(method, urlPath, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
        const headers = {};
        if (typeof (o.key) === "string") headers.Authentication = o.key;
        let payload = null;
        if (typeof (o.body) !== "undefined") {
            payload = JSON.stringify(o.body);
            headers["Content-Type"] = "application/json";
            headers["Content-Length"] = Buffer.byteLength(payload);
        }
        const req = http.request({
            host: "127.0.0.1",
            port: server.address().port,
            method: method,
            path: urlPath,
            headers: headers,
            agent: false
        }, (res) => {
            if (o.headOnly) {
                resolve({ status: res.statusCode, headers: res.headers });
                res.destroy();
                return;
            }
            let text = "";
            res.on("data", (chunk) => { text += chunk; });
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: text }));
        });
        // A broken response (e.g. a body longer than its Content-Length) resolves with the
        // client error code instead of rejecting, so the case fails on its assertions.
        req.on("error", (e) => resolve({ status: null, headers: {}, text: "", error: e.code }));
        if (payload !== null) req.write(payload);
        req.end();
    });
}

function firmwareBlob(marker) {
    const buf = Buffer.alloc(2048, 0x2e);
    buf.write(marker, 0, "latin1");
    return buf;
}

function writeFixture(owner, udid, marker) {
    const dir = path.join(ROOT, owner, udid);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "build.json"), JSON.stringify({ platform: "arduino" }));
    const blob = firmwareBlob(marker);
    fs.writeFileSync(path.join(dir, "firmware.bin"), blob);
    return { path: path.join(dir, "firmware.bin"), md5: md5(blob) };
}

describe("DeviceOttSpec (quick 261003-v9x)", function () {

    beforeAll(async () => {
        // Bind the real modules (and their whole dependency tree) before the swap, so
        // nothing that stays in require.cache ever captures the fakes.
        require(DEVICE_PATH);
        require("../../lib/thinx/util.js");
        require(ROUTER_DEVICEAPI_PATH);

        ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "v9x-ott-"));
        FW_A = writeFixture(OWNER_A, UDID_A, MARK_A);
        FW_B = writeFixture(OWNER_B, UDID_B, MARK_B);

        saved = {};
        for (const p of SWAPPED) saved[p] = require.cache[p];

        require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
        require.cache[AUDIT_PATH] = { id: AUDIT_PATH, filename: AUDIT_PATH, loaded: true, exports: AuditStub };
        require.cache[DEPLOYMENT_PATH] = { id: DEPLOYMENT_PATH, filename: DEPLOYMENT_PATH, loaded: true, exports: DeploymentStub };
        delete require.cache[DEVICE_PATH];

        Device = require(DEVICE_PATH);

        redis = makeRedisStub();
        seedRedis(redis);
        device = new Device(redis);
        device.owner = { profile: (o, cb) => cb(true, { info: { goals: [], transformers: [] } }) };
        // The API-key module was bound before the swap; keep its rejected-key audit offline.
        device.apikey.alog = new AuditStub();

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
        if (ROOT) fs.rmSync(ROOT, { recursive: true, force: true });
        ROOT = null;
    });

    beforeEach(() => {
        seedCouch();
        seedRedis(redis);
    });

    afterEach(async () => {
        await quiesce();
    }, TIMEOUT);

    // -----------------------------------------------------------------------
    describe("OTT core: issuance", function () {

        it("I1. the body owner's exact key on its own device issues a random token bound to {owner, udid} for 24 h", async function () {
            const r = await issue(OWNER_B, UDID_B, KEY_B);
            expect(r.ok).to.equal(true);
            expect(HEX64.test(r.token), "ott is 64 lowercase hex").to.equal(true);
            expect(ottKeys().length, "ott: keys").to.equal(1);
            expect(ottKeys()[0] === "ott:" + r.token, "the ott: key is the issued token").to.equal(true);
            expectBinding(r.token, OWNER_B, UDID_B);
            const sets = ottSets();
            expect(sets.length, "ott: SET calls").to.equal(1);
            expect(sets[0].args.join(" "), "SET carries EX 86400").to.equal("EX 86400");
            expect(redis.ttls.get("ott:" + r.token)).to.equal(86400);
        }, TIMEOUT);

        it("I2. a body wrapped in registration (the device.firmware shape) is issued and bound the same way", async function () {
            const [ok, resp] = await call((cb) => device.ott_request(reqOf({ registration: { owner: OWNER_B, udid: UDID_B } }, KEY_B), cb));
            expect(ok).to.equal(true);
            const token = ((typeof (resp) === "object") && (resp !== null)) ? resp.ott : undefined;
            expect(HEX64.test(token), "ott is 64 lowercase hex").to.equal(true);
            expectBinding(token, OWNER_B, UDID_B);
        }, TIMEOUT);

        it("I3. extra body fields never reach the stored record", async function () {
            const body = {
                owner: OWNER_B, udid: UDID_B, push: PUSH_SENTINEL, lat: 50.1, lon: 14.4,
                environment: { pass: ENV_SENTINEL }, api_key: KEY_B, mac: MAC_B
            };
            const [ok, resp] = await call((cb) => device.ott_request(reqOf(body, KEY_B), cb));
            expect(ok).to.equal(true);
            const token = ((typeof (resp) === "object") && (resp !== null)) ? resp.ott : undefined;
            expectBinding(token, OWNER_B, UDID_B);
            const raw = String(redis.store.get("ott:" + token));
            for (const m of [PUSH_SENTINEL, ENV_SENTINEL, KEY_B, MAC_B, "50.1", "14.4"]) {
                expect(raw.indexOf(m) === -1, "stored record carries a request field").to.equal(true);
            }
        }, TIMEOUT);

        it("I4. no Authentication header is refused with nothing written", async function () {
            const [ok, resp] = await call((cb) => device.ott_request(reqOf({ owner: OWNER_B, udid: UDID_B }), cb));
            expect(ok).to.equal(false);
            expect(resp).to.equal("OTT_API_KEY_NOT_VALID");
            expect(ottKeys().length).to.equal(0);
            expect(ottSets().length).to.equal(0);
        }, TIMEOUT);

        it("I5. another owner's key for the body owner is refused with nothing written", async function () {
            const [ok, resp] = await call((cb) => device.ott_request(reqOf({ owner: OWNER_B, udid: UDID_B }, KEY_A), cb));
            expect(ok).to.equal(false);
            expect(resp).to.equal("OTT_API_KEY_NOT_VALID");
            expect(ottKeys().length).to.equal(0);
            expect(ottSets().length).to.equal(0);
        }, TIMEOUT);

        it("I6. a missing, malformed or non-string body owner is refused without a throw", async function () {
            const owners = [undefined, "not-an-owner!!", 42, { owner: OWNER_B }];
            for (const o of owners) {
                const body = { udid: UDID_B };
                if (typeof (o) !== "undefined") body.owner = o;
                const [ok, resp] = await call((cb) => device.ott_request(reqOf(body, KEY_B), cb));
                expect(ok, "owner of type " + typeof (o)).to.equal(false);
                expect(resp).to.equal("OTT_API_KEY_NOT_VALID");
            }
            expect(ottKeys().length).to.equal(0);
            expect(ottSets().length).to.equal(0);
        }, TIMEOUT);

        it("I7. another owner's udid is refused as no_such_device with nothing written", async function () {
            const r = await issue(OWNER_B, UDID_A, KEY_B);
            expect(r.ok).to.equal(false);
            expect(r.resp).to.equal("no_such_device");
            expect(ottKeys().length).to.equal(0);
            expect(ottSets().length).to.equal(0);
        }, TIMEOUT);

        it("I8. an absent, malformed, traversal or missing udid is refused as no_such_device", async function () {
            for (const u of [UDID_FREE, "zz-not-a-udid", TRAVERSAL, undefined]) {
                const r = await issue(OWNER_B, u, KEY_B);
                expect(r.ok, "udid " + (u === TRAVERSAL ? "<traversal>" : String(u))).to.equal(false);
                expect(r.resp).to.equal("no_such_device");
            }
            expect(ottKeys().length).to.equal(0);
            expect(ottSets().length).to.equal(0);
        }, TIMEOUT);

        it("I9. two tokens issued in the same tick differ", async function () {
            const binding = { owner: OWNER_B, udid: UDID_B };
            const results = await Promise.all([
                call((cb) => device.storeOTT(binding, cb)),
                call((cb) => device.storeOTT(binding, cb))
            ]);
            const t1 = results[0][1] ? results[0][1].ott : undefined;
            const t2 = results[1][1] ? results[1][1].ott : undefined;
            expect(HEX64.test(t1) && HEX64.test(t2), "both tokens are 64 hex").to.equal(true);
            expect(t1 === t2, "tokens are identical").to.equal(false);
            expect(ottKeys().length).to.equal(2);
        }, TIMEOUT);

        it("I10. storeOTT refuses a binding that is not {valid owner, valid udid}", async function () {
            const bindings = [null, {}, { owner: OWNER_B, udid: TRAVERSAL }, { owner: 42, udid: UDID_B }];
            for (const b of bindings) {
                const [ok, resp] = await call((cb) => device.storeOTT(b, cb));
                expect(ok).to.equal(false);
                expect(resp).to.equal("OTT_BINDING_INVALID");
            }
            expect(ottKeys().length).to.equal(0);
            expect(ottSets().length).to.equal(0);
        }, TIMEOUT);

        it("I11. a failed SET answers OTT_STORE_FAILED", async function () {
            redis.failSetPrefix = "ott:";
            const [ok, resp] = await call((cb) => device.storeOTT({ owner: OWNER_B, udid: UDID_B }, cb));
            expect(ok).to.equal(false);
            expect(resp).to.equal("OTT_STORE_FAILED");
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("OTT core: redemption", function () {

        it("R1. a token issued for B's device serves B's firmware only", async function () {
            const r = await issue(OWNER_B, UDID_B, KEY_B);
            const [ok, resp] = await redeem(r.token);
            expect(ok).to.equal(true);
            expect(servedMarker(resp), "served firmware").to.equal("B");
            expect(resp.md5 === FW_B.md5, "md5 of B's firmware").to.equal(true);
            expect(resp.md5 === FW_A.md5, "md5 of A's firmware").to.equal(false);
            expect(deployCalls.length, "latestFirmwarePath calls").to.equal(1);
            expect(deployCalls[0].owner === OWNER_B, "latestFirmwarePath owner is B").to.equal(true);
            expect(deployCalls[0].udid).to.equal(UDID_B);
        }, TIMEOUT);

        it("R2. the first redemption caps the lifetime at 3600 s and nothing raises it again", async function () {
            const r = await issue(OWNER_B, UDID_B, KEY_B);
            const key = "ott:" + r.token;
            expect(redis.ttls.get(key)).to.equal(86400);
            const first = await redeem(r.token);
            expect(first[0]).to.equal(true);
            expect(redis.ttls.get(key)).to.equal(3600);
            redis.ttls.set(key, 120);
            const mark = redis.expires.length;
            const second = await redeem(r.token);
            expect(second[0]).to.equal(true);
            expect(servedMarker(second[1])).to.equal("B");
            expect(redis.ttls.get(key)).to.equal(120);
            expect(redis.expires.slice(mark).filter((e) => e.seconds > 120).length, "expire calls raising the TTL").to.equal(0);
        }, TIMEOUT);

        it("R3. a record with a traversal udid is refused, deleted and never reaches deployment", async function () {
            const token = seedToken({ owner: OWNER_B, udid: TRAVERSAL }, 86400);
            const [ok, resp] = await redeem(token);
            expect(ok).to.equal(false);
            expect(resp).to.equal("OTT_INFO_NOT_FOUND");
            expect(servedMarker(resp)).to.equal(null);
            expect(deployCalls.filter((c) => Sanitka.udid(c.udid) === null).length, "deployment calls with an invalid udid").to.equal(0);
            expect(redis.store.has("ott:" + token), "record kept").to.equal(false);
        }, TIMEOUT);

        it("R4. a record naming another owner's udid is refused and deleted", async function () {
            const token = seedToken({ owner: OWNER_B, udid: UDID_A }, 86400);
            const [ok, resp] = await redeem(token);
            expect(ok).to.equal(false);
            expect(resp).to.equal("OTT_INFO_NOT_FOUND");
            expect(redis.store.has("ott:" + token), "record kept").to.equal(false);
            expect(deployCalls.length).to.equal(0);
        }, TIMEOUT);

        it("R5. a token outlives no transfer: the device now owned by A is refused and the token deleted", async function () {
            const r = await issue(OWNER_B, UDID_B, KEY_B);
            expect(HEX64.test(r.token), "token issued").to.equal(true);
            couch.devices[UDID_B].owner = OWNER_A;
            const [ok, resp] = await redeem(r.token);
            expect(ok).to.equal(false);
            expect(resp).to.equal("OTT_INFO_NOT_FOUND");
            expect(servedMarker(resp)).to.equal(null);
            expect(redis.store.has("ott:" + r.token), "record kept").to.equal(false);
            expect(deployCalls.length).to.equal(0);
        }, TIMEOUT);

        it("R6. a pre-deploy full-body record with a valid, owned binding still serves (compat)", async function () {
            const token = seedToken({
                owner: OWNER_B, udid: UDID_B, mac: MAC_B, firmware: "v9x-old", push: PUSH_SENTINEL, version: "1.0.0"
            }, 86400);
            const [ok, resp] = await redeem(token);
            expect(ok).to.equal(true);
            expect(servedMarker(resp)).to.equal("B");
        }, TIMEOUT);

        it("R7. a malformed token is refused without a Redis read", async function () {
            const tokens = ["foo", "a".repeat(63), "A".repeat(64), ["a".repeat(64)], { ott: "a".repeat(64) }, undefined];
            for (const t of tokens) {
                const [ok, resp] = await redeem(t);
                expect(ok).to.equal(false);
                expect(resp).to.equal("OTT_UPDATE_NOT_FOUND");
            }
            expect(redis.gets.length, "Redis reads").to.equal(0);
        }, TIMEOUT);

        it("R8. an unknown well-formed token answers OTT_UPDATE_NOT_FOUND", async function () {
            const [ok, resp] = await redeem(crypto.randomBytes(32).toString("hex"));
            expect(ok).to.equal(false);
            expect(resp).to.equal("OTT_UPDATE_NOT_FOUND");
        }, TIMEOUT);

        it("R9. a stored value that is not a record answers OTT_INFO_NOT_FOUND without a throw", async function () {
            for (const v of ["not-json", "null", "42"]) {
                const token = seedToken(v, 86400);
                const [ok, resp] = await redeem(token);
                expect(ok, "value " + v).to.equal(false);
                expect(resp).to.equal("OTT_INFO_NOT_FOUND");
                expect(redis.store.has("ott:" + token), "record kept").to.equal(false);
            }
            expect(deployCalls.length).to.equal(0);
        }, TIMEOUT);

        it("R10. an owned device with no build answers OTT_UPDATE_NOT_AVAILABLE", async function () {
            const r = await issue(OWNER_B, UDID_B2, KEY_B);
            expect(HEX64.test(r.token), "token issued").to.equal(true);
            const [ok, resp] = await redeem(r.token);
            expect(ok).to.equal(false);
            expect(resp).to.equal("OTT_UPDATE_NOT_AVAILABLE");
        }, TIMEOUT);

        it("R11. update_binary (the forced firmware path) never touches OTT lifetimes", async function () {
            const token = seedToken({ owner: OWNER_B, udid: UDID_B }, 120);
            const [ok, resp] = await call((cb) => device.update_binary(FW_B.path, token, cb));
            expect(ok).to.equal(true);
            expect(servedMarker(resp)).to.equal("B");
            expect(redis.ttls.get("ott:" + token)).to.equal(120);
            expect(redis.expires.length, "expire calls").to.equal(0);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("OTT core: register path", function () {

        it("G1. a traversal body udid that checks in by MAC binds the token to the checked-in device", async function () {
            DeploymentStub.updateAvailable = true;
            const r = await register(REG(OWNER_B, MAC_B, { udid: TRAVERSAL }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(reg.status).to.equal("FIRMWARE_UPDATE");
            expect(HEX64.test(reg.ott), "registration.ott is 64 hex").to.equal(true);
            expectBinding(reg.ott, OWNER_B, UDID_B);
            const [ok, resp] = await redeem(reg.ott);
            expect(ok).to.equal(true);
            expect(servedMarker(resp), "served firmware").to.equal("B");
        }, TIMEOUT);

        it("G2. an own-udid check-in stores the same exact record and keeps the response shape", async function () {
            DeploymentStub.updateAvailable = true;
            const r = await register(REG(OWNER_B, MAC_B, { udid: UDID_B }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(reg.status).to.equal("FIRMWARE_UPDATE");
            expect(HEX64.test(reg.ott), "registration.ott is 64 hex").to.equal(true);
            expectBinding(reg.ott, OWNER_B, UDID_B);
            for (const k of ["status", "ott", "mac", "version", "udid", "alias", "auto_update"]) {
                expect(Object.prototype.hasOwnProperty.call(reg, k), "registration." + k).to.equal(true);
            }
            expect(reg.udid).to.equal(UDID_B);
        }, TIMEOUT);

        it("G3. a failed OTT store still answers the check-in with status OK and no ott", async function () {
            DeploymentStub.updateAvailable = true;
            redis.failSetPrefix = "ott:";
            const r = await register(REG(OWNER_B, MAC_B, { udid: UDID_B }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(reg.status).to.equal("OK");
            expect(Object.prototype.hasOwnProperty.call(reg, "ott"), "registration.ott present").to.equal(false);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("OTT core: router", function () {

        it("E1. POST /device/firmware use=ott with the owner's key answers only {ott}", async function () {
            const res = await send("POST", "/device/firmware", { key: KEY_B, body: { use: "ott", owner: OWNER_B, udid: UDID_B } });
            expect(res.status).to.equal(200);
            let parsed = null;
            try { parsed = JSON.parse(res.text); } catch (_e) { parsed = null; }
            expect((typeof (parsed) === "object") && (parsed !== null), "JSON object body").to.equal(true);
            expect(Object.keys(parsed).join(","), "response keys").to.equal("ott");
            expect(HEX64.test(parsed.ott), "ott is 64 hex").to.equal(true);
        }, TIMEOUT);

        it("E2. POST use=ott naming another owner's udid answers no_such_device", async function () {
            const res = await send("POST", "/device/firmware", { key: KEY_B, body: { use: "ott", owner: OWNER_B, udid: UDID_A } });
            expect(res.status).to.equal(200);
            expect(res.text).to.equal("no_such_device");
            expect(ottKeys().length).to.equal(0);
        }, TIMEOUT);

        it("E3. POST use=ott without a key answers OTT_API_KEY_NOT_VALID", async function () {
            const res = await send("POST", "/device/firmware", { body: { use: "ott", owner: OWNER_B, udid: UDID_B } });
            expect(res.status).to.equal(200);
            expect(res.text).to.equal("OTT_API_KEY_NOT_VALID");
        }, TIMEOUT);

        it("E4. GET ?ott=foo answers OTT_UPDATE_NOT_FOUND", async function () {
            const res = await send("GET", "/device/firmware?ott=foo");
            expect(res.status).to.equal(200);
            expect(res.text).to.equal("OTT_UPDATE_NOT_FOUND");
        }, TIMEOUT);

        it("E5. GET with a traversal record answers OTT_INFO_NOT_FOUND and serves nothing", async function () {
            const token = seedToken({ owner: OWNER_B, udid: TRAVERSAL }, 86400);
            const res = await send("GET", "/device/firmware?ott=" + token);
            expect(res.status).to.equal(200);
            expect(res.text).to.equal("OTT_INFO_NOT_FOUND");
            expect(typeof (res.headers["x-md5"]), "x-md5 header").to.equal("undefined");
        }, TIMEOUT);

        it("E6. a token issued over POST redeems over GET with B's firmware md5", async function () {
            const issued = await send("POST", "/device/firmware", { key: KEY_B, body: { use: "ott", owner: OWNER_B, udid: UDID_B } });
            let parsed = {};
            try { parsed = JSON.parse(issued.text); } catch (_e) { parsed = {}; }
            expect(HEX64.test(parsed.ott), "token issued").to.equal(true);
            const res = await send("GET", "/device/firmware?ott=" + parsed.ott, { headOnly: true });
            expect(res.status).to.equal(200);
            expect(res.headers["x-md5"] === FW_B.md5, "x-md5 is B's firmware md5").to.equal(true);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("OTT logs", function () {

        it("L1. issuing and redeeming over HTTP never logs the full token", async function () {
            let token = null;
            const lines = await capture(async () => {
                const issued = await send("POST", "/device/firmware", { key: KEY_B, body: { use: "ott", owner: OWNER_B, udid: UDID_B } });
                try { token = JSON.parse(issued.text).ott; } catch (_e) { token = null; }
                if (HEX64.test(token)) {
                    await send("GET", "/device/firmware?ott=" + token, { headOnly: true });
                    await sleep(50);
                }
            });
            expect(HEX64.test(token), "token issued").to.equal(true);
            expect(lines.filter((l) => l.indexOf(token) !== -1).length, "log lines with the full token").to.equal(0);
        }, TIMEOUT);

        it("L2. a FIRMWARE_UPDATE check-in never logs the issued token", async function () {
            DeploymentStub.updateAvailable = true;
            let reg = {};
            const lines = await capture(async () => {
                const r = await register(REG(OWNER_B, MAC_B, { udid: TRAVERSAL }), KEY_B);
                reg = regOf(r);
                await quiesce();
            });
            expect(HEX64.test(reg.ott), "token issued").to.equal(true);
            expect(lines.filter((l) => l.indexOf(reg.ott) !== -1).length, "log lines with the full token").to.equal(0);
        }, TIMEOUT);

        it("L3. redeeming an unknown token never logs it in full", async function () {
            const token = crypto.randomBytes(32).toString("hex");
            const lines = await capture(async () => {
                await redeem(token);
            });
            expect(lines.filter((l) => l.indexOf(token) !== -1).length, "log lines with the full token").to.equal(0);
        }, TIMEOUT);
    });
});
