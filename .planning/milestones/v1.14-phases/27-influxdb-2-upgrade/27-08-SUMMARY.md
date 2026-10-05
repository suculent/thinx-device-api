---
phase: 27-influxdb-2-upgrade
plan: 08
subsystem: infra
tags: [influxdb, ci, circleci, docker-compose, dhi, dev-stack]

requires:
  - phase: 27-influxdb-2-upgrade
    provides: "27-02 CI compose pair (dhi.io/influxdb:2.9.1 + influxdb-setup one-shot) in docker-compose.test.yml, connector env INFLUXDB_URL/INFLUXDB_ORG/INFLUXDB_TOKEN, ensureStatsBucket()"
provides:
  - "CircleCI 'Starting Influx': one stdin-only dhi.io login per job, up -d influxdb, run --rm influxdb-setup, logs"
  - "Dev docker-compose.yml on dhi.io/influxdb:2.9.1 with the six production INFLUXD_* settings, bind /mnt/gluster/thinx/influxdb2"
  - "Dev influxdb-setup one-shot with env-by-name credentials, idempotent on an already onboarded instance"
  - "Chronograf removed from the dev compose (D-13)"
  - "INTEGRATIONS.md Time-series section, test-job line and env table for InfluxDB 2"
affects: [27-04, 27-05, 27-06]

actuals:
  tokens: 2765
  tasks: 2
  commits: 2
plan_head_before: 26fab3ab60d62ceb5bcfdbe62f4de8c134ccf9d7
plan_head_after: 3ecc9b2887e7bb7cf9bfc59aec88149d53f9ee23

tech-stack:
  added: ["dhi.io/influxdb:2.9.1 (dev compose)", "influxdb:2.9.1 (dev setup one-shot)"]
  patterns:
    - "One dhi.io login per CI job, placed before the first DHI pull and shared by later steps on the same docker host"
    - "Setup one-shot against a persistent data dir treats 'has already been set up' as success"

key-files:
  created:
    - .planning/phases/27-influxdb-2-upgrade/27-08-SUMMARY.md
  modified:
    - .circleci/config.yml
    - docker-compose.yml
    - .planning/codebase/INTEGRATIONS.md

key-decisions:
  - "The dhi.io login moved into 'Starting Influx' (not duplicated); 'Starting Support Services' keeps only a pointer comment"
  - "Dev influxdb-setup exits 0 when influx setup reports 'has already been set up', because the dev data dir persists and the one-shot runs on every up"
  - "Dev setup creates bucket stats without a retention flag; ensureStatsBucket() at api boot stays the single owner of the 90-day retention"
  - "Dev api gets INFLUXDB_URL and INFLUXDB_TOKEN added (it had no INFLUXDB_* entries to replace)"

patterns-established:
  - "Run a CI step's own command text locally (extracted from the YAML, login line filtered) as its end-to-end verify"

requirements-completed: [OPS-INFLUX-02]

coverage:
  - id: D1
    description: "CircleCI 'Starting Influx' logs in to dhi.io once (stdin), starts influxdb, runs the influxdb-setup one-shot, all before 'Starting Support Services', which no longer logs in"
    requirement: OPS-INFLUX-02
    verification:
      - kind: other
        ref: "Task 1 verify 1 -> CI-INFLUX-ORDER-OK (login=763 < up=764 < setup=765 < support=775)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The step's own command text, run locally against docker-compose.test.yml (login line skipped), onboards InfluxDB 2 and the influx specs pass against it"
    requirement: OPS-INFLUX-02
    verification:
      - kind: integration
        ref: "Task 1 verify 2 -> CI-STEP-E2E-GREEN (setup table printed, server_version=v2.9.1, 24 specs, 0 failures)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dev compose: dhi.io/influxdb:2.9.1 env-only, influxdb-setup one-shot, chronograf gone, api INFLUXDB_TOKEN by name, no credential literals; INTEGRATIONS.md describes InfluxDB 2"
    requirement: OPS-INFLUX-02
    verification:
      - kind: other
        ref: "Task 2 verify 1 -> DEV-COMPOSE-V2-OK"
        status: pass
      - kind: other
        ref: "Task 2 verify 2 -> DEV-COMPOSE-NO-LITERALS (literal_credentials=0)"
        status: pass
      - kind: integration
        ref: "Local dev-pair run with a tmpfs override: setup table on first run, 'already onboarded' rc=0 on second"
        status: pass
    human_judgment: false
  - id: D4
    description: "Prohibitions: no CI step other than 'Starting Influx'/'Starting Support Services' changed; dhi.io password never in argv; no network or compose project left behind locally"
    requirement: OPS-INFLUX-02
    verification:
      - kind: other
        ref: "git diff of .circleci/config.yml (two hunks, both steps); docker network ls / docker compose ls diffed against a pre-run baseline -> unchanged"
        status: pass
    human_judgment: true
    rationale: "Plan flags both prohibitions as verification: judgment; a reviewer should confirm the CI diff scope and the stdin-only login"

