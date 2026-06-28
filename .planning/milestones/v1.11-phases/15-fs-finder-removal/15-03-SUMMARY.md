---
phase: 15-fs-finder-removal
plan: "03"
subsystem: builder, platform, arduino-plugin
tags: [refactor, fs-finder, sync-walk, builder, platform, arduino]
dependency_graph:
  requires:
    - lib/thinx/finder.js  # provided by plan 01
  provides:
    - lib/thinx/builder.js (finder-free)
    - lib/thinx/platform.js (finder-free)
    - lib/thinx/plugins/arduino/plugin.js (finder-free)
  affects:
    - spec/jasmine/XBuilderSpec.js
    - spec/jasmine/PlatformSpec.js
    - spec/jasmine/PluginSpec.js
tech_stack:
  added: []
  patterns:
    - findFilesSync(root, mask, recursive) replacing all finder.from/finder.in call sites
    - Non-recursive (false) for cleanupSecrets file removal in builder.js
    - Recursive (true) for header-file search in builder.js and thinx.yml in platform.js
    - Recursive (true) with glob mask for *.ino detection in arduino plugin
key_files:
  created: []
  modified:
    - lib/thinx/builder.js
    - lib/thinx/platform.js
    - lib/thinx/plugins/arduino/plugin.js
    - spec/jasmine/XBuilderSpec.js
    - spec/jasmine/PlatformSpec.js
    - spec/jasmine/PluginSpec.js
decisions:
  - builder.js:837 uses recursive=true (was finder.from) for HEADER_FILE_NAME search across build tree
  - builder.js:943/949/955 use recursive=false (was finder.in) for cleanupSecrets — only top-level of cpath
  - platform.js:47 uses recursive=true (was finder.from) for thinx.yml search in repo checkout
  - arduino/plugin.js:15 uses recursive=true (was finder.from) with *.ino glob mask
  - require path in arduino/plugin.js is ../../finder (two levels up from lib/thinx/plugins/arduino/)
  - XBuilderSpec finder tests are in a separate self-contained describe block (no Redis dependency)
  - Full jasmine suite requires Docker config.json so behavior verified via direct Node.js execution
metrics:
  duration: "480s"
  completed: "2026-06-06T00:00:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 6
---

# Phase 15 Plan 03: builder.js / platform.js / arduino plugin fs-finder Sweep Summary

**One-liner:** Replaced all 6 remaining fs-finder call sites in builder.js (4 sites), platform.js (1 site), and arduino plugin.js (1 site) with findFilesSync from lib/thinx/finder.js; locked behavior with new assertions in XBuilderSpec, PlatformSpec, and PluginSpec.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace fs-finder in builder.js (4 call sites) | 4b662541 | lib/thinx/builder.js |
| 2 | Replace fs-finder in platform.js and arduino plugin.js | ce749352 | lib/thinx/platform.js, lib/thinx/plugins/arduino/plugin.js |
| 3 | Extend XBuilderSpec, PlatformSpec, PluginSpec with finder assertions | 715faf71 | spec/jasmine/XBuilderSpec.js, spec/jasmine/PlatformSpec.js, spec/jasmine/PluginSpec.js |

## What Was Built

### builder.js (4 call sites replaced)

Removed `const finder = require("fs-finder");` (line 17). Added `const { findFilesSync } = require('./finder');` in its place.

- `builder.js:837` — `finder.from(XBUILD_PATH).findFiles(HEADER_FILE_NAME)` → `findFilesSync(XBUILD_PATH, HEADER_FILE_NAME, true)` (recursive: searching the entire build tree for the firmware header file)
- `builder.js:943` — `finder.in(cpath).findFiles("environment.json")` → `findFilesSync(cpath, "environment.json", false)` (non-recursive: cleanupSecrets removes only top-level secrets)
- `builder.js:949` — `finder.in(cpath).findFiles("environment.h")` → `findFilesSync(cpath, "environment.h", false)` (non-recursive)
- `builder.js:955` — `finder.in(cpath).findFiles("thinx.yml")` → `findFilesSync(cpath, "thinx.yml", false)` (non-recursive)

