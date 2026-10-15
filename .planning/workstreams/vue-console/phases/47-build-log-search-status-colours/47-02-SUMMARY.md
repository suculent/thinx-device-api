---
phase: 47-build-log-search-status-colours
plan: 02
subsystem: ui
tags: [vue, console, ui, build-log, status-colours, dashboard, notifications, review-fixes, accessibility]

requires:
  - phase: 47-01
    provides: "BuildLogDialog id-only open(), build-log-search.cjs harness, _build-log.scss"
  - phase: 36
    provides: "Device Build History G-36-3 guard tests and the 36-REVIEW findings WR-01, IN-01..IN-03"
provides:
  - "Dashboard Recent Builds: Actions column with View (eye link) before Download in .build-actions, a No build log placeholder, one BuildLogDialog"
  - "Navbar Recent Builds: rows are buttons only with a build id (rowListeners), static listGroupItem--static rows otherwise, span title and meta lines, em-dash status fallback"
  - "History View p-0 and text-nowrap date cell; Device Build History No build log placeholder"
  - "Status mapping lock (OK/TIMEOUT/RUNNING/FAILED) on all four build lists"
  - "milestone-v116.cjs: buildHistoryViolations() over the whole card with four mutation checks; warn handler from construction (renderDeviceDetail options)"
  - "Cypress G-36-3 clicks every non-button cell and expects zero requests before View"
  - "36-REVIEW-DISPOSITION open: 0; ROADMAP Phase 48 'Closed in Phase 47' record"
affects: [47-03, 48]

actuals:
  tokens: 11000
  tasks: 3
  commits: 7
plan_head_before: 002e051260472b5245e5b8ce83bc6e4c5c9b58cc
plan_head_after: 591033e483511949d14c3a37f48f301321d2a1de
parent_head_before: 0407d4df06275efe8937b762887820a9386b95af

tech-stack:
  added: []
  patterns:
    - "v-on bound to a method that returns {} without a build id, so a static row has no listener at all"
    - "Compound .listGroupItem.listGroupItem--static selector to beat the later, equally specific ListGroup.scss hover"
    - "Mutation checks: render a string-transformed template and require the guard to report a violation"

key-files:
  created: []
  modified:
    - services/console/vue/src/pages/Visits/Visits.vue
    - services/console/vue/src/styles/_build-log.scss
    - services/console/vue/src/components/Notifications/Notifications.vue
    - services/console/vue/src/components/Notifications/Notifications.scss
    - services/console/vue/src/pages/History/History.vue
    - services/console/vue/src/pages/Devices/DeviceDetail.vue
    - services/console/vue/tests/unit/build-log-search.cjs
    - services/console/vue/tests/unit/milestone-v116.cjs
    - services/console/vue/cypress/integration/device-detail.spec.js
    - .planning/milestones/v1.16-phases/36-build-log-access/36-REVIEW-DISPOSITION.md
    - .planning/workstreams/vue-console/ROADMAP.md

key-decisions:
  - "Navbar rowListeners() gives a click listener only when build_id is a non-empty string, matching the dialog's own id-only guard"
  - "The dashboard BuildLogDialog sits outside the loading branch (V5 checks it renders while loading too)"
  - "36 IN-02 is recorded as fixed by 38eb95b (View only with a build id) plus 002e051 (id-only open()); IN-03 is recorded on the spec change, executed by Phase 48 CI-07"
  - "The View aria-label (Open build log <id>) does not contain the visible word View; the copy is locked by D-13 and already ships on History and Device Detail, so it is flagged, not changed"

patterns-established:
  - "build-log-search.cjs prefixes V (dashboard), N (navbar and status mapping), H (History, Device Detail) next to 47-01's S/D/T/L/C"
  - "renderDeviceDetail(builds, dev, transformerItems, { template, extraMethods, expectClean }) returns warnings and error"

requirements-completed: [POL-02, FIX-02]

