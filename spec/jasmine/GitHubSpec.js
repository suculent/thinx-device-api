var RSAKey = require("../../lib/thinx/rsakey");
var rsakey = new RSAKey();
var expect = require('chai').expect;
let GitHub = require("../../lib/thinx/github");

var envi = require("../_envi.json");
var owner = envi.oid;

describe("GitHub", function () {

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running GitHub spec`);
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed GitHub spec`);
    });

    xit("should be able to validate token", function (done) {
        GitHub.validateAccessToken(process.env.GITHUB_ACCESS_TOKEN, (result) => {
            expect(result).to.equal(true);
            done();
        });
    });

    it("should be able to add (any) RSA Key to GitHub", function (done) {
        rsakey.list(owner, (success, list) => {
            console.log("rsakey success:", success);
            let key = list[0];
            let pubkey = key.pubkey;
            console.log("rsakey key:", pubkey);
            GitHub.addPublicKey(process.env.GITHUB_ACCESS_TOKEN, pubkey, (result) => {
                expect(result).to.equal(true);
                done();
            });
        });
    });

});