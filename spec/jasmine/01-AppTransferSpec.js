/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("Device Ownership Transfer", function () {
    
    it("POST /api/transfer/request", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/transfer/request')
                .send({})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);
    
    it("GET /api/transfer/decline", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/transfer/decline')
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);
    
    it("POST /api/transfer/decline", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/transfer/decline')
                .send({})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    it("GET /api/transfer/accept", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/transfer/accept')
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    it("POST /api/transfer/accept", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .get('/api/transfer/accept')
                .send({})
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);
});
