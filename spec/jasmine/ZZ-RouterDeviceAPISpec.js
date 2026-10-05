/* Router integration test only; does not have to cover full unit functionality. */

const bootstrap = require('../helpers/bootstrap');

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
var envi = require("../_envi.json");
chai.use(chaiHttp);

let thx;

describe("Device API (noauth)", function () {

    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running Device API (noauth) spec`);
        thx = bootstrap.thx;
        done();
    });

    it("POST /device/register A", function (done) {
        chai.request(thx.app)
            .post('/device/register')
            .send()
            .end((err, res) => {
                console.log("🚸 [chai] POST /device/register A response:", res.text);
                expect(res.status).to.equal(400);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 30000);

    it("POST /device/register B", function (done) {
        chai.request(thx.app)
            .post('/device/register')
            .send({ registration: {} })
            .end((err, res) => {
                console.log("🚸 [chai] POST /device/register B response:", res.text);
                expect(res.status).to.equal(400);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 30000);

    // must be fully mocked or run after build completes
    it("POST /device/firmware", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                //{"success":false,"response":"missing_mac"}
                done();
            });
    }, 30000);

    it("POST /device/firmware OTT request", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .send({ use: "ott"})
            .end((err, res) => {
                console.log("🚸 [chai] POST /device/firmware OTT request", res.text, res.status);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                //{"success":false,"response":"missing_mac"}
                done();
            });
    }, 30000);

    it("POST /device/addpush", function (done) {
        chai.request(thx.app)
            .post('/device/addpush')
            .send({ push: "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823" })
            .end((err, res) => {
                console.log("🚸 [chai] device add Push registration", res.text, res.status);
                expect(res.status).to.equal(403);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 30000);



    // POST /api/device/envs
    it("POST /api/device/envs", function (done) {
        chai.request(thx.app)
            .post('/api/device/envs')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

    it("POST /api/device/detail", function (done) {
        chai.request(thx.app)
            .post('/api/device/detail')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

    it("POST /api/device/edit", function (done) {
        chai.request(thx.app)
            .post('/api/device/edit')
            .send({ changes: { alias: "edited-alias" } })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

    it("GET /device/firmware", function (done) {
        chai.request(thx.app)
            .get('/device/firmware?ott=foo')
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('OTT_UPDATE_NOT_FOUND');
                done();
            });
    }, 30000);
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
                        expect(res.status).to.equal(200);
                        let j = JSON.parse(res.text);
                        expect(j.success).to.equal(true);
                        expect(j.response.api_key).to.be.a('string');
                        expect(j.response.hash).to.be.a('string');
                        ak = j.response.hash;
                        console.log("[spec] saving apikey's hash (3) for device testing, present:", typeof (j.response.hash) === "string");
                        done();
                    });
            })
            .catch((e) => { console.log(e); });
    });

    afterAll((done) => {
        agent.close();
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
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(false);
                done();
            });
    }, 30000);

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
      }, 30000);

    // quick 261003-tv5: /device/register is bound to the owner whose API key
    // authenticated it ("when it falls back to matching by MAC, should check in as a
    // device of the api key's owner"). `ak` is dynamic's key; envi.udid / envi.mac is
    // cimrman's device from DeviceSpec (02).

    let tv5_udid = null;

    function tv5Registration(extra) {
        return Object.assign({
            firmware: "ZZ-RouterDeviceApiSpec.js",
            version: "1.0.0",
            platform: "arduino",
            owner: envi.dynamic.owner
        }, extra);
    }

    it("POST /device/register (ak, own MAC, no udid) reattaches to JRS6 (261003-tv5)", function (done) {
        chai.request(thx.app)
            .post('/device/register')
            .set('Authentication', ak)
            .send({ registration: tv5Registration({ mac: "66:66:66:66:66:66", alias: "test-device-6-dynamic" }) })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let r = JSON.parse(res.text);
                expect(r.registration.udid).to.equal(JRS6.udid);
                expect(r.registration.owner).to.equal(envi.dynamic.owner);
                done();
            });
    }, 30000);

    it("POST /device/register (ak, another owner's MAC) registers a device of the key owner (261003-tv5)", function (done) {
        chai.request(thx.app)
            .post('/device/register')
            .set('Authentication', ak)
            .send({ registration: tv5Registration({ mac: envi.mac, alias: "tv5-cross-owner-mac" }) })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let r = JSON.parse(res.text);
                expect(r.registration.owner).to.equal(envi.dynamic.owner);
                expect(r.registration.udid).to.be.a('string');
                expect(r.registration.udid).to.not.equal(envi.udid);
                tv5_udid = r.registration.udid;
                done();
            });
    }, 30000);

    it("POST /device/register (ak, another owner's udid) never checks in as that device (261003-tv5)", function (done) {
        // Holds whether envi.udid is cimrman's device (foreign: a fresh udid, then the
        // owner-scoped MAC step reattaches to dynamic's tv5 device) or absent (404: kept,
        // then the same MAC reattach wins).
        chai.request(thx.app)
            .post('/device/register')
            .set('Authentication', ak)
            .send({ registration: tv5Registration({ mac: envi.mac, alias: "tv5-cross-owner-mac", udid: envi.udid }) })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let r = JSON.parse(res.text);
                expect(r.registration.owner).to.equal(envi.dynamic.owner);
                expect(r.registration.udid).to.not.equal(envi.udid);
                expect(r.registration.udid).to.equal(tv5_udid);
                done();
            });
    }, 30000);

    it("POST /api/device/revoke (jwt, tv5 device) cleans up (261003-tv5)", function (done) {
        chai.request(thx.app)
            .post('/api/device/revoke')
            .set('Authorization', jwt)
            .send({ udid: tv5_udid })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal(JSON.stringify({ success: true, response: tv5_udid }));
                done();
            });
    }, 30000);

    // must be fully mocked or run after build completes
    it("POST /device/firmware (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .set('Authentication', ak)
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                //{"success":false,"response":"missing_mac"}
                done();
            });
    }, 30000);

    // quick 261003-vd4: firmware loads only the device of the owner whose key it verified;
    // another owner's udid answers like an unknown one (plain body no_such_device).
    // `ak` is dynamic's key; JRS6 is dynamic's device; envi.udid is cimrman's device from
    // DeviceSpec (02), or absent.
    function vd4Firmware(extra) {
        return {
            registration: Object.assign({
                mac: "66:66:66:66:66:66",
                firmware: "ZZ-RouterDeviceApiSpec.js",
                version: "1.0.0",
                platform: "arduino",
                alias: "test-device-6-dynamic",
                owner: envi.dynamic.owner
            }, extra)
        };
    }

    it("POST /device/firmware (ak, own udid) reaches the envelope path (261003-vd4)", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .set('Authentication', ak)
            .send(vd4Firmware({ udid: JRS6.udid }))
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.not.equal("no_such_device");
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(false);
                expect(["UPDATE_NOT_FOUND", "OK"]).to.include(j.status);
                done();
            });
    }, 30000);

    it("POST /device/firmware (ak, another owner's udid) answers no_such_device (261003-vd4)", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .set('Authentication', ak)
            .send(vd4Firmware({ udid: envi.udid, mac: envi.mac }))
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal("no_such_device");
                done();
            });
    }, 30000);

    it("POST /device/firmware (ak, unknown udid) answers no_such_device (261003-vd4)", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .set('Authentication', ak)
            .send(vd4Firmware({ udid: "d4d4d4d4-0000-4000-8000-0000000000d4" }))
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal("no_such_device");
                done();
            });
    }, 30000);

    it("POST /device/addpush (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/device/addpush')
            .set('Authentication', ak)
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 30000);

    it("POST /device/addpush (jwt, valid)", function (done) {
        chai.request(thx.app)
            .post('/device/addpush')
            .set('Authentication', ak)
            .send({ push: "31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823", udid: envi.udid })
            .end((err, res) => {
                console.log("🚸 [chai] POST /device/addpush (jwt, valid)", res.status, res.text);
                expect(res.status).to.equal(200);
                //expect(res.text).to.equal('false'); // in case of no error
                done();
            });
    }, 30000);

    // quick 261003-v9d: /device/addpush writes the push token only when the body names an
    // owner, the Authentication key verifies for that owner and the udid is that owner's
    // device. Unknown and foreign udids answer identically. `ak` is dynamic's key hash.
    const V9D_PUSH_1 = "9d0000000000000000000000000000000000000000000000000000000000a001";
    const V9D_PUSH_2 = "9d0000000000000000000000000000000000000000000000000000000000a002";
    const V9D_UNKNOWN_UDID = "0e9d0000-0000-4000-8000-000000000009";
    const V9D_NOT_FOUND = JSON.stringify({ success: false, response: "push_device_not_found" });
    const V9D_AUTH = JSON.stringify({ success: false, response: "authentication" });

    it("POST /device/addpush (ak, own device) registers the push token (261003-v9d)", function (done) {
        chai.request(thx.app)
            .post('/device/addpush')
            .set('Authentication', ak)
            .send({ push: V9D_PUSH_1, udid: JRS6.udid, owner: envi.dynamic.owner })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal(JSON.stringify({ success: true, response: "push_token_registered" }));
                done();
            });
    }, 30000);

    it("POST /device/addpush (ak, another owner's udid) answers like an unknown udid (261003-v9d)", function (done) {
        chai.request(thx.app)
            .post('/device/addpush')
            .set('Authentication', ak)
            .send({ push: V9D_PUSH_2, udid: envi.udid, owner: envi.dynamic.owner })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal(V9D_NOT_FOUND);
                done();
            });
    }, 30000);

    it("POST /device/addpush (ak, unknown udid) answers the same (261003-v9d)", function (done) {
        chai.request(thx.app)
            .post('/device/addpush')
            .set('Authentication', ak)
            .send({ push: V9D_PUSH_2, udid: V9D_UNKNOWN_UDID, owner: envi.dynamic.owner })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal(V9D_NOT_FOUND);
                done();
            });
    }, 30000);

    it("POST /device/addpush (ak, no owner or another owner named) is refused (261003-v9d)", function (done) {
        chai.request(thx.app)
            .post('/device/addpush')
            .set('Authentication', ak)
            .send({ push: V9D_PUSH_2, udid: JRS6.udid })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal(V9D_AUTH);
                chai.request(thx.app)
                    .post('/device/addpush')
                    .set('Authentication', ak)
                    .send({ push: V9D_PUSH_2, udid: JRS6.udid, owner: envi.oid })
                    .end((err2, res2) => {
                        expect(res2.status).to.equal(200);
                        expect(res2.text).to.equal(V9D_AUTH);
                        done();
                    });
            });
    }, 30000);

    it("POST /device/addpush (unknown key) is refused (261003-v9d)", function (done) {
        chai.request(thx.app)
            .post('/device/addpush')
            .set('Authentication', "0".repeat(64))
            .send({ push: V9D_PUSH_2, udid: JRS6.udid, owner: envi.dynamic.owner })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal(V9D_AUTH);
                done();
            });
    }, 30000);

    it("POST /api/device/detail (jwt) shows only the owner's push token stored (261003-v9d)", function (done) {
        chai.request(thx.app)
            .post('/api/device/detail')
            .set('Authorization', jwt)
            .send({ udid: JRS6.udid })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(JSON.parse(res.text).push === V9D_PUSH_1).to.equal(true);
                done();
            });
    }, 30000);

    it("GET /device/firmware (ak, invalid)", function (done) {
        chai.request(thx.app)
            .get('/device/firmware?ott=foo')
            .end((err, res) => {
                console.log("🚸 [chai] GET /device/firmware (ak, invalid)", res.status, res.text);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('OTT_UPDATE_NOT_FOUND');
                done();
            });
    }, 30000);

    it("GET /device/firmware (ak, none)", function (done) {
        chai.request(thx.app)
            .get('/device/firmware')
            .set('Authentication', ak)
            .end((err, res) => {
                console.log("🚸 [chai] GET /device/firmware (ak, none)", res.status, res.text);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"OTT_MISSING"}');
                done();
            });
    }, 30000);

    it("GET /device/firmware (ak, valid)", function (done) {
        chai.request(thx.app)
            .get('/device/firmware?ott=foo')
            .set('Authentication', ak)
            .end((err, res) => {
                console.log("🚸 [chai] GET /device/firmware (ak, valid)", res.status, res.text);
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('OTT_UPDATE_NOT_FOUND');
                done();
            });
    }, 30000);

    // quick 261003-v9x: OTT issuance is bound to the verified key owner's device; redemption
    // re-checks the binding.
    let v9x_ott = null;

    it("POST /device/firmware use=ott (ak, own device) issues a 64-hex token (261003-v9x)", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .set('Authentication', ak)
            .send({ use: "ott", owner: envi.dynamic.owner, udid: JRS6.udid })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                const j = JSON.parse(res.text);
                expect(Object.keys(j)).to.deep.equal(["ott"]);
                expect(/^[a-f0-9]{64}$/.test(j.ott)).to.equal(true);
                v9x_ott = j.ott;
                done();
            });
    }, 30000);

    it("GET /device/firmware?ott= (issued, no build) answers OTT_UPDATE_NOT_AVAILABLE (261003-v9x)", function (done) {
        expect(v9x_ott).to.be.a('string');
        chai.request(thx.app)
            .get('/device/firmware?ott=' + v9x_ott)
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('OTT_UPDATE_NOT_AVAILABLE');
                done();
            });
    }, 30000);

    it("POST /device/firmware use=ott (ak, another owner's udid) answers no_such_device (261003-v9x)", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .set('Authentication', ak)
            .send({ use: "ott", owner: envi.dynamic.owner, udid: envi.udid })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('no_such_device');
                done();
            });
    }, 30000);

    it("POST /device/firmware use=ott (ak, another owner named) answers OTT_API_KEY_NOT_VALID (261003-v9x)", function (done) {
        chai.request(thx.app)
            .post('/device/firmware')
            .set('Authentication', ak)
            .send({ use: "ott", owner: envi.oid, udid: envi.udid })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('OTT_API_KEY_NOT_VALID');
                done();
            });
    }, 30000);

    it("GET /device/firmware?ott=<64 zeros> answers OTT_UPDATE_NOT_FOUND (261003-v9x)", function (done) {
        chai.request(thx.app)
            .get('/device/firmware?ott=' + "0".repeat(64))
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('OTT_UPDATE_NOT_FOUND');
                done();
            });
    }, 30000);

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
    }, 30000);

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
    }, 30000);

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
    }, 30000);

    it("POST /api/device/detail (jwt, valid)", function (done) {
        chai.request(thx.app)
            .post('/api/device/detail')
            .set('Authorization', jwt)
            .send({ udid: JRS6.udid })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                done();
            });
    }, 30000);

    it("POST /api/device/edit (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/device/edit')
            .set('Authentication', ak)
            .send({ changes: { alias: "edited-alias" } })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/edit (jwt, invalid) response:", res.text, "status", res.status);
                //expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

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
    }, 30000);

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
    }, 30000);

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
    }, 30000);

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
    }, 30000);

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
    }, 30000);

    it("POST /api/device/detail (session, dynamic)", function (done) {
        agent
            .post('/api/device/detail')
            .send({ udid: envi.dynamic.udid })
            .end((err, res) => {
                expect(res.status).to.equal(401);
                expect(res.text).to.be.a('string');
                done();
            });
    }, 30000);

    it("POST /api/device/detail (session, udid) 2", function (done) {
        agent
            .post('/api/device/detail')
            .send({ udid: envi.udid })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/detail (session, udid) 2 response:", res.text, " status:", res.status);
                done();
            });
    }, 30000);

    it("POST /api/device/edit (session, invalid)", function (done) {
        agent
            .post('/api/device/edit')
            .send({ changes: { alias: "edited-alias" } })
            .end((err, res) => {
                console.log("🚸 [chai] POST /api/device/edit (session, invalid) response:", res.text, " status:", res.status);
                done();
            });
    }, 30000);

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
    }, 30000);

    


});