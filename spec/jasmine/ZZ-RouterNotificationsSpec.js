/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");

describe("Actionable Notification (noauth)", function () {

    it("POST /api/device/notification", function (done) {
        console.log("🚸 [chai] POST /api/device/notification");
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/device/notification')
                .send({})
                .end((err, res) => {
                    console.log("🚸 [chai] POST /api/device/notification response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);
    
});

describe("Actionable Notification (JWT)", function () {

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

    it("POST /api/device/notification (jwt, invalid)", function (done) {
        console.log("🚸 [chai] POST /api/device/notification");
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({})
                .end((err, res) => {
                    //{"success":false,"status":"missing_reply"}
                    //console.log("🚸 [chai] POST /api/device/notification (jwt, invalid) response:", res.text, " status:", res.status);
                    expect(res.status).to.equal(200);
                    expect(res.text).to.be.a('string');
                    expect(res.text).to.equal('{"success":false,"status":"missing_udid"}');
                    done();
                });
    }, 20000);

    it("POST /api/device/notification (jwt, undefined)", function (done) {
        console.log("🚸 [chai] POST /api/device/notification");
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({ udid: undefined, reply: undefined})
                .end((err, res) => {
                    console.log("🚸 [chai] POST /api/device/notification (jwt, valid) response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
    }, 20000);

    it("POST /api/device/notification (jwt, valid)", function (done) {
        console.log("🚸 [chai] POST /api/device/notification");
        chai.request(thx.app)
                .post('/api/device/notification')
                .set('Authorization', jwt)
                .send({ udid: envi.oid, reply: "reply"})
                .end((err, res) => {
                    console.log("🚸 [chai] POST /api/device/notification (jwt, valid) response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
    }, 20000);
});