---
phase: 48-deep-links-close-out
plan: 02
subsystem: infra
tags: [ci, circleci, parent, legacy-console, kill-switch, cypress-gate]

requires:
  - phase: 42-ci-trim-login-page-build-footer
    provides: "build_legacy_console parameter, legacy-console workflow, check-ci-gates.js, CiPipelineGates spec, runbook"
provides:
  - "Parent job test-vue-console (Vue unit, Legacy unit, build:perf, Cypress test:ci; JUnit from services/console/vue/cypress/results), required by vue-console-registry and vue-console-hub"
  - "build_legacy_console default true: a normal thinx-staging push builds and publishes the Legacy image again; the parameter stays as the kill switch"
  - "check-ci-gates.js requires test-vue-console on thinx-staging and main; pipeline --expect defaults to legacy-on"
  - "Kill-switch runbook .planning/runbooks/legacy-console-build-gate.md"
affects: [48-04, 48-05, 48-06]

actuals:
  tokens: 10600
  tasks: 2
  commits: 3
plan_head_before: 2deefe6c51827856c7f26438851fdf170a5606aa
plan_head_after: 2d9c904bda02e0ead34382404471055669f850d9

tech-stack:
  added: []
  patterns:
    - "A gate job carries the union of its dependants' branch filters (CircleCI 2.1 skips a job whose required job is filtered out)"
    - "Gate jobs that run third-party install scripts get no CircleCI context"

key-files:
  created: []
  modified:
    - .circleci/config.yml
    - spec/node/CiPipelineGates.test.js
    - scripts/check-ci-gates.js
    - .planning/runbooks/legacy-console-build-gate.md

key-decisions:
  - "test-vue-console has no context and pulls thinxcloud/console-build-env:vue anonymously (T-48-05)"
  - "requiredJobs labels a missing test-vue-console CI-07 (other required jobs keep CI-05/CI-04); evaluateJobs rules unchanged"
  - "check-ci-gates.js pipeline defaults to --expect legacy-on so a bare check of a normal push matches the new pipeline default"

patterns-established:
  - "Kill switch over revert: a boolean pipeline parameter with a workflow-level when, default on, documented pause paths"

requirements-completed: [CI-06, CI-07]

coverage:
  - id: D1
    description: "test-vue-console job defined (console build image, no context, submodule-only fetch, unit + Legacy + build + Cypress, JUnit stored) and required by both Vue image jobs on thinx-console, thinx-staging and main"
    requirement: CI-07
    verification:
      - kind: unit
        ref: "spec/node/CiPipelineGates.test.js#test-vue-console is defined with the console build image and no context (CI-07, D-01)"
        status: pass
      - kind: unit
        ref: "spec/node/CiPipelineGates.test.js#test-vue-console runs where the Vue image jobs run and they require it (CI-07)"
        status: pass
      - kind: integration
        ref: "node scripts/check-ci-gates.js compile (CircleCI compile-config-with-defaults)"
        status: pass
    human_judgment: false
  - id: D2
    description: "test-vue-console actually goes green in a real thinx-staging pipeline and its JUnit results show on the Tests tab"
    requirement: CI-07
    verification: []
    human_judgment: true
    rationale: "Needs the 48-04/48-05 console scripts (test:ci, legacy-close-out.cjs) and a real pipeline; 48-06 pushes and proves it. The submodule fetch inside the image cannot be tested offline."
  - id: D3
    description: "build_legacy_console defaults to true; a default pipeline selects the legacy jobs, an explicit false selects none; CI-04 unchanged"
    requirement: CI-06
    verification:
      - kind: unit
        ref: "spec/node/CiPipelineGates.test.js#a default pipeline runs the legacy jobs; an explicit false is the kill switch (CI-06, D-08)"
        status: pass
      - kind: unit
        ref: "spec/node/CiPipelineGates.test.js#every snyk-* job except snyk-monitor-base filters main only; snyk-monitor-base stays on base"
        status: pass
      - kind: integration
        ref: "node scripts/check-ci-gates.js compile"
        status: pass
    human_judgment: false
  - id: D4
    description: "Kill-switch runbook (default true, pause paths, normal pipeline, CI-07 gate and JUnit location, CI-04 table, history)"
    requirement: CI-06
    verification:
      - kind: other
        ref: "grep kill switch / --expect legacy-on / test-vue-console / \"build_legacy_console\":false in .planning/runbooks/legacy-console-build-gate.md"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-15
status: complete
---

# Phase 48 Plan 02: Parent CI gate and legacy kill switch Summary

**New context-free `test-vue-console` job gates both Vue image jobs on the Vue/Legacy unit tests, the build and Cypress (JUnit stored), and `build_legacy_console` now defaults to true, so a normal push builds the Legacy image again while the parameter stays as the kill switch.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-15T15:13:54Z
- **Completed:** 2026-10-15T15:17:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `.circleci/config.yml`: job `test-vue-console` (image `thinxcloud/console-build-env:vue`, no `auth`, no context). It runs
  `git submodule sync -- services/console && git submodule update --init -- services/console`, then in
  `services/console/vue`: `yarn`, `LC_ALL=C yarn test:unit`, `LC_ALL=C node ../src/test/deploykey.cjs`,
  `LC_ALL=C node ../src/test/legacy-close-out.cjs`, `yarn build:perf`, `yarn test:ci`. It stores
  `services/console/vue/cypress/results` as test results and the screenshots and videos as artifacts.
