/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");

const dynamic_owner_id = envi.dynamic.owner;

const user_info = {
  first_name: "Dynamic",
  last_name: "User",
  email: "dynamic@example.com",
  username: "dynamic"
};

let dynamic_activation_code = null;

let thx;
let agent;
let jwt = null;

let reset_key = null;

describe("User Routes", function () {

  beforeAll((done) => {
    thx = new THiNX();
    thx.init(() => {
      agent = chai.request.agent(thx.app);
      console.log(`🚸 [chai] >>> running User Routes spec`);
      done();
    });
  });

  afterAll((done) => {
    agent.close();
    console.log(`🚸 [chai] <<< completed User Routes spec`);
    done();
  });

  it("POST /api/gdpr (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"consent_missing"}');
        done();
      });
  }, 20000);

  it("POST /api/gdpr (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr')
      .send({ gdpr: true })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"consent_missing"}');
        done();
      });
  }, 20000);

  it("POST /api/gdpr/transfer (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr/transfer')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 20000);

  it("POST /api/gdpr/revoke (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr/revoke')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 20000);

  //
  // User Lifecycle
  //

  it("POST /api/user/create (invalid body)", function (done) {
    chai.request(thx.app)
      .post('/api/user/create')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"email_required"}');
        done();
      });
  }, 20000);

  it("POST /api/user/create (valid body) and activate (set password)", function (done) {
    chai.request(thx.app)
      .post('/api/user/create')
      .send(user_info)
      .end((_err, res) => {
        // {"success":true,"status":"6975d3c5849fc130e689f2cae0abe51a8fd24f496810bee3c0bcf531dd53be0c"}
        expect(res.text).to.be.a('string');
        expect(res.status).to.equal(200);
        let body = JSON.parse(res.text);
        dynamic_activation_code = body.status;
        expect(body.status).to.be.a('string'); // check length
        expect(body.status.length == 64);

        let rurl = '/api/user/activate?owner=' + dynamic_owner_id + '&activation=' + dynamic_activation_code;
        chai.request(thx.app)
          .get(rurl)
          .end((__err, __res) => {
            expect(__res.status).to.equal(200);
            expect(__res.text).to.be.a('string'); // <html>
            expect(__res).to.be.html;

            chai.request(thx.app)
              .post('/api/user/password/set')
              .send({ password: envi.dynamic.username, rpassword: envi.dynamic.username, activation: dynamic_activation_code })
              .end((___err, ___res) => {
                expect(___res.status).to.equal(200);
                expect(___res.text).to.be.a('string');
                expect(___res.text).to.equal('{"success":true,"status":"password_reset_successful"}');
                done();
              });
          });

      });
  }, 20000);

  it("GET /api/user/activate (noauth)", function (done) {
    chai.request(thx.app)
      .get('/api/user/activate')
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.equal('{"success":false,"status":"activation_key_missing"}');
        done();
      });
  }, 20000);

  it("POST /api/user/delete (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/user/delete')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(403);
        done();
      });
  }, 20000);

  it("POST /api/gdpr (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"consent_missing"}');
        done();
      });
  }, 20000);

  it("POST /api/gdpr (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr')
      .send({ gdpr: true })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"consent_missing"}');
        done();
      });
  }, 20000);

  it("POST /api/user/password/reset (noauth, no-data)", function (done) {
    chai.request(thx.app)
      .post('/api/user/password/reset')
      .send({})
      .end((_err, res) => {
        console.log("🚸 [chai] POST /api/user/password/reset (noauth, no-data) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        // {"success":false,"status":"email_not_found"}
        done();
      });
  }, 20000);

  it("POST /api/user/password/reset (noauth, email)", function (done) {
    chai.request(thx.app)
      .post('/api/user/password/reset')
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        let j = JSON.parse(res.text);
        reset_key = j.status;
        expect(j.note).to.equal('reset_key');
        //{"success":true,"status":"24247cbdb8a83c72e8d12e5db8e877be8f5e229b536ebf1a676f20dfa965e631","note":"reset_key"}
        done();
      });
  }, 20000);

  it("GET /api/user/password/reset (noauth, no-email)", function (done) {
    chai.request(thx.app)
      .get('/api/user/password/reset')
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"missing_reset_key"}');
        done();
      });
  }, 20000);

  it("GET /api/user/password/reset (noauth, invalid) 1", function (done) {
    chai.request(thx.app)
      .get('/api/user/password/reset?reset_key=invalid')
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"user_not_found"}'); // because this is nov calid reset_key
        done();
      });
  }, 20000);

  it("GET /api/user/password/reset (noauth, invalid) 2", function (done) {
    chai.request(thx.app)
      .get('/api/user/password/reset?reset_key=invalid?owner=' + envi.dynamic.owner)
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"user_not_found"}'); // because this is nov calid reset_key generated by posting valid e-mail to password reset
        done();
      });
  }, 20000);

  it("GET /api/user/password/reset (noauth, invalid) 3", function (done) {
    chai.request(thx.app)
      .get('/api/user/password/reset?reset_key=' + reset_key + '&owner=' + envi.dynamic.owner)
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string'); 
        //expect(res.text).to.equal(''); // this is a password set form
        done();
      });
  }, 20000);

  it("POST /api/user/password/set", function (done) {
    console.log("🚸 [chai] POST /api/user/password/set request");
    chai.request(thx.app)
      .post('/api/user/password/set')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"password_mismatch"}');
        done();
      });
  }, 20000);

  it("POST /api/user/password/set (2)", function (done) {
    console.log("🚸 [chai] POST /api/user/password/set (2) request");
    chai.request(thx.app)
      .post('/api/user/password/set')
      .send({ password: "A", rpassword: "B" })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"password_mismatch"}');
        done();
      });
  }, 20000);

  it("POST /api/user/password/set (3)", function (done) {
    console.log("🚸 [chai] POST /api/user/password/set (3) request");
    chai.request(thx.app)
      .post('/api/user/password/set')
      .send({ password: "A", rpassword: "B", reset_key: reset_key })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"password_mismatch"}');
        done();
      });
  }, 20000);

  it("POST /api/user/password/set (valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/password/set')
      .send({ password: "dynamic", rpassword: "dynamic", reset_key: reset_key })
      .end((_err, res) => {
        console.log("🚸 [chai] POST /api/user/password/set (valid) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"password_reset_failed"}');
        done();
      });
  }, 20000);

  //
  // User Profile
  //

  it("GET /api/user/profile (noauth)", function (done) {
    chai.request(thx.app)
      .get('/api/user/profile')
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 20000);

  it("POST /api/user/profile (noauth)", function (done) {
    chai.request(thx.app)
      .post('/api/user/profile')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 20000);

  it("POST /api/login (valid) and GET /api/user/profile (auth+jwt)", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        expect(res).to.have.cookie('x-thx-core');
        /* response example:
        {
          "status":"OK",
          "success":true,
          "access_token":"eyJh...",
          "redirectURL":"https://rtm.thinx.cloud/auth.html?t=33ed0c670113f6e8b1095a1b1857d5dc6e9db77c37122d76c45ffacef2484701&g=true"
        } */
        let body = JSON.parse(res.text);
        jwt = 'Bearer ' + body.access_token;

        // Old UI does this
        let token = body.redirectURL.replace("https://rtm.thinx.cloud/auth.html?t=", "").replace("&g=true", "");

        // just test-added
        agent
          .post('/api/gdpr')
          .send({ gdpr: true, token: token })
          .end((_err, _res) => {
            expect(_res.status).to.equal(200);
            expect(_res.text).to.be.a('string');
            // {"success":false,"status":"invalid_protocol_update_key_missing"} // WTF?

            agent
              .post('/api/login')
              .send({ token: token })
              .end((_err1, res1) => {
                expect(res1.status).to.equal(200);

                return agent
                  .get('/api/user/profile')
                  .set('Authorization', jwt)
                  .end((__err, res2) => {
                    expect(res2.status).to.equal(200);
                    expect(res2.text).to.be.a('string');
                    let owner_data = JSON.parse(res2.text);
                    expect(owner_data).to.be.an('object');
                    expect(owner_data.success).to.equal(true);
                    done();
                  });
              });
          });
      })
      .catch((e) => { console.log(e); });
  }, 20000);

  // there is no login here, so JWT for this is missing
  it("POST /api/gdpr/transfer", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr/transfer')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 20000);

  // there is no login here, so JWT for this is missing
  it("POST /api/gdpr/revoke", function (done) {
    console.log("🚸 [chai] POST /api/gdpr/revoke (jwt, invalid) request");
    chai.request(thx.app)
      .post('/api/gdpr/revoke')
      .set('Authorization', jwt)
      .send({})
      .end((_err, res) => {
        console.log("🚸 [chai] POST /api/gdpr/revoke (jwt, invalid) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);


  it("GET /api/user/profile (jwt)", function (done) {
    expect(jwt).not.to.be.null;
    agent
      .get('/api/user/profile')
      .set('Authorization', jwt)
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  }, 20000);

  it("POST /api/login (valid)", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        expect(res).to.have.cookie('x-thx-core');
        done();
      })
      .catch((e) => { console.log(e); });
  }, 20000);

  it("POST /api/user/profile (invalid)", function (done) {
    agent
      .post('/api/user/profile')
      .send({})
      .end((_err, res) => {
        expect(res).to.have.status(401);
        done();
      });
  }, 20000);

  it("POST /api/user/profile (transformer)", function (done) {
    let changes = { transformers: envi.dynamic.transformers };
    agent
      .post('/api/user/profile')
      .set('Authorization', jwt)
      .send(changes)
      .end((_err, res) => {
        console.log("🚸 [chai] POST /api/user/profile (transformer) response:", res.text, " status:", res.status);
        expect(res).to.have.status(200);
        done();
      });
  }, 20000);


  //
  // User Logs
  //

  it("GET /api/user/logs/audit", function (done) {
    chai.request(thx.app)
      .get('/api/user/logs/audit')
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 20000);

  it("GET /api/user/logs/audit (jwt)", function (done) {
    chai.request(thx.app)
      .get('/api/user/logs/audit')
      .set('Authorization', jwt)
      .end((_err, res) => {
        console.log("🚸 [chai] GET /api/user/logs/audit (jwt) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/logs/build/list", function (done) {
    chai.request(thx.app)
      .get('/api/user/logs/build/list')
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 20000);

  it("GET /api/user/logs/build/list (jwt)", function (done) {
    chai.request(thx.app)
      .get('/api/user/logs/build/list')
      .set('Authorization', jwt)
      .end((_err, res) => {
        console.log("🚸 [chai] GET /api/user/logs/build/list (jwt) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/logs/build", function (done) {
    chai.request(thx.app)
      .post('/api/user/logs/build')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 20000);

  it("POST /api/user/logs/build (jwt)", function (done) {
    chai.request(thx.app)
      .post('/api/user/logs/build')
      .set('Authorization', jwt)
      .send({})
      .end((_err, res) => {
        console.log("🚸 [chai] POST /api/user/logs/build (jwt) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  //
  // User Statistics
  //

  it("GET /api/user/stats", function (done) {
    chai.request(thx.app)
      .get('/api/user/stats')
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/stats (jwt)", function (done) {
    console.log("🚸 [chai] GET /api/user/stats (jwt)");
    agent
      .get('/api/user/stats')
      .set('Authorization', jwt)
      .end((_err, res) => {
        console.log("🚸 [chai] GET /api/user/stats (jwt) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  //
  // User Support (2nd level)
  //

  // [error] websocket Error: listen EADDRINUSE: address already in use 0.0.0.0:7442
  it("POST /api/user/chat", function (done) {
    chai.request(thx.app)
      .post('/api/user/chat')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/chat", function (done) {
    chai.request(thx.app)
      .post('/api/user/chat')
      .set('Authorization', jwt)
      .send({})
      .end((_err, res) => {
        console.log("🚸 [chai] POST /api/user/chat response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);
});
