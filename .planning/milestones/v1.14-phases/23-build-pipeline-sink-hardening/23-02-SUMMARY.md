---
phase: 23-build-pipeline-sink-hardening
plan: 02
subsystem: worker
tags: [security, worker, argv, submodule, child_process, logging]

requires:
  - phase: 23-build-pipeline-sink-hardening
    provides: "23-CONTEXT D-01..D-04 wire contract (job gains argv next to legacy cmd)"
provides:
  - "services/worker/class.js: BUILDER_PROGRAM, ALLOWED_ARGV_FLAGS, validateArgv, runArgv, attachBuildHandlers"
  - "Worker accepts job.argv (arguments only) and spawns spawn(BUILDER_PROGRAM, argv, { shell: false })"
  - "failJob reason \"Invalid argv\"; legacy cmd-only jobs log 'legacy cmd-only job <build_id>' (D-03)"
  - "Worker logs no longer carry the job secret or the --env JSON"
  - "Worker commits 5225190..79611f6 on local services/worker main (unpushed)"
affects: [23-04, 23-05]

plan_head_before: f1c02c9fa4dccedcc1ae40154bfb95fbb4de3bc8
plan_head_after: 79611f628e7b7b00ebcc2c07732b869a7e6b7ac8

actuals:
  tokens: 4365
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Worker-owned program path: the job carries arguments only; the program is a worker constant"
    - "argv allowlist: --dry-run or --<name>=value with <name> in ALLOWED_ARGV_FLAGS, plus isArgumentSafe per element"
    - "A job that carries argv at all is an argv job: malformed argv is refused, never retried on the cmd shell path"
    - "jest.spyOn(require('child_process'), 'spawn') with an EventEmitter fake child to assert spawn shape without running anything"

key-files:
  created: []
  modified:
    - services/worker/class.js
    - services/worker/test.js

key-decisions:
  - "argv presence (not Array.isArray) routes a job to argv validation, so a non-array argv is refused with Invalid argv instead of falling back to the shell path"
  - "runArgv logs --env=<redacted> rather than the owner's custom env JSON (T-23-13)"
  - "The socket job handler logs the job with secret redacted; before this it logged the WORKER_SECRET-matching job secret in plain text"
  - "Worker commits land on the worker's local main as directed (CI publishes thinxcloud/worker:latest from main); parent gitlink left for 23-04"

patterns-established:
  - "Remote build jobs: exec.spawn(BUILDER_PROGRAM, argv, { shell: false }) + attachBuildHandlers for both argv and legacy paths"

requirements-completed: [SEC-EXEC-02]

coverage:
  - id: D1
    description: "An argv job is spawned as spawn('/opt/thinx/thinx-device-api/builder', argv, { shell: false }); argv wins over cmd and no spawn asks for a shell"
    requirement: SEC-EXEC-02
    verification:
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) (a) argv job spawns the constant builder program with shell:false"
        status: pass
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) (b) a job with both argv and cmd runs argv only; cmd is ignored"
        status: pass
    human_judgment: false
  - id: D2
    description: "Malformed argv (empty, non-array, non-string, program path, metacharacter, unknown flag, $() in --env) is refused with Invalid argv and nothing is spawned; runArgv re-validates and releases the guard"
    requirement: SEC-EXEC-02
    verification:
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) (c) argv with %s is refused with \"Invalid argv\" and nothing is spawned (7 cases)"
        status: pass
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) (d) runArgv releases the running guard on an invalid build_id and spawns nothing"
        status: pass
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) runArgv re-validates argv before spawning (defence in depth)"
        status: pass
    human_judgment: false
  - id: D3
    description: "validateJob still enforces build_id, a configured WORKER_SECRET and secretsMatch for argv jobs"
    requirement: SEC-EXEC-02
    verification:
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) argv job still needs a matching job secret / a build_id / is refused when WORKER_SECRET is not configured"
        status: pass
    human_judgment: false
  - id: D4
    description: "Legacy cmd-only job logs one 'legacy cmd-only job <build_id>' warning and still runs through the shell path; argv jobs log no warning"
    requirement: SEC-EXEC-02
    verification:
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) legacy cmd-only job logs one warning with its build_id and still runs through the shell path"
        status: pass
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) argv job logs no legacy warning"
        status: pass
    human_judgment: false
  - id: D5
    description: "Worker logs carry neither the job secret nor the --env payload"
    verification:
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) runArgv logs the argv without the --env payload"
        status: pass
      - kind: unit
        ref: "services/worker/test.js#Worker argv jobs (SEC-EXEC-02) the socket job handler never logs the job secret"
        status: pass
    human_judgment: false
  - id: D6
    description: "No lgtm marker remains in services/worker/class.js (D-15)"
    verification:
      - kind: other
        ref: "grep -c 'lgtm' services/worker/class.js == 0"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-09-27
