/* Device timezone migration — fixture-based, NO live CouchDB.
 * Exercises the pure classifier exported from scripts/backfill-device-timezone.js,
 * plus one CLI-gate spec asserting --apply refuses without --snapshot-to.
 * Relies on NO config, matching the ZZ-RedactionScriptSpec.js precedent.
 */

const child_process = require('child_process');
const path = require('path');
const expect = require('chai').expect;
const migration = require('../../scripts/backfill-device-timezone.js');

describe("Device timezone migration script", function () {

  beforeAll(() => { console.log(`🚸 [chai] >>> running DeviceTimezoneMigration spec`); });
  afterAll(() => { console.log(`🚸 [chai] <<< completed DeviceTimezoneMigration spec`); });

  it("repairs a null offset using an existing valid zone", function () {
    const r = migration.classifyDoc({ udid: "a", timezone_utc: "Asia/Tokyo", timezone_offset: null });
    expect(r.action).to.equal("repair");
    expect(r.patch.timezone_offset).to.equal(9);
  });

  it("repairs a missing offset for a UTC device", function () {
    const r = migration.classifyDoc({ udid: "b", timezone_abbr: "UTC" });
    expect(r.action).to.equal("repair");
    expect(r.patch.timezone_offset).to.equal(0);
  });

  it("backfills timezone_utc when the abbreviation is unambiguous", function () {
    const r = migration.classifyDoc({ udid: "c", timezone_abbr: "UTC", timezone_offset: 0 });
    expect(r.action).to.equal("backfill");
    expect(r.patch.timezone_utc).to.equal("UTC");
  });

  it("reports rather than guesses for an ambiguous abbreviation", function () {
    const r = migration.classifyDoc({ udid: "d", timezone_abbr: "MDT", timezone_offset: -6 });
    expect(r.action).to.equal("report");
    expect(r.patch).to.equal(null);
  });

  it("reports rather than guesses for an unrecognised abbreviation", function () {
    const r = migration.classifyDoc({ udid: "e", timezone_abbr: "CEST", timezone_offset: 2 });
    expect(r.action).to.equal("report");
    expect(r.patch).to.equal(null);
  });

  it("is idempotent: a healthy migrated doc needs no work", function () {
    const r = migration.classifyDoc({ udid: "f", timezone_utc: "Europe/Prague", timezone_offset: 2 });
    expect(r.action).to.equal("skip");
  });

  it("treats NaN offset as corrupt", function () {
    const r = migration.classifyDoc({ udid: "g", timezone_utc: "UTC", timezone_offset: NaN });
    expect(r.action).to.equal("repair");
    expect(r.patch.timezone_offset).to.equal(0);
  });

  it("re-classifying an applied patch yields skip", function () {
    const doc = { udid: "h", timezone_abbr: "UTC", timezone_offset: 0 };
    Object.assign(doc, migration.classifyDoc(doc).patch);
    expect(migration.classifyDoc(doc).action).to.equal("skip");
  });

  it("CLI refuses --apply without --snapshot-to", function () {
    const script = path.join(__dirname, '..', '..', 'scripts', 'backfill-device-timezone.js');
    const proc = child_process.spawnSync(process.execPath, [script, '--apply'], { encoding: 'utf8' });
    expect(proc.status).to.not.equal(0);
    expect(proc.stderr + proc.stdout).to.contain('--snapshot-to');
  });

  it("CLI --help exits cleanly", function () {
    const script = path.join(__dirname, '..', '..', 'scripts', 'backfill-device-timezone.js');
    const proc = child_process.spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
    expect(proc.status).to.equal(0);
    expect(proc.stdout).to.contain('--snapshot-to');
  });
});
