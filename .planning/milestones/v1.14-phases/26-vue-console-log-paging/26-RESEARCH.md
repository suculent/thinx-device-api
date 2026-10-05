# Phase 26: Vue Console Log Paging - Research

**Researched:** 2026-10-01
**Domain:** CouchDB 3.5 view paging (nano 11) + Express 5 API + Vue 2/Vuex 3 console + swarm ops (retention cron, index warm-up)
**Confidence:** HIGH for code and production facts (read this session); MEDIUM for CouchDB semantics (official docs); LOW/ASSUMED for index build time and ken auto-build behaviour

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### History paging UX (Vue Console)
- **D-01:** History reaches older entries with a **"Load more" button** under each table, which appends the next page. No numbered pages, no infinite scroll. It follows `paging.has_more`; when `has_more` is false the button disappears.
- **D-02:** The Vue Console requests pages of **100**.
- **D-03:** The audit and build tables page **independently**: each has its own cursor, `has_more` and Load more button.
- **D-04:** The dashboard (`store/stats.js` → `auditlog/fetchAuditlog`, `buildlog/fetchBuildLog`) fetches **only the first page** through the paged API, so its widgets show the owner's own newest entries.

#### Filters vs paging
- **D-05:** History's existing date-range and flag filters stay **client-side over the loaded entries**. While a table's `has_more` is true and a filter is active, the table shows a hint next to Load more, along the lines of "Filtering N loaded entries; older entries exist". No automatic page loading.
- **D-06:** No server-side date jump in this phase (no `before` parameter); see Deferred.

#### Build retention (replaces prune-on-read)
- **D-07:** Reads become side-effect free. `buildlog.list()` (legacy) **stops pruning**, and the new paged build path never prunes (LOG-04). Pruning moves to a **scheduled daily retention job** on the swarm, following the existing CouchDB audit-log retention job (`couchdb-log-retention.sh` on `micro`, outside the 01:00–05:00 UTC compaction window). The legacy response shape is unchanged. — **Reversibility:** costly — re-adding prune-on-read means touching `buildlog.list()` and its callers again. Removing it is safe, because only the retention window changes what is kept.
- **D-08:** The build retention window is **365 days**, the same as the audit log. Today's window is 30 days.
- **D-09:** The retention job deletes expired build **records and their artifact folders on disk**. — **Reversibility:** one-way — deleted artifact folders are gone for good (there is no backup step; see D-10).
- **D-10:** The **first production run is a dry run** that reports only aggregates: the counts of records and folders it would delete, their total size, and the oldest and newest dates. It prints no owner ids or paths. The operator approves at a checkpoint, then the job runs for real and is scheduled daily.
- **D-11:** Deletion is **record-driven, plus an orphan sweep**:
  - When a build record expires (older than 365 days), its folder goes with it.
  - The job **also** deletes artifact folders older than 365 days that have no CouchDB record at all.
  - Both sets appear in the dry-run report. — **Reversibility:** one-way — same as D-09.

#### Rollout & index warm-up
- **D-12:** The release is staged in this order:
  1. **Push 1:** the backend (design-doc upsert, owner-keyed legacy call, paged endpoints, prune removal). The legacy call stays compatible.
  2. **Warm the new view indexes** with one query each, outside 01:00–05:00 UTC, and record the build time.
  3. **Push 2:** the Vue UI plus the console submodule pointer bump, once the views answer quickly.
  4. The retention job is installed separately, gated by D-10.
- **D-13:** `_design/logs` stays **untouched**, including its now-unused views. Its `delete_expired` update handler is still used by the audit-log retention job. Removing the unused views is later cleanup.
- **D-14:** The production steps follow the Phase 25 pattern. The executor runs read-only and timed steps itself (index warm-up and timing, the dry run) and **stops at a checkpoint** for operator approval before the retention job's real run and before the Vue push. Use a single-service `docker service update` only, never `restart.sh` or a stack deploy. Push `thinx-staging` only.

Locked contract (ROADMAP/REQUIREMENTS, not re-opened here):
- Opt-in `limit` / `cursor` query parameters.
- The response keeps `response` as an array and adds `paging: {limit, has_more, next_cursor}`.
- The cursor never carries the owner id. Replaying it as another owner never returns the first owner's entries.
- No `skip` paging and no `total_rows`.
- The no-parameter legacy call keeps its shape and the 200 cap.

### Claude's Discretion
- How the paged views are keyed: owner-first keys such as `[owner, date]`, with an opaque cursor that encodes the last key and doc id but no owner. The researcher and planner decide the exact design (including the `startkey_docid` tie-break), within the locked contract.
- The new design doc's name (for example `_design/paging`) and the mechanics of the rev-aware upsert, provided LOG-01 holds (created or updated at boot; `_design/logs` untouched).
- The exact hint wording (D-05) and the Load-more button styling, following the existing History.vue / bootstrap-vue patterns.

### Deferred Ideas (OUT OF SCOPE)
- **Server-side date jump** (`before` parameter) so History can open at a date range instead of paging to it. A new API capability, outside the LOG-03 contract.
- **Removing the unused `_design/logs` views** (`logs_by_owner`, `logs_by_date`) once nothing reads them. Keep `delete_expired`.

Reviewed Todos (not folded): "Resolve legacy FIXMEs in owner.js and transfer.js", "Answer a failed Bearer verification with 401, not 403", "Fix worker builder service polling completion detection" — all unrelated.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOG-01 | CouchDB design docs are upserted idempotently (rev-aware) at boot, so view changes reach production; new views live in a new design doc (`_design/logs` untouched) | §"Rev-aware design-doc upsert": GET → canonical compare → insert with `_rev` only when changed; hook points in `Database.init`; never exits the process. Production baseline: `_design/logs` is `rev 1-…`, map sha `925f3cee0cc4`, identical to the repo. |
| LOG-02 | Legacy no-param audit call keeps shape + 200 cap, returns the caller's own newest 200 entries with real `flags` | §"Audit view": `[owner, date]` view, `descending`, `startkey [owner,{}]`, `endkey [owner]`, `limit 200`. **Flags must be filtered to strings**: 195 production audit docs hold whole objects in `flags` (88 carry a password hash, 103 a reset key). |
| LOG-03 | Vue user can page audit beyond 200 (opt-in `limit`/`cursor`; `response` array + `paging`; cursor never carries owner) | §"Cursor design": opaque base64url `{v,k,i}`; server re-binds owner on every query; `limit+1` has_more. **Client fix required**: `Api.parseResult` drops `paging` today. |
| LOG-04 | Vue user can page the build list; paged path has no prune side effect; console pointer bumped and deployed | §"Build view": `[owner, start_time]` with nested-shape normalisation, `include_docs`. Production prune-on-read is already a no-op (`managed_builds` `doc_del_count: 0`). Retention job is a §"Build retention job" design. |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md / memory)

- Push **`thinx-staging` only** (never `main`). Deployment flow: push `services/console` to `thinx-staging`, bump the parent submodule pointer, push the parent to `thinx-staging`; CircleCI builds; Swarmpit rolls out. [VERIFIED: AGENTS.md "Deployment"]
- Local build check for the classic console: `npm run build:test` with the listed `LANDING_HOSTNAME`/`API_*`/`WEB_HOSTNAME` env. [VERIFIED: AGENTS.md "Local Verification"]
- `chai-http` stays at `^4.3.0` (v5 is ESM-only). New specs must use the CommonJS `require` style. [VERIFIED: AGENTS.md "Dependency Version Locks"]
- ssh to micro must use the literal form `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 …`. Never copy host, key or port into a committed file (the repo is public). [VERIFIED: memory micro-ssh-direct-form]
- `docker exec` is node-local, and service placement floats between `micro` and `core`, so always query placement first. On 2026-10-01 12:37Z `thinx_api`, `thinx_couchdb` and `thinx_worker` ran on micro and `thinx_console` on core. [VERIFIED: ssh `docker service ps`]
- For one service use `docker service update`. Never use `restart.sh` or a stack deploy (D-14, memory swarm-stack-deploy-and-couchdb-dhi).
- Avoid the 01:00–05:00 UTC window (D-12) and the ~06:25–07:10 UTC `cron.daily` / unattended-upgrade window. [VERIFIED: micro `/etc/crontab` `25 6 * * * … run-parts … /etc/cron.daily`; retention log runs 06:49–07:08]

## Summary

The backend design is small. Production data is also small and uniform: 4,945 live audit docs (all `date` values are ISO-8601 with ms and `Z`) and 125 build docs (all times are epoch-ms numbers). Collation risk is therefore low, provided the maps normalise defensively. One new design doc, `_design/paging`, goes into **each** database: `managed_logs` holds `audit_by_owner_date` and `managed_builds` holds `builds_by_owner_time` plus `builds_by_time` for retention. A rev-aware upsert installs it at boot. Every paged query is bounded by `startkey: [owner, {}]` / `endkey: [owner]` with `descending: true`, where `owner` always comes from the session. The cursor carries only the last key and doc id, so replaying it as another owner can only move a position inside that owner's own key range. `limit+1` gives `has_more`. The legacy audit call reuses the same view with `limit: 200` and no `paging` key.

