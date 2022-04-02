/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("Device API (noauth)", function () {

    let thx;

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    it("POST /device/register", function (done) {
        chai.request(thx.app)
            .post('/device/register')
            .send({ registration: {} })
            .end((err, res) => {
                expect(res.status).to.equal(404);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // must be fully mocked or run after build completes
    it("POST /device/firmware", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                //{"success":false,"status":"missing_mac"}
                done();
            });
    }, 20000);

    it("POST /device/addpush", function (done) {
        chai.request(thx.app)
            .post('/api/device/addpush')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(404);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // POST /api/device/envs
    it("POST /api/device/envs", function (done) {
        chai.request(thx.app)
            .post('/api/device/envs')
            .send({})
            .end((err, res) => {
                console.log("[chai] POST /api/device/envs response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/detail", function (done) {
        chai.request(thx.app)
            .post('/api/device/detail')
            .send({})
            .end((err, res) => {
                console.log("[chai] POST /api/device/detail response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/edit", function (done) {
        chai.request(thx.app)
            .post('/api/device/edit')
            .send({ changes: { alias: "edited-alias" } })
            .end((err, res) => {
                console.log("[chai] POST /api/device/edit response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /device/firmware", function (done) {
        chai.request(thx.app)
            .get('/device/firmware?ott=foo')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('OTT_INFO_NOT_FOUND');
                done();
            });
    }, 20000);
});

//
// Authenticated (requires JWT login and creating valid API Key as well for /device/ requests)
//

describe("Device + API (JWT+Key)", function () {

    let thx = new THiNX();
    let agent;
    let jwt = null;
    let ak = null;

    beforeAll((done) => {
        thx.init(() => {
            agent = chai.request.agent(thx.app);
            agent
                .post('/api/login')
                .send({ username: 'dynamic', password: 'dynamic', remember: false })
                .then(function (res) {
                    // console.log(`[chai] Transformer (JWT) beforeAll POST /api/login (valid) response: ${JSON.stringify(res)}`);
                    expect(res).to.have.cookie('x-thx-core');
                    let body = JSON.parse(res.text);
                    jwt = 'Bearer ' + body.access_token;


                    agent
                        .post('/api/user/apikey')
                        .set('Authorization', jwt)
                        .send({
                            'alias': 'mock-apikey-alias'
                        })
                        .end((err, res) => {
                            //  {"success":true,"api_key":"9b7bd4f4eacf63d8453b32dbe982eea1fb8bbc4fc8e3bcccf2fc998f96138629","hash":"0a920b2e99a917a04d7961a28b49d05524d10cd8bdc2356c026cfc1c280ca22c"}
                            console.log("[chai] POST /api/user/apikey (authenticated), response...");
                            expect(res.status).to.equal(200);
                            let j = JSON.parse(res.text);
                            expect(j.success).to.equal(true);
                            expect(j.api_key).to.be.a('string');
                            expect(j.hash).to.be.a('string');
                            ak = j.hash;
                            console.log("[spec] saving apikey's hash (3) for device testing", j.hash);
                            done();
                        });
                });
        });
    });

    afterAll((done) => {
        agent.close();
        done();
    });

    it("POST /device/register (invalid)", function (done) {
        chai.request(thx.app)
            .post('/device/register')
            .set('Authentication', ak)
            .send({ registration: {} })
            .end((err, res) => {
                expect(res.status).to.equal(404);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // must be fully mocked or run after build completes
    it("POST /device/firmware", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .set('Authentication', ak)
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                //{"success":false,"status":"missing_mac"}
                done();
            });
    }, 20000);

    it("POST /device/addpush", function (done) {
        chai.request(thx.app)
            .post('/api/device/addpush')
            .set('Authentication', ak)
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(404);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /device/firmware", function (done) {
        chai.request(thx.app)
            .get('/device/firmware?ott=foo')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('OTT_INFO_NOT_FOUND');
                done();
            });
    }, 20000);

    // POST /api/device/envs
    it("POST /api/device/envs", function (done) {
        agent
            .post('/api/device/envs')
            .set('Authentication', ak)
            .send({})
            .end((err, res) => {
                console.log("[chai] POST /api/device/envs response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/detail", function (done) {
        chai.request(thx.app)
            .post('/api/device/detail')
            .set('Authentication', ak)
            .send({})
            .end((err, res) => {
                console.log("[chai] POST /api/device/detail response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/edit", function (done) {
        chai.request(thx.app)
            .post('/api/device/edit')
            .set('Authentication', ak)
            .send({ changes: { alias: "edited-alias" } })
            .end((err, res) => {
                console.log("[chai] POST /api/device/edit response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

});