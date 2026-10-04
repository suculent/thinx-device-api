---
phase: quick-261004-seq
plan: 01
subsystem: transformer-service
status: complete
tags: [transformer, isolated-vm, logging, response-contract, tdd, jest]

requires:
  - phase: quick-261004-rdf
    provides: "API posts {jobs, device} to transformer:7474/do; Device.transformerResult decides success"
provides:
  - "POST /do: success {output: <string>} only; failure {success:false, error:<reason code>} with no output"
  - "Reason codes: sandbox_timeout, sandbox_memory, sandbox_error, output_invalid, lambda_missing, code_rejected, code_invalid, invalid_jobs, bad_request (HTTP 400)"
  - "No code, status, device, owner, request object or exception text in service logs; one id+reason line per request"
  - "transformer.test.js (18 cases): response shapes, log hygiene, pinned sandbox properties"
affects: [services/transformer, thinxcloud/transformer:latest, Device.transformerResult (compatible, unchanged)]

actuals:
  tokens: 7682     # chars/4 over git diff a75c490..b28185c in services/transformer (30728 chars)
  tasks: 2
  commits: 2
repo: services/transformer (thinx-cloud/transformer, branch main)
plan_head_before: a75c490385d1d9f0e5111960da0729289dcd2de3
plan_head_after: b28185c6ef4015e956b35ef5255f943821a6e8ac

key-files:
  created:
    - services/transformer/transformer.test.js
  modified:
    - services/transformer/transformer.js
    - services/transformer/README.md
    - services/transformer/package.json
    - services/transformer/package-lock.json
    - services/transformer/Dockerfile

key-decisions:
  - "Failure shape is {success:false, error:<code>} with no output: the API's transformerResult already rejects success:false, so no API change is needed"
  - "Numbers/booleans are stringified by the service; anything else (undefined, null, object, NaN) is output_invalid"
  - "Any job failure ends the chain; no partial output is reported"
  - "The existing 'missing: body.jobs' / 'missing: device' / 'missing: body' rejections keep their text (documented contract, not sensitive)"
  - "Sandbox log() stays callable but its arguments are dropped; only the call count is logged"
  - "Version 2.2.0 (package.json, lockfile root, Dockerfile labels)"

duration: ~25min
completed: 2026-10-04
---

# Quick 261004-seq: transformer service logging and honest result Summary

**`POST /do` now answers `{output: "<string>"}` on success and `{success: false, error: "<reason>"}`
with no output on every failure, so a sandbox timeout no longer echoes the input status as a
"transform". The service logs one line per request (random id, job count, duration, suppressed
`log()` count or reason code) and never logs code, statuses, device objects, owner ids, the request
object or exception text. The isolated-vm sandbox is unchanged.**

## Commits (services/transformer, branch main, not pushed)

| # | Hash | Message |
|---|------|---------|
| 1 | `093303f` | test(quick-261004-seq): failing spec for honest /do results and no sensitive logging |
| 2 | `b28185c` | fix(quick-261004-seq): honest /do results; never log code, status, device or req |

`git rev-list --count a75c490..HEAD` = 2. Both unsigned (`-c commit.gpgsign=false`), no
`--no-verify`, nothing pushed. Nothing staged or committed in the parent repo; the parent now shows
` M services/transformer` (submodule pointer) for whoever bumps it.

## Response contract

| Case | Before (prod, ENVIRONMENT != test) | After |
|------|------|------|
| success | `{"output": s, "error": "transformer_error"}` | `{"output": s}` |
| sandbox timeout | `{"output": <input status>, "error": "transformer_error"}` | `{"success": false, "error": "sandbox_timeout"}` |
| lambda throws / syntax error | `{"output": <previous status>, "error": "transformer_error"}` | `{"success": false, "error": "sandbox_error"}` |
| isolate memory limit | same as above | `{"success": false, "error": "sandbox_memory"}` |
| returns undefined/null/object | `output` missing or non-string | `{"success": false, "error": "output_invalid"}` |
| returns number/boolean | raw number/boolean | stringified `{"output": "42"}` |
| `child_process` in code | `{"output": "child process not allowed", "error": "transformer_error"}` | `{"success": false, "error": "code_rejected"}` |
| no `transformer` in code | `{"output": "lambda function missing", "error": "transformer_error"}` | `{"success": false, "error": "lambda_missing"}` |
| empty / malformed jobs | HTTP 500 (TypeError, stack logged) | `{"success": false, "error": "invalid_jobs"}` |
| unparseable JSON body | HTTP 400 HTML, parse error (quotes the body) logged | HTTP 400 `{"success": false, "error": "bad_request"}` |
| missing jobs / device | `{"success": false, "error": "missing: ..."}` | unchanged |

