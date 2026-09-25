---
phase: 22-ci-sast-baseline
verified: 2026-09-25T14:46:02Z
status: passed
score: 42/42 must-haves verified (roadmap SC 4/4, plan truths 38/38)
covered_files:

  - .circleci/config.yml
  - .github/workflows/codeql-analysis.yml
  - .planning/REQUIREMENTS.md
  - .planning/phases/22-ci-sast-baseline/22-01-PLAN.md
  - .planning/phases/22-ci-sast-baseline/22-01-SUMMARY.md
  - .planning/phases/22-ci-sast-baseline/22-02-PLAN.md
  - .planning/phases/22-ci-sast-baseline/22-02-SUMMARY.md
  - .planning/phases/22-ci-sast-baseline/22-03-PLAN.md
  - .planning/phases/22-ci-sast-baseline/22-03-SUMMARY.md
  - .planning/phases/22-ci-sast-baseline/22-04-PLAN.md
  - .planning/phases/22-ci-sast-baseline/22-04-SUMMARY.md
  - .planning/phases/22-ci-sast-baseline/22-CODEQL-ALERTS.json
  - .planning/phases/22-ci-sast-baseline/22-CODEQL-BASELINE.md
  - docker-swarm.yml
  - services/console/vue/package.json
  - services/console/vue/src/components/Layout/Layout.vue
  - services/console/vue/tests/unit/footer-hostnames.cjs

covered_digest: "v1:sha256:a21d3e3fea36099b254cbcf311cf08697c41134b0dce99d0d31a13e70827c9d4"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 32/34
  gaps_closed:
    - "In the live Vue bundle, the 'THiNX Console' links (layout, login, password reset) point at the Vue console host (ROADMAP SC3 / CI-03; 22-02 truth 4, Layout footer half)"
  gaps_remaining: []
  regressions: []
coincidental_reliance_items:

  - truth: "22-04 truth 4: npm run test:unit exits 0 and renders the real footers of Layout, Login and PasswordReset to the console and landing hosts"
    reason: fixture-only
    harden: "The test builds each VM from the component's mixins only (plus data), not from the full component options. It skips the component's own created/computed, the global layoutMixin and the store, so a Layout created() that resets $hostnames would still pass (REVIEW WR-05). Build the VM from the full options with only the render swapped in. This verifier's scratch harness does that and it passes on the fix and fails on a0e86707. Also run test:unit in the image build or the submodule CI job (WR-03)."
human_verification:

  - test: "Logged-in retest of the classic console at https://rtm.thinx.cloud (console-retest skill), carried from the prior report and from the 22-02 deferred human-check"
    expected: "Dashboard loads, websocket connects to wss://rtm.thinx.cloud/..., Devices page renders with no Angular parse error, and the browser console shows no cookie/owner/profile debug logging"
    why_human: "Needs login credentials. The unauthenticated subset passes again (root=200, LogviewController.js=200). A new classic image was autoredeployed on 9bf5cf97 at 14:20:16Z, so a logged-in look after that rollout is worth doing"
  - test: "Confirm the non-authoritative LLM-judge verdicts on the 11 judgment-tier prohibitions (22-01 x3, 22-02 x2, 22-03 x2, 22-04 x4); see the Prohibitions table"
    expected: "Each prohibition held"
    why_human: "judgment-tier prohibitions are never auto-passed (unverified-prohibition — human review recommended)"
---

# Phase 22: CI & SAST Baseline Verification Report

**Phase Goal:** CI gives trustworthy signals before any code changes land. CodeQL scans the branches production code arrives on, private-registry logins stop flaking, and the Vue console's "THiNX Console" links point at the Vue console itself.
**Verified:** 2026-09-25T14:46:02Z
**Status:** human_needed
**Re-verification:** Yes, after gap-closure plan 22-04. The previous status was gaps_found (32/34).

## Goal Achievement

### Roadmap Success Criteria (contract)

