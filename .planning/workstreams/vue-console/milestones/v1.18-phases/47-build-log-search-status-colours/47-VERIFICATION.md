---
phase: 47-build-log-search-status-colours
verified: 2026-10-15T11:21:57Z
status: passed
score: 59/64 must-haves verified
covered_files:
  - ".planning/milestones/v1.16-phases/36-build-log-access/36-REVIEW-DISPOSITION.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-01-PLAN.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-01-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-02-PLAN.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-02-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-03-PLAN.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-03-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-04-PLAN.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-04-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-05-PLAN.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-05-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-REVIEW-DISPOSITION.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-REVIEW.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-UI-SPEC.md"
  - "services/console/vue/cypress/integration/device-detail.spec.js"
  - "services/console/vue/package.json"
  - "services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue"
  - "services/console/vue/src/components/Notifications/Notifications.scss"
  - "services/console/vue/src/components/Notifications/Notifications.vue"
  - "services/console/vue/src/pages/Devices/DeviceDetail.vue"
  - "services/console/vue/src/pages/History/History.vue"
  - "services/console/vue/src/pages/Visits/Visits.vue"
  - "services/console/vue/src/styles/_build-log.scss"
  - "services/console/vue/src/styles/_variables.scss"
  - "services/console/vue/src/styles/theme.scss"
  - "services/console/vue/src/utils/buildLog.js"
  - "services/console/vue/tests/unit/build-log-search.cjs"
  - "services/console/vue/tests/unit/milestone-v116.cjs"
  - "services/console/vue/tests/unit/transformers-enviros.cjs"
covered_digest: "v3:sha256:83d5ff0cde6e2c0fe63c41d5275107385b9e3945505b826a6875ce464933dda6"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 38/43
  gaps_closed:
    - "UI E6 View (Open build log) controls (covered): long-text — the visible label is the fixed word `View` and the long build id is only in the aria-label, which starts with the visible text (WCAG 2.5.3)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Backstop (insufficient_spec, 47-01/47-03): open a build log of about 5 MB and type a term with more than 1000 hits"
    expected: "At most 1000 mark elements; the count reads 1 / 1000+; Next match on 1000 wraps to 1; each step scrolls only the log box, so the current match is visible and neither the modal nor the page scrolls"
    why_human: "Real-browser rendering, DOM size and scroll geometry on a multi-MB log. The plain-node vnode tests use fake geometry (T6) and small inputs (S4)"
  - test: "Backstop (insufficient_spec): a 20,000-character log line with no spaces, with a match in the middle, and a line holding <img src=x onerror=alert(1)>"
    expected: "The long line wraps inside the log box with no horizontal scrollbar. The match is highlighted with no column shift. The <img> line shows as visible text, and the DOM has no image element"
    why_human: "Line wrapping and layout shift only show in a real layout engine. D4 proves text-only vnodes; the browser DOM still needs a look"
  - test: "Backstop (insufficient_spec): the search bar at 375px and at 1280px viewport width"
    expected: "At 375px the bar wraps to two rows 8px apart, the field is full width, the count and both chevrons stay on one row, and the bar stays at the top while the log box scrolls. At 1280px all four blocks sit on one row"
    why_human: "Responsive layout; C2 only checks the compiled CSS rules"
  - test: "47-05 gap UAT: log in to https://console.thinx.cloud after a hard reload. On the dashboard Recent Builds card, History (Build Log tab) and a device's Build History, inspect each View button in Chrome DevTools > Elements > Accessibility; in History, hover and click a row with a build id and (if listed) a row without one"
    expected: "Each View button shows the word View with the eye glyph, and its computed accessible name is `View build log <build id>` (optional: macOS Voice Control 'Click View' activates it). A History row with a build id has the pointer cursor and a click on a plain cell opens its log (not a click on Expand or a text selection). A row without one shows `—` in the Log column, the default cursor, and a click does nothing. Dashboard View + Download, navbar rows and Device Build History behave as before"
    why_human: "The computed accessible name, the cursor and click behaviour need a real browser and a logged-in operator; the unit tests prove only the vnode attributes"
  - test: "End-of-phase operator UAT (47-03 <human-check>, 11 items, carried in 47-05-SUMMARY 'Carried from 47-03-SUMMARY'): run items 1-11 in the same session"
    expected: "Rollout times after the push (11:00:18Z; bundle fc0fa01 live 11:06:51Z); dashboard View before Download opens the log; search, wrap, centred scroll, Esc and reset on reopen; inert HTML when searching for `<`; error state with Try again; TIMEOUT amber / FAILED red / OK green / RUNNING blue on all four lists; Device Build History cells inert; navbar static rows; layout backstops; Phase 36/35 records; Legacy console-retest on https://rtm.thinx.cloud/"
    why_human: "Needs a logged-in operator, real build logs and visual judgement. The verifier must not log in"
  - test: "Flagged judgment-tier prohibitions (20 in total: 11 from 47-01..47-03, 3 from 47-04, 6 from 47-05; all `verification: judgment`, `flagged: true`): review the non-authoritative LLM-judge verdicts in the Prohibitions table"
    expected: "Operator confirms or rejects each verdict. Process prohibitions (no ssh/docker/swarm edits, no production login or credentials, no lint/npm install, no env reads or env dumps) can only be confirmed from the executor's session, not the repository"
    why_human: "Judgment-tier prohibitions are never silently passed (ADR-550 D4)"