coverage:
  - id: D1
    description: "Dashboard Recent Builds card opens the full build log from View; a row without a build id shows the placeholder and never requests /logs/build/<index>"
    requirement: POL-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#V1..V7"
        status: pass
      - kind: other
        ref: "NODE_OPTIONS=--openssl-legacy-provider npm run build (bundle carries build-actions, build-no-log)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Navbar rows: buttons only with a build id, static inert rows otherwise, span markup, em-dash status (35 IN-06 markup half)"
    requirement: POL-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#N1..N3,N5,N6"
        status: pass
    human_judgment: false
  - id: D3
    description: "One status mapping on navbar, dashboard, History and Device Build History (OK success, TIMEOUT warning, RUNNING info, FAILED danger)"
    requirement: POL-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#N4,N5"
        status: pass
    human_judgment: false
  - id: D4
    description: "History View p-0 and text-nowrap date cell; Device Build History No build log placeholder"
    requirement: POL-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#H1,H2"
        status: pass
    human_judgment: false
  - id: D5
    description: "36 WR-01 and IN-01: whole-card listener/focus walk with four mutation checks; warnings collected from construction"
    requirement: FIX-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/milestone-v116.cjs (buildHistoryViolations, mutations a-d, IN-01 collision)"
        status: pass
    human_judgment: false
  - id: D6
    description: "36 IN-03 and WR-01 e2e in the Cypress G-36-3 test"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "node --check device-detail.spec.js plus source assertions"
        status: pass
    human_judgment: true
    rationale: "The Vue Cypress suite is red until Phase 48 CI-07 (D-17); the spec runs there, not in this phase"
  - id: D7
    description: "Ledgers: 36-REVIEW-DISPOSITION open: 0 with console commits; ROADMAP Phase 48 Closed in Phase 47 record for 35 IN-06 and IN-07"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "Task 3 verify 3 (grep gates, signed parent commit with exactly the two paths)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Live look of the dashboard actions cell, static navbar rows without hover highlight, and View opening the log from the dashboard"
    requirement: POL-02
    verification: []
    human_judgment: true
    rationale: "Real-browser layout and hover are not observable in the plain-node vnode tests; checked in the 47-03 live UAT after deploy"

duration: 10min
completed: 2026-10-15
status: complete
---

# Phase 47 Plan 02: Build Lists and Phase 36 Review Close-out Summary

**The dashboard Recent Builds card now has an Actions column: the eye-icon `View` link opens the full log in the page's own `BuildLogDialog`, next to the unchanged `Download`. Navbar rows without a build id are static text that sends no request, and the navbar markup is valid inside the button. All four build lists are locked to one status mapping. The Phase 36 Build History guard now fails when a handler or tabindex is added to any cell, `<code>` or badge. Vue warnings are collected from construction, and the Cypress test checks for zero requests before View. Both review ledgers are written.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-15T09:10:11Z
- **Completed:** 2026-10-15T09:20:24Z
- **Tasks:** 3 (Task 1 tracer RED/GREEN, Task 2 RED/GREEN, Task 3 two test commits plus one parent docs commit)
- **Files modified:** 9 console files and 2 parent planning files

## Accomplishments

