---
phase: 28-swarmpit-upgrade-trim
verified: 2026-10-05T13:45:00Z
status: passed
score: 14/14 must-haves verified (1 by recorded operator override)
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/phases/28-swarmpit-upgrade-trim/28-01-PLAN.md
  - .planning/phases/28-swarmpit-upgrade-trim/28-01-SUMMARY.md
  - .planning/phases/28-swarmpit-upgrade-trim/28-02-PLAN.md
  - .planning/phases/28-swarmpit-upgrade-trim/28-02-SUMMARY.md
  - .planning/phases/28-swarmpit-upgrade-trim/28-03-PLAN.md
  - .planning/phases/28-swarmpit-upgrade-trim/28-03-SUMMARY.md
  - .planning/phases/28-swarmpit-upgrade-trim/28-04-PLAN.md
  - .planning/phases/28-swarmpit-upgrade-trim/28-04-SUMMARY.md
  - .planning/runbooks/swarm-configs/README.md
  - .planning/runbooks/swarm-configs/swarmpit-influxdb-bak-20260521200918.A.pre.conf
  - .planning/runbooks/swarm-configs/swarmpit-influxdb.A.pre.conf
  - .planning/runbooks/swarm-configs/swarmpit-stack.A.post.yml
  - .planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml
  - .planning/runbooks/swarm-configs/swarmpit-stack.B.post.yml
  - .planning/runbooks/swarm-configs/swarmpit-stack.B.pre.yml
  - .planning/runbooks/swarm.md
  - .planning/runbooks/swarmpit-upgrade.md
covered_digest: "v2:sha256:4e08b35a158e2796398654443c3d0a6f284bebe2060bdf2df7ac6d84e8f0d7d1"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "SC3b: each step can be rolled back from a stack snapshot taken before it"
    reason: "Every gate passed first time, so no rollback was run in Phase 28. The rollback inputs are verified present and hash-equal to the pre-step state: gluster .p28-A-pre and .p28-B-pre equal the committed A.pre and B.pre snapshots, the § Rollback recipes exist, and swarmpit/swarmpit:1.9 still resolves. The operator accepted the Step A/B rollback as un-drilled in 28-UAT test 4 ('pass, accept as un-drilled'). Since D-14, a Step A rollback starts an empty InfluxDB by design."
    accepted_by: "Matej Sychra (operator, 28-UAT.md test 4)"
    accepted_at: "2026-10-05T12:55:00Z"
re_verification:
  previous_status: human_needed
  previous_score: 13/14
  gaps_closed:
    - "D-14 core: swarmpit_influx-data removed from core by exact name (12:42:01Z, 87M, CreatedAt 2021-09-24); live core count 0, swarmpit_db-data 1"
    - "SC3b rollback: operator accepted as un-drilled (28-UAT test 4), carried as override"
    - "swarm-autopull-recovery skill text applied locally (3 'Phase 28' mentions, untracked)"
    - "Swarmpit 1.10 tasks UI: operator pass (28-UAT test 3)"
    - "Judgment-tier prohibitions: operator pass (28-UAT test 5)"
  gaps_remaining: []
  regressions: []
---

# Phase 28: Swarmpit Upgrade & Trim Verification Report

**Phase Goal:** Swarmpit is reduced to registry-triggered autoredeploy on 1.10. The stats stack is gone, the agent stays, every deploy lands within the 5-minute SLA, `swarmpit_db` is untouched, and each step can be rolled back from a pre-step snapshot.
**Verified:** 2026-10-05T13:45:00Z
**Status:** passed
**Re-verification:** Yes. The previous report (12:45Z, human_needed, 13/14) went stale when commit 150f1fb0 changed the runbook. This run also takes in the UAT and SECURITY results.

