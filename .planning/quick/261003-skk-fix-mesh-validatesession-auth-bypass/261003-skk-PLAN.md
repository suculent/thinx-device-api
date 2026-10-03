---
phase: quick-261003-skk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spec/jasmine/MeshSessionAuthSpec.js
  - spec/jasmine/UtilSpec.js
  - lib/thinx/util.js
  - lib/router.js
  - lib/router.mesh.js
  - spec/jasmine/CsrfRouteInventorySpec.js
  - .planning/runbooks/csp-csrf-hardening.md
  - lib/router.device.js
  - spec/jasmine/ZZ-RouterMeshesSpec.js
  - .planning/todos/pending/2026-10-03-validate-session-trusts-unverified-apikey-body.md
  - .planning/todos/completed/2026-10-03-validate-session-trusts-unverified-apikey-body.md
  - .planning/todos/pending/2026-10-03-device-udid-routes-missing-owner-check.md
  - .planning/todos/pending/2026-10-03-logs-tail-handler-undefined-router.md
autonomous: true
requirements: [T-s59-09]
tags: [security, auth, apikey, mesh, csrf, idor, tdd]

estimate:
  tokens: 95000
  raw_tokens: 95000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "An unauthenticated POST to /api/mesh/list, /api/mesh/create or /api/mesh/delete whose body names any owner_id plus an api_key that is not that owner's exact stored key or hash answers 401 and never reaches the owner library. The same holds for PUT and DELETE /api/v2/mesh and for requests sent with `Origin: device`"
    - "An API key authenticates only for the owner it is stored under. A body {owner_id: A, api_key: <A's key or hash>} acts on A for POST list/create/delete. A's key sent with owner_id B answers 401"
    - "A session-authenticated mesh request (cookie session or Bearer) always acts on the session owner. A body owner_id that names another owner is ignored"
    - "Util.validateSession returns true only for the router's verified-Bearer marker, a session owner, or a router-verified API key with its recorded owner. A raw Authorization header alone, or an unverified owner_id/api_key body, returns false. A request with no session object returns false without throwing"
    - "The four mesh mutation routes (POST /api/mesh/create, POST /api/mesh/delete, PUT /api/v2/mesh, DELETE /api/v2/mesh) are registered with csrf.verifyCsrfToken. With CSRF_ENFORCE=true, a cookie-session call without a token answers 403. A cookieless verified API-key call and a Bearer call pass. The three mesh list routes stay unguarded"
    - "Every Util.validateSession caller was audited. None selects the acting owner from the request body any more (the mesh handlers and attachMesh were fixed, and ownerFromRequest lost its body fallback). Findings outside that pattern are recorded as pending todos"
    - "The failing spec was committed (test(...)) before any lib/ change, and MeshSessionAuthSpec, UtilSpec and CsrfRouteInventorySpec pass locally with no Redis or CouchDB"
  artifacts:
    - path: spec/jasmine/MeshSessionAuthSpec.js
      provides: "Local end-to-end regression matrix: real lib/router.js + lib/router.mesh.js on a bare express app with stub redis and a recording owner fake; validateSession/ownerFromRequest units; CSRF behaviour on mesh routes"
      contains: "MESH-AUTH core"
    - path: lib/thinx/util.js
      provides: "validateSession that trusts only verified identities; ownerFromRequest without a body fallback"
      contains: "thx_apikey_owner"
    - path: lib/router.js
      provides: "POST API-key body verification against the owner the body names (owner, else owner_id), recording req.thx_apikey_owner on success; non-string inputs rejected with 401"
      contains: "req.thx_apikey_owner"
    - path: lib/router.mesh.js
      provides: "mesh handlers act on Util.ownerFromRequest(req) only; mutations CSRF-guarded"
      contains: "Util.ownerFromRequest(req)"
    - path: spec/jasmine/CsrfRouteInventorySpec.js
      provides: "mesh rows pinned (4 guarded, 3 recorded exclusions)"
      contains: "/api/mesh/create"
    - path: lib/router.device.js
      provides: "attachMesh takes the owner from Util.ownerFromRequest(req)"
  key_links:
    - from: lib/router.js
      to: lib/thinx/util.js
      via: "router.js sets req.thx_auth = 'apikey' and req.thx_apikey_owner only after apikey.verify succeeded. validateSession and ownerFromRequest read those request-local fields"
      pattern: "thx_apikey_owner"
    - from: lib/router.mesh.js
      to: lib/thinx/util.js
      via: "every mesh handler resolves its owner through Util.ownerFromRequest(req)"
      pattern: "Util\\.ownerFromRequest\\(req\\)"
    - from: lib/router.mesh.js
      to: lib/middleware/csrf.js
      via: "csrf.verifyCsrfToken as route middleware on the four mutations; its apikey exemption depends on req.thx_auth set by router.js"
      pattern: "csrf\\.verifyCsrfToken"
    - from: lib/router.js
      to: lib/thinx/apikey.js
      via: "apikey.verify(<sanitized claimed owner>, sanitka.apiKey(api_key), true, ...), the exact constant-time match from quick 261003-s59"
      pattern: "sanitka\\.apiKey\\(api_key\\)"
---

<objective>
Close the `Util.validateSession` auth bypass (T-s59-09, recorded as todo `.planning/todos/pending/2026-10-03-validate-session-trusts-unverified-apikey-body.md` by quick 261003-s59). `validateSession` returns true for any body that carries `owner_id` and `api_key`, and it never checks the key. `lib/router.mesh.js` then takes the acting owner from that body. So an unauthenticated POST can list, create or delete meshes for any owner. While planning, I reproduced this locally with the real `lib/router.js` and `lib/router.mesh.js` mounted on a bare express app with stub Redis:
- `POST /api/mesh/create` and `POST /api/mesh/delete` with `{owner_id: B, api_key: "x"}` answered 200 and called the owner library for B.
- `PUT /api/v2/mesh` with the same body answered 200.
- `POST /api/mesh/list` answered 400.
- `Authorization: Bearer garbage` answered 403.

Purpose: The bypass is broader than mesh. Every one of the ~45 `validateSession` callers accepted that body, and the router middleware verifies API keys only on POST bodies that name `owner`. Three more holes follow from that:
- Non-POST methods skip the middleware's key check.
- `Origin: device` skips it on any method.
- Udid-keyed device handlers (`editDevice`, `getDeviceDetail`, `setDeviceEnvs`, `detachSource`) pass no owner at all.

So until this fix, any device could be edited unauthenticated if its udid was known. The fix is central: `validateSession` and `ownerFromRequest` trust only identities that `lib/router.js` has verified. The mesh handlers stop reading the body owner. The mesh mutations get the CSRF guard.

