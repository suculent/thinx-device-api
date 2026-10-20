---
phase: 42-ci-trim-login-page-build-footer
plan: 03
subsystem: infra
tags: [deploy, ci, circleci, console, verification]

requires:
  - phase: 42-01
    provides: "build_legacy_console gate, Snyk on main only, scripts/check-ci-gates.js (compile, pipeline)"
  - phase: 42-02
    provides: "console cfff199: AppFooter with build year and 7-char id, welcome login, logo asset"
provides:
  - "Parent gitlink services/console -> cfff199 (2e018d7f), pushed with the 42-01 CI commits to thinx-staging"
  - "Live proof: pipeline 5655 ran only test, api-registry, vue-console-registry (CI-GATES PIPELINE OK 5655)"
  - "Live proof: console.thinx.cloud serves the welcome login and build footer with id 2e018d7; logo 200 image/png with the Legacy sha256"
  - "Live proof: Legacy main.js and LogviewController.js byte-identical before and after the deploy"
affects: [43, 48, vault-transit]

actuals:
  tokens: 20
  tasks: 2
  commits: 1
plan_head_before: cfc5202a1e4ffb6bab1aaf0451e91f9af8afef85
plan_head_after: 2e018d7fce3fae58c4d1f605b3a64f573eb44812

tech-stack:
  added: []
  patterns:
    - "Deploy proof by revision: check-ci-gates.js pipeline --revision <pushed sha> --expect legacy-off --wait, then poll the served bundle for the parent short id"

key-files:
  created: []
  modified:
    - services/console

key-decisions:
  - "The SUMMARY/STATE docs commits stay local after the deploy push: the plan does not push them, and pushing would start another API + Vue rollout; they ride the next thinx-staging push"
  - "D-08 evidence: CircleCI MCP validate_config was not run (42-01 had no access); node scripts/check-ci-gates.js compile (CircleCI's own compiler) passed in the 42-03 preflight and the spec passed 22/22, and the live pipeline 5655 confirms the compiled job set"

patterns-established: []

requirements-completed: [CI-04, CI-05, UI-05, LOGIN-01, LOGIN-02, LOGIN-03]

coverage:
  - id: D1
    description: "thinx-staging push pipeline 5655 for 2e018d7 ran test, api-registry, vue-console-registry to success and no snyk-* or console-classic-* job"
    requirement: CI-05
    verification:
      - kind: integration
        ref: "node scripts/check-ci-gates.js pipeline --revision 2e018d7fce3fae58c4d1f605b3a64f573eb44812 --expect legacy-off --wait"
        status: pass
    human_judgment: false
  - id: D2
    description: "Main side of CI-04 (all Snyk monitors on main, console monitors on the Hub images) via CircleCI's compiler only; origin main unchanged (b7881536)"
    requirement: CI-04
    verification:
      - kind: integration
        ref: "node scripts/check-ci-gates.js compile"
        status: pass
      - kind: other
        ref: "git ls-remote origin refs/heads/main before and after (b7881536d1d7dc33e195277f805ca761a1c75940)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Legacy console unchanged on rtm.thinx.cloud: main.js and LogviewController.js byte-identical before and after"
    requirement: CI-05
    verification:
      - kind: integration
        ref: "shasum -a 256 -c ${TMPDIR}/phase42-legacy-baseline.sha256"
        status: pass
    human_judgment: false
  - id: D4
    description: "console.thinx.cloud bundle carries 2e018d7, the new title, build-hash, auth-logo and both OAuth paths, and neither 'THiNX Login' nor '2018 - 2026'"
    requirement: UI-05
    verification:
      - kind: integration
        ref: "42-03-PLAN Task 2 verify 1 (bundle markers against https://console.thinx.cloud/js/app.js)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Logo served 200 image/png with the Legacy sha256 e361d678…996c (was 404 before the deploy)"
    requirement: LOGIN-01
    verification:
      - kind: integration
        ref: "42-03-PLAN Task 2 verify 2 (curl logo_white_200.png, content-type, sha256)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual layout at 1280x720 / 460x800 / 375x667, real password, Google and GitHub logins under CSRF enforcement, password-reset and authenticated footers, Legacy console-retest"
    requirement: LOGIN-02
    verification: []
    human_judgment: true
    rationale: "Needs a browser, the operator's accounts and live OAuth sessions; queued as end-of-phase UAT items H1-H5"

duration: 8min
completed: 2026-10-12
status: complete
---

# Phase 42 Plan 03: Ship and Prove Live Summary