Research turned up six facts that change the plan:

1. **The Vue API client drops `paging`.** `Api.parseResult` returns only the first non-`success` key, so it needs an additive fix.
2. **195 production audit docs carry whole user documents or repo maps in `flags`.** Writers: `owner.js:417` and `sources.js:361`. Returning "real flags" (LOG-02) unfiltered would put password hashes and reset keys in API responses. The view must emit string flags only, and the writers should stop passing objects.
3. **113 of 125 build docs are in the old nested shape** (identity under `log[0]`). They are invisible to the legacy list and to GDPR `purgeOwner`. The paged view must normalise them.
4. **The audit-log retention job that D-07 says to mirror has been silently broken since 2026-09-24.** The DHI CouchDB image has no `curl` or `wget`, so every run since then logs `nothing to delete (resp head: )`.
5. **The smoosh 01:00–05:00 compaction-window config is no longer present.** `_config/smoosh.*` returns `{}`, because `local.d` was not persisted across the 2026-09-23 image switch.
6. **Most of the reclaimable disk is in the repos workspace (`/mnt/gluster/thinx/repos`, 772M), not the deploy root (146M).** D-09 says "artifact folders", so whether repos is in scope needs an operator answer.

**Primary recommendation:** Build a pure, dependency-injected `lib/thinx/log_paging.js` (cursor, limit, query builder, page slicer) plus a never-throwing `ensureDesignDoc()`, and spec both helper-free. Filter flags in the map. Fix `parseResult`. Implement retention as a repo-tracked Node script, gated by `safepath.resolveInside` and strict id regexes, and run it in a one-shot container from the running API image digest, never inside the 256M-capped API container.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Owner-keyed ordering, range bounding | Database (CouchDB views) | — | B-tree range scans. No in-memory filtering, which is what the BOLA fix currently relies on. |
| Owner binding, cursor validation, limit clamp | API (`router.logs.js` + `log_paging.js`) | — | The owner comes only from `req.session.owner` (Bearer sets it per request). The client cursor is untrusted. |
| Flag sanitising | Database (map emits string flags only) | API (defence in depth) | The index never stores object payloads. |
| Design-doc install | API boot (`Database.init`) | — | LOG-01 requires the install at boot. |
| Paging state (cursor, has_more, append) | Browser (Vuex stores) | — | Per-table state (D-03). |
| Filters over loaded pages | Browser (History.vue computed) | — | D-05: client-side only. |
| Build retention (records + folders) | Ops (host cron → one-shot container) | Database (`builds_by_time` view) | Reads become side-effect free (D-07). The job runs off the request path. |
| Index warm-up / timing | Ops (executor via ssh) | — | D-12 step 2. |

## Standard Stack

No new packages. Everything below is already installed.

| Library | Version | Purpose | Evidence |
|---------|---------|---------|----------|
| nano | 11.0.7 (`^11.0.7`) | CouchDB client; callback shim in `lib/thinx/couch.js` | [VERIFIED: package.json:62, node_modules/nano/package.json] |
| CouchDB | 3.5.2 (`dhi.io/couchdb:3`) | Views, collation | [VERIFIED: prod `GET /` → `"version":"3.5.2"`] |
| express | 5.2.1 | Router; `query parser` = `simple` | [VERIFIED: local `app.get('query parser')` → `simple`] |
| vue / vuex / bootstrap-vue | ^2.6.14 / ^3.6.2 / 2.21.2 | Console UI | [VERIFIED: services/console/vue/package.json:33,47,58] |
| cypress | 9.7.0 | Vue e2e (stubbed) | [VERIFIED: `npx cypress --version`] |
| jasmine | ^5.12.0 | API specs (helper-free runner) | [VERIFIED: package.json:154; local run "47 specs, 0 failures"] |
| Node (API image) | v26.10.0 | `Buffer` `base64url` available | [VERIFIED: `docker exec thinx_api node --version`] |

**Installation:** none.

## Package Legitimacy Audit

This phase installs no external packages. `package-legitimacy check` is not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Production Findings (read-only, 2026-10-01 12:37–13:20 UTC)

All figures are aggregates. No owner ids, emails or paths were recorded here. DB names have **no prefix** in production: `_all_dbs` shows bare `managed_builds`, `managed_devices`, `managed_logs`, `managed_users`, and `/mnt/gluster/thinx/conf/.thx_prefix` is 1 byte (a newline). [VERIFIED: ssh probe]

### managed_logs (audit)
| Metric | Value |
|---|---|
| doc_count / doc_del_count | **4,947** (2 design docs) / **657,259** tombstones |
| update_seq | 1,319,899 |
| sizes file / active / external | 129.6 MB / 128.1 MB / 2.96 MB |
| design docs | `_design/logs` (rev gen 1; views `logs_by_date`, `logs_by_owner`; updates `delete_expired`, `log`, `state`), `_design/repl_filters` |
| `_design/logs` index | file 2.7 MB, active 1.9 MB, `updater_running: false` |
| `logs_by_owner` map sha256[0:12] | `925f3cee0cc4` (same as `design/design_logs.json`) |
| `date` type | **4,945 / 4,945 are ISO-8601 `YYYY-MM-DDTHH:MM:SS.sssZ` strings**. None missing, no numbers. |
| date range | 2025-09-23 … 2026-10-01 (30 docs in 2025-09 are past 365 d, because the retention job is broken) |
| `owner` | 2,631 hex64; 1,814 other strings (1,489 are one 5-char test owner); **499 missing** (all "Password missing"/"Password mismatch." login failures, 2026-02-12 … 2026-10-01); 1 empty |
| `flags` | All arrays. String values: `info` 2,852, `warning` 1,884, `error` 8, `admin` 6, `impersonation` 6, `start` 1. **195 docs contain object elements** ("Profile updated successfully." 164, "Atomic tag updated successfully." 31). Of those: 74 password+reset_key+email+repos, 14 password+email+repos, 29 reset_key+email+repos, 47 email+repos, 31 repos only. Every embedded owner equals the doc owner. Written continuously 2025-10-01 … 2026-10-01. |
| doc ids | 4,945 / 4,945 are 32-hex UUIDs (POST-generated) |
| duplicate `(owner, date)` pairs | **3**, so the `startkey_docid` tie-break is needed |
| owners | 267 distinct. Top counts 1,489 (test owner) and **1,484 (a real hex64 owner, so a >200-entry account exists for the LOG-03 check)** |
| view `total_rows` | `logs_by_owner` 4,445 (= docs with a truthy owner); `logs_by_date` 4,945 |

### managed_builds
| Metric | Value |
|---|---|
| doc_count / doc_del_count | **127** (2 ddocs) / **0**. Prune-on-read has never deleted anything. |
| sizes | file 107 KB; `_design/builds` index 172 KB |
| shape | **12 flat** (root `owner/udid/build_id/start_time/timestamp/last_update/state/log`), **113 nested** (root only `_id,_rev,log[,state]`; identity in `log[0]`) |
| nested `log[0]` | 113/113: `owner` hex64, `udid` UUID, `build_id` UUID, `start_time`/`timestamp`/`last_update` epoch-ms numbers. `_id == log[0].build_id` for all 113. |
| times | All numbers (epoch ms). Flat: 2026-09-18 … 2026-09-29. Nested: 2023-02 (7), 2023-03 (1), 2023-11 (91), 2024-04 (3), 2024-10 (1), 2026-05 (2), 2026-09 (8) |
| > 365 days old | **103** (all nested) |
| owners | 4 distinct; one owner has 113 |
| max doc size | 594 bytes (avg 587) |

### Disk (gluster, `/mnt/gluster` → `./glusterfs` symlink on the host)
Production config roots: `{"data_root":"/mnt/data","deploy_root":"/deploy","build_root":"/repos"}` [VERIFIED: `/mnt/gluster/thinx/conf/config.json`]. Bind mounts: `/mnt/gluster/thinx/deploy:/mnt/data/deploy`, `/mnt/gluster/thinx/repos:/mnt/data/repos` [VERIFIED: docker-swarm.yml:303,305]. Volume: 49G, 66% used.

| | deploy root (artifacts) | repos root (build workspaces) |
|---|---|---|
| total | 146M | 772M |
| depth 1 | 227 dirs, all hex64 owners | 9 hex64 owners + inert `clean.sh` ("Clean script disabled…", 2021) |
| depth 2 | 7 UUID udid dirs + **6 `avatar.json` files (owner level)** | 20 UUID udid dirs |
| depth 3 | 18 UUID build dirs + **5 repo-name dirs** (len 12/15/26) + udid-level files: `<uuid>.zip` 5, `firmware.bin` 2, `build.json` 2, `basename.json` 2 | 186 UUID build dirs |
| symlinks (depth ≤ 3; full walk) | 0 | 0 |
| records with folder | 18 / 125 | 125 / 125 |
| expired records with folder | 4 (44K) | 103 (29M) |
| orphan build dirs (no record) | 0 | **61 (227M), all mtime 2021-07 … 2022-05** |
| note | | full-depth `find` on gluster took > 5 min; depth-3 listing is fast |

