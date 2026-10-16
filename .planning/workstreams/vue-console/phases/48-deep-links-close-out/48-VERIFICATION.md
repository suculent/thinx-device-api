---
phase: 48-deep-links-close-out
verified: 2026-10-16T15:20:00Z
status: human_needed
score: 96/100 must-haves verified (5/5 roadmap success criteria; 91/95 plan truths, 3 backstop truths abstained as insufficient_spec, 1 operator UAT pending)
covered_files: [".circleci/config.yml",".planning/milestones/v1.16-phases/35-console-usability/35-REVIEW-DISPOSITION.md",".planning/runbooks/legacy-console-build-gate.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-01-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-01-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-02-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-02-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-03-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-03-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-04-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-04-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-05-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-05-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-06-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-06-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-07-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-07-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-08-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-08-SUMMARY.md","scripts/check-ci-gates.js","services/console/.circleci/config.yml","services/console/.gitignore","services/console/src/app/js/controllers/DeploykeyController.js","services/console/src/app/js/controllers/DevicesController.js","services/console/src/app/js/controllers/LogviewController.js","services/console/src/app/js/thinx-api.js","services/console/src/test/deploykey.cjs","services/console/src/test/legacy-close-out.cjs","services/console/vue/.gitignore","services/console/vue/cypress.json","services/console/vue/cypress/fixtures/thinx.json","services/console/vue/cypress/integration/deep-link.spec.js","services/console/vue/cypress/integration/device-detail.spec.js","services/console/vue/cypress/integration/devices.spec.js","services/console/vue/cypress/integration/history.spec.js","services/console/vue/cypress/integration/login.spec.js","services/console/vue/cypress/integration/oauth-return.spec.js","services/console/vue/cypress/reporters/junit.js","services/console/vue/cypress/support/api-stubs.js","services/console/vue/cypress/support/credentials.js","services/console/vue/cypress/support/session.js","services/console/vue/package.json","services/console/vue/src/App.vue","services/console/vue/src/components/Header/Header.scss","services/console/vue/src/components/Header/Header.vue","services/console/vue/src/core/api.js","services/console/vue/src/pages/Devices/DeviceDetail.vue","services/console/vue/src/pages/Devices/Devices.vue","services/console/vue/src/store/apikeys.js","services/console/vue/src/store/channels.js","services/console/vue/src/store/devices.js","services/console/vue/src/store/enviros.js","services/console/vue/src/store/profile.js","services/console/vue/src/store/repositories.js","services/console/vue/src/styles/_device-detail.scss","services/console/vue/src/styles/_overrides.scss","services/console/vue/src/styles/_platforms.scss","services/console/vue/src/styles/theme.scss","services/console/vue/src/utils/platforms.js","services/console/vue/tests/unit/close-out-v118.cjs","services/console/vue/tests/unit/cypress-junit-reporter.cjs","services/console/vue/tests/unit/device-list-parity.cjs","spec/node/CiPipelineGates.test.js"]
covered_digest: "v3:sha256:ff4aebd3f2235501f56354f4acc3fe8d514018f429a4678a5e9515c7c04ac74e"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Deep links on production (NOTIF-04): logged in on https://console.thinx.cloud, open /#/app/history and reload; reload /#/app/devices and a device page; log out and load /#/app/history"
    expected: "History stays (URL /#/app/history/audit) with no dashboard flash; devices and device page stay; logged out lands on /#/login"
    why_human: "CI proves it against stubbed session-token exchange only; the real httpOnly session cookie path on production needs a logged-in browser"
  - test: "Build Firmware (POL-01): click Build Firmware on a device page, double-click quickly, and repeat with keyboard (Tab, Enter)"
    expected: "Spinner and disabled button until the reply, then 'Build triggered.'; DevTools Network shows one POST /api/v2/build per click burst; keyboard focus returns to the button"
    why_human: "Real API timing and focus behaviour in a real browser"
  - test: "Account menu (POL-01): inspect the header toggle"
    expected: "User-circle icon with hover tip 'Account'; DevTools Accessibility names the toggle 'Account menu'; My Profile and Log Out work"
    why_human: "Accessible-name computation and visual check"
  - test: "Device Detail content column on a wide window"
    expected: "Column stops at about 1140px, left-aligned under the full-width title"
    why_human: "Visual layout"
  - test: "Device list (D-14): view toggles, keyboard focus on warning markers, Platform sort, row selection across re-sort"
    expected: "'List view'/'Grid view' tips; Tab reaches markers and tips show on focus with a visible ring; Platform order matches pills with unknown last; selection stays on the same devices"
    why_human: "Keyboard and tooltip behaviour in a real browser"
  - test: "Danger alert (48-03 backstop truth): trigger a failed action on Device Detail, ideally with a long API reason"
    expected: "White text on #C93C3C (computed rgb(255, 255, 255)); the long reason wraps inside the 1140px column; the white close button is visible and clickable"
    why_human: "Non-inferable backstop truth: only the compiled-CSS unit check C1 exists, no held-out or observed rendering evidence (insufficient_spec)"
  - test: "Legacy deploy keys (48-04 backstop truth) on https://rtm.thinx.cloud: create a key whose name contains a pasted tab, then one with a 121-character name pasted past maxlength, then a normal name"
    expected: "Tab: 'The name contains a control character, such as a tab or a line break.'; 121 chars: 'The name is longer than 120 characters.'; no request sent for either, never [object Object]; Create works again; the normal name creates the key"
    why_human: "Non-inferable backstop truth: only executor-written unit check D7 exists (insufficient_spec)"
  - test: "Legacy build toast and first socket (48-04 backstop truth): build a device on rtm.thinx.cloud; use a device with no build history; in a fresh tab open a build log overlay first, then trigger a build elsewhere"
    expected: "THiNX Builder toast reads 'Build started.' or 'Build queued.' then 'Click to show build log...', never 'undefined'; the no-history device shows its build toasts; the overlay-first tab receives notifications without a reload"
    why_human: "Non-inferable backstop truth: only executor-written unit checks G1/G2 exist (insufficient_spec); live socket behaviour needs a browser"
  - test: "Run the console-retest project skill against https://rtm.thinx.cloud/ and confirm Swarmpit shows Vue, Legacy and API tasks started after 2026-10-16T12:29:38Z"
    expected: "Skill passes; tasks are the pipeline 5677 rollouts"
    why_human: "D-10: the Legacy fixes get no other human UAT; Swarmpit needs the operator's session"
  - test: "Legacy Cypress env file (48-05, D-05; review IN-07): the operator inspects the formerly tracked services/console/src/cypress env file that is still in the public console repo history"
    expected: "A recorded result: 'no real credential' or 'rotated ...'"
    why_human: "Agents are forbidden to read the file; only the operator can judge it"
