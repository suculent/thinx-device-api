---
phase: 25-session-bound-csrf-console-edge-headers
fixed_at: 2026-10-01T11:58:29Z
review_path: .planning/phases/25-session-bound-csrf-console-edge-headers/25-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 25: Code Review Fix Report

**Fixed at:** 2026-10-01T11:58:29Z
**Source review:** .planning/phases/25-session-bound-csrf-console-edge-headers/25-REVIEW.md
**Scope:** the user asked for the Critical and Warning findings (CR-01, CR-02, WR-01, WR-02). IN-01 (OpenAPI wording) and IN-03 (router comment) were fixed as part of CR-01 and CR-02. IN-02 (`CSRF_SECRET` length and trimming) was not touched.

Both commits are GPG-signed. **Deployed 2026-10-01:** parent `2a9569c1` was pushed with operator approval. CI was green (test 15516, api-registry 15522), and `thinx_api` rolled to `c42333a3bb0a` at 12:05:33Z. The live re-check passed: env still signed, 0 restarts, boot line once, 0 CRITICAL, signed and `--guards` probe unchanged, `LIVE-HEADERS OK`, and the operator's browser checks (cold logins, Vue profile save, Vue reload) all passed.

| Commit | Finding | Change |
|---|---|---|
| `216ef1fc` | CR-01, CR-02, WR-02 (+IN-01, IN-03) | `lib/middleware/csrf.js`, `lib/router.js`, new `lib/thinx/bearer_owner.js`, specs, OpenAPI |
| `222ce746` | WR-01 | `scripts/check-console-headers.js`, `spec/node/ConsoleHeaderParity.test.js` |

## CR-01: API-key CSRF bypass (critical)

`verifyCsrfToken` now honours `req.thx_auth === "apikey"` only when the request carries no `x-thx-core` cookie **and** its path is not one of the nine public login, registration and password routes (`PUBLIC_SESSION_ROUTES`, compared case-insensitively without query string or trailing slash). A cross-site form always carries the victim's session cookie, so it is now checked like any other cookie request. A cookieless request on a public route would let an attacker log a visitor into the attacker's account (login CSRF), so the key does not exempt those routes either. Machine clients that send no cookie keep the exemption on account routes. D-05 found none in production.

Tests:
- `CsrfSessionFlowSpec` "review fixes": an API key with a session cookie gets 403, an API key on `/api/v2/login` gets 403, and a cookieless API key on a guarded route gets 200.
- `ZZ-CSRFSpec` x2 now uses a guarded account route. x2b and x2c are new. x6 now uses an account route, because `session/token` is public.

## CR-02: the Bearer bridge persisted the owner into the cookie's session (critical)

The new `bindBearerOwner(req, res, owner, impersonator)` sets `owner` and `impersonator_owner` on `req.session` for the handlers. It wraps `res.end` as the outermost wrapper and restores the session's own values (or deletes them) just before express-session's wrapper saves the session. A session regenerated during the request, such as a login, is a different object and is left alone. The session id is never rotated.

Side effect: an admin's impersonation token no longer leaks into the admin's own cookie session. The old cleanup in `session_token.js:68` is now a no-op for that case.

Tests: in `CsrfSessionFlowSpec`, a Bearer request sees its owner during the request, but the planted pre-session stays without an owner. A Bearer request on a session of the same owner keeps that owner.

## WR-02: a planted XSRF-TOKEN cookie could lock users out (warning)

In `signed` mode, when the double-submit comparison fails, a non-empty `X-XSRF-TOKEN` header whose HMAC binds to the request's session now passes on its own. That is the synchronizer-token pattern; a cross-site page cannot read the token. A header bound to another session is still refused. Legacy and observe modes are unchanged.

Tests: in `CsrfSessionFlowSpec`, a planted cookie with the real bound header gets 200, and a planted cookie with a header bound to another session gets 403.

## WR-01: the parity check accepted a CSP without `always` (warning)

A CSP `add_header` without `always` is now `CSP-NOT-ALWAYS` in any input file, canonical included. A one-sided `always` on other headers is still a WARN. The old test that codified the WARN for the CSP was rewritten. The reviewer's reproduction, a `--live` copy with `always` removed, now gives `HEADER-PARITY FAIL`.

## Verification

- Local: 186 specs, 0 failures (ZZ-CSRFSpec, CsrfSessionFlowSpec, CsrfRouteInventorySpec, CookiePolicySpec). In the wider gate set, the 6 `GitHubOAuthIsolationSpec` failures appear identically without these changes, because that spec needs CouchDB locally.
- `node --test spec/node/ConsoleHeaderParity.test.js`: 16/16 pass. `HEADER-PARITY OK files=4`. ESLint is clean on the changed files.
- CI-only behaviour (`ZZ-CSRFEnforceSpec` against the real app, Redis store) runs on the next push.
