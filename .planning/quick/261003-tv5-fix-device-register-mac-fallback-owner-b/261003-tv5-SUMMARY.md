---
phase: quick-261003-tv5
plan: 01
subsystem: device-api
tags: [security, device-api, registration, ownership, mqtt, tdd]

requires:
  - phase: quick-261003-s59
    provides: "apikey.verify exact, constant-time match (registration_owner is the verified key owner)"
  - phase: quick-261003-t29
    provides: "Device.isOwnedBy strict-equality helper; device-side ownership todo"
provides:
  - "Device#resolveRegistration: owner-bound target resolution for POST /device/register (udid lookup, then devices_by_mac rows filtered by Device.isOwnedBy)"
  - "register re-points the new-device descriptor (udid, mqtt) at the resolved udid before authorize_mqtt"
  - "DeviceRegisterOwnerSpec (17 local cases, no Redis/CouchDB) and four 261003-tv5 CI cases in ZZ-RouterDeviceAPISpec"
affects: [device-api, mqtt-auth, firmware-registration, quick-261003-u86]

actuals:
  tokens: 14800      # chars/4 over the realized diff a2c98f7a..c9305716 (59067 chars)
  tasks: 2
  commits: 3
plan_head_before: a2c98f7a10d4ef526e3f545a007eac7a451ee870
plan_head_after: c9305716d768d2f005cf8b2d28e6b4df0e4e8e6e

tech-stack:
  added: []
  patterns:
    - "Owner-scoped fallback lookup: filter view rows in memory with Device.isOwnedBy instead of adding an owner+MAC view"
    - "Re-point a pre-built descriptor at the resolved id before any side effect (MQTT credential/ACL, insert)"
    - "Spec isolation: require.cache swap of couch/audit/deployment in one outer describe; afterEach quiescence wait for fire-and-forget Redis writes"

key-files:
  created:
    - spec/jasmine/DeviceRegisterOwnerSpec.js
  modified:
    - lib/thinx/device.js
    - spec/jasmine/ZZ-RouterDeviceAPISpec.js
    - .planning/todos/pending/2026-10-03-device-side-ownership-gaps.md

key-decisions:
  - "MAC fallback is owner-scoped: devices_by_mac rows filtered by Device.isOwnedBy(doc, verified key owner); first owned row in view order checks in, else a new device of the key owner"
  - "0d30f36f off-by-one restored: one same-owner MAC match reattaches again (pre-2022 semantics, owner-restricted)"
  - "Udid path: own -> check-in; 404 -> kept for the new device; foreign / lookup error / malformed / absent -> fresh uuidV1; then the owner-scoped MAC step"
  - "No new CouchDB view: _design/devices is inserted create-only at boot, so an owner+MAC view would never reach production; in-memory filter over MAC-collision rows is enough"
  - "authorize_mqtt stays before insert on the new-device branch (firmware MQTT connect timing); the udid it sees is now always owned, proven free or freshly minted"

patterns-established:
  - "resolveRegistration callback contract: exactly one call with {checkin: doc, via: 'udid'|'mac'} or {udid}"

requirements-completed: [T-t29-09]

coverage:
  - id: D1
    description: "Registration authenticated by owner B's key never checks in as, writes to, re-authorizes or returns owner A's device (MAC fallback or body udid); B gets its own device or a new one"
    requirement: T-t29-09
    verification:
      - kind: unit
        ref: "spec/jasmine/DeviceRegisterOwnerSpec.js#REG core (cases 2, 3, 5, 6, 9, 10, 11, 14)"
        status: pass
      - kind: e2e
        ref: "spec/jasmine/DeviceRegisterOwnerSpec.js#REG e2e: POST /device/register (cases 15-17)"
        status: pass
      - kind: integration
        ref: "spec/jasmine/ZZ-RouterDeviceAPISpec.js#261003-tv5 cases (CI, real CouchDB/Redis; runs after operator push)"
        status: unknown
    human_judgment: false
  - id: D2
    description: "Same-owner MAC registration reattaches instead of duplicating; own-udid check-in unchanged; 404 udid kept"
    requirement: T-t29-09
    verification:
      - kind: unit
        ref: "spec/jasmine/DeviceRegisterOwnerSpec.js#cases 1, 4, 7, 8, 12, 13"
        status: pass
    human_judgment: false
  - id: D3
    description: "Production behaviour after deploy matches the 'who is affected' list (log-rate comparison, no unexpected duplicates)"
    verification: []
    human_judgment: true
    rationale: "Requires the operator's post-deploy read-only checks on the swarm (node-local docker logs, console device list); not run by the executor"

duration: ~12min
completed: 2026-10-03
status: complete
---

