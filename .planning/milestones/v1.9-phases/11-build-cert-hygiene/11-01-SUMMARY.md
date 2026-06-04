---
phase: 11-build-cert-hygiene
plan: 01
subsystem: infra
tags: [bash, shellcheck, docker, build-tooling, base-image, version-bump, gpg-signed-commit]

# Dependency graph
requires:
  - phase: pre-existing
    provides: "base/ submodule (suculent/thinx-cloud-base) with Dockerfile + npm install pipeline; root package.json with `npm-auto-version` dev dep already wired"
provides:
  - "Hardened base/update.sh — shellcheck-clean, fails-loud, single-atomic-commit-producing"
  - "Operator-facing CLI: --tag, --owner, --dry-run, --help (defaults: alpine, thinxcloud)"
  - "Pre/post docker image digest logging for audit trail of what shipped"
  - "Automatic patch-level version bump via `npm version patch --no-git-tag-version` on root package.json"
  - "GPG-signed `chore: base version bump` commit at the end of every successful run (script owns the commit boundary, no more out-of-band manual commits)"
affects: [base-image-rebuild, version-bump-cadence, ci-future-migration]

# Tech tracking
tech-stack:
  added: ["shellcheck 0.11.0 (dev-environment dependency, installed via Homebrew on operator machine)"]
  patterns:
    - "Bash hardening: `set -euo pipefail` as first executable line"
    - "Long-form CLI args via manual case loop (getopts is short-flag-only without GNU extensions)"
    - "Best-effort docker inspect with `|| true` scoped to the single capture line + empty-check fallback to keep operator audit lines single-line and human-readable"
    - "Script controls commit boundary — `npm version patch --no-git-tag-version` to bump without auto-commit"

key-files:
  created: []
  modified:
    - "base/update.sh (18 → 179 lines; hardened, shellcheck-clean, executable preserved)"

key-decisions:
  - "Use `npm version patch --no-git-tag-version` (NOT `npm run npm-auto-version`) — per D-01 in CONTEXT.md, the explicit form keeps commit ownership in the script"
  - "Run `npm version` from `git rev-parse --show-toplevel` (root) so root package.json gets bumped, NOT base/package.json (which is a submodule artifact unrelated to the v1.9.X rolling pattern)"
  - "Preserve original `rm -rf ./node_modules/` + `rm -rf ./package-lock.json` lines — they target the base/ subdirectory's artifacts (intentional clean rebuild), not the parent repo's"
  - "Strip stray newlines from `docker image inspect` output via `tr -d '[:space:]'` + empty-check fallback (Rule 1 auto-fix: bug discovered during --dry-run verify where the missing-image path emitted a blank line before the fallback echo)"
  - "Atomic commit stages ONLY root package.json (+ root package-lock.json if regenerated). node_modules is gitignored — no explicit exclusion needed."
  - "Script lives inside the `base/` git submodule (gitlink: `gitdir: ../.git/modules/base`). The meta-commit (`feat(BASE-IMG-01): ...`) lands inside the submodule on `thinx-staging`; the operator-level `chore: base version bump` commit (when the script runs at operator time) lands in the PARENT repo (root package.json lives there)."

patterns-established:
  - "Bash hardening pattern: `set -euo pipefail` + manual long-form arg parsing + best-effort probes with single-line `|| true` scope — reusable for future operator-facing scripts"
  - "Two-repo commit boundary pattern: script lives in a submodule, but the version-bump commit it produces lands in the parent repo (via `cd \"$REPO_ROOT\"` before `git commit`)"
  - "Dry-run pattern: gates both the docker side effects AND the git commit, so operators can verify the script end-to-end before producing real artifacts"

requirements-completed: [BASE-IMG-01]

# Metrics
duration: ~12 min
completed: 2026-06-03
---

# Phase 11 Plan 01: BASE-IMG-01 — Hardened base/update.sh Summary

**18-line fire-and-forget script rewritten into a 179-line hardened build tool that produces exactly ONE atomic GPG-signed `chore: base version bump` commit per run, with `--tag`/`--owner`/`--dry-run` CLI args and pre/post docker image digest logging — shellcheck-clean (0.11.0), `set -euo pipefail`, no silent failures.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-03T12:55Z (approx)
- **Completed:** 2026-06-03T13:07Z
- **Tasks:** 1 / 1
- **Files modified:** 1 (`base/update.sh`)

