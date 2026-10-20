---
phase: 41-key-migration-passphrase-retirement-rotation
plan: 08
subsystem: deploy-keys
status: complete
tags: [openbao, transit, deploy-keys, passphrase-retirement, shred, d-06, final-gate, runbook]

requires:
  - phase: 41-key-migration-passphrase-retirement-rotation
    provides: "41-05 retirement commits (docker-swarm.yml, PassphraseRetiredSpec); 41-06 live retirement; 41-07 D14_GATE pass, 77/77 at v2, v1 canary refused"
provides:
  - "thinx-staging = 8bc53a75 with the complete Phase 41 parent tree, CI green (thinx-unit test #16167; thinx-staging test #16170, api-registry #16171)"
  - "Phase 41 verified live in one gate on task tj430niq4fnlvnchu3ljga2ml (image 64ff48ed8543b1a7)"
  - "D-06 closed: D-05 tar, its sha256 and the v1 canary shredded, /root/thinx-backups removed"
  - "Open Question 4 closed (shred-all): four spec backups shredded, the --live baseline sanitized in place, 0 passphrase-bearing files under /var/lib/openbao-maintenance on micro and core"
affects: [phase 41 verification, KEYMIG-04 retest, openbao runbook evidence]

actuals:
  tokens: 3200
  tasks: 3
  commits: 2
plan_head_before: 8bc53a751d0028971ae8cbde31a07fc5fc245bc3
plan_head_after: ab538d416e4fad33d1d2873d9c2853263c5d3f6a

tech-stack:
  added: []
  patterns:
    - "Sanitize a rollback baseline in place: umask 077, mktemp in the same dir, jq deletes only the retired entries, touch -r, chmod 0600, mv -f, EXIT trap shreds a leftover temp, then re-run the gate that reads it"
    - "Inventory before destruction: grep -rlI by name, print path/mode/size/mtime/count only, mark the gate baseline"

key-files:
  created:
    - .planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-08-SUMMARY.md
  modified:
    - .planning/runbooks/openbao.md

key-decisions:
  - "Operator Task 2 answer, verbatim: shread-all (typo for shred-all): spec backups shredded, gate baseline sanitized in place"
  - "The two out-of-scope /root/thinx-swarm-backup-untracked/.env.bak* copies were not touched by the executor; the operator removed the whole directory with rm -rf"
  - "41-06 record corrected: the Gluster .env.bak* files had been moved to /root on micro, not deleted"
  - "No push of the 41-08 docs commits: the plan sends them with the next deliberate thinx-staging push"

requirements-completed: [KEYMIG-01, KEYMIG-02, KEYMIG-03]

duration: "Task 1 19:45-20:01Z; Task 2 (operator) 20:01-20:05Z; Task 3 20:06-20:08Z"
completed: 2026-10-20
---

# Phase 41 Plan 08: Final push, Phase 41 live gate and the D-06 shred Summary

**The Phase 41 parent tree is on thinx-staging, and CI is green for the same SHA on thinx-unit and on thinx-staging. The whole phase passed one live gate on the rolled task. The pre-migration tar, its sha256 and the v1 canary are shredded. On the operator's shred-all, the four other passphrase-bearing spec backups are shredded too, and the `--live` baseline is sanitized in place. `--live` still passes against it.**

## Operator answer (Task 2), verbatim

shread-all

Read as option `shred-all` (typo). The runbook line is `D-06 option: shred-all`.

Separately, the operator removed the out-of-scope directory, verbatim: `removed -rf /root/thinx-swarm-backup-untracked/`

## Tasks

| Task | Name | Commit | Result |
|------|------|--------|--------|
| 1 | Final push through CI, Phase 41 live gate, inventory (tracer) | cc8be5c7 | all gate items pass; inventory by name |
| 2 | Operator decision on shred scope (checkpoint:decision, blocking-human) | (this summary) | shred-all |
| 3 | Shred, sanitize, record (D-06) | ab538d41 | 7 files shredded, baseline sanitized, `--live` ok |

### Task 1 (runbook: "2026-10-20 Plan 41-08 Task 1: Phase 41 final live gate")

- Local regression green:
  - Jasmine: PassphraseRetiredSpec 4/0, MigrateDeployKeysSpec 17/0, TransitSpec 39/0, KeyFormatSpec 30/0, GitSpec 73/0, SecretsSweepSpec 42/0, BuilderRemoteJobSpec 77/0, BuilderApiKeySpec 54/0, RedisHealthSpec 4/0, RsakeySpec 17/0.
  - `node --test`: 76/76.
  - openbao-dev integration: 29/0.
  - Wiring gate: `--source` gives PASSPHRASE_ABSENT ok for both files; `--self-test` 18/18.
- Push: `thinx-unit` `8fd573aa..8bc53a75`, then `thinx-staging` `8fd573aa..8bc53a75`, each in its own command, neither forced. No main push, no tag.
- CI:
  - thinx-unit: `test` #16167 success.
  - thinx-staging: `test` #16170 and `api-registry` #16171 success, and the console jobs passed. `vue-console-registry` #16169 was still pending at 20:00Z (no console source in this range).
