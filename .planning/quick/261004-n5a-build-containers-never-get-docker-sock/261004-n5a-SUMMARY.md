---
phase: quick-261004-n5a
plan: 01
subsystem: worker
tags: [worker, builder, swarm, docker-sock, security, T-23-14, busybox, tdd, jest]
status: complete

requires:
  - phase: quick-261004-m46
    provides: "thinx.yml never eval'd (worker 192521b); this quick task is the containment follow-up"
provides:
  - "swarmbuild creates thinx_build-* services with no /var/run/docker.sock mount; workspace/deploy/repos mounts unchanged"
  - "builder's non-swarm path no longer has DOCKER_PREFIX; none of its six `docker run` calls of builder images passes the socket"
  - "builder.test.js: 2 new cases (service-create argv via the stub docker; static check of every docker run / docker.sock line)"
affects: [worker, builder, build-services]

actuals:
  tokens: 2100    # chars/4 over the realized worker diff 192521b..27fff67 (8418 chars)
  tasks: 2
  commits: 2
plan_head_before: 192521bacde1c9ae32c23ee6eeaa9194f5f2c509
plan_head_after: 27fff67de2de8d3df1e6a366459eedc1c72be9b7
# both heads are in the services/worker submodule repo (branch main), not the parent

tech-stack:
  added: []
  patterns:
    - "Only the worker holds the docker socket; containers that run repository content never do"

key-files:
  created: []
  modified:
    - services/worker/builder-lib.sh
    - services/worker/builder
    - services/worker/builder.test.js
    - services/worker/CLAUDE.md

decisions:
  - "DOCKER_PREFIX removed outright, not kept as an empty variable: its only content was the socket mount and all six users were the docker run lines edited here"
  - "Non-swarm path is covered by a static check, not an end-to-end builder run: the old branch keyed on /.dockerenv, which a test cannot create on the host"

metrics:
  completed: 2026-10-04
---

# Quick 261004-n5a: build containers never get docker.sock - Summary

The build services and the non-swarm `docker run` builder containers no longer get `/var/run/docker.sock`. They run repository content, and with the socket they were root on the swarm node. The worker keeps its own socket.

## What changed (services/worker, branch main)

| Commit | Type | What |
|--------|------|------|
| 4259d59 | test | Failing specs: `service create` argv has no docker.sock and keeps `/opt/workspace`, `/mnt/data/deploy`, `/mnt/data/repos` mounts; no `docker run` line in builder carries docker.sock, and no non-comment, non-echo line in builder or builder-lib.sh mentions it |
| 27fff67 | fix | builder-lib.sh: dropped `--mount type=bind,source=/var/run/docker.sock,...` from `swarmbuild`. builder: removed the `/.dockerenv` -> `DOCKER_PREFIX="-v /var/run/docker.sock:..."` block and `${DOCKER_PREFIX}` from the micropython, nodemcu, mongoose, arduino, pine64 and platformio `docker run` calls. CLAUDE.md: suite count 127 and a note on the socket |

The two remaining `docker.sock` mentions in builder are line 37 (comment) and line 42 (the operator `echo` for non-swarm mode). Both refer to the worker's own socket.

`docker-swarm.yml` was left alone: the `worker` service still mounts `'/var/run/docker.sock:/var/run/docker.sock'` (line 508), which it needs for `docker info`, `docker service create/ls/ps/logs/rm`, `docker pull` and `docker run`.

## Verification

