# Phase 38 — UI Review

**Audited:** 2026-10-12
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md)
**Screenshots:** not captured (no dev server; production dev servers were out of scope)
**Interaction captures:** off (workflow.ui_interaction_capture is false). All interaction findings come from reading the code.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Specific CTAs and a good delete warning, but the load error appears twice and Vue says "Delete" where Legacy says "Revoke" |
| 2. Visuals | 2/4 | The destructive Delete button sits inside the Generate form; the "Public key" column shows no key, only buttons |
| 3. Color | 3/4 | Variants are used correctly (success/danger/outline); green "Generate" next to red "Delete" gives two competing primaries |
| 4. Typography | 4/4 | No new sizes or weights; the page title follows the existing `fw-semi-bold` pattern |
| 5. Spacing | 3/4 | Ad-hoc `mr-2 mb-2 ml-2` on an inline form; wraps unevenly on narrow screens |
| 6. Experience Design | 3/4 | Confirmation, a pending state on create and a load-error state exist; delete has no pending state and a failed reload leaves stale rows |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **Delete button is inside the generate form** (Rsakeys.vue:9). Create and destroy share one control row, so the red button is right next to the CTA. Fix: move `Delete (n)` into a toolbar above the table, aligned right, or into a bulk-action row that appears only when `selectedIds.length > 0`.
2. **A failed reload keeps stale rows and shows the error twice** (Rsakeys.vue:88-89, :26). `loadData` sets `loadFailed` but does not clear `items`. After a failed refresh (e.g. after a delete), the old list stays on screen with a banner the user can easily miss. On a failed first load, the banner "Could not load deploy keys." and the table row "Deploy keys could not be loaded…" both appear. Fix: set `this.items = []` in the catch (or mark the rows stale) and show only one message: keep the row and drop the banner text for load failures.
3. **Delete has no pending or disabled state** (Rsakeys.vue:79-84). Between confirming and the reload finishing, the button stays enabled, so a double click can send a second DELETE. Fix: add a `deleting` flag that disables the button and sets its label to "Deleting…", the same pattern `creating` already uses.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- Good: "Generate Deploy Key" / "Generating…", "Show key", "Copy key", the placeholder "e.g. Firmware Repository", and a delete confirmation that explains the consequence (Rsakeys.vue:75). Cancel gets focus by default.
- WARNING: the load-failure copy is duplicated (lines 26 and 89), and the two versions use different wording.
- WARNING: the action is called "Delete" in Vue (line 9) and "Revoke selected" in Legacy (deploykey.html:74). Pick one word for the same action. "Delete" matches what happens on disk.
- Minor: the first column header is "Select" (line 16). Leave it visually empty with an sr-only label, or add a select-all checkbox.
- Minor: "Delete (0)" is shown while disabled. "Delete selected" reads better until something is selected.

### Pillar 2: Visuals (2/4)
- WARNING: the mixed create/delete row (fix 1).
- WARNING: the "Public key" column (line 16/21-24) holds two buttons and no key text. Users cannot tell keys apart by fingerprint without opening a modal. Show a truncated fingerprint or the key comment, and rename the column "Actions" or split it.
- The name is the only identifier. Older keys whose name defaults to a date string (store fixture, rsakeys.js:8) look the same as the Generated column.
- The modal title "Deploy Key — {name}" with the full key in a readonly textarea is a clear focal point. Good.

### Pillar 3: Color (3/4)
- Variants: success (Generate), danger (Delete, confirm OK), outline-primary (Show), outline-secondary (Copy). No hardcoded colours.
- WARNING: a solid green and a solid red button side by side in one row split attention. With fix 1, Delete could become `outline-danger` until there is a selection.

### Pillar 4: Typography (4/4)
- No new size or weight classes. `text-muted` is used for the empty/error row, which is consistent with the rest of the console.

### Pillar 5: Spacing (3/4)
- WARNING: the inline `b-form` uses `mr-2 mb-2` on the input and `ml-2 mb-2` on Delete (lines 7-9). The label has no `mb-2`, so it sits out of line with the controls when the row wraps under the `sm` breakpoint. Use `b-form-row` / grid columns, or apply `mb-2` consistently.
- In the table, Show and Copy use `ml-2`. That is fine.

### Pillar 6: Experience Design (3/4)
- Present: loading `role="status"`, pending + disabled on create, empty-name guard, a delete confirmation with cancel as the default, a load-failure state (UAT 4 passed), a clipboard fallback with an error message, and aria-labels on the checkboxes.
- WARNING: delete has no pending state (fix 3).
- WARNING: a failed reload leaves stale rows (fix 2).
- WARNING: `selectedIds` is not pruned after a reload. Keys deleted elsewhere stay counted in "Delete (n)" and are then silently filtered out (line 68). Prune `selectedIds` to existing ids in `loadData`.
- Minor: the "Loading…" text replaces the whole table on every reload (after create and after delete), so the layout jumps. Keep the table and dim it instead.
- Legacy (being deprecated, low weight): UAT 6 notes that a generation failure with the guards bypassed showed no notification. A real server-side rejection has the same path. This is acceptable only because Legacy is going away.

Registry audit: skipped (no third-party registries declared).

---

## Files Audited
- services/console/vue/src/pages/Rsakeys/Rsakeys.vue
- services/console/vue/src/store/rsakeys.js
- services/console/src/app/views/deploykey.html
