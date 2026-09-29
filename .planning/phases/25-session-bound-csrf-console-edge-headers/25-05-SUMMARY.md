---
phase: 25-session-bound-csrf-console-edge-headers
plan: 05
subsystem: api
tags: [csrf, routes, wr-04, openapi, account, gdpr, profile]

requires:
  - phase: 25-03
    provides: session-bound signed CSRF middleware (CSRF_MODE legacy/observe/signed), ZZ-CSRFEnforceSpec harness
  - phase: 25-04
    provides: classic dashboard XSRF seam live, production in CSRF_MODE=observe
provides:
  - POST /api/v2/user guarded by csrf.verifyCsrfToken (WR-04, no machine-client exemption)
  - DELETE /api/v2/user, POST /api/user/delete, POST /api/v2/profile, POST /api/user/profile, DELETE /api/v2/gdpr, POST /api/gdpr/revoke guarded (SEC-CSRF-05)
  - csrf factory instantiated in lib/router.profile.js and lib/router.gdpr.js
  - spec/jasmine/CsrfRouteInventorySpec.js, a static guarded/excluded route inventory (local, no services)
  - spec/jasmine/ZZ-CSRFRouteGuardSpec.js, CI behaviour spec under signed + enforce (WR-04 W1-W3, Tier 1 T1-T6)
  - OpenAPI priming contract, the shared Anti-CSRF note and Tier 1 refs
affects: [25-06, 25-07, 25-08]

actuals:
  tokens: 8831
  tasks: 2
  commits: 4
plan_head_before: a5221caa5264e5364c0a4c7f1727a3d81bb300b7
plan_head_after: 013a9761c960140d0d41af10249d49ba97a4030e

tech-stack:
  added: []
  patterns:
    - "Route guard inventory: a static spec reads router sources and locks every guarded registration line and every recorded exclusion (with its reason)"
    - "Destructive-route CI cases use a non-matching all-zero owner, so the handler refuses after the CSRF layer"

key-files:
  created:
    - spec/jasmine/CsrfRouteInventorySpec.js
    - spec/jasmine/ZZ-CSRFRouteGuardSpec.js
  modified:
    - lib/router.user.js
    - lib/router.profile.js
    - lib/router.gdpr.js
    - thinx-api-openapi.yaml

key-decisions:
  - "OpenAPI XsrfTokenHeader ref only (not XsrfTokenCookie) on the Tier 1 operations. Those operations also accept Bearer, and the shared note plus the parameter description state that Bearer and API-key calls are exempt"
  - "T3 also covers DELETE /api/v2/gdpr (same revokeGDPR handler) alongside POST /api/gdpr/revoke, both with the all-zero owner so the handler answers deletion_not_confirmed"

patterns-established:
  - "New guarded route = one registration-line edit + one GUARDED row in CsrfRouteInventorySpec + an OpenAPI XsrfTokenHeader/403 ref and the Anti-CSRF note"

requirements-completed: [SEC-CSRF-04, SEC-CSRF-05]

coverage:
  - id: D1
    description: "POST /api/v2/user registered with csrf.verifyCsrfToken, no exemption (WR-04)"
    requirement: SEC-CSRF-04
    verification:
      - kind: unit
        ref: "spec/jasmine/CsrfRouteInventorySpec.js#guards POST /api/v2/user (router.user.js)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Six Tier 1 account routes guarded, csrf factory in router.profile.js and router.gdpr.js, profile GETs and GDPR consent/transfer routes left open with reasons"
    requirement: SEC-CSRF-05
    verification:
      - kind: unit
        ref: "spec/jasmine/CsrfRouteInventorySpec.js (31 specs)"
        status: pass
      - kind: other
        ref: "Task 2 verify: node --check + factory/zero-owner counts -> TIER1-WIRED"
        status: pass
    human_judgment: false
  - id: D3
    description: "OpenAPI priming contract, shared Anti-CSRF (SEC-CSRF-04/05) note, XsrfTokenHeader and 403 CsrfTokenInvalid refs on /user post+delete, /profile post and /gdpr delete"
    requirement: SEC-CSRF-04
    verification:
      - kind: other
        ref: "Task 1 verify: js-yaml parse + Tier 1 ref check -> OPENAPI-TIER1-OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "Runtime behaviour of the guards under CSRF_MODE=signed + CSRF_ENFORCE=true (W1-W3, T1-T6: cookie-only refused, primed/rotated pair reaches handler, Bearer exempt, repeat refused, refused registration creates nothing)"
    requirement: SEC-CSRF-05
    verification:
      - kind: integration
        ref: "spec/jasmine/ZZ-CSRFRouteGuardSpec.js"
        status: unknown
    human_judgment: true
    rationale: "Needs the CI service stack (CouchDB, Redis, bootstrap.thx). By plan design it runs only on the plan 25-08 push, and nothing is pushed while production is in the CSRF_MODE=observe window"

duration: 15min
completed: 2026-09-29
status: complete
---

# Phase 25 Plan 05: WR-04 and SEC-CSRF-05 Route Guards Summary

**`csrf.verifyCsrfToken` now guards POST /api/v2/user (WR-04) and the six cookie-authenticated account mutations (user delete, profile update, GDPR revoke, plus their v1 twins). The guard set is locked by a static inventory spec, and the CI behaviour spec is ready for the 25-08 push. OpenAPI documents the session-bound priming contract.**

## Performance

