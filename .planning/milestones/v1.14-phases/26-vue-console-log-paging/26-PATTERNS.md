# Phase 26: Vue Console Log Paging - Pattern Map

**Mapped:** 2026-10-01
**Files analyzed:** 27 (new + modified)
**Analogs found:** 25 / 27 (all analog paths verified git-tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `design/paging_logs.json` (new) | config (CouchDB ddoc) | transform (map) | `design/design_logs.json` | exact |
| `design/paging_builds.json` (new) | config (CouchDB ddoc) | transform (map) | `design/design_builds.json` | exact |
| `lib/thinx/log_paging.js` (new) | utility (pure) | transform | `lib/thinx/safepath.js` (pure, `{ok, reason}` returns) | role-match |
| `lib/thinx/design_upsert.js` (new) | utility | request-response (CouchDB) | `lib/thinx/audit-ttl-probe.js` (`withTimeout`, never throws) + `Database.injectDesign` | role-match |
| `lib/thinx/database.js` (mod: hook upsert in `init`) | service | boot / CRUD | self (`init`, `injectDesign`, `handleDatabaseErrors`) | exact |
| `lib/thinx/audit.js` (mod: `fetch` owner-keyed, `fetchPage`, `_buildRecord` string-only flags) | service | CRUD (read) | self `fetch()` lines ~68-95 | exact |
| `lib/thinx/buildlog.js` (mod: `list` keyed + no prune, `listPage`, `purgeOwner` via new view) | service | CRUD | self `list()` 326ff, `purgeOwner()` 373ff | exact |
| `lib/router.logs.js` (mod: paged branch, `toBuildListItem`) | controller (route) | request-response | self `getAuditLog` / `getBuildLogs` | exact |
| `lib/thinx/owner.js:417`, `lib/thinx/sources.js:361` (mod) | service | event (audit write) | sibling `alog.log(owner, "...", "error")` calls in same files | exact |
| `lib/thinx/build_retention.js` (new) | service (destructive orchestrator) | batch / file-I/O | `lib/thinx/owner_purge.js` (deps-injected ctor) | exact |
| `scripts/build-retention.js` (new) | CLI script | batch | `scripts/redact-managed-logs.js` | exact |
| reset_key clear + audit flags redaction script (D-15, likely extend `scripts/redact-managed-logs.js` or new `scripts/clear-reset-keys.js`) | CLI script | batch | `scripts/redact-managed-logs.js` (`--scan` default, `--apply`, `_bulk_docs`) | exact |
| host wrapper `thinx-build-retention.sh` (runbook, not committed with host/key) | ops | batch | `.planning/runbooks/managed-logs-redaction.md` + RESEARCH "Retention runner" | partial |
| `spec/jasmine/LogPagingSpec.js` (new) | test | unit | `spec/jasmine/OwnerPurgeSpec.js` | exact |
| `spec/jasmine/DesignUpsertSpec.js` (new) | test | unit (fake db) | `spec/jasmine/ZZ-CouchCallbackShimSpec.js` (fakeClient) | exact |
| `spec/jasmine/PagingMapSpec.js` (new) | test | unit (eval map) | none (closest: `OwnerPurgeSpec.js` style) | no analog |
| `spec/jasmine/LogRouterPagingSpec.js` (new) | test | unit (require.cache stubs) | `spec/jasmine/ZZ-AuditTTLSpec.js` (`loadAuditFresh`) | role-match |
| `spec/jasmine/BuildRetentionSpec.js` (new) | test | file-I/O (tmp dirs, symlinks) | `spec/jasmine/SafePathSpec.js` | exact |
| `spec/jasmine/ZZ-LogPagingCouchSpec.js` (new) | test | CI integration | `spec/jasmine/ZZ-AuditTTLEvictionSpec.js` | role-match |
| `services/console/vue/src/core/api.js` (mod `parseResult`) | utility | request-response | self lines 70-79 | exact |
| `services/console/vue/src/store/auditlog.js` (mod) | store | request-response | self | exact |
| `services/console/vue/src/store/buildlog.js` (mod) | store | request-response | self + `store/auditlog.js` | exact |
| `services/console/vue/src/pages/History/History.vue` (mod) | component | event-driven | self | exact |
| `services/console/vue/tests/unit/log-paging-store.cjs` (new) + `package.json` `test:unit` | test | unit (plain node) | `tests/unit/footer-hostnames.cjs` | exact |
| `services/console/vue/cypress/fixtures/api/{audit,build}-log-page{1,2}.json` (new) | test fixture | — | `cypress/fixtures/api/audit-log.json`, `build-log.json` | exact |
| `services/console/vue/cypress/integration/history.spec.js` (mod) | test e2e | — | self + `cypress/support/api-stubs.js` | exact |
| console submodule pointer bump | config | — | Phase 25 deploy flow (AGENTS.md) | n/a |

---

## Pattern Assignments

### `design/paging_logs.json`, `design/paging_builds.json` (ddoc)

**Analog:** `design/design_logs.json`, `design/design_builds.json` (single JSON object, `_id`, `language`, `views.<name>.map` as one-line ES5 string). Use the exact map strings in 26-RESEARCH.md "Audit view" / "Build view". Name must NOT start with `design_` (`Database.init` builds `ROOT + "/design/design_" + name + ".json"`). `_design/logs` is never edited (D-13).

---

### `lib/thinx/design_upsert.js` (utility, never throws)

**Timeout helper analog:** `lib/thinx/audit-ttl-probe.js` lines ~71-81
```js
function withTimeout(promise, ms) {
  let timer = null;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("__OBS_02_TIMEOUT__")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}
```
**Doc loading analog:** `Database.getDocument(file)` (database.js ~135-150): `fs.existsSync` -> `readFileSync` -> `JSON.parse` in try/catch, returns `false` on failure. Resolve path with `path.join(__dirname, "../../design/paging_logs.json")` (not `ROOT`/`Filez.appRoot()`).
**Anti-pattern to replace (do not copy):** `injectDesign` (database.js ~175-185) inserts without `_rev` and logs via `logCouchError`, which can `process.exit(1)` on ENOTFOUND:
```js
db.insert(design_doc, "_design/" + design, (err, body, header) => {
    this.logCouchError(err, body, header, "init:design:" + design);
});
```
Core logic: use the `ensureDesignDoc` sketch in 26-RESEARCH.md (Code Examples) verbatim; return `{ok, action, reason}`.

---

### `lib/thinx/database.js` (modify `init`)

**Hook site** (database.js `init`, ~lines 79-97):
```js
this.nano.db.create(dbprefix + "managed_" + name).then(() => {
    let couch_db = this.nano.db.use(dbprefix + "managed_" + name);
    this.injectDesign(couch_db, name, ROOT + "/design/design_" + name + ".json");
    this.injectReplFilter(couch_db, ROOT + "/design/filters_" + name + ".json");
    console.log(`ℹ️ [info] Database managed_${name} initialized.`);
}).catch((err2) => {
    // returns error normally if DB already exists
    this.handleDatabaseErrors(err2, "managed_" + name, dbprefix);
});
```
Add `this.ensureDesignDocs(name)` (fire-and-forget, `.catch` all) in `.then` AND in `.catch` before `handleDatabaseErrors` when err is 412/"the file already exists". Only for `logs` and `builds`. Never route through `handleDatabaseErrors` (it `process.exit(1|2)`s, ~198-211). Note `existing_dbs.includes(name)` never matches (compares `"logs"` vs `"managed_logs"`) — leave it.

---

### `lib/thinx/audit.js` (modify `fetch`, add `fetchPage`, harden `_buildRecord`)

**Current fetch** (~lines 68-95) — callback contract `(err|false, items)` to keep:
```js
fetch(owner, callback) {
    loglib.view("logs", "logs_by_owner", { "descending": true, "limit": 200 }, (err, body) => {
        if (err) { console.error("☣️ [error] Audit Log Fetch Failed", {err}); callback(err, body); return; }
        let auditlog = [];
        for (let index in body.rows) {
            let item = body.rows[index];
            if (item.value.owner.indexOf(owner) === -1) continue;
            ...
            auditlog.push({ date: item.value.date, message: item.value.message, flags: flags });
        }
        callback(false, auditlog);
    });
}
```
Replace query with `loglib.view("paging", "audit_by_owner_date", {startkey:[owner,{}], endkey:[owner], descending:true, limit:200})`, map `rows.map(r => r.value)` + defensive string-flag filter. Optional fallback to old body (keep as `legacyFetchGlobal`) on `not_found` (D-19).
**`_buildRecord` flag line** (~line 48): `"flags": Array.isArray(flag) ? flag : [flag],` -> filter to non-empty strings ≤ 32, fallback `["info"]`.

---

### `lib/thinx/owner.js:417`, `lib/thinx/sources.js:361`

Change object flag to `"info"`:
```js
alog.log(owner, "Profile updated successfully.", abody);        // owner.js:417
alog.log(owner, "Atomic tag updated successfully.", changes);   // sources.js:361
```
Sibling pattern in same blocks: `alog.log(owner, "Atomic update failed.", "error");`

---

### `lib/thinx/buildlog.js` (modify)

**Keyed view pattern to copy** (purgeOwner, ~373-395):
```js
purgeOwner(owner, callback) {
    buildlib.view("builds", "latest_builds", { "key": owner }, (err, body) => {
        if (err) { console.log(`[error] purging builds for owner ${err}`); return callback(err, 0); }
        const rows = (body && Array.isArray(body.rows)) ? body.rows : [];
        ...
        buildlib.destroy(doc._id, doc._rev, (derr) => { ... });
```
- `list()` (~326): add `{ key: owner }`, keep 30-day display filter, delete the `this.prune(doc)` call (~354). `prune()` (~308) can be removed (dead no-op).
- New `listPage(owner, limit, cursor, cb)`: `buildlib.view("paging","builds_by_owner_time", log_paging.buildQuery(owner, limit, cursor, {include_docs:true}))`.
- D-18 `purgeOwner`: query `paging/builds_by_owner_time` with `{startkey:[owner], endkey:[owner,{}], include_docs:true}`, destroy using `row.doc._id/_rev` (covers nested shape).

---

### `lib/router.logs.js` (controller)

**Auth/owner pattern** (getAuditLog, ~lines 26-28):
```js
if (!Util.validateSession(req)) return res.status(401).end();
let owner = sanitka.owner(req.session.owner);
```
**Legacy response** (unchanged): `Util.responder(res, true, body);` / errors `Util.responder(res, false, "log_fetch_failed")`, `"build_list_failed"`.
**Paged response:** `Util.respond(res, {success:true, response, paging})` (util.js ~89-99 JSON-stringifies with content-type). 400s via `Util.failureResponse(res, 400, "invalid_cursor"|"invalid_limit")` (util.js ~85-88: sets status, then `responder(res,false,reason)`).
**Extract `toBuildListItem(doc)`** from getBuildLogs loop (~lines 94-123):
```js
if (typeof (log) === "undefined") {
    builds.push({ date: buildlog.timestamp, udid: buildlog.udid });
} else {
    let timestamp = 0; let latest = log[0];
    for (var logline of log) { if (logline.timestamp > timestamp) { latest = logline; timestamp = logline.timestamp; } }
    buildlog.log = [latest];
    builds.push(buildlog);
}
```
Use it for both legacy (`row.value`) and paged (`row.doc`) paths. Full paged handler sketch: 26-RESEARCH.md "Router".

---

### `lib/thinx/log_paging.js` (pure utility)

No direct analog for cursor logic; copy RESEARCH "log_paging.js (core)" verbatim. Return-shape convention matches `safepath.resolveInside` (`{ok, reason}`, never throws, safepath.js ~141-151).

---

### `lib/thinx/build_retention.js` (destructive orchestrator)

**Analog:** `lib/thinx/owner_purge.js` constructor deps (~lines 37-80):
```js
constructor(redis, devices, deps) {
    deps = deps || {};
    if (deps.app_config) { this.app_config = deps.app_config; }
    else { const Globals = require("./globals.js"); this.app_config = Globals.app_config(); }
    if (deps.buildlog) { this.buildlog = deps.buildlog; }
    else { const Buildlog = require("./buildlog.js"); this.buildlog = new Buildlog(); }
    ...
}
_removeTree(absPath) { return fs.remove(absPath); }
```
**Containment gate:** `safepath.resolveInside(root, rel)` (safepath.js 141-151) returns `{ok, path?, reason?}`; refuse unless `ok` and `lstat` is a real dir. Segment regexes: `Sanitka.strictOwner` (`/^[a-z0-9]{64}$/`), UUID. Owner-path precedent `OwnerPurge.safeOwnerPath` (~lines 25-35: `path.resolve` + `startsWith(root + sep)` + basename check) — use realpath via safepath instead (D-16).
Order: rm folder(s) then `_bulk_docs` `_deleted`; abort orphan sweep if record read fails/returns 0 rows; output aggregates only.

---

### `scripts/build-retention.js` (and D-15 / D-17 scripts)

**Analog:** `scripts/redact-managed-logs.js`
- Header doc-block with Modes; dry-run is the default; `--apply` explicit.
- `parseArgs(argv)` (~354), `tsPrefix(mode)` (~427): ``[${new Date().toISOString()}] [${mode}]``.
- `resolveCouchUrl()` (~431-451): env-only creds, never print (`url.replace(/:[^@]+@/, ":<redacted>@")`). Note retention runner passes `COUCHDB_PASS` (research) vs this script's `COUCHDB_PASSWORD` — accept both; make host overridable (`COUCHDB_HOST`, A7).
- `main()` returns exit code; lazy `require("nano")`; bottom guard:
```js
if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => { console.error("fatal:", ...); process.exit(EXIT_RUNTIME_ERROR); });
}
```
- Paged `_all_docs` scan loop (~459-500) for the reset_key / object-flag dry-run counts. DIVERGE: this script prints `_id` samples — D-10/D-15 forbid ids, print counts only.
- Export pure functions (`module.exports`) for specs.

---

### Specs

**LogPagingSpec / BuildRetentionSpec header** (OwnerPurgeSpec.js lines 1-10):
```js
const expect = require('chai').expect;
const path = require('path');
const OwnerPurge = require("../../lib/thinx/owner_purge");
const VALID = "a".repeat(64);
describe("OwnerPurge.safeOwnerPath", function () { it("...", function () { ... }); });
```
**DesignUpsertSpec fake db** (ZZ-CouchCallbackShimSpec.js ~10-40): set `process.env.ENVIRONMENT="development"` if undefined; object with `get(id)` rejecting `Object.assign(new Error("missing"), {statusCode:404, error:"not_found"})`, `insert(doc)` returning `Promise.resolve({ok:true})`. Spy `process.exit` to assert not called.
**BuildRetentionSpec tmp fixtures** (SafePathSpec.js lines 16-40, 67-95): `fs.mkdtempSync(path.join(os.tmpdir(), "thinx-..."))` in beforeAll, removed in afterAll; `fs.symlinkSync("../outside.txt", ...)` for escape cases.
**LogRouterPagingSpec stubs** (ZZ-AuditTTLSpec.js ~45-51):
```js
function loadAuditFresh() { delete require.cache[AUDIT_PATH]; return require(AUDIT_PATH); }
```
Seed `require.cache[require.resolve("../../lib/thinx/audit")]` / buildlog with fakes before requiring `lib/router.logs.js`; drive with fake `app.get` capture + fake `req/res`.
**ZZ-LogPagingCouchSpec:** follow ZZ-AuditTTLEvictionSpec.js (real CouchDB in CI), CommonJS `require` only (chai-http stays ^4.3.0).

---

### Vue `src/core/api.js` `parseResult` (lines 70-79)
```js
parseResult(result) {
  if (result && typeof result.success !== 'undefined' && result.success) {
    let keys = Object.keys(result).filter( key => key !== 'success' );
    return { 'success': result.success, 'response': result[keys[0]] };
  }
  return result || { success: false };
}
```
Additive fix: also filter `'paging'` from `keys`, attach `out.paging` when an object (RESEARCH "Vue: parseResult").

### Vue stores `store/auditlog.js`, `store/buildlog.js`
Current action shape to preserve (return `state.items`, commit on `result.success`):
```js
async fetchAuditlog({ state, commit }) {
  const result = await this.$api.$get('/logs/audit');
  if (result.success) { commit('saveAuditItems', { items: result.response }); }
  return state.items;
},
```
buildlog: same with `commit('saveBuildItems', { items: normalizeBuildItems(result.response) })`; apply `normalizeBuildItems` to every appended page. Keep `getItems`/`getHeaders`, `saveAuditItems`, `normalizeBuildItems`, `normalizeStatus`. Add `paging` state + `getPaging`; `fetchMore*` must surface failure (UI-SPEC: do not swallow in `try/finally`). Consumers: `store/stats.js` `fetchDashboard` (`Promise.allSettled` of `auditlog/fetchAuditlog`, `buildlog/fetchBuildLog`) — unchanged call sites.

### `History.vue`
- Getters are in `methods` via `...mapGetters` and called as functions; actions `fetchAuditlog`/`fetchBuildlog` via `...mapActions`.
- `loadData()` copies store arrays once: `Promise.all([...]).then(() => { this.auditlog = this.getAuditItems() || []; ...; this.loading = false; })` — add `.finally` for `loading` (UI-SPEC), keep local arrays + local per-table paging state (UI-SPEC "List integrity").
- Empty/table pair: `<div v-if="!filteredAudit.length" class="text-muted">No audit events.</div><table v-else ...>` — new `.log-paging` footer goes after this pair, outside both branches; hooks `audit-row`/`build-row` naming convention for new `data-cy`.
- Load more markup/copy/a11y: UI-SPEC sections verbatim.

### `tests/unit/log-paging-store.cjs`
Analog `tests/unit/footer-hostnames.cjs`: plain node, `require('vue/dist/vue.runtime.common.js')`, `vuex`, ESM imports rewritten before eval. Append to `package.json:17` `"test:unit": "node tests/unit/env-json.cjs && node tests/unit/footer-hostnames.cjs"`.

### Cypress
`cypress/support/api-stubs.js`: catch-all registered first, then `cy.intercept({ method: 'GET', pathname: `${API}/logs/audit` }, { fixture: fixtures.auditLog }).as('getAuditLog')`. Bespoke paged intercept must be registered after `cy.stubThinxApi()` in the spec (handler checks `cursor` from `new URL(req.url).searchParams`). Spec structure: `history.spec.js` `beforeEach(cy.viewport; cy.stubThinxApi())`, `cy.visitApp('/#/app/history', {session:true}); cy.wait(['@getAuditLog','@getBuildLog'])`. Keep `audit-log.json`/`build-log.json` unchanged.

---

## Shared Patterns

### Owner binding (all API reads)
**Source:** `lib/router.logs.js` getAuditLog — `Util.validateSession(req)` then `sanitka.owner(req.session.owner)`; owner never from query/cursor.

### Response shape
**Source:** `lib/thinx/util.js` — `Util.responder(res, ok, payload)` for legacy `{success,response}`; `Util.respond(res, obj)` for `{success,response,paging}`; `Util.failureResponse(res, code, reason)` for 400s.

### CouchDB access
`require("./couch")(db_uri).use(Globals.prefix() + "managed_x")` (owner_purge.js ctor); callback and promise forms both supported.

### Destructive ops: dry-run first, aggregates only
`scripts/redact-managed-logs.js` (default scan, explicit `--apply`, env creds, redacted URL logging) + `owner_purge.js` deps injection + `safepath.resolveInside` containment.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `spec/jasmine/PagingMapSpec.js` | test | eval ddoc map strings with fake `emit` | No spec evaluates design-doc map functions today; use RESEARCH Verification Strategy |
| host cron wrapper `/usr/local/sbin/thinx-build-retention.sh` | ops | batch | Existing `couchdb-log-retention.sh` lives only on micro (untracked) and is broken; use RESEARCH "Retention runner" sketch, never commit host/key/port |

## Metadata
**Analog search scope:** `lib/`, `lib/thinx/`, `design/`, `scripts/`, `spec/jasmine/`, `services/console/vue/{src,tests,cypress}`
**Files scanned:** ~30
**Pattern extraction date:** 2026-10-01
