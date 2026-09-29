/*
 * ZZ-CSRFRouteGuardSpec — SEC-CSRF-04 / SEC-CSRF-05 route guards under
 * CSRF_MODE=signed + CSRF_ENFORCE=true, against the real app (bootstrap.thx).
 *
 * CI only. Same harness as ZZ-CSRFEnforceSpec: both variables are set in
 * beforeAll and restored in afterAll (deleted when they were unset), so every
 * later spec runs in the default legacy, fail-open CI configuration. csrf.js
 * reads both per call. Cookies are forwarded by hand (their Domain is
 * .thinx.cloud, which no cookie jar replays to the local test server).
 *
 * WR-04 (POST /api/v2/user), no machine-client exemption (decision 2026-09-25):
 *   (W1) unprimed {} → 403 csrf_token_invalid; (W2) primed {} → email_required,
 *   so the request passed the CSRF layer; (W3) an unprimed POST for a fresh
 *   address is refused, and a primed POST for the same address then succeeds as
 *   a new registration (the guard is stateless and a refused request never
 *   reaches the handler).
 *
 * Plan 25-07 extends this file with the remaining D-11 account routes.
 *
 * Nothing here prints a token, cookie value or session id.
 */

const bootstrap = require('../helpers/bootstrap');

const chai = require('chai');
const expect = require('chai').expect;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

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

function responseOf(res) {
    try {
        return JSON.parse(res.text).response;
    } catch (_e) {
        return undefined;
    }
}

// Cold prime: a fresh pre-session plus its bound XSRF-TOKEN.
async function prime() {
    const res = await go(chai.request(thx.app).get('/api/v2/csrf-token'));
    expect(res.status).to.equal(200);
    const jar = absorb({}, res);
    expect(typeof (jar["x-thx-core"]) === "string", "prime sets x-thx-core").to.equal(true);
    expect(typeof (jar["XSRF-TOKEN"]) === "string", "prime sets XSRF-TOKEN").to.equal(true);
    return jar;
}

describe("ZZ-CSRFRouteGuardSpec (SEC-CSRF-04/05, CSRF_MODE=signed + CSRF_ENFORCE=true)", function () {

    beforeAll(() => {
        thx = bootstrap.thx;
        saved = {
            mode: process.env.CSRF_MODE,
            enforce: process.env.CSRF_ENFORCE
        };
        process.env.CSRF_MODE = "signed";
        process.env.CSRF_ENFORCE = "true";
        console.log(`🚸 [chai] >>> running ZZ-CSRFRouteGuardSpec (signed + enforce)`);
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
        console.log(`🚸 [chai] <<< completed ZZ-CSRFRouteGuardSpec`);
    });

    describe("WR-04: POST /api/v2/user", function () {

        it("W1. an unprimed POST {} without cookies answers 403 csrf_token_invalid", async function () {
            const res = await go(chai.request(thx.app).post('/api/v2/user').send({}));
            expect(res.status).to.equal(403);
            expect(responseOf(res)).to.equal("csrf_token_invalid");
        }, 30000);

        it("W2. a primed POST {} passes the CSRF layer and answers email_required", async function () {
            const jar = await prime();
            const res = await go(withJar(chai.request(thx.app).post('/api/v2/user'), jar)
                .set("X-XSRF-TOKEN", jar["XSRF-TOKEN"])
                .send({}));
            expect(responseOf(res)).to.not.equal("csrf_token_invalid");
            expect(responseOf(res)).to.equal("email_required");
        }, 30000);

        it("W3. an unprimed POST for a fresh address is refused, then a primed POST for it registers the account", async function () {
            const stamp = Date.now();
            const body = {
                first_name: "Wr04",
                last_name: "Spec",
                email: "p25-wr04-" + stamp + "@example.com",
                username: "p25-wr04-" + stamp
            };

            const refused = await go(chai.request(thx.app).post('/api/v2/user').send(body));
            expect(refused.status).to.equal(403);
            expect(responseOf(refused)).to.equal("csrf_token_invalid");

            const jar = await prime();
            const res = await go(withJar(chai.request(thx.app).post('/api/v2/user'), jar)
                .set("X-XSRF-TOKEN", jar["XSRF-TOKEN"])
                .send(body));
            expect(res.status).to.equal(200);
            const parsed = JSON.parse(res.text);
            expect(parsed.success, "new registration (not email_already_exists)").to.equal(true);
            expect(parsed.response).to.be.a("string");
            expect(/^[0-9a-f]{64}$/.test(parsed.response), "activation code shape").to.equal(true);
        }, 30000);
    });
});
