/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
var envi = require("../_envi.json");
chai.use(chaiHttp);

let thx;

describe("Devices", function () {

  beforeAll((done) => {
    thx = new THiNX();
    thx.init(() => {
      done();
    });
  });

  it("GET /api/user/devices (noauth)", function (done) {
    console.log("🚸 [chai] GET /api/user/devices (noauth)");
    chai.request(thx.app)
      .get('/api/user/devices')
      .end((err, res) => {
        console.log("🚸 [chai] GET /api/user/devices (noauth) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/devices (cookie)", function (done) {
    console.log("🚸 [chai] GET /api/user/devices (cookie)");
    chai.request(thx.app)
      .get('/api/user/devices')
      .set('Cookie', 'thx-session-cookie=something;owner=' + envi.oid)
      .end((err, res) => {
        console.log("🚸 [chai] GET /api/user/devices (cookie) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/device/data/:udid" + envi.oid, function (done) {
    console.log("🚸 [chai] GET /api/user/device/data/:udid");
    chai.request(thx.app)
      .get('/api/user/device/data/' + envi.oid)
      .end((err, res) => {
        expect(res.status).to.equal(404);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/edit", function (done) {
    console.log("🚸 [chai] POST /api/device/edit");
    chai.request(thx.app)
      .post('/api/device/edit')
      .send({ changes: { alias: "edited-alias" } })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/edit response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/attach", function (done) {
    console.log("🚸 [chai] POST /api/device/attach");
    chai.request(thx.app)
      .post('/api/device/attach')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/attach response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/detach", function (done) {
    console.log("🚸 [chai] POST /api/device/detach");
    chai.request(thx.app)
      .post('/api/device/detach')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/detach response:", res.text, " status:", res.status);
        expect(res.status).to.equal(403);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/mesh/attach", function (done) {
    console.log("🚸 [chai] POST /api/device/mesh/attach");
    chai.request(thx.app)
      .post('/api/device/mesh/attach')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/mesh/attach response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  // POST /api/device/mesh/detach
  it("POST /api/device/mesh/detach", function (done) {
    console.log("🚸 [chai] POST /api/device/mesh/detach");
    chai.request(thx.app)
      .post('/api/device/mesh/detach')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/mesh/detach response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/data", function (done) {
    console.log("🚸 [chai] POST /api/device/data");
    chai.request(thx.app)
      .post('/api/device/data')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] response /api/device/data:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/revoke", function (done) {
    console.log("🚸 [chai] POST /api/device/revoke");
    chai.request(thx.app)
      .post('/api/device/revoke')
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/revoke response:", res.text, " status:", res.status);
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
    console.log("🚸 [chai] POST /api/device/push");
    chai.request(thx.app)
      .post('/api/device/push')
      .send({ key: "value" })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/push response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);
});

describe("Devices (JWT)", function () {

  let agent;
  let jwt;

  var JRS5 = {
    mac: "55:55:55:55:55:55",
    firmware: "ZZ-RouterDeviceSpec.js",
    version: "1.0.0",
    alias: "test-device-5-dynamic",
    owner: envi.dynamic.owner,
    platform: "arduino"
  };

  beforeAll((done) => {
    agent = chai.request.agent(thx.app);
    agent
      .post('/api/login')
      .send({ username: 'dynamic', password: 'dynamic', remember: false })
      .then(function (res) {
        console.log(`[chai] DeviceSpec (JWT) beforeAll POST /api/login (valid) response: ${JSON.stringify(res)}`);
        expect(res).to.have.cookie('x-thx-core');
        let body = JSON.parse(res.text);
        jwt = 'Bearer ' + body.access_token;
        done();
      })
      .catch((e) => { console.log(e); });
  });

  it("POST /api/user/apikey (X)", function (done) {
    chai.request(thx.app)
      .post('/api/user/apikey')
      .set('Authorization', jwt)
      .send({
        'alias': 'mock-apikey-alias'
      })
      .end((err, res) => {
        //  {"success":true,"api_key":"9b7bd4f4eacf63d8453b32dbe982eea1fb8bbc4fc8e3bcccf2fc998f96138629","hash":"0a920b2e99a917a04d7961a28b49d05524d10cd8bdc2356c026cfc1c280ca22c"}
        expect(res.status).to.equal(200);
        let j = JSON.parse(res.text);
        expect(j.success).to.equal(true);
        expect(j.api_key).to.be.a('string');
        expect(j.hash).to.be.a('string');
        created_api_key = j.hash;
        console.log("[spec] saving apikey (1)", j.api_key);
        done();
      });
  }, 20000);

  it("POST /device/register (jwt, valid)", function (done) {

    chai.request(thx.app)
      .post('/device/register')
      .set('Authentication', created_api_key)
      .send({ registration: JRS5 })
      .end((err, res) => {
        console.log("🚸 [chai] POST /device/register (jwt, valid) response:", res.text);
        expect(res.status).to.equal(200);
        let r = JSON.parse(res.text);
        console.log("🚸 [chai response", JSON.stringify(r));
        JRS5.udid = r.registration.udid;
        // TODO: Store UDID!
        expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/devices (JWT)", function (done) {
    console.log("🚸 [chai] GET /api/user/devices (JWT)");
    agent
      .get('/api/user/devices')
      .set('Authorization', jwt)
      .end((err, res) => {
        console.log("🚸 [chai] GET /api/user/devices (JWT) response:", res.text, " status:", res.status);
        // TODO: Store UDID!
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("GET /api/user/device/data/:udid" + envi.oid, function (done) {
    console.log("🚸 [chai] GET /api/user/device/data/:udid");
    agent
      .get('/api/user/device/data/' + envi.oid)
      .set('Authorization', jwt)
      .end((err, res) => {
        expect(res.status).to.equal(404);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/edit", function (done) {
    console.log("🚸 [chai] POST /api/device/edit (JWT)");
    agent
      .post('/api/device/edit')
      .set('Authorization', jwt)
      .send({ changes: { alias: "edited-alias" } })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/edit (JWT)response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/attach", function (done) {
    console.log("🚸 [chai] POST /api/device/attach (JWT)");
    agent
      .post('/api/device/attach')
      .set('Authorization', jwt)
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/attach (JWT) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/attach", function (done) {
    console.log("🚸 [chai] POST /api/device/attach (JWT) 2");
    agent
      .post('/api/device/attach')
      .set('Authorization', jwt)
      .send({ udid: JRS5.udid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/attach (JWT) 2 response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/detach", function (done) {
    console.log("🚸 [chai] POST /api/device/detach  (JWT)");
    agent
      .post('/api/device/detach')
      .set('Authorization', jwt)
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/detach  (JWT) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/detach", function (done) {
    console.log("🚸 [chai] POST /api/device/detach  (JWT) 2");
    agent
      .post('/api/device/detach')
      .set('Authorization', jwt)
      .send({ udid: JRS5.udid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/detach  (JWT) 2 response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  let mesh_id;

  it("POST /api/mesh/create (jwt, valid)", function (done) {
    agent
      .post('/api/mesh/create')
      .set('Authorization', jwt)
      .send({ alias: "device-mesh-alias", owner_id: envi.dynamic.owner, mesh_id: 'device-mesh-id' })
      .end((err, res) => {
        let r = JSON.parse(res.text);
        mesh_id = r.mesh_id;
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":true,"mesh_ids":{"mesh_id":"device-mesh-id","alias":"device-mesh-alias"}}');
        done();
      });
  }, 20000);

  it("POST /api/device/mesh/attach", function (done) {
    console.log("🚸 [chai] POST /api/device/mesh/attach (JWT)");
    agent
      .post('/api/device/mesh/attach')
      .set('Authorization', jwt)
      .send({ udid: envi.dynamic.udid, mesh_id: mesh_id })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/mesh/attach (JWT) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/mesh/attach", function (done) {
    console.log("🚸 [chai] POST /api/device/mesh/attach (JWT) 2");
    agent
      .post('/api/device/mesh/attach')
      .set('Authorization', jwt)
      .send({ udid: JRS5.udid, mesh_id: mesh_id })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/mesh/attach (JWT) 2 response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  // POST /api/device/mesh/detach
  it("POST /api/device/mesh/detach", function (done) {
    console.log("🚸 [chai] POST /api/device/mesh/detach (JWT)");
    agent
      .post('/api/device/mesh/detach')
      .set('Authorization', jwt)
      .send({ udid: envi.dynamic.udid, mesh_id: mesh_id })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/mesh/detach (JWT) response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/mesh/detach", function (done) {
    console.log("🚸 [chai] POST /api/device/mesh/detach (JWT) 2");
    agent
      .post('/api/device/mesh/detach')
      .set('Authorization', jwt)
      .send({ udid: JRS5.udid, mesh_id: mesh_id })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/mesh/detach (JWT) 2 response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/data", function (done) {
    console.log("🚸 [chai] POST /api/device/data (JWT)");
    agent
      .post('/api/device/data')
      .set('Authorization', jwt)
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] response /api/device/data (JWT):", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/data", function (done) {
    console.log("🚸 [chai] POST /api/device/data (JWT) 2");
    agent
      .post('/api/device/data')
      .set('Authorization', jwt)
      .send({ udid: JRS5.udid })
      .end((err, res) => {
        console.log("🚸 [chai] response /api/device/data (JWT) 2:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/revoke", function (done) {
    console.log("🚸 [chai] POST /api/device/revoke (JWT)");
    agent
      .post('/api/device/revoke')
      .set('Authorization', jwt)
      .send({ udid: envi.oid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/revoke (JWT) response:", res.text, " status:", res.status);
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
    console.log("🚸 [chai] POST /api/device/push (JWT)");
    agent
      .post('/api/device/push')
      .set('Authorization', jwt)
      .send({ key: "value" })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/push (JWT) response:", res.text, " status:", res.status);
        // no messenger, will fail here...
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/revoke", function (done) {
    console.log("🚸 [chai] POST /api/device/revoke (JWT) 2");
    agent
      .post('/api/device/revoke')
      .set('Authorization', jwt)
      .send({ udid: JRS5.udid })
      .end((err, res) => {
        console.log("🚸 [chai] POST /api/device/revoke (JWT) 2 response:", res.text, " status:", res.status);
        //expect(res.status).to.equal(200);
        //expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);
});