## Accomplishments

- `base/update.sh` rewritten to BASE-IMG-01 spec: `set -euo pipefail`, full CLI (`--tag`, `--owner`, `--dry-run`, `--help`/`-h`), auto patch-version bump via `npm version patch --no-git-tag-version`, pre/post docker image digest logging via `docker image inspect --format='{{index .RepoDigests 0}}'`, single atomic GPG-signed commit `chore: base version bump` at the end of every successful run.
- All 8 hardening items from CONTEXT.md § "Decisions — BASE-IMG-01" implemented and verified.
- shellcheck 0.11.0 passes with zero warnings, zero errors, zero disabled-via-inline-directive lines (verified: `grep -c 'shellcheck disable' base/update.sh` → 0).
- `--dry-run` path exercised end-to-end (twice: against a present image `thinxcloud/base:alpine` and against a missing image `suculent/base:jammy`); both paths emit a clean single-line `Pre-build digest:` audit line and reach the `DRY-RUN complete` terminal message.
- Unknown-arg + missing-value arg-parse error paths verified (exit 64 + usage to stderr).

## Task Commits

The phase used a single-task structure, so there is exactly one task commit. It lands inside the `base/` git submodule (where `update.sh` lives) and is GPG-signed per project convention.

1. **Task 1: Rewrite base/update.sh with hardened shell + arg parsing + digest logging + atomic commit** — `base/8db56b1f` (feat) — GPG signature: Good (RSA key `DC5CDA18C1DE3F9B29068802002B305D80BF729F`, "Matej Sychra <suculent@me.com>" [ultimate])

**Parent-repo metadata commit:** (deferred to executor orchestrator — the submodule pointer bump from `30044b2c` → `8db56b1f` plus `.planning/STATE.md` / `.planning/ROADMAP.md` / this SUMMARY land together in the final metadata commit per `<final_commit>`.)

## Files Created/Modified

- `base/update.sh` — Rewritten from 18 lines (no error handling, no args, no commit) to 179 lines:
  - Line 1: `#!/bin/bash`
  - Line 2: `set -euo pipefail`
  - Sections (per PLAN.md task action numbering): usage block (1–17), defaults (3), arg loop (4), repo-root locate (5), pre-build digest probe (6), version bump (7), build steps (8), post-build digest probe (9), atomic commit (10), final summary (11).
  - Executable bit preserved (`-rwxr-xr-x`).

## Decisions Made

See `key-decisions` in frontmatter. Highlights:

