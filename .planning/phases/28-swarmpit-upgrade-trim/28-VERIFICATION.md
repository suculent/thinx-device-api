---
phase: 28-swarmpit-upgrade-trim
verified: 2026-10-05T12:45:00Z
status: human_needed
score: 13/14 must-haves verified
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
covered_digest: "v2:sha256:5d0923ecd9a7f7d7507b5a337a123f16ddee7d7f2cf2a9fd22854f5ade15c283"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "ROADMAP SC3 (second half): each step can be rolled back from a stack snapshot taken before it"
    test: "Accept the rollback as un-drilled, or drill Step B rollback (cp the .p28-B-pre backup over swarmpit.yml, stack deploy --resolve-image changed) in a maintenance window"
    expected: "swarmpit_app returns to swarmpit/swarmpit:1.9, /version reports 1.9, autoredeploy still fires; swarmpit_db untouched"
    why_human: "No rollback was executed in Phase 28 (every gate passed first time). The inputs are proven present and hash-equal to the pre-step state, but a production rollback is a state transition only a real run demonstrates; the verifier may not mutate production. Since D-14, a Step A rollback brings back an empty InfluxDB by design."
human_verification:
  - test: "Remove core's leftover swarmpit_influx-data volume with the exact command in the runbook Annex row D-14 (through CORE_SSH, one host per call, exact name, never prune), then replace p28_d14_core=pending-operator with p28_d14_core=removed:<size> and the CreatedAt"
    expected: "0 containers reference the volume; after removal swarmpit_influx-data count 0 and swarmpit_db-data count 1 on core; swarmpit_db task isp4hjomiuzg still Running"
    why_human: "Core is reachable only through a different ssh host than the literal manager form; the operator held this as checkpoint:human-action. The verifier cannot read core's volume list from the manager."
  - test: "Apply the swarm-autopull-recovery SKILL.md text from 28-04-SUMMARY § 'Operator follow-up: skill text' (local, untracked file; do not commit)"
    expected: "grep -q 'Phase 28' .claude/skills/swarm-autopull-recovery/SKILL.md succeeds and git ls-files for it prints nothing"
    why_human: "Operator excluded this edit from the executor (classifier block). Currently the skill still has 0 'Phase 28' mentions and describes the 1.9 + InfluxDB warm-up for rung 1."
  - test: "Open https://swarmpit.thinx.cloud/#/tasks and a service detail page on Swarmpit 1.10"
    expected: "Tasks list loads for both nodes; live CPU/memory from swarmpit_agent shows; timeseries graphs read 'Statistics disabled' rather than erroring"
    why_human: "Visual UI check; D-12 keeps the agent because the operator monitors through this page. The verifier only saw HTTP 200 on the UI root."
  - test: "Accept or drill the un-exercised rollback path (see behavior_unverified_items)"
    expected: "Operator decision recorded"
    why_human: "Rollback inputs are present; the rollback itself was never run."
  - test: "Resolve the judgment-tier prohibitions of plans 28-01..28-04 (window 06:00-10:00 UTC respected, no restart.sh / swarmpit.sh / --prune / default --resolve-image, no node-label or thinx-stack label fixes, close-out not pushed inside the window, no raw swarmpit_app 1.10 log quoted)"
    expected: "Operator confirms; non-authoritative verifier verdict: no violation found (step starts 10:02, 11:01, 11:27, 12:25 UTC; recorded commands use --resolve-image changed; labels listed as follow-ups only; evidence is counts only)"
    why_human: "Judgment-tier prohibitions need explicit human resolution in interactive verify (ADR-550 D4)."
---

# Phase 28: Swarmpit Upgrade & Trim Verification Report

**Phase Goal:** Swarmpit is reduced to registry-triggered autoredeploy on 1.10. The stats stack is gone, the agent stays for the tasks UI, every deploy lands within the 5-minute SLA, `swarmpit_db` is untouched, and each step can be rolled back from a pre-step snapshot.
**Verified:** 2026-10-05T12:45:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

