---
phase: 34-ops-surface-reduction-sla-close-out
plan: 03
subsystem: infra
tags: [traefik, edge, tls, hsts, file-provider, labels, redirect, post-quantum]

requires:
  - phase: 34-ops-surface-reduction-sla-close-out
    provides: "Plan 02 end state: traefik_traefik 24 Args on tcp://socket-proxy:2375, no socket mount, tls-config-2, proxy 1/1, Version.Index 38380156"
provides:
  - "Live traefik_traefik with docker config tls-config-3 mounted and the https entrypoint default security-headers@file (24 Args, one update)"
  - "HSTS exactly once on 17/17 HTTPS hosts sourced from the file provider; the security-headers@swarm label copy retired (0 refs first)"
  - "Go-default TLS curves: X25519MLKEM768 negotiated again, P-384 accepted; TLS 1.2/1.3 policy otherwise unchanged"
  - "thinx-db-http and registry-http redirect-only on :80 (no Basic challenge over plaintext); thinx-api-http stays plaintext"
  - "### P34 Stage C record (Version.Index post-P34-C: 38380172) and ### P34 Stage D record (Version.Index post-P34-D: 38380175)"
affects: [34-04 ACME prune + credential rotation (starts from 24 Args, tls-config-3, proxy 1/1), 34-05 SLA run on this final edge, tls-config-2 removal, thinx-swarm README TLS options text (still mentions the old curve list)]

actuals:
  tokens: 7546
  tasks: 2
  commits: 4
plan_head_before: 663924bbe95a7d445138c356f623eae366b60cda
plan_head_after: 2baf04e096b7e688c8bf168404361bf034be650a

tech-stack:
  added: []
  patterns:
    - "Config swap and default-middleware provider flip in ONE docker service update (the flag never references a middleware that is not loaded)"
    - "Retire a shared swarm-label middleware only after a three-way reference count (live labels on every service, live router chains, stack files) reads 0"
    - "Staged rollback written into the runbook record before each live fire"

key-files:
  created: []
  modified:
    - .planning/runbooks/traefik-edge-hardening.md
    - docker-compose.traefik.yml
    - docker-swarm.yml
    - ~/Repositories/thinx-swarm/traefik/tls.toml (8a7a693)
    - ~/Repositories/thinx-swarm/traefik.yml (8a7a693, 3d3a31b)
    - ~/Repositories/thinx-swarm/thinx.yml (3d3a31b)
    - ~/Repositories/thinx-swarm/registry.yml (3d3a31b)

key-decisions:
  - "Plan verify commands name the ssh/bare-IP host 188.166.24.244; every check ran against the documented edge 188.166.23.244 (AGENTS.md, runbook)"
  - "The Traefik log gate read `docker logs` on the node-local containers (new and stopping task) because `docker service logs` hung on micro; same patterns, same window"
  - "tls-config-2 left in the swarm unreferenced for Plan 05 to remove, as planned"
  - "thinx-swarm README §TLS options still describes the X25519 + P-256 curve list; left for Plan 05's README update (not in this plan's file list)"

patterns-established:
  - "P34 Stage C: tls.toml carries both TLS options and the edge-default headers middleware; CONFIG bump N -> N+1 rides with any --args change in the same update"

requirements-completed: []

