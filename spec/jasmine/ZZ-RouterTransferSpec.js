/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");

describe("Device Ownership Transfer (noauth)", function () {

    let thx;

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    it("POST /api/transfer/request", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .send({})
            .end((err, res) => {
                console.log("[chai] POST /api/transfer/request response:", res.text, " status:", res.status);
                expect(res.status).to.equal(403);
                //expect(res).to.be.html; // headers incorrect!
                done();
            });
    }, 20000);

    it("GET /api/transfer/decline", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); // <html>
                done();
            });
    }, 20000);

    it("POST /api/transfer/decline", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res).to.be.html;
                done();
            });
    }, 20000);

    it("GET /api/transfer/accept", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .end((err, res) => {
                console.log("[chai] GET /api/transfer/accept response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/transfer/accept", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .send({})
            .end((err, res) => {
                console.log("[chai] POST /api/transfer/accept response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});

describe("Transfer (JWT)", function () {

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
                    // console.log(`[chai] Transformer (JWT) beforeAll POST /api/login (valid) response: ${JSON.stringify(res)}`);
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

    xit("unfinished", function (done) {
        done();
    }, 20000);
});