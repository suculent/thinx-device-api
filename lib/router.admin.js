// /api/v2/admin — admin-only endpoints (Phase 10: ADMIN-01..03)

const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const AuditLog = require("./thinx/audit"); var alog = new AuditLog();

module.exports = function (app) {

    const requireAdmin = require("./middleware/requireAdmin")(app);
    const user = app.owner;
    const userlib = user.userlib;

    // ADMIN-01: list all users for the admin console.
    function listUsers(req, res) {
        userlib.list({ include_docs: true }, (err, body) => {
            if (err) return Util.failureResponse(res, 500, "user_list_failed");
            const users = body.rows
                .filter(r => r.doc && r.doc.owner)
                .map(r => ({
                    owner: r.doc.owner,
                    username: r.doc.username,
                    email: (r.doc.info && r.doc.info.email) || r.doc.email,
                    admin: r.doc.admin === true,
                    created: r.doc.created || r.doc.create_date || null,
                    last_login: r.doc.last_seen || r.doc.last_login || null,
                    device_count: 0   // v1.1 follow-up (locked OQ-B); real count via Redis cache or CouchDB view
                }));
            Util.responder(res, true, users);
        });
    }

    // ADMIN-02: revoke all sessions for one owner (coarse — single Redis blacklist entry).
    function revokeSession(req, res) {
        const target_owner = sanitka.owner(req.params.owner);
        const admin_owner = sanitka.owner(req.session.owner);
        if (!target_owner) return Util.failureResponse(res, 400, "missing_owner");
        const key = "revoked:owner:" + target_owner;
        const now_ms = String(Date.now());
        app.redis_client.set(key, now_ms, (serr) => {
            if (serr) return Util.failureResponse(res, 500, "redis_write_failed");
            app.redis_client.expire(key, 7 * 24 * 60 * 60);  // refresh-token max lifetime
            alog.log(admin_owner, "Sessions revoked for " + target_owner, ["admin", "revoke"]);
            Util.responder(res, true, "sessions_revoked");
        });
    }

    // ADMIN-03: issue a 15-min impersonation JWT for a non-admin target.
    function impersonate(req, res) {
        const target_owner = sanitka.owner(req.body && req.body.owner);
        const admin_owner = sanitka.owner(req.session.owner);
        if (!target_owner) return Util.failureResponse(res, 400, "missing_owner");
        user.profile(target_owner, (success, profile) => {
            if (!success) return Util.failureResponse(res, 404, "target_not_found");
            if (profile.admin === true) return Util.failureResponse(res, 403, "cannot_impersonate_admin");
            app.login.sign_with_impersonation(target_owner, admin_owner, (token) => {
                if (!token) return Util.failureResponse(res, 500, "token_sign_failed");
                alog.log(admin_owner, "Impersonation started for " + target_owner, ["admin", "impersonation", "start"]);
                Util.responder(res, true, { access_token: token });
            });
        });
    }

    // AUTH-REACTIVATE-01 (Phase 8): reactivate a soft-deleted user by flipping
    // `deleted` from true to false. Mirrors Owner.delete (owner.js:693-712) which
    // writes `{ deleted: true }` via userlib.atomic("users", "edit", ...). No
    // Owner.reactivate method is added — single caller, one-line write, premature
    // abstraction avoided per Phase 8 D-01 (admin-only scope; no self-serve flow).
    // Idempotent: writing `deleted: false` on an already-active user succeeds.
    function reactivateUser(req, res) {
        const target_owner = sanitka.owner(req.params.id);
        const admin_owner = sanitka.owner(req.session.owner);
        if (!target_owner) return Util.failureResponse(res, 400, "missing_owner");
        userlib.atomic("users", "edit", target_owner, { deleted: false }, (err) => {
            if (err) {
                alog.log(admin_owner, "Reactivation failed for " + target_owner, ["admin", "reactivate", "error"]);
                return Util.failureResponse(res, 500, "user_update_failed");
            }
            alog.log(admin_owner, "Reactivation succeeded for " + target_owner, ["admin", "reactivate"]);
            Util.responder(res, true, "reactivated");
        });
    }

    app.get("/api/v2/admin/users", requireAdmin, listUsers);
    app.delete("/api/v2/admin/session/:owner", requireAdmin, revokeSession);
    app.post("/api/v2/admin/impersonate", requireAdmin, impersonate);
    app.post("/api/v2/admin/user/:id/reactivate", requireAdmin, reactivateUser);

};
