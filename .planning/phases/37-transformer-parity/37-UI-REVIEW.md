# Phase 37 — UI Review

**Audited:** 2026-10-12
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md)
**Screenshots:** not captured (no dev server on localhost:3000, 5173 or 8080)
**Interaction captures:** off (workflow.ui_interaction_capture is false). All interaction findings below come from reading the code.

Scope: `pages/Transformers/Transformers.vue`, `pages/Transformers/TransformerEditor.vue`, and the Transformer Assignment card plus the Create & Assign modal in `pages/Devices/DeviceDetail.vue` (lines 108-121, 156-163, 394-441). Findings already raised in the 35 and 36 reviews are not repeated.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | The same field is called "Alias" on two surfaces and "Name" on the third; the editor title can read "Transformer - " with nothing after it |
| 2. Visuals | 3/4 | The checkbox list is clear, but assigned transformers that no longer exist are invisible, and the editor has no loading state |
| 3. Color | 2/4 | One three-button row uses primary, success and warning; orange (warning) is used for plain navigation; the editor hardcodes `#ddd` |
| 4. Typography | 3/4 | No new type scale, but the editor hardcodes `font-size: 13px` and the editor's header has an empty bold span |
| 5. Spacing | 3/4 | Bootstrap utilities are used throughout; inline `style="max-width:400px"` and a fixed 400px CodeMirror height |
| 6. Experience Design | 2/4 | Save Transformers has no pending or disabled state and no dirty indicator; deleting a transformer does not warn about devices that use it; creating from the Transformers page cannot set a body |

**Overall: 15/24**

---

## Top 3 Priority Fixes

1. **Save Transformers has no pending state or dirty cue** (WARNING). It can be clicked twice, nothing shows that the checkboxes differ from the stored assignment, and leaving the page drops the change without a prompt. Fix: add a `transformersSaving` flag that disables the button and shows "Saving...", add a computed `transformersDirty` (compare `editForm.transformers` with `device.transformers`) that enables Save only when there is a change, and add a small "Unsaved changes" hint.
2. **Inconsistent field name: Alias vs Name** (WARNING). Transformers.vue:22,43 and TransformerEditor.vue:14 say "Alias", while the DeviceDetail.vue:158 modal says "Name". The duplicate errors also differ: "alias already exists" (Transformers.vue:79) and "name already exists" (DeviceDetail.vue:401). Fix: use "Name" everywhere in the UI. The data key can stay `alias`.
3. **Delete gives no warning about devices that use the transformer** (WARNING). Transformers.vue:97 asks only "Delete this transformer?". Devices keep the orphaned utid, which then has no checkbox (37-02 SUMMARY "Not in scope"), so the user cannot see or remove it. Fix: name the transformer in the confirm text and add "Devices that use it will stop applying it." On the device card, list unknown assigned utids as checked "(deleted) <utid>" options so they can be unticked.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)
- WARNING: The field is "Alias" in Transformers.vue:22,43,79 and TransformerEditor.vue:14,104, and "Name" in DeviceDetail.vue:158,399,401. Users meet three surfaces with two names for one field.
- WARNING: TransformerEditor.vue:8 renders "Transformer - " followed by an empty bold span while the transformer loads, after a load failure, and whenever the alias field is cleared. The breadcrumb falls back to "Editor" (line 5), but the title has no fallback.
- WARNING: DeviceDetail.vue:415 says "Select it from the list and save to retry." The list is now checkboxes (G-37-5), so the text should say "Tick it in the list and click Save Transformers to retry."
- Minor: Transformers.vue:4,7 places the page under "Settings" with an inactive crumb, while the editor's breadcrumb (TransformerEditor.vue:4) has no Settings level. The hierarchy does not match.
- Minor: Transformers.vue:16 puts the description below the Add button, so a new user reads the action before learning what a transformer is.
- Good: the empty state "No transformers yet. Use Create & Assign to add one." (DeviceDetail.vue:117) points to the next action. The modal OK label "Create & Assign" matches the button that opens it.

### Pillar 2: Visuals (3/4)
- WARNING: Assigned utids that are missing from the profile list get no checkbox. The card then shows fewer ticked boxes than the device actually has, and Save sends the hidden ids back (37-02 SUMMARY). The card does not show the device's real state.
- WARNING: TransformerEditor has no loading indicator. Until `loaded` is true, the page shows an empty alias field and an empty editor with Save disabled and gives no reason. Transformers.vue:18 does have "Loading...".
- Minor: the Transformers list has only an Alias column. There is no utid, no usage count, and no body preview, so transformers with similar names are hard to tell apart.
- Good: the stacked checkboxes (DeviceDetail.vue:110-116) clearly show what is enabled, which closes G-37-5.

