---
phase: 04-dependency-triage
reviewed: 2026-05-27T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - package.json
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-27
**Depth:** standard
**Files Reviewed:** 1 (package.json)
**Status:** issues_found

## Summary

Scope of review is the single source-of-truth diff for Phase 4: the `overrides` block at `package.json:97-136`. The 4 surgical edits described in slice 2 (`d8e3176c`) are present:

- `follow-redirects` override removed (axios's own `^1.16.0` resolves naturally past GHSA-r4q5-vmmm-2653). Verified via `npm view follow-redirects` resolution path.
- `lodash` override at `4.18.1` (line 121). Verified that `4.18.0` / `4.18.1` exist on the npm registry and are published by the canonical maintainer `jdalton` (publication dates 2026-03-31 and 2026-04-01). Closes GHSA-r5fr-rjxr-66jc + GHSA-f23m-r3pf-42rh.
- `minimatch` override at `5.1.9` (line 123). Verified that `5.1.9` is the published end-of-line tag `legacy-v5` (latest is 10.2.5). Closes the three minimatch GHSAs.
- `ws` override at `$ws` self-reference (line 134), forcing all transitive `ws` instances to resolve to the top-level direct dep `ws@^8.20.1` (resolves to 8.21.0 at all 6 instances per SUMMARY). Closes GHSA-58qx-3vcg-4xpx.

JSON is syntactically valid (`jq .` parses; Node `JSON.parse` succeeds). The `overrides` block has 36 unique keys, no duplicates. No edits to `dependencies`, `devDependencies`, or `scripts`. The slice respects the documented `must_not` list from the plan (no chai-http v5 bump, no axios bump, no submodule touch).

**Two warnings stand:** the `ws: "$ws"` self-reference is functionally correct *today* but is only as safe as the floating top-level `^8.20.1` — a future top-level downgrade or `npm install` resolving an older patch could regress security without any local edit. Also, the `coveralls: "^3.1.1"` override in the same block (predates phase 4, but the slice ratifies the block as-is in commit `d8e3176c`) is a non-pinned override that defeats the slice's own "pin transitives to safe versions" pattern; the only reason it doesn't bite today is that `3.1.1` is the dist-tag `latest`.

The remaining 4 informational items concern (a) inconsistency with the slice's own plan-stated convention (other overrides use bare pinned strings; `$ws` is the lone self-ref), (b) the implicit dependency on the upstream npm `$<name>` syntax remaining stable, (c) `prepare: snyk-protect` running on every install (CI + post-install in production image build), and (d) a docs-vs-code drift between `04-02-blocker-fixes-PLAN.md` and the shipped commit (plan says `"ws": "8.20.1"`, shipped value is `"$ws"`). All four are documented in 04-02-SUMMARY.md as Rule 3 deviations.

No BLOCKER-class defects. The phase's primary success metric — `npm audit --omit=dev` runtime-tree `high == 0` — is confirmed by `04-AUDIT-POST-PROD.json` and `04-AUDIT-POST.json` (`high: 1, moderate: 7` in full tree, all in dev-only chain: mocha, nyc, jest-junit, eslint via ajv/serialize-javascript/uuid — stripped by Dockerfile L86 `npm install --omit=dev`).

## Warnings

### WR-01: `ws` override via floating self-reference defers semver safety to top-level resolver

**File:** `package.json:94, 134`
**Issue:** The override entry `"ws": "$ws"` (line 134) references the direct dependency `"ws": "^8.20.1"` (line 94). The canonical npm self-reference pattern is correct and was the only way to defeat the `EOVERRIDE` that rejected `"ws": "8.20.1"` (see 04-02-SUMMARY.md deviation A). However, **the safety floor of this override is now defined by the floating `^8.20.1` caret in the dependencies block, not by any literal value in the overrides block**. Two failure modes:
  1. If a future commit tightens `"ws": "^8.20.1"` to a vulnerable patch (e.g. someone "downpins" to `"ws": "8.20.0"` thinking it's pinning the version), the override silently follows it below the GHSA-58qx-3vcg-4xpx patched line (the GHSA-affected range starts at 8.20.0).
  2. The npm `$<dep>` token is a relatively recent npm CLI feature; users on older npm CLIs (npm <8.3) get `EUNKNOWN` and have no override applied at all — all 6 transitive ws sites would silently fall back to engine.io's `~8.17.1` tilde-lock. Dockerfile / CI must use a modern npm.
**Fix:** Either (a) keep the self-reference but add a second guard in CI — assert `node -e "require('child_process').execSync('npm ls ws', {stdio:'inherit'})"` confirms `ws@>=8.20.1` at every resolved path, and reject builds where ws appears below 8.20.0; or (b) once Slice 3's "block hygiene" task lands, rewrite to a literal `"ws": "8.21.0"` (or whatever the patched line floor is at that time) by *also* widening the direct dep to a range that no longer conflicts with the override literal — e.g. `"ws": ">=8.21.0"` direct + `"ws": "8.21.0"` override; this removes the EOVERRIDE conflict and re-anchors the floor in a single literal. The SUMMARY's claim "RESEARCH.md L484 explicitly anticipates 8.21.0 as safe" is true, but the *current package.json text* does not encode that floor anywhere — `8.21.0` exists only as a transient resolution outcome.

### WR-02: `coveralls: "^3.1.1"` override defeats the block's own pin-to-safe-version pattern

**File:** `package.json:109`
**Issue:** Every other entry in the overrides block uses a bare literal (e.g. `"ajv": "6.12.3"`, `"async": "2.6.4"`, `"minimatch": "5.1.9"`) or the new `$ws` self-reference. The single exception is `"coveralls": "^3.1.1"` (line 109), which uses a caret range. Caret means "any version in `3.x` that satisfies `>=3.1.1 <4.0.0`". An override expressed as a range *defeats the purpose of the override* — npm is free to resolve any 3.x version that the dependency tree requests. While `3.1.1` is the current `latest` dist-tag (so no higher version exists today), this is fragile: the next 3.x publish could re-introduce a CVE-bearing transitive, and the override would happily accept it. This is pre-existing block hygiene drift, not introduced by Phase 4 — but Slice 2's commit `d8e3176c` *re-ratifies* the entire block by editing siblings. The plan's `must_not` list explicitly says "Do NOT prune any of the other 34 entries in the overrides block — surgical edits only; block hygiene is a v1.x exercise" so the scope decision is intentional. Flagging as WARNING because the same block now ships two structurally different override styles (literal vs. range vs. self-ref), increasing cognitive load and the chance that the next override-edit slice introduces a typo.
**Fix:** In a future block-hygiene slice (REFACTOR-05 per 04-02-SUMMARY.md), change `"coveralls": "^3.1.1"` to `"coveralls": "3.1.1"`. Inventory the block for any other caret/tilde overrides and convert to literals where the intent was "pin to a known-safe version". Document the two legitimate non-literal forms explicitly: (1) `$<name>` for forced-match-to-direct-dep, (2) bare `<version>` for literal pin. Treat caret/tilde in overrides as a lint failure.

## Info

### IN-01: Plan-vs-shipped drift in `ws` override value is documented but creates two sources of truth

**File:** `package.json:134`, cross-ref `.planning/phases/04-dependency-triage/04-02-blocker-fixes-PLAN.md:89, 95, 177-180`
**Issue:** The plan calls for `"ws": "8.20.1"` (bare literal) in three places (interfaces section L89/L95, Task 1 Edit 4 L177-180). The shipped value is `"ws": "$ws"`. 04-02-SUMMARY.md's "Deviations from Plan" section documents this clearly as a Rule 3 auto-fix (EOVERRIDE rejection), and the security-equivalent outcome (resolves to ws@8.21.0 at all 6 instances, past GHSA-58qx-3vcg-4xpx patched-line start) is preserved. However, the plan file itself was not updated post-hoc, so a future agent reading the plan in isolation will see one value and find another in code. The plan's `must_not` line 52 (`"Do NOT pin ws to 8.21.0 — research recommendation is 8.20.1..."`) is now factually obsolete — ws resolves to exactly 8.21.0 in the shipped lockfile.
**Fix:** None required for this phase (slice 3 closeout already in place). For future hygiene: when a Rule-3 auto-fix changes the literal value of a plan-prescribed edit, add a one-line "shipped value: X (see SUMMARY for rationale)" annotation next to the original plan line, so the plan remains internally consistent with the artifact.

### IN-02: `engines.node` minimum `>=19.x` is unusual (19 is an odd, unsupported Node major)

**File:** `package.json:157-159`
**Issue:** `"node": ">=19.x"` specifies Node 19+. Node 19 reached end-of-life in 2023-06-01; the LTS line is 20/22/24. The constraint is too permissive (allows 19, which is EOL) AND mismatches reality (CI Dockerfile likely uses a current LTS). Pre-existing, not introduced by Phase 4 — but worth noting because the slice did re-publish the file. Not a security issue today; can become one if a contributor picks up Node 19 from a stale local install and ships a regression that newer Nodes would have caught.
**Fix:** Out of phase scope. File as a hygiene item — set `"node": ">=20.x"` or `">=22.x"` to match the actual supported LTS. Not for this slice.

### IN-03: `prepare: npm run snyk-protect` runs on every `npm install` in production image build

**File:** `package.json:30`
**Issue:** The `prepare` lifecycle script runs `snyk-protect`, which patches known vulnerabilities at install time per Snyk's `.snyk` file. This script fires on every `npm install` — including the production Docker build (`npm install --omit=dev` per Dockerfile L86). If `@snyk/protect@^1.1300.2` ever experiences a supply-chain compromise (the package itself or any of its transitive deps), the compromise executes inside the production image build. Phase 4 does not modify this — but Phase 4's slice 2 *did* run `npm install` and *did* re-trigger `snyk-protect` during local lockfile regeneration (per task 2 description). No evidence of compromise, just flagging the implicit trust surface re-affirmed by this commit.
**Fix:** Out of phase scope. Future hardening: pin `@snyk/protect` to an exact version (currently `^1.1300.2`) and document a review SLA for that pin in AGENTS.md / STACK.md. Consider whether `prepare` is still load-bearing or whether `.snyk` patches can be applied at a separate, gated step.

### IN-04: `packageManager` declares yarn but repo uses npm

**File:** `package.json:170`
**Issue:** `"packageManager": "yarn@1.22.22+sha512..."` declares yarn 1.22 as the package manager (Corepack signal). However, the repo has `package-lock.json` (npm) and no `yarn.lock`, all slice 2 tooling uses `npm install` / `npm ls` / `npm audit`, and CI's Dockerfile L86 runs `npm install --omit=dev`. The two are contradictory. If a future contributor runs `corepack enable` and then `yarn install`, they get a different (and possibly older) override-resolution algorithm because yarn 1.x does not honor the npm `overrides` field at all — yarn 1.x uses `resolutions` instead. **None of the 4 overrides shipped in this slice would apply under yarn 1.x.** This is a real and silent regression risk if anyone tries to bypass npm.
**Fix:** Out of phase scope per the explicit `must_not` "Do NOT prune any of the other 34 entries in the overrides block". For a future hygiene slice: either remove the `packageManager` field, or change it to `"npm@<version>"` to match reality. Adding a `"resolutions"` block mirroring `"overrides"` is a possible defensive measure but doubles maintenance burden.

## Notes on Phase Scope Compliance

- Slice 2 commit `d8e3176c` touches exactly `package.json` + `package-lock.json`; this review only covers `package.json` per the `files` config.
- The 4 stated edits are present and correct in JSON structure.
- No accidental dependency removals or downgrades detected in `dependencies` / `devDependencies` (cross-checked against the commit's parent file via `git show d8e3176c^:package.json` would be the formal check; the SUMMARY's `git diff --stat` evidence is consistent).
- No new packages added — confirms the "tighten existing pins" framing in the threat model.
- Post-fix audit shows 0 runtime-tree high (primary metric met); 1 high + 7 moderate remain in dev-only chains (mocha/nyc/jest-junit/eslint via serialize-javascript/uuid/ajv), all stripped by the production Docker build.

## Structural Findings (fallow)

None provided in this prompt; no structural pre-pass was run.

---

_Reviewed: 2026-05-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
