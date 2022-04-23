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
        console.log(`🚸 [chai] >>> running Sources (noauth) spec`);
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed Sources (noauth) spec`);
    });

    it("GET /api/user/sources/list", function (done) {
        chai.request(thx.app)
            .get('/api/user/sources/list')
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/user/source", function (done) {
        chai.request(thx.app)
            .post('/api/user/source')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/user/source/revoke (invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/source/revoke')
            .send({ key_id: null })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);
});

describe("Sources (JWT)", function () {

    let agent;
    let jwt;
  
    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running Sources (JWT) spec`);
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
  
    afterAll((done) => {
        agent.close();
        console.log(`🚸 [chai] <<< completed Sources (JWT) spec`);
        done();
    });

    let source_for_revocation = null;

    let mock_source = {
        owner: envi.dynamic.oid,
        alias: "mock-source",
        url: "https://github.com/suculent/thinx-firmware-esp8266-pio.git",
        branch: "master",
        secret: process.env.GITHUB_SECRET
      };

    it("GET /api/user/sources/list (valid)", function (done) {
        chai.request(thx.app)
            .get('/api/user/sources/list')
            .set('Authorization', jwt)
            .end((err, res) => {
                // {"success":true,"sources":{"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f3":{"alias":"THiNX Vanilla ESP8266 Arduino","url":"https://github.com/********/*****-firmware-esp8266-ino.git","branch":"origin/master","platform":"arduino"},"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f4":{"alias":"THiNX Vanilla ESP8266 Platform.io","url":"https://github.com/********/*****-firmware-esp8266-pio.git","branch":"origin/master","platform":"platformio"},"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f5":{"alias":"THiNX Vanilla ESP8266 Lua","url":"https://github.com/********/*****-firmware-esp8266-lua.git","branch":"origin/master","platform":"nodemcu"},"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f6":{"alias":"THiNX Vanilla ESP8266 Micropython","url":"https://github.com/********/*****-firmware-esp8266-upy.git","branch":"origin/master","platform":"micropython"},"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f7":{"alias":"THiNX Vanilla ESP8266 MongooseOS","url":"https://github.com/********/*****-firmware-esp8266-mos.git","branch":"origin/master","platform":"mongoose"}}}
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.sources).to.be.an('object');
                done();
            });
    }, 20000);


    it("GET /api/v2/source", function (done) {
        chai.request(thx.app)
            .get('/api/v2/source')
            .set('Authorization', jwt)
            .end((err, res) => {
                // {"success":true,"sources":{"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f3":{"alias":"THiNX Vanilla ESP8266 Arduino","url":"https://github.com/********/*****-firmware-esp8266-ino.git","branch":"origin/master","platform":"arduino"},"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f4":{"alias":"THiNX Vanilla ESP8266 Platform.io","url":"https://github.com/********/*****-firmware-esp8266-pio.git","branch":"origin/master","platform":"platformio"},"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f5":{"alias":"THiNX Vanilla ESP8266 Lua","url":"https://github.com/********/*****-firmware-esp8266-lua.git","branch":"origin/master","platform":"nodemcu"},"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f6":{"alias":"THiNX Vanilla ESP8266 Micropython","url":"https://github.com/********/*****-firmware-esp8266-upy.git","branch":"origin/master","platform":"micropython"},"7038e0500a8690a8bf70d8470f46365458798011e8f46ff012f12cbcf898b2f7":{"alias":"THiNX Vanilla ESP8266 MongooseOS","url":"https://github.com/********/*****-firmware-esp8266-mos.git","branch":"origin/master","platform":"mongoose"}}}
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.sources).to.be.an('object');
                done();
            });
    }, 20000);

    it("POST /api/user/source (invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/user/source')
            .set('Authorization', jwt)
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"status":"missing_source_alias"}');
                done();
            });
    }, 20000);

    it("POST /api/user/source (semi-valid, does not fetch)", function (done) {
        chai.request(thx.app)
            .post('/api/user/source')
            .set('Authorization', jwt)
            .send(mock_source)
            .end((err, res) => {
                expect(res.text).to.be.a('string');
                let r = JSON.parse(res.text);
                expect(res.status).to.equal(200);
                expect(r.success).to.equal(true);
                done();
            });
    }, 20000);

    it("PUT /api/v2/source (semi-valid, does not fetch)", function (done) {
        chai.request(thx.app)
            .put('/api/v2/source')
            .set('Authorization', jwt)
            .send(mock_source)
            .end((err, res) => {
                expect(res.text).to.be.a('string');
                let r = JSON.parse(res.text);
                expect(res.status).to.equal(200);
                expect(r.success).to.equal(true);
                done();
            });
    }, 20000);

    it("POST /api/user/source/revoke", function (done) {
        expect(source_for_revocation !== 0);
        chai.request(thx.app)
            .post('/api/user/source/revoke')
            .set('Authorization', jwt)
            .send({ source_id: null })
            .end((err, res) => {
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
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":true,"source_ids":[]}');
                done();
            });
    }, 20000);

    it("DELETE /api/user/source/revoke (valid)", function (done) {
        chai.request(thx.app)
            .delete('/api/v2/source')
            .set('Authorization', jwt)
            .send({ source_ids: source_for_revocation })
            .end((err, res) => {
                console.log("[chai] DELETE /api/v2/source response:", res.text, res.status);
                expect(res.status).to.equal(200);
                // expect(res.text).to.equal('{"success":true,"source_ids":[]}'); already deleted
                done();
            });
    }, 20000);
});