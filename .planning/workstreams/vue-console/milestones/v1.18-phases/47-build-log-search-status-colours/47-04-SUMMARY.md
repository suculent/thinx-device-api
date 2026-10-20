---
phase: 47-build-log-search-status-colours
plan: 04
subsystem: ui
tags: [vue, console, ui, build-log, accessibility, wcag-2.5.3, review-fixes, gap-closure]

requires:
  - phase: 47-03
    provides: "Console 591033e shipped (build log search, build lists, status mapping, Phase 36 fixes)"
provides:
  - "hasBuildLog(build) in src/utils/buildLog.js: the one rule for whether a row has a build log (non-empty string build_id only)"
  - "BuildLogDialog.open() refuses every row that fails hasBuildLog; search field has no unused ref (IN-03)"
  - "Dashboard, History, Device Build History and navbar decide every build-log control via hasBuildLog (WR-01)"
  - "View aria-label 'View build log <id>' on the three tables, starting with the visible text 'View' (WCAG 2.5.3, gap UI E6)"
  - "History rows without a build log: no build-row class, no click listener, No build log placeholder (WR-02, UI-REVIEW fix 1)"
  - "Six signed console commits on thinx-staging, 591033e..54734af, not pushed"
affects: [47-05, 47-verification, 48]

actuals:
  tokens: 9107
  tasks: 3
  commits: 6
# Measured in the services/console submodule, where every code commit of this plan lives:
# git -C services/console rev-list --count 591033e..54734af = 6
commits_repo: services/console
plan_head_before: 591033e483511949d14c3a37f48f301321d2a1de
plan_head_after: 54734afc0992bf743d65064f13c90e2ad01a5503

tech-stack:
  added: []
  patterns:
    - "One exported predicate decides a UI affordance across every list and the dialog; templates register it in methods, scripts call the import"
    - "Agreement matrices (V8, H4, N7, P2) render each list with one fixture row per candidate id type and assert the control appears exactly when the predicate is true"

key-files:
  created: []
  modified:
    - services/console/vue/src/utils/buildLog.js
    - services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue
    - services/console/vue/src/pages/Visits/Visits.vue
    - services/console/vue/src/pages/History/History.vue
    - services/console/vue/src/components/Notifications/Notifications.vue
    - services/console/vue/src/pages/Devices/DeviceDetail.vue
    - services/console/vue/tests/unit/build-log-search.cjs
    - services/console/vue/tests/unit/milestone-v116.cjs
    - services/console/vue/tests/unit/transformers-enviros.cjs
    - services/console/vue/cypress/integration/device-detail.spec.js

key-decisions:
  - "hasBuildLog returns a strict boolean: !!build && typeof build.build_id === 'string' && build.build_id !== '' (a whitespace-only id passes, per the operator's non-empty-string rule)"
  - "The parent gitlink is left unstaged (services/console shows M): 47-05 records and ships the console range, as the plan states"
  - "RED evidence is the suites' own ok/FAIL line format plus exit code; the GSD tdd-red-evidence classifier has no adapter for it, so each RED was checked by hand (named target check, failing on the planned assertion, page rendering cleanly)"

patterns-established:
  - "Build-log controls: any new build list must gate View/click through hasBuildLog and bind :aria-label=\"'View build log ' + <row>.build_id\"; P3 enforces this for the five current components"

requirements-completed: [BUILD-03, POL-02, FIX-02]

