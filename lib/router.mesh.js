// /api/v2/mesh

var User = require("../lib/thinx/owner"); var user = new User();
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

module.exports = function (app) {

    function deleteMesh(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();

        if (typeof (req.body) === "undefined") return Util.respond(res, { success: false, status: "Body missing." });
        if (typeof (req.body) !== "object") return Util.respond(res, { success: false, status: "Invalid request format." });

        console.log(`[debug] /api/mesh/delete body: ${req.body}, sess: ${req.session}`);

        let owner_id;
        if (typeof (req.session.owner_id) !== "undefined") {
            owner_id = req.session.owner_id;
        } else {
            if (typeof (req.body.owner_id) === "undefined") {
                return Util.respond(res, { success: false, status: "Parameter owner_id missing." });
            } else {
                owner_id = sanitka.owner(req.body.owner_id);
            }
        }

        let mesh_ids = req.body.mesh_ids;
        if (typeof (req.body) === "undefined") return Util.responder(res, false, "Parameter mesh_ids missing in request body.");

        user.deleteMeshes(owner_id, mesh_ids, function (success, status) {
            Util.responder(res, success, status);
        });
    }

    function getListMeshes(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();

        let owner = sanitka.owner(req.session.owner);
        if (owner == null) {
            return Util.responder(res, false, "owner_missing");
        }

        user.listMeshes(req.session.owner, (success, mesh_ids) => {
            Util.responder(res, success, mesh_ids);
        });
    }

    function postListMeshes(req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        let owner_id = sanitka.owner(req.body.owner_id);
        if (owner_id == null) {
            return Util.responder(res, false, "owner_invalid");
        }

        user.listMeshes(owner_id, (success, mesh_ids) => {
            Util.respond(res, {
                success: success,
                mesh_ids: mesh_ids
            });
        });
    }

    function createMesh(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();

        if (typeof (req.body) === "undefined") {
            return Util.respond(res, { success: false, status: "body_missing" });
        }

        let owner_id;
        if (typeof (req.body.owner_id) === "undefined") {
            return Util.respond(res, { success: false, status: "owner_id_missing" });
        } else {
            owner_id = sanitka.owner(req.body.owner_id);
        }

        let mesh_id;
        if (typeof (req.body.mesh_id) === "undefined") {
            return Util.respond(res, { success: false, status: "mesh_id_missing" });
        } else {
            mesh_id = req.body.mesh_id;
        }

        let mesh_alias = mesh_id;
        if (typeof (req.body.alias) !== "undefined") mesh_alias = req.body.alias;

        user.createMesh(owner_id, mesh_id, mesh_alias, function (success, response) {
            if (!success) return Util.respond(res, { success: success, status: "mesh_create_failed" });
            Util.respond(res, { success: success, mesh_ids: response });
        });
    }

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    // Uses session owner as authentication
    app.get("/api/v2/mesh", function (req, res) {
        getListMeshes(req, res);
    });

    app.put("/api/v2/mesh", function (req, res) {
        createMesh(req, res);
    });

    app.delete("/api/v2/mesh", function (req, res) {
        deleteMesh(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    // Uses session owner as authentication
    app.get("/api/mesh/list", function (req, res) {
        getListMeshes(req, res);
    });

    // Uses session owner in body, should require API Key authentication
    app.post("/api/mesh/list", function (req, res) {
        postListMeshes(req, res);
    });

    app.post("/api/mesh/create", function (req, res) {
        createMesh(req, res);
    });

    app.post("/api/mesh/delete", function (req, res) {
        deleteMesh(req, res);
    });

};