Directory mtime is not a reliable age: 14/20 sampled deploy build dirs (6/20 in repos) have a child newer than the directory itself.

### Ops state
- **Audit retention job is broken.** `/usr/local/sbin/couchdb-log-retention.sh` calls `curl` via `docker exec <thinx_couchdb>`, but the DHI image has no `curl`/`wget` (`command -v` empty; docker-swarm.yml:122 "No curl in the hardened image"). Each run since **2026-09-24** logs `nothing to delete (resp head: )`. The last real deletion was 2026-09-23. [VERIFIED: `/var/log/couchdb-log-retention.log`]
- Schedule: `/etc/cron.daily/couchdb-log-retention` (exec wrapper) via `/etc/crontab` `25 6 * * *`; flock `/var/lock/couchdb-log-retention.lock`; log `/var/log/couchdb-log-retention.log`. No logrotate entry and no systemd timer. Creds stay in the container env; the host uses `jq`. [VERIFIED: ssh]
- **smoosh window config absent.** `_node/_local/_config/smoosh` → `{"state_dir":"./data"}`; `smoosh.ratio_dbs`, `slack_dbs`, `ratio_views` and `slack_views` are all `{}`. `/opt/couchdb/etc/local.d/` holds only `README` and `docker.ini`, because it isn't bind-mounted, so the 2026-05 window settings did not survive the 2026-09-23 image switch. `ken` config `{}` (defaults). The memory note "CouchDB log retention job" is stale on this point. [VERIFIED: ssh GETs]
- In-app compaction: `Database.init` schedules `compactDatabases` **every hour** for all four DBs, regardless of window. [VERIFIED: lib/thinx/database.js:107-109]
- Resource caps: `thinx_couchdb` limits `cpus: '0.2'`, `memory: 256M` (docker-swarm.yml:165-166); `thinx_api` limits `cpus: '1.0'`, `memory: 256M` (docker-swarm.yml:320-321), 1 replica, no placement constraint. `thinx_worker` is pinned to `node.hostname == micro`. `thinx_internal` is `attachable=true`, overlay, swarm scope. Host tools on micro: `jq`, `python3` 3.12.3, `node`, `flock`. [VERIFIED: ssh]
- `_active_tasks` was `[]` at probe time.

## Architecture Patterns

### System Architecture Diagram

```
Vue History / Dashboard / Header / Notifications / DeviceDetail
   │  $api.$get('/logs/audit?limit=100[&cursor=c]')      (store/auditlog.js)
   │  $api.$get('/logs/build?limit=100[&cursor=c]')      (store/buildlog.js)
   ▼
Api.request → parseResult  ──(must keep `paging`)──►  {success, response[], paging}
   │
   ▼  HTTPS (Traefik) → thinx_api (1 replica)
router.logs.js  getAuditLog / getBuildLogs
   │ owner = sanitka.owner(req.session.owner)        ◄── Bearer bridge sets it per request
   │ paged? (has `limit` or `cursor`)
   │    ├─ no  → legacy: audit view limit 200 → {success, response}         (classic console)
   │    │        builds: latest_builds {key: owner}, 30-day display filter, NO prune
   │    └─ yes → log_paging.parseLimit / decodeCursor(kind) ──invalid──► 400 invalid_cursor|invalid_limit
   │             buildQuery(owner, L, cursor): startkey [owner, k|{}], endkey [owner],
   │                                           descending, limit L+1, startkey_docid
   ▼
CouchDB managed_logs/_design/paging/_view/audit_by_owner_date
CouchDB managed_builds/_design/paging/_view/builds_by_owner_time (include_docs)
   │ rows (≤ L+1, all with key[0] === owner)
   ▼
pageFromRows → items[0..L), has_more = rows.length > L, next_cursor = enc(rows[L].key[1], rows[L].id)
   ▼
Util.respond(res, {success:true, response:items, paging:{limit:L, has_more, next_cursor}})

Boot: thinx-core → Database.init → (per DB, after create/412) ensureDesignDoc(_design/paging)
        GET → equal? no-op : insert(+_rev) ; 404 → insert ; 409 → re-GET compare ; error → log, continue
        (ken may start indexing right after the write — ASSUMED)

Ops (micro cron.daily, flock) → docker run --rm --network thinx_internal <api image@digest>
        node scripts/build-retention.js [--dry-run]
        ├─ builds_by_time endkey=cutoff → expired records → safepath gate → rm folder(s) → _bulk_docs _deleted
        └─ orphan sweep: readdir depth 1..3 → UUID-shaped build dirs w/o record, age > 365 d → safepath gate → rm
        → aggregates only (counts, bytes, oldest/newest)
```

### Recommended Project Structure
```
design/paging_logs.json        # _design/paging for managed_logs (NOT design_logs.json; injectDesign keys off that name)
design/paging_builds.json      # _design/paging for managed_builds
lib/thinx/log_paging.js        # pure: parseLimit, encodeCursor, decodeCursor, buildQuery, pageFromRows
lib/thinx/design_upsert.js     # pure-ish: canonical(), ensureDesignDoc(db, doc, {timeoutMs}) — never throws
lib/thinx/build_retention.js   # deps-injected core (OwnerPurge pattern): plan(), apply(); path gate via safepath
scripts/build-retention.js     # CLI: --dry-run (default) | --apply ; aggregates only
spec/jasmine/LogPagingSpec.js            # local
spec/jasmine/DesignUpsertSpec.js         # local
spec/jasmine/PagingMapSpec.js            # local (evals the map strings with a fake emit)
spec/jasmine/LogRouterPagingSpec.js      # local (require.cache stubs for audit/buildlog)
spec/jasmine/BuildRetentionSpec.js       # local (tmp dirs, symlink cases)
spec/jasmine/ZZ-LogPagingCouchSpec.js    # CI (real CouchDB: upsert over older rev, collation, cross-owner replay)
services/console/vue/tests/unit/log-paging-store.cjs   # plain node (footer-hostnames pattern)
services/console/vue/cypress/fixtures/api/{audit,build}-log-page{1,2}.json
```

### Pattern 1: Owner-bounded descending range with docid tie-break
**What:** Key `[owner, sortKey]`. Pages run newest-first. The +1 row becomes the next start, inclusive.
**Why it is BOLA-safe:** CouchDB returns only keys between `startkey` and `endkey`. Both are built server-side with `owner` as element 0, so a cursor only supplies element 1 and a doc id. With `descending=true`, CouchDB applies direction before the range filter, which is why `startkey` gets the high bound (`{}`) and `endkey` the low bound (`[owner]`). [CITED: docs.couchdb.org/en/stable/api/ddoc/views.html "swap startkey and endkey"; ddocs/views/collation.html `{}` high sentinel, `[owner]` sorts before `[owner, x]`]
**Tie-break:** Rows with equal keys are sorted by docid, and `startkey_docid` works only together with `startkey`. [CITED: docs.couchdb.org/en/stable/ddocs/views/pagination.html] Production has 3 duplicate `(owner,date)` pairs. [VERIFIED: probe]
**nano encoding:** nano JSON-encodes `startkey`, `endkey`, `key`, `keys`, `start_key` and `end_key`, but passes `startkey_docid` raw. [VERIFIED: node_modules/nano/lib/nano.js:341-345 `['startkey', 'endkey', 'key', 'keys', 'start_key', 'end_key'].forEach(function (key) { if (key in qs) { qs[key] = JSON.stringify(qs[key]) } })`]

### Pattern 2: Rev-aware design-doc upsert (LOG-01)
- `Database.init` today: `existing_dbs.includes(name)` compares `"logs"` against `"managed_logs"` and never matches. Every boot therefore calls `nano.db.create(prefix+"managed_"+name)`. On an existing DB that rejects with "the file already exists", `handleDatabaseErrors` swallows it, and `injectDesign` never runs. [VERIFIED: lib/thinx/database.js:79-97, 198-201]
- `injectDesign` inserts without `_rev` (database.js:175-185), so a second insert would 409 and be logged as "conflict" by `logCouchError`, which suppresses conflict lines (database.js:157).
- **Hook:** in `init`, call `this.ensureDesignDocs(name)` (fire-and-forget, `.catch` everything) both in the `.then` after create and in the `.catch` when the error is the 412/"already exists" case, *before* `handleDatabaseErrors`. Only `logs` and `builds` get `_design/paging`. Do **not** route this through `handleDatabaseErrors`, which calls `process.exit(1|2)` on unknown errors (database.js:202-211).
- **Path:** resolve the JSON with `path.join(__dirname, "../../design/paging_logs.json")`, not `Filez.appRoot()` (hard-coded `/opt/thinx/thinx-device-api`, files.js:9). Specs can then load it locally. The Dockerfile `COPY . .` (Dockerfile:130) ships `design/`.
- **Idempotency:** a canonical deep compare (sorted keys, `_rev` ignored) means a restart with unchanged files does no write and no re-index. A view rebuild happens only when the file changes. Writing a ddoc rebuilds every view in it. [CITED: docs.couchdb.org/en/stable/ddocs/views/intro.html "will invalidate those other views' indexes when the design document is written"]
- **Failure handling:** wrap each call in a 5 s timeout like `audit-ttl-probe.js:71-81`, return `{ok, action, reason}`, never throw, log one line. A paged request against a missing view gets a nano 404 (`not_found` / `missing_named_view`) and answers `log_fetch_failed` / `build_list_failed`.

