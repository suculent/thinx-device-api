---
phase: 41-key-migration-passphrase-retirement-rotation
plan: 06
subsystem: deploy-keys
status: complete
tags: [openbao, transit, deploy-keys, passphrase-retirement, swarm, rotation, repo-first, canary]

requires:
  - phase: 41-key-migration-passphrase-retirement-rotation
    provides: "41-05 Transit-only code live (D-13), thinx-swarm 48581e9 authored, Decision 41-05 Task 3: go"
provides:
  - "Live swarm without GIT_KEY_PASSPHRASE: no secret mount or env in thinx_api .Spec or .PreviousSpec, no swarm secret, no Gluster .env* line, no askpass file (KEYMIG-02, ROADMAP criterion 2)"
  - "thinx-swarm 48581e9 on laptop, origin and micro; installed openbao-verify.sh with API_PASSPHRASE_ABSENT"
  - "Pre-rotation canary /root/thinx-backups/transit-canary-20261020T184027Z.ct (v1, 0600 root, micro) and snapshot openbao-20261020T184042Z-pre-change"
  - "thinx-deploy-keys rotated once: latest_version 2, min_decryption_version 1 (KEYMIG-03 started)"
  - "Runbook section 6 operator-login recipe that works on the read-only OpenBao container filesystem"
affects: [41-07, 41-08, openbao runbook section 6, thinx-swarm wiring gate --live]

actuals:
  tokens: 3000
  tasks: 3
  commits: 4
plan_head_before: f3277fca87c11424ce6966706003908599475296
plan_head_after: c1d5ee467d1540ac5be9aa73d4fceba9a3aca104

tech-stack:
  added: []
  patterns:
    - "Live secret retirement: one targeted --secret-rm/--env-rm update from a 0600 spec backup, gates green, then docker secret rm, then one --force update to roll .PreviousSpec"
    - "Operator OpenBao login in the container: silent stty read piped to auth/userpass/login/operator password=-, token held only in a shell variable"

key-files:
  created:
    - .planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-06-SUMMARY.md
  modified:
    - .planning/runbooks/openbao.md

key-decisions:
  - "Precondition stop on six untracked pre-v3-labels .bak files in micro's checkout; operator answer: operator moved them (count 0 afterwards)"
  - "Sweep stop on two /mnt/gluster/thinx/.env.bak* files still carrying the passphrase line; the operator deleted both, and the re-sweep showed 0 in all 5 remaining files"
  - "Plan human-check (laptop .env, CircleCI project env var): not present (operator) for both"
  - "Operator rotation recorded: rotated latest_version=2 min_decryption_version=1; no other key setting changed"
  - "bao login is not used in the OpenBao container (read-only FS prints the token); runbook section 6 now carries the stdin userpass recipe for 41-07 Task 2"

requirements-completed: [KEYMIG-02]

duration: "Task 1 18:17-18:24Z and 18:38-18:40Z; Task 2 18:40-18:41Z; Task 3 (operator) before 18:48Z; confirmation 18:48Z"
completed: 2026-10-20
---

# Phase 41 Plan 06: Live passphrase retirement and Transit key rotation Summary

**GIT_KEY_PASSPHRASE is gone from the live swarm. The thinx_api Spec and PreviousSpec, the swarm secret store, the Gluster `.env*` files and ssh_keys all show 0. The operator rotated thinx-deploy-keys once, to latest_version 2, with a v1 canary and a pre-change snapshot stored first.**

Plan 41-05 decision reference: `Decision 41-05 Task 3: go` (41-05-SUMMARY.md).

## Operator resume signal (Task 3), verbatim

rotated latest_version=2 min_decryption_version=1

L0 = 1.

## Tasks

| Task | Name | Commit(s) | Result |
|------|------|-----------|--------|
| 1 | Live retirement: repo-first, one update, secret rm, `.env`, PreviousSpec (tracer) | parent 395f773a, 05476a72; thinx-swarm 48581e9 pushed | all gates green after both restarts |
| 2 | Rotation preconditions | parent a0f93e0c | REMOVAL_LIVE ok, L0 = 1, canary ok v1, snapshot ok |
| 3 | Operator rotates thinx-deploy-keys (checkpoint:human-action, blocking-human) | parent c1d5ee46 (evidence) | rotated to 2; AppRole encrypt at v2 |

### Task 1 (runbook: "2026-10-20 Plan 41-06 Task 1: passphrase retired from the live swarm")

- Precondition: the first run stopped on six untracked `*.yml.bak.20261007222957.pre-v3-labels` files on micro (count 6). The operator moved them, and the re-run at 18:17:58Z gave 0.
- thinx-swarm `8cfa7dd..48581e9`:
  - pushed to origin at 18:18:27Z; CircleCI error/downtime page jobs succeeded at 18:20:20Z; Swarmpit redeployed both by 18:20:58Z;
  - `p41-ff` pushed into micro, ff-merged, branch deleted;
  - laptop = origin = micro = `48581e99fda875dcf46ddddfd655701a9faf6475`.
  `openbao-install.sh` gave `OPENBAO-INSTALL-OK`, with only openbao-verify.sh updated, and `cmp` shows it equal to the checkout copy.
