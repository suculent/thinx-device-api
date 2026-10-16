---
phase: 48-deep-links-close-out
plan: 06
subsystem: deploy
tags: [deploy, console, legacy, vue, ci, records, verification, uat, circleci, halted]
status: halted

requires:
  - phase: 48-deep-links-close-out
    provides: "48-01..48-05 console fixes and CI gate; 48-07 crash-proof JUnit reporter; 48-08 deep-link flake fix and pipeline 5677"
provides:
  - "FIX-01 ledger: 35-REVIEW-DISPOSITION.md IN-01..IN-08 fixed with console commits, open: 0 (c1ac35aa)"
  - "ROADMAP Phase 48 carried items fixed / deferred (D-15) (c1ac35aa)"
  - "Gitlink bump c4702044 and ship of console + parent thinx-staging; Phase 48 live via pipeline 5677 (parent 24d2b7cd, console 512ddb5)"
  - "Pipeline proof CI-GATES PIPELINE OK 5677 and JUnit proof (job 16075, 77 results, 0 failures)"
  - "Live proof: API surface 401s, Vue bundle id + 7 markers, Legacy D-09 markers, port 7442 200, WS-MULTITAB 2/2"
affects: [48-verify, CI-06, CI-07, NOTIF-04, POL-01, FIX-01, v1.18 close]

actuals:
  tokens: 9500       # chars/4: the two record files' diff in c1ac35aa (~6 KB) plus this SUMMARY (~32 KB)
  tasks: 2           # Task 1 done; Task 2 run, halted on verify 2 (over-broad marker)
  commits: 13        # MEASURED: git rev-list --count 7994236b..HEAD after the SUMMARY commit; includes 48-07/48-08 commits (see Task Commits)
plan_head_before: 7994236b4ea336ae81faa4ff886c6cafb1a98c9d
plan_head_after: (the SUMMARY docs commit; see Task Commits)

tech-stack:
  added: []
  patterns:
    - "Resume a halted ship plan against the pushed SHA (H) rather than the local HEAD when only .planning/ commits sit above it"

key-files:
  created:
    - .planning/workstreams/vue-console/phases/48-deep-links-close-out/48-06-SUMMARY.md
  modified:
    - .planning/milestones/v1.16-phases/35-console-usability/35-REVIEW-DISPOSITION.md
    - .planning/workstreams/vue-console/ROADMAP.md
    - services/console (gitlink 54734af -> 1d68915 in c4702044; later 512ddb5 via 48-07/48-08)

key-decisions:
  - "Resumed at Task 1 step 8 with H=24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed (pipeline 5677) per 48-08; steps 1-7 were not redone (their commits c1ac35aa, c4702044 and the 2026-10-15 push are verified present)"
  - "Task 2 verify 2 fails as written: 'still served: flaticon-settings-10'. The only hit is the pre-existing icon-font CSS rule `.flaticon-settings-10 { background-image: ... }` from vue/src/styles/_icons.scss (unchanged since 597fe51), compiled into the JS bundle; the Header cog markup `fi flaticon-settings-10` went from 1 (before) to 0 (after). Halted per the stop rule; operator/verifier to accept the false positive or amend the check"

requirements-completed: []   # halted: FIX-01, CI-06, CI-07, NOTIF-04, POL-01 not marked complete by this plan

