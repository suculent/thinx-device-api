---
phase: 03-swarm-auto-pull
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/03-swarm-auto-pull/03-BASELINE.txt
  - .planning/phases/03-swarm-auto-pull/03-PUSH-OBSERVE.txt
  - .planning/phases/03-swarm-auto-pull/03-SUMMARY.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - AGENTS.md
  # NOTE: This phase's primary "change" is OPERATIONAL (live swarm state on
  # 188.166.23.244). Code-side commits in this monorepo may be zero (rung 1
  # outcome) or limited to an AGENTS.md runbook line + STATE/ROADMAP/REQ
  # bookkeeping. The artifacts above are the in-repo paper trail; the actual
  # repair lives outside the source tree.
autonomous: false  # Rungs 2, 3, 4 are gated by checkpoint:human-verify
requirements:
  - OPS-01
user_setup:
  - service: swarm-host-ssh
    why: "Operational diagnosis + restoration of swarmpit_app on the production swarm host"
    env_vars: []
    dashboard_config:
      - task: "SSH access to root@188.166.23.244:2020 with key ~/.ssh/DOKey2"
        location: "Local machine — key already present per Phase 1 + 2 deploys"
      - task: "Read access to /mnt/gluster/deployment/swarm on the swarm host"
        location: "Used by ./restart.sh — must remain functional after any swarmpit edits"

must_haves:
  truths:
    - "swarmpit_app responds with HTTP 200 (not Bad Gateway) at https://swarmpit.thinx.cloud — UI restored or, if UI is intentionally left offline, swarmpit_app's internal logs show active autoredeploy decisions every poll interval"
    - "swarmpit_app's recent logs (--since 5m after fix) are non-empty — the watcher process is alive and emitting"
    - "A NEW no-op commit pushed to thinx-staging AFTER the swarmpit fix triggers a rolling thinx_api task on the swarm within 5 minutes of the new image digest landing in Docker Hub, with NO operator invocation of ./restart.sh during the test window"
    - "The currently-deployed thinx_api image SHA changes from the pre-test baseline (currently 3a461b3d) to the post-test new SHA, observable via `docker service inspect thinx_api`"
    - "./restart.sh on the swarm host still works as the manual escape hatch — verified by a dry-inspection (not a real invocation) of its filesystem path and a no-op call to its first checkpoint"
    - "The root cause of the 2026-05-25 14:44 CEST silent-watcher incident is documented in 03-SUMMARY.md, matched to the rung whose fix landed (not just 'we restarted it')"
    - "A reversion plan specific to the landed fix exists in 03-SUMMARY.md — operator can undo it without inventing rollback steps in the moment"
    - "OPS-01 is marked Verified in REQUIREMENTS.md, ROADMAP.md, and STATE.md with a date stamp of 2026-05-26 (or the actual close-out date)"
  artifacts:
    - path: ".planning/phases/03-swarm-auto-pull/03-BASELINE.txt"
      provides: "Snapshot of live swarm state at execution start (drift check against 03-CONTEXT.md's <live_findings>)"
    - path: ".planning/phases/03-swarm-auto-pull/03-PUSH-OBSERVE.txt"
      provides: "Wall-clock evidence of the push-and-observe SLA test — t0 (registry digest change), t1 (new swarm task created), t2 (new task Running), pass/fail verdict"
    - path: ".planning/phases/03-swarm-auto-pull/03-SUMMARY.md"
      provides: "Root cause + which rung landed + reversion plan + runbook line + verification matrix"
    - path: "AGENTS.md"
      provides: "New runbook line documenting the swarmpit silent-watcher symptom + recovery command (the default for the runbook-line decision; operator may redirect to .planning/runbooks/swarm.md during Task 6)"
  key_links:
    - from: "swarmpit_app service on swarm host"
      to: "thinx_api service rolling update via swarmpit.service.deployment.autoredeploy=true label"
      via: "Swarmpit watcher polling Docker Hub for thinxcloud/api:latest digest changes"
      pattern: "docker service ps thinx_api shows new task with NEW image SHA within 5 min of Docker Hub digest change"
    - from: ".planning/phases/03-swarm-auto-pull/03-SUMMARY.md"
      to: "REQUIREMENTS.md OPS-01 row"
      via: "Cross-reference + 'Verified 2026-05-26' marker"
      pattern: "OPS-01.*Verified"
    - from: "AGENTS.md (or .planning/runbooks/swarm.md)"
      to: "operator recovery procedure for next silent-watcher recurrence"
      via: "single command + symptom signature documented inline"
      pattern: "swarmpit_app.*service update --force|silent.*watcher"
---

<objective>
Diagnose and restore swarm-side auto-redeploy on `188.166.23.244` so that a CircleCI push of `thinxcloud/api:latest` results in a rolling `thinx_api` task within 5 minutes, without requiring the manual `./restart.sh` workaround. This closes OPS-01 — the last operational v1 GA blocker before Phase 4 (Dependency Triage).

Purpose: Phase 3 is **operational**, not source-code. The pre-investigation in `03-CONTEXT.md` already narrowed the root cause to a degraded `swarmpit_app` (Bad Gateway via Traefik + 2+ hours of zero application logs + 30 hours of zero autoredeploy log lines). This plan executes a locked 4-rung investigation ladder (restart → DB rebuild → stale-node cleanup → Swarmpit upgrade), escalates on failure instead of chaining, and produces a documented root cause + reversion plan + runbook line as the close-out deliverable.

Output:
- `03-BASELINE.txt` — drift-check snapshot at execution start
- `03-PUSH-OBSERVE.txt` — wall-clock evidence of the SLA test
- `03-SUMMARY.md` — root cause + landed rung + reversion plan + runbook line + verification matrix
- AGENTS.md update (default) OR `.planning/runbooks/swarm.md` (alternate, operator choice during Task 6)
- STATE.md / ROADMAP.md / REQUIREMENTS.md marked OPS-01 Verified
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-swarm-auto-pull/03-CONTEXT.md
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/codebase/CONCERNS.md
@.planning/phases/01-auth-api-password-reset/01-SUMMARY.md
@.planning/phases/02-pii-logging-scrub/02-SUMMARY.md
@AGENTS.md