Evidence sources: the committed repo state, plus read-only checks the verifier ran itself at 13:39–13:42 UTC. Those checks used the manager (`docker node ls`, `docker stack services`, `docker service ps/inspect`, `docker volume ls`, gluster file hashes), core (`docker volume ls`, `docker ps`), the public `/version` endpoint and CircleCI's public job API. The SUMMARY, UAT and SECURITY claims were not taken as evidence on their own. Where a claim was checkable live, it was re-read.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC1:** Swarmpit runs 1.10 in production, and a test push to thinx-staging produces a new `thinx_api` task within 5 minutes | ✓ VERIFIED | Live `/version` (13:42Z) reports `1.10-SNAPSHOT`, statistics false, API 1.44. The live spec is `swarmpit/swarmpit:1.10@15c044a82fed`, task `e3qc53lt51jg`. Gate B took 50 s (CircleCI job 15705 → task `ydaoq586u8v5`); the previous run re-derived that figure and it is unchanged. **New evidence:** the 28-04 close-out push (`8a6ee319`) went through 1.10 autoredeploy as well. `api-registry` job 15714 stopped at 12:36:22.140Z, and task `rkft3tjkm501` was created at 12:37:10.67Z and Running at 12:37:36.743Z, which is 75 s. It is the current thinx_api task, with digest `2dcee123a0d1`, and the app logged 1 `autoredeploy fired` line naming that digest. |
| 2 | **SC2:** With stats disabled and `swarmpit_influxdb` removed, a second test push still redeploys within 5 minutes, and `thinx_influxdb` keeps running unaffected | ✓ VERIFIED | `docker stack services swarmpit` lists agent, app and db only. The only influx service in the cluster is `thinx_influxdb`. App env names are `DOCKER_API_VERSION`, `SWARMPIT_DB` and `SWARMPIT_DOCKER_API`. Gate A took 31 s (job 15697 → task `1m5q66fvvpwz`); that figure comes from the previous run. `thinx_influxdb` task `lpl1pp201yyi` is on core, Running for 31 h, and its container has been up for 2 days, so it predates the phase. |
| 3 | **SC3a:** `swarmpit_db` is untouched: couchdb 2.3.0, same volume, linked registry credentials | ✓ VERIFIED | The live spec is `couchdb:2.3.0@ee75c9a737e7`, which equals `p28_db_digest`. Task `isp4hjomiuzg` is on core and its container has been up for 4 days. `swarmpit_db-data` count is 1 on core and 1 on micro (the stale copy, kept). The 7-doc / v2-credential check from the previous run still holds: no app or db task has changed since. Gate B and the 12:37Z close-out redeploy both authenticated to the private registry, which shows the credential doc is still being read. |
| 4 | **SC3b:** each step can be rolled back from a stack snapshot taken before it | ✓ PASSED (override) | Override: no rollback was run, and the operator accepted it as un-drilled in 28-UAT test 4 on 2026-10-05. The inputs were re-checked live: gluster `swarmpit.yml.bak.*.p28-A-pre` hashes `2f84f4033868` (= committed A.pre) and `.p28-B-pre` hashes `d61396af4b36` (= committed B.pre = A.post). |
| 5 | Goal: `swarmpit_agent` kept (D-12; OPS-SWARM-03 descoped) | ✓ VERIFIED | Global 2/2. Tasks `bju4mnwpbuz3` (micro) and `tcrkflv13cge` (core) are unchanged from Step 0, with digest `1306e2a2f538` = `p28_agent_digest`. |
| 6 | Goal: every deploy stayed within the 5-minute SLA | ✓ VERIFIED | Gate 0 took 32 s, Gate A 31 s and Gate B 50 s, all re-derived from CircleCI and `docker inspect` in the previous run. The post-phase close-out deploy took 75 s and was measured independently in this run. Rung 1 never ran. |
| 7 | D-02 engine gate: neither node on Engine 29.0–29.2 | ✓ VERIFIED | Live `docker node ls` shows micro 29.8.1 and core 29.8.1. |
| 8 | D-12 docs: OPS-SWARM-03 is in Future Requirements with the reason; no v1.14 traceability row; 24 total | ✓ VERIFIED | REQUIREMENTS.md line 66 carries the descope reason. The traceability rows are OPS-SWARM-01 and -02 only (lines 106–107), and line 111 reads "24 total". ROADMAP line 328 notes the descope, and the three SCs make no mention of agent removal. |
| 9 | D-03/D-17: the stack file names the image by tag and is the source of truth; snapshots chain | ✓ VERIFIED | The live `swarmpit.yml` hashes to `0fd7d2c2de8d`, which equals the committed B.post. A.post is byte-equal to B.pre (`d61396af4b36`). |
| 10 | 1.10 healthcheck override in place, both 1.44 pins kept, no restart loop | ✓ VERIFIED | Live healthcheck: `curl -fs http://localhost:8080`, interval 60 s, timeout 10 s, StartPeriod 300 s, retries 5. The app task is still `e3qc53lt51jg` (= `p28_app_taskB`), Running 2 h with no newer task. |
| 11 | D-06: no 1.10 schema migration in swarmpit_db | ✓ VERIFIED | Carried from the previous run: migration-line count 0 and 7 docs unchanged. The app and db tasks have not changed since that read. |
| 12 | D-13: `swarmpit/influxdb.conf` and its `.bak` deleted, copies kept | ✓ VERIFIED | The live `swarm/swarmpit/` directory holds only `couchdb-logging.ini`. The copies are committed in `swarm-configs/`. |
| 13 | D-14: `swarmpit_influx-data` removed by exact name on micro **and core**; `swarmpit_db-data` untouched | ✓ VERIFIED | **Closed since the last run.** Live counts at 13:39Z: core `swarmpit_influx-data` 0 and `swarmpit_db-data` 1; micro 0 and 1. The swarmpit_db container on core is still task `isp4hjomiuzg`, up 4 days. The Annex row "D-14 core" records refs 0, CreatedAt 2021-09-24T16:34:55Z, 87M, removed at 12:42:01Z and `p28_d14_core=removed:87M`. The token appears in that row and in the historical D-14 row, which now points to it. The follow-up bullet reads "closed". |
| 14 | D-07 lifetime and docs: `/root/phase28` shredded; swarm.md rungs 1/4 updated; runbook end state | ✓ VERIFIED | Live `test -e /root/phase28` is false. swarm.md is unchanged since the last verification, which confirmed the rung 1/4 text. |

