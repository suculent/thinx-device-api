
module.exports = class THiNX {

  constructor() {

    console.log("========================================================================");
    console.log("                 CUT LOGS HERE >>> SERVICE RESTARTED ");
    console.log("========================================================================");

    this.app = null;

  }

  init(init_complete_callback) {

    /*
     * This THiNX Device Management API module is responsible for responding to devices and build requests.
     */

    let start_timestamp = new Date().getTime();

    
    // EXTRACT -->
    /*
     * Bootstrap banner section
     */

    var package_info = require("./package.json");

    console.log("");
    console.log("-=[ ☢ " + package_info.description + " v" + package_info.version + " ☢ ]=-");
    console.log("");

    // EXTRACT <--

    const Globals = require("./lib/thinx/globals.js"); // static only!
    const Sanitka = require("./lib/thinx/sanitka.js"); var sanitka = new Sanitka();

    if (Globals.use_sqreen()) {
      if ((typeof (process.env.SQREEN_APP_NAME) !== "undefined") && (typeof (process.env.SQREEN_TOKEN) !== "undefined")) {
        try {
          require('sqreen');
        } catch (error) {
          console.log("Require Sqreen error", error);
        }
      } else {
        console.log("Sqreen env vars not configured.");
      }
    }

    // App
    const express = require("express");

    // extract into app ->>>>> anything with app...

    const app = express();

    this.app = app;

    app.disable('x-powered-by');

    const helmet = require('helmet');
    app.use(helmet.frameguard());

    const session = require("express-session");

    const pki = require('node-forge').pki;
    const fs = require("fs-extra");

    // set up rate limiter
    const RateLimit = require('express-rate-limit');

    let limiter = new RateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 500
    });

    require("ssl-root-cas").inject();

    var http = require('http');
    var redis = require('redis');
    var path = require('path');

    let CONFIG_ROOT = "/mnt/data/conf";
    if (process.env.ENVIRONMENT == "development") {
      CONFIG_ROOT = __dirname + "/spec/mnt/data/conf";
    }

    var session_config = require(CONFIG_ROOT + "/node-session.json");

    var app_config = Globals.app_config();
    var rollbar = Globals.rollbar(); // lgtm [js/unused-local-variable]

    // Redis
    app.redis_client = redis.createClient(Globals.redis_options());
    let connect_redis = require("connect-redis");
    var RedisStore = connect_redis(session);
    var sessionStore = new RedisStore({ client: app.redis_client });

    try {
      app.redis_client.bgsave();
    } catch (e) {
      // may throw errro that BGSAVE is already enabled
      console.log("thinx.js bgsave error:", e);
    }

    // Default ACLs and MQTT Password

    const Messenger = require("./lib/thinx/messenger");
    let serviceMQPassword = require("crypto").randomBytes(48).toString('base64url');

    if (process.env.ENVIRONMENT == "test") {
      // deepcode ignore NoHardcodedPasswords: <please specify a reason of ignoring this>
      serviceMQPassword = "mosquitto"; // inject test password for thinx to make sure no random stuff is injected in test (until this constant shall be removed everywhere)
    }

    app.messenger = new Messenger(serviceMQPassword).getInstance(serviceMQPassword); // take singleton to prevent double initialization

    app.messenger.initSlack(() => {

      console.log("ℹ️ [info] Slack initialization complete...");

      const Database = require("./lib/thinx/database");
      var db = new Database();
      db.init((/* db_err, dbs */) => {

        //
        // Log aggregator (needs DB)
        //

        const Stats = require("./lib/thinx/statistics");
        var stats = new Stats();
        let now = new Date();
        stats.get_all_owners();
        let then = new Date();
        console.log(`ℹ️ [info] [core] cached all owners in ${then - now} seconds.`);
        setInterval(() => {
          stats.aggregate();
          console.log("✅ [info] Aggregation jobs completed.");
        }, 86400 * 1000 / 2);

        //
        // Shared Configuration
        //

        const hour = 3600 * 1000;

        //
        // App
        //

        var https = require("https");

        var read = require('fs').readFileSync;

        // -> extract into ssl_options
        var ssl_options = null;

        if ((fs.existsSync(app_config.ssl_key)) && (fs.existsSync(app_config.ssl_cert))) {

          let sslvalid = false;

          if (!fs.existsSync(app_config.ssl_ca)) {
            const message = "⚠️ [warning] Did not find app_config.ssl_ca file, websocket logging will fail...";
            rollbar.warn(message);
            console.log(message);
          }

          let caCert = read(app_config.ssl_ca, 'utf8');
          let ca = pki.certificateFromPem(caCert);
          let client = pki.certificateFromPem(read(app_config.ssl_cert, 'utf8'));

          try {
            sslvalid = ca.verify(client);
          } catch (err) {
            console.log("☣️ [error] Certificate verification failed: ", err);
          }

          if (sslvalid) {
            ssl_options = {
              key: read(app_config.ssl_key, 'utf8'),
              cert: read(app_config.ssl_cert, 'utf8'),
              ca: read(app_config.ssl_ca, 'utf8'),
              NPNProtocols: ['http/2.0', 'spdy', 'http/1.1', 'http/1.0']
            };
            console.log("ℹ️ [info] Starting HTTPS server on " + app_config.secure_port + "...");
            https.createServer(ssl_options, app).listen(app_config.secure_port, "0.0.0.0");
          } else {
            console.log("☣️ [error] SSL certificate loading or verification FAILED! Check your configuration!");
          }

        } else {
          console.log("⚠️ [warning] Skipping HTTPS server, SSL key or certificate not found. This configuration is INSECURE! and will cause an error in Enterprise configurations in future.");
        }
        // <- extract into ssl_options

        var WebSocket = require("ws");

        var Builder = require("./lib/thinx/builder");
        var builder = new Builder();

        const Queue = require("./lib/thinx/queue");

        let queue;

        // TEST CASE WORKAROUND: attempt to fix duplicate initialization... if Queue is being tested, it's running as another instance and the port 3000 must stay free!
        if (process.env.ENVIRONMENT !== "test") {
          queue = new Queue(builder, app, null /* ssl_options */);
          queue.cron(); // starts cron job for build queue from webhooks
        }

        const GDPR = require("./lib/thinx/gdpr");
        new GDPR().guard();

        const Buildlog = require("./lib/thinx/buildlog"); // must be after initDBs as it lacks it now
        const blog = new Buildlog();

        // Starts Git Webhook Server
        var Repository = require("./lib/thinx/repository");
        const watcher = new Repository(queue);

        // DI
        app.builder = builder;
        app.queue = queue;

        app.set("trust proxy", 1);

        require('path');

        // Bypassed LGTM, because it does not make sense on this API for all endpoints,
        // what is possible is covered by helmet and no-cache.

        let full_domain = app_config.api_url;
        let full_domain_array = full_domain.split(".");
        delete full_domain_array[0];
        let short_domain = full_domain_array.join('.');

        const sessionConfig = {
          secret: session_config.secret,
          cookie: {
            maxAge: 3600000,
            // can be false in case of local development or testing; mitigated by using Traefik router unwrapping HTTPS so the cookie travels securely where possible
            secure: false, // not secure because HTTPS unwrapping /* lgtm [js/clear-text-cookie] */ /* lgtm [js/clear-text-cookie] */
            httpOnly: true,
            domain: short_domain
          },
          store: sessionStore,
          name: "x-thx-core",
          resave: true, // was true then false
          rolling: true, // This resets the expiration date on the cookie to the given default.
          saveUninitialized: false
        };

        // intentionally exposed cookie because there is no HTTPS between app and Traefik frontend
        const sessionParser = session(sessionConfig); /* lgtm [js/missing-token-validation] */

        app.use(sessionParser);

        app.use(express.json({
          limit: "2mb",
          strict: false
        }));

        app.use(limiter);

        app.use(express.urlencoded({
          extended: true,
          parameterLimit: 1000,
          limit: "1mb"
        }));

        let router = require('./lib/router.js')(app);

        /* Webhook Server (new impl.) */

        function gitHook(req, res) {
          // do not wait for response, may take ages
          console.log("ℹ️ [info] Webhook request accepted...");
          if (typeof (req.body) === "undefined") {
            res.status(400).end("Bad request");
            return;
          }
          res.status(200).end("Accepted");
          console.log("ℹ️ [info] Webhook process started...");
          watcher.process_hook(req);
          console.log("ℹ️ [info] Webhook process completed.");
        }

        app.post("/githook", function (req, res) {
          gitHook(req, res);
        }); // end of legacy Webhook Server

        app.post("/api/githook", function (req, res) {
          gitHook(req, res);
        }); // end of new Webhook Server

        /*
         * HTTP/S Server
         */


        // Legacy HTTP support for old devices without HTTPS proxy
        let server = http.createServer(app).listen(app_config.port, "0.0.0.0", function () {
          console.log(`ℹ️ [info] HTTP API started on port ${app_config.port}`);
          let end_timestamp = new Date().getTime() - start_timestamp;
          let seconds = Math.ceil(end_timestamp / 1000);
          console.log("⏱ [profiler] Startup phase took:", seconds, "seconds");
        });


        app.use('/static', express.static(path.join(__dirname, 'static')));
        app.set('trust proxy', ['loopback', '127.0.0.1']);

        /*
         * WebSocket Server
         */

        var wsapp = express();
        wsapp.disable('x-powered-by');
        wsapp.use(helmet.frameguard());

        wsapp.use(session({ /* lgtm [js/clear-text-cookie] */
          secret: session_config.secret,
          store: sessionStore,
          // deepcode ignore WebCookieSecureDisabledExplicitly: <please specify a reason of ignoring this>
          cookie: {
            expires: hour,
            secure: false,
            httpOnly: true,
            domain: short_domain
          },
          name: "x-thx-core",
          resave: true,
          rolling: true,
          saveUninitialized: true
        })); /* lgtm [js/clear-text-cookie] */

        let wss;
        
        try {
          wss = new WebSocket.Server({ server: server });
        } catch (e){
          console.log("[warning] Cannot init WSS server...");
          return;
        }

        const socketMap = new Map();

        server.on('upgrade', function (request, socket, head) {

          let owner = request.url.replace(/\//g, "");

          if (typeof (socketMap.get(owner)) !== "undefined") {
            console.log(`ℹ️ [info] Socket already mapped for ${owner} reassigning...`);
          }

          sessionParser(request, {}, () => {

            let cookies = request.headers.cookie;
            if ((typeof (cookies) === "undefined") || (cookies === null)) {
              // other x-thx cookies are now deprecated and can be removed
              if (cookies.indexOf("x-thx-core") === -1) {
                console.log("Should destroy socket, access unauthorized.");
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
              }
            }

            console.log("ℹ️ [info] WS Session is parsed, handling protocol upgrade...");

            if (typeof (socketMap.get(owner)) === "undefined") {

              socketMap.set(owner, socket);

              try {
                wss.handleUpgrade(request, socket, head, function (ws) {
                  console.log("ℹ️ [info] WS Session upgrade...");
                  wss.emit('connection', ws, request);
                });
              } catch (upgradeException) {
                // fails on duplicate upgrade, why does it happen?
                console.log("☣️ [error] Exception caught upgrading same socket twice.");
              }

            }
          });
        });

        function heartbeat() {
          this.isAlive = true;
        }

        setInterval(function ping() {
          if (typeof (wss.clients) !== "undefined") {
            wss.clients.forEach(function each(ws) {
              if (ws.isAlive === false) {
                console.log("🔨 [debug] Terminating websocket!");
                ws.terminate();
              } else {
                ws.ping();
              }
            });
          }
        }, 30000);

        //
        // Behaviour of new WSS connection (authenticate and add router paths that require websocket)
        //

        var logtail_callback = function (err, result) {
          if (err) {
            console.log("☣️ [error] logtail_callback error:", err, "message", result);
          } else {
            console.log("ℹ️ [info] logtail_callback result:", result);
          }
        };

        wss.on("error", function (err) {
          let e = err.toString();

          // TODO: FIXME: Ignored for now.
          if (process.env.ENVIRONMENT == "test") {
            return;
          }
          if (e.indexOf("EADDRINUSE") !== -1) {
            // throw new Error("[critical] websocket same port init failure (test edge case only; fix carefully)");
          } else {
            console.log("☣️ [error] websocket ", {e});
          }
        });

        app._ws = {}; // list of all owner websockets

        function initLogTail() {
          app.post("/api/user/logs/tail", (req2, res) => {
            if (!(router.validateSession(req2, res))) return;
            if (typeof (req2.body.build_id) === "undefined") {
              router.respond(res, {
                success: false,
                status: "missing_build_id"
              });
              return;
            }
            console.log(`Tailing build log for ${sanitka.udid(req2.body.build_id)}`);
          });
        }

        function initSocket(ws, msgr, logsocket) {
          ws.on("message", (message) => {
            console.log(`ℹ️ [info] [ws] incoming message: ${message}`);
            if (message.indexOf("{}") == 0) return; // skip empty messages
            var object = JSON.parse(message);

            // Type: logtail socket
            if (typeof (object.logtail) !== "undefined") {
              var build_id = object.logtail.build_id;
              var owner_id = object.logtail.owner_id;
              if ((typeof (build_id) !== "undefined") && (typeof (owner_id) !== "undefined")) {
                blog.logtail(build_id, owner_id, app._ws[logsocket], logtail_callback);
              }

              // Type: initial socket 
            } else if (typeof (object.init) !== "undefined") {
              if (typeof (msgr) !== "undefined") {
                console.log(`ℹ️ [info] [ws] Initializing new messenger in WS...`);
                var owner = object.init;
                let socket = app._ws[owner];
                msgr.initWithOwner(owner, socket, (success, message_z) => {
                  if (!success) {
                    console.log(`ℹ️ [error] [ws] Messenger init on WS message failed: ${message_z}`);
                  } else {
                    console.log(`ℹ️ [info] Messenger successfully initialized for ${owner}`);
                  }
                });
              }
            }
          });

          ws.on('pong', heartbeat);

          ws.on('close', () => {
            socketMap.delete(ws.owner);
          });
        }

        wss.on('connection', function (ws, req) {

          // May not exist while testing...
          if (typeof (ws) === "undefined" || ws === null) {
            console.log("☣️ [error] Exiting WSS connecton, no WS defined!");
            return;
          }

          if (typeof (req) === "undefined") {
            console.log("☣️ [error] No request on wss.on");
            return;
          }

          // extract socket id and owner_id from pathname, also removing slashes (path element 0 is caused by the leading slash)
          let path_elements = req.url.split('/');
          let owner = path_elements[1];
          let logsocket = path_elements[2] || null;

          var cookies = req.headers.cookie;

          if (typeof (cookies) !== "undefined") {
            if (cookies.indexOf("x-thx") === -1) {
              console.log(`🚫  [critical] No thx-session found in WS: ${JSON.stringify(cookies)}`);
              return;
            }
          } else {
            console.log("ℹ️ [info] DEPRECATED WS has no cookie headers, exiting!");
            return;
          }

          ws.isAlive = true;

          ws.owner = owner;

          if ((typeof (logsocket) === "undefined") || (logsocket === null)) {
            console.log("ℹ️ [info] Owner socket", owner, "started...");
            app._ws[owner] = ws;
          } else {
            console.log("ℹ️ [info] Log socket", owner, "started...");
            app._ws[logsocket] = ws; // public websocket stored in app, needs to be set to builder/buildlog!
          }

          socketMap.set(owner, ws); // public websocket stored in app, needs to be set to builder/buildlog!

          /* Returns specific build log for owner */
          initLogTail();
          initSocket(ws, app.messenger, logsocket);

        }).on("error", function (err) {
          console.log(`☣️ [error] in WSS connection ${err}`);
        });

        //
        // Master check in cluster mode
        //

        function startup_quote() {
          if ((typeof (process.env.ENTERPRISE) === "undefined") || (!process.env.ENTERPRISE)) {
            app.messenger.sendRandomQuote();
          }
        }

        setTimeout(startup_quote, 10000); // wait for Slack init only once

        init_complete_callback();

      }); // DB
    }); // Slack
  }
}