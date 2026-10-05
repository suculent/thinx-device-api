---
phase: 26-vue-console-log-paging
reviewed: 2026-10-02T00:00:00Z
depth: standard
files_reviewed: 49
files_reviewed_list:
  - README.md
  - design/paging_builds.json
  - design/paging_logs.json
  - docker-entrypoint.sh
  - lib/router.logs.js
  - lib/thinx/audit.js
  - lib/thinx/buildlog.js
  - lib/thinx/database.js
  - lib/thinx/design_upsert.js
  - lib/thinx/log_paging.js
  - lib/thinx/log_retention.js
  - lib/thinx/owner.js
  - lib/thinx/sources.js
  - package.json
  - scripts/clear-leaked-credentials.js
  - scripts/install-log-retention-cron.sh
  - scripts/log-paging-probe.js
  - scripts/log-retention.js
  - scripts/stack-deploy
  - scripts/thinx-log-retention.sh
  - services/console/vue/cypress/fixtures/api/audit-log-page1.json
  - services/console/vue/cypress/fixtures/api/audit-log-page2.json
  - services/console/vue/cypress/fixtures/api/build-log-page1.json
  - services/console/vue/cypress/fixtures/api/build-log-page2.json
  - services/console/vue/cypress/integration/device-detail.spec.js
  - services/console/vue/cypress/integration/history.spec.js
  - services/console/vue/cypress/support/session.js
  - services/console/vue/package.json
  - services/console/vue/src/core/api.js
  - services/console/vue/src/pages/History/History.vue
  - services/console/vue/src/store/auditlog.js
  - services/console/vue/src/store/buildlog.js
  - services/console/vue/src/store/logPaging.js
  - services/console/vue/tests/unit/log-paging-store.cjs
  - spec/jasmine/AuditFlagWritersSpec.js
  - spec/jasmine/AuditOwnerFetchSpec.js
  - spec/jasmine/BuildLogOwnerSpec.js
  - spec/jasmine/BuildlogPagingSpec.js
  - spec/jasmine/ClearLeakedCredentialsSpec.js
  - spec/jasmine/DesignUpsertSpec.js
  - spec/jasmine/LogPagingProbeSpec.js
  - spec/jasmine/LogPagingSpec.js
  - spec/jasmine/LogRetentionSpec.js
  - spec/jasmine/LogRouterPagingSpec.js
  - spec/jasmine/OwnerLogLeakSpec.js
  - spec/jasmine/PagingMapSpec.js
  - spec/jasmine/ZZ-LogPagingCouchSpec.js
  - spec/node/InstallLogRetentionCron.test.js
  - spec/node/ThinxLogRetentionWrapper.test.js
findings:
  critical: 0
  warning: 4
  info: 8
  total: 12
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-10-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 49
**Status:** issues_found

## Summary

I reviewed the parent-repo diff (`a4cf69f1^..HEAD`) and the `services/console` submodule diff (`c58dd09..3e77525`). I paid most attention to tenant isolation on the paged and by-id log reads, deletion containment in the retention job, secret hygiene in the operator scripts, and shell safety in the cron installer.

**What holds up:**
- **Paging core.** The cursor never carries an owner. `buildQuery` binds both range ends to the session owner, `extra` cannot override bounds or add `skip`, and `fetchPage`/`listPage` filter rows by owner again after the view call. If a cursor is replayed as another owner, it stays inside that owner's key range.
- **Retention containment.** Candidates must have exactly a strict 64-char owner plus UUID udid and build_id. They also pass `resolveInside` plus lstat both at plan time and immediately before `rmSync`. Only depths 1-3 are walked, and symlinks are never followed when sizing or reading mtimes. Folders are deleted before records. The orphan sweep is skipped when the record set is empty. Mounts are read-write per root only on `--apply`. OTA files at udid level are not reachable at depth 3.
- **Credentials.** The wrapper passes credentials to `docker run` by name only and has no xtrace. Error paths in the scripts reduce errors to status/code tokens. nano 11 scrubs the userinfo from the URLs it puts on error objects.
- **Cron injection.** Cron-line inputs (`--roots`, `--time`, copied env values) are allow-listed before they reach `/etc/cron.d`.

