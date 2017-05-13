describe("Version", function() {

  var v = require('../../lib/thinx/version');

  beforeEach(function() {
    //
  });

  it("should be able to return current project revision", function() {
    expect(v.revision()).toBeDefined();
  });

});
