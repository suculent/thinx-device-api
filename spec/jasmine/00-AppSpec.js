/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

const Owner = require("../../lib/thinx/owner");
const Globals = require("../../lib/thinx/globals");
const redis_client = require('redis');

let thx;

// CouchDB design-view index-readiness guard.
// On a fresh CI database the `users` design-doc views (owners_by_username, etc.)
// are indexed lazily on first query. The very first request in the suite is
// POST /api/login -> Owner.validate() -> userlib.view("users","owners_by_username"),
// which can race the index build and return a transient error -> Owner.validate
// returns false -> router.auth.js:287 responds 503 instead of 403 (intermittent CI
// red). Warming each user view here (with retry) forces the indexes to build BEFORE
// the first spec queries them. The built indexes persist for the rest of the run, so
// every later spec benefits too. Pure test-harness change; no product behavior change.
// See .planning/debug/ci-login-503-couchdb.md for the full diagnosis.
async function warmUserViews() {
  const USER_VIEWS = [
    "owners_by_username",
    "owners_by_email",
    "owners_by_activation",
    "owners_by_resetkey",
  ];
  const MAX_ATTEMPTS = 15;
  let rc;
  try {
    rc = redis_client.createClient(Globals.redis_options());
    await rc.connect();
    const warm = new Owner(rc.legacy());
    for (const view of USER_VIEWS) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await warm.userlib.view("users", view, { limit: 1 });
          break; // view responded -> index ready
        } catch (e) {
          if (attempt === MAX_ATTEMPTS) {
            console.log(`⚠️ [warmup] view users/${view} not ready after ${MAX_ATTEMPTS} attempts: ${e.message}`);
          } else {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
    }
  } catch (e) {
    // Non-fatal: if warmup cannot run (e.g. redis/config unavailable), fall back to
    // prior behavior rather than failing the whole suite at setup.
    console.log(`⚠️ [warmup] user-view warmup skipped: ${e.message}`);
  } finally {
    if (rc) { try { await rc.quit(); } catch (_e) { /* ignore */ } }
  }
}

describe("App should support", function () {

  beforeAll((done) => {
    console.log(`🚸 [chai] >>> running App spec`);
    thx = new THiNX();
    thx.init(() => {
      // Warm CouchDB user-view indexes before the first request races them (#ci-login-503).
      warmUserViews().then(() => done()).catch(() => done());
    });
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed App spec`);
  });


  it("GET / [healthcheck]", function (done) {
    chai.request(thx.app)
      .get('/')
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(JSON.parse(res.text).healthcheck).to.equal(true);
        done();
      });
  }, 30000);

  it("POST /githook", function (done) {
    chai.request(thx.app)
      .post('/githook')
      .send({
        'body': 'nonsense'
      })
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('Accepted');
        done();
      });
  }, 30000);

  it("POST /api/githook", function (done) {
    chai.request(thx.app)
      .post('/api/githook')
      .send({
        'body': 'nonsense'
      })
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('Accepted');
        done();
      });
  }, 30000);

  it("POST /api/user/logs/tail (should not exist before login)", function (done) {
    chai.request(thx.app)
      .post('/api/user/logs/tail')
      .send({
        'body': 'nonsense'
      })
      .end((err, res) => {
        expect(res.status).to.equal(404); // not implemented at this stage
        done();
      });
  }, 30000);

});

describe("AppSpec Session Management", function () {

  it("POST /api/login (invalid)", function (done) {
    chai.request(thx.app)
      .post('/api/login')
      .send({
        'username': 'test',
        'password': 'test',
        remember: false
      })
      .end((err, res) => {
        expect(res.status).to.equal(403);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"invalid_credentials"}');
        done();
      });
  }, 30000);

  it("POST /api/login (invalid) 2", function (done) {
    chai.request(thx.app)
      .post('/api/login')
      .send({
        'username': 'test',
        'password': 'tset',
        remember: false
      })
      .end((err, res) => {
        expect(res.status).to.equal(403);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"invalid_credentials"}');
        done();
      });
  }, 30000);

  it("POST /api/login (invalid) 3", function (done) {
    chai.request(thx.app)
      .post('/api/login')
      .send({
        'password': 'tset',
        remember: false
      })
      .end((err, res) => {
        expect(res.status).to.equal(403);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"invalid_credentials"}');
        done();
      });
  }, 30000);

  it("POST /api/login (invalid) 4", function (done) {
    chai.request(thx.app)
      .post('/api/login')
      .send({
        'username': 'test',
        remember: false
      })
      .end((err, res) => {
        expect(res.status).to.equal(403);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"invalid_credentials"}');
        done();
      });
  }, 30000);

  xit("/api/logout (without session)", function (done) {
    chai.request(thx.app)
      .get('/api/logout')
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string'); // html...
        done();
      });
  }, 30000);

});
