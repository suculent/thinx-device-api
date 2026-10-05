/*
 * Messenger console frames are routed per owner (quick 261003-vn3, threat T-v05-07).
 *
 * Runs without Redis and without CouchDB: the Messenger is built with
 * Object.create(Messenger.prototype) plus recording fakes, and the WebSocket cases run a real
 * ws server/client pair through SocketSession.accept (the harness is copied from v05's
 * LogTailOwnerSpec; no spec file requires another).
 *
 * Pins:
 * - per-owner routing: every console frame the messenger writes (device connected/disconnected,
 *   check-in/out, actionable notifications, the unknown-message debug notice) goes only to the
 *   sockets subscribed for the owner it belongs to, never to the socket that sent init last;
 * - subscription by init: only a socket that sent init is subscribed, keyed by its verified
 *   owner (ws.owner, set by SocketSession); initWithOwner refuses a socket bound to another owner;
 * - several sockets (tabs) per owner each receive a frame exactly once;
 * - close cleanup: a closed socket leaves the subscriptions, a non-OPEN socket is pruned at send;
 * - the unknown-owner drop: a frame without a usable owner (and every Slack RTM message) is
 *   dropped with one log line that carries no payload;
 * - transferred devices accepted by quick 261003-vbg's transfer binding notify the device's
 *   current owner (the owner vbg acts as), never the topic owner;
 * - SocketSession's registry (app._ws) drops a closed connection's entry unless a newer
 *   connection replaced it.
 *
 * Never prints cookies, session ids or frame payloads: failures report counts and booleans.
 */

if (typeof process.env.ENVIRONMENT === "undefined") process.env.ENVIRONMENT = "development";

const expect = require("chai").expect;
const fs = require("fs");
const path = require("path");
const http = require("http");
const EventEmitter = require("events");
const WebSocket = require("ws");

const Messenger = require("../../lib/thinx/messenger");

const MESSENGER_PATH = path.join(__dirname, "../../lib/thinx/messenger.js");
const SOCKET_SESSION_PATH = path.join(__dirname, "../../lib/thinx/socket_session.js");
const CORE_PATH = path.join(__dirname, "../../thinx-core.js");

let SocketSession = null;
try { SocketSession = require(SOCKET_SESSION_PATH); } catch (_e) { SocketSession = null; }

const OWNER_A = "a1".repeat(32);
const OWNER_B = "b2".repeat(32);
const OWNER_C = "c3".repeat(32);

const UDID_A = "a0700000-0000-4000-8000-0000000000a1";
const UDID_B = "b0700000-0000-4000-8000-0000000000b1";
const UDID_T = "d0700000-0000-4000-8000-0000000000d1"; // owned by B, transferred from A
const UDID_MISSING = "c0700000-0000-4000-8000-0000000000c1";

const ALIAS_A = "vn3-alias-a";
const ALIAS_B = "vn3-alias-b-sentinel";
const ALIAS_T = "vn3-alias-t";

const PAYLOAD_SENTINEL = "vn3-payload-sentinel";
const SLACK_SENTINEL = "vn3-slack-sentinel";
const SLACK_USER = "U0VN3";

const DROP_LINE = /\[messenger\].*dropped/;

const DOCS = {};
DOCS[UDID_A] = { _id: UDID_A, udid: UDID_A, owner: OWNER_A, alias: ALIAS_A };
DOCS[UDID_B] = { _id: UDID_B, udid: UDID_B, owner: OWNER_B, alias: ALIAS_B };
DOCS[UDID_T] = { _id: UDID_T, udid: UDID_T, owner: OWNER_B, previous_owner: OWNER_A, lastkey: "vn3-lastkey-t", alias: ALIAS_T };

function captureConsole() {
  const lines = [];
  const record = (...args) => lines.push(args.map((a) => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch (_e) { return String(a); }
  }).join(" "));
  for (const level of ["log", "info", "warn", "error", "debug"]) spyOn(console, level).and.callFake(record);
  return lines;
}