All JSON responses now carry `Content-Type: application/json`. The response shape is the same under
`ENVIRONMENT=test` and production (before, test answered a different shape, so tests never covered
the production one).

## API side (parent `lib/thinx/device.js`): no change needed

Ran the API's own `Device.transformerResult` (extracted from `lib/thinx/device.js`) against the new
bodies: success → `{ok:true, status}`; every `{success:false,...}` → `{ok:false, reason:"transformer_rejected"}`;
400 → `transformer_http_error`. The old timeout body → `{ok:true, status:<input>}` (the bug).

Optional follow-ups (not required):
1. After the 2.2.0 image is live, `transformerResult` may drop the `"transformer_error"` allowance
   (line ~669) and `TRANSFORMER_REJECTIONS` (line 53). Keep both until then, the old image still
   sends them.
2. To surface the service's reason, map `body.success === false` with `typeof body.error === "string"`
   and `/^[a-z_]{1,32}$/.test(body.error)` to e.g. `transformer_rejected (sandbox_timeout)` in the
   `not applied` log line, instead of the generic `transformer_rejected`.

## Verification

| Command | Result |
|---------|--------|
| `npm ci` (lockfile; local node_modules lacked jest) | ok |
| `npm test` baseline (ENVIRONMENT=test via script) | 2 suites, 13 tests, all passed |
| `npm test` with new spec, unfixed code (RED) | 3 suites / 31 tests: 17 failed, 14 passed |
| `npm test` after fix | 3 suites, 31 tests, all passed; transformer.js line coverage 69.8% → 91.6% |
| `node_modules/.bin/jshint transformer.js transformer.test.js` | clean (original transformer.js had 1 loop-closure warning) |
| `docker build` + run of the changed service (`ENVIRONMENT=production`, real isolated-vm, node 22) and 13 live `/do` requests | every case answered the shape above; `while(true){}` → `sandbox_timeout`, and the next request still succeeded; container log contains 0 occurrences of any `SECRET*` marker planted in code, status, device, owner, header, `log()` args and exception text |

RED failure reasons: HTTP 500 (test env called `res(...)` as a function), `null` JSON bodies, logs
containing `TODO: match referrer/origin using ACL { req ... }` with status/header values, and
`Docker Transformer Exception 1A: Error: <message>`.

Real isolated-vm could not run on the host's Node 25.1 (segfault creating an Isolate), which is why
jest uses a controllable fake and the real-sandbox check ran in the image.

`test-report.xml` (tracked, rewritten by jest-sonar-reporter) was restored after each run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Express default error handler logged body fragments**
- **Found during:** Task 1 (RED spec for malformed bodies)
- **Issue:** body-parser's JSON parse error message quotes the request body; finalhandler logs its stack.
- **Fix:** 4-arity error middleware answers `400 {success:false, error:"bad_request"}` and logs the reason only; `/do` handler try/catch answers `500 internal_error`.
- **Commit:** `b28185c`

**2. [Rule 1 - Bug] Empty or malformed `jobs` threw (`jobs[0].params`) → HTTP 500 with stack logged**
- **Fix:** `validJobs()` → `invalid_jobs`. **Commit:** `b28185c`

**3. [Rule 1 - Bug] A failing job did not stop the chain** (later jobs ran on the stale status and the
partial status was answered). Now any failure ends the run. **Commit:** `b28185c`

**4. Lint-only edits to `transformer.test.js` after the RED commit** (jshint esversion header, capture
function hoisted out of a loop), committed with the fix.

**5. Committed on `main`** of the transformer repo. The task named that branch; it is also the
branch CI publishes `:latest` from. Nothing was pushed.

## Deferred / out of scope

- `trans.js` (socket prototype, not started by `index.js`/Dockerfile; requires `socket.io-client`
  and `sha256`, which are not dependencies) still logs code, jobs and returned args. It is dead code;
  delete it or apply the same rules if it is ever revived.
- The shared isolate is disposed when a lambda hits the 64 MB limit; every later request in that
  worker then answers `sandbox_error` until the worker restarts. Not changed (sandbox properties
  frozen by this task).
- `sanitize()` runs `unescape()` over bare code, which rewrites `%XX` sequences in the lambda source.
  Pre-existing.
- Rollbar `handleUncaughtExceptions` would still ship exception messages to Rollbar if one escaped.

## Self-Check: PASSED

- FOUND: services/transformer/transformer.test.js, services/transformer/transformer.js
- FOUND: commits `093303f`, `b28185c` (`git rev-list --count a75c490..HEAD` = 2)
