---
phase: 48
review: 48-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "A network failure now resolves as an empty success-less reply, so outages render as empty data with no error"
  - id: WR-01
    severity: warning
    disposition: open
    title: "`response.text()` is still outside the new try, so the \"never rejects\" guarantee is partial"
  - id: WR-02
    severity: warning
    disposition: open
    title: "The restored Legacy image is built and published without the Legacy unit tests gating it"
  - id: WR-03
    severity: warning
    disposition: open
    title: "The console repo's `test_vue` job still runs unpinned lifecycle scripts with the `sonarcloud` credential context"
  - id: WR-04
    severity: warning
    disposition: open
    title: "The Legacy failed-build toast still reads `response.status`, a field the build reply does not have"
  - id: IN-01
    severity: info
    disposition: open
    title: "The deep-link spec is coupled to the exact count of dashboard reads"
  - id: IN-02
    severity: info
    disposition: open
    title: "The dev-server proxy sends anything not stubbed to production"
  - id: IN-03
    severity: info
    disposition: open
    title: "The gated suite and the shipped image resolve dependencies independently"
  - id: IN-04
    severity: info
    disposition: open
    title: "Video artifacts are stored although `cy:test:ci` disables video"
  - id: IN-05
    severity: info
    disposition: open
    title: "Logged-out deep-link cold load issues two token exchanges"
  - id: IN-06
    severity: info
    disposition: open
    title: "`outline: none` on `:focus` removes the ring where `:focus-visible` is unsupported"
  - id: IN-07
    severity: info
    disposition: open
    title: "Leftovers from the untracked env file and JUnit file-name collisions"
open: 12
total: 12
recorded: 2026-10-16T15:11:54.090Z
---

# Phase 48: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
