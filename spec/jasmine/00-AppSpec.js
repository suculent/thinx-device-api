const THiNX = require("../../thinx-core.js");

const request = require('supertest');
const assert = require('assert');

describe("App", function () {

  let thx;
  let app;

  it("App start should not fail.", function() {
    require('../../thinx.js');
  });

  it("App class should not fail and provide router.", function (done) {
    thx = new THiNX();
    thx.init(() => {
      app = thx.app;
      done();
    });
  }, 20000);

  it("Router should respond to / (healthcheck)", function (done) {
    request(app)
      .get('/')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200, done)
      .expect(response.body).toEqual('{ healthcheck: true }');
      .end(function(err, res) {
        if (err) return done(err);
        console.log("Response: ", res);
        return done();
      });
  });

});
