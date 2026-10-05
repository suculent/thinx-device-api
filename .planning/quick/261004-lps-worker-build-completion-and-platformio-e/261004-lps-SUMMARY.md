---
phase: quick-261004-lps
plan: 01
subsystem: worker
tags: [worker, builder, swarm, platformio, shell, busybox, tdd, jest]
status: complete

requires:
  - phase: 23-build-pipeline-sink-hardening
    provides: "argv-only worker builder invocation (class.js runArgv), the builder this fixes"
provides:
  - "swarmbuild ends on a terminal task state (Complete = success; Failed/Rejected/Shutdown/Orphaned/Remove = failure). It appends the service log, removes the thinx_build-* service and stops the background log writer on every terminal path"
  - "swarmbuild returns 0 only for complete and sets SWARMBUILD_OUTCOME (complete|failed|gone|timeout)"
  - "Poll schedule: first poll after 5 s, then every 10 s, 180 polls (~30 min) ceiling"
  - "platformio: multi-env platformio.ini without platformio.environment fails before building; OUTFILE is exactly .pio/build/<env>/firmware.bin"
  - "builder.test.js: 25 shell-level cases driven through a stub docker, run under bash and busybox sh"
affects: [worker, builder, platformio-docker-build, build-deploy]

actuals:
  tokens: 9600    # chars/4 over the realized worker diff b8c03b6..9add6f3 (38482 chars)
  tasks: 2
  commits: 3
plan_head_before: b8c03b68b5e39e7927dca8f28bd1475dc4b8b5b7
plan_head_after: 9add6f3fbf94f6ff4c2f8a0349e32146a38d99be
# both heads are in the services/worker submodule repo (branch main), not the parent

tech-stack:
  added: []
  patterns:
    - "Shell functions the build script needs to test live in a sourced library (builder-lib.sh), so jest can run them against PATH stubs"
    - "Repository-controlled config (thinx.yml, platformio.ini) is read with awk/sed only, and only the validated field is printed"
    - "busybox-ash-compatible shell for anything under /bin/sh in the worker image"

key-files:
  created:
    - services/worker/builder-lib.sh
    - services/worker/builder.test.js
  modified:
    - services/worker/builder
    - services/worker/CLAUDE.md
    - .planning/todos/pending/2026-09-28-fix-worker-builder-service-polling-completion-detection.md (uncommitted, parent repo)

key-decisions:
  - "0/1 alone is not terminal. It is also the state while the image is pulled (Preparing), so the task's CurrentState decides."
  - "A single [env:NAME] is pinned to .pio/build/NAME/firmware.bin. The old first-*.bin search survives only for a platformio.ini with no [env:NAME] at all."
  - "platformio branch deploys nothing when swarmbuild reports failed, timeout or gone; a missing or <10 kB image now reports STATUS FAILED (it reported OK before)"
  - "Env names: ^[A-Za-z0-9_.-]{1,64}$, plus '.', '..' and a leading '-' are refused (the regex alone allows a path traversal via '..')"
  - "CircleCI not changed: the worker test job runs only npm install. Making it run npm test is left to the operator, because publish depends on that job."

requirements-completed: []

coverage:
  - id: D1
    description: "swarmbuild poll loop ends on a terminal task state, appends logs, removes the service, stops the background log writer"
    verification:
      - kind: unit
        ref: "services/worker/builder.test.js#swarmbuild under bash / busybox (7 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "platformio environment selection: multi-env without environment fails before building; exact .pio/build/<env>/firmware.bin; thinx-autoflood layout (environment: d1_mini) keeps passing"
    verification:
      - kind: unit
        ref: "services/worker/builder.test.js#platformio environment selection (15 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "One real production build ends with 'Build completed.', leaves no thinx_build-* service and deploys within minutes"
    verification: []
    human_judgment: true
    rationale: "Needs the worker image published from main and a real swarm build; the stub docker cannot show swarm timing or real service ps output"

duration: 30min
completed: 2026-10-04
---

