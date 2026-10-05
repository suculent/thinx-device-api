/*
 * BearerVerifyStatusSpec — quick 261004-l9f: a Bearer token that fails verification
 * answers 401 Unauthorized, not 403.
 *
 * Mounts the real lib/router.js on a bare express app with express-session,
 * cookie-parser and a Map-backed Redis stub (same harness as MeshSessionAuthSpec.js).
 * It needs neither Redis nor CouchDB and runs locally.
 *
 * Pinned behaviour:
 * - a garbage, foreign-secret, expired, alg:none or revoked Bearer token answers 401
 *   with an empty body and never reaches a handler;
 * - a failed Bearer answers 401 even on a CSRF-guarded mutation that carries a session
 *   cookie, so it can never look like the CSRF layer's 403 csrf_token_invalid (which
 *   the consoles answer by re-priming and retrying);
 * - a verified Bearer still reaches the handler as its own owner;
 * - the CSRF rejection stays 403 csrf_token_invalid, a forged API-key body stays 401,
 *   and a "Bearer null" header still falls through to the cookie/no-auth path.
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
const jwt = require("jsonwebtoken");
const expect = require("chai").expect;

function sha256(input) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

const OWNER_A = sha256("l9f-owner-a");
const OWNER_REVOKED = sha256("l9f-owner-revoked");
const WRONG_KEY = sha256("l9f-wrong-key");
const XSRF = "l9f-xsrf";
const JWT_SECRET = crypto.randomBytes(48).toString("hex");

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
let hits = [];
let sessionCookie = null; // "x-thx-core=..." for a session owned by OWNER_A
let tokens = {};

function buildApp() {
    const app = express();
    app.use(session({
        secret: "l9f-spec-secret",
        name: "x-thx-core",
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: "lax" }
    }));
    app.use(cookieParser());
    app.use(express.json());

    const redis = makeRedisStub();
    // Pre-seeded JWT secret, so JWTLogin.init and sign never race to create two keys.
    redis.store.set("__JWT_SECRET__", JWT_SECRET);
    // OWNER_REVOKED's sessions were revoked one minute from now: every token issued so far is older.
    redis.store.set("revoked:owner:" + OWNER_REVOKED, String(Date.now() + 60000));
    app.redis_client = redis;

    // Spec-only login: binds OWNER_A to a fresh session.
    app.get("/spec/login", (req, res) => {
        req.session.owner = OWNER_A;
        req.session.save(() => res.json({ success: true }));
    });

    require("../../lib/router.js")(app);

    const csrf = require("../../lib/middleware/csrf")(app);

    function whoami(req, res) {
        const owner = (req.session && typeof (req.session.owner) === "string") ? req.session.owner : null;
        hits.push({ path: req.path, owner: owner });
        res.status(200).json({ success: true, owner_is_a: owner === OWNER_A });
    }

    // Unguarded read and a CSRF-guarded mutation, registered after the global router like production routes.
    app.get("/api/v2/spec/whoami", whoami);
    app.post("/api/v2/spec/mutate", csrf.verifyCsrfToken, whoami);

    return app;
}

// Issue one request. opts: { session, xsrf, authorization, bearer, body }.
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
        if (typeof (o.authorization) === "string") headers.Authorization = o.authorization;
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
                resolve({ status: res.statusCode, text: text, setCookie: res.headers["set-cookie"] || [], body: parsed });
            });
        });
        req.on("error", reject);
        if (payload !== null) req.write(payload);
        req.end();
    });
}

function expectNoHandler() {
    expect(hits.length, "handler calls").to.equal(0);
}

function expectUnauthorizedEmpty(r) {
    expect(r.status).to.equal(401);
    expect(r.text, "401 body").to.equal("");
    expectNoHandler();
}

function signWith(secret, payload, options) {
    return jwt.sign(payload, secret, Object.assign({ algorithm: "HS512" }, options || {}));
}

function saveCsrfEnv() {
    return { enforce: process.env.CSRF_ENFORCE, mode: process.env.CSRF_MODE };
}

function restoreCsrfEnv(saved) {
    if (typeof (saved.enforce) === "undefined") delete process.env.CSRF_ENFORCE; else process.env.CSRF_ENFORCE = saved.enforce;
    if (typeof (saved.mode) === "undefined") delete process.env.CSRF_MODE; else process.env.CSRF_MODE = saved.mode;
}

describe("BEARER-401 (quick 261004-l9f)", function () {

    let savedCsrf;

    beforeAll(async () => {
        savedCsrf = saveCsrfEnv();
        process.env.CSRF_ENFORCE = "true";
        delete process.env.CSRF_MODE; // legacy double-submit
        const app = buildApp();
        server = await new Promise((resolve) => {
            const s = http.createServer(app).listen(0, "127.0.0.1", () => resolve(s));
        });
        const now = Math.floor(Date.now() / 1000);
        tokens.valid = await new Promise((resolve) => app.login.sign(OWNER_A, resolve));
        tokens.foreign = signWith(crypto.randomBytes(48).toString("hex"), { username: OWNER_A, scope: "/api/", exp: now + 3600 });
        tokens.expired = signWith(JWT_SECRET, { username: OWNER_A, scope: "/api/", iat: now - 7200, exp: now - 3600 });
        tokens.none = jwt.sign({ username: OWNER_A, scope: "/api/", exp: now + 3600 }, null, { algorithm: "none" });
        tokens.revoked = await new Promise((resolve) => app.login.sign(OWNER_REVOKED, resolve));
        const login = await send("GET", "/spec/login");
        const raw = login.setCookie.find((c) => c.indexOf("x-thx-core=") === 0);
        sessionCookie = raw ? raw.split(";")[0] : null;
    });

    afterAll(async () => {
        restoreCsrfEnv(savedCsrf);
        if (server) await new Promise((resolve) => server.close(() => resolve()));
        server = null;
    });

    beforeEach(() => {
        hits = [];
    });

    it("has a session cookie and the spec tokens", function () {
        expect(typeof (sessionCookie) === "string", "session cookie present").to.equal(true);
        for (const name of ["valid", "foreign", "expired", "none", "revoked"]) {
            expect((typeof (tokens[name]) === "string") && (tokens[name].length > 0), name + " token present").to.equal(true);
        }
    });

    // -----------------------------------------------------------------------
    describe("a Bearer token that fails verification answers 401", function () {

        it("B1. a garbage token on GET answers 401 with an empty body", async function () {
            expectUnauthorizedEmpty(await send("GET", "/api/v2/spec/whoami", { bearer: "garbage" }));
        });

        it("B2. a garbage token on POST answers 401 with an empty body", async function () {
            expectUnauthorizedEmpty(await send("POST", "/api/v2/spec/mutate", { bearer: "garbage", body: {} }));
        });

        it("B3. a well-formed token signed with another secret answers 401", async function () {
            expectUnauthorizedEmpty(await send("GET", "/api/v2/spec/whoami", { bearer: tokens.foreign }));
        });

        it("B4. an expired token signed with the API secret answers 401", async function () {
            expectUnauthorizedEmpty(await send("GET", "/api/v2/spec/whoami", { bearer: tokens.expired }));
        });

        it("B5. an unsigned alg:none token answers 401", async function () {
            expectUnauthorizedEmpty(await send("GET", "/api/v2/spec/whoami", { bearer: tokens.none }));
        });

        it("B6. a lower-case 'bearer' scheme with a garbage token answers 401", async function () {
            expectUnauthorizedEmpty(await send("GET", "/api/v2/spec/whoami", { authorization: "bearer garbage" }));
        });

        it("B7. a failed Bearer on a CSRF-guarded mutation with a session cookie answers 401, never csrf_token_invalid", async function () {
            const r = await send("POST", "/api/v2/spec/mutate", { session: true, bearer: tokens.expired, body: {} });
            expectUnauthorizedEmpty(r);
            expect(r.body, "no csrf_token_invalid payload").to.equal(null);
        });

        it("B8. a revoked token keeps answering 401", async function () {
            expectUnauthorizedEmpty(await send("GET", "/api/v2/spec/whoami", { bearer: tokens.revoked }));
        });
    });

    // -----------------------------------------------------------------------
    describe("unchanged statuses", function () {

        it("V1. a verified Bearer reaches the handler as its own owner", async function () {
            const r = await send("GET", "/api/v2/spec/whoami", { bearer: tokens.valid });
            expect(r.status).to.equal(200);
            expect(hits.length, "handler calls").to.equal(1);
            expect(hits[0].owner === OWNER_A, "acting owner is the token owner").to.equal(true);
        });

        it("V2. a verified Bearer passes the CSRF layer without cookies", async function () {
            const r = await send("POST", "/api/v2/spec/mutate", { bearer: tokens.valid, body: {} });
            expect(r.status).to.equal(200);
            expect(hits.length, "handler calls").to.equal(1);
        });

        it("C1. a cookie session without the XSRF pair keeps 403 csrf_token_invalid", async function () {
            const r = await send("POST", "/api/v2/spec/mutate", { session: true, body: {} });
            expect(r.status).to.equal(403);
            expect(r.body).to.deep.equal({ success: false, response: "csrf_token_invalid" });
            expectNoHandler();
        });

        it("C2. a cookie session with the XSRF pair reaches the handler", async function () {
            const r = await send("POST", "/api/v2/spec/mutate", { session: true, xsrf: true, body: {} });
            expect(r.status).to.equal(200);
            expect(hits.length, "handler calls").to.equal(1);
            expect(hits[0].owner === OWNER_A, "acting owner is the session owner").to.equal(true);
        });

        it("K1. an unverified owner_id/api_key body keeps 401 Authentication Faled", async function () {
            const r = await send("POST", "/api/v2/spec/mutate", { body: { owner_id: OWNER_A, api_key: WRONG_KEY } });
            expect(r.status).to.equal(401);
            expect(r.body).to.deep.equal({ success: false, response: "Authentication Faled" });
            expectNoHandler();
        });

        it("N1. 'Bearer null' falls through to the cookie path and reaches the handler", async function () {
            const r = await send("GET", "/api/v2/spec/whoami", { session: true, authorization: "Bearer null" });
            expect(r.status).to.equal(200);
            expect(hits.length, "handler calls").to.equal(1);
            expect(hits[0].owner === OWNER_A, "acting owner is the session owner").to.equal(true);
        });
    });
});
