# Swarm Operations Runbook

Operator-facing recovery procedures for the THiNX production swarm host `188.166.23.244`.

**SSH connection:** `ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244`
**Deploy script (manual escape hatch):** `/mnt/gluster/deployment/swarm/restart.sh`
**Stack file location:** `/mnt/gluster/deployment/swarm/` (`docker-swarm.yml`, `thinx.yml`, etc.)

---

## Swarm Auto-Pull Recovery (Phase 3 / OPS-01 — landed 2026-05-26)

**Symptom signature** (all of):
- `https://swarmpit.thinx.cloud` returns **Bad Gateway (502)** via Traefik.
- `docker service logs swarmpit_app --since 30m` is **empty** (zero application log lines from the watcher for an extended window).
- CircleCI builds and pushes `thinxcloud/api:latest` to Docker Hub successfully, BUT `docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` continues to show the OLD digest — i.e., the swarm is not picking up the new image.
- The swarmpit_app container itself is **Running** (no exit, no restart loop) — only the application inside has gone silent. This distinguishes the silent-watcher pattern from a crash/restart loop.

### Rung 1 — Force-restart swarmpit_app (default first move)

```bash
ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "docker service update --force swarmpit_app"
```

Wait ~90s for the new task to boot (Swarmpit 1.9 JVM + CouchDB + InfluxDB warm-up).

**Verify recovery:**
```bash
ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 \
  "curl -s -o /dev/null -w '%{http_code}\n' https://swarmpit.thinx.cloud"
# expect: 200

ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 \
  "docker service logs swarmpit_app --since 2m --tail 50"
# expect: startup banner + "Swarmpit running on port 8080" + "Docker SOCK: /var/run/docker.sock"
```

**SLA verification** (controlled push-and-observe):
```bash
# 1. Push a no-op commit
git commit --allow-empty -m "chore: push-observe SLA test marker"
git push origin thinx-staging

# 2. Wait for CircleCI to push a new thinxcloud/api:latest digest to Docker Hub (typically 3-5 min)
# 3. Confirm the swarm autoredeploys thinx_api to the new digest within 5 min:
ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 \
  "docker service ps thinx_api --no-trunc --format '{{.ID}} {{.CurrentState}} {{.Image}}' | head -3"
# expect: new task ID, Running, new digest matching Hub's :latest
```

Phase 3 observed SLA: **delta = 63 seconds** (Hub digest change → new task Running), well under the 5-min target.

**Rollback** (if Rung 1 makes things worse):
```bash
ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "docker service rollback swarmpit_app"
```

### Rungs 2-4 — Escalation ladder (operator-gated)

If Rung 1 doesn't restore autoredeploy, the next moves are documented in detail at
`.planning/phases/03-swarm-auto-pull/03-PLAN.md` (Tasks 4-6). Each requires operator approval at a `checkpoint:human-verify` gate because the blast radius escalates:

- **Rung 2 — Rebuild swarmpit_db (CouchDB 2.3.0):** Loses Swarmpit internal history (task event log, watcher state); Swarmpit re-derives operational state from Docker on first boot. Best-effort `_all_docs` backup before applying.
- **Rung 3 — Stale-node membership cleanup:** Removes the phantom peer `b356ad8e1d60` / `10.133.0.4` from the memberlist gossip layer. **Risk:** swarm-fabric perturbation; only attempt on a low-traffic window. See OPS-02 in `.planning/REQUIREMENTS.md`.
- **Rung 4 — Upgrade Swarmpit 1.9 → latest:** Heaviest fix. Schema migration on swarmpit_db; possible API/env-var breakage. Pin to a SPECIFIC version tag (NOT `latest`) and preserve `docker-swarm.yml` pre-upgrade as backup.

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
