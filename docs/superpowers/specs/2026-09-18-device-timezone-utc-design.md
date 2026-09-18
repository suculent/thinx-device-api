# Device Timezone (`timezone_utc`) Design

**Date:** 2026-09-18  
**Status:** Approved  
**Scope:** Make an IANA zone the source of truth for device timezones; derive `timezone_offset` instead of storing it as fact; migrate existing device documents

---

## Problem

Device registration stores `timezone_abbr` — an *abbreviation* such as `CEST`, chosen from the console's timezone selector. The DST branch in `lib/thinx/device.js` passes that abbreviation to `momentTz().tz()`, which expects an *IANA zone name* such as `Europe/Prague`.

For anything moment-timezone does not recognise, `.tz()` logs `has no data for <name>` and silently leaves the moment in the **server's** local zone. The branch has therefore been computing the server's offset, not the device's.

Measured against the console's own timezone table (`services/console/src/assets/thinx/js/plugins/timezones/timezones.js`, 103 entries, 69 distinct abbreviations):

- **4** abbreviations are valid moment-timezone zone names: `HST`, `MST`, `UTC`, `EST`.
- Of those, `HST`, `MST` and `EST` are fixed-offset zones that never report DST, so the branch never fires for them.
- **18** abbreviations map to more than one UTC offset (`MDT`, `AST`, `BST`, `GST`, `MST`, …), so an abbreviation cannot be resolved back to a zone.

The branch has only ever behaved correctly for `"UTC"`, where it is a no-op.

A separate defect on the same lines — `timezone_offset` computed from moment's private `_tzm`, which is only populated when parsing a string carrying a UTC offset and was therefore always `undefined`, yielding `NaN` — was fixed in commit `4a4eb940`. `NaN` serialises to `null` in CouchDB, so documents written while that bug was live carry a null offset. Repairing those is part of this work.

### The underlying design problem

Fixing the input is not sufficient. `timezone_offset` is computed once at registration and then persisted, but DST changes twice a year. A device registered in July stores `2` and keeps reporting `2` through January, when Prague is `1`. A stored offset is stale by construction.

---

## Decisions

**Boundary: server-side only.** No firmware change, and no `timezone_offset` added to the registration response. The firmware fixture at `spec/test_repositories/thinx-firmware-esp8266/src/THiNXLib.cpp` declares `int timezone_offset = 0` and never assigns it from the registration response; the API never sends it either. The comment at `THiNXLib.cpp:1874` describes an intent that was never wired up on either end. Closing that loop is a separate piece of work.

**Approach: derive on read, keep a refreshed cache (approach C).** `timezone_utc` is the source of truth. `timezone_offset` is derived in the read path so every in-app consumer sees a live value, and is also rewritten on each write so any raw-document reader still sees something plausible. Deriving on read alone was considered and rejected only because raw-document readers in the transformer/MQTT paths have not been exhaustively traced; the redundant stored field is a cheap hedge.

**Migration: repair, plus backfill only where unambiguous.** Repair documents whose `timezone_offset` is `null`/`NaN`/missing. Backfill `timezone_utc` only where the abbreviation resolves unambiguously — in practice `"UTC"`. Report the rest for the owner to re-pick in the console rather than guessing. Assigning a representative zone to ambiguous abbreviations was rejected: it is offset-plausible but silently mislabels zone identity, producing wrong data that looks authoritative.

---

## Architecture

### Shared helpers: `lib/thinx/util.js`

`Util` is an existing class of static helpers; these follow that pattern and are consumed by both `device.js` and `devices.js`.

```js
static isValidTimezone(zone)    // typeof zone === "string" && momentTz.tz.zone(zone) !== null
static timezoneOffsetFor(zone)  // signed hours east of UTC, or null when the zone is invalid
```

`timezoneOffsetFor` returns `null` rather than `0` for an invalid zone, so callers choose their own fallback instead of silently receiving a value indistinguishable from real UTC.

Both are pure — no config file, no CouchDB — so they are unit-testable in isolation.

### Device document

| Field | Change |
|---|---|
| `timezone_utc` | **New.** IANA zone name. Source of truth. Written only when a valid zone is supplied; otherwise left absent. |
| `timezone_abbr` | Kept. Human-readable display label only; no longer used for computation. |
| `timezone_offset` | Kept. Derived cache, recomputed on every write. |
| `timezone` | Stop writing. Existing values left untouched. |

`timezone` duplicates `timezone_abbr` and is written but never read anywhere in application source — the only other `.timezone` reference is `payload.timezone = "Universal"` on a local object at `device.js:1098`. It is dropped from new writes; existing documents are not rewritten to remove it.

`devices.js` already returns `timezone_utc` in its device descriptor (`lib/thinx/devices.js:303`). The read path anticipates the field; nothing has ever populated it.

### Write path — registration (`lib/thinx/device.js`, ~843-862)

- Take `reg.timezone_utc` when `Util.isValidTimezone` accepts it. When it is absent or invalid, **do not write the field at all** — see below.
- Keep accepting `reg.timezone_abbr` as a display label, under the existing `typeof === "string"` guard.
- Derive `timezone_offset` from the zone via `Util.timezoneOffsetFor` **only when a valid zone was supplied**. Otherwise leave the client-supplied `reg.timezone_offset` untouched (defaulting to `0` as today).

The field is deliberately **not** defaulted to `"UTC"`. Defaulting would derive an offset of `0` for every device that does not send a zone, silently overwriting a client-supplied `timezone_offset` — a regression against current behaviour, and a contradiction of the sequencing guarantee below. An absent `timezone_utc` means "unknown zone", which the read path already handles by falling back to the stored offset.

