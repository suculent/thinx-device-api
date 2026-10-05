# Phase 23: Build-Pipeline Sink Hardening - Context

**Gathered:** 2026-09-26
**Status:** Ready for planning

<domain>
## Phase Boundary

A hostile or careless firmware repository can no longer inject shell commands or read or write files outside its build directory, and private-repository builds keep working. Covers SEC-EXEC-01, SEC-EXEC-02, SEC-PATH-01, SEC-PATH-02. Deploy surface: backend image **plus the `services/worker` submodule** (the remote-builder half of SEC-EXEC-02 lives there, see D-01..D-04).

</domain>

<decisions>
## Implementation Decisions

### Remote worker job protocol (SEC-EXEC-02)
- **D-01:** The `job` emitted by `runRemoteShell` (`lib/thinx/builder.js:~213`) gains an **`argv` array**: the builder arguments only (`--owner=…`, `--udid=…`, `--git=…`, `--branch=…`, `--id=…`, `--workdir=…`, optional `--dry-run`, `--env=…`). The legacy **`cmd` string stays in the job for the transition**, so the API and worker deploy in either order and each side can be rolled back alone. `cmd` must no longer be built with `shell-escape` (SEC-EXEC-02 removes the dep). Build it by joining argv or equivalent, because only old workers consume it. — **Reversibility:** costly — the job shape is a wire contract between two separately deployed services.
- **D-02:** The `services/worker` change is **in scope for this phase**: it spawns argv jobs with `shell: false` and validates each argv element. It ships as its own submodule commit, followed by a parent pointer bump, the same pattern as the console submodule.
- **D-03:** A job with only `cmd` (no `argv`) still runs on the new worker through the existing metacharacter check and shell path, and **logs a warning**. That makes it visible when nothing sends `cmd` any more.
- **D-04:** **The worker owns the program path.** `argv` carries arguments only, and the worker prepends its constant `/opt/thinx/thinx-device-api/builder`. The API can never name the program to execute.
- The local-build path (`runShell`, `spawn(..., {shell:false})`) is already argv-based. Keep it.

### Private fetch contract (SEC-EXEC-01)
- **D-05:** The private path **shares the public path's argv routine.** `prefetchPublic` already does `execFileSync("git", ["clone", …])` + pull + `writeBasenameMetadata`. Refactor so both paths use one clone/pull/basename routine. `git.fetch(owner, …)` only supplies the per-key environment (constant `GIT_SSH_COMMAND` + `SSH_ASKPASS`/`SSH_ASKPASS_REQUIRE=force` askpass, `GIT_KEY_PASSPHRASE` passed explicitly in `env`) and loops keys. `gitCloneAndPullCommand` / `SHELL_FETCH` go away. `rm -rf ./*`, `chmod -R 666 *` and `printf > basename.json` become Node fs calls (use the public path's `chmodr 0o766`, not the old 666). No `ssh-agent sh -c`, no `exec.execSync` string anywhere in `git.js`. — **Reversibility:** costly — this redefines the `prefetchPrivate` → `git.fetch` contract, so git.js goes first on the branch (ROADMAP note).
- **D-06:** **Success = the clone exited 0 and Node wrote `basename.json`.** Keep the stdout/stderr blacklist (`responseWhiteBlacklist`) only for logging. Specs lock the two outcomes: a bad or missing key gives `git_fetch_failed`, and a good fetch lets the build proceed.
- **D-07:** Host key policy is **`StrictHostKeyChecking=accept-new`**, with `IdentitiesOnly=yes` and `-i <keypath>`. Keys already in the entrypoint-seeded `~/.ssh/known_hosts` (GitHub from `api.github.com/meta`, `GIT_KNOWN_HOSTS`) stay pinned, so a changed key still fails.
- **D-08:** Learned host keys go to a **separate `UserKnownHostsFile` on the data volume** so they survive redeploys. Pass both files, with the seeded file first. **Constraint (added in discussion, because that volume has been world-writable, `drw-rw-rw-`):** the API creates a dedicated directory at mode 0700 and the file at 0600. Before each use it checks that neither is group- or world-writable and that the owner is correct. If either check fails, it falls back to the container-local file and logs a warning. A planted host key must not be trusted.
- **D-09:** **Try the last-successful key first**, then the rest of the loop. The per-owner memory lives in **Redis** (a key per owner holding the key filename, not the key material), so it survives restarts and is shared across API replicas. A Redis miss or error falls back to the full loop in the current order. Each attempt gets its own askpass file, deleted in `finally`. — **Reversibility:** reversible — a cache; deleting the keys restores today's order.