# Quick 261003-tv5: Bind /device/register MAC fallback and udid to the verified key owner

**`Device#resolveRegistration` lets `POST /device/register` check in only as a device of the owner whose API key was verified. It looks up the udid first and then filters `devices_by_mac` rows with `Device.isOwnedBy`. A foreign, malformed or unverifiable udid is replaced by a fresh one. A single same-owner MAC match reattaches again, which fixes the 2022 off-by-one.**

Operator decision implemented: "/device/register, when it falls back to matching by MAC, should check in as a device of the api key's owner."

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-03T19:44Z (approx.; timer file written 19:49:19Z after context reads)
- **Completed:** 2026-10-03T19:55:46Z
- **Tasks:** 2/2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `register` now resolves its target only through `resolveRegistration(owner, requested_udid, mac, cb)`. It applies `Device.isOwnedBy` to the udid document and to every `devices_by_mac` row. The loose udid owner comparison and the more-than-one-row MAC check are gone.
- On the new-device branch, `device.udid`, `device.mqtt` and `reg.udid` are re-pointed at the resolved udid before `authorize_mqtt`. MQTT credentials and ACL topics are only ever written for an owned, proven-free (404) or freshly minted udid.
- There are 17 local regression cases with no Redis and no CouchDB, including e2e through the real `lib/router.deviceapi.js`. There are four CI cases against real CouchDB/Redis.
- Item 1 of the device-side ownership todo is resolved with a Resolution section. Items 2-5 stay open.

## Task Commits

1. **Task 1 RED: failing spec** - `48e7195e` (test). RED run: `17 specs, 12 failures`. Cases 1, 4, 10, 13 and 14 already passed, as the plan expected.
2. **Task 1 GREEN: resolveRegistration + register rewire** - `19156a8b` (fix)
3. **Task 2: CI regressions + todo item 1 resolved** - `c9305716` (test)

All three commits are unsigned (`git -c commit.gpgsign=false`), because GPG could not prompt (`cannot open '/dev/tty'`). This is the operator's standing exception. `--no-verify` was never used. Nothing was pushed or deployed.

## Verification

- RED (spec alone, before the lib change): `17 specs, 12 failures` (exit 3)
- Task 1 verify: `97 specs, 0 failures` (DeviceOwnershipSpec + DeviceRegisterOwnerSpec + ApikeyExactMatchSpec in one process), then `TV5-REGISTER-GREEN`
- Task 2 verify: `261 specs, 0 failures` (seven local specs in one process), then `TV5-CI-TODO-GREEN`
- ESLint and `node --check` are clean on `lib/thinx/device.js`, `spec/jasmine/DeviceRegisterOwnerSpec.js` and `spec/jasmine/ZZ-RouterDeviceAPISpec.js`
- Static: `Device.isOwnedBy(` occurs 4 times in device.js. Neither `rows.length > 1` nor `existing.owner == registration_owner` remains.
- The new log lines print only a count or the requested udid. In the local run: `MAC fallback ignored 1|2 device(s) of other owners` and `ignoring registration udid <requested>: not the key owner's device`.

## Files Created/Modified

- `spec/jasmine/DeviceRegisterOwnerSpec.js` (new): the local regression matrix. It uses a fake CouchDB (create-only insert, view rows in key/doc-id order), audit and deployment stubs swapped through `require.cache`, and a Map Redis stub that records `set` (MQTT credential) and `sAdd` (ACL). It also has an e2e describe on a bare express app.
- `lib/thinx/device.js`: adds `resolveRegistration`. `register` uses `requested_udid = sanitka.udid(reg.udid)` and re-points the descriptor at the resolved udid. The new-device code is unchanged apart from indentation (the whitespace-insensitive diff is +84/-40).
- `spec/jasmine/ZZ-RouterDeviceAPISpec.js`: four `261003-tv5` cases after "POST /device/register (jwt, valid) 6". No existing case changed.
- `.planning/todos/pending/2026-10-03-device-side-ownership-gaps.md`: item 1 is marked resolved in the frontmatter, Problem and Fix, and a `## Resolution — item 1 (quick 261003-tv5)` section was added. The todo stays in pending.

## Decisions Made

