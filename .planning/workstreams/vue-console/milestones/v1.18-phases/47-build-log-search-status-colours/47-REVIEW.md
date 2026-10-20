---
phase: 47-build-log-search-status-colours
reviewed: 2026-10-15T11:16:13Z
depth: standard
files_reviewed: 10
files_reviewed_list:
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
findings:
  critical: 0
  warning: 0
  info: 9
  total: 9
status: issues_found
---

# Phase 47: Code Review Report (incremental re-review after 47-04 / 47-05)

**Reviewed:** 2026-10-15T11:16:13Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Scope: the gap-closure commits in the `services/console` submodule, `591033e..54734af` (six commits, HEAD
`54734af`). I read the full current files and checked the store and API paths they depend on
(`src/store/buildlog.js` `normalizeBuildItems`, and `lib/router.logs.js` / `lib/thinx/buildlog.js` for
`/logs/build/:bid`). I ran all three unit suites: `node tests/unit/build-log-search.cjs`,
`milestone-v116.cjs` and `transformers-enviros.cjs` all exit 0 with no failing check.

**Prior findings:**

- **WR-01 (one predicate): resolved in the reviewed files.** `hasBuildLog()` (`utils/buildLog.js:29-31`) is now the
  only test in the navbar (`:button`, the static class and `rowListeners`), in the Visits, History and Device Detail
  View buttons, and in `BuildLogDialog.open()`. P1, P2, V8, H4 and N7 check that each surface agrees with the
  predicate for nine candidate ids. Two other build-id rules are still outside the shared predicate (Devices.vue,
  and the Visits download guard). Neither can produce a dead control today; see IN-07.
- **WR-02 (History rows look clickable): resolved.** The `build-row` pointer class and the click listener are now
  added only when `hasBuildLog(item)`. Rows without a log get the same `build-no-log` placeholder as the other
  lists. H3 and H4 cover this with a rendered page, the real `normPaging` and no Vue warnings.
- **IN-03 (unused ref): resolved.** `ref="searchInput"` is gone, and C3 now guards against it coming back.
- The `View build log {id}` label starts with the visible text "View", so WCAG 2.5.3 label-in-name is met. It is
  asserted in V2, H3, milestone-v116 and the Cypress spec. No `Open build log` string is left under `src/`, and P3
  enforces this.

The fix adds no blockers and no warnings. The new info items are small: build-id rules that are left over, a
contradictory placeholder in one History edge case, test names that still say "Open build log", and one test guard
that the move to `rowListeners()` made blind. IN-01, IN-02, IN-04, IN-05 and IN-06 are still open in the
disposition ledger and are still present, so I carry them forward unchanged in substance.

Security: no new sinks. Every new binding is `{{ }}` / attribute interpolation. `hasBuildLog` is a pure type
check, and `fetchBuildDetail` still `encodeURIComponent`s the id.

## Info

### IN-01: Matches after the 1000th can never be reached (carried forward)

**File:** `services/console/vue/src/utils/buildLog.js:46-67`; `src/components/BuildLogDialog/BuildLogDialog.vue:82-87`
**Issue:** Not changed since the previous review. D-06 caps the segments at `limit = 1000`, and `step()` wraps
inside that window. If a term has more than 1000 hits (for example `warning` in a verbose ESP-IDF log), the
matches near the end of the log can never be highlighted or reached. Those are usually the ones the user wants.
**Fix:** Later phase: keep every match offset (a cheap number array) and render `<mark>` only for a window around
`current`.

### IN-02: The 3-character threshold is defined three times; the stored `error` string is never shown (carried forward)

**File:** `services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue:6`, `:35`, `:134`; `src/utils/buildLog.js:48`
**Issue:** Not changed. The minimum term length `3` appears in `searching()`, in `buildLogSearch()` and in the
placeholder copy. `load()` stores `'Could not load this build log.'`, but the template hard-codes the same
sentence on line 13 and uses `error` only as a flag.
**Fix:** Export `BUILD_LOG_MIN_TERM = 3` from `utils/buildLog.js` and use it in both checks. Either render
`{{ error }}` or store a boolean.

### IN-04: The Dashboard audit card still uses the muted text and inline nowrap style that this phase removed from the builds card (carried forward)

**File:** `services/console/vue/src/pages/Visits/Visits.vue:60`, `:65`
**Issue:** Not changed. `class="text-muted"` (empty line and time cells) and `style="white-space:nowrap"` are
still on the Recent Audit card, next to the Recent Builds card that dropped them.
**Fix:** Use `<td class="text-nowrap">` and drop `text-muted`, as the builds card does.

### IN-05: The Cypress "0 requests" check passes on its first poll; `:last` is deprecated (carried forward)

**File:** `services/console/vue/cypress/integration/device-detail.spec.js:107-109`
**Issue:** Not changed. The diff touched only the aria-label on line 97. `cy.get('@getBuildDetail.all').should('have.length', 0)`
passes on the first poll, so it cannot catch a delayed request. `.not(':last')` uses jQuery's deprecated
positional selector.
**Fix:** Add `cy.get('.modal-dialog').should('not.exist')` after the cell clicks. Use `find('td:not(:last-child)')`.
Reword the comment on line 108.

### IN-06: The SFC test harness is copied across three suites, so every new dependency must be stubbed three times (carried forward, reinforced)

