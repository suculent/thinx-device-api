# Requirements: THiNX Device API — v1.17 Deploy-Key OpenBao Transit

**Defined:** 2026-10-09
**Workstream:** `vault-transit`
**Core Value:** Possession of the deploy-key files (GlusterFS volume, backup, snapshot, file-read bug) must not be sufficient to decrypt any owner's git deploy private key — while THiNX still clones and builds autonomously with the owner logged out.
**Source finding:** PwnDoc audit `6ac4e883dd94eb38dba4b48d`, finding `6ac64bcfdd94eb38dba4c3a4` — "Git deploy keys encrypted at rest with a single static default passphrase" (CWE-798 / CWE-522 / CWE-321). Every owner's PKCS#8 key in `/mnt/gluster/thinx/ssh_keys/<owner>-<ts>` is encrypted with one process-wide `GIT_KEY_PASSPHRASE` (legacy default `thinx` still live); consumers are `lib/thinx/rsakey.js` (`keyPassphrase()`, `generate()`) and `lib/thinx/git.js` (`sshEnv()`, `create_askfile()`).

## Decisions taken at milestone start

- **D-01 Design:** Transit encrypts the whole private-key blob (`transit/encrypt/thinx-deploy-keys`); the file on Gluster holds only `vault:vN:…` ciphertext. No local DEK crypto (datakey envelope rejected as more code for no gain at ~3 KB payloads); keys are not moved into OpenBao KV (would move the backup problem into OpenBao storage).
- **D-02 Unseal:** OpenBao `seal "static"` (built in since OpenBao 2.4.0) with `current_key = "file://…"` pointing at a 32-byte AES-256 key in a root-only file on the manager node's local disk, never on GlusterFS — automatic unseal, so builds stay autonomous. Accepted residual risk: full compromise of that node.
- **D-03 Exposure:** OpenBao is reachable only on a dedicated internal overlay; the dormant `vault.thinx.cloud` Traefik routers are removed. Operator access via ssh + `docker exec` (same plane as the Traefik API, Phase 33).
- **D-04 Cut-over:** dual-read — the API accepts legacy passphrase-encrypted keys and Transit ciphertext until migration reports zero legacy keys; only then is the legacy path and `GIT_KEY_PASSPHRASE` removed.
- **D-05 Coordination:** v1.15 Phase 34 D-20 (re-pin dormant `vault.yml` to a `hashicorp/vault` tag; flat-ROADMAP plan 34-03, on disk in `34-04-PLAN.md`) is superseded by VAULT-01: the image becomes `openbao/openbao`. If D-20 lands first, VAULT-01 replaces its `hashicorp/vault` pin.
- **D-06 Backend (2026-10-09):** OpenBao instead of HashiCorp Vault. Vault Community Edition has no auto-unseal that reads a local key file (only external KMS/HSM/Transit seals); OpenBao's static seal does, and OpenBao keeps the Vault API (Transit, AppRole, audit devices), so the API client is unaffected. The finding itself cites the OpenBao Transit docs.

## v1 Requirements

### OpenBao service (thinx-swarm)

- [ ] **VAULT-01**: OpenBao runs on the swarm as `openbao/openbao:<x.y.z>` pinned by exact tag, never a digest (2.7.1 at planning time; ≥ 2.4.0 required for the static seal), one replica constrained to a manager node, attached only to a dedicated internal overlay shared with `thinx_api`; no Traefik routers and no published ports.
- [ ] **VAULT-02**: OpenBao storage (integrated Raft) lives on a node-local volume, not GlusterFS; Raft snapshots are written to a location separate from `ssh_keys` and from Gluster backups.
- [ ] **VAULT-03**: The OpenBao listener serves TLS from an internal CA and the API verifies it (`BAO_CACERT`); the dormant `vault.conf` (`tls_disable`) is replaced by an OpenBao HCL config without `tls_disable`.
- [ ] **VAULT-04**: OpenBao unseals automatically after a restart or reschedule through `seal "static"` reading a root-only 32-byte key file on the manager node's local disk (not GlusterFS); recovery keys and an offline, off-swarm copy of the seal key are documented, as is seal-key rotation via `previous_key`/`previous_key_id`.
- [ ] **VAULT-05**: Transit key `thinx-deploy-keys` exists as aes256-gcm96, `exportable=false`, `allow_plaintext_backup=false`, `deletion_allowed=false`.
- [ ] **VAULT-06**: AppRole `thinx-api` holds a policy limited to `encrypt`, `decrypt` and `rewrap` on `thinx-deploy-keys`; its role_id/secret_id reach the API as swarm secrets read through `readSecret`; no root token persists after bootstrap.
- [ ] **VAULT-07**: A file audit device is enabled, writing to node-local storage.
- [ ] **VAULT-08**: Operators reach OpenBao only via ssh + `docker exec`; a runbook covers bootstrap, static-seal key handling and rotation, recovery keys, Raft snapshot and restore.

