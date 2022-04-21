// /api/v2/user

const User = require("../lib/thinx/owner"); var user = new User();
const Stats = require("../lib/thinx/statistics"); var stats = new Stats();
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Validator = require('../lib/thinx/validator');
const Util = require("./thinx/util");

module.exports = function (app) {

    function getActivateUser(req, res) {
        user.activate(req.query.owner, req.query.activation, (success, message) => {
            if (!success) {
                req.session.destroy((err) => {
                    console.log(err);
                });
                Util.respond(res, {
                    success: success,
                    status: message
                });
            } else {
                res.redirect(message.redirectURL);
            }
        });
    }

    function getPasswordReset(req, res) {
        user.password_reset(req.query.owner, req.query.reset_key, (success, message) => {
            if (!success) {
                req.session.destroy((/*err*/) => {
                    Util.respond(res, {
                        success: success,
                        status: message
                    });
                });
            } else {
                res.redirect(message.redirectURL);
            }
        });
    }

    function postResetPassword(req, res) {
        user.password_reset_init(req.body.email, (success, message) => {
            if (!success) {
                req.session.destroy();
                return Util.respond(res, success, message);
            } else {
                Util.respond(res, message);
            }
        });
    }

    function postPasswordSet(req, res) {
        user.set_password(req.body, (success, message) => {
            if (!success) {
                if (typeof (req.session) !== "undefined") req.session.destroy();
                Util.responder(res, success, message);
            } else {
                console.log(
                    "Returning message on app.post /api/user/password/set :" + JSON.stringify(message));
                Util.respond(res, message);
            }
        });
    }

    function postChat(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        var message = req.body.message;
        app.messenger.slack(owner, message, function (err, response) {
            if (err) {
                let errString = err.toString();
                console.log(`[OID:${owner}] Chat message failed with error ${errString}`);
            } else {
                console.log(`[OID:${owner}] Chat message sent.`);
            }
            Util.respond(res, {
                success: !err,
                status: response
            });
        });
    }

    function getStatistics(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        stats.week(owner, (success, body) => {
            if (!body) {
                console.log("Statistics for owner " + owner + " not found.");
                return Util.responder(res, false, "no_results");
            }
            if (Validator.isJSON(body)) body = JSON.parse(body);
            Util.respond(res, { success: success, object: body });
        });
    }

    function getStatisticsV2(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        stats.week_V2(owner, (success, body) => {
            if (!body) {
                console.log("Statistics V2 for owner " + owner + " not found.");
                return Util.responder(res, false, "no_results");
            }
            if (Validator.isJSON(body)) body = JSON.parse(body);
            Util.responder(res, success, body);
        });
    }

    function deleteUser(req, res) {
        let owner = sanitka.owner(req.body.owner);
        if ((owner !== null) && (owner == req.session.owner)) {
            user.delete(owner, Util.responder, res);
        } else {
            res.status(403).end();
        }
    }

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.post("/api/v2/user/create", function (req, res) {
        user.create(req.body, true, res, Util.responder);
    });

    app.get("/api/v2/user/activate", function (req, res) {
        getActivateUser(req, res);
    });

    app.post("/api/v2/password/set", function (req, res) {
        postPasswordSet(req, res);
    });

        app.get("/api/v2/password/reset", function (req, res) {
        getPasswordReset(req, res);
    });

    app.post("/api/v2/password/reset", function (req, res) {
        postResetPassword(req, res);
    });

    app.get("/api/v2/stats", function (req, res) {
        getStatisticsV2(req, res);
    });

    app.post("/api/v2/chat", function (req, res) {
        postChat(req, res);
    });

    app.delete("/api/v2/user", function (req, res) {
        deleteUser(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    app.post("/api/user/create", function (req, res) {
        user.create(req.body, true, res, Util.responder);
    });

    /* Endpoint for the user activation e-mail, should proceed to password set. */
    app.get("/api/user/activate", function (req, res) {
        getActivateUser(req, res);
    });

    /* Used by the password.html page to perform the change in database. Should revoke reset_key when done. */
    app.post("/api/user/password/set", function (req, res) {
        postPasswordSet(req, res);
    });

    /* Endpoint for the password reset e-mail. */
    app.get("/api/user/password/reset", function (req, res) {
        getPasswordReset(req, res);
    });

    /* Used to initiate password-reset session, creates reset key with expiraation and sends password-reset e-mail. */
    app.post("/api/user/password/reset", function (req, res) {
        postResetPassword(req, res);
    });

    app.post("/api/user/chat", function (req, res) {
        postChat(req, res);
    });

    app.get("/api/user/stats", function (req, res) {
        getStatistics(req, res);
    });

    /* Delete user document */
    app.post("/api/user/delete", function (req, res) {
        deleteUser(req, res);
    });

};