/* Router integration test only; does not have to cover full unit functionality. */

const bootstrap = require('../helpers/bootstrap');

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");
const crypto = require("crypto");

// Six random colon-separated upper-case hex pairs, so registration never hits the MAC fallback.
function randomMac() {
    return crypto.randomBytes(6).toString("hex").toUpperCase().match(/.{2}/g).join(":");
}

let thx;

describe("Actionable Notification (noauth)", function () {

    beforeAll((done) => {
        thx = bootstrap.thx;
        done();
    });

    it("POST /api/device/notification", function (done) {
        chai.request(thx.app)
            .post('/api/device/notification')
            .send({})
            .end((err, res) => {
                expect(res.status).to.equal(401);
                done();
            });
    }, 30000);

});

describe("Actionable Notification (JWT)", function () {

    let agent;
    let jwt;
    let notify_udid = null; // a dynamic-owned device, registered below (261003-t29)
  
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

    it("registers a dynamic-owned device for notifications (261003-t29)", function (done) {
        chai.request(thx.app)
            .post('/api/user/apikey')
            .set('Authorization', jwt)
            .send({ alias: "t29-notify-apikey" })
            .end((err, res) => {
                expect(res.status).to.equal(200);
                let j = JSON.parse(res.text);
                expect(j.success).to.equal(true);
                expect(j.response.hash).to.be.a('string');
                chai.request(thx.app)
                    .post('/device/register')
                    .set('Authentication', j.response.hash)
                    .send({
                        registration: {
                            mac: randomMac(),
                            firmware: "ZZ-RouterNotificationsSpec.js",
                            version: "1.0.0",
                            alias: "t29-notify-device",
                            owner: envi.dynamic.owner,
                            platform: "arduino"
                        }
                    })
                    .end((err2, res2) => {
                        expect(res2.status).to.equal(200);
                        let r = JSON.parse(res2.text);
                        notify_udid = r.registration.udid;
                        expect(notify_udid).to.be.a('string');
                        done();
                    });
            });
    }, 30000);

    it("POST /api/device/notification (jwt, invalid)", function (done) {
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({})
                .end((err, res) => {
                    expect(res.status).to.equal(200);
                    expect(res.text).to.be.a('string');
                    expect(res.text).to.equal('{"success":false,"response":"missing_udid"}');
                    done();
                });
    }, 30000);

    it("POST /api/device/notification (jwt, undefined)", function (done) {
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({ udid: undefined, reply: undefined})
                .end((err, res) => {
                    expect(res.status).to.equal(200);
                    expect(res.text).to.equal('{"success":false,"response":"missing_udid"}');
                    done();
                });
    }, 30000);

    it("POST /api/device/notification (jwt, valid)", function (done) {
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({ udid: notify_udid, reply: "reply"} )
                .end((err, res) => {
                    expect(res.status).to.equal(200);
                    expect(res.text).to.be.a('string');
                    expect(res.text).to.equal('{"success":true,"response":"published"}');
                    done();
                });
    }, 30000);

    it("POST /api/device/notification (jwt, another owner's udid) answers like an unknown udid (261003-t29)", function (done) {
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({ udid: envi.udid, reply: "t29" })
                .end((err, res) => {
                    expect(res.status).to.equal(200);
                    expect(res.text).to.equal('{"success":false,"response":"no_such_device"}');
                    chai.request(thx.app)
                        .post('/api/device/notification')
                        .set('Authorization', jwt)
                        .send({ udid: "00000000-0000-1000-8000-000000000000", reply: "t29" })
                        .end((err2, res2) => {
                            expect(res2.status).to.equal(200);
                            expect(res2.text).to.equal('{"success":false,"response":"no_such_device"}');
                            done();
                        });
                });
    }, 30000);
});