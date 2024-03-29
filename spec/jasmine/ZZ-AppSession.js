/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;
var agent;

describe("ZZ-AppSession Session Management", function () {

  beforeAll((done) => {
    thx = new THiNX();
    thx.init(() => {
      agent = chai.request.agent(thx.app);
      console.log(`🚸 [chai] >>> running AppSession spec`);
      done();
    });
  });

  afterAll((done) => {
    agent.close();
    console.log(`🚸 [chai] <<< completed AppSession spec`);
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
        expect(res.text).to.equal('{"success":false,"response":"invalid_credentials"}');
        done();
      });
  }, 30000);

  it("/api/logout (without session)", function (done) {
    chai.request(thx.app)
      .get('/api/logout')
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string'); // html...
        done();
      });
  }, 30000);

  it("POST /api/login (valid)", function (done) {
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        console.log(`🚸 [chai] POST /api/login (valid)response: ${JSON.stringify(res.text, null, 2)} status: ${res.status} with cookie ${res.cookie}`);
        done();
        /*
        // The `agent` now has the sessionid cookie saved, and will send it
        // back to the server in the next request:
        return agent.get('/user/me')
          .then(function (res) {
            expect(res).to.have.status(200);*/
      })
      .catch((e) => console.log("/api/login (valid) e:", e));
  }, 30000);

  it("POST /api/user/logs/tail (with session)", function (done) {
    agent
      .post('/api/user/logs/tail')
      .send({
        'body': 'nonsense'
      })
      .end((err, res) => {
        expect(res.status).to.equal(200); // not implemented at this stage
        done();
      });
  }, 30000);


});
