# Device Timezone (`timezone_utc`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an IANA timezone the source of truth for device timezones, derive `timezone_offset` instead of storing it as fact, and repair the device documents the old `NaN` bug corrupted.

**Architecture:** `timezone_utc` (IANA) becomes the stored source of truth. `timezone_offset` is derived on read in `devices.js` so in-app consumers always see a live value, and is also rewritten on each write so raw-document readers see a plausible cached one (approach C). Two pure static helpers on `Util` carry all the timezone logic so both paths share one implementation and can be tested without infrastructure.

**Tech Stack:** Node.js, moment-timezone 0.6.0 (moment 2.31.0), CouchDB via `nano`, Jasmine + chai.

**Spec:** `docs/superpowers/specs/2026-09-18-device-timezone-utc-design.md`

## Global Constraints

- Server-side only. No firmware change, and nothing added to the registration response.
- `timezone_utc` is written **only** when a valid IANA zone is supplied. It is never defaulted to `"UTC"` — defaulting would derive `0` and clobber a client-supplied `timezone_offset`.
- `Util.timezoneOffsetFor` returns `null` (not `0`) for an invalid zone, so callers distinguish "unknown" from real UTC.
- Offsets are **signed hours east of UTC**, matching the console's `timezones.js` `offset` field. Fractional zones (`Asia/Kolkata` → `5.5`) must survive.
- `timezone_abbr` stays as a display label only; it is never used for computation.
- Migration script follows `scripts/redact-managed-logs.js`: `--scan` default, `--apply` refuses without `--snapshot-to`, env-only credentials.

### Verification note (read before running tests)

The Jasmine suite **cannot run on this host**. `spec/helpers/bootstrap.js` boots `thinx-core.js` for every spec, and the dev config (`spec/mnt/data/conf/config.json`) points at Docker-internal hostnames (`thinx-redis`, `mosquitto`) plus `/mnt/data` certs. A local run fails in the global `beforeAll` after 60s regardless of how pure the spec is.

Therefore each task below carries **two** verification commands:
- **Local proof** — a direct `node -e` run against the pure logic. This is the real local gate; it must pass before committing.
- **CI gate** — the Jasmine command that runs in CircleCI, where the infrastructure exists.

`lib/thinx/util.js` and `scripts/*.js` load standalone (verified: `node -e "require('./lib/thinx/util.js')"` succeeds), which is what makes local proof possible.

---

### Task 1: `Util` timezone helpers

**Files:**
- Modify: `lib/thinx/util.js` (add `momentTz` import at top; add two static methods)
- Test: `spec/jasmine/UtilTimezoneSpec.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `Util.isValidTimezone(zone) -> boolean` — true only for IANA zone names known to moment-timezone.
  - `Util.timezoneOffsetFor(zone) -> number|null` — signed hours east of UTC including DST, or `null` when the zone is invalid.

- [ ] **Step 1: Write the failing spec**

Create `spec/jasmine/UtilTimezoneSpec.js`:

```js
/* Device timezone helpers — pure, no config, no CouchDB.
 * Style follows ZZ-RedactionScriptSpec.js (chai expect + banner convention).
 */

const expect = require('chai').expect;
const Util = require('../../lib/thinx/util.js');
const momentTz = require('moment-timezone');

