/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
var envi = require("../_envi.json");
chai.use(chaiHttp);

let thx;

describe("Device API (noauth)", function () {

    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running Device API (noauth) spec`);
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    it("POST /device/register A", function (done) {
        chai.request(thx.app)
            .post('/device/register')
            .send()
            .end((err, res) => {
                console.log("[chai] POST /device/register A response:", res.text);
                expect(res.status).to.equal(400);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /device/register B", function (done) {
        chai.request(thx.app)
            .post('/device/register')
            .send({ registration: {} })
            .end((err, res) => {
                console.log("[chai] POST /device/register B response:", res.text);
                expect(res.status).to.equal(400);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // must be fully mocked or run after build completes
    it("POST /device/firmware", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                //{"success":false,"status":"missing_mac"}
                done();
            });
    }, 20000);

    it("POST /device/addpush", function (done) {
        chai.request(thx.app)
            .post('/api/device/addpush')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(404);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // POST /api/device/envs
    it("POST /api/device/envs", function (done) {
        chai.request(thx.app)
            .post('/api/device/envs')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/device/detail", function (done) {
        chai.request(thx.app)
            .post('/api/device/detail')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/device/edit", function (done) {
        chai.request(thx.app)
            .post('/api/device/edit')
            .send({ changes: { alias: "edited-alias" } })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("GET /device/firmware", function (done) {
        chai.request(thx.app)
            .get('/device/firmware?ott=foo')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('OTT_INFO_NOT_FOUND');
                done();
            });
    }, 20000);
});

//
// Authenticated (requires JWT login and creating valid API Key as well for /device/ requests)
//

describe("Device + API (JWT+Key)", function () {

    let agent;
    let jwt = null;
    let ak = null;

    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running Device + API (JWT+Key) spec`);
        agent = chai.request.agent(thx.app);
        agent
            .post('/api/login')
            .send({ username: 'dynamic', password: 'dynamic', remember: false })
            .then(function (res) {
                // console.log(`[chai] Transformer (JWT) beforeAll POST /api/login (valid) response: ${JSON.stringify(res)}`);
                expect(res).to.have.cookie('x-thx-core');
                let body = JSON.parse(res.text);
                jwt = 'Bearer ' + body.access_token;


                agent
                    .post('/api/user/apikey')
                    .set('Authorization', jwt)
                    .send({
                        'alias': 'mock-apikey-alias'
                    })
                    .end((err, res) => {
                        //  {"success":true,"api_key":"9b7bd4f4eacf63d8453b32dbe982eea1fb8bbc4fc8e3bcccf2fc998f96138629","hash":"0a920b2e99a917a04d7961a28b49d05524d10cd8bdc2356c026cfc1c280ca22c"}
                        console.log("🚸 [chai] POST /api/user/apikey (authenticated), response...");
                        expect(res.status).to.equal(200);
                        let j = JSON.parse(res.text);
                        expect(j.success).to.equal(true);
                        expect(j.api_key).to.be.a('string');
                        expect(j.hash).to.be.a('string');
                        ak = j.hash;
                        console.log("[spec] saving apikey's hash (3) for device testing", j.hash);
                        done();
                    });
            })
            .catch((e) => { console.log(e); });
    });

    afterAll((done) => {
        agent.close();
        thx.stop();
        console.log(`🚸 [chai] <<< completed Device + API (JWT+Key) spec`);
        done();
    });

    var JRS6 = {
        mac: "66:66:66:66:66:66",
        firmware: "ZZ-RouterDeviceApiSpec.js",
        version: "1.0.0",
        alias: "test-device-6-dynamic",
        owner: envi.dynamic.owner,
        platform: "arduino"
      };

    it("POST /device/register (jwt, invalid body)", function (done) {
        chai.request(thx.app)
            .post('/device/register')
            .set('Authentication', ak)
            .send({ registration: {} })
            .end((err, res) => {
                //console.log("[chai] POST /device/register (jwt, invalid body) response", res.text, res.status);
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(false);
                done();
            });
    }, 20000);

    it("POST /device/register (jwt, valid) 6", function (done) {

        chai.request(thx.app)
          .post('/device/register')
          .set('Authentication', ak)
          .send({ registration: JRS6 })
          .end((err, res) => {
            console.log("🚸 [chai] POST /device/register (jwt, valid) 6 response:", res.text);
            expect(res.status).to.equal(200);
            let r = JSON.parse(res.text);
            console.log("🚸 [chai] POST /device/register (jwt, valid) 6 response:", JSON.stringify(r));
            JRS6.udid = r.registration.udid;
            expect(res.text).to.be.a('string');
            done();
          });
      }, 20000);

    // must be fully mocked or run after build completes
    it("POST /device/firmware (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .set('Authentication', ak)
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                //{"success":false,"status":"missing_mac"}
                done();
            });
    }, 20000);

    it("POST /device/addpush (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/device/addpush')
            .set('Authentication', ak)
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(404);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /device/firmware (ak, invalid)", function (done) {
        chai.request(thx.app)
            .get('/device/firmware?ott=foo')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('OTT_INFO_NOT_FOUND');
                done();
            });
    }, 20000);

    it("GET /device/firmware (ak, valid)", function (done) {
        chai.request(thx.app)
            .get('/device/firmware?ott=foo')
            .set('Authentication', ak)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('OTT_INFO_NOT_FOUND');
                done();
            });
    }, 20000);

    // Device Control API

    it("POST /api/device/envs (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/device/envs')
            .set('Authorization', jwt)
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/envs (jwt, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/envs (jwt, valid)", function (done) {
        chai.request(thx.app)
            .post('/api/device/envs')
            .set('Authorization', jwt)
            .send({ udid: JRS6.udid })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/envs (jwt, valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/detail (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/device/detail')
            .set('Authorization', jwt)
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(400);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/detail (jwt, valid)", function (done) {
        chai.request(thx.app)
            .post('/api/device/detail')
            .set('Authorization', jwt)
            .send({ udid: JRS6.udid })
            .end((err, res) => {
                // console.log("🚸 [chai] POST /api/device/detail (jwt, valid) response:", res.text, " status:", res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/edit (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/device/edit')
            .set('Authentication', ak)
            .send({ changes: { alias: "edited-alias" } })
            .end((err, res) => {
                console.log("[chai] POST /api/device/edit (jwt, invalid) response:", res.text, "status", res.status);
                //expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/device/edit (jwt, valid)", function (done) {
        chai.request(thx.app)
            .post('/api/device/edit')
            .set('Authentication', ak)
            .send({ changes: { alias: "edited-alias" }, udid: JRS6.udid })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/edit (jwt, valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    //
    // Authenticated (Session)
    //

    it("POST /api/device/envs (session, invalid)", function (done) {
        agent
            .post('/api/device/envs')
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/envs (session, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(401);
                done();
            });
    }, 20000);

    it("POST /api/device/envs (session, valid)", function (done) {
        agent
            .post('/api/device/envs')
            .send({ udid: envi.udid })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/envs (session, valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/envs (session, valid, no-such-device) 2", function (done) {
        agent
            .post('/api/device/envs')
            .send({ udid: envi.dynamic.udid })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/envs (session, valid) 2 response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/detail (session, valid)", function (done) {
        agent
            .post('/api/device/detail')
            .send({})
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/detail (session, valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/detail (session, dynamic)", function (done) {
        agent
            .post('/api/device/detail')
            .send({ udid: envi.dynamic.udid })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/detail (session, udid) 2", function (done) {
        agent
            .post('/api/device/detail')
            .send({ udid: envi.udid })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/detail (session, udid) 2 response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(401);
                //expect(res.text).to.be.a('string');
                //let j = JSON.parse(res.text);
                //console.log("[spec] [chai] detail:", JSON.stringify(j, null, 2));
                done();
            });
    }, 20000);

    it("POST /api/device/edit (session, invalid)", function (done) {
        agent
            .post('/api/device/edit')
            .send({ changes: { alias: "edited-alias" } })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/edit (session, invalid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/device/edit (session, valid)", function (done) {
        agent
            .post('/api/device/edit')
            .send({ changes: { alias: "edited-alias" }, udid: JRS6.udid })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/edit (session, valid) response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);


});