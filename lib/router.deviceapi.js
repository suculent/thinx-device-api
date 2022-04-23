// /api/v2/ Device router

const Device = require("../lib/thinx/device");
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

module.exports = function (app) {

  var device = new Device();

  //
  // Main Device API
  //

  // Firmware update retrieval for OTT requests
  app.get("/device/firmware", function (req, res) {
    const ott = req.query.ott;
    if (typeof (ott) === "undefined" || ott === null) {
      console.log("[error] GET request for FW update with no OTT!");
      Util.respond(res, {
        success: false,
        status: "OTT_MISSING"
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

    res.set("Connection", "close");

    // Device will create OTT request and fetch firmware from given OTT-URL
    if ((typeof (req.body.use) !== "undefined") && (req.body.use == "ott")) {
      device.ott_request(req, (_success, response) => {
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

    if (typeof (req.body) === "undefined") return Util.respond(res, false, "no_body");
    if (typeof (req.body.registration) === "undefined") return Util.failureResponse(res, 400, "request_invalid");
    if (Object.keys(req.body.registration).length < 1) return Util.failureResponse(res, 400, "request_invalid");

    device.register(
      req.body.registration,
      req.headers.authentication,
      res,
      (r, success, response) => {
        // Append timestamp inside as library is not parsing HTTP response JSON properly
        // when it ends with anything else than }}
        if ((success === true) && (typeof (response.registration) !== "undefined")) {
          response.registration.timestamp = Math.floor(new Date() / 1000);
        }
        if (success === false) return Util.responder(res, success, response);
        Util.respond(res, response);
      });
  });

  // Device push attach
  // UDID is required, valid Push token is required. Potential point for DDoS attacks,
  // would use at least SOME authentication.

  app.post("/device/addpush", function (req, res) {

    if ((typeof (req.body) === "undefined")) {
      return Util.responder(res, false, "no_body");
    }

    let body = req.body;

    let token = sanitka.pushToken(body.push);
    if (token === null) return Util.responder(res, false, "no_token");

    let api_key = sanitka.apiKey(req.headers.authentication);
    if (api_key === null) return res.status(403).end();

    device.push(body, api_key, (success, response) => {
      Util.responder(res, success, response);
    });
  });

};