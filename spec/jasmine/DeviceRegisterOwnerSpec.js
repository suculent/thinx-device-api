/*
 * DeviceRegisterOwnerSpec — quick 261003-tv5: POST /device/register is bound to the owner
 * whose API key authenticated it.
 *
 * Operator decision: "/device/register, when it falls back to matching by MAC, should
 * check in as a device of the api key's owner."
 *
 * Runs without Redis and without CouchDB. lib/thinx/couch.js, lib/thinx/audit.js and
 * lib/thinx/deployment.js are swapped in require.cache for an in-memory fake CouchDB
 * (create-only insert, devices_by_mac rows in key/doc-id order), a no-op audit log and a
 * no-op deployment, and a fresh copy of lib/thinx/device.js is loaded against them. A
 * Map-backed Redis stub records MQTT credential writes (set) and ACL writes (sAdd). The
 * swap lives in the outer describe's beforeAll/afterAll, so it never leaks into the other
 * spec files CI runs in the same process.
 *
 * Pinned behaviour of Device#register (MAC fallback and udid path):
 * - a registration authenticated by owner B's key never checks in as, writes to,
 *   re-authorizes (MQTT credential / ACL) or returns owner A's device, whether it names
 *   A's device by MAC or by udid; B gets B's own device with that MAC, else a new device;
 * - a same-owner MAC match reattaches (one match is enough), with MAC normalisation as
 *   before;
 * - the owner's own udid checks in unchanged; an absent udid (404) is kept for the new
 *   device; a malformed, foreign or unverifiable udid is replaced by a fresh one;
 * - a key that does not belong to the body owner is refused before any lookup.
 *
 * Nothing here prints a key, a key hash, an environment or a device document; assertions
 * compare booleans, counts, exact response strings and udids only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const express = require("express");
const http = require("http");
const nodeUtil = require("util");
const expect = require("chai").expect;
const sha256 = require("sha256");

const Globals = require("../../lib/thinx/globals");
const Sanitka = require("../../lib/thinx/sanitka");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const DEPLOYMENT_PATH = require.resolve("../../lib/thinx/deployment");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const ROUTER_DEVICEAPI_PATH = require.resolve("../../lib/router.deviceapi");

const SWAPPED = [COUCH_PATH, AUDIT_PATH, DEPLOYMENT_PATH, DEVICE_PATH];

const PREFIX = Globals.prefix();

const OWNER_A = sha256(PREFIX + "tv5-owner-a@example.com");
const OWNER_B = sha256(PREFIX + "tv5-owner-b@example.com");

const KEY_A = sha256("tv5-key-a");
const KEY_B = sha256("tv5-key-b");

// quick 261003-u86: a key moved from A to B with UDID_B's transfer (KEY_T), an unmoved key
// of A (KEY_U) and a third owner id that never owned UDID_B (OWNER_C).
const HASH_B = sha256(KEY_B);
const KEY_T = sha256("u86-key-transferred");
const HASH_T = sha256(KEY_T);
const KEY_U = sha256("u86-key-unmoved");
const OWNER_C = sha256(PREFIX + "u86-owner-c@example.com");

const MAC_A_PAIR = "7E:50:00:00:00:A2";
const MAC_A_ONE = "7E:50:00:00:00:A3";
const MAC_MIXED = "7E:50:00:00:00:AB";
const MAC_B_ONE = "7E:50:00:00:00:B1";
const MAC_FREE = "7E:50:00:00:00:F0";

const UDID_A = "a7500000-0000-4000-8000-0000000000a1";
const UDID_A2 = "a7500000-0000-4000-8000-0000000000a2";
const UDID_A3 = "a7500000-0000-4000-8000-0000000000a3";
const UDID_A4 = "a7500000-0000-4000-8000-0000000000a4";
const UDID_B = "b7500000-0000-4000-8000-0000000000b1";
const UDID_B2 = "b7500000-0000-4000-8000-0000000000b2";
const UDID_FREE = "c7500000-0000-4000-8000-0000000000c1";
const UDID_BROKEN = "d7500000-0000-4000-8000-0000000000d1";

const A_UDIDS = [UDID_A, UDID_A2, UDID_A3, UDID_A4];
const KNOWN_UDIDS = [UDID_A, UDID_A2, UDID_A3, UDID_A4, UDID_B, UDID_B2, UDID_FREE, UDID_BROKEN];

const ENV_SENTINEL = "tv5-env-sentinel-pass";
const LEAK_MARKERS = [OWNER_A, "tv5-a", ENV_SENTINEL, "tv5-mesh-a"].concat(A_UDIDS);

const TIMEOUT = 15000;

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = {
    devices: {},
    seed: {},
    writes: [],
    gets: 0,
    views: 0,
    viewError: false,
    auto: 0
};

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
    const docs = [
        deviceDoc(UDID_A, OWNER_A, MAC_A_PAIR, "tv5-a1", { mesh_ids: ["tv5-mesh-a"], environment: { pass: ENV_SENTINEL } }),
        deviceDoc(UDID_A2, OWNER_A, MAC_A_PAIR, "tv5-a2"),
        deviceDoc(UDID_A3, OWNER_A, MAC_A_ONE, "tv5-a3"),
        deviceDoc(UDID_A4, OWNER_A, MAC_MIXED, "tv5-a4"),
        deviceDoc(UDID_B, OWNER_B, MAC_B_ONE, "tv5-b1"),
        deviceDoc(UDID_B2, OWNER_B, MAC_MIXED, "tv5-b2")
    ];
    couch.devices = {};
    couch.seed = {};
    for (const d of docs) {
        couch.devices[d._id] = copy(d);
        couch.seed[d._id] = copy(d);
    }
    couch.writes = [];
    couch.gets = 0;
    couch.views = 0;
    couch.viewError = false;
    couch.auto = 0;
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
        couch.gets++;
        if (id === UDID_BROKEN) {
            return answer(cb, Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
        }
        if (has(couch.devices, id)) return answer(cb, null, copy(couch.devices[id]));
        return answer(cb, notFound());
    },
    view(design, name, params, cb) {
        couch.views++;
        if (couch.viewError) return answer(cb, Object.assign(new Error("view failed"), { statusCode: 500 }));
        const key = params ? params.key : undefined;
        let docs = Object.keys(couch.devices).map((k) => couch.devices[k]);
        if (name === "devices_by_mac") docs = docs.filter((d) => d.mac === key);
        else if (name === "devices_by_owner") docs = docs.filter((d) => d.owner === key);
        else docs = [];
        // CouchDB orders rows with equal keys by document id.
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
        const docId = (typeof (id) === "string") ? id : ("auto-" + (++couch.auto));
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

// Records owner ids only (quick 261003-u86 continuity cases); otherwise a no-op.
let auditOwners = [];
class AuditStub {
    log(owner) { auditOwners.push(owner); }
}

// Keeps mkdirp and the filesystem out of the spec. latestFirmwarePath records the owner it
// was asked for and answers "no firmware" (quick 261003-u86); `envelope` is what
// latestFirmwareEnvelope answers (undefined unless a case sets it).
let firmwarePathOwners = [];
class DeploymentStub {
    initWithOwner() { /* no-op */ }
    initWithDevice() { /* no-op */ }
    latestFirmwareEnvelope() { return DeploymentStub.envelope; }
    hasUpdateAvailable() { return false; }
    latestFirmwarePath(owner, udid, callback) {
        firmwarePathOwners.push(owner);
        callback(false);
    }
}
DeploymentStub.envelope = undefined;

