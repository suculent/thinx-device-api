// /api/v2/source


const Sources = require("../lib/thinx/sources"); var sources = new Sources();
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Util = require("./thinx/util");

module.exports = function (app) {

  function getSourcesList(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined") return res.status(401);
    sources.list(req.session.owner, (success, response) => {
      if (success !== true) return Util.respond(res, response);
      Util.respond(res, {
        success: true,
        sources: response
      });
    });
  }

  function addSource(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    var branch = "origin/master";
    var is_private = false;
    if (typeof (req.body.alias) === "undefined") return Util.responder(res, false, "missing_source_alias");
    if (typeof (req.body.url) === "undefined") return Util.responder(res, false, "missing_source_url");
    if ((typeof (req.body.branch) !== "undefined") && (req.body.branch !== null)) branch = req.body.branch;
    if (typeof (req.body.is_private) !== "undefined") is_private = req.body.is_private;
    sources.add({
      owner: req.session.owner,
      alias: req.body.alias,
      url: sanitka.url(req.body.url),
      branch: sanitka.branch(branch),
      circle_key: req.body.circleToken,
      secret: req.body.secret,
      is_private: is_private
    },
    (_success, response) => {
      Util.respond(res, response);
    });
  }

  function deleteSource(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    if (typeof (req.body.source_ids) === "undefined") return Util.responder(res, false, "missing_source_ids");
    var source_ids = req.body.source_ids;
    sources.remove(owner, source_ids, (success, message) => {
      Util.respond(res, message);
    });
  }

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v2
  //

  app.get("/api/v2/source", function (req, res) {
    getSourcesList(req, res);
  });

  app.put("/api/v2/source", function (req, res) {
    addSource(req, res);
  });

  app.delete("/api/v2/source", function (req, res) {
    deleteSource(req, res);
  });
    
  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v1
  //

  /* List available sources */
  app.get("/api/user/sources/list", function (req, res) {
    getSourcesList(req, res);
  });

  /* Adds a GIT repository. Expects URL, alias and a optional branch (origin/master is default). */
  app.post("/api/user/source", function (req, res) {
    addSource(req, res);
  });

  /* Removes a GIT repository. Expects alias. */
  app.post("/api/user/source/revoke", function (req, res) {
    deleteSource(req, res);
  });
};