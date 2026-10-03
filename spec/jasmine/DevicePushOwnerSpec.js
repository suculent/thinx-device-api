/*
 * DevicePushOwnerSpec — quick 261003-v9d: POST /device/addpush writes a push token only
 * for a device of the owner whose API key authenticated the request.
 *
 * Pinned rule of Device#push (the device check-in rule after tv5/u86):
 * - the body names an owner in a top-level `owner` field (a valid owner id);
 * - the Authentication key verifies for that owner through APIKey#verify in its
 *   4-argument form (exact match since quick 261003-s59; no u86 transfer redirect, and a
 *   transfer binding is never consumed);
 * - the udid is that owner's device (Device#fetchOwned, strict Device.isOwnedBy);
 * - only the `push` field is written; other body fields (alias, lastkey, owner) never are;
 * - there is no lastkey binding: any key of the owner (its key or its hash) is accepted,
 *   as on check-in, and addpush never writes lastkey.
 *
 * Refusals (HTTP 200 through Util.responder, success false):
 * - "authentication": absent/empty key, absent/null/invalid owner, or a key that does not
 *   verify for the named owner; decided before any device lookup;
 * - "push_device_not_found": malformed/absent/non-string udid, unknown udid, another
 *   owner's udid or a lookup error, answered identically (no udid-existence oracle).
 * A failed write answers "push_token_not_registered", never a false success.
 *
 * Runs without Redis and without CouchDB. lib/thinx/couch.js, lib/thinx/audit.js and
 * lib/thinx/deployment.js are swapped in require.cache for an in-memory fake CouchDB, a
 * no-op audit log and a no-op deployment, and a fresh copy of lib/thinx/device.js is
 * loaded against them (the DeviceRegisterOwnerSpec pattern). A Map-backed Redis stub holds
 * the ak: stores. The swap lives in the outer describe's beforeAll/afterAll, so it never
 * leaks into the other spec files CI runs in the same process.
 *
 * Nothing here prints a key, a key hash, a push token or a device document; assertions
 * compare booleans, counts, exact strings and deep equality against the seed only.
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

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const DEPLOYMENT_PATH = require.resolve("../../lib/thinx/deployment");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const ROUTER_DEVICEAPI_PATH = require.resolve("../../lib/router.deviceapi");

const SWAPPED = [COUCH_PATH, AUDIT_PATH, DEPLOYMENT_PATH, DEVICE_PATH];

const PREFIX = Globals.prefix();

const OWNER_A = sha256(PREFIX + "v9d-owner-a@example.com");
const OWNER_B = sha256(PREFIX + "v9d-owner-b@example.com");

const KEY_A = sha256("v9d-key-a");
const KEY_A2 = sha256("v9d-key-a2");
const KEY_B = sha256("v9d-key-b");
const HASH_A = sha256(KEY_A);
const HASH_A2 = sha256(KEY_A2);
const HASH_B = sha256(KEY_B);

// quick 261003-u86 binding shape: a key moved from A to B with UDID_B's transfer.
const KEY_T = sha256("v9d-key-t");
const HASH_T = sha256(KEY_T);

const KEY_UNKNOWN = sha256("v9d-unknown-key");

// 64 lowercase hex: valid iOS push tokens for the router's sanitka.pushToken.
const PUSH_OLD_A = sha256("v9d-push-old-a");
const PUSH_OLD_B = sha256("v9d-push-old-b");
const PUSH_NEW = sha256("v9d-push-new");
const PUSH_NEW2 = sha256("v9d-push-new-2");

const UDID_A = "a9d00000-0000-4000-8000-0000000000a1";
const UDID_B = "b9d00000-0000-4000-8000-0000000000b1";
const UDID_ORPHAN = "e9d00000-0000-4000-8000-0000000000e1";
const UDID_FREE = "c9d00000-0000-4000-8000-0000000000c1";
const UDID_BROKEN = "d9d00000-0000-4000-8000-0000000000d1";

const NOT_FOUND_TEXT = JSON.stringify({ success: false, response: "push_device_not_found" });
const AUTH_TEXT = JSON.stringify({ success: false, response: "authentication" });
const REGISTERED_TEXT = JSON.stringify({ success: true, response: "push_token_registered" });

const TIMEOUT = 15000;

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = {
    devices: {},
    seed: {},
    writes: [],
    gets: 0,
    atomicError: null
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

function seedCouch() {
    const docs = [
        {
            _id: UDID_A, _rev: "1-a1", udid: UDID_A, owner: OWNER_A, alias: "v9d-a1",
            push: PUSH_OLD_A, lastkey: HASH_A, mac: "7E:9D:00:00:00:A1"
        },
        {
            _id: UDID_B, _rev: "1-b1", udid: UDID_B, owner: OWNER_B, alias: "v9d-b1",
            push: PUSH_OLD_B, mac: "7E:9D:00:00:00:B1"
        },
        {
            _id: UDID_ORPHAN, _rev: "1-e1", udid: UDID_ORPHAN, alias: "v9d-orphan",
            mac: "7E:9D:00:00:00:E1"
        }
    ];
    couch.devices = {};
    couch.seed = {};
    for (const d of docs) {
        couch.devices[d._id] = copy(d);
        couch.seed[d._id] = copy(d);
    }
    couch.writes = [];
    couch.gets = 0;
    couch.atomicError = null;
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
        return answer(cb, null, { rows: [] });
    },
    atomic(design, update, id, changes, cb) {
        couch.writes.push({ op: "atomic", id: id, keys: Object.keys(changes || {}).sort() });
        if ((couch.atomicError !== null) && (id === couch.atomicError)) {
            return answer(cb, Object.assign(new Error("v9d atomic failure"), { statusCode: 500 }));
        }
        if (!has(couch.devices, id)) return answer(cb, notFound());
        Object.assign(couch.devices[id], copy(changes));
        return answer(cb, null, { ok: true });
    },
    insert(doc, id, cb) {
        couch.writes.push({ op: "insert", id: id });
        return answer(cb, null, { ok: true, id: id });
    },
    destroy(id, rev, cb) {
        couch.writes.push({ op: "destroy", id: id });
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

class DeploymentStub {
    initWithOwner() { /* no-op */ }
    initWithDevice() { /* no-op */ }
    latestFirmwareEnvelope() { return undefined; }
    hasUpdateAvailable() { return false; }
    latestFirmwarePath(owner, udid, callback) { callback(false); }
}

