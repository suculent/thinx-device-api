/*
 * This THiNX-RTM API module is responsible for responding to devices and build requests.
 */
var Globals = require("./lib/thinx/globals.js"); // static only!

console.log("--- " + new Date() + " ---");

var Sqreen;

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

const crypto = require('crypto');
const express = require("express");
const session = require("express-session");
const cluster = require('cluster');
const bodyParser = require("body-parser");

var Auth = require('./lib/thinx/auth.js');
var auth = new Auth();

let pki = require('node-forge').pki;
var fs = require("fs-extra");

// set up rate limiter
var RateLimit = require('express-rate-limit');
var limiter = new RateLimit({
  windowMs: 1*60*1000, // 1 minute
  max: 500
});

// console.log(crypto.getCiphers()); // log supported ciphers to debug SSL IoT transport

require("ssl-root-cas").inject();

var http = require('http');
var redis = require('redis');
var path = require('path');
var session_config = require("./conf/node-session.json");

var app_config = Globals.app_config();
var prefix = Globals.prefix();
var rollbar = Globals.rollbar(); // lgtm [js/unused-local-variable]
var redis_client = redis.createClient(Globals.redis_options());

//
// Shared Configuration
//

const hour = 3600 * 1000;
const day = hour * 24;

//
// App
//

var _ws = null;

var db = app_config.database_uri;
var socketPort = app_config.socket;

var https = require("https");
var parser = require("body-parser");

var WebSocket = require("ws");

// list of previously discovered attackers
var BLACKLIST = ["1.2.3.4"];

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


// EXTRACT TO: db.js -->

/*
 * Databases
 */

try {
  var pfx_path = __dirname + '/conf/.thx_prefix';
  if (fs.existsSync(pfx_path)) {
    prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
  } else {
    // create .thx_prefix with random key on first run!
    fs.ensureFile(pfx_path, function(e) {
      if (e) {
        console.log("» error creating thx_prefix: " + e);
      } else {
        crypto.randomBytes(12, function(err, buffer) {
          var prefix_z = buffer.toString('hex');
          fs.writeFile(prefix_z, "", function(err_z) {
            if (err_z) {
              console.log("» error writing thx_prefix: " + err);
            }
          });
        });
      }
    });
  }
} catch (e) {
  console.log("» thx_prefix_exception" + e);
}

console.log("» Initializing DB...");

var nano = require("nano")(db);

function initDatabases(dbprefix) {

  // only to fix bug in CouchDB 2.3.1 first-run
  nano.db.create("_users", function(err, body, header) {});
  nano.db.create("_stats", function(err, body, header) {});
  nano.db.create("_replicator", function(err, body, header) {});
  nano.db.create("_global_changes", function(err, body, header) {});

  nano.db.create(dbprefix + "managed_devices", function(err, body, header) {
    if (err) {
      handleDatabaseErrors(err, "managed_devices");
    } else {
      console.log("» Device database creation completed. Response: " +
        JSON.stringify(body) + "\n");
      var couch = nano.db.use(dbprefix + "managed_devices");
      injectDesign(couch, "devicelib", "./design/design_deviceslib.json");
      injectReplFilter(couch, "./design/filters_devices.json");
    }
  });

  nano.db.create(dbprefix + "managed_builds", function(err, body, header) {
    if (err) {
      handleDatabaseErrors(err, "managed_builds");
    } else {
      console.log("» Build database creation completed. Response: " +
        JSON.stringify(body) + "\n");
      var couch = nano.db.use(dbprefix + "managed_builds");
      injectDesign(couch, "builds", "./design/design_builds.json");
      injectReplFilter(couch, "./design/filters_builds.json");
    }
  });

  nano.db.create(dbprefix + "managed_users", function(err, body, header) {
    if (err) {
      handleDatabaseErrors(err, "managed_users");
    } else {
      console.log("» User database creation completed. Response: " +
        JSON.stringify(body) + "\n");
      var couch = nano.db.use(dbprefix + "managed_users");
      injectDesign(couch, "users", "./design/design_users.json");
      injectReplFilter(couch, "./design/filters_users.json");
    }
  });

  nano.db.create(dbprefix + "managed_logs", function(err, body, header) {
    if (err) {
      handleDatabaseErrors(err, "managed_logs");
    } else {
      console.log("» Log database creation completed. Response: " +
        JSON.stringify(body) + "\n");
      var couch = nano.db.use(dbprefix + "managed_logs");
      injectDesign(couch, "logs", "./design/design_logs.json");
      injectReplFilter(couch,  "./design/filters_logs.json");
    }
  });
}

