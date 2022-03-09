// file deepcode ignore UseCsurfForExpress: API cannot use CSRF

/*
 * This THiNX-RTM API module is responsible for responding to devices and build requests.
 */

let start_timestamp = new Date().getTime();

console.log("========================================================================");
console.log("                 CUT LOGS HERE >>> SERVICE RESTARTED ");
console.log("========================================================================");

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
const Sanitka = require("./lib/thinx/sanitka.js");

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
const app = express();
app.disable('x-powered-by');

const session = require("express-session");

const pki = require('node-forge').pki;
const fs = require("fs-extra");
const url = require('url');

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

// TODO: Reuse redis client for auth?
var redis_client = redis.createClient(Globals.redis_options());
try {
  redis_client.bgsave();
} catch (e) {
  // may throw errro that BGSAVE is already enabled
  console.log("thinx.js bgsave error:", e);
}

// Default ACLs and MQTT Password

const Messenger = require("./lib/thinx/messenger");
let serviceMQPassword = require("crypto").randomBytes(48).toString('base64url');
if (process.env.ENVIRONMENT === "test") {
  serviceMQPassword = "mosquitto"; // test purposes only; to align with REDIS_PASSWORD variable set on CCI; otherwise is always random for security purposes
}
app.messenger = new Messenger(serviceMQPassword).getInstance(serviceMQPassword); // take singleton to prevent double initialization