### Pattern 3: Response shape without breaking the legacy console
- `Util.responder(res, success, message)` emits exactly `{success, response}` (util.js:19-55). The paged response needs a sibling key, so use `Util.respond(res, obj)` (util.js:89-99) with literal key order `{success, response, paging}`.
- The legacy no-param path keeps `Util.responder(res, true, items)`: same bytes shape, no `paging` key.
- Express 5 `simple` parser: `?cursor=a&cursor=b` → `["a","b"]` [VERIFIED: local `querystring.parse`]. Reject non-string `cursor`/`limit`.

### Anti-Patterns to Avoid
- **Emitting the whole doc in the audit view** (`logs_by_date` does): copies object flags (password hashes) into the index and makes indexing slower. [CITED: ddocs/views/intro.html "Views with emit(key, doc) take longer to update…"]
- **`include_docs=true` on the audit view:** it returns raw `flags`, `redacted_*` and `expire_at`. Use a small projected value.
- **Taking `owner` from the cursor or the query** (PITFALLS row "Owner taken from the paging cursor").
- **Paging `logs_by_owner`** (key `[date, owner]`): date-first, so pages hold other tenants' rows.
- **Editing `_design/logs`** (REQUIREMENTS Out of Scope): it forces a full re-index of the view the retention cron relies on.
- **Running retention via `docker exec thinx_api node …`:** the job shares the API's 256M memory cgroup and depends on API placement.
- **Deleting by `path.join` + `startsWith`:** a symlinked owner/udid component redirects `rm`. Use realpath containment (`safepath.resolveInside`) plus `lstat` that refuses symlinks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path containment for deletion | new `startsWith` check | `safepath.resolveInside(root, rel)` (lib/thinx/safepath.js:141-151) | Realpaths root + target (or parent), refuses symlink final components, separates prefix siblings (Phase 23) |
| Owner / UUID validation | ad-hoc regex | `Sanitka.strictOwner` (`/^[a-z0-9]{64}$/`, sanitka.js:154-156), `Sanitka.udid` (36-char, sanitka.js:97-108) | Validated, never stripped |
| Callback/promise CouchDB | raw fetch | `require("./couch")(uri).use(db)` (couch.js) | Already normalises nano 11 bodies and callbacks |
| Paging | `skip` / `total_rows` | `startkey`+`startkey_docid`+`limit+1` | Locked out of scope; [CITED: pagination.html] |
| Spec CouchDB fakes | a mocking library | fake-client objects as in `ZZ-CouchCallbackShimSpec.js`; `require.cache` overrides | Helper-free, no new deps |
| Deps-injected destructive job | global-state script | `OwnerPurge` constructor `deps` pattern (owner_purge.js:37-80) | Proven spec pattern for a destructive orchestrator |

## Detailed Designs

### Audit view (LOG-02 / LOG-03)

`design/paging_logs.json`:
```json
{
  "_id": "_design/paging",
  "language": "javascript",
  "views": {
    "audit_by_owner_date": {
      "map": "function (doc) { if (typeof doc.owner !== 'string' || doc.owner.length === 0) return; var d = doc.date; if (typeof d === 'number' && isFinite(d)) { d = new Date(d).toISOString(); } if (typeof d !== 'string' || d.length === 0) return; var src = Array.isArray(doc.flags) ? doc.flags : [doc.flags]; var flags = []; for (var i = 0; i < src.length; i++) { if (typeof src[i] === 'string' && src[i].length > 0 && src[i].length <= 32) flags.push(src[i]); } if (flags.length === 0) flags.push('info'); emit([doc.owner, d], { date: d, message: (typeof doc.message === 'string') ? doc.message : String(doc.message), flags: flags }); }"
    }
  }
}
```
- ES5 only, so it runs on whichever JS engine CouchDB uses. [ASSUMED]
- ISO-ms-Z strings are fixed-width with punctuation in identical positions. Under ICU/UCA (punctuation < digits < letters) they therefore order chronologically. [CITED: collation.html ASCII sequence] Production is 100% ISO-ms-Z. [VERIFIED]
- Docs without an owner (499 login failures) or with an empty owner are not emitted. That matches today's behaviour: `logs_by_owner` emits only `if(doc.owner)`.
- Legacy query: `{startkey:[owner,{}], endkey:[owner], descending:true, limit:200}` → `rows.map(r => r.value)`. This replaces `fetch()`'s global `limit:200` + `indexOf(owner)` filter (audit.js:69-80). Shape: `{date, message, flags}`, same as today. The classic console mutates `flags` with `.push(...)` (console `src/app/js/thinx-api.js:636,639`), so `flags` must always be an array, which the map guarantees.
- **Fix the writers too**: `owner.js:417` `alog.log(owner, "Profile updated successfully.", abody)` and `sources.js:361` `alog.log(owner, "Atomic tag updated successfully.", changes)` pass objects as `flag`. `_buildRecord` wraps them: `"flags": Array.isArray(flag) ? flag : [flag]` (audit.js:48). Recommend making `_buildRecord` coerce non-string flag elements away, falling back to `["info"]`, and passing `"info"` at both call sites. That leaves the existing 195 docs to the Open Question below.

### Build view (LOG-04)

`design/paging_builds.json`:
```json
{
  "_id": "_design/paging",
  "language": "javascript",
  "views": {
    "builds_by_owner_time": {
      "map": "function (doc) { var r = doc; if (typeof doc.owner !== 'string' && Array.isArray(doc.log) && doc.log.length > 0 && doc.log[0] && typeof doc.log[0].owner === 'string') { r = doc.log[0]; } if (typeof r.owner !== 'string' || r.owner.length === 0) return; var t = (typeof r.start_time === 'number') ? r.start_time : ((typeof r.timestamp === 'number') ? r.timestamp : 0); emit([r.owner, t], null); }"
    },
    "builds_by_time": {
      "map": "function (doc) { var r = doc; if (typeof doc.owner !== 'string' && Array.isArray(doc.log) && doc.log.length > 0 && doc.log[0] && typeof doc.log[0].owner === 'string') { r = doc.log[0]; } if (typeof r.owner !== 'string') return; var t = (typeof r.start_time === 'number') ? r.start_time : ((typeof r.timestamp === 'number') ? r.timestamp : null); if (t === null) return; emit(t, { owner: r.owner, udid: (typeof r.udid === 'string') ? r.udid : null, build_id: (typeof r.build_id === 'string') ? r.build_id : doc._id, rev: doc._rev }); }"
    }
  }
}
```
- Paged query: `{startkey:[owner,{}], endkey:[owner], descending:true, limit:L+1, include_docs:true}` plus `startkey_docid` when a cursor is present. Build docs are ≤ 594 bytes, so `include_docs` keeps the index tiny and returns the stored doc exactly.
- **Item shape = legacy shape.** Extract the per-row transform from `getBuildLogs` (router.logs.js:94-123: docs with a `log` → `log` reduced to the single latest line; without → `{date, udid}`) into `toBuildListItem(doc)` and use it in both paths. Vue `normalizeBuildItems` already handles both flat and nested shapes (store/buildlog.js:58-81; the Cypress fixture `build-log.json` is nested).
- The paged build list includes the 10 recent nested docs, which the legacy list hides today. Paged results are sorted by time; legacy results come out in docid order, which is effectively random. Visits.vue `slice(0,10)` gains real "recent" semantics.
- **Legacy `list()`**: switch to `view("builds","latest_builds",{key: owner})` (existing built view, emits `doc.owner`; `purgeOwner` already uses `{key: owner}`, buildlog.js:374) and keep the 30-day *display* filter. Drop `this.prune(doc)`. This keeps exactly today's visible set, which is the owner's flat-shape builds from the last 30 days. Nested docs have no root `udid`/`build_id`, so if they appeared, the classic `updateBuildHistory` would group them under `undefined` (console thinx-api.js:714-725).
- **The current prune is already a no-op:** `list()` calls `this.prune(doc)` with `doc = documents[index].value` (the full doc), and `prune` returns early unless `document.value.rev` exists (buildlog.js:308-311). Production `doc_del_count: 0` confirms it. Removing it changes no data, so D-07's reversibility note is even cheaper than stated.

### Cursor design (LOG-03)
- Format: `base64url(JSON.stringify({v:1, k:<key[1]>, i:<docid>}))`. Opaque, not secret: the server enforces the owner bound, so an HMAC adds nothing. Keep it unsigned.
- Decode rules: string; length ≤ 512; base64url charset; JSON object with `v===1`; `i` a string of 1–128 chars without control characters; `k` a **string ≤ 64** for audit or a **finite number** for builds. Anything else → `400 {success:false, response:"invalid_cursor"}`.
- `limit`: absent with a cursor present → 100. Must match `^\d+$`, else `400 invalid_limit`. Clamp to [1, 200].
- `next_cursor`: `null` when `has_more` is false.
- Owner-free by construction: audit doc ids are random 32-hex and build ids are UUIDs, so neither is an owner. A spec should still assert `decode(cursor)` has no `owner` key and that the decoded JSON contains no 64-hex substring.

