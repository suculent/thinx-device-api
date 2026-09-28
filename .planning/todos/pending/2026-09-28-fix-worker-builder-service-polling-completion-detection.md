---
created: 2026-09-28T18:44:25.279Z
title: Fix worker builder service polling completion detection
area: worker
severity: major
files:
  - services/worker/builder:110-160
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
