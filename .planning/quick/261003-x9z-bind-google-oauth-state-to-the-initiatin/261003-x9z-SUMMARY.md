---
quick_id: 261003-x9z
phase: quick
plan: 261003-x9z
status: complete
subsystem: auth/oauth
tags: [security, oauth, google, login-csrf, cwe-352, pentest-triage, tdd, jasmine]
requires: []
provides:
  - "Google OAuth state bound to the initiating browser via the single-use thx_oauth_state_google cookie"
affects:
  - lib/router.google.js
tech-stack:
  added: []
  patterns:
    - "Same browser-binding pattern as the GitHub flow: oauth_return.setShortLivedCookie / takeCookie plus a constant-time statesMatch"
key-files:
  created:
    - spec/jasmine/GoogleOAuthStateSpec.js
  modified:
    - lib/router.google.js
decisions:
  - "Cookie check runs BEFORE consumeOAuthState, so a relayed callback neither reaches the code exchange nor burns the Redis marker"
  - "statesMatch is reused from lib/thinx/oauth-github.js (already exported), not duplicated; oauth-github.js is unchanged"
  - "Own cookie name thx_oauth_state_google; GitHub's thx_oauth_state is not shared"
metrics:
  completed: 2026-10-03
  tasks: 2
actuals:
  tokens: 4400
  tasks: 2
  commits: 2
plan_head_before: 73f514bf4c0202768093d0cca03178aca4907626
plan_head_after: 971284b87e6f5b03966e91a5afbcaa265747540c
---

# Quick 261003-x9z: bind Google OAuth state to the initiating browser

The Google OAuth `state` must now match a single-use httpOnly SameSite=Lax cookie (`thx_oauth_state_google`) that the same browser received from `/api[/v2]/oauth/google`. This closes the login CSRF (CWE-352) in which an attacker hands a victim an unconsumed callback URL.

## Triage context

See the verdict table in `PENTEST-TRIAGE.md` (this directory), rows **XALG-3 (F2)** and **XALG-4 (F3)**:

- **XALG-3 (GitHub):** false positive. `?return=` is allowlisted, and GitHub `state` is already bound to the browser by `thx_oauth_state`. No change.
- **XALG-4 (Google):** the report's reasoning is wrong, because the quoted Set-Cookie came from the GitHub response. The adjacent gap is real, though. Google `state` was a server-wide Redis marker with no link to any browser. That gap is fixed here.

## What changed

- **Initiator** (`/api/oauth/google`, `/api/v2/oauth/google`): after it writes the Redis marker, it sets `thx_oauth_state_google` = state via `oauthReturn.setShortLivedCookie`. That gives httpOnly, SameSite=Lax, path `/`, the shared parent domain and a 10 min max-age.
- **Callback:** after the existing `code` checks, `checkBrowserState(req, res, state)` reads and clears the cookie with `oauthReturn.takeCookie`. It then compares the cookie with `?state` using `statesMatch` from oauth-github.js, which is constant-time. A mismatch logs `[google] rejecting OAuth callback: state not bound to this browser` with only `cookie_present`/`state_present` booleans and answers `403`. Only after that does the existing Redis one-shot `consumeOAuthState` run. It stays in place as defence in depth.
- **Exports added:** `GOOGLE_STATE_COOKIE`, `checkBrowserState`.
- **Unchanged:** the GitHub flow, `oauth-github.js`, `oauth_return.js`, CORS and the return-origin logic.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (RED) | `3b6e8c0e` | test(quick-261003-x9z): failing spec for browser-bound Google OAuth state |
| 2 (GREEN) | `971284b8` | fix(quick-261003-x9z): bind Google OAuth state to the initiating browser (login CSRF) |

## TDD gate compliance

- **RED** (`3b6e8c0e`, unfixed code): `GoogleOAuthStateSpec` gave **9 specs, 7 failures**, all AssertionErrors with no harness errors. The two that passed did so as expected. G2 (the matching cookie is accepted) holds because the old code accepted any valid marker. G6 (replay) holds because the Redis marker was already one-shot.
- **GREEN** (`971284b8`): **9 specs, 0 failures**.

