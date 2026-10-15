---
phase: 47-build-log-search-status-colours
plan: 01
subsystem: ui
tags: [vue, console, ui, build-log, search, accessibility, icon-button, scss]

requires:
  - phase: 44
    provides: "IconButton (icon, label as aria-label and hover tip, inheritAttrs off)"
  - phase: 36
    provides: "BuildLogDialog with the requestId stale guard and buildLogText()"
provides:
  - "buildLogSearch(text, term, limit = 1000) -> { segments, count, capped } in utils/buildLog.js"
  - "BuildLogDialog search bar: field, count with live text, Previous/Next match IconButtons"
  - "Text-only highlighted segments, wrap-around stepping, Enter/Shift+Enter, centred log-box scroll"
  - "BuildLogDialog.open() takes only a non-empty string build_id; onHidden resets loading and the debounce"
  - "src/styles/_build-log.scss (imported after settings-pages) and six !default build-log colour tokens"
  - "tests/unit/build-log-search.cjs (S, D, T, L, C checks) chained in test:unit, for 47-02 to extend"
affects: [47-02, 47-03, 48]

actuals:
  tokens: 14593
  tasks: 3
  commits: 6
plan_head_before: 31bce2b13ea016c46200ae8eb9a0ca2b9956998a
plan_head_after: 002e051260472b5245e5b8ce83bc6e4c5c9b58cc

tech-stack:
  added: []
  patterns:
    - "Literal search via new RegExp(escapeRegExp(term), 'gi') on the original text, never lower-case + indexOf"
    - "Highlights as v-for text segments inside one single-line <pre> (whitespace in <pre> is log text)"
    - "Plain setTimeout debounce held in component data, cancelled on open, hide and destroy"
    - "Scroll a match into view by setting only the container's scrollTop (no scrollIntoView)"

key-files:
  created:
    - services/console/vue/src/styles/_build-log.scss
    - services/console/vue/tests/unit/build-log-search.cjs
  modified:
    - services/console/vue/src/utils/buildLog.js
    - services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue
    - services/console/vue/src/styles/_variables.scss
    - services/console/vue/src/styles/theme.scss
    - services/console/vue/tests/unit/milestone-v116.cjs
    - services/console/vue/package.json

key-decisions:
  - "The searchInput watcher skips the debounce when the input equals the applied term, so open() resetting both to '' starts no timer and typing back to the current term keeps the selection"
  - "The error alert renders the literal 'Could not load this build log.' instead of {{ error }}; load() still stores the same string, which milestone-v116 asserts"
  - "Console commit 002e051 fixes Phase 35 IN-07 and Phase 36 IN-02 at the dialog (47-02 records it in the ledgers)"

patterns-established:
  - "build-log-search.cjs check prefixes S/D/T/L/C; 47-02 adds V/N/H"
  - "Phase 47 rules live in _build-log.scss; 47-02 appends .build-actions there"

requirements-completed: [BUILD-03, POL-02, FIX-02]

coverage:
  - id: D1
    description: "Plain-text, case-insensitive, literal, capped (1000) search helper whose segments rebuild the log exactly"
    requirement: BUILD-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#S1..S6"
        status: pass
    human_judgment: false
  - id: D2
    description: "Search bar (role=search, field, count, live text) only while log text shows; highlighted text-only segments; 200 ms debounce"
    requirement: BUILD-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#D1..D7"
        status: pass
    human_judgment: false
  - id: D3
    description: "Previous/Next match IconButtons, wrap-around stepping, Enter/Shift+Enter, current-match marking and centred log-box scroll"
    requirement: BUILD-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#T1..T8"
        status: pass
    human_judgment: false
  - id: D4
    description: "Id-only open(), search reset on open and kept on Try again, onHidden loading reset, error/empty/loading states"
    requirement: POL-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#L1..L5"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/milestone-v116.cjs (dialog load and error checks)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Build-log tokens and _build-log.scss compiled into the theme; local dialog styles removed"
    requirement: FIX-02
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/build-log-search.cjs#C1..C3"
        status: pass
      - kind: other
        ref: "npm --prefix services/console/vue run build && test:csp:dist && perf:spotter"
        status: pass
    human_judgment: false
  - id: D6
    description: "Backstop: 5 MB log with >1000 matches, 20,000-character unbroken line with a match and an <img onerror> line, 375px and 1280px bar layout"
    requirement: BUILD-03
    verification: []
    human_judgment: true
    rationale: "Real-browser layout, wrapping and scroll behaviour on large logs is not observable in the plain-node vnode tests; checked in the 47-03 live UAT after deploy"

duration: 12min
completed: 2026-10-15
status: complete
---

# Phase 47 Plan 01: Build Log Search Summary

