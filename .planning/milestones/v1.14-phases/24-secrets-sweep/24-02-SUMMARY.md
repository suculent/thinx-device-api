---
phase: 24-secrets-sweep
plan: 02
subsystem: security
tags: [security, secrets, readSecret, worker, transformer, rollbar, submodule, jest]

requires:
  - phase: 23-build-pipeline-sink-hardening
    provides: "lib/thinx/secrets.js readSecret() (the implementation copied here); worker validateJob with constant-time secretsMatch"
provides:
  - "services/worker/secrets.js and services/transformer/secrets.js: readSecret, _resetCacheForTests, rollbarServerToken (copies of the API helper)"
  - "Worker validateJob and connect_error read WORKER_SECRET through readSecret; a mounted /run/secrets/WORKER_SECRET wins over env (D-07 prerequisite)"
  - "One Rollbar client per worker process, built in worker.js from rollbarServerToken(); the dead class.js init is gone"
  - "Transformer entrypoint (index.js -> transformer.js) and app.js read the Rollbar token through rollbarServerToken(); the dead trans.js block is gone"
affects: [24-03, 24-04, 24-05, SEC-CFG-02]

plan_head_before: 573286eeb4402dd23e49fdb5c9b1b1726172c902
plan_head_after: 573286eeb4402dd23e49fdb5c9b1b1726172c902
submodule_heads:
  services/worker:
    before: d6ca153ef50246d40bd81fe4115e3d4cba7ea8cd
    after: b8c03b68b5e39e7927dca8f28bd1475dc4b8b5b7
    commits: 3
  services/transformer:
    before: d4f5985de5d74b03ad7e3920c06fb45aeba7fd84
    after: a75c490385d1d9f0e5111960da0729289dcd2de3
    commits: 2

actuals:
  tokens: 7098
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Submodule secret read: a local secrets.js copy of lib/thinx/secrets.js (fs + path only), kept byte-identical in readSecret"
    - "Rollbar init: const token = rollbarServerToken(); client only when truthy, otherwise one '[info] ROLLBAR_SERVER_TOKEN not set — Rollbar reporting disabled' line"
    - "Jest isolation: delegating fs.existsSync/readFileSync wrappers that answer only the owned /run/secrets paths; _resetCacheForTests() after every env change"

key-files:
  created:
    - services/worker/secrets.js
    - services/transformer/secrets.js
    - services/transformer/secrets.test.js
    - .planning/phases/24-secrets-sweep/deferred-items.md
  modified:
    - services/worker/class.js
    - services/worker/worker.js
    - services/worker/test.js
    - services/worker/CLAUDE.md
    - services/transformer/transformer.js
    - services/transformer/app.js
    - services/transformer/trans.js

key-decisions:
  - "rollbarServerToken() was added to the worker's secrets.js in Task 2, not Task 1, so the Task 2 specs had a real assertion-level RED"
  - "worker.js is tested by loading it inside jest.isolateModules with rollbar and ./class.js mocked, so the Rollbar init is asserted without opening a socket"
  - "The worker connect_error handler now retries only when WORKER_SECRET is truthy; an empty value could never authenticate anyway"

patterns-established:
  - "Submodule commits use the GSD scope ({type}(24-02)) on the submodule's local main; the parent gitlink stays uncommitted until 24-04"

requirements-completed: [SEC-CFG-02]

