if (typeof(process.env.SQREEN_TOKEN) !== "undefined") {
  require('sqreen');
}

const Rollbar = require("rollbar");
const express = require("express");
const session = require("express-session");
const http = require('http');
const https = require("https");

require('ssl-root-cas').inject();
https.globalAgent.options.ca = require('ssl-root-cas');

const parser = require("body-parser");
const typeOf = require("typeof");
const base64 = require("base-64");
const base128 = require("base128");

const uuidv1 = require('uuid/v1');
const server_id = uuidv1();

var server_mac = null;

const cluster = require('cluster');
const numCPUs = require('os').cpus().length; // default number of forks

require('getmac').getMac(function(err, macAddress) {
  if (err) {
    console.log("getmac error: " + err);
  } else {
    console.log(macAddress);
    server_mac = macAddress;
  }
});

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  // Fork workers.
  const forks = numCPUs;
  for (let i = 0; i < forks; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    console.log(`master worker ${worker.process.pid} died`);
  });
} else {
  // Workers can share any TCP connection
  // In this case it is an HTTP server
  http.createServer((req, res) => {
    res.writeHead(200);
    res.end('hello world\n');
  }).listen(8000);

  console.log(`Worker ${process.pid} started`);
}

var rollbar = new Rollbar({
  accessToken: process.env.POST_SERVER_ITEM_ACCESS_TOKEN,
  handleUncaughtExceptions: true,
  handleUnhandledRejections: true
});

function respond(res, object) {
  if (typeOf(object) == "buffer") {
    res.header("Content-Type", "application/octet-stream");
    res.send(object);
  } else if (typeOf(object) == "string") {
    res.end(object);
  } else {
    res.end(JSON.stringify(object));
  }
}

console.log("Starting THiNX Transformer Server Node at " + new Date().toString());

var app = express();

app.use(parser.json({
  limit: "1mb"
}));

app.use(parser.urlencoded({
  extended: true,
  parameterLimit: 1000,
  limit: "1mb"
}));

app.use(rollbar.errorHandler());

const http_port = process.env.THINX_TRANSFORMER_PORT || 7474;

http.createServer(app).listen(http_port, "0.0.0.0");

console.log("Started on port: " + http_port);

app.all("/*", function(req, res, next) {

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-type,Accept,X-Access-Token,X-Key");

  if (req.method == "OPTIONS") {
    res.status(200).end();
  } else {
    next();
  }
});

//
// Handlers
//

app.post("/do", function(req, res) {

  //
  // Input validation
  //
  //

  if (typeof(req.body) === "undefined") {
    respond(res, {
      success: false,
      error: "missing: body"
    });;
    return;
  }

  var ingress = req.body;

  try {
    ingress = JSON.parse(req.body);
  } catch (e) {
    ingress = req.body;
  }

  console.log("---");

  var jobs = ingress.jobs;

  if (typeof(ingress.jobs) === "undefined") {
    respond(res, {
      success: false,
      error: "missing: body.jobs"
    });;
    return;
  }

  console.log(new Date().toString() + "Incoming job.");

  //
  // Run loop
  //

  var input_raw = jobs[0].params.status;

  var status = input_raw;
  var error = null;

  for (var job_index in jobs) {

    const job = jobs[job_index];
    const code = job.code;
    const owner = job.owner;
    const transaction_id = job.id;

    console.log(new Date().toString() + " job: " + JSON.stringify(job));

    var exec = null;

    /* jshint -W061 */
    var cleancode;
    var decoded = false;

    if (decoded === false) {
      try {
        cleancode = unescape(base64.decode(code));
        decoded = true;
      } catch (e) {
        console.log("Job is not a base64.");
        decoded = false;
      }
    }

    if (decoded === false) {
      try {
        cleancode = unescape(base128.decode(code));
        decoded = true;
      } catch (e) {
        console.log("Job is not a base128.");
        decoded = false;
      }
    }

    try {
      if (decoded === false) {
        cleancode = unescape(code); // accept bare code for testing, will deprecate
      }
    } catch (e) {
      console.log("Accepting bare code failed.");
      return;
    }

    console.log("Running code:\n" + cleancode);

    try {
      eval(cleancode); // expects transformer(status, device); function only; may provide API
      status = transformer(status, job.params.device); // passthrough previous status
      console.log("Docker Transformer will return status: '" + status + "'");
      /* jshint +W061 */
    } catch (e) {
      // catches error from last unescape or eval?
      console.log("Docker Transformer Exception: " + e);
      error = JSON.stringify(e);
    }
  }

  respond(res, {
    input: input_raw,
    output: status,
    error: error
  });

});

/* Credits handler, returns current credits from user info */
app.get("/id", function(req, res) {
  respond(res, {
    id: server_id,
    mac: server_mac
  });
});
