---
phase: 22-ci-sast-baseline
verified: 2026-09-25T13:30:52Z
status: gaps_found
score: 32/34 must-haves verified (roadmap SC 3/4, plan truths 29/30)
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
  - .planning/phases/22-ci-sast-baseline/22-CODEQL-ALERTS.json
  - .planning/phases/22-ci-sast-baseline/22-CODEQL-BASELINE.md
  - docker-swarm.yml
covered_digest: "v1:sha256:0db273d4e7a74061d33d5c0fe6a7adfcde1a85b9a274652933632d1953c4244e"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "In the live Vue bundle, the 'THiNX Console' links (layout, login, password reset) point at the Vue console host (ROADMAP SC3 / CI-03; 22-02 truth 4, Layout footer half)"
    status: failed
    reason: >
      The Layout footer link (Layout.vue:12, shown on every authenticated /app page) renders with NO href.
      Layout.vue binds :href="this.$hostnames.CONSOLE" but does not declare mixins: [hostnameMixin].
      main.js:23 sets Vue.prototype.$hostnames = {} and the only global mixin is layoutMixin (main.js Vue.mixin(layoutMixin)),
      which has no hostnames. mixins/hostnames.js:27 assigns this.$hostnames as an own property of the instance that uses the mixin
      (Login, PasswordReset, OAuthReturn, Visits), so it never reaches Layout. In Layout, this.$hostnames.CONSOLE is undefined,
      and Vue 2 drops an attribute whose value is undefined. The live bundle (buildHash 9ccf9f1) matches the source: the compiled
      Layout script module has no 'mixins' or 'hostnames' reference, and the only importers of mixins/hostnames are Login,
      OAuthReturn, PasswordReset and Visits. A deterministic repro (the submodule's own Vue 2.7.16 runtime + vue-template-compiler,
      the real hostnames.js and the real <footer> templates, VUE_APP_CONSOLE_HOSTNAME=console.thinx.cloud) prints
      Login href "https://console.thinx.cloud", PasswordReset href "https://console.thinx.cloud", Layout href undefined.
      The two public-page results match what headless Chrome sees on the live site, which validates the harness.
      Pre-existing defect (not introduced by this phase), but SC3 names the layout link explicitly, and 22-02 left it as an
      unconfirmed human-check while 22-02-SUMMARY and REQUIREMENTS.md mark CI-03 complete.
    artifacts:
      - path: "services/console/vue/src/components/Layout/Layout.vue"
        issue: "Uses this.$hostnames.CONSOLE / .LANDING in the footer but does not import or declare the hostnames mixin"
      - path: "services/console/vue/src/main.js"
        issue: "Vue.prototype.$hostnames = {} is an empty fallback; nothing populates it for components that don't use the mixin"
      - path: ".planning/REQUIREMENTS.md"
        issue: "CI-03 marked [x] Complete even though one of its three footer links is broken"
    missing:
      - "Add `import hostnameMixin from '@/mixins/hostnames'` and `mixins: [hostnameMixin]` to Layout.vue (the same pattern as Login.vue:101 / PasswordReset.vue:105), or populate Vue.prototype.$hostnames once in main.js"
      - "Ship it through the submodule flow: push services/console to thinx-staging, bump the parent submodule pointer, push the parent thinx-staging, and let vue-console-registry rebuild"
      - "Re-verify after the deploy: log in at https://console.thinx.cloud and confirm the /app footer 'THiNX Console' anchor has href=https://console.thinx.cloud (the 'THiNX Cloud' LANDING link in the same footer has the same defect)"
      - "Revert CI-03 to in-progress in REQUIREMENTS.md until the Layout link is fixed"
human_verification:
  - test: "Logged-in retest of the classic console at https://rtm.thinx.cloud after the D-13 --env-rm restart (console-retest skill)"
    expected: "Dashboard loads, websocket connects to wss://rtm.thinx.cloud/..., Devices page renders with no Angular parse error, and the browser console shows no cookie/owner/profile debug logging"
    why_human: "Needs login credentials. The unauthenticated subset passes (root=200, title=1, LogviewController.js=200, the served bundle targets wss://rtm.thinx.cloud)"
  - test: "Confirm the non-authoritative LLM-judge verdicts on the 7 judgment-tier prohibitions (22-01 x3, 22-02 x2, 22-03 x2); see the 'Prohibitions' table"
    expected: "Each prohibition held"
    why_human: "judgment-tier prohibitions are never auto-passed (unverified-prohibition — human review recommended)"