coverage:
  - id: D1
    description: "Phase 35 ledger IN-01..IN-08 fixed with console commits, open: 0; ROADMAP carried items fixed / deferred (D-15)"
    requirement: FIX-01
    verification:
      - kind: other
        ref: "48-06 Task 1 verify 1 (rerun 2026-10-16T13:1xZ, rc 0, records commit c1ac35aa)"
        status: pass
    human_judgment: false
  - id: D2
    description: "One thinx-staging pipeline gated the Vue image on test-vue-console and built the Legacy image (no snyk-*)"
    requirement: CI-06
    verification:
      - kind: other
        ref: "node scripts/check-ci-gates.js pipeline --revision 24d2b7cd… --expect legacy-on --wait (CI-GATES PIPELINE OK 5677)"
        status: pass
    human_judgment: false
  - id: D3
    description: "CircleCI holds the Cypress JUnit results of test-vue-console (>= 60, no failure)"
    requirement: CI-07
    verification:
      - kind: other
        ref: "48-06 Task 1 verify 5: JUNIT job 16075 status success results 77 failures 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "console.thinx.cloud serves the Phase 48 Vue bundle (id 24d2b7c, 7 markers) without the settings cog or old Build Firmware glyph"
    requirement: POL-01
    verification:
      - kind: other
        ref: "48-06 Task 2 verify 2 (FAIL as written: flaticon-settings-10 CSS rule; cog markup 0, markers all present)"
        status: fail
    human_judgment: true
    rationale: "The automated check's string also matches the icon-font CSS rule; a human/verifier must accept the scoped evidence (markup count 0) or amend the check"
  - id: D5
    description: "rtm.thinx.cloud serves the Legacy D-09 fixes (absent in the baseline)"
    requirement: CI-06
    verification:
      - kind: other
        ref: "48-06 Task 2 verify 3 rc 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "API surface unchanged (401s), port 7442 as before (200), WebSocket multi-tab 2/2"
    requirement: CI-07
    verification:
      - kind: other
        ref: "48-06 Task 2 verify 1 rc 0, verify 4 rc 0 (WS-MULTITAB OK 2/2 opened)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Operator end-of-phase UAT (ten human checks)"
    requirement: NOTIF-04
    verification: []
    human_judgment: true
    rationale: "Logged-in interactive checks (deep-link reload, Build Firmware, account menu, Legacy toasts, console-retest, env file result) need the operator"

duration: "Task 1 steps 1-7 on 2026-10-15 (~17:2x-17:53Z); resume 2026-10-16 ~13:10Z-13:27Z"
completed: 2026-10-16
---

# Phase 48 Plan 06: Records and Ship Summary (HALTED at Task 2 verify 2)

**Phase 48 is shipped and live. Pipeline 5677 (`CI-GATES PIPELINE OK 5677`, 77 JUnit results, 0 failures) built the Vue image only after a green Cypress gate, and it built the Legacy image too. console.thinx.cloud serves bundle `24d2b7c` with all seven Phase 48 markers, and rtm.thinx.cloud serves every Legacy D-09 fix. The API surface, port 7442 (200) and the WebSocket probe (2/2) are unchanged. The plan is halted on Task 2 verify 2 alone. Its `flaticon-settings-10` string also matches the untouched icon-font CSS rule compiled into the bundle, while the actual cog markup in the header went from 1 to 0.**

## Status

**halted**: Task 2 verify 2 exits 1 with `still served: flaticon-settings-10`. Per the stop rule nothing was edited, rerun or re-triggered. Every other automated gate of the plan passes. The scoped evidence below shows that the settings cog is gone from the served header markup. Decision needed: accept the false positive (Task 2 then counts as passed and 48-06 closes), or amend the check to look for the markup form `fi flaticon-settings-10` and rerun Task 2 verify 2.

## Performance

- **Task 1 steps 1-7:** 2026-10-15 (records commit 17:51:23Z, gitlink 17:52:34Z, parent push 17:53:12Z). They stopped at step 8 on pipeline 5675 (red `test-vue-console`).
- **Resume (this run):** 2026-10-16, about 13:10Z to 13:27Z. Task 1 step 8 and step 9 plus Task 2.
- **Tasks:** Task 1 is complete. Task 2 ran all four checks: 3 pass, and verify 2 fails as written.

## Resume context

