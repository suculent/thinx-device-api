---
phase: 47-build-log-search-status-colours
verified: 2026-10-15T10:05:00Z
status: gaps_found
score: 38/43 must-haves verified
covered_files:
  - ".planning/milestones/v1.16-phases/36-build-log-access/36-REVIEW-DISPOSITION.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-01-PLAN.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-01-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-02-PLAN.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-02-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-03-PLAN.md"
  - ".planning/workstreams/vue-console/phases/47-build-log-search-status-colours/47-03-SUMMARY.md"
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
covered_digest: "v3:sha256:f8e616c0585b4185e2adf43af78211d59aa441388f7cc5c01b55526d641985b5"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "UI E6 View (Open build log) controls (covered): ... long-text — the visible label is the fixed word `View` and the long build id is only in the aria-label, which starts with the visible text (WCAG 2.5.3)"
    status: partial
    reason: "The aria-label is `Open build log {build_id}` on all three tables. It does not start with, or contain, the visible word `View`, so the WCAG 2.5.3 (Label in Name) clause of this must-have is false. The loading and error clauses of E6 hold. The plan contradicts itself: 47-02 truth 1 and UI-SPEC UI-B11 / line 217 lock the aria-label to `Open build log {build_id}`, and E6 says that label starts with `View`. Both cannot hold while the visible text stays `View`. 47-02-SUMMARY records this gap but sends it to Phase 48 only as a 'candidate'. The Phase 48 ROADMAP section does not list it, so it is not deferred."
    artifacts:
      - path: "services/console/vue/src/pages/Visits/Visits.vue"
        issue: ":aria-label=\"'Open build log ' + item.build_id\" with visible text `View` (line 88)"
      - path: "services/console/vue/src/pages/History/History.vue"
        issue: ":aria-label=\"'Open build log ' + (item.build_id || item.name || '')\" with visible text `View` (line 130)"
      - path: "services/console/vue/src/pages/Devices/DeviceDetail.vue"
        issue: ":aria-label=\"'Open build log ' + build.build_id\" with visible text `View` (line 159)"
    missing:
      - "Either change the three aria-labels to a form that starts with the visible text (for example `View build log {build_id}`) and update UI-SPEC UI-B11/line 217, 47-02 truth 1 and the V2/H1 unit assertions to match"
      - "Or accept the deviation with an `overrides:` entry, since the copy was locked deliberately (UI-SPEC line 217), and add the WCAG 2.5.3 item to the Phase 48 accessibility carry-overs so it is not lost"
human_verification:
  - test: "Backstop (insufficient_spec, 47-01/47-03): open a build log of about 5 MB and type a term with more than 1000 hits"
    expected: "At most 1000 mark elements; the count reads 1 / 1000+; Next match on 1000 wraps to 1; each step scrolls only the log box, so the current match is visible and neither the modal nor the page scrolls"
    why_human: "Real-browser rendering, DOM size and scroll geometry on a multi-MB log. The plain-node vnode tests use fake geometry (T6) and small inputs (S4)"
  - test: "Backstop (insufficient_spec): a 20,000-character log line with no spaces, with a match in the middle, and a line holding <img src=x onerror=alert(1)>"
    expected: "The long line wraps inside the log box with no horizontal scrollbar. The match is highlighted with no column shift. The <img> line shows as visible text, and the DOM has no image element"
    why_human: "Line wrapping and layout shift only show in a real layout engine. D4 proves text-only vnodes; the browser DOM still needs a look"
  - test: "Backstop (insufficient_spec): the search bar at 375px and at 1280px viewport width"
    expected: "At 375px the bar wraps to two rows 8px apart, the field is full width, the count and both chevrons stay on one row, and the bar stays at the top while the log box scrolls. At 1280px all four blocks sit on one row. (47-UI-REVIEW Pillar 5 notes the IconButtons may drop to a second row at 375px.)"
    why_human: "Responsive layout; C2 only checks the compiled CSS rules"
  - test: "End-of-phase operator UAT (47-03 <human-check>, 11 items): log in to https://console.thinx.cloud after a hard reload and run items 1-11 from 47-03-SUMMARY 'Pending end-of-phase UAT'"
    expected: "Rollout times after the push; dashboard View before Download opens the log; search, wrap, centred scroll, Esc and reset on reopen; inert HTML when searching for `<`; error state with Try again; TIMEOUT amber / FAILED red / OK green / RUNNING blue on all four lists; Device Build History cells inert; navbar static rows; layout backstops; Phase 36/35 records; Legacy console-retest"
    why_human: "Needs a logged-in operator, real build logs and visual judgement. The verifier must not log in"
  - test: "Flagged judgment-tier prohibitions (11, all `verification: judgment`, `flagged: true`): review the non-authoritative LLM-judge verdicts in the Prohibitions table"
    expected: "Operator confirms or rejects each verdict. Process prohibitions (no ssh/docker, no production login, no lint/npm install, no env reads) can only be confirmed from the executor's session, not the repository"
    why_human: "Judgment-tier prohibitions are never silently passed (ADR-550 D4)"
