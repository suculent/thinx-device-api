// /api/v2/mesh

const Util = require("./thinx/util");

module.exports = function (app) {

    var user = app.owner;

    const csrf = require("./middleware/csrf")(app);

    // Every handler acts on the authenticated owner only: the session owner (cookie
    // session or verified Bearer) or the owner whose API key lib/router.js verified.
    // A request-supplied owner never selects or overrides it (261003-skk).

    function deleteMesh(req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        if (!Util.isDefined(req.body)) return Util.responder(res, false, "Body missing." );

        if (typeof (req.body) !== "object") return Util.responder(res, false, "Invalid request format." );

        const owner_id = Util.ownerFromRequest(req);
        if (owner_id === null) return Util.failureResponse(res, 400, "owner_invalid");

        let mesh_ids = req.body.mesh_ids;
        if (!Util.isDefined(mesh_ids)) return Util.responder(res, false, "mesh_ids_missing");

        user.deleteMeshes(owner_id, mesh_ids, function (success, status) {
            console.log("🔨 [debug] user.deleteMeshes", success, status);
            Util.responder(res, success, status);
        });
    }

    function listMeshes(req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        const owner_id = Util.ownerFromRequest(req);
        if (owner_id === null) return Util.failureResponse(res, 400, "owner_invalid");

        user.listMeshes(owner_id, (success, mesh_ids) => {
            Util.responder(res, success, mesh_ids);
        });
    }

    function createMesh(req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();
        if (!Util.isDefined(req.body)) return Util.responder(res, false, "body_missing" );

        const owner_id = Util.ownerFromRequest(req);
        if (owner_id === null) return Util.failureResponse(res, 400, "owner_invalid");

        if (!Util.isDefined(req.body.mesh_id)) return Util.responder(res, false, "mesh_id_missing" );
        let mesh_id = req.body.mesh_id;

        let mesh_alias = mesh_id;
        if (Util.isDefined(req.body.alias)) mesh_alias = req.body.alias;

        user.createMesh(owner_id, mesh_id, mesh_alias, (success, response) => {
            if (!success) return Util.responder(res, false, "mesh_create_failed" );
            Util.responder(res, success, response );
        });
    }

    // CSRF (quick 261003-skk): mesh mutations are reachable with a cookie session, so
    // they carry the session-bound CSRF check; this lifts Phase 25 D-21 for this file
    // only (the device mesh attach/detach routes stay deferred with the device routes).
    // Verified Bearer calls and cookieless calls with a router-verified API key are
    // exempt (D-09). The classic console sends the token through the D-18 ajax seam.
    // The list routes are reads and stay unguarded.

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    // Uses session owner as authentication
    app.get("/api/v2/mesh", function (req, res) {
        listMeshes(req, res);
    });

    app.put("/api/v2/mesh", csrf.verifyCsrfToken, function (req, res) {
        createMesh(req, res);
    });

    app.delete("/api/v2/mesh", csrf.verifyCsrfToken, function (req, res) {
        deleteMesh(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    // Uses session owner as authentication
    app.get("/api/mesh/list", function (req, res) {
        listMeshes(req, res);
    });

    // Same list; a POST body may carry owner/owner_id + api_key, verified by lib/router.js
    app.post("/api/mesh/list", function (req, res) {
        listMeshes(req, res);
    });

    app.post("/api/mesh/create", csrf.verifyCsrfToken, function (req, res) {
        createMesh(req, res);
    });

    app.post("/api/mesh/delete", csrf.verifyCsrfToken, function (req, res) {
        deleteMesh(req, res);
    });

};