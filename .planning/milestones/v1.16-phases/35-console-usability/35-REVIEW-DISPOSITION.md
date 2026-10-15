---
phase: 35
review: 35-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "The transformer editor stays saveable after a failed load, and Save blanks the transformer"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Clickable History rows take over Enter and Space from the buttons inside them"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "\"Create & Assign\" also saves the user's unsaved transformer selection"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "The new top \"Environment\" action silently discards an open environment draft"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Whole-`info` profile writes can now overwrite the transformer list"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "A failed deploy-key list request shows \"No deploy keys yet.\" with no error"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "Deleting deploy keys has no confirmation"
  - id: WR-07
    severity: warning
    disposition: fixed
    title: "The header rename breaks a Cypress spec, and the new unit tests are not run in CI"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "`parseResult` now returns `{}` instead of `undefined` for envelopes with no data key"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "A failed re-fetch after a successful transformer write is reported as a failed create"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "Legacy create handler: dead parse branch, and an exception in `.done` skips `.always`"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "Server-side key-name rejections show a generic error"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "The legacy deploy-key goal check no longer matches its sibling handlers"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "Markup and status-styling issues in the new clickable lists"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "Minor `BuildLogDialog` issues"
  - id: IN-08
    severity: info
    disposition: fixed
    title: "Test coverage gaps"
open: 0
total: 16
recorded: 2026-10-12T11:11:40.888Z
---

# Phase 35: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 35-REVIEW-FIX.md |
| WR-01 | warning | fixed | 35-REVIEW-FIX.md |
| WR-02 | warning | fixed | 35-REVIEW-FIX.md |
| WR-03 | warning | fixed | 35-REVIEW-FIX.md |
| WR-04 | warning | fixed | 35-REVIEW-FIX.md |
| WR-05 | warning | fixed | 35-REVIEW-FIX.md |
| WR-06 | warning | fixed | 35-REVIEW-FIX.md |
| WR-07 | warning | fixed | 35-REVIEW-FIX.md |
| IN-01 | info | fixed | console `056ef3c` (Phase 48, 48-01) |
| IN-02 | info | fixed | console `ed429ec` (Phase 46, 46-02) |
| IN-03 | info | fixed | console `2105310` (Phase 48, 48-04, Legacy) |
| IN-04 | info | fixed | console `31ed738` (Phase 45, Vue); console `2105310` (Phase 48, 48-04, Legacy) |
| IN-05 | info | fixed | console `bff9552` (Phase 48, 48-04, Legacy) |
| IN-06 | info | fixed | console `38eb95b`, `f64a153` (Phase 47) |
| IN-07 | info | fixed | console `002e051` (Phase 47, 47-01) |
| IN-08 | info | fixed | console `824687f`, `794f357` (Phase 48, 48-01, Vue) and `efc66f6` (Phase 48, 48-04, Legacy); existing checks cited in 48-01-SUMMARY (IN-08 coverage map) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