**File:** `services/console/vue/tests/unit/build-log-search.cjs:1-145`; `tests/unit/milestone-v116.cjs:23`; `tests/unit/transformers-enviros.cjs:1799`
**Issue:** This fix shows the cost. Adding one import (`hasBuildLog`) to four SFCs meant hand-editing a separate
dependency map in each of the three suites (milestone-v116 line 23, transformers-enviros line 1799, and five
`loadSfc` calls in build-log-search). `build-log-search.cjs` is now 1470 lines. There is still no Cypress coverage
of the search bar or of the dashboard and History View buttons.
**Fix:** Move the loader and renderer into `tests/unit/_sfc-harness.cjs` and resolve `@/utils/*` imports by
loading the real module, so stubs are needed only for components and the store.

### IN-07: Build-id rules still exist outside `hasBuildLog`, and the P3 guard cannot see them

**File:** `services/console/vue/src/utils/buildLog.js:26-28`; `src/pages/Visits/Visits.vue:253`; `src/pages/Devices/Devices.vue:475`; `tests/unit/build-log-search.cjs:1335-1342`
**Issue:** The new comment says `hasBuildLog` is "the one rule every build list and the dialog use". That is not
quite true:
- `Devices.vue` `latestBuildId()` has its own `valid = id => typeof id === 'string' && id.trim() !== ''`.
  `hasBuildLog` accepts a whitespace-only id (`' '`), but Devices rejects it. With such an id, Visits, History,
  Device Detail and the navbar would show a View control that opens the dialog and fails with
  `GET /logs/build/%20`. The error alert gives feedback, so this is not a dead control, but the two rules have
  drifted apart again.
- `Visits.vue:253` `downloadArtifact` still guards with a truthy `if (!item.build_id) return;`. That is
  unreachable today, because Download only renders inside the `hasBuildLog` span.
- P3's regexes look for `build.build_id` and `typeof (build.build_id|buildId)` only. They do not match `item.build_id`
  (Visits line 253, History `buildKey` line 341), and `Devices.vue` is not in the file list. So the check claims
  more ("the five components decide only through hasBuildLog") than it enforces.
**Fix:** Make `hasBuildLog` reject blank ids (`build.build_id.trim() !== ''`). Have `Devices.vue` use it
(`valid = id => hasBuildLog({ build_id: id })`) and `downloadArtifact` use it (`if (!hasBuildLog(item)) return;`).
Broaden P3 to `/(item|build)\.build_id/` in conditionals, and add `pages/Devices/Devices.vue`.

### IN-08: A History row can show an inline log excerpt and "No build log" in the same cell

**File:** `services/console/vue/src/pages/History/History.vue:116-133`
**Issue:** The new `v-else` placeholder (line 132) renders whenever `hasBuildLog(item)` is false, regardless of
`hasLog(item)`. A row with log lines but no usable string `build_id` therefore shows the `<pre>` excerpt (and
possibly Expand), then `—` and the screen-reader text "No build log", all in the "Log" column. In practice this
needs a non-string `build_id`, because `normalizeBuildItems` falls back to the CouchDB `_id`. Still, the cell
contradicts itself, and the other three lists never show inline log text.
**Fix:** Make the placeholder say what is actually missing, for example `<span class="sr-only">No full build log</span>`.
Or render it only when the cell has no excerpt either: `<span v-else-if="!hasLog(item)" data-cy="build-no-log">`.
Then update H3 and H4 to match.

### IN-09: Test names and messages still say "Open build log"

**File:** `services/console/vue/cypress/integration/device-detail.spec.js:101`; `tests/unit/milestone-v116.cjs:166`, `:374`, `:376`, `:378`, `:382`, `:385-386`, `:402`
**Issue:** The control is now labelled and announced as "View build log". The Cypress `it(...)` title and the
milestone-v116 assertion messages still call it the "Open build log button". P3's `OLD_LABEL` sweep covers only
`src/`. This does not affect behaviour, but a failing message will name a control that no longer exists.
**Fix:** Rename the strings to "View (build log) button". You can also extend the `OLD_LABEL` sweep to
`tests/unit` and `cypress/integration` and exclude the P3 definition itself.

### IN-10: The 35 WR-01 source guard on the History row can no longer see added listeners

**File:** `services/console/vue/tests/unit/milestone-v116.cjs:78-81`; `src/pages/History/History.vue:110`, `:297-299`; `tests/unit/build-log-search.cjs:970-974`, `:1408-1421`
**Issue:** The 35 WR-01 check reads the `<tr data-cy="build-row">` source and asserts that it has no `role=`,
`tabindex=` or `@keydown`. The row's listeners now come from `v-on="rowListeners(item)"`. A `keydown` (or any other)
handler added to the object that `rowListeners()` returns would therefore pass that source check. H3 and H4 do not
catch it either: `hasListener()` only checks that some listener exists, and nothing asserts that the listener set
is exactly `['click']`. This is a coverage regression introduced by the WR-02 refactor.
**Fix:** In H4, for rows that pass the predicate, assert `Object.keys(row.data.on).sort()` deep-equals `['click']`.
Alternatively, have milestone-v116 call `history.methods.rowListeners({ build_id: 'b1' })` and assert its keys.

> Note on numbering: the IDs are new after IN-06, and IN-03 is resolved and dropped, so IN-03 is intentionally
> absent. The frontmatter counts nine info findings: IN-01, IN-02, IN-04 to IN-10.

---

_Reviewed: 2026-10-15T11:16:13Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
