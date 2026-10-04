/*
 * TransferApiKeySpec — quick 261003-u86: a device transfer carries the device's API key.
 *
 * Operator requirement (verbatim): "When transferring a device, api key must be transferred
 * with it. If the key is used by multiple devices, transfer must be blocked."
 *
 * Runs without Redis and without CouchDB. lib/thinx/couch.js and lib/thinx/audit.js are
 * swapped in require.cache for an in-memory fake CouchDB (get, view, atomic with fault
 * modes, Mango find) and a no-op audit log, and fresh copies of apikey.js, device.js,
 * devices.js and transfer.js are loaded against them. A Map-backed Redis stub emulates the
 * multi-key EVAL compare-and-swap (with fault modes and hooks) through sendCommand. The
 * swap lives in the outer describe's beforeAll/afterAll, so it never leaks into the other
 * spec files CI runs in the same process.
 *
 * Pinned behaviour:
 * - APIKey.deviceKeyCandidates / findDeviceKey / isOwnerMqttKey / findTransferBinding are
 *   pure and exact (Util.safeEqual), never by suffix or prefix;
 * - accepting a transfer moves the device's key entry (same key and hash) from the sender's
 *   store to the recipient's in one EVAL, with a transfer binding {udid, from, at}, and the
 *   device owner changes too; the sender can no longer verify, list or revoke the key;
 * - a request is refused before anything is stored or mailed when a named device's key is
 *   shared, unidentifiable, ambiguous, the sender's Default MQTT API Key, or the check
 *   errors; accept re-runs the check per device and changes nothing for a refused device;
 * - every injected Redis or CouchDB failure leaves the key in exactly one store, on the
 *   same side as the device;
 * - self-transfers keep today's behaviour.
 *
 * Nothing here prints a key, a key hash or a device document; assertions compare booleans,
 * exact reason strings, udids and string equality only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const expect = require("chai").expect;
const sha256 = require("sha256");

const Globals = require("../../lib/thinx/globals");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const APIKEY_PATH = require.resolve("../../lib/thinx/apikey");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const DEVICES_PATH = require.resolve("../../lib/thinx/devices");
const TRANSFER_PATH = require.resolve("../../lib/thinx/transfer");

const SWAPPED = [COUCH_PATH, AUDIT_PATH, APIKEY_PATH, DEVICE_PATH, DEVICES_PATH, TRANSFER_PATH];
const RELOADED = [APIKEY_PATH, DEVICE_PATH, DEVICES_PATH, TRANSFER_PATH];

const PREFIX = Globals.prefix();

const EMAIL_A = "u86-owner-a@example.com";
const EMAIL_B = "u86-owner-b@example.com";
const EMAIL_R = "u86-recipient@example.com";
const OWNER_A = sha256(PREFIX + EMAIL_A);
const OWNER_B = sha256(PREFIX + EMAIL_B);
const OWNER_R = sha256(PREFIX + EMAIL_R);

const KEY_1 = sha256("u86-key-1");
const KEY_2 = sha256("u86-key-2");
const KEY_M = sha256("u86-key-mqtt");
const KEY_R = sha256("u86-key-r");
const KEY_X = sha256("u86-key-concurrent");
const HASH_1 = sha256(KEY_1);
const HASH_2 = sha256(KEY_2);
const HASH_M = sha256(KEY_M);
const HASH_R = sha256(KEY_R);
const HASH_X = sha256(KEY_X);

const UDID_1 = "a8600000-0000-4000-8000-000000000001";
const UDID_2 = "a8600000-0000-4000-8000-000000000002";
const UDID_N = "a8600000-0000-4000-8000-00000000000e";
const UDID_S = "a8600000-0000-4000-8000-000000000051";
const UDID_S2 = "a8600000-0000-4000-8000-000000000052";
const UDID_MK = "a8600000-0000-4000-8000-0000000000aa";
const UDID_MASK = "a8600000-0000-4000-8000-0000000000ab";
const UDID_BS = "b8600000-0000-4000-8000-000000000051";
const UDID_FB = "b8600000-0000-4000-8000-000000000001";

const ALIAS_1 = "u86-one";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = {
    devices: {},
    users: {},
    writes: [],
    finds: 0,
    findError: false,
    viewError: false,
    atomicMode: {}
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

function deviceDoc(udid, owner, extra) {
    return Object.assign({ _id: udid, _rev: "1-" + udid.slice(-2), udid: udid, owner: owner, alias: "u86-" + udid.slice(-2), mesh_ids: [] }, extra || {});
}

function seedCouch() {
    couch.devices = {};
    for (const d of [
        deviceDoc(UDID_1, OWNER_A, { lastkey: HASH_1 }),
        deviceDoc(UDID_2, OWNER_A, { lastkey: sha256(HASH_2) }),
        deviceDoc(UDID_N, OWNER_A),
        deviceDoc(UDID_FB, OWNER_B, { lastkey: HASH_R })
    ]) couch.devices[d._id] = d;
    couch.users = {};
    couch.users[OWNER_A] = { _id: OWNER_A, email: EMAIL_A };
    couch.users[OWNER_B] = { _id: OWNER_B, email: EMAIL_B };
    couch.users[OWNER_R] = { _id: OWNER_R, email: EMAIL_R };
    couch.writes = [];
    couch.finds = 0;
    couch.findError = false;
    couch.viewError = false;
    couch.atomicMode = {};
}

function addDevice(udid, owner, lastkey) {
    const extra = (typeof (lastkey) === "string") ? { lastkey: lastkey } : {};
    couch.devices[udid] = deviceDoc(udid, owner, extra);
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
        if (couch.viewError) return answer(cb, Object.assign(new Error("view failed"), { statusCode: 500 }));
        const key = params ? params.key : undefined;
        let docs = Object.keys(couch.devices).map((k) => couch.devices[k]);
        if (name === "devices_by_owner") docs = docs.filter((d) => d.owner === key);
        else if (name === "devices_by_udid") docs = docs.filter((d) => d.udid === key);
        else docs = [];
        return answer(cb, null, { rows: docs.map((d) => ({ id: d._id, key: key, value: copy(d), doc: copy(d) })) });
    },
    atomic(design, update, id, changes, cb) {
        couch.writes.push({ op: "atomic", id: id, changes: copy(changes) });
        const mode = couch.atomicMode[id];
        if (mode === "error") return answer(cb, Object.assign(new Error("u86 atomic failure"), { statusCode: 500 }));
        if (!has(couch.devices, id)) return answer(cb, notFound());
        Object.assign(couch.devices[id], copy(changes));
        if (mode === "apply-then-error") return answer(cb, Object.assign(new Error("u86 atomic reply lost"), { statusCode: 500 }));
        return answer(cb, null, { ok: true });
    },
    find(query, cb) {
        couch.finds++;
        if (couch.findError) return answer(cb, Object.assign(new Error("u86 find failure"), { statusCode: 500 }));
        const selector = (query && query.selector && query.selector.lastkey) ? query.selector.lastkey : {};
        const list = Array.isArray(selector.$in) ? selector.$in : [];
        let docs = Object.keys(couch.devices).map((k) => couch.devices[k])
            .filter((d) => (typeof (d.lastkey) === "string") && (list.indexOf(d.lastkey) !== -1));
        if (typeof (query.limit) === "number") docs = docs.slice(0, query.limit);
        const fields = Array.isArray(query.fields) ? query.fields : null;
        docs = docs.map((d) => {
            if (fields === null) return copy(d);
            const out = {};
            for (const f of fields) if (Object.prototype.hasOwnProperty.call(d, f)) out[f] = d[f];
            return out;
        });
        return answer(cb, null, { docs: docs });
    },
    insert(doc, id, cb) {
        const docId = (typeof (id) === "string") ? id : doc._id;
        couch.writes.push({ op: "insert", id: docId });
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

const userDb = {
    get(id, cb) {
        if (has(couch.users, id)) return answer(cb, null, copy(couch.users[id]));
        return answer(cb, notFound());
    },
    atomic(design, update, id, changes, cb) {
        return answer(cb, null, { ok: true });
    }
};

function otherDbMethod() {
    const args = Array.prototype.slice.call(arguments);
    const cb = args[args.length - 1];
    if (typeof (cb) === "function") setImmediate(() => cb(notFound()));
    return new Promise(() => { /* never settles: no other database is expected here */ });
}

