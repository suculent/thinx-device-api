# Phase 3: Swarm Auto-Pull — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Source:** Live SSH pre-investigation against `188.166.23.244` 2026-05-26 (this is the G8-INVESTIGATION.md analog for Phase 3 — data-driven seed rather than speculative suspect list)

<domain>
## Phase Boundary

**In scope:** Diagnose why swarm-side auto-redeploy on `188.166.23.244` stopped working at/around 2026-05-25 14:44 CEST (12:44 UTC) and restore it so a CircleCI registry push of `thinxcloud/api:latest` results in a rolling task update within ~5 minutes, without needing the manual `./restart.sh` workaround.

**Out of scope for this phase:**
- Replacing Swarmpit with a different autoredeploy tool (e.g., Watchtower, Diun, Keel) — that's a v2 migration, not a v1 GA fix
- Upgrading Docker engine 29.4.2 → newer — not implicated by evidence
- Migrating away from Docker Hub as the registry — not implicated
- Recreating the swarm cluster (nuclear option; only if (Path C) all softer fixes fail)
- The `./restart.sh` manual workaround — keep it working as escape hatch

</domain>

<decisions>
## Implementation Decisions

### Investigation order (locked, based on live evidence)

The pre-investigation revealed a smoking gun: **Swarmpit's UI returns `Bad Gateway` via Traefik AND the `swarmpit_app` service has logged nothing for at least 2 hours.** This narrows the diagnostic order from "5+ generic suspects" to a concrete ladder:

1. **First rung: Swarmpit application is in a degraded state.** Container running, process alive, but not serving HTTP and not logging. Either crashed-internally / deadlocked / silently broken. Restart `swarmpit_app` cleanly. If UI returns AND autoredeploy resumes → root cause is Swarmpit went silent (state, not config). Mark Phase 3 verified after a controlled push-and-observe test.

