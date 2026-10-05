---
phase: 26-vue-console-log-paging
plan: 02
subsystem: api
tags: [api, paging, couchdb, gdpr, backend, jasmine]

requires:
  - phase: 26-01
    provides: "_design/paging (audit_by_owner_date, audit_by_date, builds_by_owner_time, builds_by_time), ensureDesignDoc/loadPagingDesign/sameDesign, Audit.toAuditItem, Audit.fallbackCount"
provides:
  - "lib/thinx/log_paging.js: parseLimit, encodeCursor, decodeCursor, buildQuery, pageFromRows, MAX_LIMIT (200), DEFAULT_LIMIT (100)"
  - "Audit#fetchPage(owner, limit, cursor, cb) -> cb(false, {items, paging}) | cb(err)"
  - "Buildlog#listPage(owner, limit, cursor, cb) -> cb(false, {rows (with doc), paging}) | cb(err); Buildlog.toBuildListItem(doc)"
  - "Buildlog#list keyed by owner, side-effect free (prune method removed, D-07)"
  - "Buildlog#purgeOwner over builds_by_owner_time [owner]..[owner,{}] include_docs, latest_builds fallback (D-18)"
  - "GET /api/v2/logs/audit, /api/v2/logs/build (+ v1 /api/user/logs/audit, /api/user/logs/build/list): opt-in paged branch {success, response, paging}; 400 invalid_limit / invalid_cursor"
  - "scripts/log-paging-probe.js: read-only, aggregate-only LOG-01..04 production probe (run by 26-06)"
affects: [26-05 Vue stores (response shape), 26-06 production rollout and probe, 26-04 retention (prune moved off the read path)]

actuals:
  tokens: 28066
  tasks: 3
  commits: 3
plan_head_before: fbf48b733df9d51fed0e032299149cd62a398f64
plan_head_after: 9a0ac3f5bf809e6b3b8fd53ec56c9e9411178560

tech-stack:
  added: []
  patterns:
    - "Owner-free opaque cursor base64url({v:1,k,i}); the server re-binds startkey[0] and endkey to the session owner on every query"
    - "buildQuery merges `extra` FIRST, then forces descending/startkey/endkey/limit and drops skip/startkey_docid, so no caller option can widen the range"
    - "Router opt-in split: hasOwnProperty(limit|cursor) -> paged branch via Util.respond with literal key order; otherwise Util.responder (legacy bytes shape)"
    - "Probe output contract: fixed key=value lines then LOG-PAGING-PROBE OK|FAIL <keys>; error lines carry <status>_<word> only"
    - "Spec fake CouchDB that evaluates the real design-doc map strings with collation, startkey_docid tie-break and include_docs; delegating db handles because lib modules bind their handle at load"

key-files:
  created:
    - lib/thinx/log_paging.js
    - scripts/log-paging-probe.js
    - spec/jasmine/LogPagingSpec.js
    - spec/jasmine/LogRouterPagingSpec.js
    - spec/jasmine/BuildlogPagingSpec.js
    - spec/jasmine/LogPagingProbeSpec.js
    - spec/jasmine/ZZ-LogPagingCouchSpec.js
  modified:
    - lib/thinx/audit.js
    - lib/thinx/buildlog.js
    - lib/router.logs.js

key-decisions:
  - "buildQuery applies `extra` before the owner bounds, so include_docs is merged but no extra key can override startkey/endkey/descending/limit or add skip/startkey_docid"
  - "decodeCursor also rejects non-object JSON (arrays, scalars, null) and an unknown kind; parseLimit rejects null/number/array (only a 1-4 digit string or absent)"
  - "Audit#fetchPage and Buildlog#listPage re-check key[0] === owner before slicing (defence in depth over the bounded range); listPage also drops rows without doc"
  - "purgeOwner validates the owner (non-empty string) before querying; destroy-failure lines no longer print the build id"
  - "The probe fails on legacy_fallback_used > 0: after warm-up the legacy call must be served by the new view"
  - "Probe owner discovery and range counts page with startkey/startkey_docid in batches of 1000; the API-path walk and the raw-view walk run side by side page by page"

patterns-established:
  - "Paged response: {success:true, response:[...], paging:{limit, has_more, next_cursor}}; next_cursor null when has_more is false; no total_rows"
  - "Owner always from sanitka.owner(req.session.owner); query/cursor/body never supply it"

