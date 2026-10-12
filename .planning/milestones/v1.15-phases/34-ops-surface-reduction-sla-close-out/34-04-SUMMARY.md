---
phase: 34-ops-surface-reduction-sla-close-out
plan: 04
subsystem: infra
tags: [traefik, edge, acme, credentials, basic-auth, operator, permissions]

requires:
  - phase: 34-ops-surface-reduction-sla-close-out
    provides: "Plan 03 end state: traefik_traefik 24 Args, tls-config-3, security-headers@file, proxy 1/1, Version.Index post-P34-D 38380175"
provides:
  - "acme.json pruned 23 -> 16 (seven retired names gone), snapshot traefik-p34-acme-20261009T155129Z, Version.Index post-P34-E 38380188"
  - "scripts/traefik-edge-scan.sh HOSTS 16 (micro.thinx.cloud retired, serves the default certificate)"
  - "couch-auth / influx-auth credential rotated (shared, label sha12 00d35a165e11 -> 79e078373496), tasks unchanged, password file shredded"
  - "HASHED_PASSWORD stored in /mnt/gluster/thinx/.env (unquoted, single $, render-proven == live label); restart.sh / thinx.sh no longer prompt (thinx-swarm 1c4d683)"
  - "/mnt/gluster/thinx/.env 644 -> 600 root:root on micro and core, with consumer evidence (every reader is root)"
  - "### P34 Stage E record and ### P34 credential rotation record in the runbook"
affects: [34-05 SLA run on this final edge (no further edge mutation from this plan), thinx-swarm restart.sh / thinx.sh deploys (now need HASHED_PASSWORD in the env file), deferred db.thinx.cloud 502 (port 5985)]

actuals:
  tokens: 7629
  tasks: 3
  commits: 4
plan_head_before: eebd0ab8d37fa2d0cdbc5ea7507778b618f48e74
plan_head_after: 7ce8ba8c929c5cb1b3a3dba48a8df8e74e0b06e6

tech-stack:
  added: []
  patterns:
    - "Secret rotation entirely on the target host: operator file -> openssl -stdin -> env line + label, proven by sha12 prefixes and challenge counts only"
    - "Dry render with `docker stack config` under the exact restart.sh env-loading form proves a stored value renders to the live label before applying it"
    - "Permission tightening gated on a full consumer inventory (service binds, standalone containers, process uids, userns, cron, non-root users, env_file keys) on every node sharing the volume"

key-files:
  created:
    - .planning/phases/34-ops-surface-reduction-sla-close-out/deferred-items.md
  modified:
    - scripts/traefik-edge-scan.sh
    - .planning/runbooks/traefik-edge-hardening.md
    - docker-compose.traefik.yml
    - ~/Repositories/thinx-swarm/README.md (1c4d683)
    - ~/Repositories/thinx-swarm/traefik.sh (1c4d683)
    - ~/Repositories/thinx-swarm/restart.sh (1c4d683)
    - ~/Repositories/thinx-swarm/thinx.sh (1c4d683)

key-decisions:
  - "Option B (operator): store the apr1 hash in the deploy env file as an unquoted single-$ HASHED_PASSWORD line, and remove the interactive prompt from restart.sh / thinx.sh; USERNAME stays hard-coded admin in the scripts (not added to the env file)"
  - "restart.sh / thinx.sh guard with : \"${HASHED_PASSWORD:?…}\" so a missing hash fails before deploy; in thinx.sh before docker stack rm, so the stack cannot be left down"
  - "couch-auth and influx-auth share one credential (operator); backend CouchDB/InfluxDB admin accounts not rotated, operator allows them to share it later"
  - "Env file chmod 600 root:root applied: every reader is root (deploy scripts, thinx_worker node main process uid 0, no userns-remap, root cron); the only non-root login user (reverse on core) has no processes/crontab/gluster refs"
  - "db.thinx.cloud 502 behind a passed basic-auth is pre-existing (thinx-db service port 5985 closed, CouchDB listens on 5984): deferred, not fixed in this plan"