function mentions(lines, needle) {
  return lines.some((l) => l.indexOf(needle) !== -1);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitFor(fn, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = fn();
    if (v) return v;
    await sleep(20);
  }
  return fn() || null;
}

// Comment lines are ignored the way CsrfRouteInventorySpec's registrationLines does.
function codeLines(src) {
  return src.split("\n").filter((line) => {
    const t = line.trim();
    return !(t.indexOf("//") === 0 || t.indexOf("*") === 0 || t.indexOf("/*") === 0);
  });
}

function connectionRegion(src) {
  let start = src.indexOf("wss.on('connection'");
  if (start === -1) start = src.indexOf('wss.on("connection"');
  if (start === -1) return null;
  const end = src.indexOf('.on("error"', start);
  return src.substring(start, end === -1 ? src.length : end);
}

class FakeSocket extends EventEmitter {
  constructor(owner) {
    super();
    if (typeof owner !== "undefined") this.owner = owner;
    this.readyState = 1;
    this.sent = [];
  }
  send(d) {
    if (this.readyState !== 1) throw new Error("vn3 fake socket not open");
    this.sent.push(String(d));
  }
  close() {
    this.readyState = 3;
    this.emit("close");
  }
}

function frames(sock) {
  return sock.sent.map((s) => JSON.parse(s));
}

function makeMessenger(opts) {
  const options = opts || {};
  const rec = { mqttKeys: [], redisSets: [], bindingChecks: 0 };
  const m = Object.create(Messenger.prototype);
  m.DISABLE_SLACK = true;
  m.clients = {};
  m.clients[OWNER_A] = { vn3: true };
  m.clients[OWNER_B] = { vn3: true };
  m.clients[OWNER_C] = { vn3: true };
  m.user = {
    mqtt_key(o, cb) {
      rec.mqttKeys.push(o);
      setImmediate(() => cb(true, { key: "vn3-fake-key", hash: "vn3-fake-hash" }));
    },
    create_default_mqtt_apikey(_o, cb) { cb(true); },
    profile(_o, cb) { cb({ info: { transformers: [] } }); }
  };
  // Synchronous, so a throw surfaces at the call site.
  m.devicelib = {
    get(id, cb) {
      if (Object.prototype.hasOwnProperty.call(DOCS, id)) return cb(null, JSON.parse(JSON.stringify(DOCS[id])));
      cb(Object.assign(new Error("missing"), { statusCode: 404 }));
    }
  };
  m.device = {
    edit(_c, cb) { cb(true); },
    runDeviceTransformers() { /* no-op */ }
  };
  m.redis = {
    get(_k, cb) { cb(null, null); },
    set(k, _v) { rec.redisSets.push(k); },
    expire() { /* no-op */ }
  };
  // quick 261003-vbg's transfer-binding lookup (consulted only for a device the topic owner does not own).
  m.akey = {
    checkTransferBinding(_current, _udid, _lastkey, _presented, cb) {
      rec.bindingChecks++;
      cb(null, options.bound === true);
    }
  };
  return { m, rec };
}

function init(m, owner, sock) {
  return new Promise((resolve) => {
    m.initWithOwner(owner, sock, (success, status) => resolve([success, status]));
  });
}

function connected(m, owner, udid) {
  m.processConnectionChange(owner, udid, { connected: true });
}

