/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

var envi = require("../_envi.json");

describe("Sources (repositories)", function () {

    let thx;

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    it("GET /api/user/sources/list", function (done) {
        chai.request(thx.app)
            .get('/api/user/sources/list')
            .end((err, res) => {
                console.log("[chai] response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/source", function (done) {
        chai.request(thx.app)
            .get('/api/user/source')
            .send({})
            .end((err, res) => {
                console.log("[chai] response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/user/source/revoke", function (done) {
        chai.request(thx.app)
            .get('/api/user/source/revoke')
            .send({ key_id: null })
            .end((err, res) => {
                console.log("[chai] response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});
