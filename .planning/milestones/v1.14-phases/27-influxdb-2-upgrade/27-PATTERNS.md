# Phase 27: InfluxDB 2 Upgrade - Pattern Map

**Mapped:** 2026-10-02
**Files analyzed:** 16
**Analogs found:** 15 / 16 (all paths verified with `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/thinx/influx.js` (rewrite) | service/connector | write fire-and-forget + request-response queries | itself (keep shape) + `lib/thinx/design_upsert.js` + `lib/thinx/secrets.js` | exact |
| `lib/thinx/statistics.js` (fix `today_V2`/`week_V2`) | service | request-response | itself, lines 79-95 | exact |
| `lib/thinx/apikey.js:210` (D-12) | service | event write | `lib/thinx/util.js:148-155` `redactToken` | role-match |
| `lib/router.auth.js:44` (D-12) | route helper | event write | same | role-match |
| `thinx-core.js:166` (boot ensure) | config/boot | event-driven | `lib/thinx/database.js:114-155` ensureDesignDocs call | exact |
| `spec/jasmine/InfluxSpec.js` (rewrite) | test (integration, v2) | request-response | `spec/jasmine/InfluxRetentionSpec.js` | exact |
| `spec/jasmine/InfluxRetentionSpec.js` (rewrite: bucket ensure) | test | CRUD | itself + `spec/jasmine/DesignUpsertSpec.js` | exact |
| `spec/jasmine/StatisticsV2Spec.js` (new, non-ZZ) | test | request-response | `spec/jasmine/LogPagingSpec.js` (non-ZZ header style) | role-match |
| `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:188-196` (update pin) | test | request-response | itself | exact |
| `docker-compose.test.yml` (influxdb:2 setup mode) | config | - | itself lines 235-246 | exact |
| `docker-compose.yml` (v2 env) | config | - | `docker-compose.test.yml` influxdb block | exact |
| `.circleci/config.yml` (dhi login before influx, if DHI used in test) | config/CI | batch | itself lines 750-775 | exact |
| `docker-swarm.yml` (influxdb v2, drop conf mount, drop chronograf, fix http router) | config | - | itself lines 505-590 | exact |
| `package.json` (swap `influx` for `@influxdata/influxdb-client(-apis)`) | config | - | - | exact |
| `scripts/aikido-known-false-positives.json` (delete 4 influx.js entries, lines 20-27) | config | - | itself | exact |
| Operator backup/cutover script(s) (optional, e.g. `scripts/influx-*.sh`) | utility (host ops) | batch | `scripts/thinx-log-retention.sh` | role-match |

## Pattern Assignments

### `lib/thinx/influx.js` (rewrite)

**Keep the public surface** (callers do `new InfluxConnector('stats')`, `InfluxConnector.statsLog(...)`, `InfluxConnector.createDB('stats')`, `InfluxConnector.measurements()`):

Current statsLog / measurements (lines 26-44) - keep tag schema `{data, owner}`, field `value: 1`:
```js
static statsLog(owner, error, data) {
    if (!Util.isDefined(owner)) owner = "0";
    console.log(`[OID:${owner}] [${error}] ${data}`);
    let obj = { measurement: error, tags: { data: data, owner: owner }, fields: { value: 1 } };
    new InfluxConnector('stats').writePoint(obj);
}
static measurements() { return EventTaxonomy.names(); }
```

Fire-and-forget write contract (lines 46-60) - must survive: callback always `[]`, errors logged and swallowed:
```js
.then(() => { if (typeof (callback) !== "undefined") callback([]); })
.catch((e) => { console.log("writePoint", e); if (typeof (callback) !== "undefined") callback([]); });
```

Boot never-reject contract (lines 179-190) - keep for `createDB`, now delegating to an ensure-bucket step:
```js
static createDB(db, cb) {
    return InfluxConnector.provisionDB(db)
        .catch((e) => { console.log("createDB", e.message || e); })
        .then(() => { if (typeof (cb) !== "undefined") cb(); });
}
```
Note: `e.message` may be fine for Influx, but prefer design_upsert's `reasonOf` (never stringify errors that might carry the token/URL).

Remove: `createUser` (lines 192-201), all `new Influx.InfluxDB({host:'influxdb',port:8086...})` (lines 18-23, 154-167, 193-197), `RETENTION_POLICY` (8-14). Replace hard-coded host with `process.env.INFLUXDB_URL || 'http://influxdb:8086'`.

### Ensure-bucket step (in `influx.js`, per D-03) - analog `lib/thinx/design_upsert.js`

Contract header to mirror (lines 8-19): action table `created | updated | unchanged | skipped | failed`, resolves `{ok, action, reason}`, never rejects, never process.exit, reason only from status code / code / "timeout".

Timeout helper (lines 49-63) and reason token (65-75) - copy verbatim or import from design_upsert:
```js
function withTimeout(promise, ms) { let timer = null; const timeoutPromise = new Promise((_r, reject) => { timer = setTimeout(() => { const e = new Error("design upsert timed out"); e.reason = "timeout"; e.timedOut = true; reject(e); }, ms); }); return Promise.race([promise, timeoutPromise]).finally(() => { if (timer !== null) clearTimeout(timer); }); }
const TOKEN = /^[A-Za-z0-9_.-]{1,40}$/;
function reasonOf(e) { if (!e || typeof e !== "object") return "error"; if (e.timedOut === true) return "timeout"; if (typeof e.statusCode === "number") return String(e.statusCode); if (typeof e.error === "string" && TOKEN.test(e.error)) return e.error; if (typeof e.code === "string" && TOKEN.test(e.code)) return e.code; return "error"; }
```
Core shape (lines 94-142): outer try/catch returning `{ok:false, action:"failed"}`; GET (404 -> absent, other -> "skipped"); compare -> "unchanged"; else write -> "created"/"updated". For buckets: GET `/api/v2/buckets?name=stats&orgID=` -> compare `retentionRules[0].everySeconds === 7776000` -> PATCH or POST. MetricsCoverageSpec: keep helper inside `influx.js` (EXCLUDED_FILES is basename based, `scripts/metrics-coverage.js:17-18,75`) or add any new module there.

### Token read (D-10) - analog `lib/thinx/secrets.js` + `lib/thinx/database.js:17-18`

```js
const { readSecret } = require("./secrets");   // secrets.js:51 exports { readSecret, _resetCacheForTests }
let user = readSecret("COUCHDB_USER");          // database.js:17 call style
```
Use `readSecret("INFLUXDB_TOKEN")`; null -> disabled mode (one log line, writes no-op, queries return zeros). Specs use `_resetCacheForTests()` (secrets.js:47-49); CI can pass plain env (env fallback secrets.js:34-35).

### `thinx-core.js:166` boot call

Currently `InfluxConnector.createDB('stats');` inside `db.init(...)` callback (lines 163-166). Analog for "fire and log one line, never fatal": `lib/thinx/database.js:114` `this.ensureDesignDocs(name, dbprefix).catch(() => { /* never fatal */ });`.

### `lib/thinx/statistics.js` (F-1 fix, lines 79-95)

Current (drops body, so router answers `no_results`):
```js
async today_V2(owner, callback) {
    await this.influx.today(owner, (result) => { callback(result); });
}
```
Change to forward `(success, body)`; body shape `{KPI:[count]}` (read by `Visits.vue`, router `lib/router.user.js:117-128`).

### D-12 writers

`lib/thinx/apikey.js:210`: `InfluxConnector.statsLog(owner, EventTaxonomy.NAMES.APIKEY_INVALID, apikey);`
`lib/router.auth.js:42-44`: `logger.warn(\`[OID:${owner}] [LOGIN_INVALID] ${data}\`); InfluxConnector.statsLog(owner, "LOGIN_INVALID", data);`
Note `statsLog` itself console.logs `data` (influx.js:28) - redact there too. Redaction helper `lib/thinx/util.js:148-155`:
```js
static redactToken(t, prefix) { ... return s.substring(0, n) + "…"; }
```

### `spec/jasmine/InfluxRetentionSpec.js` / `InfluxSpec.js` (integration against v2)

Structure to keep (InfluxRetentionSpec.js lines 10-60): unhandledRejection collector, scratch resource created/dropped in beforeAll/afterAll, `settle()`:
```js
let rejections = [];
const collect = (reason) => rejections.push(reason);
beforeAll(async () => { /* drop scratch, create drifted state */ process.on('unhandledRejection', collect); });
afterAll(async () => { process.removeListener('unhandledRejection', collect); /* drop scratch */ });
it("reconciles ... instead of rejecting", async () => {
    await InfluxConnector.createDB(TEST_DB); await settle();
    expect(rejections.map((r) => r.message)).to.deep.equal([]);
});
```
Replace `require('influx')` with the v2 `BucketsAPI`; scratch bucket name, drifted retention (e.g. 24h) -> expect 7776s*1000. Pure-unit cases (no Influx) follow `spec/jasmine/DesignUpsertSpec.js` lines 1-40 (fake objects, `couchError`-style error factory, lazy `require(path.resolve(...))`).

### `spec/jasmine/StatisticsV2Spec.js` (new, non-ZZ)

Header/doc style from `spec/jasmine/LogPagingSpec.js` lines 1-10 (`const expect = require('chai').expect;`, synthetic owner `"a".repeat(64)`, never print owners). Must NOT be named `ZZ*`: `package.json:32` `split-tests` deletes every `ZZ*.js` except `ZZ-LogPagingCouchSpec.js`; jasmine picks `jasmine/*[sS]pec.js` (`spec/support/jasmine.json`).

### `docker-compose.test.yml` (lines 235-246)

Current:
```yaml
influxdb:
  image: influxdb:1.8
  ports: ['8086:8086']
  networks: [internal]
  volumes: ['/mnt/gluster/thinx/influx:/var/lib/influxdb']
  environment: [INFLUXDB_DB=db0, INFLUXDB_ADMIN_USER=..., INFLUXDB_ADMIN_PASSWORD=...]
```
Replace with official `influxdb:2` + `DOCKER_INFLUXDB_INIT_MODE=setup` (DHI ignores `DOCKER_INFLUXDB_INIT_*`, Pitfall 6), throwaway token, tmpfs not gluster bind; pass `INFLUXDB_TOKEN`/`INFLUXDB_URL` to the `api` service env.

### `.circleci/config.yml` (lines 750-775)

"Starting Influx" step runs `docker compose up -d influxdb` (line 757) BEFORE the dhi.io login (line 774). If the test image is DHI, move/duplicate the login (`echo "$DOCKER_PUBLIC_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin dhi.io`) before it (Pitfall 9); with official `influxdb:2` no change needed.

### `docker-swarm.yml` (lines 505-590)

- influxdb: image -> `dhi.io/influxdb:2`; volume -> `/mnt/gluster/thinx/influxdb2:/var/lib/influxdb2`; delete `swarmpit/influxdb.conf` mount (line 513); env -> `INFLUXD_BOLT_PATH`, `INFLUXD_ENGINE_PATH`, cache/compaction/log/reporting vars (RESEARCH runbook step list); keep resource block.
- Traefik bug (D-14): later labels (lines 544-546) override the http router middleware:
```yaml
- "traefik.http.routers.thinx-influx-http.middlewares=https-redirect"            # line 531
...
- traefik.http.routers.thinx-influx-http.middlewares=influx-auth,error-pages-middleware   # line 546 - delete
```
Keep `influx-auth` basicauth (line 544) + https middlewares (line 545).
- chronograf (lines 547-590): delete whole service. Pattern for an https-only router with auth is its own lines 577-590 (the http router is commented out).

### Operator scripts (optional) - analog `scripts/thinx-log-retention.sh`

Credential-by-name pattern (header lines 24-26, 38) and skeleton (40-75):
```bash
# Credentials ... exported, and passed to docker by NAME (-e NAME), so values never appear in argv, log or stdout.
# Never enable shell tracing in this file: it would print the credentials.
set -uo pipefail
LOG=${THINX_RETENTION_LOG:-/var/log/thinx-log-retention.log}
SERVICE=${THINX_RETENTION_SERVICE:-thinx_api}
NETWORK=${THINX_RETENTION_NETWORK:-thinx_internal}
die() { header; log_line "wrapper: $1"; echo "wrapper: $1"; exit "$2"; }
```
Also: success sentinel last line (`... OK`), exit codes 0/1/2, one-shot container on the overlay rather than `docker exec`. Use for INFLUXDB_OPERATOR_TOKEN/ADMIN_PASSWORD (env-file for `influxd upgrade`, `-e NAME` for CLI).

## Shared Patterns

- **Never-throw + short reason token:** `lib/thinx/design_upsert.js:49-75,94-142` -> ensure-bucket, createDB, all v2 query paths.
- **Secret read with graceful absence:** `lib/thinx/secrets.js:20-44` -> INFLUXDB_TOKEN.
- **Fire-and-forget stats:** `lib/thinx/influx.js:46-60` -> WriteApi wrapper (errors logged, callback `[]`).
- **Measurement list single source:** `lib/thinx/event_taxonomy.js:22-29` via `EventTaxonomy.names()`; Flux queries must only use these names (no interpolation of user input; owner via Flux params).
- **CI spec selection:** `package.json:18` (`jasmine || true` - read job log), `package.json:32` split-tests, `docker-entrypoint.sh:88-109`.
- **Secret hygiene in scripts:** `scripts/thinx-log-retention.sh:24-38`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Flux query builders inside `influx.js` | service | request-response | No Flux/v2 client usage in repo; use RESEARCH.md Pattern 3 and the InfluxQL->Flux table (§Code Examples) |

## Metadata

**Analog search scope:** `lib/`, `lib/thinx/`, `spec/jasmine/`, `scripts/`, `thinx-core.js`, compose/swarm/CI configs, `package.json`
**Files scanned:** ~20
**Pattern extraction date:** 2026-10-02
