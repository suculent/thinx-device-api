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
        .end((_err, res) => {
          //console.log("🚸 [chai] POST /api/transformer/run response:", res.text, " status:", res.status);
          expect(res.status).to.equal(403);
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

  var created_api_key = null;

  var JRS7 = {
    mac: "77:77:77:77:77:77",
    firmware: "ZZ-RouterDeviceSpec.js",
    version: "1.0.0",
    alias: "test-device-7-dynamic",
    owner: envi.dynamic.owner,
    platform: "arduino"
  };

  // create
  it("POST /api/user/apikey (T1)", function (done) {
    chai.request(thx.app)
      .post('/api/user/apikey')
      .set('Authorization', jwt)
      .send({
        'alias': 'transformer-apikey-alias'
      })
      .end((_err, res) => {
        //  {"success":true,"api_key":"9b7bd4f4eacf63d8453b32dbe982eea1fb8bbc4fc8e3bcccf2fc998f96138629","hash":"0a920b2e99a917a04d7961a28b49d05524d10cd8bdc2356c026cfc1c280ca22c"}
        expect(res.status).to.equal(200);
        let j = JSON.parse(res.text);
        expect(j.success).to.equal(true);
        expect(j.api_key).to.be.a('string');
        expect(j.hash).to.be.a('string');
        created_api_key = j.hash;
        console.log("🚸 [chai] saving apikey (T1)", j.api_key);
        done();
      });
  }, 20000);

  it("POST /device/register (jwt, valid)", function (done) {

    chai.request(thx.app)
      .post('/device/register')
      .set('Authentication', created_api_key)
      .send({ registration: JRS7 })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        let r = JSON.parse(res.text);
        JRS7.udid = r.registration.udid;
        // TODO: Store UDID!
        expect(res.text).to.be.a('string');
        done();
      });
  }, 20000);

  it("POST /api/device/edit", function (done) {
    agent
      .post('/api/device/edit')
      .set('Authorization', jwt)
      .send({ changes: { info: { transformers: envi.dynamic.transformers } } })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"message":"changes.udid_undefined"}');
        done();
      });
  }, 20000);

  it("POST /api/device/edit", function (done) {
    agent
      .post('/api/device/edit')
      .set('Authorization', jwt)
      .send({ changes: { info: { transformers: envi.dynamic.transformers }, udid: JRS7.udid } })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        let j = JSON.parse(res.text);
        expect(j.success).to.equal(true);
        console.log("🚸 [chai] POST /api/device/edit response", JSON.stringify(j, null, 2));
        // {"success":true,"message":{"success":true,"change":{"transformers":[{"ufid":"vt:b688d51871191b9f645678b10ce70ec23704ef5c549019b8beeaec9939401756","alias":"Empty","body":"var transformer = function(status, device) { return status };"}],"udid":"64984150-b771-11ec-bf10-f505ba97f5e2","doc":null,"value":null}}} 
        done();
      });
  }, 20000);

  it("POST /api/transformer/run (JWT, invalid)", function (done) {
    agent
      .post('/api/transformer/run')
      .set('Authorization', jwt)
      .send({})
      .end((_err, res) => {
        expect(res.text).to.equal('{"success":false,"status":"udid_not_found"}');
        expect(res.status).to.equal(200);
        done();
      });
  }, 20000);

  it("POST /api/transformer/run (JWT, semi-valid)", function (done) {
    agent
      .post('/api/transformer/run')
      .set('Authorization', jwt)
      .send({ device_id: envi.dynamic.udid })
      .end((_err, res) => {
        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');
        expect(res.text).to.equal('{"success":false,"status":"no_such_device"}');
        done();
      });
  }, 20000);

  it("POST /api/transformer/run (JWT, valid, trans)", function (done) {

    agent
      .get('/api/user/devices')
      .set('Authorization', jwt)
      .end((_err, res) => {
        let r = JSON.parse(res.text);

        /* {
            "success": true,
            "devices": [
              {
                "alias": "****-device-5-dynamic",
                "auto_update": false,
                "category": "grey-mint",
                "checksum": null,
                "commit": "Unknown",
                "description": "new device",
                "environment": {},
                "env_hash": null,
                "firmware": "ZZ-RouterDeviceSpec.js",
                "icon": "01",
                "lastupdate": "2022-04-08T15:05:22.153Z",
                "lat": 0,
                "lon": 0,
                "mac": "55:55:55:55:55:55",
                "mesh_ids": [],
                "owner": "bab692f8c9c78cf64f579406bdf6c6cd2c4d00b3c0c8390387d051495dd95247",
                "platform": "arduino",
                "rssi": " ",
                "snr": " ",
                "source": null,
                "station": " ",
                "status": " ",
                "tags": [],
                "timezone_abbr": "UTC",
                "timezone_offset": 0,
                "transformers": [],
                "udid": "4fd4e580-b74d-11ec-9ecb-3f8befeb85e6",
                "version": "1.0.0"
              }
            ]
          }
          */

        // skip run until device is available; coverage will grow but it should not fail
        if (r.devices.length == 0) return done();

        let udid = r.devices[0].udid; // or JRS7.udid

        expect(res.status).to.equal(200);
        expect(res.text).to.be.a('string');

        agent
          .post('/api/transformer/run')
          .set('Authorization', jwt)
          .send({ device_id: udid })
          .end((__err, __res) => {
            // console.log("🚸 [chai] POST /api/transformer/run (JWT, semi-valid) response:", __res.text, " status:", __res.status);
            /* Responds:
            {
              "success": true,
              "status": {
                "registration": {
                  "success": true,
                  "status": "OK",
                  "auto_update": false,
                  "owner": "bab692f8c9c78cf64f579406bdf6c6cd2c4d00b3c0c8390387d051495dd95247",
                  "alias": "****-device-5-dynamic",
                  "mesh_ids": [],
                  "udid": "4fd4e580-b74d-11ec-9ecb-3f8befeb85e6",
                  "timestamp": 1649430322
                }
              }
            }
            */
            let j = JSON.parse(__res.text);
            expect(j.success).to.equal(true);
            expect(__res.status).to.equal(200);
            //
            done();
          });
      });

  }, 20000);

});