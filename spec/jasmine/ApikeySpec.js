describe("API Key", function() {

  var generated_key_hash = null;
  var APIKey = require('../../lib/thinx/apikey');

  //create: function(owner, apikey_alias, callback)
  it("should be able to generate new API Keys", function() {
    APIKey.create(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      "sample-key",
      function(success,
        object) {
        if (success) {
          console.log("[jasmine] Created: " + JSON.stringify(object));
          generated_key_hash = object.hash;
        } else {
          console.log("[jasmine] Failed.");
        }
        expect(object).toBeDefined();
        done();
      });

  }, 1000);

  //verify: function(owner, apikey, callback)
  it("should be able to verify API Keys", function() {
    APIKey.verify(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      "310c20ed9dcd4663551bd04cc53a58a52c8d9f1b",
      function(success,
        object) {
        if (success) {
          console.log("[jasmine] Verified: " + JSON.stringify(object));
        } else {
          console.log("Verification failed.");
        }
        expect(success).toBe(true);
        done();
      });

  }, 1000);

  //revoke: function(owner, apikey_hash, callback)
  it("should be able to revoke API Keys", function() {
    APIKey.revoke(
      "d4d37cb2c00766f433a5feb7e3b97d82fb4b8971",
      "sample-key-hash",
      function(success,
        object) {
        if (success) {
          console.log("[jasmine] Revoked: " + JSON.stringify(object));
        } else {
          console.log("[jasmine] Revocation failed.");
        }
        expect(object).toBeDefined();
        done();
      });

  }, 1000);

  //list: function(owner, callback)
  it("should be able to list API Keys", function() {
    APIKey.list(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(success,
        object) {
        if (success) {
          console.log("[jasmine] Listed: " + JSON.stringify(object));
        } else {
          console.log("[jasmine] Listing failed.");
        }
        expect(object).toBeDefined();
        done();
      });

  }, 1000);

});
