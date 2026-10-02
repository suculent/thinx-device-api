---
phase: 27-influxdb-2-upgrade
plan: 03
subsystem: api
tags: [influxdb, flux, statistics, dashboard, privacy, probe, d-12]

requires:
  - phase: 27-02
    provides: InfluxDB 2 connector (statsLog, today/week {KPI:[n]}, countsByKpi, _resetForTests) and the CI compose pair
provides:
  - Statistics.week_V2/today_V2 forward (success, body), so /api/v2/stats and /api/v2/stats/today answer {success:true, response:{KPI:[n]}} (F-1 fixed)
  - D-12 on new points: APIKEY_INVALID written with the owner tag only, LOGIN_INVALID limited to LOGIN_INVALID_REASONS or `unlisted`
  - Read-only connector helpers bucketStatus, countsDetailed, countAll, distinctOwners (stats|stats/autogen only)
  - scripts/influx-stats-probe.js, the aggregate-only production probe (exit 0/1/2, INFLUX-STATS-PROBE OK|FAIL reason=<token>)
affects: [27-04, 27-05, 27-06, 27-07]

actuals:
  tokens: 12650
  tasks: 3
  commits: 7
plan_head_before: c19400f0f20283d091c49634ad5bbb4c79a6e508
plan_head_after: 727111661d5bf16b3eab3e23b73961c091a644e3

tech-stack:
  added: []
  patterns:
    - "Read-only connector helpers resolve {ok, reason, ...} and never reject or log; the probe turns `reason` into a short token"
    - "Optional Flux range stop via fluxExpression('now()') default, so one query text serves open and absolute windows"
    - "CLI probe output via a single buffered stdout write after silencing console, so connector logging can never leak into evidence"

key-files:
  created:
    - scripts/influx-stats-probe.js
    - spec/jasmine/StatisticsV2Spec.js
    - spec/jasmine/StatsPrivacySpec.js
    - spec/jasmine/InfluxStatsProbeSpec.js
  modified:
    - lib/thinx/statistics.js
    - lib/thinx/apikey.js
    - lib/router.auth.js
    - lib/thinx/influx.js
    - spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js

key-decisions:
  - "D-12: drop the rejected API key from APIKEY_INVALID, don't hash it. sha256(key) is THiNX's own key identifier, so a hash would not anonymise anything, and every distinct key would add a new series"
  - "LOGIN_INVALID_REASONS (7 labels) is a frozen allow-list in lib/router.auth.js; anything else is logged and written as `unlisted`"
  - "StatisticsV2Spec builds Statistics from its prototype with the same `influx` member, because the constructor's legacy file-ETL setup under /mnt/data rejects on a developer host"
  - "Probe on a failed bucket lookup prints bucket_exists=na and stops; on an absent bucket it prints the status lines and stops with reason=bucket_absent (no counts queried)"
  - "Probe bucket_names values are filtered to [A-Za-z0-9_./-]; anything else prints as `?`"

patterns-established:
  - "Production evidence probes for InfluxDB load only influx.js, event_taxonomy.js and secrets.js, so they run in the API image without config"
  - "Privacy specs call through to the real statsLog with stats disabled, so the console line is checked as well as the arguments"

requirements-completed: [OPS-INFLUX-02]

