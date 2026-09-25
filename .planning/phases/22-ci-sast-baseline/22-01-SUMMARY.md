---
phase: 22-ci-sast-baseline
plan: 01
subsystem: infra
tags: [ci, codeql, circleci, sast, github-actions]

requires:
  - phase: 21-web-hardening
    provides: least-privilege CodeQL permissions block (79736b49) and registry-login command (be376db9)
provides:
  - CodeQL advanced-setup workflow (codeql-action v4, checkout v7, javascript-typescript, build-mode none, security-extended) on push to main/thinx-staging and PRs to main
  - CircleCI test job without the raw argv-password private-registry login
  - CodeQL "before" baseline for Phase 23 (22-CODEQL-BASELINE.md + 22-CODEQL-ALERTS.json)
affects: [22-02, 22-03, 23-build-pipeline-sink-hardening]

actuals:
  tokens: 11082
  tasks: 3
  commits: 3
plan_head_before: b626266b1ba4a76fceb48c6caaf76c505c5f3568

tech-stack:
  added: [github/codeql-action@v4, actions/checkout@v7]
  patterns:
    - "CodeQL advanced setup with GitHub default setup kept off"
    - "Committed SAST baselines carry identifiers only (number, rule, severity, path, line)"

key-files:
  created:
    - .planning/phases/22-ci-sast-baseline/22-CODEQL-BASELINE.md
    - .planning/phases/22-ci-sast-baseline/22-CODEQL-ALERTS.json
  modified:
    - .github/workflows/codeql-analysis.yml
    - .circleci/config.yml

key-decisions:
  - "CI-02 took the delete path: the D-01 pre-check found no private-registry pull anywhere on the CircleCI test path"
  - "CodeQL collapsed to a single javascript-typescript job (no matrix); weekly cron kept at '0 18 * * 5'"
  - "CodeQL security-extended does not flag the git.js execSync or builder readFileSync/lstatSync sinks. Phase 23's before/after for those sinks must come from Aikido; CodeQL shows only 3 unrelated builder.js alerts"

patterns-established:
  - "Push to thinx-staging only after the CircleCI tree queue drains (no lifecycle other than finished)"

requirements-completed: [CI-01, CI-02]

coverage:
  - id: D1
    description: "CodeQL v4 workflow runs green on a thinx-staging push and its analysis is visible in code scanning; default setup stays off"
    requirement: CI-01
    verification:
      - kind: other
        ref: "python structural check on .github/workflows/codeql-analysis.yml -> WF-OK"
        status: pass
      - kind: integration
        ref: "gh run list --workflow codeql-analysis.yml (run 36135544646 on 1c7aded0) -> success"
        status: pass
      - kind: integration
        ref: "code-scanning analyses API ref=refs/heads/thinx-staging -> ANALYSIS-VISIBLE 1 (analysis 1839292115)"
        status: pass
      - kind: integration
        ref: "gh api .../code-scanning/default-setup --jq .state -> not-configured (before and after)"
        status: pass
    human_judgment: false
  - id: D2
    description: "No direct private-registry docker login and no argv-password login in .circleci/config.yml; test job green for the CI-02 commit"
    requirement: CI-02
    verification:
      - kind: other
        ref: "YAML-OK, CI02-GATES-OK (argv=0 direct=0), ORDER-OK (dhi=770 up=771 hub=2), numstat 0/1"
        status: pass
      - kind: integration
        ref: "CircleCI test job build 15409 on 89c5cf93 -> success"
        status: pass
    human_judgment: false
  - id: D3
    description: "CodeQL security-extended baseline committed for Phase 23 (147 open alerts)"
    verification:
      - kind: other
        ref: "jq array check, COUNT-MATCH 147, HEADINGS-CHECKED with no MISSING, leak count 0, key-set check true"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-25
status: complete
---

# Phase 22 Plan 01: CodeQL v4 workflow, CI-02 registry-login removal and CodeQL baseline Summary

**CodeQL v4 advanced setup (checkout v7, javascript-typescript, build-mode none, security-extended) now runs green on thinx-staging pushes. The raw argv-password private-registry login is gone from the CircleCI test job, which stays green. A 147-alert security-extended baseline is committed for Phase 23.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-25T12:31:32Z
- **Completed:** 2026-09-25T12:41:47Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- **CI-01 (tracer):** the rewritten `.github/workflows/codeql-analysis.yml` ran green on push `1c7aded0`, in run https://github.com/suculent/thinx-device-api/actions/runs/36135544646. The analysis is visible under `refs/heads/thinx-staging`: id `1839292115`, `results_count` 148, `rules_count` 103, CodeQL 2.27.1. Default setup read `not-configured` before the push and after both runs. `origin/main` is unchanged at `033ea946`.
- **CI-02:** removed the raw login at `.circleci/config.yml:767` (delete path). The CircleCI `test` job for `89c5cf93` is green: build 15409, https://circleci.com/gh/suculent/thinx-device-api/15409. The CodeQL run for the same commit is also green (https://github.com/suculent/thinx-device-api/actions/runs/36136099330, analysis `1839321938`, `results_count` 148, the same as Task 1).
- **D-07:** wrote `22-CODEQL-BASELINE.md` and `22-CODEQL-ALERTS.json`. There are 147 open alerts: 37 high and 110 medium by security severity; 118 error and 29 warning by rule severity. `js/log-injection` accounts for 99 of them.

## D-01 pre-check results (Task 2)

