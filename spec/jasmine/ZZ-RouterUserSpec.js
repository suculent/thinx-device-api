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

describe("GDPR", function () {

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
        expect(res.status).to.equal(403);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"unauthorized"}');
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
});

describe("User Lifecycle", function () {

  beforeAll((done) => {
    agent = chai.request.agent(thx.app);
    done();
  });

  afterAll((done) => {
    agent.close();
    done();
  });

  it("POST /api/user/create (invalid body)", function (done) {
    chai.request(thx.app)
      .post('/api/user/create')
      .send({ })
      .end((err, res) => {
        console.log("[chai] POST /api/user/create (invalid body) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string'); // returns '{"success":false,"status":"email required"}
        done();
      });
  }, 20000);

  it("POST /api/user/create (valid body)", function (done) {
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
        done();
      });
  }, 20000);

  it("GET /api/user/activate", function (done) {
    chai.request(thx.app)
      .get('/api/user/activate')
      .end((err, res) => {
        expect(res.status).to.equal(403);
        done();
      });
  }, 20000);

  it("GET /api/user/activate (valid body)", function (done) {
    console.log("[chai] GET /api/user/activate (valid body) request");
    chai.request(thx.app)
      .get('/api/user/activate?owner='+dynamic_owner_id+'&activation='+dynamic_activation_code)
      .end((err, res) => {
        //console.log("[chai] GET /api/user/activate (valid body) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string'); // <html>
        expect(res).to.be.html;

        console.log("[chai] POST /api/user/password/set (after activation)");
        chai.request(thx.app)
          .post('/api/user/password/set')
          .send({ password: 'tset', rpassword: 'tset', activation: dynamic_activation_code})
          .end((err, res) => {
            console.log("[chai] POST /api/user/password/set (after activation) response:", res.text, " status:", res.status);
            expect(res.status).to.equal(200);
            expect(res.text).to.be.a('string');
            expect(res.text).to.equal('{"success":true,"status":"password_reset_successful"}');
            done();
          });
      });
  }, 20000);

  it("POST /api/user/delete", function (done) {
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

  it("POST /api/user/password/reset", function (done) {
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
});

describe("User Profile", function () {

  beforeAll((done) => {
    agent = chai.request.agent(thx.app);
    done();
  });

  afterAll((done) => {
    agent.close();
    done();
  });

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

  it("POST /api/login (valid)", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'cimrman', password: 'tset', remember: false })
      .then(function (res) {
        console.log(`[chai] POST /api/login (valid)response: ${res.text} status: ${res.status}`);
        expect(res).to.have.cookie('x-thx-core');
        /* response example:
        {
          "status":"OK",
          "success":true,
          "access_token":"eyJh...",
          "redirectURL":"https://rtm.thinx.cloud/auth.html?t=33ed0c670113f6e8b1095a1b1857d5dc6e9db77c37122d76c45ffacef2484701&g=true"
        } */
        let body = JSON.parse(res.text);
        jwt = body.access_token;
        done();
        /*
        // The `agent` now has the sessionid cookie saved, and will send it
        // back to the server in the next request:
        return agent.get('/user/me')
          .then(function (res) {
            expect(res).to.have.status(200);*/
      });
  }, 20000);

  it("GET /api/user/profile (cookie-auth)", function (done) {
    console.log("[chai] GET /api/user/profile (auth) request ");
    agent
      .get('/api/user/profile')
      .end((err, res) => {
        console.log("[chai] GET /api/user/profile (auth) response status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/profile (jwt.auth)", function (done) {
    console.log("[chai] GET /api/user/profile (auth) request ");
    expect(jwt).not.to.be.undefined;
    chai
      .request(thx.app)
      .get('/api/user/profile')
      .set('Authorization', jwt)
      .end((err, res) => {
        console.log("[chai] GET /api/user/profile (auth) response ", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/profile (auth)", function (done) {
    console.log("[chai] POST /api/user/profile (auth) request");
    agent
      .post('/api/user/profile')
      .send({})
      .end((err, res) => {
        console.log("[chai] POST /api/user/profile (auth) response:", res.text, " status:", res.status);
        expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  
});

describe("User Logs", function () {

  beforeAll((done) => {
    agent = chai.request.agent(thx.app);
    done();
  });

  afterAll((done) => {
    agent.close();
    done();
  });
  
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
});

describe("User Statistics", function () {

  beforeAll((done) => {
    agent = chai.request.agent(thx.app);
    done();
  });

  afterAll((done) => {
    agent.close();
    done();
  });

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
});

describe("User Support (2nd level)", function () {
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
