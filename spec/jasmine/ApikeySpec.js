var generated_key_hash = null;
var APIKey = require('../../lib/thinx/apikey');

var test_key =
  "88eb20839c1d8bf43819818b75a25cef3244c28e77817386b7b73b043193cef4";

describe("API Key", function() {

  describe("Generator", function() {

    //create: function(owner, apikey_alias, callback)
    it("should be able to generate new API Keys", function(done) {
      APIKey.create(
        "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
        "sample-key",
        function(success,
          object) {
          if (success) {
            this.generated_key_hash = object.hash;
            console.log("Key ready to revoke: " + this.generated_key_hash);

            //verify: function(owner, apikey, callback)
            it("should be able to verify API Keys", function(done) {
              expect(this.generated_key_hash).toBeDefined();
              console.log("Verifying key: " +
                generated_key_hash);
              APIKey.verify(
                "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
                this.generated_key_hash,
                function(success) {
                  expect(success).toBe(true);
                  done();
                });
            }, 5000);

            //revoke: function(owner, apikey_hash, callback)
            it("should be able to revoke API Keys", function() {
              console.log("Revoking valid key: " +
                generated_key_hash);
              APIKey.revoke(
                generated_key_hash,
                "sample-key-hash",
                function(success) {
                  expect(success).toBeDefined();
                });
            });

          }
          expect(object).toBeDefined();
          done();
        });
    }, 5000);

    it("should be able to verify invalid API Keys", function(done) {
      APIKey.verify(
        "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
        "invalid-api-key",
        function(success) {
          expect(success).toBe(false);
          done();
        });
    }, 5000);

  });

  it("should be able to fail on invalid API Key revocation", function(done) {
    console.log("Revoking invalid key...");
    APIKey.revoke(
      "nonsense",
      "sample-key-hash",
      function(success) {
        expect(success).toBe(false);
        done();
      });
  }, 5000);

  //list: function(owner, callback)
  it("should be able to list API Keys", function(done) {
    APIKey.list(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(success, object) {
        if (success) {
          console.log(JSON.stringify(object));
          expect(object).toBeDefined();
        } else {
          console.log("[jasmine] Listing failed:" + object);
        }
        done();
      }, 5000);
  });

});