- 48-06 originally stopped at Task 1 step 8: pipeline 5675 had a red `test-vue-console` (device-detail load timeouts plus the bundled mocha-junit-reporter crash), and the Vue image was not built. 48-07 fixed the reporter crash (console `4358845`, `16bb611`, `0692f0f`; parent `e13933a3`) but halted on pipeline 5676, an intermittent logged-out deep-link failure. 48-08 found the root cause and fixed it (console `9a0e1cd`, `09fbde1`, `512ddb5`; parent `24d2b7cd`). Its pipeline 5677 was green.
- This run resumed with `H=24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed` in place of `git rev-parse HEAD`. The two local commits above H (`40866388`, `573d415d`) touch only `.planning/` (`git diff --name-only H HEAD` shows ROADMAP.md, STATE.md and 48-08-SUMMARY.md), and they ride the next push.
- Steps 1-7 were **not** redone. Their outputs exist: records commit `c1ac35aa`, gitlink `c4702044` (changes only `services/console`), and parent push `fc0fa013..c4702044` at 2026-10-15T17:53:12Z (remote-tracking reflog).

## Task 1: records, ship, pipeline and JUnit proof

### Step 1 (preflight), 2026-10-15, earlier session

The earlier session ran the preflight (parent spec plus `check-ci-gates.js compile`; Vue `test:unit` in both locales, build, `test:csp:dist`, `perf:spotter`; Legacy unit tests, `test:csp`, `build:test`, `test:csp:built`) before the records commit and the push. It did not persist the per-command output beyond the commits and STATE.md. 48-07 and 48-08 each repeated the Vue unit, build and parent spec preflight before their pushes (48-08: `test:unit` 431 ok and 0 FAIL in both locales, build rc 0, `CiPipelineGates.test.js` 27/27, `CI-GATES COMPILE OK`).

### Step 2: records (FIX-01 ledger)

Records commit `c1ac35aa G docs(48-06): record the phase 35 ledger and the carried items` changes exactly the two record paths. Verify 1 was rerun in this session and exited 0. The ledger IN rows:

```
| IN-01 | info | fixed | console `056ef3c` (Phase 48, 48-01) |
| IN-02 | info | fixed | console `ed429ec` (Phase 46, 46-02) |
| IN-03 | info | fixed | console `2105310` (Phase 48, 48-04, Legacy) |
| IN-04 | info | fixed | console `31ed738` (Phase 45, Vue); console `2105310` (Phase 48, 48-04, Legacy) |
| IN-05 | info | fixed | console `bff9552` (Phase 48, 48-04, Legacy) |
| IN-06 | info | fixed | console `38eb95b`, `f64a153` (Phase 47) |
| IN-07 | info | fixed | console `002e051` (Phase 47, 47-01) |
| IN-08 | info | fixed | console `824687f`, `794f357` (Phase 48, 48-01, Vue) and `efc66f6` (Phase 48, 48-04, Legacy); existing checks cited in 48-01-SUMMARY (IN-08 coverage map) |
```
Every SHA cited (`002e051 056ef3c 2105310 31ed738 38eb95b 794f357 824687f bff9552 ed429ec efc66f6 f64a153`) is signed (`G`) and is an ancestor of the console HEAD.

### Step 3: baselines (2026-10-15 ~17:51Z, in `${TMPDIR}/p48-*`, left unchanged)

| Baseline | Value |
|----------|-------|
| Vue `p48-app-before.js` | 3,235,515 B, id `fc0fa01` (x2) |
| Vue markers before | action-build-spinner 0, device-detail-content 0, Requesting build 0, la-user-circle 0, Account menu 0, List view 0, Grid view 0; flaticon-settings-10 2 (1 CSS rule + 1 Header markup `fi flaticon-settings-10`), `fa fa-cogs mr-1` 1 |
| Legacy before | DeploykeyController sentence 0; DevicesController `Build queued.` 0, status-field toast 1; LogviewController `deviceBuilds` init 0; thinx-api.js `goals.length > 0` in updateDeploykeys 0 |
| Port 7442 | `200` (`p48-port7442-baseline`) |
| origin main | `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf` (unchanged: `git ls-remote` gives the same SHA on 2026-10-16) |

### Steps 4-7: console and parent ranges (2026-10-15)

Console `54734af..1d68915` (all `G`, Phase 48 paths): 22 commits, from `bc9f2a6` (deep-link RED) to `1d68915` (aria-pressed). The 48-07/48-08 console follow-ups `4358845 16bb611 0692f0f 9a0e1cd 09fbde1 512ddb5` (all `G`) were pushed by those plans.

