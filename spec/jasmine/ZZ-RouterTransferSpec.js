/* Router integration test only; does not have to cover full unit functionality. */

const bootstrap = require('../helpers/bootstrap');

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

let thx;

var envi = require("../_envi.json");
const crypto = require("crypto");

const NOT_FOUND = '{"success":false,"response":"no_such_device"}';

// Six random colon-separated upper-case hex pairs, so registration never hits the MAC fallback.
function randomMac() {
    return crypto.randomBytes(6).toString("hex").toUpperCase().match(/.{2}/g).join(":");
}

describe("Device Ownership Transfer (noauth)", function () {

    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running Transfer (noauth) spec`);
        thx = bootstrap.thx;
        done();
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed Transfer (noauth) spec`);
    });

    it("POST /api/transfer/request (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

    it("GET /api/transfer/decline (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string'); // <html>
                done();
            });
    }, 30000);

    it("POST /api/transfer/decline (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/decline')
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

    it("GET /api/transfer/accept (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                done();
            });
    }, 30000);

    it("POST /api/transfer/accept (noauth, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                done();
            });
    }, 30000);
});

describe("Transfer (JWT)", function () {

    let agent;
    let jwt;
    let transfer_id;
    let transfer_udid = null; // a dynamic-owned fixture device, registered below (261003-t29)
    let transfer_key_hash = null; // hash of the fixture device's own API key (261003-u86)
    let transfer_mac = null; // the fixture device's MAC (261003-u86)
    let shared_udids = []; // two dynamic devices on one API key (261003-u86)
    let shared_macs = [];
    let revoked_udid = null; // a dynamic device whose API key was revoked (261003-u86)

    // Promise helpers for the 261003-u86 cases.
    function createKey(alias) {
        return new Promise((resolve) => {
            chai.request(thx.app)
                .post('/api/user/apikey')
                .set('Authorization', jwt)
                .send({ alias: alias })
                .end((_err, res) => {
                    expect(res.status).to.equal(200);
                    let j = JSON.parse(res.text);
                    expect(j.success).to.equal(true);
                    expect(j.response.hash).to.be.a('string');
                    resolve(j.response.hash);
                });
        });
    }

    function registerDevice(key, registration) {
        return new Promise((resolve) => {
            chai.request(thx.app)
                .post('/device/register')
                .set('Authentication', key)
                .send({
                    registration: Object.assign({
                        firmware: "ZZ-RouterTransferSpec.js",
                        version: "1.0.0",
                        alias: "u86-transfer-device",
                        platform: "arduino"
                    }, registration)
                })
                .end((_err, res) => resolve(res));
        });
    }

    // The request answer is opaque since 261004-l7q; only the e-mail links carry the transfer
    // id. Read it from Redis: the pending dt: record whose udids name this device.
    function pendingTransferId(udid) {
        const redis = thx.app.redis_client;
        return new Promise((resolve) => {
            redis.keys("dt:*", (_err, keys) => {
                const list = Array.isArray(keys) ? keys : [];
                let left = list.length;
                let found = null;
                if (left === 0) return resolve(null);
                for (const key of list) {
                    redis.get(key, (_e, raw) => {
                        try {
                            const record = JSON.parse(raw);
                            if (record && Array.isArray(record.udids) && (record.udids.indexOf(udid) !== -1)) found = key.substring(3);
                        } catch (_p) { /* not a transfer record */ }
                        if (--left === 0) resolve(found);
                    });
                }
            });
        });
    }

    function requestTransfer(udids) {
        return new Promise((resolve) => {
            chai.request(thx.app)
                .post('/api/transfer/request')
                .set('Authorization', jwt)
                .send({ to: "cimrman@thinx.cloud", udids: udids, mig_sources: false, mig_apikeys: false })
                .end((_err, res) => resolve(res));
        });
    }
  
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

    afterAll((done) => {
        agent.close();
        console.log(`🚸 [chai] <<< completed Transfer (JWT) spec`);
        done();
    });

    // save trid for accept and decline, create valid version of this; needs at least two owners and one device
    it("POST /api/transfer/request (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .set('Authorization', jwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); 
                expect(res.text).to.equal('{"success":false,"response":"missing_recipient"}');
                done();
            });
    }, 30000);

    // migrate using invalid data (owner_id instead of e-mail)
    it("POST /api/transfer/request (jwt, semi-valid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .set('Authorization', jwt)
            .send({ to: envi.dynamic.owner, udids: [envi.udid], mig_sources: true, mig_apikeys: true })
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string'); 
                expect(res.text).to.equal('{"success":false,"response":"recipient_unknown"}');
                done();
            });
    }, 30000);

    it("registers a dynamic-owned device for the transfer (261003-t29)", function (done) {
        chai.request(thx.app)
            .post('/api/user/apikey')
            .set('Authorization', jwt)
            .send({ alias: "t29-transfer-apikey" })
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.response.hash).to.be.a('string');
                transfer_key_hash = j.response.hash;
                transfer_mac = randomMac();
                chai.request(thx.app)
                    .post('/device/register')
                    .set('Authentication', j.response.hash)
                    .send({
                        registration: {
                            mac: transfer_mac,
                            firmware: "ZZ-RouterTransferSpec.js",
                            version: "1.0.0",
                            alias: "t29-transfer-device",
                            owner: envi.dynamic.owner,
                            platform: "arduino"
                        }
                    })
                    .end((_err2, res2) => {
                        expect(res2.status).to.equal(200);
                        let r = JSON.parse(res2.text);
                        transfer_udid = r.registration.udid;
                        expect(transfer_udid).to.be.a('string');
                        done();
                    });
            });
    }, 30000);

    it("POST /api/transfer/request (jwt, shared API key) is refused (261003-u86)", async function () {
        const hash = await createKey("u86-shared-apikey");
        for (let i = 0; i < 2; i++) {
            const mac = randomMac();
            const res = await registerDevice(hash, { mac: mac, owner: envi.dynamic.owner, alias: "u86-shared-" + i });
            expect(res.status).to.equal(200);
            const udid = JSON.parse(res.text).registration.udid;
            expect(udid).to.be.a('string');
            shared_udids.push(udid);
            shared_macs.push(mac);
        }
        const res = await requestTransfer([shared_udids[0]]);
        expect(res.status).to.equal(200);
        expect(res.text).to.equal('{"success":false,"response":"apikey_shared"}');
    }, 30000);

    // Re-key remedy: once the other device checks in with its own key, the first one's key
    // is no longer shared and the transfer can be requested. The request stays pending (the
    // dt: record is harmless in CI's ephemeral Redis; decline answers once since 261004-l7q).
    it("POST /api/transfer/request (jwt) succeeds after the other device is re-keyed (261003-u86)", async function () {
        expect(shared_udids.length).to.equal(2);
        const hash = await createKey("u86-rekey-apikey");
        const reg = await registerDevice(hash, { mac: shared_macs[1], udid: shared_udids[1], owner: envi.dynamic.owner, alias: "u86-shared-1" });
        expect(reg.status).to.equal(200);
        expect(JSON.parse(reg.text).registration.udid).to.equal(shared_udids[1]);
        const res = await requestTransfer([shared_udids[0]]);
        expect(res.status).to.equal(200);
        const j = JSON.parse(res.text);
        expect(j.success).to.equal(true);
        expect(j.response).to.be.a('string');
    }, 30000);

    it("POST /api/transfer/request (jwt, revoked API key) is refused (261003-u86)", async function () {
        const hash = await createKey("u86-revoked-apikey");
        const reg = await registerDevice(hash, { mac: randomMac(), owner: envi.dynamic.owner, alias: "u86-revoked" });
        expect(reg.status).to.equal(200);
        revoked_udid = JSON.parse(reg.text).registration.udid;
        expect(revoked_udid).to.be.a('string');
        const revoked = await new Promise((resolve) => {
            chai.request(thx.app)
                .post('/api/user/apikey/revoke')
                .set('Authorization', jwt)
                .send({ fingerprint: hash })
                .end((_err, res) => resolve(res));
        });
        expect(revoked.status).to.equal(200);
        expect(JSON.parse(revoked.text).success).to.equal(true);
        const res = await requestTransfer([revoked_udid]);
        expect(res.status).to.equal(200);
        expect(res.text).to.equal('{"success":false,"response":"apikey_not_identified"}');
    }, 30000);

    // migrate the dynamic owner's own fixture device to cimrman (261003-t29)
    it("POST /api/transfer/request (jwt, valid)", async function () {
        const res = await requestTransfer([transfer_udid]);
        console.log("🚸 [chai] POST /api/transfer/request (jwt, valid) response: ", res.text);
        expect(res.status).to.equal(200);
        // 261004-l7q: the sender's answer does not carry the transfer id.
        expect(res.text).to.equal('{"success":true,"response":"transfer_requested"}');
        transfer_id = await pendingTransferId(transfer_udid);
        expect(transfer_id).to.be.a('string');
    }, 30000);

    it("POST /api/transfer/request (jwt, another owner's udid) answers like an unknown udid (261003-t29)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/request')
            .set('Authorization', jwt)
            .send({ to: "cimrman@thinx.cloud", udids: [envi.udid], mig_sources: false, mig_apikeys: false })
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal(NOT_FOUND);
                chai.request(thx.app)
                    .post('/api/transfer/request')
                    .set('Authorization', jwt)
                    .send({ to: "cimrman@thinx.cloud", udids: ["00000000-0000-1000-8000-000000000000"], mig_sources: false, mig_apikeys: false })
                    .end((_err2, res2) => {
                        expect(res2.status).to.equal(200);
                        expect(res2.text).to.equal(NOT_FOUND);
                        done();
                    });
            });
    }, 30000);

    it("GET /api/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/decline')
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string'); // <html>
                done();
            });
    }, 30000);

    it("POST /api/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/decline')
            .set('Authorization', jwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                done();
            });
    }, 30000);

    it("GET /api/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                done();
            });
    }, 30000);

    it("POST /api/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/transfer/accept')
            .set('Authorization', jwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                done();
            });
    }, 30000);

    it("POST /api/transfer/accept (noauth, null)", function (done) {
        chai.request(thx.app)
            .get('/api/transfer/accept')
            .set('Authorization', jwt)
            .send({ owner: null, transfer_id: null, udid: null})
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                done();
            });
    }, 30000);

    // v2

    it("POST /api/v2/transfer/request (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/request')
            .set('Authorization', jwt)
            .send({})
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"missing_recipient"}');
                done();
            });
    }, 30000);

    it("GET /api/v2/transfer/decline (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/v2/transfer/decline')
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string'); // <html>
                done();
            });
    }, 30000);

    it("POST /api/v2/transfer/decline (jwt, missing transfer_id)", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/decline')
            .set('Authorization', jwt)
            .send({ udid: null})
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                done();
            });
    }, 30000);

    it("POST /api/v2/transfer/decline (jwt, missing owner)", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/decline')
            .set('Authorization', jwt)
            .send({ udid: null, transfer_id: transfer_id })
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"owner_missing"}');
                done();
            });
    }, 30000);

    it("POST /api/v2/transfer/decline (jwt, invalid) 2", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/decline')
            .set('Authorization', jwt)
            .send({ udid: null, transfer_id: transfer_id, owner: envi.dynamic.owner })
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"udids_missing"}');
                done();
            });
    }, 30000);

    it("GET /api/v2/transfer/decline (jwt, invalid) 2", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/decline')
            .set('Authorization', jwt)
            .send({ transfer_id: "transfer_id", owner: envi.dynamic.owner })
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"udids_missing"}');
                done();
            });
    }, 30000);

    it("GET /api/v2/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .get('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                done();
            });
    }, 30000);

    it("POST /api/v2/transfer/accept (jwt, invalid)", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .send({ udid: null, transfer_id: transfer_id })
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"owner_missing"}');
                done();
            });
    }, 30000);

    it("POST /api/v2/transfer/accept (jwt, invalid) 2", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .send({ udids: null, transfer_id: transfer_id, owner: envi.dynamic.owner })
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"udids_missing"}');
                done();
            });
    }, 30000);

    // 261004-l7q: dynamic is the sender, so its session cannot accept or decline; it gets
    // the unknown-transfer answer and the transfer stays pending. (The t29 out-of-transfer
    // udid refusal is pinned locally in DeviceOwnershipSpec.)
    it("POST /api/v2/transfer/accept (jwt, the sender) answers like an unknown transfer (261004-l7q)", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .send({ udids: [transfer_udid], transfer_id: transfer_id, owner: envi.oid })
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_not_found"}');
                done();
            });
    }, 30000);

    it("POST /api/v2/transfer/decline (jwt, the sender) answers like an unknown transfer (261004-l7q)", async function () {
        const res = await new Promise((resolve) => {
            chai.request(thx.app)
                .post('/api/v2/transfer/decline')
                .set('Authorization', jwt)
                .send({ udids: [transfer_udid], transfer_id: transfer_id, owner: envi.oid })
                .end((_err, r) => resolve(r));
        });
        expect(res.status).to.equal(200);
        expect(res.text).to.equal('{"success":true,"response":"decline_complete_no_such_dtid"}');
        expect(await pendingTransferId(transfer_udid), "transfer still pending").to.equal(transfer_id);
    }, 30000);

    // The recipient (cimrman) accepts through the e-mail link, which the transfer id alone
    // authorises.
    it("GET /api/v2/transfer/accept III (recipient's e-mail link) (261003-t29, 261004-l7q)", function (done) {
        chai.request(thx.app)
            .get('/api/v2/transfer/accept?transfer_id=' + transfer_id)
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.equal('{"success":true,"response":"transfer_completed"}');
                done();
            });
    }, 30000);

    it("the accepted device's API key left the sender's key list (261003-u86)", function (done) {
        chai.request(thx.app)
            .get('/api/user/apikey/list')
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                const j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(Array.isArray(j.response)).to.equal(true);
                expect(j.response.filter((k) => k.hash === transfer_key_hash).length).to.equal(0);
                done();
            });
    }, 30000);

    it("the transferred device registers with its previous owner id as its new owner's device (261003-u86)", async function () {
        const res = await registerDevice(transfer_key_hash, { mac: transfer_mac, udid: transfer_udid, owner: envi.dynamic.owner, alias: "t29-transfer-device" });
        expect(res.status).to.equal(200);
        const reg = JSON.parse(res.text).registration;
        expect(reg.owner === envi.oid, "registration.owner is the recipient").to.equal(true);
        expect(reg.udid).to.equal(transfer_udid);
    }, 30000);

    it("the moved key with the previous owner id and another udid is refused (261003-u86)", async function () {
        const res = await registerDevice(transfer_key_hash, { mac: transfer_mac, udid: shared_udids[1], owner: envi.dynamic.owner });
        expect(res.text).to.equal('{"success":false,"response":"owner_found_but_no_key"}');
    }, 30000);

    it("the moved key with the previous owner id and no udid (MAC only) is refused (261003-u86)", async function () {
        const res = await registerDevice(transfer_key_hash, { mac: transfer_mac, owner: envi.dynamic.owner });
        expect(res.text).to.equal('{"success":false,"response":"owner_found_but_no_key"}');
    }, 30000);

    it("the transferred device registers with its new owner id (261003-u86)", async function () {
        const res = await registerDevice(transfer_key_hash, { mac: transfer_mac, udid: transfer_udid, owner: envi.oid, alias: "t29-transfer-device" });
        expect(res.status).to.equal(200);
        const reg = JSON.parse(res.text).registration;
        expect(reg.udid).to.equal(transfer_udid);
        expect(reg.owner === envi.oid, "registration.owner is the recipient").to.equal(true);
    }, 30000);

    it("afterwards the previous owner id still redirects to the new owner (261003-u86)", async function () {
        const res = await registerDevice(transfer_key_hash, { mac: transfer_mac, udid: transfer_udid, owner: envi.dynamic.owner, alias: "t29-transfer-device" });
        expect(res.status).to.equal(200);
        const reg = JSON.parse(res.text).registration;
        expect(reg.owner === envi.oid, "registration.owner is the recipient").to.equal(true);
        expect(reg.udid).to.equal(transfer_udid);
    }, 30000);

    it("POST /api/v2/transfer/decline IV", function (done) {
        chai.request(thx.app)
            .post('/api/v2/transfer/decline')
            .set('Authorization', jwt)
            .send({ udids: [envi.dynamic.udid], transfer_id: transfer_id, owner: envi.dynamic.owner }) // will probably need real device using GET /api/device
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":true,"response":"decline_complete_no_such_dtid"}');
                // returns HTML
                done();
            });
    }, 30000);

    it("GET /api/v2/transfer/decline V", function (done) {
        chai.request(thx.app)
            .get('/api/v2/transfer/decline')
            .set('Authorization', jwt)
            .send({ udids: [envi.dynamic.udid], transfer_id: transfer_id, owner: envi.dynamic.owner }) // will probably need real device using GET /api/device
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                // returns HTML
                done();
            });
    }, 30000);

    it("POST /api/v2/transfer/accept (jwt, null)", function (done) {
        chai.request(thx.app)
            .get('/api/v2/transfer/accept')
            .set('Authorization', jwt)
            .send({ owner: null, transfer_id: null, udids: null})
            .end((_err, res) => {
                expect(res.status).to.equal(400);
                expect(res.text).to.be.a('string');
                expect(res.text).to.equal('{"success":false,"response":"transfer_id_missing"}');
                done();
            });
    }, 30000);

    it("GET /api/v2/transfer/accept (jwt, null)", function (done) {
        chai.request(thx.app)
            .get('/api/v2/transfer/accept?transfer_id='+transfer_id)
            .set('Authorization', jwt)
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                expect(res.text).to.be.a('string');
                done();
            });
    }, 30000);

    it("removes the u86 fixture devices still owned by dynamic (261003-u86)", function (done) {
        const udids = shared_udids.concat(revoked_udid ? [revoked_udid] : []);
        chai.request(thx.app)
            .post('/api/device/revoke')
            .set('Authorization', jwt)
            .send({ udids: udids })
            .end((_err, res) => {
                expect(res.status).to.equal(200);
                done();
            });
    }, 30000);
});
