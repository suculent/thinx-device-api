/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");

let thx;

describe("Actionable Notification (noauth)", function () {

    it("POST /api/device/notification", function (done) {
        thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/device/notification')
                .send({})
                .end((err, res) => {
                    expect(res.status).to.equal(401);
                    done();
                });
        });
    }, 20000);
    
});

describe("Actionable Notification (JWT)", function () {

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
        thx.stop();
        done();
    });

    it("POST /api/device/notification (jwt, invalid)", function (done) {
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({})
                .end((err, res) => {
                    expect(res.status).to.equal(200);
                    expect(res.text).to.be.a('string');
                    expect(res.text).to.equal('{"success":false,"status":"missing_udid"}');
                    done();
                });
    }, 20000);

    it("POST /api/device/notification (jwt, undefined)", function (done) {
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({ udid: undefined, reply: undefined})
                .end((err, res) => {
                    expect(res.status).to.equal(200);
                    expect(res.text).to.equal('{"success":false,"status":"missing_udid"}');
                    done();
                });
    }, 20000);

    it("POST /api/device/notification (jwt, valid)", function (done) {
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({ udid: envi.udid, reply: "reply"} )
                .end((err, res) => {
                    expect(res.status).to.equal(200);
                    expect(res.text).to.be.a('string');
                    expect(res.text).to.equal('{"success":true,"status":"published"}');
                    done();
                });
    }, 20000);
});