// Cookie-session -> access-token re-mint for the Vue console.
//
// The Vue console keeps its JWT in memory only (never localStorage/sessionStorage,
// where any injected script could read it). A page reload therefore loses the
// token; the console recovers by POSTing here, riding the httpOnly `x-thx-core`
// session cookie that /login already established.
//
// Security:
// - The owner is taken from `login_owner`, which ONLY a real login sets (see
//   markLogin). `req.session.owner` is not trusted here: the global Bearer
//   middleware in router.js overwrites it on every JWT request, including
//   15-minute impersonation tokens, so minting from it would turn a capped
//   impersonation into a fresh full session for the target user.
// - An admin revoke (`revoked:owner:<id>`, see router.admin.js) newer than the
//   login invalidates the cookie session here as well, not just the old JWTs.
// - Only a 1h access token is issued; no refresh token.

const REVOKE_PREFIX = "revoked:owner:";

function markLogin(session, owner) {
  if ((typeof (session) === "undefined") || (session === null)) return;
  session.login_owner = owner;
  session.login_at = Date.now();
}

function createHandler(app) {

  function reject(req, res) {
    const done = () => {
      res.status(401);
      res.header("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ success: false, response: "no_session" }));
    };
    if (req.session && typeof (req.session.destroy) === "function" && req.session.login_owner) {
      return req.session.destroy(() => done());
    }
    done();
  }

  return function sessionTokenAction(req, res) {
    const session = req.session;
    const owner = session ? session.login_owner : undefined;
    const login_at = session ? parseInt(session.login_at, 10) : NaN;

    if ((typeof (owner) !== "string") || (owner.length === 0) || isNaN(login_at)) {
      return reject(req, res);
    }

    app.redis_client.get(REVOKE_PREFIX + owner, (rerr, ts) => {
      // Fail CLOSED (unlike the per-request Bearer check): this endpoint mints
      // new credentials, so an unreadable blacklist must not wave it through.
      if (rerr) {
        console.warn("⚠️ [warning] session token blacklist check failed", rerr);
        res.status(503);
        res.header("Content-Type", "application/json; charset=utf-8");
        return res.end(JSON.stringify({ success: false, response: "service_unavailable" }));
      }
      if (ts && login_at < parseInt(ts, 10)) {
        return reject(req, res);
      }
      app.login.sign(owner, (access_token) => {
        if (!access_token) {
          res.status(500);
          res.header("Content-Type", "application/json; charset=utf-8");
          return res.end(JSON.stringify({ success: false, response: "token_sign_failed" }));
        }
        // Undo any impersonation the Bearer middleware left on this session.
        session.owner = owner;
        delete session.impersonator_owner;
        res.header("Content-Type", "application/json; charset=utf-8");
        res.header("Cache-Control", "no-store");
        res.end(JSON.stringify({ success: true, access_token: access_token }));
      });
    });
  };
}

module.exports = { markLogin, createHandler, REVOKE_PREFIX };
