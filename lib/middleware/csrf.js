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
const fs = require("fs");
const path = require("path");
const Globals = require("../thinx/globals");
const Util = require("../thinx/util");
const CookiePolicy = require("./cookie-policy");
const { readSecret } = require("../thinx/secrets");

const XSRF_COOKIE_NAME = "XSRF-TOKEN";
const XSRF_HEADER_NAME = "x-xsrf-token"; // Express lower-cases header names
const SESSION_COOKIE_NAME = "x-thx-core";
const PRE_SESSION_TTL_MS = 15 * 60 * 1000; // D-01: idle lifetime of a pre-login session
const MODES = ["legacy", "observe", "signed"];

// `{64 hex HMAC}.{32 hex nonce}` (SEC-CSRF-02). Anything else is "stale".
const SIGNED_SHAPE = /^[0-9a-f]{64}\.[0-9a-f]{32}$/;

// ---------------------------------------------------------------------------
// Module scope (D-04): this file is built as a factory three times, so the key
// lives here, once per process, never per factory instance and never random.
// ---------------------------------------------------------------------------

let keyMemo;          // undefined = not resolved yet; Buffer or null afterwards
let keySourceMemo;    // "secret" | "hkdf" | "none"

// Read on every call so specs can toggle it; production changes it only via
// `docker service update`, which restarts the task. Unset/unknown => legacy.
function mode() {
    const raw = (typeof (process.env.CSRF_MODE) === "string") ? process.env.CSRF_MODE.trim().toLowerCase() : "";
    if (MODES.indexOf(raw) !== -1) return raw;
    return "legacy";
}

// Same CONFIG_ROOT rule as thinx-core.js (spec config in development).
function sessionConfigPath() {
    const root = (process.env.ENVIRONMENT == "development")
        ? path.join(__dirname, "..", "..", "spec", "mnt", "data", "conf")
        : "/mnt/data/conf";
    return path.join(root, "node-session.json");
}

function loadSessionSecret() {
    try {
        const parsed = JSON.parse(fs.readFileSync(sessionConfigPath(), "utf8"));
        if (parsed && (typeof (parsed.secret) === "string") && (parsed.secret.length > 0)) return parsed.secret;
    } catch (_e) {
        // missing or unreadable node-session.json: no HKDF fallback
    }
    return null;
}

// CSRF_SECRET (Docker secret, then env) first, else HKDF-SHA256 of the session
// secret with its own salt/info (domain separation from cookie signing), else none.
function resolveKey() {
    if (typeof (keyMemo) !== "undefined") return keyMemo;
    const secret = readSecret("CSRF_SECRET");
    if (secret) {
        keyMemo = Buffer.from(String(secret), "utf8");
        keySourceMemo = "secret";
        return keyMemo;
    }
    const sessionSecret = loadSessionSecret();
    if (sessionSecret) {
        keyMemo = Buffer.from(crypto.hkdfSync("sha256", sessionSecret, "thinx-csrf", "csrf-v1", 32));
        keySourceMemo = "hkdf";
        return keyMemo;
    }
    keyMemo = null;
    keySourceMemo = "none";
    return keyMemo;
}

function keySource() {
    resolveKey();
    return keySourceMemo;
}

// Length-prefixed MAC input, so ("ab","c") and ("a","bc") never collide.
function mac(sid, nonce) {
    const key = resolveKey();
    if (!key) throw new Error("csrf_key_unavailable");
    const msg = sid.length + "!" + sid + "!" + nonce.length + "!" + nonce;
    return crypto.createHmac("sha256", key).update(msg).digest("hex");
}

function mint(sid) {
    const nonce = crypto.randomBytes(16).toString("hex");
    return mac(String(sid), nonce) + "." + nonce;
}

// null when `token` is a valid signed token for `sid`, else a reason code.
function check(token, sid) {
    if ((typeof (token) !== "string") || !SIGNED_SHAPE.test(token)) return "stale";
    if ((typeof (sid) !== "string") || (sid.length === 0)) return "binding_mismatch";
    const dot = token.indexOf(".");
    const got = Buffer.from(token.slice(0, dot), "utf8");
    const want = Buffer.from(mac(sid, token.slice(dot + 1)), "utf8");
    if (got.length !== want.length) return "binding_mismatch";
    return crypto.timingSafeEqual(got, want) ? null : "binding_mismatch";
}

// A session that exists in the store (pre-session or logged in). The global
// middleware never creates one; only the priming GET and a login do (D-02).
function hasPersistedSession(req) {
    const s = req ? req.session : undefined;
    if ((typeof (s) === "undefined") || (s === null)) return false;
    return !!(s.csrf_pre || s.login_owner || s.owner);
}

function hasSessionCookie(req) {
    const raw = (req && req.headers && (typeof (req.headers.cookie) === "string")) ? req.headers.cookie : "";
    return new RegExp("(?:^|;)\\s*" + SESSION_COOKIE_NAME + "=").test(raw);
}

// Why `token` does not bind to this request's session, as a fixed reason code
// (null when it does). Never includes the token or the session id.
function bindingReason(req, token) {
    if (!hasSessionCookie(req)) return "missing";
    if (!hasPersistedSession(req)) return "session_mismatch";
    return check(token, req.sessionID);
}

