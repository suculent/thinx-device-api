---
phase: quick-261004-tgg
plan: 01
subsystem: device-api
status: complete
tags: [device-api, check-in, sigfox, crash, hang, tdd]

requires:
  - phase: quick-261004-sdv
    provides: "Bug list items 1-5 (check-in path crash/hang), log forms kept"
provides:
  - "markUserBuildGoal error path answers (res, false, 'update_failed') once, audits device.owner"
  - "New-device insert completion never calls the nulled SigFox callback"
  - "Device#envs null-safe; logs envs_read_failed on any read error"
  - "Deployment#validateHasUpdateAvailable(undefined|null) returns false"
  - "register missing-MAC path answers (res, false, 'no_mac')"
affects: [device-api, check-in, device-register]

actuals:
  tokens: 5692     # chars/4 over `git diff c3fd7f45..HEAD -- lib spec` (22769 chars)
  tasks: 2
  commits: 2
plan_head_before: c3fd7f45778f280aae70b01c1de0b536b89e9aff
plan_head_after: 711f3e5cb2f7ccd8c3325cab34ccf6fdb30d48a2

tech-stack:
  added: []
  patterns:
    - "Fake-DB completions run inside try/catch that records throws, so a crash in a completion is an assertion, not a lost test"

key-files:
  created:
    - spec/jasmine/CheckinCrashHangSpec.js
  modified:
    - lib/thinx/device.js
    - lib/thinx/deployment.js

key-decisions:
  - "envs 'real error' = any truthy read error (missing/404 included, as before); no line when the read returns neither error nor document"
  - "register missing-MAC guard left as `typeof mac === 'undefined'`: normalizedMAC returns null for a missing MAC, so the branch is unreachable today; widening it to null would reject MAC-less registrations that currently proceed by udid (a behaviour change, not in scope)"
  - "SigFox insert failure still logs device_insert_failed after the downlink was answered; only the second callback call is skipped"

metrics:
  duration: ~10min
  completed: 2026-10-04
---

# Quick 261004-tgg: check-in path crash and hang bugs

The five crash/hang bugs listed in 261004-sdv are fixed. Each one has a failing local spec case first. The log forms from 261004-sdv are kept, and nothing else changes.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | `f3e65405` | `test(quick-261004-tgg)`: `spec/jasmine/CheckinCrashHangSpec.js`, 13 specs, 8 failing on the five bugs, 5 pins of unchanged behaviour passing |
| 2 (GREEN) | `711f3e5c` | `fix(quick-261004-tgg)`: `lib/thinx/device.js`, `lib/thinx/deployment.js` |