**Score:** 14/14 truths verified (13 verified, 1 passed by recorded operator override; 0 present but behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/runbooks/swarmpit-upgrade.md` | Runbook, Annex `p28_*` tokens, D-14 core row | ✓ VERIFIED | The "D-14 core" Annex row has been added and the follow-up bullet is marked closed. Neither change contains a host, key or port. |
| `swarm-configs/swarmpit-stack.{A,B}.{pre,post}.yml` | Snapshot chain | ✓ VERIFIED | Hashes `2f84f4033868`, `d61396af4b36` ×2 and `0fd7d2c2de8d` match the live gluster files. |
| `swarm-configs/swarmpit-influxdb*.A.pre.conf` | Copies of the deleted conf files | ✓ VERIFIED | Unchanged since the last verification |
| `.planning/runbooks/swarm.md` | Rungs 1/4 for Phase 28 | ✓ VERIFIED | Unchanged since the last verification |
| `.claude/skills/swarm-autopull-recovery/SKILL.md` (local, untracked by design) | 1.10 rung-1 wait, rung 4 done, Phase 28 | ✓ VERIFIED | 3 "Phase 28" mentions. Line 13 has the 1.10 (JDK 17) wait and "No InfluxDB since Phase 28". Line 15 marks rung 4 done. `git ls-files` returns 0. |
| `28-UAT.md` | Operator results | ✓ PRESENT | status complete, 5/5 pass |
| `28-SECURITY.md` | Threat register | ✓ PRESENT | threats_open 0, 20/20 closed, status verified |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| thinx-staging push (Gate B, `b8f1bf15`) | new thinx_api task | CircleCI `api-registry` → private registry → Swarmpit 1.10 | ✓ WIRED | 50 s (previous run) |
| thinx-staging push (close-out, `8a6ee319`) | new thinx_api task | same | ✓ WIRED | job 15714 stopped at 12:36:22Z → `autoredeploy fired` naming `2dcee123a0d1` → task `rkft3tjkm501` Running at 12:37:36.7Z (75 s) |
| thinx-staging push (Gate A, `fb7eceae`) / (Gate 0, `c53cc788`) | new thinx_api task | same, on 1.9 | ✓ WIRED | 31 s / 32 s (previous run) |
| `swarmpit.yml` (gluster) | `swarmpit_app` live spec | `docker stack deploy --resolve-image changed` | ✓ WIRED | file hash = B.post; spec tag, digest and healthcheck match |
| `swarmpit_app` 1.10 | `swarmpit_db` registry-credential doc | CouchDB read | ✓ WIRED | two successful private-registry autoredeploys on 1.10 |
| Annex `p28_stepB=PASS` | `docker volume rm swarmpit_influx-data` (micro, core) | precondition | ✓ WIRED | micro 12:26:19Z and core 12:42:01Z, both after Gate B (11:37Z) and the 10-min hold |

### Data-Flow Trace (Level 4)

Not applicable. This is an ops/docs phase with no rendered dynamic data. The registry digest → Swarmpit poll → task flow is traced under Key Links.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Swarmpit version, stats off | `curl https://swarmpit.thinx.cloud/version` | `1.10-SNAPSHOT`, statistics false, api 1.44 | ✓ PASS |
| Swarmpit UI / API health | `curl -w %{http_code}` on the UI root and `/api/v2/csrf-token` | 200 / 200 | ✓ PASS |
| Stack composition | `docker stack services swarmpit` (manager) | agent global 2/2, app 1/1 1.10, db 1/1 couchdb:2.3.0 | ✓ PASS |
| Live services and digests | `docker service ps/inspect` (manager) | app `e3qc53lt51jg`, db `isp4hjomiuzg`, agent unchanged, `thinx_influxdb` `lpl1pp201yyi` | ✓ PASS |
| Core volumes | `docker volume ls -q \| grep -cx` (core) | influx-data 0, db-data 1 | ✓ PASS |
| Micro volumes | same (manager) | influx-data 0, db-data 1 | ✓ PASS |
| Rollback inputs | `sha256sum` of the gluster `.p28-*-pre` backups vs the committed snapshots | equal | ✓ PASS |
| Post-phase SLA | CircleCI v1.1 tree API + `docker inspect rkft3tjkm501` | 75 s | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED. The phase declares no `scripts/*/tests/probe-*.sh`. The underlying facts were re-derived from live state above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OPS-SWARM-01 | 28-01, 28-03, 28-04 | Swarmpit runs 1.10 in production and autoredeploy completes within 5 min | ✓ SATISFIED | truths 1, 6, 10 |
| OPS-SWARM-02 | 28-01, 28-02, 28-04 | Stats disabled, `swarmpit_influxdb` removed, `influxdb.conf` deleted with a copy kept; autoredeploy verified by a test push | ✓ SATISFIED | truths 2, 12, 13 |
| OPS-SWARM-03 | 28-01 | `swarmpit_agent` removed | ACCOUNTED: descoped (D-12) | in Future Requirements with the reason; agent intentionally kept (truth 5) |

Orphaned requirements: none.

### Prohibitions (plan `must_haves.prohibitions`)

| Prohibition (abridged) | Tier | Finding |
|---|---|---|
| No host, key name or port in committed runbook, README, snapshots, SUMMARYs | automated | 0 hits in all of them, and 0 hits in `28-UAT.md`, `28-SECURITY.md` and the lines added since `1df2768c`. The Annex row refers to core only by its `core` alias. |
| No pushed commit outside `.planning/`, no `[skip ci]`, nothing to main | automated | The 4 commits since the last verification are all `.planning/`-only and signed (`G`), and none has been pushed yet. `origin/thinx-staging` is at `8a6ee319`. |
| db/agent blocks, pins, `swarmpit_db` image/volume/placement unchanged | automated | live tasks and digests equal Step 0 |
| `swarmpit_influx-data` not removed before Gate B + 10 min | automated | micro 12:26Z and core 12:42Z, both after 11:38Z |
| No `@sha256` in the stack file | automated | live file = B.post, 0 |
| No prune or pattern removal; `swarmpit_db-data` untouched | automated | exact-name removal on both nodes; db-data 1 on both |
| Window, restart.sh/swarmpit.sh/--prune/default resolve-image, labels, raw logs, close-out push timing | judgment | **Resolved by the operator**: 28-UAT test 5 pass. The verifier's earlier non-authoritative verdict also found no violation. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase-modified files, incl. UAT and SECURITY) | — | TBD/FIXME/XXX | — | none |
| `.planning/ROADMAP.md` | 376 | footnote "25 requirements across 7 phases" | ℹ️ Info | stale creation-time note; REQUIREMENTS.md says 24 |
| `.planning/ROADMAP.md` | 81, 373 | Phase 28 still `[ ]` / "In Progress" | ℹ️ Info | expected; the orchestrator marks the phase complete after this report |
| `.claude/` | — | untracked and not gitignored; the skill file contains the manager ssh line | ℹ️ Info | already noted in 28-SECURITY; avoid `git add -A` |

### Human Verification Required

None open. The five items from the previous report are resolved:
1. **Core volume (D-14):** done. Live core count is 0.
2. **Skill text:** applied and verified locally.
3. **Tasks UI:** operator pass in UAT test 3.
4. **Rollback:** operator accepted it as un-drilled in UAT test 4, recorded as an override.
5. **Judgment prohibitions:** operator pass in UAT test 5.

### Gaps Summary

There are no gaps. Every roadmap success criterion was re-confirmed against live production in this run:
- Swarmpit is on 1.10 with stats off.
- The stack has only agent, app and db.
- `thinx_influxdb`, `swarmpit_db` and the agent are on their pre-phase tasks and digests.
- `swarmpit_influx-data` is gone from both nodes, and `swarmpit_db-data` is untouched on both.

A fourth autoredeploy on 1.10, triggered by the close-out push, landed in 75 s. The one behavior-dependent item, the un-drilled rollback, is carried by an explicit operator acceptance with its inputs re-verified live.

---

_Verified: 2026-10-05T13:45:00Z_
_Verifier: Claude (gsd-verifier)_