---

# Phase 47: Build Log Search & Status Colours Verification Report

**Phase Goal:** A user can find text inside a full build log, sees the same status colours on every build list, and can open the log from every build list, including the dashboard.
**Verified:** 2026-10-15T10:05:00Z
**Status:** gaps_found (one narrow plan-level gap: a WCAG 2.5.3 aria-label clause; all four roadmap success criteria are met in code, tests and the live bundle)
**Re-verification:** No (initial verification)

Evidence base: console submodule HEAD = console origin/thinx-staging = parent gitlink = `591033e` (12 signed commits `31bce2b..591033e`, exactly the 14 Phase 47 Vue paths). Parent origin/thinx-staging = `ab378790` (signed bump, changes only `services/console`). Origin main = `14c08c1f`, unchanged. The verifier ran its own checks; none of the evidence below comes from SUMMARY claims:
- `LC_ALL=C npm run test:unit`: rc 0, 368 `ok`, no `FAIL`/`not ok`.
- `node tests/unit/build-log-search.cjs` in the default locale: rc 0, 44 `ok`.
- `test:csp:dist` and `perf:spotter` on the existing dist (which carries `build-log-search-bar`): both pass.
- `check-ci-gates.js pipeline --revision ab378790 --expect legacy-off`: `CI-GATES PIPELINE OK 5673`.
- The live `console.thinx.cloud/js/app.js` (3234229 bytes) carries id `ab37879` and every marker, with 0 replaced strings.
- Unauthenticated `/api/v2/logs/build[/x]` answers 401 on rtm and console.
- The 7 live Legacy files hash identically to the 47-03 baseline.

## Goal Achievement

### Observable Truths

Roadmap success criteria (the contract):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Typing a term highlights every match and shows the count; `<`/`>` step and scroll into view; HTML in the log stays inert while highlighted | ✓ VERIFIED | `buildLogSearch` (buildLog.js:39-60) is a literal `gi` RegExp on the original text. The dialog renders `mark`/`span` segments by `{{ }}` only, with no `v-html`/`innerHTML`/`domProps` (grep). `step()` wraps, and `scrollToCurrent()` sets only `log.scrollTop`. `.build-log-text` has `position: relative`, so it is the marks' offsetParent. Tests S1-S6, D1-D7, T1-T8 pass. Real-browser scale and layout go to human backstops |
| SC2 | TIMEOUT warning, FAILED danger on navbar, dashboard, History and device Build History, from one mapping | ✓ VERIFIED | `buildStatusVariant` (buildLog.js:27-33) is the only mapping. It is used by Notifications.vue:109/113/116, Visits.vue:231, History.vue:113, DeviceDetail.vue:156. `isSuccess` is removed. N4/N5 lock the four statuses on all four lists and forbid OK comparisons and literal variants |
| SC3 | Dashboard card opens the full log; a row without a build id shows no Open-build-log button and never requests `/logs/build/<index>` | ✓ VERIFIED | Visits.vue:86-96 has View + Download inside `.build-actions` with `v-if="item.build_id"` and a `build-no-log` placeholder otherwise. There is one `<BuildLogDialog ref="buildLogDialog">` outside the loading `v-if` (:106). `BuildLogDialog.open()` refuses any build_id that is not a non-empty string (:100-102). The only `fetchBuildDetail` dispatch is after that guard (:128). The `build.build_id \|\| build.id` fallback is gone from source and from the live bundle. V1-V6, L1 and N1 pass |
| SC4 | Phase 36 WR-01, IN-01..IN-03 fixed or deferred with a reason; the inert-row test fails if a click/keydown handler is added to any Build History cell | ✓ VERIFIED | `buildHistoryViolations()` (milestone-v116.cjs:169-181) walks the whole card (`on` and `nativeOn`, tabindex and role). Four mutation checks (td click, `<code>` keydown, badge `@click.native`, td tabindex) each assert at least 1 violation and pass in the run. IN-01 warnHandler spans construction to `_render()` with `finally`; the collision check collects the `buildHistory` warning. The Cypress spec clicks every non-last cell and checks a length of 0 before View. 36-REVIEW-DISPOSITION.md shows 4 fixed with console SHAs and `open: 0` (38eb95b, 3bc6a4d, 002e051 and 591033e all exist) |

