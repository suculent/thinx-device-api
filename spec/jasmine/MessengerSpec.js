var generated_key_name = null;
var Messenger = require('../../lib/thinx/messenger');
var messenger = new Messenger().getInstance();

var envi = require("../_envi.json");
var test_owner = envi.oid;
var udid = envi.udid;

var user = require('../../lib/thinx/owner');
var User = new user();
var envi = require("../_envi.json");
var owner = envi.oid;
var email = envi.email;

describe("Messenger", function() {

  var APIKey = require("../../lib/thinx/apikey");
  var apikey = new APIKey();
  var sha256 = require("sha256");
  var envi = require("../_envi.json");
  var owner = envi.oid;

  var generated_key_hash;

  it("should be able to generate new API Keys", function(done) {
    apikey.create(
      owner,
      "Test MQTT API Key",
      function(success, object) {
        if (success) {
          generated_key_hash = sha256(object.key);
          console.log("APIKey created for MQTT: " + generated_key_hash + "with owner: " + owner);
        }
        expect(object).toBeDefined();
        done();
      }
    );
  });

  it("should be able to list API Keys", function(done) {
    var apikey = new APIKey();
    apikey.list(
      owner,
      function(success, object) {
        if (success) {
          //console.log(JSON.stringify(object));
          expect(object).toBeDefined();
        } else {
          console.log("[jasmine] Listing failed:" + object);
        }
        done();
      });
  });

  // getDevices: function(owner, callback)
  it("should be able to fetch devices for owner", function(done) {
    messenger.getDevices(test_owner, function(success, devices) {
      expect(success).toBe(true);
      console.log("devices: ", { devices });
      done();
    });
  }, 5000);

  // init
  it("should be able to initialize on its own", function(done) {
    const mock_socket = {};
    messenger.initWithOwner(test_owner, mock_socket, function(success, status) {
      // expect(success).toBe(true);
      expect(status).toBeDefined();
      console.log("devices: ", { success: success, status: status });
      done();
    });
  }, 5000);

  /* why? this function is unused... dead code.
  it("should be able to get all owners", function(done) {
    Messenger.getAllOwners(function(success, status) {
      expect(success).toBe(true);
      console.log("owners: " + JSON.stringify(status));
      done();
    });
  }, 5000); */

  // publish: function(owner, udid, message); returns nothing
  it("should be able to publish upon connection", function(done) {
    messenger.publish(test_owner, udid, "test");
    // console.log("publishing: ", { test_owner, udid });
    done();
  }, 5000);

});
