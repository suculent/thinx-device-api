---
phase: 23-build-pipeline-sink-hardening
plan: 04
subsystem: api
tags: [security, argv, worker-protocol, dependency-removal, submodule]

requires:
  - phase: 23-build-pipeline-sink-hardening
    provides: "23-02 worker argv jobs (validateArgv, BUILDER_PROGRAM, commit 79611f6); 23-03 buildPathFor + invalid_device guard in runRemoteShell"
provides:
  - "builder.legacyShellCommand(args): byte-identical reproduction of the removed escaping package (v0.2.0), used only for the legacy cmd field"
  - "runRemoteShell(worker, buildArgs, owner, build_id, udid, notifiers, source_id) emitting { argv: buildArgs.slice(), cmd, path, ... }"
  - "New refusal reason invalid_build_arguments (sender-side wire-contract check)"
  - "shell-escape gone from lib/, package.json and package-lock.json"
  - "No lgtm markers left in lib/thinx/builder.js"
  - "Parent gitlink services/worker -> 79611f628e7b7b00ebcc2c07732b869a7e6b7ac8 (committed, not pushed)"
affects: [23-05]

plan_head_before: a07e8aabd60753aaa99495a3aee1e587646a2f35
plan_head_after: 863cab84f9469ac3be07dc86883e535a1ad03ab0

actuals:
  tokens: 5066
  tasks: 2
  commits: 3

tech-stack:
  added: []
  removed: [shell-escape]
  patterns:
    - "Remote build job = argv (arguments only, worker owns the program) + legacy cmd for pre-argv workers"
    - "Golden-string specs pin a wire format captured from a dependency before removing it"

key-files:
  created:
    - spec/jasmine/BuilderRemoteJobSpec.js
  modified:
    - lib/thinx/builder.js
    - lib/thinx/sanitka.js
    - spec/jasmine/BuilderPathSpec.js
    - package.json
    - package-lock.json
    - services/worker (gitlink)

key-decisions:
  - "runRemoteShell checks identity (invalid_device, 23-03) before the argument contract (invalid_build_arguments), so the 23-03 regression cases keep their reason"
  - "The shell-escape removal and the worker pointer bump are separate commits, so either can be reverted alone"
  - "The legacyShellCommand comment names the removed package only indirectly, so the plan's DEP-GONE grep over lib/ holds; the spec header keeps the exact name for traceability"

patterns-established:
  - "A new builder flag must be allowed by the worker (ALLOWED_ARGV_FLAGS) and must start with --, or the API refuses it before emitting"

requirements-completed: [SEC-EXEC-02]

coverage:
  - id: D1
    description: "legacyShellCommand reproduces the removed escaping package byte for byte (8 golden cases captured from shell-escape 0.2.0 before removal, including the realistic run_build list)"
    requirement: SEC-EXEC-02
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderRemoteJobSpec.js#legacyShellCommand (golden shell-escape 0.2.0 output)"
        status: pass
    human_judgment: false
  - id: D2
    description: "runRemoteShell emits one job with argv (a copy of buildArgs, --flags only, no program), cmd = legacyShellCommand(['./builder', ...buildArgs]), path = buildPathFor(...), secret unchanged"
    requirement: SEC-EXEC-02
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderRemoteJobSpec.js#runRemoteShell job shape (D-01, D-04)"
        status: pass
      - kind: other
        ref: "scratchpad old-worker simulation: job.cmd split/join and run by /bin/sh reproduces the exact argv, including --env JSON with a space and an apostrophe (OLD-WORKER-PARSE-OK)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Invalid identity emits no job (invalid_device); a string, a program path, a bare word, a non-string or a missing list emits no job (invalid_build_arguments)"
    requirement: SEC-EXEC-02
    verification:
      - kind: unit
        ref: "spec/jasmine/BuilderRemoteJobSpec.js#runRemoteShell refusals (6 specs); spec/jasmine/BuilderPathSpec.js#runRemoteShell (D-12)"
        status: pass
    human_judgment: false
  - id: D4
    description: "shell-escape removed from lib/, package.json and package-lock.json with a deletion-only lockfile diff; chai-http stays ^4.3.0"
    requirement: SEC-EXEC-02
    verification:
      - kind: other
        ref: "git grep -e shell-escape -e shellEscape -- lib package.json package-lock.json -> rc=1 (DEP-GONE); git show --numstat f67efc11 -> package-lock.json 0 added / 7 deleted"
        status: pass
    human_judgment: false
  - id: D5
    description: "No lgtm marker in builder.js and no suppression marker added anywhere in lib/ during the phase"
    verification:
      - kind: other
        ref: "grep -c lgtm lib/thinx/builder.js = 0; git diff 297ee357 -- lib (rc 0) added lines matching lgtm|codeql[|nosemgrep|deepcode ignore|eslint-disable = 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "Parent gitlink services/worker equals the 23-02 worker HEAD 79611f6 and is committed"
    verification:
      - kind: other
        ref: "POINTER-BUMPED: git rev-parse HEAD:services/worker == git -C services/worker rev-parse HEAD == 79611f628e7b...; git status --porcelain -- services/worker empty"
        status: pass
    human_judgment: false
  - id: D7
    description: "A real remote build against a deployed worker, old and new image, in either deploy order"
    requirement: SEC-EXEC-02
    verification: []
    human_judgment: true
    rationale: "Needs the swarm worker and CouchDB/Redis; 23-05 owns the ordered push/deploy and CI runs XBuilderSpec's remote/local branches."

