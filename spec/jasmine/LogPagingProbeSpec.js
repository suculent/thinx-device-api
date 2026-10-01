/*
 * LogPagingProbeSpec.js — scripts/log-paging-probe.js (phase 26-02)
 *
 * Runs the read-only production probe against an in-memory CouchDB fake that
 * evaluates the REAL map functions of design/paging_logs.json and
 * design/paging_builds.json, with CouchDB collation, descending order, the
 * startkey/startkey_docid/endkey range, limit and include_docs. The real
 * Audit and Buildlog libraries are bound to the fake through a require.cache
 * stub of lib/thinx/couch (restored in afterAll).
 *
 * Proves the output contract (exact key order, aggregates only: no 64-hex,
 * no "@", no cursor), the OK verdict on consistent data, owner discovery
 * without overrides, and a FAIL naming audit_foreign when a view leaks a
 * foreign row. All owners are synthetic and never printed.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require('chai').expect;

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const BUILDLOG_PATH = require.resolve("../../lib/thinx/buildlog");
const PROBE_PATH = require.resolve("../../scripts/log-paging-probe");
const paging = require("../../lib/thinx/log_paging");

const PAGING_LOGS = require("../../design/paging_logs.json");
const PAGING_BUILDS = require("../../design/paging_builds.json");
const DESIGN_LOGS = require("../../design/design_logs.json");
const DESIGN_BUILDS = require("../../design/design_builds.json");

const OWNER_A = "a".repeat(64);
const OWNER_B = "b".repeat(64);
const OWNER_C = "c".repeat(64);
const OWNER_D = "d".repeat(64);

const CONTRACT = [
  "ddoc_paging_logs", "ddoc_paging_builds", "ddoc_logs_rev_gen", "ddoc_logs_map_sha12",
  "index_logs_updater_running", "index_builds_updater_running",
  "audit_owners", "legacy_len", "legacy_expected", "legacy_match", "legacy_object_flags", "legacy_fallback_used",
  "audit_pages", "audit_total", "audit_expected", "audit_dupes", "audit_order_ok", "audit_foreign",
  "audit_cursor_owner_free", "audit_first_page_ms",
  "replay_rows", "replay_foreign",
  "build_owners", "build_pages", "build_total", "build_expected", "build_dupes", "build_order_ok",
  "build_foreign", "build_nested", "build_first_page_ms",
  "builds_del_before", "builds_del_after"
];

// ---- CouchDB collation, reduced to the types used here
function rank(v) {
  if (v === null) return 0;
  if (v === false) return 1;
  if (v === true) return 2;
  if (typeof v === "number") return 3;
  if (typeof v === "string") return 4;
  if (Array.isArray(v)) return 5;
  return 6;
}
function collate(a, b) {
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 3) return a - b;
  if (ra === 4) return a < b ? -1 : (a > b ? 1 : 0);
  if (ra === 5) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = collate(a[i], b[i]);
      if (c !== 0) return c;
    }
    return a.length - b.length;
  }
  return 0;
}
function cmpRow(x, key, id) {
  const c = collate(x.key, key);
  if (c !== 0 || typeof id !== "string") return c;
  return x.id < id ? -1 : (x.id > id ? 1 : 0);
}

function compileMap(src, emit) {
  return new Function("emit", "return (" + src + ");")(emit);
}

function makeDb(docs, design, opts) {
  const o = opts || {};
  const db = {
    viewCalls: [],
    get(id) {
      if (id === "_design/paging") return Promise.resolve(Object.assign({ _rev: "1-p" }, JSON.parse(JSON.stringify(design))));
      if (id === "_design/paging/_info") return Promise.resolve({ name: "paging", view_index: { updater_running: false } });
      if (id === "_design/logs" && o.logsDesign) return Promise.resolve(Object.assign({ _rev: "1-l" }, JSON.parse(JSON.stringify(o.logsDesign))));
      return Promise.reject(Object.assign(new Error("missing"), { statusCode: 404, error: "not_found" }));
    },
    info() {
      return Promise.resolve({ doc_count: docs.length, doc_del_count: 7 });
    },
    destroy() { throw new Error("the probe must never write"); },
    insert() { throw new Error("the probe must never write"); },
    bulk() { throw new Error("the probe must never write"); },
    view(ddoc, view, q, cb) {
      db.viewCalls.push(JSON.parse(JSON.stringify(q)));
      let p;
      const dd = (ddoc === "paging") ? design : ((o.others && o.others[ddoc]) || null);
      if (!dd || !dd.views || !dd.views[view]) {
        p = Promise.reject(Object.assign(new Error("missing"), { statusCode: 404, error: "not_found" }));
      } else {
        expect(q).to.not.have.property("skip");
        const rows = [];
        let cur = null;
        const map = compileMap(dd.views[view].map, (key, value) => rows.push({ id: cur._id, key: key, value: value }));
        docs.forEach((d) => { cur = d; map(JSON.parse(JSON.stringify(d))); });
        let r = rows.sort((x, y) => cmpRow(x, y.key, y.id));
        if (q.descending) r.reverse();
        if (Object.prototype.hasOwnProperty.call(q, "startkey")) {
          r = r.filter((x) => {
            const c = cmpRow(x, q.startkey, q.startkey_docid);
            return q.descending ? c <= 0 : c >= 0;
          });
        }
        if (Object.prototype.hasOwnProperty.call(q, "endkey")) {
          r = r.filter((x) => q.descending ? collate(x.key, q.endkey) >= 0 : collate(x.key, q.endkey) <= 0);
        }
        if (typeof q.limit === "number") r = r.slice(0, q.limit);
        if (q.include_docs) {
          r = r.map((x) => Object.assign({}, x, { doc: JSON.parse(JSON.stringify(docs.find((d) => d._id === x.id))) }));
        }
        if (typeof o.tamper === "function") r = o.tamper(q, r);
        p = Promise.resolve({ total_rows: rows.length, offset: 0, rows: r });
      }
      if (typeof cb === "function") { p.then((b) => cb(null, b), (e) => cb(e)); return undefined; }
      return p;
    }
  };
  return db;
}

// ---- fixtures
function iso(i) { return new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(); }
function hex32(n) { return ("00000000000000000000000000000000" + n.toString(16)).slice(-32); }
function uuid(n) { const h = hex32(n); return h.slice(0, 8) + "-" + h.slice(8, 12) + "-4" + h.slice(13, 16) + "-8" + h.slice(17, 20) + "-" + h.slice(20, 32); }

function auditDocs() {
  const docs = [];
  let n = 1;
  for (let i = 0; i < 230; i++) {
    docs.push({ _id: hex32(n++), _rev: "1-x", owner: OWNER_A, date: iso(10 + i), message: "a" + i, flags: ["info"] });
  }
  // Newest first, docs[i] sits at position 229 - i, so docs[130] / docs[129]
  // are rows 99 / 100: the last row of page 1 and the cursor row. Giving them
  // the same date makes the page boundary depend on the startkey_docid
  // tie-break.
  docs[130].date = docs[129].date;
  // An object flag (D-15) must never come back as anything but a string.
  docs[41].flags = [{ password: "x", email: "nobody@example.invalid" }];
  for (let i = 0; i < 3; i++) {
    docs.push({ _id: hex32(n++), _rev: "1-x", owner: OWNER_B, date: iso(i), message: "b" + i, flags: ["warning"] });
  }
  docs.push({ _id: hex32(n++), _rev: "1-x", date: iso(5), message: "Password missing", flags: ["error"] }); // owner-less
  return docs;
}

function buildDocs() {
  const t0 = Date.UTC(2026, 0, 1);
  const flat = (owner, n, t) => ({ _id: uuid(n), _rev: "1-b", owner: owner, udid: uuid(1000 + n), build_id: uuid(n), start_time: t, timestamp: t, last_update: t, state: "success" });
  const nested = (owner, n, t) => ({ _id: uuid(n), _rev: "1-b", log: [{ owner: owner, udid: uuid(1000 + n), build_id: uuid(n), start_time: t, timestamp: t, last_update: t, message: "m" }] });
  return [
    flat(OWNER_C, 1, t0 + 5000), flat(OWNER_C, 2, t0 + 4000),
    nested(OWNER_C, 3, t0 + 3000), nested(OWNER_C, 4, t0 + 2000), nested(OWNER_C, 5, t0 + 1000),
    flat(OWNER_D, 6, t0 + 6000)
  ];
}

describe("log-paging-probe (local, fakes)", function () {

  const state = { logsDb: null, buildsDb: null };
  let saved = {};
  let probe, Audit, Buildlog;

  // audit.js / buildlog.js capture their db handle at module load, so hand
  // them a handle that delegates to whichever fake the current spec installed.
  function handle(name) {
    const pick = () => (String(name).indexOf("managed_logs") !== -1 ? state.logsDb : state.buildsDb);
    return {
      view: (...a) => pick().view(...a),
      get: (...a) => pick().get(...a),
      info: (...a) => pick().info(...a),
      destroy: (...a) => pick().destroy(...a),
      insert: (...a) => pick().insert(...a)
    };
  }

  function fakeCouch() {
    return { use: handle, db: { use: handle } };
  }

  function deps() {
    return { logsDb: state.logsDb, buildsDb: state.buildsDb, audit: new Audit(), AuditClass: Audit, buildlog: new Buildlog() };
  }

  beforeAll(function () {
    [COUCH_PATH, AUDIT_PATH, BUILDLOG_PATH, PROBE_PATH].forEach((p) => { saved[p] = require.cache[p]; });
    require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
    delete require.cache[AUDIT_PATH];
    delete require.cache[BUILDLOG_PATH];
    delete require.cache[PROBE_PATH];
    Audit = require(AUDIT_PATH);
    Buildlog = require(BUILDLOG_PATH);
    probe = require(PROBE_PATH);
  });

  afterAll(function () {
    Object.keys(saved).forEach((p) => { if (saved[p]) require.cache[p] = saved[p]; else delete require.cache[p]; });
  });

  beforeEach(function () {
    state.logsDb = makeDb(auditDocs(), PAGING_LOGS, { logsDesign: DESIGN_LOGS });
    state.buildsDb = makeDb(buildDocs(), PAGING_BUILDS, { others: { builds: DESIGN_BUILDS } });
  });

  function values(lines) {
    const out = {};
    lines.slice(0, -1).forEach((l) => { const i = l.indexOf("="); out[l.slice(0, i)] = l.slice(i + 1); });
    return out;
  }

  it("is OK on consistent data with the expected aggregates", async function () {
    const r = await probe.run({ deps: deps(), auditOwners: [OWNER_A, OWNER_B], buildOwners: [OWNER_C, OWNER_D] });
    const v = values(r.lines);
    expect(r.lines[r.lines.length - 1]).to.equal("LOG-PAGING-PROBE OK");
    expect(r.ok).to.equal(true);
    expect(v.ddoc_paging_logs).to.equal("ok");
    expect(v.ddoc_paging_builds).to.equal("ok");
    expect(v.ddoc_logs_rev_gen).to.equal("1");
    expect(v.ddoc_logs_map_sha12).to.match(/^[0-9a-f]{12}$/);
    expect(v.legacy_len).to.equal("200");
    expect(v.legacy_expected).to.equal("200");
    expect(v.legacy_match).to.equal("1");
    expect(v.legacy_object_flags).to.equal("0");
    expect(v.legacy_fallback_used).to.equal("0");
    expect(v.audit_total).to.equal("230");
    expect(v.audit_expected).to.equal("230");
    expect(v.audit_pages).to.equal("3");
    expect(v.audit_dupes).to.equal("0");
    expect(v.audit_order_ok).to.equal("1");
    expect(v.audit_foreign).to.equal("0");
    expect(v.audit_cursor_owner_free).to.equal("1");
    expect(v.replay_rows).to.equal("3");
    expect(v.replay_foreign).to.equal("0");
    expect(v.build_pages).to.equal("1");
    expect(v.build_total).to.equal("5");
    expect(v.build_expected).to.equal("5");
    expect(v.build_nested).to.equal("3");
    expect(v.build_foreign).to.equal("0");
    expect(v.builds_del_before).to.equal(v.builds_del_after);
    expect(Number(v.audit_first_page_ms)).to.be.at.least(0);
  });

  it("emits exactly the contract keys in order, then the verdict line", async function () {
    const r = await probe.run({ deps: deps(), auditOwners: [OWNER_A, OWNER_B], buildOwners: [OWNER_C, OWNER_D] });
    expect(r.lines.slice(0, -1).map((l) => l.split("=")[0])).to.deep.equal(CONTRACT);
    expect(r.lines).to.have.length(CONTRACT.length + 1);
  });

  it("prints aggregates only: no 64-hex, no '@', no cursor", async function () {
    const r = await probe.run({ deps: deps(), auditOwners: [OWNER_A, OWNER_B], buildOwners: [OWNER_C, OWNER_D] });
    r.lines.forEach((l, i) => {
      if (i === r.lines.length - 1) expect(l).to.match(/^LOG-PAGING-PROBE (OK|FAIL [a-z0-9_,]+)$/);
      else expect(l).to.match(/^[a-z0-9_]+=[^ ]*$/);
    });
    const joined = r.lines.join("\n");
    expect(joined).to.not.match(/[0-9a-f]{64}/);
    expect(joined).to.not.contain("@");
    // A's first next_cursor (row 100 of the newest-first walk) never appears
    const rows = (await state.logsDb.view("paging", "audit_by_owner_date", paging.buildQuery(OWNER_A, 100, null))).rows;
    const firstCursor = paging.pageFromRows(rows, 100).paging.next_cursor;
    expect(firstCursor).to.be.a("string");
    expect(joined).to.not.contain(firstCursor);
    r.lines.slice(0, -1).forEach((l) => expect(l.split("=")[1].length).to.be.at.most(12));
  });

  it("discovers the two busiest owners itself (no overrides), never using skip", async function () {
    const r = await probe.run({ deps: deps() });
    const v = values(r.lines);
    expect(r.ok, r.lines[r.lines.length - 1]).to.equal(true);
    expect(v.audit_owners).to.equal("2");
    expect(v.build_owners).to.equal("2");
    expect(v.audit_total).to.equal("230");
    expect(v.build_total).to.equal("5");
    state.logsDb.viewCalls.concat(state.buildsDb.viewCalls).forEach((q) => expect(q).to.not.have.property("skip"));
  });

  it("FAILs naming audit_foreign when the view leaks a foreign row into the owner's page", async function () {
    state.logsDb = makeDb(auditDocs(), PAGING_LOGS, {
      logsDesign: DESIGN_LOGS,
      tamper: (q, rows) => {
        if (Array.isArray(q.startkey) && q.startkey[0] === OWNER_A && q.limit === 101 && rows.length > 2) {
          const leaked = rows.slice();
          leaked.splice(1, 0, { id: "f".repeat(32), key: [OWNER_B, rows[1].key[1]], value: { date: rows[1].key[1], message: "leak", flags: ["info"] } });
          return leaked.slice(0, q.limit);
        }
        return rows;
      }
    });
    const r = await probe.run({ deps: deps(), auditOwners: [OWNER_A, OWNER_B], buildOwners: [OWNER_C, OWNER_D] });
    const last = r.lines[r.lines.length - 1];
    expect(r.ok).to.equal(false);
    expect(last).to.match(/^LOG-PAGING-PROBE FAIL /);
    expect(last.slice("LOG-PAGING-PROBE FAIL ".length).split(",")).to.include("audit_foreign");
    expect(values(r.lines).audit_foreign).to.not.equal("0");
    expect(r.lines.join("\n")).to.not.match(/[0-9a-f]{64}/);
  });

  it("FAILs ddoc_paging_logs when _design/paging is missing, with an aggregate-only output", async function () {
    const db = state.logsDb;
    const get = db.get;
    db.get = (id) => (id === "_design/paging" ? Promise.reject(Object.assign(new Error("x"), { statusCode: 404, error: "not_found" })) : get(id));
    const r = await probe.run({ deps: deps(), auditOwners: [OWNER_A, OWNER_B], buildOwners: [OWNER_C, OWNER_D] });
    expect(values(r.lines).ddoc_paging_logs).to.equal("missing");
    expect(r.lines[r.lines.length - 1]).to.contain("ddoc_paging_logs");
  });

  it("an erroring view yields an error line with status and word only", async function () {
    state.buildsDb.info = () => Promise.reject(Object.assign(new Error("http://u:p@couchdb:5984 down"), { statusCode: 503, error: "service_unavailable" }));
    const r = await probe.run({ deps: deps(), auditOwners: [OWNER_A, OWNER_B], buildOwners: [OWNER_C, OWNER_D] });
    const joined = r.lines.join("\n");
    expect(joined).to.contain("error_builds_del_before=503_service_unavailable");
    expect(joined).to.not.contain("couchdb:5984");
    expect(r.ok).to.equal(false);
  });
});
