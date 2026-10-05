---
phase: 23-build-pipeline-sink-hardening
plan: 01
subsystem: api
tags: [security, git, argv, ssh, askpass, known_hosts, redis, symlinks]

requires:
  - phase: 22-ci-sast-baseline
    provides: CodeQL baseline the phase SAST delta (23-05) compares against
provides:
  - "lib/thinx/git.js: Git(redis, options) with SSH_COMMAND, cloneRepository, baseEnv, sshEnv, fetch, keyNamesForOwner, orderKeys, rememberKey, knownHostsFiles, symlinkEntries, create_askfile, delete_askfile"
  - "argv-only private/public fetch contract: builder.prefetchPublic, async builder.prefetchPrivate(br, BUILD_PATH, url, branch), sources.add, devices.prefetch_repository"
  - "builder.symlinkWarning() and the D-13 build-log line after XBUILD_PATH"
  - "Redis key gitkey:<owner> (key filename, EX 2592000)"
  - "Learned known_hosts at <data_root>/ssh_known_hosts/known_hosts (0700 dir / 0600 file)"
affects: [23-02, 23-03, 23-04, 23-05, 24-secrets-sweep]

plan_head_before: 2d9d85abb2aa9b21233f283bfe1fe5261f1ffedb
plan_head_after: bf7674d3d67ab5d1e59c02a9cba0fa1634ff839e

actuals:
  tokens: 17213
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "git only via execFileSync(\"git\", argv); per-attempt values reach GIT_SSH_COMMAND only as env vars"
    - "Hermetic git fixtures: git init --bare + git fast-import (no signing, no user config), reached over file://"
    - "Servers that a synchronous execFileSync path talks to run in a child process in specs"

key-files:
  created: []
  modified:
    - lib/thinx/git.js
    - lib/thinx/builder.js
    - lib/thinx/sources.js
    - lib/thinx/devices.js
    - spec/jasmine/GitSpec.js
    - spec/jasmine/XBuilderSpec.js

key-decisions:
  - "SSH_COMMAND also pins PreferredAuthentications=publickey and PasswordAuthentication=no: SSH_ASKPASS is forced for the whole ssh process, so a hostile ssh server offering password auth would otherwise receive the key passphrase"
  - "baseEnv() strips an inherited GIT_KEY_PASSPHRASE; only keyed attempts (sshEnv) carry it"
  - "delete_askfile only removes a thinx-askpass-* directory directly under os.tmpdir()"
  - "keyNamesForOwner returns [] for an empty or non-string owner (rsakey's indexOf('') would match every key)"
  - "symlinkEntries reads only a checkout's own index (.git must exist) so git never walks up to an enclosing repo; symlinkWarning replaces control characters so file names cannot forge build-log lines"
  - "Learned known_hosts file is created with O_EXCL ('wx') instead of 'a', so creation never follows a planted symlink"

patterns-established:
  - "Git.cloneRepository is the single clone/pull/basename routine for every caller"
  - "Fetch failures resolve false and the caller owns build-log state (prefetchPrivate stays CouchDB-free)"

requirements-completed: [SEC-EXEC-01, SEC-PATH-02]

