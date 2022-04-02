/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("Builder", function () {

    let thx;

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    // run build manually
    it("POST /api/build", function (done) {
        chai.request(thx.app)
            .post('/api/build')
            .send({})
            .end((err, res) => {
                console.log("[chai] response /api/build:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // latest firmware envelope
    it("POST /api/device/envelope", function (done) {
        chai.request(thx.app)
            .post('/api/device/envelope')
            .send({})
            .end((err, res) => {
                console.log("[chai] response /api/device/envelope:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // get build artifacts
    it("POST /api/device/artifacts", function (done) {
        chai.request(thx.app)
            .post('/api/device/artifacts')
            .send({})
            .end((err, res) => {
                console.log("[chai] response /api/device/artifacts:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

});