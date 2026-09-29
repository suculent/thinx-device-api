/*
 * ZZ-CSRFSpec.js — SEC-CSRF-01 / SEC-CSRF-02 regression spec
 *
 * Unit-tests `lib/middleware/csrf.js` in isolation against mock req/res objects.
 * Deliberately does NOT boot the full THiNX app (no CouchDB/Redis dependency) —
 * csrf.js only needs `app_config.api_url` / `app_config.debug.csrf_enforce`,
 * resolved from the bundled `spec/mnt/data/conf/config.json`, and the session
 * secret from the bundled `spec/mnt/data/conf/node-session.json`.
 *
 * Legacy double-submit (the v1.13 rollback contract, D-08), run three times: with
 * CSRF_MODE="legacy" set explicitly, with CSRF_MODE unset, and with an unrecognised
 * CSRF_MODE="signd" (legacy plus exactly one warning line):
 *   (1) matching cookie/header -> next(); (2) missing header, fail-open -> next()
 *   + warning log; (3) missing header, enforce -> 403; (4) forged header, enforce
 *   -> 403; (5) ensureXsrfCookie mints a fresh cookie only when none present;
 *   (6) issueCsrfToken echoes the already-minted token WITHOUT a second
 *   Set-Cookie (no-double-generation); (7) fail-open log carries a reason code and
 *   duplicate-cookie count, never token values; (8) enforce mode logs one
 *   reason-coded line per rejection; (9) cookie Domain derivation never throws and
 *   keeps ".thinx.cloud" for the production api_url; (10) the minted cookie
 *   carries that domain and path "/"; (10b) a throwing res.cookie still calls
 *   next(); (11) no token is minted for preflights, device, firmware and webhook
 *   traffic, while console routes still get one.
 *
 * Signed / observe (SEC-CSRF-02, D-17): (1s) bound token + matching sid -> next;
 * (4s) token of another sid -> 403 with reason binding_mismatch; observe logs the
 * same failure and lets it through; signed without CSRF_ENFORCE is fail-open;
 * missing / session_mismatch reason codes; (5s) cookieless request -> no mint, no
 * session write; (6s) priming creates the pre-session and echoes the minted value;
 * rotate() and clear().
 *
 * Key (D-04): source secret / hkdf / none; the hkdf key is identical across two
 * resets (the redeploy proxy); assertReady() throws csrf_key_unavailable for
 * observe and signed without a key but not for legacy.
 *
 * Boundary and precision: dot at 63/65, 48-hex, uppercase, non-string -> stale;
 * exact shape with a wrong MAC -> binding_mismatch; the MAC input is length
 * prefixed, so shifting characters between sid and nonce never validates.
 *
 * Captured log lines never contain a token value or a session id.
 */

// Force the lightweight bundled config path (spec/mnt/data/conf/config.json)
// so this spec never needs a real /mnt/data/conf mount or live services.
if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

var expect = require('chai').expect;

const crypto = require("crypto");
const cookie = require("cookie");
const CookiePolicy = require("../../lib/middleware/cookie-policy");
const secrets = require("../../lib/thinx/secrets");
const csrfFactory = require("../../lib/middleware/csrf");
const csrf = csrfFactory({}); // no app.* members are used by this middleware

const SPEC_CSRF_SECRET = "5f1c0a9e7b3d2468ace013579bdf2468ace013579bdf2468ace013579bdf2468";
const SPEC_SESSION_SECRET = "<some-session-secret>"; // spec/mnt/data/conf/node-session.json
const SIGNED_SHAPE = /^[0-9a-f]{64}\.[0-9a-f]{32}$/;

function mockRes() {
    const res = {
        locals: {},
        _cookieCalls: [],
        _clearCalls: [],
        _status: null,
        _ended: null
    };
    res.cookie = function (name, value, options) {
        res._cookieCalls.push({ name: name, value: value, options: options });
    };
    res.clearCookie = function (name, options) {
        res._clearCalls.push({ name: name, options: options });
    };
    res.status = function (code) {
        res._status = code;
        return res;
    };
    res.header = function () {
        return res;
    };
    res.end = function (body) {
        res._ended = body;
    };
    return res;
}

