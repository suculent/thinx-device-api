---
phase: 23-build-pipeline-sink-hardening
reviewed: 2026-09-28T18:59:03Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - lib/thinx/builder.js
  - lib/thinx/devices.js
  - lib/thinx/git.js
  - lib/thinx/platform.js
  - lib/thinx/plugins/pine64/plugin.js
  - lib/thinx/safepath.js
  - lib/thinx/sanitka.js
  - lib/thinx/sources.js
  - package.json
  - services/worker/class.js
  - services/worker/test.js
  - spec/jasmine/BuilderPathSpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/jasmine/GitSpec.js
  - spec/jasmine/SafePathSpec.js
  - spec/jasmine/SanitkaSpec.js
  - spec/jasmine/XBuilderSpec.js
findings:
  critical: 1
  warning: 3
  info: 6
  total: 10
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-09-28T18:59:03Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

I reviewed the phase-23 parent diff (`2d9d85ab^..HEAD`, excluding `.planning/`) and the worker submodule diff (`f1c02c9..79611f6`). I read the listed files in full and checked the helpers they call: `chmodr` 1.2.0, `finder.js`, `buildlog.js`, `rsakey.js`, `json2h.js`, the redis legacy-mode client, and the old `git.js`/`sources.js`/`devices.js`.

The core hardening holds up:
- argv-only git, with `--` before the url and a leading-`-` refusal
- a constant `GIT_SSH_COMMAND` that is publickey only
- `GIT_ASKPASS=false`
- per-attempt askpass directories
- known_hosts owner and mode checks
- `safepath` containment with O_NOFOLLOW, including the prefix-sibling and parent-realpath cases
- strict BUILD_PATH identity
- the worker program constant plus the argv allowlist

I traced the injection, traversal and symlink vectors in D-01..D-13 and did not find a bypass.

The remaining problems:
1. The known async `chmodr` regression. It is worse than "log noise": `ok: true` no longer means the checkout's permissions are final. The permission walk overlaps the build, and on Linux chmodr's file step follows symlinks.
2. The T-23-13 log redaction is incomplete. The worker's job handler still logs the `--env` payload through `argv` and `cmd`.
3. The two `runRemoteShell` refusal paths added in this phase skip the refusal contract (build-log state and `cleanupSecrets`). They run after the decrypted Wi-Fi credentials are already on disk.
4. The rewritten fetch still blocks the event loop. It now has a 10-minute timeout per git call, and an attacker-chosen remote can use all of it.

Pre-existing items that were already triaged are not repeated here: the worker `builder` polling loop, the 0o766/0o777 build-dir modes, the empty `<build_id>/<build_id>` dir, and the legacy `cmd` shell path.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `cloneRepository` returns `ok: true` while an async `chmodr` is still walking the checkout (confirmed production regression)

**File:** `lib/thinx/git.js:239-244`. Consumers: `lib/thinx/sources.js:289-290`, `lib/thinx/sources.js:292-294` -> `:311` -> `:102`, `lib/thinx/builder.js:764-767`, `lib/thinx/devices.js:80`

**Issue:**
`cloneRepository` starts `chmodr(repoPath, 0o766, cb)` and returns `{ ok: true }` in the same tick. Before phase 23, the private path ran `chmod -R` synchronously inside the shell script, so the modes were final before any caller continued. Now every caller races the walk.

1. **Confirmed in production (sources add).** The chain is `Sources.add` -> `git.fetch` (or the public `cloneRepository` at L289) -> `inferAndAddSource` -> `Platform.getPlatform` -> `addSourceToOwner` -> `fs.removeSync(temporary_source_path)` at `sources.js:102`. That removal deletes the tree while chmodr is still in it. Production logs `[git] chmodr failed after fetch: ENOENT .../<source_id>/eav-firmware/test/01-onboarding.suite`, and the failing entry changes between runs: `.../doc` at 18:11 and 18:14, `.../test/01-onboarding.suite` at 18:19. Those are the signs of a race (23-05-SUMMARY O3).
2. **Build path: `ok: true` does not mean the permissions are final.** chmodr 1.2.0 sets each directory's mode only after all its children finish (`chmodr.js`: `if (-- len === 0) return fs.chmod(p, dirMode(mode), cb)`), so the checkout root is chmod'ed last. `run_build` continues straight into `getPlatform`, the header write, and then `runShell`/`runRemoteShell`. A large repository can still be mid-walk when the builder starts. Anything that depends on the opened modes (the cross-uid access the 0o766 exists for) is racy.
3. **The walk overlaps build execution and follows links on Linux.** For non-directories chmodr calls `fs[LCHMOD]`, where `LCHMOD = fs.lchmod ? 'lchmod' : 'chmod'`. `fs.lchmod` exists only on macOS, so on the Linux API container it is plain `fs.chmod`, which **follows symlinks**. `core.symlinks=false` keeps symlinks out of the checkout. But repository-controlled build code (for example PlatformIO `extra_scripts`) runs while the root API process may still be walking the same tree. A symlink it creates in a directory that chmodr has not listed yet gets its **target** chmod'ed to 0o766 by root in the API container's namespace, for example a key under `app_config.ssh_keys`. A repository with many files widens this window.

   The 23-05 summary says chmodr "walks with lstat, so it does not follow symlinks". That is true for the directory walk but not for the chmod step.