Evidence sources: the committed repo state, plus read-only checks run by the verifier at 12:33–12:40 UTC against production (manager over ssh, `docker service`/`docker inspect`/`docker volume ls`, the public `/version` endpoint) and against CircleCI's public job API. The SUMMARY claims were not taken as evidence. Every number below was re-read.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC1:** Swarmpit runs 1.10 in production, and a test push to thinx-staging produces a new `thinx_api` task within 5 minutes | ✓ VERIFIED | Live `/version`: `1.10-SNAPSHOT`, statistics false, API 1.44. Live spec `swarmpit/swarmpit:1.10@sha256:15c044a82fed…`. Gate B: CircleCI job 15705 (`api-registry`, thinx-staging, rev `b8f1bf15`, success) stopped at 11:36:44.11Z. `swarmpit_app` logged `autoredeploy fired` for thinx_api naming `f55fa456ca23` at 11:37:10.90Z. Task `ydaoq586u8v5` has Status.Timestamp 11:37:33.399Z and image digest `f55fa456ca23`, and is still the running thinx_api task. Delta 49–50 s, under 300 s. |
| 2 | **SC2:** With stats disabled and `swarmpit_influxdb` removed, a second test push still redeploys within 5 minutes, and `thinx_influxdb` keeps running unaffected | ✓ VERIFIED | `docker stack services swarmpit` lists agent, app and db only. The only influx service in the cluster is `thinx_influxdb`. App env is `DOCKER_API_VERSION`, `SWARMPIT_DB` and `SWARMPIT_DOCKER_API`, with no `SWARMPIT_INFLUXDB`. Gate A: CircleCI job 15697 (rev `fb7eceae`, success) stopped at 11:11:56.073Z. Task `1m5q66fvvpwz` carried digest `10682b0b5f4d`, and the Annex records Running at 11:12:26.606Z, so the delta is 31 s. `thinx_influxdb` task `lpl1pp201yyi` has been Running on core for 30 h, which predates the phase, and its only mount is `/mnt/gluster/thinx/influxdb2`. |
| 3 | **SC3a:** `swarmpit_db` is untouched: still couchdb 2.3.0, with the same volume and linked registry credentials | ✓ VERIFIED | Live spec `couchdb:2.3.0@sha256:ee75c9a737e7…`, which equals `p28_db_digest`. Task `isp4hjomiuzg` on core has run for 30 h with no newer task in `service ps`. Mounts are `volume:swarmpit_db-data` and the `couchdb-logging.ini` bind. Live `swarmpit` database has 7 rows: dockerhub 1, v2 1, migration 3, secret 1, user 1. That is the `p28_dump` breakdown, so the registry-credential doc is present and no migration doc was added. |
| 4 | **SC3b:** each step can be rolled back from a stack snapshot taken before it | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The inputs exist and match. The gluster backups `.p28-A-pre` (`2f84f4033868`) and `.p28-B-pre` (`d61396af4b36`) hash-equal the committed A.pre and B.pre snapshots. The committed influxdb conf copies hash `cd6b52c936bf` and `ad5da389aa0a`, as recorded. `swarmpit/swarmpit:1.9` still resolves on Docker Hub. The § Rollback recipes exist. No rollback was run, because every gate passed first time, so this goes to a human decision. By D-14 design, a Step A rollback now starts an empty InfluxDB. |
| 5 | Goal: `swarmpit_agent` is kept (D-12; OPS-SWARM-03 descoped) | ✓ VERIFIED | Live `swarmpit_agent` is global 2/2, tasks `bju4mnwpbuz3` (micro) and `tcrkflv13cge` (core), both Running 30 h. Digest `1306e2a2f538` equals `p28_agent_digest`. |
| 6 | Goal: every deploy in the phase stayed within the 5-minute SLA (gates 0, A, B) | ✓ VERIFIED | Gate 0: CircleCI job 15690 (rev `c53cc788`) stopped at 10:17:57.439Z, and task `zkz1kctc1y8s` carried the gate-0 digest `b9f5a9c21373`. Annex Running time is 10:18:28.164Z, so 31–32 s. Gate A is 31 s and Gate B is 50 s (rows 1 and 2). The CircleCI times and task digests were re-read independently. Rung 1 never ran. |
| 7 | D-02 engine gate: neither node on Engine 29.0–29.2, so the D-01 order (trim first) stands | ✓ VERIFIED | Live `docker node ls`: micro 29.8.1 and core 29.8.1. The Annex pre-flight row is dated 10:02, before the first gate push at 10:12. |
| 8 | D-12 docs: OPS-SWARM-03 is in Future Requirements with the reason; no v1.14 checkbox or traceability row; 24 total; ROADMAP SC and requirements line adjusted | ✓ VERIFIED | REQUIREMENTS.md line 66 reads "…still used for monitoring; the agent stays". Traceability has only OPS-SWARM-01 and -02. "v1.14 requirements: 24 total". ROADMAP line 328 reads "OPS-SWARM-03 descoped to Future Requirements, D-12", and there are three success criteria with no agent removal. |
| 9 | D-03/D-17: the stack file names the image by tag (no `@sha256`) and is the source of truth; snapshots chain A.pre → A.post = B.pre → B.post | ✓ VERIFIED | The live `swarmpit.yml` hash `0fd7d2c2de8d` equals the committed B.post. B.post has `image: swarmpit/swarmpit:1.10` and 0 `@sha256`. A.pre→A.post removes 25 lines and adds none (influx service, env, volume). A.post is byte-equal to B.pre. B.pre→B.post changes the version line (3.3→3.8) and the image line, and adds the six healthcheck lines. |
| 10 | 1.10 healthcheck override (start_period 300 s) is in place, both 1.44 pins are kept, and the app is stable with no restart loop | ✓ VERIFIED | Live spec healthcheck: `curl -fs http://localhost:8080`, Interval 60 s, Timeout 10 s, StartPeriod 300 s, Retries 5. Both 1.44 pins are present. The container is `healthy` with FailingStreak 0 and RestartCount 0. It started at 11:28:33Z, so it has held for over an hour, and task `e3qc53lt51jg` equals `p28_app_taskB`. |
| 11 | D-06: 1.10 did no schema migration in swarmpit_db | ✓ VERIFIED | `swarmpit_app` logs since 11:30Z have 0 matches for `Single node setup finished\|Change reg types finished\|Default token secret created`. The doc count and types are unchanged (row 3). |
| 12 | D-13: `swarmpit/influxdb.conf` and its `.bak` deleted after a 0-reference mount scan; copies kept | ✓ VERIFIED | Live `swarm/swarmpit/` contains only `couchdb-logging.ini`. Copies are committed in `swarm-configs/`, with 0 password/token/secret lines. |
| 13 | D-14: `swarmpit_influx-data` recorded, then removed by exact name on micro **and on core** (a copy exists there); `swarmpit_db-data` untouched | ? UNCERTAIN (operator action) | Micro is done. The live volume list on micro shows only `swarmpit_db-data`, and the pre-removal record (2022-02-11, 130M) is in the Annex. Core is not done: `p28_d14_core=pending-operator`, held as checkpoint:human-action because core needs a different ssh host. The verifier cannot see core's volumes from the manager. This is leftover disk with no service attached; it does not affect the running stack. |
| 14 | D-07 lifetime and docs: `/root/phase28` shredded; swarm.md rung 1 updated for 1.10 with no InfluxDB, rung 4 marked done with a link to the runbook; end-state section and follow-ups in the runbook | ✓ VERIFIED | Live `test -e /root/phase28` is false. swarm.md line 28 has the "Swarmpit 1.10 (JDK 17)" wait text and "Since Phase 28 the stack has no InfluxDB". Line 75 has "Rung 4 — Upgrade Swarmpit (done in Phase 28, 2026-10)" and links `swarmpit-upgrade.md`. The runbook has § "Phase 28 end state" with 7 follow-ups. |

