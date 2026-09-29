"use strict";

// SEC-CSRF-03 / D-03 — login-only session establishment.
//
// Regenerates the session id (session fixation: the pre-login id, and anything a
// sibling subdomain planted into it, never survives a login), then rotates the
// XSRF-TOKEN so the login response carries a token bound to the new id.
//
// Login-only. The per-request Bearer bridge (lib/router.js) and
// POST /api/v2/session/token must never call this: they are not logins, and a
// regenerate per request would churn one session per API call.
//
// Nothing is carried across the regenerate: impersonation (`impersonator_owner`)
// and the pre-session marker (`csrf_pre`) must not survive a fresh login.

const SessionToken = require("./session_token");

// callback(err): on err nothing has been written to any session; the caller
// answers 503 service_unavailable. On success the caller sets cookie.maxAge.
function establishSession(req, res, csrf, owner, callback) {
    if (!req || !req.session || (typeof (req.session.regenerate) !== "function")) {
        return callback(new Error("session_unavailable"));
    }
    req.session.regenerate((err) => {
        if (err) return callback(err);
        try {
            // Queue the rotated token first: it only needs the new session id,
            // and a failure here must not leave an owned session behind.
            csrf.rotate(req, res);
        } catch (e) {
            return callback(e);
        }
        req.session.owner = owner;
        SessionToken.markLogin(req.session, owner);
        callback(null);
    });
}

module.exports = { establishSession };