Claim (a) confirmed during planning. A request that reaches a route handler with an Authorization header was verified by `lib/router.js`, as follows:
- An unusable token ("Bearer null", empty, or non-Bearer) is stripped (`lib/router.js:82-90`).
- A failed verify ends the request with 403 (`:127`), and a revoked token gets 401 (`:119`).
- Success sets `req.thx_auth = "bearer"` and binds the token owner into `req.session.owner` (`:99-124`).

This holds only because `thinx-core.js:382` mounts `lib/router.js` before every other router. Task 1 replaces the header-presence check with the `req.thx_auth === "bearer"` marker, so the check no longer depends on mount order.

CSRF decision. The session path is CSRF-protected. The API-key path is exempt but key-verified. Phase 25 D-21 deferred CSRF on Tier 3 resource mutations (devices, sources, mesh, build, chat). Task 2 lifts that deferral for the `lib/router.mesh.js` routes only. The device mesh attach/detach in `lib/router.device.js` stay deferred with the other device routes. Why this cannot lock anyone out:
- The classic console sends `X-XSRF-TOKEN` on every API-bound ajax call through the D-18 `$.ajaxSetup` seam (`services/console/src/app/js/thinx-api.js:17-30`).
- Vue calls `/api/v2/mesh` with Bearer, which is exempt.
- A cookieless API-key call is exempt once Task 1 makes the router middleware verify `owner_id` bodies and set `req.thx_auth = "apikey"`.
- The mesh list routes are reads and stay unguarded.

Production enforces CSRF (`.planning/PROJECT.md:22`), so the guard is live on deploy. `CSRF_ENFORCE` remains the rollback flag.

Real-client inventory (grep across the repo, the console submodule and the three `thinx-firmware-*` trees):
- Vue (`services/console/vue/src/store/channels.js:35-47`) sends GET/PUT/DELETE `/api/v2/mesh` with Bearer and no owner field. It keeps working.
- The classic console (`services/console/src/app/js/thinx-api.js:1066-1095`, `ChannelController.js:29,62`) sends a cookie-session POST to `/mesh/create` and `/mesh/delete` with `owner_id = $rootScope.profile.owner`, its own owner. After the fix that field is ignored, the session owner is used, and the request keeps working.
- No firmware or device library calls a mesh route.
- No client or spec sends a `{owner_id, api_key}` body. The only spec that does is `spec/jasmine/UtilSpec.js` "should validate session with valid body", which pins the bypass and is inverted in Task 1.
- `docs/APIs.md:115` documents `POST /api/mesh/list [owner/apikey auth]`. Task 1 makes it work with a verified key; today it answers 400.

Source coverage audit (quick task; no ROADMAP REQ, RESEARCH.md or CONTEXT.md):