1. **MAC fallback is owner-scoped.** Rows of `devices_by_mac` (key = `normalizedMAC(reg.mac)`, the same as before) are filtered in memory with `Device.isOwnedBy(doc, registration_owner)`. Each row's `doc` is used, else its `value`. Rows whose udid fails `sanitka.udid` are dropped too. With at least one owned row, the registration checks in as the first in view order, which is deterministic because CouchDB orders equal keys by doc id. Otherwise it registers a new device of the key owner. Other owners' rows are only counted, in one info line.
2. **Udid path, same rule.** Only a valid body udid is looked up:
   - own document: check-in, as before
   - 404 (absent or revoked): kept as the new device's udid. DeviceSpec (02) depends on this, because it creates `envi.udid` this way.
   - another owner's document, a doc with no string owner, or any other lookup error: discarded, logged once naming only the requested udid, and replaced with a fresh `uuidV1()`
   - malformed or absent: a fresh `uuidV1()`

   The owner-scoped MAC step runs next in every non-check-in case.
3. **No new CouchDB view.** View audit:

   | View (`design/design_devices.json`) | Emits | Used by register |
   |---|---|---|
   | `devices_by_mac` | `(doc.mac, doc)` for docs with a truthy mac | MAC fallback; owner filter applied in memory (rows are bounded by MAC collisions, typically 0-2) |
   | `devices_by_owner` | `(doc.owner, doc)` | no. It would load every device of the owner on every no-udid registration |
   | `devices_by_udid` | `(doc.udid, doc)` | no. register reads by `_id` (`_id === udid`) |

   No owner+MAC view exists. Adding one would not reach production, because `lib/thinx/database.js` inserts `_design/devices` create-only at boot (only `_design/paging` is upserted). It would also rebuild every view in that design doc.
4. **MAC normalisation unchanged.** Lookup and storage both go through `normalizedMAC`. Spec case 8 covers lower-case and colon-less forms.
5. **Response for firmware.** A new device gets the existing new-device shape `{registration: {success, owner: <key owner>, alias, udid: <fresh or kept>, iv, status: "OK", meshes, timestamp}}`. A check-in gets the existing check-in shape with the owned device's udid. THiNXLib adopts `owner`, `alias` and `udid` on "OK".
6. **`authorize_mqtt` stays before `insert`** on the new-device branch, for firmware MQTT connect timing. The remaining get-404 → insert TOCTOU is accepted (T-tv5-07).

## Who is affected in production

- (a) A device that registers without its own known udid (first boot, factory reset, reflash without `thinx.json`, or a malformed/foreign udid), whose MAC appears on ≥2 documents where the first by doc id belongs to another owner. **Today:** it checks in as that other owner's device (MQTT takeover, document overwrite, foreign owner/udid in the response). **After:** it registers as a new device of its own key owner, or reattaches to its own owner's device with that MAC.
- (b) A device whose stored udid now belongs to another owner, for example after a transfer while it still carries the old owner's key, or a cloned config image. **Today:** "Insert failed", after overwriting that udid's MQTT password with its key. **After:** a new device of its key owner with a fresh udid, which it adopts.
- (c) A device of an owner that has exactly one device with the same MAC and presents no/absent/malformed/foreign udid. **Today:** a new duplicate device per such registration (since 2022). **After:** it reattaches to the existing device and keeps that device's udid, alias, source, mesh ids, transformers and environment. Boards with a factory-default or cloned MAC under one owner now collapse onto one record instead of creating a second one first.
- (d) A malformed body udid. **Today:** a document with `udid: null` and MQTT username "null". **After:** a fresh udid.
- (e) Unchanged: the steady-state check-in of a device presenting its own udid, which is the vast majority of traffic.

## Recommended operator checks (read-only; not run by the executor)

- Before push, optional estimate of who is affected:
  - On the node that runs the CouchDB task (placement floats: `docker service ps thinx_couchdb`), run a read-only query over the managed_devices database that groups device docs by `mac`.
  - Report counts only: MACs whose devices span more than one owner, and (owner, MAC) pairs with more than one device.
  - Those devices are cases (a) and (c) the next time one of them registers without its own udid.
- After deploy:
  - On the node running the `thinx_api` task, query placement and use node-local `docker logs`, not `docker service logs`, which is unreliable under load.
  - Over a few hours, compare against the pre-deploy rate:
    - `[register] ignoring registration udid`
    - `[register] MAC fallback ignored`
    - `Checking as existing device [2]`
    - `[DEVICE_NEW]`
  - A burst of `[DEVICE_NEW]` paired with "ignored" lines marks devices that used to land on another owner's record. Fewer `[DEVICE_NEW]` paired with more "[2]" lines marks duplicates that now reattach.
- In the console, a known device's "last connected" keeps advancing (steady-state udid check-in is unchanged), and an owner's device list shows no unexpected new duplicates.

## CI expectations that constrained the design

