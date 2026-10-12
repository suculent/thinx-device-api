---
phase: 37-transformer-parity
reviewed: 2026-10-12T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - services/console/vue/src/pages/Devices/DeviceDetail.vue
  - services/console/vue/tests/unit/milestone-v116.cjs
  - services/console/vue/cypress/integration/device-detail.spec.js
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-10-12
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Scope: the G-37-5 gap-closure diff `38eb95b..4cbf1da` in the `services/console` submodule. It replaces
the transformer multi-select with a stacked `b-form-checkbox-group`, adds an empty-state line, and
changes Manage Transformers to `variant="warning"`. Transformers.vue, TransformerEditor.vue,
`store/transformers.js` and the Profile saves were left out, because 35-REVIEW / 35-REVIEW-FIX
already cover them.

The binding is correct. `v-model="editForm.transformers"` and `:options="transformerOptions"`
produce one checkbox per profile transformer, keyed by utid. Save sends
`{ changes: { udid, transformers } }` (checked against `store/devices.js:72-77`). The Create & Assign
path still writes the stored list, not the unsaved checkbox state. `node tests/unit/milestone-v116.cjs`
exits 0.

The checkbox group still has a pre-existing problem, and the new empty-state line makes it worse.
An assigned transformer ID that has no matching option gets no checkbox. The ID stays in the model
and is re-saved, and the user cannot remove it. In that state the card can claim "No transformers
yet" while the device still has assignments. No BLOCKER was found. No path loses or overwrites
stored data.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Assigned transformer IDs with no matching option are invisible and cannot be removed; the empty-state line can be false

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:110-117` (with `:252-254`, `:284`)
**Issue:** The checkboxes are built only from `transformerOptions`, which is the profile's
transformer list. `editForm.transformers` is loaded from `device.transformers` (line 284). Any utid on
the device that is not in that list gets no checkbox. Two realistic ways this happens:

1. **The transformer was deleted.** `Transformers.vue:96-103` (`deleteTransformer`) and
   `store/transformers.js` `deleteItem` remove it from the profile only. They never unassign it from
   devices, so the device keeps the dead utid.
2. **The transformer fetch failed.** `fetchTransformers` rejects, and `loadDevice` (line 278)
   swallows that through `Promise.allSettled`. On a first visit `getTransformers()` is then `[]`.

The new `v-else` branch (line 117) then shows "No transformers yet. Use Create & Assign to add one."
while `editForm.transformers` is non-empty. In case 1 nothing else on the page hints at the problem
(no error banner).

When some options do exist, BootstrapVue's `BFormCheckbox.handleChange`
(`bootstrap-vue/src/components/form-checkbox/form-checkbox.js:86-95`) only adds or removes its own
value. Unknown values stay in the array. So a user who unticks every visible checkbox and clicks
Save sends `transformers: ['<deleted-utid>']` while the UI shows nothing assigned. The orphan can
never be cleared from this page. Save Transformers also stays enabled in the empty state and
silently re-sends the hidden list.

Neither the unit test nor the Cypress spec covers a device whose `transformers` contains an ID
missing from the profile list. The empty-state test uses a device with no `transformers` key at all
(`milestone-v116.cjs:405`).

**Fix:** Render orphaned assignments so the user can see them and untick them. Base the empty state
on both lists:
```js
// computed
assignmentOptions() {
  const known = this.transformerOptions;
  const ids = new Set(known.map(o => o.value));
  const orphans = (this.editForm.transformers || []).filter(id => !ids.has(id))
    .map(id => ({ value: id, text: id + ' (missing — deleted or not loaded)' }));
  return [...known, ...orphans];
},
```
```html
<b-form-checkbox-group v-if="assignmentOptions.length" v-model="editForm.transformers"
  :options="assignmentOptions" stacked data-cy="transformer-checkboxes" />
<p v-else ...>No transformers yet. Use Create &amp; Assign to add one.</p>
```
Also add a unit check with `tDev.transformers = ['t2', 'gone']`. It should assert that a `gone`
option renders, that unticking it removes it from `editForm.transformers`, and that the empty state
is not shown when `device.transformers` is non-empty and the profile list is empty.

## Info

### IN-01: Assignment-failure message still refers to "the list"

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:415`
**Issue:** The message reads `'Transformer created, but assignment failed. Select it from the list and
save to retry.'`. The multi-select it describes is gone, and the code comments at lines 408-409 and
422-423 were updated in this diff, but this user-facing string was not.
**Fix:** `'Transformer created, but assignment failed. Tick its checkbox and click Save Transformers to retry.'`

### IN-02: The emphasised Manage Transformers button drops unsaved checkbox changes without warning

**File:** `services/console/vue/src/pages/Devices/DeviceDetail.vue:121`
**Issue:** The button is now a filled orange button directly next to Save Transformers. Clicking it
after ticking boxes but before saving navigates to `/app/transformers` and silently discards the
checkbox state. This also happened with the old `variant="link"` button, but the new styling makes it
a primary-looking action next to Save.
**Fix:** Compare `editForm.transformers` with `device.transformers`. If they differ, either disable
the button or ask for confirmation in a `beforeRouteLeave` guard.

### IN-03: Cypress colour assertion is tied to the theme value; the save test does not check UI feedback

**File:** `services/console/vue/cypress/integration/device-detail.spec.js:62-64`, `:67-75`
**Issue:** `have.css 'background-color', 'rgb(228, 148, 0)'` repeats `$orange: #E49400`
(`src/styles/_variables.scss:47`) as a literal. The comment cites the operator decision but not the
source variable, so a theme tweak fails a device-detail feature test with no pointer to the cause.
The G-37-5 save test checks only the request body. It never asserts the `Transformers saved.`
message, so a save that fires but whose result is mishandled would still pass.
**Fix:** In the comment, name the source (`_variables.scss $orange`). After the `cy.wait`, add
`cy.contains('.alert-success', 'Transformers saved.').should('be.visible')`.

---

_Reviewed: 2026-10-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
