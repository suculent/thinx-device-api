---
gsd_state_version: "1.0"
milestone: v1.18
milestone_name: Console Improvements
current_phase: 48
current_phase_name: Deep Links & Close-out
status: executing
stopped_at: Completed 48-04-PLAN.md
last_updated: "2026-10-15T15:48:40.929Z"
last_activity: 2026-10-15
last_activity_desc: Phase 48 execution started
state_head: 646ea2d36ef0645174c16d51d6f3b18e94d1a602
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 6
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-15) and `.planning/workstreams/vue-console/REQUIREMENTS.md`

**Core value:** Bring the Vue console to Legacy-console parity and polish (login, devices, deploy keys, transformers, environment globals, repositories, build-log search) and close the console leftovers of v1.16, without breaking any Legacy route or API envelope.
**Current focus:** Phase 48 — Deep Links & Close-out

## Current Position

Phase: 48 (Deep Links & Close-out) — EXECUTING
Plan: 5 of 6
Status: Ready to execute
Last activity: 2026-10-15 — Phase 48 execution started

Progress: [█████████░] 86%

## Performance Metrics

**Velocity:**
- Total plans completed: 25
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 42 | 3 | - | - |
| 43 | 3 | - | - |
| 44 | 3 | - | - |
| 45 | 5 | - | - |
| 46 | 6 | - | - |
| 47 | 5 | - | - |

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
| Phase 46 P01 | 3 min | 2 tasks | 4 files |
| Phase 46 P02 | 14 min | 3 tasks | 10 files |
| Phase 46 P03 | 13min | 3 tasks | 4 files |
| Phase 46 P04 | 17min | 3 tasks | 9 files |
| Phase 46 P05 | 12 min | 2 tasks | 1 files |
| Phase 46 P06 | 25 min | 3 tasks | 5 files |
| Phase 47 P01 | 12 min | 3 tasks | 8 files |
| Phase 47 P02 | 10min | 3 tasks | 11 files |
| Phase 47 P03 | 13 min | 2 tasks | 1 files |
| Phase 47 P04 | 10 min | 3 tasks | 10 files |
| Phase 47 P05 | 13 min | 2 tasks | 4 files |
| Phase 48 P01 | 16 min | 3 tasks | 12 files |
| Phase 48 P02 | 4 min | 2 tasks | 4 files |
| Phase 48 P03 | 17min | 3 tasks | 11 files |
| Phase 48 P04 | 6 min | 2 tasks | 6 files |

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
- [Phase 46]: 46-01: apienv.create replaces only the entry named exactly String(key) (D-02); one redis.set and all env envelopes unchanged
- [Phase 46]: 46-02: saveTransformers returns refreshed: false when only the re-read fails (35 IN-02 fixed in console ed429ec); pages reload separately
- [Phase 46]: 46-02: transformers/deleteItems(utids) re-reads and writes once; devices/loadDevices throws so the usage line can fall back to the generic sentence
- [Phase 46]: 46-02: shared Phase 46 rules live in vue/src/styles/_settings-pages.scss (imported after deploy-keys); 46-03/46-04 append to it
- [Phase 46]: 46-03: enviros createItem/deleteItems resolve refreshed: false when only the follow-up GET /env fails (console aef5a22), so a stored edit is never reported as keeping the old value
- [Phase 46]: 46-03: Add Variable loads the list first when it is loading or failed and refuses while it cannot be read, so a blind PUT never overwrites a listed key (T-46-13)
- [Phase 46]: 46-04: confirmLeave(vm) in src/utils/confirmLeave.js is the one unsaved-changes confirm (Keep editing focused, true only for OK); Device Detail and TransformerEditor guard every route leave with one dialog per attempt (leavePrompting), no beforeunload
- [Phase 46]: 46-04: Device Detail saveTransformers decides success only from updateDevice; Transformers saved. is set before the reload, card messages clear on the checkbox user change event, not a watcher
- [Phase 46]: 46-04: 37 IN-02 fixed by console dac2c5e + d526ff7, 37 IN-03 by a16307a; Phase 35 IN-02 (console ed429ec) listed under Closed in Phase 46 in ROADMAP Phase 48 for the FIX-01 ledger
- [Phase 46]: 46-05: shipped without a rebase (origin/thinx-staging still 17d63319); pipeline 5671 legacy-off OK; bundle 656bb9e live; SUMMARY and close-out docs ride the next thinx-staging push
- [Phase 46]: 46-06: Device Detail loadDevice keeps every draft that differs from the device on screen; each save first applies what it wrote to a copy of the device (CR-01)
- [Phase 46]: 46-06: Device Detail reads the device list through the throwing devices/loadDevices; a failed re-read keeps the written values on screen (WR-05)
- [Phase 47]: 47-01: BuildLogDialog.open() accepts only a non-empty string build_id; console 002e051 fixes 35 IN-07 and 36 IN-02 at the dialog
- [Phase 47]: 47-01: build log search is a literal gi RegExp on the original text, capped at 1000 text-only mark segments; Phase 47 styles live in _build-log.scss with six !default tokens
- [Phase 47]: 47-02: navbar rows get a click listener only for a non-empty string build_id (rowListeners), matching BuildLogDialog.open()
- [Phase 47]: 47-02: View aria-label 'Open build log <id>' lacks the visible word View (WCAG 2.5.3); copy locked by D-13, flagged for Phase 48
- [Phase 47]: 47-03: shipped without a rebase (origin/thinx-staging still 6d47a5fb); pipeline 5673 legacy-off OK; bundle ab37879 live, API restart 502 for ~34 s; SUMMARY and close-out docs ride the next thinx-staging push
- [Phase 47]: 47-04: hasBuildLog(build) in utils/buildLog.js (non-empty string build_id only) is the single gate for every build-log control and BuildLogDialog.open(); View aria-label is 'View build log <id>' (WCAG 2.5.3)
- [Phase 47]: 47-04: History rows without a build log have no build-row class or row click and show the No build log placeholder (WR-02, UI-REVIEW fix 1)
- [Phase 47]: 47-05: shipped without a rebase (origin/thinx-staging still ab378790); pipeline 5674 legacy-off OK; bundle fc0fa01 live 11:06:51Z, API restart 502 for ~32 s; UI-SPEC, 47-02 truths and 47-REVIEW ledger (WR-01, WR-02, IN-03 fixed, open: 5) match the 47-04 code
- [Phase 47]: 47-05: ship-plan path gate grep -vxE '|services/console' is vacuous on macOS BSD grep (empty subexpression); use grep -vx -e '' -e 'services/console' in future ship plans
- [Phase 48]: 48-01: App.vue waits for router.onReady (success and error) and reads router.currentRoute before the default-route decision (NOTIF-04)
- [Phase 48]: 48-01: IN-01 guards live in the stores (profile keeps its initial object, list stores commit an empty list), so pages keep their empty-state copy
- [Phase 48]: 48-02: test-vue-console (no context, anonymous public image) gates vue-console-registry and vue-console-hub; it carries the union of their branch filters (CI-07, D-01)
- [Phase 48]: 48-02: build_legacy_console default true restores the legacy builds; parameter and legacy-console workflow stay as the kill switch (CI-06, D-08)
- [Phase 48]: 48-02: check-ci-gates.js pipeline defaults to --expect legacy-on, matching the new pipeline default
- [Phase 48]: 48-03: DeviceDetail Build Firmware guarded by one buildPending flag (early return, reset in finally, focus restored only if the button had focus); buildFailure copied from Devices.vue
- [Phase 48]: 48-03: comparePlatformKeys in utils/platforms.js (basePlatform on both args, unknown last, lower-cased label) is the single ordering for the platform pills and the Platform sort
- [Phase 48]: 48-04: Legacy deploy-key create mirrors vue keyNames.js sentences (deploykey.cjs D10 compares them); client check only C0/DEL/120 units, server invalid_key_name reasons map to the same sentences; reset in finally + .always (console 2105310)
- [Phase 48]: 48-04: Legacy wss.onopen always sends {init} then the logtail; wsstailLog sends only on readyState 1; deviceBuilds map and per-udid array initialised before push; updateDeploykeys uses goals.length > 0 (console bff9552)
- [Phase 48]: 48-04: DevicesController.js:135 build refusal toast still reads response.status; left unchanged as flagged, follow-up candidate for the 48-06 ledger

