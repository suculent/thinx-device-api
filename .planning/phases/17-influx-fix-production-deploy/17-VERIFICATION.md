---
phase: 17
phase_name: influx-fix-production-deploy
status: passed
verified: 2026-06-06
score: 1/1 requirement satisfied
requirements: [OPS-EXEC-03]
resolution: discrepancy-branch
---

# Phase 17 Verification — Influx Fix Production Deploy

**Status: passed** (discrepancy branch — fix already live; verified in production, no rollout applied).

## Requirement coverage

| REQ | Status | Evidence |
|-----|--------|----------|
| OPS-EXEC-03 | **satisfied** | Influx fix `9b6d931c` confirmed live in prod via operator-authorized SSH |

## Evidence (production swarm 188.166.23.244, 2026-06-06)

| Check | Result |
|-------|--------|
| Deployed `lib/thinx/influx.js` has the fix | ✅ `count("value")`, `WHERE "owner"=…`, `time > '<ISO>'`, `now() - 7d` |
| App version | `1.9.3054` |
| `found BADSTRING` (15m / 24h) | ✅ 0 / 0 |
| influx/query-parse errors (1h) | ✅ 0 |
| `DEVICE_CHECKIN` count last 7d (dashboard number) | ✅ 16 (non-zero) |
| `owner` tag present (fix premise) | ✅ tag keys `[data, owner]` |
| `thinx_api` co-located with `thinx_mosquitto` | ✅ both on micro (api pinned) |
| MQTT connack-timeout spam | ✅ none |

## Notes

- Resolved as a **discrepancy branch**: the swarm had autoredeployed pipeline-5266's `:latest` (containing the fix) ~17h before the phase ran. No `docker service update --force` was applied — re-rolling a healthy identical image was deliberately avoided.
- Phases 15/16 remained unpushed so `:latest` stayed the influx-only image.
- Evidence files: `deploy-pre.txt`, `deploy-probe.txt`, `deploy-post.txt`. Runbook annex in `.planning/runbooks/swarm.md`.

No gaps. No tech debt for this phase.