### Build retention job (D-07..D-11)
- **Record → folder mapping** (verified against code and production):
  - artifacts: `<data_root><deploy_root>/<owner>/<udid>/<build_id>/` (`Filez.deployPathForDevice` files.js:12-18; worker `DEPLOYMENT_PATH=$OWNER_ID_HOME/$UDID/$BUILD_ID` services/worker/builder:250-257); contains `build.log`, `<build_id>.zip`, `build.json`, `.write`.
  - workspace: `<data_root><build_root>/<owner>/<udid>/<build_id>/` (`Builder.buildPathFor` builder.js:204-212; worker builder:357).
  - In-container roots: `/mnt/data/deploy`, `/mnt/data/repos`. Host: `/mnt/gluster/thinx/{deploy,repos}` (realpath `/mnt/glusterfs/thinx/...`).
  - Record identity: flat → root `owner/udid/build_id`; nested → `log[0].owner/udid/build_id`. Age = `start_time` (fall back to `timestamp`), epoch ms.
- **Never touch** udid-level files (`build.json` envelope, the `<build_id>.zip` copy that the worker places in `TARGET_PATH` — builder:1404-1407, `firmware.bin`, `basename.json`), owner-level `avatar.json`, non-UUID depth-3 dirs (repo-name dirs), or anything at depth ≠ 3. OTA reads the udid-level `build.json` and `*.zip` (deployment.js:291-317, `findFilesSync(dpath, ext, false)` non-recursive), so deleting old `<build_id>` dirs does not break the latest firmware. Downloading an expired build via `deployment.artifact()` (deployment.js:320-331) will 404, which is expected.
- **Orphan definition:** a directory exactly 3 levels below the root whose segments match owner `^[a-z0-9]{64}$` / udid UUID / build UUID, that is a real directory (lstat, not a symlink), that has no CouchDB record with that `owner/udid/build_id`, and where **max(mtime of the dir, mtime of its direct children)** < now − 365 d. Directory mtime alone understates activity (see the measurements above). Load the full record set first and abort the sweep if the record read fails or returns 0 rows, so a CouchDB outage never turns everything into an orphan.
- **Gate per deletion:** strict segment regexes → `safepath.resolveInside(root, owner/udid/build)` must return `ok:true` with a directory `stat` → `fs.rm(real, {recursive:true, force:false})`. Node `fs.rm` recursive removes symlinks themselves rather than following them. [ASSUMED]
- **Order:** delete the folder(s) first, then `_bulk_docs` `_deleted` for the record, so a crash leaves an orphan record (retried next day), never an untracked folder. The `delete_expired` update handler is not needed.
- **Dry run output (D-10):** counts (expired records, record folders deploy/repos, orphan folders deploy/repos), total bytes, oldest/newest record date, and oldest/newest orphan mtime. No ids or paths. Spec: the output contains no 64-hex string.
- **Expected first run** (today's data): 103 expired records; deploy: 4 record folders (44K), 0 orphans; repos: 103 record folders (29M) + 61 orphans (227M), *if repos is in scope* (Open Question 1).
- **Runner:** see Code Examples. A one-shot container from the **running service's image digest** (`docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'`) on `thinx_internal` (attachable), with the deploy/repos/conf mounts and creds passed as `-e NAME` from `/mnt/gluster/thinx/.env` (holds `COUCHDB_USER`, `COUCHDB_PASS`, `COUCHDB_PASSWORD`), so values never appear in argv. It doesn't depend on API or CouchDB placement, because gluster is mounted on both nodes. Install on micro like the audit job: `/usr/local/sbin/thinx-build-retention.sh` (flock `/var/lock/thinx-build-retention.lock`, log `/var/log/thinx-build-retention.log`) plus a `/etc/cron.daily/thinx-build-retention` wrapper. That runs at ~06:25 UTC, outside 01:00–05:00.

### Vue store contract (D-01..D-05)
- Consumers of `buildlog/fetchBuildLog`: Header.vue:148 (every layout mount), Notifications.vue:74, DeviceDetail.vue:235 (filters `udid` client-side), Visits.vue (via `stats/fetchDashboard`, stats.js:31-37), History.vue:202. Consumers of `auditlog/fetchAuditlog`: stats.js:34, History.vue:201. [VERIFIED: grep]
- Recommendation: `fetchAuditlog` / `fetchBuildLog` become "first page, limit=100, **replace** items + paging, bump `generation`". All existing consumers, including the dashboard (D-04), get the owner's newest 100. New actions `fetchMoreAuditlog` / `fetchMoreBuildLog` **append**, and only if `generation` is unchanged since the request started. A Header/Notifications refresh mid-session then can't splice a stale page onto a reset list.
- State per store: `items`, `paging: {has_more:false, next_cursor:null}`, `loadingMore:false`, `generation:0`. Getter `getPaging`. Keep `getItems`, `getHeaders` and the action return value (`state.items`) unchanged.
- History.vue copies store items into local `data` once (`loadData`, History.vue:266-273). Switch `auditlog`/`buildlog` to **computed** reads of the store getters so appended pages show up. Note: `mapGetters` sits under `methods` today (History.vue:196-199), and the getters are called as functions.
- **Load more must render outside the `v-if/v-else`** (History.vue:27-28, 62-63). Otherwise a filter that matches nothing hides the button and the user can never reach older entries.
- Hint (D-05): show when `paging.has_more && filterActive`, where audit `filterActive = dateFrom || dateTo || auditSearch || auditFlagFilter.length !== 3` and builds `filterActive = dateFrom || dateTo || buildSearch`. Wording: "Filtering {{n}} loaded entries; older entries exist." Text search is included because it is also a client-side filter; this is a discretion call.
- DeviceDetail regression: per-device build history now comes from the owner's newest 100 builds instead of "all flat builds of the last 30 days". Today's largest owner has 113 builds in total, and only 12 are flat, so there is no practical loss now. See Open Question 4.
- **Client prerequisite:** `Api.parseResult` (services/console/vue/src/core/api.js:70-78):
  ```js
  let keys = Object.keys(result).filter( key => key !== 'success' );
  return {
    'success': result.success,
    'response': result[keys[0]]
  };
  ```
  This drops `paging`. Add it back without changing anything else.

## Common Pitfalls

### Pitfall 1: `paging` silently dropped by the Vue API client
**What goes wrong:** The server sends `paging`, the store sees `undefined`, `has_more` is always false, and Load more never appears. Cypress fixtures that only stub `response` would hide it.
**How to avoid:** Additive `parseResult` change, a unit test in `tests/unit/`, and a Cypress fixture with `paging.has_more: true`.

### Pitfall 2: Real flags leak secrets (LOG-02)
**What goes wrong:** 195 docs have user documents (password hash, reset key, email) or repo maps in `flags`. Returning them makes the console render `[object Object]` badges and exposes credential material in API responses.
**How to avoid:** String-only flags in the map, a defensive filter in the API mapper, writer fixes. Spec: map fed a doc with an object flag emits `flags: ["info"]`.

### Pitfall 3: First query of a new view blocks until it is built
**What goes wrong:** Push 1 switches the legacy audit call to the new view. Until the index exists, `update=true` (the default) waits. [CITED: views.html "the index is updated before the view query is executed"] `managed_logs` has 662k by-seq entries (4,945 live + 657k tombstones) and CouchDB is capped at 0.2 CPU.
**How to avoid:** Deploy Push 1 outside 01:00–05:00 and outside 06:25–07:10 UTC. Run the warm-up probe immediately after the new task is up. Optionally have the legacy audit path fall back to the old `logs_by_owner` behaviour on `not_found`/timeout (Open Question 3). Warning signs: classic dashboard "log_fetch_failed", or `_active_tasks` showing an `indexer` on `_design/paging`.

### Pitfall 4: ken starts indexing at boot, not at the warm-up query
**What goes wrong:** CouchDB 3 auto-indexes design docs in the background (ken; ddoc `autoupdate` defaults to true). [CITED: docs.couchdb.org/en/stable/config/indexbuilds.html] So the build likely begins as soon as the upsert writes the ddoc. [ASSUMED: trigger-on-ddoc-write is not stated explicitly in the docs] The "warm-up" step then measures an index already in progress.
**How to avoid:** Treat Push 1 itself as the start of indexing (timing window). Record the time from the boot log line "design doc _design/paging created" to `_active_tasks` showing no indexer.

### Pitfall 5: Cursor or limit arrays from repeated params
Express 5 `simple` parser yields arrays for repeated keys. [VERIFIED] Use a `typeof === "string"` guard, or 400.

### Pitfall 6: Retention treats a CouchDB failure as "everything is an orphan"
If the record query fails or returns empty, the orphan sweep would delete every old folder. Abort the sweep unless the record read succeeded with ≥ 1 row, and report it.

### Pitfall 7: Deleting through a symlinked component
`/mnt/gluster` itself is a symlink (`-> ./glusterfs`). Realpath both the root and the target (safepath does). No symlinks exist today at depth ≤ 3 [VERIFIED], but owner/udid names are written by the API and worker.

### Pitfall 8: Retention or one-off probes inside the API container
`thinx_api` is limited to 256M. A full `_all_docs` or large tree walk inside it can OOM-kill the API. Use a one-shot container. Read-only `curl` probes through it are fine.

### Pitfall 9: Mirroring a broken job
The audit retention job has been dead since 2026-09-24 (no `curl` in DHI CouchDB). Copying its `docker exec <couchdb> curl` transport reproduces the failure, with "nothing to delete" looking like success. Also, check `resp head` emptiness as an **error**, not a no-op.

### Pitfall 10: Full-depth `find` on gluster
A full-depth `find` on repos took over 5 minutes. Retention must only `readdir` depths 1–3, plus direct children for the age check, and `du` only the candidate set.

### Pitfall 11: Cypress catch-all ordering
`stubThinxApi()` registers a catch-all first. A bespoke paging intercept must be registered **after** `cy.stubThinxApi()` (api-stubs.js:40-56 comment). Intercepts match on `pathname`, so `?limit=100&cursor=…` still matches `/logs/audit`. Distinguish pages inside a route handler.

## Code Examples

### log_paging.js (core)
```js
// lib/thinx/log_paging.js — pure; no CouchDB, no config. Never trusts the cursor for the owner.
const MAX_LIMIT = 200, DEFAULT_LIMIT = 100, MAX_CURSOR = 512;

function parseLimit(raw) {
  if (typeof raw === "undefined") return { ok: true, limit: DEFAULT_LIMIT };
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw)) return { ok: false, reason: "invalid_limit" };
  return { ok: true, limit: Math.min(MAX_LIMIT, Math.max(1, parseInt(raw, 10))) };
}