Parent `fc0fa013..c4702044`: 29 commits, all `G`, no merges. Outside `.planning/` the push changed only `.circleci/config.yml`, `scripts/check-ci-gates.js`, `services/console` and `spec/node/CiPipelineGates.test.js`. Head of the range:
```
c4702044 G chore(48): bump console to the phase 48 close-out (NOTIF-04, POL-01, FIX-01, CI-06, CI-07)
c1ac35aa G docs(48-06): record the phase 35 ledger and the carried items
7994236b G docs(48-05): record plan 48-05 progress (state, roadmap)
...
8e3d636b G ci(48): gate the vue console image on the vue test suite (CI-07, D-01)
4ba6c5e9 G ci(48): build the legacy console by default again (CI-06, D-08)
```
Push time: 2026-10-15T17:53:12Z. Later pushes on thinx-staging: `c4702044..e13933a3` (48-07, 09:44:09Z) and `e13933a3..24d2b7cd` (48-08, 2026-10-16T12:29:38Z).

### Step 8: pipeline proof, verify 4 (H = 24d2b7cd)

The first attempt, pipeline 5675 on `c470204`, failed (kept as `${TMPDIR}/p48-pipeline-5675.txt`):
```
CI-GATES PIPELINE FAIL 5675 2 problems
CI-07: required job test-vue-console ended failed
CI-05: required job vue-console-registry ended not_run
```
Resumed run, rc 0:
```
pipeline 5677 da6cd4e3-01b2-46cf-b110-7f69ddb14a3d branch=thinx-staging revision=24d2b7c
legacy-console: console-classic-registry (success)
main: test-vue-console (success)
main: vue-console-registry (success)
main: test (success)
main: api-registry (success)
CI-GATES PIPELINE OK 5677
```

### Step 9: JUnit proof (verify 5) and sync (verify 6)

Verify 5, rc 0:
```
JUNIT job 16075 status success results 77 failures 0
```
Verify 6 against H, rc 0:
```
parent origin/thinx-staging 24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed  (= H)
console origin/thinx-staging 512ddb5c2c272ea9eae136bf0fa79f4138374857
gitlink@H                    512ddb5c2c272ea9eae136bf0fa79f4138374857
console HEAD                 512ddb5c2c272ea9eae136bf0fa79f4138374857
```
Acceptance note: `git log -1 -- services/console` now shows 48-08's bump `24d2b7cd G chore(48): bump console to the logged-out deep-link redirect fix`, which changes only `services/console`. The 48-06 bump `c4702044` is the earlier signed gitlink commit and also changes only `services/console`.

## Task 2: live proof

### Rollout timeline (push of H at 12:29:38Z)

- Served Vue `/js/app.js` `last-modified: 12:40:26Z`. Legacy `DeploykeyController.js` `last-modified: 12:31:18Z` (the pipeline 5677 legacy image).
- (a) and (b) held at the first poll of this run, 13:14:24Z: the bundle carries `24d2b7c` and the Legacy marker is present.
- (c) `/api/user/profile`: 13:14:24Z, 13:14:41Z and 13:14:57Z gave 401, and then 40 polls every 15 s from 13:15:10Z to 13:25:04Z all gave 401. **API restart not observed.** It happened before this run started (the API image was rebuilt by pipeline 5677). The checks started after 10 minutes of 401s from the first sighting of (a).

### Verify 1: API surface, 13:25:39Z, rc 0

```
GET rtm.thinx.cloud /api/v2/logs/build/x 401
GET console.thinx.cloud /api/v2/logs/build/x 401
GET rtm /api/v2/logs/build 401
GET rtm /api/user/profile 401
```

### Verify 2: Vue bundle, 13:25:41Z, rc 1 (HALT)

Output: `still served: flaticon-settings-10`.