// Runs fn with console.log captured; returns the captured lines.
function withCapturedLog(fn) {
    const originalLog = console.log;
    const lines = [];
    console.log = function () {
        lines.push(Array.prototype.map.call(arguments, String).join(" "));
    };
    try {
        fn();
    } finally {
        console.log = originalLog;
    }
    return lines;
}

// Runs verifyCsrfToken and returns every console.log line it emitted.
function captureLogs(req, res) {
    let nextCalled = false;
    const lines = withCapturedLog(function () {
        csrf.verifyCsrfToken(req, res, function next() { nextCalled = true; });
    });
    return { lines: lines, nextCalled: nextCalled };
}

function resetAll() {
    secrets._resetCacheForTests();
    csrfFactory._resetForTests();
}

// The v1.13 double-submit contract. Mode set-up happens in the caller's beforeEach.
function legacyCases() {

    it("1. matching cookie/header -> next() is called, no status set", function (done) {
        const req = {
            cookies: { 'XSRF-TOKEN': 'abc123token' },
            headers: { 'x-xsrf-token': 'abc123token' },
            method: 'POST',
            originalUrl: '/api/login'
        };
        const res = mockRes();
        csrf.verifyCsrfToken(req, res, function next() {
            expect(res._status).to.equal(null);
            done();
        });
    });

    it("2. missing header, fail-open (default, not enforced) -> next() called, warning logged", function (done) {
        const req = {
            cookies: { 'XSRF-TOKEN': 'abc123token' },
            headers: {},
            method: 'POST',
            originalUrl: '/api/login'
        };
        const res = mockRes();
        const originalLog = console.log;
        let logged = false;
        console.log = function (msg) {
            if ((typeof (msg) === "string") && (msg.indexOf("CSRF token missing/mismatched") !== -1)) logged = true;
            originalLog.apply(console, arguments);
        };
        csrf.verifyCsrfToken(req, res, function next() {
            console.log = originalLog;
            expect(res._status).to.equal(null);
            expect(logged).to.equal(true);
            done();
        });
    });

    it("3. missing header, enforce=true -> res.status(403), next() is NOT called", function (done) {
        process.env.CSRF_ENFORCE = 'true';
        const req = {
            cookies: { 'XSRF-TOKEN': 'abc123token' },
            headers: {},
            method: 'POST',
            originalUrl: '/api/login'
        };
        const res = mockRes();
        let nextCalled = false;
        withCapturedLog(function () {
            csrf.verifyCsrfToken(req, res, function next() { nextCalled = true; });
        });
        expect(res._status).to.equal(403);
        expect(nextCalled).to.equal(false);
        done();
    });

    it("4. forged header, enforce=true -> 403", function (done) {
        process.env.CSRF_ENFORCE = 'true';
        const req = {
            cookies: { 'XSRF-TOKEN': 'abc123token' },
            headers: { 'x-xsrf-token': 'forgedtoken' },
            method: 'POST',
            originalUrl: '/api/login'
        };
        const res = mockRes();
        let nextCalled = false;
        withCapturedLog(function () {
            csrf.verifyCsrfToken(req, res, function next() { nextCalled = true; });
        });
        expect(res._status).to.equal(403);
        expect(nextCalled).to.equal(false);
        done();
    });

    it("5. ensureXsrfCookie mints a fresh cookie when none present, does not overwrite an existing valid one", function (done) {
        const req1 = { cookies: {} };
        const res1 = mockRes();
        csrf.ensureXsrfCookie(req1, res1, function next() {
            expect(res1._cookieCalls.length).to.equal(1);
            expect(res1._cookieCalls[0].name).to.equal('XSRF-TOKEN');
            expect(res1._cookieCalls[0].options.httpOnly).to.equal(false);
            expect(res1._cookieCalls[0].options.sameSite).to.equal('lax');
            expect(res1._cookieCalls[0].value).to.be.a('string');
            expect(res1._cookieCalls[0].value.length).to.be.above(0);

            const req2 = { cookies: { 'XSRF-TOKEN': 'already-set-token' } };
            const res2 = mockRes();
            csrf.ensureXsrfCookie(req2, res2, function next2() {
                expect(res2._cookieCalls.length).to.equal(0);
                done();
            });
        });
    });

    it("6. issueCsrfToken echoes the ensureXsrfCookie-minted token without minting/setting a second one", function (done) {
        const req = { cookies: {} };
        const res = mockRes();
        csrf.ensureXsrfCookie(req, res, function next() {
            expect(res._cookieCalls.length).to.equal(1);
            const mintedToken = res._cookieCalls[0].value;

            csrf.issueCsrfToken(req, res);

            // still exactly one Set-Cookie total across BOTH calls -> no double-generation
            expect(res._cookieCalls.length).to.equal(1);

            const body = JSON.parse(res._ended);
            expect(body.csrf_token === mintedToken, "echo equals the minted token").to.equal(true);
            done();
        });
    });

    it("6b. issueCsrfToken echoes the freshly minted token before a stale request cookie", function () {
        const req = { cookies: { 'XSRF-TOKEN': 'stale-request-cookie' } };
        const res = mockRes();
        res.locals.xsrfToken = 'freshly-minted';
        csrf.issueCsrfToken(req, res);
        expect(JSON.parse(res._ended).csrf_token).to.equal('freshly-minted');
    });

    it("7. fail-open log carries a reason code and the duplicate-cookie count, never the token values (WR-01)", function () {
        const cases = [
            { cookies: {}, headers: { 'x-xsrf-token': 'hdrtoken123' }, reason: 'no_cookie' },
            { cookies: { 'XSRF-TOKEN': 'cookietoken1' }, headers: {}, reason: 'no_header' },
            { cookies: { 'XSRF-TOKEN': 'cookietoken1' }, headers: { 'x-xsrf-token': 'short' }, reason: 'length_mismatch' },
            { cookies: { 'XSRF-TOKEN': 'cookietoken1' }, headers: { 'x-xsrf-token': 'cookietoken2' }, reason: 'value_mismatch' }
        ];
        cases.forEach(function (c) {
            const req = { cookies: c.cookies, headers: c.headers, method: 'POST', originalUrl: '/api/login?x=secret' };
            const out = captureLogs(req, mockRes());
            expect(out.nextCalled).to.equal(true);
            expect(out.lines.length).to.equal(1);
            expect(out.lines[0]).to.contain("CSRF token missing/mismatched");
            expect(out.lines[0]).to.contain("reason=" + c.reason);
            expect(out.lines[0]).to.contain("POST /api/login");
            expect(out.lines[0]).to.not.contain("secret");
            expect(out.lines[0]).to.not.match(/cookietoken|hdrtoken|short/);
        });

        const dupReq = {
            cookies: { 'XSRF-TOKEN': 'cookietoken1' },
            headers: { 'x-xsrf-token': 'cookietoken2', cookie: 'XSRF-TOKEN=cookietoken1; x-thx-core=s; XSRF-TOKEN=cookietoken2' },
            method: 'POST',
            originalUrl: '/api/v2/session/token'
        };
        const dup = captureLogs(dupReq, mockRes());
        expect(dup.lines[0]).to.contain("xsrf_cookies=2");
        expect(dup.lines[0]).to.contain("duplicate_cookie=true");
        expect(dup.lines[0]).to.not.contain("cookietoken");
    });

    it("8. enforce mode logs exactly one reason-coded line per rejection (WR-01)", function () {
        process.env.CSRF_ENFORCE = 'true';
        const req = {
            cookies: { 'XSRF-TOKEN': 'cookietoken1' },
            headers: { 'x-xsrf-token': 'cookietoken2', cookie: 'XSRF-TOKEN=cookietoken1' },
            method: 'POST',
            originalUrl: '/api/v2/session/token'
        };
        const res = mockRes();
        const out = captureLogs(req, res);
        expect(out.nextCalled).to.equal(false);
        expect(res._status).to.equal(403);
        expect(out.lines.length).to.equal(1);
        expect(out.lines[0]).to.contain("CSRF token rejected");
        expect(out.lines[0]).to.contain("reason=value_mismatch");
        expect(out.lines[0]).to.contain("xsrf_cookies=1");
        expect(out.lines[0]).to.not.contain("duplicate_cookie");
        expect(out.lines[0]).to.contain("POST /api/v2/session/token");
        expect(out.lines[0]).to.not.contain("cookietoken");
    });

    it("9. cookieDomain() parses the api_url hostname and never throws (WR-02)", function () {
        const cases = [
            ["https://rtm.thinx.cloud", ".thinx.cloud"],   // production
            ["https://app.thinx.cloud", ".thinx.cloud"],   // spec config
            ["https://app.thinx.cloud/", ".thinx.cloud"],  // trailing slash used to yield ".thinx.cloud/"
            ["https://app.thinx.cloud:7443", ".thinx.cloud"], // port used to yield ".thinx.cloud:7443"
            ["https://app.thinx.cloud/api/v2", ".thinx.cloud"],
            ["app.thinx.cloud", ".thinx.cloud"],
            ["https://api.eu.thinx.cloud", ".eu.thinx.cloud"],
            ["https://thinx.cloud", undefined],            // two labels used to yield ".cloud"
            ["http://localhost:7443", undefined],
            ["http://127.0.0.1:7443", undefined],
            ["http://[::1]:7443", undefined],
            ["<enter-your-api-fqdn>", undefined],
            ["", undefined],
            [undefined, undefined],
            [null, undefined]
        ];
        cases.forEach(function (c) {
            const domain = CookiePolicy.cookieDomain(c[0]);
            expect(domain, String(c[0])).to.equal(c[1]);
            // whatever comes out must be accepted by the cookie serializer Express uses
            expect(function () { cookie.serialize("XSRF-TOKEN", "v", { domain: domain, path: "/" }); }, String(c[0])).to.not.throw();
        });
    });

    it("10. ensureXsrfCookie sets domain .thinx.cloud and path / for the bundled api_url (WR-02)", function (done) {
        const req = { cookies: {} };
        const res = mockRes();
        csrf.ensureXsrfCookie(req, res, function next() {
            expect(res._cookieCalls.length).to.equal(1);
            expect(res._cookieCalls[0].options.domain).to.equal(".thinx.cloud");
            expect(res._cookieCalls[0].options.path).to.equal("/");
            expect(res._cookieCalls[0].options.secure).to.equal(false);
            done();
        });
    });

    it("10b. ensureXsrfCookie still calls next() when res.cookie throws (WR-02)", function (done) {
        const req = { cookies: {} };
        const res = mockRes();
        res.cookie = function () { throw new TypeError("option domain is invalid"); };
        const originalLog = console.log;
        console.log = function () { };
        try {
            csrf.ensureXsrfCookie(req, res, function next() {
                console.log = originalLog;
                expect(res.locals.xsrfToken).to.equal(undefined);
                done();
            });
        } finally {
            console.log = originalLog;
        }
    });

    it("11. ensureXsrfCookie skips preflight, device, firmware and webhook traffic only (WR-03)", function () {
        function mints(req) {
            const res = mockRes();
            let nextCalled = false;
            csrf.ensureXsrfCookie(Object.assign({ cookies: {}, headers: {} }, req), res, function next() { nextCalled = true; });
            expect(nextCalled).to.equal(true);
            return res._cookieCalls.length === 1;
        }
        // not minted
        expect(mints({ method: "OPTIONS", path: "/api/v2/login" })).to.equal(false);
        expect(mints({ method: "POST", path: "/device/register", headers: { origin: "device" } })).to.equal(false);
        expect(mints({ method: "POST", path: "/api/v2/device", headers: { origin: "device" } })).to.equal(false);
        expect(mints({ method: "POST", path: "/device/register" })).to.equal(false);
        expect(mints({ method: "GET", path: "/device/firmware" })).to.equal(false);
        expect(mints({ method: "POST", path: "/Device/Firmware" })).to.equal(false);
        expect(mints({ method: "POST", path: "/githook" })).to.equal(false);
        expect(mints({ method: "POST", path: "/api/githook/" })).to.equal(false);
        // still minted: priming endpoints and console routes
        expect(mints({ method: "GET", path: "/api/csrf-token" })).to.equal(true);
        expect(mints({ method: "GET", path: "/api/v2/csrf-token", headers: { origin: "https://console.thinx.cloud" } })).to.equal(true);
        expect(mints({ method: "POST", path: "/api/v2/login" })).to.equal(true);
        expect(mints({ method: "POST", path: "/api/device/edit" })).to.equal(true);
        expect(mints({ method: "GET", path: "/api/v2/device" })).to.equal(true);
        expect(mints({ method: "GET", path: "/api/githooks" })).to.equal(true);
    });

    it("12. rotate() is a no-op in legacy and clear() drops the cookie with the mint's Domain and Path", function () {
        const res = mockRes();
        csrf.rotate({ sessionID: "sid-A", session: {} }, res);
        expect(res._cookieCalls.length).to.equal(0);
        csrf.clear(res);
        expect(res._clearCalls.length).to.equal(1);
        expect(res._clearCalls[0].name).to.equal("XSRF-TOKEN");
        expect(res._clearCalls[0].options).to.deep.equal({ domain: ".thinx.cloud", path: "/" });
    });
}

