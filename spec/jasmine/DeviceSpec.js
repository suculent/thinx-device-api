describe("Device", function() {

  var expect = require('chai').expect;
  var Device = require("../../lib/thinx/device"); var device = new Device();
  var ApiKey = require("../../lib/thinx/apikey"); var APIKey = new ApiKey();

  var envi = require("../_envi.json");

  var owner = envi.oid;
  var udid = envi.udid;
  var apikey = envi.ak;
  var ott = null;

  var crypto = require("crypto");
  var fake_mac = null;

  crypto.randomBytes(6, function(err, buffer) {
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

  it("(01) API keys are required to do this on new instance", function(done) {    
    APIKey.create( owner, "sample-device-key", function(success, object) {
      expect(success).to.be.true;
      expect(object).to.be.an('array');
      if (success) {
        apikey = object[0].hash;
        expect(apikey).to.be.a('string');
      }
      done();
    });
  }, 5000);

  it("(02) should be able to register itself.", function(done) {
    let ws = {};
    device.register(
      {}, /* req */
      JRS,
      apikey,
      ws,
      function(success, response) {
        if (success === false) {
          console.log("[spec] registration error response:", response);
          if (response.indexOf("owner_found_but_no_key") !== -1) {
            done();
            return;
          }
        }
        JRS.udid = response.registration.udid;
        expect(success).to.be.true;
        expect(JRS.udid).to.be.a('string');
        done();
      });
  }, 15000); // register


  it("(03) should be able to change its alias.", function(done) {
    var changes = {
      alias: Date().toString(),
      udid: JRS.udid // this device should not be deleted
    };
    device.edit(owner, changes, (success, response) => {
      expect(success).to.be.true;
      expect(response).to.be.an('object');
      done();
    });
  }, 5000);


  it("(04) should receive different response for registered device", function (done) {
    device.register(
      {}, /* req */
      JRS,
      apikey,
      null,
      function (success, response) {
        let obj = response;
        expect(obj).to.be.an('object');
        if (success === false) {
          expect(success).to.equal(false);
        } else {
          expect(success).to.equal(true);
        }
        done();
      });
    }, 5000);

  it("(05) should be able to store/fetch OTT request", function(done) {
    device.storeOTT(
      JRS, 
      function(success, response) {
      ott = response.ott;
      expect(success).to.be.true;
      expect(response).to.be.an('object');
      expect(response.ott).to.be.a('string');
      device.fetchOTT(ott, (err, ott_registration_request) => {
        expect(ott_registration_request).to.be.a('string'); // returns registration request
        expect(err).to.be.null;
        done();
      });
    });
  }, 15000);

  it("(05) should be able to normalize a MAC address", function(done) {
    var nmac = device.normalizedMAC("123456789012");
    expect(nmac).to.be.a('string');
    done();
  }, 5000);

  it("(07) should be able to provide device firmware", function(done) {
      // Returns "OK" when current firmware is valid.
      var rbody = JRS;
      rbody.udid = udid;
      rbody.owner = owner;
      let req = {
        body: {
          registration: rbody
        },
        headers: {
          authentication: apikey
        }
      };
      console.log("(07) requesting firmware");
      device.firmware(req, function(success, response) {
        console.log("(07) requesting firmware result", {success}, {response});
        expect(success).to.equal(false);
        expect(response.success).to.equal(false);
        expect(response.status).to.equal("UPDATE_NOT_FOUND");
        done();
      });
    }, 5000);

  it("(08) should be able to register for revocation", function(done) {
    expect(JRS2).to.be.an('object');
    expect(apikey).to.be.a('string');
    device.register(
      {}, /* req */
      JRS2,
      apikey,
      null,
      function(success, response) {
        udid = response.registration.udid;
        JRS2.udid = udid;
        expect(udid).to.be.a('string');
        device.revoke(
          JRS2.udid,
          function(_success, _response) {
            expect(_response.success).to.be.true;
            expect(_response.status).to.equal('device_marked_deleted');
            done();
        });
      });
  }, 15000); // register for revocation


  it("(09) should be able to register second device for transfer", function(done) {
    let ws = {};
    device.register(
      {}, /* req */
      JRS3,
      apikey,
      ws,
      function(success, response) {
        JRS3.udid = response.registration.udid;
        if (success === false) {
          console.log("[spec] registration error response:", response);
          if (response.indexOf("owner_found_but_no_key") !== -1) {
            done();
            return;
          }
        }
        done();
      });
  }, 15000); // register

  it("(10) should be able to register another device for different owner", function(done) {
    let ws = {};
    device.register(
      {}, /* req */
      JRS4,
      apikey,
      ws,
      function(success, response) {
        JRS4.udid = response.registration.udid;
        if (success === false) {
          console.log("[spec] registration error response:", response);
          if (response.indexOf("owner_found_but_no_key") !== -1) {
            done();
            return;
          }
        }
        done();
      });
  }, 15000); // register

});
