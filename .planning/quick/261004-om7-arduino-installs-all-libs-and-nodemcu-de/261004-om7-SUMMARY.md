---
phase: quick-261004-om7
plan: 01
subsystem: builders
tags: [builders, arduino, nodemcu, libs, circleci, argv-injection, busybox, tdd]
status: complete

requires:
  - phase: quick-261004-n65
    provides: "thinx_yml_load in builders/*/cmd.sh and tests/thinx-yml-loader.sh"
provides:
  - "arduino cmd.sh installs every arduino: libs: list item, in order, via arduino_install_libs (one quoted argv per name, charset-checked)"
  - "nodemcu CI: deploy-docker-build requires test-docker-build"
affects: [builders/arduino-docker-build image, builders/nodemcu-docker-build CI, parent gitlinks (to bump)]

actuals:
  tokens: 5076    # chars/4 over the realized diffs (arduino 19793 + nodemcu 512 chars)
  tasks: 2
  commits: 3      # measured: arduino rev-list --count 7841df0..HEAD = 2, nodemcu 711aa42..HEAD = 1
plan_head_before:
  arduino-docker-build: 7841df0d8b4a432b6b788d04725cdd26564a1125
  nodemcu-docker-build: 711aa42331d729d1d32e8cd20e03111efdbd7578
plan_head_after:
  arduino-docker-build: 5d15914d2f3275b2bcff3e23f55c1c490872e00b
  nodemcu-docker-build: ca2ab2f685fc59a4c6b929c5ee31155b52321ece

tech-stack:
  added: []
  patterns:
    - "Repository-supplied names reach a toolchain only as one quoted argv each, after a C-locale charset check; stdin of the tool is /dev/null"
    - "Install steps that tests must exercise are top-level POSIX-sh functions taking the tool binary as an argument (the test passes an argv-recording stub)"

key-files:
  modified:
    - builders/arduino-docker-build/cmd.sh
    - builders/arduino-docker-build/tests/thinx-yml-loader.sh
    - builders/arduino-docker-build/CHANGELOG.md
    - builders/arduino-docker-build/CLAUDE.md
    - builders/nodemcu-docker-build/.circleci/config.yml

key-decisions:
  - "The loader joins arduino_libs list items with a newline. A value can never contain its own newline because multi-line values are rejected, so the newline only ever separates items. Every other list, e.g. test:, still keeps its first item, as n65 had it. The awk program is unchanged and is still byte-identical between arduino and nodemcu (same sha1)."
  - "Charset: ^[A-Za-z0-9_][A-Za-z0-9 _.-]*(:[A-Za-z0-9._+-]+)?$ in LC_ALL=C, at most 128 chars, after trimming spaces and tabs around the name. This is the Arduino library-name spec (letters, digits, space, _ . -) plus the optional :version that `arduino --install-library name[:version]` accepts. It is narrower than the plan's example: @ and / are rejected because IDE 1.8 uses neither (@version is arduino-cli syntax). Comma is rejected because the IDE splits on it and would install a second library. A leading dash or space is also rejected."
  - "Scalar libs is one library: `libs: \"A B\"` installs the single name \"A B\" (plan must-have). Before, it was word-split into two installs. Names with spaces, such as Adafruit GFX Library, now work. This is a behaviour change and is recorded in CHANGELOG 0.8.221."
  - "The install loop became the top-level function arduino_install_libs ARDUINO. The binary is passed as an argument rather than read from an environment override. A failed install is logged and the loop moves on. An empty libs value still installs THiNX. A list of nothing but rejected names installs nothing and does not fall back to THiNX."
  - "cmd.sh runs `set -e` right after the install step. The old loop ran set -e inside its body and left it on, and the test-script step depends on that ('Breaks build in case of failure')."
  - "The install tests were added to tests/thinx-yml-loader.sh rather than a new file. That file already runs in arduino CI (build-chain-test, `docker run <image> /opt/tests/thinx-yml-loader.sh`), so no CI change was needed."
  - "Commits went to master in both builder repos, under the operator's standing instruction. Nothing was pushed."

requirements-completed: []

duration: 15min
completed: 2026-10-04
---

# Quick 261004-om7: arduino installs all libs; nodemcu deploy waits for tests

