# Phase 36 — UI Review

**Audited:** 2026-10-12
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md)
**Screenshots:** not captured (no dev server on localhost:3000, 5173 or 8080; code-only audit)
**Interaction captures:** off (workflow.ui_interaction_capture is false). All interaction findings come from the code.

Scope: `components/BuildLogDialog/BuildLogDialog.vue`, `store/buildlog.js` `normalizeStatus`, `utils/buildLog.js`, `components/Notifications/Notifications.vue` (navbar Recent Builds), `pages/Visits/Visits.vue` (dashboard Recent Builds card), `pages/History/History.vue` builds table, `pages/Devices/DeviceDetail.vue` Build History. Phase 35 findings that phase 36 did not change are not repeated here.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Dialog states have clear copy, but the error gives no reason and the title can read "Build Log — " with nothing after it |
| 2. Visuals | 2/4 | The dashboard "Recent Builds" card has no log entry point; only the navbar dropdown with the same name opens the dialog |
| 3. Color | 2/4 | TIMEOUT is coloured the same as FAILED on every surface, and RUNNING is coloured three different ways |
| 4. Typography | 4/4 | No new sizes or weights; the log uses the existing monospace `pre` |
| 5. Spacing | 3/4 | The same "Open build log" link button has `p-0` on the device page and default padding on History |
| 6. Experience Design | 3/4 | Loading, empty, error, retry and stale-request guard are all present; a row without a build id still gets an active button that can only fail; very large logs render in one `pre` |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **WARNING: TIMEOUT cannot be told apart from FAILED** (BUILD-02). Users can't tell an infrastructure timeout from a compile failure without reading the label, and RUNNING shows red on History and Device pages. Fix: add one shared `buildStatusVariant(status)` helper in `utils/buildLog.js` (OK→success, RUNNING→info, TIMEOUT→warning, everything else→danger). Use it in Visits.vue:225, History.vue:113, DeviceDetail.vue badge, and Notifications.vue `statusIconClass`/`statusTextClass`/`statusGlyph`, with a clock glyph for TIMEOUT.
2. **WARNING: the dashboard "Recent Builds" card cannot open a log.** Visits.vue:75-100 has only Download, but the navbar dropdown, also titled "Recent Builds", opens the dialog. Two widgets share a name and do different things, so a user on the dashboard is left with no route to the log. Fix: add the same `b-button variant="link" data-cy="build-open-log"` as History, plus `<BuildLogDialog ref>`, to the Visits card's last column.
3. **WARNING: the "Open build log" button shows on rows that have no build id.** DeviceDetail.vue renders it unconditionally with `aria-label="'Open build log ' + build.build_id"`, which gives "Open build log undefined" or a trailing space. `fetchBuildDetail` returns `{success:false}` for an empty id, so the dialog opens with the title "Build Log — " and the message "Could not load this build log." Fix: `v-if="build.build_id"`, with a `—` placeholder like Visits uses for Download, and the same guard in History.vue:130 and Notifications.vue (`button` item).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- PASS: BuildLogDialog.vue:3 "Loading build log…", :6 "No log output is available for this build yet.", Retry button. These are specific and not generic.
- WARNING: BuildLogDialog.vue:33 error is always "Could not load this build log." It doesn't separate not found / forbidden (owner-scoped fetch) / network, so the user can't tell whether Retry will help.
- WARNING: BuildLogDialog.vue:2 title `'Build Log — ' + buildId` goes blank when there is no id (see Fix 3).
- WARNING: Notifications.vue:25 falls back to `'UNKNOWN'` while every table falls back to `'—'`. The same missing status gets two different labels.
- Minor: Visits "View all →" links `/app/history` and Notifications "See all builds" links `/app/history/builds`. Two labels and two targets for the same destination.

