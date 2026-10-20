---
phase: 41-key-migration-passphrase-retirement-rotation
plan: 07
subsystem: deploy-keys
status: complete
tags: [openbao, transit, deploy-keys, rotation, rewrap, min-decryption-version, canary, runbook]

requires:
  - phase: 41-key-migration-passphrase-retirement-rotation
    provides: "41-06: thinx-deploy-keys rotated to latest_version 2 (L0 = 1), v1 canary transit-canary-20261020T184027Z.ct, pre-change snapshot, section 6 stdin-userpass login"
provides:
  - "All 77 stored deploy keys rewrapped to vault:v2: through the thinx-api AppRole (idempotent re-run: rewrapped 0)"
  - "thinx-deploy-keys min_decryption_version 2 = latest_version 2 (operator write, D-14)"
  - "Refusal proof: the v1 canary gives CANARY result=retired_version version=v1"
  - "Post-change snapshot openbao-20261020T191108Z-post-change (first snapshot that decrypts the v2 files)"
  - "Runbook section 12: the repeatable Transit rotation recipe with rollback and alerts (D-11)"
affects: [41-08, openbao runbook section 12, KEYMIG-03, ROADMAP criterion 3]

actuals:
  tokens: 3442
  tasks: 3
  commits: 2
plan_head_before: d8722a81582e22ce405cf55bdac64d9a7efeb7a4
plan_head_after: 78cdd6c613239dc2d7af3af07c7dafa4917d2cba

tech-stack:
  added: []
  patterns:
    - "Rotation gate: rewrap twice (second run rewrapped 0), host prefix check, keyed fetch, then and only then the operator raises min_decryption_version"
    - "Refusal proven with a junk canary through the production client, never a real key's old ciphertext"

key-files:
  created:
    - .planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-07-SUMMARY.md
  modified:
    - .planning/runbooks/openbao.md

key-decisions:
  - "D14_GATE pass recorded before the raise: rewrap re-run all 77 at v2 with 0 rewrapped/0 failed, FETCH_CHECK ok=true for owner test"
  - "Operator raised min_decryption_version to 2 (latest 2); no trim, no other key setting, AppRole not widened"
  - "Post-change snapshot taken first in Task 3 to close the window in which no snapshot could decrypt v2 ciphertext"
  - "Human check passed on the keyed fetch: build f9a73980 fetched the private repo; its later make-target failure (d1_mini) is a builder issue outside KEYMIG"

requirements-completed: [KEYMIG-03]

duration: "Task 1 18:51-18:53Z; Task 2 (operator) 18:53-19:11Z; Task 3 19:11-19:12Z; human check 19:32Z; close 19:44Z"
completed: 2026-10-20
---

# Phase 41 Plan 07: Rewrap, minimum raise and refusal proof Summary

**Every stored deploy key is now `vault:v2:` ciphertext. thinx-deploy-keys has min_decryption_version 2 = latest_version 2, OpenBao refuses the v1 canary as `retired_version`, keyed fetches and a console build's checkout still work, and runbook section 12 holds the repeatable rotation recipe.**

L0 = 1, L1 = 2 (from the 41-06 resume signal `rotated latest_version=2 min_decryption_version=1`).

## Tasks

| Task | Name | Commit | Result |
|------|------|--------|--------|
| 1 | Rewrap through the AppRole, idempotent re-run, D-14 keyed fetch (tracer) | ea3f823e | rewrapped 77, re-run 0, 77/77 `vault:v2:`, FETCH_CHECK ok, D14_GATE pass |
| 2 | Operator raises min_decryption_version (checkpoint:human-action, blocking-human) | evidence in 78cdd6c6 | `raised min_decryption_version=2 latest_version=2` |
| 3 | Refusal proof, post-raise checks, snapshot, section 12 | 78cdd6c6 (+ human-check record in the final docs commit) | all gates green, human check passed |

All work ran in thinx_api task `74bunku80wzuf5q63cfxuderj` on micro (0 restarts throughout). Outputs were counts, versions and verdict lines only.

### Task 1 (runbook: "2026-10-20 Plan 41-07 Task 1: rewrap")

- Pre-state `--report`: 77 private files, `{"v1":77}`, legacy 0.
- `--rewrap --json` 18:51:55-18:52:08Z: latest v2, versions_before `{"v1":77}`, versions_after `{"v2":77}`, rewrapped 77, failed 0, aborted null, writes 77, transit_requests 232, legacy_total 0.
- Re-run 18:52:14Z: rewrapped 0, at_latest 77, failed 0, writes 0, versions_after `{"v2":77}`. The plan's jq verify ran a third time, same result.
- Host check on micro: 77/77 private files start with exactly `vault:v2:`, 0 not mode 600, 77 `.pub`, 154 entries, 0 tmp.
- `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0` (owner `test`, suculent/thinx-autoflood, `main`).
- Canary before the raise: `CANARY result=ok version=v1`. **D14_GATE pass.**

