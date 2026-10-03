---
phase: quick-261003-vd4
plan: 01
subsystem: device-api
status: complete
tags: [security, device-api, firmware, ownership, ott, tdd]

requires:
  - phase: quick-261003-s59
    provides: "APIKey#verify exact, constant-time, fail-closed; a failed firmware verify is final"
  - phase: quick-261003-t29
    provides: "Device.isOwnedBy / Device#fetchOwned"
  - phase: quick-261003-u86
    provides: "transfer redirect in firmware (firmware_owner swapped to the current owner before the lookup)"
  - phase: quick-261003-v9x
    provides: "Device#ott_request as firmware()'s OTT entry point"
provides:
  - "Device#firmware loads the device only through Device#fetchOwned(udid, firmware_owner); deploy, nid and OTT steps run only for the verified owner's own device"
  - "DeviceFirmwareOwnerSpec (10 local cases), three 261003-vd4 CI cases in ZZ-RouterDeviceAPISpec"
affects: [device-api, firmware-update, device-side ownership todo item 5]

actuals:
  tokens: 7131     # chars/4 over this plan's three commits (28525 chars of git show)
  tasks: 2
  commits: 3
plan_head_before: 8d6f6549a78ba6113d06f51aa9f9bc7171677d7e
plan_head_after: 561bc65e1b210bcd965567358113b9a75b9a7994

tech-stack:
  added: []
  patterns:
    - "Device-originated paths load the device through Device#fetchOwned with the verified owner before any downstream step"

key-files:
  created:
    - spec/jasmine/DeviceFirmwareOwnerSpec.js
  modified:
    - lib/thinx/device.js
    - spec/jasmine/ZZ-RouterDeviceAPISpec.js
    - .planning/todos/completed/2026-10-03-device-side-ownership-gaps.md (moved from pending/, uncommitted)

key-decisions:
  - "firmware() uses Device#fetchOwned(udid, firmware_owner) after the verify guard and u86's redirect swap; the refusal is the unchanged unknown-device answer (false, \"no_such_device\")"
  - "u86's transfer redirect in firmware is kept as landed (recorded under Rule consistency, not bent to the plan's 'no cross-owner fallback' wording)"

requirements-completed: [VD4-FIRMWARE-OWNER]

duration: ~5min
completed: 2026-10-03
---

# Quick 261003-vd4: firmware loads only the verified owner's device Summary

**`Device#firmware` now loads the device through `Device#fetchOwned(udid, firmware_owner)` right after the verify guard, so another owner's, an unknown, a malformed or an unreadable udid all answer the unchanged `no_such_device`. Another owner's document never reaches deployment, its `nid:` notification, its audit log or the OTT entry point.**

## Performance

- **Started:** 2026-10-03T22:31:21Z
- **Completed:** 2026-10-03T22:36Z
- **Tasks:** 2/2 (Task 1 tracer, Task 2 auto)
- **Files:** 3 code/spec files committed; todo and WINDOWS ledger left uncommitted

## Task Commits

| # | Hash | Message |
|---|------|---------|
| Task 1 RED | `ca43af7a` | test(quick-261003-vd4): failing spec for firmware owner binding |
| Task 1 GREEN | `151d799b` | fix(quick-261003-vd4): firmware loads only the verified owner's device |
| Task 2 | `561bc65e` | test(quick-261003-vd4): CI firmware owner-binding regressions |

