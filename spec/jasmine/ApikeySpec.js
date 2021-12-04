//const { response } = require('express');
var APIKey = require("../../lib/thinx/apikey");
var expect = require('chai').expect;  
var generated_key_hash = null;
var sha256 = require("sha256");
var envi = require("../_envi.json");
var owner = envi.oid;
var apikey = new APIKey();

describe("API Key List", function() {
  it("01 - should be able to list API Keys(1)", function(done) {
    apikey.list(
      owner,
      (success, object) => {
        if (success) {
          //console.log("API Key list(1): ", JSON.stringify(object));
          expect(object).to.be.a('array');
        } else {
          console.log("[jasmine] Listing failed:" + object);
        }
        done();
      });
  });
});

describe("API Key", function() {

  //create: function(owner, apikey_alias, callback)
  it("02 - should be able to generate new API Key", function(done) {
    //console.log("With owner:", owner);
    expect(owner);
    apikey.create(
      owner,
      "sample-key",
      (success, object) => {
        let first = object;
        //console.log("generated API Key: ", {first}, {object}, {success});
        if (success) {
          generated_key_hash = sha256(first.key);
          console.log("APIKey generated:", generated_key_hash);
        } else {
          console.log("APIKey failed: ",{object});
        }
        expect(success);
        expect(first);
        done();
      }
    );
  });

  
});

describe("API Keys", function() {

  //verify: function(owner, apikey, callback)
  it("03 - should be able to verify invalid API Keys", function(done) {
    let req = { ip: "0.0.0.0" };
    apikey.verify(
      owner,
      "invalid-api-key",
      req,
      (success, result) => { // fixed (callback is not a function!)
        console.log("verify with invalid API Key, callback, done()");
        expect(success).to.equal(false);
        done();
      });
  });

  //revoke: function(owner, apikey_hash, callback)
  it("04 - should be able to revoke API Keys", function(done) {
    console.log("Revoking valid key: " + generated_key_hash);
    apikey.revoke(
      generated_key_hash,
      ["sample-key-hash"],
      (success, result)  => {
        expect(success);
        done();
      });
  });

  it("05 - should be able to fail on invalid API Key revocation (callback is not a function!)", function() {
    console.log("Revoking invalid-owner key...");
    apikey.revoke(
      "nonsense", ["sample-key-hash"],
      (success)  => {
        expect(success).to.equal(false);
        //done();
      }
    );
  });

  //list: function(owner, callback)
  it("06 - should be able to list API Keys (2)", function (done) {
    apikey.list(
      owner,
      (success, object) => {
        expect(success).to.equal(true);
        if (success) {
          console.log("TODO: Add test to expect object", object, "to be an array");
          //expect(object).to.be.a('array');
        } else {
          console.log("[jasmine] Listing failed:" + object);
        }
        if (done) done();
      });
  });

});
