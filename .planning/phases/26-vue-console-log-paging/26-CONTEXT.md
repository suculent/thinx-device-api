# Phase 26: Vue Console Log Paging - Context

**Gathered:** 2026-10-01
**Status:** Ready for planning

<domain>
## Phase Boundary

A Vue Console user can page through their whole audit log and build history. The Legacy console keeps its 200-item behaviour and response shape.

Delivered:
- A new CouchDB design doc, upserted rev-aware at boot (LOG-01). `_design/logs` stays untouched.
- An owner-keyed legacy audit call that returns the caller's own newest 200 entries with real `flags` (LOG-02).
- Opt-in cursor paging for the audit log (LOG-03) and the build list (LOG-04).
- The Vue History UI and dashboard using the paged API.
- The console submodule pointer bumped and deployed.

This discussion also moves build pruning out of the read path into a scheduled 365-day retention job, which covers CouchDB records **and** build artifact folders.

Requirements: LOG-01, LOG-02, LOG-03, LOG-04.

Locked contract (ROADMAP/REQUIREMENTS, not re-opened here):
- Opt-in `limit` / `cursor` query parameters.
- The response keeps `response` as an array and adds `paging: {limit, has_more, next_cursor}`.
- The cursor never carries the owner id. Replaying it as another owner never returns the first owner's entries.
- No `skip` paging and no `total_rows`.
- The no-parameter legacy call keeps its shape and the 200 cap.

</domain>

<decisions>
## Implementation Decisions

### History paging UX (Vue Console)
- **D-01:** History reaches older entries with a **"Load more" button** under each table, which appends the next page. No numbered pages, no infinite scroll. It follows `paging.has_more`; when `has_more` is false the button disappears.
- **D-02:** The Vue Console requests pages of **100**.
- **D-03:** The audit and build tables page **independently**: each has its own cursor, `has_more` and Load more button.
- **D-04:** The dashboard (`store/stats.js` → `auditlog/fetchAuditlog`, `buildlog/fetchBuildLog`) fetches **only the first page** through the paged API, so its widgets show the owner's own newest entries.

### Filters vs paging
- **D-05:** History's existing date-range and flag filters stay **client-side over the loaded entries**. While a table's `has_more` is true and a filter is active, the table shows a hint next to Load more, along the lines of "Filtering N loaded entries; older entries exist". No automatic page loading.
- **D-06:** No server-side date jump in this phase (no `before` parameter); see Deferred.

### Build retention (replaces prune-on-read)
- **D-07:** Reads become side-effect free. `buildlog.list()` (legacy) **stops pruning**, and the new paged build path never prunes (LOG-04). Pruning moves to a **scheduled daily retention job** on the swarm, following the existing CouchDB audit-log retention job (`couchdb-log-retention.sh` on `micro`, outside the 01:00–05:00 UTC compaction window). The legacy response shape is unchanged. — **Reversibility:** costly — re-adding prune-on-read means touching `buildlog.list()` and its callers again. Removing it is safe, because only the retention window changes what is kept.
- **D-08:** The build retention window is **365 days**, the same as the audit log. Today's window is 30 days.
- **D-09:** The retention job deletes expired build **records and their artifact folders on disk**. — **Reversibility:** one-way — deleted artifact folders are gone for good (there is no backup step; see D-10).
- **D-10:** The **first production run is a dry run** that reports only aggregates: the counts of records and folders it would delete, their total size, and the oldest and newest dates. It prints no owner ids or paths. The operator approves at a checkpoint, then the job runs for real and is scheduled daily.
- **D-11:** Deletion is **record-driven, plus an orphan sweep**:
  - When a build record expires (older than 365 days), its folder goes with it.
  - The job **also** deletes artifact folders older than 365 days that have no CouchDB record at all.
  - Both sets appear in the dry-run report. — **Reversibility:** one-way — same as D-09.

### Rollout & index warm-up
- **D-12:** The release is staged in this order:
  1. **Push 1:** the backend (design-doc upsert, owner-keyed legacy call, paged endpoints, prune removal). The legacy call stays compatible.
  2. **Warm the new view indexes** with one query each, outside 01:00–05:00 UTC, and record the build time.
  3. **Push 2:** the Vue UI plus the console submodule pointer bump, once the views answer quickly.
  4. The retention job is installed separately, gated by D-10.
- **D-13:** `_design/logs` stays **untouched**, including its now-unused views. Its `delete_expired` update handler is still used by the audit-log retention job. Removing the unused views is later cleanup.
- **D-14:** The production steps follow the Phase 25 pattern. The executor runs read-only and timed steps itself (index warm-up and timing, the dry run) and **stops at a checkpoint** for operator approval before the retention job's real run and before the Vue push. Use a single-service `docker service update` only, never `restart.sh` or a stack deploy. Push `thinx-staging` only.

