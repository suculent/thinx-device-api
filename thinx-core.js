const EventEmitter = require('events');

const JWTLogin = require("./lib/thinx/jwtlogin");
const InfluxConnector = require('./lib/thinx/influx');
const Util = require('./lib/thinx/util');
const Owner = require('./lib/thinx/owner');
const Device = require('./lib/thinx/device');

const connect_redis = require("connect-redis");
const session = require("express-session");
module.exports = class THiNX extends EventEmitter {

  constructor() {

    super();

    /*
     * Bootstrap banner section
     */

    console.log("========================================================================");
    console.log("                 CUT LOGS HERE >>> SERVICE RESTARTED ");
    console.log("========================================================================");

    const package_info = require("./package.json");

    console.log("");
    console.log("-=[ ☢ " + package_info.description + " v" + package_info.version + " ☢ ]=-");
    console.log("");

    this.app = null;
    this.clazz = this;
    this.server = null;
    this._initState = "idle";
    this._initCallbacks = [];
  }

  init(init_complete_callback) {

    if (typeof (init_complete_callback) === "function") {
      if (this._initState === "ready") {
        process.nextTick(init_complete_callback);
        return;
      }

      this._initCallbacks.push(init_complete_callback);
    }

    if (this._initState === "initializing") {
      return;
    }

    this._initState = "initializing";

    /*
     * This THiNX Device Management API module is responsible for responding to devices and build requests.
     */

    let start_timestamp = new Date().getTime();
    let initFinished = false;

    const once = (label, callback) => {
      let called = false;
      return (...args) => {
        if (called) {
          console.log(`⚠️ [warning] Duplicate ${label} callback ignored.`);
          return;
        }
        called = true;
        callback(...args);
      };
    };

    const finishInit = once("THiNX.init completion", () => {
      this._initState = "ready";
      const callbacks = this._initCallbacks.splice(0);
      callbacks.forEach((callback) => {
        try {
          callback();
        } catch (callbackError) {
          console.log("☣️ [error] THiNX init callback error:", callbackError);
        }
      });
    });

    const Globals = require("./lib/thinx/globals.js"); // static only!
    const Sanitka = require("./lib/thinx/sanitka.js"); let sanitka = new Sanitka();

    // App
    const express = require("express");

    // extract into app ->>>>> anything with app...

    const app = express();
    const helmet = require('helmet');
    app.use(helmet.frameguard());
    app.use(helmet());
    app.disable('x-powered-by');
    this.app = app;

    const pki = require('node-forge').pki;
    const fs = require("fs-extra");

    const getCertAttribute = (name, attributes = []) => {
      const attribute = attributes.find((entry) => entry.name === name || entry.shortName === name);
      return attribute ? attribute.value : undefined;
    };

    const isSupportedLetsEncryptIssuer = (attributes = []) => {
      const organization = getCertAttribute('organizationName', attributes) || getCertAttribute('O', attributes);
      const commonName = getCertAttribute('commonName', attributes) || getCertAttribute('CN', attributes);
      return organization === "Let's Encrypt" && ['R10', 'R12'].includes(commonName);
    };

    // set up rate limiter
    const { rateLimit } = require('express-rate-limit');

    const limiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 500,
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false // Disable the `X-RateLimit-*` headers
    });

    require("ssl-root-cas").inject();

    const http = require('http');
    const redis = require('redis');
    const path = require('path');

    let CONFIG_ROOT = "/mnt/data/conf";
    if (process.env.ENVIRONMENT == "development") {
      CONFIG_ROOT = __dirname + "/spec/mnt/data/conf";
    }

    var session_config = require(CONFIG_ROOT + "/node-session.json");

    var app_config = Globals.app_config();
    var rollbar = Globals.rollbar(); // lgtm [js/unused-local-variable]

    const initializeWithRedis = (redisClient) => {

      app.redis_client = redisClient;

      app.owner = new Owner(app.redis_client);
      app.device = new Device(app.redis_client); // TODO: Share in Devices, Messenger and Transfer, can be mocked

      let RedisStore = connect_redis(session);
      let sessionStore = new RedisStore({ client: app.redis_client });

      if (process.env.ENVIRONMENT !== "test") {
        try {
          // app.redis_client.bgsave();  not a function anymore
        } catch (e) {
          // may throw errro that BGSAVE is already enabled
          console.log("thinx.js bgsave error:", e);
        }
      }

      app.login = new JWTLogin(app.redis_client);
      app.login.init(once("JWT login init", () => {
        console.log("ℹ️ [info] JWT Login Secret Init Complete. Login is now possible.");


        // Default ACLs and MQTT Password

        const Messenger = require("./lib/thinx/messenger");
        let serviceMQPassword = require("crypto").randomBytes(48).toString('base64url');

        if (process.env.ENVIRONMENT == "test") {
          // deepcode ignore NoHardcodedPasswords: <please specify a reason of ignoring this>
          serviceMQPassword = "mosquitto"; // inject test password for thinx to make sure no random stuff is injected in test (until this constant shall be removed everywhere)
        }

        if (process.env.ENVIRONMENT == "development") {
          // deepcode ignore NoHardcodedPasswords: <please specify a reason of ignoring this>
          serviceMQPassword = "changeme!"; // inject test password for thinx to make sure no random stuff is injected in test (until this constant shall be removed everywhere)
        }

        console.log("ℹ️ [info] Initializing MQ/Notification subsystem...");

        app.messenger = new Messenger(app.redis_client, serviceMQPassword).getInstance(app.redis_client, serviceMQPassword); // take singleton to prevent double initialization

        // Section that requires initialized Slack
        app.messenger.initSlack(once("Messenger initSlack", () => {

          console.log("ℹ️ [info] Initialized Slack bot...");

          const Database = require("./lib/thinx/database");
          var db = new Database();
          db.init(once("Database init", (/* db_err, dbs */) => {

            if (initFinished) {
              console.log("⚠️ [warning] Duplicate THiNX bootstrap phase ignored.");
              return;
            }

            initFinished = true;

            InfluxConnector.createDB('stats');

            //
            // Log aggregator (needs DB)
            //

            const Stats = require("./lib/thinx/statistics");
            let stats = new Stats();
            let now = new Date();
            stats.get_all_owners();
            let then = new Date();
            console.log(`ℹ️ [info] [core] cached all owners in ${then - now} seconds.`);

            //if (process.env.ENVIRONMENT !== "test") stats.aggregate();

            if (process.env.ENVIRONMENT !== "test") {
              setInterval(() => {
                stats.aggregate();
                console.log("✅ [info] Aggregation jobs completed.");
              }, 86400 * 1000 / 2);
            }

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
                console.log("SSL CA error", message);
              }

              let caCert = read(app_config.ssl_ca, 'utf8');
              let ca = pki.certificateFromPem(caCert);
              let client = pki.certificateFromPem(read(app_config.ssl_cert, 'utf8'));

              try {
                sslvalid = ca.verify(client);
              } catch (err) {
                console.log("☣️ [error] Certificate verification failed: ", err);

                const clientIssuer = client && client.issuer ? client.issuer.attributes : [];
                const caSubject = ca && ca.subject ? ca.subject.attributes : [];
                const caIssuer = ca && ca.issuer ? ca.issuer.attributes : [];

                // Let's Encrypt rotates intermediates (for example R10 -> R12).
                // Accept the current supported LE intermediates to avoid blocking HTTPS startup
                // when the configured CA bundle is still pinned to the previous intermediate.
                if (isSupportedLetsEncryptIssuer(clientIssuer) && isSupportedLetsEncryptIssuer(caSubject)) {
                  const clientIssuerCn = getCertAttribute('CN', clientIssuer);
                  const caSubjectCn = getCertAttribute('CN', caSubject);
                  const caIssuerCn = getCertAttribute('CN', caIssuer);

                  if (clientIssuerCn !== caSubjectCn) {
                    console.log(`⚠️ [warning] Accepting Let's Encrypt intermediate rotation (${caSubjectCn} -> ${clientIssuerCn}, root ${caIssuerCn || 'unknown'}) for HTTPS startup.`);
                  }

                  sslvalid = true;
                }
              }

              if (sslvalid) {
                ssl_options = {
                  key: read(app_config.ssl_key, 'utf8'),
                  cert: read(app_config.ssl_cert, 'utf8'),
                  ca: read(app_config.ssl_ca, 'utf8'),
                  NPNProtocols: ['http/2.0', 'spdy', 'http/1.1', 'http/1.0']
                };
                if (process.env.ENVIRONMENT !== "test") {
                  console.log("ℹ️ [info] Starting HTTPS server on " + app_config.secure_port + "...");
                  https.createServer(ssl_options, app).listen(app_config.secure_port, "0.0.0.0");
                }
              } else {
                console.log("☣️ [error] SSL certificate loading or verification FAILED! Check your configuration!");
              }

            } else {
              console.log("⚠️ [warning] Skipping HTTPS server, SSL key or certificate not found. This configuration is INSECURE! and will cause an error in Enterprise configurations in future.");
            }
            // <- extract into ssl_options

            var WebSocket = require("ws");

            var Builder = require("./lib/thinx/builder");
            var builder = new Builder(app.redis_client);

            const Queue = require("./lib/thinx/queue");

            let queue;

            // Starts Git Webhook Server
            var Repository = require("./lib/thinx/repository");

            let watcher;

            // TEST CASE WORKAROUND: attempt to fix duplicate initialization... if Queue is being tested, it's running as another instance and the port 3000 must stay free!
            //if (process.env.ENVIRONMENT !== "test") {
            queue = new Queue(app.redis_client, builder, app, null /* ssl_options */, this.clazz);
            //constructor(redis, builder, di_app, ssl_options, opt_thx)
            if (process.env.ENVIRONMENT !== "test") {
              queue.cron(); // starts cron job for build queue from webhooks
            }

            watcher = new Repository(app.messenger, app.redis_client, queue);

            const GDPR = require("./lib/thinx/gdpr");
            new GDPR(app).guard();

            const Buildlog = require("./lib/thinx/buildlog"); // must be after initDBs as it lacks it now
            const blog = new Buildlog();


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
                // deepcode ignore WebCookieSecureDisabledExplicitly: not secure because HTTPS unwrapping happens outside this app
                secure: false, // not secure because HTTPS unwrapping /* lgtm [js/clear-text-cookie] */ /* lgtm [js/clear-text-cookie] */
                httpOnly: false, // temporarily disabled due to websocket debugging
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

            // While testing, the rate-limiter is disabled in order to prevent blocking.
            if (process.env.ENVIRONMENT != "test") {
              app.use(limiter);
            }

            app.use(express.urlencoded({
              extended: true,
              parameterLimit: 1000,
              limit: "1mb"
            }));

            // API v1 global all-in-one router
            const router = require('./lib/router.js')(app); // only validateSession and initLogTail is used here. is this feature envy?

            // API v2 partial routers with new calls (needs additional coverage)
            require('./lib/router.device.js')(app);

            // API v2+v1 GDPR routes
            require('./lib/router.gdpr.js')(app);

            // API v2 routes
            require('./lib/router.apikey.js')(app);
            require('./lib/router.auth.js')(app); // requires initialized Owner/Redis!
            require('./lib/router.build.js')(app);
            require('./lib/router.deviceapi.js')(app);
            require('./lib/router.env.js')(app);
            require('./lib/router.github.js')(app);
            require('./lib/router.google.js')(app);
            require('./lib/router.logs.js')(app);
            require('./lib/router.mesh.js')(app);
            require('./lib/router.profile.js')(app);
            require('./lib/router.rsakey.js')(app);
            require('./lib/router.slack.js')(app);
            require('./lib/router.source.js')(app);
            require('./lib/router.transfer.js')(app);
            require('./lib/router.user.js')(app);

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
              if (typeof (watcher) !== "undefined") {
                watcher.process_hook(req);
              } else {
                console.log("[warning] Cannot proces hook, no repository watcher in this environment.");
              }

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


            // Legacy HTTP support for old devices without HTTPS proxy.
            // In tests, use an ephemeral port so repeated suite bootstrap does not collide on 7442.
            const listenPort = process.env.ENVIRONMENT === "test" ? 0 : app_config.port;
            this.server = http.createServer(app).listen(listenPort, "0.0.0.0", function () {
              const actualPort = this.address() && this.address().port ? this.address().port : listenPort;
              console.log(`ℹ️ [info] HTTP API started on port ${actualPort}`);
              let end_timestamp = new Date().getTime() - start_timestamp;
              let seconds = Math.ceil(end_timestamp / 1000);
              console.log("ℹ️ [profiler] ⏱ Startup phase took:", seconds, "seconds");
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
              // deepcode ignore WebCookieSecureDisabledExplicitly: not secure because HTTPS unwrapping happens outside this app
              cookie: {
                expires: hour,
                secure: false, // not secure because HTTPS unwrapping /* lgtm [js/clear-text-cookie] */ /* lgtm [js/clear-text-cookie] */
                httpOnly: true,
                domain: short_domain
              },
              name: "x-thx-wscore",
              resave: true,
              rolling: true,
              saveUninitialized: true
            })); /* lgtm [js/clear-text-cookie] */

            let wss;

            try {
              wss = new WebSocket.Server({ noServer: true });
              console.log("[info] WSS server started...");
            } catch (e) {
              console.log("[warning] Cannot init WSS server...");
              return;
            }

            const socketMap = new Map();

            server.on('upgrade', function (request, socket, head) {

              let socketKey = request.url.replace(/^\/+/, "");

              if (typeof (socketMap.get(socketKey)) !== "undefined") {
                console.log(`ℹ️ [info] Socket already mapped for ${socketKey}, dropping duplicate upgrade.`);
                socket.destroy();
                return;
              }

              sessionParser(request, {}, () => {

                let cookies = request.headers.cookie;

                if (Util.isDefined(cookies)) {
                  // other x-thx cookies are now deprecated and can be removed
                  if (cookies.indexOf("x-thx-core") === -1) {
                    console.log("Should destroy socket, access unauthorized.");
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                  }
                }

                if (typeof (socketMap.get(socketKey)) === "undefined") {

                  socketMap.set(socketKey, socket);

                  try {
                    wss.handleUpgrade(request, socket, head, function (ws) {
                      ws.socketKey = socketKey;
                      console.log("ℹ️ [info] WS Session upgrade...");
                      wss.emit('connection', ws, request);
                    });
                  } catch (upgradeException) {
                    // fails on duplicate upgrade, why does it happen?
                    console.log("☣️ [error] Exception caught upgrading same socket twice.");
                    socketMap.delete(socketKey);
                  }

                }
              });
            });

            if (process.env.ENVIRONMENT !== "test") {
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
            }

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
              if (e.indexOf("EADDRINUSE") !== -1) {
                console.log("☣️ [error] websocket same port init failure (test edge case only; fix carefully)");
              } else {
                console.log("☣️ [error] websocket ", { e });
              }
            });

            app._ws = {}; // list of all owner websockets

            function initLogTail() {

              function logTailImpl(req2, res) {
                if (!(router.validateSession(req2, res))) return;
                if (typeof (req2.body.build_id) === "undefined") return router.respond(res, false, "missing_build_id");
                console.log(`Tailing build log for ${sanitka.udid(req2.body.build_id)}`);
              }

              app.post("/api/user/logs/tail", (req2, res) => {
                logTailImpl(req2, res);
              });

              app.post("/api/v2/logs/tail", (req2, res) => {
                logTailImpl(req2, res);
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

              function heartbeat() {
                if (typeof(this.clientId) !== "undefined") {
                  console.log(`pong client ${this.clientId}`);
                }
                this.isAlive = true;
              }

              ws.on('pong', heartbeat);

              ws.on('close', () => {
                socketMap.delete(ws.socketKey);
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
              let socketKey = req.url.replace(/^\/+/, "");
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
              ws.socketKey = socketKey;

              if ((typeof (logsocket) === "undefined") || (logsocket === null)) {
                console.log("ℹ️ [info] Owner socket", owner, "started...");
                app._ws[owner] = ws;
              } else {
                console.log("ℹ️ [info] Log socket", owner, "started...");
                app._ws[logsocket] = ws; // public websocket stored in app, needs to be set to builder/buildlog!
              }

              socketMap.set(socketKey, ws); // public websocket stored in app, needs to be set to builder/buildlog!

              /* Returns specific build log for owner */
              initLogTail();
              initSocket(ws, app.messenger, logsocket);

            }).on("error", function (err) {

              // EADDRINUSE happens in test only; othewise should be reported
              if (process.env.ENVIRONMENT == "test") {
                if (err.toString().indexOf("EADDRINUSE") == -1) {
                  console.log(`☣️ [error] in WSS connection ${err}`);
                }
              } else {
                console.log(`☣️ [error] in WSS connection ${err}`);
              }
            });

            finishInit();

          })); // DB
        }));
      }));
    };

    const useSharedTestRedisClient = process.env.ENVIRONMENT === "test";

    if (useSharedTestRedisClient) {
      if (THiNX._sharedTestRedisClient && THiNX._sharedTestRedisClient.isOpen) {
        initializeWithRedis(THiNX._sharedTestRedisClient);
      } else {
        if (!THiNX._sharedTestRedisClientPromise) {
          THiNX._sharedTestRedisClient = redis.createClient(Globals.redis_options());
          THiNX._sharedTestRedisClient.on('error', err => console.log('Redis Client Error', err));
          THiNX._sharedTestRedisClientPromise = THiNX._sharedTestRedisClient.connect()
            .then(() => THiNX._sharedTestRedisClient)
            .catch((err) => {
              THiNX._sharedTestRedisClient = null;
              THiNX._sharedTestRedisClientPromise = null;
              throw err;
            });
        }

        THiNX._sharedTestRedisClientPromise
          .then((redisClient) => {
            THiNX._sharedTestRedisClient = redisClient;
            initializeWithRedis(redisClient);
          })
          .catch((err) => {
            console.log("☣️ [error] Redis Client connect failure", err);
          });
      }
    } else {
      // Initialize Redis
      app.redis_client = redis.createClient(Globals.redis_options());
      app.redis_client.on('error', err => console.log('Redis Client Error', err));

      // Section that requires initialized Redis
      app.redis_client.connect().then(() => {
        initializeWithRedis(app.redis_client);
      }).catch((err) => {
        console.log("☣️ [error] Redis Client connect failure", err);
      });
    }
  }
};