| # | Success criterion | Status | Evidence |
|---|---|---|---|
| 1 | Push to `thinx-staging`/`main` and PR to `main` each produce a CodeQL `javascript-typescript` analysis (v4, checkout v7, build-mode none); non-required; default setup off | ✓ VERIFIED (D-08 evidence contract) | Regression check, live `gh`: push runs 36135544646, 36136099330 and 36137235883 still `success`, and there is a new push run **36146395561 on 9bf5cf97, `success`**, with analysis 1839884012 on `refs/heads/thinx-staging`. PR runs 36139870033 and **36146395645 (9bf5cf97, `success`)**, with analyses 1839520597 and 1839883504 on `refs/pull/569/merge`, `err` empty. `protection=0 rulesets=0`, default-setup `not-configured`. The workflow YAML has push `[main, thinx-staging]` and PR `[main]`. The main-push run itself is still pending the user's merge of PR #569, which D-08 accepts. |
| 2 | No direct `docker login registry.thinx.cloud:5000`; every private-registry login via `registry-login`; no argv password | ✓ VERIFIED | `argv=0 direct=0`. The only raw `docker login` lines are the `registry-login` body (stdin, 5 retries), docker.io x2 (stdin) and dhi.io (stdin, line 770). `git diff 9ccf9f18 HEAD -- .circleci/config.yml` is empty, so 22-04 changed nothing here. **CircleCI test job 15425 on 9bf5cf97 is `success`**. |
| 3 | In the live Vue bundle, the "THiNX Console" links (**layout**, login, password reset) point at the Vue console host; `VUE_WEB_HOSTNAME` traced from CircleCI into the bundle | ✓ VERIFIED (**gap closed**) | The served `https://console.thinx.cloud/js/app.js` (HTTP 200) has `buildHash "9bf5cf9"` and `consoleHostname = "console.thinx.cloud"`. The compiled Layout script module imports `mixins/hostnames` and has `mixins: [_mixins_hostnames__WEBPACK_IMPORTED_MODULE_4__["default"]`. The script modules that import the mixin are now Layout, Login, OAuthReturn, PasswordReset and Visits; before, Layout was absent. 9bf5cf9 maps to **CircleCI job 15424 `vue-console-registry`, `success`, branch thinx-staging, rev 9bf5cf97**, which ran the step "Check Required Environment Variables". Headless Chrome (re-run now): `/#/login` and `/#/password-reset` render `href="https://console.thinx.cloud"` and `href="https://thinx.cloud"`. For the logged-in Layout footer, this verifier's full-options render (see Spot-Checks) gives `https://console.thinx.cloud` / `https://thinx.cloud`. The pre-fix a0e86707 control gives no href. The user approved the logged-in /app check (22-04 Task 2, "approved", human_judgment). |
| 4 | `docker-swarm.yml` no longer sets the dead runtime `VUE_APP_CONSOLE_HOSTNAME` | ✓ VERIFIED | `dead=0 vueapp=7`, YAML-OK, and the file is unchanged since 9ccf9f18. Live, read-only, key counts only: `thinx_console dead_env=0` after its **autoredeploy at 14:20:16Z (update completed)**, `thinx_vue dead_env=0`, `gluster_dead=0`. This also closes the prior report's A-03 follow-up. |

### Plan must-have truths

**22-04 (gap closure): full verification**