- **Dashboard (`Visits.vue`, D-13, UI-B11/B13/B15):** the columns are `Time`, `Device`, `Status`, `Actions`. The time cell is `td.text-nowrap`, with no inline style and no muted class. With a `build_id`, `td.actions-cell` holds `span.build-actions` with View (`size sm`, `variant link`, `p-0`, `data-cy=build-open-log`, aria-label `Open build log <id>`, eye glyph) and then the unchanged Download. Without one, the cell holds `span[data-cy=build-no-log]` with the `—` text and `No build log` for screen readers. One `<BuildLogDialog ref="buildLogDialog" />` is the last child of the root, outside the loading branch, and `openBuildLog(build)` hands the row to `open()`. `No builds yet.` is in body colour. The audit card is byte-identical to `31bce2b`.
- **`_build-log.scss`:** `.build-actions { display: inline-flex; align-items: center; gap: 8px; }`.
- **Navbar (`Notifications.vue`, D-14, UI-B12, 35 IN-06):** each row has `data-cy="recent-build"`, `:button="!!build.build_id"`, the class `listGroupItem` plus `listGroupItem--static` without an id, and `v-on="rowListeners(build)"`. `rowListeners` returns a click listener only for a non-empty string `build_id`. The `h6` / `p` became `span.notification-title.text-ellipsis` / `span.notification-meta.deemphasize.text-ellipsis`. The status fallback is `—`. The unused OK-only helper is removed.
- **`Notifications.scss`:** `.notification-title` (block, 4px bottom margin, 1rem, 300), `.notification-meta` (block, .875rem, 400), and `.listGroupItem.listGroupItem--static` (`cursor: default`, hover background transparent). The selector is compound because `ListGroup.scss` loads later with an equally specific hover rule.
- **History (UI-B14):** the build-row View has `class="p-0"` (and keeps `@click.stop`), and the date cell is `class="text-nowrap"`. The audit tab is byte-identical to `31bce2b`.
- **Device Build History (UI-B15):** the muted dash is replaced by the `build-no-log` placeholder. `No build history.` is unchanged.
- **36 WR-01 (D-16):** `buildHistoryViolations(page)` walks the whole card. A node that is not a `build-open-log` button is reported if it has `on` or `nativeOn` listeners, or, under a row, a `tabindex` or `role`. It is empty for `devPage` and `idlessPage`. Every existing Build History assertion is unchanged.
- **36 IN-01 (D-18):** `renderDeviceDetail(builds, dev, transformerItems, options)` installs the warn handler before `new Vue(...)`, runs construction, `loadDevice()` and `_render()` in `try`, and restores the handler in `finally`. It returns `warnings` and `error`.
- **36 IN-03 (D-17):** the G-36-3 Cypress test clicks every cell except the last, asserts `@getBuildDetail.all` length 0, then clicks View, waits, checks the full log and asserts length 1. The comment no longer overstates the final check.

### Mutation evidence (Task 3 acceptance)

Each mutation changed the template (asserted) and was reported by `buildHistoryViolations`. The two rows each carry the mutation, so there are 2 violations each:

| Mutation | Result |
|----------|--------|
| (a) `@click="openBuildLog(build)"` on the Build ID `<td>` | 2 violations: `td listener` |
| (b) `@keydown.enter` on the `<code>` | 2 violations: `code listener` |
| (c) `@click.native` on the status `b-badge` | 2 violations: `b-badge listener` |
| (d) `tabindex="0"` on the date cell | 2 violations: `td tabindex or role` |

IN-01 collision check: an `extraMethods` entry `buildHistory` (a DeviceDetail data key) collects 1 warning, `Method "buildHistory" has already been defined as a data property.`. Before this change, the handler was installed after construction, so that warning was lost.

## Task Commits

Console submodule `services/console`, branch `thinx-staging`, all signed (`G`), not pushed (`origin/thinx-staging..HEAD` = 12):

1. **Task 1 (tracer): dashboard opens the build log**
   - RED `e0e224d` test(vue): expect the dashboard recent builds card to open the build log (POL-02)
   - GREEN `772e928` feat(vue): open the build log from the dashboard recent builds card (POL-02, D-13)
2. **Task 2: navbar rows, markup, status lock, History/Device Detail**
   - RED `e10de49` test(vue): expect static navbar rows, span markup and one status mapping (POL-02, D-14)
   - GREEN `f64a153` fix(vue): static navbar rows without a build id and list markup (D-14, 35 IN-06). **This is the markup fix for Phase 35 IN-06.**
3. **Task 3: Phase 36 review tests and ledgers**
   - `3bc6a4d` test(vue): guard every build history cell and collect construction warnings (36 WR-01, IN-01)
   - `591033e` test(vue): click every build history cell before view and expect no request (36 IN-03)
   - Parent `d87ea327` docs(47-02): record 36 review fixes and 35 IN-06, IN-07 for the FIX-01 ledger (signed, exactly the two record paths, local until 47-03 pushes)

### Findings to commits

