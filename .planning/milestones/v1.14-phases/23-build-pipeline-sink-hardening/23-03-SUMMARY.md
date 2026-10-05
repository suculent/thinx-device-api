---
phase: 23-build-pipeline-sink-hardening
plan: 03
subsystem: api
tags: [security, path-traversal, symlink, containment, builder, o_nofollow]

requires:
  - phase: 23-build-pipeline-sink-hardening
    provides: "23-01 argv fetch contract, builder.symlinkWarning (core.symlinks=false checkout)"
provides:
  - "lib/thinx/safepath.js: isInside, resolveInside, readFileInside, writeFileInside, unlinkInside (never throw; reasons invalid_input/root_missing/missing/symlink/outside_root/not_a_file/io_error)"
  - "builder.loadRepoYaml / writeRepoFile / refuseBuild / buildPathFor"
  - "Build reasons unsafe_repository_file and invalid_device (new); invalid_build_id now also for a non-UUID build_id"
  - "Platform.UNSAFE_REPOSITORY_FILE sentinel + Platform.platformFromYamlFile(root, ymlPath)"
  - "Sanitka.strictOwner (exactly 64 [a-z0-9], unchanged or null)"
  - "pine64 plugin: contained no-follow Makefile read, never logs content"
affects: [23-04, 23-05, 24-secrets-sweep]

plan_head_before: e4e265186e5377e8845bb0caa09f2ac3c2c29fb6
plan_head_after: 88a260fcdcacd07dfde26d7cdfedac61afd52c1e

actuals:
  tokens: 15242
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Repository-controlled files are touched only through safepath (realpath root + target/parent, path.relative containment, lstat no-symlink, O_NOFOLLOW open)"
    - "Pre-start build refusals go through builder.refuseBuild: notify + blog.state error + cleanupSecrets + callback(false, reason), exactly once"
    - "Filesystem identities are validated, never stripped (strictOwner / Sanitka.udid + isInside)"

key-files:
  created:
    - lib/thinx/safepath.js
    - spec/jasmine/SafePathSpec.js
    - spec/jasmine/BuilderPathSpec.js
  modified:
    - lib/thinx/builder.js
    - lib/thinx/platform.js
    - lib/thinx/plugins/pine64/plugin.js
    - lib/thinx/sanitka.js
    - spec/jasmine/SanitkaSpec.js

key-decisions:
  - "safepath decides containment before missing/symlink, so an escaping path is always reported outside_root; a symlink's own location (parent realpath + basename) is what gets contained, never its target"
  - "The '..' check is exact (rel === '..' or starts with '..' + sep), so a legitimate child named '..foo' is accepted"
  - "readFileInside/writeFileInside lstat-check isFile before open (a FIFO open would block) and writeFileInside validates data type before O_TRUNC; an ELOOP at open is reported as symlink"
  - "Platform.platformFromYamlFile keeps the pre-change parse behaviour: a YAML parse error still propagates to getPlatform's catch"
  - "run_build checks Sanitka.udid(build_id) before the length check, so a non-string build_id cannot throw on .length"

patterns-established:
  - "safepath is the only sink for repo files in builder.js/platform.js/pine64; new sinks must use it"

requirements-completed: [SEC-PATH-01]

coverage:
  - id: D1
    description: "safepath helper: containment, symlink refusal, prefix sibling abc vs abc-evil, O_NOFOLLOW read/write, unlink never follows links, never throws"
    requirement: SEC-PATH-01
    verification:
      - kind: unit
        ref: "spec/jasmine/SafePathSpec.js (26 specs)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Symlinked or escaping thinx.yml refused before read and before the decrypted Wi-Fi credential write-back; refuseBuild notifies, cleans up and calls back unsafe_repository_file"
    requirement: SEC-PATH-01
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderPathSpec.js#loadRepoYaml, #writeRepoFile, #refuseBuild"
        status: pass
      - kind: other
        ref: "grep gate YML-GUARDED (direct_yml=0 nofollow=6 reason>=2); awk refuseBuild | grep blog.state = 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "environment.json, thinx_build.json, header, checkout dir, Platform thinx.yml, pine64 Makefile and cleanupSecrets go through safepath"
    requirement: SEC-PATH-01
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderPathSpec.js#Platform.platformFromYamlFile, #pine64 plugin, #cleanupSecrets"
        status: pass
      - kind: other
        ref: "grep gate SINKS-GUARDED (builder_direct=0 cleanup_unlink=0 direct_reads=0 content_log=0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "device.owner/udid/build_id validated (never stripped) before BUILD_PATH; invalid_device before mkdirp; runRemoteShell emits no job for an invalid identity"
    requirement: SEC-PATH-01
    verification:
      - kind: unit
        ref: "spec/jasmine/SanitkaSpec.js#strictOwner; spec/jasmine/BuilderPathSpec.js#buildPathFor, #runRemoteShell"
        status: pass
      - kind: other
        ref: "grep gate BUILDPATH-CONTAINED (concat=0 buildPathFor=3 invalid_device=2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "End-to-end run_build refusal (notifier text reaching the owner, build-log state in CouchDB) against a real device record"
    requirement: SEC-PATH-01
    verification: []
    human_judgment: true
    rationale: "run_build needs CouchDB/Redis/worker; the local specs cover the helpers and refuseBuild with spies. CI (XBuilderSpec, 23-05 push) and phase verification exercise the full path."

