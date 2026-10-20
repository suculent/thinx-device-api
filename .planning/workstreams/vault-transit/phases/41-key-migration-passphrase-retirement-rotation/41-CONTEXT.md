# Phase 41: Key Migration, Passphrase Retirement & Rotation - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Every deploy private key in `ssh_keys` becomes Transit ciphertext at the latest `thinx-deploy-keys` version, and `GIT_KEY_PASSPHRASE` and the legacy read path stop existing anywhere (code, Dockerfiles, compose files, `thinx.yml`, `docker-swarm.yml`, the live `thinx_api` spec and `docker secret ls`). The key files alone decrypt nothing. The order is fixed: **migrate → remove the legacy path → rotate and rewrap** (KEYMIG-01, KEYMIG-02, KEYMIG-03). PRODUCTION phase.

Not in scope: the KEYMIG-04 PwnDoc retest (future), destroying old Gluster backups or DO snapshots (accepted residual), per-owner Transit context (AR-40-02 stays accepted), and anything touching `:7442` or plain MQTT.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (not re-asked)
- Milestone D-01/D-04: whole-blob Transit encryption. Dual-read stays until migration reports zero legacy keys, and only then are the legacy path and the passphrase removed.
- The `thinx-api` AppRole has `encrypt`, `decrypt` and `rewrap` on `thinx-deploy-keys`, and nothing else. Operators reach OpenBao only through ssh + `docker exec` (Phase 39).
- `lib/thinx/keyformat.js` classifies files as `transit` / `legacy` / `unknown` by content. `legacy` includes both the passphrase-encrypted PKCS#8 (`ENCRYPTED PRIVATE KEY`) and the older unencrypted `ssh-keygen -N ""` keys. Both kinds migrate; the unencrypted ones need no passphrase.
- Accepted residual (operator, 2026-10-09): pre-migration copies, old Gluster backups and DO snapshots stay decryptable with `thinx` until they are deleted.
- Edge/swarm rules: every `thinx_api` change is one targeted `docker service update` from a 0600 spec backup, repo-first in `thinx-swarm`. Never `docker stack deploy` / `restart.sh` for this. Push to `thinx-staging` only. No `main` merge or v1.18 release until v1.17 is done.

### Orphans & failures
- **D-01:** Orphaned private-key files (no owner record) are purged **before** migrating, with the existing `scripts/purge-orphaned-rsa-keys.js --apply --askfiles`, run after the D-05 backup is taken. Dead keys never get sent through Transit, and "zero legacy keys" means zero legacy files on disk.
- **D-02:** A legacy file that cannot be converted (corrupt, or encrypted under a passphrase other than the current one) is **quarantined**: removed from `ssh_keys` (the D-05 tar already holds it) and reported by owner and key id. The run then carries on. A quarantined file counts as resolved, not as a blocking failure, so zero legacy keys is reachable without a hand decision for each file. The owner regenerates the key. — **Reversibility:** costly — the key is gone from the live volume, and restoring it means untarring from the D-05 backup while dual-read is still deployed.
- **D-03:** Owners whose key was quarantined get a **console notification** through the existing per-owner notification path, telling them to regenerate the deploy key. Orphans have no owner, so no one is notified for them. The message carries no key material, path or ciphertext.
- **D-04:** The migration is `scripts/migrate-deploy-keys.js`, a node script run with `docker exec` inside the live `thinx_api` task. It reuses `lib/thinx/transit.js` (AppRole already mounted) and `keyformat.js`, following the same pattern as `purge-orphaned-rsa-keys.js`. It has `--dry-run` (counts only, writes nothing) and reports migrated / already-transit / quarantined / failed. It is idempotent: a second run reports 0 migrated, 0 failed. No admin API endpoint.

### Backup custody
- **D-05:** Before anything is purged or migrated, root on micro (the host, not the container) tars `ssh_keys` to a **node-local** location such as `/root/thinx-backups/deploy-keys-premig-<UTC>.tar` (dir 0700, file 0600, with a sha256 recorded). It is not on GlusterFS and is not included in the gluster backup job. The script never writes its own backup, so the container needs no new mount.
- **D-06:** The tar is kept **until Phase 41 is verified live** (removal and rotation done), then shredded. The shred is recorded in the phase verification. It is decryptable with `thinx`, so the window stays short.
- **D-07:** Rollback = untar the legacy files back over `ssh_keys`. This works **only while dual-read is still deployed**. After the removal deploy, the only way forward is to regenerate keys. The runbook documents both. — **Reversibility:** one-way — once the legacy read path and the secret are removed, a restored legacy file can no longer be read.

### Removal cut-over
- **D-08:** The removal is staged **code first, then secret/env**:
  1. A `thinx-staging` deploy removes `RSAKey.keyPassphrase()`, the legacy branch in the git fetch path, `create_askfile`/`delete_askfile`/`SSH_ASKPASS` handling, and the `GIT_KEY_PASSPHRASE` entries in `Dockerfile`, `Dockerfile.test`, `docker-compose.yml` and `docker-compose.test.yml`, plus the specs that set it.
  2. With that live and a keyed build green: one `docker service update --secret-rm/--env-rm` on `thinx_api` from a 0600 spec backup, then `docker secret rm`, then remove it from `thinx-swarm` `thinx.yml` / `docker-swarm.yml`.
  3. Purge leftover `*.sh` askpass files from `ssh_keys`.

  The code stops reading the secret before the secret disappears. — **Reversibility:** one-way — see D-07.
