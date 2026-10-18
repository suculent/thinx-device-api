---
phase: 42-ci-trim-login-page-build-footer
reviewed: 2026-10-12T16:59:16Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - .circleci/config.yml
  - scripts/check-ci-gates.js
  - spec/node/CiPipelineGates.test.js
  - services/console/vue/vue.config.js
  - services/console/vue/package.json
  - services/console/vue/src/components/AppFooter/AppFooter.vue
  - services/console/vue/src/components/Layout/Layout.vue
  - services/console/vue/src/components/Layout/Layout.scss
  - services/console/vue/src/pages/Login/Login.vue
  - services/console/vue/src/pages/PasswordReset/PasswordReset.vue
  - services/console/vue/src/styles/_auth.scss
  - services/console/vue/tests/unit/footer-hostnames.cjs
  - services/console/vue/tests/unit/login-page.cjs
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
status: issues_found
---

# Phase 42: Code Review Report

**Reviewed:** 2026-10-12T16:59:16Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Scope:
- Parent diff `dec69991..HEAD`: `.circleci/config.yml`, `scripts/check-ci-gates.js`, `spec/node/CiPipelineGates.test.js`.
- Console submodule diff `ff6e809..cfff199`: the Vue files listed above.

What I checked:
- Ran the offline suites: `node --test spec/node/CiPipelineGates.test.js` (22/22 pass), `tests/unit/login-page.cjs` and `tests/unit/footer-hostnames.cjs` (all ok).
- Checked the WCAG contrast claims by hand against `_variables.scss`: footer text 4.75:1, links 6.75:1, subtitle 5.3:1. All hold.
- Checked job statuses through the public CircleCI v2 API on recent failed and canceled thinx-staging workflows. Dependants of a failed job end in `not_run`, which is terminal, so the `--wait` loop in `check-ci-gates.js` does not hang there.

Results:
- No blocker. The gate (`when: << pipeline.parameters.build_legacy_console >>`), the job wiring, the contexts and the `requires` chains are correct. The new AppFooter validates every value it shows.
- The main problems:
  - The new CI gate regression test is never run by anything.
  - Moving Snyk to main-only leaves the images production actually runs with no container monitoring at all. `origin/main` is currently 316 commits behind `thinx-staging`.
  - The redesigned login page still shows a "Create an Account" call to action that links back to `/login`.

## Warnings

### WR-01: CiPipelineGates.test.js is not wired into any test runner or CI job

**File:** `package.json:36`, `.circleci/config.yml:688`, `spec/node/CiPipelineGates.test.js:1`
**Issue:** Nothing runs the new spec automatically:
- The spec is not listed in `test:node` (`StaticCsp`, `InstallLogRetentionCron`, `ThinxLogRetentionWrapper`, `TestScriptExitCode` only).
- It is not run by any CircleCI step. The only `node --test` step in `test` runs `ConsoleHeaderParity.test.js`.
- `git grep` finds no reference to `CiPipelineGates` outside the file itself.

The checks it carries therefore never run on a push:
- the `build_legacy_console` gate exists;
- no legacy job leaks back into `main`;
- every `requires` resolves on every branch;
- Snyk monitors stay on main only.

A later edit to `.circleci/config.yml` can silently re-break CI-04/CI-05. Compare SEC-CSP-04, where the parity spec is wired into the `test` job.
**Fix:** Add it to `test:node` and to the existing `test`-job step (it is offline and takes about 200 ms):
```yaml
    - run:
        name: Console header parity (SEC-CSP-04) and CI gates (CI-04/CI-05)
        command: node scripts/check-console-headers.js && node --test spec/node/ConsoleHeaderParity.test.js spec/node/CiPipelineGates.test.js
```
```json
"test:node": "node --test spec/node/StaticCsp.test.js ... spec/node/TestScriptExitCode.test.js spec/node/CiPipelineGates.test.js",
```

