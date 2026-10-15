---
phase: 47-build-log-search-status-colours
reviewed: 2026-10-15T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - services/console/vue/cypress/integration/device-detail.spec.js
  - services/console/vue/package.json
  - services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue
  - services/console/vue/src/components/Notifications/Notifications.scss
  - services/console/vue/src/components/Notifications/Notifications.vue
  - services/console/vue/src/pages/Devices/DeviceDetail.vue
  - services/console/vue/src/pages/History/History.vue
  - services/console/vue/src/pages/Visits/Visits.vue
  - services/console/vue/src/styles/_build-log.scss
  - services/console/vue/src/styles/_variables.scss
  - services/console/vue/src/styles/theme.scss
  - services/console/vue/src/utils/buildLog.js
  - services/console/vue/tests/unit/build-log-search.cjs
  - services/console/vue/tests/unit/milestone-v116.cjs
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
status: issues_found
---

# Phase 47: Code Review Report

**Reviewed:** 2026-10-15
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Scope: the Phase 47 diff in the `services/console` submodule, `31bce2b..591033e` (HEAD is `591033e`). It covers
build log search in `BuildLogDialog`, the `buildLogSearch()` helper, the dashboard View button, static navbar rows,
the shared build-log styles and the Phase 36 test fixes. Both unit suites pass locally
(`node tests/unit/build-log-search.cjs`, `node tests/unit/milestone-v116.cjs`).

The search is safe. Every segment is rendered with `{{ }}` interpolation, so there is no `v-html` and no HTML sink.
The term is escaped before it reaches `RegExp`, so no ReDoS is possible. Matching runs on the original text, so
indices stay aligned. Debounce, reset-on-open, drop-on-hide and stale-response handling (`requestId`) are correct, and
I found no race between them. The `$nextTick` scroll after the term watcher runs after the re-render.

I found no blockers. The two warnings are about one thing: the "has a build log" rule is written differently in
different places. As a result, a row can get an interactive control that does nothing, which is the dead-affordance
problem D-14 and D-15 were meant to remove. The info items cover the 1000-match ceiling, duplicated constants, a
dead ref, a style inconsistency on the same dashboard, and how much the e2e checks really prove.

## Warnings

### WR-01: The "has a build log" predicate is inconsistent: truthy in templates, non-empty string in the dialog

**File:** `services/console/vue/src/components/Notifications/Notifications.vue:15-16` vs `:79`; also
`src/pages/Visits/Visits.vue:87`, `src/pages/Devices/DeviceDetail.vue:159`, `src/pages/History/History.vue:130`, and
`src/components/BuildLogDialog/BuildLogDialog.vue:101-102`

**Issue:** Not every place decides "has a build log" the same way:
- In the navbar row, `:button="!!build.build_id"` and the `listGroupItem--static` class use truthiness, but
  `rowListeners()` (line 79) attaches the click only when `typeof build.build_id === 'string'`.
- The Visits, Device Detail and History View buttons render on `v-if="item.build_id"` (truthy).
- `BuildLogDialog.open()` returns without doing anything unless `build_id` is a non-empty string.

`normalizeBuildItems` (`src/store/buildlog.js:102`) passes `item.build_id` / `latestLog.build_id` through without
converting to a string. If either is a truthy non-string (a number, or an object from an old record), the navbar row
is a focusable `<button>` with a pointer and hover state but no click listener. On the three tables, the "View" button
shows, takes the click, and nothing happens: no dialog, no error, no feedback. Today's build ids are UUID strings, so
this is latent. Still, it is exactly the dead control D-14 and D-15 set out to remove, and the four checks can drift
apart further.

**Fix:** Define the rule once and use it everywhere. Either convert the id in the store, or export one predicate and
use it in every template and in `open()`:
```js
// src/store/buildlog.js
build_id: String(item.build_id || latestLog.build_id || item._id || ''),

// src/utils/buildLog.js
export function hasBuildLog(build) {
  return !!build && typeof build.build_id === 'string' && build.build_id !== '';
}
```
```html
<!-- Notifications.vue -->
:class="['listGroupItem', { 'listGroupItem--static': !hasBuildLog(build) }]"
:button="hasBuildLog(build)"
<!-- Visits / DeviceDetail / History -->
v-if="hasBuildLog(item)"
```

### WR-02: History rows without a `build_id` still look clickable, but the click now does nothing

**File:** `services/console/vue/src/pages/History/History.vue:109`, `:293-301`, `:463-465`

**Issue:** Every History build row has `class="build-row"` (`cursor: pointer`) and `@click="onBuildRowClick(item,
$event)"`. D-15 changed `BuildLogDialog.open()` to return without doing anything when there is no `build_id`. Before
this phase it fell back to `build.id`, so the click did something. Now a row without an id still shows a pointer and
takes the click, with no result and no feedback. In the same phase the navbar got a static treatment for these rows
(D-14, `.listGroupItem--static`), but History did not, so the two lists now behave differently for the same data.

