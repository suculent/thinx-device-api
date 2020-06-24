describe("Version", function() {

  var expect = require('chai').expect;
  var Version = require('../../lib/thinx/version');
  var v;

  it("should be able to initialize", function() {
    v = new Version();
    expect(v).to.be.a('object');
  });

  it("should be able to return current project revision", function() {
    expect(v.revision()).to.be.a('number');
  });

});
