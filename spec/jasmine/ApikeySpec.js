describe("API Key", function() {

  var expect = require('chai').expect

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
        expect(object).to.be.a('string');
        done();
      }
    );
  });

  //verify: function(owner, apikey, callback)
  it("should be able to verify API Keys (requires hash)", function(done) {
    expect(generated_key_hash).to.be.a('string');
    //console.log("Verifying key: " + generated_key_hash);
    apikey.verify(
      owner,
      generated_key_hash,
      null,
      function(success) {
        expect(success).to.equal(true);
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
        expect(success).to.be.a('string');
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
        expect(success).to.equal(false);
        done();
      });
  }, 5000);

  it("should be able to fail on invalid API Key revocation", function(done) {
    //console.log("Revoking invalid key...");
    var apikey = new APIKey();
    apikey.revoke(
      "nonsense", ["sample-key-hash"],
      function(success) {
        expect(success).to.equal(false);
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
          expect(object).to.be.a('string');
        } else {
          console.log("[jasmine] Listing failed:" + object);
        }
        done();
      });
  });

});
