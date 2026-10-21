---
phase: 23-build-pipeline-sink-hardening
fixed_at: 2026-09-28T20:30:00Z
review_path: .planning/phases/23-build-pipeline-sink-hardening/23-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-09-28T20:30:00Z
**Source review:** .planning/phases/23-build-pipeline-sink-hardening/23-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03; the IN-* findings are out of scope for `critical_warning`)
- Fixed: 4
- Skipped: 0

All commits are GPG-signed (`%G? = G`). Nothing was pushed or deployed.

## Fixed Issues

### CR-01: `cloneRepository` returns `ok: true` while an async `chmodr` is still walking the checkout

**Files modified:** `lib/thinx/git.js`, `lib/thinx/builder.js`, `lib/thinx/devices.js` (comment only), `spec/jasmine/GitSpec.js`
**Commit:** 7f7661d5
**Applied fix:**
- The permission change now runs synchronously inside the `try` and is part of the success contract. It runs after the pull and before `basename.json` is written, because `prefetchPrivate` treats that file as proof of a successful clone. A failure returns `reason: "chmod_failed"`.
- **Deviation from the suggested `chmodr.sync`:** I replaced chmodr with a small lstat-based walk, `chmodCheckoutSync`. It gives the same modes (0o777 for directories, 0o766 for everything else) and skips symlinks, so it never follows a link. `chmodr.sync` did not work:
  - On macOS its file step uses `fs.lchmodSync`, which opens the file for writing. That fails with EACCES on git's read-only 0444 objects, so every clone would fail. The old async walk hit the same error and only logged it.
  - On Linux the same step is plain link-following `fs.chmod`, the issue raised in the review's point 3.
- `createBuildPath` in `builder.js` now uses `chmodr.sync` on the new, empty BUILD_PATH (still best effort), so it no longer overlaps the clone.
- New spec GitSpec `(a2)` checks the directory and file modes as soon as `cloneRepository` returns.

### WR-01: Worker still logs the `--env` payload through the job handler

**Files modified:**
- `services/worker/class.js` and `services/worker/test.js`: submodule commit `2f08258`
- `lib/thinx/builder.js` and `spec/jasmine/BuilderRemoteJobSpec.js`: parent commit `67ec3cff`
- `services/worker` gitlink: parent commit `36341bfc`

**Commit:** 2f08258 (worker), 67ec3cff (API), 36341bfc (gitlink bump)
**Applied fix:**
- **Worker:** added `redactArgv` and `redactCommand` at module level.
  - The socket `job` handler now masks `argv`, `cmd` and `secret` before it logs.
  - `runArgv` uses the shared helper.
  - The legacy `runShell` log line (`worker runShell command:`) now masks `cmd` from the first `--env=` onward. It used to print the full command, including the env JSON.
  - The legacy `cmd` shell path is unchanged apart from that log line. It is still there, as instructed.
- **API:** added `Builder.redactBuildArgs`.
  - "Building with arguments" (review L1070) and "Executing LOCAL build" both log the redacted argv.
  - "Build with Custom ENV Vars" (review L1067) now logs only an item count.
- **Specs:**
  - Two new worker tests: the socket handler receives an argv+cmd job carrying `--env={"WIFI_PASS":"hunter2"}`, and a legacy cmd job goes through `runShell`. Both assert that `hunter2` appears in no log line. I confirmed that both fail against the old `class.js`.
  - Two new API specs cover `redactBuildArgs` and `runRemoteShell` logging.

### WR-02: New `runRemoteShell` refusal paths bypass the refusal contract after decrypted secrets are on disk

**Files modified:** `lib/thinx/builder.js`, `spec/jasmine/BuilderRemoteJobSpec.js`
**Commit:** 885759c4
**Status:** fixed: requires human verification (logic change in the build flow)
**Applied fix:**
- `runRemoteShell` now returns `true` when it emits the job and `false` on every refusal: no worker or socket, invalid identity, invalid build arguments, or io null.
  - The io-null path now also notifies with `error_starting_build`.
  - A `null` worker no longer throws.
  - The unreachable second `worker.socket` check is gone.