2. **Second rung (only if rung 1 doesn't help):** Look at `swarmpit_db` (CouchDB 2.3.0 internal to swarmpit; NOT thinx_couchdb) for stale state — corrupted autoredeploy queue, half-written task records, or design-doc index corruption. Nuke and rebuild swarmpit_db (Swarmpit re-derives state from docker on first boot; this is a documented recovery path per the Swarmpit GitHub issues).

3. **Third rung (only if rungs 1+2 don't help):** Memberlist gossip cleanup — dockerd is continually trying to reach a peer `10.133.0.4` / node ID `b356ad8e1d60` that is no longer in `docker node ls`. This stale node membership may be causing swarmpit_agent's coordination layer to thrash. Force-remove the stale node via `docker node rm` or `docker swarm leave --force` + re-init.

4. **Fourth rung (only if 1+2+3 don't help):** Upgrade Swarmpit 1.9 → latest (1.10 or current). Risk: minor API breakage; v2 may have addressed silent-watcher bugs. This is the heaviest fix and should be a last resort because the upgrade itself could introduce new failure modes.

### Fix-direction guardrails (locked)

- Prefer the **smallest possible change** that restores autoredeploy. Restart < DB rebuild < node cleanup < Swarmpit upgrade.
- DO NOT break the `./restart.sh` manual workaround. It's the operational escape hatch and Phase 1 + 2 deploys all relied on it today. Verify it still works after the fix.
- DO NOT touch Traefik labels on `thinx_api` unless rung 3+ — those labels are wired into the working ingress (verified during Phase 1 deploy).
- DO NOT change the `thinxcloud/api:latest` image tag or registry; this is the production reference and changing it cascades into CircleCI config.
- DO NOT restart `thinx_api` itself for diagnostic reasons — that disrupts the live API. Restarting `swarmpit_app` is safe because Swarmpit is a tooling service, not part of the API request path.
- DO NOT leave the system worse-off if the fix doesn't work. Each rung must have a defined reversion path (re-apply the manual workaround documentation if all else fails; v1 GA can ship with the manual workaround if rungs 1-4 all fail, with the workaround documented as the expected operator action and OPS-01 punted to v1.x).

### Verification (locked)

**Push-and-observe test for ROADMAP §3 criterion 2:**

1. Make a no-op change to this monorepo (e.g., a trivial REQUIREMENTS.md comment edit), push to `thinx-staging`.
2. Wait for CircleCI to build and push the new `thinxcloud/api:latest` image to Docker Hub.
3. Start a wall-clock timer when the new image digest is observable in the registry (poll via `docker pull -q` to check digest).
4. Observe the swarm: `docker service ps thinx_api` should show a new task being created with the new image SHA, then transitioning Running, within 5 minutes of step 3's digest change.
5. PASS criteria: rolling task within 5 minutes; HTTP 200 from `curl https://rtm.thinx.cloud/api/v2/profile` (or similar) confirms service is healthy on the new image.
6. NO operator intervention (no SSH, no `./restart.sh`) during the test window.

**Reversion plan exit criterion:**

The phase SUMMARY MUST document, for whichever rung's fix landed:
- (a) What was changed (config file, restart command, label edit, etc.) with reproducible exact-syntax commands
- (b) How to undo it cleanly (revert command + side-effects to expect)
- (c) Known limitations (e.g., "if the swarm host reboots, this fix needs to be re-applied because it's not persisted in stack config" — IF that's the case)
- (d) Operator runbook line that goes into a `.planning/runbooks/swarm.md` (new file) or AGENTS.md update

### Claude's discretion

- Specific ordering of confirmation commands within rung 1 (`docker service update --force` vs. `docker stack deploy` vs. `docker service rollback`)
- Whether to combine swarmpit_app + swarmpit_agent restart or sequence them
- Exact wording of the runbook line
- Whether to capture a Swarmpit upstream issue link if the silent-watcher pattern is documented somewhere on github.com/swarmpit/swarmpit

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (planner, executor) MUST read these before producing artifacts.**

### Pre-investigation findings (this CONTEXT)
- This file's `<live_findings>` section captures the SSH investigation snapshot — DO NOT re-run the investigation as part of the plan; treat these as the locked baseline.

### Codebase intel
- `.planning/codebase/CONCERNS.md` ("Operations Concerns" section) — original generic suspect list (now narrowed)

### Phase 1 + 2 lessons (apply here)
- `.planning/phases/01-auth-api-password-reset/01-SUMMARY.md` — Escalate-not-chain rule on operational failure; explicit `-i ~/.ssh/DOKey2` key flag for ssh; verify image SHA rolled BEFORE declaring deploy success
- `.planning/phases/02-pii-logging-scrub/02-SUMMARY.md` — Probe BOTH success and error paths after a fix; opportunistic fixes only count if they share the same atomic commit; document new findings as separate backlog items rather than scope creep

### Operations references
- `AGENTS.md` L12-19 — Deploy flow + ssh details (script is `./restart.sh` not `./scripts/stack-deploy` per memory `swarm-deploy-script-name`)
- Swarmpit project: github.com/swarmpit/swarmpit (last meaningful release ~1.9 in 2020; maintenance status TBD)
- Memory `swarm-deploy-script-name` — `/mnt/gluster/deployment/swarm/restart.sh` is the canonical deploy path
- Memory `deployment-console-thinx-cloud` — Parent submodule bump triggers Vue rebuild; rtm deploys through the same swarm

</canonical_refs>

<live_findings>
## Live Investigation Snapshot (2026-05-26 ~17:00 UTC via SSH)

### Swarm topology (HEALTHY)
- 2 nodes: `micro` (Leader, manager) and `core` (Reachable, manager). Both Active, Ready. Engine 29.4.2 on both.
- No drained or down nodes via `docker node ls`.

### Swarmpit services (RUNNING, but app is DEGRADED)
- `swarmpit_app` (image `swarmpit/swarmpit:1.9`) — 1/1 replica RUNNING, Up 24+ hours. No published ports (overlay-network only).
- `swarmpit_agent` (image `swarmpit/agent:latest`) — 2/2 replicas global, RUNNING. RestartCount=0 since 2026-05-25T15:19:25Z (~28 hours ago).
- `swarmpit_db` (CouchDB 2.3.0) — running, internal to swarmpit stack.
- `swarmpit_influxdb` (InfluxDB 1.7) — running.

### CRITICAL: Swarmpit_app is DEGRADED (not crashed)
- `https://swarmpit.thinx.cloud` returns **`Bad Gateway`** via Traefik (Traefik IS responding; backend swarmpit_app refuses connection on its internal HTTP port).
- `docker service logs swarmpit_app --since 2h --tail 100` returns **EMPTY** — no application logs whatsoever in the last 2 hours.
- `docker service logs swarmpit_app --since 30h | grep autoredeploy` also returns **EMPTY** — no autoredeploy decisions logged in the last 30 hours either.
- Container is running (no exit, no restart loop), but the application inside has gone silent.

### thinx_api service labels (autoredeploy IS configured)
- `swarmpit.service.deployment.autoredeploy: "true"` ✓ Present at the service level.
- Image: `thinxcloud/api:latest` (Docker Hub, not the private `registry.thinx.cloud:5000`).
- Currently deployed: `thinxcloud/api:latest@sha256:3a461b3d6e3690e1be65740702559edda533b7c5b29e70ca8926fe8a4f565d94` (from Phase 2's deploy).

### Registry / Docker Hub is HEALTHY
- Manual `docker pull thinxcloud/api:latest` from the swarm host SUCCEEDED 2026-05-26 ~17:00 UTC and returned a fresh digest `sha256:950043b4d40ef24673030cbf2fde2677bab2b6d433788d7b452223cbe6fde211` — DIFFERENT from the currently-deployed `3a461b3d...`. So CI continues to push, registry is reachable, the latest tag IS moving.
- `~/.docker/config.json` has two registry auth blobs (Docker Hub credentials are present). NOT echoed here for security.
- Image creation timestamp: 2026-05-26T15:33:53Z (matches CI build cadence).

### Swarm fabric notes (PARALLEL ISSUE, possibly contributing)
- Dockerd journalctl shows persistent memberlist gossip timeouts at 2026-05-25 15:25:15 — 15:57:41 UTC:
  ```
  memberlist: Push/Pull with b356ad8e1d60 failed: read tcp 10.133.0.2:35410->10.133.0.4:7946: i/o timeout
  ```
- Peer `b356ad8e1d60` / IP `10.133.0.4` is **NOT in `docker node ls`** — it's a stale member that wasn't cleanly removed. This may be causing swarm fabric churn.

### Swarmpit_agent startup correlation
- Both agent instances STARTED at 2026-05-25 15:19:25 (micro) and 2026-05-25 16:12:47 (core). The micro start time is ~35 minutes AFTER the 14:44 CEST (12:44 UTC) original incident — suggesting an operator (or auto-restart loop) attempted a fix that DID restart the agents but didn't fully restore autoredeploy.

### What's NOT broken (debunked suspects)
- Registry connectivity (verified by manual pull above)
- Docker Hub auth (creds are present and the pull worked)
- Traefik routing for production traffic (rtm.thinx.cloud serving traffic normally; only swarmpit.thinx.cloud is Bad Gateway)
- `swarmpit.service.deployment.autoredeploy=true` label (correctly applied)
- Docker engine itself (running, swarm intact, services running)
- thinx_api itself (running and serving; verified via Phase 1 + 2 rtm probes throughout this session)

</live_findings>

<specifics>
## Specific Investigation Outputs (line-level)

Lines worth referencing in the plan:

- `docker service ls --filter "name=swarmpit"` output captured under `<live_findings>` — use as the post-fix comparison target
- `docker service inspect swarmpit_app --format "{{json .Spec.TaskTemplate.ContainerSpec.Env}}"` returned only 4 env vars (DOCKER_API_VERSION=1.44, SWARMPIT_DB, SWARMPIT_DOCKER_API, SWARMPIT_INFLUXDB) — no autoredeploy interval override
- `journalctl -u docker -S "2026-05-25 13:00:00" -U "2026-05-25 16:00:00" | grep -iE "pull|fetch|manifest"` returned ZERO actual pull events — implying Swarmpit never attempted a pull in that window (consistent with the watcher being silent)
- The 10 memberlist timeout entries above

## Hypothesis ranking (most likely → least likely)

1. **(HIGH)** Swarmpit_app watcher process silently broken — supported by 2+ hours of zero logs, Bad Gateway from Traefik, and the consistent absence of autoredeploy log lines for 30 hours. Likely fixed by a `docker service update --force swarmpit_app`.
2. **(MEDIUM)** Stale swarmpit_db state confusing the autoredeploy watcher — supported by no obvious config issue + degraded behavior after agent restarts.
3. **(MEDIUM)** Memberlist gossip thrashing affecting swarmpit_agent's ability to read service state — supported by the 10+ memberlist timeouts.
4. **(LOW-MEDIUM)** Docker API 1.44 vs. engine 29.4.2 partial incompatibility — Swarmpit 1.9 was released for Docker 19.x-era. Some method calls might silently fail.
5. **(LOW)** Docker Hub auth/rate-limit — debunked by successful manual pull.

</specifics>

<deferred>
## Deferred Ideas

- **Replace Swarmpit with Watchtower** — Watchtower is simpler, actively maintained, and does exactly one job. v2 / post-v1-GA migration candidate. NOT this phase.
- **Add monitoring/alerting on Swarmpit health** — Prometheus exporter for swarmpit_app, alert on "no logs in last N minutes". v1.x candidate.
- **Pin DOCKER_API_VERSION lower for Swarmpit** — May help if rungs 1-3 don't resolve and the API mismatch is suspected. Defer until evidence demands it.
- **Memberlist gossip cleanup** (rung 3) — Belongs in Phase 3 IF rungs 1+2 don't resolve. Risk of breaking the running swarm; ONLY do it on weekend / low-traffic window.
- **Migrate Swarmpit_db away from CouchDB 2.3.0** — CouchDB 2.3.0 is from 2018; very old. Possible Swarmpit-internal corruption is age-related. Defer unless rung 2 confirms the suspicion.

</deferred>

---

*Phase: 03-swarm-auto-pull*
*Context gathered: 2026-05-26 via live SSH pre-investigation — no /gsd-discuss-phase pass needed (live data is sharper than conversational discussion would be)*
