/*
 * ZZ-CSRFEnforceSpec — SEC-CSRF-02 / SEC-CSRF-03 / SEC-CSRF-05 enforce-mode flow
 * against the real app (bootstrap.thx: Redis session store, CouchDB users).
 *
 * CI only. The CI config runs with debug.csrf_enforce=false and CSRF_MODE unset
 * (legacy), so no other spec exercises session binding end to end (research
 * Pitfall 6). This spec sets CSRF_MODE=signed and CSRF_ENFORCE=true in beforeAll
 * and restores both in afterAll (deleting them when they were unset), so every
 * later spec runs in the default legacy, fail-open CI configuration. csrf.js reads
 * both per call, so no restart is needed.
 *
 * Cookies are forwarded by hand: the XSRF-TOKEN and x-thx-core cookies carry
 * Domain=.thinx.cloud (spec api_url https://app.thinx.cloud), which no cookie jar
 * replays to the local test server.
 *
 * Cases, in order: (1) cold prime; (2) password login rotates x-thx-core and
 * XSRF-TOKEN; (3) session/token accepts the rotated pair; (4) the pre-login token
 * is refused on the rotated session; (5) a verified Bearer call without cookies or
 * header passes the CSRF layer; (6) a Bearer call carrying the session cookie
 * leaves the session id unchanged and case 3 still passes after it; (7) logout
 * clears XSRF-TOKEN; (8) a stale 48-hex pair is refused; (9) token login rotates.
 *
 * Nothing here prints a token, cookie value or session id; comparisons are
 * boolean assertions so a failure message cannot leak them either.
 */

const bootstrap = require('../helpers/bootstrap');

const crypto = require("crypto");
const chai = require('chai');
const expect = require('chai').expect;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

const envi = require("../_envi.json");

const SIGNED_SHAPE = /^[0-9a-f]{64}\.[0-9a-f]{32}$/;

let thx;
let saved = {};

// Resolve with the response whatever its status (chai-http v4 / superagent).
function go(request) {
    return new Promise((resolve) => {
        request.end((_err, res) => resolve(res));
    });
}

// Adds the Cookie header built from a { name: rawValue } jar (skipped when empty).
function withJar(request, jar) {
    const pairs = Object.keys(jar || {}).map((k) => k + "=" + jar[k]);
    if (pairs.length > 0) request.set("Cookie", pairs.join("; "));
    return request;
}

function setCookies(res) {
    const raw = (res && res.headers) ? res.headers['set-cookie'] : undefined;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
}