coverage:
  - id: D1
    description: "Private and public fetch run git through argv only (no shell, no ssh-agent wrapper, no shell-escape in git.js/sources.js/devices.js); injection strings in url/branch create no marker file"
    requirement: SEC-EXEC-01
    verification:
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#Git cloneRepository (c) never runs injection strings in url or branch"
        status: pass
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#Git cloneRepository (e) rejects empty, null and undefined url/branch before spawning git"
        status: pass
      - kind: other
        ref: "grep gates SHELL-GONE and CALLERS-MIGRATED (plan Task 1/2 verify)"
        status: pass
    human_judgment: false
  - id: D2
    description: "builder.prefetchPrivate -> git.fetch -> cloneRepository fetches a file:// fixture end to end; a missing repo resolves false (git_fetch_failed)"
    requirement: SEC-EXEC-01
    verification:
      - kind: integration
        ref: "spec/jasmine/GitSpec.js#Git Builder prefetch (j) fetches the fixture end to end"
        status: pass
      - kind: integration
        ref: "spec/jasmine/GitSpec.js#Git Builder prefetch (k) resolves false for a missing repository (git_fetch_failed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Per-key SSH env: constant GIT_SSH_COMMAND, per-attempt mkdtemp askpass removed in finally, passphrase via readSecret, never sent to an HTTP 401 remote"
    requirement: SEC-EXEC-01
    verification:
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#Git fetch (g) with one key makes exactly one keyed attempt with the constant SSH env"
        status: pass
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#Git fetch (h) resolves false and still removes the askpass dir when an attempt throws"
        status: pass
      - kind: integration
        ref: "spec/jasmine/GitSpec.js#Git askpass and passphrase (T-23-02) never hands the passphrase to an HTTP remote answering 401"
        status: pass
    human_judgment: false
  - id: D4
    description: "Learned known_hosts used only when dir/file pass symlink, mode and owner checks; seeded file stays GlobalKnownHostsFile"
    requirement: SEC-EXEC-01
    verification:
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#Git known_hosts policy (D-07, D-08) (7 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Redis last-good key: honoured only when it is one of the owner's own key names; error/timeout/no-redis keep order; stores filename only with 30-day TTL"
    requirement: SEC-EXEC-01
    verification:
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#Git last-good key memory (D-09) (6 cases)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Clone and pull run with core.symlinks=false; symlink entries arrive as plain files and are named in one build-log line"
    requirement: SEC-PATH-02
    verification:
      - kind: unit
        ref: "spec/jasmine/GitSpec.js#Git symlink checkout (SEC-PATH-02, D-13) (5 cases)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Private repository builds keep working in production (real deploy key, real remote, container OpenSSH)"
    requirement: SEC-EXEC-01
    verification: []
    human_judgment: true
    rationale: "Production half of SEC-EXEC-01 is the D-14 proof in plan 23-05 (user-named private repo after deploy); nothing is pushed or deployed in 23-01"

duration: 16min
completed: 2026-09-27
status: complete
---

# Phase 23 Plan 01: Private-Fetch Argv Contract Summary

**git.js rewritten around one argv-only `cloneRepository` routine (core.symlinks=false, protocol.ext never) with a constant publickey-only GIT_SSH_COMMAND, per-attempt askpass, guarded persistent known_hosts and a Redis last-good key; builder, sources and devices all fetch through it.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-09-27T11:06Z
- **Completed:** 2026-09-27T11:22Z
- **Tasks:** 3 (1 tracer + 2 TDD)
- **Files modified:** 6

## Accomplishments

- No git operation in `lib/thinx/git.js`, `sources.js` or `devices.js` goes through a shell. The `tryShellOp`/`prefetch` helpers, the `ssh-agent sh -c` wrapper, `Sources.prefetchCommand`, `Devices.gitPrefetchCommand`, `builder.gitCloneAndPullCommand`/`SHELL_FETCH`, `writeBasenameMetadata` and three `shell-escape` imports are gone.
- `git.fetch(owner, url, branch, buildPath)` resolves a boolean and never rejects. `run_build` awaits `prefetchPrivate` and reports `git_fetch_failed` after setting the build-log state to `error`.
- Keyed attempts share one constant `Git.SSH_COMMAND` (accept-new, IdentitiesOnly, publickey only, seeded file as `GlobalKnownHostsFile`, learned file as `UserKnownHostsFile`). `GIT_ASKPASS=false` and `GIT_TERMINAL_PROMPT=0` keep the passphrase away from HTTP credential prompts. A mutation run proved this: without `GIT_ASKPASS=false`, the 401 server received `spec-pass-XYZ:spec-pass-XYZ`.
- Repository symlinks are checked out as plain files. `run_build` writes one `warning: repository symlinks were checked out as plain files (core.symlinks=false): ...` line to the build log and continues.
- GitSpec is hermetic: 34 specs, no network, no `~/.ssh`, no `/mnt/data`, no Redis or CouchDB.

## Task Commits

1. **Task 1 (tracer): private fetch end to end via argv**
   - `49746554` test(23-01): failing hermetic GitSpec (RED)
   - `75f32b6a` feat(23-01): argv-only git and per-key SSH env (GREEN)
   - Tracer gate: verify re-run end to end, passed, then expansion continued.
2. **Task 2: sources/devices on the argv contract, symlink report (D-13)**
   - `b7ea4a3e` test(23-01) (RED, `RED_EVIDENCE_OK`)
   - `4ff2b194` feat(23-01) (GREEN)
3. **Task 3: learned known_hosts (D-08), last-good key (D-09), leak check**
   - `cdffbd87` test(23-01) (RED, `RED_EVIDENCE_OK`)
   - `bf7674d3` feat(23-01) (GREEN)

