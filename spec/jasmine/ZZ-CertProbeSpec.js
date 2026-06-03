/* THINX-CERT-CHECK-01 regression spec — startup ca.pem freshness probe.
 *
 * Asserts that `probeCaFreshness(certPath, caPath)` (in lib/thinx/cert-probe.js)
 * correctly identifies Let's Encrypt intermediate rotation drift between the
 * server's leaf certificate and the pinned ca.pem bundle:
 *   - R10 leaf + R10 ca           => ok=true,  message=null
 *   - R13 leaf + R13 ca           => ok=true,  message=null
 *   - R13 leaf + R10 ca           => ok=false, message names BOTH R13 and R10
 *   - R10 leaf + R13 ca           => ok=false, message names BOTH R10 and R13
 *   - Missing leaf cert on disk   => ok=false, no throw, message names 'leaf'
 *   - Fixture mtime invariance    => probe is DETECT-only, never mutates disk
 *
 * Style: project Jasmine + chai (no chai-http, no sinon — per CONVENTIONS.md
 * "Do not introduce sinon, jest, or other mocking frameworks"). PURE matcher
 * test — no live SSL, no live network, no _envi.json, no app_config.
 *
 * Test-env ACCEPT pattern (Phase 5/6/7/8/9/10 precedent): this spec runs
 * against static fixture PEM files in spec/fixtures/cert-probe/ — so the
 * assertions run cleanly under the project's local Jasmine harness AND
 * under the CircleCI canonical green-gate without env-specific skips.
 *
 * Banner convention per ZZ-AuditTTLSpec.js / ZZ-RedactionScriptSpec.js.
 */

const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;

const certProbe = require('../../lib/thinx/cert-probe');

const FIXTURES = path.resolve(__dirname, '../fixtures/cert-probe');
const R10_LEAF = path.join(FIXTURES, 'R10-leaf.pem');
const R10_CA   = path.join(FIXTURES, 'R10-ca.pem');
const R13_LEAF = path.join(FIXTURES, 'R13-leaf.pem');
const R13_CA   = path.join(FIXTURES, 'R13-ca.pem');

describe("THINX-CERT-CHECK-01 — startup ca.pem freshness probe", function () {

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running CertProbe spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed CertProbe spec`);
  });

  it("should return ok:true for R10 leaf + R10 ca (matching intermediate)", function () {
    const result = certProbe.probeCaFreshness(R10_LEAF, R10_CA);
    expect(result.ok).to.equal(true);
    expect(result.leafIssuer).to.equal('R10');
    expect(result.caContains).to.include('R10');
    expect(result.message).to.equal(null);
  });

  it("should return ok:true for R13 leaf + R13 ca (matching intermediate)", function () {
    const result = certProbe.probeCaFreshness(R13_LEAF, R13_CA);
    expect(result.ok).to.equal(true);
    expect(result.leafIssuer).to.equal('R13');
    expect(result.caContains).to.include('R13');
    expect(result.message).to.equal(null);
  });

  it("should return ok:false for R13 leaf + R10 ca (2026-05-31 drift scenario)", function () {
    const result = certProbe.probeCaFreshness(R13_LEAF, R10_CA);
    expect(result.ok).to.equal(false);
    expect(result.leafIssuer).to.equal('R13');
    expect(result.caContains).to.include('R10');
    expect(result.message).to.be.a('string');
    expect(result.message).to.contain('R13');
    expect(result.message).to.contain('R10');
    expect(result.message).to.contain('letsencrypt.org/certs/');
  });

  it("should return ok:false for R10 leaf + R13 ca (reverse / operator-rollback scenario)", function () {
    const result = certProbe.probeCaFreshness(R10_LEAF, R13_CA);
    expect(result.ok).to.equal(false);
    expect(result.leafIssuer).to.equal('R10');
    expect(result.caContains).to.include('R13');
    expect(result.message).to.be.a('string');
    expect(result.message).to.contain('R10');
    expect(result.message).to.contain('R13');
  });

  it("should handle missing leaf cert gracefully (no throw, returns ok:false)", function () {
    const missingPath = `/tmp/does-not-exist-${Date.now()}-${process.pid}.pem`;
    let result;
    let threw = null;
    try {
      result = certProbe.probeCaFreshness(missingPath, R13_CA);
    } catch (e) {
      threw = e;
    }
    expect(threw, 'probe must not throw on missing leaf cert').to.equal(null);
    expect(result.ok).to.equal(false);
    expect(result.leafIssuer).to.equal(null);
    expect(result.message).to.be.a('string');
    // Must surface the fact that the LEAF file was the problem, not ca.pem.
    expect(result.message.toLowerCase()).to.contain('leaf');
  });

  it("should not mutate fixture files on disk (DETECT-only invariant)", function () {
    // Capture mtimeMs of every fixture BEFORE any probe call.
    const before = {
      R10_LEAF: fs.statSync(R10_LEAF).mtimeMs,
      R10_CA:   fs.statSync(R10_CA).mtimeMs,
      R13_LEAF: fs.statSync(R13_LEAF).mtimeMs,
      R13_CA:   fs.statSync(R13_CA).mtimeMs,
    };

    // Exercise the probe against BOTH ok and not-ok pairs.
    certProbe.probeCaFreshness(R10_LEAF, R10_CA);
    certProbe.probeCaFreshness(R13_LEAF, R13_CA);
    certProbe.probeCaFreshness(R13_LEAF, R10_CA);
    certProbe.probeCaFreshness(R10_LEAF, R13_CA);

    const after = {
      R10_LEAF: fs.statSync(R10_LEAF).mtimeMs,
      R10_CA:   fs.statSync(R10_CA).mtimeMs,
      R13_LEAF: fs.statSync(R13_LEAF).mtimeMs,
      R13_CA:   fs.statSync(R13_CA).mtimeMs,
    };

    expect(after.R10_LEAF, 'R10-leaf.pem mtime must be unchanged after probe').to.equal(before.R10_LEAF);
    expect(after.R10_CA,   'R10-ca.pem mtime must be unchanged after probe').to.equal(before.R10_CA);
    expect(after.R13_LEAF, 'R13-leaf.pem mtime must be unchanged after probe').to.equal(before.R13_LEAF);
    expect(after.R13_CA,   'R13-ca.pem mtime must be unchanged after probe').to.equal(before.R13_CA);
  });

});
