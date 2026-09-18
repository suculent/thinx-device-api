/*
 * SEC-PROXY-01 / CSRF-COOKIE-01 — cookie Secure-flag policy and trust-proxy resolution.
 *
 * Context (2026-09-18): PR #552 (ox-security[bot] autofix) flipped every cookie to
 * `secure: true`. That is wrong in two different ways and this spec pins both:
 *
 *   1. express-session REFUSES to emit Set-Cookie when `cookie.secure` is truthy and
 *      the connection is not secure (express-session/index.js:242). The API terminates
 *      plain HTTP — TLS is unwrapped in Traefik — so a hardcoded `true` silently kills
 *      login. This already happened once in production; see OAUTH-COOKIE-01 in
 *      ZZ-CookieAttributeSpec.js for the 2026-06-19 HAR.
 *
 *   2. `req.secure` is only true when `trust proxy` accepts the Traefik hop. Traefik
 *      reaches the API over the traefik-public overlay (10.0.1.95 -> 10.0.1.48), so the
 *      old `['loopback','127.0.0.1']` allowlist never matched and X-Forwarded-Proto was
 *      being discarded — which ALSO collapsed express-rate-limit into a single global
 *      bucket keyed on Traefik's address.
 *
 * Unlike the ZZ-* specs these tests mount the real middleware on a bare express app, so
 * they need neither Redis nor CouchDB and run locally.
 */

const express = require("express");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const http = require("http");
const chai = require("chai");
const expect = chai.expect;

// Issue one request against `app` and hand back the Set-Cookie array plus parsed body.
function request(app, headers) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app).listen(0, "127.0.0.1", () => {
            const req = http.get({
                host: "127.0.0.1",
                port: server.address().port,
                path: "/probe",
                headers: headers || {}
            }, (res) => {
                let body = "";
                res.on("data", (chunk) => { body += chunk; });
                res.on("end", () => {
                    server.close(() => resolve({
                        setCookie: res.headers["set-cookie"] || [],
                        body: body ? JSON.parse(body) : null
                    }));
                });
            });
            req.on("error", (e) => { server.close(); reject(e); });
        });
    });
}

function cookieNamed(setCookie, name) {
    return setCookie.find((c) => c.indexOf(name + "=") === 0);
}

describe("CookiePolicySpec", function () {

    describe("CSRF-COOKIE-01 — XSRF-TOKEN Secure flag tracks req.secure", function () {

        function csrfApp() {
            const app = express();
            // Trust loopback so an X-Forwarded-Proto sent by this spec is honoured,
            // standing in for the Traefik hop.
            app.set("trust proxy", ["loopback"]);
            app.use(cookieParser());
            const csrf = require("../../lib/middleware/csrf")(app);
            app.use(csrf.ensureXsrfCookie);
            app.get("/probe", (req, res) => res.json({ secure: req.secure }));
            return app;
        }

        it("omits Secure when the request arrives over plain HTTP", async function () {
            const res = await request(csrfApp());
            const xsrf = cookieNamed(res.setCookie, "XSRF-TOKEN");
            expect(xsrf, "XSRF-TOKEN must still be issued over plain HTTP").to.be.a("string");
            expect(res.body.secure).to.equal(false);
            expect(xsrf).to.not.match(/;\s*Secure/i);
        });

        it("sets Secure when a trusted proxy reports X-Forwarded-Proto: https", async function () {
            const res = await request(csrfApp(), { "X-Forwarded-Proto": "https" });
            const xsrf = cookieNamed(res.setCookie, "XSRF-TOKEN");
            expect(xsrf, "XSRF-TOKEN must be issued behind the proxy too").to.be.a("string");
            expect(res.body.secure).to.equal(true);
            expect(xsrf).to.match(/;\s*Secure/i);
        });
    });
});

