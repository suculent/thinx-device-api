// /api/v2/user

const User = require("../lib/thinx/owner"); var user = new User();
const Stats = require("../lib/thinx/statistics"); var stats = new Stats();
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Validator = require('../lib/thinx/validator');
const Util = require("./thinx/util");
module.exports = function (app) {

    /*
     * User Lifecycle
     */

    // /user/create GET
    /* Create username based on e-mail. Owner must be unique (email hash). */
    app.post("/api/user/create", function (req, res) {
        user.create(req.body, true, res, Util.responder);
    });

    // /user/delete POST
    /* Delete user document */
    app.post("/api/user/delete", function (req, res) {
        let owner = sanitka.owner(req.body.owner);
        if ((owner !== null) && (owner == req.session.owner)) {
            user.delete(owner, Util.responder, res);
        } else {
            res.status(403).end();
        }
    });

    /* Endpoint for the password reset e-mail. */
    app.get("/api/user/password/reset", function (req, res) {
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
    });

    /* Endpoint for the user activation e-mail, should proceed to password set. */
    app.get("/api/user/activate", function (req, res) {
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
    });

    /* Used by the password.html page to perform the change in database. Should revoke reset_key when done. */
    app.post("/api/user/password/set", function (req, res) {
        user.set_password(req.body, (success, message) => {
            if (!success) {
                if (typeof (req.session) !== "undefined") req.session.destroy();
                Util.respond(res, {
                    success: success,
                    status: message
                });
            } else {
                console.log(
                    "Returning message on app.post /api/user/password/set :" + JSON.stringify(message));
                Util.respond(res, message);
            }
        });
    });

    /* Used to initiate password-reset session, creates reset key with expiraation and sends password-reset e-mail. */
    app.post("/api/user/password/reset", function (req, res) {
        user.password_reset_init(req.body.email, (success, message) => {
            if (!success) {
                req.session.destroy();
                Util.respond(res, {
                    success: success,
                    status: message
                });
            } else {
                Util.respond(res, message);
            }
        });
    });

    /*
     * Chat
     */

    /* Websocket to Slack chat */

    app.post("/api/user/chat", function (req, res) {
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
    });

    /*
   * Statistics
   */

  /* Returns all audit logs per owner */
  app.get("/api/user/stats", function (req, res) {

    if (!validateSession(req)) {
      res.status(401).end();
      return;
    }

    let owner = sanitka.owner(req.session.owner);

    stats.week(owner, (success, body) => {

      if (!body) {
        console.log("Statistics for owner " + owner +
          " not found.");
        Util.respond(res, {
          success: false,
          status: "no_results"
        });
        return;
      }

      if (!success) {
        Util.respond(res, {
          success: false,
          status: body
        });
        return;
      }

      if (Validator.isJSON(body)) {
        body = JSON.parse(body);
      }

      Util.respond(res, {
        success: true,
        stats: body
      });
    });
  });

};