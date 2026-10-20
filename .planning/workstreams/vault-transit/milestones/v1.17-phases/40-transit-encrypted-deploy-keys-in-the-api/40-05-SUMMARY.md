---
phase: 40-transit-encrypted-deploy-keys-in-the-api
plan: 05
subsystem: infra
tags: [openbao, transit, deploy-keys, cut-over, circleci, swarmpit, docker-swarm, wiring-gate]

requires:
  - phase: 40-transit-encrypted-deploy-keys-in-the-api
    provides: "40-01 Transit client and boot probe; 40-02 Transit key format and per-attempt ssh-agent; 40-03 503 key_service_unavailable and the THINX_DEPLOY_KEYGEN switch; 40-04 the switch mirror, the Phase 40 wiring gate and runbook section 11"
  - phase: 39-internal-openbao-on-the-swarm
    provides: "live OpenBao on micro, the thinx_api attachment, openbao-verify.sh and the restore-rehearsal matrix"
provides:
  - "Phase 40 code live in production: thinx_api task tk89thgjiptv1d1z4e9l1kepw on micro from parent 8b6879e0 (thinx-staging), Transit boot probe ok"
  - "thinx-swarm 8cfa7dd (switch mirror, Phase 40 wiring gate) on laptop, origin master and the micro checkout"
  - "Both consoles redeployed with the D-03 sentence (thinx_console, thinx_vue on core)"
  - "Runbook evidence entries for the pre-cut-over gate and the cut-over"
affects: [41]

actuals:
  tokens: 2015
  tasks: 3
  commits: 2
plan_head_before: 2b1eecdbaedf38c251ea25bdaa912c9b07a0157a
plan_head_after: 108726e423f3e63359ac5f35dca5da56e2d87f33

tech-stack:
  added: []
  patterns:
    - "Release gate: prove the exact SHA on the non-deploying thinx-unit branch, then push thinx-staging only at a SHA that differs by .planning/ alone"
    - "Cut-over gate: pre/post router sha256 byte compare, ports from the public IP, --live wiring, openbao-verify, and an in-task functional probe"

key-files:
  created: []
  modified:
    - .planning/runbooks/openbao.md

key-decisions:
  - "The operator's go for Task 2 was given ahead of time, on condition that Task 1 was fully green; Task 1 was green (CircleCI test #16121, 1958 specs, 0 failures), so Task 3 ran on that go."
  - "The six untracked 2026-10-07 *.yml.bak files in the micro checkout were not treated as dirt: no tracked change, no overlap with the two changed files, so the ff-merge went ahead and they were left untouched."
  - "PID 1 in the API container is the /bin/sh entrypoint, not node; node is its direct child and last foreground command, so the 40-02 crash-case assumption holds in effect and is recorded as such rather than as a failure."
  - "The live 503 key_service_unavailable path was not triggered (it needs the kill switch, a task restart, or an OpenBao outage); only the served bundles were checked for the D-03 sentence, and the live 503 stays an operator UAT item."

patterns-established:
  - "Evidence entries for a cut-over record SHAs, CI job numbers, task id, node, digest prefixes and verdicts only"

requirements-completed: [KEYENC-01, KEYENC-02, KEYENC-03, KEYENC-04, KEYENC-05, KEYENC-06]