// A signed/observe mock request on session `sid` carrying `token` as cookie and header.
function boundReq(sid, token, overrides) {
    return Object.assign({
        cookies: { 'XSRF-TOKEN': token },
        headers: { 'x-xsrf-token': token, cookie: 'x-thx-core=s%3A' + sid + '.sig; XSRF-TOKEN=' + token },
        session: { csrf_pre: 1, cookie: {} },
        sessionID: sid,
        method: 'POST',
        originalUrl: '/api/v2/login'
    }, overrides || {});
}

describe("ZZ-CSRFSpec (SEC-CSRF-01/02)", function () {

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running SEC-CSRF-01/02 CSRF middleware spec`);
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed SEC-CSRF-01/02 CSRF middleware spec`);
    });

    beforeEach(function () {
        resetAll();
    });

    afterEach(function () {
        delete process.env.CSRF_ENFORCE;
        delete process.env.CSRF_MODE;
        delete process.env.CSRF_SECRET;
        resetAll();
    });

    describe("legacy, CSRF_MODE=legacy set explicitly (rollback contract, D-08)", function () {
        beforeEach(function () {
            process.env.CSRF_MODE = "legacy";
        });
        legacyCases();
    });

    describe("legacy, CSRF_MODE unset", function () {
        beforeEach(function () {
            delete process.env.CSRF_MODE;
        });
        legacyCases();
    });

    describe("legacy, CSRF_MODE unrecognised ('signd')", function () {
        beforeEach(function () {
            process.env.CSRF_MODE = "signd";
            // The warning is logged once per process (until the next reset).
            const lines = withCapturedLog(function () {
                expect(csrfFactory.mode()).to.equal("legacy");
                expect(csrfFactory.mode()).to.equal("legacy");
            });
            const warnings = lines.filter((l) => l.indexOf("CSRF_MODE=signd not recognised, using legacy") !== -1);
            expect(warnings.length).to.equal(1);
            expect(lines.length).to.equal(1);
        });
        legacyCases();
    });

    describe("mode()", function () {
        it("trims and lower-cases, and caps the logged unrecognised value at 32 characters", function () {
            process.env.CSRF_MODE = " Signed ";
            expect(csrfFactory.mode()).to.equal("signed");
            process.env.CSRF_MODE = "OBSERVE";
            expect(csrfFactory.mode()).to.equal("observe");
            process.env.CSRF_MODE = "";
            expect(csrfFactory.mode()).to.equal("legacy");
            process.env.CSRF_MODE = "x".repeat(100);
            const lines = withCapturedLog(function () {
                expect(csrfFactory.mode()).to.equal("legacy");
            });
            expect(lines.length).to.equal(1);
            expect(lines[0]).to.contain("x".repeat(32));
            expect(lines[0]).to.not.contain("x".repeat(33));
        });
    });

    describe("signed / observe (SEC-CSRF-02, D-17)", function () {

        beforeEach(function () {
            process.env.CSRF_MODE = "signed";
            process.env.CSRF_SECRET = SPEC_CSRF_SECRET;
            resetAll();
        });

        it("1s. a token bound to the request's session passes (next, no status)", function () {
            const token = csrfFactory.mint("sid-A");
            const res = mockRes();
            process.env.CSRF_ENFORCE = 'true';
            const out = captureLogs(boundReq("sid-A", token), res);
            expect(out.nextCalled).to.equal(true);
            expect(res._status).to.equal(null);
            expect(out.lines.length).to.equal(0);
        });

        it("4s. a token of another session is rejected 403 with reason binding_mismatch (enforced)", function () {
            process.env.CSRF_ENFORCE = 'true';
            const token = csrfFactory.mint("sid-B");
            const res = mockRes();
            const out = captureLogs(boundReq("sid-A", token), res);
            expect(out.nextCalled).to.equal(false);
            expect(res._status).to.equal(403);
            expect(JSON.parse(res._ended).response).to.equal("csrf_token_invalid");
            expect(out.lines.length).to.equal(1);
            expect(out.lines[0]).to.contain("CSRF binding rejected reason=binding_mismatch mode=signed xsrf_cookies=1 for POST /api/v2/login (enforced, 403)");
            expect(out.lines[0].indexOf(token)).to.equal(-1);
            expect(out.lines[0]).to.not.contain("sid-A");
            expect(out.lines[0]).to.not.contain("sid-B");
        });

        it("4s-observe. observe logs the binding failure and lets it through, even with CSRF_ENFORCE on", function () {
            process.env.CSRF_MODE = "observe";
            process.env.CSRF_ENFORCE = 'true';
            const token = csrfFactory.mint("sid-B");
            const res = mockRes();
            const out = captureLogs(boundReq("sid-A", token), res);
            expect(out.nextCalled).to.equal(true);
            expect(res._status).to.equal(null);
            expect(out.lines.length).to.equal(1);
            expect(out.lines[0]).to.contain("CSRF binding observed reason=binding_mismatch mode=observe");
            expect(out.lines[0].indexOf(token)).to.equal(-1);
            expect(out.lines[0]).to.not.contain("sid-A");
        });

        it("4s-failopen. signed without CSRF_ENFORCE logs the observed form and lets it through", function () {
            const token = csrfFactory.mint("sid-B");
            const res = mockRes();
            const out = captureLogs(boundReq("sid-A", token), res);
            expect(out.nextCalled).to.equal(true);
            expect(out.lines.length).to.equal(1);
            expect(out.lines[0]).to.contain("CSRF binding observed reason=binding_mismatch mode=signed");
            expect(out.lines[0]).to.contain("(fail-open, not enforced)");
        });

        it("4s-reasons. missing, session_mismatch and stale are reported with their own codes", function () {
            process.env.CSRF_ENFORCE = 'true';
            const token = csrfFactory.mint("sid-A");
            const legacyToken = crypto.randomBytes(24).toString("hex");
            const cases = [
                { req: boundReq("sid-A", token, { headers: { 'x-xsrf-token': token, cookie: 'XSRF-TOKEN=' + token } }), reason: "missing" },
                { req: boundReq("sid-A", token, { session: { cookie: {} } }), reason: "session_mismatch" },
                { req: boundReq("sid-A", legacyToken), reason: "stale" }
            ];
            cases.forEach(function (c) {
                const res = mockRes();
                const out = captureLogs(c.req, res);
                expect(res._status, c.reason).to.equal(403);
                expect(out.lines.length, c.reason).to.equal(1);
                expect(out.lines[0]).to.contain("reason=" + c.reason + " ");
                expect(out.lines[0].indexOf(token)).to.equal(-1);
                expect(out.lines[0].indexOf(legacyToken)).to.equal(-1);
                expect(out.lines[0]).to.not.contain("sid-A");
            });
        });

        it("4s-doublesubmit. the double-submit layer still runs first with its own reason codes", function () {
            process.env.CSRF_ENFORCE = 'true';
            const token = csrfFactory.mint("sid-A");
            const res = mockRes();
            const out = captureLogs(boundReq("sid-A", token, { headers: { cookie: 'x-thx-core=s%3Asid-A.sig' } }), res);
            expect(res._status).to.equal(403);
            expect(out.lines[0]).to.contain("CSRF token rejected reason=no_header");
        });

        it("5s. a cookieless request gets no mint and no session write", function () {
            ["signed", "observe"].forEach(function (m) {
                process.env.CSRF_MODE = m;
                const req = { cookies: {}, headers: {}, session: { cookie: {} }, sessionID: "sid-A", method: "GET", path: "/api/v2/device" };
                const res = mockRes();
                let nextCalled = false;
                csrf.ensureXsrfCookie(req, res, function next() { nextCalled = true; });
                expect(nextCalled, m).to.equal(true);
                expect(res._cookieCalls.length, m).to.equal(0);
                expect(req.session, m).to.deep.equal({ cookie: {} });
            });
        });

        it("6s. priming creates the pre-session and echoes the minted value", function () {
            const req = { cookies: {}, headers: {}, session: { cookie: {} }, sessionID: "sid-A", method: "GET" };
            const res = mockRes();
            csrf.issueCsrfToken(req, res);
            expect(req.session.csrf_pre).to.be.a("number");
            expect(req.session.cookie.maxAge).to.equal(15 * 60 * 1000);
            expect(res._cookieCalls.length).to.equal(1);
            const body = JSON.parse(res._ended);
            expect(body.csrf_token === res._cookieCalls[0].value, "echo equals Set-Cookie").to.equal(true);
            expect(SIGNED_SHAPE.test(body.csrf_token)).to.equal(true);
            expect(csrfFactory.check(body.csrf_token, "sid-A")).to.equal(null);
        });

        it("6s-stale. priming a persisted session re-mints a stale cookie and keeps the session lifetime", function () {
            const req = {
                cookies: { 'XSRF-TOKEN': crypto.randomBytes(24).toString("hex") },
                headers: {},
                session: { owner: "o", login_owner: "o", cookie: { maxAge: 8 * 3600 * 1000 } },
                sessionID: "sid-A",
                method: "GET"
            };
            const res = mockRes();
            csrf.issueCsrfToken(req, res);
            expect(req.session.csrf_pre).to.equal(undefined);
            expect(req.session.cookie.maxAge).to.equal(8 * 3600 * 1000);
            expect(res._cookieCalls.length).to.equal(1);
            expect(JSON.parse(res._ended).csrf_token === res._cookieCalls[0].value).to.equal(true);
        });

        it("6s-nokey. priming without a key answers 503 csrf_key_unavailable and writes no pre-session", function () {
            delete process.env.CSRF_SECRET;
            resetAll();
            csrfFactory._resetForTests({ sessionSecret: null });
            const req = { cookies: {}, headers: {}, session: { cookie: {} }, sessionID: "sid-A", method: "GET" };
            const res = mockRes();
            csrf.issueCsrfToken(req, res);
            expect(res._status).to.equal(503);
            expect(JSON.parse(res._ended).response).to.equal("csrf_key_unavailable");
            expect(req.session.csrf_pre).to.equal(undefined);
        });

        it("rotate() binds a new token to the (regenerated) session id", function () {
            const res = mockRes();
            csrf.rotate({ sessionID: "sid-new", session: {} }, res);
            expect(res._cookieCalls.length).to.equal(1);
            expect(csrfFactory.check(res._cookieCalls[0].value, "sid-new")).to.equal(null);
            expect(res.locals.xsrfToken === res._cookieCalls[0].value).to.equal(true);
        });
    });

    describe("key resolution (D-04)", function () {

        it("uses CSRF_SECRET when it is set (source secret)", function () {
            process.env.CSRF_SECRET = SPEC_CSRF_SECRET;
            expect(csrfFactory.keySource()).to.equal("secret");
            expect(csrfFactory.resolveKey().equals(Buffer.from(SPEC_CSRF_SECRET, "utf8"))).to.equal(true);
        });

        it("falls back to HKDF of the session secret, identical across resets (the redeploy proxy)", function () {
            expect(csrfFactory.keySource()).to.equal("hkdf");
            const first = csrfFactory.resolveKey();
            const token = csrfFactory.mint("sid-A");
            resetAll();
            const second = csrfFactory.resolveKey();
            expect(first.equals(second)).to.equal(true);
            expect(csrfFactory.check(token, "sid-A")).to.equal(null);
            const expected = Buffer.from(crypto.hkdfSync("sha256", SPEC_SESSION_SECRET, "thinx-csrf", "csrf-v1", 32));
            expect(second.equals(expected)).to.equal(true);

            csrfFactory._resetForTests({ sessionSecret: "another-session-secret" });
            const a = csrfFactory.resolveKey();
            csrfFactory._resetForTests({ sessionSecret: "another-session-secret" });
            expect(a.equals(csrfFactory.resolveKey())).to.equal(true);
            expect(a.equals(first)).to.equal(false);
        });

        it("resolves to none with no CSRF_SECRET and no session secret", function () {
            csrfFactory._resetForTests({ sessionSecret: null });
            expect(csrfFactory.resolveKey() === null, "no key resolved").to.equal(true);
            expect(csrfFactory.keySource()).to.equal("none");
        });

        it("assertReady() throws csrf_key_unavailable for observe and signed without a key, not for legacy", function () {
            ["observe", "signed"].forEach(function (m) {
                process.env.CSRF_MODE = m;
                csrfFactory._resetForTests({ sessionSecret: null });
                let thrown = null;
                const lines = withCapturedLog(function () {
                    try { csrfFactory.assertReady(); } catch (e) { thrown = e; }
                });
                expect(thrown, m).to.be.an("error");
                expect(thrown.message).to.equal("csrf_key_unavailable");
                expect(lines.join("\n")).to.contain("CRITICAL CSRF_MODE=" + m + " needs CSRF_SECRET or a session secret; refusing to start");
            });

            process.env.CSRF_MODE = "legacy";
            csrfFactory._resetForTests({ sessionSecret: null });
            const lines = withCapturedLog(function () {
                expect(function () { csrfFactory.assertReady(); }).to.not.throw();
            });
            expect(lines.length).to.equal(1);
            expect(lines[0]).to.contain("CSRF mode=legacy key_source=none enforce=false");
        });

        it("assertReady() logs one mode/key_source/enforce line and never the key; the factory exposes it too", function () {
            process.env.CSRF_MODE = "signed";
            process.env.CSRF_ENFORCE = "true";
            process.env.CSRF_SECRET = SPEC_CSRF_SECRET;
            const lines = withCapturedLog(function () {
                csrf.assertReady();
            });
            expect(lines.length).to.equal(1);
            expect(lines[0]).to.contain("CSRF mode=signed key_source=secret enforce=true");
            expect(lines[0]).to.not.contain(SPEC_CSRF_SECRET);
            expect(lines[0]).to.not.contain(csrfFactory.resolveKey().toString("hex"));
        });
    });

    describe("token boundaries and precision (SEC-CSRF-02)", function () {

        beforeEach(function () {
            process.env.CSRF_SECRET = SPEC_CSRF_SECRET;
            resetAll();
        });

        it("malformed shapes are stale; the exact shape with a wrong MAC is binding_mismatch", function () {
            const token = csrfFactory.mint("sid-A");
            const macPart = token.slice(0, 64);
            const nonce = token.slice(65);
            expect(csrfFactory.check(token, "sid-A")).to.equal(null);

            expect(csrfFactory.check(macPart.slice(0, 63) + "." + nonce, "sid-A")).to.equal("stale");       // dot at 63
            expect(csrfFactory.check(macPart + "0." + nonce, "sid-A")).to.equal("stale");                   // dot at 65
            expect(csrfFactory.check(crypto.randomBytes(24).toString("hex"), "sid-A")).to.equal("stale");  // 48-hex legacy
            expect(csrfFactory.check(token.toUpperCase(), "sid-A")).to.equal("stale");
            expect(csrfFactory.check(token + "0", "sid-A")).to.equal("stale");
            [undefined, null, 42, {}, [token]].forEach(function (v) {
                expect(csrfFactory.check(v, "sid-A")).to.equal("stale");
            });

            const flipped = (macPart[0] === "0" ? "1" : "0") + macPart.slice(1) + "." + nonce;
            expect(csrfFactory.check(flipped, "sid-A")).to.equal("binding_mismatch");
            expect(csrfFactory.check(token, "sid-B")).to.equal("binding_mismatch");
        });

        it("the MAC input is length-prefixed: shifting characters between sid and nonce never validates", function () {
            const token = csrfFactory.mint("ab");
            const macPart = token.slice(0, 64);
            const nonce = token.slice(65);
            expect(csrfFactory.check(token, "ab")).to.equal(null);
            expect(csrfFactory.check(token, "a")).to.equal("binding_mismatch");

            // Same MAC, the "b" moved from the sid into the nonce (shape kept at 32 hex).
            const shifted = macPart + "." + ("b" + nonce).slice(0, 32);
            expect(csrfFactory.check(shifted, "a")).to.equal("binding_mismatch");

            const key = csrfFactory.resolveKey();
            const prefixed = crypto.createHmac("sha256", key).update("2!ab!32!" + nonce).digest("hex");
            const naive = crypto.createHmac("sha256", key).update("ab" + nonce).digest("hex");
            expect(macPart === prefixed, "length-prefixed message").to.equal(true);
            expect(macPart === naive, "not a plain concatenation").to.equal(false);
        });
    });
});
