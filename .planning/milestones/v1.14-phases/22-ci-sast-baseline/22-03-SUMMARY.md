---
phase: 22-ci-sast-baseline
plan: 03
subsystem: infra
tags: [ci, codeql, pull-request, github]

requires:
  - phase: 22-01
    provides: "CodeQL v4 workflow with push [main, thinx-staging] and pull_request [main] triggers, security-extended baseline doc with trigger-evidence table"
  - phase: 22-02
    provides: "CI-03 dead Vue env removal carried in the release PR"
provides:
  - "Open release PR #569 thinx-staging -> main (not merged)"
  - "Green CodeQL pull_request run 36139870033 with analysis 1839520597 under refs/pull/569/merge"
  - "Re-verified: CodeQL check not required on main, default setup still not-configured"
  - "22-CODEQL-BASELINE.md trigger-evidence rows for the PR run and the pending main push"
affects: [23, release]

actuals:
  tokens: 540
  tasks: 2
  commits: 1
plan_head_before: 6cd8a5f6d9a756e0fb9171598bebd2bf184853a3

tech-stack:
  added: []
  patterns:
    - "CodeQL trigger evidence is proven against the GitHub API (runs, analyses by ref, protection, rulesets, default-setup), not asserted from YAML"

key-files:
  created: []
  modified:
    - .planning/phases/22-ci-sast-baseline/22-CODEQL-BASELINE.md

key-decisions:
  - "Task 1 gate: user approved 'open-pr' on 2026-09-25; PR #569 opened as a normal (non-draft) release PR and left OPEN for the maintainer's release cadence"
  - "Local 22-02 docs commits (2aaf5e7d, 6cd8a5f6) and this plan's commits stay unpushed; the PR head is origin/thinx-staging 9ccf9f18"

patterns-established:
  - "PR-scoped CodeQL results_count is not comparable with the full-ref baseline count"

requirements-completed: [CI-01]

