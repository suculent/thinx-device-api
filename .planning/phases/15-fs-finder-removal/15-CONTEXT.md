# Phase 15: fs-finder Removal - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — infrastructure/refactor phase; implementation at Claude's discretion within the semantics-preservation constraints below.

<domain>
## Phase Boundary

Excise the internally-owned `fs-finder` fork (`github:suculent/Node-FsFinder#master`) from the runtime: replace all 12 call sites across 5 `lib/` modules with `fs-extra`/native `fs` equivalents that preserve behavior exactly, lock that behavior with a spec per touched module, then remove `fs-finder` from `package.json` `dependencies` so no source reference remains.

Covers requirements **REFACTOR-06** (call-site sweep + specs) and **REFACTOR-07** (dependency drop).

In scope: the 12 call sites + their specs + the `package.json` removal.
Out of scope: any unrelated refactor of the surrounding methods; touching `base/node_modules` (vendored, separate).

</domain>

<decisions>
## Implementation Decisions

### Replacement library choice (Claude's Discretion — planner to confirm)
- `fs-extra` (already a dependency, `^11.3.3`) does NOT provide glob/recursive-find; it is `fs` + extras (copy, ensureDir, etc.). The realistic replacement tool is **native `fs`** — `fs.readdirSync` with `{ recursive: true }` for the recursive (`.from`) cases (Node ≥ 18.17) or a small recursive helper, and plain `fs.readdirSync` for the non-recursive (`.in`) cases. Planner should confirm the project's Node engine supports `recursive: true`; if not, use a tiny sync recursive-walk helper.
- Prefer a single small shared helper (e.g. `lib/thinx/utils` or a local function) over duplicating walk logic across 5 files, IF it does not complicate the diff disproportionately. Planner's call.

### Behavior-preservation constraints (NON-NEGOTIABLE)
- **Synchronous contract:** every call site is synchronous (`var files = finder.in(...).findFiles(...)`) and the return value is used inline. Replacements MUST stay synchronous and return the same shape (an **array of absolute file/dir paths**). Do NOT convert these to async/promise-returning — that would silently break every caller's control flow.
- **`.in()` = non-recursive** (single directory level only). **`.from()` = recursive** (descend all subdirectories). Preserve this distinction per call site exactly (see code_context mapping).
- **`findFiles(mask)`** matches files; **`findDirectories(mask)`** matches directories. Masks include exact names (`thinx.yml`, `environment.json`, `environment.h`, `.git`) and globs (`*.zip`, `*.ino`, plus a runtime `extension` variable and `HEADER_FILE_NAME`). The `*` wildcard must keep working.
- **`showSystemFiles()`** (repository.js only) includes dotfiles/hidden entries — required because it searches for `.git` directories. The native replacement must NOT skip dotfiles for that call.
- fs-finder returns **full/absolute paths**, not basenames. Replacement must return full paths joined to the search root.

### Verification
- One behavior-locking spec per touched module (5 specs, or extend existing module specs) under `spec/jasmine/`, using temp-dir fixtures that assert recursive vs non-recursive results, glob matching, and the dotfile (`.git`) case.
- REFACTOR-07 done = `grep -rE "fs-finder|FsFinder|finder\.(from|in|findFiles|findDirectories)" lib/` returns nothing AND `fs-finder` absent from `package.json` dependencies AND `npm ls fs-finder` resolves to nothing.

### Atomic commits
- Planner's discretion, but a clean shape: one commit per module (sweep + its spec together), then a final commit dropping the dependency once all call sites are gone. Bisect-friendly; REFACTOR-07 lands last.

</decisions>

<code_context>
## Existing Code Insights

### The 12 call sites (exact semantics to preserve)

| File:Line | Call | Recursion | Returns |
|-----------|------|-----------|---------|
| `lib/thinx/deployment.js:301` | `finder.in(dpath).findFiles(extension)` | non-recursive | files matching `extension` var in dpath |
| `lib/thinx/deployment.js:315` | `finder.in(dpath).findFiles("*.zip")` | non-recursive | `*.zip` in dpath |
| `lib/thinx/repository.js:29` | `finder.from(repositories_path).showSystemFiles().findDirectories(".git")` | **recursive + dotfiles** | dirs named `.git` |
| `lib/thinx/platform.js:47` | `finder.from(local_path).findFiles('thinx.yml')` | recursive | all `thinx.yml` |
| `lib/thinx/builder.js:837` | `finder.from(XBUILD_PATH).findFiles(HEADER_FILE_NAME)` | recursive | header file(s) |
| `lib/thinx/builder.js:943` | `finder.in(cpath).findFiles("environment.json")` | non-recursive | `environment.json` in cpath |
| `lib/thinx/builder.js:949` | `finder.in(cpath).findFiles("environment.h")` | non-recursive | `environment.h` in cpath |
| `lib/thinx/builder.js:955` | `finder.in(cpath).findFiles("thinx.yml")` | non-recursive | `thinx.yml` in cpath |
| `lib/thinx/plugins/arduino/plugin.js:15` | `finder.from(path).findFiles('*.ino')` | recursive | all `*.ino` |

Plus 5 `require("fs-finder")` import lines (deployment.js:10, repository.js:7, platform.js:1, builder.js:17, plugins/arduino/plugin.js:7) to remove.

### fs-finder behavior (confirmed from fork source `node_modules/fs-finder/lib/Finder.js`)
- `Finder.in(path)` → `new Finder(path)` (non-recursive).
- `Finder.from(path)` → `new Finder(path).recursively()` (recursive).
- `findFiles`/`findDirectories` return arrays of full paths; empty match → returns `[]` (callers should be checked for how they handle empty — preserve current behavior, do not introduce throws on missing dir if fs-finder returned `[]`).

### Established patterns
- Specs live in `spec/jasmine/ZZ-*.js` (Jasmine + nyc), chai-http v4 pinned per AGENTS.md.
- `fs-extra` is already imported in several lib modules — safe to lean on for `existsSync`/path ops, but it has no finder/glob.

### Integration points
- `package.json:55` `"fs-finder": "github:suculent/Node-FsFinder#master"` is the line REFACTOR-07 removes.
- `base/node_modules/fs-finder` is vendored inside the `base/` submodule — OUT OF SCOPE for this phase.

</code_context>

<specifics>
## Specific Ideas

Preserve the synchronous, full-path, recursion-accurate behavior above verbatim — a naive `readdirSync` swap that drops recursion (or skips dotfiles for the `.git` search, or returns basenames instead of full paths) would be a silent regression in the firmware build/deploy pipeline. The specs exist specifically to catch that.

</specifics>

<deferred>
## Deferred Ideas

- `base/` submodule's vendored `fs-finder` copy — separate codebase, not this phase.
- Broader async/await modernization of builder.js/deployment.js — out of scope; keep changes surgical to the finder calls.

</deferred>
