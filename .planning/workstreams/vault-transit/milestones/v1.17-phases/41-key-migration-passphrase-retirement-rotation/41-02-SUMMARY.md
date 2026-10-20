---
phase: 41-key-migration-passphrase-retirement-rotation
plan: 02
subsystem: deploy-keys
tags: [openbao, transit, deploy-keys, migration, production, backup, circleci, swarm]

requires:
  - phase: 41-key-migration-passphrase-retirement-rotation
    provides: "41-01 scripts/migrate-deploy-keys.js (--report, --dry-run, --migrate, --fetch-check) and Transit#rewrapKey"
  - phase: 40-transit-encrypted-deploy-keys-in-the-api
    provides: "dual-read deploy-key path in the API, thinx-api AppRole, the 40-05 release flow and live gates"
provides:
  - "Production ssh_keys: 77 of 77 private deploy keys are one Transit vault:v1 line each, mode 600, no PEM on disk"
  - "D-05 root-only, node-local pre-migration backup /root/thinx-backups/deploy-keys-premig-20261020T123359Z.tar (+ .sha256) on micro, kept until Plan 41-08"
  - "D10_GATE pass record in the openbao runbook (the unlock for the Plan 41-05 removal push)"
  - "Runbook evidence entries for the migration-tool deploy (Task 1) and the production migration (Task 3)"
affects: [41-03, 41-04, 41-05, 41-08, openbao runbook]

actuals:
  tokens: 2300
  tasks: 3
  commits: 2
plan_head_before: 5d972067ad88c7b955da87475bfaee3d234453d3
plan_head_after: cd6cfd289cd6539c695a34275971cf9aa7dcb60a

tech-stack:
  added: []
  patterns:
    - "Production key operations go through the task-exec form (service ps for the running task id and node, docker ps by task label, docker exec ... --json | tail -1), never docker ps by service name"
    - "Order for destructive key work: host tar (0700/0600, sha256, ext4, outside the Gluster backup job), then orphan purge, then a fresh dry-run compared against the approved quarantine list, then --migrate, then an idempotent re-run"

key-files:
  created:
    - .planning/workstreams/vault-transit/phases/41-key-migration-passphrase-retirement-rotation/41-02-SUMMARY.md
  modified:
    - .planning/runbooks/openbao.md

key-decisions:
  - "Operator answered Task 2 'go' and accepted the persistent console audit-log warning entry (Audit.log, warning) as the D-03 quarantine-notification channel"
  - "D10_GATE pass recorded 2026-10-20: re-run 0 legacy / 0 failed and FETCH_CHECK ok=true for owner test on suculent/thinx-autoflood; Plan 41-05 may push the legacy-path removal"
  - "The D-05 tar stays on micro's local ext4 under /root/thinx-backups until Plan 41-08 shreds it; it is decryptable with the old passphrase and may be in DO snapshots (accepted residual, 2026-10-09)"

patterns-established:
  - "Capture the report on the laptop (ssh ... | tail -1 > local file), never redirect it to a path on the host"

requirements-completed: [KEYMIG-01]

