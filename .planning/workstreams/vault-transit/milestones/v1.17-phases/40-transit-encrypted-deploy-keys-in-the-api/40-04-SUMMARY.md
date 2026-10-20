---
phase: 40-transit-encrypted-deploy-keys-in-the-api
plan: 04
subsystem: infra
tags: [openbao, transit, kill-switch, docker-swarm, wiring-gate, runbook, jq, yq]

requires:
  - phase: 40-transit-encrypted-deploy-keys-in-the-api
    provides: "40-01 transit.js log and Slack vocabulary, boot probe, 3 s timeout; 40-02 build-log line and key causes; 40-03 THINX_DEPLOY_KEYGEN switch and the 503 key_service_unavailable refusal"
  - phase: 39-internal-openbao-on-the-swarm
    provides: "tests/openbao-api-wiring.test.sh, 39-EXECUTION-BASELINES.env, the section 10 runbook conventions"
provides:
  - "THINX_DEPLOY_KEYGEN=enabled in the api env of thinx-swarm thinx.yml and the parent docker-swarm.yml (D-07 mirror)"
  - "Wiring gate accepting Phase 40: KEYGEN_SWITCH row, switch stripped from the baseline compare and part of FILES_MATCH, Phase 39 scope checks retired, SCOPE_NO_NEW_DEPENDENCY kept"
  - "--self-test with 17 mutations (keygen-disabled, keygen-removed, keygen-renamed-bao added)"
  - "--live normalization ignoring ContainerSpec.Image and THINX_DEPLOY_KEYGEN env entries (RESEARCH A1)"
  - "Runbook section 11: the API Transit client for operators"
affects: [40-05, 41]

actuals:
  tokens: 6147
  tasks: 2
  commits: 2
plan_head_before: d8942775417b9572d01ad92047ca6432e6f56c6d
plan_head_after: b8bba3d5d2123b598a2551e314b10cae8bdea8bb

tech-stack:
  added: []
  patterns:
    - "A new api env entry joins the wiring gate three ways: stripped in JQ_STRIP, compared in JQ_SUBSET, asserted exactly in contract_one"
    - "Live spec normalization drops fields CI or an operator lever may change (image, kill switch), nothing else"

key-files:
  created: []
  modified:
    - docker-swarm.yml
    - ../../thinx-swarm/thinx.yml
    - ../../thinx-swarm/tests/openbao-api-wiring.test.sh
    - .planning/runbooks/openbao.md

key-decisions:
  - "The switch entry sits directly after THINX_MQTT_DEVICE_WRITES=1 in both files, with a one-line D-07 comment; nothing else in either YAML changed."
  - "scope_guard keeps only SCOPE_NO_NEW_DEPENDENCY; the rsakey.js/git.js/package file-change check and the new-client check are retired, with a comment saying why."
  - "The dispatcher prints exactly the header (lines 2-33); before it also printed the blank line, set -euo pipefail and the HERE line."
  - "Runbook section 11 sits between section 10 and the separator before the evidence log, and uses the literal AGENTS.md ssh form as the plan asks, noting that the ssh micro/core aliases are equivalent."
  - "The runbook rollback keeps the docker-swarm.yml switch line in a full revert: old code ignores the variable and --source stays green."

patterns-established:
  - "Kill-switch spec backups are named thinx-api-pre-keygen-<UTC>.json, distinct from the thinx-api-pre-openbao-* baseline the gate reads"

requirements-completed: [KEYENC-03]

