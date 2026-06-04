# Phase 7 Discussion Log

**Date:** 2026-06-03
**Mode:** auto (goal: "complete all phases. Discuss only when needed.")
**Phase:** 7 — owner.js Async/Await Sweep

## Areas Discussed

Two strategic gray areas surfaced from codebase scout. Both required user input because the technical approach (nano 10 promise API) is mechanically settled but the granularity + scope-fold decisions reshape the plan layout.

### Area 1: Granularity — single atomic commit vs. method-by-method vs. two-phase

**Why surfaced:**
74 callback patterns in a 1161-line file is borderline atomic-commit territory. The top-5 high-fanout methods carry disproportionate behavioral risk (4+ callers each for `profile` / `create`; reset/auth-critical flows for `password_reset` / `set_password`). Single atomic = simpler but un-bisectable. Per-method = safer but ~14 commits. Two-phase = middle.

Three options presented:
- A: Method-by-method (~8-10 commits)
- B: Single atomic commit
- C: Two-phase — internals first (one commit), then top-5 methods individually (5 commits)

**User selected:** C — Two-phase.

Translated to plan structure:
- **Plan 07-1:** ~15 non-top-5 methods converted in one mechanical commit
- **Plans 07-2 through 07-6:** Top-5 methods (`create`, `delete`, `update`, `password_reset`, `set_password`) each as their own atomic commit
- Net: 6 atomic refactor commits + close-out summary/verify commits

### Area 2: Strict-equality fold from Phase 5 deferred

**Why surfaced:**
Phase 5's CONTEXT.md "Deferred Ideas — owner.js full strict-equality sweep" flagged lines 277/515/572 as carve-outs from REFACTOR-02 (which was scoped strictly to `password_reset`). Since Phase 7 will be inside owner.js anyway, this is the natural moment to close them.

Three options presented:
- A: Fold the strict-equality sweep into Phase 7
- B: Keep Phase 7 scope async/await only
- C: Fold ONLY in methods that already need editing for async/await

**User selected:** A — Fold the strict-equality sweep into Phase 7.

Notes:
- All three identified lines (277, 515, 572) are inside non-top-5 methods (mqtt_key, password_reset_init, atomic), so they land in Plan 07-1 alongside the async/await conversion of those same methods.
- Net: zero `!=` / `==` non-strict comparisons remain in `owner.js` after Phase 7 (was 7 after Phase 5).
- Audit traceability: Plan 07-1 commit subject explicitly mentions "+ strict-equality sweep" so the closure of the deferred Phase 5 sweep is recorded in git history.

## Areas NOT Discussed (decided by code evidence or already locked)

- **nano promise API choice:** nano 10.x is already pinned in package.json and supports native promises. No `util.promisify` needed. Researcher/planner confirmed direct nano-promise migration.
- **Preserve public signatures:** Locked by REFACTOR-04 requirement text. Callers in 8+ files stay callback-style; only internals convert.
- **Test-env ACCEPT pattern:** Carries forward from Phase 5/6 unchanged.

## Deferred Ideas Captured

- Converting public signatures to native async (callers updated too) — v2 candidate
- Promisify Util/sanitka/appkey — v1.10 candidate
- Owner unit-test expansion (per-method success + failure callback contract specs) — quick-task or alongside Phase 7

## Open Questions Forwarded to Planner

- Confirm the exact top-5 method roster (`set_password` vs. `password_reset_init`)
- Decide whether each Plan adds a behavior-locking unit test in `02-OwnerSpec.js` BEFORE conversion (recommendation: yes for top-5)
- Defensive grep gate per commit (no remaining callback-style `this.userlib.*` in touched method body)

## Coordination

Phase 7 reads `lib/thinx/owner.js` AFTER Phase 5's REFACTOR-02 edit (line 492 already strict). Plan 07-5 (`password_reset` conversion) MUST NOT regress that fix during the async conversion.