patterns-established:
  - "Edge credential lives in the 600-root deploy env file; deploy scripts never prompt for it"

requirements-completed: [EDGE-OPS-03]

coverage:
  - id: D1
    description: "Stage E: acme.json 600 root, 16 entries, 0 retired mains; snapshot 700/600; 0 ACME failures; rtm/app/console/influx serials == F.pre.yml; micro.thinx.cloud default cert; 29/0, overview, 16-host matrix, WS, bare-IP, ports"
    requirement: EDGE-OPS-03
    verification:
      - kind: integration
        ref: "Task 1 <verify> blocks 1-4 (run in the Task 1 session, record e64663cc)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Operator password file placed: 600 root:root, 1 line, >= 17 bytes, no user file"
    requirement: EDGE-OPS-03
    verification:
      - kind: other
        ref: "Task 2 acceptance (stat / wc on micro, metadata only)"
        status: pass
    human_judgment: true
  - id: D3
    description: "Rotation: live labels differ from the pre-rotation backups, backups 600 root, env file has exactly one HASHED_PASSWORD line and differs from its backup, password file gone"
    requirement: EDGE-OPS-03
    verification:
      - kind: integration
        ref: "Task 3 <verify> block 1 -> ROTATED"
        status: pass
    human_judgment: false
  - id: D4
    description: "Historic pair challenged and no-credential 401 + challenge on db and influx; new credential 0 challenges inside the Traefik netns (recorded)"
    requirement: EDGE-OPS-03
    verification:
      - kind: e2e
        ref: "Task 3 <verify> block 2; runbook new_credential_edge line"
        status: pass
    human_judgment: false
  - id: D5
    description: "README / traefik.sh rotation line; thinx-swarm HEAD == origin == micro (1c4d683); MIRROR OK; 29/0; runbook record with 0 secret markers / 0 e-mails"
    requirement: EDGE-OPS-03
    verification:
      - kind: other
        ref: "Task 3 <verify> blocks 3-4"
        status: pass
    human_judgment: false
  - id: D6
    description: "Env file 600 root:root on micro (direct + deploy link) and core; non-root read on core denied; root worker still reads; stack config render still succeeds"
    requirement: EDGE-OPS-03
    verification:
      - kind: other
        ref: "runbook rotation record, env_mode line"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-09
status: complete
---

# Phase 34 Plan 04: Retired ACME prune and edge credential rotation Summary

**Seven retired ACME entries are gone from the store (23 -> 16), and the scan now gates the 16 live hosts. The couch-auth / influx-auth basic-auth credential was rotated on micro without any value leaving the host. Its hash is stored in the deploy env file, so `restart.sh` / `thinx.sh` no longer prompt for it. That env file is now `600 root:root`.**

## Performance

- **Duration:** ≈25 min of execution (Task 1 15:49–15:54Z, operator pause, Tasks 2–3 16:01–16:14Z)
- **Started:** 2026-10-09T15:49:52Z
- **Completed:** 2026-10-09T16:14:11Z
- **Tasks:** 3/3
- **Files modified:** 4 in this repo (incl. the new deferred-items.md), 4 in thinx-swarm

## Accomplishments

- **Task 1: Stage E, ACME prune (D-19).** Done by the previous executor; commits `3b7fa2b2` and `e64663cc`.
  - Pruned chronograf, replica, ssl, vvv, test and micro `.thinx.cloud`, plus ctf24.teacloud.net, in one remote command (snapshot `traefik-p34-acme-20261009T155129Z`, then `--force`).
  - The store is `600 root` with 16 entries. The new task logged 0 ACME errors, and the served serials are unchanged.
  - `micro.thinx.cloud` now serves the default certificate, as intended. The scan `HOSTS` went 17 -> 16.
  - `Version.Index post-P34-E: 38380188`.