// ---------------------------------------------------------------------------
// Redis stub
// ---------------------------------------------------------------------------

// Map-backed stand-in for the legacy redis client. Values are stored synchronously;
// callbacks are deferred with setImmediate. `writes` records every mutating call's key.
function makeRedisStub() {
    const store = new Map();
    const stub = { store: store, writes: [] };
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
        later(lastCallback(rest), null, store.has(key) ? store.get(key) : null);
    };
    stub.set = function (key, value, ...rest) {
        stub.writes.push({ op: "set", key: key });
        store.set(key, String(value));
        later(lastCallback(rest), null, "OK");
    };
    stub.del = function (key, ...rest) {
        stub.writes.push({ op: "del", key: key });
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
        stub.writes.push({ op: "sAdd", key: key });
        later(cb, null, Array.isArray(members) ? members.length : 1);
    };
    stub.sendCommand = function (...args) {
        stub.writes.push({ op: "sendCommand", key: null });
        let cb = null;
        if (typeof (args[args.length - 1]) === "function") cb = args.pop();
        later(cb, null, 0);
    };
    stub.on = function () { /* no-op */ };
    return stub;
}

function keyEntry(key, alias, extra) {
    return Object.assign({ key: key, hash: sha256(key), alias: alias }, extra || {});
}

