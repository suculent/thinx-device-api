// /api/v2/profile

const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

module.exports = function (app) {

    const user = app.owner;

    // SEC-CSRF-05: session-bound anti-CSRF check for the profile mutations
    const csrf = require("./middleware/csrf")(app);

    function getProfile(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        if (typeof (owner) === "undefined") return res.status(401);
        console.log(`ℹ️ [info] [OID:${owner}] GET profile`);
        user.profile(owner, (success, response) => {
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
        user.update(owner, req.body, (success, status) => {
            if (!success) {
                console.log(`☣️ [error] [OID:${owner}] POST profile update failed: ${JSON.stringify(status)}`);
            }
            Util.responder(res, success, status);
        });
    }

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    // SEC-CSRF-05: profile update, cookie sessions need the token (Bearer exempt, D-09)
    app.post("/api/v2/profile", csrf.verifyCsrfToken, function (req, res) {
        setProfile(req, res);
    });

    // Not guarded: GET read (D-10)
    app.get("/api/v2/profile", function (req, res) {
        getProfile(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    // SEC-CSRF-05: same handler as POST /api/v2/profile, guarded (D-11)
    app.post("/api/user/profile", csrf.verifyCsrfToken, function (req, res) {
        setProfile(req, res);
    });

    // Not guarded: GET read (D-10)
    app.get("/api/user/profile", function (req, res) {
        getProfile(req, res);
    });


};
