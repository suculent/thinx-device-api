# Testing Patterns

**Analysis Date:** 2026-05-26

> Scope: parent monorepo backend test suite under `spec/jasmine/`. Frontend Cypress
> tests under `services/console/cypress/` and any tests inside the other subservices
> are intentionally excluded.

## Test Framework

**Runner:**
- Jasmine `^5.12.0` (declared in `package.json:146`).
- `jasmine-core` `^5.12.1` (`package.json:147`).
- Spec config: `spec/support/jasmine.json` — collects `spec/jasmine/*[sS]pec.js`, loads `spec/helpers/**/*.js`, global timeout `10000`, `random: false`, `stopSpecOnExpectationFailure: false`.

**Coverage:**
- `nyc` `^15.1.0` wraps Jasmine. Output written to `./coverage/` (lcov + text-lcov for Coveralls).
- Coveralls upload happens only when `COVERALLS_REPO_TOKEN` is set (`package.json:19`).

**Assertion library:**
- `chai` pinned at `4.5.0` (commonjs). `var expect = require('chai').expect;` in every spec.

**HTTP client:**
- `chai-http` pinned at `^4.3.0`. **MUST NOT be upgraded to v5** — see AGENTS.md L83-92 and CONVENTIONS.md "Dependency Locks". v5 is ESM-only and removes the `chai.request(app)` API used in ~200 call sites.
- Idiom: `chai.request(thx.app).get(...).end((err, res) => { ... })` for stateless calls; `chai.request.agent(thx.app)` for session-cookie continuity (14 call sites across `ZZ-*` specs).

**Run commands:**
```bash
npm test                      # mkdir -p coverage; jasmine; conditional coveralls upload
npm run jasmine               # nyc jasmine (with coverage)
npm run dev                   # source ./.env; nyc jasmine; upload coverage
npm run mocha                 # alternative runner (mocha against spec/jasmine, used by coverage workflow)
npm run metrics-coverage      # node scripts/metrics-coverage.js
npm run split-tests           # CI-only: splits ZZ-* vs non-ZZ-* across CIRCLE_NODE_INDEX 0/1
```

## Test File Organization

**Location:** `spec/jasmine/` — flat directory, all specs in one folder.

**File counts:**
- Total spec files: **51** (`spec/jasmine/*.js`).
- `ZZ-*` router integration specs: **15** (NOTE: AGENTS.md L86 mentions "16 ZZ-\* spec files"; the working tree currently contains 15 — `ZZ-AppSession.js`, `ZZ-AppSessionUserSpec.js`, `ZZ-AppSessionUserV2DeleteSpec.js`, `ZZ-RouterAPIKeySpec.js`, `ZZ-RouterBuilderSpec.js`, `ZZ-RouterDeviceAPISpec.js`, `ZZ-RouterDeviceSpec.js`, `ZZ-RouterENVVarSpec.js`, `ZZ-RouterMeshesSpec.js`, `ZZ-RouterNotificationsSpec.js`, `ZZ-RouterOAuthSpec.js`, `ZZ-RouterRSAKeySpec.js`, `ZZ-RouterSourcesSpec.js`, `ZZ-RouterTransferSpec.js`, `ZZ-RouterTransformerSpec.js`).
- Unit/component specs (non-`ZZ-`): 36 files including `00-AppSpec.js`, `00-DatabaseSpec.js`, `02-OwnerSpec.js`, `03-RsakeySpec.js`, plus per-domain specs (`DeviceSpec.js`, `DevicesSpec.js`, `ACLSpec.js`, `ApienvSpec.js`, `AuditSpec.js`, `BuilderSpec`, `GitHubSpec.js`, `InfluxSpec.js`, `MessengerSpec.js`, `NotifierSpec.js`, `PlatformSpec.js`, `PluginSpec.js`, `QueueSpec.js`, `QueueActionSpec.js`, `RepositorySpec.js`, `SanitkaSpec.js`, `SourcesSpec.js`, `TransferSpec.js`, `UtilSpec.js`, `ValidatorSpec.js`, `MetricsCoverageSpec.js`, `NormalizeCommitMsgSpec.js`, `JSON2HSpec.js`, `JWTLoginSpec.js`, `LoggerSpec.js`, `XBuilderSpec.js`, `XBuildlogSpec.js`, `DeploymentSpec.js`, `GDPRSpec.js`, `GitSpec.js`, `FilezSpec.js`).
- ~62 `describe(...)` blocks, ~555 `it(...)` blocks, ~200 `chai.request(thx.app)` call sites across `spec/jasmine/`.

