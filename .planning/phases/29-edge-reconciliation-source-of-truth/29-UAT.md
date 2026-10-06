---
status: testing
phase: 29-edge-reconciliation-source-of-truth
source: [29-VERIFICATION.md]
started: 2026-10-06T20:05:00Z
updated: 2026-10-06T20:05:00Z
---

## Current Test

number: 1
name: Live :7442 entrypoint equals committed thinx-swarm
expected: |
  `docker service inspect traefik_traefik` on micro shows
  `--entrypoints.thxp.address=:7442` on the running task, matching committed
  thinx-swarm/traefik.yml (EDGE-02 zero-diff for :7442).
awaiting: user response

## Tests

### 1. Live :7442 entrypoint equals committed thinx-swarm
expected: running traefik task carries `--entrypoints.thxp.address=:7442`, equal to committed.
result: [pending]
orchestrator_evidence: CONFIRMED live 2026-10-06 — `ssh micro "docker service inspect traefik_traefik --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}'"` includes `--entrypoints.thxp.address=:7442`.

### 2. Out-of-git rollback baseline present at mode 600 on micro
expected: `/mnt/data/edge-rollback/traefik-2026-10-06/` is root-owned dir 700; `acme.json` and `resolved-snapshot.yml` are mode 600 root (SC4 — lives out-of-git, no committed artifact can prove it).
result: [pending]
orchestrator_evidence: CONFIRMED live 2026-10-06 — `stat` → `700 root` dir, `600 root acme.json`, `600 root resolved-snapshot.yml`.

### 3. traefik-edge.A.pre.yml fidelity to current live state
expected: committed redacted snapshot faithfully reflects the live edge (command flags, entrypoints, labels).
result: [pending]
orchestrator_evidence: CONFIRMED live 2026-10-06 — live `Args` count = 18 equals the snapshot's 18 command-flag lines; snapshot built directly from the live capture, secrets redacted.

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
