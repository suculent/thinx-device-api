---
phase: 26-vue-console-log-paging
plan: 01
subsystem: database
tags: [couchdb, design-doc, audit, backend, jasmine]

requires:
  - phase: 09 (SEC-PII-02)
    provides: "Audit._buildRecord with expire_at; the record builder this plan hardens"
provides:
  - "design/paging_logs.json: _design/paging for managed_logs (audit_by_owner_date, audit_by_date)"
  - "design/paging_builds.json: _design/paging for managed_builds (builds_by_owner_time, builds_by_time)"
  - "lib/thinx/design_upsert.js: canonical, sameDesign, withTimeout, loadPagingDesign, ensureDesignDoc (never rejects)"
  - "Database.initDatabase(name, dbprefix) and Database.ensureDesignDocs(name, dbprefix) hooked into both init branches"
  - "Audit.fetch on paging/audit_by_owner_date with D-19 fallback; Audit.VIEW_TIMEOUT_MS, Audit.fallbackCount, Audit.toAuditItem, Audit.stringFlags"
  - "Boot log line `[design-upsert] <db> _design/paging action=<action>` (grepped by plan 26-06)"
  - "Warning line `owner-keyed audit view unavailable (reason=<timeout|not_found|error>)`"
affects: [26-02 log paging API, 26-03 audit writers, 26-04 build retention, 26-06 production rollout]

actuals:
  tokens: 14040
  tasks: 2
  commits: 4
plan_head_before: 9ff0ef936159e3d1a1ced657d62e4a6d1ff7695a
plan_head_after: 6c788f19dcbee3f74c8c4516ba5b899ef62d84d0

tech-stack:
  added: []
  patterns:
    - "Rev-aware design-doc upsert: canonical compare (sorted keys, _rev dropped), no write when equal"
    - "Never-throwing boot step: {ok, action, reason} result, credential-free reason tokens, no handleDatabaseErrors"
    - "Spec drives the real CouchDB map string via new Function('emit', ...) through a fake view with collation, descending, range and limit"
    - "First-answer-wins guard (decide()) for a view-vs-timeout race; a late view answer is dropped"

key-files:
  created:
    - design/paging_logs.json
    - design/paging_builds.json
    - lib/thinx/design_upsert.js
    - spec/jasmine/DesignUpsertSpec.js
    - spec/jasmine/AuditOwnerFetchSpec.js
    - spec/jasmine/PagingMapSpec.js
  modified:
    - lib/thinx/database.js
    - lib/thinx/audit.js

key-decisions:
  - "ensureDesignDoc reason tokens come from statusCode, a CouchDB error word, a Node error code (e.g. ECONNREFUSED) or 'timeout', each validated against ^[A-Za-z0-9_.-]{1,40}$; e.message is never read"
  - "loadPagingDesign refuses any file whose _id is not _design/paging, so the upsert can only ever write that id (D-13)"
  - "Audit.fetch additionally keeps only rows whose key[0] === owner (defence in depth on top of the startkey/endkey bound)"
  - "Legacy fallback error line logs only the status code instead of the nano error object (the URL can carry CouchDB credentials)"
  - "A single static Audit.stringFlags() is the D-15 filter for both read (toAuditItem) and write (_buildRecord)"

patterns-established:
  - "initDatabase(name, dbprefix): per-DB init body specs can await without arming init()'s compaction timer"
  - "require.cache swap of lib/thinx/couch + fresh audit.js require, originals restored in afterAll"

requirements-completed: [LOG-01, LOG-02]

