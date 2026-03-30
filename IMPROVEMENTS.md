# Planned Improvements Backlog

This document tracks prioritized improvement ideas for the `thinx-device-api` Node.js IoT backend.
Analysis performed on the current codebase (~11K LOC across 62+ library files, 55 Jasmine test specs).

---

## High Priority

### 1. Replace `console.log` with a Structured Logger
**Effort:** Medium (2–3 days)

The codebase contains **792 `console.log` calls** across **49 files** in `lib/`. This makes it impossible to control log levels in production, route logs to aggregation services (e.g., Loki, Datadog), or filter noise from signal.

**Recommendation:** Adopt [Winston](https://github.com/winstonjs/winston) or [Pino](https://getpino.io/) with a shared logger instance exported from `lib/thinx/globals.js`. Replace all `console.log/warn/error` calls with `logger.info/warn/error`.

**Benefits:**
- Configurable log levels per environment (`DEBUG` in dev, `WARN` in prod)
- Structured JSON output for log aggregation
- Correlation IDs per request for tracing

---

### 2. Fix Potential Command Injection in `builder.js`
**Effort:** Small (1 day)

`lib/thinx/builder.js` builds shell commands by directly string-concatenating user-supplied values (e.g., `stringVars`, paths) into `CMD` strings that are passed to `exec.spawn(..., { shell: true })`. The codebase itself contains a suppression comment: `// lgtm [js/command-line-injection]`.

**Recommendation:**
- Use `shell-escape` (already a dependency) consistently for all user-controlled values inserted into shell commands
- Prefer `exec.spawn(cmd, args[])` over `{ shell: true }` with interpolated strings where possible
- Audit `exec.execSync` calls at lines 385, 412, 741, 742 for unsanitized path interpolation

**Risks if unaddressed:** Remote code execution if any build parameter originates from user input without sanitization.

---

### 3. Update Critical Outdated Dependencies
**Effort:** Medium (1–2 days per major update)
**Status:** Completed.

Several dependencies were significantly behind their latest versions, with potential security implications. The repo now includes the Redis 5 / `connect-redis@9` refresh, `bcrypt@^6.0.0`, `base-64@^1.0.0`, and the other safe updates in both the root manifest and the `base` image manifest. The Redis migration was validated by CircleCI pipeline `5136` on `thinx-staging`, with `test`, `build-vue-console`, `build-console-classic`, and `build-api-cloud` all passing.

**Recommendation:** Keep the completed dependency refresh in place, continue to pin `chai` at `4.5.0` until the test suite is migrated to the newer API, and use `npm audit` regularly.

---

### 4. Migrate from Callback-Heavy Code to Async/Await
**Effort:** Large (1–2 weeks)

The codebase has **742 callback usages** (`callback`, `cb)`) but only ~39 `async` function declarations. The `.then()` pattern appears in 29 places, and the predominant style is nested callback chains, making error handling fragile and code hard to follow.

**Recommendation:** Incrementally migrate starting with the most-tested and highest-impact modules:
1. `lib/thinx/apikey.js` (307 LOC, well-isolated)
2. `lib/thinx/rsakey.js`
3. `lib/thinx/deployment.js`

Use `util.promisify` for Node core callbacks and wrap CouchDB (`nano`) calls with async wrappers.

**Benefits:**
- Simpler error propagation via `try/catch`
- Eliminates deeply nested "callback pyramids"
- Easier unit testing

---

### 5. Strengthen Error Handling
**Effort:** Medium (2–3 days)

There are only **58 `try` blocks** and **81 `catch` blocks** across the entire `lib/thinx/` directory. Many async operations (CouchDB queries, Redis calls, file operations) lack proper error handling, leading to unhandled promise rejections or silent failures. Neither `thinx.js` nor `thinx-core.js` register global process-level error handlers, so unhandled rejections crash or silently disappear.

**Recommendation:**
- Add a centralized Express error-handling middleware (e.g., in `thinx-core.js`) that catches unhandled errors and returns consistent JSON error responses
- Add `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` handlers in `thinx.js` entry point — wire them to the existing Rollbar integration in `lib/thinx/globals.js`
- Wrap all external I/O calls in `try/catch` blocks systematically

---

### 6. Resolve Hardcoded RSA Key Passphrase
**Effort:** Small (half day)

`lib/thinx/rsakey.js:130` contains a hardcoded passphrase `'thinx'` for RSA key encryption with a TODO comment acknowledging the issue:
```js
passphrase: 'thinx' // TODO: once we'll have Secure Storage (e.g. Vault), keys can be encrypted...
```

**Recommendation:**
- Read the passphrase from an environment variable (e.g., `process.env.RSA_KEY_PASSPHRASE`) with a documented fallback strategy
- Consider integrating with HashiCorp Vault or AWS Secrets Manager for secret management (already referenced in the TODO)
- Rotate any keys encrypted with the current hardcoded passphrase after the fix

**Risks if unaddressed:** Anyone with read access to the source code can decrypt private RSA keys stored on disk.

---

## Medium Priority

### 7. Reduce Unrealistic 99% Test Coverage Threshold
**Effort:** Small (1 hour)

`package.json` (nyc config) sets coverage thresholds at **99% for lines, statements, functions, and branches** per-file. This is essentially unachievable in practice and causes CI to fail on legitimate code additions.

**Current config:**
```json
"nyc": {
  "check-coverage": true,
  "per-file": true,
  "lines": 99,
  "statements": 99,
  "functions": 99,
  "branches": 99
}
```

**Recommendation:** Lower thresholds to 80–85% overall (not per-file), which is an industry-standard target that still incentivizes good coverage without blocking development:
```json
"lines": 80,
"statements": 80,
"functions": 80,
"branches": 75
```

---

### 8. Enable Stricter ESLint Rules Incrementally
**Effort:** Small–Medium (1–2 days)

The current `.eslintrc.js` disables nearly all rules, including critical ones:
- `"eqeqeq": 0` — allows `==` instead of `===` (type coercion bugs)
- `"no-undef": 0` — allows use of undeclared variables
- `"no-console": 0` — disables the console check (counterpart to improvement #1)

**Recommendation:** Enable rules incrementally, fixing violations in batches:
1. Enable `eqeqeq` first (easy auto-fix)
2. Enable `no-undef` to catch accidental globals
3. Enable `no-console` after structured logger is in place (improvement #1)
4. Consider migrating to ESLint flat config format (required for ESLint 10+)

---

### 9. ~~Add OpenAPI/Swagger Specification~~ ✅ Implemented

**Implemented:** `thinx-api-openapi.yaml` created with 45 endpoints covering all v2 API routes (devices, auth, users, GDPR, mesh, RSA keys, logs, sources, transfer, OAuth, Slack). Served at `GET /api/v2/spec` via `lib/router.js`.

**Remaining (optional):** Host Swagger UI at `/api/docs` (e.g. via `swagger-ui-express`) for browser-based exploration.

---

### 10. Per-Endpoint Rate Limiting for Auth Routes
**Effort:** Small (half day)

`thinx-core.js` applies a single global rate limiter (500 req/min) to all routes, but only in non-test environments. Sensitive authentication endpoints (`/api/login`, `/api/register`, `/api/password`) need significantly tighter limits to prevent brute-force and credential-stuffing attacks.

**Recommendation:**
- Apply a strict secondary limiter (e.g., 10 req/min) specifically to auth, password-reset, and registration routes before the global limiter
- Consider `express-slow-down` for a softer degradation approach on login attempts
- Ensure rate limiting is tested (currently skipped in the test environment)

---

### 11. Add JSDoc Type Annotations to Public APIs
**Effort:** Medium (3–5 days)

The codebase has **fewer than 60 JSDoc annotations** across all `lib/thinx/` files. Public-facing module methods (especially in `device.js`, `owner.js`, `builder.js`) have no type documentation.

**Recommendation:** Add `@param`, `@returns`, and `@typedef` annotations to all exported functions in the top-5 largest modules:
- `lib/thinx/device.js` (1487 LOC)
- `lib/thinx/builder.js` (1143 LOC)
- `lib/thinx/owner.js` (1099 LOC)
- `lib/thinx/messenger.js` (910 LOC)
- `lib/thinx/transfer.js` (601 LOC)

**Benefits:** Better IDE support, enables TypeScript migration path, documents API contracts.

---

## Low Priority

### 12. Eliminate Hardcoded Test Credentials
**Effort:** Small (half day)

`spec/_envi.json` contains hardcoded owner IDs, API keys, session IDs, and email addresses. While these appear to be test fixtures, they establish a pattern that can bleed into actual credential leakage in CI logs or accidental commits.

**Recommendation:**
- Move sensitive test fixture values to environment variables with `.env.test` loading (e.g., via `dotenv`)
- Add `spec/_envi.json` to `.gitignore` and provide `spec/_envi.json.example` with placeholder values
- Validate that no real credentials are embedded in test files

---

### 13. Add Pre-Commit Hooks via Husky
**Effort:** Small (2–4 hours)

There are no pre-commit hooks configured. Developers can commit code that fails linting or tests without any friction point.

**Recommendation:** Add `husky` and `lint-staged`:
```bash
npm install --save-dev husky lint-staged
npx husky init
```

Configure `.husky/pre-commit`:
```bash
npx lint-staged
```

And `package.json`:
```json
"lint-staged": {
  "lib/**/*.js": ["eslint --fix", "git add"],
  "spec/**/*.js": ["eslint --fix", "git add"]
}
```

**Benefits:** Prevents lint regressions from being committed, enforces code quality at the source.

---

### 14. Parallelize Jasmine Test Suite
**Effort:** Small–Medium (1 day)

`spec/support/jasmine.json` runs all 55 test files sequentially (`"random": false`, `"timeout": 10000`). With many integration-style tests that await I/O (CouchDB, Redis, MQTT), sequential execution significantly inflates total CI run time.

**Recommendation:**
- Evaluate [`jasmine-parallel`](https://www.npmjs.com/package/jasmine-parallel) or switch to [Jest](https://jestjs.io/) which has native worker-based parallelism
- Group tests by dependency (unit tests in one worker, integration tests in another) to avoid port conflicts
- Set `"random": true` to detect hidden test-order dependencies before parallelizing

---

### 15. Pin and Upgrade Docker Base Image
**Effort:** Small (2–4 hours)

`Dockerfile` uses `FROM thinxcloud/base:alpine` with no version pin. This means the build is non-reproducible and could silently pull a different base in CI or production. Additionally, `docker-compose.yml` uses Compose file format `version: '2.2'` which is deprecated.

**Recommendation:**
- Pin the base image to a specific digest or tag (e.g., `thinxcloud/base:alpine-1.2.3@sha256:...`)
- Add a health check for the main API service in `docker-compose.yml` (currently only `couchdb` has one):
  ```yaml
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:7442/api/v2/status"]
    interval: 30s
    timeout: 10s
    retries: 3
  ```
- Upgrade `docker-compose.yml` to Compose V2 format (remove the `version:` key)

---

### 16. Resolve TODO/FIXME Debt
**Effort:** Medium (2–3 days)

There are **17 `TODO`/`FIXME` comments** in `lib/`, several with security or correctness implications:

| File | Issue |
|---|---|
| `lib/thinx/notifier.js:29,37,45` | Slack channel `#thinx` hardcoded instead of from config |
| `lib/thinx/rsakey.js:130` | Hardcoded passphrase (see improvement #6) |
| `lib/thinx/transfer.js:278` | Transfer code not using promises — may silently fail |
| `lib/thinx/queue.js:170` | External variable `limit` usage described as "ugly and wrong" |
| `lib/router.js:109` | `403` should be `401` for unauthenticated requests |
| `lib/router.slack.js:27` | Slack OAuth code not validated before use |

**Recommendation:** Triage each TODO into a tracked issue or fix it. At minimum, address the security-relevant items (`notifier.js` channel config, `transfer.js` promise conversion, Slack code validation) in one pass.

---

## Summary Table

| # | Improvement | Priority | Effort | Impact |
|---|---|---|---|---|
| 1 | Structured logging (replace console.log) | High | Medium | Observability |
| 2 | Fix command injection in builder.js | High | Small | Security |
| 3 | Update outdated dependencies | High | Medium | Security/Stability |
| 4 | Migrate callbacks to async/await | High | Large | Maintainability |
| 5 | Strengthen error handling + process handlers | High | Medium | Reliability |
| 6 | Resolve hardcoded RSA key passphrase | High | Small | Security |
| 7 | Reduce 99% coverage threshold | Medium | Small | Developer Experience |
| 8 | Enable stricter ESLint rules | Medium | Medium | Code Quality |
| 9 | ~~Add OpenAPI/Swagger specification~~ ✅ | ~~Medium~~ | ~~Medium~~ | Done |
| 10 | Per-endpoint rate limiting for auth routes | Medium | Small | Security |
| 11 | Add JSDoc type annotations | Medium | Medium | Maintainability |
| 12 | Eliminate hardcoded test credentials | Low | Small | Security hygiene |
| 13 | Add pre-commit hooks (husky) | Low | Small | Developer Experience |
| 14 | Parallelize Jasmine test suite | Low | Small | Developer Experience |
| 15 | Pin/upgrade Docker base image + healthcheck | Low | Small | DevOps/Reliability |
| 16 | Resolve TODO/FIXME debt | Low | Medium | Code Quality |
