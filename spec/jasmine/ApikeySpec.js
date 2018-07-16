describe("API Key", function() {

  var generated_key_hash = null;
  var APIKey = require("../../lib/thinx/apikey");
  var sha256 = require("sha256");

  var envi = require("./_envi.json");
  var owner = envi.oid;

  describe("Generator", function() {

    //create: function(owner, apikey_alias, callback)
    it("should be able to generate new API Keys", function(done) {
      APIKey.create(
        owner,
        "sample-key",
        function(success, object) {

          if (success) {
            this.generated_key_hash = sha256(object.key);
            console.log("Key ready to revoke: " + this.generated_key_hash);

            //verify: function(owner, apikey, callback)
            it("should be able to verify API Keys", function(done) {
              expect(this.generated_key_hash).toBeDefined();
              console.log("Verifying key: " +
                generated_key_hash);
              APIKey.verify(
                owner,
                this.generated_key_hash,
                function(success) {
                  expect(success).toBe(true);

                  //revoke: function(owner, apikey_hash, callback)
                  it("should be able to revoke API Keys",
                    function() {
                      console.log("Revoking valid key: " +
                        generated_key_hash);
                      APIKey.revoke(
                        generated_key_hash,
                        "sample-key-hash",
                        function(success) {
                          expect(success).toBeDefined();
                          done();
                        });
                    }, 5000);

                  done();
                });
            }, 5000);
          }
          expect(object).toBeDefined();
          done();
        });
    }, 15000);

  }, 10000);

  it("should be able to verify invalid API Keys", function(done) {
    APIKey.verify(
      owner,
      "invalid-api-key",
      function(success) {
        expect(success).toBe(false);
        done();
      });
  }, 5000);

  it("should be able to fail on invalid API Key revocation", function(done) {
    console.log("Revoking invalid key...");
    APIKey.revoke(
      "nonsense", ["sample-key-hash"],
      function(success) {
        expect(success).toBe(false);
        done();
      });
  }, 5000);

  //list: function(owner, callback)
  it("should be able to list API Keys", function(done) {
    APIKey.list(
      owner,
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