**Naming:**
- Unit specs: `<DomainNoun>Spec.js` — title-case noun matching the class being tested (`DeviceSpec.js` ↔ `lib/thinx/device.js`, `UtilSpec.js` ↔ `lib/thinx/util.js`).
- Numeric-prefixed specs (`00-AppSpec.js`, `00-DatabaseSpec.js`, `02-OwnerSpec.js`, `03-RsakeySpec.js`) run early because Jasmine sorts alphabetically and `random: false`. They set up the DB, owner, and RSA key fixtures used by later specs.
- `ZZ-Router<Feature>Spec.js` — router/HTTP integration specs. `ZZ` prefix forces alphabetic-sort-last so they execute after all unit specs have seeded data.

**Structure:**
```
spec/
├── _envi.json                 # Master fixture: owner ids, udid, mac, apikey, jwt, build_id
├── support/jasmine.json       # Jasmine runner config
├── helpers/
│   └── bootstrap.js           # Shared THiNX init for ZZ-* specs
├── jasmine/                   # All spec files (flat)
│   ├── 00-AppSpec.js
│   ├── 00-DatabaseSpec.js
│   ├── 02-OwnerSpec.js
│   ├── 03-RsakeySpec.js
│   ├── <Domain>Spec.js        # 32 unit specs
│   └── ZZ-Router*Spec.js      # 15 integration specs
├── mnt/                       # Mock filesystem layout mirroring /mnt/data
│   ├── data/
│   │   ├── conf/              # config.json, github-oauth.json, google-oauth.json, node-session.json
│   │   ├── deploy/
│   │   ├── mosquitto/
│   │   ├── repos/
│   │   ├── ssh_keys/
│   │   ├── ssl/
│   │   └── statistics/
├── test_repositories/         # Fixture git repos (fetched in CI via get-tests.sh)
├── mock-git-response.json
├── redis_test.js
├── slack_test.js
└── empty.json
```

## Bootstrap

**Shared bootstrap (`spec/helpers/bootstrap.js`):**

```javascript
const THiNX = require("../../thinx-core.js");
const state = { thx: null };

beforeAll((done) => {
    state.thx = new THiNX();
    state.thx.init(() => { done(); });
}, 60000);

afterAll((done) => {
    if (state.thx && state.thx.server) state.thx.server.close();
    done();
});

module.exports = state;
```

`ZZ-*` specs `require('../helpers/bootstrap')` and read `bootstrap.thx` inside their own `beforeAll`. `helpers/**/*.js` is auto-loaded by Jasmine per `spec/support/jasmine.json:6`, so the global `beforeAll` runs once for the whole `ZZ-*` set — only one THiNX server instance is constructed across the integration suite.

**Per-spec bootstrap (older unit specs):** Older specs construct `new THiNX()` themselves rather than using `bootstrap`. Example: `spec/jasmine/00-AppSpec.js:14-19`. Newer `ZZ-*` specs always use `bootstrap`.

## Test Structure

**Standard router-integration shape:**

