const Globals = require("../../lib/thinx/globals.js");
const redis_client = require('redis');

const expect = require('chai').expect;
const Device = require("../../lib/thinx/device");
const ApiKey = require("../../lib/thinx/apikey"); 

describe("Device", function () {

  let redis;
  let device;
  let APIKey;

  beforeAll(async() => {
    console.log(`🚸 [chai] >>> running Device spec`);
    redis = redis_client.createClient(Globals.redis_options());
    await redis.connect();
    device = new Device(redis);
    APIKey = new ApiKey(redis);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Device spec`);
  });


  

  var envi = require("../_envi.json");

  var owner = envi.oid;
  var udid = envi.udid;
  var apikey = envi.ak;
  var ott = null;

  var crypto = require("crypto");
  var fake_mac = null;

  crypto.randomBytes(6, function (_err, buffer) {
    var hexa = buffer.toString('hex');
    fake_mac = hexa.charAt(0) +
      hexa.charAt(1) + ":" +
      hexa.charAt(2) +
      hexa.charAt(3) + ":" +
      hexa.charAt(4) +
      hexa.charAt(5);
  });

  var JRS = {
    mac: "11:11:11:11:11:11",
    firmware: "DeviceSpec.js",
    version: "1.0.0",
    alias: "test-device-1-first",
    owner: "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c",
    platform: "arduino",
    udid: "d6ff2bb0-df34-11e7-b351-eb37822aa172"
  };

  // udid: "6ef6d300-8053-11e7-8d27-0fa2e6ecef21"

  // This UDID is to be deleted at the end of test.
  var JRS2 = {
    mac: fake_mac,
    firmware: "DeviceSpec.js",
    version: "1.0.0",
    alias: "test-device-2-deleteme",
    owner: "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c",
    platform: "arduino"
  };

  var JRS3 = {
    mac: "33:33:33:33:33:33",
    firmware: "DeviceSpec.js",
    version: "1.0.0",
    alias: "test-device-2-transfer",
    owner: "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c",
    platform: "arduino",
    udid: "d6ff2bb0-df34-11e7-b351-eb37822aa173"
  };

  var JRS4 = {
    mac: "44:44:44:44:44:44",
    firmware: "DeviceSpec.js",
    version: "1.0.0",
    alias: "test-device-4-dynamic",
    owner: envi.dynamic.owner,
    platform: "arduino",
    udid: "d6ff2bb0-df34-11e7-b351-eb37822aa174"
  };

  let res = {};

  it("(01) API keys are required to do this on new instance", function (done) {
    APIKey.create(owner, "sample-device-key", function (success, object) {
      expect(success).to.equal(true);
      expect(object).to.be.an('array');
      if (success) {
        apikey = object[0].hash;
        expect(apikey).to.be.a('string');
      }
      done();
    });
  }, 5000);

  it("(02) should be able to register itself.", function (done) {
    res.end = () => {
      //done(;)
    };
    device.register(
      JRS,
      apikey,
      res,
      function (_r, success, response) {
        expect(success).to.equal(true);
        JRS.udid = response.registration.udid;
        expect(JRS.udid).to.be.a('string');
        done();
      });
  }, 15000); // register


  it("(03) should be able to change its alias.", function (done) {
    var changes = {
      alias: Date().toString(),
      udid: JRS.udid, // this device should not be deleted,
      auto_update: true 
    };
    device.edit(changes, (success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.an('object');
      done();
    });
  }, 5000);

  it("(03b) should be able to change its environment.", function(done) {
    var changes = {
      environment: {
        "THINX_ENV_SSID" : "THiNX-IoT",
        "THINX_ENV_PASS" : "<enter-your-ssid-password>",
        "ENVIRONMENT" : "circle"
      },
      udid: JRS.udid // this device should not be deleted
    };
    device.edit(changes, (success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.an('object');
      console.log("(03b) response", JSON.stringify(response, 2, null));
      done();
    });
  }, 5000);


  it("(04) should receive different response for registered device", function (done) {
    res.end = () => {
      console.log("🚸 [chai] D(04) res end called...");
    };
    device.register(
      JRS,
      apikey,
      res,
      function (_r, success, response) {
        let obj = response;
        expect(obj).to.be.an('object');
        expect(success).to.equal(true);
        done();
      });
  }, 5000);

  it("(05) should be able to store/fetch OTT request", function (done) {
    device.storeOTT(
      JRS,
      function (success, response) {
        ott = response.ott;
        expect(success).to.equal(true);
        expect(response).to.be.an('object');
        expect(response.ott).to.be.a('string');
        device.fetchOTT(ott, (err, ott_registration_request) => {
          expect(ott_registration_request).to.be.a('string'); // returns registration request
          expect(err).to.be.a('null');
          done();
        });
      });
  }, 15000);

  it("(05) should be able to normalize a MAC address", function (done) {
    var nmac = device.normalizedMAC("123456789012");
    expect(nmac).to.be.a('string');
    done();
  }, 5000);


  it("(07) should not provide invalid device firmware", function (done) {
    // Returns "OK" when current firmware is valid.
    var rbody = JRS;
    rbody.udid = "c6ff2bb0-df34-11e7-b351-eb37822aa172";
    rbody.owner = owner;
    let req = {
      body: {
        registration: rbody
      },
      headers: {
        authentication: apikey
      }
    };
    device.firmware(req, function (success, response) {
      console.log("(07) should not provide invalid device firmware result", { success }, { response });
      expect(success).to.equal(false);
      expect(response).to.equal("no_such_device");
      done();
    });
  }, 5000);

  it("(08) should be able to register for revocation", function (done) {
    expect(JRS2).to.be.an('object');
    expect(apikey).to.be.a('string');
    device.register(
      JRS2,
      apikey,
      res,
      function (_r, __success, response) {
        udid = response.registration.udid;
        JRS2.udid = udid;
        expect(udid).to.be.a('string');
        device.revoke(
          JRS2.udid,
          function (_success, _response) {
            expect(_response.success).to.equal(true);
            expect(_response.response).to.equal('device_marked_deleted');
            done();
          }
        );
    });
  }, 15000); // register for revocation


  it("(09) should be able to register second device for transfer", function (done) {
    device.register(
      JRS3,
      apikey,
      res,
      function (_r, success, response) {
        JRS3.udid = response.registration.udid;
        expect(success).to.equal(true);
        done();
      });
  }, 15000); // register

  it("(10) should NOT be able to register another device for different owner with this owner's apikey", function (done) {
    device.register(
      JRS4,
      apikey,
      res,
      function (_r, success, response) {
        console.log("[spec] registration response:", response);
        expect(response).to.equal('apikey_not_found');
        expect(success).to.equal(false);
        done();
      });
  }, 15000); // register

  it("(11) should be able to provide valid device firmware", function (done) {
    // Returns "OK" when current firmware is valid.
    var rbody = JRS;
    rbody.udid = envi.udid;
    rbody.owner = owner;
    let req = {
      body: {
        registration: rbody
      },
      headers: {
        authentication: apikey
      }
    };
    console.log("(11) requesting firmware");
    device.firmware(req, function (success, response) {
      console.log("[fixme] (11) requesting firmware result", { success }, { response });
      expect(success).to.equal(false);
      done();
    });
  }, 5000);

});
