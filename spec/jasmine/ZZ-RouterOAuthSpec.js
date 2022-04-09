/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("OAuth", function () {

    let thx;

    beforeAll((done) => {
        console.log(`🚸 [chai] running OAuth spec`);
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });
    
    afterAll(() => {
        console.log(`🚸 [chai] completed OAuth spec`);
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
        chai.request(thx.app)
            .get('/api/oauth/github')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                done();
            });
    }, 20000);

    it("GET /api/oauth/github/callback", function (done) {
        chai.request(thx.app)
            .get('/api/oauth/github/callback')
            .end((err, res) => {
                console.log("🚸 [chai] response /api/oauth/github/callback status:", res.status);
                expect(res.status).to.equal(401); // only in test now because of unset event listeners!
                done();
            });
    }, 20000);

    it("GET /api/oauth/github/callback?code=B", function (done) {
        chai.request(thx.app)
            .get('/api/oauth/github/callback?code=B')
            .end((err, res) => {
                expect(res.status).to.equal(401); // only in test now because of unset event listeners!
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
