# Task: Per-user GITHUB_ACCESS_TOKEN with auto RSA-key push (#392)

**Type:** feature · **Effort:** M (backend) + S (console UI) · **Risk:** medium
(handles a secret credential) · **Priority:** stale 3+ yrs — confirm still wanted

## Current state (verified)
The feature is **largely unimplemented**, but scaffolding exists:
- `GITHUB_ACCESS_TOKEN` is a single **global** env var today (tests only:
  `spec/jasmine/GitHubSpec.js:30,48`); no per-user token is read in production.
- Working GitHub API helpers: `lib/thinx/github.js`
  - `validateAccessToken(token, cb)` → `GET https://api.github.com/user/keys` (github.js:8–38)
  - `addPublicKey(token, key, cb)` → `POST /user/keys` (github.js:66–98)
- RSA key mgmt fully works: `lib/thinx/rsakey.js` — `create()` (141–157),
  `list()` (90–97), `revoke()` (82–88).
- **Storage method already defined but never called:** `owner.addGitHubAccessToken(owner, token, cb)`
  writes `gitHubAccessToken` to the user doc (owner.js:1210–1220).
- **Broken stub endpoint:** `POST /api/github/token` (router.github.js:262–274)
  uses a hardcoded test owner, skips token validation, and never persists.

## Gaps to close
1. No authenticated route that stores the *current user's* token.
2. No validate-then-store flow.
3. No auto-create RSA key when the user has none.
4. `gitHubAccessToken` is not in the profile update whitelist
   (`owner.js:346–393`, `process_update()`).
5. No retrieval/getter for later use.
6. No console UI (Profile screen) to enter/manage the token.

## Goal
A logged-in user enters a GitHub access token in their Profile. The API
validates it against GitHub, stores it on their user doc, ensures the user has
an RSA key (creating one if absent), and pushes that public key to GitHub.

## Scope of changes
**Backend**
- `lib/router.github.js` — replace the stub `POST /api/github/token` with an
  authenticated handler (use the session owner, not `_envi.json`):
  1. `GitHub.validateAccessToken(token)` → 401 on failure.
  2. `owner.addGitHubAccessToken(owner, token)` to persist.
  3. `rsakey.list(owner)`; if empty → `rsakey.create(owner)`.
  4. `GitHub.addPublicKey(token, firstPubKey)`; treat 201 + 422(exists) as success.
  5. Return structured `{success, key_pushed, created_key}`.
- `lib/thinx/owner.js` — add `gitHubAccessToken` to the profile whitelist
  (346–393) OR keep it on the dedicated endpoint only (preferred: dedicated
  endpoint, never echo the token back in any GET/profile response).
- Consider encrypting the stored token at rest (or store a GitHub token with
  minimal `admin:public_key`/`write:public_key` scope only). Document the scope.

**Console (Vue)** — `services/console/...`
- Add a Profile section: token input (masked), "Validate & link" button,
  status (linked / key pushed), and a way to clear/replace the token.
- Wire to `store/profile.js` action calling the new endpoint.
- Never display the stored token value back to the user.

## Acceptance criteria
- [ ] Authenticated `POST /api/github/token` validates the token with GitHub
      and stores it on the calling user's doc (no hardcoded owner).
- [ ] Invalid token → 401, nothing stored.
- [ ] If user has no RSA key, one is created automatically before push.
- [ ] The user's public key is present on their GitHub account after success
      (201 created or already-exists handled gracefully).
- [ ] Token is never returned in any API response or profile payload.
- [ ] Console Profile screen lets a user link/replace/clear the token.

## Security notes
- Minimal token scope; document required scopes.
- Mask in UI; redact from logs; consider encryption-at-rest.
- Coordinate with #353: a stored per-user token enables deleting the user's
  GitHub deploy key on GDPR purge.

## Tests
- [ ] Route test: valid token → stored + key pushed (mock github.js).
- [ ] Route test: invalid token → 401, not stored.
- [ ] Route test: user with no keys → key auto-created then pushed.
- [ ] Assert token absent from profile GET responses.
- Note: existing `GitHubSpec.js` is flaky and gates deploy — keep new tests
  independent of the live GitHub API (mock) to avoid worsening flakiness.

## Decision (confirmed 2026-06-28)
Still wanted — owner flagged this as important tech debt. Proceed with build.

## Commit(s)
- `feat(github): authenticated per-user access token endpoint (#392)`
- `feat(github): auto-create and push RSA key on token link (#392)`
- `feat(console): GitHub token Profile screen (#392)`
