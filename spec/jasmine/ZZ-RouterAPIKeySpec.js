/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

//
// Unauthenticated
//

let thx;
let agent;
let jwt;

describe("API Keys (noauth)", function () {

    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running API Keys (noauth) spec`);
        thx = new THiNX();
        thx.init(() => {
            agent = chai.request.agent(thx.app);
            agent
                .post('/api/login')
                .send({ username: 'dynamic', password: 'dynamic', remember: false })
                .catch((e) => { console.log(e); })
                .then(function (res) {
                    console.log(`🚸 [chai] beforeAll POST /api/login (valid) response: ${res}`);
                    expect(res).to.have.cookie('x-thx-core');
                    let body = JSON.parse(res.text);
                    jwt = 'Bearer ' + body.access_token;
                    done();
                });
        });
    });



    // create
    it("POST /api/user/apikey", function (done) {
        chai.request(thx.app)
            .post('/api/user/apikey')
            .send({
                'alias': 'mock-apikey-alias'
            })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    // revoke
    it("POST /api/user/apikey/revoke", function (done) {
        chai.request(thx.app)
            .post('/api/user/apikey/revoke')
            .send({
                'alias': 'mock-apikey-alias'
            })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    // list
    it("GET /api/user/apikey/list", function (done) {
        chai.request(thx.app)
            .get('/api/user/apikey/list')
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);
});

//
// Authenticated
//


describe("API Keys (JWT)", function () {

    afterAll((done) => {
        agent.close();
        console.log(`🚸 [chai] <<< completed API Keys (noauth) spec`);
        done();
    });

    var created_api_key = null;
    var created_api_key_2 = null;

    // create
    it("POST /api/user/apikey (1)", function (done) {
        chai.request(thx.app)
            .post('/api/user/apikey')
            .set('Authorization', jwt)
            .send({
                'alias': 'mock-apikey-alias'
            })
            .end((err, res) => {
                //  {"success":true,"api_key":"9b7bd4f4eacf63d8453b32dbe982eea1fb8bbc4fc8e3bcccf2fc998f96138629","hash":"0a920b2e99a917a04d7961a28b49d05524d10cd8bdc2356c026cfc1c280ca22c"}
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.api_key).to.be.a('string');
                expect(j.hash).to.be.a('string');
                created_api_key = j.hash;
                console.log("[spec] saving apikey (1)", j.api_key);
                done();
            });
    }, 20000);

    it("POST /api/user/apikey (2)", function (done) {
        chai.request(thx.app)
            .post('/api/user/apikey')
            .set('Authorization', jwt)
            .send({
                'alias': 'mock-apikey-alias-2'
            })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.api_key).to.be.a('string');
                expect(j.hash).to.be.a('string');
                console.log("[spec] saving apikey (2)", j.hash);
                created_api_key_2 = j.hash;
                done();
            });
    }, 20000);

    it("POST /api/user/apikey (3)", function (done) {
        chai.request(thx.app)
            .post('/api/user/apikey')
            .set('Authorization', jwt)
            .send({
                'alias': 'mock-apikey-alias-3'
            })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.api_key).to.be.a('string');
                expect(j.hash).to.be.a('string');
                done();
            });
    }, 20000);

    // revoke
    it("POST /api/user/apikey/revoke (single)", function (done) {
        expect(created_api_key).not.to.be.null;
        chai.request(thx.app)
            .post('/api/user/apikey/revoke')
            .set('Authorization', jwt)
            .send({
                'fingerprint': created_api_key
            })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.revoked).to.be.an('array');
                console.log(`🚸 [chai] API Keys in revocation:", ${JSON.stringify(j)} from res ${res.text}`);
                //expect(aks.length >= 1);
                done();
            });
    }, 20000);

    it("POST /api/user/apikey/revoke (multiple, fault)", function (done) {
        expect(created_api_key_2).not.to.be.null;
        chai.request(thx.app)
            .post('/api/user/apikey/revoke')
            .set('Authorization', jwt)
            .send({
                'fingerprints': created_api_key_2
            })
            .end((err, res) => {
                //  {"revoked":["7663ca65a23d759485fa158641727597256fd7eac960941fbb861ab433ab056f"],"success":true}
                console.log(`🚸 [chai] POST /api/user/apikey/revoke (multiple) response: ${res.text}, status ${res.status}`);
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.revoked).to.be.an('array');
                expect(j.revoked.length).to.equal(0);
                done();
            });
    }, 20000);

    it("POST /api/user/apikey/revoke (multiple)", function (done) {
        expect(created_api_key_2).not.to.be.null;
        chai.request(thx.app)
            .post('/api/user/apikey/revoke')
            .set('Authorization', jwt)
            .send({
                'fingerprints': [created_api_key_2]
            })
            .end((err, res) => {
                //  {"revoked":["7663ca65a23d759485fa158641727597256fd7eac960941fbb861ab433ab056f"],"success":true}
                console.log(`🚸 [chai] POST /api/user/apikey/revoke (multiple) response: ${res.text}, status ${res.status}`);
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.revoked).to.be.an('array');
                // TODO: fixme: does not delete anything... expect(j.revoked.length).to.equal(1);
                done();
            });
    }, 20000);

    // list
    it("GET /api/user/apikey/list", function (done) {
        chai.request(thx.app)
            .get('/api/user/apikey/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.api_keys).to.be.an('array');
                expect(j.api_keys.length >= 1);
                done();
            });
    }, 20000);

    // API v2

    it("POST /api/v2/apikey", function (done) {
        chai.request(thx.app)
            .post('/api/v2/apikey')
            .set('Authorization', jwt)
            .send({
                'alias': 'mock-apikey-alias-4'
            })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.api_key).to.be.a('string');
                expect(j.hash).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /api/v2/apikey", function (done) {
        chai.request(thx.app)
            .get('/api/v2/apikey')
            .set('Authorization', jwt)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.api_keys).to.be.an('array');
                expect(j.api_keys.length >= 1);
                done();
            });
    }, 20000);

    it("DELETE /api/v2/apikey", function (done) {
        expect(created_api_key).not.to.be.null;
        chai.request(thx.app)
            .deůete('/api/v2/apikey')
            .set('Authorization', jwt)
            .send({
                'fingerprint': 'mock-apikey-alias-4'
            })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.revoked).to.be.an('array');
                console.log(`🚸 [chai] API Keys in V2 revocation:", ${JSON.stringify(j)} from res ${res.text}`);
                //expect(aks.length >= 1);
                done();
            });
    }, 20000);

});
