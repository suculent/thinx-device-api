/* SEC-PII-02 regression spec — managed_logs redaction script.
 *
 * Fixture-based: NO live CouchDB. Exercises the pure helpers
 * (containsRawPII / redactDoc / scanDoc) exported from
 * scripts/redact-managed-logs.js, plus one CLI-gate spec that asserts
 * the script refuses --apply without --snapshot-to.
 *
 * Style: project Jasmine + chai (no chai-http needed; no chai.request).
 * Banner convention per AuditSpec.js / ZZ-OwnerLogRedactionSpec.js.
 *
 * Test-env ACCEPT pattern (Phase 5/6/7/8 precedent): this spec relies
 * on NO config (no _envi.json, no app_config, no CouchDB connection),
 * so it runs cleanly under the project's local Jasmine harness AND
 * under the CircleCI canonical green-gate without env-specific skips.
 */

const child_process = require('child_process');
const path = require('path');
const expect = require('chai').expect;
const redactor = require('../../scripts/redact-managed-logs.js');

describe("SEC-PII-02 — managed_logs redaction script", function () {

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running RedactionScript spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed RedactionScript spec`);
  });

  // --- Fixtures (inline, no external JSON file) ---------------------------
  const SAMPLE_RESET_KEY = "a".repeat(64);          // matches /[0-9a-f]{64}/g
  const SAMPLE_RESET_KEY_2 = "f".repeat(64);
  const SAMPLE_EMAIL = "alice@example.com";

  const docLeakBoth = {
    _id: "2025-01-01T00:00:00.000Z",
    _rev: "1-abc",
    owner: "ownerOpaqueId",
    date: "2025-01-01T00:00:00.000Z",
    message: `Attempt to reset password for ${SAMPLE_EMAIL} with: ${SAMPLE_RESET_KEY}`,
    flags: ["warning"]
  };

  const docLeakKeyOnly = {
    _id: "2025-02-01T00:00:00.000Z",
    _rev: "1-def",
    owner: "ownerOpaqueId",
    date: "2025-02-01T00:00:00.000Z",
    message: `key=${SAMPLE_RESET_KEY_2}`,
    flags: ["info"]
  };

  const docLeakEmailOnly = {
    _id: "2025-03-01T00:00:00.000Z",
    _rev: "1-ghi",
    owner: "ownerOpaqueId",
    date: "2025-03-01T00:00:00.000Z",
    message: `Sent activation to ${SAMPLE_EMAIL}`,
    flags: ["info"]
  };

  const docClean = {
    _id: "2025-04-01T00:00:00.000Z",
    _rev: "1-jkl",
    owner: "ownerOpaqueId",
    date: "2025-04-01T00:00:00.000Z",
    message: "User logged in successfully.",
    flags: ["info"]
  };

  const docAlreadyRedacted = {
    _id: "2025-05-01T00:00:00.000Z",
    _rev: "2-mno",
    owner: "ownerOpaqueId",
    date: "2025-05-01T00:00:00.000Z",
    message: "Attempt to reset password for [REDACTED-EMAIL] with: [REDACTED-RESET_KEY]",
    flags: ["warning"],
    redacted_by: "SEC-PII-02",
    redacted_at: "2026-06-03T00:00:00.000Z"
  };

  // SEC-PII-02b regression fixtures — production `owner` is a 64-char lowercase
  // hex hash (NOT an opaque id). Earlier fixtures used "ownerOpaqueId", which
  // masked the field-scoping bug: the all-fields walk matched the 64-hex owner
  // under RESET_KEY_REGEX and would overwrite it with [REDACTED-RESET_KEY].
  const OWNER_HASH = "c".repeat(64);          // matches /[0-9a-f]{64}/g, but is NOT a leak

  const docOwnerHashCleanMessage = {
    _id: "2025-06-01T00:00:00.000Z",
    _rev: "1-own",
    owner: OWNER_HASH,
    date: "2025-06-01T00:00:00.000Z",
    message: "Checkin Existing device.",
    flags: ["info"]
  };

  const docOwnerHashLeakMessage = {
    _id: "2025-06-02T00:00:00.000Z",
    _rev: "1-own2",
    owner: OWNER_HASH,
    date: "2025-06-02T00:00:00.000Z",
    message: `key=${SAMPLE_RESET_KEY_2}`,
    flags: ["info"]
  };

  // --- Pure-helper specs (the 6 logic truths) -----------------------------

  it("containsRawPII returns true for raw 64-char hex reset_key in message", function () {
    expect(redactor.containsRawPII(docLeakKeyOnly)).to.equal(true);
  });

  it("containsRawPII returns true for raw email in message", function () {
    expect(redactor.containsRawPII(docLeakEmailOnly)).to.equal(true);
  });

  it("containsRawPII returns false for clean message", function () {
    expect(redactor.containsRawPII(docClean)).to.equal(false);
  });

  it("redactDoc overlays both reset_key and email markers and preserves _id + _rev", function () {
    const result = redactor.redactDoc(docLeakBoth);
    expect(result.changed).to.equal(true);
    expect(result.doc._id).to.equal(docLeakBoth._id);
    expect(result.doc._rev).to.equal(docLeakBoth._rev);
    expect(result.doc.message).to.contain("[REDACTED-RESET_KEY]");
    expect(result.doc.message).to.contain("[REDACTED-EMAIL]");
    expect(result.doc.message).to.not.contain(SAMPLE_RESET_KEY);
    expect(result.doc.message).to.not.contain(SAMPLE_EMAIL);
    expect(result.doc.redacted_by).to.equal("SEC-PII-02");
    // ISO timestamp must be parseable as a Date.
    expect(Number.isFinite(Date.parse(result.doc.redacted_at))).to.equal(true);
    // Original doc must NOT have been mutated in place.
    expect(docLeakBoth.message).to.contain(SAMPLE_RESET_KEY);
    expect(docLeakBoth.message).to.contain(SAMPLE_EMAIL);
  });

  it("redactDoc is idempotent — a pre-redacted doc returns changed=false", function () {
    const result = redactor.redactDoc(docAlreadyRedacted);
    expect(result.changed).to.equal(false);
    expect(redactor.containsRawPII(result.doc)).to.equal(false);
  });

  it("scanDoc reports hit counts per leak shape", function () {
    const both = redactor.scanDoc(docLeakBoth);
    expect(both.resetKeyHits).to.be.at.least(1);
    expect(both.emailHits).to.be.at.least(1);
    const clean = redactor.scanDoc(docClean);
    expect(clean.resetKeyHits).to.equal(0);
    expect(clean.emailHits).to.equal(0);
  });

  // --- SEC-PII-02b: owner-field scoping regression ------------------------

  it("containsRawPII ignores a 64-hex owner hash when message is clean", function () {
    // The structural `owner` field is a legitimate 64-char hex hash, not a
    // reset_key leak. Field-scoping must keep it out of the scan.
    expect(redactor.containsRawPII(docOwnerHashCleanMessage)).to.equal(false);
  });

  it("redactDoc does NOT touch a 64-hex owner field (no false-positive redaction)", function () {
    const result = redactor.redactDoc(docOwnerHashCleanMessage);
    expect(result.changed).to.equal(false);
    expect(result.doc.owner).to.equal(OWNER_HASH);
  });

  it("redactDoc redacts a message leak while preserving the 64-hex owner hash", function () {
    const result = redactor.redactDoc(docOwnerHashLeakMessage);
    expect(result.changed).to.equal(true);
    expect(result.doc.owner).to.equal(OWNER_HASH);                 // owner untouched
    expect(result.doc.message).to.contain("[REDACTED-RESET_KEY]"); // message redacted
    expect(result.doc.message).to.not.contain(SAMPLE_RESET_KEY_2);
  });

  it("scanDoc only counts hits in PII fields, not the owner hash", function () {
    const scan = redactor.scanDoc(docOwnerHashCleanMessage);
    expect(scan.resetKeyHits).to.equal(0);
    expect(scan.emailHits).to.equal(0);
    expect(scan.fields).to.not.contain("owner");
  });

  // --- CLI-gate spec (file-level — no live CouchDB) -----------------------

  it("CLI refuses --apply without --snapshot-to", function () {
    // Spawn the script with --apply but NO --snapshot-to. The script's
    // argument-parser MUST refuse on the snapshot gate BEFORE attempting
    // any CouchDB connection (so this spec runs in any environment).
    const scriptPath = path.resolve(__dirname, "..", "..", "scripts", "redact-managed-logs.js");
    const result = child_process.spawnSync(process.execPath, [scriptPath, "--apply"], {
      encoding: "utf8",
      // Deliberately omit COUCHDB_* env vars — the snapshot-gate must fire
      // BEFORE the no-creds error to validate gate ordering.
      env: { PATH: process.env.PATH || "" }
    });
    expect(result.status).to.not.equal(0);
    const out = String(result.stderr || "") + String(result.stdout || "");
    expect(out).to.match(/snapshot/i);
  });

});