**Shipped Phase 42 to production through thinx-staging. Pipeline 5655 (`2e018d7`) ran only test, api-registry and vue-console-registry, with no Snyk and no legacy console job. console.thinx.cloud now serves the welcome login and build footer with id `2e018d7` and the THiNX logo (200, Legacy sha256). The Legacy console files on rtm.thinx.cloud are byte-identical to the pre-deploy baseline.**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-12T16:44:08Z
- **Completed:** 2026-10-12T16:52:24Z
- **Tasks:** 2 / 2 (one tracer, one auto)
- **Files modified:** 1 (`services/console` gitlink)

## Accomplishments

- Console `thinx-staging` pushed fast-forward `ff6e809..cfff199`.
- Parent gitlink bumped in signed commit `2e018d7f` (`services/console` only), parent `thinx-staging` pushed fast-forward `dec69991..2e018d7f`. No rebase was needed (origin was still `dec69991`).
- Pipeline 5655 proved the CI-04/CI-05 staging job set live. The Vue image rolled out about 7 minutes after the push.
- The deployed bundle, the logo and the unchanged Legacy files were all checked against production.

## Task Commits

1. **Task 1 (tracer): ship and prove the pipeline job list:** `2e018d7f` chore(42): bump console to the welcome login and build footer (UI-05, LOGIN-01..03) (signed G)
2. **Task 2: production checks:** read-only, no commit

## Evidence

### Preflight (before any push)

- `LC_ALL=C npm --prefix services/console/vue run test:unit`: exit 0, 0 `FAIL` lines
- `node --test spec/node/CiPipelineGates.test.js`: tests 22, pass 22, fail 0
- `node scripts/check-ci-gates.js compile`:
  ```
  false/thinx-staging: test,vue-console-registry,api-registry
  false/main: test,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api,snyk-monitor-console-vue
  true/thinx-staging: test,vue-console-registry,api-registry,console-classic-registry
  true/main: test,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api,snyk-monitor-console-vue,console-classic-hub,snyk-monitor-console-classic
  CI-GATES COMPILE OK
  ```
- 42-01 parameter one-liner (`build_legacy_console` type boolean, default false, `legacy-console` gated): exit 0

### Baselines (step 1)

- Legacy `https://rtm.thinx.cloud/app/js/main.js` sha256 `819c133e9111a55fa7037df16b3f502c93f1816ce8064b756db3a9a8e31c7c16` (28878 bytes)
- Legacy `https://rtm.thinx.cloud/app/js/controllers/LogviewController.js` sha256 `e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d` (12538 bytes)
- `git ls-remote origin refs/heads/main`: `b7881536d1d7dc33e195277f805ca761a1c75940` (same after the push)
- `https://console.thinx.cloud/assets/thinx/img/logo_white_200.png` before the deploy: `404 text/html; charset=utf-8`
- Vue bundle id before the deploy: `dec6999`

### Outgoing parent range right before the push (step 5)

```
2e018d7f G chore(42): bump console to the welcome login and build footer (UI-05, LOGIN-01..03)
cfc5202a G docs(42-02): update state and roadmap after login page and build footer plan
36e48da6 G docs(42-02): complete login page and build footer plan (UI-05, LOGIN-01..03)
9e656276 G docs(42-01): update state and roadmap after CI trim plan
3a5163f5 G docs(42-01): complete CI trim plan (CI-04, CI-05)
8b9c4683 G chore(42): live pipeline job check and legacy build gate runbook (CI-05)
72dc7abf G ci(42): run Snyk monitors on main only and scan Hub console images (CI-04)
8ee9cd23 G test(42): expect Snyk monitors on main only (CI-04)
e45456b4 G ci(42): pause legacy console builds behind build_legacy_console (CI-05)
10f057b4 G test(42): add CI gate checks for the legacy console build (CI-05)
efcf62b8 G docs(42): create phase plan
c0bab990 G docs(42): UI design contract
7f5314dc G docs(state): record phase 42 context session
9183c69c G docs(42): capture phase context
4d0830cd G docs: tag 1 pending todo with resolves_phase after milestone v1.18 roadmap
c5eeb0a7 G docs: create milestone v1.18 roadmap (7 phases)
51fe0ee1 G docs: define milestone v1.18 requirements
a6741a4a G docs: consume v1.16 MILESTONE-CONTEXT.md
da5016f9 G docs: start milestone v1.18 Console Improvements
```

That is 19 commits, all `G`. Outside `.planning/`, the range changes only `.circleci/config.yml`, `scripts/check-ci-gates.js`, `spec/node/CiPipelineGates.test.js` and `services/console`. Console range pushed: `b85993b ee79ca6 ec1ff5b f71219f cf65b79 cfff199`, all `G`.

### Live job list (step 6, D-08)

```
pipeline 5655 a15c7d85-1352-4497-9119-0c3d39e41eb7 branch=thinx-staging revision=2e018d7
main: vue-console-registry (success)
main: test (success)
main: api-registry (success)
CI-GATES PIPELINE OK 5655
```

