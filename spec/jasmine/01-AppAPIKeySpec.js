/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("API Keys", function () {

    // create
    it("POST /api/user/apikey", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/user/apikey')
                .send({
                    'alias': 'mock-apikey-alias'
                })
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    // revoke
    it("POST /api/user/revoke", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/user/revoke')
                .send({
                    'alias': 'mock-apikey-alias'
                })
                .end((err, res) => {
                    console.log("[chai] response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);

    // list
    it("POST /api/user/apikey/list", function (done) {
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/user/apikey/list')
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
