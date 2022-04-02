var JWTLogin = require("../../lib/thinx/jwtlogin");
var expect = require('chai').expect;

const Globals = require("../../lib/thinx/globals.js");
const envi = require("../_envi.json");
const owner = envi.oid;

const redis_client = require('redis');
const redis = redis_client.createClient(Globals.redis_options());

const login = new JWTLogin(redis);

describe("JWT Login", function () {

    it("should fetch key even when deleted", function (done) {
        login.revokeSecretKey(() => {
            login.fetchOrCreateSecretKey((result) => {
                expect(result).to.be.a('string');
                done();
            });
        });
    }, 10000);

    it("should generate secret in order to generate JWT", function (done) {
        login.init((key) => {
            expect(key).to.be.a('string');
            login.sign(owner, (response) => {
                expect(response).to.be.a('string');
                done();
            });
        });
    }, 5000);

    it("should create JWT and verify", function (done) {
        login.sign(owner, (response) => {
            expect(response).to.be.a('string');
            let mock_req = {
                "headers" : {
                    "Authorization" : 'Bearer ' + response
                }
            };
            login.verify(mock_req, (error, payload) => {
                expect(error).to.equal(null);
                expect(payload).to.be.a('object');
                done();
            });
        });
    }, 10000);

    it("should reset secret key", function (done) {
        login.resetSecretKey((result) => {
            expect(result).to.be.a('string');
            done();
        });
    }, 10000);
});
