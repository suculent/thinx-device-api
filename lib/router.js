/* New Router */

module.exports = function (app) {

  const typeOf = require("typeof");

  const Globals = require("./thinx/globals");
  const app_config = Globals.app_config();

  const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
  const Util = require("./thinx/util");

  var APIKey = require("../lib/thinx/apikey");
  var apikey = new APIKey();

  //
  // Middleware-like Validation
  //

  function checkDirtyRequests(req, res, next) {

    if (req.headers.origin === "device") {
      next();
      return true;
    }

    let client = req.header("User-Agent");


    if (typeOf(client) === "undefined") {
      console.log("[checkDirtyRequests] NOT Dropping connection for client without user-agent (allow WSS).");
      return true;
    }

    if (client.indexOf("Jorgee") !== -1) {
      res.status(403).end();
      console.log("[checkDirtyRequests] Jorgee is blacklisted.");
      return false;
    }

    if (req.originalUrl.indexOf("admin") !== -1) {
      res.status(403).end();
      console.log("[checkDirtyRequests] admin is blacklisted because of request " + req.originalUrl);
      return false;
    }

    if (req.originalUrl.indexOf("php") !== -1) {
      res.status(403).end();
      console.log("[checkDirtyRequests] php is blacklisted.");
      return false;
    }

    if (req.originalUrl.indexOf("\\x04\\x01\\x00") !== -1) {
      res.status(403).end();
      console.log("[checkDirtyRequests] heartbleed is blacklisted.");
      return false;
    }

    return true; // passed all gates
  }

  function logAccess(req) {
    // log owner ID and request method to application log only
    if ((typeof (req.session) !== "undefined") && (typeof (req.session.owner) !== "undefined")) {
      // Skip logging for monitoring sites
      if (client.indexOf("uptimerobot") !== -1) {
        return;
      }
      if (req.method !== "OPTIONS") {
        console.log("[OID:0] [" + req.method + "]:" + req.url + "(" + req.get("User-Agent") + ")");
      }
    }
  }

  function enforceACLHeaders(res, req) {

    // cannot use this with allow origin * res.header("Access-Control-Allow-Credentials", "true");
    // analysis: will PROBABLY have to be refactored to anything but Device-Registration and Devoce-OTA requests
    if ((req.originalUrl.indexOf("register") !== -1) ||
      (req.originalUrl.indexOf("firmware") !== -1)) {
      return;
      // no ACL/CORS for device requests
    } else {
      res.header("Access-Control-Allow-Credentials", "true"); // should be allowed for device as well
    }

    // deepcode ignore TooPermissiveCorsHeader: this must be callable from anywhere
    res.header("Access-Control-Allow-Origin", "*"); // lgtm [js/cors-misconfiguration-for-credentials]
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-type,Accept,X-Access-Token,X-Key");
  }

  // Functions

  app.all("/*", function (req, res, next) {

    // JWT Auth (if there is such header, resst of auth checks is not important)
    if ((typeof (req.headers['authorization']) !== "undefined") || (typeof (req.headers['Authorization']) !== "undefined")) {
      login.verify(req, (error, payload) => {
        // for JWT debugging: console.log("[debug] JWT Secret verification result:", { error }, { payload });
        if (error == null) {
          req.session.owner = payload.username;
          next();
        } else {
          res.status(403).end(); // FIXME: Change to 401 Unauthorized in tests as well!
        }
      });
      return;
    }

    // Cookie or other auth
    var client = req.get("User-Agent");

    if (typeof (req.headers.origin) !== "undefined") {
      if (req.headers.origin === "device") {
        next();
        return;
      }
    }

    if (process.env.ENVIRONMENT !== "test") {
      if ((typeof (app_config.debug.ingress) !== "undefined") && (app_config.debug.ingress !== false)) {
        console.log("[audit] Ingress from IP: ", getClientIp(req));
      }
    }

    if (!checkDirtyRequests(req, res, next)) {
      console.log("ℹ️ [info] Exit after checkDirtyRequests in router:508; not running next.");
      res.status(403).end();
      return;
    }

    // Problem is, that the device API should be separate and have different Access-Control (which is solved by customizing those two endpoints)
    // var webHostname = process.env.WEB_HOSTNAME || "rtm.thinx.cloud";

    enforceACLHeaders(res, req); // this should not be done for device requests (with specific client)

    if (req.method == "OPTIONS") {
      res.status(200).end();
      return;
    }

    try {
      logAccess(req);
    } catch (e) {
      //
    }

    if (client == client_user_agent) {
      if (typeof (req.headers.origin) !== "undefined") {
        if (req.headers.origin == "device") {
          console.log("allowed for device");
          next();
          return;
        } else {
          console.log("not allowed for non-device");
          res.status(401);
          Util.respond(res, {
            success: false,
            message: "Authentication Faled"
          });
          return;
        }
      }
    }

    // Not a device client_user_agent...

    // Applies only to post requests!
    if (req.method == "POST") {
      if (typeof (req.body) !== "undefined") {
        let owner = req.body.owner; // not session!
        if (typeof (owner) !== "undefined") {
          let xowner = req.body.owner; // owner can be undefined here?
          let api_key = req.body.api_key;
          if ((typeof (xowner) !== "undefined") && (xowner !== null) && (typeof (api_key) !== "undefined") && (api_key !== null)) {
            // Using Owner/API Key
            apikey.verify(sanitka.owner(xowner), sanitka.udid(api_key), true, (vsuccess, vmessage) => {
              if (vsuccess) {
                next();
              } else {
                res.status(401);
                Util.respond(res, {
                  success: false,
                  message: "Authentication Faled"
                });
                console.log("APIKey ", vmessage);
              }
            });
            return;
          }
        }
      }
    }

    next();

  });

  /*
   * Health check route
   */

  app.get("/", function (req, res) {
    Util.respond(res, { healthcheck: true });
  });

};
