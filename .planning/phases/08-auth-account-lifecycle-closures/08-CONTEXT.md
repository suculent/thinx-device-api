# Phase 8 Context: Auth & Account Lifecycle Closures

**Created:** 2026-06-03
**Milestone:** v1.9 — Backend Hygiene & Posture
**Requirements:** AUTH-REACTIVATE-01, AUTH-RESET-LINK-CONSOLE

## Domain

Close two account-lifecycle gaps from the v1.0 UAT:
1. Soft-deleted users (`user.deleted = true`) can be reactivated through an admin endpoint.
2. Password-reset emails link to the Vue console (NOT the legacy AngularJS `/password.html` path).

In scope: server-side reactivation route + reset-email URL change. Both land on top of Phase 7's clean async/await `owner.js`.

Out of scope (deferred): self-serve email-link reactivation flow (operator chose admin-only path); Vue console UI changes (the `/password-reset` page already exists and accepts `reset_key` from query string — no change needed on the console side for this phase).

## Canonical Refs

- `.planning/ROADMAP.md` — Phase 8 (lines 79–87)
- `.planning/REQUIREMENTS.md` — AUTH-REACTIVATE-01 (line 36), AUTH-RESET-LINK-CONSOLE (line 38)
- `.planning/PROJECT.md` — compatibility guardrail (no signature breaks on legacy-console routes)
- `.planning/phases/07-owner-async-await-sweep/07-CONTEXT.md` — Phase 7 just landed; owner.js is async/await throughout. Phase 8 work happens on the cleaned file.
- `lib/router.auth.js:187–191` — soft-delete lockout gate (`user_data.deleted === true` → audit + reject)
- `lib/thinx/owner.js:506` — current reset URL construction: `app_config.public_url + "/password.html?reset_key=...&owner=..."`
- `lib/thinx/owner.js:147` — reset-email URL construction (per REQUIREMENTS.md AUTH-RESET-LINK-CONSOLE line 38 reference)
- `lib/thinx/owner.js:695` — soft-delete write (`deleted: true`)
- `lib/router.admin.js` — admin route patterns (existing admin role gate to follow)
- `services/console/vue/src/Routes.js:39–41` — Vue console `/password-reset` route (PUBLIC path, already accepts `reset_key` from `$route.query.reset_key`)
- `services/console/vue/src/pages/PasswordReset/PasswordReset.vue` — Vue page that consumes `reset_key`
- `services/console/vue/src/store/auth.js:90–92` — Vue API call for `confirmPasswordReset` (POSTs to `/password/reset` with `reset_key`)
- `AGENTS.md` — `WEB_HOSTNAME=https://rtm.thinx.cloud` (host is the same for API and Vue console; nginx path-routes)

## Code Context

### AUTH-REACTIVATE-01 — current soft-delete state

- **Soft-delete write:** `owner.js:695` (inside `Owner.delete`) — sets `deleted: true` on the user doc via `userlib.atomic("users", "edit", owner, { deleted: true })`. Other user data preserved.
- **Lockout gate:** `router.auth.js:187–191`:
  ```js
  let deleted = user_data.deleted;
  if ((typeof (deleted) !== "undefined") && (deleted === true)) {
    auditLogError(user_data.owner, "user_deleted");
    return res.status(403).end("deleted");
  }
  ```
- **No existing reactivation route.** Currently the only way to reactivate is direct CouchDB mutation (operator-side, no API surface).
- **Admin role gate pattern:** `router.admin.js` exists (touches `user.profile` at line 52 with an admin gate); the same auth gate pattern is reusable.

### AUTH-RESET-LINK-CONSOLE — current reset email link

- **Email link construction** (in `Owner.password_reset_init`, around `owner.js:147`):
  ```js
  app_config.api_url + port + "/api/user/password/reset?owner=" + user.owner + "&reset_key=" + user.reset_key;
  ```
  This builds an API URL (e.g., `https://rtm.thinx.cloud/api/user/password/reset?...`) that, when clicked, hits the Express GET handler at `/api/user/password/reset` → calls `Owner.password_reset` → validates the key → currently returns redirect to `app_config.public_url + "/password.html?reset_key=...&owner=..."` (legacy AngularJS, `owner.js:506`).
- **Vue console password-reset page exists:** `/password-reset` route in Vue Routes.js (line 39), serves `PasswordReset.vue` which already reads `reset_key` from `this.$route.query.reset_key`. Public path (no auth required).
- **The redirect target is what needs to change** — Express handler should redirect to the Vue console `/password-reset` route instead of the legacy `/password.html` page.

## Decisions

### AUTH-REACTIVATE-01 — Admin endpoint

- **Decision:** Implement `POST /api/v2/admin/user/:id/reactivate` (admin role-gated). On success, sets `user.deleted = false` (or `unset`) via `userlib.atomic("users", "edit", :id, { deleted: false })`. Returns `(true, "reactivated")` or appropriate error.
- **Auth gate:** Reuse the existing admin role check pattern from `router.admin.js`. The route must be admin-only — non-admin users cannot reactivate themselves or others.
- **NOT implementing self-serve email-link flow** — operator chose admin-only path. The full self-serve flow (email template + signed token + token-expiry + new route) is deferred to a future v1.x phase if product demand emerges.
- **Soft-delete gate at `router.auth.js:189–191` remains unchanged** — it still blocks login for `deleted: true` accounts. The reactivation endpoint flips `deleted` back to `false`, after which the lockout gate naturally allows login.
- **Validation:**
  - curl/round-trip: `POST /api/v2/admin/user/<id>/reactivate` with admin auth → flips `deleted` to false; next login for that user succeeds (no longer returns 403 "deleted").
  - Auth gate regression spec: non-admin caller gets 401/403, admin caller gets 200.
  - Soft-delete gate at `router.auth.js:189–191` still rejects genuinely-deleted accounts when called with `deleted: true` (no weakening).

