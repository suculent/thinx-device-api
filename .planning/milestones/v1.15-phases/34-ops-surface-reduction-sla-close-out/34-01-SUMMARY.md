---
phase: 34-ops-surface-reduction-sla-close-out
plan: 01
subsystem: infra
tags: [traefik, edge, logging, access-log, socket-proxy, docker-api, hardening]

requires:
  - phase: 33-dashboard-lockdown-tls-hardening
    provides: "19-flag Traefik end state (loopback mgmt API gate, tls-config-2, HSTS default), routers_post_A2 inventory, stage/rollback mechanics"
provides:
  - "Live traefik_traefik at 23 Args: --log.level=WARN, JSON access log with RequestPath/RequestLine/ClientUsername dropped (EDGE-OPS-01 closed)"
  - "Live traefik_socket-proxy (wollomatic/socket-proxy:1.13.1, GET-only allow-list) on the internal non-attachable overlay traefik-socket 10.234.34.0/24, deny matrix proven; Traefik not yet pointed at it"
  - "traefik-edge.F.pre.yml + external scan Before (EDGE-SCAN OK) as the Phase 34 baseline"
  - "## Phase 34 records in the runbook: mechanism table, P34 Stage A + B1 records, Version.Index post-P34-A: 38380131"
affects: [34-02 Stage B2 cutover, 34-03 tls-config-3, 34-05 end-state evidence, AGENTS.md edge notes]

actuals:
  tokens: 17026
  tasks: 2
  commits: 5
plan_head_before: f488061d064dd46057953b253d7f968fc6c70b82
plan_head_after: ad8f0d7e46760a8a63ff7e07c2b2ed16f9e31360

tech-stack:
  added: ["wollomatic/socket-proxy:1.13.1 (Docker API allow-list proxy, distroless Go)"]
  patterns:
    - "Throwaway probe pair on a bridge (proxy + Traefik with staging ACME) proves an allow-list reads the full inventory before anything goes live"
    - "Secret-free access-log proof: fresh canary in query + Authorization + basic-auth username, counts only, with a per-host positive control"

key-files:
  created:
    - .planning/runbooks/swarm-configs/traefik-edge.F.pre.yml
    - .planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-09.md
  modified:
    - .planning/runbooks/traefik-edge-hardening.md
    - docker-compose.traefik.yml
    - ~/Repositories/thinx-swarm/traefik.yml (7ee46ab Stage A, ff30585 Stage B1)
    - ~/Repositories/thinx-swarm/traefik.sh (ff30585)

key-decisions:
  - "Access log keeps JSON with RequestPath, RequestLine and ClientUsername dropped; queryParameters options not used (nothing left carries the query)"
  - "Socket-proxy image wollomatic/socket-proxy:1.13.1 by tag (DHI has none); trivy current DB critical=0, high=4 Go stdlib go1.26.6 accepted with a repin trigger (first release built with go >= 1.26.9)"
  - "traefik-socket pinned to 10.234.34.0/24 and used as the proxy -allowfrom (a service-name allowfrom would resolve to the VIP)"
  - "Proxy user 65534:998 (docker.sock group on micro); no --health-cmd (image declares no HEALTHCHECK, distroless); liveness via -watchdoginterval=30 -stoponwatchdog"

patterns-established:
  - "P34 stage records live under ## Phase 34 records in traefik-edge-hardening.md with Version.Index post-P34-<stage> lines"

requirements-completed: [EDGE-OPS-01, EDGE-OPS-02]

coverage:
  - id: D1
    description: "Phase 34 baseline: F.pre.yml capture (19 flags, raw socket bind, CLF access log logs the query string) and external scan Before = EDGE-SCAN OK"
    requirement: EDGE-OPS-01
    verification:
      - kind: other
        ref: "Task 1 <verify> block 1 (F.pre shape, 0 secret markers / e-mails, p34_scan_capture names a Before with EDGE-SCAN OK)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stage A live: traefik_traefik 23 Args with WARN + JSON access log dropping RequestPath/RequestLine/ClientUsername; repo == origin == micro == mirror at 23"
    requirement: EDGE-OPS-01
    verification:
      - kind: other
        ref: "Task 1 <verify> blocks 2, 3, 5, 6, 7 (thinx-swarm flags + MIRROR OK + heads; live args/one task; overview + names == routers_post_A2 + 0 not-enabled; bare-IP/WS/HTTPS matrix; ports OPEN, 0 parse errors, probe removed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Access log provably free of secrets: fresh canary in ott/code query, Bearer/Basic headers and basic-auth username -> 0 hits, positive control on all three hosts, 0 RequestPath/RequestLine/ClientUsername keys"
    requirement: EDGE-OPS-01
    verification:
      - kind: integration
        ref: "Task 1 <verify> block 4 (canary), run twice with fresh markers at 13:49Z and 13:51Z"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stage B1: socket-proxy service + internal traefik-socket overlay repo-first and live, spec == YAML, deny matrix exact, Traefik untouched"
    requirement: EDGE-OPS-02
    verification:
      - kind: other
        ref: "Task 2 <verify> blocks 1-4 (YAML/traefik.sh/mirror/heads; live spec + network; deny matrix line; leftovers 0, B1 record with critical=0, traefik idx/args unchanged)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Runbook records: ## Phase 34 records with mechanism table, P34 Stage A and B1 records"
    verification:
      - kind: other
        ref: "Task 1 <verify> block 8 and Task 2 <verify> block 4 (record headings, canary_hits line, Version.Index post-P34-A == live, hygiene greps 0)"
        status: pass
    human_judgment: false

