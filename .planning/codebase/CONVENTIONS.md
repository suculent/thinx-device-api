# Coding Conventions

**Analysis Date:** 2026-05-26

> Scope: parent monorepo backend only (`lib/`, `thinx-core.js`, `scripts/`, `spec/`).
> Subservices (`services/console`, `services/worker`, `services/transformer`, `services/broker`)
> are explicitly excluded from ESLint (`eslint.config.js`) and are out of scope here.

## Naming Patterns

**Files:**
- HTTP routers: `lib/router.<feature>.js` — one per feature area. Examples: `lib/router.device.js`, `lib/router.deviceapi.js`, `lib/router.auth.js`, `lib/router.admin.js`, `lib/router.user.js`, `lib/router.apikey.js`, `lib/router.profile.js`, `lib/router.rsakey.js`, `lib/router.transfer.js`, `lib/router.build.js`, `lib/router.logs.js`, `lib/router.env.js`, `lib/router.gdpr.js`, `lib/router.mesh.js`, `lib/router.source.js`, `lib/router.github.js`, `lib/router.google.js`, `lib/router.slack.js`. Master mounter: `lib/router.js`.
- Domain classes: `lib/thinx/<noun>.js` — lowercase singular or plural noun matching the class. Examples: `lib/thinx/device.js` (`class Device`), `lib/thinx/devices.js` (`class Devices`), `lib/thinx/util.js` (`class Util`), `lib/thinx/owner.js`, `lib/thinx/auth.js`, `lib/thinx/builder.js`, `lib/thinx/buildlog.js`, `lib/thinx/messenger.js`, `lib/thinx/notifier.js`, `lib/thinx/queue.js`, `lib/thinx/sanitka.js`, `lib/thinx/validator.js`.
- Middleware: `lib/middleware/` (Express middleware composed in `thinx-core.js`).
- Tests: `spec/jasmine/<Name>Spec.js` for unit/component specs; `spec/jasmine/ZZ-Router<Feature>Spec.js` for end-to-end router integration specs (the `ZZ-` prefix exists so Jasmine runs them last after their dependencies are seeded).

**Classes:**
- PascalCase, declared with `module.exports = class Name { ... }` (no named-then-export pattern).
- See `lib/thinx/util.js:5`, `lib/thinx/device.js:39`, `lib/thinx/devices.js:27`, `lib/thinx/database.js:9`, `lib/thinx/owner.js:66`, `lib/thinx/notifier.js:14`.

**Functions:**
- Top-level route handlers inside router files: camelCase (`editDevice`, `listDevices`, `getDeviceDetail`, `pushConfiguration`). See `lib/router.device.js:15-97`.
- Instance methods on domain classes: usually snake_case (`update_binary`, `update_multiple`, `run_transformers`, `storeOTT`) or camelCase. The codebase mixes both — match the surrounding file rather than forcing one style. `lib/thinx/device.js:50,84,120` shows both within the same file.
- Static helpers on `Util`: camelCase (`Util.responder`, `Util.failureResponse`, `Util.respond`, `Util.isDefined`, `Util.ownerFromRequest`, `Util.validateSession`).

**Variables:**
- Local variables: snake_case dominates (`owner_id`, `new_ott`, `body_string`, `db_uri`, `deploy_path`, `firmware_path`, `target_owner`). See `lib/thinx/device.js:51,52,102,106`.
- Imports/requires: PascalCase for classes (`const Util = require("./thinx/util")`), camelCase for libs (`const fs = require("fs-extra")`, `const md5 = require('md5')`).
- ESLint rule `camelcase` is explicitly disabled (`eslint.config.js:25`), so snake_case is intentional.

**HTTP/JSON fields (API surface):**
- snake_case throughout: `owner_id`, `api_key`, `udid`, `device_id`, `mac_addr`, `access_token`, `refresh_token`, `build_id`. Do NOT introduce camelCase JSON keys — clients depend on snake_case.