# Quick 261004-lps: Worker build completion and platformio env selection Summary

**The swarm build poll now stops on the task's real end state, read from `docker service ps`, instead of polling 0/1 for 30 minutes. Multi-env platformio repos deploy exactly `.pio/build/<env>/firmware.bin`, or fail before building when thinx.yml names no environment.**

## Performance

- **Duration:** about 30 min
- **Completed:** 2026-10-04
- **Tasks:** 2 of 2 (TDD: RED, then GREEN), plus a docs commit
- **Files:** 4 in the worker submodule, plus 1 uncommitted todo in the parent

## Commits (services/worker, branch main, NOT pushed)

| Hash | Type | Message |
|------|------|---------|
| d0b6cc5 | test | failing specs for swarmbuild completion and platformio env selection |
| cd2ce61 | fix | end the build-service poll on a terminal task; deploy only the chosen platformio env |
| 9add6f3 | docs | worker test notes for builder.test.js and busybox sh |

Nothing in the parent repo was staged or committed. The gitlink bump and the push are left to the orchestrator.

## What changed

**`builder-lib.sh` (new, sourced by `builder` via `$(dirname "$0")/builder-lib.sh`)**
- `swarmbuild` and `randomstring` were moved here unchanged in the RED commit.
- The grep tests now check exit status directly, e.g. `if echo "$DSTATUS" | grep -q "1/1"; then`.
- Any replica count other than `1/1` triggers `docker service ps "$UNIQUE_NAME" --no-trunc --format '{{.CurrentState}}|{{.Error}}' | head -n 1`:
  - `Complete*`: prints `Build completed.` and finishes with outcome `complete`.
  - `Failed*|Rejected*|Shutdown*|Orphaned*|Remove*`: prints `[worker] Service task failure: <state|error>` and finishes with `failed`.
  - Anything else (Preparing, Pending, Starting and so on): keeps polling.
- When the service is no longer listed, swarmbuild prints `Service failure.`, stops the log writer and ends with outcome `gone`.
- MAX_ITERATIONS prints `Build Timed Out, terminating service.` and finishes with `timeout`.
- `swarmbuild_finish` stops the background `docker service logs`, then runs `docker service logs | tee -a "$LOG_PATH"`, then `docker service rm`.
- The background writer is now `docker service logs … >> "$LOG_PATH" 2>&1 &` with no pipeline, so `$!` is the docker process itself and can be killed.
- `swarmbuild_poll_delay`: 5 s for the first poll, then 10 s. MAX_ITERATIONS is 180.
- `SWARMBUILD_FIRST_POLL`, `SWARMBUILD_POLL_INTERVAL` and `SWARMBUILD_MAX_ITERATIONS` are test-only overrides. Non-numeric values fall back to the defaults.
- `pio_ini_envs` reads the `[env:NAME]` sections. The shared `[env]` section, commented lines and CR characters are ignored.
- `pio_yml_environment` uses awk to find a direct child `environment:` of the top-level `platformio:`. Double quotes are dropped and the last occurrence wins, the same way cmd.sh's parse_yaml reads it. It does not use eval and prints nothing except the value.
- `pio_env_name_valid` and `pio_resolve_env` set `PIO_ENV`, or set `PIO_ENV_ERROR` and return 1.
- `pio_outfile <dir> <env>` returns `<dir>/.pio/build/<env>/firmware.bin`.

**`builder`, platformio branch only**
- `pio_resolve_env "$(pwd)" "$PIO_YML"` runs before `docker run` or `swarmbuild`. `PIO_YML` is the first `thinx.yml` under the repo, the same file cmd.sh picks.
- On failure the build logs `[platformio] multi-env platformio.ini: set platformio.environment in thinx.yml` (or the invalid-name message) followed by `Build refused before it started. Nothing deployed.` Status is FAILED and nothing is built.
- `if ! swarmbuild …; then PIO_BUILD_FAILED=true`. In that case it logs `Build service ended: <outcome>. Nothing deployed.` and sets STATUS FAILED.
- OUTFILE comes from `pio_outfile "$(pwd)" "$PIO_ENV"`. The 10 kB size check now applies to OUTFILE itself rather than to any `.bin`. A missing or undersized image sets STATUS FAILED.
- The other platforms' branches are untouched. They share `swarmbuild`, and its return value is ignored there as before.