**Defects found:**
- The new owner-bounded by-id read (`fetchOwned`) still sends raw CouchDB error objects to the client as a success. This now happens on every build record the retention job or GDPR purge has deleted.
- `stack-deploy` arms the destructive daily `--apply --roots deploy,repos` job on any host it runs on as root. That bypasses the D-10/D-16 dry-run and per-root approval gate.
- The D-19 audit fallback quietly returns an incomplete list.
- None of the phase's security specs can fail CI.

No issue I found is a blocker given what is actually deployed.

## Warnings

### WR-01: `fetchOwned` returns non-"missing" CouchDB errors to the client as a successful body, bypassing the owner check

**File:** `lib/thinx/buildlog.js:282-293`, `lib/router.logs.js:64-80`

**Issue:** `_fetch` only maps errors whose string contains `Error: missing` to `missingBuildBody`. Every other error is passed on as `callback(false, err)`, with err=false and the error as the body. That is true even when `required_owner` is set. The router then checks `if (err)`, which is false, so it runs `body.success = true; Util.respond(res, body)` and JSON-serialises the nano error object.

Reachable cases:
- **Deleted builds.** Any build record deleted by the retention job (`_deleted` tombstone) or by `purgeOwner` makes `buildlib.get` reject with `{error:"not_found", reason:"deleted"}`, whose message is `deleted`, not `missing`. The response then contains `scope`, `statusCode`, `request` (method, headers, and URL with host, port, db name and doc id; userinfo is scrubbed by nano), `headers`, `errid`, `error` and `reason`, all under `success: true`.
- **Invalid build ids.** For any id that is not a valid UUID, `sanitka.udid` returns `null`. nano then rejects with its module-level `invalidParametersError` singleton, and the router sets `success = true` on that shared object.
- **Transient failures.** 5xx and connection errors take the same path.

Impact:
- Internal CouchDB topology is disclosed to any authenticated user.
- Failures are reported as `success: true`.
- Deleted builds of any tenant are distinguishable from ids that never existed. This contradicts the documented `fetchOwned` contract ("another owner's build is answered exactly like a missing build").

The tombstone case now happens routinely, because the retention job deletes build records every day.

**Fix:** In owner-bounded mode, treat every error as "missing". Also stop the router from serialising anything that is an `Error`.
```js
// buildlog.js, inside _fetch
if (err !== null) {
	if (required_owner !== null) {
		console.log(`[error] [buildlog] fetching build log failed (status ${err.statusCode})`);
		return callback(true, Buildlog.missingBuildBody(build_id));
	}
	...existing legacy branch...
}

// router.logs.js fetchBuildLogID, before fetchOwned
let build_id = sanitka.udid(bid);
if (build_id === null) return Util.responder(res, false, "build_fetch_failed");
```

### WR-02: `stack-deploy` arms the one-way `--apply --roots deploy,repos` job without the D-10 dry run or per-root approval

**File:** `scripts/stack-deploy:7-13`, `scripts/install-log-retention-cron.sh:52,123-145`

**Issue:** Any root-run `stack-deploy` now calls the installer. On a host that has no cron file yet, the installer writes a daily `--apply --roots deploy,repos` line with no `--dry-run` first run and no per-root confirmation. D-10 and D-16 make the first run a dry run and require the operator to approve each root, because deletion is one-way (D-09).

Hosts that would get the armed job on their next deploy:
- a fresh or rebuilt swarm manager;
- a manager restored from backup;
- a staging stack deployed with this script against the shared gluster tree.

On any of these, the job deletes records and folders on both roots the next morning, and nobody has reviewed the aggregates. Because the installer keeps an existing cron file, the only protection is that the file already exists.