**Constants:**
- UPPER_SNAKE_CASE for module-level constants (`DATA_ROOT`, `STATS_DIR`, `LOG_FILE` in `lib/thinx/logger.js:18-20`; `SCRIPT` in `spec/jasmine/MetricsCoverageSpec.js:4`).

## Module System

- **CommonJS only.** Every file uses `require(...)` / `module.exports = ...`. ESM (`import`/`export`) is NOT used and MUST NOT be introduced — see AGENTS.md lines 83-92 which locks `chai-http` at v4 specifically because moving to v5 would force the whole stack to ESM.
- Class exports use the inline form `module.exports = class Name { ... }` (no separate `class Foo {}; module.exports = Foo;`).
- Singleton helpers are instantiated at require time when stateless: `const Sanitka = require("./sanitka"); let sanitka = new Sanitka();` (see `lib/thinx/devices.js:17`, `lib/thinx/device.js:21`, `lib/thinx/util.js:3`).
- File extensions in requires: optional and inconsistent (`require("./globals.js")` vs `require("./acl")`). Match the surrounding file.

## Variable Declarations

- `const` for imports and immutable references.
- `let` for mutable locals.
- `var` still appears in older spec files (`spec/jasmine/00-AppSpec.js`, `spec/jasmine/DeviceSpec.js:30-48`). Do not introduce new `var` in `lib/`; in specs match the file's style.

## Code Style

**Formatting:**
- No Prettier. No `.editorconfig` enforced.
- Indentation: 2 spaces in router files (`lib/router.*.js`), TABS in many `lib/thinx/*` domain classes (e.g. `lib/thinx/device.js`, `lib/thinx/devices.js`). ESLint rule `indent` is disabled (`eslint.config.js:19`). Match the file you are editing — do not retab.
- Semicolons: present everywhere. `semi` rule disabled, but always include them.
- Quotes: double quotes dominate in router files; single quotes appear in older specs. Either is accepted — rule disabled.
- Line length: no `max-len` cap.

**Linting:**
- `eslint.config.js` (flat config, ECMA `latest`, `sourceType: "script"`).
- Legacy `.eslintrc.js` extends `eslint:recommended` with the same overrides; kept for tooling that does not understand flat config.
- Almost every stylistic rule is disabled. The only actively enforced rule is `no-unused-vars` with `argsIgnorePattern: "^_"`, `varsIgnorePattern: "^_"`, `caughtErrorsIgnorePattern: "^_"` — prefix any intentionally unused arg with `_`. See `lib/router.device.js:34` (`(_success, response) => ...`), `lib/thinx/util.js:35,49` (`catch (_e)`).
- `.jshintrc` (legacy) just sets `"esversion": 8`.
- Lint command: `npm run lint` → `eslint ./`.
- Ignored by ESLint: `node_modules/**`, `**/*.min.js`, `services/console/**`, `services/broker/**`, `services/transformer/**`, `services/worker/**`, `spec/test_repositories/**`.

## Import Organization

**Order observed (not enforced):**
1. Globals/config (`require("./globals.js")`, `let app_config = Globals.app_config()`).
2. Node built-ins / `fs-extra` / `fs`.
3. Third-party libs (`nano`, `md5`, `sha256`, `crypto`, `uuid`, `axios`, etc.).
4. Internal `./thinx/*` domain classes.
5. Sibling utility `./util.js` (last so it can compose anything above).

**Path Aliases:**
- None. All requires use relative paths (`require("./thinx/util")`, `require("../../lib/thinx/device")`).

## Error Handling

The dominant pattern is callback-based with a `(success, message)` signature, surfaced over HTTP via the shared `Util` responder. Native promises / async-await are present in newer code paths (`influx.js`, `messenger.js`, `queue.js`, `statistics.js`, `plugins.js`, `oauth-github.js`) but the API surface is overwhelmingly callback-style.

**Shared response helpers (`lib/thinx/util.js`):**