| Item | Before (`fc0fa01`) | After |
|------|--------------------|-------|
| bundle `/js/app.js` size | 3,235,515 B | 3,242,160 B |
| parent id | `fc0fa01` x2 | `24d2b7c` x2 (matched) |
| action-build-spinner | 0 | 1 |
| device-detail-content | 0 | 3 |
| Requesting build | 0 | 1 |
| la-user-circle | 0 | 1 |
| Account menu | 0 | 1 |
| List view | 0 | 2 |
| Grid view | 0 | 2 |
| `fa fa-cogs mr-1` (old Build Firmware glyph) | 1 | **0** |
| `flaticon-settings-10` total | 2 | **1** |
| of which CSS rule `.flaticon-settings-10 {` | 1 | 1 |
| of which Header markup `fi flaticon-settings-10` | 1 | **0** |

The remaining hit is the icon-font stylesheet rule, which css-loader inlines into the JS bundle:
```
.flaticon-settings-10 {\n  background-image: url(" + ___CSS_LOADER_URL_REPLACEMENT_136___ + ");\n}
```
Its source is `services/console/vue/src/styles/_icons.scss:198`, last changed in `597fe51 renamed base folder` and not in Phase 48's scope (48-03 removed the cog from `Header.vue`, and its own gate is scoped to `Header.vue`). In the before bundle the second hit was the Header's `staticClass: "fi flaticon-settings-10 px-2"` inside `slot: "button-content"`, and that markup is now gone. The settings cog is therefore not served. The plan's marker is over-broad.

### Verify 3: Legacy files, 13:26:18Z, rc 0

| File | After size | Marker (before → after) |
|------|-----------|--------------------------|
| DeploykeyController.js | 6,844 B | `Could not generate the deploy key. Try again.` 0 → 1 |
| DevicesController.js | 12,342 B | `Build queued.` 0 → 1; status-field toast `response.status + "<br>` 1 → 0 |
| LogviewController.js | 13,343 B | `Array.isArray( $rootScope.meta.deviceBuilds[ msg.udid ] )` 0 → 1 |
| thinx-api.js | 39,028 B | `goals.length > 0` in `updateDeploykeys` 0 → 2 |

The baseline does not carry the new deploy-key sentence, so the baseline is valid.

### Verify 4: port 7442 and WebSocket, 13:26:20Z, rc 0

```
port7442 now=200 baseline=200
socket 1: opened, close 1008
socket 2: opened, close 1008
WS-MULTITAB OK 2/2 opened
```
It passed on the first try, so no retry was needed. Port 7442 and plain MQTT were only observed, never touched.

## FIX-01 ledger

- `.planning/milestones/v1.16-phases/35-console-usability/35-REVIEW-DISPOSITION.md`: IN-01..IN-08 are `fixed`, with console commits per row (table above). Frontmatter has `open: 0` and `total: 16`, and all 16 dispositions are `fixed`.
- `.planning/workstreams/vue-console/ROADMAP.md` Phase 48: the carried items from Phases 43, 45 and 44 are annotated `fixed in console <id> (48-0n)`. View-log limits are `deferred (D-15): needs a paging and live-refresh design; not a Phase 35 item`.

## Pending end-of-phase UAT (operator, logged in after a hard reload)

