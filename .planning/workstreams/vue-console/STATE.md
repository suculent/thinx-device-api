---
gsd_state_version: "1.0"
milestone: v1.18
milestone_name: Console Improvements
current_phase: 46
current_phase_name: Transformers & Environment Globals
status: planning
stopped_at: Phase 46 planned (5 plans, 4 waves), ready to execute
last_updated: "2026-10-13T19:33:31.779Z"
last_activity: 2026-10-13
last_activity_desc: Phase 46 planned; plan check passed (0 blockers, 1 advisory)
state_head: 17d63319651eee31c871b45878aa38c7f1a5f726
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 3
  completed_plans: 7
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-12) and `.planning/workstreams/vue-console/REQUIREMENTS.md`

**Core value:** Bring the Vue console to Legacy-console parity and polish (login, devices, deploy keys, transformers, environment globals, repositories, build-log search) and close the console leftovers of v1.16, without breaking any Legacy route or API envelope.
**Current focus:** Phase 45 — Deploy Key Rename & Row Actions

## Current Position

Phase: 46 — Transformers & Environment Globals
Plan: Not started
Status: Ready to execute
Last activity: 2026-10-13 — Phase 45 complete, transitioned to Phase 46

Progress: [██████░░░░] 57%

## Performance Metrics

**Velocity:**
- Total plans completed: 14
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 42 | 3 | - | - |
| 43 | 3 | - | - |
| 44 | 3 | - | - |
| 45 | 5 | - | - |

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 42 P01 | 7 min | 3 tasks | 4 files |
| Phase 42 P02 | 8 min | 3 tasks | 11 files |
| Phase 42 P03 | 8 min | 2 tasks | 1 files |
| Phase 43 P01 | 10min | 3 tasks | 7 files |
| Phase 43 P02 | 8min | 3 tasks | 4 files |
| Phase 43 P03 | 25min | 3 tasks | 0 files |
| Phase 44 P01 | 10m 27s | 3 tasks | 9 files |
| Phase 44 P02 | 10m 27s | 3 tasks | 8 files |
| Phase 44 P03 | 8m 35s | 2 tasks | 1 files |
| Phase 45 P05 | 11 min | 2 tasks | 1 files |

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
- [Phase 43]: NOTIF-02: WebSocket upgrades tracked per connection and per verified owner in lib/thinx/socket_upgrade.js (path-keyed socketMap guard removed); cap 10 live sockets per owner, 11th gets HTTP 429 with one log line
- [Phase 43]: Credential-free live probe scripts/check-ws-multitab.js (WS-MULTITAB OK/FAIL) is how 43-03 proves multi-tab upgrades on rtm.thinx.cloud
- [Phase 43]: 43-02: Build Status frames go through messenger.sendToOwner; run_build binds the owner from br.owner via Builder#consoleNotifiers (caller-supplied owners ignored); route and queue pass only { messenger }
- [Phase 43]: 43-02: one terminal Build Status frame per build_id (error or Completed; bounded memory 1000); Completed only for an OK status, otherwise the status or Failed as error; raw log lines never reach console sockets
- [Phase 43]: 43-03: operator chose skip-bypass; no build_legacy_console=true pipeline ran. NOTIF-01 is live through the pre-CI-05 legacy build (served LogviewController byte-identical to console cfff199, carries thinxEscapeHtml); roadmap Phase 43 criterion 2 (one-off legacy build) not executed
- [Phase 43]: 43-03: shipped 7cec687b..b1126b6c via pipeline 5659 (legacy-off, no Snyk); WS-MULTITAB FAIL 1/2 -> OK 2/2 on rtm.thinx.cloud; D-16 human checks pending UAT
- [Phase 44]: 44-01: Devices filter field is platformFilter (filterPlatform contains the forbidden string Platform:)
- [Phase 44]: 44-01: PlatformBullet + utils/platforms.js are the shared platform contract; colours only in _platforms.scss keyed list
- [Phase 44]: 44-02: IconButton (icon, label, variant, disabled; inheritAttrs false) is the shared row action button; the label is visible text from lg, aria-label and wrapper tip
- [Phase 44]: 44-02: Build in-flight guard is a buildingUdids list released in finally; buildDevice and openLastBuild also guard their own disabled states
- [Phase 44]: 44-02: icomoon ported as woff+ttf byte copies with only .icomoon-hammer_icon; URLs relative to theme.scss like flaticon
- [Phase 44]: 44-03: shipped console cfff199..6a34102 and parent 4fcacece..d630652e via pipeline 5662 (legacy-off, no Snyk, CI-GATES PIPELINE OK); console.thinx.cloud serves id d630652 with all Phase 44 markers; Legacy files byte-identical; 9 human checks pending UAT
- [Phase 45]: 45-05: shipped as pipeline 5666 (legacy-off); console 604258c..31ed738, parent cad3088d..c3f78558; SUMMARY/close-out docs stay local until the next thinx-staging push

### Pending Todos

- `2026-10-03-console-notification-delivery-gaps` (items 2–4) is covered by Phase 43.

### Blockers/Concerns

- [Phase 48] CI-07: the Vue Cypress job in thinx-cloud/console has been red since at least 2026-10-01 (4/10 specs: devices, profile, login, oauth-return; diagnosis 2026-10-12). Also check `services/console/src/cypress/.env.test`, which is tracked in git (not read; secret-file guard), for committed credentials, and stop CI logging in as the leaked fixture user `test`.
- [Phase 43] Resolved 2026-10-13: the NOTIF-01 one-off legacy bypass was skipped by the operator (`skip-bypass`); the served Legacy image already carries the escape. Roadmap Phase 43 criterion 2 is recorded as not executed (43-03-SUMMARY); `thinx/console:swarm` is refreshed only by CI-06 (Phase 48).
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
| 261013-kvm | Optional New Relic APM for the API: loader on thinx.js line 1, newrelic 14.5.1 pinned, NEW_RELIC_LICENSE_KEY external secret on api (unpushed) | 2026-10-13 | 33cb0ed1 | [261013-kvm-add-optional-new-relic-apm](./quick/261013-kvm-add-optional-new-relic-apm/) |

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| requirement | AR-36-01 full-log payload size | Future | 2026-10-12 | v1.18 |

## Session Continuity

**Last session:** 2026-10-13T15:44:30.125Z
**Stopped At:** Phase 45 complete, ready to plan Phase 46
**Resume File:** None
