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
        var d1 = new Date();
        d1.setMonth(d1.getMonth() - 3);
        d1.setDate(d1.getDay() - 1);
        let user = mock_user;
        user.last_update = d1;
        let gdpr = new GDPR();
        console.log("[spec] 3 months - 24 hours before deletion");
        gdpr.notify24(user, (error) => {
            console.log("[spec] 24 hours before deletion ERROR:", error);
            done();
        });
    }, 10000);

    it("should notify 3 months - 168 hours before deletion", function(done) {
        let gdpr = new GDPR();
        var d2 = new Date();
        d2.setMonth(d2.getMonth() - 3);
        d2.setDate(d2.getDay() - 7);
        let user = mock_user;
        user.last_update = d2;
        console.log("[spec] 168  hours before deletion");
        gdpr.notify168(user, (error) => {
            console.log("[spec] 168 hours before deletion ERROR", error);
            done();
        });
    }, 10000);

});