```javascript
// 4xx/5xx with structured body — used 100+ times across lib/router.*.js
Util.failureResponse(res, 400, "missing_body");
Util.failureResponse(res, 500, "user_list_failed");
Util.failureResponse(res, 404, "target_not_found");

// 2xx envelope: { success: bool, response: <string|object> }
// Used 200+ times — primary response path for callbacks
device.edit(changes, (success, message) => {
    Util.responder(res, success, message);
});

// Raw object response (no envelope) — for buffers and pre-formed payloads
device.detail(udid, (_success, response) => {
    Util.respond(res, response);
});
```

**Route guard pattern (every route handler in `lib/router.*.js`):**

```javascript
function editDevice(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    if (!Util.isDefined(req.body)) return Util.responder(res, false, "missing_body");
    if (!Util.isDefined(req.body.changes)) return Util.responder(res, false, "missing_changes");
    let changes = req.body.changes;
    device.edit(changes, (success, message) => {
        Util.responder(res, success, message);
    });
}
```

See `lib/router.device.js:15-37`, `lib/router.admin.js:14-55`, `lib/router.logs.js:140-180` for canonical examples.

**Error reasons:** Use short snake_case strings (`"missing_body"`, `"invalid_credentials"`, `"redis_write_failed"`, `"target_not_found"`, `"udid_not_found"`, `"owner_not_found"`). Tests assert on exact strings — do not rephrase existing reasons.

**Callback signatures inside domain classes:**

```javascript
// lib/thinx/device.js:50
storeOTT(body, callback) {
    let body_string = JSON.stringify(body);
    let new_ott = sha256(new Date().toString());
    this.redis.set("ott:" + new_ott, body_string, () => {
        this.redis.expire("ott:" + new_ott, 86400);
        callback(true, { ott: new_ott });
    });
}
```

Always emit `(success: boolean, payload: string|object)`. Tests rely on this contract.

**Try/catch around JSON.stringify:** `Util.responder` wraps serialization in try/catch because circular structures otherwise crash the process (`lib/thinx/util.js:30-52`). When introducing new response paths, follow this — never call `JSON.stringify` on unknown nested input without a fallback.

**Session destruction on auth failure:** `Util.validateSession` calls `req.session.destroy()` when nothing matches (`lib/thinx/util.js:77`). Do not duplicate this in route handlers — let `validateSession` handle it.

**Caught errors:** Prefix with `_` if unused (`catch (_e)`), otherwise log via the emoji prefix scheme below.

## Logging

**Primary mechanism:** `console.log` with emoji prefixes. `console.log` count in `lib/`: ~810. ESLint `no-console` is disabled (`eslint.config.js:22`).

**Secondary mechanism:** Winston logger at `lib/thinx/logger.js` (60 lines). Used only by `lib/thinx/statistics.js` because statistics need a plain-text file transport at `warn+` level for the line parser in `statistics.js:parse_oid()` (see comment at `lib/thinx/logger.js:1-10`). Do NOT migrate existing `console.log` calls to Winston — the statistics parser would break.

**Emoji prefix scheme (~349 occurrences in `lib/`):**

| Prefix | Bracket tag | Level | Example |
|--------|-------------|-------|---------|
| `☣️` | `[error]` | Error | `console.log("☣️ [error] parsing Slack token");` |
| `⚠️` | `[warning]` | Warning | `console.log("⚠️ [warning] Overriding req.session.owner...");` |
| `ℹ️` | `[info]` | Info | `console.log(\`ℹ️ [info] [OID:${owner}] Logout action\`);` |
| `🔨` | `[debug]` | Debug | `console.log("🔨 [debug] [api/login] Pre-creating default mqtt key...");` |
| `🚫` | `[critical]` | Critical (often double-space after emoji) | `console.log("🚫 [critical] Database connectivity issue. " + err);` |
| `🚸` | `[chai]` | Test marker (specs only) | `console.log(\`🚸 [chai] >>> running Devices spec\`);` |

