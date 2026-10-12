---
phase: 42-ci-trim-login-page-build-footer
plan: 01
subsystem: infra
tags: [ci, circleci, snyk, legacy-console]

requires: []
provides:
  - "Pipeline parameter build_legacy_console (boolean, default false during v1.18) gating workflow legacy-console"
  - "Snyk monitors on main only; console monitors scan thinxcloud/console:vue and :latest on docker.io"
  - "scripts/check-ci-gates.js: compile (CircleCI compiler, both parameter values) and pipeline (live job list) subcommands"
  - "spec/node/CiPipelineGates.test.js offline gate checks"
  - ".planning/runbooks/legacy-console-build-gate.md with the copy-ready Phase 43 one-pipeline bypass"
affects: [42-03, 43, 48, vault-transit]

actuals:
  tokens: 13119
  tasks: 3
  commits: 5
plan_head_before: efcf62b8ad66fd2c92e66a7a02025d05f73d1550
plan_head_after: 8b9c4683f678cb7bf8151c7249a9b52b3be36c57

tech-stack:
  added: []
  patterns:
    - "Workflow-level when on a pipeline parameter as a permanent on/off switch for a group of jobs"
    - "CI config gates proven through CircleCI's own compiler (compile-config-with-defaults, options.pipeline_parameters)"

key-files:
  created:
    - scripts/check-ci-gates.js
    - spec/node/CiPipelineGates.test.js
    - .planning/runbooks/legacy-console-build-gate.md
  modified:
    - .circleci/config.yml

key-decisions:
  - "CI-05 gate is a separate workflow legacy-console with when: << pipeline.parameters.build_legacy_console >>; snyk-monitor-console-classic moves with console-classic-hub because requires cannot cross workflows"
  - "snyk-monitor-console-vue / -classic use the dockerhub context only (SNYK_TOKEN + docker.io login); thinx-docker-repo and console no longer reach Snyk jobs"
  - "The spec asserts the parameter's type, never its default value, so the Phase 48 one-line flip needs no test edit"

patterns-established:
  - "Edit .circleci/config.yml by hand (comments are documentation), then run node --test spec/node/CiPipelineGates.test.js and node scripts/check-ci-gates.js compile before any push"

requirements-completed: [CI-04, CI-05]

coverage:
  - id: D1
    description: "build_legacy_console pipeline parameter (default false) and gated legacy-console workflow holding console-classic-registry, console-classic-hub, snyk-monitor-console-classic"
    requirement: CI-05
    verification:
      - kind: unit
        ref: "spec/node/CiPipelineGates.test.js#exactly one workflow, legacy-console, is gated on build_legacy_console and holds exactly the legacy jobs"
        status: pass
      - kind: integration
        ref: "node scripts/check-ci-gates.js compile"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every Snyk monitor on main only; console monitors scan the Docker Hub images after the *-hub jobs; thinx-staging runs only test, api-registry, vue-console-registry"
    requirement: CI-04
    verification:
      - kind: unit
        ref: "spec/node/CiPipelineGates.test.js#every snyk-* job except snyk-monitor-base filters main only; snyk-monitor-base stays on base"
        status: pass
      - kind: integration
        ref: "node scripts/check-ci-gates.js compile"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live pipeline checker flags pipeline 5653 (pre-phase thinx-staging) for console-classic-registry and the snyk-* jobs"
    requirement: CI-05
    verification:
      - kind: integration
        ref: "node scripts/check-ci-gates.js pipeline --pipeline-id 27d73a7d-4afd-4fbb-932f-e853ebef5eb4 (exit 1, expected)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real thinx-staging pipeline after the 42-03 push runs no snyk-* / console-classic-* job"
    requirement: CI-05
    verification: []
    human_judgment: true
    rationale: "Needs the 42-03 push; run node scripts/check-ci-gates.js pipeline --revision <pushed sha> --expect legacy-off --wait then"
  - id: D5
    description: "Runbook with the D-04 one-pipeline bypass (token via read -rs, curl --header @-, unset), byte-identical to the plan snippet"
    requirement: CI-05
    verification:
      - kind: other
        ref: "Task 3 runbook grep verify + byte-identity check against 42-01-PLAN.md"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-10-12