### AUTH-RESET-LINK-CONSOLE — API GET handler redirects to Vue console

- **Decision:** Keep the email link pointing at the API route (`app_config.api_url + "/api/user/password/reset?owner=...&reset_key=..."`). The Express GET handler validates the reset_key (existing logic, unchanged). On success, change the returned redirect URL from `app_config.public_url + "/password.html?..."` to point at the Vue console route: `<Vue console host>/password-reset?reset_key=...&owner=...`.
- **Vue console host derivation:** Since `AGENTS.md` shows `WEB_HOSTNAME=https://rtm.thinx.cloud` and the API is served from the same hostname via nginx path routing, use `app_config.public_url` (which already equals the Vue console host in production) and just change the path from `/password.html?...` to `/password-reset?...`. NO new config field needed (option (a) `app_config.console_url` is unnecessary because Vue console + API share the host in current deployment).
- **Exact URL change at `owner.js:506`:**
  - Before: `const url = app_config.public_url + "/password.html?reset_key=" + reset_key + "&owner=" + owner;`
  - After:  `const url = app_config.public_url + "/password-reset?reset_key=" + reset_key + "&owner=" + owner;`
- **Vue console side:** NO change required — `PasswordReset.vue` already reads `reset_key` from `$route.query.reset_key` (and `owner` likely needed too — verify in plan). The console submits the new password via the existing `/password/reset` POST endpoint.
- **Email body** at `owner.js:147` — the email links to the API GET handler; the API redirect chain (email → API → Vue console) keeps reset_key validation server-side (matches today's behavior; only the final destination changes).
- **Validation:**
  - A generated reset email link, when clicked through, lands on the Vue console `/password-reset` page (NOT `/password.html`).
  - The reset_key flow completes end-to-end through Vue (Vue page → POST `/password/reset` → API → password updated).
  - Regression spec covers the new redirect URL shape (`grep` for `/password-reset` in the redirect string).

## Coordination

- Phase 8 sequences AFTER Phase 7 (Phase 7's clean async owner.js is the foundation). Phase 7 commits `1aa92fe5..f4345711` already landed on `thinx-staging`.
- The Vue console route `/password-reset` already exists (services/console submodule, last frontend ship). **NO services/console submodule change required for Phase 8.** Verification: the Vue route accepts `reset_key` from query string and submits to `/password/reset` POST endpoint. This is already wired.
- Phase 10 (services/console SEC-DEP-02 coordination) is independent of Phase 8 — no overlap.

## Deferred Ideas (captured, NOT in scope)

- **Self-serve email-link reactivation flow** — token generation + token-expiry + new route + email template. Future v1.x or v2 candidate if product demand emerges.
- **Unify session + password-reset routes** — currently the password reset flow uses both API (`/api/user/password/reset` GET for redirect) and Vue console (`/password-reset` page submits to `/password/reset` POST). The two-step indirection is legacy. A v2 redesign could fold these into a single Vue-first flow.
- **`app_config.console_url` field** — not introduced in Phase 8 because production deployment has Vue console + API on the same host. If a future deployment splits them (e.g., separate console host), introducing this config field becomes the right move. v1.10+ candidate.
- **Admin UI for reactivation** — the admin endpoint will exist but no Vue console admin page for it. Operator uses curl/Postman. UI work is a v1.10+ candidate.

## Open Questions for Researcher / Planner

- The admin role check pattern in `router.admin.js` — confirm whether it's middleware-based (`router.use(adminGate)`) or per-route (`function (req, res) { if (!isAdmin(req)) ... }`). The new `/api/v2/admin/user/:id/reactivate` route should match the existing pattern.
- The Vue page `PasswordReset.vue` at line 122 reads `this.$route.query.reset_key OR this.$route.query.activation`. Confirm whether the redirect URL should include `&activation=...` as well — likely NOT (activation is a separate flow), but verify before writing the plan.
- Regression spec location — likely a new file `spec/jasmine/ZZ-RouterAdminReactivateSpec.js` for AUTH-REACTIVATE-01 + an addition to `ZZ-RouterPasswordResetSpec.js` for the redirect URL change. Confirm in planning.

## Constraints

- No signature break on any public route the legacy AngularJS / Vue console depends on.
- The soft-delete gate at `router.auth.js:189–191` MUST remain intact — reactivation does not weaken it.
- All commits GPG-signed.
- Test-env ACCEPT pattern carries forward (Phase 5/6/7): local `npm test` aborts on missing `/mnt/data/conf/config.json`; CI is canonical Jasmine green-gate.
- The admin endpoint MUST follow the existing admin auth-gate pattern — no new auth mechanism introduced.
- Vue console route `/password-reset` is already PUBLIC in `services/console/vue/src/Routes.js:141` PUBLIC_PATHS — no auth-side change needed there.