---

# Phase 48: Deep Links & Close-out Verification Report

**Phase Goal:** Vue deep links survive a reload, the remaining Phase 35 UI-review and review items are closed, and the legacy console build is back on so every Legacy change of the milestone is live before it closes.
**Verified:** 2026-10-16T15:20:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

Evidence base: the code at console `512ddb5` (equal to the parent gitlink at HEAD `896d67f9` and at the pushed `24d2b7cd`), tests I ran myself, the public CircleCI API for pipeline 5677, and unauthenticated production GETs made at 2026-10-16T15:16Z. SUMMARY claims were used only as pointers.

## Goal Achievement

### Observable Truths (roadmap success criteria, the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Reloading a Vue deep link such as `/#/app/history` while logged in stays on that page; a logged-out reload goes to login | VERIFIED | `vue/src/App.vue` `created()` awaits `waitForInitialRoute()` (`router.onReady(done, done)`, reads `$router.currentRoute.path`) before `hydrateSession`; only `/` and `/app` push to the dashboard; unauthenticated non-public paths push `/login`. `Routes.js`, `store/auth.js` and `utils/cookies.js` are untouched in `54734af..512ddb5`. Unit checks A1, A2, A3, A7 pass (my run). `deep-link.spec.js` asserts the logged-in load plus `cy.reload()` stay on `#/app/history/audit` with `@getStats.all` length 0, and the logged-out load ends on `#/login`. It ran green in CI job 16075. Live bundle `24d2b7c` contains `waitForInitialRoute`. Tokens stay in memory only (no storage writes in `vue/src`). |
| 2 | Build Firmware shows an in-flight state and ignores a second click until settled; account menu has an accessible name; Device Detail column is width-constrained | VERIFIED | `DeviceDetail.vue:17-22,380-401`: `:disabled="buildPending"`, `b-spinner data-cy=action-build-spinner`, sr-only `role=status` `Requesting build…`, early return while pending, reset in `finally`, focus restore on `$nextTick`. `Header.vue:46-49`: `la la-user-circle` `title=Account aria-hidden` plus sr-only `Account menu`. `_device-detail.scss` `max-width: 1140px`, imported in `theme.scss:29`. `device-detail.spec.js` (double-click gives `@buildFirmware.all` length 1) passed in CI. The live bundle has all 7 markers, 0 `fi flaticon-settings-10`, 0 `fa fa-cogs mr-1`. |
| 3 | Every Phase 35 review item IN-01..IN-08 is fixed or deferred with a recorded reason, including those closed in Phases 45-47 | VERIFIED | `35-REVIEW-DISPOSITION.md`: 16 rows, all `fixed`, `open: 0`, `total: 16`, each IN row cites console commits. All 11 cited SHAs are signed (`G`) and ancestors of `512ddb5`, and their subjects match the finding. Spot checks: IN-01 `parseResult` gives `undefined` for zero keys (unit I1-I6 pass); IN-02 `saveTransformers` `refreshed: false` still works after 48-08, because `transformers/fetchItems` throws on non-success. |
| 4 | Legacy build re-enabled; a normal `thinx-staging` pipeline builds and publishes the Legacy image; every v1.18 Legacy change not shipped by Phase 43 is live | VERIFIED | `.circleci/config.yml:16-18` `build_legacy_console` default `true`; the `legacy-console` workflow is kept as a kill switch. Pipeline 5677 (revision `24d2b7cd`, thinx-staging) ran `console-classic-registry` successfully (job 16078). The live `rtm.thinx.cloud` DeploykeyController, DevicesController, LogviewController and thinx-api.js (last-modified 12:31Z) have **zero** non-`<ENV::>` line differences from console HEAD. So all v1.18 Legacy changes are live: NOTIF-01 escaping, 35 WR-04 (`e53f2e9`), and the D-09 fixes `2105310`/`bff9552`. |
| 5 | Vue Cypress job green on thinx-staging (all specs pass or skip by design), CircleCI shows its JUnit results, `vue-console-registry` runs only after the suite passes | VERIFIED | Public API: job 16075 `test-vue-console` success; tests endpoint gives 77 results across 11 files (67 success, 10 skipped, 0 failure). The skips are `admin.spec.js` (no credentials) and `login.spec.js` (live and register/reset), as designed. Job 16076 `vue-console-registry` has `requires {16075: [success]}` and started at 12:35:56Z, after 16075 stopped at 12:35:08Z. Config: both `vue-console-registry` and `vue-console-hub` require `test-vue-console`. The job has no context. `CiPipelineGates.test.js` passes 27/27 (my run). (SC5 says "10 specs"; there are now 11 because `deep-link.spec.js` was added.) |

