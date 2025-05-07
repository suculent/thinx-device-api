// /api/v2/env

var APIEnv = require("../lib/thinx/apienv"); 
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka");
 var sanitka = new Sanitka();

module.exports = function (app) {

    var apienv = new APIEnv(app.redis_client);

    function getEnvironmentVariables(req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();
        
        let owner = sanitka.owner(req.session.owner);
        
        apienv.list(owner, (success, response) => {
            if (!success) return Util.responder(res, false, "env_list_failed");
            Util.responder(res, success, response);
        });
    }

    function addEnvironmentVariable(req, res) {
        
        if (!Util.validateSession(req)) return res.status(401).end();

        if (typeof(req.body) === "undefined") {
            return Util.failureResponse(res, 400, "missing_body");

        }

        if (typeof (req.body.key) === "undefined") return Util.responder(res, false, "missing_key");
        if (typeof (req.body.value) === "undefined") return Util.responder(res, false, "missing_value");
        
        let owner = sanitka.owner(req.session.owner);
        var key = req.body.key;
        var value = req.body.value;

        apienv.create(owner, key, value, (success, message) => {
            Util.responder(res, success, message);
        });
    }

    function deleteEnvironmentVariable(req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        let owner = sanitka.owner(req.session.owner);
        var env_var_names;

        if (typeof(req.body) === "undefined") {
            return Util.failureResponse(res, 400, "missing_body");
        }

        if (typeof (req.body.name) !== "undefined") env_var_names = [req.body.name];
        if (typeof (req.body.names) !== "undefined") env_var_names = req.body.names;
        
        if (typeof (env_var_names) === "undefined") return Util.responder(res,  false, "no_names_given");

        apienv.revoke(owner, env_var_names, (success, response) => {
            Util.responder(res, success, response);
        });
    }

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.put("/api/v2/env", function (req, res) {
        addEnvironmentVariable(req, res);
    });

    app.delete("/api/v2/env", function (req, res) {
       deleteEnvironmentVariable(req, res);
    });

    app.get("/api/v2/env", function (req, res) {
        getEnvironmentVariables(req, res);
    });


    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    app.post("/api/user/env/add", function (req, res) {
        addEnvironmentVariable(req, res);
    });

    app.post("/api/user/env/revoke", function (req, res) {
       deleteEnvironmentVariable(req, res);
    });

    app.get("/api/user/env/list", function (req, res) {
        getEnvironmentVariables(req, res);
    });

};