duration: 10min
completed: 2026-09-27
status: complete
---

# Phase 23 Plan 03: Repository-File Containment and Device-Identity BUILD_PATH Summary

**The builder now reads and writes repository files through one realpath + path.relative + lstat + O_NOFOLLOW helper (`lib/thinx/safepath.js`). A symlinked or escaping `thinx.yml` fails the build with `unsafe_repository_file` before the decrypted Wi-Fi credentials are written, and `BUILD_PATH` accepts only a strict 64-char owner and UUID-shaped udid/build_id. Nothing is stripped, and anything invalid is refused with `invalid_device`.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-27T11:35:37Z
- **Completed:** 2026-09-27T11:45:41Z
- **Tasks:** 3 of 3
- **Files:** 8 (3 created, 5 modified)

## Accomplishments

- `safepath.js` is a new module. It uses only Node built-ins and never throws. It exports `isInside`, `resolveInside`, `readFileInside`, `writeFileInside` and `unlinkInside`, and both opens use `O_NOFOLLOW`.
- `run_build` changes:
  - The `thinx.yml` read goes through `loadRepoYaml`, and the credential write-back goes through `writeRepoFile`. An empty `thinx.yml` no longer throws.
  - `environment.json`, `thinx_build.json` and the header are contained writes. The header is `JSON2H.process` output written synchronously, and the NaN fallback is gone.
  - The checkout directory is chosen with `getDirectories` and then checked with `resolveInside`.
  - The `Platform.UNSAFE_REPOSITORY_FILE` sentinel now refuses the build.
- Every refusal goes through `refuseBuild`, which notifies, sets the build log to `error`, runs `cleanupSecrets` and calls back once. The old `thinx_build.json` failure path returned without a callback and left the request hanging; it now calls back.
- `cleanupSecrets` unlinks through `unlinkInside`. It never follows a link and never aborts.
- The pine64 plugin reads the Makefile without following links and no longer logs its content.
- `Sanitka.strictOwner` and `builder.buildPathFor` are used by both `run_build` (before `getLastAPIKey`/`mkdirp`) and `runRemoteShell` (no job is emitted for an invalid identity).

## Task Commits

1. **Task 1 (tracer): safepath + symlinked thinx.yml refused end to end.** `2e13d700` (feat)
2. **Task 2: remaining repo-controlled sinks.** `44b05f73` (feat)
3. **Task 3: strict device identity + contained BUILD_PATH.** `8550413d` (feat)
4. **Follow-up: restore platform.js parse-error reporting.** `88a260fc` (fix)

## Spec-first evidence (RED before GREEN)

- **Task 1:** SafePathSpec failed with `MODULE_NOT_FOUND` for `lib/thinx/safepath`. BuilderPathSpec failed with `loadRepoYaml is not a function`.
- **Task 2:** 20 BuilderPathSpec specs, 8 failures (no `UNSAFE_REPOSITORY_FILE`/`platformFromYamlFile`, pine64 logged the marker content, `cleanupSecrets` async fs-extra unlink).
- **Task 3:** 92 specs, 25 failures (no `strictOwner`, `buildPathFor`; `runRemoteShell` emitted the job for `../bad`).
- The tracer feedback gate re-ran the Task 1 `<verify>` (SPECS-GREEN, YML-GUARDED) before expansion.

## Verification (local, `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p`, no helpers)

