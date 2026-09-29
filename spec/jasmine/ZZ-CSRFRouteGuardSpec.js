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
 * SEC-CSRF-05 Tier 1 (D-09, D-10, D-11 same-handler twins): DELETE /api/v2/user,
 *   POST /api/user/delete, POST /api/v2/profile, POST /api/user/profile,
 *   DELETE /api/v2/gdpr, POST /api/gdpr/revoke. A logged-in cookie session
 *   without X-XSRF-TOKEN is refused on all six; with the rotated pair the
 *   request reaches the handler; a verified Bearer call passes without cookies
 *   or header; a repeated cookie-only call is refused every time.
 *
 * Non-destructive by construction: delete and revoke bodies carry a
 * non-matching all-zero owner, so the handlers refuse after the CSRF layer
 * (deleteUser: empty 403; revokeGDPR: deletion_not_confirmed). The logged-in
 * user's own owner id is never sent. Profile calls send {}.
 *
 * D-11 (plan 25-07): the credential, GitHub token, admin and device-transfer
 * mutations are refused cookie-only (403 csrf_token_invalid) and pass the CSRF
 * layer with a verified Bearer token.
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

// A 64-character owner id that never matches the logged-in session owner.
const ZERO_OWNER = "0000000000000000000000000000000000000000000000000000000000000000";

// [method, path, body] for the six SEC-CSRF-05 Tier 1 routes.
const TIER1 = [
    ["delete", "/api/v2/user", { owner: ZERO_OWNER }],
    ["post", "/api/user/delete", { owner: ZERO_OWNER }],
    ["post", "/api/v2/profile", {}],
    ["post", "/api/user/profile", {}],
    ["delete", "/api/v2/gdpr", { owner: ZERO_OWNER }],
    ["post", "/api/gdpr/revoke", { owner: ZERO_OWNER }]
];

// [method, path, body] for the twelve D-11 credential mutations (API keys,
// deploy keys, environment secrets). Bodies are {} so a request that slipped
// past the CSRF layer would still be refused by the handler's own validation.
// GET /api/user/rsakey/create is a state-changing GET, guarded like the POSTs.
const CREDENTIALS = [
    ["post", "/api/user/apikey", {}],
    ["post", "/api/user/apikey/revoke", {}],
    ["post", "/api/v2/apikey", {}],
    ["delete", "/api/v2/apikey", {}],
    ["put", "/api/v2/rsakey", {}],
    ["delete", "/api/v2/rsakey", {}],
    ["get", "/api/user/rsakey/create", null],
    ["post", "/api/user/rsakey/revoke", {}],
    ["put", "/api/v2/env", {}],
    ["delete", "/api/v2/env", {}],
    ["post", "/api/user/env/add", {}],
    ["post", "/api/user/env/revoke", {}]
];

// [method, path, body] for the remaining D-11 account mutations: GitHub token
// link, admin session revoke / impersonation / reactivation, device-ownership
// transfer POSTs. Never a real owner id or transfer id: admin paths carry the
// all-zero id and every body is {}.
const ACCOUNT_REST = [
    ["post", "/api/github/token", {}],
    ["post", "/api/v2/github/token", {}],
    ["delete", "/api/v2/admin/session/" + ZERO_OWNER, {}],
    ["post", "/api/v2/admin/impersonate", {}],
    ["post", "/api/v2/admin/user/" + ZERO_OWNER + "/reactivate", {}],
    ["post", "/api/v2/transfer/request", {}],
    ["post", "/api/v2/transfer/decline", {}],
    ["post", "/api/v2/transfer/accept", {}],
    ["post", "/api/transfer/request", {}],
    ["post", "/api/transfer/decline", {}],
    ["post", "/api/transfer/accept", {}]
];

// Cold prime: a fresh pre-session plus its bound XSRF-TOKEN.
async function prime() {
    const res = await go(chai.request(thx.app).get('/api/v2/csrf-token'));
    expect(res.status).to.equal(200);
    const jar = absorb({}, res);
    expect(typeof (jar["x-thx-core"]) === "string", "prime sets x-thx-core").to.equal(true);
    expect(typeof (jar["XSRF-TOKEN"]) === "string", "prime sets XSRF-TOKEN").to.equal(true);
    return jar;
}

