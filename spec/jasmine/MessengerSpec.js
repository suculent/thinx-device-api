var generated_key_name = null;
var Messenger = require('../../lib/thinx/messenger');

var test_owner = "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";

describe("Messenger", function() {

  // getDevices: function(owner, callback)
  it ("should be able to fetch devices for owner", function(done) {
    Messenger.getDevices(test_owner, function(success, status) {
      expect(success).toBe(true);
      console.log(JSON.stringify(status));
      done();
    });
  }, 5000);

  it ("should be able to fetch API Key for owner", function(done) {
    Messenger.apiKeyForOwner(test_owner, function(success, apikey) {
      expect(success).toBe(true);
      expect(apikey).toBeDefined();
      console.log(JSON.stringify(apikey));      
      done();
    });
  }, 5000);

  // initWithOwner: function(owner, callback)
  it ("should be able to connect", function(done) {
    Messenger.initWithOwner(test_owner, function(success, status) {
      expect(success).toBe(true);
      console.log(JSON.stringify(status));

      // publish: function(owner, udid, message)
      it ("should be able to publish upon connection", function() {
        Messenger.publish(test_owner, udid, "test");    
      });


      done();
    });    
  }, 5000);

  // init
  it ("should be able to initialize on its own", function() {
    Messenger.init();
  });

  it ("should be able to get all owners", function(done) {
    Messenger.getAllOwners(function(success, status) {
      expect(success).toBe(true);
      console.log(JSON.stringify(status));
      done();
    });
  }, 5000);

});