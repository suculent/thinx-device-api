---
phase: quick-261004-l7q
plan: 01
subsystem: api
tags: [security, transfer, consent, revoke, device-api, tdd, jasmine]
status: complete

requires:
  - phase: quick-261003-t29
    provides: "Device#fetchOwned / #filterOwned; transfers move only devices the sender owns"
  - phase: quick-261003-u86
    provides: "device API key moves with the device (EVAL compare-and-swap) with a transfer binding"
provides:
  - "Transfer.boundToCaller: POST accept/decline proceed only for the session owner equal to sha256(prefix + record.to); others get the exact unknown-transfer answer"
  - "Opaque transfer request answer (\"transfer_requested\"); the transfer id travels only in the recipient's e-mail"
  - "No console or audit line carries a transfer id"
  - "Devices#revoke_devices removes every named device, exact udid match"
  - "Partial accept/decline shrink the stored udid array; partial transfers complete; decline answers once"
  - "mig_sources accept answers (no ReferenceError) and never writes the sender's user document"
  - "TransferRecipientSpec: 27 local specs (no Redis/CouchDB)"
affects: [transfer, device-api, owner-purge, console]

actuals:
  tokens: 17100    # chars/4 over the realized diff c976ff20..656d3d3b (68399 chars)
  tasks: 3
  commits: 3
plan_head_before: c976ff20c5b3ba66541c82e67733957f0245fc87
plan_head_after: 656d3d3bb4112854c8b2ec50a7247d07936ab61b

tech-stack:
  added: []
  patterns:
    - "Optional trailing caller-owner argument on a library entry point: undefined = capability link (GET), anything else must match the stored recipient"
    - "Refusal answers byte-identical to not-found, decided before any write or id-bearing log line"

key-files:
  created:
    - spec/jasmine/TransferRecipientSpec.js
  modified:
    - lib/router.transfer.js
    - lib/thinx/transfer.js
    - lib/thinx/devices.js
    - spec/jasmine/DeviceOwnershipSpec.js
    - spec/jasmine/TransferApiKeySpec.js
    - spec/jasmine/TransferSpec.js
    - spec/jasmine/ZZ-RouterTransferSpec.js
    - .planning/todos/pending/2026-10-03-transfer-accept-not-bound-to-recipient.md
    - .planning/todos/pending/2026-10-03-transfer-continuity-leftovers.md
    - .planning/WINDOWS.md

key-decisions:
  - "Binding owner = Util.ownerFromRequest(req) (session, Bearer bridge or router-verified API key), never body.owner; a null owner is refused"
  - "Unknown-transfer answers reused verbatim: accept 200 {success:false, transfer_id_not_found}; decline 200 {success:true, decline_complete_no_such_dtid}"
  - "GET e-mail links stay unbound (the transfer id is the capability)"
  - "request() answers \"transfer_requested\"; the id is a third callback argument for in-process callers only (no router forwards it). Neither console reads the old answer"
  - "Transfer ids removed from accept/decline console and audit lines (the sender's audit log used to show the id, which would have let the sender use the GET link)"
  - "mig_sources: move_source writes only the recipient's document (copy semantics, as request()'s comment states); refuses without writing when the source is absent"
  - "Partial threshold: any udid left keeps the transfer pending (was > 1); a refused accept persists already-moved devices off the list"

requirements-completed: []

duration: 14min
completed: 2026-10-04
---

# Quick 261004-l7q: Transfer accept/decline bound to the recipient Summary

**Only the transfer's recipient can accept or decline a transfer through the POST routes now. The session owner must equal `sha256(prefix + record.to)`. The sender and any third party get exactly the unknown-transfer answer, nothing changes, and nothing is logged with the transfer id. The sender's request answer no longer carries the id, so only the recipient's e-mail links hold it. The same change fixes four functional bugs: multi-device revoke, partial transfers that never completed, the `mig_sources` ReferenceError, and decline answering twice.**

## Performance

- **Duration:** about 14 min (2026-10-04T13:23:05Z to 13:36:54Z)
- **Tasks:** 3 of 3
- **Files modified:** 8 code/spec files, plus 2 todos and the WINDOWS ledger (all three uncommitted)

## Task Commits

1. **Task 1 (RED):** `d4c70ce7` `test(quick-261004-l7q): failing spec for recipient-bound transfer accept/decline and transfer bugs`. Spec file only.
2. **Task 2:** `2d78df6d` `fix(quick-261004-l7q): bind POST transfer accept/decline to the recipient`
3. **Task 3:** `656d3d3b` `fix(quick-261004-l7q): revoke all named devices; partial transfers complete; mig_sources answers`

