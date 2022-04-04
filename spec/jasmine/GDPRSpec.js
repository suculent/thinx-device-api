var envi = require("../_envi.json");

describe("GDPR", function() {

    var expect = require('chai').expect;
    let GDPR = require("../../lib/thinx/gdpr");

    it("should not fail while scheduling guards", function() {
        let gdpr = new GDPR();
        expect(gdpr.guard()).to.equal(true);
    }, 10000);

    it("should not fail while purging", function(done) {
        let gdpr = new GDPR();
        gdpr.purgeOldUsers((result) => {
            console.log("[spec] while purging", result);
            done();
        });
    }, 10000);

    it("should not fail while notifying", function(done) {
        let gdpr = new GDPR();
        gdpr.notifyOldUsers((result) => {
            console.log("[spec] while notifying", result);
            done();
        });
    }, 10000);

    let mock_user = {
        last_update: 1649088795,
        owner: envi.oid,
        notifiedBeforeGDPRRemoval24: false,
        notifiedBeforeGDPRRemoval168: false
    };

    it("should notify 24 hours before deletion", function(done) {
        let gdpr = new GDPR();
        gdpr.notify24(mock_user, (error) => {
            console.log("[spec] 24 hours before deletion", error);
            done();
        });
    }, 10000);

    it("should notify 168 hours before deletion", function(done) {
        let gdpr = new GDPR();
        gdpr.notify168(mock_user, (error) => {
            console.log("[spec] 168 hours before deletion", error);
            done();
        });
    }, 10000);

});