- Spec backup: `thinx-api-pre-passphrase-rm-20261020T182137Z.json`, 600 root, in the 700 root `rollback/api-service`.
- Update (`--secret-rm` and `--env-rm`), 18:21:41-18:22:02Z: the task changed from `b0el7hlnn988mpg3y3njk1qrh` to `tkl1vzagwlv0j3dkumkn66eld`. Checks:
  - probe ok;
  - `--live` API-WIRING-OK (PREVIOUS_SPEC info);
  - verifier `--full` and `--api-service` OK, with `API_PASSPHRASE_ABSENT ok`;
  - `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0`;
  - ports open; routers 29 with hash `fa0afd608550e585`.
- `docker secret rm` at 18:23:29Z. `.env` count went from 1 to 0, still 600 root:root.
- Sweep stop: `.env.bak.20260619154540.cors` and `.env.bak.20260929142800` had count 1 each. The operator deleted both. The re-sweep at 18:38:22Z found 5 files, all 0.
- Askpass: `*.sh` count 0, nothing deleted.
- Forced update, 18:38:27-18:38:47Z: task `74bunku80wzuf5q63cfxuderj`. Checks:
  - probe ok;
  - `--live` API-WIRING-OK with `WIRING PREVIOUS_SPEC ok` and `SPEC_ATTACHMENTS ok`;
  - the plan's remote verify block passes, Spec + PreviousSpec 0;
  - `--full` OK;
  - ports 7442, 1883 and 8883 open; routers unchanged.
- Human-check: the laptop `.env` and the CircleCI project env var are both not present (operator).

### Task 2 (runbook: "2026-10-20 Plan 41-06 Task 2: rotation preconditions")

- `REMOVAL_LIVE retired_version=true key_missing=true sshEnv=undefined keyPassphrase=undefined`.
- `--report`: 77 private files, transit `{"v1":77}`, legacy 0, unknown 0, so L0 = 1.
- Canary `transit-canary-20261020T184027Z.ct`: 600 root, 1 line, `vault:v`, v1. Check: `CANARY result=ok version=v1`.
- `OPENBAO-BACKUP-OK mode=pre-change stem=openbao-20261020T184042Z-pre-change`, replicated to core.

### Task 3 (runbook: "2026-10-20 Plan 41-06 Task 3: operator rotation")

- Before the rotate: latest 1, min_decryption 1. One `rotate`. After: versions 1 and 2, latest 2, min_decryption 1, min_encryption 0.
- Unchanged: exportable false, allow_plaintext_backup false, deletion_allowed false, auto_rotate_period 0s.
- The token that did the rotate was revoked.
- AppRole confirmation at 18:48:33Z: a fresh `--canary-capture` encrypts at `v2` (version only). The stored canary gives `CANARY result=ok version=v1`. `--report` still shows 77 at v1.

## Deviations from Plan

- **Precondition halt (blocking-human):** six untracked `.bak` files in micro's checkout made `git status --porcelain` print 6. Nothing was changed. The operator moved them, and the re-run gave 0.
- **Sweep halt (plan rule):** two `/mnt/gluster/thinx/.env.bak*` files still carried the passphrase line. This was found after `docker secret rm` and the `.env` edit, which the plan orders before the sweep. The operator deleted both. Steps 9 and 10 ran after the re-sweep showed all zeros. PreviousSpec held the value from 18:23Z to 18:38Z, root-only.
- **Operator login method (Task 3):** the OpenBao container filesystem is read-only, so `bao login` could not store `~/.vault-token` and printed the first operator token to the operator's own terminal. A second attempt, `export BAO_TOKEN=$(bao login -no-store ... -field=token)`, captured a corrupted value (TTY `\r` and/or the prompt) and got 403. The working method was a `stty -echo` password read, then `printf '%s' "$P" | bao write -field=token auth/userpass/login/operator password=-`. Only the final token is confirmed revoked. Up to two earlier operator tokens may stay valid until their 4 h TTL expires (issued between 18:40:47Z and 18:48Z, so gone by 22:48Z at the latest); the operator knows. No token value is recorded anywhere. Runbook section 6 (and the emergency step that refers to it) now carries the working recipe, for 41-07 Task 2.
- **Runbook section 10** now says the passphrase was removed on 2026-10-20 in place of "stays mounted" (plan step 11).

## Requirements

- KEYMIG-02 is complete live: the code (41-04/41-05), thinx.yml and docker-swarm.yml (41-05), the live spec, the swarm secret, the `.env` line and the askpass purge (this plan).
- KEYMIG-03 is started: the key is rotated. The rewrap and the `min_decryption_version` raise are Plan 41-07.

## Push state

- The parent commits 395f773a, 05476a72, a0f93e0c, c1d5ee46 and this docs commit are local on thinx-staging. Nothing was pushed: the plan has no push step, so there is no main push and no tag.
- thinx-swarm `48581e9` is pushed to origin master (the plan's repo-first step).

## Artifacts kept until Plan 41-08

- `/var/lib/openbao-maintenance/rollback/api-service/thinx-api-pre-passphrase-rm-20261020T182137Z.json` (holds the passphrase value; 0600 root).
- `/root/thinx-backups/transit-canary-20261020T184027Z.ct` (v1, 0600 root).

## Known Stubs

None.

## Next

Plan 41-07: rewrap every key to v2, take a post-rewrap snapshot, raise `min_decryption_version` to 2 with the operator's section 6 login, and prove the v1 canary is refused as `retired_version`. It reads `rotated latest_version=2` above.

## Self-Check: PASSED

- FOUND: 41-06-SUMMARY.md, .planning/runbooks/openbao.md (Plan 41-06 entries)
- FOUND commits: 395f773a, 05476a72, a0f93e0c, c1d5ee46 (parent HEAD ancestry); 48581e9 (thinx-swarm origin/master)