coverage:
  - id: D1
    description: "hasBuildLog predicate: true only for a non-empty string build_id, boolean result (P1 truth table)"
    requirement: POL-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#P1"
        status: pass
    human_judgment: false
  - id: D2
    description: "BuildLogDialog.open() shows the modal and dispatches fetchBuildDetail exactly when hasBuildLog(row); search-field ref removed"
    requirement: BUILD-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#P2"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#C3"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#L1"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dashboard Recent Builds: View/Download exactly when hasBuildLog, placeholder otherwise; View aria-label View build log <id> starts with the visible text"
    requirement: POL-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#V2"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#V8"
        status: pass
    human_judgment: false
  - id: D4
    description: "History rows: build-row class, row click and View only with a build log; No build log placeholder otherwise; 35 WR-01 row semantics unchanged"
    requirement: POL-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#H1"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#H3"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#H4"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/milestone-v116.cjs (35 WR-01 History row block)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Navbar rows: button, click listener and non-static class exactly when hasBuildLog"
    requirement: POL-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#N7"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#N1"
        status: pass
    human_judgment: false
  - id: D6
    description: "Device Build History on hasBuildLog with the new label; non-string ids render placeholders; Build History walk, mutations (a)-(d) and IN-01 still report"
    requirement: FIX-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/milestone-v116.cjs (devPage, oddPage, mutation and IN-01 checks)"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#H2"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#P3"
        status: pass
    human_judgment: false
  - id: D7
    description: "Production build carries View build log and not the old wording; test:csp:dist and perf:spotter pass"
    requirement: BUILD-03
    verification:
      - kind: other
        ref: "NODE_OPTIONS=--openssl-legacy-provider npm --prefix services/console/vue run build && grep (View build log 3, build-no-log 3, old wording 0); test:csp:dist; perf:spotter"
        status: pass
    human_judgment: false
  - id: D8
    description: "Cypress G-36-2 pins the new aria-label value (runs with Phase 48 CI-07, not run here)"
    requirement: FIX-02
    verification:
      - kind: other
        ref: "node --check services/console/vue/cypress/integration/device-detail.spec.js"
        status: pass
    human_judgment: true
    rationale: "The Cypress spec was only syntax-checked; it runs in the Phase 48 CI-07 browser job, not in this plan"

duration: 10min
completed: 2026-10-15
status: complete
---

# Phase 47 Plan 04: Build Log Predicate and View Label Gap Closure Summary

**One `hasBuildLog(build)` predicate (non-empty string `build_id` only) now gates the build-log dialog, the dashboard, History, Device Build History and the navbar. The View buttons are announced as "View build log <id>", so the accessible name starts with the visible word "View" (WCAG 2.5.3). History rows without a build log lose the pointer and the row click, and show the No build log placeholder instead.**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-15T10:42:30Z
- **Completed:** 2026-10-15T10:52Z
- **Tasks:** 3 (three RED/GREEN pairs)
- **Files modified:** 10 (console submodule), 263 insertions, 33 deletions

## Accomplishments

- `src/utils/buildLog.js` exports `hasBuildLog(build)`. It returns a strict boolean, true only when `build_id` is a non-empty string. `BuildLogDialog.open()` returns `Promise.resolve()` for every other row, before any state change or dispatch (D-15, WR-01).
- On the dashboard, History, Device Build History and the navbar, the View button, the navbar button row, the History row class and the History row listener all render exactly when `hasBuildLog(row)` is true. A number, `true`, object or array id now gets the placeholder or a static row, never a focusable control that does nothing (WR-01).
- The View aria-label is `View build log {build_id}` on all three tables, and the visible text stays `View`. No `.vue` or `.js` file under `vue/src` and no built bundle contains the old wording (closes 47-VERIFICATION gap UI E6).
- History: a row without a build log has no `build-row` class and no click listener. Its Log cell holds the `build-no-log` placeholder as the View `v-else` (WR-02, UI-REVIEW top fix 1). `onBuildRowClick` and the Audit Log tab are byte-identical to 591033e.
- The unused `ref="searchInput"` is gone from the dialog's search field (IN-03).

## Task Commits

All commits are in `services/console` on `thinx-staging`. Each is signed (`%G?` = G) and none is pushed.

| # | Commit | Type | Subject | Finding |
|---|--------|------|---------|---------|
| 1 RED | `b1edab2` | test | expect one build log predicate for the dialog and dashboard (WR-01) | WR-01, E6, IN-03 (tests) |
| 1 GREEN | `83cc7cc` | fix | one build log predicate and view build log label on the dashboard (WR-01, IN-03) | **WR-01**, **IN-03**, **E6 relabel** |
| 2 RED | `102929b` | test | expect history and navbar rows to follow the build log predicate (WR-01, WR-02) | WR-01, WR-02 (tests) |
| 2 GREEN | `9daa778` | fix | history and navbar rows follow the build log predicate (WR-01, WR-02) | **WR-01**, **WR-02**, **E6 relabel**, UI-REVIEW fix 1 |
| 3 RED | `389a5d0` | test | expect device build history on the build log predicate and new label (WR-01) | WR-01, E6 (tests) |
| 3 GREEN | `54734af` | fix | device build history follows the build log predicate (WR-01) | **WR-01**, **E6 relabel** |

