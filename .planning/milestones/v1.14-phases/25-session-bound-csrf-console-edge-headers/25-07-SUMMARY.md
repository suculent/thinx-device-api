---
phase: 25-session-bound-csrf-console-edge-headers
plan: 07
subsystem: api
tags: [csrf, routes, d-11, openapi, inventory, apikey, rsakey, env, admin, transfer, github]

requires:
  - phase: 25-05
    provides: CsrfRouteInventorySpec and ZZ-CSRFRouteGuardSpec, the guard pattern, the shared Anti-CSRF OpenAPI note
  - phase: 25-04
    provides: classic dashboard XSRF seam live (every API-bound $.ajax, GET included, sends X-XSRF-TOKEN)
provides:
  - csrf.verifyCsrfToken on the 23 D-11 account routes (12 credential routes, GitHub token link, 3 admin mutations, 6 device-transfer POSTs)
  - csrf factory in router.apikey.js, router.rsakey.js, router.env.js, router.github.js, router.admin.js, router.transfer.js
  - CsrfRouteInventorySpec extended to 38 guarded rows and 29 recorded exclusions, plus an admin-ordering check
  - ZZ-CSRFRouteGuardSpec extended with C1-C3 (credentials) and A1-A3 (GitHub, admin, transfer) for the 25-08 CI run
  - OpenAPI refs and shared note on 10 more operations; /csrf-token names the admin and v1-only guarded routes
  - Runbook section "Phase 25 guarded-route inventory"
affects: [25-08, 25-10]

actuals:
  tokens: 7089
  tasks: 3
  commits: 5
plan_head_before: e1d4150b1aa531f688a41ddc52bd04e6be7537e2
plan_head_after: 66564a991f38323b22ff87b944a8a7a3494e1c0f

tech-stack:
  added: []
  patterns:
    - "Admin guard order: csrf.verifyCsrfToken before requireAdmin, locked by an inventory check"
    - "Runbook inventory tables generated from the spec's own GUARDED / NOT_GUARDED arrays, so file:line values match the source"

key-files:
  created: []
  modified:
    - lib/router.apikey.js
    - lib/router.rsakey.js
    - lib/router.env.js
    - lib/router.github.js
    - lib/router.admin.js
    - lib/router.transfer.js
    - spec/jasmine/CsrfRouteInventorySpec.js
    - spec/jasmine/ZZ-CSRFRouteGuardSpec.js
    - thinx-api-openapi.yaml
    - .planning/runbooks/csp-csrf-hardening.md

key-decisions:
  - "GET /api/user/rsakey/create is guarded as a state-changing GET. This is safe because the D-18 seam sends X-XSRF-TOKEN on every API-bound $.ajax, and it has been live since 25-04"
  - "The admin mutations run the CSRF check before requireAdmin, so a forged request costs no admin profile lookup. An inventory spec case now enforces this order"
  - "The device-transfer POSTs count as D-11 account mutations and are guarded. The four e-mail GETs stay open with a comment each, because the transfer_id in the query is the capability"
  - "A new ZZ-CSRFRouteGuardSpec helper, loginDynamic(), is used by the two new describe blocks. The 25-05 Tier 1 block keeps its inline login unchanged"

patterns-established:
  - "A new guarded route needs one registration-line edit, a GUARDED row, an OpenAPI ref and note (when the path is in the spec, otherwise a /csrf-token mention) and a runbook table row"

requirements-completed: [SEC-CSRF-04, SEC-CSRF-05]