**Fix:** Have `stack-deploy` install the wrapper only, or install the cron entry in dry-run mode, then require an explicit operator step to switch it to apply. For example, make the installer's default line `--dry-run` and require `--roots` explicitly before it writes `--apply`:
```bash
# install-log-retention-cron.sh
ROOTS=""            # no default; dry-run line unless --roots is given
...
if [ -z "$ROOTS" ]; then
  echo "$MINUTE $HOUR * * * root $TARGET_WRAPPER --dry-run"
else
  echo "$MINUTE $HOUR * * * root $TARGET_WRAPPER --apply --roots $ROOTS"
fi
```

### WR-03: The D-19 audit fallback quietly returns an incomplete (often empty) list with `success: true`

**File:** `lib/thinx/audit.js:172-186` (view: `design/design_logs.json:6`)

**Issue:** `_fetchLegacy` queries `logs/logs_by_owner` with `descending: true, limit: 200` and no key restriction (`/*"key": owner,*/`). That view is keyed `[doc.date, doc.owner]`, so the query returns the 200 newest audit entries across all tenants. The code then keeps only the caller's entries.

The fallback runs whenever the owner-keyed view is missing, errors, or takes longer than `VIEW_TIMEOUT_MS`, for example during an index rebuild after a `_design/paging` change. In that situation most owners get an empty or truncated audit log, the response is still `success: true`, and nothing tells the classic console the result is partial. Nothing leaks across tenants because of the strict filter, but the result is silently wrong.

**Fix:** When the owner-keyed view is unavailable, return an explicit error such as `log_fetch_failed` / `log_index_building`, or bound the legacy read correctly. The legacy view cannot be bounded by owner, so prefer the error. At minimum, mark the response as partial so callers can tell.

### WR-04: None of the phase's security specs can fail CI

**File:** `package.json:18`, `docker-entrypoint.sh:104-109`, `spec/node/InstallLogRetentionCron.test.js`, `spec/node/ThinxLogRetentionWrapper.test.js`

**Issue:**
- `npm run test` runs `jasmine || true`. On the coverage branch it runs `nyc jasmine;` with the result ignored. Every jasmine spec added in this phase therefore runs with no effect on the job status, including BuildLogOwnerSpec, LogRouterPagingSpec, LogRetentionSpec, ClearLeakedCredentialsSpec, OwnerLogLeakSpec and ZZ-LogPagingCouchSpec.
- The two `node --test` suites that check cron-line validation and that the wrapper never puts credentials on argv or stdout are not referenced by any `package.json` script or by `.circleci/config.yml`. They never run in CI at all.

A regression in tenant isolation, deletion containment or credential hygiene would ship green. This phase's changes are already in production, so that guard matters.

**Fix:**
- Add a gating step that runs the phase's specs without `|| true`, for example a dedicated `test:phase26` script listing the non-ZZ phase-26 jasmine specs.
- Add `node --test spec/node/InstallLogRetentionCron.test.js spec/node/ThinxLogRetentionWrapper.test.js` to the CircleCI job that already runs `ConsoleHeaderParity.test.js`.

## Info

### IN-01: The server can issue a `next_cursor` that its own decoder rejects

**File:** `lib/thinx/log_paging.js:34-36, 40-62, 83-95`

**Issue:** `pageFromRows` encodes `next.key[1]` and `next.id` with no checks. `decodeCursor` rejects audit keys longer than 64 chars, ids longer than 128 chars, and ids with control characters. If an audit doc's `date` string or a doc id falls outside those limits, every "Load more" at that boundary gets `400 invalid_cursor`, and the user can never page past it. The Vue console shows the retry error permanently.

**Fix:** Apply the same validity check before encoding. If the boundary row would make an invalid cursor, set `has_more: false` (or skip that row) and log a counter.

### IN-02: `Audit._buildRecord` still accepts an object as `message`

**File:** `lib/thinx/audit.js:35-53`

**Issue:** The D-15 comment says no object can reach `managed_logs` through `Audit.log` "whatever a caller passes". Only `flags` is sanitised, though. If `message` is undefined, `message = flag` copies the raw `flag` argument, which can be an object, into the record before `stringFlags` runs. An object passed directly as `message` is also stored as is.