For 47-05 (47-REVIEW-DISPOSITION.md):
- WR-01: `83cc7cc`, `9daa778`, `54734af`
- WR-02: `9daa778`
- IN-03: `83cc7cc`
- E6 relabel: `83cc7cc`, `9daa778`, `54734af`

Console range: `591033e..54734af` (6 commits). The parent gitlink `services/console` is modified in the working tree but was not committed. 47-05 bumps and ships it.

## RED Evidence

Each RED run exited non-zero, and the failing lines were the planned target checks. The GSD `tdd-red-evidence` classifier only parses TAP, JUnit, swift-testing and unittest output, and these suites print their own `ok`/`FAIL` lines, so each RED was assessed by hand. In every case the named target ran and failed on its planned assertion, every other check stayed `ok`, and there were no load, syntax or render errors.

**Task 1 RED** (`LC_ALL=C npm --prefix services/console/vue run test:unit`, exit 1):
```
FAIL C3 sources: ... no local styles or forbidden strings (BuildLogDialog.vue has no ref="searchInput")
FAIL V2 a row with a build id: View (link, p-0, eye, aria-label) then Download ... (Expected values to be strictly equal:)
FAIL V8 dashboard agreement: View and Download exactly when hasBuildLog(row), the placeholder otherwise (hasBuildLog is exported from utils/buildLog.js)
FAIL P1 hasBuildLog is true only for a non-empty string build_id and always returns a boolean (hasBuildLog is exported from utils/buildLog.js)
FAIL P2 open() agrees with hasBuildLog: modal and one fetchBuildDetail exactly for rows that pass it (hasBuildLog is exported from utils/buildLog.js)
```
Assessment: V2 failed on the label value (`Open build log b1` vs `View build log b1`). P1, P2 and V8 failed on their first planned assertion, that the predicate is exported. C3 failed on the IN-03 ref.

**Task 2 RED** (same command, exit 1):
```
FAIL H1 History build row: View gated by hasBuildLog ... (View is gated by hasBuildLog(item))
FAIL H3 History: only a row with a build log is a pointer row with a click; ... (Expected values to be strictly equal:)
FAIL H4 History agreement: ... (row 1 (build_id "") build-row class)
FAIL N7 navbar agreement: ... (row 5 (build_id 42) has no button attribute)
```
Assessment: a probe run with full messages showed that H3 fails on `+ 'Open build log b1'`, the label assertion, after History rendered cleanly with the real `normPaging`. H4 fails on the static class. N7 fails because the navbar's `!!build.build_id` makes the `42` row a button.

**Task 3 RED** (run separately, because the `&&` chain stops at milestone-v116):
- `node tests/unit/milestone-v116.cjs` exits 1 with `AssertionError: View button names its build` (actual `'Open build log build-1'`, expected `'View build log build-1'`). A probe with the label pins reverted showed the new non-string id check failing on its own: `only the string build id gets a View button` (actual 3, expected 1).
- `node tests/unit/build-log-search.cjs` exits 1:
```
FAIL H2 Device Build History: View gated by hasBuildLog ... (View is gated by hasBuildLog(build))
FAIL P3 sources: the five components decide only through hasBuildLog; ... (pages/Devices/DeviceDetail.vue calls hasBuildLog)
```

## GREEN Verification

