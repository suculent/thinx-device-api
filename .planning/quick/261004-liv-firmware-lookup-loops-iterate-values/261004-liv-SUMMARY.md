---
phase: quick-261004-liv
plan: 01
subsystem: device-api
status: complete
tags: [device-api, ota, ott, firmware, deployment, plugins, tdd]

requires:
  - phase: quick-261003-v9x
    provides: "OTT bound to {owner, udid}; ott_update → latestFirmwarePath → updateFromPath"
  - phase: quick-261004-22b
    provides: "OTT redemption answers the raw firmware bytes (OTA resumption approved)"
provides:
  - "Plugins#extensions answers the plugins' patterns ('*.bin', '*.py', '*.js', '*.lua'), de-duplicated"
  - "Deployment#latestFirmwarePath finds firmware in the deploy folder: newest file by mtime across all extensions"
  - "Check-in offers FIRMWARE_UPDATE for 'name:X.Y' envelopes (thinx-autoflood:1.0 > device 0.1.0)"
  - "fixAvailableVersion and hasUpdateAvailable never throw on garbage versions (no update instead)"
  - "updateFromPath fails closed (callback(false) once); supportedExtensions calls back exactly once"
affects: [device-api, ota, check-in]

actuals:
  tokens: 6760     # chars/4 over `git diff aac376a2..HEAD` (27034 chars)
  tasks: 3
  commits: 6
plan_head_before: aac376a2c31ebf0cb6d64a6725f0d6ec8f675ca6
plan_head_after: 64ee0d796f66302af869b2d39042a91d61c0ad01

tech-stack:
  added: []
  patterns:
    - "Callback-style helpers that wrap a promise chain call back once: catch the load failure, then call back, then catch callback errors separately"
    - "Request-path helpers answer through a once-guard so a throwing branch cannot answer twice"

key-files:
  created:
    - spec/jasmine/FirmwareLookupSpec.js
    - .planning/todos/pending/2026-10-04-multi-file-ota-update-multiple-broken.md
  modified:
    - lib/thinx/plugins.js
    - lib/thinx/deployment.js
    - lib/thinx/device.js

key-decisions:
  - "Crossgrade policy (operator 2026-10-04): version compare only. Only the part after the last ':' of the envelope version is compared; the firmware name never decides"
  - "fixAvailableVersion: X/name:X → X.0.0, X.Y/name:X.Y → X.Y.0, leading 'v' accepted, leading zeros normalised; 4-/5-part collapse and 6+-part truncation unchanged; anything non-numeric → undefined (no update)"
  - "latestFirmwarePath keeps the newest file across all extensions (the old loop let a later extension with any match displace an earlier, newer one)"
  - "Multi-file OTA (update_multiple) is not repaired here; updateFromPath fails closed for those platforms and a pending todo records the design questions"

duration: 10min
completed: 2026-10-04
---

# Quick 261004-liv: firmware lookup loops iterate values, not indices — Summary

**OTT downloads and the check-in FIRMWARE_UPDATE offer are both fixed.** `Plugins#extensions` and
`latestFirmwarePath` now iterate extension values, so the lookup finds `firmware.bin`.
`fixAvailableVersion` now maps `thinx-autoflood:1.0` to `1.0.0` instead of `0.1.0`. Firmware
serving fails closed on the multi-file paths that the working lookup can now reach.

## What changed

### Task 1 + 2: the lookup (`3221286a` RED, `e507867b` fix)
- `lib/thinx/plugins.js:39-51`: the loop is now `for (const xt of xts)` over each plugin's array.
  On the real loader it answered `['0']`; it now answers `['*.bin', '*.py', '*.js', '*.lua']`.
- `lib/thinx/deployment.js:278-306` (`latestFirmwarePath`): the loop is now `for (const extension of extensions)`.
  It collects matches from every extension and calls `latestFile` once, so the newest file wins
  across all extensions. The old loop also let a later extension with any match (for example an
  older `init.lua`) displace a newer `.bin`, so that was fixed as well. The udid guard and the
  log lines are left for 261004-l8k.
