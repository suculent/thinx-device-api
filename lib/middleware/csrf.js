// SEC-CSRF-01 — Double-submit anti-CSRF token middleware.
//
// Server sets a non-httpOnly `XSRF-TOKEN` cookie (readable by console JS) and
// expects a matching `X-XSRF-TOKEN` header on the protected cookie-session
// login/account POST routes. Stateless (no Redis session storage needed) —
// the cookie IS the shared secret, compared constant-time against the header.
//
// Rollout is fail-open by default (`debug.csrf_enforce: false` / no
// `CSRF_ENFORCE` env override): a missing/mismatched token is logged as a
// warning but the request is still allowed through, so a console wiring
// mismatch cannot lock out login mid-rollout. Flipping either the config
// flag or the `CSRF_ENFORCE=true` env var switches to hard 403 rejection
// without a code change.

const crypto = require("crypto");
const Globals = require("../thinx/globals");
const Util = require("../thinx/util");
const CookiePolicy = require("./cookie-policy");

const XSRF_COOKIE_NAME = "XSRF-TOKEN";
const XSRF_HEADER_NAME = "x-xsrf-token"; // Express lower-cases header names

module.exports = function (_app) {

    const app_config = Globals.app_config();

    // Resolved once per factory call, never per request, and never throws
    // (undefined => host-only cookie). See cookie-policy.js cookieDomain().
    const cookie_domain = CookiePolicy.cookieDomain(app_config.api_url);

    function isEnforced() {
        if (process.env.CSRF_ENFORCE === 'true') return true;
        if ((typeof (app_config.debug) !== "undefined") && (app_config.debug.csrf_enforce === true)) return true;
        return false; // fail-open default
    }

    // Traffic that can never use the token (21-REVIEW WR-03): CORS preflights
    // (sent without cookies by spec), the firmware library ("Origin: device"),
    // the device API under /device/* and the git webhooks. None of these is a
    // console route, so the consoles keep priming exactly as before.
    function isNonBrowserRequest(req) {
        if (req.method === "OPTIONS") return true;
        if (req.headers && (req.headers.origin === "device")) return true;
        const path = String(req.path || "").toLowerCase(); // Express routes are case-insensitive
        return path.startsWith("/device/") || /^\/(api\/)?githook\/?$/.test(path);
    }

    // Mounted globally (app.use) before all routers. Mints the XSRF-TOKEN
    // cookie only when it is absent (never rotates an existing one) and only
    // for requests a browser could use it on. Always calls next().
    function ensureXsrfCookie(req, res, next) {
        if (isNonBrowserRequest(req)) return next();
        const existing = (req.cookies) ? req.cookies[XSRF_COOKIE_NAME] : undefined;
        if ((typeof (existing) === "undefined") || (existing === null) || (existing === "")) {
            const token = crypto.randomBytes(24).toString('hex');
            try {
                res.cookie(XSRF_COOKIE_NAME, token, {
                    httpOnly: false, // must be JS-readable by console for double-submit
                    secure: req.secure === true, // Secure behind Traefik (X-Forwarded-Proto, honoured via `trust proxy`); plain over localhost HTTP
                    sameSite: 'lax',
                    domain: cookie_domain,
                    path: '/'
                });
                res.locals.xsrfToken = token;
            } catch (e) {
                // Global middleware: a cookie problem must never 500 the request.
                console.log("⚠️ [warning] XSRF-TOKEN cookie not set: " + e.message);
            }
        }
        next();
    }

    // GET priming endpoint handler. Does NOT re-run ensureXsrfCookie (already
    // mounted globally and already ran for this request) and does NOT mint a
    // second token / emit a second Set-Cookie — it just echoes whatever the
    // global middleware left behind on this request/response pair.
    function issueCsrfToken(req, res) {
        const token = (req.cookies && req.cookies[XSRF_COOKIE_NAME]) || res.locals.xsrfToken;
        Util.respond(res, { csrf_token: token });
    }

    // Why a double-submit check failed, as a fixed reason code. Never includes
    // the token values themselves.
    function failureReason(cookieVal, headerVal) {
        if ((typeof (cookieVal) !== "string") || (cookieVal.length === 0)) return "no_cookie";
        if ((typeof (headerVal) !== "string") || (headerVal.length === 0)) return "no_header";
        if (cookieVal.length !== headerVal.length) return "length_mismatch";
        return "value_mismatch";
    }

    // How many XSRF-TOKEN pairs the raw Cookie header carries. cookie-parser
    // silently keeps the first, so >1 (a Domain/Path variant) is the classic
    // cause of a permanent per-browser mismatch.
    function xsrfCookieCount(req) {
        const raw = (req.headers && (typeof (req.headers.cookie) === "string")) ? req.headers.cookie : "";
        const matches = raw.match(/(?:^|;)\s*XSRF-TOKEN=/g);
        return matches ? matches.length : 0;
    }

    // Route only: the query string is dropped so nothing sensitive is logged.
    function routeOf(req) {
        return String(req.originalUrl || req.url || "").split("?")[0];
    }

    // Route middleware for the protected cookie-session POST routes.
    function verifyCsrfToken(req, res, next) {

        const cookieVal = (req.cookies) ? req.cookies[XSRF_COOKIE_NAME] : undefined;
        const headerVal = req.headers[XSRF_HEADER_NAME];

        let valid = false;

        if ((typeof (cookieVal) === "string") && (cookieVal.length > 0) &&
            (typeof (headerVal) === "string") && (headerVal.length > 0) &&
            (cookieVal.length === headerVal.length)) {
            try {
                valid = crypto.timingSafeEqual(Buffer.from(cookieVal), Buffer.from(headerVal));
            } catch (_e) {
                valid = false;
            }
        }

        if (valid) return next();

        const cookies = xsrfCookieCount(req);
        const detail = "reason=" + failureReason(cookieVal, headerVal) +
            " xsrf_cookies=" + cookies + ((cookies > 1) ? " duplicate_cookie=true" : "") +
            " for " + req.method + " " + routeOf(req);

        if (!isEnforced()) {
            console.log("⚠️ [warning] CSRF token missing/mismatched " + detail + " (fail-open, not enforced)");
            return next();
        }

        console.log("⚠️ [warning] CSRF token rejected " + detail + " (enforced, 403)");
        return Util.failureResponse(res, 403, "csrf_token_invalid");
    }

    return {
        ensureXsrfCookie,
        verifyCsrfToken,
        issueCsrfToken
    };
};
