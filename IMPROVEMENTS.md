# Planned Improvements Backlog

This document tracks prioritized improvement ideas for the `thinx-device-api` Node.js IoT backend.
Analysis performed on the current codebase (~11K LOC across 62+ library files, 55 Jasmine test specs).

---

## High Priority

### 1. Replace `console.log` with a Structured Logger
**Effort:** Medium (2–3 days)
**Owner:** THiNX backend maintainers
**Status:** Open
**Next action:** Choose Pino or Winston, then migrate one backend module as the
first reviewable slice.

The codebase contains **792 `console.log` calls** across **49 files** in `lib/`. This makes it impossible to control log levels in production, route logs to aggregation services (e.g., Loki, Datadog), or filter noise from signal.

**Recommendation:** Adopt [Winston](https://github.com/winstonjs/winston) or [Pino](https://getpino.io/) with a shared logger instance exported from `lib/thinx/globals.js`. Replace all `console.log/warn/error` calls with `logger.info/warn/error`.

**Benefits:**
- Configurable log levels per environment (`DEBUG` in dev, `WARN` in prod)
- Structured JSON output for log aggregation
- Correlation IDs per request for tracing

**Scope boundaries:**
- Cover application code under `lib/` first; generated assets and vendored frontend
  libraries are out of scope.
- Preserve current log messages where they are useful, but redact credentials,
  tokens, session IDs, API keys, and request bodies that may contain secrets.
- Do not change request handling, build behavior, or deployment configuration
  beyond logger wiring.

**Acceptance criteria:**
- A shared logger module is available to backend modules with documented
  environment-based log level configuration.
- Direct `console.log`, `console.warn`, and `console.error` calls are removed
  from the scoped backend modules or explicitly justified in code review.
- Request-scoped logs include a stable correlation identifier when one is
  available.
- Production defaults avoid debug-level output and secret-bearing fields.

**Validation steps:**
- Run `npm test`.
- Run `npm run lint` after the logger migration and ESLint configuration agree
  on intentional logger usage.
- Smoke-test `GET /api/v2/status` and one authenticated route, then confirm
  logs are structured JSON and do not expose credentials.

**Risks and implementation notes:**
- Logging changes can accidentally remove operational signals; migrate in small
  module batches and compare before/after log volume.
- Treat any newly discovered secret logging as a security bug, not as a logging
  cleanup detail.

---

### 2. ~~Fix Potential Command Injection in `builder.js`~~ ✅ Implemented
**Effort:** Small (1 day)
**Owner:** THiNX backend maintainers
**Status:** Completed.
**Next action:** Keep argument-array execution as the default and require
security review for any future shell execution in build paths.

The risky shell construction in [lib/thinx/builder.js](/Users/igraczech/Repositories/thinx-device-api/lib/thinx/builder.js) has been reduced substantially. Local builder execution now uses `spawn(cmd, args)` without `{ shell: true }`, Git metadata lookups use `execFileSync("git", args, { cwd })`, and public source prefetch now runs structured Git commands instead of interpolated shell strings. The remaining worker-side command string is built through `shell-escape`, and invalid sanitized Git URL or branch values now fail early instead of being passed through to shell execution.

**Validation:** CircleCI pipeline `5142` on `thinx-staging` passed with `test`, `build-vue-console`, `build-console-classic`, and `build-api-cloud` all green.

**Recommendation:** Keep new builder command execution on argument arrays by default, and treat any future `{ shell: true }` usage in build or deployment paths as a security review trigger.

---

### 3. Update Critical Outdated Dependencies
**Effort:** Medium (1–2 days per major update)
**Owner:** THiNX backend maintainers
**Status:** Completed.
**Next action:** Continue routine dependency review and keep the documented
`chai` version lock until the test suite is migrated.

Several dependencies were significantly behind their latest versions, with potential security implications. The repo now includes the Redis 5 / `connect-redis@9` refresh, `bcrypt@^6.0.0`, `base-64@^1.0.0`, and the other safe updates in both the root manifest and the `base` image manifest. The Redis migration was validated by CircleCI pipeline `5136` on `thinx-staging`, with `test`, `build-vue-console`, `build-console-classic`, and `build-api-cloud` all passing.

**Recommendation:** Keep the completed dependency refresh in place, continue to pin `chai` at `4.5.0` until the test suite is migrated to the newer API, and use `npm audit` regularly.

---

### 4. Migrate from Callback-Heavy Code to Async/Await
**Effort:** Large (1–2 weeks)
**Owner:** THiNX backend maintainers
**Status:** Open
**Next action:** Convert `lib/thinx/apikey.js` first while preserving the
current CommonJS exports and callback-compatible caller behavior.

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

**Scope boundaries:**
- Start with one module per PR and keep exported CommonJS APIs compatible.
- Do not combine async migration with unrelated validation, schema, or route
  behavior changes.
- Keep callback adapters where callers still depend on callback signatures.

**Acceptance criteria:**
- The selected module uses `async`/`await` internally for CouchDB, Redis, file
  system, and crypto operations where practical.
- Existing callers continue to receive the same success and error shapes.
- Tests cover at least one successful path and one failure path through each
  converted async boundary.
- No unhandled promise rejections are introduced during the module test run.

**Validation steps:**
- Run the focused Jasmine specs for the converted module.
- Run `npm test` before merging the first module conversion in each batch.
- Exercise the corresponding API route or build path manually when the module
  is used by request handling.

**Risks and implementation notes:**
- `nano` and Redis callback semantics may not map one-to-one to promises; wrap
  them behind local helpers before changing business logic.
- Avoid converting broad dependency chains in one PR unless the tests already
  isolate the full path.

---

### 5. Strengthen Error Handling
**Effort:** Medium (2–3 days)
**Owner:** THiNX backend maintainers
**Status:** Open
**Next action:** Define the shared JSON error envelope, then add Express error
middleware and process-level rejection reporting in a focused PR.

There are only **58 `try` blocks** and **81 `catch` blocks** across the entire `lib/thinx/` directory. Many async operations (CouchDB queries, Redis calls, file operations) lack proper error handling, leading to unhandled promise rejections or silent failures. Neither `thinx.js` nor `thinx-core.js` register global process-level error handlers, so unhandled rejections crash or silently disappear.

**Recommendation:**
- Add a centralized Express error-handling middleware (e.g., in `thinx-core.js`) that catches unhandled errors and returns consistent JSON error responses
- Add `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` handlers in `thinx.js` entry point — wire them to the existing Rollbar integration in `lib/thinx/globals.js`
- Wrap all external I/O calls in `try/catch` blocks systematically

**Scope boundaries:**
- Define shared error response behavior first, then migrate high-risk routes and
  background workers incrementally.
- Do not mask authentication or authorization failures behind generic `500`
  responses.
- Keep public response bodies free of stack traces and internal service names.

**Acceptance criteria:**
- Express has a final error middleware that returns a consistent JSON envelope
  with appropriate HTTP status codes.
- Process-level rejection and exception handlers report through the existing
  Rollbar integration and log enough context to diagnose the failure.
- External I/O failures in the first migrated route group are handled with
  explicit user-facing status codes and internal diagnostic logs.
- Tests assert the JSON shape for at least one validation error, one auth error,
  and one unexpected server error.

**Validation steps:**
- Run `npm test`.
- Add or run focused route tests that force CouchDB or Redis failure paths.
- Manually trigger a rejected promise in a non-production environment and verify
  Rollbar/log reporting without exposing secrets.

**Risks and implementation notes:**
- Global handlers can hide crash loops if they only log and continue; define
  when the process should exit after an unrecoverable exception.
- Error response normalization may affect clients that depend on legacy body
  shapes, so document any intentional response contract changes.

---

### 6. Resolve Hardcoded RSA Key Passphrase
**Effort:** Small (half day)
**Owner:** THiNX security/backend maintainers
**Status:** Open
**Next action:** Define the runtime configuration key, production fallback
policy, and existing-key migration or rotation plan before changing code.

`lib/thinx/rsakey.js:130` contains a hardcoded passphrase `'thinx'` for RSA key encryption and an inline note that key encryption should move to secure storage:
```js
passphrase: 'thinx'
```

**Recommendation:**
- Read the passphrase from an environment variable (e.g., `process.env.RSA_KEY_PASSPHRASE`) with a documented fallback strategy
- Consider integrating with HashiCorp Vault or AWS Secrets Manager for secret management
- Rotate any keys encrypted with the current hardcoded passphrase after the fix

**Risks if unaddressed:** Anyone with read access to the source code can decrypt private RSA keys stored on disk.

**Scope boundaries:**
- Replace the source literal with configuration loading and clear startup
  validation.
- Do not silently re-encrypt existing keys in the same change unless a migration
  plan and rollback path are documented.
- Keep local test fixtures deterministic without using production secrets.

**Acceptance criteria:**
- Runtime RSA key encryption reads the passphrase from configuration or a secret
  provider.
- Missing production configuration fails fast with a clear startup error.
- Test and development environments use an explicit documented fixture value.
- A key rotation or re-encryption plan exists for keys protected by the old
  literal passphrase.

**Validation steps:**
- Run the RSA key Jasmine specs.
- Run `npm test`.
- Start the API once with the passphrase configured and once without it in a
  production-like environment to verify startup behavior.

**Risks and implementation notes:**
- Changing the passphrase without migrating stored keys can make existing
  private keys unreadable.
- Avoid logging the configured secret or derived key material during validation.

---

## Medium Priority

### 7. ~~Reduce Unrealistic 99% Test Coverage Threshold~~ ✅ Implemented
**Effort:** Small (1 hour)
**Owner:** THiNX backend maintainers
**Status:** Completed.
**Next action:** Keep the overall thresholds unless test boundaries are split
into separate unit and integration gates.

The nyc config in [`.nycrc`](/Users/igraczech/Repositories/thinx-device-api/.nycrc) previously enforced **99% for lines, statements, functions, and branches** on a per-file basis. That is effectively a regression trap for normal maintenance work, so it has been replaced with an overall threshold that is still meaningful but realistic.

**Implemented config:**
```json
{
  "check-coverage": true,
  "per-file": false,
  "lines": 80,
  "statements": 80,
  "functions": 80,
  "branches": 75
}
```

**Recommendation:** Keep the lower overall thresholds in place unless the suite is restructured into clearer unit/integration boundaries with separate coverage gates.

---

### 8. Enable Stricter ESLint Rules Incrementally
**Effort:** Small–Medium (1–2 days)
**Owner:** THiNX backend maintainers
**Status:** Open
**Next action:** Enable `eqeqeq` for backend files first and submit the
mechanical fixes separately from behavior changes.

The current `.eslintrc.js` disables nearly all rules, including critical ones:
- `"eqeqeq": 0` — allows `==` instead of `===` (type coercion bugs)
- `"no-undef": 0` — allows use of undeclared variables
- `"no-console": 0` — disables the console check (counterpart to improvement #1)

**Recommendation:** Enable rules incrementally, fixing violations in batches:
1. Enable `eqeqeq` first (easy auto-fix)
2. Enable `no-undef` to catch accidental globals
3. Enable `no-console` after structured logger is in place (improvement #1)
4. Consider migrating to ESLint flat config format (required for ESLint 10+)

**Scope boundaries:**
- Enable one stricter rule per PR unless the violations are purely mechanical.
- Exclude generated, vendored, and legacy third-party frontend assets from the
  first backend linting pass.
- Keep formatting-only changes separate from behavior changes when possible.

**Acceptance criteria:**
- The selected rule is enabled in the active ESLint configuration.
- Existing violations for that rule are fixed or documented with narrow
  `eslint-disable` comments.
- CI runs the lint script or a documented equivalent before merge.

**Validation steps:**
- Run `npm run lint`.
- Run `npm test` when the lint fixes touch executable code.
- Review the diff for accidental formatting churn in unrelated files.

**Risks and implementation notes:**
- `no-undef` can surface implicit globals used by legacy browser code; scope the
  first pass to backend files or define browser globals explicitly.
- Enable `no-console` only after the structured logger task provides a supported
  replacement.

---

### 9. ~~Add OpenAPI/Swagger Specification~~ ✅ Implemented
**Effort:** Completed
**Owner:** THiNX API maintainers
**Status:** Completed with optional follow-up
**Next action:** Decide whether the optional Swagger UI route is worth adding
for browser-based API exploration.

**Implemented:** `thinx-api-openapi.yaml` created with 45 endpoints covering all v2 API routes (devices, auth, users, GDPR, mesh, RSA keys, logs, sources, transfer, OAuth, Slack). Served at `GET /api/v2/spec` via `lib/router.js`.

**Remaining (optional):** Host Swagger UI at `/api/docs` (e.g. via `swagger-ui-express`) for browser-based exploration.

---

### 10. Per-Endpoint Rate Limiting for Auth Routes
**Effort:** Small (half day)
**Owner:** THiNX security/backend maintainers
**Status:** Open
**Next action:** Define strict limits for login, registration, password reset,
and token exchange routes, including proxy-aware keying behavior.

`thinx-core.js` applies a single global rate limiter (500 req/min) to all routes, but only in non-test environments. Sensitive authentication endpoints (`/api/login`, `/api/register`, `/api/password`) need significantly tighter limits to prevent brute-force and credential-stuffing attacks.

**Recommendation:**
- Apply a strict secondary limiter (e.g., 10 req/min) specifically to auth, password-reset, and registration routes before the global limiter
- Consider `express-slow-down` for a softer degradation approach on login attempts
- Ensure rate limiting is tested (currently skipped in the test environment)

**Scope boundaries:**
- Cover login, registration, password reset, and token exchange endpoints first.
- Keep non-authenticated status and health endpoints on the existing global
  limiter.
- Do not introduce shared state that breaks horizontal scaling across API
  replicas.

**Acceptance criteria:**
- Sensitive auth routes have a stricter limiter than the global API limiter.
- Limit keys account for client IP and any available account identifier without
  logging credentials.
- Exceeded limits return a consistent status and body that clients can handle.
- Tests cover allowed requests, blocked requests, and limiter reset behavior.

**Validation steps:**
- Run the focused route tests for auth and password flows.
- Run `npm test`.
- In a local or staging environment, exceed the configured threshold and verify
  response status, headers, and logs.

**Risks and implementation notes:**
- Incorrect proxy trust settings can collapse all users into one IP bucket;
  confirm Traefik or upstream proxy headers before relying on IP keys.
- Avoid account enumeration through different rate-limit responses for known
  and unknown users.

---

### 11. Add JSDoc Type Annotations to Public APIs
**Effort:** Medium (3–5 days)
**Owner:** THiNX backend maintainers
**Status:** Open
**Next action:** Pick the first large module and derive typedefs from existing
specs and observed CouchDB document shapes.

The codebase has **fewer than 60 JSDoc annotations** across all `lib/thinx/` files. Public-facing module methods (especially in `device.js`, `owner.js`, `builder.js`) have no type documentation.

**Recommendation:** Add `@param`, `@returns`, and `@typedef` annotations to all exported functions in the top-5 largest modules:
- `lib/thinx/device.js` (1487 LOC)
- `lib/thinx/builder.js` (1143 LOC)
- `lib/thinx/owner.js` (1099 LOC)
- `lib/thinx/messenger.js` (910 LOC)
- `lib/thinx/transfer.js` (601 LOC)

**Benefits:** Better IDE support, enables TypeScript migration path, documents API contracts.

**Scope boundaries:**
- Annotate exported functions and shared data structures before private helpers.
- Keep annotations descriptive; do not change runtime code solely to satisfy a
  documentation shape.
- Prefer local typedefs for CouchDB documents, owner records, devices, and build
  requests that appear across modules.

**Acceptance criteria:**
- The selected module has `@param`, `@returns`, and relevant `@typedef`
  coverage for every exported function.
- Optional and nullable values are documented explicitly.
- Error callback or rejected promise shapes are documented for public methods.
- IDE type hints improve without requiring TypeScript compilation.

**Validation steps:**
- Run `npm test` if executable comments or examples are changed.
- Generate or inspect editor IntelliSense for one annotated module.
- Review the annotations against existing specs and API docs for consistency.

**Risks and implementation notes:**
- Incorrect annotations are worse than missing annotations; derive types from
  tests and observed document shapes rather than guesses.
- This task should not be used to rename public fields or normalize schemas.

---

## Low Priority

### 12. Eliminate Hardcoded Test Credentials
**Effort:** Small (half day)
**Owner:** THiNX backend/QA maintainers
**Status:** Open
**Next action:** Move real-looking fixture values into documented local test
configuration and add a safe example fixture.

`spec/_envi.json` contains hardcoded owner IDs, API keys, session IDs, and email addresses. While these appear to be test fixtures, they establish a pattern that can bleed into actual credential leakage in CI logs or accidental commits.

**Recommendation:**
- Move sensitive test fixture values to environment variables with `.env.test` loading (e.g., via `dotenv`)
- Add `spec/_envi.json` to `.gitignore` and provide `spec/_envi.json.example` with placeholder values
- Validate that no real credentials are embedded in test files

**Scope boundaries:**
- Replace committed fixture secrets with documented local test configuration.
- Do not remove deterministic test accounts until specs can create and clean up
  their own fixtures.
- Keep CI configuration explicit about required test-only values.

**Acceptance criteria:**
- Real-looking owner IDs, API keys, session IDs, and emails are removed from
  committed fixture files.
- An example fixture file documents every required key with safe placeholder
  values.
- CI and local test setup can load the same fixture schema without manual file
  edits.
- Secret scanning on the touched files reports no credentials.

**Validation steps:**
- Run `npm test`.
- Run a secret scan or targeted `rg` check for the removed fixture values.
- Start from a clean checkout, follow the documented fixture setup, and confirm
  tests can begin without missing-key errors.

**Risks and implementation notes:**
- Replacing fixtures can break integration specs that assume stable IDs; migrate
  specs in small groups and document any required seed data.
- Avoid printing loaded fixture values in CI logs.

---

### 13. Add Pre-Commit Hooks via Husky
**Effort:** Small (2–4 hours)
**Owner:** THiNX developer experience maintainers
**Status:** Open
**Next action:** Choose Husky or the repository's existing hook convention,
then wire `lint-staged` for staged JavaScript files only.

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

**Scope boundaries:**
- Add hooks for lightweight checks only; long integration tests should remain in
  CI.
- Keep hook setup optional for contributors who have not run
  `npm run setup:hooks`.
- Avoid modifying package scripts unrelated to commit-time validation.

**Acceptance criteria:**
- `husky` or the existing `.githooks` workflow runs lint-staged checks before a
  commit.
- Only staged JavaScript files are linted and rewritten.
- Hook documentation explains how to install, bypass intentionally, and
  troubleshoot local failures.
- CI continues to run the authoritative lint and test commands.

**Validation steps:**
- Run `npm install` if dependencies change.
- Run the pre-commit hook command manually against a staged sample file.
- Run `npm run lint` and `npm test` before merge.

**Risks and implementation notes:**
- Hook rewrites can surprise contributors; keep the staged file list narrow and
  document the behavior.
- Do not rely on hooks as the only quality gate because hooks can be bypassed.

---

### 14. Parallelize Jasmine Test Suite
**Effort:** Small–Medium (1 day)
**Owner:** THiNX backend/QA maintainers
**Status:** Open
**Next action:** Capture the current CI duration baseline and classify specs by
shared dependency before changing runner topology.

`spec/support/jasmine.json` runs all 55 test files sequentially (`"random": false`, `"timeout": 10000`). With many integration-style tests that await I/O (CouchDB, Redis, MQTT), sequential execution significantly inflates total CI run time.

**Recommendation:**
- Evaluate [`jasmine-parallel`](https://www.npmjs.com/package/jasmine-parallel) or switch to [Jest](https://jestjs.io/) which has native worker-based parallelism
- Group tests by dependency (unit tests in one worker, integration tests in another) to avoid port conflicts
- Set `"random": true` to detect hidden test-order dependencies before parallelizing

**Scope boundaries:**
- Measure current CI test duration before changing the runner.
- Separate pure unit specs from specs that require CouchDB, Redis, MQTT, file
  system state, or shared ports.
- Do not change assertions while changing runner topology unless a hidden order
  dependency is being fixed.

**Acceptance criteria:**
- Test groups are documented by dependency and concurrency safety.
- Parallel execution reduces CI wall-clock time without increasing flakes.
- Order-dependent specs are either fixed or pinned with a clear reason.
- CI artifacts make failed parallel workers easy to inspect.

**Validation steps:**
- Run the current sequential suite and record baseline duration.
- Run the proposed parallel suite repeatedly in CI or a CI-like local
  environment.
- Compare failure logs and coverage output against the sequential run.

**Risks and implementation notes:**
- Integration specs may mutate shared databases or queues; isolate state before
  increasing concurrency.
- Randomization should land before parallelization so order coupling is visible
  while failures are still easy to reproduce.

---

### 15. Pin and Upgrade Docker Base Image
**Effort:** Small (2–4 hours)
**Owner:** THiNX DevOps maintainers
**Status:** Open
**Next action:** Choose the base image tag or digest policy, then validate the
API image before expanding the change to worker and builder images.

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

**Scope boundaries:**
- Pin the API image base first, then repeat for worker and builder images.
- Keep runtime package upgrades separate from digest pinning unless the digest
  update requires a compatibility fix.
- Validate Docker Compose and Swarm deployment paths independently.

**Acceptance criteria:**
- Every maintained runtime Dockerfile uses a versioned tag or digest with a
  documented update process.
- The API service has a health check that exercises `/api/v2/status`.
- Compose V2 syntax validates without the deprecated top-level version key.
- CI builds use the same pinned base as local builds.

**Validation steps:**
- Run `docker compose config`.
- Build the affected image locally or in CI.
- Start the API container and verify the health check transitions to healthy.

**Risks and implementation notes:**
- Digest pinning improves reproducibility but can freeze security updates; pair
  it with scheduled dependency review.
- Health checks must avoid authenticated endpoints and external dependencies
  that make healthy containers look failed during dependency outages.

---

### 16. Resolve Source Comment Debt
**Effort:** Medium (2–3 days)
**Owner:** THiNX backend/security maintainers
**Status:** Open
**Next action:** Triage the security-relevant source comments first and convert
each one into either a fix PR or a tracked issue with acceptance criteria.

There are **17 unresolved debt-marker comments** in `lib/`, several with security or correctness implications:

| File | Issue |
|---|---|
| `lib/thinx/notifier.js:29,37,45` | Slack channel `#thinx` hardcoded instead of from config |
| `lib/thinx/rsakey.js:130` | Hardcoded passphrase (see improvement #6) |
| `lib/thinx/transfer.js:278` | Transfer code not using promises — may silently fail |
| `lib/thinx/queue.js:170` | External variable `limit` usage described as "ugly and wrong" |
| `lib/router.js:109` | `403` should be `401` for unauthenticated requests |
| `lib/router.slack.js:27` | Slack OAuth code not validated before use |

**Recommendation:** Triage each source comment into a tracked issue or fix it.
At minimum, address the security-relevant items (`notifier.js` channel config,
`transfer.js` promise conversion, Slack code validation) in one pass.

**Scope boundaries:**
- Start with security and correctness comments in `lib/`.
- Do not delete a source comment unless the issue is fixed, documented
  elsewhere, or converted into a tracked backlog item.
- Keep cosmetic comment cleanup separate from runtime fixes.

**Acceptance criteria:**
- Each security-relevant comment has either a merged fix or a linked issue with
  owner, priority, and acceptance criteria.
- Remaining comments describe why the work is deferred and what would close it.
- The backlog no longer contains anonymous or unactionable debt entries.

**Validation steps:**
- Search `lib/` for deferred-work markers before and after the change and
  review each remaining match.
- Run focused tests for any fixed code path.
- Run `npm test` when runtime code changes are included.

**Risks and implementation notes:**
- Removing comments without fixing the underlying issue hides known risk; prefer
  linked issues over silent deletion.
- Some comments may reveal security-sensitive implementation details, so public
  issue text should be clear without exposing exploitable specifics.

---

## Summary Table

| # | Improvement | Priority | Owner | Status | Next action |
|---|---|---|---|---|---|
| 1 | Structured logging | High | THiNX backend | Open | Choose logger and migrate one backend module first. |
| 2 | ~~Fix command injection in builder.js~~ ✅ | ~~High~~ | THiNX backend | Completed | Keep shell execution under security review. |
| 3 | ~~Update outdated dependencies~~ ✅ | ~~High~~ | THiNX backend | Completed | Continue routine dependency review and keep the `chai` lock. |
| 4 | Migrate callbacks to async/await | High | THiNX backend | Open | Convert `lib/thinx/apikey.js` first with compatible callers. |
| 5 | Strengthen error handling + process handlers | High | THiNX backend | Open | Define JSON error envelope and central middleware. |
| 6 | Resolve hardcoded RSA key passphrase | High | THiNX security/backend | Open | Define config, fallback policy, and key migration plan. |
| 7 | ~~Reduce 99% coverage threshold~~ ✅ | ~~Medium~~ | THiNX backend | Completed | Keep thresholds unless test gates are split. |
| 8 | Enable stricter ESLint rules | Medium | THiNX backend | Open | Enable `eqeqeq` for backend files first. |
| 9 | ~~Add OpenAPI/Swagger specification~~ ✅ | ~~Medium~~ | THiNX API | Completed with optional follow-up | Decide on Swagger UI route. |
| 10 | Per-endpoint rate limiting for auth routes | Medium | THiNX security/backend | Open | Define route limits and proxy-aware keys. |
| 11 | Add JSDoc type annotations | Medium | THiNX backend | Open | Pick first large module and derive typedefs from specs. |
| 12 | Eliminate hardcoded test credentials | Low | THiNX backend/QA | Open | Move fixture values to documented local test configuration. |
| 13 | Add pre-commit hooks | Low | THiNX developer experience | Open | Choose hook convention and wire staged JS linting. |
| 14 | Parallelize Jasmine test suite | Low | THiNX backend/QA | Open | Capture CI baseline and classify specs by dependency. |
| 15 | Pin/upgrade Docker base image + healthcheck | Low | THiNX DevOps | Open | Choose base image tag or digest policy. |
| 16 | Resolve source comment debt | Low | THiNX backend/security | Open | Triage security-relevant comments into fixes or tracked issues. |