**Score:** 13/14 truths verified (1 present but behavior-unverified, row 4; 1 uncertain pending operator action, row 13)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/runbooks/swarmpit-upgrade.md` | Runbook with conventions, gate procedure, Steps 0/A/B/C, rollback, Annex `p28_*` tokens | ✓ VERIFIED | 430 lines. Every token named by the plans is present once (`p28_gate0`, `p28_gateA`, `p28_gateB`, `p28_stepA`, `p28_stepB`, `p28_B_stable_min`, `p28_d14_removed`, `p28_d14_core`, `p28_shred`, …). The Annex values match the live digests and task IDs. |
| `.planning/runbooks/swarm-configs/README.md` | Snapshot naming and redaction entry for `swarmpit-stack.<step>.{pre,post}.yml` | ✓ VERIFIED | Lines 18 and 47 |
| `swarm-configs/swarmpit-stack.A.pre.yml` | Pre-trim stack (contains `SWARMPIT_INFLUXDB`) | ✓ VERIFIED | `2f84f4033868` = `p28_A_pre_sha` = live gluster `.p28-A-pre` |
| `swarm-configs/swarmpit-stack.A.post.yml` | App, db and agent only, 1.44 pins | ✓ VERIFIED | `d61396af4b36` |
| `swarm-configs/swarmpit-stack.B.pre.yml` | Equal to A.post, `swarmpit/swarmpit:1.9` | ✓ VERIFIED | byte-equal to A.post, and equal to live `.p28-B-pre` |
| `swarm-configs/swarmpit-stack.B.post.yml` | 1.10 by tag, 3.8, healthcheck | ✓ VERIFIED | `0fd7d2c2de8d` = live `swarmpit.yml` |
| `swarm-configs/swarmpit-influxdb*.A.pre.conf` | Copies of the deleted conf files | ✓ VERIFIED | 372 B and 188 B. Hashes match the Annex. No secret values. |
| `.planning/runbooks/swarm.md` | Rung 1/4 updated, Phase 28 | ✓ VERIFIED | see truth 14 |
| `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` | D-12 descope | ✓ VERIFIED | see truth 8 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| thinx-staging push (Gate B, `b8f1bf15`) | new thinx_api task | CircleCI `api-registry` → private registry → Swarmpit 1.10 autoredeploy | ✓ WIRED | job 15705 ended 11:36:44Z → `autoredeploy fired` 11:37:10.9Z naming the digest → task Running 11:37:33.4Z |
| thinx-staging push (Gate A, `fb7eceae`) | new thinx_api task | same, on trimmed 1.9 | ✓ WIRED | job 15697 → task `1m5q66fvvpwz`, digest `10682b0b5f4d` |
| thinx-staging push (Gate 0, `c53cc788`) | new thinx_api task | same, on unchanged 1.9 (`.planning`-only push builds the image, D-11a) | ✓ WIRED | job 15690 → task `zkz1kctc1y8s`, digest `b9f5a9c21373` |
| `swarmpit.yml` (gluster) | `swarmpit_app` live spec | `docker stack deploy --resolve-image changed` | ✓ WIRED | file hash = B.post. The spec carries the tag plus the resolved digest, the healthcheck and the pins. |
| `swarmpit_app` 1.10 | `swarmpit_db` registry-credential doc | CouchDB read (`SWARMPIT_DB=http://db:5984`) | ✓ WIRED | the v2 doc is present, and autoredeploy authenticates to the private registry, as Gate B proves |
| Annex `p28_stepB=PASS`, `p28_B_stable_min=10` | `docker volume rm swarmpit_influx-data` (micro) | precondition of the one-way task | ✓ WIRED (micro) / pending (core) | |
| swarm.md rung 1/4 | swarmpit-upgrade.md | link | ✓ WIRED | lines 44 and 75 |