Plan 47-01 must-haves:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 3+ chars highlight up to 1000 `mark.build-log-match`, count `{n} / {total}`, case-insensitive literal, 200 ms debounce | ✓ VERIFIED | S1, S2, S3, D5, D6 |
| 2 | Highlighted log text stays inert (`<b>x</b> abc <script>`) | ✓ VERIFIED | D4; no raw-HTML binding in the SFC (grep) |
| 3 | Prev/Next IconButtons, wrap, Enter/Shift+Enter, Esc to modal, centring by log-box scrollTop only | ✓ VERIFIED | T1, T2, T4, T6, T8; no `scrollIntoView` |
| 4 | Current match class + aria-current, amber colours as six `!default` tokens | ✓ VERIFIED | T3, C1, C3; _variables.scss:57-62 |
| 5 | Count text / live speech forms | ✓ VERIFIED | D5; BuildLogDialog.vue:37-46 |
| 6 | Boundary: 2 chars and 3 spaces search nothing, 1000 versus 1001 cap, wrap | ✓ VERIFIED | S3, S4, T2 |
| 7 | Precision: segments rebuild the text (U+0130), non-overlapping, no empty-match loop | ✓ VERIFIED | S1, S5, S6; buildLog.js:51 guard |
| 8 | Sticky `role=search` bar only while text shows; term resets on open and is kept by Try again | ✓ VERIFIED | D1, D2, L2, L3, C2 |
| 9 | `open()` id-only; close resets loading and debounce | ✓ VERIFIED | L1, L4; BuildLogDialog.vue:100-118 |
| 10 | Error, empty and loading states copy; exactly one state | ✓ VERIFIED | L5; template lines 12-16 |
| 11 | UI E1 search field states | ✓ VERIFIED | D2, D5, T5, S2/S3; placeholder present |
| 12 | UI E2 step buttons states | ✓ VERIFIED | T1; IconButton `title` on wrapper span, `d-none d-lg-inline` label |
| 13 | UI E3 log box states | ✓ VERIFIED | D2-D5, L1-L5, S4 |
| 14 | Backstop: 5 MB log with more than 1000 matches | ⚠️ insufficient_spec, human | See Human Verification 1 |
| 15 | Backstop: 20,000-character line, inert `<img onerror>` | ⚠️ insufficient_spec, human | See Human Verification 2 |
| 16 | Backstop: 375px and 1280px layout | ⚠️ insufficient_spec, human | See Human Verification 3 |
| 17 | test:unit in both locales; build, csp and perf pass | ✓ VERIFIED | Verifier run: LC_ALL=C full suite rc 0; build-log-search.cjs default locale rc 0; csp and perf pass on dist; CI vue-console-registry built the shipped image |

