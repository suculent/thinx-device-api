---
phase: quick-261003-v9x
plan: 01
subsystem: device-api
status: complete
tags: [security, device-api, ota, ott, ownership, redis, tdd]

requires:
  - phase: quick-261003-s59
    provides: "APIKey#verify exact, constant-time, fail-closed"
  - phase: quick-261003-t29
    provides: "Device.isOwnedBy / Device#fetchOwned"
  - phase: quick-261003-tv5
    provides: "register MAC fallback bound to the key owner (made the traversal-udid check-in reachable)"
  - phase: quick-261003-u86
    provides: "verify's optional device context (deliberately not used here)"
provides:
  - "Device#storeOTT(binding): exactly {owner, udid}, 32 random bytes, one SET EX 86400, OTT_BINDING_INVALID / OTT_STORE_FAILED"
  - "Device#ott_request: body owner + exact 4-argument verify + Device#fetchOwned, the v9d rule"
  - "Device#ott_update: token format gate before Redis, record re-validation and ownership re-check, delete on refusal, TTL capped at 3600 s after first redemption and never extended"
  - "register FIRMWARE_UPDATE branch binds the token to the checked-in device (closes a live cross-owner firmware read)"
  - "Firmware routes log only a redacted token / a boolean"
  - "DeviceOttSpec (34 local cases), five 261003-v9x CI cases in ZZ-RouterDeviceAPISpec"
affects: [device-api, ota, firmware-registration, quick-261003-v9d]

actuals:
  tokens: 17261    # chars/4 over this plan's four commits (69047 chars of git show)
  tasks: 2
  commits: 5
plan_head_before: e985b172e496e4ed7e6c35ac1e61efd1a196094c
plan_head_after: 6c0ae6b2ef5015aa7cc7f0009268e91d4fc53c22

tech-stack:
  added: []
  patterns:
    - "Bearer-token records hold only verified identifiers ({owner, udid}); redemption re-validates and re-checks ownership before any filesystem path is built"
    - "Token lifetime only ever lowered (TTL-then-EXPIRE), in one place"
    - "Spec harness: deployment stub rooted in a tmp dir that concatenates <root>/<owner>/<udid> like Filez, so a traversal udid really reaches another owner's fixture on unfixed code"

key-files:
  created:
    - spec/jasmine/DeviceOttSpec.js
    - .planning/todos/pending/2026-10-03-ott-redemption-serves-json-not-binary.md
  modified:
    - lib/thinx/device.js
    - lib/router.deviceapi.js
    - spec/jasmine/ZZ-RouterDeviceAPISpec.js
    - .planning/todos/pending/2026-10-03-device-side-ownership-gaps.md

key-decisions:
  - "OTT issuance uses the device-request rule of check-in and v9d: exact APIKey#verify (4 arguments, no u86 redirect) for the body owner, then Device#fetchOwned; no lastkey binding"
  - "Stored OTT record is exactly {owner, udid}; pre-deploy full-body records are honoured only when owner/udid are valid and owned"
  - "Tokens: 32 random bytes, SET EX 86400, ≤3600 s after first redemption, never extended; not strict one-time because THiNXLib retries the same URL"
  - "The GET redemption serialization line (Util.responder since fee22323) is left unchanged for an operator decision (new todo)"

requirements-completed: [T-tv5-09, V9X-OTT-OWNER]

coverage:
  - id: D1
    description: "OTT issuance only for the exact key of the body owner on a device that owner owns; record exactly {owner, udid}; random token; one SET EX 86400"
    requirement: V9X-OTT-OWNER
    verification:
      - kind: unit
        ref: "spec/jasmine/DeviceOttSpec.js#OTT core: issuance (I1-I11)"
        status: pass
      - kind: e2e
        ref: "spec/jasmine/DeviceOttSpec.js#OTT core: router (E1-E3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Redemption serves only the bound owner's firmware for the bound udid; malformed tokens never reach Redis; bad, traversal, foreign or transferred records refused and deleted; lifetime capped, never extended"
    requirement: T-tv5-09
    verification:
      - kind: unit
        ref: "spec/jasmine/DeviceOttSpec.js#OTT core: redemption (R1-R11)"
        status: pass
      - kind: e2e
        ref: "spec/jasmine/DeviceOttSpec.js#OTT core: router (E4-E6)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Register FIRMWARE_UPDATE check-in binds the token to the checked-in device; a traversal body udid can no longer steer redemption; failed store answers status OK"
    requirement: T-tv5-09
    verification:
      - kind: unit
        ref: "spec/jasmine/DeviceOttSpec.js#OTT core: register path (G1-G3)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No full token in OTT issue/redeem logs"
    requirement: V9X-OTT-OWNER
    verification:
      - kind: unit
        ref: "spec/jasmine/DeviceOttSpec.js#OTT logs (L1-L3)"
        status: pass
    human_judgment: false
  - id: D5
    description: "CI cases against real CouchDB/Redis and production behaviour after deploy"
    verification:
      - kind: integration
        ref: "spec/jasmine/ZZ-RouterDeviceAPISpec.js 261003-v9x cases"
        status: unknown
    human_judgment: true
    rationale: "The ZZ tier is deleted by docker-entrypoint before CI and needs Redis/CouchDB; post-deploy counts are operator checks"