// ---------------------------------------------------------------------------
// Redis stub
// ---------------------------------------------------------------------------

// Map-backed stand-in for the legacy redis client. Values are stored synchronously;
// callbacks are deferred with setImmediate. `sets` records every set key (MQTT
// credentials), `sadds` every sAdd key (ACL topics). `evals` records every EVAL
// compare-and-swap (quick 261003-u86), never in `sets`; `getErrorKeys` makes get fail.
function makeRedisStub() {
    const store = new Map();
    const stub = { store: store, sets: [], sadds: [], evals: [], getErrorKeys: new Set() };
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
        if (stub.getErrorKeys.has(key)) return later(lastCallback(rest), new Error("u86 redis get failure"));
        later(lastCallback(rest), null, store.has(key) ? store.get(key) : null);
    };
    stub.set = function (key, value, ...rest) {
        stub.sets.push({ key: key });
        store.set(key, String(value));
        later(lastCallback(rest), null, "OK");
    };
    stub.del = function (key, ...rest) {
        store.delete(key);
        later(lastCallback(rest), null, 1);
    };
    stub.expire = function (key, ...rest) {
        later(lastCallback(rest), null, 1);
    };
    stub.keys = function (pattern, ...rest) {
        later(lastCallback(rest), null, []);
    };
    stub.SMEMBERS = function (key, cb) {
        later(cb, null, []);
    };
    stub.sAdd = function (key, members, cb) {
        stub.sadds.push({ key: key });
        later(cb, null, Array.isArray(members) ? members.length : 1);
    };
    // EVAL <script> <n> <n keys> <n expected> <n next>: absent reads as ""; all equal ->
    // write next ("" = DEL) and answer 1, else 0.
    stub.sendCommand = function (...args) {
        let cb = null;
        if (typeof (args[args.length - 1]) === "function") cb = args.pop();
        const flat = [];
        (function flatten(list) {
            for (const a of list) {
                if (Array.isArray(a)) flatten(a);
                else flat.push((typeof (a) === "number") ? String(a) : a);
            }
        })(args);
        if (String(flat[0]).toUpperCase() !== "EVAL") return later(cb, new Error("unsupported command"));
        const n = parseInt(flat[2], 10);
        const keys = flat.slice(3, 3 + n);
        const expected = flat.slice(3 + n, 3 + 2 * n);
        const next = flat.slice(3 + 2 * n, 3 + 3 * n);
        stub.evals.push({ keys: keys });
        for (let i = 0; i < n; i++) {
            const current = store.has(keys[i]) ? store.get(keys[i]) : "";
            if (current !== String(expected[i])) return later(cb, null, 0);
        }
        for (let i = 0; i < n; i++) {
            if (String(next[i]) === "") store.delete(keys[i]);
            else store.set(keys[i], String(next[i]));
        }
        later(cb, null, 1);
    };
    stub.on = function () { /* no-op */ };
    return stub;
}

