---
phase: quick-261004-on2
plan: 01
subsystem: builders, worker
tags: [micropython, builder, worker, swarm, ci, busybox, tdd, jest]
status: complete

requires:
  - phase: quick-261004-n65
    provides: "thinx_yml_load in builders/micropython-docker-build/cmd.sh (kept unchanged)"
  - phase: quick-261004-lps
    provides: "builder-lib.sh + builder.test.js stub-docker harness"
provides:
  - "One micropython contract: repository at /opt/workspace, image's own CMD, repo *.py frozen, /opt/workspace/build/firmware.bin -> DEPLOYMENT_PATH/firmware.bin"
  - "micropython cmd.sh: POSIX, absolute paths, esp8266 only, keep-list for port modules, clear SUCCESS/FAILED lines"
  - "micropython Dockerfile: toolchain (ChrisMacGregor esp-open-sdk) and mpy-cross built at image build, python3 + esptool installed"
  - "worker upy_build / upy_files in builder-lib.sh; micropython branch rewritten on top of them"
  - "worker swarmbuild creates the build service with --detach (production hang fix)"
  - "worker CircleCI test job runs npm test; docker/publish still requires it"
affects: [suculent/micropython-docker-build image, thinxcloud/worker image, parent gitlinks (to bump), AGENTS.md micropython notes]

actuals:
  tokens: 15953   # chars/4 over both repos' diffs (63814 chars)
  tasks: 4
  commits: 11     # micropython 4 + worker 7, git rev-list --count <before>..HEAD per repo
plan_head_before:
  micropython-docker-build: c2487e65cd99c53c631a4eeb96188ecf4e5a8023
  worker: 27fff67de2de8d3df1e6a366459eedc1c72be9b7
plan_head_after:
  micropython-docker-build: 5c3d792e343a0ef3c2e56bfada045cacac42e084
  worker: cc4fd285a5fd372fb57409957f92e4950316fe71

key-files:
  created:
    - builders/micropython-docker-build/tests/cmd-build.sh
  modified:
    - builders/micropython-docker-build/cmd.sh
    - builders/micropython-docker-build/Dockerfile
    - builders/micropython-docker-build/README.md
    - builders/micropython-docker-build/tests/thinx-yml-loader.sh (comment only)
    - services/worker/builder
    - services/worker/builder-lib.sh
    - services/worker/builder.test.js
    - services/worker/.circleci/config.yml
    - services/worker/CLAUDE.md

key-decisions:
  - "Contract follows the swarm path, which production already used: repository mounted at /opt/workspace, the image's default CMD. The non-swarm docker run now does the same (it used to mount modules/ only, with a --workdir that does not exist upstream)."
  - "Output is /opt/workspace/build/firmware.bin. The image runs as the unprivileged micropython user (uid 1000) and the repository is root-owned, so the worker removes whatever the repo has at build/ and recreates it mode 777 before the run."
  - "Frozen: every *.py in the repo root, then modules/ (modules/ wins), copied into ports/esp8266/modules. Symlinks and non-importable names (e.g. 'thinx copy.py' in the sample repo) are skipped."
  - "micropython.modules = keep-list of the port's own modules (the old loop's evident intent: 'Enabling'/'Disabling'); _boot.py, flashbdev.py, inisetup.py are always kept because _boot.py mounts the filesystem with them."
  - "micropython.platform: only esp8266 builds; anything else fails with a message. The image has only ever carried the xtensa-lx106 toolchain, so no working platform was dropped."
  - "Dockerfile: esp-open-sdk switched from pfalcon's fork to ChrisMacGregor's (the one nodemcu-docker-build uses). Same gcc 4.8.5 and NONOS SDK 2.1.0-18. pfalcon's stops on 22.04 at crosstool-NG configure. FROM unchanged."
  - "VERSION stays master (no pin). See open questions."

