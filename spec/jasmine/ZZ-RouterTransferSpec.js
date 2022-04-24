/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;

var envi = require("../_envi.json");

describe("Device Ownership Transfer (noauth)", function () {

    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running Transfer (noauth) spec`);
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed Transfer (noauth) spec`);
    });

    it("POST /api/transfer/request (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("GET /api/transfer/decline (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); // <html>
                done();
            });
    }, 20000);

    it("POST /api/transfer/decline (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/decline')
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("GET /api/transfer/accept (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    it("POST /api/transfer/accept (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);
});

describe("Transfer (JWT)", function () {

    let agent;
    let jwt;
    let transfer_id;
  
    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running Transfer (JWT) spec`);
        agent = chai.request.agent(thx.app);
        agent
            .post('/api/login')
            .send({ username: 'dynamic', password: 'dynamic', remember: false })
            .catch((e) => { console.log(e); })
            .then(function (res) {
                expect(res).to.have.cookie('x-thx-core');
                let body = JSON.parse(res.text);
                jwt = 'Bearer ' + body.access_token;
                done();
            });
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed Transfer (JWT) spec`);
    });

    // save trid for accept and decline, create valid version of this; needs at least two owners and one device
    it("POST /api/transfer/request (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .set('Authorization', jwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); 
                expect(res.text).to.equal('{"success":false,"status":"missing_recipient"}');
                done();
            });
    }, 20000);

    // migrate using invalid data (owner_id instead of e-mail)
    it("POST /api/transfer/request (jwt, semi-valid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .set('Authorization', jwt)
            .send({ to: envi.dynamic.owner, udids: [envi.udid], mig_sources: true, mig_apikeys: true })
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); 
                expect(res.text).to.equal('{"success":false,"status":"recipient_unknown"}');
                done();
            });
    }, 20000);

    // migrate from dynamic owner to cimrman
    it("POST /api/transfer/request (jwt, valid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .set('Authorization', jwt)
            .send({ to: "cimrman@thinx.cloud", udids: [envi.udid], mig_sources: false, mig_apikeys: false })
            .end((_err, res) => {
                console.log("🚸 [chai] POST /api/transfer/request (jwt, valid) response: ", res.text);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); 
                let j = JSON.parse(res.text);
                transfer_id = j.status;
                expect(j.success).to.equal(true);
                done();
            });
    }, 20000);

    it("GET /api/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); // <html>
                done();
            });
    }, 20000);

    it("POST /api/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/decline')
            .set('Authorization', jwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    it("GET /api/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    it("POST /api/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/accept')
            .set('Authorization', jwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    it("POST /api/transfer/accept (noauth, null)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .set('Authorization', jwt)
            .send({ owner: null, transfer_id: null, udid: null})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    // v2

    it("POST /api/v2/transfer/request (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/request')
            .set('Authorization', jwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"missing_recipient"}');
                done();
            });
    }, 20000);

    it("GET /api/v2/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/v2/transfer/decline')
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); // <html>
                done();
            });
    }, 20000);

    it("POST /api/v2/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/decline')
            .set('Authorization', jwt)
            .send({ udid: null})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    it("GET /api/v2/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    it("POST /api/v2/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .send({ udid: null, transfer_id: transfer_id })
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"owner_missing"}');
                done();
            });
    }, 20000);

    it("POST /api/v2/transfer/accept (jwt, invalid) 2", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .send({ udid: null, transfer_id: transfer_id, owner: envi.dynamic.owner })
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"udids_missing"}');
                done();
            });
    }, 20000);

    it("POST /api/v2/transfer/accept (jwt, invalid) 3", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .send({ udid: [envi.dynamic.udid], transfer_id: transfer_id, owner: envi.dynamic.owner }) // will probably need real device using GET /api/device
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":""}'); // intentionally failing string expect
                done();
            });
    }, 20000);

    it("POST /api/v2/transfer/accept (noauth, null)", function (done) {
        chai.request(thx.app)
            .get('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .send({ owner: null, transfer_id: null, udid: null})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    //console.log("🚸 [chai] GET /api/transfer/accept (jwt, invalid) response:", res.text, " status:", res.status);
                
});