function seedRedis(redis) {
    for (const k of Array.from(redis.store.keys())) redis.store.delete(k);
    redis.store.set("ak:" + OWNER_A, JSON.stringify([keyEntry(KEY_A, "v9d-key-a"), keyEntry(KEY_A2, "v9d-key-a2")]));
    redis.store.set("ak:" + OWNER_B, JSON.stringify([keyEntry(KEY_B, "v9d-key-b")]));
    redis.writes = [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let saved = {};
let Device = null;   // fresh lib/thinx/device.js class (fake couch)
let device = null;
let redis = null;
let server = null;

function REG(owner, udid, extra) {
    const reg = { push: PUSH_NEW, udid: udid };
    if (typeof (owner) !== "undefined") reg.owner = owner;
    return Object.assign(reg, extra || {});
}

// Resolves on the FIRST push callback.
function pushOf(reg, key) {
    return new Promise((resolve) => {
        let done = false;
        device.push(reg, key, (success, response) => {
            if (done) return;
            done = true;
            resolve({ success: success, response: response });
        });
    });
}

function expectPair(r, success, response, label) {
    const l = (label || "") + " ";
    expect(r.success === success, l + "success is " + success).to.equal(true);
    expect(r.response === response, l + "response is " + response).to.equal(true);
}

function atomics() {
    return couch.writes.filter((w) => w.op === "atomic");
}

function expectNothingWritten(label) {
    const l = (label || "") + " ";
    expect(couch.writes.length, l + "couch write attempts").to.equal(0);
    for (const id of Object.keys(couch.seed)) {
        expect(nodeUtil.isDeepStrictEqual(couch.devices[id], couch.seed[id]), l + "stored device " + id + " unchanged").to.equal(true);
    }
    expect(Object.keys(couch.devices).length, l + "stored device count").to.equal(Object.keys(couch.seed).length);
}

function expectNoLookup(label) {
    expect(couch.gets, (label || "") + " device lookups").to.equal(0);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// Runs fn with console.log/info/warn/error captured; always restores them.
async function withConsole(fn) {
    const names = ["log", "info", "warn", "error"];
    const original = {};
    const lines = [];
    for (const n of names) {
        original[n] = console[n];
        console[n] = function () {
            const parts = Array.prototype.slice.call(arguments).map((a) => {
                if (typeof (a) === "string") return a;
                try { return JSON.stringify(a); } catch (_e) { return String(a); }
            });
            lines.push(parts.join(" "));
        };
    }
    try {
        const result = await fn();
        // Let deferred log lines of the same operation land inside the capture.
        await sleep(20);
        return { result: result, text: lines.join("\n") };
    } finally {
        for (const n of names) console[n] = original[n];
    }
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

describe("DevicePushOwnerSpec (quick 261003-v9d)", function () {

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

    // -----------------------------------------------------------------------
    describe("PUSH core: owner's key writes", function () {

        it("P1. the owner's key, owner and udid write only the push field", async function () {
            const r = await pushOf(REG(OWNER_A, UDID_A, {
                alias: "v9d-other-alias",
                lastkey: sha256("v9d-forged")
            }), KEY_A);
            expectPair(r, true, "push_token_registered");
            const expected = copy(couch.seed[UDID_A]);
            expected.push = PUSH_NEW;
            expect(nodeUtil.isDeepStrictEqual(couch.devices[UDID_A], expected), "only push replaced on UDID_A").to.equal(true);
            expect(atomics().length, "atomic writes").to.equal(1);
            expect(atomics()[0].id === UDID_A, "atomic write targets UDID_A").to.equal(true);
            expect(nodeUtil.isDeepStrictEqual(atomics()[0].keys, ["push"]), "changes carry push only").to.equal(true);
            expect(couch.writes.length, "couch write attempts").to.equal(1);
        }, TIMEOUT);

        it("P2. no lastkey binding: any key of the owner, or its hash, writes", async function () {
            const r1 = await pushOf(REG(OWNER_A, UDID_A), KEY_A2);
            expectPair(r1, true, "push_token_registered", "KEY_A2");
            expect(couch.devices[UDID_A].push === PUSH_NEW, "push stored after KEY_A2").to.equal(true);
            expect(couch.devices[UDID_A].lastkey === HASH_A, "lastkey unchanged after KEY_A2").to.equal(true);

            const r2 = await pushOf(REG(OWNER_A, UDID_A, { push: PUSH_NEW2 }), HASH_A2);
            expectPair(r2, true, "push_token_registered", "HASH_A2");
            expect(couch.devices[UDID_A].push === PUSH_NEW2, "push stored after HASH_A2").to.equal(true);
            expect(couch.devices[UDID_A].lastkey === HASH_A, "lastkey unchanged after HASH_A2").to.equal(true);
            expect(atomics().length, "atomic writes").to.equal(2);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("PUSH core: refusals write nothing", function () {

        it("P3. B's key naming B with A's udid answers push_device_not_found", async function () {
            const r = await pushOf(REG(OWNER_B, UDID_A), KEY_B);
            expectPair(r, false, "push_device_not_found");
            expectNothingWritten();
        }, TIMEOUT);

        it("P4. B's key with an unknown or an unverifiable udid answers the identical pair", async function () {
            const r1 = await pushOf(REG(OWNER_B, UDID_FREE), KEY_B);
            expectPair(r1, false, "push_device_not_found", "UDID_FREE");
            const r2 = await pushOf(REG(OWNER_B, UDID_BROKEN), KEY_B);
            expectPair(r2, false, "push_device_not_found", "UDID_BROKEN");
            expectNothingWritten();
        }, TIMEOUT);

        it("P5. B's key naming A answers authentication before any lookup", async function () {
            const r = await pushOf(REG(OWNER_A, UDID_A), KEY_B);
            expectPair(r, false, "authentication");
            expectNoLookup();
            expectNothingWritten();
        }, TIMEOUT);

        it("P6. an absent or null owner answers authentication", async function () {
            const r1 = await pushOf(REG(undefined, UDID_A), KEY_A);
            expectPair(r1, false, "authentication", "absent owner");
            const r2 = await pushOf(REG(null, UDID_A), KEY_A);
            expectPair(r2, false, "authentication", "null owner");
            expectNoLookup();
            expectNothingWritten();
        }, TIMEOUT);

        it("P7. an invalid owner answers authentication without throwing", async function () {
            for (const owner of ["", "v9d'bad", 42, {}]) {
                let r = null;
                let threw = false;
                try {
                    r = await pushOf(REG(owner, UDID_A), KEY_A);
                } catch (_e) {
                    threw = true;
                }
                expect(threw, "push threw for owner of type " + typeof (owner)).to.equal(false);
                expectPair(r, false, "authentication", "owner of type " + typeof (owner));
            }
            expectNoLookup();
            expectNothingWritten();
        }, TIMEOUT);

        it("P8. a well-formed key in no store answers authentication", async function () {
            const r = await pushOf(REG(OWNER_A, UDID_A), KEY_UNKNOWN);
            expectPair(r, false, "authentication");
            expectNoLookup();
            expectNothingWritten();
        }, TIMEOUT);

        it("P9. an absent or empty key answers authentication", async function () {
            const r1 = await pushOf(REG(OWNER_A, UDID_A), undefined);
            expectPair(r1, false, "authentication", "undefined key");
            const r2 = await pushOf(REG(OWNER_A, UDID_A), "");
            expectPair(r2, false, "authentication", "empty key");
            expectNoLookup();
            expectNothingWritten();
        }, TIMEOUT);

        it("P10. a malformed, absent or non-string udid never reaches CouchDB", async function () {
            for (const udid of ["v9d-not-a-udid", undefined, 42]) {
                const r = await pushOf(REG(OWNER_A, udid), KEY_A);
                expectPair(r, false, "push_device_not_found", "udid of type " + typeof (udid));
            }
            expectNoLookup();
            expectNothingWritten();
        }, TIMEOUT);

        it("P11. a document with no owner answers push_device_not_found", async function () {
            const r = await pushOf(REG(OWNER_A, UDID_ORPHAN), KEY_A);
            expectPair(r, false, "push_device_not_found");
            expectNothingWritten();
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("PUSH core: no transfer continuity", function () {

        it("P19. a transferred key naming its previous owner is refused and the binding stays", async function () {
            const entries = [
                keyEntry(KEY_B, "v9d-key-b"),
                {
                    key: KEY_T, hash: HASH_T, alias: "v9d-transferred",
                    transfer: { udid: UDID_B, from: [OWNER_A], at: "2026-10-03T00:00:00.000Z" }
                }
            ];
            const storeB = JSON.stringify(entries);
            redis.store.set("ak:" + OWNER_B, storeB);

            const r1 = await pushOf(REG(OWNER_A, UDID_B), KEY_T);
            expectPair(r1, false, "authentication", "previous owner named");
            expectNothingWritten("previous owner named");

            const r2 = await pushOf(REG(OWNER_B, UDID_B), KEY_T);
            expectPair(r2, true, "push_token_registered", "current owner named");
            expect(couch.devices[UDID_B].push === PUSH_NEW, "push stored on UDID_B").to.equal(true);

            expect(redis.store.get("ak:" + OWNER_B) === storeB, "ak:B byte-identical to its seed").to.equal(true);
            expect(redis.writes.length, "redis writes").to.equal(0);
            expect(HASH_B.length, "fixture sanity").to.equal(64);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("PUSH core: write failure", function () {

        it("P12. a failed write answers push_token_not_registered", async function () {
            couch.atomicError = UDID_A;
            const { result } = await withConsole(() => pushOf(REG(OWNER_A, UDID_A), KEY_A));
            expectPair(result, false, "push_token_not_registered");
            expect(nodeUtil.isDeepStrictEqual(couch.devices[UDID_A], couch.seed[UDID_A]), "UDID_A unchanged").to.equal(true);
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("PUSH core: logging", function () {

        it("P13. no log line carries the push token or a key", async function () {
            const { text } = await withConsole(async () => {
                await pushOf(REG(OWNER_A, UDID_A), KEY_A);
                await pushOf(REG(OWNER_B, UDID_A), KEY_B);
                await pushOf(REG(OWNER_A, UDID_A), KEY_B);
            });
            for (const [name, secret] of [["PUSH_NEW", PUSH_NEW], ["KEY_A", KEY_A], ["KEY_B", KEY_B], ["HASH_A", HASH_A]]) {
                expect(text.indexOf(secret) === -1, "console output contains " + name).to.equal(true);
            }
        }, TIMEOUT);
    });

    // -----------------------------------------------------------------------
    describe("PUSH e2e: POST /device/addpush", function () {

        it("P14. no Authentication header answers 403", async function () {
            const res = await send("POST", "/device/addpush", { body: { push: PUSH_NEW, udid: UDID_A, owner: OWNER_A } });
            expect(res.status).to.equal(403);
            expectNothingWritten();
        }, TIMEOUT);

        it("P15. B's key with A's udid answers push_device_not_found", async function () {
            const res = await send("POST", "/device/addpush", { key: KEY_B, body: { push: PUSH_NEW, udid: UDID_A, owner: OWNER_B } });
            expect(res.status).to.equal(200);
            expect(res.text === NOT_FOUND_TEXT, "exact push_device_not_found text").to.equal(true);
            expectNothingWritten();
        }, TIMEOUT);

        it("P16. B's key with an unknown udid answers byte-identically", async function () {
            const res = await send("POST", "/device/addpush", { key: KEY_B, body: { push: PUSH_NEW, udid: UDID_FREE, owner: OWNER_B } });
            expect(res.status).to.equal(200);
            expect(res.text === NOT_FOUND_TEXT, "exact push_device_not_found text").to.equal(true);
            expectNothingWritten();
        }, TIMEOUT);

        it("P17. A's key with A's udid and owner registers the push token", async function () {
            const res = await send("POST", "/device/addpush", { key: KEY_A, body: { push: PUSH_NEW, udid: UDID_A, owner: OWNER_A } });
            expect(res.status).to.equal(200);
            expect(res.text === REGISTERED_TEXT, "exact push_token_registered text").to.equal(true);
            expect(couch.devices[UDID_A].push === PUSH_NEW, "push stored on UDID_A").to.equal(true);
        }, TIMEOUT);

        it("P18. a request naming no owner answers authentication", async function () {
            const res = await send("POST", "/device/addpush", { key: KEY_A, body: { push: PUSH_NEW, udid: UDID_A } });
            expect(res.status).to.equal(200);
            expect(res.text === AUTH_TEXT, "exact authentication text").to.equal(true);
            expectNothingWritten();
        }, TIMEOUT);
    });
});