status: complete
---

# Phase 23 Plan 02: Worker argv jobs without a shell Summary

**The build worker now runs argv jobs as `spawn("/opt/thinx/thinx-device-api/builder", argv, { shell: false })` after checking every element against a flag allowlist and `isArgumentSafe`. Legacy `cmd`-only jobs still run and log a `legacy cmd-only job <build_id>` warning, and the job secret no longer reaches the worker log.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-09-27T11:24:59Z
- **Completed:** 2026-09-27T11:31:52Z
- **Tasks:** 2 (1 tracer, 1 TDD)
- **Files modified:** 2 (both in the `services/worker` submodule)

## Accomplishments

- **SEC-EXEC-02, worker half (D-02, D-04):**
  - An argv job reaches the bash builder with no shell in between.
  - The program is the worker constant `BUILDER_PROGRAM`, so a job can never name what runs.
  - `validateArgv` accepts only `--dry-run` or `--<owner|udid|fcid|mac|git|branch|id|workdir|env>=value`, and every element must also pass `isArgumentSafe`.
  - Anything else fails the job with `Invalid argv` and spawns nothing.
- **Defence in depth:**
  - `runArgv` repeats the `isBuildIDValid` guard, the build_id sanitisation and `validateArgv` before it spawns.
  - Every refusal releases the `running` guard.
- **Refactor:** the stdout/stderr/error/exit wiring moved into `attachBuildHandlers` unchanged, and the argv and legacy paths now report builds the same way.
- **D-03:** `cmd`-only jobs keep today's whole-string check and shell path, and log one warning line that contains only the build_id. That line is the signal for dropping `cmd` later.
- **D-15:** all five dead `// lgtm [...]` markers are gone. The `deepcode ignore` lines were left as they were.
- **Log hygiene (T-23-13):**
  - The socket `job` handler used to log the full job, including the plain-text `secret` that matches `WORKER_SECRET`. It now logs `<redacted>` in its place.
  - `runArgv` logs `--env=<redacted>`.
- **Tests:** the worker jest suite has 40 tests, up from the 22 baseline, and all pass. It was green on four consecutive runs.

## Task Commits

All commits are in the **worker repo** (`services/worker`, local `main`, not pushed) and GPG-signed (`G`):

1. **Task 1 (tracer): argv job end to end.** RED `5225190` (test), GREEN `46884be` (feat)
2. **Task 2: legacy warning, lgtm removal, log hygiene.** RED `2e5f9a1` (test), GREEN `79611f6` (feat)

**Plan metadata:** parent-repo commit `docs(23-02)` (this SUMMARY plus STATE/ROADMAP/REQUIREMENTS). The parent `services/worker` gitlink was deliberately **not** staged; plan 23-04 bumps it.

## TDD Gate Compliance

Both cycles have RED (`test(23-02)`) before GREEN (`feat(23-02)`). I converted the jest JSON output to TAP and checked the RED evidence with `gsd-tools check tdd-red-evidence`:

- **Task 1:** RED_EVIDENCE_OK. 13 target tests failed on behaviour assertions: `Missing command` instead of `Invalid argv`, the cmd was spawned with `shell: true`, and `runArgv` was undefined. The 22 baseline tests stayed green.
- **Task 2:** RED_EVIDENCE_OK. 3 targets failed on assertions: the warning count was 0, `hunter2` appeared in the log, and `leak-me-please` appeared in the log.

No refactor commit was needed.

## Files Created/Modified

- `services/worker/class.js`:
  - Added the constants `BUILDER_PROGRAM` and `ALLOWED_ARGV_FLAGS`, and the methods `validateArgv`, `runArgv` and `attachBuildHandlers`.
  - `validateJob` and `runJob` now accept argv, and `runJob` logs the legacy warning.
  - Logs are redacted, and the lgtm markers are removed.
- `services/worker/test.js`: a nested `describe('argv jobs (SEC-EXEC-02)')` with 18 new tests. They spy on `child_process.spawn`, use a fake socket, and set and restore `WORKER_SECRET`. The 22 existing tests are unchanged.

## Decisions Made