requirements-completed: [LOG-02, LOG-03, LOG-04]

coverage:
  - id: D1
    description: "log_paging core: limit parse/clamp, owner-free cursor encode/decode with strict validation, owner-bounded buildQuery without skip, pageFromRows has_more/next_cursor"
    requirement: LOG-03
    verification:
      - kind: unit
        ref: "spec/jasmine/LogPagingSpec.js#LOG-03 log_paging.parseLimit / cursors / buildQuery / pageFromRows"
        status: pass
    human_judgment: false
  - id: D2
    description: "Paged audit end to end in-process: /api/v2/logs/audit and /api/user/logs/audit answer {success, response, paging} with limit/cursor, legacy {success, response} without; owner only from the session; 400 invalid_limit/invalid_cursor; 401 without session; log_fetch_failed on error; Audit#fetchPage queries paging/audit_by_owner_date with buildQuery"
    requirement: LOG-03
    verification:
      - kind: unit
        ref: "spec/jasmine/LogRouterPagingSpec.js#audit /api/v2/logs/audit, audit /api/user/logs/audit"
        status: pass
      - kind: unit
        ref: "spec/jasmine/LogPagingSpec.js#LOG-03 Audit.fetchPage on the owner-keyed view"
        status: pass
    human_judgment: false
  - id: D3
    description: "Paged build list over flat and nested docs (listPage, toBuildListItem), legacy list keyed by owner with the 30-day display filter and no destroy, prune method removed; builds routes paged/legacy split with build_list_failed/build_list_empty"
    requirement: LOG-04
    verification:
      - kind: unit
        ref: "spec/jasmine/BuildlogPagingSpec.js#LOG-04 Buildlog list / listPage / purgeOwner / toBuildListItem"
        status: pass
      - kind: unit
        ref: "spec/jasmine/LogRouterPagingSpec.js#builds /api/v2/logs/build, builds /api/user/logs/build/list"
        status: pass
      - kind: other
        ref: "grep -cE '\\.prune\\(|^[[:space:]]*prune\\(' lib/thinx/buildlog.js == 0 (NO-PRUNE-ON-READ)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Legacy no-param shape kept: audit {success, response} via Audit.fetch (200 cap from 26-01), builds = owner's flat builds of the last 30 days in the legacy item shape"
    requirement: LOG-02
    verification:
      - kind: unit
        ref: "spec/jasmine/LogRouterPagingSpec.js#no query: legacy {success, response}"
        status: pass
    human_judgment: false
  - id: D5
    description: "GDPR purgeOwner reaches nested builds through builds_by_owner_time and falls back to latest_builds {key: owner} on a view error (D-18)"
    requirement: LOG-04
    verification:
      - kind: unit
        ref: "spec/jasmine/BuildlogPagingSpec.js#purgeOwner(owner) (GDPR, D-18)"
        status: pass
      - kind: unit
        ref: "spec/jasmine/OwnerPurgeSpec.js (caller contract unchanged)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Read-only production probe with the exact 33-key contract, aggregate-only output, OK on consistent data, FAIL audit_foreign on a leaked row, owner discovery without skip"
    requirement: LOG-03
    verification:
      - kind: unit
        ref: "spec/jasmine/LogPagingProbeSpec.js#log-paging-probe (local, fakes)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real-CouchDB proof: upsert over an older rev, ICU collation, startkey_docid tie-break, cross-owner replay, nested builds, builds_by_time cutoff, GDPR purge, probe OK (ZZ-LogPagingCouchSpec)"
    requirement: LOG-03
    verification:
      - kind: other
        ref: "node --check spec/jasmine/ZZ-LogPagingCouchSpec.js (PROBE-AND-CI-SPEC-PARSE)"
        status: pass
      - kind: integration
        ref: "spec/jasmine/ZZ-LogPagingCouchSpec.js (CI)"
        status: unknown
    human_judgment: true
    rationale: "Not executed: no local CouchDB was running, and CI deletes ZZ*.js on node 0 (parallelism 1), so it will not run on the 26-06 push unless split-tests is changed (deferred-items.md 26-02 item 1). Plan 26-06's production probe is the other proof of replay safety."

duration: 17min
completed: 2026-10-01
status: complete
---

# Phase 26 Plan 02: Opt-in Cursor Paging for the Audit Log and Build List Summary

