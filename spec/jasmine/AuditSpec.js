describe("Audit log", function() {

  var expect = require('chai').expect;

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var Audit = require('../../lib/thinx/audit');


  var audit = new Audit();

  it("should be able to log", function(done) {
    audit.log(owner, "Log test successful.", "info", function(result) {
      expect(result).to.equal(true);
      done();
    });
  }, 5000);

  it("should survive invalid log message", function(done) {
    audit.log(owner, undefined, "info", function(result) {
      expect(result).to.equal(true);
      done();
    });
  }, 5000);

  it("should be able to fetch audit log", function(done) {
    audit.fetch(
      owner,
      function(err, body) {
        expect(body).to.be.a('array');
        expect(err).to.equal(false);
        done();
      }
    );
  }, 15000);

  it("should return error on invalid audit log request", function(done) {
    audit.fetch(
      "invalid-owner-id",
      function(err, body) {
        expect(body).to.be.a('array');
        console.log("[spec] TODO: add expect on length of", {body});
        expect(err).to.equal(false);
        done();
      }
    );
  }, 15000);


});