**Score:** 5/5 roadmap success criteria verified. Plan truths: 91/95 verified. The other four are three `verification: backstop` truths abstained as `insufficient_spec` (48-03 danger-alert rendering, 48-04 Legacy deploy-key refusal UI, 48-04 Legacy build toast UI) and the 48-06 operator UAT truth, which has not been run. 0 present-but-behavior-unverified.

### Plan truth roll-up

| Plan | Truths | Verified | Not verified | Notes |
|------|--------|----------|--------------|-------|
| 48-01 | 11 | 11 | 0 | Unit A1-A8 and I1-I6 pass; build/csp/perf not re-run by me (CI `yarn build:perf` passed in 16075) |
| 48-02 | 9 | 9 | 0 | Config read directly; spec 27/27 |
| 48-03 | 20 | 19 | 1 backstop | Danger alert 300-char rendering: only compiled-CSS check C1 |
| 48-04 | 13 | 11 | 2 backstop | Unit D1-D10 and G1-G8 pass (my run); UI rendering not observed |
| 48-05 | 10 | 10 | 0 | Fixture has no `username`/`password`; env file untracked and git-ignored; `liveLoginEnabled` gate present |
| 48-06 | 16 | 15 | 1 human | Ledger, pipeline, JUnit, live bundles, probes all re-observed. Backstop rollout truth verified by direct observation: both bundles served, API 401 x4, port 7442 200 |
| 48-07 | 9 | 9 | 0 | SUMMARY is `status: halted` (pipeline 5676). Its ship truths are met by pipeline 5677, which carries the 48-07 commits `4358845`, `16bb611`, `0692f0f`. Reporter uses only `fs`/`path`; `blockHosts` set; no timeout or retry changes |
| 48-08 | 7 | 7 | 0 | I9 passes; `deep-link.spec.js` keeps 4 tests and the `#/login` assertion; `package.json`/`cypress.json` untouched by 48-08 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vue/src/App.vue` | waitForInitialRoute on onReady | VERIFIED | Wired in `created()`; in live bundle |
| `vue/tests/unit/close-out-v118.cjs` | Phase 48 unit checks | VERIFIED | Chained in `test:unit`; passes |
| `vue/cypress/integration/deep-link.spec.js` | Cold-load deep-link spec | VERIFIED | Ran in CI 16075 |
| `vue/cypress/support/session.js` | `visitAppRoute` plain hard load | VERIFIED | `cy.visitApp('/#' + route, options)`; used by history and device-detail specs |
| `vue/src/core/api.js` | `parseResult` undefined for empty envelope | VERIFIED | `keys.length === 0 ? undefined`; see CR-01 for the 48-08 change in `request()` |
| `.circleci/config.yml` | test-vue-console gate, legacy default true | VERIFIED | |
| `spec/node/CiPipelineGates.test.js` | D-01/D-08 assertions | VERIFIED | 27/27 |
| `scripts/check-ci-gates.js` | test-vue-console required, legacy-on default | VERIFIED | Covered by spec |
| `.planning/runbooks/legacy-console-build-gate.md` | Kill-switch runbook | VERIFIED | Present (in fingerprint) |
| `vue/src/pages/Devices/DeviceDetail.vue` | buildPending, column wrapper | VERIFIED | |
| `vue/src/styles/_device-detail.scss` | max-width 1140px | VERIFIED | |
| `vue/src/components/Header/Header.vue` | Account menu name | VERIFIED | |
| `vue/src/utils/platforms.js` | `comparePlatformKeys` | VERIFIED | Unit checks pass; devices.spec green |
| `vue/src/pages/Devices/Devices.vue` | toggles, markers, sort, ids | VERIFIED | In live bundle (List view/Grid view) |
| `src/app/js/controllers/DeploykeyController.js` | Client check, sentences, reset | VERIFIED | Live = source |
| `src/test/deploykey.cjs`, `src/test/legacy-close-out.cjs` | Legacy unit cases | VERIFIED | Both rc 0 (my run) |
| `vue/package.json` | same-origin test/test:ci, JUnit reporter | VERIFIED | No dependency or lockfile change in the range |
| `vue/cypress/support/api-stubs.js`, `credentials.js` | stubLogin, no fixture fallback | VERIFIED | |
| `services/console/.circleci/config.yml` | test_vue runs test:ci, stores cypress/results | VERIFIED | Still carries `context: sonarcloud` (review WR-03) |
| `vue/cypress/reporters/junit.js`, `cypress-junit-reporter.cjs`, `cypress.json` | crash-proof reporter, blockHosts | VERIFIED | |
| `35-REVIEW-DISPOSITION.md` | `open: 0` | VERIFIED | |
| ROADMAP Phase 48 | `deferred (D-15)` | VERIFIED | |
| `STATE.md` | `[Resolved by 48-08]` | VERIFIED | line 173 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| App.vue created() | router.onReady, then hydrateSession | `await this.waitForInitialRoute()` | WIRED | |
| session.js visitAppRoute | `cy.visitApp('/#' + route)` | plain hard load | WIRED | |
| vue test:unit | close-out-v118.cjs, cypress-junit-reporter.cjs | `&&` chain | WIRED | |
| parseResult | BuildLogDialog empty state | undefined response | WIRED | |
| vue-console-registry / -hub | test-vue-console | `requires` | WIRED | Proven at runtime by job 16076 `requires` |
| test-vue-console | `cypress/results` | `store_test_results` | WIRED | 77 results visible |
| DeviceDetail buildDevice | devices/buildFirmware, then POST /build | try/finally on buildPending | WIRED | |
| theme.scss | _device-detail.scss | `@import 'device-detail'` | WIRED | |
| Devices.vue | comparePlatformKeys | import | WIRED | |
| DeploykeyController | /api/user/rsakey/create | `.done`/`.fail`/`.always` | WIRED | |
| LogviewController wss.onopen | wssinit() then wsstailLog | | WIRED | |
| parent HEAD gitlink | console thinx-staging | `512ddb5` | WIRED | Gitlink at HEAD equals the console checkout HEAD |
| pipeline 5677 | console.thinx.cloud / rtm.thinx.cloud | Swarmpit autoredeploy | WIRED | Served Vue last-modified 12:40:26Z with id `24d2b7c`; Legacy 12:31:18Z |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| App.vue | currentPath | `router.onReady` then `currentRoute.path` | Yes | FLOWING |
| DeviceDetail.vue | error/message after build | `buildFirmware` reply via `buildFailure()` | Yes | FLOWING |
| Devices.vue | items / LOAD_ERROR | `devices/fetchItems` (`GET /device`) | Yes for data; LOAD_ERROR unreachable on a transport failure since 48-08 | FLOWING, with the CR-01 caveat |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CI gate wiring offline | `node --test spec/node/CiPipelineGates.test.js` | 27 pass, 0 fail | PASS |
| Legacy deploy-key cases | `LC_ALL=C node services/console/src/test/deploykey.cjs` | rc 0, D1-D10 | PASS |
| Legacy close-out cases | `LC_ALL=C node services/console/src/test/legacy-close-out.cjs` | rc 0, G1-G8 | PASS |
| Vue unit chain (once) | `LC_ALL=C npm run test:unit` in vue | rc 0, 431 ok, 0 FAIL | PASS |
| CI JUnit results | GET circleci v2 `.../16075/tests` | 77 items, 11 files, 0 failure | PASS |
| Gate ordering | GET circleci v2 workflow jobs, pipeline 5677 | 16076 requires 16075 success | PASS |
| Live Vue bundle | GET console.thinx.cloud/js/app.js | id `24d2b7c` x2, 7 markers, no cog/old glyph | PASS |
| Live Legacy files | GET rtm.thinx.cloud/app/js/... (4 files) | identical to source except ENV | PASS |
| API surface and port 7442 | unauthenticated GETs | 401 x4; 7442 200 (baseline 200) | PASS |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` is declared or implied by the phase. Not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NOTIF-04 | 48-01, 48-06, 48-08 | Reloading a Vue deep link stays on that page | SATISFIED (production UAT pending) | SC1 |
| POL-01 | 48-03, 48-05, 48-06 | Build Firmware in-flight, account menu name, width-constrained column | SATISFIED (visual UAT pending) | SC2 |
| FIX-01 | 48-01, 48-03, 48-04, 48-05, 48-06 | Phase 35 IN-01..IN-08 fixed or deferred | SATISFIED | SC3 |
| CI-06 | 48-02, 48-04, 48-06 | Legacy build re-enabled; pending Legacy changes deployed | SATISFIED | SC4 |
| CI-07 | 48-01, 48-02, 48-05, 48-06, 48-07, 48-08 | Vue Cypress green in CI, JUnit stored, gates vue-console-registry, no leaked-fixture login | SATISFIED | SC5 and 48-05 checks |