### API key encryption

- [ ] **KEYENC-01**: A newly generated deploy key is encrypted through Transit and only the `vault:vN:…` ciphertext (mode 0600) is written to `ssh_keys`; the plaintext private key never touches disk.
- [ ] **KEYENC-02**: A keyed git fetch decrypts the key in memory and loads it with `ssh-add -` into a per-attempt `ssh-agent`; the git environment no longer carries `GIT_KEY_PASSPHRASE` or an `SSH_ASKPASS` helper for Transit keys.
- [ ] **KEYENC-03**: When OpenBao is sealed, unreachable or denies the request, key generation is refused and a keyed build fails with an explicit, logged status — never a passphrase fallback for new keys. Public HTTPS builds, the plaintext device port 7442 and plain MQTT are unaffected.
- [ ] **KEYENC-04**: The OpenBao client logs in with AppRole, renews or re-logs its token, applies timeouts, and never logs tokens, plaintext key material or ciphertext (asserted by the SecretsSweep spec).
- [ ] **KEYENC-05**: Behaviour is covered by unit tests with a mocked OpenBao and by an integration test against an OpenBao dev server in `docker-compose.test.yml`; CI is green.
- [ ] **KEYENC-06**: During the migration window the API reads both legacy passphrase-encrypted keys and Transit ciphertext, selected by file format, so no keyed build breaks during cut-over.

### Migration & rotation

- [ ] **KEYMIG-01**: An idempotent migration script with `--dry-run` converts every legacy passphrase-encrypted key in `ssh_keys` to Transit ciphertext and reports counts (migrated / already-transit / failed); pre-migration copies go to a backup location that is not on GlusterFS.
- [ ] **KEYMIG-02**: Once migration reports zero legacy keys, the legacy read path and `GIT_KEY_PASSPHRASE` are removed from code, swarm secrets, `thinx.yml`, `docker-swarm.yml`, compose files and the Dockerfile, and leftover `*.sh` askpass files (cleartext passphrase) are purged from `ssh_keys`.
- [ ] **KEYMIG-03**: Rotating the Transit key followed by a `rewrap` job brings every stored ciphertext to the latest key version, after which `min_decryption_version` is raised.

## Future Requirements

- **KEYMIG-04**: Retest PwnDoc finding `6ac64bcfdd94eb38dba4c3a4` and record the result with evidence that Gluster/backup access alone cannot decrypt a key.
- Cloud-KMS auto-unseal (stronger than D-02, adds an external cloud dependency).
- OpenBao HA (Raft multi-node) — the swarm has two nodes; a single replica is accepted.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-owner passphrases / user-password-derived keys | Builds must run with the owner logged out (finding's own constraint). |
| Encrypting keys with a secret stored in CouchDB/Redis | Same trust boundary as the key store; does not meet the core value. |
| Public `vault.thinx.cloud` route | D-03 — internal overlay only. |
| Storing private keys in OpenBao KV | D-01 — moves the backup problem into OpenBao storage. |
| HashiCorp Vault (`hashicorp/vault`) as the backend | D-06 — Community Edition has no auto-unseal from a local key file. |
| Destroying legacy-passphrase backups (KEYMIG-01 pre-migration copy, pre-migration Gluster backups, DO VM snapshots) | Accepted residual risk (operator, 2026-10-09): those copies stay decryptable with the old `thinx` passphrase until they expire naturally. |
| Changing the plaintext device port 7442 / plain MQTT | Required for legacy non-TLS devices (operator decision 2026-10-04). |
| `docker stack deploy` / `restart.sh` for edge changes | Edge rule: `docker service update` only; OpenBao is its own stack, Traefik untouched. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VAULT-01 | Phase 39 | Pending |
| VAULT-02 | Phase 39 | Pending |
| VAULT-03 | Phase 39 | Pending |
| VAULT-04 | Phase 39 | Pending |
| VAULT-05 | Phase 39 | Pending |
| VAULT-06 | Phase 39 | Pending |
| VAULT-07 | Phase 39 | Pending |
| VAULT-08 | Phase 39 | Pending |
| KEYENC-01 | Phase 40 | Pending |
| KEYENC-02 | Phase 40 | Pending |
| KEYENC-03 | Phase 40 | Pending |
| KEYENC-04 | Phase 40 | Pending |
| KEYENC-05 | Phase 40 | Pending |
| KEYENC-06 | Phase 40 | Pending |
| KEYMIG-01 | Phase 41 | Pending |
| KEYMIG-02 | Phase 41 | Pending |
| KEYMIG-03 | Phase 41 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17 (Phase 39: 8, Phase 40: 6, Phase 41: 3)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-09*
*Last updated: 2026-10-09 after switch to OpenBao (D-06); previously after roadmap creation (Phases 39–41)*