**Tag conventions inside log lines:**
- `[OID:${owner_id}]` — owner identifier, prepended to per-user actions. See `lib/router.profile.js:17,35`, `lib/router.auth.js:73,88,199,204`.
- `[NEW_SESSION]`, `[LOGIN_INVALID]`, `[BUILD_STARTED]` — UPPER_SNAKE bracket events, mainly in `lib/router.auth.js` and the build pipeline. These are consumed by `lib/thinx/statistics.js:parse_oid()`.
- File:line breadcrumbs in auth flow: `[router.auth.js:69]` — useful when the same event fires from multiple paths.

**Anti-patterns to avoid:**
- Bare `console.log("Login failed...")` with no emoji prefix exists in `lib/router.auth.js:45,72` and similar legacy spots. Do not propagate; new code should always use an emoji.
- Never log secrets, JWTs, full session payloads, passwords, or full `_envi.json` content. AGENTS.md scope guidance explicitly calls out that sensitive logging was previously stripped from the console frontend; same rule applies here.
- Avoid `console.log(err)` — always wrap with `"☣️ [error] ${context}: " + err.toString()` so emoji classification is preserved.

## Response Envelope Contract

The API uses a uniform JSON envelope:

```json
{ "success": true|false, "response": <string|object> }
```

`Util.responder` emits this. Tests assert against the exact serialized form (see `spec/jasmine/00-AppSpec.js:93,109,124,139`: `'{"success":false,"response":"invalid_credentials"}'`). Do not reorder keys, add fields, or wrap differently.

Exceptions (legitimate non-envelope responses):
- Buffer downloads (firmware binaries) — `Content-Type: application/octet-stream` via `Util.respond` when message `typeof === "buffer"`.
- Healthcheck `GET /` returns `{"healthcheck": true, ...}` directly.
- OAuth redirects return HTML / 302s.

## Route Registration Pattern

Every router file is a function that takes `app` and registers Express routes:

```javascript
// lib/router.device.js
module.exports = function (app) {
    const devices = new Devices(app.messenger, app.redis_client);
    const device = app.device;

    function listDevices(req, res) { /* ... */ }

    app.get("/api/v2/device", function (req, res) {
        listDevices(req, res);
    });
};
```

Mounted from `lib/router.js`. Shared singletons (`app.device`, `app.messenger`, `app.redis_client`) are attached in `thinx-core.js` during init.

## Class Conventions

- Constructors validate critical dependencies and throw:
  ```javascript
  // lib/thinx/device.js:41
  constructor(redis) {
      if (typeof(redis) === "undefined") throw new Error("Device now requires connected redis.");
      this.redis = redis;
      // ...
  }
  ```
- Instance state lives on `this.*`, set in the constructor.
- Private/internal methods are not marked syntactically — there is no `#private` usage. Document intent with a `// private` comment as in `lib/thinx/device.js:49`.
- Avoid arrow methods on classes; use regular method syntax so `this` binds normally and method names appear in stack traces.

## Comments

**When to comment:**
- File headers: short single-line JSDoc summarising the module's role (`lib/thinx/device.js:1`, `lib/thinx/devices.js:1`).
- Section dividers inside long files: `/////////////////` block with a tag like `// DEVICE ROUTES` or `// API ROUTES v2`. See `lib/router.device.js:7,142`, `lib/thinx/util.js:7`.
- Inline `// TODO`, `// FIXME`, `// XXX` for follow-ups. `// deepcode ignore <rule>:` to suppress static-analysis findings (`lib/thinx/device.js:10`).
- `// potential problem with this...` style explanatory comments are accepted (`lib/thinx/devices.js:20`); they document known refactor debt.

**JSDoc:** Not enforced. Some files use single-line `/** ... */` headers; full JSDoc on functions is rare and not required.

## Function Design

- **Size:** Router handler functions stay small (10-30 lines): guard, sanitize, delegate to domain class, respond via callback. Domain class methods can be larger but should still be focused.
- **Parameters:** When a function takes a callback, it is the LAST parameter — `(args..., callback)`. Sanitka/Util static methods take `(res, ...)` first because they are response-oriented.
- **Return values:** Route handlers return early via `return res.status(N).end()` or `return Util.failureResponse(...)`. Always `return` from guard checks so subsequent statements do not execute.

## Sanitization

