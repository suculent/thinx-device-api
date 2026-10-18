---
gsd_state_version: "1.0"
milestone: v1.17
milestone_name: Deploy-Key OpenBao Transit
current_phase: 39
current_phase_name: Internal OpenBao on the Swarm
status: executing
stopped_at: Completed 39-01-PLAN.md
last_updated: "2026-10-18T10:26:33.032Z"
last_activity: 2026-10-18
last_activity_desc: Phase 39 execution started
state_head: 8f0e512e87252ffdf80c518868634009f6928647
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 6
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-09) and `.planning/workstreams/vault-transit/REQUIREMENTS.md`

**Core value:** Possession of the deploy-key files (GlusterFS volume, backup, snapshot, file-read bug) must not be sufficient to decrypt any owner's git deploy private key, while THiNX still clones and builds autonomously with the owner logged out.
**Current focus:** Phase 39 — Internal OpenBao on the Swarm

## Current Position

Phase: 39 (Internal OpenBao on the Swarm) — EXECUTING
Plan: 2 of 6
Status: Ready to execute
Last activity: 2026-10-18 — Phase 39 execution started

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
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 39 P01 | 55 min | 3 tasks | 11 files |

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
- [Phase 39]: OpenBao runs as uid 0 (BAO_SKIP_DROP_ROOT=1, SKIP_CHOWN=1), read-only rootfs, cap_drop ALL; server config is the directory /openbao/config so the emergency listener drops in as zz-emergency-unix.hcl
- [Phase 39]: No-valid-login recovery on 2.7.1 is proven: server-generated OTP via legacy sys/generate-root/attempt plus unauthenticated sys/decode-token over a 0600 container-local Unix socket (bao CLI OTP/decode helpers need an authenticated token)
- [Phase 39]: TLS under /openbao/tls/current (relative symlink to a versioned dir), leaf SANs openbao.internal, localhost, 127.0.0.1; healthcheck treats sealed as healthy
- [Phase 39]: thinx-api AppRole token 20m/1h with reusable SecretIDs and no default policy; backup AppRole 5m/15m; operator userpass 4h ttl=max=explicit_max, period 0, no Transit encrypt/decrypt
- [Phase 39]: Live preflight (scripts/openbao-preflight.sh --live) deferred to Plan 05; micro/core/path/overlay/edge facts stay blocking until it runs

### Pending Todos

None yet.

### Blockers/Concerns

- [D-05 resolved 2026-10-12] Archived `.planning/milestones/v1.15-ROADMAP.md` records that Phase 34 D-20 was dropped and moved to v1.17. Phase 39 owns the OpenBao replacement; inspect the current vault.yml during planning.
- [Phase 40] Must not reach `thinx-staging` before Phase 39 is live: KEYENC-03 refuses key generation without OpenBao, and a `thinx-staging` push deploys to production. Use a non-deploying CI branch (e.g. `thinx-unit`) until then.
- [Phase 39] Node-local Raft + static-seal key bind OpenBao to one node; confirm the manager set and pin by hostname. Decide how the seal key reaches the container (bind mount vs swarm secret).
- [Phase 41] Pre-migration backup, pre-migration Gluster backups and DO VM snapshots hold `thinx`-passphrase keys — ACCEPTED residual risk (operator, 2026-10-09); no destroy/re-issue requirement.
- [Phase 40] Phase 45 (vue-console, v1.18) landed first in lib/thinx/rsakey.js: `RSAKey.validateKeyName` is now the shared create/rename name rule and returns reason codes (`empty`, `too_long`, `control_chars`, `line_separator`, `bidi`); `rsakey.rename` rewrites only `<owner>-<ts>.pub` through a dot-prefixed temp file in the same directory and `renameSync`, keeps the file mode, and never opens the private file; `RSAKey.fingerprint` is the OpenSSH SHA256 over the decoded key blob (Phase 45 D-01), so a rename keeps it; and the D-08 display-name rule (`RSAKey.storedName`) shows the stored comment only on a single-line `ssh-` key that passes the validator. Phase 40 keeps the `.pub` as plaintext OpenSSH, keeps rename independent of private-key storage, and rebases on these (Phase 45 D-15).

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| requirement | KEYMIG-04 PwnDoc retest of finding `6ac64bcfdd94eb38dba4c3a4` | Future | 2026-10-09 | v1.17 |
| requirement | Cloud-KMS auto-unseal; OpenBao Raft HA | Future | 2026-10-09 | v1.17 |

## Session Continuity

**Last session:** 2026-10-18T10:26:02.015Z
**Stopped At:** Completed 39-01-PLAN.md
**Resume File:** None