---

# Phase 47: Build Log Search & Status Colours Verification Report

**Phase Goal:** A user can find text inside a full build log, sees the same status colours on every build list, and can open the log from every build list, including the dashboard.
**Verified:** 2026-10-15T11:21:57Z
**Status:** human_needed (no gaps; the one prior gap, UI E6 / WCAG 2.5.3, is closed in code, tests, records and production)
**Re-verification:** Yes. The prior report was gaps_found at 38/43. Gap closure plans 47-04 (code) and 47-05 (records and ship) have since run.

Evidence base. The verifier ran every check below itself; none of it comes from SUMMARY claims.
- **Refs:** console HEAD = console origin/thinx-staging = parent gitlink (HEAD and origin/thinx-staging) = `54734af`. Parent origin/thinx-staging = `fc0fa013`. origin/main = `14c08c1f`, unchanged. The parent HEAD `35712e91` is 4 signed docs-only commits ahead of origin (2ff1a2d2, 51fdf2cf, 37fb1933, 35712e91), all under `.planning/`; they stay local by design (47-05 decision).
- **Console range** `591033e..54734af`: 6 commits, all `G`, 10 files (exactly the 47-04 `files_modified`). `vue/src` diff read in full. No Legacy `src/` change.
- **Unit tests:** `LC_ALL=C npm run test:unit` exits 0 with 375 `ok` and 0 failing checks. In the default locale, `node tests/unit/build-log-search.cjs` exits 0 with 51 `ok`, and `milestone-v116.cjs` exits 0.
- **Build gates:** `test:csp:dist` passes (3 PASS) and `perf:spotter` reports "All performance budgets passed". Both ran on the existing dist built 12:56-12:57 on 2026-10-15, whose modern and legacy bundles have `View build log` x3 and `Open build log` x0.
- **Pipeline:** `node scripts/check-ci-gates.js pipeline --revision fc0fa013 --expect legacy-off` prints `CI-GATES PIPELINE OK 5674` (vue-console-registry, test and api-registry all success).
- **Live bundle:** `console.thinx.cloud/js/app.js` is 3235515 bytes, with id `fc0fa01` x2 and `ab37879` x0. Markers: `View build log` 3, `build-no-log` 3, `hasBuildLog` 21, and every 47-03 marker present. At 0: `Open build log`, the searchInput ref, the static `build-row` class, `build.build_id || build.id`, `isSuccess` and `m-0 mb-1 text-ellipsis`.
- **Live API:** unauthenticated GETs return 401 for rtm and console `/api/v2/logs/build/x`, rtm `/api/v2/logs/build` and rtm `/api/user/profile`.
- **Legacy console:** the 7 files fetched from rtm.thinx.cloud match the 47-05 / 47-03 sha256 baseline (`shasum -c`: 7 OK).

