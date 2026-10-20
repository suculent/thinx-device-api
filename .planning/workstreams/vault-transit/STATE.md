---
gsd_state_version: "1.0"
milestone: v1.17
milestone_name: Deploy-Key OpenBao Transit
current_phase: 41
current_phase_name: Key Migration, Passphrase Retirement & Rotation
status: verifying
stopped_at: Completed 41-08-PLAN.md
last_updated: "2026-10-20T20:09:11.126Z"
last_activity: 2026-10-20
last_activity_desc: Phase 41 execution started
state_head: ab538d416e4fad33d1d2873d9c2853263c5d3f6a
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 8
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-09) and `.planning/workstreams/vault-transit/REQUIREMENTS.md`

**Core value:** Possession of the deploy-key files (GlusterFS volume, backup, snapshot, file-read bug) must not be sufficient to decrypt any owner's git deploy private key, while THiNX still clones and builds autonomously with the owner logged out.
**Current focus:** Phase 41 — Key Migration, Passphrase Retirement & Rotation

## Current Position

Phase: 41 (Key Migration, Passphrase Retirement & Rotation) — EXECUTING
Plan: 8 of 8
Status: Phase complete — ready for verification
Last activity: 2026-10-20 — Phase 41 execution started

Progress: [███████░░░] 67%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 39 | 6 | - | - |
| 40 | 5 | - | - |

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 39 P01 | 55 min | 3 tasks | 11 files |
| Phase 39 P02 | 43 min | 3 tasks | 6 files |
| Phase 39 P03 | 130 min | 3 tasks | 13 files |
| Phase 39 P05 | 5h03m | 3 tasks | 7 files |
| Phase 39 P06 | 33min | 3 tasks | 5 files |
| Phase 40 P01 | 9 min | 2 tasks | 9 files |
| Phase 40 P02 | 16 min | 3 tasks | 12 files |
| Phase 40 P03 | 10 min | 3 tasks | 11 files |
| Phase 40 P04 | 4 min | 2 tasks | 4 files |
| Phase 40 P05 | 50min | 3 tasks | 1 files |
| Phase 41 P01 | 16 min | 3 tasks | 6 files |
| Phase 41 P02 | 55min | 3 tasks | 1 files |
| Phase 41 P03 | 75min | 3 tasks | 13 files |
| Phase 41 P04 | 48 min | 3 tasks | 13 files |
| Phase 41 P05 | 40min | 3 tasks | 6 files |
| Phase 41 P06 | 31min | 3 tasks | 2 files |
| Phase 41 P07 | 53min | 3 tasks | 2 files |
| Phase 41 P08 | 23min | 3 tasks | 2 files |

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
- [Phase 40]: 40-01: a denied AppRole login is final (no retry); a denied, sealed, unreachable or server_error encrypt/decrypt gets one fresh login and one retry, at most four requests per key
- [Phase 40]: 40-01: Transit SNI servername only for DNS names; IP literals verify against the IP SAN without SNI
- [Phase 40]: 40-01: Transit Slack alerts username transit, channel thinx; undeliverable alerts dropped silently; webhook read lazily on first alert
- [Phase 40]: 40-01: invalid caller input to encryptKey/decryptKey is logged but opens no incident; malformed ciphertext is bad_ciphertext with no request
- [Phase 40]: 40-02: new deploy-key ciphertext holds bare unencrypted PKCS8 PEM, no owner header and no Transit AAD; cross-owner swap stays an accepted residual
- [Phase 40]: 40-02: fetchDetailed keyUnavailable is the first Transit reason of any class, bad_ciphertext included, and only when no attempt succeeded; fetch() stays boolean
- [Phase 40]: 40-02: withAgent raises only agent_start_failed or agent_load_failed; agentEnv deletes SSH_ASKPASS, SSH_ASKPASS_REQUIRE and GIT_KEY_PASSPHRASE; baseEnv drops SSH_AUTH_SOCK and SSH_AGENT_PID
- [Phase 40]: 40-02: generate() refusal is an Error with code key_service_unavailable and the reason; create() still answers callback(false) until 40-03 maps it
- [Phase 40]: 40-03: THINX_DEPLOY_KEYGEN is fail-closed; only unset, empty or exactly enabled generates, any other value refuses with key_service_unavailable
- [Phase 40]: 40-03: the kill switch is the first statement of create(), before the name check, reserveIdentifier and Transit; builds, list, rename and revoke never read it
- [Phase 40]: 40-03: create() logs only err.code for a generate error; the API answers 503 with exactly {success: false, response: key_service_unavailable}; all three consoles show the fixed D-03 sentence and a 503 without that code stays generic
- [Phase 40]: 40-04: THINX_DEPLOY_KEYGEN=enabled is mirrored in thinx.yml and docker-swarm.yml; the wiring gate asserts it (KEYGEN_SWITCH), retires the Phase 39 client-file and new-client scope checks, keeps SCOPE_NO_NEW_DEPENDENCY, and --live ignores the image and the switch
- [Phase 40]: 40-04: kill-switch spec backups are thinx-api-pre-keygen-<UTC>.json (0600 root), distinct from the thinx-api-pre-openbao-* baseline the gate reads; a full revert keeps the docker-swarm.yml switch line
- [Phase 40]: 40-05: Phase 40 cut over on the operator's advance go, conditional on a green Task 1; thinx-staging 8b6879e0 live as thinx_api tk89thgjiptv1d1z4e9l1kepw, all live gates green
- [Phase 40]: 40-05: API container PID 1 is the sh entrypoint with node as last foreground child; crash-case assumption holds in effect (exec node is an optional later hardening)
- [Phase 41]: 41-01: migrate-deploy-keys tries every passphrase candidate on any parse error; wrong_passphrase only when one try reported BAD_DECRYPT (a wrong passphrase yields ERR_OSSL_UNSUPPORTED ~1/300)
- [Phase 41]: 41-01: OpenSSH key type is read from the openssh-key-v1 public half before ssh-keygen conversion; non-ssh-rsa is unsupported_type (ssh-keygen -m PKCS8 refuses ed25519)
- [Phase 41]: 41-01: quarantine re-checks the file sha256 before revokeUserKeys; the canary modes load only transit.js and log to stderr so stdout is exactly one line
- [Phase 41]: 41-02: operator answered go and accepted the persistent console audit-log warning entry as the D-03 quarantine-notification channel
- [Phase 41]: 41-02: D10_GATE pass recorded 2026-10-20 (re-run 0 legacy / 0 failed, FETCH_CHECK ok=true owner test on suculent/thinx-autoflood); Plan 41-05 may push the legacy-path removal
- [Phase 41]: 41-02: D-05 tar /root/thinx-backups/deploy-keys-premig-20261020T123359Z.tar stays on micro local ext4 until Plan 41-08 shreds it
- [Phase 41]: D-13 classes: retired_version (exact ErrTooOld, per key, never retried, one-per-process Slack latch with no RECOVERED) and key_missing (exact 'encryption key not found', service level, D-05 incident, SERVICE_DOWN_REASONS)
- [Phase 41]: IN-10: TransitError.op on every failure; a login server_error skips the owner's remaining Transit keys, a decrypt server_error stays per key; T-40-12 attempt errors log the fixed token attempt_error
- [Phase 41]: KEYMIG-02 part 1: RSAKey.keyPassphrase() and the readSecret import removed from rsakey.js; ships with 41-04 in the 41-05 removal push, nothing pushed in 41-03
- [Phase 41]: 41-04: baseEnv drops every inherited env name matching /PASSPHRASE/i plus SSH_ASKPASS/SSH_ASKPASS_REQUIRE, so no git/ssh child inherits the passphrase the swarm still sets until 41-06, and lib/ never names the retired variable
- [Phase 41]: 41-04: PassphraseRetiredSpec requires Dockerfile and a root compose file; Dockerfile.test is scanned only when present, because CircleCI moves it over Dockerfile before the image build
- [Phase 41]: 41-04: migrate-deploy-keys.js keeps --dry-run/--migrate as recognised modes that exit 2 with a fixed 'legacy migration retired' stderr line
- [Phase 41]: 41-05 Task 3: operator go for the live passphrase retirement (repo-first order, 12 thinx.yml.bak* kept as history)
- [Phase 41]: 41-06: GIT_KEY_PASSPHRASE retired from the live swarm (Spec, PreviousSpec, swarm secret, Gluster .env*, askpass); operator removed two .env.bak files
- [Phase 41]: 41-06: thinx-deploy-keys rotated once by the operator, latest_version 2, min_decryption_version 1; v1 canary and pre-change snapshot stored
- [Phase 41]: 41-06: operator OpenBao login in the container uses the stdin userpass recipe (runbook section 6); bao login prints the token on the read-only FS
- [Phase 41]: 41-07: D14_GATE before the raise (rewrap re-run all at v2, keyed fetch ok); operator raised min_decryption_version to 2 = latest
- [Phase 41]: 41-07: post-change snapshot taken first after the raise to close the no-v2-snapshot window
- [Phase 41]: 41-07: v1 canary refused as retired_version; rotation recipe is runbook section 12, no cron
- [Phase 41]: 41-08: operator chose shred-all (verbatim 'shread-all'); D-05 tar, sha256, canary and four spec backups shredded, --live baseline sanitized in place, SPEC_DELTA ok
- [Phase 41]: 41-08: /root/thinx-swarm-backup-untracked (moved .env.bak copies with the literal passphrase) removed by the operator with rm -rf; 41-06 deletion claim corrected