### platform.js (1 call site replaced)

Removed `var finder = require("fs-finder");` (line 1). Added `const { findFilesSync } = require('./finder');` as the new first line.

- `platform.js:47` — `finder.from(local_path).findFiles('thinx.yml')` → `findFilesSync(local_path, 'thinx.yml', true)` (recursive: thinx.yml may be in any subdir of the checked-out repo)

### plugins/arduino/plugin.js (1 call site replaced)

Removed `var finder = require("fs-finder");` (line 7). Added `const { findFilesSync } = require('../../finder');` (two levels up from `lib/thinx/plugins/arduino/`).

- `plugin.js:15` — `finder.from(path).findFiles('*.ino')` → `findFilesSync(path, '*.ino', true)` (recursive: *.ino glob finds Arduino source files anywhere in the repo tree, excluding /lib/ paths in downstream filter)

### Spec extensions

**XBuilderSpec.js** — new `describe("Builder finder helpers")` block (self-contained, no Redis):
- Case A1: `findFilesSync(root, 'environment.json', false)` returns exactly 1 result (root-level only, not subdir)
- Case A2: `findFilesSync(root, 'environment.h', false)` returns exactly 1 result
- Case A3: `findFilesSync(root, 'thinx.yml', false)` returns exactly 1 result
- Case B: `findFilesSync(root, 'myheader.h', true)` finds file in `src/` subdirectory

**PlatformSpec.js** — new it() case:
- Case C: `getPlatformFromPath(root)` with `root/sub/thinx.yml` returns non-null (proves recursive path in production code)

**PluginSpec.js** — new it() case inside existing describe("Plugins"):
- Case D: `manager.plugins.arduino.check('./spec/test_repositories/arduino')` returns `'arduino'` (proves *.ino glob replacement works end-to-end; the test repo has `src/src.ino`)

## Verification Results

1. `grep -rE "require.*fs-finder|finder\.(in|from|findFiles|findDirectories|showSystem)" lib/thinx/builder.js lib/thinx/platform.js lib/thinx/plugins/arduino/plugin.js` → 0 matches (PASS)
2. findFilesSync call counts: builder.js=4, platform.js=1, arduino/plugin.js=1 (PASS)
3. Require counts per file: each has exactly 1 `require.*finder` pointing to lib/thinx/finder.js (PASS)
4. Direct Node.js execution of all new spec logic (Cases A1–A3, B, C, D) → all assertions PASSED
   - Full jasmine suite requires Docker environment config.json; not available in dev execution context (same constraint as Plans 01 and 02)

## Deviations from Plan

None — plan executed exactly as written. All recursive/non-recursive flags applied per the critical reminders and plan interface spec.

## Known Stubs

None — all call sites fully replaced with production-correct behavior.

## Threat Flags

No new threat surface introduced. All threats are accepted per the plan's threat model:
- T-15-04 (Tampering, XBUILD_PATH recursive walk): accepted — same surface as existing fs-finder call
- T-15-05 (Information Disclosure, cleanupSecrets path discovery): accepted — findFilesSync discovers paths, does not read file contents
- T-15-06 (Tampering, arduino require path traversal): accepted — resolved at server startup, no external input angle
- T-15-SC: no new packages installed

## Self-Check: PASSED

| Item | Status |
|------|--------|
| lib/thinx/builder.js modified (no fs-finder) | FOUND — 4b662541 |
| lib/thinx/platform.js modified (no fs-finder) | FOUND — ce749352 |
| lib/thinx/plugins/arduino/plugin.js modified (no fs-finder) | FOUND — ce749352 |
| spec/jasmine/XBuilderSpec.js extended | FOUND — 715faf71 |
| spec/jasmine/PlatformSpec.js extended | FOUND — 715faf71 |
| spec/jasmine/PluginSpec.js extended | FOUND — 715faf71 |
| Commit 4b662541 (Task 1) | FOUND |
| Commit ce749352 (Task 2) | FOUND |
| Commit 715faf71 (Task 3) | FOUND |