function cookieLines(res, name) {
    return setCookies(res).filter((c) => c.indexOf(name + "=") === 0);
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

// Apply a response's Set-Cookie lines to a jar (cleared or expired cookies drop out).
function absorb(jar, res) {
    const next = Object.assign({}, jar);
    setCookies(res).forEach((line) => {
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

// Session id carried by a raw x-thx-core value ("s:<sid>.<signature>", URL-encoded).
function sidOf(raw) {
    const decoded = decodeURIComponent(String(raw || ""));
    return decoded.slice(2, decoded.lastIndexOf("."));
}

function responseOf(res) {
    try {
        return JSON.parse(res.text).response;
    } catch (_e) {
        return undefined;
    }
}

function redisGet(key) {
    return new Promise((resolve) => {
        thx.app.redis_client.get(key, (err, value) => resolve(err ? undefined : value));
    });
}

function redisSet(key, value) {
    return new Promise((resolve) => {
        thx.app.redis_client.set(key, value, () => resolve());
    });
}

describe("ZZ-CSRFEnforceSpec (SEC-CSRF-02/03/05, CSRF_MODE=signed + CSRF_ENFORCE=true)", function () {

    // Shared across the ordered cases below.
    let primedJar;       // after the cold prime
    let primedToken;     // pre-login XSRF-TOKEN
    let loggedJar;       // after the password login
    let accessToken;     // Bearer token from the login

    beforeAll(() => {
        thx = bootstrap.thx;
        saved = {
            mode: process.env.CSRF_MODE,
            enforce: process.env.CSRF_ENFORCE
        };
        process.env.CSRF_MODE = "signed";
        process.env.CSRF_ENFORCE = "true";
        console.log(`🚸 [chai] >>> running ZZ-CSRFEnforceSpec (signed + enforce)`);
    });

    afterAll(() => {
        if (typeof (saved.mode) === "undefined") {
            delete process.env.CSRF_MODE;
        } else {
            process.env.CSRF_MODE = saved.mode;
        }
        if (typeof (saved.enforce) === "undefined") {
            delete process.env.CSRF_ENFORCE;
        } else {
            process.env.CSRF_ENFORCE = saved.enforce;
        }
        console.log(`🚸 [chai] <<< completed ZZ-CSRFEnforceSpec`);
    });

    it("1. cold GET /api/v2/csrf-token sets x-thx-core and XSRF-TOKEN and echoes the signed cookie value", async function () {
        const res = await go(chai.request(thx.app).get('/api/v2/csrf-token'));
        expect(res.status).to.equal(200);
        expect(cookieLines(res, "x-thx-core").length).to.equal(1);
        const xsrf = cookieLines(res, "XSRF-TOKEN");
        expect(xsrf.length).to.equal(1);
        const token = cookieValue(xsrf[0]);
        const body = JSON.parse(res.text);
        expect(body.csrf_token === token, "echo equals Set-Cookie").to.equal(true);
        expect(SIGNED_SHAPE.test(token), "signed token shape").to.equal(true);
        primedJar = absorb({}, res);
        primedToken = token;
    }, 30000);

    it("2. POST /api/v2/login with the primed pair rotates x-thx-core and XSRF-TOKEN and returns access_token", async function () {
        const res = await go(withJar(chai.request(thx.app).post('/api/v2/login'), primedJar)
            .set("X-XSRF-TOKEN", primedToken)
            .send({ username: "dynamic", password: "dynamic", remember: false }));
        expect(res.status).to.equal(200);
        expect(cookieLines(res, "x-thx-core").length).to.equal(1);
        expect(cookieLines(res, "XSRF-TOKEN").length).to.be.at.least(1);
        loggedJar = absorb(primedJar, res);
        expect(sidOf(loggedJar["x-thx-core"]) !== sidOf(primedJar["x-thx-core"]), "session id rotated").to.equal(true);
        expect(loggedJar["XSRF-TOKEN"] !== primedToken, "XSRF-TOKEN rotated").to.equal(true);
        expect(SIGNED_SHAPE.test(loggedJar["XSRF-TOKEN"]), "rotated token is signed").to.equal(true);
        accessToken = JSON.parse(res.text).access_token;
        expect(accessToken).to.be.a("string");
    }, 30000);

    it("3. POST /api/v2/session/token accepts the rotated pair", async function () {
        const res = await go(withJar(chai.request(thx.app).post('/api/v2/session/token'), loggedJar)
            .set("X-XSRF-TOKEN", loggedJar["XSRF-TOKEN"])
            .send({}));
        expect(res.status).to.equal(200);
        expect(JSON.parse(res.text).access_token).to.be.a("string");
    }, 30000);

    it("4. the rotated x-thx-core with the pre-login token as cookie and header answers 403 csrf_token_invalid", async function () {
        const stale = Object.assign({}, loggedJar, { "XSRF-TOKEN": primedToken });
        const res = await go(withJar(chai.request(thx.app).post('/api/v2/session/token'), stale)
            .set("X-XSRF-TOKEN", primedToken)
            .send({}));
        expect(res.status).to.equal(403);
        expect(responseOf(res)).to.equal("csrf_token_invalid");
    }, 30000);

    it("5. a verified Bearer call with no cookies and no header passes the CSRF layer (D-09)", async function () {
        const res = await go(chai.request(thx.app).post('/api/v2/session/token')
            .set("Authorization", "Bearer " + accessToken)
            .send({}));
        expect(responseOf(res)).to.not.equal("csrf_token_invalid");
        expect(res.status).to.not.equal(403);
        // A failed Bearer answers an empty 401 (261004-l9f); a body means the token verified and the handler answered.
        expect(res.text, "Bearer verified and the handler answered").to.not.equal("");
    }, 30000);

    it("6. a Bearer call carrying the session cookie keeps the session id, never stores thx_auth, and case 3 still passes (SEC-CSRF-05)", async function () {
        const sid = sidOf(loggedJar["x-thx-core"]);
        const bearer = await go(withJar(chai.request(thx.app).post('/api/v2/session/token'), { "x-thx-core": loggedJar["x-thx-core"] })
            .set("Authorization", "Bearer " + accessToken)
            .send({}));
        expect(responseOf(bearer)).to.not.equal("csrf_token_invalid");
        cookieLines(bearer, "x-thx-core").forEach((line) => {
            expect(sidOf(cookieValue(line)) === sid, "Bearer bridge must not rotate the session id").to.equal(true);
        });

        const stored = await redisGet("sess:" + sid);
        expect(typeof (stored) === "string", "session still stored under the same id").to.equal(true);
        expect(stored.indexOf("thx_auth") === -1, "thx_auth is request-local").to.equal(true);

        const again = await go(withJar(chai.request(thx.app).post('/api/v2/session/token'), loggedJar)
            .set("X-XSRF-TOKEN", loggedJar["XSRF-TOKEN"])
            .send({}));
        expect(again.status).to.equal(200);
    }, 30000);

    it("7. GET /api/v2/logout clears XSRF-TOKEN (empty value, Expires in the past)", async function () {
        const res = await go(withJar(chai.request(thx.app).get('/api/v2/logout'), loggedJar).redirects(0));
        const clears = cookieLines(res, "XSRF-TOKEN");
        expect(clears.length).to.equal(1);
        expect(cookieValue(clears[0])).to.equal("");
        expect(Date.parse(cookieAttr(clears[0], "Expires"))).to.be.below(Date.now());
    }, 30000);

    it("8. a fresh prime, then a 48-hex legacy-shaped pair on POST /api/v2/login answers 403 csrf_token_invalid", async function () {
        const prime = await go(chai.request(thx.app).get('/api/v2/csrf-token'));
        expect(prime.status).to.equal(200);
        const legacy = crypto.randomBytes(24).toString("hex");
        const jar = Object.assign(absorb({}, prime), { "XSRF-TOKEN": legacy });
        const res = await go(withJar(chai.request(thx.app).post('/api/v2/login'), jar)
            .set("X-XSRF-TOKEN", legacy)
            .send({ username: "dynamic", password: "dynamic", remember: false }));
        expect(res.status).to.equal(403);
        expect(responseOf(res)).to.equal("csrf_token_invalid");
    }, 30000);

    it("9. token login (POST /api/login {token}) with the primed pair rotates x-thx-core and XSRF-TOKEN", async function () {
        const token = "spec-csrf-enforce-token-login";
        await redisSet(token, JSON.stringify({
            first_name: "Dynamic",
            last_name: "User",
            email: "dynamic@example.com",
            username: "dynamic",
            owner: envi.dynamic.owner
        }));
        const prime = await go(chai.request(thx.app).get('/api/csrf-token'));
        expect(prime.status).to.equal(200);
        const jar = absorb({}, prime);
        const res = await go(withJar(chai.request(thx.app).post('/api/login'), jar)
            .set("X-XSRF-TOKEN", jar["XSRF-TOKEN"])
            .send({ token: token }));
        expect(res.status).to.equal(200);
        expect(cookieLines(res, "x-thx-core").length).to.equal(1);
        const after = absorb(jar, res);
        expect(sidOf(after["x-thx-core"]) !== sidOf(jar["x-thx-core"]), "session id rotated").to.equal(true);
        expect(after["XSRF-TOKEN"] !== jar["XSRF-TOKEN"], "XSRF-TOKEN rotated").to.equal(true);
        expect(SIGNED_SHAPE.test(after["XSRF-TOKEN"]), "rotated token is signed").to.equal(true);
    }, 30000);
});
