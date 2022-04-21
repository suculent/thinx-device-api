// /api/v2/profile

const User = require("../lib/thinx/owner"); var user = new User();
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

function getProfile(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined") return res.status(401);
    user.profile(owner, (success, response) => {
        Util.respond(res, {
            success: success,
            profile: response
        });
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
    user.update(owner, req.body, (success, status) => {
        Util.responder(res, success, status);
    });
}

module.exports = function (app) {

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