```javascript
// spec/jasmine/ZZ-RouterDeviceSpec.js
const bootstrap = require('../helpers/bootstrap');
let chai = require('chai');
var expect = require('chai').expect;
let chaiHttp = require('chai-http');
var envi = require("../_envi.json");
chai.use(chaiHttp);

let thx;

describe("Router Devices", function () {

  beforeAll((done) => {
    console.log(`🚸 [chai] >>> running Devices spec`);
    thx = bootstrap.thx;
    done();
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Devices spec`);
  });

  it("GET /api/user/devices (noauth)", function (done) {
    chai.request(thx.app)
      .get('/api/user/devices')
      .end((err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 30000);

  it("GET /api/user/devices (cookie)", function (done) {
    chai.request(thx.app)
      .get('/api/user/devices')
      .set('Cookie', 'thx-session-cookie=something;owner=' + envi.oid)
      .end((err, res) => {
        expect(res.status).to.equal(401);
        done();
      });
  }, 30000);

});
```

**Patterns enforced:**
- Every async `it()` ends with `}, 30000);` — explicit per-spec timeout (overrides Jasmine's 10s default) because cold DB calls in CI sometimes take > 10s. New specs should keep this 30s timeout.
- `beforeAll`/`afterAll` only emit `🚸 [chai] >>> running <Name> spec` / `🚸 [chai] <<< completed <Name> spec` markers (244 such markers across the suite). Useful for grepping CI logs to locate failures.
- `expect(res.status).to.equal(<code>)` is the dominant assertion. Body assertions use `expect(res.text).to.be.a('string')` and exact-string comparison: `expect(res.text).to.equal('{"success":false,"response":"invalid_credentials"}');` (`spec/jasmine/00-AppSpec.js:93,109,124,139`).
- `done` callback style — promises are used only for `agent.post(...).then(...)` continuations in cookie-auth flows.

## Session-Cookie Pattern (chai.request.agent)

For specs that need a logged-in session, use `chai.request.agent(thx.app)` so cookies persist across requests:

```javascript
// spec/jasmine/ZZ-RouterAPIKeySpec.js:18-35
describe("API Keys (noauth)", function () {
    beforeAll((done) => {
        console.log(`🚸 [chai] >>> running API Keys (noauth) spec`);
        thx = bootstrap.thx;
        agent = chai.request.agent(thx.app);
        agent
            .post('/api/login')
            .send({ username: 'dynamic', password: 'dynamic', remember: false })
            .catch((e) => { console.log(e); })
            .then(function (res) {
                expect(res).to.have.cookie('x-thx-core');
                let body = JSON.parse(res.text);
                jwt = 'Bearer ' + body.access_token;
                done();
            });
    });
});
```

The `dynamic` user (password `dynamic`) is seeded by `02-OwnerSpec.js` from `spec/_envi.json` `dynamic.owner`. There are 14 `chai.request.agent(...)` call sites across the `ZZ-*` suite. `agent.close()` should be called in `afterAll` (`ZZ-AppSession.js:25`).

## Fixtures

**`spec/_envi.json`** is the canonical test fixture. Used in 35 spec files. Key fields:

| Field | Purpose |
|-------|---------|
| `oid` | Static test owner id (sha256-shaped hex). |
| `udid` | Static test device UDID (UUID v1 shape). |
| `mac` | `"11:11:11:11:11:11"` — test device MAC. |
| `version` | Test firmware version. |
| `sid` | Pre-known session id. |
| `ak` | Valid API key. |
| `ak_failing` | API key that should be rejected — for negative tests. |
| `build_id` | Static build id (UUID v1). |
| `email` | `cimrman@thinx.cloud`. |
| `test_info` | Full user record skeleton (`first_name: Jára`, `last_name: Cimrman`, transformers, security flags). |
| `dynamic` | Second user identity (`username: dynamic`, `password: dynamic`) used for the cookie-auth login path. |
| `dynamic2` | Third user identity for transfer/delete scenarios. |

Specs reference these as `envi.oid`, `envi.udid`, `envi.dynamic.owner`, etc. Do NOT change existing values — many specs hard-code the same hex strings and would break.

**Mock data root:** `spec/mnt/data/` mirrors the production `/mnt/data` layout so the same paths work in tests.

**Config under test (`spec/mnt/data/conf/config.json`):**
- Ports `7442`/`7443`, Redis `redis://thinx-redis:6379/0`, MQTT `mqtt://mosquitto:1883`.
- `data_root: /mnt/data`, `deploy_root: /deploy`, `build_root: /repos`, `ssh_keys: /mnt/data/ssh_keys`.
- `debug.allow_http_login: true` so login over HTTP succeeds in tests (production gates this).
- `debug.deployment: true` adds verbose deploy logs.
- `strict_gdpr: true`.
- `slack.client_secret: "<not-configured>"`, `bot_token: "<not-configured>"` — placeholder strings, never real secrets.

**Other conf fixtures:**
- `spec/mnt/data/conf/github-oauth.json`, `google-oauth.json` — OAuth client placeholders.
- `spec/mnt/data/conf/node-session.json` — Express session secret material.

**Repository fixtures:**
- `spec/test_repositories/` — populated in CI via `cd spec/test_repositories && sh ./get-tests.sh` (`.circleci/config.yml:184-186`). Excluded from ESLint via `eslint.config.js:10`.

**Other fixtures:**
- `spec/mock-git-response.json` — canned git webhook payload.
- `spec/empty.json` — sentinel empty object.
- `spec/redis_test.js`, `spec/slack_test.js` — standalone smoke scripts (not loaded by Jasmine).

## Mocking

**Framework:** None — Jasmine spies are not in use. Real services are run in Docker for integration specs (Redis, CouchDB, Mosquitto, transformer, worker), and lightweight inline mock objects (plain `{}` literals with stubbed methods) are constructed for unit specs.