## Goal Achievement

### Observable Truths

Roadmap success criteria (the contract). This round is a regression check, and all four still hold.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Typing a term highlights every match and shows the count; `<`/`>` step and scroll into view; HTML in the log stays inert while highlighted | ✓ VERIFIED | `buildLogSearch` is unchanged; the only 47-04 change to `buildLog.js` is the added `hasBuildLog` export. The dialog diff only removes `ref="searchInput"` and routes `open()` through `hasBuildLog`. There is no `v-html`/`innerHTML`/`domProps` in the dialog (0 by grep). S1-S6, D1-D7, T1-T8 and L1-L5 pass. Real-browser scale is covered by the human backstops |
| SC2 | TIMEOUT warning, FAILED danger on navbar, dashboard, History and device Build History, from one mapping | ✓ VERIFIED | `buildStatusVariant` is still the only mapping (Notifications.vue:109/113/116, Visits.vue:231, History.vue:114, DeviceDetail.vue:156), and `isSuccess` is gone. N4 and N5 pass |
| SC3 | Dashboard card opens the full log; a row without a build id shows no Open-build-log button and never requests `/logs/build/<index>` | ✓ VERIFIED (strengthened) | Visits.vue:87 gates `.build-actions` on `hasBuildLog(item)`, and there is one `<BuildLogDialog ref="buildLogDialog" />` at :106. `BuildLogDialog.open()` returns before any state change or dispatch when `!hasBuildLog(build)`. `hasBuildLog` (buildLog.js:29-31) is true only for a non-empty string `build_id`. V8, H4, N7 and P2 render 9 candidate ids (string, `''`, missing, null, 0, 42, true, object, array) and assert that the control and request appear exactly when the predicate holds |
| SC4 | Phase 36 WR-01, IN-01..IN-03 fixed or deferred with a reason; the inert-row test fails if a click/keydown handler is added to any Build History cell | ✓ VERIFIED | The 36 ledger reads `open: 0` (WR-01 3bc6a4d/591033e, IN-01 3bc6a4d, IN-02 38eb95b/002e051, IN-03 591033e). The verifier's own run reports mutation checks (a)-(d) with 2 violations each, and the IN-01 collision check collected 1 warning |

Plan 47-01 must-haves: unchanged by 47-04 except IN-03 (the ref removal) and the `open()` guard. Regression check:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1-13 | Search, inert text, stepping/scroll, current-match tokens, count/speech, boundaries, precision, sticky bar, open/close lifecycle, states, E1-E3 | ✓ VERIFIED (13) | Same checks as before, all `ok` in the verifier run. L1 now reads "open() without a non-empty string build_id resolves without showing, loading or changing state". C3 now also forbids `ref="searchInput"` |
| 14 | Backstop: 5 MB log with more than 1000 matches | ⚠️ insufficient_spec, human | Human Verification 1 |
| 15 | Backstop: 20,000-character line, inert `<img onerror>` | ⚠️ insufficient_spec, human | Human Verification 2 |
| 16 | Backstop: 375px and 1280px layout | ⚠️ insufficient_spec, human | Human Verification 3 |
| 17 | test:unit in both locales; build, csp and perf pass | ✓ VERIFIED | Verifier: full suite under LC_ALL=C exits 0; build-log-search and milestone-v116 in the default locale exit 0; csp and perf pass on dist; pipeline 5674 built the shipped image |

