describe("Device", function() {

  var generated_key_hash = null;
  var device = require('../../lib/thinx/device');

  var envi = require("_envi.json");
  var owner = envi.owner;
  var udid = envi.udid;
  var apikey = envi.ak;

  var RS =
    '{ "registration" : { "mac" : "00:00:00:00:00:00:00", "firmware" : "DeviceSpec.js", "version" : "1.0.0", "checksum" : "nevermind", "push" : "forget", "alias" : "npmtest", "owner": "18ea285983df355f3024e412fb46ad6cbd98a7ffe6872e26612e35f38aa39c41", "udid": "to-be-deleted-on-test", "owner": "' +
    owner + '" } }';

  var body = JSON.parse(RS);

  it("should be able to register a device", function(done) {
    device.register(JSON.parse(RS), apikey,
      function(success, response) {
        console.log("Registration result: " + JSON.stringify(response));
        expect(success).toBe(true);
        done();
      }, 5000);

    it("should be able to edit device alias",
      function(done) {
        var changes = {
          alias: Date().toString(),
          udid: "to-be-deleted-on-test"
        };
        device.edit(owner, changes, function(
          success, response) {
          console.log("Editing result: " + JSON
            .stringify(response));
          expect(success).toBe(true);
          expect(response).toBeDefined();
          done();
        });
      });
  }, 5000);

  it(
    "should receive different response for already-registered revice",
    function(done) {
      device.register(JSON.parse(RS), apikey,
        function(success, response) {
          console.log("Re-registration result: " + JSON.stringify(
            response));
          expect(success).toBe(true);
          done();
        });

    }, 5000);

  it("should be able to provide device firmware", function(done) {
    // Returns "OK" when current firmware is valid.
    device.firmware(body, apikey, function(success, response) {
      console.log("Firmware fetch result: " + JSON.stringify(
        response));
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("Firmware check response: " + JSON.stringify(
        response));
      done();
    });
  }, 5999);

});