- **D-09:** After removal, a legacy-format (PEM) private key that turns up in `ssh_keys` (e.g. restored from an old backup) is **skipped and logged** (`deploy key unavailable: legacy format no longer supported` or similar) on the same skip path as unknown or corrupt files. It raises no Slack alert and the API never deletes it.
- **D-10:** The gate between migration and removal: the re-run reports **0 legacy / 0 failed**, **and** one live keyed build of a private repo with a migrated key succeeds. Only then does the removal commit go to `thinx-staging`. No soak period and no separate operator-go step.

### Rotation & rewrap
- **D-11:** **One-off rotation** of `thinx-deploy-keys` in this phase. The runbook (`.planning/runbooks/openbao.md`) gets a repeatable recipe (rotate → rewrap → verify → raise min version) for future rotations, e.g. after a suspected leak. No new cron.
- **D-12:** The **rewrap runs through the API's AppRole**: `--rewrap` mode on the same `migrate-deploy-keys.js`, by `docker exec` in `thinx_api`, idempotent, reporting how many files are at each version. `transit/keys/thinx-deploy-keys/rotate` and raising `min_decryption_version` stay **operator-token** steps over ssh + `docker exec` into OpenBao, because the AppRole cannot do them. The AppRole policy is not widened.
- **D-13:** **Fix IN-05 first**: a decrypt refused because the ciphertext version is below `min_decryption_version` gets its own reason class, distinct from `bad_ciphertext`, and is logged and alerted through the existing D-05 (Phase 40) incident path. It ships in the removal deploy (D-08 step 1), before any rotation. The 40-SECURITY residuals T-40-12 (fixed log token for non-coded errors) and IN-10 (login `server_error` retried per key) are revisited at the same time.
- **D-14:** `min_decryption_version` is raised **right after a verified rewrap**: the re-run reports every file at the latest `vN`, and one keyed build succeeds. After raising it, prove that a captured old-version ciphertext is refused. No soak.

### Claude's Discretion
- Report format of the script (text vs `--json`, both like `purge-orphaned-rsa-keys.js`), and concurrency and throttling of Transit calls during migration and rewrap.
- How a migrated file is written: atomic temp + rename in the same dir, keeping mode 0600 and the existing name, so a concurrent build sees either the old or the new file, never a partial one. Whether migration takes the per-owner lock that builds use.
- The exact reason-class name for D-13 and how OpenBao's below-min-version 400 is recognised.
- Plan and wave split, as long as the D-08 ordering and the D-10/D-14 gates hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope
- `.planning/workstreams/vault-transit/REQUIREMENTS.md` — KEYMIG-01..03, milestone decisions D-01..D-06, Out of Scope (accepted residuals)
- `.planning/workstreams/vault-transit/ROADMAP.md` § Phase 41 — success criteria 1–3 and production constraints

### Prior phases
- `.planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-CONTEXT.md` — dual-read, skip-and-log, alerting (D-05), kill switch
- `.planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-SECURITY.md` — residuals IN-05, IN-10, T-40-12, AR-40-02
- `.planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-VERIFICATION.md` — live cut-over state
- `.planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-CONTEXT.md` — AppRole/operator policies, ssh + docker exec plane

### Runbooks
- `.planning/runbooks/openbao.md` — operator token, Transit, §11 kill switch (also reconcile the `THINX_DEPLOY_KEYGEN` doc drift noted in 40-SECURITY)
- `.planning/runbooks/swarm.md` — `thinx_api` service-update and spec-backup conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/thinx/keyformat.js`: `detect()` / bounded read. This is the migration's classifier, and after removal it routes `legacy` to the skip path.
- `lib/thinx/transit.js`: AppRole client with retry, timeouts and incident alerts. Add a `rewrap` call and the D-13 reason class here.
- `scripts/purge-orphaned-rsa-keys.js`: orphan detection plus `--askfiles` purge, and the CLI/report pattern for the new script.
- `spec/fixtures/mock-openbao.js`, `spec/fixtures/fake-transit.js`, and the OpenBao dev server in `docker-compose.test.yml` (`scripts/openbao-dev.sh`) for unit and integration specs.

### Legacy path to remove (D-08)
- `lib/thinx/rsakey.js:103` `keyPassphrase()`; `lib/thinx/git.js:465` (env carries `GIT_KEY_PASSPHRASE`), `:656` `create_askfile`, `:666` `delete_askfile`, `:848` legacy askpass branch; `git.js:361/380` deletions become moot.
- `Dockerfile:63`, `Dockerfile.test:127-128`, `docker-compose.yml:174`, `docker-compose.test.yml:127`; `spec/node/DeployKeyNames.test.js` sets the passphrase.
- `thinx-swarm` `thinx.yml` / `docker-swarm.yml` secret/env entries, plus the live `thinx_api` spec.

### Integration Points
- Per-owner notification path (D-03) in the API notifier.
- `thinx_api` task location floats between micro and core. The host-side tar (D-05) runs where `ssh_keys` is mounted (Gluster is shared), on micro.

</code_context>

<specifics>
## Specific Ideas

- Verify early that the Phase 39 operator userpass policy allows `transit/keys/thinx-deploy-keys/rotate` and `.../config` (min_decryption_version). If it does not, the planner adds a minimal operator-policy change (not an AppRole change).
- Success evidence for the end of the phase: re-run reports, `docker secret ls`, `docker service inspect thinx_api` with no passphrase, a refused old-version ciphertext, a keyed build log, and a record that the backup was shredded.

</specifics>

<deferred>
## Deferred Ideas

- Scheduled automatic Transit rotation (cron). Rejected for now in favour of the D-11 runbook recipe.
- KEYMIG-04 PwnDoc retest of finding `6ac64bcfdd94eb38dba4c3a4` (future requirement).
- Per-owner Transit context / AAD against ciphertext swapping (AR-40-02, accepted).

</deferred>
</content>
</invoke>
