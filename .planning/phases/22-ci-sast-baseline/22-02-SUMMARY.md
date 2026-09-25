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
  tasks: 3          # Task 1 done, Task 2 decision resolved, Task 3 applied on re-dispatch (server-side only)
  commits: 1        # code commits; Task 3 touches no repo files
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
  - "Task 3 first attempt was denied by the Claude Code auto-mode permission classifier (nothing changed); the user then authorised the D-13 production commands and re-dispatched. Applied 2026-09-25 13:08Z: gluster thinx.yml line 290 removed with backup, one --env-rm on thinx_console, image unchanged"
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
      - kind: other
        ref: "Task 3 gluster verify -> backup=thinx.yml.bak-phase22-20260925T130834Z dead=0 removed=1 added=0"
        status: pass
      - kind: other
        ref: "Task 3 live verify -> dead=0 update=completed image=UNCHANGED running=1"
        status: pass
      - kind: other
        ref: "Task 3 HTTP verify -> root=200 logview=200 title=1"
        status: pass
    human_judgment: true
    rationale: "Automated verifies all pass. The logged-in rtm console-retest (dashboard, Devices page, runtime console) needs credentials the executor does not have and stays a human-check"

duration: 13min
completed: 2026-09-25
status: complete
---

# Phase 22 Plan 02: Vue console link host proof and dead-env removal Summary

**The Vue console "THiNX Console" links are proven to resolve to https://console.thinx.cloud. The proof runs from the CircleCI job that built the live bundle through to the rendered href. The dead `VUE_APP_CONSOLE_HOSTNAME` env is gone from repo `docker-swarm.yml` on thinx-staging. The gluster and live removal (D-13) was approved. A tool-permission denial blocked the first attempt, and it was applied on re-dispatch at 2026-09-25 13:08Z with the image unchanged. rtm.thinx.cloud serves normally.**

## Performance

- **Duration:** about 13 min
- **Started:** 2026-09-25T12:45:16Z
- **Completed:** 2026-09-25T12:58Z
- **Task 3 re-dispatch:** about 3 min, 2026-09-25T13:07Z to 13:10Z
- **Tasks:** 3 of 3 (Task 1 done, Task 2 resolved, Task 3 applied on re-dispatch)
- **Files modified:** 1 (`docker-swarm.yml`)

## Accomplishments

- The link host is proven along the whole chain (D-09, D-10). The prohibition on dropping the build arg held, and no D-11 fix was needed.
- The dead env is removed from repo `docker-swarm.yml` (D-12) and pushed to `thinx-staging` together with the 22-01 commits. The whole pipeline (jobs 15413-15420) went green.
- D-13 reached gluster and live. The dead env is gone from gluster `thinx.yml` (which has a backup) and from the live `thinx_console` spec, through one rolling update with the image unchanged. Repo, gluster and live now agree.

## Task Commits

1. **Task 1 (tracer): the Vue console link host is proven end to end, and the dead env is removed from repo docker-swarm.yml and pushed.** Commit `9ccf9f18` (chore).
2. **Task 2 (checkpoint:decision, blocking-human):** resolved. The user approved "proceed" on 2026-09-25, typing it directly in the orchestrator session. There was no commit.
3. **Task 3: mirror the removal to gluster and live.** Applied on re-dispatch, see below. No code commit, because the task touches no repo files. The results are recorded in the `docs(22-02): record D-13 server-side removal` commit.

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

## Task 3 results (applied on re-dispatch)

**First attempt (2026-09-25, about 12:57Z), denied:**
- The Claude Code auto-mode permission classifier denied the guarded gluster backup and delete command before it ran. Nothing on the server changed.
- The live `--env-rm` was deliberately not run on its own, so gluster and live stayed consistent.
- The user then chose "Allow it, re-dispatch" in the orchestrator session, explicitly authorising the D-13 production commands. Auto mode was off for the re-dispatch.

**Settle (step 1), re-checked at 13:07Z:**
- The CircleCI thinx-staging tree (`limit=30`) had 0 items whose lifecycle was not `finished`.
- `thinx_console` UpdateStatus was `completed`, so it was not mid-update. Its running task was `qfphzkdggmse` on node `core`, the Swarmpit autoredeploy of 12:52:34Z.
- The manager used was `micro`, which is the swarm Leader. `core` is Reachable.

**Gluster pre-check (step 2), re-located live:**
- `VUE_APP_CONSOLE_HOSTNAME` appears exactly once in `thinx.yml` (`hits=1`), at **line 290**.
- The enclosing service is `263:  console:`.
- No earlier `thinx.yml.bak-phase22-*` file existed.

**Gluster edit (step 2), done at 13:08:34Z:**
- One guarded remote command (`set -e`) re-checked the count and the enclosing service, ran `cp -p` to the backup, then ran `sed -i "290d"`.
- The backup is **`thinx.yml.bak-phase22-20260925T130834Z`**.
- After the edit: `dead=0`. The file has 7 `VUE_APP_` lines, down from 8: the six other console keys plus `VUE_APP_ROLLBAR_ACCESS_TOKEN` in another service.
- No other file in that directory was edited.