initDatabases(prefix);

var devicelib = require("nano")(db).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]
var userlib = require("nano")(db).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]

// should be initialized after prefix because of DB requirements...
var Version = require("./lib/thinx/version");
var v = new Version();

console.log("Loading module: Statistics");
var Stats = require("./lib/thinx/statistics");
var stats = new Stats();

console.log("Loading module: Messenger");
var Messenger = require("./lib/thinx/messenger");
var messenger = new Messenger().getInstance(); // take singleton to prevent double initialization

console.log("Loading module: Repository Watcher");
var Repository = require("./lib/thinx/repository");

console.log("Loading module: Queue");
var Queue = require("./lib/thinx/queue");
var queue = new Queue();
queue.cron(); // starts cron job for build queue from webhooks


//
// REFACTOR: Move to database.js
//

// Database preparation on first run
function getDocument(file) {
  if (!fs.existsSync(file)) {
    return false;
  }
  const data = fs.readFileSync(file);
  if (typeof(data) === "undefined") {
    console.log("» [getDocument] no data read.");
    return false;
  }
  // Parser may fail
  try {
    const filter_doc = JSON.parse(data);
    return filter_doc;
  } catch (e) {
    console.log("» Document File may not exist: "+e);
    return false;
  }
}

function logCouchError(err, body, header, tag) {
  if (err !== null) {
    console.log("» Log Couch Insert error: "+err);
  } else {
    return;
  }
  if (typeof(body) !== "undefined") {
    console.log("» Log Couch Insert body: "+body+" "+tag);
  }
  if (typeof(header) !== "undefined") {
    console.log("» Log Couchd Insert header: "+header+" "+tag);
  }
}

function injectDesign(couch, design, file) {
  if (typeof(design) === "undefined") return;
  console.log("» Inserting design document " + design + " from path", file);
  let design_doc = getDocument(file);
  if (design_doc != null) {
    //console.log("Inserting design document", {design_doc});
    couch.insert(design_doc, "_design/" + design, function(err, body, header) {
      logCouchError(err, body, header, "init:design:"+design);
    });
  } else {
    console.log("» Design doc injection issue at "+file);
  }
}

function injectReplFilter(couch, file) {
  console.log("» Inserting filter document from path", file);
  let filter_doc = getDocument(file);
  if (filter_doc !== false) {
    //console.log("Inserting filter document", {filter_doc});
    couch.insert(filter_doc, "_design/repl_filters", function(err, body, header) {
      logCouchError(err, body, header, "init:repl:"+filter_doc);
    });
  } else {
    console.log("» Filter doc injection issue (no doc) at "+file);
  }
}

function handleDatabaseErrors(err, name) {
  if (err.toString().indexOf("the file already exists") !== -1) {
    // silently fail, this is ok
  } else if (err.toString().indexOf("error happened") !== -1) {
    console.log("[CRITICAL] 🚫 Database connectivity issue. " + err.toString() + " URI: "+app_config.database_uri);
    process.exit(1);
  } else {
    console.log("[CRITICAL] 🚫 Database " + name + " creation failed. " + err + " URI: "+app_config.database_uri);
    process.exit(2);
  }
}

const Buildlog = require("./lib/thinx/buildlog"); // must be after initDBs as it lacks it now
const blog = new Buildlog();

// Webhook Server
const watcher = new Repository();
const hook_server = express();
http.createServer(hook_server).listen(app_config.webhook_port, "0.0.0.0", function() {
  console.log("» Webhook API started on port", app_config.webhook_port);
});
hook_server.use(bodyParser);
hook_server.post("/", function(req, res) {
  let success = watcher.process_hook(req.body);
  if (success) {
    res.status(200).end();
  } else {
    res.status(403).end();
  }
}); // end Webhook Server

// App
const app = express();
app.messenger = messenger;

// Redis
var RedisStore = require("connect-redis")(session);
var sessionStore = new RedisStore({
  host: app_config.redis.host,
  port: app_config.redis.post,
  pass: app_config.redis.password,
  ttl : (60000 * 24 * 30)
});

app.set("trust proxy", 1);

require('path');

app.use(session({
  secret: session_config.secret,
  "cookie": {
    "maxAge": 86400000,
    "secure": true,
    "httpOnly": true
  },
  store: sessionStore,
  name: "x-thx-session",
  resave: true,
  rolling: false,
  saveUninitialized: false,
}));
// rolling was true; This resets the expiration date on the cookie to the given default.

