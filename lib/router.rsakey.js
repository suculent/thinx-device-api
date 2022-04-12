// /api/v2/rsakey

var RSAKey = require("../lib/thinx/rsakey"); var rsakey = new RSAKey();
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

module.exports = function (app) {

    /*
     * RSA Keys
     */

    app.get("/api/user/rsakey/create", function (req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        let owner = sanitka.owner(req.session.owner);
        const ownerValid = rsakey.validateOwner(owner);
        if (!ownerValid) {
            console.log("Invalid owner in RSA Key Create.");
            Util.respond(res, {
                success: false,
                status: "owner_invalid"
            });
            return;
        }

        rsakey.create(owner, (success, response) => {
            Util.respond(res, {
                success: success,
                status: response
            });
        });
    });

    /* Lists all RSA keys for user. */
    app.get("/api/user/rsakey/list", function (req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        let owner = sanitka.owner(req.session.owner);

        rsakey.list(owner, (success, response) => {
            if (success === false) {
                Util.respond(res, {
                    success: success,
                    status: response
                });
            } else {
                Util.respond(res, {
                    success: success,
                    rsa_keys: response
                });
            }
        });

    });

    /* Deletes RSA Key by its fingerprint */
    app.post("/api/user/rsakey/revoke", function (req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        var owner;

        if (typeof (req.session.owner) !== "undefined") {
            owner = sanitka.owner(req.session.owner);
        } else {
            return Util.responder(res, false, "missing_attribute:owner");
        }

        // Support bulk updates
        if (typeof (req.body.filenames) !== "undefined") {
            var filenames = req.body.filenames;
            rsakey.revoke(owner, filenames, Util.responder, res);
        } else {
            Util.responder(res, false, "invalid_query");
        }
    });

};