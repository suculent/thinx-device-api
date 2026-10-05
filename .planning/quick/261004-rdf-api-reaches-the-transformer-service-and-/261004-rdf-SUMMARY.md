---
phase: quick-261004-rdf
plan: 01
subsystem: device-api
status: complete
tags: [device-api, transformer, swarm, null-safety, logging, tdd, jasmine]

requires:
  - phase: quick-261003-u86
    provides: "job device copy never carries lastkey; check-in persists lastkey"
  - phase: quick-261003-w0c
    provides: "MQTT-triggered transformers hard off (messenger.js notice), unchanged here"
  - phase: quick-261004-l8k
    provides: "Device.errorCode; update_device_and_respond logs a reason code + udid only"
provides:
  - "Device.transformerTarget(env, config): TRANSFORMER_URL (http/https, no credentials) > ENVIRONMENT=test localhost:<lambda> > http://transformer:7474; parsed once at module load"
  - "Device.transformerResult(statusCode, buffer): {ok, status} | {ok:false, reason} for the services/transformer response shape"
  - "Device#transformerJobs / #postTransformerJobs / #patchTransformedStatus; Device.transformerTimeoutMs (5000)"
  - "Device#runDeviceTransformers safe for the check-in, run_transformers and MQTT call shapes"
  - "DeviceTransformersSpec (26 local cases, in-process transformer stub)"
affects: [device-api, check-in, POST /api/transformer/run, mqtt-device-writes-gated todo item 1]

actuals:
  tokens: 12985    # chars/4 over git diff 442a8abb..9d7e4f66 (51940 chars)
  tasks: 2
  commits: 2
plan_head_before: 442a8abb1cec9d507b3a632fb094d153caa957a3
plan_head_after: 9d7e4f660747e3e52af9a157f0b37b6dadca4c2a

tech-stack:
  added: []
  patterns:
    - "Service target parsed once at module load from an env URL; pure static parser exported for specs"
    - "Outbound request with exactly-once completion: settle guard, hard abort timer, response size cap"
    - "Write without a check-in = re-read + compare-the-transformed-field + patch only that field"

key-files:
  created:
    - spec/jasmine/DeviceTransformersSpec.js
  modified:
    - lib/thinx/device.js
    - spec/jasmine/DeviceRegisterOwnerSpec.js
    - .planning/todos/pending/2026-10-03-mqtt-device-writes-gated.md (uncommitted)

key-decisions:
  - "Target: TRANSFORMER_URL wins; else ENVIRONMENT=test keeps localhost:<app_config.lambda> (7475 when unset); else http://transformer:7474. Non-http(s), credentials in the URL or an unparseable value disable transformers (transformer_target_invalid per run, one warning at load)"
  - "Check-in shape is unchanged without transformers (update_device_and_respond with the check-in document). With transformers, a result sets device.status and the same path persists and answers once; a failure leaves the check-in status as the device sent it"
  - "status_raw / status_error are no longer written by the transformer path (the plan: a result updates only device.status)"
  - "Without a check-in (reg null), nothing is written without a result; a result is written as {status} only after a re-read, and skipped (status_changed) if the stored status is no longer the transformed one"
  - "The transformer service answers error:\"transformer_error\" on every request outside ENVIRONMENT=test, so success is decided by HTTP 200 + an `output` that is a string (numbers/booleans stringified, max 1024 chars) and not one of its rejection texts"
  - "POST /api/transformer/run answers (true, \"no_transformers\") / (true, \"status_transformed\") / (false, <reason code>) instead of a registration response; it no longer writes the device back or issues an OTT"
  - "Undecodable transformer bodies are skipped (transformer_decode_failed) instead of aborting the check-in without an answer"

requirements-completed: []

duration: ~13min
completed: 2026-10-04
---

# Quick 261004-rdf: API reaches the transformer service; runDeviceTransformers null-safe Summary

**The API now posts transformer jobs to `http://transformer:7474/do` (or `TRANSFORMER_URL`) in the
shape the transformer service expects, applies the result to `device.status` only, and leaves the
status untouched with one reason line on any failure or timeout. `runDeviceTransformers` no longer
throws or writes back a stale document when `reg`, `callback` or `res` is null. MQTT-triggered
transformers stay hard off; `messenger.js` is unchanged.**

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `3ca451d4` | test(quick-261004-rdf): failing spec for transformer target and null-safe runDeviceTransformers |
| 2 | `9d7e4f66` | fix(quick-261004-rdf): API reaches the transformer service; runDeviceTransformers null-safe |

