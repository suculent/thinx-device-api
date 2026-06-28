---
phase: 15-fs-finder-removal
plan: "02"
subsystem: deployment, repository
tags: [refactor, fs-finder, findFilesSync, findDirsSync, call-site-sweep]
dependency_graph:
  requires:
    - lib/thinx/finder.js (from 15-01)
  provides:
    - lib/thinx/deployment.js (fs-finder removed)
    - lib/thinx/repository.js (fs-finder removed)
    - spec/jasmine/DeploymentSpec.js (Cases A, B)
    - spec/jasmine/RepositorySpec.js (Cases C, C2)
  affects:
    - deployment.latestFirmwarePath
    - deployment.latestFirmwareArtifact
    - repository.findAllRepositories
tech_stack:
  added: []
  patterns:
    - findFilesSync(root, mask, recursive=false) for non-recursive file search
    - findDirsSync(root, mask, recursive=true, includeDotfiles=true) for dotfile-aware recursive dir search
    - Singleton mutation pattern for app_config in Case C2 (save/restore in try/finally)
key_files:
  created: []
  modified:
    - lib/thinx/deployment.js
    - lib/thinx/repository.js
    - spec/jasmine/DeploymentSpec.js
    - spec/jasmine/RepositorySpec.js
decisions:
  - deployment.js imports only findFilesSync (not findDirsSync) — minimal import surface
  - repository.js imports only findDirsSync — minimal import surface
  - includeDotfiles=true (4th arg) is mandatory for repository.js — replicates showSystemFiles()
  - Case C2 mutates Globals app_config singleton directly (same object repository.js holds); restored in try/finally
metrics:
  duration: "240s"
  completed: "2026-06-06T00:00:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 4
---

# Phase 15 Plan 02: Call-Site Sweep — deployment.js + repository.js Summary

**One-liner:** Replaced all fs-finder call sites in deployment.js (2 sites) and repository.js (1 site + dotfile flag) with findFilesSync/findDirsSync from lib/thinx/finder.js; extended DeploymentSpec and RepositorySpec with 4 behavior-locking cases (A, B, C, C2).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace fs-finder in deployment.js | 257953f9 | lib/thinx/deployment.js |
| 2 | Replace fs-finder in repository.js | 69df271d | lib/thinx/repository.js |
| 3 | Behavior-locking spec extensions | dfdfd8cb | spec/jasmine/DeploymentSpec.js, spec/jasmine/RepositorySpec.js |

## What Was Built

### deployment.js
- Removed `var finder = require("fs-finder");` (line 10)
- Added `const { findFilesSync } = require('./finder');`
- Line 301: `finder.in(dpath).findFiles(extension)` → `findFilesSync(dpath, extension, false)` (non-recursive; inside for-loop over supported extensions)
- Line 315: `finder.in(dpath).findFiles("*.zip")` → `findFilesSync(dpath, "*.zip", false)` (non-recursive; latestFirmwareArtifact method)

### repository.js
- Removed `var finder = require("fs-finder");` (line 7)
- Added `const { findDirsSync } = require('./finder');`
- Line 29: `finder.from(repositories_path).showSystemFiles().findDirectories(".git")` → `findDirsSync(repositories_path, ".git", true, true)` — recursive=true, includeDotfiles=true (the fourth `true` replicates showSystemFiles() — MANDATORY or repo scan silently returns 0)

### Spec Extensions

**DeploymentSpec.js (Cases A, B):**
- Case A: `findFilesSync non-recursive: does not descend subdirs` — temp-dir fixture with root-level file + nested subdir file; asserts only root-level file returned (length=1, absolute path)
- Case B: `findFilesSync returns [] for nonexistent path without throwing` — asserts empty array returned

**RepositorySpec.js (Cases C, C2):**
- Case C: `findDirsSync finds .git directories including dotfiles` — temp-dir with `myrepo/.git`; direct findDirsSync call with includeDotfiles=true; asserts length>=1 and path ends with `/.git`
- Case C2: `Repository.findAllRepositories returns .git paths (dotfile flag survives into production)` — temp-dir with `myrepo/.git`; temporarily sets `app_config.data_root = tmpRoot, app_config.build_root = ''` via Globals singleton; calls `Repository.findAllRepositories()` directly; asserts length>=1 and at least one entry ends with `/.git`; restores app_config values in try/finally. This sub-case catches an accidental flip of includeDotfiles to false inside repository.js (a change that Case C alone would miss since C calls findDirsSync directly).

## Verification Results

1. `grep -rE "require.*fs-finder|finder\.(in|from|findFiles|findDirectories|showSystem)" deployment.js repository.js` → 0 matches (PASS)
2. `grep -c "require.*finder" deployment.js` → 1 (PASS)
3. `grep -c "require.*finder" repository.js` → 1 (PASS)
4. Logic for all 4 cases verified via direct Node.js execution (Cases A, B, C, C2 all produce expected results)
5. Full jasmine suite requires Docker environment (Redis + CouchDB) — CI validates at push time

## Deviations from Plan

None — plan executed exactly as written. All call sites replaced per the exact signatures specified. All spec cases added per the plan's Case A/B/C/C2 descriptions.

## Known Stubs

None — all production code paths are fully wired. The spec cases use real temp-dir fixtures with no placeholder data.

## Threat Flags

No new threat surface introduced. Changes are surgical call-site replacements within existing methods. Trust boundaries unchanged.

- **T-15-02a** (Information Disclosure, deployment.js dpath): accepted — dpath is constructed from Filez.deployPathForDevice(owner, udid); operator/server-side.
- **T-15-02b** (Information Disclosure, repository.js repositories_path): accepted — operator config (app_config.data_root + app_config.build_root).
- **T-15-03** (Tampering, includeDotfiles flag): mitigated — `findDirsSync(repositories_path, ".git", true, true)` has explicit positional fourth arg `true`; Case C2 proves it survives into the production static method.
- **T-15-SC** (New packages): accepted — no new packages.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| lib/thinx/deployment.js has no fs-finder | PASS (grep returns 0) |
| lib/thinx/repository.js has no fs-finder | PASS (grep returns 0) |
| deployment.js has require('./finder') | PASS (grep count=1) |
| repository.js has require('./finder') | PASS (grep count=1) |
| findDirsSync call has includeDotfiles=true | PASS (4th arg=true confirmed) |
| Commit 257953f9 (Task 1) | FOUND |
| Commit 69df271d (Task 2) | FOUND |
| Commit dfdfd8cb (Task 3) | FOUND |
| Cases A, B, C, C2 logic verified | PASS (direct node execution) |