**Fix:** Make History's row affordance depend on the build id, the same way as the navbar:
```html
<tr v-for="(item, i) in filteredBuilds" :key="i" data-cy="build-row"
    :class="{ 'build-row': hasBuildLog(item) }"
    @click="hasBuildLog(item) && onBuildRowClick(item, $event)">
```
Also add a History row without a `build_id` to `build-log-search.cjs` H1, asserting no pointer class and no
dispatch.

## Info

### IN-01: Matches after the 1000th can never be reached

**File:** `services/console/vue/src/utils/buildLog.js:39-58`; `src/components/BuildLogDialog/BuildLogDialog.vue:73-78`

**Issue:** D-06 sets this cap on purpose. The effect: once a term has more than 1000 hits, `step()` wraps inside the
first 1000, and the rest of the log is one plain segment that is never highlighted. The thing people usually search a
build log for is the last error, near the end. A verbose ESP-IDF or PlatformIO log can easily contain a common term
like `warning` or `/opt/` more than 1000 times, and then the hit the user wants is unreachable. The `1000+` count
says so, but gives no way to get there.

**Fix:** For a later phase: keep the full list of match offsets, which is cheap (an array of numbers), and render
`<mark>` only for a window of 1000 around `current`. Rebuild the segments when `current` leaves the window. The DOM
stays bounded and every match can be reached.

### IN-02: The 3-character threshold and the error message are each defined in more than one place; `error` text is never shown

**File:** `services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue:6`, `:13`, `:35`, `:133`;
`src/utils/buildLog.js:41`

**Issue:**
- The minimum term length `3` appears three times: in `searching()`, in `buildLogSearch()` and in the placeholder
  copy. They can drift apart.
- `load()` stores `'Could not load this build log.'` in `this.error`, but the template now hard-codes the same
  sentence and only uses `error` as a flag. The stored string is dead.

**Fix:** Export `BUILD_LOG_MIN_TERM = 3` from `utils/buildLog.js` and use it in both checks. Either render `{{ error
}}` in the alert, or set `this.error = true`.

### IN-03: `ref="searchInput"` is never used and has the same name as a data property

**File:** `services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue:6`

**Issue:** No code reads `$refs.searchInput`; only `$refs.log` is used. The ref also has the same name as the
`searchInput` data property, so `this.searchInput` and `this.$refs.searchInput` mean different things.

**Fix:** Remove the ref. If focus management is added later, name it `searchField`.

### IN-04: The Dashboard audit card still has the muted text and inline style this phase removed from the builds card

**File:** `services/console/vue/src/pages/Visits/Visits.vue:60`, `:64`

**Issue:** Phase 47 removed `text-muted` and `style="white-space:nowrap"` from the Recent Builds card (now
`text-nowrap`, with no muted text). The Recent Audit card next to it still uses `class="text-muted"` on its empty line
and on its time cells, and still has the inline `white-space:nowrap`. So two cards side by side on one page look
different.

**Fix:** Apply the same change to the audit card: `<td class="text-nowrap">` and drop `text-muted`. Also extend V4's
"no muted text" check to the whole Dashboard.

### IN-05: The Cypress "0 requests" check passes on its first poll and cannot see a delayed request; `:last` is a deprecated jQuery selector

**File:** `services/console/vue/cypress/integration/device-detail.spec.js:107-109`

**Issue:** `cy.get('@getBuildDetail.all').should('have.length', 0)` is already true when Cypress first checks it, so it
returns at once. A cell click that sent its request after a debounce, an `await`, or a `$nextTick` would get past it.
The comment says this check "is what proves the cell clicks sent no request", which overstates it. The real safety
net is the final `have.length 1` check, and the fact that a dialog opened by a cell click would cover the View button.
Separately, `.not(':last')` uses jQuery's positional `:last`, deprecated since jQuery 3.4. Per D-17 this spec is not
executed until Phase 48 CI-07.

**Fix:** After the cell clicks, also check what the user would see: `cy.get('.modal-dialog').should('not.exist')`. Use
`.find('td:not(:last-child)')` in place of `:last`. Change the comment so it says the final count is the real check.

### IN-06: The 1273-line unit test copies the SFC harness, and the new UI has no e2e coverage

**File:** `services/console/vue/tests/unit/build-log-search.cjs:1-145`

**Issue:** The file header says the loader, renderer and vnode walkers are "copied from transformers-enviros.cjs (not
required from it)". `milestone-v116.cjs` has a third variant of the same loader. A fix to one, such as the warn-handler
ordering fixed here for 36 IN-01, does not reach the others. No Cypress spec covers the search bar, Enter / Shift+Enter
stepping, or the dashboard View button. Those paths are checked only through vnode inspection, with `b-*` treated as
ignored elements, so a real `BFormInput` / `BModal` interaction regression would not be caught.

**Fix:** Move the harness into `tests/unit/_sfc-harness.cjs` and `require` it from the three suites. When the Phase 48
CI-07 Cypress suite turns green, add one spec that opens a build log from the dashboard, types a term, presses Enter
twice and checks `[data-cy=build-log-search-count]` and the `build-log-match--current` mark.

---

_Reviewed: 2026-10-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