`git rev-list --count 442a8abb..HEAD` = 2. Both are unsigned (`git -c commit.gpgsign=false`, the
operator's standing exception). `--no-verify` was never used, nothing was pushed, only explicit paths
were staged and no submodule was touched. This SUMMARY and the todo update are on disk only.

## RED evidence

`DeviceTransformersSpec.js` on unfixed code: **26 specs, 25 failures**. The one that passed is the
pin of today's behaviour (check-in without transformers posts nothing and persists once). Failures:
- target (5): `Device.transformerTarget` did not exist; nothing reached the stub (the old code
  posted to `localhost:7475`).
- request contract: no request reached the stub.
- check-in shape: the result was never applied (status stayed the input); every failure mode wrote
  `status_error: null` (and `status_raw`); the timeout case logged no reason line; an undecodable
  body never answered the check-in; a missing profile threw `TypeError: … reading 'info'`.
- null shapes: `TypeError: … (reading 'status')` thrown synchronously for every reg-null shape with
  transformers; without transformers the reg-null shapes wrote the read document back (1 write).
- `run_transformers`: never answered when the profile read failed, and could not transform.

## What changed (`lib/thinx/device.js`)

- **Target** (`transformerTarget` :55, `TRANSFORMER_TARGET` :82, `Device.transformerTarget` :645):
  `TRANSFORMER_URL` (trimmed, http/https only, no user/password; `[::1]` unbracketed; base path +
  `/do`) > `ENVIRONMENT=test` → `http://localhost:<app_config.lambda | 7475>` > `http://transformer:7474`.
  Parsed once at module load; an invalid value logs one warning (without the URL) and every run then
  fails as `transformer_target_invalid`.
- **Jobs** (`transformerJobs` :605): one job per `device.transformers` utid defined in
  `profile.info.transformers` (arrays or objects; a missing/odd profile yields no jobs instead of a
  TypeError). `params.status` is the status that is transformed (`reg.status` on check-in, else
  `device.status`; the old code sent `device.status` while gating on `reg.status`). lastkey is still
  removed from the job's device copy. An undecodable body is skipped with one
  `[transformer] skipped: transformer_decode_failed` line (the old code returned without answering).
- **Request** (`postTransformerJobs` :696): `POST <target>/do`, `Content-Type: application/json`,
  `Content-Length`, body `{jobs, device: <udid>}`. The top-level `device` is required by
  `services/transformer/transformer.js` `process()`; without it the service answers
  `{success:false, error:"missing: device"}`, so the old request could never have worked even when
  reachable. http or https per target. Exactly one completion: a settle guard, a hard abort after
  `Device.transformerTimeoutMs` (5000; the old `timeout` option only emitted an event nobody
  handled), and a 64 KB response cap.
- **Response** (`Device.transformerResult` :655): HTTP 200, a JSON object, `success !== false`, an
  `output` key, `error` absent/null/`"transformer_error"`, an output that is a string of at most
  1024 characters (finite numbers and booleans are stringified) and not the service's own rejection
  texts (`child process not allowed`, `lambda function missing`). Reasons: `transformer_http_error`,
  `transformer_bad_response`, `transformer_rejected`, `transformer_output_invalid`; transport:
  `transformer_unreachable (<errno code>)`, `transformer_timeout`.
- **runDeviceTransformers** (:797):
  - check-in (reg is an object): no jobs → `update_device_and_respond(device.udid, device, …)` as
    before; result → `device.status = result`, then the same call; failure → one
    `⚠️ [warning] [transformer] not applied: <reason>, udid <udid>` line, then the same call with the
    status as the device sent it. The device is answered exactly once in every case.
  - no check-in (reg null/undefined): no jobs → `(true, "no_transformers")`, nothing written; failure
    → reason line, `(false, <reason>)`, nothing written; result → `patchTransformedStatus` (:771)
    re-reads the device, refuses a missing or re-owned document (`device_not_found`) or a stored
    status that is no longer the transformed one (`status_changed`), then `atomic modify {status}` only.
    A callback that is not a function is never called.
  - The dead `websocket` block (an undeclared global) and the undeclared `udid` lookup are gone.
- **run_transformers** (:1440): a failed owner profile read now answers `(false, "owner_not_found")`
  and logs a reason code + udid (it used to log the raw error and never answer).
- **Logs**: no line in the transformer path carries the owner id, lastkey, code, status values or
  device fields. Success logs `ℹ️ [info] [transformer] applied N job(s), udid <udid>`.

`spec/jasmine/DeviceRegisterOwnerSpec.js` case 19 used to aim the job at its capture server by
mutating `app_config.lambda` at call time. The target is now parsed once, so the case redirects
`http.request` to the capture server with a jasmine spy instead; its assertions are unchanged.

## Production wiring

No new env var is needed. Checked read-only on 2026-10-04: `thinx_api` runs with
`ENVIRONMENT=production` and no `TRANSFORMER_URL`, so the target is the default
`http://transformer:7474`. Both services are on the `internal` overlay network
(`docker-swarm.yml`), and the plan recorded that `transformer:7474 POST /do` answered 200 from the
API container. `conf` `lambda: 7475` is now only used under `ENVIRONMENT=test`.

## Test results

All local runs used a temp jasmine config with `helpers: []` and
`ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y npx jasmine --config=<tmp>`.

| Run | Result |
|-----|--------|
| DeviceTransformersSpec, before the fix (RED) | 26 specs, 25 failures |
| DeviceTransformersSpec, after the fix | 26 specs, 0 failures |
| DeviceTransformersSpec + DeviceRegisterOwnerSpec after the lint fix | 55 specs, 0 failures |
| New spec + regression set (DeviceDocLogLeak, FirmwareLookup, Deployment, DeviceOtt, DeviceFirmwareOwner, DeviceOwnership, DeviceRegisterOwner, DevicePushOwner, TransferRecipient, TransferApiKey, MessengerDeviceWrites, MessengerFailSafe, MessengerOwnership, MessengerOwnerSocket, ApikeyExactMatch, BearerVerifyStatus, CsrfRouteInventory, Util, SecretsSweep, LoggingQualityAudit, OwnerLogLeak, Sanitka) | 727 specs, 2 failures |
| Same set without the new spec (flake comparison) | 701 specs, 2 failures |

The 2 failures are the known local-only flake: `Unhandled promise rejection: Error: EROFS: read-only
file system, mkdir '/mnt'`, attributed to `Deployer should be able to return latest firmware path`
and `DeviceOttSpec I1`. They happen identically without the new spec. The first full run also
failed DeviceRegisterOwnerSpec 19 (see above). It passed after the spec change.
`npx eslint` on the three changed files is clean.

`ENVIRONMENT=test` could not be run locally (`Config not found in /mnt/data/conf/config.json`). Under
test, the new spec's `TRANSFORMER_URL` still wins, and case 19 redirects through the spy.

## Transformer latency under the production caps

I ran the published `thinxcloud/transformer:latest` image (2.1.159, built 2026-09-29) locally on an
x86_64 Docker host with `--cpus 0.05 --memory 64m`. A preload capped `os.cpus()` at 2, so it forks
2 workers like `micro` (`nproc` = 2). Unmodified, it forks 8 workers locally, sits at the 64 MB limit
and never became ready in 120 s. The payload was the API's own request shape; the trivial transform
was `return status + '!'`.

| Case | Capped (0.05 CPU) | Uncapped |
|------|-------------------|----------|
| Container ready | 25 s | 1 s |
| First request (cold) | 1030 ms | 53 ms |
| 30 sequential, trivial | p50 101 ms, p90 296 ms, max 300 ms | p50 6 ms, max 39 ms |
| 20 at concurrency 5 | p50 401-699 ms, max 985-4287 ms | (not run) |
| 20 at concurrency 10 | p50 1082 ms, max 2686 ms | p50 55 ms, max 102 ms |
| Loop of 1e6 iterations | p50 299 ms, max 497 ms | (not run) |
| Loop of 5e6 iterations (~28 ms CPU uncapped) | p50 596 ms, max 801 ms | ~28 ms |
| Loop of 2e7 / 6e7 iterations | **~1.1 s, sandbox timeout, output = the input status** | (not run) |

**Assessment.** The 1 s sandbox timeout is wall-clock, and the 0.05 CPU cap stretches CPU time
about 20×. In practice:
- A trivial transform fits in the budget once warm: about 100 ms at p50 and 300 ms at worst.
- Any transform that needs more than about 40-50 ms of real CPU hits the 1 s sandbox timeout.
- Bursts of concurrent check-ins queue for seconds: 2.7-4.3 s at the worst observed points. That is
  still inside the API's 5 s abort, but with little margin.
- The first request after a (re)start takes about 1 s.

So the CPU cap makes the 1 s budget unrealistic for anything beyond primitive transforms. Raising
the limit to about 0.25-0.5 CPU would remove most of the stretch. That is a swarm config decision
and was not changed here. The memory limit is tight as well: the local 2-worker container sat at
about 62 of 64 MB, while production showed 32 MB.

The service reports a sandbox timeout as `{output: <input status>, error: "transformer_error"}`,
which looks the same as a successful identity transform. The API therefore writes the unchanged
status back. That is harmless, because only the same value is written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The request lacked the top-level `device` the transformer requires**
- **Found during:** Task 2, reading the `services/transformer` contract
- **Issue:** `process()` answers `missing: device` without it, so even a reachable service would have rejected every job.
- **Fix:** the body is `{jobs, device: <udid>}`.
- **Commit:** `9d7e4f66`

**2. [Rule 1 - Bug] The `timeout` option never aborted the request; undecodable bodies and a failed profile read never answered**
- **Fix:** a hard abort timer with exactly-once completion; skip undecodable transformer bodies; `run_transformers` answers `owner_not_found`.
- **Commit:** `9d7e4f66`

**3. [Rule 3 - Blocking] DeviceRegisterOwnerSpec 19 depended on `app_config.lambda` read at call time**
- **Fix:** an `http.request` spy redirects to its capture server; the assertions are unchanged.
- **Files:** `spec/jasmine/DeviceRegisterOwnerSpec.js`
- **Commit:** `9d7e4f66`

**4. [Lint] Unused catch bindings** renamed to `_e`/`_err` (the repo rule), including 3 in the RED spec. Committed with the fix.

## MQTT: what remains before transformers may run from MQTT

`lib/thinx/messenger.js` is unchanged; the `transformers_disabled` notice still replaces the call.
Enabling it is a code change:
1. After a successful `Device#edit({udid, status})` in `updateAndTransformDeviceStatus`, call
   `Owner#profile` and then `runDeviceTransformers(profile, doc_with_new_status, null, null, null)`.
   The patch compares the stored status against the document's status, so the document passed must
   carry the status that was just written.
2. Decide whether every accepted MQTT status (LWT included) is worth a transformer round trip under
   the 0.05 CPU cap (see above).
3. Add a MessengerDeviceWrites case for it.

The todo `.planning/todos/pending/2026-10-03-mqtt-device-writes-gated.md` item 1 is updated to say
so (uncommitted).

## Open questions / findings (not fixed, out of scope)

- **Check-in logs the whole registration body.** `checkinExistingDevice` runs `console.log(JSON.stringify(reg))`
  (the `// COPY B` line, now `lib/thinx/device.js:564`, plus a second copy in the new-device path at :1185). It logs the owner
  id and the device status on every check-in. This is pre-existing and was not changed, because the
  plan kept the check-in path unchanged. It is worth a one-line follow-up.
- **The transformer service logs sensitive data** (`services/transformer`, submodule, not touched):
  - it logs `"Evaluating code:'<code>'"` and `"Returned args: <status>"`;
  - it logs `{ req }` on every request;
  - it logs `Invalid code: <code>`.
  It also always answers `error: "transformer_error"` outside test, so callers cannot tell success
  from failure.
- **CPU and memory caps:** see the assessment above (0.05 CPU / 64 MB).
- **Check-in may answer twice when it marks the build goal.** `markUserBuildGoal` can call back
  before `runDeviceTransformers` answers, on a check-in whose firmware matches the latest envelope
  and whose owner goals change. This is pre-existing and unrelated to transformers.

## Self-Check: PASSED

- FOUND: `spec/jasmine/DeviceTransformersSpec.js`, `lib/thinx/device.js` (transformerTarget :55, runDeviceTransformers :797)
- FOUND: commits `3ca451d4`, `9d7e4f66` (`git rev-list --count 442a8abb..HEAD` = 2)