Plan 47-02 must-haves (truths 1 and 5 amended by 47-05):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dashboard columns; View (p-0, eye, aria-label `View build log {build_id}`) before Download in `.build-actions`; opens the dialog | ✓ VERIFIED | Visits.vue:87-88; V2 asserts `aria-label === 'View build log b1'` |
| 2-4 | Placeholder rows; navbar static rows; one status mapping on all four lists | ✓ VERIFIED | V3, H2, N1-N6, N4/N5 |
| 5 | History View `p-0`, date `text-nowrap`; since 47-04 only rows with a build log keep the row click and pointer, others show the placeholder | ✓ VERIFIED | History.vue:110 (`:class="{ 'build-row': hasBuildLog(item) }" v-on="rowListeners(item)"`), :131-132, :296-299; H1, H3, H4 |
| 6-11 | Inert-row mutations, renderDeviceDetail warnings, Cypress G-36-3, 36 ledger and ROADMAP records, E4, E5 | ✓ VERIFIED | Unchanged; mutation output and IN-01 check reproduced |
| 12 | **UI E6** View controls: loading, error, and long-text, where the aria-label starts with the visible text (WCAG 2.5.3) | ✓ VERIFIED (previously FAILED) | All three tables bind `:aria-label="'View build log ' + <row>.build_id"` with visible text `View` (Visits.vue:88, History.vue:131, DeviceDetail.vue:159). Rendered-vnode tests assert `aria-label.startsWith(textOf(button))`: build-log-search.cjs:1001 (dashboard) and :1392 (History), milestone-v116.cjs:379 (Device Build History). P3 asserts that no `vue/src` file contains `Open build log`, and the verifier's grep agrees (0). The live bundle has 3 `View build log` and 0 `Open build log`. Loading and error clauses: L1, V6 |
| 13 | test:unit both locales; build, csp, perf | ✓ VERIFIED | As 47-01 #17 |

Plan 47-03 must-haves (shipping of 591033e), regression check:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1-8 | Preflight, console and parent push scope, gitlink and refs, pipeline 5673, live API, live bundle, Legacy identity | ✓ VERIFIED (8) | Superseded by the 47-05 ship, which the verifier re-checked: pipeline 5674 OK, the live bundle carries every 47-03 marker and none of the removed strings, Legacy is byte-identical |
| 9 | Human check: end-of-phase operator UAT | ? human | Human Verification 5 |

Plan 47-04 must-haves (gap closure code). The E6 restatement is deduplicated into 47-02 #12.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `hasBuildLog(build)` is the one rule: true only for an object with a non-empty string `build_id`, false for missing/empty/null/number/boolean/object/array, list-index `id`, non-object | ✓ VERIFIED | buildLog.js:29-31 `!!build && typeof build.build_id === 'string' && build.build_id !== ''`. P1 runs the `idRows()` truth table plus `null`, `undefined` and `{ id: '0' }`, and asserts a boolean result |
| 2 | `open()` shows the modal and dispatches `fetchBuildDetail` exactly when `hasBuildLog(row)` | ✓ VERIFIED | BuildLogDialog.vue `open()` begins `if (!hasBuildLog(build)) return Promise.resolve();`. P2 and L1 pass |
| 3 | View renders exactly when `hasBuildLog` on the dashboard, History and Device Build History; navbar button/static on `hasBuildLog`; a truthy non-string id never yields a focusable control | ✓ VERIFIED | Visits.vue:87, History.vue:131, DeviceDetail.vue:159, Notifications.vue:15-16/79. V8, H4, N7, H2 and the milestone-v116 `oddPage` check pass. The navbar `!!build.build_id` is gone |
| 4 | aria-label `View build log {build_id}` on all three tables; visible text `View`; no file under `vue/src` contains `Open build log` | ✓ VERIFIED | Verifier grep: 3 bindings, 0 old label. Live bundle: 3 and 0 |
| 5 | History rows without a build log have no `build-row` class and no click listener; rows with one keep pointer and row-click, which still ignores inner controls and selection; no role/tabindex/keydown | ✓ VERIFIED | History.vue:110 and `rowListeners` at :296-299 return `{}` without a build log and `{ click }` with one. `onBuildRowClick` is unchanged. H3 and H4 pass, and the 35 WR-01 block in milestone-v116 is byte-unchanged and passes. See the IN-10 warning below on that guard's reach |
| 6 | History's Log cell shows the `build-no-log` placeholder as the View `v-else` | ✓ VERIFIED | History.vue:132; H3 and H4 `expectNoLogPlaceholder` |
| 7 | Search field has no unused ref; S/D/T/L checks unchanged and passing | ✓ VERIFIED | Diff removes only `ref="searchInput"`; C3 guards it; all S/D/T/L checks are `ok` |
| 8 | Existing guards still hold, unweakened (36 WR-01 walk and mutations, IN-01, 35 WR-01 row semantics, one request per View, N4/N5, N1-N6) | ✓ VERIFIED | Every named guard passes in the verifier's run. The 35 WR-01 source block in milestone-v116.cjs:76-81 is byte-identical to 591033e. The row semantics hold in the code: no role or tabindex, and `rowListeners` returns only `click`. Caveat (⚠️ warning, 47-REVIEW IN-10): that source guard now reads a `<tr>` whose listeners come from `v-on="rowListeners(item)"`. A keydown added inside `rowListeners` would pass it, and H4's `hasListener` checks only that some listener exists. The guard code is unweakened, but it no longer covers that path |
| 9 | test:unit both locales; build, csp, perf; bundle carries `View build log`, not the old wording | ✓ VERIFIED | Verifier runs above; dist and live bundle markers |

