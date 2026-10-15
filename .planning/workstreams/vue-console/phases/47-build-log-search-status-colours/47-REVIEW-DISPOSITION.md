---
phase: 47
review: 47-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "The \"has a build log\" predicate is inconsistent: truthy in templates, non-empty string in the dialog"
  - id: WR-02
    severity: warning
    disposition: open
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
    disposition: open
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
open: 8
total: 8
recorded: 2026-10-15T09:47:36.000Z
---

# Phase 47: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
