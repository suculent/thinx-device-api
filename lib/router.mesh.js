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
        if (typeof (req.body) === "undefined") {
            return Util.respond(res, { success: false, status: "Parameter mesh_ids missing in request body." });
        }

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
            return Util.respond(res, {
                success: false,
                reason: "OWNER_INVALID"
            });
        }

        user.listMeshes(owner_id, (success, mesh_ids) => {
            console.log("B list success:", success, "ids", mesh_ids);
            Util.respond(res, {
                success: success,
                mesh_ids: mesh_ids
            });
        });
    }

    function createMesh(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();

        if (typeof (req.body) === "undefined") {
            return Util.respond(res, { success: false, status: "Request body missing." });
        }

        let owner_id;
        if (typeof (req.body.owner_id) === "undefined") {
            return Util.respond(res, { success: false, status: "Owner ID missing in request body." });
        } else {
            owner_id = sanitka.owner(req.body.owner_id);
        }

        let mesh_id;
        if (typeof (req.body.mesh_id) === "undefined") {
            return Util.respond(res, { success: false, status: "Mesh ID missing in request body." });
        } else {
            mesh_id = req.body.mesh_id;
        }

        let mesh_alias;
        if (typeof (req.body.alias) === "undefined") {
            mesh_alias = mesh_id;
        } else {
            mesh_alias = req.body.alias;
        }

        user.createMesh(owner_id, mesh_id, mesh_alias, function (success, response) {
            if (success) {
                Util.respond(res, { success: success, mesh_ids: response });
            } else {
                console.log("Mesh create failed:", success, "ids", response);
                Util.respond(res, { success: success, status: "Mesh create failed." });
            }
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