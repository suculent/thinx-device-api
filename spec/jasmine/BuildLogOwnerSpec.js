/*
 * Build log by id is owner-checked (phase 26 deferred item, 26-02 #2).
 *
 * Part 1 drives Buildlog#fetchOwned against a fake managed_builds (both
 * document shapes). Part 2 drives the three by-id routes in router.logs.js
 * with Buildlog/Audit replaced in require.cache. Needs no helpers, no CouchDB
 * and no Redis. Owner ids are synthetic; failures never print log text.
 */

const expect = require('chai').expect;

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const BUILDLOG_PATH = require.resolve("../../lib/thinx/buildlog");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const ROUTER_PATH = require.resolve("../../lib/router.logs");

const OWNER_A = "a".repeat(64);
const OWNER_B = "b".repeat(64);
const FLAT_ID = "3f1c2a9e-7b4d-4e21-9a0c-5d6e7f809a1b";
const NESTED_ID = "0b8f6d1e-2c3a-4f5e-8a9b-1c2d3e4f5a6b";
const LOG_SENTINEL = "log-line-sentinel-77aa";
const DELETED_ID = "5a5a5a5a-1111-4222-8333-444444444444";
const BROKEN_ID = "6b6b6b6b-1111-4222-8333-444444444444";
const INTERNAL_URI = "http://couchdb-internal-host:5984/managed_builds/";

const DOCS = {};
DOCS[FLAT_ID] = { _id: FLAT_ID, owner: OWNER_A, udid: "u-1", build_id: FLAT_ID, log: [{ message: LOG_SENTINEL, udid: "u-1" }] };
DOCS[NESTED_ID] = { _id: NESTED_ID, log: [{ owner: OWNER_A, udid: "u-2", build_id: NESTED_ID, message: LOG_SENTINEL }] };