<environment_notes>
- This is a Vue/Node repo with flat phase dirs (.planning/phase-N/ historically; this project uses .planning/phases/NN-name/). gsd-sdk validators may not handle the layout — fall back to direct file ops if the SDK errors.
- All commits MUST be `--no-gpg-sign` (memory `unsigned-commits-260526`).
- Commit subject prefix MUST be one of `chore:` / `fix:` / `docs:` (parent commitlint). NEVER `plan:`, `ops:`, `phase:`.
- Deploy script: `/mnt/gluster/deployment/swarm/restart.sh` per memory `swarm-deploy-script-name` and AGENTS.md L19.
- Every ssh invocation MUST include `-i ~/.ssh/DOKey2 -p 2020` (Phase 1 plan-check W-04 lesson).
- Today's date: 2026-05-26.
</environment_notes>

<interfaces>
<!-- Operational interfaces the executor will use. NOT code interfaces. -->

SSH connection string (use this EXACT form):
```
ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "<command>"
```

Key diagnostic commands (run via ssh):
```
# Service status
docker service ls --filter "name=swarmpit"
docker service ps thinx_api --no-trunc

# Image SHA verification
docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'

# Application logs
docker service logs swarmpit_app --since 5m --tail 100
docker service logs swarmpit_app --since 2h --tail 100

# Registry digest probe (does NOT pull, just resolves)
docker pull -q thinxcloud/api:latest 2>&1 | tail -1

# Service force-restart (rung 1 fix)
docker service update --force swarmpit_app

# Service rollback (rung 1 reversion)
docker service rollback swarmpit_app

# Stale node removal (rung 3 fix)
docker node rm <node-id>

# Stack deploy script (escape hatch — verify path, do NOT invoke for fix)
ls -la /mnt/gluster/deployment/swarm/restart.sh
```

Known baseline values (from 03-CONTEXT.md `<live_findings>`, captured ~2026-05-26 17:00 UTC):
- Currently-deployed thinx_api image: `thinxcloud/api:latest@sha256:3a461b3d6e3690e1be65740702559edda533b7c5b29e70ca8926fe8a4f565d94`
- Last-known fresh Docker Hub digest: `sha256:950043b4d40ef24673030cbf2fde2677bab2b6d433788d7b452223cbe6fde211` (NEWER than deployed — proof autoredeploy is broken)
- swarmpit_app: 1/1 RUNNING, Up 24+ hours, image `swarmpit/swarmpit:1.9`
- swarmpit.thinx.cloud: returns `Bad Gateway` via Traefik
- Stale memberlist peer (rung 3 candidate): `b356ad8e1d60` / `10.133.0.4`

Push-and-observe SLA target: NEW thinx_api task transitioning Running with NEW image SHA within **5 minutes** of Docker Hub digest change, with NO operator invocation of `./restart.sh` during the test window.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Re-confirm baseline state via SSH probe</name>
  <files>.planning/phases/03-swarm-auto-pull/03-BASELINE.txt</files>
  <action>
SSH to the swarm host and capture the current state of swarmpit_app, thinx_api, and the Docker Hub `thinxcloud/api:latest` digest. The 03-CONTEXT.md `<live_findings>` snapshot was taken ~2026-05-26 17:00 UTC; verify nothing material has drifted before applying Rung 1's fix.

Commands to run (all via `ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "<cmd>"`), capturing stdout+stderr to `03-BASELINE.txt`:

1. `date -u` — wall-clock anchor
2. `docker service ls --filter "name=swarmpit"` — confirm all swarmpit_* services running
3. `docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` — current deployed image SHA (expect `sha256:3a461b3d...`)
4. `docker pull -q thinxcloud/api:latest 2>&1 | tail -1` — current Docker Hub digest (expect NEWER than deployed — likely `950043b4` or even newer if CI has run since 17:00 UTC)
5. `docker service logs swarmpit_app --since 2h --tail 100 2>&1 | wc -l` — confirm zero or near-zero log output (expect 0)
6. `curl -s -o /dev/null -w "%{http_code}\n" https://swarmpit.thinx.cloud` — confirm Bad Gateway (expect 502 or 503)
7. `ls -la /mnt/gluster/deployment/swarm/restart.sh` — confirm escape hatch present
8. `docker node ls` — confirm 2-node topology (micro Leader + core Reachable)

Write the captured output to `.planning/phases/03-swarm-auto-pull/03-BASELINE.txt` (locally — the file is in this monorepo, not on the swarm). Prepend a one-line summary stating whether facts match 03-CONTEXT.md (`DRIFT: none` / `DRIFT: <description>`).

If DRIFT is non-empty AND material (e.g., swarmpit_app has restarted spontaneously, or the deployed thinx_api image already changed to a fresh SHA), STOP and surface to orchestrator — the locked rung-1 hypothesis may no longer apply.

Do NOT execute any state-changing commands in this task. Read-only probe.
  </action>
  <verify>
    <automated>test -s .planning/phases/03-swarm-auto-pull/03-BASELINE.txt && grep -q "DRIFT:" .planning/phases/03-swarm-auto-pull/03-BASELINE.txt</automated>
  </verify>
  <done>`03-BASELINE.txt` exists, is non-empty, contains all 8 probe outputs, has a leading `DRIFT:` line. If DRIFT was material, task has surfaced to orchestrator instead of proceeding.</done>
</task>

<task type="auto">
  <name>Task 2: Rung 1 — Force-restart swarmpit_app cleanly</name>
  <files>.planning/phases/03-swarm-auto-pull/03-BASELINE.txt</files>
  <action>
Apply the smallest possible fix: force a clean restart of swarmpit_app via Docker Swarm's service update mechanism. This re-rolls the task without changing image/config — equivalent to a graceful process restart from within the swarm fabric.

Sequence (all via SSH):

1. Capture pre-restart task ID: `docker service ps swarmpit_app --no-trunc --format "{{.ID}} {{.CurrentState}}"` → record in `03-BASELINE.txt`
2. Trigger the restart: `docker service update --force swarmpit_app`
3. Wait for new task to be Running. Poll every 10 seconds for up to 90 seconds:
   ```
   docker service ps swarmpit_app --format "{{.ID}} {{.CurrentState}}" | head -3
   ```
   PASS when a new task ID (different from pre-restart) shows `Running` state.
