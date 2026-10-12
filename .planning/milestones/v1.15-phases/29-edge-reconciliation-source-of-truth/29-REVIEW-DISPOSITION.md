---
phase: 29-edge-reconciliation-source-of-truth
source: 29-REVIEW.md
generated: 2026-10-06
findings_total: 7
open: 0
fixed: 0
skipped: 0
deferred: 7
---

# Phase 29 — Code Review Disposition Ledger

One row per finding from `29-REVIEW.md`. Default disposition is `open`. A human may set a row to
`fixed`, `skipped`, or `deferred` and write the reason in the Source column. Advisory — this ledger
never blocks phase completion. These are quality findings on the 29-01 generator/checker scripts;
none are Critical.

Re-dispositioned 2026-10-12 by quick 261012-fqh: all seven deferred. The mirror scripts are unchanged since
`44582e7f`, so none is fixed.

| ID | Severity | Disposition | Source / reason |
|----|----------|-------------|-----------------|
| WR-01 | warning | deferred | basicauth redaction misses `${VAR?default}` username form (latent; no live leak — current source only carries the handled pilot token); deferred 2026-10-12: latent: the mirror covers thinx-swarm `traefik.yml` only (`MIRROR OK files=1`), which has had 0 `basicauth.users=` labels since P33 Stage A and whose only templated value is the `EMAIL` placeholder; re-open if the mirrored file set grows → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
| WR-02 | warning | deferred | redaction is a 3-pattern allowlist; generic secret flags leak verbatim (latent); deferred 2026-10-12: latent: the mirror covers thinx-swarm `traefik.yml` only (`MIRROR OK files=1`), 0 `basicauth.users=` labels since P33 Stage A, only templated value the `EMAIL` placeholder; re-open if the mirrored file set grows → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
| WR-03 | warning | deferred | banner SHA from `git HEAD` vs body read from working tree — dirty swarm checkout mismatch; deferred 2026-10-12: procedurally mitigated: every P31–P34 regeneration ran on a clean thinx-swarm checkout (P34 records tracked-dirty 0) → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
| WR-04 | warning | deferred | banner contract duplicated across both scripts, no shared source / round-trip test; deferred 2026-10-12: one shared-module fix together with IN-01 → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
| IN-01 | info | deferred | duplicated sha256()/parseArgs()/constants across both scripts; deferred 2026-10-12: one shared-module fix together with WR-04 → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
| IN-02 | info | deferred | body hash line-ending sensitive; no `.gitattributes` LF pin (CI is Linux — not live); deferred 2026-10-12: still no `.gitattributes`; CI is Linux → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
| IN-03 | info | deferred | `resolveSwarmHead` does not 40-hex-validate the HEAD before comparison; deferred 2026-10-12: still open in `scripts/check-traefik-mirror.js` (`resolveSwarmHead` returns the trimmed `rev-parse` output unvalidated) → edge runbook § Recorded for later (after Phase 34), 261012-fqh |
