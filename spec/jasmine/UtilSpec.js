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
        req.session.destroy = () => {
            console.log(`🚸 [chai] validateSession destroy called (1)...`);
        };
        let result = Util.ownerFromRequest(req);
        expect(result).to.be.a('string');
    });

    it("should respond to request", function (done) {
        let res = { object: true };
        res.end = (body) => {
            expect(body).to.be.a('string');
            done();
        };
        res.header = (arg1, arg2) => {
            expect(arg1).to.equal('Content-Type');
            // expect(arg2).to.equal('application/json; charset=utf-8');
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
            console.log(`🚸 [chai] validateSession destroy called (3)...`);
        };
        let result = Util.validateSession(req);
        expect(result).to.equal(true);
    });

    it("should validate session with session", function () {
        let req = {
            headers: { },
            session: {
                owner: envi.dynamic.owner
            },
            body: { }
        };
        req.session.destroy = () => {
            console.log(`🚸 [chai] validateSession destroy called (4)...`);
        };
        let result = Util.validateSession(req);
        expect(result).to.equal(true);
    });

    it("should invalidate session with invalid body", function (done) {
        let req = {
            headers: { },
            session: { },
            body: {
                owner: envi.dynamic.owner,
                api_key: envi.dynamic.api_key
            }
        };
        req.session.destroy = () => {
            console.log(`🚸 [chai] validateSession destroy called (5)...`);
            done();
        };
        let result = Util.validateSession(req);
        expect(result).to.equal(false);
    });

    it("should validate session with valid body", function () {
        let req = {
            headers: { },
            session: { },
            body: {
                owner_id: envi.oid,
                api_key: envi.ak
            }
        };
        req.session.destroy = () => {
            console.log(`🚸 [chai] validateSession destroy called (6)...`);
        };
        let result = Util.validateSession(req);
        expect(result).to.equal(true);
    });

    it("should respond with buffer", function (done) {
        let res = { object: true };
        res.end = (body) => {
            console.log("body type A:", typeof(body));
            expect(body).to.be.an('ArrayBuffer');
            done();
        };
        res.header = (arg1, arg2) => {
            expect(arg1).to.equal('Content-Type');
            console.log("should 'responder' with buffer", arg2);
            // expect(arg2).to.equal('application/json; charset=utf-8');
        };
        Util.respond(res, new Buffer("message"));
    });

    it("should support responder with buffer", function (done) {
        let res = { object: true };
        res.end = (body) => {
            console.log("body type B:", typeof(body));
            expect(body).to.be.an('ArrayBuffer');
            done();
        };
        res.header = (arg1, arg2) => {
            expect(arg1).to.equal('Content-Type');
            console.log("should 'respond' with buffer", arg2);
            // expect(arg2).to.equal('application/json; charset=utf-8');
        };
        Util.responder(res, true, new Buffer("message"));
    });
});