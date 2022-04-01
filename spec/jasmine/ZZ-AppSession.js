/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;
var agent;

describe("Session Management", function () {

  beforeAll((done) => {
    thx = new THiNX();
    thx.init(() => {
      agent = chai.request.agent(thx.app);
      done();
    });
  });

  afterAll((done) => {
    agent.close();
    done();
  });

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

  it("POST /api/login (valid)", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'cimrman', password: 'tset', remember: false })
      .then(function (res) {
        console.log(`[chai] POST /api/login (valid)response: ${res.text} status: ${res.status}`);
        // expect(res).to.have.cookie('x-thx-core');
        done();
        /*
        // The `agent` now has the sessionid cookie saved, and will send it
        // back to the server in the next request:
        return agent.get('/user/me')
          .then(function (res) {
            expect(res).to.have.status(200);*/
      });
  }, 20000);

});