Plan 47-02 must-haves:

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dashboard columns Time/Device/Status/Actions; View (p-0, eye, aria-label) before Download in `.build-actions`; opens the dialog | ✓ VERIFIED | Visits.vue:78-94, 235; V1, V2, V5, V7 |
| 2 | Rows without a build id show the `build-no-log` placeholder only (dashboard, Device Build History) | ✓ VERIFIED | Visits.vue:95, DeviceDetail.vue:160; V3, H2 |
| 3 | Navbar: buttons only with a build id, static rows otherwise, span markup, `—` fallback | ✓ VERIFIED | Notifications.vue:11-31, 78-81; Notifications.scss; N1-N3, N6 |
| 4 | TIMEOUT warning / FAILED danger on all four lists via `buildStatusVariant`; unit lock | ✓ VERIFIED | N4, N5 |
| 5 | History View `p-0`, date cell `text-nowrap` | ✓ VERIFIED | History.vue:110, 130; H1 |
| 6 | The inert-row test catches handler, keydown, `@click.native` and tabindex mutations | ✓ VERIFIED | Mutation output lines (a)-(d), each reporting 2 violations; asserted at milestone-v116.cjs:426 |
| 7 | `renderDeviceDetail` collects warnings from construction, restores in `finally` | ✓ VERIFIED | milestone-v116.cjs:137-149, 430-434 |
| 8 | Cypress G-36-3 clicks every cell, length 0 then 1, comment corrected | ✓ VERIFIED | device-detail.spec.js:107-115 (not executed until Phase 48 CI-07, as planned) |
| 9 | 36 disposition `open: 0` with SHAs; ROADMAP Phase 48 'Closed in Phase 47' lists 35 IN-06/IN-07 | ✓ VERIFIED | 36-REVIEW-DISPOSITION.md; ROADMAP.md:247-249 |
| 10 | UI E4 dashboard table states | ✓ VERIFIED | V3-V6; Visits.vue:5, 76 |
| 11 | UI E5 navbar states | ✓ VERIFIED | N1-N3, N6 |
| 12 | UI E6 View controls: loading, error, long-text including 'aria-label starts with the visible text (WCAG 2.5.3)' | ✗ FAILED (partial) | Loading and error clauses hold (L1, V6). The aria-label `Open build log {id}` does not start with `View`, so the 2.5.3 clause is false. See Gaps |
| 13 | test:unit in both locales; build, csp and perf | ✓ VERIFIED | As 47-01 #17 |

Plan 47-03 must-haves (deduplicated; the backstops are counted once under 47-01):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Preflight passed before the push | ✓ VERIFIED | Re-ran test:unit, csp and perf myself; compile gate from the SUMMARY plus a green pipeline 5673 |
| 2 | Console push carries only signed Phase 47 commits within the 14 paths, no Legacy `src/` | ✓ VERIFIED | `git log 31bce2b..591033e` shows 12 commits, all G; diff stat has 14 files; `src/`, IconButton and store have no diff |
| 3 | Parent push only Phase 47 work and docs, signed, merges ok | ✓ VERIFIED | `6d47a5fb..ab378790`: 19 commits, all G, 0 merges; outside `.planning/` only `services/console` |
| 4 | Signed gitlink bump changes only `services/console`; refs agree; main unchanged | ✓ VERIFIED | ab378790 is G and touches only `services/console`; console HEAD = origin = gitlink = 591033e; origin/thinx-staging = ab378790; origin/main = 14c08c1f |
| 5 | Pipeline legacy-off proof | ✓ VERIFIED | Verifier re-ran it: `CI-GATES PIPELINE OK 5673` (test, api-registry, vue-console-registry success) |
| 6 | Live unauthenticated API checks | ✓ VERIFIED | Verifier probes: 401 for rtm and console `/api/v2/logs/build/x` and for rtm `/api/v2/logs/build`. Port 7442 and the WS probe come from the SUMMARY only (not re-run) |
| 7 | Live bundle carries the id and markers, none of the replaced strings | ✓ VERIFIED | Verifier fetch: `ab37879` x2, all markers ≥1, replaced strings 0 |
| 8 | Legacy byte-identical | ✓ VERIFIED | Verifier fetched the 7 files from rtm.thinx.cloud; every sha256 prefix matches the baseline in 47-03-SUMMARY |
| 9 | Human check: end-of-phase operator UAT | ? human | See Human Verification 4 |

