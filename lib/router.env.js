// /api/v2/env

var APIEnv = require("../lib/thinx/apienv"); var apienv = new APIEnv();
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

module.exports = function (app) {

    /*
     * Environment Variables
     */

    /* Creates new env var. */
    app.post("/api/user/env/add", function (req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        let owner = sanitka.owner(req.session.owner);

        if (typeof (req.body.key) === "undefined") {
            Util.respond(res, {
                success: false,
                status: "missing_key"
            });
            return;
        }

        if (typeof (req.body.value) === "undefined") {
            Util.respond(res, {
                success: false,
                status: "missing_value"
            });
            return;
        }

        var key = req.body.key;
        var value = req.body.value;

        apienv.create(owner, key, value, (success, object) => {
            if (success) {
                Util.respond(res, {
                    success: true,
                    key: key,
                    value: value,
                    object: object
                });
            } else {
                Util.respond(res, {
                    success: success,
                    message: object
                });
            }
        });
    });

    /* Deletes env var by its name */
    app.post("/api/user/env/revoke", function (req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        let owner = sanitka.owner(req.session.owner);
        var env_var_names;

        if (typeof (req.body.name) !== "undefined") {
            env_var_names = [req.body.name];
        }

        if (typeof (req.body.names) !== "undefined") {
            env_var_names = req.body.names;
        }

        if (typeof (env_var_names) === "undefined") {
            Util.respond(res, {
                success: false,
                status: "no_names_given"
            });
            return;
        }

        apienv.revoke(owner, env_var_names, (success, response) => {
            if (success) {
                Util.respond(res, {
                    revoked: env_var_names,
                    success: true
                });
            } else {
                Util.respond(res, {
                    success: success,
                    status: response
                });
            }
        });
    });

    /* Lists all env vars for user. */
    app.get("/api/user/env/list", function (req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        let owner = sanitka.owner(req.session.owner);

        apienv.list(owner, (success, response) => {
            if (success) {
                Util.respond(res, {
                    env_vars: response
                });
            } else {
                Util.respond(res, {
                    success: false,
                    status: "env_list_failed"
                });
            }
        });
    });

};