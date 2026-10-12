---
phase: 34-ops-surface-reduction-sla-close-out
plan: 02
subsystem: infra
tags: [traefik, edge, socket-proxy, docker-api, cutover, hardening]

requires:
  - phase: 34-ops-surface-reduction-sla-close-out
    provides: "Plan 01 end state: traefik_traefik 23 Args (Stage A), traefik_socket-proxy 1/1 on the internal overlay traefik-socket 10.234.34.0/24 with the recorded deny matrix"
provides:
  - "Live traefik_traefik at 24 Args with --providers.swarm.endpoint=tcp://socket-proxy:2375, no Docker socket mount, networks traefik-public + traefik-socket (EDGE-OPS-02 closed)"
  - "Deny proof from inside Traefik (ping OK, secrets 403, POST 405, socket path absent) and a live provider label test through the proxy (6 -> 7 -> 6)"
  - "### P34 Stage B2 record with the one-update staged rollback, D-10 gate, interruption guarantees, Version.Index post-P34-B2: 38380156"
  - "Device-flow harness /tmp/p31-device-flow/thinx-device-flow.mjs restored byte-identical (3010 B)"
affects: [34-03 tls-config-3 (Traefik restart now needs the proxy 1/1), 34-05 end-state evidence + AGENTS.md / swarm.md socket-proxy ops section]

actuals:
  tokens: 4518
  tasks: 2
  commits: 5
plan_head_before: a595eddea21e3fbbf3a39eed758ea701868aeb99
plan_head_after: 96cd0401c27fda9c07d17c6f514c80d7f134e3e8

tech-stack:
  added: []
  patterns:
    - "Rollback written into the stage record on disk before the fire, so a context loss mid-stage still has the revert"
    - "Live provider test with an unreferenced middleware label on a traefik-enabled service (label-only, no restart), timed add and remove"

key-files:
  created: []
  modified:
    - .planning/runbooks/traefik-edge-hardening.md
    - docker-compose.traefik.yml
    - .planning/WINDOWS.md
    - ~/Repositories/thinx-swarm/traefik.yml (fcafee0 Stage B2)

key-decisions:
  - "Plan 02's harness rule ('a FAIL -> staged rollback') was not applied: step 4 fails identically before the cutover (operator owner switch in thinx-mcp-device, new UDID with no deployed build), so a revert could neither cause nor cure it; recorded as harness_b2 PARITY"
  - "The harness was restored from the 31-03 executor's own Write call in the local session transcript (byte-identical 3010 B) instead of being rewritten"
  - "No full harness PASS was forced: the retired owner's credential was not reused and the operator's device state file was not written"

patterns-established:
  - "P34 Stage B2: socket mount removal, network add and endpoint flag in ONE docker service update (one Version.Index transition)"

requirements-completed: [EDGE-OPS-02]

coverage:
  - id: D1
    description: "Stage B2 repo-first: thinx-swarm traefik.yml at 24 flags with the swarm endpoint, socket volume removed from the traefik service, traefik-socket attached; origin == micro == workstation; mirror MIRROR OK at 24"
    requirement: EDGE-OPS-02
    verification:
      - kind: other
        ref: "Task 1 <verify> block 1 (YAML greps, flag counts, check-traefik-mirror.js, micro HEAD)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live cutover: one update, args=24 incl. the endpoint flag, no socket mount, networks traefik-public + traefik-socket, 29/0 with names == routers_post_A2:, overview unchanged, 0 provider-error lines, 0 blocked, matrix/WS/bare-IP == pre-row, ports OPEN x3"
    requirement: EDGE-OPS-02
    verification:
      - kind: other
        ref: "Task 1 <verify> blocks 2-4, run 15:19Z"
        status: pass
    human_judgment: false
  - id: D3
    description: "B2 record with staged rollback and Version.Index post-P34-B2 == live, hygiene greps 0"
    verification:
      - kind: other
        ref: "Task 1 <verify> block 5"
        status: pass
    human_judgment: false
  - id: D4
    description: "Proxy proven from inside Traefik (ping OK, secrets 403, POST 405, socket path absent) and provider test 6 -> 7 (10 s) -> 6 (7 s), probe label removed"
    requirement: EDGE-OPS-02
    verification:
      - kind: integration
        ref: "Task 2 <verify> block 1; block 2 minus the harness_b2 pattern (label gone, middlewares 6, deny/provider record lines)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Device-flow harness over https://app.thinx.cloud and http://rtm.thinx.cloud:7442 + mqtt :1883 after the cutover"
    requirement: EDGE-OPS-02
    verification:
      - kind: e2e
        ref: "Task 2 <verify> block 3 (harness p34b-https / p34b-7442): steps == pre-row, but RESULT FAIL at step 4 OTT_UPDATE_NOT_AVAILABLE (pre-existing app state)"
        status: fail
    human_judgment: true

