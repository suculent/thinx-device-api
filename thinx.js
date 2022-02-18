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
    } catch (bitch) {
      console.log(bitch);
    }
  } else {
    console.log("Sqreen env vars not available");
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

const schedule = require('node-schedule');

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

const CONFIG_ROOT = "/mnt/data/conf";
var session_config = require(CONFIG_ROOT + "/node-session.json");

var app_config = Globals.app_config();
var prefix = Globals.prefix();
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

console.log("[info] Loaded module: Messenger");
const Messenger = require("./lib/thinx/messenger");
let serviceMQPassword = require("crypto").randomBytes(48).toString('base64url');
if (process.env.ENVIRONMENT === "test") {
  serviceMQPassword = "mosquitto"; // test purposes only; to align with REDIS_PASSWORD variable set on CCI; otherwise is always random for security purposes
}
app.messenger = new Messenger(serviceMQPassword).getInstance(serviceMQPassword); // take singleton to prevent double initialization

//
// Shared Configuration
//

const hour = 3600 * 1000;

//
// App
//

var https = require("https");
var WebSocket = require("ws");

// EXTRACT TO: db.js -->

/*
 * Databases
 */

var nano = require("nano")(app_config.database_uri);

function initDatabases(dbprefix) {

  console.log("[info] Initializing databases...");

  function null_cb(err, body, header) {
    // only unexpected errors should be logged
    if (process.env.ENVIRONMENT === "test") {
      console.log(err, body, header);
    }
  }

  // only to fix bug in CouchDB 2.3.1 first-run
  nano.db.create("_users", null_cb);
  nano.db.create("_stats", null_cb);
  nano.db.create("_replicator", null_cb);
  nano.db.create("_global_changes", null_cb);

  const db_names = [
    "devices", "builds", "users", "logs"
  ];

  db_names.forEach((name) => {
    nano.db.create(dbprefix + "managed_" + name).then((body) => {
      console.log(body);
      var couch = nano.db.use(dbprefix + "managed_" + name);
      injectDesign(couch, name, "./design/design_" + name + ".json");
      injectReplFilter(couch, "./design/filters_" + name + ".json");
      console.log("[info] managed_" + name + " db is ready now.");
    }).catch((err) => {
      handleDatabaseErrors(err, "managed_" + name);
    });
  });
 
}

console.log("[info] Will init DBs...");

initDatabases(prefix);

console.log("[info] Will access DBs...");

// unused: var devicelib = require("nano")(app_config.database_uri).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]
var userlib = require("nano")(app_config.database_uri).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]

console.log("[info] Loaded module: Statistics");
var Stats = require("./lib/thinx/statistics");
var stats = new Stats();
//stats.get_all_owners(); FIXME: init all owners on boot... measure!

console.log("[info] Loaded module: Repository Watcher");
var Repository = require("./lib/thinx/repository");

var Builder = require("./lib/thinx/builder");
console.log("[info] Loaded module: BuildServer");
var builder = new Builder();

console.log("[info] Loaded module: Queue");
var Queue = require("./lib/thinx/queue");
var queue = new Queue(builder);
queue.cron(); // starts cron job for build queue from webhooks

var Owner = require("./lib/thinx/owner");

// EXTRACT GDPR FROM HERE --->

// GDPR delete when account is expired (unused for 3 months)
// WARNING: May purge old accounts, should be way to disable this.

function purgeOldUsers() {
  if ((typeof (app_config.strict_gdpr) !== "undefined") && app_config.strict_gdpr === false) {
    console.log("[info] Not purging inactive users today.");
    return;
  }
  if (process.env.ENVIRONMENT === "test") {
    return; // no expired users in test, query will fail with "doc is null" error...
  }
  var d = new Date();
  d.setMonth(d.getMonth() - 3);
  let req = {
    query: {
      mindate: d
    }
  };
  userlib.atomic("users", "delete_expired", req, function (error, response) {
    if (error) {
      console.log("Purge Old Error:", error);
    } else {
      console.log("Purged:", response);
    }
  });
}

function notify24(user) {
  var d1 = new Date();
  d1.setMonth(d1.getMonth() - 3);
  d1.setDay(d1.getDay() - 1);
  if (user.last_update == d1) {
    if (typeof (user.notifiedBeforeGDPRRemoval24) === "undefined" || user.notifiedBeforeGDPRRemoval24 !== true) {
      Owner.sendGDPRExpirationEmail24(user, user.email, function () {
        userlib.atomic("users", "edit", owner, { notifiedBeforeGDPRRemoval24: true }, (uerror, abody) => {
          console.log("sendGDPRExpirationEmail24", uerror, abody);
        });
      });
    }
  }
}