status: complete
---

# Phase 42 Plan 01: CI Trim (CI-04, CI-05) Summary

**Legacy console builds paused behind the permanent `build_legacy_console` pipeline parameter (default false), all Snyk monitors moved to `main` on the Docker Hub images, both proven through CircleCI's compiler, plus a token-free live job checker and a runbook with the Phase 43 one-pipeline bypass**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-12T16:21:29Z
- **Completed:** 2026-10-12T16:28:23Z
- **Tasks:** 3 / 3
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments

- `.circleci/config.yml`: new top-level `parameters: build_legacy_console` (boolean, default false) and a sibling workflow `legacy-console` with `when: << pipeline.parameters.build_legacy_console >>` holding exactly `console-classic-registry`, `console-classic-hub`, `snyk-monitor-console-classic`. Both places carry a `# v1.18 CI-05` marker.
- Snyk: `snyk-code-monitor` and `snyk-oss-monitor` on main only. `snyk-monitor-console-vue` scans `thinxcloud/console:vue` (docker.io) after `vue-console-hub`, and `snyk-monitor-console-classic` scans `thinxcloud/console:latest` after `console-classic-hub` inside the gate. Both use the `dockerhub` context only. `snyk-monitor-api` and `snyk-monitor-base` are unchanged, and all six monitors are still defined.
- `scripts/check-ci-gates.js` with `compile` (CircleCI compiler, both parameter values) and `pipeline` (live job list by `--revision` or `--pipeline-id`, `--expect`, `--wait`, `--timeout-min`). It is token-free.
- `spec/node/CiPipelineGates.test.js`: 22 offline cases (gate structure, Snyk filters, Hub wiring, `requires` closure across 4 branches × 2 values, rules, argument parsing).
- `.planning/runbooks/legacy-console-build-gate.md` with the D-04 bypass block, byte-identical to the plan.

## Task Commits

1. **Task 1 (tracer): CI-05 gate.** RED `10f057b4` (test), GREEN `e45456b4` (ci, `.circleci/config.yml` only, signed G)
2. **Task 2: Snyk on main only (CI-04).** RED `8ee9cd23` (test), GREEN `72dc7abf` (ci, `.circleci/config.yml` only, signed G)
3. **Task 3: live pipeline checker + runbook.** `8b9c4683` (chore, signed G)

All five commits are GPG-signed (`%G?` = G). Nothing was pushed: `origin/thinx-staging` is still `dec69991` and HEAD is 5 commits ahead.

## Evidence

### Task 1 RED (spec on the pre-change config, commit 10f057b4)

```
not ok 1 - build_legacy_console is a boolean pipeline parameter with a boolean default
not ok 2 - exactly one workflow, legacy-console, is gated on build_legacy_console and holds exactly the legacy jobs
not ok 3 - no workflow other than legacy-console builds or monitors the legacy console image
not ok 4 - thinx-staging with the gate closed runs test, api-registry, vue-console-registry and no legacy job
not ok 6 - main runs no legacy job with the gate closed, console-classic-hub with it open
not ok 7 - with the gate closed no branch runs any legacy job; with it open snyk-monitor-console-classic runs somewhere
not ok 12 - compile evaluation: legacy-console appears only in the compile with the parameter true
# tests 12
# pass 5
# fail 7
```

### Task 1 GREEN compile (e45456b4)

```
false/thinx-staging: test,vue-console-registry,api-registry,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-console-vue
false/main: test,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api
true/thinx-staging: test,vue-console-registry,api-registry,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-console-vue,console-classic-registry,snyk-monitor-console-classic
true/main: test,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api,console-classic-hub
CI-GATES COMPILE OK
```

