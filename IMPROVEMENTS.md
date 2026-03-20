# Planned Improvements Backlog

This document tracks prioritized improvement ideas for the `thinx-device-api` Node.js IoT backend.
Analysis performed on the current codebase (~11K LOC across 62+ library files, 48 Jasmine test specs).

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

Several dependencies are significantly behind their latest versions, with potential security implications:

| Package | Current | Latest | Gap |
|---|---|---|---|
| `axios` | 1.7.7 | 1.13.6 | Minor, but requested |
| `@slack/web-api` | 6.13.0 | 7.15.0 | Major (breaking changes) |
| `connect-redis` | 6.1.3 | 9.0.0 | Major (breaking changes) |
| `eslint` | 8.57.1 | 10.1.0 | Major (new flat config) |
| `bcrypt` | 5.1.1 | 6.0.0 | Major |
| `base-64` | 0.1.0 | 1.0.0 | Major |
| `body-parser` | 1.20.3 | 2.2.2 | Major |
| `chai` | 4.5.0 | 6.2.2 | Major |

**Recommendation:** Update `axios` first (low risk). For major updates (`connect-redis`, `@slack/web-api`), create isolated PRs with test validation. Use `npm audit` regularly.

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

There are only **50 `try` blocks** and **73 `catch` blocks** across the entire `lib/thinx/` directory. Many async operations (CouchDB queries, Redis calls, file operations) lack proper error handling, leading to unhandled promise rejections or silent failures.

**Recommendation:**
- Add a centralized Express error-handling middleware (e.g., in `thinx-core.js`) that catches unhandled errors and returns consistent JSON error responses
- Add `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` handlers in entry point
- Wrap all external I/O calls in `try/catch` blocks systematically

---

## Medium Priority

### 6. Reduce Unrealistic 99% Test Coverage Threshold
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

### 7. Enable Stricter ESLint Rules Incrementally
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

### 8. Add JSDoc Type Annotations to Public APIs
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

### 9. Eliminate Hardcoded Test Credentials
**Effort:** Small (half day)

`spec/_envi.json` contains hardcoded owner IDs, API keys, session IDs, and email addresses. While these appear to be test fixtures, they establish a pattern that can bleed into actual credential leakage in CI logs or accidental commits.

**Recommendation:**
- Move sensitive test fixture values to environment variables with `.env.test` loading (e.g., via `dotenv`)
- Add `spec/_envi.json` to `.gitignore` and provide `spec/_envi.json.example` with placeholder values
- Validate that no real credentials are embedded in test files

---

### 10. Add Pre-Commit Hooks via Husky
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

## Summary Table

| # | Improvement | Priority | Effort | Impact |
|---|---|---|---|---|
| 1 | Structured logging (replace console.log) | High | Medium | Observability |
| 2 | Fix command injection in builder.js | High | Small | Security |
| 3 | Update outdated dependencies | High | Medium | Security/Stability |
| 4 | Migrate callbacks to async/await | High | Large | Maintainability |
| 5 | Strengthen error handling | High | Medium | Reliability |
| 6 | Reduce 99% coverage threshold | Medium | Small | Developer Experience |
| 7 | Enable stricter ESLint rules | Medium | Medium | Code Quality |
| 8 | Add JSDoc type annotations | Medium | Medium | Maintainability |
| 9 | Eliminate hardcoded test credentials | Low | Small | Security hygiene |
| 10 | Add pre-commit hooks (husky) | Low | Small | Developer Experience |
