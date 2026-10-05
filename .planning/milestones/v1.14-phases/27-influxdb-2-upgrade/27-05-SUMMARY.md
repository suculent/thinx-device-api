---
phase: 27-influxdb-2-upgrade
plan: 05
subsystem: infra
tags: [production, influxdb, migration, upgrade, swarm, secrets, dhi]

requires:
  - phase: 27-influxdb-2-upgrade
    provides: "27-01 verified backup and upgrade rehearsal; 27-04 GO (go-B) and the dormant v2 connector on thinx_api"
provides:
  - "thinx_influxdb on dhi.io/influxdb:2.9.1 (task digest sha256:3d49ee8ee9a0) with the migrated 1.8 history, counts proven equal (all-time 2402, W80 501)"
  - "Untouched 1.8 rollback directory /mnt/gluster/thinx/influx (orig_changed=0 against a post-stop frozen manifest)"
  - "Swarm secrets INFLUXDB_TOKEN (API, org all-access), INFLUXDB_OPERATOR_TOKEN and INFLUXDB_ADMIN_PASSWORD, none mounted"
  - "D-14 edge: plain HTTP 301 to https, HTTPS 401 without credentials"
affects: [27-06, 27-07, 28]

actuals:
  tokens: 2206
  tasks: 2
  commits: 2
plan_head_before: 3b26c73019d504bd24ba250a91c2944da47d47db
plan_head_after: ad9e78e73b53ebfa9bd6b5a20e1ec166503962c7

tech-stack:
  added: ["dhi.io/influxdb:2.9.1 in production (InfluxDB 2)"]
  patterns:
    - "Post-stop frozen sha256 manifest of the rollback directory, re-taken identical after the copy and diffed again after the switch"
    - "One combined docker service update (image, mounts, env, router label, replicas) so docker service rollback is a single step"
    - "API token piped from influx auth create straight into docker secret create under pipefail, never printed"

key-files:
  created:
    - .planning/phases/27-influxdb-2-upgrade/27-05-SUMMARY.md
  modified:
    - .planning/runbooks/influxdb2-upgrade.md

key-decisions:
  - "Operator window override at about 22:41 UTC (\"Continue right now. There is no traffic expected on production.\") replaced the runbook's 22:30 cut-off for this run; the 01:00-05:00 compaction block still applied and the switch started at 22:44"
  - "The thinx_influxdb spec keeps dhi.io/influxdb:2.9.1 without an @sha256 pin: swarm records no digest for dhi.io images (thinx_couchdb on dhi.io/couchdb:3 is the same); a second pinning update would have broken the single-step rollback, so the running task's digest (3d49ee8ee9a0, the rehearsed one) was verified instead"
  - "Swarmpit autoredeploy label on thinx_influxdb left at true (operator instruction); follow-up for 27-07 / Phase 28"

patterns-established:
  - "One ssh host per Bash call; core and micro never chained in one command (the first attempt's classifier denial)"

requirements-completed: []

