describe("Devices", function() {

  var generated_key_hash = null;
  var devices = require('../../lib/thinx/devices');

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
      console.log("Device list: " + JSON.stringify(response));
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
      console.log("Attach response: " + JSON.stringify(response));
      console.log("Waiting for response......");
      done();
    });
  }, 5000);

  it("should be able to detach a repository from device(s)", function(done) {
    var body = {
      udid: udid
    };
    devices.detach(owner, body, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("Detach response: " + JSON.stringify(response));
      done();
    });
  }, 30000);

  // requires specific device registered for this test only (udid "6ef6d300-8053-11e7-8d27-0fa2e6ecef21")
  it("should be able to revoke devices for owner", function(done) {
    var body = {
      udid: udid
    };
    devices.revoke(owner, body, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("Revoke response: " + JSON.stringify(response));
      done();
    });
  }, 30000);
});