`git rev-list --count 8d6f6549..HEAD` = 3. All three are unsigned (`git -c commit.gpgsign=false`, the operator's standing exception). `--no-verify` was never used. Nothing was pushed, and `services/console` was not staged.

## TDD evidence

- **RED** (spec only, `ca43af7a`, before any lib/ change): `10 specs, 5 failures`. The failing cases were exactly the planned ones, 2 (B half), 3, 4, 5 and 7, and all five failed on chai assertions:
  - (2) the body was A-envelope JSON (B's stale build) instead of `no_such_device`;
  - (3) the answer was `{success:false,status:"OK"}`;
  - (4) the forced request was served with `success === true`;
  - (5) there were 4 deployment calls;
  - (7) the malformed udid made 1 CouchDB get.
  Cases 1, 6, 8, 9 and 10 already passed.
- **GREEN** (after `151d799b`): `10 specs, 0 failures`.
- **Task 1 verify:** ApikeyExactMatch, DeviceFirmwareOwner, DeviceOwnership, DeviceRegisterOwner and TransferApiKey ran in one process: `155 specs, 0 failures`. Printed `VD4-FIRMWARE-GREEN`.
- **Tracer gate:** `<verify>` is automated-only. It was re-run end to end and passed before Task 2.
- **Full local battery** (one process, temp config with `helpers: []`, `ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y`): `610 specs, 0 failures`. The set was ApikeyExactMatch, BuildLogOwner, CsrfRouteInventory, DeviceFirmwareOwner, DeviceOwnership, DeviceRegisterOwner, MeshSessionAuth, Util, MessengerFailSafe, MessengerOwnership, MessengerOwnerSocket, DevicePushOwner, TransferApiKey, DeviceOtt, LogTailOwner, GoogleOAuthState, GitHubOAuthIsolation, SecretsSweep, LoggingQualityAudit, OwnerLogLeak and Sanitka, plus every non-ZZ spec added since `c9305716`, all of which were already in that list.
- **Task 2 verify:** every check passes except the last one, `git status --porcelain` on the todo is empty. That check fails by design, because the todo edits and the move are left for the orchestrator's docs commit (as in v9d and vbg). With that check left out it printed `VD4-CI-GREEN`.

## What changed

- `lib/thinx/device.js` `firmware()`: inside the `apikey.verify` callback, after three existing steps:
  1. the s59 guard;
  2. u86's `transfer_redirect` owner swap;
  3. the "Attempt to register device" audit line, which goes to `firmware_owner`'s log.

  After them, `devicelib.get(udid, (err, device) => { if (err) … })` became `this.fetchOwned(udid, firmware_owner, (owned, device) => { if (owned !== true) … })`. The refusal keeps the `[error] no such device` line and `callback(false, "no_such_device")`. Everything downstream is byte-identical.
- `spec/jasmine/DeviceFirmwareOwnerSpec.js` (new): cases 1-10 as planned. It uses the DeviceRegisterOwnerSpec harness: a require.cache swap of couch, audit and deployment, temp builds under `os.tmpdir()`, a Map-backed Redis stub that records get/set/del, a spy on `ott_request`, and e2e tests through `lib/router.deviceapi.js`.
- `spec/jasmine/ZZ-RouterDeviceAPISpec.js`: a `vd4Firmware(extra)` helper and three `(261003-vd4)` cases after "POST /device/firmware (jwt, invalid)":
  - (a) JRS6's own udid answers JSON with `success:false` and status `UPDATE_NOT_FOUND`/`OK`;
  - (b) `envi.udid`/`envi.mac` answers `no_such_device`;
  - (c) `d4d4d4d4-…-0000000000d4` answers `no_such_device`.

  No existing case changed.

## Step 0 findings

- **v9x OTT entry point:**
  - (a) firmware()'s OTT branch calls `Device#ott_request(req, callback)`, unchanged.
  - (b) A verified, owned request stores exactly `{owner, udid}` under `ott:<64-hex>` with `SET … EX 86400`. Case 10 pins that the record names OWNER_A and UDID_A.
  - (c) v9x handed nothing over to this task, so the call shape was not changed.
  - v9x's entry point refuses nothing that firmware()'s body always carries, so there was no conflict.
- **Rule consistency:**
  - **v9d** (addpush) uses the same rule as this task: the key must verify for the named owner with the 4-argument form, then `fetchOwned`, with no `lastkey` binding. It is consistent.
  - **u86 diverges from the plan's objective.** The objective said "There is no cross-owner fallback (u86 left continuity as a todo)". In fact u86 landed a transfer redirect on register and firmware. A key that moved with udid U by a transfer, presented with the previous owner id listed in the binding, verifies as U's current owner, and firmware swaps `firmware_owner` to that owner before the lookup. `fetchOwned(U, current owner)` therefore succeeds.
  - The accepted key set still matches the rule (the moved key lives in `ak:<doc.owner>`). Only the accepted body owner id is wider, and only for bound transfers.
  - addpush (v9d) and `ott_request` (v9x) do not redirect. A transferred device that sends a body `ott` with its previous owner id therefore passes firmware's redirect, then gets `OTT_API_KEY_NOT_VALID` from `ott_request`. This is v9x's documented behaviour, and no known firmware sends that.
  - I kept u86 as landed. DeviceRegisterOwnerSpec case 29 still passes. The operator should decide whether the redirect should also cover OTT and addpush, or neither.

## What changes for real users

1. **Another owner's udid.** A firmware request authenticated for owner B that names a udid owned by A (or by anyone but B) now answers `no_such_device`. Before, it was answered from A's device document: update or no-update, a forced or normal binary from B's stale deploy dir if one existed, or an OTT attempt. It could also delete A's done `nid:` notification and mkdir A's deploy dir. Realistic sources:
   - a device transferred before u86 that still carries the sender's owner id and key;
   - a cloned config image;
   - scripts.
2. **Malformed or missing udid.** The answer is the same `no_such_device` as before, without a CouchDB read.
3. **Unchanged.** A device's own udid under its own owner and key gets the same envelope and the same answer, and u86's transfer redirect still works.

Response shape: the answer to devices is unchanged. THiNXLib (ESP8266 pio/ino) never POSTs `/device/firmware`; it fetches the registration's `url`/`ott` by GET. The ESP32 checkout has no THiNXLib sources. DeviceSpec (07) already pins the plain body `no_such_device`.

## Post-deploy checks (operator, read-only)

- Run these on the node that hosts the `thinx_api` task. Placement floats, so query it first. Use node-local `docker logs`, not `docker service logs`.
- Compare the rate of `[error] no such device` lines next to `Responding to Firmware request`, before and after the deploy. A jump marks devices that used to be answered from another owner's document.
- The `Getting LFE descriptor` rate should stay roughly unchanged.

## Dead MAC fallback (observation, not changed)

firmware() has no `devices_by_mac` lookup. `rmac = firmwareUpdateDescriptor.mac || mac`, where `mac` is always `null`. So `rmac` is never `undefined`, and the `typeof (rmac) === "undefined"` `missing_mac` guard can never fire. The normalized `mac` is never used afterwards (`normalizedMAC(null)` returns null). After the fix, the envelope is always the verified owner's, for that owner's own udid. This code is pre-existing and out of scope.

## Todo outcome

All five items are resolved, each checked against its SUMMARY's `status: complete` and the todo's `Resolved … (quick 261003-<id>)` markers:

| Item | Resolved by |
|---|---|
| 1 | tv5 |
| 2 | v9d |
| 3 | v9x |
| 4 | vbg |
| 5 | vd4 |

The todo now marks item 5 resolved in three places: the frontmatter, Problem and Fix. It also carries `## Resolution — item 5 (quick 261003-vd4)`, closed by "All five items are resolved (tv5, v9d, v9x, vbg, vd4); moved to completed." I moved it to `.planning/todos/completed/2026-10-03-device-side-ownership-gaps.md` with a plain `mv`, not `git mv`, so nothing is staged.

**Uncommitted, for the orchestrator's docs commit:** the deletion of the pending path, the new completed path, `.planning/WINDOWS.md`, and this SUMMARY.

## Deviations from Plan

1. **[Stale plan / u86 landed] Case 9 CouchDB get count.**
   - The plan expected 0 CouchDB gets when the key does not verify for the body owner. Since u86, a failed verify with a valid udid runs `transferRedirect`, whose device context reads the udid's current owner: one get, inside `APIKey#verify`.
   - Case 9 now asserts two things. With no udid there are 0 gets. With A's udid there is exactly 1 get (verify's redirect lookup, no redirect because the current owner is the presented owner), plus 0 deployment calls and 0 OTT calls. firmware() itself never looks the device up before verify succeeds.
2. **[Orchestrator constraint] Todo not committed.**
   - Task 2 said to commit the ZZ spec together with the todo. The orchestrator forbids committing `.planning/todos/*`. So `561bc65e` holds only the ZZ spec, and its subject leaves out "; resolve device-side todo item 5".
   - The plan's `git mv` became a plain `mv`, so the index holds nothing. The Task 2 verify's final porcelain check fails until the docs commit lands.
3. **[Harness] InfluxConnector.statsLog stubbed** in the spec's beforeAll and restored in afterAll, because case 9's failed verify calls it. This keeps the spec offline. It does not change any assertion.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or trust boundary was added; the change narrows an existing one (T-vd4-01..05 mitigated as planned).

## Open questions for the operator

- Transfer-redirect coverage is inconsistent across device paths. Register and firmware redirect a bound previous owner id; OTT (v9x) and addpush (v9d) do not. Should OTT follow firmware?
- The ZZ cases are recorded as `unrun-verify` in `.planning/WINDOWS.md` (entry appended, uncommitted).

## Self-Check: PASSED

- FOUND: spec/jasmine/DeviceFirmwareOwnerSpec.js
- FOUND: lib/thinx/device.js contains `this.fetchOwned(udid, firmware_owner`
- FOUND: spec/jasmine/ZZ-RouterDeviceAPISpec.js contains three `261003-vd4` cases
- FOUND: .planning/todos/completed/2026-10-03-device-side-ownership-gaps.md (pending path absent)
- FOUND commits: ca43af7a, 151d799b, 561bc65e
