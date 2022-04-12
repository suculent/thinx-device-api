// /api/v2/ Device router


const Device = require("../lib/thinx/device");
const Devices = require("./thinx/devices");
const Util = require("./thinx/util");

const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

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

    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = Util.ownerFromRequest(req);

    devices.list(owner, (success, response) => {
      Util.responder(res, success, response);
    });
  });

  app.put("/api/v2/device", function (req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

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
    
    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = Util.ownerFromRequest(req);

    devices.attach(owner, req.body, Util.responder, res);
  });

  /* Detach code source from a device. Expects unique device identifier. */
  app.put("/api/v2/source/detach", function (req, res) {
    
    if (!Util.validateSession(req)) return res.status(401).end();

    devices.detach(req.body, Util.responder, res);
  });

  // Mesh v2

  /* Attach device to a mesh. Expects unique mesh identifier and device id. */
  app.put("/api/v2/mesh/attach", function (req, res) {
    
    if (!Util.validateSession(req)) return res.status(401).end();

    // owner can be from session (JWT), or from body (Owner+APIKey auth)
    let owner = Util.ownerFromRequest(req);

    devices.attachMesh(owner, req.body, Util.responder, res);
  });

  /* Detach device from a mesh. Expects unique device identifier and unique mesh identifier. */
  app.put("/api/v2/mesh/detach", function (req, res) {
    
    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = Util.ownerFromRequest(req);

    devices.detachMesh(owner, req.body, Util.responder, res);
  });

  /* Revokes a device. Expects unique device identifier. */
  app.delete("/api/v2/device", function (req, res) {
    
    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = Util.ownerFromRequest(req);

    devices.revoke(owner, req.body, Util.responder, res);
  });

  /*
   * Devices
   */

  /* List all devices for user. */
  app.get("/api/user/devices", function (req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    devices.list(req.session.owner, (_success, response) => {
      Util.respond(res, response);
    });
  });

  // Sources

  /* Attach code source to a device. Expects unique device identifier and source alias. */
  app.post("/api/device/attach", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    devices.attach(owner, body, Util.responder, res);
  });

  /* Detach code source from a device. Expects unique device identifier. */
  app.post("/api/device/detach", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    devices.detach(req.body, Util.responder, res);
  });

  // Mesh

  /* Attach device to a mesh. Expects unique mesh identifier and device id. */
  app.post("/api/device/mesh/attach", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    if ((typeof (owner) === "undefined") || (owner === null)) {
      owner = sanitka.owner(body.owner);
    }
    devices.attachMesh(owner, body, Util.responder, res);
  });

  /* Detach device from a mesh. Expects unique device identifier and unique mesh identifier. */
  app.post("/api/device/mesh/detach", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    if ((typeof (owner) === "undefined") || (owner === null)) {
      owner = sanitka.owner(body.owner);
    }
    devices.detachMesh(owner, body, Util.responder, res);
  });

  /* TEST ONLY! Get device data. */
  app.get("/api/device/data/:udid", function (req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    // Could be also authenticated using headers:
    // X-THX-Owner-ID:
    // X-THX-API-Key:

    let udid;

    // Test only
    if (typeof (req.params.udid) !== "undefined") {
      udid = req.params.udid;
    } else {
      Util.respond(res, {
        success: false,
        response: "missing_udid"
      });
      return;
    }

    if (typeof (app.messenger) !== "undefined") {
      app.messenger.data(req.session.owner, udid, (success, response) => {
        Util.respond(res, {
          success: success,
          response: response
        });
      });
    } else {
      Util.respond(res, {
        success: false,
        response: "messenger_not_available"
      });
    }

    // }); -- apikey
  });

  /* Post device data. */
  app.post("/api/device/data", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    var udid = sanitka.udid(req.body.udid);
    if ((owner === null) || (udid === null)) {
      res.status(403).end();
      return;
    }
    app.messenger.data(owner, udid, (success, response) => {
      Util.responder(res, success, response);
    });
  });

  /* Revokes a device. Expects unique device identifier. */
  app.post("/api/device/revoke", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    devices.revoke(req.session.owner, req.body, Util.responder, res);
  });

  /*
   * Device Configuration
   */

  /* Push configuration to one or more devices */
  app.post("/api/device/push", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    devices.push(owner, req.body, (push_success, push_response) => {
      Util.respond(res, {
        success: push_success,
        status: push_response
      });
    });
  });

  /*
   * Actionable Notifications
   */

  /* Respond to actionable notification */
  app.post("/api/device/notification", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    var device_id = sanitka.udid(req.body.udid);
    var reply = req.body.reply;
    if ((typeof (device_id) === "undefined") || (device_id == null)) {
      Util.respond(res, {
        success: false,
        status: "missing_udid"
      });
      return;
    }
    if ((typeof (reply) === "undefined") || (reply == null)) {
      Util.respond(res, {
        success: false,
        status: "missing_reply"
      });
      return;
    }
    app.messenger.publish(owner, device_id, JSON.stringify({
      nid: "nid:" + device_id,
      reply: reply
    }));
    Util.respond(res, {
      success: true,
      status: "published"
    });
  });

};