duration: 12min
completed: 2026-10-09
status: complete
---

# Phase 34 Plan 02: Stage B2 — Traefik reads the Docker API only through the socket-proxy Summary

**One `docker service update` moved live Traefik off the raw Docker socket and onto the GET-only `socket-proxy` over the internal `traefik-socket` overlay: 24 Args with `--providers.swarm.endpoint=tcp://socket-proxy:2375`, no socket mount, the full 29-router inventory unchanged. From inside Traefik the proxy answers ping, refuses secrets (403) and writes (405), and Traefik picks up a label change through it in 10 s.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-09T15:11:29Z
- **Completed:** 2026-10-09T15:23:16Z
- **Tasks:** 2/2
- **Files modified:** 3 in this repo, 1 in thinx-swarm

## Accomplishments

- **Harness restored.** `/tmp/p31-device-flow/thinx-device-flow.mjs` is byte-identical to the Phase 31 original (3010 B), extracted from the 31-03 executor's Write call in the local session transcript.
- **Repo first.** thinx-swarm `fcafee0` (24 flags, endpoint flag added, socket volume removed from the traefik service, `traefik-socket` attached, the old "no endpoint on purpose" justification replaced). Pushed to origin and to micro with `--ff-only`, so all three HEADs are equal. Mirror `8a0a1d7d` gives MIRROR OK at 24.
- **Cutover.**
  - Fire at 15:17:40.4Z with ONE update (`--network-add traefik-socket --mount-rm /var/run/docker.sock --args <24>`). The new task `651uqwu11dsx` was Running at 15:17:55.7Z (≈15 s).
  - Version.Index went 38380131 → 38380145 (updating) → **38380156** (completed).
  - The D-10 gate was green at once and again after 60 s: `29/0`, names == `routers_post_A2:`, overview `[29,0,18,6,["Swarm","File"]]`, 0 provider-error lines, 0 blocked requests. The HTTPS matrix (17 hosts), the WS 101/401 pair and the bare-IP 301/200 pair all equal the pre-row, and ports 7442/1883/8883 stay OPEN.
  - The new task logged only the 8 start-up WRN lines. The 25 ERR lines came from the stopping task: the known drain artefact.
- **Proof from Traefik's side.** `deny_from_traefik: ping=OK secrets=403 post=405 sock=absent`. An allowed GET of services returns 22.
- **Provider test.** `provider_test: 6 -> 7 (10 s) -> 6 (7 s)`, using an unreferenced middleware label on `errorpage_errorpage`. The task was unchanged and the label was removed afterwards.
- **Record.** The B2 record contains the staged one-update rollback (written before the fire), the timeline, gate rows (1)–(10), the interruption-guarantees paragraph (must_haves A4) and a repo == live paragraph.

## Task Commits

1. **Task 1 (tracer): Stage B2 cutover**
   - thinx-swarm `fcafee0` feat(edge): Phase 34 Stage B2 (origin + micro ff)
   - `8a0a1d7d` feat(34): Stage B2 — mirror regenerated at 24 flags
   - `acf94791` docs(34): Stage B2 record — cutover
2. **Task 2: post-cutover proof**
   - `96cd0401` docs(34): Stage B2 record — provider test, deny from Traefik, harness

`commits: 5` is measured as `git rev-list --count a595edde..96cd0401`. It includes two orchestrator commits that landed during this run (`02220319` STATE.md switch, `00fa9347` 34-04 D-20 drop). Three of the five are this plan's.

## Files Created/Modified

- `.planning/runbooks/traefik-edge-hardening.md`: `### P34 Stage B2 record` (Task 1 + Task 2 blocks).
- `docker-compose.traefik.yml`: regenerated from `fcafee0` (24 flags).
- `.planning/WINDOWS.md`: one `unrun-verify` entry for the harness PASS (see Deviations).
- `~/Repositories/thinx-swarm/traefik.yml`: Stage B2.

