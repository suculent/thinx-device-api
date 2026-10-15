---
phase: 36
review: 36-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "The \"inert row\" guard checks only the `<tr>`. A cell-level click/keydown handler would pass both tests."
  - id: IN-01
    severity: info
    disposition: fixed
    title: "The Vue-warning assertion only covers `_render()`, not instance construction or `loadDevice()`"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "A row with an empty `build_id` gets a button labelled \"Open build log \" that fetches `/logs/build/<list index>`"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "`@getBuildDetail.all` length assertion passes on its first retry"
open: 0
total: 4
recorded: 2026-10-12T11:55:57.402Z
---

# Phase 36: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed (console 3bc6a4d, 591033e) | - |
| IN-01 | info | fixed (console 3bc6a4d) | - |
| IN-02 | info | fixed (console 38eb95b, 002e051) | - |
| IN-03 | info | fixed (console 591033e) | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
