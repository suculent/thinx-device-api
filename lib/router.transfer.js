// /api/v2/ Transfer


const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

const Globals = require("./thinx/globals");
const app_config = Globals.app_config(); // for public_url

module.exports = function (app) {

  // SEC-CSRF-05 / D-11: the transfer POSTs move devices between owner accounts.
  const csrf = require("./middleware/csrf")(app);

  const Transfer = require("../lib/thinx/transfer"); var transfer = new Transfer(app.messenger, app.redis_client);

  function transferResultRedirect(success, res, response) {

    if ((process.env.ENVIRONMENT === "test") || (process.env.ENVIRONMENT === "development")) {
      return Util.responder(res, success, response);
    }

    if (success === false) {
      res.redirect(app_config.public_url + "/error.html?success=failed&reason=" + response);
    } else {
      res.redirect(app_config.public_url + "/error.html?success=true");
    }
  }

  function requestTransfer(req, res) {
    if (!Util.validateSession(req)) return Util.failureResponse(res, 401, "invalid_request");
    let owner = sanitka.owner(req.session.owner);
    transfer.request(owner, req.body, (success, response) => {
      transferResultRedirect(success, res, response);
    });
  }

  function getDeclineTransfer(req, res) {
    
    if (!Util.isDefined(req.query)) return Util.failureResponse(res, 400, "query_missing");
    if (!Util.isDefined(req.query.transfer_id)) return Util.failureResponse(res, 400, "transfer_id_missing");

    transfer.decline({
      transfer_id: req.query.transfer_id,
      udids: []
    }, (success, response) => {
      transferResultRedirect(success, res, response);
    });
  }

  function postDeclineTransfer(req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    if (!Util.isDefined(req.body.transfer_id)) return Util.failureResponse(res, 400, "transfer_id_missing");
    if (!Util.isDefined(req.body.owner)) return Util.failureResponse(res, 400, "owner_missing");
    if (!Util.isDefined(req.body.udids)) return Util.failureResponse(res, 400, "udids_missing");

    // Bound to the recipient (quick 261004-l7q): the session owner, never a body field.
    transfer.decline({
      transfer_id: req.body.transfer_id,
      udids: sanitka.udid(req.body.udid)
    }, (success, response) => {
      transferResultRedirect(success, res, response);
    }, Util.ownerFromRequest(req));
  }

  function getAcceptTransfer(req, res) {

    if (!Util.isDefined(req.query.transfer_id)) return Util.failureResponse(res, 400, "transfer_id_missing");

    transfer.accept({
      transfer_id: req.query.transfer_id,
      udids: []
    }, (success, response) => {
      transferResultRedirect(success, res, response);
    });
  }

  function postAcceptTransfer(req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    const body = req.body;

    if (!Util.isDefined(body.transfer_id)) return Util.failureResponse(res, 400, "transfer_id_missing");
    if (!Util.isDefined(body.owner)) return Util.failureResponse(res, 400, "owner_missing");
    if (!Util.isDefined(body.udids)) return Util.failureResponse(res, 400, "udids_missing");

    // Bound to the recipient (quick 261004-l7q): the session owner, never body.owner.
    transfer.accept(body, (success, response) => {
      transferResultRedirect(success, res, response);
    }, Util.ownerFromRequest(req));
  }

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v2
  //

  app.post("/api/v2/transfer/request", csrf.verifyCsrfToken, function (req, res) {
    requestTransfer(req, res);
  });

  // e-mail capability link: transfer_id in the query, no cookie authority; not a CSRF target
  app.get("/api/v2/transfer/decline", function (req, res) {
    getDeclineTransfer(req, res);
  });

  app.post("/api/v2/transfer/decline", csrf.verifyCsrfToken, function (req, res) {
    postDeclineTransfer(req, res);
  });

  // e-mail capability link: transfer_id in the query, no cookie authority; not a CSRF target
  app.get("/api/v2/transfer/accept", function (req, res) {
    getAcceptTransfer(req, res);
  });

  app.post("/api/v2/transfer/accept", csrf.verifyCsrfToken, function (req, res) {
    postAcceptTransfer(req, res);
  });

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v1
  //

  /* Request device transfer */
  app.post("/api/transfer/request", csrf.verifyCsrfToken, function (req, res) {
    requestTransfer(req, res);
  });

  /* Decline device transfer (all by e-mail, selective will be POST) */
  // e-mail capability link: transfer_id in the query, no cookie authority; not a CSRF target
  app.get("/api/transfer/decline", function (req, res) {
    getDeclineTransfer(req, res);
  });

  /* Decline selective device transfer */
  app.post("/api/transfer/decline", csrf.verifyCsrfToken, function (req, res) {
    postDeclineTransfer(req, res);
  });

  /* Accept device transfer (all by e-mail, selective will be POST) */
  // e-mail capability link: transfer_id in the query, no cookie authority; not a CSRF target
  app.get("/api/transfer/accept", function (req, res) {
    getAcceptTransfer(req, res);
  });

  /* Accept selective device transfer */
  app.post("/api/transfer/accept", csrf.verifyCsrfToken, function (req, res) {
    postAcceptTransfer(req, res);
  });

};