coverage:
  - id: D1
    description: "_design/paging upserted rev-aware at boot into managed_logs and managed_builds on both init branches (created / updated / unchanged / conflict / skipped / timeout), never fatal, devices/users untouched"
    requirement: LOG-01
    verification:
      - kind: unit
        ref: "spec/jasmine/DesignUpsertSpec.js#LOG-01 design_upsert.ensureDesignDoc"
        status: pass
      - kind: unit
        ref: "spec/jasmine/DesignUpsertSpec.js#LOG-01 Database.initDatabase installs _design/paging on both init branches"
        status: pass
    human_judgment: false
  - id: D2
    description: "_design/logs and _design/builds files unchanged; only the id _design/paging is ever written (D-13)"
    requirement: LOG-01
    verification:
      - kind: other
        ref: "git diff --quiet origin/thinx-staging -- design/design_builds.json design/design_logs.json"
        status: pass
      - kind: unit
        ref: "spec/jasmine/DesignUpsertSpec.js#404 on GET creates the doc without a _rev (action created)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Legacy audit call returns the caller's own newest <= 200 {date, message, flags} items from audit_by_owner_date with string-only flags; non-string owner returns [] with no query"
    requirement: LOG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/AuditOwnerFetchSpec.js#LOG-02 Audit.fetch on the owner-keyed paging view"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-19 fallback to logs/logs_by_owner on not_found, error or VIEW_TIMEOUT_MS with strict owner equality, one owner-free warning, counted, callback exactly once"
    requirement: LOG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/AuditOwnerFetchSpec.js#fallback to the legacy view (D-19)"
        status: pass
    human_judgment: false
  - id: D5
    description: "All four _design/paging map functions evaluated (owner-less, object-flag, nested log[0] build docs), ES5-only, exact view sets"
    requirement: LOG-01
    verification:
      - kind: unit
        ref: "spec/jasmine/PagingMapSpec.js#_design/paging map functions"
        status: pass
    human_judgment: false
  - id: D6
    description: "Audit._buildRecord writes string-only flags (object, empty, >32-char dropped; ['info'] fallback)"
    requirement: LOG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/AuditOwnerFetchSpec.js#_buildRecord writes string-only flags (D-15)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real-CouchDB behaviour (upsert over an older rev, ICU collation of the owner range, index build time on the 662k by-seq managed_logs)"
    requirement: LOG-01
    verification: []
    human_judgment: true
    rationale: "Local specs use a fake CouchDB by design; the real-server proof is plan 26-02's ZZ-LogPagingCouchSpec in CI and the plan 26-06 production rollout"

duration: 8min
completed: 2026-10-01
status: complete
---

# Phase 26 Plan 01: Paging Design Docs and Owner-Keyed Audit Fetch Summary

**`_design/paging` for managed_logs and managed_builds is now upserted rev-aware on every boot by a never-throwing `ensureDesignDoc`. The legacy audit call reads the caller's own newest 200 entries from `audit_by_owner_date` with string-only flags, and falls back to the old view (strict owner equality, single callback) while the new index builds.**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-01T14:36:49Z
- **Completed:** 2026-10-01T14:45Z
- **Tasks:** 2 (each RED test commit, then GREEN feat commit)
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- LOG-01 root cause fixed. Every production boot takes the 412 "already exists" branch of `Database.init`, where `injectDesign` never runs. `initDatabase` now calls `ensureDesignDocs` on that branch and on the create-success branch. It runs fire-and-forget and never goes through `handleDatabaseErrors`, so it cannot reach `process.exit`.
- `ensureDesignDoc` compares canonically, ignoring key order and `_rev`. A restart with unchanged files writes nothing and triggers no re-index. A changed file is written with the stored `_rev`, and a 409 is resolved by a re-GET. Every call is bounded by a 5 s timeout.
- `Audit.fetch` now sends `{startkey:[owner,{}], endkey:[owner], descending:true, limit:200}`. The old query took the global newest 200 rows and filtered them with a substring match, so prefix and substring owners leaked in and busy tenants got short lists.
- D-15 is enforced in three places: the view map, `toAuditItem` on both fetch paths, and `_buildRecord` on write. A user document with a password hash, reset key and email in `flags` comes out as `["info"]`.
- 54 new local specs, all helper-free. The full set with OwnerPurgeSpec is 64 specs, 0 failures.