All three commits are unsigned (`git -c commit.gpgsign=false`, the operator's standing exception). `--no-verify` was not used, and nothing was pushed.

## Console check (transfer_id)

`grep` over `services/console/src/app/js` and `services/console/vue/src`:
- The classic `DevicesController.transferDevices` reads only `transferDeviceResponse.success`.
- Vue `Devices.vue#transfer` and `DeviceDetail.vue#transferDevice` read only `result.success` and `result.message`.
- Neither console calls accept or decline. Those are reached only through the e-mail links.

Since no console reads the id, it was dropped from the answer, as the plan allowed.

## Verification evidence

- **RED** (`d4c70ce7`, run before any `lib/` change): TransferRecipientSpec ran `26 specs, 23 failures`.
  - Most failures are chai assertions on the target behaviour.
  - The rest are the targeted bugs surfacing as uncaught exceptions: `ERR_HTTP_HEADERS_SENT` from decline's double answer, and `ReferenceError: device is not defined` from `mig_sources`.
  - 3 specs already passed: the session harness, the GET accept link, and single-udid revoke. These are regression pins.
- **After Task 2:** `26 specs, 10 failures`. All 10 are Task 3 items.
- **After Task 3:** TransferRecipientSpec `27 specs, 0 failures`. One case was added in Task 3: a refused accept keeps the moved device off the list.
- **Regression set** (run once before and once after, in one process, temp config `helpers: []`, `ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y`). The set: TransferApiKey, DeviceOwnership, DeviceRegisterOwner, DeviceFirmwareOwner, DeviceOtt, DevicePushOwner, ApikeyExactMatch, ApikeyExposure, OwnerDefaultMqttKey, CsrfRouteInventory, MeshSessionAuth, MessengerDropLimiter, MessengerDeviceWrites, MessengerFailSafe, MessengerOwnership, MessengerOwnerSocket, BuilderApiKey, GoogleOAuthState, GitHubOAuthIsolation, Util, SecretsSweep, LoggingQualityAudit, OwnerLogLeak, Sanitka.
  - Baseline before any change: `727 specs, 0 failures`.
  - Final, with TransferRecipientSpec included: `754 specs, 0 failures` (727 + 27).
  - Right after the binding change, the set showed 19 failures: 18 in TransferApiKeySpec and 1 in DeviceOwnershipSpec. All of them read the transfer id from the request answer. Both specs were updated in the Task 2 commit.
- **ESLint** is clean on all 8 changed JS files.
- **Not run locally:**
  - `TransferSpec (00)` needs real Redis and CouchDB. It runs in CI.
  - The `ZZ-RouterTransferSpec` edits need the same, and ZZ specs are deleted before CI. Recorded as WINDOWS entry 12 (`unrun-verify`).

## What changes for users

- POST accept/decline from anyone except the recipient now gets the unknown-transfer answer. In production that is the redirect `error.html?success=failed&reason=transfer_id_not_found` for accept, and `success=true` for decline, the same as for a nonexistent transfer.
- The transfer request answer is `{"success":true,"response":"transfer_requested"}`. Before, it was the transfer uuid.
- Audit log lines for accept/decline no longer include the transfer id. They read "Accepting device transfer for devices [...]" and "Declining device transfer for devices: [...]".
- Revoke with several udids now deletes all of them; before, it deleted only the last match. The answer is still `async_progress`. `owner_purge` revokes with a udid list, so a purge now removes every device of the owner. Before, it removed one.
- Partial accept/decline work:
  - A two-device transfer can be accepted or declined one device at a time.
  - It completes when the list is empty.
  - Before this fix, the stored list never shrank. A multi-device transfer stayed "partially completed" until the record expired.
- Decline answers once. Before, the GET decline link threw "headers already sent".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Partial threshold was `> 1`.**
- **Found during:** Task 3
- **Issue:** `save_dtid` and `storeRemainingKeys` treated one remaining udid as "completed" and deleted the record. Once removal worked, the last remaining device of a partial transfer could never be accepted.
- **Fix:** the threshold is now `> 0`.
- **Commit:** `656d3d3b`

**2. [Rule 1 - Bug] Decline answered twice.**
- **Found during:** Task 1. The recipient POST decline and the GET decline link crash over HTTP with `ERR_HTTP_HEADERS_SENT`.
- **Fix:** the trailing `callback(true, "decline_completed")` is removed, so `storeRemainingKeys` gives the single answer, as it did before as the first answer. This resolves leftovers todo item 6.
- **Commit:** `656d3d3b`

**3. [Rule 2 - Correctness/Security] `move_source` wrote the recipient's whole `sources` map into the sender's document.**
- **Issue:** fixing the ReferenceError would have made this reachable. The code also threw a TypeError when either map was missing, and never called back on success, so `attach_source` never ran.
- **Fix:**
  - It writes only the recipient's document, which gives copy semantics, as `request()`'s comment says.
  - It refuses without writing when the usid or the sender's map is missing.
  - It calls back after the write.
  - `attach_source`'s callback now uses the `(res, success, response)` signature that `Devices#attach` actually calls.
- **Commit:** `656d3d3b`

**4. [Rule 2 - Correctness] A refused accept now keeps already-moved devices off the stored list.**
- **Issue:** without this, a mixed accept (device 1 moved, device 2 refused) left device 1 in the list. Device 1 would then be skipped forever as "not owned by the originator", so the transfer could never complete.
- **Fix:** the remaining list is persisted with the same 3600 s expiry as a partial accept. Pinned by a spec case.
- **Commit:** `656d3d3b`

**5. [Rule 2 - Security] Transfer ids removed from accept/decline console and audit lines.**
- **Issue:** the sender's audit log received "Accepting/Declining device transfer <id>". On a partial transfer, that would hand the sender the capability for the GET link, which is unbound.
- **Commit:** `2d78df6d`

**6. [Rule 3 - Blocking] Existing specs read the id from the request answer.**
- **Fix:**
  - TransferApiKeySpec's `request()` helper uses the third argument.
  - DeviceOwnershipSpec's "own request is stored" case reads the stored record.
  - TransferSpec (00) uses the third argument.
  - ZZ-RouterTransferSpec reads the id from Redis. The sender's POST accept/decline are pinned as unknown-transfer, and accept III goes through the recipient's GET link. The t29 "udid outside the transfer" ZZ case is replaced, because the sender's session is now refused before the udid filter. That refusal is still pinned locally in DeviceOwnershipSpec.
- **Commit:** `2d78df6d`. The stale ZZ comment was fixed in `656d3d3b`.

**Total deviations:** 6 auto-fixed (2 bugs, 3 correctness/security, 1 blocking spec update). No architectural change.

## TDD Gate Compliance

The RED commit `d4c70ce7` touches only `spec/jasmine/TransferRecipientSpec.js`, and it precedes both fix commits. Its failures are assertion failures, plus the two targeted bugs surfacing as uncaught exceptions. There were no load or harness crashes.

## Open questions

1. **`mig_sources` is effectively a no-op.**
   - Source repositories live in the user document's `repos` field. `move_source` reads the legacy `sources` field, so it answers `source_not_found` for current accounts.
   - The flag is read from the *accept* body. The GET link never sets it, and the console's `mig_sources` checkbox only goes into the request record.
   - Making it work, by reading `repos` and the stored request flag, is a feature decision.
2. **POST decline ignores `body.udids`.** The route requires `udids` but passes only `sanitka.udid(body.udid)`. Without `udid` it declines the whole transfer. This is unchanged. Should it honour `udids` like accept does?
3. **`exit_on_transfer` is not fixed (out of scope).**
   - It is still inverted, racy and keyed by array index. `store_pending_transfer` also writes `dtr:0`, `dtr:1` and so on.
   - Tracked in `2026-09-29-resolve-legacy-fixmes-owner-transfer.md` item 3. The recipient todo stays in pending for this item only.
4. **A device the originator no longer owns is skipped but stays in the stored list.** This is unchanged t29 behaviour. Such a transfer stays partially pending until it expires.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or trust boundary. The binding narrows an existing one.

## Todos

- `2026-10-03-transfer-accept-not-bound-to-recipient.md`: a Resolution section was added. It stays in `pending/` because the `exit_on_transfer` item is open.
- `2026-10-03-transfer-continuity-leftovers.md`: item 6 is marked resolved.
- WINDOWS entry 12 (`unrun-verify`, ZZ-RouterTransferSpec plus TransferSpec 00).

None of these is committed. The orchestrator owns the docs commit.

## Next Phase Readiness

- After the push, watch CI on TransferSpec (00) and the rest of the jasmine run.
- After deploy:
  1. Send a transfer between two accounts. Confirm the request toast or message still appears.
  2. Accept it through the e-mail link and confirm the device and its key move.
  3. Try a POST accept with the sender's session and confirm it answers `transfer_id_not_found`.

## Self-Check: PASSED

- FOUND: spec/jasmine/TransferRecipientSpec.js, lib/thinx/transfer.js, lib/router.transfer.js, lib/thinx/devices.js
- FOUND commits: d4c70ce7, 2d78df6d, 656d3d3b (`git rev-list --count c976ff20..HEAD` = 3)
