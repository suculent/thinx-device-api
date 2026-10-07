---
phase: 30
review: 30-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Duplicate `traefik-public-https.middlewares` label silently overrides the auth chain"
  - id: IN-01
    severity: info
    disposition: open
    title: "Inline comment contradicts `exposedbydefault=true` (comment hygiene only)"
  - id: IN-02
    severity: info
    disposition: open
    title: "Misplaced certresolver comment above the `mqtt` entrypoint"
  - id: IN-03
    severity: info
    disposition: open
    title: "`vpn` entrypoint comment says `1194/udp` but the address binds TCP"
  - id: IN-04
    severity: info
    disposition: open
    title: "`net` overlay network declared but never referenced"
open: 5
total: 5
recorded: 2026-10-07T13:12:18.410Z
---

# Phase 30: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
