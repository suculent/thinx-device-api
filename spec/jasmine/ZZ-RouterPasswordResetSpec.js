/* AUTH-API-01 / G8 regression integration spec for router password-reset paths.
 *
 * AUTH-API-01 regression coverage. Locks in:
 *   (a) Authorization: Bearer null / Bearer undefined / empty Bearer no longer triggers
 *       the JWT branch in lib/router.js (was returning 403 pre-fix).
 *   (b) Unregistered / empty payloads return HTTP 200 (no enumeration leak).
 *   - Legacy alias POST /api/user/password/reset has parity with v2 endpoint.
 *
 * Companion to spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js (round-trip continuity)
 * and spec/jasmine/ZZ-AppSessionUserSpec.js (legacy-alias baseline).
 *
 * Per AUTH-API-01 (b) no-enum contract, this spec asserts ONLY status and envelope
 * shape ({success, response} properties present). It deliberately does NOT lock
 * body.success === true or specific body.response strings because the underlying
 * message may differ between registered / unregistered while HTTP status MUST NOT.
 */

const bootstrap = require('../helpers/bootstrap');

const chai = require('chai');
const expect = require('chai').expect;
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

const envi = require("../_envi.json");

let thx;

describe("Router Password Reset (G8 regression)", function () {

  beforeAll((done) => {
    thx = bootstrap.thx;
    console.log("🚸 [chai] >>> running Router Password Reset spec");
    done();
  });

  afterAll((done) => {
    console.log("🚸 [chai] <<< completed Router Password Reset spec");
    done();
  });

  // Test 1 — the original G8 trigger
  it("POST /api/v2/password/reset (Authorization: Bearer null) — does not 403 (G8 regression)", function (done) {
    chai.request(thx.app)
      .post('/api/v2/password/reset')
      .set("Authorization", "Bearer null")
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        let body = JSON.parse(res.text);
        expect(body).to.have.property('success');
        expect(body).to.have.property('response');
        done();
      });
  }, 30000);

  // Test 2 — symmetric falsy-string variant
  it("POST /api/v2/password/reset (Authorization: Bearer undefined) — does not 403", function (done) {
    chai.request(thx.app)
      .post('/api/v2/password/reset')
      .set("Authorization", "Bearer undefined")
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        let body = JSON.parse(res.text);
        expect(body).to.have.property('success');
        expect(body).to.have.property('response');
        done();
      });
  }, 30000);

  // Test 3 — symmetric edge: empty token after the Bearer prefix
  it("POST /api/v2/password/reset (Authorization: Bearer ) — does not 403", function (done) {
    chai.request(thx.app)
      .post('/api/v2/password/reset')
      .set("Authorization", "Bearer ")
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        let body = JSON.parse(res.text);
        expect(body).to.have.property('success');
        expect(body).to.have.property('response');
        done();
      });
  }, 30000);

  // Test 4 — no-enum, unregistered email
  it("POST /api/v2/password/reset (no Auth, unregistered email) — 200 no-enum", function (done) {
    chai.request(thx.app)
      .post('/api/v2/password/reset')
      .send({ email: 'nobody-known-' + Date.now() + '@example.invalid' })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        let body = JSON.parse(res.text);
        expect(body).to.have.property('success');
        expect(body).to.have.property('response');
        done();
      });
  }, 30000);

  // Test 5 — no-enum, empty body
  it("POST /api/v2/password/reset (no Auth, empty body) — 200 no-enum", function (done) {
    chai.request(thx.app)
      .post('/api/v2/password/reset')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        let body = JSON.parse(res.text);
        expect(body).to.have.property('success');
        expect(body).to.have.property('response');
        done();
      });
  }, 30000);

  // Test 6 — legacy alias parity (D-01)
  it("POST /api/user/password/reset (Authorization: Bearer null, legacy alias) — does not 403", function (done) {
    chai.request(thx.app)
      .post('/api/user/password/reset')
      .set("Authorization", "Bearer null")
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        let body = JSON.parse(res.text);
        expect(body).to.have.property('success');
        expect(body).to.have.property('response');
        done();
      });
  }, 30000);

  // Test 7 — baseline regression-safety (no Auth header, registered email)
  it("POST /api/v2/password/reset (no Auth, registered email) — 200 baseline", function (done) {
    chai.request(thx.app)
      .post('/api/v2/password/reset')
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        let body = JSON.parse(res.text);
        expect(body).to.have.property('success');
        expect(body).to.have.property('response');
        done();
      });
  }, 30000);

});
