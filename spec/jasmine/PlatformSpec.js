describe("Platform", function() {

    let Platform = require("../../lib/thinx/platform");
    let platform = new Platform();
    let path = "./spec/test_repositories/arduino/";
    
    var expect = require('chai').expect;

    it("Should fetch platform from repository with callback", (done) => {
        platform.getPlatform(path, function(success, result) {
            expect(result).equal('arduino:esp8266');
            done();
        });
    });

    it("Should be able to run cron when initialized", () => {
        let result = platform.getPlatformFromPath(path);
        expect(result).equal("arduino:esp8266");
    });

    it("should be able to infer platform from repository contents", function(done) {
        platform.getPlatform(path, function(success, result) {
          expect(result).to.be.a('string');
          console.log("Platform: " + result);
          done();
        });
    }, 15000);

});