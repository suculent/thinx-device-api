# Roadmap: THiNX Device API

## Milestones

- 🚧 **v1.17 Deploy-Key Vault Transit** — Phases 39–41 (in progress, workstream `vault-transit`)

This workstream roadmap covers v1.17 only. Shipped milestones v1.0–v1.14, the open v1.15 (Phase 34) and v1.16
(Phases 35–38) live in the flat `.planning/ROADMAP.md`. Phase numbers continue the global sequence.

## Overview

v1.17 closes PwnDoc finding `6ac64bcfdd94eb38dba4c3a4`: every owner's git deploy key in
`/mnt/gluster/thinx/ssh_keys` is encrypted with one process-wide `GIT_KEY_PASSPHRASE` (legacy default `thinx`).
The work runs in three steps. First, an internal-only Vault goes onto the swarm with a non-exportable Transit key.
Second, the API stores new deploy keys as Transit ciphertext, decrypts them in memory for builds and still reads
legacy keys. Third, every legacy key is migrated, the passphrase is deleted everywhere and the Transit key is
rotated with a rewrap. Builds keep running with the owner logged out the whole time.

## Phases

**Phase Numbering:**
- Integer phases (39, 40, 41): Planned milestone work
- Decimal phases (39.1, 40.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 39: Internal Vault on the Swarm** - Vault runs internal-only with verified TLS, node-local Raft, auto-unseal, audit, a locked-down Transit key and the `thinx-api` AppRole (PRODUCTION)
- [ ] **Phase 40: Transit-Encrypted Deploy Keys in the API** - new keys stored as `vault:vN:` ciphertext and decrypted in memory for builds, legacy keys still read; CI against a Vault dev server, then production cut-over (PRODUCTION at cut-over)
- [ ] **Phase 41: Key Migration, Passphrase Retirement & Rotation** - every legacy key migrated, `GIT_KEY_PASSPHRASE` removed everywhere, Transit key rotated and rewrapped (PRODUCTION)

## Phase Details

### Phase 39: Internal Vault on the Swarm
**Goal**: The API has a Vault that it can reach over a verified-TLS internal overlay and that nothing else can reach. Vault unseals itself after a restart and gives the `thinx-api` AppRole encrypt/decrypt/rewrap on a non-exportable Transit key, and no other permission.
**Depends on**: Nothing (first v1.17 phase). Coordinates with v1.15 Phase 34 D-20 (see Milestone Notes, D-05).
**Requirements**: VAULT-01, VAULT-02, VAULT-03, VAULT-04, VAULT-05, VAULT-06, VAULT-07, VAULT-08
**Production**: YES. ssh to micro. Changes go repo-first in `thinx-swarm` (push to micro's checkout + ff-merge, never edit in place). The new `vault` stack is deployed as its own stack. `thinx_api` gets one `docker service update` (overlay, AppRole secrets, CA) with a 600-root spec backup. Traefik, the thinx stack, `:7442` and plain MQTT stay untouched.
**Success Criteria** (what must be TRUE):
  1. Exactly one `hashicorp/vault:<x.y.z>` task runs (pinned by tag, never by digest), on the manager node that holds its node-local Raft volume. It is attached only to the dedicated internal overlay it shares with `thinx_api` and publishes no port. No Traefik router exists for it: the live router inventory is unchanged and `vault.thinx.cloud` is not served. No Vault data or config lives under `/mnt/gluster`.
  2. From inside the `thinx_api` task, Vault answers over TLS that verifies against the mounted `VAULT_CACERT`, and the same request without that CA fails. `vault.conf` no longer contains `tls_disable`.
  3. After `docker service update --force` on the Vault service, Vault reports `sealed=false` without operator input. It unseals from the root-only unseal key on the manager node's local disk. The documented manual unseal also works.
  4. Logged in as the `thinx-api` AppRole (role_id/secret_id mounted on `thinx_api` as swarm secrets), a test payload round-trips through `transit/encrypt` and `transit/decrypt` on `thinx-deploy-keys`. Export, backup, delete, rotate and every other path are denied. The key reads back as `aes256-gcm96`, `exportable=false`, `allow_plaintext_backup=false`, `deletion_allowed=false`, and the bootstrap root token no longer exists.
  5. Those requests appear in the node-local file audit log. A Raft snapshot is written outside `ssh_keys` and the Gluster backups, and it restores into a throwaway Vault. The runbook (ssh + `docker exec` only) covers bootstrap, auto and manual unseal, snapshot, restore, and how an operator gets a short-lived privileged token when no root token persists.
**Plans**: TBD

### Phase 40: Transit-Encrypted Deploy Keys in the API
**Goal**: A deploy key generated in THiNX is stored only as Transit ciphertext, and a keyed build decrypts it in memory. Every legacy passphrase-encrypted key keeps building, so the cut-over breaks no build.
**Depends on**: Phase 39, for the production cut-over only. Code and CI run against a Vault dev server and can start before Phase 39 is live.
**Requirements**: KEYENC-01, KEYENC-02, KEYENC-03, KEYENC-04, KEYENC-05, KEYENC-06
**Production**: At cut-over only, i.e. the `thinx-staging` push that deploys the API. KEYENC-03 refuses key generation when Vault is unreachable, so this code must not reach `thinx-staging` before Phase 39 is live. Until then, CI runs on a non-deploying branch (e.g. `thinx-unit`).
**Success Criteria** (what must be TRUE):
  1. Generating a deploy key writes a 0600 file to `ssh_keys` that holds only `vault:vN:` ciphertext. No PEM and no plaintext key touches disk at any point.
  2. A keyed build of a private repository with that key succeeds. The key is decrypted in memory and loaded with `ssh-add -` into a per-attempt `ssh-agent`, and the git environment carries no `GIT_KEY_PASSPHRASE` and no `SSH_ASKPASS`.
  3. In the same release, an owner's existing legacy passphrase-encrypted key still builds. The read path is chosen by file format, so no keyed build breaks at cut-over.
  4. With Vault sealed, unreachable or denying, key generation is refused with an explicit error and a keyed build fails with an explicit, logged status. A new key never falls back to the passphrase. Public HTTPS builds, device check-in on `:7442` and plain MQTT keep working.
  5. The Vault client logs in with AppRole (credentials through `readSecret`), renews or logs in again before its token lapses, and times out instead of hanging. `SecretsSweepSpec` asserts that no token, plaintext key or ciphertext reaches a log line. Unit specs with a mocked Vault and an integration spec against a Vault dev server in `docker-compose.test.yml` pass, and CI is green.
**Plans**: TBD

### Phase 41: Key Migration, Passphrase Retirement & Rotation
**Goal**: Every stored deploy key is Transit ciphertext at the latest key version, and the static passphrase no longer exists anywhere. The key files alone decrypt nothing.
**Depends on**: Phase 39 and Phase 40 (dual-read Transit cut-over live in production).
**Requirements**: KEYMIG-01, KEYMIG-02, KEYMIG-03
**Production**: YES. The migration runs inside the live API task. Secret/env removal on `thinx_api` uses `docker service update` (repo-first in `thinx.yml` and `docker-swarm.yml`). Transit rotation goes over ssh + `docker exec`. Order inside the phase: migrate, then remove the legacy path, then rotate and rewrap.
**Success Criteria** (what must be TRUE):
  1. The migration script's `--dry-run` reports counts and writes nothing. The real run reports migrated / already-transit / failed, and a second run reports 0 migrated and 0 failed, i.e. zero legacy keys left. Pre-migration copies sit in a root-only backup location that is not on GlusterFS.
  2. After zero legacy keys are reported, `GIT_KEY_PASSPHRASE` and the legacy read path are gone from the code, the Dockerfiles, the compose files, `thinx.yml`, `docker-swarm.yml`, the live `thinx_api` spec (neither secret nor env) and `docker secret ls`. No `*.sh` askpass file is left in `ssh_keys`. CI is green, and keyed builds for migrated owners still succeed.
  3. After `thinx-deploy-keys` is rotated and the rewrap job has run, every key file carries the latest `vault:vN:` prefix and `min_decryption_version` equals N. Vault refuses an older-version ciphertext, and a keyed build still succeeds.
**Plans**: TBD

## Milestone Notes

**D-05: coordination with v1.15 Phase 34 D-20 (vault.yml re-pin).** VAULT-01 absorbs D-20. D-20 is plan 34-03 in the flat
ROADMAP and currently sits in `.planning/phases/34-ops-surface-reduction-sla-close-out/34-04-PLAN.md` on disk.
- If Phase 34 lands its re-pin first, Phase 39 starts from that `hashicorp/vault:<x.y.z>` tag. It then removes `traefik-public`, the `vault-http`/`vault-https` routers and labels, and the `/mnt/glusterfs/vault/*` mounts.
- If Phase 39 lands first, the Phase 34 session must drop D-20 as absorbed. Its must-haves would contradict a deployed internal Vault: the "NOT DEPLOYED" note, the redirect-only `vault-http` router, and the "never deploy vault" prohibition. The same goes for any plan to add `vault.thinx.cloud` to `scripts/traefik-edge-scan.sh`, because D-03 gives Vault no public route.

**Production rules (AGENTS.md).** Changes go repo-first in `thinx-swarm`. Micro cannot reach GitHub, so updates go by ssh push + ff-merge into `/mnt/gluster/deployment/swarm`. Traefik is untouched: no labels, no args, no `docker stack deploy`/`restart.sh` of the thinx or traefik stacks. Each `thinx_api` change is one `docker service update` with a 600-root spec backup. Port `:7442` and plain MQTT stay open for legacy devices. Pushes go to `thinx-staging`, never `main`.

**Research flags for planning.**
- Phase 39 placement: node-local Raft data and the unseal key bind Vault to one node. If both swarm nodes are managers, `node.role == manager` alone could reschedule Vault away from its data. Confirm, then pin by hostname.
- Phase 39 auto-unseal: Vault OSS has no seal type for a key file on local disk. The unseal mechanism (wrapper entrypoint or sidecar reading the root-only file) needs research.
- Phase 39 operator privilege after root revocation: generate-root with the unseal key, or an operator policy. Phase 41's rotation and `min_decryption_version` change need one of them.
- Phase 40: `ssh-agent` lifecycle per attempt (start, `ssh-add -`, kill in `finally`) inside the detached git process group, and AppRole secret_id TTL/renewal.

**Accepted residual risk (operator decision 2026-10-09; no v1 requirement).**
- The KEYMIG-01 pre-migration backup holds keys encrypted with the old passphrase. It is off GlusterFS but on node-local disk, which DigitalOcean VM snapshots do cover. Until it is destroyed, the finding survives in that copy.
- Gluster backups taken before the migration still hold passphrase-encrypted keys. Only deleting those backups or re-issuing the deploy keys removes that exposure. The KEYMIG-04 retest is a Future Requirement.

## Progress

**Execution Order:**
Phases execute in numeric order: 39 → 40 → 41. Phase 40 code and CI work may overlap Phase 39; its production cut-over may not.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 39. Internal Vault on the Swarm | v1.17 | 0/? | Not started | - |
| 40. Transit-Encrypted Deploy Keys in the API | v1.17 | 0/? | Not started | - |
| 41. Key Migration, Passphrase Retirement & Rotation | v1.17 | 0/? | Not started | - |

---
*v1.17 Deploy-Key Vault Transit roadmap created 2026-10-09: 17 requirements across 3 phases (39–41). Next: `/gsd-discuss-phase 39`.*
