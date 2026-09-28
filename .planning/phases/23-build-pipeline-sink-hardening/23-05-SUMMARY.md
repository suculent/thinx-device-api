---
phase: 23-build-pipeline-sink-hardening
plan: 05
subsystem: infra
tags: [deploy, swarm, codeql, aikido, production-proof, sast]

requires:
  - phase: 23-01..23-04
    provides: argv git fetch, safepath containment, worker argv jobs, remote job argv
  - phase: 22-ci-sast-baseline
    provides: CodeQL security-extended baseline 1839321938 (22-CODEQL-ALERTS.json)
provides:
  - Phase 23 code running in production (thinx_api, thinx_worker), CI green for c9385574
  - 23-SAST-DELTA.md (CodeQL 147 -> 148 open, Aikido shell-injection 4 -> 2, FP table, hygiene)
  - D-14 production proof: private-repo build over SSH keys succeeded end to end
affects: [worker builder polling loop, sources add prefetch, build dir permissions hardening]

actuals:
  tokens: 11000       # chars/4 over 23-SAST-DELTA.md (20647 chars) + this SUMMARY
  tasks: 3
  commits: 2          # MEASURED: 9e35a7e7 (SAST delta) + this metadata commit, landed after GPG unlock
plan_head_before: c9385574fc37720f2497e96fd2657804d5fa40e9
plan_head_after: 9e35a7e7

tech-stack:
  added: []
  patterns:
    - "SAST delta doc: rule ids, severities, paths, lines and counts only (public repo)"

key-files:
  created:
    - .planning/phases/23-build-pipeline-sink-hardening/23-SAST-DELTA.md
  modified: []

key-decisions:
  - "Manual docker service update skipped for both services: Swarmpit auto-rolled the identical images; a forced update would only restart them"
  - "CodeQL #291 js/http-to-file-access git.js:236 classified false positive (fixed basename.json under validated build path), not dismissed"
  - "Worker class.js:255 legacy shell path recorded as an accepted residual with a removal trigger, not a false positive"
  - "Dismissed-alert gate reads 1 (#118 from 2021, in the Phase 22 baseline); recorded as a deviation, nothing dismissed"

requirements-completed: [SEC-EXEC-01, SEC-EXEC-02, SEC-PATH-01, SEC-PATH-02]

coverage:
  - id: D1
    description: "Worker then parent pushed in order; CI test and api-registry green for c9385574; both services run the new code"
    requirement: SEC-EXEC-01
    verification:
      - kind: other
        ref: "Task 1 verify blocks: WORKER-PUSHED, HUB-FRESH, api-registry=success test=success, sshcmd=1 nofollow=6 OpenSSH_10.3p1, BUILDER_PROGRAM=2"
        status: pass
    human_judgment: false
  - id: D2
    description: "23-SAST-DELTA.md with CodeQL/Aikido before-after, remaining-hit FP table and suppression hygiene"
    requirement: SEC-PATH-01
    verification:
      - kind: other
        ref: "Task 2 verify: DELTA-DOC-OK; HYGIENE-OK (lgtm=0 added_suppressions=0); dismissed=1 (#118, pre-existing)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-14 production proof: private repo build via SSH keys, argv fetch and remote argv job"
    requirement: SEC-EXEC-02
    verification:
      - kind: manual_procedural
        ref: "Task 3 checkpoint approved by user; build 43c748d0-bb69-11f1-8a47-e78d11b3c5cf"
        status: pass
    human_judgment: true
    rationale: "Production build of a private repository needs the owner's keys and a human to judge the device build outcome"

duration: "~21h40m wall clock incl. checkpoint wait (active ~2h)"
completed: 2026-09-28
status: complete
---

# Phase 23 Plan 05: Rollout, SAST delta and production proof Summary