| # | Truth (abridged) | Status | Evidence |
|---|---|---|---|
| 1 | The live bundle's layout, login and reset links point at the Vue console host. Logged-in /app footer: THiNX Console → https://console.thinx.cloud, THiNX Cloud → https://thinx.cloud. Public pages still correct | ✓ VERIFIED | SC3 evidence above. The logged-in hrefs are backed by the compiled module, the full-options render and the user's "approved" |
| 2 | Layout.vue imports `hostnameMixin` and declares `mixins: [hostnameMixin]`; the diff vs a0e86707 is 2/0 and the template is byte-identical; main.js unchanged | ✓ VERIFIED | `git diff --numstat a0e86707 a5b02467`: `2 0 Layout.vue`; the hunks are the import (line 23) and `mixins` (line 32) only; `MAIN-JS-UNCHANGED` |
| 3 | Every `$hostnames` reader under src declares the mixin (Layout, Login, PasswordReset, OAuthReturn, Visits) | ✓ VERIFIED | Independent grep over all file types (not only `.vue`/`.js`): the readers are exactly those 5, plus main.js (the `{}` fallback) and the mixin itself. Each has a live, uncommented `import hostnameMixin from "@/mixins/hostnames"` and `mixins: [hostnameMixin],` (Login:101/107, OAuthReturn:44/56, PasswordReset:105/111, Visits:110/114, Layout:23/32). The compiled bundle confirms all 5 import the mixin |
| 4 | `test:unit` exits 0; renders the real footers of Layout/Login/PasswordReset to the console/landing hosts; fallback line; RED recorded pre-edit | ✓ VERIFIED (coincidental-reliance) | Ran `node tests/unit/footer-hostnames.cjs`: 13 `ok` lines, rc=0, fallback `-> https://served-origin.invalid`. RED is recorded in 22-04-SUMMARY (4 failing lines) and reproduced independently here on the a0e86707 Layout. Caveat: the footer render does not use the full component options (WR-05), see `coincidental_reliance_items` |
| 5 | Served bundle buildHash resolves to an origin/thinx-staging commit whose gitlink has the fix; compiled Layout references mixins/hostnames; consoleHostname still console.thinx.cloud | ✓ VERIFIED | `9bf5cf9` → 9bf5cf97, an ancestor of origin/thinx-staging (which it currently is); gitlink `a5b02467` on both HEAD and origin/thinx-staging; compiled-module and host literal as in SC3 |
| 6 | Built by a green vue-console-registry job on thinx-staging for the pointer bump; config.yml not modified | ✓ VERIFIED | Job 15424 `success`, thinx-staging, rev 9bf5cf97; `git diff 9ccf9f18 HEAD -- .circleci/config.yml` is empty; 9bf5cf97 changes only `services/console` (1/1) |
| 7 | Nothing pushed to any main; parent main 033ea946, submodule main a0e86707; PR #569 open, unmerged | ✓ VERIFIED | `origin/main=033ea946`; submodule `origin/main=a0e86707`; PR #569 `OPEN merged=null auto=null draft=false`, head 9bf5cf97 |
| 8 | CI-03 marked [x]/Complete only after "approved"; CI-01/CI-02 rows untouched by the plan; 22-02-SUMMARY gets an additive note only | ✓ VERIFIED | ae770c0b was committed at 14:30:39Z, after the approval (about 14:29Z). REQUIREMENTS numstat is 2/2 (CI-03 only). 22-02-SUMMARY numstat is 4/0, with 0 removed lines |

**22-01..22-03: regression check (all passed previously)**

