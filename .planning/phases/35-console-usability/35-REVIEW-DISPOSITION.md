---
phase: 35
review: 35-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "The transformer editor stays saveable after a failed load, and Save blanks the transformer"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Clickable History rows take over Enter and Space from the buttons inside them"
  - id: WR-02
    severity: warning
    disposition: open
    title: "\"Create & Assign\" also saves the user's unsaved transformer selection"
  - id: WR-03
    severity: warning
    disposition: open
    title: "The new top \"Environment\" action silently discards an open environment draft"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Whole-`info` profile writes can now overwrite the transformer list"
  - id: WR-05
    severity: warning
    disposition: open
    title: "A failed deploy-key list request shows \"No deploy keys yet.\" with no error"
  - id: WR-06
    severity: warning
    disposition: open
    title: "Deleting deploy keys has no confirmation"
  - id: WR-07
    severity: warning
    disposition: open
    title: "The header rename breaks a Cypress spec, and the new unit tests are not run in CI"
  - id: IN-01
    severity: info
    disposition: open
    title: "`parseResult` now returns `{}` instead of `undefined` for envelopes with no data key"
  - id: IN-02
    severity: info
    disposition: open
    title: "A failed re-fetch after a successful transformer write is reported as a failed create"
  - id: IN-03
    severity: info
    disposition: open
    title: "Legacy create handler: dead parse branch, and an exception in `.done` skips `.always`"
  - id: IN-04
    severity: info
    disposition: open
    title: "Server-side key-name rejections show a generic error"
  - id: IN-05
    severity: info
    disposition: open
    title: "The legacy deploy-key goal check no longer matches its sibling handlers"
  - id: IN-06
    severity: info
    disposition: open
    title: "Markup and status-styling issues in the new clickable lists"
  - id: IN-07
    severity: info
    disposition: open
    title: "Minor `BuildLogDialog` issues"
  - id: IN-08
    severity: info
    disposition: open
    title: "Test coverage gaps"
open: 16
total: 16
recorded: 2026-10-12T10:43:52.603Z
---

# Phase 35: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