4. Verify HTTP responds: `curl -s -o /dev/null -w "%{http_code}\n" https://swarmpit.thinx.cloud` — expect 200 (or 302/401 redirect to login — anything BUT 502/503/Bad Gateway).
5. Verify the watcher is alive: `docker service logs swarmpit_app --since 1m --tail 50` — expect NON-EMPTY output (startup banner + first poll cycle).
6. Append all of the above (commands, timestamps, observed values, PASS/FAIL per check) to `03-BASELINE.txt` under a `## Rung 1 Application` section.

**Reversion (apply ONLY if Rung 1 made things worse):** If after step 3 the new task is in `Failed` state, or step 4 returns 5xx, or step 5's logs show explicit errors (panic / unhandled exception / connection refused on swarmpit_db), execute the rollback:
```
docker service rollback swarmpit_app
```
Wait for the rolled-back task to be Running. Append a `## Rung 1 ROLLED BACK` section to `03-BASELINE.txt` capturing the failure mode + rollback timestamp. Then surface to orchestrator — do NOT silently escalate to Task 4. Per Phase 1 + 2 lesson "escalate-not-chain".

**Critical guardrail:** This task touches `swarmpit_app` ONLY. Do NOT touch `thinx_api`, `swarmpit_agent`, `swarmpit_db`, or `swarmpit_influxdb`. If post-restart the swarmpit_agent containers appear unhealthy as a side effect, capture but do NOT attempt to repair them in this task — that's potentially Rung 3 territory.
  </action>
  <verify>
    <automated>grep -q "## Rung 1 Application" .planning/phases/03-swarm-auto-pull/03-BASELINE.txt && (grep -q "PASS" .planning/phases/03-swarm-auto-pull/03-BASELINE.txt || grep -q "Rung 1 ROLLED BACK" .planning/phases/03-swarm-auto-pull/03-BASELINE.txt)</automated>
  </verify>
  <done>swarmpit_app new task is Running OR rollback was applied and orchestrator was surfaced to. `03-BASELINE.txt` documents the outcome including timestamps and post-restart HTTP status code.</done>
</task>

<task type="auto">
  <name>Task 3: Push-and-observe SLA test (THE acceptance gate for OPS-01)</name>
  <files>.planning/phases/03-swarm-auto-pull/03-PUSH-OBSERVE.txt</files>
  <action>
This is THE acceptance test for OPS-01 per ROADMAP §3 success criterion 2. It MUST be run AFTER Rung 1's restart succeeded (Task 2 PASS), using a NEW no-op commit specifically created for this test (NOT the commit that deployed the fix).

Sequence:

1. **Create the test commit (LOCAL repo, this monorepo, branch `thinx-staging`):**
   - Make a no-op edit to a doc file. Suggested target: append a single comment line `<!-- OPS-01 push-observe test 2026-05-26 -->` to the BOTTOM of `.planning/phases/03-swarm-auto-pull/03-BASELINE.txt` (the file already exists from Task 1). This is intentionally a non-source file so it cannot fail CI on lint/test rules.
   - Stage + commit + push:
     ```
     git add .planning/phases/03-swarm-auto-pull/03-BASELINE.txt
     git commit --no-gpg-sign -m "chore(ops-01): push-observe SLA test marker 2026-05-26"
     git push origin thinx-staging
     ```
   - Record the local push timestamp as `t_push` in `03-PUSH-OBSERVE.txt`.

2. **Wait for CircleCI to build + push image to Docker Hub:**
   - Poll Docker Hub every 30 seconds via the swarm host:
     ```
     ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 \
       "docker pull -q thinxcloud/api:latest 2>&1 | tail -1"
     ```
   - Record the digest from Task 1's baseline as `digest_pre` (e.g., `sha256:950043b4...`).
   - PASS condition for this step: a NEW digest (different from `digest_pre`) appears. Record this as `digest_new` and the wall-clock moment as `t0` (the **registry-side anchor** for the SLA timer).
   - Timeout: 20 minutes (CircleCI typically takes 5-12 min). If 20 min elapses with no new digest, the test is INCONCLUSIVE — surface to orchestrator (CI may be broken; not Phase 3's fault).

3. **Observe the swarm for autoredeploy:**
   - From `t0`, poll every 30 seconds via SSH:
     ```
     docker service ps thinx_api --no-trunc --format "{{.ID}} {{.Image}} {{.CurrentState}}" | head -5
     ```
   - PASS condition: a NEW thinx_api task appears (new task ID) with image SHA matching `digest_new`, and transitions to `Running` state. Record:
     - `t1` = moment new task ID first appears
     - `t2` = moment new task reaches `Running`
     - `task_id_pre` and `task_id_new`
   - PASS verdict: `t2 - t0 <= 5 minutes` (300 seconds).
   - FAIL verdict: 6+ minutes elapse with no new task, OR new task appears but fails to reach Running.

4. **During the test window (between `t_push` and `t2`), do NOT invoke `./restart.sh`.** The point is to verify Swarmpit handles it autonomously.

5. **Capture in `03-PUSH-OBSERVE.txt`:**
   - All wall-clock timestamps (`t_push`, `t0`, `t1`, `t2`)
   - `digest_pre`, `digest_new`, `task_id_pre`, `task_id_new`
   - `t2 - t0` delta in seconds
   - Final verdict: ONE of `PASS (delta=<N>s)`, `FAIL (reason=<...>)`, or `INCONCLUSIVE (reason=<CI broken | registry unreachable | external infra failure>)`. INCONCLUSIVE is reserved for cases where the test could not be conducted through no fault of the Rung-1 fix (e.g., CircleCI down during the 20-min wait window, Docker Hub unreachable). Differentiates a real Rung-1 failure from external infra noise.

6. **On PASS:** Proceed to Task 7 (close-out). Task 3 is sufficient evidence to close OPS-01.

7. **On FAIL:** STOP. Surface to orchestrator with the captured `03-PUSH-OBSERVE.txt` evidence. The orchestrator will decide whether to advance to Task 4 (Rung 2 — DB rebuild). Per "escalate-not-chain" rule (Phase 1 + 2 lesson), do NOT silently auto-advance.

8. **On INCONCLUSIVE:** STOP. Surface to orchestrator with the diagnostic detail (which external system was down, when, what was observed). Do NOT escalate to Rung 2 — Rung-1's fix may already be correct; the test just couldn't complete. Operator decides whether to re-run Task 3 once the external system recovers, OR mark Phase 3 as conditionally-Verified with the limitation documented. Do NOT silently advance.

**Critical guardrail (live reversion for thinx_api):** If the autoredeploy DOES fire but the new thinx_api task fails to start (image bad, missing env, healthcheck fails), the swarm will keep the old task running by default — production is NOT disrupted. Do NOT manually intervene. Capture the failure mode and proceed to Task 4's checkpoint. The `./restart.sh` escape hatch remains available if the user needs a manual recovery.
  </action>
  <verify>
    <automated>test -s .planning/phases/03-swarm-auto-pull/03-PUSH-OBSERVE.txt && grep -qE "Final verdict: (PASS|FAIL|INCONCLUSIVE)" .planning/phases/03-swarm-auto-pull/03-PUSH-OBSERVE.txt</automated>
  </verify>
  <done>`03-PUSH-OBSERVE.txt` contains all 4 wall-clock timestamps, both digests, both task IDs, delta seconds, and a `Final verdict: PASS|FAIL|INCONCLUSIVE` line. On PASS → next task is Task 7. On FAIL → orchestrator notified, next task is Task 4. On INCONCLUSIVE → orchestrator notified; no auto-escalation (Rung-1 fix may already be correct).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Rung 2 fallback (CONDITIONAL) — Rebuild swarmpit_db</name>
  <what-built>
This is a CONDITIONAL task. Execute ONLY if Task 3 ended in `Final verdict: FAIL`.

**Pre-action operator approval required** because:
- `swarmpit_db` rebuild loses Swarmpit's internal history (task event log, watcher state). Acceptable for v1 GA scope per 03-CONTEXT.md `<decisions>` rung 2 entry, but operator should consciously approve before applying.
- The rebuild affects the live swarmpit stack; while `thinx_api` is unaffected, the swarmpit UI will be offline briefly.

What the executor will do once approved:

1. Backup current swarmpit_db data (best-effort):
   ```
   ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "docker ps --filter 'label=com.docker.swarm.service.name=swarmpit_db' --format '{{.ID}}' | head -1"
   # → use the container ID to dump _all_docs
   ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "docker exec <db-container-id> curl -s http://localhost:5984/_all_dbs > /tmp/swarmpit_db_backup_$(date +%Y%m%d_%H%M).json"
   ```
   If the backup command fails (CouchDB internal port not exposed, container architecture differs), capture the failure but proceed — backup is best-effort, not gating.

2. Stop swarmpit_app: `docker service scale swarmpit_app=0`
3. Remove swarmpit_db's task: `docker service update --force swarmpit_db` followed by removing its volume (Swarmpit will re-derive state on first boot per Swarmpit's documented recovery path).
4. Restart swarmpit_app: `docker service scale swarmpit_app=1`
5. Wait for new task Running; verify HTTP 200 from https://swarmpit.thinx.cloud.
6. Re-run Task 3's push-and-observe test (use a SECOND no-op commit — a new marker line below the first).
7. Append outcomes to `03-PUSH-OBSERVE.txt` under a `## Rung 2 Re-test` section.

