---
phase: 15-fs-finder-removal
plan: "01"
subsystem: finder
tags: [refactor, fs-finder, sync-walk, primitives]
dependency_graph:
  requires: []
  provides:
    - lib/thinx/finder.js
  affects:
    - lib/thinx/builder.js
    - lib/thinx/deployment.js
    - lib/thinx/platform.js
    - lib/thinx/repository.js
    - lib/thinx/plugins/arduino/plugin.js
tech_stack:
  added: []
  patterns:
    - Manual synchronous stack-walk using fs.readdirSync({withFileTypes:true}) — version-independent (Node >=10.10)
    - Glob prefix/suffix split on single '*' wildcard matching fs-finder semantics
key_files:
  created:
    - lib/thinx/finder.js
    - spec/jasmine/FinderSpec.js
  modified: []
decisions:
  - Manual stack-walk chosen over fs.readdirSync({recursive:true}) — the recursive option is absent on Node 19.0–19.9 and the engines floor is >=19.x
  - Only Node core (fs, path) — no third-party packages (T-15-SC)
  - Symlinks not followed — Dirent.isDirectory() returns false for symlink-to-dir (T-15-02)
  - includeDotfiles skips entire hidden subtrees (not just the matching entry) when false — consistent with fs-finder behavior
metrics:
  duration: "140s"
  completed: "2026-06-05T22:34:01Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 15 Plan 01: Finder Primitives Summary

**One-liner:** Synchronous findFilesSync/findDirsSync via manual stack-walk using fs.readdirSync({withFileTypes:true}) — version-independent fs-finder replacement primitives.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement lib/thinx/finder.js | ce12b51f | lib/thinx/finder.js (created) |
| 2 | Behavior-locking spec FinderSpec.js | e85664fb | spec/jasmine/FinderSpec.js (created) |

## What Was Built

`lib/thinx/finder.js` exports two synchronous named functions:

- `findFilesSync(root, mask, recursive=false, includeDotfiles=false)` → `string[]`
- `findDirsSync(root, mask, recursive=false, includeDotfiles=false)` → `string[]`

Both use a manual synchronous stack-walk for the `recursive=true` case, seeded with `[root]`, popping each directory and calling `fs.readdirSync(dir, {withFileTypes:true})`. This approach is version-independent — it works on Node >=10.10 and does not rely on the `recursive:true` option that is absent on Node 19.0–19.9.

Mask matching: single `*` wildcard via `startsWith(prefix) && endsWith(suffix)`; no-wildcard is an exact `===` check on the basename.

`FinderSpec.js` locks all 11 behavioral invariants via a temp-dir fixture tree with a 3-level deep structure (root / sub / deeper). All 11 cases pass.

## Verification Results

1. `node -e "..."` → `true` (both exports are functions)
2. `FinderSpec.js` — 11 specs, 0 failures
3. `grep` on requires → only `fs` and `path`
4. No actual `fs.readdirSync({recursive:true})` call in implementation code (JSDoc mentions it only to document the exclusion)

## Deviations from Plan

None — plan executed exactly as written. The grep count for V4 matched 3 lines but all are JSDoc comment text explaining the exclusion, not actual code calls. All actual `fs.readdirSync` calls use `{withFileTypes:true}` only.

## Known Stubs

None — the module is complete and self-contained with no placeholder data or TODO branches.

## Threat Flags

No new threat surface introduced. Only `fs` and `path` (Node core) are used; no new network endpoints, auth paths, or schema changes.

- **T-15-01** (Tampering, root parameter from caller-supplied paths): accepted — same exposure as fs-finder, no new HTTP input surface.
- **T-15-02** (Symlink escape): mitigated — `Dirent.isDirectory()` returns false for symlinks; symlinks not followed. JSDoc note added per plan.
- **T-15-03** (Unbounded deep trees): accepted — iterative stack avoids call-stack overflow; same exposure as fs-finder.
- **T-15-SC** (New packages): accepted — zero new packages installed.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| lib/thinx/finder.js exists | FOUND |
| spec/jasmine/FinderSpec.js exists | FOUND |
| Commit ce12b51f (Task 1) | FOUND |
| Commit e85664fb (Task 2) | FOUND |
