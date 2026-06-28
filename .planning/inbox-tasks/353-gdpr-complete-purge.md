# Task: Complete GDPR user purge across all data stores (#353)

**Type:** bug / compliance · **Effort:** L (1–2 days) · **Risk:** HIGH (irreversible deletes) · **Priority:** `priority` label — highest-value inbox item

## Completion check (asked: "has this been implemented?")
**NO — still incomplete.** Verified against current code. Today's purge path
(`DELETE /api/v2/gdpr` → `revokeGDPR()` in `lib/router.gdpr.js:21–64`, plus
`owner.delete()` in `lib/thinx/owner.js:709–728`) only handles a subset.

| Required by #353 | Status | Where |
|---|---|---|
| User document (CouchDB) | ✅ done | `owner.js:709–728` (atomic edit `deleted:true`, else destroy) |
| Device documents (CouchDB) | ✅ done | `devices.js:106–124` `destroy_device()` + MQTT revoke |
| `deploy_path` + owner_id files | ❌ missing | path helper exists `files.js:16–18` `deployPathForOwner()`, never called on delete |
| `repo_path` + owner_id files | ❌ missing | no fs cleanup; clones persist |
| RSA key files (owner_id in path) | ❌ missing | cleanup exists `rsakey.js:27–40` `revokeUserKeys()` but NOT called from `revokeGDPR()` |
| Deploy keys (RSA on GitHub/local) | ❌ missing | not addressed |
| Build docs (CouchDB) | ⚠️ deferred only | `design_builds.json` `delete_expired` runs on 3-month expiry via scheduled `purgeIfExpired()` (`gdpr.js:41–51`), not on demand |
| API key docs (CouchDB, if any) | ❌ missing | only Redis touched |
| Redis API keys / cache | ⚠️ weak | `router.gdpr.js:48–54` uses `expire(key,1)` (1s TTL) instead of `del()` |
| MQTT / mosquitto auth (user level) | ⚠️ partial | `auth.js:44–48` `revoke_mqtt_credentials()` per-device only |

## Goal
On GDPR deletion, immediately and verifiably remove ALL data belonging to an
owner across CouchDB, filesystem, RSA keys, and Redis — leaving no recoverable
PII or credentials.

## Scope of changes
Centralize purge into one orchestrator so the endpoint and any scheduled
`purgeOldUsers()` path share it.

- `lib/router.gdpr.js` — `revokeGDPR()`: call the orchestrator; switch Redis
  `expire(key,1)` → `del(key)` for immediate deletion.
- `lib/thinx/owner.js` — keep user-doc destroy; ensure it runs last.
- `lib/thinx/rsakey.js` — wire `revokeUserKeys()` / a `purgeOwner(owner)` that
  deletes every key file for the owner (not just named filenames).
- `lib/thinx/files.js` — add owner-scoped fs purge using `deployPathForOwner()`
  and the repo path; recursive `rm` guarded to the owner subtree only.
- `lib/thinx/devices.js` — bulk-destroy all device docs for owner (currently
  per-device); revoke MQTT creds for each.
- New build-doc deletion: query builds by owner and `_deleted=true` immediately
  (don't wait for 3-month expiry) — reuse `design_builds` view by owner.
- (Optional) GitHub deploy-key removal via `github.js` if a per-user token is
  stored — coordinate with #392; otherwise document as out of scope.

## Implementation notes / safety
- **Guard every fs delete** to `data_root + .../<owner>` prefix; assert the
  resolved path starts with the configured root before `rm -rf`. Never accept an
  empty/`/` owner.
- Make the orchestrator idempotent (safe to re-run; ignore ENOENT).
- Order: revoke creds/MQTT → delete devices → delete builds → delete RSA keys →
  delete fs trees → delete Redis keys → destroy user doc last.
- Wrap each step in try/catch, collect a per-step result report, and log an
  audit line per owner (alog) so deletion is provable.

## Acceptance criteria
- [ ] `DELETE /api/v2/gdpr` removes, for the owner: user doc, all device docs,
      all build docs, all RSA key files, deploy_path tree, repo_path tree, all
      Redis keys (`ak:<owner>` and `/<owner>/*`) via `del` (not expire), and
      per-device MQTT auth.
- [ ] No filesystem artifact containing the owner_id remains under data_root.
- [ ] Redis `KEYS /<owner>/*` and `ak:<owner>` return empty immediately after.
- [ ] fs delete cannot escape the owner subtree (path-prefix assertion tested).
- [ ] Orchestrator is reused by the scheduled `purgeOldUsers()` path.
- [ ] Operation is idempotent and produces an audit log per step.

## Tests (currently absent — must add)
Today: `GDPRSpec.js` tests notify/guard only; `ZZ-AppSessionUserV2DeleteSpec.js`
asserts HTTP 200 only and `DELETE /api/v2/user` is `xit` (skipped).
- [ ] New spec: seed an owner with devices, builds, RSA key files, Redis keys,
      and fs dirs; call purge; assert each store is empty.
- [ ] Negative test: purge with a crafted owner id cannot delete outside root.
- [ ] Un-skip / replace the `xit` delete test.

## Verification
- Run new purge spec green.
- Manual: create disposable account, populate, purge, inspect CouchDB / Redis /
  disk show nothing for that owner.

## Commit(s)
- `feat(gdpr): add owner purge orchestrator (fs, rsa, redis, builds) (#353)`
- `fix(gdpr): delete redis keys immediately instead of 1s expire (#353)`
- `test(gdpr): verify full owner purge across all stores (#353)`