duration: ~11min
completed: 2026-10-03
---

# Quick 261003-v9x: Bind OTT requests and redemption to the verified owner's device Summary

**OTT tokens are now 32 random bytes stored as exactly `{owner, udid}` with one `SET EX 86400`, issued only for the exact key of the body owner on a device that owner owns (`APIKey#verify` + `Device#fetchOwned`, the v9d rule), and re-validated at redemption (format gate before Redis, sanitka, ownership re-check, delete on refusal, lifetime capped at 3600 s and never extended). This closes a live cross-owner firmware read through the register `FIRMWARE_UPDATE` path and takes full tokens out of the logs.**

## Performance

- **Duration:** about 11 minutes of execution
- **Started:** 2026-10-03T21:12:56Z
- **Completed:** 2026-10-03T21:23:28Z
- **Tasks:** 2/2
- **Files modified:** 6 (2 lib, 2 spec, 2 todos)

## Task Commits

| # | Hash | Message |
|---|------|---------|
| Task 1 RED | `189269ff` | test(quick-261003-v9x): failing spec for OTT owner binding |
| Task 1 GREEN | `360a77ca` | fix(quick-261003-v9x): bind OTT issuance and redemption to the verified owner's device |
| Task 2 | `0a47639c` | fix(quick-261003-v9x): never log OTT tokens in the device firmware routes |
| Task 2 | `6c0ae6b2` | test(quick-261003-v9x): CI OTT owner-binding regressions; resolve device-side todo item 3 |

`git rev-list --count e985b172..HEAD` = 5. The fifth commit, `39d81b41 docs(quick-261003-w0c): plan the MQTT forwardNonNotification crash fix and gating`, is the orchestrator's concurrent commit and not part of this plan. This plan made 4 commits.

All four are **unsigned**. The signed attempt for the RED commit failed (`fatal: failed to write commit object`, GPG cannot prompt), so `git -c commit.gpgsign=false` was used under the operator's standing exception; the later three went straight to the unsigned form. `--no-verify` was never used. Nothing pushed or deployed. No staged path was under a submodule.

## TDD evidence

- **RED** (spec only, before any lib/ change): `34 specs, 27 failures`, exit 3. Exactly the 7 cases marked "passes today" passed (I4, I5, I6, R6, R8, E3, E4). Every [RED] case failed on an assertion for the planned behaviour. R9 failed with the expected uncaught `SyntaxError` from `JSON.parse("not-json")` inside the Redis callback plus "no callback". RED evidence (TAP via a throwaway jasmine reporter, target I1) checked with `gsd-tools check tdd-red-evidence`: **`RED_EVIDENCE_OK`**.
- **After the device.js fix:** `34 specs, 1 failure`, only L1 (router logs, Task 2), as planned.
- **Task 1 verify:** "OTT core" `31 specs, 0 failures`; ApikeyExactMatch + DeviceOwnership + DeviceRegisterOwner `109 specs, 0 failures`; static guards, ESLint, node --check passed. Printed `V9X-OTT-CORE-GREEN`.
- **Tracer gate:** auto mode off, human_verify_mode end-of-phase, `<verify>` automated-only, so it was re-run end to end (above) and passed before Task 2.
- **Task 2 verify:** eight local specs in one process `307 specs, 0 failures`; router guards; the serialization line is still present; ZZ cases parse and lint; todos committed. Printed `V9X-CI-TODO-GREEN`.
- Extra: LoggingQualityAuditSpec + TransferApiKeySpec + LogTailOwnerSpec + DeviceOttSpec `100 specs, 0 failures`.

## What changed

