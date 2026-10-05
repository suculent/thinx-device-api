---
phase: 27-influxdb-2-upgrade
plan: 04
subsystem: infra
tags: [influxdb, deploy, swarm, circleci, statistics, timestamps, decision]

requires:
  - phase: 27-01
    provides: verified 1.8 portable backup on two nodes, rehearsal, cutover runbook
  - phase: 27-02
    provides: InfluxDB 2 connector and the CI compose pair (dhi.io/influxdb:2.9.1 + influxdb-setup)
  - phase: 27-03
    provides: week_V2/today_V2 fix, D-12 hardening, StatisticsV2Spec, read-only stats probe
  - phase: 27-08
    provides: CircleCI "Starting Influx" step on InfluxDB 2
provides:
  - Phase 27 connector live on production thinx_api (sha256:7b2f5e43d343, pushed SHA 69677540) with stats dormant (ensure skipped, no_token)
  - Success criterion 3 evidence: CI ran the influx specs against InfluxDB 2.9.1, 1018 specs, 0 failures
  - Stats points written with ns precision and strictly increasing per-process timestamps, so same-millisecond identical writes are no longer collapsed
  - Operator GO for the cutover window, F-2 option recorded as p27_go=go-B
  - Runbook annex rows release gate, GO decision, node repair, push dormant
affects: [27-05, 27-06, 27-07]

actuals:
  tokens: 2450
  tasks: 3
  commits: 6
plan_head_before: 85ce4f4ec509201a2f7edd272b1335e9aec8c28e
plan_head_after: b1ccbb8f238206a13c04b994b9e68da62e722f80

tech-stack:
  added: []
  patterns:
    - "Monotonic ns timestamps for InfluxDB points: wall-clock ms * 1e6 as a BigInt string, +1 ns when the clock repeats or steps back, never reset per process"
    - "Frozen-clock spec: replace global Date only around the synchronous part of statsLog, restore before awaiting"
    - "CI evidence greps tolerate CircleCI secret masking of common words (`[[*a-z]+-spec]`)"

key-files:
  created:
    - .planning/phases/27-influxdb-2-upgrade/27-04-SUMMARY.md
  modified:
    - lib/thinx/influx.js
    - spec/jasmine/StatisticsV2Spec.js
    - .planning/runbooks/influxdb2-upgrade.md

key-decisions:
  - "Operator chose go-B for F-2: InfluxDB admin gets a random password in an unmounted swarm secret; the UI is reached through an SSH tunnel; the public route stays behind influx-auth (D-14)"
  - "Operator waived the release-gate diff-hygiene hits (Decision A, waive-reviewed): a scan-pattern name in prose and the manager endpoint already published on origin"
  - "Operator chose fix-connector after CI #15564: stats writes move to ns precision with strictly increasing per-process timestamps instead of loosening the spec"
  - "No per-process random sub-ms offset: it would put points up to 1 ms in the future and make range(stop: now()) reads flaky; cross-replica same-ns collisions stay a documented residual"

patterns-established:
  - "Stats write timestamps: always via nextTimestamp() in lib/thinx/influx.js, never new Date() at ms precision"

requirements-completed: [OPS-INFLUX-02]

coverage:
  - id: D1
    description: "Same-millisecond identical stats writes, and writes under a clock that repeats or steps back, are all counted"
    requirement: OPS-INFLUX-02
    verification:
      - kind: integration
        ref: "spec/jasmine/StatisticsV2Spec.js#same-millisecond writes counts every point of a burst written within one millisecond"
        status: pass
      - kind: integration
        ref: "spec/jasmine/StatisticsV2Spec.js#same-millisecond writes never overwrites an earlier point when the clock repeats or steps back"
        status: pass
    human_judgment: false
  - id: D2
    description: "CI runs the influx specs against InfluxDB 2 and passes (success criterion 3)"
    requirement: OPS-INFLUX-02
    verification:
      - kind: other
        ref: "CircleCI test #15574 for 69677540: influx setup table, [******-spec] server_version=v2.9.1, 1018 specs, 0 failures (SC3-CI-ON-INFLUX2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "thinx_api runs the Phase 27 connector in production with stats dormant; thinx_influxdb untouched on 1.8"
    requirement: OPS-INFLUX-02
    verification:
      - kind: manual_procedural
        ref: "micro: ensure_skipped=1 ensure_failed=0 api_state=Running influx_image=influxdb:1.8; GET /api/v2/csrf-token 200"
        status: pass
    human_judgment: false
  - id: D4
    description: "Operator GO for the cutover window with the F-2 credential option recorded"
    verification: []
    human_judgment: true
    rationale: "A blocking-human decision; the record is the annex token p27_go=go-B, not a test"