### Refusal behaviour (SEC-PATH-01)
- **D-10:** A `thinx.yml` that is a symlink, or that resolves outside the build dir, **fails the build** before any read or credential write-back. The build log state goes to `error`, the notifier gets a specific reason (e.g. `unsafe_repository_file`), and `cleanupSecrets` runs. This matters because the write-back puts **decrypted Wi-Fi SSID/password** into that file.
- **D-11:** **One contained-path helper** (`realpath` + `path.relative`, reject `..`-leading, absolute, or prefix-sibling results like `…/abc` vs `…/abc-evil`, plus `lstat` no-symlink on the final component) guards **every** repo-controlled read and write: `thinx.yml` read and write-back, `environment.json`, `thinx_build.json`, the header-file lookup, and the `thinx.yml` found by `getPlatform`/`findFilesSync`. Any refusal aborts the build. Exception: the `cleanupSecrets` unlinks refuse to follow links (unlinking the link itself is fine) but do not abort.
- **D-12:** `device.owner` / `device.udid` must match the strict format, otherwise `callback(false, "invalid_device")` before any `mkdirp`. The format is owner `^[a-z0-9]{64}$` (the existing `Sanitka.owner`/`document_id` rule) and udid a UUID (the existing `Sanitka.udid`). Add a final containment check that `BUILD_PATH` resolves under `data_root + build_root`. Apply the same rule to the `BUILD_PATH` built in `runRemoteShell` (`builder.js:~211`, which uses the unsanitised `owner`/`udid` today). Never strip characters, because stripping can collapse two values onto one directory.

### Symlink checkout & production proof (SEC-PATH-02, success criteria 1 and 5)
- **D-13:** Every clone, pull and submodule operation runs with **`-c core.symlinks=false`**, on both the public and private paths. After checkout, detect entries with mode `120000` in the index (`git ls-files -s`) and **write a warning line to the build log** naming the paths, so an owner can see why a build that relied on links broke. The warning does not fail the build.
- **D-14:** The production proof is **one of the user's existing real private device repos**. The user names it at verification time, so the planner adds it as a human checkpoint. The proof passes when the build completes past `git_fetch_failed` into the builder and the log shows success.
- **D-15:** SAST before/after goes in **`23-SAST-DELTA.md`** in the phase dir. It compares the Phase 22 baseline (`22-CODEQL-BASELINE.md` / `22-CODEQL-ALERTS.json`) with the post-fix CodeQL run and the local Aikido scan. Each remaining hit gets a row with rule, `file:line` and the false-positive reason. **No dismissals in GitHub code scanning** and no inline suppression comments added by this phase. Remove the stale `// lgtm [...]` comments on sinks that no longer exist.

### Carried forward
- Specs first: lock current behaviour (a `file://` bare repo, injection strings in url/branch, a missing git binary, symlinked `thinx.yml`, prefix-sibling path, `../` owner/udid) before refactoring, per the ROADMAP note.
- `GIT_KEY_PASSPHRASE` comes from `readSecret()` with the env fallback (Phase 24 provisions the swarm secret later).
- Deploy with `docker service update` for one service. Never use `restart.sh` / `stack deploy`. Push to `thinx-staging` only.

