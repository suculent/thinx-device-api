describe("Sanitka", function() {

  var Sanitka = require('../../lib/thinx/sanitka');
  var sanitka = new Sanitka();

  it("should sanitize URLs", function() {
    var s = sanitka.url("https://github.com/suculent/thinx-device-api/ && ");
    expect(s).toBe("https://github.com/suculent/thinx-device-api/  ");
  });

  it("should sanitize branches (removing origin/)", function() {
    var s = sanitka.url("origin/master&");
    expect(s).toBe("master");
  });

});