| Check | Result |
|---|---|
| (a) `git grep -n 'registry\.thinx' -- ':!.planning' ':!.circleci/config.yml'` | only `.env.dist:3:REGISTRY=registry.thinx.cloud:5000` |
| (b) `git grep -nw REGISTRY -- docker-compose.test.yml Dockerfile.test lib spec thinx-core.js thinx.js` | empty (rc=1) |
| (c) `image:`/`FROM` in docker-compose.test.yml, Dockerfile.test, services/broker/Dockerfile.test; `docker pull` in services/worker/builder | `dhi.io/couchdb:3`, `thinxcloud/redis`, `thinxcloud/transformer`, `thinxcloud/worker:latest`, `influxdb:1.8`, `golang:1.26.8-alpine3.24`, `thinxcloud/base:latest`, `thinxcloud/mosquitto`; worker pulls only `suculent/{micropython,nodemcu,mongoose,arduino,pine64,platformio}-docker-build`. Docker Hub and dhi.io only |
| (d) `registry.thinx.cloud` lines across all 25 step outputs of the newest green `test` job (build 15400, on `1c7aded0`) | 0 |

All four held, so the plan took the **delete path**. The CI-02 commit numstat is `0	1	.circleci/config.yml`.

## Task Commits

1. **Task 1 (tracer): CodeQL workflow rewrite** - `1c7aded0` (ci), pushed
2. **Task 2: CI-02 raw private-registry login removal** - `89c5cf93` (ci), pushed after the Task 1 CircleCI pipeline drained (all 8 jobs for `1c7aded0` green)
3. **Task 3: CodeQL baseline** - `41d2658f` (docs), not pushed; it rides the 22-02 thinx-staging push

## Files Created/Modified

- `.github/workflows/codeql-analysis.yml`: the new workflow. Push triggers on main and thinx-staging, PR trigger on main, cron kept. One job with 3 steps and no `run:` step. `paths-ignore` covers node_modules, `**/*.min.js`, `builders/lua-inspect/**`, `spec/**`, `scripts/test-*.js`, `test_cert_probe_runner.js` and `verify_path_traversal_fix.js`. The least-privilege block is byte-identical.
- `.circleci/config.yml`: one line deleted from the test job's "Starting Support Services" step.
- `.planning/phases/22-ci-sast-baseline/22-CODEQL-BASELINE.md`: Phase 23 "before" evidence.
- `.planning/phases/22-ci-sast-baseline/22-CODEQL-ALERTS.json`: 147 reduced alert records (identifiers only).

## Decisions Made

- Delete path for CI-02, based on the pre-check evidence above.
- Single CodeQL job instead of a matrix; the cron time is unchanged (Claude's discretion per CONTEXT).
- The baseline records that CodeQL security-extended does not flag the `git.js` `execSync` sink (lines 71 and 153) or the builder `readFileSync`/`lstatSync` sinks. The only builder.js alerts are #148 (`js/incomplete-sanitization`, 323), #151 (`js/incomplete-sanitization`, 1049) and #223 (`js/log-injection`, 1103), and `git.js` has none. Phase 23 therefore needs the Aikido scan for sink before/after evidence. For CodeQL, "no new alerts in these files" is the check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in plan check] The dismissed-alert gate expected 0, but the ref carries one dismissal from 2021**
- **Found during:** Task 3
- **Issue:** Task 3's check `state=dismissed ... | jq length` returns `1`. The alert is #118 (`js/path-injection`, `lib/thinx/notifier.js:168`), dismissed "won't fix" by `suculent` on 2021-01-01. That dismissal came from a 2021 run against `master`. GitHub matched the new result by fingerprint and kept its dismissed state. The planning-time "0 dismissed" was measured before any analysis existed on `refs/heads/thinx-staging`, so it could not have seen this alert. This also explains why `results_count` is 148 while 147 alerts are open.
- **Fix:** Nothing was dismissed or changed. I narrowed the check to what the plan's `fails_when` actually means ("an alert was dismissed during the phase"): dismissed alerts with `dismissed_at >= 2026-09-25` = `0`. The baseline doc records #118 by identifiers only.
- **Files modified:** `.planning/phases/22-ci-sast-baseline/22-CODEQL-BASELINE.md` (Data section)
- **Verification:** `dismissed(since phase start)=0`, `dismissed(total)=1`
- **Committed in:** `41d2658f`

---

**Total deviations:** 1 (a plan-check assumption corrected; no code impact)
**Impact on plan:** None on deliverables. The D-07 "no alert dismissed in this phase" truth holds. The phase-level verifier should read "dismissed-alert count stays 0" as "no dismissal during the phase" (it stays at the pre-existing 1).

## Issues Encountered

None beyond the deviation above. Both pushes' CircleCI pipelines and CodeQL runs were green on the first attempt.

## Flagged for follow-up (from the plan, not acted on)

- A-04: `services/console/.circleci/config.yml` (submodule, dormant `thinx-console` branch) still logs in to the private registry through the orb's `docker/check`. It is out of CI-02 scope per CONTEXT.
- The comment above the dhi.io login still says "DOCKER_LOGIN here holds the private-registry account". It is still true of the context variable, and the plan required the comment block to stay byte-identical.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 22-02 (CI-03) can proceed. Its thinx-staging push carries the Task 3 baseline commit `41d2658f`.
- 22-03 fills the "PR to main" row of the trigger-evidence table.
- Phase 23: the baseline is in place. See the git.js/builder.js note above about using Aikido for sink evidence.

---
*Phase: 22-ci-sast-baseline*
*Completed: 2026-09-25*

## Self-Check: PASSED
