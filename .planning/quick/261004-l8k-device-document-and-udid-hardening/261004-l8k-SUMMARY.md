---
phase: quick-261004-l8k
plan: 01
subsystem: device-api
status: complete
tags: [device-api, logging, ota, ott, deployment, path-injection, tdd]

requires:
  - phase: quick-261004-liv
    provides: "latestFirmwarePath iterates extension values; fail-closed updateFromPath"
  - phase: quick-261004-25u
    provides: "MQTT status edit goes through Device#edit -> update_device (live with THINX_MQTT_DEVICE_WRITES=1)"
provides:
  - "Device#update_device / update_device_and_respond log a reason code + sanitized udid only"
  - "Device.errorCode(err): log-safe error code ([A-Za-z0-9_], code/statusCode/name only)"
  - "Sink-level udid guard in Deployment#latestFirmwarePath, latestFirmwareEnvelope, latestFirmwareArtifact, artifact"
  - "hasUpdateAvailable equal-version branch offers only when both env_hash values are non-empty strings and differ"
affects: [device-api, check-in, mqtt-status-edit, ota, build-artifacts]

actuals:
  tokens: 9419     # chars/4 over `git diff c80930df..HEAD` (37676 chars)
  tasks: 2
  commits: 2
plan_head_before: c80930df3473be19b595c95d78cccd43d129b2ce
plan_head_after: 19c8371b7a27a1cd47da64bb1973ffc115b3471f

tech-stack:
  added: []
  patterns:
    - "Failure log lines carry a reason code, a filtered error code and the sanitized udid; never err.message, documents or paths"
    - "Path sinks validate every caller-supplied path component before the path is built"

key-files:
  created:
    - spec/jasmine/DeviceDocLogLeakSpec.js
  modified:
    - lib/thinx/device.js
    - lib/thinx/deployment.js
    - .planning/todos/completed/2026-10-03-ott-redemption-serves-json-not-binary.md (uncommitted)
    - .planning/todos/pending/2026-10-04-multi-file-ota-update-multiple-broken.md (uncommitted)

key-decisions:
  - "Equal-version env_hash rule: offer only when device and envelope env_hash are both non-empty strings and the device hash does not contain the envelope hash (existing indexOf containment kept for the non-empty case; cafebabe skip kept)"
  - "latestFirmwarePath also refuses an owner that fails sanitka.owner (same callback(false) the nonexistent path already produced, now without touching the filesystem)"
  - "artifact() guards build_id with sanitka.udid as well as udid, matching router.build's existing sanitization"

duration: 14min
completed: 2026-10-04
---

# Quick 261004-l8k: device document + udid hardening Summary

**`update_device` and check-in's `update_device_and_respond` no longer log the device document,
owner id, lastkey or changes. They log a reason code and the udid. Every Deployment method that
builds `<deploy_root>/<owner>/<udid>` from a caller-supplied udid now refuses a udid that fails
`sanitka.udid` before touching the filesystem. A build without `env_hash` is no longer re-offered
on every check-in.**

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `5bf655bd` | test(quick-261004-l8k): failing spec for device document and udid hardening |
| 2 | `19c8371b` | fix(quick-261004-l8k): device document and udid hardening |

