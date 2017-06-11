describe("Audit log", function() {

  var Audit = require('../../lib/thinx/audit');

  it("should be able to fetch audit log", function() {
    var r = Audit.fetch(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      function(err, body) {
        expect(err).toBe(false);
        expect(body).toBeDefined();
      }
    );
  });

  it("should be able to log", function() {
    var s = Audit.log(
      "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f",
      "test message");
    expect(true).toBe(true);
  });

});
