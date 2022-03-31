/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
var envi = require("../_envi.json");
chai.use(chaiHttp);

describe("Devices", function () {

  it("GET /api/user/devices", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .get('/api/user/devices')
        .end((err, res) => {
          console.log("[chai] response:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);

  it("GET /api/device/data/" + envi.oid, function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .get('/api/user/device/data/' + envi.oid)
        .end((err, res) => {
          console.log("[chai] response:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);

  it("POST /api/device/edit", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/device/edit')
        .send({ changes: { alias: "edited-alias" } })
        .end((err, res) => {
          console.log("[chai] response:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);

  it("POST /api/device/detach", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/device/detach')
        .send({ udid: envi.oid })
        .end((err, res) => {
          console.log("[chai] response:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);

  it("POST /api/device/mesh/attach", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/device/mesh/attach')
        .send({ udid: envi.oid })
        .end((err, res) => {
          console.log("[chai] response:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);

  // POST /api/device/mesh/detach
  it("POST /api/device/mesh/detach", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/device/mesh/detach')
        .send({ udid: envi.oid })
        .end((err, res) => {
          console.log("[chai] response:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);

  it("POST /api/device/data", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/device/data')
        .send({ udid: envi.oid })
        .end((err, res) => {
          console.log("[chai] response /api/device/data:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);

  it("POST /api/device/revoke", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/device/revoke')
        .send({ udid: envi.oid })
        .end((err, res) => {
          console.log("[chai] response:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);

});

describe("Device Configuration", function () {
  // push device configuration over MQTT
  it("POST /api/device/push", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/device/push')
        .send({ key: "value" })
        .end((err, res) => {
          console.log("[chai] response:", res.text, " status:", res.status);
          //expect(res.status).to.equal(200);
          //expect(res.text).to.be.a('string');
          done();
        });
    });
  }, 20000);
});
