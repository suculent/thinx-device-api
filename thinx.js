/*
 * This THiNX-RTM API module is responsible for responding to devices and build requests.
 */
var Globals = require("./lib/thinx/globals.js"); // static only!

console.log("--- " + new Date() + " ---");

var Sqreen;

var exec = require("child_process"); // lgtm [js/unused-local-variable]
var Rollbar = require("rollbar"); // lgtm [js/unused-local-variable]
var crypto = require('crypto');

var Auth = require('./lib/thinx/auth.js');
var auth = new Auth();

var fs = require("fs-extra");
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var csrf = require('csurf');

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
// Environment-dependent configurations
//

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

//
// App
//

console.log("Initializing App consts...");

var _ws = null;

var db = app_config.database_uri;
var serverPort = app_config.port;
var socketPort = app_config.socket;

var https = require("https");
var parser = require("body-parser");
var nano = require("nano")(db);

var WebSocket = require("ws");

// list of previously discovered attackers
var BLACKLIST = [];

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
  var pfx_path = app_config.project_root + '/conf/.thx_prefix';
  if (fs.existsSync(pfx_path)) {
    prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
  } else {
    // create .thx_prefix with random key on first run!
    fs.ensureFile(pfx_path, function(e) {
      if (e) {
        console.log("error creating thx_prefix: " + e);
      } else {
        crypto.randomBytes(12, function(err, buffer) {
          var prefix = buffer.toString('hex');
          fs.writeFile(prefix, "", function(err) {
            if (err) {
              console.log("error writing thx_prefix: " + err);
            }
          });
        });
      }
    });
  }
} catch (e) {
  console.log("[index] thx_prefix_exception" + e);
}

console.log("Initializing app requires...");

// should be initialized after prefix because of DB requirements...
var Version = require("./lib/thinx/version");
var v = new Version();

console.log("Loading module: statistics...");
var Stats = require("./lib/thinx/statistics");
var stats = new Stats();

console.log("[thinx.js] Loading module: messenger...");
var Messenger = require("./lib/thinx/messenger");
console.log("[thinx.js] Getting instance: messenger...");
var messenger = new Messenger().getInstance(); // take singleton to prevent double initialization

console.log("Loading module: repository/watcher...");
var Repository = require("./lib/thinx/repository");
var watcher = new Repository();
console.log("Starting repository watcher...");
watcher.watch();
console.log("Done.");


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
    console.log("[getDocument] no data read.");
    return false;
  }
  // Parser may fail
  try {
    const filter_doc = JSON.parse(data);
    return filter_doc;
  } catch (e) {
    console.log("File may not exist: "+e);
    return false;
  }
}

function logCouchError(err, body, header, tag) {
  if (err !== null) {
    console.log("[thinx.js:couch] Insert error: "+err);
  } else {
    return;
  }
  if (typeof(body) !== "undefined") {
    console.log("[thinx.js:couch] Insert body: "+body+" "+tag);
  }
  if (typeof(header) !== "undefined") {
    console.log("[thinx.js:couch] Insert header: "+header+" "+tag);
  }
}

function injectDesign(db, design, file) {
  if (typeof(design) === "undefined") return;
  console.log("Inserting design document " + design + " from path", file);
  let design_doc = getDocument(file);
  if (design_doc != null) {
    console.log("Inserting design document", {design_doc});
    db.insert(design_doc, "_design/" + design, function(err, body, header) {
      logCouchError(err, body, header, "init:design:"+design);
    });
  } else {
    console.log("Design doc injection issue at "+file);
  }
}

