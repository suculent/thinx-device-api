/*
 * MessengerMasterDeviceWritesSpec — MQTT device writes without an open console.
 *
 * Device writes (registration and the status edit) used to run only in the per-owner MQTT
 * client, which the API creates when the owner's console websocket initialises the messenger.
 * With no console open, a device's status publish was stored nowhere and applied never.
 * Pinned behaviour:
 * - the master client subscribes to "/+/+/status" on every connect and, once the broker grants
 *   it, applies the status edit for any owner, console or not;
 * - while the master holds the subscription, a console client does not write the same message
 *   again; when the grant is refused or the master disconnects, console clients write as before;
 * - the master path ignores non-status topics and does nothing with the flag off;
 * - the master message listener is bound (message_callback no longer runs with mqtt.js as this).
 * Needs no Redis, CouchDB or broker; every fake answers synchronously.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const EventEmitter = require("events");
const expect = require("chai").expect;
const sha256 = require("sha256");

const Messenger = require("../../lib/thinx/messenger");

const FLAG = "THINX_MQTT_DEVICE_WRITES";
const OWNER_A = sha256("master-owner-a");
const UDID_A = "3a000001-a1a1-11f0-8000-00000000000a";
const statusTopic = (owner, udid) => "/" + owner + "/" + udid + "/status";
const json = (o) => Buffer.from(JSON.stringify(o));

function withFlag(flag, fn) {
  const saved = process.env[FLAG];
  if (flag === null) delete process.env[FLAG];
  else process.env[FLAG] = flag;
  try {
    return fn();
  } finally {
    if (typeof (saved) === "undefined") delete process.env[FLAG];
    else process.env[FLAG] = saved;
  }
}

function makeMessenger() {
  const rec = { edits: [], redisSets: 0 };
  const doc = { _id: UDID_A, udid: UDID_A, owner: OWNER_A, lastupdate: new Date(Date.now() - 3600000).toISOString(), transformers: [] };
  const m = Object.create(Messenger.prototype);
  m.DISABLE_SLACK = true;
  m.rtm = null;
  m.channel = null;
  m.clients = {};
  m.redis = {
    get(_key, cb) { cb(null, null); },
    set() { rec.redisSets++; },
    expire() { /* no-op */ }
  };
  m.akey = { checkTransferBinding(_c, _u, _k, _p, cb) { cb(null, false); } };
  m.devicelib = { get(id, cb) { if (id !== UDID_A) return cb(new Error("missing")); cb(null, JSON.parse(JSON.stringify(doc))); } };
  m.device = {
    edit(changes, cb) { rec.edits.push(JSON.parse(JSON.stringify(changes))); cb(true, { success: true }); }
  };
  m.publish = () => { /* never reached */ };
  return { m, rec };
}

// A fake mqtt.js client: an EventEmitter that records subscriptions and answers with `grant`.
function fakeClient(grantQos) {
  const client = new EventEmitter();
  client.subscriptions = [];
  client.subscribe = (topic, cb) => {
    client.subscriptions.push(topic);
    cb(null, [{ topic: topic, qos: grantQos }]);
  };
  return client;
}

describe("MessengerMasterDeviceWritesSpec", function () {

  beforeEach(() => {
    spyOn(console, "log");
  });

  it("subscribes the master to status topics and applies the status edit without a console", function () {
    const fx = makeMessenger();
    const client = fakeClient(0);
    fx.m.attachDeviceWriteSubscription(client);
    client.emit("connect");
    expect(client.subscriptions).to.deep.equal(["/+/+/status"]);
    expect(fx.m.masterAppliesDeviceWrites).to.equal(true);

    withFlag("1", () => {
      client.emit("message", statusTopic(OWNER_A, UDID_A), json({ status: "checked_in", rssi_dbm: -67 }));
    });
    expect(fx.rec.edits).to.deep.equal([{ rssi: -67, udid: UDID_A, status: "checked_in" }]);
  });

  it("writes validated rssi and location with the status and drops invalid telemetry", function () {
    const fx = makeMessenger();
    const client = fakeClient(0);
    fx.m.attachDeviceWriteSubscription(client);
    client.emit("connect");
    withFlag("1", () => {
      client.emit("message", statusTopic(OWNER_A, UDID_A), json({ status: "checked_in", rssi_dbm: -71, gnss: { fix: true, lat: 50.088, lon: 14.421 }, owner: "x" }));
      client.emit("message", statusTopic(OWNER_A, UDID_A), json({ status: "checked_in", rssi_dbm: 400, gnss: { fix: true, lat: 0, lon: 0 } }));
    });
    expect(fx.rec.edits).to.deep.equal([
      { rssi: -71, lat: 50.088, lon: 14.421, udid: UDID_A, status: "checked_in" },
      { udid: UDID_A, status: "checked_in" }
    ]);
  });

  it("does not let a console client write the same message twice while the master holds the subscription", function () {
    const fx = makeMessenger();
    const client = fakeClient(0);
    fx.m.attachDeviceWriteSubscription(client);
    client.emit("connect");
    withFlag("1", () => {
      fx.m.messageResponder(statusTopic(OWNER_A, UDID_A), json({ status: "checked_in" }));
    });
    expect(fx.rec.edits).to.deep.equal([]);
  });

  it("keeps console clients writing when the grant is refused or the master disconnects", function () {
    const refused = makeMessenger();
    const refusedClient = fakeClient(128);
    refused.m.attachDeviceWriteSubscription(refusedClient);
    refusedClient.emit("connect");
    expect(refused.m.masterAppliesDeviceWrites).to.equal(false);
    withFlag("1", () => {
      refused.m.messageResponder(statusTopic(OWNER_A, UDID_A), json({ status: "online" }));
    });
    expect(refused.rec.edits).to.deep.equal([{ udid: UDID_A, status: "online" }]);

    const closed = makeMessenger();
    const closedClient = fakeClient(0);
    closed.m.attachDeviceWriteSubscription(closedClient);
    closedClient.emit("connect");
    closedClient.emit("close");
    expect(closed.m.masterAppliesDeviceWrites).to.equal(false);
    withFlag("1", () => {
      closed.m.messageResponder(statusTopic(OWNER_A, UDID_A), json({ status: "online" }));
    });
    expect(closed.rec.edits).to.deep.equal([{ udid: UDID_A, status: "online" }]);
  });

  it("ignores non-status topics and does nothing with the flag off", function () {
    const fx = makeMessenger();
    const client = fakeClient(0);
    fx.m.attachDeviceWriteSubscription(client);
    client.emit("connect");
    withFlag("1", () => {
      client.emit("message", "/" + OWNER_A + "/" + UDID_A, json({ status: "checked_in" }));
    });
    withFlag(null, () => {
      client.emit("message", statusTopic(OWNER_A, UDID_A), json({ status: "checked_in" }));
    });
    expect(fx.rec.edits).to.deep.equal([]);
  });

  it("binds the master message listener so message_callback sees the Messenger", function () {
    const fx = makeMessenger();
    const client = fakeClient(0);
    fx.m.master = client;
    fx.m.attach_callbacks();
    withFlag(null, () => {
      expect(() => client.emit("message", statusTopic(OWNER_A, UDID_A), json({ status: "checked_in" }))).not.to.throw();
    });
    expect(fx.rec.redisSets).to.equal(1);
  });
});
