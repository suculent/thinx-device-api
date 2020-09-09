const { response } = require('express');
var APIKey = require("../../lib/thinx/apikey");
var apikey = new APIKey();

describe("API Key", function() {

  var expect = require('chai').expect;  
  var generated_key_hash = null;
  var sha256 = require("sha256");
  var envi = require("../_envi.json");
  var owner = envi.oid;

  //create: function(owner, apikey_alias, callback)
  it("should be able to generate new API Keys", (done) => {
    apikey.create(
      owner,
      "sample-key",
      (success, object) => {
        let first = object;
        //console.log("generated api key: ", {first}, {object}, {success});
        if (success) {
          generated_key_hash = sha256(first.key);
          console.log("APIKey generated: " + generated_key_hash);
        } else {
          console.log({object});
        }
        expect(success);
        expect(first);
        done();
      }
    );
  });

  //list: function(owner, callback)
  it("should be able to list API Keys", function(done) {
    apikey.list(
      owner,
      (success, object) => {
        if (success) {
          //console.log("api key list: ", JSON.stringify(object));
          expect(object).to.be.a('array');
        } else {
          console.log("[jasmine] Listing failed:" + object);
        }
        done();
      });
  });

  //verify: function(owner, apikey, callback)
  it("should be able to verify (invalid) API Keys (requires hash)", (done) => {
    expect(generated_key_hash).to.be.a('string');
    console.log("Verifying key: " + generated_key_hash);
    let req = {};
    apikey.verify(
      owner,
      generated_key_hash,
      req,
      (success) => {
        console.log({success});
        expect(success).to.equal(false); // or error? what should this return?
        done();
      });
  });

  it("should be able to verify invalid API Keys (callback is not a function!)", function(done) {
    const req = { ip: "0.0.0.0" };
    apikey.verify(
      owner,
      "invalid-api-key",
      req,
      function(success) {
        console.log("verify callback");
        expect(success).to.equal(false);
        done();
      });
  });

  //revoke: function(owner, apikey_hash, callback)
  it("should be able to revoke API Keys", (done) => {
    console.log("Revoking valid key: " + generated_key_hash);
    apikey.revoke(
      generated_key_hash,
      ["sample-key-hash"],
      (success, result) => {
        expect(success);
        done();
      });
  });

  it("should be able to fail on invalid API Key revocation (callback is not a function!)", (done) => {
    //console.log("Revoking invalid key...");
    apikey.revoke(
      "nonsense", ["sample-key-hash"],
      (success) => {
        expect(success).to.equal(false);
        done();
      }
    );
  });

});