function injectReplFilter(db, file) {
  console.log("Inserting filter document from path", file);
  let filter_doc = getDocument(file);
  if (filter_doc !== false) {
    console.log("Inserting filter document", {filter_doc});
    db.insert(filter_doc, "_design/repl_filters", function(err, body, header) {
      logCouchError(err, body, header, "init:repl:"+filter_doc);
    });
  } else {
    console.log("Filter doc injection issue (no doc) at "+file);
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

function initDatabases() {

  // only to fix bug in CouchDB 2.3.1 first-run
  nano.db.create("_users", function(err, body, header) {});
  nano.db.create("_stats", function(err, body, header) {});
  nano.db.create("_replicator", function(err, body, header) {});
  nano.db.create("_global_changes", function(err, body, header) {});

  nano.db.create(prefix + "managed_devices", function(err, body, header) {
    if (err) {
      handleDatabaseErrors(err, "managed_devices");
    } else {
      console.log("» Device database creation completed. Response: " +
        JSON.stringify(body) + "\n");
      var db = nano.db.use(prefix + "managed_devices");
      injectDesign(db, "devicelib", "./design/design_deviceslib.json");
      injectReplFilter(db, "./design/filters_devices.json");
    }
  });

  nano.db.create(prefix + "managed_builds", function(err, body, header) {
    if (err) {
      handleDatabaseErrors(err, "managed_builds");
    } else {
      console.log("» Build database creation completed. Response: " +
        JSON.stringify(body) + "\n");
      var db = nano.db.use(prefix + "managed_builds");
      injectDesign(db, "builds", "./design/design_builds.json");
      injectReplFilter(db, "./design/filters_builds.json");
    }
  });

  nano.db.create(prefix + "managed_users", function(err, body, header) {
    if (err) {
      handleDatabaseErrors(err, "managed_users");
    } else {
      console.log("» User database creation completed. Response: " +
        JSON.stringify(body) + "\n");
      var db = nano.db.use(prefix + "managed_users");
      injectDesign(db, "users", "./design/design_users.json");
      injectReplFilter(db, "./design/filters_users.json");
    }
  });

  nano.db.create(prefix + "managed_logs", function(err, body, header) {
    if (err) {
      handleDatabaseErrors(err, "managed_logs");
    } else {
      console.log("» Log database creation completed. Response: " +
        JSON.stringify(body) + "\n");
      var db = nano.db.use(prefix + "managed_logs");
      injectDesign(db, "logs", "./design/design_logs.json");
      injectReplFilter(db,  "./design/filters_logs.json");
    }
  });
}

console.log("Initializing DB...");

initDatabases();

console.log("Starting with prefix: '"+prefix+"'");

var devicelib = require("nano")(db).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]
var userlib = require("nano")(db).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]

const Buildlog = require("./lib/thinx/buildlog"); // must be after initDBs as it lacks it now
const blog = new Buildlog();

//
// <<<
//

// <-- EXTRACT TO: db.js && databases must not be held by app class
// and they require on prefix as well...

// Express App
var express = require("express");
var session = require("express-session");

console.log("Initializing Express...");

var app = express();

console.log("» Starting Redis client...");
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
  limit: "1mb"
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
// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(cookieParser());
// app.use(csrf({ cookie: true })); collides with Sqreen

console.log("Initializing Endpoints...");

require('./lib/router.js')(app);

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
    console.log("» Starting HTTPS server on " + (serverPort + 1) + "...");
    https.createServer(ssl_options, app).listen(serverPort + 1, "0.0.0.0", function() { } );
  } else {
    console.log(
      "Skipping HTTPS server, SSL key or certificate not found.");
  }
}

app.use('/static', express.static(path.join(__dirname, 'static')));
app.set('trust proxy', ['loopback', '127.0.0.1']);

// Legacy HTTP support for old devices without HTTPS proxy
http.createServer(app).listen(serverPort, "0.0.0.0", function() { });

/*
 * WebSocket Server
 */

var wsapp = express();

console.log("Initializing WS session store...");

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
      console.log("Incoming WS message: "+message);

      if (typeof(object.logtail) !== "undefined") {

        var build_id = object.logtail.build_id;
        var owner_id = object.logtail.owner_id;
        blog.logtail(build_id, owner_id, _ws, logtail_callback);

      } else if (typeof(object.init) !== "undefined") {

        if (typeof(messenger) !== "undefined") {
          console.log("Initializing WS messenger with owner "+object.init);
          messenger.initWithOwner(object.init, _ws, function(success, message) {
            if (!success) {
              console.log("Messenger init on WS message with result " + success + ", with message: ", { message });
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
  }

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
  // rollbar.info("Running aggregator.");
  stats.aggregate();
  console.log("» Aggregation jobs completed.");
}

//
// Master check in cluster mode
//

const cluster = require('cluster');

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

if (isMasterProcess()) {

  setInterval(database_compactor, 3600 * 1000);
  setInterval(log_aggregator, 86400 * 1000 / 2);

  // MQTT Messenger/listener
  messenger.init();

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
