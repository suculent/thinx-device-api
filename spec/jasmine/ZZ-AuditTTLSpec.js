/* SEC-PII-02 regression spec — Audit log TTL (expire_at field).
 *
 * Asserts that Audit.log writes carry a forward-going TTL field:
 *   - record.expire_at is a Date instance
 *   - default retention horizon = 90 days from record.date
 *   - app_config.audit_retention_days (when set) overrides the default
 *   - Audit.log(owner, message, flag, callback) signature is unchanged
 *     (arity = 4) so SEC-PII-01 callers in lib/thinx/owner.js continue
 *     to work without modification.
 *
 * Style: project Jasmine + chai (no chai-http, no sinon — per
 * CONVENTIONS.md "Do not introduce sinon, jest, or other mocking
 * frameworks"). Globals.app_config monkey-patch is plain prototype
 * assignment + require.cache eviction (same pattern used by
 * ZZ-OwnerLogRedactionSpec.js for AuditLog.prototype.log).
 *
 * Test-env ACCEPT pattern (Phase 5/6/7/8/9 precedent): this spec exercises
 * the PURE _buildRecord helper (no loglib.insert, no live CouchDB hit) so
 * the assertions run cleanly under the project's local Jasmine harness AND
 * under the canonical CI green-gate. The signature-stability assertion is
 * pure introspection (function arity) and has no env dependency.
 *
 * Banner convention per AuditSpec.js / ZZ-OwnerLogRedactionSpec.js.
 */

const expect = require('chai').expect;
const path = require('path');

const AUDIT_PATH = path.resolve(__dirname, '../../lib/thinx/audit.js');
const GLOBALS_PATH = path.resolve(__dirname, '../../lib/thinx/globals.js');

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

describe("SEC-PII-02 — Audit log TTL (expire_at)", function () {

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running AuditTTL spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed AuditTTL spec`);
  });

  // Helper: load Audit fresh (after require.cache eviction). Audit's module
  // top requires Globals; we evict both so Globals.app_config monkey-patches
  // (or lack thereof) take effect on the next require.
  function loadAuditFresh() {
    delete require.cache[AUDIT_PATH];
    return require(AUDIT_PATH);
  }

  it("Audit.log writes a record with an expire_at field (default 90-day horizon)", function () {
    const Audit = loadAuditFresh();
    const audit = new Audit();
    const mtime = new Date('2026-06-03T12:00:00.000Z');
    const record = audit._buildRecord('ownerOpaqueId', 'Test message', 'info', mtime);

    expect(record).to.have.property('expire_at');
    expect(record.expire_at).to.be.an.instanceof(Date);
    expect(record.message).to.equal('Test message');
    expect(record.owner).to.equal('ownerOpaqueId');
    expect(record.date).to.equal(mtime);
    expect(record.flags).to.deep.equal(['info']);
  });

  it("expire_at defaults to 90 days after record date when app_config.audit_retention_days is unset", function () {
    // No mock — exercise the real app_config + fallback chain. In CI the
    // test config (spec/mnt/data/conf/config.json) typically does NOT carry
    // audit_retention_days, so the 90-day fallback fires. If a future test
    // config sets audit_retention_days, this assertion would catch it.
    const Audit = loadAuditFresh();
    const Globals = require(GLOBALS_PATH);
    let configValue;
    try {
      const cfg = Globals.app_config();
      configValue = (cfg && typeof cfg.audit_retention_days === "number" && cfg.audit_retention_days > 0)
        ? cfg.audit_retention_days
        : 90;
    } catch (_e) {
      configValue = 90;
    }

    const audit = new Audit();
    const mtime = new Date('2026-06-03T12:00:00.000Z');
    const record = audit._buildRecord('ownerOpaqueId', 'Default retention probe', 'info', mtime);
    const diffMs = record.expire_at.getTime() - record.date.getTime();
    const expectedMs = configValue * 24 * 60 * 60 * 1000;
    expect(diffMs).to.equal(expectedMs);

    // When the test env config truly has no override, diffMs must equal 90 days.
    // 90 * 24 * 60 * 60 * 1000 = 7776000000 ms.
    if (configValue === 90) {
      expect(diffMs).to.equal(NINETY_DAYS_MS);
    }
  });

  it("expire_at honors app_config.audit_retention_days when set (30-day override)", function () {
    // Monkey-patch Globals.app_config to return audit_retention_days=30,
    // then re-require audit.js so the new app_config is read on next
    // _buildRecord call (the helper invokes Globals.app_config every time).
    const Globals = require(GLOBALS_PATH);
    const originalAppConfig = Globals.app_config;
    Globals.app_config = function () { return { audit_retention_days: 30 }; };

    try {
      const Audit = loadAuditFresh();
      const audit = new Audit();
      const mtime = new Date('2026-06-03T12:00:00.000Z');
      const record = audit._buildRecord('ownerOpaqueId', '30-day override probe', 'info', mtime);
      const diffMs = record.expire_at.getTime() - record.date.getTime();
      expect(diffMs).to.equal(THIRTY_DAYS_MS);
    } finally {
      // Always restore — even if the assertion above throws — so the next
      // spec sees a clean Globals.app_config.
      Globals.app_config = originalAppConfig;
      delete require.cache[AUDIT_PATH];
    }
  });

  it("Audit.log signature is unchanged (arity = 4) — SEC-PII-01 callers stay valid", function () {
    // Pure introspection. No env dependency. Asserts that
    // log(owner, message, flag, callback) keeps the 4-arg shape so
    // owner.js call sites (12+1 redacted-token sites per SEC-PII-01) keep
    // working without modification.
    const Audit = loadAuditFresh();
    const audit = new Audit();
    expect(audit.log.length).to.equal(4);
  });

  it("expire_at falls back to 90 days when app_config.audit_retention_days is invalid (negative / NaN / string)", function () {
    // Threat T-09-08: Tampering / malicious config. typeof === "number" && > 0
    // gates out negative, NaN, Infinity, string values — all coerce to 90.
    const Globals = require(GLOBALS_PATH);
    const originalAppConfig = Globals.app_config;
    const badValues = [-1, 0, NaN, "30", null, undefined];

    try {
      for (const bad of badValues) {
        Globals.app_config = function () { return { audit_retention_days: bad }; };
        const Audit = loadAuditFresh();
        const audit = new Audit();
        const mtime = new Date('2026-06-03T12:00:00.000Z');
        const record = audit._buildRecord('ownerOpaqueId', 'Bad-config probe', 'info', mtime);
        const diffMs = record.expire_at.getTime() - record.date.getTime();
        expect(diffMs, `audit_retention_days=${String(bad)} should coerce to 90-day fallback`).to.equal(NINETY_DAYS_MS);
      }
    } finally {
      Globals.app_config = originalAppConfig;
      delete require.cache[AUDIT_PATH];
    }
  });

});
