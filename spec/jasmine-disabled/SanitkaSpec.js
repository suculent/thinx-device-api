describe("Sanitka", function () {

  var expect = require('chai').expect
  var Sanitka = require('../../lib/thinx/sanitka');
  var sanitka = new Sanitka();

  it("should sanitize URLs", function () {
    var s = sanitka.url("https://github.com/suculent/thinx-device-api/ && ");
    expect(s).to.equal("https://github.com/suculent/thinx-device-api/  ");
  });

  it("should sanitize branches (removing origin/)", function () {
    var s = sanitka.url("origin/master&");
    expect(s).to.equal("master");
  });

  it("should de-escape (delete) dangerous shell characters \", \', ;", function () {
    var s = sanitka.deescape("\"\';;;\"");
    expect(s.length).to.equal(0);
  });

});
