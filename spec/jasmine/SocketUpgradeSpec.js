/*
 * WebSocket upgrades are tracked per connection and per verified owner (Phase 43, NOTIF-02).
 *
 * Runs without Redis and without CouchDB: a real ws server/client pair, the real upgrade handler
 * (lib/thinx/socket_upgrade.js, the code thinx-core.js wires to `this.server.on('upgrade')`), the
 * real SocketSession.accept and a Messenger built with Object.create(Messenger.prototype) plus
 * recording fakes. The session parser is a fake that sets request.session from the cookie value
 * (`x-thx-core=a` is owner A, `x-thx-core=b` is owner B, anything else an empty session). The
 * helpers are copied from MessengerOwnerSocketSpec; no spec file requires another.
 *
 * Pins:
 * - D-05/D-08: several sockets of one owner on the same `/<owner>` path all connect and each
 *   receives every owner frame once; another owner's socket receives nothing;
 * - D-06: delivery stays Messenger.sendToOwner over the per-owner Set;
 * - thinx-core.js delegates its upgrade handler to SocketUpgrade.handle and keeps no path map.
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
const WebSocket = require("ws");

const Messenger = require("../../lib/thinx/messenger");
const SocketSession = require("../../lib/thinx/socket_session");

const SOCKET_UPGRADE_PATH = path.join(__dirname, "../../lib/thinx/socket_upgrade.js");
const CORE_PATH = path.join(__dirname, "../../thinx-core.js");

let SocketUpgrade = null;
try { SocketUpgrade = require(SOCKET_UPGRADE_PATH); } catch (_e) { SocketUpgrade = null; }

const OWNER_A = "a1".repeat(32);
const OWNER_B = "b2".repeat(32);

const COOKIE_A = "x-thx-core=a";
const COOKIE_B = "x-thx-core=b";

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
  if (match && match[1] === "a") return { owner: OWNER_A };
  if (match && match[1] === "b") return { owner: OWNER_B };
  return {};
}

// Fake express-session parser: sets request.session from the cookie, calls back later.
function makeSessionParser(delayMs) {
  return function (request, _res, next) {
    const finish = () => {
      request.session = sessionFromCookie(request.headers.cookie);
      next();
    };
    if (delayMs > 0) setTimeout(finish, delayMs); else setImmediate(finish);
  };
}

// A local server wired the way thinx-core.js wires it: the upgrade event goes to
// SocketUpgrade.handle, the wss 'connection' event to SocketSession.accept.
function startHarness(options, done) {
  const h = { server: http.createServer(), wss: new WebSocket.Server({ noServer: true }), upgrade: null, port: 0 };
  h.ctx = { registry: {}, blog: { logtail() { /* unused */ } }, messenger: null, callback() { /* unused */ } };
  if (SocketUpgrade !== null) {
    const opts = { wss: h.wss, sessionParser: makeSessionParser(options.sessionDelayMs || 0) };
    if (typeof options.maxSocketsPerOwner !== "undefined") opts.maxSocketsPerOwner = options.maxSocketsPerOwner;
    h.upgrade = new SocketUpgrade(opts);
  }
  h.server.on("upgrade", (request, socket, head) => {
    if (h.upgrade === null) { socket.destroy(); return; }
    h.upgrade.handle(request, socket, head);
  });
  h.wss.on("connection", (ws, request) => SocketSession.accept(ws, request, h.ctx));
  h.server.listen(0, "127.0.0.1", () => {
    h.port = h.server.address().port;
    done();
  });
  return h;
}

function stopHarness(h, done) {
  for (const s of h.wss.clients) { try { s.terminate(); } catch (_e) { /* ignore */ } }
  h.wss.close(() => h.server.close(() => done()));
}

describe("SocketUpgradeSpec (Phase 43, NOTIF-02)", function () {

  let lines;
  let h;
  const clients = [];

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
    if (h.upgrade !== null) await waitFor(() => h.upgrade.liveSocketCount() === 0, 3000);
  });

  function openClient(urlPath, cookie) {
    const headers = {};
    if (typeof cookie === "string") headers.Cookie = cookie;
    const ws = new WebSocket("ws://127.0.0.1:" + h.port + urlPath, { headers: headers });
    const client = { ws: ws, frames: [], close: null, opened: false, status: null };
    ws.on("open", () => { client.opened = true; });
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
  });
});
