const THiNX = require("../../thinx-core.js");

let chai = require('chai');
let chaiHttp = require('chai-http');
chai.use(chaiHttp);

describe("App", function () {

  it("App class should not fail and provide router with healthcheck", function (done) {
    let thx = new THiNX();
    thx.init(() => {
      chai.request(thx.app)
      .get('/')
      .end((err, res) => {
            console.log("chai res", res);
            expect(res.status).toBe(200);
            expect(res.body).toBe.an('object');
            expect(res.body.healthcheck).toBe.eql(true);
        done();
      });
    });
  }, 20000);

  

  // App POST /githook
  // App POST /api/githook
  // App POST /api/user/logs/tail
});

/*

describe("Session Management", function () {
  // POST /api/login
  // GET /api/logout
});

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