1. Rollout: Swarmpit (https://swarmpit.thinx.cloud/#/tasks) shows the Vue console, the Legacy console and the API tasks started after the push time in the SUMMARY (push of H: 2026-10-16T12:29:38Z).
2. Deep links (NOTIF-04): on https://console.thinx.cloud open /#/app/history and reload: you stay on History (URL /#/app/history/audit) and the dashboard never flashes; reload /#/app/devices and a device page: they stay; log out, then load /#/app/history: you land on the login page.
3. Build Firmware (POL-01): on a device page click Build Firmware: the button shows a small spinner and is disabled until the reply, then "Build triggered."; a quick double click sends one POST /api/v2/build (DevTools Network); with the keyboard (Tab to the button, Enter) focus returns to the button afterwards.
4. Account menu (POL-01): the header shows a user-circle icon with the hover tip "Account"; DevTools > Accessibility names the toggle "Account menu"; My Profile and Log Out work.
5. Device Detail on a wide window: the content column stops at about 1140px and stays left-aligned under the title.
6. Device list (D-14): the list/grid toggles show "List view"/"Grid view" tips; Tab reaches the warning markers and their tips appear on focus; Platform sort matches the pill order with unknown last; selecting rows and re-sorting keeps the selection on the same devices.
7. A danger alert (any failed action) shows white text and a visible close button.
8. Legacy (https://rtm.thinx.cloud): on Deploy Keys create a key whose name contains a pasted tab: the toast says "The name contains a control character, such as a tab or a line break." and Create works again; a normal name creates the key. Build a device: the "THiNX Builder" toast reads "Build started." or "Build queued." then "Click to show build log..."; a device with no build history shows its build toasts; in a fresh tab first open a build log overlay, then trigger a build elsewhere: that tab receives notifications without a reload.
9. Run the console-retest project skill against https://rtm.thinx.cloud/ (D-10: the Legacy fixes get no other human UAT).
10. Legacy Cypress env file (48-05, D-05): record the operator's result ("no real credential" or "rotated …").

Also for the operator: accept or reject the Task 2 verify 2 false positive (see Status).

## Task Commits

48-06's own commits:
- `c1ac35aa G docs(48-06): record the phase 35 ledger and the carried items` (Task 1 step 2, 2026-10-15)
- `c4702044 G chore(48): bump console to the phase 48 close-out (NOTIF-04, POL-01, FIX-01, CI-06, CI-07)` (Task 1 step 5, 2026-10-15)
- `ac2c707c G docs(48-06): record CI gate blocker and harden-CI decision` (step 8 stop record, 2026-10-16)
- this SUMMARY's docs commit (resume)

The resume has no code or record changes: Task 1 steps 8-9 and Task 2 are read-only. `commits: 13` is measured from `plan_head_before` 7994236b, and that range also contains the 48-07 and 48-08 plan, ship and docs commits that ran between the stop and the resume.

**Nothing was pushed in this run.** The SUMMARY and state commits stay local and ride the next thinx-staging push, because a docs-only push would start another rollout.

## Deviations from Plan

1. **[Resume instruction] H pinned to the pushed SHA.** Verify 4, 5 and 6 used `H=24d2b7cd8b1b5b315247ab47e9eb3ade38de73ed` instead of `git rev-parse HEAD`, and Task 2 verify 2 matched its id (`24d2b7c`). The commits above H are `.planning/` only.
2. **[Resume instruction] Steps 1-7 not redone.** Their commits and push were verified present.
3. **[Plan check defect, halted] Task 2 verify 2 `flaticon-settings-10`.** The plan's check also matches the untouched icon-font CSS rule. I left the check as written and recorded the failure. A scoped count shows the cog markup is gone.
4. **[Evidence] `p48-pipeline.txt` overwritten by verify 4** (5677), as the plan intends. The 5675 output was copied to `p48-pipeline-5675.txt` first. `p48-app.js` and `p48-legacy-after-*` were rewritten by Task 2. The "before" baselines were not touched.
5. **[Evidence gap] The 2026-10-15 preflight logs** were not persisted by the earlier session (see Step 1).

## Threat Flags

None. No new surface. All probes were unauthenticated GETs and the credential-free WebSocket probe. There was no ssh, no service command, no login and no `.env*` read.

## Next

- If the operator accepts the verify 2 false positive, mark 48-06 complete and mark FIX-01, CI-06, CI-07, NOTIF-04 and POL-01 complete, then run the end-of-phase UAT.
- Otherwise amend 48-06 Task 2 verify 2 to look for `fi flaticon-settings-10` (the markup) instead of the bare class, and rerun that check only.

---
*Phase: 48-deep-links-close-out*
*Resumed and halted: 2026-10-16*

## Self-Check: PASSED

Files: 48-06-SUMMARY.md, 35-REVIEW-DISPOSITION.md present. Commits c1ac35aa, c4702044, ac2c707c, 24d2b7cd are ancestors of HEAD; console 512ddb5 is an ancestor of the console HEAD. (Self-check covers the claims in this file; the plan status itself is halted.)

Note: `roadmap.update-plan-progress` counts SUMMARY files and ticked 48-06 `[x]` (8/8), as it did for halted 48-07. The phase row stays "In Progress".
