---
phase: quick-261004-ou3
plan: 01
subsystem: builders
tags: [builders, platformio, arduino, environment-header, set-e, path-traversal, busybox, tdd]
status: complete

requires:
  - phase: quick-261004-n65
    provides: "thinx_yml_load (environment_target) and the tests/ harness pattern"
  - phase: quick-261004-om7
    provides: "arduino master at 5d15914 (arduino_install_libs), built on top"
provides:
  - "env_header_target WORKSPACE TARGET / env_header_generate WORKSPACE ENVFILE TARGET [SKIPKEY...] in platformio and arduino cmd.sh (byte-identical)"
  - "arduino env_cflags ENVFILE: cflags reach CFLAGS whether or not a header is written"
  - "tests/env-header.sh per repo (plain sh + jq), wired into CI"
affects: [builders/platformio-docker-build image, builders/arduino-docker-build image, parent gitlinks (to bump)]

actuals:
  tokens: 12357   # chars/4 over the realized diffs (platformio 21111 + arduino 28319 chars)
  tasks: 2
  commits: 4      # measured: platformio rev-list --count 5cdabaf..HEAD = 2, arduino 5d15914..HEAD = 2
plan_head_before:
  platformio-docker-build: 5cdabafae4fd67276ed39ab0e8682e3c64aa243b
  arduino-docker-build: 5d15914d2f3275b2bcff3e23f55c1c490872e00b
plan_head_after:
  platformio-docker-build: a8c35d987e54bcfc169f0bd04a844b6726db5072
  arduino-docker-build: 976b5d60784921cbf9af87b927d2d164210d3847

tech-stack:
  added: []
  patterns:
    - "Repository-supplied paths are resolved physically (cd -P / pwd -P) and must stay under the workspace; absolute, '..', symlink and non-regular targets are refused, not followed"
    - "Optional build inputs skip with one log line instead of failing under set -e"
    - "environment.json is turned into a header by a single jq --arg program; jq stderr is dropped because it can quote the input"

key-files:
  created:
    - builders/platformio-docker-build/tests/env-header.sh
    - builders/arduino-docker-build/tests/env-header.sh
  modified:
    - builders/platformio-docker-build/cmd.sh
    - builders/platformio-docker-build/.circleci/config.yml
    - builders/platformio-docker-build/README.md
    - builders/arduino-docker-build/cmd.sh
    - builders/arduino-docker-build/.circleci/config.yml
    - builders/arduino-docker-build/CHANGELOG.md
    - builders/arduino-docker-build/CLAUDE.md
    - builders/arduino-docker-build/README.md

key-decisions:
  - "Header target order: environment: target: (resolved under the workspace) wins; else the first regular environment.h under the workspace, with build/ and .pio/ pruned; else skip with one log line and return 0. A refused target skips; it does not fall back to an environment.h."
  - "Refused: absolute path, any '..' component, no file name (., src/, src/.), a directory that does not exist (it is not created), a directory that resolves outside the workspace through a symlink, a target that is a symlink, a target that exists and is not a regular file. A found environment.h must be a regular file (find -type f), so a symlink named environment.h is never followed."
  - "The workspace is a variable in the call line (platformio WORKSPACE=/opt/workspace, arduino the existing WORKDIR=/opt/workspace) so the test can run the real call line on a temp workspace. platformio's old ENVOUT used ${WORKDIR}, which is unset in that image; that target was never honoured anyway because the next line overwrote it."
  - "Header writing is one jq --arg program (sorted keys, ascii_upcase, value | tojson) instead of jq '.'$keyname per key. For scalar values the output is byte-identical to the old loops (checked, platformio and arduino skip sets). Keys outside [A-Za-z0-9_] are skipped and named (JSON-encoded) in the log; the old code ran them as jq filter text. A non-object environment.json gives a header with only the comment line."
  - "arduino cflags moved out of the header loop into env_cflags so they still reach CFLAGS when the header is skipped or refused."
  - "New test files rather than extending thinx-yml-loader.sh; one CI step each (platformio test-esp8266, arduino build-chain-test). No Dockerfile change: tests/ is already copied to /opt/tests and chmod +x'd."
  - "Commits on main (platformio) and master (arduino) under the operator's standing instruction; nothing pushed."

