---
phase: quick-261004-sdv
plan: 01
subsystem: device-api
status: complete
tags: [device-api, logging, check-in, sigfox, tdd]

requires:
  - phase: quick-261004-l8k
    provides: "Device.errorCode(err); update_device / update_device_and_respond log reason code + udid"
  - phase: quick-261004-rdf
    provides: "runDeviceTransformers null-safe; open finding: check-in logs JSON.stringify(reg)"
provides:
  - "Check-in (existing + new device, plain + SigFox) logs a state code + udid only, never the registration body"
  - "markUserBuildGoal, register insert failure, revoke, envs, detail log Device.errorCode + udid, never raw errors/bodies/documents"
  - "Deployment#validateHasUpdateAvailable no longer logs { device }"
affects: [device-api, check-in, device-revoke]

actuals:
  tokens: 6527     # chars/4 over `git diff db3da9b9..HEAD -- lib spec` (26108 chars)
  tasks: 2
  commits: 2
plan_head_before: db3da9b9972771dcf35c2e2c3a882539864a25a0
plan_head_after: 043e3bda3a65e56be71572ed26e216605cea9157

tech-stack:
  added: []
  patterns:
    - "Check-in log lines carry `[checkin]`/`[register]` + a state or reason code + sanitized udid; never the body, MAC, status or error text"

key-files:
  created:
    - spec/jasmine/CheckinLogLeakSpec.js
  modified:
    - lib/thinx/device.js
    - lib/thinx/deployment.js

key-decisions:
  - "Log-only: pre-existing control-flow bugs found in the swept code (markUserBuildGoal ReferenceError, SigFox new-device null callback, envs null deref) were left as-is and listed below"
  - "[OID:] DEVICE_CHECKIN/DEVICE_NEW stats lines and alog entries are the audit trail and stay unchanged"

metrics:
  duration: ~12min
  completed: 2026-10-04
---

# Quick 261004-sdv: check-in never logs the registration body

Check-in and registration now log a state or reason code and the udid. They no longer log the
registration body, the device document or raw database errors. Responses, writes and control flow
are unchanged.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | `39f4d72a` | `test(quick-261004-sdv)`: failing local spec `spec/jasmine/CheckinLogLeakSpec.js` (12 specs, 12 failing on leaks only) |
| 2 (GREEN) | `043e3bda` | `fix(quick-261004-sdv)`: log-line replacements in `lib/thinx/device.js`, `lib/thinx/deployment.js` |

## Lines changed (file:line, new form)

| Where | Before | After |
|---|---|---|
| device.js:437 `markUserBuildGoal` | `"ERR: " + error + " : " + JSON.stringify(body)` | `☣️ [error] [checkin] build_goal_update_failed (<code>), udid <udid>` (unused `body` param commented out for lint) |
| device.js:553 `checkinExistingDevice` SigFox | 3 lines incl. `"Updating downlink for existing device " + downlinkdata` (first 16 chars of status) | `ℹ️ [info] [checkin] sigfox_downlink, udid <udid>` |
| device.js:564 `checkinExistingDevice` (COPY B) | `console.log(JSON.stringify(reg))` | `ℹ️ [info] [checkin] existing_device, udid <udid>` |
| device.js:980 `register` (no key) | `` `no API Key in ${reg}` `` | `☣️ [error] [register] refused: no_api_key` |
| device.js:1184 `register` new SigFox | 4 lines incl. `JSON.stringify(reg)` and the downlink data | `ℹ️ [info] [register] sigfox_downlink, udid <udid>` |
| device.js:1287 `register` insert | `"Device record update failed." + create_err` | `☣️ [error] [register] device_insert_failed (<code>), udid <udid>` |
| device.js:1826 `revoke` | `console.log(err)` | `☣️ [error] [device] revoke_read_failed (<code>), udid <udid>` |
| device.js:1841 `revoke` | `"revision undefined in doc", doc` | `☣️ [error] [device] revoke_no_revision, udid <udid>` |
| device.js:1851 `revoke` | `"Device destroy error: ", destroy_err` | `☣️ [error] [device] revoke_destroy_failed (<code>), udid <udid>` |
| device.js:1867 `envs` | `"get envs:", error` (same `error.toString()` guard kept) | `☣️ [error] [device] envs_read_failed (<code>), udid <udid>` |
| device.js:1878 `detail` | `"detail searching for udid:", udid, ", ", error` | `☣️ [error] [device] detail_read_failed (<code>), udid <udid>` |
| deployment.js:357, :362 `validateHasUpdateAvailable` | `console.log({ device })` after each reason line | removed; the reason line stays |

