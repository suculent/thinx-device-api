/* New Router */

module.exports = function (app) {

  const Globals = require("./thinx/globals");
  const app_config = Globals.app_config(); // for a device client_user_agent check

  const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
  const Util = require("./thinx/util");
  const { bindBearerOwner } = require("./thinx/bearer_owner");
  const AuditLog = require("./thinx/audit"); var alog = new AuditLog();

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

  // SEC-CORS-01: origin-allowlisted CORS headers (see lib/middleware/cors.js).
  const cors = require("./middleware/cors")(app);

  function buildContentSecurityPolicy(public_url) {
    let sources = ["'self'"];
    if (typeof (public_url) === "string") {
      const normalized = public_url.trim().replace(/\/+$/, "");
      if ((normalized.length > 0) && (normalized.indexOf("<") === -1)) {
        sources.push(normalized);
      }
    }
    const sourceList = sources.join(" ");
    const formActionSources = Array.from(new Set(sources.concat(["https://github.com"])));

    return [
      "default-src " + sourceList,
      "frame-ancestors 'self'",
      "form-action " + formActionSources.join(" ")
    ].join("; ") + ";";
  }

  // Functions

  const JWTLogin = require("./thinx/jwtlogin");
  app.login = new JWTLogin(app.redis_client);
  app.login.init(() => {
      console.log("ℹ️ [info] JWT Login Secret Init Complete. Login is now possible.");
  });

  const CSP_POLICY = buildContentSecurityPolicy(app_config.public_url);

  app.use(function (req, res, next) {

    // Default content-type, may be overridden later by Util.responder and others
    res.header("Content-Type", "text/html; charset=utf-8");
    res.header("Content-Security-Policy", CSP_POLICY);


    if (req.header.host && (req.header.host !== app_config.public_url)) {
      console.warn("⚠️ [warning] host header mismatch, possible hacking attempt: ", req.header.host, " != ", app_config.public_url);
    }
    

    //
    // JWT Key Authentication
    //

    // JWT Auth (if there is such header, resst of auth checks is not important)
    // G8 guard: literal "Bearer null" / "Bearer undefined" / empty token from logged-out browser clients must NOT trigger JWT-403; treat as no-token.
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (typeof authHeader !== "undefined") {
      const m = /^bearer\s+(.+)$/i.exec(authHeader);
      const token = m && m[1] && m[1].trim();
      if (!token || token === "null" || token === "undefined") {
        // No usable bearer token — strip both casings and fall through to cookie/no-auth path.
        delete req.headers['authorization'];
        delete req.headers['Authorization'];
        // intentionally NO return; fall through to existing cookie/no-auth path below.
      } else {
        // Bearer bridge: the token's owner (and impersonator) act for this request only.
        // bindBearerOwner restores the session's own values before express-session saves
        // it, so a planted session cookie never gains an owner (25-REVIEW CR-02). It never
        // rotates the session id (login-only, lib/thinx/establish_session.js; SEC-CSRF-03).
        app.login.verify(req, (error, payload) => {
          // for JWT debugging: console.log("🔨 [debug] JWT Secret verification result:", { error }, { payload });
          if (error == null) {
            bindBearerOwner(req, res, payload.username, payload.impersonator_owner);
            // Per-request impersonation audit log (Phase 10 ADMIN-03, OQ-6).
            if (payload.impersonator_owner) {
              alog.log(
                payload.impersonator_owner,
                "IMPERSONATED " + req.method + " " + req.path + " as " + payload.username,
                ["admin", "impersonation"]
              );
            }
            // Session blacklist check (Phase 10 ADMIN-02). Fails OPEN on Redis errors (R1).
            app.redis_client.get("revoked:owner:" + payload.username, (rerr, ts) => {
              if (rerr) {
                console.warn("⚠️ [warning] blacklist check failed", rerr);
                // D-09: verified Bearer (revocation check failed open) — request-local, never in the session.
                req.thx_auth = "bearer";
                return next();
              }
              if (ts) {
                const iatMs = (payload.iat || 0) * 1000;
                if (iatMs < parseInt(ts, 10)) {
                  return res.status(401).end();
                }
              }
              // D-09: verified, unrevoked Bearer — exempt from the CSRF token check (csrf.js).
              req.thx_auth = "bearer";
              next();
            });
          } else {
            res.status(403).end(); // FIXME (tracked: .planning/todos/pending/2026-10-01-bearer-verify-failure-status-401.md): Change to 401 Unauthorized in tests as well!
          }
        });
        return;
      }
    }

    // Cookie or other auth
    var client = req.get("User-Agent");

    // Device API calls (firmware library sends "Origin: device") carry no
    // CORS/CSRF machinery by design — skip the browser-only header logic.
    if (typeof (req.headers.origin) !== "undefined") {
      if (req.headers.origin === "device") {
        next();
        return;
      }
    }

    cors.enforceACLHeaders(res, req);

    if (req.method == "OPTIONS") {
      return res.status(200).end();
    }

    try {
      logAccess(req);
    } catch (_e) {
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
    // API-key body authentication: the body's `owner` field, or else its `owner_id`
    // field, names the claimed owner, and `api_key` is verified against that owner's
    // stored keys. On success the verified owner is recorded request-locally in
    // req.thx_apikey_owner (never in the session); Util.validateSession and
    // Util.ownerFromRequest trust only that record, never the body (261003-skk).
    if (req.method == "POST") {
      if ((typeof (req.body) !== "undefined") && (req.body !== null)) {
        let claimed_owner = req.body.owner; // not session!
        if ((typeof (claimed_owner) === "undefined") || (claimed_owner === null)) claimed_owner = req.body.owner_id;
        let api_key = req.body.api_key;
        if ((typeof (claimed_owner) !== "undefined") && (claimed_owner !== null) && (typeof (api_key) !== "undefined") && (api_key !== null)) {
          // Sanitka calls .replace on its input, so anything but a string is refused up front.
          if ((typeof (claimed_owner) !== "string") || (typeof (api_key) !== "string")) {
            res.status(401);
            return Util.responder(res, false, "Authentication Faled");
          }
          const verified_owner = sanitka.owner(claimed_owner);
          if (verified_owner === null) {
            res.status(401);
            return Util.responder(res, false, "Authentication Faled");
          }
          // Using Owner/API Key
          // Keys are matched exactly (CR-01), so normalize to the full 64+ char key or hash; the old 36-char UUID sanitizer only ever matched a slice.
          apikey.verify(verified_owner, sanitka.apiKey(api_key), true, (vsuccess, vmessage) => {
            if (vsuccess) {
              // D-09: verified API key — exempt from the CSRF token check (csrf.js).
              req.thx_auth = "apikey";
              req.thx_apikey_owner = verified_owner;
              next();
            } else {
              res.status(401);
              Util.responder(res, false, "Authentication Faled");
              console.warn("⚠️ [warning] APIKey authentication failed:", vmessage);
            }
          });
          return;
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

  /*
   * OpenAPI specification
   */

  const path = require("path");
  const fs = require("fs");

  app.get("/api/v2/spec", function (req, res) {
    const specPath = path.join(__dirname, "../thinx-api-openapi.yaml");
    res.header("Content-Type", "application/yaml");
    fs.createReadStream(specPath).pipe(res);
  });

};