requirements-completed: []

duration: 25min
completed: 2026-10-04
---

# Quick 261004-ou3: builder env header target never empty

**When there is no environment target and no environment.h, the platformio and arduino builders now skip the per-device environment header with one log line and continue the build. Before, platformio failed it with `touch: missing file operand` (production build 0a812dc0, thinx-autoflood), and arduino silently wrote nothing. `environment: target:` is now actually honoured, resolved under the workspace, and an absolute, `..`, symlink or outside-workspace target is refused.**

## Commits (NOT pushed)

| Repo (branch) | Hash | Type | Message |
|---|---|---|---|
| platformio-docker-build (main) | 17b29c8 | test | failing test, empty environment header target fails the build |
| platformio-docker-build (main) | a8c35d9 | fix | skip the environment header when there is no target |
| arduino-docker-build (master, on om7 5d15914) | cb4caa3 | test | failing test, environment header target can be empty |
| arduino-docker-build (master) | 976b5d6 | fix | never write the environment header to an empty path |

Nothing was touched in the parent repo, services/worker, micropython-docker-build or any other submodule. The two gitlinks in the parent show as modified and need bumping.

## Root cause

Both cmd.sh files set `ENVOUT="${WORKDIR}/${environment_target}"` from thinx.yml, then unconditionally overwrote it with `ENVOUT=$(find /opt/workspace -name environment.h | head -n 1)`, and ran `touch ${ENVOUT}` and `> ${ENVOUT}` unquoted. When a repository has neither, ENVOUT is empty:
- **platformio**, under `set -e`: `touch: missing file operand`, exit 1, which is the production failure.
- **arduino**, under `set +e` at that point: `touch` fails, followed by one `ambiguous redirect` per key. No header is written and the build goes on.

In both images, `environment: target:` was never used.

## What changed

**cmd.sh, both repos.** The functions are byte-identical between the two repos; this was checked with `diff`.
- **`env_header_target WORKSPACE TARGET`** sets `ENVOUT` or leaves it empty. It prints one line whenever it skips:
  - `Refusing environment target '<t>' (<reason>); per-device environment header skipped.`
  - `No environment target in thinx.yml and no environment.h in the workspace; per-device environment header skipped.`
- **`env_header_generate WORKSPACE ENVFILE TARGET [SKIPKEY...]`** does the following:
  - without ENVFILE, it prints `No environment.json found`, as before;
  - otherwise it resolves the target and writes the header with one jq program;
  - it names skipped keys in the log;
  - it never prints values or jq's stderr;
  - it always returns 0.
- Call lines:
  - platformio: `env_header_generate "$WORKSPACE" "$ENVFILE" "${environment_target}" CPASS CSSID`
  - arduino: `env_header_generate "$WORKDIR" "$ENVFILE" "${environment_target}" cflags`, then `env_cflags "$ENVFILE"`.
- Every ENVOUT expansion is quoted, and no `touch` remains.
- The arduino yml section prints `- environment target: <t>` instead of the old (dead) `- ENVOUT: …`. The old `Touching file at` line is gone.

**Docs:**
- platformio README: a paragraph under the thinx.yml example.
- arduino: README "Environment support", a CHANGELOG 0.8.222 entry, and a CLAUDE.md convention.

**tests/env-header.sh in each repo** (31 platformio cases, 32 arduino cases). The test extracts cmd.sh's top-level functions and its load and generate call lines, then runs them in a subshell with `set -e` on temp workspaces.

Wiring checks:
- both functions exist;
- the call line passes `"$ENVFILE"` and `environment_target`;
- there is no `ENVOUT=$(find` and no `touch $…`;
- no unquoted `$ENVOUT`;
- arduino only: `cflags` is skipped from the header and `env_cflags "$ENVFILE"` exists.

