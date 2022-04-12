// /api/v2/source


const Sources = require("../lib/thinx/sources"); var sources = new Sources();
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Util = require("./thinx/util");

module.exports = function (app) {
    
  /*
   * Sources (GIT Repositories)
   */

  /* List available sources */
  app.get("/api/user/sources/list", function (req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined") {
      res.status(401);
    }
    sources.list(req.session.owner, (success, response) => {
      if (success === true) {
        Util.respond(res, {
          success: true,
          sources: response
        });
      } else {
        Util.respond(res, response);
      }
    });
  });

  /* Adds a GIT repository. Expects URL, alias and a optional branch (origin/master is default). */
  app.post("/api/user/source", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    if (typeof (req.body.alias) === "undefined") {
      Util.respond(res, {
        success: false,
        status: "missing_source_alias"
      });
      return;
    }

    if (typeof (req.body.url) === "undefined") {
      Util.respond(res, {
        success: false,
        status: "missing_source_url"
      });
      return;
    }

    var branch = "origin/master";
    if ((typeof (req.body.branch) !== "undefined") &&
      (req.body.branch !== null)) {
      branch = req.body.branch;
    }

    var is_private = false;
    if (typeof (req.body.is_private) !== "undefined") {
      is_private = req.body.is_private;
    }

    var object = {
      owner: req.session.owner,
      alias: req.body.alias,
      url: sanitka.url(req.body.url),
      branch: sanitka.branch(branch),
      circle_key: req.body.circleToken,
      secret: req.body.secret,
      is_private: is_private
    };

    sources.add(object, (_success, response) => {
      Util.respond(res, response);
    });
  });

  /* Removes a GIT repository. Expects alias. */
  app.post("/api/user/source/revoke", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    if (typeof (req.body.source_ids) === "undefined") {
        return Util.responder(res, false, "missing_source_ids");
    }
    var source_ids = req.body.source_ids;
    sources.remove(owner, source_ids, (success, message) => {
      Util.respond(res, message);
    });
  });


};