/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");

describe("RSA Keys", function () {

    let thx;

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    it("GET /api/user/rsakey/create", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .end((err, res) => {
                console.log("[chai] response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("GET /api/user/rsakey/list", function (done) {
        console.log("[chai] request /api/user/rsakey/list");
        chai.request(thx.app)
            .get('/api/user/rsakey/list')
            .end((err, res) => {
                console.log("[chai] response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/rsakey/revoke", function (done) {
        chai.request(thx.app)
            .get('/api/user/rsakey/revoke')
            .send({ key_id: null })
            .end((err, res) => {
                console.log("[chai] response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

});
