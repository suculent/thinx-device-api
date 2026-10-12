---
status: testing
phase: 36-build-log-access
source: [36-01-SUMMARY.md]
started: 2026-10-12T11:40:00Z
updated: 2026-10-12T11:40:00Z
---

## Current Test

number: 1
name: Full build log from Recent Builds
expected: |
  In the Vue console on rtm.thinx.cloud, the dashboard's Recent Builds list lets you open a build's log. A dialog opens showing a loading state, then the complete build log (all lines, not a truncated preview). Closing the dialog returns you to the dashboard.
awaiting: user response

## Tests

### 1. Full build log from Recent Builds
expected: In the Vue console on rtm.thinx.cloud, the dashboard's Recent Builds list lets you open a build's log. A dialog opens showing a loading state, then the complete build log (all lines, not a truncated preview). Closing the dialog returns you to the dashboard.
result: [pending]

### 2. Full build log from History
expected: On the History page, the Builds table has an "Open build log" button on each row that opens the same full-log dialog, and clicking a row with the mouse also opens it. Using the keyboard (Tab to a row's Expand or "Open build log" button, then Enter or Space) triggers that button's own action, and selecting text in a row does not open the dialog.
result: [pending]

### 3. Full build log from Device Build History
expected: On a device's detail page, a row in Build History opens the same full-log dialog for that build, by click or by Enter on the focused row.
result: [pending]

### 4. Empty and error states in the log dialog
expected: Opening the log of a build that produced no log output shows a clear empty message rather than a blank dialog or endless spinner. If the log cannot be loaded, the dialog shows an error message instead of hanging.
result: [pending]

### 5. Timed-out builds show TIMEOUT
expected: A build that timed out, or one still marked running long past the build timeout, is shown with a TIMEOUT status (not RUNNING) in Recent Builds, History and Device Build History. Builds that finished keep their real result (success/failed).
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
