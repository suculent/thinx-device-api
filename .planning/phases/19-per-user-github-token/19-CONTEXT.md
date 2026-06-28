# Phase 19: Per-user GitHub Token Backend - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning
**Mode:** Authored from `.planning/inbox-tasks/392-per-user-github-token.md` (verified file:line refs).

<domain>
## Phase Boundary
Make `POST /api/github/token` an authenticated per-user flow (GH-01 + GH-02, #392): validate the caller's GitHub token, store it on THEIR user doc (never echoed), auto-create an RSA key if absent, push the public key to GitHub. Backend only — the Vue Profile UI (GH-03) is the `services/console` submodule's project.
</domain>

<decisions>
## Implementation Decisions
1. Dedicated endpoint stores `gitHubAccessToken` top-level via existing `owner.addGitHubAccessToken` — NOT added to the profile whitelist, so it is never surfaced by `owner.profile()` (which returns a fixed field set excluding it). No leak.
2. Extract the flow into `lib/thinx/github_link.js` (`GitHubLink.link(deps, owner, token, cb)`) with injected `{GitHub, rsakey, user}` so it is unit-tested without live GitHub/CouchDB/fs — keeps coverage off the flaky live-GitHub path.
3. Validate-before-store: invalid token → 401, nothing persisted. 422 (key exists) from GitHub treated as success by existing `github.addPublicKey`.
4. Route uses session owner (`sanitka.owner(req.session.owner)`), replacing the hardcoded `envi.oid` test owner in the old stub.
</decisions>

<code_context>
- Stub replaced: `lib/router.github.js` `POST /api/github/token` (was hardcoded owner, no validation/persistence).
- Helpers (working): `lib/thinx/github.js` `validateAccessToken` / `addPublicKey` (static).
- Storage: `lib/thinx/owner.js:1210` `addGitHubAccessToken(owner, token, cb)`.
- Keys: `lib/thinx/rsakey.js` `list(owner,cb)` / `create(owner,cb)`.
- Profile (no leak): `lib/thinx/owner.js:308` `profile()` returns a fixed whitelist (no `gitHubAccessToken`).
</code_context>

<specifics>
## Acceptance
- valid token → stored + key pushed; invalid → 401, not stored; no-key user → key auto-created then pushed; token absent from any response. Tests mock GitHub (no live calls).
</specifics>

<deferred>
- Vue Profile UI (GH-03) → services/console submodule.
- GitHub deploy-key removal on GDPR purge → now unblocked; add to Phase 18 orchestrator as a follow-on.
</deferred>
