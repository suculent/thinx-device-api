/*
 * ZZ-LogPagingCouchSpec.js — LOG-01..LOG-04 against REAL CouchDB (phase 26-02)
 *
 * CI only: it needs the CouchDB of docker-compose.test.yml and the CouchDB
 * credentials in env (new Database().uri()). Locally, `node --check` is the
 * proof.
 *
 * Proves on CouchDB itself what the local specs prove on fakes:
 *   - LOG-01: an older `_design/paging` is updated (rev generation up), a
 *     second upsert is a no-op with the same rev, `_design/logs` keeps its rev;
 *   - audit paging: ICU collation of [owner, ISO date], the startkey_docid
 *     tie-break on identical dates at a page boundary, no duplicates, dates
 *     non-increasing, and owner A's cursor replayed as owner B returns only B;
 *   - object flags come back as ["info"] (D-15); owner-less docs are absent
 *     from audit_by_owner_date and present in audit_by_date;
 *   - builds: flat and nested docs both appear, ordered by time;
 *     builds_by_time with an endkey cutoff returns only older docs;
 *   - Buildlog.purgeOwner destroys a nested build in managed_builds (D-18);
 *   - scripts/log-paging-probe.js answers OK against managed_logs/managed_builds.
 *
 * Scratch databases <prefix>zz_paging_{logs,builds}_<random> are created and
 * destroyed here; docs seeded into managed_logs / managed_builds are deleted
 * in afterAll. Owners are random 64-hex values and are never printed.
 */

const expect = require('chai').expect;
const crypto = require('crypto');

const Globals = require("../../lib/thinx/globals.js");
const Database = require("../../lib/thinx/database.js");
const couchFactory = require("../../lib/thinx/couch.js");
const DesignUpsert = require("../../lib/thinx/design_upsert.js");
const paging = require("../../lib/thinx/log_paging.js");
const Buildlog = require("../../lib/thinx/buildlog.js");
const probe = require("../../scripts/log-paging-probe.js");

const LEGACY_LOGS_DESIGN = require("../../design/design_logs.json");

function hex(n) { return crypto.randomBytes(n).toString("hex"); }
function uuid() {
  const h = hex(16);
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-4" + h.slice(13, 16) + "-8" + h.slice(17, 20) + "-" + h.slice(20, 32);
}
function gen(rev) { return parseInt(String(rev).split("-")[0], 10); }