function notify168(user) {
  var d2 = new Date();
  d2.setMonth(d2.getMonth() - 3);
  d2.setDay(d2.getDay() - 7);
  if (user.last_update == d2) {
    if (typeof (user.notifiedBeforeGDPRRemoval168) === "undefined" || user.notifiedBeforeGDPRRemoval168 !== true) {
      Owner.sendGDPRExpirationEmail168(user, user.email, function () {
        userlib.atomic("users", "edit", owner, { notifiedBeforeGDPRRemoval168: true }, (uerror, abody) => {
          console.log("sendGDPRExpirationEmail168", uerror, abody);
        });
      });
    }
  }
}

function notifyOldUsers() {
  // Should send an e-mail once a day
  // Must parse all users, find users with expiration

  if ((typeof (app_config.strict_gdpr) !== "undefined") && app_config.strict_gdpr === false) {
    console.log("Notification for old users skipped. Enable with strict_gdpr = true in config.json");
    return;
  }

  userlib.view("users", "owners_by_username", {
    "key": username,
    "include_docs": true
  }).then((user_view_body) => {
    for (var index in user_view_body.rows) {
      let user = user_view_body.rows[index];
      notify24(user);
      notify168(user);
    }
  }).catch((err) => {
    console.log(err);
  });
}

var cron_rule_15_min = "*/15 * * * *";
schedule.scheduleJob(cron_rule_15_min, () => {
  purgeOldUsers();
});

var cron_rule_daily = "0 8 * * *"; // daily 8 am
schedule.scheduleJob(cron_rule_daily, () => {
  notifyOldUsers();
});

// <-- EXTRACT GDPR TO HERE

//
// REFACTOR: Move to database.js
//

// Database preparation on first run
function getDocument(file) {
  if (!fs.existsSync(file)) {
    return false;
  }
  const data = fs.readFileSync(file);
  if (typeof (data) === "undefined") {
    console.log("» [getDocument] no data read.");
    return false;
  }
  // Parser may fail
  try {
    return JSON.parse(data);
  } catch (e) {
    console.log("» Document File may not exist: " + e);
    return false;
  }
}

function logCouchError(err, body, header, tag) {
  if (err !== null) {
    if (err.toString().indexOf("conflict") === -1) {
      console.log("[error] Couch Init error: ", err, body, header, tag);
    }
    if (err.toString().indexOf("ENOTFOUND") !== -1) {
      console.log("Critical DB integration error, exiting.");
      process.exit(1);
    }
  } else {
    return;
  }
  if (typeof (body) !== "undefined") {
    console.log("[error] Log Couch Insert body: " + body + " " + tag);
  }
  if (typeof (header) !== "undefined") {
    console.log("[error] Log Couchd Insert header: " + header + " " + tag);
  }
}

function injectDesign(couch, design, file) {
  if (typeof (design) === "undefined") return;
  let design_doc = getDocument(file);
  if (design_doc != null) {
    couch.insert(design_doc, "_design/" + design, (err, body, header) => {
      logCouchError(err, body, header, "init:design:" + JSON.stringify(design)); // returns if no err
    });
  } else {
    console.log("[error] Design doc injection issue at " + file);
  }
}

function injectReplFilter(couch, file) {
  let filter_doc = getDocument(file);
  if (filter_doc !== false) {
    couch.insert(filter_doc, "_design/repl_filters", (err, body, header) => {
      logCouchError(err, body, header, "init:repl:" + JSON.stringify(filter_doc)); // returns if no err
    });
  } else {
    console.log("[error] Filter doc injection issue (no doc) at " + file);
  }
}

function handleDatabaseErrors(err, name) {
  if (err.toString().indexOf("the file already exists") !== -1) {
    // silently fail, this is ok
  } else if (err.toString().indexOf("error happened") !== -1) {
    console.log("[CRITICAL] 🚫 Database connectivity issue. " + err.toString() + " URI: " + app_config.database_uri);
    // give some time for DB to wake up until next try, also prevents too fast restarts...
    setTimeout(function () {
      process.exit(1);
    }, 1000);
  } else {
    console.log("[CRITICAL] 🚫 Database " + name + " creation failed. " + err + " URI: " + app_config.database_uri);
    setTimeout(function () {
      process.exit(2);
    }, 1000);
  }
}

const Buildlog = require("./lib/thinx/buildlog"); // must be after initDBs as it lacks it now
const blog = new Buildlog();

// Starts Git Webhook Server
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
    console.log("[info] Webhook API started on port", app_config.webhook_port);
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
    console.log("[info] Hook process started...");
    watcher.process_hook(req.body);
    console.log("[info] Hook process completed.");
  }); // end of Legacy Webhook Server; will deprecate after reconfiguring all instances or if no webhook_port is defined
}

