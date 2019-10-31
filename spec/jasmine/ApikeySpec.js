describe("API Key", function() {

  var generated_key_hash = null;

  var APIKey = require("../../lib/thinx/apikey");
  var apikey = new APIKey();
  var sha256 = require("sha256");
  var envi = require("../_envi.json");
  var owner = envi.oid;

  //create: function(owner, apikey_alias, callback)
  it("should be able to generate new API Keys", function(done) {
    apikey.create(
      owner,
      "sample-key",
      function(success, object) {
        if (success) {
          generated_key_hash = sha256(object.key);
          console.log("APIKey generated: " + generated_key_hash);
        }
        expect(object).toBeDefined();
        done();
      }
    );
  });

  //verify: function(owner, apikey, callback)
  it("should be able to verify API Keys (requires hash)", function(done) {
    expect(generated_key_hash).toBeDefined();
    //console.log("Verifying key: " + generated_key_hash);
    apikey.verify(
      owner,
      generated_key_hash,
      null,
      function(success) {
        expect(success).toBe(true);
        done();
      });
  });

  //revoke: function(owner, apikey_hash, callback)
  it("should be able to revoke API Keys", function(done) {
    //console.log("Revoking valid key: " + generated_key_hash);
    apikey.revoke(
      generated_key_hash,
      "sample-key-hash",
      function(success) {
        expect(success).toBeDefined();
        done();
      });
  });

  it("should be able to verify invalid API Keys", function(done) {
    var apikey = new APIKey();
    const req = { ip: "0.0.0.0" };
    apikey.verify(
      owner,
      "invalid-api-key",
      req,
      function(success) {
        expect(success).toBe(false);
        done();
      });
  }, 5000);

  it("should be able to fail on invalid API Key revocation", function(done) {
    //console.log("Revoking invalid key...");
    var apikey = new APIKey();
    apikey.revoke(
      "nonsense", ["sample-key-hash"],
      function(success) {
        expect(success).toBe(false);
        done();
      }
    );
  });


  //list: function(owner, callback)
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

});