function seedRedis(redis) {
    for (const k of Array.from(redis.store.keys())) {
        if ((typeof (k) !== "string") || (k.indexOf("ak:") !== 0)) redis.store.delete(k);
    }
    redis.store.set("ak:" + OWNER_A, JSON.stringify([{ key: KEY_A, hash: sha256(KEY_A), alias: "tv5-key-a" }]));
    redis.store.set("ak:" + OWNER_B, JSON.stringify([{ key: KEY_B, hash: sha256(KEY_B), alias: "tv5-key-b" }]));
    redis.sets = [];
    redis.sadds = [];
    redis.evals = [];
    redis.getErrorKeys = new Set();
    auditOwners = [];
    firmwarePathOwners = [];
    DeploymentStub.envelope = undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let saved = {};
let Device = null;   // fresh lib/thinx/device.js class (fake couch)
let device = null;
let redis = null;
let server = null;

function REG(owner, mac, extra) {
    return Object.assign({
        mac: mac, firmware: "tv5-fw", version: "1.0.0", alias: "tv5-b-reg", owner: owner, platform: "arduino"
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

function parsed(response) {
    if (typeof (response) === "string") {
        try { return JSON.parse(response); } catch (_e) { return {}; }
    }
    return ((typeof (response) === "object") && (response !== null)) ? response : {};
}

function regOf(result) {
    const r = parsed(result.response).registration;
    return ((typeof (r) === "object") && (r !== null)) ? r : {};
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// The fire-and-forget authorize_mqtt has finished for `udid` once the stub saw its
// credential set and its ":sacls" sAdd (after the given record offsets).
async function waitMqtt(udid, from) {
    const f = from || { sets: 0, sadds: 0 };
    const deadline = Date.now() + 3000;
    for (;;) {
        const credential = redis.sets.slice(f.sets).some((s) => s.key === udid);
        const acl = redis.sadds.slice(f.sadds).some((s) => s.key === udid + ":sacls");
        if (credential && acl) return true;
        if (Date.now() > deadline) return false;
        await sleep(10);
    }
}

// Lets a test's fire-and-forget MQTT authorization land before the next test reseeds:
// waits until no credential, ACL or couch write was recorded for 200 ms (max 3000 ms).
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

function marks() {
    return { sets: redis.sets.length, sadds: redis.sadds.length };
}

function writesFor(id, op) {
    return couch.writes.filter((w) => (w.id === id) && ((typeof (op) === "undefined") || (w.op === op)));
}

function inserts() {
    return couch.writes.filter((w) => w.op === "insert");
}

function atomics() {
    return couch.writes.filter((w) => w.op === "atomic");
}

function expectAUntouched(label) {
    const l = (label || "") + " ";
    for (const u of A_UDIDS) {
        expect(writesFor(u).length, l + "couch write attempts for A's device " + u).to.equal(0);
        expect(nodeUtil.isDeepStrictEqual(couch.devices[u], couch.seed[u]), l + "A's stored device " + u + " unchanged").to.equal(true);
        expect(redis.sets.some((s) => s.key === u), l + "MQTT credential written for A's device " + u).to.equal(false);
        expect(redis.sadds.some((s) => (typeof (s.key) === "string") && (s.key.indexOf(u + ":") === 0)),
            l + "ACL written for A's device " + u).to.equal(false);
    }
}

function expectNoLeak(response, label) {
    const text = (typeof (response) === "string") ? response : JSON.stringify(response);
    for (const m of LEAK_MARKERS) {
        expect(String(text).indexOf(m) === -1, (label || "") + " response leaks owner A data").to.equal(true);
    }
}

function isFresh(udid) {
    return (typeof (udid) === "string") && (Sanitka.udid(udid) !== null) && (KNOWN_UDIDS.indexOf(udid) === -1);
}

function expectOwnerB(reg, label) {
    expect(reg.owner === OWNER_B, (label || "") + " registration.owner is the key owner B").to.equal(true);
}

// Issue one request to the bare express app. opts: { key, body }.
function send(method, path, opts) {
    const o = opts || {};
    return new Promise((resolve, reject) => {
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
            path: path,
            headers: headers,
            agent: false
        }, (res) => {
            let text = "";
            res.on("data", (chunk) => { text += chunk; });
            res.on("end", () => resolve({ status: res.statusCode, text: text }));
        });
        req.on("error", reject);
        if (payload !== null) req.write(payload);
        req.end();
    });
}

describe("DeviceRegisterOwnerSpec (quick 261003-tv5)", function () {

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
    });

    beforeEach(() => {
        seedCouch();
        seedRedis(redis);
    });

    afterEach(async () => {
        await quiesce();
    }, TIMEOUT);

    // -----------------------------------------------------------------------
    describe("REG core: udid path", function () {

        it("1. the owner's own udid checks in unchanged", async function () {
            const r = await register(REG(OWNER_B, MAC_FREE, { udid: UDID_B }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(reg.udid).to.equal(UDID_B);
            expectOwnerB(reg);
            expect(await waitMqtt(UDID_B), "MQTT credential and ACL for UDID_B").to.equal(true);
            expect(writesFor(UDID_B, "atomic").length, "atomic writes for UDID_B").to.equal(1);
            expect(inserts().length, "inserts").to.equal(0);
        }, TIMEOUT);

        it("2. another owner's udid yields a new device of the key owner", async function () {
            const r = await register(REG(OWNER_B, MAC_FREE, { udid: UDID_A }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(isFresh(reg.udid), "fresh registration.udid").to.equal(true);
            expectOwnerB(reg);
            expect(await waitMqtt(reg.udid), "MQTT credential and ACL for the new udid").to.equal(true);
            expect(inserts().length, "inserts").to.equal(1);
            expect(writesFor(reg.udid, "insert").length, "insert for the new udid").to.equal(1);
            const doc = couch.devices[reg.udid] || {};
            expect(doc.owner === OWNER_B, "stored owner is B").to.equal(true);
            expect(doc.udid).to.equal(reg.udid);
            expect(doc.mqtt === "/" + OWNER_B + "/" + reg.udid, "stored mqtt topic is B's").to.equal(true);
            expectAUntouched();
            expectNoLeak(r.response);
        }, TIMEOUT);

        it("3. another owner's udid with the key owner's MAC reattaches to the owner's device", async function () {
            const r = await register(REG(OWNER_B, MAC_B_ONE, { udid: UDID_A }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(reg.udid).to.equal(UDID_B);
            expect(await waitMqtt(UDID_B), "MQTT credential and ACL for UDID_B").to.equal(true);
            expect(inserts().length, "inserts").to.equal(0);
            expectAUntouched();
            expectNoLeak(r.response);
        }, TIMEOUT);

        it("4. an absent udid (404) is kept for the new device", async function () {
            const r = await register(REG(OWNER_B, MAC_FREE, { udid: UDID_FREE }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(reg.udid).to.equal(UDID_FREE);
            expect(await waitMqtt(UDID_FREE), "MQTT credential and ACL for UDID_FREE").to.equal(true);
            expect(writesFor(UDID_FREE, "insert").length, "insert for UDID_FREE").to.equal(1);
            expect(inserts().length, "inserts").to.equal(1);
            expect((couch.devices[UDID_FREE] || {}).owner === OWNER_B, "stored owner is B").to.equal(true);
        }, TIMEOUT);

        it("5. a malformed udid is replaced by a fresh one", async function () {
            const r = await register(REG(OWNER_B, MAC_FREE, { udid: "not-a-udid" }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(isFresh(reg.udid), "fresh registration.udid").to.equal(true);
            expect(await waitMqtt(reg.udid), "MQTT credential and ACL for the new udid").to.equal(true);
            expect(writesFor(reg.udid, "insert").length, "insert for the new udid").to.equal(1);
            expect(inserts().every((w) => Sanitka.udid(w.id) !== null), "every insert id is a udid").to.equal(true);
            expect(redis.store.has(null) || redis.store.has("null"), "credential under null").to.equal(false);
            expect(redis.sets.some((s) => (s.key === null) || (s.key === "null")), "credential write under null").to.equal(false);
        }, TIMEOUT);

        it("6. an unverifiable udid (lookup error) is replaced by a fresh one", async function () {
            const r = await register(REG(OWNER_B, MAC_FREE, { udid: UDID_BROKEN }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(isFresh(reg.udid), "fresh registration.udid").to.equal(true);
            expect(reg.udid === UDID_BROKEN, "registration.udid is the broken udid").to.equal(false);
            expect(await waitMqtt(reg.udid), "MQTT credential and ACL for the new udid").to.equal(true);
            expect(redis.sets.some((s) => s.key === UDID_BROKEN), "credential written for UDID_BROKEN").to.equal(false);
            expect(redis.store.has(UDID_BROKEN), "credential stored for UDID_BROKEN").to.equal(false);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("REG core: MAC fallback", function () {

        it("7. a single same-owner MAC match reattaches", async function () {
            const before = Object.keys(couch.devices).length;
            const r = await register(REG(OWNER_B, MAC_B_ONE), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(reg.udid).to.equal(UDID_B);
            expect(await waitMqtt(UDID_B), "MQTT credential and ACL for UDID_B").to.equal(true);
            expect(writesFor(UDID_B, "atomic").length, "atomic writes for UDID_B").to.equal(1);
            expect(inserts().length, "inserts").to.equal(0);
            expect(Object.keys(couch.devices).length, "device count").to.equal(before);
        }, TIMEOUT);

        it("8. lower-case and colon-less MACs normalise and reattach", async function () {
            for (const mac of ["7e:50:00:00:00:b1", "7E50000000B1"]) {
                const m = marks();
                const r = await register(REG(OWNER_B, mac), KEY_B);
                const reg = regOf(r);
                expect(r.success, mac).to.equal(true);
                expect(reg.udid, mac).to.equal(UDID_B);
                expect(await waitMqtt(UDID_B, m), mac + " MQTT credential and ACL for UDID_B").to.equal(true);
            }
            expect(inserts().length, "inserts").to.equal(0);
        }, TIMEOUT);

        it("9. another owner's MAC (two rows) yields a new device of the key owner", async function () {
            const r = await register(REG(OWNER_B, MAC_A_PAIR), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(isFresh(reg.udid), "fresh registration.udid").to.equal(true);
            expectOwnerB(reg);
            expect(await waitMqtt(reg.udid), "MQTT credential and ACL for the new udid").to.equal(true);
            expect(inserts().length, "inserts").to.equal(1);
            expect(writesFor(reg.udid, "insert").length, "insert for the new udid").to.equal(1);
            expectAUntouched();
            expectNoLeak(r.response);
        }, TIMEOUT);

        it("10. another owner's MAC (one row) yields a new device of the key owner", async function () {
            const r = await register(REG(OWNER_B, MAC_A_ONE), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(isFresh(reg.udid), "fresh registration.udid").to.equal(true);
            expectOwnerB(reg);
            expect(await waitMqtt(reg.udid), "MQTT credential and ACL for the new udid").to.equal(true);
            expectAUntouched();
            expectNoLeak(r.response);
        }, TIMEOUT);

        it("11. a MAC shared by two owners resolves to each key owner's own device", async function () {
            const rb = await register(REG(OWNER_B, MAC_MIXED), KEY_B);
            const regB = regOf(rb);
            expect(rb.success).to.equal(true);
            expect(regB.udid).to.equal(UDID_B2);
            expect(await waitMqtt(UDID_B2), "MQTT credential and ACL for UDID_B2").to.equal(true);
            expectAUntouched("B request:");
            expectNoLeak(rb.response);

            const m = marks();
            const writesBefore = writesFor(UDID_B2).length;
            const ra = await register(REG(OWNER_A, MAC_MIXED, { alias: "tv5-a-reg" }), KEY_A);
            const regA = regOf(ra);
            expect(ra.success).to.equal(true);
            expect(regA.udid).to.equal(UDID_A4);
            expect(await waitMqtt(UDID_A4, m), "MQTT credential and ACL for UDID_A4").to.equal(true);
            expect(writesFor(UDID_B2).length, "writes for UDID_B2 during A's request").to.equal(writesBefore);
            expect(redis.sets.slice(m.sets).some((s) => s.key === UDID_B2), "credential for UDID_B2 during A's request").to.equal(false);
            expect(inserts().length, "inserts").to.equal(0);
        }, TIMEOUT);

        it("12. an absent udid yields to an owned MAC match", async function () {
            const r = await register(REG(OWNER_B, MAC_B_ONE, { udid: UDID_FREE }), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(reg.udid).to.equal(UDID_B);
            expect(await waitMqtt(UDID_B), "MQTT credential and ACL for UDID_B").to.equal(true);
            expect(inserts().length, "inserts").to.equal(0);
        }, TIMEOUT);

        it("13. a view error never checks in; it registers a new device", async function () {
            couch.viewError = true;
            const r = await register(REG(OWNER_B, MAC_B_ONE), KEY_B);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(isFresh(reg.udid), "fresh registration.udid").to.equal(true);
            expect(await waitMqtt(reg.udid), "MQTT credential and ACL for the new udid").to.equal(true);
            expect(inserts().length, "inserts").to.equal(1);
            expect(atomics().length, "atomic writes").to.equal(0);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("REG core: verified owner only", function () {

        it("14. a key that does not belong to the body owner is refused before any lookup", async function () {
            for (const [owner, key] of [[OWNER_B, KEY_A], [OWNER_A, KEY_B]]) {
                const r = await register(REG(owner, MAC_A_PAIR), key);
                expect(r.success).to.equal(false);
                expect(r.response).to.equal("owner_found_but_no_key");
            }
            await sleep(50);
            expect(couch.gets, "device gets").to.equal(0);
            expect(couch.views, "views").to.equal(0);
            expect(couch.writes.length, "write attempts").to.equal(0);
            expect(redis.sets.length, "credential writes").to.equal(0);
            expect(redis.sadds.length, "ACL writes").to.equal(0);
            expectAUntouched();
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("REG e2e: POST /device/register", function () {

        function body(r) {
            try { return JSON.parse(r.text); } catch (_e) { return {}; }
        }

        function regIn(r) {
            const b = body(r);
            return ((typeof (b.registration) === "object") && (b.registration !== null)) ? b.registration : {};
        }

        it("15. a shared MAC answers the key owner's own device", async function () {
            const r = await send("POST", "/device/register", { key: KEY_B, body: { registration: REG(OWNER_B, MAC_MIXED) } });
            const reg = regIn(r);
            expect(r.status).to.equal(200);
            expect(reg.udid).to.equal(UDID_B2);
            expectOwnerB(reg);
            expect(reg.status).to.equal("OK");
            expect(await waitMqtt(UDID_B2), "MQTT credential and ACL for UDID_B2").to.equal(true);
            expectAUntouched();
        }, TIMEOUT);

        it("16. another owner's MAC answers a new device of the key owner", async function () {
            const r = await send("POST", "/device/register", { key: KEY_B, body: { registration: REG(OWNER_B, MAC_A_PAIR) } });
            const reg = regIn(r);
            expect(r.status).to.equal(200);
            expectOwnerB(reg);
            expect(isFresh(reg.udid), "fresh registration.udid").to.equal(true);
            expect(await waitMqtt(reg.udid), "MQTT credential and ACL for the new udid").to.equal(true);
            expectNoLeak(r.text);
            expectAUntouched();
        }, TIMEOUT);

        it("17. another owner's udid answers a new device of the key owner", async function () {
            const r = await send("POST", "/device/register", { key: KEY_B, body: { registration: REG(OWNER_B, MAC_FREE, { udid: UDID_A }) } });
            const reg = regIn(r);
            expect(r.status).to.equal(200);
            expectOwnerB(reg);
            expect(isFresh(reg.udid), "fresh registration.udid").to.equal(true);
            expect(await waitMqtt(reg.udid), "MQTT credential and ACL for the new udid").to.equal(true);
            expectNoLeak(r.text);
            expectAUntouched();
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("REG u86: check-in records the verifying key", function () {

        it("18. a check-in refreshes lastkey with sha256 of the presented key or hash", async function () {
            couch.devices[UDID_B].lastkey = sha256("u86-stale");
            const r1 = await register(REG(OWNER_B, MAC_FREE, { udid: UDID_B }), KEY_B);
            expect(r1.success).to.equal(true);
            expect(regOf(r1).udid).to.equal(UDID_B);
            expect(couch.devices[UDID_B].lastkey === sha256(KEY_B), "lastkey is sha256(key)").to.equal(true);
            await quiesce();
            const r2 = await register(REG(OWNER_B, MAC_FREE, { udid: UDID_B }), HASH_B);
            expect(r2.success).to.equal(true);
            expect(couch.devices[UDID_B].lastkey === sha256(HASH_B), "lastkey is sha256(hash)").to.equal(true);
        }, TIMEOUT);

        it("19. a device with transformers persists lastkey while the transformer job never carries it", async function () {
            const appConfig = Globals.app_config();
            const savedLambda = appConfig.lambda;
            const savedOwner = device.owner;
            const captured = [];
            const capture = http.createServer((req) => {
                let text = "";
                req.on("data", (chunk) => { text += chunk; });
                req.on("end", () => {
                    captured.push(text);
                    req.socket.destroy();
                });
            });
            await new Promise((resolve) => capture.listen(0, "127.0.0.1", resolve));
            try {
                appConfig.lambda = capture.address().port;
                device.owner = {
                    profile: (o, cb) => cb(true, {
                        info: {
                            goals: [],
                            transformers: [{ utid: "u86-t", alias: "u86-t", body: Buffer.from("var transformer = function(status, device) { return status; };").toString("base64") }]
                        }
                    })
                };
                couch.devices[UDID_B].lastkey = sha256("u86-stale");
                couch.devices[UDID_B].transformers = ["u86-t"];
                const r = await register(REG(OWNER_B, MAC_FREE, { udid: UDID_B, status: "u86-status" }), KEY_B);
                expect(r.success).to.equal(true);
                expect(couch.devices[UDID_B].lastkey === sha256(KEY_B), "persisted lastkey is sha256(key)").to.equal(true);
                expect(captured.length, "transformer jobs posted").to.equal(1);
                expect(captured[0].indexOf("lastkey") === -1, "job carries lastkey").to.equal(true);
                expect(captured[0].indexOf(KEY_B) === -1, "job carries the key").to.equal(true);
                expect(captured[0].indexOf(HASH_B) === -1, "job carries the key hash").to.equal(true);
            } finally {
                appConfig.lambda = savedLambda;
                device.owner = savedOwner;
                await new Promise((resolve) => capture.close(() => resolve()));
            }
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("REG u86: transferred device continuity", function () {

        const InfluxConnector = require("../../lib/thinx/influx");
        let savedStatsLog = null;
        let statsOwners = [];
        let seededB = null;

        function seedBinding(from, udid) {
            const list = [
                { key: KEY_B, hash: HASH_B, alias: "tv5-key-b" },
                { key: KEY_T, hash: HASH_T, alias: "u86-moved", transfer: { udid: udid || UDID_B, from: from || [OWNER_A], at: "2026-10-03T00:00:00.000Z" } }
            ];
            seededB = JSON.stringify(list);
            redis.store.set("ak:" + OWNER_B, seededB);
        }

        function expectRefused(r, label) {
            expect(r.success, (label || "") + " refused").to.equal(false);
            expect(r.response, label).to.equal("owner_found_but_no_key");
            expect(couch.writes.length, (label || "") + " couch write attempts").to.equal(0);
            expect(redis.sets.length, (label || "") + " credential writes").to.equal(0);
            expect(redis.sadds.length, (label || "") + " ACL writes").to.equal(0);
            expect(redis.evals.length, (label || "") + " key store writes").to.equal(0);
        }

        function firmware(owner, udid, key) {
            return new Promise((resolve) => {
                let done = false;
                device.firmware({ headers: { authentication: key }, body: { registration: { mac: MAC_FREE, udid: udid, owner: owner } } }, (success, response) => {
                    if (done) return;
                    done = true;
                    resolve({ success: success, response: response });
                });
            });
        }

        beforeEach(() => {
            seedBinding();
            statsOwners = [];
            savedStatsLog = InfluxConnector.statsLog;
            InfluxConnector.statsLog = function (owner) { statsOwners.push(owner); };
        });

        afterEach(() => {
            InfluxConnector.statsLog = savedStatsLog;
        });

        it("20. the previous owner id with the moved key and the device's own udid checks in as the current owner", async function () {
            const r = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_B }), KEY_T);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expectOwnerB(reg);
            expect(reg.udid).to.equal(UDID_B);
            expect(reg.status).to.equal("OK");
            expect(await waitMqtt(UDID_B), "MQTT credential and ACL for UDID_B").to.equal(true);
            expect(writesFor(UDID_B, "atomic").length, "atomic writes for UDID_B").to.equal(1);
            expect(inserts().length, "inserts").to.equal(0);
            expect((couch.devices[UDID_B] || {}).owner === OWNER_B, "stored owner is B").to.equal(true);
            expect(auditOwners.indexOf(OWNER_A) === -1, "audit entry for the previous owner").to.equal(true);
            expect(statsOwners.indexOf(OWNER_A) === -1, "stats event for the previous owner").to.equal(true);
            expect(redis.store.get("ak:" + OWNER_B) === seededB, "B's key store unchanged").to.equal(true);
            expectAUntouched();
            expectNoLeak(r.response);
        }, TIMEOUT);

        it("21. the moved key's hash works the same way", async function () {
            const r = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_B }), HASH_T);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expectOwnerB(reg);
            expect(reg.udid).to.equal(UDID_B);
            expect(await waitMqtt(UDID_B), "MQTT credential and ACL for UDID_B").to.equal(true);
            expect(inserts().length, "inserts").to.equal(0);
            expect(auditOwners.indexOf(OWNER_A) === -1, "audit entry for the previous owner").to.equal(true);
        }, TIMEOUT);

        it("22. another udid of the current owner is refused", async function () {
            const r = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_B2 }), KEY_T);
            expectRefused(r);
        }, TIMEOUT);

        it("23. a MAC-only registration never redirects and never looks up a device", async function () {
            const r = await register(REG(OWNER_A, MAC_B_ONE), KEY_T);
            expectRefused(r);
            expect(couch.gets, "device gets").to.equal(0);
            expect(couch.views, "views").to.equal(0);
        }, TIMEOUT);

        it("24. a key the previous owner still holds registers as that owner and never redirects", async function () {
            redis.store.set("ak:" + OWNER_A, JSON.stringify([
                { key: KEY_A, hash: sha256(KEY_A), alias: "tv5-key-a" },
                { key: KEY_U, hash: sha256(KEY_U), alias: "u86-unmoved" }
            ]));
            const r = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_B }), KEY_U);
            const reg = regOf(r);
            expect(r.success).to.equal(true);
            expect(reg.owner === OWNER_A, "registration.owner is A").to.equal(true);
            expect(isFresh(reg.udid), "fresh registration.udid").to.equal(true);
            expect(await waitMqtt(reg.udid), "MQTT credential and ACL for the new udid").to.equal(true);
            expect(writesFor(UDID_B).length, "writes for UDID_B").to.equal(0);
            await quiesce();

            const m = marks();
            const own = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_A }), KEY_A);
            const ownReg = regOf(own);
            expect(own.success).to.equal(true);
            expect(ownReg.udid).to.equal(UDID_A);
            expect(ownReg.owner === OWNER_A, "registration.owner is A").to.equal(true);
            expect(await waitMqtt(UDID_A, m), "MQTT credential and ACL for UDID_A").to.equal(true);
        }, TIMEOUT);

        it("25. the current owner's own unbound key with the previous owner id is refused", async function () {
            const r = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_B }), KEY_B);
            expectRefused(r);
        }, TIMEOUT);

        it("26. a binding that does not list the presented owner is refused", async function () {
            seedBinding([OWNER_C]);
            const r = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_B }), KEY_T);
            expectRefused(r);
        }, TIMEOUT);

        it("27. a Redis or CouchDB error during the lookup is refused", async function () {
            redis.getErrorKeys.add("ak:" + OWNER_B);
            const r1 = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_B }), KEY_T);
            expectRefused(r1, "redis error:");
            redis.getErrorKeys.clear();

            seedBinding([OWNER_A], UDID_BROKEN);
            const r2 = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_BROKEN }), KEY_T);
            expectRefused(r2, "couch error:");
        }, TIMEOUT);

        it("28. after a registration with the new owner, the old triple still redirects to the new owner", async function () {
            const own = await register(REG(OWNER_B, MAC_FREE, { udid: UDID_B }), KEY_T);
            expect(own.success).to.equal(true);
            expect(regOf(own).udid).to.equal(UDID_B);
            expect(await waitMqtt(UDID_B), "MQTT credential and ACL for UDID_B").to.equal(true);
            expect(redis.store.get("ak:" + OWNER_B) === seededB, "B's key store unchanged (binding kept)").to.equal(true);
            expect(redis.evals.length, "key store writes").to.equal(0);
            await quiesce();

            const m = marks();
            const old = await register(REG(OWNER_A, MAC_FREE, { udid: UDID_B }), KEY_T);
            const reg = regOf(old);
            expect(old.success).to.equal(true);
            expectOwnerB(reg);
            expect(reg.udid).to.equal(UDID_B);
            expect(await waitMqtt(UDID_B, m), "MQTT credential and ACL for UDID_B").to.equal(true);
        }, TIMEOUT);

        it("29. a firmware request with the previous owner id is answered for the current owner", async function () {
            DeploymentStub.envelope = {};
            const r = await firmware(OWNER_A, UDID_B, KEY_T);
            const response = ((typeof (r.response) === "object") && (r.response !== null)) ? r.response : {};
            expect(response.response === "owner_found_but_no_key", "answer is the authentication refusal").to.equal(false);
            expect(firmwarePathOwners.length, "latestFirmwarePath calls").to.equal(1);
            expect(firmwarePathOwners[0] === OWNER_B, "firmware looked up for B").to.equal(true);
            expect(auditOwners.indexOf(OWNER_A) === -1, "audit entry for the previous owner").to.equal(true);

            const other = await firmware(OWNER_A, UDID_B2, KEY_T);
            expect(other.success).to.equal(false);
            expect((other.response || {}).response).to.equal("owner_found_but_no_key");
            expect(firmwarePathOwners.length, "latestFirmwarePath calls").to.equal(1);
        }, TIMEOUT);
    });
});
