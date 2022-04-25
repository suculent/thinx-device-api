/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;

describe("RSA Keys (noauth)", function () {

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
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("GET /api/user/rsakey/list", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/user/rsakey/revoke (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .send()
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

});

describe("RSA Keys (JWT)", function () {

    let agent;
    let jwt;
  
    beforeAll((done) => {
        agent = chai.request.agent(thx.app);
        agent
            .post('/api/login')
            .send({ username: 'dynamic', password: 'dynamic', remember: false })
            .then(function (res) {
                expect(res).to.have.cookie('x-thx-core');
                let body = JSON.parse(res.text);
                jwt = 'Bearer ' + body.access_token;
                done();
            })
            .catch((e) => { console.log(e); });
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
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                let k = j.status;
                expect(k).to.be.an('object');
                expect(k.name).to.be.a('number');
                expect(k.pubkey).to.be.a('string');
                
                done();
            });
    }, 20000);

    it("GET /api/user/rsakey/list", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/user/rsakey/list response:", res.text, res.status);
                let r = JSON.parse(res.text);
                key_id = r.rsakeys[0].filename;
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/rsakey/revoke (jwt, undefined)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .set('Authorization', jwt)
            .send()
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"status":"invalid_query"}');
                done();
            });
    }, 20000);

    it("POST /api/user/rsakey/revoke (valid)", function (done) {
        console.log("🚸 [chai] POST /api/user/rsakey/revoke (valid)");
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .set('Authorization', jwt)
            .send({ filenames: [key_id]})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/rsakey/revoke (valid) response:", JSON.stringify(res.text), res.status);
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.data).to.be.an('array');
                done();
            });
    }, 20000);
});