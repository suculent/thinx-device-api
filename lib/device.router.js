// /api/v2/ Device router

const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

module.exports = function (app) {

  var Devices = require("../lib/thinx/devices");
  var devices = new Devices(app.messenger);

  ///////////////////////////////////////////////////////////////////////
  //
  // DEVICE ROUTES
  //

  /*
   * Devices
   */

  /* List all devices for user. */
  app.get("/api/v2/device", function (req, res) {

    // This endpoint must have valid authentication that has been already checked in /*
    if (!validateSession(req)) {
      res.status(401).end();
      return;
    }

    devices.list(req.session.owner, (success, response) => {
      respond(res, response);
    });
  });

  // Sources

  /* Attach code source to a device. Expects unique device identifier and source alias. */
  app.put("/api/v2/source/attach", function (req, res) {
    if (!validateSession(req)) {
      res.status(401).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    devices.attach(owner, body, responder, res);
  });

  /* Detach code source from a device. Expects unique device identifier. */
  app.put("/api/v2/source/detach", function (req, res) {
    if (!validateSession(req)) {
      res.status(401).end();
      return;
    }
    devices.detach(req.body, responder, res);
  });

  // Mesh

  /* Attach device to a mesh. Expects unique mesh identifier and device id. */
  app.put("/api/v2/mesh/attach", function (req, res) {
    if (!validateSession(req)) {
      res.status(401).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    if ((typeof (owner) === "undefined") || (owner === null)) {
      owner = sanitka.owner(body.owner);
    }
    devices.attachMesh(owner, body, responder, res);
  });

  /* Detach device from a mesh. Expects unique device identifier and unique mesh identifier. */
  app.put("/api/v2/mesh/detach", function (req, res) {
    if (!validateSession(req)) {
      res.status(401).end();
      return;
    }
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    if ((typeof (owner) === "undefined") || (owner === null)) {
      owner = body.owner;
    }
    devices.detachMesh(owner, body, (success, status) => {
      respond(res, {
        success: success,
        status: status
      });
    });
  });

  /* Revokes a device. Expects unique device identifier. */
  app.delete("/api/v2/device", function (req, res) {
    if (!validateSession(req)) {
      res.status(401).end();
      return;
    }
    devices.revoke(req.session.owner, req.body, responder, res);
  });

};