| Plan | # | Truth (abridged) | Status | Regression evidence |
|---|---|---|---|---|
| 22-01 | 1 | Staging push runs green; analysis under refs/heads/thinx-staging | ✓ VERIFIED | Earlier runs are unchanged, plus new run 36146395561 / analysis 1839884012 |
| 22-01 | 2 | Triggers, 3 steps, no `run`, least-privilege permissions | ✓ VERIFIED | Structural re-check: uses `checkout@v7, init@v4, analyze@v4`, `run_steps 0`, workflow `contents: read`, job adds `security-events: write` |
| 22-01 | 3 | paths-ignore scope | ✓ VERIFIED | Workflow unchanged since 9ccf9f18 |
| 22-01 | 4 | Default setup not-configured | ✓ VERIFIED | `not-configured` |
| 22-01 | 5 | D-01 pre-check, no private image on the test path | ✓ VERIFIED | Test job 15425 is green with no private-registry login |
| 22-01 | 6 | No direct/argv login; test job green | ✓ VERIFIED | `argv=0 direct=0`; 15425 `success` |
| 22-01 | 7 | Hub x2 and dhi.io stdin logins unchanged; `registry-login` gains no params | ✓ VERIFIED | Lines 235, 309 and 770 are unchanged; config.yml has no diff |
| 22-01 | 8 | No push retry or serial-group added | ✓ VERIFIED | config.yml has no diff |
| 22-01 | 9 | numstat 0/1 | ✓ VERIFIED | Historical commit, unchanged |
| 22-01 | 10 | Direct/argv counts 0 | ✓ VERIFIED | `argv=0 direct=0` |
| 22-01 | 11 | dhi.io login precedes compose up | ✓ VERIFIED | config.yml unchanged |
| 22-01 | 12 | Baseline Total == JSON length | ✓ VERIFIED | `json_len=147`, md `Total open alerts: 147`, live open alerts on staging still 147 |
| 22-01 | 13 | No alert dismissed during the phase | ✓ VERIFIED | Dismissals since 2026-09-25: 0 |
| 22-02 | 1 | consoleHostname compiles to console.thinx.cloud; fixUrlProtocol adds https:// | ✓ VERIFIED | Live literal; hostnames.js unchanged |
| 22-02 | 2 | buildHash → green vue-console-registry job with required-vars | ✓ VERIFIED | Now 9bf5cf9 → 15424 (was 9ccf9f1 → 15413) |
| 22-02 | 3 | Build arg; ARG/ENV before yarn build | ✓ VERIFIED | config.yml unchanged; the submodule diff does not touch the Dockerfile |
| 22-02 | 4 | Login/reset hrefs; **Layout footer href logged in** | ✓ VERIFIED (**was FAILED**) | See SC3 and 22-04 truth 1 |
| 22-02 | 5 | Shared WEB_HOSTNAME untouched | ✓ VERIFIED | config.yml unchanged |
| 22-02 | 6 | docker-swarm.yml dead env gone; VUE_APP_ 8→7 | ✓ VERIFIED | `dead=0 vueapp=7` |
| 22-02 | 7 | Gluster thinx.yml without the env | ✓ VERIFIED | `gluster_dead=0` (live, read-only) |
| 22-02 | 8 | Live thinx_console without the env, running | ✓ VERIFIED | `dead_env=0`, update `completed` after the 14:20:16Z autoredeploy |
| 22-02 | 9 | Only thinx_console updated; no stack deploy | ✓ VERIFIED | Historical. 22-04 reports no ssh or service update; the 14:20Z/14:21Z updates of thinx_console/thinx_vue are the Swarmpit autoredeploy from the push pipeline |
| 22-02 | 10 | rtm 200; LogviewController.js 200 | ✓ VERIFIED | `root=200 logview=200` |
| 22-03 | 1 | Open PR staging→main; PR CodeQL run green | ✓ VERIFIED | PR #569 OPEN, head 9bf5cf97; PR run 36146395645 `success` |
| 22-03 | 2 | Analysis under refs/pull/569/merge | ✓ VERIFIED | 1839883504 (new) and 1839520597 |
| 22-03 | 3 | Check not required | ✓ VERIFIED | `protection=0 rulesets=0` |
| 22-03 | 4 | PR open, not merged, nothing on main | ✓ VERIFIED | As in 22-04 truth 7 |
| 22-03 | 5 | Default setup not-configured | ✓ VERIFIED | `not-configured` |
| 22-03 | 6 | main push trigger in YAML | ✓ VERIFIED | `push ['main', 'thinx-staging']` |
| 22-03 | 7 | Baseline trigger table: PR row filled, main row pending | ✓ VERIFIED | Baseline md unchanged by 22-04 |