| Source item (task description) | Covered by |
|---|---|
| Confirm the "already checked in app.all" claim for the Authorization header | Confirmed above; Task 1 swaps the header check for the verified marker; spec pins header-only false and garbage Bearer 403 |
| Session-owner branch | Task 1 (kept; session owner wins over any body field) |
| Body owner_id + api_key never verified | Task 1 (validateSession trusts only the router-verified marker; router.js verifies `owner`, else `owner_id`) |
| API-key path verified with APIKey.verify (exact) bound to that owner_id | Task 1 (router.js middleware; the owner is recorded from the verified claim, so A's key cannot act for B) |
| Session request: body owner_id must not override | Task 1 (mesh handlers), Task 3 (attachMesh) |
| Decide CSRF protection for mesh | Task 2 (decision above) |
| Audit every validateSession caller | Caller audit table below; Task 3 fixes and todos |
| TDD: failing-first specs for the 5 named cases | Task 1 step A |
| Legitimate callers keep working | Client inventory above; Task 2 exemptions; spec acceptance cases |
| Build on quick 261003-s59 | Task 1 `<precondition>`; reuses fixed `APIKey.verify`, `sanitka.apiKey(api_key)`, `Util.safeEqual` path |

Caller audit (all `Util.validateSession` call sites in lib/ and thinx-core.js; the executor copies this into the SUMMARY with the final state):

| Caller | How it picks the acting owner today | Disposition |
|---|---|---|
| `lib/router.mesh.js` delete/create (and v2 PUT/DELETE) | body `owner_id` first, session second | Fixed, Task 1: `Util.ownerFromRequest(req)` only |
| `lib/router.mesh.js` list (GET/POST, v2 GET) | session only; implicit global `owner_id` | Fixed, Task 1: `ownerFromRequest`, declared variable, API-key list works |
| `lib/router.device.js` deleteDevice, attachSource, detachMesh | `Util.ownerFromRequest` (session, then raw body `owner`) | Fixed centrally, Task 1: body fallback replaced by the verified API-key owner |
| `lib/router.device.js` attachMesh | session, then body `owner` fallback | Fixed, Task 3 (path is unreachable after Task 1: PUT is never API-key verified; the change makes it consistent) |
| `lib/router.device.js` editDevice, getDeviceDetail, setDeviceEnvs, detachSource | no owner at all; `device.edit/detail/envs` and `devices.detach` look up by udid only | Not body trust: missing ownership check (cross-owner IDOR for any authenticated caller). Unauthenticated access closes with Task 1. Recorded as a todo in Task 3 |
| `lib/router.device.js` listDevices, pushConfiguration, runTransformer, publishNotification, getMessengerData, `/api/device/data/:udid` | session owner | OK |
| `lib/router.build.js` build, getArtifacts | session owner; getArtifacts requires body `owner` to equal it | OK (body field is a consistency check, not the acting owner) |
| `lib/router.transfer.js` requestTransfer | session owner | OK |
| `lib/router.transfer.js` postDecline/postAccept | body `owner` presence only; `transfer_id` is the capability (the GET e-mail links need no auth by design) | OK, documented |
| `lib/router.gdpr.js` revoke, transfer | session owner (revoke requires body `owner` to equal it) | OK |
| `lib/router.profile.js`, `router.env.js`, `router.rsakey.js`, `router.github.js`, `router.logs.js`, `router.source.js`, `router.apikey.js`, `router.user.js` (stats, chat) | session owner only | OK. Under API-key auth these act on a null owner. That is pre-existing, unchanged and not a cross-owner path |
| `lib/middleware/requireAdmin.js` | session owner, then admin profile check | OK |
| `thinx-core.js:576` logTailImpl | calls `router.validateSession`, but `lib/router.js` returns nothing, so the call throws TypeError and the request fails with 500 | Fails closed; never responds on success. Recorded as a todo in Task 3 |

Output: one new local spec (committed RED first), the inverted UtilSpec case, verified-only `validateSession`/`ownerFromRequest`, the router.js `owner_id` verification, rewritten mesh handlers with CSRF guards, inventory rows and runbook note, the attachMesh fix, four CI regression cases, the s59 todo moved to completed, and two new todos.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/quick/261003-s59-fix-cr-01-api-key-substring-authenticati/261003-s59-SUMMARY.md
@.planning/todos/pending/2026-10-03-validate-session-trusts-unverified-apikey-body.md
@lib/thinx/util.js
@lib/router.js
@lib/router.mesh.js
@spec/jasmine/CsrfSessionFlowSpec.js
@spec/jasmine/UtilSpec.js
@spec/jasmine/CsrfRouteInventorySpec.js

Interfaces and facts the executor needs (verified during planning, do not re-derive):
- Quick 261003-s59 has landed (commits `3e445858`, `31c2696f`, `9d567610`). `APIKey.verify(owner, key, is_http, cb)` matches exactly and in constant time against `.key` or `.hash` of the JSON array stored at `ak:<owner>`. It rejects a non-string or empty key before Redis. A mismatch always answers `(false, "owner_found_but_no_key")`, and an owner without keys answers `(false, "apikey_not_found")`. `lib/router.js:186` already calls `apikey.verify(sanitka.owner(xowner), sanitka.apiKey(api_key), true, ...)`. Keep the `sanitka.apiKey(api_key)` text, because it is s59's key-link pattern.
- `Sanitka.owner(x)` (= `document_id`) and `Sanitka.apiKey(x)` call `.replace` on their input, so a non-string (number, array, object) throws TypeError. Guard the type before calling them. `sanitka.owner` returns null for anything that is not 64+ `[a-z0-9]`. `sanitka.apiKey` returns null for anything that is not 64+ `[a-z0-9]` after stripping quotes and whitespace.
- `lib/router.js` global middleware order:
  1. the JWT branch (sets `req.thx_auth = "bearer"` and calls `bindBearerOwner`)
  2. `Origin: device`, which returns `next()` early
  3. OPTIONS
  4. the device user-agent check
  5. the POST-only API-key body block (`:176-201`), which today runs only when the body names `owner`
- `thinx-core.js:382` mounts `lib/router.js` before every other router. `lib/router.js` returns undefined.
- `JWTLogin` (`lib/thinx/jwtlogin.js`) lands on `app.login`. `app.login.sign(uid, cb)` calls back with a token string. Verify reads the lower-case `authorization` header. The revocation check reads `revoked:owner:<uid>` from `app.redis_client`.
- `lib/middleware/csrf.js`:
  - The factory is `require("./middleware/csrf")(app)`. The inventory spec requires that exact text in every router with a guarded row.
  - Cookie `XSRF-TOKEN`, header `x-xsrf-token`, session cookie `x-thx-core`.
  - `CSRF_MODE` unset means legacy double-submit (cookie value === header value). `CSRF_ENFORCE=true` turns a missing or mismatched token into 403 `csrf_token_invalid`, and otherwise the check is fail-open.
  - Exemptions: `req.thx_auth === "bearer"`, or `"apikey"` with no `x-thx-core` cookie and not a public session route.
  - `verifyCsrfToken` reads `req.cookies`, so the harness must mount `cookie-parser`.
- Bare-app harness proven during planning (local, no Redis, no CouchDB):
  - express app, express-session (name `x-thx-core`, resave false, saveUninitialized false), `express.json()`
  - `app.redis_client` = a Map-backed stub `{get(k, cb), set(k, v, cb), del(k, cb), expire(k, t, cb), on()}` with synchronous callbacks
  - `app.owner` = a fake with `createMesh(owner_id, mesh_id, alias, cb)`, `deleteMeshes(owner_id, mesh_ids, cb)` and `listMeshes(owner_id, cb)`
  - then `require("../../lib/router.js")(app)` followed by `require("../../lib/router.mesh.js")(app)`, served with `http.createServer(app).listen(0, "127.0.0.1")`
- Single-spec local run, proven in this repo: `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/<File>.js'],helpers:[],random:false});j.execute(undefined,'<filter>')"`. The filter is a plain substring of the full spec name, so do not rely on regex alternation. Output ends with `N specs, M failures`, and the exit code is non-zero on failure. Baseline today: UtilSpec + CsrfRouteInventorySpec = `95 specs, 0 failures`. ESLint is clean on every file this plan touches.
- Expected harmless noise in local runs: `Audit log insertion error ... ECONNREFUSED 127.0.0.1:5984`, `document identifier invalid`, `INFLUXDB_TOKEN not set`, `CSRF token missing/mismatched ... (fail-open, not enforced)`.
- CI fixture: `envi.dynamic.owner` equals the owner id of the `dynamic` login (sha256(prefix + "dynamic@example.com"), checked locally). The existing JWT mesh specs therefore send their own owner as `owner_id`, and ignoring it changes none of their outcomes. CI picks up any `spec/jasmine/*Spec.js`.
- Commits: if GPG is locked, use `git -c commit.gpgsign=false commit` (operator standing exception). Never use `--no-verify`. Do not push or deploy.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: RED spec for the mesh bypass, then verified-only validateSession and authenticated-owner mesh handlers end to end</name>
  <files>spec/jasmine/MeshSessionAuthSpec.js, spec/jasmine/UtilSpec.js, lib/thinx/util.js, lib/router.js, lib/router.mesh.js</files>
  <precondition>Quick 261003-s59 is landed: `grep -q 'static safeEqual' lib/thinx/util.js && grep -q 'sanitka.apiKey(api_key)' lib/router.js` succeeds.</precondition>
  <behavior>
    Fixtures: OWNER_A = sha256("skk-owner-a"), OWNER_B = sha256("skk-owner-b"), KEY_A = sha256("skk-key-a"), HASH_A = sha256(KEY_A), WRONG = sha256("skk-wrong"). The stub holds `ak:`+OWNER_A = [{key: KEY_A, hash: HASH_A, alias: "skk"}] and nothing for OWNER_B. "No calls" means the recording owner fake saw zero calls for that request.
    - "MESH-AUTH core: validateSession" (unit, fake req objects):
      - body {owner_id: OWNER_A, api_key: KEY_A}, session with no owner, no marker → false, and session.destroy is called
      - Authorization header "Bearer x" only, session with no owner, no marker → false
      - thx_auth "bearer" → true; session owner OWNER_A → true
      - thx_auth "apikey" with thx_apikey_owner OWNER_A → true; thx_auth "apikey" without thx_apikey_owner → false; thx_apikey_owner without thx_auth → false
      - req with no session property and nothing else → false, does not throw
    - "MESH-AUTH core: ownerFromRequest" (unit):
      - session owner OWNER_A plus body owner OWNER_B → OWNER_A
      - no session owner, body owner OWNER_B, no marker → null
      - thx_auth "apikey" plus thx_apikey_owner OWNER_A plus body owner OWNER_B → OWNER_A
      - session owner OWNER_A plus a verified API-key owner OWNER_B → OWNER_A (session first)
    - "MESH-AUTH core: unauthenticated and forged" (e2e):
      - {owner_id: OWNER_A, api_key: "anything"} on POST /api/mesh/list, /api/mesh/create (with mesh_id) and /api/mesh/delete (with mesh_ids) → 401 each, no calls
      - the same three with api_key WRONG → 401 each, no calls
      - KEY_A with owner_id OWNER_B on create and delete → 401, no calls (the key is bound to its owner)
      - header `Origin: device` plus {owner_id: OWNER_A, api_key: "anything", mesh_id} on POST /api/mesh/create → 401, no calls
      - PUT /api/v2/mesh and DELETE /api/v2/mesh with {owner_id: OWNER_A, api_key: "anything", ...}, no cookie → 401 each, no calls
      - `Authorization: Bearer garbage` on POST /api/mesh/create → 403, no calls
    - "MESH-AUTH core: session and API-key owners" (e2e). Session requests carry the matching double-submit pair (see action):
      - session OWNER_A: POST create {mesh_id: "skk-mesh-1", alias: "skk"} → 200 and create recorded for OWNER_A; POST list and GET /api/mesh/list → 200 and list recorded for OWNER_A; POST delete {mesh_ids: ["skk-mesh-1"]} → 200 and delete recorded for OWNER_A
      - session OWNER_A plus body owner_id OWNER_B: POST create, POST delete and PUT /api/v2/mesh → 200 each, and the recorded owner is OWNER_A, never OWNER_B
      - Bearer for OWNER_A (minted with app.login.sign) plus body owner_id OWNER_B: POST create → 200 and create recorded for OWNER_A
      - cookieless {owner_id: OWNER_A, api_key: KEY_A}: create → 200 for OWNER_A; delete → 200 for OWNER_A; POST /api/mesh/list → 200 for OWNER_A
      - cookieless {owner_id: OWNER_A, api_key: HASH_A}: create → 200 for OWNER_A
      - cookieless {owner: OWNER_A, api_key: KEY_A, mesh_id}: create → 200 for OWNER_A
      - {owner_id: OWNER_A, api_key: 12345, mesh_id}: create → 401 (not 500), no calls
    - "MESH-AUTH csrf: mesh mutations" (e2e; CSRF_ENFORCE "true", CSRF_MODE unset; Task 2 makes these green):
      - session OWNER_A, no token: POST /api/mesh/create, POST /api/mesh/delete, PUT /api/v2/mesh, DELETE /api/v2/mesh → 403 each, no calls
      - session OWNER_A with the matching double-submit pair: POST create → 200 for OWNER_A
      - session OWNER_A, no token: POST /api/mesh/list → 200 (read, unguarded)
      - cookieless {owner_id: OWNER_A, api_key: KEY_A, mesh_id}: POST create → 200 for OWNER_A (API-key exemption)
      - {owner_id: OWNER_A, api_key: KEY_A, mesh_id} plus the OWNER_A session cookie, no token → 403, no calls (25-REVIEW CR-01 semantics)
      - Bearer for OWNER_A, no cookie, no token: POST create → 200 for OWNER_A
    - spec/jasmine/UtilSpec.js: the case "should validate session with valid body" becomes "should reject an unverified owner_id + api_key body (261003-skk)" with the same inputs and expects false
  </behavior>
  <action>
**Step A (RED, separate commit, before any lib/ change).**

1. Create `spec/jasmine/MeshSessionAuthSpec.js`:
   - Use CommonJS and `require("chai").expect` (chai-http stays at ^4 per AGENTS.md and is not used here). Send requests with node's `http` module, as `spec/jasmine/CsrfSessionFlowSpec.js` does.
   - Start with a header comment that names quick 261003-skk and says the spec runs without Redis or CouchDB.
   - If ENVIRONMENT is undefined, set it to "development", as CsrfSessionFlowSpec does.
   - Use the five describe names from `<behavior>` exactly. "MESH-AUTH core:" is the filter for this task's verify. "MESH-AUTH csrf:" is finished by Task 2.

2. Build the harness once for the file (top-level beforeAll/afterAll), following the bare-app recipe in `<context>`:
   - Middleware: express-session (name "x-thx-core", secret "skk-spec-secret", httpOnly, sameSite lax), `cookie-parser`, `express.json()`.
   - `app.redis_client`: the Map-backed stub, seeded with the OWNER_A key array.
   - `app.owner`: a recording fake whose calls land in an array that `beforeEach` clears. createMesh answers (true, {mesh_id, alias}), deleteMeshes answers (true, mesh_ids), listMeshes answers (true, []).
   - A spec-only `GET /spec/login` route that sets the session owner to OWNER_A, saves the session and answers 200.
   - Then mount the real `lib/router.js` and then the real `lib/router.mesh.js`, the production order.
   - Listen on 127.0.0.1 port 0 and close the server in afterAll.
   - Mint the OWNER_A Bearer token once with `app.login.sign`.
   - Get the session cookie by calling GET /spec/login and keeping the `x-thx-core=...` pair, the text before the first `;`, from set-cookie.
   - Never print a cookie, token or key value. Assert with booleans or status codes.

3. Environment discipline:
   - Each "MESH-AUTH core:" e2e describe saves `CSRF_ENFORCE` and `CSRF_MODE` in beforeAll, deletes both, and restores them in afterAll. Restoring means `delete` when the variable was undefined, because assigning undefined stores the string "undefined".
   - Session requests in the core describes always add `XSRF-TOKEN=skk-xsrf` to the Cookie header and send `X-XSRF-TOKEN: skk-xsrf`. That keeps them independent of whether the route is CSRF-wrapped.
   - "MESH-AUTH csrf:" sets `CSRF_ENFORCE` to "true" and deletes `CSRF_MODE` (legacy double-submit), with the same save and restore. Only its explicitly "with token" case sends the pair.

4. In `spec/jasmine/UtilSpec.js`, invert the one case named in `<behavior>`. Keep its inputs and its destroy stub. Change nothing else.

5. Run the whole new file (no filter) and UtilSpec with the single-spec command. The run must exit non-zero, and every MESH-AUTH describe must show failures. Some cases already pass, and that is expected:
   - session-owner acceptance without an override
   - cookieless KEY_A/HASH_A create with a matching owner_id
   - garbage Bearer 403
   - "apikey without owner" false
   - session-first ownerFromRequest
   - the session-owner validateSession case
   - in the csrf describe, the token, list, API-key and Bearer cases

   Record the `N specs, M failures` line for the SUMMARY.

6. Commit only the two spec files: `test(quick-261003-skk): failing spec for mesh validateSession auth bypass` (GPG rule from `<context>`).

**Step B (GREEN, the end-to-end slice).**

1. `lib/thinx/util.js` validateSession. Keep the sync signature, `validateSession(req)`, unchanged. It accepts in three cases:
   - `req.thx_auth === "bearer"`
   - the session exists and its owner is defined (`Util.isDefined`)
   - `req.thx_auth === "apikey"` and `req.thx_apikey_owner` is defined

   Otherwise it calls `req.session.destroy()` only when the session exists and destroy is a function, then returns false.

   Replace the three old comments with one doc comment that says:
   - lib/router.js verifies Bearer tokens, stripping unusable ones and ending failed ones, and verifies API-key bodies, then marks the request.
   - This function trusts only those markers and the session owner, never the raw header or the body.
   - That makes it independent of router mount order.

2. `lib/thinx/util.js` ownerFromRequest:
   - Start from the session owner when the session exists.
   - If that is not defined and `req.thx_auth === "apikey"`, use `req.thx_apikey_owner`.
   - Return null unless the result is a string, otherwise `sanitka.owner(result)`.
   - Remove the body fallback entirely.

3. `lib/router.js` POST API-key block (`:176-201`):
   - Take the claimed owner from the body's `owner` field when it is defined and non-null, otherwise from its `owner_id` field.
   - Run verification only when both the claimed owner and `api_key` are defined and non-null. Bodies without both still pass through unchanged.
   - If either value is not a string, answer 401 with the existing `Util.responder(res, false, "Authentication Faled")` shape, without calling sanitka.
   - Sanitize the claimed owner with `sanitka.owner`. If that gives null, answer the same 401 without calling verify.
   - Otherwise call `apikey.verify(<sanitized owner>, sanitka.apiKey(api_key), true, cb)`. On success set `req.thx_auth = "apikey"` and `req.thx_apikey_owner = <sanitized owner>`, both request-local and never in the session, then call `next()`. On failure keep today's 401 path and warning.
   - Leave everything above that block unchanged (JWT branch, `Origin: device` early return, user-agent check). Requests with `Origin: device` therefore never become API-key authenticated, which fails closed.
   - Update the block comment: the body's owner field, or else its owner_id field, names the claimed owner; the key is verified against it; the verified owner is recorded for validateSession/ownerFromRequest.

4. `lib/router.mesh.js`:
   - Merge getListMeshes and postListMeshes into one `listMeshes` handler, used by GET /api/v2/mesh, GET /api/mesh/list and POST /api/mesh/list.
   - In every handler (list, create, delete), after the validateSession 401 gate, set `const owner_id = Util.ownerFromRequest(req);` and answer `Util.failureResponse(res, 400, "owner_invalid")` when it is null. This also removes the undeclared global assignment in the old list handlers.
   - Do not read the request body's owner_id field anywhere in this file. A body owner never selects or overrides the acting owner.
   - Delete the debug line that printed the whole delete request body. It wrote the caller's api_key to the log.
   - Keep every other check and response string as it is: "Body missing.", "Invalid request format.", "mesh_ids_missing", "body_missing", "mesh_id_missing", "mesh_create_failed". `ZZ-RouterMeshesSpec` matches several of them exactly.
   - Leave the route registration lines unchanged in this task. Task 2 adds the guard.

5. Comments in `lib/thinx/util.js` and `lib/router.mesh.js` must not quote the old body-field accessors or the Authorization-header accessor. This task's verify negative-greps those files for them.

6. Run this task's `<verify>` until it is green. Then commit `lib/thinx/util.js`, `lib/router.js` and `lib/router.mesh.js`: `fix(quick-261003-skk): verified-only validateSession; mesh acts on the authenticated owner` (same GPG rule).
  </action>
  <verify>
    <automated>OUT1=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/MeshSessionAuthSpec.js'],helpers:[],random:false});j.execute(undefined,'MESH-AUTH core')" 2>&1); RC1=$?; OUT2=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/UtilSpec.js'],helpers:[],random:false});j.execute()" 2>&1); RC2=$?; echo "$OUT1" | tail -2; echo "$OUT2" | tail -2; ADDS=$(git log --diff-filter=A --format=%H -- spec/jasmine/MeshSessionAuthSpec.js) || exit 1; RED=$(printf '%s\n' "$ADDS" | tail -1); [ -n "$RED" ] || exit 1; SUBJ=$(git log -1 --format=%s "$RED") || exit 1; FILES=$(git show --name-only --format= "$RED") || exit 1; echo "red_commit=$RED subject=$SUBJ"; case "$SUBJ" in "test("*) ;; *) exit 1;; esac; ! printf '%s\n' "$FILES" | grep -q '^lib/' && printf '%s\n' "$FILES" | grep -qx 'spec/jasmine/UtilSpec.js' && [ $RC1 -eq 0 ] && [ $RC2 -eq 0 ] && echo "$OUT1" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && echo "$OUT2" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && ! grep -nE 'req\.body' lib/thinx/util.js && ! grep -nE 'headers\.(authorization|Authorization)' lib/thinx/util.js && grep -q 'thx_apikey_owner' lib/thinx/util.js && grep -q 'req.thx_apikey_owner' lib/router.js && grep -q 'sanitka.apiKey(api_key)' lib/router.js && ! grep -nE 'req\.body\.owner' lib/router.mesh.js && ! grep -nF 'JSON.stringify(req.body)' lib/router.mesh.js && [ "$(grep -c 'Util.ownerFromRequest(req)' lib/router.mesh.js)" -ge 3 ] && for f in lib/thinx/util.js lib/router.js lib/router.mesh.js spec/jasmine/MeshSessionAuthSpec.js spec/jasmine/UtilSpec.js; do node --check "$f" || exit 1; done && echo SKK-CORE-GREEN</automated>
  </verify>
  <reversibility rating="reversible">The code revert is two commits. Behaviour changes after deploy: every POST body that names owner/owner_id plus api_key is now key-verified, and mesh routes ignore a body owner. No in-repo client depends on the old behaviour (client inventory in the objective).</reversibility>
  <done>The new spec and the UtilSpec inversion were added in a `test(` commit that touches no lib/ file. All "MESH-AUTH core" specs and all of UtilSpec pass locally. util.js has no body access and no raw Authorization-header check. router.js records `req.thx_apikey_owner` after a verified `owner`/`owner_id` key. router.mesh.js resolves every owner through `Util.ownerFromRequest(req)` and no longer logs the delete body. Two commits exist (RED, then GREEN).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: CSRF-guard the mesh mutation routes (lift D-21 for router.mesh.js only) and pin them in the route inventory</name>
  <files>spec/jasmine/CsrfRouteInventorySpec.js, lib/router.mesh.js, .planning/runbooks/csp-csrf-hardening.md</files>
  <behavior>
    - All "MESH-AUTH csrf: mesh mutations" cases written in Task 1 pass, and the whole MeshSessionAuthSpec passes
    - CsrfRouteInventorySpec gains 4 GUARDED mesh rows and 3 NOT_GUARDED mesh rows, and passes, including "every router with a guarded row instantiates the csrf factory"
  </behavior>
  <action>
1. `spec/jasmine/CsrfRouteInventorySpec.js` (RED first). Add the rows under a comment line saying they come from quick 261003-skk and lift D-21 for `lib/router.mesh.js` only.
   - GUARDED: ["router.mesh.js", "post", "/api/mesh/create"], ["router.mesh.js", "post", "/api/mesh/delete"], ["router.mesh.js", "put", "/api/v2/mesh"], ["router.mesh.js", "delete", "/api/v2/mesh"].
   - NOT_GUARDED: ["router.mesh.js", "get", "/api/mesh/list", "GET read"], ["router.mesh.js", "post", "/api/mesh/list", "read carried as POST"], ["router.mesh.js", "get", "/api/v2/mesh", "GET read"].
   - Add one sentence about these rows to the file's header comment.
   - Run the inventory spec. The four mesh GUARDED rows and the factory check must fail.
   - Commit only this spec: `test(quick-261003-skk): pin CSRF guard on mesh mutation routes`.

2. `lib/router.mesh.js`:
   - Inside the module function, instantiate the factory with the exact text `const csrf = require("./middleware/csrf")(app);`. The inventory spec greps for it.
   - Register `csrf.verifyCsrfToken` as route middleware for the four mutations: POST /api/mesh/create, POST /api/mesh/delete, PUT /api/v2/mesh, DELETE /api/v2/mesh. Make it the second argument, right after the double-quoted path, on the same source line as the `app.<method>(` call. Both the inventory checker and this task's verify read single lines.
   - Leave the three list registrations unguarded.
   - Add a comment above the registrations covering three points:
     - Mesh mutations are cookie-session reachable, so they carry the session-bound CSRF check. This lifts Phase 25 D-21 for this file only.
     - Bearer calls and cookieless calls with a router-verified API key are exempt (D-09).
     - The classic console sends the token through the D-18 seam.
   - Do not put trailing comments on the registration lines.

3. `.planning/runbooks/csp-csrf-hardening.md`: after the "Recorded exclusions" table in "### Phase 25 guarded-route inventory", add a subsection "Mesh routes (quick 261003-skk)":
   - a 4-row guarded table and a 3-row exclusion table in the existing column format (Method | Path | File:line | Reason/Source)
   - one sentence that the totals become 42 guarded and 32 recorded exclusions
   - Amend the "Deferred by D-21" paragraph so the deferred list reads devices, sources, build and chat. Add that the device mesh attach/detach routes in `lib/router.device.js` stay deferred with the device routes.

4. Run this task's `<verify>`. Commit `lib/router.mesh.js` and the runbook: `fix(quick-261003-skk): CSRF-guard mesh mutation routes (D-21 lifted for mesh)` (same GPG rule; never `--no-verify`).
  </action>
  <verify>
    <automated>OUT1=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/MeshSessionAuthSpec.js'],helpers:[],random:false});j.execute()" 2>&1); RC1=$?; OUT2=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/CsrfRouteInventorySpec.js'],helpers:[],random:false});j.execute()" 2>&1); RC2=$?; OUT3=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/UtilSpec.js'],helpers:[],random:false});j.execute()" 2>&1); RC3=$?; echo "$OUT1" | tail -2; echo "$OUT2" | tail -2; echo "$OUT3" | tail -2; INV=$(git log -1 --format=%H -- spec/jasmine/CsrfRouteInventorySpec.js) || exit 1; LIBC=$(git log -1 --format=%H -- lib/router.mesh.js) || exit 1; ISUBJ=$(git log -1 --format=%s "$INV") || exit 1; IFILES=$(git show --name-only --format= "$INV") || exit 1; echo "inventory_red=$INV subject=$ISUBJ"; case "$ISUBJ" in "test("*) ;; *) exit 1;; esac; ! printf '%s\n' "$IFILES" | grep -q '^lib/' && [ "$INV" != "$LIBC" ] && git merge-base --is-ancestor "$INV" "$LIBC" && [ $RC1 -eq 0 ] && [ $RC2 -eq 0 ] && [ $RC3 -eq 0 ] && echo "$OUT1" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && echo "$OUT2" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && echo "$OUT3" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && grep -qF 'app.post("/api/mesh/create", csrf.verifyCsrfToken' lib/router.mesh.js && grep -qF 'app.post("/api/mesh/delete", csrf.verifyCsrfToken' lib/router.mesh.js && grep -qF 'app.put("/api/v2/mesh", csrf.verifyCsrfToken' lib/router.mesh.js && grep -qF 'app.delete("/api/v2/mesh", csrf.verifyCsrfToken' lib/router.mesh.js && grep -qF 'require("./middleware/csrf")(app)' lib/router.mesh.js && grep -q '261003-skk' .planning/runbooks/csp-csrf-hardening.md && node --check lib/router.mesh.js && node --check spec/jasmine/CsrfRouteInventorySpec.js && echo SKK-CSRF-GREEN</automated>
  </verify>
  <reversibility rating="reversible">Production enforces CSRF, so the guard is live on deploy. Rollback is the existing CSRF_ENFORCE flag (runbook) or a one-commit revert. Lockout risk was ruled out during planning: classic console D-18 seam, Vue Bearer, cookieless API key exempt.</reversibility>
  <done>The whole MeshSessionAuthSpec passes, including every "MESH-AUTH csrf:" case. CsrfRouteInventorySpec and UtilSpec pass. router.mesh.js instantiates the csrf factory and guards the four mutation registrations; the list routes are unguarded (pinned by the inventory spec). The inventory RED commit precedes the router.mesh.js guard commit. The runbook records the mesh rows and the narrowed D-21 deferral.</done>
