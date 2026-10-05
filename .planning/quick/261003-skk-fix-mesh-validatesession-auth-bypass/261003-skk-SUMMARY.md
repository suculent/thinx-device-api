---
phase: quick-261003-skk
plan: 01
subsystem: auth
tags: [security, auth, apikey, mesh, csrf, idor, tdd, validateSession]

requires:
  - phase: quick-261003-s59
    provides: "exact constant-time APIKey.verify, sanitka.apiKey(api_key) in lib/router.js, Util.safeEqual"
provides:
  - "Util.validateSession that trusts only router-verified identities (bearer marker, session owner, verified API-key owner)"
  - "Util.ownerFromRequest without a body-owner fallback"
  - "lib/router.js POST API-key verification for `owner`, else `owner_id`, recording req.thx_apikey_owner"
  - "mesh handlers acting on the authenticated owner only, CSRF-guarded mutations"
  - "local regression spec spec/jasmine/MeshSessionAuthSpec.js (no Redis/CouchDB)"
affects: [csrf-inventory, router.device, mesh, apikey-auth, D-21]

actuals:
  tokens: 10615
  tasks: 3
  commits: 5
plan_head_before: 715b38b96ceaf10f958b72261cce68ccffb3e6a6
plan_head_after: 05ebbd85896e723d8d1fb1a33b57ca45ad122636

tech-stack:
  added: []
  patterns:
    - "Handlers trust only request-local markers set by lib/router.js (req.thx_auth, req.thx_apikey_owner), never body fields or raw headers"
    - "Acting owner always via Util.ownerFromRequest(req)"

key-files:
  created:
    - spec/jasmine/MeshSessionAuthSpec.js
    - .planning/todos/pending/2026-10-03-device-udid-routes-missing-owner-check.md
    - .planning/todos/pending/2026-10-03-logs-tail-handler-undefined-router.md
  modified:
    - lib/thinx/util.js
    - lib/router.js
    - lib/router.mesh.js
    - lib/router.device.js
    - spec/jasmine/UtilSpec.js
    - spec/jasmine/CsrfRouteInventorySpec.js
    - spec/jasmine/ZZ-RouterMeshesSpec.js
    - .planning/runbooks/csp-csrf-hardening.md
    - .planning/todos/completed/2026-10-03-validate-session-trusts-unverified-apikey-body.md (moved from pending)

key-decisions:
  - "validateSession checks the verified req.thx_auth === 'bearer' marker instead of Authorization-header presence, so correctness no longer depends on lib/router.js mounting first"
  - "An API key authenticates only for the owner it is stored under: router.js verifies against the body's owner (else owner_id) and records that owner request-locally"
  - "CSRF: Phase 25 D-21 lifted for lib/router.mesh.js mutations only; mesh lists and device mesh attach/detach stay unguarded"
  - "Udid-keyed device routes' missing ownership check is transferred to a pending todo (not body trust, out of scope)"

patterns-established:
  - "Bare-app e2e harness: real lib/router.js + feature router on express with a Map-backed redis stub and a recording owner fake"

requirements-completed: [T-s59-09]