coverage:
  - id: D1
    description: "Migration tool deployed through thinx-unit CI then thinx-staging (test + api-registry green), new thinx_api task probes Transit ok, all live gates pass, read-only dry-run reports counts with writes 0"
    requirement: KEYMIG-01
    verification:
      - kind: other
        ref: "Task 1 verify: gh api commit status of thinx-unit / thinx-staging SHAs (test #16153, #16154, api-registry #16155)"
        status: pass
      - kind: integration
        ref: "bash ../../thinx-swarm/tests/openbao-api-wiring.test.sh --live (API-WIRING-OK mode=live)"
        status: pass
      - kind: integration
        ref: "openbao-verify.sh --full --expect-seal-generation g2 --expect-no-runtime-generation g1 && openbao-restore-rehearsal.sh --verify-recorded-matrix"
        status: pass
      - kind: other
        ref: "migrate-deploy-keys.js --dry-run --json in task (mode dry-run, writes 0, transit_requests 0, aborted null)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-05 backup tar root-only on micro local ext4 (dir 700, tar and .sha256 600, 157 entries = 156 + 1, sha256 ok, not referenced by the Gluster backup job)"
    requirement: KEYMIG-01
    verification:
      - kind: other
        ref: "Task 3 verify command 2 (backup custody + host checks over ssh)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Orphan purge, migration and idempotent re-run: 1 orphan pair removed, 76 migrated, 0 quarantined, 0 failed; re-run migrated 0 / failed 0 / legacy_total 0; 77/77 private files vault:v at 600, 0 PEM lines"
    requirement: KEYMIG-01
    verification:
      - kind: other
        ref: "Task 3 verify command 1 (--migrate --json re-run jq gate)"
        status: pass
      - kind: other
        ref: "Task 3 verify command 2 (head -c 9 vault:v count, mode 600, grep -l PRIVATE KEY = 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-10 keyed fetch with a migrated key through the production fetch path (FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0); D10_GATE pass recorded"
    requirement: KEYMIG-01
    verification:
      - kind: other
        ref: "Task 3 verify command 3 (--fetch-check owner test, git@github.com:suculent/thinx-autoflood.git main)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real device build in the Vue console with a migrated key (device Flood 04ed1650, owner test) shows the keyed fetch passed with no 'deploy key unavailable' line"
    requirement: KEYMIG-01
    verification: []
    human_judgment: true
    rationale: "Plan human-check: needs the operator to trigger a console build and read its log; the executor ran the equivalent --fetch-check only"

duration: 55min
completed: 2026-10-20
status: complete
---

# Phase 41 Plan 02: Production Deploy-Key Migration Summary

**All 77 surviving production deploy keys are now OpenBao Transit ciphertext (76 migrated, 0 quarantined, 0 failed). A root-only pre-migration tar sits on micro's local disk, the orphaned pair was purged first, and a migrated key cloned suculent/thinx-autoflood through the production fetch path. D10_GATE pass is recorded.**

## Performance

- **Duration:** about 55 min of execution (Task 1 12:00-12:30Z, Task 3 12:33-12:54Z), not counting the operator decision wait
- **Started:** 2026-10-20T12:00:00Z
- **Completed:** 2026-10-20T12:54:06Z
- **Tasks:** 3 (Task 1 tracer, Task 2 operator decision, Task 3 migration)
- **Files modified:** 1 tracked file (.planning/runbooks/openbao.md), plus this SUMMARY

## Accomplishments

- Shipped the 41-01 migration tool to production the gated way. `thinx-unit` test #16153 went green first, then the `thinx-staging` push: test #16154 and api-registry #16155. Swarmpit rolled out task `j9n880hztl5pg4fnptefq6eh7` on micro, and every live gate passed (Transit probe, `--live` wiring, openbao-verify, restore rehearsal, ports, router hash).
- D-05 backup: `deploy-keys-premig-20261020T123359Z.tar`, 440320 bytes, sha256 `14b0c741a762…`, 157 entries. It sits in `/root/thinx-backups`, with the directory at 700 and the tar and `.sha256` at 600 root, on ext4 outside the Gluster backup job.
- D-01 purge: 1 orphaned owner (`bc3083aa…`) and its 1 pkcs1 pair deleted, 0 askpass files. The users view returned 378 owners, the same as the Task 1 scan.
- `--migrate` results: 76 migrated (encrypted_pkcs8 72, pkcs1 3, openssh 1), already_transit 1, quarantined 0, notified 0, failed 0, changed_during_run 0, pub_mismatch 0, 152 Transit requests, aborted null.
- Idempotent re-run: migrated 0, failed 0, legacy_total 0, already_transit 77. Host checks: 77/77 private files start with `vault:v`, all are mode 600, and 0 files hold a PEM private-key line.
- D-10: owner `test` had 5 keys, all legacy before this plan, and its fetch check printed `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0`. **D10_GATE pass** is recorded in the runbook.

## Task Commits

