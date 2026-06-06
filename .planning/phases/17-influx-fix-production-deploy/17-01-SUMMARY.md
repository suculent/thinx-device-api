# Phase 17 / Plan 17-01 — SUMMARY

**Requirement:** OPS-EXEC-03
**Outcome:** ✅ Verified — **discrepancy branch** (influx fix already live in production; no rollout applied)
**Date:** 2026-06-06

## What happened

Phase 17 set out to force-rollout the influx stats fix (`9b6d931c`, quick-task `260605-inf`) to production. Operator-authorized SSH probing of the production swarm host (`188.166.23.244`) revealed the fix was **already live** — the swarm had autoredeployed `thinxcloud/api:latest` (CircleCI pipeline 5266) ~17 hours earlier, and that image contains the fix.

Rather than re-roll an identical, healthy image (pure restart risk, ~1–2 min downtime, zero benefit), the phase resolved as a **discrepancy branch** — verify the fix is live and operating, persist the evidence + runbook annex, and close. This mirrors v1.10's OPS-EXEC-01/02 resolutions.

## Verification matrix

| Check | Method | Result |
|-------|--------|--------|
| Deployed code has the fix | `docker exec` grep of `/opt/thinx/thinx-device-api/lib/thinx/influx.js` | ✅ `count("value")`, `WHERE "owner"=…`, `time > '<ISO>'`, `now() - 7d` all present |
| App version | `node -e require(./package.json).version` in container | `1.9.3054` |
| `found BADSTRING` log spam | `docker service logs thinx_api --since 15m / 24h` | ✅ 0 / 0 |
| influx/query-parse errors | `docker service logs thinx_api --since 1h` | ✅ 0 |
| Dashboard check-in number backed by data | InfluxDB `SELECT count("value") FROM DEVICE_CHECKIN WHERE time > now()-7d` (via overlay) | ✅ **16** (non-zero) |
| `owner` tag exists (fix premise) | `SHOW TAG KEYS FROM DEVICE_CHECKIN` | ✅ `[data, owner]` |
| Co-location with mosquitto | `docker service ps thinx_api / thinx_mosquitto` | ✅ both on **micro** (api pinned `[node.hostname==micro]`) |
| MQTT connack-timeout spam | log grep | ✅ none |

## Key findings / deviations

- **Discrepancy branch:** no `docker service update --force` was run — the fix was already deployed out-of-band via normal autoredeploy. Re-rolling was deliberately avoided.
- **Co-location reality vs. prior assumption:** `thinx_api` + `thinx_mosquitto` are co-located on **micro** (api constraint-pinned to micro), NOT `core` as the pre-existing operator memory stated. `thinx_influxdb` is on `core`, reached over the overlay. The `swarm.md` annex and the operator memory were corrected.
- **Phases 15/16 remain unpushed (30 local commits)** — deliberately, so `:latest` stayed the influx-only image. Deploying 15/16 is separate post-milestone work.

## Evidence files
- `deploy-pre.txt` — pre-deploy baseline (image, node placement, constraint, BADSTRING count)
- `deploy-probe.txt` — container path + deployed influx.js fix-signature inspection
- `deploy-post.txt` — version, digest, error counts, InfluxDB DEVICE_CHECKIN count + tag keys

## Runbook annex
Appended to `.planning/runbooks/swarm.md` → "Phase 17 / OPS-EXEC-03 — Influx fix production deploy".

## STATE.md decision entry (copy into Accumulated Context / Decisions)
- 2026-06-06 — OPS-EXEC-03 (Phase 17) closed as a discrepancy branch: influx fix `9b6d931c` was already live in prod (autoredeployed pipeline 5266 ~17h prior). Verified via deployed-code inspection + 0 BADSTRING/parse errors + DEVICE_CHECKIN count=16 + owner-tag present + thinx_api/mosquitto co-located on micro. No force-rollout applied. Corrected co-location assumption (micro, not core) in swarm.md + memory.
