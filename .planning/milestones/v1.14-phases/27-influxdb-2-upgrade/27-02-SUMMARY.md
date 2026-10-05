---
phase: 27-influxdb-2-upgrade
plan: 02
subsystem: api
tags: [influxdb, influxdb-client, flux, retention, ci, docker-compose, dhi, secrets]

requires:
  - phase: 24-secrets
    provides: readSecret() Docker-secret-then-env helper (D-10 token read)
  - phase: 26-vue-console-log-paging
    provides: design_upsert never-reject ensure pattern and withTimeout
provides:
  - InfluxDB 2 connector (lib/thinx/influx.js) on @influxdata/influxdb-client 1.35.0 with Flux-parameter queries
  - Boot step InfluxConnector.ensureStatsBucket() converging bucket stats to 7776000 s (created/adopted/updated/unchanged/skipped/failed)
  - Disabled-stats mode when INFLUXDB_TOKEN is absent (dormant connector for the 27-05/27-06 cutover)
  - CI compose pair (dhi.io/influxdb:2.9.1 + influxdb-setup one-shot) and api INFLUXDB_URL/INFLUXDB_TOKEN env
  - Live v2 specs InfluxSpec.js and InfluxRetentionSpec.js
affects: [27-03, 27-04, 27-05, 27-06, 27-08]

actuals:
  tokens: 15600
  tasks: 2
  commits: 4
plan_head_before: 82ac41b2489560221300bd641e06f0f6cbf3dfe9
plan_head_after: 246e5a106d02cfd0f8052b0290d4f7804fbfac89

tech-stack:
  added: ["@influxdata/influxdb-client 1.35.0", "@influxdata/influxdb-client-apis 1.35.0", "dhi.io/influxdb:2.9.1 (CI)", "influxdb:2.9.1 (CI setup one-shot)"]
  removed: ["influx (node-influx) 5.11.0"]
  patterns:
    - "Lazy module-level InfluxDB state: undefined = uninitialised, null = disabled, object = one shared WriteApi/QueryApi"
    - "Flux built only with the flux tagged template; owner reaches Flux as a parameter, never concatenated"
    - "Terse setLogger + reasonOf (statusCode / code / timeout only) so client errors never log URL or Authorization header"
    - "Boot ensure resolves {ok, action, reason}, never rejects, logs exactly one `[influx] ensure bucket=` line"

key-files:
  created:
    - .planning/phases/27-influxdb-2-upgrade/27-02-SUMMARY.md
  modified:
    - lib/thinx/influx.js
    - thinx-core.js
    - package.json
    - package-lock.json
    - spec/jasmine/InfluxSpec.js
    - spec/jasmine/InfluxRetentionSpec.js
    - docker-compose.test.yml
    - scripts/aikido-known-false-positives.json

key-decisions:
  - "Client packages pinned exactly at 1.35.0 (not ^1.35.0), per the T-27-SC mitigation"
  - "CI compose uses the tmpfs form (/var/lib/influxdb2 uid=65532); the research A5 fallback was not needed on Compose v5.5.1"
  - "ensureStatsBucket maps a 404 from getOrgs to reason no_org (same as an empty org list)"
  - "query/queryOwner reuse countsByKpi with start = epoch, so all four count paths share one Flux query"

patterns-established:
  - "InfluxDB 2 admin/test setup goes through BucketsAPI/OrgsAPI, never raw HTTP"
  - "Live influx specs read INFLUXDB_URL/INFLUXDB_TOKEN and fail hard (no silent skip) when unset"

requirements-completed: [OPS-INFLUX-02, OPS-INFLUX-03]

