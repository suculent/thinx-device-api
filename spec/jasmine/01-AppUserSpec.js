/* Router integration test only; does not have to cover full unit functionality. */

const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

//var envi = require("../_envi.json");

describe("GDPR", function () {
    
    it("POST /api/gdpr", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .post('/api/gdpr')
            .send({})
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
    
    it("POST /api/gdpr/transfer", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          console.log("[chai] request /api/gdpr/transfer");
          chai.request(thx.app)
            .post('/api/gdpr/transfer')
            .send({})
            .end((err, res) => {
              console.log("[chai] response /api/gdpr/transfer:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
    
    it("POST /api/gdpr/revoke", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          console.log("[chai] request /api/gdpr/revoke");
          chai.request(thx.app)
            .post('/api/gdpr/revoke')
            .send({})
            .end((err, res) => {
              console.log("[chai] response /api/gdpr/revoke:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
});

describe("User Lifecycle", function () {
    
    it("POST /api/user/create", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .post('/api/user/create')
            .send({})
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
    
    it("POST /api/user/delete", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .post('/api/user/delete')
            .send({})
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
    
    it("POST /api/user/password/reset", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .post('/api/user/password/reset')
            .send({})
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
    
    it("GET /api/user/password/reset", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .get('/api/user/password/reset')
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
    
    it("POST /api/user/password/set", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          console.log("[chai] request /api/user/password/set");
          chai.request(thx.app)
            .post('/api/user/password/set')
            .send({})
            .end((err, res) => {
              console.log("[chai] response /api/user/password/set:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
    
    // GET /api/user/activate
});

describe("User Profile", function () {
    
    it("GET /api/user/profile", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .get('/api/user/profile')
            .end((err, res) => {
              console.log("[chai] response /api/user/profile status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);

    it("POST /api/user/profile", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          console.log("[chai] response /api/user/profile");
          chai.request(thx.app)
            .post('/api/user/profile')
            .send({})
            .end((err, res) => {
              console.log("[chai] response /api/user/profile:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
});

describe("User Logs", function () {
    
    it("GET /api/user/logs/audit", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .get('/api/user/logs/audit')
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);

    it("GET /api/user/logs/build/list", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .get('/api/user/logs/build/list')
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);

    it("POST /api/user/logs/build", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .post('/api/user/logs/build')
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

describe("User Statistics", function () {
    it("GET /api/user/stats", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          chai.request(thx.app)
            .get('/api/user/stats')
            .end((err, res) => {
              console.log("[chai] response:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
});

describe("User Support (2nd level)", function () {
    // [error] websocket Error: listen EADDRINUSE: address already in use 0.0.0.0:7442
    xit("POST /api/user/chat", function (done) {
        let thx = new THiNX();
        thx.init(() => {
          console.log("[chai] response /api/user/chat");
          chai.request(thx.app)
            .post('/api/user/chat')
            .send({})
            .end((err, res) => {
              console.log("[chai] response /api/user/chat:", res.text, " status:", res.status);
              //expect(res.status).to.equal(200);
              //expect(res.text).to.be.a('string');
              done();
            });
        });
      }, 20000);
});
