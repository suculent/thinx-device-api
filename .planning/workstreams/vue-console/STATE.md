---
gsd_state_version: "1.0"
milestone: v1.18
milestone_name: Console Improvements
current_phase: 43
current_phase_name: Notification Delivery
status: executing
stopped_at: Phase 43 UI-SPEC approved
last_updated: "2026-10-12T20:54:01.007Z"
last_activity: 2026-10-12
last_activity_desc: Phase 42 complete, transitioned to Phase 43
state_head: 789954013d9b5644d15afab175d2194922519874
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 3
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-12) and `.planning/workstreams/vue-console/REQUIREMENTS.md`

**Core value:** Bring the Vue console to Legacy-console parity and polish (login, devices, deploy keys, transformers, environment globals, repositories, build-log search) and close the console leftovers of v1.16, without breaking any Legacy route or API envelope.
**Current focus:** Phase 43 — Notification Delivery

## Current Position

Phase: 43 (Notification Delivery) — READY TO EXECUTE
Plan: Not started
Status: Ready to execute
Last activity: 2026-10-12 - Completed quick task 261012-r9z: Fix Codacy findings on PR 573

Progress: [█░░░░░░░░░] 14%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 42 | 3 | - | - |

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 42 P01 | 7 min | 3 tasks | 4 files |
| Phase 42 P02 | 8 min | 3 tasks | 11 files |
| Phase 42 P03 | 8 min | 2 tasks | 1 files |

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
- [Phase 42]: 42-02: one shared AppFooter (variant auth|layout) on Login, PasswordReset and Layout; build year and 7-hex commit id shown only when valid, so dev/empty/undefined never render
- [Phase 42]: 42-02: the 460px stacked social-row media block must follow the row rules (same specificity); login-page.cjs asserts the cascade order
- [Phase 42]: 42-03: shipped via thinx-staging; pipeline 5655 ran only test, api-registry, vue-console-registry (CI-GATES PIPELINE OK); console.thinx.cloud serves id 2e018d7 and the logo; Legacy files byte-identical
- [Phase 42]: 42-03: close-out docs commits stay local (a docs-only thinx-staging push would redeploy API and Vue); they ride the next push

### Pending Todos

- `2026-10-03-console-notification-delivery-gaps` (items 2–4) is covered by Phase 43.

### Blockers/Concerns

- [Phase 48] CI-07: the Vue Cypress job in thinx-cloud/console has been red since at least 2026-10-01 (4/10 specs: devices, profile, login, oauth-return; diagnosis 2026-10-12). Also check `services/console/src/cypress/.env.test`, which is tracked in git (not read; secret-file guard), for committed credentials, and stop CI logging in as the leaked fixture user `test`.
- [Phase 43] The NOTIF-01 legacy build uses the CI-05 bypass: API-triggered thinx-staging pipeline with `build_legacy_console=true` (runbook `.planning/runbooks/legacy-console-build-gate.md`). It also reruns the API and Vue deploy jobs, i.e. a production redeploy (42-REVIEW IN-01).
- [Phase 42 follow-up] Pushed 2026-10-12 (operator, `2e018d7f..b7ea0959`): Phase 42 close-out, WR-01, quick 261012-r9z Codacy fixes, the `-s ours` main merge `87525c98` and the README rewrite. Confirm the Codacy PR #573 status once re-analysed.
- [Phase 42 follow-up] H6: confirm the first `main` pipeline after Phase 42 runs all four Snyk monitors green (snyk-monitor-console-vue now uses the dockerhub context only). WR-02 accepted: production images are Snyk-scanned only via main.
- [Phase 43] The WebSocket upgrade change in `thinx-core.js` must keep `ZZ-WebSocketHandshakeRtmSpec` green and keep per-owner frame routing (quick 261003-vn3); no cross-owner delivery.
- [Phase 45] v1.17 Phase 40 (`vault-transit`) rewrites private-key storage in the same `lib/thinx/rsakey.js`; rename touches only the `.pub` comment. Coordinate merge order.
- [All] Console `test:unit` is not run in CI; run it locally before every push. Parent pushes go to `thinx-staging` only.
- [Milestone close] Do not close v1.18 with the CI-05 block still in place (CI-06).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261012-r9z | Fix Codacy findings on PR 573 (no-control-regex x2, unsafe-regex); CodeQL clean | 2026-10-12 | 174cf071 | [261012-r9z-fix-codacy-findings-on-pr-573-no-control](./quick/261012-r9z-fix-codacy-findings-on-pr-573-no-control/) |

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| requirement | AR-36-01 full-log payload size | Future | 2026-10-12 | v1.18 |

## Session Continuity

**Last session:** 2026-10-12T20:14:39.421Z
**Stopped At:** Phase 43 UI-SPEC approved
**Resume File:** .planning/workstreams/vue-console/phases/43-notification-delivery/43-UI-SPEC.md