duration: 6min
completed: 2026-10-02
status: complete
---

# Phase 27 Plan 08: CircleCI and Dev Stack on InfluxDB 2 Summary

**CircleCI's "Starting Influx" step now logs in to dhi.io once, before the first DHI pull. It then starts the DHI InfluxDB 2.9.1 and onboards it with the `influxdb-setup` one-shot. Run locally from its own YAML text, the step produced an onboarded server and the influx specs passed against it (24 specs). The dev compose runs the same env-only InfluxDB 2 as production, with an idempotent setup one-shot and no Chronograf.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-02T17:12Z (approx., plan load)
- **Completed:** 2026-10-02T17:17Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **CI wiring (Pitfall 9, D-08).** The dhi.io login line moved from "Starting Support Services" into "Starting Influx", after the network checks and before `docker compose up -d influxdb`. `docker compose run --rm influxdb-setup` follows the `up`, and `docker compose logs influxdb` stays last. The login appears once in the job and takes the password on stdin only.
- **Local proof of the CI step.** The verify extracts the "Starting Influx" command from the parsed YAML and drops only the login line. It runs the rest under `COMPOSE_FILE=docker-compose.test.yml`, which stands in for CI's rename. Results: step_rc=0, the `User Organization Bucket` setup table printed, `[influx-spec] server_version=v2.9.1`, and 24 specs with 0 failures.
- **Dev compose (D-13, D-16).**
  - `influxdb` runs `dhi.io/influxdb:2.9.1` with the six production `INFLUXD_*` settings and binds `/mnt/gluster/thinx/influxdb2`. A comment notes that the dir must be owned by uid 65532.
  - A new `influxdb-setup` one-shot reads `INFLUXDB_USERNAME`/`PASSWORD`/`TOKEN` by name.
  - `chronograf` is gone.
  - The api gets `INFLUXDB_URL` and `INFLUXDB_TOKEN=${INFLUXDB_TOKEN}`.
- **Integrations map.** The Time-series section now covers InfluxDB 2: the image and CLI one-shots, the env-only config, the v2 client pins, `INFLUXDB_URL`/`INFLUXDB_ORG`/`INFLUXDB_TOKEN`, bucket `stats` with 90-day retention via `ensureStatsBucket()`, and the unchanged measurements and tag schema. The CircleCI test-job line and the env table were updated to match. Only names are written, never values.

## Task Commits

1. **Task 1 (tracer): CircleCI "Starting Influx" logs in to dhi.io and onboards InfluxDB 2.** `5a62897c` (ci). Tracer gate: interactive run with `human_verify_mode` end-of-phase and an automated-only verify. CI-INFLUX-ORDER-OK and CI-STEP-E2E-GREEN passed, so expansion continued with no checkpoint.
2. **Task 2: dev compose on InfluxDB 2 without Chronograf; integrations map.** `3ecc9b28` (feat).

## Files Created/Modified

- `.circleci/config.yml`: "Starting Influx" gains the login, its comment and the setup one-shot; "Starting Support Services" loses its login.
- `docker-compose.yml`: the influxdb service on DHI 2.9.1 (env-only), the `influxdb-setup` one-shot, chronograf removed, api `INFLUXDB_URL`/`INFLUXDB_TOKEN`. The file now also ends with a trailing newline.
- `.planning/codebase/INTEGRATIONS.md`: the Time-series section, the test-job line and the env table rows.