| Finding | Fixed by |
|---------|----------|
| 36 WR-01 | console `3bc6a4d` (unit), `591033e` (e2e) |
| 36 IN-01 | console `3bc6a4d` |
| 36 IN-02 | console `38eb95b` (View only with a build id), `002e051` (id-only `open()`, 47-01) |
| 36 IN-03 | console `591033e` (runs with Phase 48 CI-07) |
| 35 IN-06 | console `38eb95b` (RUNNING colour), `f64a153` (span markup) |
| 35 IN-07 | console `002e051` (47-01) |

### RED evidence

- Task 1 RED (`e0e224d`): V1..V7 all failed. The failures were `Expected values to be strictly deep-equal` (header `Download`), `td.actions-cell`, `exactly one build-no-log placeholder (found 0)`, `row 0 time cell text-nowrap`, `exactly one BuildLogDialog (found 0)`, `Visits has openBuildLog` and `.build-actions has a rule`. Exit 1.
- Task 2 RED (`e10de49`): N1, N2, N3, N5, N6, H1 and H2 failed. The failures were `three recent-build rows`, `exactly one notification-meta (found 0)`, `Notifications.vue compares no status with OK`, `.notification-title has a rule`, `View has class p-0` and `exactly one build-no-log placeholder`. Exit 1. N4 (the status mapping lock) already passed, because console `38eb95b` landed the shared mapping on all four lists. It stays as a regression lock, as L3 did in 47-01.

## Verification

- `npm --prefix services/console/vue run test:unit` exits 0 under both `LC_ALL=C` and the default locale, with 0 `FAIL` lines. `build-log-search.cjs` reports 44 `ok`, and `milestone-v116.cjs` prints the mutation and collision lines and then its pass line.
- Task 1 verify 2: no `text-muted`, inline nowrap or `<th>Download</th>` in the card. `build-open-log` and `build-no-log` each appear once, and the dialog once. The `.build-actions` rule is present and the build passes. The bundle carries `build-actions` (CSS) and `build-no-log` (JS).
- Task 2 verify 2: no old navbar markup, `'UNKNOWN'` or `isSuccess`. `rowListeners(build)` and `.notification-title` are present. No OK comparison or literal badge variant appears in the four files. The History build-row date cell is `text-nowrap`, and Device Detail has one non-muted placeholder.
- Task 3 verify 2 and 3: `nativeOn`, `buildHistoryViolations` and `finally` are present. The Cypress spec parses, has one length-0 and one length-1 check and no first-cell-only click or old comment. The disposition reads `open: 0` with four `fixed (console …)` rows, and the ROADMAP has the Closed in Phase 47 block. The parent commit is signed with exactly the two paths.
- Task 3 verify 4: the build passes and the bundle carries `listGroupItem--static` (JS) and `notification-title` (CSS). `test:csp:dist` passes. `perf:spotter` reports JS 7.10 MiB raw / 2.78 MiB gzip and CSS 621.17 KiB raw / 90.56 KiB gzip, and all budgets pass.
- Acceptance: `git diff --name-only 31bce2b HEAD` lists exactly the fourteen Phase 47 console paths. Every console commit in `31bce2b..HEAD` is signed, `git status --porcelain -- vue src` is empty, and nothing is pushed.

## Files Created/Modified

- `services/console/vue/src/pages/Visits/Visits.vue`: Actions cell, placeholder, `BuildLogDialog`, `openBuildLog`.
- `services/console/vue/src/styles/_build-log.scss`: `.build-actions`.
- `services/console/vue/src/components/Notifications/Notifications.vue`: `rowListeners`, static rows, span markup, em dash, OK-only helper removed.
- `services/console/vue/src/components/Notifications/Notifications.scss`: title, meta and static-row rules.
- `services/console/vue/src/pages/History/History.vue`: View `p-0`, date cell `text-nowrap`.
- `services/console/vue/src/pages/Devices/DeviceDetail.vue`: `build-no-log` placeholder.
- `services/console/vue/tests/unit/build-log-search.cjs`: V1..V7, N1..N6, H1, H2.
- `services/console/vue/tests/unit/milestone-v116.cjs`: `renderDeviceDetail` options and warn handler, `buildHistoryViolations`, mutations, the placeholder check and the IN-01 collision check.
- `services/console/vue/cypress/integration/device-detail.spec.js`: G-36-3 clicks every cell, then checks 0 and then 1 requests.
- `.planning/milestones/v1.16-phases/36-build-log-access/36-REVIEW-DISPOSITION.md`: all four findings fixed, `open: 0`.
- `.planning/workstreams/vue-console/ROADMAP.md`: Phase 48 `Closed in Phase 47` block.