Both are unsigned (`git -c commit.gpgsign=false`, the operator's standing exception). `--no-verify` was not used and nothing was pushed. Only explicit paths were staged, and no submodule was staged.

## Per-bug fix

| # | Where (after fix) | Before | After |
|---|---|---|---|
| 1 | device.js:438 `markUserBuildGoal` | `alog.log(owner, …)`: `owner` was undeclared, so the users-db completion threw `ReferenceError` and `callback(res, false, "update_failed")` never ran | `alog.log(device.owner, …)`. Answers exactly once with `(res, false, "update_failed")` |
| 2 | device.js:1283-1300 `register` insert completion | The SigFox downlink branch answered, then set `callback = null`. The insert completion then called `callback(res, …)` on both success and failure (TypeError) | The insert failure still logs `device_insert_failed`, then `if (typeof (callback) !== "function") return;`. Plain new devices behave as before: success answers the registration and failure answers `(res, false, …)`. The HTTP response is sent exactly once |
| 3 | device.js:1873 `envs` | `error.toString()` threw when `error` was null and `device` undefined. The line logged only when the error *was* "Error: missing" | `if (error) console.log(… envs_read_failed …)`. No throw. The line is logged on any real read error and not when there is no error. The callback shapes are unchanged: `(false, "getenv_device_not_found")` / `(true, environment)` |
| 4 | deployment.js:352-354 `validateHasUpdateAvailable` | It logged "without device", then dereferenced `device.owner` (TypeError) | Logs the same line, then `return false` |
| 5 | device.js:959 `register` missing-MAC | `callback(false, "no_mac")`: the route saw `success = "no_mac"`, `response = undefined` | `callback(res, false, "no_mac")`. The route answers `{"success":false,"response":"no_mac"}` |

Note on 5: `normalizedMAC` returns `null` for a missing MAC, never `undefined`, so the guard `typeof (mac) === "undefined"` never fires with the real function. The spec reaches the branch by stubbing `normalizedMAC`. The guard itself was not widened to `null`. That would reject MAC-less registrations, which today go ahead and resolve by udid, and that is a behaviour change outside this task.

## Test results

All local runs used a temp jasmine config (`helpers: []`) with `ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y`.

| Run | Result |
|---|---|
| CheckinCrashHangSpec before the fix (RED, `f3e65405`) | 13 specs, 8 failures: markUserBuildGoal throw; SigFox insert success throw; SigFox insert failure throw; envs null throw (with callback); envs null throw (no callback); envs non-missing error logged 0 lines; validateHasUpdateAvailable(undefined) TypeError; no_mac `res` not passed |
| CheckinCrashHangSpec after the fix | 13 specs, 0 failures |
| Regression set run 1 (the new spec plus CheckinLogLeak, DeviceTransformers, DeviceDocLogLeak, FirmwareLookup, Deployment, DeviceOtt, DeviceFirmwareOwner, DeviceOwnership, DeviceRegisterOwner, DevicePushOwner, TransferRecipient, MessengerDeviceWrites, LoggingQualityAudit, OwnerLogLeak, SecretsSweep, Sanitka, Util; 18 files) | **496 specs, 2 failures**: `Deployer should be able to return latest firmware path` and `DeviceOttSpec I1` |
| Regression set run 2 | **496 specs, 1 failure**: `DeviceOttSpec I1` |
| DeploymentSpec + DeviceOttSpec alone | 49 specs, 1 failure: `DeviceOttSpec I1` |

Every failure is the known local-only flake `Unhandled promise rejection: Error: EROFS: read-only file system, mkdir '/mnt'`. Jasmine attributes it to whichever spec is running when it fires. No assertion failed. The set had 483 specs before this task (261004-sdv), and 483 + 13 = 496. `npx eslint lib/thinx/device.js lib/thinx/deployment.js spec/jasmine/CheckinCrashHangSpec.js` is clean.

## Deviations from Plan

None. The plan was executed as written. The decision not to widen the missing-MAC guard (see key-decisions) keeps to the plan's "no other behaviour change" rule.

## Open findings (not fixed, out of scope)

From 261004-sdv:
- **6. `sanitka.udid` logs its raw input on failure.** The `revoke`/`envs`/`detail` reason lines pass the caller's udid through it, so a malformed udid string reaches the log through sanitka's warning.
- **7. Remaining non-check-in log lines** (`Device#firmware` `"forced: "`, `"result keys: "`, the NID key line, `Deployment#initWithDevice` response line, `parseDeviceVersion` version strings): unchanged.

Seen while doing this task:
- The missing-MAC branch is unreachable (see the note on 5). MAC-less registrations go ahead with `mac: null`.
- `markUserBuildGoal` never calls back when no goal changed (`changed === false`). The check-in caller relies on `runDeviceTransformers` answering, so this is not a hang today. The double-answer risk recorded in 261004-rdf is still open.
- `envs` success path calls `callback` without the `undefined` guard that its failure path has.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `spec/jasmine/CheckinCrashHangSpec.js`, `lib/thinx/device.js`, `lib/thinx/deployment.js`
- FOUND: commits `f3e65405`, `711f3e5c` (`git rev-list --count c3fd7f45..HEAD` = 2)
- No submodule staged. This SUMMARY is on disk only and was not committed.
