// /api/v2/mesh

const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

module.exports = function (app) {

    var user = app.owner;

    function deleteMesh(req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();
    
        if (!Util.isDefined(req.body)) return Util.responder(res, false, "Body missing." );
    
        if (typeof (req.body) !== "object") return Util.responder(res, false, "Invalid request format." );
    
        console.log(`[debug] /api/mesh/delete body: ${JSON.stringify(req.body)}`);
    
        let owner_id = sanitka.owner(req.body.owner_id);
        if (owner_id == null) {
            if (Util.isDefined(req.session.owner)) {
                owner_id = req.session.owner;
            } else {
                return Util.failureResponse(res, 400, "owner_invalid");
            }
        }
    
        let mesh_ids = req.body.mesh_ids;
        if (!Util.isDefined(mesh_ids)) return Util.responder(res, false, "mesh_ids_missing");
    
        user.deleteMeshes(owner_id, mesh_ids, function (success, status) {
            console.log("🔨 [debug] user.deleteMeshes", success, status);
            Util.responder(res, success, status);
        });
    }
    
    function getListMeshes(req, res) {
    
        if (!Util.validateSession(req)) return res.status(401).end();

        if (Util.isDefined(req.session.owner)) {
            owner_id = req.session.owner;
        } else {
            return Util.failureResponse(res, 400, "owner_invalid");
        }
    
        user.listMeshes(owner_id, (success, mesh_ids) => {
            Util.responder(res, success, mesh_ids);
        });
    }
    
    function postListMeshes(req, res) {
    
        if (!Util.validateSession(req)) return res.status(401).end();

        if (typeof(req.body) === "undefined") {
            return Util.failureResponse(res, 400, "missing_body");
        }
    
        let owner_id = sanitka.owner(req.body.owner_id);
        if (owner_id == null) {
            if (Util.isDefined(req.session.owner)) {
                owner_id = req.session.owner;
            } else {
                return Util.failureResponse(res, 400, "owner_invalid");
            }
        }
    
        user.listMeshes(owner_id, (success, mesh_ids) => {
            Util.responder(res, success, mesh_ids);
        });
    }
    
    function createMesh(req, res) {
    
        if (!Util.validateSession(req)) return res.status(401).end();
        if (!Util.isDefined(req.body)) return Util.responder(res, false, "body_missing" );
    
        let owner_id = sanitka.owner(req.body.owner_id);
        if (owner_id == null) {
            if (!Util.isDefined(req.session.owner)) return Util.responder(res, false, "owner_invalid");
            owner_id = req.session.owner;
        }
    
        if (!Util.isDefined(req.body.mesh_id)) return Util.responder(res, false, "mesh_id_missing" );
        let mesh_id = req.body.mesh_id;
    
        let mesh_alias = mesh_id;
        if (Util.isDefined(req.body.alias)) mesh_alias = req.body.alias;
    
        user.createMesh(owner_id, mesh_id, mesh_alias, (success, response) => {
            if (!success) return Util.responder(res, false, "mesh_create_failed" );
            Util.responder(res, success, response );
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