- `lib/thinx/device.js`
  - `storeOTT(binding, cb)`: validates `{owner (string, sanitka.owner), udid (sanitka.udid)}` → `OTT_BINDING_INVALID`; token `crypto.randomBytes(32).toString("hex")`; `set("ott:"+token, JSON{owner,udid}, "EX", 86400, cb)`; an error → `OTT_STORE_FAILED`.
  - `update_device_and_respond`, FIRMWARE_UPDATE branch: `storeOTT({ owner: device.owner, udid: udid })` (the document just written), never the registration body. On a failed store it logs a warning and answers the already-built status `OK` response without `ott`. The `registration_response` log prints only udid, status and version.
  - `ott_request`: owner from the body (`registration` unwrapped), `apikey.verify(owner, key, false, cb)` with 4 arguments, then `fetchOwned(body.udid, owner)`, then `storeOTT({owner, udid: doc.udid})`. Refusals: `OTT_API_KEY_NOT_VALID` (owner/key, audit line with a redacted key), `no_such_device` (device). Logs use `[ott]` and print only the udid and reason codes.
  - `ott_update`: `^[a-f0-9]{64}$` gate before Redis (`OTT_UPDATE_NOT_FOUND`); get error/empty → `OTT_UPDATE_NOT_FOUND`; parse in try/catch, sanitka owner/udid, `fetchOwned` → else `del` + `OTT_INFO_NOT_FOUND`; `ttl` then `expire(key, 3600)` when -1 or > 3600 (errors logged, redemption proceeds); `deploy.initWithDevice({owner, udid})` and `latestFirmwarePath(owner, udid)` with the sanitized, owned values only; no build → `OTT_UPDATE_NOT_AVAILABLE`. Logs show `Util.redactToken(ott)`.
  - `update_binary(path, _ott, cb)`: the per-redemption `expire(3600)` is gone, so neither redemption nor the forced firmware path (body `ott`) can extend a token.
- `lib/router.deviceapi.js`: GET logs `Util.redactToken(ott)`; POST use=ott logs only `token issued: <bool>`. The GET success branch (headers, `Util.responder(res, response.payload)`) is untouched.
- `spec/jasmine/DeviceOttSpec.js` (new): I1-I11, R1-R11, G1-G3, E1-E6, L1-L3 as planned.
- `spec/jasmine/ZZ-RouterDeviceAPISpec.js`: five `(261003-v9x)` cases after "GET /device/firmware (ak, valid)". No existing case changed.

## What CI enforces (and what it does not)

`docker-entrypoint.sh` deletes every `ZZ-*` spec except `ZZ-LogPagingCouchSpec` before CI runs; since 715b38b9 any failing jasmine spec fails CI.

**CI-enforced** (non-ZZ, one process):
- `DeviceOttSpec`, all 34 cases: issuance rule and refusals, exact `{owner, udid}` record, `SET EX 86400`, random distinct tokens, binding/store failures; redemption serving only B's firmware, TTL cap and no extension, traversal / foreign / transferred / non-JSON records refused and deleted, malformed tokens with zero Redis reads, legacy record compat, `update_binary` not touching TTLs; register-path binding (traversal body udid → checked-in device), unchanged response shape, OK on store failure; real-router e2e (E1-E6); token-free logs (L1-L3). **The protection is pinned here.**
- `DeviceSpec (05)` storeOTT/fetchOTT on real Redis: `JRS` has a valid owner and the udid from (02), so it still stores with `SET EX` and fetches a string. Reasoned, not run locally (needs Redis).