describe("Util timezone helpers", function () {

  beforeAll(() => { console.log(`🚸 [chai] >>> running UtilTimezone spec`); });
  afterAll(() => { console.log(`🚸 [chai] <<< completed UtilTimezone spec`); });

  describe("isValidTimezone", function () {

    it("accepts IANA zone names", function () {
      expect(Util.isValidTimezone("Europe/Prague")).to.equal(true);
      expect(Util.isValidTimezone("America/New_York")).to.equal(true);
      expect(Util.isValidTimezone("UTC")).to.equal(true);
    });

    it("rejects abbreviations, which cannot be resolved back to a zone", function () {
      expect(Util.isValidTimezone("CEST")).to.equal(false);
      expect(Util.isValidTimezone("CDT")).to.equal(false);
    });

    it("rejects non-strings without throwing", function () {
      expect(Util.isValidTimezone(null)).to.equal(false);
      expect(Util.isValidTimezone(123)).to.equal(false);
      expect(Util.isValidTimezone(undefined)).to.equal(false);
      expect(Util.isValidTimezone({})).to.equal(false);
    });
  });

  describe("timezoneOffsetFor", function () {

    it("returns signed hours east of UTC", function () {
      expect(Util.timezoneOffsetFor("UTC")).to.equal(0);
      expect(Util.timezoneOffsetFor("Asia/Tokyo")).to.equal(9);
    });

    it("tracks DST rather than returning a fixed offset", function () {
      const summer = momentTz("2026-07-01T12:00:00Z").tz("Europe/Prague").utcOffset() / 60;
      const winter = momentTz("2026-01-01T12:00:00Z").tz("Europe/Prague").utcOffset() / 60;
      expect(summer).to.equal(2);
      expect(winter).to.equal(1);
      // The helper reports whichever is current, never a frozen value.
      expect([1, 2]).to.include(Util.timezoneOffsetFor("Europe/Prague"));
    });

    it("returns a negative offset for western zones", function () {
      expect(Util.timezoneOffsetFor("America/New_York")).to.be.oneOf([-5, -4]);
    });

    it("preserves fractional offsets", function () {
      expect(Util.timezoneOffsetFor("Asia/Kolkata")).to.equal(5.5);
    });

    it("returns null for an invalid zone, distinguishing it from real UTC", function () {
      expect(Util.timezoneOffsetFor("CEST")).to.equal(null);
      expect(Util.timezoneOffsetFor(null)).to.equal(null);
      expect(Util.timezoneOffsetFor(123)).to.equal(null);
    });
  });
});
```

- [ ] **Step 2: Run the local proof to verify it fails**

```bash
node -e "const U=require('./lib/thinx/util.js'); console.log(typeof U.isValidTimezone, typeof U.timezoneOffsetFor);"
```

Expected: `undefined undefined` — the helpers do not exist yet.

- [ ] **Step 3: Implement the helpers**

In `lib/thinx/util.js`, add the import beneath the existing `typeOf` require:

```js
const momentTz = require("moment-timezone");
```

Add these two static methods to the `Util` class (place them next to the other type helpers, after `isUndefinedOf`):

```js
  // Timezones: an IANA zone name (e.g. "Europe/Prague") is the only thing
  // moment-timezone can resolve. Abbreviations like "CEST" are NOT zone names —
  // .tz() silently falls back to the server's local zone for them, which is the
  // bug these helpers exist to prevent.
  static isValidTimezone(zone) {
    if (typeof zone !== "string") return false;
    return momentTz.tz.zone(zone) !== null;
  }

  // Current UTC offset for `zone` in signed hours east of UTC, already
  // including any DST shift. Returns null for an invalid zone so callers can
  // tell "unknown zone" apart from a genuine zero offset.
  static timezoneOffsetFor(zone) {
    if (!Util.isValidTimezone(zone)) return null;
    return momentTz().tz(zone).utcOffset() / 60;
  }
```

- [ ] **Step 4: Run the local proof to verify it passes**

```bash
node -e "
const U = require('./lib/thinx/util.js');
const assert = require('assert');
assert.strictEqual(U.isValidTimezone('Europe/Prague'), true);
assert.strictEqual(U.isValidTimezone('CEST'), false);
assert.strictEqual(U.isValidTimezone(null), false);
assert.strictEqual(U.isValidTimezone(123), false);
assert.strictEqual(U.timezoneOffsetFor('UTC'), 0);
assert.strictEqual(U.timezoneOffsetFor('Asia/Tokyo'), 9);
assert.strictEqual(U.timezoneOffsetFor('Asia/Kolkata'), 5.5);
assert.strictEqual(U.timezoneOffsetFor('CEST'), null);
assert.strictEqual(U.timezoneOffsetFor(123), null);
assert.ok([1,2].includes(U.timezoneOffsetFor('Europe/Prague')));
assert.ok([-5,-4].includes(U.timezoneOffsetFor('America/New_York')));
console.log('Task 1 local proof: PASS');
" 2>&1 | grep -v 'has no data'
```

Expected: `Task 1 local proof: PASS`

- [ ] **Step 5: Lint**

```bash
npx eslint lib/thinx/util.js spec/jasmine/UtilTimezoneSpec.js
```

Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add lib/thinx/util.js spec/jasmine/UtilTimezoneSpec.js
git commit -m "feat: add Util.isValidTimezone and Util.timezoneOffsetFor"
```

**CI gate:** `npx jasmine spec/jasmine/UtilTimezoneSpec.js`

