/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("Actionable Notifications", function () {

    it("POST /api/device/notification", function (done) {
        console.log("[chai] POST /api/device/notification");
        let thx = new THiNX();
        thx.init(() => {
            chai.request(thx.app)
                .post('/api/device/notification')
                .send({})
                .end((err, res) => {
                    console.log("[chai] POST /api/device/notification response:", res.text, " status:", res.status);
                    //expect(res.status).to.equal(200);
                    //expect(res.text).to.be.a('string');
                    done();
                });
        });
    }, 20000);
    
});