## Commands run and results

| Command | Result |
|---------|--------|
| `npm test` (services/worker), baseline before changes | 1 suite, **60/60 passed** |
| `npx jest builder.test.js` after the RED commit | **23 failed, 1 passed** of 24. Swarm cases failed on behaviour: the loop ran to MAX_ITERATIONS, the return code was 0 on failure paths, the background logs process was still alive, and `$(… grep -q …)` was present. pio cases failed because `pio_resolve_env` exited 127 (not implemented yet). The wiring test failed because the branch had no `pio_resolve_env`. The passing case was the bash syntax check. |
| `npx jest builder.test.js` after GREEN | **24/24 passed** (25/25 after adding the autoflood case) |
| `docker run … dhi.io/node:26-alpine3.24-dev` (fresh `npm ci` in a container copy, `/bin/sh` = busybox, no bash), `jest builder.test.js --verbose` | **24/24 passed under busybox sh** before the autoflood case was added. Rerun at the final HEAD 9add6f3: **25/25 passed**. |
| `npm test` (services/worker), final | **2 suites, 85/85 passed** (60 existing plus 25 new) |
| `pgrep -fl "sleep 300"` after the runs | no stray stub process |

Jest cannot run against the macOS `node_modules` inside the container: jest 30's native resolver is platform-specific. The busybox run therefore did its own `npm ci --ignore-scripts` in a throwaway copy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `0/1` is not terminal by itself**
- **Found during:** Task 2
- **Issue:** The plan says `0/1` is terminal. A newly created service also shows `0/1` while its image is pulled, with the task in Preparing. Treating that as the end would cut builds short.
- **Fix:** `0/1` (or any count other than 1/1) triggers the `service ps` read. Only terminal task states end the loop; Preparing and similar states keep polling. The test drives `0/1 (Preparing) → 1/1 → 0/1 (Complete)`.
- **Commit:** cd2ce61

**2. [Rule 2 - Security] Env-name regex allows `..`**
- **Found during:** Task 1
- **Issue:** `^[A-Za-z0-9_.-]{1,64}$` accepts `.` and `..`, which would turn `.pio/build/../firmware.bin` into a path traversal. It also accepts a leading `-`, which `platformio run --environment` could read as an option.
- **Fix:** `pio_env_name_valid` refuses `.`, `..` and a leading `-` in addition to applying the regex. The invalid-name error does not echo the value.
- **Commit:** cd2ce61

**3. [Rule 1 - Bug] platformio reported STATUS OK for an artifact under 10 kB, and no status when OUTFILE was missing**
- **Fix:** Both cases now set STATUS FAILED. The size check targets OUTFILE, not any `.bin`.
- **Commit:** cd2ce61

**4. [Rule 1 - Bug] swarmbuild returned no failure signal**
- **Fix:** It returns non-zero for failed, gone and timeout, and sets `SWARMBUILD_OUTCOME`. The platformio branch now deploys nothing in those cases. Before, a timed-out build could still deploy whatever `.bin` it found.
- **Commit:** cd2ce61

**5. Removed dead checks**
- The `"No such image"` and `"invalid"` substring checks against `docker service ls` output were removed. That output never contains error text. A missing image now appears as the `Rejected …|No such image: …` task state, which is tested.

**6. Background logs writer is no longer piped through tee**
- Killing a background pipeline reliably needs its PID, so the early log goes to `$LOG_PATH` through a plain redirect. It no longer appears on stdout too. The final dump is still tee'd to stdout and to the log.