coverage:
  - id: D1
    description: "Release PR thinx-staging -> main is open, not draft, no auto-merge"
    requirement: CI-01
    verification:
      - kind: other
        ref: "gh pr view 569 --json state,baseRefName,headRefName -> OPEN main thinx-staging"
        status: pass
    human_judgment: false
  - id: D2
    description: "CodeQL pull_request run for the PR head concluded success and its analysis is visible under refs/pull/569/merge"
    requirement: CI-01
    verification:
      - kind: other
        ref: "gh run view 36139870033 -> completed/success, event pull_request, headSha 9ccf9f18"
        status: pass
      - kind: other
        ref: "gh api code-scanning/analyses?ref=refs/pull/569/merge -> analyses=1, PR-ANALYSIS-VISIBLE"
        status: pass
    human_judgment: false
  - id: D3
    description: "CodeQL check not required on main and default setup still off; main-push trigger present in YAML"
    requirement: CI-01
    verification:
      - kind: other
        ref: "protection=0 rulesets=0 default_setup=not-configured"
        status: pass
      - kind: other
        ref: "python3 yaml check on .github/workflows/codeql-analysis.yml -> MAIN-TRIGGER-OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "Baseline doc trigger-evidence rows updated (PR run recorded, main push pending the user's merge)"
    requirement: CI-01
    verification:
      - kind: other
        ref: "grep counts -> pr_rows=1 placeholder=0 main_row=1"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-25
status: complete
---

# Phase 22 Plan 03: Release PR CodeQL Trigger Evidence Summary

**Release PR #569 (thinx-staging → main) is open. Its CodeQL `pull_request` run 36139870033 passed, and analysis 1839520597 is under `refs/pull/569/merge`. The CodeQL check is still non-required, and default setup is still `not-configured`. Nothing was merged.**

## Performance

- **Duration:** about 4 min for Task 2 (continuation executor)
- **Started:** 2026-09-25T13:15:28Z
- **Completed:** 2026-09-25T13:18:27Z
- **Tasks:** 2/2. Task 1 was a decision gate; Task 2 ran in this session.
- **Files modified:** 1

## Accomplishments

- Opened PR #569: https://github.com/suculent/thinx-device-api/pull/569
  - title "Release: thinx-staging to main (includes v1.14 Phase 22 CI and SAST baseline)"
  - not a draft, no auto-merge, state `OPEN`
  - it carries the 30 commits of `origin/thinx-staging` that are not on `origin/main`, as a fast-forward
- The PR's CodeQL run:
  - run: https://github.com/suculent/thinx-device-api/actions/runs/36139870033
  - event `pull_request`, head SHA `9ccf9f18b346c5306fba29c9d445c5afb5b833ca`, concluded `success`
- Code scanning analysis `1839520597`:
  - ref `refs/pull/569/merge`, analysed merge commit `a133868b7fbc46bf5caada6a5b8dab7fc6605194`
  - CodeQL 2.27.1, category `/language:javascript-typescript`
  - `results_count` 2, `rules_count` 103, no error
- Re-verified after the run: `protection=0 rulesets=0 default_setup=not-configured` and `MAIN-TRIGGER-OK`.
- `origin/main` is unchanged at `033ea946828991ec0b62bfcd7992ce65b8370439`.
- Updated the trigger-evidence table in `22-CODEQL-BASELINE.md`:
  - PR row: PR number and URL, head SHA, run URL, analysis id and `results_count`
  - main-push row: "trigger present in YAML (push: branches [main, thinx-staging]); run recorded when the user merges PR #569"

## Task Commits

1. **Task 1: Approve opening the release PR** — no commit (decision). Task 1 gate: the user approved "open-pr" on 2026-09-25. The earlier executor had shown the user 30 commits ahead of `origin/main`, a fast-forward.
2. **Task 2: Open the PR, prove the PR CodeQL run and non-required status, record the evidence** — `1cc407a8` (docs)

**Plan metadata:** recorded in the final docs commit for this SUMMARY.

## Files Created/Modified

- `.planning/phases/22-ci-sast-baseline/22-CODEQL-BASELINE.md`: two trigger-evidence rows changed (PR-to-main filled in, push-to-main reworded). Nothing else in the doc changed.

## Decisions Made

- The PR head is `origin/thinx-staging` (`9ccf9f18`). Following Task 2 step 1, these local docs-only commits were left unpushed so no extra pipeline runs:
  - `2aaf5e7d` and `6cd8a5f6` (22-02)
  - `1cc407a8` (this plan)
- The PR analysis reports `results_count` 2, against 148 on the full `thinx-staging` ref. This matches the PR analysis reporting results scoped to the PR rather than the whole ref. The baseline doc marks it as not comparable with the baseline figure. Alert messages and alert URLs were not recorded, because the repository is public.
- Default setup read `not-configured` again after the PR analysis. This is recorded here, not in the baseline doc, because the plan limits that doc edit to the two evidence rows.

## Deviations from Plan

None. Task 2 was executed as written.

## Issues Encountered

- The `Codacy Static Code Analysis` check reports `fail` on PR #569. It is an external integration: not part of this plan, not required on `main`, and it does not affect CI-01. It is recorded here as an observation only.
  - Every other check on the PR passed: both `Analyze` runs, `CodeQL`, Aikido, GitGuardian, FOSSA, Debricked and the CircleCI registry jobs.

## User Setup Required

None.
- To finish the D-08 evidence, merge PR #569 at the normal release cadence. That merge fires the main-push CodeQL run, and its row in `22-CODEQL-BASELINE.md` can be filled in then.
- Per memory, merging publishes the `main` images to Docker Hub.

## Next Phase Readiness

- CI-01 evidence is complete except for the main-push run, which waits for the user's merge. The plan's flagged assumptions accept that.
- Phase 23 can compare against the `refs/heads/thinx-staging` baseline (analysis `1839321938`, 147 open alerts).

---
*Phase: 22-ci-sast-baseline*
*Completed: 2026-09-25*

## Self-Check: PASSED

- FOUND: 22-03-SUMMARY.md, 22-CODEQL-BASELINE.md
- FOUND: commit 1cc407a8
- PR #569 state OPEN
