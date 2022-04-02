/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");

describe("RSA Keys (noauth)", function () {

    let thx;

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    it("GET /api/user/rsakey/create", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/create')
            .end((err, res) => {
                console.log("[chai] GET /api/user/rsakey/create response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /api/user/rsakey/list", function (done) {
        console.log("[chai] request /api/user/rsakey/list");
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .end((err, res) => {
                console.log("[chai] GET /api/user/rsakey/list response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/rsakey/revoke (invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .send()
            .end((err, res) => {
                console.log("[chai] POST /api/user/rsakey/revoke (invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

});

describe("RSA Keys (JWT)", function () {

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

    let key_id = null;

    it("GET /api/user/rsakey/create", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/create')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("[chai] GET /api/user/rsakey/create response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /api/user/rsakey/list", function (done) {
        console.log("[chai] request /api/user/rsakey/list");
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("[chai] GET /api/user/rsakey/list response:", res.text, " status:", res.status);
                // key_id =
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/rsakey/revoke (invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .set('Authorization', jwt)
            .send()
            .end((err, res) => {
                console.log("[chai] POST /api/user/rsakey/revoke (invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    xit("POST /api/user/rsakey/revoke (valid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .set('Authorization', jwt)
            .send({ filenames: [key_id]})
            .end((err, res) => {
                console.log("[chai] POST /api/user/rsakey/revoke (valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});