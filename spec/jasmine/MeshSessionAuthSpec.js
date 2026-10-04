/*
 * MeshSessionAuthSpec — quick 261003-skk: Util.validateSession auth bypass on mesh routes.
 *
 * Mounts the real lib/router.js and lib/router.mesh.js, in production order, on a bare
 * express app with express-session, cookie-parser, a Map-backed Redis stub and a
 * recording owner-library fake. It needs neither Redis nor CouchDB and runs locally
 * (same harness idea as CsrfSessionFlowSpec.js).
 *
 * Pinned behaviour:
 * - an unverified owner_id/api_key body never authenticates a request (any method,
 *   any Origin), and an API key acts only for the owner it is stored under;
 * - session and Bearer requests always act on their own owner, never a body owner;
 * - Util.validateSession / Util.ownerFromRequest trust only router-verified identities;
 * - the four mesh mutations carry the session-bound CSRF check, the lists do not.
 *
 * Nothing here prints a cookie, token or key value; assertions compare status codes
 * and booleans so a failure message cannot leak them either.
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

const Util = require("../../lib/thinx/util");

function sha256(input) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

const OWNER_A = sha256("skk-owner-a");
const OWNER_B = sha256("skk-owner-b");
const KEY_A = sha256("skk-key-a");
const HASH_A = sha256(KEY_A);
const WRONG = sha256("skk-wrong");
const XSRF = "skk-xsrf";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

// Map-backed stand-in for the legacy redis client; callbacks run synchronously.
function makeRedisStub() {
    const store = new Map();
    function lastCallback(args) {
        for (let i = args.length - 1; i >= 0; i--) {
            if (typeof (args[i]) === "function") return args[i];
        }
        return null;
    }
    return {
        store: store,
        get(key, ...rest) {
            const cb = lastCallback(rest);
            const value = store.has(key) ? store.get(key) : null;
            if (cb) cb(null, value);
        },
        set(key, value, ...rest) {
            store.set(key, String(value));
            const cb = lastCallback(rest);
            if (cb) cb(null, "OK");
        },
        del(key, ...rest) {
            store.delete(key);
            const cb = lastCallback(rest);
            if (cb) cb(null, 1);
        },
        expire(key, ...rest) {
            const cb = lastCallback(rest);
            if (cb) cb(null, 1);
        },
        on() { }
    };
}

let server = null;
let calls = [];
let sessionCookie = null; // "x-thx-core=..." for a session owned by OWNER_A
let bearerA = null;       // Bearer token for OWNER_A

function buildApp() {
    const app = express();
    app.use(session({
        secret: "skk-spec-secret",
        name: "x-thx-core",
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: "lax" }
    }));
    app.use(cookieParser());
    app.use(express.json());

    const redis = makeRedisStub();
    // Pre-seeded JWT secret, so JWTLogin.init and sign never race to create two keys.
    redis.store.set("__JWT_SECRET__", crypto.randomBytes(48).toString("hex"));
    redis.store.set("ak:" + OWNER_A, JSON.stringify([{ key: KEY_A, hash: HASH_A, alias: "skk" }]));
    app.redis_client = redis;

    // Recording owner-library fake: every call lands in `calls` (cleared per spec).
    app.owner = {
        createMesh(owner_id, mesh_id, alias, cb) {
            calls.push({ fn: "create", owner: owner_id });
            cb(true, { mesh_id: mesh_id, alias: alias });
        },
        deleteMeshes(owner_id, mesh_ids, cb) {
            calls.push({ fn: "delete", owner: owner_id });
            cb(true, mesh_ids);
        },
        listMeshes(owner_id, cb) {
            calls.push({ fn: "list", owner: owner_id });
            cb(true, []);
        }
    };

    // Spec-only login: binds OWNER_A to a fresh session.
    app.get("/spec/login", (req, res) => {
        req.session.owner = OWNER_A;
        req.session.save(() => res.json({ success: true }));
    });

    // Production order: the global router first, then the mesh routes.
    require("../../lib/router.js")(app);
    require("../../lib/router.mesh.js")(app);

    return app;
}

// Issue one request. opts: { session, xsrf, bearer, origin, body }.
function send(method, path, opts) {
    const o = opts || {};
    return new Promise((resolve, reject) => {
        const headers = {};
        const jar = [];
        if (o.session) jar.push(sessionCookie);
        if (o.xsrf) {
            jar.push("XSRF-TOKEN=" + XSRF);
            headers["X-XSRF-TOKEN"] = XSRF;
        }
        if (jar.length > 0) headers.Cookie = jar.join("; ");
        if (typeof (o.bearer) === "string") headers.Authorization = "Bearer " + o.bearer;
        if (typeof (o.origin) === "string") headers.Origin = o.origin;
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
            res.on("end", () => {
                let parsed = null;
                try { parsed = text ? JSON.parse(text) : null; } catch (_e) { parsed = null; }
                resolve({ status: res.statusCode, setCookie: res.headers["set-cookie"] || [], body: parsed });
            });
        });
        req.on("error", reject);
        if (payload !== null) req.write(payload);
        req.end();
    });
}

function expectNoCalls() {
    expect(calls.length, "owner library calls").to.equal(0);
}

function expectOnly(fn, owner, label) {
    expect(calls.length, "owner library calls").to.equal(1);
    expect(calls[0].fn, "owner library function").to.equal(fn);
    expect(calls[0].owner === owner, label || "acting owner").to.equal(true);
}

function saveCsrfEnv() {
    return { enforce: process.env.CSRF_ENFORCE, mode: process.env.CSRF_MODE };
}

function restoreCsrfEnv(saved) {
    if (typeof (saved.enforce) === "undefined") delete process.env.CSRF_ENFORCE; else process.env.CSRF_ENFORCE = saved.enforce;
    if (typeof (saved.mode) === "undefined") delete process.env.CSRF_MODE; else process.env.CSRF_MODE = saved.mode;
}

function fakeReq(fields) {
    const req = Object.assign({ headers: {}, body: {} }, fields);
    return req;
}

function sessionWithSpy(owner) {
    const s = { destroyed: false };
    if (typeof (owner) !== "undefined") s.owner = owner;
    s.destroy = () => { s.destroyed = true; };
    return s;
}

describe("MESH-AUTH (quick 261003-skk)", function () {

    beforeAll(async () => {
        const app = buildApp();
        server = await new Promise((resolve) => {
            const s = http.createServer(app).listen(0, "127.0.0.1", () => resolve(s));
        });
        bearerA = await new Promise((resolve) => app.login.sign(OWNER_A, resolve));
        const login = await send("GET", "/spec/login");
        const raw = login.setCookie.find((c) => c.indexOf("x-thx-core=") === 0);
        sessionCookie = raw ? raw.split(";")[0] : null;
    });

    afterAll(async () => {
        if (server) await new Promise((resolve) => server.close(() => resolve()));
        server = null;
    });

    beforeEach(() => {
        calls = [];
    });

    it("has a session cookie and a Bearer token for OWNER_A", function () {
        expect(typeof (sessionCookie) === "string", "session cookie present").to.equal(true);
        expect((typeof (bearerA) === "string") && (bearerA.length > 0), "bearer token present").to.equal(true);
    });

    // -----------------------------------------------------------------------
    describe("MESH-AUTH core: validateSession", function () {

        it("rejects an unverified owner_id + api_key body and destroys the session", function () {
            const s = sessionWithSpy();
            const req = fakeReq({ session: s, body: { owner_id: OWNER_A, api_key: KEY_A } });
            expect(Util.validateSession(req)).to.equal(false);
            expect(s.destroyed, "session.destroy called").to.equal(true);
        });

        it("rejects a raw Authorization header without the verified marker", function () {
            const req = fakeReq({ session: sessionWithSpy(), headers: { authorization: "Bearer x" } });
            expect(Util.validateSession(req)).to.equal(false);
        });

        it("accepts the router's verified-Bearer marker", function () {
            const req = fakeReq({ session: sessionWithSpy(), thx_auth: "bearer" });
            expect(Util.validateSession(req)).to.equal(true);
        });

        it("accepts a session owner", function () {
            const req = fakeReq({ session: sessionWithSpy(OWNER_A) });
            expect(Util.validateSession(req)).to.equal(true);
        });

        it("accepts a router-verified API key with its recorded owner", function () {
            const req = fakeReq({ session: sessionWithSpy(), thx_auth: "apikey", thx_apikey_owner: OWNER_A });
            expect(Util.validateSession(req)).to.equal(true);
        });

        it("rejects the apikey marker without a recorded owner", function () {
            const req = fakeReq({ session: sessionWithSpy(), thx_auth: "apikey" });
            expect(Util.validateSession(req)).to.equal(false);
        });

        it("rejects a recorded API-key owner without the apikey marker", function () {
            const req = fakeReq({ session: sessionWithSpy(), thx_apikey_owner: OWNER_A });
            expect(Util.validateSession(req)).to.equal(false);
        });

        it("rejects a request with no session object without throwing", function () {
            let result;
            expect(() => { result = Util.validateSession({}); }).to.not.throw();
            expect(result).to.equal(false);
        });
    });

    // -----------------------------------------------------------------------
    describe("MESH-AUTH core: ownerFromRequest", function () {

        it("prefers the session owner over a body owner", function () {
            const req = fakeReq({ session: { owner: OWNER_A }, body: { owner: OWNER_B } });
            expect(Util.ownerFromRequest(req) === OWNER_A).to.equal(true);
        });

        it("never falls back to a body owner", function () {
            const req = fakeReq({ session: {}, body: { owner: OWNER_B } });
            expect(Util.ownerFromRequest(req)).to.equal(null);
        });

        it("uses the router-verified API-key owner, not the body owner", function () {
            const req = fakeReq({ session: {}, thx_auth: "apikey", thx_apikey_owner: OWNER_A, body: { owner: OWNER_B } });
            expect(Util.ownerFromRequest(req) === OWNER_A).to.equal(true);
        });

        it("prefers the session owner over a verified API-key owner", function () {
            const req = fakeReq({ session: { owner: OWNER_A }, thx_auth: "apikey", thx_apikey_owner: OWNER_B });
            expect(Util.ownerFromRequest(req) === OWNER_A).to.equal(true);
        });
    });

    // -----------------------------------------------------------------------
    describe("MESH-AUTH core: unauthenticated and forged", function () {

        let saved;
        beforeAll(() => {
            saved = saveCsrfEnv();
            delete process.env.CSRF_ENFORCE;
            delete process.env.CSRF_MODE;
        });
        afterAll(() => restoreCsrfEnv(saved));

        const forgedRoutes = [
            ["/api/mesh/list", {}],
            ["/api/mesh/create", { mesh_id: "skk-forged-mesh", alias: "skk" }],
            ["/api/mesh/delete", { mesh_ids: ["skk-forged-mesh"] }]
        ];

        for (const [path, extra] of forgedRoutes) {
            it("answers 401 for POST " + path + " with an unverifiable api_key", async function () {
                const r = await send("POST", path, { body: Object.assign({ owner_id: OWNER_A, api_key: "anything" }, extra) });
                expect(r.status).to.equal(401);
                expectNoCalls();
            });

            it("answers 401 for POST " + path + " with a wrong api_key", async function () {
                const r = await send("POST", path, { body: Object.assign({ owner_id: OWNER_A, api_key: WRONG }, extra) });
                expect(r.status).to.equal(401);
                expectNoCalls();
            });
        }

        it("answers 401 when A's key is sent with owner_id B on create", async function () {
            const r = await send("POST", "/api/mesh/create", { body: { owner_id: OWNER_B, api_key: KEY_A, mesh_id: "skk-forged-mesh" } });
            expect(r.status).to.equal(401);
            expectNoCalls();
        });

        it("answers 401 when A's key is sent with owner_id B on delete", async function () {
            const r = await send("POST", "/api/mesh/delete", { body: { owner_id: OWNER_B, api_key: KEY_A, mesh_ids: ["skk-forged-mesh"] } });
            expect(r.status).to.equal(401);
            expectNoCalls();
        });

        it("answers 401 for a forged create sent with Origin: device", async function () {
            const r = await send("POST", "/api/mesh/create", {
                origin: "device",
                body: { owner_id: OWNER_A, api_key: "anything", mesh_id: "skk-forged-mesh" }
            });
            expect(r.status).to.equal(401);
            expectNoCalls();
        });

        it("answers 401 for a forged PUT /api/v2/mesh", async function () {
            const r = await send("PUT", "/api/v2/mesh", { body: { owner_id: OWNER_A, api_key: "anything", mesh_id: "skk-forged-mesh" } });
            expect(r.status).to.equal(401);
            expectNoCalls();
        });

        it("answers 401 for a forged DELETE /api/v2/mesh", async function () {
            const r = await send("DELETE", "/api/v2/mesh", { body: { owner_id: OWNER_A, api_key: "anything", mesh_ids: ["skk-forged-mesh"] } });
            expect(r.status).to.equal(401);
            expectNoCalls();
        });

        it("answers 401 for a garbage Bearer token", async function () {
            const r = await send("POST", "/api/mesh/create", { bearer: "garbage", body: { mesh_id: "skk-forged-mesh" } });
            expect(r.status).to.equal(401);
            expectNoCalls();
        });
    });

    // -----------------------------------------------------------------------
    describe("MESH-AUTH core: session and API-key owners", function () {

        let saved;
        beforeAll(() => {
            saved = saveCsrfEnv();
            delete process.env.CSRF_ENFORCE;
            delete process.env.CSRF_MODE;
        });
        afterAll(() => restoreCsrfEnv(saved));

        it("session: POST create acts on the session owner", async function () {
            const r = await send("POST", "/api/mesh/create", { session: true, xsrf: true, body: { mesh_id: "skk-mesh-1", alias: "skk" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A);
        });

        it("session: POST list acts on the session owner", async function () {
            const r = await send("POST", "/api/mesh/list", { session: true, xsrf: true, body: {} });
            expect(r.status).to.equal(200);
            expectOnly("list", OWNER_A);
        });

        it("session: GET list acts on the session owner", async function () {
            const r = await send("GET", "/api/mesh/list", { session: true, xsrf: true });
            expect(r.status).to.equal(200);
            expectOnly("list", OWNER_A);
        });

        it("session: POST delete acts on the session owner", async function () {
            const r = await send("POST", "/api/mesh/delete", { session: true, xsrf: true, body: { mesh_ids: ["skk-mesh-1"] } });
            expect(r.status).to.equal(200);
            expectOnly("delete", OWNER_A);
        });

        it("session: a body owner_id B never overrides the session owner on create", async function () {
            const r = await send("POST", "/api/mesh/create", { session: true, xsrf: true, body: { owner_id: OWNER_B, mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A, "acting owner is the session owner, not owner_id B");
        });

        it("session: a body owner_id B never overrides the session owner on delete", async function () {
            const r = await send("POST", "/api/mesh/delete", { session: true, xsrf: true, body: { owner_id: OWNER_B, mesh_ids: ["skk-mesh-1"] } });
            expect(r.status).to.equal(200);
            expectOnly("delete", OWNER_A, "acting owner is the session owner, not owner_id B");
        });

        it("session: a body owner_id B never overrides the session owner on PUT /api/v2/mesh", async function () {
            const r = await send("PUT", "/api/v2/mesh", { session: true, xsrf: true, body: { owner_id: OWNER_B, mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A, "acting owner is the session owner, not owner_id B");
        });

        it("bearer: a body owner_id B never overrides the token owner on create", async function () {
            const r = await send("POST", "/api/mesh/create", { bearer: bearerA, body: { owner_id: OWNER_B, mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A, "acting owner is the Bearer owner, not owner_id B");
        });

        it("api key: owner_id A + A's key creates for A", async function () {
            const r = await send("POST", "/api/mesh/create", { body: { owner_id: OWNER_A, api_key: KEY_A, mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A);
        });

        it("api key: owner_id A + A's key deletes for A", async function () {
            const r = await send("POST", "/api/mesh/delete", { body: { owner_id: OWNER_A, api_key: KEY_A, mesh_ids: ["skk-mesh-1"] } });
            expect(r.status).to.equal(200);
            expectOnly("delete", OWNER_A);
        });

        it("api key: owner_id A + A's key lists for A", async function () {
            const r = await send("POST", "/api/mesh/list", { body: { owner_id: OWNER_A, api_key: KEY_A } });
            expect(r.status).to.equal(200);
            expectOnly("list", OWNER_A);
        });

        it("api key: owner_id A + A's key hash creates for A", async function () {
            const r = await send("POST", "/api/mesh/create", { body: { owner_id: OWNER_A, api_key: HASH_A, mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A);
        });

        it("api key: owner A + A's key creates for A", async function () {
            const r = await send("POST", "/api/mesh/create", { body: { owner: OWNER_A, api_key: KEY_A, mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A);
        });

        it("api key: a non-string api_key answers 401, not 500", async function () {
            const r = await send("POST", "/api/mesh/create", { body: { owner_id: OWNER_A, api_key: 12345, mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(401);
            expectNoCalls();
        });
    });

    // -----------------------------------------------------------------------
    describe("MESH-AUTH csrf: mesh mutations", function () {

        let saved;
        beforeAll(() => {
            saved = saveCsrfEnv();
            process.env.CSRF_ENFORCE = "true";
            delete process.env.CSRF_MODE; // legacy double-submit
        });
        afterAll(() => restoreCsrfEnv(saved));

        const mutations = [
            ["POST", "/api/mesh/create", { mesh_id: "skk-mesh-1" }],
            ["POST", "/api/mesh/delete", { mesh_ids: ["skk-mesh-1"] }],
            ["PUT", "/api/v2/mesh", { mesh_id: "skk-mesh-1" }],
            ["DELETE", "/api/v2/mesh", { mesh_ids: ["skk-mesh-1"] }]
        ];

        for (const [method, path, body] of mutations) {
            it("session without a token: " + method + " " + path + " answers 403", async function () {
                const r = await send(method, path, { session: true, body: body });
                expect(r.status).to.equal(403);
                expectNoCalls();
            });
        }

        it("session with the double-submit pair: POST create acts on the session owner", async function () {
            const r = await send("POST", "/api/mesh/create", { session: true, xsrf: true, body: { mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A);
        });

        it("session without a token: POST list stays unguarded", async function () {
            const r = await send("POST", "/api/mesh/list", { session: true, body: {} });
            expect(r.status).to.equal(200);
            expectOnly("list", OWNER_A);
        });

        it("cookieless verified API key: POST create is exempt", async function () {
            const r = await send("POST", "/api/mesh/create", { body: { owner_id: OWNER_A, api_key: KEY_A, mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A);
        });

        it("verified API key riding a session cookie without a token answers 403", async function () {
            const r = await send("POST", "/api/mesh/create", { session: true, body: { owner_id: OWNER_A, api_key: KEY_A, mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(403);
            expectNoCalls();
        });

        it("Bearer without a cookie or token: POST create is exempt", async function () {
            const r = await send("POST", "/api/mesh/create", { bearer: bearerA, body: { mesh_id: "skk-mesh-1" } });
            expect(r.status).to.equal(200);
            expectOnly("create", OWNER_A);
        });
    });
});