**Score:** 38/43 truths verified (0 present-but-behavior-unverified; 4 routed to a human: 3 backstops and the UAT; 1 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vue/src/utils/buildLog.js` | `export function buildLogSearch` | ✓ VERIFIED | Exists, substantive, imported by BuildLogDialog.vue:21 and used at :36 |
| `vue/src/components/BuildLogDialog/BuildLogDialog.vue` | `build-log-search-bar` | ✓ VERIFIED | Used by Visits, Notifications, History, DeviceDetail and Devices |
| `vue/src/styles/_build-log.scss` | `.build-log-match--current`, `.build-actions` | ✓ VERIFIED | Imported by theme.scss:28; live CSS markers |
| `vue/src/styles/_variables.scss` | `$build-log-current-bg` | ✓ VERIFIED | Six `!default` tokens, used in _build-log.scss |
| `vue/tests/unit/build-log-search.cjs` | `buildLogSearch` | ✓ VERIFIED | Chained last in `test:unit`; 44 ok |
| `vue/src/pages/Visits/Visits.vue` | `buildLogDialog` | ✓ VERIFIED | Ref, component and `openBuildLog` are wired |
| `vue/src/components/Notifications/Notifications.vue` | `listGroupItem--static` | ✓ VERIFIED | `rowListeners` bound via `v-on` |
| `vue/src/components/Notifications/Notifications.scss` | `.notification-title` | ✓ VERIFIED | N6 compiles it |
| `vue/tests/unit/milestone-v116.cjs` | `nativeOn` | ✓ VERIFIED | Line 173 |
| `36-REVIEW-DISPOSITION.md` | `open: 0` | ✓ VERIFIED | 4 fixed with SHAs |
| `services/console` (gitlink) | bumped to 591033e | ✓ VERIFIED | `git ls-tree` shows 591033e on HEAD and origin/thinx-staging. The gsd `verify.artifacts` tool reports "Not a file" because it cannot handle a gitlink; checked by hand |

### Key Link Verification

The gsd `verify.key-links` tool could not resolve the descriptive `from:` fields (0/10, "Source file not found"), so every link below was checked by hand.

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| BuildLogDialog computed `result` | `buildLogSearch(text, term)` | import from `@/utils/buildLog` | WIRED | :21, :36 |
| BuildLogDialog `open()` | `buildlog/fetchBuildDetail` → `GET /logs/build/<build_id>` | dispatch after a non-empty string guard | WIRED | :102, :128; store buildlog.js:59-61 |
| BuildLogDialog bar | IconButton | two `<IconButton data-cy=build-log-prev/next>` | WIRED | :9-10, component registered :30 |
| theme.scss | _build-log.scss | `@import 'build-log'` after settings-pages | WIRED | theme.scss:27-28 |
| Visits View | `BuildLogDialog.open(item)` | `openBuildLog` → `$refs.buildLogDialog.open` | WIRED | :88, :106, :235 |
| Notifications rows | `openBuildLog` only with a build id | `v-on="rowListeners(build)"` | WIRED | :18, :78-81 |
| Four lists | `buildStatusVariant` | import from `@/utils/buildLog` | WIRED | All four import and use it |
| Parent HEAD | console HEAD | `chore(47): bump console …` | WIRED | ab378790 |
| CircleCI pipeline | console.thinx.cloud bundle | vue-console-registry, then Swarmpit | WIRED | Pipeline 5673 OK; live bundle id ab37879 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| BuildLogDialog `<pre>` | `text` / `result.segments` | `buildlog/fetchBuildDetail` → `$api.$get('/logs/build/'+id)` → `buildLogText` | Yes (V6: one GET `/logs/build/b1`; D7 end to end) | ✓ FLOWING |
| Visits Recent Builds | `buildItems` | `buildlog` store getter, filled by `loadData` | Yes | ✓ FLOWING |
| Notifications rows | `recentBuilds` | `buildlog/fetchBuildLog` + `getItems` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full console unit suite | `LC_ALL=C npm run test:unit` (run once) | rc 0, 368 ok, 0 fail | ✓ PASS |
| Search suite in the default locale | `node tests/unit/build-log-search.cjs` | rc 0, 44 ok | ✓ PASS |
| CSP of the built dist | `node tests/security/csp.cjs --dist` | 3 PASS | ✓ PASS |
| Perf budgets | `node scripts/perf-regression-spotter.js` | All performance budgets passed | ✓ PASS |
| Pipeline legacy-off | `node scripts/check-ci-gates.js pipeline --revision ab378790 --expect legacy-off` | CI-GATES PIPELINE OK 5673 | ✓ PASS |
| Live bundle markers | `curl https://console.thinx.cloud/js/app.js` and count markers | id ab37879; all markers present; 3 replaced strings at 0 | ✓ PASS |
| Live unauthenticated API | `curl` of three build-log URLs | 401 / 401 / 401 | ✓ PASS |
| Legacy byte identity | `curl` of 7 files, then `shasum -a 256` | All 7 match the baseline | ✓ PASS |

### Probe Execution

Step 7c: no probe scripts are declared or conventional for this phase (no `scripts/*/tests/probe-*.sh` named in the plans). The plan's `check-ci-gates.js` gate was re-run above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BUILD-03 | 47-01, 47-03 | Search the full build log: highlight, count, `<`/`>` step with auto-scroll | ✓ SATISFIED | SC1; live bundle markers; real-browser scale goes to human backstops |
| POL-02 | 47-01, 47-02, 47-03 | One shared status mapping (TIMEOUT warning, FAILED danger); dashboard opens the log; no button without a build id | ✓ SATISFIED | SC2, SC3 |
| FIX-02 | 47-01, 47-02, 47-03 | Phase 36 WR-01, IN-01..IN-03 fixed or deferred with a reason | ✓ SATISFIED | SC4; 36 ledger `open: 0` |

All three IDs from the plan frontmatter appear in REQUIREMENTS.md (lines 41, 59, 66; traceability rows 126-128 map them to Phase 47). No requirement mapped to Phase 47 is orphaned.

### Prohibitions (judgment-tier, flagged; non-authoritative LLM-judge verdicts)

| Plan | Prohibition (short) | LLM-judge verdict | Basis |
|------|---------------------|-------------------|-------|
| 47-01 | Search term and log text not sent, persisted or logged | holds | Term lives only in component data. The only dispatch is `fetchBuildDetail(buildId)`. The SFC has no `console.`, storage or router/query |
| 47-01 | Request only by the row's own build_id | holds | open() guard; fallback removed (source and live bundle) |
| 47-01 | No Legacy, IconButton or store change, no npm dependency, signed commits, no lint/install/env | holds for repo-checkable parts | Empty diff on `src/`, IconButton and store; package.json changes only the test chain; 12 G. Process parts cannot be checked from the repository |
| 47-02 | No non-OK status in the success colour/glyph | holds | `buildStatusVariant` gives success only for OK; missing gives danger with `fa-times`; N3, N4 |
| 47-02 | Ledger names commits; no guard weakened | holds | SHAs present and resolvable. Removed milestone-v116 lines were refactored into `renderDeviceDetail` (`expectClean` defaults true). The guard was widened from the row to the whole card |
| 47-02 | No BuildLogDialog, IconButton or store change in 47-02, no dependency, signed | holds | `002e051..591033e` has no BuildLogDialog diff; commits G |
| 47-03 | No main or force push, no PR, no rerun | holds (refs) | origin/main 14c08c1f; fast-forward ranges |
| 47-03 | No other workstream's source shipped | holds | Parent range outside `.planning/` is only `services/console` |
| 47-03 | No ssh, docker or swarm edits; 7442 untouched | not checkable from the repository | Only the SUMMARY narrative |
| 47-03 | No production login or credentials, no env dumps | not checkable from the repository | Only the SUMMARY narrative (probes described as unauthenticated) |
| 47-03 | No unsigned commit or hook bypass | holds | 19 + 12 commits all G |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (14 phase files) | — | TBD/FIXME/XXX/TODO/HACK | none | No debt markers |
| Visits.vue / History.vue / DeviceDetail.vue | 88 / 130 / 159 | aria-label does not contain the visible label `View` (WCAG 2.5.3) | ⚠️ Warning (backs the E6 gap) | Voice-control users saying "click View" may not reach the button |
| Notifications.vue | 15-16 vs 79 | "has a build log" is truthy in the template but a non-empty string in `rowListeners`/`open()` (47-REVIEW WR-01) | ℹ️ Info (latent) | A truthy non-string id would give a focusable button that does nothing. Current ids are strings |
| History.vue | 109 | Rows without a build_id keep `build-row` pointer and click, which now no-ops (47-REVIEW WR-02) | ℹ️ Info | Dead affordance only. SC3 still holds: no View button, no request |
| BuildLogDialog.vue | 6 | Unused `ref="searchInput"` shadows the data name (47-REVIEW IN-03) | ℹ️ Info | None |

47-REVIEW-DISPOSITION.md still lists all 8 review findings as `open` (not triaged). None is a goal blocker.

### Human Verification Required

1. **5 MB log with more than 1000 matches (backstop):** type a common term. Expected: at most 1000 marks, `1 / 1000+`, Next on 1000 wraps to 1, and only the log box scrolls. Why human: real DOM scale and scroll geometry.
2. **20,000-character unbroken line and `<img src=x onerror=alert(1)>` (backstop):** Expected: the line wraps with no horizontal scrollbar; the highlight causes no shift; the `<img>` line shows as text and no image element exists. Why human: real layout engine.
3. **375px / 1280px bar layout (backstop):** Expected: two rows at 375px with the count and chevrons together and the bar sticky; one row at 1280px. Why human: responsive layout (the UI review flags a possible chevron wrap at 375px).
4. **Operator UAT, 11 items:** listed verbatim in 47-03-SUMMARY under "Pending end-of-phase UAT" (rollout, dashboard View, search, inert HTML, error/Try again, status colours on 4 lists, Device Build History inertness, navbar static rows, layout, records, Legacy console-retest).
5. **Flagged prohibitions:** confirm the LLM-judge verdicts above, in particular the three process-only items for 47-03.

### Gaps Summary

The phase goal holds in the shipped code. Build-log search with highlight, count, stepping, scroll and inert text works. One status mapping drives all four lists. The dashboard and every other list open the log, and no list can request `/logs/build/<index>`. All four roadmap success criteria are verified by the verifier's own test run, by source inspection and by the live bundle.

One plan-level must-have is false. 47-02 truth "UI E6" says the View button's aria-label "starts with the visible text (WCAG 2.5.3)". The shipped aria-label is `Open build log {id}`, and the visible text is `View`. The spec is internally inconsistent: UI-SPEC UI-B11/line 217 and 47-02 truth 1 lock exactly this label. The executor noticed (47-02-SUMMARY) but did not record it anywhere a later phase picks it up. No later roadmap phase covers it, so it is a real gap and not a deferred one.

**This looks intentional.** The label copy was locked on purpose, and the button predates Phase 47 on History and Device Detail. To accept the deviation instead of changing the copy, add to this file's frontmatter:

```yaml
overrides:
  - must_have: "UI E6 View (Open build log) controls (covered): long-text — the visible label is the fixed word View and the long build id is only in the aria-label, which starts with the visible text (WCAG 2.5.3)"
    reason: "aria-label copy `Open build log {build_id}` is locked by UI-SPEC UI-B11/line 217 and 47-02 truth 1; the E6 WCAG claim was a spec error. WCAG 2.5.3 label-in-name moved to the Phase 48 accessibility carry-overs."
    accepted_by: "{operator}"
    accepted_at: "{ISO timestamp}"
```

If you accept it, also add the 2.5.3 item to the ROADMAP Phase 48 "Carried from Phase 44"-style accessibility list, so the issue stays on record. The alternative fix is about 3 lines plus test and spec text: `View build log {build_id}` on Visits, History and DeviceDetail, with matching updates to V2/H1 and UI-SPEC.

---

_Verified: 2026-10-15T10:05:00Z_
_Verifier: Claude (gsd-verifier)_
