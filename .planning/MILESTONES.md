# Milestones

## v1.0 — v1 GA Backend Closures (Shipped: 2026-05-27)

**Delivered:** Every legacy-console capability the Vue console depends on (auth, profile, devices, transformers, builds) continues to work end-to-end through v1.0 GA — 4/4 v1 backend requirements verified.

**Stats:**
- Phases: 4 | Plans: 8
- Timeline: 2026-05-26 → 2026-05-27 (~2 days)
- Git range: `6d0af4dd` (roadmap creation) → `71fab68b` (milestone audit)
- Changes: 337 files modified, +67,439 / −11,229 LOC
- Audit status: `tech_debt` (no blockers; intentionally-deferred v1.x items + 1 documented artifact gap)

**Key accomplishments:**

1. **AUTH-API-01** (Phase 1) — Restored unauthenticated `POST /api/v2/password/reset` 200 response on rtm. Class-fix Bearer-null guard in `lib/router.js` + no-enumeration body normalization in `lib/router.user.js`. Vue console "Forgot password?" round-trip verified end-to-end against image `0a0e6b32`. New regression spec `ZZ-RouterPasswordResetSpec.js` covers the `Authorization: Bearer null` trigger.
2. **SEC-PII-01** (Phase 2) — Eliminated raw PII/credentials from `lib/thinx/owner.js` logs: 12 leak sites swept (+1 opportunistic 13th) via new `Util.redactEmail` / `Util.redactToken` helpers. Audit-log writes (`alog.log`) now redact reset_keys before CouchDB persistence. Deployed as image `3a461b3d`; `ZZ-OwnerLogRedactionSpec.js` regression coverage in CI.
3. **OPS-01** (Phase 3) — Restored swarm-side autoredeploy on `188.166.23.244` via Rung 1 force-restart of `swarmpit_app` (silent watcher degradation, Swarmpit 1.9). Push-observe SLA: 63s vs ≤300s target (237s under budget). Zero source-code commits. Canonical runbook persisted to `.planning/runbooks/swarm.md`.
4. **SEC-DEP-01** (Phase 4) — Classified 29 GitHub Dependabot alerts via closed-set taxonomy (7 blocker / 19 deferred-stale / 3 deferred-dev-only). 4 surgical `package.json` `overrides` edits shipped atomically (commit `d8e3176c`); runtime-tree `npm audit --omit=dev` high count 9 → 0 on rtm.thinx.cloud. Merged to default branches: PR #539 (master, `465b73c2`) + PR #540 (main, `c0530571`) at 2026-05-26T23:09Z. Swarmpit autoredeploy (Phase 3 confirmation): 49s — beat the Phase 3 baseline by 14s.

**Tech debt carried into v1.x backlog:**

- **Process debt:** Phases 1-3 carry verification evidence in their `SUMMARY.md` `verification:` blocks + supporting `.txt` artifacts but lack structured `*-VERIFICATION.md` artifacts. Functional verification PASS; artifact-location PASS via SUMMARYs.
- **v1.x backlog items filed:** `REFACTOR-05` (jshint/fs-finder runtime-deps misclassification), `SEC-DEP-02` (services/console 15-alert dependency triage), `OPS-02` (stale swarm memberlist `b356ad8e1d60`), `OPS-03` (4 stack services with malformed `<image>@` autoredeploy specs), `AUTH-REACTIVATE-01` (no user-facing soft-deleted account reactivation), `AUTH-RESET-LINK-CONSOLE` (reset email lands on legacy AngularJS console, not Vue), `CONSOLE-LEGACY-JSON-PARSE` (legacy AngularJS console JSON-parse bug), `SEC-PII-02` (historic CouchDB `managed_logs` carry pre-fix raw reset_keys), `TEST-CHAI-01` (chai-http v5 ESM migration locked per AGENTS.md), various `REFACTOR-01..04`.
- **Operator-deferred (paper trail):** Slice 2 (CircleCI as regression gate), Slice 3 (Option C: 22 non-blocker Dependabot alerts left to age out), Slice 4 (Option B: services/console merge-up deferred to sibling-project coordination).

**Companion project:** `services/console` submodule has its own GSD workspace (10 phases shipped + Phase 11 in flight). SEC-DEP-02 trigger + Slice 4 merge-up coordination owed are tracked in `services/console/.planning/v1.x-backlog.md`. Parent-project v1.0 GA tag should coordinate with the console's v1.0 tag.

**Archives:**
- Roadmap: `.planning/milestones/v1.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

---
