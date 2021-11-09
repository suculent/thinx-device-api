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

const cluster = require('cluster');
const numCPUs = require('os').cpus().length; // default number of forks

class Transformer {

  constructor() {

    this.app = express();
    this.app.disable('x-powered-by');

    if (cluster.isMaster) {
      console.log(`[transformer] Master ${process.pid} is running`);
      // Fork workers.
      const forks = numCPUs;
      for (let i = 0; i < forks; i++) {
        cluster.fork();
      }
      cluster.on('exit', (worker, code, signal) => {
        console.log(`[transformer] worker ${worker.process.pid} died`);
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

    console.log("[transformer] Node " + process.pid + " started");

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
    console.log("[transformer] Started on port: " + http_port);
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
  }

  process(req, res) {
    if (typeof(req.body) === "undefined") {
      res.end(JSON.stringify({
        success: false,
        error: "missing: body"
      }));
      return;
    }

    var ingress = {};
    try {
      ingress = JSON.parse(req.body);
    } catch (e) {
      ingress = req.body;
    }

    var jobs = ingress.jobs;
    if (typeof(ingress.jobs) === "undefined") {
      res.end(JSON.stringify({
        success: false,
        error: "missing: body.jobs"
      }));
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
        console.log("[transformer] Job is not a base64.");
        decoded = false;
      }

      if (decoded === false) {
        try {
          cleancode = unescape(base64.decode(code.toString('utf8')));
          decoded = true;
        } catch (e) {
          console.log("[transformer] Base 128 not supported anymore.");
          decoded = false;
        }
      }

      if (decoded === false) {
        cleancode = unescape(code); // accept bare code for testing, will deprecate
      }

    } catch (e) {
      console.log("[transformer] Docker Transformer Ecception: " + e);
      error = JSON.stringify(e);
    }
    return cleancode;
  }

  process_jobs(jobs, callback) {
    var input_raw = jobs[0].params.status;
    var status = input_raw;
    var error = null;
    for (var job_index in jobs) {
      const job = jobs[job_index];
      // This is just a simple blacklist for dangerous functions.
      // -> extract from here 
      const code = this.sanitize(job.code);
      if (job.code.indexOf("child_process") !== -1) {
        callback("child process not allowed", true);
        return;
      }
      if (job.code.indexOf("transformer") === -1) {
        callback("lambda function missing", true);
        return;
      }
      // <- extract to here
       // console.log(new Date().toString() + " job: " + JSON.stringify(job));
      try {
        var transformer = function() {
          // initially empty
        };
        /* jshint -W061 */
        eval(code); // expects `transformer(status, device)` function only
        /* jshint +W061 */
        status = transformer(status, job.params.device); // passthrough previous status
        console.log("[transformer] Docker Transformer will return status: '" + status + "'");
      } catch (e) {
        console.log("[transformer] Docker Transformer Exception: " + e);
        error = JSON.stringify(e);
      }
    }
    callback(status, error);
  }

  transform(jobs, res) {
    this.process_jobs(jobs, (status, error) => {
      res.end(JSON.stringify({
        output: status,
        error: error
      }));
    });
  }

}

new Transformer();