duration: 5min
completed: 2026-09-27
status: complete
---

# Phase 23 Plan 04: Remote job argv and shell-escape removal Summary

**Remote build jobs now carry `argv`, a copy of the builder arguments that never names the program. The legacy `cmd` is still sent and is byte-identical to the old shell-escape output, so old workers keep parsing `--env` JSON. The `shell-escape` dependency is gone from the code, package.json and the lockfile, and the parent now points at the argv-capable worker commit `79611f6`.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-09-27T11:49:08Z
- **Completed:** 2026-09-27T11:54Z
- **Tasks:** 2 of 2 (1 tracer, 1 auto)
- **Files:** 7 (1 created, 5 modified, plus the gitlink)

## Accomplishments

- **D-01 / D-04 (SEC-EXEC-02, API half):**
  - `runRemoteShell(worker, buildArgs, …)` emits `argv: buildArgs.slice()` next to `cmd: this.legacyShellCommand(["./builder", ...buildArgs])`. All other job fields, the secret masking copy and the `log`/`job-status` handlers are unchanged.
  - `run_build` passes `buildArgs` directly. The escaped remote-command constant is gone, and the log line reads `Building with arguments: <args joined by spaces>`.
- **Sender-side contract:** anything other than an array of `--`-prefixed strings is refused with `invalid_build_arguments` and nothing is emitted. The identity guard from 23-03 (`invalid_device`) still runs first.
- **Dependency removal:** the require is deleted, and `runShell` logs `[command, ...args].join(" ")`. package.json and package-lock.json each lose only the shell-escape entries (1 and 7 deleted lines, 0 added).
- **D-15:** the four dead `// lgtm [...]` markers in `getDirectories` (two), `cleanupDeviceRepositories` and `processShellData` are removed. The code on those lines is unchanged.
- **sanitka.js header:** now says the values reach git and the worker as argv elements, and that the allowlists also stop option injection. I checked that last claim: `branch("--upload-pack=x")` and `url("-oProxyCommand=x")` both return null.
- **D-02:** the parent gitlink `services/worker` moved from `f1c02c9` to `79611f6`. That is the 23-02 `plan_head_after`, and the worker tree is clean.

## Golden strings (captured from installed shell-escape 0.2.0 before removal)

All of these are literals in `BuilderRemoteJobSpec.js`, which does not depend on shell-escape at runtime.

| Input (after `./builder`) | Output |
|---|---|
| `--dry-run` | `'./builder' --dry-run` |
| `--env=[]`, `--branch=feature/x` | `'./builder' '--env=[]' '--branch=feature/x'` |
| `--git=git@github.com:owner/repo.git`, `--env={"KEY":"a b"}` | `'./builder' '--git=git@github.com:owner/repo.git' '--env={"KEY":"a b"}'` |
| `--env={"Q":"it's"}` | `'./builder' '--env={"Q":"it'\''s"}'` |
| `--env={"A":"''","B":"x\\y"}` | `'./builder' '--env={"A":"'\'\''","B":"x\\y"}'` |
| `'lead`, `trail'` | `'./builder' \''lead' 'trail'\'` |
| empty string | `'./builder' ` (trailing space; this quirk is kept on purpose) |
| realistic run_build list (64-hex owner, UUID udid/id, fcid, mac, https git, branch, workdir, `--dry-run`) | every `--x=` element single-quoted, `--dry-run` bare (full literal in spec) |

The four golden cases listed in the plan context matched exactly. The last three rows are extra edge cases for the collapse rules.

## Task Commits

1. **Task 1 (tracer): argv plus byte-identical legacy cmd.** `feab959f` (feat)
2. **Task 2: shell-escape removal and lgtm markers.** `f67efc11` (chore)
3. **Task 2: worker submodule pointer bump.** `863cab84` (chore)

All three are GPG-signed (`G`). Nothing was pushed.

## Spec-first evidence (RED before GREEN)

- The first run of BuilderRemoteJobSpec had 18 specs and 16 failures, all on the intended behaviour:
  - 8 `legacyShellCommand is not a function`
  - 5 refusal cases where a job was still emitted
  - 3 job-shape cases where `argv` was undefined
- The two passing specs were the 23-03 `invalid_device` guard and `secret null`. Both passed before the change too.

## Verification

