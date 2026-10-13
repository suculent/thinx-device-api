/* Router integration test only; does not have to cover full unit functionality. */

const bootstrap = require('../helpers/bootstrap');

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;

describe("RSA Keys (noauth)", function () {

    beforeAll((done) => {
        thx = bootstrap.thx;
        done();
    });

    it("GET /api/user/rsakey/create", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/create')
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

    it("GET /api/user/rsakey/list", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

    it("POST /api/user/rsakey/revoke (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .send()
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

    // Phase 45 D-02: rename needs a session; the CSRF layer may refuse first (403).
    it("PATCH /api/v2/rsakey (noauth)", function (done) {
        chai.request(thx.app)
            .patch('/api/v2/rsakey')
            .send({ filename: "0".repeat(64) + "-0", name: "P45 noauth" })
            .end((err, res) => {
                expect(res.status).to.be.oneOf([401, 403]);
                done();
            });
    }, 30000);

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
                let k = j.response;
                expect(k).to.be.an('object');
                expect(k.name).to.be.a('string'); // the date string since 38 WR-06
                expect(k.pubkey).to.be.a('string');
                
                done();
            });
    }, 30000);

    it("GET /api/user/rsakey/list", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                console.log("🚸 [chai] GET /api/user/rsakey/list response:", res.text, res.status);
                let r = JSON.parse(res.text);
                key_id = r.response[0].filename;
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                done();
            });
    }, 30000);

    it("POST /api/user/rsakey/revoke (jwt, undefined)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .set('Authorization', jwt)
            .send()
            .end((err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"invalid_body"}');
                done();
            });
    }, 30000);

    it("POST /api/user/rsakey/revoke (valid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .set('Authorization', jwt)
            .send({ filenames: [key_id]})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/user/rsakey/revoke (valid) response:", res.text, res.status);
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.response).to.be.an('array');
                done();
            });
    }, 30000);

    // Phase 45 KEY-04 / D-02: rename round trip on a key this spec creates and revokes.
    // Only the name changes; filename and fingerprint stay the same.
    let renamed = null; // { filename, fingerprint }

    function listKeys(callback) {
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                callback(JSON.parse(res.text).response);
            });
    }

    it("PATCH /api/v2/rsakey (jwt, rename round trip)", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/create')
            .query({ name: 'P45 router' })
            .set('Authorization', jwt)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                const created = JSON.parse(res.text).response;
                expect(created.name).to.equal('P45 router');
                listKeys((before) => {
                    const entry = before.find((k) => k.filename === created.filename);
                    expect(entry).to.be.an('object');
                    expect(entry.name).to.equal('P45 router');
                    renamed = { filename: entry.filename, fingerprint: entry.fingerprint };
                    chai.request(thx.app)
                        .patch('/api/v2/rsakey')
                        .set('Authorization', jwt)
                        .send({ filename: entry.filename, name: 'P45 renamed' })
                        .end((err2, res2) => {
                            expect(res2.status).to.equal(200);
                            expect(JSON.parse(res2.text).success).to.equal(true);
                            listKeys((after) => {
                                const again = after.find((k) => k.filename === entry.filename);
                                expect(again).to.be.an('object');
                                expect(again.name).to.equal('P45 renamed');
                                expect(again.filename).to.equal(entry.filename);
                                expect(again.fingerprint).to.equal(entry.fingerprint);
                                done();
                            });
                        });
                });
            });
    }, 60000);

    it("PATCH /api/v2/rsakey (jwt, bidi name)", function (done) {
        expect(renamed).to.be.an('object');
        chai.request(thx.app)
            .patch('/api/v2/rsakey')
            .set('Authorization', jwt)
            .send({ filename: renamed.filename, name: 'a' + String.fromCharCode(0x202e) + 'b' })
            .end((err, res) => {
                expect(res.status).to.equal(400);
                const j = JSON.parse(res.text);
                expect(j.success).to.equal(false);
                expect(j.response).to.equal('invalid_key_name');
                expect(j.reason).to.equal('bidi');
                done();
            });
    }, 30000);

    it("PATCH /api/v2/rsakey (jwt, unknown filename)", function (done) {
        chai.request(thx.app)
            .patch('/api/v2/rsakey')
            .set('Authorization', jwt)
            .send({ filename: "0".repeat(64) + "-0", name: 'P45 unknown' })
            .end((err, res) => {
                expect(res.status).to.equal(404);
                expect(res.text).to.equal('{"success":false,"response":"key_not_found"}');
                done();
            });
    }, 30000);

    it("POST /api/user/rsakey/revoke (jwt, the renamed key)", function (done) {
        expect(renamed).to.be.an('object');
        chai.request(thx.app)
            .post('/api/user/rsakey/revoke')
            .set('Authorization', jwt)
            .send({ filenames: [renamed.filename] })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                const j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.response).to.deep.equal([renamed.filename]);
                done();
            });
    }, 30000);
});