Both commits are unsigned (`git -c commit.gpgsign=false`, the operator's standing exception).
`--no-verify` was never used and nothing was pushed. Only explicit paths were staged; `services/worker`
and the other submodules were not touched. The todo updates and this SUMMARY are on disk only.

## RED evidence

`DeviceDocLogLeakSpec.js` on unfixed code: **39 specs, 29 failures**. 28 were chai AssertionErrors.
One was the real bug the spec pins: `TypeError: deviceHash.indexOf is not a function` for a
non-string device `env_hash`. Spec-reported leaks on RED (by sentinel name):
- `update_device` atomic failure: owner, lastkey, change, alias, rev, db_error (the whole document and the changes)
- `update_device` read failure: owner, db_error (the raw nano error)
- `update_device` with no callback: owner, change
- `update_device_and_respond` failure: owner, lastkey, alias
- `latestFirmwarePath` with `../x`, `a/b`, `''`, a 36-char traversal, a number or an object: `fs.existsSync` was called (1 call)
- `latestFirmwarePath` without a udid: the owner id; with a missing envelope: the owner id and the deploy path
- `latestFirmwareEnvelope` / `latestFirmwareArtifact` / `artifact` with a bad udid: 2 `existsSync` calls
- `update_binary`: owner id and deploy path, on both success and failure
- `firmware()` without a MAC: owner, api_key, ott, alias (raw `ott:` line plus `JSON.stringify(rbody)`)
- `firmware()` forced and normal paths: owner id and deploy path
- `hasUpdateAvailable`: envelope `env_hash` null or undefined, or device hash `""`, offered `true`
- `getAvailableEnvironmentHash`: logged the envelope (owner id) and the hash

GREEN: **39 specs, 0 failures**. It also passed three random-order runs (39/0 each).

## What changed

### `lib/thinx/device.js`
- **`update_device`**: every path logs a fixed reason plus the sanitized udid (`-` when the udid is invalid):
  `update_device_no_callback`, `device_read_failed (<code>)` or `device_edit_failed (<code>)`.
  The success path logs nothing. It no longer logs `JSON.stringify(changes)`, the document, the
  raw error or the CouchDB body. Callbacks and return values are unchanged. The unused `errors`
  parameter is renamed `_errors`, and its only caller (`edit`) never passed it.
- **`Device.errorCode(err)`** (new static helper): returns the first of `err.code`,
  `err.statusCode` or `err.name` that matches `[A-Za-z0-9_]{1,32}`, else `unknown`. It never
  returns the message, which can carry document ids, URLs or paths.
- **`update_device_and_respond`** (HTTP check-in): the failure line was
  `"... failed with udid:", udid, "device:", device`, which printed the whole device. It is now
  `device_update_failed (<code>), udid <udid>`.
- **`update_binary`**: `update_binary from path: <deploy>/<owner>/…` is now
  `[update] reading the firmware binary`. The catch line logs `e.code || e.name`; it used to log `e`,
  and an ENOENT message carries the path.
- **`firmware()`** (POST /device/firmware):
  - `ott: <token>` → `request carries ott <first 6 chars>…` (`Util.redactToken`)
  - `missing_mac in <JSON body>` → `request refused: missing_mac`
  - `latestFirmwarePath completed with {path}` → `firmware lookup for udid <udid> found nothing|a file`
  - The three `... path ${path}` lines (forced, force-set, normal) now name the udid instead of the path.

### `lib/thinx/deployment.js`
- **`latestFirmwarePath`**: sanitizes udid and owner before building any path. If either fails, it
  calls `callback(false)` once, with no `existsSync`, no `deployPathForDevice` and no plugin load.
  Log lines: `invalid LFP owner or udid` (this used to print the owner id) and
  `Envelope for udid <udid> not found.` (this used to print the full deploy path).
- **Other methods guarded (truth 3):**
  - `latestFirmwareEnvelope`: it already sanitized the udid but built the path first. It now
    returns `false` before building the path.
  - `latestFirmwareArtifact`: it had no guard and now returns `false`. It has no callers in `lib/`.
  - `artifact(owner, udid, build_id)`: both `udid` and `build_id` must pass `sanitka.udid`,
    otherwise it returns `null`. `router.build` already sanitizes both the same way, so the
    route behaves as before. The not-found and read-error lines no longer print the path or
    the exception object.
  - Not changed: `deploymentPathForDeviceOwner(owner, udid)`. It does not use
    `Filez.deployPathForDevice`, and nothing in `lib/` calls it. Its owner already goes through
    `deployPathForOwner`/`sanitka.owner`.
- **`getAvailableEnvironmentHash`**: no longer logs the env hash or the whole envelope (the envelope holds the owner id).
- **`initWithOwner`**: its error line no longer prints the owner id. The line was unreachable,
  because `deployPathForOwner` always returns a string; it was changed for hygiene only.
- **`hasUpdateAvailable` (re-offer loop)**: at equal versions an update is offered only when the
  device `env_hash` and the envelope `env_hash` are both non-empty strings and the device hash
  does not contain the envelope hash. The `cafebabe` default-environment skip is unchanged.
  Two cases change:
  - A null or undefined envelope hash no longer matches as `indexOf(null) === -1`, which had
    offered the same build on every check-in and made the device reflash forever.
  - A non-string device hash no longer throws inside the check-in atomic callback.

## Behaviour of valid devices (truth 4)
- HTTP check-in: `update_device_and_respond` changed only its error log. The equal-version offer changes only as described above. The newer-version offer is unchanged (spec case).
- OTT redemption: `ott_update` passes an already-sanitized owner and udid, so `latestFirmwarePath`
  still finds `firmware.bin` (spec case and FirmwareLookupSpec, all green).
- `firmware()`: only log text changed. The spec drives the forced and normal paths to
  `updateFromPath` with the same path as before.

## Deviations from Plan

1. **[Rule 2 - logging] More log lines fixed in the sweep than the plan named.** They are all on
   the check-in, update or OTT paths: `update_device_and_respond` (the whole device),
   `firmware()` (the raw OTT and `JSON.stringify(rbody)` with the api key, plus 4 path lines),
   `getAvailableEnvironmentHash` (the envelope and hash), `update_binary`'s catch line (the path
   in the ENOENT message), `artifact` (the path) and `initWithOwner` (the owner id). Commit
   `19c8371b`.
