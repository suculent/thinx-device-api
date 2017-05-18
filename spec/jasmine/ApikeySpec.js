describe("API Key", function() {

  var generated_key_hash = null;
  var APIKey = require('../../lib/thinx/apikey');

  //create: function(owner, apikey_alias, callback)
  it("should be able to generate new API Keys", function() {
    //var APIKey = require("../../lib/thinx/apikey");
    var object = APIKey.create(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      "sample-key",
      function(success,
        object) {
        if (success) {
          console.log("Created: " + JSON.stringify(object));
          generated_key_hash = object.hash;
        } else {
          console.log("Failed.");
        }
        expect(object).toBeDefined();
        //done();
      });

  }, 1000);

  //verify: function(owner, apikey, callback)
  it("should be able to verify API Keys", function() {
    //var APIKey = require('../../lib/thinx/apikey');
    var object = APIKey.verify(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      "d4d37cb2c00766f433a5feb7e3b97d82fb4b8971",
      function(success,
        object) {
        if (success) {
          console.log("Verified: " + JSON.stringify(object));
        } else {
          console.log("Verification failed.");
        }
        expect(object).toBeDefined();
        //done();
      });

  }, 1000);

  //revoke: function(owner, apikey_hash, callback)
  it("should be able to revoke API Keys", function() {
    //var APIKey = require('../../lib/thinx/apikey');
    var object = APIKey.revoke(
      "d4d37cb2c00766f433a5feb7e3b97d82fb4b8971",
      "sample-key-hash",
      function(success,
        object) {
        if (success) {
          console.log("Revoked: " + JSON.stringify(object));
        } else {
          console.log("Revocation failed.");
        }
        expect(object).toBeDefined();
        //done();
      });

  }, 1000);

  //list: function(owner, callback)
  it("should be able to list API Keys", function() {
    var object = APIKey.list(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(success,
        object) {
        if (success) {
          console.log("Listed: " + JSON.stringify(object));
        } else {
          console.log("Listing failed.");
        }
        expect(object).toBeDefined();
        //done();
      });

  }, 1000);

});