**Score:** 42/42 truths verified (roadmap SC 4/4, plan truths 38/38; 0 present but behavior-unverified; 1 carries the coincidental-reliance advisory).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `.github/workflows/codeql-analysis.yml` | CodeQL v4 advanced setup | ✓ VERIFIED | Unchanged; green on push and PR for 9bf5cf97 |
| `.circleci/config.yml` | Test job without the raw login | ✓ VERIFIED | Unchanged; test 15425 green |
| `22-CODEQL-BASELINE.md` / `22-CODEQL-ALERTS.json` | Phase 23 "before" evidence | ✓ VERIFIED | 147 = 147 = live |
| `docker-swarm.yml` | Classic console without the dead env | ✓ VERIFIED | `dead=0` |
| `services/console/vue/src/components/Layout/Layout.vue` | Contains `mixins: [hostnameMixin],` | ✓ VERIFIED (was HOLLOW) | Exists, substantive, wired (compiled bundle), data flows (full-options render) |
| `services/console/vue/tests/unit/footer-hostnames.cjs` | Contains `mixins/hostnames` | ✓ VERIFIED | 176 lines; runs green; wired into `test:unit`. Not wired into any CI or image build (WR-03), and the phase must-haves do not require that |
| `services/console/vue/package.json` | `test:unit` chains footer-hostnames.cjs | ✓ VERIFIED | `node tests/unit/env-json.cjs && node tests/unit/footer-hostnames.cjs` |
| `.planning/REQUIREMENTS.md` | `- [x] **CI-03**` | ✓ VERIFIED | Present. CI-01 and CI-02 were also restored by this verification (see Requirements Coverage) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| hostnames.js (data + created) | Layout.vue:12 footer anchors | `mixins: [hostnameMixin]` | ✓ WIRED (was NOT_WIRED) | Source line 32; compiled module has the import and the mixins array |
| submodule a5b02467 on origin/thinx-staging | parent gitlink on origin/thinx-staging | 9bf5cf97 pointer bump | ✓ WIRED | `git ls-tree origin/thinx-staging services/console` = a5b02467 |
| parent thinx-staging push | served app.js (thinx_vue) | CircleCI vue-console-registry → Swarmpit autoredeploy | ✓ WIRED | job 15424 success; thinx_vue updated 14:21:49Z; buildHash 9bf5cf9 served |
| codeql-analysis.yml | code scanning (staging + PR refs) | analyze@v4 SARIF | ✓ WIRED | New analyses 1839884012 / 1839883504 |
| config.yml test job | docker-compose.test.yml services | dhi login → compose up | ✓ WIRED | test 15425 green |
| CircleCI `VUE_WEB_HOSTNAME` | Dockerfile ARG/ENV → bundle | build arg | ✓ WIRED | Required-vars step on 15424 plus the bundle literal |
| repo docker-swarm.yml | gluster thinx.yml + live thinx_console | manual mirror | ✓ WIRED | All three have 0 dead keys, including after the autoredeploy |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
|---|---|---|---|---|
| Layout.vue footer | `$hostnames.CONSOLE` / `.LANDING` | hostnames mixin `created()`, then build-time `VUE_APP_CONSOLE_HOSTNAME` (from `VUE_WEB_HOSTNAME`) / `VUE_APP_LANDING_HOSTNAME` | Yes: `https://console.thinx.cloud` / `https://thinx.cloud` | ✓ FLOWING (was DISCONNECTED) |
| Login.vue footer | same | same | Yes (live headless) | ✓ FLOWING |
| PasswordReset.vue footer | same | same | Yes (live headless) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Footer unit test | `node tests/unit/footer-hostnames.cjs` (single named test) | 13 ok, rc=0 | ✓ PASS |
| Layout footer from **full** component options (own created/computed, global layoutMixin, real vuex store; only `mounted` removed) | scratch harness over the real Layout.vue and mixins | `{"THiNX Console":"https://console.thinx.cloud","THiNX Cloud":"https://thinx.cloud"}`, no render error | ✓ PASS |
| Same harness, RED control on the a0e86707 Layout.vue | same | `{}` (both hrefs undefined) | ✓ PASS (fails as expected on the pre-fix code) |
| Served bundle | curl app.js; parse module defs | `buildHash "9bf5cf9"`, `consoleHostname = "console.thinx.cloud"`, Layout module imports and declares the mixin | ✓ PASS |
| Public-page hrefs | headless Chrome `--dump-dom` /#/login, /#/password-reset | both render console.thinx.cloud + thinx.cloud | ✓ PASS |
| CircleCI on 9bf5cf97 | CircleCI v1.1 API | 15421–15428 all `success` (incl. test 15425, vue-console-registry 15424) | ✓ PASS |
| CodeQL on 9bf5cf97 | `gh run list` / analyses | push + PR runs success, analyses err empty | ✓ PASS |
| rtm classic console | curl | `root=200 logview=200` | ✓ PASS |
| D-13 live after autoredeploy | read-only ssh via host alias, key counts only | `thinx_console dead_env=0`, `thinx_vue dead_env=0`, `gluster_dead=0` | ✓ PASS |
| Logged-in /app footer in a real browser | needs login | the user answered "approved" (22-04 Task 2) | ✓ PASS (human_judgment) |

