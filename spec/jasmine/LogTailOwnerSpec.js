/*
 * WebSocket build log tail is bound to the verified session owner
 * (quick 261003-v05, threat T-skk-10).
 *
 * Runs without Redis and without CouchDB: lib/thinx/couch.js and
 * lib/thinx/files.js are replaced in require.cache, Buildlog is required fresh
 * on top of them, and the deploy root is a tmp directory.
 *
 * Pins:
 * - the WebSocket log tail owner binding: a socket is served only when the
 *   session owner parsed at upgrade equals the first URL path segment, and a
 *   logtail acts only as that owner (Buildlog#logtail reads through fetchOwned
 *   and does no filesystem work for a build the owner does not own);
 * - the never-throwing frame dispatcher (one non-JSON frame used to crash the
 *   API process);
 * - the thinx-core.js wiring (the connection handler delegates to
 *   SocketSession.accept);
 * - the removal of the two dead HTTP tail routes (decision B: no client calls
 *   them; they were registered per WebSocket connection and answered 500).
 *
 * Never prints cookies, session ids or raw frames.
 */

if (typeof process.env.ENVIRONMENT === "undefined") process.env.ENVIRONMENT = "development";

const expect = require("chai").expect;
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const FILES_PATH = require.resolve("../../lib/thinx/files");
const BUILDLOG_PATH = require.resolve("../../lib/thinx/buildlog");
const SOCKET_SESSION_PATH = path.join(__dirname, "../../lib/thinx/socket_session.js");
const CORE_PATH = path.join(__dirname, "../../thinx-core.js");

const OWNER_A = "a".repeat(64);
const OWNER_B = "b".repeat(64);
const UDID_A = "a0500000-0000-4000-8000-0000000000a1";
const UDID_B = "b0500000-0000-4000-8000-0000000000b1";
const BUILD_A = "a0500000-1111-4222-8333-0000000000a1";
const BUILD_B = "b0500000-1111-4222-8333-0000000000b1";
const BUILD_MISSING = "c0500000-1111-4222-8333-0000000000c1";
const SENTINEL_A = "v05-log-sentinel-a";
const SENTINEL_B = "v05-log-sentinel-b";
const NOT_FOUND_TEXT = "Sorry, no log records fetched.";

const DOCS = {};
DOCS[BUILD_A] = { _id: BUILD_A, owner: OWNER_A, udid: UDID_A, build_id: BUILD_A, log: [{ message: "start", udid: UDID_A }] };
DOCS[BUILD_B] = { _id: BUILD_B, owner: OWNER_B, udid: UDID_B, build_id: BUILD_B, log: [{ message: "start", udid: UDID_B }] };

let TMP = null;

function fakeCouch() {
  const db = {
    get(id, cb) {
      setImmediate(() => {
        if (DOCS[id]) return cb(null, JSON.parse(JSON.stringify(DOCS[id])));
        cb(Object.assign(new Error("Error: missing"), { statusCode: 404 }));
      });
    }
  };
  return { use: () => db, db: { use: () => db } };
}

class FilezStub {
  static appRoot() { return "/opt/thinx/thinx-device-api"; }
  static deployPathForOwner(o) { return TMP + "/deploy/" + o; }
  static deployPathForDevice(o, u) { return FilezStub.deployPathForOwner(o) + "/" + u; }
}

function captureConsole() {
  const lines = [];
  const record = (...args) => lines.push(args.map((a) => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch (_e) { return String(a); }
  }).join(" "));
  for (const level of ["log", "info", "warn", "error", "debug"]) spyOn(console, level).and.callFake(record);
  return lines;
}

function listTree(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const r = rel ? rel + "/" + name : name;
      out.push(r);
      if (fs.statSync(path.join(dir, name)).isDirectory()) walk(path.join(dir, name), r);
    }
  };
  walk(root, "");
  return out;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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

