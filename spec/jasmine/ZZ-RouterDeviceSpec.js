/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
var envi = require("../_envi.json");
chai.use(chaiHttp);

describe("Devices", function () {

  let thx;

  beforeAll((done) => {
    thx = new THiNX();
    thx.init(() => {
      done();
    });
  });

  it("GET /api/user/devices (noauth)", function (done) {
    console.log("GET /api/user/devices");
    chai.request(thx.app)
      .get('/api/user/devices')
      .end((err, res) => {
        console.log("[chai] response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/devices (cookie)", function (done) {
    console.log("GET /api/user/devices");
    chai.request(thx.app)
      .get('/api/user/devices')
      .set('Cookie', 'thx-session-cookie=something;owner='+envi.oid)
      .end((err, res) => {
        console.log("[chai] response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/device/data/:udid" + envi.oid, function (done) {
    console.log("[chai] GET /api/user/device/data/:udid");
    chai.request(thx.app)
      .get('/api/user/device/data/' + envi.oid)
      .end((err, res) => {
        expect(res.status).to.equal(404);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/edit", function (done) {
    console.log("[chai] POST /api/device/edit");
    chai.request(thx.app)
      .post('/api/device/edit')
      .send({ changes: { alias: "edited-alias" } })
      .end((err, res) => {
        console.log("[chai] response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/detach", function (done) {
    console.log("[chai] POST /api/device/detach");
    chai.request(thx.app)
      .post('/api/device/detach')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("[chai] response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/mesh/attach", function (done) {
    console.log("[chai] POST /api/device/mesh/attach");
    chai.request(thx.app)
      .post('/api/device/mesh/attach')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("[chai] response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  // POST /api/device/mesh/detach
  it("POST /api/device/mesh/detach", function (done) {
    console.log("[chai] POST /api/device/mesh/detach");
    chai.request(thx.app)
      .post('/api/device/mesh/detach')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("[chai] response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/data", function (done) {
    console.log("[chai] POST /api/device/data");
    chai.request(thx.app)
      .post('/api/device/data')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("[chai] response /api/device/data:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/revoke", function (done) {
    console.log("[chai] POST /api/device/revoke");
    chai.request(thx.app)
      .post('/api/device/revoke')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("[chai] response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  //
  // Device Configuration
  //

  // push device configuration over MQTT
  it("POST /api/device/push", function (done) {
    console.log("[chai] POST /api/device/push");
    chai.request(thx.app)
      .post('/api/device/push')
      .send({ key: "value" })
      .end((err, res) => {
        console.log("[chai] response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);
});
