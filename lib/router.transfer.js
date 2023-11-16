// /api/v2/ Transfer


const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

const Globals = require("./thinx/globals");
const app_config = Globals.app_config(); // for public_url

module.exports = function (app) {

  const Transfer = require("../lib/thinx/transfer"); var transfer = new Transfer(app.messenger, app.redis_client);

  function transferResultRedirect(success, res, response) {

    /*
    // solves `Headers already set` issue?
    if ((process.env.ENVIRONMENT === "test") || (process.env.ENVIRONMENT === "development")) {
      return Promise.resolve(response);
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
    const body = req.body;
    
    return await transfer.request(owner, body).catch( (error) => {
      console.log("[requestTransfer] await transfer.request with error", error.message, "with  body", {body});
      transferResultRedirect(false, res, error);
    }).then((value) => {
      console.log("[requestTransfer] then()...", value);
      transferResultRedirect(true, res);
    });
  }

  async function getDeclineTransfer(req, res) {
    
    if (!Util.isDefined(sanitka.udid(req.body.transfer_id))) return Util.responder(res, false, "transfer_id_missing");

    var body = {
      transfer_id: req.query.transfer_id,
      udids: []
    };

    let response = await transfer.decline(body).catch((response) => {
      transferResultRedirect(false, res, response);
    });

    console.log("[getDeclineTransfer] transfer.decline response", response);

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

    let response = await transfer.decline(body).catch((error) => {
      transferResultRedirect(false, res, error);
    });

    console.log("[getDeclineTransfer] transfer.decline response", response);

    transferResultRedirect(true, res);
  }

  // called from e-mail to accept a transfer ID
  async function getAcceptTransfer(req, res) {

    let transfer_id = req.query.transfer_id;
    
    if (!Util.isDefined(transfer_id)) {
      console.log("[warning] Transfer ID missing in getAcceptTransfer query", req.query);
      return Util.responder(res, false, "transfer_id_missing");
    }
    
    let response = await transfer.accept({
      transfer_id: transfer_id,
      udids: []
    }).catch((error) => {
      console.log("[getAcceptTransfer] failed with error", error.message);
      transferResultRedirect(false, res, error);
    });

    console.log("[debug] getAcceptTransfer response", response);

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
      console.log("[debug] postAcceptTransfer response", response);
      res.redirect(app_config.public_url + "/error.html?success=failed");
    }).then(() => {
      res.redirect(app_config.public_url + "/error.html?success=true");
    });
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