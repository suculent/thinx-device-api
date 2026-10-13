/*
 * WebSocket upgrades are tracked per connection and per verified owner (Phase 43, NOTIF-02).
 *
 * Runs without Redis and without CouchDB: a real ws server/client pair, the real upgrade handler
 * (lib/thinx/socket_upgrade.js, the code thinx-core.js wires to `this.server.on('upgrade')`), the
 * real SocketSession.accept and a Messenger built with Object.create(Messenger.prototype) plus
 * recording fakes. The session parser is a fake that sets request.session from the cookie value
 * (`x-thx-core=p43-sid-a` is owner A, `x-thx-core=p43-sid-b` is owner B, anything else an empty session). The
 * helpers are copied from MessengerOwnerSocketSpec; no spec file requires another.
 *
 * Pins:
 * - D-05/D-08: several sockets of one owner on the same `/<owner>` path all connect and each
 *   receives every owner frame once; another owner's socket receives nothing; closing one socket
 *   releases only that socket;
 * - REFACTOR-03 per connection: an upgrade torn down before or after admission leaves no slot;
 * - D-07: at most MAX_SOCKETS_PER_OWNER (10) live sockets per verified owner; the 11th upgrade is
 *   answered 429 with one log line that carries no cookie, session id or owner;
 * - unverified upgrades are never counted and still close 1008; a Cookie header without
 *   x-thx-core still gets 401;
 * - D-06: delivery stays Messenger.sendToOwner over the per-owner Set;
 * - thinx-core.js delegates its upgrade handler to SocketUpgrade.handle and keeps no path map;
 * - scripts/check-ws-multitab.js (the credential-free live probe) prints `WS-MULTITAB OK 2/2 opened`
 *   when two same-path sockets open and `WS-MULTITAB FAIL 1/2 opened` against a server that drops
 *   the second upgrade on a path (the pre-Phase-43 behaviour).
 *
 * Run it locally without the bootstrap helper (which boots thinx-core and needs Redis):
 *   printf '%s' '{"spec_dir":"spec/jasmine","helpers":[],"random":false}' > "${TMPDIR:-/tmp}/p43-jasmine.json"
 *   ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine --config="${TMPDIR:-/tmp}/p43-jasmine.json" spec/jasmine/SocketUpgradeSpec.js
 *
 * Never prints cookies, session ids or frame payloads: failures report counts and booleans.
 */

if (typeof process.env.ENVIRONMENT === "undefined") process.env.ENVIRONMENT = "development";

const expect = require("chai").expect;
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const childProcess = require("child_process");
const WebSocket = require("ws");

const Messenger = require("../../lib/thinx/messenger");
const SocketSession = require("../../lib/thinx/socket_session");

const SOCKET_UPGRADE_PATH = path.join(__dirname, "../../lib/thinx/socket_upgrade.js");
const CORE_PATH = path.join(__dirname, "../../thinx-core.js");
const PROBE_PATH = path.join(__dirname, "../../scripts/check-ws-multitab.js");

let SocketUpgrade = null;
try { SocketUpgrade = require(SOCKET_UPGRADE_PATH); } catch (_e) { SocketUpgrade = null; }

const OWNER_A = "a1".repeat(32);
const OWNER_B = "b2".repeat(32);

// Distinctive session values, so a log scan can prove they never reach a log line.
const SID_A = "p43-sid-a";
const SID_B = "p43-sid-b";
const COOKIE_A = "x-thx-core=" + SID_A;
const COOKIE_B = "x-thx-core=" + SID_B;

function captureConsole() {
  const lines = [];
  const record = (...args) => lines.push(args.map((a) => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch (_e) { return String(a); }
  }).join(" "));
  for (const level of ["log", "info", "warn", "error", "debug"]) spyOn(console, level).and.callFake(record);
  return lines;
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

// The `this.server.on('upgrade', …)` registration, up to its closing `});`.
function upgradeRegion(src) {
  let start = src.indexOf("this.server.on('upgrade'");
  if (start === -1) start = src.indexOf('this.server.on("upgrade"');
  if (start === -1) return null;
  const end = src.indexOf("});", start);
  return src.substring(start, end === -1 ? src.length : end + 3);
}