// DI
app.builder = builder;
app.queue = queue;


// Redis
let connect_redis = require("connect-redis");
const { callbackify } = require("util");
var RedisStore = connect_redis(session);
var sessionStore = new RedisStore({ client: redis_client });

app.set("trust proxy", 1);

require('path');

// Bypassed LGTM, because it does not make sense on this API for all endpoints,
// what is possible is covered by helmet and no-cache.

// allow disabling Secure/HTTPOnly cookies for HTTP-only mode (development, localhost)
let enforceMaximumSecurity = app_config.debug.allow_http_login ? true : false;

const sessionConfig = {
  secret: session_config.secret,
  cookie: {
    maxAge: 3600000,
    secure: enforceMaximumSecurity,
    httpOnly: true
  },
  store: sessionStore,
  name: "x-thx-session",
  resave: false, // was true
  rolling: false,
  saveUninitialized: false,
};

const sessionParser = session(sessionConfig); /* lgtm [js/missing-token-validation] lgtm [js/clear-text-cookie] lgtm [js/client-exposed-cookie] */

app.use(sessionParser);

// rolling was true; This resets the expiration date on the cookie to the given default.

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
  console.log("[info] HTTP API started on port", app_config.port);
  let end_timestamp = new Date().getTime() - start_timestamp;
  let seconds = Math.ceil(end_timestamp / 1000);
  console.log("[debug] Startup phase took:", seconds, "seconds");
});

var read = require('fs').readFileSync;

if ((fs.existsSync(app_config.ssl_key)) && (fs.existsSync(app_config.ssl_cert))) {

  let sslvalid = false;

  if (!fs.existsSync(app_config.ssl_ca)) {
    const message = "[warning] Did not find app_config.ssl_ca file, websocket logging will fail...";
    rollbar.warn(message);
    console.log(message);
  }

  let caCert = read(app_config.ssl_ca, 'utf8');
  let ca = pki.certificateFromPem(caCert);
  let client = pki.certificateFromPem(read(app_config.ssl_cert, 'utf8'));
  console.log("[info] Loaded SSL certificate.");

  try {
    sslvalid = ca.verify(client);
  } catch (err) {
    console.log("[error] Certificate verification failed: ", err);
  }

  if (sslvalid) {
    ssl_options = {
      key: read(app_config.ssl_key, 'utf8'),
      cert: read(app_config.ssl_cert, 'utf8'),
      ca: read(app_config.ssl_ca, 'utf8'),
      NPNProtocols: ['http/2.0', 'spdy', 'http/1.1', 'http/1.0']
    };
    console.log("[info] Starting HTTPS server on " + app_config.secure_port + "...");
    https.createServer(ssl_options, app).listen(app_config.secure_port, "0.0.0.0");
  } else {
    console.log("[error] SSL certificate loading or verification FAILED! Check your configuration!");
  }

} else {
  console.log("[warning] Skipping HTTPS server, SSL key or certificate not found. This configuration is INSECURE! and will cause an error in Enterprise configurations in future.");
}

app.use('/static', express.static(path.join(__dirname, 'static')));
app.set('trust proxy', ['loopback', '127.0.0.1']);


/*
 * WebSocket Server
 */

var wsapp = express();
wsapp.disable('x-powered-by');

wsapp.use(session({ /* lgtm [js/client-exposed-cookie] */
  secret: session_config.secret,
  store: sessionStore,
  cookie: {
    expires: hour,
    secure: enforceMaximumSecurity,
    httpOnly: true
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
    console.log("Socket already mapped for", owner);
    return;
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
    let safe_id = Sanitka.branch(req2.body.build_id);
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
// Database compactor
//

function database_compactor() {
  nano.db.compact("managed_logs");
  nano.db.compact("managed_builds");
  nano.db.compact("managed_devices");
  nano.db.compact("managed_users", "owners_by_username", function (/* err */) {
    console.log("» Database compact jobs completed.");
  });
}

//
// Log aggregator
//

// Warning, this is never called! (as well as aggregator and compactor and startup quote?)
function log_aggregator() {
  stats.aggregate();
  console.log("» Aggregation jobs completed.");
}

//
// Master check in cluster mode
//

function isMasterProcess() {
  return true; // should be actually `cluster.isMaster();`
}

function startup_quote() {
  if ((typeof (process.env.ENTERPRISE) === "undefined") || (process.env.ENTERPRISE === false)) {
    app.messenger.sendRandomQuote();
  }
}

if (isMasterProcess()) {
  setInterval(database_compactor, 3600 * 1000);
  setInterval(log_aggregator, 86400 * 1000 / 2);
  setTimeout(startup_quote, 10000); // wait for Slack init only once
}