### Data-Flow Trace (Level 4)

Not applicable. The phase changed ops state and docs and renders no dynamic data. The equivalent data flow, registry digest → Swarmpit poll → new task, is traced in Key Links.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Swarmpit version, stats off | `curl https://swarmpit.thinx.cloud/version` | `1.10-SNAPSHOT`, statistics false, api 1.44 | ✓ PASS |
| Swarmpit UI up | `curl -w %{http_code} https://swarmpit.thinx.cloud/` | 200 | ✓ PASS |
| API healthy on the gated image | `curl -w %{http_code} https://rtm.thinx.cloud/api/v2/csrf-token` | 200 | ✓ PASS |
| Swarmpit stack composition | `docker stack services swarmpit` (manager, read-only) | agent 2/2, app 1/1 (1.10), db 1/1 (couchdb:2.3.0) | ✓ PASS |
| Gate timings independent of the Annex | CircleCI v1.1/v2 public job API (15690, 15697, 15705) + `docker inspect <task>` | branch thinx-staging, revs c53cc788/fb7eceae/b8f1bf15, success; deltas 31–32 / 31 / 50 s | ✓ PASS |
| App health / no restart loop | `docker inspect` on the app container (micro) | healthy, streak 0, restarts 0 | ✓ PASS |
| No 1.10 migration writes | log grep count since 11:30Z | 0 | ✓ PASS |
| Core `swarmpit_influx-data` | needs the core ssh host | not run | ? SKIP (operator) |

