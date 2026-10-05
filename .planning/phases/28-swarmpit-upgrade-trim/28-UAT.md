---
status: complete
phase: 28-swarmpit-upgrade-trim
source: [28-VERIFICATION.md]
started: 2026-10-05T12:50:00Z
updated: 2026-10-05T12:55:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Remove core's leftover swarmpit_influx-data volume (D-14)
expected: 0 references; afterwards swarmpit_influx-data 0 and swarmpit_db-data 1 on core; swarmpit_db task isp4hjomiuzg unchanged; Annex p28_d14_core updated
result: pass
note: Operator delegated ("Do it yourself", via the `core` alias). 2026-10-05T12:42:01Z: refs 0, CreatedAt 2021-09-24T16:34:55Z, 87M; after removal influx_vol=0, db_vol=1, swarmpit_db task isp4hjomiuzg Up. Annex row "D-14 core" committed (150f1fb0).

### 2. Apply swarm-autopull-recovery SKILL.md text (local, untracked)
expected: The skill text from 28-04-SUMMARY § "Operator follow-up: skill text" is applied; `grep -q 'Phase 28' .claude/skills/swarm-autopull-recovery/SKILL.md` succeeds; `git ls-files` for it prints nothing
result: pass
note: Operator delegated ("Update skills"). All four edits applied (private-registry image, 1.10 rung-1 wait, rung 4 done, Phase 28 history); grep 'Phase 28' succeeds; file untracked (0).

### 3. Swarmpit 1.10 tasks UI
expected: https://swarmpit.thinx.cloud/#/tasks lists tasks for both nodes; a service detail page shows live CPU/memory from swarmpit_agent; timeseries read "Statistics disabled" without errors
result: pass

### 4. Rollback path (behavior-unverified)
expected: Operator records a decision: accept the Step A/B rollback as un-drilled (inputs verified present and hash-equal), or drill Step B rollback in a maintenance window
result: pass
note: "pass, accept as un-drilled" — operator accepts the Step A/B rollback as un-drilled (2026-10-05).

### 5. Judgment-tier prohibitions of plans 28-01..28-04
expected: Operator confirms no violation (verifier's non-authoritative verdict: none found — step starts 10:02, 11:01, 11:27, 12:25 UTC; --resolve-image changed only; no restart.sh/swarmpit.sh/--prune; labels only listed as follow-ups; counts-only evidence)
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
