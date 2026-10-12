---
status: complete
phase: 37-transformer-parity
source: [37-01-SUMMARY.md]
started: 2026-10-12T12:25:00Z
updated: 2026-10-12T12:36:20.118Z
---

## Current Test

[testing complete]

## Tests

### 1. Create a transformer in the Vue console
expected: On the Vue Transformers page on rtm.thinx.cloud, creating a transformer with a name and body shows it in the list, and it is still there after a page reload.
result: pass

### 2. Edit a transformer safely
expected: Opening an existing transformer in the editor loads its name and body; Save stays disabled until it has loaded and while the name is blank. Saving a change persists it after reload, and the transformer is never blanked.
result: pass

### 3. Profile and transformers do not overwrite each other
expected: After creating or editing a transformer, your profile (name, notification settings) is unchanged. Saving the profile or the notification settings afterwards does not remove any transformer (check the Transformers list after reload).
result: pass

### 4. Select existing transformers on a device
expected: On a device's detail page, the transformer selector lists your existing transformers; selecting one or more and saving the device keeps that assignment after reload.
result: pass

### 5. Transformer checkboxes and Create & Assign (re-test after G-37-5)
expected: On a device's detail page, the Transformer Assignment card shows one checkbox per transformer, ticked for those enabled on the device; ticking/unticking and Save Transformers persists after reload. Create & Assign still creates and assigns a new transformer while keeping existing assignments. "Manage Transformers" is a filled orange button that opens the Transformers page.
result: pass
previous_result: issue — "pass, but the list of transformers should have checkboxes rather than selecting lines to see which of those are enabled for the device" (fixed by 37-02-PLAN.md)

### 6. Legacy console still sees the transformers
expected: Transformers created or edited in the Vue console appear (with the same name) in the legacy console's transformer list, and the legacy console still works with them.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-37-5
  truth: "On device detail, the transformer list shows a checkbox per transformer, checked for the ones enabled on the device, instead of a multi-select where you highlight lines"
  status: resolved
  reason: "User reported: pass, but the list of transformers should have checkboxes rather than selecting lines to see which of those are enabled for the device"
  severity: minor
  test: 5
  resolved_by: 37-02-PLAN.md
  resolved_at: 2026-10-12
  root_cause: "DeviceDetail.vue:110 renders the device's transformer assignment as <b-form-select multiple v-model=editForm.transformers :select-size=5>: a native multi-select where assignment is shown only by highlighted lines and changed by (ctrl/cmd-)clicking, so it is not obvious which transformers are enabled for the device."
  artifacts:
    - path: "services/console/vue/src/pages/Devices/DeviceDetail.vue"
      issue: "Line 110: multi-select list instead of one checkbox per transformer"
  missing:
    - "Replace the multi-select with a checkbox group (b-form-checkbox-group stacked, same v-model editForm.transformers and transformerOptions), one checkbox per transformer, checked when assigned"
    - "Operator addition 2026-10-12: \"The \\\"Manage transformers\\\" button should be at least with orange background (not clear/transparent).\" -> variant=warning ($orange #E49400), not variant=link"
    - "Keep save, Create & Assign (35 WR-02: assignment built from device.transformers plus the new utid) and the empty state unchanged"
    - "Unit test in vue/tests/unit/milestone-v116.cjs: the Edit Device form renders a checkbox group bound to editForm.transformers, no multiple select; Cypress assertions that use the select updated"
  debug_session: ""
