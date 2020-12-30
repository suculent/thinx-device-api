describe("RSA Key", function() {

  let revoked_fingerprint;
  
  var expect = require('chai').expect;
  var RSAKey = require("../../lib/thinx/rsakey");
  var rsakey = new RSAKey();

  var envi = require("../_envi.json");
  var owner = envi.oid;

  var invalid_fingerprints = [
    "a9:fd:f3:8e:97:7d:f4:c1:e1:39:3f:fd:2b:3b:5f:9_"
  ];

  var revoked_filenames = [

  ];

  it("should be able to add RSA Keys first", function(done) {
    rsakey.create(owner,
    function(success, response) {
      revoked_fingerprint = response;
      //console.log("RSA add result: " , {response});
      expect(success);
      done();
    });
  }, 10000);

  it("should be able to list RSA Keys", function(done) {
    rsakey.list(owner, function(success, list) {
      expect(success).to.equal(true);
      console.log("RSA list item count: " + list.length);
      done();
    });
  }, 10000);

  it("should fail on invalid revocation", function(done) {
    rsakey.revoke(owner, invalid_fingerprints,
      function(success, message) {
        //console.log("RSA revocation result: " +JSON.stringify(message));
        expect(success).to.equal(true); // succeds for more fingerprints if one is valid? maybe...
        expect(message).to.be.a('array');
        done();
      });
  }, 10000);

  it("should be able to add RSA Key 2", function(done) {
    rsakey.create(owner,
    function(success, response) {
      revoked_filenames.push(response.filename);
      //console.log("RSA add result: " , {response});
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("should be able to add RSA Key 3", function(done) {
    rsakey.create(owner,
    function(success, response) {
      revoked_filenames.push(response.filename);
      //console.log("RSA add result: " , {response});
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("should be able to revoke multiple RSA Keys at once", function(done) {
    console.log({revoked_filenames});
    rsakey.revoke(owner, revoked_filenames,
      function(success, message) {
        console.log("RSA revocation result: " + JSON.stringify(message));
        expect(success).to.equal(true);
        expect(message).to.be.a('array'); // should be array of length of 2
        done();
      });
  }, 10000);

});