duration: 1h 32m
completed: 2026-10-02
status: complete
---

# Phase 27 Plan 04: Release Gate, GO and Dormant Push Summary

**The InfluxDB 2 connector is live on production thinx_api with stats dormant. CI ran the influx specs against InfluxDB 2.9.1 (1018 specs, 0 failures). After the first push failed CI, stats points are now written with strictly increasing nanosecond timestamps, so same-millisecond writes are no longer undercounted.**

## Performance

- **Duration:** 1h 32m
- **Started:** 2026-10-02T17:32:49Z
- **Completed:** 2026-10-02T19:05:00Z
- **Tasks:** 3 of 3 (tracer, decision, ship)
- **Files modified:** 3

## Accomplishments

- Release gate on the CI compose pair: the 9-spec Phase 27 set passed, `npm run test:node` passed and production pre-flight was clean (influxdb:1.8, backup_ok=1, no stale INFLUXDB_* secrets). The diff-hygiene hits were waived by the operator.
- Operator GO with F-2 option B (`p27_go=go-B`).
- The first push (`60cd56da`) failed CircleCI `test` #15564 on a real connector bug. It was fixed RED → GREEN and re-gated locally (99 specs, 0 failures), then re-pushed once as `69677540`.
- CI for `69677540` is all green: `test` #15574, `api-registry` #15577, `console-classic-registry` #15578, `vue-console-registry` #15575. SC3 evidence was captured.
- thinx_api rolled from `sha256:a39b646bbb0e` to `sha256:7b2f5e43d343` within 2 min of the image publish. Boot logged `[influx] ensure bucket=stats action=skipped reason=no_token`, with 0 failed ensures. thinx_influxdb is still on influxdb:1.8. `T_dormant=2026-10-02T19:02:21Z`.

## Task Commits

1. **Task 1: release gate and production pre-flight** - `472f150e` (docs)
2. **Task 2: GO decision, p27_go=go-B** - `60cd56da` (docs)
3. **Task 3: ship the dormant connector**
   - `cedc4c22` test(27-04): same-millisecond stats writes must all be counted (RED)
   - `ba046a52` fix(27-04): write stats points with strictly increasing ns timestamps (GREEN)
   - `69677540` docs(27-04): node repair annex row (pushed SHA)
   - `b1ccbb8f` docs(27-04): dormant connector live (not pushed, per plan)

**Plan metadata:** this SUMMARY commit.

## Files Created/Modified

- `lib/thinx/influx.js`: WriteApi precision `ms` → `ns`. New `nextTimestamp()` returns a strictly increasing per-process BigInt string (wall-clock ms × 1e6, +1 ns on a repeated or backward clock). The header documents the timestamp contract.
- `spec/jasmine/StatisticsV2Spec.js`: new "same-millisecond writes" block with a frozen-clock burst of 4 and a clock-steps-back case.
- `.planning/runbooks/influxdb2-upgrade.md`: annex rows release gate, GO decision, node repair, push dormant.

## Decisions Made

