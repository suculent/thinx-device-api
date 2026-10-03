/*
 * DeviceOwnershipSpec — quick 261003-t29: udid-keyed device routes and device transfers
 * act only on devices the authenticated owner owns.
 *
 * Runs without Redis and without CouchDB. The real lib/router.js, lib/router.device.js
 * and lib/router.transfer.js are mounted on a bare express app (express-session,
 * cookie-parser, a Map-backed Redis stub, a recording messenger fake). lib/thinx/couch.js
 * and lib/thinx/audit.js are swapped in require.cache for an in-memory fake CouchDB and a
 * no-op audit log, and fresh copies of device.js, devices.js and transfer.js are loaded
 * against them. The swap lives in the outer describe's beforeAll/afterAll, so it never
 * leaks into the other spec files CI runs in the same process.
 *
 * Pinned behaviour:
 * - Device.isOwnedBy / Device#fetchOwned / Device#filterOwned are the single ownership
 *   check: strict equality, fail closed, one view query per batch;
 * - another owner's udid answers exactly like an unknown udid (HTTP 200,
 *   {"success":false,"response":"no_such_device"}) on every udid-keyed route, for
 *   session, Bearer and verified API-key callers, and nothing of that device is touched;
 * - the owner keeps full access to their own devices;
 * - batch routes (push, revoke) act only on owned devices;
 * - a transfer request naming any unowned udid is refused before anything is stored or
 *   mailed, and accept migrates only udids of the stored transfer that the originator
 *   still owns.
 *
 * Nothing here prints a cookie, token, key, environment or device document; assertions
 * compare status codes, exact response strings, booleans and udids only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const http = require("http");
const expect = require("chai").expect;
const sha256 = require("sha256");

const Globals = require("../../lib/thinx/globals");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const DEVICES_PATH = require.resolve("../../lib/thinx/devices");
const TRANSFER_PATH = require.resolve("../../lib/thinx/transfer");
const ROUTER_DEVICE_PATH = require.resolve("../../lib/router.device");
const ROUTER_TRANSFER_PATH = require.resolve("../../lib/router.transfer");

const SWAPPED = [COUCH_PATH, AUDIT_PATH, DEVICE_PATH, DEVICES_PATH, TRANSFER_PATH, ROUTER_DEVICE_PATH, ROUTER_TRANSFER_PATH];
const RELOADED = [DEVICE_PATH, DEVICES_PATH, TRANSFER_PATH, ROUTER_DEVICE_PATH, ROUTER_TRANSFER_PATH];

const PREFIX = Globals.prefix();

const EMAIL_A = "t29-owner-a@example.com";
const EMAIL_B = "t29-owner-b@example.com";
const EMAIL_R = "t29-recipient@example.com";
const OWNER_A = sha256(PREFIX + EMAIL_A);
const OWNER_B = sha256(PREFIX + EMAIL_B);
const OWNER_R = sha256(PREFIX + EMAIL_R);

const KEY_A = sha256("t29-key-a");
const KEY_B = sha256("t29-key-b");
const HASH_A = sha256(KEY_A);
const HASH_B = sha256(KEY_B);

const UDID_A = "a29a0000-0000-4000-8000-00000000000a";
const UDID_A2 = "a29a0000-0000-4000-8000-0000000000a2";
const UDID_B = "b29b0000-0000-4000-8000-00000000000b";
const UDID_UNKNOWN = "c29c0000-0000-4000-8000-00000000000c";
const UDID_BROKEN = "d29d0000-0000-4000-8000-00000000000d";

const ENV_SENTINEL = "t29-env-sentinel-pass";
const ALIAS_A = "t29-a";
const NOT_FOUND = '{"success":false,"response":"no_such_device"}';

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = {
    devices: {},
    users: {},
    writes: [],
    gets: 0,
    views: 0,
    viewError: false
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
    couch.devices = {};
    couch.devices[UDID_A] = {
        _id: UDID_A, _rev: "1-a", udid: UDID_A, owner: OWNER_A, alias: ALIAS_A, lastkey: HASH_A,
        source: "t29-src-a", mesh_ids: [], environment: { ssid: "t29-ssid", pass: ENV_SENTINEL }
    };
    couch.devices[UDID_A2] = { _id: UDID_A2, _rev: "1-a2", udid: UDID_A2, owner: OWNER_A, alias: "t29-second", mesh_ids: [] };
    couch.devices[UDID_B] = { _id: UDID_B, _rev: "1-b", udid: UDID_B, owner: OWNER_B, alias: "t29-b", mesh_ids: [] };
    couch.users = {};
    couch.users[OWNER_A] = { _id: OWNER_A, email: EMAIL_A };
    couch.users[OWNER_B] = { _id: OWNER_B, email: EMAIL_B };
    couch.users[OWNER_R] = { _id: OWNER_R, email: EMAIL_R };
    couch.writes = [];
    couch.gets = 0;
    couch.views = 0;
    couch.viewError = false;
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
        if (name === "devices_by_owner") docs = docs.filter((d) => d.owner === key);
        else if (name === "devices_by_udid") docs = docs.filter((d) => d.udid === key);
        else if (name === "devices_by_mac") docs = docs.filter((d) => d.mac === key);
        else docs = [];
        return answer(cb, null, { rows: docs.map((d) => ({ id: d._id, key: key, value: copy(d), doc: copy(d) })) });
    },
    atomic(design, update, id, changes, cb) {
        couch.writes.push({ op: "atomic", id: id, changes: copy(changes) });
        if (!has(couch.devices, id)) return answer(cb, notFound());
        Object.assign(couch.devices[id], copy(changes));
        return answer(cb, null, { ok: true });
    },
    destroy(id, rev, cb) {
        couch.writes.push({ op: "destroy", id: id });
        if (!has(couch.devices, id)) return answer(cb, notFound());
        delete couch.devices[id];
        return answer(cb, null, { ok: true });
    },
    insert(doc, id, cb) {
        const docId = (typeof (id) === "string") ? id : doc._id;
        couch.writes.push({ op: "insert", id: docId });
        couch.devices[docId] = copy(doc);
        return answer(cb, null, { ok: true, id: docId });
    },
    // Mango _find on lastkey (quick 261003-u86 transfer key check): selector.lastkey.$in,
    // limit and fields.
    find(query, cb) {
        const sel = (query && query.selector && query.selector.lastkey) ? query.selector.lastkey : {};
        const list = Array.isArray(sel.$in) ? sel.$in : [];
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
    }
};

const userDb = {
    get(id, cb) {
        if (has(couch.users, id)) return answer(cb, null, copy(couch.users[id]));
        return answer(cb, notFound());
    },
    atomic(design, update, id, changes, cb) {
        couch.writes.push({ op: "user-atomic", id: id });
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
// Redis stub, messenger fake, library spies
// ---------------------------------------------------------------------------

// Map-backed stand-in for the legacy redis client. Values are stored synchronously;
// callbacks are deferred with setImmediate (transfer.request's legacy exit_on_transfer
// check refuses every request when they run synchronously).
function makeRedisStub() {
    const store = new Map();
    function lastCallback(args) {
        for (let i = args.length - 1; i >= 0; i--) {
            if (typeof (args[i]) === "function") return args[i];
        }
        return null;
    }
    function later(cb, err, value) {
        if (cb) setImmediate(() => cb(err, value));
    }
    return {
        store: store,
        get(key, ...rest) {
            later(lastCallback(rest), null, store.has(key) ? store.get(key) : null);
        },
        set(key, value, ...rest) {
            store.set(key, String(value));
            later(lastCallback(rest), null, "OK");
        },
        del(key, ...rest) {
            store.delete(key);
            later(lastCallback(rest), null, 1);
        },
        expire(key, ...rest) {
            later(lastCallback(rest), null, 1);
        },
        keys(pattern, ...rest) {
            later(lastCallback(rest), null, []);
        },
        // EVAL <script> <n> <n keys> <n expected> <n next>: the multi-key compare-and-swap
        // the API-key move uses (quick 261003-u86). Absent reads as ""; all equal -> write
        // next ("" = DEL) and answer 1, else 0.
        sendCommand(...args) {
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
            for (let i = 0; i < n; i++) {
                const current = store.has(keys[i]) ? store.get(keys[i]) : "";
                if (current !== String(expected[i])) return later(cb, null, 0);
            }
            for (let i = 0; i < n; i++) {
                if (String(next[i]) === "") store.delete(keys[i]);
                else store.set(keys[i], String(next[i]));
            }
            later(cb, null, 1);
        },
        on() { }
    };
}

let messengerCalls = [];
let libCalls = [];
let mailCalls = 0;

const fakeMessenger = {
    publish(owner, udid /* , message */) {
        messengerCalls.push({ fn: "publish", owner: owner, udid: udid });
    },
    data(owner, udid, cb) {
        messengerCalls.push({ fn: "data", owner: owner, udid: udid });
        cb(true, {});
    },
    push(owner, body, cb) {
        messengerCalls.push({ fn: "push", owner: owner, udid: body.udid, udids: copy(body.udids) });
        if ((typeof (body.udid) === "undefined") && (typeof (body.udids) === "undefined")) return cb(false, "missing_udids");
        cb(true, "pushing_configuration");
    }
};

