/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;

//var envi = require("../_envi.json");

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
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/transfer/request (noauth, invalid) response:", res.text, " status:", res.status);
                expect(res.status).to.equal(401);
                //expect(res).to.be.html; // headers incorrect!
                done();
            });
    }, 20000);

    it("GET /api/transfer/decline (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); // <html>
                done();
            });
    }, 20000);

    it("POST /api/transfer/decline (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res).to.be.html;
                done();
            });
    }, 20000);

    it("GET /api/transfer/accept (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/transfer/accept (noauth, invalid) response:", res.text, " status:", res.status);
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
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/transfer/accept (noauth, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});

describe("Transfer (JWT)", function () {

    let agent;
    let jwt;
  
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
            .end((err, res) => {
                //console.log("🚸 [chai] POST /api/transfer/request (jwt, invalid) response headers: ", res.header, " should contain Content-type: text/html");
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); // <html> - headers incorrect!
                expect(res).to.be.html;
                done();
            });
    }, 20000);

    it("GET /api/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .set('Authorization', jwt)
            .end((err, res) => {
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
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res).to.be.html;
                done();
            });
    }, 20000);

    it("GET /api/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/transfer/accept (jwt, invalid) response:", res.text, " status:", res.status);
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
            .end((err, res) => {
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
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    // v2

    it("POST /api/v2/transfer/request (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .set('Authorization', jwt)
            .send({})
            .end((err, res) => {
                //console.log("🚸 [chai] POST /api/transfer/request (jwt, invalid) response headers: ", res.header, " should contain Content-type: text/html");
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); // <html> - headers incorrect!
                expect(res).to.be.html;
                done();
            });
    }, 20000);

    it("GET /api/v2/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .set('Authorization', jwt)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); // <html>
                done();
            });
    }, 20000);

    it("POST /api/v2/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/decline')
            .set('Authorization', jwt)
            .send({ udid: null})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res).to.be.html;
                done();
            });
    }, 20000);

    it("GET /api/v2/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/transfer/accept (jwt, invalid) response:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    it("POST /api/v2/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/accept')
            .set('Authorization', jwt)
            .send({ udid: null })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);

    it("POST /api/v2/transfer/accept (noauth, null)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .set('Authorization', jwt)
            .send({ owner: null, transfer_id: null, udid: null})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"transfer_id_missing"}');
                done();
            });
    }, 20000);
});