function encodeCursor(k, id) {
  return Buffer.from(JSON.stringify({ v: 1, k, i: id }), "utf8").toString("base64url");
}

// kind: "audit" (k = ISO string) | "builds" (k = finite number)
function decodeCursor(raw, kind) {
  if (typeof raw === "undefined") return { ok: true, cursor: null };
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CURSOR || !/^[A-Za-z0-9_-]+$/.test(raw)) return { ok: false };
  let c;
  try { c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); } catch (_e) { return { ok: false }; }
  if (!c || c.v !== 1 || typeof c.i !== "string" || c.i.length === 0 || c.i.length > 128 || /[\u0000-\u001f]/.test(c.i)) return { ok: false };
  if (kind === "audit" && !(typeof c.k === "string" && c.k.length > 0 && c.k.length <= 64)) return { ok: false };
  if (kind === "builds" && !(typeof c.k === "number" && Number.isFinite(c.k))) return { ok: false };
  return { ok: true, cursor: { k: c.k, i: c.i } };
}

// owner MUST come from the session. The range is bounded to [owner] on both ends.
function buildQuery(owner, limit, cursor, extra) {
  const q = Object.assign({ descending: true, endkey: [owner], limit: limit + 1 }, extra || {});
  if (cursor) { q.startkey = [owner, cursor.k]; q.startkey_docid = cursor.i; }
  else { q.startkey = [owner, {}]; }
  return q;
}

function pageFromRows(rows, limit) {
  const list = Array.isArray(rows) ? rows : [];
  const has_more = list.length > limit;
  const next = has_more ? list[limit] : null;
  return {
    rows: list.slice(0, limit),
    paging: { limit, has_more, next_cursor: next ? encodeCursor(next.key[1], next.id) : null }
  };
}

module.exports = { parseLimit, encodeCursor, decodeCursor, buildQuery, pageFromRows, MAX_LIMIT, DEFAULT_LIMIT };
```

### ensureDesignDoc
```js
// lib/thinx/design_upsert.js — never throws; returns {ok, action, reason}
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const o = {};
    Object.keys(v).sort().forEach((k) => { if (k !== "_rev") o[k] = canonical(v[k]); });
    return o;
  }
  return v;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

async function ensureDesignDoc(db, desired, timeoutMs = 5000) {
  const t = (p) => withTimeout(p, timeoutMs); // same helper shape as audit-ttl-probe.js:71-81
  let existing = null;
  try { existing = await t(db.get(desired._id)); }
  catch (e) { if (!e || e.statusCode !== 404) return { ok: false, action: "skipped", reason: reason(e) }; }
  if (existing && same(existing, desired)) return { ok: true, action: "unchanged" };
  const doc = Object.assign({}, desired);
  if (existing) doc._rev = existing._rev;
  try { await t(db.insert(doc)); return { ok: true, action: existing ? "updated" : "created" }; }
  catch (e) {
    if (e && e.statusCode === 409) {
      const now = await t(db.get(desired._id)).catch(() => null);
      return (now && same(now, desired)) ? { ok: true, action: "unchanged" } : { ok: false, action: "conflict" };
    }
    return { ok: false, action: "failed", reason: reason(e) };
  }
}
```
The `db` here is the promise form of the couch wrapper: with no trailing callback, calls pass straight through (couch.js:46-50).

### Router (audit; builds is symmetric with `kind:"builds"`, `include_docs:true`, `toBuildListItem`)
```js
function getAuditLog(req, res) {
  if (!Util.validateSession(req)) return res.status(401).end();
  const owner = sanitka.owner(req.session.owner);
  const q = req.query || {};
  const paged = Object.prototype.hasOwnProperty.call(q, "limit") || Object.prototype.hasOwnProperty.call(q, "cursor");
  if (!paged) return legacyAudit(owner, res); // alog.fetch → Util.responder(res, true, items) — unchanged shape
  const lim = paging.parseLimit(q.limit);
  if (!lim.ok) return Util.failureResponse(res, 400, "invalid_limit");
  const cur = paging.decodeCursor(q.cursor, "audit");
  if (!cur.ok) return Util.failureResponse(res, 400, "invalid_cursor");
  alog.fetchPage(owner, lim.limit, cur.cursor, (err, page) => {
    if (err) return Util.responder(res, false, "log_fetch_failed");
    Util.respond(res, { success: true, response: page.items, paging: page.paging });
  });
}
```

### Vue: parseResult + store
```js
// services/console/vue/src/core/api.js — additive
parseResult(result) {
  if (result && typeof result.success !== 'undefined' && result.success) {
    let keys = Object.keys(result).filter( key => key !== 'success' && key !== 'paging' );
    const out = { 'success': result.success, 'response': result[keys[0]] };
    if (result.paging && typeof result.paging === 'object') out.paging = result.paging;
    return out;
  }
  return result || { success: false };
}

// store/auditlog.js (buildlog.js mirrors it, applying normalizeBuildItems to each page)
const PAGE = 100;
actions: {
  async fetchAuditlog({ state, commit }) {
    const result = await this.$api.$get(`/logs/audit?limit=${PAGE}`);
    if (result.success) commit('setFirstPage', { items: result.response || [], paging: result.paging });
    return state.items;
  },
  async fetchMoreAuditlog({ state, commit }) {
    if (!state.paging.has_more || !state.paging.next_cursor || state.loadingMore) return state.items;
    const gen = state.generation;
    commit('setLoadingMore', true);
    try {
      const result = await this.$api.$get(`/logs/audit?limit=${PAGE}&cursor=${encodeURIComponent(state.paging.next_cursor)}`);
      if (result.success && state.generation === gen) commit('appendPage', { items: result.response || [], paging: result.paging });
    } finally { commit('setLoadingMore', false); }
    return state.items;
  },
},
mutations: {
  setFirstPage(state, { items, paging }) { state.items = items; state.paging = normPaging(paging); state.generation++; },
  appendPage(state, { items, paging }) { state.items = state.items.concat(items); state.paging = normPaging(paging); },
  setLoadingMore(state, v) { state.loadingMore = v; },
  saveAuditItems(state, data) { state.items = data.items; }, // keep for compatibility
},
// normPaging(p) => ({ has_more: !!(p && p.has_more), next_cursor: (p && typeof p.next_cursor === 'string') ? p.next_cursor : null })
```

### Cypress: two-page stub (register after `cy.stubThinxApi()`)
```js
cy.intercept({ method: 'GET', pathname: '/api/v2/logs/audit' }, (req) => {
  const cursor = new URL(req.url).searchParams.get('cursor');
  req.reply({ fixture: cursor ? 'api/audit-log-page2.json' : 'api/audit-log-page1.json' });
}).as('getAuditLogPaged');
```
Keep `audit-log.json` / `build-log.json` unchanged (no `paging` → `has_more` false). Existing dashboard and history assertions stay valid.

### Index warm-up and timing (executor, read-only, via the API container's curl)
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'bash -s' <<'EOF'
A=$(docker ps -qf name=thinx_api | head -1)   # query placement first; exec is node-local
cget(){ docker exec "$A" sh -c 'curl -sg --max-time 900 "http://$COUCHDB_USER:$COUCHDB_PASS@couchdb:5984/$1"' _ "$1"; }
date -u +%T; cget "_active_tasks" | jq -c '[.[]|select(.type=="indexer")|{db:.database,ddoc:.design_document,changes_done,total_changes,progress}]'
cget "managed_logs/_design/paging/_info" | jq -c '.view_index|{updater_running,update_seq,sizes}'
s=$(date +%s); cget "managed_logs/_design/paging/_view/audit_by_owner_date?limit=1" | jq -c '{total_rows, n:(.rows|length), error}'; echo "audit view answered in $(( $(date +%s)-s ))s"
s=$(date +%s); cget "managed_builds/_design/paging/_view/builds_by_owner_time?limit=1" | jq -c '{total_rows, n:(.rows|length), error}'; echo "builds view answered in $(( $(date +%s)-s ))s"
EOF
```
Run it right after the new `thinx_api` task is up (Push 1). Poll the `_active_tasks` line every ~10 s until no `_design/paging` indexer remains. Pass criteria: both views answer with no `error`, the audit `total_rows` ≈ 4,445 (+ new writes), and the builds `total_rows` = 125 (+ new). Print only `total_rows`, never rows (`limit=1` returns one row; the `jq` keeps counts only). A `{"error":"timeout"}` from a long build is possible [ASSUMED]: keep polling `_active_tasks`, then re-query.

