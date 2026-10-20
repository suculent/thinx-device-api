---
phase: 37
review: 37-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Assigned transformer IDs with no matching option are invisible and cannot be removed; the empty-state line can be false"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Assignment-failure message still refers to \"the list\""
  - id: IN-02
    severity: info
    disposition: fixed
    title: "The emphasised Manage Transformers button drops unsaved checkbox changes without warning"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "Cypress colour assertion is tied to the theme value; the save test does not check UI feedback"
open: 0
total: 4
recorded: 2026-10-12T12:39:16.856Z
---

# Phase 37: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed (console ff6e809) | - |
| IN-01 | info | fixed (console ff6e809) | - |
| IN-02 | info | fixed (console dac2c5e, d526ff7) | - |
| IN-03 | info | fixed (console a16307a) | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
