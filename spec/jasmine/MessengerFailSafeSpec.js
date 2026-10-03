/*
 * MessengerFailSafeSpec — quick 261003-w0c: the MQTT message handler never throws, and the code
 * paths a non-throwing handler starts reaching in production cannot damage data.
 *
 * Pinned behaviour:
 * - forwardNonNotification forwards to Slack only with a real client (rtm with a sendMessage
 *   function) and a non-empty channel; a synchronous throw or a rejected promise from sendMessage
 *   never escapes; ENVIRONMENT=test still never forwards;
 * - messageResponder never throws: a synchronous exception produces at most one rate-limited
 *   line carrying a reason code (handler_error_<ErrorName>) and a sanitized udid only;
 * - payloads that do not parse to a plain JSON object are dropped as malformed_payload before
 *   any CouchDB, Redis, key or socket call;
 * - MQTT device writes (registration and the status edit) are off unless THINX_MQTT_DEVICE_WRITES
 *   is exactly "1" (default: unset, so off); MQTT-triggered transformers never run; unknown-shape
 *   messages are not relayed to the console;
 * - the actionable response branch never throws on an absent or unparseable nid:<nid>;
 * - a real mqtt.js client wired like setupMqttClient keeps delivering after the message that
 *   used to kill its packet pump.
 *
 * Why ENVIRONMENT is set to "production" per case: the original bug (rtm null, typeof null is
 * "object") only fired outside ENVIRONMENT=test, so CI never saw it. Every case sets it and
 * afterEach restores it exactly, because CI runs all specs in one process.
 *
 * Needs no Redis, CouchDB or broker: the Messenger is Object.create(Messenger.prototype) with
 * recording fakes (the fixture conventions of quick 261003-vbg and 261003-vn3), and the e2e case
 * runs a real mqtt.js MqttClient on an in-memory Duplex stream.
 *
 * Nothing here prints a payload, an owner id or a key: failures report counts and booleans.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require("chai").expect;
const sha256 = require("sha256");
const EventEmitter = require("events");
const stream = require("stream");
const mqtt = require("mqtt");

const Messenger = require("../../lib/thinx/messenger");

// Spec constants (hard-coded on purpose: the spec pins the texts).
const FLAG = "THINX_MQTT_DEVICE_WRITES";
const HANDLER_ERROR_TYPEERROR = /dropped MQTT device message: handler_error_TypeError/;
const HANDLER_ERROR = /dropped MQTT device message: handler_error_/;
const MALFORMED_PAYLOAD = /malformed_payload/;
const TRANSFORMERS_DISABLED = /MQTT-triggered transformers are disabled/;
const UNKNOWN_NOT_RELAYED = /unknown shape are not relayed/;
const DROP_LINE = /\[messenger\] dropped MQTT device message/;

const OWNER_A = sha256("w0c-owner-a");
const OWNER_B = sha256("w0c-owner-b");

const UDID_A = "0e0c0001-a1a1-11f0-8000-00000000000a";
const UDID_B = "0e0c0002-a1a1-11f0-8000-00000000000b";

const ALIAS_A = "w0c-alias-a";
const SENTINEL = "w0c-payload-sentinel";
const CHANNEL = "C0W0C";

// The firmware's own LWT and update notice, byte for byte (THiNXLib.cpp).
const LWT = "{ \"status\" : \"disconnected\" }";
const UPDATE_SUCCESSFUL = "{ title: \"Update Successful\", body: \"The device has been successfully updated.\", type: \"success\" }";

const REGISTRATION = { registration: { udid: UDID_A, owner: OWNER_A, mac: "AA:BB:CC:00:00:01", firmware: "w0c" } };

class FakeSocket extends EventEmitter {
  constructor(owner) {
    super();
    this.owner = owner;
    this.readyState = 1;
    this.sent = [];
  }
  send(d) {
    this.sent.push(String(d));
  }
}

function frames(sock) {
  return sock.sent.map((s) => JSON.parse(s));
}

function captureConsole() {
  const lines = [];
  const record = (...args) => {
    lines.push(args.map((a) => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch (_e) { return String(a); }
    }).join(" "));
  };
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    spyOn(console, level).and.callFake(record);
  }
  return lines;
}

function count(lines, re) {
  return lines.filter((l) => re.test(l)).length;
}

function mentions(lines, needle) {
  return lines.some((l) => l.indexOf(needle) !== -1);
}

async function flush() {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitFor(fn, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (fn()) return true;
    await sleep(20);
  }
  return !!fn();
}

function makeMessenger() {
  const rec = {
    devicelibGets: [], edits: [], registers: [], publishes: [], profiles: [], transformers: [],
    createMqttKeys: [], akeyCalls: [], redisGets: [], redisSets: []
  };
  const store = new Map();
  const docs = {
    [UDID_A]: { _id: UDID_A, udid: UDID_A, owner: OWNER_A, alias: ALIAS_A, transformers: [] },
    [UDID_B]: { _id: UDID_B, udid: UDID_B, owner: OWNER_B, alias: "w0c-alias-b", transformers: [] }
  };

  const m = Object.create(Messenger.prototype);
  // createInstance's state
  m.DISABLE_SLACK = true;
  m.rtm = null;
  m.channel = null;
  m.clients = {};

  m.redis = {
    get(key, cb) {
      rec.redisGets.push(key);
      setImmediate(() => cb(null, store.has(key) ? store.get(key) : null));
    },
    set(key, value, cb) {
      rec.redisSets.push(key);
      store.set(key, value);
      if (typeof (cb) === "function") setImmediate(() => cb(null, "OK"));
    },
    expire() { /* no-op */ }
  };

  // Every key method answers "no" and records the call.
  m.akey = {
    get_first_apikey(owner, cb) {
      rec.akeyCalls.push("get_first_apikey");
      cb(false);
    },
    get_device_apikey(_owner, _udid, cb) {
      rec.akeyCalls.push("get_device_apikey");
      if (typeof (cb) === "function") cb(false);
    },
    checkTransferBinding(_current, _udid, _lastkey, _presented, cb) {
      rec.akeyCalls.push("checkTransferBinding");
      cb(null, false);
    }
  };

  m.devicelib = {
    get(id, cb) {
      rec.devicelibGets.push(id);
      setImmediate(() => {
        if (!Object.prototype.hasOwnProperty.call(docs, id)) {
          const e = new Error("missing");
          e.statusCode = 404;
          return cb(e);
        }
        cb(null, JSON.parse(JSON.stringify(docs[id])));
      });
    }
  };

  m.device = {
    edit(changes, cb) {
      rec.edits.push({ udid: changes.udid, status: changes.status });
      cb(true, {});
    },
    runDeviceTransformers(profile, doc) {
      rec.transformers.push(doc && doc.udid);
    },
    register() {
      rec.registers.push(true);
    }
  };

  m.user = {
    profile(owner, cb) {
      rec.profiles.push(owner);
      cb({ owner: owner, info: { transformers: [] } });
    },
    create_default_mqtt_apikey(owner) {
      rec.createMqttKeys.push(owner);
    }
  };

  m.publish = () => {
    rec.publishes.push(true);
  };

  const a1 = new FakeSocket(OWNER_A);
  const b1 = new FakeSocket(OWNER_B);
  m.subscribeSocket(OWNER_A, a1);
  m.subscribeSocket(OWNER_B, b1);

  return { m, rec, store, a1, b1 };
}

