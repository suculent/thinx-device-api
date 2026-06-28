---
phase: 19
status: passed
verified: 2026-06-29
---

# Phase 19 Verification: Per-user GitHub Token Backend

**Requirements:** GH-01, GH-02 (#392)

## Success criteria
1. **Authenticated, session-owner endpoint** — ✅ route validates session + `sanitka.owner(req.session.owner)`; hardcoded `envi.oid` test owner removed.
2. **Validate-before-store; invalid → 401, nothing stored** — ✅ `GitHubLinkSpec` asserts 401 + `stored === null` + no key push.
3. **Token persisted on caller doc, never echoed** — ✅ stored via `owner.addGitHubAccessToken`; spec asserts token absent from response payload; `owner.profile()` field whitelist excludes it.
4. **Auto-create RSA key when absent, then push** — ✅ spec asserts `create` called + new key pushed + `created_key: true`; existing-key path pushes without create.
5. **422 (key exists) handled as success** — ✅ existing `github.addPublicKey` treats 201/422 as valid.

## Evidence
- Local (no services, mocked GitHub/rsakey/owner): `GitHubLink.link` 5/5 green.
- `node --check` + eslint clean on `github_link.js`, `router.github.js`, `GitHubLinkSpec.js`.
- CI (pending push): full jasmine suite incl. `GitHubLinkSpec` (mocked — independent of flaky live `GitHubSpec`).

## Human verification
None required — covered by automated unit specs. (A live end-to-end token link against real GitHub is optional manual smoke, not gating.)