### Probe Execution

Step 7c: no probes are declared in any PLAN or SUMMARY, and this phase has no `scripts/*/tests/probe-*.sh` in scope. SKIPPED.

### Requirements Coverage

| Requirement | Source plan | Description | Status | Evidence |
|---|---|---|---|---|
| CI-01 | 22-01, 22-03 | CodeQL v4/checkout v7 on push main+staging and PR to main; non-required; default setup off | ✓ SATISFIED | SC1 (the main-push run is pending the merge per D-08). **This verification restored REQUIREMENTS.md to `[x]` and `Complete`** (it had been reverted to Gaps Found in 1cf4b401) |
| CI-02 | 22-01 | Every private-registry login via `registry-login`; no argv password | ✓ SATISFIED | SC2. **This verification restored REQUIREMENTS.md to `[x]` and `Complete`** |
| CI-03 | 22-02, 22-04 | Vue footer links point at the Vue console host in the live bundle; dead env removed from docker-swarm.yml | ✓ SATISFIED | SC3 + SC4; already `[x]`/Complete via ae770c0b |

No requirement is orphaned. REQUIREMENTS.md maps CI-01..CI-03 to Phase 22, and every one of them is claimed by a plan. The REQUIREMENTS.md edit (4/4 lines: the two checkboxes and the two traceability rows) is uncommitted and left for the orchestrator.

### Prohibitions (judgment tier; LLM-judge verdicts are non-authoritative and flagged for human review)

| Plan | Prohibition | Judge verdict | Evidence |
|---|---|---|---|
| 22-01 | No dismiss, suppress or fix of alerts; no widening of paths-ignore | held | 0 dismissals since the phase start; workflow unchanged |
| 22-01 | No alert messages, snippets or URLs in the committed baseline | held | Baseline files unchanged since the prior check |
| 22-01 | No push to main | held | `origin/main=033ea946` |
| 22-02 | Never print env values or the server `.env` | held | 22-04 artifacts scanned: 0 IPs, 0 ssh command fragments; the only token-pattern hit is prose naming the scan's regex prefixes |
| 22-02 | Never point the links elsewhere or drop the build arg | held | config.yml unchanged; bundle literal console.thinx.cloud |
| 22-03 | No secrets, IPs or ssh details in the PR | held | PR body not changed by 22-04 |
| 22-03 | No merge, auto-merge, required check or push to main | held | PR OPEN, auto=null, protection=0 rulesets=0 |
| 22-04 | No hardcoded host in Layout or any footer; build arg unchanged; hrefs flow via the mixin | held | The Layout diff adds only the import and the mixins entry (0 added lines containing thinx.cloud); config.yml unchanged; the fallback test shows the env drives the value |
| 22-04 | No push to main in either repo; no merge/approve/auto-merge of #569; no restart.sh/stack deploy/other service update | held | Both mains unchanged; the PR is untouched; the service updates at 14:20Z/14:21Z are the autoredeploy from the image push, and the SUMMARY reports no ssh or recovery |
| 22-04 | No CI-03 Complete before "approved" | held | ae770c0b at 14:30:39Z, after the approval at about 14:29Z |
| 22-04 | No env values, CircleCI step output beyond names and the required-vars line, or ssh details in logs/SUMMARY/commits | held | Same scan as above; this report prints key names and counts only |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| services/console/vue/tests/unit/footer-hostnames.cjs | 105-111 | WR-05: footer render uses mixins only, not the full component options | ⚠️ Warning | The guard can pass while the real Layout renders no href. Truth 4 holds literally; truth 1 rests on the verifier's full-options harness, the bundle and the approval instead |
| services/console/vue/package.json, vue/Dockerfile | 17 / 74-78 | WR-03: `test:unit` runs in no CI or image build | ⚠️ Warning | The regression guard is manual only. No must-have requires it to be a gate; recommended follow-up |
| services/console/vue/tests/unit/footer-hostnames.cjs | 156-173 | WR-04: the sweep matches text only, for `.vue`/`.js` only | ⚠️ Warning | Today's state is confirmed by this verifier's independent all-extension grep and the compiled bundle. The guard is weak for future regressions |
| .circleci/config.yml | test job contexts | WR-01 (carried): the test job still receives the private-registry push credential through its context | ⚠️ Warning | Least-privilege follow-up; CI-02's wording is met |
| AGENTS.md | 13 | WR-02 (carried): tracked file publishes a root ssh endpoint | ⚠️ Warning | Outside the phase diff; separate cleanup |
| Layout.vue / Login.vue / PasswordReset.vue | footer anchors | IN-08: `target="_blank"` without `rel="noopener noreferrer"` | ℹ️ Info | Pre-existing template; now live on Layout |
| services/console/.circleci/config.yml | ~138-160 | A-04 (carried): the dormant branch job logs in via the orb with no retry | ℹ️ Info | Outside CI-02's scope |