### Claude's Discretion
- How the paged views are keyed: owner-first keys such as `[owner, date]`, with an opaque cursor that encodes the last key and doc id but no owner. The researcher and planner decide the exact design (including the `startkey_docid` tie-break), within the locked contract.
- The new design doc's name (for example `_design/paging`) and the mechanics of the rev-aware upsert, provided LOG-01 holds (created or updated at boot; `_design/logs` untouched).
- The exact hint wording (D-05) and the Load-more button styling, following the existing History.vue / bootstrap-vue patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` §"Phase 26: Vue Console Log Paging": goal, 5 success criteria, notes (order backend → Vue → pointer; warm outside 01:00–05:00 UTC), research questions.
- `.planning/REQUIREMENTS.md`: LOG-01..LOG-04 and the "out of scope" row on `skip` paging / `total_rows`.

### Backend code
- `lib/thinx/audit.js` `fetch()`: today it reads the global newest 200 from `logs/logs_by_owner` and filters by owner in memory. The view value has no `flags`, so every entry shows as `info`.
- `lib/thinx/buildlog.js` `list()`: the `latest_builds` view is keyed by owner but queried without a key. It filters in memory (BOLA fix) and prunes builds older than 30 days on read. `prune()`.
- `lib/thinx/database.js`: `injectDesign()` runs only when a database is **created**, so design changes never reach existing databases (the LOG-01 root cause).
- `design/design_logs.json`, `design/design_builds.json`: current views and update handlers.
- `lib/router.logs.js`: `/api/v2/logs/audit`, `/api/v2/logs/build`, legacy `/api/user/logs/audit` and `/api/user/logs/build/list`.

### Vue Console
- `services/console/vue/src/pages/History/History.vue`: both tables, the client-side date-range and flag filters, build-log expand/collapse.
- `services/console/vue/src/store/auditlog.js`, `store/buildlog.js`, `store/stats.js`: fetch actions and the dashboard consumer.
- `services/console/vue/cypress/integration/history.spec.js`, `dashboard.spec.js`, `cypress/support/api-stubs.js` (fixtures `audit-log.json`, `build-log.json`).

### Operations
- `.planning/runbooks/` audit-log retention job (`couchdb-log-retention.sh` on `micro`), and the memory note "CouchDB log retention job". This is the pattern for D-07..D-11.
- `AGENTS.md`: deployment flow, ssh access, the push-to-`thinx-staging`-only rule.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `design/*.json` plus `Database.injectDesign()`: the design-doc format. The upsert must become rev-aware: fetch the existing `_rev`, then insert.
- The `latest_builds` view already emits `doc.owner` as its key, and GDPR deletion uses `key: owner`. A paged build view needs a secondary sort key such as timestamp.
- History.vue already filters in the browser and has a stable expand key per build, so pages can be appended without reworking the table.

### Established Patterns
- `Util.responder(res, success, response)` response shape. Paging adds a sibling `paging` field next to `response`.
- Owner from `sanitka.owner(req.session.owner)`. Since Phase 25, Bearer requests set the owner for the request only (`lib/thinx/bearer_owner.js`).
- Production steps run through ssh to `micro` with single-service updates and operator checkpoints (Phase 25 annex).

### Integration Points
- Boot: `Database.init` is where the rev-aware design upsert hooks in.
- Vue `$api.$get('/logs/audit')` / `'/logs/build'` gain `?limit=100&cursor=…`.
- Cypress stubs match on `pathname`, so the paged requests need fixtures for `has_more` true and false.

</code_context>

<specifics>
## Specific Ideas

- The researcher must establish:
  - the `date` format across old `managed_logs` docs, because collation decides whether `[owner, date]` ordering is correct
  - how long the index build takes on the production data
  - the Vue store contract shared with `store/stats.js`
  - **where build artifact folders live and how a record maps to its folder**, for D-09/D-11
- The orphan sweep (D-11) must only ever touch the build-artifact root. It needs a path containment check, so it never follows symlinks out of that root. That is the same class of guard as Phase 23's sink hardening.

</specifics>

<deferred>
## Deferred Ideas

- **Server-side date jump** (`before` parameter) so History can open at a date range instead of paging to it. A new API capability, outside the LOG-03 contract.
- **Removing the unused `_design/logs` views** (`logs_by_owner`, `logs_by_date`) once nothing reads them. Keep `delete_expired`.

### Reviewed Todos (not folded)
- "Resolve legacy FIXMEs in owner.js and transfer.js": keyword match only, unrelated to log paging.
- "Answer a failed Bearer verification with 401, not 403": unrelated (auth status code).
- "Fix worker builder service polling completion detection": unrelated (worker).

</deferred>

---

*Phase: 26-vue-console-log-paging*
*Context gathered: 2026-10-01*
