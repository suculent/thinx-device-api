var JWTLogin = require("../../lib/thinx/jwtlogin");
var expect = require('chai').expect;

var envi = require("../_envi.json");
var owner = envi.oid;
var username = envi.username;

let redis_client = require('redis');
let redis = redis_client.createClient(Globals.redis_options());

let login = new JWTLogin(redis);

describe("JWT Login", function () {

    it("should generate secret in order to sign first request", function (done) {
        login.init(() => {
            login.sign(username, owner, (response) => {
                console.log("JWT sign response:", { response });
                expect(response).to.be.an('object');
                done();
            });
        });
    }, 5000);

    it("should reuse secret in order to sign another request and verify", function (done) {
        login.sign(username, owner_id, (response) => {
            console.log("JWT sign response:", { response });
            expect(response).to.be.an('object');
            let mock_req = {
                "headers" : {
                    "Authentication" : response
                }
            };
            login.verify(mock_req, (result) => {
                console.log("Secret verification result:", {result});
                done();
            });
        });
    }, 5000);
});