### Retention runner (host wrapper sketch)
```bash
# /usr/local/sbin/thinx-build-retention.sh  [--apply]   (default: dry run)
set -uo pipefail
exec 9>/var/lock/thinx-build-retention.lock; flock -n 9 || exit 0
IMG=$(docker service inspect thinx_api --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
set -a; . /mnt/gluster/thinx/.env; set +a          # COUCHDB_USER / COUCHDB_PASS; never echoed
docker run --rm --network thinx_internal --memory 256m --entrypoint node \
  -e COUCHDB_USER -e COUCHDB_PASS -e ENVIRONMENT=production \
  -v /mnt/gluster/thinx/deploy:/mnt/data/deploy -v /mnt/gluster/thinx/repos:/mnt/data/repos \
  -v /mnt/gluster/thinx/conf:/mnt/data/conf:ro \
  "$IMG" scripts/build-retention.js "${1:---dry-run}" 2>&1 | tee -a /var/log/thinx-build-retention.log
```
`Database` builds `http://user:pass@couchdb:5984` (database.js:20). Whether the stack alias `couchdb` resolves for a standalone container attached to `thinx_internal` is [ASSUMED]; the redaction runbook used `thinx_couchdb`. Make the host overridable (`COUCHDB_HOST`); the dry run proves it either way.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `stale=ok` / `update_after` | `update=false|lazy|true` + `stable` | CouchDB 3.x | Use `update`; `stale` is deprecated. [CITED: views.html] |
| Cron jobs that query views to keep them warm | ken background indexing (`autoupdate`) | CouchDB 3.0 | New ddocs build in the background without a query. [CITED: config/indexbuilds.html; blog.couchdb.org 2020-02-26] |
| `skip` paging | `startkey`/`startkey_docid` + `limit+1` | CouchDB ≥ 1.2 guidance | [CITED: pagination.html] |

**Deprecated/outdated in this repo:**
- `buildlog.prune()` and its call from `list()`: a dead no-op (see above).
- `Builder.cleanupDeviceRepositories` (builder.js:476-498) lists the subdirectories of the **kept** build path and deletes `device_path/<thatName>`, which never matches sibling build dirs. That is why the repos tree holds all 186 build dirs. Not in scope; noted for the retention design.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ken starts building `_design/paging` right after the boot upsert writes it | Pitfall 4 | Low: the warm-up query starts the build instead. Timing is attributed to the query. |
| A2 | Index build on 662k by-seq entries at 0.2 CPU finishes in minutes, not hours | Pitfall 3 / warm-up | Medium: a long build blocks legacy audit calls. Mitigate with a fallback (OQ3) and an off-peak deploy. |
| A3 | A long-running view request may answer `{"error":"timeout"}` before the index is built | Warm-up | Low: keep polling `_active_tasks`. |
| A4 | The ES5 map functions run unchanged on the CouchDB 3.5 JS engine (SpiderMonkey/QuickJS) | Detailed Designs | Low: covered by the CI `ZZ-LogPagingCouchSpec` on `dhi.io/couchdb:3`. |
| A5 | `nano` `db.insert(doc)` with `_id: "_design/paging"` (POST) creates/updates a ddoc; existing code uses `insert(doc, "_design/x")` | ensureDesignDoc | Low: CI spec proves it; switch to the two-arg form if needed. |
| A6 | Node `fs.rm(path, {recursive:true})` removes symlinks inside the tree without following them | Retention gate | Medium (one-way deletion): no symlinks exist today; add a spec with a symlink child pointing outside the tmp root. |
| A7 | A standalone container on `thinx_internal` resolves the stack alias `couchdb` | Retention runner | Low: make the host configurable; the dry run fails loudly. |
| A8 | Cypress 9.7 `req.url` in a route handler carries the query string | Cypress stub | Low: an alternative is the `query` RouteMatcher. |

## Open Questions (RESOLVED)

All seven were decided on 2026-10-01 after research (26-CONTEXT.md "Post-research decisions" and "Deferred Ideas"). Each question carries its resolution inline.

1. **Is the repos workspace in D-09/D-11 scope?** (one-way) — RESOLVED: D-16. Both roots are in scope, each reported separately in the dry run and approved per root at the D-10 checkpoint (plans 26-04, 26-08).
   - What we know: "artifact folders" literally means the deploy root, which holds 4 expired folders (44K) and 0 orphans. The workspace tree `/mnt/data/repos/<owner>/<udid>/<build_id>` is keyed identically and holds 103 expired-record folders (29M) plus 61 orphans (227M, 2021–2022). It contains checkouts (regenerable) and some `<uuid>.zip` copies.
   - Recommendation: include repos as a second root in the same job and show both roots separately in the dry-run report. The operator decides at the D-10 checkpoint. Default to the deploy root only if they decline.
2. **Fix the broken audit retention job in this phase?** — RESOLVED: D-17. The new retention script replaces it (audit 365 d plus builds, one-shot container), and the old cron entry is retired in the same gated step (plans 26-04, 26-08).
   - What we know: it has been dead since 2026-09-24 and its 365-day guarantee has lapsed (30 docs past the window). D-07 says to mirror it.
   - Recommendation: yes, as a small operator-checkpointed task. Change its transport to the same one-shot-container approach, or to `docker exec <thinx_api> curl`, and treat an empty response as an error.
