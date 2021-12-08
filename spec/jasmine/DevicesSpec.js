describe("Devices", function() {

  var expect = require('chai').expect;
  
  var Messenger = require('../../lib/thinx/messenger');
  var messenger = new Messenger().getInstance();

  var Devices = require("../../lib/thinx/devices");
  var devices = new Devices(messenger);

  var Device = require("../../lib/thinx/device");
  var device = new Device();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var source_id = envi.sid;
  var ak = envi.ak;

  // This UDID is to be deleted at the end of test.
  var TEST_DEVICE = {
    mac: "00:00:00:00:00:01",
    firmware: "DeviceSpec.js",
    version: "1.0.0",
    checksum: "alevim",
    push: "forget",
    alias: "virtual-test-device-3-dynamic",
    owner: owner,
    platform: "arduino",
    udid: envi.udid
  };

  it("(01) should be able to register sample device", function(done) {
    console.log("Sample attempt to register a device", {TEST_DEVICE}, "with ak", ak);
    device.register(
      {}, /* req */
      { registration: TEST_DEVICE }, /* reg */
      ak,
      {}, /* ws */
      (success, response) => {
        if (success === false) {
          console.log("(01) registration response", response);
          expect(response).to.be.a('string');
          if (response === "owner_found_but_no_key") {
            done();
            return;
          }
        }
        console.log("(01) Registration result(2): ", {response});
        console.log("(01) Sample UDID: " + TEST_DEVICE.udid);
        TEST_DEVICE.udid = response.registration.udid;
        console.log("(01) Received UDID: " + TEST_DEVICE.udid);
        expect(success).to.be.true;
        expect(TEST_DEVICE).to.be.an('object');
        expect(response.registration).to.be.an('object');
        expect(TEST_DEVICE.udid).to.be.a('string');
        done();
      });
  }, 15000); // register

  // All of this expects successful device registration to safely revoke!
  
  it("(02) should be able to list devices for owner", function(done) {
    devices.list(owner, (success, response) => {
      expect(success).to.be.true;
      expect(response).to.be.a('object');
      console.log("Device list: " , {response});
      done();
    });
  }, 5000);

  it("(03) should not be able to list devices for empty owner", function(done) {
    devices.list("", (success, response) => {
      expect(success).to.be.true;
      expect(response).to.be.a('object');
      expect(response.devices).to.be.a('array');
      done();
    });
  }, 5000);

  it("(04) should be able to attach a repository to device(s)", function(done) {
    var body = {
      source_id: source_id,
      udid: TEST_DEVICE.udid
    };
    console.log("Attach request...");
    devices.attach(owner, body, (res, success, response) => {
      console.log("Attach results:", res, success, response);
      expect(success).to.be.true;
      expect(response).to.be.a('string');
      done();
    });
  }, 30000);

  it("(05) should be able to detach a repository from device", function(done) {
    var body = {
      udid: TEST_DEVICE.udid
    };
    devices.detach(owner, body, (res, success, response) => {
      console.log("Detach response: ", res, success, response);
      expect(success).to.be.true;
      expect(response).to.be.a('string');
      expect(response).to.equal('detached');
      done();
    }, {});
  }, 30000);

  // requires specific device registered for this test only (udid "d6ff2bb0-df34-11e7-b351-eb37822aa172")
  // this device must be created using DeviceSpec.js test
  it("(06) should be able to revoke devices for owner", function(done) {
    var body = {
      udid: TEST_DEVICE.udid
    };
    devices.revoke(owner, body, (res, success, response) => {
      expect(success);
      console.log("Revoke success: " , {success});
      console.log("Revoke response: " , {response});
      done();
    }, {});
  }, 30000);
});