No orphaned requirements: REQUIREMENTS.md maps exactly these five IDs to Phase 48, and every one is claimed by a plan.

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts: 19/19 (`check.decision-coverage-verify`, non-blocking).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all phase files) | - | TBD/FIXME/XXX | none found | Debt-marker gate clean |
| `vue/cypress/integration/login.spec.js` | re-indented skipped tests | `// TODO check ...` (5) | Info | Pre-existing lines moved by the rewrite, inside skip-by-design tests |
| `vue/src/core/api.js` | 102-115 | catch resolves a transport failure as `{ success: false, status: 0 }` with no marker | Warning | Review CR-01, see below |
| `vue/src/core/api.js` | 116 | `await response.text()` outside the guard | Warning | Review WR-01 |
| `src/app/js/controllers/DevicesController.js` | 137 | `toastr.error( response.status, ...)` (live) | Warning | Review WR-04; already recorded in ROADMAP "Found in Phase 48 (deferred)" |
| `.circleci/config.yml` | legacy-console workflow | Legacy image is not gated on the Legacy unit tests | Warning | Review WR-02 |
| `services/console/.circleci/config.yml` | 185 | `context: sonarcloud` on `test_vue` | Warning | Review WR-03; not covered by the 48-02 prohibition (that one is about the parent job) |