coverage:
  - id: E2E
    description: "A sample micropython repo builds into a deployed firmware.bin through the worker's own upy_build"
    verification:
      - kind: manual-script
        ref: "published image + the new Dockerfile's steps applied inside a container (apt packages, ChrisMacGregor esp-open-sdk built as micropython, mpy-cross), new cmd.sh bind-mounted; then committed locally and driven by services/worker upy_build (non-swarm) through a pull-skipping docker shim"
        status: pass
    human_judgment: true
    rationale: "CI must build the real image, and one swarm build on production must deploy (not done: nothing pushed)"
---

# Quick 261004-on2: micropython builds work end to end; worker CI runs tests

**The micropython builder now builds firmware.** The worker mounts the repository at `/opt/workspace` and runs the image's own command. `cmd.sh` freezes the repository's `*.py` and writes `build/firmware.bin`, which the worker deploys to `DEPLOYMENT_PATH/firmware.bin`.

The image itself was missing pieces, so the Dockerfile changed too. The published image has no built toolchain, no python3 and no esptool, so it could never have built firmware.

This task also includes two worker changes:
- **Production hang fix:** `swarmbuild` now creates the build service with `--detach`.
- **CI:** the worker's CircleCI `test` job now runs `npm test`.

Nothing was pushed. The parent repo and the other submodules are untouched.

## Commits

| Repo (branch) | Hash | Type | Message |
|---|---|---|---|
| micropython-docker-build (master) | 12b7a4a | test | failing cmd.sh build test (paths, syntax, frozen modules, firmware output) |
| micropython-docker-build (master) | 41d0849 | fix | cmd.sh builds the repository at /opt/workspace into build/firmware.bin |
| micropython-docker-build (master) | 61ee60b | fix | the image ships a built esp8266 toolchain, python3 and esptool |
| micropython-docker-build (master) | 5c3d792 | docs | README describes the THiNX worker contract, tests and current build |
| worker (main) | 72c2f79 | test | failing specs for the micropython build contract |
| worker (main) | 693b40c | fix | micropython builds mount the repository and deploy build/firmware.bin |
| worker (main) | 22684c0 | test | failing spec, a fast-failing build task hangs swarmbuild |
| worker (main) | 0c6ef7e | fix | create the build service detached so a fast failure cannot hang the worker |
| worker (main) | 6d63c64 | test | failing spec, CircleCI's test job does not run npm test |
| worker (main) | 3cadde0 | ci | the test job runs npm test before docker/publish |
| worker (main) | cc4fd28 | docs | worker notes for CI npm test, detached build services and the micropython contract |

## What was broken (found while doing this)

**The image (published `suculent/micropython-docker-build:latest`, built 2026-10-04 15:04Z, amd64):**
- `/esp-open-sdk` was cloned but never built. `cmd.sh` ran `make STANDALONE=y` on every build. pfalcon's fork fails on 22.04 at crosstool-NG's configure with `could not find bash >= 3.1`, which is exactly what the published image prints when run as-is.
- `/micropython` is master (`v1.30.0-preview-105-ga129b2fba`). Its build needs `python3` and the `esptool` command (`elf2image`), and neither is installed. The `esp8266/` directory and the `make axtls` target are gone upstream; the port now lives in `ports/esp8266`.
- **cmd.sh:**
  - relative `cd`s;
  - `bash -n` fails (two syntax errors in the modules loop);
  - reads `./thinx.yml` from `/`;
  - `RESULT=$?` is unreachable under `set -e`.

**The worker micropython branch:**
- The non-swarm path mounted only `modules/` with `--workdir /micropython/esp8266`.
- The swarm path never set `BUILD_SUCCESS`, so it always ended FAILED and never deployed anything.
- Firmware mode's "customizing" loop did `rm -rf $FSPATH; cp $pyfile $FSPATH` with both paths equal, which deleted the repository's top-level `*.py` before the build.
- File mode always ended FAILED, and its OUTFILE was `boot.py` even when the repository had none.

## The contract (documented in the image README, cmd.sh header, worker CLAUDE.md and builder-lib.sh)