const json = (obj) => Buffer.from(JSON.stringify(obj));
const statusTopic = (owner, udid) => "/" + owner + "/" + udid + "/status";
const deviceTopic = (owner, udid) => "/" + owner + "/" + udid;
const telemetryTopic = (owner, udid) => "/" + owner + "/" + udid + "/telemetry";

function titled(sock, title) {
  return frames(sock).filter((f) => f && f.notification && f.notification.title === title);
}

function expectNoWrites(rec) {
  expect(rec.edits.length, "device.edit").to.equal(0);
  expect(rec.registers.length, "device.register").to.equal(0);
  expect(rec.publishes.length, "publish").to.equal(0);
  expect(rec.profiles.length, "owner profile").to.equal(0);
  expect(rec.transformers.length, "runDeviceTransformers").to.equal(0);
  expect(rec.createMqttKeys.length, "create_default_mqtt_apikey").to.equal(0);
  expect(rec.akeyCalls.length, "akey calls").to.equal(0);
}

// MQTT 3.1.1 QoS 0 PUBLISH: 0x30, remaining length varint, topic length (BE16), topic, payload.
function publishPacket(topic, payload) {
  const t = Buffer.from(topic, "utf8");
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
  const body = Buffer.concat([Buffer.from([(t.length >> 8) & 0xff, t.length & 0xff]), t, p]);
  const varint = [];
  let len = body.length;
  do {
    let b = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) b |= 0x80;
    varint.push(b);
  } while (len > 0);
  return Buffer.concat([Buffer.from([0x30].concat(varint)), body]);
}

