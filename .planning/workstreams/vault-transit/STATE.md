---
gsd_state_version: "1.0"
milestone: v1.17
milestone_name: Deploy-Key OpenBao Transit
current_phase: 39
current_phase_name: Internal OpenBao on the Swarm
status: verifying
stopped_at: Phase 40 context gathered
last_updated: "2026-10-18T20:28:53.337Z"
last_activity: 2026-10-18
last_activity_desc: Phase 39 execution started
state_head: d2e956cff754e490729c2c58e9e9892a8c5a35e8
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
Plan: 6 of 6
Status: Phase complete — ready for verification
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
| Phase 39 P02 | 43 min | 3 tasks | 6 files |
| Phase 39 P03 | 130 min | 3 tasks | 13 files |
| Phase 39 P05 | 5h03m | 3 tasks | 7 files |
| Phase 39 P06 | 33min | 3 tasks | 5 files |

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
- [Phase 39]: Recovery share and bootstrap root live only in 0600 tmpfs files between bootstrap invocations; share deleted on matching archive receipt, root on revocation
- [Phase 39]: Root revocation gated on 4 custody receipts (share, config-named seal generations, CA key, CA cert) and 5 fresh proofs (operator login, API canary, backup snapshot, audit canary, recorded A1 exact-image run)
- [Phase 39]: Installer makes openbao.hcl the only file in /etc/openbao/config; emergency-unix.hcl staged at /etc/openbao/emergency-unix.hcl; --init-tls does first issuance into tls/r<UTC> + current symlink
- [Phase 39]: Recovery archive: fixed 64 MB AES-256 UDIF/APFS image, Keychain never used by verify, custody proven by sha256 receipts compared in memory on micro
- [Phase 39]: Raft snapshots stream via bao snapshot save /dev/stdout and are inspected on the host (2.7.1 has no snapshot inspect); a pair is a <stem>/ dir finalized by one atomic rename on micro and core
- [Phase 39]: core receives snapshots only through a restrict,from=micro,command= forced receiver: fixed verbs/stems, size+sha256 before rename, no overwrite, prune never empties a node; local-only success is a failure
- [Phase 39]: Issuer renewal at 120 days remaining (30 d + 90 d leaf lifetime); it fails closed until Plan 06 runs openbao-cert-renew.sh --arm-api-trust; leaf renewal at 30 days works unarmed
- [Phase 39]: deploy_api_trust: immutable openbao-ca-<sha20> Docker config, 0600 spec backup, one targeted thinx_api update, in-task Node probe (pinned one-shot job when the task is on core), rollback of server dir AND API config
- [Phase 39]: Incident alerts: durable flock'd per-job state (healthy/failure-pending/failure-sent/recovery-pending); ambiguous acknowledgement retried once then assumed delivered
- [Phase 39]: Restore rehearsal refuses image/generation/path/staleness mismatches before reading key bytes; --verify-recorded-matrix defaults to config generations plus every generation a retained snapshot needs
- [Phase 39]: Seal rotation retires the old generation in two restarts: new-only config with the old key file still on disk (cheap rollback), then shred and restart again
- [Phase 39]: Restore rehearsals of an overlap snapshot take the current seal from the offline archive and the previous seal from the runtime file (separate fd)
- [Phase 39]: Fixture suites install a first-deploy (g1-only) vault.conf; exact-image suite stages every generation the committed config names
- [Phase 39]: seal-g1 stays in the offline archive until every snapshot naming it ages out (not before 2027-01-16)
- [Phase 39]: After any thinx-swarm push to origin master, wait for the CI errorpage/downtime redeploy before running the edge gate
- [Phase 39]: 39-06: thinx_api attached to OpenBao by one targeted service update (overlay, BAO_ROLE_ID/BAO_SECRET_ID, openbao-ca config, BAO_ADDR/BAO_CACERT) from a 0600 node-local spec backup
- [Phase 39]: 39-06: source YAMLs pin the CA config the trust consumer reports (openbao-ca-a2b56707515146d7a580); re-pin after every issuer swap
- [Phase 39]: 39-06: CA config mode left at the Docker default 0444 (YAML 1.2 reads 0444 as decimal)
- [Phase 39]: 39-06: authenticated owner-path WS gate is operator-only; any x-thx-core value gets 101, only a socket held open proves a session

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

**Last session:** 2026-10-18T20:28:53.283Z
**Stopped At:** Phase 40 context gathered
**Resume File:** .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-CONTEXT.md
