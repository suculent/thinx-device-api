var generated_key_name = null;
var Messenger = require('../../lib/thinx/messenger');

var envi = require("./_envi.json");
var test_owner = envi.oid;
var udid = envi.udid;

describe("Messenger", function() {

  // getDevices: function(owner, callback)
  it("should be able to fetch devices for owner", function(done) {
    Messenger.getDevices(test_owner, function(success, status) {
      expect(success).toBe(true);
      console.log(JSON.stringify(status));
      done();
    });
  }, 5000);

  it("should be able to fetch API Key for owner", function(done) {
    Messenger.apiKeyForOwner(test_owner, function(success, apikey) {
      expect(success).toBe(true);
      expect(apikey).toBeDefined();
      console.log(JSON.stringify(apikey));
      done();
    });
  }, 5000);

  // init
  it("should be able to initialize on its own", function(done) {
    Messenger.initWithOwner(test_owner, null, function(success, status) {
      expect(success).toBe(true);
      expect(status).toBeDefined();
      done();
    });
  }, 5000);

  it("should be able to get all owners", function(done) {
    Messenger.getAllOwners(function(success, status) {
      expect(success).toBe(true);
      console.log("owners: " + JSON.stringify(status));
      done();
    });
  }, 5000);

  // publish: function(owner, udid, message); returns nothing
  it("should be able to publish upon connection", function(done) {
    Messenger.publish(test_owner, udid, "test");
    done();
  }, 5000);
});
