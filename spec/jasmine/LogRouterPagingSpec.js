/*
 * LogRouterPagingSpec.js — LOG-02 / LOG-03 / LOG-04 (phase 26-02)
 *
 * Drives the real lib/router.logs.js handlers through a fake Express app.
 * lib/thinx/audit.js and lib/thinx/buildlog.js are replaced in require.cache
 * by recording stubs before router.logs.js is required fresh; the originals
 * are restored in afterAll.
 *
 * Proves that:
 *   - without `limit` and `cursor` both routes answer exactly {success, response},
 *   - with `limit` or `cursor` they answer {success, response, paging} in that
 *     key order, paging keys {limit, has_more, next_cursor},
 *   - the owner always comes from the session (an `owner` query parameter is
 *     ignored and the cursor never carries one),
 *   - invalid limit/cursor values give 400 invalid_limit / invalid_cursor,
 *   - no body ever carries total_rows.
 *
 * Owners are synthetic 64-char values and are never printed.
 */

const expect = require('chai').expect;

const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const BUILDLOG_PATH = require.resolve("../../lib/thinx/buildlog");
const ROUTER_PATH = require.resolve("../../lib/router.logs");
const paging = require("../../lib/thinx/log_paging");

const OWNER_A = "a".repeat(64);
const OWNER_B = "b".repeat(64);
const DOC32 = "0123456789abcdef0123456789abcdef";
const UUID = "3f1c2a9e-7b4d-4e21-9a0c-5d6e7f809a1b";

const calls = { fetch: [], fetchPage: [], list: [], listPage: [] };
const mode = { fetchPage: "ok", listPage: "ok", list: "ok" };

const AUDIT_ITEMS = [
  { date: "2026-09-30T10:00:00.000Z", message: "m1", flags: ["info"] },
  { date: "2026-09-29T10:00:00.000Z", message: "m2", flags: ["warning"] }
];
const NEXT_AUDIT = paging.encodeCursor("2026-09-28T10:00:00.000Z", DOC32);
const NEXT_BUILD = paging.encodeCursor(1790000000000, UUID);

class AuditStub {
  fetch(owner, cb) {
    calls.fetch.push({ owner: owner });
    cb(false, AUDIT_ITEMS.slice());
  }
  fetchPage(owner, limit, cursor, cb) {
    calls.fetchPage.push({ owner: owner, limit: limit, cursor: cursor });
    if (mode.fetchPage === "error") return cb({ statusCode: 500 });
    cb(false, { items: AUDIT_ITEMS.slice(0, Math.min(limit, 2)), paging: { limit: limit, has_more: true, next_cursor: NEXT_AUDIT } });
  }
}

const FLAT_DOC = { _id: UUID, owner: OWNER_A, udid: UUID, build_id: UUID, start_time: 1790000000000, timestamp: 1790000000000 };
const NESTED_DOC = { _id: DOC32, log: [{ owner: OWNER_A, udid: UUID, build_id: DOC32, start_time: 1780000000000, timestamp: 1780000000000 }] };

class BuildlogStub {
  // marker transform: proves the router uses Buildlog.toBuildListItem on the right object
  static toBuildListItem(doc) {
    return { mapped: (doc && doc._id) ? doc._id : null };
  }
  list(owner, cb) {
    calls.list.push({ owner: owner });
    if (mode.list === "error") return cb(true, "boom");
    if (mode.list === "empty") return cb(false, null);
    cb(false, { rows: [{ id: FLAT_DOC._id, key: OWNER_A, value: FLAT_DOC }] });
  }
  listPage(owner, limit, cursor, cb) {
    calls.listPage.push({ owner: owner, limit: limit, cursor: cursor });
    if (mode.listPage === "error") return cb({ statusCode: 500 });
    cb(false, {
      rows: [
        { id: FLAT_DOC._id, key: [OWNER_A, 1790000000000], value: null, doc: FLAT_DOC },
        { id: NESTED_DOC._id, key: [OWNER_A, 1780000000000], value: null, doc: NESTED_DOC }
      ].slice(0, limit),
      paging: { limit: limit, has_more: true, next_cursor: NEXT_BUILD }
    });
  }
}

function fakeApp() {
  const handlers = {};
  return {
    handlers: handlers,
    get(p, fn) { handlers["GET " + p] = fn; },
    post(p, fn) { handlers["POST " + p] = fn; }
  };
}