**The arduino build now installs every library listed under `arduino: libs:`, in order. The firmware example's WiFiManager is installed at last. Each name goes to `arduino --install-library` as one quoted argument, after a library-name charset check. nodemcu's CI no longer pushes `:latest` before its tests pass.**

## Commits (NOT pushed)

| Repo (branch) | Hash | Type | Message |
|---|---|---|---|
| arduino-docker-build (master) | 8735ed2 | test | failing test, a libs: list installs only its first library |
| arduino-docker-build (master) | 5d15914 | fix | install every library in a thinx.yml libs: list |
| nodemcu-docker-build (master) | ca2ab2f | ci | deploy-docker-build requires test-docker-build |

Nothing was touched or staged in the parent repo, services/worker, micropython or the other submodules. The arduino and nodemcu gitlinks in the parent now show as modified and need bumping.

## What changed

**arduino cmd.sh**
- `thinx_yml_load`, `arduino_libs` case arm: a list item is appended after a newline when the name is already set. Other names keep the n65 "first item" rule. The doc comment was updated to match. `thinx_yml_nl` is unset afterwards.
- New `arduino_install_libs ARDUINO`, written in plain POSIX sh. For each line of `${arduino_libs:-THiNX}` it:
  - trims surrounding blanks and skips empty lines;
  - applies the 128-character limit and the charset `grep -Eq` (C locale), printing `Skipping library '<name>': not a valid library name[:version]` for any name that fails;
  - runs `"$1" --install-library "$name" < /dev/null`, printing `Library <name> not installed (arduino exited N)` if that fails.
- Main body:
  - `echo "- libs: ${arduino_libs//$'\n'/, }"`
  - the default-and-`for lib in ${arduino_libs}` block is replaced by `arduino_install_libs /opt/arduino/arduino` followed by `set -e`.
- CHANGELOG 0.8.221, plus a CLAUDE.md convention: never go back to `for lib in ${arduino_libs}`.

**arduino tests/thinx-yml-loader.sh (26 → 39 cases)**
- The vars dump writes a newline inside a value as `<NL>`.
- Loader expectations:
  - every libs item is delivered: the 2-item list, a new 3-item list, the quoted items and the marker list;
  - a `test:` list still yields its first item.
- New install section. It runs the load step and then `arduino_install_libs` against a stub arduino in a subshell with `set -e`. The stub appends `argc|arg|arg` to a log, reads its stdin, and exits 1 for `FailingLib`. Cases:
  - 3 items → 3 calls, in order, `Adafruit GFX Library` as one argument;
  - the firmware example → ArduinoJSON + WiFiManager;
  - scalar → 1 call;
  - scalar with spaces → 1 argument;
  - `name:version`, blanks trimmed, and every allowed character;
  - no libs, and no thinx.yml → THiNX;
  - a failing install does not stop the next one, and the step returns 0;
  - 16 hostile names, with glob bait files in the cwd:
    - `$(…)`, backticks, `;`, `"); …; #`, `|`, `&`;
    - `*`, `?`, `[ab]`;
    - `--pref=…`, `-x`;
    - comma, `../../etc/passwd`, `/abs/path`, `user@lib`;
    - 129 chars.

    Only `Good` reaches the stub. There are 16 `Skipping library` lines and no PWNED marker.
  - only rejected names → no calls.

**nodemcu .circleci/config.yml**: `deploy-docker-build` now has `requires: [test-docker-build]`. The context and the `only: master` filter are unchanged. `test-docker-build` has no branch filter, so it always runs on master.

## Commands and results

