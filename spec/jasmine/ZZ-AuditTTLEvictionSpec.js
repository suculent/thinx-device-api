/*
 * ZZ-AuditTTLEvictionSpec.js — OBS-02 audit-log TTL eviction probe spec.
 *
 * Fixture-based unit spec for lib/thinx/audit-ttl-probe.js per Phase 12
 * D-10 / D-11. Four `it()` blocks cover the four branches the probe
 * has to handle correctly:
 *
 *   1. no-warn        — no expired-but-live docs exist → ok:true
 *   2. single-warn    — one stale-expired doc beyond GRACE_MS → ok:false
 *   3. timeout-bound  — CouchDB does not respond → ok:null (timeout msg)
 *   4. CouchDB-error  — find() rejects → ok:null (skipped msg)
 *
 * No live infrastructure. The `nano` module is replaced via the
 * `require.cache` substitution pattern (same approach as the Phase 12
 * plan 12-02 RedactSlackSpec.js — keeps the spec discoverable by
 * Jasmine, avoids sinon/jest per TESTING.md "Anti-patterns to avoid").
 *
 * No shared bootstrap server — the probe is fully self-contained.
 *
 * ZZ- prefix per D-11 (integration-spec naming for specs touching the
 * audit-DB infrastructure surface, even though mocked here).
 */

// --- nano mock via require.cache substitution (must run BEFORE probe load) ---
const nanoPath = require.resolve("nano");

// Per-test hook: set this to a function returning a Promise (resolve or
// reject) OR a never-resolving Promise to simulate the four branches.
let mockFindBehavior = null;

require.cache[nanoPath] = {
  id: nanoPath,
  filename: nanoPath,
  loaded: true,
  exports: function nanoMock(_uri) {
    return {
      use: (_dbName) => ({
        find: (_query) => {
          if (typeof mockFindBehavior !== "function") {
            return Promise.resolve({ docs: [] });
          }
          try {
            return mockFindBehavior();
          } catch (e) {
            return Promise.reject(e);
          }
        }
      })
    };
  }
};

const chai = require("chai");
const expect = chai.expect;
const probe = require("../../lib/thinx/audit-ttl-probe");

describe("OBS-02 audit-log TTL eviction probe", function () {

  beforeAll(() => {
    console.log("🚸 [chai] >>> running OBS-02 audit-log TTL eviction spec");
  });

  afterAll(() => {
    console.log("🚸 [chai] <<< completed OBS-02 audit-log TTL eviction spec");
  });

  beforeEach(() => {
    mockFindBehavior = null;
  });

  it("returns ok:true when no expired-live docs exist", function (done) {
    mockFindBehavior = () => Promise.resolve({ docs: [] });
    probe.probeTtlEviction({ couchdbUri: "http://stub:5984", dbName: "managed_logs" })
      .then((r) => {
        expect(r.ok).to.equal(true);
        expect(r.oldestExpiredId).to.equal(null);
        expect(r.staleByDays).to.equal(null);
        expect(r.message).to.equal(null);
        done();
      })
      .catch((e) => { done.fail(e); });
  }, 30000);

  it("returns ok:false with redacted _id + staleByDays when an expired-live doc is found", function (done) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    mockFindBehavior = () => Promise.resolve({
      docs: [{ _id: "deadbeef-cafe-1234-5678-fullhash", expire_at: thirtyDaysAgo }]
    });
    probe.probeTtlEviction({ couchdbUri: "http://stub:5984", dbName: "managed_logs" })
      .then((r) => {
        expect(r.ok).to.equal(false);
        expect(r.oldestExpiredId).to.equal("deadbeef...");
        expect(r.staleByDays).to.be.at.least(1);
        expect(r.message.indexOf("audit-log TTL eviction drift")).to.equal(0);
        expect(r.message.indexOf("deadbeef...")).to.be.greaterThan(0);
        expect(r.message.indexOf("GRACE_MS=7d")).to.be.greaterThan(0);
        done();
      })
      .catch((e) => { done.fail(e); });
  }, 30000);

  it("returns ok:null with timeout message when CouchDB does not respond", function (done) {
    mockFindBehavior = () => new Promise(() => { /* never resolves */ });
    probe.probeTtlEviction({
      couchdbUri: "http://stub:5984",
      dbName: "managed_logs",
      timeoutMs: 250
    })
      .then((r) => {
        expect(r.ok).to.equal(null);
        expect(r.message).to.equal("probe skipped: CouchDB query timed out at 250ms");
        expect(r.oldestExpiredId).to.equal(null);
        expect(r.staleByDays).to.equal(null);
        done();
      })
      .catch((e) => { done.fail(e); });
  }, 5000);

  it("returns ok:null with graceful skip message on CouchDB error", function (done) {
    mockFindBehavior = () => Promise.reject(new Error("ECONNREFUSED"));
    probe.probeTtlEviction({ couchdbUri: "http://stub:5984", dbName: "managed_logs" })
      .then((r) => {
        expect(r.ok).to.equal(null);
        expect(r.message).to.equal("probe skipped: ECONNREFUSED");
        expect(r.oldestExpiredId).to.equal(null);
        expect(r.staleByDays).to.equal(null);
        done();
      })
      .catch((e) => { done.fail(e); });
  }, 30000);

});