**Live update (step 3), 13:08:45Z to 13:08:55Z:**
- Live placement was re-queried just before the update: `qfphzkdggmse core Running`, UpdateStatus `completed`, dead-env key count 1.
- Exactly one `docker service update --no-resolve-image --detach=false --env-rm VUE_APP_CONSOLE_HOSTNAME thinx_console` ran on `micro`. It ended with `verify: Service thinx_console converged`.
- The new task is **`u07eegg9ik03` on node `core`**, Running.
- `IMG_BEFORE` = `IMG_AFTER` = `thinx/console:swarm@sha256:76c2d34d…1a95f619`, the private registry image. The image was not re-resolved.
- After the update, the live `VUE_APP_*` key names are `API_HOSTNAME`, `CRISP_WEBSITE_ID`, `GOOGLE_ANALYTICS_ID`, `GOOGLE_MAPS_APIKEY`, `LANDING_HOSTNAME` and `ROLLBAR_ACCESS_TOKEN`. The other 6 keys are unchanged, and only `CONSOLE_HOSTNAME` is gone. Only key names were printed.
- Neither `restart.sh` nor `docker stack deploy` was run. Only `thinx_console` was updated. `thinx_vue` and every other service were untouched.

**Verify (step 4), the three Task 3 `<verify>` commands, run at 13:09Z:**
- gluster: `backup=thinx.yml.bak-phase22-20260925T130834Z dead=0 removed=1 added=0`
- live: `dead=0 update=completed image=UNCHANGED running=1`
- HTTP: `root=200 logview=200 title=1`

**console-retest, static subset (no login):**
- The served `/app/js/controllers/LogviewController.js` and `/app/js/main.js` target `wss://rtm.thinx.cloud`, with 2 occurrences.
- Both files have 0 `console.log(…cookie…)` calls and 0 `console.log(…owner|profile…)` calls.
- The logged-in part (dashboard, Devices page, runtime console) needs credentials the executor does not have. It stays a human-check below.

**Rollback (step 5):** not needed. The paths are `docker service rollback thinx_console` and copying the backup over `thinx.yml`.

## Pending human-checks (end-of-phase UAT)

- **Task 1 tracer, not confirmed by the user.**
  - In CircleCI (Organization Settings → Contexts → console, or Project Settings → Environment Variables), confirm a variable **named** `VUE_WEB_HOSTNAME` exists. Check the name only, not the value.
  - Log in at https://console.thinx.cloud and confirm that the footer "THiNX Console" link on an `/app` page (Layout.vue:12) has href `https://console.thinx.cloud`.
- **Task 3 rtm login retest.** The executor could not verify login automatically. Log in at https://rtm.thinx.cloud and run the console-retest skill:
  - the dashboard loads
  - the websocket connects to `wss://rtm.thinx.cloud/…` (the served bundle already targets it)
  - the Devices page shows no Angular parse error
  - the browser console shows no cookie, owner or profile debug logging

## Files Created/Modified

- `docker-swarm.yml`: the classic `console:` service environment no longer has the dead `VUE_APP_CONSOLE_HOSTNAME` line.
- Server-side, not in the repo: gluster `thinx.yml` lost line 290, and a new backup `thinx.yml.bak-phase22-20260925T130834Z` sits next to it. The live `thinx_console` spec has a new version without the env.

## Decisions Made

- Task 2: the user approved "proceed" on 2026-09-25.
- On the first attempt, the live env-rm was not run on its own after the gluster edit was denied. Keeping gluster and live consistent mattered more than a partial D-13. On re-dispatch, both ran in that order: gluster first, then live.
- CI-03 is marked complete. Its requirement text covers the live-bundle proof and the repo `docker-swarm.yml` removal. D-13's gluster and live reach is now also done.

## Deviations from Plan

**1. [Blocked, then resolved - tool permission] Task 3 production edits deferred to a re-dispatch**
- **Found during:** Task 3, step 2, on the first attempt.
- **Issue:** The Claude Code auto-mode permission classifier denied the guarded gluster backup and delete command. Under the denial rules the executor did not pursue the same outcome by another route.
- **Action:** The first attempt stopped after its read-only pre-checks, and nothing changed. The user then authorised the commands and re-dispatched with auto mode off. The re-dispatch ran Task 3 exactly as planned, with all verifies green.
- **Files modified:** none in the repo.
- **Commit:** none for code. The results are recorded in `docs(22-02): record D-13 server-side removal`.

**Total deviations:** 1 (a delayed task, not an auto-fix).
**Impact on plan:** None remaining. Repo, gluster and live agree, so a future `restart.sh` no longer re-adds the dead env.

## Flagged Assumptions Follow-up

- A-03, that Swarmpit autoredeploy does not re-add the env, is now testable. After the next `console:swarm` autoredeploy, check that the `thinx_console` env keys still have no `VUE_APP_CONSOLE_HOSTNAME` (key names only).

## Issues Encountered

- Chrome 154 `--headless=new --dump-dom` does not exit after printing. The processes were killed by PID.

## User Setup Required

None.

## Next Phase Readiness

- 22-03 (CI-01) can proceed.
- Carry the pending human-checks above to the phase-22 UAT: the CircleCI var name, the Layout footer link, and the rtm login retest.

## Self-Check: PASSED

- FOUND: `docker-swarm.yml`, with `dead=0 vueapp=7`
- FOUND: commit `9ccf9f18` on `origin/thinx-staging` (`git ls-remote` gives `9ccf9f18b346…`)
- Measured code commits since plan_head_before: 1
- Task 3 re-dispatch: backup `thinx.yml.bak-phase22-20260925T130834Z` exists on gluster, and all three verifies were re-run after the change and passed (gluster `dead=0 removed=1 added=0`, live `dead=0 update=completed image=UNCHANGED running=1`, HTTP `root=200 logview=200 title=1`).

---
*Phase: 22-ci-sast-baseline*
*Completed: 2026-09-25*
