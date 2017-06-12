describe("Version", function() {

  var v = require('../../lib/thinx/version');

  it("should be able to initialize", function() {
    expect(v).toBeDefined();
  });

  it("should be able to return current project revision", function() {
    expect(v.revision()).toBeDefined();
  });

});