The `if (device_time.isDST())` conditional is **removed**. `utcOffset()` already accounts for DST, so branching on `isDST()` was never load-bearing — it only decided whether to overwrite the client-supplied value.

### Write path — edit (`lib/thinx/device.js` `edit`/`update_device`)

The CouchDB `modify` update handler (`design/design_devices.json:22`) copies every field from the request body onto the document with no allowlist:

```js
var fields = JSON.parse(req.body); for (var i in fields) { doc[i] = fields[i] }
```

So persisting `timezone_utc` requires no change to the handler — but that same absence of filtering means validation in `edit` is the only thing preventing a client from writing an arbitrary string into `timezone_utc`. Validate with `Util.isValidTimezone` and reject the change when it fails; recompute `timezone_offset` from the accepted zone.

### Read path (`lib/thinx/devices.js:~303`)

Derive the offset when building the descriptor, falling back to the stored value:

```js
timezone_offset: Util.timezoneOffsetFor(dvc.timezone_utc) ?? dvc.timezone_offset,
```

`devices.js` does not currently import moment-timezone; it consumes the helpers from `Util` rather than importing it directly.

### Console (`services/console/src/app/js/thinx-api.js:~700`)

Add one field to the `/device/edit` payload:

```js
timezone_utc: deviceForm.timezone_utc,
```

`deviceForm.timezone_utc` is already populated by `submitTimezone()` in `DeviceController.js` and is simply dropped on the wire today. No console UI change.

Note: `services/console` is a git submodule and currently carries unrelated uncommitted Cypress work. Coordinate the commit there so this one-line change is not entangled with it.

### Migration script: `scripts/backfill-device-timezone.js`

Modelled directly on `scripts/redact-managed-logs.js`, which establishes the house pattern for bulk CouchDB patching:

- `--scan` (default) — dry run. Streams documents, counts would-be edits, prints a summary, never writes.
- `--apply --snapshot-to <path>` — destructive. Writes a JSONL snapshot of every touched document *before* any `_bulk_docs` POST; refuses to run without `--snapshot-to`.
- `--batch-size <N>` (default 500), `--max-docs <N>`, `--db-name <name>`.
- Credentials env-only: `COUCHDB_URL`, `COUCHDB_USER`, `COUCHDB_PASSWORD`, `THINX_PREFIX`. No repo-hardcoded credentials.

Per-document logic:

1. **Repair** — `timezone_offset` is `null`, `NaN` or missing: recompute from `timezone_utc` when present; else from the abbreviation when unambiguous; else `0`.
2. **Backfill** — `timezone_utc` missing and the abbreviation resolves unambiguously: set it.
3. **Report** — `timezone_utc` missing and the abbreviation is ambiguous or unrecognised: leave the document untouched and list it in the summary, grouped by owner, for re-pick in the console.

Idempotent: a second `--apply` run is a no-op.

---

## Testing

Helper tests (`Util.isValidTimezone`, `Util.timezoneOffsetFor`) are pure and run without CouchDB, Redis, InfluxDB or a config file — these carry the correctness argument, since the integration suite requires infrastructure that is not available in every environment.

Cases:

- A DST zone in summer and the same zone in winter (`Europe/Prague` → `2` / `1`), asserting the stale-offset problem is actually fixed rather than relocated.
- A negative offset (`America/New_York` → `-4` in DST), pinning the sign convention against the console's `timezones.js`, where `offset` is signed hours east of UTC.
- A non-DST zone (`Asia/Tokyo` → `9`).
- An abbreviation (`"CEST"`) → invalid, `null`, no server-local fallback.
- Non-string input (`null`, a number) → invalid, no throw. `momentTz().tz(null)` returns `undefined` and `momentTz().tz(123)` throws, both reachable from a registration payload.

Registration, edit and read behaviour go in jasmine specs alongside the existing timezone fixtures in `spec/jasmine/ZZ-RouterTransformerSpec.js:190-191`.

The migration script is exercised via `--scan` against a seeded test database before any `--apply`.

---

## What does NOT change

- Firmware, and the registration response payload.
- `timezone_abbr` remains on the document and in the API response as a display label.
- The CouchDB `modify` update handler.
- Existing `timezone` field values on stored documents.

---

## Files affected

| File | Change |
|---|---|
| `lib/thinx/util.js` | Add `isValidTimezone`, `timezoneOffsetFor` |
| `lib/thinx/device.js` | Registration: source zone from `timezone_utc`, drop the `isDST()` branch, stop writing `timezone`. Edit: validate zone, recompute offset |
| `lib/thinx/devices.js` | Derive `timezone_offset` in the device descriptor |
| `services/console/src/app/js/thinx-api.js` | Send `timezone_utc` in the `/device/edit` payload (submodule) |
| `scripts/backfill-device-timezone.js` | New migration script |
| `spec/jasmine/` | Helper unit tests + registration/edit/read coverage |

---

## Sequencing

1. Helpers + unit tests — self-contained, no behaviour change.
2. Write and read paths in the API.
3. Console one-liner (separate submodule commit).
4. Migration `--scan` against production data; review the ambiguous-document report.
5. Migration `--apply --snapshot-to`.

Steps 1-3 are safe to ship before the migration runs: a device with no `timezone_utc` falls back to its stored `timezone_offset`, which is exactly today's behaviour.

---

## Known issues found but not addressed

- **Swapped coordinates** at `lib/thinx/device.js:1099-1100`: `payload.latitude = device.lon` and `payload.longitude = device.lat`. These feed the defaults applied to `device.lon`/`device.lat` immediately below. Separate defect, separate ticket.
- **Unreachable intent** at `THiNXLib.cpp:1874`: firmware expects a `timezone_offset` the API has never sent. Prerequisite for any device-side DST support.