duration: 28min
completed: 2026-10-09
status: complete
---

# Phase 34 Plan 01: Stage A (WARN + secret-free JSON access log) and Stage B1 (read-only socket-proxy) Summary

**Live Traefik now logs at WARN with a JSON access log that drops RequestPath, RequestLine and ClientUsername. A fresh canary in the query string, the Authorization header and the basic-auth username leaves 0 traces, while positive-control lines exist for every probed host. A GET-only `wollomatic/socket-proxy:1.13.1` runs on a new internal overlay `traefik-socket` (10.234.34.0/24) with an exact deny matrix, ready for the Plan 02 cutover.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-10-09T13:33:02Z
- **Completed:** 2026-10-09T14:01:19Z
- **Tasks:** 2/2
- **Files modified:** 4 in this repo (2 created), 2 in thinx-swarm

## Accomplishments

- Phase 34 baseline: `traefik-edge.F.pre.yml` (redacted on micro, delta vs E.post.yml none) and the external scan `## Before` = `EDGE-SCAN OK`. The capture also proves that the CLF access log wrote the full request line, including the query string, before this stage.
- Stage A (one `--args` restart, fire 13:47:43.7Z → task `qrxfpvipnuau` Running 13:47:58.6Z): 19 → 23 flags. The throwaway probe on the exact image accepted the flags and logged no marker. After the restart the gate was green: 29/0, names == `routers_post_A2:`, overview unchanged, HTTPS matrix/WS/bare-IP == pre-row, ports OPEN, 0 parse/provider errors on the new task. The D-04 canary showed 0 hits, with positive control on thinx.cloud (2 lines), the bare IP (3) and db (2). `Version.Index post-P34-A: 38380131`.
- WARN baseline recorded: 7× `aliasHeadersStrategy is not configured` (one per entrypoint) and 1× encoded-characters notice. Neither is a provider error.
- Stage B1:
  - DHI has no socket-proxy, so the plan uses `wollomatic/socket-proxy:1.13.1` pinned by tag.
  - A throwaway proxy + Traefik pair read all 29 routers with 0 blocked requests. The provider calls exactly HEAD `_ping` and GET version/services/networks/tasks/nodes/<id>, so the regex did not need widening.
  - The `traefik-socket` overlay (internal, not attachable) and `traefik_socket-proxy` were created live with flags == YAML (10/10).
  - Live deny matrix: `ping=200 headping=200 version=200 services=200 tasks=200 networks=200 node=200 nodes=403 secrets=403 configs=403 containers=403 info=403 events=403 post=405 delete=405 loopback=403`.
  - `traefik_traefik` was not touched.

## Task Commits

1. **Task 1 (tracer): Phase 34 baseline + Stage A**
   - `7ddd0cb5` docs(34): F.pre capture + external scan Before
   - thinx-swarm `7ee46ab` feat(edge): Phase 34 Stage A (origin + micro ff)
   - `5ae47ac6` feat(34): Stage A — mirror regenerated at 23 flags
   - `d8e0a807` docs(34): Stage A record
2. **Task 2: Stage B1 — socket-proxy + traefik-socket**
   - thinx-swarm `ff30585` feat(edge): Phase 34 Stage B1 (origin + micro ff)
   - `289fddbe` feat(34): Stage B1 — mirror regenerated (socket-proxy service)
   - `ad8f0d7e` docs(34): Stage B1 record

## Files Created/Modified

- `.planning/runbooks/swarm-configs/traefik-edge.F.pre.yml`: Phase 34 pre-change capture with the new `log_and_access_log:` and `docker_api_access:` sections
- `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-09.md`: scan `## Before (pre-P34-A`
- `.planning/runbooks/traefik-edge-hardening.md`: `## Phase 34 records`, mechanism table, `p34_scan_capture:`, Stage A + B1 records
- `docker-compose.traefik.yml`: regenerated twice (23 flags; the socket-proxy service is included)
- `~/Repositories/thinx-swarm/traefik.yml`: Stage A flags + comment; `socket-proxy` service; external `traefik-socket` network
- `~/Repositories/thinx-swarm/traefik.sh`: `docker network create --driver=overlay --internal --subnet=10.234.34.0/24 traefik-socket`