- Task 1 `<verify>` (BuilderRemoteJob, BuilderPath, SafePath, Git): 112 specs, 0 failures, **SPECS-GREEN**. The tracer gate re-ran it after the commit and it was still green.
- Task 1 grep gate: `argv=1 call=1`, `node --check` OK, **JOB-ARGV-WIRED**. `legacyShellCommand(` count 2, `"invalid_build_arguments"` count 1.
- Task 2 gates:
  - **DEP-GONE**: `git_grep_rc=1`
  - **POINTER-BUMPED**: `lgtm=0 gitlink=79611f628e7b7b00ebcc2c07732b869a7e6b7ac8 worker_head=79611f628e7b7b00ebcc2c07732b869a7e6b7ac8`
  - `git status --porcelain -- services/worker` is empty
- Task 2 specs (+ SanitkaSpec): 170 specs, 0 failures, **SPECS-GREEN**.
- `git show --numstat f67efc11`: `0 7 package-lock.json`, `0 1 package.json`, so the lockfile change is deletion-only.
- `node -e "require('./package.json').dependencies['shell-escape'] === undefined || process.exit(1)"` exits 0. `chai-http` is still `^4.3.0`.
- Suppression gate: `git diff 297ee357 -- lib` exited 0 (1733 lines). Added lines matching `lgtm|codeql[|nosemgrep|deepcode ignore|eslint-disable`: 0.
- eslint is clean on builder.js, sanitka.js and both specs.
- Old-worker simulation: an emitted `cmd` went through the old worker's `split(" ").join(" ")` and then `/bin/sh` against a fake `./builder` that prints its argv. It reproduced the exact argv, including `--env={"KEY":"a b","Q":"it's"}` (OLD-WORKER-PARSE-OK).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] BuilderPathSpec's runRemoteShell cases passed command strings**
- **Found during:** Task 1
- **Issue:** The three 23-03 cases called `runRemoteShell(worker, "./builder…", …)`. Under the new signature, the valid-device case would be refused with `invalid_build_arguments` instead of emitting a job.
- **Fix:** They now pass argument arrays (`["--owner=x"]`, `["--dry-run"]`). Their assertions are unchanged.
- **Files modified:** spec/jasmine/BuilderPathSpec.js
- **Commit:** feab959f

**2. [Process] The legacyShellCommand comment avoids the literal package name**
- **Found during:** Task 2
- **Issue:** The DEP-GONE gate greps lib/ for `shell-escape`, and my Task 1 comment named the package.
- **Fix:** The comment now says "the escaping package it replaces (v0.2.0, removed in Phase 23)" and points to the golden spec. That spec keeps the exact name.
- **Commit:** f67efc11

**3. [Process] The pointer bump is its own commit**
- The plan allowed this. Keeping it separate lets the dependency removal and the pointer bump be reverted independently.

**4. [Scope - Tests] Extra spec cases**
- Three extra golden edge cases (adjacent quotes, leading/trailing quote, empty element).
- A mutation-after-emit case, which shows argv is a copy.
- Five `invalid_build_arguments` shapes.

**Total deviations:** 1 auto-fixed (Rule 3), 3 process/scope notes. **Impact:** the wire contract is exactly as planned, and nothing changed outside the plan's file list apart from the existing BuilderPathSpec call sites.

## Deferred / Notes

- `scripts/test-shell-safety.js` (outside lib/, and not run by CI or jasmine) still does `try { require("shell-escape") } catch { fallback }`. It keeps working through its own built-in fallback once `node_modules` is rebuilt without the package, and it was not changed. It also still exercises the pre-23-01 command-string builders, so it may be stale as a whole. It is a cleanup candidate.
- The local `node_modules/shell-escape` directory is still on disk because only the lockfile was updated (`--package-lock-only`). The image is built from the lockfile, so it will not contain the package.
- `IMPROVEMENTS.md` and `.planning/` docs still mention shell-escape as history. They were left as they are, per the plan.
- 23-05 must push `services/worker` main (4 commits ahead of origin) **before** the parent, because parent CI runs `git submodule update --init --recursive` and needs `79611f6` to exist on the remote.
- Allowlist coupling (A-23-02-1) now applies on both sides: a new builder flag needs an `ALLOWED_ARGV_FLAGS` release in the worker first, and it must start with `--`.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or trust boundary was added. T-23-30..T-23-33 are mitigated as the plan describes, and T-23-SC was an uninstall only, with nothing fetched.

## Next Phase Readiness

Ready for 23-05: push the worker, then the parent, then deploy the ordered API and worker rollout and run the production proof.

## Self-Check: PASSED

- FOUND: spec/jasmine/BuilderRemoteJobSpec.js, lib/thinx/builder.js, lib/thinx/sanitka.js, package.json, package-lock.json
- FOUND commits: feab959f, f67efc11, 863cab84 (all `G`)
- Measured commits a07e8aab..863cab84 = 3