coverage:
  - id: D1
    description: "Unauthenticated or forged owner_id/api_key bodies answer 401 on every mesh route, method and Origin, and never reach the owner library"
    requirement: "T-s59-09"
    verification:
      - kind: integration
        ref: "spec/jasmine/MeshSessionAuthSpec.js#MESH-AUTH core: unauthenticated and forged"
        status: pass
    human_judgment: false
  - id: D2
    description: "Session, Bearer and verified-API-key requests act on their own owner; a body owner never overrides"
    requirement: "T-s59-09"
    verification:
      - kind: integration
        ref: "spec/jasmine/MeshSessionAuthSpec.js#MESH-AUTH core: session and API-key owners"
        status: pass
    human_judgment: false
  - id: D3
    description: "validateSession / ownerFromRequest trust only router-verified identities"
    requirement: "T-s59-09"
    verification:
      - kind: unit
        ref: "spec/jasmine/MeshSessionAuthSpec.js#MESH-AUTH core: validateSession, #MESH-AUTH core: ownerFromRequest; spec/jasmine/UtilSpec.js#should reject an unverified owner_id + api_key body (261003-skk)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Mesh mutations CSRF-guarded with Bearer and cookieless API-key exemptions; lists unguarded; inventory pinned"
    verification:
      - kind: integration
        ref: "spec/jasmine/MeshSessionAuthSpec.js#MESH-AUTH csrf: mesh mutations"
        status: pass
      - kind: unit
        ref: "spec/jasmine/CsrfRouteInventorySpec.js"
        status: pass
    human_judgment: false
  - id: D5
    description: "CI regressions (4 noauth 401 cases in ZZ-RouterMeshesSpec) and classic/Vue channel create+delete under production CSRF"
    verification:
      - kind: integration
        ref: "spec/jasmine/ZZ-RouterMeshesSpec.js (261003-skk cases, CI only)"
        status: unknown
    human_judgment: true
    rationale: "ZZ specs need the full app with Redis/CouchDB (CI only, after the orchestrator pushes); the console channel create/delete check is a post-deploy operator step"

duration: 25min
completed: 2026-10-03
status: complete
---

# Quick 261003-skk: Fix mesh validateSession auth bypass Summary

**`Util.validateSession` now trusts only identities that `lib/router.js` has verified. `lib/router.js` key-verifies `owner`/`owner_id` POST bodies against that owner, and the mesh handlers act only on the authenticated owner. The four mesh mutations are CSRF-guarded. This closes an unauthenticated create/delete/list for any owner, which also reached every other `validateSession` route.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-03T18:37Z (approx.)
- **Completed:** 2026-10-03T19:05Z
- **Tasks:** 3 / 3
- **Files modified:** 12 (798 insertions, 108 deletions)

## Accomplishments

- Closed T-s59-09. A body `{owner_id: <any>, api_key: <anything>}` no longer authenticates any `validateSession` route. That covers any method, any `Origin`, and both POST and PUT/DELETE v2.
- An API key binds to its owner. A's key sent with `owner_id: B` answers 401. A's key or hash with `owner_id: A` or `owner: A` works on POST mesh list, create and delete. `POST /api/mesh/list` with a valid key now works (it answered 400 before).
- Session and Bearer requests always act on their own owner. The mesh handlers, `attachMesh` and `ownerFromRequest` no longer read a body owner.
- The mesh mutations carry `csrf.verifyCsrfToken`, which lifts D-21 for `lib/router.mesh.js` only. The inventory spec and the runbook record the new rows.
- The debug line that logged the whole delete body, including `api_key`, is gone (T-skk-06).
- A non-string `owner`/`owner_id`/`api_key` now answers 401 instead of a sanitka TypeError 500 (T-skk-07).

## Task Commits

1. **Task 1 RED** `e88e8e61`: `test(quick-261003-skk): failing spec for mesh validateSession auth bypass` (spec files only)
2. **Task 1 GREEN** `e7b76d47`: `fix(quick-261003-skk): verified-only validateSession; mesh acts on the authenticated owner`
3. **Task 2 RED** `22713f55`: `test(quick-261003-skk): pin CSRF guard on mesh mutation routes`
4. **Task 2 GREEN** `660d0e1b`: `fix(quick-261003-skk): CSRF-guard mesh mutation routes (D-21 lifted for mesh)`
5. **Task 3** `05ebbd85`: `fix(quick-261003-skk): attachMesh owner from authenticated identity; CI mesh bypass regressions; todos`

All five commits are **unsigned**. GPG was locked (`gpg: cannot open '/dev/tty'`), so each one fell back to `git -c commit.gpgsign=false commit` under the operator's standing exception. `--no-verify` was never used. Nothing was pushed.

## Test Evidence

