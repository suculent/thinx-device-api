/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
var envi = require("../_envi.json");
chai.use(chaiHttp);

describe("ENV Vars", function () {
    
    it("POST /api/user/env/add", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .post('/api/user/env/add')
            .send({ udid: envi.oid })
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);

     it("POST /api/user/env/revoke", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .post('/api/user/env/revoke')
            .send({ udid: envi.oid })
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);

     it("GET /api/user/env/list", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .get('/api/user/env/list')
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
});
