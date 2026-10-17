---
phase: 48-deep-links-close-out
verified: 2026-10-17T12:30:00Z
status: passed
score: 100/100 must-haves verified (5/5 roadmap success criteria; 95/95 plan truths, including the 3 backstop truths and the operator UAT truth, now backed by 48-UAT.md)
covered_files: [".circleci/config.yml",".planning/milestones/v1.16-phases/35-console-usability/35-REVIEW-DISPOSITION.md",".planning/runbooks/legacy-console-build-gate.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-01-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-01-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-02-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-02-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-03-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-03-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-04-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-04-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-05-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-05-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-06-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-06-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-07-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-07-SUMMARY.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-08-PLAN.md",".planning/workstreams/vue-console/phases/48-deep-links-close-out/48-08-SUMMARY.md","scripts/check-ci-gates.js","services/console/.circleci/config.yml","services/console/.gitignore","services/console/src/app/js/controllers/DeploykeyController.js","services/console/src/app/js/controllers/DevicesController.js","services/console/src/app/js/controllers/LogviewController.js","services/console/src/app/js/thinx-api.js","services/console/src/test/deploykey.cjs","services/console/src/test/legacy-close-out.cjs","services/console/vue/.gitignore","services/console/vue/cypress.json","services/console/vue/cypress/fixtures/thinx.json","services/console/vue/cypress/integration/deep-link.spec.js","services/console/vue/cypress/integration/device-detail.spec.js","services/console/vue/cypress/integration/devices.spec.js","services/console/vue/cypress/integration/history.spec.js","services/console/vue/cypress/integration/login.spec.js","services/console/vue/cypress/integration/oauth-return.spec.js","services/console/vue/cypress/reporters/junit.js","services/console/vue/cypress/support/api-stubs.js","services/console/vue/cypress/support/credentials.js","services/console/vue/cypress/support/session.js","services/console/vue/package.json","services/console/vue/src/App.vue","services/console/vue/src/components/Header/Header.scss","services/console/vue/src/components/Header/Header.vue","services/console/vue/src/core/api.js","services/console/vue/src/pages/Devices/DeviceDetail.vue","services/console/vue/src/pages/Devices/Devices.vue","services/console/vue/src/pages/PasswordReset/PasswordReset.vue","services/console/vue/src/store/admin.js","services/console/vue/src/store/apikeys.js","services/console/vue/src/store/channels.js","services/console/vue/src/store/devices.js","services/console/vue/src/store/enviros.js","services/console/vue/src/store/profile.js","services/console/vue/src/store/repositories.js","services/console/vue/src/styles/_device-detail.scss","services/console/vue/src/styles/_overrides.scss","services/console/vue/src/styles/_platforms.scss","services/console/vue/src/styles/theme.scss","services/console/vue/src/utils/platforms.js","services/console/vue/tests/unit/close-out-v118.cjs","services/console/vue/tests/unit/cypress-junit-reporter.cjs","services/console/vue/tests/unit/device-list-parity.cjs","spec/node/CiPipelineGates.test.js"]
covered_digest: "v3:sha256:2cd167175c520d515f74dbda22b87d35c48d92e913f1752464660755fa3f5fa8"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: "96/100 (5/5 roadmap success criteria; 91/95 plan truths)"
  gaps_closed:
    - "3 backstop truths (danger-alert rendering, Legacy deploy-key refusal UI, Legacy build toast and first socket) and the 48-06 operator UAT truth: 48-UAT.md items 6, 7, 8 and 1-10, all pass"
    - "All 10 human_verification items of the previous report: 48-UAT.md status complete, 10/10 passed, 0 issues (2026-10-17)"
    - "Review CR-01 (api client network failures hid load errors), WR-01, WR-02 (Legacy image not gated on Legacy tests), WR-03 (sonarcloud context on test_vue), WR-04 (Legacy failed-build toast): all fixed in 48-REVIEW-FIX.md, shipped in pipeline 5678, recorded as fixed in 48-REVIEW-DISPOSITION.md"
  gaps_remaining: []
  regressions: []
---

# Phase 48: Deep Links & Close-out Verification Report