Cases:
- **(a) Skipped:** no target and no environment.h. This is also checked with the thinx-autoflood layout loaded through thinx_yml_load, with environment.h only under build/ and .pio/, and with a symlinked environment.h.
- **(b) Target wins:** `src/env.h` is written while a root environment.h stays untouched. Also covered: the firmware-esp8266-pio layout loaded through thinx.yml, an existing target being rewritten, a target in the root, and a missing target directory (refused, not created).
- **(c) environment.h:** src/environment.h is rewritten, and the ones under build/ and .pio/ stay untouched.
- **(d) Refused targets:** `../outside/env.h`, `src/../../outside/env.h`, `src/..`, `..`, `src/`, `src/.`, `/etc/x`, an absolute path into an existing dir, a symlinked dir that escapes the workspace, a target that is a symlink, and a target that is a directory.
- **Other inputs:** no environment.json, three invalid or non-object environment.json files (these must not leak values through jq errors), and key names logged.
- **Every case checks:**
  - exit status 0;
  - no `VALUE-MARKER` value in stdout or stderr;
  - the header equals the expected text exactly;
  - no other `.h` file was created or changed;
  - arduino only: CFLAGS equals the expected cflags, including when the header is skipped or refused.

## Commands and results

| Command | Result |
|---|---|
| RED: `sh tests/env-header.sh` at the test commit (old cmd.sh). Also `CMD_SH=<old> /usr/local/bin/bash …` and busybox (`dhi.io/node:26-alpine3.24-dev` + `apk add jq`) | platformio **30 of 31 fail**, arduino **31 of 32 fail**, the same in all three shells. The only passing case is "missing target directory is not created". Most failures come from the missing functions and call line (the old code has no testable unit); the behavioural RED is the e2e row below. |
| GREEN `/tmp/ou3/run-matrix.sh <repo> env-header`: macOS `/bin/sh` (bash 3.2 sh-mode), `/usr/local/bin/bash` 5.2, bash 5.2 + gawk, `/bin/bash` 3.2.57, `dhi.io/debian-base:trixie-dev` bash 5.2 + mawk + jq 1.8.2 (apt), the same image via the shebang (`/bin/sh` → bash, as CI runs `/opt/tests/…`), `dhi.io/node:26-alpine3.24-dev` **busybox sh + busybox awk/find (no bash)** + jq 1.8.2 (apk) | platformio **31/31** and arduino **32/32** in all 7 environments. Locally, jq is 1.7.1. |
| Regression `/tmp/ou3/run-matrix.sh <repo> thinx-yml-loader`, same 7 environments | platformio **26/26**, arduino **39/39** in all 7 |
| Header parity: old loop vs `env_header_generate` on a JSON with escaped quotes, a backslash, a tab, UTF-8, int, 1.50, a 20-digit number, true, null, 0, CPASS/CSSID/cflags | platformio skip set **identical** (11 lines), arduino skip set **identical** (12 lines) (`cmp`, jq 1.7.1) |
| E2E `/tmp/ou3/e2e/run-pio.sh`: real cmd.sh old vs new in `dhi.io/debian-base:trixie-dev`, stub `platformio`, environment.json with secret markers | thinx-autoflood layout: **old exit 1** (`Generating … to: ` / `touch: missing file operand`, the production log), **new exit 0** (skip line, `platformio run --environment d1_mini`, `THiNX BUILD SUCCESSFUL.`, firmware.bin copied). Target `src/environment.h` with no file yet: old exit 1, new exit 0 with the header written there. Secret markers in the log: 0 in all four runs. |
| E2E `/tmp/ou3/e2e/run-ard.sh`: real cmd.sh old vs new, stub arduino recording argv, stub Xvfb | dummy-esp8266 (build-chain fixture): header and `compiler.cpp.extra_flags=-DTHINX_SMOKE_CFLAG=1 -DTHINX_SMOKE_CFLAG2=2` argv **identical** old vs new. No target: old prints `touch: missing file operand` plus 3 `ambiguous redirect` and writes no header; new prints the skip line, cflags unchanged. Target `src/env.h`: old ignores it (same errors); new writes it. Secret markers in the log: 0 in all six runs. |
| `bash -n cmd.sh` (both), `sh -n tests/env-header.sh` | OK |
| CI YAML parsed with Ruby Psych | platformio test-esp8266 steps: loader test → **environment header test** → build. arduino build-chain-test: loader test → **environment header test** → build-chain → negative. |

