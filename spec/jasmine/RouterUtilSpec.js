/* Router integration test only; does not have to cover full unit functionality. */

var expect = require('chai').expect;

const Util = require("../../lib/thinx/util");

var envi = require("../_envi.json");

describe("Util", function () {

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running Util spec`);
      });
    
      afterAll(() => {
        console.log(`🚸 [chai] <<< completed Util spec`);
      });
    
    it("should extract owner from request", function (done) {
        let req = {
            session: {
                owner: envi.dynamic.owner
            },
            body: {
                owner: envi.dynamic.owner
            }
        };
        req.end = () => {
            done();
        };
        let result = Util.ownerFromRequest(req);
        console.log(`🚸 [chai] ownerFromRequest: ${result}`);
        expect(result).to.be.a('string');
    });

    it("should respond to request", function (done) {
        let res = { };
        res.end = (body) => {
            console.log(`🚸 [chai] res body: ${body}`);
            done();
        };
        res.header = (arg1, arg2) => {
            console.log(`🚸 [chai] res header: ${arg1} ${arg2}`);
            // res.header("Content-Type", "application/json; charset=utf-8");
        };
        let result = Util.ownerFromRequest(req);
        console.log(`🚸 [chai] ownerFromRequest: ${result}`);
        expect(result).to.be.a('string');
    });
});