`<code>` is `Device.errorCode(err)`: `code`, `statusCode` or `name`, filtered to `[A-Za-z0-9_]{1,32}`. `<udid>` is `sanitka.udid(...) || "-"`.

## Out of scope (audit trail, unchanged)

- `recordStatsEvent` → `logger.warn("[OID:<owner>] [DEVICE_CHECKIN] <udid>")` (device.js:90, called at :522) and `[DEVICE_NEW]` (new-device path); `InfluxConnector.statsLog` console line (influx.js:195).
- `alog.log` entries: device.js:438 (`Profile update failed.`), :441 (`Owner state updated.`), :979 (no API key), :1046 (invalid key, redacted).

## Verification

Local runs used a temporary jasmine config (`helpers: []`) with `ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y`.

- RED (39f4d72a): `CheckinLogLeakSpec`: 12 specs, 12 failures. Every failure was a leak assertion; the behaviour assertions placed before it passed.
- GREEN: `CheckinLogLeakSpec`: **12 specs, 0 failures**.
- Regression set: CheckinLogLeak, DeviceTransformers, DeviceDocLogLeak, FirmwareLookup, Deployment, DeviceOtt, DeviceFirmwareOwner, DeviceOwnership, DeviceRegisterOwner, DevicePushOwner, TransferRecipient, MessengerDeviceWrites, LoggingQualityAudit, OwnerLogLeak, SecretsSweep, Sanitka, Util (17 files):
  - run 1: **483 specs, 1 failure**, in DeviceFirmwareOwnerSpec "VD4 tracer 1". The failure was `Unhandled promise rejection: EROFS: read-only file system, mkdir '/mnt'`.
  - run 2: **483 specs, 2 failures**, in DeploymentSpec "should be able to return latest firmware path" and DeviceDocLogLeak `update_device`. Both were the same EROFS unhandled rejection.
  - The EROFS rejection is the known local-only flake. It is attributed to whichever spec is running when it fires. DeviceFirmwareOwnerSpec alone: 10 specs, 0 failures. Apart from that rejection, no assertion failed.
- `npx eslint lib/thinx/device.js lib/thinx/deployment.js spec/jasmine/CheckinLogLeakSpec.js`: clean.

## Deviations from Plan

**1. [Rule 3 - Blocking] Removed an unused `body` parameter.** Replacing the `markUserBuildGoal` log line left `body` unused, and ESLint `no-unused-vars` failed. The parameter is now `/* body */`, the same convention `update_device_and_respond` uses. Commit `043e3bda`.

Otherwise the plan was executed as written. `deployment.js` was edited because the plan's sweep list names `validateHasUpdateAvailable`.

## Open findings (pre-existing, not fixed: behaviour changes, out of this log-only scope)

1. **`markUserBuildGoal` throws on its error path.** `alog.log(owner, …)` (device.js:438) refers to an undeclared `owner`. The users-db callback therefore throws `ReferenceError` and `callback(res, false, "update_failed")` never runs. In production that throw happens inside a nano callback. The fix is `device.owner`.
2. **The SigFox new-device branch crashes after it answers.** `register` sets `callback = null` after the downlink answer, then `devicelib.insert` calls `callback(res, …)` on both success and failure (TypeError). The spec's fake insert never answers on success, so the spec does not hit this.
3. **`envs` guard.** `error.toString()` throws when `error` is null and `device` is undefined. The line only logs when the error *is* "missing". The guard was kept verbatim.
4. **`validateHasUpdateAvailable(undefined)`** dereferences `device.owner` after the "without device" line. The method has no callers.
5. **`register` missing-MAC path** calls `callback(false, "no_mac")`, which drops the `res` argument (device.js:959).
6. **`sanitka.udid` logs its raw input on failure.** This was already known from l8k. The new `revoke`/`envs`/`detail` lines pass the caller's udid through it, so a malformed udid string now reaches the log through sanitka's warning. Before, `detail` logged it directly and `revoke`/`envs` did not log it.
7. Other remaining lines, outside the check-in path and not secret-bearing, were left alone: `Device#firmware` `"forced: " + forced` (:1561), `"result keys: ", { json_keys }` (:1652), the NID key line (:1673); `Deployment#initWithDevice` response line (:251); the `parseDeviceVersion` lines that log device-supplied version strings (log-injection only).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `spec/jasmine/CheckinLogLeakSpec.js`, `lib/thinx/device.js`, `lib/thinx/deployment.js`
- FOUND: commits `39f4d72a`, `043e3bda` (`git rev-list --count db3da9b9..HEAD` = 2)
- No submodule staged; `services/transformer` (other executor) untouched.