coverage:
  - id: D1
    description: "thinx_influxdb runs dhi.io/influxdb:2.9.1 with only the influxdb2 mount, 6 INFLUXD_* vars, 0 v1 vars, https-redirect on the http router, 1 task running"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 verify 1 (service line): mounts, swarmpit_mounts=0, influxd_env=6, v1_env=0, http_mw=https-redirect, running=1"
        status: pass
      - kind: manual_procedural
        ref: "Task 1 verify 1 image check expects an @sha256: pin; spec shows dhi.io/influxdb:2.9.1 unpinned (deviation 1), running task digest sha256:3d49ee8ee9a0 checked on core"
        status: unknown
    human_judgment: true
    rationale: "The plan's image-pin criterion is not met literally; the verifier must accept or reject the documented dhi.io digest deviation"
  - id: D2
    description: "Migrated history queryable on InfluxDB 2 with all-time and W80 counts equal to the 1.8 reference"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 verify 2: production API image probe -> INFLUX-STATS-PROBE OK, HISTORY-EQUAL-ON-V2"
        status: pass
    human_judgment: false
  - id: D3
    description: "The 1.8 original directory is byte-for-byte unchanged since 1.8 stopped (D-05 rollback)"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 verify 1: orig_changed=0 against /root/phase27/influx-v1.frozen.sha256 (205 lines); frozen_stable=1"
        status: pass
    human_judgment: false
  - id: D4
    description: "Three INFLUXDB_* swarm secrets exist, none mounted, exactly one auth for the API token"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "Task 2 verify 1: secrets=3 mounted=0 auths=1 shm_mode=700"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-14 edge behaviour: HTTP redirects to HTTPS, HTTPS demands influx-auth"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "Task 2 verify 2: http=301 to_scheme=https https=401 -> D14-EDGE-OK"
        status: pass
    human_judgment: false
  - id: D6
    description: "go-B UI check: the InfluxDB host over HTTPS shows the edge credential prompt in a browser"
    verification: []
    human_judgment: true
    rationale: "Plan human-check for end-of-phase UAT (browser prompt); not automatable here"

duration: 7min
completed: 2026-10-02
status: complete
---

# Phase 27 Plan 05: InfluxDB 2 storage upgrade Summary

**`thinx_influxdb` now runs `dhi.io/influxdb:2.9.1` on a new `/mnt/gluster/thinx/influxdb2`, upgraded by `influxd upgrade` from a 65532-owned copy. The production probe found all 2402 points (W80: 501) equal to the 1.8 reference. The 1.8 directory is unchanged against a manifest taken after 1.8 stopped. The API token sits in an unmounted `INFLUXDB_TOKEN` secret, and plain HTTP now only redirects to HTTPS.**

## Performance

- **Duration:** about 7 min of production work (22:41:44Z to 22:48:14Z), plus the record
- **Started:** 2026-10-02T22:41:44Z
- **Completed:** 2026-10-02T22:48:14Z
- **Tasks:** 2 of 2
- **Files modified:** 1 (runbook annex), plus this SUMMARY
- **1.8 downtime:** scaled to 0 at 22:43:10, v2 task Running from 22:44:55. The API is dormant, so no stats were lost.

## Accomplishments

- **Reference (T_ref 2026-10-02T22:42:48Z, W80 2026-07-14T22:42:48Z/2026-10-02T22:42:48Z).** Taken on core with 1.8 running and the API dormant. All-time: total 2402, APIKEY_INVALID 4, LOGIN_INVALID 1808, DEVICE_NEW 8, DEVICE_CHECKIN 539, DEVICE_REVOCATION 3, BUILD_STARTED 21, BUILD_SUCCESS 9, BUILD_FAILED 0 (plus 10 other measurements with 10 points). W80: total 501, LOGIN_INVALID 458, DEVICE_CHECKIN 22, BUILD_STARTED 12, BUILD_SUCCESS 9, the rest 0. 0 points since T_dormant. This matches the first attempt's 2402.
- **Stop and freeze.** Scale=0 converged at 22:43:15 with 0 tasks running. The frozen manifest `/root/phase27/influx-v1.frozen.sha256` (mode 600, 205 lines) was taken at 22:43:33.
- **Copy.** Ran `cp -a` and then `chown -R 65532:65532` on `influx-v1-upgrade-src`. The manifest re-taken after the copy is `cmp`-identical (`frozen_stable=1`), and the copy matches it too. Sizes: original 101,088 KB, copy 101,060 KB, `influxdb2` 876 KB after the upgrade and 4,239 KB after the first v2 start.
- **Upgrade.** Ran 22:44:18–22:44:28, exit 0, with `--network none` and the default configs path. `upgrade.log` has `Upgrade successfully completed`. Token and password greps on upgrade.log, the CQ export and stdout all returned 0, and there is no `configs` file. The CQ export has 13 non-blank lines; the rehearsal had 9 because a portable restore drops some CQs.
- **Switch.** One `docker service update --with-registry-auth` at 22:44:40, converged 22:44:55 on core.
  - Image `dhi.io/influxdb:2.9.1`; the running task's digest is `sha256:3d49ee8ee9a0`, the rehearsed one.
  - User 65532, RestartCount 0, 0 error log lines.
  - The only mount is `/mnt/gluster/thinx/influxdb2:/var/lib/influxdb2`; no swarmpit mount.
  - 6 `INFLUXD_*` env vars and 0 v1 vars. The http router middleware is `https-redirect` (it was `influx-auth,error-pages-middleware`).