**`GET /api/v2/logs/audit` and `/logs/build` now page on request (`?limit=` / `?cursor=`). Each page comes from the owner-keyed `_design/paging` views and answers `{success, response, paging}`. The cursor is an opaque base64url `{v,k,i}` that never carries the owner. Build reads no longer delete anything. The GDPR purge now reaches the nested-shape builds. A read-only probe with an aggregate-only contract is ready for plan 26-06.**

## Performance

- **Duration:** about 17 min
- **Started:** 2026-10-01T15:31:40Z
- **Completed:** 2026-10-01T15:48:27Z
- **Tasks:** 3 (1 tracer, 2 expansion)
- **Files modified:** 10 (7 created, 3 modified)

## Accomplishments

- **LOG-03:** an audit request with `limit` or `cursor` goes to `Audit#fetchPage`. The query is `startkey [owner, k|{}]`, `startkey_docid i` (cursor only), `endkey [owner]`, `descending`, `limit L+1`. `has_more` comes from the extra row, and `next_cursor` is `null` on the last page. The response keys are exactly `success, response, paging`, and `paging` holds exactly `limit, has_more, next_cursor`. No `skip` and no `total_rows` anywhere.
- **Validation:** `limit` must be a 1–4 digit string. It defaults to 100 and is clamped to [1, 200]. The cursor must be a base64url string of at most 512 chars that decodes to a JSON object with `v === 1`. `i` is 1–128 chars with no control chars. `k` is a string of at most 64 chars for audit, or a finite number for builds. A repeated parameter (array) or anything else gets a 400, `invalid_limit` or `invalid_cursor`. The decoder never throws.
- **Owner binding:** the handlers take the owner only from `sanitka.owner(req.session.owner)`. The spec sends `owner=<other>` and asserts that the model receives the session owner. `buildQuery` binds both range ends to the owner, whatever cursor or `extra` it gets.
- **LOG-04 / D-07:** the legacy `list()` now queries `latest_builds` with `{key: owner}`. It keeps the in-memory owner check and the 30-day display filter. The `prune` method and its call are deleted, and the spec asserts that `destroy` is never called. `listPage()` covers flat and nested documents with `include_docs`. `toBuildListItem` replaces the router's mutating loop and uses a shallow copy.
- **D-18:** `purgeOwner` destroys `row.doc._id/_rev` over `builds_by_owner_time [owner]..[owner,{}]`. That covers the ~113 nested production docs that `latest_builds` keys as null. On a view error it logs one owner-free warning and falls back to the old path.
- **Probe:** `scripts/log-paging-probe.js` emits the 33 contracted keys in order, then `LOG-PAGING-PROBE OK|FAIL <keys>`. It walks the API path (`fetchPage`/`listPage`) and the raw view side by side. It replays A's first cursor as B and compares `doc_del_count` before and after the build reads. The spec proves the output has no 64-hex, no `@` and no cursor. Two mutation runs confirmed the spec catches a dropped `startkey_docid` (`audit_total,audit_dupes`) and a dropped owner bound (`replay_foreign`).
- The full local Phase 26 backend set passes: 180 specs, 0 failures.

## Task Commits

1. **Task 1 (tracer): paged audit end to end.** `e80be24e` feat(26-02): opt-in cursor paging for the audit log
   - Tracer gate: `end-of-phase` mode with an automated-only verify. The verify was re-run after the commit and printed AUDIT-PAGING-GREEN (84 specs, 0 failures), so expansion went ahead with no checkpoint.
2. **Task 2: paged, side-effect-free build list and GDPR purge.** `e3f554c3` feat(26-02): paged side-effect-free build list and GDPR purge over both shapes
3. **Task 3: probe, local spec and CI spec.** `9a0ac3f5` test(26-02): paging probe and CouchDB integration spec

All three commits are GPG-signed (`%G?` = `G`). The plan specifies one commit per task, so there are no separate RED commits (see TDD Evidence).

## Files Created/Modified

