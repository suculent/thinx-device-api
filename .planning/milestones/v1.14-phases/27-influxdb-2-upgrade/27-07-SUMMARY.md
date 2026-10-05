---
phase: 27-influxdb-2-upgrade
plan: 07
subsystem: infra
tags: [production, swarm, stack-file, autoredeploy, chronograf, deletion, one-way]

requires:
  - phase: 27-influxdb-2-upgrade
    provides: "27-06: stats live on bucket stats (90 d), INFLUXDB_TOKEN mounted on thinx_api, p27_enable=enable-all (Chronograf retirement approved); 27-05: thinx_influxdb on dhi.io/influxdb:2.9.1 with the 1.8 data, upgrade copy and /root/phase27 backups kept as the safety net"
provides:
  - "docker-swarm.yml mirrors the live stack: influxdb on dhi.io/influxdb:2.9.1, single influxdb2 bind, six INFLUXD_* settings, https-redirect as the only http middleware, chronograf removed, INFLUXDB_TOKEN on api and declared external"
  - "Gluster thinx.yml index-only commit 088a9b2 (thinx.yml only; unrelated edits stay uncommitted)"
  - "thinx_chronograf removed from production (D-13)"
  - "Success criterion 5: post-upgrade push autoredeployed thinx_api in 13 s"
  - "The 1.8 safety net is gone (D-02, D-07): /mnt/gluster/thinx/{influx,influx-v1-upgrade-src,chronograf} and /root/phase27 on both nodes deleted, 210,776 KB freed; InfluxDB 2 proven unaffected"
  - "Runbook closed: annex rows stack mirror, SC5 push, deletion (p27_delete=delete-all), Phase 27 end state and Phase 28 follow-ups"
affects: [28]

actuals:
  tokens: 5233
  tasks: 3
  commits: 3
plan_head_before: e47ffe59b4cc7c860a221d11c8bee3ae83d173be
plan_head_after: b39f849d09390bad7154c0119b7a595093c24292

tech-stack:
  added: []
  patterns:
    - "Pre-delete mount scan over every service spec and every container on both nodes, matching exact path or path plus '/', under both the link path and the real path (/mnt/gluster -> /mnt/glusterfs)"
    - "One-way rm -rf only on literal paths, each guarded by -d and not -L, with a probe baseline before and the same probe after"

key-files:
  created:
    - .planning/phases/27-influxdb-2-upgrade/27-07-SUMMARY.md
  modified:
    - docker-swarm.yml
    - .planning/runbooks/influxdb2-upgrade.md

key-decisions:
  - "Operator answered delete-all at the blocking-human D-07 gate. They had been shown that count_24h_DEVICE_CHECKIN=0 and that the 27-06 dashboard human-check was unconfirmed (plan guidance: recheck), and accepted both gaps; the dashboard and check-in check stays an end-of-phase UAT item"
  - "Chronograf retired (enable-all): service removed 13:28:30 UTC, volume deleted with the 1.8 data at 14:36:10 UTC"
  - "The gluster thinx.yml gets no INFLUXDB_TOKEN entry: it has no top-level secrets block (runbook Conventions), so the mount lives only on the live thinx_api spec, like the Phase 24 secrets"
  - "F-2 option B stands, so there is no password-sync duty between restart.sh and the InfluxDB admin user"

patterns-established:
  - "Resolve symlinked mount roots (readlink -f) before a path-prefix safety scan; scan both spellings"

requirements-completed: [OPS-INFLUX-01, OPS-INFLUX-02, OPS-INFLUX-03]

coverage:
  - id: D1
    description: "docker-swarm.yml mirrors the live InfluxDB 2 deployment, Chronograf removed, INFLUXDB_TOKEN on api and external at top level, no operator secret mounted"
    requirement: OPS-INFLUX-01
    verification:
      - kind: other
        ref: "Task 1 verify 1 (js-yaml load of docker-swarm.yml) -> STACK-MIRROR-OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "Gluster thinx.yml carries the Phase 27 hunks in an index-only commit; unrelated edits stay uncommitted; thinx_influxdb mounts nothing from swarmpit/"
    requirement: OPS-INFLUX-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 verify 2: head_dhi=1 head_swarmpit_conf=0 head_files=thinx.yml wt_influx_diff=0 (base 0) chronograf_service=0 influx_swarmpit_mounts=0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Success criterion 5: a post-upgrade push to thinx-staging autoredeploys thinx_api within 5 minutes and the INFLUXDB_TOKEN mount survives"
    requirement: OPS-INFLUX-02
    verification:
      - kind: manual_procedural
        ref: "Task 1 verify 3: four CI jobs success for ddc42dd4, autoredeploy_s=13 -> SC5-AUTOREDEPLOY-WITHIN-5MIN; probe token_present=1, INFLUX-STATS-PROBE OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "1.8 data, upgrade copy, Chronograf volume and /root/phase27 on both nodes deleted by exact path; influxdb2 data, thinx_influxdb and the 90-day bucket unaffected"
    requirement: OPS-INFLUX-03
    verification:
      - kind: manual_procedural
        ref: "Task 3 verify 1: p27_delete=delete-all once; gone_v1=1 gone_src=1 gone_root=1 (micro and core) v2_data=1 influx_running=1 influx_mounts=/mnt/gluster/thinx/influxdb2"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 verify 2: probe inside thinx_api -> bucket_retention_s=7776000, INFLUX-STATS-PROBE OK -> V2-INTACT-AFTER-DELETE; count_all_total 558 and count_90d sum 533 unchanged from the pre-delete baseline"
        status: pass
    human_judgment: false
  - id: D5
    description: "Dashboard and Visits show non-zero figures and a device check-in reaches InfluxDB 2 within 24 h"
    requirement: OPS-INFLUX-02
    verification: []
    human_judgment: true
    rationale: "Needs a logged-in console session and a physical test device; count_24h_DEVICE_CHECKIN was 0 at the decision and the operator accepted it as an end-of-phase UAT item"