- DeviceSpec (02) registers JRS {mac "11:11:11:11:11:11", owner envi.oid, udid envi.udid} on a fresh DB and must create the device at `envi.udid`. The 404 → keep rule preserves this. (04) re-registers it: owned, so check-in. (10) expects `apikey_not_found`: verify runs before resolution, so it is unchanged.
- Every other registering spec uses a unique MAC once (DevicesSpec, MessengerSpec, XBuilderSpec, ZZ-RouterDeviceAPISpec 66:66…, ZZ-RouterDeviceSpec 55:55…, ZZ-RouterTransformerSpec 77:77…; the t29 specs use random MACs). The restored "one match reattaches" therefore changes no existing CI outcome. JRS2 has a null MAC, so the view finds nothing.
- The new ZZ cleanup revoke removes the tv5 device, so ZZ-RouterDeviceSpec's `dynamic_devices` list sees no extra dynamic device.
- CI has not run yet. It runs when the operator pushes thinx-staging.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in the spec harness] Cross-test spill of fire-and-forget MQTT writes**
- **Found during:** Task 1 RED run
- **Issue:** On the unfixed code, `authorize_mqtt` from a failing case (case 9's hijack of UDID_A, and case 5's `null` udid ACL commit throwing `callback is not a function`) landed during the next case. That failed case 10, which the plan expects to pass on the old code.
- **Fix:** Added an `afterEach` quiescence wait. It polls until no credential, ACL or couch write has been recorded for 200 ms, up to 3000 ms. The RED result then matched the plan exactly: cases 1, 4, 10, 13 and 14 pass, 12 fail.
- **Files modified:** spec/jasmine/DeviceRegisterOwnerSpec.js (before the RED commit)
- **Commit:** 48e7195e

**2. [Rule 2 - Harness hygiene] Offline API-key audit in the spec**
- **Issue:** `APIKey` binds its audit log at require time, before the cache swap. Case 14 (rejected key) would otherwise try to reach CouchDB.
- **Fix:** The spec sets `device.apikey.alog = new AuditStub()` on its own instance. No lib change.
- **Commit:** 48e7195e

**3. [Rule 2 - Defensive] `resolveRegistration` re-validates its udid argument**
- The plan says "when `requested_udid` is null". The method uses `sanitka.udid(requested_udid) === null` instead, so a direct caller passing an unsanitised value can never reach `devicelib.get`. Behaviour through `register` is identical.
- **Commit:** 19156a8b

**4. Todo Resolution commit reference**
- The Task 2 commit hash cannot appear inside the file that commit adds, so the Resolution names that commit by its subject. Its hash is `c9305716`.

Total: 4 small deviations, none of them architectural.

## Residual risk (T-tv5-08) and todo change

- Cross-owner check-ins before the fix are not reverted. Another owner's key may still be the MQTT password of a victim udid until that device registers again with its own key, which re-authorizes it. The victim document's check-in fields (version, firmware, status, push token, location) were overwritten by the foreign registration.
- Devices that adopted another owner's id from a hijacked response already fail key verification on every registration. That is not caused or fixed here; they need their `thinx.json` owner/key corrected.
- Todo `.planning/todos/pending/2026-10-03-device-side-ownership-gaps.md`: item 1 is resolved. Items 2-5 (`/device/addpush`, `ott_request`, `updateAndTransformDeviceStatus`, firmware compare) stay open (T-tv5-09 transferred).

## Out-of-scope pre-existing oddities in `register` (observed, not fixed)

- The `no_mac` guard is unreachable (`normalizedMAC` returns null, never undefined) and calls back with two arguments instead of `(res, success, response)`.
- The SigFox `ack` new-device branch sets `callback = null` and later calls it in the insert callback.
- Dash-separated 17-character MACs are upper-cased but keep their dashes, so they never match the colon form.
- Also seen while testing the old code: `ACL.commit_redis` calls an undefined callback when the ACL user is null (`TypeError: callback is not a function`). The fix no longer reaches it from register, because the udid is never null now.

## Threat Flags

None. No new endpoint, auth path or schema. The change narrows an existing trust boundary (device firmware → register).

## Known Stubs

None.

## Next Phase Readiness

- Quick 261003-u86 (transfer carries its API key) can execute next. `lib/thinx/transfer.js` and `lib/thinx/apikey.js` were not touched.
- STATE.md, ROADMAP.md and PLAN.md were not modified or committed. The orchestrator owns the docs commit.

## Self-Check: PASSED

- FOUND: spec/jasmine/DeviceRegisterOwnerSpec.js
- FOUND: lib/thinx/device.js (resolveRegistration)
- FOUND: spec/jasmine/ZZ-RouterDeviceAPISpec.js (4 × 261003-tv5)
- FOUND: .planning/todos/pending/2026-10-03-device-side-ownership-gaps.md (## Resolution)
- FOUND commits: 48e7195e, 19156a8b, c9305716