---

### Task 2: Registration write path

**Files:**
- Modify: `lib/thinx/device.js:843-862` (timezone resolution) and `lib/thinx/device.js:~940-942` (document fields)

**Interfaces:**
- Consumes: `Util.isValidTimezone`, `Util.timezoneOffsetFor` from Task 1.
- Produces: new-device documents carrying `timezone_utc` (when supplied), `timezone_abbr`, `timezone_offset`; no `timezone` field.

- [ ] **Step 1: Confirm `Util` is already imported in device.js**

```bash
grep -n 'require("./util' lib/thinx/device.js || grep -n "require('./util" lib/thinx/device.js
```

If there is no match, add `const Util = require("./util.js");` alongside the other requires at the top of the file.

- [ ] **Step 2: Replace the timezone resolution block**

Replace `lib/thinx/device.js:843-862` (the block from `let timezone_offset = 0;` through the `if (debug_device) ... "Timezone offset: "` line) with:

```js
		let timezone_offset = 0;
		if (typeof (reg.timezone_offset) !== "undefined") {
			timezone_offset = reg.timezone_offset;
		}

		// Display label only. An abbreviation cannot be resolved back to a zone
		// (of 69 abbreviations in the console's table, 4 are valid zone names and
		// 18 map to more than one offset), so it is never used for computation.
		let timezone_abbr = "UTC";
		if (typeof (reg.timezone_abbr) === "string") {
			timezone_abbr = reg.timezone_abbr;
		}

		// IANA zone is the source of truth. Deliberately NOT defaulted to "UTC":
		// that would derive an offset of 0 and silently overwrite a client-supplied
		// timezone_offset. Absent means "unknown zone", which the read path handles
		// by falling back to the stored offset.
		let timezone_utc = null;
		if (Util.isValidTimezone(reg.timezone_utc)) {
			timezone_utc = reg.timezone_utc;
			// utcOffset() already accounts for DST, so no isDST() branch is needed.
			timezone_offset = Util.timezoneOffsetFor(timezone_utc);
		}

		if (debug_device) console.log("🔨 [debug] [device] Timezone offset: " + timezone_offset);
```

- [ ] **Step 3: Update the document fields**

In the new-device object at `lib/thinx/device.js:~940`, replace these two lines:

```js
				timezone: timezone_abbr,
				timezone_abbr: timezone_abbr,
```

with:

```js
				timezone_abbr: timezone_abbr,
				...(timezone_utc !== null && { timezone_utc: timezone_utc }),
```

The `timezone` field is dropped from new writes (nothing in application source reads it; the only other `.timezone` reference is `payload.timezone = "Universal"` on a local object). Existing documents keep their value.

- [ ] **Step 4: Run the local proof**

```bash
node --check lib/thinx/device.js && node -e "
const U = require('./lib/thinx/util.js');
const assert = require('assert');
// Mirror of the patched resolution block.
function resolve(reg) {
  let timezone_offset = 0;
  if (typeof (reg.timezone_offset) !== 'undefined') timezone_offset = reg.timezone_offset;
  let timezone_abbr = 'UTC';
  if (typeof (reg.timezone_abbr) === 'string') timezone_abbr = reg.timezone_abbr;
  let timezone_utc = null;
  if (U.isValidTimezone(reg.timezone_utc)) {
    timezone_utc = reg.timezone_utc;
    timezone_offset = U.timezoneOffsetFor(timezone_utc);
  }
  return { timezone_offset, timezone_abbr, timezone_utc };
}
// Valid zone drives the offset.
assert.deepStrictEqual(resolve({ timezone_utc: 'Asia/Tokyo', timezone_offset: 3 }),
  { timezone_offset: 9, timezone_abbr: 'UTC', timezone_utc: 'Asia/Tokyo' });
// No zone supplied: client offset preserved, zone left absent (the regression guard).
assert.deepStrictEqual(resolve({ timezone_offset: 3, timezone_abbr: 'CEST' }),
  { timezone_offset: 3, timezone_abbr: 'CEST', timezone_utc: null });
// Abbreviation in timezone_utc is rejected, offset untouched.
assert.deepStrictEqual(resolve({ timezone_utc: 'CEST', timezone_offset: 3 }),
  { timezone_offset: 3, timezone_abbr: 'UTC', timezone_utc: null });
// Hostile payload does not throw.
assert.deepStrictEqual(resolve({ timezone_abbr: null, timezone_utc: 123, timezone_offset: 2 }),
  { timezone_offset: 2, timezone_abbr: 'UTC', timezone_utc: null });
// Nothing supplied.
assert.deepStrictEqual(resolve({}), { timezone_offset: 0, timezone_abbr: 'UTC', timezone_utc: null });
console.log('Task 2 local proof: PASS');
" 2>&1 | grep -v 'has no data'
```