describe("LogTailOwnerSpec (quick 261003-v05)", function () {

  let Buildlog, blog, SocketSession, NOT_FOUND;
  let savedCouch, savedFiles, savedBuildlog;
  let server, wss, port;
  const accepted = [];
  const clients = [];
  const messengerCalls = [];
  const callbackCalls = [];
  const tailPaths = [];

  const fakeMessenger = {
    initWithOwner(owner, socket, cb) {
      messengerCalls.push({ owner: owner, socket: socket });
      if (typeof cb === "function") cb(true, "ok");
    }
  };

  const ctx = {
    registry: {},
    blog: null,
    messenger: fakeMessenger,
    callback: (...args) => { callbackCalls.push(args); }
  };

  function sessionFromCookie(cookie) {
    const m = /(?:^|;\s*)sid=([^;]*)/.exec(cookie || "");
    if (m && m[1] === "a") return { owner: OWNER_A };
    if (m && m[1] === "b") return { owner: OWNER_B };
    return {};
  }

  beforeAll(function (done) {
    TMP = fs.mkdtempSync(path.join(os.tmpdir(), "v05-"));

    savedCouch = require.cache[COUCH_PATH];
    savedFiles = require.cache[FILES_PATH];
    savedBuildlog = require.cache[BUILDLOG_PATH];
    require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
    require.cache[FILES_PATH] = { id: FILES_PATH, filename: FILES_PATH, loaded: true, exports: FilezStub };
    delete require.cache[BUILDLOG_PATH];
    Buildlog = require(BUILDLOG_PATH);
    blog = new Buildlog();
    ctx.blog = blog;
    NOT_FOUND = (typeof Buildlog.LOGTAIL_NOT_FOUND === "string") ? Buildlog.LOGTAIL_NOT_FOUND : NOT_FOUND_TEXT;

    try { SocketSession = require(SOCKET_SESSION_PATH); } catch (_e) { SocketSession = null; }

    for (const [owner, udid, build, sentinel] of [[OWNER_A, UDID_A, BUILD_A, SENTINEL_A], [OWNER_B, UDID_B, BUILD_B, SENTINEL_B]]) {
      const dir = path.join(TMP, "deploy", owner, udid, build);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "build.log"), sentinel + "\n");
    }

    server = http.createServer();
    wss = new WebSocket.Server({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      // Same order as thinx-core: the session parser populates request.session
      // before the upgrade completes and 'connection' is emitted.
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
    const finish = () => {
      if (savedCouch) require.cache[COUCH_PATH] = savedCouch; else delete require.cache[COUCH_PATH];
      if (savedFiles) require.cache[FILES_PATH] = savedFiles; else delete require.cache[FILES_PATH];
      if (savedBuildlog) require.cache[BUILDLOG_PATH] = savedBuildlog; else delete require.cache[BUILDLOG_PATH];
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
      done();
    };
    wss.close(() => server.close(() => finish()));
  });

  beforeEach(function () {
    tailPaths.length = 0;
    spyOn(blog, "setupTail").and.callFake((socket, logPath, _buildId, _cb) => {
      tailPaths.push(logPath);
      if (socket && typeof socket.send === "function") socket.send(fs.readFileSync(logPath, "utf8"));
    });
    captureConsole();
    messengerCalls.length = 0;
    callbackCalls.length = 0;
    accepted.length = 0;
    ctx.registry = {};
  });

  afterEach(function () {
    while (clients.length) {
      const c = clients.pop();
      try { c.ws.close(); } catch (_e) { /* ignore */ }
    }
  });

  function recordingSocket() {
    return { sent: [], send(d) { this.sent.push(String(d)); } };
  }

  // Resolves on the first error_callback (plus a short settle so a second call
  // would be seen), or after 500 ms when the owned path never calls it.
  function logtail(owner, build) {
    return new Promise((resolve) => {
      const socket = recordingSocket();
      const calls = [];
      let finished = false;
      const finish = () => { if (!finished) { finished = true; resolve({ socket: socket, calls: calls }); } };
      const timer = setTimeout(finish, 500);
      blog.logtail(build, owner, socket, (...args) => {
        calls.push(args);
        clearTimeout(timer);
        setTimeout(finish, 150);
      });
    });
  }

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

  async function waitFor(fn, ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const v = fn();
      if (v) return v;
      await sleep(20);
    }
    return fn() || null;
  }

  function waitOpen(client, ms) { return waitFor(() => client.opened || client.close !== null, ms); }
  function waitFrame(client, predicate, ms) { return waitFor(() => client.frames.find(predicate), ms); }
  function waitClose(client, ms) { return waitFor(() => client.close, ms); }
  function serverSocketFor(urlPath) {
    const list = accepted.filter((a) => a.url === urlPath);
    return list.length ? list[list.length - 1].ws : null;
  }
  function sendJson(client, obj) { client.ws.send(JSON.stringify(obj)); }

  describe("LOGTAIL ws: verified socket owner", function () {

    it("(1) returns the session owner when it equals the first path segment", function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      for (const url of ["/" + OWNER_A, "/" + OWNER_A + "/1700000000000", "/" + OWNER_A + "?x=1"]) {
        expect(SocketSession.verifiedOwner({ session: { owner: OWNER_A }, url: url }), url).to.equal(OWNER_A);
      }
    }, 15000);

    it("(2) returns null when the path names another owner", function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      expect(SocketSession.verifiedOwner({ session: { owner: OWNER_A }, url: "/" + OWNER_B })).to.equal(null);
    }, 15000);

    it("(3) returns null without throwing for missing or malformed session owners", function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const requests = [
        { url: "/" + OWNER_A },
        {},
        { session: { owner: 5 }, url: "/" + OWNER_A },
        { session: { owner: "" }, url: "/" },
        { session: { owner: "../x" }, url: "/../x" },
        { session: { owner: OWNER_A }, url: undefined }
      ];
      for (const r of requests) {
        let result;
        expect(() => { result = SocketSession.verifiedOwner(r); }).to.not.throw();
        expect(result).to.equal(null);
      }
    }, 15000);
  });

  describe("LOGTAIL ws: Buildlog#logtail owner check", function () {

    it("(4) the owner's own build is tailed from the owner's deploy path", async function () {
      const r = await logtail(OWNER_A, BUILD_A);
      expect(blog.setupTail.calls.count()).to.equal(1);
      expect(tailPaths[0]).to.equal(TMP + "/deploy/" + OWNER_A + "/" + UDID_A + "/" + BUILD_A + "/build.log");
      expect(r.socket.sent.filter((f) => f === NOT_FOUND)).to.deep.equal([]);
    }, 15000);

    it("(5) another owner's build yields only the not-found frame and no filesystem work", async function () {
      expect(Buildlog.LOGTAIL_NOT_FOUND).to.equal(NOT_FOUND_TEXT);
      const before = listTree(TMP);
      const r = await logtail(OWNER_B, BUILD_A);
      expect(blog.setupTail.calls.count()).to.equal(0);
      expect(r.socket.sent).to.deep.equal([NOT_FOUND]);
      expect(r.socket.sent.filter((f) => f.indexOf(SENTINEL_A) !== -1)).to.deep.equal([]);
      expect(r.calls.length).to.equal(1);
      expect(r.calls[0][0]).to.equal(false);
      expect(fs.existsSync(path.join(TMP, "deploy", OWNER_B))).to.equal(false);
      expect(listTree(TMP)).to.deep.equal(before);
    }, 15000);

    it("(6) a missing build reads exactly like another owner's build", async function () {
      const before = listTree(TMP);
      const r = await logtail(OWNER_B, BUILD_MISSING);
      expect(r.socket.sent).to.deep.equal([NOT_FOUND]);
      expect(blog.setupTail.calls.count()).to.equal(0);
      expect(listTree(TMP)).to.deep.equal(before);
    }, 15000);

    it("(7) an undefined or empty owner is refused like another owner", async function () {
      for (const owner of [undefined, ""]) {
        const before = listTree(TMP);
        let r;
        try {
          r = await logtail(owner, BUILD_A);
        } catch (e) {
          expect.fail("logtail threw for owner " + JSON.stringify(owner) + ": " + e.message);
        }
        expect(blog.setupTail.calls.count(), String(owner)).to.equal(0);
        expect(r.socket.sent, String(owner)).to.deep.equal([NOT_FOUND]);
        expect(r.calls.length, String(owner)).to.equal(1);
        expect(r.calls[0][0], String(owner)).to.equal(false);
        expect(listTree(TMP), String(owner)).to.deep.equal(before);
      }
    }, 15000);
  });

  describe("LOGTAIL ws: e2e over a real WebSocket", function () {

    it("(8) tracer: the owner's build log streams to the owner connection", async function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const c = openClient("/" + OWNER_A, "sid=a");
      await waitOpen(c, 3000);
      expect(c.opened).to.equal(true);
      sendJson(c, { logtail: { owner_id: OWNER_A, build_id: BUILD_A } });
      const frame = await waitFrame(c, (f) => f.indexOf(SENTINEL_A) !== -1, 3000);
      expect(frame, "sentinel frame").to.not.equal(null);
    }, 15000);

    it("(9) a log connection streams without owner_id and is registered under <owner>/<id>", async function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const urlPath = "/" + OWNER_A + "/123";
      const c = openClient(urlPath, "sid=a");
      await waitOpen(c, 3000);
      sendJson(c, { logtail: { build_id: BUILD_A } });
      const frame = await waitFrame(c, (f) => f.indexOf(SENTINEL_A) !== -1, 3000);
      expect(frame, "sentinel frame").to.not.equal(null);
      const serverWs = serverSocketFor(urlPath);
      expect(serverWs).to.not.equal(null);
      expect(ctx.registry[OWNER_A + "/123"] === serverWs).to.equal(true);
      expect(ctx.registry["123"]).to.equal(undefined);
    }, 15000);

    it("(10) a logtail naming another owner's build gets only the not-found frame", async function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const c = openClient("/" + OWNER_A, "sid=a");
      await waitOpen(c, 3000);
      sendJson(c, { logtail: { owner_id: OWNER_B, build_id: BUILD_B } });
      await waitFor(() => c.frames.length > 0, 3000);
      expect(c.frames[0]).to.equal(NOT_FOUND);
      await sleep(300);
      expect(c.frames.filter((f) => f.indexOf(SENTINEL_B) !== -1)).to.deep.equal([]);
      expect(tailPaths.filter((p) => p.indexOf(TMP + "/deploy/" + OWNER_B) === 0)).to.deep.equal([]);
    }, 15000);

    it("(11) the other owner cannot tail this owner's build by naming it", async function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const c = openClient("/" + OWNER_B, "sid=b");
      await waitOpen(c, 3000);
      sendJson(c, { logtail: { owner_id: OWNER_A, build_id: BUILD_A } });
      const frame = await waitFrame(c, (f) => f === NOT_FOUND, 3000);
      expect(frame).to.equal(NOT_FOUND);
      await sleep(300);
      expect(c.frames.filter((f) => f.indexOf(SENTINEL_A) !== -1)).to.deep.equal([]);
    }, 15000);

    it("(12) a session on another owner's path is closed with 1008 and never dispatches", async function () {
      spyOn(blog, "logtail").and.callThrough();
      const c = openClient("/" + OWNER_B, "sid=a");
      c.ws.on("open", () => {
        try { c.ws.send(JSON.stringify({ logtail: { owner_id: OWNER_B, build_id: BUILD_B } })); } catch (_e) { /* closed */ }
      });
      const closed = await waitClose(c, 3000);
      expect(closed, "close event").to.not.equal(null);
      expect(closed.code).to.equal(1008);
      await sleep(200);
      expect(blog.logtail.calls.count()).to.equal(0);
      expect(Object.keys(ctx.registry).filter((k) => k.indexOf(OWNER_B) === 0)).to.deep.equal([]);
    }, 15000);

    it("(13) no cookie, or a cookie without a session owner, is closed with 1008", async function () {
      for (const cookie of [undefined, "sid=zzz"]) {
        const c = openClient("/" + OWNER_A, cookie);
        const closed = await waitClose(c, 3000);
        expect(closed, String(cookie)).to.not.equal(null);
        expect(closed.code, String(cookie)).to.equal(1008);
      }
    }, 15000);

    it("(14) malformed frames are ignored and the socket keeps working", async function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const c = openClient("/" + OWNER_A, "sid=a");
      await waitOpen(c, 3000);
      for (const f of ["x", "null", "[]", "1", "\"s\"", "{\"logtail\":null}", "{\"logtail\":{\"build_id\":7}}", "{\"init\":null}"]) {
        c.ws.send(f);
      }
      sendJson(c, { logtail: { build_id: BUILD_A } });
      const frame = await waitFrame(c, (f) => f.indexOf(SENTINEL_A) !== -1, 3000);
      expect(frame, "sentinel frame").to.not.equal(null);
      expect(c.close).to.equal(null);
      const fakeWs = { owner: OWNER_A, send() { /* no-op */ } };
      expect(() => SocketSession.onMessage(fakeWs, "x", ctx)).to.not.throw();
      expect(() => SocketSession.onMessage(fakeWs, "null", ctx)).to.not.throw();
    }, 15000);

    it("(15) init initializes the messenger for the socket's verified owner only", async function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const urlPath = "/" + OWNER_A;
      const c = openClient(urlPath, "sid=a");
      await waitOpen(c, 3000);
      sendJson(c, { init: OWNER_B });
      await waitFor(() => messengerCalls.length > 0, 3000);
      await sleep(200);
      expect(messengerCalls.length).to.equal(1);
      expect(messengerCalls[0].owner).to.equal(OWNER_A);
      expect(messengerCalls[0].socket === serverSocketFor(urlPath)).to.equal(true);
      expect(messengerCalls.filter((m) => m.owner === OWNER_B)).to.deep.equal([]);
    }, 15000);

    it("(16) log connections of two owners with the same id do not collide", async function () {
      expect(SocketSession, "lib/thinx/socket_session.js").to.not.equal(null);
      const a = openClient("/" + OWNER_A + "/777", "sid=a");
      const b = openClient("/" + OWNER_B + "/777", "sid=b");
      await waitOpen(a, 3000);
      await waitOpen(b, 3000);
      const ra = ctx.registry[OWNER_A + "/777"];
      const rb = ctx.registry[OWNER_B + "/777"];
      expect(ra, "owner A log socket").to.not.equal(undefined);
      expect(rb, "owner B log socket").to.not.equal(undefined);
      expect(ra === rb).to.equal(false);
      expect(ctx.registry["777"]).to.equal(undefined);
    }, 15000);
  });

  describe("LOGTAIL ws: thinx-core wiring", function () {

    it("(17) thinx-core requires socket_session and the connection handler calls SocketSession.accept", function () {
      const src = fs.readFileSync(CORE_PATH, "utf8");
      const code = codeLines(src).join("\n");
      expect(/require\(\s*["']\.\/lib\/thinx\/socket_session(\.js)?["']\s*\)/.test(code)).to.equal(true);
      const region = connectionRegion(code);
      expect(region, "wss.on('connection') region").to.not.equal(null);
      expect(region.indexOf("SocketSession.accept(")).to.not.equal(-1);
    }, 15000);

    it("(18) thinx-core has no message listener of its own and never reads logtail.owner_id", function () {
      const src = fs.readFileSync(CORE_PATH, "utf8");
      expect(src.indexOf('ws.on("message"')).to.equal(-1);
      expect(src.indexOf("ws.on('message'")).to.equal(-1);
      expect(codeLines(src).filter((l) => l.indexOf("logtail.owner_id") !== -1)).to.deep.equal([]);
    }, 15000);
  });

  describe("LOGTAIL http: dead tail routes removed", function () {

    it("(19) thinx-core registers no /logs/tail route", function () {
      const src = fs.readFileSync(CORE_PATH, "utf8");
      expect(codeLines(src).filter((l) => l.indexOf("/logs/tail") !== -1)).to.deep.equal([]);
    }, 15000);

    it("(20) the connection handler registers no HTTP route and the per-connection registration is gone", function () {
      const src = fs.readFileSync(CORE_PATH, "utf8");
      const region = connectionRegion(codeLines(src).join("\n"));
      expect(region, "wss.on('connection') region").to.not.equal(null);
      for (const call of ["app.get(", "app.post(", "app.put(", "app.delete(", "app.patch(", "app.all(", "app.use("]) {
        expect(region.indexOf(call), call).to.equal(-1);
      }
      expect(src.indexOf("initLogTail")).to.equal(-1);
    }, 15000);
  });
});
