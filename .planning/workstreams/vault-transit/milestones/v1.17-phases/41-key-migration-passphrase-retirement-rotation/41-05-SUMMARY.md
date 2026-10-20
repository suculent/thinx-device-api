---
phase: 41-key-migration-passphrase-retirement-rotation
plan: 05
subsystem: deploy-keys
status: complete
tags: [openbao, transit, deploy-keys, passphrase-retirement, swarm, wiring-gate, repo-first]

requires:
  - phase: 41-key-migration-passphrase-retirement-rotation
    provides: "41-02 D10_GATE pass; 41-03 D-13 reason classes; 41-04 Transit-only git.js and PassphraseRetiredSpec"
provides:
  - "Production thinx_api runs the Transit-only code with D-13 live (task b0el7hlnn988mpg3y3njk1qrh, image f4492b4fb94134e5)"
  - "thinx-swarm 48581e9 (local, unpushed): thinx.yml without the passphrase; wiring gate and openbao-verify.sh require its absence"
  - "parent fdbf16c5: docker-swarm.yml without the passphrase; PassphraseRetiredSpec scans docker-swarm.yml"
  - "Operator decision recorded: go for the live retirement (Plan 41-06 Task 1)"
affects: [41-06, 41-07, 41-08, thinx-swarm wiring gate, openbao-verify --api-service]

actuals:
  tokens: 7600
  tasks: 3
  commits: 3
plan_head_before: 8fd573aa395f8cb62ff0cd92fe9e7d577c7b97f9
plan_head_after: fdbf16c5cd63590a2d97e3dddc93aa18e9a11c37

tech-stack:
  added: []
  patterns:
    - "A retired baseline entry is stripped from the BASELINE side only (JQ_RETIRED); the current side must not carry it, so BASELINE_UNCHANGED still guards every other property"
    - "The live gate reports .PreviousSpec as info, never FAIL, so a fresh rollback point does not fail the gate; Plan 41-06 clears it with one --force update and then expects ok"

key-files:
  created: []
  modified:
    - .planning/runbooks/openbao.md
    - docker-swarm.yml
    - spec/jasmine/PassphraseRetiredSpec.js
    - ../../thinx-swarm/thinx.yml
    - ../../thinx-swarm/tests/openbao-api-wiring.test.sh
    - ../../thinx-swarm/scripts/openbao-verify.sh

key-decisions:
  - "Operator decision 41-05 Task 3: go (repo-first order and keeping the 12 thinx.yml.bak* files accepted as presented defaults)"
  - "PASSPHRASE_ABSENT also refuses the long-form api secret ({source: ...}) and any api env entry starting with the name, not only the exact ${...} form"
  - "The live SPEC_ATTACHMENTS flag 6 and API_PASSPHRASE_ABSENT match the secret by SecretName or File.Name, so the value cannot come back under another file name"

requirements-completed: []

duration: "Task 1 15:18-15:37Z; Task 2 ~17:45-18:05Z; decision 18:10Z"
completed: 2026-10-20
---

# Phase 41 Plan 05: Removal deploy, repo-first swarm retirement and the go decision Summary

**The Transit-only deploy-key code runs in production with D-13 live. The passphrase retirement is committed in thinx-swarm (48581e9, not pushed) and the parent docker-swarm.yml (fdbf16c5), with both gates asserting absence (--source green, 18/18 mutations refused). The operator answered "go" for the live retirement in Plan 41-06.**

## Decision

Operator answer, verbatim: "go"

Decision 41-05 Task 3: go

- Order confirmation: accepted as presented (repo-first: thinx-swarm 48581e9 is pushed and fast-forwarded on micro in Plan 41-06 before the live `docker service update`). The operator said "go" with no override.
- .bak confirmation: accepted as presented. The 12 tracked `thinx.yml.bak*` files in thinx-swarm stay as history (variable references only, no value). The operator said "go" with no override.

## Tasks

| Task | Name | Commit(s) | Result |
|------|------|-----------|--------|
| 1 | Removal deploy, Transit-only code live (D-08 step 1), tracer | parent 46271bc8, 4fff74af (evidence) | live checks all pass |
| 2 | Swarm retirement authored repo-first, gates require absence | thinx-swarm 48581e9; parent fdbf16c5 | --source, --self-test 18/18, spec green |
| 3 | Operator decision (checkpoint:decision, blocking-human) | (this summary) | go |

### Task 1 (evidence: `.planning/runbooks/openbao.md`, "### 2026-10-20 Plan 41-05 Task 1: removal deploy (D-08 step 1)")