- When `runRemoteShell` returns `false`, `run_build` records BUILD_FAILED, sets the build-log state to `error` and runs `cleanupSecrets(XBUILD_PATH)`. This follows the review's "return false and let run_build clean up" option, which keeps `runRemoteShell` free of CouchDB calls and its specs hermetic.
- The post-callback `udid === null` path also runs `cleanupSecrets` now.
- **D-12 upfront check:** right after the device-derived BUILD_PATH, and before `getLastAPIKey`/`mkdirp`/any secret write, `run_build` refuses with `invalid_device` when `buildPathFor(br.owner, br.udid, build_id) !== BUILD_PATH`.
- **What to verify:**
  - The new check also refuses a build whose request owner differs from `device.owner`. I believe that is intended, but it is new behaviour for `run_build`.
  - `XBuilderSpec` (needs Redis) runs `run_build` possibly without a live worker. The build log for that build now ends in `error` after the `build_started` callback.

### WR-03: The rewritten fetch blocks the whole API event loop for up to 10 minutes per git call

**Files modified:** `lib/thinx/git.js`, `lib/thinx/builder.js`, `lib/thinx/sources.js`, `spec/jasmine/GitSpec.js`
**Commit:** f0387ebb
**Status:** fixed: requires human verification (async conversion of the fetch contract)
**Applied fix:**
- Full async conversion, contained to `git.js` and its callers.
- **New `runGit()` in `git.js`:**
  - Spawns `git` with an argv array, `shell: false`, `detached: true` (so git leads its own process group) and piped, size-capped output (16 MiB).
  - On timeout or overflow it SIGKILLs the whole group with `process.kill(-pid)`, which also reaches ssh and git-remote-http. The timer stays armed until the pipes close.
  - When git fails, the error carries `status`, `signal`, `stderr` and `code`.
- **Callers now await the clone:**
  - `cloneRepository` is `async`, and `fetch` awaits it.
  - `prefetchPublic` is `async`, and `run_build` awaits it.
  - `Sources.add` chains the public attempt and then `fetch` on the promise.
  - `devices.js` already consumed `fetch`'s promise, so it is unchanged.
- **Unchanged:**
  - The T-23-01..07 guarantees: argv-only execution, no shell, `--` before the url, leading-`-`/NUL/CR/LF refusal, `core.symlinks=false` ×3, `protocol.ext.allow=never`, the constant `GIT_SSH_COMMAND`, `GIT_ASKPASS=false`, per-attempt askpass directories removed in `finally`, and the timeout.
  - `gitTimeoutMs` stays at 600000. It no longer freezes the API, only the build or source-add that uses it. I did not add the review's "interim" `http.lowSpeedLimit` options.
  - `symlinkEntries` (a local `ls-files` read) stays on `execFileSync`.
- **Specs:**
  - Every GitSpec clone is awaited. Spec `(e)` now spies on `spawn` instead of `execFileSync`.
  - The new `(e2)` points a clone at a local TCP server that never answers. It checks that timers keep firing, that the clone fails as `clone_failed` at the 1.5 s timeout, and that git reached the remote. After the run, `pgrep` found no git-remote-http process left over.
- **What to verify:**
  - Concurrent operations on the same checkout directory can now interleave, where the synchronous code serialised them. BUILD_PATH and the Sources.add TEMP_PATH are unique per build and per source. Two overlapping `devices.prefetch_repository` calls for the same device could interleave.
  - The private-repository production path (ssh + askpass in a detached session) should be re-proven on staging, the same way as D-14.

## Verification

All gates ran in the **main checkout** (`/Users/sychram/Repositories/thinx-api/thinx-device-api`, branch `thinx-staging`), not in an isolated worktree. `workflow.use_worktrees` is not set in `.planning/config.json`, but the caller directed the work into the main tree, and the WR-01 fix needed commits inside the `services/worker` submodule. The results can be reproduced from the current tree.

- **API specs (hermetic, no helpers):**
  - Command: `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine --config=<{"spec_dir":"spec/jasmine","helpers":[]}> BuilderPathSpec BuilderRemoteJobSpec GitSpec SafePathSpec SanitkaSpec FinderSpec`
  - Result: **189 specs, 0 failures**, up from 181 before these fixes.
  - `XBuilderSpec`, `PlatformSpec`, `SourcesSpec` and `DevicesSpec` need Redis or CouchDB and were not run.
- **Worker:** `npm --prefix services/worker test` gave **42/42**, up from 40/40.
- **ESLint:** clean on every touched parent file.

---

_Fixed: 2026-09-28T20:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