**Plan metadata:** see the final docs(23-01) commit.

## Spec-First Lock (RED against the pre-change code)

- **Task 1:** all 11 new GitSpec cases, (a)-(k), failed against the unmodified code. Cases (a)-(e) failed with `git.baseEnv is not a function`, (f)-(h) with `cloneRepository() method does not exist`, and (i)-(k) with `builder.git` being undefined. The old API had none of the contract.
- **Task 2:** 5 of 7 new cases failed. `symlinkEntries` (2 cases) and `symlinkWarning` failed on missing functions. Both Sources.add cases timed out: after Task 1, the old `add` passed a shell string to the new `fetch` and never called back. The plain-file checkout and the persisted `core.symlinks=false` passed already, as regression locks for Task 1's clone flags. The evidence checker returned `RED_EVIDENCE_OK` for target `symlinkEntries() names the mode-120000 index entries`.
- **Task 3:** 12 of 16 new cases failed: `knownHostsFiles` (5), the learned-option env (1), `orderKeys`/`rememberKey` (6). The constant-command, askpass-body, 401-leak and ssh bad-key cases passed already on the Task 1 code (regression locks). The evidence checker returned `RED_EVIDENCE_OK` for target `creates the learned dir at 0700 and file at 0600 and uses them`.

## Verification Run

| Command | Result |
|---|---|
| Programmatic jasmine `GitSpec.js` (Task 1 verify) | `11 specs, 0 failures`, then 18 after Task 2, then `34 specs, 0 failures` |
| `GitSpec.js` + `SecretsSpec.js` + `SanitkaSpec.js` (Task 3 verify) | `90 specs, 0 failures`, SPECS-GREEN |
| SHELL-GONE gate | `git=0 builder=0` |
| CALLERS-MIGRATED gate | `old=0 fetch_calls=2` |
| HOSTKEY-POLICY-OK gate | `relaxed=0 gitkey=2 modecheck=2` |
| `node --check` on git/builder/sources/devices | pass |
| `eslint` on the 6 touched files | clean |
| gitlink check (`git log 297ee357..HEAD -- services/worker`, `(23-01)` subjects) | `0` |
| `ssh -G` with `SSH_COMMAND` expanded | options parse (IdentitiesOnly yes, accept-new, publickey, Global/User known hosts) |

CI-only specs (XBuilderSpec, SourcesSpec, DevicesSpec) run when plan 23-05 pushes. Nothing was pushed.

## Files Created/Modified

- `lib/thinx/git.js`: rewritten. `Git(redis, options)` plus the whole argv fetch contract, known_hosts policy and key memory.
- `lib/thinx/builder.js`:
  - `this.git = new Git(redis)`, `prefetchPublic` on the shared routine, async `prefetchPrivate`, `symlinkWarning`
  - the `run_build` callback is async and awaits the prefetch
  - symlink build-log line
  - removed the shell clone builder and `writeBasenameMetadata`
- `lib/thinx/sources.js`: `add` does the public `cloneRepository` first, then `git.fetch`, and shares the `inferAndAddSource` tail. `prefetchCommand`, `shell-escape` and the dead `child_process` import are removed.
- `lib/thinx/devices.js`: `prefetch_repository` uses `git.fetch(...).then`. `gitPrefetchCommand` and `shell-escape` are removed.
- `spec/jasmine/GitSpec.js`: rewritten, hermetic, 34 specs.
- `spec/jasmine/XBuilderSpec.js`: removed the synchronous string-command `prefetchPrivate` case.

## Decisions Made

See `key-decisions` in the frontmatter. The three most consequential:
- Publickey-only ssh auth, so the forced askpass cannot answer a password prompt.
- `baseEnv()` strips an inherited `GIT_KEY_PASSPHRASE`.
- O_EXCL creation of the learned known_hosts file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] ssh password/keyboard-interactive auth could receive the passphrase**
- **Found during:** Task 1
- **Issue:** With `SSH_ASKPASS_REQUIRE=force` set for the whole clone, ssh uses the askpass helper for every prompt, including a server-requested password prompt. A hostile ssh remote could therefore collect the key passphrase. This is the ssh twin of the HTTP 401 vector the plan closes with `GIT_ASKPASS=false`.
- **Fix:** `Git.SSH_COMMAND` adds `-o PreferredAuthentications=publickey -o PasswordAuthentication=no`. The command is still one constant literal.
- **Files modified:** lib/thinx/git.js
- **Verification:** `ssh -G` shows `preferredauthentications publickey` and `passwordauthentication no`. The constant-command spec passes.
- **Committed in:** 75f32b6a