function makeMessenger() {
  const m = Object.create(Messenger.prototype);
  m.DISABLE_SLACK = true;
  m.clients = {};
  m.clients[OWNER_A] = { p43: true };
  m.clients[OWNER_B] = { p43: true };
  m.user = {
    mqtt_key(_o, cb) { setImmediate(() => cb(true, { key: "p43-fake-key", hash: "p43-fake-hash" })); },
    create_default_mqtt_apikey(_o, cb) { cb(true); },
    profile(_o, cb) { cb({ info: { transformers: [] } }); }
  };
  m.devicelib = { get(_id, cb) { cb(Object.assign(new Error("missing"), { statusCode: 404 })); } };
  m.device = { edit(_c, cb) { cb(true); }, runDeviceTransformers() { /* no-op */ } };
  m.redis = { get(_k, cb) { cb(null, null); }, set() { /* no-op */ }, expire() { /* no-op */ } };
  m.akey = { checkTransferBinding(_c, _u, _l, _p, cb) { cb(null, false); } };
  return m;
}

function sessionFromCookie(cookie) {
  const match = /(?:^|;\s*)x-thx-core=([^;]*)/.exec(cookie || "");
  if (match && match[1] === SID_A) return { owner: OWNER_A };
  if (match && match[1] === SID_B) return { owner: OWNER_B };
  return {};
}

// Fake express-session parser: sets request.session from the cookie, calls back later.
function makeSessionParser(delayMs, h) {
  return function (request, _res, next) {
    const finish = () => {
      request.session = sessionFromCookie(request.headers.cookie);
      h.parsed++;
      next();
    };
    if (delayMs > 0) setTimeout(finish, delayMs); else setImmediate(finish);
  };
}

// A local server wired the way thinx-core.js wires it: the upgrade event goes to
// SocketUpgrade.handle, the wss 'connection' event to SocketSession.accept.
function startHarness(options, done) {
  const h = { server: http.createServer(), wss: new WebSocket.Server({ noServer: true }), upgrade: null, port: 0, upgrades: 0, parsed: 0 };
  h.ctx = { registry: {}, blog: { logtail() { /* unused */ } }, messenger: null, callback() { /* unused */ } };
  if (SocketUpgrade !== null) {
    const opts = { wss: h.wss, sessionParser: makeSessionParser(options.sessionDelayMs || 0, h) };
    if (typeof options.maxSocketsPerOwner !== "undefined") opts.maxSocketsPerOwner = options.maxSocketsPerOwner;
    h.upgrade = new SocketUpgrade(opts);
  }
  h.server.on("upgrade", (request, socket, head) => {
    h.upgrades++;
    if (h.upgrade === null) { socket.destroy(); return; }
    h.upgrade.handle(request, socket, head);
  });
  h.wss.on("connection", (ws, request) => SocketSession.accept(ws, request, h.ctx));
  // WR-01: thinx-core starts the same heartbeat on its wss; the interval is injectable.
  h.heartbeat = null;
  if ((SocketUpgrade !== null) && (typeof options.heartbeatMs === "number") && (typeof SocketUpgrade.startHeartbeat === "function")) {
    h.heartbeat = SocketUpgrade.startHeartbeat(h.wss, options.heartbeatMs);
  }
  h.server.listen(0, "127.0.0.1", () => {
    h.port = h.server.address().port;
    done();
  });
  return h;
}

function stopHarness(h, done) {
  if (h.heartbeat) clearInterval(h.heartbeat);
  for (const s of h.wss.clients) { try { s.terminate(); } catch (_e) { /* ignore */ } }
  h.wss.close(() => h.server.close(() => done()));
}

