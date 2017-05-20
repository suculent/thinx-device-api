describe("Repository Watcher", function() {

  beforeEach(function() {
    //watcher = new Watcher();
  });

  it("should be able to initialize", function() {
    var Watcher = require('../../lib/thinx/repository');
    expect(Watcher).toBeDefined();
  });

  xit("should be able to watch repository", function() {
    expect(true).toBe(true);
  });

  xit("should be able tell repository has changed", function() {
    expect(true).toBe(true);
  });

  xit("should be able to unwatch repository", function() {
    expect(true).toBe(true);
  });

  xit("should be able to get revision", function() {
    expect(true).toBe(true);
  });

});