- RED evidence: `7 specs, 5 failures`. Both extension cases failed with `['0']` / `['0','1']`, and
  every lookup answered `false`.

### Task 3: the FIRMWARE_UPDATE decision (`484b7724` RED, `1afafdc7` fix)

Check-in chain, end to end (current line numbers):

1. `POST /device/register` → `Device#register` (`lib/thinx/device.js:~853`) → `checkinExistingDevice` (`:466`).
2. `updateDeviceDataWithRegistration` (`:429`) sets `device.version = reg.version` (`:435`), plus
   `env_hash` and `platform`.
3. `runDeviceTransformers` (`:553`) → `update_device_and_respond` (`:261`) → the atomic modify
   → `if (device.auto_update) update = deploy.hasUpdateAvailable(device)` (`:312`).
4. `Deployment#hasUpdateAvailable` (`lib/thinx/deployment.js:359`) → `parseDeviceVersion` →
   `getAvailableVersion` (`:125`) → `latestFirmwareEnvelope` (`:33`, reads `<deploy>/<owner>/<udid>/build.json`)
   → `fixAvailableVersion(envelope.version)` (`:82`) → `semver.lt` (`:377`). If the versions
   are equal, the `env_hash` branch runs (`:384-397`).
5. `update === true` → `storeOTT` (`device.js:332`) → `status: "FIRMWARE_UPDATE"` (`:351`) with
   `ott`. The device then redeems the token: `GET /device/firmware?ott=` → `ott_update` (`:1372`)
   → `latestFirmwarePath` → `updateFromPath` (`:1420`) → `update_binary`.

Why it never fired: `fixAvailableVersion` treated a one-dot tag as `[0, major, minor]`.
`"thinx-autoflood:1.0"` became `0.1.0`, which equals the device's `0.1.0`. The equal-version
branch then skips because `env_hash` starts with `cafebabe`. An unprefixed `"1.0"` or `"1"`
threw `TypeError` (`version_string` undefined), and `"name:1"` became `"0.0.name,1"`.

Platform does not block this case: `platformSupportsUpdate` is only called from
`validateHasUpdateAvailable`, which is not on the check-in path, and it accepts `arduino`
anyway. Envelope platform and device platform are never compared.

Fix (`deployment.js:72-123`):
- `X` / `name:X` → `X.0.0`
- `X.Y` / `name:X.Y` → `X.Y.0`
- `X.Y.Z` → `X.Y.Z`
- `W.X.Y.Z(.V)` → `W.X.(Y+Z(+V))` (unchanged)
- 6 or more parts → first three (unchanged)
- A leading `v` is accepted and leading zeros are normalised. A number (JSON `1.5`) is stringified.
- Anything else (`abc`, `1.x`, `1.0-beta` with a prefix, `1..2`, null, objects, NaN) → `undefined`,
  so no update is offered and nothing throws.
- `hasUpdateAvailable` (`:362-367`) answers `false` for a device version that is still not
  semver after `parseDeviceVersion`, instead of letting `semver.lt` throw inside check-in.
  `parseDeviceVersion` stringifies non-string versions.
- `device.js:316-322`: the check-in log now says "no newer firmware available" when auto-update
  is on, and "auto-update disabled" only when it is off.

RED evidence: `42 specs, 28 failures`. `thinx-autoflood:1.0` → `'0.1.0'`, `"1.0"` → TypeError,
and hasUpdateAvailable answered `false` for device 0.1.0.

**Crossgrade (device firmware name ≠ envelope name):** the decision compares versions only.
`some-other-firmware:0.2` is offered to a device on `0.1.0` (spec-pinned). The name comparison in
`checkinExistingDevice` (`device.js:493`, `envelope.firmware.indexOf(reg_f_array[0])`) only marks
the owner's build goal and does not affect the offer. Behaviour unchanged, per the operator decision.