function _resetForTests() {
    keyMemo = undefined;
    keySourceMemo = undefined;
}

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

    function xsrfCookieOptions(req) {
        return {
            httpOnly: false, // must be JS-readable by console for double-submit
            secure: req.secure === true, // Secure behind Traefik (X-Forwarded-Proto, honoured via `trust proxy`); plain over localhost HTTP
            sameSite: 'lax',
            domain: cookie_domain,
            path: '/'
        };
    }

    // Mint a token bound to this request's session id and queue it as the
    // response's XSRF-TOKEN. Returns the token.
    function setBound(req, res) {
        const token = mint(req.sessionID);
        res.cookie(XSRF_COOKIE_NAME, token, xsrfCookieOptions(req));
        res.locals.xsrfToken = token;
        return token;
    }

    // Mounted globally (app.use) before all routers. Always calls next().
    // legacy: mints the XSRF-TOKEN cookie only when it is absent (never rotates
    // an existing one) and only for requests a browser could use it on.
    // observe/signed: never mints for a request without a persisted session and
    // never touches req.session (D-02: only the priming GET creates one).
    function ensureXsrfCookie(req, res, next) {
        if (isNonBrowserRequest(req)) return next();
        if (mode() !== "legacy") {
            // Tokens are minted by issueCsrfToken and rotate() only; the
            // persisted-session re-mint is added by plan 25-03.
            return next();
        }
        const existing = (req.cookies) ? req.cookies[XSRF_COOKIE_NAME] : undefined;
        if ((typeof (existing) === "undefined") || (existing === null) || (existing === "")) {
            const token = crypto.randomBytes(24).toString('hex');
            try {
                res.cookie(XSRF_COOKIE_NAME, token, xsrfCookieOptions(req));
                res.locals.xsrfToken = token;
            } catch (e) {
                // Global middleware: a cookie problem must never 500 the request.
                console.log("⚠️ [warning] XSRF-TOKEN cookie not set: " + e.message);
            }
        }
        next();
    }

    // GET priming endpoint handler. The echoed value always equals the last
    // XSRF-TOKEN Set-Cookie of this response (the classic retry and the Vue
    // forced prime both send the echoed value), so the freshly minted token is
    // echoed first.
    function issueCsrfToken(req, res) {
        const current = (req.cookies) ? req.cookies[XSRF_COOKIE_NAME] : undefined;

        if (mode() === "legacy") {
            return Util.respond(res, { csrf_token: res.locals.xsrfToken || current });
        }

        if ((typeof (req.session) === "undefined") || (req.session === null)) {
            // express-session skips the session when its store is disconnected.
            console.log("⚠️ [warning] CSRF priming without a session (store unavailable?)");
            return Util.failureResponse(res, 503, "service_unavailable");
        }

        if (!resolveKey()) {
            return Util.failureResponse(res, 503, "csrf_key_unavailable");
        }

        if (!hasPersistedSession(req)) {
            // D-01: a data marker, because express-session saves a new session
            // only when its data changed (the cookie is ignored by its hash).
            // The 15-minute lifetime is set here only, never on a session that
            // is already persisted (a logged-in re-prime keeps its lifetime).
            req.session.csrf_pre = Date.now();
            req.session.cookie.maxAge = PRE_SESSION_TTL_MS;
        }

        let token = res.locals.xsrfToken;
        if (!token) {
            token = (check(current, req.sessionID) === null) ? current : setBound(req, res);
        }
        Util.respond(res, { csrf_token: token });
    }

    // Login rotation (D-03): bind a new token to the regenerated session id.
    // No-op in legacy (the v1.13 double-submit cookie stays as it is).
    function rotate(req, res) {
        if (mode() === "legacy") return;
        setBound(req, res);
    }

    // Logout (SEC-CSRF-03): Domain and Path must match the mint, in every mode.
    function clear(res) {
        res.clearCookie(XSRF_COOKIE_NAME, { domain: cookie_domain, path: "/" });
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

        if (valid) return verifyBinding(req, res, next, headerVal);

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

    // Second layer, after the double-submit check passed (observe/signed only):
    // is the token bound to this request's session? observe only logs; signed
    // rejects when CSRF_ENFORCE is on (D-17). Log lines carry reason codes,
    // cookie counts and routes only.
    function verifyBinding(req, res, next, headerVal) {
        const m = mode();
        if (m === "legacy") return next();

        let reason;
        try {
            reason = bindingReason(req, headerVal);
        } catch (_e) {
            reason = "no_key"; // unreachable once assertReady() has passed at boot
        }
        if (reason === null) return next();

        const detail = "reason=" + reason + " mode=" + m + " xsrf_cookies=" + xsrfCookieCount(req) +
            " for " + req.method + " " + routeOf(req);

        if (m === "observe") {
            console.log("⚠️ [warning] CSRF binding observed " + detail);
            return next();
        }

        if (!isEnforced()) {
            console.log("⚠️ [warning] CSRF binding observed " + detail + " (fail-open, not enforced)");
            return next();
        }

        console.log("⚠️ [warning] CSRF binding rejected " + detail + " (enforced, 403)");
        return Util.failureResponse(res, 403, "csrf_token_invalid");
    }

    return {
        ensureXsrfCookie,
        verifyCsrfToken,
        issueCsrfToken,
        rotate,
        clear
    };
};

module.exports.mode = mode;
module.exports.resolveKey = resolveKey;
module.exports.keySource = keySource;
module.exports.mint = mint;
module.exports.check = check;
module.exports.hasPersistedSession = hasPersistedSession;
module.exports.bindingReason = bindingReason;
module.exports._resetForTests = _resetForTests;