- Workflow `main`: `test-vue-console` filters thinx-console, thinx-staging and main. `vue-console-registry` and `vue-console-hub` both
  `requires: [test-vue-console]`. The `test` step is renamed `CI pipeline gates (CI-04 to CI-07)`.
- `build_legacy_console` has `default: true`. The kill-switch comments sit above `parameters:` and above the `legacy-console`
  workflow. The workflow, its `when` and its three jobs are unchanged, and so is CI-04.
- `scripts/check-ci-gates.js`: `test-vue-console` added to `STAGING_REQUIRED` and `MAIN_REQUIRED` (labelled CI-07).
  `pipeline` now defaults to `--expect legacy-on`.
- `spec/node/CiPipelineGates.test.js`: 23 → 27 tests. New: default true, legacy jobs on a default pipeline with an
  explicit false as the kill switch, the job definition, its wiring, and evaluateJobs requiring the gate.
- The runbook is rewritten as `# Legacy Console Build Kill Switch Runbook (CI-04 to CI-07)`.

### Verification output

`node --test spec/node/CiPipelineGates.test.js`: `ℹ tests 27`, `ℹ pass 27`, `ℹ fail 0`.

`node scripts/check-ci-gates.js compile` (exit 0):

```
false/thinx-staging: test,test-vue-console,vue-console-registry,api-registry
false/main: test,test-vue-console,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api,snyk-monitor-console-vue
true/thinx-staging: test,test-vue-console,vue-console-registry,api-registry,console-classic-registry
true/main: test,test-vue-console,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api,snyk-monitor-console-vue,console-classic-hub,snyk-monitor-console-classic
CI-GATES COMPILE OK
```

Acceptance checks:
- Task 1: the yaml check of the job, its context and the two `requires` exits 0. The commit is signed (`G`) and touches exactly the three paths.
- Task 2: the yaml/runbook grep check exits 0, and both commits print `G`.
- `git diff --name-only fc0fa013 HEAD -- . ':!.planning'` lists exactly the three CI files.
- `git ls-remote origin refs/heads/thinx-staging` still returns `fc0fa013…`, so nothing was pushed.

## Task Commits

1. **Task 1 (tracer): The Vue image build waits for a green Vue suite (CI-07, D-01)**: `8e3d636b` (ci)
2. **Task 2: The Legacy image builds by default again; the parameter is the kill switch (CI-06, D-08)**: `4ba6c5e9` (ci) and `2d9c904b` (docs, runbook)

All three are signed parent commits on thinx-staging and are not pushed. 48-06 pushes them.

## Files Created/Modified

- `.circleci/config.yml`: the `test-vue-console` job and workflow entry, the `requires` on both Vue image jobs, the kill-switch default and comments, and the step rename.
- `scripts/check-ci-gates.js`: the required lists, the CI-07 label, the `--expect legacy-on` default and the header text.
- `spec/node/CiPipelineGates.test.js`: CI-06/CI-07 tests, plus `test-vue-console` added to the literal job lists.
- `.planning/runbooks/legacy-console-build-gate.md`: the kill-switch runbook.

## Decisions Made

- The CI-07 label in `requiredJobs` is cosmetic: a missing `test-vue-console` reports `CI-07: required job …` instead of CI-05/CI-04. The `evaluateJobs` rules are unchanged.
- The flag-form `parseArgs` case now passes `--expect legacy-off`, not `legacy-on`. Since `legacy-on` is the default, the old value no longer proved that the flag overrides it.
- No `when` on the store steps, as the plan says. Whether CircleCI runs `store_test_results` after a failed `run` step is CircleCI's default behaviour, and 48-06's pipeline shows it.

## Deviations from Plan

None in scope. Small additions inside the planned files:
- The `test` job's step comment now names CI-04 to CI-07, next to the planned rename.
- The thinx-staging and main job-list assertions in the existing "gate closed/open" tests now include `test-vue-console`. This makes them stricter, not weaker.

**Total deviations:** 0 auto-fixed.

## Issues Encountered

None.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- `test-vue-console` calls `yarn test:ci` (48-05) and `../src/test/legacy-close-out.cjs` (48-04). Both must be in the
  console commit that 48-06 bumps, or the job fails and both Vue image jobs are skipped.
- Untested assumption: the `thinxcloud/console-build-env:vue` image has git and ssh, so it can fetch the `services/console`
  submodule. 48-06's pipeline proves this or stops.
- After the push, check with `node scripts/check-ci-gates.js pipeline --revision <sha> --expect legacy-on --wait`.

---
*Phase: 48-deep-links-close-out*
*Completed: 2026-10-15*

## Self-Check: PASSED

- Files: .circleci/config.yml, spec/node/CiPipelineGates.test.js, scripts/check-ci-gates.js, .planning/runbooks/legacy-console-build-gate.md all present.
- Commits 8e3d636b, 4ba6c5e9, 2d9c904b are ancestors of HEAD and signed (G).
- Plan verification re-run: spec 27/27, compile CI-GATES COMPILE OK, origin/thinx-staging still fc0fa013.
