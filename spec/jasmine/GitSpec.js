describe("Git", function() {

    var expect = require('chai').expect;
    let Git = require("../../lib/thinx/git");

    it("should be able to fetch", function(done) {
        let git = new Git();
        let success = git.fetch(
            "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c", 
            "git pull --recurse-submodules", 
            "~/thinx-device-api/spec/test_repositories/thinx-firmware-esp32-ino");
        console.log("git fetch result:", success);
        expect(success).to.be.true; // may fail until <owner> is valid
        done();
    }, 10000);

});