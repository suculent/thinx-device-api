# Phase 47 — UI Review

**Audited:** 2026-10-15
**Baseline:** 47-UI-SPEC.md (approved; inherits 44/45/46 contracts)
**Screenshots:** not captured (static code audit by instruction; no login to production)
**Interaction captures:** off (workflow.ui_interaction_capture is false). All interaction findings below come from reading the code.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Dialog copy matches the contract exactly, but the build-list empty states use four different strings, and the known View aria-label still breaks WCAG 2.5.3 |
| 2. Visuals | 3/4 | The dialog hierarchy is as specified. History rows without a `build_id` get an empty actions area instead of the UI-B15 placeholder |
| 3. Color | 3/4 | Tokens are in place and the hard-coded hex values are gone from the dialog. `text-muted` is still on content in the touched Notifications, Visits and History/DeviceDetail empty states |
| 4. Typography | 3/4 | Count, title and meta are as specified. Loading copy mixes `Loading...` with `Loading build log…` |
| 5. Spacing | 3/4 | The 8px gap system is implemented. Inline `white-space` / `width` styles are still on sibling cells the phase did not fix |
| 6. Experience Design | 3/4 | Search, stepping, guard, stale-response and debounce handling are all correct. Retry hides the search bar while it reloads. The History no-log row is inconsistent. The known aria-label issue remains |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **History build rows without a `build_id` render nothing in the actions area** (History.vue:130 has only `v-if`, no `v-else`). Users can't tell "no log" from a broken row, and the row is inconsistent with the dashboard and Device Build History (UI-B15). Fix: add `<span v-else data-cy="build-no-log"><span aria-hidden="true">—</span><span class="sr-only">No build log</span></span>`.
2. **`text-muted` on content in surfaces this phase touched.** This breaks the inherited "no text-muted on content" rule, and the touched lists look inconsistent next to one another. Instances: Notifications.vue:9 `No recent builds.`, Notifications.vue:6 `Loading...`, DeviceDetail.vue:166 `No build history.`, History.vue:95 `No build logs.`, and Visits.vue:60/65 (the Recent Audit card next to the cleaned Recent Builds card). Fix: drop `text-muted` from these empty and loading texts.
3. **The empty state for one entity has four different strings:** `No builds yet.` (Visits:76), `No recent builds.` (Notifications:9), `No build logs.` (History:95) and `No build history.` (DeviceDetail:166). This is inconsistent voice for the same condition. Fix: choose one form (for example `No builds yet.`) and use it everywhere, or follow a shared "No {noun} yet." pattern.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- PASS: every dialog string matches the contract. These are the placeholder `Search log (3+ characters)`, the accessible name `Search this build log`, the counts `3 / 17` / `1 / 1000+` / `No matches`, the speech `Match n of [more than] N`, the error `Could not load this build log.`, the retry button `Try again`, and the empty text `No log output is available for this build yet.` (BuildLogDialog.vue:3-16, 37-46).
- WARNING (known decision, D-13): the aria-label `Open build log {id}` does not contain the visible word "View" (Visits.vue:88, History.vue:130, DeviceDetail.vue:159). This fails WCAG 2.5.3 Label in Name, because voice users saying "click View" may not reach the button. UI-SPEC row E6 claims the label "starts with the visible text", which is factually wrong. The copy is locked, so this is recorded and not scored down further.
- WARNING: the four inconsistent empty-state strings (see Fix 3).
- WARNING: History.vue:130 has a dead fallback, `item.build_id || item.name || ''`, inside a `v-if="item.build_id"`. It is harmless, but it diverges from the other two surfaces.