</task>

<task type="auto">
  <name>Task 3: Finish the caller audit (attachMesh), add CI regressions, and record the follow-ups</name>
  <files>lib/router.device.js, spec/jasmine/ZZ-RouterMeshesSpec.js, .planning/todos/pending/2026-10-03-validate-session-trusts-unverified-apikey-body.md, .planning/todos/completed/2026-10-03-validate-session-trusts-unverified-apikey-body.md, .planning/todos/pending/2026-10-03-device-udid-routes-missing-owner-check.md, .planning/todos/pending/2026-10-03-logs-tail-handler-undefined-router.md</files>
  <action>
No new RED spec: this task is not TDD. The attachMesh change hardens a path Task 1 already made unreachable. Nothing on PUT is ever API-key verified, and Bearer and cookie sessions set the session owner. The ownerFromRequest units from Task 1 cover the helper it now uses. The CI cases below need the full app, so they run in CI only.

1. `lib/router.device.js` attachMesh (around line 101):
   - Replace the session-owner lookup and its body-owner fallback with `let owner = Util.ownerFromRequest(req);`.
   - Pass `owner` and the request body to `devices.attachMesh` exactly as before.
   - Change no other handler in the file.

2. `spec/jasmine/ZZ-RouterMeshesSpec.js`: add four cases to the "Meshes (noauth)" describe, in its existing chai-http ^4 style (`chai.request(thx.app)`, 30000 ms timeout). Put "261003-skk" in each title. Each case expects 401.
   - POST /api/mesh/create with {owner_id: envi.dynamic.owner, api_key: <64 zeros>, mesh_id: "skk-forged-mesh", alias: "skk"}
   - POST /api/mesh/delete with {owner_id: envi.dynamic.owner, api_key: <64 zeros>, mesh_ids: ["skk-forged-mesh"]}
   - the create case again with `.set('Origin', 'device')` and api_key "mock-api-key"
   - PUT /api/v2/mesh with the create body

   Use only the throwaway mesh id "skk-forged-mesh". If a regression ever let one through, it must not touch the "device-mesh-id" fixture that the JWT list case matches exactly.