Expected: `Task 2 local proof: PASS`

- [ ] **Step 5: Lint and commit**

```bash
npx eslint lib/thinx/device.js
git add lib/thinx/device.js
git commit -m "feat: source device timezone from timezone_utc at registration"
```

**CI gate:** `npx jasmine spec/jasmine/DeviceSpec.js`

---

### Task 3: Edit path validation

**Files:**
- Modify: `lib/thinx/device.js` — the `edit(changes, callback)` method (~line 1439)

**Interfaces:**
- Consumes: `Util.isValidTimezone`, `Util.timezoneOffsetFor` from Task 1.
- Produces: `edit()` rejects an invalid `timezone_utc` with the string `"invalid_timezone_utc"` and recomputes `timezone_offset` when a valid one is supplied.

The CouchDB `modify` handler (`design/design_devices.json:22`) copies every field of the request body onto the document with no allowlist, so this validation is the only thing preventing an arbitrary string from being persisted as a zone.

- [ ] **Step 1: Add validation to `edit()`**

In `lib/thinx/device.js`, inside `edit(changes, callback)`, after the existing `changes.udid` guard and before `this.update_device(...)`:

```js
		// The CouchDB `modify` handler copies request fields onto the document
		// with no allowlist, so this is the only gate on what lands in timezone_utc.
		if (typeof (changes.timezone_utc) !== "undefined") {
			if (!Util.isValidTimezone(changes.timezone_utc)) {
				return callback(false, "invalid_timezone_utc");
			}
			// Keep the derived cache consistent with the zone being written.
			changes.timezone_offset = Util.timezoneOffsetFor(changes.timezone_utc);
		}
```

- [ ] **Step 2: Run the local proof**

```bash
node --check lib/thinx/device.js && node -e "
const U = require('./lib/thinx/util.js');
const assert = require('assert');
// Mirror of the validation gate.
function gate(changes) {
  if (typeof (changes.timezone_utc) !== 'undefined') {
    if (!U.isValidTimezone(changes.timezone_utc)) return { rejected: 'invalid_timezone_utc' };
    changes.timezone_offset = U.timezoneOffsetFor(changes.timezone_utc);
  }
  return { accepted: changes };
}
assert.strictEqual(gate({ timezone_utc: 'CEST' }).rejected, 'invalid_timezone_utc');
assert.strictEqual(gate({ timezone_utc: '../../etc/passwd' }).rejected, 'invalid_timezone_utc');
assert.strictEqual(gate({ timezone_utc: 123 }).rejected, 'invalid_timezone_utc');
assert.strictEqual(gate({ timezone_utc: 'Asia/Tokyo', timezone_offset: 999 }).accepted.timezone_offset, 9);
assert.strictEqual(gate({ alias: 'x' }).accepted.alias, 'x');   // untouched when absent
console.log('Task 3 local proof: PASS');
" 2>&1 | grep -v 'has no data'
```

Expected: `Task 3 local proof: PASS`

- [ ] **Step 3: Lint and commit**

```bash
npx eslint lib/thinx/device.js
git add lib/thinx/device.js
git commit -m "feat: validate timezone_utc on device edit and recompute offset"
```

**CI gate:** `npx jasmine spec/jasmine/ZZ-RouterDeviceSpec.js`

---

### Task 4: Read path derivation

**Files:**
- Modify: `lib/thinx/devices.js:~302` (the `timezone_offset` line of the device descriptor)

**Interfaces:**
- Consumes: `Util.timezoneOffsetFor` from Task 1.
- Produces: device descriptors whose `timezone_offset` is live rather than stored.

- [ ] **Step 1: Confirm `Util` is imported in devices.js**

```bash
grep -n 'require("./util' lib/thinx/devices.js || grep -n "require('./util" lib/thinx/devices.js
```

If there is no match, add `const Util = require("./util.js");` alongside the other requires.

- [ ] **Step 2: Derive the offset in the descriptor**