### CR-01 judgment: follow-up, not a goal gap for Phase 48

The finding is real. Since 48-08 (`09fbde1`), `Api.request()` resolves a transport-level failure (offline, DNS, connection refused, CORS failure, edge unreachable) as `{ success: false, status: 0, response: null }`. `devices/fetchItems` and `enviros/fetchItems` swallow non-success, so `Devices.vue` `LOAD_ERROR` is unreachable for those failures. `PasswordReset.vue`'s "Network error. Please try again." branch is dead, and a transport failure now reads "Could not initiate reset." / "Could not set password." `AdminUsers.vue` has the same loss.

Why it is not a Phase 48 gap:
- No roadmap success criterion or REQUIREMENTS entry for NOTIF-04, POL-01, FIX-01, CI-06 or CI-07 covers network-error surfacing. All five criteria hold with CR-01 present.
- No plan must-have is falsified. The 48-03 E8 truth requires the error copy to be unchanged, and the string is unchanged. The 48-01 E4 truth ("a failed hydration (API down) is treated as logged out") still holds: hydrate gets `success: false` and redirects. The 48-08 prohibition on "user-visible copy" holds literally, because no string changed. CR-01 changes which branch runs, not the copy.
- The severity is overstated for production. Before Phase 48, HTTP-level failures already resolved as `{ success: false }`, through the `!response.ok` and JSON-parse branches. That includes Traefik's 502/503 during every API rollout, the common outage on this stack. So Devices already showed an empty fleet for those. CR-01 widens that to pure transport failures. It is a real regression, but a narrow one.