No TBD, FIXME, XXX, TODO or HACK markers appear in the three submodule files 22-04 changed. None of the prior phase files changed since the last check.

Re-verification evidence gate: none of the findings above is a blocker. Each is either carried forward from the prior report as a Warning/Info or is a new Warning in a 22-04-modified file, so there is no Advisory section.

### Advisory (New Scope, Unevidenced)

None.

### Human Verification Required

#### 1. Logged-in classic console retest (rtm.thinx.cloud)

**Test:** Log in at https://rtm.thinx.cloud and run the console-retest skill.
**Expected:** The dashboard loads; the websocket goes to `wss://rtm.thinx.cloud/…`; the Devices page renders with no Angular parse error; the browser console shows no cookie, owner or profile debug logging.
**Why human:** It needs credentials. The unauthenticated checks pass. The classic image was rebuilt and autoredeployed on 9bf5cf97 (14:20:16Z). This check is outside the roadmap SCs; it comes from the 22-02 D-13 restart.

#### 2. Confirm the judgment-tier prohibition verdicts

**Test:** Review the Prohibitions table above (11 items).
**Expected:** Each one held.
**Why human:** Judgment-tier items are never auto-passed.

(The 22-02 deferred human-check about the `VUE_WEB_HOSTNAME` name and the Layout hover is now resolved. The name is proven by the required-vars step on jobs 15413 and 15424. The Layout href is covered by the user's "approved" plus the automated evidence above.)

### Follow-up (not gaps)

- When the user merges PR #569, record the main-push CodeQL run and analysis in the `Push to main` row of `22-CODEQL-BASELINE.md` (D-08).
- Submodule `main` (a0e86707) trails `thinx-staging` by a5b02467. Syncing it is the user's call (A-22-04-2).
- The submodule's own `Test Vue console` CircleCI job has failed since 2026-09-23. This predates the phase and is not on the deploy path.
- WR-03/WR-04/WR-05: make the footer guard a real gate (run it in the image build, sweep all extensions, render from the full options).
- A-03 from the prior report is **closed**: thinx_console still has no dead env key after the 14:20:16Z autoredeploy.

### Gaps Summary

The single prior gap is closed. `Layout.vue` now declares the hostnames mixin (2 added lines, template untouched, main.js untouched). The fix is on thinx-staging in both repos, and console.thinx.cloud serves it as buildHash 9bf5cf9, built by the green vue-console-registry job 15424. The Layout footer href was shown correct four ways:

- in the compiled bundle, whose Layout module imports and declares the mixin
- by a full-options render of the real component, which fails on the pre-fix code
- by the shipped unit test
- by the user's approval of the logged-in check

Nothing regressed on the CI-01, CI-02 or SC4 fronts. The 9bf5cf97 push also produced fresh green CodeQL push and PR analyses and a green CircleCI test job, and the D-13 env removal survived a real autoredeploy.

The status is `human_needed`, not `passed`, only because two human-only items remain: the logged-in rtm classic-console retest, and review of the 11 judgment-tier prohibition verdicts. Neither is a gap against the phase must-haves. The review warnings WR-03..WR-05 weaken the new test as a future guard, but they do not undermine any must-have today.

---

_Verified: 2026-09-25T14:46:02Z_
_Verifier: Claude (gsd-verifier)_
