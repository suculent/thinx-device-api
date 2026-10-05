---
status: testing
phase: 28-swarmpit-upgrade-trim
source: [28-VERIFICATION.md]
started: 2026-10-05T12:50:00Z
updated: 2026-10-05T12:50:00Z
---

## Current Test

number: 1
name: Remove core's leftover swarmpit_influx-data volume (D-14)
expected: |
  0 containers reference the volume; after removal swarmpit_influx-data count 0 and
  swarmpit_db-data count 1 on core; swarmpit_db task isp4hjomiuzg still Running.
  Runbook Annex D-14 row updated from p28_d14_core=pending-operator to
  p28_d14_core=removed:<size> with the CreatedAt.
awaiting: user response

## Tests

### 1. Remove core's leftover swarmpit_influx-data volume (D-14)
expected: 0 references; afterwards swarmpit_influx-data 0 and swarmpit_db-data 1 on core; swarmpit_db task isp4hjomiuzg unchanged; Annex p28_d14_core updated
result: [pending]

### 2. Apply swarm-autopull-recovery SKILL.md text (local, untracked)
expected: The skill text from 28-04-SUMMARY § "Operator follow-up: skill text" is applied; `grep -q 'Phase 28' .claude/skills/swarm-autopull-recovery/SKILL.md` succeeds; `git ls-files` for it prints nothing
result: [pending]

### 3. Swarmpit 1.10 tasks UI
expected: https://swarmpit.thinx.cloud/#/tasks lists tasks for both nodes; a service detail page shows live CPU/memory from swarmpit_agent; timeseries read "Statistics disabled" without errors
result: [pending]

### 4. Rollback path (behavior-unverified)
expected: Operator records a decision: accept the Step A/B rollback as un-drilled (inputs verified present and hash-equal), or drill Step B rollback in a maintenance window
result: [pending]

### 5. Judgment-tier prohibitions of plans 28-01..28-04
expected: Operator confirms no violation (verifier's non-authoritative verdict: none found — step starts 10:02, 11:01, 11:27, 12:25 UTC; --resolve-image changed only; no restart.sh/swarmpit.sh/--prune; labels only listed as follow-ups; counts-only evidence)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
