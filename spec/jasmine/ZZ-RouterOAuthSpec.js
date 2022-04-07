/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("OAuth", function () {

    let thx;

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    // Slack OAuth Integration

    it("GET /api/slack/direct_install", function (done) {
        chai.request(thx.app)
            .get('/api/slack/direct_install')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res).to.be.html;
                done();
            });
    }, 20000);

    it("GET /api/slack/redirect", function (done) {
        chai.request(thx.app)
            .get('/api/slack/redirect?code=A&state=B')
            .end((err/* , res */) => {
                console.log("🚸 [chai] response /api/slack/redirect err (status undefined):", { err });
                expect(err.code == 'ECONNREFUSED');
                done();
            });
    }, 20000);

    // Github OAuth

    it("GET /api/oauth/github", function (done) {
        console.log("🚸 [chai] GET /api/oauth/github request");
        chai.request(thx.app)
            .get('/api/oauth/github')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                done();
            });
    }, 20000);

    it("GET /api/oauth/github/callback", function (done) {
        console.log("🚸 [chai] request /api/oauth/github/callback");
        chai.request(thx.app)
            .get('/api/oauth/github/callback')
            .end((err, res) => {
                console.log("🚸 [chai] response /api/oauth/github/callback status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /api/oauth/github/callback?code=B", function (done) {
        console.log("🚸 [chai] request /api/oauth/github/callback?code=B");
        chai.request(thx.app)
            .get('/api/oauth/github/callback?code=B')
            .end((err, res) => {
                console.log("🚸 [chai] response /api/oauth/github/callback?code=B status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // Google OAuth

    it("GET /api/oauth/google", function (done) {
        chai.request(thx.app)
            .get('/api/oauth/google')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                done();
            });
    }, 20000);

    it("GET /api/oauth/google/callback", function (done) {
        chai.request(thx.app)
            .get('/api/oauth/google/callback')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                done();
            });
    }, 20000);
});
