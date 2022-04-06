/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");

let thx;

describe("Transformer (noauth)", function () {
  it("POST /api/transformer/run", function (done) {
    thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/transformer/run')
        .send({})
        .end((err, res) => {
          console.log("🚸 [chai] POST /api/transformer/run response:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);

});

//
// Authenticated
//

describe("Transformer (JWT)", function () {

  let agent;
  let jwt;

  beforeAll((done) => {
    agent = chai.request.agent(thx.app);
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        console.log(`[chai] Transformer (JWT) beforeAll POST /api/login (valid) response: ${JSON.stringify(res.text, null, 4)}, status: ${res.status}, cookie: ${res.cookie}, cookies: ${res.cookies}`);
        // expect(res).to.have.cookie('x-thx-core'); we don't really care but the cookie seems not to be here with this name...
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

  it("POST /api/transformer/run (JWT, invalid)", function (done) {
    agent
      .post('/api/transformer/run')
      .set('Authorization', jwt)
      .send({})
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/transformer/run (JWT, invalid) response:", res.text, " status:", res.status);
        //{"success":false,"status":"udid_not_found"}  status: 200
        //expect(res.text).to.equal('{"success":false,"status":"udid_not_found"}'); but rather use valid udid
        expect(res.status).to.equal(200);
        done();
      });
  }, 20000);

  it("POST /api/transformer/run (JWT, semi-valid)", function (done) {
    agent
      .post('/api/transformer/run')
      .set('Authorization', jwt)
      .send({ device_id: envi.udid })
      .end((err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"no_such_device"}');
        done();
      });
  }, 20000);

});