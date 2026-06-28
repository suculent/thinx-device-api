---
phase: 05-backend-hygiene-cheap-sweeps
plan: 03
subsystem: infra
tags: [package-json, dependencies, jshint, fs-finder, docker, supply-chain, refactor]

# Dependency graph
requires:
  - phase: 04-prior-foundations
    provides: stable Docker production build, npm install --omit=dev convention
provides:
  - jshint reclassified to devDependencies (removed from production install layer)
  - documented fs-finder deferral rationale (v1.10 backlog candidate)
affects:
  - "future v1.10 fs-finder removal phase (deferred)"
  - "Phase 5 wrap-up (05-04 doc-update + CI/Swarmpit canonical gates)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "package.json hygiene: reclassify devtools out of `dependencies` when zero runtime require exists"
    - "scope-deferral documentation: defer multi-module refactors when blast radius exceeds 'cheap sweep' threshold"

key-files:
  created:
    - .planning/phases/05-backend-hygiene-cheap-sweeps/05-03-SUMMARY.md
  modified:
    - package.json

key-decisions:
  - "Move jshint ^2.13.4 from dependencies to devDependencies (zero runtime require in lib/ or thinx-core.js)"
  - "Keep fs-finder in dependencies — 5 active runtime call sites in lib/ would break production if moved; defer full removal to a proposed v1.10 phase"
  - "Production-image-shape change validated by local docker build smoke + blocking-human operator gate before commit"

patterns-established:
  - "Pattern: blocking-human checkpoint for any production-image-shape change (per supply-chain threat-model entry T-05-SC)"
  - "Pattern: commit body documents scope-deferral rationale so post-hoc verifiers can reconstruct without reading CONTEXT.md"

requirements-completed: [REFACTOR-05]

# Metrics
duration: ~12min (full plan including Task 1-3 by prior agent, Task 4 operator review, Task 5 commit)
completed: 2026-06-02
---

# Phase 5 Plan 03: REFACTOR-05 — jshint to devDependencies (fs-finder deferred) Summary

**Moved `jshint ^2.13.4` from `dependencies` to `devDependencies` in `package.json`; `fs-finder` intentionally retained as a runtime dep with the full removal deferred to v1.10 because 5 active call sites in `lib/` make it not a "cheap sweep".**

## Performance

- **Duration:** ~12 min (Tasks 1-3 prior agent ~9 min, operator review + Task 5 commit ~3 min)
- **Started:** 2026-06-02 (Tasks 1-3 prior agent execution)
- **Completed:** 2026-06-02T20:14:28Z
- **Tasks:** 5 (Tasks 1-3 auto, Task 4 checkpoint:human-verify approved, Task 5 auto/commit)
- **Files modified:** 1 (`package.json`)

## Accomplishments
- `jshint` no longer installed into the production Docker image (`npm install --omit=dev`) — narrower runtime supply-chain surface
- Documented scope-deferral rationale in commit body so the fs-finder retention is auditable without reading `05-CONTEXT.md`
- Validated locally via `docker build --platform linux/amd64 -t thinx-test:phase5 .` (exit 0, zero `Cannot find module 'jshint'` hits)
- Operator-approved blocking-human checkpoint exercised the production-image-shape gate (per threat-model entry T-05-SC)

## Task Commits

Each task was committed atomically:

1. **Task 1: Pre-edit verification — confirm zero runtime require of jshint, snapshot package.json** — no commit (verification-only)
2. **Task 2: Move jshint from dependencies to devDependencies in package.json** — included in Task 5 atomic commit (`cb2f934b`)
3. **Task 3: Production Docker smoke-build — confirm image still builds** — no commit (verification-only)
4. **Task 4: Operator confirmation (checkpoint:human-verify, blocking-human)** — no commit (approval gate, response: `approved — proceed to commit`)
5. **Task 5: Commit REFACTOR-05 atomically** — `cb2f934b` (refactor, GPG-signed)

