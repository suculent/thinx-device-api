var expect = require('chai').expect;

var Messenger = require('../../lib/thinx/messenger');
var messenger = new Messenger("mosquitto").getInstance("mosquitto"); // requires injecting test creds, not custom creds!

var envi = require("../_envi.json");
var test_owner = envi.oid;
var udid = envi.udid;

describe("Messenger", function() {

  // init
  it("should be able to initialize on its own", function(done) {
    const mock_socket = {};
    messenger.initWithOwner(test_owner, mock_socket, (success, status) => {
      console.log("messenger initialized: ", { success: success, status: status });
      expect(success).to.be(true);
      done();
    });
  }, 5000);

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
    console.log("publishing: ", { test_owner, udid });
    done();
  }, 5000);
});