### Task 3 deviation: fail closed once the lookup works (`94629991` RED, `64ee0d79` fix)
See Deviations, item 1.

## Device.js ~160-175 finding (`update_multiple`, now `device.js:172-222`)

**Purpose:** it serves script-based firmware (Lua, MicroPython, Node.js) as a set of files instead of
one binary. `updateFromPath` sends nodemcu, micropython, mongoose and nodejs envelopes there.

**On the OTA path?** Only for those four platforms, through `GET /device/firmware?ott=` and
`POST /device/firmware`. Arduino, PlatformIO and Pine64, including the production af6eac20 case,
never use it.

**State:** it has never worked:
- it reads a non-existent `platforms/descriptor.json` and throws ENOENT on its first line;
- `extensions` is a path string, so it walks character indices;
- it `readdirSync`s the `firmware.bin` file path;
- the outer loop reads `all_files[findex]` while iterating `artifact_filenames`;
- the GET router cannot send its JSON answer (`Content-Length: undefined`).

It was unreachable before this task because the lookup always answered false. **Not repaired**: a
real repair needs the wire format the Lua/MicroPython libraries expect, and a decision on whether
any such devices still exist. It now fails closed, and a pending todo records the details:
`.planning/todos/pending/2026-10-04-multi-file-ota-update-multiple-broken.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, made reachable by Task 2] Firmware serving threw, and a throwing callback was re-invoked**
- **Found during:** Task 3 (tracing the device.js ~160-175 finding)
- **Issue:** with the lookup fixed, redeeming an OTT for a nodemcu/micropython/mongoose/nodejs
  device reached `update_multiple`, which throws ENOENT. The throw happened inside the
  `supportedExtensions` promise chain. Its `.catch` logged the error and called the callback
  **again** with `[]`. Because `latest_firmware` sits outside the closure, the second call served
  the same path and threw again. That throw escaped as an unhandled rejection, which by default
  terminates Node, and there is no process-level handler. Reproduced ad hoc: `UNCAUGHT ENOENT`.
  Also, an unsupported platform never called back (the request would hang), and an unreadable
  `build.json` threw.
- **Fix:** `updateFromPath` answers through a once-guard. It answers `callback(false)` for an
  unreadable or non-object envelope, a multi-file failure, or an unsupported platform.
  `supportedExtensions` calls back exactly once: a load failure gives `[]`, and a callback error
  is logged by error code only, never with the path.
- **Files modified:** lib/thinx/device.js, lib/thinx/deployment.js
- **Commits:** 94629991 (RED: `50 specs, 7 failures`), 64ee0d79

**2. [Rule 2 - Missing critical] Device-version guard in hasUpdateAvailable**
- **Found during:** Task 3
- **Issue:** a device version that does not become semver (`"abc"` → `abc.0.0`, `""`, `"1.x"`, or
  a number) threw `TypeError: Invalid Version` from `semver.lt` inside the check-in atomic callback.
- **Fix:** `parseDeviceVersion` stringifies non-strings, and `hasUpdateAvailable` answers `false`
  when the version is not valid. The warning line does not include the version or any id.
- **Files modified:** lib/thinx/deployment.js
- **Commit:** 1afafdc7 (spec in 484b7724)

**Old behaviour kept on purpose:** `fixAvailableVersion` still passes a semver-valid string
through unchanged (for example `v1.2.3` or `1.2.3-beta`). A 6+-part version still truncates to its
first three parts; the plan left this for a report, so it is spec-pinned rather than rejected.

## Verification

- New spec, alone (temporary jasmine config, `helpers: []`, `random: false`,
  `ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y`): **`50 specs, 0 failures`**.
- Regression set, in one process, 28 files: FirmwareLookup, DeviceOtt, DeviceFirmwareOwner,
  TransferRecipient, TransferApiKey, DeviceOwnership, DeviceRegisterOwner, DevicePushOwner,
  ApikeyExactMatch, ApikeyExposure, OwnerDefaultMqttKey, CsrfRouteInventory, MeshSessionAuth,
  MessengerDropLimiter, MessengerDeviceWrites, MessengerFailSafe, MessengerOwnership,
  MessengerOwnerSocket, BuilderApiKey, GoogleOAuthState, GitHubOAuthIsolation, Util, SecretsSweep,
  LoggingQualityAudit, OwnerLogLeak, Sanitka, Deployment, Plugin: **`820 specs, 1 failure`**.
  - The 1 failure is `PluginSpec "should be able to use all plugins at once"`. It is a
    pre-existing local-environment gap: `spec/test_repositories/thinx-firmware-esp8266-pio` (and
    the upy/mos/js repos) are not checked out locally, because CI fetches them with `get-tests.sh`.
    It fails identically on the pre-task commit `aac376a2` (`6 specs, 1 failure`). `Plugins#use`
    is untouched.
  - `DeploymentSpec "should be able to return latest firmware path"` flakes locally: an
    unhandled `EROFS mkdir '/mnt'` from `initWithOwner`'s `mkdirp` in earlier specs lands in
    whichever spec is running. It flaked in 1 of 15 runs at HEAD, and also flaked on a pre-task
    `aac376a2` worktree. It is macOS-only (`/mnt` is read-only) and unrelated to this task.
