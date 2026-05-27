# THiNX Device API

## What This Is

A long-lived Node/Express IoT device API monorepo (`thinx-device-api`) — bootstrap at `thinx-core.js`, 17 API v2 routers under `lib/router.*.js`, MQTT messaging + WebSocket runtime, Redis-backed session + build queue, CouchDB persistence, Docker-based firmware builder. Sibling to the `services/console` submodule (Vue console + legacy AngularJS console under deprecation). Deployed to swarm on `188.166.23.244` via CircleCI image publish + Swarmpit autoredeploy.

The v1.0 GA milestone (shipped 2026-05-27) closed the 4 v1 backend gaps the Vue console depends on. Going forward, the project scope is the broader backend lifecycle: hygiene refactors, v1.x backlog, the inevitable v2 multi-tenant revamp.

## Core Value

The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.

## Current State

**Shipped:** v1.0 GA Backend Closures (2026-05-27) — 4/4 v1 requirements Verified.

- AUTH-API-01 (Phase 1) — unauthenticated `POST /api/v2/password/reset` → 200 restored
- SEC-PII-01 (Phase 2) — PII/credentials scrubbed from `lib/thinx/owner.js` logs (12+1 sites)
- OPS-01 (Phase 3) — swarm-side autoredeploy restored on `188.166.23.244`
- SEC-DEP-01 (Phase 4) — 29 Dependabot alerts triaged + blocker fixes merged to master+main

Default branches `master` + `main` updated via PR #539 + #540 (2026-05-26T23:09Z). Production at image `sha256:4d3fb789` (Phase 4 deploy). See `.planning/MILESTONES.md` for full v1.0 summary.

**Companion project:** `services/console` submodule has its own GSD workspace; v1.0 frontend is parallel-tracked there. Cross-project coordination owed: SEC-DEP-02 console dependency triage + console-side merge-up (deferred per operator Option B 2026-05-27).

## Next Milestone Goals

To be defined via `/gsd:new-milestone`. Candidate themes surfaced during v1.0 (see `.planning/milestones/v1.0-REQUIREMENTS.md` § "v2 Requirements"):

- **Backend hygiene refactors** (REFACTOR-01..05) — trust-proxy dedup, weak-equality cleanup, WebSocket close handlers, callback→async, jshint/fs-finder devDep reclassification
- **Security posture** (SEC-COOKIE-01, SEC-WS-01, SEC-DEP-02, SEC-PII-02) — httpOnly cookie review, WebSocket handshake hardening, console-side dep triage, historic CouchDB audit-log redaction (GDPR-adjacent)
- **Auth/account lifecycle** (AUTH-REACTIVATE-01, AUTH-RESET-LINK-CONSOLE) — soft-deleted account reactivation flow, reset-email landing on Vue console
- **Operations** (OPS-02, OPS-03) — stale swarm memberlist cleanup, malformed `<image>@` autoredeploy specs
- **Test infra** (TEST-CHAI-01) — chai-http v5 ESM migration (locked per AGENTS.md until forced by superagent v3 CVE)
- **Legacy console deprecation** (CONSOLE-LEGACY-JSON-PARSE) — coordinate Vue cutover; sunset legacy AngularJS console

## Validated Requirements (Historical)

<details>
<summary>v1.0 GA Backend Closures (shipped 2026-05-27)</summary>