3. Move the s59 todo: `git mv .planning/todos/pending/2026-10-03-validate-session-trusts-unverified-apikey-body.md .planning/todos/completed/`. Append a "## Resolution" section in the style of `.planning/todos/completed/2026-10-02-backup-gluster-influx-data-before-phase-27.md` that covers:
   - "Done 2026-10-03 in quick 261003-skk", with the Task 1 and Task 2 commit hashes
   - the bypass reached every validateSession route, not only mesh (non-POST methods, `Origin: device`, udid-keyed device routes)
   - validateSession and ownerFromRequest now trust only router-verified identities
   - router.js verifies `owner`, else `owner_id`, bodies
   - the mesh mutations are CSRF-guarded

4. Write two pending todos in the frontmatter format of the s59 todo (created, title, area, severity, files; then `## Problem` and `## Fix`):
   - `2026-10-03-device-udid-routes-missing-owner-check.md` (area: api; severity: high).
     - Problem: `lib/router.device.js` editDevice, getDeviceDetail, setDeviceEnvs and detachSource pass no owner. `device.edit` (`lib/thinx/device.js:1450`), `device.detail` (`:1525`), `device.envs` (`:1514`) and `devices.detach` (`lib/thinx/devices.js:403`) look a device up by udid only. Any authenticated caller who knows a udid can edit, read, read envs of, or detach the source of another owner's device.
     - Note that until quick 261003-skk these routes were reachable unauthenticated.
     - Fix: pass `Util.ownerFromRequest(req)` and compare it with the device doc owner before acting.
   - `2026-10-03-logs-tail-handler-undefined-router.md` (area: api; severity: low).
     - Problem: `thinx-core.js:576` logTailImpl calls validateSession on the return value of `require('./lib/router.js')(app)`, which is undefined. POST /api/user/logs/tail and /api/v2/logs/tail therefore throw TypeError and fail with 500, which fails closed. On the success path the handler never responds.
     - Fix: call `Util.validateSession` and send a response, or remove the dead routes if the websocket tail replaced them.