### Pending Todos

None yet.

### Blockers/Concerns

- [D-05 resolved 2026-10-12] Archived `.planning/milestones/v1.15-ROADMAP.md` records that Phase 34 D-20 was dropped and moved to v1.17. Phase 39 owns the OpenBao replacement; inspect the current vault.yml during planning.
- [Phase 39] Node-local Raft + static-seal key bind OpenBao to one node; confirm the manager set and pin by hostname. Decide how the seal key reaches the container (bind mount vs swarm secret).
- [Phase 41] Pre-migration backup, pre-migration Gluster backups and DO VM snapshots hold `thinx`-passphrase keys — ACCEPTED residual risk (operator, 2026-10-09); no destroy/re-issue requirement.
- [Phase 40] Phase 45 (vue-console, v1.18) landed first in lib/thinx/rsakey.js: `RSAKey.validateKeyName` is now the shared create/rename name rule and returns reason codes (`empty`, `too_long`, `control_chars`, `line_separator`, `bidi`); `rsakey.rename` rewrites only `<owner>-<ts>.pub` through a dot-prefixed temp file in the same directory and `renameSync`, keeps the file mode, and never opens the private file; `RSAKey.fingerprint` is the OpenSSH SHA256 over the decoded key blob (Phase 45 D-01), so a rename keeps it; and the D-08 display-name rule (`RSAKey.storedName`) shows the stored comment only on a single-line `ssh-` key that passes the validator. Phase 40 keeps the `.pub` as plaintext OpenSSH, keeps rename independent of private-key storage, and rebases on these (Phase 45 D-15).
- [Phase 40 → 41] Before the Transit key rotation: a decrypt HTTP 400 is classed `bad_ciphertext` and never alerts (review IN-05), so ciphertext below `min_decryption_version` would fail silently; a login `server_error` is retried per key (IN-10). See 40-SECURITY.md residuals.
- [Phase 40] Live `thinx_api` spec now carries `THINX_DEPLOY_KEYGEN=enabled` (left by UAT 5); runbook §11 says it has none — reconcile on the next stack deploy.
- [Console] Vue console cannot attach a repository to a device — `.planning/todos/pending/2026-10-19-vue-console-attach-repository-to-device.md` (fix soon).

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| requirement | KEYMIG-04 PwnDoc retest of finding `6ac64bcfdd94eb38dba4c3a4` | Future | 2026-10-09 | v1.17 |
| requirement | Cloud-KMS auto-unseal; OpenBao Raft HA | Future | 2026-10-09 | v1.17 |

## Session Continuity

**Last session:** 2026-10-20T20:09:10.291Z
**Stopped At:** Completed 41-08-PLAN.md
**Resume File:** None