Live objects: `traefik_traefik` 23 Args; network `traefik-socket` (`tnwugjbjx2dz`); service `traefik_socket-proxy` (`nzkphcpt6qk0`, task `iqrs4f7agcyl`). The backup `micro:/mnt/data/edge-rollback/traefik-p34-preA-20261009T134505Z.json` (600 root, 19 Args) never leaves micro.

## Decisions Made

See frontmatter `key-decisions`. In short: the drop-three-fields access log, the tag-pinned wollomatic image with a recorded repin trigger, the pinned-subnet `-allowfrom`, and watchdog-based liveness instead of a shell health command.

## Deviations from Plan

### Auto-fixed / recorded issues

**1. [Rule 3 - Blocking, tooling] grype DB too old to judge the 2026-08 image**
- **Found during:** Task 2 Step 0
- **Issue:** The laptop's grype 0.86.1 can only load the schema-5 DB, whose feed is frozen at 2026-03-09. It reported 0 findings for an image built in August, which proves nothing.
- **Fix:** Cross-scanned with the already-installed trivy 0.52.1, whose DB was updated 2026-10-09: critical=0, high=4, medium=4, unknown=18. That is 13 unique Go stdlib go1.26.6 CVEs counted twice, once per binary (`socket-proxy` and `healthcheck`). Both lines are recorded (`socket_proxy_grype:`, `socket_proxy_trivy:`). Critical is 0 on both, so the plan's stop condition did not apply. No package install or upgrade was done.
- **Files modified:** `.planning/runbooks/traefik-edge-hardening.md` (B1 record)
- **Commit:** `ad8f0d7e`
- **Follow-up:** upgrade grype to a v6-DB release (operator; this is a package install, so it was not done here). Repin the proxy when an upstream release built with go >= 1.26.9 exists.

**2. [Precondition element unmet, not consumed] device-flow harness missing**
- **Found during:** Task 1 Step 0
- **Issue:** `/tmp/p31-device-flow/thinx-device-flow.mjs` is gone. The workstation rebooted around 12:38Z and `/tmp` was cleared.
- **Handling:** No step or `<verify>` of Plan 34-01 runs the harness. Every live/edge fact in the precondition held, so execution continued. This is recorded in F.pre.yml, the Stage A record and the B1 hand-off. **Plan 34-02 must recreate the harness** (31-03 D5 / 32-RESEARCH recreate path via `~/Repositories/thinx-mcp-device`) before its `harness_b2:` rows.

**3. [Observation] micro checkout has 6 untracked files**
- The 6 files are `*.yml.bak.20261007222957.pre-v3-labels`, pre-existing and not ours. Tracked-dirty (`-uno`) is 0, both ff-merges were clean, and the files were left untouched.

**4. [Observation] naming and tooling differences, no content difference**
- The network LB endpoint is named `traefik-socket-endpoint` on Engine 29; the plan calls it `lb-traefik-socket`.
- Docker 29 rotated more drain-artefact ERR lines on the stopping task: 25 versus 13 in Phase 33, because the https default middleware reaches every :443 router since P33 Stage D.
- The laptop gate script needed `grep -E` because `/usr/bin/grep` lacks `\|`.
- The micro vs laptop `sort` collation differs, so args were compared with `LC_ALL=C`.

**Total deviations:** 1 tooling workaround (no install), 1 precondition element not consumed by this plan, 2 observations. **Impact:** none on the delivered stages. One follow-up was handed to Plan 02: recreate the harness.

## Issues Encountered

None that blocked a stage. No D-10 trigger fired, and neither staged rollback (the 19-flag `--args` revert, `docker service rm` + `network rm`) was executed.

## Threat Flags

None. The new surface (the proxy holding the Docker socket, the new overlay) is the plan's own T-34-02/04/05 scope, mitigated as designed: GET-only allow-list, internal non-attachable overlay, pinned-subnet `-allowfrom`, non-root, read-only rootfs, caps dropped, tag pin + scan.

## Next Phase Readiness

Plan 34-02 (Stage B2) starts from args=23, `Version.Index post-P34-A: 38380131`, proxy 1/1 and the recorded deny matrix. Its first step must recreate the device-flow harness.

## Self-Check: PASSED

- FOUND: .planning/runbooks/swarm-configs/traefik-edge.F.pre.yml
- FOUND: .planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-09.md
- FOUND commits (this repo): 7ddd0cb5, 5ae47ac6, d8e0a807, 289fddbe, ad8f0d7e (5 = `git rev-list --count f488061d..HEAD`)
- FOUND commits (thinx-swarm, origin == micro == HEAD ff30585): 7ee46ab, ff30585
- All 8 Task 1 and 4 Task 2 `<verify>` blocks PASS. Final laptop gate == pre-row; overview `[29,0,18,6,["Swarm","File"]]`; ports OPEN ×3.