// A raw TCP upgrade request (no ws client), so the test can tear the connection down
// at any point of the upgrade. Collects what the server answers.
function openRawUpgrade(port, urlPath, cookie) {
  const sock = net.connect(port, "127.0.0.1");
  const raw = { sock: sock, data: "", closed: false };
  sock.on("error", () => { /* aborts are expected */ });
  sock.on("data", (d) => { raw.data += String(d); });
  sock.on("close", () => { raw.closed = true; });
  sock.on("connect", () => {
    sock.write(
      "GET " + urlPath + " HTTP/1.1\r\n" +
      "Host: 127.0.0.1:" + port + "\r\n" +
      "Connection: upgrade\r\n" +
      "Upgrade: websocket\r\n" +
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
      "Sec-WebSocket-Version: 13\r\n" +
      (typeof cookie === "string" ? "Cookie: " + cookie + "\r\n" : "") +
      "\r\n");
  });
  return raw;
}

describe("SocketUpgradeSpec (Phase 43, NOTIF-02)", function () {

  let lines;
  let h;
  const clients = [];
  const raws = [];

  beforeAll(function (done) {
    h = startHarness({}, done);
  });

  afterAll(function (done) {
    for (const c of clients) { try { c.ws.terminate(); } catch (_e) { /* ignore */ } }
    stopHarness(h, done);
  });

  beforeEach(function () {
    lines = captureConsole();
    h.ctx.messenger = makeMessenger();
    spyOn(h.ctx.messenger, "initWithOwner").and.callThrough();
  });

  afterEach(async function () {
    while (clients.length) {
      const c = clients.pop();
      try { c.ws.terminate(); } catch (_e) { /* ignore */ }
    }
    while (raws.length) {
      const r = raws.pop();
      try { r.sock.destroy(); } catch (_e) { /* ignore */ }
    }
    // IN-03: a slot leaked by one test fails that test, not a later one.
    if (h.upgrade !== null) {
      expect(await waitFor(() => h.upgrade.liveSocketCount() === 0, 3000), "slots released after test").to.equal(true);
    }
  });

  function openClient(urlPath, cookie) {
    const headers = {};
    if (typeof cookie === "string") headers.Cookie = cookie;
    const ws = new WebSocket("ws://127.0.0.1:" + h.port + urlPath, { headers: headers });
    const client = { ws: ws, frames: [], close: null, opened: false, status: null, liveAtOpen: null };
    ws.on("open", () => {
      client.opened = true;
      if (h.upgrade !== null) client.liveAtOpen = h.upgrade.liveSocketCount();
    });
    ws.on("message", (data) => { client.frames.push(String(data)); });
    ws.on("close", (code) => { client.close = { code: code }; });
    ws.on("unexpected-response", (_req, res) => { client.status = res.statusCode; try { ws.terminate(); } catch (_e) { /* ignore */ } });
    ws.on("error", (_err) => { /* open/close/status decide */ });
    clients.push(client);
    return client;
  }

  function waitOpen(client, ms) { return waitFor(() => client.opened || client.close !== null || client.status !== null, ms); }

  function sendJson(client, obj) { client.ws.send(JSON.stringify(obj)); }

  // Opens a client on the path, waits for open and sends {init: owner}.
  async function openAndInit(urlPath, cookie, owner) {
    const before = h.ctx.messenger.initWithOwner.calls.count();
    const client = openClient(urlPath, cookie);
    expect(await waitOpen(client, 3000), "open").to.equal(true);
    expect(client.opened, "opened").to.equal(true);
    expect(client.close, "closed at accept").to.equal(null);
    sendJson(client, { init: owner });
    expect(await waitFor(() => h.ctx.messenger.initWithOwner.calls.count() === before + 1, 3000), "initWithOwner called").to.equal(true);
    return client;
  }

  function rawUpgrade(port, urlPath, cookie) {
    const r = openRawUpgrade(port, urlPath, cookie);
    raws.push(r);
    return r;
  }

  function linesWith(needle) { return lines.filter((l) => l.indexOf(needle) !== -1); }

  function frameCount(client, title) {
    return client.frames.filter((f) => {
      try { const o = JSON.parse(f); return !!(o && o.notification && o.notification.title === title); } catch (_e) { return false; }
    }).length;
  }

  describe("WS multi-tab: same-path sockets per owner", function () {

    it("U1 two A sockets on the same /<owner> path both connect and each receives the owner frame once; B receives nothing", async function () {
      expect(SocketUpgrade, "lib/thinx/socket_upgrade.js").to.not.equal(null);
      const m = h.ctx.messenger;
      const A1 = await openAndInit("/" + OWNER_A, COOKIE_A, OWNER_A);
      const A2 = await openAndInit("/" + OWNER_A, COOKIE_A, OWNER_A);
      const B1 = await openAndInit("/" + OWNER_B, COOKIE_B, OWNER_B);
      expect(await waitFor(() => m.subscriberCount(OWNER_A) === 2 && m.subscriberCount(OWNER_B) === 1, 3000), "subscribed").to.equal(true);
      expect(h.upgrade.ownerSocketCount(OWNER_A), "A sockets").to.equal(2);
      expect(h.upgrade.ownerSocketCount(OWNER_B), "B sockets").to.equal(1);

      const sent = m.sendToOwner(OWNER_A, { notification: { title: "P43 U1", body: "x", type: "info" } });
      expect(sent, "sendToOwner(A)").to.equal(2);
      expect(await waitFor(() => frameCount(A1, "P43 U1") === 1 && frameCount(A2, "P43 U1") === 1, 3000), "A1 and A2 received").to.equal(true);
      await sleep(100);
      expect(frameCount(A1, "P43 U1"), "frames on A1").to.equal(1);
      expect(frameCount(A2, "P43 U1"), "frames on A2").to.equal(1);
      expect(B1.frames.length, "frames on B1").to.equal(0);
      expect(A1.close, "A1 closed").to.equal(null);
      expect(A2.close, "A2 closed").to.equal(null);
    }, 15000);

    it("U2 closing one A socket releases only that socket: the other still receives, counts drop by one", async function () {
      expect(SocketUpgrade, "lib/thinx/socket_upgrade.js").to.not.equal(null);
      const m = h.ctx.messenger;
      const A1 = await openAndInit("/" + OWNER_A, COOKIE_A, OWNER_A);
      const A2 = await openAndInit("/" + OWNER_A, COOKIE_A, OWNER_A);
      expect(await waitFor(() => m.subscriberCount(OWNER_A) === 2, 3000), "subscribed").to.equal(true);
      expect(h.upgrade.ownerSocketCount(OWNER_A), "A sockets before close").to.equal(2);

      A1.ws.close();
      expect(await waitFor(() => h.upgrade.ownerSocketCount(OWNER_A) === 1, 3000), "A sockets after close is 1").to.equal(true);
      expect(await waitFor(() => m.subscriberCount(OWNER_A) === 1, 3000), "A subscribers after close is 1").to.equal(true);

      const sent = m.sendToOwner(OWNER_A, { notification: { title: "P43 U2", body: "x", type: "info" } });
      expect(sent, "sendToOwner(A)").to.equal(1);
      expect(await waitFor(() => frameCount(A2, "P43 U2") === 1, 3000), "A2 received").to.equal(true);
      await sleep(100);
      expect(frameCount(A1, "P43 U2"), "frames on closed A1").to.equal(0);
      expect(A2.close, "A2 closed").to.equal(null);
    }, 15000);

    it("U3b a raw upgrade torn down after admission brings the count back to its baseline", async function () {
      expect(SocketUpgrade, "lib/thinx/socket_upgrade.js").to.not.equal(null);
      const baseOwner = h.upgrade.ownerSocketCount(OWNER_A);
      const baseLive = h.upgrade.liveSocketCount();
      const r = rawUpgrade(h.port, "/" + OWNER_A, COOKIE_A);
      expect(await waitFor(() => h.upgrade.ownerSocketCount(OWNER_A) === baseOwner + 1, 3000), "admitted").to.equal(true);
      expect(await waitFor(() => r.data.indexOf("HTTP/1.1 101") === 0, 3000), "handshake answered 101").to.equal(true);
      r.sock.destroy();
      expect(await waitFor(() => h.upgrade.ownerSocketCount(OWNER_A) === baseOwner && h.upgrade.liveSocketCount() === baseLive, 2000), "released within 2 s").to.equal(true);
    }, 15000);

    it("U4 the 11th live A socket is refused with 429 and one clean log line; B is unaffected; a freed slot is reusable", async function () {
      expect(SocketUpgrade, "lib/thinx/socket_upgrade.js").to.not.equal(null);
      expect(SocketUpgrade.MAX_SOCKETS_PER_OWNER, "MAX_SOCKETS_PER_OWNER").to.equal(10);
      const opened = [];
      for (let i = 0; i < 10; i++) {
        const urlPath = (i % 2 === 0) ? "/" + OWNER_A : "/" + OWNER_A + "/" + (Date.now() + i);
        opened.push(openClient(urlPath, COOKIE_A));
      }
      expect(await waitFor(() => opened.every((c) => c.opened || c.close !== null || c.status !== null), 5000), "ten settled").to.equal(true);
      expect(opened.filter((c) => c.opened).length, "ten A sockets opened").to.equal(10);
      expect(h.upgrade.ownerSocketCount(OWNER_A), "A sockets").to.equal(10);

      const extra = openClient("/" + OWNER_A, COOKIE_A);
      expect(await waitOpen(extra, 3000), "11th settled").to.equal(true);
      expect(extra.status, "11th status").to.equal(429);
      expect(extra.opened, "11th opened").to.equal(false);
      expect(h.upgrade.ownerSocketCount(OWNER_A), "A sockets after refusal").to.equal(10);

      const refusals = linesWith("per-owner socket limit");
      expect(refusals.length, "refusal log lines").to.equal(1);
      expect(refusals[0].indexOf(OWNER_A), "owner in refusal line").to.equal(-1);
      expect(lines.filter((l) => l.indexOf("x-thx-core=") !== -1 || l.indexOf("p43-sid") !== -1).length, "cookie in any log line").to.equal(0);

      const B1 = openClient("/" + OWNER_B, COOKIE_B);
      expect(await waitOpen(B1, 3000), "B settled").to.equal(true);
      expect(B1.opened, "B opened").to.equal(true);
      expect(B1.status, "B status").to.equal(null);

      opened[0].ws.close();
      expect(await waitFor(() => h.upgrade.ownerSocketCount(OWNER_A) === 9, 3000), "A sockets after one close").to.equal(true);
      const again = openClient("/" + OWNER_A, COOKIE_A);
      expect(await waitOpen(again, 3000), "reuse settled").to.equal(true);
      expect(again.opened, "freed slot reused").to.equal(true);
      expect(h.upgrade.ownerSocketCount(OWNER_A), "A sockets after reuse").to.equal(10);
    }, 20000);

    it("U5 unverified upgrades are not counted and close 1008; a cookie without x-thx-core gets 401", async function () {
      expect(SocketUpgrade, "lib/thinx/socket_upgrade.js").to.not.equal(null);
      const noCookie = openClient("/" + OWNER_A);
      const foreign = openClient("/" + OWNER_B, COOKIE_A);
      expect(await waitFor(() => noCookie.close !== null && foreign.close !== null, 3000), "both closed").to.equal(true);
      expect(noCookie.opened, "cookie-less opened").to.equal(true);
      expect(foreign.opened, "foreign path opened").to.equal(true);
      expect(noCookie.close.code, "cookie-less close code").to.equal(1008);
      expect(foreign.close.code, "foreign path close code").to.equal(1008);
      expect(noCookie.liveAtOpen, "tracked sockets at cookie-less open").to.equal(0);
      expect(foreign.liveAtOpen, "tracked sockets at foreign open").to.equal(0);

      const r = rawUpgrade(h.port, "/" + OWNER_A, "other=p43-sid-z");
      expect(await waitFor(() => r.closed, 3000), "401 socket closed").to.equal(true);
      expect(r.data.indexOf("HTTP/1.1 401 Unauthorized"), "401 answer").to.equal(0);
      expect(h.upgrade.ownerSocketCount(OWNER_A), "A sockets").to.equal(0);
      expect(h.upgrade.ownerSocketCount(OWNER_B), "B sockets").to.equal(0);
      expect(h.upgrade.liveSocketCount(), "live sockets").to.equal(0);
    }, 15000);

    it("U6 three A upgrades on the same path in the same tick all open and each receives the next owner frame once", async function () {
      expect(SocketUpgrade, "lib/thinx/socket_upgrade.js").to.not.equal(null);
      const m = h.ctx.messenger;
      const trio = [openClient("/" + OWNER_A, COOKIE_A), openClient("/" + OWNER_A, COOKIE_A), openClient("/" + OWNER_A, COOKIE_A)];
      expect(await waitFor(() => trio.every((c) => c.opened || c.close !== null || c.status !== null), 3000), "three settled").to.equal(true);
      expect(trio.filter((c) => c.opened).length, "opened").to.equal(3);
      expect(trio.filter((c) => c.status !== null).length, "refused").to.equal(0);
      const before = m.initWithOwner.calls.count();
      for (const c of trio) sendJson(c, { init: OWNER_A });
      expect(await waitFor(() => m.initWithOwner.calls.count() === before + 3, 3000), "three init").to.equal(true);
      expect(await waitFor(() => m.subscriberCount(OWNER_A) === 3, 3000), "three subscribed").to.equal(true);
      expect(m.sendToOwner(OWNER_A, { notification: { title: "P43 U6", body: "x", type: "info" } }), "sendToOwner(A)").to.equal(3);
      expect(await waitFor(() => trio.every((c) => frameCount(c, "P43 U6") === 1), 3000), "each received").to.equal(true);
      await sleep(100);
      expect(trio.map((c) => frameCount(c, "P43 U6")), "frames per socket").to.deep.equal([1, 1, 1]);
    }, 15000);
  });

  describe("WS aborted upgrade during the session parse", function () {

    let hd;

    beforeAll(function (done) {
      hd = startHarness({ sessionDelayMs: 50 }, done);
    });

    afterAll(function (done) {
      stopHarness(hd, done);
    });

    it("U3a an upgrade torn down before the (delayed) session parse calls back leaves no slot behind", async function () {
      expect(SocketUpgrade, "lib/thinx/socket_upgrade.js").to.not.equal(null);
      hd.ctx.messenger = h.ctx.messenger;
      const baseOwner = hd.upgrade.ownerSocketCount(OWNER_A);
      const baseLive = hd.upgrade.liveSocketCount();
      const upgradesBefore = hd.upgrades;
      const parsedBefore = hd.parsed;
      const r = rawUpgrade(hd.port, "/" + OWNER_A, COOKIE_A);
      expect(await waitFor(() => hd.upgrades === upgradesBefore + 1, 3000), "upgrade reached the server").to.equal(true);
      expect(hd.parsed, "session parse still pending").to.equal(parsedBefore);
      r.sock.destroy();
      expect(await waitFor(() => hd.parsed === parsedBefore + 1, 3000), "session parse called back").to.equal(true);
      await sleep(100);
      expect(hd.upgrade.ownerSocketCount(OWNER_A), "A sockets").to.equal(baseOwner);
      expect(hd.upgrade.liveSocketCount(), "live sockets").to.equal(baseLive);
      expect(r.data.indexOf("HTTP/1.1 101"), "no handshake").to.equal(-1);
    }, 15000);
  });

  // WR-01: the per-owner cap is released on the raw socket's 'close'. A peer that vanishes
  // without a FIN (laptop sleep, Wi-Fi switch, killed mobile browser) never sends one, so the
  // heartbeat must terminate a socket that did not answer the previous ping.
  describe("WS heartbeat: dead peers are terminated and release their slot (WR-01)", function () {

    const HEARTBEAT_MS = 100;
    let hb;
    const hbClients = [];

    beforeAll(function (done) {
      hb = startHarness({ heartbeatMs: HEARTBEAT_MS }, done);
    });

    afterAll(function (done) {
      stopHarness(hb, done);
    });

    afterEach(async function () {
      while (hbClients.length) {
        try { hbClients.pop().ws.terminate(); } catch (_e) { /* ignore */ }
      }
      if (hb.upgrade !== null) {
        expect(await waitFor(() => hb.upgrade.liveSocketCount() === 0, 3000), "heartbeat harness slots released").to.equal(true);
      }
    });

    // autoPong: false makes the client a peer that is gone without having closed.
    async function openHb(autoPong) {
      hb.ctx.messenger = h.ctx.messenger;
      const before = hb.ctx.messenger.initWithOwner.calls.count();
      const ws = new WebSocket("ws://127.0.0.1:" + hb.port + "/" + OWNER_A, { headers: { Cookie: COOKIE_A }, autoPong: autoPong });
      const client = { ws: ws, opened: false, close: null, pings: 0 };
      ws.on("open", () => { client.opened = true; });
      ws.on("ping", () => { client.pings++; });
      ws.on("close", (code) => { client.close = { code: code }; });
      ws.on("error", () => { /* close decides */ });
      hbClients.push(client);
      expect(await waitFor(() => client.opened || client.close !== null, 3000), "open").to.equal(true);
      expect(client.opened, "opened").to.equal(true);
      ws.send(JSON.stringify({ init: OWNER_A }));
      expect(await waitFor(() => hb.ctx.messenger.initWithOwner.calls.count() === before + 1, 3000), "initWithOwner called").to.equal(true);
      return client;
    }

    it("H1 a socket that stops answering pings is terminated within two intervals and frees its owner slot and subscription; one that answers stays", async function () {
      expect(SocketUpgrade, "lib/thinx/socket_upgrade.js").to.not.equal(null);
      expect(typeof SocketUpgrade.startHeartbeat, "SocketUpgrade.startHeartbeat").to.equal("function");
      expect(SocketUpgrade.HEARTBEAT_INTERVAL_MS, "production interval").to.equal(30000);
      const m = h.ctx.messenger;
      const alive = await openHb(true);
      const dead = await openHb(false);
      expect(await waitFor(() => m.subscriberCount(OWNER_A) === 2, 3000), "both subscribed").to.equal(true);
      expect(hb.upgrade.ownerSocketCount(OWNER_A), "A sockets before").to.equal(2);

      const t0 = Date.now();
      expect(await waitFor(() => hb.upgrade.ownerSocketCount(OWNER_A) === 1, 2000), "dead socket slot released").to.equal(true);
      const elapsed = Date.now() - t0;
      expect(elapsed <= (3 * HEARTBEAT_MS) + 150, "released within two intervals (+ slack), took " + elapsed + " ms").to.equal(true);
      expect(await waitFor(() => m.subscriberCount(OWNER_A) === 1, 2000), "dead socket unsubscribed").to.equal(true);
      expect(await waitFor(() => dead.close !== null, 2000), "dead client saw the close").to.equal(true);
      expect(dead.pings >= 1, "dead client was pinged").to.equal(true);

      // Several more intervals: the answering socket is pinged and kept.
      await sleep(6 * HEARTBEAT_MS);
      expect(alive.close, "answering socket closed").to.equal(null);
      expect(alive.pings >= 3, "answering socket pinged every interval").to.equal(true);
      expect(hb.upgrade.ownerSocketCount(OWNER_A), "A sockets after").to.equal(1);
      expect(m.sendToOwner(OWNER_A, { notification: { title: "P43 H1", body: "x", type: "info" } }), "sendToOwner(A)").to.equal(1);
    }, 15000);

    it("H2 a raw upgrade that never reads its frames (half-open peer) is reaped and the count returns to baseline", async function () {
      expect(typeof SocketUpgrade.startHeartbeat, "SocketUpgrade.startHeartbeat").to.equal("function");
      const baseLive = hb.upgrade.liveSocketCount();
      const r = openRawUpgrade(hb.port, "/" + OWNER_A, COOKIE_A);
      try {
        expect(await waitFor(() => r.data.indexOf("HTTP/1.1 101") === 0, 3000), "handshake answered 101").to.equal(true);
        expect(hb.upgrade.liveSocketCount(), "admitted").to.equal(baseLive + 1);
        expect(await waitFor(() => hb.upgrade.liveSocketCount() === baseLive, 2000), "reaped by the heartbeat").to.equal(true);
        expect(await waitFor(() => r.closed, 2000), "server closed the raw socket").to.equal(true);
      } finally {
        r.sock.destroy();
      }
    }, 15000);
  });

  describe("WS probe: scripts/check-ws-multitab.js", function () {

    function runProbe(url) {
      return new Promise((resolve) => {
        childProcess.execFile(process.execPath, [PROBE_PATH, url], { timeout: 20000 }, (err, stdout) => {
          const code = (err && typeof err.code === "number") ? err.code : (err ? -1 : 0);
          const out = String(stdout || "").trim().split("\n");
          resolve({ code: code, last: out[out.length - 1] });
        });
      });
    }

    it("U7 two cookie-less sockets on one path both open against the SocketUpgrade harness: OK 2/2, exit 0", async function () {
      expect(SocketUpgrade, "lib/thinx/socket_upgrade.js").to.not.equal(null);
      const res = await runProbe("ws://127.0.0.1:" + h.port);
      expect(res.code, "exit code").to.equal(0);
      expect(res.last, "final line").to.equal("WS-MULTITAB OK 2/2 opened");
      expect(h.upgrade.liveSocketCount(), "cookie-less probe sockets tracked").to.equal(0);
    }, 30000);

    it("U8 a server that drops the second upgrade on a path makes the probe fail: FAIL 1/2, exit 1", async function () {
      const stub = http.createServer();
      const stubWss = new WebSocket.Server({ noServer: true });
      const seen = new Map();
      stub.on("upgrade", (request, socket, head) => {
        const key = String(request.url);
        const n = (seen.get(key) || 0) + 1;
        seen.set(key, n);
        if (n > 1) { socket.destroy(); return; }
        stubWss.handleUpgrade(request, socket, head, (ws) => { ws.on("error", () => { /* ignore */ }); });
      });
      await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
      try {
        const res = await runProbe("ws://127.0.0.1:" + stub.address().port);
        expect(res.code, "exit code").to.equal(1);
        expect(res.last, "final line").to.equal("WS-MULTITAB FAIL 1/2 opened");
      } finally {
        for (const c of stubWss.clients) { try { c.terminate(); } catch (_e) { /* ignore */ } }
        await new Promise((resolve) => stubWss.close(() => stub.close(() => resolve())));
      }
    }, 30000);
  });

  describe("WS static: thinx-core wiring", function () {

    it("S1 thinx-core delegates the upgrade to SocketUpgrade.handle, keeps no path map, keeps the connection handler and the HTTP listen line", function () {
      const src = fs.readFileSync(CORE_PATH, "utf8");
      const code = codeLines(src).join("\n");
      expect(/require\(\s*["']\.\/lib\/thinx\/socket_upgrade(\.js)?["']\s*\)/.test(code), "require socket_upgrade").to.equal(true);

      const region = upgradeRegion(code);
      expect(region, "this.server.on('upgrade') region").to.not.equal(null);
      expect(region.indexOf(".handle("), ".handle( in upgrade region").to.not.equal(-1);

      expect(/\bsocketMap\b/.test(code), "path-keyed map").to.equal(false);
      expect(src.indexOf("Socket already mapped"), "duplicate-drop log text").to.equal(-1);

      const conn = connectionRegion(code);
      expect(conn, "wss.on('connection') region").to.not.equal(null);
      expect(conn.indexOf("SocketSession.accept("), "SocketSession.accept(").to.not.equal(-1);
      expect(/messenger:\s*app\.messenger\b/.test(conn), "messenger: app.messenger").to.equal(true);

      expect(src.split("http.createServer(app).listen(listenPort").length - 1, "HTTP listen line").to.equal(1);
    });

    it("S2 thinx-core runs SocketUpgrade's heartbeat on its wss and keeps no ping loop of its own (WR-01)", function () {
      const code = codeLines(fs.readFileSync(CORE_PATH, "utf8")).join("\n");
      expect(/SocketUpgrade\.startHeartbeat\(\s*wss\b/.test(code), "SocketUpgrade.startHeartbeat(wss").to.equal(true);
      expect(code.indexOf(".ping("), ".ping( in thinx-core.js").to.equal(-1);
      expect(code.indexOf("setInterval(function ping"), "own ping interval").to.equal(-1);
    });
  });
});
