---
phase: 22-ci-sast-baseline
plan: 04
subsystem: ui
tags: [vue-console, submodule, hostname, gap-closure, deploy, tdd]

requires:
  - phase: 22-ci-sast-baseline (22-02)
    provides: "Proven build-arg chain for the Vue console host (the VUE_WEB_HOSTNAME value reaches the served bundle as consoleHostname)"
  - phase: 22-ci-sast-baseline (22-03)
    provides: "PR #569 (thinx-staging to main), left open; its head moves with this plan's push"
provides:
  - "Authenticated Layout footer whose 'THiNX Console' and 'THiNX Cloud' links get their href from the hostnames mixin"
  - "Plain-node regression test tests/unit/footer-hostnames.cjs: renders the real footers of Layout, Login and PasswordReset, and sweeps src for $hostnames readers that lack the mixin"
  - "The fix is live: the served bundle has buildHash 9bf5cf9, and the logged-in check was approved"
  - "CI-03 is checked and Complete in REQUIREMENTS.md; 22-02-SUMMARY has an additive correction note"
affects: [phase-22-reverification, vue-console, console-submodule-main-sync]

actuals:
  tokens: 3089      # chars/4 over the realized diff: parent 2995 chars (gitlink + REQUIREMENTS + 22-02 note) + submodule 9363 chars (Layout.vue, footer test, package.json)
  tasks: 3          # Task 1 tracer, Task 2 checkpoint approved, Task 3 bookkeeping
  commits: 2        # MEASURED: git rev-list --count 6ae36022..HEAD in the parent at SUMMARY time (9bf5cf97, ae770c0b). There is 1 more commit in the console submodule (a5b02467), and the docs metadata commit follows this SUMMARY
plan_head_before: 6ae360221b46e2c1c20a6568083cedf372849364

tech-stack:
  added: []
  patterns:
    - "Per-component hostnames mixin (import hostnameMixin from '@/mixins/hostnames'; mixins: [hostnameMixin]) for every $hostnames reader. Registering it globally was rejected"
    - "Plain-node SFC footer render test: vue-template-compiler parseComponent, then compile only the <footer>, then new Vue with the component's real mixins, then walk the VNodes. No test framework added"

key-files:
  created:
    - services/console/vue/tests/unit/footer-hostnames.cjs
  modified:
    - services/console/vue/src/components/Layout/Layout.vue
    - services/console/vue/package.json
    - services/console (gitlink)
    - .planning/REQUIREMENTS.md
    - .planning/phases/22-ci-sast-baseline/22-02-SUMMARY.md

key-decisions:
  - "22-04 Task 2 gate: on 2026-09-25 (about 14:29Z) the user answered the logged-in /app footer check with 'approved'. No hrefs were pasted, and the executor did not observe the logged-in hrefs itself"
  - "22-04: Layout.vue got the per-component hostnames mixin (2 added lines, template byte-identical). Changing Vue.prototype.$hostnames or adding a global Vue.mixin was rejected because it would run on every component instance"
  - "22-04: only CI-03 was flipped to Complete. CI-01 and CI-02 stay 'Gaps Found' until the phase re-verification restores them"
  - "22-04: submodule main (a0e86707) now trails thinx-staging by the fix commit a5b02467. Syncing it is the user's call (A-22-04-2)"

patterns-established:
  - "Exclude the credential-scan regex's own line when the outgoing range contains the plan that defines it; otherwise the scan matches itself"

requirements-completed: [CI-03]

