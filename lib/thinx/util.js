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
    if ((typeof (owner) === "undefined") || (owner === null)) owner = req.body.owner;
    return sanitka.owner(owner);
  }

  static responder(res, success, message) {

    // send buffers (files) as octet-stream
    if (typeOf(message) == "buffer") {
      if (typeof (res.header) === "function") res.header("Content-Type", "application/octet-stream");
      return res.end(message);
    }
    
    // send strings as json messages
    if (typeOf(message) == "string") {
      if (typeof (res.header) === "function") res.header("Content-Type", "application/json; charset=utf-8");
      let response;
      try {
          response = JSON.stringify({
          success: success,
          response: message
        });
      } catch (_e) {
        return JSON.stringify({ success: false, response: "serialization_failed" });
      }
      return res.end(response);
    }

    // message is an object, circular structures will fail...
    if (typeof (res.header) === "function") res.header("Content-Type", "application/json; charset=utf-8");
    let response;
    try {
        response = JSON.stringify({
        success: success,
        response: message
      });
    } catch (_e) {
      console.log("[CRITICAL] issue while serializing message:", message);
      return JSON.stringify({ success: false, response: "request_failed" });
    }
    return res.end(response);
  }

  static validateSession(req) {

    // OK if request has JWT authorization (was already checked in app.all("/*"))
    if ((typeof (req.headers.authorization) !== "undefined") || (typeof (req.headers.Authorization) !== "undefined")) {
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

    req.session.destroy();

    // No session, no API-Key auth, rejecting...
    return false;
  }

  static failureResponse(res, code, reason) {
    res.status(code);
    Util.responder(res, false, reason);
  }

  static respond(res, object) {
    if (typeOf(object) == "buffer") {
      res.header("Content-Type", "application/octet-stream");
      res.end(object);
    } else if (typeOf(object) == "string") {
      res.end(object);
    } else {
      if (typeof (res.header) === "function") res.header("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(object));
    }
  }

  static isDefined(object) {
    return ((typeof (object) === "undefined") || (object === null)) ? false : true;
  }

  static isUndefinedOf(array) {
    let result = false;
    for (let object of array) {
      result = result || ((typeof (object) === "undefined") || (object === null)) ? true : false;
      // TODO: Requires unit-testing
      //if (result) {
      //  console.log("🔨 [debug] isUndefinedOf", JSON.stringify(array, null, 2));
      //}
    }
    return result;
  }

  // SEC-PII-01 — PII / secret log redactors.
  // Deterministic so ops can correlate consecutive log lines for the same session
  // via the same 6-char prefix. Defensive against null/undefined/empty inputs so
  // no log call site can throw a NPE from a redactor.
  static redactEmail(email) {
    if (typeof email === "undefined") return "<undefined>";
    if (email === null) return "<null>";
    if (email === "") return "<empty>";
    let parts = String(email).split("@");
    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) return "<malformed>";
    return parts[0].charAt(0) + "***@" + parts[1];
  }

  // Truncation marker is Unicode U+2026 ellipsis (literal in source per file convention).
  static redactToken(t, prefix) {
    if (typeof t === "undefined") return "<undefined>";
    if (t === null) return "<null>";
    if (t === "") return "<empty>";
    let n = (typeof prefix === "number" && prefix > 0) ? prefix : 6;
    let s = String(t);
    return s.substring(0, n) + "…";
  }

};