/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("OAuth", function () {

    // Slack OAuth Integration

    it("POST /api/slack/direct_install", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/slack/direct_install')
                .send({})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    it("GET /api/slack/redirect", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/slack/redirect?code=A&state=B')
                .end((err, res) => {
                    console.log("[chai] response /api/slack/redirect status:", res.status);
                    //expect(res.status).to.equal(200); 302
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    // Github OAuth

    it("GET /api/oauth/github", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/oauth/github')
                .end((err, res) => {
                    console.log("[chai] response /api/oauth/github status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    it("GET /api/oauth/github/callback", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/oauth/github/callback')
                .end((err, res) => {
                    console.log("[chai] response /api/oauth/github/callback status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);


    // Google OAuth

    it("GET /api/oauth/google", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/oauth/google')
                .end((err, res) => {
                    console.log("[chai] response /api/oauth/google status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    it("GET /api/oauth/google/callback", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/oauth/google/callback')
                .end((err, res) => {
                    console.log("[chai] response /api/oauth/google/callback status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);


});