**Not CI-enforced today:** the five ZZ cases (real CouchDB/Redis, dynamic's `ak`, `JRS6`): deleted before the run and not runnable locally. Recorded in `.planning/WINDOWS.md` as `unrun-verify` (ledger left uncommitted for the orchestrator).

## v9d consistency outcome

v9d is not executed yet (no SUMMARY, `Device#push` unchanged at HEAD), so there was no shared helper to call. Its PLAN's rule is "verify(owner, key) exact for the request-named owner, 4-argument form, then `fetchOwned`, no lastkey binding". `ott_request` implements exactly that rule, open-coded the same way v9d plans to open-code it in `push`. No deviation. Consequence shared with v9d: a transferred device that names its previous owner gets `OTT_API_KEY_NOT_VALID` on the OTT path (no u86 redirect), where register/firmware would redirect. No known firmware sends `use: "ott"` or a body `ott`.

## Firmware evidence (read-only, re-confirmed)

- `thinx-firmware-esp8266-ino/lib/thinx-firmware-esp8266/src/THiNXLib.cpp` (same code in `thinx-firmware-esp8266-pio/lib/THiNX/src/THiNXLib.cpp`):
  - `:970` `status == "FIRMWARE_UPDATE"`; `:1020-1026` reads `registration["ott"]`, builds `"/device/firmware?ott=" + ott`; `:1045` sets `deferred_update_url`.
  - `:1666-1730` `update_and_reboot` fetches it with `ESPhttpUpdate.update` on 7443 (HTTPS) or 7442 (HTTP when `forceHTTP` and `__DISABLE_HTTPS__`); `HTTP_UPDATE_FAILED` (`:1726`) does not clear the URL.
  - `:2174-2180` `loop()` calls `update_and_reboot(deferred_update_url)` again on every iteration.
  - `:828` the MQTT update branch reads `update["ott"]`.
- No firmware tree sends `use: "ott"`; only the register-path token and GET redemption are used by shipping firmware.
- `thinx-firmware-esp32-pio/lib/thinx-firmware-esp32/` is empty in this checkout (no ESP32 evidence).
- Firmware-facing shapes are unchanged: `registration.ott` is still 64 lowercase hex inside the FIRMWARE_UPDATE response; POST use=ott still answers `{ott}`.

## What changes in production (who is affected)

- (a) `POST /device/firmware {use: "ott"}`: no known firmware caller. It works again for key holders on their own devices (before: always `OTT_API_KEY_NOT_VALID`, the flow was dead).
- (b) `FIRMWARE_UPDATE` check-ins: tokens are random and bound to the checked-in device; a failed Redis write now answers status `OK` without an ott (before: an unredeemable token).
- (c) Tokens issued before the deploy: honoured only when their owner/udid are valid and still owned, else refused and deleted.
- (d) OTA behaviour on devices is unchanged, because redemption serialization is untouched (see below).
- (e) Logs no longer carry full tokens (router GET/POST, `ott_update`, `registration_response`).
- **Closed:** the live cross-owner read. Owner B, with its own key and its own auto-update device with a pending build, could register with a traversal body udid (`../<ownerA>/<udidA>`), check in by MAC as its own device, and redeem a token that resolved `<deploy_root>/<B>/../<A>/<udidA>`, serving A's firmware (which can embed environment values such as Wi-Fi credentials). Pinned by G1, R3, E5.

## Decision left for the operator: JSON vs binary redemption

Since `fee22323` (2022-04-27) the GET success branch calls `Util.responder(res, response.payload)` with two arguments, so the firmware is sent as `{"success":{"type":"Buffer","data":[...]}}` with a JSON Content-Type and the binary's Content-Length. OTT redemption has not delivered a flashable image since 2022, and THiNXLib retries in a tight loop. Restoring `Util.respond(res, response.payload)` would resume OTA for every auto-update device with a pending build (a fleet-wide reflash). This plan leaves the line unchanged; the evidence, the count to run first and the follow-ups (strict one-time redemption, plaintext port 7442, sink-level udid guard in `latestFirmwarePath`) are in `.planning/todos/pending/2026-10-03-ott-redemption-serves-json-not-binary.md`.

## Operator checks (read-only, not run by the executor)

1. Before push, on the node running the Redis task (placement floats, query it): count `ott:*` keys with `SCAN` (counts only, never print values). These are pre-deploy tokens that will be re-validated at redemption.
2. After deploy, on the node running `thinx_api` (node-local `docker logs`, not `docker service logs`): compare counts of `[ott] issued`, `[ott] request refused` and `[ott] redemption refused`. A sudden spike of `redemption refused ...: OTT_INFO_NOT_FOUND` means pre-deploy records failed validation (expected only for foreign or malformed bindings).

## Decisions Made

As planned (Decisions 1-6 of the PLAN). Implementation detail: `ott_update`'s "unknown" branch logs only the redacted token; the malformed-token branch returns without logging (nothing useful to log, and it keeps attacker-chosen strings out of the log).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Spec HTTP helper rejected on a broken response instead of failing on an assertion**
- **Found during:** Task 1 RED run
- **Issue:** E5 on the unfixed code served A's firmware with a body longer than its Content-Length; the client raised `HPE_CLOSED_CONNECTION` and the case failed with a transport error rather than its assertion.
- **Fix:** `send()` resolves with `{status: null, error: <code>}` on a client error, so the case fails on `expected null to equal 200`. Also used `FW_A` in R1 (md5 is not A's) to satisfy ESLint `no-unused-vars`.
- **Files modified:** spec/jasmine/DeviceOttSpec.js (before the RED commit)
- **Committed in:** 189269ff

**Total deviations:** 1 auto-fixed (spec harness, pre-RED-commit). **Impact:** none on scope.

## Issues Encountered

- GPG signing unavailable (see Task Commits).
- `firmware()` still logs a body-supplied `ott` value (`console.log("ott: " + ott)`). That is a client-chosen override flag, not an issued token, and the plan keeps `firmware()` unchanged; noted for a later log pass.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or trust boundary; the changes narrow existing ones.

## Next Phase Readiness

- v9d (addpush) can land next on the same rule; its hunks (`push`, `/device/addpush`) do not overlap this plan's.
- Operator decision pending on the redemption serialization todo.

---
*Phase: quick-261003-v9x*
*Completed: 2026-10-03*

## Self-Check: PASSED