app.use(parser.json({
  limit: "1mb",
  strict: false
}));

app.use(limiter);

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
    console.log("Returning error 403 for blacklisted IP.");
    res.status(403).end();
  }
});

// CSRF protection
// now add csrf and other middlewares, after the router was mounted
// var bodyParser = require('body-parser');
// app.use(bodyParser.urlencoded({ extended: false }));
// var cookieParser = require('cookie-parser');
// app.use(cookieParser());
// var csrf = require('csurf');
// app.use(csrf({ cookie: true })); collides with Sqreen

let router = require('./lib/router.js')(app, _ws);

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

// Legacy HTTP support for old devices without HTTPS proxy
http.createServer(app).listen(app_config.port, "0.0.0.0", function() {
  console.log("» Legacy API started on port", app_config.port);
});

if ((fs.existsSync(app_config.ssl_key)) && (fs.existsSync(app_config.ssl_cert))) {

  // Validate SSL certificate (if defined) and do not allow startup with invalid one...
  // It's pointless and it should lead to faster fix when this fails immediately in production.

  let caCert;
  let caStore;
  let ssloaded = false;

  try {
      caCert = fs.readFileSync(app_config.ssl_cert).toString();
      caStore = pki.createCaStore([ caCert ]);
      ssloaded = true;
  } catch (e) {
      console.log('Failed to load CA certificate (' + e + ')');
      // process.exit(43);
  }

  if (ssloaded) {

    let sslvalid = true;

    /*
    try {
        pki.verifyCertificateChain( caStore, [ caCert ]);
        sslvalid = true;
    } catch (e) {
        console.log('Failed to verify certificate (' + e.message || e + ')');
    }
    */

    if (sslvalid) {
      ssl_options = {
        key: fs.readFileSync(app_config.ssl_key),
        cert: fs.readFileSync(app_config.ssl_cert),
        NPNProtocols: ['http/2.0', 'spdy', 'http/1.1', 'http/1.0']
      };

      console.log("» Starting HTTPS server on " + app_config.secure_port + "...");
      https.createServer(ssl_options, app).listen(app_config.secure_port, "0.0.0.0", function() { } );
    } else {
      console.log("» SSL certificate validation FAILED! Check your configuration.");
    }
  }

} else {
  console.log("Skipping HTTPS server, SSL key or certificate not found.");
}

app.use('/static', express.static(path.join(__dirname, 'static')));
app.set('trust proxy', ['loopback', '127.0.0.1']);


/*
 * WebSocket Server
 */

var wsapp = express();

wsapp.use(session({
  secret: session_config.secret,
  store: sessionStore,
  cookie: {
    expires: hour
  },
  name: "x-thx-ws-session",
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

function noop() {}

function heartbeat() {
  this.isAlive = true;
}

setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      console.log("[DBUG] Terminating websocket!");
      ws.terminate();
    } else {
      ws.ping(noop);
    }
  });
}, 30000);

