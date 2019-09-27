describe("Devices", function() {

  var generated_key_hash = null;

  var Devices = require("../../lib/thinx/devices");
  var devices = new Devices();

  var envi = require("./_envi.json");
  var owner = envi.oid;
  var source_id = envi.sid;
  var udid = envi.udid;
  var ak = envi.ak;

  // All of this expects successful device registration to safely revoke!

  it("should be able to list devices for owner", function(done) {
    devices.list(owner, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("Device list: " , {response});
      done();
    });
  }, 5000);

  it("should be able to attach a repository to device(s)", function(done) {
    var body = {
      source_id: source_id,
      udid: udid
    };
    console.log("Attach request...");
    devices.attach(owner, body, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("Attach response: " , {response});
      console.log("Waiting for response......");
      done();
    });
  }, 30000);

  it("should be able to detach a repository from device(s)", function(done) {
    var body = {
      udid: udid
    };
    devices.detach(owner, body, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
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
      udid: udid
    };
    devices.revoke(owner, body, function(success, response) {
      expect(success).toBe(true);
      console.log("Revoke response: " , {response});
      done();
    });
  }, 30000);
});