Live: `traefik_traefik` 24 Args, Mounts = certificates volume only, networks `traefik-public` + `traefik-socket`, task `651uqwu11dsx`. `errorpage_errorpage` received two label-only updates (add, remove) and keeps task `5d7aukf4evft`. The backup `micro:/mnt/data/edge-rollback/traefik-p34-preB2-20261009T151619Z.json` (600 root, 23 Args) never leaves micro.

## Decisions Made

See frontmatter `key-decisions`.

## Deviations from Plan

### Harness acceptance not met (pre-existing, not caused by this plan)

**1. [Precondition-adjacent, recorded, not auto-fixed] Device-flow harness step 4 fails before and after the cutover**
- **Found during:** pre-row, before Task 1 (15:13–15:14Z)
- **Issue:** On both paths the OTT redeem answers HTTP 200 `OTT_UPDATE_NOT_AVAILABLE`. At 09:41Z today, after the P33 PASS at 09:21Z, the operator edited `thinx-mcp-device/thinx-device.config.json` (uncommitted) to use a different owner. The emulated device then registered as a new UDID with no deployed build. `lib/thinx/device.js` finds the OTT in redis and passes the ownership check, but `deploy.latestFirmwarePath()` comes back empty. Steps 1–3 and 5–8 (register, OTT issue, MQTT connect with both ACL grants, publish, recent, disconnect) pass on both paths, before and after the change.
- **Handling:** The cutover was not reverted. The plan's "FAIL → rollback" rule exists to catch regressions, and this failure predates the change. The record carries `harness_b2: https=PARITY 7442=PARITY (…)` instead of `https=PASS 7442=PASS`, so Task 2 verify block 2's harness pattern and block 3 fail as written. The executor did not force a PASS: it neither reused the retired owner's credential nor wrote the operator's device state file. A `.planning/WINDOWS.md` `unrun-verify` entry was appended.
- **Operator action to close:** attach a build to the new device (or restore the committed config), then rerun `p34v-7442` / `p34v-https`.

### Observations

**2. [Plan-internal timing] Task 1 verify block 3 reads `blocked=2` until ~15:40Z.** Task 2's deliberate deny probes (secrets 403, POST 405, ~15:20Z) are logged by the proxy as `blocked request`. Task 1's `--since 20m … grep -ci blocked == 0` therefore returns 2 within that window. Both lines are the intended refusals and are recorded in the B2 record.

**3. [Tooling] The laptop `sort` collation still differs from micro's**, so the dry-print was compared with `LC_ALL=C` on both sides (as in Plan 01).

**Total deviations:** 1 unmet acceptance item (pre-existing app state, operator action needed) and 2 observations. **Impact:** none on the edge. EDGE-OPS-02 holds live.

## Issues Encountered

None on the edge. No D-10 trigger fired, and the staged rollback was not executed.

## Known Stubs

None.

## Threat Flags

None. Plan T-34-22 is mitigated: the socket bind was removed in the same update, and from inside the task the socket path is absent, secrets get 403 and writes get 405. T-34-23 is mitigated: the proxy was asserted 1/1 first and the rollback was staged before the fire. T-34-24 is mitigated: the probe label was removed and middlewares are back to 6.

## Next Phase Readiness

- Plans 03–05 start from 24 Args, `Version.Index post-P34-B2: 38380156`, and the proxy 1/1.
- **Every later Traefik restart (tls-config-3 in Plan 03, the ACME `--force` in Plan 04) must assert `traefik_socket-proxy` 1/1 first.** A Traefik that starts without the proxy comes up with no swarm routers.
- The harness is back in `/tmp`, but it will only report PASS after the operator action above.

## Self-Check: PASSED

- FOUND: .planning/runbooks/traefik-edge-hardening.md (`### P34 Stage B2 record (34-02 Task 1`, `Version.Index post-P34-B2: 38380156` == live)
- FOUND: docker-compose.traefik.yml (24 flags, MIRROR OK)
- FOUND commits (this repo): 8a0a1d7d, acf94791, 96cd0401
- FOUND commit (thinx-swarm, origin == micro == HEAD): fcafee0
- Task 1 verify blocks 1–5 PASS (15:19Z / 15:20Z). Task 2 verify block 1 PASS. Block 2 passes except the harness_b2 pattern. Block 3 FAIL (documented deviation 1).
