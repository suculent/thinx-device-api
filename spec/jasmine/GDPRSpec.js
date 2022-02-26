describe("GDPR", function() {

    var expect = require('chai').expect;
    let GDPR = require("../../lib/thinx/gdpr");

    it("should not fail while scheduling guards", function(done) {
        let gdpr = new GDPR();
        expect(gdpr.guard()).to.equal(true);
        done();
    }, 10000);

    it("should not fail while purging", function(done) {
        let gdpr = new GDPR();
        gdpr.purgeOldUsers();
        done();
    }, 10000);

    it("should not fail while notifying", function(done) {
        let gdpr = new GDPR();
        gdpr.notifyOldUsers();
        done();
    }, 10000);

});