## Task Commits

1. **Task 1 (tracer): `_design/paging` for managed_logs, boot hook, owner-keyed audit fetch**
   - RED `68b8ac39`: test(26-01): add failing specs for paging design upsert and owner-keyed audit fetch
   - GREEN `f15ef7d9`: feat(26-01): rev-aware paging design doc and owner-keyed legacy audit fetch
   - Tracer gate: `end-of-phase` mode with an automated-only verify. Both verify commands were re-run and passed, so expansion went ahead with no checkpoint.
2. **Task 2: `_design/paging` for managed_builds, all maps evaluated, string-only write flags**
   - RED `420a95aa`: test(26-01): add failing specs for paging build views and string-only audit write flags
   - GREEN `6c788f19`: feat(26-01): paging build views and string-only audit flags on write

All four commits are GPG-signed (`%G?` = `G`). No REFACTOR commit was needed.

## Files Created/Modified

- `design/paging_logs.json`: `audit_by_owner_date` (verbatim from 26-RESEARCH.md, checked byte-for-byte with `cmp`) and the ES5 `audit_by_date` (key ISO date, value `_rev`, owner-less docs included for retention).
- `design/paging_builds.json`: `builds_by_owner_time` and `builds_by_time`, parsed directly out of 26-RESEARCH.md § "Build view".
- `lib/thinx/design_upsert.js`: the upsert module. It resolves the JSON with `path.join(__dirname, ...)` rather than `Filez.appRoot()`.
- `lib/thinx/database.js`: `initDatabase`, the static `isAlreadyExists`, and `ensureDesignDocs`. `init()` behaviour is unchanged apart from the hook, and the `existing_dbs.includes(name)` comparison is left as it was.
- `lib/thinx/audit.js`: `stringFlags`, `toAuditItem`, the new `fetch`, `_fetchLegacy`, the `VIEW_TIMEOUT_MS`/`fallbackCount` statics, and string-only `_buildRecord` flags. The export changed from `module.exports = class Audit` to `class Audit … module.exports = Audit`, which is the same object.
- `spec/jasmine/DesignUpsertSpec.js`, `spec/jasmine/AuditOwnerFetchSpec.js`, `spec/jasmine/PagingMapSpec.js`: new local specs.

`lib/router.logs.js` was not edited (`git diff --quiet origin/thinx-staging -- lib/router.logs.js` exits 0).

## TDD Evidence

- **Task 1 RED:** 28 specs, 27 failures. The audit cases failed on assertions about the planned behaviour. For example, the query was `logs/logs_by_owner` instead of `paging/audit_by_owner_date`, the 205-doc case returned 195 items, and the prefix/substring-owner case returned `['inner','longer','mine']`. The upsert cases failed with `Cannot find module design_upsert.js`. The one case that passed was the credential-flag case: the legacy view never projected flags, so the old path already returned `["info"]`. It stays as a regression guard.
- **Task 2 RED:** 64 specs, 15 failures. The `_buildRecord` cases failed on assertions (for example, the stored flags were `[ { password: 'h' } ]` instead of `['info']`). The builds-map cases failed because `paging_builds.json` did not exist.
- **GREEN:** 28/0 after Task 1 and 64/0 after Task 2.
- `gsd_run check tdd-red-evidence` was not run. It only parses TAP or Surefire XML, and jasmine prints neither. `workflow.tdd_mode` is false, so the gate is advisory. The test-before-feat commit order exists for both tasks.

## Decisions Made

See `key-decisions` in the frontmatter. In short: reason tokens are validated and never taken from `e.message`, `loadPagingDesign` only accepts `_id === "_design/paging"`, `fetch` re-checks `key[0] === owner`, and one `Audit.stringFlags` serves both reads and writes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] ensureDesignDoc reason also accepts a Node error code**
- **Found during:** Task 1
- **Issue:** The plan limits `reason` to statusCode, `error` or "timeout". A refused connection has none of those, so the boot line would only say `reason=error`.
- **Fix:** `reasonOf()` also accepts `e.code` (e.g. `ECONNREFUSED`). Every token must match `^[A-Za-z0-9_.-]{1,40}$`, otherwise it becomes `error`. `e.message` is never read. The spec asserts the reason contains neither `http` nor `@`.
- **Commit:** f15ef7d9

