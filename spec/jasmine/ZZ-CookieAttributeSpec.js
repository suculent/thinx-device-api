/*
 * SEC-COOKIE-01 regression spec
 *
 * Asserts that the main session cookie `x-thx-core` ships with the `HttpOnly`
 * attribute on the Set-Cookie response header.
 *
 * Regression bait against a future revert to `httpOnly: false`. The flip lives
 * at thinx-core.js:316 (post-Phase-6) inside `sessionConfig.cookie`. The
 * separate WS-session cookie `x-thx-wscore` at thinx-core.js:438 is already
 * httpOnly:true and is NOT covered by this spec — it targets the main session
 * cookie surface only.
 *
 * Why HttpOnly: a flag-style RFC 6265 attribute. Express writes the literal
 * `HttpOnly` (case-sensitive) into the Set-Cookie header when
 * `cookie.httpOnly: true` is configured. When false, the attribute is OMITTED
 * (not written as `HttpOnly=false`). So the assertion is on substring presence.
 *
 * Local test-environment limitation (ACCEPT per Phase 5 pattern): npm test
 * aborts locally on missing /mnt/data/conf/config.json. The static parse-gate
 * is authoritative locally; CI-side Jasmine run is the canonical behavioral
 * gate.
 */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;
var agent;

describe("ZZ-CookieAttributeSpec (SEC-COOKIE-01)", function () {

  beforeAll((done) => {
    thx = new THiNX();
    thx.init(() => {
      agent = chai.request.agent(thx.app);
      console.log(`🚸 [chai] >>> running SEC-COOKIE-01 CookieAttribute spec`);
      done();
    });
  }, 30000);

  afterAll((done) => {
    if (agent) agent.close();
    if (thx && thx.server) thx.server.close();
    console.log(`🚸 [chai] <<< completed SEC-COOKIE-01 CookieAttribute spec`);
    done();
  });

  it("SEC-COOKIE-01 — Set-Cookie x-thx-core has HttpOnly attribute", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        const setCookie = res.headers['set-cookie'];
        expect(setCookie).to.be.an('array');

        // Find the x-thx-core cookie entry — it MUST exist on a session-establishing response.
        const xThxCore = setCookie.find(c => /^x-thx-core=/.test(c));
        expect(xThxCore, 'expected at least one Set-Cookie entry for x-thx-core').to.be.a('string');

        // Positive assertion: HttpOnly attribute is present (RFC 6265 flag-style).
        expect(xThxCore).to.include('HttpOnly');

        // Negative-bait assertion: HttpOnly is a flag — it must NEVER appear as `HttpOnly=false`
        // or `HttpOnly=true`. This regression-baits a future stringly-typed misconfig.
        expect(xThxCore).to.not.include('HttpOnly=false');
        expect(xThxCore).to.not.include('HttpOnly=true');

        done();
      })
      .catch((e) => {
        console.log("SEC-COOKIE-01 spec error:", e);
        done(e);
      });
  }, 30000);

});
