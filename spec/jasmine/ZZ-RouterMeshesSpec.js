/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("Meshes", function () {

    let thx;

    beforeAll((done) => {
        thx = new THiNX();
        thx.init(() => {
            done();
        });
    });

    // GET /api/mesh/list [cookie auth]
    it("GET /api/mesh/list", function (done) {
        chai.request(thx.app)
            .get('/api/mesh/list')
            .end((err, res) => {
                console.log("[chai] GET /api/mesh/list response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/list", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/list')
            .send({ owner_id: "mock-owner-id", apikey: "mock-api-key", alias: "mock-mesh-alias" })
            .end((err, res) => {
                console.log("[chai] POST /api/mesh/list response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/create", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/create')
            .send({ alias: "mock-mesh-alias" })
            .end((err, res) => {
                console.log("[chai] POST /api/mesh/create response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);

    it("POST /api/mesh/delete", function (done) {
        chai.request(thx.app)
            .post('/api/mesh/delete')
            .send('{meshid:null}')
            .end((err, res) => {
                console.log("[chai] POST /api/mesh/delete response:", res.text, " status:", res.status);
                //expect(res.status).to.equal(200);
                //expect(res.text).to.be.a('string');
                done();
            });
    }, 20000);
});

