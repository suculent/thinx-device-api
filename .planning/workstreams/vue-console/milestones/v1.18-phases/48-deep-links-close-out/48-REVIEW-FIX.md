---
phase: 48-deep-links-close-out
fixed_at: 2026-10-16T15:58:00Z
review_path: .planning/workstreams/vue-console/phases/48-deep-links-close-out/48-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 48: Code Review Fix Report

**Fixed at:** 2026-10-16T15:58:00Z
**Source review:** .planning/workstreams/vue-console/phases/48-deep-links-close-out/48-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, WR-01, WR-02, WR-03, WR-04; IN-* out of scope)
- Fixed: 5
- Skipped: 0

Commits are signed (`G`) and nothing is pushed. Console submodule (`services/console`, branch
`thinx-staging`): `bd1e0a1`, `64f773e`, `bb0e5ef`, `355e868`. Parent (`thinx-staging`): `ca7975df`
(WR-02) and `9523aa8c` (gitlink bump `512ddb5..355e868`, touches only `services/console`).

## Fixed Issues

### CR-01: A network failure now resolves as an empty success-less reply, so outages render as empty data with no error

**Status:** fixed: requires human verification (it changes the error contract)
**Files modified:** `services/console/vue/src/core/api.js`, `services/console/vue/src/store/devices.js`, `services/console/vue/src/store/enviros.js`, `services/console/vue/src/store/admin.js`, `services/console/vue/src/pages/PasswordReset/PasswordReset.vue`, `services/console/vue/tests/unit/close-out-v118.cjs`
**Commit:** bd1e0a1 (console)
**Applied fix:**
- `request()` still resolves when a request gets no response, so the 48-08 guarantee holds. The catch now returns `{ success: false, status: 0, response: null, networkError: true }`.
- `devices/fetchItems`, `enviros/fetchItems` and `admin/fetchUsers` throw when `networkError` is set. A refused or empty reply still resolves as before.
  - `Devices.vue loadData()` shows `LOAD_ERROR` again.
  - `AdminUsers.vue` shows "Failed to load users." again.
- `PasswordReset` checks `result.networkError` before the generic branch and shows "Network error. Please try again." again.
- Audit of the other callers:
  - `Visits.vue` reads `devices/fetchItems` through `Promise.allSettled`, so it gets no new rejection.
  - `enviros` `refreshAfter` already catches.
  - `devices/revokeDevices` dispatched `fetchItems` with no catch. It now uses the `refreshAfter` pattern: a stored revoke stays a success with `refreshed: false`. This keeps the change from adding an unhandled rejection.
  - Login and OAuthReturn call `fetchWithCsrf` directly and are unaffected.
  - Rsakeys, Transformers and Enviros use stores that already throw on any failure (`loadItems`, `loadDevices`, rsakeys/transformers `fetchItems`).
  - Every other page catch has a matching `!result.success` branch.
- Tests: check I9 now expects the marker and also asserts that a 502 reply has no `networkError`. Its intent (no rejection) is unchanged. New checks: I10 (the three stores throw on a network failure and resolve a refused reply), I11 (revokeDevices `refreshed: false`), I12 (Devices `LOAD_ERROR`, AdminUsers "Failed to load users."), and I13 (PasswordReset network copy vs server copy).
- **Human check:** the 48-08 deep-link race depends on `request()` not rejecting. That still holds, but I did not run `deep-link.spec.js` (Cypress) locally. Confirm it on the next `test-vue-console` CI run.

### WR-01: `response.text()` is still outside the new try, so the "never rejects" guarantee is partial

**Status:** fixed: requires human verification (same Cypress caveat as CR-01)
**Files modified:** `services/console/vue/src/core/api.js`, `services/console/vue/tests/unit/close-out-v118.cjs`
**Commit:** 64f773e (console)
**Applied fix:** `await response.text()` now runs inside the same `try` as the fetch. A body read that fails after the headers arrived resolves `{ success: false, status: response.status, response: null, networkError: true }`. I9 now covers a `text()` that rejects.

### WR-02: The restored Legacy image is built and published without the Legacy unit tests gating it

**Files modified:** `.circleci/config.yml`, `scripts/check-ci-gates.js`, `spec/node/CiPipelineGates.test.js`
**Commit:** ca7975df (parent)
**Applied fix:**
- New job `test-console-classic`:
  - Image `thinxcloud/console-build-env:vue`, pulled anonymously. No context.
  - Fetches only the console submodule, then runs `LC_ALL=C node src/test/deploykey.cjs` and `src/test/legacy-close-out.cjs`. No install.
