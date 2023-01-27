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

    it("(000) should be able to add RSA Keys first", function(done) {
        rsakey.create(owner,
        function(success, response) {
          expect(success).to.equal(true);
          expect(response).to.be.a('object'); 
          done();
        });
      }, 10000);

    it("should be able to validate token", function (done) {
        GitHub.validateAccessToken(process.env.GITHUB_ACCESS_TOKEN, (result) => {
            expect(result).to.equal(true);
            done();
        });
    });

    it("should be able to add (any) RSA Key to GitHub", function (done) {
        rsakey.list(owner, (success, list) => {
            console.log("rsakey success:", success);
            if (list.length == 0) {
                console.log("No keys to add from", list);
                expect(false);
                done();
                return;
            }
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