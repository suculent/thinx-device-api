var envi = require("./_envi.json");
var owner = envi.oid;

describe("Audit log", function() {

  var audit = require('../../lib/thinx/audit'); var Audit = new audit();

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
        expect(err).toBe(false);
        done();
      }
    );
  }, 15000);

});