wss.on("connection", function(ws, req) {

  // May not exist while testing...
  if (typeof(ws) === "undefined" || ws === null) {
    console.log("Exiting WSS connecton, no WS defined!");
    return;
  }

  if (typeof(req) === "undefined") {
    console.log("No request on wss.on");
    return;
  }

  wss.on("error", function(err) {
    console.log("WSS REQ ERROR: " + err);
    return;
  });

  ws.isAlive = true;
  ws.on('pong', heartbeat);

  // Should be done after validation
  _ws = ws; // public websocket (!) does not at least fail
  if (typeof(app) !== "undefined") {
    app._ws = ws; // public websocket stored in app, needs to be set to builder/buildlog!
  }

  var cookies = req.headers.cookie;

  if (typeof(req.headers.cookie) !== "undefined") {

    if (cookies.indexOf("thx-") === -1) {
      console.log("» WARNING! No thx-cookie found in WS: " + JSON.stringify(req.headers
        .cookie));
    }

    if (typeof(req.session) !== "undefined") {
      console.log("Session: " + JSON.stringify(req.session));
    }
  }

  var logtail_callback = function(err, result) {
    console.log("[thinx] logtail_callback error:", err, "message", result);
  };

  // WARNING! New, untested! Requires websocket and refactoring into router.

  /* Returns specific build log for owner */
  console.log("Mapping endpoint: /api/user/logs/tail");
  app.post("/api/user/logs/tail", function(req2, res) {
    if (!(router.validateSecurePOSTRequest(req) || router.validateSession(req2, res))) return;
    var owner = req2.session.owner;
    if (typeof(req2.body.build_id) === "undefined") {
      router.respond(res, {
        success: false,
        status: "missing_build_id"
      });
      return;
    }
    var error_callback = function(err) {
      console.log(err);
      res.set("Connection", "close");
      router.respond(res, err);
    };
    console.log("Tailing build log for " + req2.body.build_id);
    //const Buildlog = require("./lib/thinx/buildlog"); // must be after initDBs as it lacks it now
    //const blog = new Buildlog();
    blog.logtail(req2.body.build_id, owner, ws, error_callback);
  });

  ws.on("message", (message) => {
    if (message.indexOf("{}") == 0) return; // skip empty messages
    var object = JSON.parse(message);
    if (typeof(object.logtail) !== "undefined") {
      console.log("Initializing WS logtail with object ", {object});
      var build_id = object.logtail.build_id;
      var owner_id = object.logtail.owner_id;
      blog.logtail(build_id, owner_id, _ws, logtail_callback);
    } else if (typeof(object.init) !== "undefined") {
      if (typeof(messenger) !== "undefined") {
        messenger.initWithOwner(object.init, _ws, function(success, message_z) {
          if (!success) {
            console.log("Messenger init on WS message with result " + success + ", with message: ", { message_z });
          }
        });
      } else {
        console.log("Messenger is not initialized and therefore could not be activated.");
      }
    } else {
      /* unknown message debug, must be removed */
      var m = JSON.stringify(message);
      if ((m != "{}") || (typeof(message)=== "undefined")) {
        console.log("» Websocketparser said: unknown message: " + m);
      }
    }
  });
}).on("error", function(err) {
  console.log("WSS ERROR: " + err);
  return;
});

wserver.listen(7444, "0.0.0.0", function listening() {
  console.log("» WebSocket listening on port %d", wserver.address().port);
});




/*
 * Bootstrap banner section
 */

var package_info = require("./package.json");
var product = package_info.description;
var version = package_info.version;

console.log("");
console.log("-=[ ☢ " + product + " v" + version + " rev. " + app.version() + " ☢ ]=-");
console.log("");

//
// Database compactor
//

function database_compactor() {
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
  stats.aggregate();
  console.log("» Aggregation jobs completed.");
}

//
// Master check in cluster mode
//

function isMasterProcess() {
  return true; // cluster.isMaster();
}

function reporter(success, default_mqtt_key) {
    if (success) {
      console.log("Restored Default MQTT Key...");
    }
}

function restore_owner_credentials(owner_id, dmk_callback) {
  devicelib.view("devicelib", "devices_by_owner", {
    "key": owner_id,
    "include_docs": false
  },
  (err, device) => {
    if (err) {
      console.log("list error: " + err);
      if ((err.toString().indexOf("Error: missing") !== -1) && typeof(callback) !== "undefined") {
        dmk_callback(false, "none");
      }
      console.log("restore_owner_credentials: Error: " + err.toString());
      return;
    }

    console.log("DEVICE: "+JSON.stringify(device, false, 2));

    // Get source keys
    const source_id = "ak:" + owner_id;
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

function setup_restore_owners_credentials(query) {
  userlib.get(query, (err, body) => {
    if (err) {
      console.log("DR ERR: "+err);
      return;
    }
    for (var i = 0; i < body.rows.length; i++) {
      var owner_doc = body.rows[i];
      var owner_id = owner_doc.id;
      if (owner_id.indexOf("design")) continue;
      console.log("Restoring credentials for owner "+owner_id);
      restore_owner_credentials(owner_id, (reporter));
    }
  });
}

function startup_quote() {
  if (process.env.ENTERPRISE !== true) {
    messenger.sendRandomQuote();
  }
}

if (isMasterProcess()) {

  setInterval(database_compactor, 3600 * 1000);
  setInterval(log_aggregator, 86400 * 1000 / 2);

  // MQTT Messenger/listener
  messenger.init();

  setTimeout(startup_quote, 10000); // wait for Slack init only once


  //
  // TODO: Move to messenger or owner OR DEVICES? Or extract?
  //

  /* This operation should restore MQTT passwords only. */
  // triggered by non-existend password file
  if (!fs.existsSync(app_config.mqtt.passwords)) {
    fs.ensureFile(app_config.mqtt.passwords, function(err) {
			if (err) {
				console.log("Error creating MQTT PASSWORDS file: " + err);
			}
      console.log("Running in disaster recovery mode...");
      setup_restore_owners_credentials("_all_docs"); // fetches only IDs and last revision, works with hundreds of users
		});
  }
}
