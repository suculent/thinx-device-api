describe("Build log", function() {


  beforeEach(function() {
    //build = new Build();
  });

  it("should be able to initialize", function() {
    var Build = require('../../lib/thinx/build');
    expect(Build).toBeDefined();
  });

  xit("should be able to list build logs", function() {
    expect(true).toBe(false);
  });

  xit("should be able to fetch specific build log", function() {
    expect(true).toBe(true);
  });

  xit("should be able to log", function() {
    expect(true).toBe(true);
  });

  xit("should be able to tail log for build_id", function() {
    expect(true).toBe(true);
  });

});
