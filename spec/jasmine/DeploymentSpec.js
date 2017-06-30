describe("Deployer", function() {


  var deploy = require('../../lib/thinx/deployment');

  var envi = require("_envi.json");
  var owner = envi.owner;
  var udid = envi.udid;

  var device = {
    mac: envi.mac,
    owner: envi.owner,
    version: envi.version,
    udid: envi.udid
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
