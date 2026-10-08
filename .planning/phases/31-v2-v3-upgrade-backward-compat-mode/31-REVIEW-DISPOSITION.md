---
phase: 31
review: 31-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Rollback Step 3's mandatory Stage-C re-add is prose-only, un-dry-verified, and leaves a v2.11 network mis-pick window on the five multi-network services"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Two rollback statements still assert the dual-label bridge is harmless, contradicting the live correction, and the rollback end state is the exact configuration that broke v3"
  - id: IN-01
    severity: info
    disposition: open
    title: "`C.pre.yml` predicts \"4 provider flags -> 5\"; the actual and `C.post`-recorded count is 4"
  - id: IN-02
    severity: info
    disposition: open
    title: "Mirror comments contradict the flags they annotate (fix in `thinx-swarm/traefik.yml`, then regenerate)"
  - id: IN-03
    severity: info
    disposition: open
    title: "Duplicate label key `traefik-public-https.middlewares` relies on last-wins conversion"
  - id: IN-04
    severity: info
    disposition: open
    title: "`${DOMAIN}` is templated but its resolved value is written in the adjacent comment"
  - id: IN-05
    severity: info
    disposition: open
    title: "Dead Traefik v1 labels survive in `docker-swarm.yml` and misdescribe the console/vue security posture"
  - id: IN-06
    severity: info
    disposition: open
    title: "`HeadersRegexp` matcher depends entirely on the deprecated `core.defaultRuleSyntax=v2` switch"
open: 6
total: 8
recorded: 2026-10-08T11:18:17.000Z
---

# Phase 31: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 31-REVIEW-FIX.md |
| WR-02 | warning | fixed | 31-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