In `lib/thinx/devices.js`, replace:

```js
					timezone_offset: dvc.timezone_offset,
```

with:

```js
					// Derived, not stored: a persisted offset goes stale at every DST
					// boundary. Falls back to the stored value for devices that have
					// no timezone_utc yet (pre-migration, or never set by the owner).
					timezone_offset: Util.timezoneOffsetFor(dvc.timezone_utc) ?? dvc.timezone_offset,
```

- [ ] **Step 3: Run the local proof**

```bash
node --check lib/thinx/devices.js && node -e "
const U = require('./lib/thinx/util.js');
const assert = require('assert');
const derive = (dvc) => U.timezoneOffsetFor(dvc.timezone_utc) ?? dvc.timezone_offset;
assert.strictEqual(derive({ timezone_utc: 'Asia/Tokyo', timezone_offset: 3 }), 9);   // zone wins
assert.strictEqual(derive({ timezone_offset: 3 }), 3);                               // falls back
assert.strictEqual(derive({ timezone_utc: 'CEST', timezone_offset: 3 }), 3);         // invalid zone falls back
assert.strictEqual(derive({ timezone_utc: 'UTC', timezone_offset: 5 }), 0);          // real UTC beats stored
assert.strictEqual(derive({ timezone_offset: null }), null);                         // corrupt stays visible pre-migration
console.log('Task 4 local proof: PASS');
" 2>&1 | grep -v 'has no data'
```

Expected: `Task 4 local proof: PASS`

Note the fourth case: `timezoneOffsetFor("UTC")` returns `0`, and `0 ?? x` is `0`, so a real UTC zone correctly wins over a stored value. This is why the helper returns `null` rather than `0` for invalid input — `??` would otherwise not distinguish them.

- [ ] **Step 4: Lint and commit**

```bash
npx eslint lib/thinx/devices.js
git add lib/thinx/devices.js
git commit -m "feat: derive device timezone_offset from timezone_utc on read"
```

**CI gate:** `npx jasmine spec/jasmine/DevicesSpec.js`

---

### Task 5: Console sends `timezone_utc`

**Files:**
- Modify: `services/console/src/app/js/thinx-api.js:~700` (git submodule)

**Interfaces:**
- Consumes: the edit-path validation from Task 3.
- Produces: `/device/edit` payloads carrying the IANA zone the form already holds.

`services/console` is a submodule that currently carries unrelated uncommitted Cypress work. Stage **only** `thinx-api.js`; do not `git add -A` in that submodule.

- [ ] **Step 1: Add the field to the edit payload**

In `services/console/src/app/js/thinx-api.js`, in the `/device/edit` payload, change:

```js
      timezone_abbr: deviceForm.timezone_abbr,
      timezone_offset: deviceForm.timezone_offset
```

to:

```js
      timezone_abbr: deviceForm.timezone_abbr,
      timezone_utc: deviceForm.timezone_utc,
      timezone_offset: deviceForm.timezone_offset
```

`deviceForm.timezone_utc` is already populated by `submitTimezone()` in `DeviceController.js:179-186`; it is simply dropped on the wire today. No UI change.

- [ ] **Step 2: Verify the payload shape**

```bash
cd services/console && node --check src/app/js/thinx-api.js && grep -n -A3 'timezone_abbr: deviceForm' src/app/js/thinx-api.js && cd -
```

Expected: syntax OK, and `timezone_utc` appears between `timezone_abbr` and `timezone_offset`.

- [ ] **Step 3: Commit in the submodule, then pin**

```bash
cd services/console
git add src/app/js/thinx-api.js
git commit -m "feat: send timezone_utc in device edit payload"
cd -
git add services/console
git commit -m "chore: pin console submodule for timezone_utc payload"
```

---

### Task 6: Migration script

**Files:**
- Create: `scripts/backfill-device-timezone.js`
- Test: `spec/jasmine/ZZ-DeviceTimezoneMigrationSpec.js` (create)

**Interfaces:**
- Consumes: `Util.isValidTimezone`, `Util.timezoneOffsetFor` from Task 1.
- Produces (module exports, mirroring `scripts/redact-managed-logs.js`):
  - `classifyDoc(doc) -> { action, reason, patch }` where `action` is one of `"repair"`, `"backfill"`, `"report"`, `"skip"` and `patch` is the field delta to apply (`null` for `report`/`skip`).
  - `UNAMBIGUOUS_ABBR` — a frozen map of abbreviation to IANA zone, containing only entries that resolve unambiguously.

