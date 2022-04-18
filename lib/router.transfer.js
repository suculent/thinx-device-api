// /api/v2/ Transfer


const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

const Globals = require("./thinx/globals");
const app_config = Globals.app_config();

module.exports = function (app) {

  const Transfer = require("../lib/thinx/transfer"); var transfer = new Transfer(app.messenger);

  function transferResultRedirect(success, res, response) {
    if (success === false) {
      res.redirect(app_config.acl_url + "/error.html?success=failed&reason=" + response);
    } else {
      res.redirect(app_config.acl_url + "/error.html?success=true");
    }
  }

  function requestTransfer(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    transfer.request(owner, req.body, function (success, response) {
      transferResultRedirect(success, res, response);
    });
  }

  function getDeclineTransfer(req, res) {
    if (typeof (req.query.transfer_id) !== "undefined") return Util.failureResponse(res, 401, "transfer_id_missing");
    var body = {
      transfer_id: req.query.transfer_id,
      udids: []
    };
    transfer.decline(body, function (success, response) {
      transferResultRedirect(success, res, response);
    });
  }

  function postDeclineTransfer(req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    if (typeof (req.body.transfer_id) !== "undefined") return Util.failureResponse(res, 401, "transfer_id_missing");
    if (typeof (sanitka.udid(req.body.udid)) !== "undefined") return Util.failureResponse(res, 401, "udids_missing");
    if (typeof (req.body.owner) === "undefined") return Util.failureResponse(res, 401, "owner_missing");

    var body = {
      transfer_id: req.body.transfer_id,
      udids: sanitka.udid(req.body.udid)
    };

    transfer.decline(body, function (success, response) {
      transferResultRedirect(success, res, response);
    });
  }

  function getAcceptTransfer(req, res) {
    if (typeof (req.query.transfer_id) === "undefined") return Util.responder(res, false, "transfer_id_missing");
    transfer.accept({
      transfer_id: req.query.transfer_id,
      udids: []
    },
      function (success, response) {
        transferResultRedirect(success, res, response);
    });
  }

  function postAcceptTransfer(req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    if (typeof (sanitka.udid(req.body.transfer_id)) !== "undefined") return Util.responder(res, false, "transfer_id_missing");
    if (typeof (sanitka.owner(req.body.owner)) === "undefined") return Util.responder(res, false, "owner_missing");
    if (typeof (sanitka.udid(req.body.udid)) !== "undefined") return Util.responder(res, false, "udids_missing");

    transfer.accept(req.body, function (success, response) {
      if (success === false) {
        console.log(response);
        res.redirect(app_config.acl_url + "/error.html?success=failed");
      } else {
        res.redirect(app_config.acl_url + "/error.html?success=true");
      }
    });
  }


  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v2
  //

  app.post("/api/v2/transfer/request", function (req, res) {
    requestTransfer(req, res);
  });

  app.get("/api/v2/transfer/decline", function (req, res) {
    getDeclineTransfer(req, res);
  });

  app.post("/api/v2/transfer/decline", function (req, res) {
    postDeclineTransfer(req, res);
  });

  app.get("/api/v2/transfer/accept", function (req, res) {
    getAcceptTransfer(req, res);
  });

  app.post("/api/v2/transfer/accept", function (req, res) {
    postAcceptTransfer(req, res);
  });

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v1
  //

  /* Request device transfer */
  app.post("/api/transfer/request", function (req, res) {
    requestTransfer(req, res);
  });

  /* Decline device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/decline", function (req, res) {
    getDeclineTransfer(req, res);
  });

  /* Decline selective device transfer */
  app.post("/api/transfer/decline", function (req, res) {
    postDeclineTransfer(req, res);
  });

  /* Accept device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/accept", function (req, res) {
    getAcceptTransfer(req, res);
  });

  /* Accept selective device transfer */
  app.post("/api/transfer/accept", function (req, res) {
    postAcceptTransfer(req, res);
  });

};