## Decisions Made

- **Idempotent dev setup.** `influx setup` fails with `Error: instance has already been set up` on an onboarded server. The dev data dir persists, so a plain copy of the CI one-shot would exit 1 on every `docker compose up` after the first. The dev one-shot exits 0 on that message and still prints and fails on any other error. Both paths were checked with a probe against DHI 2.9.1 (first run: table, rc=0; second run: "already onboarded", rc=0).
- **No retention flag at setup.** Dev setup creates `stats` with default retention. `ensureStatsBucket()` at api boot is the one place that sets 90 days, the same split as CI.
- **Login comment.** The moved comment now states that both dhi.io/influxdb and dhi.io/couchdb reject anonymous pulls and that one login on the docker host serves both steps.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The dev api had no v1 INFLUXDB_USERNAME/INFLUXDB_PASSWORD lines to replace**
- **Found during:** Task 2.
- **Issue:** The plan said to replace the api's v1 `INFLUXDB_USERNAME`/`INFLUXDB_PASSWORD` entries and keep `INFLUXDB_URL`. The dev api `environment:` had no `INFLUXDB_*` entries at all; only chronograf and influxdb did.
- **Fix:** Added `'INFLUXDB_URL=http://influxdb:8086'` and `'INFLUXDB_TOKEN=${INFLUXDB_TOKEN}'` to the api environment. This meets the must-have "gives the api INFLUXDB_TOKEN by name".
- **Files modified:** docker-compose.yml.
- **Verification:** DEV-COMPOSE-NO-LITERALS (literal_credentials=0).
- **Committed in:** 3ecc9b28.

**2. [Rule 2 - Missing critical] Dev setup one-shot made re-runnable**
- **Found during:** Task 2.
- **Issue:** A verbatim copy of the CI one-shot fails on every dev `up` after the first, because the dev data dir is persistent rather than tmpfs.
- **Fix:** Treat `has already been set up` as success; any other error is still printed and exits 1.
- **Files modified:** docker-compose.yml.
- **Verification:**
  - A local dev-pair run used a temporary tmpfs override in place of the gluster bind, which does not exist on macOS. The first run printed the setup table; the second printed "already onboarded" with rc=0.
  - The override file was deleted afterwards, and the network and compose project lists match the pre-run baseline.
- **Committed in:** 3ecc9b28.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical).
**Impact on plan:** Both stay inside the plan's files and intent. No scope creep.

## Issues Encountered

- `docker-compose.yml` had no trailing newline, so the first scripted edit's end anchor missed. It was re-anchored, and nothing was written by the failed attempt.
- The 27-02 note about `--retry-all-errors` did not apply: this plan adds no host-side curl wait. The one-shot waits with `influx ping` inside the compose network.

## Known Stubs

None.

## User Setup Required

None for this plan. Developers using the dev compose need `INFLUXDB_USERNAME`, `INFLUXDB_PASSWORD` and `INFLUXDB_TOKEN` in their environment and `/mnt/gluster/thinx/influxdb2` owned by 65532. Both are documented in the compose comments and INTEGRATIONS.md.

## Next Phase Readiness

- 27-04 pushes to CircleCI. The SC3 evidence there is the `influx setup` User/Organization/Bucket table in the "Starting Influx" output, plus a green suite.
- Assumption A-27-02-3 (tmpfs form on CI Compose v2.4.1) is still unproven until that run. This plan proved it only on local Compose v5.5.1.
- The dhi.io login now runs one step earlier. If `DOCKER_PUBLIC_PASSWORD`/`DOCKER_USERNAME` are not available in the `test` job context, the failure moves to "Starting Influx".

---
*Phase: 27-influxdb-2-upgrade*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: .circleci/config.yml, docker-compose.yml, .planning/codebase/INTEGRATIONS.md
- FOUND commits: 5a62897c, 3ecc9b28
- Plan verification: CI-INFLUX-ORDER-OK, CI-STEP-E2E-GREEN, DEV-COMPOSE-V2-OK, DEV-COMPOSE-NO-LITERALS
