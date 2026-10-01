/*
 * DesignUpsertSpec.js — LOG-01 (phase 26-01)
 *
 * Proves the boot-time `_design/paging` upsert without a CouchDB:
 *   - lib/thinx/design_upsert.js ensureDesignDoc is rev-aware (created /
 *     updated / unchanged / conflict), bounded by a timeout, and never rejects.
 *   - Database.initDatabase installs `_design/paging` for managed_logs and
 *     managed_builds on BOTH init branches (create success, and the 412
 *     "already exists" rejection that every production boot takes), never for
 *     devices or users, and never reaches process.exit.
 *   - The only design id ever written is `_design/paging` (D-13: `_design/logs`
 *     is never touched).
 *
 * Helper-free: fake nano objects only, synthetic values only. Specs call
 * initDatabase() directly, never init(), because init() arms the hourly
 * compaction timer and would keep the jasmine process alive.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require('chai').expect;
const path = require('path');

const UPSERT_PATH = path.resolve(__dirname, "../../lib/thinx/design_upsert.js");
const DB_PATH = path.resolve(__dirname, "../../lib/thinx/database.js");

// Loaded lazily so a missing module fails the individual spec, not the file.
function upsert() { return require(UPSERT_PATH); }

function couchError(statusCode, error, message) {
  return Object.assign(new Error(message || error), { statusCode: statusCode, error: error, reason: error });
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

const DESIRED = {
  _id: "_design/paging",
  language: "javascript",
  views: {
    v1: { map: "function (doc) { emit(doc._id, null); }" },
    v2: { map: "function (doc) { emit(doc.date, null); }" }
  }
};

// Same content, different key order everywhere, plus a stored _rev.
const DESIRED_REORDERED_WITH_REV = {
  views: {
    v2: { map: "function (doc) { emit(doc.date, null); }" },
    v1: { map: "function (doc) { emit(doc._id, null); }" }
  },
  _rev: "1-0123456789abcdef",
  language: "javascript",
  _id: "_design/paging"
};

// opts.stored         doc held before the call (null → GET answers 404)
// opts.getError       every GET rejects with this
// opts.getHang        every GET never settles
// opts.getThrows      GET throws synchronously
// opts.insertError    every insert rejects with this
// opts.afterConflict  doc answered by the second GET (null → 404)
function fakeDb(opts) {
  opts = opts || {};
  const state = { gets: 0, inserts: [], stored: opts.stored ? clone(opts.stored) : null };
  return {
    state: state,
    get(id) {
      state.gets++;
      if (opts.getThrows) throw new Error("sync boom");
      if (opts.getHang) return new Promise(() => { /* never settles */ });
      if (opts.getError) return Promise.reject(opts.getError);
      if (state.gets > 1 && Object.prototype.hasOwnProperty.call(opts, "afterConflict")) {
        return opts.afterConflict ? Promise.resolve(clone(opts.afterConflict)) : Promise.reject(couchError(404, "not_found"));
      }
      if (!state.stored || state.stored._id !== id) return Promise.reject(couchError(404, "not_found"));
      return Promise.resolve(clone(state.stored));
    },
    insert(doc, id) {
      state.inserts.push({ doc: clone(doc), id: id });
      if (opts.insertError) return Promise.reject(opts.insertError);
      state.stored = Object.assign(clone(doc), { _rev: "2-fedcba9876543210" });
      return Promise.resolve({ ok: true, id: doc._id, rev: state.stored._rev });
    }
  };
}

