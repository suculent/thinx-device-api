/*
 * ZZ-CORSSpec.js — SEC-CORS-01 regression spec
 *
 * Unit-tests `lib/middleware/cors.js` (origin-allowlisted CORS headers) and
 * `lib/thinx/origins.js` (shared allowlist) in isolation against mock req/res
 * objects, mirroring ZZ-CSRFSpec.js. Config resolves from the bundled
 * `spec/mnt/data/conf/config.json` (public_url = https://rtm.thinx.cloud).
 *
 * Background: the previous enforceACLHeaders() reflected ANY browser Origin
 * into Access-Control-Allow-Origin together with Allow-Credentials: true
 * (OX "CORS Reflect Origin"). The allowlist only ran when Origin was absent,
 * which is the one case where CORS does not matter.
 *
 * Contract:
 *  - Origin in allowlist (CORS_ALLOWED_ORIGINS + public_url) -> echoed + Vary
 *  - Origin NOT in allowlist, enforced -> no CORS headers (browser blocks)
 *  - Origin NOT in allowlist, fail-open (default) -> reflected + warning logged
 *  - No Origin header -> no CORS headers, never '*'
 *  - Origin: device -> no CORS headers (device API calls carry no CORS/CSRF)
 *  - /device/ path prefix -> no CORS headers regardless of Origin
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

var expect = require('chai').expect;

const origins = require("../../lib/thinx/origins");
const corsFactory = require("../../lib/middleware/cors");
const cors = corsFactory({});

const CORS_HEADERS = [
    "Access-Control-Allow-Origin",
    "Access-Control-Allow-Credentials",
    "Access-Control-Allow-Methods",
    "Access-Control-Allow-Headers",
    "Vary"
];

function mockRes() {
    const res = { _headers: {} };
    res.header = function (name, value) {
        res._headers[name] = value;
        return res;
    };
    return res;
}

function mockReq(origin, path) {
    const req = {
        headers: {},
        method: "GET",
        path: path || "/api/user/devices"
    };
    req.originalUrl = req.path;
    if (typeof origin !== "undefined") req.headers.origin = origin;
    return req;
}

function expectNoCorsHeaders(res) {
    CORS_HEADERS.forEach((h) => {
        expect(res._headers, "unexpected header " + h).to.not.have.property(h);
    });
}

describe("ZZ-CORSSpec (SEC-CORS-01)", function () {

    let warnings;
    let originalWarn;

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running SEC-CORS-01 CORS middleware spec`);
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed SEC-CORS-01 CORS middleware spec`);
    });

    beforeEach(function () {
        warnings = [];
        originalWarn = console.warn;
        console.warn = function () { warnings.push(Array.prototype.join.call(arguments, " ")); };
        process.env.CORS_ALLOWED_ORIGINS = "https://console.thinx.cloud, https://other.example/";
    });

    afterEach(function () {
        console.warn = originalWarn;
        delete process.env.CORS_ALLOWED_ORIGINS;
        delete process.env.CORS_ENFORCE;
    });

    describe("origins allowlist", function () {

        it("1. merges CORS_ALLOWED_ORIGINS with public_url, trimmed and without trailing slash", function () {
            const list = origins.allowedOrigins();
            expect(list).to.include("https://console.thinx.cloud");
            expect(list).to.include("https://other.example");
            expect(list).to.include("https://rtm.thinx.cloud");
            expect(list).to.not.include("https://other.example/");
        });

        it("2. isAllowed() accepts allowlisted origins (trailing slash tolerated) and rejects others", function () {
            expect(origins.isAllowed("https://console.thinx.cloud")).to.equal(true);
            expect(origins.isAllowed("https://console.thinx.cloud/")).to.equal(true);
            expect(origins.isAllowed("https://rtm.thinx.cloud")).to.equal(true);
            expect(origins.isAllowed("https://evil.example")).to.equal(false);
            expect(origins.isAllowed("https://console.thinx.cloud.evil.example")).to.equal(false);
            expect(origins.isAllowed("null")).to.equal(false);
            expect(origins.isAllowed("")).to.equal(false);
            expect(origins.isAllowed(undefined)).to.equal(false);
        });

        it("3. isEnforced() is fail-open by default and flips with CORS_ENFORCE=true", function () {
            expect(origins.isEnforced()).to.equal(false);
            process.env.CORS_ENFORCE = "true";
            expect(origins.isEnforced()).to.equal(true);
        });
    });

    describe("enforceACLHeaders", function () {

        it("4. allowlisted Origin -> echoed with Vary: Origin, credentials, methods and headers", function () {
            const req = mockReq("https://console.thinx.cloud");
            const res = mockRes();
            cors.enforceACLHeaders(res, req);
            expect(res._headers["Access-Control-Allow-Origin"]).to.equal("https://console.thinx.cloud");
            expect(res._headers["Vary"]).to.equal("Origin");
            expect(res._headers["Access-Control-Allow-Credentials"]).to.equal("true");
            expect(res._headers["Access-Control-Allow-Methods"]).to.equal("GET,PUT,POST,DELETE,OPTIONS");
            expect(res._headers["Access-Control-Allow-Headers"]).to.equal("Content-type,Accept,X-Access-Token,X-Key,X-XSRF-TOKEN");
            expect(warnings.length).to.equal(0);
        });

        it("5. foreign Origin, enforced -> no CORS headers at all", function () {
            process.env.CORS_ENFORCE = "true";
            const req = mockReq("https://evil.example");
            const res = mockRes();
            cors.enforceACLHeaders(res, req);
            expectNoCorsHeaders(res);
            expect(warnings.length).to.equal(1);
            expect(warnings[0]).to.contain("https://evil.example");
        });

        it("6. foreign Origin, fail-open (default) -> reflected but warning logged", function () {
            const req = mockReq("https://evil.example");
            const res = mockRes();
            cors.enforceACLHeaders(res, req);
            expect(res._headers["Access-Control-Allow-Origin"]).to.equal("https://evil.example");
            expect(res._headers["Vary"]).to.equal("Origin");
            expect(warnings.length).to.equal(1);
            expect(warnings[0]).to.contain("https://evil.example");
        });

        it("7. no Origin header -> no CORS headers, never '*'", function () {
            const req = mockReq(undefined);
            const res = mockRes();
            cors.enforceACLHeaders(res, req);
            expectNoCorsHeaders(res);
            expect(warnings.length).to.equal(0);
        });

        it("8. Origin: device on a non-device route -> no CORS headers", function () {
            process.env.CORS_ENFORCE = "true";
            const req = mockReq("device");
            const res = mockRes();
            cors.enforceACLHeaders(res, req);
            expectNoCorsHeaders(res);
            expect(warnings.length).to.equal(0);
        });

        it("9. /device/ routes -> no CORS headers even for an allowlisted Origin", function () {
            ["/device/register", "/device/firmware"].forEach((p) => {
                const req = mockReq("https://console.thinx.cloud", p);
                const res = mockRes();
                cors.enforceACLHeaders(res, req);
                expectNoCorsHeaders(res);
            });
        });

        it("10. allowlisted Origin with trailing slash -> echoed normalized", function () {
            const req = mockReq("https://console.thinx.cloud/");
            const res = mockRes();
            cors.enforceACLHeaders(res, req);
            expect(res._headers["Access-Control-Allow-Origin"]).to.equal("https://console.thinx.cloud");
        });
    });
});
