# Phase 17: Influx Fix Production Deploy - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Mode:** OPS execution (operator-gated). Mirrors v1.10 OPS-EXEC-01/02. The deploy itself is run by the operator on the production swarm host; this repo holds the runbook + verification + annex.

<domain>
## Phase Boundary

Roll the already-committed, CI-green influx stats fix (`9b6d931c`, quick-task `260605-inf`) live on production, and verify the Vue dashboard check-in numbers are correct and the `error parsing query: found BADSTRING` log spam is silenced. Covers requirement **OPS-EXEC-03**.

In scope: pre-deploy baseline probe → force-rollout of the influx-fix image → post-deploy verification (logs + dashboard + co-location + MQTT) → runbook annex + SUMMARY.
Out of scope: any code change (the fix is already shipped); deploying Phases 15/16 (see decoupling below); the broader swarm autoredeploy machinery (OPS-01, already closed).
</domain>

<decisions>
## Implementation Decisions

### Clean decoupling from Phases 15/16 (CRITICAL)
- `9b6d931c` (influx fix) is **pushed** and is an ancestor of the v1.10 close on `origin/thinx-staging`. CircleCI pipeline 5266 built and published `thinxcloud/api:latest` from that state — so the current `:latest` image on Docker Hub **contains the influx fix and NOT Phases 15/16**.
- Phases 15 + 16 are **30 unpushed local commits**. They are NOT in the `:latest` image.
- Therefore: a force-rollout of `:latest` deploys **only the influx fix**, exactly as scoped — **provided Phases 15/16 are NOT pushed before this deploy completes.** Do not `git push` during Phase 17. (Pushing 15/16 would trigger a fresh CI build and change `:latest` to include unverified-in-prod runtime changes.)
- Pushing + deploying Phases 15/16 is separate milestone-completion work that happens AFTER Phase 17, with its own CI-green gate (the full Jasmine suite runs on that push).

### Deploy mechanism (from `.planning/runbooks/swarm.md`)
- SSH: `ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244`
- Stack/deploy dir: `/mnt/gluster/deployment/swarm/` (`restart.sh` is the manual escape hatch).
- Force the swarm to re-pull `:latest` and restart the API service:
  `docker service update --force thinx_api` (re-pulls the pinned image and reschedules the task).
- Current vs target image digest:
  `docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'`

### CO-LOCATION GUARDRAIL (NON-NEGOTIABLE — highest deploy risk)
- `thinx_api` MUST run on the **same node as `thinx_mosquitto` (the `core` node)**. A forced rollout that reschedules `thinx_api` onto the `micro` node breaks server-side MQTT — the cross-node overlay to `mosquitto:1883` times out with a connack timeout, and the broker integration silently fails. (Recorded in operator memory `thinx-api-mosquitto-colocation`.)
- BEFORE deploy: record which node `thinx_api` is on (`docker service ps thinx_api`).
- AFTER deploy: confirm `thinx_api` landed back on the **same `core` node**. If it rescheduled to `micro`, that is a FAILED deploy — reschedule it back to `core` (placement constraint / node availability) before declaring success.
- If `thinx_api` already has a placement constraint pinning it to `core`, the force-update is safe; verify the constraint is present as part of the pre-deploy probe.

### Verification criteria (what "deployed + verified" means)
1. **Image rolled:** `thinx_api` is running a task whose image digest matches Hub's current `:latest` (the pipeline-5266 influx image), and the task `CurrentState` is `Running`.
2. **Log spam silenced:** `docker service logs thinx_api --since 10m | grep "found BADSTRING"` returns **nothing** (the malformed time-predicate queries are fixed).
3. **Dashboard numbers correct:** the Vue dashboard check-in/build stats (`/api/v2/stats` → `statistics.js` → `InfluxConnector.today()/week()`) read **non-zero / updating** values (previously stale/0 due to the `owner` vs `owner_id` tag mismatch).
4. **Co-location intact:** `thinx_api` on the `core` node (same as `thinx_mosquitto`).
5. **MQTT alive:** server-side MQTT still connects (no connack-timeout spam in `thinx_api` logs; a device check-in round-trips).

### Reversibility
- Rollback: `docker service rollback thinx_api` reverts to the previous task/digest. Because `:latest` is the influx image and the prior image is the pre-influx one, rollback cleanly removes the influx fix if a regression appears. Document the pre-deploy digest so rollback target is known.
</decisions>

<code_context>
## Existing Code Insights

### What the fix changed (`9b6d931c`, `lib/thinx/influx.js`) — informs verification
- Tag mismatch: reads filtered `WHERE "owner_id"=` but writes are tagged `owner` → matched nothing (stale/0 dashboard). Now filters by `owner`.
- Malformed time predicates (`time > ${midnight}'` with stray quote; `setDate()` returning a number) were the `found BADSTRING` source. Now `time > '<ISO>'` and `time > now() - 7d`.
- `mean("value")` of constant 1 → always 1; now `count("value")`.
- `today()` queried the for-in index instead of the KPI measurement name.
- Return shape preserved (statistics.js + Visits.vue compatible) — no API signature change, so no Vue-console-compat risk.

### Annex target
- Append a Phase 17 execution annex to `.planning/runbooks/swarm.md` (NOT a new file) — same pattern v1.10 used for its OPS-EXEC annexes. Record: operator initials, UTC timestamp, pre/post image digests, the node thinx_api ran on before/after, the BADSTRING grep result, and the dashboard verdict.

### Evidence files
- Write pre/post probe output under `.planning/phases/17-influx-fix-production-deploy/` (e.g. `deploy-pre.txt`, `deploy-post.txt`) mirroring v1.10's probe-trail convention.
</code_context>

<specifics>
## Specific Ideas

The single highest risk is the co-location guardrail — a blind `docker service update --force` that lets the scheduler move `thinx_api` to `micro` will silently break MQTT even though the influx fix itself is trivial. The runbook MUST check node placement before AND after, and treat a node move as a failed deploy.
</specifics>

<deferred>
## Deferred Ideas

- Deploying Phases 15/16 to prod — separate post-Phase-17 milestone-completion step (push → CI full-suite green → force-rollout of the combined image), explicitly NOT part of OPS-EXEC-03.
- OPS-02 / OPS-03 (swarm-side stale memberlist / malformed autoredeploy specs) — still deferred per REQUIREMENTS.md.
</deferred>