### Probe Execution

Step 7c: SKIPPED. The phase declares no `scripts/*/tests/probe-*.sh`. The plan-level verify blocks (RUNBOOK-OK, D14-OK, …) are recorded in the SUMMARYs. The verifier did not re-run them; it re-derived the underlying facts from live state above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OPS-SWARM-01 | 28-01, 28-03, 28-04 | Swarmpit runs 1.10 in production and registry-triggered autoredeploy still completes within the 5-minute SLA | ✓ SATISFIED | truths 1, 6, 10 |
| OPS-SWARM-02 | 28-01, 28-02, 28-04 | Stats disabled, `swarmpit_influxdb` removed, `swarmpit/influxdb.conf` deleted with a copy in the Step A snapshot; autoredeploy verified by a test push | ✓ SATISFIED | truths 2, 12. The core volume leftover (truth 13) is outside the requirement text. |
| OPS-SWARM-03 | 28-01 (listed in `requirements:`) | `swarmpit_agent` removed | ACCOUNTED: descoped (D-12) | In REQUIREMENTS.md Future Requirements with the reason, no v1.14 traceability row, agent intentionally kept (truth 5) |

Orphaned requirements: none. REQUIREMENTS.md maps only OPS-SWARM-01 and -02 to Phase 28, and both are claimed by plans.

### Prohibitions (plan `must_haves.prohibitions`)

