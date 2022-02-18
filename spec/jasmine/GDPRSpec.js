describe("GDPR", function() {

    var expect = require('chai').expect;
    let GDPR = require("../../lib/thinx/gdpr");

    it("should not fail while scheduling guards", function(done) {
        let gdpr = new GDPR();
        expect(gdpr.guard()).to.be.true;
        done();
    }, 10000);

});