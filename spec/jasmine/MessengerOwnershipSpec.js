/*
 * MessengerOwnershipSpec — quick 261003-vbg: MQTT status/check-in/actionable messages act only
 * on a device the topic owner owns, or on a device transferred away from the topic owner whose
 * moved API key still carries the transfer binding.
 *
 * Pinned behaviour:
 * - /<owner>/<udid>/status for the owner's own device edits the device ({udid, status}) and
 *   reads no ak: store (quick 261003-w0c: MQTT-triggered transformers are disabled, so no
 *   profile load and no transformer run);
 * - operator decision 2026-10-03: a transferred device's previous-owner topic is ACCEPTED when
 *   the entry the device's lastkey identifies in ak:<doc.owner> carries a transfer binding for
 *   exactly this udid listing the topic owner (APIKey#checkTransferBinding, which reuses u86's
 *   findDeviceKey/findTransferBinding). Accepted messages always act as doc.owner. The binding
 *   is never consumed;
 * - accepted residual risk (operator, informed): while the binding lives, the previous owner's
 *   own MQTT credential can forge status/check-in/actionable messages for that device;
 * - everything else drops and changes nothing: a foreign udid, a binding for another udid, an
 *   owner not in `from`, a revoked or re-keyed key, a legacy unbound transfer, a Redis error, a
 *   malformed key store, an unknown udid and a malformed topic. Malformed topics never reach
 *   CouchDB or Redis and never trigger MQTT registration;
 * - each dropped message prints at most one line, at most 5 per 60 s window, with the
 *   suppressed count carried into the next window. No line carries a payload, owner id, key,
 *   hash or lastkey.
 *
 * Needs no Redis, CouchDB or broker: the Messenger is Object.create(Messenger.prototype) with
 * recording fakes, and a real APIKey (Object.create(APIKey.prototype)) runs on a Map-backed fake
 * Redis, so the real u86 statics and checkTransferBinding are exercised.
 *
 * Fixture notes:
 * - forwardNonNotification is replaced by a no-op. Its throw with createInstance's state
 *   (rtm = null, channel = null, ENVIRONMENT not "test"; todo finding (a)) is fixed in quick
 *   261003-w0c; the no-op stays, to isolate the owner gate.
 * - THINX_MQTT_DEVICE_WRITES is set to "1" for every case (quick 261003-w0c gates MQTT device
 *   writes behind it, default off) and restored afterwards.
 * - one recording console socket is subscribed per owner (quick 261003-vn3 replaced the single
 *   `_socket` with per-owner subscriptions; todo finding (d) is gone with it).
 *
 * Nothing here prints a payload, an owner id, a key, a hash or a lastkey: failures report counts,
 * booleans or which sentinel leaked, never the captured log text.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require("chai").expect;
const sha256 = require("sha256");

const Messenger = require("../../lib/thinx/messenger");
const APIKey = require("../../lib/thinx/apikey");

// Limiter contract (hard-coded on purpose: the spec pins it).
const DROP_LINES_PER_WINDOW = 5;
const DROP_WINDOW_MS = 60000;
const DROP_LINE = /\[messenger\] dropped MQTT device message/;

const OWNER_A = sha256("vbg-owner-a");
const OWNER_B = sha256("vbg-owner-b");
const OWNER_C = sha256("vbg-owner-c");

const KEY_A = "vbg-key-a-0001";
const KEY_B = "vbg-key-b-0002";
const KEY_T = "vbg-key-t-0003";
const KEY_X = "vbg-key-x-0004";
const KEY_L = "vbg-key-l-0005";
const KEY_R = "vbg-key-r-0006";
const KEY_REVOKED = "vbg-key-revoked-0007";

const lastkey = (key) => sha256(key);

const UDID_A = "0b9a0001-a1a1-11f0-8000-00000000000a";
const UDID_B = "0b9a0002-a1a1-11f0-8000-00000000000b";
const UDID_T = "0b9a0003-a1a1-11f0-8000-00000000000c";
const UDID_X = "0b9a0004-a1a1-11f0-8000-00000000000d";
const UDID_L = "0b9a0005-a1a1-11f0-8000-00000000000e";
const UDID_U = "0b9a0006-a1a1-11f0-8000-00000000000f";

const AT = "2026-10-03T12:00:00.000Z";
const SENTINEL = "vbg-payload-sentinel-5e1f";

const ALL_SECRETS = [
  SENTINEL, OWNER_A, OWNER_B, OWNER_C,
  KEY_A, KEY_B, KEY_T, KEY_X, KEY_L, KEY_R,
  sha256(KEY_A), sha256(KEY_B), sha256(KEY_T), sha256(KEY_X), sha256(KEY_L), sha256(KEY_R),
  sha256(sha256(KEY_A)), sha256(sha256(KEY_B)), sha256(sha256(KEY_T))
];

const entry = (key, transfer) => {
  const e = { key: key, hash: sha256(key), alias: "vbg " + key.slice(0, 9) };
  if (transfer) e.transfer = transfer;
  return e;
};

const BINDING_T = { udid: UDID_T, from: [OWNER_A], at: AT };

function seedStore() {
  const store = new Map();
  store.set("ak:" + OWNER_B, JSON.stringify([
    entry(KEY_B),
    entry(KEY_T, BINDING_T),
    entry(KEY_X, BINDING_T), // binding names UDID_T, but the key belongs to UDID_X
    entry(KEY_L),
    entry(KEY_R)
  ]));
  store.set("ak:" + OWNER_A, JSON.stringify([entry(KEY_A)]));
  return store;
}

function seedDocs() {
  return {
    [UDID_A]: { _id: UDID_A, udid: UDID_A, owner: OWNER_A, lastkey: lastkey(KEY_A), alias: "vbg-alias-a", transformers: [] },
    [UDID_B]: { _id: UDID_B, udid: UDID_B, owner: OWNER_B, lastkey: lastkey(KEY_B), alias: "vbg-alias-b", transformers: [] },
    [UDID_T]: { _id: UDID_T, udid: UDID_T, owner: OWNER_B, previous_owner: OWNER_A, transferred_at: AT, lastkey: lastkey(KEY_T), alias: "vbg-alias-t", transformers: [] },
    [UDID_X]: { _id: UDID_X, udid: UDID_X, owner: OWNER_B, previous_owner: OWNER_A, transferred_at: AT, lastkey: lastkey(KEY_X), alias: "vbg-alias-x", transformers: [] },
    [UDID_L]: { _id: UDID_L, udid: UDID_L, owner: OWNER_B, previous_owner: OWNER_A, lastkey: lastkey(KEY_L), alias: "vbg-alias-l", transformers: [] }
  };
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

function leaked(lines, sentinels) {
  return sentinels.filter((s) => lines.some((l) => l.indexOf(s) !== -1)).map((s) => ALL_SECRETS.indexOf(s));
}

function makeMessenger(opts) {
  const options = opts || {};
  const store = seedStore();
  const docs = seedDocs();
  const rec = {
    redisGets: [], redisSets: [], devicelibGets: [], edits: [], transformers: [],
    profiles: [], registers: [], createMqttKeys: [], firstApikeys: [], sent: []
  };

  const redis = {
    get(key, cb) {
      rec.redisGets.push(key);
      setImmediate(() => {
        if (options.redisError && key.indexOf("ak:") === 0) return cb(new Error("vbg fake redis failure"));
        cb(null, store.has(key) ? store.get(key) : null);
      });
    },
    set(key, value, cb) {
      rec.redisSets.push(key);
      store.set(key, value);
      if (typeof (cb) === "function") setImmediate(() => cb(null, "OK"));
    }
  };

  const m = Object.create(Messenger.prototype);
  // createInstance's state
  m.DISABLE_SLACK = true;
  m.rtm = null;
  m.channel = null;
  m.clients = {};
  m.redis = redis;

  const akey = Object.create(APIKey.prototype);
  akey.redis = redis;
  akey.alog = { log: () => {} };
  akey.prefix = "";
  m.akey = akey;
  spyOn(akey, "get_first_apikey").and.callFake((owner, cb) => {
    rec.firstApikeys.push(owner);
    cb(false);
  });

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
      rec.transformers.push({ owner: profile.owner, udid: doc.udid });
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

  // One subscribed console socket per owner (quick 261003-vn3 routes frames per owner); all
  // record into rec.sent, so these cases count frames regardless of which owner received them.
  for (const owner of [OWNER_A, OWNER_B, OWNER_C]) {
    m.subscribeSocket(owner, { owner: owner, readyState: 1, send: (s) => rec.sent.push(s), on() {} });
  }

  // Finding (a): throws whenever ENVIRONMENT !== "test" with createInstance's state.
  m.forwardNonNotification = () => {};

  return { m, rec, store, docs };
}

async function flush() {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const payload = (obj) => Buffer.from(JSON.stringify(obj));
const statusTopic = (owner, udid) => "/" + owner + "/" + udid + "/status";
const akReads = (rec) => rec.redisGets.filter((k) => k.indexOf("ak:") === 0).length;

async function send(fx, topic, message) {
  fx.m.messageResponder(topic, message);
  await flush();
}

function expectNoEffects(rec) {
  expect(rec.edits.length, "edits").to.equal(0);
  expect(rec.profiles.length, "profiles").to.equal(0);
  expect(rec.transformers.length, "transformer runs").to.equal(0);
}

function binding(fx, current, udid, lk, presented) {
  return new Promise((resolve) => {
    fx.m.akey.checkTransferBinding(current, udid, lk, presented, (error, bound) => resolve({ error, bound }));
  });
}

describe("MessengerOwnershipSpec (quick 261003-vbg)", function () {

  let lines;
  let savedDeviceWrites;

  beforeEach(() => {
    lines = captureConsole();
    // quick 261003-w0c: MQTT device writes are gated off unless THINX_MQTT_DEVICE_WRITES=1.
    savedDeviceWrites = process.env.THINX_MQTT_DEVICE_WRITES;
    process.env.THINX_MQTT_DEVICE_WRITES = "1";
  });

  afterEach(() => {
    if (typeof (savedDeviceWrites) === "undefined") delete process.env.THINX_MQTT_DEVICE_WRITES;
    else process.env.THINX_MQTT_DEVICE_WRITES = savedDeviceWrites;
  });

  describe("VBG status", function () {

    it("(1) the owner's own status topic edits the device as the owner (transformers disabled by quick 261003-w0c)", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_A), payload({ status: "online" }));
      expect(fx.rec.edits).to.deep.equal([{ udid: UDID_A, status: "online" }]); // quick 261004-25u: the status string, not the message
      // quick 261003-w0c: MQTT-triggered transformers disabled
      expect(fx.rec.profiles.length).to.equal(0);
      expect(fx.rec.transformers.length).to.equal(0);
      expect(akReads(fx.rec), "ak: reads").to.equal(0);
    });

    it("(2) the same with a plain-object payload", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_A), { status: "online" });
      expect(fx.rec.edits).to.deep.equal([{ udid: UDID_A, status: "online" }]); // quick 261004-25u: the status string, not the message
      // quick 261003-w0c: MQTT-triggered transformers disabled
      expect(fx.rec.profiles.length).to.equal(0);
      expect(fx.rec.transformers.length).to.equal(0);
      expect(akReads(fx.rec), "ak: reads").to.equal(0);
    });

    it("(3) another owner's udid on the topic owner's status topic changes nothing", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_B), payload({ status: "online" }));
      expectNoEffects(fx.rec);
      expect(fx.rec.devicelibGets.indexOf(UDID_B)).to.not.equal(-1);
    });

    it("(4) an unknown udid changes nothing", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_U), payload({ status: "online" }));
      expectNoEffects(fx.rec);
    });

    it("(5) only the exact /<owner>/<udid>/status topic edits status", async () => {
      const fx = makeMessenger();
      await send(fx, "/" + OWNER_A + "/" + UDID_A + "/status/extra", payload({ status: "online" }));
      await send(fx, "/" + OWNER_A + "/" + UDID_A + "/statusx", payload({ status: "online" }));
      expect(fx.rec.edits.length, "edits").to.equal(0);
      expect(fx.rec.transformers.length, "transformer runs").to.equal(0);
    });
  });

  describe("VBG topic", function () {

    const malformed = [
      ["a non-udid segment", "/" + OWNER_A + "/not-a-udid/status"],
      ["a CouchDB special id", "/" + OWNER_A + "/_all_docs/status"],
      ["too few segments", "/" + OWNER_A + "/status"],
      ["an empty owner segment", "//" + UDID_A + "/status"],
      ["no leading slash", OWNER_A + "/" + UDID_A + "/status"],
      ["a non-owner segment", "/NOT-AN-OWNER/" + UDID_A + "/status"],
      ["an uppercased owner", "/" + OWNER_A.toUpperCase() + "/" + UDID_A + "/status"]
    ];

    for (const [label, topic] of malformed) {
      it("drops " + label + " before CouchDB or Redis", async () => {
        const fx = makeMessenger();
        await send(fx, topic, payload({ status: "connected" }));
        expect(fx.rec.devicelibGets.length, "devicelib gets").to.equal(0);
        expect(fx.rec.redisGets.length, "redis reads").to.equal(0);
        expectNoEffects(fx.rec);
        expect(fx.rec.firstApikeys.length, "get_first_apikey").to.equal(0);
        expect(fx.rec.createMqttKeys.length, "create_default_mqtt_apikey").to.equal(0);
        expect(fx.rec.registers.length, "register").to.equal(0);
        expect(fx.rec.sent.length, "socket messages").to.equal(0);
      });
    }

    it("a registration on a malformed owner topic triggers no key lookup, key creation or registration", async () => {
      const fx = makeMessenger();
      await send(fx, "/NOT-AN-OWNER/" + UDID_A + "/status", payload({ registration: { mac: "AA:BB:CC:00:00:01" } }));
      expect(fx.rec.devicelibGets.length, "devicelib gets").to.equal(0);
      expect(fx.rec.redisGets.length, "redis reads").to.equal(0);
      expect(fx.rec.firstApikeys.length, "get_first_apikey").to.equal(0);
      expect(fx.rec.createMqttKeys.length, "create_default_mqtt_apikey").to.equal(0);
      expect(fx.rec.registers.length, "register").to.equal(0);
      expectNoEffects(fx.rec);
    });
  });

  describe("VBG log", function () {

    it("(6) foreign drops are capped and leak no payload, owner id or key material", async () => {
      const fx = makeMessenger();
      for (let i = 0; i < 50; i++) {
        fx.m.messageResponder(statusTopic(OWNER_A, UDID_B), payload({ status: "connected", detail: SENTINEL }));
      }
      await flush();
      const drops = lines.filter((l) => DROP_LINE.test(l)).length;
      expect(drops, "drop lines").to.be.within(1, DROP_LINES_PER_WINDOW);
      expect(leaked(lines, ALL_SECRETS), "indexes of leaked sentinels").to.deep.equal([]);
      expectNoEffects(fx.rec);
    });

    it("(6b) one dropped message prints exactly one line", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_B), payload({ status: "connected" }));
      expect(lines.filter((l) => DROP_LINE.test(l)).length, "drop lines").to.equal(1);
    });

    it("(7) mixed drops print at most the window cap and never reach sanitka's warnings", async () => {
      const fx = makeMessenger();
      const notUdid = "z".repeat(36);
      const longOwner = "a".repeat(65);
      for (let i = 0; i < 50; i++) {
        let topic;
        if (i % 3 === 0) topic = statusTopic(OWNER_A, UDID_U);
        else if (i % 3 === 1) topic = statusTopic(OWNER_A, notUdid);
        else topic = statusTopic(longOwner, UDID_A);
        fx.m.messageResponder(topic, payload({ status: "connected" }));
      }
      await flush();
      expect(lines.length, "captured lines").to.be.at.most(DROP_LINES_PER_WINDOW);
      expect(lines.filter((l) => l.indexOf("UDID RegEx and replace failed") !== -1).length).to.equal(0);
      expect(lines.filter((l) => l.indexOf("document identifier invalid") !== -1).length).to.equal(0);
      expectNoEffects(fx.rec);
    });

    // Synchronous on purpose: the Date.now spy is active only inside this body and is
    // released before it returns, so no other timer in the CI process sees the skewed clock.
    it("(8) the window resets after 60 s and reports the suppressed count", () => {
      const fx = makeMessenger();
      const T = Date.now();
      let now = T;
      const clock = spyOn(Date, "now").and.callFake(() => now);
      for (let i = 0; i < 7; i++) {
        fx.m.messageResponder("/NOT-AN-OWNER/" + UDID_A + "/status", payload({ status: "connected" }));
      }
      expect(lines.filter((l) => DROP_LINE.test(l)).length, "drop lines in the first window").to.equal(DROP_LINES_PER_WINDOW);
      now = T + DROP_WINDOW_MS + 1000;
      fx.m.messageResponder("/NOT-AN-OWNER/" + UDID_A + "/status", payload({ status: "connected" }));
      clock.and.callThrough();
      const drops = lines.filter((l) => DROP_LINE.test(l));
      expect(drops.length, "drop lines after the window").to.equal(DROP_LINES_PER_WINDOW + 1);
      expect(/2 suppressed/.test(drops[DROP_LINES_PER_WINDOW]), "suppressed count on the new window's first line").to.equal(true);
    });
  });

  describe("VBG check-in", function () {

    it("(9) the owner's check-in notifies the socket with the device alias", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_A), payload({ status: "connected" }));
      const checkins = fx.rec.sent.filter((s) => s.indexOf("Check-in") !== -1);
      expect(checkins.length).to.equal(1);
      expect(checkins[0].indexOf("vbg-alias-a")).to.not.equal(-1);
    });

    it("(10) a foreign check-in sends nothing and reveals no alias", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_B), payload({ status: "connected" }));
      expect(fx.rec.sent.length, "socket messages").to.equal(0);
      expect(lines.some((l) => l.indexOf("vbg-alias-b") !== -1), "alias in log").to.equal(false);
    });
  });

  describe("VBG binding", function () {

    it("(11) the bound entry the lastkey identifies, listing the presented owner, is a binding", async () => {
      const fx = makeMessenger();
      expect(typeof fx.m.akey.checkTransferBinding).to.equal("function");
      const r = await binding(fx, OWNER_B, UDID_T, lastkey(KEY_T), OWNER_A);
      expect(r.error).to.equal(null);
      expect(r.bound).to.equal(true);
    });

    it("(12) a binding naming a different udid is not a binding", async () => {
      const fx = makeMessenger();
      expect(typeof fx.m.akey.checkTransferBinding).to.equal("function");
      const r = await binding(fx, OWNER_B, UDID_X, lastkey(KEY_X), OWNER_A);
      expect(r.error).to.equal(null);
      expect(r.bound).to.equal(false);
    });

    it("(13) an owner not in from is not bound", async () => {
      const fx = makeMessenger();
      expect(typeof fx.m.akey.checkTransferBinding).to.equal("function");
      const r = await binding(fx, OWNER_B, UDID_T, lastkey(KEY_T), OWNER_C);
      expect(r.error).to.equal(null);
      expect(r.bound).to.equal(false);
    });

    it("(14) a re-keyed device (lastkey identifies an unbound entry) is not bound", async () => {
      const fx = makeMessenger();
      expect(typeof fx.m.akey.checkTransferBinding).to.equal("function");
      const r = await binding(fx, OWNER_B, UDID_T, lastkey(KEY_R), OWNER_A);
      expect(r.error).to.equal(null);
      expect(r.bound).to.equal(false);
    });

    it("(15) a revoked key (absent from the store) is not bound", async () => {
      const fx = makeMessenger();
      expect(typeof fx.m.akey.checkTransferBinding).to.equal("function");
      const r = await binding(fx, OWNER_B, UDID_T, lastkey(KEY_REVOKED), OWNER_A);
      expect(r.error).to.equal(null);
      expect(r.bound).to.equal(false);
    });

    it("(16) a Redis error or a malformed store answers an error and false", async () => {
      const failing = makeMessenger({ redisError: true });
      expect(typeof failing.m.akey.checkTransferBinding).to.equal("function");
      const r1 = await binding(failing, OWNER_B, UDID_T, lastkey(KEY_T), OWNER_A);
      expect(r1.error, "redis error").to.not.equal(null);
      expect(r1.bound).to.equal(false);

      const malformed = makeMessenger();
      malformed.store.set("ak:" + OWNER_B, "not json");
      const r2 = await binding(malformed, OWNER_B, UDID_T, lastkey(KEY_T), OWNER_A);
      expect(r2.error, "malformed store").to.not.equal(null);
      expect(r2.bound).to.equal(false);
    });

    it("(17) presented == current and a missing lastkey answer false without a Redis read", async () => {
      const fx = makeMessenger();
      expect(typeof fx.m.akey.checkTransferBinding).to.equal("function");
      const r1 = await binding(fx, OWNER_B, UDID_T, lastkey(KEY_T), OWNER_B);
      expect(r1.error).to.equal(null);
      expect(r1.bound).to.equal(false);
      const r2 = await binding(fx, OWNER_B, UDID_T, undefined, OWNER_A);
      expect(r2.error).to.equal(null);
      expect(r2.bound).to.equal(false);
      expect(fx.rec.redisGets.length, "redis reads").to.equal(0);
    });
  });

  describe("VBG transfer", function () {

    it("T1: the previous owner's topic, bound by the transfer, applies the status as the current owner", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_T), payload({ status: "online" }));
      expect(fx.rec.edits).to.deep.equal([{ udid: UDID_T, status: "online" }]); // quick 261004-25u: the status string, not the message
      // quick 261003-w0c: MQTT-triggered transformers disabled
      expect(fx.rec.profiles.length, "profiles").to.equal(0);
      expect(fx.rec.profiles.indexOf(OWNER_A), "profile never loaded for OWNER_A").to.equal(-1);
      expect(fx.rec.transformers.length).to.equal(0);
    });

    it("T2: the current owner's topic applies as the current owner without an ak: read", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_B, UDID_T), payload({ status: "online" }));
      expect(fx.rec.edits).to.deep.equal([{ udid: UDID_T, status: "online" }]); // quick 261004-25u: the status string, not the message
      // quick 261003-w0c: MQTT-triggered transformers disabled
      expect(fx.rec.profiles.length, "profiles").to.equal(0);
      expect(akReads(fx.rec), "ak: reads").to.equal(0);
    });

    it("T3: a binding naming another udid drops", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_X), payload({ status: "online" }));
      expectNoEffects(fx.rec);
    });

    it("T4: an owner not in from drops", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_C, UDID_T), payload({ status: "online" }));
      expectNoEffects(fx.rec);
    });

    it("T5: a revoked moved key drops", async () => {
      const fx = makeMessenger();
      const entries = JSON.parse(fx.store.get("ak:" + OWNER_B)).filter((e) => e.key !== KEY_T);
      fx.store.set("ak:" + OWNER_B, JSON.stringify(entries));
      await send(fx, statusTopic(OWNER_A, UDID_T), payload({ status: "online" }));
      expectNoEffects(fx.rec);
    });

    it("T6: a re-keyed device drops on the old topic", async () => {
      const fx = makeMessenger();
      fx.docs[UDID_T].lastkey = lastkey(KEY_R);
      await send(fx, statusTopic(OWNER_A, UDID_T), payload({ status: "online" }));
      expectNoEffects(fx.rec);
    });

    it("T7: a legacy transfer without a binding drops", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_L), payload({ status: "online" }));
      expectNoEffects(fx.rec);
    });

    it("T8: a Redis error or a malformed key store drops", async () => {
      const failing = makeMessenger({ redisError: true });
      await send(failing, statusTopic(OWNER_A, UDID_T), payload({ status: "online" }));
      expectNoEffects(failing.rec);

      const malformed = makeMessenger();
      malformed.store.set("ak:" + OWNER_B, "not json");
      await send(malformed, statusTopic(OWNER_A, UDID_T), payload({ status: "online" }));
      expectNoEffects(malformed.rec);
    });

    it("T9: a bound check-in notifies with the device alias", async () => {
      const fx = makeMessenger();
      await send(fx, statusTopic(OWNER_A, UDID_T), payload({ status: "connected" }));
      const checkins = fx.rec.sent.filter((s) => s.indexOf("Check-in") !== -1);
      expect(checkins.length).to.equal(1);
      expect(checkins[0].indexOf("vbg-alias-t")).to.not.equal(-1);
    });

    it("T10: a bound actionable notification reads and writes nid:<udid>", async () => {
      const fx = makeMessenger();
      await send(fx, "/" + OWNER_A + "/" + UDID_T, payload({ notification: { body: "vbg", response_type: "bool" } }));
      expect(fx.rec.redisGets.indexOf("nid:" + UDID_T)).to.not.equal(-1);
      expect(fx.rec.redisSets.indexOf("nid:" + UDID_T)).to.not.equal(-1);
    });
  });

  describe("VBG actionable", function () {

    it("(18) the owner's actionable notification reads and writes nid:<udid> and notifies once", async () => {
      const fx = makeMessenger();
      await send(fx, "/" + OWNER_A + "/" + UDID_A, payload({ notification: { body: "vbg", response_type: "bool" } }));
      expect(fx.rec.redisGets.indexOf("nid:" + UDID_A)).to.not.equal(-1);
      expect(fx.rec.redisSets.indexOf("nid:" + UDID_A)).to.not.equal(-1);
      expect(fx.rec.sent.length, "socket messages").to.equal(1);
    });

    it("(19) a foreign actionable notification touches no nid: key, sends nothing and logs no payload", async () => {
      const fx = makeMessenger();
      await send(fx, "/" + OWNER_A + "/" + UDID_B, payload({ notification: { body: SENTINEL, response_type: "bool" } }));
      const touched = fx.rec.redisGets.concat(fx.rec.redisSets).filter((k) => (k.indexOf(UDID_B) !== -1) && (k.indexOf("ak:") !== 0));
      expect(touched.length, "redis keys naming the foreign udid").to.equal(0);
      expect(fx.rec.sent.length, "socket messages").to.equal(0);
      expect(leaked(lines, [SENTINEL]), "payload sentinel in the log").to.deep.equal([]);
    });

    it("(20) a foreign actionable response never writes nid:<udid>", async () => {
      const fx = makeMessenger();
      fx.store.set("nid:vbg-nid", "[]"); // keeps finding (e)'s JSON.parse(null) crash from firing
      await send(fx, "/" + OWNER_A + "/" + UDID_B, payload({ notification: { response: true, nid: "vbg-nid" } }));
      expect(fx.rec.redisSets.indexOf("nid:" + UDID_B), "nid:<foreign udid> written").to.equal(-1);
    });
  });
});
