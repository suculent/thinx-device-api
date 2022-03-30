const THiNX = require("../../thinx-core.js");

const request = require('supertest');
// const assert = require('assert');

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

  // App POST /githook
  // App POST /api/githook
  // App POST /api/user/logs/tail

  // Router

  it("App GET / [healthcheck]", function (done) {
    request(app)
      .get('/')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200, done)
      .expect(response.body).toEqual('{ healthcheck: true }')
      .end(function(err, res) {
        if (err) return done(err);
        console.log("Response: ", res);
        return done();
      });
  });

  /* Authentication */

  // POST /api/login
  // GET /api/logout

  /* Slack OAuth Integration */

  // POST /api/slack/direct_install
  // GET /api/slack/redirect
  
  /* Github OAuth */

  // GET /api/oauth/github
  // GET /api/oauth/github/callback

  /* Google OAuth */

  // GET /api/oauth/google
  // GET /api/oauth/google/callback

  /* GDPR */

  // POST /api/gdpr
  // POST /api/gdpr/transfer [GDPR user data transfer]
  // POST /api/gdpr/revoke

  /* User Lifecycle */

  // POST /api/user/create
  // POST /api/user/delete
  // POST /api/user/password/reset
  // GET /api/user/password/reset
  // POST /api/user/password/set
  // GET /api/user/activate

  /* User Profile */

  // POST /api/user/profile
  // GET /api/user/profile

   /* Logs */

  // GET /api/user/logs/audit
  // GET /api/user/logs/build/list
  // POST /api/user/logs/build [fetch specific build log]

  /* Statistics */

  // GET /api/user/stats

  /* Slack Chat */

  // POST /api/user/chat

  /* Devices */

  // GET /api/user/devices
  // POST /api/device/attach
  // POST /api/device/detach
  // POST /api/device/mesh/attach
  // POST /api/device/mesh/detach

  // GET /api/device/data/:udid
  // POST /api/device/data
  // POST /api/device/revoke

  /* API Keys */

  // POST /api/user/apikey [create]
  // POST /api/user/apikey/revoke
  // GET /api/user/apikey/list

  /* ENV Vars */

  // POST /api/user/env/add
  // POST /api/user/env/revoke
  // GET /api/user/env/list

  /* Sources (repositories) */

  // GET /api/user/sources/list
  // POST /api/user/source
  // POST /api/user/source/revoke

  /* RSA Keys */

  // GET /api/user/rsakey/create
  // GET /api/user/rsakey/list
  // POST /api/user/rsakey/revoke

  /* Device API */

  // POST /device/register
  // POST /device/firmware
  // GET /device/firmware
  // POST /device/addpush
  // POST /api/device/envs
  // POST /api/device/detail
  // POST /api/device/edit

  /* Transformer */

  // POST /api/transformer/run

  /* Meshes */

  // GET /api/mesh/list [cookie auth]
  // POST /api/mesh/list [owner/apikey auth]
  // POST /api/mesh/create
  // POST /api/mesh/delete

  /* Builder */

  // POST /api/build [run build manually]
  // POST /api/device/envelope [latest firmware envelope]
  // POST /api/device/artifacts [get build artifacts]

  /* Device Ownership Transfer */

  // POST /api/transfer/request
  // GET /api/transfer/decline [all]
  // POST /api/transfer/decline [selective]
  // GET /api/transfer/accept [all]
  // POST /api/transfer/accept [selective]

  /* Actionable Notifications */

  // POST /api/device/notification

  /* Device Configuration */

  // POST /api/device/push [push device configuration over MQTT]


});