- **RED (Task 1, before any lib/ change):** `MeshSessionAuthSpec`: `48 specs, 30 failures` (exit 3). `UtilSpec`: `25 specs, 1 failure` (the inverted case). Every failure was an assertion on the planned behaviour. For example, forged create/delete/PUT/DELETE answered **200** with the owner library called, and POST list answered 400. `gsd-tools check tdd-red-evidence` gave **RED_EVIDENCE_OK** (target: "MESH-AUTH core: unauthenticated and forged answers 401 for POST /api/mesh/create with an unverifiable api_key"; the jasmine run was converted to TAP).
- **After Task 1:** `MESH-AUTH core` filter `38 specs, 0 failures`. The 5 remaining failures were all `MESH-AUTH csrf:` cases, as the plan expected for Task 2.
- **RED (Task 2):** `CsrfRouteInventorySpec`: `77 specs, 5 failures` (the 4 mesh GUARDED rows and the factory check).
- **Final green:**
  - `MeshSessionAuthSpec`: `48 specs, 0 failures`
  - `UtilSpec`: `25 specs, 0 failures`
  - `CsrfRouteInventorySpec`: `77 specs, 0 failures`
- The verify blocks for all three tasks printed `SKK-CORE-GREEN`, `SKK-CSRF-GREEN` and `SKK-AUDIT-GREEN`.
- ESLint is clean on all eight changed JS files. No `fit`/`fdescribe`/`xit`/`xdescribe` in the touched specs.
- Regression sweep of the local specs that load the changed modules, all 0 failures: ApikeyExactMatch 35, BuildLogOwner 14, CsrfSessionFlow 20, GitHubOAuthIsolation 9, LogRouterPaging 36, LoggingQualityAudit 10, UtilTimezone 8, SecretsSweep 32, StatsPrivacy 7. StatisticsV2Spec fails locally only because its `beforeAll` needs a live InfluxDB. That is environmental, and the spec never loads the changed code paths.

## Authorization-header claim and the switch to the marker

Confirmed. A request that reaches a route handler with an Authorization header was verified by `lib/router.js`:
- An unusable token ("Bearer null", empty, or non-Bearer) is stripped.
- A failed verify ends the request with 403, and a revoked token gets 401.
- Success sets `req.thx_auth = "bearer"` and binds the token owner into `req.session.owner`.

That held only because `thinx-core.js:382` mounts `lib/router.js` before every other router. `validateSession` now checks `req.thx_auth === "bearer"` instead of header presence, so it no longer depends on mount order. The spec pins header-only → false and garbage Bearer → 403.

## CSRF decision (D-21 lifted for router.mesh.js only)

The session path is CSRF-protected. The API-key path is exempt but key-verified. Guarded: POST `/api/mesh/create`, POST `/api/mesh/delete`, PUT `/api/v2/mesh` and DELETE `/api/v2/mesh`. The three list routes stay unguarded. The device mesh attach/detach in `lib/router.device.js` stay deferred with the other device routes.

Lockout analysis:
- The classic console sends `X-XSRF-TOKEN` on every API-bound ajax call through the D-18 `$.ajaxSetup` seam.
- Vue uses Bearer, which is exempt.
- A cookieless verified API-key call is exempt.
- An API key riding a session cookie without a token gets 403 (25-REVIEW CR-01 semantics, pinned).

Production enforces CSRF, so the guard goes live on deploy. `CSRF_ENFORCE` remains the rollback flag.

## Real-client inventory

- **Vue** (`services/console/vue/src/store/channels.js`) sends GET/PUT/DELETE `/api/v2/mesh` with Bearer and no owner field. It keeps working.
- **Classic console** (`thinx-api.js`, `ChannelController.js`) sends a cookie-session POST to `/mesh/create` and `/mesh/delete` with its own `owner_id`. The field is now ignored and the session owner is used, so it keeps working, with the D-18 token covering CSRF.
- **Firmware / device libraries:** no mesh calls.
- **No client or spec** sends a `{owner_id, api_key}` body. The one UtilSpec case that pinned the bypass is inverted.
- `docs/APIs.md:115` documents `POST /api/mesh/list [owner/apikey auth]`, and that call now works with a verified key.

## validateSession caller audit (final state)

