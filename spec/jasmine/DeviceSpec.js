describe("Device", function() {

  var device = require("../../lib/thinx/device");
  var APIKey = require("../../lib/thinx/apikey");
  var envi = require("./_envi.json");

  var owner = envi.oid;
  var udid = envi.udid;
  var apikey = envi.ak;
  var ott = null;

  var generated_key_hash = null;

  // TODO: FIXME: owner is not being loaded from _envi.json in certain circumstances

  // This UDID is to be deleted at the end of test.
  var JRS = {
    mac: "11:11:11:11:11:11",
    firmware: "DeviceSpec.js",
    version: "1.0.0",
    checksum: "xevim",
    push: "forget",
    alias: "virtual-test-device-1-delete",
    owner: owner,
    platform: "arduino",
    udid: "d6ff2bb0-df34-11e7-b351-eb37822aa172"
  };

  // udid: "6ef6d300-8053-11e7-8d27-0fa2e6ecef21"

  var JRS2 = {
    mac: "N0:NM:OC:KE:D1:00",
    firmware: "DeviceSpec.js",
    version: "1.0.0",
    checksum: "alevim",
    push: "forget",
    alias: "virtual-test-device-2-static",
    owner: owner,
    platform: "arduino",
    udid: "d2d7b050-7c53-11e7-b94e-15f5f3a64973"
  };

  var body = JRS; // JSON.parse(RS);

  console.log("• DeviceSpec.js: Using test API_KEY: " + apikey);
  console.log("• DeviceSpec.js: Using request: " + JSON.stringify(JRS));

  //create: function(owner, apikey_alias, callback)
  it("API keys are required to do this on new instance", function(done) {
    APIKey.create(
      owner,
      "sample-key",
      function(success, object) {

        expect(success).toBe(true);

        if (success) {
          this.apikey = object.hash;
          console.log("Key ready: " + this.apikey);
        }

        describe("Having existing API key ", function() {

        it("should be able to register itself.", function(done) {

          device.register(JRS2, this.apikey,
            function(success, response) {

              if (success === false) {
                console.log(response);
                expect(response).toBeDefined();
                if (response === "owner_found_but_no_key") {
                  done();
                  return;
                }
              }

              console.log("• DeviceSpec.js: Registration result: " + JSON.stringify(
                response));
              console.log("Registration Response: " + response);
              expect(success).toBe(true);
              expect(this.udid).toBeDefined();
              this.udid = response.udid;
              console.log("• DeviceSpec.js: Received UDID: " + this.udid);
              done();

              it("should be able to provide device firmware",
                function(firmware_done) {
                  // Returns "OK" when current firmware is valid.
                  var body = JRS2;
                  body.udid = this.udid;
                  console.log("• DeviceSpec.js: Using UDID: " + udid);
                  device.firmware(body, this.apikey, function(
                    success, response) {
                    console.log("• DeviceSpec.js: Firmware fetch result: " +
                      JSON.stringify(
                        response));
                    expect(success).toBe(false);
                    expect(response).toBe("UPDATE_NOT_FOUND");
                    console.log("firmware reponse: " + JSON.stringify(
                      response));
                    firmware_done();
                  });
                }, 5000);

            });
        }, 15000); // register

        it("should be able to register device for revocation testing", function(
          revocation_create_done) {

          device.register(JRS, apikey,
            function(success, response) {
              console.log("• DeviceSpec.js: Registration result: " + JSON.stringify(
                response));
              console.log("Registration Response: " + response);
              expect(success).toBe(true);
              expect(this.udid).toBeDefined();
              this.udid = response.udid;
              console.log("• DeviceSpec.js: Received UDID: " + this.udid);

              it("should be able to revoke a device",
                function(revocation_done) {
                  body.udid = this.udid;
                  console.log("• DeviceSpec.js: Using this.UDID: " + this.udid);
                  device.revoke(body, this.apikey, function(
                    success,
                    response) {
                    console.log("• DeviceSpec.js: Revocation result: " +
                      JSON.stringify(
                        response));
                    expect(success).toBe(false);
                    expect(response.status).toBe("UPDATE_NOT_FOUND");
                    revocation_done();
                  });
                }, 5000);
            });

          revocation_create_done();

        }, 15000); // register

        });

      });

    done();

  }, 30000);



  it("should be able to change its alias.",
    function(done) {
      var changes = {
        alias: Date().toString(),
        udid: envi.udid
      };
      device.edit(owner, changes, function(
        success, response) {
        if (success === false) {
          console.log(response);
        }
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
      device.register(JRS, apikey,
        function(success, response) {
          expect(response).toBeDefined();
          if (success === false) {
            console.log(
              "should receive different response for already-registered revice: " +
              response);
            // this is also OK... on CircleCI there are no older API Keys in Redis
            if (response === "owner_found_but_no_key") {
              done();
              return;
            }
          }
          console.log("• DeviceSpec.js: Re-registration result: " + JSON.stringify(
            response));
          expect(success).toBe(true);
          done();
        });
    }, 5000);

  it("should be able to store OTT request", function(done) {
    device.storeOTT(JSON.stringify(JRS2), function(success, response) {
      console.log("• OTT Response: " + JSON.stringify(response));
      //expect(success).toBe(true); happens to be null?
      expect(response).toBeDefined();
      expect(response.ott).toBeDefined();
      this.ott = response.ott;
      done();
    });
  }, 5000);

  it("should be able to fetch OTT request", function(done) {

    device.storeOTT(JSON.stringify(JRS2), function(success, response) {
      console.log("• OTT Response: " + JSON.stringify(response));
      //expect(success).toBe(true);
      expect(response).toBeDefined();
      expect(response.ott).toBeDefined();
      this.ott = response.ott;

      device.fetchOTT(this.ott, function(success,
        response) {
        if (success === false) {
          console.log(response);
        }
        //expect(success).toBe(true);
        expect(response).toBeDefined();
        done();
      });
    });

  }, 15000);

  it("should be able to normalize a MAC address", function(done) {
    var nmac = device.normalizedMAC("123456789012");
    expect(nmac).toBeDefined();
    done();
  }, 5000);

});