- **Worker → image:**
  - `-v WORKDIR:/opt/workspace` (non-swarm) or `--mount type=bind,source=WORKDIR,destination=/opt/workspace` (swarm). Nothing else is mounted and the default CMD runs.
  - Before the run, the worker does `rm -rf WORKDIR/build`, then `mkdir`, then `chmod 777`. This removes a committed image, or a symlink out of the workspace, before anything is chmod'ed or deployed.
- **Image:**
  - Reads `/opt/workspace/thinx.yml` through the unchanged n65 `thinx_yml_load`. It prints nothing from it except module file names.
  - `platform` must be `esp8266`.
  - `modules` is a keep-list. The boot modules are always kept.
  - It copies the root `*.py` and then `modules/*.py` into `ports/esp8266/modules`.
  - It runs `make -C /micropython/mpy-cross`, then `make -C /micropython/ports/esp8266 BUILD=build-thinx`.
  - It copies the result to `/opt/workspace/build/firmware.bin`.
  - It ends with `THiNX BUILD SUCCESSFUL.` and exit 0, or with `THiNX BUILD FAILED: N`, a non-zero exit and no firmware.bin (EXIT trap).
- **Worker after the run:** success means the build status (task Complete, or `docker run` exit 0) plus a regular, non-symlink `build/firmware.bin` over 10000 bytes. That file is copied to `DEPLOYMENT_PATH/firmware.bin`, which becomes OUTFILE (sha/md5/JOB-RESULT).
- **File mode** (`upy_files`): copies the regular `*.py` from the root and then `modules/` into the deployment. OUTFILE is `boot.py`, else `main.py`. With neither, the build fails.

## Commands run and results

