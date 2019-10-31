describe("Version", function() {

  const Version = require('../../lib/thinx/version');
  const v = new Version();

  it("should be able to initialize", function() {
    expect(v).toBeDefined();
  });

  it("should be able to return current project revision", function() {
    expect(v.revision()).toBeDefined();
  });

});