let saved = {};
let savedCsrf = {};
let Device = null;     // fresh lib/thinx/device.js class (fake couch)
let Transfer = null;   // fresh lib/thinx/transfer.js class (fake couch)
let server = null;
let redis = null;
let cookieA = null;
let cookieB = null;
let bearerB = null;

function buildApp() {
    const app = express();
    app.use(session({
        secret: "t29-spec-secret",
        name: "x-thx-core",
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: "lax" }
    }));
    app.use(cookieParser());
    app.use(express.json());

    redis = makeRedisStub();
    // Pre-seeded JWT secret, so JWTLogin.init and sign never race to create two keys.
    redis.store.set("__JWT_SECRET__", crypto.randomBytes(48).toString("hex"));
    redis.store.set("ak:" + OWNER_A, JSON.stringify([{ key: KEY_A, hash: HASH_A, alias: "t29-a" }]));
    redis.store.set("ak:" + OWNER_B, JSON.stringify([{ key: KEY_B, hash: HASH_B, alias: "t29-b" }]));
    app.redis_client = redis;
    app.messenger = fakeMessenger;
    app.device = new Device(redis);

    // Spec-only logins: bind OWNER_A / OWNER_B to a fresh session.
    app.get("/spec/login/a", (req, res) => {
        req.session.owner = OWNER_A;
        req.session.save(() => res.json({ success: true }));
    });
    app.get("/spec/login/b", (req, res) => {
        req.session.owner = OWNER_B;
        req.session.save(() => res.json({ success: true }));
    });

    // Production order: the global router first, then the device and transfer routes.
    require("../../lib/router.js")(app);
    require(ROUTER_DEVICE_PATH)(app);
    require(ROUTER_TRANSFER_PATH)(app);

    return app;
}

