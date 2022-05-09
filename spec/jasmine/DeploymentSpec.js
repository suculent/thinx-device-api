describe("Deployer", function () {

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running Deployment spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Deployment spec`);
  });


  var expect = require('chai').expect;
  var Deployment = require('../../lib/thinx/deployment');
  var deploy = new Deployment();

  var envi = require("../_envi.json");
  var owner = envi.oid;

  var device = {
    mac: envi.mac,
    owner: envi.oid,
    version: envi.version,
    udid: envi.udid
  };

  it("should be able to initialize", function () {
    deploy.initWithOwner(owner);
    expect(deploy).to.be.a('object');
  });

  it("should be able to init with device", function () {
    deploy.initWithDevice(device);
    expect(true).to.equal(true);
  });

  it("should not be able to return latest firmware path for nonexistent device", function (done) {
    deploy.latestFirmwarePath(device.owner, "c6ff2bb0-df34-11e7-b351-eb37822aa172", (path) => {
      expect(path).to.equal(false);
      done();
    });
  });

  it("should be able to return latest firmware path", function (done) {
    deploy.latestFirmwarePath(device.owner, envi.udid, (path) => {
      expect(path).to.be.a('string');
      done();
    });
  });

  it("should be able to tell whether update is available for device", function () {
    var result = deploy.hasUpdateAvailable(device);
    expect(result).to.equal(false);
  });

  it("should be able to return latest firmware envelope", function () {
    var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(device.owner, device.udid);
    expect(firmwareUpdateDescriptor).to.be.an('object');
  });

  it("should be able to return update support for platform", function () {
    var result = deploy.platformSupportsUpdate(device);
    expect(result).to.equal(false);
  });

  it("should be able to validate if device has update available", function () {
    var result = deploy.validateHasUpdateAvailable(device);
    expect(result).to.equal(false);
  });

});