coverage:
  - id: D1
    description: "Both deployment sources carry exactly one THINX_DEPLOY_KEYGEN=enabled in the api env, identical in both files"
    requirement: KEYENC-03
    verification:
      - kind: other
        ref: "bash ../../thinx-swarm/tests/openbao-api-wiring.test.sh --source ../../thinx-swarm/thinx.yml docker-swarm.yml (KEYGEN_SWITCH ok x2, FILES_MATCH ok, API-WIRING-OK)"
        status: pass
      - kind: other
        ref: "grep -c 'THINX_DEPLOY_KEYGEN=enabled' docker-swarm.yml ../../thinx-swarm/thinx.yml (1 and 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The wiring gate passes on Phase 40 code and still refuses every Phase 39 regression plus the three switch mutations"
    requirement: KEYENC-03
    verification:
      - kind: other
        ref: "bash ../../thinx-swarm/tests/openbao-api-wiring.test.sh --self-test (SELF_TEST ok 17/17, API-WIRING-OK)"
        status: pass
    human_judgment: false
  - id: D3
    description: "--live ignores an image roll and the switch but still reports any other spec delta"
    requirement: KEYENC-03
    verification:
      - kind: unit
        ref: "NORM extracted from the script, applied with jq to synthetic specs: image + switch change equal, other env change differs"
        status: pass
    human_judgment: true
    rationale: "RESEARCH A1 is an assumption about what Swarmpit's autoredeploy changes; only the live --live run in Plan 40-05 proves it, and a SPEC_DELTA there goes to the operator."
  - id: D4
    description: "Runbook section 11 documents reason classes, logs, Slack, boot probe, the 12 s per Transit key bound, the kill-switch recipe and rollback, with no secret value"
    requirement: KEYENC-03
    verification:
      - kind: other
        ref: "Task 2 automated verify in 40-04-PLAN.md (section once, before the evidence log, 15 required strings, no ciphertext/token/CI value shape)"
        status: pass
    human_judgment: true
    rationale: "Whether an operator can actually diagnose and flip the switch from the section is a judgement; the recipe runs live only in Plan 40-05 if at all."

duration: 4min
completed: 2026-10-19
status: complete
---

# Phase 40 Plan 04: Kill-Switch Mirror, Wiring Gate and Runbook Summary

**`THINX_DEPLOY_KEYGEN=enabled` is now in the api env of both `thinx-swarm/thinx.yml` and the parent `docker-swarm.yml`. The Phase 39 wiring gate now accepts the Phase 40 client: a new `KEYGEN_SWITCH` row, 17/17 self-test mutations refused, and a `--live` check that ignores image rolls. Runbook section 11 gives operators the reason classes, log lines, Slack texts, the 12 s per Transit key outage bound, and the kill-switch and rollback recipes.**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-10-19T08:42:54Z
- **Completed:** 2026-10-19T08:46:58Z
- **Tasks:** 2
- **Files modified:** 4 (2 parent, 2 thinx-swarm)

## Accomplishments
- D-07 mirror: one `- "THINX_DEPLOY_KEYGEN=enabled"` line plus a one-line comment, directly after `THINX_MQTT_DEVICE_WRITES=1` in each file. Nothing else changed.
- `tests/openbao-api-wiring.test.sh`:
  - `JQ_STRIP` drops the switch, so `BASELINE_UNCHANGED` still compares against the Phase 39 baseline.
  - `JQ_SUBSET` gains `api_keygen`, so `FILES_MATCH` requires both files to agree on it.
  - `contract_one` gains `KEYGEN_SWITCH`: it passes only on exactly one entry equal to `THINX_DEPLOY_KEYGEN=enabled`.
  - `scope_guard` keeps only `SCOPE_NO_NEW_DEPENDENCY`.
  - `--self-test` adds `keygen-disabled`, `keygen-removed` and `keygen-renamed-bao`. The last is refused by both `API_ENV` and `KEYGEN_SWITCH`.
  - The `--live` `NORM` filter also deletes `TaskTemplate.ContainerSpec.Image` and filters `THINX_DEPLOY_KEYGEN=` env entries. The PRE check, `SPEC_ATTACHMENTS` and the output secret-shape scan are unchanged.
  - The header now describes Phase 40, and the dispatcher prints lines 2-33.
- Runbook `.planning/runbooks/openbao.md` § 11 covers:
  - what the API does with new and existing keys;
  - a seven-class reason table with first checks pointing to sections 1, 4 and 10;
  - the node lookup and the `timeout 30 docker logs` recipe, plus a table of log lines;
  - the FAILING and RECOVERED Slack texts and the per-process incident;
  - the boot probe;
  - the outage latency bound;
  - the D-04 build-log sentences and the D-03 refusal;
  - the kill-switch recipe (a 0600 root `thinx-api-pre-keygen-<UTC>.json` backup and one `docker service update`), the rollback order, and the Phase 41 boundary.
- Before this plan, `--source` failed with `SCOPE_PHASE40_FILE_CHANGED` and `SCOPE_NEW_CLIENT`, as RESEARCH Pitfall 1 predicted. It now ends `API-WIRING-OK mode=source`.

## Task Commits

1. **Task 1: kill-switch env in both deployment sources, gate updated (tracer)**
   - thinx-swarm `8cfa7dd` (feat, GPG-signed): `thinx.yml`, `tests/openbao-api-wiring.test.sh`
   - parent `d6fb0536` (feat, GPG-signed): `docker-swarm.yml`