- ✓ **AUTH-API-01** — v1.0 (Phase 1) — Unauthenticated `POST /api/v2/password/reset` returns 200 with no-enumeration body; Vue console `Authorization: Bearer null` pattern handled. Class-fix in `lib/router.js` (Bearer-null guard) + body normalization in `lib/router.user.js`. Regression spec `ZZ-RouterPasswordResetSpec.js`.
- ✓ **SEC-PII-01** — v1.0 (Phase 2) — PII/credentials redacted at 12+1 sites in `lib/thinx/owner.js` via `Util.redactEmail` + `Util.redactToken`. Audit-log writes redacted before CouchDB persistence. Regression spec `ZZ-OwnerLogRedactionSpec.js`.
- ✓ **OPS-01** — v1.0 (Phase 3) — Swarm autoredeploy restored on `188.166.23.244` via Rung 1 force-restart of `swarmpit_app`. Push-observe SLA 63s vs ≤300s target. Runbook at `.planning/runbooks/swarm.md`.
- ✓ **SEC-DEP-01** — v1.0 (Phase 4) — 29 Dependabot alerts classified; 4 `package.json` `overrides` edits shipped via `d8e3176c`; runtime-tree `npm audit --omit=dev` high 9→0; merged to master (#539) + main (#540).

</details>

<details>
<summary>Pre-v1 existing capabilities (locked)</summary>

- ✓ Express monolith with `thinx-core.js` bootstrap (HTTP + HTTPS, Let's Encrypt intermediate-rotation tolerance)
- ✓ Session middleware on Redis-backed store, cookie name `x-thx-core`
- ✓ 17 API v2 routers covering apikey/auth/build/device/deviceapi/env/oauth/gdpr/logs/mesh/profile/rsakey/source/transfer/user/admin
- ✓ MQTT messaging + WebSocket runtime (`lib/thinx/messenger.js`, `ws`)
- ✓ Build pipeline: Redis-backed queue → Docker-based firmware builder → CouchDB-stored logs streamed over WebSocket
- ✓ Admin API surface — `requireAdmin` gate on `/api/v2/admin/*`
- ✓ CORS origin reflection for credentialed requests (`lib/router.js:32-56`)
- ✓ Jasmine + nyc test suite under `spec/jasmine/ZZ-*` with chai-http v4

</details>

## Out of Scope

- **services/console** frontend work — owned by the console submodule's GSD project (`services/console/.planning/`)
- **G10** (`thinx_worker` silent-loop on `docker pull`) — lives in the worker repo, different codebase
- **chai-http v5 ESM migration** — dependency lock per `AGENTS.md:82-92`; trigger to reconsider is a Snyk/Dependabot CVE in superagent v3 (tracked as TEST-CHAI-01)
- **Multi-tenant revamp / v2 API features** — future major milestone, not v1.x
- **Edge layer redesign** (Traefik labels, nginx rewrites beyond G8 needs) — only AUTH-API-01 may touch edge config; otherwise out
- **Dashboard data-exposure rework** (AGENTS.md L98) — privacy concern but not a regression vs. legacy; v1.x candidate at most

## Context

- **Tech stack:** Node/Express monolith, CommonJS (no ESM migration), chai-http v4 pinned per `AGENTS.md:82-92`
- **Production deploy:** parent `thinx-staging` push → CircleCI build → image publish → Swarmpit autoredeploy on `188.166.23.244` (SLA ~50-65s observed in v1.0). Manual `./restart.sh` is the fallback (Phase 3 fix made it unnecessary).
- **Signing:** GPG-sign commits is the project default; the 2026-05-26 single-session authorization for unsigned commits is recorded in memory `unsigned-commits-260526` and does not carry forward.
- **AGENTS.md** at parent root is the existing onboarding doc (Codex-runtime convention) — kept as the ops/deploy + dependency-lock rationale reference alongside `.planning/`.
- **Sibling project:** `services/console/.planning/` has 10 phases shipped (v1.0 frontend) + Phase 11 in flight. Parent v1.0 GA and console v1.0 GA land together; v1.x coordination is per-project but cross-references the shared backlog (SEC-DEP-02 etc.).
- **Production image at milestone close:** `thinxcloud/api:latest sha256:4d3fb789` (Phase 4 deploy 2026-05-26T22:35:54Z).

## Constraints

- **Compatibility:** every public route the legacy AngularJS console relied on (which Vue inherited) must keep working — no signature breaks
- **Tech stack:** Node/Express monolith, CommonJS, chai-http v4 (locked per AGENTS.md)
- **Deployment:** parent `thinx-staging` push triggers the deploy pipeline; Phase 3's autoredeploy restoration removes the need for manual `./restart.sh` for normal pushes
- **Signing:** GPG-sign by default; per-session unsigned authorization must be re-granted explicitly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v1.0 scope = 4 GA gap closures only (not "backend at large") | Mirrors console submodule's v1.0 milestone scope; narrowest viable project that closes v1 alongside the frontend | ✓ Good — shipped 4/4 in ~2 days |
| Refresh codebase map (CONCERNS) before drafting REQUIREMENTS | Caught 9 additional concerns (httpOnly: false, !=, PII in logs, duplicate trust proxy, missing socket close handlers) that weren't in the previous map | ✓ Good — SEC-PII-01 scope expanded from 6 → 12+1 sites because of it |
| Keep `AGENTS.md` (Codex-runtime convention) as ops/deploy reference alongside GSD | AGENTS.md is the existing onboarding doc; replacing it would lose ssh details and dependency-lock rationale | ✓ Good — runbook persisted to both `.planning/runbooks/swarm.md` (canonical) and AGENTS.md (local mirror) in Phase 3 |
| Treat `services/*` as external subservices; don't deep-scan console submodule | Console has its own GSD project; double-mapping would create inconsistency | ✓ Good |
| SEC-pii-logs included as v1 GA blocker (vs deferred) | Today's CONCERNS map surfaced 6 leak sites in owner.js (emails + reset_keys + Mailgun token + activation token); GDPR posture for v1 GA; fix is small | ✓ Good — Phase 2 surfaced 6 more sites and an opportunistic 13th during execution; audit-log path (CouchDB persistence) was the highest-priority site |
| Phase 1 fix in `lib/router.js` (class-fix) vs per-route guard | Class-fix closes the entire Bearer-null bug class on ANY route, not just `/password/reset`. Frontend half (Vue `Bearer null` header) stays; backend makes it harmless | ✓ Good — single-file revert path; Vue-side cleanup filed as v1.x candidate |
| Phase 3 Rung-by-rung ladder (Rung 1 autonomous, Rungs 2-4 checkpoint-gated) | Smallest-change preference; force-restart is reversible; deeper rungs (DB rebuild, stale-node cleanup, Swarmpit upgrade) carry swarm-fabric risk | ✓ Good — Rung 1 PASS on first try; Rungs 2-4 stay locked for any future recurrence |
| Phase 4 Slice 3 Option C: skip manual Dependabot UI walk for 22 non-blocker alerts | Operator decision 2026-05-27; runtime-tree primary metric already 9→0; non-blocker alerts expected to age out via natural Dependabot lifecycle | ✓ Good — post-merge rescan confirmed 29 → 3 (1H + 2M) on default branches |
| Phase 4 Slice 4 Option B: defer `services/console` merge-up to separate cross-project coordination | Operator decision 2026-05-27; 194-commit submodule diff (Vue v1.0 rewrite era) is sibling-project scope; SEC-DEP-02 v1.x backlog already tracks console-side dependency triage | — Pending — track via SEC-DEP-02 |
| Verification artifact accepted in SUMMARY.md `verification:` blocks for Phases 1-3 (not separate `*-VERIFICATION.md`) | Verifier agent was not retroactively run; functional verification IS present in SUMMARYs + supporting `.txt` files; process-debt, not functional-debt | ⚠️ Revisit — if any future audit requires structured `*-VERIFICATION.md` per phase for traceability tooling, re-run `gsd-verifier` against the 3 SUMMARYs (low cost; no re-verification needed) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:plan-phase` close-out or equivalent):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated (collapse into `<details>` after milestone close)
3. New requirements emerged? → Add to v1.x backlog (REQUIREMENTS.md) or next-milestone candidates
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Validated requirements collapsed into a `<details>` block
4. Out of Scope reasoning audited
5. Context + Next Milestone Goals updated

---
*Last updated: 2026-05-27 after v1.0 GA milestone completion (4/4 v1 requirements Verified; project transitioned from "v1 GA gap closures" scope to long-lived backend lifecycle)*
