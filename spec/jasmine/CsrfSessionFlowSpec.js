/*
 * CsrfSessionFlowSpec — SEC-CSRF-02 / SEC-CSRF-03 local end-to-end flow.
 *
 * Mounts the real csrf middleware and the real establishSession login helper on a
 * bare express app with express-session and a MemoryStore, so it needs neither Redis
 * nor CouchDB and runs locally (same harness idea as CookiePolicySpec.js).
 *
 * Flow under CSRF_MODE=signed + CSRF_ENFORCE=true: the priming GET creates a
 * 15-minute pre-session and mints an HMAC token bound to that session id; a login
 * verifies it, regenerates the session and answers with a rotated token; the rotated
 * token passes a guarded route while the pre-login one is refused; logout clears
 * the XSRF-TOKEN cookie. D-02 (only the priming GET writes a pre-session) and the
 * edge cases listed in 25-01-PLAN.md are covered one `it` per behaviour.
 *
 * Cookies are forwarded by hand: the XSRF cookie carries Domain=.thinx.cloud (the
 * bundled spec api_url), which no cookie jar would replay to 127.0.0.1.
 *
 * Nothing here prints a token, cookie value or session id; comparisons go through
 * boolean assertions so a failure message cannot leak them either.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const express = require("express");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const http = require("http");
const chai = require("chai");
const expect = chai.expect;

const Util = require("../../lib/thinx/util");
const secrets = require("../../lib/thinx/secrets");
const csrfModule = require("../../lib/middleware/csrf");
const { establishSession } = require("../../lib/thinx/establish_session");

const SPEC_CSRF_SECRET = "5f1c0a9e7b3d2468ace013579bdf2468ace013579bdf2468ace013579bdf2468";
const SIGNED_SHAPE = /^[0-9a-f]{64}\.[0-9a-f]{32}$/;
const HOUR = 3600 * 1000;
const MINUTE = 60 * 1000;

// One app per case, each with its own store. Routes mirror the production wiring.
function buildApp(store) {
    const app = express();
    app.use(session({
        secret: "spec-session-secret",
        store: store,
        name: "x-thx-core",
        resave: true,
        rolling: true,
        saveUninitialized: false,
        cookie: { maxAge: 3600000, httpOnly: true, sameSite: "lax" }
    }));
    app.use(cookieParser());
    const csrf = csrfModule({});
    app.use(csrf.ensureXsrfCookie);
    app.use(express.json());

    app.get("/api/v2/csrf-token", (req, res) => csrf.issueCsrfToken(req, res));

    app.post("/api/v2/login", csrf.verifyCsrfToken, (req, res) => {
        establishSession(req, res, csrf, "owner-a", (err) => {
            if (err) return Util.failureResponse(res, 503, "service_unavailable");
            req.session.cookie.maxAge = 8 * HOUR;
            res.json({ success: true });
        });
    });

    app.post("/api/v2/protected", csrf.verifyCsrfToken, (req, res) => res.json({ success: true }));

    app.get("/api/v2/logout", (req, res) => {
        csrf.clear(res);
        if (req.session) {
            return req.session.destroy(() => res.json({ success: true }));
        }
        res.json({ success: true });
    });

    app.get("/api/v2/other", (req, res) => res.json({ success: true }));

    return app;
}

function startServer(app) {
    return new Promise((resolve) => {
        const server = http.createServer(app).listen(0, "127.0.0.1", () => resolve(server));
    });
}

function stopServer(server) {
    return new Promise((resolve) => server.close(() => resolve()));
}

// Issue one request; `cookies` is a { name: rawValue } map, `xsrf` the header value.
function send(server, method, path, cookies, xsrf, body) {
    return new Promise((resolve, reject) => {
        const headers = {};
        const jar = Object.keys(cookies || {}).map((k) => k + "=" + cookies[k]);
        if (jar.length > 0) headers.Cookie = jar.join("; ");
        if (typeof (xsrf) === "string") headers["X-XSRF-TOKEN"] = xsrf;
        let payload = null;
        if (typeof (body) !== "undefined") {
            payload = JSON.stringify(body);
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
        if (payload) req.write(payload);
        req.end();
    });
}

// All Set-Cookie lines for `name`.
function cookieLines(setCookie, name) {
    return setCookie.filter((c) => c.indexOf(name + "=") === 0);
}

function cookieValue(line) {
    const first = line.split(";")[0];
    return first.slice(first.indexOf("=") + 1);
}

function cookieAttr(line, attr) {
    const parts = line.split(";").map((p) => p.trim());
    const hit = parts.find((p) => p.toLowerCase().indexOf(attr.toLowerCase() + "=") === 0);
    return hit ? hit.slice(hit.indexOf("=") + 1) : undefined;
}

// Apply a response's Set-Cookie lines to a { name: value } jar (clears drop the entry).
function absorb(jar, setCookie) {
    const next = Object.assign({}, jar);
    setCookie.forEach((line) => {
        const first = line.split(";")[0];
        const name = first.slice(0, first.indexOf("="));
        const value = cookieValue(line);
        const expires = cookieAttr(line, "Expires");
        const expired = (typeof (expires) === "string") && (Date.parse(expires) <= Date.now());
        if ((value === "") || expired) {
            delete next[name];
        } else {
            next[name] = value;
        }
    });
    return next;
}

// Session id carried by a raw x-thx-core cookie value ("s:<sid>.<signature>", URL-encoded).
function sidOf(rawCookieValue) {
    const decoded = decodeURIComponent(rawCookieValue);
    return decoded.slice(2, decoded.lastIndexOf("."));
}

function storedSession(store, sid) {
    const raw = store.sessions[sid];
    return raw ? JSON.parse(raw) : undefined;
}

function sessionCount(store) {
    return Object.keys(store.sessions).length;
}

describe("CsrfSessionFlowSpec (SEC-CSRF-02/03)", function () {

    let store;
    let server;

    function resetAll() {
        secrets._resetCacheForTests();
        csrfModule._resetForTests();
    }

    beforeEach(async function () {
        process.env.CSRF_MODE = "signed";
        process.env.CSRF_ENFORCE = "true";
        process.env.CSRF_SECRET = SPEC_CSRF_SECRET;
        resetAll();
        store = new session.MemoryStore();
        server = await startServer(buildApp(store));
    });

    afterEach(async function () {
        await stopServer(server);
        delete process.env.CSRF_MODE;
        delete process.env.CSRF_ENFORCE;
        delete process.env.CSRF_SECRET;
        resetAll();
    });

    async function prime(jar) {
        const res = await send(server, "GET", "/api/v2/csrf-token", jar || {});
        return { res: res, jar: absorb(jar || {}, res.setCookie) };
    }

    async function login(jar) {
        const res = await send(server, "POST", "/api/v2/login", jar, jar["XSRF-TOKEN"], { username: "u" });
        return { res: res, jar: absorb(jar, res.setCookie) };
    }

    it("cold prime creates one pre-session and a signed token bound to it (D-01, D-03)", async function () {
        const { res, jar } = await prime();
        expect(res.status).to.equal(200);
        expect(sessionCount(store)).to.equal(1);

        const sessionLines = cookieLines(res.setCookie, "x-thx-core");
        expect(sessionLines.length).to.equal(1);
        const ahead = Date.parse(cookieAttr(sessionLines[0], "Expires")) - Date.now();
        expect(ahead).to.be.within(14 * MINUTE, 16 * MINUTE);

        const stored = storedSession(store, sidOf(jar["x-thx-core"]));
        expect(stored, "pre-session must be stored under the cookie's sid").to.be.an("object");
        expect(stored.csrf_pre).to.be.a("number");

        const xsrfLines = cookieLines(res.setCookie, "XSRF-TOKEN");
        expect(xsrfLines.length).to.equal(1);
        const token = cookieValue(xsrfLines[0]);
        expect(token === res.body.csrf_token, "echo equals Set-Cookie").to.equal(true);
        expect(SIGNED_SHAPE.test(token), "signed token shape").to.equal(true);
        expect(csrfModule.check(token, sidOf(jar["x-thx-core"])) === null, "token bound to the pre-session").to.equal(true);
    });

    it("login regenerates the session and answers with a rotated token (D-03, SEC-CSRF-03)", async function () {
        const primed = await prime();
        const oldSid = sidOf(primed.jar["x-thx-core"]);
        const oldToken = primed.jar["XSRF-TOKEN"];

        const { res, jar } = await login(primed.jar);
        expect(res.status).to.equal(200);

        const sessionLines = cookieLines(res.setCookie, "x-thx-core");
        const xsrfLines = cookieLines(res.setCookie, "XSRF-TOKEN");
        expect(sessionLines.length).to.equal(1);
        expect(xsrfLines.length).to.equal(1);

        const newSid = sidOf(jar["x-thx-core"]);
        const newToken = jar["XSRF-TOKEN"];
        expect(newSid !== oldSid, "session id changes at login").to.equal(true);
        expect(newToken !== oldToken, "XSRF-TOKEN rotates at login").to.equal(true);
        expect(csrfModule.check(newToken, newSid) === null, "rotated token matches the response's x-thx-core").to.equal(true);

        expect(storedSession(store, oldSid), "pre-login session destroyed").to.equal(undefined);
        const stored = storedSession(store, newSid);
        expect(stored.owner).to.equal("owner-a");
        expect(stored.login_owner).to.equal("owner-a");
        expect(stored.csrf_pre).to.equal(undefined);
    });

    it("the rotated pair passes a guarded route and the pre-login token is refused (D-03)", async function () {
        const primed = await prime();
        const oldToken = primed.jar["XSRF-TOKEN"];
        const loggedIn = await login(primed.jar);

        const ok = await send(server, "POST", "/api/v2/protected", loggedIn.jar, loggedIn.jar["XSRF-TOKEN"], {});
        expect(ok.status).to.equal(200);

        const stale = Object.assign({}, loggedIn.jar, { "XSRF-TOKEN": oldToken });
        const refused = await send(server, "POST", "/api/v2/protected", stale, oldToken, {});
        expect(refused.status).to.equal(403);
        expect(refused.body.response).to.equal("csrf_token_invalid");
    });

    it("a token minted for session B is refused on session A (SC-1, planted sibling cookie)", async function () {
        const a = await prime();
        const b = await prime();
        expect(sessionCount(store)).to.equal(2);

        const planted = Object.assign({}, a.jar, { "XSRF-TOKEN": b.jar["XSRF-TOKEN"] });
        const res = await send(server, "POST", "/api/v2/protected", planted, b.jar["XSRF-TOKEN"], {});
        expect(res.status).to.equal(403);
        expect(res.body.response).to.equal("csrf_token_invalid");
    });

    it("logout clears XSRF-TOKEN with the Domain and Path it was minted with, with or without a session (SEC-CSRF-03)", async function () {
        const primed = await prime();
        const mintLine = cookieLines(primed.res.setCookie, "XSRF-TOKEN")[0];
        const loggedIn = await login(primed.jar);

        const out = await send(server, "GET", "/api/v2/logout", loggedIn.jar);
        const clears = cookieLines(out.setCookie, "XSRF-TOKEN");
        expect(clears.length).to.equal(1);
        expect(cookieValue(clears[0])).to.equal("");
        expect(Date.parse(cookieAttr(clears[0], "Expires"))).to.be.below(Date.now());
        expect(cookieAttr(clears[0], "Domain")).to.equal(cookieAttr(mintLine, "Domain"));
        expect(cookieAttr(clears[0], "Path")).to.equal(cookieAttr(mintLine, "Path"));

        const bare = await send(server, "GET", "/api/v2/logout", {});
        expect(bare.status).to.equal(200);
        expect(cookieLines(bare.setCookie, "XSRF-TOKEN").length).to.equal(1);
        expect(cookieValue(cookieLines(bare.setCookie, "XSRF-TOKEN")[0])).to.equal("");
    });

    it("a cookieless request to any other route writes no session and sets no cookie, in observe and signed (D-02)", async function () {
        for (const mode of ["observe", "signed"]) {
            process.env.CSRF_MODE = mode;
            const res = await send(server, "GET", "/api/v2/other", {});
            expect(res.status, mode).to.equal(200);
            expect(sessionCount(store), mode).to.equal(0);
            expect(cookieLines(res.setCookie, "x-thx-core").length, mode).to.equal(0);
            expect(cookieLines(res.setCookie, "XSRF-TOKEN").length, mode).to.equal(0);
        }
    });

    it("priming twice on the same live pre-session echoes the same token and creates no second session (SEC-CSRF-06)", async function () {
        const first = await prime();
        const second = await prime(first.jar);
        expect(second.res.status).to.equal(200);
        expect(sessionCount(store)).to.equal(1);
        expect(second.res.body.csrf_token === first.jar["XSRF-TOKEN"], "same token echoed").to.equal(true);
        const reminted = cookieLines(second.res.setCookie, "XSRF-TOKEN");
        reminted.forEach((line) => {
            expect(cookieValue(line) === second.res.body.csrf_token, "echo equals Set-Cookie").to.equal(true);
        });
    });

    it("re-priming a logged-in session keeps its lifetime (no 15-minute shrink)", async function () {
        const primed = await prime();
        const loggedIn = await login(primed.jar);
        const sid = sidOf(loggedIn.jar["x-thx-core"]);

        const again = await prime(loggedIn.jar);
        expect(again.res.status).to.equal(200);
        cookieLines(again.res.setCookie, "x-thx-core").forEach((line) => {
            const ahead = Date.parse(cookieAttr(line, "Expires")) - Date.now();
            expect(ahead, "session cookie must not drop to the pre-session lifetime").to.be.above(16 * MINUTE);
        });
        const stored = storedSession(store, sid);
        expect(stored.cookie.originalMaxAge).to.equal(8 * HOUR);
        expect(stored.csrf_pre).to.equal(undefined);
    });

    it("a regenerate store error answers 503 service_unavailable and never gives the old session an owner", async function () {
        store.destroy = function (sid, cb) {
            if (typeof (cb) === "function") setImmediate(() => cb(new Error("destroy failed")));
        };
        const primed = await prime();
        const oldSid = sidOf(primed.jar["x-thx-core"]);

        const res = await send(server, "POST", "/api/v2/login", primed.jar, primed.jar["XSRF-TOKEN"], {});
        expect(res.status).to.equal(503);
        expect(res.body.response).to.equal("service_unavailable");
        const stored = storedSession(store, oldSid);
        expect(stored.owner).to.equal(undefined);
        expect(stored.login_owner).to.equal(undefined);
        expect(cookieLines(res.setCookie, "XSRF-TOKEN").length).to.equal(0);
    });

    it("two consecutive logins give distinct sessions and tokens, and the first token is refused on the second session", async function () {
        const primed = await prime();
        const first = await login(primed.jar);
        const second = await login(first.jar);
        expect(second.res.status).to.equal(200);

        const sid1 = sidOf(first.jar["x-thx-core"]);
        const sid2 = sidOf(second.jar["x-thx-core"]);
        expect(sid1 !== sid2, "distinct session ids").to.equal(true);
        expect(first.jar["XSRF-TOKEN"] !== second.jar["XSRF-TOKEN"], "distinct tokens").to.equal(true);

        const stale = Object.assign({}, second.jar, { "XSRF-TOKEN": first.jar["XSRF-TOKEN"] });
        const refused = await send(server, "POST", "/api/v2/protected", stale, first.jar["XSRF-TOKEN"], {});
        expect(refused.status).to.equal(403);
        expect(refused.body.response).to.equal("csrf_token_invalid");
    });

    it("priming with an x-thx-core for an unknown session creates a fresh pre-session and echoes its Set-Cookie (SEC-CSRF-06)", async function () {
        const primed = await prime();
        const oldSid = sidOf(primed.jar["x-thx-core"]);
        delete store.sessions[oldSid]; // expired / evicted server-side

        const again = await prime(primed.jar);
        expect(again.res.status).to.equal(200);
        expect(sessionCount(store)).to.equal(1);
        const newSid = sidOf(again.jar["x-thx-core"]);
        expect(newSid !== oldSid, "a new pre-session id").to.equal(true);
        expect(storedSession(store, newSid).csrf_pre).to.be.a("number");

        const xsrfLines = cookieLines(again.res.setCookie, "XSRF-TOKEN");
        expect(xsrfLines.length).to.equal(1);
        expect(cookieValue(xsrfLines[0]) === again.res.body.csrf_token, "echo equals Set-Cookie").to.equal(true);
        expect(csrfModule.check(again.res.body.csrf_token, newSid) === null, "bound to the new pre-session").to.equal(true);
    });

    it("parallel logins on one pre-session each answer a self-consistent pair and never own the pre-login session (backstop)", async function () {
        const primed = await prime();
        const oldSid = sidOf(primed.jar["x-thx-core"]);
        const results = await Promise.all([login(primed.jar), login(primed.jar)]);

        let succeeded = 0;
        results.forEach((r) => {
            if (r.res.status === 200) {
                succeeded++;
                const sid = sidOf(r.jar["x-thx-core"]);
                expect(csrfModule.check(r.jar["XSRF-TOKEN"], sid) === null, "pair is self-consistent").to.equal(true);
            } else {
                // The loser may have loaded the session after the winner destroyed it.
                expect(r.res.status).to.equal(403);
                expect(r.res.body.response).to.equal("csrf_token_invalid");
            }
        });
        expect(succeeded).to.be.at.least(1);
        const leftover = storedSession(store, oldSid);
        if (leftover) {
            expect(leftover.owner).to.equal(undefined);
            expect(leftover.login_owner).to.equal(undefined);
        }
    });
});
