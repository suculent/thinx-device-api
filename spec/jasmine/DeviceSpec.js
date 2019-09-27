describe("Device", function() {

  var Device = require("../../lib/thinx/device"); var device = new Device();
  var ApiKey = require("../../lib/thinx/apikey"); var APIKey = new ApiKey();

  var envi = require("./_envi.json");
  var sha256 = require("sha256");

  var owner = envi.oid;
  var udid = envi.udid;
  var apikey = envi.ak;
  var ott = null;

  var generated_key_hash = null;

  console.log("Testing with udid: ", udid);

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
    udid: envi.udid
  };

  var body = JRS; // JSON.parse(RS);

  //console.log("• DeviceSpec.js: Using test API_KEY: " + apikey);
  //console.log("• DeviceSpec.js: Using request: " + JSON.stringify(JRS));


  //create: function(owner, apikey_alias, callback)
  it("API keys are required to do this on new instance", function(done) {
    APIKey.create( owner, "sample-key", function(success, object) {
      expect(success).toBe(true);
      if (success) {
        apikey = sha256(object.key);
        console.log("Key ready: " + apikey);
        expect(apikey).toBeDefined();
      }
      done();
    });
  }, 5000);

  it("should be able to register itself.", function(done) {
    device.register(
      JRS2,
      apikey,
      null,
      function(success, response) {
        if (success === false) {
          console.log(response);
          expect(response).toBeDefined();
          if (response === "owner_found_but_no_key") {
            done();
            return;
          }
        }
        //console.log("• DeviceSpec.js: Registration result: ", {response});
        expect(success).toBe(true);
        udid = response.registration.udid;
        expect(udid).toBeDefined();
        console.log("• DeviceSpec.js: Received UDID: " + udid);
        done();
      });
  }, 15000); // register


  it("should be able to change its alias.", function(done) {
    var changes = {
      alias: Date().toString(),
      udid: udid
    };
    device.edit(owner, changes, function(success, response) {
      if (success === false) {
        console.log("alias edit error reason: ", response);
      } else {
        console.log("• DeviceSpec.js: Editing result: ", { response });
      }

      expect(success).toBe(true);
      expect(response).toBeDefined();
      done();
    });
  }, 5000);


  it("should receive different response for registered device", function(done) {
      device.register(JRS,
        apikey,
        null,
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
          console.log("• DeviceSpec.js: Re-registration result: ", {response});
          expect(success).toBe(true);
          done();
        });
    }, 5000);

  it("should be able to store OTT request", function(done) {
    device.storeOTT(JSON.stringify(JRS2), function(success, response) {
      console.log("• OTT Response: " , {response});
      //expect(success).toBe(true); happens to be null?
      expect(response).toBeDefined();
      expect(response.ott).toBeDefined();
      ott = response.ott;
      done();
    });
  }, 5000);

  it("should be able to fetch OTT request", function(done) {
    device.storeOTT(JSON.stringify(JRS2), function(success, response) {
      console.log("• OTT Response: " , {response});
      //expect(success).toBe(true);
      expect(response).toBeDefined();
      expect(response.ott).toBeDefined();
      ott = response.ott;

      device.fetchOTT(ott, function(success,
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

  it("should be able to provide device firmware", function(firmware_done) {
      // Returns "OK" when current firmware is valid.
      var body = JRS2;
      body.udid = udid;
      console.log("• DeviceSpec.js: Using UDID: " + udid);
      device.firmware(body, apikey, function(success, response) {
        console.log("• DeviceSpec.js: Firmware fetch result: ", {response});
        expect(success).toBe(false);
        expect(response.success).toBe(false);
        expect(response.status).toBe("UPDATE_NOT_FOUND");
        //expect(response).toBe("device_not_found"); // maybe local only
        console.log("firmware response: ", {response});
        firmware_done();
      });
    }, 5000);

  it("should be able to register for revocation", function(done) {
    device.register(
      JRS,
      apikey,
      null,
      function(success, response) {
        console.log("Registration Response: ", response);
        udid = response.registration.udid;
        console.log("• DeviceSpec.js: Received UDID: " + udid);
        expect(success).toBe(true);
        expect(udid).toBeDefined();
        done();
      });
  }, 15000); // register for revocation

  it("should be able to revoke a device", function(done) {
      console.log("• DeviceSpec.js: Revoking UDID: " + udid);
      device.revoke(
        udid,
        function(success, response) {
          console.log("• DeviceSpec.js: Revocation result: ", { response });
          //expect(error.reason).toBe("deleted");
          expect(success).toBe(true);
          if (success == false) {
            expect(response.status).toBe("device_not_found");
          }
          done();
      });
  }, 5000);

});