coverage:
  - id: D1
    description: "12 credential mutations (API keys, deploy keys, env secrets) guarded, including the state-changing GET /api/user/rsakey/create; 6 list GETs recorded as reads"
    requirement: SEC-CSRF-05
    verification:
      - kind: unit
        ref: "spec/jasmine/CsrfRouteInventorySpec.js (INVENTORY-GREEN, 49 specs at Task 1)"
        status: pass
      - kind: other
        ref: "Task 1 verify: node --check + factory=1 guards=4 on router.apikey/rsakey/env"
        status: pass
    human_judgment: false
  - id: D2
    description: "GitHub token POST (both paths), 3 admin mutations (CSRF before requireAdmin) and 6 transfer POSTs guarded; admin users GET, 4 transfer e-mail GETs and GitHub/Google OAuth GETs recorded as exclusions"
    requirement: SEC-CSRF-05
    verification:
      - kind: unit
        ref: "Task 2 verify: inventory + ZZ-CSRFSpec + CsrfSessionFlowSpec + GitHubOAuthIsolationSpec -> LOCAL-GUARD-SPECS-GREEN (170 specs, 0 failures)"
        status: pass
      - kind: other
        ref: "Task 2 verify: admin_ordered=3 transfer_guards=6 github_guard=1 -> D11-REST-WIRED"
        status: pass
    human_judgment: false
  - id: D3
    description: "OpenAPI XsrfTokenHeader, 403 CsrfTokenInvalid and the Anti-CSRF note on all 14 guarded operations; /csrf-token lists the admin and v1-only guarded routes; e-mail GETs and the GDPR consent PUT are not annotated"
    requirement: SEC-CSRF-04
    verification:
      - kind: other
        ref: "Task 3 verify: js-yaml parse + 14-operation check -> OPENAPI-ALL-GUARDS-OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "Runbook 'Phase 25 guarded-route inventory': 38 guarded routes with file:line, 29 exclusions with reasons, D-21 deferral, CsrfRouteInventorySpec named as source of truth"
    verification:
      - kind: other
        ref: "Task 3 verify: RUNBOOK-INVENTORY-OK"
        status: pass
    human_judgment: false
  - id: D5
    description: "Runtime behaviour under CSRF_MODE=signed + CSRF_ENFORCE=true: cookie-only 403 on all 23 D-11 routes (C1, A1), Bearer pass-through (C2, A2, A3), paired GET on rsakey/create (C3)"
    requirement: SEC-CSRF-05
    verification:
      - kind: integration
        ref: "spec/jasmine/ZZ-CSRFRouteGuardSpec.js"
        status: unknown
    human_judgment: true
    rationale: "Needs the CI service stack (CouchDB, Redis, bootstrap.thx). By plan design it runs only on the plan 25-08 push, and nothing is pushed during the CSRF_MODE=observe window"

duration: 6min
completed: 2026-09-29
status: complete
---

# Phase 25 Plan 07: D-11 Account-Route Guards, OpenAPI Completion and Guarded-Route Inventory Summary

**`csrf.verifyCsrfToken` now guards the 23 remaining cookie-authenticated account mutations: API keys, deploy keys (including the state-changing `GET /api/user/rsakey/create`), environment secrets, the GitHub token link, admin session revoke, impersonation and reactivation (with the CSRF check before `requireAdmin`), and the device-transfer POSTs. E-mail transfer links, OAuth redirects and reads stay open, and each one is recorded with a reason. A static spec enforces this 38-guard / 29-exclusion inventory, which is also documented in OpenAPI and in the runbook.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-09-29T18:11:51Z
- **Completed:** 2026-09-29T18:17:28Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Credential routes (tracer): all 12 create/revoke routes in `router.apikey.js`, `router.rsakey.js` and `router.env.js` run the session-bound CSRF check first. The six list GETs stay unguarded.
- `POST /api/github/token` and `/api/v2/github/token` share one guarded array registration. The OAuth initiator and callback GETs are unchanged.
- The admin session revoke, impersonate and reactivate routes register `csrf.verifyCsrfToken, requireAdmin`. `GET /api/v2/admin/users` is unchanged.
- The six transfer POSTs (v1 and v2 request/decline/accept) are guarded. Each of the four e-mail GETs has a comment saying it is a capability link.
- `CsrfRouteInventorySpec`: 70 specs locally, covering 38 GUARDED rows, 29 NOT_GUARDED rows, the admin-ordering check and the factory check.
- `ZZ-CSRFRouteGuardSpec` has two new describe blocks. C1 and A1 loop over all 23 routes for the cookie-only 403. C2 covers Bearer pass-through on apikey, rsakey and env. C3 sends a paired GET to rsakey/create. A2 checks that a Bearer impersonate is refused by `requireAdmin`, not by the CSRF layer. A3 checks that a Bearer transfer decline answers `transfer_id_missing`. Admin paths only use the all-zero id and every body is `{}`.
- OpenAPI: the header ref, the 403 ref and the shared note are on `/apikey` post+delete, `/rsakey` put+delete, `/env` put+delete, `/github/token` post and `/transfer/request|accept|decline` post. `/csrf-token` names the admin mutations and the v1-only routes, and states which flows are not guarded.
- Runbook: new section "Phase 25 guarded-route inventory". Its tables are generated from the spec arrays, with file:line for every row.

## Task Commits

1. **Task 1 (tracer) RED:** `d4113a4b` (test): failing D-11 credential inventory rows and CI cases
2. **Task 1 (tracer) GREEN:** `98c8b5e7` (feat): guard the D-11 credential mutations
3. **Task 2 RED:** `435547d2` (test): failing GitHub token, admin and transfer rows and CI cases
4. **Task 2 GREEN:** `ae869a2e` (feat): guard the GitHub token link, admin mutations and device-transfer POSTs
5. **Task 3:** `66564a99` (docs): OpenAPI anti-CSRF refs and the guarded-route inventory