- `LC_ALL=C npm --prefix services/console/vue run test:unit` exits 0, and so does the run without `LC_ALL=C`. Each prints 375 `ok` lines and 0 `FAIL` lines.
- milestone-v116 GREEN output for the Build History guards (unchanged from before):
```
WR-01 mutation (a) click handler on the Build ID cell: 2 violation(s), td listener
WR-01 mutation (b) keydown Enter handler on the <code>: 2 violation(s), code listener
WR-01 mutation (c) @click.native on the status badge: 2 violation(s), b-badge listener
WR-01 mutation (d) tabindex on the date cell: 2 violation(s), td tabindex or role
IN-01 collision check: 1 warning(s) collected, first: Method "buildHistory" has already been defined as a data property.
```
- Task 3 source lock: all five components call `hasBuildLog(` and none keeps its own id test. Nothing under `vue/src` contains the old wording. There are exactly 3 `data-cy="build-open-log" :aria-label="'View build log ' + ` bindings in `pages/`. The Cypress spec parses. The Legacy `src/` tree is unchanged since 591033e.
- Production build (`NODE_OPTIONS=--openssl-legacy-provider`) passes, and so do `test:csp:dist` (enforced script policy) and `perf:spotter` ("All performance budgets passed"). Modern bundle markers: `View build log` 3, `build-no-log` 3, `Open build log` 0, `ref="searchInput"` 0, `class="build-row"` 0. The old wording is also absent from the legacy bundle.
- Acceptance criteria:
  - Task 1: the audit card is byte-identical; the HEAD~2 file set is exact; both commits show G.
  - Task 2: the Audit Log tab and `onBuildRowClick` are byte-identical; the HEAD~2 file set is exact; both commits show G.
  - Task 3: the ten-path diff set against 591033e is exact; all six commits show G; `vue src` status is clean; origin/thinx-staging is still 591033e (nothing pushed); the three mutation anchors are unchanged.
- Tracer gate (Task 1): auto-advance is off and human_verify_mode is end-of-phase with automated-only verify, so the tracer verify was re-run. It passed, and execution continued to Tasks 2 and 3 without a checkpoint.

## Files Created/Modified

- `vue/src/utils/buildLog.js`: adds `export function hasBuildLog(build)`.
- `vue/src/components/BuildLogDialog/BuildLogDialog.vue`: `open()` is guarded by `hasBuildLog`; the search `b-form-input` has no ref.
- `vue/src/pages/Visits/Visits.vue`: `hasBuildLog` method; actions span gated by `hasBuildLog(item)`; new aria-label.
- `vue/src/pages/History/History.vue`: `hasBuildLog` and `rowListeners(build)` methods; dynamic `build-row` class with `v-on="rowListeners(item)"`; View gated by the predicate with the new label and no name fallback; `build-no-log` placeholder.
- `vue/src/components/Notifications/Notifications.vue`: `hasBuildLog` method; the static class, `button` prop and `rowListeners` all decide through it.
- `vue/src/pages/Devices/DeviceDetail.vue`: `hasBuildLog` method; View gated by it with the new label; the template comment names the button "View".
- `vue/tests/unit/build-log-search.cjs`:
  - New: the `idRows()` fixture and checks P1, P2, P3, V8, H3, H4 and N7.
  - Updated: V2, H1, H2 and C3.
  - Loaders: `hasBuildLog` is passed to all five `loadSfc` calls, and History loads with the real `normPaging`.
- `vue/tests/unit/milestone-v116.cjs`: `hasBuildLog` added to the `load()` deps; label pins and the starts-with rule; a non-string id render check (`oddPage`).
- `vue/tests/unit/transformers-enviros.cjs`: `hasBuildLog` added to the DeviceDetail loader deps.
- `vue/cypress/integration/device-detail.spec.js`: G-36-2 now pins `View build log build-1`. Test titles are unchanged.

## Decisions Made

- Fixed IN-03 together with WR-01 in the Task 1 GREEN commit, as the plan says.
- Left the `Open build log` wording in test titles and assertion messages in `milestone-v116.cjs` (for example "Open build log control is a b-button") and in the Cypress test title. They describe the control, P3 only scans `vue/src`, and the plan says to keep test titles unchanged.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered

None.

## Known Stubs

None. The `—` / "No build log" placeholders are the intended UI-B15 copy, not stubs.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

Ready for 47-05. It records the console commit ids above in 47-REVIEW-DISPOSITION.md, updates UI-SPEC and the 47-02 truths for the new label, bumps the parent gitlink to `54734af`, and ships. Bundle markers to expect live: `View build log` at least 3, `build-no-log` at least 3, the old wording 0, the search-field ref 0, the static `build-row` class 0.

## Self-Check: PASSED

- All 10 modified files exist on disk.
- All six console commits (`b1edab2`, `83cc7cc`, `102929b`, `9daa778`, `389a5d0`, `54734af`) are ancestors of console HEAD and signed (G).
- Every task acceptance criterion and the plan-level verification passed (see GREEN Verification).
