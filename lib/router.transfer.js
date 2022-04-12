// /api/v2/ Transfer


const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
var Transfer = require("../lib/thinx/transfer"); var transfer = new Transfer(app.messenger);

module.exports = function (app) {

    /*
   * Device Transfer
   */

  var transferResultRedirect = function (success, res, response) {
    if (success === false) {
      res.redirect(app_config.acl_url + "/error.html?success=failed&reason=" + response);
    } else {
      res.redirect(app_config.acl_url + "/error.html?success=true");
    }
  };

  /* Request device transfer */
  app.post("/api/transfer/request", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    transfer.request(owner, req.body, function (success, response) {
      transferResultRedirect(success, res, response);
    });
  });

  /* Decline device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/decline", function (req, res) {
    if (typeof (req.query.transfer_id) !== "undefined") {
      Util.respond(res, {
        success: false,
        status: "transfer_id missing"
      });
      return;
    }
    var body = {
      transfer_id: req.query.transfer_id,
      udids: []
    };
    transfer.decline(body, function (success, response) {
      transferResultRedirect(success, res, response);
    });
  });

  /* Decline selective device transfer */
  app.post("/api/transfer/decline", function (req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    if (typeof (req.body.transfer_id) !== "undefined") {
      Util.respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    if (typeof (sanitka.udid(req.body.udid)) !== "undefined") {
      Util.respond(res, {
        success: false,
        status: "udids_missing"
      });
      return;
    }

    if (typeof (req.body.owner) === "undefined") {
      Util.respond(res, {
        success: false,
        status: "owner_missing"
      });
      return;
    }

    var body = {
      transfer_id: req.body.transfer_id,
      udids: sanitka.udid(req.body.udid)
    };

    transfer.decline(body, function (success, response) {
      transferResultRedirect(success, response, res);
    });
  });

  /* Accept device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/accept", function (req, res) {

    if (typeof (req.query.transfer_id) === "undefined") {
      Util.respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    var body = {
      transfer_id: req.query.transfer_id,
      udids: []
    };

    // asyncCall
    transfer.accept(body, function (success, response) {
      transferResultRedirect(success, res, response);
    });
  });

  /* Accept selective device transfer */
  app.post("/api/transfer/accept", function (req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    if (typeof (sanitka.udid(req.body.transfer_id)) !== "undefined") {
      Util.respond(res, {
        success: false,
        status: "transfer_id_missing"
      });
      return;
    }

    if (typeof (sanitka.owner(req.body.owner)) === "undefined") {
      Util.respond(res, {
        success: false,
        status: "owner_missing"
      });
      return;
    }

    if (typeof (sanitka.udid(req.body.udid)) !== "undefined") {
      Util.respond(res, {
        success: false,
        status: "udids_missing"
      });
      return;
    }

    // asyncCall
    transfer.accept(req.body, function (success, response) {
      if (success === false) {
        console.log(response);
        res.redirect(app_config.acl_url + "/error.html?success=failed");
      } else {
        res.redirect(app_config.acl_url + "/error.html?success=true");
      }
    });
  }); 

};