5. Run this task's `<verify>`. Commit the router, the spec and the three todo paths, including the rename: `fix(quick-261003-skk): attachMesh owner from authenticated identity; CI mesh bypass regressions; todos` (same GPG rule; never `--no-verify`).
  </action>
  <verify>
    <automated>OUT1=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/MeshSessionAuthSpec.js'],helpers:[],random:false});j.execute()" 2>&1); RC1=$?; OUT2=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/UtilSpec.js','jasmine/CsrfRouteInventorySpec.js'],helpers:[],random:false});j.execute()" 2>&1); RC2=$?; echo "$OUT1" | tail -2; echo "$OUT2" | tail -2; [ $RC1 -eq 0 ] && [ $RC2 -eq 0 ] && echo "$OUT1" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && echo "$OUT2" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && ! grep -nF 'sanitka.owner(body.owner)' lib/router.device.js && [ "$(grep -c 'Util.ownerFromRequest(req)' lib/router.device.js)" -ge 4 ] && [ "$(grep -c '261003-skk' spec/jasmine/ZZ-RouterMeshesSpec.js)" -ge 4 ] && for f in lib/router.device.js spec/jasmine/ZZ-RouterMeshesSpec.js; do node --check "$f" || exit 1; done && npx --no-install eslint lib/thinx/util.js lib/router.js lib/router.mesh.js lib/router.device.js spec/jasmine/MeshSessionAuthSpec.js spec/jasmine/UtilSpec.js spec/jasmine/CsrfRouteInventorySpec.js spec/jasmine/ZZ-RouterMeshesSpec.js && test -f .planning/todos/completed/2026-10-03-validate-session-trusts-unverified-apikey-body.md && ! test -e .planning/todos/pending/2026-10-03-validate-session-trusts-unverified-apikey-body.md && grep -q '## Resolution' .planning/todos/completed/2026-10-03-validate-session-trusts-unverified-apikey-body.md && test -f .planning/todos/pending/2026-10-03-device-udid-routes-missing-owner-check.md && test -f .planning/todos/pending/2026-10-03-logs-tail-handler-undefined-router.md && echo SKK-AUDIT-GREEN</automated>
  </verify>
  <done>attachMesh resolves its owner with `Util.ownerFromRequest(req)` and has no body-owner fallback. Four CI noauth regression cases tagged 261003-skk expect 401. The s59 todo is in completed/ with a Resolution section. Both new todos exist. ESLint is clean on all eight changed JS files. The local spec trio still passes. The work is committed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → POST/PUT/DELETE mesh routes | Unauthenticated network caller controls the body (owner_id, owner, api_key) and headers (Origin, Authorization) |