- **Duration:** 15 min (continuation; includes the time spent waiting on the signing checkpoint)
- **Started:** 2026-09-29T17:53:59Z
- **Completed:** 2026-09-29T18:09:01Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- WR-04: `POST /api/v2/user` runs the session-bound CSRF check before `createUser`. There is no User-Agent, Origin, cookie or API-key exemption.
- SEC-CSRF-05: `DELETE /api/v2/user`, `POST /api/user/delete`, `POST /api/v2/profile`, `POST /api/user/profile`, `DELETE /api/v2/gdpr` and `POST /api/gdpr/revoke` are guarded. Bearer and API-key calls stay exempt through the existing middleware (D-09). Handlers are unchanged.
- `CsrfRouteInventorySpec` (local, 31 specs) locks 15 guarded rows and 14 recorded exclusions. A row fails when its guard is missing, when an exclusion gains the guard, or when its registration line cannot be found.
- `ZZ-CSRFRouteGuardSpec` (CI) holds W1-W3 for WR-04 and T1-T6 for Tier 1. Delete and revoke calls only ever send a 64-zero owner, and profile calls send `{}`.
- OpenAPI: token described as opaque `<hmac>.<nonce>` (the stale "48 hex" text is gone). The `/csrf-token` description gives the six-step priming contract and names the v1-only guarded routes. The shared `Anti-CSRF (SEC-CSRF-04/05):` note, the header ref and the 403 ref are on all four Tier 1 operations.

## Task Commits

1. **Task 1 (tracer) RED:** `45d4cae2` (test): failing WR-04 inventory row and CI route-guard spec
2. **Task 1 (tracer) GREEN:** `b929a6d8` (feat): guard POST /api/v2/user and document the priming contract
3. **Task 2 RED:** `444b182a` (test): failing Tier 1 inventory rows and CI account-route cases
4. **Task 2 GREEN:** `013a9761` (feat): guard the SEC-CSRF-05 account routes and their same-handler twins

All four commits are GPG-signed (`%G?` = G). Nothing was pushed.

## TDD Gate Compliance

| Task | RED | GREEN | RED evidence |
|------|-----|-------|--------------|
| 1 | `45d4cae2` | `b929a6d8` | RED_EVIDENCE_OK. Target: `guards POST /api/v2/user (router.user.js)` (1 of 25 failed, "guarded route lacks csrf.verifyCsrfToken") |
| 2 | `444b182a` | `013a9761` | RED_EVIDENCE_OK. Target: `guards DELETE /api/v2/user (router.user.js)` (7 of 31 failed: the six missing guards plus the missing factory in router.profile.js and router.gdpr.js) |

No REFACTOR commits were needed.

## Verification Results

- Task 1: `INVENTORY-GREEN` (25 specs, 0 failures), `OPENAPI-TIER1-OK`, `node --check` clean, `grep -c 'app.post("/api/v2/user", csrf.verifyCsrfToken'` = 1.
- Tracer gate: `<verify>` has automated checks only, all green, so expansion continued.
- Task 2: `LOCAL-GUARD-SPECS-GREEN` (inventory + ZZ-CSRFSpec + CsrfSessionFlowSpec: 122 specs, 0 failures), `TIER1-WIRED` (profile_factory=1, gdpr_factory=1, zero_owner_bodies=1).
- `git diff a5221caa..HEAD -- lib/router.user.js lib/router.profile.js lib/router.gdpr.js` changes only registration lines, the two factory lines and comments. No handler body changed.
- The csrf factory is side-effect free (it returns the middleware object and registers no routes), so instantiating it in two more routers is safe.

## Files Created/Modified
- `spec/jasmine/CsrfRouteInventorySpec.js`: static GUARDED / NOT_GUARDED route inventory. Plan 25-07 extends it.
- `spec/jasmine/ZZ-CSRFRouteGuardSpec.js`: CI spec under `CSRF_MODE=signed` + `CSRF_ENFORCE=true` (env restored in afterAll). Plan 25-07 extends it.
- `lib/router.user.js`: guards on POST /api/v2/user, DELETE /api/v2/user and POST /api/user/delete.
- `lib/router.profile.js`: csrf factory; both profile POSTs guarded; GETs annotated as D-10 reads.
- `lib/router.gdpr.js`: csrf factory; DELETE /api/v2/gdpr and POST /api/gdpr/revoke guarded; the four consent/transfer routes annotated with their exclusion reasons.
- `thinx-api-openapi.yaml`: priming contract texts and Tier 1 refs (D-12).

## Decisions Made
- The Tier 1 operations get the `XsrfTokenHeader` ref only, not `XsrfTokenCookie`. They also accept Bearer, where neither is needed, and the note plus the parameter description state the exemption. `/login`, `/password/reset` and `/password/set` keep both refs as they were.
- T3 covers `DELETE /api/v2/gdpr` as well as `POST /api/gdpr/revoke`. Both use the same handler and the non-matching owner, so both are non-destructive.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered
- The Task 1 RED commit was held at a human-action checkpoint because the gpg-agent cache was locked. The operator unlocked it ("done"), and the continuation made the RED commit signed with hooks on. No bypass was used.

## Known Stubs

None.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Code only, not pushed. Production stays in the ≥24 h `CSRF_MODE=observe` window (since 2026-09-29T17:06:30Z). The CI run of `ZZ-CSRFRouteGuardSpec` and the rollout of these guards happen in plan 25-08, after the flip to `signed`.
- Plan 25-07 extends both specs with the remaining D-11 account routes.
- Before 25-08, the D-05 observe-log check should cover `POST /api/v2/user` and the six Tier 1 paths (research assumption A4: no external cookie-auth clients).

---
*Phase: 25-session-bound-csrf-console-edge-headers*
*Completed: 2026-09-29*

## Self-Check: PASSED