### Task 2 RED (spec on the Task 1 config, commit 8ee9cd23)

```
not ok 12 - compile evaluation: legacy-console appears only in the compile with the parameter true
not ok 13 - every snyk-* job except snyk-monitor-base filters main only; snyk-monitor-base stays on base
not ok 14 - snyk-monitor-console-vue scans thinxcloud/console:vue after vue-console-hub (D-06)
not ok 15 - snyk-monitor-console-classic scans thinxcloud/console:latest after console-classic-hub, inside the gate (D-07)
not ok 16 - thinx-staging and thinx-console run no snyk-* job with the gate closed or open
not ok 17 - main runs every monitor; the gate adds the legacy hub build and its monitor
# tests 19
# pass 13
# fail 6
```

### Final compile (after 72dc7abf; unchanged by 8b9c4683)

```
false/thinx-staging: test,vue-console-registry,api-registry
false/main: test,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api,snyk-monitor-console-vue
true/thinx-staging: test,vue-console-registry,api-registry,console-classic-registry
true/main: test,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api,snyk-monitor-console-vue,console-classic-hub,snyk-monitor-console-classic
CI-GATES COMPILE OK
```

`node --test spec/node/CiPipelineGates.test.js`: `# tests 22`, `# pass 22`, `# fail 0`.

### Pipeline 5653 (pre-phase thinx-staging, dec69991): checker exits 1 as intended

```
pipeline 5653 27d73a7d-4afd-4fbb-932f-e853ebef5eb4 branch=thinx-staging revision=dec6999
main: vue-console-registry (success)
main: test (success)
main: snyk-oss-monitor (success)
main: snyk-monitor-console-vue (success)
main: snyk-code-monitor (success)
main: console-classic-registry (success)
main: snyk-monitor-console-classic (success)
main: api-registry (success)
CI-GATES PIPELINE FAIL 5653 6 problems
CI-05: console-classic-registry ran on thinx-staging with build_legacy_console closed
CI-05: snyk-monitor-console-classic ran on thinx-staging with build_legacy_console closed
CI-04: snyk-oss-monitor ran on thinx-staging (Snyk monitors run on main only)
CI-04: snyk-monitor-console-vue ran on thinx-staging (Snyk monitors run on main only)
CI-04: snyk-code-monitor ran on thinx-staging (Snyk monitors run on main only)
CI-04: snyk-monitor-console-classic ran on thinx-staging (Snyk monitors run on main only)
```

I also exercised these paths: `--revision dec69991 --expect legacy-on --wait` found 5653 through the branch listing (webhook trigger) and reported only the 4 CI-04 problems. A non-existent pipeline id exited 2 with `CI-GATES ACCESS HTTP 404 …` plus the MCP fallback hint. A missing or duplicate `--revision`/`--pipeline-id` and an unknown subcommand each exited 2 with usage.

### D-08 validation

