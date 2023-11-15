// /api/v2/ Transfer


const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

const Globals = require("./thinx/globals");
const app_config = Globals.app_config(); // for public_url

module.exports = function (app) {

  const Transfer = require("../lib/thinx/transfer"); var transfer = new Transfer(app.messenger, app.redis_client);

  function transferResultRedirect(success, res, response) {

    /*
    if ((process.env.ENVIRONMENT === "test") || (process.env.ENVIRONMENT === "development")) {
      return Util.responder(res, success, response);
    }
    */

    if (success === false) {
      res.redirect(app_config.public_url + "/error.html?success=failed&reason=" + response);
    } else {
      res.redirect(app_config.public_url + "/error.html?success=true");
    }
  }

  async function requestTransfer(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    
    let response = await transfer.request(owner, req.body).catch( (error) => {
      return transferResultRedirect(false, res, error);
    });

    transferResultRedirect(true, res, response);
  }

  async function getDeclineTransfer(req, res) {
    
    if (!Util.isDefined(sanitka.udid(req.body.transfer_id))) return Util.responder(res, false, "transfer_id_missing");

    var body = {
      transfer_id: req.query.transfer_id,
      udids: []
    };

    let response = await transfer.decline(body).catch((response)=> {
      transferResultRedirect(false, res, response);
    });

    transferResultRedirect(true, res, response);
  }

  async function postDeclineTransfer(req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    if (!Util.isDefined(sanitka.udid(req.body.transfer_id))) return Util.responder(res, false, "transfer_id_missing");
    if (!Util.isDefined(sanitka.owner(req.body.owner))) return Util.responder(res, false, "owner_missing");
    if (!Util.isDefined(req.body.udids)) return Util.responder(res, false, "udids_missing");

    var body = {
      transfer_id: req.body.transfer_id,
      udids: sanitka.udid(req.body.udid)
    };

    await transfer.decline(body).catch((response) => {
      transferResultRedirect(false, res, response);
    });

    transferResultRedirect(true, res, response);
  }

  async function getAcceptTransfer(req, res) {
    
    if (!Util.isDefined(req.query.transfer_id)) return Util.responder(res, false, "transfer_id_missing");
    
    let response = transfer.accept({
      transfer_id: req.query.transfer_id,
      udids: []
    }).catch((error) => {
      return transferResultRedirect(false, res, error);
    });

    transferResultRedirect(true, res, response);
  }

  async function postAcceptTransfer(req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();
    if (!Util.isDefined(req.body)) return Util.responder(res, false, "transfer_body_missing");

    const body = req.body;

    if (!Util.isDefined(sanitka.udid(body.transfer_id))) return Util.responder(res, false, "transfer_id_missing");
    if (!Util.isDefined(sanitka.owner(body.owner))) return Util.responder(res, false, "owner_missing");
    if (!Util.isDefined(body.udids)) return Util.responder(res, false, "udids_missing");

    console.log("🔨 [debug] <postAcceptTransfer> with body: ", {body});

    await transfer.accept(body).catch((response) => {
      console.log("postAcceptTransfer response", response);
      res.redirect(app_config.public_url + "/error.html?success=failed");
    });

    res.redirect(app_config.public_url + "/error.html?success=true");
  }

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v2
  //

  app.post("/api/v2/transfer/request", async function (req, res) {
    await requestTransfer(req, res);
  });

  app.get("/api/v2/transfer/decline", async function (req, res) {
    await getDeclineTransfer(req, res);
  });

  app.post("/api/v2/transfer/decline", async function (req, res) {
    await postDeclineTransfer(req, res);
  });

  app.get("/api/v2/transfer/accept", async function (req, res) {
    await getAcceptTransfer(req, res);
  });

  app.post("/api/v2/transfer/accept", async function (req, res) {
    await postAcceptTransfer(req, res);
  });

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v1
  //

  /* Request device transfer */
  app.post("/api/transfer/request", async function (req, res) {
    await requestTransfer(req, res);
  });

  /* Decline device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/decline", async function (req, res) {
    await getDeclineTransfer(req, res);
  });

  /* Decline selective device transfer */
  app.post("/api/transfer/decline", async function (req, res) {
    await postDeclineTransfer(req, res);
  });

  /* Accept device transfer (all by e-mail, selective will be POST) */
  app.get("/api/transfer/accept", async function (req, res) {
    await getAcceptTransfer(req, res);
  });

  /* Accept selective device transfer */
  app.post("/api/transfer/accept", async function (req, res) {
    await postAcceptTransfer(req, res);
  });

};