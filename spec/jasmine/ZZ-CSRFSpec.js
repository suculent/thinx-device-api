/*
 * ZZ-CSRFSpec.js — SEC-CSRF-01 regression spec
 *
 * Unit-tests `lib/middleware/csrf.js` (double-submit anti-CSRF token) in
 * isolation against mock req/res objects. Deliberately does NOT boot the
 * full THiNX app (no CouchDB/Redis dependency) — csrf.js only needs
 * `app_config.api_url` / `app_config.debug.csrf_enforce`, resolved from the
 * bundled `spec/mnt/data/conf/config.json`, which is already CI/local-safe.
 *
 * Covers: (1) matching cookie/header -> next(); (2) missing header,
 * fail-open -> next() + warning log; (3) missing header, enforce -> 403;
 * (4) forged header, enforce -> 403; (5) ensureXsrfCookie mints a fresh
 * cookie only when none present; (6) issueCsrfToken echoes the
 * already-minted token WITHOUT a second Set-Cookie / second randomBytes
 * call (no-double-generation); (7) fail-open log carries a reason code and
 * duplicate-cookie count, never token values; (8) enforce mode logs one
 * reason-coded line per rejection; (9) cookie Domain derivation never
 * throws and keeps ".thinx.cloud" for the production api_url; (10) the minted
 * cookie carries that domain and path "/".
 */

// Force the lightweight bundled config path (spec/mnt/data/conf/config.json)
// so this spec never needs a real /mnt/data/conf mount or live services.
if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

var expect = require('chai').expect;

const cookie = require("cookie");
const CookiePolicy = require("../../lib/middleware/cookie-policy");
const csrfFactory = require("../../lib/middleware/csrf");
const csrf = csrfFactory({}); // no app.* members are used by this middleware

function mockRes() {
    const res = {
        locals: {},
        _cookieCalls: [],
        _status: null,
        _ended: null
    };
    res.cookie = function (name, value, options) {
        res._cookieCalls.push({ name: name, value: value, options: options });
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

describe("ZZ-CSRFSpec (SEC-CSRF-01)", function () {

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running SEC-CSRF-01 CSRF middleware spec`);
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed SEC-CSRF-01 CSRF middleware spec`);
    });

    afterEach(function () {
        delete process.env.CSRF_ENFORCE;
    });

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
        csrf.verifyCsrfToken(req, res, function next() { nextCalled = true; });
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
        csrf.verifyCsrfToken(req, res, function next() { nextCalled = true; });
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
            expect(body.csrf_token).to.equal(mintedToken);
            done();
        });
    });

    // Runs verifyCsrfToken and returns every console.log line it emitted.
    function captureLogs(req, res) {
        const originalLog = console.log;
        const lines = [];
        let nextCalled = false;
        console.log = function (msg) {
            lines.push(String(msg));
        };
        try {
            csrf.verifyCsrfToken(req, res, function next() { nextCalled = true; });
        } finally {
            console.log = originalLog;
        }
        return { lines: lines, nextCalled: nextCalled };
    }

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

});