## Decisions Made

- `rowListeners` accepts only a non-empty string `build_id`, the same rule as the dialog's `open()`, so the navbar and the dialog agree on what counts as a build id.
- V5 also checks that the dialog renders while the page is loading, which proves it sits outside the loading branch.
- The View aria-label `Open build log <id>` does not contain the visible word `View`. That is a WCAG 2.5.3 label-in-name gap, and the UI-SPEC E6 line claiming the label "starts with the visible text" is wrong. The copy is locked by D-13, and the same button already ships on History and Device Detail, so it was not changed here. Candidate for the Phase 48 accessibility items, for example `View build log <id>`.

## Deviations from Plan

### Test authoring corrections (no production-code deviation)

**1. V2 asserted a label-in-name property the locked copy cannot meet**
- **Found during:** Task 1 GREEN
- **Issue:** I had added an assertion that the aria-label starts with the visible text, based on the UI-SPEC E6 line. With the locked `View` / `Open build log b1` copy it can never pass, on the dashboard or on the existing History and Device Detail buttons.
- **Fix:** replaced it with "the build id appears only in the aria-label, not in the visible text". The gap is recorded under Decisions Made.
- **Files modified:** `vue/tests/unit/build-log-search.cjs`
- **Commit:** `772e928` (noted in its message)

**2. N6 expected the literal `transparent`**
- **Found during:** Task 2 GREEN
- **Issue:** compressed Dart Sass writes `transparent` as `rgba(0,0,0,0)`, so the rule existed and was correct but failed the exact-string check.
- **Fix:** N6 accepts either form for the static-row hover background.
- **Files modified:** `vue/tests/unit/build-log-search.cjs`
- **Commit:** `f64a153` (noted in its message)

**Total deviations:** 0 code deviations; 2 test-authoring corrections made before their GREEN commits. **Impact:** none on the delivered behaviour.

## Issues Encountered

None.

## Known Stubs

None. The stub scan of the changed source files found no TODO, FIXME, placeholder copy or unwired data. The `—` placeholder is the UI-B15 contract.

## Threat Flags

None. No new endpoint, auth path, storage or raw-HTML binding was added; the new spans keep the same text interpolations. T-47-07 is covered by N3..N5, T-47-08 by unchanged interpolation, T-47-09 by V3, V6, N1 and H2, and T-47-10 by the ledger commits and mutations (a)..(d).

## User Setup Required

None.

## Next Phase Readiness

- 47-03 ships: push console `thinx-staging` (12 commits ahead, 47-01 and 47-02), then bump and push the parent gitlink. The parent docs commit `d87ea327` and this SUMMARY are local until then. The parent `services/console` gitlink is still unstaged on purpose.
- Live UAT after deploy (D8): the dashboard View opens the log, View and Download sit 8px apart without wrapping, and static navbar rows have no hover highlight or pointer.
- Phase 48: run the G-36-3 Cypress spec with CI-07, and consider the View label-in-name item.

## Self-Check: PASSED

- FOUND: Visits.vue, _build-log.scss, Notifications.vue, Notifications.scss, History.vue, DeviceDetail.vue, build-log-search.cjs, milestone-v116.cjs, device-detail.spec.js, 36-REVIEW-DISPOSITION.md, ROADMAP.md
- FOUND (ancestors of console HEAD): e0e224d, 772e928, e10de49, f64a153, 3bc6a4d, 591033e
- FOUND (ancestor of parent HEAD): d87ea327

---
*Phase: 47-build-log-search-status-colours*
*Completed: 2026-10-15*