Plan 47-05 must-haves (records and ship):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Local preflight passed before the push | ✓ VERIFIED | Re-run by the verifier now (test:unit, csp, perf) on the same tree (`54734af`, clean `vue/src`); the compile gate is from the SUMMARY, and green pipeline 5674 corroborates it |
| 2 | UI-SPEC matches the code: no aria-label line carries `Open build log`; Copywriting, UI-B11 and Verification Hooks name `View build log {build_id}`; UI-B11..B13 on `hasBuildLog`; UI-B14/B15 History placeholder; UI-B01 no ref; dated revision note; E6 and UI-B11 consistent | ✓ VERIFIED | 47-UI-SPEC.md:27 (revision note), :167, :184, :190-191, :197, :219, :289-290, :314. The only remaining `Open build log` is the E6 element *name* at :250 (`View (Open build log) controls`), a description and not an aria-label, as 47-05 states |
| 3 | 47-02 truths 1 and 5 amended | ✓ VERIFIED | 47-02-PLAN.md:31 and :35. Task-body text at :216/:241 still shows the old label; that is intentional, since 47-05 forbids edits beyond truths 1 and 5 |
| 4 | Disposition: WR-01, WR-02, IN-03 `fixed (console <sha>)` with 47-04 GREEN commits; the other five stay open; `open: 5` | ✓ VERIFIED | Rows: WR-01 `83cc7cc, 9daa778, 54734af`; WR-02 `9daa778`; IN-03 `83cc7cc`. All are signed console commits after 591033e. IN-01, IN-02 and IN-04..IN-06 are still `open`. The frontmatter now reads `open: 9`, because the later re-review (35712e91) added IN-07..IN-10, not because a disposition was undone |
| 5 | Console push carries only 47-04 commits within the ten paths, signed, no Legacy `src/` | ✓ VERIFIED | `591033e..54734af`: 6 `G`, 10 paths, `src/` empty |
| 6 | Parent push: signed, no merge, only `services/console` outside `.planning/` | ✓ VERIFIED | `ab378790..fc0fa013`: 13 commits, all `G`, single-parent; outside `.planning/` only `services/console` |
| 7 | Signed gitlink bump touches only `services/console`; refs agree; main unchanged | ✓ VERIFIED | fc0fa013 `G`, `--name-only` = `services/console`; gitlink 54734af on HEAD and origin/thinx-staging; origin/main 14c08c1f |
| 8 | Pipeline legacy-off OK | ✓ VERIFIED | Verifier: `CI-GATES PIPELINE OK 5674` |
| 9 | Live bundle id, ≥3 `View build log`, ≥3 `build-no-log`, 47-03 markers, none of the forbidden strings | ✓ VERIFIED | Verifier fetch (see evidence base) |
| 10 | Live API 401s after rollout; port 7442 unchanged; WS multi-tab 2/2 | ✓ VERIFIED (API part re-run) | The verifier's API probes return 401 x4. Port 7442 and the WS probe come from the SUMMARY only (not re-run; outside the verifier's permitted probe hosts/schemes). Phase 47 changes only the Vue console, so they are no-regression context |
| 11 | Legacy byte-identical before and after | ✓ VERIFIED | Verifier `shasum -c` 7 OK against the recorded baseline |
| 12 | Human check: View announced as `View build log <id>`; History row cursor and click; plus the 11 pending 47-03 items | ? human | Human Verification 4 and 5 |