- `lib/thinx/log_paging.js`: the pure paging core, with no CouchDB or config requires.
- `lib/thinx/audit.js`: `fetchPage`. `fetch` from 26-01 is unchanged.
- `lib/thinx/buildlog.js`: the keyed, side-effect-free `list`, plus `listPage`, `static toBuildListItem`, `purgeOwner` over the new view, `_purgeOwnerLegacy` and `_destroyAll`. `prune` is removed.
- `lib/router.logs.js`: `isPagedRequest` and the paged and legacy branches for audit and builds. The touched log lines no longer print an owner id or an error object. `fetchBuildLogID` is unchanged.
- `scripts/log-paging-probe.js`: the read-only probe. It exports `run`, `KEYS`, `errToken` and `ownerFreeCursor`, and its CLI exits 0 on OK and 1 on FAIL.
- Local specs: `spec/jasmine/LogPagingSpec.js` (includes `Audit.fetchPage`), `LogRouterPagingSpec.js`, `BuildlogPagingSpec.js` and `LogPagingProbeSpec.js`. CI spec: `spec/jasmine/ZZ-LogPagingCouchSpec.js`.

## TDD Evidence

- **Task 1 RED:** `log_paging.js` started as an empty skeleton. Module-not-found counts as INVALID_RED, so the skeleton made the specs load. Result: 44 specs, 37 failures. Nearly all were assertion failures on planned behaviour, for example `expected [ 'success', 'response' ] to deeply equal [ 'success', 'response', 'paging' ]` and `expected 200 to equal 400`. The 7 that passed covered the legacy path, no session and never-throws, which already held. **GREEN:** 49/0, and 84/0 with the 26-01 specs.
- **Task 2 RED:** 52 specs, 29 failures, all on the planned behaviour. For example, `blog.listPage is not a function`, an unkeyed `latest_builds` query, the purge still on the old view, and no paged builds branch. **GREEN:** 93/0 with LogPagingSpec and OwnerPurgeSpec.
- **Task 3:** the probe and its spec were written together. The first run timed out on a spec-harness bug (see Issues). After the fix: 7/0. The mutation checks above show the spec fails for the right reasons.
- `gsd_run check tdd-red-evidence` was not run. It parses TAP or Surefire XML, and jasmine prints neither. The plan is `type: execute` with per-task `tdd="true"` and one commit per task, so there are no `test(...)` RED commits.

## Decisions Made

See `key-decisions` in the frontmatter. In short: `extra` can never widen the range, the decoder rejects every non-object JSON, the model layer re-checks `key[0] === owner`, and the probe treats any use of the legacy fallback as a failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] `buildQuery` cannot be widened by `extra`**
- **Found during:** Task 1
- **Issue:** The research sketch merged `extra` last (`Object.assign({...bounds}, extra)`). A caller passing `startkey`, `endkey`, `limit` or `skip` in `extra` could then override the owner bound.
- **Fix:** `extra` is copied first. `skip` and `startkey_docid` are deleted, then the bounds, direction and limit are set. The spec passes a hostile `extra` and asserts the owner bounds survive.
- **Files modified:** lib/thinx/log_paging.js
- **Commit:** e80be24e

**2. [Rule 2 - Security] Owner-free, credential-free log lines on the touched paths**
- **Found during:** Tasks 1–2
- **Issue:** The old lines printed the owner id ("Log for owner … not found") and whole nano error objects, which can include the credentialed CouchDB URL.
- **Fix:** The touched lines now print fixed text and the status code only. That covers the router's audit and build branches, `list`, `listPage`, `purgeOwner` and destroy failures. `fetchBuildLogID` was not touched.
- **Files modified:** lib/router.logs.js, lib/thinx/buildlog.js, lib/thinx/audit.js
- **Commits:** e80be24e, e3f554c3

**3. [Rule 2 - Missing critical] `purgeOwner` validates its owner**
- **Found during:** Task 2
- **Issue:** A null or empty owner would have queried the range `[null]..[null,{}]`.
- **Fix:** A non-string or empty owner now gets `callback(null, 0)` without a query. The callback contract is unchanged.
- **Commit:** e3f554c3

**4. [Rule 2 - Test coverage] Local `Audit.fetchPage` spec**
- **Found during:** Task 1
- **Issue:** LogRouterPagingSpec stubs `audit.js`, so no local spec covered `fetchPage` itself.
- **Fix:** Added a describe block to LogPagingSpec. It checks the query, the item mapping, D-15 flags, the foreign-row filter, the invalid-owner case and the error pass-through.
- **Commit:** e80be24e

---