**2. [Rule 2 - Security] Legacy fetch error line no longer logs the nano error object**
- **Found during:** Task 1 (rewriting `fetch` into `_fetchLegacy`)
- **Issue:** The old `console.error("Audit Log Fetch Failed", {err})` printed the whole error, and that can include the credentialed CouchDB URL (T-26-05).
- **Fix:** It now logs only the status code. The `callback(err, body)` contract is unchanged.
- **Commit:** f15ef7d9

**3. [Rule 1 - Bug] fetch guards against an unhandled rejection from the callback**
- **Found during:** Task 1
- **Issue:** `fetch` uses the promise form of the view. If the router callback threw inside the `.then`, the result would be an unhandled rejection, which kills the process on Node 15+.
- **Fix:** A trailing `.catch` logs a fixed owner-free line. A `key[0] === owner` row filter was also added as defence in depth.
- **Commit:** f15ef7d9

**4. [Rule 3 - Blocking] DesignUpsertSpec builds assertion staged across tasks**
- **Found during:** Task 1 GREEN
- **Issue:** The RED spec expected an insert into managed_builds, but `paging_builds.json` belongs to Task 2.
- **Fix:** In Task 1 the spec asserted only that the builds upsert was attempted and logged (it logged `action=skipped reason=no_design_file`). Task 2's RED commit restored the full `inserts == ["_design/paging"]` and `action=created` assertions, plus `loadPagingDesign("builds")`. DesignUpsertSpec is not in Task 2's `<files>` list.
- **Commits:** f15ef7d9, 420a95aa

---

**Total deviations:** 4 auto-fixed (2 security, 1 bug, 1 blocking).
**Impact on plan:** All four are small and local. Contracts, view names, value shapes and log line formats are exactly as specified.

## Issues Encountered

- The first RED run mixed the chai `expect` with a jasmine matcher (`toHaveBeenCalled`). Both specs were fixed to use `process.exit.calls.count()` before the RED commit.

## Deferred Issues (out of scope, not fixed)

- `Audit._buildRecord` (pre-existing) still prints the owner id in `console.warn("Audit log issue: no message for owner " + owner …)` when the message is undefined. This plan did not touch that line. It belongs with the plan 26-03 writer changes or a separate log-hygiene fix.

## Known Stubs

None.

## User Setup Required

None. Plan 26-06 covers the production rollout: deploy outside 01:00–05:00 and 06:25–07:10 UTC, then grep `[design-upsert]` and warm the index.

## Next Phase Readiness

- Plans 26-02 (paging API, ZZ-LogPagingCouchSpec), 26-04 (retention on `audit_by_date` / `builds_by_time`) and 26-06 (rollout) can rely on the final view names and value shapes.
- Both design docs are final. Any later edit re-indexes every view in that doc.

## Self-Check: PASSED

- All 8 key files are on disk.
- Commits 68b8ac39, f15ef7d9, 420a95aa and 6c788f19 are in git history, all signed `G`.
- Plan verify markers printed: UPSERT-OWNER-FETCH-GREEN, PAGING-LOGS-DDOC-OK, DESIGN-LOGS-UNTOUCHED, PAGING-MAPS-GREEN, PAGING-BUILDS-DDOC-OK, LEGACY-DDOCS-UNTOUCHED.
- Extra regression run: DesignUpsert, AuditOwnerFetch, PagingMap, ZZ-AuditTTL and ZZ-CouchCallbackShim specs, 70 specs, 0 failures.

---
*Phase: 26-vue-console-log-paging*
*Completed: 2026-10-01*