describe("LOG-01 design_upsert.ensureDesignDoc", function () {

  beforeEach(function () {
    spyOn(process, "exit");
  });

  afterEach(function () {
    expect(process.exit.calls.count()).to.equal(0);
  });

  it("loadPagingDesign('logs') returns the _design/paging doc and refuses other names", function () {
    const U = upsert();
    const doc = U.loadPagingDesign("logs");
    expect(doc).to.be.an('object');
    expect(doc._id).to.equal("_design/paging");
    expect(U.loadPagingDesign("devices")).to.equal(null);
    expect(U.loadPagingDesign("../logs")).to.equal(null);
    expect(U.loadPagingDesign(undefined)).to.equal(null);
  });

  it("canonical() sorts keys and drops every _rev; sameDesign ignores key order and _rev", function () {
    const U = upsert();
    expect(JSON.stringify(U.canonical({ b: 1, _rev: "x", a: { _rev: "y", d: [ { f: 1, e: 2 } ], c: 3 } })))
      .to.equal('{"a":{"c":3,"d":[{"e":2,"f":1}]},"b":1}');
    expect(U.sameDesign(DESIRED, DESIRED_REORDERED_WITH_REV)).to.equal(true);
    const changed = clone(DESIRED);
    changed.views.v1.map = "function (doc) { emit(doc.owner, null); }";
    expect(U.sameDesign(DESIRED, changed)).to.equal(false);
  });

  it("404 on GET creates the doc without a _rev (action created)", async function () {
    const db = fakeDb({ stored: null });
    const r = await upsert().ensureDesignDoc(db, DESIRED);
    expect(r.ok).to.equal(true);
    expect(r.action).to.equal("created");
    expect(db.state.inserts).to.have.length(1);
    expect(db.state.inserts[0].id).to.equal("_design/paging");
    expect(db.state.inserts[0].doc).to.not.have.property("_rev");
    expect(db.state.inserts[0].doc).to.deep.equal(DESIRED);
  });

  it("an equal stored doc (other key order, with _rev) causes no write (action unchanged)", async function () {
    const db = fakeDb({ stored: DESIRED_REORDERED_WITH_REV });
    const r = await upsert().ensureDesignDoc(db, DESIRED);
    expect(r.ok).to.equal(true);
    expect(r.action).to.equal("unchanged");
    expect(db.state.inserts).to.have.length(0);
  });

  it("a different stored doc is updated carrying the stored _rev (action updated)", async function () {
    const older = clone(DESIRED_REORDERED_WITH_REV);
    older.views.v1.map = "function (doc) { emit(doc.owner, null); }";
    const db = fakeDb({ stored: older });
    const r = await upsert().ensureDesignDoc(db, DESIRED);
    expect(r.ok).to.equal(true);
    expect(r.action).to.equal("updated");
    expect(db.state.inserts).to.have.length(1);
    expect(db.state.inserts[0].id).to.equal("_design/paging");
    expect(db.state.inserts[0].doc._rev).to.equal("1-0123456789abcdef");
    expect(db.state.inserts[0].doc.views).to.deep.equal(DESIRED.views);
  });

  it("does not mutate the desired doc when it adds the stored _rev", async function () {
    const desired = clone(DESIRED);
    const older = clone(DESIRED_REORDERED_WITH_REV);
    older.language = "erlang";
    await upsert().ensureDesignDoc(fakeDb({ stored: older }), desired);
    expect(desired).to.deep.equal(DESIRED);
  });

  it("409 on insert followed by an equal re-GET resolves unchanged", async function () {
    const db = fakeDb({ stored: null, insertError: couchError(409, "conflict"), afterConflict: DESIRED_REORDERED_WITH_REV });
    const r = await upsert().ensureDesignDoc(db, DESIRED);
    expect(r.ok).to.equal(true);
    expect(r.action).to.equal("unchanged");
  });

  it("409 on insert followed by a different doc resolves conflict with ok false", async function () {
    const other = clone(DESIRED_REORDERED_WITH_REV);
    other.language = "erlang";
    const db = fakeDb({ stored: null, insertError: couchError(409, "conflict"), afterConflict: other });
    const r = await upsert().ensureDesignDoc(db, DESIRED);
    expect(r.ok).to.equal(false);
    expect(r.action).to.equal("conflict");
  });

  it("ECONNREFUSED on GET resolves skipped, ok false, no insert, and a reason without the URL", async function () {
    const err = Object.assign(new Error("connect ECONNREFUSED http://u:p@couchdb:5984/managed_logs"), { code: "ECONNREFUSED" });
    const db = fakeDb({ getError: err });
    const r = await upsert().ensureDesignDoc(db, DESIRED);
    expect(r.ok).to.equal(false);
    expect(r.action).to.equal("skipped");
    expect(db.state.inserts).to.have.length(0);
    expect(String(r.reason)).to.not.contain("http");
    expect(String(r.reason)).to.not.contain("@");
  });

  it("a failing insert resolves failed with a status-code reason", async function () {
    const db = fakeDb({ stored: null, insertError: couchError(500, "internal_server_error", "boom at http://u:p@couchdb:5984") });
    const r = await upsert().ensureDesignDoc(db, DESIRED);
    expect(r.ok).to.equal(false);
    expect(r.action).to.equal("failed");
    expect(r.reason).to.equal("500");
  });

  it("a GET that never settles resolves ok false with reason timeout within 500 ms", async function () {
    const db = fakeDb({ getHang: true });
    const t0 = Date.now();
    const r = await upsert().ensureDesignDoc(db, DESIRED, { timeoutMs: 50 });
    expect(Date.now() - t0).to.be.below(500);
    expect(r.ok).to.equal(false);
    expect(r.reason).to.equal("timeout");
    expect(db.state.inserts).to.have.length(0);
  });

  it("never rejects, even when the client throws synchronously or the input is bad", async function () {
    const U = upsert();
    const r1 = await U.ensureDesignDoc(fakeDb({ getThrows: true }), DESIRED);
    expect(r1.ok).to.equal(false);
    const r2 = await U.ensureDesignDoc(null, DESIRED);
    expect(r2.ok).to.equal(false);
    const r3 = await U.ensureDesignDoc(fakeDb({}), null);
    expect(r3.ok).to.equal(false);
  });

  it("withTimeout rejects with reason 'timeout' and passes a settled promise through", async function () {
    const U = upsert();
    expect(await U.withTimeout(Promise.resolve(7), 50)).to.equal(7);
    let caught = null;
    try { await U.withTimeout(new Promise(() => { /* never */ }), 20); } catch (e) { caught = e; }
    expect(caught).to.be.instanceOf(Error);
    expect(caught.reason).to.equal("timeout");
  });
});

