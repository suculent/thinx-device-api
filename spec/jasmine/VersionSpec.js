describe("Version", function() {

  var v = require('../../lib/thinx/version');

  it("should be able to initialize", function() {
    var v = require('../../lib/thinx/statistics');
    expect(v).toBeDefined();
  });

  it("should be able to return current project revision", function() {
    expect(v.revision()).toBeDefined();
  });

});