**Plan metadata:** (orchestrator-owned, lands at phase wrap-up — `.planning/STATE.md` and `05-02-SUMMARY.md`/`05-03-SUMMARY.md` will be committed by the phase wrap-up step)

## Files Created/Modified
- `package.json` — `jshint ^2.13.4` removed from `dependencies` (former line 59), inserted into `devDependencies` between `jest-junit` and `karma` (line 148). `fs-finder` unchanged in `dependencies`. Diff is exactly 2 hunks (1 removal + 1 addition); JSON validity preserved.

## Decisions Made
- **Move jshint, keep fs-finder.** REFACTOR-05's literal roadmap criterion required both packages moved to devDeps; the planner intentionally reduced scope after discovering 5 active `require('fs-finder')` call sites in `lib/`. The deferral is documented in `05-CONTEXT.md` (Decisions block) AND in the commit body of `cb2f934b`. Net: jshint move ships now (zero risk — zero runtime require), fs-finder removal is queued for a proposed v1.10 phase that swaps in `fs-extra` glob helpers or native `fs.promises.readdir` recursion.
- **Blocking-human checkpoint before commit.** Per supply-chain threat-model entry T-05-SC, production-image-shape changes are not auto-advanceable even with `workflow.auto_advance=true`. Operator reviewed the local docker-build evidence (exit 0, zero jshint-missing errors, JSON valid, expected 2-hunk diff, container halted at the unrelated pre-CouchDB config-loader stage) and approved.

## Deviations from Plan

None — plan executed exactly as written. The plan-level acceptance criterion AC5 (`git status --short` returns empty) was superseded by the resume-context note that `M .planning/STATE.md` (orchestrator-owned, pre-execution status update) and untracked `05-02-SUMMARY.md` / `05-03-SUMMARY.md` are owned by the phase wrap-up and explicitly out of this plan's scope. The package.json change landed atomically with no unstaged leakage — the substantive intent of AC5 (no `package.json` changes leaked out of the commit) is satisfied.

## Issues Encountered

None during Task 5. (Task 3's local docker run halted at the pre-CouchDB config-loader as anticipated by the plan — the plan explicitly documents that the local-only environment cannot reach `Server up at` without external services, and the canonical gate is post-merge CircleCI green + Swarmpit autoredeploy ≤5min SLA, which is exercised by Phase 5 wrap-up, not by this plan.)

## User Setup Required

None — no external service configuration required for this plan. The post-merge canonical gates (CircleCI green on push to `thinx-staging`, Swarmpit autoredeploy ≤5min SLA, swarm-side `docker service logs thinx_api | grep "Server up at"`) are exercised by `execute-phase` wrap-up after Plan 05-04 (doc-update) lands, not by this plan.

## Next Phase Readiness
- Plan 05-04 (ROADMAP/STATE doc-update reflecting the REFACTOR-05 scope amendment) is the next artifact in Phase 5 wave 2.
- After 05-04 lands, the Phase 5 wrap-up exercises the canonical post-merge gates (CircleCI + Swarmpit autoredeploy SLA + `Server up at` log assertion on the swarm host).
- A v1.10 fs-finder-removal phase is queued in the deferred backlog (see `05-CONTEXT.md` Deferred Ideas).

## Self-Check: PASSED

Verified items:
- `package.json` modified — FOUND (1 file changed, 1 insertion, 1 deletion per `git show --stat cb2f934b`)
- Commit `cb2f934b` exists — FOUND (`git log --oneline -1` returns the expected subject)
- GPG signature — FOUND (`git log -1 --show-signature` returns "Good signature" from the project's canonical signing key)
- SUMMARY.md path — `.planning/phases/05-backend-hygiene-cheap-sweeps/05-03-SUMMARY.md`

---
*Phase: 05-backend-hygiene-cheap-sweeps*
*Plan: 03*
*Completed: 2026-06-02*