coverage:
  - id: D1
    description: "v2 connector: statsLog write -> flush -> Flux count per taxonomy measurement, console line without trailing undefined, non-taxonomy drop, {KPI:[n]} today/week, owner isolation, inert Flux-parameter injection"
    requirement: OPS-INFLUX-02
    verification:
      - kind: integration
        ref: "spec/jasmine/InfluxSpec.js#InfluxDB 2 connector (9 specs) against influxdb:2.9.1 -> INFLUX-V2-TRACER-GREEN"
        status: pass
    human_judgment: false
  - id: D2
    description: "No-token disabled mode and outage behaviour: one disabled line, zeros, bounded time, zero unhandled rejections, no token in logs"
    requirement: OPS-INFLUX-02
    verification:
      - kind: integration
        ref: "spec/jasmine/InfluxSpec.js#without INFLUXDB_TOKEN / with InfluxDB unreachable"
        status: pass
    human_judgment: false
  - id: D3
    description: "Package swap: node-influx gone, @influxdata/influxdb-client(-apis) 1.35.0 resolved, no InfluxQL left, thinx-core.js boot calls ensureStatsBucket()"
    requirement: OPS-INFLUX-02
    verification:
      - kind: other
        ref: "Task 1 verify 2 -> V2-CLIENT-SWAP-OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "Boot bucket ensure matrix (created, adopted with same id, updated, unchanged, skipped no_token/no_org/timeout, failed 422, legacy_present) with fakes and live; real stats repaired to 7776000"
    requirement: OPS-INFLUX-03
    verification:
      - kind: unit
        ref: "spec/jasmine/InfluxRetentionSpec.js#unit (fake apis) (9 specs)"
        status: pass
      - kind: integration
        ref: "spec/jasmine/InfluxRetentionSpec.js#live (InfluxDB 2) (6 specs)"
        status: pass
    human_judgment: false
  - id: D5
    description: "CI compose pair on dhi.io/influxdb:2.9.1 onboarded by the official setup one-shot; full influx spec set green against it; stale Aikido entries removed"
    requirement: OPS-INFLUX-02
    verification:
      - kind: integration
        ref: "Task 2 verify 1 -> CI-PAIR-INFLUX-GREEN (43 specs, 0 failures, setup_rc=0)"
        status: pass
      - kind: other
        ref: "Task 2 verify 2 -> CI-COMPOSE-SHAPE-OK"
        status: pass
    human_judgment: false
  - id: D6
    description: "Prohibition: a stats failure never throws into, rejects in, or blocks a device check-in, build or login path"
    requirement: OPS-INFLUX-02
    verification:
      - kind: integration
        ref: "InfluxSpec outage and no-token cases (unhandledRejection collector empty, statsLog resolves)"
        status: pass
    human_judgment: true
    rationale: "Plan flags this prohibition as verification: judgment; the specs prove the connector contract, but a reviewer should confirm no caller path awaits stats in a blocking way"

duration: 15min
completed: 2026-10-02
status: complete
---

# Phase 27 Plan 02: InfluxDB 2 Connector, Boot Bucket Ensure and CI Pair Summary

**`lib/thinx/influx.js` now runs on @influxdata/influxdb-client 1.35.0 with parameterised Flux. A never-rejecting boot step converges bucket `stats` to 90-day retention (it adopts `stats/autogen` in place). With no `INFLUXDB_TOKEN`, stats stay off. CI's test compose runs the influx specs against a DHI InfluxDB 2.9.1 pair.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-02T16:57Z (approx., plan load)
- **Completed:** 2026-10-02T17:12Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- **Connector rewrite.** `statsLog`, `writePoint`, `countsByKpi`, `today`, `week`, `query` and `queryOwner` all talk to InfluxDB 2 through one module-level WriteApi (bounded retries) and the `flux` template. None of them throws or rejects. The tag schema is unchanged and the field is written as a float (`floatField value=1`).
- **Boot ensure.** `ensureStatsBucket()` covers every branch from research Pattern 4: created, adopted, updated, unchanged, skipped and failed, plus the `legacy_present` warning. It logs exactly one `[influx] ensure bucket=` line. `thinx-core.js` calls it at boot instead of `createDB('stats')`.
- **Disabled mode (D-10).** With no `INFLUXDB_TOKEN`, the connector logs one line, writes are no-ops and queries return zeros. The connector can therefore ship before the 27-05/27-06 cutover and stay dormant.
- **CI compose.** The test compose's `influxdb` service is now `dhi.io/influxdb:2.9.1`, configured by env only on a tmpfs. A new `influxdb-setup` one-shot (official image) runs `influx setup`, and the api service gets `INFLUXDB_URL` and `INFLUXDB_TOKEN`. The full influx set (43 specs) passes against this pair.
- **Package swap (D-09).** node-influx and its four Aikido false-positive entries are gone.

