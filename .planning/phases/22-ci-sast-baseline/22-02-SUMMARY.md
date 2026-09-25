---
phase: 22-ci-sast-baseline
plan: 02
subsystem: infra
tags: [ci, vue-console, swarm, hostname, circleci]

requires:
  - phase: 22-ci-sast-baseline (22-01)
    provides: serialised thinx-staging push slot (CodeQL v4 + CI-02 commits pushed together with this plan's commit)
provides:
  - "End-to-end proof that the Vue console 'THiNX Console' links resolve to https://console.thinx.cloud (CircleCI VUE_WEB_HOSTNAME -> build arg -> Dockerfile ARG/ENV -> served bundle -> rendered href)"
  - "Repo docker-swarm.yml without the dead VUE_APP_CONSOLE_HOSTNAME env on the classic console service"
affects: [phase-25-console-edge-headers, swarm-ops, gluster-thinx-yml]

actuals:
  tokens: 17        # chars/4 over the realized code diff (one 66-char line removed from docker-swarm.yml)
  tasks: 2          # Task 1 done, Task 2 decision resolved; Task 3 blocked (not executed)
  commits: 1
plan_head_before: 6f03e3e2a97829c39b8145154c54f119509ac5c8

tech-stack:
  added: []
  patterns:
    - "Prove a build-time host from the served bundle backwards: bundle literal -> buildHash -> CircleCI job -> required-vars step output"

key-files:
  created: []
  modified:
    - docker-swarm.yml

key-decisions:
  - "Task 2 gate: user approved 'proceed' on 2026-09-25 (D-13 gluster + live edits)"
  - "Task 3 not executed: the Claude Code auto-mode permission classifier denied the gluster thinx.yml edit; the live --env-rm was deliberately not run on its own, so gluster and live stay consistent with each other (both still carry the env). D-13 server-side reach is an open operator item"
  - "Chain intact, so no D-11 fix: .circleci/config.yml and the services/console submodule pointer (a0e86707) were not modified; WEB_HOSTNAME untouched"

patterns-established:
  - "Headless Chrome 154 --headless=new --dump-dom prints the DOM but does not exit; kill the process by PID after output"

requirements-completed: [CI-03]

coverage:
  - id: D1
    description: "Vue console link host proven end to end: live bundle compiles consoleHostname=console.thinx.cloud, buildHash maps to a green vue-console-registry job whose required-vars step passed, build arg + Dockerfile ordering intact, rendered href on /#/login and /#/password-reset is https://console.thinx.cloud"
    requirement: CI-03
    verification:
      - kind: other
        ref: "curl https://console.thinx.cloud/js/app.js | grep consoleHostname"
        status: pass
      - kind: other
        ref: "CircleCI v1.1 tree -> job 15405 'Check Required Environment Variables' output"
        status: pass
      - kind: other
        ref: "config/Dockerfile chain check -> CHAIN-CONFIG-OK"
        status: pass
      - kind: automated_ui
        ref: "headless Chrome --dump-dom /#/login and /#/password-reset"
        status: pass
    human_judgment: false
  - id: D2
    description: "CircleCI UI shows a variable named VUE_WEB_HOSTNAME (console context or project vars), and the authenticated Layout footer 'THiNX Console' link (Layout.vue:12) has href https://console.thinx.cloud"
    requirement: CI-03
    verification: []
    human_judgment: true
    rationale: "No CircleCI token for the contexts API and the /#/app Layout is behind login; tracer human-checks were not confirmed by the user and remain pending for end-of-phase UAT"
  - id: D3
    description: "Dead VUE_APP_CONSOLE_HOSTNAME env removed from repo docker-swarm.yml (classic console service), pushed to thinx-staging"
    requirement: CI-03
    verification:
      - kind: other
        ref: "yaml.safe_load + grep -> SWARM-YML-OK dead=0 vueapp=7; numstat 0 1 docker-swarm.yml; PUSHED-TO-STAGING"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-13 server-side reach: gluster /mnt/gluster/deployment/swarm/thinx.yml line removed (with backup) and live thinx_console spec env-rm'd; rtm.thinx.cloud retest after the restart"
    requirement: CI-03
    verification:
      - kind: manual_procedural
        ref: "Task 3 verify commands (gluster dead/removed/added, live dead/update/image/running)"
        status: fail
    human_judgment: true
    rationale: "Not executed: the auto-mode permission classifier denied the production gluster edit. Operator must run the Task 3 commands (listed under Open Items) or grant permission and re-dispatch"

duration: 13min
completed: 2026-09-25
status: complete
---

# Phase 22 Plan 02: Vue console link host proof and dead-env removal Summary

**The Vue console "THiNX Console" links are proven to resolve to https://console.thinx.cloud. The proof runs from the CircleCI job that built the live bundle through to the rendered href. The dead `VUE_APP_CONSOLE_HOSTNAME` env is gone from repo `docker-swarm.yml` on thinx-staging. The gluster and live removal (D-13) was approved but blocked by a tool-permission denial, and is left for the operator.**

## Performance

- **Duration:** about 13 min
- **Started:** 2026-09-25T12:45:16Z
- **Completed:** 2026-09-25T12:58Z
- **Tasks:** 2 of 3 (Task 1 done, Task 2 resolved, Task 3 blocked)
- **Files modified:** 1 (`docker-swarm.yml`)

## Accomplishments

- The link host is proven along the whole chain (D-09, D-10). The prohibition on dropping the build arg held, and no D-11 fix was needed.
- The dead env is removed from repo `docker-swarm.yml` (D-12) and pushed to `thinx-staging` together with the 22-01 commits. The whole pipeline (jobs 15413-15420) went green.
- Pre-change facts for gluster and live are recorded read-only, so the operator can apply D-13 without re-discovering them.

## Task Commits

1. **Task 1 (tracer): the Vue console link host is proven end to end, and the dead env is removed from repo docker-swarm.yml and pushed.** Commit `9ccf9f18` (chore).
2. **Task 2 (checkpoint:decision, blocking-human):** resolved. The user approved "proceed" on 2026-09-25, typing it directly in the orchestrator session. There was no commit.
3. **Task 3: mirror the removal to gluster and live.** Blocked, see below. No commit, because the task touches no repo files.

## Task 1 evidence

1. **Bundle (D-09, D-10.3).** `https://console.thinx.cloud/js/app.js` compiles `consoleHostname = "console.thinx.cloud"`. The value has no scheme, and `fixUrlProtocol` adds `https://`. The buildHash was `89c5cf9` when checked. At planning time it was `115acff`; the 22-01 push rebuilt it. Job 15413 (`vue-console-registry` on 9ccf9f18) finished green at 12:54:54Z, so the hash moves to `9ccf9f1` once Swarmpit rolls thinx_vue.
2. **CircleCI var (D-10.1).** `hash=89c5cf9 job=15405`. Job 15405 is `vue-console-registry` on thinx-staging, commit 89c5cf93. It succeeded and finished at 2026-09-25T12:43:35Z. Its "Check Required Environment Variables" step printed `All required environment variables are present.`. `VUE_WEB_HOSTNAME` is on that list (config.yml:174), so it was set when the live image was built. The parent pipeline produces the deployed image. The submodule's `vue` job only runs on the `thinx-console` branch.
3. **Build arg and Dockerfile (D-10.2).** The check printed `arg=1 req=1 classic=1 vue=1 ARG=23 ENV=44 BUILD=77`, then `CHAIN-CONFIG-OK`. `WEB_HOSTNAME` is untouched (D-11). The submodule pointer is unchanged at `a0e86707`.
4. **Rendered links (D-10.4).** Headless Chrome returned `href="https://console.thinx.cloud" target="_blank">THiNX Console` on both `/#/login` and `/#/password-reset`. With `--headless=new --dump-dom`, Chrome 154 printed the DOM but did not exit, so each process was killed by PID after its output.
5. **Chain intact.** No D-11 fix was needed. `.circleci/config.yml` and the submodule were not modified.
6. **Live and gluster, read-only, before the change.**
   - `thinx_console` was on node `core` (task ghw1owr5ewyj, UpdateStatus `completed`) with a dead-env count of 1.
   - `thinx_vue` was on node `micro` (task p8b8o4h9aafi) with a dead-env count of 0.
   - Placement has flipped since the STATE.md note of 2026-09-21.
   - On gluster, only `thinx.yml` has the var, at line 290 inside the `console:` service.
7. **Repo edit (D-12).** The checks printed `YAML-OK`, `dead=0 vueapp=7` and `SWARM-YML-OK`. The vue block is byte-identical, and numstat is `0 1 docker-swarm.yml`.
8. **Push.** The push `89c5cf93..9ccf9f18` to thinx-staging carried 41d2658f, 6f03e3e2 and 9ccf9f18. The pipeline ran jobs 15413-15420 and all were green by 12:55:55Z. Nothing was pushed to main.

## Task 3 results (blocked)

**Settle (step 1), done:**
- The CircleCI thinx-staging queue drained to 0 pending at 12:55:55Z.
- Swarmpit had already autoredeployed `thinx_console` to the new `console:swarm` image at 12:52:34Z, 14 s after job 15415 finished.
- The new task is `qfphzkdggmse` on node `core`, Running, with UpdateStatus `completed`.
- The image is `registry.thinx.cloud:5000/thinx/console:swarm@sha256:76c2d34d…1a95f619`.

**Gluster pre-check (step 2, read-only), done:**
- `VUE_APP_CONSOLE_HOSTNAME` appears exactly once in `thinx.yml`, at **line 290**. This was re-located live and matches the planning value.
- The enclosing service is `263:  console:`.
- The six other `VUE_APP_*` keys on that service (lines 284-289), plus `VUE_APP_ROLLBAR_ACCESS_TOKEN` at 341 in another service, were confirmed by key name only.
- Earlier backups already present: `.bak` and seven dated `.bak.2026…` files.

**Live pre-check, done:**
- `thinx_console` env keys include `VUE_APP_CONSOLE_HOSTNAME` alongside the other six `VUE_APP_*` keys. Only names were printed.

**Gluster edit and live update (steps 2-3), not executed:**
- The single guarded remote command did all of these: re-check the count and enclosing service, `cp -p` to `thinx.yml.bak-phase22-{UTC}`, then `sed -i "290d"`.
- The Claude Code auto-mode permission classifier **denied** that command before it ran. Nothing on the server changed: no backup was written and no line was deleted.
- Following the denial rules, the executor did not retry by any other route.
- The live `docker service update --env-rm` was **deliberately not run on its own**. Removing the env from live while gluster still carries it would let the next `restart.sh` reintroduce it and leave the two sources inconsistent. D-13 treats them as one change.
- Neither `restart.sh` nor `docker stack deploy` was run. `thinx_vue` and every other service were untouched.

**HTTP check (step 4), baseline only, no restart happened:**
- The check printed `root=200 logview=200 title=1` before the attempted change.

**IMG_BEFORE / IMG_AFTER:**
- IMG_BEFORE is `registry.thinx.cloud:5000/thinx/console:swarm@sha256:76c2d34d…1a95f619`.
- There is no IMG_AFTER, because no update was run.

## Open Items: D-13 server-side reach (operator)

The user approved these edits. Run them from a shell where `micro` resolves, following the plan's `set -- $(sed -n … ~/.aliases)` pattern. Print env key names only.

```bash
# 1. Gluster (guarded; stops unless exactly one hit inside "  console:")
f=/mnt/gluster/deployment/swarm/thinx.yml
N=$(grep -n VUE_APP_CONSOLE_HOSTNAME $f | cut -d: -f1)      # expect 290
head -n $N $f | grep "^  [a-z][a-z0-9_-]*:$" | tail -1      # expect "  console:"
cp -p "$f" "$f.bak-phase22-$(date -u +%Y%m%dT%H%M%SZ)"
sed -i "${N}d" "$f"

# 2. Live (one service, image unchanged)
docker service update --no-resolve-image --detach=false --env-rm VUE_APP_CONSOLE_HOSTNAME thinx_console

# Rollback if rtm.thinx.cloud breaks
docker service rollback thinx_console   # and copy the .bak-phase22-* over thinx.yml
```

Then re-run the three Task 3 `<verify>` commands in `22-02-PLAN.md`. The expected results are:
- gluster: `dead=0 removed=1 added=0`
- live: `dead=0 update=completed image=UNCHANGED running=1`
- HTTP: `root=200 logview=200 title>=1`

## Pending human-checks (end-of-phase UAT)

- **Task 1 tracer, not confirmed by the user.**
  - In CircleCI (Organization Settings → Contexts → console, or Project Settings → Environment Variables), confirm a variable **named** `VUE_WEB_HOSTNAME` exists. Check the name only, not the value.
  - Log in at https://console.thinx.cloud and confirm that the footer "THiNX Console" link on an `/app` page (Layout.vue:12) has href `https://console.thinx.cloud`.
- **Task 3, applies once the Open Items above are done.** Log in at https://rtm.thinx.cloud and run the console-retest skill:
  - the dashboard loads
  - the websocket targets `wss://rtm.thinx.cloud/…`
  - the Devices page shows no Angular parse error
  - there is no cookie, owner or profile debug logging

## Files Created/Modified

- `docker-swarm.yml`: the classic `console:` service environment no longer has the dead `VUE_APP_CONSOLE_HOSTNAME` line.

## Decisions Made

- Task 2: the user approved "proceed" on 2026-09-25.
- The live env-rm was not run on its own after the gluster edit was denied. Keeping gluster and live consistent matters more than a partial D-13.
- CI-03 is marked complete. Its requirement text covers the live-bundle proof and the repo `docker-swarm.yml` removal, and both are done. The D-13 gluster and live reach is tracked separately as an open operational item.

## Deviations from Plan

**1. [Blocked - tool permission] Task 3 production edits not applied**
- **Found during:** Task 3, step 2.
- **Issue:** The Claude Code auto-mode permission classifier denied the guarded gluster backup and delete command. Under the denial rules the executor may not pursue the same outcome by another route.
- **Action:** Task 3 stopped after its read-only pre-checks. The live update was skipped as well so that gluster and live stay consistent. The exact commands are listed under Open Items.
- **Files modified:** none.
- **Commit:** none.

**Total deviations:** 1 (a blocked task, not an auto-fix).
**Impact on plan:** The repo side and the proof are complete. D-13's server-side reach is outstanding, and the next `restart.sh` would still set the dead env, which has no functional effect on the classic console.

## Flagged Assumptions Follow-up

- A-03, that Swarmpit autoredeploy does not re-add the env, is still untested, because the live env was not removed.

## Issues Encountered

- Chrome 154 `--headless=new --dump-dom` does not exit after printing. The processes were killed by PID.

## User Setup Required

None. The D-13 operator commands are listed under Open Items.

## Next Phase Readiness

- 22-03 (CI-01) can proceed. It does not depend on the server-side env removal.
- Carry the D-13 gluster and live item to the phase-22 verifier and UAT.

## Self-Check: PASSED

- FOUND: `docker-swarm.yml`, with `dead=0 vueapp=7`
- FOUND: commit `9ccf9f18` on `origin/thinx-staging` (`git ls-remote` gives `9ccf9f18b346…`)
- Measured commits since plan_head_before: 1
- Task 3 is honestly reported as not executed, and nothing in production changed.

---
*Phase: 22-ci-sast-baseline*
*Completed: 2026-09-25*