const Database = require("./lib/thinx/database");
var db = new Database();
db.init((/* db_err, dbs */) => {

  //
  // Log aggregator (needs DB)
  //

  const Stats = require("./lib/thinx/statistics");
  var stats = new Stats();
  stats.get_all_owners(); // TODO: measure!
  setInterval(() => {
    stats.aggregate();
    console.log("» Aggregation jobs completed.");
  }, 86400 * 1000 / 2);

  //
  // Shared Configuration
  //

  const hour = 3600 * 1000;

  //
  // App
  //

  var https = require("https");
  var WebSocket = require("ws");

  var Builder = require("./lib/thinx/builder");
  var builder = new Builder();

  var Queue = require("./lib/thinx/queue");
  var queue = new Queue(builder);
  queue.cron(); // starts cron job for build queue from webhooks

  const GDPR = require("./lib/thinx/gdpr");
  new GDPR().guard();

  const Buildlog = require("./lib/thinx/buildlog"); // must be after initDBs as it lacks it now
  const blog = new Buildlog();

  // Starts Git Webhook Server
  var Repository = require("./lib/thinx/repository");
  const watcher = new Repository(queue);

  /* Legacy Webhook Server, kept for backwards compatibility, will deprecate. */
  /* POST URL `http://<THINX_HOSTNAME>:9002/` changes to `https://<THINX_HOSTNAME>/githook` */

  function fail_on_invalid_git_headers(req) {
    if (typeof (req.headers["X-GitHub-Event"]) !== "undefined") {
      if ((req.headers["X-GitHub-Event"] != "push")) {
        res.status(200).end("Accepted");
        return false; // do not fail
      }
    }
    return true; // fail
  }

  // file deepcode ignore UseCsurfForExpress: API cannot use CSRF
  const hook_server = express();
  hook_server.disable('x-powered-by');
  if (typeof (app_config.webhook_port) !== "undefined") {
    http.createServer(hook_server).listen(app_config.webhook_port, "0.0.0.0", function () {
      console.log("🪝 [info] Webhook API started on port", app_config.webhook_port);
    });
    hook_server.use(express.json({
      limit: "2mb",
      strict: false
    }));
    hook_server.use(express.urlencoded({ extended: false }));

    hook_server.post("/", function (req, res) {
      // From GitHub, exit on non-push events prematurely
      if (fail_on_invalid_git_headers(req)) return;
      // do not wait for response, may take ages
      res.status(200).end("Accepted");
      console.log("⏱ [profiler] Hook process started...");
      watcher.process_hook(req.body);
      console.log("⏱ [profiler] Hook process completed.");
    }); // end of Legacy Webhook Server; will deprecate after reconfiguring all instances or if no webhook_port is defined
  }

  // DI
  app.builder = builder;
  app.queue = queue;


  // Redis
  let connect_redis = require("connect-redis");
  var RedisStore = connect_redis(session);
  var sessionStore = new RedisStore({ client: redis_client });

  app.set("trust proxy", 1);

  require('path');

  // Bypassed LGTM, because it does not make sense on this API for all endpoints,
  // what is possible is covered by helmet and no-cache.

  // allow disabling Secure/HTTPOnly cookies for HTTP-only mode (development, localhost)
  let enforceMaximumSecurity;
  if ((process.env.ENVIRONMENT === "test") || (process.env.ENVIRONMENT === "development")) {
    enforceMaximumSecurity = app_config.debug.allow_http_login ? true : false;
  } else {
    enforceMaximumSecurity = true;
  }

  const sessionConfig = {
    secret: session_config.secret,
    cookie: {
      maxAge: 3600000,
      // can be false in case of local development or testing; mitigated by using Traefik router unwrapping HTTPS so the cookie travels securely where possible
      secure: false, // not secure because HTTPS unwrapping /* lgtm [js/clear-text-cookie] */ /* lgtm [js/client-exposed-cookie] */
      httpOnly: false
    },
    store: sessionStore,
    name: "x-thx-session",
    resave: true, // was true then false
    rolling: false, // rolling was true; This resets the expiration date on the cookie to the given default.
    saveUninitialized: false
  };

  const sessionParser = session(sessionConfig); /* lgtm [js/missing-token-validation] lgtm [js/clear-text-cookie] lgtm [js/client-exposed-cookie] */

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

  app.post("/githook", function (req, res) {
    // From GitHub, exit on non-push events prematurely
    // if (fail_on_invalid_git_headers(req)) return;
    // TODO: Validate and possibly reject invalid requests to prevent injection
    // E.g. using git_secret_key from app_config

    // do not wait for response, may take ages
    console.log("Webhook request accepted...");
    res.status(200).end("Accepted");
    console.log("Webhook process started...");
    watcher.process_hook(req.body);
    console.log("Webhook process completed.");
  }); // end of new Webhook Server

  /*
   * HTTP/S Server
   */

  var ssl_options = null;

  // Legacy HTTP support for old devices without HTTPS proxy
  let server = http.createServer(app).listen(app_config.port, "0.0.0.0", function () {
    console.log("ℹ️ [info] HTTP API started on port", app_config.port);
    let end_timestamp = new Date().getTime() - start_timestamp;
    let seconds = Math.ceil(end_timestamp / 1000);
    console.log("⏱ [profiler] Startup phase took:", seconds, "seconds");
  });

  var read = require('fs').readFileSync;

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
      console.log("☣️  [error] Certificate verification failed: ", err);
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
      console.log("☣️  [error] SSL certificate loading or verification FAILED! Check your configuration!");
    }

  } else {
    console.log("⚠️ [warning] Skipping HTTPS server, SSL key or certificate not found. This configuration is INSECURE! and will cause an error in Enterprise configurations in future.");
  }

  app.use('/static', express.static(path.join(__dirname, 'static')));
  app.set('trust proxy', ['loopback', '127.0.0.1']);


  /*
   * WebSocket Server
   */

  var wsapp = express();
  wsapp.disable('x-powered-by');

  if (!enforceMaximumSecurity) {
    console.log("Websockets currently require full HTTPS even for development. Generate a certificate to use websockets in dev/test environment.");
    enforceMaximumSecurity = true;
  } else {
    enforceMaximumSecurity = true;
  }

  wsapp.use(session({ /* lgtm [js/clear-text-cookie] */
    secret: session_config.secret,
    store: sessionStore,
    cookie: {
      expires: hour,
      secure: false,
      httpOnly: false
    },
    name: "x-thx-ws-session",
    resave: false,
    rolling: false,
    saveUninitialized: false,
  })); /* lgtm [js/client-exposed-cookie] */

  let wss = new WebSocket.Server({ server: server }); // or { noServer: true }
  const socketMap = new Map();

  server.on('upgrade', function (request, socket, head) {

    const owner = url.parse(request.url).pathname.replace("/", "");

    if (typeof (socketMap.get(owner)) === "undefined") {
      console.log("Socket already mapped for", owner, "reassigning...");
    }

    if (typeof (request.session) === "undefined") {
      return;
    }

    sessionParser(request, {}, () => {

      if ((typeof (request.session.owner) === "undefined") || (request.session.owner === null)) {
        console.log("Should destroy socket, access unauthorized.");
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      console.log("---> Session is parsed, handling protocol upgrade...");

      socketMap.set(owner, socket);
      try {
        wss.handleUpgrade(request, socket, head, function (ws) {
          wss.emit('connection', ws, request);
        });
      } catch (upgradeException) {
        // fails on duplicate upgrade, why does it happen?
        console.log("Exception caught upgrading same socket twice.");
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
          console.log("[DBUG] Terminating websocket!");
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
      console.log("[thinx] logtail_callback error:", err, "message", result);
    } else {
      console.log("[thinx] logtail_callback result:", result);
    }
  };

  wss.on("error", function (err) {
    console.log("WSS REQ ERROR: " + err);
  });

  app._ws = {}; // list of all owner websockets

  function initLogTail() {
    app.post("/api/user/logs/tail", (req2, res) => {
      if (!(router.validateSecurePOSTRequest(req2) || router.validateSession(req2, res))) return;
      if (typeof (req2.body.build_id) === "undefined") {
        router.respond(res, {
          success: false,
          status: "missing_build_id"
        });
        return;
      }
      let safe_id = Sanitka.udid(req2.body.build_id);
      console.log("Tailing build log for " + safe_id);
    });
  }

  function initSocket(ws, msgr) {
    ws.on("message", (message) => {
      console.log("WSS message", message);
      if (message.indexOf("{}") == 0) return; // skip empty messages
      var object = JSON.parse(message);
      if (typeof (object.logtail) !== "undefined") {
        var build_id = object.logtail.build_id;
        var owner_id = object.logtail.owner_id;
        blog.logtail(build_id, owner_id, app._ws[logsocket], logtail_callback);
      } else if (typeof (object.init) !== "undefined") {
        if (typeof (msgr) !== "undefined") {
          console.log("Initializing new messenger in WS...");
          var owner = object.init;
          let socket = app._ws[owner];
          msgr.initWithOwner(owner, socket, function (success, message_z) {
            if (!success) {
              console.log("Messenger init on WS message with result " + success + ", with message: ", { message_z });
            }
          });
        }
      }
    });

    ws.on('pong', heartbeat);

    ws.on('close', function () {
      socketMap.delete(owner);
    });
  }

  wss.on('connection', function (ws, req) {

    // May not exist while testing...
    if (typeof (ws) === "undefined" || ws === null) {
      console.log("Exiting WSS connecton, no WS defined!");
      return;
    }

    if (typeof (req) === "undefined") {
      console.log("No request on wss.on");
      return;
    }

    // extract owner_id from pathname removing trailing slash
    let socket_path = url.parse(req.url).pathname.replace("/", "");
    const path_elements = socket_path.split('/');
    const owner = path_elements[0];
    const logsocket = path_elements[1];

    console.log("logsocket: ", { owner }, { logsocket });

    var cookies = req.headers.cookie;

    if (typeof (req.headers.cookie) !== "undefined") {
      if (cookies.indexOf("thx-session") === -1) {
        console.log("» ERROR! No thx-session found in WS: " + JSON.stringify(req.headers.cookie));
        return;
      }
    } else {
      console.log("» DEPRECATED WS has no cookie headers!");
      return;
    }

    ws.isAlive = true;

    if ((typeof (logsocket) === "undefined") || (logsocket === null)) {
      console.log("Owner socket", owner, "started... (TODO: socketMap.set)");
      app._ws[owner] = ws; // public websocket stored in app, needs to be set to builder/buildlog!
    } else {
      console.log("Log socket", owner, "started... (TODO: socketMap.set)");
      app._ws[logsocket] = ws; // public websocket stored in app, needs to be set to builder/buildlog!
    }

    /* Returns specific build log for owner */
    initLogTail();
    initSocket(ws, messenger);

  }).on("error", function (err) {
    console.log("WSS Connection Error: ", err);
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

});