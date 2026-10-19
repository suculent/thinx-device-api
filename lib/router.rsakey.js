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
    if (typeof name !== "undefined") {
        const check = RSAKey.validateKeyName(name); // the one name check (D-05, IN-01)
        if (!check.ok) return invalidKeyName(res, check.reason);
    }
    rsakey.create(owner, (success, response, reason) => {
        // The name is checked above; create() itself refuses only the key's own default
        // comment (`reserved`, 45-REVIEW IN-02), which needs the timestamp it picks.
        if (!success && response === "invalid_key_name") return invalidKeyName(res, reason);
        // D-03: OpenBao unavailable or the D-07 kill switch off. Exactly this body, so no
        // reason class, address or status from OpenBao ever reaches the client.
        if (!success && response === "key_service_unavailable") {
            return Util.failureResponse(res, 503, "key_service_unavailable");
        }
        Util.responder(res, success, response);
    }, name);
}

// D-07: an invalid name answers 400 with the validator's reason next to the unchanged
// `invalid_key_name` code, which the Legacy console already reads.
function invalidKeyName(res, reason) {
    res.status(400);
    Util.respond(res, { success: false, response: "invalid_key_name", reason: reason });
}

// Phase 45 KEY-04 / D-02: rename a deploy key; only its .pub comment changes. The owner
// comes from the session only, the key from exact membership of `filename` in that
// owner's key list (lib/thinx/rsakey.js rename). No v1 twin.
function renameRSAKey(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    const body = req.body;
    if ((typeof body !== "object") || (body === null) || Array.isArray(body)) {
        return Util.failureResponse(res, 400, "invalid_body");
    }
    const owner = sanitka.owner(req.session && req.session.owner);
    if (!rsakey.validateOwner(owner)) return Util.failureResponse(res, 400, "owner_invalid");
    const filename = body.filename;
    if ((typeof filename !== "string") || (filename.length === 0)) {
        return Util.failureResponse(res, 400, "invalid_filename");
    }
    const check = RSAKey.validateKeyName(body.name);
    if (!check.ok) return invalidKeyName(res, check.reason);
    rsakey.rename(owner, filename, body.name, (success, response, reason) => {
        if (success) return Util.responder(res, true, response);
        if (response === "invalid_key_name") return invalidKeyName(res, reason);
        if (response === "key_not_found") return Util.failureResponse(res, 404, "key_not_found");
        Util.failureResponse(res, 500, "rename_failed");
    });
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
    // 38 WR-05: anything but an array of strings is a client error, not a 500.
    if (!Array.isArray(filenames) || !filenames.every(f => typeof f === "string")) return Util.failureResponse(res, 400, "invalid_filenames");
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

    // Phase 45 D-02: rename (body {filename, name}); v2 only, CSRF like every key mutation.
    app.patch("/api/v2/rsakey", csrf.verifyCsrfToken, function (req, res) { renameRSAKey(req, res); });

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