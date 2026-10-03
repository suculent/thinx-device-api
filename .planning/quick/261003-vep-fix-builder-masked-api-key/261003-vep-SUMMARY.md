---
phase: quick-261003-vep
plan: 01
status: complete
subsystem: builder-apikey-mqtt
tags: [security, apikey, builder, mqtt, tdd, jasmine]
requirements: [VEP-BUILDER-APIKEY]
dependency_graph:
  requires: [quick-261003-u86 (findDeviceKey, isOwnerMqttKey, parseKeyStore), quick-261003-vbg (withAcceptedDevice, topic helpers, logDroppedDeviceMessage), quick-261003-w0c (THINX_MQTT_DEVICE_WRITES gate, isPlainMessage)]
  provides: [APIKey#get_device_apikey, Builder#getDeviceAPIKey, create() duplicate/malformed-store refusal, random create_key, MQTT registration with the device's own key]
  affects: [lib/thinx/builder.js run_build THINX_API_KEY, lib/thinx/messenger.js mqttDeviceRegistration/registerDevice, POST /api/user/apikey and /api/v2/apikey duplicate alias]
tech_stack:
  added: []
  patterns: [pre-image of lastkey as the device credential, reason-code callbacks split into device-level (build with "") and store-level (refuse)]
key_files:
  created:
    - spec/jasmine/BuilderApiKeySpec.js
    - .planning/todos/pending/2026-10-03-apikey-cleartext-exposure.md (uncommitted)
  modified:
    - lib/thinx/apikey.js
    - lib/thinx/builder.js
    - lib/thinx/messenger.js
    - spec/jasmine/BuilderRemoteJobSpec.js
    - spec/jasmine/XBuilderSpec.js
    - spec/jasmine/ApikeySpec.js
    - .planning/todos/completed/2026-10-03-builder-embeds-masked-api-key.md (moved from pending/, uncommitted)
decisions:
  - "THINX_API_KEY is the pre-image of the device's lastkey (entry key or hash), never the owner's Default MQTT key; \"\" for unidentified/ambiguous/Default devices; build_requires_api_key for no keys, malformed store or Redis error"
  - "MQTT registration runs only for the topic owner's own device (vbg's withAcceptedDevice plus owner === topic owner, so a transferred device's previous-owner topic does not register) with its own credential; no key creation on that path"
  - "create_key is crypto.randomBytes(32) hex; create() refuses duplicate key/alias and a non-array store without writing"
metrics:
  duration: ~10 min
  completed: 2026-10-04
estimate:
  tokens: 110000
  tasks: 3
actuals:
  tokens: 12135    # chars/4 over git diff e2f178b8..8ea88930 (48541 chars)
  tasks: 3
  commits: 4
plan_head_before: e2f178b8941e1165bb1bbe5e5ec707b5fd803327
plan_head_after: 8ea88930585a2b4c2ce2735ce99eea335b811882
---

# Quick 261003-vep: builder embeds the device's own API key Summary

THiNX builds now write the device's own credential into `THINX_API_KEY`: the key or the hash whose sha256 is the device's `lastkey`. They never write the masked list name, another entry, or the owner's Default MQTT key. Builds embed `""` when no own key is attributable. `create()` refuses duplicate keys and aliases on the parsed store, and new keys are random. MQTT registration re-registers only the publishing device, with its own key.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `238c1624` | test(quick-261003-vep): failing spec for the builder's masked API key, duplicate creates and the MQTT registration key |
| 2 | `28905881` | fix(quick-261003-vep): builder embeds the device's own API key, never the masked list name |
| 3 | `ef87af26` | fix(quick-261003-vep): create() refuses duplicate API keys and aliases; keys are 256-bit random |
| 4 | `8ea88930` | fix(quick-261003-vep): MQTT registration re-registers only the publishing device with its own key |

- All four commits are unsigned (`git -c commit.gpgsign=false`, the operator's standing exception). `--no-verify` was never used.
- The RED commit touches only the two spec files.
- `services/console` was not staged. Nothing was pushed.
- The todo move/resolution and the follow-up todo are on disk only, **not committed** (orchestrator constraint).

## RED evidence (commit 1, before any lib/ change)

`BuilderApiKeySpec.js`: **54 specs, 47 failures**. Failures were 19 `TypeError: ak.get_device_apikey is not a function` raised inside `it`, plus chai AssertionErrors. There were no load crashes or harness errors.

| Describe | Specs | Failing on RED | Passing on RED (as predicted) |
|---|---|---|---|
| VEP core | 20 | 20 | none |
| VEP builder | 8 | 6 (own key, own hash, 4 empty-key cases) | 2 refused cases (no keys, Redis error) |
| VEP create | 7 | 6 (alias, key, same-second, Default, `{}`, non-JSON) | the no-secret capture |
| VEP list | 1 | 0 | 1 |
| VEP messenger | 18 | 15 (own key, own hash, messageResponder wiring, 9 routing cases, 3 failed-callback cases) | non-status topic, null registration, success publish |

- BuilderRemoteJobSpec stayed green with the added `getDeviceAPIKey` stub: 75 specs, 0 failures.
- The RED output contained no fixture key or hash. I checked it with a sha256 scan of the output: 0 hits.

## Key rule as implemented

`APIKey#get_device_apikey(owner, lastkey, cb)`:
1. If the owner is not a non-empty string, it answers `invalid_owner` without calling Redis.
2. A GET error answers `apikey_store_unavailable`.
3. `parseKeyStore` null answers `apikey_store_invalid`; an empty array answers `owner_has_no_api_keys`.
4. `findDeviceKey` ambiguous answers `device_key_ambiguous`; not found answers `device_key_not_identified`.
5. `isOwnerMqttKey` answers `device_key_is_owner_mqtt_key`.
6. Otherwise it answers `entry.key` if `sha256(key)` equals lastkey, else `entry.hash` if `sha256(hash)` equals lastkey (both compared with `Util.safeEqual`), else `device_key_not_identified`.

It never writes. Refusals log one line with the owner id and the reason code.

`Builder#getDeviceAPIKey(owner, device, cb)`:
- device-level reasons (`DEVICE_LEVEL_APIKEY_REASONS`) give `(true, "")` and a warning naming the udid and the reason;
- store-level reasons give `(false, reason)`, and run_build refuses with `build_requires_api_key`, as before;
- `run_build` refuses whenever the value is not a string.

The `list()`-based builder fetcher was removed. `list()` and `get_first_apikey` are unchanged.

## vbg helper mapping and adaptations

- **`withOwnedDevice` is `withAcceptedDevice`** (as landed by vbg). It also accepts a transferred device's previous-owner topic as `doc.owner`. Registration additionally requires `owner === oid`, so only the topic owner's own device registers (the plan's "device owned by that owner"). The drop reason is `registration_foreign_owner`, and a spec case pins it. I used the Task 3 verify with the `withAcceptedDevice(` grep for the same reason.
- **w0c gate kept.** `mqttDeviceRegistration` still runs only when `THINX_MQTT_DEVICE_WRITES=1`. VEP messenger sets and restores the flag per case.
- **vbg's per-message drop marker** is passed into `mqttDeviceRegistration` as an optional 4th argument, so a registration drop and a status drop of one message still print at most one line.
- **Payload shape.** `message` and `registration` must pass w0c's `Messenger.isPlainMessage` (a non-null, non-array, non-Buffer object).
- **Unknown reason codes.** A reason that is not a `[a-z_]` code is logged as `device_key_unavailable`. This covers w0c's FailSafe fake, which calls back `(false)`.
- **No harness extension** was needed in MessengerOwnershipSpec, MessengerFailSafeSpec or MessengerOwnerSocketSpec: all three stayed green unchanged.

## Verification

- **Task 1 verify:** printed **VEP-TRACER-GREEN**.
  - VEP core|builder: 28 specs, 0 failures.
  - Plan regression list (18 files): 559 specs, 0 failures.
  - RED precedes FIX, no `lib/` in RED, old fetcher names gone, `node --check` and ESLint clean.
- **Tracer gate:** the automated verify re-ran green, so execution continued.
- **Task 2 verify:** printed **VEP-CREATE-GREEN**.
  - VEP core|builder|create|list: 36 specs, 0 failures.
  - Regression list: 559 specs, 0 failures.
- **Task 3 verify:** printed **VEP-GREEN**, using the `withAcceptedDevice(` mapping. Full BuilderApiKeySpec plus regression list: **613 specs, 0 failures**. `git diff --quiet -- lib/ spec/` passes.
- **Orchestrator regression set + plan specs**, one process (`npx jasmine --config=/tmp/vep-jasmine.json`, `helpers: []`, `ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y`): **776 specs, 0 failures**, exit 0. Per file:

| Spec | Specs | Failures |
|---|---|---|
| BuilderApiKey | 54 | 0 |
| BuilderRemoteJob | 75 | 0 |
| BuilderPath | 34 | 0 |
| JSON2H | 3 | 0 |
| DeviceFirmwareOwner | 10 | 0 |
| MessengerFailSafe | 30 | 0 |
| MessengerOwnership | 39 | 0 |
| MessengerOwnerSocket | 24 | 0 |
| ApikeyExactMatch | 35 | 0 |
| BuildLogOwner | 14 | 0 |
| CsrfRouteInventory | 77 | 0 |
| DeviceOwnership | 45 | 0 |
| DevicePushOwner | 19 | 0 |
| DeviceRegisterOwner | 29 | 0 |
| MeshSessionAuth | 48 | 0 |
| TransferApiKey | 36 | 0 |
| DeviceOtt | 34 | 0 |
| LogTailOwner | 20 | 0 |
| GoogleOAuthState | 9 | 0 |
| GitHubOAuthIsolation | 9 | 0 |
| Util | 25 | 0 |
| SecretsSweep | 32 | 0 |
| LoggingQualityAudit | 10 | 0 |
| OwnerLogLeak | 7 | 0 |
| Sanitka | 58 | 0 |

- **Sibling local specs added since `3e3ded6f`:** BuilderApiKey, DeviceFirmwareOwner, DeviceOtt, DevicePushOwner, GoogleOAuthState, LogTailOwner, MessengerFailSafe, MessengerOwnerSocket, MessengerOwnership and TransferApiKey. All are in the table above and all are green.
- **CI-like conditions:** ENVIRONMENT was set to `test` in a top-level beforeEach, with random order, 3 runs. BuilderApiKey, MessengerOwnership, MessengerFailSafe, MessengerOwnerSocket and BuilderRemoteJob gave **222 specs, 0 failures** each time.
- **No `fit`/`fdescribe`.**
- **Not run locally:** ApikeySpec (01b) and XBuilderSpec "should refuse a device API key for an owner without keys" need Redis. They are CI specs (not ZZ) and were only `node --check` + ESLint checked. No ZZ spec was added or changed, so there are no `unrun-verify` WINDOWS.md entries.

## Deviations from Plan

1. **[Constraint] Todos not committed.** The plan's Task 3 commit includes the three todo paths, but the orchestrator constraint forbids committing `.planning/todos/*`. The pending todo was moved with plain `mv` (not `git mv`, so nothing is staged), the Resolution was appended, and the follow-up todo was created. All three are on disk for the docs commit. The Resolution's commit list is final.
2. **[Helper mapping] `withAcceptedDevice` plus `owner === oid`.** See the mapping section. This keeps the plan's rule ("a device the owner owns"; a transferred-away device is foreign) on top of vbg's broader accept rule.
3. **[Rule 2 - consistency] Drop marker passed through.** `mqttDeviceRegistration(topic, message, oid, drop)` keeps vbg's "at most one drop line per message" when both the registration and the status edit drop the same message.
4. **[Spec choice] `registerDevice` failure line.** The plan says to log the reason only when it is a string. It is taken from a string response, or from the string `registration.response` that `Device#register` returns on its failure path. Both are reason codes.
5. **[Spec addition] Extra routing pins** beyond the plan's list, all within the plan's rule:
   - a transferred-away device with a live binding;
   - a registration without an owner;
   - the real `messageResponder` wiring with the flag on.

## Operator-facing changes (not pushed or deployed)

1. Builds for devices with an identifiable own key embed a working key (the key or the hash, whichever the device uses). Other builds embed `""`, and the device keeps its saved key. OTA is unaffected.
2. Devices on the owner's Default MQTT API Key get no embedded key. Remedy: create a dedicated key, enter it on the device, and let the device check in once.
3. `POST /api/user/apikey` and `/api/v2/apikey` with an alias the owner already has answer `set_api_key_failed`. New keys are random. Existing duplicate entries stay, and devices on them count as ambiguous, so their builds embed `""`.
4. MQTT registration (still gated off by `THINX_MQTT_DEVICE_WRITES`) re-registers only the publishing device, with its own key, and never creates a key.
5. No data migration.

## Open questions / follow-ups

All are in `.planning/todos/pending/2026-10-03-apikey-cleartext-exposure.md`:
- `list()` returns the cleartext key to the console.
- The create route and `Owner#create_mqtt_access` log new keys.
- `thinx_build.json` and the generated header stay in the build tree and artifact zip.
- `Owner#create_default_mqtt_apikey` cannot see an existing Default key. Since vep, `Owner#create` therefore fails for an owner whose `ak:` store survived without a user document.
- `get_first_apikey` no longer has a production caller.
- Per-device key minting at build time is an option for later.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or auth path. The new log lines carry an owner id or udid and a reason code only.

## Self-Check: PASSED

- FOUND: spec/jasmine/BuilderApiKeySpec.js; lib/thinx/apikey.js (`get_device_apikey(owner, lastkey, callback)`, `randomBytes(32)`, `"apikey_store_invalid"`); lib/thinx/builder.js (`getDeviceAPIKey(owner, device, callback)`, `this.apikey.get_device_apikey(`); lib/thinx/messenger.js (`this.akey.get_device_apikey(` inside mqttDeviceRegistration); .planning/todos/completed/2026-10-03-builder-embeds-masked-api-key.md (`## Resolution`); .planning/todos/pending/2026-10-03-apikey-cleartext-exposure.md
- FOUND commits: 238c1624, 28905881, ef87af26, 8ea88930 (`git rev-list --count e2f178b8..HEAD` = 4)