**The full build log dialog now has browser-find search: a 3-character, case-insensitive literal match with amber text-only highlights capped at 1000, a `3 / 17` count with a live region, Previous/Next match IconButtons with wrap and Enter/Shift+Enter, and a scroll that centres the current match. The dialog also refuses any row without a real `build_id` and resets `loading` on close.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-15T08:55:18Z
- **Completed:** 2026-10-15T09:07:24Z
- **Tasks:** 3 (each RED then GREEN, 6 signed console commits)
- **Files modified:** 8 (console submodule; 1150 insertions, 12 deletions since `31bce2b`)

## Accomplishments

- `buildLogSearch(text, term, limit = 1000)` in `utils/buildLog.js`: it escapes the term into a literal `gi` RegExp and walks the original text, so indices stay aligned (U+0130 case). Matches never overlap and the walk cannot loop on an empty match. It stops at the 1001st match, sets `capped` and leaves the rest of the log as one plain segment.
- `BuildLogDialog.vue` search bar (UI-B01/B05): `role=search`, an addon field with placeholder `Search log (3+ characters)`, a count (`3 / 17`, `1 / 1000+`, `No matches`) with an `aria-live=polite` spoken form, and `fa-chevron-left/right` IconButtons that are disabled without a match. The bar renders only while log text is shown.
- Highlights are `mark.build-log-match` / `span` text interpolations inside one single-line `<pre>`. A log containing `<b>x</b> abc <script>` renders as text with exactly one mark, and the dialog has no `v-html`, `innerHTML` or `domProps`.
- Stepping: `step(±1)` wraps at both ends. Enter steps forward and Shift+Enter back, and Enter during a pending debounce applies the term instead of stepping. Escape is left to the modal. The current mark carries `build-log-match--current` and `aria-current="true"` and is centred by setting only the `<pre>`'s `scrollTop` on the next tick.
- Lifecycle (D-12, D-15, 35 IN-07): `open()` returns `Promise.resolve()` for an empty, missing or non-string `build_id` without showing the modal, changing state or dispatching. A valid open resets the search and cancels the debounce. Try again keeps the term. `@hidden="onHidden"` bumps `requestId`, sets `loading = false` and cancels the debounce, and `beforeDestroy` cancels it too.
- States (UI-B09): the danger alert reads `Could not load this build log.` and has a `Try again` default button with the `fa-refresh` glyph. The empty line is `p.mb-0` in body colour, and exactly one state renders.
- Styles: six `!default` tokens in `_variables.scss` and a new `_build-log.scss`, imported right after `settings-pages`. The dialog's scoped `<style>` with hard-coded `#1e1e1e` / `#ddd` is gone.

## Task Commits

All in the console submodule `services/console`, branch `thinx-staging`, signed (`G`), not pushed:

1. **Task 1 (tracer): live search with highlighted matches**
   - RED `58660dc` test(vue): add failing build log search checks (BUILD-03)
   - GREEN `e48608b` feat(vue): live search with highlighted matches in the build log (BUILD-03, D-05)
2. **Task 2: stepping, wrap and scroll**
   - RED `4078f46` test(vue): expect build log match stepping and scroll (BUILD-03, D-03, D-04)
   - GREEN `47aace4` feat(vue): step through build log matches with wrap and scroll (D-03, D-04, D-09)
3. **Task 3: id-only open, close reset, states, styles**
   - RED `a1b475a` test(vue): expect id-only build log open, states and log styles (D-15, D-08)
   - GREEN `002e051` fix(vue): open build logs by build id only, reset on close, search styles (D-15, 35 IN-07)

**Phase 35 IN-07 and Phase 36 IN-02 are fixed by console commit `002e051`** (47-02 records it in the Phase 36 disposition ledger and the Phase 48 FIX-01 record).

### RED evidence

- Task 1 RED (`58660dc`): S1..S6 failed with `buildLogSearch is exported from utils/buildLog.js` and D1..D7 failed with no bar, no `build-log-match` and no debounce (`exactly one build-log-search-bar (found 0)`, `0 !== 2` marks, `+ [] - ['ERROR','error']`). Exit 1.
- Task 2 RED (`4078f46`): T1..T8 failed (`four blocks in the bar`, `step method`, `mark 1 current class`, `the field has a keydown handler`, `scrollToCurrent method`, `exactly one build-log-next IconButton (found 0)`, `term: scrolled after the tick`). Exit 1.
- Task 3 RED (`a1b475a`): L1, L2, L4, L5 and C1..C3 failed (`modal not shown for {"build_id":""}`, `searchInput reset`, `onHidden method`, the states deep-equal, `.build-log-text has a rule`, `.build-log-search has a rule`, `$build-log-bg: #1E1E1E !default`). Exit 1. L3 (Try again keeps the term) already passed on the Task 2 tree because `load()` never touched the search state. It stays as a regression lock.