coverage:
  - id: D1
    description: "Release SHA proven in CI on thinx-unit with TransitIntegrationSpec against an OpenBao dev server, and the deployed thinx-staging SHA descends from it with docs-only differences"
    requirement: KEYENC-05
    verification:
      - kind: integration
        ref: "CircleCI test #16121 on thinx-unit 2b1eecdb (1958 specs, 0 failures); thinx-staging 8b6879e0 test #16124 and api-registry #16125 success; plan Task 3 sync/lineage verify command exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "New thinx_api task runs the Phase 40 image, logs [transit] probe ok, and the live wiring gate passes with only the image changed"
    requirement: KEYENC-04
    verification:
      - kind: other
        ref: "timeout 30 docker logs --since 09:19Z on micro: probe ok 1, probe failed 0"
        status: pass
      - kind: other
        ref: "bash ../../thinx-swarm/tests/openbao-api-wiring.test.sh --live (API-WIRING-OK mode=live, SPEC_DELTA ok, TRANSIT_CANARY ok)"
        status: pass
    human_judgment: false
  - id: D3
    description: "OpenBao unaffected: full verify on seal g2 without g1, and the restore-rehearsal matrix"
    requirement: KEYENC-04
    verification:
      - kind: other
        ref: "openbao-verify.sh --full --expect-seal-generation g2 --expect-no-runtime-generation g1 && openbao-restore-rehearsal.sh --verify-recorded-matrix (OPENBAO-VERIFY-OK, OPENBAO-REHEARSAL-MATRIX-OK)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Unaffected surfaces: 7442, 1883 and 8883 open, :7442 HTTP 200, rtm / and csrf-token 200, Traefik routers byte-identical"
    requirement: KEYENC-03
    verification:
      - kind: other
        ref: "nc -z 188.166.23.244 7442/1883/8883; curl :7442 and rtm; router list cmp pre/post (29, fa0afd608550e585, none disabled)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Public HTTPS prefetch and keyless fetch() work in the production image"
    requirement: KEYENC-03
    verification:
      - kind: other
        ref: "in-task node script from the plan verify block: PUBLIC_HTTPS_FETCH clone=ok keyless=ok, 0 p40-pub- dirs left"
        status: pass
    human_judgment: false
  - id: D6
    description: "thinx-swarm in sync on laptop, origin master and micro by push and ff-merge only"
    verification:
      - kind: other
        ref: "laptop = origin = micro = 8cfa7ddacc4fb6b88f61778f76cdfe5c14577814"
        status: pass
    human_judgment: false
  - id: D7
    description: "Production key generation and builds: a new key is one vault:vN: line at 600 with no PEM; a private repo builds with it; a legacy key still builds; a public HTTPS repo builds through the worker; no thinx-agent-* left"
    requirement: KEYENC-01
    verification: []
    human_judgment: true
    rationale: "Needs an operator session in the console, a private GitHub repo and real device builds; queued as end-of-phase UAT (plan human-checks)."
  - id: D8
    description: "Consoles after rollout: console-retest checklist, and the 503 key_service_unavailable sentence shown live in the Vue console"
    requirement: KEYENC-03
    verification:
      - kind: other
        ref: "served legacy DeploykeyController.js and the console.thinx.cloud bundle contain the D-03 sentence"
        status: pass
    human_judgment: true
    rationale: "Bundle content only proves the new images are served; the browser checklist and a live 503 (kill switch or outage) need the operator."

duration: 50min
completed: 2026-10-19
status: complete
---

# Phase 40 Plan 05: Release Gate and Production Cut-Over Summary

**Phase 40 is live. thinx-staging `8b6879e0`, which differs from the green thinx-unit SHA `2b1eecdb` by planning docs alone, rolled out through CI and Swarmpit as thinx_api task `tk89thgjiptv1d1z4e9l1kepw` on micro. Its Transit boot probe is ok. The `--live` wiring gate, openbao-verify on g2, the rehearsal matrix, ports, :7442, rtm, the Traefik router inventory and an in-task public HTTPS clone all passed. thinx-swarm `8cfa7dd` is the same on laptop, origin and micro.**

## Performance

- **Duration:** about 50 min of execution: Task 1 ran 08:50-09:05Z, and Task 3 ran 09:09-09:40Z after the operator's resume.
- **Started:** 2026-10-19T08:50Z
- **Completed:** 2026-10-19T09:40Z
- **Tasks:** 3 (Task 1 tracer, Task 2 decision, Task 3 cut-over)
- **Files modified:** 1 (`.planning/runbooks/openbao.md`)

## Accomplishments
- **Task 1 (earlier session):**
  - full local regression green;
  - console `7e3d1fe` pushed;
  - `thinx-unit` created at `2b1eecdb`, with CircleCI test #16121 green (1958 specs, 0 failures, TransitIntegrationSpec against the compose OpenBao, "Starting OpenBao" green, so RESEARCH A2 did not materialize).
- **Task 2:** go from the operator, given before Task 1 ran, on the condition that Task 1 was fully green (it was). The operator added that this "production" is effectively staging and safe to write to.
- **Task 3 cut-over:**
  - thinx-swarm `471a95f..8cfa7dd` pushed to origin. Error/downtime CI #167/#168 succeeded and both pages redeployed. The micro checkout was fast-forwarded through `p40-ff`.
  - Parent `ab3ae8ba..8b6879e0` pushed to thinx-staging. All six contexts succeeded: test #16124, api-registry #16125, test-vue-console #16122, vue-console-registry #16123, test-console-classic #16126, console-classic-registry #16127.
  - Swarmpit rolled thinx_api about 90 s after api-registry (container start 09:20:22Z, digest `e9e99385d27056e2`). No autopull recovery was needed.
  - The consoles rolled: thinx_console at 09:16:55Z and thinx_vue at 09:26:03Z, both on core.