coverage:
  - id: D1
    description: "Layout, Login and PasswordReset footers render the console and landing hrefs from the hostnames mixin; an unset console var falls back to the serving origin; every $hostnames reader declares the mixin"
    requirement: CI-03
    verification:
      - kind: unit
        ref: "npm --prefix services/console/vue run test:unit (tests/unit/footer-hostnames.cjs) -> rc=0 decl=5 footer=6 fallback=1 envjson=1"
        status: pass
    human_judgment: false
  - id: D2
    description: "The served console.thinx.cloud bundle is the green vue-console-registry build of the pointer-bump commit, and its compiled Layout module imports the hostnames mixin"
    requirement: CI-03
    verification:
      - kind: other
        ref: "served-bundle verify -> hash=9bf5cf9 layout_mixin=1 console=console.thinx.cloud SERVED-BUNDLE-HAS-FIX; CircleCI vue-console-registry job 15424 status=success"
        status: pass
      - kind: automated_ui
        ref: "headless Chrome --dump-dom on /#/login and /#/password-reset -> both anchors present"
        status: pass
    human_judgment: false
  - id: D3
    description: "Logged-in /app footer: THiNX Console -> https://console.thinx.cloud and THiNX Cloud -> https://thinx.cloud"
    requirement: CI-03
    verification:
      - kind: manual_procedural
        ref: "22-04 Task 2 checkpoint; the user answered 'approved' on 2026-09-25"
        status: pass
    human_judgment: true
    rationale: "Only an authenticated browser session renders the Layout footer; the executor has no login"

duration: 19min
completed: 2026-09-25
status: complete
---

# Phase 22 Plan 04: Layout footer hostnames mixin (CI-03 gap closure) Summary

**The authenticated Layout footer now gets its "THiNX Console" and "THiNX Cloud" hrefs from the hostnames mixin, via a two-line Layout.vue fix guarded by a new plain-node footer test. It shipped through thinx-staging only, and console.thinx.cloud serves it as buildHash 9bf5cf9. The user approved the logged-in check, so CI-03 is now Complete.**

## Performance

- **Duration:** about 19 min
- **Started:** 2026-09-25T14:12:14Z
- **Completed:** 2026-09-25T14:31Z. Task 1 finished at about 14:23Z, and the checkpoint was approved at about 14:29Z
- **Tasks:** 3 of 3
- **Files modified:** 6 (3 in the submodule, the gitlink, REQUIREMENTS.md, 22-02-SUMMARY.md)

## Accomplishments

- Layout.vue imports `hostnameMixin` from `@/mixins/hostnames` and declares `mixins: [hostnameMixin]`. The diff against a0e86707 is `layout=2/0`, and main.js is unchanged. Before this, the footer anchors bound to the empty `Vue.prototype.$hostnames = {}` and rendered with no href.
- `tests/unit/footer-hostnames.cjs` renders the real footers of Layout, Login and PasswordReset with their own mixins. It also checks the unset-var fallback to the serving origin, and it fails if any future `$hostnames` reader forgets the mixin. `test:unit` now chains env-json.cjs and footer-hostnames.cjs.
- The fix is live on console.thinx.cloud (buildHash 9bf5cf9), built by a green vue-console-registry job. No main branch moved, and PR #569 stays open and unmerged.
- CI-03 is `[x]` and Complete, and 22-02-SUMMARY has an additive `## Correction (22-04 gap closure)` note.

## Task Commits

1. **Task 1 (tracer, tdd): Layout footer hostnames mixin, footer test, and shipping**
   - submodule `a5b02467` (`fix(vue): give Layout the hostnames mixin so the footer links get an href`), on thinx-cloud/console thinx-staging, a0e8670..a5b0246
   - parent `9bf5cf97` (`chore(22): bump console submodule for the Layout footer hostnames mixin (CI-03)`), pushed to thinx-staging, 9ccf9f18..9bf5cf97
2. **Task 2 (checkpoint:human-verify, blocking): logged-in /app footer check.** No commit. The user's answer, verbatim: **"approved"**
3. **Task 3: CI-03 marked complete and 22-02 correction note.** Parent `ae770c0b` (`docs(22-04): mark CI-03 complete and correct the 22-02 summary overclaim`), local only and not pushed

**Plan metadata:** the docs commit that follows this SUMMARY (SUMMARY, STATE, ROADMAP), local only and not pushed.