---

# Phase 22: CI & SAST Baseline Verification Report

**Phase Goal:** CI gives trustworthy signals before any code changes land. CodeQL scans the branches production code arrives on, private-registry logins stop flaking, and the Vue console's "THiNX Console" links point at the Vue console itself.
**Verified:** 2026-09-25T13:30:52Z
**Status:** gaps_found
**Re-verification:** No. This is the initial verification.

## Goal Achievement

### Roadmap Success Criteria (contract)

| # | Success criterion | Status | Evidence |
|---|---|---|---|
| 1 | A push to `thinx-staging` or `main` and a PR to `main` each produce a CodeQL `javascript-typescript` analysis (v4, checkout v7, build-mode none) visible in code scanning; the check is non-required; default setup stays off | ✓ VERIFIED (D-08 evidence contract) | Live `gh`: push runs 36135544646 (1c7aded0), 36136099330 (89c5cf93) and 36137235883 (9ccf9f18) all `success`; analyses 1839292115, 1839321938 and 1839381670 under `refs/heads/thinx-staging`. PR #569 run 36139870033 `success`, analysis 1839520597 under `refs/pull/569/merge`. `protection=0 rulesets=0`. default-setup `not-configured`. The `main` push trigger is in the YAML. The main-push run itself is pending the user's merge of PR #569, which D-08 accepts. |
| 2 | `.circleci/config.yml` has no direct `docker login registry.thinx.cloud:5000`; every private-registry login goes through `registry-login`; no argv password | ✓ VERIFIED | `argv=0 direct=0`. Commit 89c5cf93 numstat is `0 1`: the only change deletes the argv login. Every private-registry login site (lines 205, 286, 377 and 588, the last parametrised by `registry:`) uses `registry-login`, which reads `--password-stdin` with 5 retries. The dhi.io (770) and docker.io (235, 309) logins are stdin. CircleCI test job 15409 on 89c5cf93 is `success`, and job 15419 on 9ccf9f18 is also `success`. |
| 3 | In the live Vue bundle, the "THiNX Console" links (**layout**, login, password reset) point at the Vue console host; `VUE_WEB_HOSTNAME` traced from CircleCI to the bundle | ✗ FAILED | The trace holds: the bundle compiles `consoleHostname = "console.thinx.cloud"`; buildHash `9ccf9f1` maps to job 15413 `vue-console-registry`, `success`, whose required-vars step (it lists `VUE_WEB_HOSTNAME`) printed `All required environment variables are present.`; the build arg is present and ARG 23 / ENV 44 come before `yarn build` at 77. Login and password-reset hrefs are `https://console.thinx.cloud` (headless Chrome, re-run now). **The Layout footer link has no href.** See the Gaps Summary. |
| 4 | `docker-swarm.yml` no longer sets the dead runtime `VUE_APP_CONSOLE_HOSTNAME` | ✓ VERIFIED | `dead=0 vueapp=7`, YAML-OK. Commit 9ccf9f18 numstat is `0 1` on the classic `console:` service. D-13 is also verified live (see below). |

### Plan must-have truths