describe("CookiePolicySpec — trust proxy and session cookie", function () {

    const proxyaddr = require("proxy-addr");
    const CookiePolicy = require("../../lib/middleware/cookie-policy");

    describe("SEC-PROXY-01 — trustedProxy() resolution", function () {

        let saved;
        beforeEach(function () { saved = process.env.TRUSTED_PROXY; delete process.env.TRUSTED_PROXY; });
        afterEach(function () {
            if (typeof (saved) === "undefined") delete process.env.TRUSTED_PROXY;
            else process.env.TRUSTED_PROXY = saved;
        });

        // The regression that motivated this file: the previous default was
        // ['loopback','127.0.0.1'], which never matches Traefik on the overlay,
        // so X-Forwarded-Proto was silently discarded in production.
        it("default trusts the traefik-public overlay but not the ingress mesh or the public internet", function () {
            const trust = proxyaddr.compile(CookiePolicy.trustedProxy({}));
            expect(trust("10.0.1.95", 0), "Traefik on traefik-public must be trusted").to.equal(true);
            expect(trust("::ffff:10.0.1.95", 0), "IPv4-mapped form must be trusted").to.equal(true);
            expect(trust("127.0.0.1", 0), "loopback stays trusted for in-container and test traffic").to.equal(true);
            expect(trust("10.0.0.2", 0), "swarm ingress gateway (direct :7442) must NOT be trusted").to.equal(false);
            expect(trust("203.0.113.5", 0), "public clients must NOT be trusted").to.equal(false);
        });

        it("accepts a string from app_config", function () {
            expect(CookiePolicy.trustedProxy({ trusted_proxy: "10.9.0.0/16" })).to.deep.equal(["10.9.0.0/16"]);
        });

        it("accepts an array from app_config", function () {
            expect(CookiePolicy.trustedProxy({ trusted_proxy: ["loopback", "10.9.0.0/16"] }))
                .to.deep.equal(["loopback", "10.9.0.0/16"]);
        });

        it("lets TRUSTED_PROXY override app_config, comma-separated", function () {
            process.env.TRUSTED_PROXY = "loopback, 10.9.0.0/16";
            expect(CookiePolicy.trustedProxy({ trusted_proxy: "10.0.1.0/24" }))
                .to.deep.equal(["loopback", "10.9.0.0/16"]);
        });

        it("ignores an empty TRUSTED_PROXY and falls back to app_config", function () {
            process.env.TRUSTED_PROXY = "";
            expect(CookiePolicy.trustedProxy({ trusted_proxy: "10.9.0.0/16" })).to.deep.equal(["10.9.0.0/16"]);
        });

        // express-rate-limit 8.x throws ERR_ERL_PERMISSIVE_TRUST_PROXY on `true`,
        // and `true` would also let any direct :7442 client forge X-Forwarded-For.
        it("never resolves to the permissive boolean true", function () {
            expect(CookiePolicy.trustedProxy({ trusted_proxy: true })).to.be.an("array");
            expect(CookiePolicy.trustedProxy({})).to.be.an("array");
        });
    });

    describe("SEC-COOKIE-02 — session cookie Secure flag is negotiated, never hardcoded", function () {

        it("uses 'auto' for secure and keeps sameSite literally 'lax'", function () {
            const c = CookiePolicy.sessionCookie({ domain: ".thinx.cloud", maxAge: 3600000 });
            // 'auto' lets express-session decide per connection (index.js:165).
            expect(c.secure).to.equal("auto");
            // sameSite must NOT be 'auto' — that would flip it to 'none' whenever
            // secure resolves true (index.js:169), which is not the intent.
            expect(c.sameSite).to.equal("lax");
            expect(c.httpOnly).to.equal(true);
            expect(c.domain).to.equal(".thinx.cloud");
            expect(c.maxAge).to.equal(3600000);
        });

        function sessionApp() {
            const app = express();
            app.set("trust proxy", CookiePolicy.trustedProxy({}));
            app.use(session({
                secret: "cookie-policy-spec",
                name: "x-thx-core",
                store: new session.MemoryStore(),
                resave: true,
                rolling: true,
                saveUninitialized: false,
                cookie: CookiePolicy.sessionCookie({ domain: ".thinx.cloud", maxAge: 3600000 })
            }));
            app.get("/probe", (req, res) => { req.session.uid = "spec"; res.json({ secure: req.secure }); });
            return app;
        }

        // Direct bait for PR #552: a hardcoded `secure: true` makes express-session
        // drop the Set-Cookie header entirely here, so login stops working.
        it("still emits Set-Cookie over plain HTTP, without Secure", async function () {
            const res = await request(sessionApp());
            const core = cookieNamed(res.setCookie, "x-thx-core");
            expect(core, "plain HTTP login must still establish a session").to.be.a("string");
            expect(res.body.secure).to.equal(false);
            expect(core).to.not.match(/;\s*Secure/i);
            expect(core).to.match(/;\s*HttpOnly/i);
        });

        it("emits Set-Cookie with Secure when a trusted proxy reports X-Forwarded-Proto: https", async function () {
            const res = await request(sessionApp(), { "X-Forwarded-Proto": "https" });
            const core = cookieNamed(res.setCookie, "x-thx-core");
            expect(core, "proxied login must establish a session too").to.be.a("string");
            expect(res.body.secure).to.equal(true);
            expect(core).to.match(/;\s*Secure/i);
        });
    });
});

/*
 * SEC-COOKIE-04 — static parse-gate over thinx-core.js.
 *
 * thinx-core.js can only be exercised behaviourally by the ZZ-* specs, which need
 * Redis and CouchDB and therefore only run in CI. This gate is the locally
 * authoritative check (same pattern as SEC-COOKIE-01): it re-reads the source and
 * fails the moment a hardcoded Secure flag or a permissive trust-proxy value comes
 * back. PR #552 would have been caught here.
 */