- Ad hoc end-to-end check (real Deployment + real `Device#updateFromPath`, temp deploy folder
  with `build.json` platform `platformio` and a 4096-byte `firmware.bin`): the lookup answers the
  `.bin` path and `updateFromPath` answers `(true, filesize 4096)`.
- ESLint is clean on all four files, and the spec has no `fit`/`fdescribe`/`xit`/`xdescribe`.
- Existing specs that cover these functions: `DeploymentSpec` (latestFirmwarePath, hasUpdateAvailable),
  `PluginSpec` (extensions). Both are in the run above. No spec referenced `fixAvailableVersion`
  or `parseDeviceVersion` before.

## Open questions / risks

1. **Re-offer after the first OTA (af6eac20):** after flashing `thinx-autoflood:1.0`, the device
   must report a `version` of at least `1.0.0` on check-in. Otherwise every check-in offers the
   update again. THiNXLib32 reports `THINX_FIRMWARE_VERSION_SHORT`; the builder writes it from the
   git tag (`builder.js:762`, which should be "1.0"). It also skips the update on the device side
   when `app_version` is contained in the offered version (`THiNXLib32.cpp:1322`), and the builder
   sets `THINX_APP_VERSION = "thinx-autoflood:1.0"`. That should hold, but it depends on the
   builder's header injection reaching `lib/thinx-firmware-hmi/src/thinx.h` in that repo. Verify
   on the first real OTA.
2. **env_hash re-offer:** if versions are equal, the device `env_hash` is not `cafebabe…`, and
   the envelope has no `env_hash`, then `indexOf(null)` answers -1 and the device is offered the
   same build on every check-in. This is pre-existing, not changed here, and recorded in the todo.
3. **Owner id in logs:** `update_binary from path: <deploy>/<owner>/…` (device.js) and the
   `Envelope … not found` line in `latestFirmwarePath` both log the deploy path, which contains the
   owner id. The second is in 261004-l8k's scope; the first is not, and is recorded in the todo.
4. Failed serving answers `callback(false)` with no reason, so the GET answers an empty body.
   This is the existing `update_binary` contract and is unchanged. A distinct reason code (for
   example `OTT_UPDATE_NOT_AVAILABLE`) would be easier for devices to diagnose; that is for the
   operator to decide.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or trust-boundary change. The only new log lines carry error codes, a platform name, or a fixed string.

## Self-Check: PASSED

- FOUND: spec/jasmine/FirmwareLookupSpec.js, lib/thinx/plugins.js, lib/thinx/deployment.js, lib/thinx/device.js
- FOUND: .planning/todos/pending/2026-10-04-multi-file-ota-update-multiple-broken.md
- FOUND commits: 3221286a, e507867b, 484b7724, 1afafdc7, 94629991, 64ee0d79
