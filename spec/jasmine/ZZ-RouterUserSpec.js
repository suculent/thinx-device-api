/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

//var envi = require("../_envi.json");

const dynamic_owner_id = "bab692f8c9c78cf64f579406bdf6c6cd2c4d00b3c0c8390387d051495dd95247";

const user_info = {
  first_name: "Dynamic",
  last_name: "User",
  email: "dynamic@example.com",
  username: "dynamic"
};

let dynamic_activation_code = null;

let thx = new THiNX();
let agent;
let jwt = null;

describe("User Routes", function () {

  beforeAll((done) => {
    thx.init(() => {
      agent = chai.request.agent(thx.app);
      done();
    });
  });

  afterAll((done) => {
    agent.close();
    done();
  });

  it("POST /api/gdpr (unauthenticated)", function (done) {
    //console.log("[chai] POST /api/gdpr (unauthenticated) request");
    chai.request(thx.app)
      .post('/api/gdpr')
      .send({})
      .end((err, res) => {
        // console.log("[chai] POST /api/gdpr response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"consent_missing"}');
        done();
      });
  }, 20000);

  it("POST /api/gdpr/transfer", function (done) {
    console.log("[chai] request /api/gdpr/transfer");
    chai.request(thx.app)
      .post('/api/gdpr/transfer')
      .send({})
      .end((err, res) => {
        console.log("[chai] response /api/gdpr/transfer:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/gdpr/revoke", function (done) {
    console.log("[chai] POST /api/gdpr/revoke request");
    chai.request(thx.app)
      .post('/api/gdpr/revoke')
      .send({})
      .end((err, res) => {
        console.log("[chai] POST /api/gdpr/revoke response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
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
      .end((err, res) => {
        console.log("[chai] POST /api/user/create (invalid body) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string'); // returns '{"success":false,"status":"email required"}
        done();
      });
  }, 20000);

  it("POST /api/user/create (valid body) and activate (set password)", function (done) {
    console.log("[chai] POST /api/user/create (valid body)");
    chai.request(thx.app)
      .post('/api/user/create')
      .send(user_info)
      .end((err, res) => {
        console.log("[chai] POST /api/user/create (valid body) response:", res.text, " status:", res.status);
        // {"success":true,"status":"6975d3c5849fc130e689f2cae0abe51a8fd24f496810bee3c0bcf531dd53be0c"}
        expect(res.text).to.be.a('string');
        expect(res.status).to.equal(200);
        let body = JSON.parse(res.text);
        dynamic_activation_code = body.status;
        expect(body.status).to.be.a('string'); // check length
        expect(body.status.length == 64);

        let rurl = '/api/user/activate?owner=' + dynamic_owner_id + '&activation=' + dynamic_activation_code;
        console.log("[chai] GET /api/user/activate (valid body) request:", rurl);
        chai.request(thx.app)
          .get(rurl)
          .end((err, res) => {
            //console.log("[chai] GET /api/user/activate (valid body) response:", res.text, " status:", res.status);
            expect(res.status).to.equal(200);
            expect(res.text).to.be.a('string'); // <html>
            expect(res).to.be.html;

            console.log("[chai] POST /api/user/password/set (after activation)");
            chai.request(thx.app)
              .post('/api/user/password/set')
              .send({ password: 'dynamic', rpassword: 'dynamic', activation: dynamic_activation_code })
              .end((err, res) => {
                console.log("[chai] POST /api/user/password/set (after activation) response:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":true,"status":"password_reset_successful"}');
                done();
              });
          });

      });
  }, 20000);

  it("GET /api/user/activate (noauth)", function (done) {
    chai.request(thx.app)
      .get('/api/user/activate')
      .end((err, res) => {
        console.log("[chai] POST /api/user/activate response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        done();
      });
  }, 20000);

  it("POST /api/user/delete (noauth)", function (done) {
    chai.request(thx.app)
      .post('/api/user/delete')
      .send({})
      .end((err, res) => {
        console.log("[chai] POST /api/user/delete response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/password/reset (noauth)", function (done) {
    chai.request(thx.app)
      .post('/api/user/password/reset')
      .send({})
      .end((err, res) => {
        console.log("[chai] POST /api/user/password/reset response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/password/reset", function (done) {
    chai.request(thx.app)
      .get('/api/user/password/reset')
      .end((err, res) => {
        console.log("[chai] GET /api/user/password/reset response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/password/set", function (done) {
    console.log("[chai] POST /api/user/password/set request");
    chai.request(thx.app)
      .post('/api/user/password/set')
      .send({})
      .end((err, res) => {
        console.log("[chai] POST /api/user/password/set response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  //
  // User Profile
  //

  it("GET /api/user/profile (noauth)", function (done) {
    console.log("[chai] GET /api/user/profile (noauth) request ");
    chai.request(thx.app)
      .get('/api/user/profile')
      .end((err, res) => {
        console.log("[chai] GET /api/user/profile (noauth) response status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/profile (noauth)", function (done) {
    console.log("[chai] POST /api/user/profile (noauth) request");
    chai.request(thx.app)
      .post('/api/user/profile')
      .send({})
      .end((err, res) => {
        console.log("[chai] POST /api/user/profile (noauth) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/login (valid) and GET /api/user/profile (auth+jwt)", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        console.log(`[chai] POST /api/login (valid) response: ${JSON.stringify(res)}`);
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

        // Otherwise it's just calling the login endpoint again with the legacy login token...
        console.log("[chai] GET /api/login with token", jwt);
        agent
          .post('/api/login')
          .send({ token: token })
          .end((err, res) => {
            console.log("[chai] /api/login (auth+) response '", JSON.stringify(res), "' status:", res.status);
            expect(res.status).to.equal(200);
            //expect(res.text).to.be.a('string');

            // TODO: FIXME: This login does not work but it should by the docs (or with added JWT token at lease)
            console.log("[chai] GET /api/user/profile (jwt) request with token", jwt);
            return agent
              .get('/api/user/profile')
              .set('Authorization', jwt)
              .end((err, res2) => {
                console.log("[chai] GET /api/user/profile (jwt) response\n", JSON.stringify(res2, null, 4), "'\nstatus:", res2.status);
                expect(res2.status).to.equal(200);
                expect(res2.text).to.be.a('string');
                let owner_data = JSON.parse(res2.text);
                expect(owner_data).to.be.an('object');
                console.log("[chai] expected profile: ", JSON.stringify(owner_data, null, 2));
                expect(owner_data).success.to.equal(true);
                done();
              });
          });
      });
  }, 20000);

  it("GET /api/user/profile (jwt)", function (done) {
    console.log("[chai] GET /api/user/profile (jwt) request with token", jwt);
    expect(jwt).not.to.be.null;
    chai
      .request(thx.app)
      .get('/api/user/profile')
      .set('Authorization', jwt)
      .end((err, res) => {
        console.log("[chai] GET /api/user/profile (jwt) response ", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/login (valid)", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        console.log(`[chai] POST /api/login (valid) response: \n ${res.text} \n status: ${res.status} \n cookie: ${res.cookie}, ${res.cookies}`);
        expect(res).to.have.cookie('x-thx-core');
        done();
        /*
        // The `agent` now has the sessionid cookie saved, and will send it
        // back to the server in the next request:
        return agent.get('/user/me')
          .then(function (res) {
            expect(res).to.have.status(200);*/
      });
  }, 20000);

  it("POST /api/user/profile (invalid)", function (done) {
    console.log("[chai] POST /api/user/profile (invalid) request");
    agent
      .post('/api/user/profile')
      .send({})
      .end((err, res) => {
        console.log("[chai] POST /api/user/profile (invalid) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);


  //
  // User Logs
  //

  it("GET /api/user/logs/audit", function (done) {
    chai.request(thx.app)
      .get('/api/user/logs/audit')
      .end((err, res) => {
        console.log("[chai] GET /api/user/logs/audit response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/logs/build/list", function (done) {
    chai.request(thx.app)
      .get('/api/user/logs/build/list')
      .end((err, res) => {
        console.log("[chai] GET /api/user/logs/build/list response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/logs/build", function (done) {
    chai.request(thx.app)
      .post('/api/user/logs/build')
      .send({})
      .end((err, res) => {
        console.log("[chai] POST /api/user/logs/build response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
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
      .end((err, res) => {
        console.log("[chai] GET /api/user/stats response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/stats (jwt)", function (done) {
    console.log("[chai] GET /api/user/stats (jwt)");
    agent
      .get('/api/user/stats')
      .set('Authorization', jwt)
      .end((err, res) => {
        console.log("[chai] GET /api/user/stats (jwt) response:", res.text, " status:", res.status);
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
    console.log("[chai] POST /api/user/chat request");
    chai.request(thx.app)
      .post('/api/user/chat')
      .send({})
      .end((err, res) => {
        console.log("[chai] POST /api/user/chat response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);
});
