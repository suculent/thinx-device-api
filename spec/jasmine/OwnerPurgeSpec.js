// Pure unit tests for the GDPR purge path-safety gate (#353 / SEC-PII-03).
// safeOwnerPath() is a static, dependency-light function — no Redis/CouchDB —
// so these run anywhere. The contract: a filesystem delete target can NEVER
// escape the owner subtree under data_root.

const expect = require('chai').expect;
const path = require('path');
const OwnerPurge = require("../../lib/thinx/owner_purge");

const VALID = "a".repeat(64);          // sanitka.owner requires ^[a-z0-9]{64,}$
const DATA_ROOT = "/mnt/data";

describe("OwnerPurge.safeOwnerPath", function () {

  it("returns an absolute path inside data_root for a valid owner", function () {
    const p = OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", VALID);
    expect(p).to.be.a('string');
    expect(p).to.equal(path.join(DATA_ROOT, "/deploy", VALID));
    expect(p.startsWith(path.resolve(DATA_ROOT) + path.sep)).to.equal(true);
    expect(path.basename(p)).to.equal(VALID);
  });

  it("supports the repos base segment too", function () {
    const p = OwnerPurge.safeOwnerPath(DATA_ROOT, "/repos", VALID);
    expect(p).to.equal(path.join(DATA_ROOT, "/repos", VALID));
  });

  it("rejects path traversal in the owner id", function () {
    expect(OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", "../../etc/passwd")).to.equal(null);
    expect(OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", VALID + "/../../root")).to.equal(null);
  });

  it("rejects a slash in the owner id", function () {
    expect(OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", VALID + "/x")).to.equal(null);
  });

  it("rejects empty / undefined / null owner", function () {
    expect(OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", "")).to.equal(null);
    expect(OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", undefined)).to.equal(null);
    expect(OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", null)).to.equal(null);
  });

  it("rejects an owner that is too short or wrong charset", function () {
    expect(OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", "a".repeat(63))).to.equal(null);
    expect(OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", "A".repeat(64))).to.equal(null);
    expect(OwnerPurge.safeOwnerPath(DATA_ROOT, "/deploy", "héllo".repeat(20))).to.equal(null);
  });

});

describe("OwnerPurge.purge (orchestration, mocked stores)", function () {

  // Build a purger with fully faked collaborators — no Redis/CouchDB/fs.
  function makePurger(overrides) {
    overrides = overrides || {};
    const calls = { redisDel: [], redisExpire: [], destroyedUser: false, devicesRevoked: false, buildsPurged: false, rsaRevoked: false, audit: [] };

    const fakeRedis = {
      del: (key, cb) => { calls.redisDel.push(key); cb && cb(null, 1); },
      expire: (key, ttl, cb) => { calls.redisExpire.push(key); cb && cb(null, 1); },
      keys: (pattern, cb) => cb(null, overrides.redisKeys || [])
    };
    const fakeDevices = {
      list: (owner, cb) => cb(true, { response: overrides.devices || [] }),
      revoke: (owner, body, cb) => { calls.devicesRevoked = true; cb(true, "revoked"); }
    };
    const deps = {
      app_config: { data_root: "/mnt/data", deploy_root: "/deploy", build_root: "/repos" },
      userlib: {
        get: (owner, cb) => overrides.userAbsent ? cb({ statusCode: 404 }) : cb(null, { _id: owner, _rev: "1-x" }),
        destroy: (id, rev, cb) => { calls.destroyedUser = true; cb(null, { ok: true }); }
      },
      rsakey: { revokeAllForOwner: () => { calls.rsaRevoked = true; return overrides.revokedKeys || []; } },
      buildlog: { purgeOwner: (owner, cb) => { calls.buildsPurged = true; cb(null, overrides.buildsDestroyed || 0); } },
      alog: { log: (o, m) => calls.audit.push(m) }
    };
    // Swap fs-extra.remove so no real filesystem is touched.
    const fs = require("fs-extra");
    const originalRemove = fs.remove;
    fs.remove = (p) => { calls.removed = (calls.removed || []); calls.removed.push(p); return Promise.resolve(); };

    const purger = new OwnerPurge(fakeRedis, fakeDevices, deps);
    return { purger, calls, restore: () => { fs.remove = originalRemove; } };
  }

  const OWNER = "b".repeat(64);

  it("deletes Redis keys with del() — never expire() (#353)", function (done) {
    const { purger, calls, restore } = makePurger({ redisKeys: ["/" + "b".repeat(64) + "/k1", "/" + "b".repeat(64) + "/k2"] });
    purger.purge(OWNER, (success, _report) => {
      restore();
      expect(success).to.equal(true);
      expect(calls.redisExpire.length).to.equal(0);             // no 1s-expire
      expect(calls.redisDel).to.contain("ak:" + OWNER);          // api keys
      expect(calls.redisDel.length).to.equal(3);                 // ak + 2 pattern keys
      done();
    });
  });

  it("runs every step and destroys the user document LAST", function (done) {
    const { purger, calls, restore } = makePurger({ devices: [{ udid: "u1" }], buildsDestroyed: 2, revokedKeys: ["k1"] });
    purger.purge(OWNER, (success, report) => {
      restore();
      expect(success).to.equal(true);
      expect(calls.devicesRevoked).to.equal(true);
      expect(calls.buildsPurged).to.equal(true);
      expect(calls.rsaRevoked).to.equal(true);
      expect(calls.removed.length).to.equal(2);                  // deploy + repo trees
      expect(calls.destroyedUser).to.equal(true);
      // user_doc is the last recorded step
      const stepNames = Object.keys(report.steps);
      expect(stepNames[stepNames.length - 1]).to.equal("user_doc");
      done();
    });
  });

  it("refuses to do anything for an unsafe owner id", function (done) {
    const { purger, calls, restore } = makePurger({});
    purger.purge("../../etc", (success, report) => {
      restore();
      expect(success).to.equal(false);
      expect(report.error).to.equal("invalid_owner");
      expect(calls.removed || []).to.have.lengthOf(0);
      expect(calls.redisDel).to.have.lengthOf(0);
      expect(calls.destroyedUser).to.equal(false);
      done();
    });
  });

  it("is idempotent when the user document is already gone", function (done) {
    const { purger, restore } = makePurger({ userAbsent: true });
    purger.purge(OWNER, (success, report) => {
      restore();
      expect(success).to.equal(true);                            // absent user is not an error
      expect(report.steps.user_doc.result).to.equal("user_doc_absent");
      done();
    });
  });

});