**Fix:** Coerce `message` to a string (`typeof message === "string" ? message : String(flag-or-"info")`), or drop non-string values.

### IN-03: owner.js still logs request bodies, user rows and owner ids on some paths

**File:** `lib/thinx/owner.js:452, 562, 566, 608`

**Issue:**
- Line 452 logs the whole profile-update request `body` (PII) when the update key is missing.
- Lines 562 and 566 log the users-view envelope or row (key = e-mail, possibly the doc) on the password-reset fallback path.
- Line 608 logs the owner id on every successful `atomic()` edit. OwnerLogLeakSpec only covers the failure path.

These are pre-existing, but this phase edited the neighbouring lines for the same D-15 log-hygiene goal.

**Fix:** Log only tokens: action name, row count, status code.

### IN-04: Retention protects folders by full `owner/udid/build_id`, and record-driven deletes ignore the protect set

**File:** `lib/thinx/log_retention.js:262-284, 306-316, 454-479`

**Issue:** `protect` is keyed by the full relative path, and records with a null or odd `udid` contribute nothing to it. Record-driven deletion does not check whether another, non-expired record maps to the same folder. Build ids are UUIDs and are already the doc `_id`, so keying protection by `build_id` alone would be strictly safer and cheap.

**Fix:** Add each record's `build_id` (lower-cased) to a second set. In the orphan sweep, skip any folder whose basename is in that set. For record-driven deletes, skip a folder whose `build_id` also belongs to a non-expired record.

### IN-05: The wrapper log grows without bound, and usage errors are never written to it

**File:** `scripts/thinx-log-retention.sh:42, 53-56, 70-75`

**Issue:** `/var/log/thinx-log-retention.log` is append-only and has no logrotate entry. `usage()` exits 2 without calling `log_line`, so a malformed cron line leaves no trace in the job log.

**Fix:** Ship a logrotate stanza, or rotate by size in the wrapper, and call `log_line` from `usage()`.

### IN-06: History treats a non-success first page as loaded

**File:** `services/console/vue/src/pages/History/History.vue:363-371`, `services/console/vue/src/store/auditlog.js:56-63`, `services/console/vue/src/store/buildlog.js:51-58`

**Issue:** `fetchAuditlog` and `fetchBuildLog` resolve, not reject, when the API answers `success: false`. `loadData` then copies whatever the store already held (stale data from an earlier mount, or empty) together with the stale paging. The user sees "No audit events." or old rows, with no error and possibly a stale `next_cursor`.

**Fix:** Return a status from the first-page actions, or reject on `!result.success`, so History can show the same retry alert it uses for Load more.

### IN-07: Boot-time design upsert causes a reindex while the paged path has no fallback

**File:** `lib/thinx/database.js:107-161`, `lib/thinx/audit.js:146-168`, `lib/thinx/buildlog.js:393-413`

**Issue:** Any future change to `design/paging_*.json` is applied on the next API boot. CouchDB then rebuilds both paging indexes, and view queries block until the rebuild finishes. `fetchPage` and `listPage` have no timeout or fallback, so the Vue dashboard and History requests hang during the rebuild. D-12's "switch after warm" only covered the initial rollout.

**Fix:** Install changed views under a new design-doc name, warm them, then switch. Alternatively, add `update: "lazy"` or a timeout with a clear error on the paged path.

### IN-08: `clear-leaked-credentials.js` does not validate host or port before building a credentialed URL

**File:** `scripts/clear-leaked-credentials.js:182-191`

**Issue:** `scripts/log-retention.js:145-148` allow-lists `COUCHDB_HOST` and `COUCHDB_PORT`. This script concatenates them into the credentialed URL unchecked. Both are operator env, but a stray `@` or `/` would send the credentials to an unintended host.

**Fix:** Reuse the same `^[A-Za-z0-9._-]{1,253}$` and `^[0-9]{1,5}$` checks.

---

_Reviewed: 2026-10-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
