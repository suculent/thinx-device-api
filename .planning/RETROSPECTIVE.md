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

## Milestone: v1.9 — Backend Hygiene & Posture

**Shipped:** 2026-06-04
**Phases:** 7 (Phases 5–11) | **Plans:** 23

### What Was Built

- **Phase 5** (REFACTOR-01/02/05) — trust-proxy dedup with rationale comment; `!=`→`!==` in `Owner.password_reset` + coercion-case regression; `jshint` reclassified to `devDependencies` (`fs-finder` scope-amended to v1.10).
- **Phase 6** (REFACTOR-03 / SEC-WS-01 / SEC-COOKIE-01) — raw-socket `close` handler in WS upgrade flow; `httpOnly: true` flip on the session cookie with sub-5-min documented rollback; operator runbook documenting the rtm edge-nginx routing gap (SEC-WS-01 not code-fixable from this repo).
- **Phase 7** (REFACTOR-04) — ~73 callbacks in `lib/thinx/owner.js` converted to async/await across 6 atomic commits; 5 behavior-locking specs in `02-OwnerSpec.js`; 7 strict-equality fixes folded in; SEC-PII-01 and Phase 5 REFACTOR-02 invariants preserved verbatim.
- **Phase 8** (AUTH-REACTIVATE-01 / AUTH-RESET-LINK-CONSOLE) — admin-only `POST /api/v2/admin/user/:id/reactivate` behind existing `requireAdmin`; one-line redirect URL change so password-reset emails land on Vue (`/password-reset?`) instead of legacy AngularJS (`/password.html?`).
- **Phase 9** (SEC-PII-02) — `scripts/redact-managed-logs.js` (snapshot-gated `_bulk_docs` overlay + `--sample N` verification subcommand); `lib/thinx/audit.js` 90-day `expire_at` forward-TTL; operator runbook + GDPR-posture note.
- **Phase 10** (SEC-DEP-02) — 2 console alerts classified as a new `deferred-vendored-asset` disposition (vendored `jquery-validation-1.19.5`, never invoked); SEC-DEP-02 scheduled in `services/console` GSD project; submodule pointer bumped into this repo; cross-project coordination runbook.
- **Phase 11** (BASE-IMG-01 / THINX-CERT-CHECK-01) — `base/update.sh` rewritten (18 → 179 lines, shellcheck-clean, `set -euo pipefail`, `--tag`/`--owner`/`--dry-run`/`--help`, single atomic commit per run); DETECT-only startup `ca.pem` freshness probe (R10..R14 chain check) with `ZZ-CertProbeSpec.js` + 4 fixture PEMs.

### What Worked

- **Per-phase VERIFICATION.md across all 7 phases** — closed the v1.0 process-debt gap. Every v1.9 phase has a structured verification report; functional + artifact-location PASS at the milestone level even without a separate milestone-level audit.
- **Sequential single-branch execution for the owner.js sweep (Phase 7)** — every plan touched the same file; parallel worktrees would have produced merge conflicts on every plan. 6 atomic commits gave a bisect-friendly history and each top-5 method individually revertable. No behavior regressions across 5 behavior-locking specs.
- **Operator-runbook resolutions for code-unreachable problems** — SEC-WS-01 (edge-nginx routing gap) and SEC-PII-02 production sweep both shipped as runbooks with verbatim reproduction tables / step-by-step procedures. Tagged `deferred to edge-redesign` / `operator-window` so the boundary is explicit, not implicit.
- **Mid-phase scope amendment via single atomic commit (Phase 5 REFACTOR-05)** — `fs-finder` reclassification turned out to be a breaking change disguised as a cheap sweep (5 active runtime call sites). Closed the gap between literal Phase 5 criterion 3 and executed jshint-only scope with one commit (`89669fc4`) that touched ROADMAP.md, REQUIREMENTS.md, STATE.md, and surfaced a v1.10 backlog entry. No re-planning required.
- **Cross-project coordination via the submodule pointer (Phase 10)** — SEC-DEP-02 scheduled inside `services/console`'s own GSD workspace, then the pointer bump landed in this repo as a single chore commit. New `deferred-vendored-asset` disposition class adopted in `.planning/dep-triage.md` so future vendored-asset alerts get triaged consistently across projects.
- **DETECT-only cert probe (THINX-CERT-CHECK-01)** — the cleanest way to put a codebase angle on an OPS-owned problem. The probe surfaces drift; the swarm host owns the fix. Zero risk of accidentally mutating certs at startup.

### What Was Inefficient