- **F-2 (D-14): go-B.** The InfluxDB admin password is random and held only in an unmounted secret. The UI is reached through an SSH tunnel.
- **fix-connector (operator, after CI #15564).** The fix goes in the connector, not the spec.
- **Timestamp design.** Only a monotonic counter, with no random sub-ms offset. A forward offset could place points ahead of the server's `now()` and make immediate reads miss them. A timestamp runs ahead of the wall clock by at most 1 ns per write within the same millisecond.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, node repair] Same-millisecond stats writes collapsed into one point**
- **Found during:** Task 3 (first push, CircleCI `test` #15564)
- **Issue:** `StatisticsV2Spec` "another owner's points are never counted" got DEVICE_CHECKIN 2, expected 3. The connector wrote at `ms` precision with `timestamp(new Date())`. Identical measurement, tags and ms timestamp are one series point, and InfluxDB keeps the last one. This also caused the intermittent 27-03 3-failure run. In production it would silently undercount bursts from the same owner and event.
- **Fix:** Operator chose `fix-connector`. The RED spec was proven with `RED_EVIDENCE_OK` (1 vs 4, 2 vs 4 against the old connector). GREEN switches to ns precision with `nextTimestamp()`. Taxonomy filter, float value, log redaction, no-token dormancy and bounded retries are unchanged. Flux `range`/`count` in countsByKpi, countsDetailed, today and week read the same instants.
- **Files modified:** lib/thinx/influx.js, spec/jasmine/StatisticsV2Spec.js
- **Verification:** The GREEN spec passed 3 times on a warm instance and once on a fresh pair. The local Phase 27 gate passed (99 specs, 0 failures, PHASE27-LOCAL-GREEN). CI #15574 passed (1018 specs, 0 failures).
- **Committed in:** cedc4c22 (RED), ba046a52 (GREEN), 69677540 (annex)

**2. [Rule 3 - Blocking, plan verify] The SC3 grep could never match CircleCI output**
- **Found during:** Task 3
- **Issue:** CircleCI masks secret values that equal common words, so `[influx-spec]` prints as `[******-spec]` (and `thinx` as `*****`). The plan's `\[influx-spec\] server_version=v2\.` grep cannot match.
- **Fix:** The verify used the masked-tag form `\[[*a-z]+-spec\] server_version=v2\.`. The `User Organization Bucket` and `specs, 0 failures` greps match as written.
- **Verification:** `build=15574 [******-spec] server_version=v2.9.1 | 1018 specs, 0 failures, 1 pending spec`, then `SC3-CI-ON-INFLUX2`.

**3. [Operator waiver] Release-gate diff hygiene**
- **Found during:** Task 1
- **Issue:** Raw counts were `secret_hits=1 endpoint_hits=1 port_hits=1`, so DIFF-HYGIENE-OK was not printed. Hit 1 is a scan-pattern name in a Phase 26 SUMMARY. Hits 2 and 3 are the manager ssh line in a Phase 26 `.continue-here.md`, and that line is already on origin.
- **Resolution:** Operator Decision A (`waive-reviewed`). No history change. The re-push range `60cd56da..69677540` printed DIFF-HYGIENE-OK with all counts 0.

**4. [Rule 2 - TDD tooling] RED evidence needed TAP output**
- `gsd check tdd-red-evidence` parses TAP, and jasmine prints none. A throwaway TAP reporter (`/tmp/p27_tap_run.js`, not committed) ran the spec to produce the record.

---

**Total deviations:** 4 (1 bug fixed as the single allowed node repair, 1 verify-pattern fix, 1 operator waiver, 1 tooling adaptation)
**Impact on plan:** The connector fix is a real production correctness fix inside this phase's files. Production stayed on the rollback digest until the fixed SHA passed CI. There were two pushes in total, the second as the one allowed re-push. No scope creep.

## TDD Gate Compliance

- RED: `cedc4c22` test(27-04). Target spec "counts every point of a burst written within one millisecond" failed on its assertion; the verdict was `RED_EVIDENCE_OK`.
- GREEN: `ba046a52` fix(27-04). The orchestrator asked for the `fix(...)` type instead of `feat(...)` because this is a bug fix.
- REFACTOR: none needed.

## Issues Encountered

- **Stats write rate.** The real gap rate is about 41 points a week (1.8 data, last 90 days: 524 points), not the ~19 a week the planning context assumed. The D-06 gap runs from `T_dormant=2026-10-02T19:02:21Z` until 27-06 enables stats.
- **One-off cold-start zeros.** The very first local RED run on a freshly onboarded pair returned zero counts even for the existing seeded specs. It was not reproduced afterwards: warm runs ×3, a fresh pair running StatisticsV2Spec alone, and the full gate all passed. CI runs InfluxSpec first. Noted, not acted on.
- **Residual.** Two API replicas writing an identical point in the same nanosecond would still collide. thinx_api runs one replica, so this is accepted.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- 27-05 can start immediately. The GO is recorded (`p27_go=go-B`), thinx_influxdb is on influxdb:1.8 and untouched, `influx_secrets=0`, and the backup is verified. The stats write gap is now open, so the upgrade should follow promptly (D-05, D-06).
- The `docs(27-04): dormant connector live` commit `b1ccbb8f` and this SUMMARY are local only and ride the next push.
- Rollback reference: thinx_api `sha256:a39b646bbb0e` (pre-push), or revert and push.

## Self-Check: PASSED

- Commits found: 472f150e, 60cd56da, cedc4c22, ba046a52, 69677540, b1ccbb8f
- Files found: lib/thinx/influx.js, spec/jasmine/StatisticsV2Spec.js, .planning/runbooks/influxdb2-upgrade.md
- Plan verifies: p27_go recorded once; `api-registry=success console-classic-registry=success test=success vue-console-registry=success`; SC3-CI-ON-INFLUX2 (masked-tag grep); `ensure_skipped=1 ensure_failed=0 api_state=Running influx_image=influxdb:1.8`

---
*Phase: 27-influxdb-2-upgrade*
*Completed: 2026-10-02*