// Issue one request. opts: { cookie, bearer, body }.
function send(method, path, opts) {
    const o = opts || {};
    return new Promise((resolve, reject) => {
        const headers = {};
        if (typeof (o.cookie) === "string") headers.Cookie = o.cookie;
        if (typeof (o.bearer) === "string") headers.Authorization = "Bearer " + o.bearer;
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
            res.on("end", () => resolve({ status: res.statusCode, setCookie: res.headers["set-cookie"] || [], text: text }));
        });
        req.on("error", reject);
        if (payload !== null) req.write(payload);
        req.end();
    });
}

async function settle() {
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

async function loginCookie(path) {
    const login = await send("GET", path);
    const raw = login.setCookie.find((c) => c.indexOf("x-thx-core=") === 0);
    return raw ? raw.split(";")[0] : null;
}

function writesFor(id) {
    return couch.writes.filter((w) => w.id === id);
}

function expectUntouched(udid, label) {
    expect(writesFor(udid).length, (label || "") + " couch writes for the foreign device").to.equal(0);
    expect(libCalls.filter((c) => c.udid === udid).length, (label || "") + " library calls for the foreign device").to.equal(0);
    expect(messengerCalls.filter((c) => (c.udid === udid) || (Array.isArray(c.udids) && c.udids.indexOf(udid) !== -1)).length,
        (label || "") + " messenger calls for the foreign device").to.equal(0);
}

function resetRecords() {
    seedCouch();
    messengerCalls = [];
    libCalls = [];
    mailCalls = 0;
}

function fetchOwned(device, udid, owner) {
    return new Promise((resolve) => device.fetchOwned(udid, owner, (owned, result) => resolve({ owned: owned, result: result })));
}

function filterOwned(device, owner, udids) {
    return new Promise((resolve) => device.filterOwned(owner, udids, (owned) => resolve(owned)));
}

function dtKeys() {
    return Array.from(redis.store.keys()).filter((k) => k.indexOf("dt:") === 0);
}

describe("DeviceOwnershipSpec (quick 261003-t29)", function () {

    beforeAll(async () => {
        // Bind the real modules (and their whole dependency tree) before the swap, so
        // nothing that stays in require.cache ever captures the fake couch.
        require("../../lib/router.js");
        require("../../lib/thinx/util.js");
        require(DEVICE_PATH);
        require(DEVICES_PATH);
        require(TRANSFER_PATH);

        savedCsrf = { enforce: process.env.CSRF_ENFORCE, mode: process.env.CSRF_MODE };
        delete process.env.CSRF_ENFORCE;
        delete process.env.CSRF_MODE;

        saved = {};
        for (const p of SWAPPED) saved[p] = require.cache[p];

        require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
        require.cache[AUDIT_PATH] = { id: AUDIT_PATH, filename: AUDIT_PATH, loaded: true, exports: AuditStub };
        for (const p of RELOADED) delete require.cache[p];

        Device = require(DEVICE_PATH);
        const Devices = require(DEVICES_PATH);
        Transfer = require(TRANSFER_PATH);

        // These touch the filesystem and the MQTT ACL; record and answer instead.
        for (const fn of ["attach", "attachMesh", "detachMesh"]) {
            Devices.prototype[fn] = function (owner, body, callback, res) {
                libCalls.push({ fn: fn, owner: owner, udid: body ? body.udid : undefined });
                callback(res, true, fn + "_ok");
            };
        }
        // Never send mail.
        Transfer.prototype.sendMail = function (contents, type, callback) {
            mailCalls++;
            callback(true, type + "_sent");
        };

        seedCouch();
        const app = buildApp();
        server = await new Promise((resolve) => {
            const s = http.createServer(app).listen(0, "127.0.0.1", () => resolve(s));
        });
        cookieA = await loginCookie("/spec/login/a");
        cookieB = await loginCookie("/spec/login/b");
        bearerB = await new Promise((resolve) => app.login.sign(OWNER_B, resolve));
    });

    afterAll(async () => {
        if (server) await new Promise((resolve) => server.close(() => resolve()));
        server = null;
        for (const p of SWAPPED) {
            if (saved[p]) require.cache[p] = saved[p]; else delete require.cache[p];
        }
        if (typeof (savedCsrf.enforce) === "undefined") delete process.env.CSRF_ENFORCE; else process.env.CSRF_ENFORCE = savedCsrf.enforce;
        if (typeof (savedCsrf.mode) === "undefined") delete process.env.CSRF_MODE; else process.env.CSRF_MODE = savedCsrf.mode;
    });

    beforeEach(() => {
        resetRecords();
    });

    it("has sessions for both owners and a Bearer token for B", function () {
        expect(typeof (cookieA) === "string", "session cookie A").to.equal(true);
        expect(typeof (cookieB) === "string", "session cookie B").to.equal(true);
        expect((typeof (bearerB) === "string") && (bearerB.length > 0), "bearer token B").to.equal(true);
    });

    // -----------------------------------------------------------------------
    describe("OWN core: Device.isOwnedBy and Device#fetchOwned", function () {

        let device;
        beforeAll(() => {
            device = new Device(makeRedisStub());
        });

        it("isOwnedBy accepts only the exact owner string", function () {
            expect(typeof (Device.isOwnedBy), "Device.isOwnedBy is a static function").to.equal("function");
            expect(Device.isOwnedBy({ owner: OWNER_A }, OWNER_A)).to.equal(true);
            for (const other of [OWNER_A.slice(0, -1), OWNER_A + "x", OWNER_A.toUpperCase(), ""]) {
                expect(Device.isOwnedBy({ owner: OWNER_A }, other), "owner argument variant").to.equal(false);
            }
            for (const doc of [{ owner: OWNER_A + "x" }, { owner: [OWNER_A] }, {}, null, undefined]) {
                expect(Device.isOwnedBy(doc, OWNER_A), "document variant").to.equal(false);
            }
        });

        it("fetchOwned answers the owner's device", async function () {
            expect(typeof (device.fetchOwned), "Device#fetchOwned is a function").to.equal("function");
            const r = await fetchOwned(device, UDID_A, OWNER_A);
            expect(r.owned).to.equal(true);
            expect(r.result.udid).to.equal(UDID_A);
        });

        it("fetchOwned answers a foreign, a missing and a broken lookup alike", async function () {
            expect(typeof (device.fetchOwned), "Device#fetchOwned is a function").to.equal("function");
            for (const [udid, owner] of [[UDID_A, OWNER_B], [UDID_UNKNOWN, OWNER_A], [UDID_BROKEN, OWNER_A]]) {
                const r = await fetchOwned(device, udid, owner);
                expect(r.owned, udid).to.equal(false);
                expect(r.result, udid).to.equal("no_such_device");
            }
        });

        it("fetchOwned refuses invalid owners and udids without a database call", async function () {
            expect(typeof (device.fetchOwned), "Device#fetchOwned is a function").to.equal("function");
            for (const owner of [null, undefined, 123, {}, "a".repeat(32)]) {
                const r = await fetchOwned(device, UDID_A, owner);
                expect(r.owned).to.equal(false);
                expect(r.result).to.equal("no_such_device");
            }
            for (const udid of ["not-a-udid", 42, null, UDID_A + "x"]) {
                const r = await fetchOwned(device, udid, OWNER_A);
                expect(r.owned).to.equal(false);
                expect(r.result).to.equal("no_such_device");
            }
            expect(couch.gets, "devicelib.get calls").to.equal(0);
        });
    });

    // -----------------------------------------------------------------------
    describe("OWN core: Device#filterOwned", function () {

        let device;
        beforeAll(() => {
            device = new Device(makeRedisStub());
        });

        it("keeps only owned udids, deduplicated, in order of first appearance", async function () {
            expect(typeof (device.filterOwned), "Device#filterOwned is a function").to.equal("function");
            const owned = await filterOwned(device, OWNER_A, [UDID_B, UDID_A, UDID_UNKNOWN, UDID_A, "junk", 7, UDID_A2]);
            expect(owned).to.deep.equal([UDID_A, UDID_A2]);
            expect(couch.views, "view calls").to.be.at.most(1);
            expect(couch.gets, "get calls").to.equal(0);
        });

        it("answers [] for another owner's udids", async function () {
            expect(typeof (device.filterOwned), "Device#filterOwned is a function").to.equal("function");
            expect(await filterOwned(device, OWNER_B, [UDID_A])).to.deep.equal([]);
            expect(couch.views, "view calls").to.be.at.most(1);
            expect(couch.gets, "get calls").to.equal(0);
        });

        it("answers [] for a non-array list", async function () {
            expect(typeof (device.filterOwned), "Device#filterOwned is a function").to.equal("function");
            for (const list of [UDID_A, undefined, { x: UDID_A }]) {
                expect(await filterOwned(device, OWNER_A, list)).to.deep.equal([]);
            }
            expect(couch.gets, "get calls").to.equal(0);
        });

        it("answers [] for an invalid owner without a view call", async function () {
            expect(typeof (device.filterOwned), "Device#filterOwned is a function").to.equal("function");
            for (const owner of [null, undefined, 123, {}, "a".repeat(32)]) {
                expect(await filterOwned(device, owner, [UDID_A])).to.deep.equal([]);
            }
            expect(couch.views, "view calls").to.equal(0);
        });

        it("answers [] when the view fails", async function () {
            expect(typeof (device.filterOwned), "Device#filterOwned is a function").to.equal("function");
            couch.viewError = true;
            expect(await filterOwned(device, OWNER_A, [UDID_A])).to.deep.equal([]);
            expect(couch.views, "view calls").to.be.at.most(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("OWN core: udid routes", function () {

        function onlyCall(list, fn) {
            return list.filter((c) => c.fn === fn);
        }

        function expectLib(fn) {
            return () => {
                expect(libCalls.length, "library calls").to.equal(1);
                expect(libCalls[0].fn).to.equal(fn);
                expect(libCalls[0].owner === OWNER_A, "acting owner is A").to.equal(true);
                expect(libCalls[0].udid).to.equal(UDID_A);
            };
        }

        function expectEdit(r) {
            expect(JSON.parse(r.text).success).to.equal(true);
            const w = writesFor(UDID_A).filter((x) => x.op === "atomic");
            expect(w.length, "atomic writes for A").to.equal(1);
            expect(w[0].changes.alias).to.equal("t29-hijack");
        }

        function expectDetach(r) {
            expect(r.text).to.equal('{"success":true,"response":"detached"}');
            expect(writesFor(UDID_A).filter((x) => x.op === "atomic").length, "atomic writes for A").to.equal(1);
        }

        function expectPublish(r) {
            expect(r.text).to.equal('{"success":true,"response":"published"}');
            const p = onlyCall(messengerCalls, "publish");
            expect(p.length).to.equal(1);
            expect(p[0].owner === OWNER_A, "publish owner is A").to.equal(true);
            expect(p[0].udid).to.equal(UDID_A);
        }

        function expectData() {
            const d = onlyCall(messengerCalls, "data");
            expect(d.length).to.equal(1);
            expect(d[0].owner === OWNER_A, "data owner is A").to.equal(true);
            expect(d[0].udid).to.equal(UDID_A);
        }

        const editBody = (u) => ({ changes: { udid: u, alias: "t29-hijack" } });
        const udidBody = (u) => ({ udid: u });
        const attachBody = (u) => ({ udid: u, source_id: "t29-src-b" });
        const meshBody = (u) => ({ udid: u, mesh_id: "t29-mesh" });
        const notifyBody = (u) => ({ udid: u, reply: "t29" });

        const ROUTES = [
            ["POST", "/api/device/detail", udidBody, (r) => expect(r.text).to.contain(ALIAS_A)],
            ["POST", "/api/v2/device", udidBody, (r) => expect(r.text).to.contain(ALIAS_A)],
            ["POST", "/api/device/envs", udidBody, (r) => expect(r.text).to.contain(ENV_SENTINEL)],
            ["POST", "/api/device/edit", editBody, expectEdit],
            ["PUT", "/api/v2/device", editBody, expectEdit],
            ["POST", "/api/device/detach", udidBody, expectDetach],
            ["PUT", "/api/v2/source/detach", udidBody, expectDetach],
            ["POST", "/api/device/attach", attachBody, expectLib("attach")],
            ["PUT", "/api/v2/source/attach", attachBody, expectLib("attach")],
            ["POST", "/api/device/mesh/attach", meshBody, expectLib("attachMesh")],
            ["PUT", "/api/v2/mesh/attach", meshBody, expectLib("attachMesh")],
            ["POST", "/api/device/mesh/detach", meshBody, expectLib("detachMesh")],
            ["PUT", "/api/v2/mesh/detach", meshBody, expectLib("detachMesh")],
            ["POST", "/api/device/notification", notifyBody, expectPublish],
            ["POST", "/api/v2/device/notification", notifyBody, expectPublish],
            ["POST", "/api/device/data", udidBody, expectData],
            ["GET", "/api/device/data/:udid", null, expectData]
        ];

        function requestFor(method, path, bodyFn, udid, cookie) {
            const p = path.replace(":udid", udid);
            const opts = { cookie: cookie };
            if (bodyFn) opts.body = bodyFn(udid);
            return send(method, p, opts);
        }

        for (const [method, path, bodyFn, expectOwn] of ROUTES) {
            it(method + " " + path + ": another owner's udid answers like an unknown udid; the owner still works", async function () {
                const foreign = await requestFor(method, path, bodyFn, UDID_A, cookieB);
                const unknown = await requestFor(method, path, bodyFn, UDID_UNKNOWN, cookieB);
                await settle();
                expect(foreign.status, "foreign status").to.equal(200);
                expect(unknown.status, "unknown status").to.equal(200);
                expect(foreign.text === NOT_FOUND, "foreign answer is no_such_device").to.equal(true);
                expect(unknown.text === NOT_FOUND, "unknown answer is no_such_device").to.equal(true);
                expect(foreign.text === unknown.text, "foreign and unknown answers are identical").to.equal(true);
                for (const r of [foreign, unknown]) {
                    expect(r.text.indexOf(ENV_SENTINEL), "no environment in the answer").to.equal(-1);
                    expect(r.text.indexOf(ALIAS_A), "no device document in the answer").to.equal(-1);
                }
                expectUntouched(UDID_A, "B");

                const own = await requestFor(method, path, bodyFn, UDID_A, cookieA);
                await settle();
                expect(own.status, "owner status").to.equal(200);
                expectOwn(own);
            });
        }

        it("a Bearer token for B gets no_such_device for A's device", async function () {
            const r = await send("POST", "/api/device/detail", { bearer: bearerB, body: { udid: UDID_A } });
            expect(r.status).to.equal(200);
            expect(r.text === NOT_FOUND, "answer is no_such_device").to.equal(true);
        });

        it("an edit cannot write owner or previous_owner", async function () {
            const r = await send("POST", "/api/device/edit", {
                cookie: cookieA,
                body: { changes: { udid: UDID_A, alias: "t29-keep", owner: OWNER_B, previous_owner: OWNER_B } }
            });
            await settle();
            expect(r.status).to.equal(200);
            expect(JSON.parse(r.text).success).to.equal(true);
            const w = writesFor(UDID_A).filter((x) => x.op === "atomic");
            expect(w.length, "atomic writes for A").to.equal(1);
            expect(w[0].changes.alias).to.equal("t29-keep");
            expect(Object.prototype.hasOwnProperty.call(w[0].changes, "owner"), "owner written").to.equal(false);
            expect(Object.prototype.hasOwnProperty.call(w[0].changes, "previous_owner"), "previous_owner written").to.equal(false);
            expect(couch.devices[UDID_A].owner === OWNER_A, "stored owner unchanged").to.equal(true);
        });

        it("keeps the presence answers", async function () {
            const edit = await send("POST", "/api/device/edit", { cookie: cookieA, body: { changes: { alias: "t29" } } });
            expect(edit.text).to.equal('{"success":false,"response":"changes.udid_undefined"}');
            const detail = await send("POST", "/api/device/detail", { cookie: cookieA, body: { udid: "not-a-udid" } });
            expect(detail.status).to.equal(403);
            const notify = await send("POST", "/api/device/notification", { cookie: cookieA, body: {} });
            expect(notify.text).to.equal('{"success":false,"response":"missing_udid"}');
            const mesh = await send("POST", "/api/device/mesh/attach", { cookie: cookieA, body: { udid: UDID_A } });
            expect(mesh.text).to.equal('{"success":false,"response":"missing_mesh_id"}');
            await settle();
            expect(libCalls.length, "library calls").to.equal(0);
        });
    });

    // -----------------------------------------------------------------------
    describe("OWN core: batch routes", function () {

        function pushCalls() {
            return messengerCalls.filter((c) => c.fn === "push");
        }

        for (const path of ["/api/device/push", "/api/v2/device/configuration"]) {
            it("POST " + path + " publishes only to the caller's own udids", async function () {
                const r = await send("POST", path, { cookie: cookieA, body: { udids: [UDID_A, UDID_B, UDID_UNKNOWN], enviros: ["t29"] } });
                expect(r.status).to.equal(200);
                expect(r.text).to.equal('{"success":true,"response":"pushing_configuration"}');
                const p = pushCalls();
                expect(p.length, "messenger.push calls").to.equal(1);
                expect(p[0].owner === OWNER_A, "push owner is A").to.equal(true);
                expect(p[0].udids).to.deep.equal([UDID_A]);
            });
        }

        it("POST /api/device/push with nothing owned answers no_such_device and pushes nothing", async function () {
            for (const body of [{ udids: [UDID_A] }, { udid: UDID_A }, { udids: { x: UDID_A } }]) {
                const r = await send("POST", "/api/device/push", { cookie: cookieB, body: body });
                expect(r.status).to.equal(200);
                expect(r.text === NOT_FOUND, "answer is no_such_device").to.equal(true);
            }
            expect(pushCalls().length, "messenger.push calls").to.equal(0);
        });

        it("POST /api/device/push without udids keeps missing_udids", async function () {
            const r = await send("POST", "/api/device/push", { cookie: cookieA, body: {} });
            expect(r.text).to.equal('{"success":false,"response":"missing_udids"}');
        });

        for (const [method, path] of [["POST", "/api/device/revoke"], ["DELETE", "/api/v2/device"]]) {
            it(method + " " + path + " never destroys another owner's device", async function () {
                const foreign = await send(method, path, { cookie: cookieB, body: { udids: [UDID_A] } });
                const unknown = await send(method, path, { cookie: cookieB, body: { udids: [UDID_UNKNOWN] } });
                await settle();
                expect(foreign.status).to.equal(200);
                expect(foreign.text === unknown.text, "foreign and unknown answers are identical").to.equal(true);
                expect(couch.writes.filter((w) => w.op === "destroy").length, "destroys").to.equal(0);

                const mixed = await send(method, path, { cookie: cookieB, body: { udids: [UDID_A, UDID_B] } });
                await settle();
                expect(mixed.status).to.equal(200);
                const destroyed = couch.writes.filter((w) => w.op === "destroy").map((w) => w.id);
                expect(destroyed).to.deep.equal([UDID_B]);
                expect(has(couch.devices, UDID_A), "A's device still present").to.equal(true);
            });
        }
    });

    // -----------------------------------------------------------------------
    describe("OWN core: API-key callers", function () {

        it("B's verified API key gets no_such_device for A's device, like an unknown udid", async function () {
            const foreign = await send("POST", "/api/device/detail", { body: { owner: OWNER_B, api_key: KEY_B, udid: UDID_A } });
            const unknown = await send("POST", "/api/device/detail", { body: { owner: OWNER_B, api_key: KEY_B, udid: UDID_UNKNOWN } });
            expect(foreign.status).to.equal(200);
            expect(foreign.text === NOT_FOUND, "foreign answer is no_such_device").to.equal(true);
            expect(foreign.text === unknown.text, "foreign and unknown answers are identical").to.equal(true);
        });

        it("A's verified API key reads A's device", async function () {
            const r = await send("POST", "/api/device/detail", { body: { owner: OWNER_A, api_key: KEY_A, udid: UDID_A } });
            expect(r.status).to.equal(200);
            expect(r.text).to.contain(ALIAS_A);
        });

        it("B's verified API key cannot push to A's device", async function () {
            const r = await send("POST", "/api/device/push", { body: { owner: OWNER_B, api_key: KEY_B, udids: [UDID_A], enviros: [] } });
            expect(r.status).to.equal(200);
            expect(r.text === NOT_FOUND, "answer is no_such_device").to.equal(true);
            expect(messengerCalls.filter((c) => c.fn === "push").length, "messenger.push calls").to.equal(0);
        });
    });

    // -----------------------------------------------------------------------
    describe("OWN transfer: request and accept", function () {

        beforeEach(() => {
            for (const k of dtKeys()) redis.store.delete(k);
            // An accepted transfer moves the device's API key (quick 261003-u86).
            redis.store.set("ak:" + OWNER_A, JSON.stringify([{ key: KEY_A, hash: HASH_A, alias: "t29-a" }]));
            redis.store.set("ak:" + OWNER_B, JSON.stringify([{ key: KEY_B, hash: HASH_B, alias: "t29-b" }]));
            redis.store.delete("ak:" + OWNER_R);
        });

        it("a request naming any udid the sender does not own is refused before anything is stored or mailed", async function () {
            const answers = [];
            for (const udids of [[UDID_A], [UDID_UNKNOWN], [UDID_B, UDID_A]]) {
                const r = await send("POST", "/api/transfer/request", { cookie: cookieB, body: { to: EMAIL_R, udids: udids } });
                expect(r.status).to.equal(200);
                answers.push(r.text);
            }
            const v2 = await send("POST", "/api/v2/transfer/request", { cookie: cookieB, body: { to: EMAIL_R, udids: [UDID_A] } });
            answers.push(v2.text);
            await settle();
            for (const text of answers) expect(text === NOT_FOUND, "answer is no_such_device").to.equal(true);
            expect(dtKeys().length, "stored transfers").to.equal(0);
            expect(mailCalls, "mails sent").to.equal(0);
        });

        it("the owner's own request is stored with the owned udids", async function () {
            const r = await send("POST", "/api/transfer/request", { cookie: cookieA, body: { to: EMAIL_R, udids: [UDID_A] } });
            await settle();
            expect(r.status).to.equal(200);
            const j = JSON.parse(r.text);
            expect(j.success).to.equal(true);
            expect(j.response).to.be.a("string");
            expect(j.response.length).to.equal(36);
            const stored = JSON.parse(redis.store.get("dt:" + j.response));
            expect(stored.udids).to.deep.equal([UDID_A]);
        });

        it("a request whose udids is not an array answers missing_subject", async function () {
            const r = await send("POST", "/api/transfer/request", { cookie: cookieA, body: { to: EMAIL_R, udids: "not-an-array" } });
            await settle();
            expect(r.text).to.equal('{"success":false,"response":"missing_subject"}');
            expect(dtKeys().length, "stored transfers").to.equal(0);
        });

        function accept(transfer, body) {
            return new Promise((resolve) => transfer.accept(body, (success, response) => resolve({ success: success, response: response })));
        }

        it("accept refuses udids outside the stored transfer and keeps the transfer", async function () {
            const transfer = new Transfer(fakeMessenger, redis);
            redis.store.set("dt:t29-1", JSON.stringify({ to: EMAIL_R, from: EMAIL_A, udids: [UDID_A] }));
            const r = await accept(transfer, { transfer_id: "t29-1", udids: [UDID_B] });
            await settle();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("no_such_device");
            expect(writesFor(UDID_B).length, "writes for B's device").to.equal(0);
            expect(redis.store.has("dt:t29-1"), "transfer still pending").to.equal(true);
        });

        it("accept migrates only the stored udids", async function () {
            const transfer = new Transfer(fakeMessenger, redis);
            redis.store.set("dt:t29-1", JSON.stringify({ to: EMAIL_R, from: EMAIL_A, udids: [UDID_A] }));
            const r = await accept(transfer, { transfer_id: "t29-1", udids: [UDID_A, UDID_B] });
            await settle();
            expect(r.success).to.equal(true);
            const atomic = couch.writes.filter((w) => w.op === "atomic");
            expect(atomic.length, "atomic writes").to.equal(1);
            expect(atomic[0].id).to.equal(UDID_A);
            expect(atomic[0].changes.owner === OWNER_R, "new owner is the recipient").to.equal(true);
            expect(atomic[0].changes.previous_owner === OWNER_A, "previous owner is the sender").to.equal(true);
            expect(writesFor(UDID_B).length, "writes for B's device").to.equal(0);
        });

        it("accept of a stale record never moves a device its originator does not own", async function () {
            const transfer = new Transfer(fakeMessenger, redis);
            redis.store.set("dt:t29-2", JSON.stringify({ to: EMAIL_R, from: EMAIL_A, udids: [UDID_B] }));
            const r = await accept(transfer, { transfer_id: "t29-2", udids: [] });
            await settle();
            expect(typeof (r.success), "accept answered").to.equal("boolean");
            expect(writesFor(UDID_B).length, "writes for B's device").to.equal(0);
            expect(couch.devices[UDID_B].owner === OWNER_B, "B's device owner unchanged").to.equal(true);
        });
    });
});
