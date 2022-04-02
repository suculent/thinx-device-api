/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);
//
// Unauthenticated
//

describe("API Keys (noauth)", function () {

    let thx = new THiNX();

    beforeAll((done) => {
        thx.init(() => {
            done();
        });
    });

    // create
    it("POST /api/user/apikey", function (done) {
        console.log("[chai] request /api/user/apikey");
        chai.request(thx.app)
            .post('/api/user/apikey')
            .send({
                'alias': 'mock-apikey-alias'
            })
            .end((err, res) => {
                console.log("[chai] response /api/user/apikey:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // revoke
    it("POST /api/user/apikey/revoke", function (done) {
        console.log("[chai] request /api/user/apikey/revoke");
        chai.request(thx.app)
            .post('/api/user/apikey/revoke')
            .send({
                'alias': 'mock-apikey-alias'
            })
            .end((err, res) => {
                console.log("[chai] response /api/user/apikey/revoke:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // list
    it("GET /api/user/apikey/list", function (done) {
        console.log("[chai] request GET /api/user/apikey/list");
        chai.request(thx.app)
            .get('/api/user/apikey/list')
            .end((err, res) => {
                console.log("[chai] response /api/user/apikey/list:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});

//
// Authenticated
//


describe("API Keys (JWT)", function () {

    let thx = new THiNX();
    let agent;
    let jwt;

    beforeAll((done) => {
        thx.init(() => {
            agent = chai.request.agent(thx.app);

            agent
                .post('/api/login')
                .send({ username: 'dynamic', password: 'dynamic', remember: false })
                .then(function (res) {
                    console.log(`[chai] beforeAll POST /api/login (valid) response: ${JSON.stringify(res)}`);
                    expect(res).to.have.cookie('x-thx-core');
                    let body = JSON.parse(res.text);
                    jwt = 'Bearer ' + body.access_token;
                    done();
                });
        });
    });

    afterAll((done) => {
        agent.close();
        done();
    });

    //
    // Unauthenticated
    //

    // create
    it("POST /api/user/apikey", function (done) {
        console.log("[chai] request /api/user/apikey (JWT)");
        chai.request(thx.app)
            .post('/api/user/apikey')
            .set('Authorization', jwt)
            .send({
                'alias': 'mock-apikey-alias'
            })
            .end((err, res) => {
                console.log("[chai] response /api/user/apikey (JWT):", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // revoke
    it("POST /api/user/apikey/revoke", function (done) {
        console.log("[chai] request /api/user/apikey/revoke (JWT)");
        chai.request(thx.app)
            .post('/api/user/apikey/revoke')
            .set('Authorization', jwt)
            .send({
                'alias': 'mock-apikey-alias'
            })
            .end((err, res) => {
                console.log("[chai] response /api/user/apikey/revoke (JWT):", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // list
    it("GET /api/user/apikey/list", function (done) {
        console.log("[chai] request GET /api/user/apikey/list (JWT)");
        chai.request(thx.app)
            .get('/api/user/apikey/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("[chai] response /api/user/apikey/list (JWT):", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});