### Task 2 (runbook: "2026-10-20 Plan 41-07 Task 2")

- Operator resume signal, verbatim: `raised min_decryption_version=2 latest_version=2`
- Section 6 stdin-userpass login, token prefix check, one config write, `bao token revoke -self`. No `bao login`.

### Task 3 (runbook: "2026-10-20 Plan 41-07 Task 3: minimum raised, refusal proven")

- `openbao-backup.sh --post-change` 19:11:07-19:11:13Z: `OPENBAO-BACKUP-OK mode=post-change stem=openbao-20261020T191108Z-post-change`.
- Refusal: `CANARY result=retired_version version=v1` (ROADMAP criterion 3).
- After the raise: `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0`; `--report` `{"v2":77}`, legacy 0.
- API log since 18:53Z: 0 `retired_version`, 0 `probe failed` / `deploy key unavailable`.
- Gates: `--live` API-WIRING-OK (TRANSIT_CANARY ok with a fresh v2 ciphertext, FORBIDDEN_DENIED 13/13, SPEC_ATTACHMENTS ok, PREVIOUS_SPEC ok); `openbao-verify.sh --full` OK; `--api-service thinx_api` OK with API_PASSPHRASE_ABSENT ok; `OPENBAO-REHEARSAL-MATRIX-OK generations=g1,g2`; ports 7442, 1883, 8883 open.
- Section 12 written; plan verify passes (contains min_decryption_version, 0 ciphertext shapes; whole runbook also 0).
- Human check, operator reply verbatim: `build failed f9a73980-ccbc-11f1-8c6d-297b9876e71d `*** Do not know how to make File target `d1_mini' (/opt/workspace/d1_mini).  Stop.` but git fetched correctly. 20/10/2026, 21:32:27 UTC+2` (19:32:27Z). Verdict: passed for the keyed fetch.
- Logs since 19:30Z (counts only): thinx_api `deploy key unavailable` 0, `retired_version` 0, `[git] key ... skipped` 0; thinx_worker (task `4ss4vlnluqw67255gxbac09w9`, micro) 0 and 0.

## Deviations from Plan

- **Task 2 relayed steps (minor):** the coordinator dropped the executor's suggested `bao read -field=display_name auth/token/lookup-self` check, because lookup-self returned 403 for the operator token in 41-06. The token prefix check and the latest_version / min_decryption_version reads served as the token validation. Recorded in the runbook.
- **Task 3 order:** the post-change snapshot ran first (coordinator instruction), before the refusal proof, to close the window in which no snapshot could decrypt the v2 files (noted in the Task 1 evidence). Same commands, earlier position.
- **Human check outcome:** the console build failed after checkout with a make-target error, not a key error. Per the checkpoint rule and the coordinator's ruling, this counts as passed for KEYMIG-03; the failure is a follow-up candidate below.

## Follow-up candidates (not KEYMIG)

- Build `f9a73980-ccbc-11f1-8c6d-297b9876e71d` (19:32:27Z): `make` has no target `d1_mini` in `/opt/workspace`. A builder/platform target issue for that device's build, after a successful keyed fetch.

## Requirements

- KEYMIG-03 complete: rotation (41-06), rewrap to v2, min_decryption_version = latest = 2, refusal of v1 proven, keyed fetch and checkout work, recipe in runbook section 12. ROADMAP criterion 3 met.

## Push state

- ea3f823e, 78cdd6c6 and this docs commit are local on thinx-staging. The plan has no push step: no push, no main, no tag.

## Artifacts kept until Plan 41-08

- `/root/thinx-backups/transit-canary-20261020T184027Z.ct` (v1 junk canary, 0600 root, micro).
- Snapshots `openbao-20261020T184042Z-pre-change` and `openbao-20261020T191108Z-post-change` (micro and core).

## Known Stubs

None.

## Threat Flags

None: no new endpoint, auth path or schema; the only live writes were the rewrap (AppRole, granted since Phase 39), the operator's single config write and a snapshot.

## Next

Plan 41-08: push the parent retirement commits through CI, the whole-phase live gate, then the D-06 shred of the pre-migration tar and, by operator choice, the other passphrase-bearing copies.

## Self-Check: PASSED

- FOUND: 41-07-SUMMARY.md, .planning/runbooks/openbao.md (section 12, Plan 41-07 entries)
- FOUND commits: ea3f823e, 78cdd6c6 (ancestors of HEAD)
