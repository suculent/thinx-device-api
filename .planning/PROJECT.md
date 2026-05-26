# THiNX Device API — v1 GA Backend Closures

## What This Is

A narrow, time-boxed GSD project tracking the remaining backend and operational work in the `thinx-device-api` parent monorepo needed to ship v1.0 GA. Sibling to the `services/console` submodule's GSD project, which is wrapping up v1.0 from the frontend side. Scope is the main Node/Express API (`thinx-core.js`, `lib/`, `spec/`) plus the deployment pipeline operating against it.

## Core Value

The IoT device API stays available and trustworthy through v1.0 GA — every legacy-console capability that the Vue console depends on (auth, profile, devices, transformers, builds) must continue to work end-to-end, with no v1.x backlog item promoted into the v1 release.

## Requirements

### Validated

<!-- Inferred from the refreshed codebase map and the existing production deploy. These are existing capabilities that already ship; locked unless an Active item invalidates them. -->

- ✓ Express monolith with `thinx-core.js` bootstrap (HTTP + HTTPS server, Let's Encrypt intermediate-rotation tolerance) — existing
- ✓ Session middleware on Redis-backed store, cookie name `x-thx-core` — existing
- ✓ 17 API v2 routers (`lib/router.*.js`) covering apikey, auth, build, device, deviceapi, env, github/google/slack OAuth, gdpr, logs, mesh, profile, rsakey, source, transfer, user, admin — existing
- ✓ MQTT messaging + WebSocket runtime (`lib/thinx/messenger.js`, `ws`) — existing
- ✓ Build pipeline: Redis-backed queue → Docker-based firmware builder → CouchDB-stored build logs streamed over WebSocket — existing
- ✓ Admin API surface (Phase 10 in console submodule) — `requireAdmin` gate on `/api/v2/admin/*` — existing
- ✓ CORS origin reflection for credentialed requests (`lib/router.js:32-56`) — existing
- ✓ Jasmine + nyc test suite under `spec/jasmine/ZZ-*` with chai-http v4 — existing

### Active

<!-- v1 GA hypotheses. Each is validated by shipping a fix + a regression-test or operational verification. -->

- [ ] **G8** — Restore `POST /api/v2/password/reset` 200 response for unauthenticated callers on rtm. Seed: `.planning/G8-INVESTIGATION.md`. Cross-ref: console ROADMAP Phase 11 Wave 1.
- [ ] **OPS-swarmpull** — Diagnose and restore swarm-side auto-pull on `188.166.23.244` (broke 14:44 CET 2026-05-25). Manual `./scripts/stack-deploy` is the current workaround. Cross-ref: console `v1.x-backlog.md` (OPS-swarmpull).
- [ ] **DEP-triage** — Sort the 11 high / 17 moderate dependabot findings (surfaced 2026-05-26): mark each as v1 GA blocker (fix now) or v1.x deferred (with rationale). Address the v1 blockers.
- [ ] **SEC-pii-logs** — Scrub PII from error logs in `lib/thinx/owner.js` (emails at L499; reset keys at L451/L474/L583/L647; Mailgun token at L95; activation token at L228). Surfaced by today's CONCERNS map.

### Out of Scope

- **G10** (thinx_worker silent-loop on `docker pull`) — lives in the worker repo, different codebase
- **services/console** frontend work — owned by the console submodule's GSD project (`services/console/.planning/`)
- **chai-http v5 ESM migration** — explicit dependency lock per `AGENTS.md:82-92`; trigger to reconsider is a Snyk/Dependabot CVE in superagent v3
- **Future API features beyond v1** (multi-tenant revamp, etc.) — punt to a v1.x or v2 milestone
- **Refactors not required to close a v1 gap** — the callback/promise inconsistency, duplicate `app.set('trust proxy', ...)`, the `!=` in `password_reset` L476 — these become v1.x candidates only if a v1 Active item exercises them
- **Edge layer redesign** (Traefik labels, nginx) — only the G8 investigation may touch edge config; otherwise out

## Context

- Sibling project: the console submodule's GSD workspace at `services/console/.planning/` has shipped 10 phases and an in-progress Phase 11 (Wave 2 / G9 closed today). The parent's v1 GA depends on both halves landing.
- Today's deploy unit (2026-05-26): console G9 fix `4be39f3` + docs `1a467f1`; parent submodule bump `382cebfc`; G8 seed `bfa84228`; codebase-map refresh `0a39214`. All unsigned by user authorization (one-time, GPG pinentry unavailable this session).
- `AGENTS.md` at parent root is the existing session-notes document for this repo (Codex-runtime convention) — kept as the deployment + ops reference; this PROJECT.md is the GSD project context.
- The console submodule pins to `1a467f1` and is on `thinx-staging`. Parent is on `thinx-staging`. Both push to the same deploy pipeline (CircleCI rebuilds the Vue image on parent push per memory `deployment-console-thinx-cloud` and `ci-thinx-cloud-console`).

## Constraints

- **Tech stack**: Node/Express monolith, CommonJS (no ESM migration this milestone); chai-http v4 pinned per `AGENTS.md:82-92`
- **Compatibility**: every public route the legacy AngularJS console relied on (which Vue inherited) must keep working — no signature breaks
- **Deployment**: parent `thinx-staging` push triggers the deploy pipeline; manual `./scripts/stack-deploy` fallback may be needed until OPS-swarmpull is fixed
- **Signing**: GPG-sign commits is the project default; the 2026-05-26 setup-commit authorization for unsigned commits is single-session and recorded in memory `unsigned-commits-260526`
- **Timeline**: v1.0 GA close — the four Active items should land before declaring v1 shipped

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Scope = v1 GA gap closures + ops (not "backend at large") | Mirrors console submodule's v1.0 milestone scope; narrowest viable project that closes v1 alongside the frontend | — Pending |
| Refresh May-19 codebase map before drafting REQUIREMENTS | Caught 9 additional concerns (httpOnly: false, !=, PII in logs, duplicate trust proxy, missing socket close handlers, etc.) that weren't in the previous map | ✓ Good |
| Keep `AGENTS.md` (Codex-runtime convention) as the ops/deploy reference alongside new GSD planning files | AGENTS.md is the existing onboarding doc; replacing it would lose ssh details and dependency-lock rationale | — Pending |
| Treat `services/*` as external subservices in the codebase map, do not deep-scan the console submodule | Console has its own GSD project; double-mapping would create inconsistency | ✓ Good |
| SEC-pii-logs included as v1 GA blocker (vs deferred) | Today's CONCERNS map surfaced 6 leak sites in owner.js (emails + reset_keys + Mailgun token + activation token); GDPR posture for v1 GA; fix is small | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-26 after initialization*
