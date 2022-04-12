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
    
    it("should extract owner from request", function () {
        let req = {
            session: {
                owner: envi.dynamic.owner
            },
            body: {
                owner: envi.dynamic.owner
            }
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
        Util.responder(res, true, "message");
    });

    it("should validate session with JWT request", function (/* done */) {
        let req = {
            headers: {
                'Authorization': envi.dynamic.owner
            },
            session: {
                owner: envi.dynamic.owner
            },
            body: {
                owner: envi.dynamic.owner
            }
        };
        req.session.destroy = () => {
            console.log(`🚸 [chai] validateSession destroy called...`);
            /* done(); */
        };
        let result = Util.validateSession(req);
        console.log(`🚸 [chai] validateSession with JWT: ${result}`);
        expect(result).to.equal(true);
    });

    it("should validate session with session", function () {
        let req = {
            headers: { },
            session: {
                owner: envi.dynamic.owner
            },
            body: {
                owner: envi.dynamic.owner,
                api_key: envi.dynamic.api_key
            }
        };
        let result = Util.validateSession(req);
        console.log(`🚸 [chai] validateSession with session: ${result}`);
        expect(result).to.equal(true);
    });

    it("should validate session with body", function () {
        let req = {
            headers: { },
            session: { },
            body: {
                owner: envi.dynamic.owner,
                api_key: envi.dynamic.api_key
            }
        };
        let result = Util.validateSession(req);
        console.log(`🚸 [chai] validateSession with session: ${result}`);
        expect(result).to.equal(true);
    });
});