- D-10 re-check right before the push: legacy_total 0, unknown 0 (77/77 `v1`).
- CircleCI for `8fd573aa`: thinx-unit `test` #16160 success; thinx-staging `test` #16163 and `api-registry` #16164 success.
- New task `b0el7hlnn988mpg3y3njk1qrh` on micro, image digest `f4492b4fb94134e5`, 0 restarts.
- `REMOVAL_LIVE retired_version=true key_missing=true sshEnv=undefined keyPassphrase=undefined`.
- `FETCH_CHECK ok=true key_unavailable=none keys=5 transit=5 legacy=0 other=0` (owner test, suculent/thinx-autoflood).
- One `[transit] probe ok`, zero `probe failed`; `--live` (pre-retirement gate) API-WIRING-OK; openbao-verify `--full` and `--api-service thinx_api` OK; rehearsal matrix OK; ports 7442, 1883 and 8883 open; routers unchanged (29, `fa0afd608550e585`).

### Task 2

- thinx-swarm `thinx.yml`: the secret declaration, the api secret entry and the api env line are gone (`grep -c` 3 -> 0).
- `tests/openbao-api-wiring.test.sh`: JQ_RETIRED on the baseline side; API_SECRETS needs only BAO_ROLE_ID and BAO_SECRET_ID; PASSPHRASE_ABSENT replaces PASSPHRASE_KEPT; self-test cases passphrase-env-readded, passphrase-secret-readded and passphrase-secret-declared (18 total); `--live` flag 6 = no secret of that name, flag 8 = no .Spec env key of that name (eight true values expected), PREVIOUS_SPEC ok/info, NORM drops the retired entries on both sides.
- `scripts/openbao-verify.sh`: the mount loop covers BAO_ROLE_ID and BAO_SECRET_ID; new API_PASSPHRASE_ABSENT (else API_PASSPHRASE_STILL_PRESENT); header updated.
- Parent `docker-swarm.yml`: name removed from the comment list, the declaration, the api secret and the env line (`grep -c` 4 -> 0).
- `spec/jasmine/PassphraseRetiredSpec.js`: docker-swarm.yml is in the file set and must exist.
- Gate results:
  - `--source ../../thinx-swarm/thinx.yml docker-swarm.yml`: `WIRING PASSPHRASE_ABSENT ok` for both files, BASELINE_UNCHANGED and FILES_MATCH ok, API-WIRING-OK.
  - `--self-test`: `WIRING SELF_TEST ok 18/18 mutations refused`.
  - PassphraseRetiredSpec 4/0; a temporary token in docker-swarm.yml made it fail (`docker-swarm.yml:621`), file restored.
  - DeployKeyNames + CiPipelineGates under `node --test`: 76/76.
  - The new `--live` jq was checked offline with a stub `docker` and synthetic inspect JSON: clear spec -> 8 true flags and PREVIOUS_SPEC ok; PreviousSpec holding the passphrase -> info; .Spec holding it -> FAIL (flags 6 and 8 false); NORM equal against a pre-OpenBao backup that still holds the passphrase, different on an unrelated env change.
  - `--live` was not run after the change: it would report the still-mounted secret until Plan 41-06 updates the service (as the plan says).
- `git -C ../../thinx-swarm log origin/master..HEAD --name-only` lists exactly scripts/openbao-verify.sh, tests/openbao-api-wiring.test.sh and thinx.yml. The unrelated thinx-swarm changes (landing, scripts/openbao-recovery-archive.sh, docs/) were not staged.
- Tracked `thinx.yml.bak*` files in thinx-swarm: **12**.

## Push state

- Nothing was pushed by Tasks 2 and 3. thinx-swarm 48581e9 stays local until Plan 41-06 Task 1.
- Parent commits 46271bc8, 4fff74af, fdbf16c5 and this docs commit are local on thinx-staging; no main, no tag.

## Deviations from Plan

- **[Rule 2 - Correctness] Absence checks wider than the pattern snippet.** PASSPHRASE_ABSENT also refuses a long-form secret entry and any env entry starting with the name; the live flag 6 and API_PASSPHRASE_ABSENT also match by File.Name. Files: thinx-swarm tests/openbao-api-wiring.test.sh, scripts/openbao-verify.sh. Commit 48581e9.
- **[Rule 1 - Bug] Usage ranges.** The header comments grew, so `sed -n '2,33p'` (wiring gate) became `2,40p` and `sed -n '2,42p'` (verifier) became `2,43p`, so `--help` prints the full header. Commit 48581e9.

## Requirements

KEYMIG-02 stays Pending in REQUIREMENTS.md, as it did after 41-03 and 41-04. The swarm secret, the live env, the `.env` line and the askpass purge are Plan 41-06 Task 1.

## Known Stubs

None.

## Next

Plan 41-06 Task 1 (live retirement), whose precondition greps `Decision 41-05 Task 3: go` above.

## Self-Check: PASSED

- FOUND: docker-swarm.yml, spec/jasmine/PassphraseRetiredSpec.js, ../../thinx-swarm/thinx.yml, ../../thinx-swarm/tests/openbao-api-wiring.test.sh, ../../thinx-swarm/scripts/openbao-verify.sh
- FOUND commits: 46271bc8, 4fff74af, fdbf16c5 (parent HEAD ancestry); 48581e9 (thinx-swarm HEAD)
