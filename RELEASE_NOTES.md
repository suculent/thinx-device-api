# Release Notes — thinx-staging

> Covers all changes accumulated on `thinx-staging` relative to `master` (210 commits).

---

## Security Fixes

- **SQL injection prevention** — query construction now uses parameterised inputs, eliminating string-based SQL concatenation vulnerabilities.
- **Timing-safe password comparison** — replaced direct equality checks with a constant-time comparison to prevent brute-force timing attacks.
- **`qs` upgraded to 6.14.2** — resolves a prototype-pollution / denial-of-service advisory.
- **`semver` upgraded to 7.6.3** — patches a ReDoS vulnerability in version-range parsing.
- **`moment-timezone` upgraded to 0.5.46** — fixes a path-traversal advisory.
- **`yaml` upgraded to 2.6.0** — addresses a prototype-pollution issue.
- **`js-yaml` upgraded** — additional YAML parser security fix.
- **Cookie hardening** — security fix applied to session cookie configuration.
- **IDOR fix** — requests with missing body now exit early, closing a potential insecure-direct-object-reference vector.
- **Console security fixes** — XSS-related hardening applied to the web console.
- **Dependency audit passes** — multiple rounds of `npm audit fix` across the API and all submodules (`qs`, `axios`, `glob`, `mqtt`, and others).

---

## Bug Fixes

### API & Server

- **WebSocket upgrade server reference fixed** — incorrect server object passed to the WebSocket upgrade handler.
- **CORS headers fixed** — credentialed CORS responses now set the correct `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` headers.
- **Router CORS fix** — additional CORS-related header correction in the main router.
- **Google login fixed** — resolved a regression that prevented OAuth-based Google sign-in from completing.
- **Transfer binding fix** — corrected a bind error in the device-transfer flow.
- **SSL validation and socket binding fix** — socket binding and SSL certificate validation now behave correctly under edge-case configurations.
- **`real_build_id` parser fix** — parser now correctly extracts the build identifier from firmware metadata.
- **Error handling in transfer** — improved error propagation and test expectations for the transfer API.
- **Exit requests with missing body** — guards added so malformed requests are rejected before reaching business logic.
- **ESLint `no-unused-vars` / `no-extra-semi` errors resolved** — static-analysis clean.

### Console / UI

- **Auth redirect fix** — console now correctly redirects unauthenticated users to the login page.
- **Login autocomplete fix** — browser autocomplete attributes corrected on login form inputs.
- **Navigation error fixes** — runtime navigation errors in the Vue console resolved.
- **Navigation cleanup** — stale navigation entries and dead routes removed.
- **Header menus updated** — console header menu items refreshed.
- **Classic console login validator assets fixed** — missing asset references for the classic console login validator restored.
- **Legacy console fixes** — logging, accessibility attributes, and WebSocket handling corrected in the classic console.
- **WebSocket proxy fix** — proxy configuration for WebSocket connections corrected.

### CI / CD

- **`apk install` restored for SSL step** — base image change had removed the Alpine package needed for SSL certificate handling; re-added.
- **MQTT DNS issue resolved** — downgraded MQTT client and changed the internal Docker network from `external` to `internal` to fix DNS resolution inside CI containers.
- **`buildx` parameter error fixed** — corrected `extra_build_args` formatting for the Docker Buildx executor.
- **`network external` error fixed** — Docker Compose network declaration corrected.

---

## Performance Improvements

- **Docker Layer Caching (DLC) enabled** — applied to `build-api-cloud` and `build-vue-console` CircleCI jobs, significantly reducing layer-rebuild time on unchanged dependencies.
- **Optimised Dockerfile layer ordering** — dependency-install steps moved earlier so they are cached across source-only changes.
- **Jasmine runs directly without `nyc` instrumentation** — removes per-test coverage overhead from the default test run, cutting wall-clock time.
- **10 s global timeout added** — prevents hung test suites from blocking CI indefinitely.
- **Coveralls upload guarded** — upload step skipped when coverage data is absent, avoiding unnecessary failures.
- **Test parallelism investigated** — `parallelism=2` was tested with a unit/router split; reverted because orchestration overhead outweighed the gain at current suite size.

---

## Console / UI Updates

- Vue console updated across multiple submodule bumps (navigation, auth, menus, CSP, WebSocket).
- Classic console retained and rebuilt independently from the Vue console pipeline.
- CSP directives added and tightened (including a GitHub-specific CSP fix).
- Console build workflow restored after temporary suspension during backend test stabilisation.
- `echarts` downgraded to a stable version after a regression with a newer release.

---

## CI / CD

- **Node.js upgraded to v25** — runtime and CI base image updated.
- **Broker extracted as a Git submodule** — the MQTT broker is now built and versioned independently via its own CI pipeline.
- **Shared `THiNX` bootstrap helper added** — single shared init module replaces duplicated bootstrap code across test files.
- **Test isolation fixes** — ephemeral ports used in tests; `afterAll` hooks close the HTTP server, eliminating `EADDRINUSE` failures in parallel runs.
- **Stats and Messenger bootstraps skipped in tests** — reduces unnecessary I/O during the unit-test phase.
- **Database init deduplicated** — shared across test bootstraps instead of being re-initialised per suite.
- **Docker executor pinned** — pinned to a stable CircleCI Docker executor version to prevent unexpected executor upgrades.
- **OpenAPI spec regenerated** — updated spec committed alongside console and Mosquitto submodule updates.

---

## Dependency Updates

| Package | From | To | Notes |
|---|---|---|---|
| `qs` | 6.10.3 | 6.14.2 | Security — prototype pollution |
| `semver` | 7.5.3 | 7.6.3 | Security — ReDoS |
| `moment-timezone` | 0.5.40 | 0.5.46 | Security — path traversal |
| `yaml` | 2.2.2 | 2.6.0 | Security — prototype pollution |
| `js-yaml` | — | upgraded | Security |
| `axios` | — | upgraded | General security / maintenance |
| `mqtt` | — | upgraded then pinned | Stability |
| `glob` | — | upgraded | Security |
| `connect-redis` | — | upgraded then stabilised | Compatibility |
| `redis` | — | pinned to 4.7 branch | Session stability |
| `chai` | — | pinned | Test compatibility |
| `mkdirp` | — | pinned | Compatibility |
| `dateformat` | — | pinned | Stability |
| Node.js | v24 | v25 | Runtime upgrade |

---

## Documentation

- **Prioritised improvements backlog added** (`docs/improvements.md`) — captures technical debt items and planned enhancements with priority rankings.
- **`planned improvements` note** — high-level roadmap entry committed to the repository.
- **OpenAPI spec updated** — regenerated from current route definitions.

---

*Generated 2026-03-20 from `git log master..thinx-staging` (210 commits).*