| Command | Result |
|---|---|
| RED: `sh tests/thinx-yml-loader.sh` (macOS sh = bash 3.2) at 8735ed2 | **16 of 39 fail**: 4 loader cases (only the first libs item delivered), `cmd.sh defines arduino_install_libs`, and all 11 install cases (`arduino_install_libs: command not found`). The other 23 pass. |
| RED: same test against the old cmd.sh (`CMD_SH=`), under bash 5.2 and busybox (`dhi.io/node:26-alpine3.24-dev`) | **16 of 39 fail** in both |
| GREEN: `/tmp/om7/run-matrix.sh builders/arduino-docker-build` (n65's matrix plus one more row) | **39/39** in all 7 environments: macOS `/bin/sh` + BWK awk 20200816, `/usr/local/bin/bash` 5.2.37 + BWK awk, bash 5.2 + gawk 5.3.1, `/bin/bash` 3.2.57, `dhi.io/debian-base:trixie-dev` bash 5.2.37 + mawk 1.3.4, `dhi.io/node:26-alpine3.24-dev` **busybox sh + busybox awk (no bash)**, and debian-base `/bin/sh` (a symlink to bash there) run the way CI runs it (`/opt/tests/…` via the shebang) |
| Regression: `/tmp/om7/run-matrix.sh builders/nodemcu-docker-build` | **22/22** in all 7 environments (n65 loader tests unchanged and green) |
| `bash -n cmd.sh` (arduino) | OK |
| awk program sha1, arduino vs nodemcu cmd.sh | identical (`9f7c9d53…`) |
| E2E `/tmp/om7/e2e/run.sh`: the real cmd.sh, old (7841df0) and new, in `dhi.io/debian-base:trixie-dev`, with a stub `/opt/arduino/arduino` that records argv and a stub Xvfb | Firmware example `thinx.yml`: old runs `--install-library ArduinoJSON` only; new runs ArduinoJSON and then **WiFiManager**; `--verify` argv identical; exit 0 both. Hostile list (`$(touch /tmp/PWNED)`, `x; touch …`, `*`, `--pref=…`, plus two valid names): new installs ArduinoJSON and `Adafruit GFX Library` (one argument) and skips 4 with log lines; no marker in either. |
| Full cmd.sh stdout, old vs new, firmware example | differs only in `- libs: ArduinoJSON` → `- libs: ArduinoJSON, WiFiManager` and the added `Installing library WiFiManager...` line |
| nodemcu YAML: `circleci config validate` | CLI not installed. Parsed instead with Ruby Psych and PyYAML: `deploy-docker-build` → `{requires: [test-docker-build], context: [dockerhub], filters: {branches: {only: master}}}` |

No devsec values were printed. The fixtures carry no devsec values; the firmware example has none.

## Deviations from Plan

**1. Charset narrower than the plan's example.** The plan suggested `^[A-Za-z0-9 _.:@/+-]{1,128}$` and asked to check what `arduino --install-library` accepts. IDE 1.8's syntax is `name[:version][,name[:version]…]`, and library names follow the Arduino spec (letters, digits, space, `_ . -`). So the charset rejects `@` and `/`, which the IDE never uses. It also rejects a leading `-` or space, and comma, which the IDE treats as a list separator. Of the 16 hostile cases, `user@lib` and `/abs/path` are the two that the plan's regex would have allowed.

**2. The install tests went into the existing loader test file**, not a separate file. That keeps them under the CI step that already exists (`build-chain-test`), so the arduino CI config needs no change.

**3. [Rule 1] `< /dev/null` on the arduino call.** The list is fed to the loop through a here-document. Without the redirect, any child that read stdin would swallow the rest of the list. The test stub reads stdin to guard this.

No Dockerfile changes. The nodemcu cmd.sh, build_float and `build` CMD issues are untouched, as the plan required.

## Threat Flags

None new. The change narrows an existing surface: before, a libs value was word-split and glob-expanded into arduino's argv.

## Known Stubs

None.

## Open items

1. **Publishing (arduino):** pushing master redeploys only `:latest`. `esp32` and `esp8266` need the same commits; check `git ls-remote` that they are fast-forwards (repo CLAUDE.md).
2. **Behaviour change to announce:** a scalar `libs: "A B"` is now one library named `A B`. Repositories that relied on space-separated scalars must switch to a YAML list. None of the parent repo's fixtures or the bundled firmware examples do; they all use lists.
3. **nodemcu:** with `requires`, master builds the image twice in sequence (once in test, once in deploy), as before but no longer in parallel. Deploy wall time roughly doubles.
4. Bump both gitlinks in the parent on `thinx-staging` after the pushes, then do one real arduino build with the firmware example to confirm that WiFiManager installs from the library index.

## Self-Check: PASSED

- FOUND: builders/arduino-docker-build/{cmd.sh,tests/thinx-yml-loader.sh,CHANGELOG.md,CLAUDE.md}, builders/nodemcu-docker-build/.circleci/config.yml
- FOUND commits: arduino 8735ed2 and 5d15914; nodemcu ca2ab2f. `git rev-list --count` gives 2 and 1. No deletions in any commit. Both working trees are clean.
