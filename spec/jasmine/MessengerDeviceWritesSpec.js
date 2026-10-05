/*
 * MessengerDeviceWritesSpec — quick 261004-25u: MQTT device writes are safe to enable with
 * THINX_MQTT_DEVICE_WRITES=1.
 *
 * Pinned behaviour (flag on):
 * - the MQTT status edit writes device.status as a plain string only: message.status when it is
 *   a non-empty string, with control characters stripped and cut to 64 characters. Objects,
 *   numbers, arrays, booleans, null, the registration body and messages without a string status
 *   write nothing;
 * - a message that carries `registration` never edits status;
 * - a "disconnected" status that arrives less than 60 s after the device's last HTTP check-in
 *   (doc.lastupdate) is ignored; at 60 s or later it is written. Other statuses ("connected",
 *   "update_started", ...) are written regardless of lastupdate;
 * - the edit changes only `status`: Device#edit receives exactly {udid, status};
 * - MQTT registration is skipped when the device checked in over HTTP less than 5 minutes ago
 *   (doc.lastupdate), and runs at 5 minutes or later;
 * - a missing or invalid lastupdate (absent, null, not a date, a number, in the future) counts as
 *   old: the status is written and registration runs;
 * - each skip logs exactly one rate-limited line with a reason code and the sanitized udid only;
 * - transformers never run, vbg's owner gate still applies, and with the flag off nothing is
 *   written (quick 261003-w0c's default);
 * - registerDevice and a failed edit never log the payload, an owner id, a one-time token or key
 *   material.
 *
 * Every fake answers synchronously, so a whole messageResponder call completes inside the
 * synchronous `it` body. THINX_MQTT_DEVICE_WRITES and Date.now are set and restored inside that
 * body (try/finally), never across an await, so no other spec in the shared CI process sees them.
 *
 * Needs no Redis, CouchDB or broker. Log checks report counts, booleans or the index of the
 * sentinel that leaked, never the captured log text; edit diffs show fixture values only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require("chai").expect;
const sha256 = require("sha256");

const Messenger = require("../../lib/thinx/messenger");

// Spec constants (hard-coded on purpose: the spec pins them).
const FLAG = "THINX_MQTT_DEVICE_WRITES";
const LWT_GRACE_MS = 60000;
const REREGISTER_WINDOW_MS = 300000;
const STATUS_MAX = 64;
const DROP_LINE = /\[messenger\] dropped MQTT device message/;

const NOW = Date.parse("2026-10-04T12:00:00.000Z");
const ago = (ms) => new Date(NOW - ms).toISOString();

const OWNER_A = sha256("25u-owner-a");
const OWNER_B = sha256("25u-owner-b");
const UDID_A = "25a00001-a1a1-11f0-8000-00000000000a";
const UDID_B = "25a00002-a1a1-11f0-8000-00000000000b";

const KEY_SENTINEL = "25u-device-key-sentinel";
const PAYLOAD_SENTINEL = "25u-payload-sentinel";
const OTT_SENTINEL = "25u-ott-sentinel";
const SECRETS = [OWNER_A, OWNER_B, KEY_SENTINEL, PAYLOAD_SENTINEL, OTT_SENTINEL];

const statusTopic = (owner, udid) => "/" + owner + "/" + udid + "/status";
const json = (o) => Buffer.from(JSON.stringify(o));
const registration = (udid, owner) => ({ registration: { udid: udid, owner: owner, mac: "AA:BB:CC:00:25:01", firmware: "25u" } });

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

function leaked(lines) {
  return SECRETS.filter((s) => lines.some((l) => l.indexOf(s) !== -1)).map((s) => SECRETS.indexOf(s));
}

function dropLines(lines) {
  return lines.filter((l) => DROP_LINE.test(l));
}

// Runs fn synchronously with the flag and Date.now set, and restores both before returning.
function at(now, flag, fn) {
  const savedFlag = process.env[FLAG];
  const savedNow = Date.now;
  if (flag === null) delete process.env[FLAG];
  else process.env[FLAG] = flag;
  Date.now = () => now;
  try {
    return fn();
  } finally {
    Date.now = savedNow;
    if (typeof (savedFlag) === "undefined") delete process.env[FLAG];
    else process.env[FLAG] = savedFlag;
  }
}

// opts.lastupdate: value for doc A's lastupdate; opts.noLastupdate: delete it; opts.editFails.
function makeMessenger(opts) {
  const options = opts || {};
  const rec = { edits: [], registers: [], keyLookups: [], transformers: [], profiles: [], devicelibGets: [] };
  const docs = {
    [UDID_A]: { _id: UDID_A, udid: UDID_A, owner: OWNER_A, alias: "25u-alias-a", lastkey: sha256(KEY_SENTINEL), lastupdate: ago(3600000), version: "1.0", transformers: [] },
    [UDID_B]: { _id: UDID_B, udid: UDID_B, owner: OWNER_B, alias: "25u-alias-b", lastupdate: ago(3600000), transformers: [] }
  };
  if (Object.prototype.hasOwnProperty.call(options, "lastupdate")) docs[UDID_A].lastupdate = options.lastupdate;
  if (options.noLastupdate) delete docs[UDID_A].lastupdate;

  const m = Object.create(Messenger.prototype);
  m.DISABLE_SLACK = true;
  m.rtm = null;
  m.channel = null;
  m.clients = {};
  m.redis = {
    get(_key, cb) { cb(null, null); },
    set(_key, _value, cb) { if (typeof (cb) === "function") cb(null, "OK"); },
    expire() { /* no-op */ }
  };
  m.akey = {
    get_device_apikey(_owner, _lastkey, cb) {
      rec.keyLookups.push(true);
      cb(true, KEY_SENTINEL);
    },
    checkTransferBinding(_current, _udid, _lastkey, _presented, cb) { cb(null, false); }
  };
  m.devicelib = {
    get(id, cb) {
      rec.devicelibGets.push(id);
      if (!Object.prototype.hasOwnProperty.call(docs, id)) {
        const e = new Error("missing");
        e.statusCode = 404;
        return cb(e);
      }
      cb(null, JSON.parse(JSON.stringify(docs[id])));
    }
  };
  m.device = {
    edit(changes, cb) {
      rec.edits.push(JSON.parse(JSON.stringify(changes)));
      if (options.editFails) return cb(false, { success: false, change: changes });
      cb(true, { success: true, change: changes });
    },
    runDeviceTransformers(_profile, doc) { rec.transformers.push(doc && doc.udid); },
    register() { rec.registers.push({ via: "device.register" }); }
  };
  m.user = { profile(owner, cb) { rec.profiles.push(owner); cb({ owner: owner, info: { transformers: [] } }); } };
  m.registerDevice = (reg, auth, _res, oid) => { rec.registers.push({ udid: reg && reg.udid, authIsKey: auth === KEY_SENTINEL, ownerOk: oid === OWNER_A }); };
  m.publish = () => { /* never reached */ };
  return { m, rec };
}