**The phase-23 argv git fetch, safepath containment and worker argv jobs are live in production with CI green. CodeQL goes from 147 to 148 open alerts (one new false positive, #291). Aikido shell-injection hits on the phase files drop from 4 to 2, and both git.js shell-exec sinks are gone. A private-repo build over SSH keys reached `THiNX BUILD SUCCESSFUL`.**

## Performance

- **Started:** ~2026-09-27T21:05Z
- **Completed:** 2026-09-28T18:45Z (includes waiting on the Task 3 human checkpoint)
- **Tasks:** 3/3
- **Files created:** 1 (`23-SAST-DELTA.md`) plus this SUMMARY

## Accomplishments

- **Task 1 (ordered push, rollout, smoke):**
  - `secret_hits=0`. The 8 regex matches were all spec fixtures or the `<redacted>` placeholder.
  - Worker `origin main` f1c02c9..79611f6. The `thinx-staging` fast-forward succeeded (5f1bed6..79611f6). Worker CI 444 test and 445 build+publish passed. Docker Hub `latest` was pushed at 21:11:38Z, after the commit time, so it is HUB-FRESH.
  - Parent `origin thinx-staging` 9bf5cf97..c9385574 (29 commits). `main` untouched (a0309eb5), no force push. CircleCI 15436 `test` and 15437 `api-registry` both passed ("568 specs, 0 failures, 1 pending").
  - Swarmpit auto-rolled both services, so swarm-autopull-recovery was not needed. thinx_worker task ua8sa9tcrmq6 has the Hub digest and `BUILDER_PROGRAM`=2. thinx_api task 3ykhyb30ekog has 0 restarts.
  - In the thinx_api container: `sshcmd=1`, `nofollow=6`, `OpenSSH_10.3p1`, 3 seeded github.com known_hosts entries.
  - `knownHostsFiles()` returned `{"persistent":true,"reason":null}`. `/mnt/data/ssh_known_hosts` is 700 and `known_hosts` is 600, both uid 0 (the container uid).
  - No restart.sh, no stack deploy, no `docker service update` run.
- **Task 2 (SAST delta):** `23-SAST-DELTA.md` written.
  - CodeQL post-fix analysis 1848129237 at c9385574 (CodeQL 2.27.1, security-extended): 148 open vs 147 in the baseline (1839321938). By severity: high 37 -> 37, medium 110 -> 111. The only rule change is `js/http-to-file-access` 1 -> 2.
  - On the phase files, #148/#212/#262 became #288/#289/#290. These are the same statements with new fingerprints.
  - One genuinely new alert, #291 `js/http-to-file-access` at `lib/thinx/git.js:236`, is a false positive: a fixed-name `basename.json` write that replaced the shell `printf`.
  - Aikido (after `scripts/aikido-filter.js`) went from 13/1 known-noise/12 remaining to 27/1/26. Shell-injection hits (sev 89) dropped from 4 to 2. The git.js:71 and git.js:153 exec sinks are gone. Builder lstat 682 and thinx.yml read 731 are gone. The descriptor (935/951) and languages (1343) hits remain, with FP reasons in the doc.
  - The new path-traversal hits are mostly inside `safepath.js`, which is the containment check itself. Every remaining hit has a reason in `## Remaining hits`.
  - IaC scanning errored in both Aikido runs (Checkov binary missing, ENOENT). SAST and secrets scans ran.
  - `DELTA-DOC-OK`, `HYGIENE-OK` (`lgtm=0 added_suppressions=0`).
- **Task 3 (D-14 production proof), APPROVED by the user:**
  - Private repo `git@github.com:suculent/eav-firmware.git`, build id `43c748d0-bb69-11f1-8a47-e78d11b3c5cf`.
  - Build prep used argv fetch via SSH keys, generated the header, and sent a remote argv job. The worker log shows `runArgv` for this build, with 0 `legacy cmd-only` lines in 24 h.
  - The platformio log ended "3 succeeded … THiNX BUILD SUCCESSFUL.", with no `git_fetch_failed`, `unsafe_repository_file` or `invalid_device` in the build path.

## Task Commits


1. **Task 1:** no repository files (pushes and production checks only), so no commit.
2. **Task 2:** `9e35a7e7` docs(23-05): record CodeQL and Aikido SAST delta for the build-pipeline sinks. The first attempt hit an expired GPG cache; it was committed signed after the user unlocked the key, with no unsigned fallback.
3. **Task 3:** human checkpoint, so no commit.

## Files Created/Modified

- `.planning/phases/23-build-pipeline-sink-hardening/23-SAST-DELTA.md`: CodeQL/Aikido before/after, per-sink status, false-positive table, suppression hygiene, commands.
- `.planning/phases/23-build-pipeline-sink-hardening/23-05-SUMMARY.md`: this file.

## Decisions Made

- I did not run the manual `docker service update --image thinxcloud/worker:latest thinx_worker`. Swarmpit had already rolled out the Hub digest, and a forced update would only have restarted the same image.
- #291 is documented as a false positive and not dismissed (D-15: no dismissals, no suppressions).
- The worker legacy `runShell` (`class.js:255`, `shell: true`) is an accepted residual and not a false positive. Removal trigger: delete `runShell` and the `cmd` field once every API instance emits `argv` and the worker logs no `legacy cmd-only job` line for a full release cycle.

## Deviations from Plan

1. **[Gate by construction] The dismissed-alert gate reads 1, not 0.** The only dismissed CodeQL alert on the ref is #118 (`js/path-injection`, `lib/thinx/notifier.js:168`), dismissed 2021-01-01 and already counted in the Phase 22 baseline (results_count 148 = 147 + 1). Nothing was dismissed on or after 2026-09-25. The plan's `jq length == 0` could never pass on this ref.
2. **[Evidence source] The Aikido scans were run by the orchestrator** through `aikido_scan_paths`, because the executor subagent has no Aikido MCP tool. The results were reduced to the fields `scripts/aikido-filter.js` reads, and the filter was run here. No `git worktree` was created for the before scan: the orchestrator staged the base files from `297ee357` and `f1c02c9` in the scratchpad. `git worktree list` shows only the main tree.
3. **[Rollout] No manual service update** (see Decisions). The plan's step 5 update was skipped because the auto-rollout had already produced the target state.

**Total deviations:** 3 (none changed code). **Impact:** none on the security outcome.

## Issues Encountered / Follow-ups

The three observations the user reported from the D-14 run were investigated read-only. No code was changed.

### O1: worker does not notice a finished build (PRE-EXISTING, not phase 23)

- The API/worker log repeats `Current service status: … replicated 0/1` after the build succeeded.
- `services/worker/builder:119`, `:124` and `:132` test `[[ ! -z "$(echo ${DSTATUS} | grep -q \"…\")" ]]`. `grep -q` prints nothing, so all three conditions (still running, non-zero exit, completed) are always false. On top of that, the escaped quotes make the pattern the literal `"0/0"`, quotes included. Word-splitting of `\"task: non-zero exit\"` turns `non-zero` and `exit"` into file arguments, and production logged exactly `grep: non-zero: No such file or directory` / `grep: exit": No such file or directory` at 18:38:57Z.
- A finished `--restart-condition=none` service shows `0/1`, not `0/0`, and the service is not removed, so `DSTATUS` never becomes empty.
- The loop therefore ends only at `MAX_ITERATIONS` (60 × 30 s, `builder:105`/`:162`) with "Build Timed Out", about 30 min after start. The success check against `LOG_PATH` runs only after that.
- Production (read-only, 2026-09-28): `thinx_build-LOemXBXRcD4iGKZp` showed 1/1 from 18:21:22Z and 0/1 by 18:35:56Z at the latest, and was still being polled at 18:38:57Z. Three older `thinx_build-*` services also sit at `0/1`. They were not investigated or touched.
- `builder` was last changed in `f5d7c05` (2026-09-18), and `git -C services/worker diff f1c02c9 HEAD -- builder` is empty, so phase 23 did not touch it.
- Also check: the background `docker service logs` at `builder:109` does not follow, and the "Build completed" re-append at `:136` never runs, so `LOG_PATH` may miss the success line and a successful build could be reported as FAILED. This is an inference and has not been verified.
- **Follow-up candidate:** use `grep -q` as the condition (`if echo "$DSTATUS" | grep -q "0/1"; then …`), treat a finished `--restart-condition=none` task as done (`docker service ps --format '{{.CurrentState}}'` Complete/Failed), and use `docker service logs --follow` or a final log fetch.

### O2: `git_fetch_exception clone_failed code=undefined status=128` at "Adding source" (BY DESIGN, not a regression)

- Production timeline for the third add: `Adding source` 18:19:22.33, `Prefetch with sanitized url` 18:19:22.37, `git_fetch_exception clone_failed code=undefined status=128` 18:19:23.71, then a successful keyed fetch (the `chmodr` line at 18:19:41.98 comes from the success path, see O3). No `Adding source failed` line was logged. The earlier adds at 18:11 and 18:13 followed the same pattern.
- `lib/thinx/sources.js:285-297` (D-05) makes a public attempt first, `git.cloneRepository(TEMP_PATH, url, branch, git.baseEnv())` with no key. Only when that fails does it call `git.fetch(owner, …)` with the owner's keys, and `is_private` is set to true exactly when a key was needed (`sources.js:294` -> `inferAndAddSource(…, true, …)`).
- For a private `git@github.com:` URL, the keyless ssh is refused and git exits 128. `execFileSync` then throws with `status=128` and `code` undefined, because `code` is set only for spawn errors such as ENOENT or ETIMEDOUT. `lib/thinx/git.js:245-250` logs this as `clone_failed`. So this is a normal non-zero git exit, not a spawn or argv problem.
- The pre-phase code also tried twice and set `is_private` only on the retry (`297ee357:lib/thinx/sources.js`, the `git_success === false` branch).
- The `repo privacy status updated to is_private=true` lines come from `lib/thinx/devices.js:87-89` (the `[prefetch]` variant, 18:20:21, device attach) and `lib/thinx/builder.js:542-544` (18:20:41, build prep). Both update after every successful keyed fetch, whether or not the source was already private.
- Optional follow-up: log the expected public-first failure at info level (for example `public attempt failed, trying owner keys`) so it does not read as an error.

### O3: `[git] chmodr failed after fetch: ENOENT … /20e8bd80-…/eav-firmware/test/01-onboarding.suite` (REGRESSION FROM 23-01, log noise only, no correctness impact)

- **Cause:** a race between the asynchronous `chmodr` and the removal of the source-add temp dir. It is not a symlink and not a failed clone.
- Code order:
  - `lib/thinx/git.js:241` starts `chmodr(repoPath, 0o766, cb)` asynchronously. It runs only on the success path, after clone, pull and `basename.json` all succeeded. A failed clone throws into the `catch` at `git.js:245` before reaching it, so the failed public attempt never runs `chmodr`.
  - `cloneRepository` then returns `ok: true` at once.
  - `sources.js:292-294` -> `inferAndAddSource` -> `Platform.getPlatform` -> `addSourceToOwner` -> CouchDB upsert -> `fs.removeSync(temporary_source_path)` at `sources.js:102` deletes the tree that `chmodr` is still walking.
  - The 23-01 change `git.fetch` is itself async (`await this.orderKeys`), and so is the `.then` continuation, but `chmodr` is not awaited.
- Evidence:
  - The error names the Sources.add temp dir. `getTempPath` (`sources.js:228-232`) is `<repos>/<owner>/<source_id>`, and `20e8bd80-bb69-11f1-…` is the uuidV1 `source_id` from `sources.js:260`.
  - The orchestrator confirmed that the dir no longer exists (only the udid dir remains under the owner) and that the repo tracks no symlinks. `test/01-onboarding.suite` is a plain directory.
  - The failing entry changes between runs: `…/eav-firmware/doc` at 18:11:34 and 18:14:07, `…/test/01-onboarding.suite` at 18:19:41. That points to a race, not a specific file.
  - Each chmodr error follows the keyed clone by roughly the clone and pull duration, and each add succeeded (no `Adding source failed`).
- Why this is a regression: before phase 23, sources add ran `cd * && chmod -R 666 *` inside the synchronous `execSync` shell script (`297ee357:lib/thinx/sources.js` `prefetchCommand`), so the chmod finished before `removeSync`. The asynchronous `chmodr` existed before only on the builder's public path (`297ee357:lib/thinx/builder.js:452`). 23-01 (`75f32b6a`, `4ff2b194`) routed sources add and device attach through `cloneRepository` as well.
- Impact: none on correctness. The error is only logged, the tree is being deleted on purpose, and the source was stored. The `chmodr` walk simply stops at the first error. On the build path, `BUILD_PATH` is not removed during the walk. There `chmodr` runs alongside the builder's own contained writes and can at most set 0o766 on files the builder wrote, which matches the pre-phase behaviour on the public path.
- **Proposed fix (not applied):** make the permission change synchronous inside `cloneRepository`, `chmodr.sync(repoPath, 0o766)` (chmodr 1.2.0 exports `.sync` and walks with `lstat`, so it does not follow symlinks), inside the existing `try`. `ok: true` would then mean the permissions are final, and no caller can race it. The alternative, having `sources.add` skip `chmodr`, is weaker because the temp checkout is deleted anyway. Add a spec that calls `cloneRepository` on a fixture repo and asserts the mode immediately after return.

### Additional observations from the orchestrator's read-only production check (recorded per user input)

- **(a) Broad permissions (PRE-EXISTING; hardening follow-up).** Build dirs and checkouts are `drwxrwxrwx`, files `-rwxrw-rw-`, and `/mnt/gluster/thinx/repos` is `drw-rw-rw-`.
  - Source of the modes: `chmodr(…, 0o766)` in `lib/thinx/git.js:241` and `lib/thinx/builder.js:675` (`createBuildPath`). chmodr's `dirMode` adds an execute bit for each read bit, so directories become 0777.
  - The builder public path already used `chmodr(repoPath, 0o766)` before phase 23 (`297ee357:builder.js:452`, `:589`). The private path used `chmod -R 666 *`, which left files world-writable and directories non-traversable. 23-01 unified both paths on 0o766 and widened nothing.
  - The user confirms these modes were forced open to make builds work across container uids.
  - **Follow-up candidate (future phase):** least-privilege modes for `BUILD_PATH` and the repos root, matching the builder and worker container uids/gids instead of chmod 777/766.
- **(b) Empty `43c748d0-…/43c748d0-…/` directory inside the build dir (PRE-EXISTING, low priority).** It is residue of the worker's build-log path. `services/worker/class.js:321-328` writes `path + "/" + build_id + "/build.log"`, where `path` is the API's `BUILD_PATH` (`builder.js:273`), and runs `chmodr(…, 0o665)` on that directory. That call yields the observed `drwxrwxr-x`. The same code existed at worker `f1c02c9` (`class.js:220/227`). No further investigation.
- **(c) `basename.json` is 45 bytes, mode 644: expected.** `{"basename":"eav-firmware","branch":"master"}` is 45 bytes. The file is written by Node at `git.js:234-237` with the default umask. `chmodr` covers only the checkout and the earlier `BUILD_PATH` walk, not this later file. Before phase 23 the shell `printf > ../basename.json` also produced 644.
- **Also noted (PRE-EXISTING, not investigated further):** device attach (`lib/thinx/devices.js:373,397`) prefetches into the device's *deploy* path, and `cloneRepository` starts with `fs.emptyDirSync` on it. Before phase 23 this was `rm -rf ./*` in the same directory (`297ee357:devices.js:51`), so attaching a repository has always wiped that device's deploy directory. `emptyDirSync` now also removes dotfiles at the top level.

## Next Phase Readiness

- Phase 23 success criteria are met in production: argv git over SSH keys, safepath containment, worker argv jobs, SAST delta recorded with no dismissals or suppressions.
- Follow-up candidates for a later phase:
  - O1: the worker builder polling loop (pre-existing, affects build completion latency and possibly the reported status).
  - O3: synchronous chmod in `cloneRepository` (phase-23 regression, log noise).
  - Least-privilege build-dir permissions (pre-existing).
  - Removal of the worker legacy `runShell` once the trigger is met.

## Self-Check: PASSED

- FOUND: `.planning/phases/23-build-pipeline-sink-hardening/23-SAST-DELTA.md` (committed 9e35a7e7)
- FOUND: `.planning/phases/23-build-pipeline-sink-hardening/23-05-SUMMARY.md`
- FOUND: commit 9e35a7e7 (G, signed)

---
*Phase: 23-build-pipeline-sink-hardening*
*Completed: 2026-09-28*