- Rollout: task `tj430niq4fnlvnchu3ljga2ml` on micro, started 19:58:14Z, image `64ff48ed8543b1a7`, 0 restarts. No recovery rung was needed.
- Gate:
  - API log: probe ok 1, probe failed 0.
  - `REMOVAL_LIVE retired_version=true key_missing=true sshEnv=undefined keyPassphrase=undefined`.
  - `--report`: 77 private files, `{"v2":77}`, legacy 0, unknown 0.
  - `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0`.
  - `CANARY result=retired_version version=v1`.
  - `--live` API-WIRING-OK, with PREVIOUS_SPEC ok and SPEC_DELTA ok.
  - openbao-verify `--full` OK and `--api-service` OK, with API_PASSPHRASE_ABSENT ok; rehearsal matrix g1,g2 OK.
  - Absence: swarm secret 0, `.env` 0 (600 root:root), `*.sh` 0, Spec + PreviousSpec 0.
  - Ports 7442, 1883 and 8883 open; routers 29, `fa0afd608550e585`, byte-identical to the pre-state.
- Inventory: 3 files in `/root/thinx-backups`, 5 spec backups on micro (baseline marked), 0 on core, plus two out-of-scope `.env.bak*` copies on micro's `/root` holding the literal value.

## D-06 shred record (runbook: "2026-10-20 Plan 41-08 Task 3: D-06 shred record")

- D-06 option: shred-all
- Tool: `shred -u` throughout (`/usr/bin/shred` present). No `rm` fallback was needed.
- Shredded on micro, 20:06:13-20:06:14Z, in `/root/thinx-backups`:
  - `deploy-keys-premig-20261020T123359Z.tar`;
  - `deploy-keys-premig-20261020T123359Z.tar.sha256`;
  - `transit-canary-20261020T184027Z.ct`.
  After that the directory had 0 entries, and `rmdir` removed it.
- Shredded on micro, 20:06:19Z, in `/var/lib/openbao-maintenance/rollback`:
  - `api-service/thinx-api-pre-keygen-20261019T133316Z.json`;
  - `api-service/thinx-api-pre-passphrase-rm-20261020T182137Z.json`;
  - `api-trust/thinx_api-20261018T194057Z-1765792.json`;
  - `api-trust/thinx_api-20261018T194128Z-1765792.json`.
- Sanitized in place, 20:06:30Z: `api-service/thinx-api-pre-openbao-20261018T193726Z.json`, the `--live` gate baseline.
  - jq removed 1 secret entry and 1 env entry from Spec and from PreviousSpec. Each spec went from 11 secrets / 27 env to 10 / 26.
  - Result: 0 passphrase lines, `600 root:root`, original mtime kept, written atomically through `mv -f`, 0 leftover temp files.
- Removed by the operator with `rm -rf`, not shredded and not touched by the executor: `/root/thinx-swarm-backup-untracked/` on micro. It held:
  - `.env.bak.20260619154540.cors` and `.env.bak.20260929142800`, both 600 root:root with the literal value; 41-06 had moved them off Gluster;
  - the six `*.yml.bak.20261007222957.pre-v3-labels` files.
  A read-only check confirmed the directory is absent. A rescan of `/root` found only `thinx.yml.bak-20260925`, which holds a variable reference and no value.
- Post-checks:
  - `/root/thinx-backups` absent.
  - Inventory grep: 0 files on micro, 0 on core.
  - `--live` (20:07:24Z and again 20:08:08Z): API-WIRING-OK, with SPEC_DELTA ok against the sanitized baseline.
  - All three plan Task 3 verifies pass.
- Residual (accepted 2026-10-09, KEYMIG-04 retest deferred):
  - shred on journaled ext4 is best-effort. The operator's `rm -rf` did not overwrite at all.
  - DigitalOcean snapshots and the pre-migration Gluster backups may hold copies.

## Deviations from Plan

- **[Rule 2 - Correctness] Inventory widened (read-only).** Besides the plan's scope, I ran a read-only name scan over micro's `/root`. It found two `.env.bak*` copies holding the literal value. The 41-06 record had called them deleted, but they had been moved off Gluster. I did not touch them, and I raised them at the checkpoint. The operator removed the directory with `rm -rf`. The 41-06 runbook entry now carries a correction.
- **Baseline size changed** from 29058 B to 20786 B. jq rewrites the file with 2-space indentation, where docker inspect wrote 4. This is not a content change beyond the deleted entries: the counts confirm it, and SPEC_DELTA passes.

## Requirements

- KEYMIG-01: the D-06 condition is met. The pre-migration copy was kept off Gluster until the phase was verified live, then destroyed. Zero legacy keys remain.
- KEYMIG-02 and KEYMIG-03: re-verified live on the final state.
- ROADMAP Phase 41 criteria 1-3 hold together on this state.

## Push state

- `thinx-staging` and `thinx-unit` are at `8bc53a75`, pushed in this plan.
- cc8be5c7, ab538d41 and the final docs commit are local. The plan sends them with the next deliberate thinx-staging push.
- No main push, no tag, no v1.18 release.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema was added. The only live changes were the CI deploy, the shreds and the in-place sanitize.

## Self-Check: PASSED

- FOUND: .planning/runbooks/openbao.md (Plan 41-08 Task 1 and Task 3 entries, `D-06 option: shred-all`)
- FOUND commits: cc8be5c7, ab538d41 (ancestors of HEAD); 8bc53a75 on origin thinx-staging and thinx-unit
- Live checks: /root/thinx-backups absent; baseline 600 root; inventory grep 0 on micro and core; `--live` exit 0