**Phase Goal:** Vue deep links survive a reload, the remaining Phase 35 UI-review and review items are closed, and the legacy console build is back on so every Legacy change of the milestone is live before it closes.
**Verified:** 2026-10-17T12:30:00Z
**Status:** passed
**Re-verification:** Yes. The previous report (2026-10-16T15:20:00Z, `human_needed`) went stale because covered files changed after it was written.

## What changed since the previous report

1. **Code-review fixes (48-REVIEW-FIX.md, all 5 in-scope findings fixed).** Console commits `bd1e0a1` (CR-01), `64f773e` (WR-01), `bb0e5ef` (WR-03), `355e868` (WR-04); parent `ca7975df` (WR-02) and `9523aa8c` (gitlink bump `512ddb5..355e868`). The previous report's CR-01 judgment ("follow-up, not a goal gap", recommending fix or defer before the milestone closes) is now resolved by a fix, not a deferral.
2. **Legacy-console CI gate (WR-02).** New `test-console-classic` job in the `legacy-console` workflow; `console-classic-registry` and `console-classic-hub` require it. `check-ci-gates.js` and `CiPipelineGates.test.js` (now 30 tests, was 27) cover it. The runbook was updated to "exactly four jobs".
3. **Pushed and shipped.** Parent `origin/thinx-staging` is `75bb6957` and console is `355e868` (confirmed by `git ls-remote`). The push started CircleCI pipeline 5678, which the previous report could not cover.
4. **48-REVIEW-DISPOSITION.md is closed for the blocking tier.** CR-01, WR-01..WR-04 are `fixed`; IN-01..IN-07 stay `open` (7 of 12, all info).
5. **Operator UAT complete.** 48-UAT.md: `status: complete`, 10 passed, 0 issues. It covers every human_verification item of the previous report.

Evidence base this time: code at console `355e868` (equal to the parent gitlink at HEAD `47968cb2`; HEAD is 1 docs-only commit ahead of the pushed `75bb6957`), tests I ran myself, the public CircleCI API for pipeline 5678, and unauthenticated production GETs at 2026-10-17. SUMMARY claims were used only as pointers. No env-dumping command was run, no `.env` file read, no ssh to production.

## Goal Achievement

### Observable Truths (roadmap success criteria, the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Reloading a Vue deep link such as `/#/app/history` while logged in stays on that page; a logged-out reload goes to login | VERIFIED | `App.vue` `created()` awaits `waitForInitialRoute()` before hydrating (lines 37, 50). Pipeline 5678 job 16080 JUnit: `deep-link.spec.js` has 4 tests, all `success` (logged-in hard load plus reload of `/#/app/history`, device detail route, `/#/` to dashboard, logged-out `/#/app/history` to login). This run is on the code that includes the CR-01/WR-01 change to `request()`, so the 48-08 race (which needs `request()` not to reject) is re-proven after the fix. Production: 48-UAT.md item 1 pass (real httpOnly cookie path, `console.thinx.cloud`). |
| 2 | Build Firmware shows an in-flight state and ignores a second click; account menu has an accessible name; Device Detail column is width-constrained | VERIFIED | Code unchanged since the previous report (spinner, `buildPending` guard, `Account menu` sr-only name, 1140px column). `device-detail.spec.js` is in the green 5678 run. Operator-observed: 48-UAT.md items 2, 3, 4 pass (one POST per click burst, keyboard focus return, accessibility name, wide-window column). Item 6 (danger alert contrast, wrap, close button) pass. |
| 3 | Every Phase 35 review item IN-01..IN-08 is fixed or deferred with a recorded reason, including those closed in Phases 45-47 | VERIFIED | `35-REVIEW-DISPOSITION.md` unchanged (16 rows, `open: 0`, all cited SHAs verified signed and ancestors in the previous report; the console history since only added the four review-fix commits on top). 48-UAT.md item 10: the operator inspected the formerly tracked Cypress env file (`.env.test`), no real credential, no rotation needed (closes review IN-07 / D-05). |
| 4 | Legacy build re-enabled; a normal `thinx-staging` pipeline builds and publishes the Legacy image; every v1.18 Legacy change not shipped by Phase 43 is live | VERIFIED | Pipeline 5678 (revision `75bb6957`, thinx-staging): workflow `legacy-console` success; job 16083 `test-console-classic` success, then 16084 `console-classic-registry` success (started after the test job stopped, dependency edge recorded). `build_legacy_console` default is `true` (`.circleci/config.yml:16-18`) with the kill switch kept. Live `rtm.thinx.cloud/app/js/controllers/DevicesController.js` (last-modified 2026-10-17 09:20:14 GMT) contains `Build failed.` once and zero `toastr.error( response.status`, so the WR-04 Legacy fix is live along with the earlier D-09 deploy-key and build-toast fixes. Operator-observed: 48-UAT.md items 7, 8 (deploy-key refusals, build toasts, first socket) and 9 (console-retest, Swarmpit tasks) pass. |
| 5 | Vue Cypress job green on thinx-staging (all specs pass or skip by design), CircleCI shows its JUnit results, `vue-console-registry` runs only after the suite passes | VERIFIED | Pipeline 5678 workflow `main` success. Job 16080 `test-vue-console` success; tests endpoint: 77 results across 11 files, 67 success, 10 skipped, 0 failure (same skips as before: `admin.spec.js` and live `login.spec.js` by design). Job 16081 `vue-console-registry` depends on 16080 (recorded edge), started 09:24:05Z after 16080 stopped 09:23:20Z. Live bundle `console.thinx.cloud/js/app.js` (last-modified 09:28:02 GMT) carries build id `75bb695` and the CR-01 `networkError` markers (8 occurrences) and `Network error. Please try again.`. |