| Prohibition (abridged) | Tier | Verifier finding |
|---|---|---|
| No host, key name or port in committed runbook, README, snapshots or SUMMARYs | automated | 0 hits in the runbooks, snapshots and 28-0x-SUMMARY files. (Info: `28-CONTEXT.md`, committed at discuss time, quotes the manager ssh form. That file is outside the prohibition's list, and tracked `AGENTS.md` already carries the same line.) |
| No pushed commit outside `.planning/`, no `[skip ci]`, nothing to main | automated | `git diff --name-only c5d5be46..HEAD` outside `.planning/`: 0. skip-ci in messages: 0. All 22 phase commits are `%G?`=G. `origin/thinx-staging` equals HEAD. |
| db/agent blocks, pins, `swarmpit_db` image, volume and placement unchanged | automated | live digests and task IDs equal Step 0. The db/agent blocks are identical across all snapshots. |
| `swarmpit_influx-data` not removed before Gate B + 10 min | automated | Annex: removal at 12:26Z, after `p28_stepB=PASS` (11:37Z) and the stability read (11:38Z, 10 min since deploy) |
| No `@sha256` in the stack file | automated | 0 |
| No prune or pattern volume removal; `swarmpit_db-data` untouched | automated | `swarmpit_db-data` still present on micro, and in use on core by the running db task |
| Window 06:00–10:00 UTC, no restart.sh/swarmpit.sh/--prune/default resolve-image, labels not fixed, no raw log quoted, close-out not pushed in window | judgment | Non-authoritative verdict: no violation found. Routed to human resolution (human_verification item 5). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all phase-modified files) | — | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | — | none found |
| `.planning/ROADMAP.md` | 376 | footnote still says "25 requirements across 7 phases" | ℹ️ Info | stale creation-time note. REQUIREMENTS.md and the Phase 28 section correctly read 24. |
| `.planning/ROADMAP.md` | 81, 373 | Phase 28 still `[ ]` / "In Progress" | ℹ️ Info | expected until this verification closes the phase |
| `.planning/phases/28-swarmpit-upgrade-trim/28-CONTEXT.md` | 45 | manager ssh form quoted | ℹ️ Info | pre-dates execution, outside the prohibition's file list, and the same content is already in tracked AGENTS.md |

No code changed (`.planning/`-only phase), so no stub patterns apply.

### Human Verification Required

#### 1. Core `swarmpit_influx-data` removal (D-14, checkpoint:human-action)

**Test:** Run the Annex D-14 core command through `CORE_SSH`. It does a reference count, then CreatedAt and size, then removal by exact name, then counts. Then update `p28_d14_core`.
**Expected:** 0 references. Afterwards `swarmpit_influx-data` 0 and `swarmpit_db-data` 1 on core. The swarmpit_db task is unchanged.
**Why human:** Core needs a different ssh host, which the operator reserved for a human run.

#### 2. swarm-autopull-recovery skill text (local, untracked)

**Test:** Apply the four edits listed in 28-04-SUMMARY § "Operator follow-up: skill text".
**Expected:** The skill mentions Phase 28 and gives the 1.10 rung-1 wait. The file stays untracked.
**Why human:** The operator excluded this from the executor. It currently has 0 "Phase 28" mentions and still describes the 1.9 + InfluxDB warm-up. That is stale operator guidance, but swarm.md (tracked) is correct.

#### 3. Swarmpit 1.10 tasks UI

**Test:** Open `https://swarmpit.thinx.cloud/#/tasks` and one service detail page.
**Expected:** Tasks for both nodes, live agent CPU/memory, and timeseries showing "Statistics disabled" without errors.
**Why human:** Visual check. This is the reason D-12 keeps the agent.

#### 4. Rollback path (behavior-unverified)

**Test:** Accept the rollback as un-drilled, or drill Step B rollback in a window.
**Expected:** Operator decision recorded.
**Why human:** The inputs are verified present and matching. The verifier must not mutate production.

#### 5. Judgment-tier prohibitions

**Test:** Confirm the five judgment-only prohibitions listed above.
**Expected:** Operator confirms. The verifier found no evidence of a violation.
**Why human:** ADR-550 D4. An LLM verdict is non-authoritative.

### Gaps Summary

There are no blocking gaps. Every roadmap success criterion's observable state was confirmed against live production, independently of the SUMMARYs:
- `/version` reports 1.10 with stats off.
- `swarmpit_influxdb` is gone.
- The agent and `swarmpit_db` have the same tasks and digests as before the phase.
- All three gate deltas (32/31/50 s) were re-derived from CircleCI's public job API and `docker inspect` of the gate tasks.

The remaining items need operator action or judgment:
- the core-side copy of the InfluxDB volume (leftover disk, not running state);
- the local skill text;
- a UI eyeball check;
- acceptance of an un-drilled rollback path.

---

_Verified: 2026-10-05T12:45:00Z_
_Verifier: Claude (gsd-verifier)_
