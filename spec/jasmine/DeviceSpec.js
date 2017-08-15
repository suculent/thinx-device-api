describe("Device", function() {

  var generated_key_hash = null;
  var device = require('../../lib/thinx/device');

  var envi = require("./_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;
  var apikey = envi.ak;
  var ott = null;

  var RS =
    '{ "registration" : { "mac" : "00:00:00:00:00:00", "firmware" : "DeviceSpec.js", "version" : "1.0.0", "checksum" : "nevermind", "push" : "forget", "alias" : "npmtest", "owner": "cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12", "udid": "to-be-deleted-on-test", "owner": "' +
    owner + '" } }';

  var body = JSON.parse(RS);

  console.log("Using test API_KEY: " + apikey);
  console.log("Using request: " + RS);

  it("should be able to register itself.", function(done) {

    device.register(JSON.parse(RS), apikey,
      function(success, response) {
        console.log("Registration result: " + JSON.stringify(response));
        expect(success).toBe(true);
        done();
      });
  }, 15000); // register

  it("should be able to provide device firmware",
    function(done) {
      // Returns "OK" when current firmware is valid.
      device.firmware(body, apikey, function(
        success,
        response) {
        console.log("Firmware fetch result: " +
          JSON.stringify(
            response));
        expect(success).toBe(true);
        expect(response).toBeDefined();
        console.log(
          "Firmware check response: " +
          JSON.stringify(
            response));
        done();
      });
    }, 5000);

  it("should be able to change its alias.",
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

  it("should be able to store OTT request", function(done) {
    device.storeOTT({
      sample: "body"
    }, function(success, response) {
      expect(success).toBe(true);
      expect(response).toBeDefined();
      this.ott = response.ott;
      done();
    });
  }, 5000);

  it("should be able to fetch OTT request",
    function(done) {
      expect(this.ott).toBeDefined();
      device.fetchOTT(this.ott, function(success,
        response) {
        expect(success).toBe(true);
        expect(response).toBeDefined();
        done();
      });
    }, 5000);

});
