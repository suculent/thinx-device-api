describe("Device", function() {

  var generated_key_hash = null;
  var device = require('../../lib/thinx/device');

  var owner =
    "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";
  var apikey =
    "88eb20839c1d8bf43819818b75a25cef3244c28e77817386b7b73b043193cef4";

  var RS =
    '{ "registration" : { "mac" : "00:00:00:00:00:00:00", "firmware" : "DeviceSpec.js", "version" : "1.0.0", "checksum" : "nevermind", "push" : "forget", "alias" : "npmtest", "owner": "' +
    owner + '", "udid": "to-be-deleted-on-test" } }';

  it("should be able to register a device", function(done) {
    device.register(JSON.parse(RS), apikey,
      function(success, response) {
        expect(success).toBe(true);
        done();
      });
  });

  it("should receive different response for already-registered revice",
    function(done) {
      device.register(JSON.parse(RS), apikey,
        function(success, response) {
          expect(success).toBe(true);
          done();
        });
    });

  it("should be able to edit device alias", function() {
    var changes = {
      alias: Date().toString()
    };
    device.edit(owner, changes, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
    });
  });

  it("should be able to provide device firmware", function() {
    // Returns "OK" when current firmware is valid.
    device.firmware(body, api_key, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      console.log("Firmware check response: " + JSON.stringify(
        response));
    });
  });

});
