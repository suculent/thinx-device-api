---
phase: 46
review: 46-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "Saving any other Device Detail field silently discards unsaved transformer ticks (and vice versa)"
  - id: WR-01
    severity: warning
    disposition: open
    title: "`apienv.create` ignores Redis errors and reports success before the write is acknowledged, so the D-01/D-04 safety claim does not hold"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Env store `refreshAfter` misses API-level refresh failures, so the page shows a stale list as if it were current"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Edit value (and Add) silently trims secret values"
  - id: WR-04
    severity: warning
    disposition: open
    title: "`apienv.revoke` iterates a string `names` character by character (D-02 \"any sibling\" not fully covered)"
  - id: WR-05
    severity: warning
    disposition: open
    title: "After a successful transformer save, a failed device re-read reverts the ticks while \"Transformers saved.\" is shown"
  - id: IN-01
    severity: info
    disposition: open
    title: "Leave guard prompts \"unsaved changes\" after a successful revoke or transfer"
  - id: IN-02
    severity: info
    disposition: open
    title: "Inconsistent transformer-name duplicate and trim handling across pages"
  - id: IN-03
    severity: info
    disposition: open
    title: "Delete dialog usage count can be stale"
  - id: IN-04
    severity: info
    disposition: open
    title: "Editing a variable deleted in another session silently re-creates it"
open: 10
total: 10
recorded: 2026-10-13T21:45:41.730Z
---

# Phase 46: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | 46-REVIEW.md |
| WR-01 | warning | open | 46-REVIEW.md |
| WR-02 | warning | open | 46-REVIEW.md |
| WR-03 | warning | open | 46-REVIEW.md |
| WR-04 | warning | open | 46-REVIEW.md |
| WR-05 | warning | open | 46-REVIEW.md |
| IN-01 | info | open | 46-REVIEW.md |
| IN-02 | info | open | 46-REVIEW.md |
| IN-03 | info | open | 46-REVIEW.md |
| IN-04 | info | open | 46-REVIEW.md |
