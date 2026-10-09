# Roadmap: THiNX Device API

## Milestones

- 🚧 **v1.17 Deploy-Key OpenBao Transit** — Phases 39–41 (in progress, workstream `vault-transit`)

This workstream roadmap covers v1.17 only. Shipped milestones v1.0–v1.14, the open v1.15 (Phase 34) and v1.16
(Phases 35–38) live in the flat `.planning/ROADMAP.md`. Phase numbers continue the global sequence.

## Overview

v1.17 closes PwnDoc finding `6ac64bcfdd94eb38dba4c3a4`: every owner's git deploy key in
`/mnt/gluster/thinx/ssh_keys` is encrypted with one process-wide `GIT_KEY_PASSPHRASE` (legacy default `thinx`).
The work runs in three steps. First, an internal-only OpenBao goes onto the swarm with a non-exportable Transit key.
Second, the API stores new deploy keys as Transit ciphertext, decrypts them in memory for builds and still reads
legacy keys. Third, every legacy key is migrated, the passphrase is deleted everywhere and the Transit key is
rotated with a rewrap. Builds keep running with the owner logged out the whole time.

## Phases

**Phase Numbering:**
- Integer phases (39, 40, 41): Planned milestone work
- Decimal phases (39.1, 40.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 39: Internal OpenBao on the Swarm** - OpenBao runs internal-only with verified TLS, node-local Raft, auto-unseal, audit, a locked-down Transit key and the `thinx-api` AppRole (PRODUCTION)
- [ ] **Phase 40: Transit-Encrypted Deploy Keys in the API** - new keys stored as `vault:vN:` ciphertext and decrypted in memory for builds, legacy keys still read; CI against an OpenBao dev server, then production cut-over (PRODUCTION at cut-over)
- [ ] **Phase 41: Key Migration, Passphrase Retirement & Rotation** - every legacy key migrated, `GIT_KEY_PASSPHRASE` removed everywhere, Transit key rotated and rewrapped (PRODUCTION)

## Phase Details

### Phase 39: Internal OpenBao on the Swarm
**Goal**: The API has an OpenBao that it can reach over a verified-TLS internal overlay and that nothing else can reach. OpenBao unseals itself after a restart and gives the `thinx-api` AppRole encrypt/decrypt/rewrap on a non-exportable Transit key, and no other permission.
**Depends on**: Nothing (first v1.17 phase). Coordinates with v1.15 Phase 34 D-20 (see Milestone Notes, D-05).
**Requirements**: VAULT-01, VAULT-02, VAULT-03, VAULT-04, VAULT-05, VAULT-06, VAULT-07, VAULT-08
**Production**: YES. ssh to micro. Changes go repo-first in `thinx-swarm` (push to micro's checkout + ff-merge, never edit in place). The new `vault` stack is deployed as its own stack. `thinx_api` gets one `docker service update` (overlay, AppRole secrets, CA) with a 600-root spec backup. Traefik, the thinx stack, `:7442` and plain MQTT stay untouched.
**Success Criteria** (what must be TRUE):
  1. Exactly one `openbao/openbao:<x.y.z>` task runs (pinned by tag, never by digest; ≥ 2.4.0 for the static seal, 2.7.1 at planning time), on the manager node that holds its node-local Raft volume. It is attached only to the dedicated internal overlay it shares with `thinx_api` and publishes no port. No Traefik router exists for it: the live router inventory is unchanged and `vault.thinx.cloud` is not served. No OpenBao data or config lives under `/mnt/gluster`.
  2. From inside the `thinx_api` task, OpenBao answers over TLS that verifies against the mounted `BAO_CACERT`, and the same request without that CA fails. The dormant `vault.conf` (`tls_disable`) is replaced by an OpenBao HCL config without it.
  3. After `docker service update --force` on the OpenBao service, OpenBao reports `sealed=false` without operator input. It unseals through `seal "static"` with `current_key = "file://…"`, a root-only 32-byte key on the manager node's local disk (never GlusterFS). Recovery keys exist and the documented seal-key rotation (`previous_key`/`previous_key_id`) is exercised once.
  4. Logged in as the `thinx-api` AppRole (role_id/secret_id mounted on `thinx_api` as swarm secrets), a test payload round-trips through `transit/encrypt` and `transit/decrypt` on `thinx-deploy-keys`. Export, backup, delete, rotate and every other path are denied. The key reads back as `aes256-gcm96`, `exportable=false`, `allow_plaintext_backup=false`, `deletion_allowed=false`, and the bootstrap root token no longer exists.
  5. Those requests appear in the node-local file audit log. A Raft snapshot is written outside `ssh_keys` and the Gluster backups, and it restores into a throwaway OpenBao. The runbook (ssh + `docker exec` only) covers bootstrap, static-seal key custody and rotation, recovery keys, snapshot, restore, and how an operator gets a short-lived privileged token when no root token persists.
**Plans**: TBD

### Phase 40: Transit-Encrypted Deploy Keys in the API
**Goal**: A deploy key generated in THiNX is stored only as Transit ciphertext, and a keyed build decrypts it in memory. Every legacy passphrase-encrypted key keeps building, so the cut-over breaks no build.
**Depends on**: Phase 39, for the production cut-over only. Code and CI run against an OpenBao dev server and can start before Phase 39 is live.
**Requirements**: KEYENC-01, KEYENC-02, KEYENC-03, KEYENC-04, KEYENC-05, KEYENC-06
**Production**: At cut-over only, i.e. the `thinx-staging` push that deploys the API. KEYENC-03 refuses key generation when OpenBao is unreachable, so this code must not reach `thinx-staging` before Phase 39 is live. Until then, CI runs on a non-deploying branch (e.g. `thinx-unit`).
**Success Criteria** (what must be TRUE):
  1. Generating a deploy key writes a 0600 file to `ssh_keys` that holds only `vault:vN:` ciphertext. No PEM and no plaintext key touches disk at any point.
  2. A keyed build of a private repository with that key succeeds. The key is decrypted in memory and loaded with `ssh-add -` into a per-attempt `ssh-agent`, and the git environment carries no `GIT_KEY_PASSPHRASE` and no `SSH_ASKPASS`.
  3. In the same release, an owner's existing legacy passphrase-encrypted key still builds. The read path is chosen by file format, so no keyed build breaks at cut-over.
  4. With OpenBao sealed, unreachable or denying, key generation is refused with an explicit error and a keyed build fails with an explicit, logged status. A new key never falls back to the passphrase. Public HTTPS builds, device check-in on `:7442` and plain MQTT keep working.
  5. The OpenBao client logs in with AppRole (credentials through `readSecret`), renews or logs in again before its token lapses, and times out instead of hanging. `SecretsSweepSpec` asserts that no token, plaintext key or ciphertext reaches a log line. Unit specs with a mocked OpenBao and an integration spec against an OpenBao dev server in `docker-compose.test.yml` pass, and CI is green.
**Plans**: TBD

### Phase 41: Key Migration, Passphrase Retirement & Rotation
**Goal**: Every stored deploy key is Transit ciphertext at the latest key version, and the static passphrase no longer exists anywhere. The key files alone decrypt nothing.
**Depends on**: Phase 39 and Phase 40 (dual-read Transit cut-over live in production).
**Requirements**: KEYMIG-01, KEYMIG-02, KEYMIG-03
**Production**: YES. The migration runs inside the live API task. Secret/env removal on `thinx_api` uses `docker service update` (repo-first in `thinx.yml` and `docker-swarm.yml`). Transit rotation goes over ssh + `docker exec`. Order inside the phase: migrate, then remove the legacy path, then rotate and rewrap.
**Success Criteria** (what must be TRUE):
  1. The migration script's `--dry-run` reports counts and writes nothing. The real run reports migrated / already-transit / failed, and a second run reports 0 migrated and 0 failed, i.e. zero legacy keys left. Pre-migration copies sit in a root-only backup location that is not on GlusterFS.
  2. After zero legacy keys are reported, `GIT_KEY_PASSPHRASE` and the legacy read path are gone from the code, the Dockerfiles, the compose files, `thinx.yml`, `docker-swarm.yml`, the live `thinx_api` spec (neither secret nor env) and `docker secret ls`. No `*.sh` askpass file is left in `ssh_keys`. CI is green, and keyed builds for migrated owners still succeed.
  3. After `thinx-deploy-keys` is rotated and the rewrap job has run, every key file carries the latest `vault:vN:` prefix and `min_decryption_version` equals N. OpenBao refuses an older-version ciphertext, and a keyed build still succeeds.
**Plans**: TBD

## Milestone Notes

**D-05: coordination with v1.15 Phase 34 D-20 (vault.yml re-pin).** VAULT-01 supersedes D-20: the backend is OpenBao (D-06), so the image becomes `openbao/openbao`, not `hashicorp/vault`. D-20 is plan 34-03 in the flat
ROADMAP and currently sits in `.planning/phases/34-ops-surface-reduction-sla-close-out/34-04-PLAN.md` on disk.
- If Phase 34 lands its re-pin first, Phase 39 replaces that `hashicorp/vault:<x.y.z>` pin with `openbao/openbao:<x.y.z>`. It then removes `traefik-public`, the `vault-http`/`vault-https` routers and labels, and the `/mnt/glusterfs/vault/*` mounts.
- If Phase 39 lands first, the Phase 34 session must drop D-20 as absorbed. Its must-haves would contradict a deployed internal OpenBao: the "NOT DEPLOYED" note, the redirect-only `vault-http` router, and the "never deploy vault" prohibition. The same goes for any plan to add `vault.thinx.cloud` to `scripts/traefik-edge-scan.sh`, because D-03 gives OpenBao no public route.

**Production rules (AGENTS.md).** Changes go repo-first in `thinx-swarm`. Micro cannot reach GitHub, so updates go by ssh push + ff-merge into `/mnt/gluster/deployment/swarm`. Traefik is untouched: no labels, no args, no `docker stack deploy`/`restart.sh` of the thinx or traefik stacks. Each `thinx_api` change is one `docker service update` with a 600-root spec backup. Port `:7442` and plain MQTT stay open for legacy devices. Pushes go to `thinx-staging`, never `main`.

**Research flags for planning.**
- Phase 39 placement: node-local Raft data and the unseal key bind OpenBao to one node. If both swarm nodes are managers, `node.role == manager` alone could reschedule OpenBao away from its data. Confirm, then pin by hostname.
- Phase 39 auto-unseal: settled by D-06 — OpenBao `seal "static"` reads the key via `file://` (or `env://`). Still to decide: how the key reaches the container (node-local root-only bind mount vs a swarm secret, which would sit in the managers' Raft store on both nodes), and where the offline copy and recovery keys are kept.
- Phase 39/40 compatibility: confirm OpenBao Transit ciphertext keeps the `vault:vN:` prefix and that the chosen Node client works against the OpenBao API (`BAO_ADDR`/`BAO_CACERT`, AppRole login).
- Phase 39 operator privilege after root revocation: generate-root with the recovery keys, or an operator policy. Phase 41's rotation and `min_decryption_version` change need one of them.
- Phase 40: `ssh-agent` lifecycle per attempt (start, `ssh-add -`, kill in `finally`) inside the detached git process group, and AppRole secret_id TTL/renewal.

**Accepted residual risk (operator decision 2026-10-09; no v1 requirement).**
- The KEYMIG-01 pre-migration backup holds keys encrypted with the old passphrase. It is off GlusterFS but on node-local disk, which DigitalOcean VM snapshots do cover. Until it is destroyed, the finding survives in that copy.
- Gluster backups taken before the migration still hold passphrase-encrypted keys. Only deleting those backups or re-issuing the deploy keys removes that exposure. The KEYMIG-04 retest is a Future Requirement.

## Progress

**Execution Order:**
Phases execute in numeric order: 39 → 40 → 41. Phase 40 code and CI work may overlap Phase 39; its production cut-over may not.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 39. Internal OpenBao on the Swarm | v1.17 | 0/? | Not started | - |
| 40. Transit-Encrypted Deploy Keys in the API | v1.17 | 0/? | Not started | - |
| 41. Key Migration, Passphrase Retirement & Rotation | v1.17 | 0/? | Not started | - |

---
*v1.17 Deploy-Key OpenBao Transit roadmap created 2026-10-09: 17 requirements across 3 phases (39–41). Next: `/gsd-discuss-phase 39`.*
