var expect = require('chai').expect;
let Git = require("../../lib/thinx/git");
let git = new Git();

describe("Git", function() {

    it("should be able to fetch", function() {
        let SHELL_FETCH = "git pull --recurse-submodules";
        let local_path = __dirname;
        let success = git.fetch("0fbe2e3d9326d4b318476c8a26b4ac93d38cf7da69b04204822a3bff102dc622", SHELL_FETCH, local_path);
        console.log("success", {success});
        expect(success); // may fail until <owner> is valid
    });

});