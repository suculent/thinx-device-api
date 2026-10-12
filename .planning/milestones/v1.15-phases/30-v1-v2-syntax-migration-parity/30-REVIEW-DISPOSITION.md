---
phase: 30
review: 30-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Duplicate `traefik-public-https.middlewares` label silently overrides the auth chain"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Inline comment contradicts `exposedbydefault=true` (comment hygiene only)"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "Misplaced certresolver comment above the `mqtt` entrypoint"
  - id: IN-03
    severity: info
    disposition: deferred
    title: "`vpn` entrypoint comment says `1194/udp` but the address binds TCP"
  - id: IN-04
    severity: info
    disposition: deferred
    title: "`net` overlay network declared but never referenced"
open: 0
total: 5
recorded: 2026-10-07T13:12:18.410Z
---

# Phase 30: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 31-REVIEW-FIX IN-03 (thinx-swarm `677e3a9`, this repo `f90440d5`) removed the duplicate label; P33 Stage A then removed the router and admin-auth entirely (0 `traefik-public-https` in traefik.yml) |
| IN-01 | info | fixed | 31-REVIEW-FIX IN-02 (`677e3a9`) corrected the comment, then P33 Stage B (D-07) flipped the flag to `exposedbydefault=false`; comment and flag now agree |
| IN-02 | info | fixed | 31-REVIEW-FIX IN-02 (`677e3a9`) moved the certresolver comment to directly above the `acme.email` flag |
| IN-03 | info | deferred | the vpn comment still says 1194/udp over a TCP address; the entrypoint is vestigial (P30 D-03) → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
| IN-04 | info | deferred | the `net` overlay is still declared and unused (same as 32 IN-08 and 33 IN-05) → edge runbook § Recorded for later (after Phase 34), 261012-fqh |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