coverage:
  - id: D1
    description: "Worker validateJob and connect_error read WORKER_SECRET through readSecret: with /run/secrets/WORKER_SECRET present and a different env value, the file value is accepted and the env value is refused with 'Invalid job authentication' and no spawn; with neither, the job is refused before spawn with the critical log line"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "services/worker/test.js#WORKER_SECRET from swarm secrets (SEC-CFG-02, D-07)"
        status: pass
      - kind: other
        ref: "WORKER-SECRET-SWEPT grep gate (reads=2 direct=0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Worker Rollbar: rollbarServerToken() returns the server token before the access token and a file before env; worker.js builds exactly one client from it or none with one info line; class.js constructs none"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "services/worker/test.js#Rollbar server token (SEC-CFG-02, D-03)"
        status: pass
      - kind: other
        ref: "WORKER-COMMITTED gate (direct_rollbar_env=0 whole_env_uses=0 class_inits=0 worker_inits=1 dirty=0 ahead=3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Transformer helper and Rollbar read: secrets.test.js covers precedence, containment, cache and rollbarServerToken; transformer.js and app.js read the token through rollbarServerToken(); trans.js has no Rollbar init"
    requirement: SEC-CFG-02
    verification:
      - kind: unit
        ref: "services/transformer/secrets.test.js (9 tests, run with the worker's jest)"
        status: pass
      - kind: unit
        ref: "services/transformer/test.js (4 tests, still green with the new transformer.js)"
        status: pass
      - kind: other
        ref: "TRANSFORMER-COMMITTED gate (direct_rollbar_env=0 whole_env_uses=0 entry_read=1 dirty=0 ahead=2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Worker and transformer CI (their own jest runs on push) and the deployed images reading the mounted secrets"
    verification: []
    human_judgment: true
    rationale: "Nothing is pushed in this plan; 24-04 pushes the submodules and bumps the gitlinks, and the secret mounts happen in the D-05 rollout"

duration: 7min
completed: 2026-09-29
status: complete
---

# Phase 24 Plan 02: Worker and transformer secrets through readSecret Summary

**The build worker now authenticates jobs against a mounted `/run/secrets/WORKER_SECRET` before its env value, and the worker and transformer each build at most one Rollbar client, from `ROLLBAR_SERVER_TOKEN` (falling back to `ROLLBAR_ACCESS_TOKEN`), through a local copy of the API's `readSecret`. The dead Rollbar inits in `class.js` and `trans.js` are gone.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-09-28T23:36:34Z
- **Completed:** 2026-09-28T23:43Z
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 10 in the submodules (3 created, 7 modified), plus `deferred-items.md`

## Accomplishments

- `services/worker/secrets.js` is a copy of `lib/thinx/secrets.js` (file, then env, then default; path containment; per-name cache) plus `rollbarServerToken()`. The `readSecret` body is byte-identical to the API's.
- `class.js` `validateJob` uses `readSecret("WORKER_SECRET")` with a truthiness guard. The critical "WORKER_SECRET is not configured" line and the `return false` are unchanged. `connect_error` reads the same value into a local for `socket.auth.token`.
- `worker.js` is the only place that builds a Rollbar client in the worker process. It uses `rollbarServerToken()` with the same options as before. With no token it logs `<ts> [info] ROLLBAR_SERVER_TOKEN not set — Rollbar reporting disabled`. The `class.js` block that built an unused second client from `ROLLBAR_TOKEN` is deleted.
- `services/transformer/secrets.js` is the same file with a transformer header. `transformer.js` (the image path: `CMD index.js` loads `transformer.js`) and `app.js` read the token through `rollbarServerToken()` and log the same info line when it is missing. The dead `ROLLBAR_TOKEN` block in `trans.js` is deleted.
- Worker suite: 49 to 60 tests, all green. Transformer: `secrets.test.js` 9/9, and the existing `test.js` is still 4/4.
- The worker `CLAUDE.md` Secrets section describes the read order, the single Rollbar init and the restart-to-pick-up caveat. The test baseline is now 60/60.

## Task Commits

Commits are on each submodule's local `main`. None are pushed, and the parent gitlinks are not committed (24-04 does both).

1. **Task 1 (tracer): WORKER_SECRET through readSecret, file wins over env.** `services/worker@0e1c7a0` (feat)
2. **Task 2: one Rollbar init in worker.js; dead class.js init removed; CLAUDE.md.** `services/worker@1af9830` (test, RED) and `services/worker@b8c03b6` (feat, GREEN)
3. **Task 3: transformer helper, Rollbar read on the entrypoint path, dead trans.js block removed.** `services/transformer@6a6fd4b` (test, RED) and `services/transformer@a75c490` (feat, GREEN)