- **An argv job is decided by the field being present, not by its type.** A job that carries `argv` of any type is validated as argv. A non-array such as `"--owner=x"` is refused with `Invalid argv` and never falls through to the `cmd` shell path. Spec case (c) requires this. `runJob` still dispatches on `Array.isArray(job.argv)`, which is equivalent once validation has passed.
- **The existing security-incident sentence is logged when argv is refused**, next to the `failJob`, as the plan asks.
- **The legacy `cmd` branch keeps today's exact structure.** An undefined cmd gives `Missing command`. An unsafe cmd is logged but not `failJob`'d, which is the pre-existing behaviour.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] The job secret was logged in plain text by the socket `job` handler**
- **Found during:** Task 2 (log review for T-23-13)
- **Issue:** `console.log(..., "» Worker has new job:", data)` printed the whole job, and its `secret` field equals `WORKER_SECRET`. Every job the production worker received therefore wrote the secret to its log.
- **Fix:** the handler now logs a copy with `secret: "<redacted>"`. Non-object payloads are logged unchanged.
- **Files modified:** services/worker/class.js
- **Verification:** the spec `the socket job handler never logs the job secret` emits a real socket.io job and asserts that the secret is absent from every log line.
- **Committed in:** 79611f6

**2. [Rule 2 - Security] runArgv logs `--env=<redacted>` instead of joining the raw argv**
- **Found during:** Task 2
- **Issue:** the plan said to log the argv joined by spaces. `--env=` carries the owner's custom environment variables as JSON (`apienv`), and those can hold credentials.
- **Fix:** the `--env=` element is replaced with `--env=<redacted>` in the log line only. The spawn receives the real argv.
- **Files modified:** services/worker/class.js
- **Verification:** spec `runArgv logs the argv without the --env payload`
- **Committed in:** 79611f6

**3. [Scope - Tests] Specs beyond cases a-d**
- The argv path now also has specs for a wrong secret, a missing build_id, an unset `WORKER_SECRET` (fail closed) and the `runArgv` re-validation. These cover the must_have that says validateJob still enforces those checks.

**4. [Process] Commits land on the worker's `main`**
- The executor's pre-commit HEAD check refuses `main`/`master` by name. The orchestrator and the plan both direct worker commits to the submodule's local `main`, because the worker CI publishes from main and plan 23-05 pushes it. The commits went there as directed, and the per-plan commit ledger lives in the worker's git dir.

**5. [Test infra] The socket-level spec waits for the worker connection first**
- The worker client connects asynchronously, and the older `io.emit` cases are fire-and-forget. Without a wait, the new socket case timed out before the worker had connected. It now waits up to 8s for `w.socket.connected`, with a 15s test timeout. In practice the suite runs in about 2s.

---

**Total deviations:** 2 auto-fixed (Rule 2, security), plus 3 process notes.
**Impact on plan:** both fixes tighten T-23-13 and neither changes the wire contract. There is no scope creep outside `class.js` and `test.js`.

## Issues Encountered

- The first RED run of the socket-handler spec failed on a connection timeout, not on the assertion, so it was INVALID_RED. I fixed that by waiting for the connection (deviation 5), and the second run was RED on the intended assertion.

## Observations for the orchestrator (not changed here)

- **WORKER_SECRET exposure:** production worker logs written before this change contain the job secret, which equals `WORKER_SECRET`. Consider rotating `WORKER_SECRET` once the new worker image is deployed (plan 23-05 or Phase 24's secrets sweep).
- **T-23-14 (transfer):** `services/worker/builder` still runs `eval "$PARSED"` on the repository's own `thinx.yml` (around L428). That is repository-controlled shell inside the root worker container, and it is a backlog candidate.
- **The secret goes back to the API:** `failJob` echoes the full job, secret included, back to the API over `job-status`. The API does not log that payload directly (`queue.js` passes it to `notifier.process`). This is left unchanged.
- **Allowlist coupling (A-23-02-1):** the API must not emit a new builder flag before a worker release that allows it, or those jobs fail with `Invalid argv`.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- The worker side of the D-01 wire contract is ready. Plan 23-04 can add `argv: buildArgs` to the job and bump the parent `services/worker` gitlink to `79611f6`, which the parent working tree already shows as modified and uncommitted.
- Plan 23-05 must push the worker `main` (4 commits ahead of `origin/main`) **before** the parent repo.

---
*Phase: 23-build-pipeline-sink-hardening*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: services/worker/class.js, services/worker/test.js, this SUMMARY
- FOUND worker commits: 5225190, 46884be, 2e5f9a1, 79611f6 (all GPG-signed)
- Worker suite: 40 passed, 40 total (4 consecutive runs); lgtm=0 warn=1 dirty=0 ahead=4