## Verification

- `node vue/tests/unit/build-log-search.cjs`: 29 `ok`, 0 `FAIL`.
- `npm --prefix services/console/vue run test:unit` exits 0 under both `LC_ALL=C` and the default locale, with 0 `FAIL` lines. `milestone-v116.cjs` passes.
- Grep gates: no `v-html`, `innerHTML`, `build.id`, `text-muted`, `>Retry<`, `<style` or `console.` in the dialog. `@hidden="onHidden"` and `build-log-retry` are present. `@import 'build-log';` appears exactly once, right after `settings-pages`. All six tokens are `!default`. No `scrollIntoView`, no `toLowerCase().indexOf`, no `export const` in `buildLog.js`.
- `NODE_OPTIONS=--openssl-legacy-provider npm run build` succeeds. The bundle carries `build-log-search-bar`, the placeholder, `Previous match`, `Next match`, `build-log-retry` and `build-log-empty`, and the CSS carries `build-log-match--current` and `build-log-search__count`.
- `test:csp:dist` PASS. `perf:spotter`: JS 7.10 MiB raw / 2.78 MiB gzip, CSS 620.74 KiB raw / 90.52 KiB gzip, 6 initial assets, all budgets passed.
- The diff since `31bce2b` touches exactly the eight plan paths. All six commits are signed, `git status --porcelain -- vue src` is empty, and `origin/thinx-staging..HEAD` = 6 (nothing pushed).

## Files Created/Modified

- `services/console/vue/src/utils/buildLog.js`: `buildLogSearch` plus the non-exported `escapeRegExp`.
- `services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue`: the search bar, segments, stepping, scroll, id-only `open`, `onHidden`, the states, and no local styles.
- `services/console/vue/src/styles/_build-log.scss` (new): `.build-log-search*`, `.build-log-text`, `.build-log-match*`.
- `services/console/vue/src/styles/_variables.scss`: six build-log colour tokens.
- `services/console/vue/src/styles/theme.scss`: `@import 'build-log';`.
- `services/console/vue/tests/unit/build-log-search.cjs` (new): the S/D/T/L/C checks with a copied harness, including the Sass helpers.
- `services/console/vue/tests/unit/milestone-v116.cjs`: the dialog loads with `buildLogSearch` and `IconButton`.
- `services/console/vue/package.json`: `build-log-search.cjs` is chained once at the end of `test:unit`.

## Decisions Made

- The `searchInput` watcher returns without a timer when the input already equals the applied term. `open()` resetting both to `''` therefore starts no debounce, and typing back to the current term keeps the current match.
- The error alert shows the literal copy rather than `{{ error }}`. `load()` still stores the same string, which milestone-v116 asserts.
- Two small helper methods were added beyond the plan's list: `selectFirst()` (current = 0, then scroll on the next tick, shared by the `term` and `text` watchers) and `cancelDebounce()` (shared by the watcher, Enter, `open`, `onHidden` and `beforeDestroy`).

## Deviations from Plan

None. The plan was executed as written. One test-only correction before the Task 2 RED commit: T3 first compared a missing `aria-current` strictly with `null`. That would have failed for the wrong reason on the RED tree and passed only by accident on GREEN, so it now treats both `null` and absent as "no attribute". This is test authoring, not a code deviation.

## Issues Encountered

None.

## Known Stubs

None. The `placeholder=` hit in the stub scan is the search field's placeholder attribute, which the UI contract requires.

## Threat Flags

None. No new network endpoint, auth path or storage was added. The search term and log text stay in the dialog's component state (no request, store, storage, URL or console write). T-47-01..T-47-06 mitigations are implemented and covered by D4, S2/S4, L1, L2 and L4.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- 47-02 can extend `build-log-search.cjs` (V/N/H prefixes) and append `.build-actions` to `_build-log.scss`. Its ledger entries for 35 IN-07 and 36 IN-02 should cite console commit `002e051`.
- 47-03 ships: the console `thinx-staging` push and the parent gitlink bump. The parent working tree shows `services/console` as modified (gitlink at `002e051`), which this plan deliberately did not stage or commit.
- Backstop UAT after deploy (D6): a large log with more than 1000 hits, a long unbroken line, an `<img onerror>` line, and the 375px / 1280px bar layout.

## Self-Check: PASSED

- FOUND: vue/src/utils/buildLog.js, vue/src/components/BuildLogDialog/BuildLogDialog.vue, vue/src/styles/_build-log.scss, vue/src/styles/_variables.scss, vue/tests/unit/build-log-search.cjs
- FOUND (ancestors of console HEAD): 58660dc, e48608b, 4078f46, 47aace4, a1b475a, 002e051

---
*Phase: 47-build-log-search-status-colours*
*Completed: 2026-10-15*