- Task 1 run (SafePath, BuilderPath, Git, Finder): 80 specs, 0 failures. SPECS-GREEN, and `YML-GUARDED direct_yml=0 nofollow=6 reason=4`.
- Task 2 run (+ JSON2HSpec): 94 specs, 0 failures. SPECS-GREEN, and `SINKS-GUARDED builder_direct=0 cleanup_unlink=0 direct_reads=0 content_log=0`.
- Task 3 run (+ SanitkaSpec): 163 specs, 0 failures. SPECS-GREEN, and `BUILDPATH-CONTAINED concat=0 buildPathFor=3 invalid_device=2`.
- Final run (Sanitka, SafePath, BuilderPath, Git, Finder, JSON2H): 166 specs, 0 failures.
- Acceptance greps:
  - safepath exports `isInside,readFileInside,resolveInside,unlinkInside,writeFileInside`
  - `this.refuseBuild(` count is at least 2
  - refuseBuild contains `blog.state` (1)
  - `Platform.UNSAFE_REPOSITORY_FILE` appears in builder.js (1) and `UNSAFE_REPOSITORY_FILE` in platform.js (6)
  - `unlinkInside(cpath` count is 3
  - `static strictOwner` is present, and `/^[a-z0-9]{64}$/` appears once
  - The `invalid_device` return (L695) comes before `createBuildPath` (L707)
  - `buildPathFor` contains no `.replace(`
- PlatformSpec (11 specs, 6 failures) and PluginSpec (6 specs, 1 failure) match the planning-time local baseline. The test repositories they need are fetched only in CI.
- eslint is clean on all changed files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A thinx.yml platform key with no body threw in run_build**
- **Found during:** Task 1
- **Issue:** `yml[y_platform].arch` throws a TypeError when the section is null (for example `arduino:` with nothing under it). That throw happens inside an async callback.
- **Fix:** The section is read only when it is a non-null object, and the MCU check is skipped otherwise.
- **Files modified:** lib/thinx/builder.js
- **Commit:** 2e13d700

**2. [Rule 2 - Missing critical] safepath open-time hardening beyond the plan text**
- **Found during:** Task 1
- **Issue:** Opening a FIFO blocks the process. Also, `O_TRUNC` empties the file before a bad `data` argument is noticed.
- **Fix:** An `lstat` `isFile` check runs before open, and `data` must be a string or `Uint8Array` before the write opens. An ELOOP at open (a symlink swapped in after the check) is reported as `symlink` instead of `io_error`.
- **Files modified:** lib/thinx/safepath.js
- **Commit:** 2e13d700

**3. [Rule 1 - Bug] The `..` check is exact instead of a prefix test**
- **Found during:** Task 1
- **Issue:** A plain `startsWith("..")` would refuse a legitimate child named `..foo`.
- **Fix:** The check is `rel === ".."` or `rel` starting with `".." + path.sep`. There is a spec case for it.
- **Commit:** 2e13d700

**4. [Rule 1 - Bug] build_id validity is checked before `.length`**
- **Found during:** Task 3
- **Issue:** `build_id.length` throws when build_id is not a string.
- **Fix:** `Sanitka.udid(build_id) === null` runs first and returns `invalid_build_id`.
- **Commit:** 8550413d

**5. [Rule 1 - Self-correction] platform.js parse errors are reported again**
- **Found during:** Post-task review
- **Issue:** The first version of `platformFromYamlFile` caught a YAML parse error and returned null. That silently changed `getPlatform` from failing to falling back on plugin detection, and the plan says the parse logic stays unchanged.
- **Fix:** The parse error propagates to `getPlatform`'s `.catch` again, as it did before this plan.
- **Commit:** 88a260fc

**6. [Spec adjustment] The cleanupSecrets spec uses a top-level environment.h**
- `cleanupSecrets` searches non-recursively, and the plan keeps the three `findFilesSync` lookups as they are. The fixture therefore puts `environment.h` next to `environment.json` instead of in a subdirectory.

**Total deviations:** 5 auto-fixed (4 bugs, 1 hardening) and 1 spec fixture adjustment.
**Impact:** Every deviation makes the refusal stricter or preserves existing behaviour. None widens the scope.

## Known Stubs

None.

## Deferred / Notes

- `cleanupSecrets` finds files with `findFilesSync`, which never returns symlinks. A symlinked `thinx.yml` link is therefore not removed by cleanup. This leaks nothing: the build was refused before anything was written through the link, and the link target is never touched.
- `cleanupSecrets` is still non-recursive (unchanged). A generated header in a subdirectory, such as `thinx.h`, is not one of the three cleaned names.
- `runRemoteShell` keeps its signature. Plan 23-04 changes it.
- The `sanitka.js` header still names shell-escape. Per the plan, 23-04 removes that sentence.

## Threat Flags

None. No new endpoint or trust boundary was added. Every change narrows the existing builder filesystem surface (T-23-20..T-23-26).

## Next Phase Readiness

Ready for 23-04 (worker pointer bump, shell-escape removal, `runRemoteShell` signature). `services/worker` was left unstaged, as instructed.

## Self-Check: PASSED

- FOUND: lib/thinx/safepath.js, spec/jasmine/SafePathSpec.js, spec/jasmine/BuilderPathSpec.js
- FOUND commits: 2e13d700, 44b05f73, 8550413d, 88a260fc
