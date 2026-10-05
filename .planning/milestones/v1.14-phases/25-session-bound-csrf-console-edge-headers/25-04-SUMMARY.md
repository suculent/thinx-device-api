---
phase: 25-session-bound-csrf-console-edge-headers
plan: 04
subsystem: infra
tags: [deploy, production, swarm, csrf, console, observe, circleci]
status: complete

observe_start_utc: 2026-09-29T17:06:30Z

requires:
  - phase: 25-01
    provides: "CSRF_MODE legacy|observe|signed, signed session-bound token, 15-minute pre-session, establishSession login rotation"
  - phase: 25-02
    provides: "Classic dashboard $.ajaxSetup X-XSRF-TOKEN seam (console 3c906ff)"
  - phase: 25-03
    provides: "Observe telemetry and counters, req.thx_auth exemption, csrf-live-probe.sh, csrf-obs-counters.js, runbook Phase 25 section"
provides:
  - "Phase 25 CSRF code live on thinx_api (dcbbd416) and the classic dashboard seam served on rtm.thinx.cloud"
  - "thinx_api running CSRF_MODE=observe since 2026-09-29T17:06:30Z, with CSRF_ENFORCE=true unchanged"
  - "CSRF_MODE=observe persisted in the gluster thinx.yml (swarm commit a50dda1, one line)"
  - "D-05 start-of-observe result: 0 external POST /api/v2/user or /api/user/create callers"
affects: [25-05, 25-06, 25-07, 25-08, 25-10]

actuals:
  tokens: 1572
  tasks: 3
  commits: 3
plan_head_before: e76b920d4e90076bdfb58e2210ff9b45779c27e5
plan_head_after: 821ca51979e785fb6febdc346640a01ff9b5bf66

tech-stack:
  added: []
  patterns:
    - "Production rollout in two steps: ship code in the unchanged mode first and prove v1.13 behaviour, then flip one env var on one service"
    - "Log owner ids through a local variable, never through an identifier the logging audit treats as a full payload (userWrapper, hdata)"

key-files:
  created: []
  modified:
    - services/console (gitlink a5b0246 -> 3c906ff)
    - lib/router.google.js
    - .planning/runbooks/csp-csrf-hardening.md

key-decisions:
  - "Continued past the Task 2 tracer gate without a mid-flight checkpoint. The operator chose proceed over the review (pause after deploy) option, the plan marks the human-check as optional end-of-phase UAT, and the automated verify re-run passed"
  - "Node repair for CircleCI test 15490: the owner id is read into a local before logging, so LoggingQualityAuditSpec full_user_wrapper passes and the emitted [OID:...] lines stay the same"
  - "observe_start_utc is the Running timestamp of the new thinx_api task (17:06:30Z). Container StartedAt is 17:06:29.5Z. 25-06 measures the 24 h window from 17:06:30Z"
  - "The 8 pre-flip no_cookie rejections (16:52:38-56Z, old v1.13 task) are recorded for the 25-06 classification, not treated as a rollback trigger: they came before both the Phase 25 image and the flip"

patterns-established:
  - "Only push when CircleCI has no thinx-staging job queued or running, including a node-repair re-push"

requirements-completed: [SEC-CSRF-02, SEC-CSRF-04, SEC-CSRF-05, SEC-CSRF-06]