### WR-02: Snyk main-only leaves every image production runs unmonitored

**File:** `.circleci/config.yml:986-1000`, `.circleci/config.yml:1031-1046`, `.circleci/config.yml:1056-1100`
**Issue:** CI-04 removed `thinx-staging` from `snyk-code-monitor` and `snyk-oss-monitor`. It also moved `snyk-monitor-console-vue` from `registry.thinx.cloud:5000/thinx/console:vue` to the Hub copy `thinxcloud/console:vue`, which only `main` builds. That leaves these gaps:
- **Vue console:** the swarm pulls `registry.thinx.cloud:5000/thinx/console:vue`, built by `vue-console-registry` on `thinx-staging` and `thinx-console`. That image now has no container monitor.
- **Legacy console:** production still serves `thinx/console:swarm`. Its only monitor, `snyk-monitor-console-classic`, sits behind the closed gate. While v1.18 is open that image is neither rebuilt nor scanned.
- **Code and OSS:** SAST and SCA now track `main`. The `origin/main..origin/thinx-staging` gap is 316 commits today: main was last updated 2026-10-06 and staging deploys daily. Pushes go to staging and main is PR-only, so the gap only grows between merges.

As a result, Snyk results describe code that is days to weeks older than production, and new dependency CVEs in what is deployed go unreported until the next main merge. The old `target-reference=thinx-staging` projects also stay in the Snyk org with frozen snapshots, which look current but are not updated.
**Fix:** Pick one of:
- Keep a single container monitor on the image the swarm actually pulls. For example, keep a `snyk-monitor-console-vue-registry` on `thinx-staging` with `registry: registry.thinx.cloud:5000`, `requires: [vue-console-registry]`, and contexts `dockerhub`, `thinx-docker-repo`, `console`, as before this phase.
- Document the accepted gap explicitly in the runbook, add a merge-cadence SLA for main, and deactivate the stale `thinx-staging` / `registry.thinx.cloud:5000/...` projects in Snyk so the dashboard does not show frozen data as current.

The legacy `thinx/console:swarm` image needs a scan-only monitor outside the gate (it can scan the existing tag without a rebuild), or a written acceptance.

### WR-03: The redesigned login keeps a "Create an Account" CTA that links back to the login page

**File:** `services/console/vue/src/pages/Login/Login.vue:83-86`
**Issue:** `<router-link to="login">Create an Account</router-link>` is a relative route. From `/login` it resolves to `/login`, so clicking it does nothing visible. The Vue router (`src/Routes.js`) has no registration route. The Legacy console has a real register form (`#register-btn`, `.register-form`). Phase 42 moved this link under the OAuth row and kept it on purpose (login-page.cjs asserts it exists and is last), so it is now the final call to action on the main entry page. A new user who clicks it gets no response and no explanation.
**Fix:** Pick one:
- Point it at a real sign-up target, for example the landing or legacy registration URL:
  ```vue
  <a class="d-block text-center mb-4" :href="$hostnames.LANDING">Create an Account</a>
  ```
- Remove the sentence and the link until the Vue console has a registration route.

If it stays, change the `login-page.cjs` "order" and "kept" checks to assert a non-`login` target.

## Info

### IN-01: Gate-open pipelines on thinx-staging also redeploy the API and Vue console

**File:** `.circleci/config.yml:4-17`, `scripts/check-ci-gates.js:172-175`
**Issue:** The `main` workflow has no `when`. The Phase 43 API-triggered pipeline (`build_legacy_console=true` on `thinx-staging`) therefore also runs `test`, `api-registry` and `vue-console-registry`, re-pushing production tags and triggering Swarmpit autoredeploy of `thinx_api` and the Vue console. The checker even requires those jobs under `--expect legacy-on`. This is harmless when the revision equals what is deployed, but it is a production restart the runbook should name.
**Fix:** Mention it in `.planning/runbooks/legacy-console-build-gate.md`, or gate `main`'s deploy jobs on `not: << pipeline.parameters.build_legacy_console >>` when a legacy-only rebuild is wanted.

