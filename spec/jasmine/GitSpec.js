describe("Git", function() {

    var expect = require('chai').expect;
    let Git = require("../../lib/thinx/git");

    it("should be able to fetch one repo", function(done) {
        let git = new Git();
        let success = git.fetch(
            "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c", // owner
            "git clone https://github.com/suculent/thinx-firmware-esp8266-pio", // command
            __dirname // local_path
        );
        expect(success).to.be.true;
        done();
    }, 10000);

    it("should be able to fetch another repo", function(done) {
        let git = new Git();
        let success = git.fetch(
            "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c", // owner
            "git clone https://github.com/suculent/thinx-firmware-esp32-pio", // command
            __dirname // local_path
        );
        expect(success).to.be.true;
        done();
    }, 10000);

    it("should be able to fail safely", function(done) {
        let git = new Git();
        let success = git.fetch(
            "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c", // owner
            "git clone https://github.com/suculent/doesnotexist", // command
            __dirname + "/C" // local_path
        );
        expect(success).to.be.false;
        done();
    }, 10000);

    it("should survive invalid input", function() {
        let git = new Git();
        let success = git.tryShellOp(";", "&&");        
        expect(success).to.be.false;
    });

});