---
created: 2026-09-28T18:44:25.279Z
title: Fix worker builder service polling completion detection; remove legacy cmd shell path
area: worker
severity: major
files:
  - services/worker/builder:110-160
  - services/worker/class.js:61-129,216-260
  - services/worker/test.js
  - lib/thinx/builder.js:222,275
  - spec/jasmine/BuilderRemoteJobSpec.js
---

## Problem

The build-service polling loop in `services/worker/builder` never detects that a build finished.
Every status check wraps `grep -q` in a command substitution:

```bash
if [[ ! -z "$(echo ${DSTATUS} | grep -q \"1/1\")" ]];                 # L119 still running
if [[ ! -z "$(echo ${DSTATUS} | grep -q \"task: non-zero exit\")" ]];  # L124 failure
if [[ ! -z "$(echo $DSTATUS | grep -q \"0/0\")" ]];                   # L132 completed
```

`grep -q` prints nothing, so `$(...)` is always empty and none of those branches can fire. The
escaped quotes (`\"0/0\"`) also make grep search for the literal quote characters. On top of
that, a finished `--restart-condition=none` service reports `0/1` in `docker service ls`, never
`0/0`.

Result: after a successful build the worker keeps printing
`Current service status: … replicated 0/1 …` every 30 s until `MAX_ITERATIONS` (60 × 30 s ≈ 30 min).
It never appends the final service log, never removes the `thinx_build-*` service, and never frees
the worker for the next job. Seen in production 2026-09-28 on build
`43c748d0-bb69-11f1-8a47-e78d11b3c5cf` (private repo `suculent/eav-firmware`). The build log itself
ended `THiNX BUILD SUCCESSFUL.` with 3 environments succeeded.

Also confirmed in production (23-05 executor, 18:38:57Z): the escaped patterns make grep treat the
words as file names (`grep: non-zero: No such file or directory`, `grep: exit": …`), and three older
`thinx_build-*` services are still sitting at `0/1`. Unverified but likely: because the
"Build completed" log append never runs, a successful build may end up reported as FAILED. Check
this while fixing.

The bug predates phase 23. `builder` was last changed in `f5d7c05`, and phase 23 did not touch it.

## Solution

- Test grep's exit status directly: `if echo "$DSTATUS" | grep -q "1/1"; then`, with no command
  substitution and no escaped quotes.
- Treat `0/1` (the task has exited) as terminal. Then read the task's real outcome, for example
  `docker service ps "$UNIQUE_NAME" --no-trunc --format '{{.CurrentState}}|{{.Error}}'`, to tell
  `Complete` from `Failed … non-zero exit`.
- In both cases, append `docker service logs` to `$LOG_PATH` (the `THiNX BUILD SUCCESSFUL` phrase
  decides OUTFILE extraction), then `docker service rm` and stop the loop.
- Kill the background `docker service logs … | tee` process when the loop ends.
- Consider shortening `sleep 30` or adding a quick first poll, since short builds now wait at
  least 30 s.
- Add a test that stubs `docker` on `PATH` (fake `service ls` / `service ps` outputs for running,
  complete, failed, and missing) and asserts the loop's exit path. Hook it into the worker's
  `npm test` next to the existing jest suite.
- Ship as a `/gsd-quick` task. Commit inside the `services/worker` submodule, then bump the
  parent's gitlink. Push worker `main` before the parent `thinx-staging`, because parent CI does a
  recursive submodule update. Confirm in production with one real build: the log shows
  `Build completed.`, the `thinx_build-*` service is removed, and the worker picks up the next job.

## Part 2 — Remove the legacy `cmd` shell path (added 2026-09-28)

**Why now:** the user confirmed on 2026-09-28 that no other API or worker deployments exist. The
D-01/D-03 reason for keeping `cmd` (deploy the API and worker in either order) no longer applies.
Production already runs argv end-to-end: build 43c748d0 went through `runArgv`, and 0
`legacy cmd-only job` lines were logged in 24 h. Recorded in `23-SECURITY.md` under T-23-11 and
T-23-31.

**Worker (`services/worker/class.js`):**
- Remove the legacy branch: the `job.cmd` validation at ~L61-65, the `legacy cmd-only job`
  warning and `runShell` call at ~L128-129, and `runShell` itself at ~L216-260, including
  `exec.spawn(command, { shell: true })` at L255.
- Refuse a job without an argv array: `failJob` with a clear reason such as
  `missing_argv`, logging no payload.
- Keep the shared build handlers (`attachBuildHandlers`) and the running-guard release logic that
  `runArgv` still uses. Update the comments that mention `runShell`.
- `services/worker/test.js`: replace the `cmd`-based cases (L33, L137-145, …) with argv
  equivalents, and add "cmd-only job is refused".

**API (`lib/thinx/builder.js`):**
- Stop sending `cmd` in the remote job (~L275) and delete `legacyShellCommand` (~L222).
- `spec/jasmine/BuilderRemoteJobSpec.js`: drop the golden `cmd` specs and assert that the job has
  no `cmd` field.
- Verify with `git grep -n "legacyShellCommand\|shell: *true" lib services/worker/class.js`,
  which should return nothing.

**Deploy order changes.** A new API that sends argv only needs the argv-capable worker, and that
worker is already live (79611f6). Still push worker `main` first, then the parent `thinx-staging`.
Remove the matching accepted-residual row from `23-SAST-DELTA.md` and scripts'
`aikido-known-false-positives.json` if there is one. Re-run `aikido_scan_paths` on
`services/worker/class.js`: the shell-injection finding should be gone.

**Also consider in the same change window:** rotate `WORKER_SECRET` (logs from before 23-02
contain it).

## Part 3 — Worker/queue lifecycle leftovers from the phase-23 review (added 2026-09-28)

Phase 23 passes 4–5 made the API's worker busy flag real (reservation + expiry). The review
loop left these deferred. They all concern the same worker lifecycle, so fix them together
with Parts 1–2:

- **WR-03 — the worker never reconnects after a build.** Its post-build manual disconnect
  (confirmed with socket.io-client 4.8.3) means that with 1 replica, every build after the first
  is queued until the worker container restarts. Add a reconnect. At the same time, make a
  success JOB-RESULT release the worker on the API side (`Queue.releasesWorker`), because the
  release currently relies on that disconnect.
- **Reservation owner token.** `PREP_RESERVATION_MS` was raised to 35 min (commit `6d83f819`) as
  a stopgap. The proper fix is a per-reservation token: release only on a matching token, and
  renew it after the clone. Then a late failure from a reclaimed build can never free another
  build's reservation (pass-5 review WR-01).
- **IN-16:** re-queue on `worker_busy` or a pre-dispatch disconnect, instead of failing the user's
  build.
- **Nothing runs `loop()` when a worker reconnects.** Queued builds wait for the 5-minute cron tick.
- **IN-19:** the release rule is implemented twice (`Queue.releaseReservation` and
  `Builder.releaseWorker`). Unify them.
- **IN-20:** the 60-min dispatched bound assumes a builder time limit that the direct
  `docker run` paths do not have.
- **IN-21 (cosmetic, user commit `d6ca153`):** the "Entering SINK" line sits in an unreachable
  branch (`SINK=$BUILD_PATH/*` is never glob-expanded). Delete the commented-out `ls` lines.

Details are in `.planning/phases/23-build-pipeline-sink-hardening/23-REVIEW.md`, commit `e922e0c3`.
