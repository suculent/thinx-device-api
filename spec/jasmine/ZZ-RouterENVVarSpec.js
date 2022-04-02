/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
let chaiHttp = require('chai-http');
var envi = require("../_envi.json");
chai.use(chaiHttp);

describe("ENV Vars (noauth)", function () {

  let thx;

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
      .end((err, res) => {
        console.log("[chai] POST /api/user/env/revoke response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/env/add (noauth, invalid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/add')
      .send()
      .end((err, res) => {
        console.log("[chai] POST /api/user/env/add response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/env/add (noauth, semi-valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/add')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("[chai] POST /api/user/env/add response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/env/revoke (noauth, semi-valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/revoke')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("[chai] POST /api/user/env/revoke response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/env/list (noauth)", function (done) {
    chai.request(thx.app)
      .get('/api/user/env/list')
      .end((err, res) => {
        console.log("[chai] GET /api/user/env/list response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);
});

describe("ENV Vars (JWT)", function () {

  let thx = new THiNX();
  let agent;
  let jwt;

  beforeAll((done) => {
      thx.init(() => {
          agent = chai.request.agent(thx.app);
          agent
              .post('/api/login')
              .send({ username: 'dynamic', password: 'dynamic', remember: false })
              .then(function (res) {
                  // console.log(`[chai] Transformer (JWT) beforeAll POST /api/login (valid) response: ${JSON.stringify(res)}`);
                  expect(res).to.have.cookie('x-thx-core');
                  let body = JSON.parse(res.text);
                  jwt = 'Bearer ' + body.access_token;
                  done();
              });
      });
  });

  afterAll((done) => {
      agent.close();
      done();
  });

  it("POST /api/user/env/revoke (JWT, invalid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/revoke')
      .set('Authorization', jwt)
      .send()
      .end((err, res) => {
        console.log("[chai] POST /api/user/env/revoke (JWT, invalid) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/env/add (JWT, invalid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/add')
      .set('Authorization', jwt)
      .send()
      .end((err, res) => {
        console.log("[chai] POST /api/user/env/add (JWT, invalid) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/env/add (JWT, semi-valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/add')
      .set('Authorization', jwt)
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("[chai] POST /api/user/env/add (JWT, semi-valid) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/user/env/revoke (JWT, semi-valid)", function (done) {
    chai.request(thx.app)
      .post('/api/user/env/revoke')
      .set('Authorization', jwt)
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("[chai] POST /api/user/env/revoke (JWT, semi-valid) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/env/list (JWT)", function (done) {
    chai.request(thx.app)
      .get('/api/user/env/list')
      .set('Authorization', jwt)
      .end((err, res) => {
        console.log("[chai] GET /api/user/env/list (JWT) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);
});