4. Walk errors stop the whole walk (`errState`), so the rest of the tree keeps git's default modes with no retry.

`GitSpec` never asserts the checkout's modes after `cloneRepository` returns, which is why this passed the plan gates.

**Fix:** Make the permission change part of the success contract, synchronous, inside the existing `try`, before the success return. At that point no repository code has run yet and the checkout holds no symlinks, so following links is not a concern:
```js
// lib/thinx/git.js, replacing L239-243
stage = "chmod_failed";
chmodr.sync(repoPath, 0o766);
return { ok: true, repoPath: repoPath, reason: null };
```
Add a GitSpec case that clones the fixture and checks, immediately after return, that a nested directory has mode `0o777` and a file has `0o766`. Consider the same change for `createBuildPath`'s async chmodr at `builder.js:675`, which overlaps the clone into BUILD_PATH.

## Warnings

### WR-01: Worker still logs the `--env` payload (owner's custom env, may hold credentials) through the job handler; T-23-13 redaction is incomplete

**File:** `services/worker/class.js:457-462`. Also `lib/thinx/builder.js:1067`, `lib/thinx/builder.js:1070`

**Issue:**
The phase redacts `--env=` in `runArgv`'s log line (L209-210) and records T-23-13 as mitigated. But the socket `job` handler logs the whole job with only `secret` replaced:
```js
loggable = Object.assign({}, data, { secret: "<redacted>" });
console.log(new Date().getTime(), `» Worker has new job:`, loggable);
```
Every job now carries `argv` (which includes `--env={"KEY":"value",...}`) and `cmd`, the same JSON quoted for the shell (`builder.js:274-275`). `console.log` prints nested arrays and strings at the default inspect depth, so every build writes the env values to the worker log. This happens before `runArgv`'s redacted line.

The spec `runArgv logs the argv without the --env payload` calls `w.runJob` directly and bypasses the socket handler. The socket-handler spec sends no `--env`, so neither spec catches this.

On the API side, L1070 was rewritten in this phase and logs `buildArgs.join(" ")` with the same `--env=` element. L1067 logs `stringVars` too (pre-existing).

**Fix:**
```js
// services/worker/class.js
const redactArgv = (argv) => Array.isArray(argv)
    ? argv.map((a) => (typeof a === "string" && a.indexOf("--env=") === 0) ? "--env=<redacted>" : a)
    : argv;
if (typeof(data) === "object") {
    loggable = Object.assign({}, data, {
        secret: "<redacted>",
        argv: redactArgv(data.argv),
        cmd: (typeof data.cmd === "string") ? "<redacted>" : data.cmd
    });
}
```
Apply the same mapping to `builder.js:1070` and drop the value from L1067. Extend the socket-handler spec to emit a job whose `argv` and `cmd` carry `--env={"WIFI_PASS":"hunter2"}`, and assert that `hunter2` appears in no log line.

### WR-02: New `runRemoteShell` refusal paths bypass the refusal contract after decrypted secrets are on disk

**File:** `lib/thinx/builder.js:250-265` (also `:284-289`). Reached from `lib/thinx/builder.js:1026-1090`

**Issue:**
By the time `runRemoteShell` runs, `run_build` has already done three things:
- written decrypted SSID/password into `XBUILD_PATH/thinx.yml` (L905)
- written device env into `environment.json` (L925)
- called `callback(true, { response: "build_started" })` (L1026)

The two refusal paths added in this phase (`invalid_device` L252-256, `invalid_build_arguments` L260-265) and the `io === null` path only `notify` and `return`. They do not:
- set `blog.state(..., "error")`, so the build log stays at `started`/`created` for good while the client was told the build started
- run `cleanupSecrets`, so plaintext Wi-Fi credentials stay in a 0o766/0o777 tree on the shared volume

D-10 and `refuseBuild`'s own comment require notifier, build-log state, cleanup, and no hang.

There is also a gap in the D-12 check itself. `run_build` validates `device.owner`/`device.udid` (L724), but `runRemoteShell` validates `br.owner`/`br.udid` (L251), and `br.owner` is never checked with `strictOwner`. Any mismatch is found only after the secrets are written.

**Fix:** Validate the identity that `runRemoteShell` will use up front, before `getLastAPIKey`/`mkdirp`:
```js
// run_build, right after BUILD_PATH (L724)
if (this.buildPathFor(owner, udid, build_id) !== BUILD_PATH) {
    blog.state(build_id, owner, udid, "error");
    return callback(false, "invalid_device");
}
```
Also make every `runRemoteShell` early return set `blog.state(build_id, owner, udid, "error")` and call `this.cleanupSecrets(xbuildPath)`. Pass `XBUILD_PATH` in, or return `false` and let `run_build` clean up.

### WR-03: The rewritten fetch blocks the whole API event loop for up to 10 minutes per git call on an attacker-chosen remote