| Plan | # | Truth (abridged) | Status | Evidence |
|---|---|---|---|---|
| 22-01 | 1 | The staging push runs the rewritten workflow green, and its analysis is listed under refs/heads/thinx-staging | ✓ VERIFIED | run 36135544646 success; analysis 1839292115 (1c7aded0), no error |
| 22-01 | 2 | Triggers are push main+staging, PR main and weekly; 3 steps, no `run`; least-privilege permissions | ✓ VERIFIED | Structural python check prints `WF-OK` (re-run) |
| 22-01 | 3 | paths-ignore covers node_modules, *.min.js, lua-inspect, spec and the 3 harness scripts; no baseline path under them | ✓ VERIFIED | paths-ignore list confirmed; leak count 0 |
| 22-01 | 4 | Default setup `not-configured` before and after | ✓ VERIFIED | `not-configured` now (after both runs and the PR run) |
| 22-01 | 5 | D-01 pre-check recorded, with no private-registry image on the test path | ✓ VERIFIED | Re-run: (a) only `.env.dist:3`; (b) empty; (c) Hub/dhi.io/golang/influxdb only |
| 22-01 | 6 | No direct/argv login; test job green for the CI-02 commit | ✓ VERIFIED | `argv=0 direct=0`; CircleCI 15409 `success` |
| 22-01 | 7 | docker.io x2 and dhi.io stdin logins unchanged; `registry-login` gains no params | ✓ VERIFIED | `hub=2`; the phase diff to config.yml is 1 deleted line only |
| 22-01 | 8 | No push retry or serial-group added (D-03) | ✓ VERIFIED | Phase diff is `1 -`; no `serial-group` present |
| 22-01 | 9 | numstat is 0/1 (delete path) | ✓ VERIFIED | `0 1 .circleci/config.yml` |
| 22-01 | 10 | Direct-login and argv counts are 0 | ✓ VERIFIED | `argv=0 direct=0` |
| 22-01 | 11 | dhi.io login precedes the compose up | ✓ VERIFIED | `dhi=770 up=771` |
| 22-01 | 12 | Baseline md fields; Total equals the JSON length | ✓ VERIFIED | `COUNT-MATCH 147`; live open alert count on the ref is still 147; the key-set check is true |
| 22-01 | 13 | No alert dismissed during the phase | ✓ VERIFIED | The only dismissed alert is #118, dismissed 2021-01-01. The plan's literal "count stays 0" was a planning-time assumption; the intent holds. |
| 22-02 | 1 | The live bundle compiles consoleHostname to console.thinx.cloud; fixUrlProtocol adds https:// | ✓ VERIFIED | `consoleHostname = \"console.thinx.cloud`; hostnames.js:16-18 |
| 22-02 | 2 | buildHash maps to a green vue-console-registry job whose required-vars step passed | ✓ VERIFIED | `9ccf9f1` → job 15413, required-vars line present (re-run) |
| 22-02 | 3 | Build arg present; ARG/ENV before yarn build | ✓ VERIFIED | `arg=1 req=1 classic=1 vue=1 ARG=23 ENV=44 BUILD=77` |
| 22-02 | 4 | login and password-reset href = https://console.thinx.cloud; **Layout footer shows the same href logged in** | ✗ FAILED | Login and reset pass. Layout renders `href` undefined (no mixin); repro and bundle evidence are in the gap. |
| 22-02 | 5 | Shared WEB_HOSTNAME untouched | ✓ VERIFIED | `classic=1 vue=1` |
| 22-02 | 6 | docker-swarm.yml without the dead env; VUE_APP_ lines go from 8 to 7 | ✓ VERIFIED | `dead=0 vueapp=7` |
| 22-02 | 7 | Gluster thinx.yml without the env; backup exists; diff is 1 removed / 0 added | ✓ VERIFIED | Live ssh (read-only): `backup=thinx.yml.bak-phase22-20260925T130834Z gluster_dead=0 removed=1 added=0`; 0 hits in the other stack files |
| 22-02 | 8 | Live thinx_console: no env, completed, 1 Running, image unchanged | ✓ VERIFIED | `live_console_dead=0 update=completed running=1 image=UNCHANGED`; 6 other VUE_APP_ keys intact |
| 22-02 | 9 | Only thinx_console updated; no restart.sh or stack deploy; thinx_vue untouched | ✓ VERIFIED | Per-service UpdatedAt: only `thinx_console` changed at 13:08:55Z. `thinx_api` and `thinx_vue` changed at 12:55Z (Swarmpit autoredeploy from the push pipeline). chronograf, influxdb and transformer were last updated 2026-09-22, so there was no stack deploy. `thinx_vue` dead-env count is 0. |
| 22-02 | 10 | rtm 200 with Login title; LogviewController.js 200 | ✓ VERIFIED | `root=200 logview=200 title=1` (re-run) |
| 22-03 | 1 | Open PR staging→main; PR CodeQL run for the head succeeded | ✓ VERIFIED | PR #569 `OPEN main thinx-staging`, head 9ccf9f18; run 36139870033 success |
| 22-03 | 2 | Analysis under refs/pull/569/merge | ✓ VERIFIED | analysis 1839520597, no error |
| 22-03 | 3 | Check not required (protection + rulesets) | ✓ VERIFIED | `protection=0 rulesets=0` |
| 22-03 | 4 | PR still OPEN, not merged, nothing pushed to main | ✓ VERIFIED | state OPEN, mergedAt empty, no auto-merge, not a draft; `origin/main` = 033ea946 (unchanged) |
| 22-03 | 5 | Default setup still not-configured | ✓ VERIFIED | `not-configured` |
| 22-03 | 6 | main push trigger in YAML | ✓ VERIFIED | `push.branches == [main, thinx-staging]` |
| 22-03 | 7 | Baseline trigger table has the PR row filled and the main row pending | ✓ VERIFIED | `pr_rows=1 placeholder=0 main_row=1` |