**Score:** 59/64 truths verified (0 present-but-behavior-unverified; 5 routed to a human: 3 backstops, the 47-05 gap UAT, the 47-03 UAT; 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vue/src/utils/buildLog.js` | `export function hasBuildLog(` | ✓ VERIFIED | :29; imported by the dialog and four lists, registered in methods, called in templates and scripts |
| `vue/src/components/BuildLogDialog/BuildLogDialog.vue` | `hasBuildLog(build)` | ✓ VERIFIED | `open()` guard; no search ref |
| `vue/src/pages/Visits/Visits.vue` | `View build log` | ✓ VERIFIED | :87-88, :233 method |
| `vue/src/pages/History/History.vue` | `rowListeners(item)` | ✓ VERIFIED | :110, :131-132, :294-299 |
| `vue/src/components/Notifications/Notifications.vue` | `hasBuildLog(build)` | ✓ VERIFIED | :15-16, :76, :79 |
| `vue/src/pages/Devices/DeviceDetail.vue` | `hasBuildLog(build)` | ✓ VERIFIED | :159, :311 |
| `vue/tests/unit/build-log-search.cjs` | `hasBuildLog` | ✓ VERIFIED | P1-P3, V8, H3, H4, N7 present and passing |
| `vue/tests/unit/milestone-v116.cjs` | `View build log` | ✓ VERIFIED | :377-381 label pin and starts-with |
| `47-UI-SPEC.md` | `View build log {build_id}` | ✓ VERIFIED | :27, :219, :290 |
| `47-REVIEW-DISPOSITION.md` | `open: 5` | ✓ VERIFIED (evolved) | Fixed rows as required; frontmatter `open: 9` after the re-review added 4 new info items |
| `services/console` gitlink | bumped to 54734af | ✓ VERIFIED | `git ls-tree` HEAD and origin/thinx-staging |
| Prior artifacts (47-01..47-03: styles, variables, Notifications.scss, 36 ledger) | as before | ✓ VERIFIED | Unchanged since 591033e; C1-C3, N6 pass |

### Key Link Verification

Checked by hand. In the prior round, the gsd key-link tool could not resolve the descriptive `from:` fields.

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Visits, History, DeviceDetail, Notifications templates | `hasBuildLog` | import from `@/utils/buildLog`, registered in `methods` | WIRED | All four import it and register it as a method, and each template calls `hasBuildLog(` |
| `BuildLogDialog.open(build)` | `buildlog/fetchBuildDetail` → `GET /logs/build/<id>` | `if (!hasBuildLog(build)) return Promise.resolve();` before dispatch | WIRED | P2 counts exactly one dispatch per passing row |
| History `<tr data-cy="build-row">` | `onBuildRowClick` → `openBuildLog` | `v-on="rowListeners(item)"` | WIRED | H3: one open for a row with a log; none without |
| Parent HEAD | console HEAD | `chore(47): bump console to the build log label …` | WIRED | fc0fa013 |
| CircleCI pipeline 5674 | console.thinx.cloud bundle | vue-console-registry, then Swarmpit | WIRED | Live id fc0fa01 |
| Disposition fixed rows | 47-04 GREEN console commits | 7-char ids | WIRED | All resolve, `G` |
| Prior links (search util, IconButton, theme import, status mapping) | — | — | WIRED | Unchanged; regression checks pass |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| BuildLogDialog `<pre>` | `result.segments` | `fetchBuildDetail` → `$api.$get('/logs/build/'+id)` → `buildLogText` | Yes (V6, D7) | ✓ FLOWING |
| Visits Recent Builds | `buildItems` | `buildlog` store getter | Yes | ✓ FLOWING |
| History builds table | `filteredBuilds` | `buildlog` store via real `normPaging` (H3/H4 render with it) | Yes | ✓ FLOWING |
| Notifications rows | `recentBuilds` | `buildlog/fetchBuildLog` + `getItems` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full console unit suite (run once) | `LC_ALL=C npm run test:unit` | rc 0, 375 ok, 0 failing (the one `FAIL` substring is N4's title word "FAILED") | ✓ PASS |
| Default-locale suites | `node tests/unit/build-log-search.cjs`; `node tests/unit/milestone-v116.cjs` | rc 0 (51 ok); rc 0 | ✓ PASS |
| CSP of dist | `npm run test:csp:dist` | 3 PASS | ✓ PASS |
| Perf budgets | `npm run perf:spotter` | All performance budgets passed | ✓ PASS |
| Pipeline legacy-off | `node scripts/check-ci-gates.js pipeline --revision fc0fa013 --expect legacy-off` | CI-GATES PIPELINE OK 5674 | ✓ PASS |
| Live bundle markers | `curl https://console.thinx.cloud/js/app.js`, then `grep -o -F` counts | fc0fa01 x2; View build log 3; Open build log 0; forbidden strings 0 | ✓ PASS |
| Live unauthenticated API | `curl` x4 | 401 / 401 / 401 / 401 | ✓ PASS |
| Legacy byte identity | `curl` x7, then `shasum -a 256 -c` | 7 OK | ✓ PASS |

### Probe Execution

Step 7c: no probe scripts are declared or conventional for this phase. The plans' `check-ci-gates.js` gate was re-run above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BUILD-03 | 47-01, 47-03, 47-04, 47-05 | Search the full build log: highlight, count, `<`/`>` step with auto-scroll | ✓ SATISFIED | SC1; live markers; human backstops for real-browser scale |
| POL-02 | 47-01..47-05 | One shared status mapping; dashboard opens the log; no button without a build id | ✓ SATISFIED | SC2, SC3 (now through one predicate on every surface) |
| FIX-02 | 47-01..47-05 | Phase 36 WR-01, IN-01..IN-03 fixed or deferred with a reason | ✓ SATISFIED | SC4; 36 ledger `open: 0` |

All three IDs appear in REQUIREMENTS.md (lines 41, 59, 66, all `[x]`; traceability rows 126-128 map them to Phase 47, Complete). No requirement mapped to Phase 47 is orphaned.

### Prohibitions (judgment-tier, flagged; non-authoritative LLM-judge verdicts)

The 11 verdicts from 47-01..47-03 in the prior report still stand; nothing in the 47-04/47-05 range contradicts them. New ones:

| Plan | Prohibition (short) | LLM-judge verdict | Basis |
|------|---------------------|-------------------|-------|
| 47-04 | No focusable or clickable build-log control for a row failing `hasBuildLog`; no other "has a build log" decision in the five components | holds, with caveat | V8, H4, N7 and P2 pass; P3 passes. Caveat (47-REVIEW IN-07): `Visits.downloadArtifact` keeps a truthy `item.build_id` guard (unreachable, because Download renders only inside the `hasBuildLog` span), and `Devices.vue` (not one of the five) has its own stricter rule that rejects whitespace-only ids |
| 47-04 | Visible `View` text unchanged; no guard removed or weakened; Device Build History date, Build ID and status cells unchanged | holds, with caveat | The visible text is `View` everywhere. The mutation anchors are unchanged, and (a)-(d) report violations. The 35 WR-01 source block is byte-identical, but see IN-10 on its reduced reach |
| 47-04 | No Legacy, store, IconButton, Devices.vue, style or parent code change; no dependency; signed; no push in 47-04; no lint, install or env reads | holds for repo-checkable parts | The 10-path diff excludes all of these, and all 6 commits are `G`. Process parts cannot be checked from the repository |
| 47-05 | No push to main or force push, no PR, no pipeline rerun | holds (refs) | origin/main 14c08c1f; ranges fast-forward |
| 47-05 | No other workstream's source shipped | holds | Console range = ten 47-04 paths; parent range outside `.planning/` = `services/console` |
| 47-05 | Findings marked fixed name their commits; IN-01/02/04/05/06 untouched; 47-02 edited only in truths 1 and 5 | holds | Ledger rows; 47-02 task-body lines still carry the old copy |
| 47-05 | No ssh, docker, swarm, Traefik or Swarmpit edits; 7442 untouched | not checkable from the repository | Only the SUMMARY narrative |
| 47-05 | No production login or credentials, no env reads or dumps | not checkable from the repository | Only the SUMMARY narrative (probes are described as unauthenticated) |
| 47-05 | No unsigned commit or hook bypass | holds | Every commit in both ranges is `G` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (10 files touched by 47-04) | — | TBD/FIXME/XXX/TODO/HACK | none | No debt markers |
| `tests/unit/milestone-v116.cjs` / `History.vue` | 76-81 / 110, 296-299 | 35 WR-01 source guard reads `<tr>` attributes, but listeners now come from `v-on="rowListeners(item)"`; H4 checks only that some listener exists (47-REVIEW IN-10) | ⚠️ Warning | Test coverage only: the invariant holds in today's code, but a future keydown added to `rowListeners` would go undetected. Fix: assert `Object.keys(row.data.on)` equals `['click']` in H4 |
| `utils/buildLog.js` / `Devices.vue` / `Visits.vue` | 29-31 / 475 / 253 | Build-id rules outside `hasBuildLog`; whitespace-only id accepted by `hasBuildLog` but rejected by Devices (47-REVIEW IN-07) | ℹ️ Info | A `' '` id would show a View control that opens the dialog and lands on its error state, so this is not a dead control |
| `History.vue` | 116-133 | Inline excerpt and "No build log" can share a cell for a non-string id with log lines (47-REVIEW IN-08) | ℹ️ Info | Edge case; `normalizeBuildItems` falls back to the CouchDB `_id` |
| tests / Cypress | various | Test titles still say "Open build log" (47-REVIEW IN-09) | ℹ️ Info | Messages only |

IN-01, IN-02 and IN-04..IN-06 are carried forward unchanged as info, and are open in the ledger.

### Human Verification Required

1. **5 MB log with more than 1000 matches (backstop):** at most 1000 marks, `1 / 1000+`, Next on 1000 wraps to 1, and only the log box scrolls.
2. **20,000-character unbroken line and `<img src=x onerror=alert(1)>` (backstop):** the line wraps with no horizontal scrollbar, the highlight causes no shift, and the `<img>` line is text with no image element.
3. **375px / 1280px bar layout (backstop):** two rows at 375px with the count and chevrons together and the bar sticky; one row at 1280px.
4. **47-05 gap UAT:** the computed accessible name is `View build log <id>` while the button shows `View` on the dashboard, History and Device Build History. History rows: pointer and click only with a build id; otherwise `—`, the default cursor and no action. Other lists unchanged.
5. **47-03 operator UAT, 11 items** (listed in 47-05-SUMMARY "Carried from 47-03-SUMMARY"), including Legacy console-retest.
6. **Flagged prohibitions:** confirm the LLM-judge verdicts, especially the process-only items for 47-03, 47-04 and 47-05.

### Gaps Summary

There are no gaps. The single prior gap (47-02 truth "UI E6": the aria-label must start with the visible text, WCAG 2.5.3) is closed at every level:
- **Code:** `View build log {build_id}` on all three tables, with visible text `View`.
- **Tests:** rendered-vnode `startsWith(textOf(button))` assertions for each table, plus the P3 source lock with zero old wording under `vue/src`.
- **Records:** UI-SPEC and the 47-02 truths no longer contradict each other.
- **Production:** live bundle fc0fa01 has `View build log` x3 and `Open build log` x0.

The 47-04 work also closed review findings WR-01, WR-02 and IN-03. A single `hasBuildLog` predicate now decides every build-log control and `open()`, and History rows without a log lose the pointer and the row click.

The re-check found no regressions. All four roadmap success criteria still hold, the pipeline is green, the Legacy console is byte-identical, and the unauthenticated API surface is unchanged.

The status is `human_needed` because three layout and scale backstops and the operator UAT need a real browser, and 20 judgment-tier prohibitions need operator confirmation. One coverage warning (IN-10) is worth fixing in Phase 48 alongside the other open info items. It does not affect the phase goal.

---

_Verified: 2026-10-15T11:21:57Z_
_Verifier: Claude (gsd-verifier)_
