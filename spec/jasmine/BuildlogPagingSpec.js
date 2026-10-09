/*
 * BuildlogPagingSpec.js — LOG-04 / D-07 / D-18 (phase 26-02)
 *
 * lib/thinx/couch is replaced in require.cache by a fake whose managed_builds
 * handle records every view and destroy call; buildlog.js is required fresh
 * and both cache entries are restored in afterAll.
 *
 * Proves that:
 *   - the legacy list() is keyed by owner, keeps its 30-day display filter
 *     and never destroys anything (reads are side-effect free, D-07),
 *   - listPage() pages paging/builds_by_owner_time with include_docs,
 *   - purgeOwner() reaches flat AND nested builds through the new view and
 *     falls back to latest_builds {key: owner} when it errors (D-18),
 *   - toBuildListItem() produces the legacy list-item shape without mutating
 *     its input,
 *   - the prune method is gone.
 *
 * Owners are synthetic 64-char values and are never printed.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require('chai').expect;

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const BUILDLOG_PATH = require.resolve("../../lib/thinx/buildlog");
const paging = require("../../lib/thinx/log_paging");

const OWNER_A = "a".repeat(64);
const OWNER_B = "b".repeat(64);
const DAY = 86400 * 1000;

// views: "<design>/<view>" -> function(q) returning a body, or an Error to fail with
const fake = { views: {}, calls: [], destroyed: [] };

function fakeDb() {
  return {
    view(design, view, q, cb) {
      fake.calls.push({ design: design, view: view, q: JSON.parse(JSON.stringify(q)) });
      const h = fake.views[design + "/" + view];
      let p;
      if (typeof h !== "function") p = Promise.reject(Object.assign(new Error("missing"), { statusCode: 404, error: "not_found" }));
      else {
        const out = h(q);
        p = (out instanceof Error) ? Promise.reject(out) : Promise.resolve(out);
      }
      if (typeof cb === "function") { p.then((b) => cb(null, b), (e) => cb(e)); return undefined; }
      return p;
    },
    destroy(id, rev, cb) {
      fake.destroyed.push({ id: id, rev: rev });
      if (typeof cb === "function") { cb(null, { ok: true }); return undefined; }
      return Promise.resolve({ ok: true });
    },
    get(_id, cb) { if (typeof cb === "function") cb(Object.assign(new Error("missing"), { statusCode: 404 })); },
    insert(_d, _id, cb) { if (typeof cb === "function") cb(null, { ok: true }); }
  };
}

function fakeCouch() {
  const db = fakeDb();
  return { use: () => db, db: { use: () => db } };
}

function flat(owner, id, ageDays, extra) {
  const t = Date.now() - ageDays * DAY;
  return Object.assign({ _id: id, _rev: "1-" + id, owner: owner, udid: "u-" + id, build_id: id, start_time: t, timestamp: t, last_update: t, state: "success" }, extra || {});
}

function nested(owner, id, ageDays) {
  const t = Date.now() - ageDays * DAY;
  return { _id: id, _rev: "1-" + id, log: [{ owner: owner, udid: "u-" + id, build_id: id, start_time: t, timestamp: t, last_update: t, message: "x" }] };
}

function asLatestRows(docs, key) {
  // latest_builds emits (doc.owner, doc)
  return { total_rows: docs.length, offset: 0, rows: docs.filter((d) => d.owner === key).map((d) => ({ id: d._id, key: d.owner, value: Object.assign({}, d) })) };
}

function cb2promise(fn) {
  return new Promise((resolve) => fn((err, body) => resolve({ err: err, body: body })));
}

describe("LOG-04 Buildlog list / listPage / purgeOwner / toBuildListItem", function () {

  let Buildlog, blog, savedCouch, savedBuildlog;

  beforeAll(function () {
    savedCouch = require.cache[COUCH_PATH];
    savedBuildlog = require.cache[BUILDLOG_PATH];
    require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
    delete require.cache[BUILDLOG_PATH];
    Buildlog = require(BUILDLOG_PATH);
    blog = new Buildlog();
  });

  afterAll(function () {
    if (savedCouch) require.cache[COUCH_PATH] = savedCouch; else delete require.cache[COUCH_PATH];
    if (savedBuildlog) require.cache[BUILDLOG_PATH] = savedBuildlog; else delete require.cache[BUILDLOG_PATH];
  });

  beforeEach(function () {
    fake.views = {}; fake.calls = []; fake.destroyed = [];
  });

  describe("legacy list(owner)", function () {

    it("queries builds/latest_builds with {key: owner}", async function () {
      fake.views["builds/latest_builds"] = (q) => asLatestRows([], q.key);
      await cb2promise((cb) => blog.list(OWNER_A, cb));
      expect(fake.calls).to.deep.equal([{ design: "builds", view: "latest_builds", q: { key: OWNER_A } }]);
    });

    it("returns only the owner's builds of the last 30 days and never destroys anything", async function () {
      const docs = [
        flat(OWNER_A, "a1", 1),
        flat(OWNER_A, "a2", 10),
        flat(OWNER_A, "old", 400, { value: { rev: "1-old" } }), // would have tripped the old prune shape
        flat(OWNER_B, "b1", 1)
      ];
      // a misbehaving view that ignores the key must still not leak B
      fake.views["builds/latest_builds"] = () => ({ rows: docs.map((d) => ({ id: d._id, key: d.owner, value: Object.assign({}, d) })) });
      const r = await cb2promise((cb) => blog.list(OWNER_A, cb));
      expect(r.err).to.equal(false);
      expect(r.body.rows.map((x) => x.id)).to.deep.equal(["a1", "a2"]);
      expect(fake.destroyed).to.have.length(0);
    });

    it("list(null) and list(\"\") return {rows: []} without a query", async function () {
      for (const o of [null, "", undefined, 42]) {
        const r = await cb2promise((cb) => blog.list(o, cb));
        expect(r.err).to.equal(false);
        expect(r.body).to.deep.equal({ rows: [] });
      }
      expect(fake.calls).to.have.length(0);
    });

    it("a view error keeps the legacy error contract (err true)", async function () {
      fake.views["builds/latest_builds"] = () => Object.assign(new Error("boom"), { statusCode: 500 });
      const r = await cb2promise((cb) => blog.list(OWNER_A, cb));
      expect(r.err).to.equal(true);
    });
  });

  describe("listPage(owner, limit, cursor)", function () {

    function pagedRows(q) {
      const docs = [flat(OWNER_A, "f1", 1), nested(OWNER_A, "n1", 2), flat(OWNER_A, "f2", 3)];
      const rows = docs.map((d) => {
        const r = d.owner ? d : d.log[0];
        return { id: d._id, key: [r.owner, r.start_time], value: null, doc: d };
      });
      return { total_rows: 3, offset: 0, rows: rows.slice(0, q.limit) };
    }

    it("queries paging/builds_by_owner_time with buildQuery(owner, L, cursor, {include_docs:true})", async function () {
      fake.views["paging/builds_by_owner_time"] = pagedRows;
      await cb2promise((cb) => blog.listPage(OWNER_A, 2, null, cb));
      expect(fake.calls).to.deep.equal([{
        design: "paging", view: "builds_by_owner_time", q: paging.buildQuery(OWNER_A, 2, null, { include_docs: true })
      }]);
      expect(fake.calls[0].q.include_docs).to.equal(true);
    });

    it("returns rows with doc plus paging; L+1 rows give has_more", async function () {
      fake.views["paging/builds_by_owner_time"] = pagedRows;
      const r = await cb2promise((cb) => blog.listPage(OWNER_A, 2, null, cb));
      expect(r.err).to.equal(false);
      expect(Object.keys(r.body)).to.deep.equal(["rows", "paging"]);
      expect(r.body.rows).to.have.length(2);
      expect(r.body.rows[0].doc._id).to.equal("f1");
      expect(r.body.rows[1].doc._id).to.equal("n1");
      expect(r.body.paging.has_more).to.equal(true);
      expect(paging.decodeCursor(r.body.paging.next_cursor, "builds").ok).to.equal(true);
      expect(fake.destroyed).to.have.length(0);
    });

    it("passes the cursor inside the owner range", async function () {
      fake.views["paging/builds_by_owner_time"] = pagedRows;
      await cb2promise((cb) => blog.listPage(OWNER_A, 5, { k: 123, i: "f2" }, cb));
      expect(fake.calls[0].q.startkey).to.deep.equal([OWNER_A, 123]);
      expect(fake.calls[0].q.startkey_docid).to.equal("f2");
      expect(fake.calls[0].q.endkey).to.deep.equal([OWNER_A]);
    });

    it("an invalid owner gives an empty page without a query", async function () {
      const r = await cb2promise((cb) => blog.listPage(null, 10, null, cb));
      expect(fake.calls).to.have.length(0);
      expect(r.body).to.deep.equal({ rows: [], paging: { limit: 10, has_more: false, next_cursor: null } });
    });

    it("a view error is passed to the callback", async function () {
      fake.views["paging/builds_by_owner_time"] = () => Object.assign(new Error("x"), { statusCode: 404, error: "not_found" });
      const r = await cb2promise((cb) => blog.listPage(OWNER_A, 10, null, cb));
      expect(r.err).to.be.an("error");
      expect(fake.destroyed).to.have.length(0);
    });
  });

  describe("purgeOwner(owner) (GDPR, D-18)", function () {

    it("destroys flat and nested builds via builds_by_owner_time [owner]..[owner,{}] include_docs", async function () {
      const docs = [flat(OWNER_A, "f1", 1), nested(OWNER_A, "n1", 900), nested(OWNER_A, "n2", 1000)];
      fake.views["paging/builds_by_owner_time"] = () => ({
        rows: docs.map((d) => ({ id: d._id, key: [OWNER_A, 1], value: null, doc: d }))
      });
      const r = await cb2promise((cb) => blog.purgeOwner(OWNER_A, cb));
      expect(fake.calls).to.deep.equal([{
        design: "paging", view: "builds_by_owner_time",
        q: { startkey: [OWNER_A], endkey: [OWNER_A, {}], include_docs: true }
      }]);
      expect(r.err).to.equal(null);
      expect(r.body).to.equal(3);
      expect(fake.destroyed).to.deep.equal([
        { id: "f1", rev: "1-f1" }, { id: "n1", rev: "1-n1" }, { id: "n2", rev: "1-n2" }
      ]);
    });

    it("falls back to builds/latest_builds {key: owner} when the new view errors", async function () {
      fake.views["paging/builds_by_owner_time"] = () => Object.assign(new Error("x"), { statusCode: 404, error: "not_found" });
      fake.views["builds/latest_builds"] = (q) => asLatestRows([flat(OWNER_A, "f1", 1), flat(OWNER_B, "b1", 1)], q.key);
      spyOn(console, "log").and.callThrough();
      const r = await cb2promise((cb) => blog.purgeOwner(OWNER_A, cb));
      expect(fake.calls.map((c) => c.design + "/" + c.view)).to.deep.equal(["paging/builds_by_owner_time", "builds/latest_builds"]);
      expect(fake.calls[1].q).to.deep.equal({ key: OWNER_A });
      expect(r.err).to.equal(null);
      expect(r.body).to.equal(1);
      expect(fake.destroyed).to.deep.equal([{ id: "f1", rev: "1-f1" }]);
      const printed = console.log.calls.allArgs().map((a) => a.join(" ")).join("\n");
      expect(printed).to.not.contain(OWNER_A);
    });

    it("no builds gives (null, 0)", async function () {
      fake.views["paging/builds_by_owner_time"] = () => ({ rows: [] });
      const r = await cb2promise((cb) => blog.purgeOwner(OWNER_A, cb));
      expect(r.err).to.equal(null);
      expect(r.body).to.equal(0);
    });
  });

  describe("Buildlog.toBuildListItem(doc)", function () {

    it("a doc with a log array keeps the doc with log = [the latest line]", function () {
      const doc = { _id: "x", owner: OWNER_A, udid: "u", log: [
        { message: "a", timestamp: 10 }, { message: "c", timestamp: 30 }, { message: "b", timestamp: 20 }
      ] };
      const snapshot = JSON.parse(JSON.stringify(doc));
      const item = Buildlog.toBuildListItem(doc);
      expect(item).to.deep.equal(Object.assign({}, snapshot, { log: [{ message: "c", timestamp: 30 }] }));
      expect(doc).to.deep.equal(snapshot); // input not mutated
    });

    it("a nested-shape doc keeps its single identity line", function () {
      const d = nested(OWNER_A, "n1", 1);
      const item = Buildlog.toBuildListItem(d);
      expect(item.log).to.deep.equal([d.log[0]]);
      expect(item._id).to.equal("n1");
    });

    it("a doc without log gives {date: timestamp, udid}", function () {
      expect(Buildlog.toBuildListItem({ _id: "x", owner: OWNER_A, udid: "u1", timestamp: 1234 })).to.deep.equal({ date: 1234, udid: "u1", build_id: "x", state: undefined, start_time: 1234 });
    });
  });

  it("the prototype has no prune method (D-07)", function () {
    expect(Object.prototype.hasOwnProperty.call(Buildlog.prototype, "prune")).to.equal(false);
    expect(typeof blog.prune).to.equal("undefined");
  });
});