## Task Commits

1. **Task 1 (tracer): boot ensure → statsLog → Flux count → week {KPI:[n]}**
   - RED: `12e5db06` (test). The 1.x connector failed 9/9 on a real v2.9.1 server; `check tdd-red-evidence` returned `RED_EVIDENCE_OK` for the target test "statsLog without data logs exactly [OID:<owner>] [LOGIN_INVALID] and adds one point".
   - GREEN: `25c11fe8` (feat). The commit message names D-03, D-09 and D-10.
2. **Task 2: ensure matrix, CI compose pair, Aikido cleanup**
   - `ca6ca0ab` (test): InfluxRetentionSpec.
   - `246e5a10` (ci): compose and Aikido list.

## TDD Gate Compliance

- **Task 1.** RED `12e5db06` came before GREEN `25c11fe8`, and the RED evidence verdict was `RED_EVIDENCE_OK` (target_test_failed). No refactor commit was needed.
- **Task 2.** Exempt from the RED gate: its `<files>` hold only spec, YAML and JSON. Its spec passed on first run because `ensureStatsBucket` landed in the Task 1 tracer. Its teeth were checked by mutation instead. Two mutants were applied temporarily: "any non-zero retention counts as unchanged" and "never report legacy_present". The updated, failed/422 and legacy_present unit specs went red, and the file was restored byte-identical afterwards.

## Files Created/Modified

- `lib/thinx/influx.js`: the v2 connector, with `statsLog`, `measurements`, `ensureStatsBucket`, `_resetForTests`, `writePoint`, `countsByKpi`, `today`, `week`, `query` and `queryOwner`.
- `thinx-core.js`: the boot call `InfluxConnector.ensureStatsBucket().catch(() => {})`.
- `package.json` / `package-lock.json`: `influx` removed; `@influxdata/influxdb-client` and `-apis` pinned exactly at 1.35.0. The lockfile diff touches only these three packages.
- `spec/jasmine/InfluxSpec.js`: the live v2 connector spec (`[influx-spec] server_version=` marker).
- `spec/jasmine/InfluxRetentionSpec.js`: the bucket-ensure matrix, unit and live.
- `docker-compose.test.yml`: the `influxdb` (DHI) and `influxdb-setup` services, plus the api `INFLUXDB_URL`/`INFLUXDB_TOKEN` env.
- `scripts/aikido-known-false-positives.json`: the 4 stale `lib/thinx/influx.js` entries removed.

## Decisions Made

- **Exact version pins.** `npm install --save` wrote `^1.35.0`; it was changed to `1.35.0` to match the threat model's "exact 1.35.0 pins" (T-27-SC).
- **tmpfs form used.** The A5 fallback was **not** used: Compose v5.5.1 accepted `tmpfs: /var/lib/influxdb2:uid=65532,gid=65532` and `$$` escaping, and DHI onboarded (setup_rc=0). The CI side (Compose v2.4.1) is still unproven until 27-04 (assumption A-27-02-3).
- **getOrgs 404 → `no_org`.** A 404 from `getOrgs` maps to reason `no_org`, the same as an empty org list. Other getOrgs failures report their status or code.
- **Shared Flux path.** `query`/`queryOwner` validate the measurement (taxonomy) and the owner (regex), then reuse `countsByKpi` from epoch. All four count paths therefore share one parameterised Flux query.
- **Fail hard without env.** The live specs fail hard when `INFLUXDB_URL`/`INFLUXDB_TOKEN` are missing. They never skip silently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Old 1.x InfluxRetentionSpec removed in the Task 1 GREEN commit**
- **Found during:** Task 1.
- **Issue:**
  - `spec/jasmine/InfluxRetentionSpec.js` required the removed `influx` package and the removed `createDB`.
  - Task 1's V2-CLIENT-SWAP-OK check (`! grep -rlE "require('influx')" lib spec …`) could not pass while that file existed.
