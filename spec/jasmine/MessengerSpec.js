var expect = require('chai').expect;

var Messenger = require('../../lib/thinx/messenger');
var messenger;

var envi = require("../_envi.json");
var test_owner = envi.oid;
var udid = envi.udid;

describe("Messenger", function() {

  it("should be able to initialize", function(/* done */) {
    messenger = new Messenger("mosquitto").getInstance("mosquitto"); // requires injecting test creds, not custom creds!
  });

  // this requires having owner and devices registered in the DB, 
  xit("should be able to initialize with owner", function(done) {
    const mock_socket = {};
    console.log("[test] Initializing messenger with owner", test_owner, "socket", mock_socket);
    messenger.initWithOwner(test_owner, mock_socket, (success, status) => {
      console.log("[test] messenger initialized: ", { success: success, status: status });
      expect(success).to.be(true);
      done();
    });
  }, 5000);

  // getDevices: function(owner, callback)
  it("should be able to fetch devices for owner", function(done) {
    messenger.getDevices(test_owner, (success, devices) => {
      expect(devices).to.be.an('array');
      done();
    });
  });

  // publish: function(owner, udid, message); returns nothing
  it("should be able to publish upon connection", function(done) {
    messenger.publish(test_owner, udid, "test");
    done();
  }, 5000);
});