### Claude's Discretion
- Exact reason strings, helper names and module placement (e.g. the contained-path helper in `lib/thinx/` alongside `finder.js`).
- Redis key naming and TTL for D-09.
- How the worker validates argv elements (at minimum the existing `--git=`/`--branch=` checks, applied per element instead of via `split(" ")`).
- Path of the persistent known_hosts directory on the data volume.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §"Phase 23: Build-Pipeline Sink Hardening": goal, 5 success criteria, ordering notes (git.js first, specs first)
- `.planning/REQUIREMENTS.md`: SEC-EXEC-01, SEC-EXEC-02, SEC-PATH-01, SEC-PATH-02

### SAST baseline (before evidence)
- `.planning/phases/22-ci-sast-baseline/22-CODEQL-BASELINE.md`: the alert list the delta doc compares against
- `.planning/phases/22-ci-sast-baseline/22-CODEQL-ALERTS.json`: raw baseline alerts
- `.planning/phases/22-ci-sast-baseline/22-CONTEXT.md`: D-05..D-07 (security-extended suite, baseline-only handling)

### Code under change
- `lib/thinx/git.js`: `tryShellOp`, `fetch`, `prefetch`, askpass helpers
- `lib/thinx/builder.js`: `runRemoteShell` (~196), `prefetchPublic` (~440), `gitCloneAndPullCommand` (~465), `prefetchPrivate` (~479), `build` BUILD_PATH (~633), thinx.yml handling (~724–800), remote command (~920–965), `cleanupSecrets`
- `services/worker/class.js`: `isArgumentSafe`, `runShell` (`spawn(command, {shell:true})` ~163)
- `lib/thinx/sanitka.js`: `udid`, `owner`/`document_id` validators
- `lib/thinx/finder.js`: existing symlink-safe traversal note
- `docker-entrypoint.sh` (~27–66): known_hosts seeding that D-07/D-08 build on

### Project guidance
- `AGENTS.md`: deploy flow, submodule pointer bumps, server access
- `.planning/codebase/CONCERNS.md`, `.planning/codebase/TESTING.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `prefetchPublic` + `runGitCommand` + `writeBasenameMetadata` + `getDirectories` (builder.js): already an argv clone/pull/basename flow, the base for D-05.
- `runShell` (builder.js ~346): local build already uses `spawn(..., {shell:false})` with argv.
- `Sanitka.udid` / `Sanitka.owner`: the strict formats for D-12.
- `create_askfile`/`delete_askfile`/`askpath` (git.js): the askpass helper already reads `$GIT_KEY_PASSPHRASE` from env and lives in `os.tmpdir()`.
- Redis clients already used across `lib/thinx/` (e.g. `apikey.js`, `devices.js`, and builder.js itself) for D-09.

### Established Patterns
- Specs live in `spec/jasmine/` (`GitSpec.js`, `XBuilderSpec.js`, `SanitkaSpec.js`, `FinderSpec.js`, `ZZ-RouterBuilderSpec.js`). ZZ specs are CommonJS; chai-http stays at ^4 (AGENTS.md).
- Long "why" comments explain past failures at the sink (see git.js `fetch`, `prefetchPrivate`). Keep that style when the code they describe changes.

### Integration Points
- `builder.build` → `prefetchPublic` / `prefetchPrivate` → `git.fetch` (the contract being redefined).
- `builder.runRemoteShell` → socket.io `job` → `services/worker` `runShell` (the wire contract in D-01).
- `shell-escape` is imported by both `git.js:7` and `builder.js:21`. Both imports go, then `package.json:68` and the lockfile.

</code_context>

<specifics>
## Specific Ideas

- The `thinx.yml` write-back carries decrypted Wi-Fi credentials, which is why D-10/D-11 fail closed instead of skipping.
- The old private shell also ran `chmod -R 666 *`, which strips execute bits from directories. Don't carry that over.

</specifics>

<deferred>
## Deferred Ideas

- Drop the legacy `cmd` field from worker jobs, and the worker's shell path, once logs show no `cmd`-only jobs (D-03 warning).
- Worker/builder-side refusal of repos whose builds depend on symlinks (beyond the D-13 warning).

</deferred>

---

*Phase: 23-build-pipeline-sink-hardening*
*Context gathered: 2026-09-26*
