---
gsd_state_version: "1.0"
milestone: v1.17
milestone_name: Deploy-Key Vault Transit
status: planning
last_updated: "2026-10-09T14:00:00.000Z"
last_activity: 2026-10-09
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-09) and `.planning/workstreams/vault-transit/REQUIREMENTS.md`

**Core value:** Possession of the deploy-key files (GlusterFS volume, backup, snapshot, file-read bug) must not be sufficient to decrypt any owner's git deploy private key, while THiNX still clones and builds autonomously with the owner logged out.
**Current focus:** Phase 39, Internal Vault on the Swarm

## Current Position

Phase: 39 of 39–41 (Internal Vault on the Swarm)
Plan: — (not planned yet)
Status: Ready to plan
Last activity: 2026-10-09 — v1.17 roadmap created (3 phases, 17/17 requirements mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Milestone-start decisions (full text in REQUIREMENTS.md, "Decisions taken at milestone start"):

- D-01: Transit encrypts the whole private-key blob (`thinx-deploy-keys`); no local DEK crypto, no Vault KV storage.
- D-02: Node-local root-only unseal key with automatic unseal; residual risk is full compromise of that node.
- D-03: Vault only on a dedicated internal overlay; dormant `vault.thinx.cloud` routers removed; operator access via ssh + `docker exec`.
- D-04: Dual-read until migration reports zero legacy keys; only then remove the legacy path and `GIT_KEY_PASSPHRASE`.
- D-05: v1.15 Phase 34 D-20 (vault.yml re-pin) is absorbed by VAULT-01; if 34 lands first, Phase 39 builds on it.
- Roadmap: 3 phases (coarse). Vault first (39), API dual-read (40; code/CI may overlap 39, cut-over may not), then migration + removal + rotation (41).

### Pending Todos

None yet.

### Blockers/Concerns

- [D-05] Phase 34 D-20 (flat-ROADMAP plan 34-03, on disk in `34-04-PLAN.md`) conflicts with a deployed internal Vault ("NOT DEPLOYED", redirect-only `vault-http`, "never deploy vault"). Whichever lands second must reconcile vault.yml.
- [Phase 40] Must not reach `thinx-staging` before Phase 39 is live: KEYENC-03 refuses key generation without Vault, and a `thinx-staging` push deploys to production. Use a non-deploying CI branch (e.g. `thinx-unit`) until then.
- [Phase 39] Node-local Raft + unseal key bind Vault to one node; confirm the manager set and pin by hostname. Auto-unseal mechanism for a file-held key needs research.
- [Phase 41] Pre-migration backup, pre-migration Gluster backups and DO VM snapshots hold `thinx`-passphrase keys — ACCEPTED residual risk (operator, 2026-10-09); no destroy/re-issue requirement.

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| requirement | KEYMIG-04 PwnDoc retest of finding `6ac64bcfdd94eb38dba4c3a4` | Future | 2026-10-09 | v1.17 |
| requirement | Cloud-KMS auto-unseal; Vault Raft HA | Future | 2026-10-09 | v1.17 |

## Session Continuity

**Stopped At:** Roadmap created; next is `/gsd-discuss-phase 39`
**Resume File:** None