**7. Coordinator correction applied**
- thinx-autoflood does set `platformio: environment: d1_mini`, so the plan's note that autoflood would now fail is dropped. Added the test `thinx-autoflood keeps building: multi-env with environment d1_mini`: four envs, only `.pio/build/d1_mini` built, OUTFILE is exactly `.pio/build/d1_mini/firmware.bin`.

**8. Committed on the worker's `main`**
- The executor's protected-branch guard would refuse this. It was done on the orchestrator's explicit instruction, because the submodule's deploy flow is commits on `main`.

**9. Extra docs commit (9add6f3)**
- Updated the test count in the worker CLAUDE.md and noted the busybox/CI facts below.

### Not done (by instruction)
- Part 2 (removing the legacy cmd path) and Part 3 are out of scope.
- STATE.md and ROADMAP.md were not updated. This is a quick task handled by the orchestrator, and nothing in the parent repo was committed.

## How the worker image is built and deployed from `main`

- `services/worker/.circleci/config.yml` has a `test` job on `thinxcloud/console-build-env:latest`. That job **runs only `npm install`, not `npm test`**, so the new tests do not run in CI.
- `docker/publish` builds `services/worker/Dockerfile` and pushes **`thinxcloud/worker:latest` to Docker Hub**. It is filtered to branch `main` and requires `test`. It logs in to dhi.io first because the base image is `dhi.io/node:26-alpine3.24-dev`.
- The Dockerfile's `COPY . .` includes `builder-lib.sh`. `.dockerignore` excludes only `node_modules/`, `package-lock.json` and `test-private.sh`.
- Production: the repo's `docker-swarm.yml` service `worker` uses `image: thinxcloud/worker:latest` with `swarmpit.service.deployment.autoredeploy=true`, so Swarmpit should roll the new digest out after the publish.
- The parent repo's CircleCI does not build the worker image; it only snyk-scans `services/worker`.
- I have not checked the live service spec. The API service was once found pinned to a digest, so check with `docker service inspect thinx_worker --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'` on the manager.
- Order: push worker `main` first, then the parent gitlink bump to `thinx-staging`, because parent CI does a recursive submodule update.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: pre-existing-eval | services/worker/builder (`PARSED=$(parse_yaml "$YML" ""); eval "$PARSED"`), services/worker/infer (`infer_platform`) | **Not introduced or changed here.** The builder still evals parse_yaml output of the repository's thinx.yml. parse_yaml emits `export key="value"` with the value unescaped, so a value like `$(cmd)` or one containing a `"` should execute in the worker (root, docker.sock). This is reasoned from the code; my local confirmation run was denied by the sandbox. The platformio builder image's cmd.sh does the same, and the build service also gets docker.sock mounted. My new code never evals repository files. Recommend a follow-up todo. |

## Known Stubs

None.

## Open questions

1. Should the worker CircleCI `test` job run `npm test`? Today no worker test runs in CI. `docker/publish` requires `test`, so a red suite would block publishing. Bash is needed, and busybox optionally for the second shell pass.
2. Should a multi-env platformio.ini with a `[platformio] default_envs = <one env>` be accepted without thinx.yml `environment`? platformio would build only that env. Per the plan it currently fails.
3. Should `[env:NAME]` sections pulled in through `extra_configs` count? Only the main `platformio.ini` is read. A configured env missing from it only logs a warning, and the build then fails cleanly when `.pio/build/<env>/firmware.bin` does not exist.
4. Follow-up for the thinx.yml `eval` in `builder`/`infer`/cmd.sh (threat flag above).

## Self-Check: PASSED

- FOUND: services/worker/builder-lib.sh, services/worker/builder.test.js, services/worker/builder, services/worker/CLAUDE.md
- FOUND commits in services/worker: d0b6cc5, cd2ce61, 9add6f3. `git rev-list --count b8c03b6..HEAD` = 3.
- Worker working tree clean after the commits. The parent repo has nothing staged by this task, and the SUMMARY and todo edit are uncommitted as instructed.
