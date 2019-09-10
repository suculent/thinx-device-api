describe("Build log", function() {

  var Blog = require("../../lib/thinx/buildlog");
  var blog = new Blog();

  var envi = require("./_envi.json");
  var owner = envi.oid;
  var udid = envi.udid;
  var apikey = envi.ak;

  var build_id = envi.build_id; // "f168def0-597f-11e7-a932-014d5b00c004";

  /*
   * WebSocket Server
   */

  var express = require("express");
  var session = require("express-session");
  var http = require("http");
  var https = require("https");
  var WebSocket = require("ws");
  var ws_done;

  var wsapp = express();

  wsapp.use(function(req, res) {
    res.send({
      msg: "TEST"
    });
  });

  // WebSocket Server
  var wserver = http.createServer(wsapp);

  var wss = new WebSocket.Server({
    port: 7447,
    server: wserver
  });

  var _ws = null;

  function noop() {}

  function heartbeat() {
    this.isAlive = true;
  }

  wss.on('connection', function connection(ws, req) {

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    _ws = ws;
    var location = req.url;
    console.log("» WSS connection on location: " + location);
    console.log("» WSS cookie: " + req.headers.cookie);
    try {
      ws.send('HELLO');
    } catch (e) { /* handle error */ }

    ws.on('message', function incoming(message) {
      console.log('» Websocket message: %s', message);
    });

    ws.send('READY');

    ws_done();
  });

  it("should be able to initialize", function() {
    expect(blog).toBeDefined();
  });

  it("should be able to list build logs", function(done) {
    blog.list(owner, function(err, body) {
      console.log(err, body);
      expect(body).toBeDefined();
      done();
    });
  }, 15000);

  it("should be able to fetch specific build log", function(done) {
    blog.fetch(build_id, function(err, body) {
      console.log(err, body);
      expect(err).toBeDefined();
      done();
    });
  }, 10000);

  it("should be able to log", function(done) {
    blog.log(build_id, owner, udid, "Testing build log create...");
    expect(true).toBe(true);
    done();
  }, 5000);

  it("should be able to append existing log", function(done) {
    blog.log(build_id, owner, udid, "Testing build log append...");
    done();
  }, 5000);

  it("should be able to tail log for build_id", function() {
    blog.logtail(build_id, require("./_envi.json").oid, _ws,
      function(err) {
        console.log(err);
        expect(true).toBe(true);
      });
  });

  it("should provide path for device", function() {
    var path = blog.pathForDevice(owner, udid);
    console.log("path: "+path);
    expect(path).toBeDefined();
  });

});
