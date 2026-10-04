---
quick_id: 261004-lps
type: quick
autonomous: true
repo: services/worker (submodule, branch main)
files_modified:
  - services/worker/builder
  - services/worker/test-builder-poll.sh or a jest test driving it (new)
  - services/worker/package.json (test hook)
must_haves:
  truths:
    - "swarmbuild's poll loop ends as soon as the build service's task is terminal: `0/1` (or the service gone) is terminal; the real outcome is read from `docker service ps <name> --no-trunc --format '{{.CurrentState}}|{{.Error}}'` (Complete → success path, Failed/Rejected/non-zero exit → failure path)"
    - "grep tests use exit status directly (`if echo \"$DSTATUS\" | grep -q '1/1'; then`), no `$(... grep -q ...)` and no escaped quotes"
    - "On both outcomes the service logs are appended to $LOG_PATH (so 'THiNX BUILD SUCCESSFUL' detection works), the background `docker service logs | tee` process is killed, the thinx_build-* service is removed, and the loop exits"
    - "The first poll happens quickly (≤5 s) and later polls stay ≤30 s; MAX_ITERATIONS timeout still removes the service and fails the build"
    - "platformio: if platformio.ini declares more than one [env:*] and thinx.yml has no `platformio: environment:`, the build FAILS before deploying with a clear log line ('multi-env platformio.ini: set platformio.environment in thinx.yml'); with an environment set, OUTFILE is exactly .pio/build/<env>/firmware.bin (never `find … | head -n 1`); single-env repos keep working"
    - "thinx.yml/platformio.ini are read without eval/source (grep/awk/sed or node), and the env name is validated against ^[A-Za-z0-9_.-]{1,64}$ before use in a path"
---

# Quick 261004-lps: worker build completion detection + platformio env selection

<objective>
Operator decisions 2026-10-04: fix the worker polling now (todo `.planning/todos/pending/2026-09-28-fix-worker-builder-service-polling-completion-detection.md`, Part 1 only — Part 2 legacy cmd removal is NOT in scope); for multi-env platformio repos build/deploy only the configured env.

Production evidence (build 0d9c2b60-…, repo thinx-autoflood, 2026-10-04): build succeeded in minutes, the worker printed `Current service status … replicated 0/1` every 30 s until MAX_ITERATIONS (~30 min), then deployed. Four `thinx_build-*` services were left at 0/1 (orchestrator removed them). thinx-autoflood's platformio.ini has 4 envs (esp-relay esp01_1m 1MB, d1_mini, d1_mini-debug, d1_mini_test), thinx.yml has `platformio: { arch: esp8266, environment: d1_mini }` so only d1_mini was built; but for a multi-env repo WITHOUT an environment the deployed .bin would be whatever `find . -name '*.bin' | head -n 1` returns — a wrong-board image can brick a device.
The platformio builder image already supports `platformio: environment: <env>` in thinx.yml (builders/platformio-docker-build/cmd.sh ~66: `platformio run --environment …`).
</objective>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: failing test</name>
  <action>Add a test that puts a stub `docker` first on PATH (fake `service ls`/`service ps`/`service logs`/`service rm` outputs for running 1/1→complete 0/1, failed, rejected, service missing) and runs the swarmbuild function (extract it so it can be sourced/run in isolation if needed, without changing behaviour) with tiny sleep values via env overrides; assert exit path, log append, rm called, no lingering background process. Add multi-env cases for the platformio OUTFILE selection (fixture dirs with platformio.ini + thinx.yml + fake .pio/build/<env>/firmware.bin). Hook into `npm test` (jest can spawn bash) so worker CI runs it. Commit in services/worker only; must fail first.</action>
</task>
<task type="auto">
  <name>Task 2: implement</name>
  <action>Implement the truths in services/worker/builder. Do not touch other platforms' branches except where they share swarmbuild. Commit in services/worker only.</action>
</task>
</tasks>

<verification>
Worker `npm test` green. Parent repo is NOT committed by the executor (orchestrator bumps the gitlink and pushes worker main before parent thinx-staging). Post-deploy (orchestrator/operator): one real build ends with `Build completed.`, no thinx_build-* service left, deploy within minutes.
Correction 2026-10-04: thinx-autoflood's thinx.yml already sets `platformio: environment: d1_mini` (only .pio/build/d1_mini was built); it must keep passing.
</verification>
