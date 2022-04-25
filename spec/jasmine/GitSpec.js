describe("Git", function () {

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running Git spec`);
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed Git spec`);
    });


    var expect = require('chai').expect;
    let Git = require("../../lib/thinx/git");
    var Deployment = require('../../lib/thinx/deployment'); var deploy = new Deployment();

    var envi = require("../_envi.json");
    var device_path = deploy.pathForDevice(envi.oid, envi.udid);
    var dyn_device_path = deploy.pathForDevice(envi.dynamic.owner, envi.dynamic.udid);

    it("should be able to fetch one repo", function () {
        let git = new Git();
        let success = git.fetch(
            "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c", // owner
            "git clone https://github.com/suculent/thinx-firmware-esp8266-pio", // command
            device_path
        );
        expect(success === true);
    });

    it("should be able to fetch another repo", function () {
        let git = new Git();
        let success = git.fetch(
            "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c", // owner
            "git clone https://github.com/suculent/thinx-firmware-esp32-pio", // command
            device_path
        );
        expect(success === true);
    });

    it("should be able to fail safely", function () {
        let git = new Git();
        let success = git.fetch(
            "07cef9718edaad79b3974251bb5ef4aedca58703142e8c4c48c20f96cda4979c", // owner
            "git clone https://github.com/suculent/doesnotexist", // command
            device_path
        );
        expect(success === false);
    });

    it("should survive invalid input", function () {
        let git = new Git();
        let success = git.tryShellOp("export", "&&");
        expect(success === false);
    });

    it("should be able to fetch first repo for dynamic owner", function () {
        let git = new Git();
        let success = git.fetch(
            envi.dynamic.owner, // owner
            "git clone https://github.com/suculent/thinx-firmware-esp8266-ino", // command
            dyn_device_path
        );
        expect(success === true);
    });

    it("should be able to fetch first repo for dynamic owner", function () {
        let git = new Git();
        let success = git.fetch(
            envi.dynamic.owner, // owner
            "git clone https://github.com/suculent/thinx-firmware-esp8266-pio", // command
            dyn_device_path
        );
        expect(success === true);
    });

    it("should be able to fetch another repo for dynamic owner", function () {
        let git = new Git();
        let success = git.fetch(
            envi.dynamic.owner, // owner
            "git clone https://github.com/suculent/thinx-firmware-esp32-pio", // command
            dyn_device_path
        );
        expect(success === true);
    });

});