describe("LOG-01..04 paging views on real CouchDB (CI)", function () {

  const OWNER_A = hex(32);
  const OWNER_B = hex(32);
  const OWNER_P = hex(32); // GDPR purge target

  const prefix = Globals.prefix() || "";
  const suffix = hex(4);
  const LOGS_SCRATCH = prefix + "zz_paging_logs_" + suffix;
  const BUILDS_SCRATCH = prefix + "zz_paging_builds_" + suffix;

  let couch, logsScratch, buildsScratch, managedLogs, managedBuilds;
  const seededLogs = [];   // ids seeded into managed_logs
  const seededBuilds = []; // ids seeded into managed_builds
  const r01 = {};          // LOG-01 results, asserted in its own spec
  const ids = {};

  const T = Date.UTC(2026, 5, 1, 12, 0, 0);
  const iso = (min) => new Date(T + min * 60000).toISOString();

  beforeAll(async function () {
    await new Promise((resolve) => new Database().init(() => resolve()));
    couch = couchFactory(new Database().uri());
    managedLogs = couch.use(prefix + "managed_logs");
    managedBuilds = couch.use(prefix + "managed_builds");

    const ensuredLogs = await DesignUpsert.ensureDesignDoc(managedLogs, DesignUpsert.loadPagingDesign("logs"), { timeoutMs: 30000 });
    const ensuredBuilds = await DesignUpsert.ensureDesignDoc(managedBuilds, DesignUpsert.loadPagingDesign("builds"), { timeoutMs: 30000 });
    r01.managed = [ensuredLogs.ok, ensuredBuilds.ok];

    await couch.db.create(LOGS_SCRATCH);
    await couch.db.create(BUILDS_SCRATCH);
    logsScratch = couch.use(LOGS_SCRATCH);
    buildsScratch = couch.use(BUILDS_SCRATCH);

    // ---- LOG-01: an older _design/paging first, plus a _design/logs copy
    const desired = DesignUpsert.loadPagingDesign("logs");
    const older = { _id: "_design/paging", language: "javascript", views: { audit_by_date: desired.views.audit_by_date } };
    const olderRes = await logsScratch.insert(older, older._id);
    const logsCopy = Object.assign({}, LEGACY_LOGS_DESIGN);
    delete logsCopy._rev;
    const logsCopyRes = await logsScratch.insert(logsCopy, "_design/logs");
    r01.olderRev = olderRes.rev;
    r01.logsRevBefore = logsCopyRes.rev;
    r01.first = await DesignUpsert.ensureDesignDoc(logsScratch, desired, { timeoutMs: 30000 });
    r01.revAfterFirst = (await logsScratch.get("_design/paging"))._rev;
    r01.second = await DesignUpsert.ensureDesignDoc(logsScratch, desired, { timeoutMs: 30000 });
    r01.revAfterSecond = (await logsScratch.get("_design/paging"))._rev;
    r01.logsRevAfter = (await logsScratch.get("_design/logs"))._rev;
    await DesignUpsert.ensureDesignDoc(buildsScratch, DesignUpsert.loadPagingDesign("builds"), { timeoutMs: 30000 });

    // ---- audit fixtures (scratch). Newest first: a0 (T4), a1/a2 (T3, same
    // date: rows 1 and 2, i.e. across the limit-2 page boundary), a3 (T2,
    // object flags), a4 (T1). B is older than A's first cursor.
    ids.a = [hex(16), hex(16), hex(16), hex(16), hex(16)];
    ids.b = [hex(16), hex(16), hex(16)];
    ids.ownerless = hex(16);
    const auditDocs = [
      { _id: ids.a[0], owner: OWNER_A, date: iso(40), message: "a0", flags: ["info"] },
      { _id: ids.a[1], owner: OWNER_A, date: iso(30), message: "a1", flags: ["warning"] },
      { _id: ids.a[2], owner: OWNER_A, date: iso(30), message: "a2", flags: ["info"] },
      { _id: ids.a[3], owner: OWNER_A, date: iso(20), message: "a3", flags: [{ password: "x", reset_key: "y" }] },
      { _id: ids.a[4], owner: OWNER_A, date: iso(10), message: "a4", flags: ["info"] },
      { _id: ids.b[0], owner: OWNER_B, date: iso(3), message: "b0", flags: ["info"] },
      { _id: ids.b[1], owner: OWNER_B, date: iso(2), message: "b1", flags: ["info"] },
      { _id: ids.b[2], owner: OWNER_B, date: iso(1), message: "b2", flags: ["info"] },
      { _id: ids.ownerless, date: iso(25), message: "Password missing", flags: ["error"] }
    ];
    await logsScratch.bulk({ docs: auditDocs });

    // ---- build fixtures (scratch): flat and nested, interleaved in time
    ids.builds = { f1: uuid(), n1: uuid(), f2: uuid(), n2: uuid(), b1: uuid() };
    const flat = (id, owner, t) => ({ _id: id, owner: owner, udid: uuid(), build_id: id, start_time: t, timestamp: t, last_update: t, state: "success" });
    const nested = (id, owner, t) => ({ _id: id, log: [{ owner: owner, udid: uuid(), build_id: id, start_time: t, timestamp: t, last_update: t, message: "m" }] });
    await buildsScratch.bulk({ docs: [
      flat(ids.builds.f1, OWNER_A, T + 4000),
      nested(ids.builds.n1, OWNER_A, T + 3000),
      flat(ids.builds.f2, OWNER_A, T + 2000),
      nested(ids.builds.n2, OWNER_A, T + 1000),
      flat(ids.builds.b1, OWNER_B, T + 5000)
    ] });

    // ---- managed_logs / managed_builds fixtures for the probe and the purge
    const now = Date.now();
    const managedAudit = [];
    for (let i = 0; i < 5; i++) managedAudit.push({ _id: hex(16), owner: OWNER_A, date: new Date(now - (i + 1) * 60000).toISOString(), message: "probe-a" + i, flags: ["info"] });
    for (let i = 0; i < 3; i++) managedAudit.push({ _id: hex(16), owner: OWNER_B, date: new Date(now - (i + 10) * 60000).toISOString(), message: "probe-b" + i, flags: ["info"] });
    await managedLogs.bulk({ docs: managedAudit });
    managedAudit.forEach((d) => seededLogs.push(d._id));

    ids.purgeNested = uuid();
    ids.purgeFlat = uuid();
    const managedBuildDocs = [
      flat(uuid(), OWNER_A, now - 3000),
      nested(uuid(), OWNER_A, now - 2000),
      flat(uuid(), OWNER_B, now - 1000),
      nested(ids.purgeNested, OWNER_P, now - 400 * 86400000),
      flat(ids.purgeFlat, OWNER_P, now - 5000)
    ];
    await managedBuilds.bulk({ docs: managedBuildDocs });
    managedBuildDocs.forEach((d) => seededBuilds.push(d._id));

    // Warm both owner-keyed indexes, so the probe measures paging, not an
    // index build (and Audit.fetch never needs its legacy fallback).
    await managedLogs.view("paging", "audit_by_owner_date", { limit: 1 });
    await managedBuilds.view("paging", "builds_by_owner_time", { limit: 1 });
  }, 120000);

  afterAll(async function () {
    const drop = async (db, list) => {
      for (const id of list) {
        try {
          const doc = await db.get(id);
          await db.destroy(doc._id, doc._rev);
        } catch (_e) { /* already gone */ }
      }
    };
    try { await drop(managedLogs, seededLogs); } catch (_e) { /* best effort */ }
    try { await drop(managedBuilds, seededBuilds); } catch (_e) { /* best effort */ }
    try { await couch.db.destroy(LOGS_SCRATCH); } catch (_e) { /* best effort */ }
    try { await couch.db.destroy(BUILDS_SCRATCH); } catch (_e) { /* best effort */ }
  }, 120000);

  async function walkAudit(db, owner, limit) {
    const rows = [];
    let pages = 0;
    let cursor = null;
    let firstCursor = null;
    for (let i = 0; i < 50; i++) {
      const body = await db.view("paging", "audit_by_owner_date", paging.buildQuery(owner, limit, cursor));
      const page = paging.pageFromRows(body.rows, limit);
      pages++;
      page.rows.forEach((r) => rows.push(r));
      if (!page.paging.has_more) {
        expect(page.paging.next_cursor).to.equal(null);
        break;
      }
      const dec = paging.decodeCursor(page.paging.next_cursor, "audit");
      expect(dec.ok).to.equal(true);
      if (firstCursor === null) firstCursor = dec.cursor;
      cursor = dec.cursor;
    }
    return { rows: rows, pages: pages, firstCursor: firstCursor };
  }

  it("LOG-01: managed_logs and managed_builds carry _design/paging", function () {
    expect(r01.managed).to.deep.equal([true, true]);
  }, 60000);

  it("LOG-01: an older _design/paging is updated with a higher rev generation; a second upsert keeps the rev", function () {
    expect(r01.first.ok).to.equal(true);
    expect(r01.first.action).to.equal("updated");
    expect(gen(r01.revAfterFirst)).to.be.greaterThan(gen(r01.olderRev));
    expect(r01.second.ok).to.equal(true);
    expect(r01.second.action).to.equal("unchanged");
    expect(r01.revAfterSecond).to.equal(r01.revAfterFirst);
  }, 60000);

  it("LOG-01: the _design/logs copy keeps its rev (D-13)", function () {
    expect(r01.logsRevAfter).to.equal(r01.logsRevBefore);
  }, 60000);

  it("LOG-03: paging A with limit 2 gives 3 pages, all of A's docs, no duplicates, dates non-increasing", async function () {
    const w = await walkAudit(logsScratch, OWNER_A, 2);
    expect(w.pages).to.equal(3);
    const got = w.rows.map((r) => r.id);
    expect(got.slice().sort()).to.deep.equal(ids.a.slice().sort());
    expect(new Set(got).size).to.equal(got.length);
    w.rows.forEach((r) => expect(r.key[0]).to.equal(OWNER_A));
    for (let i = 1; i < w.rows.length; i++) {
      expect(w.rows[i - 1].key[1] >= w.rows[i].key[1]).to.equal(true);
    }
    // ISO collation: newest first
    expect(w.rows[0].id).to.equal(ids.a[0]);
    expect(w.rows[w.rows.length - 1].id).to.equal(ids.a[4]);
  }, 60000);

  it("LOG-03: replaying A's page-1 cursor as B returns only B's rows", async function () {
    const w = await walkAudit(logsScratch, OWNER_A, 2);
    expect(w.firstCursor).to.be.an("object");
    const body = await logsScratch.view("paging", "audit_by_owner_date", paging.buildQuery(OWNER_B, 100, w.firstCursor));
    const page = paging.pageFromRows(body.rows, 100);
    expect(page.rows.length).to.equal(3);
    page.rows.forEach((r) => {
      expect(r.key[0]).to.equal(OWNER_B);
      expect(ids.a).to.not.include(r.id);
    });
  }, 60000);

  it("D-15: object flags come back as [\"info\"]", async function () {
    const body = await logsScratch.view("paging", "audit_by_owner_date", { startkey: [OWNER_A, {}], endkey: [OWNER_A], descending: true });
    const row = body.rows.find((r) => r.id === ids.a[3]);
    expect(row.value.flags).to.deep.equal(["info"]);
    body.rows.forEach((r) => r.value.flags.forEach((f) => expect(f).to.be.a("string")));
  }, 60000);

  it("owner-less docs are absent from audit_by_owner_date and present in audit_by_date", async function () {
    const owned = await logsScratch.view("paging", "audit_by_owner_date", { limit: 1000 });
    expect(owned.rows.map((r) => r.id)).to.not.include(ids.ownerless);
    const dated = await logsScratch.view("paging", "audit_by_date", { key: iso(25) });
    expect(dated.rows.map((r) => r.id)).to.include(ids.ownerless);
  }, 60000);

  it("LOG-04: flat and nested builds both appear, newest first by start time", async function () {
    const body = await buildsScratch.view("paging", "builds_by_owner_time", paging.buildQuery(OWNER_A, 10, null, { include_docs: true }));
    const page = paging.pageFromRows(body.rows, 10);
    expect(page.rows.map((r) => r.id)).to.deep.equal([ids.builds.f1, ids.builds.n1, ids.builds.f2, ids.builds.n2]);
    expect(page.rows.filter((r) => typeof r.doc.owner !== "string")).to.have.length(2);
    expect(page.paging.has_more).to.equal(false);
  }, 60000);

  it("LOG-04: a builds cursor continues inside the owner range", async function () {
    const p1 = paging.pageFromRows((await buildsScratch.view("paging", "builds_by_owner_time", paging.buildQuery(OWNER_A, 2, null, { include_docs: true }))).rows, 2);
    expect(p1.paging.has_more).to.equal(true);
    const cur = paging.decodeCursor(p1.paging.next_cursor, "builds");
    expect(cur.ok).to.equal(true);
    const p2 = paging.pageFromRows((await buildsScratch.view("paging", "builds_by_owner_time", paging.buildQuery(OWNER_A, 2, cur.cursor, { include_docs: true }))).rows, 2);
    expect(p1.rows.concat(p2.rows).map((r) => r.id)).to.deep.equal([ids.builds.f1, ids.builds.n1, ids.builds.f2, ids.builds.n2]);
    expect(p2.paging.has_more).to.equal(false);
  }, 60000);

  it("retention: builds_by_time with an endkey cutoff returns only older docs", async function () {
    const cutoff = T + 2500;
    const body = await buildsScratch.view("paging", "builds_by_time", { endkey: cutoff });
    const got = body.rows.map((r) => r.id).sort();
    expect(got).to.deep.equal([ids.builds.f2, ids.builds.n2].sort());
    body.rows.forEach((r) => expect(r.key).to.be.at.most(cutoff));
  }, 60000);

  it("probe: scripts/log-paging-probe.js is OK against managed_logs and managed_builds", async function () {
    const r = await probe.run({ auditOwners: [OWNER_A, OWNER_B], buildOwners: [OWNER_A, OWNER_B] });
    const last = r.lines[r.lines.length - 1];
    expect(r.ok, last).to.equal(true);
    expect(last).to.equal("LOG-PAGING-PROBE OK");
    const joined = r.lines.join("\n");
    expect(joined).to.not.match(/[0-9a-f]{64}/);
    expect(joined).to.not.contain("@");
  }, 120000);

  it("D-18: Buildlog.purgeOwner destroys the owner's flat AND nested builds in managed_builds", async function () {
    const blog = new Buildlog();
    const res = await new Promise((resolve) => blog.purgeOwner(OWNER_P, (err, n) => resolve({ err: err, n: n })));
    expect(res.err).to.equal(null);
    expect(res.n).to.equal(2);
    const after = await managedBuilds.view("paging", "builds_by_owner_time", { startkey: [OWNER_P], endkey: [OWNER_P, {}] });
    expect(after.rows).to.have.length(0);
    let status = null;
    try { await managedBuilds.get(ids.purgeNested); } catch (e) { status = e.statusCode; }
    expect(status).to.equal(404);
  }, 60000);
});
