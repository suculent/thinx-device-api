const THiNX = require("../../thinx-core.js");

let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("App should support", function () {

  it("GET / [healthcheck]", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .get('/')
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.text).to.be.a('string');
          expect(JSON.parse(res.text).healthcheck).to.equal(true);
          done();
        });
    });
  }, 20000);

  it("POST /githook", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/githook')
        .send({
          'body': 'nonsense'
        })
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.text).to.be.a('string');
          expect(res.text).to.equal('Accepted');
          done();
        });
    });
  }, 20000);

  it("POST /api/githook", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/githook')
        .send({
          'body': 'nonsense'
        })
        .end((err, res) => {
          expect(res.status).to.equal(200);
          expect(res.text).to.be.a('string');
          expect(res.text).to.equal('Accepted');
          done();
        });
    });
  }, 20000);

  it("POST /api/user/logs/tail", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/user/logs/tail')
        .send({
          'body': 'nonsense'
        })
        .end((err, res) => {
          //console.log("[chai] response:", res.text);
          expect(res.status).to.equal(404); // not implemented at this stage
          done();
        });
    });
  }, 20000);

});



describe("Session Management", function () {

  it("POST /api/login (invalid)", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .post('/api/login')
        .send({
          'username': 'test',
          'password': 'test',
          remember: false
        })
        .end((err, res) => {
          //console.log("[chai] response:", res.text, " status:", res.status);
          expect(res.status).to.equal(403);
          expect(res.text).to.be.a('string');
          expect(res.text).to.equal('{"success":false,"status":"invalid_credentials"}');
          done();
        });
    });
  }, 20000);

  it("/api/logout (without session)", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
        .get('/api/logout')
        .end((err, res) => {
          //console.log("[chai] response:", res.text, " status:", res.status);
          expect(res.status).to.equal(200);
          expect(res.text).to.be.a('string'); // html...
          done();
        });
    });
  }, 20000);

});

/*

00-AppOAuthSpec.js

describe("OAuth", function () {

  // Slack OAuth Integration

  // POST /api/slack/direct_install
  // GET /api/slack/redirect
  
  // Github OAuth

  // GET /api/oauth/github
  // GET /api/oauth/github/callback

  // Google OAuth

  // GET /api/oauth/google
  // GET /api/oauth/google/callback

});

00-AppUserSpec.js

describe("GDPR", function () {
  // POST /api/gdpr
  // POST /api/gdpr/transfer [GDPR user data transfer]
  // POST /api/gdpr/revoke
});

describe("User Lifecycle", function () {
  // POST /api/user/create
  // POST /api/user/delete
  // POST /api/user/password/reset
  // GET /api/user/password/reset
  // POST /api/user/password/set
  // GET /api/user/activate
});

describe("User Profile", function () {
  // POST /api/user/profile
  // GET /api/user/profile
});

describe("User Logs", function () {
  // GET /api/user/logs/audit
  // GET /api/user/logs/build/list
  // POST /api/user/logs/build [fetch specific build log]
});

describe("User Statistics", function () {
  // GET /api/user/stats
});

describe("User Support (2nd level)", function () {
  // POST /api/user/chat [slack]
});

00-AppDeviceSpec.js

describe("Devices", function () {
  // GET /api/user/devices
  // POST /api/device/attach
  // POST /api/device/detach
  // POST /api/device/mesh/attach
  // POST /api/device/mesh/detach
  // GET /api/device/data/:udid
  // POST /api/device/data
  // POST /api/device/revoke
});

...

describe("API Keys", function () {
  // POST /api/user/apikey [create]
  // POST /api/user/apikey/revoke
  // GET /api/user/apikey/list
});

describe("ENV Vars", function () {
  // POST /api/user/env/add
  // POST /api/user/env/revoke
  // GET /api/user/env/list
});

describe("Sources (repositories)", function () {
  // GET /api/user/sources/list
  // POST /api/user/source
  // POST /api/user/source/revoke
});

describe("RSA Keys", function () {
  // GET /api/user/rsakey/create
  // GET /api/user/rsakey/list
  // POST /api/user/rsakey/revoke
});

describe("Device API", function () {
  // POST /device/register
  // POST /device/firmware
  // GET /device/firmware
  // POST /device/addpush
  // POST /api/device/envs
  // POST /api/device/detail
  // POST /api/device/edit
});

describe("Transformer", function () {
  // POST /api/transformer/run
});

describe("Meshes", function () {
  // GET /api/mesh/list [cookie auth]
  // POST /api/mesh/list [owner/apikey auth]
  // POST /api/mesh/create
  // POST /api/mesh/delete
});

describe("Builder", function () {
  // POST /api/build [run build manually]
  // POST /api/device/envelope [latest firmware envelope]
  // POST /api/device/artifacts [get build artifacts]
});

describe("Device Ownership Transfer", function () {
  // POST /api/transfer/request
  // GET /api/transfer/decline [all]
  // POST /api/transfer/decline [selective]
  // GET /api/transfer/accept [all]
  // POST /api/transfer/accept [selective]
});

describe("Actionable Notifications", function () {
  // POST /api/device/notification
});

describe("Device Configuration", function () {
  // POST /api/device/push [push device configuration over MQTT]
});

*/