// /api/v2/profile

const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

function getProfile(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined") return res.status(401);
    console.log(`ℹ️ [info] [OID:${owner}] GET profile`);
    this.user.profile(owner, (success, response) => {
        if (!success) {
            console.log(`☣️ [error] [OID:${owner}] GET profile failed: ${JSON.stringify(response)}`);
        }
        Util.responder(res, success, response);
    });
}

/* Updates user profile allowing following types of bulked changes:
 * { avatar: "base64hexdata..." }
 * { info: { "arbitrary" : "user info data "} } }
 */

function setProfile(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined") return res.status(401);
    console.log(`ℹ️ [info] [OID:${owner}] POST profile update`);
    this.user.update(owner, req.body, (success, status) => {
        if (!success) {
            console.log(`☣️ [error] [OID:${owner}] POST profile update failed: ${JSON.stringify(status)}`);
        }
        Util.responder(res, success, status);
    });
}

module.exports = function (app) {

    this.user = app.owner;

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.post("/api/v2/profile", function (req, res) {
        setProfile(req, res);
    });

    app.get("/api/v2/profile", function (req, res) {
        getProfile(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    app.post("/api/user/profile", function (req, res) {
        setProfile(req, res);
    });

    app.get("/api/user/profile", function (req, res) {
        getProfile(req, res);
    });


};