`lib/thinx/sanitka.js` is the canonical input sanitizer. Call it on every user-supplied identifier before using it in queries, file paths, or shell commands:

```javascript
let udid = sanitka.udid(req.body.udid);
if (udid === null) return res.status(403).end();
let owner = sanitka.owner(req.session.owner);
```

Used 50+ times across `lib/router.*.js`. Do not bypass it, do not write inline regex sanitization in routers.

## File Organization Rules

- `lib/router.<feature>.js` — only HTTP wiring, parameter validation, and delegation to `lib/thinx/<feature>.js`. No business logic.
- `lib/thinx/<noun>.js` — domain logic, DB access (via `nano` for CouchDB, `redis` client), no Express references except passing-through.
- `lib/middleware/` — Express middleware only.
- `thinx-core.js` (project root) — composition root: builds the Express `app`, attaches singletons, mounts every router via `lib/router.js`.
- `scripts/` — operational/CI scripts (`metrics-coverage.js`, `normalize-commit-msg.js`, `set-admin.sh`, `stack-deploy`, `99-sonar.sh`).

## Module-Level State (be careful)

Several `lib/thinx/*.js` modules instantiate singletons at require time. These are evaluated once per process:

```javascript
// lib/thinx/devices.js:11,13,15,17
const AuditLog = require("./audit"); let alog = new AuditLog();
const Deployment = require("./deployment"); let deploy = new Deployment();
const Git = require("./git"); let git = new Git();
const Sanitka = require("./sanitka"); let sanitka = new Sanitka();

// Database/CouchDB binding evaluated at require time:
let db_uri = new Database().uri();
let devicelib = require("nano")(db_uri).use(prefix + "managed_devices");
```

Implication: if a domain class depends on Redis/CouchDB being available before being required, the test bootstrap must wait. See `spec/helpers/bootstrap.js` — it constructs `THiNX` and awaits init before any spec body runs.

## Commit Messages

`commitlint.config.js` extends `@commitlint/config-conventional` with these allowed types:
`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`, `audit`. Subject case is unconstrained.

Linting: `npm run lint:commit` (HEAD~1..HEAD). Pre-commit hook lives at `.githooks/prepare-commit-msg` — enabled with `npm run setup:hooks`.

## CI / Build

- CircleCI config: `.circleci/config.yml`. Tests run inside `docker compose -f docker-compose.test.yml` against Redis + CouchDB + Mosquitto + transformer + worker spun up in the same job (`.circleci/config.yml:270-295`).
- `ENVIRONMENT=test` is set in CI; many code paths in `thinx-core.js` and `lib/thinx/globals.js` branch on `process.env.ENVIRONMENT` (`thinx-core.js:89,114,133,138,239,324,396,641`).
- Coverage: `nyc` wraps `jasmine`. `npm test` runs `mkdir -p coverage; jasmine; ...nyc report → coveralls`. The `coverage/` directory at the repo root holds output.
- Test split: `npm run split-tests` partitions specs across two CircleCI nodes by deleting `ZZ-*` on index 0 and non-`ZZ-*` on index 1 — invoked only when `CIRCLE_NODE_INDEX` is set.

## Dependency Locks (DO NOT BUMP)

Per AGENTS.md (parent root) lines 81-93:

- **`chai-http` pinned at `^4.3.0`.** Do not move to v5.x — v5 is ESM-only and removes `chai.request(app)`. Upgrade would require converting 16 `ZZ-*` specs to ESM and renaming ~200 `chai.request(thx.app)` / 14 `chai.request.agent(app)` call sites.
- Trigger to reconsider: CVE in transitive `superagent` v3 only.
- `chai` is pinned at `4.5.0` (chai v5 is also ESM-only).
- `node` engine: `>=19.x` (`package.json:158`).
- `packageManager`: `yarn@1.22.22` declared in `package.json:170`, but the actual workflow uses `npm` (`npm test`, `npm run lint`, `npm run jasmine`). Treat the yarn field as historical; use `npm`.

---

*Convention analysis: 2026-05-26*
