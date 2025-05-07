/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

const chai = require('chai');
const expect = require('chai').expect;
const chaiHttp = require('chai-http');
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

describe("User Routes", function () {

  let reset_key = null;

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

  it("POST /api/gdpr (unauthenticated, invalid)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(400);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"consent_missing"}');
        done();
      });
  }, 30000);

  it("POST /api/gdpr (unauthenticated, gdpr)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr')
      .send({ gdpr: true })
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"token_missing"}');
        done();
      });
  }, 30000);

  it("POST /api/gdpr/transfer (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr/transfer')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 30000);

  it("POST /api/gdpr/revoke (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr/revoke')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 30000);

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
        expect(res.text).to.equal('{"success":false,"response":"email_required"}');
        done();
      });
  }, 30000);

  it("POST /api/user/create (valid body) and activate (set password)", function (done) {
    chai.request(thx.app)
      .post('/api/user/create')
      .send(user_info)
      .end((_err, res) => {
        expect(res.text).to.be.a('string');
        expect(res.status).to.equal(200);
        let body = JSON.parse(res.text);
        dynamic_activation_code = body.response;
        expect(body.response).to.be.a('string'); // check length
        expect(body.response.length == 64);

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
                expect(___res.text).to.equal('{"success":true,"response":"activation_successful"}');
                done();
              });
          });

      });
  }, 30000);

  it("GET /api/user/activate (noauth)", function (done) {
    chai.request(thx.app)
      .get('/api/user/activate')
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        expect(res.text).to.equal('{"success":false,"response":"activation_key_missing"}');
        done();
      });
  }, 30000);

  it("POST /api/user/delete (unauthenticated)", function (done) {
    chai.request(thx.app)
      .post('/api/user/delete')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(403);
        done();
      });
  }, 30000);

  it("POST /api/gdpr (unauthenticated, empty)", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(400);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"consent_missing"}');
        done();
      });
  }, 30000);

  it("POST /api/user/password/reset (noauth, no-data)", function (done) {
    chai.request(thx.app)
      .post('/api/user/password/reset')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"email_not_found"}');
        done();
      });
  }, 30000);

  it("POST /api/user/password/reset (noauth, email)", function (done) {
    chai.request(thx.app)    
      .post('/api/user/password/reset')
      .send({ email: envi.dynamic.email })
      .end((_err, res) => {
        console.log("[chai] POST /api/user/password/reset (noauth, email) response:", res.text);
        expect(res.status).to.equal(200);
        let j = JSON.parse(res.text);
        reset_key = j.response;
        expect(reset_key).to.be.a('string');
        expect(j.success).to.equal(true);
        expect(j.response).to.be.a('string'); // reset_key
        done();
      });
  }, 30000);

  it("GET /api/user/password/reset (noauth, no-email)", function (done) {
    chai.request(thx.app)
      .get('/api/user/password/reset')
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"missing_reset_key"}');
        done();
      });
  }, 30000);

  it("GET /api/user/password/reset (noauth, invalid) 1", function (done) {
    chai.request(thx.app)
      .get('/api/user/password/reset?reset_key=invalid')
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"user_not_found"}'); // because this is nov calid reset_key
        done();
      });
  }, 30000);

  it("GET /api/user/password/reset (noauth, invalid) 2", function (done) {
    chai.request(thx.app)
      .get('/api/user/password/reset?reset_key=invalid?owner=' + envi.dynamic.owner)
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"user_not_found"}'); // because this is nov calid reset_key generated by posting valid e-mail to password reset
        done();
      });
  }, 30000);

  it("GET /api/user/password/reset (noauth, invalid) 3", function (done) {
    chai.request(thx.app)
      .get('/api/user/password/reset?reset_key=' + reset_key + '&owner=' + envi.dynamic.owner)
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        done();
      });
  }, 30000);

  it("POST /api/user/password/set", function (done) {
    console.log("🚸 [chai] POST /api/user/password/set request");
    chai.request(thx.app)
      .post('/api/user/password/set')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"password_mismatch"}');
        done();
      });
  }, 30000);

  it("POST /api/user/password/set (2)", function (done) {
    console.log("🚸 [chai] POST /api/user/password/set (2) request");
    chai.request(thx.app)
      .post('/api/user/password/set')
      .send({ password: "A", rpassword: "B" })
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"password_mismatch"}');
        done();
      });
  }, 30000);

  it("POST /api/user/password/set (3)", function (done) {
    console.log("🚸 [chai] POST /api/user/password/set (3) request");
    chai.request(thx.app)
      .post('/api/user/password/set')
      .send({ password: "dynamic", rpassword: "dynamic", reset_key: reset_key })
      .end((_err, res) => {
        console.log("🚸 [chai] POST /api/user/password/set (3) response", res.text);
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        done();
      });
  }, 30000);

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
  }, 30000);

  it("POST /api/user/profile (noauth)", function (done) {
    chai.request(thx.app)
      .post('/api/user/profile')
      .send({})
      .end((_err, res) => {
        console.log("🚸 [chai] POST /api/user/profile (noauth) response:", res.text);
        expect(res.status).to.equal(401);
        done();
      });
  }, 30000);

  it("POST /api/login (valid) and GET /api/user/profile (auth+jwt)", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        console.log("POST /api/login (valid) and GET /api/user/profile (auth+jwt) response", res.text, res.cookie);
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

        expect(body.access_token).to.be.a('string');

        // Old UI does this
        let token = body.redirectURL.replace("https://rtm.thinx.cloud/auth.html?t=", "").replace("&g=true", "");

        // just test-added
        agent
          .post('/api/gdpr')
          .send({ gdpr: true, token: token })
          .end((_err, _res) => {
            console.log("🚸 [chai] POST /api/gdpr response:", _res.text, "status", _res.status);
            expect(_res.status).to.equal(200);
            expect(_res.text).to.be.a('string');
            // {"success":false,"response":"invalid_protocol_update_key_missing"} // WTF?

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
  }, 30000);

  it("POST /api/login (valid) with GDPR v2", function (done) {
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
        // jwt = 'Bearer ' + body.access_token; we already have one

        // Old UI does this
        let token = body.redirectURL.replace("https://rtm.thinx.cloud/auth.html?t=", "").replace("&g=true", "");

        // just test-added
        agent
          .put('/api/v2/gdpr')
          .send({ gdpr: true, token: token })
          .end((_err, _res) => {
            expect(_res.status).to.equal(200);
            expect(_res.text).to.be.a('string');
            // {"success":false,"response":"invalid_protocol_update_key_missing"} // WTF?

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
  }, 30000);

  it("POST /api/gdpr/transfer", function (done) {
    chai.request(thx.app)
      .post('/api/gdpr/transfer')
      .set('Authorization', jwt)
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  }, 30000);

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
  }, 30000);

  // GDPR API v2

  // there is no login here, so JWT for this should be missing
  it("DELETE /api/v2/gdpr", function (done) {
    console.log("🚸 [chai] DELETE /api/v2/gdpr (jwt, invalid) request");
    chai.request(thx.app)
      .delete('/api/v2/gdpr')
      .set('Authorization', jwt)
      .send({ owner_id: dynamic_owner_id})
      .end((_err, res) => {
        console.log("🚸 [chai] DELETE /api/v2/gdpr (jwt, invalid) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"response":"deletion_not_confirmed"}');
        done();
      });
  }, 30000);

  // there is no login here, so JWT for this is missing
  it("POST /api/v2/gdpr", function (done) {
    chai.request(thx.app)
      .post('/api/v2/gdpr')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 30000);

  // there is no login here, so JWT for this is missing
  it("PUT /api/v2/gdpr", function (done) {
    chai.request(thx.app)
      .put('/api/v2/gdpr')
      .send({})
      .end((_err, res) => {
        console.log("🚸 [chai] PUT /api/v2/gdpr response:", res.text); // consent missing, turn into expect
        expect(res.status).to.equal(400); // should return 401 without proper token, or 400 consent missing ¨

        done();
      });
  }, 30000);


  //
  // User Profile
  //

  it("GET /api/user/profile (jwt)", function (done) {
    expect(jwt).not.to.eq(null);
    agent
      .get('/api/user/profile')
      .set('Authorization', jwt)
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        done();
      });
  }, 30000);

  it("POST /api/login (valid)", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        expect(res).to.have.cookie('x-thx-core');
        done();
      })
      .catch((e) => { console.log(e); });
  }, 30000);

  it("POST /api/user/profile (invalid)", function (done) {
    agent
      .post('/api/user/profile')
      .send({})
      .end((_err, res) => {
        expect(res).to.have.status(401);
        done();
      });
  }, 30000);

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
  }, 30000);


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
  }, 30000);

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
  }, 30000);

  it("GET /api/user/logs/build/list", function (done) {
    chai.request(thx.app)
      .get('/api/user/logs/build/list')
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 30000);

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
  }, 30000);

  it("POST /api/user/logs/build", function (done) {
    chai.request(thx.app)
      .post('/api/user/logs/build')
      .send({})
      .end((_err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 30000);

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
  }, 30000);

  let real_build_id;

  // fetch logs
  it("GET /api/v2/logs/build", function (done) {
    chai.request(thx.app)
      .get('/api/v2/logs/build')
      .set('Authorization', jwt)
      .end((_err, res) => {
        console.log("🚸 [chai] GET /api/user/logs/build (jwt) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 30000);

  it("GET /api/user/logs/build/"+envi.build_id, function (done) {
    chai.request(thx.app)
      .get('/api/user/logs/build/'+envi.build_id)
      .set('Authorization', jwt)
      .end((_err, res) => {
        console.log("🚸 [chai] GET /api/user/logs/build/:id (jwt) response:", res.text, " status:", res.status);
        let j = JSON.parse(res.text);
        real_build_id = j.log[0].build_id;
        expect(res.status).to.equal(200); // returns build fetch failed...
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 30000);

  it("GET /api/v2/logs/build/"+real_build_id, function (done) {
    chai.request(thx.app)
      .get('/api/v2/logs/build/'+real_build_id)
      .set('Authorization', jwt)
      .end((_err, res) => {
        console.log("🚸 [chai] GET /api/user/logs/build/:id (jwt) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 30000);

  it("GET /api/v2/logs/audit", function (done) {
    chai.request(thx.app)
      .get('/api/v2/logs/audit')
      .set('Authorization', jwt)
      .end((_err, res) => {
        console.log("🚸 [chai] GET /api/v2/logs/audit (jwt) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 30000);

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
  }, 30000);

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
  }, 30000);

  it("GET /api/v2/stats (jwt)", function (done) {
    console.log("🚸 [chai] GET /api/v2/stats (jwt)");
    agent
      .get('/api/user/stats')
      .set('Authorization', jwt)
      .end((_err, res) => {
        console.log("🚸 [chai] GET /api/v2/stats (jwt) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 30000);

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
  }, 30000);

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
  }, 30000);

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // API v2 Tests

  it("GET /api/v2/profile", function (done) {
    agent
      .get('/api/v2/profile')
      .set('Authorization', jwt)
      .end((_err, res) => {
        expect(res).to.have.status(200);
        done();
      });
  }, 30000);

  it("POST /api/v2/profile", function (done) {
    let changes = { transformers: envi.dynamic.transformers };
    agent
      .post('/api/v2/profile')
      .set('Authorization', jwt)
      .send(changes)
      .end((_err, res) => {
        console.log("🚸 [chai] POST /api/v2/profile (transformer) response:", res.text, " status:", res.status);
        expect(res).to.have.status(200);
        done();
      });
  }, 30000);

  it("GET /api/v2/stats/today", function (done) {
    chai.request(thx.app)
      .get('/api/v2/stats/today')
      .set('Authorization', jwt)
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 30000);

  it("GET /api/v2/stats/week", function (done) {
    chai.request(thx.app)
      .get('/api/v2/stats/week')
      .set('Authorization', jwt)
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 30000);

  it("POST /api/v2/device/lastbuild (JWT)", function (done) {
    agent
        .post('/api/v2/device/lastbuild')
        .set('Authorization', jwt)
        .send({ udid: envi.dynamic.udid /* from session – owner: envi.dynamic.owner */ } )
        .end((_err, res) => {
            console.log("[spec] user lastbuild", res.text);
            expect(res.status).to.equal(200);
            expect(res.text).to.be.a('string');
            let j = JSON.parse(res.text);
            expect(j).to.be.an('object');
            console.log("[spec] user lastbuild", JSON.stringify(j, null, 2));
            done();
        });
}, 30000);

});
