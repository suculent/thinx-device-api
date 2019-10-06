if (typeof(process.env.SQREEN_TOKEN) !== "undefined") {
  require('sqreen');
}

/*
var Rollbar = require("rollbar");

var rbconfig = require("./rollbar.json");
var rollbar = new Rollbar({
  accessToken: rbconfig.token,
  handleUncaughtExceptions: true,
  handleUnhandledRejections: true
});
*/
var express = require("express");
var session = require("express-session");
var http = require('http');
var https = require("https");

require('ssl-root-cas').inject();
https.globalAgent.options.ca = require('ssl-root-cas');

var parser = require("body-parser");
var typeOf = require("typeof");
var base64 = require("base-64");
var base128 = require("base128");

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

class Transformer {

  constructor() {

    this.app = express();

    if (cluster.isMaster) {
      console.log(`Master ${process.pid} is running`);
      // Fork workers.
      const forks = numCPUs;
      for (let i = 0; i < forks; i++) {
        cluster.fork();
      }
      cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
      });
    } else {
      this.setupServer();
    }
    this.setupRoutes();
  }

  setupServer() {
    // Workers can share any TCP connection
    // In this case it is an HTTP server
    http.createServer(this.app).listen(8000, "0.0.0.0");

    console.log("Worker " + process.pid + " started");
    console.log("Starting THiNX Transformer Server Node at " + new Date().toString());

    this.app.use(parser.json({
      limit: "1mb"
    }));

    this.app.use(parser.urlencoded({
      extended: true,
      parameterLimit: 1000,
      limit: "1mb"
    }));

    const http_port = 7474;
    http.createServer(this.app).listen(http_port, "0.0.0.0");
    console.log("Started on port: " + http_port);
  }

  setupRoutes() {

    this.app.all("/*", function(req, res, next) {
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

    this.app.post("/do", function(req, res) {
      this.process(req, res);
    });

    /* Credits handler, returns current credits from user info */
    this.app.get("/id", function(req, res) {
      this.respond(res, {
        id: server_id,
        mac: server_mac
      });
    });
  }

  process(req, res) {
    if (typeof(req.body) === "undefined") {
      this.respond(res, {
        success: false,
        error: "missing: body"
      });
      return;
    }

    var ingress = req.body;
    try {
      ingress = JSON.parse(req.body);
    } catch (e) {
      ingress = req.body;
    }

    var jobs = ingress.jobs;
    if (typeof(ingress.jobs) === "undefined") {
      this.respond(res, {
        success: false,
        error: "missing: body.jobs"
      });
      return;
    }

    console.log(new Date().toString() + "Incoming job.");
    this.transform(jobs, res);
  }

  sanitize(code) {

    var cleancode;

    try {
      var exec = null;
      var decoded = false;

      // Try unwrapping as Base64
      try {
        cleancode = unescape(base64.decode(code));
        decoded = true;
      } catch (e) {
        console.log("Job is not a base64.");
        decoded = false;
      }

      if (decoded === false) {
        // Try unwrapping as Base128
        try {
          cleancode = unescape(base128.decode(code));
          decoded = true;
        } catch (e) {
          console.log("Job is not a base128.");
          decoded = false;
        }
      }

      if (decoded === false) {
        cleancode = unescape(code); // accept bare code for testing, will deprecate
      }

    } catch (e) {
      console.log("Docker Transformer Ecception: " + e);
      error = JSON.stringify(e);
    }
    return cleancode;
  }

  respond(res, object) {
    if (typeOf(object) == "buffer") {
      res.header("Content-Type", "application/octet-stream");
      res.send(object);
    } else if (typeOf(object) == "string") {
      res.end(object);
    } else {
      res.end(JSON.stringify(object));
    }
  }

  process_jobs(jobs, callback) {
    var input_raw = jobs[0].params.status;
    var status = input_raw;
    var error = null;
    for (var job_index in jobs) {
      const job = jobs[job_index];
      const code = this.sanitize(job.code);
      console.log(new Date().toString() + " job: " + JSON.stringify(job));
      try {
        console.log("Running code:\n" + code);
        var transformer = function() {};
        /* jshint -W061 */
        eval(code); // expects transformer(status, device); function only; may provide API
        /* jshint +W061 */
        status = transformer(status, job.params.device); // passthrough previous status
        console.log("Docker Transformer will return status: '" + status + "'");
      } catch (e) {
        console.log("Docker Transformer Exception: " + e);
        error = JSON.stringify(e);
      }
    }
    callback(input_raw, status, error);
  }

  transform(jobs, res) {
    this.process_jobs(jobs, (input_raw, status, error) => {
      this.respond(res, {
        input: input_raw,
        output: status,
        error: error
      });
    });
  }

}

var server = new Transformer();
console.log("Transformer initialized...");