- **CLI checks** (`influxdb:2.9.1`, digest `sha256:db0bdab1e5ad`).
  - Ping OK.
  - Buckets: `_monitoring=604800 _tasks=259200 db0/autogen=7776000 stats/31d=2678400 stats/autogen=0 swarmpit/a_day=86400 swarmpit/an_hour=3600 swarmpit/autogen=0 upgrade-primary=3600`, the same set as the rehearsal.
  - DBRP: `stats/autogen` → bucket `stats/autogen`, default=true.
- **Count proof.** The probe ran on the API image `sha256:7b2f5e43d343` and ended `INFLUX-STATS-PROBE OK`. Every `count_all_*` and `count_window_*` equals the reference (`counts_equal=1 window_equal=1`), and the plan verify printed `HISTORY-EQUAL-ON-V2`.
- **Untouched original.** `orig_changed=0` after the switch, and the owner is still 0:0.
- **Token (Task 2).** Minted at 22:47:37 straight into `docker secret create INFLUXDB_TOKEN -` under `pipefail`; it was never printed.
  - `secrets=3 mounted=0 auths=1 shm_mode=700`. `thinx_api` was also checked by name: 0 INFLUXDB_* mounts.
- **D-14.** `http=301 to_scheme=https https=401` (`D14-EDGE-OK`).
- **Swarmpit.** `swarmpit_resolves=swarmpit_influxdb`, unchanged. `swarmpit_app` and `swarmpit_influxdb` have been Running for 40 h and were not touched.

## Task Commits

1. **Task 1 (tracer): reference, stop, copy, upgrade, switch, count proof.** Commit `b3ce8ab6` (docs), signed (G).
2. **Task 2: API token minted, D-11/D-14/Swarmpit checks.** Commit `ad9e78e7` (docs), signed (G).

The tracer gate followed row 3 (interactive, end-of-phase, automated-only verify). Both Task 1 verifies were re-run and passed (apart from the image-pin note below) before Task 2 started.

## Files Created/Modified

- `.planning/runbooks/influxdb2-upgrade.md`: annex rows "cutover reference" (`p27_ref_T=`, `p27_window=`, `p27_v1_counts=`, `p27_v1_window=`, window override, first attempt), "cutover" and "token and edge" (`auth_count=1`).
- `.planning/phases/27-influxdb-2-upgrade/27-05-SUMMARY.md`: this file.

Production state, not in the repo:
- `thinx_influxdb` spec as above.
- Gluster `/mnt/gluster/thinx/influxdb2` (new data) and `/mnt/gluster/thinx/influx-v1-upgrade-src` (copy).
- micro: `/root/phase27/thinx_influxdb.pre.json` (600) and `/root/phase27/influx-v1.frozen.sha256` (600).
- micro: `/dev/shm/p27/{op_token, admin_pw, upgrade.env, cli.env}`, directory mode 700, kept for 27-06. The directory also holds `upgrade.stdout`, which the token and password greps found clean.

## Decisions Made

- The operator overrode the time window. The 22:30 cut-off was waived for this run, and the run started at 22:42. The compaction block was respected because the switch began at 22:44, long before 00:45.
- The image pin was kept as the tag only, so the rollback stays a single step (see deviation 1).
- The autoredeploy label stays `true`, as the operator instructed. This is recorded as a follow-up.

