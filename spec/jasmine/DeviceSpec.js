describe("Device", function() {

  var generated_key_hash = null;
  var device = require('../../lib/thinx/device');

  var envi = require("./_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;
  var apikey = envi.ak;
  var ott = null;

  // TODO: FIXME: owner is not being loaded from _envi.json in certain circumstances

  // This UDID is to be deleted at the end of test.
  var JRS = {
    mac: "11:11:11:11:11:11",
    firmware: "DeviceSpec.js",
    version: "1.0.0",
    checksum: "xevim",
    push: "forget",
    alias: "npm-test-ino-one",
    owner: "cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12",
    platform: "arduino"
  };

  // udid: "6ef6d300-8053-11e7-8d27-0fa2e6ecef21"

  var JRS2 = {
    mac: "N0:NM:OC:KE:D1:00",
    firmware: "DeviceSpec.js",
    version: "1.0.0",
    checksum: "alevim",
    push: "forget",
    alias: "robodyn-mega-wifi",
    owner: "cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12",
    platform: "arduino",
    udid: "d2d7b050-7c53-11e7-b94e-15f5f3a64973"
  };

  var body = JRS; // JSON.parse(RS);

  console.log("• DeviceSpec.js: Using test API_KEY: " + apikey);
  console.log("• DeviceSpec.js: Using request: " + JSON.stringify(JRS));

  it("should be able to register itself.", function(done) {

    device.register(JRS, apikey,
      function(success, response) {
        console.log("• DeviceSpec.js: Registration result: " + JSON.stringify(response));
        console.log("Registration Response: " + response);
        expect(success).toBe(true);
        expect(this.udid).toBeDefined();
        this.udid = response.udid;
        console.log("• DeviceSpec.js: Received UDID: " + this.udid);
        done();

        it("should be able to provide device firmware",
          function(done) {
            // Returns "OK" when current firmware is valid.
            body.udid = this.udid;
            console.log("• DeviceSpec.js: Using this.UDID: " + this.udid);
            device.firmware(body, apikey, function(
              success,
              response) {
              console.log("• DeviceSpec.js: Firmware fetch result: " +
                JSON.stringify(
                  response));
              expect(success).toBe(false);
              expect(response.status).toBe("UPDATE_NOT_FOUND");
              done();
            });
          }, 5000);

      });
  }, 15000); // register

  it("should be able to change its alias.",
    function(done) {
      var changes = {
        alias: Date().toString(),
        udid: "11:11:11:11:11:11"
      };
      device.edit(owner, changes, function(
        success, response) {
        console.log("• DeviceSpec.js: Editing result: " + JSON
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
          console.log("• DeviceSpec.js: Re-registration result: " + JSON.stringify(
            response));
          expect(success).toBe(true);
          done();
        });
    }, 5000);

  it("should be able to store OTT request", function(done) {
    device.storeOTT(JSON.stringify(JRS2), function(success, response) {
      console.log("• OTT Response: " + response);
      expect(success).toBe(true);
      expect(response).toBeDefined();
      expect(response.ott).toBeDefined();
      this.ott = response.ott;
      done();
    });
  }, 5000);

  it("should be able to fetch OTT request",
    function(done) {
      if (typeof(this.ott) === "undefined") {
        console.log("No OTT saved.");
        done();
        return;
      }
      expect(this.ott).toBeDefined();
      device.fetchOTT(this.ott, function(success,
        response) {
        expect(success).toBe(true);
        expect(response).toBeDefined();
        done();
      });
    }, 5000);

  it("should be able to normalize a MAC address", function(done) {
    var nmac = device.normalizedMAC("123456789012");
    expect(nmac).toBeDefined();
    done();
  });

});