**Reversion:** If swarmpit_db rebuild leaves swarmpit_app in a worse state (won't boot, agent containers can't connect), the operator can restore the backed-up _all_docs JSON via a CouchDB POST, OR — escape hatch — accept that swarmpit is down and continue using `./restart.sh` manually for v1 GA. Document the state in `03-PUSH-OBSERVE.txt` either way.
  </what-built>
  <how-to-verify>
**ONLY proceed with this task if Task 3 FAILED.** If Task 3 PASSED, skip Task 4 entirely and advance to Task 7.

If Task 3 failed, the operator MUST review:
1. `03-PUSH-OBSERVE.txt` — what specifically failed? (No new task at all → swarmpit silent again; new task but stuck Pending → image/swarm fabric issue; new task crashes → image regression.)
2. Acknowledge that swarmpit_db rebuild loses internal history.
3. Decide whether NOW (production-impact window) is the right time, or schedule for off-hours.

Approve with `proceed-rung-2` to execute the rebuild. Approve with `skip-to-rung-3` to bypass DB rebuild (if operator believes the failure mode is membership-related, not DB-related). Reject with `abort` to stop the phase and ship v1 GA with the manual `./restart.sh` workaround documented as the operator action (OPS-01 then becomes v1.x-deferred).
  </how-to-verify>
  <resume-signal>Type `proceed-rung-2`, `skip-to-rung-3`, or `abort`</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: Rung 3 fallback (CONDITIONAL) — Stale node membership cleanup</name>
  <what-built>
This is a CONDITIONAL task. Execute ONLY if Tasks 3 AND 4 both failed OR operator approved `skip-to-rung-3` at Task 4.

**Pre-action operator approval required** because:
- Affects the live swarm fabric, not just the swarmpit tooling stack. Risk of disrupting thinx_api production traffic if the stale node removal is mis-applied.
- Per 03-CONTEXT.md `<deferred>` rung-3 caveat: "Risk of breaking the running swarm; ONLY do it on weekend / low-traffic window."

What the executor will do once approved:

1. Confirm the stale node ID `b356ad8e1d60` / IP `10.133.0.4` per 03-CONTEXT.md `<live_findings>` is STILL present in `docker info` output but NOT in `docker node ls`:
   ```
   ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "docker info 2>&1 | grep -A 5 'Nodes:'"
   ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "docker node ls"
   ```