- [ ] **Step 1: Write the failing spec**

Create `spec/jasmine/ZZ-DeviceTimezoneMigrationSpec.js`:

```js
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

  it("CLI refuses --apply without --snapshot-to", function () {
    const script = path.join(__dirname, '..', '..', 'scripts', 'backfill-device-timezone.js');
    const proc = child_process.spawnSync(process.execPath, [script, '--apply'], { encoding: 'utf8' });
    expect(proc.status).to.not.equal(0);
    expect(proc.stderr + proc.stdout).to.contain('--snapshot-to');
  });
});
```

- [ ] **Step 2: Run the local proof to verify it fails**

```bash
node -e "require('./scripts/backfill-device-timezone.js')" 2>&1 | head -3
```

Expected: `Cannot find module` — the script does not exist yet.

- [ ] **Step 3: Write the script**

Create `scripts/backfill-device-timezone.js`. Build `UNAMBIGUOUS_ABBR` by taking the console's timezone table and keeping only abbreviations that map to exactly one offset **and** whose chosen zone name is a valid IANA zone — in practice this yields `UTC`. Hard-code the resulting map rather than reading the console file at runtime, so the script does not depend on the submodule being checked out:

```js
#!/usr/bin/env node
/*
 * scripts/backfill-device-timezone.js
 *
 * Repairs device documents damaged by the timezone_offset NaN bug and
 * backfills timezone_utc where it can be determined without guessing.
 *
 * Modes:
 *   --scan                  Dry-run (DEFAULT). Never writes to CouchDB.
 *   --apply --snapshot-to <path>
 *                           DESTRUCTIVE. Writes a JSONL snapshot of every
 *                           touched doc BEFORE any _bulk_docs POST. Refuses
 *                           to run without --snapshot-to.
 *   --batch-size <N>        Docs per _bulk_docs request (default 500).
 *   --max-docs <N>          Cap docs touched/scanned (default unbounded).
 *   --db-name <name>        Override DB name (default `${THINX_PREFIX}devices`).
 *   --help, -h              Print usage and exit 0.
 *
 * Credentials (env-only, ZERO repo-hardcoded creds):
 *   COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD, THINX_PREFIX
 *
 * Idempotent: a second --apply run is a no-op.
 */

const Util = require("../lib/thinx/util.js");

// Abbreviations that resolve to exactly one IANA zone. Deliberately tiny:
// of 69 abbreviations in the console's table only 4 are valid zone names, and
// 18 map to more than one offset. Anything not listed here is reported for a
// human to re-pick rather than guessed.
const UNAMBIGUOUS_ABBR = Object.freeze({
  "UTC": "UTC"
});

function isCorruptOffset(value) {
  return value === null || value === undefined || (typeof value === "number" && Number.isNaN(value));
}

/*
 * Decide what a single device document needs. Pure: no I/O, no CouchDB.
 * Returns { action, reason, patch }.
 */
function classifyDoc(doc) {
  const zone = Util.isValidTimezone(doc.timezone_utc) ? doc.timezone_utc : null;
  const mapped = zone === null ? (UNAMBIGUOUS_ABBR[doc.timezone_abbr] || null) : null;

  if (isCorruptOffset(doc.timezone_offset)) {
    const source = zone || mapped;
    const offset = source === null ? 0 : Util.timezoneOffsetFor(source);
    const patch = { timezone_offset: offset };
    if (zone === null && mapped !== null) patch.timezone_utc = mapped;
    return {
      action: "repair",
      reason: source === null ? "corrupt offset, no resolvable zone; reset to 0" : `corrupt offset; recomputed from ${source}`,
      patch: patch
    };
  }

  if (zone !== null) {
    return { action: "skip", reason: "already migrated", patch: null };
  }

  if (mapped !== null) {
    return {
      action: "backfill",
      reason: `abbreviation ${doc.timezone_abbr} resolves unambiguously`,
      patch: { timezone_utc: mapped, timezone_offset: Util.timezoneOffsetFor(mapped) }
    };
  }

  return {
    action: "report",
    reason: `abbreviation ${JSON.stringify(doc.timezone_abbr)} is ambiguous or unrecognised; owner must re-pick`,
    patch: null
  };
}

module.exports = { classifyDoc, UNAMBIGUOUS_ABBR, isCorruptOffset };
```

