---
gsd_state_version: "1.0"
milestone: v1.17
milestone_name: Deploy-Key OpenBao Transit
current_phase: 39
current_phase_name: Internal OpenBao on the Swarm
status: planning
stopped_at: "Phase 39 research interrupted: research agent reports workspace out of credits; partial findings saved; planning and independent checking not started"
last_updated: "2026-10-12T14:34:03.879Z"
last_activity: 2026-10-09
last_activity_desc: v1.17 roadmap created (3 phases, 17/17 requirements mapped)
state_head: 727a1de456c20b4d74bd7ba5605353df95c45236
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-09) and `.planning/workstreams/vault-transit/REQUIREMENTS.md`

**Core value:** Possession of the deploy-key files (GlusterFS volume, backup, snapshot, file-read bug) must not be sufficient to decrypt any owner's git deploy private key, while THiNX still clones and builds autonomously with the owner logged out.
**Current focus:** Phase 39, Internal OpenBao on the Swarm

## Current Position

Phase: 39 of 39–41 (Internal OpenBao on the Swarm)
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

- D-01: Transit encrypts the whole private-key blob (`thinx-deploy-keys`); no local DEK crypto, no OpenBao KV storage.
- D-02: Node-local root-only unseal key with automatic unseal; residual risk is full compromise of that node.
- D-03: OpenBao only on a dedicated internal overlay; dormant `vault.thinx.cloud` routers removed; operator access via ssh + `docker exec`.
- D-04: Dual-read until migration reports zero legacy keys; only then remove the legacy path and `GIT_KEY_PASSPHRASE`.
- D-05: v1.15 Phase 34 D-20 (vault.yml re-pin to `hashicorp/vault`) is superseded by VAULT-01 (`openbao/openbao`); if 34 lands first, Phase 39 replaces its pin.
- D-06 (2026-10-09): OpenBao instead of HashiCorp Vault — Vault CE has no auto-unseal from a local key file; OpenBao `seal "static"` (≥ 2.4.0) does, with the same Transit/AppRole API.
- Roadmap: 3 phases (coarse). OpenBao first (39), API dual-read (40; code/CI may overlap 39, cut-over may not), then migration + removal + rotation (41).

### Pending Todos

None yet.

### Blockers/Concerns

- [D-05 resolved 2026-10-12] Archived `.planning/milestones/v1.15-ROADMAP.md` records that Phase 34 D-20 was dropped and moved to v1.17. Phase 39 owns the OpenBao replacement; inspect the current vault.yml during planning.
- [Phase 40] Must not reach `thinx-staging` before Phase 39 is live: KEYENC-03 refuses key generation without OpenBao, and a `thinx-staging` push deploys to production. Use a non-deploying CI branch (e.g. `thinx-unit`) until then.
- [Phase 39] Node-local Raft + static-seal key bind OpenBao to one node; confirm the manager set and pin by hostname. Decide how the seal key reaches the container (bind mount vs swarm secret).
- [Phase 41] Pre-migration backup, pre-migration Gluster backups and DO VM snapshots hold `thinx`-passphrase keys — ACCEPTED residual risk (operator, 2026-10-09); no destroy/re-issue requirement.

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| requirement | KEYMIG-04 PwnDoc retest of finding `6ac64bcfdd94eb38dba4c3a4` | Future | 2026-10-09 | v1.17 |
| requirement | Cloud-KMS auto-unseal; OpenBao Raft HA | Future | 2026-10-09 | v1.17 |

## Session Continuity

**Last session:** 2026-10-12T14:34:03.850Z
**Stopped At:** Phase 39 research interrupted: research agent reports workspace out of credits; partial findings saved; planning and independent checking not started
**Resume File:** .planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/.continue-here.md