**Total deviations:** 4 auto-fixed (3 security/critical, 1 coverage).
**Impact on plan:** No contract changes. The view names, response shapes, error tokens and probe keys are exactly as specified.

## Issues Encountered

- **The probe spec hung on its first run.** `audit.js` and `buildlog.js` capture their db handle when the module loads, which happened in `beforeAll`, before `beforeEach` installed the fake dbs. The libraries therefore held `null`. `Audit.fetch` fell back, `_fetchLegacy` threw synchronously inside the promise chain, and the callback never fired. Fix: the stubbed couch now returns delegating handles. Lesson for later specs: a fresh-required lib module binds its db once.
- **The ZZ spec tier does not run in CI** (`docker-entrypoint.sh` → `split-tests` deletes `ZZ*.js` on node 0, and with `parallelism: 1` node 1 never runs). `ZZ-LogPagingCouchSpec.js` therefore **will not run on the 26-06 push**, and the 26-06 truth "`test` ran ZZ-LogPagingCouchSpec against real CouchDB" cannot hold as things stand. I tried a targeted `package.json` `split-tests` change that keeps only this spec on node 0. **The permission classifier denied it** and I did not route around it. The denied command was:
  `bash /Users/sychram/.claude/jobs/ae7f1697/tmp/pin.sh && python3 - <<'EOF' … replace "split-tests" with "if [ \"$CIRCLE_NODE_INDEX\" = \"0\" ]; then for f in ./spec/jasmine/ZZ*.js; do [ \"$f\" = ./spec/jasmine/ZZ-LogPagingCouchSpec.js ] || rm -f \"$f\"; done; fi; if [ \"$CIRCLE_NODE_INDEX\" = \"1\" ]; then ls ./spec/jasmine/*.js | grep -v 'ZZ' | xargs rm -f; fi" … EOF` (followed by a dry run of the new script in a `mktemp -d` scratch dir).
  This is recorded in `deferred-items.md` (26-02 item 1) and in `.planning/WINDOWS.md` (unrun-verify). Separately, `npm run test` is `jasmine || true`, so a failing spec never fails the `test` job. 26-06 must read the job log, not just the job status.
- No local CouchDB was running, so the CI spec's local proof is `node --check` only (PROBE-AND-CI-SPEC-PARSE), as the plan allows.

## Deferred Issues / Follow-ups

- `GET /api/v2/logs/build/:bid` (`fetchBuildLogID`) has **no owner check**. It is pre-existing and out of scope. It also logs the owner and the whole build log. Recorded in `deferred-items.md` (26-02 item 2) and in the windows ledger.
- The probe's `audit_total` vs `audit_expected` and `legacy_match` checks can race with a new audit write for the probed owner between the count and the first page. If 26-06 gets a single mismatch, re-run the probe once before treating it as real.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. No new endpoint was added: the paged branches live on the existing routes. The probe is read-only and aggregate-only.

## User Setup Required

None.

## Next Phase Readiness

- The Vue stores from plan 26-05 can rely on the shape `{success, response[], paging:{limit, has_more, next_cursor}}` with `?limit=100&cursor=…`.
- Plan 26-06 runs `node scripts/log-paging-probe.js` in production. It needs the CouchDB credentials in env, prints only `key=value` aggregates, and exits 0 on OK. Fix the CI ZZ-tier gap first (above) if 26-06's "test ran ZZ-LogPagingCouchSpec" truth is to hold.

## Self-Check: PASSED

- All 10 plan files are on disk.
- Commits e80be24e, e3f554c3 and 9a0ac3f5 are in git history, all signed `G`. The commit ledger counts 3 from `fbf48b73`.
- Markers printed: AUDIT-PAGING-GREEN (84/0, re-run for the tracer gate), BUILD-PAGING-GREEN (93/0), NO-PRUNE-ON-READ (prune_refs=0), PHASE26-BACKEND-LOCAL-GREEN (180/0), PROBE-AND-CI-SPEC-PARSE.
- Acceptance checks: the `buildQuery` skip/endkey check exited 0. `fetchPage` appears once in router.logs.js and `invalid_cursor` once, and `toBuildListItem` appears twice. LogPagingProbeSpec asserts the contract key order. ESLint is clean on all 10 files.
- `services/console` (the 26-05 submodule bump) was never staged.

---
*Phase: 26-vue-console-log-paging*
*Completed: 2026-10-01*