### Pending Todos

- `2026-10-03-console-notification-delivery-gaps` (items 2–4) is covered by Phase 43.

### Blockers/Concerns

- [Phase 48] CI-07: the Vue Cypress job in thinx-cloud/console has been red since at least 2026-10-01 (4/10 specs: devices, profile, login, oauth-return; diagnosis 2026-10-12). Also check `services/console/src/cypress/.env.test`, which is tracked in git (not read; secret-file guard), for committed credentials, and stop CI logging in as the leaked fixture user `test`.
- [Phase 43] Resolved 2026-10-13: the NOTIF-01 one-off legacy bypass was skipped by the operator (`skip-bypass`); the served Legacy image already carries the escape. Roadmap Phase 43 criterion 2 is recorded as not executed (43-03-SUMMARY); `thinx/console:swarm` is refreshed only by CI-06 (Phase 48).
- [Phase 42 follow-up] Pushed 2026-10-12 (operator, `2e018d7f..b7ea0959`): Phase 42 close-out, WR-01, quick 261012-r9z Codacy fixes, the `-s ours` main merge `87525c98` and the README rewrite. Confirm the Codacy PR #573 status once re-analysed.
- [Phase 42 follow-up] H6: confirm the first `main` pipeline after Phase 42 runs all four Snyk monitors green (snyk-monitor-console-vue now uses the dockerhub context only). WR-02 accepted: production images are Snyk-scanned only via main.
- [Phase 43] The WebSocket upgrade change in `thinx-core.js` must keep `ZZ-WebSocketHandshakeRtmSpec` green and keep per-owner frame routing (quick 261003-vn3); no cross-owner delivery.
- [Phase 45] v1.17 Phase 40 (`vault-transit`) rewrites private-key storage in the same `lib/thinx/rsakey.js`; rename touches only the `.pub` comment. Coordinate merge order.
- [Phase 46 follow-up] 46-SECURITY.md residual R2: the operator still has to decide WR-01 (46-VERIFICATION.md:192): fix the apienv write acknowledgement, or ratify T-46-06 (AR-46-01). The decision should also cover the unchecked `redis.get` error at apienv.js:26-28. R1 (unisolated name in the single-delete question), R3 (overlapping Device Detail saves) and R4/R5 are listed there too.
- [Phase 48] From the Phase 47 re-review (47-REVIEW-DISPOSITION.md, 9 info open): IN-10 — assert the History row's `rowListeners()` keys are exactly `['click']` (the source guard can no longer see listeners added there); IN-07 — `Devices.vue:475` rejects whitespace-only build ids that `hasBuildLog` accepts, and the P3 guard does not cover `item.build_id` or Devices.vue.
- [UAT] Hard-reload the console (bypass the cache) before production UAT. Phase 46 test 1 first failed on a stale cached bundle.
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

**Last session:** 2026-10-15T15:48:40.686Z
**Stopped At:** Completed 48-04-PLAN.md
**Resume File:** None
