---
phase: quick-261003-v9d
plan: 01
subsystem: device-api
status: complete
tags: [security, device-api, addpush, apikey, ownership, tdd]
requirements: [T-tv5-09]
requires:
  - quick-261003-s59 (exact APIKey#verify)
  - quick-261003-t29 (Device.isOwnedBy, Device#fetchOwned)
  - quick-261003-tv5 (register rule, DeviceRegisterOwnerSpec harness)
provides:
  - Owner-bound POST /device/addpush (Device#push)
  - spec/jasmine/DevicePushOwnerSpec.js (local, runs in CI)
affects:
  - lib/thinx/device.js push
  - lib/router.deviceapi.js addpush comment
  - thinx-api-openapi.yaml /device/addpush
tech-stack:
  added: []
  patterns:
    - "require.cache swap of couch/audit/deployment + fresh device.js (DeviceRegisterOwnerSpec pattern)"
key-files:
  created:
    - spec/jasmine/DevicePushOwnerSpec.js
  modified:
    - lib/thinx/device.js
    - lib/router.deviceapi.js
    - spec/jasmine/ZZ-RouterDeviceAPISpec.js
    - thinx-api-openapi.yaml
    - .planning/todos/pending/2026-10-03-device-side-ownership-gaps.md (uncommitted, docs)
    - .planning/WINDOWS.md (uncommitted, docs)
decisions:
  - "addpush requires a top-level body `owner`; the key must verify for it (4-argument APIKey#verify) and the udid must be that owner's device (Device#fetchOwned); only `push` is written"
  - "Refusals: authentication (key/owner, before any lookup), push_device_not_found (malformed/unknown/foreign udid, lookup error, identical), push_token_not_registered (write failed)"
  - "No lastkey binding on addpush (same as check-in); addpush never writes lastkey"
  - "No u86 transfer continuity on addpush (no device context): a previous owner named after a transfer is refused"
metrics:
  duration: 6min
  completed: 2026-10-03
estimate:
  tokens: 80000
  tasks: 2
actuals:
  tokens: 12100
  tasks: 2
  commits: 3
plan_head_before: 39db09f1cd1def355eb4e721dd75092167b85799
plan_head_after: 81cc0fb671e519b66c5a418f6ffe24f4d4527403
---

# Phase quick-261003-v9d Plan 01: /device/addpush key check Summary

`POST /device/addpush` now writes a push token only when the body names an owner, the Authentication key verifies exactly for that owner (4-argument `APIKey#verify`), and the udid is that owner's device (`Device#fetchOwned`). Only `push` is written. Unknown and foreign udids get the same answer, and the push token, key and body no longer appear in logs.

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 (RED) | `1b0fa6bc` | test(quick-261003-v9d): failing spec for /device/addpush owner-bound push token |
| 1 (GREEN) | `25a4ecfd` | fix(quick-261003-v9d): /device/addpush writes the push token only for the verified owner's device |
| 2 | `81cc0fb6` | test(quick-261003-v9d): CI addpush owner regressions; OpenAPI addpush contract |

The todo and WINDOWS.md edits are uncommitted docs, left for the orchestrator's docs commit.

## What changed

- **`Device#push` (`lib/thinx/device.js`)** runs these steps in order:
  1. Guards: a non-object reg answers `no_push_info`. An absent or empty key answers `authentication`. A non-string push answers `invalid_type_*`.
  2. The log line that printed the whole body is replaced. It now prints `• Push Registration for udid <sanitized udid|invalid>`.
  3. Owner check: an absent, null, non-string or `sanitka.owner`-invalid owner answers `authentication`. The type is checked before `sanitka.owner` is called, because that function throws on non-strings.
  4. `this.apikey.verify(owner, key, true, cb)` is called with exactly 4 arguments. Anything other than `success === true` answers `authentication`.
  5. Udid check: a `sanitka.udid` null answers `push_device_not_found` with no lookup.
  6. `this.fetchOwned(udid, owner)`: not owned answers `push_device_not_found`.
  7. `this.edit({udid, push})`: a failed write answers `push_token_not_registered`, otherwise `push_token_registered`.
  - Each refusal logs `[push] refused <category> for udid <udid|invalid>` and nothing else.
- **`lib/router.deviceapi.js`**: only the comment above `app.post("/device/addpush", …)` changed. The route line and the handler are unchanged, and `CsrfRouteInventorySpec` stays green.
- **`ZZ-RouterDeviceAPISpec.js`**: six `(261003-v9d)` cases added after "POST /device/addpush (jwt, valid)". No existing case was changed.
- **`thinx-api-openapi.yaml`**: `/device/addpush` now requires `push`, `udid` and `owner`. The 200 response documents `success`/`response` and the refusal answers. The 403 is described as a missing or malformed Authentication header.
- **Todo** `2026-10-03-device-side-ownership-gaps.md`:
  - Item 2 is marked resolved in the frontmatter, Problem and Fix sections.
  - The section `## Resolution — item 2 (quick 261003-v9d)` was appended.
  - The file stays in pending because items 4 and 5 are still open.
  - Items 3-5 and the tv5/v9x Resolution sections were not touched.

## Firmware/client evidence (from the plan)

- The router is the only server caller of `device.push`. A repo-wide grep finds `addpush` only in the router, the ZZ spec, the `docs/APIs.md` comment list and the OpenAPI file.
- THiNXLib does not call addpush in any of its copies (esp8266-ino, esp8266-pio, the test_repositories submodule). They only POST `/device/register` and GET `/device/firmware?ott=`. The esp32 submodule directory is empty in this checkout.
- A public GitHub search for `"device/addpush"` finds only this server and its mirror.
- Nothing in the server reads `device.push`; the FCM loop in notifier.js is commented out.
- So no client names an owner today. **Owner-field decision:** a top-level `owner`, the same name as THiNXLib's `registration.owner` and `device.firmware`'s body owner.

## Decisions

- **Answers.**
  - `authentication` is decided before any device lookup and depends only on (owner, key). Verify's internal messages are collapsed into it.
  - `push_device_not_found` is byte-identical for malformed, unknown and foreign udids and for lookup errors. Unknown and foreign udids do the same work: one verify and one get. The route is therefore not a udid-existence oracle.
- **No lastkey binding.** Any key of the owner, or its hash, is accepted, as on check-in. addpush never writes `lastkey`.
- **No transfer continuity.** Verify is called with 4 arguments and no device context. A previous owner named after a transfer gets `authentication`, and the binding is never touched (P19).

## TDD record

- **RED** (`1b0fa6bc`, unfixed code): DevicePushOwnerSpec ran **19 specs, 13 failures**. All 13 are chai `AssertionError`s; there were no load or harness errors.
  - Passing on old code, as the plan predicted: P1, P2, P4, P14, P16, P17.
  - Failing: P3, P5, P6, P7, P8, P9, P10, P11, P12, P13, P15, P18, P19.
- **GREEN** (`25a4ecfd`): 19 specs, 0 failures.

## Verification run

- Task 1 automated verify printed **V9D-PUSH-GREEN**:
  - DevicePushOwnerSpec alone: 19 specs, 0 failures.
  - ApikeyExactMatch + DeviceOwnership + DevicePushOwner + DeviceRegisterOwner in one process: 128 specs, 0 failures.
  - TDD ancestry checks, static checks on `push()` (verify, fetchOwned, no `JSON.stringify(reg)`, no `deviceKeyContext`), `node --check` and ESLint all passed.
- Task 2 battery, all 9 files in one process (ApikeyExactMatch, BuildLogOwner, CsrfRouteInventory, DeviceOwnership, DevicePushOwner, DeviceRegisterOwner, MeshSessionAuth, TransferApiKey, Util): **328 specs, 0 failures**.
  - The ZZ count, OpenAPI YAML schema and todo checks all passed.
  - ESLint and `node --check` passed on the ZZ spec.
  - The verify's final check (`git diff --quiet HEAD` on the todo) does not pass by design. The todo is left uncommitted per the orchestrator constraint; see Deviations.
- Extra local run: DeviceOtt, LoggingQualityAudit, OwnerLogLeak, Sanitka, LogTailOwner, DevicePushOwner, PrivacyPolicyConsistency, EventTaxonomy, MetricsCoverage: **171 specs, 0 failures**.
- **Not run:** the six ZZ cases. They need real CouchDB, Redis and the booted app, and docker-entrypoint.sh deletes ZZ specs before the CI run, so they do **not** run in CI either. They are logged in `.planning/WINDOWS.md` as `unrun-verify` (quick-261003-v9d). The CI-enforced protection is DevicePushOwnerSpec.

## Who is affected in production

- (a) A caller writing the push token of a device its key owner does not own is now refused. No delivery changes, because nothing consumes the field.
- (b) A caller that names no owner gets `authentication`. Every request shape documented or tested so far is like this, but no known client exists. A new client must add `owner`.
- (c) The owner's key plus `owner` plus its own udid still succeeds. A failed write now answers `push_token_not_registered`.
- Unchanged: the 403 for a missing or malformed Authentication header, plus `no_body`, `no_token` and `invalid_type_*`. The existing ZZ case "(jwt, valid)" still gets 200; its body is now `authentication` where it used to write cimrman's token.

**Operator read-only checks** (on the node running `thinx_api`, using node-local `docker logs`; report counts only and never print matching lines):
- Pre-deploy: count `• Push Registration` lines, and among them lines containing `"owner":`.
- Post-deploy: count `[push] refused` lines.

## Deviations from Plan

1. **[Orchestrator constraint] The todo file is not committed.** Task 2 said to commit the ZZ spec, the OpenAPI file and the todo together. The orchestrator says not to commit todos, so commit `81cc0fb6` holds only the ZZ spec and OpenAPI, and its subject leaves out "; resolve device-side todo item 2". The todo edits are uncommitted for the docs commit. As a result, the `git diff --quiet HEAD -- "$T"` part of the Task 2 verify does not pass until that docs commit lands.
2. **[Plan premise correction, no behaviour change] u86 as landed never consumes the transfer binding.** u86 operator decision 3: the binding ends only on revoke, purge or the next transfer. The plan's reason for the 4-argument verify was "a push-token call would consume the binding", which does not apply. The decision itself stands: no firmware calls addpush, and v9x's OTT path also uses the 4-argument form. P19 checks that the store is byte-identical either way. This is recorded in the todo Resolution.
3. **Minor ordering.** `sanitka.udid(reg.udid)` is computed once at the top so the log label is available to every refusal line. It does no I/O; its only side effect is sanitka's own warning for an invalid udid, which prints the udid input and never a key or token. No lookup happens before verify.

No other deviations. No packages were installed.

## Known Stubs

None.

## Open questions

None blocking. One for the operator: if a private mobile client calls addpush without `owner`, it will now get `authentication`. The pre-deploy `• Push Registration` count would show whether any such caller exists.

## Self-Check: PASSED

- FOUND: spec/jasmine/DevicePushOwnerSpec.js
- FOUND commits: 1b0fa6bc, 25a4ecfd, 81cc0fb6
- FOUND: `## Resolution — item 2 (quick 261003-v9d)` in the pending todo
