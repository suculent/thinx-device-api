/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");

let thx;

describe("Sources (noauth)", function () {

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    it("GET /api/user/sources/list", function (done) {
        chai.request(thx.app)
            .get('/api/user/sources/list')
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/user/sources/list response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/source", function (done) {
        chai.request(thx.app)
            .post('/api/user/source')
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/source response:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":true,"source_id":"ebd8311b0546b20fbff526df87b6853e502036d51eee3aefc7d8a4d2a4391ce5"}');
                done();
            });
    }, 20000);

    it("POST /api/user/source/revoke (invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/source/revoke')
            .send({ key_id: null })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/source/revoke response:", res.text, " status:", res.status);
                expect(res.status).to.equal(403);
                done();
            });
    }, 20000);
});

describe("Sources (JWT)", function () {

    let agent;
    let jwt;
  
    beforeAll((done) => {
        agent = chai.request.agent(thx.app);
        agent
            .post('/api/login')
            .send({ username: 'dynamic', password: 'dynamic', remember: false })
            .catch((e) => { console.log(e); })
            .then(function (res) {
                // console.log(`[chai] Transformer (JWT) beforeAll POST /api/login (valid) response: ${JSON.stringify(res)}`);
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

    let source_for_revocation = null;

    let mock_source = {
        owner: envi.oid,
        alias: "mock-source",
        url: "https://github.com/suculent/thinx-firmware-esp8266-pio",
        branch: "origin/master",
        secret: process.env.GITHUB_SECRET
      };

    it("GET /api/user/sources/list (valid)", function (done) {
        chai.request(thx.app)
            .get('/api/user/sources/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/user/sources/list (valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/source (invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/source')
            .set('Authorization', jwt)
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/source response:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"status":"missing_source_alias"}');
                done();
            });
    }, 20000);

    it("POST /api/user/source (valid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/source')
            .set('Authorization', jwt)
            .send(mock_source)
            .end((err, res) => {
                expect(res.text).to.be.a('string');
                let r = JSON.parse(res.text);
                source_for_revocation = r.source_id;
                expect(res.status).to.equal(200);
                expect(r.success).to.equal(true);
                done();
            });
    }, 20000);

    it("POST /api/user/source/revoke", function (done) {
        chai.request(thx.app)
            .post('/api/user/source/revoke')
            .set('Authorization', jwt)
            .send({ source_id: null })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/source/revoke response:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"status":"missing_source_ids"}');
                done();
            });
    }, 20000);

    it("POST /api/user/source/revoke (valid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/source/revoke')
            .set('Authorization', jwt)
            .send({ source_ids: source_for_revocation })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/source/revoke (valid) response:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                done();
            });
    }, 20000);
});