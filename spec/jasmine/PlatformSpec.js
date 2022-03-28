describe("Platform", function() {

    let Platform = require("../../lib/thinx/platform");
    let path = "./spec/test_repositories/arduino/";
    let path_ino = "./spec/test_repositories/thinx-firmware-esp32-ino/";
    let path_lua = "./spec/test_repositories/thinx-firmware-esp8266-lua/";
    let path_pio = "./spec/test_repositories/thinx-firmware-esp8266-pio/";
    let path_upy = "./spec/test_repositories/thinx-firmware-esp8266-upy/";
    let path_mos = "./spec/test_repositories/thinx-firmware-esp8266-upy/";
    let path_js = "./spec/test_repositories/thinx-firmware-js/";
    
    var expect = require('chai').expect;

    it("Should fetch platform from repository with callback", (done) => {
        Platform.getPlatform(path, function(success, result) {
            expect(result).equal('arduino:esp8266');
            done();
        });
    });

    it("Should be able to run cron when initialized", () => {
        let result = Platform.getPlatformFromPath(path);
        expect(result).equal("arduino:esp8266");
    });

    it("should be able to infer platform from repository contents", function(done) {
        Platform.getPlatform(path, function(success, result) {
          expect(result).to.be.a('string');
          done();
        });
    }, 15000);

    it("should not fail on invalid local path", function(done) {
        let undefined_path;
        Platform.getPlatform(undefined_path, function(success, result) {
          expect(success).to.equal(false);
          expect(result).to.equal('local_path not defined');
          //console.log("platform detection result on intentionally invalid path:", result);
          done();
        });
    }, 15000);

    it("should detect arduino", function(done) {
        Platform.getPlatform(path_ino, function(success, result) {
          expect(success).to.equal(true);
          console.log("platform detection result:", result);
          done();
        });
    }, 15000);

    it("should detect lua", function(done) {
        Platform.getPlatform(path_lua, function(success, result) {
          expect(success).to.equal(true);
          console.log("platform detection result:", result);
          done();
        });
    }, 15000);

    it("should detect pio", function(done) {
        Platform.getPlatform(path_pio, function(success, result) {
          expect(success).to.equal(true);
          console.log("platform detection result:", result);
          done();
        });
    }, 15000);

    it("should detect micropython", function(done) {
        Platform.getPlatform(path_upy, function(success, result) {
          expect(success).to.equal(true);
          console.log("platform detection result:", result);
          done();
        });
    }, 15000);

    it("should detect mongoose os", function(done) {
      Platform.getPlatform(path_mos, function(success, result) {
        expect(success).to.equal(true);
        console.log("platform detection result:", result);
        done();
      });
  }, 15000);

  it("should detect monjavascriptgoose os", function(done) {
    Platform.getPlatform(path_js, function(success, result) {
      expect(success).to.equal(true);
      console.log("platform detection result:", result);
      done();
    });
}, 15000);

});