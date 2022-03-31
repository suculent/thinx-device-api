/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("Device API", function () {
    
    it("POST /device/register", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/device/register')
                .send({ registration: {}})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    // must be fully mocked or run after build completes
    it("POST /device/firmware", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/device/firmware')
                .send({})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);
    
    it("POST /device/addpush", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/device/addpush')
                .send({})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    // POST /api/device/envs
    it("POST /api/device/envs", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/device/envs')
                .send({})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    it("POST /api/device/detail", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/device/detail')
                .send({})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);
    
    it("POST /api/device/edit", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/device/edit')
                .send({changes: { alias: "edited-alias"}})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    it("GET /device/firmware", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/device/firmware?ott=foo')
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);
});