- **Task 2: operator action (verified, metadata only).** `/root/.p34-basicauth` is `600 root:root`, 1 line, ≥ 17 bytes.
  - The file was created `644`; the orchestrator corrected it to `600 root:root` at ≈16:01Z.
  - There is no user file, so the username stays `admin`.
- **Task 3: rotation (D-18, Option B).**
  - **Before rotation:** the historic `158f369` pair was **already** challenged on db and influx. It was dead before today, presumably since an earlier `restart.sh` prompt rotated the hash.
  - **Backups (all `600 root`):** `p34-env-20261009T160640Z` (original mode `644 root:root` recorded) and `p34-rot-{couchdb,influxdb}-20261009T160640Z.json`.
  - **One remote shell** did the work:
    - hashed with `openssl passwd -apr1 -stdin`
    - appended an unquoted `HASHED_PASSWORD=` line via temp + mv (first 61 lines unchanged)
    - **dry-rendered** with `docker stack config` under the exact restart.sh load form; rendered sha12 `79e078373496` == expected
    - applied `--label-add` on `thinx_couchdb` and `thinx_influxdb`
  - The live label sha12 went `00d35a165e11` -> `79e078373496` on both. Task ids are unchanged, so nothing restarted.
  - **New credential, tested inside the Traefik netns:** 0 challenges on db and influx (influx `200`).
  - **After rotation:** the historic pair gets challenge=1 on both; no credential gets `401` + challenge=1 on both.
  - **Password file:** shredded.
  - **Edge checks:** `29/0`, overview `[29,0,18,6,["Swarm","File"]]`, ports `7442/1883/8883` OPEN.
- **Env file permissions.** `/mnt/gluster/thinx/.env` went from `644` to `600 root:root`. Micro and core both show `600 root:root`. A non-root read on core is denied, the root worker still reads it, and the render still works.
- **thinx-swarm `1c4d683`.**
  - `restart.sh` / `thinx.sh`: dropped the `openssl passwd -apr1` prompt and added a `:?` guard (in `thinx.sh` it runs before `docker stack rm`).
  - README and `traefik.sh`: rotation line added.
  - Pushed to origin and to micro (`p34-ops`, ff-only). The mirror banner was regenerated, `MIRROR OK`.

## Task Commits

1. **Task 1: Stage E prune + scan HOSTS 16:** `3b7fa2b2` (chore), `e64663cc` (docs record)
2. **Task 2: operator password file:** no commit (human action, verified)
3. **Task 3: credential rotation:**
   - thinx-swarm `1c4d683` (chore(ops))
   - `246714f8` (chore, mirror banner)
   - `7ce8ba8c` (docs record + deferred-items)

## Files Created/Modified

- `scripts/traefik-edge-scan.sh`: HOSTS 16, micro hostname dropped (Task 1)
- `.planning/runbooks/traefik-edge-hardening.md`: `### P34 Stage E record`, `### P34 credential rotation record`, WR-02 marked closed
- `docker-compose.traefik.yml`: banner source -> thinx-swarm `1c4d683` (banner-only diff)
- `.planning/phases/34-ops-surface-reduction-sla-close-out/deferred-items.md`: db 502 / port 5985 item
- thinx-swarm `README.md`, `traefik.sh`, `restart.sh`, `thinx.sh` (`1c4d683`)

## Decisions Made

See `key-decisions` in the frontmatter. In short:
- Option B: the hash is stored in the env file and the scripts no longer prompt.
- The `:?` guard means a missing hash fails the deploy safely.
- couch and influx share one credential, and the backend accounts are untouched.
- The chmod went ahead once all readers were proven to be root.
- The pre-existing db 502 is deferred.

## Deviations from Plan

### Operator-directed changes (Task 2 response)

