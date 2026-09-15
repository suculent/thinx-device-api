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

const XSRF_COOKIE_NAME = "XSRF-TOKEN";
const XSRF_HEADER_NAME = "x-xsrf-token"; // Express lower-cases header names

module.exports = function (_app) {

    const app_config = Globals.app_config();

    function shortDomain() {
        let full_domain = app_config.api_url;
        let full_domain_array = full_domain.split(".");
        delete full_domain_array[0];
        return full_domain_array.join('.');
    }

    function isEnforced() {
        if (process.env.CSRF_ENFORCE === 'true') return true;
        if ((typeof (app_config.debug) !== "undefined") && (app_config.debug.csrf_enforce === true)) return true;
        return false; // fail-open default
    }

    // Mounted globally (app.use) before all routers — refreshes/mints the
    // XSRF-TOKEN cookie on every request so any API round-trip keeps a
    // cold session primed. Always calls next().
    function ensureXsrfCookie(req, res, next) {
        const existing = (req.cookies) ? req.cookies[XSRF_COOKIE_NAME] : undefined;
        if ((typeof (existing) === "undefined") || (existing === null) || (existing === "")) {
            const token = crypto.randomBytes(24).toString('hex');
            res.cookie(XSRF_COOKIE_NAME, token, {
                httpOnly: false, // must be JS-readable by console for double-submit
                secure: false, // not secure because HTTPS unwrapping happens outside this app
                sameSite: 'lax',
                domain: shortDomain(),
                path: '/'
            });
            res.locals.xsrfToken = token;
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

    // Route middleware for the 7 protected cookie-session POST routes.
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

        if (!isEnforced()) {
            console.log("⚠️ [warning] CSRF token missing/mismatched for " + req.method + " " + req.originalUrl + " (fail-open, not enforced)");
            return next();
        }

        return Util.failureResponse(res, 403, "csrf_token_invalid");
    }

    return {
        ensureXsrfCookie,
        verifyCsrfToken,
        issueCsrfToken
    };
};
