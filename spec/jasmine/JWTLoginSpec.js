var JWTLogin = require("../../lib/thinx/jwtlogin");
var expect = require('chai').expect;

const Globals = require("../../lib/thinx/globals.js");
const envi = require("../_envi.json");
const owner = envi.oid;
const username = envi.username;

const redis_client = require('redis');
const redis = redis_client.createClient(Globals.redis_options());

const login = new JWTLogin(redis);

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

    it("should sign and verify", function (done) {
        login.sign(username, owner, (response) => {
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