**Score:** 5/5 roadmap success criteria verified. Plan truths: 95/95 verified. In the previous report 4 were open (3 backstop truths abstained as `insufficient_spec`, 1 operator UAT truth). The three backstop truths now carry the explicit observed-behavior evidence the abstain rule requires (48-UAT.md items 6, 7, 8: the operator observed the rendering in a real browser), and the UAT truth is met by 10/10 passes. 0 present-but-behavior-unverified.

### Plan truth roll-up

| Plan | Truths | Verified | Not verified | Notes |
|------|--------|----------|--------------|-------|
| 48-01 | 11 | 11 | 0 | Unit A1-A8, I1-I6 still pass |
| 48-02 | 9 | 9 | 0 | Gate spec 30/30 |
| 48-03 | 20 | 20 | 0 | Danger-alert backstop truth: UAT item 6 pass |
| 48-04 | 13 | 13 | 0 | Both backstop truths: UAT items 7, 8 pass; Legacy unit D1-D10, G1-G9 pass (my run) |
| 48-05 | 10 | 10 | 0 | Env file inspected by operator (UAT 10) |
| 48-06 | 16 | 16 | 0 | Operator UAT truth now met (10/10) |
| 48-07 | 9 | 9 | 0 | Halted-plan ship truths met by pipelines 5677 and 5678 |
| 48-08 | 7 | 7 | 0 | I9 updated by CR-01 (still asserts no rejection, now also the marker); `deep-link.spec.js` green on 5678 |

### Review-fix verification (read from the code, not from 48-REVIEW-FIX.md)

| Finding | Code evidence | Test evidence |
|---------|---------------|---------------|
| CR-01 | `api.js` catch returns `{ success: false, status: ..., response: null, networkError: true }`; `devices/fetchItems`, `enviros/fetchItems`, `admin/fetchUsers` throw on `networkError` only (a refused or empty reply still resolves); `PasswordReset.vue` checks `result.networkError` before the generic branch in both flows; `Visits.vue` reads through `Promise.allSettled` | I9-I13 pass in my `test:unit` run |
| WR-01 | `response.text()` is inside the same `try` as the fetch (`api.js`, "The body is read inside the same guard") | I9 covers a `text()` that rejects |
| WR-02 | `.circleci/config.yml:302` `test-console-classic`, no context, runs `deploykey.cjs` and `legacy-close-out.cjs`; both `console-classic-*` jobs `requires` it; filters thinx-staging + main | `CiPipelineGates.test.js` 30/30; `check-ci-gates.js compile` printed `CI-GATES COMPILE OK`, and its main-branch job list includes `test-console-classic`; ran green as job 16083 |
| WR-03 | `services/console/.circleci/config.yml`: `test_vue` has no context and carries the explanatory comment. The remaining `sonarcloud` context is on the separate `vue` publish job, which is unchanged and out of this finding's scope | n/a (config) |
| WR-04 | `DevicesController.js` failure branch is a fixed `Build failed.` toast; live file confirms it | `legacy-close-out.cjs` G8/G9 pass |

