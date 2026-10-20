# Phase 41: Key Migration, Passphrase Retirement & Rotation - Research

**Researched:** 2026-10-20
**Domain:** Node.js key-format conversion + OpenBao 2.7.1 Transit (rewrap / rotate / min_decryption_version) + Docker Swarm secret/env retirement on a live service
**Confidence:** HIGH for code, Transit semantics and the live inventory (read from source, the OpenBao 2.7.1 tree and read-only probes of production today). MEDIUM for the operator-side ordering details, which need operator confirmation (see Open Questions).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Carried forward (not re-asked)
- Milestone D-01/D-04: whole-blob Transit encryption. Dual-read stays until migration reports zero legacy keys, and only then are the legacy path and the passphrase removed.
- The `thinx-api` AppRole has `encrypt`, `decrypt` and `rewrap` on `thinx-deploy-keys`, and nothing else. Operators reach OpenBao only through ssh + `docker exec` (Phase 39).
- `lib/thinx/keyformat.js` classifies files as `transit` / `legacy` / `unknown` by content. `legacy` includes both the passphrase-encrypted PKCS#8 (`ENCRYPTED PRIVATE KEY`) and the older unencrypted `ssh-keygen -N ""` keys. Both kinds migrate; the unencrypted ones need no passphrase.
- Accepted residual (operator, 2026-10-09): pre-migration copies, old Gluster backups and DO snapshots stay decryptable with `thinx` until they are deleted.
- Edge/swarm rules: every `thinx_api` change is one targeted `docker service update` from a 0600 spec backup, repo-first in `thinx-swarm`. Never `docker stack deploy` / `restart.sh` for this. Push to `thinx-staging` only. No `main` merge or v1.18 release until v1.17 is done.

#### Orphans & failures
- **D-01:** Orphaned private-key files (no owner record) are purged **before** migrating, with the existing `scripts/purge-orphaned-rsa-keys.js --apply --askfiles`, run after the D-05 backup is taken. Dead keys never get sent through Transit, and "zero legacy keys" means zero legacy files on disk.
- **D-02:** A legacy file that cannot be converted (corrupt, or encrypted under a passphrase other than the current one) is **quarantined**: removed from `ssh_keys` (the D-05 tar already holds it) and reported by owner and key id. The run then carries on. A quarantined file counts as resolved, not as a blocking failure, so zero legacy keys is reachable without a hand decision for each file. The owner regenerates the key. — **Reversibility:** costly — the key is gone from the live volume, and restoring it means untarring from the D-05 backup while dual-read is still deployed.
- **D-03:** Owners whose key was quarantined get a **console notification** through the existing per-owner notification path, telling them to regenerate the deploy key. Orphans have no owner, so no one is notified for them. The message carries no key material, path or ciphertext.
- **D-04:** The migration is `scripts/migrate-deploy-keys.js`, a node script run with `docker exec` inside the live `thinx_api` task. It reuses `lib/thinx/transit.js` (AppRole already mounted) and `keyformat.js`, following the same pattern as `purge-orphaned-rsa-keys.js`. It has `--dry-run` (counts only, writes nothing) and reports migrated / already-transit / quarantined / failed. It is idempotent: a second run reports 0 migrated, 0 failed. No admin API endpoint.

#### Backup custody
- **D-05:** Before anything is purged or migrated, root on micro (the host, not the container) tars `ssh_keys` to a **node-local** location such as `/root/thinx-backups/deploy-keys-premig-<UTC>.tar` (dir 0700, file 0600, with a sha256 recorded). It is not on GlusterFS and is not included in the gluster backup job. The script never writes its own backup, so the container needs no new mount.
- **D-06:** The tar is kept **until Phase 41 is verified live** (removal and rotation done), then shredded. The shred is recorded in the phase verification. It is decryptable with `thinx`, so the window stays short.
- **D-07:** Rollback = untar the legacy files back over `ssh_keys`. This works **only while dual-read is still deployed**. After the removal deploy, the only way forward is to regenerate keys. The runbook documents both. — **Reversibility:** one-way — once the legacy read path and the secret are removed, a restored legacy file can no longer be read.

#### Removal cut-over
- **D-08:** The removal is staged **code first, then secret/env**:
  1. A `thinx-staging` deploy removes `RSAKey.keyPassphrase()`, the legacy branch in the git fetch path, `create_askfile`/`delete_askfile`/`SSH_ASKPASS` handling, and the `GIT_KEY_PASSPHRASE` entries in `Dockerfile`, `Dockerfile.test`, `docker-compose.yml` and `docker-compose.test.yml`, plus the specs that set it.
  2. With that live and a keyed build green: one `docker service update --secret-rm/--env-rm` on `thinx_api` from a 0600 spec backup, then `docker secret rm`, then remove it from `thinx-swarm` `thinx.yml` / `docker-swarm.yml`.
  3. Purge leftover `*.sh` askpass files from `ssh_keys`.

  The code stops reading the secret before the secret disappears. — **Reversibility:** one-way — see D-07.
- **D-09:** After removal, a legacy-format (PEM) private key that turns up in `ssh_keys` (e.g. restored from an old backup) is **skipped and logged** (`deploy key unavailable: legacy format no longer supported` or similar) on the same skip path as unknown or corrupt files. It raises no Slack alert and the API never deletes it.
- **D-10:** The gate between migration and removal: the re-run reports **0 legacy / 0 failed**, **and** one live keyed build of a private repo with a migrated key succeeds. Only then does the removal commit go to `thinx-staging`. No soak period and no separate operator-go step.

#### Rotation & rewrap
- **D-11:** **One-off rotation** of `thinx-deploy-keys` in this phase. The runbook (`.planning/runbooks/openbao.md`) gets a repeatable recipe (rotate → rewrap → verify → raise min version) for future rotations, e.g. after a suspected leak. No new cron.
- **D-12:** The **rewrap runs through the API's AppRole**: `--rewrap` mode on the same `migrate-deploy-keys.js`, by `docker exec` in `thinx_api`, idempotent, reporting how many files are at each version. `transit/keys/thinx-deploy-keys/rotate` and raising `min_decryption_version` stay **operator-token** steps over ssh + `docker exec` into OpenBao, because the AppRole cannot do them. The AppRole policy is not widened.
- **D-13:** **Fix IN-05 first**: a decrypt refused because the ciphertext version is below `min_decryption_version` gets its own reason class, distinct from `bad_ciphertext`, and is logged and alerted through the existing D-05 (Phase 40) incident path. It ships in the removal deploy (D-08 step 1), before any rotation. The 40-SECURITY residuals T-40-12 (fixed log token for non-coded errors) and IN-10 (login `server_error` retried per key) are revisited at the same time.
- **D-14:** `min_decryption_version` is raised **right after a verified rewrap**: the re-run reports every file at the latest `vN`, and one keyed build succeeds. After raising it, prove that a captured old-version ciphertext is refused. No soak.

### Claude's Discretion
- Report format of the script (text vs `--json`, both like `purge-orphaned-rsa-keys.js`), and concurrency and throttling of Transit calls during migration and rewrap.
- How a migrated file is written: atomic temp + rename in the same dir, keeping mode 0600 and the existing name, so a concurrent build sees either the old or the new file, never a partial one. Whether migration takes the per-owner lock that builds use.
- The exact reason-class name for D-13 and how OpenBao's below-min-version 400 is recognised.
- Plan and wave split, as long as the D-08 ordering and the D-10/D-14 gates hold.

