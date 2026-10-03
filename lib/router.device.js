// /api/v2/ Device + Transformer router

const Util = require("./thinx/util"); // only class methods
const Sanitka = require("./thinx/sanitka");
const Devices = require("./thinx/devices");

module.exports = function (app) {

  const devices = new Devices(app.messenger, app.redis_client);
  
  const device = app.device;

  let sanitka = new Sanitka(); // only class methods (should be refactored)

  /*
   * One ownership gate for every udid-keyed handler (quick 261003-t29). The owner is the
   * authenticated one (session, router-verified Bearer or API key, via
   * Util.ownerFromRequest), never a request-body field. A device the caller does not own
   * answers exactly like a missing one: HTTP 200 {"success":false,"response":"no_such_device"},
   * before any library, messenger or database write is reached.
   */
  function withOwnedDevice(req, res, udid, onOwned) {
    const owner = Util.ownerFromRequest(req);
    device.fetchOwned(udid, owner, (owned, result) => {
      if (!owned) return Util.responder(res, false, result);
      onOwned(owner, result);
    });
  }

  function editDevice(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    if (!Util.isDefined(req.body)) return Util.responder(res, false, "missing_body");
    if (!Util.isDefined(req.body.changes)) return Util.responder(res, false, "missing_changes");
    let changes = req.body.changes;
    if ((typeof (changes.udid) === "undefined") || (changes.udid === null)) return Util.responder(res, false, "changes.udid_undefined");
    // Manually fixes wronte device docs, regardless why it happens(!)
    if (Util.isDefined(changes.doc)) changes.doc = null;
    if (Util.isDefined(changes.value)) changes.value = null;
    // The CouchDB `modify` handler copies every field; ownership changes only through a transfer.
    delete changes.owner;
    delete changes.previous_owner;
    withOwnedDevice(req, res, changes.udid, () => {
      device.edit(changes, (success, message) => {
        Util.responder(res, success, message);
      });
    });
  }

  function getDeviceDetail(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    if (!Util.isDefined(req.body)) return res.status(400).end();
    if (!Util.isDefined(req.body.udid)) return res.status(400).end();
    let udid = sanitka.udid(req.body.udid);
    if (udid === null) return res.status(403).end();
    withOwnedDevice(req, res, udid, () => {
      device.detail(udid, (_success, response) => {
        Util.respond(res, response);
      });
    });
  }

  function setDeviceEnvs(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    if (!Util.isDefined(req.body)) return res.status(400).end();
    if (!Util.isDefined(req.body.udid)) return res.status(400).end();
    let udid = sanitka.udid(req.body.udid);
    if (udid === null) return res.status(403).end();
    withOwnedDevice(req, res, udid, () => {
      device.envs(udid, (_success, response) => {
        Util.respond(res, response);
      });
    });
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

  //
  // Public
  //

  function listDevices(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    devices.list(req.session.owner, (_success, response) => {
      Util.respond(res, response);
    });
  }

  function deleteDevice(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = Util.ownerFromRequest(req);
    devices.revoke(owner, req.body, Util.responder, res);
  }

  // Batch: publishes only to the caller's own devices; foreign and unknown udids are dropped.
  function pushConfiguration(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    const owner = Util.ownerFromRequest(req);
    const body = req.body || {};
    if ((typeof (body.udid) === "undefined") && (typeof (body.udids) === "undefined")) {
      return devices.push(owner, body, (push_success, push_response) => {
        Util.responder(res, push_success, push_response);
      });
    }
    let requested;
    if (typeof (body.udids) !== "undefined") {
      requested = Array.isArray(body.udids) ? body.udids : [];
    } else {
      requested = (typeof (body.udid) === "string") ? [body.udid] : [];
    }
    device.filterOwned(owner, requested, (owned) => {
      if (owned.length === 0) return Util.responder(res, false, "no_such_device");
      const scoped = Object.assign({}, body);
      delete scoped.udid;
      scoped.udids = owned;
      devices.push(owner, scoped, (push_success, push_response) => {
        Util.responder(res, push_success, push_response);
      });
    });
  }

  // Sources

  function detachSource(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    const body = req.body;
    if (typeof (body) === "undefined") return Util.responder(res, false, "missing_body");
    if (typeof (body.udid) === "undefined") return Util.responder(res, false, "missing_udid");
    withOwnedDevice(req, res, body.udid, () => {
      devices.detach(body, Util.responder, res);
    });
  }

  function attachSource(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    const body = req.body || {};
    if (!body.source_id) return Util.responder(res, false, "missing_source_id");
    if (!body.udid) return Util.responder(res, false, "missing_udid");
    withOwnedDevice(req, res, body.udid, (owner) => {
      devices.attach(owner, body, Util.responder, res);
    });
  }

  // Meshes

  function attachMesh(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    // Authenticated owner only; a request-supplied owner never selects it (261003-skk).
    const body = req.body;
    if (!Util.isDefined(body)) return Util.responder(res, false, "missing_body");
    if (!Util.isDefined(body.mesh_id)) return Util.responder(res, false, "missing_mesh_id");
    if (!Util.isDefined(body.udid)) return Util.responder(res, false, "missing_udid");
    withOwnedDevice(req, res, body.udid, (owner) => {
      devices.attachMesh(owner, body, Util.responder, res);
    });
  }

  function detachMesh(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    const body = req.body;
    if (!Util.isDefined(body)) return Util.responder(res, false, "missing_body");
    if (!Util.isDefined(body.mesh_id)) return Util.responder(res, false, "missing_mesh_id");
    if (!Util.isDefined(body.udid)) return Util.responder(res, false, "missing_udid");
    withOwnedDevice(req, res, body.udid, (owner) => {
      devices.detachMesh(owner, body, Util.responder, res);
    });
  }

  // Messaging

  function publishNotification(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    const body = req.body || {};
    let device_id = sanitka.udid(body.udid);
    let reply = body.reply;
    if (!Util.isDefined(device_id)) return Util.responder(res, false, "missing_udid");
    if (!Util.isDefined(reply)) return Util.responder(res, false, "missing_reply");
    withOwnedDevice(req, res, device_id, (owner) => {
      app.messenger.publish(owner, device_id, JSON.stringify({
        nid: "nid:" + device_id,
        reply: reply
      }));
      Util.responder(res, true, "published");
    });
  }

  function getMessengerData(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    const body = req.body || {};
    let udid = sanitka.udid(body.udid);
    if (udid === null) return res.status(403).end();
    withOwnedDevice(req, res, udid, (owner) => {
      app.messenger.data(owner, udid, (success, response) => {
        Util.responder(res, success, response);
      });
    });
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
    const udid = sanitka.udid(req.params.udid);
    if (udid === null) return Util.responder(res, false, "missing_udid");
    if (!Util.isDefined(app.messenger)) return Util.responder(res, false, "messenger_not_available");
    withOwnedDevice(req, res, udid, (owner) => {
      app.messenger.data(owner, udid, (success, response) => {
        Util.responder(res, success, response);
      });
    });
  });
};