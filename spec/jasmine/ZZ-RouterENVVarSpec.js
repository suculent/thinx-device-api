/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
let chaiHttp = require('chai-http');
var expect = require('chai').expect;
var envi = require("../_envi.json");
chai.use(chaiHttp);

let thx;

describe("ENV Vars (noauth)", function () {

  beforeAll((done) => {
    thx = new THiNX();
    thx.init(() => {
      done();
    });
  });

  it("POST /api/user/env/revoke (noauth, invalid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/revoke')
      .send()
      .end((_err, res) => {
        expect(res.status).to.equal(403);
        done();
      });
  }, 20000);

  it("POST /api/user/env/add (noauth, invalid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/add')
      .send()
      .end((_err, res) => {
        expect(res.status).to.equal(403);
        done();
      });
  }, 20000);

  it("POST /api/user/env/add (noauth, semi-valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/add')
      .send({ udid: envi.oid })
      .end((_err, res) => {
        expect(res.status).to.equal(403);
        done();
      });
  }, 20000);

  it("POST /api/user/env/revoke (noauth, semi-valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/revoke')
      .send({ udid: envi.oid })
      .end((_err, res) => {
        expect(res.status).to.equal(403);
        done();
      });
  }, 20000);

  it("GET /api/user/env/list (noauth)", function (done) {
    chai.request(thx.app)
      .get('/api/user/env/list')
      .end((_err, res) => {
        expect(res.status).to.equal(403);
        done();
      });
  }, 20000);
});

describe("ENV Vars (JWT)", function () {

  let agent;
  let jwt;

  beforeAll((done) => {
    agent = chai.request.agent(thx.app);
    agent
      .post('/api/login')
      .send({ 
        username: envi.dynamic.username,
        password: envi.dynamic.username, 
        remember: false }
      )
      .then(function (res) {
        let body = JSON.parse(res.text);
        jwt = 'Bearer ' + body.access_token;
        done();
      })
      .catch((e) => { console.log(e); });
  });

  afterAll((done) => {
    agent.close();
    done();
  });

  it("POST /api/user/env/add (JWT, valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/add')
      .set('Authorization', jwt)
      .send({ key: "env-name", value: "env-value"})
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/user/env/add (JWT, valid) response:", res.text, res.status);
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        //expect(res.text).to.equal('{"success":false,"status":"missing_key"}');
        done();
      });
  }, 20000);

  it("POST /api/user/env/revoke (JWT, invalid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/revoke')
      .set('Authorization', jwt)
      .send()
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"no_names_given"}');
        done();
      });
  }, 20000);

  it("POST /api/user/env/add (JWT, invalid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/add')
      .set('Authorization', jwt)
      .send()
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"missing_key"}');
        done();
      });
  }, 20000);

  it("POST /api/user/env/add (JWT, semi-valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/add')
      .set('Authorization', jwt)
      .send({ udid: envi.oid })
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"missing_key"}');
        done();
      });
  }, 20000);

  it("POST /api/user/env/revoke (JWT, semi-valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/revoke')
      .set('Authorization', jwt)
      .send({ udid: envi.oid })
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"no_names_given"}');
        done();
      });
  }, 20000);

  it("GET /api/user/env/list (JWT)", function (done) {
    chai.request(thx.app)
      .get('/api/user/env/list')
      .set('Authorization', jwt)
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/user/env/list (JWT, valid) response:", res.text, res.status);
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        // {"env_vars":[]} - add failed
        // {"env_vars":["env-name","env-name"]} - add failed, missing value!
        done();
      });
  }, 20000);
});