| Command | Result |
|---------|--------|
| `npx jest builder.test.js -t 'docker.sock\|docker socket'` at 4259d59 (RED) | **2 failed**, 65 skipped. The service-create line contained `source=/var/run/docker.sock,destination=/var/run/docker.sock`; the static check found builder:383 and builder-lib.sh:95 |
| `npm test` at 27fff67 (macOS, bash) | **Test Suites: 2 passed. Tests: 127 passed, 127 total** (was 125) |
| `npx jest builder.test.js` (bash) | **67 passed, 67 total** |
| `docker run dhi.io/node:26-alpine3.24-dev` (BusyBox v1.37.0 `/bin/sh`, **no bash**; `npm ci --ignore-scripts` in a throwaway copy at /tmp/n5a-bb.STLl), `npx jest builder.test.js --coverage=false` | **67 passed, 67 total under busybox sh**. Both new cases ran there (`--verbose`: "the build service is created without the docker.sock mount", "no docker run of a builder image passes the docker socket"). The copied builder, builder-lib.sh, infer and builder.test.js are byte-identical to the committed files (`cmp`) |

## Evidence: builder images never call docker

Read-only grep across `builders/*-docker-build` (the other executor's submodules were not modified). Submodule HEADs at the time: arduino 1d8b5c1, micropython 45d9822, mongoose 5376270, nodemcu 17762fc, platformio 7eea8e2.

- **Entrypoints.** Every image's `CMD` is its `cmd.sh` (arduino `/opt/cmd.sh` in all three Dockerfiles, micropython `/opt/cmd.sh`, mongoose `/opt/cmd.sh`, nodemcu `/home/nodemcu/cmd.sh`, platformio `/opt/cmd.sh`).
- **`cmd.sh` mentions of docker:** arduino line 3 (echo of the version string `arduino-docker-build-...`) and line 10 (a comment, `'docker run -e ...'`); nodemcu line 26 (same comment); platformio line 5 (echo of `platformio-docker-build-...`) and line 29 (comment). micropython and mongoose `cmd.sh` have no mentions. None of them calls `docker` or touches `docker.sock`/`DOCKER_HOST`.
- **No docker CLI is installed.** No Dockerfile installs `docker-ce`, `docker.io`, `docker-cli` or containerd.
- **Real `docker` calls exist only in host-side scripts:** `build_and_push.sh`, `build.sh`, `cross-build.sh` (image build/push, never copied into an image) and `arduino-docker-build/tests/run-all-local.sh:17`. That last file is copied into the image as part of `/opt/tests`, but it is a host-side test runner that `cmd.sh` never invokes, and it couldn't run in the image anyway because there is no docker CLI.
- No file under `builders/` (outside `.git`) mentions `docker.sock`.

## Deviations from Plan

**1. [Plan latitude] DOCKER_PREFIX removed, not kept empty.** The plan allowed keeping it "as an empty/other-flags variable if other code concatenates it". The variable held only the socket mount, and its only users were the six `docker run` lines, which were edited in the same commit. Nothing else references it (`grep DOCKER_PREFIX` returns nothing).

**2. [Rule 2 - docs] services/worker/CLAUDE.md updated in the fix commit.** The suite count went from 125/125 to 127/127, and there's a short section saying not to re-add the mount, so a later session doesn't reintroduce it.

**3. Non-swarm path is tested statically.** The old code keyed on `/.dockerenv`, which can't be created on the test host, and running `builder` end to end needs a git checkout, jq and config. So the test checks every non-comment `docker run` line and every `docker.sock` mention, and the swarm path is checked by behaviour through the stub docker.

## Not verified / follow-ups

- **pine64.** `suculent/pine64-docker-build` has no source under `builders/`, so I could not confirm that its entrypoint never calls docker. It is only reachable through the `pine64` platform branch. If that image did use docker, its non-swarm build now fails without the socket rather than running as host root.
- **No live swarm build after this change.** That needs a worker image built from 27fff67 and deployed. The parent repo's submodule pointer was not bumped, per instructions.
- **CI.** CircleCI's worker `test` job still runs only `npm install`, so these specs don't run in CI (unchanged from 261004-lps).

## Self-Check: PASSED

- FOUND: services/worker/builder-lib.sh, builder, builder.test.js, CLAUDE.md (modified)
- FOUND commits in services/worker: 4259d59, 27fff67 (`git rev-list --count 192521b..HEAD` = 2)