**2. [Rule 2 - Missing critical] Smaller hardening inside the new code**
- **Found during:** Tasks 1-3
- **Issue and fix:**
  - `baseEnv()` removes an inherited `GIT_KEY_PASSPHRASE`, so public and keyless attempts never carry it.
  - `delete_askfile()` only removes a `thinx-askpass-*` dir directly under `os.tmpdir()`.
  - `keyNamesForOwner('')` returns `[]`, because rsakey's `indexOf('')` would match every owner's keys.
  - `symlinkEntries()` requires the checkout's own `.git`, so it cannot report an enclosing repo.
  - `symlinkWarning()` replaces control characters.
  - The learned known_hosts file is created with `'wx'` instead of `'a'`.
- **Files modified:** lib/thinx/git.js, lib/thinx/builder.js
- **Committed in:** 75f32b6a, 4ff2b194, bf7674d3

**3. [Rule 3 - Blocking] Lint errors in touched files**
- **Found during:** Task 3 (eslint over touched files)
- **Issue:**
  - two unused `catch (e)` bindings (new code)
  - a stray eslint-disable directive (new code)
  - a pre-existing unused `child_process` import in sources.js, dead since before this plan
- **Fix:** renamed the bindings to `_e`, dropped the directive, removed the import. Removing the import also fits this plan's goal of no shell exec in sources.js.
- **Committed in:** bf7674d3

**4. [Spec correction] Platform expectation in the Sources.add spec**
- **Found during:** Task 2 GREEN
- **Issue:** The spec expected `platformio`. `Platform.getPlatform` returns key plus arch, `platformio:esp8266`, and the assertion threw inside a callback that platform.js swallows, so the spec timed out instead of failing on the assertion.
- **Fix:** Changed the expectation to `platformio:esp8266`. No production change.
- **Committed in:** 4ff2b194

**5. [Plan addition] Hermetic Sources.add specs**
- The plan listed no spec for the `sources.add` migration, and the CI-only SourcesSpec needs CouchDB.
- Two stubbed cases now cover it: a public add sets `is_private=false`, and a miss returns `Git fetch failed.`. They use the same fixture.

---

**Total deviations:** 3 auto-fixed (2 Rule 2, 1 Rule 3), 1 spec correction, 1 spec addition.
**Impact on plan:** Every change hardens the contract or makes it testable. No architectural change and no scope creep beyond the files in the plan.

## Issues Encountered

- A GitSpec-local HTTP server cannot answer git while `fetch` runs `execFileSync`, because the call blocks the event loop. The 401 server therefore runs as a child process that writes the Authorization headers it receives to a file.
- `gsd check tdd-red-evidence` needs TAP output. A scratchpad jasmine TAP reporter produced it; nothing was added to the repo.

## Known Stubs

None.

## Notes for Later Plans

- `builder.js` still requires `shell-escape`, for the `runShell` log line (L354) and the remote job `cmd` (L934). Both belong to the SEC-EXEC-02 plans; `package.json` removal is 23-04.
- `sanitka.js` L3-8 still says its values end up in shell strings passed to git.js. That comment is stale now and should be refreshed with the 23-04 dependency removal.
- `rsakey.keyPassphrase()` still reads `process.env` directly while git.js reads through `readSecret`. When the env fallback is removed (SEC-CFG-03), both must move together.
- Pre-existing behaviour left untouched: when platform inference fails, `Sources.add` never calls its callback, and `normalizedBranch` can call the callback twice.

## User Setup Required

None. No external service configuration required.

## Next Phase Readiness

- The 23-01 file state is committed on `thinx-staging` and not pushed. Plans 23-03 and 23-04 build on this git.js and builder.js.
- Plan 23-05 carries the production half: `ssh -V` in the container, and the D-14 private-repo proof.

## Self-Check: PASSED

- The 6 modified files exist.
- Commits 49746554, 75f32b6a, b7ea4a3e, 4ff2b194, cdffbd87 and bf7674d3 are present in `git log`.
- Every acceptance criterion and plan-level verification command was re-run and passes.

---
*Phase: 23-build-pipeline-sink-hardening*
*Completed: 2026-09-27*
