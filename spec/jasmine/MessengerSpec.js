var expect = require('chai').expect;

var generated_key_hash;
var Messenger = require('../../lib/thinx/messenger');
var messenger = new Messenger().getInstance();

var envi = require("../_envi.json");
var test_owner = envi.oid;
var udid = envi.udid;

var envi = require("../_envi.json");
var owner = envi.oid;

var APIKey = require("../../lib/thinx/apikey");
var apikey = new APIKey();
var sha256 = require("sha256");
var envi = require("../_envi.json");
var owner = envi.oid;


describe("Messenger", function() {

  // init
  it("should be able to initialize on its own", function(done) {
    const mock_socket = {};
    messenger.initWithOwner(test_owner, mock_socket, (success, status) => {
      console.log("messenger initialized: ", { success: success, status: status });
      expect(success).to.be.true;
      done();
    });
  }, 5000);
  
  /* already happens in ApiKeySpec; causes duplicate default key later
  it("should be able to generate new API Keys", function(done) {
    console.log("generate key with owner", {owner});
    apikey.create(
      owner,
      "Test MQTT API Key",
      (success, object) => {
        let first = object;
        console.log({first});
        if (success && first.key) {
          generated_key_hash = sha256(first.key);
          console.log("APIKey created for MQTT: " + generated_key_hash + "with owner: " + owner);
        } else {
          console.log({success}, {first});
        }
        done();
      }
    );
  }); */

  // getDevices: function(owner, callback)
  it("should be able to fetch devices for owner", function(done) {
    messenger.getDevices(test_owner, (success, devices) => {
      console.log("devices: ", { devices });
      expect(devices).to.be.an('array');
      done();
    });
  });

  // publish: function(owner, udid, message); returns nothing
  it("should be able to publish upon connection", function(done) {
    messenger.publish(test_owner, udid, "test");
    // console.log("publishing: ", { test_owner, udid });
    done();
  }, 5000);

  /* this is not a messengerspec
  it("should be able to list API Keys", function(done) {
    apikey.list(
      owner,
      (success, object) => {
        if (success) {
          //console.log("API Key list: ", JSON.stringify(object));
          expect(object).to.be.a('array');
        } else {
          console.log("[jasmine] Listing failed:", {object});
        }
        done();
      });
  });*/

});