2. If confirmed stale: force-remove via `docker node rm b356ad8e1d60` (note: this command requires the node to first be down per Docker docs; if it's already absent from `docker node ls`, this may be a no-op or may require `docker swarm leave --force` on a manager).
3. Verify memberlist gossip timeouts cease (check 5-minute window post-cleanup):
   ```
   ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "journalctl -u docker --since '5 minutes ago' | grep -c 'memberlist.*timeout'"
   ```
   Expect 0 (or substantially reduced from pre-cleanup baseline).
4. Restart swarmpit_app once more (`docker service update --force swarmpit_app`) to give the watcher a fresh fabric view.
5. Re-run Task 3's push-and-observe test with a THIRD no-op commit marker.
6. Append outcomes to `03-PUSH-OBSERVE.txt` under a `## Rung 3 Re-test` section.

**Reversion:** Removing a node from `docker node ls` is irreversible at the node-removal level (the node would have to rejoin via `docker swarm join` — but the stale entry never had a real backing host). If post-cleanup the swarm starts behaving strangely on the surviving managers (Leader election thrash, replication lag), the safest reversion is to do nothing — the stale entry was a phantom, removing it cannot have been the cause of new misbehavior. Investigate independently. Document the state either way.
  </what-built>
  <how-to-verify>
**ONLY proceed if Task 4 failed (or was skipped via `skip-to-rung-3`).**

Operator MUST review:
1. The accumulated evidence in `03-PUSH-OBSERVE.txt` (Rung 1 + Rung 2 outcomes).
2. Whether the swarm host's current load window is low-traffic (weekend / night / scheduled maintenance OK; mid-day production peak NOT OK).
3. Whether the team can tolerate a brief swarm fabric perturbation.

Approve with `proceed-rung-3`, downgrade with `skip-to-rung-4` (jump straight to Swarmpit upgrade), or `abort` (ship v1 GA with manual workaround).
  </how-to-verify>
  <resume-signal>Type `proceed-rung-3`, `skip-to-rung-4`, or `abort`</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 6: Rung 4 fallback (CONDITIONAL) — Upgrade Swarmpit 1.9 → latest</name>
  <what-built>
This is a CONDITIONAL task. Execute ONLY if Tasks 3+4+5 all failed OR operator approved `skip-to-rung-4` at Task 5.

**Pre-action operator approval required** — heaviest of all rungs. Swarmpit 1.9 has been running since at least the pre-investigation snapshot; bumping to latest (1.10+ or the current maintained release) may introduce new failure modes (data migration on first boot, API changes, env var renames).

What the executor will do once approved:

1. Identify the latest released Swarmpit version: `curl -s https://api.github.com/repos/swarmpit/swarmpit/releases/latest | grep -m1 tag_name`. Pin to a SPECIFIC version tag (NOT `latest`), e.g., `swarmpit/swarmpit:1.10` or whatever is current at execution time.
2. Locate `docker-swarm.yml` on the swarm host (under `/mnt/gluster/deployment/swarm/`).
3. Update the swarmpit_app service's image line to the pinned version.
4. Apply the change: `docker stack deploy -c docker-swarm.yml <stack-name>` (the stack name is whatever was originally used — check via `docker stack ls`).
5. Wait for the new swarmpit_app task to be Running; Swarmpit will perform any schema migrations against swarmpit_db automatically on first boot.
6. Verify HTTP 200 at swarmpit.thinx.cloud.
7. Re-run Task 3's push-and-observe test with a FOURTH no-op commit marker.
8. Append outcomes to `03-PUSH-OBSERVE.txt` under a `## Rung 4 Re-test` section.

**Reversion:** Pin docker-swarm.yml back to `swarmpit/swarmpit:1.9` and re-apply via `docker stack deploy`. The swarmpit_db may have been schema-migrated and may not roll back cleanly — if 1.9 won't boot post-upgrade-attempt, fall back to the swarmpit_db rebuild from Task 4 (the operator now has a backup from that task if it was executed).

**Final fallback (Path C from 03-CONTEXT.md `<domain>`):** If Rungs 1-4 all fail, document `./restart.sh` as the canonical operator action in AGENTS.md, mark OPS-01 as `v1.x-deferred` in REQUIREMENTS.md (NOT Verified), and ship v1 GA with the manual workaround. This is the documented exit per 03-CONTEXT.md `<decisions>` D-04.
  </what-built>
  <how-to-verify>
**ONLY proceed if Task 5 failed (or was skipped via `skip-to-rung-4`).**

Operator MUST review:
1. The latest Swarmpit release notes for breaking changes between 1.9 and current.
2. Whether the swarmpit_db backup from Task 4 (if executed) is recoverable.
3. Whether shipping v1 GA with the manual `./restart.sh` workaround is acceptable instead of taking on the upgrade risk.

Approve with `proceed-rung-4` (execute the upgrade), or `abort-defer-to-v1x` (ship v1 GA with manual workaround, OPS-01 becomes v1.x-deferred per Path C).
  </how-to-verify>
  <resume-signal>Type `proceed-rung-4` or `abort-defer-to-v1x`</resume-signal>
</task>

<task type="auto">
  <name>Task 7: Phase close-out — SUMMARY + bookkeeping + runbook line</name>
  <files>
    .planning/phases/03-swarm-auto-pull/03-SUMMARY.md
    .planning/STATE.md
    .planning/ROADMAP.md
    .planning/REQUIREMENTS.md
    AGENTS.md
  </files>
  <action>
This task ALWAYS runs at the end of the phase. The exact form of the close-out depends on which rung produced the PASS verdict (or whether the phase was deferred to v1.x via Task 6's `abort-defer-to-v1x` path).

**Case A — Rung 1, 2, 3, or 4 produced PASS (OPS-01 closed):**

1. Write `.planning/phases/03-swarm-auto-pull/03-SUMMARY.md` following the structure of `phases/02-pii-logging-scrub/02-SUMMARY.md`:
   - Frontmatter: `phase: 03-swarm-auto-pull`, `status: complete`, `verified: 2026-05-26`, `requirements: [OPS-01]`, `verification:` describes the push-observe SLA test PASS + which rung landed, `deploys:` lists any image SHAs touched during testing.
   - `# Phase 3 SUMMARY — Swarm Auto-Pull (OPS-01) — VERIFIED`
   - `## What changed` — the exact ops action that landed (e.g., "Forced restart of swarmpit_app via `docker service update --force swarmpit_app`" for Rung 1; or the corresponding rung-2/3/4 actions). NO code commits in this monorepo if Rung 1 landed (operational fix only).
   - `## Root cause` — match the ACTUAL observed cause, not just "we restarted swarmpit_app". Use the evidence in `03-BASELINE.txt` + `03-PUSH-OBSERVE.txt`. For Rung 1 PASS, the likely framing is "Swarmpit 1.9 watcher process entered a silent degraded state — container running but app deadlocked / no HTTP, no autoredeploy log lines, Traefik upstream timing out. Cause of the initial degradation at 2026-05-25 14:44 CEST is unknown (no error logs predate the silence); likely culprits include a runtime exception in the watcher's polling loop that wasn't caught, or a transient swarm-fabric event during the 14:44 window. A clean service-task restart restored the watcher to a healthy polling state."
   - `## Reversion plan` — specific to the rung that landed (e.g., "Rollback via `docker service rollback swarmpit_app`" for Rung 1; or the corresponding rollback steps for higher rungs).
   - `## Verification matrix` — cells for each must_have truth, with the evidence file (`03-BASELINE.txt` / `03-PUSH-OBSERVE.txt`) cited.
   - `## Findings beyond original scope` — file the stale node `b356ad8e1d60` finding from 03-CONTEXT.md `<live_findings>` as a new v1.x backlog item if it was NOT addressed by the landed fix (i.e., if Rung 1 or 2 landed; Rung 3 would have addressed it). Use the SEC-PII-02 pattern from Phase 2 as the template for filing this.
   - `## Phase exit gates` — checklist matching Phase 2's structure.
   - `## Commits this phase` — may be zero code commits + just docs commits if Rung 1 landed; otherwise list the SUMMARY commit + AGENTS.md update commit + the no-op test marker commit(s).

2. Update `AGENTS.md` (default) with a new runbook line. Suggested location: under a new `## Swarm Auto-Pull Recovery` section near the existing Deployment section (L8-19). Content (adjust to match the actual landed rung):
   ```
   ## Swarm Auto-Pull Recovery
   - Symptom: swarmpit.thinx.cloud returns Bad Gateway AND `docker service logs swarmpit_app --since 30m` is empty.
   - Recovery (rung 1 — restart swarmpit watcher): `ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "docker service update --force swarmpit_app"`. Wait for new task Running (`docker service ps swarmpit_app`); verify `curl https://swarmpit.thinx.cloud` returns 200.
   - Verification: push a no-op commit; observe `docker service ps thinx_api` for a new task with the new image SHA within 5 minutes.
   - Reference: `.planning/phases/03-swarm-auto-pull/03-SUMMARY.md` (root cause + reversion plan).
   ```
   The operator may redirect this content to `.planning/runbooks/swarm.md` (new file) during execution if preferred — Claude's discretion per 03-CONTEXT.md `<decisions>`. Default is AGENTS.md inline.

3. Update `REQUIREMENTS.md`:
   - OPS-01 line: change checkbox `[ ]` → `[x]`, add `✓ Verified 2026-05-26 (Phase 3 — see phases/03-swarm-auto-pull/03-SUMMARY.md)` followed by the validated-by summary (a/b/c per the existing OPS-01 validation criteria from REQUIREMENTS.md L16).
   - Traceability table: OPS-01 row status → `**Verified (2026-05-26)**`.
   - Coverage: `Verified: 3 (AUTH-API-01, SEC-PII-01, OPS-01)`, `Pending: 1 (SEC-DEP-01)`.
   - If a new v1.x item was surfaced (e.g., the stale node finding), add it to the v2 deferred section using the SEC-PII-02 pattern.

4. Update `ROADMAP.md`:
   - Phase 3 checkbox `[ ]` → `[x]`, append ` — ✓ Verified 2026-05-26 (push-observe SLA test PASS via Rung <N>)`.
   - Phase 3 Plans field: `**Plans:** 1 plan (single coarse rung-by-rung plan) — ✓ complete` plus the plan filename.
   - Phase Summary table: row 3 confirms Verified.
   - Requirement Coverage table: OPS-01 Verified.
   - Progress table: row 3 → `1/1 | Verified | 2026-05-26`.

5. Update `STATE.md`:
   - "Current Position" → Active phase: Phase 4 — Dependency Triage (next).
   - "Phase Progress" table: row 3 → `Verified (2026-05-26)`.
   - "Performance Metrics": phases completed +1, plans completed +1, verification passes +1.
   - "Accumulated Context > Decisions": add a 2026-05-26 entry documenting Phase 3's landed rung + root cause one-liner.
   - "Session Continuity > Stopped at" → reflect Phase 3 verification.
   - "Next action" → `/gsd-plan-phase 4`.

6. Commit everything in ONE close-out commit:
   ```
   git add .planning/phases/03-swarm-auto-pull/03-SUMMARY.md \
           .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md \
           AGENTS.md \
           .planning/phases/03-swarm-auto-pull/03-BASELINE.txt \
           .planning/phases/03-swarm-auto-pull/03-PUSH-OBSERVE.txt
   git commit --no-gpg-sign -m "docs(phase-03): close out — OPS-01 verified via rung-<N> fix (push-observe SLA PASS)"
   git push origin thinx-staging
   ```

**Case B — Task 6 ended in `abort-defer-to-v1x` (OPS-01 deferred to v1.x):**

1. Write `03-SUMMARY.md` documenting:
   - Frontmatter: `status: deferred-to-v1x`, `verified: NO`, `requirements: [OPS-01]`.
   - Root cause investigation summary (which rungs were attempted, why each didn't succeed).
   - Confirmation that `./restart.sh` manual workaround remains functional (verified in Task 1 baseline).
   - Cross-reference to a new REQUIREMENTS.md v2/deferred entry `OPS-01-v1x` (recommend NOT changing the OPS-01 v1 GA row to Verified; instead, add a new deferred row and acknowledge in the v1 row's text).
2. Update REQUIREMENTS.md: ADD a new v2/deferred entry `OPS-01-DEFERRED` explaining the deferral. Mark the original OPS-01 row as `[ ]` deferred-with-rationale, NOT Verified. Update Coverage counts accordingly.
3. Update ROADMAP.md Phase 3 row: mark as `**Deferred to v1.x**` not Verified. Update the Phase Summary table row.
4. Update STATE.md to reflect Phase 3 deferred and Phase 4 as the next action.
5. Update AGENTS.md: STRENGTHEN the existing deployment documentation to make `./restart.sh` the canonical "you must do this manually after every push" operator action until v1.x ships a fix.
6. Commit:
   ```
   git commit --no-gpg-sign -m "docs(phase-03): defer OPS-01 to v1.x — rungs 1-4 attempted, manual ./restart.sh remains documented escape hatch"
   ```

**Validation gates (apply to either case):**
- `grep "OPS-01" .planning/REQUIREMENTS.md` shows either `Verified` (Case A) OR a clearly-marked deferral (Case B). Never silently broken.
- `./restart.sh` path on the swarm host is unchanged (verify with `ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "ls -la /mnt/gluster/deployment/swarm/restart.sh"`).
- The thinx_api service on the swarm is still healthy (`curl -s -o /dev/null -w "%{http_code}\n" https://rtm.thinx.cloud/api/v2/spec` returns 200).
  </action>
  <verify>
    <automated>test -s .planning/phases/03-swarm-auto-pull/03-SUMMARY.md && grep -qE "(Verified|deferred-to-v1x)" .planning/phases/03-swarm-auto-pull/03-SUMMARY.md && grep -qE "OPS-01.*(Verified|deferred)" .planning/REQUIREMENTS.md</automated>
  </verify>
  <done>
03-SUMMARY.md exists with the case-appropriate content. STATE.md, ROADMAP.md, REQUIREMENTS.md updated and consistent (all three agree on OPS-01 status). AGENTS.md carries the runbook line (Case A) or strengthened manual-deploy doc (Case B). Close-out commit pushed to thinx-staging. `./restart.sh` confirmed still functional. Next action documented as `/gsd-plan-phase 4`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local dev machine → swarm host (SSH) | Operator commands cross a network boundary into a production swarm |
| Docker Hub → swarm host | Untrusted image registry (public) feeds the production swarm; only the autoredeploy label gates this |
| swarmpit_app → docker.sock | The Swarmpit container has access to the Docker socket on the manager node — full swarm control surface |
| swarm fabric overlay network (10.133.0.0/16) | Memberlist gossip plane; currently has a stale phantom peer |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Tampering | Task 2 `docker service update --force swarmpit_app` could leave swarmpit_app in a worse state (e.g., new task fails to boot, replica count drops to 0) | mitigate | Task 2 includes explicit reversion via `docker service rollback swarmpit_app` if post-restart checks fail. Pre-restart task ID is captured to ROLLBACK target. Per "escalate-not-chain", a failed Rung 1 STOPS the phase and surfaces to orchestrator. |
| T-03-02 | Information Disclosure | Task 4 `swarmpit_db` rebuild loses Swarmpit internal history (task event log, watcher state, possibly some user audit) | accept | Acceptable for v1 GA scope per 03-CONTEXT.md `<decisions>` rung 2. Best-effort backup of `_all_docs` taken before rebuild. Swarmpit re-derives operational state from Docker on first boot; only synthetic history is lost. |
| T-03-03 | Denial of Service | Task 5 stale-node removal could disrupt swarm fabric mid-operation (Leader election, memberlist churn) | mitigate | Operator approval gate (checkpoint:human-verify) requires confirmation of low-traffic window. `thinx_api` runs across 2 manager nodes; loss of one would not drop the service if Leader election completes within healthcheck window. Reversion: a removed phantom node CANNOT be re-introduced without genuinely joining via `docker swarm join` — irreversible at the entry level, but the entry was already orphaned so there's nothing real to lose. |
| T-03-04 | Tampering / Denial of Service | Task 6 Swarmpit upgrade 1.9 → latest could introduce new failure modes (schema migration of swarmpit_db, API changes, env var renames) | mitigate | Pin to a SPECIFIC version tag (not `latest`), preserve docker-swarm.yml pre-upgrade as backup, reversion documented as re-pin to 1.9 + re-deploy. Final fallback (Path C) is to ship v1 GA with manual `./restart.sh` workaround if upgrade fails — explicit operator decision via `abort-defer-to-v1x` at Task 6's checkpoint. |
| T-03-05 | Spoofing | Docker Hub serves a malicious `thinxcloud/api:latest` image that swarmpit autoredeploys silently | accept | Out of scope for Phase 3 (this is OPS-01's restoration, not a supply-chain hardening pass). Docker Hub credentials are managed by CircleCI; the only push path is via CI on the maintained repo. Filed-by-reference under SEC-DEP-01 (Phase 4) where dependency trust is the focus. |
| T-03-06 | Elevation of Privilege | swarmpit_app has docker.sock access — a compromised swarmpit container could control the whole swarm | accept | Pre-existing condition unchanged by this phase. Restarting swarmpit_app doesn't increase the privilege surface. Defer hardening (e.g., swarmpit_agent privilege separation) to v1.x or v2 migration to a different autoredeploy tool. |
| T-03-SC | Tampering | npm/pip/cargo installs in this phase | mitigate | N/A — this phase installs no new packages. The "fix" is operational (docker service commands), not source-code. Phase 4 will handle dependency-related threats. |

</threat_model>

<verification>
The phase as a whole is verified by:

1. **`03-PUSH-OBSERVE.txt` PASS verdict** — the SLA test result is the authoritative gate for OPS-01.
2. **`./restart.sh` escape hatch confirmed intact** — verified by file-existence check on the swarm host (do NOT invoke the script; just confirm it's present and executable, since it has been used as recently as the Phase 2 deploy 2026-05-26 17:15 UTC).
3. **`thinx_api` production traffic uninterrupted** — `curl https://rtm.thinx.cloud/api/v2/spec` returns 200 before AND after each rung's intervention.
4. **All three planning artifacts agree on OPS-01 status** — REQUIREMENTS.md, ROADMAP.md, STATE.md all reflect either Verified (Case A) or deferred-to-v1x (Case B). No inconsistencies.
5. **Runbook line landed** — AGENTS.md (or .planning/runbooks/swarm.md) carries the swarmpit silent-watcher recovery command + symptom signature.
6. **Phase 1 + 2 contracts not regressed** — `curl Bearer null` returns 200 (Phase 1 contract), and the swept owner.js log redactors remain in deployed code (Phase 2 contract). Quick re-verify after the fix using the existing Phase 1 + 2 probes.
</verification>

<success_criteria>
Phase 3 is COMPLETE when ALL of the following are true:

1. swarmpit_app on the production swarm responds with HTTP 200 (not Bad Gateway) and emits log lines on a normal polling cadence.
2. A push of a NEW commit to `thinx-staging` results in CircleCI building + pushing `thinxcloud/api:latest`, and Swarmpit autoredeploys `thinx_api` to the new image SHA within 5 minutes of the Docker Hub digest change — verified by wall-clock timestamps in `03-PUSH-OBSERVE.txt`.
3. NO operator invocation of `./restart.sh` was required during the push-observe SLA test window.
4. Root cause is documented in `03-SUMMARY.md` and matches the rung whose fix landed (not just "we restarted it"; the writeup connects the observed silent-watcher symptom to whichever rung produced the recovery).
5. Reversion plan specific to the landed fix is documented in `03-SUMMARY.md`.
6. AGENTS.md (or new `.planning/runbooks/swarm.md` if operator chooses) carries a runbook line for the next occurrence: symptom signature + recovery command + verification step.
7. REQUIREMENTS.md OPS-01 row marked `Verified 2026-05-26` (Case A) OR clearly deferred to v1.x with rationale (Case B).
8. ROADMAP.md Phase 3 checkbox is `[x]` (Case A) OR clearly marked deferred (Case B).
9. STATE.md "Current Position" reflects Phase 4 as next active phase.
10. Close-out commit pushed to `thinx-staging` with `docs(phase-03):` subject prefix.
11. `./restart.sh` escape hatch confirmed still functional (file present on swarm host).
12. `thinx_api` serving production traffic normally throughout (no rtm.thinx.cloud outage attributable to this phase's interventions).

**Source audit (multi-source coverage):**

| Source | Item | Covered by |
|--------|------|------------|
| GOAL (ROADMAP §3) | "Restore swarm-side auto-redeploy on 188.166.23.244 so that a parent-monorepo push triggering a registry image build results in a rolling task update without operator intervention" | Tasks 2 + 3 (Rung 1 fix + SLA test) |
| GOAL (ROADMAP §3) | "Target SLA: rolling task within 5 minutes of push completion" | Task 3 (push-observe with 5-min PASS gate) |
| GOAL (ROADMAP §3 criterion 1) | "Root cause is documented... in `.planning/phase-3/`" | Task 7 (03-SUMMARY.md `## Root cause` section) |
| GOAL (ROADMAP §3 criterion 2) | "Controlled push-and-observe verification on rtm" | Task 3 |
| GOAL (ROADMAP §3 criterion 3) | "A reversion plan is documented in the phase close-out" | Task 7 (03-SUMMARY.md `## Reversion plan`); rung-specific reversions in Tasks 2, 4, 5, 6 |
| GOAL (ROADMAP §3 criterion 4) | "The manual `./scripts/stack-deploy` workaround remains functional as a fallback" | Tasks 1 + 7 (file-existence check before AND after); all rung tasks have "do not break ./restart.sh" guardrail |
| REQ (REQUIREMENTS.md OPS-01) | "Swarm-side auto-pull on 188.166.23.244 resumes working" | Tasks 2 + 3 |
| REQ (OPS-01 validation a) | "root-cause documented" | Task 7 |
| REQ (OPS-01 validation b) | "controlled push-and-observe verification on rtm" | Task 3 |
| REQ (OPS-01 validation c) | "reversion plan documented if fix introduces regression" | Task 7 + per-rung reversions in Tasks 2-6 |
| CONTEXT (03-CONTEXT.md D-01: Rung 1 first) | Restart swarmpit_app as smallest possible fix | Task 2 |
| CONTEXT (03-CONTEXT.md D-02: Rung 2 only if D-01 fails) | swarmpit_db rebuild | Task 4 (checkpoint-gated) |
| CONTEXT (03-CONTEXT.md D-03: Rung 3 only if D-01+D-02 fail) | Stale node membership cleanup | Task 5 (checkpoint-gated) |
| CONTEXT (03-CONTEXT.md D-04: Rung 4 only if D-01+D-02+D-03 fail) | Swarmpit 1.9 → latest upgrade | Task 6 (checkpoint-gated) |
| CONTEXT (03-CONTEXT.md guardrail) | "DO NOT break the `./restart.sh` manual workaround" | Tasks 1, 2, 4, 5, 6, 7 all include explicit restart.sh integrity checks |
| CONTEXT (03-CONTEXT.md guardrail) | "DO NOT restart `thinx_api` itself for diagnostic reasons" | Tasks 2, 4, 5, 6 all scope to swarmpit_* services; thinx_api only touched by Swarmpit's autoredeploy mechanism in Task 3 |
| CONTEXT (03-CONTEXT.md guardrail) | "DO NOT change the `thinxcloud/api:latest` image tag or registry" | No task modifies the image tag; Task 3 verifies autoredeploy against the existing tag |
| CONTEXT (03-CONTEXT.md decisions verification) | "Push-and-observe test for ROADMAP §3 criterion 2" (6-step protocol) | Task 3 implements the 6 steps verbatim |
| CONTEXT (03-CONTEXT.md decisions verification) | "Reversion plan exit criterion" (a/b/c/d documentation) | Task 7 03-SUMMARY.md structure |
| CONTEXT (03-CONTEXT.md `<specifics>` hypothesis #1 HIGH) | Watcher process silently broken → force restart | Task 2 (Rung 1) is the direct response |
| CONTEXT (03-CONTEXT.md `<live_findings>` stale peer `b356ad8e1d60`) | Memberlist gossip thrashing parallel issue | Task 5 (Rung 3) if it surfaces as causal; otherwise filed as v1.x backlog item in Task 7 |

**Coverage:** All GOAL criteria (4/4), all REQ validation items (3/3 sub-items of OPS-01), all CONTEXT decisions (D-01 through D-04 + guardrails + verification protocol). No items missing. No items deferred without operator-approved checkpoint.

**Excluded by design (not gaps):**
- 03-CONTEXT.md `<deferred>` items (Watchtower migration, monitoring, DOCKER_API_VERSION pin, CouchDB 2.3.0 migration) — explicitly deferred per CONTEXT.
- "Replace Swarmpit with Watchtower" — out of scope per 03-CONTEXT.md `<domain>`.
- "Upgrading Docker engine 29.4.2 → newer" — out of scope per 03-CONTEXT.md `<domain>`.
- "Recreating the swarm cluster" — out of scope per 03-CONTEXT.md `<domain>` (Path C "nuclear option" only).
</success_criteria>

<output>
On completion of Task 7 (regardless of Case A or B), create:
`.planning/phases/03-swarm-auto-pull/03-SUMMARY.md`

And ensure these files are updated and committed:
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `AGENTS.md` (or new `.planning/runbooks/swarm.md` if operator redirected)
- `.planning/phases/03-swarm-auto-pull/03-BASELINE.txt`
- `.planning/phases/03-swarm-auto-pull/03-PUSH-OBSERVE.txt`

Final commit subject MUST start with `docs(phase-03):` per parent commitlint. All commits unsigned per memory `unsigned-commits-260526`.

Next action after Phase 3 close-out: `/gsd-plan-phase 4` (SEC-DEP-01 Dependency Triage).
</output>