- **`npm version patch --no-git-tag-version`** chosen over `npm run npm-auto-version` per D-01 — the explicit form keeps the script as the sole owner of the commit boundary.
- **Run version-bump from repo root**, not from `base/` — root `package.json` is the v1.9.X rolling pattern; `base/package.json` is a submodule artifact unrelated to the operator-visible version.
- **Stray-newline fix** on docker image inspect output — discovered during `--dry-run` verify against a missing image, fixed via `tr -d '[:space:]'` + empty-check fallback (Rule 1 auto-fix, see Deviations below).
- **GPG-signed commit** inside the `base/` submodule (`thinx-staging` branch) for the meta-commit; the script itself emits a GPG-signed commit at the parent-repo root when run at operator time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Stripped stray newline from `docker image inspect` output**
- **Found during:** Task 1 (initial `--dry-run` verify against `suculent/base:jammy` — an image that doesn't exist locally)
- **Issue:** `docker image inspect <missing-image> --format='{{index .RepoDigests 0}}' 2>/dev/null` exits 1 BUT also emits a stray `\n` on stdout before failing. With the original capture `PRE_DIGEST="$(... 2>/dev/null || echo 'none ...')"`, the variable ended up holding `"\nnone (first build or local-only)"`, which printed as two lines under the `Pre-build digest:` audit echo — breaking the single-line-per-event log convention.
- **Fix:** Pipe the inspect output through `tr -d '[:space:]'` to drop the stray newline, then add an explicit empty-check fallback (`if [[ -z "$PRE_DIGEST" ]]; then PRE_DIGEST="none (first build or local-only)"; fi`). Same pattern applied to the post-build digest probe. Behaviorally equivalent on the happy path (digest string contains no whitespace), correct on the error path (single-line log).
- **Files modified:** `base/update.sh` (sections 6 + 9)
- **Verification:** Re-ran `bash base/update.sh --tag jammy --owner suculent --dry-run` — pre-build digest line now prints `▶ Pre-build digest: none (first build or local-only)` on a single line. Re-ran default invocation against present image — pre-build digest line still prints the full `sha256:...` digest correctly.
- **Committed in:** `base/8db56b1f` (Task 1 commit, captures the corrected version of the script)

**2. [Rule 3 — Blocking] Installed `shellcheck` via Homebrew**
- **Found during:** Task 1 verify gate setup (BEFORE script rewrite)
- **Issue:** `shellcheck base/update.sh` is the CRITICAL quality gate per `<success_criteria>` item 6. `shellcheck` was not installed on the operator machine (`command -v shellcheck` returned nothing).
- **Fix:** `brew install shellcheck` (Homebrew formula, well-known mature tool from `koalaman/shellcheck`). Installed `shellcheck 0.11.0` to `/opt/homebrew/Cellar/shellcheck/0.11.0`. Decision note: this is a **dev-environment** dependency on the operator machine, NOT a runtime/package dependency of the project — not subject to the Rule 3 npm/pip/cargo slopsquat exclusion (Homebrew formulas are curated by Homebrew maintainers + the tool's upstream provenance is checkable at `https://github.com/koalaman/shellcheck`).
- **Files modified:** None (operator-machine state, not repo state)
- **Verification:** `shellcheck --version` reports `0.11.0`. `shellcheck base/update.sh` exits 0.
- **Committed in:** N/A (dev-environment install, not a code change)

**3. [Rule 3 — Blocking] Attached `base/` submodule from detached HEAD to `thinx-staging` and fast-forwarded to recorded submodule pointer before committing**
- **Found during:** Task 1 commit step
- **Issue:** The `base/` submodule was checked out at detached HEAD on `30044b2c` (the parent repo's recorded submodule pointer). Committing on detached HEAD would have left the new commit orphaned w.r.t. the submodule's branches. Additionally, the submodule's `thinx-staging` branch was at `761c6057` — 2 commits BEHIND the recorded pointer `30044b2c` (`678b58e3 fix: package.json` + `30044b2c merged pinning chai-http`); naively committing on `thinx-staging` from there would have rewound the submodule pointer when the parent's metadata commit lands.
- **Fix:** (a) `git -C base checkout thinx-staging` (working tree dirty `M update.sh` was preserved by checkout — fast-forward-safe because the modified file is identical on both refs); (b) `git -C base merge --ff-only 30044b2c` to fast-forward `thinx-staging` to the recorded pointer; (c) THEN stage + commit. Result: `thinx-staging` now at `8db56b1f` (new commit) with `30044b2c` as parent — pointer advances cleanly, no regression of the 2 intervening commits.
- **Files modified:** `base/.git/refs/heads/thinx-staging` (advanced from `761c6057` → `8db56b1f`)
- **Verification:** `git -C base log --oneline -3` shows `8db56b1f` → `30044b2c` → `678b58e3` (correct chain). `git -C base verify-commit HEAD` reports "Good signature". Parent-repo `git diff --submodule base` shows `30044b2c..8db56b1f` (advance, not regression).
- **Committed in:** N/A (branch-attach is a ref-manipulation, not a code change)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking).
**Impact on plan:** All three fixes were necessary for the plan to land. The stray-newline bug (#1) would have been a documented Quality Gate regression had it shipped. The shellcheck install (#2) and submodule branch-attach (#3) were environmental prerequisites that the plan implicitly assumed; documenting them here so future operators (and Phase 11-02's executor) aren't surprised.
**Scope creep:** None. No files beyond `base/update.sh` were touched.

## Issues Encountered

- **`docker image inspect` quirk on missing images:** see Deviation #1 above. Not a regression — this is just how the docker CLI behaves; the script now handles it cleanly.
- **`base/` submodule branch state:** see Deviation #3 above. The submodule was in detached HEAD because the parent repo's `git submodule update --init` leaves submodules at the recorded SHA, not on any branch. This is normal git submodule behavior; the fix is a one-time branch-attach + ff.
- **No regressions** on the happy path: default invocation (no args) still targets `thinxcloud/base:alpine` and still does the same `rm -rf ./node_modules/` + `rm -rf ./package-lock.json` + `npm install . --omit=dev` + `npm audit fix` + `docker buildx build` + `docker push` sequence as the 18-line predecessor — just with hardening + auto-version-bump + atomic commit layered on top.

## End-to-end Testing Status

- **`--dry-run` exercised:** YES, twice (default args + custom `--tag jammy --owner suculent`). Both paths reach `DRY-RUN complete` and exit 0.
- **`--help` / `-h` exercised:** YES. Prints the CLI contract from `<interfaces>` and exits 0.
- **Unknown-arg / missing-value paths exercised:** YES. Both exit 64 with usage block emitted to stderr.
- **Full real run (with actual `docker buildx build` + `docker push` + `git commit -S`):** NOT exercised by the plan executor — the operator (Matej) will run this out-of-band when the next v1.9.X base-image rebuild is needed (per `<output>` section of the plan: "Whether the script was end-to-end tested (full run with real `docker buildx` + `git commit`), or only `--dry-run` tested (operator will run the real build out-of-band).").

## Suppressed shellcheck Warnings

ZERO. `grep -c 'shellcheck disable' base/update.sh` returns 0. No inline `# shellcheck disable=...` directives were needed.

## Atomic Commit SHA

- **Submodule (`base/`):** `8db56b1f4a0a340c5c2402d90ac99f823248a5a4` on branch `thinx-staging`. GPG-signed (Good, key `DC5CDA18C1DE3F9B29068802002B305D80BF729F`).
- **Parent repo:** deferred — the parent-level submodule pointer bump (`30044b2c → 8db56b1f`) plus `.planning/` updates land in the executor's `<final_commit>` step.

## Next Phase Readiness

- **BASE-IMG-01 → CLOSED.** Operator can now run `bash base/update.sh` and get one atomic commit + audit-trail-friendly stdout.
- **Phase 11 Plan 02 (THINX-CERT-CHECK-01):** independent of BASE-IMG-01 — no shared files, no shared verbs, no shared frontmatter. Parallel-safe.
- **Future op:** First real-run of the new script will produce a `chore: base version bump (1.9.3054 → 1.9.3055)` commit at the parent-repo root. Verify there that the script's `git add package.json package-lock.json` line correctly captures the regenerated lockfile (root `package-lock.json` exists at 395 KB per pre-flight check).

## Self-Check: PASSED

- `base/update.sh` exists (179 lines, `-rwxr-xr-x@` 7.0K, executable preserved): FOUND
- Commit `base/8db56b1f` exists and is GPG-signed (`G %G?` flag, Good signature): FOUND
- Submodule branch `thinx-staging` advanced to `8db56b1f` with `30044b2c` parent: FOUND
- shellcheck `base/update.sh` exits 0: VERIFIED
- `bash -n base/update.sh` exits 0: VERIFIED
- `bash base/update.sh --help` exits 0 and prints usage: VERIFIED
- `bash base/update.sh --dry-run` exits 0 and prints `DRY-RUN complete`: VERIFIED
- `grep -c 'set -euo pipefail' base/update.sh` returns 1: VERIFIED
- `grep -c 'npm version patch --no-git-tag-version' base/update.sh` returns 2 (code + usage comment, both legitimate): VERIFIED
- `grep -c 'chore: base version bump' base/update.sh` returns 3 (commit -m line + 2 commentary lines, all legitimate): VERIFIED
- `grep -c 'git commit -S' base/update.sh` returns 1: VERIFIED
- `grep -cE 'Pre-build digest|Post-build digest' base/update.sh` returns 4: VERIFIED

---

*Phase: 11-build-cert-hygiene*
*Plan: 01 (BASE-IMG-01)*
*Completed: 2026-06-03*
