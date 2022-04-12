// /api/v2/profile

const User = require("../lib/thinx/owner"); var user = new User();
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

module.exports = function (app) {

    /*
     * User Profile
     */

    /* Updates user profile allowing following types of bulked changes:
     * { avatar: "base64hexdata..." }
     * { info: { "arbitrary" : "user info data "} } }
     */

    app.post("/api/user/profile", function (req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        if (typeof (owner) === "undefined") {
            res.status(401); // cannot POST without owner
        }
        user.update(owner, req.body, (success, status) => {
            console.log("Updating user profile...");
            Util.respond(res, {
                success: success,
                status: status
            });
        });
    });

    app.get("/api/user/profile", function (req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        if (typeof (owner) === "undefined") {
            res.status(401);
        }
        user.profile(owner, (success, response) => {
            if (success === false) {
                Util.respond(res, {
                    success: success,
                    status: response
                });
            } else {
                Util.respond(res, {
                    success: success,
                    profile: response
                });
            }
        });
    });

};