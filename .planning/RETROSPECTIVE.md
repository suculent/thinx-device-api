# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — v1 GA Backend Closures

**Shipped:** 2026-05-27
**Phases:** 4 | **Plans:** 8

### What Was Built

- **AUTH-API-01** — Class-fix Bearer-null guard in `lib/router.js` + no-enumeration body normalization in `lib/router.user.js`; new `ZZ-RouterPasswordResetSpec.js` regression spec; Vue console `Authorization: Bearer null` pattern (frontend half) now harmless
- **SEC-PII-01** — `Util.redactEmail` + `Util.redactToken` helpers, sweep across 12+1 PII-leak sites in `lib/thinx/owner.js` (audit-log writes redacted before CouchDB persistence); `ZZ-OwnerLogRedactionSpec.js` regression coverage
- **OPS-01** — Restored swarm-side autoredeploy on `188.166.23.244` via Rung 1 force-restart of `swarmpit_app`; push-observe SLA 63s vs ≤300s target; canonical runbook at `.planning/runbooks/swarm.md`
- **SEC-DEP-01** — Triaged 29 Dependabot alerts (7 blocker / 19 deferred-stale / 3 deferred-dev-only) via `.planning/dep-triage.md`; 4 surgical `package.json` `overrides` edits in atomic commit `d8e3176c`; runtime-tree `npm audit --omit=dev` high 9→0; merged to master+main (PRs #539, #540)

### What Worked

- **Codebase map refresh BEFORE writing REQUIREMENTS** — the Phase 0 CONCERNS map surfaced 9 additional concerns (PII in logs, duplicate `trust proxy`, `!=` weak equality, etc.) that weren't in the previous map. This added SEC-PII-01 as a v1 GA blocker (vs. v1.x deferred) and right-sized Phase 2 from 6 to 12+1 sites in a single atomic commit.
- **Smallest-change-first ladder (Phase 3)** — 4-rung escalation plan with Rungs 2-4 checkpoint-gated behind human verification. Rung 1 (`docker service update --force swarmpit_app`) succeeded on first attempt; zero source-code commits; deeper rungs (DB rebuild, stale-node cleanup, Swarmpit upgrade) stay locked for future recurrence.
- **Atomic blocker fix (Phase 4 Slice 2)** — All 4 `overrides` edits in a single commit `d8e3176c` (single `npm install` regenerated lockfile). CI green first try. Swarmpit autoredeploy fired in 49s — beat Phase 3 baseline by 14s; doubled as Phase 3 confirmation that the OPS-01 fix is load-bearing.
- **Class-fix over per-route fix (Phase 1)** — Bearer-null guard in `lib/router.js` closes the entire bug class on ANY route, not just `/password/reset`. Single-file revert path. The Vue-side cleanup (skip header when refreshToken null) became a v1.x candidate, not a v1 blocker.
- **Verification artifact in SUMMARY** — Phases 1-3 carry verification evidence directly in `SUMMARY.md` `verification:` blocks + supporting `.txt` artifacts (BASELINE, PUSH-OBSERVE). Functional verification is intact; structured `*-VERIFICATION.md` is process-debt, not functional-debt.
- **Opportunistic execution sweeps** — Phase 2 executor surfaced an opportunistic 13th leak site (`{body}` envelope at L510) during the planned 12-site sweep. Phase 4 Slice 2 surfaced `ws` self-reference as a deviation from the bare `"8.20.1"` plan (npm EOVERRIDE because ws is also a direct dep) — adapted in-flight.

### What Was Inefficient

- **Per-phase VERIFICATION.md artifact gap** — Phases 1-3 closed without a structured `*-VERIFICATION.md` artifact (verifier agent was not retroactively run; functional verification IS present in SUMMARY). This is documented as the only artifact gap in the milestone audit. Low-cost remediation possible (re-run `gsd-verifier` against the 3 SUMMARYs) but not blocking. Carries forward as process-debt to clear if any future audit requires structured artifacts for traceability tooling.
- **Phase 1 Wave 2 tightening** — The Wave 1 no-enum fix (`db46790c`) normalized status to 200 but the body still leaked enumeration via differing response shapes. Required a second commit `c67d9afd` to fully normalize the body. The integration test environment (chai-http v4 spec at `ZZ-AppSessionUserSpec.js:191-198`) needed preserved passthrough so the test still chained `reset_key` — production path tightened, test path passthrough kept. A more thorough pre-Wave-1 read of the spec would have caught this in one commit.
- **Phase 4 Slice 4 timing** — Slice 4 (merge-up to default branches) had a ~25h wall-clock from Slice 3 close-out, almost entirely operator UI-merge wait windows. Active work was ~30 min across 4 slices. Future merge-up slices should batch GitHub UI operations against operator availability rather than splitting into separate slices.
- **services/console submodule pointer drift** — `git status` shows `M services/console` throughout v1.0 work; intentional per operator Option B 2026-05-27 but visually noisy. Future milestones should set an explicit submodule-pointer policy at milestone-start (commit drift now vs. defer).

### Patterns Established

- **Refresh CONCERNS map before REQUIREMENTS** — surfaces hidden gaps and right-sizes phase scope.
- **Operational phases with rung-by-rung ladder + checkpoint-gated deeper rungs** — smallest-change-first; deeper rungs documented but locked behind human verification for future recurrence.
- **Atomic dependency fixes** — single commit, single `npm install`, CI verification, Swarmpit autoredeploy as the contract-preservation test.
- **Cross-phase contract probes** — every phase that deploys re-probes the prior phases' contracts on the new image. Phase 4 deploy re-verified Phase 1 (Bearer-null → 200) + Phase 2 (PII redaction `x***@y` in logs).
- **Verifier agent retrofit on tech-debt audit gaps** — when functional verification is present elsewhere, document the artifact gap; remediate when tooling requires.
- **Operator-decision paper trail in audit** — Slice 2/3/4 operator options (CI as regression gate; Option C dep triage; Option B services/console deferral) are documented as decisions in the audit, not silently absorbed.

### Key Lessons

1. **Tight scope wins.** 4 phases, 4 requirements, 2 days. Mirroring the sibling project's milestone framing (console v1.0) prevented scope creep into "backend at large" territory.
2. **Frontend bugs that surface in backend (Bearer-null) deserve backend class-fixes**, not per-route patches. The frontend half can stay broken if the backend makes it harmless — single-revert path, no cross-project coordination on the fix itself (only a v1.x cleanup candidate).
3. **Operational fixes with zero source-code commits are first-class deliverables.** OPS-01 shipped via a single SSH command + a documented runbook + a push-observe SLA test. The metric (63s vs ≤300s) is the evidence; the absence of code is a feature.
4. **CouchDB audit-log writes are the highest-priority PII sites.** Unlike rotating stdout, audit logs persist indefinitely and are queryable. Phase 2's L467 + L604 (audit writes) were the highest-priority sites; historic data cleanup is a separate concern (filed as SEC-PII-02).
5. **`npm` `overrides` block is the right vector for transitive CVE fixes** in a Node monorepo. 4 edits closed 7 GHSAs. The block self-references (`"ws": "$ws"`) when a direct dep is also being overridden — npm-specific quirk worth documenting (and worth re-evaluating in v1.x because it creates a security-floor coupling to the floating direct dep version).
6. **Sibling-project boundaries matter at milestone close.** services/console v1.0 frontend and parent v1.0 backend should land together but are independently planned and committed. Cross-project coordination items (SEC-DEP-02, services/console merge-up) are tracked via explicit backlog entries with cross-references, not implicit cross-project commits.

### Cost Observations

- Model mix: predominantly opus-1m for planning + verification; sonnet for execution agents; not tracked precisely
- Sessions: ~4-5 wall-clock sessions across 2 days (phases overlapped same-day)
- Notable: Phase 3 was the cheapest phase by far (Rung 1 PASS on first try, ~12 min execution); Phase 4 was the most artifact-heavy (4 slices × ~25 docs/JSONs)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 4 | 8 | First milestone using GSD on this project; established codebase-map-before-REQUIREMENTS pattern and rung-by-rung operational-phase ladder |

### Cumulative Quality

| Milestone | New regression specs | Production deploys | Audit status |
|-----------|---------------------|---------------------|--------------|
| v1.0 | 3 (`ZZ-RouterPasswordResetSpec.js`, `ZZ-OwnerLogRedactionSpec.js`, `UtilSpec.js` extensions) | 4 (`0a0e6b32`, `3a461b3d`, `81b22f1f`, `4d3fb789`) | tech_debt (no blockers; intentionally-deferred + 1 artifact gap) |

### Recurring Backlog Themes

(Track which backlog items survive multiple milestones — surfaces hidden priorities.)

- v1.0 → carried forward to v1.x: REFACTOR-01..05, SEC-COOKIE-01, SEC-WS-01, SEC-DEP-02, SEC-PII-02, OPS-02, OPS-03, AUTH-REACTIVATE-01, AUTH-RESET-LINK-CONSOLE, CONSOLE-LEGACY-JSON-PARSE, TEST-CHAI-01

---
*Retrospective initialized: 2026-05-27 (v1.0 milestone close)*