describe("MessengerOwnerSocketSpec (quick 261003-vn3)", function () {

  let lines;
  let server, wss, port;
  const accepted = [];
  const clients = [];
  const ctx = { registry: {}, blog: { logtail() { /* unused */ } }, messenger: null, callback() { /* unused */ } };

  function sessionFromCookie(cookie) {
    const match = /(?:^|;\s*)sid=([^;]*)/.exec(cookie || "");
    if (match && match[1] === "a") return { owner: OWNER_A };
    if (match && match[1] === "b") return { owner: OWNER_B };
    return {};
  }

  beforeAll(function (done) {
    server = http.createServer();
    wss = new WebSocket.Server({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      request.session = sessionFromCookie(request.headers.cookie);
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
    });
    wss.on("connection", (ws, request) => {
      accepted.push({ ws: ws, url: request.url });
      if (SocketSession === null) {
        ws.close(1011, "socket_session missing");
        return;
      }
      SocketSession.accept(ws, request, ctx);
    });
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      done();
    });
  });

  afterAll(function (done) {
    for (const c of clients) { try { c.ws.terminate(); } catch (_e) { /* ignore */ } }
    if (wss) for (const s of wss.clients) { try { s.terminate(); } catch (_e) { /* ignore */ } }
    wss.close(() => server.close(() => done()));
  });

  beforeEach(function () {
    lines = captureConsole();
  });

  afterEach(function () {
    while (clients.length) {
      const c = clients.pop();
      try { c.ws.close(); } catch (_e) { /* ignore */ }
    }
  });

  function openClient(urlPath, cookie) {
    const headers = {};
    if (typeof cookie === "string") headers.Cookie = cookie;
    const ws = new WebSocket("ws://127.0.0.1:" + port + urlPath, { headers: headers });
    const client = { ws: ws, frames: [], close: null, opened: false };
    ws.on("open", () => { client.opened = true; });
    ws.on("message", (data) => { client.frames.push(String(data)); });
    ws.on("close", (code) => { client.close = { code: code }; });
    ws.on("error", (_err) => { /* open/close/timeouts decide */ });
    clients.push(client);
    return client;
  }

  function waitOpen(client, ms) { return waitFor(() => client.opened || client.close !== null, ms); }
  function waitFrame(client, predicate, ms) { return waitFor(() => client.frames.find(predicate), ms); }
  function serverSocketFor(urlPath) {
    const list = accepted.filter((a) => a.url === urlPath);
    return list.length ? list[list.length - 1].ws : null;
  }
  function sendJson(client, obj) { client.ws.send(JSON.stringify(obj)); }
  function parsed(client) {
    return client.frames.map((f) => { try { return JSON.parse(f); } catch (_e) { return null; } });
  }
  function hasUdid(udid) {
    return (f) => { try { const o = JSON.parse(f); return !!(o && o.notification && o.notification.udid === udid); } catch (_e) { return false; } };
  }

  // Opens a client, waits for it, sends {init: <value>} and waits for the messenger call.
  async function openAndInit(m, urlPath, cookie, initValue) {
    const before = m.initWithOwner.calls.count();
    const client = openClient(urlPath, cookie);
    expect(await waitOpen(client, 3000), "open " + urlPath.length).to.equal(true);
    expect(client.close, "closed at accept").to.equal(null);
    sendJson(client, { init: initValue });
    expect(await waitFor(() => m.initWithOwner.calls.count() === before + 1, 3000), "initWithOwner called").to.equal(true);
    return client;
  }

  function freshWsMessenger() {
    const fx = makeMessenger();
    ctx.messenger = fx.m;
    spyOn(fx.m, "initWithOwner").and.callThrough();
    for (const k of Object.keys(ctx.registry)) delete ctx.registry[k];
    accepted.length = 0;
    return fx;
  }

  describe("MSGR route: per-owner subscriptions", function () {

    it("R1 owner A's frame reaches only A's socket even after B sent init last", async function () {
      const { m } = makeMessenger();
      const a1 = new FakeSocket(OWNER_A);
      const b1 = new FakeSocket(OWNER_B);
      expect(await init(m, OWNER_A, a1)).to.deep.equal([true, "client_already_exists"]);
      expect(await init(m, OWNER_B, b1)).to.deep.equal([true, "client_already_exists"]);

      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      expect(a1.sent.length, "frames on a1").to.equal(1);
      expect(frames(a1)[0]).to.deep.equal({ notification: { title: "Device Connected", body: OWNER_A, type: "info", udid: UDID_A } });
      expect(b1.sent.length, "frames on b1").to.equal(0);

      expect(() => m.processConnectionChange(OWNER_B, UDID_B, { connected: false })).to.not.throw();
      expect(b1.sent.length, "frames on b1").to.equal(1);
      expect(frames(b1)[0].notification.title).to.equal("Device Disconnected");
      expect(a1.sent.length, "frames on a1").to.equal(1);
    }, 15000);

    it("R2 every subscribed socket of the owner gets the frame once", async function () {
      const { m } = makeMessenger();
      expect(typeof m.subscriberCount).to.equal("function");
      const a1 = new FakeSocket(OWNER_A);
      const a2 = new FakeSocket(OWNER_A);
      const b1 = new FakeSocket(OWNER_B);
      await init(m, OWNER_A, a1);
      await init(m, OWNER_A, a2);
      await init(m, OWNER_B, b1);
      expect(m.subscriberCount(OWNER_A)).to.equal(2);
      expect(m.subscriberCount(OWNER_B)).to.equal(1);
      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      expect(a1.sent.length, "frames on a1").to.equal(1);
      expect(a2.sent.length, "frames on a2").to.equal(1);
      expect(b1.sent.length, "frames on b1").to.equal(0);
    }, 15000);

    it("R3 a socket that sent init twice is subscribed once", async function () {
      const { m } = makeMessenger();
      expect(typeof m.subscriberCount).to.equal("function");
      const a1 = new FakeSocket(OWNER_A);
      await init(m, OWNER_A, a1);
      await init(m, OWNER_A, a1);
      expect(m.subscriberCount(OWNER_A)).to.equal(1);
      expect(a1.listenerCount("close")).to.equal(1);
      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      expect(a1.sent.length, "frames on a1").to.equal(1);
    }, 15000);

    it("R4 closed sockets leave and non-OPEN sockets are pruned", async function () {
      const { m } = makeMessenger();
      expect(typeof m.subscriberCount).to.equal("function");
      const a1 = new FakeSocket(OWNER_A);
      const a2 = new FakeSocket(OWNER_A);
      await init(m, OWNER_A, a1);
      await init(m, OWNER_A, a2);
      a1.close();
      expect(m.subscriberCount(OWNER_A)).to.equal(1);
      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      expect(a1.sent.length, "frames on a1").to.equal(0);
      expect(a2.sent.length, "frames on a2").to.equal(1);
      a2.close();
      expect(m.subscriberCount(OWNER_A)).to.equal(0);

      const a3 = new FakeSocket(OWNER_A);
      await init(m, OWNER_A, a3);
      a3.readyState = 3; // no close event
      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      expect(a3.sent.length, "frames on a3").to.equal(0);
      expect(m.subscriberCount(OWNER_A)).to.equal(0);
    }, 15000);

    it("R4b a socket whose send throws is dropped without a payload in the log", async function () {
      const { m } = makeMessenger();
      expect(typeof m.subscriberCount).to.equal("function");
      const a1 = new FakeSocket(OWNER_A);
      const a2 = new FakeSocket(OWNER_A);
      a1.send = () => { throw new Error("vn3 broken pipe " + PAYLOAD_SENTINEL); };
      await init(m, OWNER_A, a1);
      await init(m, OWNER_A, a2);
      let count = null;
      expect(() => { count = m.sendToOwner(OWNER_A, { notification: { body: PAYLOAD_SENTINEL } }); }).to.not.throw();
      expect(count).to.equal(1);
      expect(a2.sent.length, "frames on a2").to.equal(1);
      expect(m.subscriberCount(OWNER_A)).to.equal(1);
      expect(mentions(lines, PAYLOAD_SENTINEL), "payload or error text in the log").to.equal(false);
    }, 15000);

    it("R5 initWithOwner refuses a socket not bound to the owner and starts nothing", async function () {
      const { m, rec } = makeMessenger();
      expect(typeof m.subscriberCount).to.equal("function");
      const foreign = new FakeSocket(OWNER_B);
      const anonymous = new FakeSocket();
      const noSend = { owner: OWNER_A, readyState: 1 };
      for (const sock of [foreign, anonymous, noSend]) {
        expect(await init(m, OWNER_A, sock)).to.deep.equal([false, "socket_owner_mismatch"]);
      }
      expect(rec.mqttKeys.length, "mqtt_key calls").to.equal(0);
      expect(m.subscriberCount(OWNER_A)).to.equal(0);
      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      expect(foreign.sent.length + anonymous.sent.length, "frames on refused sockets").to.equal(0);
    }, 15000);

    it("R6 unknown or unusable owners get nothing and nothing throws", async function () {
      const { m } = makeMessenger();
      expect(typeof m.sendToOwner).to.equal("function");
      const a1 = new FakeSocket(OWNER_A);
      const b1 = new FakeSocket(OWNER_B);
      await init(m, OWNER_A, a1);
      await init(m, OWNER_B, b1);
      const notif = { notification: { body: PAYLOAD_SENTINEL } };

      for (const owner of [OWNER_C, "__proto__", "constructor", "toString"]) {
        let count = null;
        expect(() => { count = m.sendToOwner(owner, notif); }).to.not.throw();
        expect(count).to.equal(0);
      }
      for (const owner of [undefined, null, 5, "", {}]) {
        let count = null;
        expect(() => { count = m.sendToOwner(owner, notif); }).to.not.throw();
        expect(count).to.equal(0);
      }
      expect(a1.sent.length + b1.sent.length, "frames on subscribed sockets").to.equal(0);
      expect(lines.some((l) => DROP_LINE.test(l)), "drop line").to.equal(true);
      expect(mentions(lines, PAYLOAD_SENTINEL), "payload in the log").to.equal(false);
    }, 15000);
  });

  describe("MSGR writers: every console writer names its owner", function () {

    let m, rec, a1, b1;

    beforeEach(async function () {
      ({ m, rec } = makeMessenger());
      a1 = new FakeSocket(OWNER_A);
      b1 = new FakeSocket(OWNER_B);
      await init(m, OWNER_A, a1);
      await init(m, OWNER_B, b1); // B last
    });

    it("W1 check-in and check-out reach only the topic owner", function () {
      expect(() => m.processStatus(OWNER_A, UDID_A, { status: "connected" })).to.not.throw();
      expect(a1.sent.length, "frames on a1").to.equal(1);
      const checkin = frames(a1)[0].notification;
      expect(checkin.title).to.equal("Check-in");
      expect(checkin.body.indexOf(ALIAS_A)).to.not.equal(-1);
      expect(checkin.udid).to.equal(UDID_A);
      expect(b1.sent.length, "frames on b1").to.equal(0);

      expect(() => m.processStatus(OWNER_A, UDID_A, { status: "disconnected" })).to.not.throw();
      expect(a1.sent.length, "frames on a1").to.equal(2);
      expect(frames(a1)[1].notification.title).to.equal("Check-out");
      expect(b1.sent.length, "frames on b1").to.equal(0);
    }, 15000);

    it("W2 another owner's device or an unknown udid on A's topic produces no frame and no alias", function () {
      expect(() => m.processStatus(OWNER_A, UDID_B, { status: "connected" })).to.not.throw();
      expect(() => m.processStatus(OWNER_A, UDID_MISSING, { status: "connected" })).to.not.throw();
      expect(a1.sent.length + b1.sent.length, "frames").to.equal(0);
      expect(mentions(lines, ALIAS_B), "foreign alias in the log").to.equal(false);
    }, 15000);

    it("W2b a transferred device accepted through vbg's binding notifies its current owner, not the topic owner", async function () {
      ({ m, rec } = makeMessenger({ bound: true }));
      a1 = new FakeSocket(OWNER_A);
      b1 = new FakeSocket(OWNER_B);
      await init(m, OWNER_A, a1);
      await init(m, OWNER_B, b1);
      expect(() => m.processStatus(OWNER_A, UDID_T, { status: "connected" })).to.not.throw();
      expect(rec.bindingChecks, "binding lookups").to.equal(1);
      expect(a1.sent.length, "frames on the topic owner's socket").to.equal(0);
      expect(b1.sent.length, "frames on the current owner's socket").to.equal(1);
      expect(frames(b1)[0].notification.body.indexOf(ALIAS_T)).to.not.equal(-1);

      expect(() => m.processActionableNotification(OWNER_A, UDID_T, "/" + OWNER_A + "/" + UDID_T, { notification: { body: "press", response_type: "bool" } })).to.not.throw();
      expect(a1.sent.length, "frames on the topic owner's socket").to.equal(0);
      expect(b1.sent.length, "frames on the current owner's socket").to.equal(2);
      expect(frames(b1)[1].notification.type).to.equal("actionable");
    }, 15000);

    it("W3 an actionable notification reaches only its owner, before topic/done are attached", function () {
      const topic = "/" + OWNER_A + "/" + UDID_A + "/notification";
      expect(() => m.processActionableNotification(OWNER_A, UDID_A, topic, { notification: { body: "press", response_type: "bool" } })).to.not.throw();
      expect(a1.sent.length, "frames on a1").to.equal(1);
      const frame = frames(a1)[0];
      expect(frame.notification.type).to.equal("actionable");
      expect(frame.notification.nid).to.equal(UDID_A);
      expect(Object.prototype.hasOwnProperty.call(frame, "topic"), "topic key").to.equal(false);
      expect(Object.prototype.hasOwnProperty.call(frame, "done"), "done key").to.equal(false);
      expect(b1.sent.length, "frames on b1").to.equal(0);
      expect(rec.redisSets.indexOf("nid:" + UDID_A)).to.not.equal(-1);
    }, 15000);

    it("W4 the unknown-message debug notice reaches only its owner", function () {
      expect(() => m.processUnknownNotification({ foo: "bar" }, OWNER_A)).to.not.throw();
      expect(a1.sent.length, "frames on a1").to.equal(1);
      expect(frames(a1)[0].notification.type).to.equal("success");
      expect(b1.sent.length, "frames on b1").to.equal(0);
    }, 15000);

    it("W5 MQTT messages are routed by their topic owner", function () {
      expect(() => m.messageResponder("/" + OWNER_A + "/" + UDID_A + "/telemetry", Buffer.from(JSON.stringify({ connected: true })))).to.not.throw();
      expect(a1.sent.length, "frames on a1").to.equal(1);
      expect(frames(a1)[0].notification.title).to.equal("Device Connected");
      expect(b1.sent.length, "frames on b1").to.equal(0);

      expect(() => m.messageResponder("/" + OWNER_B + "/" + UDID_B + "/telemetry", Buffer.from(JSON.stringify({ notification: { body: "x" } })))).to.not.throw();
      expect(b1.sent.length, "frames on b1").to.equal(1);
      expect(frames(b1)[0].notification.type).to.equal("actionable");
      expect(a1.sent.length, "frames on a1").to.equal(1);
    }, 15000);

    it("W6 Slack RTM messages have no owner and are dropped without user or text in the log", function () {
      m.rtm = new EventEmitter();
      m.attachCallbacks();
      expect(() => m.rtm.emit("message", { user: SLACK_USER, text: SLACK_SENTINEL })).to.not.throw();
      expect(a1.sent.length + b1.sent.length, "frames").to.equal(0);
      expect(lines.some((l) => DROP_LINE.test(l)), "drop line").to.equal(true);
      expect(mentions(lines, SLACK_SENTINEL), "Slack text in the log").to.equal(false);
      expect(mentions(lines, SLACK_USER), "Slack user in the log").to.equal(false);
    }, 15000);
  });

  describe("MSGR e2e: real WebSocket through SocketSession", function () {

    let m;

    beforeEach(function () {
      ({ m } = freshWsMessenger());
    });

    it("E1 (tracer) A's MQTT frame reaches A's browser socket and not B's, with B initialized last", async function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const A1 = await openAndInit(m, "/" + OWNER_A, "sid=a", OWNER_A);
      const B1 = await openAndInit(m, "/" + OWNER_B, "sid=b", OWNER_B);
      expect(() => m.messageResponder("/" + OWNER_A + "/" + UDID_A + "/telemetry", Buffer.from(JSON.stringify({ connected: true })))).to.not.throw();
      expect(!!(await waitFrame(A1, hasUdid(UDID_A), 3000)), "frame on A1").to.equal(true);
      await sleep(300);
      expect(B1.frames.length, "frames on B1").to.equal(0);
    }, 15000);

    it("E2 two tabs of A each get A's frame, B gets none", async function () {
      const A1 = await openAndInit(m, "/" + OWNER_A, "sid=a", OWNER_A);
      const A2 = await openAndInit(m, "/" + OWNER_A + "?tab=2", "sid=a", OWNER_A);
      const B1 = await openAndInit(m, "/" + OWNER_B, "sid=b", OWNER_B);
      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      expect(!!(await waitFrame(A1, hasUdid(UDID_A), 3000)), "frame on A1").to.equal(true);
      expect(!!(await waitFrame(A2, hasUdid(UDID_A), 3000)), "frame on A2").to.equal(true);
      await sleep(300);
      expect(A1.frames.length, "frames on A1").to.equal(1);
      expect(A2.frames.length, "frames on A2").to.equal(1);
      expect(B1.frames.length, "frames on B1").to.equal(0);
    }, 15000);

    it("E3 closed tabs leave the subscriptions", async function () {
      expect(typeof m.subscriberCount).to.equal("function");
      const A1 = await openAndInit(m, "/" + OWNER_A, "sid=a", OWNER_A);
      const A2 = await openAndInit(m, "/" + OWNER_A + "?tab=2", "sid=a", OWNER_A);
      const B1 = await openAndInit(m, "/" + OWNER_B, "sid=b", OWNER_B);

      A1.ws.close();
      expect(await waitFor(() => m.subscriberCount(OWNER_A) === 1, 3000), "A1 unsubscribed").to.equal(true);
      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      expect(!!(await waitFrame(A2, hasUdid(UDID_A), 3000)), "frame on A2").to.equal(true);
      expect(A1.frames.length, "frames on A1").to.equal(0);

      A2.ws.close();
      expect(await waitFor(() => m.subscriberCount(OWNER_A) === 0, 3000), "A2 unsubscribed").to.equal(true);
      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      await sleep(300);
      expect(B1.frames.length, "frames on B1").to.equal(0);
    }, 15000);

    it("E4 the log connection that never sent init gets no notification frames", async function () {
      const A1 = await openAndInit(m, "/" + OWNER_A, "sid=a", OWNER_A);
      const L1 = openClient("/" + OWNER_A + "/777", "sid=a");
      expect(await waitOpen(L1, 3000)).to.equal(true);
      expect(L1.close, "log connection closed at accept").to.equal(null);
      expect(() => connected(m, OWNER_A, UDID_A)).to.not.throw();
      expect(!!(await waitFrame(A1, hasUdid(UDID_A), 3000)), "frame on A1").to.equal(true);
      await sleep(300);
      expect(L1.frames.length, "frames on L1").to.equal(0);
    }, 15000);

    it("E5 an init naming another owner subscribes the socket's verified owner only", async function () {
      expect(typeof m.subscriberCount).to.equal("function");
      const A1 = await openAndInit(m, "/" + OWNER_A, "sid=a", OWNER_B);
      expect(m.subscriberCount(OWNER_A)).to.equal(1);
      expect(m.subscriberCount(OWNER_B)).to.equal(0);
      expect(() => connected(m, OWNER_B, UDID_B)).to.not.throw();
      await sleep(300);
      expect(parsed(A1).length, "frames on A1").to.equal(0);
    }, 15000);
  });

  describe("MSGR static: messenger and wiring", function () {

    it("S1 messenger.js has no single-socket field and exactly one socket send", function () {
      const code = codeLines(fs.readFileSync(MESSENGER_PATH, "utf8")).join("\n");
      expect(/\._socket\b/.test(code), "._socket").to.equal(false);
      expect(/\bthis\.socket\b/.test(code), "this.socket").to.equal(false);
      expect(/sendWithValidSocket/.test(code), "sendWithValidSocket").to.equal(false);
      expect((code.match(/\.send\(/g) || []).length, "socket sends").to.equal(1);
      expect(code.indexOf("sendToOwner(")).to.not.equal(-1);
    });

    it("S2 SocketSession initializes the messenger with the verified owner and the arriving socket; thinx-core wires app.messenger", function () {
      const session = codeLines(fs.readFileSync(SOCKET_SESSION_PATH, "utf8")).join("\n");
      // v05 spells it `const owner = ws.owner; ctx.messenger.initWithOwner(owner, ws, ...)`.
      const direct = /initWithOwner\(\s*ws\.owner\s*,\s*ws\s*,/.test(session);
      const viaLocal = /const\s+owner\s*=\s*ws\.owner\s*;\s*ctx\.messenger\.initWithOwner\(\s*owner\s*,\s*ws\s*,/.test(session);
      expect(direct || viaLocal, "initWithOwner(ws.owner, ws, ...)").to.equal(true);

      const region = connectionRegion(fs.readFileSync(CORE_PATH, "utf8"));
      expect(region, "wss.on('connection') region").to.not.equal(null);
      expect(region.indexOf("SocketSession.accept(")).to.not.equal(-1);
      expect(/messenger:\s*app\.messenger\b/.test(region), "messenger: app.messenger").to.equal(true);
    });
  });

  describe("WSREG close: SocketSession registry cleanup", function () {

    beforeEach(function () {
      freshWsMessenger();
    });

    it("G1 an owner connection's registry entry is removed on close", async function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const A1 = openClient("/" + OWNER_A, "sid=a");
      expect(await waitOpen(A1, 3000)).to.equal(true);
      expect(await waitFor(() => ctx.registry[OWNER_A] === serverSocketFor("/" + OWNER_A), 3000), "registered").to.equal(true);
      A1.ws.close();
      expect(await waitFor(() => typeof ctx.registry[OWNER_A] === "undefined", 3000), "removed").to.equal(true);
    }, 15000);

    it("G2 a log connection's registry entry is removed on close", async function () {
      const L1 = openClient("/" + OWNER_A + "/555", "sid=a");
      expect(await waitOpen(L1, 3000)).to.equal(true);
      expect(await waitFor(() => ctx.registry[OWNER_A + "/555"] === serverSocketFor("/" + OWNER_A + "/555"), 3000), "registered").to.equal(true);
      L1.ws.close();
      expect(await waitFor(() => typeof ctx.registry[OWNER_A + "/555"] === "undefined", 3000), "removed").to.equal(true);
    }, 15000);

    it("G3 closing an older connection keeps the newer connection's entry", async function () {
      const A1 = openClient("/" + OWNER_A, "sid=a");
      expect(await waitOpen(A1, 3000)).to.equal(true);
      const A2 = openClient("/" + OWNER_A + "?tab=2", "sid=a");
      expect(await waitOpen(A2, 3000)).to.equal(true);
      const a2Server = await waitFor(() => serverSocketFor("/" + OWNER_A + "?tab=2"), 3000);
      expect(await waitFor(() => ctx.registry[OWNER_A] === a2Server, 3000), "A2 registered").to.equal(true);

      A1.ws.close();
      await waitFor(() => A1.close !== null, 3000);
      await sleep(300);
      expect(ctx.registry[OWNER_A] === a2Server, "A2 still registered").to.equal(true);

      A2.ws.close();
      expect(await waitFor(() => typeof ctx.registry[OWNER_A] === "undefined", 3000), "removed").to.equal(true);
    }, 15000);
  });
});