duration: 74min (13:25-14:39 UTC, including the operator decision wait; Task 3 itself 14:34-14:39)
completed: 2026-10-03
status: complete
---

# Phase 27 Plan 07: Close Summary

**Both stack files now mirror InfluxDB 2.9.1 with Chronograf retired. A post-upgrade push autoredeployed thinx_api in 13 s. After the operator's delete-all, the 1.8 safety net (202 MB on gluster, plus the backups on both nodes) was deleted by exact path, and InfluxDB 2 is unaffected: retention 90 d, counts 558 / 533 unchanged.**

## Performance

- **Duration:** 74 min wall clock (13:25–14:39 UTC), including the Task 2 decision wait; Task 3 took 5 min
- **Started:** 2026-10-03T13:25:00Z
- **Completed:** 2026-10-03T14:39:03Z
- **Tasks:** 3 of 3 (Task 1 tracer, Task 2 decision, Task 3 one-way delete)
- **Files modified:** 2

## Accomplishments

- `docker-swarm.yml` and the gluster `thinx.yml` describe the live InfluxDB 2 service (D-14, D-16). Chronograf is gone from both files and from production (D-13).
- Success criterion 5: the push of `ddc42dd4` was CI four-green, and `thinx_api` rolled 13 s after `api-registry` finished. `INFLUXDB_TOKEN` survived the autoredeploy, and `thinx_influxdb` mounts nothing from `swarmpit/`.
- D-02 and D-07 are at their end state. The following were deleted at 14:36 UTC after a clean safety scan: `/mnt/gluster/thinx/influx` (101,088 KB), `/mnt/gluster/thinx/influx-v1-upgrade-src` (101,060 KB), `/mnt/gluster/thinx/chronograf` (76 KB), and `/root/phase27` on micro (4,308 KB) and core (4,244 KB).
- InfluxDB 2 was proven intact afterwards: `/mnt/gluster/thinx/influxdb2` present, `thinx_influxdb` Running with that single bind, `V2-INTACT-AFTER-DELETE`, and counts unchanged from the pre-delete baseline.
- The runbook is closed with the deletion row, the Phase 27 end state and the Phase 28 follow-ups (Swarmpit DNS pin, the autoredeploy label and the tag-only image on `thinx_influxdb`).

## Task Commits