- **Fix:** `git rm` in `25c11fe8`. Task 2 recreated the file as the v2 bucket-ensure spec (`ca6ca0ab`).
- **Files modified:** spec/jasmine/InfluxRetentionSpec.js.
- **Verification:** V2-CLIENT-SWAP-OK printed. CI-PAIR-INFLUX-GREEN includes the new file.
- **Committed in:** 25c11fe8 (deletion), ca6ca0ab (recreation).

**2. [Rule 3 - Blocking] The Task 1 verify's health wait does not survive Docker's port proxy**
- **Found during:** Task 1 verification.
- **Issue:**
  - Right after `docker run -p 127.0.0.1::8086`, docker-proxy accepts the connection and closes it. curl exits with 52 ("empty reply").
  - `--retry-connrefused` does not retry exit 52, so the verbatim command printed `NO-INFLUX` immediately. This was reproduced: exit 52 three times, then 200.
  - This contradicts assumption A-27-02-4. The race is with the proxy, not with onboarding.
- **Fix:** ran the same command with `--retry-all-errors` added; nothing else changed. INFLUX-V2-TRACER-GREEN was printed (28 specs, 0 failures). No repository file is affected. Any reuse of this wait loop, for example in 27-08 CI wiring, should add `--retry-all-errors`. The Task 2 compose path (`influx ping` loop) was not affected.
- **Files modified:** none.
- **Verification:** INFLUX-V2-TRACER-GREEN.

**3. [Rule 2 - Missing critical] Exact package pins**
- **Found during:** Task 1.
- **Issue:** npm wrote caret ranges. The threat model mitigation T-27-SC requires exact 1.35.0 pins.
- **Fix:** pinned both packages exactly and re-ran `npm install`. `npm ls` resolves 1.35.0 for both.
- **Files modified:** package.json, package-lock.json.
- **Committed in:** 25c11fe8.

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical). None affects scope.
**Impact on plan:** None of them changes the connector contract. Deviation 2 is a test-harness note for 27-08.

## Issues Encountered

None beyond the deviations above.

## Known Stubs

None.

## User Setup Required

None. No external service configuration is required. Production enablement (`INFLUXDB_TOKEN` secret on `thinx_api`) belongs to the 27-05/27-06 cutover checkpoints.

## Next Phase Readiness

- 27-03 can fix `statistics.js` `today_V2`/`week_V2` (F-1) against the `{KPI:[n]}` callback shape proven here.
- 27-08 must:
  - log in to dhi.io before the influx step (Pitfall 9);
  - run `docker compose run --rm influxdb-setup` after `up -d influxdb`;
  - use `--retry-all-errors` in any host-side curl health wait.
- The connector ships dormant: until `thinx_api` gets the `INFLUXDB_TOKEN` secret, it logs `statistics disabled` plus `ensure … action=skipped reason=no_token`.

---
*Phase: 27-influxdb-2-upgrade*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: lib/thinx/influx.js, spec/jasmine/InfluxSpec.js, spec/jasmine/InfluxRetentionSpec.js, docker-compose.test.yml, thinx-core.js
- FOUND commits: 12e5db06, 25c11fe8, ca6ca0ab, 246e5a10
- Plan verification: INFLUX-V2-TRACER-GREEN, V2-CLIENT-SWAP-OK, CI-PAIR-INFLUX-GREEN, CI-COMPOSE-SHAPE-OK