### IN-02: `listAll` follows `next_page_token` with no page bound

**File:** `scripts/check-ci-gates.js:400-409`
**Issue:** `findPushPipeline` caps pagination at `MAX_PIPELINE_PAGES`, but `listAll` loops while a token is returned. If an API answer ever repeats a token, the loop never ends, and the `--timeout-min` deadline cannot interrupt it.
**Fix:** Add a page cap, or stop when the token is unchanged (`if (body.next_page_token === token) break;`).

### IN-03: The compile test validates the script against its own simulator

**File:** `spec/node/CiPipelineGates.test.js:37-52`, `:153-161`
**Issue:** `simulateCompile` hand-models what CircleCI's compiler returns, and `evaluateCompiled` is then tested against that model. If the real `output-yaml` shape differs (for example `when` kept unresolved, or job entries not re-keyed by name), the offline test still passes. Only the manual `check-ci-gates.js compile` run exercises the real shape.
**Fix:** Commit one captured real compiler response as a fixture and test `evaluateCompiled` against it in addition to the simulator.

### IN-04: The footer commit id means different commits in CI and in local builds

**File:** `services/console/vue/vue.config.js:11-15`
**Issue:**
- In CI, `VUE_APP_BUILD_HASH` is `$CIRCLE_SHA1 | cut -c -7`, the parent `thinx-device-api` commit.
- In a local build, `git rev-parse --short HEAD` runs inside the console submodule and yields the console commit.

The footer labels both "Build xxxxxxx" (and Rollbar `code_version` uses the same value), so the same label points into two different repositories depending on where the bundle was built.
**Fix:** Document which repo the id refers to. For a consistent local value, run `git -C ../.. rev-parse --short HEAD` (the superproject) before falling back to the submodule.

### IN-05: Layout footer is now likely to wrap on phones, and its reserved space is one line

**File:** `services/console/vue/src/components/Layout/Layout.scss:17-21`, `:30-46`
**Issue:** `.contentFooter` is `position: absolute; bottom: 15px` with `2.85rem` side padding (about 80 px total). Below `sm`, `.content` reserves only a 40 px bottom padding. The footer text grew by about 10 characters (" · a1b2c3d" plus the year range). By estimate it now wraps to two lines on common 375-430 px phones (it previously wrapped only below about 390 px). A second line extends the footer past the reserved padding and over the last row of page content. This is an estimate, not measured in a browser.
**Fix:** Confirm in a 390 px viewport. If it overlaps, raise the `sm` bottom padding (for example `padding: 20px 15px 64px`) or reduce the footer's side padding on `xs`.

### IN-06: First year 2018 is duplicated between template and script

**File:** `services/console/vue/src/components/AppFooter/AppFooter.vue:3`, `:20`
**Issue:** The template hardcodes `&copy; 2018` while the script declares `FIRST_YEAR = 2018` for the range check. The two can drift.
**Fix:** Expose `firstYear` from `data()`/a constant and render `{{ firstYear }}`.

### IN-07: The dev branch thinx-console still publishes the production Vue tag (pre-existing)

**File:** `.circleci/config.yml:902-913`
**Issue:** `vue-console-registry` runs on `thinx-console` as well as `thinx-staging` and pushes `registry.thinx.cloud:5000/thinx/console:vue`, which is the tag the swarm pulls. A dev-branch push therefore replaces the production console. Phase 42 did not change this, but it re-documented the branch-to-registry rule here ("One registry per branch") and dropped the dev branch's Snyk monitor, so the behaviour is now less visible.
**Fix:** Publish `thinx-console` builds under a separate tag (for example `vue-dev`), or drop `thinx-console` from the filter.

---

_Reviewed: 2026-10-12T16:59:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
