---
status: testing
phase: 37-transformer-parity
source: [37-01-SUMMARY.md]
started: 2026-10-12T12:25:00Z
updated: 2026-10-12T12:25:00Z
---

## Current Test

number: 1
name: Create a transformer in the Vue console
expected: |
  On the Vue Transformers page on rtm.thinx.cloud, creating a transformer with a name and body shows it in the list, and it is still there after a page reload.
awaiting: user response

## Tests

### 1. Create a transformer in the Vue console
expected: On the Vue Transformers page on rtm.thinx.cloud, creating a transformer with a name and body shows it in the list, and it is still there after a page reload.
result: [pending]

### 2. Edit a transformer safely
expected: Opening an existing transformer in the editor loads its name and body; Save stays disabled until it has loaded and while the name is blank. Saving a change persists it after reload, and the transformer is never blanked.
result: [pending]

### 3. Profile and transformers do not overwrite each other
expected: After creating or editing a transformer, your profile (name, notification settings) is unchanged. Saving the profile or the notification settings afterwards does not remove any transformer (check the Transformers list after reload).
result: [pending]

### 4. Select existing transformers on a device
expected: On a device's detail page, the transformer selector lists your existing transformers; selecting one or more and saving the device keeps that assignment after reload.
result: [pending]

### 5. Create & Assign from device detail
expected: On a device's detail page, Create & Assign creates a new transformer and assigns it to the device while keeping the device's existing transformer assignments. The new transformer also appears on the Transformers page.
result: [pending]

### 6. Legacy console still sees the transformers
expected: Transformers created or edited in the Vue console appear (with the same name) in the legacy console's transformer list, and the legacy console still works with them.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
