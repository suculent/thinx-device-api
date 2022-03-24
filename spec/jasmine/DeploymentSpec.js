describe("Deployer", function() {

  var expect = require('chai').expect;
  var Deployment = require('../../lib/thinx/deployment');
  var deploy = new Deployment();

  var envi = require("../_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;

  var device = {
    mac: envi.mac,
    owner: envi.oid,
    version: envi.version,
    udid: envi.udid
  };

  it("should be able to initialize", function() {
    deploy.initWithOwner(owner);
    expect(deploy).to.be.a('object');
  });

  it("should be able to init with device", function() {
    deploy.initWithDevice(device);
    expect(true).to.equal(true);
  });

  it("should be able to return path for device", function() {
    var repo_path = deploy.pathForDevice(owner, udid);
    expect(repo_path).to.be.a('string');
  });

  it("should be able to return latest firmware path", function() {
    var firmwarePath = deploy.latestFirmwarePath(device.owner);
    expect(firmwarePath).to.equal(false);
  });

  it("should be able to tell whether update is available for device",
    function() {
      var result = deploy.hasUpdateAvailable(device);
      expect(result).to.equal(false);
  });

  it("should be able to return latest firmware envelope", function() {
    var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(device.owner, device.udid);
    expect(firmwareUpdateDescriptor).to.equal(false);
  });

  it("should be able to return update support for platform", function() {
    var result = deploy.platformSupportsUpdate(device);
    expect(result).to.equal(true);
  });

  it("should be able to validate if device has update available", function() {
    var result = deploy.validateHasUpdateAvailable(device);
    expect(result).to.equal(false);
  });

});