Documentation follow-ups named in 48-REVIEW-FIX.md are also done: the runbook now says "exactly four jobs" and lists `test-console-classic`, and ROADMAP line 268 records the WR-04 item as fixed in console `355e868`.

### Required Artifacts

All artifacts from the previous report remain VERIFIED; the files changed by the fixes were re-read.

| Artifact | Status | Details |
|----------|--------|---------|
| `vue/src/App.vue` | VERIFIED | `waitForInitialRoute` wired in `created()`; in live bundle |
| `vue/src/core/api.js` | VERIFIED | `networkError` marker, body read inside guard |
| `vue/src/store/{devices,enviros,admin}.js`, `PasswordReset.vue` | VERIFIED | New in the covered set; wired as above |
| `vue/tests/unit/close-out-v118.cjs` | VERIFIED | I1-I13 pass |
| `vue/cypress/integration/deep-link.spec.js` | VERIFIED | 4 tests green in 5678 |
| `.circleci/config.yml`, `scripts/check-ci-gates.js`, `spec/node/CiPipelineGates.test.js` | VERIFIED | WR-02 job, gate evaluation, 30/30 |
| `.planning/runbooks/legacy-console-build-gate.md` | VERIFIED | Updated to four jobs |
| `src/app/js/controllers/DevicesController.js`, `DeploykeyController.js`, `LogviewController.js`, `thinx-api.js` | VERIFIED | Live copies match source on the checked markers |
| `src/test/deploykey.cjs`, `src/test/legacy-close-out.cjs` | VERIFIED | Both pass (my run) |
| `35-REVIEW-DISPOSITION.md`, ROADMAP deferred note, STATE | VERIFIED | Unchanged / updated as above |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| App.vue created() | router.onReady, then hydrateSession | `await this.waitForInitialRoute()` | WIRED |
| api.js request() | fetchItems stores | `networkError` -> throw | WIRED |
| devices/enviros/admin stores | Devices.vue LOAD_ERROR, AdminUsers.vue, PasswordReset.vue | throw / `result.networkError` branch | WIRED (I12, I13) |
| console-classic-registry / -hub | test-console-classic | `requires` | WIRED (runtime edge in 16084) |
| vue-console-registry / -hub | test-vue-console | `requires` | WIRED (runtime edge in 16081) |
| test-vue-console | `cypress/results` | `store_test_results` | WIRED (77 results) |
| parent HEAD gitlink | console thinx-staging | `355e868` | WIRED (equals console `ls-remote`) |
| pipeline 5678 | console.thinx.cloud / rtm.thinx.cloud | Swarmpit autoredeploy | WIRED (Vue 09:28:02Z id `75bb695`, Legacy 09:20:14Z; operator confirmed tasks in UAT 9) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| App.vue | currentPath | `router.onReady` then `currentRoute.path` | Yes | FLOWING |
| Devices.vue | items / LOAD_ERROR | `devices/fetchItems` (`GET /device`); throws on a transport failure again | Yes; the previous CR-01 caveat is closed | FLOWING |
| DeviceDetail.vue | error/message after build | `buildFirmware` reply | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CI gate wiring | `node --test spec/node/CiPipelineGates.test.js` | 30 pass, 0 fail | PASS |
| CircleCI compile, both parameter values | `node scripts/check-ci-gates.js compile` | `CI-GATES COMPILE OK` | PASS |
| Legacy deploy-key cases | `LC_ALL=C node services/console/src/test/deploykey.cjs` | all checks passed | PASS |
| Legacy close-out cases | `LC_ALL=C node services/console/src/test/legacy-close-out.cjs` | all checks passed (G1-G9) | PASS |
| Vue unit chain (run once) | `LC_ALL=C npm run -s test:unit` in `services/console/vue` | rc 0, 435 `ok` lines, no failing line (the one `FAIL` grep hit is the word FAILED inside check N4's title) | PASS |
| Root node suite | operator-run `npm run test:node` | 113/113 (not re-run by me) | PASS (operator evidence) |
| CI JUnit results | GET circleci v2 `.../16080/tests` | 77 results, 11 files, 0 failure; deep-link.spec.js 4/4 | PASS |
| Pipeline 5678 | GET circleci v2 workflows/jobs | both workflows success; all 6 jobs success; gate ordering as above | PASS |
| Live bundles | GET console.thinx.cloud/js/app.js, rtm.thinx.cloud DevicesController.js | `75bb695` x2, `networkError` x8; `Build failed.` x1, old toast x0 | PASS |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` is declared or implied by the phase. Not applicable.

### Requirements Coverage

Every ID in the phase requirement list was cross-referenced against `REQUIREMENTS.md` (descriptions and traceability rows, all `[x]` and `Complete`, all mapped to Phase 48) and against the PLAN frontmatter claims.

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NOTIF-04 | 48-01, 48-06, 48-08 | Reloading a Vue deep link stays on that page | SATISFIED | SC1; Cypress 4/4 on 5678; UAT 1 |
| POL-01 | 48-03, 48-05, 48-06 | Build Firmware in-flight, account menu name, width-constrained column | SATISFIED | SC2; UAT 2, 3, 4, 6 |
| FIX-01 | 48-01, 48-03, 48-04, 48-05, 48-06 | Phase 35 IN-01..IN-08 fixed or deferred | SATISFIED | SC3; ledger `open: 0`; UAT 10 |
| CI-06 | 48-02, 48-04, 48-06 | Legacy build re-enabled; pending Legacy changes deployed | SATISFIED | SC4; 5678 `legacy-console`; UAT 7, 8, 9 |
| CI-07 | 48-01, 48-02, 48-05, 48-06, 48-07, 48-08 | Vue Cypress green, JUnit stored, gates vue-console-registry, no leaked-fixture login | SATISFIED | SC5; 5678 jobs 16080/16081 |

No orphaned requirements: `REQUIREMENTS.md` maps exactly NOTIF-04, POL-01, FIX-01, CI-06, CI-07 to Phase 48, and every one is claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| all files touched by the review fixes | - | TBD/FIXME/XXX | none found | Debt-marker gate clean |
| `services/console/.circleci/config.yml` | 200 | pre-existing `# TODO` inside a commented-out legacy job | Info | Not introduced by this phase |
| `vue/cypress/integration/login.spec.js` | - | `// TODO check ...` (5) inside skip-by-design tests | Info | Pre-existing lines |
| Legacy console (operator, UAT 9 note) | - | `+++ updateApikeys` / `+++ updateSources` debug console lines | Info | Cosmetic; not a roadmap criterion, requirement or plan must-have |
| `services/console/.circleci/config.yml` | 218 | `sonarcloud` context on the `vue` publish job | Info | Not the `test_vue` job WR-03 is about; publish job, unchanged |

The previous Warning rows (CR-01 `status: 0` without a marker, WR-01, WR-02, WR-03, and the WR-04 toast) are all closed above.

### Remaining non-blocking review items

`48-REVIEW-DISPOSITION.md` still has 7 info findings `open` (IN-01..IN-07: deep-link spec coupled to the count of dashboard reads, dev-server proxy sends unstubbed calls to production, gated suite and shipped image resolve dependencies independently, video artifacts stored although disabled, two token exchanges on a logged-out cold load, `outline: none` without `:focus-visible`, env-file and JUnit-name leftovers). They are info-level, are not covered by any roadmap criterion, requirement or plan must-have, and do not change this verdict. `/gsd-audit-milestone` will list them; the operator should mark each `fixed` or `deferred` with a reason in the disposition file before the milestone closes if the audit should come out clean.

### Human Verification Required

None outstanding. All ten previous items are recorded as passed in `48-UAT.md` (2026-10-17, complete, 10/10, 0 issues), including the three backstop truths and the console-retest on `rtm.thinx.cloud`.

### Gaps Summary

There are no gaps. All five roadmap success criteria are met in code, in CI (pipeline 5678, all jobs green, including the new Legacy test gate and the Cypress deep-link spec on the post-review-fix code), on production as observed today, and by operator UAT. All five requirement IDs are accounted for and none is orphaned. The CR-01 regression identified in the previous report is fixed with unit coverage (I9-I13) and live in the served bundle. Phase 48 is the last phase of the milestone, so nothing needs deferring to a later phase.

---

_Verified: 2026-10-17T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