**Inline mocks for unit tests:**

```javascript
// spec/jasmine/UtilSpec.js:35-46
it("should respond to request", function (done) {
    let res = { object: true };
    res.end = (body) => {
        expect(body).to.be.a('string');
        done();
    };
    res.header = (arg1, _arg2) => {
        expect(arg1).to.equal('Content-Type');
    };
    Util.responder(res, true, "message");
});
```

`req` and `res` are hand-built objects with only the methods/fields the code under test touches. Same pattern is used for `req.session.destroy` stubs (`UtilSpec.js:29`).

**What is NOT mocked (intentionally):**
- Redis — `redis_client` from the real `redis` npm package; `await redis_base.connect()` against the dockerized broker. See `spec/jasmine/DeviceSpec.js:14-21`.
- CouchDB via `nano` — real DB instance brought up by `docker-compose.test.yml`.
- MQTT broker — real Mosquitto.
- The full Express app — bootstrapped via `new THiNX(); thx.init(done)` so every middleware, route, and DB connection participates.

**What CAN be safely mocked:**
- `req`/`res` for static `Util` helpers and pure functions in `sanitka.js`, `validator.js`, `json2h.js`.
- Filesystem operations only when the test does not exercise a code path that walks `/mnt/data` (otherwise the `spec/mnt/data/*` fixtures already provide the layout).

## Coverage

**Tooling:** `nyc` (default config; no `.nycrc`). Run via `npm run jasmine` or `npm run dev`.

**Output:**
- `coverage/lcov.info` — uploaded to Coveralls when `COVERALLS_REPO_TOKEN` is present.
- `coverage/` directory stored as a CircleCI artifact at `./coverage` with destination `jest-coverage` (`.circleci/config.yml:313-316`).

**Threshold:** None enforced by `nyc` directly. `scripts/metrics-coverage.js` provides an optional gate (see `MetricsCoverageSpec.js:88,97`): exits 0 with no threshold set, non-zero when a configured threshold exceeds actual coverage. The threshold is set externally (env var / CLI flag) — not currently wired into the CircleCI workflow.

**View locally:**
```bash
npm run jasmine                                # produces coverage/
nyc report --reporter=text-lcov > lcov.info    # explicit lcov
```

## Test Types

**Unit tests (`<Name>Spec.js`):** Construct the domain class directly with a real Redis client (or hand-built mocks for pure-function helpers). Examples: `DeviceSpec.js`, `UtilSpec.js`, `SanitkaSpec.js`, `ValidatorSpec.js`, `JSON2HSpec.js`.

**Component / DB-touching specs (`00-*`, `02-*`, `03-*`):** Run early to set up the database, seed an owner (`02-OwnerSpec.js`), generate the RSA key fixtures (`03-RsakeySpec.js`), etc. Subsequent specs depend on this state.

**Integration / router specs (`ZZ-Router*Spec.js`):** Bring up the full THiNX Express app via `bootstrap.thx` and hit it with `chai.request(thx.app)`. Cover auth/no-auth matrices, request validation, and the JSON envelope contract.

**E2E:** None at this level. Browser-level E2E lives in `services/console/cypress/` and is out of scope.

## Common Patterns

**Async testing (done-callback):**

```javascript
it("GET /api/user/devices (noauth)", function (done) {
    chai.request(thx.app)
        .get('/api/user/devices')
        .end((err, res) => {
            expect(res.status).to.equal(401);
            done();
        });
}, 30000);
```

**Async testing (async/await for direct class calls):**

```javascript
// spec/jasmine/DeviceSpec.js:14-21
beforeAll(async () => {
    console.log(`🚸 [chai] >>> running Device spec`);
    const redis_base = redis_client.createClient(Globals.redis_options());
    await redis_base.connect();
    redis = redis_base.legacy();
    device = new Device(redis);
    APIKey = new ApiKey(redis);
});
```

Note: `redis_base.legacy()` returns a callback-style client because the production code (e.g. `lib/thinx/device.js:53`) is still callback-based. New tests that touch Redis MUST go through `.legacy()` until the lib is migrated to promise-based Redis.

**Error / 401 / 404 / 403 assertion:** Most negative-path tests assert only `res.status` and skip body inspection. When the body shape matters, assert the exact envelope string.

