// /api/v2/user

const Owner = require("../lib/thinx/owner"); 
const Stats = require("../lib/thinx/statistics"); var stats = new Stats();
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Validator = require('../lib/thinx/validator');
const Util = require("./thinx/util");

module.exports = function (app) {

    var user = new Owner(app.redis_client);

    function getActivateUser(req, res) {
        user.activate(req.query.owner, req.query.activation, (success, message) => {
            if (!success) {
                req.session.destroy((err) => {
                    console.log(err);
                });
                res.status(401);
                Util.responder(res, success, message);
            } else {
                res.redirect(message.redirectURL);
            }
        });
    }

    function getPasswordReset(req, res) {
        user.password_reset(req.query.owner, req.query.reset_key, (success, message) => {
            if (!success) {
                req.session.destroy((/*err*/) => {
                    res.status(401);
                    Util.responder(res, success, message);
                });
            } else {
                res.redirect(message.redirectURL);
            }
        });
    }

    function postPasswordReset(req, res) {
        user.password_reset_init(req.body.email, (success, message) => {
            if (!success) {
                req.session.destroy();
                res.status(401);
            }
            console.log("🔨 [debug] password_reset_init", success, message);
            Util.responder(res, success, message);
        });
    }

    function postPasswordSet(req, res) {
        console.log("🔨 [debug] set_password");
        user.set_password(req.body, (success, message) => {
            console.log("🔨 [debug] set_password callback", success, message);
            if (!success) {
                if (typeof (req.session) !== "undefined") req.session.destroy();   
                res.status(401);
            } 
            console.log("🔨 [debug] set_password respond with success, message", success, message);
            Util.responder(res, success, message);
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
                res.status(400);
            } else {
                console.log(`[OID:${owner}] Chat message sent.`);
            }
            Util.responder(res, !err, response);
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
            Util.responder(res, success, body );
        });
    }

    function getStatisticsV2(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        stats.week_V2(owner, (success, body) => {
            if (!body) {
                console.log("Statistics weekly V2 for owner " + owner + " not found.");
                return Util.responder(res, false, "no_results");
            }
            if (Validator.isJSON(body)) body = JSON.parse(body);
            Util.responder(res, success, body);
        });
    }

    function getStatisticsV2Today(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        stats.today_V2(owner, (success, body) => {
            if (!body) {
                console.log("Statistics today V2 for owner " + owner + " not found.");
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

    function createUser(req, res) {
        user.create(req.body, true, res, Util.responder);
    }

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.post("/api/v2/user", function (req, res) {
        createUser(req, res);
    });

    app.get("/api/v2/activate", function (req, res) {
        getActivateUser(req, res);
    });

    // 1. initialize with email
    app.post("/api/v2/password/reset", function (req, res) {
        postPasswordReset(req, res);
    });

    // 2. requires owner and reset key in query
    app.get("/api/v2/password/reset", function (req, res) {
        getPasswordReset(req, res);
    });

    // 3. finaly set the value
    app.post("/api/v2/password/set", function (req, res) {
        postPasswordSet(req, res);
    });

    app.get("/api/v2/stats", function (req, res) {
        getStatisticsV2(req, res);
    });

    app.get("/api/v2/stats/week", function (req, res) {
        getStatisticsV2(req, res);
    });

    app.get("/api/v2/stats/today", function (req, res) {
        getStatisticsV2Today(req, res);
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
        createUser(req, res);
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
        postPasswordReset(req, res);
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