coverage:
  - id: D1
    description: "Seeded InfluxDB 2 points reach week_V2/today_V2 as {KPI:[n]} (DEVICE_CHECKIN [2], BUILD_SUCCESS [1], others [0]), owner B isolated, router renders {success:true, response:body}, invalid owner and no token give all zeros, no unhandled rejection"
    requirement: OPS-INFLUX-02
    verification:
      - kind: integration
        ref: "spec/jasmine/StatisticsV2Spec.js#Statistics V2 (InfluxDB 2) (7 specs) against influxdb 2.9.1 -> STATS-V2-KPI-GREEN"
        status: pass
      - kind: other
        ref: "Task 1 verify 2 -> ZZ-PIN-UPDATED"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-12: APIKEY_INVALID statsLog gets (owner, event) only, no console line holds the rejected key, the audit entry stays redacted; LOGIN_INVALID allow-list, all 7 call sites literal and allow-listed, auditLogError maps raw input to `unlisted`"
    requirement: OPS-INFLUX-02
    verification:
      - kind: unit
        ref: "spec/jasmine/StatsPrivacySpec.js#Stats privacy (D-12) (7 specs) + LoggingQualityAudit/MetricsCoverage/EventTaxonomy -> STATS-PRIVACY-GREEN"
        status: pass
      - kind: other
        ref: "Task 2 verify 2 -> D12-SOURCE-OK"
        status: pass
    human_judgment: false
  - id: D3
    description: "Read-only probe and connector helpers: OK path with retention 7776000, absolute window, usage exit 2, bucket_absent/no_token/outage exit 1, output hygiene (no token, URL or 64-hex), bucket list byte-identical before and after"
    requirement: OPS-INFLUX-02
    verification:
      - kind: integration
        ref: "spec/jasmine/InfluxStatsProbeSpec.js#InfluxDB stats probe CLI (13 specs) + Influx/InfluxRetention/StatisticsV2 (44 specs) -> PROBE-CONTRACT-GREEN"
        status: pass
      - kind: other
        ref: "Task 3 verify 2 -> PROBE-USAGE-OK; grep -c ensureStatsBucket scripts/influx-stats-probe.js = 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Prohibitions (flagged, verification: judgment): no full rejected key or raw login input in a tag or log line; the probe never prints a secret, URL, owner, tag value or non-taxonomy name and never writes"
    requirement: OPS-INFLUX-02
    verification:
      - kind: unit
        ref: "StatsPrivacySpec + InfluxStatsProbeSpec hygiene and read-only cases"
        status: pass
    human_judgment: true
    rationale: "The plan marks both prohibitions verification: judgment. The specs pin the emission sites and the probe, but a reviewer should confirm that no other code path logs raw login input or the full key"
  - id: D5
    description: "The real dashboard / Visits page shows non-zero KPIs for a session owner once production runs on InfluxDB 2"
    requirement: OPS-INFLUX-02
    verification: []
    human_judgment: true
    rationale: "Needs the 27-05/27-06 cutover and a browser session; the code path is proven only up to Util.responder"

duration: 11min
completed: 2026-10-02
status: complete
---

# Phase 27 Plan 03: Dashboard KPIs from InfluxDB 2, D-12 Stats Privacy, and a Read-Only Stats Probe Summary

**`week_V2` and `today_V2` now forward the connector's `(success, body)`, so `/api/v2/stats` and `/api/v2/stats/today` return real `{KPI:[n]}` counts from InfluxDB 2 instead of the empty-result failure (F-1). APIKEY_INVALID no longer stores or prints the rejected key. LOGIN_INVALID only ever carries one of seven allow-listed labels or `unlisted`. `scripts/influx-stats-probe.js` gives production read-only, aggregate-only evidence of the token, the bucket, its retention and the counts.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-02T17:20:22Z
- **Completed:** 2026-10-02T17:31Z
- **Tasks:** 3 (all TDD: RED then GREEN)
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- **F-1 fixed (tracer).** Two seeded owners in a real InfluxDB 2.9.1 go through `InfluxConnector.week/today`, then `Statistics.week_V2/today_V2`, then `Util.responder`. The result parses to `{success:true, response:{APIKEY_INVALID:[0], …, DEVICE_CHECKIN:[2], BUILD_SUCCESS:[1], …}}`, and the other owner is never counted. With no token, or with a quote-bearing owner, both methods answer success with all zeros. The ZZ `GET /api/v2/stats` pin now parses the body and checks every EventTaxonomy key.
- **D-12.**
  - `apikey.verify` calls `statsLog(owner, APIKEY_INVALID)` with no data, so the key is neither a tag value nor part of the `[OID:…] [APIKEY_INVALID]` console line.
  - `log_invalid_key` still writes the redacted audit entry (first 6 chars + …).
  - `router.auth.js` declares a frozen `LOGIN_INVALID_REASONS`, and `auditLogError` maps anything outside it to `unlisted` before both `logger.warn` and `statsLog`.
  - `logging-quality-audit` still classifies LOGIN_INVALID as compliant.
- **Read-only probe.** New `influx.js` helpers:
  - `bucketStatus` uses GET calls only;
  - `countsDetailed` takes an optional `stop`, and `countsByKpi` now delegates to it with the same contract;
  - `countAll` and `distinctOwners` complete the set.

  `scripts/influx-stats-probe.js` prints the fixed key order, ends with `INFLUX-STATS-PROBE OK` or `FAIL reason=<token>`, and exits 0, 1 or 2. Against the CI pair it reports `bucket_retention_s=7776000`, `count_all_total=1` and `owners_7d=1`. The bucket list (ids, `updatedAt`, rules) is identical before and after a run.