**Skipped tests (`xit` / `xdescribe`):** 2 skipped specs exist intentionally:
- `spec/jasmine/00-AppSpec.js:144` — `xit("/api/logout (without session)", ...)` — pending logout-flow refactor.
- `spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js:244` — `xit("DELETE /api/v2/user", ...)` — pending GDPR delete-account hardening.

Do not unskip without addressing the underlying TODO.

**Console markers:** Every spec emits `🚸 [chai] >>> running <Name> spec` in `beforeAll` and `🚸 [chai] <<< completed <Name> spec` in `afterAll`. Match this pattern in new specs; CI log grep relies on it.

## CI Execution

- Job `test` in `.circleci/config.yml:129-316` runs inside `docker-compose.test.yml`:
  1. `docker compose up -d thinx-redis` (Redis first).
  2. `docker compose up -d mosquitto transformer worker couchdb` with `ENVIRONMENT=test`.
  3. `docker compose up --build api | tee -ia ./test.log` runs the actual specs.
  4. Success gate: `grep "specs, 0 failures" ./test.log` — if absent, the build fails.
- Test parallelism is set to `1` in CircleCI (`config.yml:142`) but `npm run split-tests` exists for the case where it is bumped to `2` (deletes `ZZ-*` on node 0, non-`ZZ-*` on node 1).
- Test results stored from `/mnt/data` (`config.yml:305-307`), coverage from `./coverage`.

## What's Covered vs Gaps

**Well covered:**
- Router request validation — every `ZZ-Router*Spec.js` covers no-auth (401), missing-body (400/`missing_*` envelope), and cookie-only (no JWT) variants of every route in its peer `lib/router.<feature>.js`.
- Login / session bootstrap — `ZZ-AppSession.js` exercises the valid-cookie path and the `agent` mechanism that downstream specs depend on.
- Util / Sanitka / Validator / JSON2H — small surface, exercised by their dedicated `*Spec.js` files with hand-built `req`/`res` mocks.
- Owner creation, API key issuance, RSA key generation — the `00-`/`02-`/`03-` specs run first and assert the DB seed paths.

**Known gaps / risk areas:**
- `lib/router.auth.js` OAuth code paths (`/oauth/github/login`, `/oauth/google/login`) are partly stubbed — `spec/mnt/data/conf/github-oauth.json` and `google-oauth.json` contain placeholder client ids/secrets, so the real OAuth round-trip is not exercised. `ZZ-RouterOAuthSpec.js` covers only entry-point status codes.
- WebSocket upgrade handling (`/<owner>` / `/<owner>/<timestamp>`) — no spec file targets the WS handshake directly. AGENTS.md L96-98 explicitly lists this as a known risk.
- `lib/router.gdpr.js` DELETE flow — partially covered (`GDPRSpec.js`), but `xit("DELETE /api/v2/user", ...)` in `ZZ-AppSessionUserV2DeleteSpec.js:244` documents the destructive-path gap.
- `lib/router.transfer.js` — covered by `ZZ-RouterTransferSpec.js` for the API surface, but the cross-owner state mutation paths rely on `envi.dynamic` ↔ `envi.dynamic2` and assume specific seed order; flakes here usually mean the seed step regressed.
- `lib/thinx/builder.js` / `XBuilderSpec.js` — long-running build pipeline tests; coverage is shallow because the underlying worker image is mocked.
- Stale-session bug class (see MEMORY.md `session-expiry-stale-localstorage`) — backend-side coverage exists in `ZZ-AppSession.js` but the localStorage interaction lives in the console frontend.
- Logging side-effects — `lib/thinx/logger.js` is exercised by `LoggerSpec.js` but the `statistics.js:parse_oid()` consumer is only smoke-tested.
- `lib/router.admin.js` — `AdminSpec.js` does not exist in `spec/jasmine/`; admin endpoints (user list, target_owner mutations at `lib/router.admin.js:14-55`) are not directly exercised by an integration spec at this time.

**Anti-patterns to avoid when adding tests:**
- Do not call `request.execute(thx.app)` — that is the chai-http v5 API and will not work against v4.
- Do not import via `import` — keep CommonJS `require`.
- Do not introduce sinon, jest, or other mocking frameworks; match the existing inline-object mock style.
- Do not set timeouts below 30000 ms on integration specs — CI cold-start frequently exceeds 10s for the first request.
- Do not mutate `spec/_envi.json` values in a test — use the `dynamic`/`dynamic2` slots for ephemeral identities, never `oid`/`udid`/`ak`.

---

*Testing analysis: 2026-05-26*