coverage:
  - id: D1
    description: "Stage C repo-first: tls.toml with the security-headers middleware table and no curve list, traefik.yml CONFIG 3 + security-headers@file at 24 flags, origin == micro == workstation, MIRROR OK"
    requirement: EDGE-OPS-03
    verification:
      - kind: other
        ref: "Task 1 <verify> blocks 1-2 (grep -F for the ${CONFIG} patterns; ssh host 188.166.23.244)"
        status: pass
    human_judgment: false
  - id: D2
    description: "tls-config-3 created from micro's checkout, decoded sha256 == committed; parse probe 0 errors, middleware received, no leftover container"
    requirement: EDGE-OPS-03
    verification:
      - kind: other
        ref: "Task 1 <verify> block 2 (config sha, p34-tlsprobe leftovers 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live Stage C: args=24 with security-headers@file and the proxy endpoint, Configs tls-config-3, in-task sha == committed, https default [security-headers@file], file middleware enabled, overview [29,0,18,7,[Swarm,File]]"
    requirement: EDGE-OPS-03
    verification:
      - kind: integration
        ref: "Task 1 <verify> blocks 3 and 6"
        status: pass
    human_judgment: false
  - id: D4
    description: "Wire after Stage C: HSTS exactly 1 on 17/17, nosniff + DENY; TLS 1.2/1.3 ok, 1.1 + CBC refused, nmap TLS 1.2 set unchanged; X25519MLKEM768 negotiated; WS 101/401; bare-IP 301/200; matrix == pre-row"
    requirement: EDGE-OPS-03
    verification:
      - kind: e2e
        ref: "Task 1 <verify> blocks 4-6; nmap ssl-enum-ciphers rtm"
        status: pass
    human_judgment: false
  - id: D5
    description: "Device paths after Stage C: ports 7442/1883/8883 OPEN, 0 parse/provider/missing-middleware lines on the new task, device-flow harness PASS over HTTPS and over :7442 + :1883"
    requirement: EDGE-OPS-03
    verification:
      - kind: e2e
        ref: "Task 1 <verify> block 7 (log part via docker logs on the container); harness p34c-https / p34c-7442 RESULT: PASS"
        status: pass
    human_judgment: false
  - id: D6
    description: "Stage D repo + live: seven security-headers swarm labels removed after 0/0/0 references; db-http and registry-http redirect-only; parity diff empty; overview 6 with the six expected names; task ids unchanged"
    requirement: EDGE-OPS-03
    verification:
      - kind: integration
        ref: "Task 2 <verify> blocks 1-2"
        status: pass
    human_judgment: false
  - id: D7
    description: "Stage D wire: db :80 301 with 0 WWW-Authenticate, registry :80 301, app :80 not redirected, db https 401, registry https 400, HSTS 17/17, 29/0 names == baseline, WS 101, bare-IP 301, ports OPEN; records with Version.Index == live"
    requirement: EDGE-OPS-03
    verification:
      - kind: e2e
        ref: "Task 2 <verify> blocks 3-4; Task 1 <verify> block 8"
        status: pass
    human_judgment: false

duration: 19min
completed: 2026-10-09
status: complete
---

# Phase 34 Plan 03: tls-config-3 and the security-headers retirement Summary

**The edge's HSTS/nosniff/frame-deny default now comes from `traefik/tls.toml` (`security-headers@file`, docker config `tls-config-3`), so no swarm label update can remove it. The swarm-label copy has been retired. The Go-default curve set, including the X25519MLKEM768 post-quantum hybrid, is offered again. `db` and `registry` redirect on :80 without a Basic challenge. The plaintext API path for legacy devices is untouched.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-10-09T15:28:51Z
- **Completed:** 2026-10-09T15:47:00Z
- **Tasks:** 2/2
- **Files modified:** 3 in this repo, 4 in thinx-swarm

## Accomplishments

- **Stage C (D-15, WR-03 + curves).**
  - thinx-swarm `8a7a693`:
    - `tls.toml` gains `[http.middlewares.security-headers.headers]` with the seven swarm-label values.
    - The curve line is removed.
    - `minVersion`, `sniStrict = false` and the six suites are unchanged.
    - `traefik.yml` sets `security-headers@file` and `tls-config-${CONFIG:-3}` (24 flags).
  - The parse probe at DEBUG showed 0 errors and the middleware in `Configuration received`.
  - `tls-config-3` was created from micro's checkout. Its sha matches the committed file.
