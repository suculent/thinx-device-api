// Shared Router Methods

const Sanitka = require("./sanitka"); var sanitka = new Sanitka();
const typeOf = require("typeof");
const momentTz = require("moment-timezone");
const crypto = require("crypto");
module.exports = class Util {

  ///////////////////////////////////////////////////////////////////////
  //
  // DEVICE ROUTES
  //

  // The acting owner of an authenticated request: the session owner (a cookie
  // session, or a Bearer token bound by lib/router.js), else the owner whose API
  // key lib/router.js verified for this request. Never a request-supplied owner
  // field (261003-skk).
  static ownerFromRequest(req) {
    let owner = ((typeof (req.session) !== "undefined") && (req.session !== null)) ? req.session.owner : undefined;
    if (!Util.isDefined(owner) && (req.thx_auth === "apikey")) owner = req.thx_apikey_owner;
    if (typeof (owner) !== "string") return null;
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

  /**
   * True when the request carries an identity that lib/router.js has verified.
   *
   * lib/router.js verifies Bearer tokens (unusable ones are stripped, failed or
   * revoked ones end the request) and verifies API-key bodies against the owner
   * they name, then marks the request with the request-local req.thx_auth (and,
   * for an API key, req.thx_apikey_owner). This function trusts only those
   * markers and the session owner, never a raw header or request-body fields, so
   * it does not depend on router mount order (261003-skk).
   */
  static validateSession(req) {

    if (req.thx_auth === "bearer") return true;

    const sess = req.session;
    const hasSession = (typeof (sess) !== "undefined") && (sess !== null);

    if (hasSession && Util.isDefined(sess.owner)) return true;

    if ((req.thx_auth === "apikey") && Util.isDefined(req.thx_apikey_owner)) return true;

    if (hasSession && (typeof (sess.destroy) === "function")) sess.destroy();

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

  // Timezones: an IANA zone name (e.g. "Europe/Prague") is the only thing
  // moment-timezone can resolve. Abbreviations like "CEST" are NOT zone names —
  // .tz() silently falls back to the server's local zone for them, which is the
  // bug these helpers exist to prevent.
  static isValidTimezone(zone) {
    if (typeof zone !== "string") return false;
    return momentTz.tz.zone(zone) !== null;
  }

  // Current UTC offset for `zone` in signed hours east of UTC, already
  // including any DST shift. Returns null for an invalid zone so callers can
  // tell "unknown zone" apart from a genuine zero offset.
  static timezoneOffsetFor(zone) {
    if (!Util.isValidTimezone(zone)) return null;
    return momentTz().tz(zone).utcOffset() / 60;
  }

  // Whole-value constant-time equality for credentials (API keys, hashes, password hashes).
  static safeEqual(a, b) {
    if ((typeof a !== "string") || (typeof b !== "string")) return false;
    if ((a.length === 0) || (b.length === 0)) return false;
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    // Byte lengths, not string lengths: timingSafeEqual throws on unequal buffers.
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
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

  static redactHeaderValue(value, prefix) {
    if (typeof value === "undefined") return "<undefined>";
    if (value === null) return "<null>";

    let s = String(value).trim();
    if (s === "") return "<empty>";

    let bearer = s.match(/^Bearer\s+(.+)$/i);
    if (bearer) return "Bearer " + Util.redactToken(bearer[1], prefix);

    return Util.redactToken(s, prefix);
  }

  static redactCookieHeader(header) {
    if (typeof header === "undefined") return "<undefined>";
    if (header === null) return "<null>";

    let s = String(header).trim();
    if (s === "") return "<empty>";

    return s.split(";").map((cookie) => {
      let trimmed = cookie.trim();
      if (trimmed === "") return "<empty>";

      let eq = trimmed.indexOf("=");
      if (eq === -1) {
        return trimmed.replace(/[^A-Za-z0-9_.:-]/g, "_") + "=<malformed>";
      }

      let name = trimmed.substring(0, eq).trim();
      if (name === "") return "<malformed>=<redacted>";

      return name + "=<redacted>";
    }).join("; ");
  }

};