**1. Option B: store the hash and remove the prompt.** The plan's precondition assumed the env file already had one `HASHED_PASSWORD` and one `USERNAME` line. It had **0 of each**, because the scripts prompted on every deploy.
- Per the operator, a `HASHED_PASSWORD` line was **added**.
- No `USERNAME` line was added: the scripts hard-code `admin` after loading the env file, so an env `USERNAME` would be overridden anyway.
- The prompt was removed from `restart.sh` / `thinx.sh` (thinx-swarm `1c4d683`). That file was not in the plan's `files_modified`.

**2. Env file permissions changed from 644 to 600 root:root (operator).**
- Gated on the consumer inventory recorded in the runbook. No non-root consumer exists.
- Original mode is recorded in the backup. Revert: `chmod 644`.

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Guard against a missing hash in the deploy scripts**
- **Found during:** Task 3 (removing the prompt)
- **Issue:** Without the prompt, a missing `HASHED_PASSWORD` would make `thinx.sh` run `docker stack rm` and only then fail at compose interpolation, leaving the stack down.
- **Fix:** `: "${HASHED_PASSWORD:?HASHED_PASSWORD missing from /mnt/gluster/thinx/.env}"` placed before any deploy or rm.
- **Files modified:** thinx-swarm `restart.sh`, `thinx.sh`
- **Commit:** thinx-swarm `1c4d683`

**2. [Rule 3 - Blocking] Mirror banner stale after the thinx-swarm commit**
- **Found during:** Task 3 verify (the plan expected no mirror change)
- **Issue:** `check-traefik-mirror.js` pins the banner to the thinx-swarm HEAD, so it reported `MIRROR-STALE` even though `traefik.yml` was unchanged.
- **Fix:** regenerated the mirror (banner-only diff), then `MIRROR OK`.
- **Files modified:** `docker-compose.traefik.yml`
- **Commit:** `246714f8`

### Other notes

- **Before-rotation evidence:** the historic pair was already rejected (challenge 1/1), so the rotation closes WR-02 by policy rather than an active exposure. Recorded as observed.
- **Secret-read hook:** fired twice and was not worked around (per the coordinator correction).
  1. A laptop `grep` whose pattern named the env-file glob. I narrowed the search to the compose `env_file` key, which was what I actually needed.
  2. An optional `stat -c %i` inode cross-check on micro. It was skipped and recorded as not run. It was not needed, since the mode was checked on both nodes.

## Issues Encountered

- **db.thinx.cloud returns 502 once basic-auth passes** (new credential, inside the Traefik netns). This is not caused by the rotation.
  - The `thinx-db` service label targets `:5985`, which is closed. CouchDB listens on `:5984`.
  - The same label is in the pre-Stage-D backup and in both repos.
  - Recorded in `deferred-items.md` and in the rotation record. Fixing it is a separate label change, and the operator should first confirm that db.thinx.cloud is meant to be reachable.

## Deferred Issues

- db.thinx.cloud backend port 5985 -> 5984 (see `deferred-items.md`).

## User Setup Required

None. The operator should know that `restart.sh` / `thinx.sh` now read the hash from the env file and refuse to run without it.

## Next Phase Readiness

- Plan 05 (SLA run) can start on this edge. This plan made no static or args change to Traefik after Stage E (`Version.Index post-P34-E: 38380188` is still live).
- The rotation was label-only on `thinx_couchdb` / `thinx_influxdb`.
- The thinx-staging docs commits are not pushed. They are docs/mirror only, and Plan 05 does the final docs push.

## Self-Check: PASSED

- Files: `34-04-SUMMARY.md`, `deferred-items.md`, `scripts/traefik-edge-scan.sh`, the runbook records — present.
- Commits: `3b7fa2b2`, `e64663cc`, `246714f8`, `7ce8ba8c` are ancestors of HEAD; thinx-swarm `1c4d683` == origin/master == micro HEAD.
- Task 3 `<verify>` blocks 1–4 all PASS (ROTATED; historic/no-cred proof + `new_credential_edge` line; rotation line + HEAD parity + MIRROR OK; 29/0 + record + 0 secret markers / 0 e-mails).