**File:** `lib/thinx/git.js:50`, `lib/thinx/git.js:211-230`, `lib/thinx/git.js:381-395`. Callers: `lib/thinx/sources.js:289`, `lib/thinx/builder.js:764-767`

**Issue:**
`fetch` is `async`, but each attempt runs `execFileSync` twice (clone, then pull), each with `gitTimeoutMs: 600000`. The event loop is blocked for the whole duration: HTTP, socket.io worker heartbeats, MQTT and every other owner's requests.

Any authenticated owner can add a source whose URL points at a server that trickles bytes (`Sanitka.url` allows any `http(s)://host`). That freezes the API for up to 2 × 10 minutes per key attempt, plus the public attempt: (1 + 2N) × 10 minutes for an owner with N keys.

The old `execSync` also blocked, with no timeout at all. The rewrite kept the blocking design and chose a very long ceiling, and the `async` signature suggests it does not block. `timeout` also kills only `git`; its `ssh` or `git-remote-http` children can outlive it.

**Fix:** Run git through the async `execFile` (promisified), with `killSignal: "SIGKILL"`, `detached: true` and a process-group kill on timeout, and `await` it inside `cloneRepository`/`fetch`. `run_build`, `Sources.add` and `devices.prefetch_repository` already consume the promise. As an interim step, lower `gitTimeoutMs` to something like 120 s and pass `-c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30`.

## Info

### IN-01: Known-hosts fallback writes TOFU keys into the "pinned" seeded file; comments say otherwise

**File:** `lib/thinx/git.js:59-63`, `lib/thinx/git.js:135-144`
**Issue:** In fallback, `learned: seeded` sets both `GlobalKnownHostsFile` and `UserKnownHostsFile` to the seeded file. OpenSSH's `accept-new` writes new host keys into the first user file, which here is the seeded file. The comments say the seeded file "is never written by ssh" and that new keys "are simply not persisted". In fact they persist in the container-local pinned file. Existing pins are not replaced, so this is not a pin bypass.
**Fix:** Correct the comments. Alternatively, in fallback use `UserKnownHostsFile=/dev/null` with `StrictHostKeyChecking=yes` (fail closed for unknown hosts while the learned store is untrusted).

### IN-02: `Sanitka.udid` is not a UUID validator, contrary to the D-12 wording

**File:** `lib/thinx/sanitka.js:97-108`, used by `lib/thinx/builder.js:201-209`, `:712`
**Issue:** `/^([a-fA-F0-9-]{36,})$/` with length 36 accepts `"-".repeat(36)`, any mix of hex and dashes, and upper case. It is path-safe (no `.` or `/`), so containment holds, but case variants of one UUID map to different directories and odd values pass as a "UUID-shaped" identity.
**Fix:** Add `Sanitka.strictUuid` with `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/` and use it in `buildPathFor`.

### IN-03: Owners without keys get a second identical keyless clone, which can flip `is_private` on a transient failure

**File:** `lib/thinx/git.js:376-379`. Callers: `lib/thinx/sources.js:289-294`, `lib/thinx/builder.js:764-767`
**Issue:** When the public attempt fails and the owner has no keys, `fetch` runs the same keyless clone again. That doubles the blocking time (see WR-03). If the retry succeeds, for example after a network blip, `Sources.add` stores `is_private=true` and `prefetchPrivate` updates the source to private, which disables future public fetches.
**Fix:** Return `false` from `fetch` when there are no keys and the caller already made the public attempt, for example with a `{ keyless: false }` option.

### IN-04: `Sources.add` async continuation swallows exceptions, and a failed fetch leaves checkout residue

**File:** `lib/thinx/sources.js:292-297`
**Issue:** `.catch` only logs, so an exception inside `inferAndAddSource` leaves the HTTP callback uncalled and the request hangs. When all attempts fail at the pull stage, `TEMP_PATH` (`<build_root>/<owner>/<source_id>`) keeps a full clone of the private repository, because nothing removes it on `Git fetch failed.`.
**Fix:** Call `callback(false, "Git fetch failed.")` in the `.catch`, and `fs.removeSync(TEMP_PATH)` on both failure branches.

### IN-05: Source-add and device-attach fetches never use the D-09 last-good-key memory

**File:** `lib/thinx/sources.js:17`, `lib/thinx/devices.js:15`
**Issue:** Both modules construct `new Git()` without redis, so `orderKeys` and `rememberKey` are no-ops. Only `builder.js:58` passes redis. D-09 describes the memory as shared across API replicas, but only builds read or write it.
**Fix:** Inject the app redis client (both constructors already receive or can receive it). Otherwise, document the limitation.

### IN-06: `prefetchPrivate` detects public success by `basename.json` existence instead of `prefetchPublic`'s return value

**File:** `lib/thinx/builder.js:517`, `lib/thinx/builder.js:764`
**Issue:** `run_build` ignores `prefetchPublic`'s boolean and re-derives success from a file inside a directory that repository content also populates. This is harmless today because `cloneRepository` empties the directory first, but the success signal is indirect.
**Fix:** `const publicOk = !br.is_private && this.prefetchPublic(...)`, then skip `prefetchPrivate` when `publicOk`.

---

_Reviewed: 2026-09-28T18:59:03Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
