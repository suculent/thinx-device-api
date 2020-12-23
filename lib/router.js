/* New Router */

module.exports = function(app) {

  var redis = require('redis');
  var typeOf = require("typeof");
  var sha256 = require("sha256");
  var https = require('https');
  var Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

  var Globals = require("./thinx/globals"); // static only!

  let Sqreen;

  if (Globals.use_sqreen()) {
    Sqreen = require('sqreen');
  }

  // Globals

  const hour = 3600 * 1000;
  const day = hour * 24;
  const fortnight = day * 14;

  // old, insecure, to be replaced
  var global_token = null;
  var global_response = null; // stored in GET /oauth/gcb; continued by checkUserWithResponse() in oauth.on.token

  // new, not implemented yet
  var global_responses = {};

  const app_config = Globals.app_config();

  var prefix = Globals.prefix();
  //const rollbar = Globals.rollbar(); // lgtm [js/unused-local-variable]
  var redis_client = redis.createClient(Globals.redis_options());

  const client_user_agent = app_config.client_user_agent;
  const google_ocfg = Globals.google_ocfg();
  const github_ocfg = Globals.github_ocfg();

  // Locals

  var slack_webhook = app_config.slack_webhook;
  var thinx_slack = require("slack-notify")(slack_webhook);

  const Validator = require('../lib/thinx/validator');

  var AuditLog = require("../lib/thinx/audit");
  var alog = new AuditLog();


  var Device = require("../lib/thinx/device");
  var device = new Device();
  console.log("Loaded module: Device");

  var Deployment = require("../lib/thinx/deployment");
  var deployment = new Deployment();
  console.log("Loaded module: Deployment");

  var APIEnv = require("../lib/thinx/apienv");
  var apienv = new APIEnv();
  console.log("Loaded module: Environments");

  var APIKey = require("../lib/thinx/apikey");
  var apikey = new APIKey();
  console.log("Loaded module: API Keys");

  var User = require("../lib/thinx/owner");
  var user = new User();
  console.log("Loaded module: Owner");

  var RSAKey = require("../lib/thinx/rsakey"); var rsakey = new RSAKey();
  console.log("Loaded module: RSAKey");

  var Stats = require("../lib/thinx/statistics");
  var stats = new Stats();
  console.log("Loaded module: Statistics");

  var Sources = require("../lib/thinx/sources");
  var sources = new Sources();
  console.log("Loaded module: Sources");

  var messenger = app.messenger; // reusing app instance of messenger

  var Devices = require("../lib/thinx/devices");
  var devices = new Devices(messenger);
  console.log("Loaded module: Devices");

  var Transfer = require("../lib/thinx/transfer");
  var transfer = new Transfer(messenger);
  console.log("Loaded module: Transfer");

  var db = app_config.database_uri;
  //var devicelib = require("nano")(db).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]
  var userlib = require("nano")(db).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]

  const Buildlog = require("../lib/thinx/buildlog"); // must be after initDBs as it lacks it now
  const blog = new Buildlog();
  console.log("Loaded module: Builder Log");
  console.log("---");


  // Functions

  //var last_client_ip = null;

  var getClientIp = function(req) {
    var ipAddress = req.ip;
    if (!ipAddress) {
      console.log("Unknown Client IP:" + ipAddress);
      return "207.154.230.212";
    }
    // convert from "::ffff:192.0.0.1"  to "192.0.0.1"
    if (ipAddress.indexOf("::ffff:") !== -1) {
      ipAddress = ipAddress.replace("::ffff:", "");
    }
    //last_client_ip = ipAddress;
    //console.log("Client IP: " + ipAddress);
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

  function failureResponse(res, code, reason) {
    res.writeHead(code, {
      "Content-Type": "application/json"
    });
    respond(res, {
      success: false,
      "status": reason
    });
  }

  // router
  function validateSecureGETRequest(req, res) {
    if (req.method !== "GET") {
      console.log("validateSecure: Not a get request." + JSON.stringify(req.query
        .params));
      req.session.destroy(function(err) {
        if (err) {
          console.log(err);
        } else {
          failureResponse(res, 500, "protocol");
        }
      });
      return false;
    }
    return true;
  }

  // router
  function validateSecurePOSTRequest(req, res) {
    if (req.method !== "POST") {
      console.log("validateSecure: Not a post request.");
      req.session.destroy(function(err) {
        if (err) {
          console.log(err);
        } else {
          failureResponse(res, 500, "protocol");
        }
      });
      return false;
    }
    return true;
  }

  // Terminates session in case it has no valid owner.

  function validateSession(req, res) {

    // no session is good as well in some cases
    if (typeof(req.session) === "undefined") return true;

    if (typeof(req.session.owner) !== "undefined") {
      let q = req.query;
      console.log("Session valid, owner defined for", {q});
      return true;
    } else {
      if (typeof(req.session) !== "undefined") {
        console.log("Session destroy on invalid owner: ", {req});
        req.session.destroy(function(err) {
          if (err) {
            console.log("Session destroy error: " + JSON.stringify(err));
          }
          res.status(401).end(); // return 401 unauthorized to XHR/API calls
        });
      }
      return false;
    }
  }



  function validateRequest(req, res) {
    // Check device user-agent
    var ua = req.headers["user-agent"];
    var validity = ua.indexOf(client_user_agent);

    if (validity === 0) {
      return true;
    } else {

      // TODO: FIXME: Replace client_user_agent string with array of options!
      //
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
  // OAuth2
  //

  const soauth = require('simple-oauth2');
  var oauth2;

  if (typeof(google_ocfg) !== "undefined" && google_ocfg !== null) {
    console.log("Initializing Simple OAuth...");
    const credentials = {
      client: {
        id: google_ocfg.web.client_id,
        secret: google_ocfg.web.client_secret,
      },
      auth: {
        tokenHost: 'https://accounts.google.com/',
        authorizePath: '/o/oauth2/auth',
        tokenPath: '/o/oauth2/token'
      },
      http: {
        json: true
      }
    };
    try {
      oauth2 = soauth.create(credentials);
    } catch(error) {
      console.log(error);
    }
  }

  //
  // OAuth2 for GitHub
  //

  var githubOAuth;
  if (typeof(github_ocfg) !== "undefined" && github_ocfg !== null) {
    //console.log("Initializing GitHub OAuth...");
    try {
      githubOAuth = require('github-oauth')({
        githubClient: github_ocfg.client_id,
        githubSecret: github_ocfg.client_secret,
        baseURL: github_ocfg.base_url, // should be rather gotten from global config!
        loginURI: '/oauth/login',
        callbackURI: github_ocfg.redirect_uri,
        scope: 'bot'
      });
    } catch (e) {
      console.log("github-oauth github_ocfg init error: " + e);
    }
  }

  function trackUserLogin(owner_id) {
     userlib.atomic("users", "checkin", owner_id, {
       last_seen: new Date()
     }, function(error, response) {
       if (error) {
         console.log("Last-seen update failed (3): " + error);
       } else {
         alog.log(owner_id, "Last seen updated.");
       }
     });

     alog.log(owner_id, "OAuth2 User logged in...");

     if (Globals.use_sqreen()) {
       Sqreen.auth_track(true, { username: owner_id });
     }
  }

  function checkUserWithResponse(response, token, userWrapper) {

    let owner_id = userWrapper.owner; // must not be nil
    console.log("[oauth][github] searching for owner with ID: ", { owner_id });

    // Check user and make note on user login
    userlib.get(userWrapper.owner, (error, udoc) => {

      global_token = token;

      // Error case covers creating new user/managing deleted account
      if (error) {

        if (Globals.use_sqreen()) {
          Sqreen.auth_track(false, { doc: owner_id });
        }

        console.log("[oauth][github] userlib.get failed with error: ", error, {udoc});

        if (error.toString().indexOf("Error: deleted") !== -1) {
          // TODO: Redirect to error page with reason
          console.log("[oauth][global_response] user document deleted");
          response.redirect(
            app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
            encodeURI('Account document deleted.')
          );
          return;
        }

        // May exist, but be deleted. Can be cleared using Filtered Replication Handler "del"
        if (typeof(udoc) !== "undefined" && udoc !== null) {
          if ((typeof(udoc.deleted) !== "undefined") && udoc.deleted === true) {
            if (Globals.use_sqreen()) {
              Sqreen.auth_track(false, { doc: owner_id });
            }
            // TODO: Redirect to error page with reason
            console.log("[oauth][global_response] user account marked as deleted");
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
        user.create(userWrapper, false, (success, status) => {

          console.log("[OID:" + owner_id + "] [NEW_SESSION] [oauth] 2485:");

          alog.log(owner_id, "OAuth User created. ");

          redis_client.set(token, JSON.stringify(userWrapper));
          redis_client.expire(token, 30);

          const courl = app_config.acl_url + "/auth.html&t=" + token + "&g=true"; // require GDPR consent
          console.log("FIXME: this request will probably fail fail (cannot redirect): " + courl);

          if (Globals.use_sqreen()) {
            Sqreen.signup_track({ username: owner_id });
          }

          console.log("Redirecting to login (2)");
          // causes registration error where headers already sent!
          console.log("[checkUserWithResponse] using global_response with ourl:", courl);
          // FIXME: Causes set headers after being set...
          response.redirect(courl); // must be global_response! res does not exist here.
          return; // may fix the problem, but does not flow to user login anymore, blocked by GDPR...
        });
      }

      trackUserLogin(owner_id);

      redis_client.set(token, JSON.stringify(userWrapper));
      redis_client.expire(token, 3600);

      var gdpr = false;
      if (typeof(udoc) !== "undefined" && udoc !== null) {
        if (typeof(udoc.info) !== "undefined") {
          if (typeof(udoc.gdpr_consent) !== "undefined" && udoc.gdpr_consent == true) {
            gdpr = true;
          }
        }
      }

      const ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=" + gdpr; // require GDPR consent
      console.log("[checkUserWithResponse] using global_response with ourl: "+ ourl);
      global_response.redirect(ourl);

    }); // userlib.get
  }

  var BLACKLIST = []; // currently unused, contains only ingress IP in swarm

  function checkDirtyRequests(req, res, next) {

    if (req.headers.origin === "device") {
      next();
      return true;
    }

    let client = req.header("User-Agent");
    

    if (typeOf(client) === "undefined") {
      console.log("[checkDirtyRequests] Dropping connection for client without user-agent.");
      res.status(403).end();
      return false;
    }

    let client_ip = req.connection.remoteAddress;

    if (req.headers && req.headers['x-forwarded-for']) {
      client_ip = req.headers['x-forwarded-for'].split(',')[0];
    }

    if (client.indexOf("Jorgee") !== -1) {
      BLACKLIST.push(client_ip);
      res.status(403).end();
      console.log("[checkDirtyRequests] Jorgee is blacklisted.");
      return false;
    }

    if (req.originalUrl.indexOf("admin") !== -1) {
      BLACKLIST.push(client_ip);
      res.status(403).end();
      console.log("[checkDirtyRequests] admin is blacklisted because of request "+req.originalUrl);
      return false;
    }

    if (req.originalUrl.indexOf("php") !== -1) {
      BLACKLIST.push(client_ip);
      res.status(403).end();
      console.log("[checkDirtyRequests] php is blacklisted.");
      return false;
    }

    if (req.originalUrl.indexOf("\\x04\\x01\\x00") !== -1) {
      BLACKLIST.push(client_ip);
      res.status(403).end();
      console.log("[checkDirtyRequests] heartbleed is blacklisted.");
      return false;
    }

 

    return true; // passed all gates
  }

  function logAccess(req) {
    var client = req.get("User-Agent");
    // log owner ID and request method to application log only
    if ((typeof(req.session) !== "undefined") &&
        (typeof(req.session.owner) !== "undefined")) {
      // console.log("[OID:" + req.session.owner + "] ", req.method + " : " + req.url);
    } else {
      // Skip logging for monitoring sites
      if (client.indexOf("uptimerobot")) {
        return;
      }
      if (req.method !== "OPTIONS") {
        console.log("[OID:0] [" + req.method + "]:" + req.url + "(" + client + ")");
      }
    }
  }

  function enforceACLHeaders(res, req) {

    // console.log("Enforcing ACL headers...");
    
    // cannot use this with allow origin * res.header("Access-Control-Allow-Credentials", "true");
    // analysis: will PROBABLY have to be refactored to anything but Device-Registration and Devoce-OTA requests
    if ((req.originalUrl.indexOf("register") !== -1) ||
        (req.originalUrl.indexOf("firmware") !== -1)) {
          console.log("...none for device, OK");
          return;
          // no ACL/CORS for device requests
    } else {
      // console.log("Allowing credentials...");
      res.header("Access-Control-Allow-Credentials", "true"); // should be allowed for device as well
    }

    let acl_url = app_config.public_url;
    if (typeof(acl_url) === "undefined") {
      acl_url = app_config.public_url.replace("https://", "").replace("http://", "");
    }

    if (app_config.acl_url == "localhost") {
      acl_url = "*"; // localhost is invalid access-control value
    }

    res.header("Access-Control-Allow-Origin", acl_url);
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-type,Accept,X-Access-Token,X-Key");
  }

  app.all("/*", function(req, res, next) {

    // res.cookie('XSRF-TOKEN', req.csrfToken());
    var client = req.get("User-Agent");
    var client_ip = getClientIp(req);

    if (typeof(req.headers.origin) !== "undefined") {
      if (req.headers.origin === "device") {
        next();
        return;
      }
    }

    if ((typeof(app_config.debug.ingress) !== "undefined") && (app_config.debug.ingress !== false)) {
      console.log("» Ingress from ", client_ip);
    }

    if (!checkDirtyRequests(req, res, next)) {
      console.log("Exit after checkDirtyRequests in router:508");
      return;
    }

    // Problem is, that the device API should be separate and have different Access-Control (which is solved by customizing those two endpoints)
    // var webHostname = process.env.WEB_HOSTNAME || "rtm.thinx.cloud";

    enforceACLHeaders(res, req); // this should not be done for device requests (with specific client)

    if (req.method == "OPTIONS") {
      res.status(200).end();
    } else {
      next();
    }

    logAccess(req);

    if (client == client_user_agent) {
      if (typeof(req.headers.origin) !== "undefined") {
        if (req.headers.origin == "device") {
          console.log("allowed for device");
          next();
          return;
        } else {
          console.log("not allowed for non-device");
        }
      }
    } else {
      // console.log("not a device client_user_agent", client_user_agent);
    }
    
  });


  /* Health check */
  app.get("/", function(req, res) {
      respond(res, { healthcheck: true });
  });

  /*
   * Devices
   */

  /* List all devices for user. */
  app.get("/api/user/devices", function(req, res) {
    if (!(validateSecureGETRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    devices.list(owner, function(success, response) {
      respond(res, response);
    });
  });

  /* Attach code source to a device. Expects unique device identifier and source alias. */
  app.post("/api/device/attach", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    var body = req.body;
    devices.attach(owner, body, function(success, status) {
      respond(res, {
        success: success,
        attached: status
      });
    });
  });

  /* TEST ONLY! Get device data. */
  app.get("/api/device/data/:udid", function(req, res) {

    // Could be also authenticated using headers:
    // X-THX-Owner-ID:
    // X-THX-API-Key:

    var udid = "4bf09450-da0c-11e7-81fb-f98aa91c89a5";

    // Test only
    if (typeof(req.params.udid) !== "undefined") {
      udid = req.params.udid;
    } else {
      respond(res, {
        success: false,
        response: "missing_udid"
      });
    }

    messenger.data("", udid, function(success, response) {
      respond(res, {
        success: success,
        response: response
      });
    });

    // }); -- apikey
  });

  /* Post device data. */
  app.post("/api/device/data", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    var udid = Validator.udid(req.body.udid);

    // TODO: Rewrite to hybrid authentication
    // var apikey = req.body.key;
    // apikey.verify(owner, api_key, function(success, message) {

    messenger.data(owner, udid, function(success, response) {
      respond(res, {
        success: success,
        response: response
      });
    });

    //}); -- apikey
  });

  /* Detach code source from a device. Expects unique device identifier. */
  app.post("/api/device/detach", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    devices.detach(req.session.owner, req.body, function(success, status) {
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  /* Revokes a device. Expects unique device identifier. */
  app.post("/api/device/revoke", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    devices.revoke(req.session.owner, req.body, (success, status) => {
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  /*
   * Transformers
   */

  app.post("/api/transformer/run", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    if (typeof(owner) === "undefined" || owner === null) {
      respond(res, {
        success: false,
        status: "owner_not_found"
      });
      return;
    }
    var udid = req.body.device_id;
    if (typeof(udid) === "undefined" || udid === null) {
      respond(res, {
        success: false,
        status: "udid_not_found"
      });
      return;
    }
    device.run_transformers(udid, owner, function(success, status) {
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  /*
   * API Keys
   */

  /* Creates new api key. */
  app.post("/api/user/apikey", function(req, res) {

    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;

    if (typeof(req.body.alias) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_alias"
      });
      return;
    }

    var new_api_key_alias = req.body.alias;

    apikey.create(owner, new_api_key_alias, function(success, all_keys) {
      if (success) {
        if (all_keys.length == 0) {
          console.log("Creating API key failed.");
          respond(res, {
            success: false
          });
        } else {
          let item_index = all_keys.length - 1;
          let object = all_keys[item_index];
          console.log("Created API key", object); // delete after debugging, leaks keys!
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
  app.post("/api/user/apikey/revoke", function(req, res) {

    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;
    var api_key_hashes = [];

    if (typeof(req.body.fingerprint) !== "undefined") {
      api_key_hashes = [req.body.fingerprint];
    }

    if (typeof(req.body.fingerprints) !== "undefined") {
      api_key_hashes = req.body.fingerprints;
    }

    apikey.revoke(owner, api_key_hashes, function(success) {
      if (success) {
        respond(res, {
          revoked: api_key_hashes,
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
  app.get("/api/user/apikey/list", function(req, res) {

    if (!(validateSecureGETRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;

    apikey.list(owner, function(success, keys) {
      if (success) {
        respond(res, {
          success: true,
          api_keys: keys
        });
        return;
      } else {
        respond(res, {
          success: false,
          status: "apikey_list_failed"
        });
      }
    });
  });

  /*
   * Environment Variables
   */

  /* Creates new env var. */
  app.post("/api/user/env/add", function(req, res) {

    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;

    if (typeof(req.body.key) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_key"
      });
      return;
    }

    if (typeof(req.body.value) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_value"
      });
      return;
    }

    var key = req.body.key;
    var value = req.body.value;

    apienv.create(owner, key, value,
      function(success, object) {
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
  app.post("/api/user/env/revoke", function(req, res) {

    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;
    var env_var_names;

    if (typeof(req.body.name) !== "undefined") {
      env_var_names = [req.body.name];
    }

    if (typeof(req.body.names) !== "undefined") {
      env_var_names = req.body.names;
    }

    if (typeof(env_var_names) === "undefined") {
      respond(res, {
        success: false,
        status: "no_names_given"
      });
      return;
    }

    apienv.revoke(owner, env_var_names, function(success, response) {
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
  app.get("/api/user/env/list", function(req, res) {

    if (!(validateSecureGETRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;

    apienv.list(owner, function(success, response) {
      if (success) {
        respond(res, {
          env_vars: response
        });
        return;
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
  app.get("/api/user/sources/list", function(req, res) {
    if (!(validateSecureGETRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    if (typeof(owner) === "undefined") {
      let session = req.session;
      console.log("Incoming request passed validation but session owner is missing:", {session});
    }
    sources.list(req.session.owner, function(success, response) {
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
  app.post("/api/user/source", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    if (typeof(req.body.alias) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_source_alias"
      });
      return;
    }

    if (typeof(req.body.url) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_source_url"
      });
      return;
    }

    var branch = "origin/master";
    if ((typeof(req.body.branch) !== "undefined") &&
      (req.body.branch !== null)) {
      branch = req.body.branch;
    }

    var object = {
      owner: req.session.owner,
      alias: req.body.alias,
      url: req.body.url,
      branch: branch,
      circle_key: req.body.circleToken
    };

    sources.add(object, function(success, response) {
      console.log("sources:add response", {response});
      respond(res, response);
    });
  });

  /* Removes a GIT repository. Expects alias. */
  app.post("/api/user/source/revoke", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;
    if (typeof(req.body.source_ids) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_source_ids"
      });
      return;
    }

    var source_ids = req.body.source_ids;
    sources.remove(owner, source_ids, function(success, message) {
      respond(res, message);
    });
  });

  /*
   * RSA Keys
   */

  app.get("/api/user/rsakey/create", function(req, res) {

    if (!validateSession(req, res)) return;

    var owner = req.session.owner;

    rsakey.create(owner, function(success,
      response) {
      respond(res, {
        success: success,
        status: response
      });
    });
  });

  /* Lists all RSA keys for user. */
  app.get("/api/user/rsakey/list", function(req, res) {

    if (!(validateSecureGETRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;

    rsakey.list(owner, function(success, response) {
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
  app.post("/api/user/rsakey/revoke", function(req, res) {

    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    var owner;

    if (typeof(req.session.owner) !== "undefined") {
      owner = req.session.owner;
    } else {
      respond(res, {
        success: false,
        status: "missing_attribute:owner"
      });
      return;
    }

    // Support bulk updates
    if (typeof(req.body.filenames) !== "undefined") {
      var filenames = req.body.filenames;
      console.log("Fingerprints: " + JSON.stringify(filenames));
      rsakey.revoke(owner, filenames, function(success, response) {
        respond(res, {
          success: success,
          status: response
        });
      });
    } else {
      respond(res, {
        success: false,
        status: "invalid_query"
      });
    }
  });

  /*
   * Password Reset
   */

  // /user/create GET
  /* Create username based on e-mail. Owner must be unique (email hash). */
  app.post("/api/user/create", function(req, res) {
    user.create(req.body, true, function(success, status) {
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  // /user/delete POST
  /* Delete user document */
  app.post("/api/user/delete", function(req, res) {
    user.delete(req.body, function(success, status) {
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  /* Endpoint for the password reset e-mail. */
  app.get("/api/user/password/reset", function(req, res) {
    user.password_reset(req.query.owner, req.query.reset_key, function(success, message) {
      if (!success) {
        req.session.destroy(function(err) {
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
  app.get("/api/user/activate", function(req, res) {
    user.activate(req.query.owner, req.query.activation, function(success, message) {
      if (!success) {
        req.session.destroy(function(err) {
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
  app.post("/api/user/password/set", function(req, res) {
    user.set_password(req.body, function(success, message) {
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

  // /user/password/reset POST
  /* Used to initiate password-reset session, creates reset key with expiraation and sends password-reset e-mail. */
  app.post("/api/user/password/reset", function(req, res) {
    user.password_reset_init(req.body.email, function(success, message) {
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

  app.post("/api/user/profile", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    if (typeof(owner) === "undefined") {
      let session = req.session;
      console.log("Incoming request passed validation but session owner is missing in POST api/user/profile:", {session});
    }
    user.update(owner, req.body, function(success, status) {
      console.log("Updating user profile...");
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  // /user/profile GET
  app.get("/api/user/profile", function(req, res) {
    if (!(validateSecureGETRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    if (typeof(owner) === "undefined") {
      let session = req.session;
      console.log("Incoming request passed validation but session owner is missing in GET api/user/profile:", {session});
    }
    user.profile(owner, function(success, response) {
      if (success === false) {
        respond(res, {
          success: success,
          status: response
        });
      } else {
        console.log("Returning user profile", {response});
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
  app.get("/device/firmware", function(req, res) {
    const ott = req.query.ott;
    if (typeof(ott) === "undefined" || ott === null) {
      console.log("ERROR: GET request for FW update with no OTT!");
      respond(res, {
        success: false,
        status: "missing_ott"
      });
      return;
    }
    console.log("GET request for FW update with OTT: " + ott);

    device.ott_update(ott, function(success, response) {

      if (success) {
        console.log("SUCCESS! Responding with contents...");
        // contents: {"md5":"891f8fb09489c05380536ba82538a147","filesize":586416,"payload":{"type":"Buffer","data":[233
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename=firmware.bin');
        res.setHeader('Content-Length', response.filesize);
        res.setHeader('x-MD5', response.md5);
        respond(res, response.payload);
      } else {
        console.log("No successful firmware build found: "+JSON.stringify(response));
        respond(res, response);
      }
    });
  });

  // Firmware update retrieval. Serves binary [by owner (?) - should not be required] and device MAC.
  app.post("/device/firmware", function(req, res) {

    validateRequest(req, res);
    res.set("Connection", "close");

    // Device will create OTT request and fetch firmware from given OTT-URL
    if ((typeof(req.body.use) !== "undefined") && (req.body.use == "ott")) {
      // TODO: Refactor to single request parameter only
      device.ott_request(req.owner, req.body, req.headers.authentication, req,
        function(success, response) {
          console.log("Responding to OTT request with :" , {response});
          respond(res, response);
        });

      // Device will fetch firmware/files now (wrapped as JSON or in binary, depending on type (firmware/file))
    } else {
      // TODO: use only one parameter for req or deprecate this
      device.firmware(req.body, req.headers.authentication, req,
        function(success, response) {
          console.log("Responding to Firmware request with :" , {response});
          respond(res, response);
        });
    }
  });

  // Device login/registration
  // MAC is be allowed for initial regitration where device is given new UDID

  app.post("/device/register", function(req, res) {
    // const startTime = new Date().getMilliseconds();

    // validateRequest(req, res); this result is ignored

    var rip = getClientIp(req);

    if (typeof(req.body) === "undefined") {
      respond(res, {
        success: false,
        status: "no_body"
      });

    } else if (typeof(req.body.registration) === "undefined") {
      console.log("Incoming request has no `registration` in body, should BLACKLIST " + rip);
      console.log("headers: " + JSON.stringify(req.headers));
      /*
      BLACKLIST.push(ip);
      */
      console.log("body: " + JSON.stringify(req.body));
      respond(res, {
        success: false,
        status: "blacklisted"
      });
    } else {
      console.log("Incoming registration request from "+rip);

      //const regTime = new Date().getMilliseconds();
      var registration = req.body.registration;
      device.register(req, registration, req.headers.authentication, app._ws, function(success, response) {
        // Append timestamp inside as library is not parsing HTTP response JSON properly
        // when it ends with anything else than }}
        if (success && typeof(response.registration) !== "undefined") {
          response.registration.timestamp = Math.floor(new Date() / 1000);
        }
        if (success === false) {
          console.log("Device registration failed with response:", response);
        } else {
          console.log("Device registration success with response:", response);
        }
        respond(res, response);
      });
    }
  });

  // Device push attach
  // UDID is required, valid Push token is required. Potential point for DDoS attacks,
  // would use at least SOME authentication.

  app.post("/device/addpush", function(req, res) {

    if (!validateSecurePOSTRequest(req)) return;

    if (typeof(req.body) === "undefined") {
      respond(res, {
        success: false,
        status: "no_body"
      });
    } else if (typeof(req.body.push) === "undefined") {
      respond(res, {
        success: false,
        status: "no_registration"
      });
    } else {
      var registration = req.body.push;
      device.push(registration, req.headers.authentication, function(
        success, response) {
        respond(res, response);
      });
    }
  });

  // Device editing
  app.post("/api/device/edit", function(req, res) {

    let body = req.body;
    let changes = req.body.changes;

    // Manually fixes wronte device docs, regardless why it happens(!)
    changes.doc = null;
    changes.value = null;

    // console.log("device edit body", {body});

    if (typeof(req.body.changes) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_changes"
      });
      return;
    }

    // Implementation as internal function because of hybrid auth, prevents duplication
    function implementation(iowner, ichanges, ires) {
      device.edit(iowner, ichanges, (success, message) => {
        respond(ires, {
          success: success,
          message: message
        });
      });
    }

    // Hybrid Cookie/APIKey authentication
    let owner = req.body.owner;
    let api_key = req.body.apikey;
    if (typeof(owner) !== "undefined" && typeof(api_key) !== "undefined") {
      // Using Owner/API Key
      apikey.verify(sanitka.udid(owner), sanitka.udid(api_key), req, function(vsuccess, vmessage) {
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
      if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
      owner = req.session.owner;
      implementation(owner, req.body.changes, res);
    }
  });

  /*
   * Builder
   */

  // Build respective firmware and notify target device(s
  app.post("/api/build", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var notifiers = {
      messenger: messenger,
      websocket: app._ws
    };
    // Input validation
    let unsafe_build = req.body.build;
    let owner = req.session.owner;
    let udid =  sanitka.udid(unsafe_build.udid);
    let source_id = sanitka.udid(unsafe_build.source_id);
    let dryrun = false;
    if (typeof(unsafe_build.dryrun) !== "undefined" && unsafe_build.dryrun == true) {
      dryrun = true;
    }
    let safe_build = {
      udid: udid,
      source_id: source_id,
      dryrun: dryrun
    };
    app.builder.build(
      owner,
      safe_build,
      notifiers,
      app.queue.nextAvailableWorker(),
      function (success, response) {
        respond(res, response);
      });
  });

  // should be under /api
  app.post("/api/device/envelope", function(req, res) {
    let udid = req.body.udid;
    let owner = req.session.owner;
    if ((typeof(udid) === "undefined") || (typeof(owner) === "undefined")) {
      respond(res, "{}");
    } else {
      let envelope = deployment.latestFirmwareEnvelope(owner, udid);
      //console.log("/api/device/envelope providing envelope (LFE):", envelope);
      respond(res, JSON.stringify(envelope));
    }
  });

  // Get build artifacts
  app.post("/api/device/artifacts", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    var udid = Validator.udid(req.body.udid);
    var build_id = Validator.udid(req.body.build_id);

    var body = req.body;
    console.log("validated body", {body}); // debug only

    if (typeof(udid) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_udid"
      });
      return;
    }

    if (typeof(build_id) === "undefined") {
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
  app.get("/api/user/logs/audit", function(req, res) {
    if (!(validateSecureGETRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;

    alog.fetch(owner, function(err, body) {

      if (err !== false) {
        console.log(err);
        respond(res, {
          success: false,
          status: "log_fetch_failed",
          error: err
        });
      } else {
        if (!body) {
          console.log("Log for owner " + owner + " not found.");
          respond(res, {
            success: false,
            status: "log_fetch_failed",
            error: err
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
  app.get("/api/user/logs/build/list", function(req, res) {

    if (!(validateSecureGETRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;

    if (typeof(owner) === "undefined") {
      respond(res, {
        success: false,
        status: "session_failed"
      });
      return;
    }

    blog.list(owner, function(err, body) {

      var builds = [];

      if (err) {
        console.log("err: " + err);
        respond(res, {
          success: false,
          status: "build_list_failed",
          error: err
        });
        return;
      }

      if (!body) {
        console.log("Log for owner " + owner + " not found.");
        respond(res, {
          success: false,
          status: "build_list_empty",
          error: err
        });
        return;
      }

      // SIDE-EFFECT FROM HERE, MOVE INTO BUILDLIB! - >dcl
      for (var bindex in body.rows) {

        //if (!{}.hasOwnProperty.call(body.rows, bindex)) return;

        var row = body.rows[bindex];

        // console.log("Build log row: " + JSON.stringify(row));

        var buildlog = row.value;

        var log = buildlog.log;

        if (typeof(log) === "undefined") {
          console.log("Warning, build has no saved log!");
          var build = {
            date: body.value.timestamp,
            udid: body.value.udid
          };
          console.log("exporting", {build});
          builds.push(build);
        } else {
          let timestamp = 0;
          let latest = log[0];
          for (var i = 0; i < log.length; i++) {
            let logline = log[i];
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

      //console.log("DEBUG BUILD LOG LIST/BUILD STATUS:");
      //console.log(JSON.stringify(builds, false, 2));

      respond(res, {
        success: true,
        builds: builds
      });

    });
  });

  /* Convenience adapter for log rows */
  var getLogRows = function(body) {
    var logs = [];
    for (var lindex in body.rows) {
      const item = body.rows[lindex];
      if (!item.hasOwnProperty("value")) continue;
      if (!item.value.hasOwnProperty("log")) continue;
      logs.push(item.value.log);
    }
    return logs;
  };

  /* Returns specific build log for owner */
  app.post("/api/user/logs/build", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    if (typeof(req.body.build_id)=== "undefined") {
      respond(res, {
        success: false,
        status: "missing_build_id"
      });
      return;
    }

    var build_id = Validator.udid(req.body.build_id);
    console.log("DEBUG: incoming build_id:", req.body.build_id, "validated", build_id);

    if (build_id.indexOf("invalid") !== -1) {
      respond(res, {
        success: false,
        status: "invalid_build_id"
      });
      return;
    }

    blog.fetch(build_id, function(err, body) {
      if (err) {
        console.log(err);
        respond(res, {
          success: false,
          status: "build_fetch_failed",
          error: err
        });
        return;
      }
      if (!body) {
        console.log("Log for owner " + owner + " not found.");
        respond(res, {
          success: false,
          status: "build_fetch_empty",
          error: err
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

  var transferResultRedirect = function(success, res, response) {
    if (success === false) {
      //console.log(response);
      res.redirect( app_config.acl_url + "/error.html?success=failed&reason=" + response);
    } else {
      res.redirect( app_config.acl_url + "/error.html?success=true");
    }
  };

  /* Request device transfer */
  app.post("/api/transfer/request", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    transfer.request(owner, req.body, function(success, response) {
      transferResultRedirect(success, res, response);
    });
  });

  /* Decline device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/decline", function(req, res) {
    if (typeof(req.query.transfer_id) !== "undefined") {
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
    transfer.decline(body, function(success, response) {
      transferResultRedirect(success, res, response);
    });
  });

  /* Decline selective device transfer */
  app.post("/api/transfer/decline", function(req, res) {

    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    if (typeof(req.body.transfer_id) !== "undefined") {
      respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    if (typeof(Validator.udid(req.body.udid)) !== "undefined") {
      respond(res, {
        success: false,
        status: "udids_missing"
      });
      return;
    }

    if (typeof(req.body.owner) === "undefined") {
      respond(res, {
        success: false,
        status: "owner_missing"
      });
      return;
    }

    var body = {
      transfer_id: req.body.transfer_id,
      udids: Validator.udid(req.body.udid)
    };

    transfer.decline(body, function(success, response) {
      transferResultRedirect(success, response, res);
    });
  });

  /* Accept device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/accept", function(req, res) {

    if (typeof(req.query.transfer_id) === "undefined") {
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

    transfer.accept(body, function(success, response) {
      transferResultRedirect(success, res, response);
    });
  });

  /* Accept selective device transfer */
  app.post("/api/transfer/accept", function(req, res) {

    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    //if (!validateBodyArgs(req, res, ["transfer_id", "owner", "udid"])) return;

    if (typeof(req.body.transfer_id) !== "undefined") {
      respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    if (typeof(req.body.owner) === "undefined") {
      respond(res, {
        success: false,
        status: "owner_missing"
      });
      return;
    }

    if (typeof(Validator.udid(req.body.udid)) !== "undefined") {
      respond(res, {
        success: false,
        status: "udids_missing"
      });
      return;
    }

    transfer.accept(req.body, function(success, response) {
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

  var needsGDPR = function(doc) {
    var gdpr = false;
    if (typeof(doc.info) !== "undefined") {
      if (typeof(doc.gdpr_consent) !== "undefined" && doc.gdpr_consent == true) {
        gdpr = true;
      }
    }
    return gdpr;
  };

  var updateLastSeen = function(doc) {
    userlib.atomic("users", "checkin", doc._id, { last_seen: new Date()
    }, function(error, response) {
      if (error) {
        if (error.toString().indexOf("conflict") !== -1) {
          console.log("Last-seen update retry...");
          delete doc._rev;
          updateLastSeen(doc);
        } else {
          console.log("Last-seen update failed (1): " + error);
        }
      } else {
        alog.log(doc._id, "Last seen updated.");
      }
    });
  };

  function performOAuthLogin(req, res, oauth) {

    let owner_id;

    redis_client.get(oauth, function(err, userWrapper) {
      if (err) {
        console.log("[oauth] takeover failed");
        failureResponse(res, 403, "unauthorized");
        return;
      } else {

        var wrapper = JSON.parse(userWrapper);

        if ((typeof(wrapper) !== "undefined") && wrapper !== null) {
          owner_id = wrapper.owner;
        } else {
          console.log("[login] user wrapper error: ", { userWrapper });
          if (wrapper === null) {
            failureResponse(res, 403, "wrapper error");
            return;
          }
        }

        userlib.get(owner_id, function(gerr, doc) {

          if (gerr) {

            // Support for creating accounts to non-existent e-mails automatically
            console.log("[oauth] owner_id not found, creating: " + owner_id);
            user.create(wrapper, false, function(success, status) {

              console.log("Result creating OAuth user:");
              console.log(success, status);

              console.log("Setting session owner from OAuth wrapper...", {doc});
              req.session.owner = wrapper.owner;
              console.log("[OID:" + req.session.owner + "] [NEW_SESSION] [oauth] 1824: ");

              //req.session.cookie.secure = true;
              req.session.cookie.httpOnly = true;
              req.session.cookie.maxAge = fortnight;

              res.cookie("x-thx-session", fortnight, {
                maxAge: fortnight,
                httpOnly: false
              });

              if (Globals.use_sqreen()) {
                Sqreen.signup_track({ username: owner_id });
              }

              console.log("alog: OAuth User created.");
              alog.log(req.session.owner, "OAuth User created: " + wrapper.first_name + " " + wrapper.last_name);

              respond(res, {
                "redirectURL": "/app"
              });
            });

          } else {

            // no error when getting username

            console.log("Setting session owner from doc...", {doc});
            req.session.owner = doc.owner;
            req.session.cookie.maxAge = 24 * hour; // should be max 3600 seconds
            //req.session.cookie.secure = true;
            req.session.cookie.httpOnly = true;

            console.log("[OID:" + doc.owner + "] [NEW_SESSION] [oauth] thinx.js:1852...");
            alog.log(doc.owner, "New session.", "info");

            if ( (typeof(req.body.remember) === "undefined") ||
                 (req.body.remember === 0) ) {
              req.session.cookie.maxAge = 24 * hour;
            } else {
              req.session.cookie.maxAge = fortnight;
            }

            alog.log(doc.owner, "OAuth User logged in: " + doc.username, "info");

            if (Globals.use_sqreen()) {
              Sqreen.auth_track(true, { username: doc.owner });
            }

            console.log("Redirecting to /app", req.headers);

            respond(res, { "redirectURL": "/app" });
            updateLastSeen(doc);
          }
        });
      }
      return;
    });
  }

  function loginWithGDPR(req, res, user_data, client_type) {

    var ourl = null; // outgoing URL

    var skip_gdpr_page = false;
    if (typeof(user_data.gdpr_consent) === "undefined") {
      skip_gdpr_page = true;
    } else {
      skip_gdpr_page = user_data.gdpr_consent;
    }

    // WTF? oauth should not matter here in this code branch
    //if (typeof(oauth) === "undefined") {
      const token = sha256(user_data.email + ":" + user_data.activation_date);
      redis_client.set(token, JSON.stringify(user_data));
      redis_client.expire(token, 30);
      global_token = token;
      ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=" + skip_gdpr_page;
    //}

    console.log("Setting session owner from user_data in loginWithGDPR...", {user_data});
    req.session.owner = user_data.owner;
    console.log("[OID:" + req.session.owner + "] [NEW_SESSION] [router] 1904: ");

    if (typeof(req.session.owner) !== "undefined") {

      console.log("session valid (has owner), redirecting to", ourl);

      // Device or WebApp... requires  valid session
      if (client_type == "device") {
        return;
      } else if (client_type == "webapp") {
        respond(res, {
          "redirectURL": ourl
        });
      }

    } else {

      // Invalid session causes flush and logout
      console.log("login: Flushing session: " + JSON.stringify(req.session));
      failureResponse(res, 403, "unauthorized");
      req.session.destroy(function(err) {
        if (err) {
          console.log("Session destroy error: " + err);
        }
      });
    }
  }

  // Front-end authentication, returns session on valid authentication
  app.post("/api/login", function(req, res) {

    if (typeof(app_config.debug.allow_http_login) !== "undefined" && app_config.debug.allow_http_login === false) {
      if (req.protocol !== "https") {
        console.log("HTTP rejected for login.");
        req.end(401);
      }
    }

    // Request must be post
    if (req.method !== "POST") {
      req.session.destroy(function(err) {
        if (err) {
          console.log(err);
        } else {
          failureResponse(res, 500, "protocol");
          console.log("Not a post request.");
          return;
        }
      });
    }

    var client_type = "webapp";
    var ua = req.headers["user-agent"];
    var validity = ua.indexOf(client_user_agent);

    if (validity === 0) {
      console.log(ua);
      client_type = "device";
    }


    //
    // OAuth login Variant (with external token)
    //

    var oauth = req.body.token;

    if ((typeof(oauth) !== "undefined") && (oauth !== null)) {
      // console.log("oauth: "+ oauth);
      performOAuthLogin(req, res, oauth);
      return;
    }

    // Username/password login Variant (with local token)

    if (typeof(req.body.password) === "undefined") {
      // return;
    }

    //
    // Search the user in DB
    //

    var username = req.body.username; // TODO: needs sanitizer
    var password = sha256(prefix + req.body.password);

    userlib.view("users", "owners_by_username", {
      "key": username,
      "include_docs": true // might be useless
    }, function(err, body) {

      if (err) {
        console.log("Userlib view Error: " + err.toString());
        failureResponse(res, 403, "unauthorized");
        req.session.destroy(function(derr) {
          if (derr) {
            console.log(derr);
          } else {
            console.log("Owner not found: " + username);
          }
        });
        return;
      }

      // Find user and match password
      var all_users = body.rows;

      var user_data = null;
      for (var index in all_users) {
        var all_user_data = all_users[index];
        if (username !== all_user_data.key) {
          continue;
        } else {
          user_data = all_user_data.value;
          // cleanup deleted conflicts
          if (typeof(user_data._deleted_conflicts) !== "undefined") {
            delete user_data._deleted_conflicts;
          }
          break;
        }
      }

      if (user_data === null) {
        var err_string = "Attempt to login with non-existent user " + username + "!";
        thinx_slack.alert({
          text: err_string
        });

        console.log("No user data, " + username + " not authorized.");
        failureResponse(res, 403, "unauthorized");
        return;
      }

      // Exit when user is marked as deleted but not destroyed yet
      var deleted = user_data.deleted;
      if ((typeof(deleted) !== "undefined") && (deleted === true)) {
        failureResponse(res, 403, "user_account_deactivated");
        return;
      }

      // TODO: Second option (direct compare) will deprecate soon.
      if (password.indexOf(user_data.password) !== -1) {

        // what if there's NEW session?
        if (typeof(req.session) !== "undefined") {
          console.log("Setting session owner from user_data...", {user_data});
          req.session.owner = user_data.owner;

          // This log message is later duplicated in [oauth] and other variants
          console.log("[OID:" + req.session.owner + "] [NEW_SESSION] on /login");

          if ( (typeof(req.body.remember) === "undefined") ||
               (req.body.remember === 0)) {
            req.session.cookie.maxAge = 24 * hour;
            var expiration = (req.session.cookie.expires < 24*hour) ? req.session.cookie.expires : 24*hour;
            res.cookie("x-thx-session", expiration, {
              maxAge: 24 * hour,
              httpOnly: false
            });
          } else {
            req.session.cookie.maxAge = fortnight;
            res.cookie("x-thx-session", fortnight, {
              maxAge: fortnight,
              httpOnly: false
            });
          }

          //req.session.cookie.secure = true;
          alog.log(user_data.owner, "User logged in: " + username);
        }

        if (client_type == "device") {
          console.log("WELCOME client_type: " + client_type);
          respond(res, {
            status: "WELCOME",
            success: true
          });
          return;

        } else if (client_type == "webapp") {

          // Make note on user login
          userlib.get(user_data.owner, function(error, udoc) {
            if (error) {
              console.log("[OID:"+user_data.owner + "] owner get error: " + error);
            } else {
              userlib.atomic("users", "checkin", udoc._id, {
                last_seen: new Date()
              }, function(aerr, response) {
                if (aerr) {
                  console.log("Last-seen update failed (2): " + aerr, response);
                } else {
                  console.log("Setting session owner for WebApp client...");
                  req.session.owner = udoc.owner;
                  console.log("[OID:" + req.session.owner + "] [NEW_SESSION] on WebApp /login");
                  loginWithGDPR(req, res, user_data, client_type);
                  alog.log(udoc.owner, "Last seen updated.");
                }
              });
            }
          });

          return; // continue...

        } else { // other client whan webapp or device
          respond(res, {
            status: "OK",
            success: true
          });
          return;
        }

      } else { // password invalid

        var p = user_data.password;
        if (typeof(p) === "undefined" || p === null) {
          console.log("[LOGIN_INVALID] (not activated/no password) for " + username);
          alog.log(req.session.owner, "Password missing for: " + username);
          respond(res, {
            status: "password_missing",
            success: false
          });
        } else {
          console.log("[LOGIN_INVALID] Password mismatch for: " + username);
          alog.log(req.session.owner, "Password mismatch for: " + username);
          respond(res, {
            status: "password_mismatch",
            success: false
          });
        }
      }

      // Login successful, redirect to app authentication route with some token...
      loginWithGDPR(req, res, user_data, client_type);
    });
  });

  // Front-end authentication, destroys session on valid authentication
  app.get("/api/logout", function(req, res) {
    if (typeof(req.session) !== "undefined") {
      req.session.destroy(function(err) {
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
  app.get("/api/user/stats", function(req, res) {

    if (!(validateSecureGETRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;

    stats.week(owner, function(success, body) {

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
  app.post("/api/user/chat", function(req, res) {
    if (!validateSecurePOSTRequest(req)) return;
    // if (!validateSession(req, res)) return;
    var owner = req.session.owner;
    var message = req.body.message;
    messenger.slack(owner, message, function(err, response) {
      if (err) {
        console.log("[OID:" + owner + "] Chat message failed with error " + err.toString());
      } else {
        console.log("[OID:" + owner + "] Chat message sent.");
      }
      respond(res, {
        success: !err,
        status: response
      });
    });
  });

  app.post("/api/user/message", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    var message = req.body.message;
    messenger.slack(owner, message, function(err, response) {
      console.log("Message: '" + message + "' with error " + err);
      respond(res, {
        success: !err,
        status: response
      });
    });
  });

  /*
   * Device Configuration
   */

  /* Respond to actionable notification */
  app.post("/api/device/push", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    devices.push(owner, req.body, function(error, response) {
      respond(res, {
        success: error,
        status: response
      });
    });
  });

  /*
   * Actionable Notifications
   */

  /* Respond to actionable notification */
  app.post("/api/device/notification", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    var device_id = Validator.udid(req.body.udid);
    var nid = "nid:" + device_id;
    var reply = req.body.reply;
    if (typeof(device_id) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_udid"
      });
      return;
    }
    if (typeof(reply) === "undefined" || reply == null) {
      respond(res, {
        success: false,
        status: "missing_reply"
      });
      return;
    }
    messenger.publish(owner, device_id, {
      nid: nid,
      reply: reply
    });
  });

  /*
   * Slack OAuth Dance
   */

  app.get("/slack/direct_install", function(req, res) {
    res.redirect(
      "https://slack.com/oauth/authorize?client_id=233115403974.233317554391&scope=bot&state=Online&redirect_uri=" + app_config.public_url + ":7443/slack/redirect"
    );
  });

  app.get("/slack/redirect", function(req, xres) {

    console.log("Redirect URL: " + JSON.stringify(req.url));
    console.log("Redirect GET: " + JSON.stringify(req.body));
    console.log("Redirect Code: " + req.query.code);
    console.log("Redirect State: " + req.query.state);

    var options = {
      protocol: 'https:',
      host: 'slack.com',
      hostname: 'slack.com',
      port: 443,
      path: '/api/oauth.access?client_id=233115403974.233317554391&client_secret=ccbaae01e5259ed283ef63321be597da&redirect_uri=' + app_config.public_url + ':7443/slack/redirect&scope=bot&code=' +
        req.query.code
    };

    var areq = https.get(options, function(res) {

      console.log('STATUS: ' + res.statusCode);
      console.log('HEADERS: ' + JSON.stringify(res.headers));

      // Buffer the body entirely for processing as a whole.
      var bodyChunks = [];

      if (typeof(res) === "undefined" || res == null) {
        console.log("No response.");
        return;
      }

      res.on('data', function(chunk) {
        // You can process streamed parts here...
        bodyChunks.push(chunk);

      }).on('end', function() {
        var body = Buffer.concat(bodyChunks);
        console.log('BODY: ' + body);
        // ...and/or process the entire body here.
        var auth_data = JSON.parse(body);
        var token = auth_data.bot_access_token;
        if (typeof(token) !== "undefined") {
          redis_client.set("__SLACK_BOT_TOKEN__", token);
          console.log("Saving new Bot token (TODO: tell mesenger): ", token);
        }
      });
    });

    areq.on('error', function(e) {
      console.log('ERROR: ' + e.message);
    });

    xres.redirect(
      "https://" + process.env.WEB_HOSTNAME + "/app/#/profile/help"
    );

  });

  /*
   * OAuth 2 with GitHub
   */

  if (typeof(githubOAuth) !== "undefined") {

    githubOAuth.on('error', function(err) {
      console.error('there was a login error', err);
    });

    githubOAuth.on('token', function(oauth_token, serverResponse) {

      if (typeof(oauth_token.access_token) === "undefined") {
        console.log("[githubOAuth] Fetching token failed.");
        return;
      }

      console.log("[githubOAuth] GitHub token request successful:", {oauth_token});
      // console.log("[githubOAuth] TODO: fetch some corellation identifier for init request to provide personalized response:", {serverResponse});

      if (typeof(oauth_token.access_token) === "undefined") {
        console.log("[githubOAuth] No OAuth access token available, exiting.");
        return;
      }

      // Application name from GitHub / Settings / Developer Settings, should be in JSON;
      var request_options = {
        host: 'api.github.com',
        headers: {
          'user-agent': 'THiNX OAuth'
        },
        path: '/user?access_token=' + oauth_token.access_token
      };

      https.get(request_options, (res) => {

        var data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        // The whole response has been received. Print out the result.
        res.on('end', () => {

          var token = "ghat:" + oauth_token.access_token;
          console.log(token);

          var given_name;
          var family_name = "User";

          var hdata = JSON.parse(data);

          if ((typeof(hdata.name) !== "undefined") && hdata.name !== null) {
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
            console.log("Warning: no name in GitHub access token response, using login: ", {hdata}); // logs personal data in case the user has no name!
          }

          var owner_id = null;
          var email = hdata.email;

          if (typeof(email) === "undefined" || email === null) {
            console.log("Error: no email in response, should login without activation.");
            email = hdata.login;
          }

          try {
            owner_id = sha256(prefix + email);
          } catch (e) {
            console.log("error parsing e-mail: " + e + " email: " + email);
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

          console.log("checkUserWithResponse with token:", token);

          checkUserWithResponse(global_response, token, userWrapper);

        }); // res.end
      }); // https.get
    });
  }

  // Initial page redirecting to OAuth2 provider
  app.get('/oauth/github', function(req, res) {
    if (typeof(req.session) !== "undefined") {
      req.session.destroy();
    }
    console.log('Starting GitHub Login...');
    if (typeof(githubOAuth) !== "undefined") {
      githubOAuth.login(req, res);
    }
  });

  /*
   * OAuth 2 with Google
   */

   function createUserWithGoogle(req, ores, odata, userWrapper, access_token) {
      console.log("Creating new user...");

      // No e-mail to validate.
      var will_require_activation = true;
      if (typeof(odata.email) === "undefined") {
        will_require_activation = false;
      }

      // No such owner, create...
      user.create(userWrapper, will_require_activation, (success, status) => {

        console.log("[OID:" + req.session.owner + "] [NEW_SESSION] [oauth] 2860:");

        alog.log(req.session.owner, "OAuth User created: " + userWrapper.given_name + " " + userWrapper.family_name);

        // This is weird. Token should be random and with prefix.
        var gtoken = sha256(access_token); // "g:"+
        global_token = gtoken;
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
     if (typeof(udoc) === "undefined") return false;
     if ((typeof(udoc.deleted) !== "undefined") && udoc.deleted === true) {
       // TODO: Redirect to error page with reason
       console.log("[processGoogleCallbackError][oauth] user account marked as deleted");
       ores.redirect(
         app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=account_deleted'
       );
       return true;
     }
     return false;
   }

   function processGoogleCallbackError(error, ores, udoc, req, odata, userWrapper, access_token) {

     //console.log("[processGoogleCallbackError] User does not exist?");

     if (failOnDeletedAccountDocument(error, ores)) return;
     if (failOnDeletedAccount(udoc, ores)) return;

     console.log("[processGoogleCallbackError] Userlib get OTHER error: " + error.toString());

     // In case the document is undefined (and identity confirmed by Google), create new one...
     if (typeof(udoc) === "undefined" || udoc === null) {
       console.log("Setting session owner from Google User Wrapper...");
       req.session.owner = userWrapper.owner;
       console.log("[OID:" + req.session.owner + "] [NEW_SESSION] on UserWrapper /login");
       createUserWithGoogle(req, ores, odata, userWrapper, access_token);
       return;
     }
  }

  if (typeof(google_ocfg) !== "undefined" && google_ocfg !== null) {

    // Initial page redirecting to OAuth2 provider
    app.get('/oauth/google', function(req, res) {
      // User requested login, destroy existing session first...
      if (typeof(req.session) !== "undefined") {
        req.session.destroy();
      }
      require("crypto").randomBytes(48, (err, buffer) => {
        var token = buffer.toString('hex');
        // console.log("» Saving Google token for 1 minute: "+token);
        redis_client.set("oa:"+token+":g", 60); // auto-expires in 1 minute
        // Authorization uri definition
        var authorizationUri = oauth2.authorizationCode.authorizeURL({
          redirect_uri: google_ocfg.web.redirect_uris[0],
          scope: 'email openid profile',
          state: token // this string shall be random (returned upon auth provider call back)
        });
        console.log("GET [oauth/google] started with state", token, "redirecting to", authorizationUri);
        res.redirect(authorizationUri);
      });
    });

    /// CALLBACK FOR GOOGLE OAUTH ONLY!
    // Callback service parsing the authorization token and asking for the access token
    app.get('/oauth/cb', function(req, ores) {

      var options = {
        code: req.query.code,
        redirect_uri: google_ocfg.web.redirect_uris[0]
      };

      console.log("GET [oauth/cb] started with options", {options});

      var tok = oauth2.authorizationCode.getToken(options, (error, result) => {
        if (error) {
          console.error('[oauth] Access Token Error', error.message);
          return ores.json('Authentication failed');
        }
        // console.log('[oauth] The resulting token: ', result);
        const token = oauth2.accessToken.create(result);
        return token;
      });

      tok.then(res2 => {
        global_token = res2.access_token; // WTF?
        console.log("assigning/storing global_token: ", {global_token});
        var gat_url = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=' + res2.access_token;
        console.log("fetching GAT: ");

        https.get(gat_url, (res3) => {
            let data = '';
            res3.on('data', (chunk) => { data += chunk; });
            res3.on('end', () => {
              const odata = JSON.parse(data);
              const email = odata.email;

              if (typeof(email) === "undefined") {
                res3.redirect(
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

              //console.log("[oauth][google] searching for owner_id: " + owner_id);
              // Asynchronously check user and make note on user login
              userlib.get(owner_id, function(error, udoc) {
                if (error) {
                  // may also end-up creating new user
                  processGoogleCallbackError(error, ores, udoc, req, odata, userWrapper, res2.access_token);
                  return;
                }
                updateLastSeen(udoc);
                alog.log(owner_id, "OAuth2 User logged in...");
                var token = sha256(res2.access_token);
                redis_client.set(token, JSON.stringify(userWrapper));
                redis_client.expire(token, 3600);
                const ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=" + needsGDPR(udoc); // require GDPR consent
                ores.redirect(ourl);
              });
            });
          }).on("error", (err) => {
          console.log("Error: " + err.message);
          ores.redirect(
            app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=' +
            err.message);
        });

      }).catch(err => {
        console.log("Oauth error: " + err);
        ores.redirect(
          app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=' +
          err.message);
      });
    });
  } // GET /oauth/cb

  if (typeof(github_ocfg) !== "undefined" && github_ocfg !== null) {
    // Callback service parsing the authorization token and asking for the access token
    app.get('/oauth/gcb', function(req, res) {
      //global_token = null; // reset token; single user only!!!!

      let query = req.query;
      console.log("GitHub OAuth request (code, state): ", { query }); // TODO: get some ID for global_response array to allow multiple requests at once without compromising security/availability
      console.log("Saving global_response in /oauth/gcb");
      global_response = res;
      global_responses[req.query.code] = res;

      console.log("Github OAuth2 Callback (TODO: validate redis oa:*:g token)...");
      githubOAuth.callback(req, res, function(err) {
        if (!err) {
          console.log("Should login with token now...");
          if (global_token !== null) {
            const rurl = app_config.acl_url + "/auth.html?t=" + global_token + "&g=" + false; // require GDPR consent
            res.redirect(rurl);
            global_token = null; // reset token for next login attempt
          } else {
            console.log("global token null on gcb");
          }
        } else {
          console.log("githubOAuth.callback cberr: ", { err } );
        }
      });
    });
  }

  /* Use to issue/withdraw GDPR consent. */
  app.post('/api/gdpr', function(req, res) {

    //if (!validateSecurePOSTRequest(req)) return;
    //if (!validateSession(req, res)) return;

    // var owner = req.session.owner;
    var gdpr_consent = req.body.gdpr_consent;
    var token = req.body.token;

    redis_client.get(token, function(err, userWrapper) {

      if (err) {
        console.log("[oauth][gdpr] takeover failed");
        failureResponse(res, 403, "unauthorized");
        return;
      } else {
        var wrapper = JSON.parse(userWrapper);
        if (typeof(wrapper) === "undefined" || wrapper === null) {
          respond(res, {
            success: false,
            status: "handover_failed"
          });
          console.log("Not found wrapper", userWrapper, "for token", token);
          return;
        }
        const owner_id = wrapper.owner;
        console.log("[login][oauth] fetching owner: " + owner_id);
        userlib.get(owner_id, function(gerr, doc) {
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
            if (gdpr_consent == false) {
              changes['delete'] = true;
            }

            // Edit and save user's GDPR consent
            user.update(owner_id, req.body, function(success, status) {
              console.log("Updating GDPR settings...");
              respond(res, {
                success: success,
                status: status
              });
            });
          }
        });
      }
    });

    // Logout or redirect to dashboard...

  });

  /* Used to provide user data in compliance with GDPR. */
  app.post('/gdpr/transfer', function(req, res) {

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

    var owner_id = Validator.owner(req.session.owner);
    userlib.get(owner_id, function(error, udoc) {
      if (error) {
        respond(res, {
          success: false,
          status: error
        });
        return;
      }
      devices.list(owner_id, function(dsuccess, ddevices) {
        apienv.list(owner_id, function(esuccess, envs) {
          respond(res, {
            success: !error && dsuccess && esuccess,
            user_data: udoc,
            device_data: devices,
            environment: envs
          });
        });
      });
    });
  });

  /* Used to revoke user data in compliance with GDPR. */
  app.post('/gdpr/revoke', function(req, res) {
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
    var owner_id = Validator.owner(req.session.owner);
    if (req.body.owner !== owner_id) {
      respond(res, {
        success: false,
        status: "deletion_not_confirmed"
      });
      return;
    }

    userlib.get(owner_id, function(error, udoc) {
      if (error) {
        respond(res, {
          success: false,
          status: error
        });
      } else {

        console.log("Deleting owner " + owner_id);
        devices.list(owner_id, (dsuccess, devicez) => {
          if (dsuccess) {
            devicez.forEach(() => {
              devicez.revoke(owner_id, req.body, function(rsuccess, status) {
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

        redis_client.keys("/" + owner_id + "/*", function(err, obj_keys) {
          console.dir("Deleting Redis cache for this owner: " + owner_id);
          for (var key in obj_keys) {
            redis_client.expire(key, 1);
          }
        });

        userlib.destroy(udoc._id, udoc._rev, function(err) {
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

  /* GET request, ready for testing... */
  app.get('/test', function(req, res) {
    respond(res, { success: true });
  });



  /*
   * thinx-connect gateway validation (device calls /lick with its mac and must receive its api key)
   * therefore gateway must be authenticated as well by an api key!
   * UNUSED, INCOMPLETE. DRAFT.

  app.get('/lick', function(req, res) {

    // search by mac, return last api key hash

    devicelib.view("devicelib", "devices_by_mac", {
        key: device.normalizedMAC(reg.query.mac),
        include_docs: true
      },

      function(err, body) {

        if (err || (typeof(body)=== "undefined") || (body === null)) {
          console.log(
            "Device with this UUID/MAC not found. Seems like new one..."
          );
          respond(res, {
            success: false,
            status: "device_key_unknown"
          });
          return;
        }

        if (typeof(this.device) != "undefined" && this.device !== null) {
          console.log("Known device identified by MAC address: " + this.device.normalizedMAC(reg.mac));
        } else {
          console.log("Refactoring error: device is: " + this.device);
        }

        if (body.rows.length === 0) {
          // device not found by mac; this is a new device...
          respond(res, {
            success: false,
            status: "device_not_found"
          });
        } else {

          console.log("ROWS:" + JSON.stringify(body.rows));

          // Device should receive hash of its api key but is unable to calculate aes so it will get the key
          var device = body.rows[0];
          var lastkey = device.lastkey;
          respond(res, {
            success: true,
            status: lastkey
          });
        }
      });
  }); */



};
