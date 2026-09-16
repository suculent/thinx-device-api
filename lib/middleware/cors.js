// SEC-CORS-01 — Origin-allowlisted CORS response headers.
//
// Replaces the former enforceACLHeaders() closure in lib/router.js, which
// reflected ANY browser-supplied Origin into Access-Control-Allow-Origin
// alongside Access-Control-Allow-Credentials: true (OX "CORS Reflect Origin").
//
// Rules:
//  - /device/* routes (register, firmware): no CORS headers at all.
//  - Origin: device (firmware library): no CORS headers — device API calls
//    carry no CORS/CSRF machinery by design. The global middleware already
//    short-circuits these before we run; this is defense in depth.
//  - No Origin header: non-browser caller (curl, monitoring). CORS headers
//    are meaningless there, so emit none. Never emit '*'.
//  - Origin in the shared allowlist (lib/thinx/origins.js): echo it, add
//    Vary: Origin plus credentials/methods/headers.
//  - Origin NOT in the allowlist: log a warning. When enforced, emit nothing
//    and let the browser block the response; when fail-open (default),
//    reflect as before so a missed hostname is visible in logs, not an outage.

const origins = require("../thinx/origins");

const ALLOWED_METHODS = "GET,PUT,POST,DELETE,OPTIONS";
// SEC-CSRF-01: X-XSRF-TOKEN carries the double-submit anti-CSRF header for the
// cross-origin Vue console (console.thinx.cloud -> app.thinx.cloud).
const ALLOWED_HEADERS = "Content-type,Accept,X-Access-Token,X-Key,X-XSRF-TOKEN";

module.exports = function (_app) {

  function isDeviceRoute(req) {
    const p = (typeof req.path === "string") ? req.path : (req.originalUrl || "");
    return p.indexOf("/device/") === 0;
  }

  function enforceACLHeaders(res, req) {
    if (isDeviceRoute(req)) return;

    const origin = origins.normalize(req.headers.origin);
    if (origin === null) return; // non-browser caller
    if (origin === "device") return; // firmware library

    if (!origins.isAllowed(origin)) {
      console.warn("⚠️ [warning] CORS origin not allowlisted:", origin, req.method, req.originalUrl,
        origins.isEnforced() ? "(rejected)" : "(fail-open, reflected)");
      if (origins.isEnforced()) return;
    }

    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.header("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  }

  return { enforceACLHeaders };
};
