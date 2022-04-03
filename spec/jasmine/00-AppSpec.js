/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;

describe("App should support", function () {

  beforeAll((done) => {
    thx = new THiNX();
    thx.init(() => {
      done();
    });
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
  }, 20000);

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
  }, 20000);

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
  }, 20000);

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
  }, 20000);

});

describe("Session Management", function () {

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
        expect(res.text).to.equal('{"success":false,"status":"invalid_credentials"}');
        done();
      });
  }, 20000);

  it("/api/logout (without session)", function (done) {
    chai.request(thx.app)
      .get('/api/logout')
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string'); // html...
        done();
      });
  }, 20000);

});
