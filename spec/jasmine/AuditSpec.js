var envi = require("../_envi.json");
var owner = envi.oid;

describe("Audit log", function() {

  var Audit = require('../../lib/thinx/audit'); var audit = new Audit();

  it("should be able to log", function(done) {
    audit.log(owner, "Log test successful.", "info", function(result) {
      expect(result).toBeDefined();
      expect(result).not.toBe(false);
      done();
    });
  }, 5000);

  it("should be able to fetch audit log", function(done) {
    audit.fetch(
      owner,
      function(err, body) {
        expect(body).toBeDefined();
        expect(err).toBe(false);
        done();
      }
    );
  }, 15000);

});
