# Phase 18: Complete GDPR Purge - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning
**Mode:** Authored from `/gsd-inbox` triage task note (`.planning/inbox-tasks/353-gdpr-complete-purge.md`) — spec is concrete with verified file:line references, so interactive discuss was skipped.

<domain>
## Phase Boundary

Make `DELETE /api/v2/gdpr` purge **every** owner-scoped artifact immediately and verifiably, across all stores, via one orchestrator that is also reused by the scheduled `purgeOldUsers()` path. Closes GitHub #353 (`priority`). Requirement: **SEC-PII-03**.

IN scope: the purge orchestrator + wiring into the GDPR endpoint, RSA-key/file/Redis/build/device cleanup, path-safety guards, and tests.
OUT of scope: GitHub deploy-key deletion (depends on #392 per-user token — deferred), the Vue console, and any change to the soft-delete/reactivate admin flow.
</domain>

<decisions>
## Implementation Decisions

**Verified current state (gap analysis from task note):**
- DONE today: user doc (`owner.js:709–728`), device docs (`devices.js:106–124`).
- MISSING: `deploy_path` tree, `repo_path` tree, RSA key files (`rsakey.js:27–40` `revokeUserKeys()` exists but is never called from GDPR), build docs (only deferred 3-month expiry), CouchDB API-key docs.
- WEAK: Redis uses `expire(key,1)` (`router.gdpr.js:48–54`) instead of `del()`; MQTT auth revoked per-device only (`auth.js:44–48`).

**Decisions:**
1. **Single orchestrator** — add an owner-purge method (e.g. `purgeOwner(owner)`), called by both `revokeGDPR()` (`lib/router.gdpr.js`) and the scheduled `purgeOldUsers()` path. No duplicated delete logic.
2. **Order:** revoke creds/MQTT → delete device docs → delete build docs → delete RSA key files → delete fs trees (deploy_path, repo_path) → delete Redis keys → destroy user doc LAST. (User doc last so a mid-run failure leaves the account still discoverable for re-run.)
3. **Path-safety is mandatory and tested.** Every filesystem delete resolves the absolute path and asserts it starts with the configured `data_root` + owner subtree prefix before removing. Reject empty/`/`/`..`-bearing owner ids. A negative test proves a crafted owner id cannot escape the subtree. This is the gate for the phase — no fs delete ships without it.
4. **Redis:** switch `expire(key,1)` → `del(key)` for `ak:<owner>` and the `/<owner>/*` pattern sweep.
5. **Builds:** delete owner's build docs immediately (query by owner via existing `design_builds` view), not via the 3-month expiry path.
6. **Idempotent:** safe to re-run; ignore ENOENT/already-deleted; each step wrapped in try/catch, collects a per-step result, emits an `alog` audit line per owner so deletion is provable.

**Claude's discretion:** exact method names, where the orchestrator module lives (likely a new `lib/thinx/gdpr_purge.js` or extend `lib/thinx/gdpr.js`), and how filesystem trees are removed (`fs-extra.remove` after the prefix assertion).
</decisions>

<code_context>
## Existing Code Insights

- Endpoint: `lib/router.gdpr.js:21–64` `revokeGDPR()`.
- User doc: `lib/thinx/owner.js:709–728` `delete()`.
- Devices: `lib/thinx/devices.js:106–124` `destroy_device()` + `auth.revoke_mqtt_credentials()` (`auth.js:44–48`).
- RSA keys: `lib/thinx/rsakey.js:27–40` `revokeUserKeys()` / `getKeyPathsForOwner()`.
- Paths: `lib/thinx/files.js:16–18` `deployPathForOwner()`; repo path via `devices.prefetch_repository()`.
- Scheduled purge: `lib/thinx/gdpr.js:41–51` `purgeIfExpired()` / `purgeOldUsers()`.
- Build delete view: `design/design_builds.json` `delete_expired`.
- Tests today: `spec/jasmine/GDPRSpec.js` (notify/guard only); `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:218–243` (HTTP 200 only; `DELETE /api/v2/user` is `xit`-skipped). Tests need Redis/CouchDB → validated in CircleCI.
</code_context>

<specifics>
## Specific Ideas / Acceptance

- Seeded owner (devices, builds, RSA key files, Redis keys, fs dirs) → after purge every store is empty for that owner.
- `KEYS /<owner>/*` and `ak:<owner>` return empty immediately (del, not 1s expire).
- Negative test: crafted owner id cannot delete outside `data_root/.../<owner>`.
- Orchestrator reused by `purgeOldUsers()` (assert single code path).
- Un-skip / replace the `xit` delete test.
- Per-step audit log line emitted.
</specifics>

<deferred>
## Deferred Ideas

- GitHub deploy-key (RSA pushed to GitHub) removal — needs #392 per-user token; revisit after Phase 19.
- CouchDB API-key audit docs (if any exist separately) — include only if discovered during planning; otherwise note as follow-on.
</deferred>
