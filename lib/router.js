/* New Router */

module.exports = function(app) {

  var redis = require('redis');
  var typeOf = require("typeof");
  var sha256 = require("sha256");
  var https = require('https');

  var Sqreen;

  var Globals = require("./thinx/globals.js"); // static only!
  if (Globals.use_sqreen()) {
    if ((typeof(process.env.SQREEN_APP_NAME) !== "undefined") && (typeof(process.env.SQREEN_TOKEN) !== "undefined")) {
      try {
        Sqreen = require('sqreen');
      } catch (bitch) {
        console.log(bitch);
      }
    } else {
      console.log("Sqreen env vars not available");
   }
  }


  // Globals

  const hour = 3600 * 1000;
  const day = hour * 24;
  const fortnight = day * 14;

  var global_token = null;
  var global_response = null;

  const app_config = Globals.app_config();

  var prefix = Globals.prefix();
  var rollbar = Globals.rollbar(); // lgtm [js/unused-local-variable]
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

  console.log("Loading module: builder...");
  var Builder = require("../lib/thinx/builder");
  var builder = new Builder();

  console.log("Loading module: device...");
  var Device = require("../lib/thinx/device");
  var device = new Device();

  console.log("Loading module: deployment...");
  var Deployment = require("../lib/thinx/deployment");
  var deployment = new Deployment();

  console.log("Loading module: apienv...");
  var APIEnv = require("../lib/thinx/apienv");
  var apienv = new APIEnv();

  console.log("Loading module: apikey...");
  var APIKey = require("../lib/thinx/apikey");
  var apikey = new APIKey();

  console.log("Loading module: owner...");
  var User = require("../lib/thinx/owner");
  var user = new User();

  console.log("Loading module: rsakey...");
  var RSAKey = require("../lib/thinx/rsakey");
  var rsakey = new RSAKey();

  console.log("Loading module: statistics...");
  var Stats = require("../lib/thinx/statistics");
  var stats = new Stats();

  console.log("Loading module: sources...");
  var Sources = require("../lib/thinx/sources");
  var sources = new Sources();

  var messenger = app.messenger; // reusing app instance of messenger

  console.log("Loading module: devices...");
  var Devices = require("../lib/thinx/devices");
  var devices = new Devices(messenger);

  console.log("Loading module: device transfer...");
  var Transfer = require("../lib/thinx/transfer");
  var transfer = new Transfer(messenger);

  var db = app_config.database_uri;
  var devicelib = require("nano")(db).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]
  var userlib = require("nano")(db).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]

  const Buildlog = require("../lib/thinx/buildlog"); // must be after initDBs as it lacks it now
  const blog = new Buildlog();


  // Functions

  var last_client_ip = null;

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
    last_client_ip = ipAddress;
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
      return true;
    } else {
      if (typeof(req.session) !== "undefined") {
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
      res.end("validate: Client request has invalid User-Agent '" + ua + "'");
      return false;
    }
  }

  console.log("Initializing Simple OAuth...");

  //
  // OAuth2
  //

  const simpleOauthModule = require('simple-oauth2');
  var oauth2;

  if (typeof(google_ocfg) !== "undefined" && google_ocfg !== null) {
     oauth2 = simpleOauthModule.create({
      client: {
        id: google_ocfg.web.client_id,
        secret: google_ocfg.web.client_secret,
      },
      auth: {
        tokenHost: 'https://accounts.google.com/',
        authorizePath: '/o/oauth2/auth',
        tokenPath: '/o/oauth2/token'
      },
    });
  }

  //
  // OAuth2 for GitHub
  //

  console.log("Initializing GitHub OAuth...");

  var githubOAuth;
  if (typeof(github_ocfg) !== "undefined" && github_ocfg !== null) {
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
    console.log("trackUserLogin");
     userlib.atomic("users", "checkin", owner_id, {
       last_seen: new Date()
     }, function(error, response) {
       if (error) {
         console.log("Last-seen update failed (3): " + error);
       } else {
         console.log("alog: Last seen updated.");
         alog.log(owner_id, "Last seen updated.");
       }
     });

     console.log("alog: OAuth2 User logged in...");
     alog.log(owner_id, "OAuth2 User logged in...");

     if (Globals.use_sqreen()) {
       Sqreen.auth_track(true, { username: owner_id });
     }
  }

  function checkUserWithResponse(global_response, token, userWrapper) {

    // Check user and make note on user login
    userlib.get(userWrapper.owner_id, (error, udoc) => {

      // Error case covers creating new user/managing deleted account
      if (error) {

        if (Globals.use_sqreen()) {
          Sqreen.auth_track(false, { doc: userWrapper.owner_id });
        }

        console.log("Failed with error: " + error);

        if (error.toString().indexOf("Error: deleted") !== -1) {
          // TODO: Redirect to error page with reason
          console.log("[oauth] user document deleted");

          // This redirect also fails.
          global_response.redirect(
            app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
            'Account document deleted.'
          );
          return;

        } else {


          // May exist, but be deleted. Can be cleared using Filtered Replication Handler "del"
          if (typeof(udoc) !== "undefined") {
            if ((typeof(udoc.deleted) !== "undefined") && udoc.deleted ===
              true) {
              if (Globals.use_sqreen()) {
                Sqreen.auth_track(false, { doc: userWrapper.owner_id });
              }
              // TODO: Redirect to error page with reason
              console.log("[oauth] user account marked as deleted");
              global_response.redirect(
                app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
                'Account deleted.'
              );
              return;
            }
          }

          // No such owner, create...
          user.create(userWrapper, false, (success, status) => {

            console.log("[OID:" + userWrapper.owner_id + "] [NEW_SESSION] [oauth] 2485:");

            alog.log(userWrapper.owner_id, "OAuth User created. ");

            redis_client.set(token, JSON.stringify(userWrapper));
            redis_client.expire(token, 30);
            global_token = token;

            const ourl = app_config.acl_url + "/auth.html&t=" + token + "&g=true"; // require GDPR consent
            console.log("FIXME: this request will probably fail fail (cannot redirect): " + ourl);
            // causes registration error where headers already sent!
            global_response.redirect(ourl); // must be global_response! res does not exist here.

            if (Globals.use_sqreen()) {
              Sqreen.signup_track({ username: userWrapper.owner_id });
            }

            console.log("Redirecting to login (2)");
          });
          return;
        }
      }

      // console.log("UDOC:");
      // console.log(JSON.stringify(udoc));

      trackUserLogin(userWrapper.owner_id);

      redis_client.set(token, JSON.stringify(userWrapper));
      redis_client.expire(token, 3600);

      console.log("Redirecting to login (1)");

      var gdpr = false;
      if (typeof(udoc.info) !== "undefined") {
        if (typeof(udoc.gdpr_consent) !== "undefined" && udoc.gdpr_consent == true) {
          gdpr = true;
        }
      }

      const ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=" + gdpr; // require GDPR consent
      console.log("ourl: "+ ourl);
      global_response.redirect(ourl);

    }); // userlib.get
  }


  app.all("/*", function(req, res, next) {

    // res.cookie('XSRF-TOKEN', req.csrfToken());

    var client = req.get("User-Agent");

    if (typeOf(client) === "undefined") {
      console.log("Dropping connection for client without user-agent.");
      res.status(403).end();
      return;
    }

    if (client.indexOf("Jorgee") !== -1) {
      app.BLACKLIST.push(getClientIp(req));
      res.status(403).end();
      console.log("Jorgee is blacklisted.");
      return;
    }

    if (req.originalUrl.indexOf("admin") !== -1) {
      app.BLACKLIST.push(getClientIp(req));
      res.status(403).end();
      console.log("admin is blacklisted because of request "+req.originalUrl);
      return;
    }

    if (req.originalUrl.indexOf("php") !== -1) {
      app.BLACKLIST.push(getClientIp(req));
      res.status(403).end();
      console.log("php is blacklisted.");
      return;
    }

    if (req.originalUrl.indexOf("\\x04\\x01\\x00") !== -1) {
      app.BLACKLIST.push(getClientIp(req));
      res.status(403).end();
      console.log("hrrtbleed is blacklisted.");
      return;
    }

    if (req.headers.origin === "device") {
      next();
      return;
    }

    // Problem is, that the device API should be separate and have different Access-Control
    // var webHostname = process.env.WEB_HOSTNAME || "rtm.thinx.cloud";

    var acl_url = app_config.public_url;

    if (typeof(app_config.acl_url) === "undefined") {
      acl_url = app_config.public_url.replace("https://", "").replace("http://", "");
    }

    // cannot use this with allow origin * res.header("Access-Control-Allow-Credentials", "true");
    // analysis: will PROBABLY have to be refactored to anything but Device-Registration and Devoce-OTA requests
    if ((req.originalUrl.indexOf("register") === -1) &&
        (req.originalUrl.indexOf("firmware") === -1)) {
      //console.log("Setting CORS to " + app_config.public_url);

      if (app_config.debug.allow_http_login) {
        res.header("Access-Control-Allow-Origin", "*");
      } else {
        res.header("Access-Control-Allow-Origin", acl_url); // lgtm [js/cors-misconfiguration-for-credentials]
      }

      res.header("Access-Control-Allow-Credentials", "true");
      //console.log("Setting CORS to acl_url "+app_config.acl_url);
    } else {
      console.log("Setting CORS to *");
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Credentials", "false");
    }

    if (app_config.acl_url == "localhost") {
      res.header("Access-Control-Allow-Origin", "*"); // localhost is invalid access-control value
    }

    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-type,Accept,X-Access-Token,X-Key");

    if (req.method == "OPTIONS") {
      res.status(200).end();
    } else {
      next();
    }

    if (client == client_user_agent) {
      if (typeof(req.headers.origin) !== "undefined") {
        if (req.headers.origin == "device") {
          next();
          return;
        }
      }
    }

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
        console.log("[OID:0] [" + req.method + "]:" + req.url + "(" +
          client + ")");
      }
    }
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

  /* Fetch device data. */
  app.post("/api/device/data", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    var udid = Validator.udid(req.body.udid);
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

    apikey.create(owner, new_api_key_alias, function(success,
      object) {
      if (success) {
        console.log("Getting owner " + owner + " for API Key...");
        respond(res, {
          success: true,
          api_key: object.key,
          hash: sha256(object.key)
        });
        return;
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
        return;
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
      branch: branch
    };

    sources.add(object, function(success, response) {
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
    user.profile(owner, function(success, response) {
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

    validateRequest(req, res);
    var ip = getClientIp(req);

    if (typeof(req.body) === "undefined") {
      respond(res, {
        success: false,
        status: "no_body"
      });

    } else if (typeof(req.body.registration) === "undefined") {
      console.log("Incoming request has no `registration` in body, should BLACKLIST " + ip);
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
      var rip = getClientIp(req);
      console.log("Incoming request from "+rip);
      //console.log("Incoming request has `registration` in body, with IP " + rip);
      //console.log("headers: " + JSON.stringify(req.headers));

      //const regTime = new Date().getMilliseconds();
      //console.log("** REG BODY: " + regTime);
      var registration = req.body.registration;
      device.register(registration, req.headers.authentication, app._ws, function(success, response) {
        // Append timestamp inside as library is not parsing HTTP response JSON properly
        // when it ends with anything else than }}
        if (success && typeof(response.registration) !== "undefined") {
          response.registration.timestamp = Math.floor(new Date() / 1000);
        }
        if (success === false) {
          console.log("Device registration failed with response: " + response);
        } else {
          if (app_config.debug.device) {
            console.log("Device registration response: " , {response});
          }
        }
        respond(res, response);
      }, req);
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

    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    if (typeof(req.body.changes) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_changes"
      });
      return;
    }

    device.edit(req.session.owner, req.body.changes, function(success, message) {
      respond(res, {
        success: success,
        message: message
      });
    });
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
    builder.build(req.session.owner, req.body.build, notifiers,
      function(success, response) {
      respond(res, response);
    });
  });

  // Get build artifacts
  app.post("/api/device/artifacts", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    var udid = Validator.udid(req.body.udid);

    if (typeof(udid) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_udid"
      });
      return;
    }

    var build_id = Validator.udid(req.body.build_id);

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

      for (var bindex in body.rows) {

        if (!{}.hasOwnProperty.call(body.rows, bindex)) return;

        var row = body.rows[bindex];

        //console.log("Build log row: " + JSON.stringify(row));

        if (typeof(row.value.log) === "undefined") {
          var build = {
            date: body.value.timestamp,
            udid: body.value.udid
          };
          builds.push(build);
        } else {
          // this is all wrong, it just changes key names... object should be reusable across app
          for (var dindex in row.value.log) {
            if (!{}.hasOwnProperty.call(row.value.log, dindex)) return;
            var buildlog = {
              message: row.value.log[dindex].message,
              date: row.value.log[dindex].timestamp,
              udid: row.value.log[dindex].udid,
              build_id: row.value.log[dindex].build
            };
            builds.push(buildlog);
          }
        }
      }

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

    blog.fetch(req.body.build_id, function(err, body) {
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

  // WARNING! New, untested!

  /* Returns specific build log for owner */
  app.post("/api/user/logs/tail", function(req, res) {
    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;
    var owner = req.session.owner;
    if (typeof(req.body.build_id) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_build_id"
      });
      return;
    }
    var error_callback = function(err) {
      console.log(err);
      res.set("Connection", "close");
      respond(res, err);
    };
    console.log("Tailing build log for " + req.body.build_id);
    blog.logtail(req.body.build_id, owner, app._ws, error_callback);
  });

  /*
   * Device Transfer
   */

  /* Request device transfer */
  app.post("/api/transfer/request", function(req, res) {

    if (!(validateSecurePOSTRequest(req) || validateSession(req, res))) return;

    var owner = req.session.owner;

    transfer.request(owner, req.body, function(success, response) {
      if (success === false) {
        //console.log(response);
        res.redirect(
          app_config.acl_url + "/error.html?success=failed&reason=" +
          response);
      } else {
        res.redirect(app_config.acl_url + "/error.html?success=true");
      }
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
      if (success === false) {
        //console.log(response);
        res.redirect(
          app_config.acl_url + "/error.html?success=failed&reason=" +
          response);
      } else {
        res.redirect(app_config.acl_url + "/error.html?success=true");
      }
    });
  });

  var parseTransferResponse = function(success, response, res) {
    if (success === false) {
      console.log("parseTransferResponse: " + { response });
      res.redirect(app_config.acl_url + "/error.html?success=failed&reason=" + response);
    } else {
      res.redirect(app_config.acl_url + "/error.html?success="+success.toString());
    }
  };

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
      parseTransferResponse(success, response, res);
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
      parseTransferResponse(success, response, res);
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
        console.log("alog: Last seen updated.");
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

        userlib.get(owner_id, function(err, doc) {

          if (err) {

            // Support for creating accounts to non-existent e-mails automatically
            console.log("[oauth] owner_id not found, creating: " + owner_id);
            user.create(wrapper, false, function(success, status) {

              console.log("Result creating OAuth user:");
              console.log(success, status);

              req.session.owner = wrapper.owner;
              console.log("[OID:" + req.session.owner +
                "] [NEW_SESSION] [oauth] 1828: ");

              req.session.cookie.secure = true;
              req.session.cookie.httpOnly = true;
              req.session.cookie.maxAge = fortnight;

              res.cookie("x-thx-session-expire", fortnight, {
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

            req.session.owner = doc.owner;

            console.log("[OID:" + doc.owner + "] [NEW_SESSION] [oauth] thinx.js:1854...");

            console.log("alog: New session.");
            alog.log(doc.owner, "New session.", "info");

            req.session.cookie.maxAge = new Date(Date.now() + hour).getTime();
            req.session.cookie.secure = true;
            req.session.cookie.httpOnly = true;

            if ( (typeof(req.body.remember) === "undefined") ||
                 (req.body.remember === 0) ) {
              req.session.cookie.maxAge = 24 * hour;
            } else {
              req.session.cookie.maxAge = fortnight;
            }

            console.log("alog: OAuth User logged in:");
            alog.log(doc.owner, "OAuth User logged in: " + doc.username, "info");

            if (Globals.use_sqreen()) {
              Sqreen.auth_track(true, { username: doc.owner });
            }

            respond(res, { "redirectURL": "/app" });

            console.log("alog: Will: updateLastSeen()");
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

    req.session.owner = user_data.owner;

    if (typeof(req.session.owner) !== "undefined") {

      console.log("typeof(req.session.owner) is defined, redirecting to "+ourl);

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
    var owner_id = null;

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
        req.session.destroy(function(err) {
          if (err) {
            console.log(err);
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
          req.session.owner = user_data.owner;

          // This log message is later duplicated in [oauth] and other variants
          // console.log("[OID:" + req.session.owner + "] [NEW_SESSION] on /login");

          if ( (typeof(req.body.remember) === "undefined") ||
               (req.body.remember === 0)) {
            req.session.cookie.maxAge = 24 * hour;
            var expiration = (req.session.cookie.expires < 24*hour) ? req.session.cookie.expires : 24*hour;
            res.cookie("x-thx-session-expire", expiration, {
              maxAge: 24 * hour,
              httpOnly: false
            });
          } else {
            req.session.cookie.maxAge = fortnight;
            res.cookie("x-thx-session-expire", fortnight, {
              maxAge: fortnight,
              httpOnly: false
            });
          }

          req.session.cookie.secure = true;
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
              }, function(error, response) {
                if (err) {
                  console.log("Last-seen update failed (2): " + err);
                } else {
                  req.session.owner = user_data.owner;
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

  app.get("/slack/redirect", function(req, res) {

    console.log("Redirect URL: " + JSON.stringify(req.url));
    console.log("Redirect GET: " + JSON.stringify(req.body));
    console.log("Redirect Code: " + req.query.code);
    console.log("Redirect State: " + req.query.state);

    // https://slack.com/api/oauth.access?client_id=233115403974.233317554391&client_secret=ccbaae01e5259ed283ef63321be597da&code=owner_id&redirect_uri=" + app_config.public_url + ":7443/slack/redirect
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

    res.redirect(
      "https://" + process.env.THINX_HOSTNAME + "/app/#/profile/help"
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

      console.log("[githubOAuth]  GitHub Login successfull...");

      if (typeof(oauth_token.access_token) === "undefined") {
        console.log("[githubOAuth] No OAuth access token available, exiting.");
        return;
      }

      console.log(JSON.stringify("Getting user..."));

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

          var given_name = "GitHub";
          var family_name = "User";

          var hdata = JSON.parse(data);
          console.log("hdata: " + JSON.stringify(hdata));

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
            console.log("Warning: no name in GitHub access token response.");
            rollbar.info({
              "github login hdata": hdata
            });
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
              app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
              'Missing e-mail.'
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

          console.log("[oauth][github] searching for owner_id: " + owner_id);
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

   function processGoogleCallbackError(error, ores, udoc, req, odata, userWrapper, access_token) {
     console.log("User does not exist...");
     // User does not exist
     if (error.toString().indexOf("Error: deleted") !== -1) {
       // Redirect to error page with reason for deleted documents
       console.log("[oauth] user document deleted");
       ores.redirect(
         app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=' +
         'account_doc_deleted');
       return;

     } else {
       console.log("Userlib get OTHER error: " + error.toString());
       if (typeof(udoc) !== "undefined") {
         if ((typeof(udoc.deleted) !== "undefined") && udoc.deleted ===
           true) {
           // TODO: Redirect to error page with reason
           console.log(
             "[oauth] user account marked as deleted");
           ores.redirect(
             app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=' +
             'account_deleted');
           return;
         }
       }
       req.session.owner = userWrapper.owner;
       createUserWithGoogle(req, ores, odata, userWrapper, access_token);
     }
  }


  if (typeof(google_ocfg) !== "undefined" && google_ocfg !== null) {

    // Initial page redirecting to OAuth2 provider
    app.get('/oauth/google', function(req, res) {
      // User requested login, destroy existing session first...
      if (typeof(req.session) !== "undefined") {
        req.session.destroy();
      }
      crypto.randomBytes(48, (err, buffer) => {
        var token = buffer.toString('hex');
        console.log("saving google auth token for 5 minutes: "+token);
        redis_client.set("oa:"+token+":g", 300); // auto-expires in 5 minutes
        // Authorization uri definition
        const authorizationUri = oauth2.authorizationCode.authorizeURL({
          redirect_uri: google_ocfg.web.redirect_uris[0],
          scope: 'email openid profile',
          state: token // this string shall be random (returned upon auth provider call back)
        });
        console.log("[oauth][google] Redirecting to authorizationUri: " + authorizationUri);
        res.redirect(authorizationUri);
      });
    });

    /// CALLBACK FOR GOOGLE OAUTH ONLY!
    // Callback service parsing the authorization token and asking for the access token
    app.get('/oauth/cb', function(req, ores) {

      const options = {
        code: req.query.code,
        redirect_uri: google_ocfg.web.redirect_uris[0]
      };

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
        var gat_url = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=' + res2.access_token;
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
  }

  if (typeof(github_ocfg) !== "undefined" && github_ocfg !== null) {
    // Callback service parsing the authorization token and asking for the access token
    app.get('/oauth/gcb', function(req, res) {
      global_token = null; // reset token; single user only!!!!
      global_response = res;
      console.log("GCB BODY: " + JSON.stringify(res.body));
      console.log("Github OAuth2 Callback (TODO: validate redis oa:*:g token)...");
      githubOAuth.callback(req, res, function(err) {
        console.log("cberr: ", err);
        if (!err) {
          console.log("Should login with token now...");
          if (global_token !== null) {
            const rurl = app_config.acl_url + "/auth.html?t=" + global_token + "&g=" +
              false; // require GDPR consent
            res.redirect(rurl);
            global_token = null; // reset token for next login attempt
          } else {
            console.log("global token null on gcb");
          }
        } else {
          console.log(err.message);
        }
      });
    });
  }

  /* Use to issue/withdraw GDPR consent. */
  app.post('/gdpr', function(req, res) {

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
          return;
        }
        const owner_id = wrapper.owner;
        console.log("[login][oauth] fetching owner: " + owner_id);
        userlib.get(owner_id, function(err, doc) {
          if (err) {
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
              console.log("Updating user profile...");
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
    userlib.get(owner_id, function(error, user) {
      if (error) {
        respond(res, {
          success: false,
          status: error
        });
        return;
      }
      devices.list(owner_id, function(dsuccess, devices) {
        apienv.list(owner_id, function(esuccess, envs) {
          respond(res, {
            success: !error && dsuccess && esuccess,
            user_data: user,
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

    userlib.get(owner_id, function(error, user) {
      if (error) {
        respond(res, {
          success: false,
          status: error
        });
      } else {

        console.log("Deleting owner " + owner_id);
        devices.list(owner_id, (dsuccess, devices) => {
          devices.forEach(() => {
            devices.revoke(owner_id, req.body, function(success, status) {
              respond(res, {
                success: success,
                status: status
              });
            });
          });
        });

        console.log("Deleting all API keys for this owner...");
        redis_client.expire("ak:" + owner_id, 1);

        redis_client.keys("/" + owner_id + "/*", function(err, obj_keys) {
          console.dir("Deleting Redis cache for this owner: " + owner_id);
          for (var key in obj_keys) {
            redis_client.expire(key, 1);
          }
        });

        userlib.destroy(user._id, user._rev, function(err) {
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