**Score:** 32/34 truths verified (roadmap SC 3/4, plan truths 29/30; 0 present but behavior-unverified). Both failures have the same root cause, the Layout footer link.

### Orchestrator-listed pending human checks: disposition

| Check | Disposition |
|---|---|
| CircleCI variable named `VUE_WEB_HOSTNAME` exists | **Resolved programmatically.** Job 15413, which built the live bundle (buildHash `9ccf9f1`), ran the required-vars loop that exits 1 on any empty var in a list containing `VUE_WEB_HOSTNAME`, and printed `All required environment variables are present.` The bundle literal `console.thinx.cloud` is fed only by `--build-arg VUE_APP_CONSOLE_HOSTNAME=${VUE_WEB_HOSTNAME}`. A UI look is optional. |
| Layout footer "THiNX Console" link after login | **Converted to a gap (FAILED).** The source, the live bundle and a runtime repro all show that the href is not rendered. A human look after login would confirm, and the fix needs a human re-check after deploy. |
| Logged-in rtm console retest (console-retest skill) | **Still human.** It needs credentials. The unauthenticated subset passes. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `.github/workflows/codeql-analysis.yml` | CodeQL v4 advanced setup | ✓ VERIFIED | Contains `github/codeql-action/init@v4`; runs green on push and PR |
| `.circleci/config.yml` | Test job without the raw login | ✓ VERIFIED | Contains `--password-stdin dhi.io`; no argv login |
| `22-CODEQL-BASELINE.md` | Phase 23 "before" evidence | ✓ VERIFIED | `Total open alerts: 147`, all sections present, git.js/builder.js section present |
| `22-CODEQL-ALERTS.json` | Reduced alert list | ✓ VERIFIED | 147 records with exact keys; no message or html_url |
| `docker-swarm.yml` | Classic console without the dead env | ✓ VERIFIED | Contains `VUE_APP_GOOGLE_MAPS_APIKEY=...`; no `VUE_APP_CONSOLE_HOSTNAME` |
| `services/console/vue/src/components/Layout/Layout.vue` (goal-derived) | Footer link bound to the Vue console host | ✗ HOLLOW | `:href="this.$hostnames.CONSOLE"` is wired to an empty prototype object, so no data flows |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| codeql-analysis.yml | code scanning (refs/heads/thinx-staging) | analyze@v4 SARIF | ✓ WIRED | 3 analyses on the staging ref |
| config.yml test job | docker-compose.test.yml services | Starting Support Services | ✓ WIRED | dhi login 770 → compose up 771; job green |
| 22-CODEQL-BASELINE.md | Phase 23 | git.js/builder.js section | ✓ WIRED | Section present (alerts 148, 151, 223; git.js none) |
| CircleCI `VUE_WEB_HOSTNAME` | Dockerfile ARG/ENV | config.yml:196 build arg | ✓ WIRED | required-vars pass plus the bundle literal |
| hostnames.js CONSOLE | Login.vue:91, PasswordReset.vue:96 | `mixins: [hostnameMixin]` | ✓ WIRED | Rendered href confirmed live |
| hostnames.js CONSOLE | **Layout.vue:12** | (none) | ✗ NOT_WIRED | Layout declares no mixin; `Vue.prototype.$hostnames` is `{}` |
| repo docker-swarm.yml | gluster thinx.yml + live thinx_console | manual mirror | ✓ WIRED | All three agree (no dead env) |
| PR #569 | pull_request trigger | GitHub event | ✓ WIRED | run 36139870033 |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
|---|---|---|---|---|
| Login.vue footer | `$hostnames.CONSOLE` | mixin, then `process.env.VUE_APP_CONSOLE_HOSTNAME` baked in from `VUE_WEB_HOSTNAME` | Yes: `https://console.thinx.cloud` | ✓ FLOWING |
| PasswordReset.vue footer | `$hostnames.CONSOLE` | same | Yes | ✓ FLOWING |
| Layout.vue footer | `$hostnames.CONSOLE` | `Vue.prototype.$hostnames = {}` (main.js:23) | No: `undefined`, attribute dropped | ✗ DISCONNECTED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Workflow structure | python yaml structural assert | `WF-OK` | ✓ PASS |
| Live bundle host literal | curl app.js, grep consoleHostname | `console.thinx.cloud`, buildHash `9ccf9f1` | ✓ PASS |
| Public-page hrefs | headless Chrome `--dump-dom` on /#/login and /#/password-reset | both `href="https://console.thinx.cloud"` | ✓ PASS |
| Layout footer href | Vue 2.7.16 runtime + vue-template-compiler repro on the real footer templates and the real hostnames.js | Login `"https://console.thinx.cloud"`, PasswordReset `"https://console.thinx.cloud"`, **Layout `undefined`** | ✗ FAIL |
| Authenticated Layout headless | headless Chrome on /#/app/dashboard | Redirects to login (only `auth-footer` rendered) | ? SKIP (needs login) |
| rtm classic console | curl | `root=200 logview=200 title=1` | ✓ PASS |
| D-13 live and gluster | read-only ssh inspect (key names only) | `gluster_dead=0 live_console_dead=0 update=completed running=1 image=UNCHANGED` | ✓ PASS |

