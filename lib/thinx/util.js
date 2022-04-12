// Shared Router Methods

const Sanitka = require("./sanitka"); var sanitka = new Sanitka();
const typeOf = require("typeof");
module.exports = class Util {

  ///////////////////////////////////////////////////////////////////////
  //
  // DEVICE ROUTES
  //

  static ownerFromRequest(req) {
    let owner = req.session.owner;
    if ((typeof (owner) === "undefined") || (owner === null)) {
      owner = req.body.owner;
    }
    return sanitka.owner(owner);
  }

  static responder(res, success, message) {
    if (typeOf(message) == "buffer") {
      if (typeof (res.header) === "function") res.header("Content-Type", "application/octet-stream");
      res.end(message);
    } else if (typeOf(message) == "string") {
      if (typeof (res.header) === "function") res.header("Content-Type", "text/plain; charset=utf-8");
      res.end(JSON.stringify({
        success: success,
        status: message
      }));
    } else {
      if (typeof (res.header) === "function") res.header("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        success: success,
        status: message
      }));
    }
  }

  static validateSession(req) {

    // OK if request has JWT authorization (was already checked in app.all("/*"))
    if ((typeof (req.headers['authorization']) !== "undefined") || (typeof (req.headers['Authorization']) !== "undefined")) {
      return true;
    }

    // OK if request session has internally set owner
    if (typeof (req.session) !== "undefined") {
      if (typeof (req.session.owner) !== "undefined") {
        return true;
      }
    }

    // OK if request has owner_id and api_key that has been previously validated
    if (typeof (req.body) !== "undefined") {
      if ((typeof (req.body.owner_id) !== "undefined") && (typeof (req.body.api_key) !== "undefined")) {
        return true;
      }
    }

    req.session.destroy(function (err) {
      if (err) {
        console.log("☣️ [error] Session destroy error: " + JSON.stringify(err));
      }
    });

    // No session, no API-Key auth, rejecting...
    return false;
  }

  failureResponse(res, code, reason) {
    res.status(code);
    Util.responder(res, false, reason);
  }
  
};