- **`gsd-sdk query milestone.complete --dry-run` silently ignored the flag and executed the real archival.** Discovered at close: the dry-run produced the actual MILESTONES.md append + STATE.md update + archive-file creation. Required a forensic manual cleanup of the noisy auto-extracted MILESTONES.md entry (raw `Date:` / `One-liner:` / `Branch:` / `Rule 1/2` placeholders had been concatenated into the accomplishments list). Future GSD work: surface the missing-flag as a hard error, or document that unknown flags are no-ops.
- **SUMMARY one-liner extraction had low precision** — the auto-extractor pulled the first colon-suffix line per SUMMARY, which often hit raw template scaffolding (`Date:`, `One-liner:`) instead of the curated narrative. Future SUMMARY templates should put the one-liner on a standardized `one_liner:` YAML key (Phase 8 + Phase 9 SUMMARYs partially adopted this; the rest didn't).
- **REQUIREMENTS.md traceability table drifted from ROADMAP.md status** at close (SEC-PII-02 still read "In Progress" while ROADMAP showed ✓; Verified/Pending counters at the bottom were stale). Per-phase status updates happen in ROADMAP but the requirements traceability table is a second source of truth and doesn't auto-refresh.
- **No separate milestone-level audit** — v1.9 shipped on per-phase VERIFICATION.md alone. Carries the same risk profile as v1.0's verification-artifact gap: if v1.10 audit tooling requires a `v1.x-MILESTONE-AUDIT.md` for cross-milestone traceability, a retrofit pass will be needed.
- **Mid-stream phase additions surfaced 2026-06-02** (BASE-IMG-01, THINX-CERT-CHECK-01) — these were operationally driven by the 2026-05-31 LE intermediate rotation incident and the `1.9.3054` manual base-image bump. They fit the milestone theme cleanly but came in after the requirements lock at 2026-06-02 19:58Z. Future milestones should keep a 24h pre-execution review window for late-surfaced requirements rather than landing them on the same day the roadmap is created.

### Patterns Established

- **Per-phase VERIFICATION.md as the milestone gate** — replaces v1.0's reliance on SUMMARY.md `verification:` blocks. Functional + artifact-location coverage at the phase level scales to milestone-level when all phases pass.
- **Same-file-touching plans execute sequentially on one branch** — codified during Phase 7. Parallel worktrees are for plans with disjoint file touches; single-file sweeps go sequential to avoid synthetic merge conflicts.
- **Operator runbooks as first-class requirement closures** — SEC-WS-01 and SEC-PII-02 production execution both ship as runbooks with documented hand-off boundaries. The codebase commitment is to surface and document; the swarm host or operator owns execution.
- **DETECT-only probes for OPS-owned problems** — cert freshness, future SSL rotation flags, future swarm health probes. Surface drift via startup warnings; never auto-mutate state the OPS layer owns.
- **Mid-phase scope amendment via single-commit document sync** — when execution discovers a planned criterion is breaking, amend ROADMAP/REQUIREMENTS/STATE in one atomic commit with a v1.X+1 backlog entry rather than re-planning the phase.
- **Submodule-pointer as cross-project coordination signal** — schedule the work inside the sibling project's own GSD workspace, then land a pointer bump as a single chore commit in the parent. No cross-project commits beyond the pointer.
- **`deferred-vendored-asset` disposition class** — new entry in `.planning/dep-triage.md` taxonomy for vendored third-party assets that aren't actually loaded by the build. Should be reused for any future "alert lives in a vendored package.json" finding.

### Key Lessons

1. **Per-phase VERIFICATION is sufficient for milestone close when every phase has one.** v1.0's tech-debt audit status was driven entirely by the 3 missing VERIFICATION reports. Closing that gap in v1.9 removed an entire class of close-out friction.
2. **Same-file sweeps want sequential commits.** Parallel-worktree execution is a default that should NOT apply when every plan in a phase touches the same file. The Phase 7 sequential plan-set landed cleanly because we resisted the urge to parallelize.
3. **A runbook is a valid requirement closure** when the actual fix lives outside the codebase. SEC-WS-01 (edge-nginx routing) and SEC-PII-02 (production execution) both closed via runbook authorship + explicit operator hand-off, not by squeezing a partial code fix.
4. **Scope amendments should be cheap, not expensive.** REFACTOR-05's mid-phase scope reduction landed in one commit across three planning files plus a v1.10 backlog entry. No re-planning, no phase rollback, no narrative drift.
5. **DETECT-only cert probes are the right boundary for OPS-owned problems.** THINX-CERT-CHECK-01 doesn't try to rotate certs; it surfaces the drift early enough that the swarm host's rotation cron can react. The split (codebase detects, OPS rotates) is the durable pattern.
6. **`gsd-sdk` flags that don't exist are silently dropped.** Verified painfully: `--dry-run` on `milestone.complete` produces a wet run that's indistinguishable from a real one at the JSON-result level. Future close-out work should run with an explicit `git stash`-able working tree if exploring SDK behavior.
7. **Submodule-pointer-as-coordination is lighter than cross-repo PRs.** Phase 10's bumps (parent chore commits + sibling-project schedule edits) closed SEC-DEP-02 cleanly without any cross-project commit other than the pointer. Pattern reusable for any future `services/*` coordination.

### Cost Observations

- Model mix: predominantly opus-1m for planning + verification; sonnet for execution agents; not tracked precisely
- Sessions: ~5-7 wall-clock sessions across 2 days (phases overlapped same-day, especially Phase 5–6–9–10–11 on 2026-06-02 and 2026-06-03)
- Notable: Phase 7 was the most commit-dense phase (6 atomic commits on a single branch in one session, ~2-3h); Phase 5 was the cheapest (3 plans on the same day as roadmap creation); Phase 6's documentation-as-code (runbook authorship) used more tokens than its code edits

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 4 | 8 | First milestone using GSD on this project; established codebase-map-before-REQUIREMENTS pattern and rung-by-rung operational-phase ladder |
| v1.9 | 7 | 23 | Established per-phase VERIFICATION.md as the milestone gate (closes v1.0's process-debt gap); codified sequential single-branch execution for same-file sweeps; introduced operator-runbook closures + DETECT-only OPS probes; mid-phase scope amendment via single-commit document sync |

### Cumulative Quality

| Milestone | New regression specs | Production deploys | Audit status |
|-----------|---------------------|---------------------|--------------|
| v1.0 | 3 (`ZZ-RouterPasswordResetSpec.js`, `ZZ-OwnerLogRedactionSpec.js`, `UtilSpec.js` extensions) | 4 (`0a0e6b32`, `3a461b3d`, `81b22f1f`, `4d3fb789`) | tech_debt (no blockers; intentionally-deferred + 1 artifact gap) |
| v1.9 | 7+ (`02-OwnerSpec.js` × 5 behavior-locking, `ZZ-RouterAdminReactivateSpec.js`, `ZZ-CookieAttributeSpec.js`, `ZZ-WebSocketLifecycleSpec.js`, `ZZ-CertProbeSpec.js`, `ZZ-AuditTTLSpec.js`, `ZZ-RouterPasswordResetSpec.js` extensions) | base image bumped to `1.9.3054`; production deploy deferred to operator push (CI green-gate on `thinx-staging`) | per-phase VERIFICATION.md PASS for all 7 phases (no separate milestone audit; carries the same revisit flag as v1.0's gap) |

### Recurring Backlog Themes

(Track which backlog items survive multiple milestones — surfaces hidden priorities.)

- v1.0 → carried forward to v1.x: REFACTOR-01..05, SEC-COOKIE-01, SEC-WS-01, SEC-DEP-02, SEC-PII-02, OPS-02, OPS-03, AUTH-REACTIVATE-01, AUTH-RESET-LINK-CONSOLE, CONSOLE-LEGACY-JSON-PARSE, TEST-CHAI-01
- v1.9 → carried forward to v1.10: **fs-finder removal sweep** (deferred from Phase 5 REFACTOR-05 scope amendment), **SEC-WS-01 operator-side edge fix** (runbook authored, swarm-host execution outstanding), **SEC-PII-02 production execution** (script + audit TTL shipped; ~658k-doc sweep deferred to operator window), TEST-CHAI-01 (still locked per AGENTS.md), OPS-02 / OPS-03 (pure swarm-side, still deferred), CONSOLE-LEGACY-JSON-PARSE (sibling-project scope)
- **Survived both milestones (v1.0 → v1.9 → v1.10):** TEST-CHAI-01 (3rd milestone of deferral), OPS-02 / OPS-03 (3rd milestone of deferral), CONSOLE-LEGACY-JSON-PARSE (3rd milestone of deferral) — these have crossed the threshold from "deferred" into "structurally orthogonal to this codebase's lifecycle"; v1.10 planning should make a deliberate keep/drop call rather than auto-carrying them again

---
*Retrospective initialized: 2026-05-27 (v1.0 milestone close)*
*v1.9 milestone section appended: 2026-06-04*
