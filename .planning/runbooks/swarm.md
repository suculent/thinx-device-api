# Swarm Operations Runbook

Operator-facing recovery procedures for the THiNX production swarm host `micro`.

**SSH connection:** `ssh micro`

> `micro` and `core` are the SSH aliases in the operator's `~/.aliases`; host, port, user and
> key live there rather than in this public repository.
**Deploy script (manual escape hatch):** `/mnt/gluster/deployment/swarm/restart.sh`
**Stack file location:** `/mnt/gluster/deployment/swarm/` (`docker-swarm.yml`, `thinx.yml`, etc.)

---

## Swarm Auto-Pull Recovery (Phase 3 / OPS-01 — landed 2026-05-26)

**Symptom signature** (all of):
- `https://swarmpit.thinx.cloud` returns **Bad Gateway (502)** via Traefik.
- `docker service logs swarmpit_app --since 30m` is **empty** (zero application log lines from the watcher for an extended window).
- CircleCI (`api-registry` job on `thinx-staging`) builds and pushes `registry.thinx.cloud:5000/thinx/api:swarm` to the private registry successfully, BUT `docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` continues to show the OLD digest — i.e., the swarm is not picking up the new image.
- The swarmpit_app container itself is **Running** (no exit, no restart loop) — only the application inside has gone silent. This distinguishes the silent-watcher pattern from a crash/restart loop.

### Rung 1 — Force-restart swarmpit_app (default first move)

```bash
ssh micro "docker service update --force swarmpit_app"
```

Wait about 3–4 minutes. Swarmpit 1.10 (JDK 17) needs about 2 minutes to listen at its 0.25 CPU
limit, its healthcheck has a 300 s start period, and the first autoredeploy poll runs 60 s after
boot. Since Phase 28 the stack has no InfluxDB.

**Verify recovery:**
```bash
ssh micro \
  "curl -s -o /dev/null -w '%{http_code}\n' https://swarmpit.thinx.cloud"
# expect: 200

ssh micro \
  "docker service logs swarmpit_app --since 2m --tail 50"
# expect: startup banner + "Swarmpit running on port 8080" + "Docker SOCK: /var/run/docker.sock"
```

**SLA verification** (controlled push-and-observe): follow § Gate procedure in
`.planning/runbooks/swarmpit-upgrade.md`. In short:

```bash
# 1. Push a signed, non-empty evidence commit to thinx-staging (no [skip ci]);
#    any thinx-staging push builds and pushes registry.thinx.cloud:5000/thinx/api:swarm.
git push origin thinx-staging

# 2. SLA start: the end_time of the CircleCI api-registry step "Push to private registry"
#    (push_end); its log carries the pushed digest.
# 3. SLA stop: the Status.Timestamp of the thinx_api task that runs that digest:
ssh micro \
  "docker service ps thinx_api --no-trunc --filter desired-state=running --format '{{.ID}} {{.CurrentState}} {{.Image}}' | head -3"
# expect: new task ID, Running, the pushed digest, within 300 s of push_end
```

Phase 3 observed SLA: **delta = 63 seconds** (then measured against Docker Hub). Phase 28 measured
32 s on Swarmpit 1.9, 31 s after the stats stack was removed and 50 s on Swarmpit 1.10 (private
registry, push_end → task Running).

**Rollback** (if Rung 1 makes things worse):
```bash
ssh micro "docker service rollback swarmpit_app"
```

### Rungs 2-4 — Escalation ladder (operator-gated)

If Rung 1 doesn't restore autoredeploy, the next moves are documented in detail at
`.planning/phases/03-swarm-auto-pull/03-PLAN.md` (Tasks 4-6). Each requires operator approval at a `checkpoint:human-verify` gate because the blast radius escalates:

- **Rung 2 — Rebuild swarmpit_db (CouchDB 2.3.0):** Loses Swarmpit internal history (task event log, watcher state); Swarmpit re-derives operational state from Docker on first boot. Best-effort `_all_docs` backup before applying.
- **Rung 3 — Stale-node membership cleanup:** Removes the phantom peer `b356ad8e1d60` / `10.133.0.4` from the memberlist gossip layer. **Risk:** swarm-fabric perturbation; only attempt on a low-traffic window. See OPS-02 in `.planning/REQUIREMENTS.md`.
- **Rung 4 — Upgrade Swarmpit (done in Phase 28, 2026-10):** Swarmpit runs `swarmpit/swarmpit:1.10` by tag with a stack-file healthcheck override (300 s start period). swarmpit_db stayed `couchdb:2.3.0` with no migration, and the stats stack (`swarmpit_influxdb` and its volume) was removed. Procedure, evidence and rollback: `.planning/runbooks/swarmpit-upgrade.md`. A future upgrade follows the same runbook: pin a specific tag, back up `swarmpit.yml` first.

**Final fallback** (if Rungs 1-4 all fail): document `./restart.sh` as the canonical operator action and ship without autoredeploy. Path C in `phases/03-swarm-auto-pull/03-CONTEXT.md` `<domain>`.

### Phase 3 close-out reference

Root cause + reversion plan + full verification matrix:
- `.planning/phases/03-swarm-auto-pull/03-SUMMARY.md`

Evidence:
- `.planning/phases/03-swarm-auto-pull/03-BASELINE.txt` — pre-fix state + Rung 1 application timestamps
- `.planning/phases/03-swarm-auto-pull/03-PUSH-OBSERVE.txt` — wall-clock SLA test evidence (delta=63s)

---

## Phase 17 / OPS-EXEC-03 — Influx fix production deploy (v1.11, 2026-06-06)

**Resolution: discrepancy branch — fix already live, no rollout applied.**

- **Operator:** MS (autonomous agent run, operator-authorized SSH). **UTC:** 2026-06-06.
- **Target:** roll influx stats fix `9b6d931c` (quick-task `260605-inf`) to prod.
- **Finding:** `thinx_api` had already autoredeployed `thinxcloud/api:latest` (pipeline 5266) ~17h prior. The deployed `lib/thinx/influx.js` already contained the full fix — `count("value")`, `WHERE "owner"=…`, `time > '<ISO>'`, `time > now() - 7d`. App version `1.9.3054`. No force-rollout was applied (re-rolling an identical healthy image is pure restart risk).
- **Co-location note (supersedes prior assumption):** `thinx_api` is pinned to **micro** via `[node.hostname==micro]`, and `thinx_mosquitto` runs on **micro** too — co-location holds on `micro`, not `core` as previously assumed. A force-update keeps `thinx_api` on micro (constraint-pinned), so MQTT co-location is safe. `thinx_influxdb` runs on **core** and is reached by `thinx_api` over the overlay (`http://thinx_influxdb:8086`).

**Verification matrix (evidence in `.planning/phases/17-influx-fix-production-deploy/deploy-{pre,post,probe}.txt`):**

| Check | Result |
|-------|--------|
| Deployed `influx.js` has the fix | ✅ owner-tag + count() + ISO/`now()-7d` predicates present |
| `found BADSTRING` in logs (15m / 24h) | ✅ 0 / 0 |
| influx/query-parse errors (1h) | ✅ 0 |
| `DEVICE_CHECKIN` count last 7d (dashboard check-in number) | ✅ 16 (non-zero) |
| `owner` tag exists on measurements | ✅ tag keys = [data, owner] |
| `thinx_api` co-located with `thinx_mosquitto` | ✅ both on micro (api pinned via constraint) |
| MQTT connack-timeout spam | ✅ none |

**If a future re-deploy IS needed** (e.g. after pushing Phases 15/16): `docker service update --force thinx_api` re-pulls `:latest`; the `[node.hostname==micro]` constraint keeps it co-located with mosquitto. Rollback: `docker service rollback thinx_api`.

---

## Related v1.x backlog items

- **OPS-02** (REQUIREMENTS.md) — Stale swarm membership entry `b356ad8e1d60` / `10.133.0.4`. Defer; cleanup is the Rung 3 procedure.
- **OPS-03** (REQUIREMENTS.md) — Malformed image-tag specs on `thinx_chronograf` / `thinx_couchdb` / `thinx_influxdb` / `thinx_worker` cause autoredeploy HTTP 400 on those services. Pre-existing config issues unrelated to OPS-01.

---

*Runbook initialized: 2026-05-26 (Phase 3 close-out)*
*Maintained alongside `AGENTS.md` (local-only session notes; gitignored) — this file is the canonical, committed source for swarm operational procedures.*
