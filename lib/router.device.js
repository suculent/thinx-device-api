// /api/v2/ Device + Transformer router

const Device = require("../lib/thinx/device");
const Devices = require("./thinx/devices");
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka");

module.exports = function (app) {

  var sanitka = new Sanitka();
  var device = new Device();
  var devices = new Devices(app.messenger);

  function listDevices(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    devices.list(req.session.owner, (_success, response) => {
      Util.respond(res, response);
    });
  }

  function editDevice(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    if (!Util.isDefined(req.body)) return Util.responder(res, false, "missing_body");
    if (!Util.isDefined(req.body.changes)) return Util.responder(res, false, "missing_changes");
    let changes = req.body.changes;
    // Manually fixes wronte device docs, regardless why it happens(!)
    if (Util.isDefined(changes.doc)) changes.doc = null;
    if (Util.isDefined(changes.value)) changes.value = null;
    device.edit(changes, (success, message) => {
      Util.respond(res, {
        success: success,
        message: message
      });
    });
  }

  function getDeviceDetail(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    if (!Util.isDefined(req.body)) return res.status(400).end();
    if (!Util.isDefined(req.body.udid)) return res.status(400).end();
    let udid = sanitka.udid(req.body.udid);
    if (udid === null) res.status(403).end();
    device.detail(udid, (_success, response) => {
      Util.respond(res, response);
    });
  }

  function setDeviceEnvs(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    if (!Util.isDefined(req.body)) return res.status(400).end();
    if (!Util.isDefined(req.body.udid)) return res.status(400).end();
    let udid = sanitka.udid(req.body.udid);
    if (udid === null) return res.status(403).end();
    device.envs(udid, (_success, response) => {
      Util.respond(res, response);
    });
  }

  function deleteDevice(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = Util.ownerFromRequest(req);
    devices.revoke(owner, req.body, Util.responder, res);
  }


  // Messaging

  function publishNotification(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    var device_id = sanitka.udid(req.body.udid);
    var reply = req.body.reply;
    if (!Util.isDefined(device_id)) return Util.responder(res, false, "missing_udid");
    if (!Util.isDefined(reply)) return Util.responder(res, false, "missing_reply");
    app.messenger.publish(owner, device_id, JSON.stringify({
      nid: "nid:" + device_id,
      reply: reply
    }));
    return Util.responder(res, true, "published");
  }

  function pushConfiguration(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    devices.push(owner, req.body, (push_success, push_response) => {
      Util.respond(res, {
        success: push_success,
        status: push_response
      });
    });
  }

  function getMessengerData(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    var udid = sanitka.udid(req.body.udid);
    if ((owner === null) || (udid === null)) return res.status(403).end();
    app.messenger.data(owner, udid, (success, response) => {
      Util.responder(res, success, response);
    });
  }

  // Sources

  function detachSource(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    devices.detach(req.body, Util.responder, res);
  }

  function attachSource(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = Util.ownerFromRequest(req);
    devices.attach(owner, req.body, Util.responder, res);
  }

  // Meshes

  function attachMesh(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    var body = req.body;
    if (!Util.isDefined(owner)) owner = sanitka.owner(body.owner);
    devices.attachMesh(owner, body, Util.responder, res);
  }

  function detachMesh(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = Util.ownerFromRequest(req);
    devices.detachMesh(owner, req.body, Util.responder, res);
  }

  // Transformers

  function runTransformer(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    if (!Util.isDefined(owner)) return Util.responder(res, false, "owner_not_found");
    let udid = sanitka.udid(req.body.device_id);
    if (!Util.isDefined(udid)) return Util.responder(res, false, "udid_not_found");
    device.run_transformers(udid, owner, Util.responder, res);
  }

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v2
  //

  // Devices v2

  /* List all devices for user. */
  app.get("/api/v2/device", function (req, res) {
    listDevices(req, res);
  });

  app.put("/api/v2/device", function (req, res) {
    editDevice(req, res);
  });

  app.post("/api/v2/device", function (req, res) {
    getDeviceDetail(req, res);
  });

  // Sources

  /* Attach code source to a device. Expects unique device identifier and source alias. */
  app.put("/api/v2/source/attach", function (req, res) {
    attachSource(req, res);
  });

  /* Detach code source from a device. Expects unique device identifier. */
  app.put("/api/v2/source/detach", function (req, res) {
    detachSource(req, res);
  });

  // Mesh

  /* Attach device to a mesh. Expects unique mesh identifier and device id. */
  app.put("/api/v2/mesh/attach", function (req, res) {
    attachMesh(req, res);
  });

  /* Detach device from a mesh. Expects unique device identifier and unique mesh identifier. */
  app.put("/api/v2/mesh/detach", function (req, res) {
    detachMesh(req, res);
  });

  /* Revokes a device. Expects unique device identifier. */
  app.delete("/api/v2/device", function (req, res) {
    deleteDevice(req, res);
  });

  // Push/Config

  app.post("/api/v2/device/configuration", function (req, res) {
    pushConfiguration(req, res);
  });

  app.post("/api/v2/device/notification", function (req, res) {
    publishNotification(req, res);
  });

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v1
  //

  // Devices

  /* List all devices for user. */
  app.get("/api/user/devices", function (req, res) {
    listDevices(req, res);
  });

  app.post("/api/device/envs", function (req, res) {
    setDeviceEnvs(req, res);
  });

  app.post("/api/device/detail", function (req, res) {
    getDeviceDetail(req, res);
  });

  app.post("/api/device/edit", function (req, res) {
    editDevice(req, res);
  });

  app.post("/api/device/revoke", function (req, res) {
    deleteDevice(req, res);
  });

  // Sources

  /* Attach code source to a device. Expects unique device identifier and source alias. */
  app.post("/api/device/attach", function (req, res) {
    attachSource(req, res);
  });

  /* Detach code source from a device. Expects unique device identifier. */
  app.post("/api/device/detach", function (req, res) {
    detachSource(req, res);
  });

  // Mesh

  /* Attach device to a mesh. Expects unique mesh identifier and device id. */
  app.post("/api/device/mesh/attach", function (req, res) {
    attachMesh(req, res);
  });

  /* Detach device from a mesh. Expects unique device identifier and unique mesh identifier. */
  app.post("/api/device/mesh/detach", function (req, res) {
    detachMesh(req, res);
  });

  // Messaging

  app.post("/api/device/data", function (req, res) {
    getMessengerData(req, res);
  });

  app.post("/api/device/push", function (req, res) {
    pushConfiguration(req, res);
  });

  app.post("/api/device/notification", function (req, res) {
    publishNotification(req, res);
  });

  // Transformer

  app.post("/api/transformer/run", function (req, res) {
    runTransformer(req, res);
  });


  /* TEST ONLY! Get device data. */
  app.get("/api/device/data/:udid", function (req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let udid;
    if (Util.isDefined(req.params.udid)) {
      udid = req.params.udid;
    } else {
      return Util.responder(res, false, "missing_udid");
    }
    if (Util.isDefined(app.messenger)) {
      app.messenger.data(req.session.owner, udid, (success, response) => {
        Util.responder(res, success, response);
      });
    } else {
      Util.responder(res, false, "messenger_not_available");
    }
  });
};