Then add the CLI driver below the exports: argument parsing (`--scan` default, `--apply`, `--snapshot-to`, `--batch-size`, `--max-docs`, `--db-name`, `--help`), the `--apply`-without-`--snapshot-to` refusal (print a message containing `--snapshot-to` to stderr and `process.exit(2)`), CouchDB streaming via `nano` using the env credentials, snapshot-then-`_bulk_docs` write ordering, and a summary printing counts per action plus the `report` list grouped by `owner`. Guard the driver with `if (require.main === module)` so requiring the module in tests does not execute it.

- [ ] **Step 4: Run the local proof to verify it passes**

```bash
node -e "
const m = require('./scripts/backfill-device-timezone.js');
const assert = require('assert');
assert.strictEqual(m.classifyDoc({udid:'a',timezone_utc:'Asia/Tokyo',timezone_offset:null}).action, 'repair');
assert.strictEqual(m.classifyDoc({udid:'a',timezone_utc:'Asia/Tokyo',timezone_offset:null}).patch.timezone_offset, 9);
assert.strictEqual(m.classifyDoc({udid:'b',timezone_abbr:'UTC'}).patch.timezone_offset, 0);
assert.strictEqual(m.classifyDoc({udid:'c',timezone_abbr:'UTC',timezone_offset:0}).action, 'backfill');
assert.strictEqual(m.classifyDoc({udid:'d',timezone_abbr:'MDT',timezone_offset:-6}).action, 'report');
assert.strictEqual(m.classifyDoc({udid:'e',timezone_abbr:'CEST',timezone_offset:2}).action, 'report');
assert.strictEqual(m.classifyDoc({udid:'f',timezone_utc:'Europe/Prague',timezone_offset:2}).action, 'skip');
assert.strictEqual(m.classifyDoc({udid:'g',timezone_utc:'UTC',timezone_offset:NaN}).action, 'repair');
// idempotency: applying a backfill patch then re-classifying yields skip
const d = {udid:'c',timezone_abbr:'UTC',timezone_offset:0};
Object.assign(d, m.classifyDoc(d).patch);
assert.strictEqual(m.classifyDoc(d).action, 'skip');
console.log('Task 6 local proof: PASS');
" 2>&1 | grep -v 'has no data'
```

Expected: `Task 6 local proof: PASS`

- [ ] **Step 5: Verify the CLI safety gate**

```bash
node scripts/backfill-device-timezone.js --apply; echo "exit=$?"
```

Expected: a message mentioning `--snapshot-to`, and a non-zero exit code.

```bash
node scripts/backfill-device-timezone.js --help; echo "exit=$?"
```

Expected: usage text, `exit=0`.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint scripts/backfill-device-timezone.js spec/jasmine/ZZ-DeviceTimezoneMigrationSpec.js
git add scripts/backfill-device-timezone.js spec/jasmine/ZZ-DeviceTimezoneMigrationSpec.js
git commit -m "feat: add device timezone backfill and repair migration script"
```

**CI gate:** `npx jasmine spec/jasmine/ZZ-DeviceTimezoneMigrationSpec.js`

---

## Final verification

- [ ] Full lint: `npx eslint ./` — expect only the two pre-existing errors (`lib/thinx/sources.js:11` unused `exec`, `spec/jasmine/ZZ-WebSocketLifecycleSpec.js:37` unused `chai`).
- [ ] Syntax: `node --check` on every modified `.js` file.
- [ ] All six local proofs re-run and pass.
- [ ] Push to `thinx-staging` and let CircleCI run the Jasmine suite — that is the only environment where the integration specs can execute.

## Operator runbook (after CI is green)

1. `--scan` against production, reviewing the `report` list grouped by owner:
   ```bash
   COUCHDB_URL=... COUCHDB_USER=... COUCHDB_PASSWORD=... THINX_PREFIX=... \
     node scripts/backfill-device-timezone.js --scan
   ```
2. `--apply` with a snapshot:
   ```bash
   COUCHDB_URL=... COUCHDB_USER=... COUCHDB_PASSWORD=... THINX_PREFIX=... \
     node scripts/backfill-device-timezone.js --apply --snapshot-to ./tz-migration-snapshot.jsonl
   ```
3. Re-run `--scan`; expect zero `repair` and zero `backfill` (idempotency check).
