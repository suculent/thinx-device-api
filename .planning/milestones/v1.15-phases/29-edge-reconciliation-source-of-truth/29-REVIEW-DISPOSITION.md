---
phase: 29-edge-reconciliation-source-of-truth
source: 29-REVIEW.md
generated: 2026-10-06
findings_total: 7
open: 7
fixed: 0
skipped: 0
deferred: 0
---

# Phase 29 — Code Review Disposition Ledger

One row per finding from `29-REVIEW.md`. Default disposition is `open`. A human may set a row to
`fixed`, `skipped`, or `deferred` and write the reason in the Source column. Advisory — this ledger
never blocks phase completion. These are quality findings on the 29-01 generator/checker scripts;
none are Critical.

| ID | Severity | Disposition | Source / reason |
|----|----------|-------------|-----------------|
| WR-01 | warning | open | basicauth redaction misses `${VAR?default}` username form (latent; no live leak — current source only carries the handled pilot token) |
| WR-02 | warning | open | redaction is a 3-pattern allowlist; generic secret flags leak verbatim (latent) |
| WR-03 | warning | open | banner SHA from `git HEAD` vs body read from working tree — dirty swarm checkout mismatch |
| WR-04 | warning | open | banner contract duplicated across both scripts, no shared source / round-trip test |
| IN-01 | info | open | duplicated sha256()/parseArgs()/constants across both scripts |
| IN-02 | info | open | body hash line-ending sensitive; no `.gitattributes` LF pin (CI is Linux — not live) |
| IN-03 | info | open | `resolveSwarmHead` does not 40-hex-validate the HEAD before comparison |
