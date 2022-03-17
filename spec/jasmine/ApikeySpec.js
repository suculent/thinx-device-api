var APIKey = require("../../lib/thinx/apikey");
var expect = require('chai').expect;  
var generated_key_hash = null;
var sha256 = require("sha256");
var envi = require("../_envi.json");
var owner = envi.oid;
var apikey = new APIKey();

describe("API Key", function() {
  //create: function(owner, apikey_alias, callback)
  it("(01) should be able to generate new API Key", function(done) {
    apikey.create(
      owner,
      "sample-key",
      (success, array_or_error) => {
        if (success) {
          generated_key_hash = sha256(array_or_error[0].key);
        } else {
          console.log("[spec] APIKey failed: ",{array_or_error});
        }
        expect(success).to.be.true;
        expect(array_or_error[0].key).to.be.a('string');
        done();
      }
    );
  });

  it("(02) should be able to list API Keys", function(done) {
    apikey.list(
      owner,
      (success, object) => {
        if (success) {
          expect(object).to.be.a('array');
        } else {
          console.log("[spec] API Key Listing failed:", {object}, {success});
        }
        done();
      });
  });

  //verify: function(owner, apikey, callback)
  it("(03) should be able to verify invalid API Keys", function(done) {
    let req = { ip: "0.0.0.0" };
    apikey.verify(
      owner,
      "invalid-api-key",
      req,
      (success /*, result */) => { // fixed (callback is not a function!)
        expect(success).to.equal(false);
        done();
      });
  });

  //revoke: function(owner, apikey_hash, callback)
  it("04 - should be able to revoke API Keys", function(done) {
    apikey.create(
      owner,
      "sample-key",
      (success, array_or_error) => {
        if (success) {
          generated_key_hash = sha256(array_or_error[0].key);
        } else {
          console.log("[spec] APIKey failed: ",{array_or_error});
        }
        expect(success).to.be.true;
        expect(array_or_error[0].key).to.be.a('string');
        apikey.revoke(
          owner,
          [generated_key_hash],
          (_success, /* result */) => {
            expect(_success).to.be.true;
            done();
          });
      }
    );
  });

  it("(05) should be able to fail on invalid API Key revocation (callback is not a function!)", function() {
    apikey.revoke(
      "nonsense", ["sample-key-hash"],
      (success)  => {
        expect(success).to.equal(false);
        //done();
      }
    );
  });

  //list: function(owner, callback)
  it("(06) should be able to list API Keys (2)", function (done) {
    apikey.list(
      owner,
      (success, object) => {
        expect(success).to.be.true;
        if (success) {
          expect(object).to.be.a('array');
        } else {
          console.log("[spec] (06) API Key Listing failed:", {object});
        }
        if (done) done();
      });
  });

});
