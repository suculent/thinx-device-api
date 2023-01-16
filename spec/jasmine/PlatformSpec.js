describe("Platform", function () {

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running Platform spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Platforkm spec`);
  });

  let Platform = require("../../lib/thinx/platform");
  let path = "./spec/test_repositories/arduino/";
  let path_ino = "./spec/test_repositories/thinx-firmware-esp32-ino/";
  let path_lua = "./spec/test_repositories/thinx-firmware-esp8266-lua/";
  let path_pio = "./spec/test_repositories/thinx-firmware-esp8266-pio/";
  let path_upy = "./spec/test_repositories/thinx-firmware-esp8266-upy/";
  let path_mos = "./spec/test_repositories/thinx-firmware-esp8266-mos/";
  let path_js = "./spec/test_repositories/thinx-firmware-js/";

  var expect = require('chai').expect;

  it("Should fetch platform from repository with callback", (done) => {
    Platform.getPlatform(path, function (success, result) {
      expect(success).to.equal(true);
      expect(result).equal('arduino:esp8266');
      done();
    });
  });

  it("Should be able to run cron when initialized", () => {
    let result = Platform.getPlatformFromPath(path);
    expect(result).equal("arduino:esp8266");
  });

  it("should be able to infer platform from repository contents", function (done) {
    Platform.getPlatform(path, function (success, result) {
      expect(success).to.equal(true);
      expect(result).to.be.a('string');
      done();
    });
  }, 15000);

  it("should not fail on invalid local path", function (done) {
    Platform.getPlatform(undefined, function (success, result) {
      expect(success).to.equal(false);
      expect(result).to.equal('local_path not defined');
      done();
    });
  }, 15000);

  it("should detect arduino:esp32", (done) => {
    Platform.getPlatform(path_ino, function (success, result) {
      expect(success).to.equal(true);
      expect(result).to.equal('arduino:esp32');
      done();
    });
  }, 15000);

  it("should detect lua", function (done) {
    Platform.getPlatform(path_lua, (success, result) => {
      expect(success).to.equal(true);
      expect(result).to.equal('nodemcu');
      done();
    });
  }, 15000);

  it("should detect pio", function (done) {
    Platform.getPlatform(path_pio, (success, result) => {
      expect(success).to.equal(true);
      expect(result).to.equal('platformio');
      done();
    });
  }, 15000);

  it("should detect micropython", function (done) {
    Platform.getPlatform(path_upy, (success, result) => {
      expect(success).to.equal(true);
      expect(result).to.equal('micropython');
      done();
    });
  }, 15000);

  it("should detect mongoose os", function (done) {
    Platform.getPlatform(path_mos, (success, result) => {
      expect(success).to.equal(true);
      expect(result).to.equal('mongoose');
      done();
    });
  }, 15000);

  it("should detect javascript os", function (done) {
    Platform.getPlatform(path_js, (success, result) => {
      expect(success).to.equal(true);
      expect(result).to.equal('nodejs');
      done();
    });
  }, 15000);

});