1. **Task 1: stack files mirror InfluxDB 2, Chronograf retired, SC5 test push**
   - `ddc42dd4` (chore): docker-swarm.yml mirrors InfluxDB 2 and the Chronograf retirement (pushed to thinx-staging; the SC5 push)
   - `f6b2b9dc` (docs): stack mirror and autoredeploy test (local)
   - gluster swarm repo on micro: `088a9b2` `thinx_influxdb: InfluxDB 2, chronograf retired (Phase 27)` (thinx.yml only, the repo's own practice)
2. **Task 2: approve deleting the 1.8 safety net.** Decision, `p27_delete=delete-all`, no commit of its own; it is recorded in the Task 3 row.
3. **Task 3: delete by exact path, prove InfluxDB 2 unaffected, close the runbook.** `b39f849d` (docs), local.

**Plan metadata:** see the final docs commit for this SUMMARY, STATE and ROADMAP.

## Files Created/Modified

- `docker-swarm.yml`: influxdb service on `dhi.io/influxdb:2.9.1` (single influxdb2 bind, six `INFLUXD_*`, `https-redirect` as the only http middleware), chronograf service, routers and `chrono-auth` removed, `INFLUXDB_TOKEN` on api and external at top level, and a header comment on how the token was created (D-11).
- `.planning/runbooks/influxdb2-upgrade.md`: annex rows "stack mirror", "SC5 push" and "deletion" (`p27_wt_influx_base=0`, `autoredeploy_s=13`, `p27_delete=delete-all`), plus the "Phase 27 end state" section with the Phase 28 follow-ups.
- `.planning/phases/27-influxdb-2-upgrade/27-07-SUMMARY.md`: this file.

## Decisions Made

- **delete-all, with known gaps.** The operator was shown that the D-07 bar was not fully met: `count_24h_DEVICE_CHECKIN=0` (0 over 7 d, 42 over 90 d), and the 27-06 dashboard human-check was unconfirmed. The plan's guidance in that case was "recheck". The operator chose delete-all and accepted both gaps, so the check moves to end-of-phase UAT (coverage D5).
- **No INFLUXDB_TOKEN in the gluster thinx.yml.** The production file has no top-level `secrets:` block (runbook Conventions), so the mount lives only on the live spec. Runbook step 14's "top-level `secrets:` entry" applies to the repo `docker-swarm.yml` only.
- **Option B means no password-sync duty.** It is recorded in the closing note, so a later `restart.sh` password change is not mistaken for something that needs an `influx user password` update.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SC5 check parsed `CreatedAt` wrongly**
- **Found during:** Task 1 (SC5 verify)
- **Issue:** `docker inspect --format "{{.CreatedAt}}"` prints `2026-10-03 13:35:22 +0000 UTC`, so the plan's `split(' ')[0]` kept only the date and gave a false −48910 s.
- **Fix:** Re-read the value as RFC3339 through `{{json .CreatedAt}}`, which gave `autoredeploy_s=13`.
- **Committed in:** `f6b2b9dc` (annex row "SC5 push")

**2. [Rule 2 - Missing critical] Broadened the pre-delete safety scan**
- **Found during:** Task 3 (safety scan)
- **Issue:** `/mnt/gluster` is a symlink to `/mnt/glusterfs`, so a mount declared under the real path would slip past a `/mnt/gluster/...` prefix check. Service specs also do not show non-swarm containers.
- **Fix:** Scanned both spellings and every container (`docker ps -a`) on micro (18) and core (14) as well as the 25 service specs (48 sources). Every `rm -rf` was guarded with `-d` and not `-L`. A probe baseline was taken before the delete so "counts unchanged" could be proven.
- **Verification:** 0 hits everywhere. The only parent mount is `thinx_worker` → `/mnt/gluster/thinx` (its build workspace), which is not a hit under the plan's rule.

**3. [Rule 1 - Bug, executor's own] One rescan used a wrong regex**
- **Found during:** Task 3 (safety scan)
- **Issue:** The second scan used `glusterfs?`, which matches `/mnt/glusterf(s)` only, not `/mnt/gluster`. Its "no hit" was therefore meaningless.
- **Fix:** Before deleting, I reran it with `gluster(fs)?` (`hits_fixed=0`) and cross-checked against a listing of every distinct gluster mount source. The first scan, with the correct `/mnt/gluster/` prefix, had already returned 0.

**4. [Operator exception] Unsigned commits**
- GPG is locked (no tty for the passphrase). `ddc42dd4` was pushed unsigned under the operator's "Push unsigned" exception, and `f6b2b9dc`, `b39f849d` and the metadata commit are local and unsigned (`-c commit.gpgsign=false`; hooks ran, no `--no-verify`). The plan says "commit signed".

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 2), plus the operator signing exception.
**Impact on plan:** All were needed for correctness or safety. Nothing was deleted outside the approved list.

## Issues Encountered

- The D-07 evidence bar was not fully met (no device check-in in 24 h or 7 d, dashboard unconfirmed). This was an operator decision, so the item stays open as UAT (see Decisions).
- `/root/phase27` on micro also held two Task 1 artifacts, `thinx_chronograf.pre.json` and the pre-edit `thinx.yml.wt.pre-p27`. Both went with the directory, as the plan's `rm -rf /root/phase27` intends; the swarm repo's own working tree still has the unrelated edits.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or trust-boundary schema. T-27-26 (deleting influxdb2 through a prefix) was mitigated by literal paths, the symlink guard, the mount scan and the post-checks. T-27-29 (old stats and v1 credentials retained) is closed by the delete.

## User Setup Required

None.

## Next Phase Readiness

- Phase 27 is complete at the operational level. Open item: the end-of-phase UAT for dashboard non-zero figures and a device check-in (coverage D5).
- Phase 28 follow-ups (runbook "Phase 27 end state"):
  - pin Swarmpit to `swarmpit_influxdb` (`SWARMPIT_INFLUXDB=http://swarmpit_influxdb:8086`); it still resolves there at 14:39;
  - decide on `swarmpit.service.deployment.autoredeploy=true` on `thinx_influxdb`;
  - decide on pinning the influx image digest (`sha256:3d49ee8ee9a0`).
- `f6b2b9dc`, `b39f849d` and the metadata commit are not pushed. They ride the next thinx-staging push, as the plan intends.
- Memory note to refresh: "restart.sh resets chronograf pw" is stale. restart.sh has 0 chronograf mentions.

---
*Phase: 27-influxdb-2-upgrade*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: `.planning/phases/27-influxdb-2-upgrade/27-07-SUMMARY.md`, `docker-swarm.yml`, `.planning/runbooks/influxdb2-upgrade.md`
- FOUND: `ddc42dd4` (also on `origin/thinx-staging`), `f6b2b9dc`, `b39f849d`
- Measured `commits: 3` = `git rev-list --count e47ffe59..b39f849d`