Recommendation (WARNING, operator decision): before the milestone closes, either fix it or set CR-01 to `deferred` with a reason in `48-REVIEW-DISPOSITION.md`. Any open review row will show up in `/gsd-audit-milestone`. The fix is small and keeps 48-08's no-unhandled-rejection property: add `networkError: true` to the catch result, move `response.text()` inside the guard (this also closes WR-01), throw on `networkError` in `devices/fetchItems` and `enviros/fetchItems`, and check it in PasswordReset/AdminUsers. Add a unit check, and rerun `deep-link.spec.js` in the CI mirror, because the 48-08 race depends on `request()` not rejecting.

### Human Verification Required

This is a user-facing phase, and the planned operator UAT (48-06 D7) has not been run. The three abstained backstop truths overlap with UAT items 7 and 8 and are folded into them.

1. **Deep links on production (NOTIF-04).** Test: on https://console.thinx.cloud, logged in, open /#/app/history and reload; reload /#/app/devices and a device page; log out, then load /#/app/history. Expected: you stay on History (/#/app/history/audit) with no dashboard flash, the other pages stay, and the logged-out load lands on /#/login. Why human: CI exercises a stubbed session-token exchange, not the real httpOnly cookie.
2. **Build Firmware (POL-01).** Expected: spinner and disabled button, then "Build triggered."; a double click sends one POST /api/v2/build; keyboard focus returns to the button.
3. **Account menu (POL-01).** Expected: user-circle icon with tip "Account"; the accessibility tree names the toggle "Account menu"; both items work.
4. **Device Detail column.** Expected: about 1140px, left-aligned.
5. **Device list (D-14).** Expected: toggle tips, focus tips on markers with a visible ring, sort matches the pills, selection survives a re-sort.
6. **Danger alert (48-03 backstop).** Expected: white text, a long reason wraps in the column, and the close button is visible and clickable.
7. **Legacy deploy keys (48-04 backstop).** Expected: the tab and 121-character names are refused with the fixed sentences and no request; Create works again afterwards.
8. **Legacy build toast and first socket (48-04 backstop).** Expected: "Build started." / "Build queued." with no `undefined`; a no-history device shows its toasts; an overlay-first tab receives frames.
9. **console-retest skill on rtm.thinx.cloud, plus Swarmpit task start times after 2026-10-16T12:29:38Z.**
10. **Legacy Cypress env file (D-05, review IN-07).** The operator records "no real credential" or "rotated ...".

### Gaps Summary

There are no blocking gaps. All five roadmap success criteria are met in code, in CI (pipeline 5677) and on production as observed today. Every requirement ID is accounted for, and none is orphaned. Phase 48 is the last phase in the milestone, so nothing can be deferred to a later phase.

The phase is `human_needed` because the ten-item operator UAT is still outstanding, and three non-inferable backstop truths need observed browser evidence.

Separately, all 12 findings in `48-REVIEW-DISPOSITION.md` are still `open`. CR-01 is a narrow production regression in error surfacing introduced by 48-08. It is a follow-up and does not block this phase's goal, but it should be fixed or explicitly deferred before the milestone closes. WR-02 (the Legacy image is not gated on the Legacy tests) and WR-03 (the `sonarcloud` context on a job that runs unpinned installs) are CI hardening follow-ups of the same kind. WR-04 is the already recorded "Found in Phase 48 (deferred)" item.

---

_Verified: 2026-10-16T15:20:00Z_
_Verifier: Claude (gsd-verifier)_