| browser with cookie session → mesh mutations | Cross-site requests can ride the session cookie (CSRF) |
| lib/router.js middleware → route handlers | Request-local markers (`req.thx_auth`, `req.thx_apikey_owner`) are the only proof of authentication that handlers may trust |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-skk-01 | Elevation of Privilege | Util.validateSession body branch (unverified owner_id + api_key) | critical | mitigate | Task 1: validateSession accepts only the bearer marker, a session owner, or the apikey marker plus its verified owner; spec "MESH-AUTH core: validateSession" and the inverted UtilSpec case |
| T-skk-02 | Elevation of Privilege | Non-POST methods and `Origin: device` skip the router's key check while validateSession trusted the body | critical | mitigate | Task 1: the marker is set only by the POST key check; spec pins PUT/DELETE v2 and Origin: device → 401 |
| T-skk-03 | Spoofing | API key of owner A presented with owner_id B | high | mitigate | Task 1: router.js verifies the key against the owner the body names and records that owner; spec pins KEY_A + OWNER_B → 401 |
| T-skk-04 | Elevation of Privilege | Body owner_id overrides the authenticated session/Bearer owner (mesh, attachMesh, ownerFromRequest fallback) | high | mitigate | Task 1 (mesh handlers, ownerFromRequest), Task 3 (attachMesh); spec pins session/Bearer + owner_id B → acts on A |
| T-skk-05 | Tampering | Cross-site mesh create/delete on a cookie session | medium | mitigate | Task 2: csrf.verifyCsrfToken on the four mutations; inventory spec pins the rows. Residual: fail-open when CSRF_ENFORCE is off (production enforces) |
| T-skk-06 | Information Disclosure | deleteMesh debug line logged the full body including api_key | medium | mitigate | Task 1: line removed; verify negative-greps it |
| T-skk-07 | Denial of Service | Non-string owner/api_key made sanitka throw (500) in the router middleware | low | mitigate | Task 1: type guard answers 401 before sanitka; spec pins numeric api_key → 401 |
| T-skk-08 | Spoofing | validateSession trusted the raw Authorization header, correct only while router.js mounts first | low | mitigate | Task 1: checks the verified bearer marker; spec pins header-only → false and garbage Bearer → 403 |
| T-skk-09 | Elevation of Privilege | Udid-keyed device routes (edit, detail, envs, detach source) never compare the device owner | high | transfer | Out of scope (missing object-level check, not body trust); unauthenticated access closes with Task 1; recorded in todo 2026-10-03-device-udid-routes-missing-owner-check.md |
| T-skk-10 | Denial of Service | logs/tail handler calls validateSession on an undefined router (500) | low | accept | Fails closed; recorded in todo 2026-10-03-logs-tail-handler-undefined-router.md |
| T-skk-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs; express, express-session, cookie-parser, sha256, chai and jasmine are existing dependencies |
</threat_model>

