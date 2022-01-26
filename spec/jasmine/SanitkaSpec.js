describe("Sanitka", function () {

  var expect = require('chai').expect;
  var Sanitka = require('../../lib/thinx/sanitka');
  var sanitka = new Sanitka();

  it("should sanitize URLs", function () {
    var s = sanitka.url("https://github.com/suculent/thinx-device-api/ && ");
    expect(s).to.equal("https://github.com/suculent/thinx-device-api/  ");
  });

  it("should sanitize branches (removing &)", function () {
    var s = sanitka.url("origin/master&");
    expect(s).to.equal("origin/master");
  });

  it("should de-escape (delete) dangerous shell characters \", \', ;", function () {
    var s = sanitka.deescape("\"\';;;\"");
    expect(s.length).to.equal(0);
  });

  it("should accept valid owner", function () {
    let input = "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823";
    var result = sanitka.owner(input);
    expect(result).to.equal(input);
  });

  it("should reject valid owner", function () {
    var result = sanitka.owner("invalid-owner");
    expect(result).to.equal(0);
  });

});