- It runs inside the `legacy-console` workflow, filtered to `thinx-staging` and `main` (the union of its dependants' filters). `console-classic-registry` and `console-classic-hub` both `require` it.
- `build_legacy_console` still defaults to `true` and still switches off the whole workflow, the new job included.
- `check-ci-gates.js`:
  - `LEGACY_JOBS` now includes the new job, so it must not run with the switch off.
  - With the switch on, `requiredJobs` requires it on thinx-staging and main (CI-07).
  - New `LEGACY_GATE_JOB` export.
- Spec:
  - The fixture of the legacy-on staging test now includes the job.
  - Three new WR-02 tests cover the job definition, its filters, both `requires`, and the evaluateJobs requirement on main.
- `node scripts/check-ci-gates.js compile` (CircleCI's own compiler, both parameter values) printed `CI-GATES COMPILE OK`.
- Note: `check-ci-gates.js pipeline --expect legacy-on` will now report `test-console-classic` missing for pipelines built before this commit. That is expected.

### WR-03: The console repo's `test_vue` job still runs unpinned lifecycle scripts with the `sonarcloud` credential context

**Files modified:** `services/console/.circleci/config.yml`
**Commit:** bb0e5ef (console)
**Applied fix:**
- I checked first: no `test_vue` step uses Sonar. The steps are `yarn`, unit tests, Legacy tests, `build:perf` and `test:ci`.
- The Cypress suites stub the API, and the parent's `test-vue-console` already runs the same commands with no context.
- I removed `context: sonarcloud` from the `test_vue` workflow entry and added a comment explaining why.
- The YAML parses. I did not validate this file with the CircleCI compiler, because the `circleci` CLI is not installed.

### WR-04: The Legacy failed-build toast still reads `response.status`, a field the build reply does not have

**Files modified:** `services/console/src/app/js/controllers/DevicesController.js`, `services/console/src/test/legacy-close-out.cjs`
**Commit:** 355e868 (console)
**Applied fix:**
- The failure branch now calls `toastr.error( "Build failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } )`. That is one fixed sentence, and no reply value reaches toastr.
- New check G9 tests `{ success: false }`, an HTML `response`, and a `status` field. G8 now also asserts that no `toastr.error( response.` remains in the source.
- **Follow-up for the orchestrator/operator:** `.planning/workstreams/vue-console/ROADMAP.md:267` still lists this as "Found in Phase 48 (deferred)". Update it to say it was fixed in 48-REVIEW-FIX (console `355e868`). I did not edit ROADMAP.

## Documentation follow-ups (not edited)

- `.planning/runbooks/legacy-console-build-gate.md:29` says the switch controls "exactly three jobs". With WR-02 it controls four (`test-console-classic` added). The kill-switch procedure itself is unchanged.
- `48-REVIEW-DISPOSITION.md` rows for CR-01, WR-01, WR-02, WR-03 and WR-04 can move to fixed.

## Verification

Each fix was verified in isolated git worktrees: one for the parent and one for the console repo, under `.claude/worktrees/`. The checks were syntax checks plus the touched unit files.
- The Vue suites ran there with `NODE_PATH` pointing at the main checkout's `node_modules`.
- The worktree has no `node_modules`, so the sass-compiling checks fail there. That failure comes from the environment and also happened before the change.

The gates below ran **in the main checkout**, after both branches were fast-forwarded (console `355e868`, parent `9523aa8c`). They can be reproduced from that tree:

| Gate | Result |
|---|---|
| `cd services/console/vue && LC_ALL=C npm run -s test:unit` | exit 0, 435 `ok` lines, no FAIL |
| `node services/console/src/test/deploykey.cjs` | "Legacy deploy-key create: all checks passed." |
| `node services/console/src/test/legacy-close-out.cjs` | "Legacy close-out: all checks passed." (G1-G9) |
| `npx mocha spec/node/CiPipelineGates.test.js` (parent root) | exit 0. The file uses `node:test`: 30 tests, 30 pass, 0 fail (mocha's own counter reads "0 passing") |
| `node scripts/check-ci-gates.js compile` | `CI-GATES COMPILE OK` (ran in the parent worktree on the same config) |
| `cd services/console/vue && NODE_OPTIONS=--openssl-legacy-provider npm run -s build` | exit 0, "Build complete." (about 43 s) |

Not run: the Cypress suites (`yarn test:ci`), including `deep-link.spec.js`. The next `test-vue-console` and `test_vue` CI runs cover them.

Nothing was pushed. Pushing `thinx-staging` (console first, then parent) starts a production rollout. That decision belongs to the operator.

---

_Fixed: 2026-10-16T15:58:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