**Plan metadata:** the parent `docs(24-02)` commit that adds this file.

## Files Created/Modified

- `services/worker/secrets.js`: readSecret, _resetCacheForTests, rollbarServerToken
- `services/worker/class.js`: WORKER_SECRET via readSecret in validateJob and connect_error; Rollbar block removed
- `services/worker/worker.js`: the single Rollbar init from rollbarServerToken(), plus the info line
- `services/worker/test.js`: file-wins accept/refuse, both-absent, containment, 4 rollbarServerToken cases, class.js-builds-no-Rollbar, 2 worker.js entry cases; cache reset around every WORKER_SECRET env change
- `services/worker/CLAUDE.md`: Secrets section and test baseline
- `services/transformer/secrets.js`: the same three exports
- `services/transformer/secrets.test.js`: 9 jest cases
- `services/transformer/transformer.js`, `services/transformer/app.js`: Rollbar token from rollbarServerToken(), plus the info line
- `services/transformer/trans.js`: dead Rollbar block removed
- `.planning/phases/24-secrets-sweep/deferred-items.md`: two out-of-scope findings

## Verification Results

- Task 1: `WORKER-GREEN` (53 passed) and `WORKER-SECRET-SWEPT` (reads=2 direct=0). secrets.js export grep = 1, `_resetCacheForTests` = 2, `path.relative` = 1. Tracer gate (interactive, end-of-phase, automated-only verify): re-run after the commit, 53/53, so expansion continued.
- Task 2: `WORKER-GREEN` (60 passed) and `WORKER-COMMITTED` (direct_rollbar_env=0 whole_env_uses=0 class_inits=0 worker_inits=1 dirty=0 ahead=3). `ROLLBAR_SERVER_TOKEN not set` in worker.js = 1, `secrets.js` in CLAUDE.md = 2. The parent shows only ` M services/worker`.
- Task 3: `TRANSFORMER-SECRETS-GREEN` (9 passed) and `TRANSFORMER-COMMITTED` (direct_rollbar_env=0 whole_env_uses=0 entry_read=1 dirty=0 ahead=2). `new Rollbar(` in trans.js = 0. The worker and transformer `readSecret` bodies diff clean, and so do the worker's and `lib/thinx/secrets.js`. The worker suite is still 60/60.
- Privacy: the worker.js server-token test asserts that no log line contains the token values. The info lines name `ROLLBAR_SERVER_TOKEN` only, and the job-secret redaction tests from phase 23 still pass.

## TDD Evidence

- **Task 1 (tracer):** the specs and the helper copy were written first. The two file-wins cases failed on assertions against the env-reading `class.js` ("Invalid job authentication" was emitted for the file value, and the builder was spawned for the stale env value). The both-absent and containment cases passed at once (existing fail-closed behaviour, and the copied helper). After the `class.js` change: 53/53.
- **Task 2:** 7 specs were written first and all 7 failed on assertions (`rollbarServerToken` undefined; the `class.js` Rollbar mock was constructed once; no info line; the client was built with the access token). `gsd_run check tdd-red-evidence` on a jest-junit rendering returned `RED_EVIDENCE_OK` / `target_test_failed` for "worker.js creates exactly one Rollbar client from the server token and never logs it", "requiring class.js constructs no Rollbar client, whatever token env is set" and "rollbarServerToken() prefers the secret file over env for the same name". RED commit `1af9830`, GREEN commit `b8c03b6`.
- **Task 3:** per the plan, `secrets.test.js` was run before the helper existed. All 9 failed with `Cannot find module './secrets.js'`. That is a load-failure RED, not an assertion RED. It is acceptable here because the helper is a copy of the worker file whose behaviour Tasks 1 and 2 had already driven to RED and GREEN. RED commit `6a6fd4b`, GREEN commit `a75c490`.
- REFACTOR: none needed.

## Decisions Made

