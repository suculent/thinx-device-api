# Phase 18 — Summary 18-01: Complete GDPR Purge

**Requirement:** SEC-PII-03 · **Issue:** #353 · **Status:** implemented, pending CI

## What shipped

New orchestrator **`lib/thinx/owner_purge.js`** (`OwnerPurge`) that removes every owner-scoped artifact in one place:
- **Path-safety gate** — `OwnerPurge.safeOwnerPath(data_root, base, owner)`: sanitises owner to `^[a-z0-9]{64,}$`, refuses normalised input, asserts resolved path stays under `data_root` and the leaf is the owner. Pure + unit-tested (14 cases): `..`, `/`, empty, undefined, null, short, uppercase, non-ascii all → null.
- **`purge(owner, cb)`** — order: devices+MQTT → builds → RSA keys → deploy tree → repo tree → Redis → user doc **last**. Per-step try/catch, per-step `alog` audit line, idempotent (missing artifacts are not errors). Unsafe owner → `invalid_owner`, deletes nothing.

Collaborators:
- **`rsakey.js` `revokeAllForOwner(owner)`** — deletes every private+public key file for the owner (the existing `revokeUserKeys` only handled a caller-supplied filename list; it was never wired into GDPR).
- **`buildlog.js` `purgeOwner(owner, cb)`** — `latest_builds` view keyed by owner → `buildlib.destroy` each (immediate, not 3-month expiry).

Wiring:
- **`router.gdpr.js` `revokeGDPR`** — replaced the inline device loop + `redis.expire(key,1)` + early user-doc destroy with `OwnerPurge.purge`. Redis keys now `del()` (immediate), not 1s-expire.
- **`gdpr.js`** — scheduled `purgeIfExpired` now runs the **same** orchestrator, but only when `delete_expired` returns `'deleted'` (i.e. the user was genuinely expired) — does not widen which users are deleted vs prior behaviour, so the shared test fixture is safe.

## Gaps closed vs #353
user doc ✓ (already) · devices ✓ (already) · **deploy_path ✓ · repo_path ✓ · RSA key files ✓ · build docs ✓ (immediate) · Redis del-not-expire ✓ · single reused orchestrator ✓ · path-safety ✓ · audit ✓**

## Deferred (noted, not silently dropped)
- GitHub deploy-key removal on purge → needs #392 per-user token (Phase 19); add as a purge step afterwards.
- Separate CouchDB API-key audit docs → none found beyond Redis `ak:`; revisit if discovered.

## Verification
- Local (no services): `OwnerPurgeSpec` path-safety 14/14 + orchestration (del-not-expire, all-steps, user-doc-last, idempotent, unsafe-owner-refused) — all green via standalone harness; `node --check` + eslint clean.
- CI (Redis/CouchDB): full jasmine suite, incl. existing `DELETE /api/v2/gdpr (valid)` exercising the live orchestrator path. Validated on push to thinx-staging.

## Files
`lib/thinx/owner_purge.js` (new), `lib/thinx/rsakey.js`, `lib/thinx/buildlog.js`, `lib/router.gdpr.js`, `lib/thinx/gdpr.js`, `spec/jasmine/OwnerPurgeSpec.js` (new).