coverage:
  - id: D1
    description: "Console seam pushed first (fast-forward), gitlink bumped, parent thinx-staging pushed (main untouched); origin/thinx-staging equals local HEAD"
    requirement: SEC-CSRF-02
    verification:
      - kind: other
        ref: "Task 2 verify 1 (SEAM-PUSHED-AND-BUMPED): console=3c906ffa… gitlink=3c906ffa…; git ls-remote main=a0309eb5 (unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CircleCI test, api-registry, console-classic-registry and vue-console-registry green for the pushed SHA dcbbd416 (test: 686 specs, 0 failures, including ZZ-CSRFEnforceSpec)"
    verification:
      - kind: integration
        ref: "Task 2 verify 2: api-registry=success console-classic-registry=success test=success vue-console-registry=success (builds 15492-15496)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The classic dashboard seam is served on rtm and the API runs the Phase 25 code in legacy mode with the v1.13 probe baseline, boot line mode=legacy key_source=secret enforce=true, 0 CRITICAL, 0 failed tasks, env CSRF_ENFORCE=true only"
    requirement: SEC-CSRF-02
    verification:
      - kind: e2e
        ref: "Task 2 verify 3 (LEGACY-LIVE-WITH-SEAM, served_seam=2, probe 17:05:16Z)"
        status: pass
      - kind: other
        ref: "Task 2 verify 4 (env CSRF_ENFORCE=true, boot_legacy=1, critical=0, Running)"
        status: pass
    human_judgment: false
  - id: D4
    description: "thinx_api in CSRF_MODE=observe: signed token, 900 s pre-session, no anonymous cookie, planted and stale pairs logged and counted but not blocked, header-less refused, stable for 5 min"
    requirement: SEC-CSRF-02
    verification:
      - kind: other
        ref: "Task 3 verify 1 (env CSRF_ENFORCE=true + CSRF_MODE=observe, boot_observe=1, Running; restarts=0 at 17:11:51Z)"
        status: pass
      - kind: e2e
        ref: "Task 3 verify 2 (OBSERVE-PROBE-OK, probe 17:06:58Z)"
        status: pass
      - kind: other
        ref: "Task 3 verify 3 (binding_mismatch log line 1; counters observe:binding_mismatch and observe:stale POST /api/user/create = 1 each; no OBS-FAIL)"
        status: pass
    human_judgment: false
  - id: D5
    description: "CSRF_MODE=observe persisted in gluster thinx.yml by an index-only one-line commit; the unrelated uncommitted edits stay uncommitted"
    verification:
      - kind: other
        ref: "Task 3 verify 4: head_has_observe=1 head_files=thinx.yml head_changed_lines=1 worktree_csrf_diff=0 (swarm a50dda1)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Classic dashboard in a real browser: hard reload, Devices and Profile render, a profile save carries X-XSRF-TOKEN (console-retest skill)"
    verification: []
    human_judgment: true
    rationale: "Optional post-hoc human-check from the Task 2 verify block, deferred to the end-of-phase UAT (25-10 combined two-console pass)"

duration: 27min
completed: 2026-09-29
---

# Phase 25 Plan 04: Legacy-Mode Deploy of the CSRF Code and Console Seam, then CSRF_MODE=observe Summary

**The Phase 25 CSRF code (`dcbbd416`) and the classic dashboard `X-XSRF-TOKEN` seam are live. They were first proven in legacy mode against the v1.13 probe baseline. `thinx_api` then switched to `CSRF_MODE=observe` at 2026-09-29T17:06:30Z: signed session-bound tokens and a 900 s pre-session, while binding failures are only logged and counted. `CSRF_ENFORCE=true` was never touched, and the mode is persisted in `thinx.yml` (swarm `a50dda1`).**

## Performance

- **Duration:** about 27 min
- **Started:** 2026-09-29T16:46:16Z (continuation after the Task 1 answer)
- **Completed:** 2026-09-29T17:13Z
- **Tasks:** 3 (Task 1 was answered by the operator: `proceed`)
- **Files modified:** 3 (gitlink, `lib/router.google.js`, runbook)

## observe_start_utc

**2026-09-29T17:06:30Z.** This is the Running timestamp of the new `thinx_api` task (container StartedAt 17:06:29.5Z). Plan 25-06 cannot start before **2026-09-30T17:06:30Z**.

## D-05 (external callers, start of observe)

Read-only, gathered by the Task 1 executor at about 15:44Z before any push:

| Method | Path | Router | Status | Count | Classification |
|---|---|---|---|---|---|
| POST | `/api/v2/user` | any | any | 0 | — |
| POST | `/api/user/create` | `thinx-api-https@docker` | probe answers | 4 | 29/Sep 14:34:53–54Z = the 25-03 legacy probe (matched by timestamp) |

- Window: about 57 h (27/Sep 06:48:11 → 29/Sep 15:44:34 UTC, 315,305 lines). The plan asked for 720 h, but the current Traefik task only holds 57 h.
- **External callers: 0.** No D-05 stop is needed for 25-08.
- Traefik logs **no User-Agent**: 0 of 313,322 lines, because `traefik.yml` has a bare `--accesslog`. The `thinx-p25-probe` UA therefore cannot be used to tell probes apart, so probe traffic is matched by timestamp instead. The check repeats at the end of observe (25-06) and before the guards (25-08).

## Task 2: legacy deploy (tracer)

| Item | Value |
|---|---|
| Gitlink commit | `c48e354a` `chore(25): bump console to the classic dashboard XSRF seam` (signed) |
| Local gates | CSRF jasmine five-file set 122 specs / 0 failures; `ConsoleHeaderParity` 13/13; `xsrf-seam.cjs` 13 ok / 0 not ok |
| Pre-push scan | **secret_hits=0**. The only endpoint hits are the manager endpoint already published in AGENTS.md (22 lines, all in `.planning`); loopback and any-address only in specs and docs; `AKIA`/`ghp_`/`hooks.slack` appear only as the pattern list inside 25-04-PLAN.md prose. The console diff has 0 hits. |
| Console push | `a5b0246..3c906ff` thinx-staging (fast-forward) |
| Parent push | `5e4ebe88..c48e354a` at 16:47:42Z, then node-repair `c48e354a..dcbbd416` at 16:53:22Z. main was not pushed (still `a0309eb5`). |
| CI for `c48e354a` | test 15490 **failed** (`LoggingQualityAuditSpec`, see Deviations); console-classic-registry 15484 and vue-console-registry 15486 succeeded; api-registry did not run |
| CI for `dcbbd416` | test 15492 success (686 specs, 0 failures, 1 pending; ZZ-CSRFEnforceSpec's first real run), api-registry 15493, console-classic-registry 15496, vue-console-registry 15494, all success (16:58:03Z) |
| Served seam | `rtm.thinx.cloud/app/js/thinx-api.js`: `X-XSRF-TOKEN` × 2 |
| Boot / health | `CSRF mode=legacy key_source=secret enforce=true` × 1, `CRITICAL` 0, 0 Failed/Rejected tasks on all three services |
| Env | `CSRF_ENFORCE=true` only |

Digests (image repo shown without the registry host):

| Service | Before (rollback reference) | After Task 2 |
|---|---|---|
| thinx_api | `thinx/api:swarm@sha256:66b3aa781b5688c8c10fae60b14d44ed22a764715c75ed27b9615fca6f44b637` | `thinx/api:swarm@sha256:bfe2a2fc73e3a37c798ae545f043556cc26226e2675f9131cc2653c7183995a9` (Running 16:58:27Z) |
| thinx_console | `thinx/console:swarm@sha256:5d501928ee0681dc171aa61ebfb4dc6b2890510d53806db902998ae5e5832c70` | `thinx/console:swarm@sha256:972a3c3a923796d980a4ed056a13e3282e94070dc7fa75c60e81baae4169f7a7` |
| thinx_vue | `thinx/console:vue@sha256:c2163d1dbc3b9a09abb6c84b7f0becca8debc6a00415fe2203b4d934e421e0c7` | `thinx/console:vue@sha256:61cdf6e3926223252d040934ccbb9ecbbd87f0fad892a1ff150bacbee304fc51` |

`thinx_console` and `thinx_vue` each rolled **twice**, once per console image publish (the `c48e354a` and `dcbbd416` workflows). `thinx_api` rolled once.

Legacy probe at 2026-09-29T17:05:16Z (matches the 25-03 baseline):

```
anon_set_cookie=1
prime_token_shape=legacy
pre_session_ttl_s=0
valid=200:email_required
planted=200:email_required
stale=200:email_required
header_less=403:csrf_token_invalid
```

**Tracer feedback gate.** The run is interactive (`auto_advance` false), `human_verify_mode` is the default `end-of-phase`, and the Task 2 verify carries a `<human-check>` marked "Optional post-hoc (end-of-phase UAT)". I did not synthesize a mid-flight checkpoint. The operator had explicitly chosen `proceed` over `review`, and `review` is the option that pauses after the deploy. I re-ran all four automated verify commands, and all passed. The human-check is carried as coverage D6 for the end-of-phase UAT.

## Task 3: observe switch

| Item | Value |
|---|---|
| Command | `timeout 300 docker service update --env-add CSRF_MODE=observe --no-resolve-image thinx_api`, from 17:06:15Z; converged at 17:06:35Z, rc 0 |
| Stability | 17:11:51Z: same container, `restarts=0`, 0 Failed/Rejected |
| Env | `CSRF_ENFORCE=true`, `CSRF_MODE=observe` (the only key added) |
| Boot | `CSRF mode=observe key_source=secret enforce=true` × 1, `CRITICAL` 0 |
| Log (probe) | `binding observed reason=binding_mismatch mode=observe for POST /api/user/create` × 1; `reason=stale` × 1 |
| Counters `csrf:obs:20260929` | `observe:binding_mismatch:POST /api/user/create 1`, `observe:stale:POST /api/user/create 1`, `observe:no_cookie:POST /api/user/create 1`, `legacy:no_cookie:POST /api/user/create 1`, `OBS-TOTAL 4`; all probe traffic |
| CSRF log events since the flip | 3, all from the probe at 17:06:58Z |
| Persisted | Swarm commit `a50dda1` `thinx_api: CSRF_MODE=observe (Phase 25)`: `thinx.yml` only, 1 added line after `- "CSRF_ENFORCE=true"`, unsigned like the repo's earlier commits, no hook flags. `console/default.conf`, `swarmpit.yml`, `swarmpit/influxdb.conf`, `traefik.yml` and the other `thinx.yml` hunks remain uncommitted |
| Rollback | Not needed; none of its triggers fired |

Observe probe at 2026-09-29T17:06:58Z:

```
anon_set_cookie=0
prime_token_shape=signed
pre_session_ttl_s=900
valid=200:email_required
planted=200:email_required
stale=200:email_required
header_less=403:csrf_token_invalid
```

**Probe windows (explained counter traffic for 25-06):** 17:05:16Z (legacy) and 17:06:58–59Z (observe), plus the 25-03 probe at 14:34:53–54Z.

**Pre-flip rejections to classify at 25-06:** Between 16:52:38 and 16:52:56Z, the **old v1.13 task** logged 8 `token rejected reason=no_cookie` events: 6 × `POST /api/v2/session/token` and 2 × `POST /api/v2/login`. That was before the Phase 25 image rolled at 16:58, and v1.13 does not count to Redis. The timing coincides with the first `thinx_vue` roll at 16:53:15Z. None has occurred since the flip.

## Task Commits

1. **Task 1: approval checkpoint.** No commit; answered `proceed` by the operator.
2. **Task 2 (tracer): legacy deploy.** `c48e354a` (chore: gitlink bump), then node-repair `dcbbd416` (fix).
3. **Task 3: observe switch.** `821ca519` (docs: runbook annex, not pushed). Production-side: swarm repo `a50dda1`.

**Plan metadata:** this SUMMARY commit.

## Files Created/Modified

- `services/console` (gitlink) moved `a5b0246` → `3c906ff`, the classic dashboard XSRF seam
- `lib/router.google.js`: the Google new-user `[NEW_SESSION]` log lines take the owner id from a local variable
- `.planning/runbooks/csp-csrf-hardening.md`: Phase 25 Execution Annex rows for D-05 start, legacy deploy, observe flip and rollbacks

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CircleCI test failed on LoggingQualityAuditSpec (node repair, one approved re-push)**
- **Found during:** Task 2 step 4 (CI for `c48e354a`, build 15490)
- **Issue:** 25-03 changed two `console.log` calls in `lib/router.google.js` from `req.session.owner` to `userWrapper.owner`. The logging audit (`scripts/logging-quality-audit.js`, rule `full_user_wrapper`) flags any log call whose text contains the identifier `userWrapper`, so `should gate high-risk sensitive logging regressions` failed (2 findings, lines 111-113 and 165-166). 685 of 686 specs passed. The spec is not in the local five-file CSRF set, so the local gates did not catch it.
- **Fix:** The owner id is now read into a local `newOwner` before both calls. The emitted `[OID:…] [NEW_SESSION]` lines are byte-identical, and statistics parsing is unaffected.
- **Files modified:** `lib/router.google.js`
- **Verification:** The audit on the old file reported 2 `full_user_wrapper` findings; on the new file, 0. Locally, `LoggingQualityAuditSpec` ran 10 specs with 0 failures and the CSRF set 122 specs with 0 failures; eslint is clean. CI test 15492 ran 686 specs with 0 failures.
- **Committed in:** `dcbbd416`. It was re-pushed once, after CircleCI had no thinx-staging job running, under the Task 1 node-repair approval.

---

**Total deviations:** 1 auto-fixed (Rule 1, the single approved node repair).
**Impact on plan:** The fix is confined to this phase's file and changes no behaviour. As a side effect, the consoles rolled twice instead of once, because both workflows published console images.

## Issues Encountered

- My first `thinx_api` convergence loop used a wrong exit test (it expected `Running Running`) and ran to its timeout. The state was already converged at 16:58:27Z, and I re-checked it read-only.
- The plan's D-05 window assumes 720 h, but Traefik only retains about 57 h in the current task. The 57 h result is recorded as is.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema was added. The swarm commit and the runbook annex contain no host, IP, token, cookie or secret value; image digests are shown without the registry host.

## User Setup Required

None.

## Next Phase Readiness

- **25-05 and 25-07** (code only) can run during the observe window. Nothing may be pushed to thinx-staging during the window without a new checkpoint, because a push redeploys `thinx_api`.
- **25-06** has the precondition `now ≥ 2026-09-30T17:06:30Z`. At that gate: classify the counters using the probe windows above, rerun D-05, run the forced `thinx_api` redeploy probe, and do the operator cold logins. Also classify the 8 pre-flip v1.13 `no_cookie` rejections (16:52Z) and keep watching for `no_cookie` on `POST /api/v2/session/token` from the Vue console. In observe, only the priming GET mints a token, so a client that posts `session/token` without priming first would show up there.
- Rollback remains one command: `timeout 300 docker service update --env-add CSRF_MODE=legacy --no-resolve-image thinx_api`, plus persisting it with the index-only procedure.

---
*Phase: 25-session-bound-csrf-console-edge-headers*
*Completed: 2026-09-29*

## Self-Check: PASSED

- Commits `c48e354a`, `dcbbd416` and `821ca519` were found in git. The runbook carries `observe_start_utc 2026-09-29T17:06:30Z`.
- Remote refs: parent `thinx-staging` = `dcbbd416`, `main` = `a0309eb5` (unchanged); console `origin/thinx-staging` = `3c906ff`.
- Task 2 verify: SEAM-PUSHED-AND-BUMPED, four CI jobs green, LEGACY-LIVE-WITH-SEAM, env/boot check all pass. Task 3 verify: env/boot/state, OBSERVE-PROBE-OK, log line and counters, and the `thinx.yml` persistence check all pass.
- No `restart.sh`, stack deploy, `docker service rollback` or other-service update was run. The only `docker service update` was the approved `--env-add CSRF_MODE=observe` on `thinx_api`.
