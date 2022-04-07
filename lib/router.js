/* New Router */

module.exports = function (app) {

  const typeOf = require("typeof");
  const sha256 = require("sha256");
  const https = require('https');

  const Globals = require("./thinx/globals");

  const app_config = Globals.app_config();
  const prefix = Globals.prefix();
  const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

  let Sqreen;

  if (Globals.use_sqreen()) {
    try {
      Sqreen = require('sqreen');
    } catch (s) {
      console.log(s);
    }
  }

  // Globals

  const hour = 3600 * 1000;
  const day = hour * 24;
  const fortnight = day * 14;

  const client_user_agent = app_config.client_user_agent;
  const google_ocfg = Globals.google_ocfg();
  const github_ocfg = Globals.github_ocfg();

  // Locals

  // This is not missing anywhere... what is it supposed to do?
  // var thinx_slack = require("slack-notify")(app_config.slack.webhook);

  const Validator = require('../lib/thinx/validator');

  var AuditLog = require("../lib/thinx/audit");
  var alog = new AuditLog();

  var Device = require("../lib/thinx/device");
  var device = new Device();

  var Deployment = require("../lib/thinx/deployment");
  var deployment = new Deployment();

  var APIEnv = require("../lib/thinx/apienv");
  var apienv = new APIEnv();

  var APIKey = require("../lib/thinx/apikey");
  var apikey = new APIKey();

  var User = require("../lib/thinx/owner");
  var user = new User();

  var RSAKey = require("../lib/thinx/rsakey");
  var rsakey = new RSAKey();

  var Stats = require("../lib/thinx/statistics");
  var stats = new Stats();

  var Sources = require("../lib/thinx/sources");
  var sources = new Sources();

  var Devices = require("../lib/thinx/devices");
  var devices = new Devices(app.messenger);

  var Transfer = require("../lib/thinx/transfer");
  var transfer = new Transfer(app.messenger);

  const Buildlog = require("../lib/thinx/buildlog"); // must be after initDBs as it lacks it now
  const blog = new Buildlog();

  const Database = require("../lib/thinx/database.js");
  let db_uri = new Database().uri();
  var userlib = require("nano")(db_uri).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]

  const redis_client = app.redis_client;

  const JWTLogin = require("./thinx/jwtlogin");
  var login = new JWTLogin(redis_client);
  login.init(() => {
    console.log("ℹ️ [info] JWT Login Secret Init Complete. Login is now possible.");
  });

  // Functions

  var getClientIp = function (req) {
    var ipAddress = req.ip;
    if (!ipAddress) {
      console.log("⚠️ [warning] Unknown Client IP:" + ipAddress);
      return false;
    }
    // convert from "::ffff:192.0.0.1"  to "192.0.0.1"
    if (ipAddress.indexOf("::ffff:") !== -1) {
      ipAddress = ipAddress.replace("::ffff:", "");
    }
    return ipAddress;
  };

  function respond(res, object) {
    if (typeOf(object) == "buffer") {
      res.header("Content-Type", "application/octet-stream");
      res.end(object);
    } else if (typeOf(object) == "string") {
      res.end(object);
    } else {
      res.end(JSON.stringify(object));
    }
  }

  /* this is a callback for some functions */
  function responder(res, success, message) {
    respond(res, {
      success: success,
      status: message
    });
  }

  function failureResponse(res, code, reason) {
    res.writeHead(code, {
      "Content-Type": "application/json"
    });
    respond(res, {
      success: false,
      "status": reason
    });
  }

  //
  // Middleware-like Validation
  //

  function validateSession(req) {

    // OK if request has JWT authorization (was already checked in app.all("/*"))
    if ((typeof (req.headers['authorization']) !== "undefined") || (typeof (req.headers['Authorization']) !== "undefined")) {
      return true;
    }

    let sess = req.session;

    // OK if request session has internally set owner
    if (typeof (sess) !== "undefined") {
      if (typeof (sess.owner) !== "undefined") {
        return true;
      }
    }

    // OK if request has owner_id and api_key that has been previously validated
    if (typeof (req.body) !== "undefined") {
      if ((typeof (req.body.owner_id) !== "undefined") && (typeof (req.body.api_key) !== "undefined")) {
        return true;
      }
    }

    if (process.env.ENVIRONMENT == "test") {
      // log only in test when required; it may be dangerous log flood in production
      // console.log("⚠️ [warning] Session is invalid with headers", JSON.stringify(req.headers), "and session", req.session);
    }

    sess.destroy(function (err) {
      if (err) {
        console.log("☣️ [error] Session destroy error: " + JSON.stringify(err));
      }
    });

    // No session, no API-Key auth, rejecting...
    return false;
  }

  function validateRequest(req, res) {
    // Check device user-agent
    var ua = req.headers["user-agent"];
    var validity = ua.indexOf(client_user_agent);

    if (validity === 0) {
      return true;
    } else {

      // testing framework
      if (ua.indexOf("node-superagent") !== -1) {
        return true;
      }

      if (ua.indexOf("SIGFOX") !== -1) {
        return true;
      }

      // ESP32HTTPClient has issues overriding User-Agent?
      if (ua.indexOf("ESP32HTTPClient") !== -1) {
        return true;
      }

      console.log("User-Agent: " + ua + " invalid!");
      res.writeHead(401, {
        "Content-Type": "text/plain"
      });
      res.end("invalid request");
      return false;
    }
  }

  //
  // OAuth2 for Google
  //

  const oauth2 = require('simple-oauth2').create({
    client: {
      id: process.env.GOOGLE_OAUTH_ID,
      secret: process.env.GOOGLE_OAUTH_SECRET
    },
    auth: {
      authorizeHost: 'https://accounts.google.com',
      authorizePath: '/o/oauth2/v2/auth',
      tokenHost: 'https://www.googleapis.com',
      tokenPath: '/oauth2/v4/token'
    }
  });

  //
  // OAuth2 for GitHub
  //

  var githubOAuth;

  if (typeof (process.env.GITHUB_CLIENT_SECRET) !== "undefined" && process.env.GITHUB_CLIENT_SECRET !== null) {
    try {
      let specs = {
        githubClient: process.env.GITHUB_CLIENT_ID,
        githubSecret: process.env.GITHUB_CLIENT_SECRET,
        baseURL: github_ocfg.base_url, // should be rather gotten from global config!
        loginURI: '/api/oauth/github',
        callbackURI: '/api/oauth/github/callback',
        scope: 'user'
      };
      githubOAuth = require('./thinx/oauth-github.js')(specs);
    } catch (e) {
      console.log(`[debug] [oauth] [github] github_ocfg init error: ${e}`);
    }
  }

  // called from validateGithubUser()
  function trackUserLogin(owner_id) {
    userlib.atomic("users", "checkin", owner_id, {
      last_seen: new Date()
    }, (error) => {
      if (error) {
        console.log("[error] [trackUserLogin] Last-seen atomic update failed: " + error);
      }
    });

    alog.log(owner_id, "OAuth2 User logged in...");

    if (Globals.use_sqreen()) {
      Sqreen.auth_track(true, { username: owner_id });
    }
  }

  function validateGithubUser(response, token, userWrapper) {

    let owner_id = userWrapper.owner; // must not be nil
    console.log("[oauth][github] searching for owner with ID: ", { owner_id });

    // Check user and make note on user login
    userlib.get(userWrapper.owner, (error, udoc) => {

      // Error case covers creating new user/managing deleted account
      if (error) {

        if (Globals.use_sqreen()) {
          Sqreen.auth_track(false, { doc: owner_id });
        }

        console.log("[oauth][github] userlib.get failed with error: ", error, { udoc });

        if (error.toString().indexOf("Error: deleted") !== -1) {
          console.log("[debug] [oauth] [check] user document deleted");
          response.redirect(
            app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
            encodeURI('Account document deleted.')
          );
          return;
        }

        // May exist, but be deleted. Can be cleared using Filtered Replication Handler "del"
        if (typeof (udoc) !== "undefined" && udoc !== null) {
          if ((typeof (udoc.deleted) !== "undefined") && udoc.deleted === true) {
            if (Globals.use_sqreen()) {
              Sqreen.auth_track(false, { doc: owner_id });
            }
            console.log("[debug] [oauth] [check] user account marked as deleted");
            response.redirect(
              app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
              encodeURI('Account deleted.')
            );
            return;
          }
        } else {
          console.log("No such owner, should create one...");
        }

        // No such owner, create...
        user.create(userWrapper, false, response, (/* res, success, status*/) => {

          console.log("[OID:" + owner_id + "] [NEW_SESSION] [oauth] 2485:");

          alog.log(owner_id, "OAuth User created. ");

          console.log("validateGithubUser", { token }, { userWrapper });
          redis_client.set(token, JSON.stringify(userWrapper));
          redis_client.expire(token, 30);

          const courl = app_config.acl_url + "/auth.html&t=" + token + "&g=true"; // require GDPR consent
          console.log("FIXME: this request will probably fail fail (cannot redirect): " + courl);

          if (Globals.use_sqreen()) {
            Sqreen.signup_track({ username: owner_id });
          }

          console.log("Redirecting to login (2)");
          response.redirect(courl); // for successful login, this must be a response to /oauth/<idp>/callback 
        });
        return;
      }

      trackUserLogin(owner_id);

      console.log("validateGithubUser", { token }, { userWrapper });
      redis_client.set(token, JSON.stringify(userWrapper));
      redis_client.expire(token, 3600);

      var gdpr = false;
      if (typeof (udoc) !== "undefined" && udoc !== null) {
        if (typeof (udoc.info) !== "undefined") {
          if (typeof (udoc.gdpr_consent) !== "undefined" && udoc.gdpr_consent === true) {
            gdpr = true;
          }
        }
      }

      const ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=" + gdpr; // require GDPR consent
      console.log("[validateGithubUser] using response with ourl: " + ourl);
      response.redirect(ourl);
    }); // userlib.get
  }

  function checkDirtyRequests(req, res, next) {

    if (req.headers.origin === "device") {
      next();
      return true;
    }

    let client = req.header("User-Agent");


    if (typeOf(client) === "undefined") {
      console.log("[checkDirtyRequests] NOT Dropping connection for client without user-agent (allow WSS).");
      return true;
    }

    if (client.indexOf("Jorgee") !== -1) {
      res.status(403).end();
      console.log("[checkDirtyRequests] Jorgee is blacklisted.");
      return false;
    }

    if (req.originalUrl.indexOf("admin") !== -1) {
      res.status(403).end();
      console.log("[checkDirtyRequests] admin is blacklisted because of request " + req.originalUrl);
      return false;
    }

    if (req.originalUrl.indexOf("php") !== -1) {
      res.status(403).end();
      console.log("[checkDirtyRequests] php is blacklisted.");
      return false;
    }

    if (req.originalUrl.indexOf("\\x04\\x01\\x00") !== -1) {
      res.status(403).end();
      console.log("[checkDirtyRequests] heartbleed is blacklisted.");
      return false;
    }

    return true; // passed all gates
  }

  function logAccess(req) {
    // log owner ID and request method to application log only
    if ((typeof (req.session) !== "undefined") && (typeof (req.session.owner) !== "undefined")) {
      // Skip logging for monitoring sites
      if (client.indexOf("uptimerobot") !== -1) {
        return;
      }
      if (req.method !== "OPTIONS") {
        console.log("[OID:0] [" + req.method + "]:" + req.url + "(" + req.get("User-Agent") + ")");
      }
    }
  }

  function enforceACLHeaders(res, req) {

    // cannot use this with allow origin * res.header("Access-Control-Allow-Credentials", "true");
    // analysis: will PROBABLY have to be refactored to anything but Device-Registration and Devoce-OTA requests
    if ((req.originalUrl.indexOf("register") !== -1) ||
      (req.originalUrl.indexOf("firmware") !== -1)) {
      return;
      // no ACL/CORS for device requests
    } else {
      res.header("Access-Control-Allow-Credentials", "true"); // should be allowed for device as well
    }

    // deepcode ignore TooPermissiveCorsHeader: this must be callable from anywhere
    res.header("Access-Control-Allow-Origin", "*"); // lgtm [js/cors-misconfiguration-for-credentials]
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-type,Accept,X-Access-Token,X-Key");
  }

  app.all("/*", function (req, res, next) {

    // JWT Auth (if there is such header, resst of auth checks is not important)
    if ((typeof (req.headers['authorization']) !== "undefined") || (typeof (req.headers['Authorization']) !== "undefined")) {
      login.verify(req, (error, payload) => {
        // for JWT debugging: console.log("[debug] JWT Secret verification result:", { error }, { payload });
        if (error == null) {
          req.session.owner = payload.username;
          next();
        } else {
          res.status(403).end(); // FIXME: Change to 401 Unauthorized in tests as well!
        }
      });
      return;
    }

    // Cookie or other auth
    var client = req.get("User-Agent");

    if (typeof (req.headers.origin) !== "undefined") {
      if (req.headers.origin === "device") {
        next();
        return;
      }
    }

    if (process.env.ENVIRONMENT !== "test") {
      if ((typeof (app_config.debug.ingress) !== "undefined") && (app_config.debug.ingress !== false)) {
        console.log("[audit] Ingress from IP: ", getClientIp(req));
      }
    }

    if (!checkDirtyRequests(req, res, next)) {
      console.log("ℹ️ [info] Exit after checkDirtyRequests in router:508; not running next.");
      res.status(403).end();
      return;
    }

    // Problem is, that the device API should be separate and have different Access-Control (which is solved by customizing those two endpoints)
    // var webHostname = process.env.WEB_HOSTNAME || "rtm.thinx.cloud";

    enforceACLHeaders(res, req); // this should not be done for device requests (with specific client)

    if (req.method == "OPTIONS") {
      res.status(200).end();
      return;
    }

    try {
      logAccess(req);
    } catch (e) {
      //
    }

    if (client == client_user_agent) {
      if (typeof (req.headers.origin) !== "undefined") {
        if (req.headers.origin == "device") {
          console.log("allowed for device");
          next();
          return;
        } else {
          console.log("not allowed for non-device");
          respond(401, {
            success: false,
            message: "Authentication Faled"
          });
          return;
        }
      }
    }

    // Not a device client_user_agent...

    // Applies only to post requests!
    if (req.method == "POST") {
      if (typeof (req.body) !== "undefined") {
        let owner = req.body.owner; // not session!
        if (typeof (owner) !== "undefined") {
          let xowner = req.body.owner; // owner can be undefined here?
          let api_key = req.body.api_key;
          if ((typeof (xowner) !== "undefined") && (xowner !== null) && (typeof (api_key) !== "undefined") && (api_key !== null)) {
            // Using Owner/API Key
            apikey.verify(sanitka.owner(xowner), sanitka.udid(api_key), true, (vsuccess, vmessage) => {
              if (vsuccess) {
                next();
              } else {
                respond(401, {
                  success: false,
                  message: "Authentication Faled"
                });
                console.log("APIKey ", vmessage);
              }
            });
            return;
          }
        }
      }
    }

    next();

  });

  ///////////////////////////////////////////////////////////////////////
  //
  // ROUTES
  //

  /*
   * Health check route
   */

  app.get("/", function (req, res) {
    respond(res, { healthcheck: true });
  });

  /*
   * Devices
   */

  /* List all devices for user. */
  app.get("/api/user/devices", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    devices.list(req.session.owner, (success, response) => {
      respond(res, response);
    });
  });

  // Sources

  /* Attach code source to a device. Expects unique device identifier and source alias. */
  app.post("/api/device/attach", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    devices.attach(owner, body, responder, res);
  });

  /* Detach code source from a device. Expects unique device identifier. */
  app.post("/api/device/detach", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    devices.detach(req.body, responder, res);
  });

  // Mesh

  /* Attach device to a mesh. Expects unique mesh identifier and device id. */
  app.post("/api/device/mesh/attach", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    if ((typeof (owner) === "undefined") || (owner === null)) {
      owner = sanitka.owner(body.owner);
    }
    devices.attachMesh(owner, body, responder, res);
  });

  /* Detach device from a mesh. Expects unique device identifier and unique mesh identifier. */
  app.post("/api/device/mesh/detach", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    if ((typeof (owner) === "undefined") || (owner === null)) {
      owner = body.owner;
    }
    devices.detachMesh(owner, body, (success, status) => {
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  /* TEST ONLY! Get device data. */
  app.get("/api/device/data/:udid", function (req, res) {

    // Could be also authenticated using headers:
    // X-THX-Owner-ID:
    // X-THX-API-Key:

    var udid = "4bf09450-da0c-11e7-81fb-f98aa91c89a5";

    // Test only
    if (typeof (req.params.udid) !== "undefined") {
      udid = req.params.udid;
    } else {
      respond(res, {
        success: false,
        response: "missing_udid"
      });
    }

    if (typeof (app.messenger) !== "undefined") {

      app.messenger.data("", udid, (success, response) => {
        respond(res, {
          success: success,
          response: response
        });
      });

    } else {
      respond(res, {
        success: false,
        response: "messenger_not_available"
      });
    }

    // }); -- apikey
  });

  /* Post device data. */
  app.post("/api/device/data", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var udid = sanitka.udid(req.body.udid);
    if ((owner === null) || (udid === null)) {
      res.status(403).end();
      return;
    }
    app.messenger.data(owner, udid, (success, response) => {
      respond(res, {
        success: success,
        response: response
      });
    });
  });

  /* Revokes a device. Expects unique device identifier. */
  app.post("/api/device/revoke", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    devices.revoke(req.session.owner, req.body, responder, res);
  });

  /*
   * Transformers
   */

  app.post("/api/transformer/run", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined" || owner === null) {
      respond(res, {
        success: false,
        status: "owner_not_found"
      });
      return;
    }
    var udid = req.body.device_id;
    if (typeof (udid) === "undefined" || udid === null) {
      respond(res, {
        success: false,
        status: "udid_not_found"
      });
      return;
    }
    console.log("[debug] running transformer");

    let transformer_responder = (success, message) => {
      console.log("[debug] transformer results", { success }, { message });
      respond(res, {
        success: success,
        status: message
      });
    };

    device.run_transformers(udid, owner, false, transformer_responder, res);
  });

  /*
   * API Keys
   */

  /* Creates new API Key. */
  app.post("/api/user/apikey", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);

    if (typeof (req.body.alias) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_alias"
      });
      return;
    }

    var new_api_key_alias = req.body.alias;

    apikey.create(owner, new_api_key_alias, (success, all_keys) => {
      if (success) {
        if (all_keys.length == 0) {
          console.log(`[error] Creating API key ${new_api_key_alias} for ${owner} failed!`);
          respond(res, {
            success: false
          });
        } else {
          let item_index = all_keys.length - 1;
          let object = all_keys[item_index];
          console.log(`ℹ️ [info] Created API key ${new_api_key_alias}`);
          respond(res, {
            success: success,
            api_key: object.key,
            hash: sha256(object.key)
          });
        }
      }
    });
  });

  /* Deletes API Key by its hash value */
  app.post("/api/user/apikey/revoke", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);
    var api_key_hashes = [];

    if (typeof (req.body.fingerprint) !== "undefined") {
      api_key_hashes = [req.body.fingerprint];
    }

    if (typeof (req.body.fingerprints) !== "undefined") {
      api_key_hashes = req.body.fingerprints;
    }

    apikey.revoke(owner, api_key_hashes, (success, deleted_keys) => {
      if (success) {
        respond(res, {
          revoked: deleted_keys,
          success: true
        });
      } else {
        respond(res, {
          success: false,
          status: "revocation_failed"
        });
      }
    });
  });

  /* Lists all API keys for user. */
  app.get("/api/user/apikey/list", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);

    apikey.list(owner, (keys) => {
      respond(res, {
        success: true,
        api_keys: keys
      });
    });
  });

  /*
   * Environment Variables
   */

  /* Creates new env var. */
  app.post("/api/user/env/add", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);

    if (typeof (req.body.key) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_key"
      });
      return;
    }

    if (typeof (req.body.value) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_value"
      });
      return;
    }

    var key = req.body.key;
    var value = req.body.value;

    apienv.create(owner, key, value, (success, object) => {
      if (success) {
        respond(res, {
          success: true,
          key: key,
          value: value,
          object: object
        });
      } else {
        respond(res, {
          success: success,
          message: object
        });
      }
    });
  });

  /* Deletes env var by its name */
  app.post("/api/user/env/revoke", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);
    var env_var_names;

    if (typeof (req.body.name) !== "undefined") {
      env_var_names = [req.body.name];
    }

    if (typeof (req.body.names) !== "undefined") {
      env_var_names = req.body.names;
    }

    if (typeof (env_var_names) === "undefined") {
      respond(res, {
        success: false,
        status: "no_names_given"
      });
      return;
    }

    apienv.revoke(owner, env_var_names, (success, response) => {
      if (success) {
        respond(res, {
          revoked: env_var_names,
          success: true
        });
      } else {
        respond(res, {
          success: success,
          status: response
        });
      }
    });
  });

  /* Lists all env vars for user. */
  app.get("/api/user/env/list", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);

    apienv.list(owner, (success, response) => {
      if (success) {
        respond(res, {
          env_vars: response
        });
      } else {
        respond(res, {
          success: false,
          status: "env_list_failed"
        });
      }
    });
  });

  /*
   * Sources (GIT Repositories)
   */

  /* List available sources */
  app.get("/api/user/sources/list", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined") {
      res.status(401);
    }
    sources.list(req.session.owner, (success, response) => {
      if (success === true) {
        respond(res, {
          success: true,
          sources: response
        });
      } else {
        respond(res, response);
      }
    });
  });

  /* Adds a GIT repository. Expects URL, alias and a optional branch (origin/master is default). */
  app.post("/api/user/source", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    if (typeof (req.body.alias) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_source_alias"
      });
      return;
    }

    if (typeof (req.body.url) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_source_url"
      });
      return;
    }

    var branch = "origin/master";
    if ((typeof (req.body.branch) !== "undefined") &&
      (req.body.branch !== null)) {
      branch = req.body.branch;
    }

    var is_private = false;
    if (typeof (req.body.is_private) !== "undefined") {
      is_private = req.body.is_private;
    }

    var object = {
      owner: req.session.owner,
      alias: req.body.alias,
      url: req.body.url,
      branch: branch,
      circle_key: req.body.circleToken,
      secret: req.body.secret,
      is_private: is_private
    };

    sources.add(object, (success, response) => {
      respond(res, response);
    });
  });

  /* Removes a GIT repository. Expects alias. */
  app.post("/api/user/source/revoke", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);
    if (typeof (req.body.source_ids) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_source_ids"
      });
      return;
    }

    var source_ids = req.body.source_ids;
    sources.remove(owner, source_ids, (success, message) => {
      respond(res, message);
    });
  });

  /*
   * RSA Keys
   */

  app.get("/api/user/rsakey/create", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);
    const ownerValid = rsakey.validateOwner(owner);
    if (!ownerValid) {
      console.log("Invalid owner in RSA Key Create.");
      respond(res, {
        success: false,
        status: "owner_invalid"
      });
      return;
    }

    rsakey.create(owner, (success, response) => {
      respond(res, {
        success: success,
        status: response
      });
    });
  });

  /* Lists all RSA keys for user. */
  app.get("/api/user/rsakey/list", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);

    rsakey.list(owner, (success, response) => {
      if (success === false) {
        respond(res, {
          success: success,
          status: response
        });
      } else {
        respond(res, {
          success: success,
          rsa_keys: response
        });
      }
    });

  });

  /* Deletes RSA Key by its fingerprint */
  app.post("/api/user/rsakey/revoke", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    var owner;

    if (typeof (req.session.owner) !== "undefined") {
      owner = sanitka.owner(req.session.owner);
    } else {
      respond(res, {
        success: false,
        status: "missing_attribute:owner"
      });
      return;
    }

    // Support bulk updates
    if (typeof (req.body.filenames) !== "undefined") {
      var filenames = req.body.filenames;
      console.log("Fingerprints: " + JSON.stringify(filenames));

      let r_responder = (success, result) => {
        respond(res, {
          success: success,
          status: result
        });
      };
      
      rsakey.revoke(owner, filenames, r_responder, res);
    } else {
      respond(res, {
        success: false,
        status: "invalid_query"
      });
    }
  });

  /*
   * User Lifecycle
   */

  // /user/create GET
  /* Create username based on e-mail. Owner must be unique (email hash). */
  app.post("/api/user/create", function (req, res) {
    user.create(req.body, true, res, responder);
  });

  // /user/delete POST
  /* Delete user document */
  app.post("/api/user/delete", function (req, res) {
    let owner = sanitka.owner(req.body.owner);
    if (owner !== null) {
      user.delete(owner, responder, res);
    } else {
      res.status(403).end();
    }
  });

  /* Endpoint for the password reset e-mail. */
  app.get("/api/user/password/reset", function (req, res) {
    user.password_reset(req.query.owner, req.query.reset_key, (success, message) => {
      if (!success) {
        req.session.destroy((/*err*/) => {
          respond(res, {
            success: success,
            status: message
          });
        });
      } else {
        res.redirect(message.redirectURL);
      }
    });
  });

  /* Endpoint for the user activation e-mail, should proceed to password set. */
  app.get("/api/user/activate", function (req, res) {
    user.activate(req.query.owner, req.query.activation, (success, message) => {
      if (!success) {
        req.session.destroy((err) => {
          console.log(err);
        });
        respond(res, {
          success: success,
          status: message
        });
      } else {
        res.redirect(message.redirectURL);
      }
    });
  });

  /* Used by the password.html page to perform the change in database. Should revoke reset_key when done. */
  app.post("/api/user/password/set", function (req, res) {
    user.set_password(req.body, (success, message) => {
      if (!success) {
        req.session.destroy();
        respond(res, {
          success: success,
          status: message
        });
      } else {
        console.log(
          "Returning message on app.post /api/user/password/set :" + JSON.stringify(message));
        respond(res, message);
      }
    });
  });

  /* Used to initiate password-reset session, creates reset key with expiraation and sends password-reset e-mail. */
  app.post("/api/user/password/reset", function (req, res) {
    user.password_reset_init(req.body.email, (success, message) => {
      if (!success) {
        req.session.destroy();
        respond(res, {
          success: success,
          status: message
        });
      } else {
        respond(res, message);
      }
    });
  });

  /*
   * User Profile
   */

  /* Updates user profile allowing following types of bulked changes:
   * { avatar: "base64hexdata..." }
   * { info: { "arbitrary" : "user info data "} } }
   */

  app.post("/api/user/profile", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined") {
      res.status(401); // cannot POST without owner
    }
    user.update(owner, req.body, (success, status) => {
      console.log("Updating user profile...");
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  app.get("/api/user/profile", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined") {
      res.status(401);
    }
    user.profile(owner, (success, response) => {
      if (success === false) {
        respond(res, {
          success: success,
          status: response
        });
      } else {
        respond(res, {
          success: success,
          profile: response
        });
      }
    });
  });

  //
  // Main Device API
  //

  // Firmware update retrieval for OTT requests
  app.get("/device/firmware", function (req, res) {
    const ott = req.query.ott;
    if (typeof (ott) === "undefined" || ott === null) {
      console.log("[error] GET request for FW update with no OTT!");
      respond(res, {
        success: false,
        status: "missing_ott"
      });
      return;
    }
    console.log("GET request for FW update with OTT: " + ott);

    device.ott_update(ott, (success, response) => {
      if (success) {
        console.log("SUCCESS! Responding with contents...");
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename=firmware.bin');
        // deepcode ignore ContentLengthInCode: this is not code for browsers but for legacy OTA device updates
        res.setHeader('Content-Length', response.filesize);
        res.setHeader('x-MD5', response.md5);
        respond(res, response.payload);
      } else {
        console.log("No successful firmware build found: " + JSON.stringify(response));
        respond(res, response);
      }
    });
  });

  // Firmware update retrieval. Serves binary [by owner (?) - should not be required] and device MAC.
  app.post("/device/firmware", function (req, res) {

    validateRequest(req, res);
    res.set("Connection", "close");

    // Device will create OTT request and fetch firmware from given OTT-URL
    if ((typeof (req.body.use) !== "undefined") && (req.body.use == "ott")) {
      device.ott_request(req, (success, response) => {
        console.log("Responding to OTT request with :", { response });
        respond(res, response);
      });

      // Device will fetch firmware/files now (wrapped as JSON or in binary, depending on type (firmware/file))
    } else {
      device.firmware(req, (success, response) => {
        console.log("Responding to Firmware request with :", { response }, "and success:", success);
        respond(res, response);
      });
    }
  });

  // Device login/registration
  // MAC is be allowed for initial regitration where device is given new UDID

  app.post("/device/register", function (req, res) {

    var rip = getClientIp(req);

    if (typeof (req.body) === "undefined") {
      respond(res, {
        success: false,
        status: "no_body"
      });

    } else if (typeof (req.body.registration) === "undefined") {
      if (rip !== false) {
        console.log("Incoming request has no `registration` in body, should BLACKLIST " + rip);
        console.log("headers: " + JSON.stringify(req.headers));
        console.log("body: " + JSON.stringify(req.body));
        respond(res, {
          success: false,
          status: "blacklisted"
        });
      }
    } else {
      var registration = req.body.registration;
      let websocket = null;
      if (typeof (req.session) !== "undefined") {
        if (typeof (req.session.owner) !== "undefined") {
          websocket = req.session.owner;
        }
      }
      try {
        if (typeof (registration.owner) !== "undefined") {
          if ((typeof (app._ws) !== "undefined") && (typeof (app._ws[registration.owner]) !== "undefined")) {
            websocket = app._ws[registration.owner];
          }
        }
      } catch (err) {
        console.log("Caught exception: ", err);
      }
      device.register(
        req,
        registration,
        req.headers.authentication,
        websocket,
        (success, response) => {
          // Append timestamp inside as library is not parsing HTTP response JSON properly
          // when it ends with anything else than }}
          if (success && typeof (response.registration) !== "undefined") {
            response.registration.timestamp = Math.floor(new Date() / 1000);
          }
          if (success === false) {
            console.log("Device registration failed with response:", response);
          } else {
            console.log("Device registration succeeded.");
          }
          respond(res, response);
        });
    }
  });

  // Device push attach
  // UDID is required, valid Push token is required. Potential point for DDoS attacks,
  // would use at least SOME authentication.

  app.post("/device/addpush", function (req, res) {

    if ((typeof (req.body) === "undefined") || (typeof (req.body.push) === "undefined")) {
      respond(res, {
        success: false,
        status: "no_body"
      });
      return;
    }

    let tstring = req.body.push;

    if ((typeof (tstring) !== "string") || (tstring === "")) {
      respond(res, {
        success: false,
        status: "no_token"
      });
      return;
    }

    let token = sanitka.pushToken(tstring);

    if (token == null) {
      respond(res, {
        success: false,
        status: "no_token"
      });
      return;
    }

    let api_key = sanitka.apiKey(req.headers.authentication);
    if (api_key === null) {
      res.status(403).end();
      return;
    }

    device.push(token, api_key, (success, response) => {
      if (success) {
        respond(res, response);
      } else {
        console.log("Push registration failed:", response);
      }
    });
  });

  // May contain private data!
  app.post("/api/device/envs", function (req, res) {
    let udid = sanitka.udid(req.body.udid);
    device.envs(udid, (success, response) => {
      respond(res, response);
    });
  });

  // May contain private data!
  app.post("/api/device/detail", function (req, res) {
    let udid = sanitka.udid(req.body.udid);
    device.detail(udid, (success, response) => {
      respond(res, response);
    });
  });


  // Device editing
  app.post("/api/device/edit", function (req, res) {

    if (typeof (req.body) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_body"
      });
      return;
    }

    if (typeof (req.body.changes) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_changes"
      });
      return;
    }

    let changes = req.body.changes;

    // Manually fixes wronte device docs, regardless why it happens(!)
    changes.doc = null;
    changes.value = null;

    // Implementation as internal function because of hybrid auth, prevents duplication
    function implementation(iowner, ichanges, ires) {
      device.edit(iowner, ichanges, (success, message) => {
        respond(ires, {
          success: success,
          message: message
        });
      });
    }

    // Hybrid Cookie/APIKey authentication (could be global middleware... of values exist, shall be validated, then this becomes duplicate op in chain)
    let owner = sanitka.owner(req.session.owner);
    let api_key = req.body.apikey;
    if (typeof (owner) !== "undefined" && typeof (api_key) !== "undefined") {
      // Using Owner/API Key
      apikey.verify(sanitka.owner(owner), sanitka.udid(api_key), true, function (vsuccess, vmessage) {
        if (vsuccess) {
          implementation(owner, req.body.changes, res);
        } else {
          respond(res, {
            success: vsuccess,
            message: vmessage
          });
          console.log("vmessage", vmessage);
        }
      });
    } else {
      // Using cookies
      if (!validateSession(req)) {
        res.status(403).end();
        return;
      }
      owner = sanitka.owner(req.session.owner);
      implementation(owner, req.body.changes, res);
    }
  });


  // Mesh Editing

  // Uses session owner as authentication
  app.get("/api/mesh/list", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);
    if (owner == null) {
      respond(res, {
        success: false,
        reason: "OWNER_MISSING"
      });
      return;
    }
    
    user.listMeshes(req.session.owner, (success, mesh_ids) => {
      respond(res, {
        success: success,
        mesh_ids: mesh_ids
      });
    });
  });

  // Uses session owner in body, should require API Key authentication
  app.post("/api/mesh/list", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner_id = sanitka.owner(req.body.owner_id);
    if (owner_id == null) {
      respond(res, {
        success: false,
        reason: "OWNER_INVALID"
      });
      return;
    }

    user.listMeshes(owner_id, (success, mesh_ids) => {
      console.log("B list success:", success, "ids", mesh_ids);
      respond(res, {
        success: success,
        mesh_ids: mesh_ids
      });
    });
  });


  app.post("/api/mesh/create", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    if (typeof (req.body) === "undefined") {
      respond(res, { success: false, status: "Request body missing." });
      return;
    }

    let owner_id;
    if (typeof (req.body.owner_id) === "undefined") {
      respond(res, { success: false, status: "Owner ID missing in request body." });
      return;
    } else {
      owner_id = sanitka.owner(req.body.owner_id);
    }

    let mesh_id;
    if (typeof (req.body.mesh_id) === "undefined") {
      respond(res, { success: false, status: "Mesh ID missing in request body." });
      return;
    } else {
      mesh_id = req.body.mesh_id;
    }

    let mesh_alias;
    if (typeof (req.body.alias) === "undefined") {
      mesh_alias = mesh_id;
    } else {
      mesh_alias = req.body.alias;
    }

    user.createMesh(owner_id, mesh_id, mesh_alias, function (success, response) {
      if (success) {
        respond(res, { success: success, mesh_ids: response });
      } else {
        console.log("Mesh create failed:", success, "ids", response);
        respond(res, { success: success, status: "Mesh create failed." });
      }
    });
  });

  app.post("/api/mesh/delete", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    if (typeof (req.body) === "undefined") {
      respond(res, { success: false, status: "Body missing." });
      return;
    }

    let owner_id;
    if (typeof (req.session.owner_id) !== "undefined") {
      owner_id = req.session.owner_id;
    } else {
      if (typeof (req.body.owner_id) === "undefined") {
        respond(res, { success: false, status: "Parameter owner_id missing." });
        return;
      } else {
        owner_id = sanitka.owner(req.body.owner_id);
      }
    }

    let mesh_ids = req.body.mesh_ids;
    if (typeof (req.body) === "undefined") {
      respond(res, { success: false, status: "Parameter mesh_ids missing in request body." });
      return;
    }

    user.deleteMeshes(owner_id, mesh_ids, function (success, status) {
      respond(res, { success: success, status: status });
    });

  });

  // <-- End of Mesh Support

  /*
   * Builder
   */

  let existing_sockets = {};

  // Build respective firmware and notify target device(s
  app.post("/api/build", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end(); // Forbidden
      return;
    }

    // Input validation
    let unsafe_build = req.body.build;

    if (typeof (unsafe_build) === "undefined") {
      res.status(400).end(); // Invalid Request
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    let udid = sanitka.udid(unsafe_build.udid);
    let source_id = sanitka.udid(unsafe_build.source_id);

    if ((owner == null) || (udid == null) || (source_id == null)) {
      res.status(304).end(); // Not Modified
      console.log("[warning] [build] rejecting request for invalid input");
      return;
    }

    let socket = null;
    if (typeof (existing_sockets) !== "undefined") {
      console.log("app._ws owner:", req.session.owner);
      let sowner = sanitka.owner(req.session.owner);
      if ((typeof (sowner) !== "undefined") && (sowner !== null)) {
        let xocket = existing_sockets[sowner];
        if ((typeof (xocket) !== "undefined")) {
          socket = xocket;
        }
      } else {
        console.log("[debug] SOWNER null");
      }
    }

    console.log("app has", Object.keys(existing_sockets).count, "existing_sockets registered.");

    var notifiers = {
      messenger: app.messenger,
      websocket: socket || null
    };


    let dryrun = false;
    if (typeof (unsafe_build.dryrun) !== "undefined" && unsafe_build.dryrun === true) {
      dryrun = true;
    }
    let safe_build = {
      udid: udid,
      source_id: source_id,
      dryrun: dryrun
    };
    let next_worker = app.queue.nextAvailableWorker();
    if (next_worker === false) {
      console.log("No swarm workers found.");
      // should only add to queue if there are no workers available (which should not, on running build...)
      app.queue.add(udid, source_id, owner, () => {
        respond(res, { status: true, result: "queued" });
      });
    } else {
      console.log("Next available worker: ", next_worker);
      let callback = function (success, response) {
        respond(res, response);
      };

      app.builder.build(
        owner,
        safe_build,
        notifiers,
        callback,
        next_worker
      );
    }
  });

  // should be under /api
  app.post("/api/device/envelope", function (req, res) {
    let udid = sanitka.udid(req.body.udid);
    let owner = sanitka.owner(req.session.owner);
    if ((typeof (udid) === "undefined") || (typeof (owner) === "undefined")) {
      respond(res, "{}");
    } else {
      let envelope = deployment.latestFirmwareEnvelope(owner, udid);
      respond(res, JSON.stringify(envelope));
    }
  });

  // Get build artifacts
  app.post("/api/device/artifacts", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var udid = sanitka.udid(req.body.udid);
    var build_id = sanitka.udid(req.body.build_id);

    if (!udid) {
      respond(res, {
        success: false,
        status: "missing_udid"
      });
      return;
    }

    if (!build_id) {
      respond(res, {
        success: false,
        status: "missing_build_id"
      });
      return;
    }

    const artifact_data = deployment.artifact(owner, udid, build_id);

    if (artifact_data.length > 0) {
      res.header("Content-Disposition", "attachment; filename=\"" + build_id + ".zip\"");
      res.header("Content-Type", "application/zip");
      respond(res, artifact_data);
    } else {
      respond(res, {
        success: false,
        status: "artifact_not_found"
      });
    }

  });

  /*
   * Build and Audit Logs
   */

  /* Returns all audit logs per owner */
  app.get("/api/user/logs/audit", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);

    alog.fetch(owner, (err, body) => {

      if (err !== false) {
        console.log(err);
        respond(res, {
          success: false,
          status: "log_fetch_failed",
          error: err.message
        });
      } else {
        if (!body) {
          console.log("Log for owner " + owner + " not found.");
          respond(res, {
            success: false,
            status: "log_fetch_failed"
          });
        } else {
          respond(res, {
            success: true,
            logs: body
          });
        }
      }
    });
  });

  /* Returns list of build logs for owner */
  app.get("/api/user/logs/build/list", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = req.session.owner;

    if (typeof (owner) === "undefined") {
      respond(res, {
        success: false,
        status: "session_failed"
      });
      return;
    }

    blog.list(sanitka.owner(owner), (err, body) => {

      var builds = [];

      if (err) {
        console.log("err: " + err);
        respond(res, {
          success: false,
          status: "build_list_failed",
          error: err.message
        });
        return;
      }

      if (!body) {
        console.log("Log for owner " + owner + " not found.");
        respond(res, {
          success: false,
          status: "build_list_empty"
        });
        return;
      }

      // SIDE-EFFECT FROM HERE, MOVE INTO BUILDLIB! - >dcl
      for (var bindex in body.rows) {

        var row = body.rows[bindex];
        var buildlog = row.value;
        var log = buildlog.log;

        if (typeof (log) === "undefined") {
          console.log("Warning, build has no saved log!");
          if (typeof (body.value) === "undefined") {
            console.log("[build list] IGNORED Invalid buildlog body value in", body, "using", buildlog);
          }
          var build = {
            date: buildlog.timestamp,
            udid: buildlog.udid
          };
          console.log("exporting", { build });
          builds.push(build);
        } else {
          let timestamp = 0;
          let latest = log[0];
          for (var logline of log) {
            if (logline.timestamp > timestamp) {
              latest = logline;
              timestamp = logline.timestamp;
            }
          }
          buildlog.log = [latest];
          builds.push(buildlog);
        }
      }
      // < - SIDE-EFFECT UP UNTIL HERE, MOVE INTO BUILDLIB!

      respond(res, {
        success: true,
        builds: builds
      });

    });
  });

  /* Convenience adapter for log rows */
  var getLogRows = function (body) {
    var logs = [];
    for (var lindex in body.rows) {
      const item = body.rows[lindex];

      // check if the record has a value, otherwise skip
      var hasValueProperty = Object.prototype.hasOwnProperty.call(item, "value");
      if (!hasValueProperty) continue;

      // check if the value contains log, otherwise skip
      var hasLogProperty = Object.prototype.hasOwnProperty.call(item.value, "log");
      if (!hasLogProperty) continue;

      logs.push(item.value.log);
    }
    return logs;
  };

  /* Returns specific build log for owner */

  // new version for new UI
  app.get("/api/user/logs/build/:build_id", function (req, res) {
    
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);

    if (typeof (req.params.build_id) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_build_id"
      });
      return;
    }

    var build_id = sanitka.udid(req.params.build_id);

    if (build_id == null) {
      respond(res, {
        success: false,
        status: "invalid_build_id"
      });
      return;
    }

    blog.fetch(build_id, (err, body) => {
      if (err) {
        console.log("blog fetch error:", err);
        respond(res, {
          success: false,
          status: "build_fetch_failed",
          error: err.message
        });
        return;
      }
      if (!body) {
        console.log(`[info] Log for owner ${owner} not found with error ${err}`);
        respond(res, {
          success: false,
          status: "build_fetch_empty",
          error: "log not found"
        });
        return;
      }
      const logs = getLogRows(body);
      console.log("[info] NEW Build-logs for build_id " + build_id + ": " + JSON.stringify(logs));
      body.success = true;
      respond(res, body);
    });
  });

  // old version
  app.post("/api/user/logs/build", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    if (typeof (req.body.build_id) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_build_id"
      });
      return;
    }

    var build_id = sanitka.udid(req.body.build_id);

    if (!build_id) {
      respond(res, {
        success: false,
        status: "invalid_build_id"
      });
      return;
    }

    blog.fetch(build_id, (err, body) => {
      if (err) {
        console.log("blog fetch error:", err);
        respond(res, {
          success: false,
          status: "build_fetch_failed",
          error: err.message
        });
        return;
      }
      if (!body) {
        console.log("Log for owner " + owner + " not found with error", err);
        respond(res, {
          success: false,
          status: "build_fetch_empty",
          error: "log not found"
        });
        return;
      }
      const logs = getLogRows(body);
      console.log("Build-logs for build_id " + build_id + ": " + JSON.stringify(logs));
      body.success = true;
      respond(res, body);
    });
  });



  /*
   * Device Transfer
   */

  var transferResultRedirect = function (success, res, response) {
    if (success === false) {
      res.redirect(app_config.acl_url + "/error.html?success=failed&reason=" + response);
    } else {
      res.redirect(app_config.acl_url + "/error.html?success=true");
    }
  };

  /* Request device transfer */
  app.post("/api/transfer/request", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    transfer.request(owner, req.body, function (success, response) {
      transferResultRedirect(success, res, response);
    });
  });

  /* Decline device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/decline", function (req, res) {
    if (typeof (req.query.transfer_id) !== "undefined") {
      respond(res, {
        success: false,
        status: "transfer_id missing"
      });
      return;
    }
    var body = {
      transfer_id: req.query.transfer_id,
      udids: []
    };
    transfer.decline(body, function (success, response) {
      transferResultRedirect(success, res, response);
    });
  });

  /* Decline selective device transfer */
  app.post("/api/transfer/decline", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    if (typeof (req.body.transfer_id) !== "undefined") {
      respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    if (typeof (sanitka.udid(req.body.udid)) !== "undefined") {
      respond(res, {
        success: false,
        status: "udids_missing"
      });
      return;
    }

    if (typeof (req.body.owner) === "undefined") {
      respond(res, {
        success: false,
        status: "owner_missing"
      });
      return;
    }

    var body = {
      transfer_id: req.body.transfer_id,
      udids: sanitka.udid(req.body.udid)
    };

    transfer.decline(body, function (success, response) {
      transferResultRedirect(success, response, res);
    });
  });

  /* Accept device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/accept", function (req, res) {

    if (typeof (req.query.transfer_id) === "undefined") {
      respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    var body = {
      transfer_id: req.query.transfer_id,
      udids: []
    };

    // asyncCall
    transfer.accept(body, function (success, response) {
      transferResultRedirect(success, res, response);
    });
  });

  /* Accept selective device transfer */
  app.post("/api/transfer/accept", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    if (typeof (sanitka.udid(req.body.transfer_id)) !== "undefined") {
      respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    if (typeof (sanitka.owner(req.body.owner)) === "undefined") {
      respond(res, {
        success: false,
        status: "owner_missing"
      });
      return;
    }

    if (typeof (sanitka.udid(req.body.udid)) !== "undefined") {
      respond(res, {
        success: false,
        status: "udids_missing"
      });
      return;
    }

    // asyncCall
    transfer.accept(req.body, function (success, response) {
      if (success === false) {
        console.log(response);
        res.redirect(app_config.acl_url + "/error.html?success=failed");
      } else {
        res.redirect(app_config.acl_url + "/error.html?success=true");
      }
    });
  });

  /*
   * Authentication
   */

  var needsGDPR = function (doc) {
    var gdpr = false;
    if (typeof (doc.info) !== "undefined") {
      if (typeof (doc.gdpr_consent) !== "undefined" && doc.gdpr_consent === true) {
        gdpr = true;
      }
    }
    return gdpr;
  };

  var updateLastSeen = function (doc) {
    userlib.atomic("users", "checkin", doc._id, {
      last_seen: new Date()
    }, function (error, response) {
      if (error) {
        if (error.toString().indexOf("conflict") !== -1) {
          console.log("[warning] [conflict] Last-seen update retry...");
          delete doc._rev;
          updateLastSeen(doc);
        } else {
          console.log("Last-seen update failed (1): ", error, response);
        }
      }
    });
  };

  // this is more like performTokenLogin or performLoginWithToken...
  function performOAuthLogin(req, res, oauth) {

    redis_client.get(oauth, function (err, userWrapper) {
      if (err) {
        console.log("[oauth] takeover failed");
        failureResponse(res, 403, "unauthorized");
      } else {

        var wrapper = JSON.parse(userWrapper);

        let owner_id;

        if ((typeof (wrapper) !== "undefined") && wrapper !== null) {
          owner_id = wrapper.owner;
        } else {
          console.log("[login] user wrapper error: ", { userWrapper });
          if (wrapper === null) {
            failureResponse(res, 403, "wrapper error");
            return;
          }
        }

        // If the wrapper exists, user is valid. It is either to be created, or already exists.

        userlib.get(owner_id, function (gerr, doc) {

          req.session.owner = owner_id;

          if (gerr) {

            // Support for creating accounts to non-existent e-mails automatically
            console.log("[oauth] owner_id", owner_id, "get with error", gerr);

            // creates owner _only_ if does not exist!
            user.create(wrapper, false, res, (response, success, status) => {

              console.log("Result creating OAuth user:", success, status);
              console.log(`[OID:${req.session.owner}] [NEW_SESSION] [oauth] 1824: `);

              req.session.owner = wrapper.owner;
              req.session.cookie.maxAge = fortnight;

              let logline = `OAuth User created: ${wrapper.first_name} ${wrapper.last_name}`;
              console.log(logline);
              alog.log(owner_id, logline);
            });

          } else {

            // no error when getting username
            req.session.cookie.maxAge = 24 * hour; // should be max 3600 seconds

            console.log(`[OID:${owner_id}] [NEW_SESSION] [oauth]`);

            if ((typeof (req.body.remember) === "undefined") ||
              (req.body.remember === 0)) {
              req.session.cookie.maxAge = 24 * hour;
            } else {
              req.session.cookie.maxAge = fortnight;
            }

            alog.log(owner_id, "OAuth User logged in: " + doc.username, "info");

            updateLastSeen(doc);

          }

          if (Globals.use_sqreen()) {
            Sqreen.auth_track(true, { username: owner_id });
          }

          req.session.cookie.name = "x-thx-core";
          req.session.cookie.secure = false;  // allows HTTP login
          req.session.cookie.httpOnly = true;

          console.log("[debug] redirecting with session", JSON.stringify(req.session));

          respond(res, { "redirectURL": "/app" });
        });
      }
    });
  }

  function willSkipGDPR(user_data) {
    var skip_gdpr_page = false;
    if (typeof (user_data.gdpr_consent) === "undefined") {
      skip_gdpr_page = true;
    } else {
      skip_gdpr_page = user_data.gdpr_consent;
    }
    return skip_gdpr_page;
  }

  function newTokenWithUserData(user_data) {
    let token = sha256(user_data.email + ":" + user_data.activation_date);
    redis_client.set(token, JSON.stringify(user_data)); // data copy, should expire soon or be deleted explicitly after use
    redis_client.expire(token, 60);
    return token;
  }

  function respondRedirectWithToken(req, res, user_data) {

    if (typeof (user_data.owner) !== "undefined") {
      if (req.session.owner !== user_data.owner) {
        console.log("⚠️ [warning] Overriding req.session.owner from to prevent client-side injection.");
        req.session.owner = user_data.owner;
      }
    }

    if (typeof (req.session.owner) === "undefined") {
      failureResponse(res, 403, "unauthorized");
      req.session.destroy(function (err) {
        if (err) {
          console.log("⚠️ [warning] Session destroy error: " + err);
        }
      });
    }

    let token = newTokenWithUserData(user_data);
    let redirectURL = app_config.acl_url + "/auth.html?t=" + token + "&g=" + willSkipGDPR(user_data);

    // Finally, add JWT token which should replace the t=token or auth.html will deprecate...
    login.sign(user_data.owner, (jwt_token) => {
      respond(res, {
        "status": "OK",
        "success": true,
        "access_token": jwt_token,
        "redirectURL": redirectURL
      });
    });
  }

  function allowDebugHTTPLogin(req, res) {
    if (typeof (app_config.debug.allow_http_login) !== "undefined" && app_config.debug.allow_http_login === false) {
      if (req.protocol !== "https") {
        console.log("⚠️ [warning] HTTP rejected for login (set app_config.debug.allow_http_login = true to override for development or on-prem install).");
        res.status(403).end();
        return false;
      }
    }
    return true;
  }

  function rejectLogin(req, user_data, password, stored_response) {

    if (typeof (user_data) === "undefined" || (user_data === null) || (user_data === false)) {
      console.log("☣️ [error] [LOGIN_INVALID] [/api/login] No user_data");
      failureResponse(stored_response, 403, "invalid_credentials");
      return true;
    }

    // Exit when user is marked as deleted but not destroyed yet
    var deleted = user_data.deleted;
    if ((typeof (deleted) !== "undefined") && (deleted === true)) {
      console.log("ℹ️ [info] [LOGIN_INVALID] user deleted.");
      failureResponse(stored_response, 403, "user_account_deactivated");
      return true;
    }

    // Exit early on invalid password
    if (password.indexOf(user_data.password) === -1) {
      var p = user_data.password;
      if (typeof (p) === "undefined" || p === null) {
        console.log(`⚠️ [warning] [LOGIN_INVALID] (not activated/no password) ${user_data}!`);
        alog.log(req.session.owner, "Password missing");
        respond(stored_response, {
          status: "password_missing",
          success: false
        });
      } else {
        console.log("⚠️ [warning] [LOGIN_INVALID] Password mismatch.");
        alog.log(req.session.owner, "Password mismatch.");
        respond(stored_response, {
          status: "password_mismatch",
          success: false
        });
      }
      return true;
    }

    return false;
  }

  function checkMqttKeyAndLogin(req, cached_response, user_data) {

    user.mqtt_key(user_data.owner, function (success, key) {
      if (!success) {
        // Default MQTT key does not exist, create new one and try again 
        console.log("🔨 [debug] [api/login] Pre-creating default mqtt key...", key);
        user.create_default_mqtt_apikey(user_data.owner, () => {
          checkMqttKeyAndLogin(req, cached_response, user_data);
        });
        return;
      }
      // mqtt key found, refreshing ACLs...
      user.create_default_acl(user_data.owner, () => {
        console.log(`ℹ️ [info] Refreshed owner default ACLs for ${user_data.owner}`);
        // audit
        trackUserLogin(user_data.owner);
        respondRedirectWithToken(req, cached_response, user_data);
      });
    });
  }

  // Front-end authentication, returns session on valid authentication
  app.post("/api/login", function (req, res) {

    if (!allowDebugHTTPLogin(req, res)) return;

    //
    // OAuth-like Login
    //

    var token = req.body.token;

    if ((typeof (token) !== "undefined") && (token !== null)) {
      performOAuthLogin(req, res, token);
      return;
    }

    //
    // Username/password login Variant (with local token)
    //

    var username = sanitka.username(req.body.username);
    var password = sha256(prefix + req.body.password);

    // Search the user in DB, should search by key and return one only
    user.validate(username, (db_body) => {

      if (typeof (db_body.rows) === "undefined") {
        console.log("⚠️ [warning] No body rows returned on login while validating username", username); // in case DB is broken
        failureResponse(res, 403, "invalid_credentials");
        return;
      }

      // console.log("[debug] login user data", db_body);

      let user_data = db_body.rows[0].value || null;

      if (rejectLogin(req, user_data, password, res)) return;

      let full_domain = app_config.api_url;
      let full_domain_array = full_domain.split(".");
      delete full_domain_array[0];
      let short_domain = full_domain_array.join('.');

      let maxAge;

      if (typeof (req.session) !== "undefined") {
        req.session.owner = user_data.owner;
        if ((typeof (req.body.remember) === "undefined") || (req.body.remember === 0)) {
          maxAge = 8 * hour;
        } else {
          maxAge = fortnight;
        }
      }

      req.session.cookie.maxAge = maxAge;
      res.cookie("x-thx-core", maxAge, {
        maxAge: maxAge,
        httpOnly: false,
        secure: false,
        domain: short_domain
      });

      alog.log(user_data.owner, "User logged in: " + username);
      checkMqttKeyAndLogin(req, res, user_data);
    });
  });

  // Front-end authentication, destroys session on valid authentication
  app.get("/api/logout", function (req, res) {
    if (typeof (req.session) !== "undefined") {
      req.session.destroy(function (err) {
        if (err) {
          console.log(err);
        }
      });
    }
    // Redirect to login page, must be on same CORS domain (acl_url must be == public_url)...
    res.redirect(app_config.public_url);
  });

  /*
   * Statistics
   */

  /* Returns all audit logs per owner */
  app.get("/api/user/stats", function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);

    stats.week(owner, (success, body) => {

      if (!body) {
        console.log("Statistics for owner " + owner +
          " not found.");
        respond(res, {
          success: false,
          status: "no_results"
        });
        return;
      }

      if (!success) {
        respond(res, {
          success: false,
          status: body
        });
        return;
      }

      if (Validator.isJSON(body)) {
        body = JSON.parse(body);
      }

      respond(res, {
        success: true,
        stats: body
      });
    });
  });

  /*
   * Chat
   */

  /* Websocket to Slack chat */

  app.post("/api/user/chat", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var message = req.body.message;
    app.messenger.slack(owner, message, function (err, response) {
      if (err) {
        let errString = err.toString();
        console.log(`[OID:${owner}] Chat message failed with error ${errString}`);
      } else {
        console.log(`[OID:${owner}] Chat message sent.`);
      }
      respond(res, {
        success: !err,
        status: response
      });
    });
  });

  /*
   * Device Configuration
   */

  /* Push configuration to one or more devices */
  app.post("/api/device/push", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    devices.push(owner, req.body, (push_success, push_response) => {
      respond(res, {
        success: push_success,
        status: push_response
      });
    });
  });

  /*
   * Actionable Notifications
   */

  /* Respond to actionable notification */
  app.post("/api/device/notification", function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var device_id = sanitka.udid(req.body.udid);
    var reply = req.body.reply;
    if ((typeof (device_id) === "undefined") || (device_id == null)) {
      respond(res, {
        success: false,
        status: "missing_udid"
      });
      return;
    }
    if ((typeof (reply) === "undefined") || (reply == null)) {
      respond(res, {
        success: false,
        status: "missing_reply"
      });
      return;
    }
    app.messenger.publish(owner, device_id, JSON.stringify({
      nid: "nid:" + device_id,
      reply: reply
    }));
    respond(res, {
      success: true,
      status: "published"
    });
  });

  /*
   * Slack OAuth Integration
   */

  // TODO: Convert SLACK_CLIENT_ID to env-var and configure externally so it does not reside in cleartext config flatfil
  app.get("/api/slack/direct_install", function (req, res) {
    const slack_client_id = app_config.slack.client_id || null;
    res.redirect(
      "https://slack.com/oauth/authorize?client_id=" + slack_client_id + "&scope=bot&state=Online&redirect_uri=" + app_config.api_url + "/api/slack/redirect"
    );
  });

  app.get("/api/slack/redirect", function (req, xres) {

    console.log("[debug] [slack] Redirect URL: " + JSON.stringify(req.url));
    console.log("[debug] [slack] Redirect Code: " + req.query.code);
    console.log("[debug] [slack] Redirect State: " + req.query.state);

    const slack_client_secret = app_config.slack.client_secret || null;
    const slack_client_id = app_config.slack.client_id || null;

    var options = {
      protocol: 'https:',
      host: 'slack.com',
      hostname: 'slack.com',
      port: 443,
      path: '/api/oauth.access?client_id=' + slack_client_id + '&client_secret=' + slack_client_secret + '&redirect_uri=' + app_config.api_url + '/slack/redirect&scope=bot&code=' +
        req.query.code
    };

    var areq = https.get(options, function (res) {

      // console.log("[debug] [slack] /redirect GET status", res.statusCode); == 200

      var bodyChunks = [];
      if (typeof (res) === "undefined" || (res == null) || res.statusCode == 403) {
        console.log("[debug] [slack] No response.");
        return;
      }

      res.on('data', function (chunk) {
        if (typeOf(chunk) !== "number") {
          bodyChunks.push(chunk);
        }

      }).on('end', function () {
        var body = Buffer.concat(bodyChunks);
        console.log('[debug] [slack] Incoming BODY: ' + body);
        // ...and/or process the entire body here.
        try {
          var auth_data = JSON.parse(body);
          var token = auth_data.bot_access_token;
          if (typeof (token) !== "undefined") {
            redis_client.set("__SLACK_BOT_TOKEN__", token);
            console.log(`ℹ️ [info] Saving new Bot token ${token}`);
          }
          // may also return {"ok":false,"error":"invalid_code"} in test
        } catch (e) {
          console.log("[error] parsing Slack token");
        }
      });
    });

    areq.on('error', function (e) {
      console.log('[debug] [slack] ERROR: ' + e.message);
    });

    xres.redirect(
      "https://" + process.env.WEB_HOSTNAME + "/app/#/profile/help"
    );

  });

  /*
   * OAuth 2 with GitHub
   */

  function secureGithubCallbacks(original_response) {

    if (typeof (githubOAuth) === "undefined") {
      console.log("[critical] [githubOAuth] undefined on secure! attempting to fix...");

      try {
        let specs = {
          githubClient: process.env.GITHUB_CLIENT_ID,
          githubSecret: process.env.GITHUB_CLIENT_SECRET,
          baseURL: github_ocfg.base_url, // should be rather gotten from global config!
          loginURI: '/api/oauth/github',
          callbackURI: '/api/oauth/github/callback',
          scope: 'user'
        };
        githubOAuth = require('./thinx/oauth-github.js')(specs);
      } catch (e) {
        console.log(`[debug] [oauth] [github] github_ocfg init error: ${e}`);
      }
    }

    githubOAuth.on('error', (err) => {
      console.error('[debug] [oauth] [github] there was a login error', err);
      if (process.env.ENVIRONMENT == "test")
        if (typeof (original_response) !== "undefined") original_response.end("test-ok");
    });

    githubOAuth.on('token', (oauth_token_string/* , resp, _res, req */) => {

      let oauth_token_array = oauth_token_string.split("&");
      let access_token = oauth_token_array[0].replace("access_token=", "");

      console.log("[debug] [oauth] [github] access_token", access_token);

      if (typeof (access_token) === "undefined") {
        console.log("[debug] [github] [token] No token, exiting.");
        return;
      }

      var request_options = {
        host: 'api.github.com',
        port: 443,
        path: '/user',
        headers: {
          'User-Agent': 'THiNX', // Application name from GitHub / Settings / Developer Settings
          'Authorization': 'token ' + access_token,
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      console.log("[debug] [github] [token] getting user info with", { request_options });

      https.get(request_options, (res) => {

        var data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        // The whole response has been received. Print out the result.
        res.on('end', () => {

          var token = "ghat:" + access_token;
          var given_name;
          var family_name = "User";
          var hdata = JSON.parse(data);

          if ((typeof (hdata.name) !== "undefined") && hdata.name !== null) {
            if (hdata.name.indexOf(" ") > -1) {
              var in_name_array = hdata.name.split(" ");
              given_name = in_name_array[0];
              family_name = in_name_array[in_name_array.count - 1];
            } else {
              given_name = hdata.name;
            }
          } else {
            family_name = hdata.login;
            given_name = hdata.login;
            console.log("[debug] [github] [token] Warning: no name in GitHub access token response, using login: ", { hdata }); // logs personal data in case the user has no name!
          }

          var owner_id = null;
          var email = hdata.email;

          if (typeof (email) === "undefined" || email === null) {
            console.log("[debug] [github] [token] Error: no email in response, should login without activation.");
            email = hdata.login;
          }

          try {
            owner_id = sha256(prefix + email);
          } catch (e) {
            console.log("☣️ [error] [github] [token] error parsing e-mail: " + e + " email: " + email);
            res.redirect(
              app_config.public_url + '/error.html?success=failed&title=Sorry&reason=Missing%20e-mail.'
            );
            return;
          }

          var userWrapper = {
            first_name: given_name,
            last_name: family_name,
            email: email,
            owner: owner_id,
            username: owner_id
          };

          console.log("[debug] [github] [token] validateGithubUser with GitHub Access token:", token);

          validateGithubUser(original_response, token, userWrapper);

        }); // res.end
      }); // https.get
    });
  }

  // Initial page redirecting to OAuth2 provider
  app.get('/api/oauth/github', function (req, res) {
    if (typeof (req.session) !== "undefined") {
      console.log("[debug] /api/oauth/github will destroy old session...");
      req.session.destroy();
    }
    if (typeof (githubOAuth) !== "undefined") {
      githubOAuth.login(req, res);
    } else {
      res.status(400).end();
    }
  });

  /// CALLBACK FOR GITHUB OAUTH ONLY!

  // Callback service parsing the authorization token and asking for the access token
  app.get('/api/oauth/github/callback', function (req, res) {

    if (typeof (githubOAuth) === "undefined") {

      console.log("[critical] [githubOAuth] undefined on secure! attempting to fix...");

      try {
        let specs = {
          githubClient: process.env.GITHUB_CLIENT_ID,
          githubSecret: process.env.GITHUB_CLIENT_SECRET,
          baseURL: github_ocfg.base_url, // should be rather gotten from global config!
          loginURI: '/api/oauth/github',
          callbackURI: '/api/oauth/github/callback',
          scope: 'user'
        };
        githubOAuth = require('./thinx/oauth-github.js')(specs);
      } catch (e) {
        console.log(`[debug] [oauth] [github] github_ocfg init error: ${e}`);
      }
    }

    secureGithubCallbacks(res); // save original response to callbacks in this code path... when callback is called, response is used to reply
    if (githubOAuth.callback === "function") {
      githubOAuth.callback(req, res);
    } else {
      console.log("[warning] githubOAuth.callback(req, res); is not a function");
      res.status(401).end();
    }
  });

  /*
   * OAuth 2 with Google
   */

  function createUserWithGoogle(req, ores, odata, userWrapper, access_token) {
    console.log("Creating new user...");

    // No e-mail to validate.
    var will_require_activation = true;
    if (typeof (odata.email) === "undefined") {
      will_require_activation = false;
    }

    // No such owner, create...
    user.create(userWrapper, will_require_activation, ores, (/*res, success, status*/) => {

      console.log("[OID:" + req.session.owner + "] [NEW_SESSION] [oauth] 2860:");

      alog.log(req.session.owner, "OAuth User created: " + userWrapper.given_name + " " + userWrapper.family_name);

      // This is weird. Token should be random and with prefix.
      var gtoken = sha256(access_token); // "g:"+
      redis_client.set(gtoken, JSON.stringify(userWrapper));
      redis_client.expire(gtoken, 300);
      alog.log(req.session.owner, " OAuth2 User logged in...");

      var token = sha256(access_token); // "o:"+
      redis_client.set(token, JSON.stringify(userWrapper));
      redis_client.expire(token, 3600);

      const ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=true"; // require GDPR consent
      console.log(ourl);
      ores.redirect(ourl);
    });
  }

  function failOnDeletedAccountDocument(error, ores) {
    // User does not exist
    if (error.toString().indexOf("Error: deleted") !== -1) {
      // Redirect to error page with reason for deleted documents
      console.log("[processGoogleCallbackError][oauth] user document deleted");
      ores.redirect(app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=account_doc_deleted');
      return true;
    }
    return false;
  }

  function failOnDeletedAccount(udoc, ores) {
    if (typeof (udoc) === "undefined") return false;
    if ((typeof (udoc.deleted) !== "undefined") && udoc.deleted === true) {
      console.log("[processGoogleCallbackError][oauth] user account marked as deleted");
      ores.redirect(
        app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=account_deleted'
      );
      return true;
    }
    return false;
  }

  function processGoogleCallbackError(error, ores, udoc, req, odata, userWrapper, access_token) {

    if (failOnDeletedAccountDocument(error, ores)) return;
    if (failOnDeletedAccount(udoc, ores)) return;

    console.log("[processGoogleCallbackError] Userlib get OTHER error: " + error.toString());

    // In case the document is undefined (and identity confirmed by Google), create new one...
    if (typeof (udoc) === "undefined" || udoc === null) {
      console.log("Setting session owner from Google User Wrapper...");
      req.session.owner = userWrapper.owner;
      console.log("[OID:" + req.session.owner + "] [NEW_SESSION] on UserWrapper /login");
      createUserWithGoogle(req, ores, odata, userWrapper, access_token);
    }
  }

  // Initial page redirecting to OAuth2 provider
  app.get('/api/oauth/google', function (req, res) {
    // User requested login, destroy existing session first...
    if (typeof (req.session) !== "undefined") {
      req.session.destroy();
    }
    require("crypto").randomBytes(48, (err, buffer) => {
      var token = buffer.toString('hex');
      redis_client.set("oa:google:" + token, 60); // auto-expires in 1 minute; TODO: verify
      const authorizationUri = oauth2.authorizationCode.authorizeURL({
        redirect_uri: google_ocfg.web.redirect_uris[0],
        scope: 'email',
        state: sha256(token) // returned upon auth provider call back
      });
      res.redirect(authorizationUri);
    });
  });

  app.get('/api/oauth/google/callback', async (req, res) => {

    const code = req.query.code;
    if (typeof (code) !== "string") {
      res.set(403).end();
      return;
    } else {
      if (code.length > 255) {
        res.set(403).end();
        return; // should not DoS the regex now; lgtm [js/type-confusion-through-parameter-tampering]
      }
    }

    const options = {
      code,
      redirect_uri: google_ocfg.web.redirect_uris[0]
    };

    const result = await oauth2.authorizationCode.getToken(options);
    const accessToken = oauth2.accessToken.create(result);
    const gat_url = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=' + accessToken.token.access_token;

    https.get(gat_url, (res3) => {

      let data = '';
      res3.on('data', (chunk) => { data += chunk; });
      res3.on('end', () => {

        const odata = JSON.parse(data);
        const email = odata.email;

        if (typeof (email) === "undefined") {
          res.redirect(
            app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
            'E-mail missing.'
          );
          return;
        }

        const family_name = odata.family_name;
        const given_name = odata.given_name;
        const owner_id = sha256(prefix + email);

        var userWrapper = {
          first_name: given_name,
          last_name: family_name,
          email: email,
          owner: owner_id,
          username: owner_id
        };

        // Check user and make note on user login
        userlib.get(owner_id, function (error, udoc) {
          if (error) {
            // may also end-up creating new user
            processGoogleCallbackError(error, res, udoc, req, odata, userWrapper, accessToken);
            return;
          }
          trackUserLogin(owner_id);
          updateLastSeen(udoc);
          alog.log(owner_id, "OAuth2 User logged in...");
          var token = sha256(accessToken.token.access_token);
          redis_client.set(token, JSON.stringify(userWrapper));
          redis_client.expire(token, 3600);
          const ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=" + needsGDPR(udoc); // require GDPR consent
          res.redirect(ourl);
        });
      });
    }).on("error", (err) => {
      console.log("Error: " + err.message);
      // deepcode ignore OR: there is noting injected in the URL
      res.redirect(
        app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=' +
        err.message);
    });
  });

  /* 
   * GDPR
   */

  /* Use to issue/withdraw GDPR consent. */
  app.post('/api/gdpr', function (req, res) {

    var gdpr_consent = req.body.gdpr_consent;
    var token = req.body.token;

    if (typeof (gdpr_consent) === "undefined" || gdpr_consent === null) {
      respond(res, {
        success: false,
        status: "consent_missing"
      });
      console.log("[debug] request is missing consent");
      return;
    }

    if (typeof (token) === "undefined" || token === null) {
      respond(res, {
        success: false,
        status: "token_missing"
      });
      console.log("[debug] request is missing token");
      return;
    }

    redis_client.get(token, function (err, userWrapper) {

      if (err) {
        console.log("[oauth][gdpr] takeover failed with error", err);
        failureResponse(res, 403, "unauthorized");
        return;
      }

      var wrapper = JSON.parse(userWrapper);
      if (typeof (wrapper) === "undefined" || wrapper === null) {
        respond(res, {
          success: false,
          status: "handover_failed"
        });
        console.log("Not found wrapper", userWrapper, "for token", token);
        return;
      }
      const owner_id = wrapper.owner;
      console.log("[login][oauth] fetching owner: " + owner_id);

      // eslint-disable-next-line no-unused-vars
      userlib.get(owner_id, function (gerr, doc) {
        if (gerr) {
          respond(res, {
            success: false,
            status: "gdpr_consent_failed"
          });
        } else {

          var changes = {
            gdpr_consent: req.body.gdpr_consent
          };

          // Mark user document as deleted with this change in case of no consent
          if (gdpr_consent === false) {
            changes['delete'] = true;
          }

          // Edit and save user's GDPR consent
          user.update(owner_id, req.body, function (success, status) {
            console.log("Updating GDPR settings...");
            respond(res, {
              success: success,
              status: status
            });
          });
        }
      });
    });

    // Logout or redirect to dashboard...

  });

  /* Used to transfer user data to user in compliance with GDPR. */
  app.post('/api/gdpr/transfer', function (req, res) {

    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }

    var owner_id = sanitka.owner(req.session.owner);
    if (owner_id === null) {
      respond(res, {
        success: false,
        status: "invalid owner"
      });
      return;
    }
    userlib.get(owner_id, function (error, udoc) {
      if (error) {
        console.log("/api/gdpr/transfer error", error);
        respond(res, {
          success: false,
          status: "unexpected error"
        });
        return;
      }
      devices.list(owner_id, function (dsuccess, ddevices) {
        apienv.list(owner_id, function (esuccess, envs) {
          respond(res, {
            success: !error && dsuccess && esuccess,
            user_data: udoc,
            device_data: ddevices,
            environment: envs
          });
        });
      });
    });
  });

  /* Used to revoke user data in compliance with GDPR. */
  app.post('/api/gdpr/revoke', function (req, res) {
    if (!validateSession(req)) {
      res.status(403).end();
      return;
    }
    var owner_id = sanitka.owner(req.session.owner);
    if ((owner_id === false) || (req.body.owner !== owner_id)) {
      respond(res, {
        success: false,
        status: "deletion_not_confirmed"
      });
      return;
    }

    userlib.get(owner_id, function (error, udoc) {
      if (error) {
        console.log("unexpected /gdpr/revoke error");
        respond(res, {
          success: false,
          status: "unexpected error"
        });
      } else {

        console.log("Deleting owner " + owner_id);
        devices.list(owner_id, (dsuccess, devicez) => {
          if (dsuccess) {
            devicez.forEach(() => {
              devicez.revoke(owner_id, req.body, function (rsuccess, status) {
                respond(res, {
                  success: rsuccess,
                  status: status
                });
              });
            });
          } else {
            respond(res, {
              success: rsuccess,
              status: devicez
            });
          }
        });

        console.log("Deleting all API keys for this owner...");
        redis_client.expire("ak:" + owner_id, 1);

        redis_client.keys("/" + owner_id + "/*", function (err, obj_keys) {
          console.dir("Deleting Redis cache for this owner: " + owner_id);
          for (var key in obj_keys) {
            redis_client.expire(key, 1);
          }
        });

        userlib.destroy(udoc._id, udoc._rev, function (err) {
          if (err) {
            respond(res, {
              success: false,
              status: "Your data deletion failed. Personal data may NOT been deleted successfully. Please contact THiNX data processor in order to fix this GDPR issue for you."
            });
          } else {
            respond(res, {
              success: true,
              status: "Your personal data has been marked as deleted. It will be removed from the system completely on midnight."
            });
          }
        });

      } // endif

    });
  });

};