1. **Task 1: Migration tool live, CI green, deployed, read-only dry-run and orphan scan:** `624f3004` (docs, runbook evidence; the deploy itself was the push of `5d972067` to thinx-unit and thinx-staging)
2. **Task 2: Operator decision:** no commit. The operator answered "go" and accepted the persistent console audit-log warning entry as the D-03 quarantine-notification channel.
3. **Task 3: Backup, orphan purge, migration, idempotent re-run, D-10 keyed fetch:** `cd6cfd28` (docs, runbook evidence)

**Plan metadata:** the final docs commit (SUMMARY, STATE, ROADMAP, REQUIREMENTS)

## Files Created/Modified

- `.planning/runbooks/openbao.md`: evidence entries "2026-10-20 Plan 41-02 Task 1: migration tool deployed, dry-run" and "2026-10-20 Plan 41-02 Task 3: production migration" (with D10_GATE pass)
- Production, not in git: `/mnt/gluster/thinx/ssh_keys` (77 private files rewritten as Transit ciphertext, 1 orphan pair removed), `/root/thinx-backups/deploy-keys-premig-20261020T123359Z.tar{,.sha256}` on micro

## Decisions Made

- Operator decision (Task 2), recorded verbatim: **"go"**. The operator also accepts the persistent console audit-log warning entry as the D-03 quarantine-notification channel.
- No quarantine was predicted or happened, so no D-03 audit warning was written and no owner has to regenerate a key.
- D10_GATE pass rests on the in-task `--fetch-check`, the same production fetch path a build uses. The console build of device Flood is still an operator human-check (coverage D5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The `--migrate` report went to a stray file on micro instead of the laptop**
- **Found during:** Task 3, step 4
- **Issue:** The executor sent a malformed command. It ran `--migrate` as planned but redirected the in-task output to `/dev/null.tmp` on the micro host (a 536-byte, mode-644 regular file on devtmpfs), so the report never reached the laptop.
- **Fix:** Read only the file's last line (the JSON report: counts, an empty quarantine list, no owner ids, no key material), recorded it, and removed the file. `/dev/null` (char device 1,3) was unaffected. The idempotent re-run and the host checks then confirmed the result on their own.
- **Files modified:** none in the repo. The micro host file was removed.
- **Verification:** `ls /dev/null.tmp` reports absent. The re-run reported already_transit 77 and legacy_total 0, which matches migrated 76 + already_transit 1.
- **Committed in:** cd6cfd28 (disclosed in the runbook entry)

---

**Total deviations:** 1 auto-fixed (Rule 1, an executor command error with no data effect)
**Impact on plan:** None on production data or on the migration. It ran exactly once, as planned, and the report was recovered.

## Issues Encountered

- `purge-orphaned-rsa-keys.js --json` prints a "Configuration loaded from" line before its multi-line JSON. The executor parsed the `{ … }` block. The tool itself is fine.

## Known Stubs

None.

## User Setup Required

None. Optional operator human-checks from the plan: build device Flood (04ed1650, owner test) in the Vue console and confirm the build log has no "deploy key unavailable" line. There is no quarantine audit warning to check, since 0 keys were quarantined.

## Next Phase Readiness

- D10_GATE pass is recorded, so Plans 41-03..41-05 (legacy-path removal) can proceed. Plan 41-05 pushes the removal code on this record.
- Rollback until the 41-05 removal deploy: untar the D-05 copy over `/mnt/gluster/thinx/ssh_keys` on micro (D-07). After that deploy, a lost key can only be regenerated.
- The D-05 tar must be shredded in Plan 41-08 (D-06). It is decryptable with the old passphrase.
- Nothing from this plan was pushed: no `main` push, no tag, and the v1.18 release stays held.

## Self-Check: PASSED

- FOUND: .planning/runbooks/openbao.md (both 41-02 entries, `D10_GATE pass`)
- FOUND: 624f3004, cd6cfd28 (ancestors of HEAD; ledger count 2 from 5d972067)
- FOUND on micro: deploy-keys-premig-20261020T123359Z.tar and .sha256
- Re-ran Task 3 verify commands 1-3: all pass

---
*Phase: 41-key-migration-passphrase-retirement-rotation*
*Completed: 2026-10-20*