## Task 1 evidence

**Precondition and sweep.** The submodule tree was clean, origin/thinx-staging matched the parent gitlink (a0e86707), and the parent was on thinx-staging. The Step A.3 `$hostnames` sweep found no reader missing the mixin other than Layout.

**RED, run before editing Layout.vue.** `test:unit` exited 1. All 19 env-json checks passed. The footer test FAILed on exactly four lines:
- `Layout footer THiNX Console -> undefined`
- `Layout footer THiNX Cloud -> undefined`
- `Layout footer falls back to the serving origin when VUE_APP_CONSOLE_HOSTNAME is unset -> undefined`
- `hostnames mixin declared: src/components/Layout/Layout.vue`

Login and PasswordReset passed. The `gsd check tdd-red-evidence` verdict was `RED_EVIDENCE_OK / target_test_failed` (32 tests: 28 pass, 4 fail). The raw RED and GREEN output was saved to red.txt and green.txt in the session scratchpad.

**GREEN, after the two-line fix.** `rc=0 decl=5 footer=6 fallback=1 envjson=1`. The fallback check resolves to `https://served-origin.invalid`.

**Diff shape.** `files=vue/package.json vue/src/components/Layout/Layout.vue vue/tests/unit/footer-hostnames.cjs`, `layout=2/0 import=1 mixins=1`, `MAIN-JS-UNCHANGED`.

**Credential scan before the parent push.** `outgoing_lines=1228`, `excluded_self_lines=1`, 0 hits. See Deviations: the first run printed `secret_hits=1`, which was the scan matching its own regex line.

**Push verify.** `SUB-STAGING-HAS-FIX`, `sub_main=a0e86707`, `PARENT-STAGING-POINTER-HAS-FIX`, `parent_main=033ea946`, `bump_files=services/console`, and `CI-CONFIG-UNCHANGED`. PR #569 was not touched; its head moved to 9bf5cf97, as the plan expected (A-22-04-3).

**Build.** The thinx-staging queue had drained to 0 by 14:15:57Z. CircleCI `vue-console-registry` job **15424** was queued at 14:16:41Z and succeeded at 14:21:46Z.

**Rollout.** `PRE_HASH=9ccf9f1`. At 14:21:57Z the served bundle printed `hash=9bf5cf9 layout_mixin=1 console=console.thinx.cloud SERVED-BUNDLE-HAS-FIX`. **No recovery was needed:** no ssh, and no service was updated.

**Public pages (headless Chrome).**
- `[login]`: `href="https://console.thinx.cloud"` THiNX Console and `href="https://thinx.cloud"` THiNX Cloud. The login build id reads 9bf5cf9.
- `[password-reset]`: `href="https://console.thinx.cloud"` THiNX Console and `href="https://thinx.cloud"` THiNX Cloud.

**Submodule `Test Vue console` (informational, not a gate).** Job 846 on a5b02467 failed in the step "Install dependencies and build". This predates the change. See Deferred Items.

## Task 2 result (logged-in check)

- **User's answer, verbatim:** "approved". Typed on 2026-09-25 at about 14:29Z UTC.
- **Observed hrefs:** none recorded. The user did not paste hrefs, and the executor did not observe the logged-in hrefs itself. The expected values from the checkpoint were `THiNX Console -> https://console.thinx.cloud` and `THiNX Cloud -> https://thinx.cloud`. The approval confirms them.

## Task 3 results

- REQUIREMENTS verify: `req=1 row=1 numstat=2/2`
- 22-02-SUMMARY verify: `note=1 removed=0 order=before-performance`
- The correction note names console fix a5b0246, buildHash 9bf5cf9 and the approval date 2026-09-25. It contains no host, port, key or env value; a grep of the note for URL, port, ssh, key and env-name patterns returned 0.

## TDD Gate Compliance

