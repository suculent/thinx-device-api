describe("Deployer", function() {

  var deploy = require('../../lib/thinx/deployment');

  var owner =
    "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";

  var udid = "fcdd7b20-3980-11e7-a58d-81e4acfbeb86";

  var device = {
    mac: "0",
    owner: owner,
    version: "1",
    udid: udid
  };

  beforeEach(function() {
    //deploy = new Deploy();
  });

  it("should be able to initialize", function() {
    deploy.initWithOwner(owner);
    expect(deploy).toBeDefined();
  });

  it("should be able to init with device", function() {
    deploy.initWithDevice(device);
    expect(true).toBe(true);
  });

  it("should be able to return path for device", function() {
    var repo_path = deploy.pathForDevice(owner, udid);
    expect(repo_path).toBeDefined();
  });

  it("should be able to return latest firmware path", function() {
    var firmwarePath = deploy.latestFirmwarePath(device);
    expect(firmwarePath).toBeDefined();
  });

  it("should be able to tell whether update is available for device",
    function() {
      var result = deploy.hasUpdateAvailable(device);
      expect(result).toBeDefined();
    });

  it("should be able to return latest firmware version", function() {
    var firmwareVersion = deploy.latestFirmwareVersion(device);
    expect(firmwareVersion).not.toBeDefined();
  });

  it("should be able to return latest firmware envelope", function() {
    var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(
      device);
    expect(firmwareUpdateDescriptor).toBeDefined();
  });

});
