/*
 * AuditOwnerFetchSpec.js — LOG-02 (phase 26-01)
 *
 * Drives the REAL map functions from design/paging_logs.json (owner-keyed
 * audit view) and design/design_logs.json (legacy logs_by_owner) over fixture
 * docs through a fake CouchDB view that applies CouchDB collation, descending
 * order, the [startkey, endkey] range and the limit. Proves that the legacy
 * no-parameter audit call (Audit.fetch):
 *   - queries paging/audit_by_owner_date with exactly the owner-bounded range,
 *   - returns at most 200 of the caller's own entries, newest first,
 *   - never returns a non-string flag (D-15) — a user document with a password
 *     hash, reset key and email in `flags` comes back as ["info"],
 *   - falls back to the legacy view with strict owner equality on not_found
 *     or timeout, and answers exactly once (D-19).
 *
 * Helper-free; lib/thinx/couch is replaced in require.cache and audit.js is
 * required fresh. All owners, hashes and emails are synthetic.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require('chai').expect;
const path = require('path');

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const PAGING_LOGS_PATH = path.resolve(__dirname, "../../design/paging_logs.json");
const LEGACY_LOGS = require("../../design/design_logs.json");

const OWNER_A = "a".repeat(64);
const OWNER_B = "b".repeat(64);

function pagingMap() {
  return require(PAGING_LOGS_PATH).views.audit_by_owner_date.map;
}

function compileMap(src, emit) {
  return new Function("emit", "return (" + src + ");")(emit);
}

function runView(src, docs) {
  const rows = [];
  let current = null;
  const map = compileMap(src, (key, value) => rows.push({ id: current._id, key: key, value: value }));
  docs.forEach((doc) => { current = doc; map(JSON.parse(JSON.stringify(doc))); });
  return rows;
}

// CouchDB view collation, reduced to the types used here.
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

function query(rows, q) {
  let r = rows.slice().sort((x, y) => collate(x.key, y.key) || (x.id < y.id ? -1 : (x.id > y.id ? 1 : 0)));
  if (q.descending) r.reverse();
  if (Object.prototype.hasOwnProperty.call(q, "startkey")) {
    r = r.filter((x) => q.descending ? collate(x.key, q.startkey) <= 0 : collate(x.key, q.startkey) >= 0);
  }
  if (Object.prototype.hasOwnProperty.call(q, "endkey")) {
    r = r.filter((x) => q.descending ? collate(x.key, q.endkey) >= 0 : collate(x.key, q.endkey) <= 0);
  }
  if (typeof q.limit === "number") r = r.slice(0, q.limit);
  return { total_rows: rows.length, offset: 0, rows: r };
}

function notFound() {
  return Object.assign(new Error("missing_named_view"), { statusCode: 404, error: "not_found", reason: "missing_named_view" });
}

// mode: "ok" | "not_found" | "error" | "hang" | "late"
const fake = {
  mode: "ok",
  docs: [],
  calls: [],
  release: null,
  view(design, view, q, cb) {
    fake.calls.push({ design: design, view: view, q: JSON.parse(JSON.stringify(q)) });
    let p;
    if (design === "paging" && view === "audit_by_owner_date") {
      if (fake.mode === "not_found") p = Promise.reject(notFound());
      else if (fake.mode === "error") p = Promise.reject(Object.assign(new Error("boom"), { statusCode: 500, error: "internal_server_error" }));
      else if (fake.mode === "hang") p = new Promise(() => { /* never settles */ });
      else if (fake.mode === "late") p = new Promise((resolve) => { fake.release = () => resolve(query(runView(pagingMap(), fake.docs), q)); });
      else p = Promise.resolve(query(runView(pagingMap(), fake.docs), q));
    } else if (design === "logs" && view === "logs_by_owner") {
      p = Promise.resolve(query(runView(LEGACY_LOGS.views.logs_by_owner.map, fake.docs), q));
    } else {
      p = Promise.reject(notFound());
    }
    if (typeof cb === "function") {
      p.then((body) => cb(null, body, undefined), (err) => cb(err));
      return undefined;
    }
    return p;
  },
  insert(_doc, _id, cb) { if (typeof cb === "function") cb(null, { ok: true }); return Promise.resolve({ ok: true }); }
};

function fakeCouch(_uri) {
  return { use: () => fake, db: { use: () => fake } };
}

function iso(i) {
  return new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString();
}

