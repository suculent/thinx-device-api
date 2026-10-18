---
gsd_state_version: "1.0"
milestone: v1.18
milestone_name: Console Improvements
status: Awaiting next milestone
stopped_at: Completed 48.1-04-PLAN.md (phase 48.1 executed; operator push pending)
last_updated: "2026-10-18T08:19:02.828Z"
last_activity: 2026-10-18
last_activity_desc: Milestone v1.18 completed and archived
state_head: 2eace903a3fc6006e7d903531b54bbbb4288534c
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 37
  completed_plans: 37
  percent: 100
current_phase: "48.1"
current_phase_name: "Close v1.18 audit gaps: admin deep link, store error states, Cypress coverage (INSERTED)"
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-18 after v1.18) and `milestones/v1.18-REQUIREMENTS.md` (archived; no active REQUIREMENTS.md until the next milestone)

**Core value:** The Vue console stays at Legacy-console parity without breaking any Legacy route or API envelope.
**Current focus:** Planning next milestone (v1.18 shipped 2026-10-18; operator checks from the 48.1 UAT still pending)

## Current Position

Phase: Milestone v1.18 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-10-18 — Milestone v1.18 completed and archived

## Performance Metrics

**Velocity:**
- Total plans completed: 33
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
| 48 | 8 | - | - |

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
| Phase 48 P05 | 2h 0m | 3 tasks | 16 files |
| Phase 48 P08 | 2h 4m | 3 tasks | 5 files |
| Phase 48.1 P01 | 21 min | 2 tasks | 6 files |
| Phase 48.1 P02 | 19 min | 3 tasks | 12 files |
| Phase 48.1 P03 | 23 min | 3 tasks | 14 files |
| Phase 48.1 P04 | 10 min | 2 tasks | 1 files |

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
- [Phase 48]: 48-05: Vue Cypress runs same-origin (VUE_APP_API_HOSTNAME= empty) with cy:test:ci junit results in vue/cypress/results; CI logs in via cy.stubLogin(), the real-API login needs CYPRESS_LIVE_LOGIN=1 plus explicit credentials; full suite 11 specs 77 tests 0 failing (console a076889..1d68915)
- [Phase 48]: 48-05: operator option A: bootstrap-vue 2.21.2 BButton renders aria-pressed only from a boolean pressed prop, so Devices.vue toggles and pills bind :pressed (console 1d68915); unit harness attrsOf mirrors BButton; .active darkens the pressed btn-light (visual UAT queued)
- [Phase 48]: 48-05: the Legacy Cypress env file under console src/cypress is untracked and ignored without being read (console 44a9db6, D-05); operator name+length inspection and any rotation queued for the 48-06 UAT list
- [Phase 48]: 48-07: Vue Cypress CI runs use the in-repo cypress/reporters/junit.js (one junit-<spec>.xml per spec, rewritten on every end, never throws, no npm dependency) instead of Cypress 9.7.0's bundled mocha-junit-reporter 2.0.0, which threw on a repeated end; CI runs are video-free with fonts.googleapis.com, fonts.gstatic.com and *.gvt1.com blocked; CircleCI now lists pending tests as skipped (77 results). On console/parent thinx-staging since 0692f0f / e13933a3.
- [Phase 48]: 48-08: VERDICT A+B for the logged-out deep-link flake. Cause: deep-link test 3 ended with its eight dashboard reads in flight, Cypress failed them when test 4 reset the intercepts, Api.request() let TypeError 'Failed to fetch' escape, Header.vue's uncaught fetchProfile chain made it an unhandled rejection, and Cypress's fail() stopped test 4's beforeEach queue (no viewport, no cy.stubThinxApi) and left the error state that made the #/login assertion give up with an undefined subject. Fix: Api.request() resolves a rejected fetch/fetchWithCsrf to { success: false, status: 0, response: null } (unit I9, console 9a0e1cd RED then 09fbde1) and test 3 waits by alias for its eight reads (512ddb5, additions only). Proof: RED arm W 20/20 failed before, 0/20 after; arms S, F, W 3x40 green; deep-link 55/55 consecutive in the CI mirror; full suite 11/11 (77 results); pipeline 5677 green.
- [Phase 48]: 48-06: resumed at Task 1 step 8 against H=24d2b7cd (pipeline 5677) without redoing steps 1-7; Task 2 halted on an over-broad plan marker (flaticon-settings-10 also matches the icon-font CSS rule), recorded as halted rather than reinterpreted
- [Phase 48.1]: 48.1-01: the admin guard loads the profile in Routes.js (isAdminSession), only for /app/admin paths and only while the profile store holds its initial empty object; a profile that cannot be loaded fails closed to /app/dashboard (PD-01..PD-03)
- [Phase 48.1]: 48.1-01: a logged-out cold load posts /session/token twice (guard, then App.vue after onReady); logged-out deep-link tests settle both with cy.wait(['@unstubbed', '@unstubbed']) so the next test's catch-all records nothing (48-08 method, additions only)
- [Phase 48.1]: 48.1-01: audit-gaps-v118.cjs is standalone (harness copied from close-out-v118.cjs); Y1 spec hygiene is specHygiene(file, { tests }) with the forbidden markers as data for 48.1-03
- [Phase 48.1]: 48.1-02: the four fetchers throw only on result.networkError (PD-04) and keep their state (PD-05); the pages clear their own rows, selection and action error and show one fixed-copy load error; a stored write with a failed follow-up read resolves refreshed: false and the page reloads (PD-09 re-sync on success)
- [Phase 48.1]: 48.1-02: a failed profile read never blocks sign-in (PD-06): Header catches, Login and OAuthReturn wrap only the fetchProfile await, Routes.js already fails closed, DeviceDetail reads repositories through allSettled
- [Phase 48.1]: 48.1-02: audit-gaps-v118.cjs gained a --tap reporter mode (test-only commit b1ef8be) so the TDD red-evidence classifier reads the harness own report; the default ok/FAIL output that test:unit and the plan verifies grep is unchanged
- [Phase 48.1]: 48.1-03: every new spec is stub-only and settles its reads by alias; the catch-all must stay empty in every test (Y1 unstubbed option), so a request that would reach the dev-server proxy fails the gate (PD-08, T-48.1-10)
- [Phase 48.1]: 48.1-03: GET /source stays opt-in (cy.stubSources) because DeviceDetail reads it and the device specs rely on the catch-all; /rsakey reads and writes and PUT /env became default stubs since no existing spec reaches them (PD-07)
- [Phase 48.1]: 48.1-03: the build-log scroll-to-match assertion is withheld, not weakened: BuildLogDialog.scrollToCurrent measures the modal body one tick before the b-modal transporter re-renders it, a pre-existing vue/src defect the test-only plan may not fix; recorded in deferred-items.md and the WINDOWS ledger
- [Phase 48.1]: 48.1-04: the ship step stays with the operator (PD-10): nothing pushed; parent b99eb66d bumps the console gitlink cd016ec -> 4fef60d locally; push order, pipeline gate and post-deploy checks are in the 48.1-04 SUMMARY operator checklist
- [Phase 48.1]: 48.1-04: console 4fef60d passes the test-vue-console job commands locally twice (unit 464 ok, build and perf OK, 16 specs 93 results / 83 passing / 10 pending / 0 failing, 16 JUnit files, 0 failures); scope diffs against cd016ec clean

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
- [Resolved by 48-08] The 48-06 Task 1 step 8 stop (pipeline 5675) and the 48-07 halt (pipeline 5676, the logged-out deep-link redirect) are fixed: VERDICT A+B, test 3's dashboard reads were still in flight when Cypress reset the intercepts for test 4, and Api.request() let the resulting 'Failed to fetch' escape as an unhandled rejection that stopped test 4's beforeEach; console fix commits 9a0e1cd, 09fbde1, 512ddb5; pipeline 5677 `CI-GATES PIPELINE OK 5677` (test-vue-console job 16075 green, 77 JUnit results, 0 failures; vue-console-registry success); pushed parent SHA 24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed. 48-06 resumes at Task 1 step 8 with H=24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed: run its verify 4 and 5 with that H instead of `git rev-parse HEAD` (the local docs commits above that SHA touch only `.planning/` and ride the next push), run verify 6 against the same SHA, then Task 2. 48-06's pre-push baselines stay in `${TMPDIR}/p48-*`.
- [Resolved 2026-10-16] [Phase 48] 48-06 halted at Task 2 verify 2: 'still served: flaticon-settings-10' is a false positive (the only hit is the untouched icon-font CSS rule from vue/src/styles/_icons.scss; the Header cog markup 'fi flaticon-settings-10' went 1 -> 0). All other gates pass (CI-GATES PIPELINE OK 5677; JUNIT job 16075 77/0; Vue id 24d2b7c + 7 markers; Legacy D-09 markers; API 401s; port 7442 200; WS-MULTITAB OK 2/2). Operator chose to amend the check to the markup form `fi flaticon-settings-10`; rerun against H=24d2b7cd rc 0; 48-06 complete.
- [Phase 48.1] BUILD-03 defect found by 48.1-03: stepping through build-log matches never scrolls the modal log box (BuildLogDialog.scrollToCurrent runs one tick before the b-modal transporter re-renders; scrollTop stays 0). Owner decision: fix BuildLogDialog.vue (candidate in the phase deferred-items.md), then add the scrollTop assertion to build-log-search.spec.js test 1.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261012-r9z | Fix Codacy findings on PR 573 (no-control-regex x2, unsafe-regex); CodeQL clean | 2026-10-12 | 174cf071 | [261012-r9z-fix-codacy-findings-on-pr-573-no-control](./quick/261012-r9z-fix-codacy-findings-on-pr-573-no-control/) |
| 261013-kvm | Optional New Relic APM for the API: loader on thinx.js line 1, newrelic 14.5.1 pinned, NEW_RELIC_LICENSE_KEY external secret on api (unpushed) | 2026-10-13 | 33cb0ed1 | [261013-kvm-add-optional-new-relic-apm](./quick/261013-kvm-add-optional-new-relic-apm/) |

