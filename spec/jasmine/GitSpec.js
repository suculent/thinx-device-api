describe("Git", function() {

    var expect = require('chai').expect;
    let Git = require("../../lib/thinx/git");

    it("should be able to fetch", function() {
        let git = new Git();
        let SHELL_FETCH = "git pull --recurse-submodules";
        let local_path = __dirname;
        let result = git.fetch("<owner>", SHELL_FETCH, local_path);
        expect(result).to.be.true;
    });

});