function call(app, route, query, sessionOwner) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      body: undefined,
      status(c) { this.statusCode = c; return this; },
      header(k, v) { this.headers[k] = v; return this; },
      end(b) { this.body = b; resolve(this); }
    };
    const session = { destroy() { /* fake */ } };
    if (typeof sessionOwner !== "undefined") session.owner = sessionOwner;
    const req = { query: query || {}, session: session, headers: {}, body: {}, params: {} };
    app.handlers["GET " + route](req, res);
  });
}

function json(res) {
  return JSON.parse(res.body);
}

describe("LOG-03/LOG-04 router.logs paged and legacy branches", function () {

  let app;
  let savedAudit, savedBuildlog, savedRouter;

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

  beforeEach(function () {
    calls.fetch = []; calls.fetchPage = []; calls.list = []; calls.listPage = [];
    mode.fetchPage = "ok"; mode.listPage = "ok"; mode.list = "ok";
  });

  ["/api/v2/logs/audit", "/api/user/logs/audit"].forEach((route) => {

    describe("audit " + route, function () {

      it("no query: legacy {success, response} from fetch with the session owner, no paging", async function () {
        const res = await call(app, route, {}, OWNER_A);
        const body = json(res);
        expect(res.statusCode).to.equal(200);
        expect(Object.keys(body)).to.deep.equal(["success", "response"]);
        expect(body.success).to.equal(true);
        expect(body.response).to.deep.equal(AUDIT_ITEMS);
        expect(calls.fetch).to.deep.equal([{ owner: OWNER_A }]);
        expect(calls.fetchPage).to.have.length(0);
        expect(res.body).to.not.contain("total_rows");
      });

      it("?limit=2: {success, response, paging} with paging {limit, has_more, next_cursor}", async function () {
        const res = await call(app, route, { limit: "2" }, OWNER_A);
        const body = json(res);
        expect(res.statusCode).to.equal(200);
        expect(Object.keys(body)).to.deep.equal(["success", "response", "paging"]);
        expect(Object.keys(body.paging)).to.deep.equal(["limit", "has_more", "next_cursor"]);
        expect(body.success).to.equal(true);
        expect(body.response).to.be.an("array").with.length(2);
        expect(body.paging).to.deep.equal({ limit: 2, has_more: true, next_cursor: NEXT_AUDIT });
        expect(calls.fetchPage).to.deep.equal([{ owner: OWNER_A, limit: 2, cursor: null }]);
        expect(calls.fetch).to.have.length(0);
        expect(res.body).to.not.contain("total_rows");
      });

      it("?cursor=<valid>: limit defaults to 100 and the cursor is decoded", async function () {
        const res = await call(app, route, { cursor: NEXT_AUDIT }, OWNER_A);
        expect(Object.keys(json(res))).to.deep.equal(["success", "response", "paging"]);
        expect(calls.fetchPage).to.deep.equal([{
          owner: OWNER_A, limit: 100, cursor: { k: "2026-09-28T10:00:00.000Z", i: DOC32 }
        }]);
      });

      it("?limit=2&owner=<other>: fetchPage still gets the session owner", async function () {
        await call(app, route, { limit: "2", owner: OWNER_B }, OWNER_A);
        expect(calls.fetchPage).to.have.length(1);
        expect(calls.fetchPage[0].owner).to.equal(OWNER_A);
      });

      it("?owner=<other> without paging: legacy fetch still gets the session owner", async function () {
        await call(app, route, { owner: OWNER_B }, OWNER_A);
        expect(calls.fetch).to.deep.equal([{ owner: OWNER_A }]);
      });

      it("a malformed, oversized or repeated cursor gives 400 invalid_cursor", async function () {
        for (const cursor of ["%%%", "A".repeat(600), [NEXT_AUDIT, NEXT_AUDIT], "", NEXT_BUILD]) {
          const res = await call(app, route, { cursor: cursor }, OWNER_A);
          expect(res.statusCode).to.equal(400);
          expect(json(res)).to.deep.equal({ success: false, response: "invalid_cursor" });
        }
        expect(calls.fetchPage).to.have.length(0);
      });

      it("?limit=x and a repeated limit give 400 invalid_limit", async function () {
        for (const limit of ["x", ["1", "2"], "12345", "-1"]) {
          const res = await call(app, route, { limit: limit }, OWNER_A);
          expect(res.statusCode).to.equal(400);
          expect(json(res)).to.deep.equal({ success: false, response: "invalid_limit" });
        }
        expect(calls.fetchPage).to.have.length(0);
      });

      it("no session gives 401", async function () {
        const res = await call(app, route, { limit: "2" }, undefined);
        expect(res.statusCode).to.equal(401);
        expect(calls.fetchPage).to.have.length(0);
        expect(calls.fetch).to.have.length(0);
      });

      it("a fetchPage error gives {success:false, response:\"log_fetch_failed\"}", async function () {
        mode.fetchPage = "error";
        const res = await call(app, route, { limit: "5" }, OWNER_A);
        expect(json(res)).to.deep.equal({ success: false, response: "log_fetch_failed" });
      });
    });
  });

  ["/api/v2/logs/build", "/api/user/logs/build/list"].forEach((route) => {

    describe("builds " + route, function () {

      it("no query: legacy {success, response} with toBuildListItem over list rows", async function () {
        const res = await call(app, route, {}, OWNER_A);
        const body = json(res);
        expect(res.statusCode).to.equal(200);
        expect(Object.keys(body)).to.deep.equal(["success", "response"]);
        expect(body).to.deep.equal({ success: true, response: [{ mapped: FLAT_DOC._id }] });
        expect(calls.list).to.deep.equal([{ owner: OWNER_A }]);
        expect(calls.listPage).to.have.length(0);
        expect(res.body).to.not.contain("total_rows");
      });

      it("?limit=1: {success, response, paging}, listPage with the session owner, items from row.doc", async function () {
        const res = await call(app, route, { limit: "1", owner: OWNER_B }, OWNER_A);
        const body = json(res);
        expect(Object.keys(body)).to.deep.equal(["success", "response", "paging"]);
        expect(Object.keys(body.paging)).to.deep.equal(["limit", "has_more", "next_cursor"]);
        expect(body.response).to.deep.equal([{ mapped: FLAT_DOC._id }]);
        expect(body.paging).to.deep.equal({ limit: 1, has_more: true, next_cursor: NEXT_BUILD });
        expect(calls.listPage).to.deep.equal([{ owner: OWNER_A, limit: 1, cursor: null }]);
        expect(calls.list).to.have.length(0);
        expect(res.body).to.not.contain("total_rows");
      });

      it("?limit=2 maps nested docs too", async function () {
        const body = json(await call(app, route, { limit: "2" }, OWNER_A));
        expect(body.response).to.deep.equal([{ mapped: FLAT_DOC._id }, { mapped: NESTED_DOC._id }]);
      });

      it("?cursor=<builds cursor> decodes a numeric k, limit 100", async function () {
        await call(app, route, { cursor: NEXT_BUILD }, OWNER_A);
        expect(calls.listPage).to.deep.equal([{ owner: OWNER_A, limit: 100, cursor: { k: 1790000000000, i: UUID } }]);
      });

      it("an audit-kind cursor (string k) gives 400 invalid_cursor", async function () {
        const res = await call(app, route, { cursor: NEXT_AUDIT }, OWNER_A);
        expect(res.statusCode).to.equal(400);
        expect(json(res)).to.deep.equal({ success: false, response: "invalid_cursor" });
        expect(calls.listPage).to.have.length(0);
      });

      it("?limit=abc gives 400 invalid_limit", async function () {
        const res = await call(app, route, { limit: "abc" }, OWNER_A);
        expect(res.statusCode).to.equal(400);
        expect(json(res)).to.deep.equal({ success: false, response: "invalid_limit" });
      });

      it("a listPage error gives build_list_failed", async function () {
        mode.listPage = "error";
        const res = await call(app, route, { limit: "5" }, OWNER_A);
        expect(json(res)).to.deep.equal({ success: false, response: "build_list_failed" });
      });

      it("legacy errors keep build_list_failed and build_list_empty", async function () {
        mode.list = "error";
        expect(json(await call(app, route, {}, OWNER_A))).to.deep.equal({ success: false, response: "build_list_failed" });
        mode.list = "empty";
        expect(json(await call(app, route, {}, OWNER_A))).to.deep.equal({ success: false, response: "build_list_empty" });
      });

      it("no session gives 401", async function () {
        const res = await call(app, route, { limit: "1" }, undefined);
        expect(res.statusCode).to.equal(401);
        expect(calls.listPage).to.have.length(0);
      });
    });
  });
});
