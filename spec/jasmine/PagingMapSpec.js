/*
 * PagingMapSpec.js — LOG-01 / LOG-02 / LOG-04 groundwork (phase 26-01)
 *
 * Evaluates every map function of the two `_design/paging` docs with a
 * capturing fake `emit`, so the exact strings CouchDB will run are proven
 * locally:
 *   design/paging_logs.json    audit_by_owner_date, audit_by_date
 *   design/paging_builds.json  builds_by_owner_time, builds_by_time
 *
 * Covers the production shapes from 26-RESEARCH.md: owner-less login-failure
 * audit docs, object flags carrying user documents (D-15), and nested build
 * docs whose identity lives in log[0]. Also checks the maps stay ES5.
 * Synthetic values only.
 */

const expect = require('chai').expect;
const path = require('path');

const LOGS_PATH = path.resolve(__dirname, "../../design/paging_logs.json");
const BUILDS_PATH = path.resolve(__dirname, "../../design/paging_builds.json");

const OWNER = "c".repeat(64);
const UDID = "11111111-2222-4333-8444-555555555555";
const BUILD_ID = "66666666-7777-4888-9999-000000000000";
const T0 = 1758000000000; // epoch ms

// Loaded lazily so a missing design file fails the spec, not the file.
function design(file) { return require(file); }

function emitted(file, view, doc) {
  const rows = [];
  const src = design(file).views[view].map;
  const map = new Function("emit", "return (" + src + ");")((key, value) => rows.push({ key: key, value: value }));
  map(JSON.parse(JSON.stringify(doc)));
  return rows;
}

