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
    const name = req.method === "GET" ? (req.query && req.query.name) : (req.body && req.body.name);
    if (typeof name !== "undefined" && (typeof name !== "string" || !name.trim() || name.trim().length > 120 || /[\r\n\x00-\x1f\x7f]/.test(name))) {
        return Util.failureResponse(res, 400, "invalid_key_name");
    }
    rsakey.create(owner, (success, response) => {
        Util.responder(res, success, response);
    }, name);
}

function listRSAKeys(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    rsakey.list(owner, (success, response) => {
        Util.responder(res, success, response);
    });
}

function deleteRSAKey(req, res) {
    
    if (!Util.validateSession(req)) return res.status(401).end();

    if (typeof(req.body) === "undefined") {
        return Util.failureResponse(res, 400, "invalid_body");
    }

    if (typeof (req.session.owner) === "undefined") return Util.responder(res, false, "missing_attribute:owner");
    let owner = sanitka.owner(req.session.owner);
    let filenames = req.body.filenames;
    if (typeof (filenames) === "undefined") return Util.failureResponse(res, 400, "invalid_query_missing_filenames");
    rsakey.revoke(owner, filenames, (_res, status, message) => {
        Util.responder(_res, status, message);
    }, res);
}

module.exports = function (app) {

    // SEC-CSRF-05 / D-11: deploy-key mutations need the session-bound token.
    const csrf = require("./middleware/csrf")(app);

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.put("/api/v2/rsakey", csrf.verifyCsrfToken, function (req, res) {
        createRSAKey(req, res);
    });

    app.get("/api/v2/rsakey", function (req, res) {
        listRSAKeys(req, res);
    });

    app.delete("/api/v2/rsakey", csrf.verifyCsrfToken, function (req, res) {
        deleteRSAKey(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    // State-changing GET (creates a deploy key), guarded like the POSTs. The classic
    // dashboard sends X-XSRF-TOKEN on every API-bound $.ajax through the D-18 seam.
    app.get("/api/user/rsakey/create", csrf.verifyCsrfToken, function (req, res) {
        createRSAKey(req, res);
    });

    /* Lists all RSA keys for user. */
    app.get("/api/user/rsakey/list", function (req, res) {
        listRSAKeys(req, res);
    });

    /* Deletes RSA Key by its fingerprint */
    app.post("/api/user/rsakey/revoke", csrf.verifyCsrfToken, function (req, res) {
        deleteRSAKey(req, res);
    });

};