| Command | Result |
|---|---|
| RED: `sh tests/cmd-build.sh` on the old cmd.sh | **23 of 29 fail**. `bash -n` fails at line 181; the `cd`s fail (`esp-open-sdk`, `micropython/mpy-cross`, `micropython/esp8266`); nothing is frozen and no firmware is produced. |
| GREEN `tests/cmd-build.sh`, macOS `/bin/sh` + bash 5.2 / `/bin/bash` 3.2 | **29/29** |
| GREEN `tests/cmd-build.sh` with `CMD_SHELL="busybox sh"` under busybox sh (dhi.io/node:26-alpine3.24-dev, BusyBox 1.37.0, no bash) | **28/28** (the bash -n case is skipped: no bash) |
| `tests/cmd-build.sh` + `tests/thinx-yml-loader.sh` inside the published image (bash 5.1, gawk) | **29/29**, **23/23** |
| `tests/thinx-yml-loader.sh` (sh, bash, busybox) | **23/23** each |
| `bash -n cmd.sh` / `busybox sh -n cmd.sh` | both OK (before: bash -n failed) |
| Published image, unmodified, with its own cmd.sh | exit 2: `configure: error: could not find bash >= 3.1` (runtime esp-open-sdk build) |
| **Published image, unmodified, new cmd.sh bind-mounted over /opt/cmd.sh**, sample repo | exit 1 within a second: `No xtensa-lx106-elf toolchain in /esp-open-sdk/xtensa-lx106-elf/bin ... THiNX BUILD FAILED: 1`. 0 devsec markers printed. **A firmware build with the published image is impossible**: no toolchain, no python3, no esptool. |
| **Published image + new Dockerfile steps applied in a container** (root: apt python3 esptool libtool-bin xz-utils bc python3-dev python-is-python3; micropython user: ChrisMacGregor esp-open-sdk + newlib pre-seed + `make STANDALONE=y`, `make -C /micropython/mpy-cross`), new cmd.sh, `docker update --cpus 1`, sample repo (suculent/thinx-firmware-esp8266-upy files + a `modules/thinxhello.py` + devsec markers) | **exit 0 in 40 s**: `Firmware: /opt/workspace/build/firmware.bin (655616 bytes)`, `THiNX BUILD SUCCESSFUL.`. `frozen_content.c` lists main.py, mqtt.py, thinx.py and thinxhello.py, and not espnow.py (dropped by the keep-list) or `thinx copy.py`. The image starts with ESP magic `e9`. **0** devsec markers in the output. |
| Toolchain build attempts in that container | (1) pfalcon fork: crosstool-NG configure `could not find bash >= 3.1`. (2) ChrisMacGregor fork without python: cross-gdb `configure: error: python is missing or unusable` after 21:48. (3) With python3-dev + python-is-python3: **built**. Each failure added a Dockerfile package. |
| Root-owned Linux workspace (container fs), cmd.sh as uid micropython | `build/` root 755: `Cannot write to /tmp/wsroot/build. THiNX BUILD FAILED: 1`. `build/` root 777 (what upy_build does): **SUCCESSFUL**, 655488 bytes. This confirms the chmod 777 requirement. |
| **Worker `upy_build false WORKDIR DEPLOY LOG` (real docker CLI)** against that container committed as a local image, through a shim that skips `pull` and maps the image name | `upy_build rc=0`. The argv was `docker run --cpus=1.0 --rm -t -v /tmp/on2/wrk/repo:/opt/workspace <image>`. Log: `[micropython] Deployed 655616 bytes: .../deploy/firmware.bin`, and `strings` finds the modules/ marker in it. 0 devsec markers in out/build.log. |
| Worker RED, micropython specs | **10 failed** (the 4 negative guards and the legit-layout/infer pins pass already). |
| Worker RED, `--detach` spec | **1 failed** (`spawnSync bash ETIMEDOUT`: create blocks). After the fix it passes, and `pgrep "sleep 300"` finds no stray process. |
| Worker RED, CI spec | **1 failed** (`npm test` absent from the test job) |
| Mutation check of upy guards (size limit, symlink file mode, build/ symlink) | Each mutation is caught by at least one case. The `-L` check on firmware.bin is backed up by `find -type f`, so no single test isolates it (defense in depth). |
| `npm test` (services/worker), final, macOS bash | **2 suites, 146/146** (baseline 127/127, plus 19 new) |
| `jest builder.test.js` under busybox sh (dhi.io/node:26-alpine3.24-dev, BusyBox 1.37.0, no bash, `npm ci --ignore-scripts` in a `git archive HEAD` copy) | **86/86** (every builder.test.js case, the micropython and detach cases included) |
| `npm install && npm test` in `thinxcloud/console-build-env:latest` (the CI test image: Ubuntu 26.04, bash, node 25.9, `git archive HEAD` copy) | **2 suites, 146/146** |
| CircleCI config parse (`ruby -ryaml`) | test steps: checkout, with-cache{npm install}, `npm test`. docker/publish requires `["test"]`. The `circleci` CLI is not installed, so `config validate` was not run. |

## Deviations from Plan

**1. [Rule 3 - Blocking] The Dockerfile had to change (not only cmd.sh).**
- Without a built toolchain, python3 and esptool, no cmd.sh can produce firmware.
- I did not rebuild the image locally. Instead I applied the exact new Dockerfile steps inside a container of the published image and built there. The toolchain build takes about 22 minutes on this machine.
- FROM is unchanged. `VERSION` still defaults to master.

**2. [Rule 3] The esp-open-sdk fork changed** from pfalcon to ChrisMacGregor, the fork the nodemcu builder already uses on 22.04.
- AGENTS.md says the micropython builder uses "the esp-open-sdk fork (`pfalcon/esp-open-sdk`) … Python 2-only". That note is now stale.
- I could not update it, because the parent repo is out of scope for this task.

**3. [Rule 2] Worker hardening.** The plan did not ask for these, but the new mount contract needs them:
- `build/` is recreated rather than reused, so a committed image or a symlinked `build/` cannot be deployed or chmod'ed;
- a symlinked `firmware.bin` is not deployed;
- file mode skips symlinked `*.py`. Before, `cp $WORKDIR/*.py` would have copied a link's target, such as a worker-side file, into the deployment.

