---
status: testing
phase: 27-influxdb-2-upgrade
source: [27-VERIFICATION.md]
started: 2026-10-03T14:58:00Z
updated: 2026-10-03T14:58:00Z
---

## Current Test

number: 1
name: Vue console dashboard and Visits render non-zero statistics from InfluxDB 2
expected: |
  Log in to the Vue console on rtm.thinx.cloud as an owner with recent activity and open the dashboard and the Visits page.
  Weekly and today KPI tiles/charts render non-zero figures for KPIs with activity (production probe at 14:52 UTC:
  count_7d_DEVICE_CHECKIN=2, owners_7d=3; 7-day LOGIN_INVALID/BUILD_* non-zero at 13:36), no blank panel, no console error.
  /api/v2/stats and /api/v2/stats/today respond {success:true, response:{<8 KPIs>:[n]}}.
awaiting: user response

## Tests

### 1. Vue console dashboard and Visits render non-zero statistics from InfluxDB 2
expected: Weekly and today KPI tiles/charts show non-zero figures for active KPIs, no blank panel, no console error; /api/v2/stats and /api/v2/stats/today return {success:true, response:{<8 KPIs>:[n]}}
result: [pending]

### 2. Resolve the 19 judgment-tier prohibitions in 27-VERIFICATION.md
expected: Each prohibition in the "Prohibitions (judgment tier)" table is accepted or rejected by a human; the verifier found no breach in any of them (caveat: delete-all was approved while two D-07 checks were unmet, with both disclosed)
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