describe("_design/paging map functions", function () {

  describe("audit_by_owner_date", function () {
    const V = "audit_by_owner_date";
    const DATE = "2026-09-30T10:11:12.345Z";

    it("emits [owner, date] with {date, message, flags} for an owned, dated doc", function () {
      const rows = emitted(LOGS_PATH, V, { _id: "a1", _rev: "1-a", owner: OWNER, date: DATE, message: "hello", flags: ["warning"] });
      expect(rows).to.deep.equal([{ key: [OWNER, DATE], value: { date: DATE, message: "hello", flags: ["warning"] } }]);
    });

    it("converts a numeric date to its ISO string", function () {
      const ms = Date.parse(DATE);
      const rows = emitted(LOGS_PATH, V, { owner: OWNER, date: ms, message: "m", flags: ["info"] });
      expect(rows).to.have.length(1);
      expect(rows[0].key).to.deep.equal([OWNER, DATE]);
      expect(rows[0].value.date).to.equal(DATE);
    });

    it("emits nothing for a missing owner, an empty owner or a missing date", function () {
      expect(emitted(LOGS_PATH, V, { date: DATE, message: "Password mismatch.", flags: ["warning"] })).to.deep.equal([]);
      expect(emitted(LOGS_PATH, V, { owner: "", date: DATE, message: "m" })).to.deep.equal([]);
      expect(emitted(LOGS_PATH, V, { owner: { id: OWNER }, date: DATE, message: "m" })).to.deep.equal([]);
      expect(emitted(LOGS_PATH, V, { owner: OWNER, message: "m" })).to.deep.equal([]);
    });

    it("turns a user document with a password hash, reset key and email in flags into ['info']", function () {
      const rows = emitted(LOGS_PATH, V, {
        owner: OWNER, date: DATE, message: "Profile updated successfully.",
        flags: [{ password: "x", reset_key: "y", email: "e" }]
      });
      expect(rows[0].value.flags).to.deep.equal(["info"]);
      expect(JSON.stringify(rows)).to.not.contain("reset_key");
    });

    it("keeps only the string flags of a mixed array", function () {
      const rows = emitted(LOGS_PATH, V, { owner: OWNER, date: DATE, message: "m", flags: ["admin", { repos: {} }, "impersonation"] });
      expect(rows[0].value.flags).to.deep.equal(["admin", "impersonation"]);
    });

    it("wraps a scalar string flag", function () {
      const rows = emitted(LOGS_PATH, V, { owner: OWNER, date: DATE, message: "m", flags: "error" });
      expect(rows[0].value.flags).to.deep.equal(["error"]);
    });

    it("drops strings longer than 32 characters and falls back to ['info'] when flags are missing", function () {
      expect(emitted(LOGS_PATH, V, { owner: OWNER, date: DATE, message: "m", flags: ["y".repeat(33)] })[0].value.flags).to.deep.equal(["info"]);
      expect(emitted(LOGS_PATH, V, { owner: OWNER, date: DATE, message: "m" })[0].value.flags).to.deep.equal(["info"]);
    });
  });

  describe("audit_by_date", function () {
    const V = "audit_by_date";
    const DATE = "2026-09-30T10:11:12.345Z";

    it("emits (date, _rev) for a dated doc", function () {
      expect(emitted(LOGS_PATH, V, { _id: "a1", _rev: "3-abc", owner: OWNER, date: DATE })).to.deep.equal([{ key: DATE, value: "3-abc" }]);
    });

    it("still emits an owner-less doc, so retention can age it out", function () {
      expect(emitted(LOGS_PATH, V, { _id: "a2", _rev: "1-def", date: DATE, message: "Password missing" })).to.deep.equal([{ key: DATE, value: "1-def" }]);
    });

    it("converts a numeric date and emits nothing without a date", function () {
      expect(emitted(LOGS_PATH, V, { _rev: "1-n", date: Date.parse(DATE) })).to.deep.equal([{ key: DATE, value: "1-n" }]);
      expect(emitted(LOGS_PATH, V, { _rev: "1-z", owner: OWNER })).to.deep.equal([]);
    });
  });

  describe("builds_by_owner_time", function () {
    const V = "builds_by_owner_time";

    it("emits [owner, start_time] for a flat doc", function () {
      const rows = emitted(BUILDS_PATH, V, { _id: BUILD_ID, owner: OWNER, udid: UDID, build_id: BUILD_ID, start_time: T0, timestamp: T0 + 5 });
      expect(rows).to.deep.equal([{ key: [OWNER, T0], value: null }]);
    });

    it("reads identity and time from log[0] for a nested doc", function () {
      const nested = { _id: BUILD_ID, _rev: "1-n", log: [{ owner: OWNER, udid: UDID, build_id: BUILD_ID, start_time: T0 + 7, timestamp: T0 + 8 }, { message: "later" }] };
      expect(emitted(BUILDS_PATH, V, nested)).to.deep.equal([{ key: [OWNER, T0 + 7], value: null }]);
    });

    it("uses timestamp when start_time is missing", function () {
      expect(emitted(BUILDS_PATH, V, { owner: OWNER, timestamp: T0 + 9 })).to.deep.equal([{ key: [OWNER, T0 + 9], value: null }]);
    });

    it("emits nothing when no owner exists anywhere", function () {
      expect(emitted(BUILDS_PATH, V, { _id: "x", start_time: T0, log: [{ udid: UDID, start_time: T0 }] })).to.deep.equal([]);
      expect(emitted(BUILDS_PATH, V, { _id: "_design/builds", views: {} })).to.deep.equal([]);
    });
  });

  describe("builds_by_time", function () {
    const V = "builds_by_time";

    it("emits (start_time, {owner, udid, build_id, rev}) for a flat doc", function () {
      const rows = emitted(BUILDS_PATH, V, { _id: "doc-id", _rev: "2-f", owner: OWNER, udid: UDID, build_id: BUILD_ID, start_time: T0 });
      expect(rows).to.deep.equal([{ key: T0, value: { owner: OWNER, udid: UDID, build_id: BUILD_ID, rev: "2-f" } }]);
    });

    it("emits log[0] identity for a nested doc and falls back to _id for build_id", function () {
      const nested = { _id: BUILD_ID, _rev: "1-n", log: [{ owner: OWNER, udid: UDID, start_time: T0 + 1 }] };
      expect(emitted(BUILDS_PATH, V, nested)).to.deep.equal([{ key: T0 + 1, value: { owner: OWNER, udid: UDID, build_id: BUILD_ID, rev: "1-n" } }]);
    });

    it("emits nothing without a numeric time", function () {
      expect(emitted(BUILDS_PATH, V, { _id: "x", _rev: "1-x", owner: OWNER, start_time: "2026-09-30" })).to.deep.equal([]);
      expect(emitted(BUILDS_PATH, V, { _id: "x", _rev: "1-x", owner: OWNER })).to.deep.equal([]);
    });
  });

  describe("design files", function () {

    it("hold exactly the contracted ids and view names", function () {
      const logs = design(LOGS_PATH);
      const builds = design(BUILDS_PATH);
      expect(logs._id).to.equal("_design/paging");
      expect(builds._id).to.equal("_design/paging");
      expect(logs.language).to.equal("javascript");
      expect(builds.language).to.equal("javascript");
      expect(Object.keys(logs.views).sort()).to.deep.equal(["audit_by_date", "audit_by_owner_date"]);
      expect(Object.keys(builds.views).sort()).to.deep.equal(["builds_by_owner_time", "builds_by_time"]);
      expect(Object.keys(logs).sort()).to.deep.equal(["_id", "language", "views"]);
      expect(Object.keys(builds).sort()).to.deep.equal(["_id", "language", "views"]);
    });

    it("contain ES5 map strings only (no arrow functions, template literals, let or const)", function () {
      [design(LOGS_PATH), design(BUILDS_PATH)].forEach((d) => {
        Object.keys(d.views).forEach((name) => {
          const src = d.views[name].map;
          expect(src, name).to.be.a("string");
          expect(src, name).to.not.contain("=>");
          expect(src, name).to.not.contain("`");
          expect(src, name).to.not.match(/\blet /);
          expect(src, name).to.not.match(/\bconst /);
        });
      });
    });
  });
});