**4. Operator-added scope (coordinator message, 15:51Z incident):** `swarmbuild` creates the service with `--detach`. This was done as its own test+fix pair: 22684c0, then 0c6ef7e.

**5. Test adjustment.** The "no docker run passes the docker socket" wiring test now counts `docker run` lines in builder-lib.sh as well. micropython's `docker run` moved there, and the count would otherwise drop below 6.

**6. Not wired into micropython CI.** The plan deferred this.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: world-writable dir | services/worker/builder-lib.sh upy_build | `WORKDIR/build` is mode 777 so that uid 1000 in the image can write the firmware. It sits inside the per-build clone and is recreated each build. A symlinked `build/` is removed first, never followed. |
| threat_flag: by-design-code-exec | builders/micropython-docker-build | The build compiles repository `*.py` with mpy-cross, which parses but does not execute it. Repository files go through cp only. thinx.yml is never evaluated, and the module list is split with globbing off (`*` and `$(...)` cases are tested). |

## Known Stubs

None.

## Open questions

1. **Publishing order:**
   - Push micropython `master`. CircleCI `deploy-docker-build` builds and pushes `:latest`. The build now compiles the toolchain, about 20–40 minutes, which is the same as the nodemcu builder.
   - Then push worker `main` (CI runs `npm test`, then publishes).
   - Then bump both gitlinks in the parent on `thinx-staging`.
   - Then run one real micropython swarm build on production. This was not done; nothing was pushed.
2. **The worker change depends on the new image.** Until the new `:latest` is out, a micropython build gets `No xtensa-lx106-elf toolchain … THiNX BUILD FAILED`, so it ends FAILED quickly. It used to hang or end FAILED anyway. Push micropython first.
3. **Pin MicroPython `VERSION`?** master moves, and cmd.sh relies on the current `ports/esp8266` layout and on `BUILD=` producing `firmware.bin`. Pinning a release tag would make image rebuilds reproducible, but it changes which MicroPython users get. That is an operator decision.
4. **OTA for micropython does not work API-side, regardless of this fix.** `device.js updateFromPath` sends micropython to `update_multiple`, which answers false. The build now deploys `firmware.bin`, but the API will not serve it as an update until that path treats micropython like arduino (single binary). Also, `thinx.json` (the device config the sample's `thinx.py` reads) is not frozen or written into the firmware; only `*.py` are.
5. **AGENTS.md** (parent): update the micropython builder notes. It now uses ChrisMacGregor's fork, and the toolchain, python3 and esptool are in the image. The "22.04 is the ceiling" reasoning still holds, since this is still esp-open-sdk / gcc 4.8.5.
6. **Image size.** `crosstool-NG/.build` (sources and objects) stays in the image layer, as it does in nodemcu. Removing it in the same `RUN` would shrink the image substantially. This was not done, to keep parity with the nodemcu recipe.
7. The `--detach` fix needs a production check: a deliberately failing build should end FAILED, with the service removed, within one poll.

## Self-Check: PASSED

- FOUND: builders/micropython-docker-build/{cmd.sh,Dockerfile,README.md,tests/cmd-build.sh,tests/thinx-yml-loader.sh}; services/worker/{builder,builder-lib.sh,builder.test.js,.circleci/config.yml,CLAUDE.md}
- FOUND commits: micropython 12b7a4a 41d0849 61ee60b 5c3d792 (`rev-list --count c2487e6..HEAD` = 4); worker 72c2f79 693b40c 22684c0 0c6ef7e 6d63c64 3cadde0 cc4fd28 (`rev-list --count 27fff67..HEAD` = 7)
- Both working trees are clean. Nothing was pushed. The parent repo and the arduino/nodemcu builders were not touched. The local test container `on2-upy` and the image `on2/micropython-docker-build:emulated` were removed.