Spec cases: G1/G1b set the initiator cookie on `/api` and `/api/v2`. G2 accepts a matching cookie. G3/G3b reject a valid marker that has no cookie with 403, with no code exchange and the marker left unconsumed. G4 rejects a cookie for a different valid state with 403. G5 checks the cookie is cleared on accept, mismatch and absence. G6 rejects a replay with and without the cookie. G7 checks that GitHub's `thx_oauth_state` keeps its name and does not satisfy the Google check. Every rejection case also asserts that no log line contains the state or code values.

## Verification

All specs below ran locally with a temporary jasmine config that has no `spec/helpers/bootstrap.js` (the bootstrap boots the full server, which needs Redis and CouchDB). The env was `ENVIRONMENT=development COUCHDB_USER=x COUCHDB_PASS=y`, so `globals.js` loads `spec/mnt/data/conf/config.json`.

- GoogleOAuthStateSpec: 9 specs, 0 failures
- GitHubOAuthIsolationSpec: 9 specs, 0 failures
- CsrfRouteInventorySpec: 77 specs, 0 failures
- UtilSpec: 25 specs, 0 failures
- SecretsSweepSpec (mounts router.google.js): 32 specs, 0 failures
- LoggingQualityAuditSpec: 10 specs, 0 failures
- One process: GoogleOAuthState, GitHubOAuthIsolation, CsrfRouteInventory, Util, SecretsSweep, ApikeyExactMatch, BuildLogOwner, DeviceOwnership, DevicePushOwner, DeviceRegisterOwner, MeshSessionAuth, TransferApiKey, DeviceOtt, LogTailOwner, MessengerOwnership gave **471 specs, 0 failures**
- Random order (seeds 1, 42, 777) of GoogleOAuthState + SecretsSweep + GitHubOAuthIsolation: 50 specs, 0 failures each time
- `node scripts/test-google-oauth-state.js` (consumeOAuthState semantics): PASS, 43 checks
- ESLint is clean on `lib/router.google.js` and `spec/jasmine/GoogleOAuthStateSpec.js`, and `node --check` passes. There is no `fit`/`fdescribe`.

**ZZ-RouterOAuthSpec:** no edit needed. Its Google callback cases send no `code`, so they return at the existing `code` check before the new cookie check, and their behaviour is unchanged. No WINDOWS.md entry was needed.

**Post-deploy (operator, read-only):** `curl -si https://console.thinx.cloud/api/v2/oauth/google` should show `Set-Cookie: thx_oauth_state_google=…; Max-Age=600; Domain=.thinx.cloud; Path=/; HttpOnly; SameSite=Lax`. A Google login in the Vue console should still complete.

## Deviations from Plan

None. The plan's options were applied as follows: `statesMatch` was reused from the existing export, so `oauth-github.js` did not change. The helper was exported as `checkBrowserState`.

## Known Stubs

None.

## Notes / open questions

- **Two concurrent Google logins from one browser:** if a user opens two login tabs, the second cookie overwrites the first, and the first tab's callback is then rejected with 403. GitHub behaves the same way. This is acceptable.
- **Cookie domain:** the cookie relies on the shared parent domain (`.thinx.cloud`) to travel from the console.* initiator to the rtm.* callback, the same way the GitHub `thx_oauth_state` already does in production. If the Vue console ever moves off `*.thinx.cloud`, both flows break together.

## Self-Check: PASSED

- FOUND: spec/jasmine/GoogleOAuthStateSpec.js
- FOUND: lib/router.google.js (`GOOGLE_STATE_COOKIE`, `checkBrowserState`, `setShortLivedCookie(res, GOOGLE_STATE_COOKIE, state)`)
- FOUND: 3b6e8c0e, 971284b8