function fakeCouch() {
  const db = {
    get(id, cb) {
      if (DOCS[id]) return cb(null, JSON.parse(JSON.stringify(DOCS[id])));
      // nano 11 shapes: a deleted doc is a 404 with reason "deleted", not "missing";
      // a socket failure has an errno code. Both carry the request URI.
      if (id === DELETED_ID) return cb(Object.assign(new Error("deleted"), { statusCode: 404, reason: "deleted", request: { uri: INTERNAL_URI + id } }));
      if (id === BROKEN_ID) return cb(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED", request: { uri: INTERNAL_URI + id } }));
      cb(Object.assign(new Error("Error: missing"), { statusCode: 404 }));
    }
  };
  return { use: () => db, db: { use: () => db } };
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

function fetchOwned(blog, id, owner) {
  return new Promise((resolve) => blog.fetchOwned(id, owner, (err, body) => resolve({ err: err, body: body })));
}

describe("Buildlog#fetchOwned (owner-checked build log by id)", function () {

  let blog, savedCouch, savedBuildlog;

  beforeAll(function () {
    savedCouch = require.cache[COUCH_PATH];
    savedBuildlog = require.cache[BUILDLOG_PATH];
    require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
    delete require.cache[BUILDLOG_PATH];
    const Buildlog = require(BUILDLOG_PATH);
    blog = new Buildlog();
  });

  afterAll(function () {
    if (savedCouch) require.cache[COUCH_PATH] = savedCouch; else delete require.cache[COUCH_PATH];
    if (savedBuildlog) require.cache[BUILDLOG_PATH] = savedBuildlog; else delete require.cache[BUILDLOG_PATH];
  });

  it("returns the owner's flat-shape build", async function () {
    captureConsole();
    const r = await fetchOwned(blog, FLAT_ID, OWNER_A);
    expect(r.err).to.equal(false);
    expect(r.body.log[0].message).to.equal(LOG_SENTINEL);
  });

  it("returns the owner's nested-shape build", async function () {
    captureConsole();
    const r = await fetchOwned(blog, NESTED_ID, OWNER_A);
    expect(r.err).to.equal(false);
    expect(r.body.log[0].message).to.equal(LOG_SENTINEL);
  });

  it("answers another owner's build exactly like a missing build", async function () {
    captureConsole();
    const other = await fetchOwned(blog, FLAT_ID, OWNER_B);
    const otherNested = await fetchOwned(blog, NESTED_ID, OWNER_B);
    const missing = await fetchOwned(blog, "9d9d9d9d-0000-4000-8000-000000000000", OWNER_A);
    expect(other.err).to.equal(true);
    expect(otherNested.err).to.equal(true);
    expect(JSON.stringify(other.body)).to.not.contain(LOG_SENTINEL);
    expect(JSON.stringify(otherNested.body)).to.not.contain(LOG_SENTINEL);
    expect(Object.keys(other.body)).to.deep.equal(Object.keys(missing.body));
    expect(other.body.log[0].message).to.equal(missing.body.log[0].message);
  });

  it("refuses an empty owner", async function () {
    captureConsole();
    const r = await fetchOwned(blog, FLAT_ID, undefined);
    expect(r.err).to.equal(true);
    expect(JSON.stringify(r.body)).to.not.contain(LOG_SENTINEL);
  });

  it("answers a deleted build and a CouchDB failure exactly like a missing build (WR-01)", async function () {
    const lines = captureConsole();
    const missing = await fetchOwned(blog, "9d9d9d9d-0000-4000-8000-000000000000", OWNER_A);
    for (const id of [DELETED_ID, BROKEN_ID]) {
      const r = await fetchOwned(blog, id, OWNER_A);
      expect(r.err, id).to.equal(true);
      expect(r.body).to.not.be.instanceOf(Error);
      expect(Object.keys(r.body)).to.deep.equal(Object.keys(missing.body));
      expect(r.body.log[0].message).to.equal("error_missing_build");
      expect(JSON.stringify(r.body)).to.not.contain("couchdb-internal-host");
    }
    expect(lines.filter((l) => l.indexOf("couchdb-internal-host") !== -1)).to.deep.equal([]);
  });
});

describe("router.logs build log by id requires a session and passes its owner", function () {

  const calls = [];
  let app, savedAudit, savedBuildlog, savedRouter;

  class BuildlogStub {
    static toBuildListItem(doc) { return doc; }
    fetch() { calls.push({ method: "fetch" }); }
    fetchOwned(id, owner, cb) {
      calls.push({ method: "fetchOwned", owner: owner });
      if (owner === OWNER_A) return cb(false, { log: [{ message: LOG_SENTINEL }] });
      cb(true, { log: [{ message: "error_missing_build" }] });
    }
  }
  class AuditStub { }

  function fakeApp() {
    const handlers = {};
    return { handlers: handlers, get(p, fn) { handlers["GET " + p] = fn; }, post(p, fn) { handlers["POST " + p] = fn; } };
  }

  function call(method, route, sessionOwner) {
    return new Promise((resolve) => {
      const res = {
        statusCode: 200, headers: {}, body: undefined,
        status(c) { this.statusCode = c; return this; },
        header(k, v) { this.headers[k] = v; return this; },
        end(b) { this.body = b; resolve(this); }
      };
      const session = { destroy() { /* fake */ } };
      if (typeof sessionOwner !== "undefined") session.owner = sessionOwner;
      const req = { query: {}, session: session, headers: {}, body: { build_id: FLAT_ID }, params: { bid: FLAT_ID } };
      app.handlers[method + " " + route](req, res);
    });
  }

  beforeAll(function () {
    savedAudit = require.cache[AUDIT_PATH];
    savedBuildlog = require.cache[BUILDLOG_PATH];
    savedRouter = require.cache[ROUTER_PATH];
    require.cache[AUDIT_PATH] = { id: AUDIT_PATH, filename: AUDIT_PATH, loaded: true, exports: AuditStub };
    require.cache[BUILDLOG_PATH] = { id: BUILDLOG_PATH, filename: BUILDLOG_PATH, loaded: true, exports: BuildlogStub };
    delete require.cache[ROUTER_PATH];
    app = fakeApp();
    require(ROUTER_PATH)(app);
  });

  afterAll(function () {
    if (savedAudit) require.cache[AUDIT_PATH] = savedAudit; else delete require.cache[AUDIT_PATH];
    if (savedBuildlog) require.cache[BUILDLOG_PATH] = savedBuildlog; else delete require.cache[BUILDLOG_PATH];
    if (savedRouter) require.cache[ROUTER_PATH] = savedRouter; else delete require.cache[ROUTER_PATH];
  });

  beforeEach(function () { calls.length = 0; });

  const ROUTES = [["GET", "/api/v2/logs/build/:bid"], ["GET", "/api/user/logs/build/:bid"], ["POST", "/api/user/logs/build"]];

  ROUTES.forEach(([method, route]) => {
    it(method + " " + route + " without a session is 401 and reads nothing", async function () {
      captureConsole();
      const res = await call(method, route, undefined);
      expect(res.statusCode).to.equal(401);
      expect(calls).to.deep.equal([]);
    });

    it(method + " " + route + " uses fetchOwned with the session owner", async function () {
      const lines = captureConsole();
      const res = await call(method, route, OWNER_A);
      expect(calls).to.deep.equal([{ method: "fetchOwned", owner: OWNER_A }]);
      expect(JSON.parse(res.body).success).to.equal(true);
      expect(lines.filter((l) => l.indexOf(OWNER_A) !== -1 || l.indexOf(LOG_SENTINEL) !== -1)).to.deep.equal([]);
    });

    it(method + " " + route + " for another owner's build is build_fetch_failed with no log text", async function () {
      const lines = captureConsole();
      const res = await call(method, route, OWNER_B);
      expect(res.body).to.not.contain(LOG_SENTINEL);
      expect(JSON.parse(res.body).success).to.equal(false);
      expect(JSON.parse(res.body).response).to.equal("build_fetch_failed");
      expect(lines.filter((l) => l.indexOf(OWNER_B) !== -1)).to.deep.equal([]);
    });
  });
});
