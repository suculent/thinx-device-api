// /api/v2/ Device router


const Device = require("../lib/thinx/device");
const Devices = require("./thinx/devices");
const Util = require("./thinx/util");

module.exports = function (app) {

  var device = new Device();
  var devices = new Devices(app.messenger);

  ///////////////////////////////////////////////////////////////////////
  //
  // DEVICE ROUTES
  //

  // Devices v2

  /* List all devices for user. */
  app.get("/api/v2/device", function (req, res) {

    if (!Util.validateSession(req)) { res.status(401).end(); return; }

    let owner = Util.ownerFromRequest(req);

    devices.list(owner, (success, response) => {
      Util.responder(res, success, response);
    });
  });

  app.put("/api/v2/device", function (req, res) {

    if (!Util.validateSession(req)) { res.status(401).end(); return; }

    if (typeof (req.body) === "undefined") {
      res.status(400).end(); return;
    }

    if (typeof (req.body.changes) === "undefined") {
      res.status(400).end(); return;
    }

    device.edit(req.body.changes, (success, response) => {
      Util.responder(res, success, response);
    });
  });

  // Sources

  /* Attach code source to a device. Expects unique device identifier and source alias. */
  app.put("/api/v2/source/attach", function (req, res) {
    
    if (!Util.validateSession(req)) { res.status(401).end(); return; }

    let owner = Util.ownerFromRequest(req);

    devices.attach(owner, req.body, Util.responder, res);
  });

  /* Detach code source from a device. Expects unique device identifier. */
  app.put("/api/v2/source/detach", function (req, res) {
    
    if (!Util.validateSession(req)) { res.status(401).end(); return; }

    devices.detach(req.body, Util.responder, res);
  });

  // Mesh v2

  /* Attach device to a mesh. Expects unique mesh identifier and device id. */
  app.put("/api/v2/mesh/attach", function (req, res) {
    
    if (!Util.validateSession(req)) { res.status(401).end(); return; }

    // owner can be from session (JWT), or from body (Owner+APIKey auth)
    let owner = Util.ownerFromRequest(req);

    devices.attachMesh(owner, req.body, Util.responder, res);
  });

  /* Detach device from a mesh. Expects unique device identifier and unique mesh identifier. */
  app.put("/api/v2/mesh/detach", function (req, res) {
    
    if (!Util.validateSession(req)) { res.status(401).end(); return; }

    let owner = Util.ownerFromRequest(req);

    devices.detachMesh(owner, req.body, Util.responder, res);
  });

  /* Revokes a device. Expects unique device identifier. */
  app.delete("/api/v2/device", function (req, res) {
    
    if (!Util.validateSession(req)) { res.status(401).end(); return; }

    let owner = Util.ownerFromRequest(req);

    devices.revoke(owner, req.body, Util.responder, res);
  });

};