| Caller | How it picked the acting owner | Final disposition |
|---|---|---|
| `lib/router.mesh.js` delete/create (and v2 PUT/DELETE) | body `owner_id` first, session second | **Fixed** (`e7b76d47`): `Util.ownerFromRequest(req)` only. CSRF-guarded (`660d0e1b`) |
| `lib/router.mesh.js` list (GET/POST, v2 GET) | session only; implicit global `owner_id` | **Fixed** (`e7b76d47`): merged `listMeshes`, `ownerFromRequest`, declared `const`. Verified-API-key POST list works |
| `lib/router.device.js` deleteDevice, attachSource, detachMesh | `Util.ownerFromRequest` (session, then raw body `owner`) | **Fixed centrally** (`e7b76d47`): the body fallback is replaced by the verified API-key owner |
| `lib/router.device.js` attachMesh | session, then body `owner` fallback | **Fixed** (`05ebbd85`): `Util.ownerFromRequest(req)`. The path was already unreachable after Task 1, because PUT is never API-key verified |
| `lib/router.device.js` editDevice, getDeviceDetail, setDeviceEnvs, detachSource | no owner at all; lookup by udid only | **Not body trust**: a missing ownership check (cross-owner IDOR for any authenticated caller). Unauthenticated access is closed by Task 1. **Todo** `2026-10-03-device-udid-routes-missing-owner-check.md` (high) |
| `lib/router.device.js` listDevices, pushConfiguration, runTransformer, publishNotification, getMessengerData, `/api/device/data/:udid` | session owner | OK |
| `lib/router.build.js` build, getArtifacts | session owner; getArtifacts requires body `owner` to equal it | OK (consistency check, not the acting owner) |
| `lib/router.transfer.js` requestTransfer | session owner | OK |
| `lib/router.transfer.js` postDecline/postAccept | body `owner` presence only; `transfer_id` is the capability | OK, documented |
| `lib/router.gdpr.js` revoke, transfer | session owner (revoke requires body `owner` to equal it) | OK |
| `lib/router.profile.js`, `router.env.js`, `router.rsakey.js`, `router.github.js`, `router.logs.js`, `router.source.js`, `router.apikey.js`, `router.user.js` (stats, chat) | session owner only | OK. Under API-key auth these act on a null owner: pre-existing, unchanged, and not a cross-owner path |
| `lib/middleware/requireAdmin.js` | session owner, then admin profile check | OK |
| `thinx-core.js:576` logTailImpl | `router.validateSession` on an undefined `router` → TypeError → 500 | Fails closed. **Todo** `2026-10-03-logs-tail-handler-undefined-router.md` (low) |

## Operator-facing behaviour changes

- Every POST body that names `owner` or `owner_id` plus `api_key` is now key-verified against that owner. A wrong key answers 401, and so does a non-string value.
- Mesh routes ignore a body owner. The acting owner is the session/Bearer owner or the verified API-key owner.
- The API-key path on mesh is **POST-only**. v2 GET/PUT/DELETE need a session or Bearer.
- `POST /api/mesh/list` now works with a valid key.
- Mesh mutations need the CSRF token on cookie sessions. Bearer and cookieless verified-API-key calls are exempt.
- `Origin: device` requests can no longer authenticate `validateSession` routes by body key.
- `createMesh` with no resolvable owner now answers `400 owner_invalid` (it was `200 {success:false}`). This shape is reachable only by a validated request with no owner.

## Severity note

Before this fix, **every `Util.validateSession` route was reachable unauthenticated** with a body carrying any `owner_id` plus any `api_key`. That includes the udid-keyed device edit, detail, envs and detach-source routes, which pass no owner at all. So any device could be edited unauthenticated if its udid was known. The router's key check ran only on POST bodies naming `owner`, so non-POST methods and `Origin: device` requests skipped it entirely.

## Todos

- **Moved:** `.planning/todos/pending/2026-10-03-validate-session-trusts-unverified-apikey-body.md` → `.planning/todos/completed/` with a `## Resolution` section.
- **Created:** `.planning/todos/pending/2026-10-03-device-udid-routes-missing-owner-check.md` (api, high; T-skk-09).
- **Created:** `.planning/todos/pending/2026-10-03-logs-tail-handler-undefined-router.md` (api, low; T-skk-10).