const otherDb = { get: otherDbMethod, view: otherDbMethod, atomic: otherDbMethod, insert: otherDbMethod, destroy: otherDbMethod, find: otherDbMethod };

function useDb(name) {
    if (typeof (name) === "string" && name.endsWith("managed_devices")) return deviceDb;
    if (typeof (name) === "string" && name.endsWith("managed_users")) return userDb;
    return otherDb;
}

function fakeCouch() {
    return { use: useDb, db: { use: useDb } };
}

class AuditStub {
    log() { /* no-op */ }
}

// ---------------------------------------------------------------------------
// Redis stub with an EVAL compare-and-swap emulation
// ---------------------------------------------------------------------------

// Map-backed stand-in for the legacy redis client. Values are stored synchronously;
// callbacks are deferred with setImmediate (transfer.request's legacy exit_on_transfer
// check refuses every request when they run synchronously). sendCommand flattens array
// arguments, pops the trailing callback and understands
//   EVAL <script> <n> <n keys> <n expected values> <n next values>
// (absent reads as ""; all equal -> write next, "" = DEL, answer 1; else answer 0).
// evalMode: "normal" | "always-zero" | "error-before" | "error-after".
// hooks[n](store) runs once right before the n-th EVAL compares.
function makeRedisStub() {
    const store = new Map();
    const stub = {
        store: store, evals: 0, inFlight: 0, maxInFlight: 0, akSets: [],
        evalMode: "normal", hooks: {}, getErrorKeys: new Set()
    };
    function lastCallback(args) {
        for (let i = args.length - 1; i >= 0; i--) {
            if (typeof (args[i]) === "function") return args[i];
        }
        return null;
    }
    function later(cb, err, value) {
        if (cb) setImmediate(() => cb(err, value));
    }
    function flatten(args, out) {
        for (const a of args) {
            if (Array.isArray(a)) flatten(a, out);
            else out.push((typeof (a) === "number") ? String(a) : a);
        }
        return out;
    }
    stub.get = function (key, ...rest) {
        if (stub.getErrorKeys.has(key)) return later(lastCallback(rest), new Error("u86 redis get failure"));
        later(lastCallback(rest), null, store.has(key) ? store.get(key) : null);
    };
    stub.set = function (key, value, ...rest) {
        if ((typeof (key) === "string") && (key.indexOf("ak:") === 0)) stub.akSets.push(key);
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
    stub.sendCommand = function (...args) {
        let cb = null;
        if (typeof (args[args.length - 1]) === "function") cb = args.pop();
        const flat = flatten(args, []);
        if (String(flat[0]).toUpperCase() !== "EVAL") return later(cb, new Error("u86 stub: unsupported command"));
        stub.evals++;
        const evalNo = stub.evals;
        stub.inFlight++;
        stub.maxInFlight = Math.max(stub.maxInFlight, stub.inFlight);
        const n = parseInt(flat[2], 10);
        const keys = flat.slice(3, 3 + n);
        const expected = flat.slice(3 + n, 3 + 2 * n);
        const next = flat.slice(3 + 2 * n, 3 + 3 * n);
        setImmediate(() => {
            stub.inFlight--;
            const hook = stub.hooks[evalNo];
            if (typeof (hook) === "function") {
                delete stub.hooks[evalNo];
                hook(store);
            }
            if (stub.evalMode === "error-before") return cb && cb(new Error("u86 eval transport failure"));
            if (stub.evalMode === "always-zero") return cb && cb(null, 0);
            for (let i = 0; i < n; i++) {
                const current = store.has(keys[i]) ? store.get(keys[i]) : "";
                if (current !== String(expected[i])) return cb && cb(null, 0);
            }
            for (let i = 0; i < n; i++) {
                if (String(next[i]) === "") store.delete(keys[i]);
                else store.set(keys[i], String(next[i]));
            }
            if (stub.evalMode === "error-after") return cb && cb(new Error("u86 eval reply lost"));
            if (cb) cb(null, 1);
        });
    };
    stub.on = function () { /* no-op */ };
    return stub;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let saved = {};
let APIKey = null;     // fresh lib/thinx/apikey.js class
let Transfer = null;   // fresh lib/thinx/transfer.js class (fake couch)
let redis = null;
let transfer = null;
let mails = 0;

function entry(key, alias, extra) {
    return Object.assign({ key: key, hash: sha256(key), alias: alias }, extra || {});
}

function setKeys(owner, entries) {
    redis.store.set("ak:" + owner, JSON.stringify(entries));
}

function seedRedis() {
    redis = makeRedisStub();
    setKeys(OWNER_A, [entry(KEY_1, ALIAS_1), entry(KEY_2, "u86-two"), entry(KEY_M, "Default MQTT API Key")]);
    setKeys(OWNER_R, [entry(KEY_R, "u86-r")]);
    transfer = new Transfer(null, redis);
}

function raw(owner) {
    const k = "ak:" + owner;
    return redis.store.has(k) ? redis.store.get(k) : "<absent>";
}

function keysOf(owner) {
    const k = "ak:" + owner;
    if (!redis.store.has(k)) return [];
    try {
        const v = JSON.parse(redis.store.get(k));
        return Array.isArray(v) ? v : [];
    } catch (_e) {
        return [];
    }
}

function withHash(owner, hash) {
    return keysOf(owner).filter((e) => e && (e.hash === hash));
}

function snapshot() {
    return { a: raw(OWNER_A), b: raw(OWNER_B), r: raw(OWNER_R) };
}

function expectStoresUnchanged(before, label) {
    const now = snapshot();
    expect(now.a === before.a, (label || "") + " ak:A byte-identical").to.equal(true);
    expect(now.b === before.b, (label || "") + " ak:B byte-identical").to.equal(true);
    expect(now.r === before.r, (label || "") + " ak:R byte-identical").to.equal(true);
}

function dtKeys() {
    return Array.from(redis.store.keys()).filter((k) => (typeof (k) === "string") && ((k.indexOf("dt:") === 0) || (k.indexOf("dtr:") === 0)));
}

function ownerOf(udid) {
    return (couch.devices[udid] || {}).owner;
}

async function settle() {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}

function request(owner, body) {
    return new Promise((resolve) => {
        let done = false;
        // The answer is opaque since quick 261004-l7q; the transfer id comes as the
        // in-process third argument (no router forwards it).
        transfer.request(owner, body, (success, response, transfer_id) => {
            if (done) return;
            done = true;
            resolve({ success: success, response: (success === true) ? transfer_id : response });
        });
    });
}

function accept(body) {
    return new Promise((resolve) => {
        let done = false;
        transfer.accept(body, (success, response) => {
            if (done) return;
            done = true;
            resolve({ success: success, response: response });
        });
    });
}

async function requested(owner, to, udids) {
    const r = await request(owner, { to: to, udids: udids, mig_sources: false, mig_apikeys: false });
    await settle();
    expect(r.success, "request accepted").to.equal(true);
    expect(typeof (r.response), "transfer id type").to.equal("string");
    return r.response;
}

async function transferred(owner, to, udids) {
    const id = await requested(owner, to, udids);
    const r = await accept({ transfer_id: id, udids: udids });
    await settle();
    return r;
}

function verify(owner, key) {
    const api = new APIKey(redis);
    return new Promise((resolve) => api.verify(owner, key, true, (success) => resolve(success === true)));
}

// The KEY_1 entry is in exactly one store, on DEV_1's owner's side.
function expectSameSide(label) {
    const inA = withHash(OWNER_A, HASH_1).length;
    const inR = withHash(OWNER_R, HASH_1).length;
    expect(inA + inR, (label || "") + " KEY_1 entries across both stores").to.equal(1);
    const side = (inA === 1) ? OWNER_A : OWNER_R;
    expect(ownerOf(UDID_1) === side, (label || "") + " device and key on the same side").to.equal(true);
}

describe("TransferApiKeySpec (quick 261003-u86)", function () {

    beforeAll(() => {
        // Bind the real modules (and their whole dependency tree) before the swap, so
        // nothing that stays in require.cache ever captures the fake couch.
        require("../../lib/thinx/util.js");
        require(APIKEY_PATH);
        require(DEVICE_PATH);
        require(DEVICES_PATH);
        require(TRANSFER_PATH);

        saved = {};
        for (const p of SWAPPED) saved[p] = require.cache[p];

        require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
        require.cache[AUDIT_PATH] = { id: AUDIT_PATH, filename: AUDIT_PATH, loaded: true, exports: AuditStub };
        for (const p of RELOADED) delete require.cache[p];

        APIKey = require(APIKEY_PATH);
        require(DEVICE_PATH);
        require(DEVICES_PATH);
        Transfer = require(TRANSFER_PATH);

        // Never send mail.
        Transfer.prototype.sendMail = function (contents, type, callback) {
            mails++;
            callback(true, type + "_sent");
        };
    });

    afterAll(() => {
        for (const p of SWAPPED) {
            if (saved[p]) require.cache[p] = saved[p]; else delete require.cache[p];
        }
    });

    beforeEach(() => {
        seedCouch();
        seedRedis();
        mails = 0;
    });

    // -----------------------------------------------------------------------
    describe("U86 core: key identification", function () {

        const E1 = entry(KEY_1, ALIAS_1);
        const E2 = entry(KEY_2, "u86-two");

        it("deviceKeyCandidates lists sha256(key), hash and sha256(hash)", function () {
            expect(typeof (APIKey.deviceKeyCandidates), "APIKey.deviceKeyCandidates is a static function").to.equal("function");
            const c = APIKey.deviceKeyCandidates(E1);
            expect(Array.isArray(c)).to.equal(true);
            expect(c.length).to.equal(2); // sha256(KEY_1) === HASH_1, deduplicated
            expect(c.indexOf(HASH_1) !== -1, "hash is a candidate").to.equal(true);
            expect(c.indexOf(sha256(HASH_1)) !== -1, "sha256(hash) is a candidate").to.equal(true);
            expect(APIKey.deviceKeyCandidates({ alias: "x" }).length).to.equal(0);
            expect(APIKey.deviceKeyCandidates(null).length).to.equal(0);
        });

        it("findDeviceKey identifies the entry by lastkey = hash or sha256(hash)", function () {
            expect(typeof (APIKey.findDeviceKey), "APIKey.findDeviceKey is a static function").to.equal("function");
            const byHash = APIKey.findDeviceKey([E1, E2], HASH_1);
            expect(byHash.status).to.equal("found");
            expect(byHash.index).to.equal(0);
            expect(byHash.entry.hash === HASH_1, "found entry is KEY_1's").to.equal(true);
            const byHashOfHash = APIKey.findDeviceKey([E1, E2], sha256(HASH_2));
            expect(byHashOfHash.status).to.equal("found");
            expect(byHashOfHash.index).to.equal(1);
        });

        it("findDeviceKey answers not_identified for unknown, empty, non-string or masked values", function () {
            expect(typeof (APIKey.findDeviceKey), "APIKey.findDeviceKey is a static function").to.equal("function");
            const masked = sha256("******************************" + KEY_1.substring(30));
            for (const lastkey of [sha256("u86-unknown"), "", 42, null, undefined, masked, KEY_1.substring(30), HASH_1.substring(0, 32)]) {
                expect(APIKey.findDeviceKey([E1, E2], lastkey).status).to.equal("not_identified");
            }
            expect(APIKey.findDeviceKey("not-an-array", HASH_1).status).to.equal("not_identified");
            expect(APIKey.findDeviceKey([null, 7, "x"], HASH_1).status).to.equal("not_identified");
        });

        it("findDeviceKey answers ambiguous for two matching entries", function () {
            expect(typeof (APIKey.findDeviceKey), "APIKey.findDeviceKey is a static function").to.equal("function");
            expect(APIKey.findDeviceKey([E1, E2, copy(E1)], HASH_1).status).to.equal("ambiguous");
        });

        it("isOwnerMqttKey is true only for an alias containing Default MQTT API Key", function () {
            expect(typeof (APIKey.isOwnerMqttKey), "APIKey.isOwnerMqttKey is a static function").to.equal("function");
            expect(APIKey.isOwnerMqttKey({ alias: "Default MQTT API Key" })).to.equal(true);
            expect(APIKey.isOwnerMqttKey({ alias: "old Default MQTT API Key (2)" })).to.equal(true);
            for (const e of [{ alias: "u86" }, { alias: "default mqtt api key" }, {}, { alias: 7 }, null]) {
                expect(APIKey.isOwnerMqttKey(e)).to.equal(false);
            }
        });

        it("findTransferBinding requires one exact entry bound to the udid and listing the presented owner", function () {
            expect(typeof (APIKey.findTransferBinding), "APIKey.findTransferBinding is a static function").to.equal("function");
            const bound = entry(KEY_1, ALIAS_1, { transfer: { udid: UDID_1, from: [OWNER_A], at: "2026-10-03T00:00:00.000Z" } });
            expect(APIKey.findTransferBinding([E2, bound], KEY_1, UDID_1, OWNER_A)).to.equal(true);
            expect(APIKey.findTransferBinding([E2, bound], HASH_1, UDID_1, OWNER_A)).to.equal(true);
            expect(APIKey.findTransferBinding([bound], KEY_1, UDID_2, OWNER_A), "wrong udid").to.equal(false);
            expect(APIKey.findTransferBinding([bound], KEY_1, UDID_1, OWNER_B), "owner not in from").to.equal(false);
            expect(APIKey.findTransferBinding([E1], KEY_1, UDID_1, OWNER_A), "no binding").to.equal(false);
            expect(APIKey.findTransferBinding([bound, copy(bound)], KEY_1, UDID_1, OWNER_A), "two matching entries").to.equal(false);
            expect(APIKey.findTransferBinding([bound], HASH_2, UDID_1, OWNER_A), "another key's hash").to.equal(false);
            expect(APIKey.findTransferBinding([bound], KEY_1.substring(0, 40), UDID_1, OWNER_A), "key prefix").to.equal(false);
            expect(APIKey.findTransferBinding([bound], 42, UDID_1, OWNER_A), "non-string key").to.equal(false);
            expect(APIKey.findTransferBinding("x", KEY_1, UDID_1, OWNER_A), "non-array").to.equal(false);
            const stringFrom = entry(KEY_1, ALIAS_1, { transfer: { udid: UDID_1, from: OWNER_A } });
            expect(APIKey.findTransferBinding([stringFrom], KEY_1, UDID_1, OWNER_A), "from is not an array").to.equal(false);
        });
    });

    // -----------------------------------------------------------------------
    describe("U86 tracer: the key moves with the device", function () {

        it("accept moves DEV_1's key entry from A to R with a transfer binding, atomically with the owner", async function () {
            const r = await transferred(OWNER_A, EMAIL_R, [UDID_1]);
            expect(r.success, "accept succeeded").to.equal(true);

            const doc = couch.devices[UDID_1];
            expect(doc.owner === OWNER_R, "device owner is R").to.equal(true);
            expect(doc.previous_owner === OWNER_A, "previous owner is A").to.equal(true);
            expect((typeof (doc.transferred_at) === "string") && ISO.test(doc.transferred_at), "transferred_at is an ISO string").to.equal(true);

            expect(withHash(OWNER_A, HASH_1).length, "KEY_1 entries left at A").to.equal(0);
            const moved = withHash(OWNER_R, HASH_1);
            expect(moved.length, "KEY_1 entries at R").to.equal(1);
            expect(moved[0].key === KEY_1, "key unchanged").to.equal(true);
            expect(moved[0].hash === HASH_1, "hash unchanged").to.equal(true);
            const t = moved[0].transfer || {};
            expect(t.udid).to.equal(UDID_1);
            expect(JSON.stringify(t.from) === JSON.stringify([OWNER_A]), "binding lists A").to.equal(true);
            expect(t.at === doc.transferred_at, "binding time equals transferred_at").to.equal(true);
            expect(withHash(OWNER_R, HASH_R).length, "R keeps its own key").to.equal(1);
            expect(withHash(OWNER_A, HASH_2).length, "A keeps its other key").to.equal(1);
            expect(redis.akSets.length, "plain set calls on ak: keys").to.equal(0);

            expect(await verify(OWNER_R, KEY_1), "verify(R, key)").to.equal(true);
            expect(await verify(OWNER_R, HASH_1), "verify(R, hash)").to.equal(true);
            expect(await verify(OWNER_A, KEY_1), "verify(A, key)").to.equal(false);

            const api = new APIKey(redis);
            const listed = await new Promise((resolve) => api.list(OWNER_R, resolve));
            expect(listed.length, "listed keys of R").to.equal(2);
            for (const item of listed) {
                expect(Object.prototype.hasOwnProperty.call(item, "transfer"), "listed key exports a transfer field").to.equal(false);
            }
            const revoked = await new Promise((resolve) => api.revoke(OWNER_A, [HASH_1], (success, deleted) => resolve(deleted)));
            expect(Array.isArray(revoked) && (revoked.length === 0), "A's revoke finds nothing").to.equal(true);
            expect(withHash(OWNER_R, HASH_1).length, "the key stays at R after A's revoke").to.equal(1);
        });

        it("a device registered with the hash (lastkey = sha256(hash)) moves the same way", async function () {
            const r = await transferred(OWNER_A, EMAIL_R, [UDID_2]);
            expect(r.success, "accept succeeded").to.equal(true);
            expect(ownerOf(UDID_2) === OWNER_R, "device owner is R").to.equal(true);
            expect(withHash(OWNER_A, HASH_2).length, "KEY_2 entries left at A").to.equal(0);
            const moved = withHash(OWNER_R, HASH_2);
            expect(moved.length, "KEY_2 entries at R").to.equal(1);
            expect(moved[0].key === KEY_2, "key unchanged").to.equal(true);
            expect((moved[0].transfer || {}).udid).to.equal(UDID_2);
            expect(await verify(OWNER_R, KEY_2), "verify(R, key)").to.equal(true);
            expect(await verify(OWNER_A, HASH_2), "verify(A, hash)").to.equal(false);
        });

        it("a chained transfer accumulates previous owners and never lists the current one", async function () {
            const r1 = await transferred(OWNER_A, EMAIL_R, [UDID_1]);
            expect(r1.success, "A -> R accepted").to.equal(true);
            const r2 = await transferred(OWNER_R, EMAIL_B, [UDID_1]);
            expect(r2.success, "R -> B accepted").to.equal(true);
            expect(ownerOf(UDID_1) === OWNER_B, "device owner is B").to.equal(true);
            expect(withHash(OWNER_R, HASH_1).length, "KEY_1 entries left at R").to.equal(0);
            const atB = withHash(OWNER_B, HASH_1);
            expect(atB.length, "KEY_1 entries at B").to.equal(1);
            expect(JSON.stringify((atB[0].transfer || {}).from) === JSON.stringify([OWNER_A, OWNER_R]), "binding lists A then R").to.equal(true);
        });

        it("moving the key back to a previous owner drops that owner from the binding", async function () {
            const r1 = await transferred(OWNER_A, EMAIL_R, [UDID_1]);
            expect(r1.success, "A -> R accepted").to.equal(true);
            const r2 = await transferred(OWNER_R, EMAIL_A, [UDID_1]);
            expect(r2.success, "R -> A accepted").to.equal(true);
            expect(ownerOf(UDID_1) === OWNER_A, "device owner is A").to.equal(true);
            const atA = withHash(OWNER_A, HASH_1);
            expect(atA.length, "KEY_1 entries at A").to.equal(1);
            expect(JSON.stringify((atA[0].transfer || {}).from) === JSON.stringify([OWNER_R]), "binding lists only R").to.equal(true);
        });

        it("a self-transfer keeps today's behaviour and touches no key store", async function () {
            const before = snapshot();
            const r = await transferred(OWNER_A, EMAIL_A, [UDID_N]);
            expect(r.success, "self-transfer accepted").to.equal(true);
            expect(redis.evals, "EVAL calls").to.equal(0);
            expectStoresUnchanged(before, "self-transfer:");
        });
    });

    // -----------------------------------------------------------------------
    describe("U86 gate: request", function () {

        async function expectRefused(udids, reason, label) {
            const before = snapshot();
            const r = await request(OWNER_A, { to: EMAIL_R, udids: udids, mig_sources: false, mig_apikeys: false });
            await settle();
            expect(r.success, (label || "") + " request refused").to.equal(false);
            expect(r.response, label).to.equal(reason);
            expect(dtKeys().length, (label || "") + " dt:/dtr: records").to.equal(0);
            expect(mails, (label || "") + " mails sent").to.equal(0);
            expectStoresUnchanged(before, label);
            expect(redis.evals, (label || "") + " EVAL calls").to.equal(0);
        }

        it("another device of the sender on the same key: apikey_shared", async function () {
            addDevice(UDID_S, OWNER_A, HASH_1);
            await expectRefused([UDID_1], "apikey_shared");
        });

        it("another owner's device on the same key: apikey_shared", async function () {
            addDevice(UDID_BS, OWNER_B, sha256(HASH_1));
            await expectRefused([UDID_1], "apikey_shared");
        });

        it("two requested devices on the same key: apikey_shared", async function () {
            addDevice(UDID_S, OWNER_A, HASH_1);
            await expectRefused([UDID_1, UDID_S], "apikey_shared");
        });

        it("one shared device refuses the whole request", async function () {
            addDevice(UDID_S2, OWNER_A, HASH_2);
            await expectRefused([UDID_1, UDID_2], "apikey_shared");
        });

        it("a device without lastkey: apikey_not_identified", async function () {
            await expectRefused([UDID_N], "apikey_not_identified");
        });

        it("a key no longer in the sender's store: apikey_not_identified", async function () {
            setKeys(OWNER_A, [entry(KEY_2, "u86-two"), entry(KEY_M, "Default MQTT API Key")]);
            await expectRefused([UDID_1], "apikey_not_identified");
        });

        it("a device registered with a masked key: apikey_not_identified", async function () {
            addDevice(UDID_MASK, OWNER_A, sha256("******************************" + KEY_1.substring(30)));
            await expectRefused([UDID_MASK], "apikey_not_identified");
        });

        it("a duplicated entry: apikey_ambiguous", async function () {
            setKeys(OWNER_A, [entry(KEY_1, ALIAS_1), entry(KEY_1, "u86-dup"), entry(KEY_2, "u86-two")]);
            await expectRefused([UDID_1], "apikey_ambiguous");
        });

        it("a device on the sender's Default MQTT API Key: apikey_owner_mqtt_key", async function () {
            addDevice(UDID_MK, OWNER_A, HASH_M);
            await expectRefused([UDID_MK], "apikey_owner_mqtt_key");
        });

        it("a Redis error, a malformed store or a find error: apikey_check_failed", async function () {
            redis.getErrorKeys.add("ak:" + OWNER_A);
            await expectRefused([UDID_1], "apikey_check_failed", "redis error:");
            redis.getErrorKeys.clear();

            redis.store.set("ak:" + OWNER_A, "{not json");
            await expectRefused([UDID_1], "apikey_check_failed", "malformed store:");
            seedRedis();

            couch.findError = true;
            await expectRefused([UDID_1], "apikey_check_failed", "find error:");
        });

        it("a foreign udid still answers no_such_device, before any key check", async function () {
            await expectRefused([UDID_FB], "no_such_device");
            expect(couch.finds, "find calls").to.equal(0);
        });
    });

    // -----------------------------------------------------------------------
    describe("U86 gate: accept", function () {

        it("a key that became shared after the request is refused and nothing changes", async function () {
            const id = await requested(OWNER_A, EMAIL_R, [UDID_1]);
            addDevice(UDID_S, OWNER_A, HASH_1);
            const before = snapshot();
            const r = await accept({ transfer_id: id, udids: [UDID_1] });
            await settle();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("apikey_shared");
            expect(ownerOf(UDID_1) === OWNER_A, "device owner is still A").to.equal(true);
            expectStoresUnchanged(before);
            expect(redis.store.has("dt:" + id), "transfer still pending").to.equal(true);
            expect(couch.writes.filter((w) => w.op === "atomic").length, "device writes").to.equal(0);
        });

        it("a key revoked after the request is refused: apikey_not_identified", async function () {
            const id = await requested(OWNER_A, EMAIL_R, [UDID_1]);
            setKeys(OWNER_A, [entry(KEY_2, "u86-two"), entry(KEY_M, "Default MQTT API Key")]);
            const before = snapshot();
            const r = await accept({ transfer_id: id, udids: [UDID_1] });
            await settle();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("apikey_not_identified");
            expect(ownerOf(UDID_1) === OWNER_A, "device owner is still A").to.equal(true);
            expectStoresUnchanged(before);
            expect(redis.store.has("dt:" + id), "transfer still pending").to.equal(true);
        });

        it("two devices move one at a time", async function () {
            const id = await requested(OWNER_A, EMAIL_R, [UDID_1, UDID_2]);
            const r = await accept({ transfer_id: id, udids: [UDID_1, UDID_2] });
            await settle();
            expect(r.success, "accept succeeded").to.equal(true);
            expect(ownerOf(UDID_1) === OWNER_R, "DEV_1 owner is R").to.equal(true);
            expect(ownerOf(UDID_2) === OWNER_R, "DEV_2 owner is R").to.equal(true);
            expect(withHash(OWNER_R, HASH_1).length, "KEY_1 at R").to.equal(1);
            expect(withHash(OWNER_R, HASH_2).length, "KEY_2 at R").to.equal(1);
            expect(withHash(OWNER_A, HASH_1).length + withHash(OWNER_A, HASH_2).length, "keys left at A").to.equal(0);
            expect(redis.evals, "EVAL calls").to.equal(2);
            expect(redis.maxInFlight, "EVALs in flight at once").to.equal(1);
        });

        it("only the device whose key became shared stays; the other moves", async function () {
            const id = await requested(OWNER_A, EMAIL_R, [UDID_1, UDID_2]);
            addDevice(UDID_S2, OWNER_A, HASH_2);
            const r = await accept({ transfer_id: id, udids: [UDID_1, UDID_2] });
            await settle();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("apikey_shared");
            expect(ownerOf(UDID_1) === OWNER_R, "DEV_1 owner is R").to.equal(true);
            expect(withHash(OWNER_R, HASH_1).length, "KEY_1 at R").to.equal(1);
            expect(ownerOf(UDID_2) === OWNER_A, "DEV_2 owner is still A").to.equal(true);
            expect(withHash(OWNER_A, HASH_2).length, "KEY_2 still at A").to.equal(1);
            expect(withHash(OWNER_R, HASH_2).length, "KEY_2 not at R").to.equal(0);
        });
    });

    // -----------------------------------------------------------------------
    describe("U86 atomicity", function () {

        let id = null;
        beforeEach(async () => {
            id = await requested(OWNER_A, EMAIL_R, [UDID_1]);
        });

        function acceptOne() {
            return accept({ transfer_id: id, udids: [UDID_1] }).then(async (r) => {
                await settle();
                return r;
            });
        }

        it("a concurrent change before the first compare is retried from a fresh read and kept", async function () {
            redis.hooks[1] = (store) => {
                const list = JSON.parse(store.get("ak:" + OWNER_A));
                list.push(entry(KEY_X, "u86-concurrent"));
                store.set("ak:" + OWNER_A, JSON.stringify(list));
            };
            const r = await acceptOne();
            expect(r.success, "accept succeeded").to.equal(true);
            expect(redis.evals, "EVAL calls").to.equal(2);
            expect(withHash(OWNER_A, HASH_X).length, "the concurrent entry is kept").to.equal(1);
            expect(ownerOf(UDID_1) === OWNER_R, "device owner is R").to.equal(true);
            expectSameSide();
        });

        it("a swap that never applies fails after three attempts and changes nothing", async function () {
            redis.evalMode = "always-zero";
            const before = snapshot();
            const r = await acceptOne();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("apikey_move_failed");
            expect(redis.evals, "EVAL calls").to.equal(3);
            expect(ownerOf(UDID_1) === OWNER_A, "device owner is still A").to.equal(true);
            expectStoresUnchanged(before);
            expectSameSide();
        });

        it("a transport error before the swap applied fails and changes nothing", async function () {
            redis.evalMode = "error-before";
            const before = snapshot();
            const r = await acceptOne();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("apikey_move_failed");
            expect(ownerOf(UDID_1) === OWNER_A, "device owner is still A").to.equal(true);
            expectStoresUnchanged(before);
            expectSameSide();
        });

        it("a transport error after the swap applied counts as moved and the device migrates", async function () {
            redis.evalMode = "error-after";
            const r = await acceptOne();
            expect(r.success, "accept succeeded").to.equal(true);
            expect(ownerOf(UDID_1) === OWNER_R, "device owner is R").to.equal(true);
            expect(withHash(OWNER_R, HASH_1).length, "KEY_1 at R").to.equal(1);
            expectSameSide();
        });

        it("a failed owner write restores both stores byte-identical", async function () {
            couch.atomicMode[UDID_1] = "error";
            const before = snapshot();
            const r = await acceptOne();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("device_move_failed");
            expect(ownerOf(UDID_1) === OWNER_A, "device owner is still A").to.equal(true);
            expectStoresUnchanged(before);
            expectSameSide();
            expect(redis.store.has("dt:" + id), "transfer still pending").to.equal(true);
        });

        it("an owner write that landed despite the error is kept", async function () {
            couch.atomicMode[UDID_1] = "apply-then-error";
            const r = await acceptOne();
            expect(r.success, "accept succeeded").to.equal(true);
            expect(ownerOf(UDID_1) === OWNER_R, "device owner is R").to.equal(true);
            expect(withHash(OWNER_R, HASH_1).length, "KEY_1 at R").to.equal(1);
            expectSameSide();
        });

        it("a refused exact restore moves the entry back without its binding and keeps R's new entry", async function () {
            couch.atomicMode[UDID_1] = "error";
            redis.hooks[2] = (store) => {
                const list = JSON.parse(store.get("ak:" + OWNER_R));
                list.push(entry(KEY_X, "u86-concurrent-r"));
                store.set("ak:" + OWNER_R, JSON.stringify(list));
            };
            const r = await acceptOne();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("device_move_failed");
            expect(ownerOf(UDID_1) === OWNER_A, "device owner is still A").to.equal(true);
            const back = withHash(OWNER_A, HASH_1);
            expect(back.length, "KEY_1 back at A").to.equal(1);
            expect(back[0].key === KEY_1, "key unchanged").to.equal(true);
            expect(Object.prototype.hasOwnProperty.call(back[0], "transfer"), "binding stripped").to.equal(false);
            expect(withHash(OWNER_R, HASH_X).length, "R's new entry is kept").to.equal(1);
            expectSameSide();
        });

        it("an alias collision at the recipient renames only the moved entry", async function () {
            const own = entry(KEY_R, ALIAS_1);
            setKeys(OWNER_R, [own]);
            const r = await acceptOne();
            expect(r.success, "accept succeeded").to.equal(true);
            const mine = withHash(OWNER_R, HASH_R);
            expect(mine.length).to.equal(1);
            expect(JSON.stringify(mine[0]) === JSON.stringify(own), "R's own entry untouched").to.equal(true);
            const moved = withHash(OWNER_R, HASH_1);
            expect(moved.length).to.equal(1);
            expect(moved[0].alias === ALIAS_1 + " (transferred " + UDID_1.substring(0, 8) + ")", "moved alias is renamed").to.equal(true);
            expect(moved[0].key === KEY_1, "key unchanged").to.equal(true);
            expect(moved[0].hash === HASH_1, "hash unchanged").to.equal(true);
            expectSameSide();
        });

        it("a recipient that already holds the key is refused and nothing changes", async function () {
            setKeys(OWNER_R, [entry(KEY_R, "u86-r"), entry(KEY_1, "u86-r-copy")]);
            const before = snapshot();
            const r = await acceptOne();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("apikey_move_failed");
            expect(ownerOf(UDID_1) === OWNER_A, "device owner is still A").to.equal(true);
            expectStoresUnchanged(before);
        });
    });

    // -----------------------------------------------------------------------
    describe("U86 logging", function () {

        it("never prints the moved key or its hash", async function () {
            const captured = [];
            const methods = ["log", "info", "warn", "error"];
            const original = {};
            for (const m of methods) {
                original[m] = console[m];
                console[m] = (...args) => {
                    captured.push(args.map((a) => {
                        if (typeof (a) === "string") return a;
                        try { return JSON.stringify(a); } catch (_e) { return String(a); }
                    }).join(" "));
                };
            }
            try {
                const r = await transferred(OWNER_A, EMAIL_R, [UDID_1]);
                addDevice(UDID_S2, OWNER_A, HASH_2);
                const refused = await request(OWNER_A, { to: EMAIL_R, udids: [UDID_2] });
                await settle();
                captured.push("u86-done " + String(r.success) + " " + String(refused.success));
            } finally {
                for (const m of methods) console[m] = original[m];
            }
            expect(captured.length > 0, "captured output").to.equal(true);
            for (const line of captured) {
                expect(line.indexOf(KEY_1) === -1, "a log line contains KEY_1").to.equal(true);
                expect(line.indexOf(HASH_1) === -1, "a log line contains HASH_1").to.equal(true);
                expect(line.indexOf(KEY_2) === -1, "a log line contains KEY_2").to.equal(true);
                expect(line.indexOf(HASH_2) === -1, "a log line contains HASH_2").to.equal(true);
            }
        });
    });
});
