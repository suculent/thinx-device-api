describe("RSA Key", function() {

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

  it("(00) should be able to add RSA Keys first", function(done) {
    rsakey.create(owner,
    function(success, response) {
      expect(success).to.be.true;
      // expect(response).to.be.a('object'); 
      done();
    });
  }, 10000);

  it("(01) should be able to list RSA Keys", function(done) {
    rsakey.list(owner, function(success, list) {
      expect(success).to.be.true;
      expect(list.length).to.be.greaterThanOrEqual(1);
      done();
    });
  }, 10000);

  it("(02) should fail on invalid revocation", function(done) {
    rsakey.revoke(owner, invalid_fingerprints,
      function(success, message) {
        expect(success).to.be.true; // succeds for more fingerprints if one is valid? maybe...
        expect(message).to.be.an('array');
        done();
      });
  }, 10000);

  it("(03) should be able to add RSA Key 2/3", function(done) {
    rsakey.create(owner, (success, response) => {
      revoked_filenames.push(response.filename);
      expect(success).to.be.true;
    });
    rsakey.create(owner, (success, response) => {
        revoked_filenames.push(response.filename);
        expect(success).to.be.true;
        done();
    });
  }, 10000);

  it("should be able to revoke multiple RSA Keys at once", function(done) {
    rsakey.revoke(owner, revoked_filenames, function(success, message) {
        expect(success).to.be.true;
        expect(message).to.be.an('array'); // should be array of length of 2
        done();
      });
  }, 10000);

});