function send(fx, topic, payload, now, flag) {
  at(now, (typeof (flag) === "undefined") ? "1" : flag, () => {
    fx.m.messageResponder(topic, payload);
  });
}

describe("MessengerDeviceWritesSpec (quick 261004-25u)", function () {

  let lines;

  beforeEach(() => {
    lines = captureConsole();
  });

  afterEach(() => {
    expect(leaked(lines), "sentinels leaked into the log").to.deep.equal([]);
  });

  describe("25U status: only a plain string is written", function () {

    it("S1 a string status is written as that string", function () {
      const fx = makeMessenger();
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "online" }), NOW);
      expect(fx.rec.edits).to.deep.equal([{ udid: UDID_A, status: "online" }]);
    });

    const notStrings = [
      ["an object status", { status: { status: "online", detail: PAYLOAD_SENTINEL } }],
      ["a number status", { status: 42 }],
      ["an array status", { status: ["online", PAYLOAD_SENTINEL] }],
      ["a boolean status", { status: true }],
      ["a null status", { status: null }],
      ["an empty status", { status: "" }],
      ["a control-only status", { status: "\u0000\u0007\n\t\u007f" }]
    ];
    for (const [label, message] of notStrings) {
      it("S2 " + label + " writes nothing and logs one status_not_string line with the udid", function () {
        const fx = makeMessenger();
        send(fx, statusTopic(OWNER_A, UDID_A), json(message), NOW);
        expect(fx.rec.edits.length, "edits").to.equal(0);
        const drops = dropLines(lines);
        expect(drops.length, "drop lines").to.equal(1);
        expect(/status_not_string/.test(drops[0]), "reason code").to.equal(true);
        expect(drops[0].indexOf(UDID_A) !== -1, "sanitized udid").to.equal(true);
      });
    }

    it("S3 a message without a status (a connection change) writes nothing", function () {
      const fx = makeMessenger();
      send(fx, statusTopic(OWNER_A, UDID_A), json({ connected: true, detail: PAYLOAD_SENTINEL }), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(0);
    });

    it("S4 control characters are stripped", function () {
      const fx = makeMessenger();
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "on\u0000li\nne\u001b\u007f\u0085" }), NOW);
      expect(fx.rec.edits).to.deep.equal([{ udid: UDID_A, status: "online" }]);
    });

    it("S5 a long status is cut to 64 characters", function () {
      const fx = makeMessenger();
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "x".repeat(STATUS_MAX + 100) }), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(1);
      expect(fx.rec.edits[0].status).to.equal("x".repeat(STATUS_MAX));
    });

    it("S6 the cut never splits a character outside the BMP", function () {
      const fx = makeMessenger();
      const astral = "\u{1F600}";
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: astral.repeat(STATUS_MAX + 5) }), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(1);
      expect(Array.from(fx.rec.edits[0].status).length).to.equal(STATUS_MAX);
      expect(fx.rec.edits[0].status).to.equal(astral.repeat(STATUS_MAX));
    });

    it("S7 the edit carries exactly {udid, status}", function () {
      const fx = makeMessenger();
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "update_started", lastupdate: "1999-01-01T00:00:00Z", version: PAYLOAD_SENTINEL, owner: OWNER_B }), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(1);
      expect(Object.keys(fx.rec.edits[0]).sort()).to.deep.equal(["status", "udid"]);
      expect(fx.rec.edits[0]).to.deep.equal({ udid: UDID_A, status: "update_started" });
    });
  });

  describe("25U registration: the registration body never edits status", function () {

    it("R1 a registration body writes no status", function () {
      const fx = makeMessenger();
      send(fx, statusTopic(OWNER_A, UDID_A), json(registration(UDID_A, OWNER_A)), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(0);
    });

    it("R2 a registration body that also carries a string status writes no status", function () {
      const fx = makeMessenger();
      const message = registration(UDID_A, OWNER_A);
      message.status = "online";
      send(fx, statusTopic(OWNER_A, UDID_A), json(message), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(0);
    });

    it("R3 an old check-in: registration runs once with the device's own key, no status, no drop line", function () {
      const fx = makeMessenger({ lastupdate: ago(REREGISTER_WINDOW_MS + 60000) });
      send(fx, statusTopic(OWNER_A, UDID_A), json(registration(UDID_A, OWNER_A)), NOW);
      expect(fx.rec.registers).to.deep.equal([{ udid: UDID_A, authIsKey: true, ownerOk: true }]);
      expect(fx.rec.edits.length, "edits").to.equal(0);
      expect(dropLines(lines).length, "drop lines").to.equal(0);
    });

    it("R4 a check-in 1 minute ago: registration is skipped with one registration_recent_checkin line", function () {
      const fx = makeMessenger({ lastupdate: ago(60000) });
      send(fx, statusTopic(OWNER_A, UDID_A), json(registration(UDID_A, OWNER_A)), NOW);
      expect(fx.rec.registers.length, "registrations").to.equal(0);
      expect(fx.rec.keyLookups.length, "key lookups").to.equal(0);
      expect(fx.rec.edits.length, "edits").to.equal(0);
      const drops = dropLines(lines);
      expect(drops.length, "drop lines").to.equal(1);
      expect(/registration_recent_checkin/.test(drops[0]), "reason code").to.equal(true);
      expect(drops[0].indexOf(UDID_A) !== -1, "sanitized udid").to.equal(true);
    });

    it("R5 the window boundary: 5 min minus 1 ms skips, exactly 5 min registers", function () {
      const inside = makeMessenger({ lastupdate: ago(REREGISTER_WINDOW_MS - 1) });
      send(inside, statusTopic(OWNER_A, UDID_A), json(registration(UDID_A, OWNER_A)), NOW);
      expect(inside.rec.registers.length, "registrations inside the window").to.equal(0);
      const edge = makeMessenger({ lastupdate: ago(REREGISTER_WINDOW_MS) });
      send(edge, statusTopic(OWNER_A, UDID_A), json(registration(UDID_A, OWNER_A)), NOW);
      expect(edge.rec.registers.length, "registrations at the window").to.equal(1);
    });
  });

  describe("25U LWT: a stale disconnect never overrides a fresh check-in", function () {

    it("L1 'disconnected' 30 s after the check-in is ignored with one status_stale_disconnect line", function () {
      const fx = makeMessenger({ lastupdate: ago(30000) });
      send(fx, statusTopic(OWNER_A, UDID_A), Buffer.from("{ \"status\" : \"disconnected\" }"), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(0);
      const drops = dropLines(lines);
      expect(drops.length, "drop lines").to.equal(1);
      expect(/status_stale_disconnect/.test(drops[0]), "reason code").to.equal(true);
      expect(drops[0].indexOf(UDID_A) !== -1, "sanitized udid").to.equal(true);
    });

    it("L2 the grace boundary: 60 s minus 1 ms is ignored, exactly 60 s is written", function () {
      const inside = makeMessenger({ lastupdate: ago(LWT_GRACE_MS - 1) });
      send(inside, statusTopic(OWNER_A, UDID_A), json({ status: "disconnected" }), NOW);
      expect(inside.rec.edits.length, "edits inside the grace").to.equal(0);
      const edge = makeMessenger({ lastupdate: ago(LWT_GRACE_MS) });
      send(edge, statusTopic(OWNER_A, UDID_A), json({ status: "disconnected" }), NOW);
      expect(edge.rec.edits).to.deep.equal([{ udid: UDID_A, status: "disconnected" }]);
    });

    it("L3 'disconnected' 2 min after the check-in is written", function () {
      const fx = makeMessenger({ lastupdate: ago(120000) });
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "disconnected" }), NOW);
      expect(fx.rec.edits).to.deep.equal([{ udid: UDID_A, status: "disconnected" }]);
    });

    for (const status of ["connected", "update_started", "online"]) {
      it("L4 '" + status + "' is written 1 s after the check-in", function () {
        const fx = makeMessenger({ lastupdate: ago(1000) });
        send(fx, statusTopic(OWNER_A, UDID_A), json({ status: status }), NOW);
        expect(fx.rec.edits).to.deep.equal([{ udid: UDID_A, status: status }]);
      });
    }

    it("L5 the stale disconnect still sends the owner's Check-out toast path unchanged (processStatus runs)", function () {
      const fx = makeMessenger({ lastupdate: ago(30000) });
      const seen = [];
      fx.m.processStatus = (oid, did, message) => { seen.push(message.status); };
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "disconnected" }), NOW);
      expect(seen).to.deep.equal(["disconnected"]);
    });
  });

  describe("25U lastupdate: missing or invalid counts as old", function () {

    const invalid = [
      ["missing", { noLastupdate: true }],
      ["null", { lastupdate: null }],
      ["not a date", { lastupdate: "not-a-date" }],
      ["a number", { lastupdate: NOW - 1000 }],
      ["an object", { lastupdate: { at: NOW } }],
      ["in the future", { lastupdate: new Date(NOW + 30000).toISOString() }]
    ];
    for (const [label, opts] of invalid) {
      it("V1 " + label + ": 'disconnected' is written", function () {
        const fx = makeMessenger(opts);
        send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "disconnected" }), NOW);
        expect(fx.rec.edits).to.deep.equal([{ udid: UDID_A, status: "disconnected" }]);
      });

      it("V2 " + label + ": registration runs", function () {
        const fx = makeMessenger(opts);
        send(fx, statusTopic(OWNER_A, UDID_A), json(registration(UDID_A, OWNER_A)), NOW);
        expect(fx.rec.registers.length, "registrations").to.equal(1);
      });
    }
  });

  describe("25U unchanged gates", function () {

    it("G1 flag off: nothing is written and nothing registers", function () {
      const fx = makeMessenger();
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "online" }), NOW, null);
      send(fx, statusTopic(OWNER_A, UDID_A), json(registration(UDID_A, OWNER_A)), NOW, null);
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "online" }), NOW, "true");
      expect(fx.rec.edits.length, "edits").to.equal(0);
      expect(fx.rec.registers.length, "registrations").to.equal(0);
    });

    it("G2 transformers never run and no profile is loaded", function () {
      const fx = makeMessenger();
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "online" }), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(1);
      expect(fx.rec.transformers.length, "transformer runs").to.equal(0);
      expect(fx.rec.profiles.length, "profile loads").to.equal(0);
    });

    it("G3 vbg's owner gate: another owner's device is neither edited nor registered", function () {
      const fx = makeMessenger();
      send(fx, statusTopic(OWNER_A, UDID_B), json({ status: "online" }), NOW);
      send(fx, statusTopic(OWNER_A, UDID_B), json(registration(UDID_B, OWNER_A)), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(0);
      expect(fx.rec.registers.length, "registrations").to.equal(0);
    });

    it("G4 skip lines are rate-capped by the shared drop limiter", function () {
      const fx = makeMessenger({ lastupdate: ago(1000) });
      for (let i = 0; i < 12; i++) {
        send(fx, statusTopic(OWNER_A, UDID_A), json({ status: "disconnected" }), NOW);
      }
      expect(fx.rec.edits.length, "edits").to.equal(0);
      expect(dropLines(lines).length, "drop lines").to.equal(5);
    });
  });

  describe("25U logging: no payload, owner id or key material", function () {

    it("K1 a failed edit logs one status_edit_failed line without the status", function () {
      const fx = makeMessenger({ editFails: true });
      send(fx, statusTopic(OWNER_A, UDID_A), json({ status: PAYLOAD_SENTINEL }), NOW);
      expect(fx.rec.edits.length, "edits").to.equal(1);
      const drops = dropLines(lines);
      expect(drops.length, "drop lines").to.equal(1);
      expect(/status_edit_failed/.test(drops[0]), "reason code").to.equal(true);
    });

    function realRegister(success, body) {
      const m = Object.create(Messenger.prototype);
      const publishes = [];
      m.publish = (owner, udid, message) => publishes.push({ owner, udid, message });
      m.device = { register(reg, auth, res, cb) { cb(res, success, body); } };
      return { m, publishes };
    }

    it("K2 a successful registration response is not logged with its owner id", function () {
      const { m, publishes } = realRegister(true, { registration: { success: true, status: "OK", owner: OWNER_A, alias: "a", udid: UDID_A, iv: PAYLOAD_SENTINEL } });
      expect(() => m.registerDevice({ udid: UDID_A, owner: OWNER_A }, KEY_SENTINEL, null, OWNER_A)).to.not.throw();
      expect(publishes.length, "publishes").to.equal(1);
    });

    it("K3 a firmware-update response (a JSON string carrying the OTT) is not logged as a failure reason", function () {
      const response = JSON.stringify({ registration: { status: "FIRMWARE_UPDATE", ott: OTT_SENTINEL, mac: "AA:BB:CC:00:25:01", udid: UDID_A, owner: OWNER_A } });
      const { m } = realRegister(true, response);
      expect(() => m.registerDevice({ udid: UDID_A, owner: OWNER_A }, KEY_SENTINEL, null, OWNER_A)).to.not.throw();
    });

    it("K4 a reason-code failure is still logged with its code", function () {
      const { m, publishes } = realRegister(false, "device_update_failed");
      expect(() => m.registerDevice({ udid: UDID_A, owner: OWNER_A }, KEY_SENTINEL, null, OWNER_A)).to.not.throw();
      expect(publishes.length, "publishes").to.equal(0);
      expect(lines.some((l) => /registration over MQTT failed: device_update_failed/.test(l)), "reason code logged").to.equal(true);
    });
  });
});