The plan required a single submodule commit containing both the test and the fix (Task 1 step D), so there is no separate `test(...)` RED commit. The RED gate is proven by the recorded RED run above, taken before Layout.vue was edited, and by the `RED_EVIDENCE_OK / target_test_failed` verdict. GREEN is the same test at `rc=0`. No refactor step was needed.

## Files Created/Modified

- `services/console/vue/src/components/Layout/Layout.vue`: adds the hostnames mixin import and the `mixins` entry. The template is unchanged.
- `services/console/vue/tests/unit/footer-hostnames.cjs` (new): plain-node footer and defect-class regression test.
- `services/console/vue/package.json`: `test:unit` chains both unit scripts. No dependency changes.
- `services/console` (gitlink): bumped from a0e86707 to a5b02467.
- `.planning/REQUIREMENTS.md`: CI-03 is `[x]` and Complete.
- `.planning/phases/22-ci-sast-baseline/22-02-SUMMARY.md`: additive correction note.

## Decisions Made

- Used the per-component mixin, matching Login, PasswordReset, OAuthReturn and Visits, instead of the verifier's alternative of a global `$hostnames` or `Vue.mixin`. A global mixin would run the hostnames `data()` and `created()` on every component instance.
- CI-03 was marked complete only after the "approved" answer. CI-01 and CI-02 were left for the phase re-verification.
- No push after Task 2. The remaining commits are `.planning` docs, and the orchestrator decides whether to push them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The credential scan matched its own regex line**
- **Found during:** Task 1, step F.2 (pre-push credential scan)
- **Issue:** The first run printed `secret_hits=1`. The only hit was the Task 1 `<verify>` line in 22-04-PLAN.md, which contains the literal `github_pat_` / `sk_live_` patterns. The plan commit is part of the outgoing range.
- **Fix:** Re-ran the scan with that one self-referencing line excluded: `outgoing_lines=1228`, `excluded_self_lines=1`, 0 hits.
- **Files modified:** none
- **Verification:** 0 hits on every other outgoing added line
- **Lesson:** future plans should have the scan exclude its own pattern line.

---

**Total deviations:** 1 (Rule 3).
**Impact on plan:** none. No credential was in the outgoing range, and the scan's coverage was not reduced beyond the one self-referencing line.

## Issues Encountered

None beyond the deviation above. Everything else followed the planned path: the queue drained, the build was green, the rollout was automatic, and no recovery rung was needed.

## Deferred Items

- **Submodule `Test Vue console` CircleCI job is failing (pre-existing, out of scope).** Job 846 on a5b02467 failed in "Install dependencies and build". It has failed on every thinx-staging run since job 836 (rev 24e1db63, 2026-09-23). The last green run was job 834 (rev 98ff2509, 2026-09-22). It is not the deploy path, and this plan did not cause it.
- **Submodule main sync (A-22-04-2).** thinx-cloud/console `main` (a0e86707) trails `thinx-staging` by the fix commit a5b02467. Syncing it is the user's call.
- **Local docs commits not pushed.** ae770c0b and the metadata commit are local on parent thinx-staging. The orchestrator decides whether to push them.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- The single CI-03 gap from 22-VERIFICATION is closed. The phase can be re-verified, and that re-verification should restore CI-01 and CI-02, which the verifier had found satisfied.
- Still open and out of scope: WR-01/WR-02, A-04, IN-01 to IN-06, the main-push CodeQL row (pending PR #569), and the logged-in rtm classic-console retest.

---
*Phase: 22-ci-sast-baseline*
*Completed: 2026-09-25*

## Self-Check: PASSED

- FOUND: Layout.vue, footer-hostnames.cjs, package.json (submodule), 22-04-SUMMARY.md
- FOUND: commits 9bf5cf97, ae770c0b (parent) and a5b02467 (submodule); the parent gitlink pins a5b02467
- Remote heads at self-check: parent origin/main 033ea946 (unchanged), origin/thinx-staging 9bf5cf97; nothing pushed after Task 1