No devsec or environment values were printed in any run. The test and e2e fixtures use marker strings, and the e2e output masks header values.

## Deviations from Plan

1. **[Rule 2] jq filter injection and value leaks via jq stderr.** The old loops ran `jq '.'$keyname`. A key from environment.json became jq program text, and a key like `a-b` errored (a hard failure under set -e in platformio). The rewrite does three things:
   - it uses one `jq --arg` program;
   - it skips and names keys outside `[A-Za-z0-9_]`;
   - it sends jq's stderr to /dev/null, because jq errors such as `string ("…") has no keys` quote the input.

   Scalar output is byte-identical. Nested objects and arrays are now one compact line; before, they were pretty-printed across lines, which broke the `#define`.
2. **[Rule 1] arduino cflags decoupled.** cflags were extracted inside the header loop. Skipping the header would otherwise have dropped them, so they moved to `env_cflags`. The dummy-esp8266 argv is unchanged.
3. **Symlink and missing-directory refusals go beyond the plan's "absolute and '..'".** A target directory is resolved with `cd -P`/`pwd -P` and must stay under the workspace. A symlink or non-regular target is refused, and a missing target directory is refused rather than created. A found environment.h must be a regular file, and build/ and .pio/ are pruned in both images. Before, only arduino pruned build/, and platformio pruned nothing.
4. **Test placement and CI.** These are new `tests/env-header.sh` files, not additions to thinx-yml-loader.sh, with one CI step each in the test commit. The platformio test has a `SKIP_KEYS` variable that only documents the skipped keys; the exact expected header is what enforces them.
5. **Variable for the workspace in platformio.** `WORKSPACE=/opt/workspace; cd "$WORKSPACE"` replaces `cd /opt/workspace`, so the test can run the real call line on a temp dir. platformio's inverted `if [[ -z "$WORKDIR" ]]; then cd $WORKDIR` block is pre-existing and was left alone.

No Dockerfile changes.

## Threat Flags

None new. The change narrows a surface. Before, a repository's `environment: target:` (had it been honoured), or the first `environment.h` find returned (including a symlink, or one under .pio/libdeps), decided where device values were written. Now only a regular file inside the workspace qualifies.

## Known Stubs

None.

## Open items

1. **Publishing:**
   - **platformio:** `deploy-docker-build` promotes `:latest` only on `master`. The work branch is `main`, and local `master` is 6 behind `origin/main`. Pushing `main` publishes only `:ci` (same as n65 open question 2).
   - **arduino:** the commits also need to land on `esp32` and `esp8266` (check that they are fast-forwards per the repo CLAUDE.md). arduino master is now 4 ahead of origin (om7 + ou3).
2. After the pushes, bump both gitlinks in the parent on `thinx-staging`. Then re-run the thinx-autoflood build for device 04ed1650 and confirm that `per-device environment header skipped` is followed by a successful build.
3. Pre-existing and untouched: arduino prints `Building with CFLAGS: <cflags>`, which is an environment.json value (compiler flags, not credentials).
4. **Behaviour to announce:** a repository with `environment: target:` now gets the header at that path. Before, it went to whichever `environment.h` find returned first, or nowhere. thinx-firmware-esp8266-pio points at its own `src/environment.h`, so nothing changes for it.

## Self-Check: PASSED

- FOUND: builders/platformio-docker-build/{cmd.sh,tests/env-header.sh,.circleci/config.yml,README.md}; builders/arduino-docker-build/{cmd.sh,tests/env-header.sh,.circleci/config.yml,CHANGELOG.md,CLAUDE.md,README.md}
- FOUND commits: platformio 17b29c8 and a8c35d9; arduino cb4caa3 and 976b5d6. `git rev-list --count` gives 2 and 2. No deletions in any commit. Both working trees are clean.
