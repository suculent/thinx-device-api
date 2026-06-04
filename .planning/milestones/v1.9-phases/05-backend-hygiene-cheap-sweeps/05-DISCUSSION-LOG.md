# Phase 5 Discussion Log

**Date:** 2026-06-02
**Mode:** auto (goal: "complete all phases. Discuss only when needed.")
**Phase:** 5 — Backend Hygiene — Cheap Sweeps

## Areas Discussed

Two gray areas surfaced during codebase scout — one was a hidden scope problem, one was a value ambiguity. Both required user input because the roadmap criteria were under-specified given current code state.

### Area 1: REFACTOR-05 fs-finder strategy

**Why surfaced:**
Roadmap criterion 3 says `fs-finder` must be in `devDependencies` AND zero `require('fs-finder')` in `lib/`. Codebase scout found 5 active runtime call sites — making this NOT a "cheap sweep". Three options presented:
- A: Replace with fs-extra/glob now (full refactor)
- B: Split — jshint now, fs-finder later
- C: Keep fs-finder in production deps (documented exception)

**User selected:** C — Keep fs-finder in production deps.

**Notes:** Rationale captured in CONTEXT.md decision block — fork is internally owned (`suculent/Node-FsFinder#master`), no supply-chain risk, runtime usage is genuine. Full removal deferred to a future phase.

### Area 2: REFACTOR-01 trust proxy value

**Why surfaced:**
Two `app.set('trust proxy', ...)` calls with DIFFERENT values exist at `thinx-core.js:300` (`1`) and `:422` (`['loopback', '127.0.0.1']`). Roadmap requires single canonical site but doesn't specify which value to keep. Three options presented:
- A: Keep allowlist `['loopback', '127.0.0.1']`
- B: Keep count `1`
- C: Investigate first (defer to planning)

**User selected:** A — Keep the allowlist.

**Notes:** This is the currently-winning value (later call overrides earlier), so preserves observed behavior by definition. Also more accurate for the swarm topology where the app sits behind Traefik on loopback.

## Areas NOT Discussed (already clear from roadmap)

- **REFACTOR-02 (strict equality)** — Roadmap explicitly scopes to `password_reset` only. One `!=` at line 492. Action is unambiguous: `!=` → `!==`. No discussion needed.
- **REFACTOR-05 jshint portion** — Already unused in `lib/` and `thinx-core.js`. Mechanical reclassification. No decision needed.

## Deferred Ideas Captured

- Full fs-finder removal sweep (proposed v1.10 phase)
- owner.js full strict-equality sweep at lines 277/515/572 (could fold into Phase 7 REFACTOR-04)
- Removing the unused userland `path` package from dependencies (v1.10 hygiene backlog)

## Scope Deviation

REFACTOR-05's fs-finder clause is being explicitly deferred. Planner should reflect this in either a ROADMAP.md amendment, an inline phase-plan note, or a STATE.md scope-deviation entry — choice deferred to plan-phase.