describe("SEC-COOKIE-04 — thinx-core.js cookie configuration parse-gate", function () {

    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(path.join(__dirname, "..", "..", "thinx-core.js"), "utf8");

    it("hardcodes no cookie Secure flag", function () {
        const hardcoded = source.match(/secure:\s*(true|false)/g) || [];
        expect(hardcoded, "cookie.secure must be negotiated via CookiePolicy.sessionCookie(), not hardcoded")
            .to.deep.equal([]);
    });

    it("builds both session cookies through CookiePolicy.sessionCookie()", function () {
        expect(source).to.match(/require\(["']\.\/lib\/middleware\/cookie-policy["']\)/);
        const uses = source.match(/CookiePolicy\.sessionCookie\(/g) || [];
        expect(uses.length, "expected the x-thx-core and x-thx-wscore cookies to share the policy")
            .to.equal(2);
    });

    it("derives trust proxy from CookiePolicy.trustedProxy() and never from the permissive boolean", function () {
        expect(source).to.match(/app\.set\(\s*['"]trust proxy['"]\s*,\s*CookiePolicy\.trustedProxy\(/);
        expect(source).to.not.match(/app\.set\(\s*['"]trust proxy['"]\s*,\s*true\s*\)/);
    });
});

/*
 * SEC-COOKIE-05 — `secure: 'auto'` is resolved once, at session creation.
 *
 * Characterization test for express-session, not for our code: store.generate()
 * (index.js:165) resolves 'auto' when a session is CREATED, while
 * Store.createSession() (session/store.js:86) rehydrates a stored session's
 * cookie verbatim. So a session established over plain HTTP keeps secure:false
 * for its whole life, even on later requests that arrive through the proxy.
 *
 * Pinned here because SEC-COOKIE-03 in ZZ-CookieAttributeSpec.js depends on it:
 * that spec must use a fresh agent, or it would load the plain-HTTP session
 * SEC-COOKIE-01 created and see no Secure attribute. The ZZ tier cannot run
 * locally (it needs Redis and CouchDB), so the assumption is guarded here.
 *
 * It also documents the graceful-rollout property relied on when this shipped:
 * sessions minted before the change keep their persisted flag until maxAge,
 * so nobody is logged out.
 */
describe("SEC-COOKIE-05 — 'auto' is evaluated at session creation only", function () {

    const CookiePolicy = require("../../lib/middleware/cookie-policy");

    function sharedStoreApp() {
        const app = express();
        app.set("trust proxy", CookiePolicy.trustedProxy({}));
        app.use(session({
            secret: "cookie-policy-spec-05",
            name: "x-thx-core",
            store: new session.MemoryStore(),
            resave: true,
            rolling: true,
            saveUninitialized: false,
            cookie: CookiePolicy.sessionCookie({ domain: ".thinx.cloud", maxAge: 3600000 })
        }));
        app.get("/probe", (req, res) => { req.session.uid = "spec"; res.json({ secure: req.secure }); });
        return app;
    }

    function cookieValue(setCookieEntry) {
        return setCookieEntry.split(";")[0];
    }

    it("keeps secure:false on a session created over plain HTTP, even once proxied", async function () {
        const app = sharedStoreApp();

        const first = await request(app);
        const plain = cookieNamed(first.setCookie, "x-thx-core");
        expect(plain, "plain HTTP must establish a session").to.be.a("string");
        expect(plain).to.not.match(/;\s*Secure/i);

        // Same session, now arriving through a trusted proxy reporting https.
        const second = await request(app, {
            "X-Forwarded-Proto": "https",
            "Cookie": cookieValue(plain)
        });
        expect(second.body.secure, "the request itself is secure").to.equal(true);

        const reissued = cookieNamed(second.setCookie, "x-thx-core");
        expect(reissued, "rolling:true must re-emit the cookie").to.be.a("string");
        // The rehydrated session keeps the flag it was born with.
        expect(reissued).to.not.match(/;\s*Secure/i);
    });

    it("gives a brand-new proxied session the Secure attribute", async function () {
        // Same app and store, but no inbound Cookie -> a new session is generated,
        // so 'auto' is resolved against this request. This is why SEC-COOKIE-03
        // needs its own agent.
        const app = sharedStoreApp();
        const res = await request(app, { "X-Forwarded-Proto": "https" });
        const fresh = cookieNamed(res.setCookie, "x-thx-core");
        expect(fresh, "proxied login must establish a session").to.be.a("string");
        expect(fresh).to.match(/;\s*Secure/i);
    });
});