### Pillar 2: Visuals (3/4)
- PASS: the dialog focal point is right. The current match is bright amber, the other matches are softer, and the search bar is quiet and sticky (_build-log.scss:5-15, 57-67). On the dashboard, Download stays the single filled CTA and View is a link in front of it (Visits.vue:87-94).
- PASS: the IconButtons carry labels, and the decorative icons are `aria-hidden`.
- WARNING: the History no-log gap (Fix 1).
- WARNING: in History, `Expand` and `View` are two `p-0` link buttons in the same cell, separated only by template whitespace (History.vue:122-130). The cell has no `.build-actions` gap, so the spacing is a text space rather than the 8px rhythm used everywhere else.

### Pillar 3: Color (3/4)
- PASS: six `!default` tokens exist (_variables.scss:57-62). The dialog has no hard-coded `#1e1e1e` / `#ddd` left. Every status variant goes through `buildStatusVariant()` (buildLog.js:30-36, Visits:231, History:113, DeviceDetail:156). Amber is confined to `.build-log-text`, and no new blue accent was added.
- WARNING: `text-muted` is still on content in the touched components and next to them (Fix 2).
- Note: Notifications.vue:6 and :9 sit in the same component whose rows were rewritten under UI-B12, so the inherited rule applies there.

### Pillar 4: Typography (3/4)
- PASS: `.build-log-search__count` has .875rem / 400 / tabular-nums. The marks use `font: inherit`, so a highlight never causes a reflow. `.notification-title` is 1rem / 300 and `.notification-meta` is .875rem / 400, all as specified.
- WARNING: the loading copy uses ASCII `Loading...` in Notifications.vue:6 but a typographic ellipsis in `Loading build log…` (BuildLogDialog.vue:11).
- Minor: the DeviceDetail Build History date cell (`fromNow`, line 153) has no `text-nowrap`, while the dashboard and History do. Narrow screens can wrap it.

### Pillar 5: Spacing (3/4)
- PASS: the 8px flex gap is used in the bar and in `.build-actions`, the IconButton margin is reset, the log padding is 16px, and `mark` has `padding: 0` (_build-log.scss).
- WARNING: inline styles are still in neighbouring cells: Visits.vue:65 `style="white-space:nowrap"` (the audit card, beside the fixed build card), History.vue:39 (the audit table), History.vue:115 `style="max-width:600px"`, and DeviceDetail.vue:26/39 `style="width:140px"`. These are outside the strict UI-B14 scope, but the same cleanup was applied to only one of two adjacent tables.
- WARNING: `.build-log-search__field` has `max-width: 320px` and the count has `min-width: 88px`. At 375px this wraps, and the two IconButtons (glyph-only) can drop to a second row. This could not be checked without screenshots.

### Pillar 6: Experience Design (3/4)
- PASS: these behaviours are correct. `open()` refuses an empty or non-string id (BuildLogDialog.vue:99-101). A stale response is dropped through `requestId`. The debounce is cleared on hide and destroy. Enter applies a pending term, and Shift+Enter steps back. Stepping wraps. Only the `<pre>` scrolls. Navbar rows without an id are static, with no listener (Notifications.vue:15-16, 79). Rendering never uses `v-html`.
- WARNING: during `Try again` the search bar is unmounted (`v-if="text && !loading && !error"`), so the focused search field disappears and focus falls to the document body. The kept term comes back only when the reload succeeds. It's acceptable under UI-B08, but there is no focus restore.
- WARNING: `result` is recomputed for the whole text on every `text` change, and the 1000-mark render is run synchronously in one tick. The 5 MB overflow case is still only a backstop (E3 overflow 🧪) and has not been verified.
- WARNING: the History no-log inconsistency (Fix 1) and the known WCAG 2.5.3 aria-label item.

---

## Files Audited
- services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue
- services/console/vue/src/utils/buildLog.js
- services/console/vue/src/styles/_build-log.scss, _variables.scss, theme.scss
- services/console/vue/src/pages/Visits/Visits.vue
- services/console/vue/src/components/Notifications/Notifications.vue, Notifications.scss
- services/console/vue/src/pages/History/History.vue
- services/console/vue/src/pages/Devices/DeviceDetail.vue
