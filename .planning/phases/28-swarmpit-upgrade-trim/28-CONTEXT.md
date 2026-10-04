# Phase 28: Swarmpit Upgrade & Trim - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce the Swarmpit stack on the swarm to what THiNX relies on, registry-triggered autoredeploy, and move it to Swarmpit 1.10:

- `swarmpit_influxdb` and Swarmpit stats are removed (OPS-SWARM-02).
- `swarmpit_app` and `swarmpit_agent` run 1.10 (OPS-SWARM-01).
- `swarmpit_db` (couchdb 2.3.0) stays, with its volume and linked registry credentials.
- `swarmpit_agent` **stays** (OPS-SWARM-03 is descoped, see D-12).

Each step is gated by a real `thinx-staging` push that must redeploy `thinx_api` within 5 minutes of the registry push. This phase is ops-only. It changes no application code, and it does not replace Swarmpit.

</domain>

<decisions>
## Implementation Decisions

### Upgrade order & target
- **D-01:** Order (Claude's discretion, see below): **trim first on the known 1.9, then upgrade.** Step A removes `swarmpit_influxdb` (unset `SWARMPIT_INFLUXDB` on `swarmpit_app`, remove the service). Step B upgrades app and agent to 1.10.
- **D-02:** **Engine gate.** The first step reads `docker version --format '{{.Server.Version}}'` on `micro` and `core`. If either is Docker Engine **29.0–29.2**, which rejects 1.9's default API 1.30, the 1.10 upgrade runs **first** and the trim after it. Do not pin `SWARMPIT_DOCKER_API` on 1.9 as a workaround.
- **D-03:** Image reference is the **version tag `swarmpit/swarmpit:1.10`**, not an `@sha256` digest. This matches the tag-not-digest policy set for InfluxDB on 2026-10-04.
- **D-04:** **App and agent upgrade together.** In the same step and behind the same gate, `swarmpit_agent` moves to the agent release matching 1.10, if research finds one. If none exists, the agent image stays as is and the reason is recorded.
- **D-05:** If 1.10 fails its gate after the D-09 recovery, **roll back to 1.9** from the pre-step snapshot and record OPS-SWARM-01 as blocked. Replacing Swarmpit (registry webhook → `docker service update`, Shepherd) is out of scope.
- **D-06:** `swarmpit_db` compatibility: an **additive, forward-only schema migration inside couchdb 2.3.0 is allowed**, after a backup (D-07). The CouchDB image/version, the volume and the linked registry credentials must not change. Success criterion 4's "untouched" means exactly that. If 1.10 needs a newer CouchDB or a destructive migration, skip the upgrade, keep 1.9 and record OPS-SWARM-01 as blocked. — **Reversibility:** one-way — a schema migration written by 1.10 into swarmpit_db may not be readable by 1.9, so rolling back to 1.9 after the upgrade means restoring the D-07 dump.
- **D-07:** Before step 1, **dump `swarmpit_db`** (CouchDB replication or `_all_docs?include_docs=true` export of every database, or a volume copy with the service scaled down). It holds the registry credentials autoredeploy depends on. Keep the dump on the swarm, outside the gluster tree Swarmpit uses, and do not commit it, since it contains credentials. Record only its path, size and doc counts.

### Redeploy gates & SLA
- **D-08:** Each gate is a **real `thinx-staging` push**. CircleCI builds and pushes `registry.thinx.cloud:5000/thinx/api`, and the gate watches for a new `thinx_api` task. Do not use a canary service.
- **D-09:** **SLA clock: registry push → new task Running.** It starts when CircleCI's image push completes (new digest in the registry) and stops when the new `thinx_api` task is Running. Limit: 5 minutes. CI build time is excluded.
- **D-10:** **Gate evidence:** `docker service ps thinx_api` shows a new Running task with the new image digest, the API answers on `https://rtm.thinx.cloud`, and the measured delta is recorded in the step SUMMARY.
- **D-11:** **Gate failure:** one rung-1 recovery (`docker service update --force swarmpit_app`, per `.claude/skills/swarm-autopull-recovery/SKILL.md`) and a re-measure. If it is still late or missing, roll the step back from its snapshot and **stop the window**.
- **D-11a:** **Gate commits are phase evidence commits** (that step's snapshot and evidence under `.planning/`), signed and pushed to `thinx-staging`, not empty commits. Research must confirm that a `.planning`-only commit makes CircleCI build and push the api image. If a path filter skips it, the plan needs a different trigger that still goes through the real CI → registry path.

### Agent & leftovers
- **D-12:** **`swarmpit_agent` is kept.** The operator still uses the Swarmpit tasks/stats UI (`AGENTS.md` monitoring via `swarmpit.thinx.cloud/#/tasks`). **OPS-SWARM-03 is descoped** to future requirements: update REQUIREMENTS.md (move it out of v1.14 with that reason) and ROADMAP.md (drop success criterion 3, and adjust the goal and requirements line), so v1.14 closes at 24/24.
- **D-13:** After verifying that **no service mounts it** (`docker service inspect` across all services), **delete `/mnt/gluster/deployment/swarm/swarmpit/influxdb.conf`** together with `swarmpit_influxdb`, keeping a copy in that step's snapshot. Phase 27 D-16 already removed its mount from `thinx_influxdb`.
- **D-14:** Keep the **`swarmpit_influxdb` data volume** until the last gate of the phase (the 1.10 gate) passes, so step A can still be rolled back. Then remove it to reclaim disk, and record the volume name, node and size first.

### Window & execution
- **D-15:** **Claude runs the production steps over ssh without per-step approval gates.** It stops only on a failed gate (D-11), on the engine/compat stop conditions (D-02, D-06) or on an unexpected state. Use the literal ssh form `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 …` (memory `micro-ssh-direct-form`). Query service placement first, since it floats and `docker exec` is node-local. — **Reversibility:** costly — steps run back to back, so a bad step is only caught at its gate; every step must have its snapshot taken before it changes anything.
- **D-16:** **No fixed window.** It runs whenever execute-phase runs, but never within 06:00–10:00 UTC (the ~06:45 unattended-upgrade window and the 09:40 log-retention cron). Same-day as other rollouts is fine. The only commits pushed during the window are the gate commits.
- **D-17:** **Mechanism: edit the Swarmpit stack file, then `docker stack deploy`.** The stack file stays the source of truth. Before the first change, research/the first task must **diff the stack file against the live specs** (`docker service inspect`), since `registry.yml` drifted badly on 2026-09-21. Reconcile any drift into the file first, without behaviour change, and snapshot it. Snapshot the file before and after each step under `.planning/runbooks/swarm-configs/` (`swarmpit-stack.<step>.{pre,post}.yml`), with secrets redacted. Do **not** use `restart.sh` or the thinx stack.

### Claude's Discretion
- Step order on a healthy engine (D-01 chose trim first: the influx removal is proven by Swarmpit 1.9 source, so the upgrade then runs on the smallest stack).
- Exact form of the `swarmpit_db` dump (D-07) and of the redaction in snapshots.
- How to detect the registry-push timestamp for the SLA clock (CircleCI step end time vs registry manifest/log time).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §"Phase 28: Swarmpit Upgrade & Trim" — goal, success criteria, notes (one component per step, rung-1 staged first, away from 06:45 UTC)
- `.planning/REQUIREMENTS.md` — OPS-SWARM-01, OPS-SWARM-02 (in scope), OPS-SWARM-03 (to descope per D-12)
- `.planning/v1.14-MILESTONE-AUDIT.md` — milestone state; Phase 28 holds the only open requirements

### Swarmpit internals & prior research
- `.planning/research/STACK.md` §"#12: Swarmpit trim" and the Swarmpit rows of the Alternatives / Version Compatibility tables — `SWARMPIT_INFLUXDB` is the stats switch, autoredeploy is a 60 s in-app job, 1.10 defaults to API 1.44, engine 29.0–29.2 caveat
- `.planning/research/ARCHITECTURE.md` §"12. Swarmpit trim" — autoredeploy mechanism, snapshot convention, registry CPU-limit warning
- `.planning/research/PITFALLS.md` — Swarmpit pitfalls (MEDIUM confidence)

### Operations
- `.planning/runbooks/swarm.md` — Swarmpit recovery rungs (rung 1 force-restart, rollback, rung 4 upgrade)
- `.claude/skills/swarm-autopull-recovery/SKILL.md` — rung-1 procedure and verification
- `.planning/runbooks/swarm-configs/README.md` — snapshot convention for stack/edge configs
- `.planning/phases/27-influxdb-2-upgrade/27-CONTEXT.md` D-15/D-16 — `thinx_influxdb` no longer mounts `swarmpit/influxdb.conf`; the `swarmpit` DB inside thinx_influxdb was dropped
- `AGENTS.md` — ssh access, deploy flow, Swarmpit tasks page used for monitoring

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `swarm-autopull-recovery` skill: the rung-1 command and its verification, reused as the D-11 recovery.
- `.planning/runbooks/swarm-configs/` snapshot trail (Phase 13/25 nginx and console snapshots): same layout for the Swarmpit stack snapshots.
- Phase 27 runbook `.planning/runbooks/influxdb2-upgrade.md`: a worked example of a gated production change on this swarm (placement query, backup, step evidence).

### Established Patterns
- Placement floats between `micro` and `core`: query `docker service ps` before any `docker exec`; `docker service ls` is unreliable under load (memory `swarm-node-topology`).
- Single-service changes on the thinx stack use `docker service update`; the thinx stack is never redeployed with `restart.sh` in this phase (it resets edge passwords and drops live-only secret mounts).
- Images pinned by version tag, not digest (2026-10-04 decision).

### Integration Points
- Swarmpit autoredeploy acts on services labelled `swarmpit.service.deployment.autoredeploy=true` (`thinx_api` and the others) by polling `registry.thinx.cloud:5000` digests with the credentials stored in `swarmpit_db`.
- `registry_registry` CPU limits (0.25 CPU) must not be tuned in this phase (memory `registry-storage-and-limits`).
- The Swarmpit stack file lives in the gluster swarm tree (`/mnt/gluster/deployment/swarm`, under `swarmpit/`), not in this repo.

</code_context>

<specifics>
## Specific Ideas

- Each gate's SUMMARY records: the registry-push time, the new task Running time, the delta, the new digest, and the rtm.thinx.cloud health result.
- The OPS-SWARM-03 descope reason to record: "Swarmpit tasks/stats UI is still used for monitoring; the agent stays."

</specifics>

<deferred>
## Deferred Ideas

- **OPS-SWARM-03, removing `swarmpit_agent`:** descoped to future requirements (D-12). Revisit if monitoring moves off the Swarmpit UI, e.g. to `docker service ps` over ssh plus external alerting.
- **Replacing Swarmpit** with a registry webhook or Shepherd: its own phase, if `swarmpit_app` itself becomes the footprint problem (memory `backlog-swarmpit-minimize`).

### Reviewed Todos (not folded)
- Keyword-matched pending todos (Rollbar token split, legacy owner/transfer FIXMEs, API key residual exposure, console notification gaps, MQTT device writes, multi-file OTA): unrelated to Swarmpit, so they stay in `.planning/todos/pending/`.

</deferred>

---

*Phase: 28-swarmpit-upgrade-trim*
*Context gathered: 2026-10-04*