### Deferred Ideas (OUT OF SCOPE)
- Scheduled automatic Transit rotation (cron). Rejected for now in favour of the D-11 runbook recipe.
- KEYMIG-04 PwnDoc retest of finding `6ac64bcfdd94eb38dba4c3a4` (future requirement).
- Per-owner Transit context / AAD against ciphertext swapping (AR-40-02, accepted).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KEYMIG-01 | An idempotent migration script with `--dry-run` converts every legacy passphrase-encrypted key in `ssh_keys` to Transit ciphertext and reports counts (migrated / already-transit / failed); pre-migration copies go to a backup location that is not on GlusterFS. | Live inventory (78 private files: 72 encrypted PKCS#8, 4 unencrypted PKCS#1, 1 unencrypted OpenSSH, 1 Transit); format-conversion matrix proven on synthetic keys (Node parses PKCS#8/PKCS#1, **not** OpenSSH); `/root` on micro is local ext4 with 16 G free and the gluster backup job has no `/root` reference; algorithm, atomic write and idempotency design below. |
| KEYMIG-02 | Once migration reports zero legacy keys, the legacy read path and `GIT_KEY_PASSPHRASE` are removed from code, swarm secrets, `thinx.yml`, `docker-swarm.yml`, compose files and the Dockerfile, and leftover `*.sh` askpass files (cleartext passphrase) are purged from `ssh_keys`. | Complete `GIT_KEY_PASSPHRASE` inventory (code, specs, Dockerfiles, compose, both swarm files, the thinx-swarm wiring gate and verifier, the live spec, `PreviousSpec`, `docker secret ls`, the Gluster `.env` line, 0600 spec backups); `*.sh` count in `ssh_keys` is already 0. |
| KEYMIG-03 | Rotating the Transit key followed by a `rewrap` job brings every stored ciphertext to the latest key version, after which `min_decryption_version` is raised. | OpenBao 2.7.1 source: rewrap returns `key_version`, decrypt/rewrap refuse below-min ciphertext with a 400 carrying the exact string `ErrTooOld`; operator policy already grants rotate/config/read; the AppRole already holds rewrap (proven live by `TRANSIT_CANARY`); raising min is reversible while the key is not trimmed (trim is denied). |
</phase_requirements>

## Project Constraints (from AGENTS.md, CLAUDE.md and operator memory)

There is no `./CLAUDE.md` in the repository. The global `~/.claude/CLAUDE.md` only points at `~/.aliases`. The binding rules come from `./AGENTS.md` and the operator memory:

- **Port 7442 and plain MQTT stay.** Never close, redirect or TLS-enforce them as "hardening". Phase 41 must not touch the `ports: 7442:7442` entry of `thinx_api`.
- **Edge (Traefik):** changes only through `docker service update`. Never `restart.sh`, `thinx.sh` or `docker stack deploy` for this phase. Phase 41 touches no Traefik label or arg.
- **`thinx_api` changes:** one targeted `docker service update` per change, from a 0600 root spec backup, repo-first in `thinx-swarm`. Micro cannot reach GitHub, so thinx-swarm goes by `ssh push + ff-merge` into `/mnt/gluster/deployment/swarm`. Never edit that checkout in place.
- **Git:** push the parent repo to `thinx-staging` only. No `main` merge and no v1.18 release until v1.17 (phases 39–41) is done. Pushing to `thinx-staging` deploys: CircleCI builds the image and Swarmpit rolls `thinx_api`.
- **SSH form:** use `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 …` literally. core is `root@188.166.203.163` with the same key and port. Service placement floats, so query it first.
- **Logs:** `docker service logs` hangs on micro. Use `timeout 30 docker logs --since … <container>`.
- **Secrets:** never print, commit or log a secret value, token, ciphertext or key material. Subagents must never run env-dumping commands (`env`, `printenv`, bare `export`, `set`, `/proc/*/environ`, `docker inspect` of env values). Evidence is names, counts, booleans and status codes only.
- **The swarm is staging-grade** (operator, 2026-10-19): writes to the swarm are allowed, but the hard rules above still hold.
- **GSD execution:** run production plans in default mode, not auto. Auto mode's classifier denies prod-ssh spawns and combined commit+push. Force isolation to none.
- **Dependencies:** no new package. The wiring gate's `SCOPE_NO_NEW_DEPENDENCY` check fails on any new OpenBao or Vault dependency.

## Summary

The code side is small and well prepared. `keyformat.readKey()` already classifies every file by content. `transit.js` needs one new call, `rewrapKey`. `git.js` and `rsakey.js` lose a clearly bounded legacy branch. The migration and rewrap script follows the `purge-orphaned-rsa-keys.js` pattern. Production has to be handled with more care than the code, for three reasons.

**1. One file needs a conversion step.** A read-only probe of production today (2026-10-20) found 78 private-key files: 72 `ENCRYPTED PRIVATE KEY`, 4 `RSA PRIVATE KEY` (PKCS#1, unencrypted, from 2021), 1 `OPENSSH PRIVATE KEY` (unencrypted, 2022) and 1 `vault:v1` file. No file is of unknown format and there are no `*.sh` askpass files. Node's `crypto` reads PKCS#8 (with the passphrase) and PKCS#1. It cannot read the OpenSSH format (`ERR_OSSL_UNSUPPORTED`). This matters because `git.js withAgent()` calls `crypto.createPublicKey(pemBuf)` on the decrypted Transit plaintext. An OpenSSH-format plaintext encrypted as-is would therefore fail at build time with `agent_load_failed`. The migration must normalise every legacy key to the exact form `generate()` writes today, which is unencrypted PKCS#8 PEM. For the one OpenSSH key, `ssh-keygen -p -m PKCS8` on a copy in the container's tmpfs `/dev/shm` does the conversion. The D-01 orphan purge may remove that key first. All 72 encrypted keys date from 2023-03 or later, so a candidate list of `readSecret("GIT_KEY_PASSPHRASE")` and then the historic literal `thinx` covers them.

**2. The passphrase lives in more places than the files D-08 lists.** It is also in:
- the `GIT_KEY_PASSPHRASE=` line of `/mnt/gluster/thinx/.env` (count 1). `thinx_worker` (root) bind-mounts that whole tree.
- the live `thinx_api` `.PreviousSpec`, which still holds the env value after the removal update.
- the two 0600 spec backups on micro (`thinx-api-pre-openbao-*`, `thinx-api-pre-keygen-*`).
- the thinx-swarm wiring gate (`PASSPHRASE_KEPT`, the `API_SECRETS` and `SPEC_ATTACHMENTS` checks, two self-test mutations, and the `SPEC_DELTA` baseline normaliser).
- `openbao-verify.sh --api-service`, which currently requires `GIT_KEY_PASSPHRASE` to be mounted.

If those checks are not flipped in the same thinx-swarm commit, every Phase 39/40 gate goes red the moment the secret is removed.

**3. OpenBao behaves as the plan needs.** This was confirmed against the v2.7.1 source:
- Rewrap returns `{ciphertext, key_version}`.
- Decrypt and rewrap of a ciphertext below `min_decryption_version` return HTTP 400 with the exact error string `ciphertext or signature version is disallowed by policy (too old)`. That string is the reliable signal for the D-13 reason class.
- The operator policy already grants `transit/keys/+/rotate`, read on `transit/keys/+` and `min_decryption_version` on `transit/keys/+/config`, so no policy change is needed.
- Lowering `min_decryption_version` again is allowed as long as the key is not trimmed, and trim is denied by policy. D-14 can therefore be rolled back.

The operator has no Transit decrypt permission. The refused-old-ciphertext proof must therefore go through the AppRole inside the API task, using a canary captured before the rotation. It cannot be done in the operator's `bao` session.

**Primary recommendation:** Plan five plans in strict order:
1. Migration and rewrap code plus specs (CI only).
2. Migration deploy and production run: tar, purge, dry-run, migrate, re-run, D-10 build.
3. Removal deploy: code, D-13/IN-10/T-40-12 fixes, specs.
4. Secret/env retirement: thinx-swarm commit first (thinx.yml, the gate, the verifier, the parent `docker-swarm.yml` mirror), then the service update, `docker secret rm` and removal of the `.env` line.
5. Rotation: canary, operator rotate, rewrap, re-run, build, operator raise, refusal proof, runbook recipe, shred.

Every production step is an operator-visible checkpoint.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Legacy key parse / passphrase decrypt / PKCS#8 normalise | API process (one-shot node script in the `thinx_api` task) | — | Needs the passphrase (secret mounted only on `thinx_api`) and the AppRole; plaintext stays in that process's memory (plus `/dev/shm` tmpfs for the single OpenSSH key) |
| Encrypt / rewrap / decrypt | OpenBao Transit (`vault_openbao`) via the `thinx-api` AppRole | — | D-01/D-12: no local crypto, the policy is unchanged |
| Key rotation, `min_decryption_version` | OpenBao, operator userpass token | — | AppRole cannot (thinx-api.hcl); operator policy can |
| Storage of key files | GlusterFS volume `/mnt/gluster/thinx/ssh_keys` | — | Unchanged; atomic temp + rename in the same directory |
| Pre-migration backup | micro host, root, node-local ext4 (`/root/...`) | — | D-05: never Gluster, never in the container |
| Secret / env retirement | Docker Swarm manager (micro) | thinx-swarm repo (source of truth) | Repo-first, then one service update |
| Owner notification for quarantined keys | CouchDB `managed_logs` (Audit log, per owner) | — | The only persistent per-owner path a separate process can write (see Open Question 1) |
| Keyed build proof | API `git.js` fetch path + worker | operator (UAT) | Live build of a private repo |

## Live Production Inventory (read-only probes, 2026-10-20)

All of these come from read-only commands over the AGENTS.md ssh form. They print names, counts and modes only.

| Fact | Value | Provenance |
|------|-------|-----------|
| `thinx_api` placement | 1 task on `micro`, Running 18 h | [VERIFIED: `docker service ps thinx_api`] |
| Swarm secrets | `BAO_ROLE_ID` (40 h), `BAO_SECRET_ID` (40 h), `GIT_KEY_PASSPHRASE` (2 weeks) | [VERIFIED: `docker secret ls`] |
| Live `thinx_api` secrets (names) | `CSRF_SECRET SLACK_BOT_TOKEN SLACK_WEBHOOK GITHUB_CLIENT_SECRET GOOGLE_OAUTH_SECRET MAILGUN_API_KEY GIT_KEY_PASSPHRASE ROLLBAR_SERVER_TOKEN WORKER_SECRET INFLUXDB_TOKEN NEW_RELIC_LICENSE_KEY BAO_ROLE_ID BAO_SECRET_ID` | [VERIFIED: `docker service inspect` names only] |
| Live env key `GIT_KEY_PASSPHRASE` | present (count 1); `.PreviousSpec` exists | [VERIFIED: jq key names only] |
| `/mnt/gluster/thinx/.env` | `600 root:root`, 1 line starting `GIT_KEY_PASSPHRASE=` | [VERIFIED: `grep -c`, `stat`] |
| `ssh_keys` directory | `666 root:root` (no x bit; root bypasses), 156 entries: 78 `.pub`, 0 `.sh`, 0 dotfiles, 0 names outside `^[0-9a-f]{64}-[0-9]+(\.pub)?$`, 0 non-regular, 29 owners, 384 K | [VERIFIED: `ls`, `find`, `stat`] |
| Private-file kinds (first line) | 72 `-----BEGIN ENCRYPTED PRIVATE KEY-----`, 4 `-----BEGIN RSA PRIVATE KEY-----`, 1 `-----BEGIN OPENSSH PRIVATE KEY-----`, 1 `vault:v1`, 0 other | [VERIFIED: header histogram] |
| PKCS#1 keys encrypted (`Proc-Type: 4,ENCRYPTED`) | 0 | [VERIFIED: `grep -l`] |
| OpenSSH key cipher | `none` (unencrypted; base64 magic `b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ` matched 1/1) | [VERIFIED] |
| Encrypted-key creation months (filename ms timestamp) | earliest 2023-03; 2023: 52, 2024: 9, 2025: 2, 2026: 9 | [VERIFIED: filename timestamps] |
| Private-file modes | 78 × `600 root` | [VERIFIED] |
| `/root` on micro | `/dev/vda1 ext4`, 58 G, 16 G free; `/root/thinx-backups` does not exist yet | [VERIFIED: `findmnt`, `df`] |
| Gluster backup job references to `/root` | 0 (`grep -c '/root' /etc/cron.daily/backup`) | [VERIFIED] |
| API container | uid 0, Node `v26.10.0`, `ssh-keygen`/`ssh-add`/`ssh-agent`/`shred` present, WORKDIR `/opt/thinx/thinx-device-api`, `os.tmpdir()` = `/tmp` on overlay (disk), `/dev/shm` = tmpfs 64 MiB `noexec`, OpenSSH_10.3p1 / OpenSSL 3.5.8 | [VERIFIED: `docker exec` probe] |
| Exited `thinx_api` containers holding old env | 0 on micro, 0 on core | [VERIFIED: `docker ps -a`] |
| 0600 spec backups on micro | `rollback/api-service/thinx-api-pre-keygen-<UTC>.json` ×1, `thinx-api-pre-openbao-<UTC>.json` ×1. Both contain the full env, the passphrase value included. | [VERIFIED: `ls`; content not read] |

## Standard Stack

### Core (no new dependency — all already in the image or the repo)

| Component | Version | Purpose | Why |
|-----------|---------|---------|-----|
| Node `crypto` (`createPrivateKey`, `KeyObject.export`) | Node 26.10.0 in the image (25.1.0 on the laptop) | Decrypt passphrase PKCS#8, parse PKCS#1, export unencrypted PKCS#8 PEM | The same API `generate()` uses; no forge or sshpk needed [VERIFIED: synthetic-key probe on Node 25.1.0; image version VERIFIED] |
| `ssh-keygen -p -m PKCS8 -N "" -P ""` | OpenSSH 10.3p1 in the image | Convert the one unencrypted OpenSSH-format key to PKCS#8 | Node cannot parse `openssh-key-v1`; conversion keeps the same public key [VERIFIED: synthetic-key probe on the laptop OpenSSH; image version VERIFIED, behaviour on 10.3p1 ASSUMED identical] |
| `lib/thinx/transit.js` | Phase 40 | AppRole login, encrypt/decrypt, retries, D-05 alerts; add `rewrapKey` | Locked by D-04/D-12 |
| `lib/thinx/keyformat.js` | Phase 40 | `readKey()` bounded, FIFO-safe classifier | Locked by D-04 |
| OpenBao Transit | `openbao/openbao:2.7.1` (prod and CI dev server) | rotate / rewrap / config `min_decryption_version` | [VERIFIED: docker-compose.test.yml:295, openbao.md §1] |
| jasmine 5 + `node --test` | repo | Unit + integration specs | [VERIFIED: spec/support/jasmine.json, package.json `test:node`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ssh-keygen` conversion of the OpenSSH key | Encrypt OpenSSH bytes verbatim and derive the agent public key with `ssh-add -L` in `git.js` | Changes the hot build path in `git.js`. Rejected. |
| `ssh-keygen` conversion | Hand-written `openssh-key-v1` parser → JWK → `createPrivateKey` | Hand-rolled crypto parsing for one file. Rejected. |
| `ssh-keygen` conversion | Quarantine the OpenSSH key (D-02) | The key *is* convertible, so D-02 does not apply. Quarantine is only acceptable if the planner shows the key is an orphan (D-01 removes it first). |
| Rewrap every file every run | Skip files already at the latest version | Skipping keeps the second run at "0 rewrapped" (D-12 idempotency). Recommended. |
| `batch_input` rewrap | One request per file | 78 files; sequential single requests are simpler and keep per-file error handling. |

**Installation:** none. Phase 41 adds no npm, apk or Go package.

## Package Legitimacy Audit

Not applicable: this phase installs no external package. The scripts use Node built-ins (`crypto`, `fs`, `child_process`) and modules already in the repo (`fs-extra`, `lib/thinx/*`).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         operator laptop
                               │ ssh (AGENTS.md form)
                               ▼
 ┌──────────────────────────── micro (manager) ─────────────────────────────────────────┐
 │  root shell                                                                           │
 │   ├─(D-05) tar /mnt/gluster/thinx/ssh_keys ──► /root/thinx-backups/*.tar (0600, ext4) │
 │   └─ docker exec <thinx_api container> node scripts/…                                 │
 │                                                                                       │
 │  thinx_api task (uid 0)                                                               │
 │   purge-orphaned-rsa-keys.js ──► CouchDB managed_users view ──► unlink orphan pairs   │
 │                                                                                       │
 │   migrate-deploy-keys.js                                                              │
 │     for each <owner>-<ts> private file:                                               │
 │       keyformat.readKey ─┬─ transit ──► count by vN (migrate: skip)                   │
 │                          ├─ unknown/unreadable ──► report (never touched)             │
 │                          └─ legacy ──► parse:                                         │
 │                               ENCRYPTED PKCS#8 → createPrivateKey{passphrase cand.}   │
 │                               RSA PKCS#1       → createPrivateKey                     │
 │                               OPENSSH          → ssh-keygen -p -m PKCS8 in /dev/shm   │
 │                               fail ──► QUARANTINE (unlink pair, Audit.log owner)      │
 │                               ok ──► PKCS#8 PEM Buffer                                 │
 │                                       │ HTTPS (BAO_CACERT, AppRole)                    │
 │                                       ▼                                                │
 │   ┌──── vault_openbao (openbao-internal overlay) ────┐                                 │
 │   │ transit/encrypt  → vault:vL:…                    │                                 │
 │   │ transit/decrypt  (round-trip verify)             │                                 │
 │   │ transit/rewrap   → {ciphertext, key_version}     │◄── operator userpass token:     │
 │   │ keys/…/rotate, keys/…/config min_decryption_ver  │    rotate / raise min (bao CLI) │
 │   └──────────────────────────────────────────────────┘                                 │
 │                                       │                                                │
 │       write .<name>.<hex>.keymig.tmp (wx,0600,fsync) → recheck → rename over <name>    │
 └───────────────────────────────────────┼────────────────────────────────────────────────┘
                                         ▼
                    GlusterFS /mnt/gluster/thinx/ssh_keys/<owner>-<ts>  (vault:vN: line)
                                         │
                       build: git.js fetch → readKey → decrypt → ssh-agent → git clone
```

### Recommended file layout (new and changed)

```
scripts/migrate-deploy-keys.js        # new: --dry-run | --migrate | --rewrap | --report, --json; canary helpers
lib/thinx/transit.js                  # + rewrapKey(), + D-13 reason class, + op tag on TransitError (IN-10)
lib/thinx/git.js                      # − sshEnv/create_askfile/delete_askfile/legacy branch; legacy → skip (D-09); T-40-12 fixed token
lib/thinx/rsakey.js                   # − keyPassphrase() and its comment block
scripts/purge-orphaned-rsa-keys.js    # header comment no longer names GIT_KEY_PASSPHRASE
spec/fixtures/fake-transit.js         # + rewrapKey, + version control (rotate(), minDecryption)
spec/fixtures/mock-openbao.js         # + POST /v1/transit/rewrap/thinx-deploy-keys, scripted 400 {errors:[ErrTooOld]}
spec/jasmine/MigrateDeployKeysSpec.js # new: unit (fake transit, synthetic keys in tmp dirs)
spec/jasmine/TransitRotationSpec.js   # new: integration vs dev server (runs after TransitIntegrationSpec)
spec/node/PassphraseRetired.test.js   # new: static gate, no GIT_KEY_PASSPHRASE in lib/ scripts/ Dockerfile* docker-compose* docker-swarm.yml
thinx-swarm: thinx.yml, tests/openbao-api-wiring.test.sh, scripts/openbao-verify.sh
.planning/runbooks/openbao.md         # §11 update, new §12 rotation recipe, evidence log
```

### Pattern 1: Legacy → PKCS#8 normalisation (migration core)

**What:** Turn any legacy file into exactly the plaintext form `generate()` sends to Transit today, which is unencrypted PKCS#8 PEM (`rsakey.js:621-624`, `type: 'pkcs8', format: 'pem' // no encryption here`).
**Why:** `git.js:423` derives the agent public key with `crypto.createPublicKey(pemBuf)`. Any plaintext Node cannot parse fails with `agent_load_failed` at build time, not at migration time.

| Legacy header | Node `createPrivateKey` | Conversion | Evidence |
|---|---|---|---|
| `ENCRYPTED PRIVATE KEY` + right passphrase | ok → export pkcs8 | in memory | [VERIFIED: synthetic probe] |
| `ENCRYPTED PRIVATE KEY` + wrong passphrase | `ERR_OSSL_BAD_DECRYPT` | try next candidate, then quarantine | [VERIFIED] |
| `ENCRYPTED PRIVATE KEY`, no passphrase given | `ERR_OSSL_CRYPTO_INTERRUPTED_OR_CANCELLED` (no TTY prompt) | always pass a candidate | [VERIFIED] |
| `RSA PRIVATE KEY` (PKCS#1, no Proc-Type) | ok → export pkcs8 | in memory | [VERIFIED] |
| `OPENSSH PRIVATE KEY` | `ERR_OSSL_UNSUPPORTED` | `ssh-keygen -q -p -m PKCS8 -N "" -P "" -f <copy>`; same public key afterwards | [VERIFIED: synthetic probe, public-key hashes equal] |

**Passphrase candidates (in order):** `readSecret("GIT_KEY_PASSPHRASE")`, then the historic literal `thinx`.
- From 2023-01-14 to 2026-09-18 `generate()` hard-coded `'thinx'` (`git log -S`, commits `6be92e59` and `fa41c8bc`). It has read the secret since 2026-09-18.
- Whether the swarm secret equals `thinx` is unknown and must not be printed. Report only *which candidate index* decrypted each key, as counts.
- The `''` candidate (2022-05-17 to 2023-01-14 era) is unnecessary: no encrypted key on disk predates 2023-03 [VERIFIED: histogram]. It is harmless to include.
- This candidate list, and every `GIT_KEY_PASSPHRASE` reference in the script, must be **deleted in the removal commit** (D-08 step 1). Otherwise "gone from the code" fails.

**Example (sketch, not final code):**
```javascript
// Source: Node crypto docs (createPrivateKey/KeyObject.export) + rsakey.js:615-624 (the target form)
const crypto = require("crypto");
function toPkcs8(text, candidates) {          // text: legacy file content (string), never logged
	const opts = { key: text, format: "pem" };
	const encrypted = /^-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(text);
	for (const pass of encrypted ? candidates : [undefined]) {
		try {
			const k = crypto.createPrivateKey(pass === undefined ? opts : Object.assign({}, opts, { passphrase: pass }));
			if (k.asymmetricKeyType !== "rsa") return { cause: "unsupported_type" };
			return { pem: Buffer.from(k.export({ type: "pkcs8", format: "pem" }), "utf8"), via: encrypted ? candidates.indexOf(pass) : -1 };
		} catch (e) {
			if (e && e.code === "ERR_OSSL_BAD_DECRYPT") continue; // wrong candidate
			return { cause: "unparseable" };               // e.g. ERR_OSSL_UNSUPPORTED -> OpenSSH path
		}
	}
	return { cause: "wrong_passphrase" };                 // -> D-02 quarantine
}
```

### Pattern 2: Verified atomic replace (migration and rewrap)

**What:** Replace `<owner>-<ts>` in place with its `vault:vN:` line, so a concurrent build sees the old or the new file, never a partial one. The name and mode 0600 stay the same.
**Precedent on this volume:** `rsakey.replacePublicKey()` (rsakey.js:498-525) already uses dot-prefixed temp + `renameSync` in `ssh_keys` (Phase 45) [VERIFIED].

Steps per file:
1. Hash the bytes read by the classifier. `keyformat.readKey` zeroes its buffer and returns no legacy text, so the script needs its own bounded read, mirroring `readKey`'s `O_NONBLOCK` + fstat regular-file check + 64 KiB cap.
2. Convert (Pattern 1), then `encryptKey(pkcs8)` and immediately `decryptKey(ct)`. Compare with `crypto.timingSafeEqual` against the PKCS#8 buffer. Zero both buffers in `finally`.
3. `openSync(tmp, "wx", 0o600)`, write `ct + "\n"`, `fsyncSync`, `closeSync`, `chmodSync(tmp, 0o600)`. `tmp = ssh_keys + "/." + name + "." + randomBytes(6).hex + ".keymig.tmp"`. The leading dot keeps it outside `KEY_FILENAME`, so `list()`, the purge and builds never see it.
4. **Re-check just before rename:** the target still exists, is still a regular file and has the same hash (not revoked, not replaced meanwhile), and its `.pub` still exists. If any check fails, unlink tmp and report `changed_during_run` (not migrated, not failed; it is re-run next time).
5. `renameSync(tmp, target)`. Then re-check that the `.pub` exists. If a revoke landed in between, unlink the resurrected private file (the `rsakey.rename` IN-04 pattern).
6. At start of every run, remove leftover `.*.keymig.tmp` files of this script only (exact regex).

**Locking:** `withCheckoutLock` (git.js:179) is an in-process `Map` keyed by build path, not by owner. A `docker exec`'d node process cannot share it, and there is no cross-process per-owner lock [VERIFIED: git.js:179-191]. Do not take a lock. Rename atomicity plus attempt-time classification (git.js:826) is enough. One residual race: the legacy branch hands the *path* to `ssh -i`, which opens it later. A file renamed between classification and ssh's open fails that one attempt (`key_unusable`), and the next build succeeds. Run migration in a quiet window. This race disappears with the removal deploy.

### Pattern 3: Rewrap with idempotent skip (D-12)

- Learn the latest version L **without widening the AppRole**: one `encryptKey` of 32 random bytes (discarded), and parse `vL` from the returned prefix. The `thinx-api` policy grants encrypt, not key read [VERIFIED: thinx-api.hcl:9-19].
- For every `transit` file: if its `vN` equals L, count it `at_latest`. Otherwise `rewrapKey(ct)` → expect `data.key_version === L` and a `vault:vL:` prefix → atomic replace (Pattern 2, hash re-check). An optional decrypt-compare of old and new in memory is cheap (78 files).
- Report `versions_before` (map vN → count), `rewrapped`, `at_latest`, `failed`, `legacy` (must be 0), `unknown`. A second run reports `rewrapped: 0`.
- Rewrap of a ciphertext **below** `min_decryption_version` fails with the same too-old 400 as decrypt. Rewrap therefore must finish before the operator raises the minimum [VERIFIED: OpenBao 2.7.1 `path_rewrap.go:138` calls `p.Decrypt`].

**`rewrapKey` in transit.js (sketch):**
```javascript
// Source: OpenBao v2.7.1 internal/builtin/logical/transit/path_rewrap.go:186-191
// (single-item response {"ciphertext": …, "key_version": …}); request param "ciphertext"
async _rewrapOnce(token, ciphertext) {
	const r = await this._request("transit/rewrap/" + KEY, { ciphertext }, token);
	if (r.code || r.tooBig || r.status < 200 || r.status > 299) throw this._classify("rewrap", r);
	const ct = r.json && r.json.data && r.json.data.ciphertext;
	const ver = r.json && r.json.data && Number(r.json.data.key_version);
	if (typeof ct !== "string" || !/^vault:v[1-9][0-9]*:/.test(ct) || !Number.isInteger(ver)) throw new TransitError("server_error", r.status);
	return { ciphertext: ct, version: ver };
}
```
`_classify` must treat op `rewrap` like `decrypt` for 400s (both go through `p.Decrypt`).

### Pattern 4: D-13 reason class for below-minimum ciphertext (IN-05)

The current classifier, verbatim from `lib/thinx/transit.js:204-213` [VERIFIED]:
```javascript
	_classify(op, r) {
		if (r.code) return new TransitError(transportReason(r.code), null);
		const s = r.status;
		if (r.tooBig) return new TransitError("server_error", s);
		if (s === 503) return new TransitError("sealed", s);
		if (s === 403) return new TransitError("denied", s);
		if (s === 400 && (op === "login" || op === "probe")) return new TransitError("denied", s);
		if (s === 400 && op === "decrypt") return new TransitError("bad_ciphertext", s);
		return new TransitError("server_error", s);
	}
```
Current reasons, verbatim `lib/thinx/transit.js:36-44` [VERIFIED]:
```javascript
const REASONS = Object.freeze([
	"not_configured",
	"unreachable",
	"tls",
	"sealed",
	"denied",
	"bad_ciphertext",
	"server_error"
]);
```
The incident gate, verbatim `transit.js:315-316` [VERIFIED]:
```javascript
	_fail(reason) {
		if (reason === "bad_ciphertext" || this._incident) return; // one damaged file is not an outage
```
OpenBao's error, verbatim from `sdk/helper/keysutil/policy.go:87` at tag v2.7.1 [VERIFIED: fetched with `gh api`]:
```go
	ErrTooOld = "ciphertext or signature version is disallowed by policy (too old)"
```
It is raised at `policy.go:1129-1130` (`if p.MinDecryptionVersion > 0 && ver < p.MinDecryptionVersion { return "", errutil.UserError{Err: ErrTooOld} }`) and returned as `logical.ErrorResponse(...)`, `logical.ErrInvalidRequest`, i.e. HTTP 400 with `{"errors":[…]}` (`path_decrypt.go:217`, `path_rewrap.go:186`) [VERIFIED].

**Recommendation:**
- Add a reason. The name is the planner's choice; the proposal is `retired_version` [ASSUMED name]. `_classify` maps it when `s === 400 && (op === "decrypt" || op === "rewrap")` and `r.json.errors` is an array containing the exact `ErrTooOld` string. Compare by equality, never log the string.
- Map "encryption key not found" (400, `path_decrypt.go:164`) too, to a service-level class (e.g. `key_missing`) in `SERVICE_DOWN_REASONS`. IN-05 names it as the other fleet-wide 400.
- Give the new class a `SENTENCES` entry so `unavailableSentence()` and the build log are meaningful, e.g. "stored key uses a retired key version" [ASSUMED wording].
- **Alert flapping pitfall:** `_ok()` closes the incident on the next success of *any* key. A per-key `retired_version` opened through `_fail` would post FAILING/RECOVERED pairs on every build that also has a good key. Use a separate per-process latch for this class: one alert per process, no recovery post. Or accept the pairs. Either way, decide explicitly and spec it.
- **IN-10:** tag `TransitError` with the op (`err.op = "login"|"decrypt"|…`). In `fetchHoldingLock` treat `server_error` from `login` as service-down (set `serviceDown`), and keep decrypt `server_error` per key.
- **T-40-12:** `git.js:801` `console.log(\`[git] fetch attempt with key ${name} failed: ${e && e.message}\`)` → a fixed token, e.g. `failed: attempt_error`.

### Pattern 5: Removal of the legacy path (D-08 step 1, D-09)

The legacy branch, verbatim `git.js:841-860` (abridged) [VERIFIED]: `if (key.kind !== "legacy") { … skipped: ${key.cause} …; continue; }` then `askpass = this.create_askfile(); … this.sshEnv(keyPath, askpass) …`.

After removal:
```javascript
if (key.kind !== "transit") {
	const cause = (key.kind === "legacy") ? "legacy_format_unsupported" : key.cause;  // D-09, name ASSUMED
	console.log(`[git] key ${name} skipped: ${cause}`);
	continue;   // never deleted, no Slack (D-09)
}
```
Remove: `sshEnv()` (git.js:457-467), `create_askfile()`/`delete_askfile()` (git.js:656-672), `ASKPASS_PREFIX`, `Git.SSH_COMMAND` if only `sshEnv` uses it (check `symlinkEntries`/keyless paths first), `RSAKey.keyPassphrase()` (rsakey.js:96-107), and the `readSecret` import in git.js if it becomes unused.
- Whether `baseEnv()`/`agentEnv()` keep `delete env.GIT_KEY_PASSPHRASE` (git.js:361, 380) is a scoping decision. See Open Question 3. The recommendation is to drop them from `lib/` and keep a **spec** asserting a keyed attempt's env never carries the name.
- The migration script's legacy mode goes in the same commit. `--rewrap`, `--report` and the canary helpers stay.

### Pattern 6: Secret/env retirement (D-08 step 2), repo-first

The order recommended to satisfy *both* "repo-first" (carried-forward rule) and "code stops reading before the secret disappears" (D-08):
1. **thinx-swarm commit:**
   - `thinx.yml`: delete `GIT_KEY_PASSPHRASE:` / `external: true` (lines 46-47), the api secret (256) and the env (292).
   - `tests/openbao-api-wiring.test.sh`:
     - `API_SECRETS` drops `GIT_KEY_PASSPHRASE`.
     - `PASSPHRASE_KEPT` becomes `PASSPHRASE_ABSENT` (neither secret declaration nor api secret nor env).
     - `JQ_STRIP` also deletes the three passphrase entries from the current side, or the baseline side gets them deleted, so `BASELINE_UNCHANGED` holds.
     - The self-test cases `passphrase-env-removed` / `passphrase-secret-removed` become `passphrase-env-readded` / `passphrase-secret-readded`.
     - The `--live` `SPEC_ATTACHMENTS` flag 6 becomes "no `GIT_KEY_PASSPHRASE` secret", plus a new check of no env key of that name in `.Spec` (and, reported separately, `.PreviousSpec`).
     - The `SPEC_DELTA` `NORM` drops the `GIT_KEY_PASSPHRASE` secret + env on both sides.
   - `scripts/openbao-verify.sh` (line 354 loop): stop requiring `GIT_KEY_PASSPHRASE`, assert its absence.
   - The header comments at lines 13-14 and 36.

   The parent `docker-swarm.yml` mirror (lines 33, 105-106, 330, 359) goes in a parent commit at the same time. The gate's `FILES_MATCH` subset does not include the passphrase, but each file's `BASELINE_UNCHANGED` does.
2. Push thinx-swarm to origin `master`. That triggers CircleCI errorpage/downtime rebuilds; wait for their redeploy before the edge gate (STATE Phase 39 note). Then ssh-push + `git merge --ff-only` on micro, and `openbao-install.sh` to refresh `/usr/local/sbin/openbao-verify.sh`. It copies the reviewed files and needs a clean checkout. It also re-copies `vault.conf`/policies, which is a no-op if they are unchanged.
3. 0600 spec backup on micro in `/var/lib/openbao-maintenance/rollback/api-service/thinx-api-pre-passphrase-rm-<UTC>.json`. Use a distinct prefix; the gate reads only `thinx-api-pre-openbao-*`.
4. `docker service update --detach=false --no-resolve-image --secret-rm GIT_KEY_PASSPHRASE --env-rm GIT_KEY_PASSPHRASE thinx_api`. This restarts the task once, with a brief API and :7442 interruption and a new boot probe.
5. Check `[transit] probe ok`, the live wiring gate, the edge gate, :7442/1883/8883, and a keyed build.
6. `docker secret rm GIT_KEY_PASSPHRASE`. It fails while any service still references it, which is a built-in safety check.
7. Delete the `GIT_KEY_PASSPHRASE=` line from `/mnt/gluster/thinx/.env`. This is a host edit of a root 600 file: use `sed -i '/^GIT_KEY_PASSPHRASE=/d'` and show only `grep -c` before and after. `restart.sh` reads that file literally, and `thinx.yml` no longer interpolates it.
8. `.PreviousSpec` still carries the env value until the next spec change. The next Swarmpit image roll (any parent `thinx-staging` push) clears it, as does a deliberate `docker service update --force thinx_api`. Make the verification read both `.Spec` and `.PreviousSpec`.

**Rollback:**
- Between steps 4 and 6: `docker service update --rollback thinx_api` restores the secret and env (PreviousSpec), or `--secret-add/--env-add` restores them explicitly.
- After step 6: recreate the secret from… nothing. The value would then exist only in the spec backups and `.env`. Do not delete those until steps 4 and 5 are green.
- The code no longer reads the passphrase in any case (D-08 step 1). Rollback of this step therefore only matters for an emergency revert of the removal code.

### Pattern 7: Rotation (D-11/D-12/D-14), operator plus AppRole

```bash
# 0. (API task, AppRole) capture a canary BEFORE rotating: v1 ciphertext of random junk, stdout redirected on the
#    host into a 0600 root file (never displayed). Its plaintext is discarded and never needed.
# 1. (micro) OpenBao pre-change snapshot
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 '/usr/local/sbin/openbao-backup.sh --pre-change'
# 2. (operator terminal, interactive password) runbook §6
ssh -t micro; C=$(docker ps -q -f label=com.docker.swarm.service.name=vault_openbao -f status=running); docker exec -it "$C" sh
bao login -method=userpass username=operator
bao read -format=json transit/keys/thinx-deploy-keys | jq '.data | {latest_version, min_decryption_version, min_encryption_version, min_available_version}'
bao write -f transit/keys/thinx-deploy-keys/rotate          # latest_version 1 -> 2
# 3. (API task) node scripts/migrate-deploy-keys.js --rewrap --json ; again -> rewrapped 0, all at v2
# 4. keyed build (private repo) green
# 5. (operator) raise the minimum
bao write transit/keys/thinx-deploy-keys/config min_decryption_version=2
bao read -format=json transit/keys/thinx-deploy-keys | jq '.data | {latest_version, min_decryption_version}'   # 2 / 2
bao token revoke -self; rm -f ~/.vault-token; exit
# 6. (API task) prove the canary is refused: decryptKey(canary) rejects with the D-13 class (print the class only)
# 7. keyed build green again; post-change snapshot: openbao-backup.sh --post-change
```
- Endpoints, verbatim from the OpenBao 2.7.1 docs [CITED: openbao `website/content/docs/api/secret/transit.mdx` @ v2.7.1]: `POST /transit/keys/:name/rotate`, `POST /transit/keys/:name/config` (`min_decryption_version` "Specifies the minimum version of ciphertext allowed to be decrypted"), `POST /transit/rewrap/:name`. The read-key response carries `"latest_version"`, `"min_decryption_version"`, `"min_encryption_version"`, `"min_available_version"` [VERIFIED: `path_keys.go:404-407`].
- Operator authority, verbatim from `thinx-swarm/openbao/policies/operator.hcl:62-82` [VERIFIED]: `path "transit/keys/+" { capabilities = ["create", "read", "update"] … denied_parameters = { "exportable" = [] "allow_plaintext_backup" = [] } }`, `path "transit/keys/+/config" { capabilities = ["update"] denied_parameters = { "exportable" = [] "allow_plaintext_backup" = [] "deletion_allowed" = [] } }`, `path "transit/keys/+/rotate" { capabilities = ["update"] }`. `min_decryption_version` is not a denied parameter, so **no policy change is needed**. Lines 225-229 deny the operator `transit/encrypt/*` and `transit/decrypt/*`, so step 6 must run through the AppRole in the API task.
- AppRole authority, verbatim from `thinx-api.hcl:9-19` [VERIFIED]: `path "transit/encrypt/thinx-deploy-keys" { capabilities = ["update"] }`, `path "transit/decrypt/thinx-deploy-keys" { capabilities = ["update"] }`, `path "transit/rewrap/thinx-deploy-keys" { capabilities = ["update"] }`. The live `TRANSIT_CANARY` already round-trips encrypt → decrypt → rewrap → decrypt [VERIFIED: wiring test header + openbao.md evidence 2026-10-19].
- **Validation by OpenBao:** `min_decryption_version` may not exceed `latest_version` ("cannot set min decryption version of %d, latest key version is %d", `path_keys_config.go:139-142`), and 0 is forced to 1 [VERIFIED]. Lowering it again is accepted (no monotonic check) while `min_available_version` is 1. `trim` is denied for the operator (`operator.hcl:216-218`), so D-14 stays reversible.

### Anti-Patterns to Avoid
- **Encrypting legacy bytes verbatim.** OpenSSH-format plaintext breaks `withAgent` (`createPublicKey`), and an encrypted PKCS#8 plaintext would need a passphrase at build time. Always normalise to unencrypted PKCS#8.
- **Rewriting a file the script did not just read.** Use the hash re-check in Pattern 2. Never resurrect a key revoked mid-run.
- **Raising `min_decryption_version` before the rewrap re-run reports 0 below latest.** Rewrap itself is refused below the minimum.
- **Proving refusal with a real key's old ciphertext.** It is key material at rest. Use a junk canary.
- **Printing the canary, ciphertext or candidate passphrase.** Redirect stdout into a 0600 host file, and report classes and counts only.
- **`docker secret rm` before the service update.** It fails anyway, but do not "fix" that with `--force`-style workarounds.
- **`docker stack deploy` / `restart.sh` to apply the thinx.yml change.** This is forbidden and would also drop the live-only attachments.
- **Writing the migration temp file under `os.tmpdir()`.** `/tmp` in the container is disk-backed overlay. Use `/dev/shm` (tmpfs) for the OpenSSH conversion copy, and the `ssh_keys` directory itself for the ciphertext temp file.

## Complete `GIT_KEY_PASSPHRASE` / legacy-path inventory

| Location | What | Action / phase step | Provenance |
|----------|------|---------------------|-----------|
| `lib/thinx/rsakey.js:96-107` | `static keyPassphrase()` reads `readSecret("GIT_KEY_PASSPHRASE")` | delete (step 1) | [VERIFIED: Read] |
| `lib/thinx/rsakey.js:603` | comment "GIT_KEY_PASSPHRASE is never read here" | reword (step 1) | [VERIFIED] |
| `lib/thinx/git.js:457-467` | `sshEnv()` sets `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE: "force"`, `GIT_KEY_PASSPHRASE: readSecret("GIT_KEY_PASSPHRASE") \|\| ""` | delete | [VERIFIED] |
| `lib/thinx/git.js:656-672` | `create_askfile()` / `delete_askfile()` | delete | [VERIFIED] |
| `lib/thinx/git.js:841-860` | legacy branch | replace with the D-09 skip | [VERIFIED] |
| `lib/thinx/git.js:306-312, 348-353, 361, 378-380, 606` | comments + `delete env.GIT_KEY_PASSPHRASE` | reword / decide (OQ-3) | [VERIFIED] |
| `scripts/purge-orphaned-rsa-keys.js:10-14` | header comment names the env var | reword | [VERIFIED: Read] |
| `Dockerfile:63` | comment list entry `#   GIT_KEY_PASSPHRASE` | delete the entry | [VERIFIED: Read] |
| `Dockerfile.test:127-128` | `ARG GIT_KEY_PASSPHRASE` / `ENV GIT_KEY_PASSPHRASE=${GIT_KEY_PASSPHRASE}` | delete (step 1) | [VERIFIED: Read] |
| `docker-compose.test.yml:127` | build arg `'GIT_KEY_PASSPHRASE=${GIT_KEY_PASSPHRASE:-thinx}'` | delete (step 1, together with the Dockerfile.test ARG) | [VERIFIED: Read] |
| `docker-compose.yml:174` | env `'GIT_KEY_PASSPHRASE=${GIT_KEY_PASSPHRASE}'` | delete (step 1) | [VERIFIED: Read] |
| `docker-swarm.yml:33, 105-106, 330, 359` | comment, `GIT_KEY_PASSPHRASE:` `external: true`, api secret, `"GIT_KEY_PASSPHRASE=${GIT_KEY_PASSPHRASE}"` | delete (step 2, same time as thinx.yml) | [VERIFIED: Read] |
| `thinx-swarm/thinx.yml:46-47, 256, 292` | secret decl, api secret, api env | delete (step 2, first) | [VERIFIED: Read 44-47; sed 235-300] |
| `thinx-swarm/thinx.yml.bak*` (13 tracked backup files) | historic copies carrying `${GIT_KEY_PASSPHRASE}` **references** (no value) | leave (history), or `git rm` as hygiene. Planner's choice; state it in VERIFICATION. | [VERIFIED: `git ls-files`, rg] |
| `thinx-swarm/tests/openbao-api-wiring.test.sh:13-14, 80-81, 87-88, 165-166, 204, 207, 215` | KEPT assertions, mutations, live checks | flip (Pattern 6) | [VERIFIED: sed] |
| `thinx-swarm/scripts/openbao-verify.sh:36, 354` | requires the secret mounted | flip + reinstall the node-local copy | [VERIFIED: grep -B/-A] |
| specs: `03-RsakeySpec.js:19-31, 234-245`; `GitSpec.js:200-240, 543-590, 664-720, 871`; `KeyFormatSpec.js:160-200`; `SecretsSweepSpec.js:741-860`; `DeployKeyNames.test.js:127-216`; `TransitIntegrationSpec.js:230` | set or assert the passphrase/askpass | rewrite: legacy → skip; drop the passphrase sweep; keep negative env assertions | [VERIFIED: rg] |
| Live `thinx_api` `.Spec` | secret mount + env value | step 2 service update | [VERIFIED: names] |
| Live `thinx_api` `.PreviousSpec` | env value persists one update | next roll or `--force` | [VERIFIED: PreviousSpec exists] |
| `docker secret ls` | `GIT_KEY_PASSPHRASE` | `docker secret rm` | [VERIFIED] |
| `/mnt/gluster/thinx/.env` | 1 line with the value; readable by `thinx_worker` (root, binds `/mnt/gluster/thinx`) | delete the line | [VERIFIED: grep -c, thinx.yml worker volumes] |
| micro `/var/lib/openbao-maintenance/rollback/api-service/*.json` (0600) | full env incl. the value | shred with the D-05 tar after the phase is verified (re-baseline the gate first) — Open Question 4 | [VERIFIED: listing] |
| Laptop `./.env` (gitignored) | may hold a value | operator check; not readable by agents (secret-read guard) | [ASSUMED] |
| CircleCI project env vars | unknown whether `GIT_KEY_PASSPHRASE` is set | operator check in the CircleCI UI; `docker-compose.test.yml` defaulted to `thinx` | [ASSUMED] |
| `ssh_keys/*.sh` | 0 today | D-08 step 3 = verify still 0 (`purge-orphaned-rsa-keys.js --askfiles` handles any) | [VERIFIED] |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decrypting PKCS#8 / parsing PKCS#1 | forge / custom ASN.1 | `crypto.createPrivateKey({key, format:"pem", passphrase})` + `.export({type:"pkcs8", format:"pem"})` | OpenSSL handles PBES2/scrypt variants; same path `generate()` uses |
| OpenSSH `openssh-key-v1` parsing | a bespoke parser → JWK | `ssh-keygen -p -m PKCS8 -N "" -P ""` on a `/dev/shm` copy | The tool already ships in the image; same public key proven |
| Re-encryption to a new key version | decrypt → encrypt in the script | `transit/rewrap` | Never exposes plaintext; the AppRole already holds it |
| Finding the latest key version | widening the AppRole to read the key | the version prefix of a fresh `encrypt` (or rewrap's `key_version`) | D-12: the policy is not widened |
| Refusal detection | regex on free-form error text | exact equality with `ErrTooOld` from OpenBao 2.7.1 | Stable constant in `keysutil` |
| Atomic file replace | write in place | `wx` temp in the same dir + `fsync` + `renameSync` (rsakey.js:498-525 precedent) | Concurrent builds never see a partial file |
| Orphan detection | a new owner scan | `scripts/purge-orphaned-rsa-keys.js` (D-01) | Already refuses on an empty or failed users view |

**Key insight:** every cryptographic step either already exists in OpenBao or Node/OpenSSL, or was proven in Phase 40. The new risk is mostly operational: ordering, idempotency, and places where the passphrase lingers.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 78 private-key files in `/mnt/gluster/thinx/ssh_keys` (72 enc PKCS#8, 4 PKCS#1, 1 OpenSSH, 1 `vault:v1`); Redis `gitkey:<owner>` holds **file names only** (git.js:720-731), and names do not change | **data migration** (script) for the files; Redis: none |
| Stored data (OpenBao) | `thinx-deploy-keys` at `latest_version` 1 (all ciphertext is `v1` today); after rotation the v1 key stays in the keyring archive (not trimmed) | rotate + rewrap + raise min; no trim (denied, out of scope) |
| Stored data (CouchDB) | quarantine notices written to `managed_logs` (90-day TTL via `expire_at`) | code (Audit.log) |
| Live service config | `thinx_api` spec env + secret mount; `.PreviousSpec`; swarm secret object; `/mnt/gluster/thinx/.env` line | service update, secret rm, `.env` line delete, PreviousSpec cleared by the next roll |
| OS-registered state | node-local `/usr/local/sbin/openbao-verify.sh` (installed copy, not the Gluster checkout) asserts the secret is mounted; no cron runs `--api-service` (cron runs only `openbao-backup.sh --daily` and `openbao-cert-renew.sh --daily`) | repo change + `openbao-install.sh` re-install on micro |
| Secrets / env vars | swarm secret `GIT_KEY_PASSPHRASE`; `.env` line; 0600 spec backups on micro; laptop `.env` (unverified); CircleCI project env (unverified) | remove, shred, or operator-confirm |
| Build artifacts | CI test images built from `Dockerfile.test` bake `ENV GIT_KEY_PASSPHRASE` (CI-local, never pushed as the API image); the production `Dockerfile` does not bake it (comment only) | code edit; no registry cleanup needed [ASSUMED: CI test image is not pushed] |
| Backups (accepted residual) | Gluster backups and DO snapshots taken before migration; the D-05 tar (until shredded) | none (accepted 2026-10-09); shred the tar per D-06 |

## Common Pitfalls

### Pitfall 1: OpenSSH-format key migrated verbatim
**What goes wrong:** Migration "succeeds", but the next keyed build logs `[git] key … skipped: agent_load_failed`.
**Why:** `git.js:423` `crypto.createPublicKey(pemBuf)` cannot parse `OPENSSH PRIVATE KEY` (`ERR_OSSL_UNSUPPORTED`).
**Avoid:** Normalise to PKCS#8 (Pattern 1). The round-trip check must include `crypto.createPublicKey(decrypted)` succeeding, not only a byte compare.
**Warning sign:** a dry-run reports any `legacy_openssh` count above 0 after the D-01 purge.

### Pitfall 2: Wrong passphrase candidate ordering or a missing literal
**What goes wrong:** ~67 keys from before 2026-09-18 are quarantined if the swarm secret is not literally `thinx`.
**Avoid:** Use candidates `[secret, "thinx"]` and report `decrypted_with` counts only. The dry-run decrypts in memory (no Transit, no write), so it shows the predicted quarantine count before anything is destroyed. **Gate:** do not run `--migrate` if the dry-run predicts quarantines the operator has not accepted.

### Pitfall 3: Gates go red on the passphrase removal
**What goes wrong:** `tests/openbao-api-wiring.test.sh --source/--live` (`PASSPHRASE_REMOVED`, `API_SECRETS`, `BASELINE_DRIFT`, `SPEC_ATTACHMENTS`, `SPEC_DELTA`) and `openbao-verify.sh --api-service` (`API_SECRET_NOT_MOUNTED GIT_KEY_PASSPHRASE`) fail.
**Avoid:** Flip them in the same thinx-swarm commit, prove `--self-test` (all mutations refused), and re-install the verifier on micro before the service update.

### Pitfall 4: `.PreviousSpec` and spec backups keep the value
**What goes wrong:** `docker service inspect thinx_api` still shows `GIT_KEY_PASSPHRASE=<value>` under `PreviousSpec`, and the 0600 JSON backups hold it.
**Avoid:** Verify `.Spec` and `.PreviousSpec` separately. Clear PreviousSpec with the next roll. Shred the old backups only after the gate has a new baseline (OQ-4).

### Pitfall 5: Integration specs collide on the shared dev server
**What goes wrong:** A rotation spec that sets `min_decryption_version=2` makes `TransitIntegrationSpec.js:129` (`decryptKey("vault:v1:AAAA")` expects `bad_ciphertext`) report the new class instead. That happens if the rotation spec runs first, or leaves the minimum raised for later specs.
**Avoid:**
- Put the rotation spec in its own file that sorts after `TransitIntegrationSpec` (`TransitRotationSpec.js`). jasmine runs files in glob order with `random: false` [VERIFIED: spec/support/jasmine.json].
- Lower `min_decryption_version` back to 1 in `afterAll`.
- Assert versions by regex, never by literal `v1`.
- The spec needs an admin token for rotate/config. The CI throwaway `thinx-ci-bao-root` exists (docker-compose.test.yml:302, AR-40-01 precedent) but is not given to the `api` test service today. Add a dedicated env (e.g. `BAO_DEV_ADMIN_TOKEN`, never `BAO_TOKEN`) to the test compose `api` service and to `scripts/openbao-dev.sh run`. The swarm env guard (`BAO_ADDR`/`BAO_CACERT` only) applies to `thinx.yml`/`docker-swarm.yml`, not to `docker-compose.test.yml` [VERIFIED: wiring gate API_ENV scope].

### Pitfall 6: Revoke during migration resurrects a key
**What goes wrong:** An owner revokes a key while the script holds its content, and the rename recreates the private file without its `.pub` (an orphan the console cannot show).
**Avoid:** Pattern 2 steps 4 and 5.

### Pitfall 7: Script process does not exit / alerts from the script process
**What goes wrong:** Requiring `rsakey.js` and `globals` opens CouchDB/Redis handles, so `node` never returns. A Transit outage during the run posts the D-05 "FAILING" Slack text from the script's process, with the container hostname.
**Avoid:** End with `process.exit(code)` like `purge-orphaned-rsa-keys.js` does. Expect and document the alert. Abort the run on the first service-level reason (`unreachable`, `sealed`, `tls`, `not_configured`, `denied`) with exit code ≠ 0. Leave files untouched in that case; they count as `failed`, not quarantined.

### Pitfall 8: D-03 "console notification" from a separate process
**What goes wrong:** `messenger.sendToOwner()` (messenger.js:390) only reaches WebSockets held **in the API process**. A `docker exec` script has none, so the message silently reaches 0 sockets.
**Avoid:** Use `Audit.log(owner, message, "warning")` (audit.js:60, persistent per owner in `managed_logs`, visible in the console audit log). See OQ-1.

### Pitfall 9: `shred` on ext4 is best-effort
**What goes wrong:** `shred -u` on a journaled ext4 file does not guarantee the old blocks are overwritten, and DO snapshots of micro may already hold the tar.
**Avoid:** Record it as `shred -u` + `sha256` gone + `ls` absent, and state the residual (accepted 2026-10-09). Keep the tar's window short (D-06).

### Pitfall 10: Rotation before the D-13 code is live
**What goes wrong:** If anything below the minimum exists, it fails as `bad_ciphertext` with no alert (IN-05).
**Avoid:** Deploy the removal code (which carries D-13) first, and confirm in-task that `Transit.REASONS` includes the new class before step 2 of the rotation.

## Code Examples

### Dry-run report shape (proposal; text and `--json` like the purge script)
```json
{
  "mode": "dry-run",
  "ssh_keys": "/mnt/data/ssh_keys",
  "private_files": 78,
  "transit": { "v1": 1 },
  "legacy": { "encrypted_pkcs8": 72, "pkcs1": 4, "openssh": 1 },
  "predicted": { "migrate": 77, "quarantine": 0 },
  "decrypted_with": { "candidate_0": 0, "candidate_1": 0, "unencrypted": 5 },
  "unknown": 0, "unreadable": 0, "stray_askfiles": 0,
  "quarantine": [],
  "writes": 0
}
```
`quarantine` entries are `{ "owner": "<64 hex>", "key": "<timestamp>", "cause": "wrong_passphrase|unparseable|unsupported_type" }`. Never a path, PEM, ciphertext or passphrase. The real run adds `migrated`, `already_transit`, `quarantined`, `failed`, `changed_during_run`.

### In-task invocation (operator-visible, read the output names/counts only)
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'C=$(docker ps -q -f label=com.docker.swarm.service.name=thinx_api | head -1); docker exec "$C" node scripts/migrate-deploy-keys.js --dry-run --json'
```
`thinx_api` runs on micro today, but placement floats. Query `docker service ps thinx_api` first and use core's ssh form if needed (runbook §11).

### Host-side D-05 backup (micro, root)
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'set -eu; umask 077; D=/root/thinx-backups; install -d -m 0700 "$D"
  T="$D/deploy-keys-premig-$(date -u +%Y%m%dT%H%M%SZ).tar"; tar -C /mnt/gluster/thinx -cf "$T" ssh_keys; chmod 0600 "$T"
  sha256sum "$T" > "$T.sha256"; chmod 0600 "$T.sha256"; stat -c "%a %U %s %n" "$T"; tar -tf "$T" | wc -l'
```
Expect `600 root`, and an entry count equal to the `ssh_keys` entries + 1 (the directory itself).

### Static retirement gate (proposal, `node --test`)
```javascript
// spec/node/PassphraseRetired.test.js: no GIT_KEY_PASSPHRASE / create_askfile / SSH_ASKPASS_REQUIRE outside spec/
const { execFileSync } = require("child_process");
const out = execFileSync("git", ["grep", "-n", "-I", "-e", "GIT_KEY_PASSPHRASE", "-e", "create_askfile", "-e", "keyPassphrase",
  "--", "lib", "scripts", "Dockerfile", "Dockerfile.test", "docker-compose.yml", "docker-compose.test.yml", "docker-swarm.yml"],
  { encoding: "utf8" }).trim();   // git grep exits 1 on no match: wrap and assert empty
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ssh-keygen -N ""` unencrypted OpenSSH keys | `crypto.generateKeyPair` PKCS#8 with passphrase `''` | 2022-05-17 (`e9816427`) | none on disk (no key from that window survives) |
| passphrase `''` | literal `'thinx'` | 2023-01-14 (`6be92e59`) | 67 of the 72 encrypted keys (filename timestamps 2023-03..2026-03) |
| literal `'thinx'` | `readSecret("GIT_KEY_PASSPHRASE")` | 2026-09-18 (`fa41c8bc`) | ~5 keys (2026-09/10) under the secret value |
| passphrase PKCS#8 on disk | `vault:vN:` Transit ciphertext | 2026-10-19 (Phase 40 cut-over) | 1 key on disk |

**Deprecated after this phase:** `RSAKey.keyPassphrase()`, `Git#sshEnv`, `Git#create_askfile`/`delete_askfile`, the swarm secret, the `.env` line, and the migration script's legacy mode.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ssh-keygen -p -m PKCS8` on OpenSSH 10.3p1 (image) behaves like the laptop OpenSSH tested | Pattern 1 | The one OpenSSH key fails conversion → quarantine or manual handling; caught by the dry-run + spec in the CI image |
| A2 | Node 26.10.0 behaves like 25.1.0 for the PKCS#8/PKCS#1/OpenSSH matrix | Pattern 1 | Low; both OpenSSL 3.x. The CI image (Node 26) runs the spec |
| A3 | GlusterFS `rename(2)` within one directory is atomic for readers | Pattern 2 | A reader could see ENOENT briefly → one failed attempt; rsakey.rename already relies on it |
| A4 | Names `retired_version`, `key_missing`, `legacy_format_unsupported`, and the sentence wording | Patterns 4/5 | Cosmetic; the planner picks the final names |
| A5 | Audit-log entry satisfies D-03 "console notification" | Pitfall 8 / OQ-1 | Owner never sees the notice if the operator meant a live toast |
| A6 | The CI test image built from `Dockerfile.test` is not pushed to any registry | Runtime State | A baked `ENV GIT_KEY_PASSPHRASE` would linger in a registry layer |
| A7 | CircleCI project env and the laptop `.env` may define `GIT_KEY_PASSPHRASE` | Inventory | A copy survives outside the swarm; operator confirms |
| A8 | Swarmpit's next image roll replaces `.PreviousSpec` | Pattern 6 | Value lingers in PreviousSpec until a `--force` update |
| A9 | Live OpenBao policies equal the repo `operator.hcl` / `thinx-api.hcl` | Pattern 7 | Rotate/config denied → operator needs a policy reload; `openbao-exact-image.test.sh --policy-matrix` and the live `FORBIDDEN_DENIED 13/13` make this unlikely |

## Open Questions (RESOLVED)

All six are settled by the plans. Where the answer depends on live data or an operator choice, the plan names the task or checkpoint that records it; no question is left for the executor to decide.

1. **D-03 delivery channel.** — **RESOLVED** (Plan 41-01 Task 2, Plan 41-02 "Assumptions and open questions resolved here" and the Task 2 checkpoint): the channel is `Audit.log(owner, fixed sentence, "warning")`, the only persistent per-owner path a docker exec'd script can write. The sentence names the key's creation date only. The operator accepts it (or names another channel, which stops the plan until it is built) in the 41-02 Task 2 checkpoint, and 41-02 Task 3 runs only on "accepted".
   - What we know: `sendToOwner` is in-process only. `Audit.log` is persistent per owner and writable from the script.
   - Unclear: whether the operator means an audit-log line or something more prominent (email via Mailgun, a console banner).
   - Recommendation: Audit.log with flag `warning` and a fixed sentence ("A deploy key created <date> could not be migrated and was removed. Create a new deploy key and add it to your repository."). Confirm in the plan's checkpoint. With today's inventory the expected quarantine count is 0, so this is likely moot.
2. **D-08 step 2 ordering vs repo-first.** — **RESOLVED** (Plan 41-05 "Decisions recorded here" and the Task 3 checkpoint; executed in Plan 41-06 Task 1): repo-first. The thinx-swarm commit is made in 41-05 and pushed and fast-forwarded on micro in 41-06 right before the service update, then `secret rm`, then the `.env` line. D-08's code-first rule holds because the Transit-only code is deployed first (41-05 Task 1). The operator confirms the order in the 41-05 Task 3 checkpoint.
   - CONTEXT lists "service update → secret rm → remove from thinx.yml/docker-swarm.yml". The carried-forward edge rule says repo-first.
   - Recommendation: commit and ff-merge thinx-swarm first, with the thinx.yml removal and the flipped gates, then the live update, then `secret rm`, then the `.env` line. During that window nothing deploys the stack, so the order is safe either way. Repo-first keeps the wiring gate meaningful.
3. **Scope of "gone from the code".** — **RESOLVED** (Plan 41-04 must_haves and Task 3, `spec/jasmine/PassphraseRetiredSpec.js`; extended to `docker-swarm.yml` in Plan 41-05): zero occurrences of the passphrase variable and the askpass helpers in `lib/` and `scripts/` .js files, the Dockerfiles, the root compose files and `docker-swarm.yml`, enforced in every CI jasmine run. Negative assertions under `spec/` and history under `.planning/` stay allowed.
   - Should defensive `delete env.GIT_KEY_PASSPHRASE` lines and negative assertions in specs survive?
   - Recommendation: zero occurrences under `lib/`, `scripts/`, the Dockerfiles, the compose files and `docker-swarm.yml` (static gate). Negative env assertions stay in `spec/` only.
4. **The 0600 spec backups on micro hold the passphrase value.** — **RESOLVED** (Plan 41-08 Task 2 checkpoint, applied in Task 3): the operator chooses between `shred-all` (every passphrase-bearing spec backup is shredded, and the wiring gate's baseline is sanitized in place with jq instead of re-baselined, so `--live` keeps a Phase 39 baseline) and `shred-tar` (spec backups kept as a recorded residual). Both options shred the D-05 tar, its sha256 and the canary, so D-06 is delivered either way; there is no option that skips it. The answer and the shred record go into the runbook evidence and 41-08-SUMMARY.md for the phase verification.
   - Options: re-baseline the wiring gate to a post-removal backup and shred the older two with the D-05 tar, or keep them (root-only, node-local, same class as the D-05 tar).
   - Recommendation: re-baseline, then shred, and record it in VERIFICATION.
5. **Does the swarm secret equal `thinx`?** — **RESOLVED** (Plan 41-02 "Assumptions and open questions resolved here"; observed in the 41-02 Task 1 dry-run): never read. The script tries the candidates in order, and the dry-run's `decrypted_with` counts, recorded in the 41-02 Task 1 evidence and shown to the operator at the Task 2 checkpoint, show only which candidate label opened each key.
   - It cannot be checked without reading the value. The candidate list makes it irrelevant, and the dry-run's `decrypted_with` counts reveal only which candidate worked.
6. **The single OpenSSH key's owner status.** — **RESOLVED** (Plan 41-02 "Assumptions and open questions resolved here" and Task 1; covered by Plan 41-01 spec case B2): 41-02 Task 1 records whether its owner is among the purge scan's orphans, and the operator sees it at the Task 2 checkpoint. The `ssh-keygen` conversion stays in the tool either way and is spec-covered.
   - Is it an orphan? The D-01 purge dry-run answers this. If it is purged, the `ssh-keygen` path is still worth keeping for restored backups before removal, and covered by a spec.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node in `thinx_api` | migration/rewrap script | ✓ | v26.10.0 | — |
| `ssh-keygen` in `thinx_api` | OpenSSH conversion | ✓ | OpenSSH_10.3p1 | quarantine (D-02) if conversion fails |
| `/dev/shm` tmpfs in `thinx_api` | OpenSSH conversion copy | ✓ | 64 MiB, noexec | — |
| `shred` on micro host / in container | D-06 | ✓ (container); host [ASSUMED coreutils] | — | `rm` + documented residual |
| OpenBao 2.7.1 (prod) + operator userpass | rotate / raise min | ✓ (Phase 39) | 2.7.1 | break-glass §7 if no operator login |
| OpenBao 2.7.1 dev server (CI + laptop `scripts/openbao-dev.sh`) | integration specs | ✓ | 2.7.1 | — |
| Docker (laptop) | dev server | ✓ | 29.8.2 | — |
| `jq` / `yq` (laptop) | wiring gate | ✓ | jq 1.7.1, yq v4.45.1 | — |
| `gh` (laptop) | CI checks | ✓ | 2.67.0 | CircleCI MCP |
| `/root` local disk on micro | D-05 tar | ✓ | ext4, 16 G free | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

(`workflow.nyquist_validation` is `false` in `.planning/config.json`. The section is included at the orchestrator's explicit request.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jasmine 5 (`spec/support/jasmine.json`, `random: false`, `timeout: 10000`) + `node --test` (spec/node) |
| Config file | `spec/support/jasmine.json` |
| Quick run command | `npx jasmine spec/jasmine/TransitSpec.js spec/jasmine/MigrateDeployKeysSpec.js spec/jasmine/KeyFormatSpec.js spec/jasmine/GitSpec.js` [ASSUMED invocation form; Phase 40 ran these per file] |
| Integration | `scripts/openbao-dev.sh run -- npx jasmine spec/jasmine/TransitIntegrationSpec.js spec/jasmine/TransitRotationSpec.js` |
| Node tests | `node --test spec/node/DeployKeyNames.test.js spec/node/PassphraseRetired.test.js` |
| Full suite | CircleCI `test` job (docker compose, OpenBao dev server, ~1958 specs); push to `thinx-unit` for non-deploying CI, `thinx-staging` deploys |
| thinx-swarm | `tests/openbao-api-wiring.test.sh --source thinx.yml <parent>/docker-swarm.yml`, `--self-test`, `--live` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KEYMIG-01 | dry-run counts per kind, writes nothing (dir snapshot identical, 0 Transit encrypt) | unit | `npx jasmine spec/jasmine/MigrateDeployKeysSpec.js` | ❌ Wave 0 |
| KEYMIG-01 | enc PKCS#8 (right/wrong pass), PKCS#1, OpenSSH → `vault:v` file 0600, same name; decrypts to PKCS#8 whose public key equals the `.pub` | unit | same | ❌ Wave 0 |
| KEYMIG-01 | second run: 0 migrated, 0 failed; quarantine removes the pair, writes an audit record, carries on | unit | same | ❌ Wave 0 |
| KEYMIG-01 | Transit down → exit ≠ 0, files untouched, `failed` counted | unit | same | ❌ Wave 0 |
| KEYMIG-01 | revoked mid-run → no resurrection | unit | same | ❌ Wave 0 |
| KEYMIG-01 | no PEM/ciphertext/passphrase in stdout/stderr (text and JSON) | unit (sweep) | `npx jasmine spec/jasmine/SecretsSweepSpec.js` | ✅ (extend) |
| KEYMIG-01 | live: dry-run → run → re-run reports; tar 0600 + sha256 on `/root` | manual / ops | ssh commands above | n/a |
| KEYMIG-02 | legacy file → skipped `legacy_format_unsupported`, never deleted, no Slack, no askpass dir | unit | `npx jasmine spec/jasmine/GitSpec.js spec/jasmine/KeyFormatSpec.js` | ✅ (rewrite) |
| KEYMIG-02 | no `GIT_KEY_PASSPHRASE` / askpass in lib/scripts/Dockerfiles/compose/docker-swarm.yml | static | `node --test spec/node/PassphraseRetired.test.js` | ❌ Wave 0 |
| KEYMIG-02 | thinx.yml / docker-swarm.yml contract: passphrase absent; mutations re-adding it refused | static (thinx-swarm) | `tests/openbao-api-wiring.test.sh --source … && --self-test` | ✅ (flip) |
| KEYMIG-02 | live spec (Spec + PreviousSpec), `docker secret ls`, `.env` count 0, `*.sh` 0, keyed build green | manual / ops | `--live` gate + ssh greps | ✅ (flip) |
| KEYMIG-03 | `rewrapKey` returns `{ciphertext, version}`; 400 too-old → new class; `bad_ciphertext` unchanged; alert latch | unit (mock-openbao) | `npx jasmine spec/jasmine/TransitSpec.js` | ✅ (extend) |
| KEYMIG-03 | rotate → rewrap all to latest → re-run 0 → raise min → old canary refused with the new class → lower min in afterAll | integration (dev server) | `scripts/openbao-dev.sh run -- npx jasmine spec/jasmine/TransitRotationSpec.js` | ❌ Wave 0 |
| KEYMIG-03 | live: key read `latest_version` = `min_decryption_version` = N; every file `vault:vN:`; canary refused; keyed build green | manual / ops | operator bao read + script `--report` | n/a |

### Sampling Rate
- **Per task commit:** the quick-run command for the touched module + `node --test` static gate.
- **Per wave merge:** integration specs through `scripts/openbao-dev.sh run`, the thinx-swarm `--source`/`--self-test` gate.
- **Phase gate:** CircleCI `test` green on the deploying SHA; live gates (`--live`, `openbao-verify.sh --full --maintenance --api-service thinx_api`, edge router hash unchanged, :7442/1883/8883 open) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `spec/jasmine/MigrateDeployKeysSpec.js`: synthetic keys generated at test time (never committed), tmp `ssh_keys` dirs, FakeTransit.
- [ ] `spec/fixtures/fake-transit.js`: `rewrapKey`, version counter, `rotate()`, `minDecryption` producing the new class.
- [ ] `spec/fixtures/mock-openbao.js`: rewrap route; scriptable 400 `{errors:["ciphertext or signature version is disallowed by policy (too old)"]}` and `{errors:["encryption key not found"]}`.
- [ ] `spec/jasmine/TransitRotationSpec.js` + dev admin token env in `docker-compose.test.yml` (api service) and `scripts/openbao-dev.sh run`.
- [ ] `spec/node/PassphraseRetired.test.js` (static gate; add to `package.json` `test:node`).
- [ ] thinx-swarm: flipped wiring-gate checks and mutations; `openbao-verify.sh` absence check.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no user auth change) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | AppRole policy unchanged (encrypt/decrypt/rewrap only); operator userpass for rotate/config; ssh + docker exec plane only |
| V5 Input Validation | yes | key files are untrusted input: `keyformat.readKey` bounds (64 KiB, regular file, O_NONBLOCK), strict filename regex, exact-match error recognition |
| V6 Cryptography | yes | OpenBao Transit aes256-gcm96, non-exportable; Node/OpenSSL for PKCS#8 decrypt only; no custom crypto; key rotation + `min_decryption_version` (ASVS 6.4.2 key rotation) |
| V7 Error Handling & Logging | yes | fixed reason classes; never log PEM, ciphertext, passphrase, token or OpenBao error text (SecretsSweepSpec) |
| V8 Data Protection | yes | plaintext keys only in process memory + `/dev/shm`, buffers zeroed; backup root-only off Gluster; shred after verification |
| V14 Configuration | yes | secret removed from spec, swarm, `.env`, compose, Dockerfiles; gates assert absence |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Plaintext key leaks via temp file or log during migration | Information Disclosure | in-memory conversion; `/dev/shm` for the OpenSSH copy, unlinked in `finally`; output sweep spec |
| Old ciphertext from backups decrypted after compromise of the AppRole | Information Disclosure | rotate + rewrap + raise `min_decryption_version` (KEYMIG-03) |
| Passphrase remains readable (env, `.env`, PreviousSpec, backups) | Information Disclosure | full inventory + absence gates; shred backups (OQ-4) |
| Partial or racing rewrite corrupts or resurrects keys | Tampering / DoS | `wx` temp + fsync + hash re-check + rename + post-check |
| Silent fleet-wide decrypt failure after rotation | Denial of Service | D-13 class with alerting before rotation; keyed build gate; reversible min |
| Unconvertible key silently destroyed | Repudiation / DoS | quarantine report by owner + key id, audit record, D-05 tar until verified |
| Ciphertext swap across owners | Tampering | accepted (AR-40-02) — out of scope |

## Sources

### Primary (HIGH confidence)
- Repository source read this session: `lib/thinx/transit.js` (full), `lib/thinx/keyformat.js` (full), `lib/thinx/rsakey.js` (full), `lib/thinx/git.js:280-868`, `lib/thinx/secrets.js`, `scripts/purge-orphaned-rsa-keys.js`, `lib/thinx/messenger.js:340-420`, `lib/thinx/audit.js:20-110`, `Dockerfile:60-63`, `Dockerfile.test:126-128`, `docker-compose.yml:173-174`, `docker-compose.test.yml:126-127, 285-370`, `docker-swarm.yml:100-109, 320-364`, `scripts/openbao-dev.sh`, `.circleci/config.yml` (test job).
- thinx-swarm: `thinx.yml` (secrets, api, worker), `openbao/policies/{thinx-api,operator,backup}.hcl`, `tests/openbao-api-wiring.test.sh`, `scripts/openbao-verify.sh:33-42, 350-360`, `scripts/openbao-install.sh` header, `restart.sh:1-80`, `openbao/*.cron`.
- OpenBao v2.7.1 source fetched with `gh api` (ref `v2.7.1`): `sdk/helper/keysutil/policy.go` (ErrTooOld line 87, Decrypt checks 1125-1131), `internal/builtin/logical/transit/path_rewrap.go` (138-191), `path_decrypt.go` (164, 217), `path_keys_config.go` (126-176), `path_keys.go` (404-407), `path_rotate.go`; docs `website/content/docs/api/secret/transit.mdx` (rotate, config, rewrap, encrypt, trim).
- Read-only production probes over ssh (2026-10-20): placement, secret names, spec key names, `.env` line count, `ssh_keys` inventory and header histogram, container tooling, `/root` filesystem, backup-job reference count.
- Local synthetic-key probes (Node 25.1.0, laptop OpenSSH): format matrix, empty-passphrase behaviour, `ssh-keygen -p -m PKCS8` conversion with equal public keys.

### Secondary (MEDIUM confidence)
- Planning artifacts: 41-CONTEXT, REQUIREMENTS, ROADMAP, STATE, 40-SECURITY (IN-05, IN-10, T-40-12), 40-REVIEW, 40-UAT (live build candidates), runbook `openbao.md` §1, §6, §10, §11, evidence log.
- git history of `lib/thinx/rsakey.js` (`e9816427`, `6be92e59`, `fa41c8bc`) for passphrase eras.

### Tertiary (LOW confidence)
- None used for a decision.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new dependency; tooling verified in the live container.
- Architecture: HIGH for Transit semantics (source-verified at the deployed tag) and code paths. MEDIUM for the operator ordering (OQ-2, OQ-4).
- Pitfalls: HIGH. Most come from verified live state (OpenSSH key, `.env`, PreviousSpec, gates) or verified code.

**Live build candidates for D-10 / D-14** (from 40-UAT, [CITED: 40-UAT.md tests 2 and 3]):
- Owner `test` (cedc16bb) on `suculent/thinx-autoflood`, device Flood 04ed1650. Its only working key was the legacy `ENCRYPTED PRIVATE KEY` 1789766455048, so after migration it proves a *migrated* key (D-10).
- grammatyk's Transit key on `suculent/thinx-rce-canary-transit` (source rce-canary-transit / rce-canary-dev) proves a *rewrapped* key after the rotation (D-14). Its platformio build itself ends FAILED for an unrelated `hostname` reason. The fetch line is the evidence.

**Research date:** 2026-10-20
**Valid until:** 2026-11-03 for the live inventory (the key count changes as owners create or revoke keys; re-run the dry-run). 30 days for code and OpenBao 2.7.1 semantics.
