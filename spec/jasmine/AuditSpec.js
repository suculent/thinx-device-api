var envi = require("./_envi.json");
var owner = envi.oid;

describe("Audit log", function() {

  var Audit = require('../../lib/thinx/audit');

  it("should be able to log", function(done) {
    var s = Audit.log(owner, "Log test successful.", function(result) {
      expect(result).toBe(true);
      done();
    });
  }, 5000);

  it("should be able to fetch audit log", function(done) {
    var r = Audit.fetch(
      owner,
      function(err, body) {
        done();
      }
    );
  }, 15000);

});