2. **[Rule 2] Owner guard in `latestFirmwarePath`, and `build_id` guard in `artifact`.** These go
   beyond the udid-only truth. The visible result does not change: an invalid owner already
   answered `false` through a nonexistent path, and `router.build` already rejects a malformed
   `build_id`. The difference is that neither now builds a path or touches the filesystem first.

## Verification

All runs used a temp jasmine config (`helpers: []`, `random: false`, `timeout: 10000`) and
`ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y npx jasmine --config=<tmp>`.

- New spec alone (`/tmp/l8k-new.json`): **39 specs, 0 failures**. It also ran 3 times in random order: 39/0 each.
- New spec plus the full regression set, 29 files: DeviceDocLogLeak, FirmwareLookup, DeviceOtt,
  DeviceFirmwareOwner, TransferRecipient, TransferApiKey, DeviceOwnership, DeviceRegisterOwner,
  DevicePushOwner, ApikeyExactMatch, ApikeyExposure, OwnerDefaultMqttKey, CsrfRouteInventory,
  MeshSessionAuth, MessengerDropLimiter, MessengerDeviceWrites, MessengerFailSafe,
  MessengerOwnership, MessengerOwnerSocket, BuilderApiKey, GoogleOAuthState,
  GitHubOAuthIsolation, Util, SecretsSweep, LoggingQualityAudit, OwnerLogLeak, Sanitka,
  Deployment, Plugin.
  - **liv's file order, new spec first (`/tmp/l8k-final.json`)**: **859 specs, 1 failure**, twice.
    The one failure is PluginSpec "use all plugins at once", a known gap: the test repos are
    absent locally.
  - **In the order the task lists them, with Deployment second (`/tmp/l8k-all.json`)**:
    **859 specs, 2-3 failures**. Besides PluginSpec, the failures are `Unhandled promise rejection:
    EROFS mkdir '/mnt'`, which lands in DeploymentSpec "return latest firmware path" and/or
    DeviceOtt I1. This is liv's known macOS-only flake: DeploymentSpec's `initWithOwner` →
    `mkdirp('/mnt/data/…')` rejects later, inside whatever spec is running at the time. **It
    predates this task.** The same 28-file order run on an export of the pre-task commit
    `c80930df` hit the same DeviceOtt I1 failure in 3 of 3 runs and the Deployer one in 1 of 3.
    That export also had BuilderApiKey failures caused by the incomplete export, so they are not
    comparable. In isolation (DeviceOtt + Deployment + new spec), the same rejection
    occasionally lands in a DeviceDocLogLeak spec instead. Every such failure message is EROFS,
    never an assertion.
- ESLint is clean on `lib/thinx/device.js`, `lib/thinx/deployment.js` and the new spec.
- No `fit`/`fdescribe`/`xit`/`xdescribe`.
- No ZZ spec was relied on; the behaviour is pinned by the LOCAL spec.

## Open questions

1. **What "differ" means for `env_hash`:** the code keeps the old containment test (no offer if
   the device hash *contains* the envelope hash). Strict `!==` would differ only when one hash is
   a proper substring of the other. I did not change it, because it is user-visible and was not
   asked for.
2. **`sanitka.udid` logs its raw input** on failure (`UDID RegEx and replace failed: <input>`).
   Every guard added here calls it, so a hostile udid string still reaches the log, unescaped.
   That is a log-injection surface, not an owner or key leak. It is pre-existing and was left
   alone because the change would affect every caller.
3. **Remaining leaks outside these paths (not changed):**
   - SigFox branches in `checkinExistingDevice` and new-device registration
     (`console.log(JSON.stringify(reg))`).
   - `markUserBuildGoal` (`JSON.stringify(body)`).
   - `revoke` (`console.log(err)`, and `"revision undefined in doc", doc`).
   - `Device#getEnvs`/`detail` (raw error objects).
   - `validateHasUpdateAvailable` (`console.log({ device })`; not on the check-in path).
4. A temp export of the pre-task tree is still at `/tmp/l8k-base`; the sandbox denied `rm -rf`
   on it. It is safe to delete.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or trust-boundary change. The new log lines carry reason codes,
filtered error codes, sanitized udids, build ids (udid-shaped) or a redacted token prefix.

## Self-Check: PASSED

- FOUND: spec/jasmine/DeviceDocLogLeakSpec.js, lib/thinx/device.js, lib/thinx/deployment.js
- FOUND commits: 5bf655bd, 19c8371b