describe("MessengerFailSafeSpec (quick 261003-w0c)", function () {

  let lines;
  let savedEnvironment;
  let savedFlag;

  beforeEach(() => {
    savedEnvironment = process.env.ENVIRONMENT;
    savedFlag = process.env[FLAG];
    process.env.ENVIRONMENT = "production";
    delete process.env[FLAG];
    lines = captureConsole();
  });

  afterEach(() => {
    if (typeof (savedEnvironment) === "undefined") delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = savedEnvironment;
    if (typeof (savedFlag) === "undefined") delete process.env[FLAG];
    else process.env[FLAG] = savedFlag;
  });

  describe("W0C crash: forwardNonNotification", function () {

    function slackFake(behaviour) {
      const calls = [];
      const rtm = {
        sendMessage(message, channel) {
          calls.push({ message, channel });
          if (behaviour === "throw") throw new Error("w0c sync");
          if (behaviour === "reject") return Promise.reject(new Error("w0c"));
          return Promise.resolve();
        }
      };
      return { rtm, calls };
    }

    it("C1 rtm null and channel null do not throw", function () {
      const { m } = makeMessenger();
      expect(() => m.forwardNonNotification({ status: "x" })).to.not.throw();
    });

    it("C2 rtm undefined does not throw", function () {
      const { m } = makeMessenger();
      m.rtm = undefined;
      expect(() => m.forwardNonNotification({ status: "x" })).to.not.throw();
    });

    it("C3 an rtm without sendMessage does not throw", function () {
      const { m } = makeMessenger();
      m.rtm = {};
      m.channel = CHANNEL;
      expect(() => m.forwardNonNotification({ status: "x" })).to.not.throw();
    });

    it("C4 a real client and a channel forward once", function () {
      const { m } = makeMessenger();
      const fake = slackFake();
      m.rtm = fake.rtm;
      m.channel = CHANNEL;
      const message = { status: "x" };
      expect(() => m.forwardNonNotification(message)).to.not.throw();
      expect(fake.calls.length, "sendMessage calls").to.equal(1);
      expect(fake.calls[0].message === message, "the message object").to.equal(true);
      expect(fake.calls[0].channel).to.equal(CHANNEL);
    });

    it("C5 no channel or an empty channel never forwards", function () {
      const { m } = makeMessenger();
      const fake = slackFake();
      m.rtm = fake.rtm;
      m.channel = null;
      expect(() => m.forwardNonNotification({ status: "x" })).to.not.throw();
      m.channel = "";
      expect(() => m.forwardNonNotification({ status: "x" })).to.not.throw();
      expect(fake.calls.length, "sendMessage calls").to.equal(0);
    });

    it("C6 a synchronous throw from sendMessage does not escape", function () {
      const { m } = makeMessenger();
      const fake = slackFake("throw");
      m.rtm = fake.rtm;
      m.channel = CHANNEL;
      expect(() => m.forwardNonNotification({ status: "x" })).to.not.throw();
    });

    it("C7 a rejected sendMessage promise is not left unhandled", async function () {
      const { m } = makeMessenger();
      const fake = slackFake("reject");
      m.rtm = fake.rtm;
      m.channel = CHANNEL;
      const rejections = [];
      const recorder = (reason) => rejections.push(reason);
      process.on("unhandledRejection", recorder);
      try {
        expect(() => m.forwardNonNotification({ status: "x" })).to.not.throw();
        await flush();
        expect(rejections.length, "unhandled rejections").to.equal(0);
      } finally {
        process.removeListener("unhandledRejection", recorder);
      }
    });

    it("C8 a notification is never forwarded", function () {
      const { m } = makeMessenger();
      const fake = slackFake();
      m.rtm = fake.rtm;
      m.channel = CHANNEL;
      expect(() => m.forwardNonNotification({ notification: { body: "x" } })).to.not.throw();
      expect(fake.calls.length, "sendMessage calls").to.equal(0);
    });

    it("C9 ENVIRONMENT=test never forwards", function () {
      process.env.ENVIRONMENT = "test";
      const { m } = makeMessenger();
      const fake = slackFake();
      m.rtm = fake.rtm;
      m.channel = CHANNEL;
      expect(() => m.forwardNonNotification({ status: "x" })).to.not.throw();
      expect(fake.calls.length, "sendMessage calls").to.equal(0);
    });
  });

  describe("W0C failsafe: messageResponder never throws", function () {

    it("F1 a connection message reaches only the owner's socket", async function () {
      const { m, a1, b1 } = makeMessenger();
      expect(() => m.messageResponder(telemetryTopic(OWNER_A, UDID_A), json({ connected: true }))).to.not.throw();
      await flush();
      expect(a1.sent.length, "frames on a1").to.equal(1);
      expect(titled(a1, "Device Connected").length, "Device Connected on a1").to.equal(1);
      expect(b1.sent.length, "frames on b1").to.equal(0);
    });

    it("F2 a synchronous throw is caught and logged once with a reason code only; the instance keeps working", async function () {
      const { m, a1 } = makeMessenger();
      m.processConnectionChange = () => { throw new TypeError("boom " + SENTINEL); };
      expect(() => m.messageResponder(telemetryTopic(OWNER_A, UDID_A), json({ connected: true }))).to.not.throw();
      await flush();
      expect(count(lines, HANDLER_ERROR_TYPEERROR), "handler_error_TypeError lines").to.equal(1);
      expect(mentions(lines, SENTINEL), "payload sentinel in the log").to.equal(false);
      expect(mentions(lines, OWNER_A), "owner id in the log").to.equal(false);
      expect(mentions(lines, "boom"), "error message in the log").to.equal(false);

      delete m.processConnectionChange;
      expect(() => m.messageResponder(telemetryTopic(OWNER_A, UDID_A), json({ connected: true }))).to.not.throw();
      await flush();
      expect(titled(a1, "Device Connected").length, "Device Connected on a1").to.equal(1);
    });

    it("F3 repeated throws are rate-capped", async function () {
      const { m } = makeMessenger();
      m.processConnectionChange = () => { throw new TypeError("boom " + SENTINEL); };
      for (let i = 0; i < 20; i++) {
        expect(() => m.messageResponder(telemetryTopic(OWNER_A, UDID_A), json({ connected: true }))).to.not.throw();
      }
      await flush();
      expect(count(lines, HANDLER_ERROR), "handler_error lines").to.be.within(1, 5);
    });

    it("F4 a missing topic or message does not throw", function () {
      const { m } = makeMessenger();
      expect(() => m.messageResponder(undefined, json({ connected: true }))).to.not.throw();
      expect(() => m.messageResponder("/a/b", undefined)).to.not.throw();
    });
  });

  describe("W0C payload: malformed payloads are dropped", function () {

    beforeEach(() => {
      process.env[FLAG] = "1"; // even with device writes on, nothing is edited
    });

    const payloads = [
      ["invalid JSON", Buffer.from("not json {")],
      ["JSON null", Buffer.from("null")],
      ["a JSON array", Buffer.from("[1,2]")],
      ["a JSON number", Buffer.from("42")],
      ["a JSON string", Buffer.from("\"str\"")],
      ["a plain string", "plain " + SENTINEL],
      ["the firmware's unquoted-key Update Successful notice", Buffer.from(UPDATE_SUCCESSFUL)]
    ];

    for (const [label, payload] of payloads) {
      it("P1 drops " + label + " before any CouchDB, Redis, key or socket call", async function () {
        const { m, rec, a1, b1 } = makeMessenger();
        expect(() => m.messageResponder(statusTopic(OWNER_A, UDID_A), payload)).to.not.throw();
        await flush();
        expect(rec.devicelibGets.length, "devicelib.get").to.equal(0);
        expect(rec.redisGets.length + rec.redisSets.length, "redis calls").to.equal(0);
        expectNoWrites(rec);
        expect(a1.sent.length + b1.sent.length, "socket frames").to.equal(0);
        expect(count(lines, MALFORMED_PAYLOAD), "malformed_payload lines").to.be.at.least(1);
        expect(mentions(lines, SENTINEL), "payload sentinel in the log").to.equal(false);
      });
    }

    it("P2 malformed payload lines are rate-capped", async function () {
      const { m } = makeMessenger();
      for (let i = 0; i < 30; i++) {
        expect(() => m.messageResponder(statusTopic(OWNER_A, UDID_A), Buffer.from("not json { " + i))).to.not.throw();
      }
      await flush();
      expect(count(lines, MALFORMED_PAYLOAD), "malformed_payload lines").to.be.within(1, 5);
    });
  });

  describe("W0C gate: newly reachable paths", function () {

    it("G1 with the flag unset, status and registration messages write nothing and notice once", async function () {
      const { m, rec, a1, b1 } = makeMessenger();
      const topic = statusTopic(OWNER_A, UDID_A);
      expect(() => m.messageResponder(topic, json({ status: "online" }))).to.not.throw();
      expect(() => m.messageResponder(topic, json(REGISTRATION))).to.not.throw();
      expect(() => m.messageResponder(topic, json({ status: "update_started" }))).to.not.throw();
      await flush();
      expectNoWrites(rec);
      const notices = lines.filter((l) => l.indexOf(FLAG) !== -1);
      expect(notices.length, "lines naming the flag").to.equal(1);
      expect(notices[0].indexOf(OWNER_A), "owner id in the notice").to.equal(-1);
      expect(notices[0].indexOf(UDID_A), "udid in the notice").to.equal(-1);
      expect(a1.sent.length + b1.sent.length, "socket frames").to.equal(0);
    });

    it("G2 with the flag on, the status edit runs but transformers never do", async function () {
      process.env[FLAG] = "1";
      const { m, rec } = makeMessenger();
      const topic = statusTopic(OWNER_A, UDID_A);
      expect(() => m.messageResponder(topic, json({ status: "online" }))).to.not.throw();
      expect(() => m.messageResponder(topic, json({ status: "online" }))).to.not.throw();
      await flush();
      expect(rec.edits).to.deep.equal([
        { udid: UDID_A, status: "online" }, // quick 261004-25u: the status string, not the message
        { udid: UDID_A, status: "online" }
      ]);
      expect(rec.profiles.length, "profile loads").to.equal(0);
      expect(rec.transformers.length, "transformer runs").to.equal(0);
      expect(count(lines, TRANSFORMERS_DISABLED), "transformers-disabled notices").to.equal(1);
    });

    it("G3 with the flag on, vbg's owner gate still applies", async function () {
      process.env[FLAG] = "1";
      const { m, rec } = makeMessenger();
      expect(() => m.messageResponder(statusTopic(OWNER_A, UDID_B), json({ status: "online" }))).to.not.throw();
      await flush();
      expect(rec.edits.length, "device.edit").to.equal(0);
    });

    it("G4 the firmware's LWT sends Check-out to the owner only", async function () {
      const { m, a1, b1 } = makeMessenger();
      expect(() => m.messageResponder(statusTopic(OWNER_A, UDID_A), Buffer.from(LWT))).to.not.throw();
      await flush();
      const checkouts = titled(a1, "Check-out");
      expect(checkouts.length, "Check-out frames on a1").to.equal(1);
      expect(checkouts[0].notification.body.indexOf(ALIAS_A)).to.not.equal(-1);
      expect(a1.sent.length, "frames on a1").to.equal(1);
      expect(b1.sent.length, "frames on b1").to.equal(0);
    });

    it("G5 unknown-shape messages are not relayed and notice once", async function () {
      const { m, a1, b1 } = makeMessenger();
      expect(() => m.messageResponder(deviceTopic(OWNER_A, UDID_A), json({ foo: "bar" }))).to.not.throw();
      expect(() => m.messageResponder(deviceTopic(OWNER_A, UDID_A), json({ foo: "bar" }))).to.not.throw();
      await flush();
      expect(a1.sent.length + b1.sent.length, "socket frames").to.equal(0);
      expect(count(lines, UNKNOWN_NOT_RELAYED), "unknown-shape notices").to.equal(1);
    });

    it("G6 an actionable notification still reaches the owner only", async function () {
      const { m, a1, b1 } = makeMessenger();
      expect(() => m.messageResponder(deviceTopic(OWNER_A, UDID_A), json({ notification: { body: "w0c", response_type: "bool" } }))).to.not.throw();
      await flush();
      expect(a1.sent.length, "frames on a1").to.equal(1);
      expect(frames(a1)[0].notification.type).to.equal("actionable");
      expect(b1.sent.length, "frames on b1").to.equal(0);
    });
  });

  describe("W0C actionable: response branch never throws", function () {

    async function respond(fx, nid) {
      const uncaught = [];
      const recorder = (e) => uncaught.push(e);
      process.on("uncaughtException", recorder);
      try {
        expect(() => fx.m.messageResponder(deviceTopic(OWNER_A, UDID_A), json({ notification: { response: true, nid: nid } }))).to.not.throw();
        await flush();
      } finally {
        process.removeListener("uncaughtException", recorder);
      }
      return uncaught;
    }

    it("A1 an absent nid:<nid> drops without writing", async function () {
      const fx = makeMessenger();
      const uncaught = await respond(fx, "w0c-nid-absent");
      expect(uncaught.length, "uncaught exceptions").to.equal(0);
      expect(fx.rec.redisSets.indexOf("nid:" + UDID_A), "nid:<udid> written").to.equal(-1);
      expect(count(lines, DROP_LINE), "drop lines").to.be.at.most(1);
    });

    it("A2 an unparseable nid:<nid> drops without writing", async function () {
      const fx = makeMessenger();
      fx.store.set("nid:w0c-nid-bad", "not json");
      const uncaught = await respond(fx, "w0c-nid-bad");
      expect(uncaught.length, "uncaught exceptions").to.equal(0);
      expect(fx.rec.redisSets.indexOf("nid:" + UDID_A), "nid:<udid> written").to.equal(-1);
      expect(count(lines, DROP_LINE), "drop lines").to.be.at.most(1);
    });
  });

  describe("W0C e2e: real mqtt.js client on an in-memory stream", function () {

    it("E1 the client survives the message that used to throw and keeps delivering", async function () {
      const { m, a1 } = makeMessenger();
      let duplex = null;
      let connackSent = false;
      const streamBuilder = () => {
        duplex = new stream.Duplex({
          read() { /* pushed by the test */ },
          write(chunk, _encoding, cb) {
            // Answer the client's CONNECT with a CONNACK (accepted).
            if (!connackSent && chunk.length > 0 && (chunk[0] >> 4) === 1) {
              connackSent = true;
              setImmediate(() => duplex.push(Buffer.from([0x20, 0x02, 0x00, 0x00])));
            }
            cb();
          }
        });
        return duplex;
      };

      const uncaught = [];
      const clientErrors = [];
      const recorder = (e) => uncaught.push(e);
      process.on("uncaughtException", recorder);
      const client = new mqtt.MqttClient(streamBuilder, { reconnectPeriod: 0, keepalive: 0 });
      try {
        client.on("error", (e) => clientErrors.push(e));
        client.on("message", (t, p) => m.messageResponder(t, p)); // the setupMqttClient wiring
        expect(await waitFor(() => client.connected, 3000), "client connected").to.equal(true);

        duplex.push(publishPacket(statusTopic(OWNER_A, UDID_A), json(REGISTRATION)));
        duplex.push(publishPacket(telemetryTopic(OWNER_A, UDID_A), json({ connected: true })));
        duplex.push(publishPacket(deviceTopic(OWNER_A, UDID_A), json({ notification: { body: "w0c-e2e", response_type: "bool" } })));

        const delivered = await waitFor(() => {
          const f = frames(a1);
          const connected = f.some((x) => x.notification && x.notification.title === "Device Connected");
          const actionable = f.some((x) => x.notification && x.notification.type === "actionable");
          return connected && actionable;
        }, 3000);
        expect(delivered, "Device Connected and actionable frames on a1").to.equal(true);
        expect(uncaught.length, "uncaught exceptions").to.equal(0);
        expect(clientErrors.length, "client errors").to.equal(0);
        expect(client.connected, "client still connected").to.equal(true);
      } finally {
        process.removeListener("uncaughtException", recorder);
        client.end(true);
      }
    }, 10000);
  });
});
