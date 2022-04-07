var APIKey = require("../../lib/thinx/apikey");
var expect = require('chai').expect;  
var generated_key_hash = null;
var sha256 = require("sha256");
var envi = require("../_envi.json");
var owner = envi.oid;
var apikey = new APIKey();

describe("API Key", function() {

   //list: function(invalid-owner, callback)
   it("(00) should be able to list empty API Keys", function (done) {
    apikey.list(
      "dummy",
      (object) => {
        expect(object).to.be.a('array');
        if (done) done();
      });
  });

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
        expect(success).to.equal(true);
        expect(array_or_error[0].key).to.be.a('string');
        done();
      }
    );
  });

  it("(01b) should be able to generate Default MQTT API Key", function(done) {
    apikey.create(
      owner,
      "Default MQTT API Key",
      (success, array_or_error) => {
        if (success) {
          generated_key_hash = sha256(array_or_error[0].key);
        } else {
          console.log("[spec] APIKey failed: ",{array_or_error});
        }
        expect(success).to.equal(true);
        expect(array_or_error[0].key).to.be.a('string');
        done();
      }
    );
  });

  it("(02) should be able to list API Keys", function(done) {
    apikey.list(
      owner,
      (object) => {
        expect(object).to.be.a('array');
        done();
      });
  });

  //verify: function(owner, apikey, callback)
  it("(03) should be able to verify invalid API Keys", function(done) {
    apikey.verify(
      owner,
      "invalid-api-key",
      true,
      (success /*, result */) => { // fixed (callback is not a function!)
        expect(success).to.equal(false);
        done();
      });
  });

  //revoke: function(owner, apikey_hash, callback)
  it("04 - should be able to revoke API Keys", function(done) {
    apikey.create(
      owner,
      "sample-key-for-revocation",
      (success, array_or_error) => {

        expect(success).to.equal(true);
      
        console.log("[spec] APIKey revoking: ", JSON.stringify(array_or_error[0]));
        expect(array_or_error[0].alias).to.equal("sample-key-for-revocation");
        generated_key_hash = sha256(array_or_error[0].key);
        expect(generated_key_hash).to.be.a('string');
      
        expect(array_or_error[0].key).to.be.a('string');
        apikey.revoke(
          owner,
          [generated_key_hash],
          (_success, /* result */) => {
            expect(_success).to.equal(true);
            done();
          });
      }
    );
  });

  it("(05) should return empty array  on invalid API Key revocation", function(done) {
    apikey.revoke(
      owner,
      ["sample-key-hax"], // intentionaly invalid
      (success)  => {
        expect(success).to.equal(true);
        done();
      }
    );
  });

  //list: function(owner, callback)
  it("(06) should be able to list API Keys (2)", function (done) {
    apikey.list(
      owner,
      (object) => {
        expect(object).to.be.a('array');
        console.log("[spec] 06 apikeys (2)", object);
        done();
      });
  });

  // currently fails, no key is being fetched
  it("(07) should be able to get first API Key (if exists)", function (done) {
    console.log(`[spec] (07) get_first_apikey for owner: ${owner}`);
    apikey.get_first_apikey(
      owner,
      (success, object) => {
        console.log(`[chai] (07) ${success} ${object}`);
        expect(success).to.equal(true);
        if (success) {
          expect(object).to.be.a('string');
        } else {
          console.log("[spec] (07) API Key Listing failed:", {object});
        }
        done();
      });
  });

});