### Probe Execution

Step 7c: no probes are declared in the PLAN/SUMMARY files, and this phase has no `scripts/*/tests/probe-*.sh` in scope. SKIPPED.

### Requirements Coverage

| Requirement | Source plan | Description | Status | Evidence |
|---|---|---|---|---|
| CI-01 | 22-01, 22-03 | CodeQL v4/checkout v7 on push main+staging and PR to main; non-required; default setup off | ✓ SATISFIED | SC1 evidence (the main-push run is pending the merge per D-08) |
| CI-02 | 22-01 | Every private-registry login via `registry-login`; no argv password | ✓ SATISFIED | SC2 evidence |
| CI-03 | 22-02 | Vue console footer links point at the Vue console host in the live bundle; dead env removed from docker-swarm.yml | ✗ BLOCKED (partial) | Env removal and the build chain hold; the Layout footer link does not. REQUIREMENTS.md marks it `[x] Complete`, which is inaccurate. |

No requirement is orphaned. REQUIREMENTS.md maps CI-01, CI-02 and CI-03 to Phase 22, and every one of them is claimed by a plan.

### Prohibitions (judgment tier; LLM-judge verdicts are non-authoritative and flagged for human review)

| Plan | Prohibition | Judge verdict | Evidence |
|---|---|---|---|
| 22-01 | No dismiss, suppress or fix of alerts; no widening of paths-ignore | held | No dismissal since the phase start (#118 dates from 2021); paths-ignore is vendored/minified/tests only |
| 22-01 | No alert messages, snippets or URLs in the committed baseline | held | JSON has no message/html_url; md has 0 code-scanning alert URLs |
| 22-01 | No push to main | held | `origin/main` = 033ea946, unchanged |
| 22-02 | Never print env values or the server `.env` | held (from artifacts) | SUMMARY lists key names only; this verification also printed names only |
| 22-02 | Never point the links elsewhere or drop the build arg | held | `arg=1`; the target is `console.thinx.cloud` |
| 22-03 | No secrets, IPs or ssh details in the PR | held | The PR #569 body scan finds no IP, ssh, key, root@ or gluster reference |
| 22-03 | No merge, auto-merge, required check or push to main | held | OPEN, no auto-merge, `protection=0 rulesets=0`, main unchanged |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| services/console/vue/src/components/Layout/Layout.vue | 12 | Template binds `this.$hostnames.*` with no mixin supplying it | 🛑 Blocker | The SC3 layout link renders without an href (the `THiNX Cloud` link in the same footer too) |
| .planning/REQUIREMENTS.md, 22-02-SUMMARY.md | CI-03 | Completion claimed while one of three links was an unconfirmed human-check | ⚠️ Warning | The status overstates what was delivered |
| .circleci/config.yml | test job contexts | Review WR-01: the test job still receives the private-registry push credential through `thinx-docker-repo` | ⚠️ Warning | Least-privilege follow-up; CI-02's wording (routing, no argv) is met |
| AGENTS.md | 13 | Review WR-02: the public repo publishes the root ssh endpoint of the swarm manager | ⚠️ Warning | Outside the phase diff; worth a separate cleanup |
| services/console/.circleci/config.yml | ~138-160 | A-04: the dormant `thinx-console` branch job still logs in to the private registry via the orb `docker/check` with no retry | ℹ️ Info | Outside CI-02's scope (the parent config only) per CONTEXT |
| .github/workflows/codeql-analysis.yml | 28, 31, 32 | Review IN-01..IN-04 (`actions: read` on a public repo, persist-credentials, tag pins, submodules not documented) | ℹ️ Info | Advisory |

No TBD, FIXME or XXX debt markers appear in any file this phase modified.

### Human Verification Required

#### 1. Logged-in classic console retest (rtm.thinx.cloud)

**Test:** Log in at https://rtm.thinx.cloud and run the console-retest skill.
**Expected:** The dashboard loads; the websocket goes to `wss://rtm.thinx.cloud/…`; the Devices page renders with no Angular parse error; the browser console shows no cookie, owner or profile debug logging.
**Why human:** It needs credentials. The unauthenticated checks pass.

#### 2. Confirm the judgment-tier prohibition verdicts

**Test:** Review the Prohibitions table above.
**Expected:** Each one held.
**Why human:** Judgment-tier items are never auto-passed.

(After the gap fix is deployed: log in at console.thinx.cloud and confirm the /app footer "THiNX Console" href is `https://console.thinx.cloud`. That check is part of the gap closure.)

### Follow-up (not a gap, per D-08)

- The main-push CodeQL run happens when the user merges PR #569. Record its run and analysis in the `Push to main` row of `22-CODEQL-BASELINE.md` at that point.
- A-03: after the next `console:swarm` Swarmpit autoredeploy, confirm `thinx_console` still has no `VUE_APP_CONSOLE_HOSTNAME` key.

### Gaps Summary

One root cause blocks the goal clause "the Vue console's THiNX Console links point at the Vue console itself". The authenticated **Layout footer** link has no href at all. `Layout.vue` never gets the hostnames mixin, so `this.$hostnames` resolves to the empty `Vue.prototype.$hostnames = {}` set in `main.js`. The build-time chain the phase set out to prove is correct: CircleCI `VUE_WEB_HOSTNAME` → build arg → Dockerfile ARG/ENV → bundle literal `console.thinx.cloud`. The login and password-reset links are correct live. The defect is pre-existing and not caused by this phase. It stayed hidden because 22-02 deferred the Layout link to a human check while marking CI-03 complete.

The fix is small: add the mixin to Layout.vue in the `services/console` submodule. It must go through the submodule deploy flow (submodule push → parent pointer bump → thinx-staging), followed by a logged-in re-check.

CI-01 and CI-02 are fully achieved. CI-03's env removal (SC4 and D-13 across repo, gluster and live) is fully achieved and verified against live state.

---

_Verified: 2026-09-25T13:30:52Z_
_Verifier: Claude (gsd-verifier)_
