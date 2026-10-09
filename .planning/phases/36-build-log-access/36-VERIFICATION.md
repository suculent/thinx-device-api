# Phase 36 Verification

Requirements: BUILD-01, BUILD-02. Implementation locally verified; publication and browser/live verification pending.

## Verification evidence (2026-10-09)

- Parent targeted Jasmine: BuildlogPagingSpec + OwnerPurgeSpec: 26 specs, 0 failures. Run without the shared integration bootstrap, using programmatic Jasmine with helpers disabled and synthetic CouchDB environment values; all stores mocked.
- Parent deploy-key Node tests: 4 tests, 0 failures; persisted names, old key compatibility, named creation, invalid names, exact selected-key deletion and owner isolation.
- Parent existing Node suite: 42 pass, 1 existing skip, 0 failures.
- Vue complete unit suite including milestone-v116.cjs: pass. Exercises real component/store functions, compiles changed templates, checks full log Buffer/string/array responses, modal request races/errors, timeout/completed states, mutually exclusive notification selection, profile transformer patch, create-and-assign, and key generation failures.
- Legacy deploy-key controller test: pass for parsed and string responses, name transmission, list refresh, digest scheduling, and failure reset.
- Vue and Legacy source CSP checks: pass; Legacy XSRF, digest, and scope checks: pass.
- ESLint on changed backend and Vue files: pass. git diff --check: pass.
- Vue production build: pass with existing Sass/bundle-size warnings. This host throws uv_interface_addresses in Vue CLI's node-ipc setup; a temporary build-only preload catches that error and supplies an empty network interface list. No application code or build config changed for this host workaround.
- Legacy build:test: pass. Generated assets remain untracked/ignored; source files are committed.

## Unverified gates

- Browser visual/end-to-end checks: not run. No Chromium installed, and both current and bundled Playwright downloads returned invalid/truncated ZIPs.
- Full CouchDB/Redis/worker integration suite: not run; local mocked and dependency-free suites passed. The normal Jasmine helper starts a full API server and timed out without the services; isolated tests were then run with helpers disabled.
- CI, staging deployment, and live human acceptance: pending publication. GitHub branch creation returned 403 Resource not accessible by integration for both repositories; direct git push lacks credentials. GitHub installation discovery returned no manageable installations.

## Remaining action

Grant the GitHub connection write access to suculent/thinx-device-api and thinx-cloud/console, then publish the console branch first and parent branch second. Open coordinated draft PRs to thinx-staging, wait for CI, and perform live UI acceptance before closing v1.16. v1.15 remains paused and intact.
