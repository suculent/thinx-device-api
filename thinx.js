/*
 * This THiNX-RTM API module is responsible for responding to devices and build requests.
 */

var ThinxApp = function() {

  var global_token = null;
  var global_response = null;
  var exec = require("child_process");
  var typeOf = require("typeof");
  var Rollbar = require("rollbar");
  var crypto = require('crypto');
  var auth = require('./lib/thinx/auth.js');

  console.log(crypto.getCiphers()); // log supported ciphers to debug SSL IoT transport

  require("ssl-root-cas").inject();

  var http = require('http');
  var redis = require('redis');
  var redis_client = redis.createClient();
  var path = require('path');

  //
  // Shared Configuration
  //

  const hour = 3600 * 1000;
  const day = hour * 24;
  const fortnight = day * 14;

  console.log("--- " + new Date() + " ---");

  //
  // Environment-dependent configurations
  //

  var google_ocfg;
  var github_ocfg;

  var session_config = require("./conf/node-session.json");
  var app_config = require("./conf/config.json"); // this file should be actually omitted from repository

  // requires existing sqreen.json or ENV vars defined
  var use_sqreen = true;

  if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
    console.log("» Starting server on Circle CI...");
    app_config = require("./conf/config-test.json");
    google_ocfg = require('./conf/google-oauth-test.json');
    github_ocfg = require('./conf/github-oauth-test.json');
    use_sqreen = false;
  }
  if (process.env.LOGNAME == "sychram") {
    console.log("» Starting on workstation...");
    app_config = require("./conf/config-local.json");
    google_ocfg = require('./conf/google-oauth.json');
    github_ocfg = require('./conf/github-oauth.json');
    use_sqreen = false;
  }
  if (process.env.LOGNAME == "root") {
    console.log("» Starting in production 'root' mode (needs to control Docker until Agens)...");
    app_config = require("./conf/config.json");
    google_ocfg = require('./conf/google-oauth.json');
    github_ocfg = require('./conf/github-oauth.json');
  }

  var rollbar = new Rollbar({
    accessToken: app_config.rollbar_token,
    handleUncaughtExceptions: true,
    handleUnhandledRejections: true
  });

  var Sqreen = null;

  if (use_sqreen) {
    Sqreen = require('sqreen');
  }

  //
  // OAuth2
  //

  const simpleOauthModule = require('simple-oauth2');

  const oauth2 = simpleOauthModule.create({
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

  //
  // OAuth2 for GitHub
  //

  var githubOAuth;

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

  //
  // App
  //

  var client_user_agent = app_config.client_user_agent;
  var db = app_config.database_uri;
  var serverPort = app_config.port;
  var socketPort = app_config.socket;

  //var url = require("url");
  var https = require("https");
  var parser = require("body-parser");
  var nano = require("nano")(db);
  var sha256 = require("sha256");

  var fs = require("fs");

  var v = require("./lib/thinx/version");
  var alog = require("./lib/thinx/audit");
  var blog = require("./lib/thinx/buildlog");
  var builder = require("./lib/thinx/builder");
  var device = require("./lib/thinx/device");
  var devices = require("./lib/thinx/devices");
  var deployment = require("./lib/thinx/deployment");

  var watcher = require("./lib/thinx/repository");
  watcher.watch();

  var apienv = require("./lib/thinx/apienv");
  var apikey = require("./lib/thinx/apikey");
  var user = require("./lib/thinx/owner");
  var rsakey = require("./lib/thinx/rsakey");
  var stats = require("./lib/thinx/statistics");
  var sources = require("./lib/thinx/sources");
  var transfer = require("./lib/thinx/transfer");
  var messenger = require("./lib/thinx/messenger");

  var slack_webhook = app_config.slack_webhook;
  var thinx_slack = require("slack-notify")(slack_webhook);

  var WebSocket = require("ws");

  // list of previously discovered attackers
  var BLACKLIST = [];

  var last_client_ip = null;

  var getClientIp = function(req) {
    var ipAddress = req.ip;
    if (!ipAddress) {
      console.log("Unknown Client IP: thinx.cloud");
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

  // EXTRACT TO: db.js -->

  /*
   * Databases
   */

  var prefix = "";
  try {
    var pfx_path = app_config.project_root + '/conf/.thx_prefix';
    if (fs.existsSync(pfx_path)) {
      prefix = fs.readFileSync(pfx_path) + "_";
    }
  } catch (e) {
    console.log("[index] thx_prefix_exception" + e);
  }

  function initDatabases() {

    nano.db.create(prefix + "managed_devices", function(err, body, header) {
      if (err) {
        handleDatabaseErrors(err, "managed_devices");
      } else {
        console.log("» Device database creation completed. Response: " +
          JSON.stringify(
            body) + "\n");
      }
    });

    nano.db.create(prefix + "managed_builds", function(err, body, header) {
      if (err) {
        handleDatabaseErrors(err, "managed_builds");
      } else {
        console.log("» Build database creation completed. Response: " +
          JSON
          .stringify(
            body) + "\n");
      }
    });

    nano.db.create(prefix + "managed_users", function(err, body, header) {
      if (err) {
        handleDatabaseErrors(err, "managed_users");
      } else {
        console.log("» User database creation completed. Response: " +
          JSON
          .stringify(
            body) + "\n");
      }
    });
  }

  function handleDatabaseErrors(err, name) {

    if (err.toString().indexOf("the file already exists") != -1) {
      // silently fail, this is ok

    } else if (err.toString().indexOf("error happened in your connection") !=
      -
      1) {
      console.log("🚫 Database connectivity issue. " + err);
      process.exit(1);

    } else {
      console.log("🚫 Database " + name + " creation failed. " + err);
      process.exit(2);
    }
  }

  /*

  // Vault server must be started, initialized and root token to unseal key must be known

  // Database access
  // ./vault write secret/password value=13fd9bae19f4daffa17b34f05dbd9eb8281dce90 owner=test revoked=false
  // Vault init & unseal:

  var options = {
  	apiVersion: 'v1', // default
  	endpoint: 'http://127.0.0.1:8200', // default
  	token: 'b7fbc90b-6ae2-bbb8-ff0b-1a7e353b8641' // optional client token; can be fetched after valid initialization of the server
  };


  // get new instance of the client
  var vault = require("node-vault")(options);

  // init vault server and use it to store secret information (user password or similar key, and/or device location)
  vault.init({
  		secret_shares: 1,
  		secret_threshold: 1
  	})
  	.then((result) => {
  		var keys = result.keys;
  		// set token for all following requests
  		vault.token = result.root_token;
  		// unseal vault server
  		return vault.unseal({
  			secret_shares: 1,
  			key: keys[0]
  		})
  	})
  	.catch(console.error);

  vault.write('secret/hello', { value: 'world', lease: '1s' })
    .then( () => vault.read('secret/hello'))
    .then( () => vault.delete('secret/hello'))
    .catch(console.error);

  */

  initDatabases();

  var devicelib = require("nano")(db).use(prefix + "managed_devices");
  var userlib = require("nano")(db).use(prefix + "managed_users");

  // <-- EXTRACT TO: db.js && databases must not be held by app class

  // Express App

  var express = require("express");
  var session = require("express-session");

  var app = express();

  console.log("» Starting Redis client...");
  var redisStore = require("connect-redis")(session);

  app.set("trust proxy", 1);

  require('path');

  app.use(session({
    secret: session_config.secret,
    "cookie": {
      "maxAge": 86400000,
      "secure": true,
      "httpOnly": true
    },
    store: new redisStore({
      host: "localhost",
      port: 6379,
      client: redis_client
    }),
    name: "x-thx-session",
    resave: true,
    rolling: false,
    saveUninitialized: false,
  }));
  // rolling was true; This resets the expiration date on the cookie to the given default.

  app.use(parser.json({
    limit: "1mb"
  }));

  app.use(parser.urlencoded({
    extended: true,
    parameterLimit: 1000,
    limit: "1mb"
  }));

  app.use(function(req, res, next) {
    var ipAddress = getClientIp(req);
    if (BLACKLIST.toString().indexOf(ipAddress) === -1) {
      next();
    } else {
      console.log("Returning error, blacklisted.");
      res.status(403).end();
    }
  });

  app.all("/*", function(req, res, next) {

    var client = req.get("User-Agent");

    if (typeOf(client) === "undefined") {
      console.log("Dropping connection for client without user-agent.");
      res.status(403).end();
      client = "";
    }

    if (client.indexOf("Jorgee") !== -1) {
      BLACKLIST.push(getClientIp(req));
      res.status(403).end();
      console.log("Jorgee is blacklisted.");
      return;
    }

    if (req.originalUrl.indexOf("admin") !== -1) {
      BLACKLIST.push(getClientIp(req));
      res.status(403).end();
      console.log("admin is blacklisted.");
      return;
    }

    if (req.originalUrl.indexOf("php") !== -1) {
      BLACKLIST.push(getClientIp(req));
      res.status(403).end();
      console.log("php is blacklisted.");
      return;
    }

    if (req.originalUrl.indexOf("\\x04\\x01\\x00") !== -1) {
      BLACKLIST.push(getClientIp(req));
      res.status(403).end();
      console.log("hrrtbleed is blacklisted.");
      return;
    }

    if (req.headers.origin == "device") {
      next();
      return;
    }

    // Problem is, that the device API should be separate and have different Access-Control
    var allowedOrigins = [app_config.public_url, 'http://rtm.thinx.cloud', 'https://cdnjs.cloudflare.com', 'https://d37gvrvc0wt4s1.cloudfront.net', '*'];
    var origin = req.headers.origin;
    if (allowedOrigins.indexOf(origin) > -1){
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      if ((typeof(origin) === "undefined") || (origin === NULL)) {
        // res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        // device-wise
      } else {
        // hack! for monitoring disallowed (unlisted, forgotten originsd)
        console.log("Request origin: "+origin);
        res.setHeader('Access-Control-Allow-Origin', origin);
        console.log("Dis-Allowed origin: "+origin);
      }
    }
    //res.header("Access-Control-Allow-Origin", allowedOrigin); // rtm.thinx.cloud
    res.header("Access-Control-Allow-Credentials", "true");
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
    if ((typeof(req.session) !== "undefined") && (typeof(req.session
        .owner) !== "undefined")) {
      // console.log("[OID:" + req.session.owner + "] ", req.method + " : " + req.url);
    } else {
      // Skip logging for monitoring sites
      if (client.indexOf("uptimerobot")) {
        return;
      }
      if (req.method != "OPTIONS") {
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
    if (!validateSecureGETRequest(req)) return;
    if (!validateSession(req, res)) return;
    var owner = req.session.owner;
    devices.list(owner, function(success, response) {
      respond(res, response);
    });
  });

  /* Attach code source to a device. Expects unique device identifier and source alias. */
  app.post("/api/device/attach", function(req, res) {
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
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
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
    var owner = req.session.owner;
    var udid = req.body.udid;
    // var apikey = req.body.key;
    // apikey.verify(owner, api_key, req, function(success, message) {

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
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
    var owner = req.session.owner;
    devices.detach(owner, req.body, function(success, status) {
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  /* Revokes a device. Expects unique device identifier. */
  app.post("/api/device/revoke", function(req, res) {
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
    var owner = req.session.owner;
    devices.revoke(owner, req.body, function(success, status) {
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
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
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

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    if (!validateSecureGETRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    if (!validateSecureGETRequest(req)) return;
    if (!validateSession(req, res)) return;

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
    if (!validateSecureGETRequest(req)) return;
    if (!validateSession(req, res)) return;
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

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    var url = req.body.url;
    var alias = req.body.alias;

    sources.add(req.session.owner, alias, url, branch,
      function(success, response) {
        respond(res, response);
      });
  });

  /* Removes a GIT repository. Expects alias. */
  app.post("/api/user/source/revoke", function(req, res) {

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    if (!validateSecureGETRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

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
      rsakey.revoke(owner, filenames,
        function(success, response) {
          respond(res, {
            success: success,
            status: response
          });
        });
      return;
    }

    respond(res, {
      success: false,
      status: "invalid_query"
    });

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
    var owner = req.query.owner; // for faster search
    var reset_key = req.query.reset_key; // for faster search
    user.password_reset(owner, reset_key, function(success, message) {
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
    console.log(JSON.stringify(req.query));
    var ac_key = req.query.activation;
    var ac_owner = req.query.owner;
    user.activate(ac_owner, ac_key, function(success, message) {

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
          "Returning message on app.post /api/user/password/set :" +
          JSON.stringify(message));
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
    console.log("/api/user/profile");
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
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

    // reject on invalid headers
    if (!validateSecureGETRequest(req)) return;
    if (!validateSession(req, res)) return;

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
    var ott = req.query.ott;
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
        console.log("SUCCESS! Should respond with contents...");
        // contents: {"md5":"891f8fb09489c05380536ba82538a147","filesize":586416,"payload":{"type":"Buffer","data":[233
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename=firmware.bin');
        res.setHeader('Content-Length', response.filesize);
        res.setHeader('x-MD5', response.md5);
        respond(res, response.payload);
      } else {
        console.log("FAILURE! Should respond with response...");
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
          console.log("Responding to OTT request with :" + JSON.stringify(response));
          respond(res, response);
        });

      // Device will fetch firmware/files now (wrapped as JSON or in binary, depending on type (firmware/file))
    } else {
      // TODO: use only one parameter for req or deprecate this
      device.firmware(req.body, req.headers.authentication, req,
        function(success, response) {
          console.log("Responding to Firmware request with :" + JSON.stringify(response));
          respond(res, response);
        });
    }
  });

  // Device login/registration
  // MAC is be allowed for initial regitration where device is given new UDID

  app.post("/device/register", function(req, res) {
    const startTime = new Date().getMilliseconds();

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
      //console.log("Incoming request has `registration` in body, with IP " + rip);
      //console.log("headers: " + JSON.stringify(req.headers));

      //const regTime = new Date().getMilliseconds();
      //console.log("** REG BODY: " + regTime);
      var registration = req.body.registration;
      device.register(registration, req.headers.authentication, _ws, function(success, response) {
        // Append timestamp inside as library is not parsing HTTP response JSON properly
        // when it ends with anything else than }}
        if (success && typeof(response.registration) !== "undefined") {
          response.registration.timestamp = Math.floor(new Date() / 1000);
        }
        if (success === false) {
          console.log("Device registration failed with response: " + JSON.stringify(response));
        } else {
          console.log("Device registration response: " + JSON.stringify(response));
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

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

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

  function failureResponse(res, code, reason) {
    res.writeHead(code, {
      "Content-Type": "application/json"
    });
    respond(res, {
      success: false,
      "status": reason
    });
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

  function validateSecureGETRequest(req, res) {
    if (req.method != "GET") {
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

  function validateSecurePOSTRequest(req, res) {
    if (req.method != "POST") {
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

  /*
   * Builder
   */

  // Build respective firmware and notify target device(s
  app.post("/api/build", function(req, res) {
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
    var notifiers = {
      messenger: messenger,
      websocket: _ws
    };
    builder.build(req.session.owner, req.body.build, notifiers, function(success, response) {
      respond(res, response);
    });
  });

  // Get build artifacts
  app.post("/api/device/artifacts", function(req, res) {

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

    var owner = req.session.owner;
    var udid = req.body.udid;

    if (typeof(udid) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_udid"
      });
      return;
    }

    var build_id = req.body.build_id;

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

    if (!validateSecureGETRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    if (!validateSecureGETRequest(req)) return;
    if (!validateSession(req, res)) return;

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

        var row = body.rows[bindex];

        //console.log("Build log row: " + JSON.stringify(row));

        if (typeof(row.value.log) === "undefined") {
          var build = {
            date: body.value.timestamp,
            udid: body.value.udid
          };
          builds.push(build);
        } else {

          for (var dindex in row.value.log) {
            var lastIndex = row.value.log[dindex];
            var buildlog = {
              message: lastIndex.message,
              date: lastIndex.timestamp,
              udid: lastIndex.udid,
              build_id: lastIndex.build
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

  /* Returns specific build log for owner */
  app.post("/api/user/logs/build", function(req, res) {

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

    var owner = req.session.owner;

    if (typeof(req.body.build_id) == "undefined") {
      respond(res, {
        success: false,
        status: "missing_build_id"
      });
      return;
    }

    var build_id = req.body.build_id;

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

      var logs = [];
      for (var lindex in body.rows) {
        if (!body.rows[lindex].hasOwnProperty("value")) continue;
        if (!body.rows[lindex].value.hasOwnProperty("log")) continue;
        var lrec = body.rows[lindex].value.log;
        logs.push(lrec);
      }

      console.log("Build-logs for build_id " + build_id + ": " +
        JSON
        .stringify(
          logs));

      var response = body;
      response.success = true;
      respond(res, response);
    });
  });

  // WARNING! New, untested!

  /* Returns specific build log for owner */
  app.post("/api/user/logs/tail", function(req, res) {

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

    var owner = req.session.owner;

    if (typeof(req.body.build_id) == "undefined") {
      respond(res, {
        success: false,
        status: "missing_build_id"
      });
      return;
    }

    var build_id = req.body.build_id;

    console.log("Tailing build log for " + build_id);

    var error_callback = function(err) {
      console.log(err);
      res.set("Connection", "close");
      respond(res, err);
    };

    blog.logtail(req.body.build_id, owner, _ws, error_callback);

  });

  /*
   * Device Transfer
   */

  /* Request device transfer */
  app.post("/api/transfer/request", function(req, res) {

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

    var owner = req.session.owner;

    transfer.request(owner, req.body, function(success, response) {
      if (success === false) {
        console.log(response);
        res.redirect(
          app_config.public_url + "/error.html?success=failed&reason=" +
          response);
      } else {
        res.redirect(app_config.public_url + "/error.html?success=true");
      }
    });
  });

  /* Decline device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/decline", function(req, res) {

    var owner = req.session.owner;

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
        console.log(response);
        res.redirect(
          app_config.public_url + "/error.html?success=failed&reason=" +
          response);
      } else {
        res.redirect(app_config.public_url + "/error.html?success=true");
      }
    });
  });

  /* Decline selective device transfer */
  app.post("/api/transfer/decline", function(req, res) {

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

    if (typeof(req.body.owner) !== "undefined") {
      respond(res, {
        success: false,
        status: "owner_missing"
      });
      return;
    }

    if (typeof(req.body.transfer_id) !== "undefined") {
      respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    if (typeof(req.body.udids) !== "undefined") {
      respond(res, {
        success: false,
        status: "udids_missing"
      });
      return;
    }

    transfer.decline(body, function(success, response) {
      if (success === false) {
        res.redirect(
          app_config.public_url + "/error.html?success=failed&reason=selective_decline_failed"
        );
      } else {
        res.redirect(app_config.public_url + "/error.html?success=true");
      }
    });
  });

  /* Accept device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/accept", function(req, res) {

    var owner = req.session.owner;

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
      if (success === false) {
        console.log(response);
        res.redirect(
          app_config.public_url + "/error.html?success=failed&reason=" +
          response);
      } else {
        res.redirect(app_config.public_url + "/error.html?success=true");
      }
    });
  });

  /* Accept selective device transfer */
  app.post("/api/transfer/accept", function(req, res) {

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

    if (typeof(req.body.owner) !== "undefined") {
      respond(res, {
        success: false,
        status: "owner_missing"
      });
      return;
    }

    if (typeof(req.body.transfer_id) !== "undefined") {
      respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    if (typeof(req.body.udids) !== "undefined") {
      respond(res, {
        success: false,
        status: "udids_missing"
      });
      return;
    }

    transfer.accept(req.body, function(success, response) {
      if (success === false) {
        console.log(response);
        res.redirect(app_config.public_url + "/error.html?success=failed");
      } else {
        res.redirect(app_config.public_url + "/error.html?success=true");
      }
    });
  });

  /*
   * Authentication
   */

  var updateLastSeen = function(doc) {
    userlib.atomic("users", "checkin", doc._id, {
      last_seen: new Date()
    }, function(error, response) {
      if (error) {
        console.log("Last-seen update failed: " + error);
      } else {
        alog.log(doc._id, "Last seen updated.");
      }
    });
  };

  // Front-end authentication, returns session on valid authentication
  app.post("/api/login", function(req, res) {

    // Request must be post
    if (req.method != "POST") {
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
            console.log("[login] user wrapper error: " + userWrapper);
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

                if (use_sqreen) {
                  Sqreen.signup_track({ username: owner_id });
                }

                alog.log(req.session.owner, "OAuth User created: " +
                  wrapper.first_name + " " + wrapper.last_name);

                respond(res, {
                  "redirectURL": "/app"
                });
              });

            } else {

              req.session.owner = doc.owner;

              console.log("[OID:" + req.session.owner +
                "] [NEW_SESSION] [oauth] 1854:");

              req.session.cookie.maxAge = new Date(Date.now() + hour);
              req.session.cookie.secure = true;
              req.session.cookie.httpOnly = true;

              if (typeof(req.body.remember === "undefined") || (req.body.remember ===
                  0)) {
                req.session.cookie.maxAge = 24 * hour;
              } else {
                req.session.cookie.maxAge = fortnight;
              }

              alog.log(req.session.owner, "OAuth User logged in: " +
                doc.username);

              if (use_sqreen) {
                Sqreen.auth_track(true, { username: doc.owner });
              }

              updateLastSeen(doc);
              respond(res, {
                "redirectURL": "/app"
              });
            }
          });
        }
        return;
      });
      return;
    }

    //
    // Username/password login Variant (with local token)
    //

    /* Input validation */

    if (typeof(req.body.password) === "undefined") {
      callback(false, "login_failed");
      if (use_sqreen) {
        Sqreen.auth_track(false, { doc: owner });
      }
      return;
    }

    //
    // Search the user in DB
    //

    var username = req.body.username;
    var password = sha256(req.body.password);

    if (typeof(username) === "undefined" || typeof(password) ===
      "undefined" && typeof(oauth) === "undefined") {
      req.session.destroy(function(err) {
        if (err) {
          console.log(err);
        } else {
          failureResponse(res, 403, "unauthorized");
          console.log("User unknown.");
        }
      });
      return;
    }

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
        if (username != all_user_data.key) {
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

          if (typeof(req.body.remember === "undefined") || (req.body.remember ===
              0)) {
            req.session.cookie.maxAge = 24 * hour;
            res.cookie("x-thx-session-expire", req.session.cookie.expires, {
              maxAge: req.session.cookie.maxAge,
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

          alog.log(user_data.owner, "User logged in: " +
            username);
        }

        // console.log("client_type: " + client_type);
        if (client_type == "device") {
          respond(res, {
            status: "WELCOME",
            success: true
          });
          return;

        } else if (client_type == "webapp") {

          /*
          console.log("Suspicious codepath: redirecting to /app in username/password login.");

          respond(res, {
            "redirectURL": "/app"
          });
          */

          // Make note on user login
          userlib.get(user_data.owner, function(error, udoc) {
            if (error) {
              console.log("[OID:"+user_data.owner + "] owner get error: " + error);
            } else {
              userlib.atomic("users", "checkin", udoc._id, {
                last_seen: new Date()
              }, function(error, response) {
                if (err) {
                  console.log("Last-seen update failed: " +
                    err);
                } else {
                  alog.log(udoc.owner,
                    "Last seen updated.");
                }
              });
            }
          });

          // return; continue...

        } else { // other client whan webapp or device
          respond(res, {
            status: "OK",
            success: true
          });
          return;
        }

      } else { // password invalid
        console.log("[LOGIN_INVALID] for " + username);
        alog.log(req.session.owner, "Password mismatch for: " +
          username, "error");
        respond(res, {
          status: "password_mismatch",
          success: false
        });
        return;
      }

      //
      // Login successful, redirect to app authentication route with some token...
      //

      var ourl = null; // outgoing URL

      var skip_gdpr_page = false;
      if (typeof(user_data.gdpr_consent) === "undefined") {
        skip_gdpr_page = true;
      } else {
        skip_gdpr_page = user_data.gdpr_consent;
      }

      if (typeof(oauth) === "undefined") {
        const token = sha256(user_data.email + ":" + user_data.activation_date);
        redis_client.set(token, JSON.stringify(user_data));
        redis_client.expire(token, 30);
        global_token = token;
        ourl = app_config.public_url + "/auth.html?t=" + token + "&g=" + skip_gdpr_page;
      }

      if (typeof(req.session.owner) !== "undefined") {

        // Device or WebApp... requires  valid session
        if (client_type == "device") {
          return;
        } else if (client_type == "webapp") {
          respond(res, {
            "redirectURL": ourl
          });
          return;
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
    console.log(JSON.stringify(req.params));
    //res.status(401).end();
    res.redirect(app_config.public_url);
  });

  /*
   * Statistics
   */

  /* Returns all audit logs per owner */
  app.get("/api/user/stats", function(req, res) {

    if (!validateSecureGETRequest(req)) return;
    if (!validateSession(req, res)) return;

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

      if (validateJSON(body)) {
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
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
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

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

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

    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;

    var owner = req.session.owner;
    var device_id = req.body.udid;
    var nid = "nid:" + device_id;
    var reply = req.body.reply;

    if (typeof(device_id) === "undefined") {
      respond(res, {
        success: false,
        status: "missing_udid"
      });
      return;
    }

    if (typeof(nid) === "undefined" || nid == null) {
      respond(res, {
        success: false,
        status: "missing_nid"
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
      path: '/api/oauth.access?client_id=233115403974.233317554391&client_secret=ccbaae01e5259ed283ef63321be597da&redirect_uri=" + app_config.public_url + ":7443/slack/redirect&scope=bot&code=' +
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
      "https:/rtm.thinx.cloud/app/#/profile/help"
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
        console.log("Fetching token failed.");
        return;
      }

      console.log('here is your shiny new github oauth_token', oauth_token.access_token);

      // if login was successful
      console.log("[oauth][github] GitHub Login successfull...");

      if (oauth_token.access_token) {

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
            var name_array = [given_name, family_name];

            var hdata = JSON.parse(data);
            console.log("hdata: " + JSON.stringify(hdata));

            if ((typeof(hdata.name) !== "undefined") && hdata.name !== null) {
              if (hdata.name.indexOf(" ") > -1) {
                name_array = hdata.name.split(" ");
                given_name = name_array[0];
                family_name = name_array[name_array.count - 1];
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

            const email = hdata.email;

            if (typeof(email) === "undefined" || email === null) {
              console.log("Error: no email in response, may fail further.");
              res.redirect(
                app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
                "No e-mail in response."
              );
              return;
            }

            var owner_id = null;

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

            // Check user and make note on user login
            userlib.get(owner_id, function(error, udoc) {


              // Error case covers creating new user/managing deleted account
              if (error) {

                if (use_sqreen) {
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
                      if (use_sqreen) {
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
                  user.create(userWrapper, false, function(success, status) {

                    console.log("[OID:" + owner_id +
                      "] [NEW_SESSION] [oauth] 2485:");

                    alog.log(owner_id, "OAuth User created: " +
                      given_name + " " + family_name);

                    redis_client.set(token, JSON.stringify(userWrapper));
                    redis_client.expire(token, 30);
                    global_token = token;

                    const ourl = app_config.public_url + "/auth.html&t=" +
                      token + "&g=true"; // require GDPR consent
                    console.log("FIXME: this request will probably fail fail (cannot redirect): " + ourl);
                    // causes registration error where headers already sent!
                    res.redirect(ourl); // was global_response!

                    if (use_sqreen) {
                      Sqreen.signup_track({ username: userWrapper.owner_id });
                    }

                    console.log("Redirecting to login (2)");
                  });
                  return;
                }
              }

              console.log("UDOC:");
              console.log(JSON.stringify(udoc));

              userlib.atomic("users", "checkin", owner_id, {
                last_seen: new Date()
              }, function(error, response) {
                if (error) {
                  console.log("Last-seen update failed: " +
                    error);
                } else {
                  alog.log(owner_id,
                    "Last seen updated.");
                }
              });

              alog.log(owner_id, "OAuth2 User logged in...");

              redis_client.set(token, JSON.stringify(userWrapper));
              redis_client.expire(token, 3600);

              console.log("Redirecting to login (1)");

              var gdpr = false;
              if (typeof(udoc.info) !== "undefined") {
                if (typeof(udoc.gdpr_consent) !== "undefined" && udoc.gdpr_consent ==
                  true) {
                  gdpr = true;
                }
              }

              if (use_sqreen) {
                Sqreen.auth_track(true, { username: userWrapper.owner_id });
              }

              const ourl = app_config.public_url + "/auth.html?t=" + token + "&g=" +
                gdpr; // require GDPR consent
              console.log(ourl);
              global_response.redirect(ourl);

            }); // userlib.get

          }); // res.end
        }); // https.get
      }
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

  // Initial page redirecting to OAuth2 provider
  app.get('/oauth/google', function(req, res) {
    // User requested login, destroy existing session first...
    if (typeof(req.session) !== "undefined") {
      req.session.destroy();
    }
    crypto.randomBytes(48, function(err, buffer) {
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
          const rurl = app_config.public_url + "/auth.html?t=" + global_token + "&g=" +
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

    var owner_id = req.session.owner;
    userlib.get(owner_id, function(error, user) {
      if (error) {
        respond(res, {
          success: false,
          status: error
        });
      } else {
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
      }
    });
  });

  /* Used to revoke user data in compliance with GDPR. */
  app.post('/gdpr/revoke', function(req, res) {
    if (!validateSecurePOSTRequest(req)) return;
    if (!validateSession(req, res)) return;
    var owner_id = req.session.owner;
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
        devices.list(owner_id, function(dsuccess, devices) {
          devices.forEach(function(){
            devices.revoke(owner, req.body, function(success, status) {
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
          console.dir("Deleting Redis cache for this owner: " + JSON.stringify(obj));
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

  // Callback service parsing the authorization token and asking for the access token
  app.get('/oauth/cb', function(req, ores) {

    /// CALLBACK FOR GOOGLE OAUTH ONLY!
    const options = {
      code: req.query.code,
      redirect_uri: google_ocfg.web.redirect_uris[0]
    };

    var t = oauth2.authorizationCode.getToken(options, (error, result) => {
      if (error) {
        console.error('[oauth] Access Token Error', error.message);
        return ores.json('Authentication failed');
      }

      // console.log('[oauth] The resulting token: ', result);
      const token = oauth2.accessToken.create(result);
      return token;
    });
    t.then(res2 => {

      global_token = res2.access_token;

      https.get(
        'https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=' +
        res2
        .access_token, (res3) => {
          let data = '';
          // A chunk of data has been recieved.
          res3.on('data', (chunk) => {
            data += chunk;
          });

          // The whole response has been received. Print out the result.
          res3.on('end', () => {

            const odata = JSON.parse(data);

            const email = odata.email;
            const family_name = odata.family_name;
            const given_name = odata.given_name;

            if (typeof(email) === "undefined") {
              res3.redirect(
                app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
                'E-mail missing.'
              );
            }

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

                  console.log("Creating new user...");

                  // No such owner, create...
                  user.create(userWrapper, false, function(success, status) {

                    req.session.owner = userWrapper.owner;
                    console.log("[OID:" + req.session.owner +
                      "] [NEW_SESSION] [oauth] 2860:");
                    alog.log(req.session.owner,
                      "OAuth User created: " +
                      given_name + " " + family_name);

                    // This is weird. Token should be random and with prefix.
                    var gtoken = sha256(res2.access_token);
                    global_token = gtoken;
                    redis_client.set(gtoken, JSON.stringify(userWrapper));
                    redis_client.expire(gtoken, 300);
                    alog.log(owner_id, " OAuth2 User logged in...");

                    var otoken = sha256(res2.access_token);
                    redis_client.set(otoken, JSON.stringify(userWrapper));
                    redis_client.expire(otoken, 3600);

                    const ourl = app_config.public_url + "/auth.html?t=" +
                      token + "&g=true"; // require GDPR consent
                    console.log(ourl);
                    ores.redirect(ourl);
                  });
                }
                return;
              }

              userlib.atomic("users", "checkin", owner_id,
              {
                last_seen: new Date()
              },
              function(error, response) {
                if (error) {
                  console.log("Last-seen update failed: " + error);
                } else {
                  alog.log(req.session.owner, "Last seen updated.");
                }
              });

              var gdpr = false;
              if (typeof(udoc.info) !== "undefined") {
                if (typeof(udoc.gdpr_consent) !== "undefined" && udoc.gdpr_consent ==
                  true) {
                  gdpr = true;
                }
              }

              alog.log(owner_id, " OAuth2 User logged in...");
              var token = sha256(res2.access_token);
              redis_client.set(token, JSON.stringify(userWrapper));
              redis_client.expire(token, 3600);
              const ourl = app_config.public_url + "/auth.html?t=" + token +
                "&g=" + gdpr; // require GDPR consent
              console.log(ourl);
              ores.redirect(ourl);
            });

          });

        }).on("error", (err) => {
        console.log("Error: " + err.message);
        res.redirect(
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

  /*
   * thinx-connect gateway validation (device calls /lick with its mac and must receive its api key)
   * therefore gateway must be authenticated as well by an api key!
   * UNUSED, INCOMPLETE. DRAFT.
   */

  app.get('/lick', function(req, res) {

    // search by mac, return last api key hash

    devicelib.view("devicelib", "devices_by_mac", {
        key: device.normalizedMAC(reg.query.mac),
        include_docs: true
      },

      function(err, body) {

        if (err || (typeof(body) == "undefined") || (body === null)) {
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
  });

  /*
   * Root
   */

  /** Tested with: !device_register.spec.js` */
  app.get("/", function(req, res) {
    var protocol = req.protocol;
    var host = req.get("host");
    if (req.session.owner) {
      console.log("/ called with owner: " + req.session.owner);
      res.redirect("/");
    } else {
      res.redirect(protocol + "://" + host);
    }
  });

  /*
   * HTTP/HTTPS API Server
   */

  app.version = function() {
    return v.revision();
  };

  /*
   * HTTP/S Server
   */

  var ssl_options = null;

  // disable HTTPS on CIRCLE CI
  if (typeof(process.env.CIRCLE_USERNAME) === "undefined") {

    if ((fs.existsSync(app_config.ssl_key)) &&
      (fs.existsSync(app_config.ssl_cert))) {
      ssl_options = {
        key: fs.readFileSync(app_config.ssl_key),
        cert: fs.readFileSync(app_config.ssl_cert),
        NPNProtocols: ['http/2.0', 'spdy', 'http/1.1', 'http/1.0']
      };
      console.log("» Starting HTTPS server on " + (serverPort + 1) +
        "...");
      https.createServer(ssl_options, app).listen(serverPort + 1);
    } else {
      console.log(
        "Skipping HTTPS server, SSL key or certificate not found.");
    }
  }

  app.use('/static', express.static(path.join(__dirname, 'static')));
  app.set('trust proxy', ['loopback', '127.0.0.1']);

  // Legacy HTTP support for old devices without HTTPS proxy
  http.createServer(app).listen(serverPort);

  /*
   * WebSocket Server
   */

  var wsapp = express();

  wsapp.use(session({
    secret: session_config.secret,
    store: new redisStore({
      host: "localhost",
      port: 6379,
      client: redis_client
    }),
    cookie: {
      expires: hour
    },
    name: "x-thx-session",
    resave: false,
    rolling: false,
    saveUninitialized: false,
  }));

  var wserver = null;
  if (typeof(process.env.CIRCLE_USERNAME) === "undefined") {
    wserver = https.createServer(ssl_options, wsapp);
  } else {
    wserver = http.createServer(wsapp);
  }

  var wss = new WebSocket.Server({
    port: socketPort,
    server: wserver
  });

  var _ws = null;

  function noop() {}

  function heartbeat() {
    this.isAlive = true;
  }

  if (typeof(wss) !== "undefined") {

    setInterval(function ping() {
      wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) {
          ws.terminate();
        } else {
          ws.ping(noop);
        }
      });
    }, 30000);

    wss.on("connection", function connection(ws, req) {

      if (typeof(req) === "undefined") {
        console.log("No request on wss.on");
        return;
      }

      req.on("error", function(err) {
        console.log("WSS REQ ERROR: " + err);
        return;
      });

      ws.isAlive = true;
      ws.on('pong', heartbeat);

      _ws = ws;

      var cookies = req.headers.cookie;

      if (typeof(req.headers.cookie) !== "undefined") {

        if (cookies.indexOf("thx-") === -1) {
          console.log("» WARNING! No thx-cookie found in: " + JSON.stringify(req.headers
            .cookie));
        }

        if (typeof(req.session) !== "undefined") {
          console.log("Session: " + JSON.stringify(req.session));
        }
      }

      var logtail_callback = function(err) {
        console.log("[thinx] logtail_callback:" + err);
      };

      // May not exist while testing...
      if (typeof(ws) !== "undefined" && ws != null) {
        ws.on("message", function incoming(message) {

          // skip empty messages
          if (message == "{}") return;

          var object = JSON.parse(message);

          if (typeof(object.logtail) !== "undefined") {

            var build_id = object.logtail.build_id;
            var owner_id = object.logtail.owner_id;
            blog.logtail(build_id, owner_id, _ws, logtail_callback);

          } else if (typeof(object.init) !== "undefined") {

            if (typeof(messenger) !== "undefined") {
              messenger.initWithOwner(object.init, _ws, function(success,
                message) {
                if (!success) {
                  console.log("Messenger init on message with success " +
                    success +
                    "message: " +
                    JSON.stringify(message));
                }
              });
            } else {
              console.log(
                "Messenger is not initialized and therefore could not be activated.");
            }

          } else {
            var m = JSON.stringify(message);
            if ((m != "{}") || (typeof(message) == "undefined")) {
              console.log("» Websocketparser said: unknown message: " + m);
            }
          }
        });
      }

    }).on("error", function(err) {
      console.log("WSS ERROR: " + err);
      return;
    });
  }

  wserver.listen(7444, function listening() {
    console.log("» WebSocket listening on port %d", wserver.address().port);
  });


  /*
   * Bootstrap banner section
   */

  var package_info = require("./package.json");
  var product = package_info.description;
  var version = package_info.version;

  console.log("-=[ ☢ " + product + " v" + version + " rev. " + app.version() + " ☢ ]=-");

  //
  // Database compactor
  //

  function database_compactor() {
    console.log("» Running database compact jobs...");
    nano.db.compact("managed_logs");
    nano.db.compact("managed_builds");
    nano.db.compact("managed_devices");
    nano.db.compact("managed_users", "owners_by_username", function(err) {
      console.log("» Database compact jobs completed.");
    });
  }

  //
  // Log aggregator
  //

  function log_aggregator() {
    console.log("» Running log aggregation jobs...");
    rollbar.info("Running aggregator.");
    stats.aggregate();
    console.log("» Aggregation jobs completed.");
  }

  const cluster = require('cluster');
  const _ = require('lodash');

  function isMasterProcess() {
    if (_.has(process.env, 'NODE APP INSTANCE')) {
      return _.get(process.env, 'NODE APP INSTANCE') === '0';
    } else if (_.has(process.env, 'NODE_APP_INSTANCE')) {
      return _.get(process.env, 'NODE_APP_INSTANCE') === '0';
    } else {
      return cluster.isMaster;
    }
  }

  if (isMasterProcess()) {

    setInterval(database_compactor, 3600 * 1000);

    setInterval(log_aggregator, 86400 * 1000 / 2);

    //
    // MQTT Messenger/listener
    //


    messenger.init();

    //
    // Status Transformer Server
    //


    // run detached container on port 7474 waiting...
    console.log("Starting Status Transformer Sandbox...");
    const img = "suculent/thinx-node-transformer";

    // Get running transformers if any
    const docker_check_cmd = "docker ps | grep transformer | cut -d' ' -f1";
    var container_already_running;
    try {
      container_already_running = exec.execSync(docker_check_cmd).toString();
    } catch (e) {
      console.log("Status Transformer Docker check error: " + e);
    }

    // Kill existing transformers if any
    console.log("Docker Status Transformer check...");
    if (container_already_running) {
      try {
        console.log(exec.execSync("docker kill " + container_already_running).toString());
      } catch (e) {
        console.log("Status Transformer Docker kill error: " + e);
      }
    }

    // Pull fresh transformer container and start
    const docker_pull_cmd = "docker pull " + img + "; ";
    const git_pull_cmd = "cd ~/thinx-node-transformer; git pull origin master; ";
    const docker_run_cmd = "docker run --rm --user=transformer -d -p " + app_config.lambda +
      ":7474 -v $(pwd)/logs:/logs -v $(pwd):/app " + img;
    const st_command = docker_pull_cmd + git_pull_cmd + docker_run_cmd;
    try {
      console.log(exec.execSync(st_command).toString());
    } catch (e) {
      if (e.toString().indexOf("port is already allocated") !== -1) {
        console.log("Status Transformer Docker exec error: " + e);
      }
    }

    /* This operation should restore MQTT passwords only. */
    // triggered by non-existend password file
    if (!fs.existsSync(app_config.mqtt.passwords)) {
      fs.ensureFile(app_config.mqtt.passwords, function(err) {
				if (err) {
					console.log("Error creating MQTT PASSWORDS file: " + err);
				}
        console.log("Running in disaster recovery mode...");
        restore_owners_credentials("_all_docs"); // fetches only IDs and last revision, works with hundreds of users
			});
    } // <-- if fs.existsSync...
  }

  //
  // HTTP/S Request Tools
  //

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

  function validateJSON(str) {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  }

  //
  // MQTT Disaster Recovery
  //



  function restore_owner_credentials(owner_id, dmk_callback) {
    devicelib.view("devicelib", "devices_by_owner", {
      "key": owner_id,
      "include_docs": false
    },
    function(err, device) {
      if (err) {
        console.log("list error: " + err);
        if ((err.toString().indexOf("Error: missing") !== -1) && typeof(callback) !==
          "undefined") {
          callback(false, "none");
        }
        console.log("/api/user/devices: Error: " + err.toString());
        return;
      }

      console.log("DEVICE: "+JSON.stringify(device, false, 2));

      const source_id = "ak:" + owner_id;

      // Get source keys
      var default_mqtt_key = null;

      redis_client.get(source_id, function(err1, json_keys) {
        if (err1) {
          console.log(err1);
          dmk_callback(false, err1);
          return;
        }
        var json_array = JSON.parse(json_keys);

        if (json_array == null) {
          console.log("No keys for? "+source_id);
          return;
        }

        // console.log("RESTORING OWNER KEYS: "+JSON.stringify(json_array));
        for (var ai in json_array) {
          var item = json_array[ai];
          /* we would have to fetch whole owner doc to know this
          if (item.hash == last_key_hash) {
            console.log("DR LK: "+JSON.stringify(item));
            last_key = last_key_hash;
          }*/
          if (item.alias == "Default MQTT API Key") {
            default_mqtt_key = item.key;
            console.log("DR DK: "+JSON.stringify(item.hash));
            auth.add_mqtt_credentials(device._id, item.key);
          } else {
            console.log("DR AK: "+JSON.stringify(item.hash));
            auth.add_mqtt_credentials(device._id, item.key);
          }
        }
        auth.add_mqtt_credentials(owner_id, default_mqtt_key);
        dmk_callback(true, default_mqtt_key);
      });
    });
  }

  function restore_owners_credentials(query) {
    userlib.get(query, function(err, body) {
      if (err) {
        console.log("DR ERR: "+err);
        return;
      }
      for (var i = 0; i < body.rows.length; i++) {
        var owner_doc = body.rows[i];
        var owner_id = owner_doc.id;
        console.log("Restoring credentials for owner "+owner_id);
        restore_owner_credentials(owner_id, function(success, default_mqtt_key) {
          if (success) {
            console.log("DMK: "+default_mqtt_key);
          }
        });
      }
    });
  };
};

var thx = new ThinxApp();
