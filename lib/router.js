/* New Router */

module.exports = function (app) {

  const Globals = require("./thinx/globals");
  const app_config = Globals.app_config(); // for a device client_user_agent check

  const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
  const Util = require("./thinx/util");

  const APIKey = require("../lib/thinx/apikey");
  let apikey = new APIKey(app.redis_client);

  //
  // Middleware-like Validation
  //

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

  const JWTLogin = require("./thinx/jwtlogin");
  app.login = new JWTLogin(app.redis_client);
  app.login.init(() => {
      console.log("ℹ️ [info] JWT Login Secret Init Complete. Login is now possible.");
  });

  app.use(function (req, res, next) {

    // Default content-type, may be overridden later by Util.responder and others
    res.header("Content-Type", "text/html; charset=utf-8");


    if (req.header.host && (req.header.host !== app_config.public_url)) {
      console.log("[warning] host header mismatch, possible hacking attempt: ", req.header.host, " != ", app_config.public_url);
    }
    

    //
    // JWT Key Authentication
    //

    // JWT Auth (if there is such header, resst of auth checks is not important)
    if ((typeof (req.headers['authorization']) !== "undefined") || (typeof (req.headers['Authorization']) !== "undefined")) {
      app.login.verify(req, (error, payload) => {
        // for JWT debugging: console.log("🔨 [debug] JWT Secret verification result:", { error }, { payload });
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

    enforceACLHeaders(res, req); // this should not be done for device requests (with specific client)

    if (req.method == "OPTIONS") {
      return res.status(200).end();
    }

    try {
      logAccess(req);
    } catch (e) {
      //
    }

    const client_user_agent = app_config.client_user_agent;

    if (client == client_user_agent) {
      if (typeof (req.headers.origin) !== "undefined") {
        if (req.headers.origin == "device") {
          console.log("allowed for device");
          next();
          return;
        } else {
          console.log("not allowed for non-device");
          res.status(401);
          return Util.responder(res, false, "Authentication Faled");
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
                Util.responder(res, false, "Authentication Faled");
                console.log("APIKey ", vmessage);
              }
            });
            return;
          }
        }
      }
    }

    // otherwise this request has no authentication and will be passed.

    next();

  });

  /*
   * Health check route
   */

  app.get("/", function (req, res) {
    Util.respond(res, { healthcheck: true });
  });

};