describe("LOG-01 Database.initDatabase installs _design/paging on both init branches", function () {

  const NAMES = ["devices", "builds", "users", "logs"];

  // Fake nano: records every GET/insert per database name.
  function fakeNano(create) {
    const dbs = {};
    function scope(name) {
      if (!dbs[name]) {
        dbs[name] = {
          gets: 0,
          inserts: [],
          get(_id) { this.gets++; return Promise.reject(couchError(404, "not_found")); },
          insert(doc, id) { this.inserts.push(id); return Promise.resolve({ ok: true, id: doc._id, rev: "1-a" }); }
        };
      }
      return dbs[name];
    }
    return { dbs: dbs, db: { create: create, use: scope, list: () => Promise.resolve([]) } };
  }

  function instrument(d) {
    const pending = [];
    const calls = [];
    const orig = d.ensureDesignDocs.bind(d);
    d.ensureDesignDocs = function (name, prefix) {
      calls.push(name);
      const p = orig(name, prefix);
      pending.push(p);
      return p;
    };
    return { pending: pending, calls: calls };
  }

  function newDatabase(nano) {
    const Database = require(DB_PATH);
    const d = new Database();
    d.nano = nano;
    return d;
  }

  beforeEach(function () {
    spyOn(process, "exit");
    spyOn(console, "log").and.callThrough();
  });

  afterEach(function () {
    expect(process.exit.calls.count()).to.equal(0);
  });

  it("412 already-exists: upserts _design/paging into managed_logs and managed_builds only", async function () {
    const nano = fakeNano(() => Promise.reject(couchError(412, "file_exists", "The database could not be created, the file already exists.")));
    const d = newDatabase(nano);
    const probe = instrument(d);
    await Promise.all(NAMES.map((n) => d.initDatabase(n, "")));
    await Promise.all(probe.pending);

    expect(probe.calls.filter((n) => n === "logs" || n === "builds").sort()).to.deep.equal(["builds", "logs"]);
    expect(nano.dbs.managed_logs.inserts).to.deep.equal(["_design/paging"]);
    expect(nano.dbs).to.not.have.property("managed_devices");
    expect(nano.dbs).to.not.have.property("managed_users");

    const lines = console.log.calls.allArgs().map((a) => a.join(" "));
    expect(lines.filter((l) => l.indexOf("[design-upsert] managed_logs _design/paging action=created") !== -1)).to.have.length(1);
    expect(lines.filter((l) => l.indexOf("[design-upsert] managed_builds _design/paging action=") !== -1)).to.have.length(1);
  });

  it("create success: injectDesign, injectReplFilter and ensureDesignDocs all run", async function () {
    const nano = fakeNano(() => Promise.resolve({ ok: true }));
    const d = newDatabase(nano);
    const injected = [];
    d.injectDesign = (_db, name) => { injected.push("design:" + name); };
    d.injectReplFilter = (_db, file) => { injected.push("filter:" + path.basename(file)); };
    const probe = instrument(d);
    await d.initDatabase("logs", "");
    await Promise.all(probe.pending);

    expect(injected).to.deep.equal(["design:logs", "filter:filters_logs.json"]);
    expect(probe.calls).to.deep.equal(["logs"]);
    expect(nano.dbs.managed_logs.inserts).to.deep.equal(["_design/paging"]);
  });

  it("an unrelated create error goes to handleDatabaseErrors and does not upsert", async function () {
    const nano = fakeNano(() => Promise.reject(new Error("error happened in your connection")));
    const d = newDatabase(nano);
    const handled = [];
    d.handleDatabaseErrors = (_err, name) => { handled.push(name); };
    const probe = instrument(d);
    await d.initDatabase("logs", "");
    await Promise.all(probe.pending);

    expect(handled).to.deep.equal(["managed_logs"]);
    expect(probe.calls).to.deep.equal([]);
    expect(nano.dbs).to.not.have.property("managed_logs");
  });

  it("an upsert failure logs one owner-free warning line and boot continues", async function () {
    const nano = fakeNano(() => Promise.reject(couchError(412, "file_exists", "the file already exists")));
    nano.db.use = () => ({
      get() { return Promise.reject(couchError(500, "internal_server_error", "boom http://u:p@couchdb:5984")); },
      insert() { return Promise.reject(couchError(500, "internal_server_error")); }
    });
    const d = newDatabase(nano);
    const probe = instrument(d);
    await d.initDatabase("logs", "");
    const results = await Promise.all(probe.pending);

    expect(results[0].ok).to.equal(false);
    const lines = console.log.calls.allArgs().map((a) => a.join(" ")).filter((l) => l.indexOf("[design-upsert]") !== -1);
    expect(lines).to.have.length(1);
    expect(lines[0]).to.contain("⚠️ [warning] [design-upsert] managed_logs _design/paging action=skipped reason=500");
    expect(lines[0]).to.not.contain("http");
  });
});