// prime -> login dynamic/dynamic with the primed pair -> rotated pair + Bearer token.
async function loginDynamic() {
    const primed = await prime();
    const res = await go(withJar(chai.request(thx.app).post('/api/v2/login'), primed)
        .set("X-XSRF-TOKEN", primed["XSRF-TOKEN"])
        .send({ username: "dynamic", password: "dynamic", remember: false }));
    expect(res.status).to.equal(200);
    const jar = absorb(primed, res);
    expect(jar["XSRF-TOKEN"] !== primed["XSRF-TOKEN"], "XSRF-TOKEN rotated at login").to.equal(true);
    const accessToken = JSON.parse(res.text).access_token;
    expect(accessToken).to.be.a("string");
    return { jar, accessToken };
}

// Sends the body unless it is null (GET routes).
function sendBody(request, body) {
    return (body === null) ? request : request.send(body);
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

    describe("SEC-CSRF-05: Tier 1 account routes", function () {

        let loggedJar;    // rotated x-thx-core + XSRF-TOKEN after login
        let accessToken;  // Bearer token from the same login

        // prime -> login dynamic/dynamic with the primed pair -> rotated pair
        beforeAll(async () => {
            const primed = await prime();
            const res = await go(withJar(chai.request(thx.app).post('/api/v2/login'), primed)
                .set("X-XSRF-TOKEN", primed["XSRF-TOKEN"])
                .send({ username: "dynamic", password: "dynamic", remember: false }));
            expect(res.status).to.equal(200);
            loggedJar = absorb(primed, res);
            expect(loggedJar["XSRF-TOKEN"] !== primed["XSRF-TOKEN"], "XSRF-TOKEN rotated at login").to.equal(true);
            accessToken = JSON.parse(res.text).access_token;
            expect(accessToken).to.be.a("string");
        }, 30000);

        function call(method, route, jar) {
            return withJar(chai.request(thx.app)[method](route), jar);
        }

        TIER1.forEach(([method, route, body]) => {
            it("T1. cookie session without X-XSRF-TOKEN: " + method.toUpperCase() + " " + route + " answers 403 csrf_token_invalid", async function () {
                const res = await go(call(method, route, loggedJar).send(body));
                expect(res.status).to.equal(403);
                expect(responseOf(res)).to.equal("csrf_token_invalid");
            }, 30000);
        });

        it("T2. rotated pair: DELETE /api/v2/user and POST /api/user/delete with a non-matching owner reach the handler (empty 403)", async function () {
            for (const [method, route] of [["delete", "/api/v2/user"], ["post", "/api/user/delete"]]) {
                const res = await go(call(method, route, loggedJar)
                    .set("X-XSRF-TOKEN", loggedJar["XSRF-TOKEN"])
                    .send({ owner: ZERO_OWNER }));
                expect(res.status, method + " " + route).to.equal(403);
                expect(responseOf(res), method + " " + route).to.not.equal("csrf_token_invalid");
                expect(res.text || "", method + " " + route + " handler refusal has an empty body").to.equal("");
            }
        }, 30000);

        it("T3. rotated pair: POST /api/gdpr/revoke and DELETE /api/v2/gdpr with a non-matching owner answer deletion_not_confirmed", async function () {
            for (const [method, route] of [["post", "/api/gdpr/revoke"], ["delete", "/api/v2/gdpr"]]) {
                const res = await go(call(method, route, loggedJar)
                    .set("X-XSRF-TOKEN", loggedJar["XSRF-TOKEN"])
                    .send({ owner: ZERO_OWNER }));
                expect(responseOf(res), method + " " + route).to.equal("deletion_not_confirmed");
            }
        }, 30000);

        it("T4. rotated pair: POST /api/v2/profile {} passes the CSRF layer twice in a row, and POST /api/user/profile {} once (idempotency edge)", async function () {
            for (const route of ["/api/v2/profile", "/api/v2/profile", "/api/user/profile"]) {
                const res = await go(call("post", route, loggedJar)
                    .set("X-XSRF-TOKEN", loggedJar["XSRF-TOKEN"])
                    .send({}));
                expect(responseOf(res), route).to.not.equal("csrf_token_invalid");
            }
        }, 30000);

        it("T5. verified Bearer, no cookies, no header: DELETE /api/v2/user (non-matching owner) and POST /api/v2/profile {} pass the CSRF layer (D-09)", async function () {
            const del = await go(chai.request(thx.app).delete('/api/v2/user')
                .set("Authorization", "Bearer " + accessToken)
                .send({ owner: ZERO_OWNER }));
            expect(responseOf(del)).to.not.equal("csrf_token_invalid");
            const prof = await go(chai.request(thx.app).post('/api/v2/profile')
                .set("Authorization", "Bearer " + accessToken)
                .send({}));
            expect(responseOf(prof)).to.not.equal("csrf_token_invalid");
        }, 30000);

        it("T6. a cookie-only POST /api/v2/profile repeated twice is refused both times", async function () {
            for (let i = 0; i < 2; i++) {
                const res = await go(call("post", "/api/v2/profile", loggedJar).send({}));
                expect(res.status, "attempt " + (i + 1)).to.equal(403);
                expect(responseOf(res), "attempt " + (i + 1)).to.equal("csrf_token_invalid");
            }
        }, 30000);
    });

    describe("SEC-CSRF-05 / D-11: credential routes (API keys, deploy keys, environment secrets)", function () {

        let loggedJar;
        let accessToken;

        beforeAll(async () => {
            const session = await loginDynamic();
            loggedJar = session.jar;
            accessToken = session.accessToken;
        }, 30000);

        CREDENTIALS.forEach(([method, route, body]) => {
            it("C1. cookie session without X-XSRF-TOKEN: " + method.toUpperCase() + " " + route + " answers 403 csrf_token_invalid", async function () {
                const res = await go(sendBody(withJar(chai.request(thx.app)[method](route), loggedJar), body));
                expect(res.status).to.equal(403);
                expect(responseOf(res)).to.equal("csrf_token_invalid");
            }, 30000);
        });

        it("C2. verified Bearer, no cookies, no header: POST /api/v2/apikey, DELETE /api/v2/rsakey and PUT /api/v2/env pass the CSRF layer (D-09)", async function () {
            const calls = [
                ["post", "/api/v2/apikey", { alias: "p25-ci" }],
                ["delete", "/api/v2/rsakey", { filenames: [] }],
                ["put", "/api/v2/env", { name: "P25_CI", value: "x" }]
            ];
            for (const [method, route, body] of calls) {
                const res = await go(chai.request(thx.app)[method](route)
                    .set("Authorization", "Bearer " + accessToken)
                    .send(body));
                expect(responseOf(res), method + " " + route).to.not.equal("csrf_token_invalid");
            }
        }, 30000);

        it("C3. rotated pair: the state-changing GET /api/user/rsakey/create passes the CSRF layer", async function () {
            const res = await go(withJar(chai.request(thx.app).get('/api/user/rsakey/create'), loggedJar)
                .set("X-XSRF-TOKEN", loggedJar["XSRF-TOKEN"]));
            expect(responseOf(res)).to.not.equal("csrf_token_invalid");
        }, 30000);
    });

    describe("SEC-CSRF-05 / D-11: GitHub token link, admin mutations, device-transfer POSTs", function () {

        let loggedJar;
        let accessToken;

        beforeAll(async () => {
            const session = await loginDynamic();
            loggedJar = session.jar;
            accessToken = session.accessToken;
        }, 30000);

        ACCOUNT_REST.forEach(([method, route, body]) => {
            it("A1. cookie session without X-XSRF-TOKEN: " + method.toUpperCase() + " " + route.replace(ZERO_OWNER, "<zero>") + " answers 403 csrf_token_invalid", async function () {
                const res = await go(withJar(chai.request(thx.app)[method](route), loggedJar).send(body));
                expect(res.status).to.equal(403);
                expect(responseOf(res)).to.equal("csrf_token_invalid");
            }, 30000);
        });

        it("A2. verified Bearer of the non-admin user, no cookies, no header: POST /api/v2/admin/impersonate is refused by requireAdmin, not by the CSRF layer", async function () {
            const res = await go(chai.request(thx.app).post('/api/v2/admin/impersonate')
                .set("Authorization", "Bearer " + accessToken)
                .send({}));
            expect(res.status).to.equal(403);
            expect(responseOf(res)).to.not.equal("csrf_token_invalid");
        }, 30000);

        it("A3. verified Bearer, no cookies, no header: POST /api/v2/transfer/decline {} passes the CSRF layer and answers transfer_id_missing", async function () {
            const res = await go(chai.request(thx.app).post('/api/v2/transfer/decline')
                .set("Authorization", "Bearer " + accessToken)
                .send({}));
            expect(responseOf(res)).to.not.equal("csrf_token_invalid");
            expect(responseOf(res)).to.equal("transfer_id_missing");
        }, 30000);
    });
});