2. **Task 2: runbook section 11** - parent `b8bba3d5` (docs, GPG-signed)

Nothing was pushed. The parent `thinx-staging` is 21 commits ahead of origin and thinx-swarm `master` is 1 ahead. The micro checkout was not touched.

## Tracer Feedback Gate (Task 1)

`human_verify_mode` is end-of-phase and the tracer `<verify>` is automated-only, so after both Task 1 commits the two verify commands were re-run end to end. Both passed (`VERIFY1 PASS`, `VERIFY2 PASS`), so there was no checkpoint and Task 2 went ahead.

## Verification Results

| Command | Result |
|---|---|
| `bash ../../thinx-swarm/tests/openbao-api-wiring.test.sh --source ../../thinx-swarm/thinx.yml docker-swarm.yml` (before the plan) | `API-WIRING-FAILED mode=source failures=2` (the two retired scope rows) |
| same, after Task 1 | every row ok, `KEYGEN_SWITCH ok` x2, `API-WIRING-OK mode=source` |
| `bash -n ../../thinx-swarm/tests/openbao-api-wiring.test.sh` | exit 0 |
| `bash ../../thinx-swarm/tests/openbao-api-wiring.test.sh --self-test` | before: `14/14`; after: `WIRING SELF_TEST ok 17/17 mutations refused`, `API-WIRING-OK mode=self-test` |
| `git -C ../../thinx-swarm show --name-only --format= HEAD \| sort` | `tests/openbao-api-wiring.test.sh`, `thinx.yml` |
| `grep -c 'THINX_DEPLOY_KEYGEN=enabled' docker-swarm.yml ../../thinx-swarm/thinx.yml` | 1 and 1 |
| `NORM` on synthetic specs (local jq, no live access) | image + switch change: equal; another env change: differs |
| Task 2 automated verify (section 11 once, before the evidence log, 15 strings, no ciphertext/token/CI shape) | pass |
| usage output (`tests/openbao-api-wiring.test.sh` with no mode) | ends on the header's last comment line |

`--live` was not run, because this plan forbids touching the swarm. It runs in Plan 40-05.

## Files Created/Modified
- `docker-swarm.yml`: the switch line and its comment in the api env.
- `../../thinx-swarm/thinx.yml`: the same line and comment.
- `../../thinx-swarm/tests/openbao-api-wiring.test.sh`: the gate changes listed above.
- `.planning/runbooks/openbao.md`: section 11.

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

### Clarifications (no behaviour beyond the plan)
- **Message text.** The `BASELINE_UNCHANGED` ok text now says "the five OpenBao additions and the kill switch removed", because the strip now covers the switch too. The `SPEC_DELTA` ok text now says the image and `THINX_DEPLOY_KEYGEN` are ignored. Only the wording of those output lines changed.
- **Usage range.** The header grew from 28 to 32 lines. The dispatcher now prints exactly the header, lines 2-33. The old range, 2-32, also printed three non-header lines.
- **SSH form in the runbook.** The runbook header says host details stay out of the file, but the plan asks for the literal AGENTS.md form. AGENTS.md is in the same repository, so this exposes nothing new. Section 11 uses the literal form and notes that the aliases are equivalent. Core's address comes from the gate's own `CORE` array.

**Total deviations:** 0 auto-fixed. **Impact:** none.

## Issues Encountered
None.

## Known Stubs
None.

## Threat Flags
None. T-40-16: only the two Phase 39 scope checks were retired, and the env allow-list, passphrase, attachment, baseline and dependency checks are unchanged; the count of 17 is asserted. T-40-17: `keygen-renamed-bao` is refused. T-40-18: the Task 2 grep found no ciphertext, token shape or CI throwaway value. T-40-SC: no package was added.

## User Setup Required
None.

## Next Phase Readiness
- Plan 40-05 handles:
  - pushing thinx-swarm `8cfa7dd` (origin, then ssh push and ff-merge on micro);
  - pushing the parent and the console in the planned order;
  - `--live` after the CI image roll. If Swarmpit changes more than the image (RESEARCH A1), the `SPEC_DELTA` row goes to the operator.
- The live `thinx_api` spec gets no `THINX_DEPLOY_KEYGEN` entry at cut-over; unset means enabled.

---
*Phase: 40-transit-encrypted-deploy-keys-in-the-api*
*Completed: 2026-10-19*

## Self-Check: PASSED