- `rollbarServerToken()` went into the worker's `secrets.js` in Task 2 instead of Task 1. Adding it in Task 1 would have made Task 2's specs pass before any implementation (an unexpected GREEN). The end state matches the plan.
- The worker.js tests load the entry file inside `jest.isolateModules`, with `rollbar` and `./class.js` mocked and `THINX_SERVER` set. This asserts the real init code without a socket or `process.exit`.
- The junit rendering for the RED check sets `JEST_JUNIT_CLASSNAME="{title}"`. The validator's `name="…"` regex also matches inside `classname="…"`, so with a describe-path classname every failing test was attributed to the describe name.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved rollbarServerToken() from Task 1 to Task 2**
- **Found during:** Task 1
- **Issue:** The plan adds `rollbarServerToken()` in Task 1, but Task 2 is `tdd="true"` and its first behaviour is that same function. Adding it early would have made Task 2's RED an unexpected GREEN.
- **Fix:** Task 1 added only `readSecret` and `_resetCacheForTests`, which still satisfies Task 1's export grep. Task 2 added `rollbarServerToken()` after its RED commit.
- **Files modified:** services/worker/secrets.js
- **Verification:** RED_EVIDENCE_OK before, 60/60 after
- **Committed in:** b8c03b6

**2. [Rule 2 - Missing critical] Worker test for the no-credential-in-logs prohibition on the Rollbar path**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 behaviour list does not test worker.js itself. The prohibition "MUST NOT log a credential value" is `verification: test`.
- **Fix:** Two worker.js entry tests were added: no token gives no client and exactly one info line; a server-token file gives exactly one client with that token, and no log line contains either token value.
- **Files modified:** services/worker/test.js
- **Committed in:** 1af9830 (RED), b8c03b6 (GREEN)

---

**Total deviations:** 2 auto-fixed (1 ordering fix for a valid RED, 1 added test coverage). Production scope did not change.
**Impact on plan:** None on behaviour. The worker suite ends at 60 (plan floor 55).

## Issues Encountered

- `git commit` in the submodules was not blocked by any hook. The worker and transformer repos are on `main`, as the plan specifies. The parent stays on `thinx-staging`, and its only change is the moved gitlinks, which are not committed here.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or file access beyond `/run/secrets/<constant name>`, which the threat model already covers (T-24-04, T-24-05, T-24-06).

## User Setup Required

None in this plan. No secret is created. Plan 24-04 pushes the submodules and bumps the gitlinks before any `--secret-add` (D-05).

## Next Phase Readiness

- 24-03 can rotate WORKER_SECRET on the API side. Once `/run/secrets/WORKER_SECRET` is mounted on `thinx_worker`, the worker prefers it over the env value, so a job still carrying the old env secret is refused.
- 24-04 must push `services/worker` (3 commits ahead of `origin/main`) and `services/transformer` (2 ahead), then commit the parent gitlinks. The worker CI publishes `thinxcloud/worker:latest` and the transformer CI publishes `thinxcloud/transformer:latest`, both from `main`.
- Rollout note: `readSecret` caches per name for the life of the process. A newly added secret is picked up when `docker service update --secret-add` restarts the task.
- Deferred (see `deferred-items.md`): the worker README and Dockerfile comments still name only `ROLLBAR_ACCESS_TOKEN`, and the transformer's v2 `trans.js` reads `WORKER_SECRET` from env on a path the image does not run.

## Self-Check: PASSED

- FOUND: services/worker/secrets.js, services/transformer/secrets.js, services/transformer/secrets.test.js, .planning/phases/24-secrets-sweep/deferred-items.md
- FOUND commits: services/worker 0e1c7a0, 1af9830, b8c03b6; services/transformer 6a6fd4b, a75c490
- `git -C services/worker rev-list --count d6ca153..HEAD` = 3, `git -C services/transformer rev-list --count d4f5985..HEAD` = 2, and parent `rev-list --count 573286ee..HEAD` = 0 before the metadata commit (all code commits are in the submodules)

---
*Phase: 24-secrets-sweep*
*Completed: 2026-09-29*
