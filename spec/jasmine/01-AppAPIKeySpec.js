/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("API Keys", function () {

    let thx;

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    // create
    it("POST /api/user/apikey", function (done) {
        console.log("[chai] request /api/user/apikey");
        chai.request(thx.app)
            .post('/api/user/apikey')
            .send({
                'alias': 'mock-apikey-alias'
            })
            .end((err, res) => {
                console.log("[chai] response /api/user/apikey:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // revoke
    it("POST /api/user/apikey/revoke", function (done) {
        console.log("[chai] request /api/user/apikey/revoke");
        chai.request(thx.app)
            .post('/api/user/apikey/revoke')
            .send({
                'alias': 'mock-apikey-alias'
            })
            .end((err, res) => {
                console.log("[chai] response /api/user/apikey/revoke:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    // list
    it("GET /api/user/apikey/list", function (done) {
        console.log("[chai] request GET /api/user/apikey/list");
        chai.request(thx.app)
            .get('/api/user/apikey/list')
            .end((err, res) => {
                console.log("[chai] response /api/user/apikey/list:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

});