## Decisions Made

See frontmatter `key-decisions`. The CSRF and marker decisions follow the plan exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed the now-unused `Sanitka` require from `lib/router.mesh.js`**
- **Found during:** Task 1 GREEN
- **Issue:** after the handlers stopped calling `sanitka.owner`, the require was unused, and ESLint would flag it (the plan requires ESLint to be clean).
- **Fix:** deleted the line.
- **Commit:** `e7b76d47`

**2. [Rule 2 - Hygiene] The five describes are wrapped in one outer `describe("MESH-AUTH (quick 261003-skk)")` that holds the harness beforeAll/afterAll**
- **Issue:** a truly file-top-level `beforeAll` registers on jasmine's global suite. In CI (all specs in one run) it would boot this harness around unrelated specs.
- **Fix:** the hooks run once per file inside the wrapper. The five describe names are verbatim, and the `MESH-AUTH core` substring filter still selects them. I also added one spec, "has a session cookie and a Bearer token for OWNER_A", as a harness sanity check.
- **Commit:** `e88e8e61`

**3. [Rule 1 - Robustness] The harness pre-seeds the JWT secret in the Redis stub**
- **Issue:** `JWTLogin.init()` (run at router mount) and `app.login.sign()` could each generate a different secret if they raced.
- **Fix:** seeded `__JWT_SECRET__` before mounting. Spec-only.
- **Commit:** `e88e8e61`

**4. [Minor] Comment on the POST `/api/mesh/list` registration updated** (it said the body "should require API Key authentication"). The registration line is unchanged.

**5. [Minor] `ownerFromRequest` also returns null for a non-string session owner** (the plan's "Return null unless the result is a string" applied to both sources).

**Total deviations:** 3 auto-fixed plus 2 minor. **Impact:** none on scope. All changes serve lint cleanliness, CI isolation or spec determinism.

## Issues Encountered

- GPG signing unavailable (no tty). I used the unsigned fallback under the standing exception, as noted above.
- The first Task 3 commit attempt failed before committing (`pathspec ... did not match`), because the old pending path was already staged as a `git mv` rename. The retry omitted that path, and the commit includes the rename (R055).

## TDD Gate Compliance

- Task 1: RED `test(` `e88e8e61` (spec files only, no `lib/`) precedes GREEN `e7b76d47`. RED evidence: RED_EVIDENCE_OK.
- Task 2: RED `test(` `22713f55` (inventory spec only) precedes GREEN `660d0e1b` and is its ancestor.
- Task 3: not TDD, per the plan.
- GREEN commits use `fix(` rather than `feat(`, as the plan's commit messages specify (bug-fix semantics).

## Threat Flags

None. No new network endpoint, auth path or trust-boundary surface beyond the plan's threat model. All of T-skk-01..08 are mitigated as planned. T-skk-09 is transferred and T-skk-10 accepted (todos above).

## Known Stubs

None.

## User Setup Required

None. Recommended post-deploy check (operator, read-only): create and delete a channel once in the classic console (cookie session plus the D-18 token) and once in Vue (Bearer). Both must succeed under production CSRF enforcement. CI (after the orchestrator pushes `thinx-staging`) must keep ZZ-RouterMeshesSpec, including the 4 new 261003-skk cases, ZZ-RouterDeviceSpec and ZZ-CSRF* green.

## Self-Check: PASSED

- FOUND: spec/jasmine/MeshSessionAuthSpec.js, lib/thinx/util.js, lib/router.js, lib/router.mesh.js, lib/router.device.js, spec/jasmine/CsrfRouteInventorySpec.js, spec/jasmine/ZZ-RouterMeshesSpec.js, .planning/runbooks/csp-csrf-hardening.md, both new pending todos, the completed s59 todo
- FOUND commits: e88e8e61, e7b76d47, 22713f55, 660d0e1b, 05ebbd85 (`git rev-list --count 715b38b9..HEAD` = 5)
