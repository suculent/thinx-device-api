/*
 * TransferRecipientSpec — quick 261004-l7q: transfer accept and decline are bound to the
 * transfer's recipient, plus the related transfer/revoke functional bugs.
 *
 * Runs without Redis and without CouchDB. The real lib/router.js and lib/router.transfer.js
 * are mounted on a bare express app (express-session, a Map-backed Redis stub with the
 * EVAL compare-and-swap the API-key move uses). lib/thinx/couch.js and lib/thinx/audit.js
 * are swapped in require.cache for an in-memory fake CouchDB and a recording audit log, and
 * fresh copies of apikey.js, device.js, devices.js, transfer.js and router.transfer.js are
 * loaded against them. The swap lives in the outer describe's beforeAll/afterAll, so it
 * never leaks into the other spec files CI runs in the same process.
 *
 * Pinned behaviour:
 * - POST accept/decline (v1 and v2) proceed only for the session owner that equals
 *   sha256(prefix + record.to); the sender and any third party get exactly the
 *   unknown-transfer answer, nothing changes, and no console or audit line carries the
 *   transfer id. A body `owner` never counts;
 * - the recipient's POST accept still moves the device and its API key with the transfer
 *   binding (quick 261003-u86); the GET e-mail links keep working without a session;
 * - the sender's request answer does not carry the transfer id;
 * - Devices#revoke removes every named device and matches udids exactly;
 * - an accept with mig_sources answers (no ReferenceError) and never writes the sender's
 *   user document;
 * - partial accept/decline remove the handled udids from the stored transfer, so a partial
 *   transfer completes.
 *
 * Nothing here prints a key, a transfer id, a cookie or a device document; assertions
 * compare status codes, exact response strings, booleans and udids only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const http = require("http");
const expect = require("chai").expect;
const sha256 = require("sha256");

const Globals = require("../../lib/thinx/globals");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const APIKEY_PATH = require.resolve("../../lib/thinx/apikey");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const DEVICES_PATH = require.resolve("../../lib/thinx/devices");
const TRANSFER_PATH = require.resolve("../../lib/thinx/transfer");
const ROUTER_TRANSFER_PATH = require.resolve("../../lib/router.transfer");

const SWAPPED = [COUCH_PATH, AUDIT_PATH, APIKEY_PATH, DEVICE_PATH, DEVICES_PATH, TRANSFER_PATH, ROUTER_TRANSFER_PATH];
const RELOADED = [APIKEY_PATH, DEVICE_PATH, DEVICES_PATH, TRANSFER_PATH, ROUTER_TRANSFER_PATH];

const PREFIX = Globals.prefix();

const EMAIL_A = "l7q-sender@example.com";
const EMAIL_B = "l7q-other@example.com";
const EMAIL_R = "l7q-recipient@example.com";
const OWNER_A = sha256(PREFIX + EMAIL_A);
const OWNER_B = sha256(PREFIX + EMAIL_B);
const OWNER_R = sha256(PREFIX + EMAIL_R);

const KEY_1 = sha256("l7q-key-1");
const KEY_2 = sha256("l7q-key-2");
const KEY_R = sha256("l7q-key-r");
const HASH_1 = sha256(KEY_1);
const HASH_2 = sha256(KEY_2);

const UDID_1 = "a7a00000-0000-4000-8000-000000000001";
const UDID_2 = "a7a00000-0000-4000-8000-000000000002";
const UDID_3 = "a7a00000-0000-4000-8000-000000000003";
const UDID_B = "b7b00000-0000-4000-8000-00000000000b";

const SRC_1 = sha256("l7q-source-1");

const UNKNOWN_ACCEPT = '{"success":false,"response":"transfer_id_not_found"}';
const UNKNOWN_DECLINE = '{"success":true,"response":"decline_complete_no_such_dtid"}';

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = {
    devices: {},
    users: {},
    writes: []
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
    return Object.assign({ _id: udid, _rev: "1-" + udid.slice(-2), udid: udid, owner: owner, alias: "l7q-" + udid.slice(-2), mesh_ids: [] }, extra || {});
}

function seedCouch(options) {
    const o = options || {};
    couch.devices = {};
    for (const d of [
        deviceDoc(UDID_1, OWNER_A, { lastkey: HASH_1, source: SRC_1 }),
        deviceDoc(UDID_2, OWNER_A, { lastkey: sha256(HASH_2) }),
        deviceDoc(UDID_3, OWNER_A),
        deviceDoc(UDID_B, OWNER_B)
    ]) couch.devices[d._id] = d;
    couch.users = {};
    couch.users[OWNER_A] = { _id: OWNER_A, email: EMAIL_A };
    couch.users[OWNER_B] = { _id: OWNER_B, email: EMAIL_B };
    couch.users[OWNER_R] = { _id: OWNER_R, email: EMAIL_R };
    if (o.legacySources === true) {
        couch.users[OWNER_A].sources = {};
        couch.users[OWNER_A].sources[SRC_1] = { alias: "l7q-src", branch: "main" };
        couch.users[OWNER_A].sources[sha256("l7q-source-a-only")] = { alias: "l7q-a-only", branch: "main" };
        couch.users[OWNER_R].sources = {};
        couch.users[OWNER_R].sources[sha256("l7q-source-r-only")] = { alias: "l7q-r-only", branch: "main" };
    }
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
        if (name === "devices_by_owner") docs = docs.filter((d) => d.owner === key);
        else if (name === "devices_by_udid") docs = docs.filter((d) => d.udid === key);
        else docs = [];
        return answer(cb, null, { rows: docs.map((d) => ({ id: d._id, key: key, value: copy(d), doc: copy(d) })) });
    },
    atomic(design, update, id, changes, cb) {
        couch.writes.push({ op: "atomic", id: id, changes: copy(changes) });
        if (!has(couch.devices, id)) return answer(cb, notFound());
        Object.assign(couch.devices[id], copy(changes));
        return answer(cb, null, { ok: true });
    },
    find(query, cb) {
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
        couch.writes.push({ op: "user-atomic", id: id, changes: copy(changes) });
        if (has(couch.users, id)) Object.assign(couch.users[id], copy(changes));
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

const auditLines = [];

class AuditStub {
    log(owner, message) {
        auditLines.push(String(message));
    }
}

// ---------------------------------------------------------------------------
// Redis stub (EVAL compare-and-swap for the API-key move)
// ---------------------------------------------------------------------------

// Values are stored synchronously; callbacks are deferred with setImmediate.
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
        // EVAL <script> <n> <n keys> <n expected> <n next>: absent reads as ""; all equal ->
        // write next ("" = DEL) and answer 1, else 0.
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

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const fakeMessenger = {
    publish() { },
    data(owner, udid, cb) { cb(true, {}); },
    push(owner, body, cb) { cb(true, "pushing_configuration"); }
};

let saved = {};
let savedCsrf = {};
let Transfer = null;   // fresh lib/thinx/transfer.js class (fake couch)
let Devices = null;    // fresh lib/thinx/devices.js class (fake couch)
let server = null;
let redis = null;
let cookies = {};
let attachCalls = [];

function entry(key, alias) {
    return { key: key, hash: sha256(key), alias: alias };
}

function seedRedis() {
    for (const k of Array.from(redis.store.keys())) {
        if ((k.indexOf("ak:") === 0) || (k.indexOf("dt:") === 0) || (k.indexOf("dtr:") === 0)) redis.store.delete(k);
    }
    redis.store.set("ak:" + OWNER_A, JSON.stringify([entry(KEY_1, "l7q-one"), entry(KEY_2, "l7q-two")]));
    redis.store.set("ak:" + OWNER_R, JSON.stringify([entry(KEY_R, "l7q-r")]));
}

function buildApp() {
    const app = express();
    app.use(session({
        secret: "l7q-spec-secret",
        name: "x-thx-core",
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: "lax" }
    }));
    app.use(express.json());

    redis = makeRedisStub();
    // Pre-seeded JWT secret, so JWTLogin.init and sign never race to create two keys.
    redis.store.set("__JWT_SECRET__", crypto.randomBytes(48).toString("hex"));
    app.redis_client = redis;
    app.messenger = fakeMessenger;

    // Spec-only logins: bind one owner to a fresh session.
    const owners = { a: OWNER_A, b: OWNER_B, r: OWNER_R };
    app.get("/spec/login/:who", (req, res) => {
        req.session.owner = owners[req.params.who];
        req.session.save(() => res.json({ success: true }));
    });

    // Production order: the global router first, then the transfer routes.
    require("../../lib/router.js")(app);
    require(ROUTER_TRANSFER_PATH)(app);

    return app;
}

// Issue one request. opts: { cookie, body }.
function send(method, path, opts) {
    const o = opts || {};
    return new Promise((resolve, reject) => {
        const headers = {};
        if (typeof (o.cookie) === "string") headers.Cookie = o.cookie;
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
    for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
}

async function loginCookie(who) {
    const login = await send("GET", "/spec/login/" + who);
    const raw = login.setCookie.find((c) => c.indexOf("x-thx-core=") === 0);
    return raw ? raw.split(";")[0] : null;
}

function dtKeys() {
    return Array.from(redis.store.keys()).filter((k) => k.indexOf("dt:") === 0);
}

function storedUdids(id) {
    const raw = redis.store.get("dt:" + id);
    if (typeof (raw) !== "string") return null;
    return JSON.parse(raw).udids;
}

function ownerOf(udid) {
    return (couch.devices[udid] || {}).owner;
}

function keysOf(owner) {
    const raw = redis.store.get("ak:" + owner);
    if (typeof (raw) !== "string") return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
}

function snapshot(id) {
    const out = {};
    for (const [k, v] of redis.store.entries()) {
        if ((k.indexOf("ak:") === 0) || (k.indexOf("dt:") === 0) || (k.indexOf("dtr:") === 0)) out[k] = v;
    }
    return {
        redis: JSON.stringify(out),
        record: redis.store.get("dt:" + id),
        writes: couch.writes.length,
        owners: JSON.stringify([ownerOf(UDID_1), ownerOf(UDID_2), ownerOf(UDID_3)])
    };
}

function expectNothingChanged(before, id, label) {
    const now = snapshot(id);
    expect(now.record === before.record, label + ": stored transfer byte-identical").to.equal(true);
    expect(now.redis === before.redis, label + ": key stores and transfer records byte-identical").to.equal(true);
    expect(now.writes, label + ": CouchDB writes").to.equal(before.writes);
    expect(now.owners === before.owners, label + ": device owners unchanged").to.equal(true);
}

// Runs fn with console output captured (and suppressed); answers { result, lines }.
async function captured(fn) {
    const lines = [];
    const names = ["log", "info", "warn", "error", "debug"];
    const original = {};
    for (const n of names) {
        original[n] = console[n];
        console[n] = (...args) => {
            lines.push(args.map((a) => {
                if (typeof (a) === "string") return a;
                try { return JSON.stringify(a); } catch (_e) { return String(a); }
            }).join(" "));
        };
    }
    try {
        const result = await fn();
        return { result: result, lines: lines };
    } finally {
        for (const n of names) console[n] = original[n];
    }
}

function expectIdNotLogged(id, lines, auditFrom, label) {
    const consoleHits = lines.filter((l) => l.indexOf(id) !== -1).length;
    const auditHits = auditLines.slice(auditFrom).filter((l) => l.indexOf(id) !== -1).length;
    expect(consoleHits, label + ": console lines carrying the transfer id").to.equal(0);
    expect(auditHits, label + ": audit lines carrying the transfer id").to.equal(0);
}

// The sender (A) offers udids to the recipient (R) through the real route; answers the
// request answer and the stored transfer id (read from the store, never from the answer).
async function offer(udids) {
    const before = dtKeys();
    const res = await send("POST", "/api/transfer/request", { cookie: cookies.a, body: { to: EMAIL_R, udids: udids } });
    await settle();
    const added = dtKeys().filter((k) => before.indexOf(k) === -1);
    expect(added.length, "one transfer stored").to.equal(1);
    return { res: res, id: added[0].substring(3) };
}

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), ms))]);
}

function libAccept(transfer, body) {
    return withTimeout(new Promise((resolve) => {
        let done = false;
        transfer.accept(body, (success, response) => {
            if (done) return;
            done = true;
            resolve({ success: success, response: response });
        });
    }), 2000);
}

function libDecline(transfer, body) {
    return withTimeout(new Promise((resolve) => {
        let answers = 0;
        transfer.decline(body, (success, response) => {
            answers++;
            if (answers === 1) setTimeout(() => resolve({ success: success, response: response, answers: () => answers }), 20);
        });
    }), 2000);
}

function revoke(devices, owner, body) {
    return withTimeout(new Promise((resolve) => {
        devices.revoke(owner, body, (_res, success, response) => resolve({ success: success, response: response }), null);
    }), 2000);
}

describe("TransferRecipientSpec (quick 261004-l7q)", function () {

    beforeAll(async () => {
        // Bind the real modules (and their whole dependency tree) before the swap, so
        // nothing that stays in require.cache ever captures the fake couch.
        require("../../lib/router.js");
        require("../../lib/thinx/util.js");
        require(APIKEY_PATH);
        require(DEVICE_PATH);
        require(DEVICES_PATH);
        require(TRANSFER_PATH);
        require(ROUTER_TRANSFER_PATH);

        savedCsrf = { enforce: process.env.CSRF_ENFORCE, mode: process.env.CSRF_MODE };
        delete process.env.CSRF_ENFORCE;
        delete process.env.CSRF_MODE;

        saved = {};
        for (const p of SWAPPED) saved[p] = require.cache[p];

        require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
        require.cache[AUDIT_PATH] = { id: AUDIT_PATH, filename: AUDIT_PATH, loaded: true, exports: AuditStub };
        for (const p of RELOADED) delete require.cache[p];

        require(APIKEY_PATH);
        require(DEVICE_PATH);
        Devices = require(DEVICES_PATH);
        Transfer = require(TRANSFER_PATH);

        // Never send mail; attach touches the filesystem: record instead.
        Transfer.prototype.sendMail = function (contents, type, callback) {
            callback(true, type + "_sent");
        };
        Devices.prototype.attach = function (owner, body, callback, res) {
            attachCalls.push({ owner: owner, udid: body ? body.udid : undefined, source_id: body ? body.source_id : undefined });
            callback(res, true, "attach_ok");
        };

        seedCouch();
        const app = buildApp();
        server = await new Promise((resolve) => {
            const s = http.createServer(app).listen(0, "127.0.0.1", () => resolve(s));
        });
        cookies = { a: await loginCookie("a"), b: await loginCookie("b"), r: await loginCookie("r") };
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
        seedCouch();
        seedRedis();
        attachCalls = [];
    });

    it("has sessions for the sender, a third party and the recipient", function () {
        for (const who of ["a", "b", "r"]) {
            expect(typeof (cookies[who]) === "string", "session cookie " + who).to.equal(true);
        }
    });

    // -----------------------------------------------------------------------
    describe("L7Q request answer", function () {

        it("the sender's request answer does not carry the transfer id", async function () {
            const { res, id } = await offer([UDID_1]);
            expect(res.status).to.equal(200);
            const j = JSON.parse(res.text);
            expect(j.success).to.equal(true);
            expect(res.text.indexOf(id) === -1, "answer carries the transfer id").to.equal(true);
            expect(j.response).to.equal("transfer_requested");
            expect(storedUdids(id)).to.deep.equal([UDID_1]);
        });
    });

    // -----------------------------------------------------------------------
    describe("L7Q binding: POST accept", function () {

        for (const route of ["/api/transfer/accept", "/api/v2/transfer/accept"]) {

            for (const who of ["a", "b"]) {
                const label = (who === "a" ? "the sender" : "a third party") + " on " + route;

                it(label + " gets exactly the unknown-transfer answer and nothing changes", async function () {
                    const { id } = await offer([UDID_1]);
                    const unknown = await send("POST", route, { cookie: cookies[who], body: { transfer_id: crypto.randomUUID(), owner: OWNER_R, udids: [UDID_1] } });
                    await settle();
                    expect(unknown.text).to.equal(UNKNOWN_ACCEPT);

                    const before = snapshot(id);
                    const auditFrom = auditLines.length;
                    const { result, lines } = await captured(async () => {
                        const r = await send("POST", route, { cookie: cookies[who], body: { transfer_id: id, owner: OWNER_R, udids: [UDID_1] } });
                        await settle();
                        return r;
                    });
                    expect(result.status, label + " status").to.equal(unknown.status);
                    expect(result.text === unknown.text, label + " body equals the unknown-transfer body").to.equal(true);
                    expectNothingChanged(before, id, label);
                    expectIdNotLogged(id, lines, auditFrom, label);
                    expect(ownerOf(UDID_1) === OWNER_A, "device stays with the sender").to.equal(true);
                    expect(keysOf(OWNER_R).filter((e) => e.hash === HASH_1).length, "key not in the recipient's store").to.equal(0);
                });
            }

            it("the recipient on " + route + " accepts: device and key move with the transfer binding", async function () {
                const { id } = await offer([UDID_1]);
                const auditFrom = auditLines.length;
                const { result, lines } = await captured(async () => {
                    const r = await send("POST", route, { cookie: cookies.r, body: { transfer_id: id, owner: OWNER_R, udids: [UDID_1] } });
                    await settle();
                    return r;
                });
                expect(result.status).to.equal(200);
                expect(result.text).to.equal('{"success":true,"response":"transfer_completed"}');
                expect(ownerOf(UDID_1) === OWNER_R, "device owner is the recipient").to.equal(true);
                expect(couch.devices[UDID_1].previous_owner === OWNER_A, "previous owner is the sender").to.equal(true);
                const moved = keysOf(OWNER_R).filter((e) => e.hash === HASH_1);
                expect(moved.length, "key entry in the recipient's store").to.equal(1);
                expect(moved[0].transfer.udid).to.equal(UDID_1);
                expect(moved[0].transfer.from.indexOf(OWNER_A) !== -1, "binding lists the sender").to.equal(true);
                expect(keysOf(OWNER_A).filter((e) => e.hash === HASH_1).length, "key left the sender's store").to.equal(0);
                expect(redis.store.has("dt:" + id), "transfer record removed").to.equal(false);
                expectIdNotLogged(id, lines, auditFrom, "recipient accept");
            });
        }

        it("a body owner naming the recipient does not let the sender accept", async function () {
            const { id } = await offer([UDID_1]);
            const before = snapshot(id);
            const r = await send("POST", "/api/transfer/accept", { cookie: cookies.a, body: { transfer_id: id, owner: OWNER_R, udid: UDID_1, udids: [UDID_1] } });
            await settle();
            expect(r.text).to.equal(UNKNOWN_ACCEPT);
            expectNothingChanged(before, id, "forged body owner");
        });

        it("a stale udid list from the sender answers like an unknown transfer, not no_such_device", async function () {
            const { id } = await offer([UDID_1]);
            const r = await send("POST", "/api/transfer/accept", { cookie: cookies.a, body: { transfer_id: id, owner: OWNER_A, udids: [UDID_B] } });
            await settle();
            expect(r.text).to.equal(UNKNOWN_ACCEPT);
            expect(storedUdids(id)).to.deep.equal([UDID_1]);
        });
    });

    // -----------------------------------------------------------------------
    describe("L7Q binding: POST decline", function () {

        for (const route of ["/api/transfer/decline", "/api/v2/transfer/decline"]) {

            for (const who of ["a", "b"]) {
                const label = (who === "a" ? "the sender" : "a third party") + " on " + route;

                it(label + " gets exactly the unknown-transfer answer and nothing changes", async function () {
                    const { id } = await offer([UDID_1]);
                    const unknown = await send("POST", route, { cookie: cookies[who], body: { transfer_id: crypto.randomUUID(), owner: OWNER_R, udids: [UDID_1] } });
                    await settle();
                    expect(unknown.text).to.equal(UNKNOWN_DECLINE);

                    const before = snapshot(id);
                    const auditFrom = auditLines.length;
                    const { result, lines } = await captured(async () => {
                        const r = await send("POST", route, { cookie: cookies[who], body: { transfer_id: id, owner: OWNER_R, udids: [UDID_1] } });
                        await settle();
                        return r;
                    });
                    expect(result.status, label + " status").to.equal(unknown.status);
                    expect(result.text === unknown.text, label + " body equals the unknown-transfer body").to.equal(true);
                    expectNothingChanged(before, id, label);
                    expectIdNotLogged(id, lines, auditFrom, label);
                });
            }

            it("the recipient on " + route + " declines the whole transfer", async function () {
                const { id } = await offer([UDID_1]);
                const auditFrom = auditLines.length;
                const { result, lines } = await captured(async () => {
                    const r = await send("POST", route, { cookie: cookies.r, body: { transfer_id: id, owner: OWNER_R, udids: [UDID_1] } });
                    await settle();
                    return r;
                });
                expect(result.status).to.equal(200);
                expect(result.text).to.equal('{"success":true,"response":"transfer_completed"}');
                expect(redis.store.has("dt:" + id), "transfer record removed").to.equal(false);
                expect(ownerOf(UDID_1) === OWNER_A, "device stays with the sender").to.equal(true);
                expectIdNotLogged(id, lines, auditFrom, "recipient decline");
            });
        }
    });

    // -----------------------------------------------------------------------
    describe("L7Q e-mail links", function () {

        it("the GET accept link works without a session", async function () {
            const { id } = await offer([UDID_1]);
            const r = await send("GET", "/api/transfer/accept?transfer_id=" + id);
            await settle();
            expect(r.status).to.equal(200);
            expect(r.text).to.equal('{"success":true,"response":"transfer_completed"}');
            expect(ownerOf(UDID_1) === OWNER_R, "device owner is the recipient").to.equal(true);
            expect(keysOf(OWNER_R).filter((e) => e.hash === HASH_1).length, "key moved").to.equal(1);
        });

        it("the GET decline link works without a session and answers once", async function () {
            const { id } = await offer([UDID_1]);
            const r = await send("GET", "/api/v2/transfer/decline?transfer_id=" + id);
            await settle();
            expect(r.status).to.equal(200);
            expect(r.text).to.equal('{"success":true,"response":"transfer_completed"}');
            expect(redis.store.has("dt:" + id), "transfer record removed").to.equal(false);
            expect(ownerOf(UDID_1) === OWNER_A, "device stays with the sender").to.equal(true);
        });
    });

    // -----------------------------------------------------------------------
    describe("L7Q partial accept and decline", function () {

        it("a partial accept leaves the remaining udids and a second partial accept completes", async function () {
            const { id } = await offer([UDID_1, UDID_2]);
            expect(storedUdids(id)).to.deep.equal([UDID_1, UDID_2]);

            const first = await send("POST", "/api/transfer/accept", { cookie: cookies.r, body: { transfer_id: id, owner: OWNER_R, udids: [UDID_1] } });
            await settle();
            expect(first.text).to.equal('{"success":true,"response":"transfer_partially_completed"}');
            expect(storedUdids(id), "remaining udids").to.deep.equal([UDID_2]);
            expect(ownerOf(UDID_1) === OWNER_R, "first device moved").to.equal(true);
            expect(ownerOf(UDID_2) === OWNER_A, "second device not yet moved").to.equal(true);

            const second = await send("POST", "/api/v2/transfer/accept", { cookie: cookies.r, body: { transfer_id: id, owner: OWNER_R, udids: [UDID_2] } });
            await settle();
            expect(second.text).to.equal('{"success":true,"response":"transfer_completed"}');
            expect(redis.store.has("dt:" + id), "transfer record removed").to.equal(false);
            expect(ownerOf(UDID_2) === OWNER_R, "second device moved").to.equal(true);
        });

        it("a partial decline (body.udid) leaves the remaining udids and the accept link completes", async function () {
            const { id } = await offer([UDID_1, UDID_2]);
            const declined = await send("POST", "/api/transfer/decline", { cookie: cookies.r, body: { transfer_id: id, owner: OWNER_R, udid: UDID_1, udids: [UDID_1] } });
            await settle();
            expect(declined.text).to.equal('{"success":true,"response":"transfer_partially_completed"}');
            expect(storedUdids(id), "remaining udids").to.deep.equal([UDID_2]);

            const accepted = await send("GET", "/api/transfer/accept?transfer_id=" + id);
            await settle();
            expect(accepted.text).to.equal('{"success":true,"response":"transfer_completed"}');
            expect(redis.store.has("dt:" + id), "transfer record removed").to.equal(false);
            expect(ownerOf(UDID_1) === OWNER_A, "declined device stays with the sender").to.equal(true);
            expect(ownerOf(UDID_2) === OWNER_R, "remaining device moved").to.equal(true);
        });

        it("an accept refused for one device keeps the moved one off the list, so the rest can complete", async function () {
            const { id } = await offer([UDID_1, UDID_2]);
            const UDID_S = "a7a00000-0000-4000-8000-000000000052";
            couch.devices[UDID_S] = deviceDoc(UDID_S, OWNER_A, { lastkey: HASH_2 }); // UDID_2's key became shared
            const refused = await send("POST", "/api/transfer/accept", { cookie: cookies.r, body: { transfer_id: id, owner: OWNER_R, udids: [UDID_1, UDID_2] } });
            await settle();
            expect(refused.text).to.equal('{"success":false,"response":"apikey_shared"}');
            expect(ownerOf(UDID_1) === OWNER_R, "first device moved").to.equal(true);
            expect(ownerOf(UDID_2) === OWNER_A, "refused device stays").to.equal(true);
            expect(storedUdids(id), "remaining udids").to.deep.equal([UDID_2]);

            delete couch.devices[UDID_S]; // the other device is gone: the key is no longer shared
            const done = await send("GET", "/api/transfer/accept?transfer_id=" + id);
            await settle();
            expect(done.text).to.equal('{"success":true,"response":"transfer_completed"}');
            expect(ownerOf(UDID_2) === OWNER_R, "second device moved").to.equal(true);
            expect(redis.store.has("dt:" + id), "transfer record removed").to.equal(false);
        });

        it("library decline with a udid list removes exactly those udids and answers once", async function () {
            const { id } = await offer([UDID_1, UDID_2]);
            const transfer = new Transfer(fakeMessenger, redis);
            const r = await libDecline(transfer, { transfer_id: id, udids: [UDID_2] });
            await settle();
            expect(r.timedOut, "decline answered").to.not.equal(true);
            expect(r.answers(), "decline answers").to.equal(1);
            expect(r.response).to.equal("transfer_partially_completed");
            expect(storedUdids(id), "remaining udids").to.deep.equal([UDID_1]);

            const done = await libAccept(transfer, { transfer_id: id, udids: [UDID_1] });
            await settle();
            expect(done.response).to.equal("transfer_completed");
            expect(redis.store.has("dt:" + id), "transfer record removed").to.equal(false);
        });
    });

    // -----------------------------------------------------------------------
    describe("L7Q mig_sources", function () {

        it("an accept with mig_sources answers and moves the device (no ReferenceError)", async function () {
            const { id } = await offer([UDID_1]);
            const transfer = new Transfer(fakeMessenger, redis);
            const r = await libAccept(transfer, { transfer_id: id, udids: [UDID_1], mig_sources: true });
            await settle();
            expect(r.timedOut, "accept answered").to.not.equal(true);
            expect(r.success).to.equal(true);
            expect(r.response).to.equal("transfer_completed");
            expect(ownerOf(UDID_1) === OWNER_R, "device owner is the recipient").to.equal(true);
            expect(couch.writes.filter((w) => w.op === "user-atomic").length, "no user document written without a source map").to.equal(0);
        });

        it("mig_sources copies the device's source to the recipient and never writes the sender's document", async function () {
            seedCouch({ legacySources: true });
            const { id } = await offer([UDID_1]);
            const transfer = new Transfer(fakeMessenger, redis);
            const r = await libAccept(transfer, { transfer_id: id, udids: [UDID_1], mig_sources: true });
            await settle();
            expect(r.timedOut, "accept answered").to.not.equal(true);
            expect(r.response).to.equal("transfer_completed");
            const userWrites = couch.writes.filter((w) => w.op === "user-atomic");
            expect(userWrites.filter((w) => w.id === OWNER_A).length, "writes to the sender's user document").to.equal(0);
            const toR = userWrites.filter((w) => w.id === OWNER_R);
            expect(toR.length, "writes to the recipient's user document").to.equal(1);
            const keys = Object.keys(toR[0].changes.sources).sort();
            expect(keys).to.deep.equal([SRC_1, sha256("l7q-source-r-only")].sort());
            expect(attachCalls.length, "source attached for the recipient").to.equal(1);
            expect(attachCalls[0].owner === OWNER_R, "attach owner is the recipient").to.equal(true);
            expect(attachCalls[0].udid).to.equal(UDID_1);
            expect(attachCalls[0].source_id).to.equal(SRC_1);
        });
    });

    // -----------------------------------------------------------------------
    describe("L7Q revoke", function () {

        it("a multi-device revoke removes every named device", async function () {
            const devices = new Devices(fakeMessenger, redis);
            const r = await revoke(devices, OWNER_A, { udids: [UDID_1, UDID_2, UDID_3] });
            await settle();
            expect(r.timedOut, "revoke answered").to.not.equal(true);
            expect(r.success).to.equal(true);
            const destroyed = couch.writes.filter((w) => w.op === "destroy").map((w) => w.id).sort();
            expect(destroyed).to.deep.equal([UDID_1, UDID_2, UDID_3].sort());
            expect(has(couch.devices, UDID_B), "another owner's device untouched").to.equal(true);
        });

        it("udids match exactly, never as a substring", async function () {
            const devices = new Devices(fakeMessenger, redis);
            const r = await revoke(devices, OWNER_A, { udids: [UDID_1 + "0", "x" + UDID_2, UDID_3.substring(0, 20)] });
            await settle();
            expect(r.success).to.equal(false);
            expect(r.response).to.equal("devices_not_found");
            expect(couch.writes.filter((w) => w.op === "destroy").length, "destroyed devices").to.equal(0);
        });

        it("a single-udid revoke still removes that device only", async function () {
            const devices = new Devices(fakeMessenger, redis);
            const r = await revoke(devices, OWNER_A, { udid: UDID_2 });
            await settle();
            expect(r.success).to.equal(true);
            expect(r.response).to.equal(UDID_2);
            const destroyed = couch.writes.filter((w) => w.op === "destroy").map((w) => w.id);
            expect(destroyed).to.deep.equal([UDID_2]);
        });
    });
});
