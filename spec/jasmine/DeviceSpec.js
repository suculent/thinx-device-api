describe("Device", function() {

  var generated_key_hash = null;
  var device = require('../../lib/thinx/device');

  var envi = require("./_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;
  var apikey = envi.ak;
  var ott = null;

  /*
    var RS =
      '{ "registration" : { "mac" : "000000000000", "firmware" : "DeviceSpec.js", "version" : "1.0.0", "checksum" : "nevermind", "push" : "forget", "alias" : "npmtest", "udid": "to-be-deleted-on-test", "owner": "' +
      owner + '", "platform": "platformio" } }';
      */

  var JRS = {
    registration: {
      mac: "111111111111",
      firmware: "DeviceSpec.js",
      version: "1.0.0",
      checksum: "nevim",
      push: "forget",
      alias: "npm-test-ino-one",
      owner: owner,
      platform: "arduino"
    }
  };

  var JRS2 = {
    registration: {
      mac: "N0NMOCKED100",
      firmware: "DeviceSpec.js",
      version: "1.0.0",
      checksum: "nevim",
      push: "forget",
      alias: "robodyn-mega-wifi",
      owner: owner,
      platform: "arduino",
      udid: "d2d7b050-7c53-11e7-b94e-15f5f3a64973"
    }
  };

  var body = JRS; // JSON.parse(RS);

  console.log("Using test API_KEY: " + apikey);
  console.log("Using request: " + JSON.stringify(JRS));

  it("should be able to register itself.", function(done) {

    device.register(JRS, apikey,
      function(success, response) {
        console.log("Registration result: " + JSON.stringify(response));
        expect(success).toBe(true);
        expect(this.udid).toBeDefined();
        this.udid = response.udid;
        console.log("Received UDID: " + this.udid);
        done();
      });
  }, 15000); // register

  it("should be able to provide device firmware",
    function(done) {
      // Returns "OK" when current firmware is valid.
      body.udid = this.udid;
      console.log("Using UDID: " + this.udid);
      device.firmware(body, apikey, function(
        success,
        response) {
        console.log("Firmware fetch result: " +
          JSON.stringify(
            response));
        expect(success).toBe(false);
        expect(response.status).toBe("UPDATE_NOT_FOUND");
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
      device.register(JRS2, apikey,
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
      expect(response.ott).toBeDefined();
      this.ott = response.ott;

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

      done();
    });
  }, 5000);



});