### Pillar 2: Visuals (2/4)
- BLOCKER-adjacent WARNING: the dashboard card (Visits.vue:75) and the navbar dropdown (Notifications.vue:4) both say "Recent Builds", but only the dropdown opens logs. UAT test 1 passed through the dropdown. The dashboard card on the main screen is a dead end for BUILD-01.
- WARNING: three different interaction models for the same action. In the dropdown the whole list item is the button. History has a mouse row-click plus a link button. Device rows are inert with a link button only. Users can't build one habit that works on all three.
- WARNING: in History, the `Open build log` link (History.vue:130) sits after a 600px inline `pre` preview and Expand in the same cell. On long logs it lands far below the row's visual baseline, so it is hard to find.
- PASS: Device Build History is now a summary-only table with a labelled Log column (36-02). It has a clear hierarchy, and the inline log card is gone.

### Pillar 3: Color (2/4)
Status → variant mapping, by surface:

| Surface | OK | RUNNING | TIMEOUT | FAILED |
|---|---|---|---|---|
| Visits.vue:225 | success | warning | danger | danger |
| History.vue:113 | success | danger | danger | danger |
| DeviceDetail.vue Build History | success | danger | danger | danger |
| Notifications.vue (icon/text) | success, check | danger, X | danger, X | danger, X |

- WARNING: TIMEOUT, the phase's new state, gets no colour of its own anywhere. It shares the failure red and, in the dropdown, the failure X glyph.
- WARNING: an in-progress build shows red with an X on three of four surfaces, which reads as a failure.
- Carried, unchanged: BuildLogDialog.vue:42 hardcoded `#1e1e1e` / `#ddd` (phase 35 finding, still open).

### Pillar 4: Typography (4/4)
- No new font sizes or weights. The dialog uses the Bootstrap modal title and a `pre`, and the device table keeps `<code>` for build ids. `white-space: pre-wrap; overflow-wrap: anywhere` keeps long log lines from scrolling horizontally. No issue found.

### Pillar 5: Spacing (3/4)
- WARNING: DeviceDetail.vue Open build log button has `class="p-0"`; History.vue:130 does not. The same control has different hit area and alignment on the two pages.
- Minor: inline `style="max-width:600px"` (History.vue:117) and `style="white-space:nowrap"` (Visits.vue:81, History.vue:111) instead of utility classes (`text-nowrap`).
- PASS: the dialog `pre` uses `padding: 1rem` and `max-height: 70vh` with internal scroll, so the modal footer stays visible.

### Pillar 6: Experience Design (3/4)
- PASS: BuildLogDialog has loading (`role="status"` + spinner), error with Retry, empty state, and a `requestId` guard that drops stale responses and cancels on `@hidden`. TIMEOUT derivation (`normalizeStatus`, 20 min stale RUNNING) is centralised in the store.
- PASS (36-02): browsing device history no longer fetches logs. The fetch only runs on an explicit button press.
- WARNING: Fix 3 above. The button stays active on rows with no build id, and pressing it can only fail.
- WARNING: the whole log is rendered as one interpolated `pre` with no tail-first view, line cap, copy or download action. Together with the deferred ~3.4x Buffer-JSON payload (36-02 Deferred), multi-MB logs mean a long spinner and then a heavy DOM. The loading copy gives no sense of progress or size.
- WARNING: the error alert sits inside the dialog. The Retry button is `size="sm"` with no variant, so it renders as default secondary inside a danger alert, which makes it a weak affordance.
- Minor: TIMEOUT derived from a stale RUNNING is shown as fact. Nothing (tooltip or title) explains "no worker report for 20 min", so users can't tell it from an explicit timeout.

---

## Files Audited
- services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue
- services/console/vue/src/utils/buildLog.js
- services/console/vue/src/store/buildlog.js (normalizeStatus, list normalisation)
- services/console/vue/src/components/Notifications/Notifications.vue
- services/console/vue/src/pages/Visits/Visits.vue
- services/console/vue/src/pages/History/History.vue
- services/console/vue/src/pages/Devices/DeviceDetail.vue
- .planning/phases/36-build-log-access/36-01/02 PLAN + SUMMARY, 36-UAT.md; ../35-console-usability/35-UI-REVIEW.md
