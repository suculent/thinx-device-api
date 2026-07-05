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
 * call (no-double-generation).
 */

// Force the lightweight bundled config path (spec/mnt/data/conf/config.json)
// so this spec never needs a real /mnt/data/conf mount or live services.
if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

var expect = require('chai').expect;

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

});