- **One update** at 15:32:55.9Z (proxy 1/1 asserted in the same command) swapped the config and flipped the default.
  - New task `l7z1nflaqdim` was Running in ≈6 s. Version.Index is 38380172.
  - Gate:
    - `29/0` with names == baseline.
    - Overview `[29,0,18,7,["Swarm","File"]]`, https default `["security-headers@file"]`.
    - HSTS exactly once on 17/17.
    - TLS rows and the nmap set are unchanged.
    - **`-groups X25519MLKEM768` handshake failure before, `Negotiated TLS1.3 group: X25519MLKEM768` after.** P-384 was refused before and is accepted after.
    - WS 101/401, bare-IP 301/200, matrix == pre-row, ports OPEN ×3.
    - The new task logged only the 8 start-up WRN lines.
    - Harness PASS over HTTPS and over :7442 + :1883.
  - 0 router chains referenced the swarm copy afterwards.
- **Stage D (D-16, D-17).**
  - Reference counts 0/0/0: labels across all 22 services, live chains, stack files.
  - thinx-swarm `3d3a31b`:
    - The seven labels are removed from `traefik.yml`.
    - `thinx-db-http` → `https-redirect`, mirrored in `docker-swarm.yml` (parity empty).
    - `registry-http` gets `https-redirect`.
  - Three label-only updates, all task ids unchanged: couchdb idx 38380173, registry 38380174, traefik 38380175.
  - `http://db.thinx.cloud/` changed from 401 with a Basic challenge to `301 https://db.thinx.cloud/` with 0 `WWW-Authenticate` lines.
  - `http://registry.thinx.cloud/` changed from 400 to `301`.
  - `http://app.thinx.cloud/` is still 200 (plaintext, not redirected).
  - Overview is back to 6 middlewares with the six expected names. HSTS is still 17/17.

## Task Commits

1. **Task 1 (tracer): P34 Stage C**
   - thinx-swarm `8a7a693` feat(edge): Phase 34 Stage C — tls-config-3 (origin + micro ff)
   - `eed79b22` feat(34): Stage C — mirror regenerated (tls-config-3, security-headers@file)
   - `d540572e` docs(34): Stage C record
2. **Task 2: P34 Stage D**
   - thinx-swarm `3d3a31b` chore(edge): Phase 34 Stage D (origin + micro ff)
   - `a9734a3d` chore(34): Stage D — docker-swarm.yml db http redirect-only + mirror
   - `2baf04e0` docs(34): Stage D record

`commits: 4` is measured as `git rev-list --count 663924bb..2baf04e0` (this repo). The 2 thinx-swarm commits are in addition to these.

## Files Created/Modified

- `.planning/runbooks/traefik-edge-hardening.md`: `### P34 Stage C record` and `### P34 Stage D record`. Each carries its staged rollback, timeline, gate rows, curve before/after rows or :80 rows, the D-10 evaluation and `Version.Index post-P34-C/D`.
- `docker-compose.traefik.yml`: regenerated twice (banners `8a7a693`, `3d3a31b`), 24 flags, MIRROR OK.
- `docker-swarm.yml`: `thinx-db-http.middlewares=https-redirect`.
- thinx-swarm `traefik/tls.toml`, `traefik.yml`, `thinx.yml`, `registry.yml`.

Live:
- docker config `tls-config-3` is mounted. `tls-config-2` is left unreferenced for Plan 05.
- `traefik_traefik`: 24 Args, 0 `security-headers` label keys, task `l7z1nflaqdim`.
- `thinx_couchdb` and `registry_registry` have the http-router middleware labels.
- Backups on micro, all `600 root`, never left micro:
  - `/mnt/data/edge-rollback/traefik-p34-preC-20261009T153226Z.json`
  - `traefik-p34-preD-20261009T154243Z.json`
  - `thinx_couchdb-p34-preD-20261009T154243Z.json`
  - `registry_registry-p34-preD-20261009T154243Z.json`