## Task Commits

1. **Task 1 (tracer): week_V2/today_V2 → Util.responder → {KPI:[n]}**
   - RED `811a0fd5` (test). Six of seven specs failed on `body: expected undefined`, and `check tdd-red-evidence` returned `RED_EVIDENCE_OK` for "week_V2 calls back (true, {KPI:[n]}) with the owner's seeded counts".
   - GREEN `3acb8456` (feat).
2. **Task 2: D-12, APIKEY_INVALID without key, LOGIN_INVALID allow-list**
   - RED `f8dff136` (test). Six of seven failed: statsLog received 3 args, the key was printed, and there was no allow-list. `RED_EVIDENCE_OK`.
   - GREEN `7832f0d1` (feat; the message names D-12).
3. **Task 3: read-only connector helpers and stats probe**
   - RED `3e7df518` (test). 13/13 failed: probe absent, `bucketStatus` not a function. `RED_EVIDENCE_OK`.
   - GREEN `810a66af` (feat).
4. **Lint:** `72711166` (style) removes an unused eslint-disable directive from StatsPrivacySpec.

## TDD Gate Compliance

All three tasks have a `test(27-03)` commit before their `feat(27-03)` commit. Each RED run was validated by `gsd-tools check tdd-red-evidence` as `RED_EVIDENCE_OK` (`target_test_failed`), using a TAP reporter wrapper around jasmine. No refactor commits were needed.

## Files Created/Modified

- `lib/thinx/statistics.js`: `today_V2` and `week_V2` forward `(success, body)`, and their JSDoc names the `{KPI:[n]}` body. Nothing else changed.
- `lib/thinx/apikey.js`: APIKEY_INVALID `statsLog` with no third argument, plus a D-12 comment.
- `lib/router.auth.js`: `LOGIN_INVALID_REASONS`, and the `label` mapping in `auditLogError`. Call sites are unchanged.
- `lib/thinx/influx.js`: `READ_BUCKETS`, `readBucket`, `rangeStop`, `bucketStatus`, `countsDetailed`, `countAll` and `distinctOwners`. `countsByKpi` delegates to `countsDetailed`.
- `scripts/influx-stats-probe.js`: the probe CLI (executable).
- `spec/jasmine/StatisticsV2Spec.js`: "Statistics V2 (InfluxDB 2)", 7 specs.
- `spec/jasmine/StatsPrivacySpec.js`: "Stats privacy (D-12)", 7 specs.
- `spec/jasmine/InfluxStatsProbeSpec.js`: "InfluxDB stats probe CLI", 13 specs.
- `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js`: the GET /api/v2/stats case only.

## Decisions Made

- **D-12: drop, not hash.** This is the planner's recommendation, implemented as written. A full sha256 of a key is THiNX's own key identifier (`apikey.js:94`). Dropping the key also removes a cardinality vector, and nothing reads the tag.
- **StatisticsV2Spec builds Statistics with `Object.create(Statistics.prototype)` plus `influx = new InfluxConnector('stats')`.** The real constructor calls `mkdirp('/mnt/data/statistics/')` and `fs.ensureFile`, and both return promises that reject on a host without `/mnt`. That would break the spec's "no unhandled rejection" check. The V2 methods only use `this.influx`.
- **StatsPrivacySpec goes beyond the plan's static grep.**
  - It lifts the `auditLogError` source out of `router.auth.js` and runs it against stubs. Raw input becomes `unlisted` in both the log line and the stats call, and the raw value appears in neither.
  - It replaces the instance's audit sink rather than stubbing `log_invalid_key`, so the redacted audit message is asserted too.
  - The console-leak case calls through to the real `statsLog` with stats disabled. With the spy alone, statsLog's own console line was never produced, and the case passed in RED, which proved nothing.
- **Probe failure shapes.**
  - No token: `token_present=0`, `bucket=…`, then `FAIL reason=no_token`.
  - Status lookup failed (for example an outage): `bucket_exists=na` then `FAIL reason=<ECONNREFUSED|timeout|status>`.
  - Bucket absent: the status lines, then `FAIL reason=bucket_absent`.
  - A query failed later on: every line is still printed, and the run ends `FAIL reason=query_failed`.
  - `stats` with any retention other than 7776000: `FAIL reason=retention_<n>`.