All five commits are GPG-signed (`%G?` = G) and hooks ran on each. Nothing was pushed.

## TDD Gate Compliance

| Task | RED | GREEN | RED evidence |
|------|-----|-------|--------------|
| 1 | `d4113a4b` | `98c8b5e7` | RED_EVIDENCE_OK. Target: `guards POST /api/user/apikey (router.apikey.js)`. 13 of 49 failed: the 12 missing guards and the missing factory. |
| 2 | `435547d2` | `ae869a2e` | RED_EVIDENCE_OK. Target: `guards POST /api/github/token (router.github.js)`. 13 of 70 failed: the 11 missing guards, the admin ordering and the missing factories. All 29 exclusion rows passed in RED, so every registration line was found. |

No REFACTOR commits were needed.

## Verification Results

- Task 1: `INVENTORY-GREEN` (49 specs, 0 failures). `factory=1 guards=4` on all three routers. `node --check` is clean.
- Tracer gate: the run is interactive, the mode is `end-of-phase`, and `<verify>` has automated checks only. The re-run was green, so expansion continued.
- Task 2: `LOCAL-GUARD-SPECS-GREEN` (170 specs, 0 failures). `D11-REST-WIRED` (admin_ordered=3, transfer_guards=6, github_guard=1).
- Task 3: `OPENAPI-ALL-GUARDS-OK` (all 14 operations from 25-05 and 25-07; no over-annotation of the e-mail GETs or `/gdpr` put). `RUNBOOK-INVENTORY-OK`.
- Plan level: inventory, ZZ-CSRFSpec, CsrfSessionFlowSpec, GitHubOAuthIsolationSpec, SecretsSweepSpec and LoggingQualityAuditSpec ran together with 212 specs and 0 failures. SecretsSweepSpec loads `router.github.js` with a stub app, and the new factory line does not affect it.
- `git diff e1d4150b..HEAD -- lib/` changes only registration lines, factory lines and comments. No handler body changed.
- CI stays fail-open for every other spec. `spec/mnt/data/conf/config.json` has `csrf_enforce: false`, and `ZZ-CSRFRouteGuardSpec` restores `CSRF_MODE` and `CSRF_ENFORCE` in afterAll. The existing ZZ-Router*Spec cookie calls on these routes are therefore unaffected.

## Files Created/Modified
- `lib/router.apikey.js`, `lib/router.rsakey.js`, `lib/router.env.js`: csrf factory, with 4 guarded registrations each
- `lib/router.github.js`: csrf factory and the guarded token POST
- `lib/router.admin.js`: csrf factory and three `csrf.verifyCsrfToken, requireAdmin` registrations
- `lib/router.transfer.js`: csrf factory, six guarded POSTs and four commented e-mail GETs
- `spec/jasmine/CsrfRouteInventorySpec.js`: the D-11 rows, the exclusions and the admin-ordering check
- `spec/jasmine/ZZ-CSRFRouteGuardSpec.js`: `CREDENTIALS` and `ACCOUNT_REST` tables, the `loginDynamic()` and `sendBody()` helpers, and C1-C3 and A1-A3
- `thinx-api-openapi.yaml`: D-12 refs on 10 operations and the extended `/csrf-token` list
- `.planning/runbooks/csp-csrf-hardening.md`: the Phase 25 guarded-route inventory

## Decisions Made
- See key-decisions in the frontmatter. The main one: the admin CSRF check runs before `requireAdmin`, and the inventory spec now enforces that order in addition to checking that the guard is present.

## Deviations from Plan

None. The plan was executed as written. The admin-ordering assertion in the inventory spec implements the plan's "Admin registration order" behavior bullet, so it adds no scope.

## Issues Encountered
None.

## Known Stubs

None.

## Threat Flags

None. The plan adds no new endpoints or auth paths. It only adds a middleware in front of existing handlers.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Code only, not pushed. These guards and the 25-05 guards reach production in plan 25-08, after the observe window (since 2026-09-29T17:06:30Z) and the `signed` flip. That push is also the first CI run of the new C1-C3 and A1-A3 cases.
- Before 25-08, the D-05 observe-log check should also cover the 23 D-11 paths (research assumption A4: no external cookie-auth clients). The Vue console reaches `/api/v2/apikey`, `/api/v2/github/token` and `/api/v2/admin/*` with Bearer, so those calls are exempt. The classic dashboard reaches `/user/apikey*`, `/user/rsakey/*`, `/user/env/*` and `/transfer/request` through the seam.

---
*Phase: 25-session-bound-csrf-console-edge-headers*
*Completed: 2026-09-29*

## Self-Check: PASSED