let docSeq = 0;
function doc(owner, i, extra) {
  docSeq++;
  return Object.assign({
    _id: ("0000000000000000000000000000000" + docSeq.toString(16)).slice(-32),
    _rev: "1-x",
    owner: owner,
    date: iso(i),
    message: "m-" + i,
    flags: ["info"]
  }, extra || {});
}

function fetchAsync(audit, owner) {
  return new Promise((resolve) => {
    audit.fetch(owner, (err, body) => resolve({ err: err, body: body }));
  });
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

describe("LOG-02 Audit.fetch on the owner-keyed paging view", function () {

  let Audit = null;
  let audit = null;
  let savedCouch, savedAudit;

  beforeAll(function () {
    savedCouch = require.cache[COUCH_PATH];
    savedAudit = require.cache[AUDIT_PATH];
    require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
    delete require.cache[AUDIT_PATH];
    Audit = require(AUDIT_PATH);
    audit = new Audit();
  });

  afterAll(function () {
    if (savedCouch) require.cache[COUCH_PATH] = savedCouch; else delete require.cache[COUCH_PATH];
    if (savedAudit) require.cache[AUDIT_PATH] = savedAudit; else delete require.cache[AUDIT_PATH];
  });

  beforeEach(function () {
    fake.mode = "ok";
    fake.docs = [];
    fake.calls = [];
    fake.release = null;
    spyOn(process, "exit");
    spyOn(console, "log").and.callThrough();
  });

  afterEach(function () {
    Audit.VIEW_TIMEOUT_MS = 5000;
    expect(process.exit.calls.count()).to.equal(0);
  });

  it("queries paging/audit_by_owner_date with exactly the owner-bounded descending range", async function () {
    fake.docs = [doc(OWNER_A, 1)];
    await fetchAsync(audit, OWNER_A);
    expect(fake.calls).to.have.length(1);
    expect(fake.calls[0]).to.deep.equal({
      design: "paging",
      view: "audit_by_owner_date",
      q: { startkey: [OWNER_A, {}], endkey: [OWNER_A], descending: true, limit: 200 }
    });
  });

  it("205 docs for the caller give 200 {date, message, flags} items, newest first, none of another owner", async function () {
    for (let i = 0; i < 205; i++) fake.docs.push(doc(OWNER_A, i, { message: "A-" + i }));
    for (let i = 0; i < 5; i++) fake.docs.push(doc(OWNER_B, 1000 + i, { message: "B-" + i }));
    const r = await fetchAsync(audit, OWNER_A);
    expect(r.err).to.equal(false);
    expect(r.body).to.have.length(200);
    expect(r.body[0]).to.deep.equal({ date: iso(204), message: "A-204", flags: ["info"] });
    expect(r.body[199].message).to.equal("A-5");
    for (let i = 1; i < r.body.length; i++) {
      expect(r.body[i - 1].date > r.body[i].date).to.equal(true);
    }
    r.body.forEach((item) => {
      expect(Object.keys(item).sort()).to.deep.equal(["date", "flags", "message"]);
      expect(item.message.indexOf("B-")).to.equal(-1);
    });
  });

  it("an owner whose id is a prefix of another owner's id sees only its own rows", async function () {
    fake.docs = [doc("abcde", 1, { message: "mine" }), doc("abcdef", 2, { message: "longer" }), doc("zzabcdezz", 3, { message: "inner" })];
    const r = await fetchAsync(audit, "abcde");
    expect(r.body.map((i) => i.message)).to.deep.equal(["mine"]);
  });

  it("a user document with a password hash, reset key and email in flags comes back as ['info']", async function () {
    fake.docs = [doc(OWNER_A, 1, {
      message: "Profile updated successfully.",
      flags: [{ password: "synthetic-hash-0000", reset_key: "synthetic-reset-0000", email: "user@example.invalid", repos: {} }]
    })];
    const r = await fetchAsync(audit, OWNER_A);
    expect(r.body).to.have.length(1);
    expect(r.body[0].flags).to.deep.equal(["info"]);
    const json = JSON.stringify(r.body);
    expect(json).to.not.contain("synthetic-hash");
    expect(json).to.not.contain("synthetic-reset");
    expect(json).to.not.contain("example.invalid");
  });

  it("drops a flag longer than 32 characters and keeps the valid ones", async function () {
    fake.docs = [doc(OWNER_A, 1, { flags: ["warning", "x".repeat(40)] })];
    const r = await fetchAsync(audit, OWNER_A);
    expect(r.body[0].flags).to.deep.equal(["warning"]);
  });

  it("a non-string or empty owner returns [] without any view call", async function () {
    for (const bad of [undefined, null, "", 42, {}, ["x"]]) {
      const r = await fetchAsync(audit, bad);
      expect(r.err).to.equal(false);
      expect(r.body).to.deep.equal([]);
    }
    expect(fake.calls).to.have.length(0);
  });

  it("toAuditItem keeps only non-empty strings of at most 32 characters and falls back to ['info']", function () {
    expect(Audit.toAuditItem({ date: "d", message: "m", flags: ["admin", { repos: {} }, "", "impersonation"] }))
      .to.deep.equal({ date: "d", message: "m", flags: ["admin", "impersonation"] });
    expect(Audit.toAuditItem({ date: "d", message: "m", flags: "error" }).flags).to.deep.equal(["error"]);
    expect(Audit.toAuditItem({ date: "d", message: "m" }).flags).to.deep.equal(["info"]);
    expect(Audit.toAuditItem({ date: "d", message: "m", flags: [{ password: "h" }] }).flags).to.deep.equal(["info"]);
    expect(Audit.toAuditItem(null)).to.deep.equal({ date: undefined, message: undefined, flags: ["info"] });
  });

  describe("fallback to the legacy view (D-19)", function () {

    function fallbackFixture() {
      fake.docs = [
        doc("abcde", 1, { message: "mine-1" }),
        doc("abcde", 2, { message: "mine-2", flags: [{ password: "synthetic-hash-0000" }] }),
        doc("zzabcdezz", 3, { message: "theirs" }),
        doc("abcdef", 4, { message: "longer" })
      ];
    }

    function warningLines() {
      return console.log.calls.allArgs().map((a) => a.join(" ")).filter((l) => l.indexOf("owner-keyed audit view unavailable") !== -1);
    }

    it("not_found serves logs/logs_by_owner once, with strict owner equality, one owner-free warning and a counted fallback", async function () {
      fake.mode = "not_found";
      fallbackFixture();
      const before = Audit.fallbackCount;
      const r = await fetchAsync(audit, "abcde");
      expect(r.err).to.equal(false);
      expect(r.body.map((i) => i.message)).to.deep.equal(["mine-2", "mine-1"]);
      r.body.forEach((i) => expect(i.flags).to.deep.equal(["info"]));
      expect(Audit.fallbackCount).to.equal(before + 1);
      expect(fake.calls.map((c) => c.design + "/" + c.view)).to.deep.equal(["paging/audit_by_owner_date", "logs/logs_by_owner"]);
      expect(fake.calls[1].q).to.deep.equal({ descending: true, limit: 200 });
      const lines = warningLines();
      expect(lines).to.have.length(1);
      expect(lines[0]).to.contain("(reason=not_found)");
      expect(lines[0]).to.not.contain("abcde");
    });

    it("a view error falls back with reason=error", async function () {
      fake.mode = "error";
      fallbackFixture();
      const r = await fetchAsync(audit, "abcde");
      expect(r.body.map((i) => i.message)).to.deep.equal(["mine-2", "mine-1"]);
      expect(warningLines()[0]).to.contain("(reason=error)");
    });

    it("a view that never answers falls back after VIEW_TIMEOUT_MS", async function () {
      fake.mode = "hang";
      Audit.VIEW_TIMEOUT_MS = 50;
      fallbackFixture();
      const before = Audit.fallbackCount;
      const t0 = Date.now();
      const r = await fetchAsync(audit, "abcde");
      expect(Date.now() - t0).to.be.below(1000);
      expect(r.body.map((i) => i.message)).to.deep.equal(["mine-2", "mine-1"]);
      expect(Audit.fallbackCount).to.equal(before + 1);
      expect(warningLines()[0]).to.contain("(reason=timeout)");
    });

    it("a late view answer after the timeout is dropped: the callback fires exactly once", async function () {
      fake.mode = "late";
      Audit.VIEW_TIMEOUT_MS = 50;
      fallbackFixture();
      let count = 0;
      const answers = [];
      audit.fetch("abcde", (err, body) => { count++; answers.push(body); });
      await wait(150);
      expect(count).to.equal(1);
      expect(typeof fake.release).to.equal("function");
      fake.release();
      await wait(50);
      expect(count).to.equal(1);
      expect(answers[0].map((i) => i.message)).to.deep.equal(["mine-2", "mine-1"]);
    });
  });
});