- **Live verdicts:**

  | Check | Verdict |
  |---|---|
  | `[transit] probe ok` | 1, with 0 `probe failed` |
  | PID 1 | `docker-entrypoi` (sh), with node as its direct child |
  | `thinx-agent-*` directories | 0 |
  | `--live` wiring gate | `API-WIRING-OK mode=live`, `SPEC_DELTA ok`, so RESEARCH A1 held |
  | `openbao-verify --full` | g2 OK |
  | Restore-rehearsal matrix | OK |
  | Ports and :7442 HTTP | open, 200 |
  | rtm | 200/200 |
  | Routers | identical (29, `fa0afd608550e585`) |
  | `PUBLIC_HTTPS_FETCH` | `clone=ok keyless=ok` |

## Task Commits

1. **Task 1: pre-cut-over gate.** `8b6879e0` (docs, signed; runbook evidence). Pushes: console `ec63c74..7e3d1fe` and `thinx-unit` `2b1eecdb`.
2. **Task 2: operator decision.** No commit. Answered go.
3. **Task 3: cut-over and evidence.** `108726e4` (docs, signed; runbook evidence). Pushes: thinx-swarm `8cfa7dd` (origin and micro), parent `thinx-staging` `8b6879e0`.

## Files Created/Modified
- `.planning/runbooks/openbao.md`: two evidence log entries, "Plan 40-05 Task 1: pre-cut-over gate" and "Plan 40-05: Phase 40 cut-over".

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

### Clarifications (no behaviour beyond the plan)
- **Micro checkout untracked files.** Six pre-existing untracked `*.yml.bak.20261007222957.pre-v3-labels` files were present. The checkout had no tracked change and no overlap with the pushed files, so the ff-merge went ahead and the files were left alone.
- **PID 1 is not node.** The 40-02 note expected node as PID 1. It is the `/bin/sh` entrypoint, which runs node as its last foreground command, so a node exit still ends the container. This is recorded as holding in effect. A later hardening could `exec node` in `docker-entrypoint.sh` (not done here; it would be a code change).
- **Router snapshot files.** For the byte compare, the pre/post router lists (names and statuses only) were written briefly to `/root` on micro and then deleted.
- **Extra read-only check.** Both served console bundles were fetched and checked for the D-03 sentence. That shows the new images are served. The live 503 itself was not triggered, as the plan requires.

**Total deviations:** 0 auto-fixed. **Impact:** none.

## Issues Encountered
None. CI passed on the first run, Swarmpit rolled out without help, and every live check passed on its first run.

## Authentication Gates
None.

## Known Stubs
None.

## Threat Flags
None. T-40-19: the deployed SHA descends from the green thinx-unit SHA with docs-only differences. T-40-20: all pre/post gates passed. T-40-22: only names, counts, digest prefixes and verdicts were printed, and the wiring gate reported `OUTPUT_CLEAN ok`. T-40-23: no stack deploy, restart.sh or manual service update was run.

## User Setup Required
None.

## Pending operator checks (end-of-phase UAT)
1. Build a device from a public HTTPS repository in the Vue console. The executor then checks the logs for "public prefetch git result OK" and for no `[transit]` failure.
2. Generate a new deploy key. The newest key file should have exactly one `^vault:v[1-9][0-9]*:` line, mode 600 and 0 `PRIVATE KEY` lines (criterion 1).
3. Add that key to a private GitHub repo and build from it (criterion 2). Afterwards 0 `thinx-agent-*` directories should remain in the API container.
4. Build privately with an owner whose only working key is a legacy key (criterion 3).
5. Run the console-retest checklist on rtm.thinx.cloud.
6. Optional: see the 503 sentence live in the Vue console. This needs the kill switch from runbook section 11, which restarts the task.

## Next Phase Readiness
- Phase 40 is deployed, and its live gates are green. Rollback: the kill switch in runbook section 11 first, then a git revert on thinx-staging. Keys minted from 09:20Z on need roll-forward.
- The two docs commits (`8b6879e0` is already on origin; `108726e4` and this SUMMARY are local) reach thinx-staging with the next deliberate push, which redeploys the API.
- `main`, tags and the v1.18 release stay held until all of v1.17 is done.
- Phase 41 (legacy key migration, `GIT_KEY_PASSPHRASE` removal) can be planned.

---
*Phase: 40-transit-encrypted-deploy-keys-in-the-api*
*Completed: 2026-10-19*

## Self-Check: PASSED