- **`--help` and unknown flags are usage errors (exit 2).** The plan says "anything else → usage".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's output-line regex contradicts its own key names**
- **Found during:** Task 3 (GREEN).
- **Issue:** The behavior requires every line to match `^[a-z0-9_]+=\S*$`. The same plan also requires `count_all_<KPI>`, `count_window_<KPI>` and similar keys, whose KPI suffix is upper-case (`APIKEY_INVALID`), so no compliant output could pass.
- **Fix:** The keys stay as specified. The spec's `LINE` regex is `^[a-z0-9_]+(?:[A-Z][A-Z_]*)?=\S*$`: a lower-case prefix with an optional upper-case taxonomy suffix. It is still strict key=value with no spaces.
- **Files modified:** spec/jasmine/InfluxStatsProbeSpec.js.
- **Verification:** PROBE-CONTRACT-GREEN.
- **Committed in:** 810a66af.

**2. [Rule 1 - Bug] The StatsPrivacySpec console-leak case was toothless in RED**
- **Found during:** Task 2 (RED).
- **Issue:** With `statsLog` spied, statsLog's own `[OID:…] [APIKEY_INVALID] <key>` line was never printed, so "no console line contains the key" passed before the fix.
- **Fix:** That case now calls through to the real `statsLog` with `INFLUXDB_TOKEN` removed (stats disabled, no write). It also asserts that the `[APIKEY_INVALID]` line was printed, then that no line holds the key. It failed in RED ("expected 1 to equal 0") and passes in GREEN.
- **Files modified:** spec/jasmine/StatsPrivacySpec.js.
- **Committed in:** f8dff136 (before the RED commit).

**3. [Rule 2 - Missing critical] StatisticsV2Spec diagnostics for lost seed writes**
- **Found during:** Task 1 (GREEN).
- **Issue:** The first verbatim GREEN run reported `16 specs, 3 failures` without detail. The next 18 runs, each on a fresh compose pair and including the verbatim command, were all `0 failures`. Three is the number of count-dependent specs, which suggests a seeded write was not counted once.
- **Fix:** The spec keeps owner-free `[influx] …` connector lines during seeding and puts them in the count assertion message, so a recurrence names the reason (status code or error code).
- **Files modified:** spec/jasmine/StatisticsV2Spec.js.
- **Committed in:** 3acb8456.

---

**Total deviations:** 3 auto-fixed (2 bugs in test or plan text, 1 diagnostic addition).
**Impact on plan:** No change to the production contract. All six plan markers were printed.

## Issues Encountered

- **One unexplained flake (Task 1).** A single run of `StatisticsV2Spec + InfluxSpec` showed 3 failures that did not recur in 18 fresh-pair runs. The output detail was lost because the verbatim command tails only 3 lines. The new diagnostics will name the cause if it reappears in CI (27-04). Watch for it there.

## Known Stubs

None.

## User Setup Required

None. The probe is used by the production plans 27-05 to 27-07, inside the `thinx_api` image: `node scripts/influx-stats-probe.js [--bucket stats/autogen] [--window-start ISO --window-stop ISO]`.

## Next Phase Readiness

- 27-04 (CI): StatisticsV2Spec, StatsPrivacySpec and InfluxStatsProbeSpec are non-ZZ, so CI runs them. Two of them need the `INFLUXDB_URL` and `INFLUXDB_TOKEN` env that 27-02 already gives the api service.
- 27-05 to 27-07 (production):
  - Before cutover, `--bucket stats/autogen` proves the migrated counts.
  - After cutover, the default run proves `bucket_retention_s=7776000` and the counts.
  - A `--window-start`/`--window-stop` pair around a check-in proves that fresh writes arrive.
- The Vue dashboard needs no change: `Visits.vue` reads `data[key][0]`.

---
*Phase: 27-influxdb-2-upgrade*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: lib/thinx/statistics.js, lib/thinx/apikey.js, lib/router.auth.js, lib/thinx/influx.js, scripts/influx-stats-probe.js, spec/jasmine/StatisticsV2Spec.js, spec/jasmine/StatsPrivacySpec.js, spec/jasmine/InfluxStatsProbeSpec.js, spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js
- FOUND commits: 811a0fd5, 3acb8456, f8dff136, 7832f0d1, 3e7df518, 810a66af, 72711166
- Plan verification: STATS-V2-KPI-GREEN, ZZ-PIN-UPDATED, STATS-PRIVACY-GREEN, D12-SOURCE-OK, PROBE-CONTRACT-GREEN, PROBE-USAGE-OK
