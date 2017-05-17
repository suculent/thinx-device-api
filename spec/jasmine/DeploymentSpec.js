describe("Deployer", function() {

  var Deploy = require('../../lib/thinx/deployment');

  beforeEach(function() {
    //deploy = new Deploy();
  });

  it("should be able to initialize", function() {
    var Deploy = require('../../lib/thinx/deployment');
    expect(Deploy).toBeDefined();
  });

  xit("should be able to init with device", function() {
    // create device path if owner does not exists on build
    expect(true).toBe(true);
  });

  xit("should be able to init with owner", function() {
    // create user path if owner does not exists on init
    expect(true).toBe(true);
  });

  xit("should be able to return path for device", function() {
    expect(true).toBe(true);
  });

  xit("should be able to return latest firmware path", function() {
    expect(true).toBe(true);
  });

  xit("should be able to tell whether update is available for device",
    function() {
      expect(true).toBe(true);
    });

  xit("should be able to return latest firmware version", function() {
    expect(true).toBe(true);
  });

  xit("should be able to return latest firmware envelope", function() {
    expect(true).toBe(true);
  });

});
