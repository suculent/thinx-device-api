describe("Devices", function() {

  var expect = require('chai').expect;
  
  var generated_key_hash;

  var Messenger = require('../../lib/thinx/messenger');
  var messenger = new Messenger().getInstance();

  var Devices = require("../../lib/thinx/devices");
  var devices = new Devices(messenger);

  var Device = require("../../lib/thinx/device");
  var device = new Device();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var source_id = envi.sid;
  var udid = envi.udid;
  var ak = envi.ak;

  var crypto = require("crypto");
  var fake_mac = null;

  function doFakeMac() {
    crypto.randomBytes(6, (err, buffer) => {
      var hexa = buffer.toString('hex');
      this.fake_mac = hexa.charAt(0) +
                hexa.charAt(1) + ":" +
                hexa.charAt(2) +
                hexa.charAt(3) + ":" +
                hexa.charAt(4) +
                hexa.charAt(5);
    });
  }

  fake_mac = doFakeMac();

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
    udid: null
  };

  it("should be able to register test device", function(done) {
    console.log("Test attempt to register device", {TEST_DEVICE}, "with ak", ak);
    device.register(
      {}, /* req */
      TEST_DEVICE, /* reg */
      ak,
      {}, /* ws */
      (success, response) => {
        if (success === false) {
          console.log(response);
          expect(response).to.be.a('string');
          if (response === "owner_found_but_no_key") {
            done();
            return;
          }
        }
        console.log("• DeviceSpec.js: Registration result: ", {response});
        expect(success);
        expect(TEST_DEVICE);
        expect(response.registration);
        TEST_DEVICE.udid = response.registration.udid;
        expect(TEST_DEVICE.udid).to.be.a('string');
        console.log("• DevicesSpec.js: Received UDID: " + TEST_DEVICE.udid);
        done();
      });
  }, 15000); // register

  // All of this expects successful device registration to safely revoke!
  
  it("should be able to list devices for owner", function(done) {
    devices.list(owner, (success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.a('object');
      console.log("Device list: " , {response});
      done();
    });
  }, 5000);

  it("should not be able to list devices for empty owner", function(done) {
    devices.list("", (success, response) => {
      expect(success).to.equal(true);
      expect(response).to.be.a('object');
      expect(response.devices).to.be.a('array');
      console.log("Should be empty Device list in: " , {response});
      done();
    });
  }, 5000);

  it("should be able to attach a repository to device(s)", function(done) {
    var body = {
      source_id: source_id,
      udid: TEST_DEVICE.udid
    };
    console.log("Attach request...");
    devices.attach(owner, body, (success, response) => {
      expect(success);
      expect(response);
      console.log("Attach response: " , {response});
      done();
    });
  }, 30000);

  it("should be able to detach a repository from device", function(done) {
    var body = {
      udid: TEST_DEVICE.udid
    };
    devices.detach(owner, body, (success, response) => {
      expect(success);
      expect(response);
      console.log("Detach success: " , {success});
      console.log("Detach response: " , {response});
      if (success === false) {
        console.log("Detach response: " , {response});
      }
      done();
    });
  }, 30000);

  // requires specific device registered for this test only (udid "d6ff2bb0-df34-11e7-b351-eb37822aa172")
  // this device must be created using DeviceSpec.js test
  it("should be able to revoke devices for owner", function(done) {
    var body = {
      udid: TEST_DEVICE.udid
    };
    devices.revoke(owner, body, (success, response) => {
      expect(success);
      console.log("Revoke success: " , {success});
      console.log("Revoke response: " , {response});
      done();
    });
  }, 30000);
});