- **CircleCI MCP `validate_config`:** not offered to this executor session. The tool was not in the tool list, and no ToolSearch tool was available to load the deferred CircleCI MCP tools. It has **not** been run on the final file. 42-03 (or the orchestrator) should run it before the push if the tool is available there.
- **`circleci config validate`:** not run. `command -v circleci` found no CLI on this machine.
- **`node scripts/check-ci-gates.js compile`** (CircleCI's own compiler, both parameter values): `CI-GATES COMPILE OK` on the final file, as shown above.

## Files Created/Modified

- `.circleci/config.yml`: pipeline parameter, gated `legacy-console` workflow, Snyk filters and Hub console monitors.
- `scripts/check-ci-gates.js`: gate rules (`selectJobs`, `evaluateJobs`, `requiredJobs`, `parseArgs`, `evaluateCompiled`), plus the `compile` and `pipeline` CLI.
- `spec/node/CiPipelineGates.test.js`: offline node:test spec (22 cases).
- `.planning/runbooks/legacy-console-build-gate.md`: the gate, the normal staging job set, Snyk on main, the D-04 bypass, the CI-06 restore, and the rule for other workstreams.

## Decisions Made

- The gate is a separate workflow with a workflow-level `when`, because CircleCI 2.1 has no per-job `when` and `requires` cannot cross workflows (D-01, the planner's recommended shape).
- The console Snyk monitors carry the `dockerhub` context alone. This follows the plan's reasoning: `registry-login` on docker.io needs only the dockerhub DOCKER_* variables, and `thinx-docker-repo` would collide on those names.
- The checker treats HTTP 5xx/429 and network errors as retryable (3 retries, 5 s backoff). 401/403/404 exit 2 as `CI-GATES ACCESS`. Any other non-2xx exits 2 as `CI-GATES HTTP`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan inconsistency] Task 1 behavior "main with true includes snyk-monitor-console-classic" could not hold at Task 1 GREEN**
- **Found during:** Task 1
- **Issue:** Task 1 told me to move `snyk-monitor-console-classic` *unchanged* (filter thinx-staging, requires console-classic-registry) and leave the move to main for Task 2. Its behavior list still expected that job on main with the gate open.
- **Fix:** The Task 1 spec asserts that with the gate open the monitor runs on some branch, and on none with the gate closed. The Task 2 spec asserts it runs on main with the gate open (`main runs every monitor; the gate adds …`), and the final spec enforces it.
- **Files modified:** spec/node/CiPipelineGates.test.js
- **Committed in:** 10f057b4, 8ee9cd23

**2. [Rule 2 - Robustness] `selectJobs` accepts `when: false` as a disabled workflow**
- **Found during:** Task 1
- **Issue:** The plan said every `when` shape other than absent, `true` or the `<< pipeline.parameters.X >>` string throws. A literal `false` is not ambiguous.
- **Fix:** `false` disables the workflow. Every richer shape (objects, `and`/`or`/`equal`) still throws, and a spec case covers that.
- **Committed in:** 10f057b4

**3. [Rule 2 - Testability] Extra exports and exit-2 labels**
- **Issue / Fix:** I exported `evaluateCompiled` so the compile judgment is tested offline with a simulated compiler response, and `requiredJobs` so `evaluateJobs` and `--wait` share one list. I also exported `runsOnBranch`, `UsageError` and constants. Besides `NETWORK`/`TIMEOUT`, the non-retryable API answers exit 2 as `CI-GATES ACCESS …` (401/403/404) and `CI-GATES HTTP …` (other 4xx).
- **Committed in:** 10f057b4, 8b9c4683

---

**Total deviations:** 3 auto-fixed (1 plan inconsistency, 2 robustness/testability).
**Impact on plan:** None on scope. The plan's three listed exports and every acceptance criterion hold.

## Issues Encountered

- The CircleCI MCP `validate_config` could not be called from this session (see D-08 above). The compiler gate covers the same CircleCI compiler.

## Known Stubs

None.

## User Setup Required

None. Phase 43 needs a CircleCI personal API token at the hidden prompt of the runbook bypass. This plan does not use one.

## Next Phase Readiness

- 42-02 (console submodule) is independent of this plan. 42-03 bumps the gitlink and pushes thinx-staging. After that push, run `node scripts/check-ci-gates.js pipeline --revision "$(git rev-parse HEAD)" --expect legacy-off --wait` (D-08 post-push check, coverage D4).
- Phase 43 has a copy-ready bypass in `.planning/runbooks/legacy-console-build-gate.md` § 4.
- Phase 48 (CI-06) restores the builds by flipping `default: false` to `default: true` (one line).

---
*Phase: 42-ci-trim-login-page-build-footer*
*Completed: 2026-10-12*

## Self-Check: PASSED

All four key files exist; commits 10f057b4, e45456b4, 8ee9cd23, 72dc7abf, 8b9c4683 are ancestors of HEAD and signed (G); spec 22/22, compile OK, pipeline 5653 FAIL as expected, runbook verify passes; origin/thinx-staging unchanged (dec69991).
