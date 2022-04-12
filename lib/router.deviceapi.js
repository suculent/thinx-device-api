// /api/v2/ Device router

const Device = require("../lib/thinx/device");
const Util = require("./thinx/util");

const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

const Globals = require("./lib/thinx/globals.js"); // static only!
var app_config = Globals.app_config();

module.exports = function (app) {

  var device = new Device();

  //
  // Main Device API
  //

  // used only by /api/device/firmware where it allows specific user-agents only
  function validateRequest(req, res) {
    // Check device user-agent
    var ua = req.headers["user-agent"];
    const client_user_agent = app_config.client_user_agent;
    var validity = ua.indexOf(client_user_agent);

    if (validity === 0) {
      return true;
    } else {

      // testing framework
      if (ua.indexOf("node-superagent") !== -1) {
        return true;
      }

      if (ua.indexOf("SIGFOX") !== -1) {
        return true;
      }

      // ESP32HTTPClient has issues overriding User-Agent?
      if (ua.indexOf("ESP32HTTPClient") !== -1) {
        return true;
      }

      console.log("User-Agent: " + ua + " invalid!");
      res.writeHead(401, {
        "Content-Type": "text/plain"
      });
      res.end("invalid request");
      return false;
    }
  }

  var getClientIp = function (req) {
    var ipAddress = req.ip;
    if (!ipAddress) {
      console.log("⚠️ [warning] Unknown Client IP:" + ipAddress);
      return false;
    }
    // convert from "::ffff:192.0.0.1"  to "192.0.0.1"
    if (ipAddress.indexOf("::ffff:") !== -1) {
      ipAddress = ipAddress.replace("::ffff:", "");
    }
    return ipAddress;
  };

  // Firmware update retrieval for OTT requests
  app.get("/device/firmware", function (req, res) {
    const ott = req.query.ott;
    if (typeof (ott) === "undefined" || ott === null) {
      console.log("[error] GET request for FW update with no OTT!");
      Util.respond(res, {
        success: false,
        status: "missing_ott"
      });
      return;
    }
    console.log("GET request for FW update with OTT: " + ott);

    device.ott_update(ott, (success, response) => {
      if (success) {
        console.log("SUCCESS! Responding with contents...");
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename=firmware.bin');
        // deepcode ignore ContentLengthInCode: this is not code for browsers but for legacy OTA device updates
        res.setHeader('Content-Length', response.filesize);
        res.setHeader('x-MD5', response.md5);
        Util.respond(res, response.payload);
      } else {
        console.log("No successful firmware build found: " + JSON.stringify(response));
        Util.respond(res, response);
      }
    });
  });

  // Firmware update retrieval. Serves binary [by owner (?) - should not be required] and device MAC.
  app.post("/device/firmware", function (req, res) {

    validateRequest(req, res);
    res.set("Connection", "close");

    // Device will create OTT request and fetch firmware from given OTT-URL
    if ((typeof (req.body.use) !== "undefined") && (req.body.use == "ott")) {
      device.ott_request(req, (success, response) => {
        console.log("Responding to OTT request with :", { response });
        Util.respond(res, response);
      });

      // Device will fetch firmware/files now (wrapped as JSON or in binary, depending on type (firmware/file))
    } else {
      device.firmware(req, (success, response) => {
        console.log("Responding to Firmware request with :", { response }, "and success:", success);
        Util.respond(res, response);
      });
    }
  });

  // Device login/registration
  // MAC is be allowed for initial regitration where device is given new UDID

  app.post("/device/register", function (req, res) {

    var rip = getClientIp(req);

    if (typeof (req.body) === "undefined") {
      Util.respond(res, {
        success: false,
        status: "no_body"
      });

    } else if (typeof (req.body.registration) === "undefined") {
      if (rip !== false) {
        console.log("Incoming request has no `registration` in body, should BLACKLIST " + rip);
        console.log("headers: " + JSON.stringify(req.headers));
        console.log("body: " + JSON.stringify(req.body));
        Util.respond(res, {
          success: false,
          status: "blacklisted"
        });
      }
    } else {
      var registration = req.body.registration;
      let websocket = null;
      if (typeof (req.session) !== "undefined") {
        if (typeof (req.session.owner) !== "undefined") {
          websocket = req.session.owner;
        }
      }
      try {
        if (typeof (registration.owner) !== "undefined") {
          if ((typeof (app._ws) !== "undefined") && (typeof (app._ws[registration.owner]) !== "undefined")) {
            websocket = app._ws[registration.owner];
          }
        }
      } catch (err) {
        console.log("Caught exception: ", err);
      }
      device.register(
        req,
        registration,
        req.headers.authentication,
        websocket,
        (success, response) => {
          // Append timestamp inside as library is not parsing HTTP response JSON properly
          // when it ends with anything else than }}
          if (success && typeof (response.registration) !== "undefined") {
            response.registration.timestamp = Math.floor(new Date() / 1000);
          }
          if (success === false) {
            console.log("Device registration failed with response:", response);
          } else {
            console.log("Device registration succeeded.");
          }
          Util.respond(res, response);
        });
    }
  });

  // Device push attach
  // UDID is required, valid Push token is required. Potential point for DDoS attacks,
  // would use at least SOME authentication.

  app.post("/device/addpush", function (req, res) {

    if ((typeof (req.body) === "undefined") || (typeof (req.body.push) === "undefined")) {
      Util.respond(res, {
        success: false,
        status: "no_body"
      });
      return;
    }

    let tstring = req.body.push;

    if ((typeof (tstring) !== "string") || (tstring === "")) {
      Util.respond(res, {
        success: false,
        status: "no_token"
      });
      return;
    }

    let token = sanitka.pushToken(tstring);

    if (token == null) {
      Util.respond(res, {
        success: false,
        status: "no_token"
      });
      return;
    }

    let api_key = sanitka.apiKey(req.headers.authentication);
    if (api_key === null) {
      res.status(403).end();
      return;
    }

    device.push(token, api_key, (success, response) => {
      if (success) {
        Util.respond(res, response);
      } else {
        console.log("Push registration failed:", response);
      }
    });
  });

};