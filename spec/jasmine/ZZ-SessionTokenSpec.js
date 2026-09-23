/*
 * ZZ-SessionTokenSpec.js — cookie-session -> access-token re-mint
 *
 * Unit-tests `lib/thinx/session_token.js` against mock req/res/redis/login,
 * without booting the full app. Covers: no login marker -> 401; valid login ->
 * token minted for login_owner (NOT the Bearer-overwritten session.owner, so an
 * impersonation token cannot be laundered into a full session); revoke newer
 * than login -> 401 + session destroyed; revoke older than login -> token;
 * redis error -> 503 (fail closed).
 */

var expect = require('chai').expect;

const SessionToken = require("../../lib/thinx/session_token");

function mockRes() {
    const res = { _status: 200, _headers: {}, _body: null };
    res.status = (code) => { res._status = code; return res; };
    res.header = (k, v) => { res._headers[k] = v; return res; };
    res.end = (body) => { res._body = body ? JSON.parse(body) : null; };
    return res;
}

function mockApp(revokedTs, redisError) {
    const signed = [];
    return {
        signed: signed,
        redis_client: {
            get: (key, cb) => cb(redisError || null, revokedTs === undefined ? null : revokedTs)
        },
        login: {
            sign: (owner, cb) => { signed.push(owner); cb("jwt-for-" + owner); }
        }
    };
}

function mockSession(fields) {
    const session = Object.assign({}, fields);
    session.destroyed = false;
    session.destroy = (cb) => { session.destroyed = true; cb(); };
    return session;
}

describe("ZZ-SessionTokenSpec", function () {

    it("markLogin records owner and timestamp", function () {
        const session = {};
        SessionToken.markLogin(session, "owner-a");
        expect(session.login_owner).to.equal("owner-a");
        expect(session.login_at).to.be.a('number');
    });

    it("rejects a session without a login marker (Bearer-only session.owner)", function () {
        const app = mockApp();
        const res = mockRes();
        const session = mockSession({ owner: "owner-a" });
        SessionToken.createHandler(app)({ session: session }, res);
        expect(res._status).to.equal(401);
        expect(app.signed).to.have.length(0);
    });

    it("mints for login_owner, ignoring an impersonated session.owner", function () {
        const app = mockApp();
        const res = mockRes();
        const session = mockSession({
            owner: "target-user",
            impersonator_owner: "admin",
            login_owner: "admin",
            login_at: Date.now()
        });
        SessionToken.createHandler(app)({ session: session }, res);
        expect(res._status).to.equal(200);
        expect(res._body.access_token).to.equal("jwt-for-admin");
        expect(res._headers["Cache-Control"]).to.equal("no-store");
        expect(app.signed).to.deep.equal(["admin"]);
        expect(session.owner).to.equal("admin");
        expect(session.impersonator_owner).to.equal(undefined);
    });

    it("rejects and destroys the session when revoked after login", function () {
        const login_at = Date.now() - 10000;
        const app = mockApp(String(login_at + 5000));
        const res = mockRes();
        const session = mockSession({ login_owner: "owner-a", login_at: login_at });
        SessionToken.createHandler(app)({ session: session }, res);
        expect(res._status).to.equal(401);
        expect(session.destroyed).to.equal(true);
        expect(app.signed).to.have.length(0);
    });

    it("mints when the revoke predates the login", function () {
        const login_at = Date.now();
        const app = mockApp(String(login_at - 5000));
        const res = mockRes();
        const session = mockSession({ login_owner: "owner-a", login_at: login_at });
        SessionToken.createHandler(app)({ session: session }, res);
        expect(res._status).to.equal(200);
        expect(res._body.access_token).to.equal("jwt-for-owner-a");
    });

    it("fails closed when the blacklist cannot be read", function () {
        const app = mockApp(undefined, new Error("redis down"));
        const res = mockRes();
        const session = mockSession({ login_owner: "owner-a", login_at: Date.now() });
        SessionToken.createHandler(app)({ session: session }, res);
        expect(res._status).to.equal(503);
        expect(app.signed).to.have.length(0);
    });
});
