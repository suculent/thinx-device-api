describe("Device", function() {

  var generated_key_hash = null;
  var device = require('../../lib/thinx/device');

  var owner =
    "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";
  var apikey = "nevim!!!!"; // TODO: GET TEST APIKEY

  var RS =
    '{ "registration" : { "mac" : "00:00:00:00:00:00:00", "firmware" : "DeviceSpec.js", "version" : "1.0.0", "checksum" : "nevermind", "push" : "forget", "alias" : "npmtest", "owner": "' +
    owner + '" } }';

  it("should be able to register a device", function(done) {
    device.register(JSON.parse(RS), apikey,
      function(success, response) {
        expect(success).toBe(true);
        done();
      });
  });

  xit("should be able to edit device details", function() {
    // Like what? Aliens, sauce...
    // exports.edit = Device.edit
  });

  xit("should be able to provide device firmware", function() {
    // Zo far prowides OK when happpyz.
    // exports.firmware = Device.firmware;
  });

});
