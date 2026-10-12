---
status: diagnosed
phase: 36-build-log-access
source: [36-01-SUMMARY.md]
started: 2026-10-12T11:40:00Z
updated: 2026-10-12T11:18:09.937Z
---

## Current Test

[testing complete]

## Tests

### 1. Full build log from Recent Builds
expected: In the Vue console on rtm.thinx.cloud, the dashboard's Recent Builds list lets you open a build's log. A dialog opens showing a loading state, then the complete build log (all lines, not a truncated preview). Closing the dialog returns you to the dashboard.
result: pass

### 2. Full build log from History
expected: On the History page, the Builds table has an "Open build log" button on each row that opens the same full-log dialog, and clicking a row with the mouse also opens it. Using the keyboard (Tab to a row's Expand or "Open build log" button, then Enter or Space) triggers that button's own action, and selecting text in a row does not open the dialog.
result: pass

### 3. Full build log from Device Build History
expected: On a device's detail page, a row in Build History opens the same full-log dialog for that build, by click or by Enter on the focused row.
result: issue
reported: "the history should not list full build logs (only on \"Open build log\" -> \"View\" / it is to slow to load now."
severity: major

### 4. Empty and error states in the log dialog
expected: Opening the log of a build that produced no log output shows a clear empty message rather than a blank dialog or endless spinner. If the log cannot be loaded, the dialog shows an error message instead of hanging.
result: pass

### 5. Timed-out builds show TIMEOUT
expected: A build that timed out, or one still marked running long past the build timeout, is shown with a TIMEOUT status (not RUNNING) in Recent Builds, History and Device Build History. Builds that finished keep their real result (success/failed).
result: pass

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-36-3
  truth: "Device Build History lists builds without loading or showing full build logs inline, so it loads quickly; the full log appears only in the dialog opened via \"Open build log\" -> \"View\""
  status: failed
  reason: "User reported: the history should not list full build logs (only on \"Open build log\" -> \"View\" / it is to slow to load now."
  severity: major
  test: 3
  root_cause: "DeviceDetail.vue Build History rows are themselves buttons (tabindex=0 role=button, unguarded @click/@keydown.enter/@keydown.space -> openBuildLog), so any row click or keyboard pass fetches the full log via GET /api/v2/logs/build/:id; that response is the whole build.log read synchronously from GlusterFS and sent uncompressed as a JSON Buffer byte array (~3.4x log size). The pre-existing 'Device Logs (last build)' card under Build History also renders log lines inline in a terminal-styled <pre>. The list endpoint itself carries no full logs."
  artifacts:
    - path: "services/console/vue/src/pages/Devices/DeviceDetail.vue"
      issue: "Build History <tr> is the full-log trigger (no explicit Open build log control); 'Device Logs (last build)' card renders log text inline"
    - path: "lib/thinx/buildlog.js"
      issue: "_fetch reads build.log with readFileSync and returns a Buffer (secondary: payload size)"
    - path: "lib/thinx/util.js"
      issue: "respond JSON-serializes the Buffer as a byte array, uncompressed (secondary)"
  missing:
    - "Operator direction 2026-10-12: remove inline logs from device build history"
    - "Remove the inline 'Device Logs (last build)' log card from the device detail page"
    - "Make Build History rows summary-only (no row-as-button full-log trigger); add an explicit per-row 'Open build log' button that opens BuildLogDialog, as History.vue does"
  debug_session: ".planning/debug/device-build-history-full-logs.md"