- Scratch file `/tmp/p34-tlsprobe.log` on micro.

## Decisions Made

See frontmatter `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan verify commands use host 188.166.24.244**
- **Found during:** Task 1
- **Issue:** The `<verify>` blocks ssh to `root@188.166.24.244` and probe `http://188.166.24.244/`. AGENTS.md, the operator notes and every earlier stage record use `188.166.23.244` (micro, the bare-IP edge).
- **Fix:** All verify commands ran with `188.166.23.244`. They are otherwise verbatim.
- **Verification:** all Task 1 and Task 2 verify blocks PASS.

**2. [Rule 3 - Blocking/tooling] Laptop grep treats a mid-pattern `$` as an anchor**
- **Found during:** Task 1 verify block 2
- **Issue:** `/usr/bin/grep` is ugrep 7.8.4. `grep -q 'name: tls-config-${CONFIG:-3}'` fails even though the line is present (line 239).
- **Fix:** Used `grep -F` for the two `${CONFIG}` patterns.
- **Verification:** `grep -nF` shows the line; block PASS.

**3. [Rule 3 - Blocking/tooling] `docker service logs` hung on micro**
- **Found during:** Task 1 gate (8) and verify block 7
- **Issue:** `docker service logs --raw --since 15m traefik_traefik` did not return within 60–180 s. Two backgrounded ssh sessions were left waiting.
- **Fix:** Used `docker logs --since 2026-10-09T15:32:50Z` on the node-local containers instead, for the new task, the stopping task and the proxy. Same patterns.
- **Results:** new task 0 hits (8 start-up WRN only); stopping task 25 drain-artefact ERR lines (as in Stages A/B2); proxy `blocked` 0.
- **Committed in:** recorded in `d540572e`.

---

**Total deviations:** 3 auto-fixed (1 bug in the plan's commands, 2 tooling). **Impact:** none on the edge. Every gate was evaluated with equivalent or stricter checks.

## Issues Encountered

None on the edge. No D-10 trigger fired and neither staged rollback was executed. Two backgrounded `ssh … docker service logs` sessions from the hung command may still be open on the workstation. They are read-only.

## Known Stubs

None.

## Threat Flags

None. No new network surface:
- T-34-07: the swap and the flip were one update, preceded by the probe.
- T-34-08: harness PASS over HTTPS.
- T-34-09: db :80 has 0 WWW-Authenticate.
- T-34-10: 0/0/0 references counted before removal.
- T-34-11: registry :80 returns 301.

## User Setup Required

None.

## Next Phase Readiness

- Plans 04/05 start from:
  - 24 Args, `tls-config-3`, `security-headers@file`.
  - Overview `[29,0,18,6,["Swarm","File"]]`.
  - `Version.Index post-P34-D: 38380175` (traefik_traefik).
  - Proxy 1/1.
- Every later Traefik restart must still assert `traefik_socket-proxy` 1/1 first.
- Plan 05:
  - remove `tls-config-2`;
  - update the thinx-swarm README §TLS options: the curve list is gone and the file now also carries the headers middleware.

## Self-Check: PASSED

- FOUND: .planning/runbooks/traefik-edge-hardening.md (`### P34 Stage C record (34-03 Task 1`, `### P34 Stage D record (34-03 Task 2`, `Version.Index post-P34-D: 38380175` == live)
- FOUND: docker-compose.traefik.yml (24 flags, MIRROR OK, banner 3d3a31b)
- FOUND: docker-swarm.yml (db-http https-redirect, parity diff empty)
- FOUND commits (this repo): eed79b22, d540572e, a9734a3d, 2baf04e0
- FOUND commits (thinx-swarm, origin == micro == HEAD): 8a7a693, 3d3a31b
- Task 1 verify blocks 1–8 PASS (block 7 log part via `docker logs`); Task 2 verify blocks 1–4 PASS
