// /api/v2/rsakey

var RSAKey = require("../lib/thinx/rsakey"); var rsakey = new RSAKey();
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka");
var sanitka = new Sanitka();

function createRSAKey(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    const ownerValid = rsakey.validateOwner(owner);
    if (!ownerValid) {
        console.log("Invalid owner in RSA Key Create.");
        return Util.responder(res, false, "owner_invalid");
    }
    rsakey.create(owner, (success, response) => {
        Util.respond(res, {
            success: success,
            status: response
        });
    });
}

function listRSAKeys(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    rsakey.list(owner, (success, response) => {
        if (success) {
            Util.respond(res, {
                success: success,
                rsakeys: response
            });
        } else {
            Util.responder(res, success, response);
        }
    });
}

function deleteRSAKey(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    if (typeof (req.session.owner) === "undefined") return Util.responder(res, false, "missing_attribute:owner");
    let owner = sanitka.owner(req.session.owner);
    let filenames = req.body.filenames;
    if (typeof (filenames) === "undefined") return Util.responder(res, false, "invalid_query");
    rsakey.revoke(owner, filenames, (_res, status, message) => {
        Util.responder(_res, status, message);
    }, res);
}

module.exports = function (app) {

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.put("/api/v2/rsakey", function (req, res) {
        createRSAKey(req, res);
    });

    app.get("/api/v2/rsakey", function (req, res) {
        listRSAKeys(req, res);
    });

    app.delete("/api/v2/rsakey", function (req, res) {
        deleteRSAKey(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    app.get("/api/user/rsakey/create", function (req, res) {
        createRSAKey(req, res);
    });

    /* Lists all RSA keys for user. */
    app.get("/api/user/rsakey/list", function (req, res) {
        listRSAKeys(req, res);
    });

    /* Deletes RSA Key by its fingerprint */
    app.post("/api/user/rsakey/revoke", function (req, res) {
        deleteRSAKey(req, res);
    });

};