Compare pipeline 5653 before the phase: 8 jobs, including `console-classic-registry` and four `snyk-*` jobs.

Second Task 1 verify (`origin/thinx-staging` = HEAD in parent and console, gitlink = console HEAD): `SYNC OK`.
`git log -1 --format='%G? %s' -- services/console` → `G chore(42): bump console to the welcome login and build footer (UI-05, LOGIN-01..03)`. `git show --name-only` of that commit → `services/console`.

### Rollout

Pushed at 16:45:21Z. The pipeline finished before 16:51:22Z, and `2e018d7` showed up in `https://console.thinx.cloud/js/app.js` at 16:52:03Z (second poll; the first poll at 16:51:33Z still read `dec6999`). No swarm intervention.

### Production checks (Task 2)

- **Bundle** (`/js/app.js`, 3099431 bytes), verify exit 0. Marker counts: `2e018d7` 2 (`String("2e018d7" || …)` and `code_version: "2e018d7"`), `Welcome to THiNX Management Console.` 1, `build-hash` 2, `auth-logo` 2, `/oauth/google` 1, `/oauth/github` 1, `2018 - 2026` 0, `THiNX Login` 0.
- **Logo**, verify exit 0: `HTTP/2 200`, `content-type: image/png`, `content-length: 1381`, sha256 `e361d6781eedba693c46f002def0bd6e544b25f52dbb41b123c0aea14048996c`. It returned 404 before the deploy.
- **Legacy unchanged**, verify exit 0:
  ```
  …/42-legacy-main.js: OK
  …/42-legacy-logview.js: OK
  ```

## Human Verification (pending end-of-phase UAT)

These five checks are queued as written in the plan:

1. **H1:** Open https://console.thinx.cloud/#/login at 1280x720. Expected: THiNX logo (200x100) centred about 24px above a darkened panel titled "Welcome to THiNX Management Console." (no "THiNX Login"), subtitle "Use your username to sign in.", Username, Password, "Forgot password?", a green Login button, then "Login with Google" and "Login with GitHub" side by side directly under it, then "Don't have an account? Sign up now!" and "Create an Account". The footer is on one line: `© 2018 – {current UTC year} THiNX Console by THiNX Cloud · {7-char id}`, where the id is `2e018d7` (the first 7 characters of the shipped parent commit). The footer does not overlap "Create an Account".
2. **H2:** At 460x800 both social labels fit on one line side by side. At 375x667 the two social buttons stack full width (UI-SPEC backstop E4 overflow).
3. **H3:** Log in with a real password account; it lands on the dashboard. Log out. "Login with Google" completes. Log out. "Login with GitHub" completes (CSRF enforcement, D-18).
4. **H4:** Open https://console.thinx.cloud/#/password-reset: darkened panel, same footer. On any authenticated page the bottom footer shows the same text with readable link colours.
5. **H5:** Run the console-retest skill against https://rtm.thinx.cloud/ (Legacy): served bundle unchanged, websocket target wss://rtm.thinx.cloud/…, no sensitive console logging, Devices page renders. The Legacy console was not rebuilt and still works against the redeployed API.

## Decisions Made

- I did not push the docs commits from this close-out (SUMMARY, STATE, ROADMAP). The plan pushes only the deploy range, and a docs-only push would start another API and Vue rollout. They ship with the next `thinx-staging` push.
- D-08 evidence: the CircleCI MCP `validate_config` was not run, by 42-01 or here. `check-ci-gates.js compile`, which uses CircleCI's own compiler, passed in this preflight. The orchestrator also re-ran it after 42-01, together with the 22/22 spec. Live pipeline 5655 confirms the compiled job set.

## Deviations from Plan

None. The plan ran as written: no rebase, no rerun, no stalled rollout. The D-04 bypass was not executed, `build_legacy_console` stays `false`, main was not touched, and nothing was force-pushed.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- Phase 42 is complete apart from the five human UAT items above (`/gsd-verify-work 42`).
- Phase 43 can use the runbook bypass (`.planning/runbooks/legacy-console-build-gate.md` § 4) for its one-off legacy pipeline.
- The local parent `thinx-staging` is ahead of origin by the 42-03 docs commits only.

---
*Phase: 42-ci-trim-login-page-build-footer*
*Completed: 2026-10-12*

## Self-Check: PASSED

- FOUND: commit 2e018d7f is an ancestor of HEAD, signed G, and equals origin/thinx-staging
- FOUND: services/console HEAD = origin/thinx-staging = gitlink = cfff199
- All acceptance criteria from Task 1 and Task 2 re-checked: pipeline OK, SYNC OK, main unchanged, bundle/logo/Legacy verifies exit 0
