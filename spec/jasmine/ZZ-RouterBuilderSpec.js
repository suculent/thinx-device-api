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

describe("Builder (noauth)", function () {

    beforeAll((done) => {
        thx = new THiNX();
        thx.on('workerReady', () => {
            console.log("[spec] [emit] worker ready!"); // should allow waiting for worker beforeAll
        });
        thx.init(() => {
            done();
        });
    });

    // run build manually
    it("POST /api/build", function (done) {
        chai.request(thx.app)
            .post('/api/build')
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] response /api/build:", res.text, " status:", res.status);
                expect(res.status).to.equal(403);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // latest firmware envelope
    it("POST /api/device/envelope", function (done) {
        chai.request(thx.app)
            .post('/api/device/envelope')
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] response /api/device/envelope:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); // false
                done();
            });
    }, 20000);

    // get build artifacts
    it("POST /api/device/artifacts", function (done) {
        chai.request(thx.app)
            .post('/api/device/artifacts')
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] response /api/device/artifacts:", res.text, " status:", res.status);
                expect(res.status).to.equal(403);
                done();
            });
    }, 20000);

});

//
// Authenticated
//

describe("Builder (JWT)", function () {

    let agent;
    let jwt;

    beforeAll((done) => {
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

    afterAll((done) => {
        agent.close();
        done();
    });

    // run build manually
    it("POST /api/build (JWT, invalid)", function (done) {
        agent
            .post('/api/build')
            .set('Authorization', jwt)
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] response /api/build (JWT, invalid):", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // latest firmware envelope
    it("POST /api/device/envelope (JWT, invalid)", function (done) {
        agent
            .post('/api/device/envelope')
            .set('Authorization', jwt)
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] response /api/device/envelope (JWT, invalid):", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('false');
                done();
            });
    }, 20000);

    // get build artifacts
    it("POST /api/device/artifacts (JWT, invalid)", function (done) {
        agent
            .post('/api/device/artifacts')
            .set('Authorization', jwt)
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] response /api/device/artifacts (JWT, invalid):", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"missing_udid"}');
                done();
            });
    }, 20000);

});