<verification>
- Local (no Redis, no CouchDB): MeshSessionAuthSpec, UtilSpec and CsrfRouteInventorySpec pass in full (Task 3 verify). The RED spec commit precedes the lib/ fix (Task 1 verify). The inventory RED commit precedes the mesh guard commit (Task 2 verify).
- Static: util.js has no body access and no raw Authorization-header check. router.mesh.js never reads the body owner and no longer logs the delete body. attachMesh has no body-owner fallback. node --check and ESLint are clean on every changed JS file.
- CI (after the operator pushes thinx-staging; not part of this plan) must stay green:
  - ZZ-RouterMeshesSpec, including the 4 new 261003-skk cases and the JWT cases that send `owner_id` equal to their own owner
  - ZZ-RouterDeviceSpec (mesh create with JWT, then attach)
  - ZZ-CSRFSpec, ZZ-CSRFRouteGuardSpec, ZZ-CSRFEnforceSpec
  - every ZZ-Router* noauth case (CI runs CSRF fail-open, so they still see 401)
- Recommended post-deploy check (operator, read-only): create and delete a channel once in the classic console (cookie session plus the D-18 token) and once in Vue (Bearer). Both must succeed under production CSRF enforcement.
- Project skills: `console-retest` and `swarm-autopull-recovery` do not apply. This plan has no console change and no deploy.
</verification>

<success_criteria>
- No unauthenticated or forged-key request can list, create or delete meshes for any owner, through any method, `Origin` or body shape.
- A valid API key works only for its own owner (POST mesh routes, `owner_id` or `owner` field). Session and Bearer requests always act on their own owner.
- `Util.validateSession` trusts only router-verified identities and the session owner. `Util.ownerFromRequest` has no body fallback.
- Mesh mutations are CSRF-guarded with the Bearer and cookieless-API-key exemptions intact. Mesh lists stay unguarded.
- Every validateSession caller is accounted for in the SUMMARY's caller audit. The remaining non-body-trust problems are pending todos.
- The failing spec is committed before the fix. Five commits: test, fix (core), test (inventory), fix (CSRF), fix (audit + CI + todos).
</success_criteria>

<output>
Create `.planning/quick/261003-skk-fix-mesh-validatesession-auth-bypass/261003-skk-SUMMARY.md` when done. It must include:
- the RED run's `N specs, M failures` line, and the final green lines for MeshSessionAuthSpec, UtilSpec and CsrfRouteInventorySpec
- the confirmation of the Authorization-header claim, and why validateSession now uses the marker
- the CSRF decision (D-21 lifted for router.mesh.js only), with the lockout analysis
- the real-client inventory
- the full caller audit table with each final disposition
- the operator-facing behaviour changes:
  - every POST body that names owner/owner_id plus api_key is now key-verified (wrong key → 401)
  - mesh routes ignore a body owner
  - the API-key path on mesh is POST-only; v2 PUT/DELETE/GET need a session or Bearer
  - `POST /api/mesh/list` now works with a valid key
  - mesh mutations need the CSRF token on cookie sessions
  - `Origin: device` requests can no longer authenticate validateSession routes by body key
- the severity note: before this fix, every validateSession route was reachable unauthenticated, including the udid-keyed device edit/detail/envs/detach routes
- the todos moved and created
</output>