### Roadmap Evolution

- Phase 48.1 inserted after Phase 48: Close v1.18 audit gaps: admin deep link (W1), store error states (W2), Cypress coverage (W3) (URGENT)

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | github-token-private-repo | investigating | 2026-10-18 | v1.18 |
| todos | 2026-10-15-clean-docker-cron-broken-docker-service-restart.md | (presence-only) | 2026-10-18 | v1.18 |
| todos | 2026-10-15-error-pages-middleware-rtm-console-routers.md | (presence-only) | 2026-10-18 | v1.18 |
| todos | 2026-10-15-gluster-ssl-dir-world-writable-private-keys.md | (presence-only) | 2026-10-18 | v1.18 |
| todos | 2026-10-15-mosquitto-conf-redis-password-world-readable.md | (presence-only) | 2026-10-18 | v1.18 |
| todos | 2026-10-15-mosquitto-traefik-key-pem-mode-0754.md | (presence-only) | 2026-10-18 | v1.18 |
| uat_gaps | 48.1/48.1-UAT.md | testing (5 pending operator checks: CI run, served console, impersonation spot-check, build-log scroll decision, judgment prohibitions) | 2026-10-18 | v1.18 |
| verification_gaps | 48.1/48.1-VERIFICATION.md | human_needed (25/28 verified, 0 gaps) | 2026-10-18 | v1.18 |
| deferred_items | 48/deferred-items.md: stale "enters through the dashboard" spec comments (already resolved in 48-05) | acknowledged | 2026-10-18 | v1.18 |
| deferred_items | 48.1/deferred-items.md: build-log search stepping does not scroll the log box (BuildLogDialog.vue timing, WINDOWS entry 21) | acknowledged | 2026-10-18 | v1.18 |
| requirement | AR-36-01 full-log payload size | Future | 2026-10-12 | v1.18 |

## Session Continuity

**Last session:** 2026-10-18T08:30:00Z
**Stopped At:** Milestone v1.18 complete and archived (override_closeout); console ec63c74 and parent 95ea22f6 pushed to thinx-staging
**Resume File:** None

## Operator Next Steps

- Finish the 48.1 UAT (`milestones/v1.18-phases/48.1-close-v1-18-audit-gaps-admin-deep-link-store-error-states-cy/48.1-UAT.md`): confirm the CircleCI pipeline for `95ea22f` is green (`node scripts/check-ci-gates.js pipeline --revision 95ea22f --expect legacy-on --wait`), run the served-console reload and offline checks, spot-check impersonation → Header → exit, decide on the build-log scroll defect
- Start the next console milestone with `/gsd-new-milestone --ws vue-console` (Phase 49+), or the root track with `/gsd-new-milestone`