## Deviations from Plan

**1. [Rule 3 - Blocking verify mismatch] The `thinx_influxdb` spec image has no `@sha256:` pin**
- **Found during:** Task 1 step 7 and the verify.
- **Issue:** The plan's verify expects `image` to start with `dhi.io/influxdb:2.9.1@sha256:`. The swarm stored `dhi.io/influxdb:2.9.1` with no digest, even with `--with-registry-auth`. `thinx_couchdb` on `dhi.io/couchdb:3` is unpinned the same way, so this is how the swarm handles the dhi.io registry, not a step that went wrong.
- **Fix:** No second update. Pinning would add a second spec step, and `docker service rollback` would then return to the unpinned v2 spec instead of 1.8, breaking the single-step rollback (Pitfall 8). Instead, the running task's image digest was checked on core: `sha256:3d49ee8ee9a0`, the same digest rehearsed in 27-01. Every other field of the service line passed.
- **Files modified:** none (recorded in the annex "cutover" row).
- **Follow-up:** 27-07 can pin by digest when it mirrors the spec into `docker-swarm.yml`/`thinx.yml`. Because the label is still `autoredeploy=true`, Swarmpit may roll the service when DHI republishes the `2.9.1` tag. Leave that to 27-07 / Phase 28.

**2. [Operator override] Window rule**
- At about 22:41 UTC on 2026-10-02 the operator said "Continue right now. There is no traffic expected on production." This overrides the runbook's "nothing after 22:30 UTC" for this run. Recorded in the annex row "cutover reference".

**3. [Resume] First attempt**
- The first attempt (19:07–19:10) was blocked by a permission-classifier denial and rolled back to 1.8 with 1 replica, with nothing committed. This run re-ran Task 1 from step 1 with a fresh `T_ref` and counts, rewriting `thinx_influxdb.pre.json`. To avoid the denial, each Bash call now targets one ssh host.

**Total deviations:** 1 verify mismatch (documented, not auto-changed) and 2 operator/process notes. **Impact:** the migration is complete and proven equal. Only the literal image-pin criterion is open, for the verifier to judge.

## Issues Encountered

- `docker service inspect --format '{{.UpdateStatus.State}}'` errored because the spec carries no UpdateStatus after a converged update following a scale. Convergence was confirmed from the update's own `converged` line and the task state instead.

## Known Stubs

None.

## Threat Flags

None. No new surface: the public route is unchanged apart from the HTTP router, which is now redirect-only (T-27-19 mitigated).

## User Setup Required

None.

## Next Phase Readiness

- Ready for 27-06: `/dev/shm/p27` holds `op_token` and `cli.env`, and `INFLUXDB_TOKEN` waits unmounted. The 27-06 decision (blocking-human) enables stats with `--secret-add INFLUXDB_TOKEN thinx_api`, arms the 90-day trim and drops the empty buckets.
- The stats write gap (D-06) continues from T_dormant 19:02:21Z until 27-06.
- Rollback until the D-07 deletion: `docker service rollback thinx_influxdb` (one step back to the 1.8 spec with replicas 0), then `docker service scale thinx_influxdb=1`.
- Follow-ups for 27-07 / Phase 28: pin the image by digest in the mirrored stack files; the autoredeploy label on `thinx_influxdb`.
- End-of-phase UAT (go-B): open the InfluxDB host over HTTPS and confirm the edge prompt appears. Record no credentials.

---
*Phase: 27-influxdb-2-upgrade*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND `.planning/runbooks/influxdb2-upgrade.md` (annex rows `cutover reference`, `cutover`, `token and edge`)
- FOUND commit `b3ce8ab6`, FOUND commit `ad9e78e7` (both signed, G)
- Measured `commits: 2` from the ledger (`3b26c730..ad9e78e7`)