### Pillar 3: Color (2/4)
- WARNING: DeviceDetail.vue:119-121 puts primary (Save), success (Create & Assign) and warning (Manage Transformers) in one row. That is three accent colors on three buttons of equal weight. It repeats the action-row problem from 35, now in a new card.
- WARNING: `variant="warning"` (#E49400) is the semantic color for caution, but here it marks a navigation link. It matches the warning alerts and the "Leave" confirm (TransformerEditor.vue:67), so the button looks risky. The operator asked for orange explicitly (G-37-5), so record this as an accepted deviation, or use a dedicated `orange` brand variant that is not `warning`. Contrast is fine: Bootstrap's YIQ value for #E49400 is about 155, which selects dark text.
- Minor: TransformerEditor.vue:133 hardcodes `border: 1px solid #ddd`. Use `$gray-300` or the theme's border token.
- Minor: the CodeMirror `material` dark theme sits inside the light console page, which makes a high-contrast dark block in the middle of it.

### Pillar 4: Typography (3/4)
- WARNING: TransformerEditor.vue:134 hardcodes `.CodeMirror { font-size: 13px }` in an **unscoped** `<style>`. It applies to every CodeMirror instance in the app once this route has loaded.
- Minor: when the alias is blank, the `fw-semi-bold` span at TransformerEditor.vue:8 is empty and the header loses its emphasis.
- Good: `small text-muted` for the empty state and `text-monospace` for the modal's JavaScript textarea come from the existing scale.

### Pillar 5: Spacing (3/4)
- Minor: TransformerEditor.vue:14 uses inline `style="max-width:400px"`. The alias input on the list page's modal is full width, so the two do not match.
- Minor: the editor height is fixed at 400px (line 132) and does not respond to the viewport. On a 375px-wide mobile screen, `lineWrapping: false` forces horizontal scrolling.
- Minor: the Save and Cancel buttons (TransformerEditor.vue:25-28) and the device card buttons sit on the page with no `mt-*` between them and the content above, apart from CodeMirror's `mb-3`.
- Good: `ml-2` and `mr-2` spacing between buttons is consistent; `mb-3` on cards.

### Pillar 6: Experience Design (2/4)
- WARNING: `saveTransformers` (DeviceDetail.vue:431-441) has no saving flag and no `:disabled`, so a double click sends two PUTs. The button is active when nothing has changed. There is no route-leave guard, unlike TransformerEditor.vue:63-73.
- WARNING: deleting a transformer (Transformers.vue:97) does not say which one, does not mention the devices it is assigned to, and has no pending state on the Delete button.
- WARNING: "Add Transformer" on the Transformers page creates a record with an alias only (Transformers.vue:41-46, `createItem(alias)`). The user must then open Edit to write the body. The device modal collects name and body in one step. The two create flows do not match.
- WARNING (possible): TransformerEditor.vue:21 sets `hasChanges = true` on CodeMirror `@input`. If vue-codemirror emits `input` when `form.body` is first assigned, after `hasChanges = false` at line 94, then "You have unsaved changes" shows and the leave-confirm fires on an untouched transformer. UAT 2 passed, so this could not be confirmed without a browser. Compare the body with the loaded value instead of using a flag.
- Minor: the create modal on the Transformers page shares `error` with the page-level alert (Transformers.vue:14,42). A duplicate-name error therefore also stays on the page behind the modal after the modal closes.
- Good: Create & Assign has `ok-disabled` and a re-entry guard. It handles partial failure ("created, but assignment failed") and keeps the user's unsaved checkbox state. The editor's Save is guarded by `loaded` and a non-blank alias. The editor has an unsaved-changes guard.

---

## Files Audited
- services/console/vue/src/pages/Transformers/Transformers.vue
- services/console/vue/src/pages/Transformers/TransformerEditor.vue
- services/console/vue/src/pages/Devices/DeviceDetail.vue (lines 108-163, 252-284, 394-441)
- services/console/vue/src/styles/_variables.scss (warning color)
- .planning/phases/37-transformer-parity/37-01/02 PLAN and SUMMARY, 37-UAT.md
- .planning/phases/35-console-usability/35-UI-REVIEW.md, 36-build-log-access/36-UI-REVIEW.md (for de-duplication)
