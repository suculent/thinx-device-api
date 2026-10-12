---
gsd_state_version: "1.0"
milestone: v1.18
milestone_name: Console Improvements
current_phase: 42
current_phase_name: CI Trim, Login Page & Build Footer
status: executing
stopped_at: Completed 42-01-PLAN.md
last_updated: "2026-10-12T16:29:39.543Z"
last_activity: 2026-10-12
last_activity_desc: Phase 42 execution started
state_head: 3a5163f5b71b91880a0468bbc11516f6dd098f75
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 3
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-12) and `.planning/workstreams/vue-console/REQUIREMENTS.md`

**Core value:** Bring the Vue console to Legacy-console parity and polish (login, devices, deploy keys, transformers, environment globals, repositories, build-log search) and close the console leftovers of v1.16, without breaking any Legacy route or API envelope.
**Current focus:** Phase 42 — CI Trim, Login Page & Build Footer

## Current Position

Phase: 42 (CI Trim, Login Page & Build Footer) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-10-12 — Phase 42 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 42 P01 | 7 min | 3 tasks | 4 files |

## Accumulated Context

### Decisions

- Roadmap: 7 phases (42–48), numbering continues after v1.17's 39–41 (`vault-transit`). Grouped by console surface; each surface's v1.16 review/UI-review items go with it.
- CI-04/CI-05 in Phase 42 (first), so every later `thinx-staging` push skips the Snyk monitors and the legacy console build. CI-06 (re-enable + ship remaining Legacy changes) is in Phase 48 and gates milestone close.
- NOTIF-01 (operator decision 2026-10-12): ships early through a one-off legacy console build with CI-05 bypassed for that pipeline only; owned by Phase 43, right after Phase 42.
- Shared building blocks (platform bullet, icon button with aria-label + hover tip) land in Phase 44 (Device List Parity) and are reused by Phases 45–47.
- FIX-01 (Phase 35 ledger) maps to Phase 48; Phase 35 items in files opened earlier are fixed in Phases 45 (IN-03/04/05), 46 (IN-02) and 47 (IN-06/07) and recorded in the Phase 48 ledger.
- Parent API changes: Phase 43 (`thinx-core.js` socket guard, messenger/builder status frames) and Phase 45 (deploy-key rename, FIX-04). Parent CI changes: Phases 42 and 48.
- [Phase 42]: 42-01: CI-05 gate is workflow legacy-console with when on pipeline parameter build_legacy_console (default false); snyk-monitor-console-classic lives inside it because requires cannot cross workflows
- [Phase 42]: 42-01: CI-04 Snyk monitors run on main only; console monitors scan thinxcloud/console:vue and :latest on docker.io with the dockerhub context only; gates proven via node scripts/check-ci-gates.js compile

### Pending Todos

- `2026-10-03-console-notification-delivery-gaps` (items 2–4) is covered by Phase 43.

### Blockers/Concerns

- [Phase 42/43] CI-05 must allow one bypassed legacy pipeline for NOTIF-01 (Phase 43). Choose the mechanism in Phase 42 planning (e.g. a pipeline parameter gating the block).
- [Phase 42] CI-04: the console Snyk container monitors scan private-registry images that only `thinx-staging` publishes; on `main` they need the Docker Hub images (`*-hub` jobs) as their source.
- [Phase 43] The WebSocket upgrade change in `thinx-core.js` must keep `ZZ-WebSocketHandshakeRtmSpec` green and keep per-owner frame routing (quick 261003-vn3); no cross-owner delivery.
- [Phase 45] v1.17 Phase 40 (`vault-transit`) rewrites private-key storage in the same `lib/thinx/rsakey.js`; rename touches only the `.pub` comment. Coordinate merge order.
- [All] Console `test:unit` is not run in CI; run it locally before every push. Parent pushes go to `thinx-staging` only.
- [Milestone close] Do not close v1.18 with the CI-05 block still in place (CI-06).

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| requirement | AR-36-01 full-log payload size | Future | 2026-10-12 | v1.18 |

## Session Continuity

**Last session:** 2026-10-12T16:29:39.508Z
**Stopped At:** Completed 42-01-PLAN.md
**Resume File:** None
