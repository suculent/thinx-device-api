---
phase: 47
review: 47-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "The \"has a build log\" predicate is inconsistent: truthy in templates, non-empty string in the dialog"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "History rows without a `build_id` still look clickable, but the click now does nothing"
  - id: IN-01
    severity: info
    disposition: open
    title: "Matches after the 1000th can never be reached"
  - id: IN-02
    severity: info
    disposition: open
    title: "The 3-character threshold and the error message are each defined in more than one place; `error` text is never shown"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "`ref=\"searchInput\"` is never used and has the same name as a data property"
  - id: IN-04
    severity: info
    disposition: open
    title: "The Dashboard audit card still has the muted text and inline style this phase removed from the builds card"
  - id: IN-05
    severity: info
    disposition: open
    title: "The Cypress \"0 requests\" check passes on its first poll and cannot see a delayed request; `:last` is a deprecated jQuery selector"
  - id: IN-06
    severity: info
    disposition: open
    title: "The 1273-line unit test copies the SFC harness, and the new UI has no e2e coverage"
  - id: IN-07
    severity: info
    disposition: open
    title: "Build-id rules still exist outside `hasBuildLog`, and the P3 guard cannot see them"
  - id: IN-08
    severity: info
    disposition: open
    title: "A History row can show an inline log excerpt and \"No build log\" in the same cell"
  - id: IN-09
    severity: info
    disposition: open
    title: "Test names and messages still say \"Open build log\""
  - id: IN-10
    severity: info
    disposition: open
    title: "The WR-01 source guard on the History row can no longer see added listeners"
open: 9
total: 12
recorded: 2026-10-15T11:20:00.000Z
---

# Phase 47: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed (console 83cc7cc, 9daa778, 54734af) | - |
| WR-02 | warning | fixed (console 9daa778) | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | fixed (console 83cc7cc) | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | 47-REVIEW 2026-10-15T11:16Z (gap re-review) |
| IN-08 | info | open | 47-REVIEW 2026-10-15T11:16Z (gap re-review) |
| IN-09 | info | open | 47-REVIEW 2026-10-15T11:16Z (gap re-review) |
| IN-10 | info | open | 47-REVIEW 2026-10-15T11:16Z (gap re-review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