3. **Legacy audit fallback during the first index build?** — RESOLVED: D-19 (planner's call). Plan 26-01 keeps a bounded fallback to `logs_by_owner` with strict owner equality; plan 26-06 warms the index before the Vue switch; removing the fallback is a recorded follow-up with the deferred `_design/logs` cleanup.
   - Recommendation: on `not_found` or error from the new view, the no-param path falls back to the current `logs_by_owner` behaviour (the old code kept as `legacyFetchGlobal`). That protects the classic console during Push 1, at small extra code cost. Remove the fallback in the deferred `_design/logs` cleanup.
4. **DeviceDetail per-device history = newest 100 owner builds** (was: flat builds of the last 30 days). — RESOLVED: D-19 (planner's call). Accepted as described, with the note recorded in plan 26-05 (must_haves and SUMMARY); no per-device Load more in this phase.
   - Background: it is acceptable today. A per-device server query is a later capability.
5. **Existing 195 audit docs with object flags (password hashes, reset keys, emails):** — RESOLVED: D-15. Redact them and clear outstanding reset keys as a gated, dry-run-first, one-way step (code in plan 26-03, production in plan 26-06).
   - Background: the view filters them out of responses, but the data stays in `managed_logs` until retention ages it out (up to 365 d). Redact now with `scripts/redact-managed-logs.js` (runbook `managed-logs-redaction.md`), or accept? This is outside the LOG requirements, so it is an operator call.
6. **Restore the smoosh 01:00–05:00 window config?** — RESOLVED: deferred (26-CONTEXT.md "Deferred Ideas": restore the CouchDB compaction window). Recorded as a follow-up in plan 26-08.
   - Background: it is not persisted, because `local.d` isn't mounted. That is outside Phase 26. Record it as a follow-up and update the memory note.
7. **GDPR `purgeOwner` misses nested build docs** — RESOLVED: D-18. `purgeOwner` moves to `builds_by_owner_time`, covering both shapes (plan 26-02).
   - Background: 113 docs have no root `owner`, and `latest_builds` keys them `null`. It could switch to `builds_by_owner_time` (`startkey [owner]`, `endkey [owner,{}]`). It is cheap but outside LOG-04, so the planner decides.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (local) | specs, Vue unit tests | ✓ | v25.1.0 | — |
| jasmine helper-free runner | local specs | ✓ | 5.x ("47 specs, 0 failures") | — |
| Vue `npm run test:unit` | store/api unit tests | ✓ | passes today | — |
| Cypress | Vue e2e | ✓ | 9.7.0 (13 pre-existing local failures per 25-10) | run only the touched specs, diff against a baseline |
| Docker daemon (local) | optional local CouchDB proof | ✓ | 29.8.0 | rely on the CI `ZZ-` spec |
| CouchDB (CI) | `ZZ-LogPagingCouchSpec` | ✓ in CircleCI (`dhi.io/couchdb:3`, docker-compose.test.yml:23) | 3.x | — |
| micro: jq, flock, python3, node | retention wrapper / probes | ✓ | jq, flock, py 3.12.3 | — |
| curl in `thinx_couchdb` | old audit job transport | ✗ | — | API container curl or a one-shot container |
| curl in `thinx_api` | warm-up probes | ✓ | — | — |

**Missing with no fallback:** none. **Missing with fallback:** curl in CouchDB (see above).

## Verification Strategy (requested Q8; `workflow.nyquist_validation` is false, so there is no formal Validation Architecture section)

Local helper-free command (Phase 25 pattern):
```bash
OUT=$(ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/LogPagingSpec.js','jasmine/DesignUpsertSpec.js','jasmine/PagingMapSpec.js','jasmine/LogRouterPagingSpec.js','jasmine/BuildRetentionSpec.js'],helpers:[],random:false});j.execute()" 2>&1); RC=$?; echo "$OUT" | tail -4; [ $RC -eq 0 ] && echo "$OUT" | grep -qE '^[1-9][0-9]* specs?, 0 failures' && echo LOG-PAGING-LOCAL-GREEN
```
(`lib/thinx/audit.js`, `buildlog.js` and `database.js` load locally without CouchDB [VERIFIED]; nano connects lazily.)

| Req | Proof without CouchDB (local) | Proof in CI (real CouchDB) | Proof in production |
|-----|------|------|------|
| LOG-01 | `DesignUpsertSpec`: fake db → 404→create (no `_rev`); equal→no insert; differs→insert with `_rev`; 409→re-GET; ECONNREFUSED→`{ok:false}`, `process.exit` spy not called; only `_design/paging` ids touched | `ZZ-LogPagingCouchSpec`: pre-insert an older `_design/paging`, run upsert → rev bumped; run again → same rev; `_design/logs` `_rev` unchanged | `GET managed_logs/_design/paging` + `managed_builds/_design/paging` exist; `_design/logs` still rev gen 1, map sha `925f3cee0cc4`; after a forced single-service update the `_design/paging` rev is unchanged |
| LOG-02 | `PagingMapSpec` (object flag → `["info"]`, no owner → no emit); `LogRouterPagingSpec`: no-param → keys exactly `success,response`, ≤ 200, query `{startkey:[owner,{}],endkey:[owner],descending:true,limit:200}` on `paging/audit_by_owner_date` | collation: equal dates across owners stay separated | classic console audit list shows own entries with real flag badges; `response.length ≤ 200` |
| LOG-03 | `LogPagingSpec`: cursor round-trip, garbage/oversize/array → 400, decoded cursor has no owner and no 64-hex string, `buildQuery` keeps `startkey[0]===owner && endkey==[owner]` for any cursor, `limit+1`/has_more/next_cursor; Vue `log-paging-store.cjs` + `parseResult` keeps `paging` | owner A 3 docs (2 with equal dates), owner B 2 docs; page A `limit=2` → 2 + cursor; page 2 → rest, no dupes; replay A's cursor as B → only B's docs | Vue History as the >200-entry owner: Load more past row 200; network response has `paging` |
| LOG-04 | `LogRouterPagingSpec` builds: paged keys `success,response,paging`; fake buildlib `destroy` never called by `list()`/paged; static check that `list()` has no `this.prune(` | nested + flat docs ordered by time | `managed_builds` `doc_del_count` unchanged after paging; Vue build Load more; console served bundle hash changed (`console-retest` skill) |
| D-09..D-11 | `BuildRetentionSpec` (tmp roots): expired-record folder removed; udid-level `build.json`/`*.zip`, owner `avatar.json`, non-UUID dirs untouched; symlinked owner dir → refused; prefix sibling refused; orphan age uses newest child mtime; record read failure → sweep aborted; dry run deletes nothing and output has no 64-hex | — | dry-run aggregates reviewed at the D-10 checkpoint; after apply, re-run the dry run → 0 expired |

Vue e2e: capture a baseline of the 13 pre-existing local failures first (Wave 0). Then run `history.spec.js`, `dashboard.spec.js` and `device-detail.spec.js` (they use the log fixtures and `fetchBuildLog`). Pass criterion: no new failures against the baseline. Do not rely on the console repo's CircleCI Cypress job (it calls production; 25-10 follow-up 1).

Wave 0 gaps: `tests/unit/log-paging-store.cjs` (+ add it to `test:unit`), the four page fixtures, the five local specs, the one `ZZ-` CI spec.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | — |
| V3 Session Management | no (unchanged; Bearer owner binding from Phase 25 is reused) | `bearer_owner.js` |
| V4 Access Control | **yes** | Owner only from `req.session.owner`; owner-bounded `startkey`/`endkey`; the cursor holds no owner |
| V5 Input Validation | **yes** | `parseLimit` / `decodeCursor` (type, length, charset, per-kind key type); 400 on invalid |
| V7 Error/Logging | **yes** | Audit flags sanitised; retention prints aggregates only; no owner ids in logs |
| V8 Data Protection | **yes** | No password hash / reset key reaches API responses through `flags` |
| V12 Files/Resources | **yes** | Retention: strict segment regex + `safepath.resolveInside` + lstat; depth exactly 3; abort on record-read failure |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cursor replay across tenants | Information disclosure | Server re-binds owner on both range ends; CI cross-owner replay spec |
| Forged cursor / `limit` abuse | Tampering / DoS | Validation, `limit` clamp 200, cursor ≤ 512 chars |
| Credential material in audit `flags` | Information disclosure | Map emits string flags only; writer fix; redaction decision (OQ5) |
| Path traversal / symlink via DB-sourced `owner/udid/build_id` | Elevation / Tampering | Treat DB values as untrusted: `strictOwner`, UUID regex, realpath containment |
| Mass deletion on DB outage | Tampering (integrity) | Abort the orphan sweep unless the record read succeeded; dry run first (D-10) |
| Pre-existing: `GET /api/v2/logs/build/:bid` has no owner check (`fetchBuildLogID`, router.logs.js:45-68) | Information disclosure | Out of scope; note as a follow-up |

## Sources

### Primary (HIGH — read this session)
- Repo: `lib/thinx/{audit,buildlog,database,couch,util,files,safepath,sanitka,owner_purge,deployment,notifier,builder,audit-ttl-probe}.js`, `lib/router.logs.js`, `design/design_{logs,builds}.json`, `thinx-core.js:162-224`, `docker-swarm.yml`, `services/worker/builder`, `node_modules/nano/lib/nano.js:341-345,700-773`
- Vue: `src/core/api.js`, `src/store/{auditlog,buildlog,stats}.js`, `src/pages/History/History.vue`, `src/pages/Visits/Visits.vue`, `Header.vue`, `Notifications.vue`, `DeviceDetail.vue`, `cypress/support/api-stubs.js`, `cypress/integration/{history,dashboard}.spec.js`, fixtures, `tests/unit/footer-hostnames.cjs`
- Classic console: `services/console/src/app/js/thinx-api.js:624-739,1288-1312`, `controllers/HistoryController.js`
- Production (read-only ssh GETs / ls / find / du / stat, aggregates only): CouchDB 3.5.2 db info, `_design_docs`, `_info`, `_all_docs` classification, `_active_tasks`, `_config` (ken/smoosh); gluster layout; the retention script, cron and log
- `.planning/` CONTEXT, ROADMAP §26, REQUIREMENTS, research/{FEATURES,PITFALLS}.md, 25-10-SUMMARY, runbooks/managed-logs-redaction.md; AGENTS.md; memory notes

### Secondary (MEDIUM — official docs via WebFetch; the seam's `classify-confidence --provider webfetch` returns LOW, so these are tagged CITED)
- https://docs.couchdb.org/en/stable/ddocs/views/pagination.html
- https://docs.couchdb.org/en/stable/api/ddoc/views.html
- https://docs.couchdb.org/en/stable/ddocs/views/collation.html
- https://docs.couchdb.org/en/stable/ddocs/views/intro.html
- https://docs.couchdb.org/en/stable/config/indexbuilds.html
- https://blog.couchdb.org/2020/02/26/the-road-to-couchdb-3-0-automatic-view-index-warming/

### Tertiary (LOW)
- Index build duration, ken trigger timing, timeout behaviour: see the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Existing installed versions, verified.
- Architecture (views, cursor, upsert, store): HIGH for code facts and production data shape; MEDIUM for CouchDB semantics (cited docs, to be proven by the CI spec).
- Retention: HIGH for layout, counts and mapping (measured); MEDIUM for runner mechanics (A6, A7).
- Pitfalls: HIGH (most are observed in code or production).

**Research date:** 2026-10-01
**Valid until:** 2026-10-15 for production counts and ops state (fast-moving: retention, deploys); 2026-10-31 for code and design.
