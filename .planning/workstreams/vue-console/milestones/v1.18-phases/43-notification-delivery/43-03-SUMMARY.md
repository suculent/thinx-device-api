---
phase: 43-notification-delivery
plan: 03
subsystem: deploy
tags: [deploy, ci, circleci, legacy-console, verification, websocket]
status: complete

requires:
  - phase: 43-01
    provides: SocketUpgrade per-connection/per-owner tracking and the scripts/check-ws-multitab.js live probe
  - phase: 43-02
    provides: Build Status frames through messenger.sendToOwner (NOTIF-03)
  - phase: 42
    provides: CI-05 legacy-console gate (build_legacy_console, default false) and scripts/check-ci-gates.js
provides:
  - thinx-staging at b1126b6c (Phase 43 API) deployed by pipeline 5659, legacy-off, no Snyk job
  - NOTIF-02 live on rtm.thinx.cloud (WS-MULTITAB FAIL 1/2 before, OK 2/2 after)
  - NOTIF-01 live evidence: served LogviewController byte-identical to console gitlink cfff199 source (wss substituted), carries thinxEscapeHtml
  - Closed-gate proof (build_legacy_console default false, CI-GATES COMPILE OK) and the D-16 human checks queued for UAT
affects: [43 verification / HUMAN-UAT, Phase 44 first push, Phase 48 CI-06]

actuals:
  tokens: 4200
  tasks: 3
  commits: 0
plan_head_before: b1126b6c9db3bfee5b6c1e90d1241536f5dbd2e1
plan_head_after: b1126b6c9db3bfee5b6c1e90d1241536f5dbd2e1

tech-stack:
  added: []
  patterns:
    - "Ship-and-prove plan: push only, then unauthenticated reads (CircleCI public API, rtm.thinx.cloud, Codacy public API) and a cookie-less WebSocket probe"

key-files:
  created:
    - .planning/workstreams/vue-console/phases/43-notification-delivery/43-03-SUMMARY.md
  modified: []

key-decisions:
  - "Operator replied skip-bypass at Task 2: no build_legacy_console=true pipeline was triggered; NOTIF-01 is recorded as live through the last pre-CI-05 legacy build (pipeline 5653, console ff6e809), whose served LogviewController already equals the current console gitlink cfff199 source"
  - "Roadmap Phase 43 success criterion 2 ('through a one-off legacy console build') is NOT executed by operator choice; recorded as a deviation. CI-06 in Phase 48 rebuilds the Legacy image anyway"
  - "Codacy PR #573 status is frozen at its merge head 2e018d7f (Closed, isUpToStandards false, 5 new issues); later analysed commits b7ea0959, 7cec687b and the pushed head b1126b6c report newIssues 0"

patterns-established: []

requirements-completed: [NOTIF-01, NOTIF-02, NOTIF-03]

duration: ~25min (Task 3; Task 1 by the previous executor, Task 2 operator)
completed: 2026-10-13
---

# Phase 43 Plan 03: Ship Notification Delivery and Prove It Live Summary

**Phase 43 API pushed to thinx-staging (pipeline 5659, legacy-off, green), production accepts two sockets per owner path (WS-MULTITAB OK 2/2), and the served Legacy LogviewController already carries the escaped toast; the one-off legacy bypass was skipped by the operator.**

## Performance

- **Duration:** Task 1 2026-10-12 (previous executor); Task 2 operator reply `skip-bypass`; Task 3 about 25 min on 2026-10-13
- **Completed:** 2026-10-13T07:40Z
- **Tasks:** 3 of 3 (Task 2 resolved as `skip-bypass`)
- **Files modified:** 0 repository files (deploy and evidence only); this SUMMARY

## Accomplishments

- Pushed `7cec687b..b1126b6c` (21 commits, all `G`) to `thinx-staging`; outside `.planning/` the range changes the 10 phase files of 43-01/43-02 plus `README.md` (operator commit d3b8a2ec): 11 files, +1563/-190.
- Pipeline 5659 on b1126b6 ran `test`, `api-registry`, `vue-console-registry` to success, no `console-classic-*` and no `snyk-*` job (`CI-GATES PIPELINE OK 5659`).
- NOTIF-02 live: `WS-MULTITAB FAIL 1/2` before the rollout, `WS-MULTITAB OK 2/2 opened` after it and again in Task 3.
- NOTIF-01 live: the served `LogviewController.js` is byte-identical to `services/console` gitlink `cfff199` source with `<ENV::wssUrl>` replaced, and contains `thinxEscapeHtml( msg.body )` and `THINX_NID_PATTERN`.
- CI-05 still in effect: `build_legacy_console` is `{"type":"boolean","default":false}`; compile selects `test,vue-console-registry,api-registry` for thinx-staging with the parameter false.
- origin `main` unchanged at `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf`.

## Task Commits

This plan makes no source commits. Task 1's only git write was the push of existing commits:

1. **Task 1 (tracer): push thinx-staging, prove pipeline and NOTIF-02** - pushed `7cec687b..b1126b6c` (no new commit)
2. **Task 2 (operator checkpoint)** - operator replied `skip-bypass`; nothing triggered
3. **Task 3: prove live state and closed gate, queue human checks** - read-only; no commit

Pushed range (`git log --format='%h %G? %s' 7cec687b..b1126b6c`):

```
b1126b6c G docs(43-02): record plan 43-02 completion in STATE and ROADMAP
5afc7f83 G docs(43-02): complete Build Status frames to the owner plan
dcb93445 G feat(43-02): queued builds notify the owner through the app messenger (D-12)
263cc5f6 G test(43-02): add failing queued-build notification specs (D-12)
ecac53d5 G feat(43-02): one terminal Build Status frame per build, failures never green, no log lines
1a9b6597 G test(43-02): add failing Build Status frame rule specs F-1..F-4
d92b82b6 G feat(43-02): send Build Status frames to the build owner through sendToOwner
bc2729bc G test(43-02): add failing owner-bound Build Status frame specs
28f106e9 G docs(43-01): record plan 43-01 completion in STATE and ROADMAP
9a9ba69b G docs(43-01): complete multi-tab WebSocket upgrades plan
ab3b8db7 G fix(43-01): drop the Util require thinx-core no longer uses
dff73ddc G test(43-01): state the multi-tab upgrade contract in the ZZ specs and runbook
020b94b5 G feat(43-01): add credential-free check-ws-multitab live probe
cbd1a911 G test(43-01): add failing check-ws-multitab probe specs
30f0d7a0 G feat(43-01): cap live WebSockets at 10 per verified owner with a 429 refusal
febd700f G test(43-01): add failing per-owner cap, release and unverified-upgrade specs
0247eb2d G feat(43-01): track WebSocket upgrades per connection and owner in SocketUpgrade
a0c7d89c G test(43-01): add failing SocketUpgrade multi-tab and wiring specs
9dba1e76 G docs(43): create phase plan
78995401 G docs(48): add CI-07 Vue Cypress suite green and gating to Phase 48
d3b8a2ec G docs(readme): PlatformIO OTA update works; mark working items with ✅
```

## Verification

### Task 1 (recorded from the previous executor's run, re-checked where noted)

| Check | Result |
|---|---|
| Pre-push range/scope (verify 1) | PASS (after the BSD grep fix, Deviation 2): all outgoing commits `G`, no merge commits, paths = 10 phase files + root `README.md`; `messenger.js`, `socket_session.js`, `services/console` unchanged (re-checked 2026-10-13: `git diff --quiet 7cec687b b1126b6c -- lib/thinx/messenger.js lib/thinx/socket_session.js services/console` exit 0) |
| D-14 Legacy check | PASS: gitlink `cfff199` = console origin/thinx-staging, no `src` commit since ff6e809, e43a94d is an ancestor |
| Legacy baseline | LogviewController sha256 `e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d`, 12538 bytes, ETag `"6accf547-30fa"`, Last-Modified `Mon, 12 Oct 2026 14:57:11 GMT` |
| Production WS baseline | `WS-MULTITAB FAIL 1/2` (exit 1) before the rollout |
| Push pipeline (verify 3) | PASS: `pipeline 5659 a5b6e713-a603-4e37-a297-48cf64b68981 branch=thinx-staging revision=b1126b6`, test/api-registry/vue-console-registry success, `CI-GATES PIPELINE OK 5659` |
| NOTIF-02 live (verify 4) | PASS: `WS-MULTITAB OK 2/2 opened` |
| Preflight specs | PASS per the Task 1 executor: helper-free jasmine over the six phase specs run with placeholder `COUCHDB_USER`/`COUCHDB_PASS` (see Deviations); the CI `test` job of pipeline 5659 is green; test:toast re-run green in Task 3 |
| D-02 Vue non-issue | PASS: `grep -rnE 'new WebSocket|v-html|notification\.body' services/console/vue/src` prints nothing (re-checked 2026-10-13, exit 1). **Vue: verified non-issue** |

### Task 3 (skip-bypass path, 2026-10-13 ~07:30Z)

1. **Bypass pipeline (verify 1): SKIPPED.** No pipeline id; the operator chose `skip-bypass`.
2. **Legacy rollout Last-Modified (verify 2): SKIPPED** (nothing rebuilt). Replaced by Task 1 verify 2 re-run:
   - `cmp` of served `https://rtm.thinx.cloud/app/js/controllers/LogviewController.js` against gitlink `cfff199` `src/app/js/controllers/LogviewController.js` with `<ENV::wssUrl>` -> `wss://rtm.thinx.cloud`: identical; `thinxEscapeHtml( msg.body )` and `THINX_NID_PATTERN` present. **Exit 0, PASS.**
   - `HTTP/2 200`, sha256 `e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d`, 12538 bytes, ETag `"6accf547-30fa"`, Last-Modified `Mon, 12 Oct 2026 14:57:11 GMT` (unchanged from the baseline, as expected without a rebuild; 5 occurrences of `thinxEscapeHtml`).
3. **WebSocket probe:** `node scripts/check-ws-multitab.js wss://rtm.thinx.cloud` ->
   ```
   socket 1: opened, close 1008
   socket 2: opened, close 1008
   WS-MULTITAB OK 2/2 opened
   ```
   exit 0. **PASS.** (close 1008 is the unauthenticated cookie-less policy close after a successful upgrade.)
4. **Gate closed (verify 3): PASS.**
   - `build_legacy_console {"type":"boolean","default":false}`
   - `node scripts/check-ci-gates.js compile`:
     ```
     false/thinx-staging: test,vue-console-registry,api-registry
     false/main: test,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api,snyk-monitor-console-vue
     true/thinx-staging: test,vue-console-registry,api-registry,console-classic-registry
     true/main: test,vue-console-hub,api-hub,snyk-code-monitor,snyk-oss-monitor,snyk-monitor-api,snyk-monitor-console-vue,console-classic-hub,snyk-monitor-console-classic
     CI-GATES COMPILE OK
     ```
   - `node scripts/check-ci-gates.js pipeline --revision b1126b6c9db3bfee5b6c1e90d1241536f5dbd2e1 --expect legacy-off`:
     ```
     pipeline 5659 a5b6e713-a603-4e37-a297-48cf64b68981 branch=thinx-staging revision=b1126b6
     main: vue-console-registry (success)
     main: test (success)
     main: api-registry (success)
     CI-GATES PIPELINE OK 5659
     ```
   - `services/console/src` `npm run test:toast` (`node test/toast-escape.cjs`): 59 `ok` lines, no `FAIL`, exit 0 (covers E1 error: nid/type rejections; E1 long-text: hostile body/title escaped). No npm install was run.
5. **Codacy (evidence, unauthenticated public API v3):**
   - PR #573: `status: Closed`, `headCommitSha: 2e018d7fce3fae58c4d1f605b3a64f573eb44812`, `isUpToStandards: false`, `isAnalysing: false`, `newIssues: 5`, `fixedIssues: 0`. The status is frozen at the merge head; the fixes (quick 261012-r9z) landed after the merge.
   - PR #573 new issues: `lib/thinx/rsakey.js:366` ESLint_no-control-regex and ESLint8_no-control-regex; `lib/router.rsakey.js:17` ESLint_no-control-regex and ESLint8_no-control-regex; `scripts/check-ci-gates.js:264` ESLint_security_detect-unsafe-regex.
   - `commits/<sha>/deltaStatistics`: b7ea0959 `analyzed=true newIssues=0`; 7cec687b `analyzed=true newIssues=0`; pushed head **b1126b6c `analyzed=true newIssues=0`**. The 20 intermediate commits of the push report `analyzed=false` (Codacy analyses the pushed head only, which contains every source change of the range), so the 15-minute retry was not applicable.
6. **origin main:** `git ls-remote origin refs/heads/main` -> `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf` (unchanged). `refs/heads/thinx-staging` -> `b1126b6c9db3bfee5b6c1e90d1241536f5dbd2e1` = local HEAD.

## Pending Human UAT (D-16, end of phase)

Unchanged from the plan's Task 3 human-check; for the verifier's HUMAN-UAT:

1. Log in at https://rtm.thinx.cloud in two tabs of one browser (same owner). DevTools > Network > WS in both: each tab's `wss://rtm.thinx.cloud/<owner>` socket answers 101 and stays open (D-16, NOTIF-02).
2. In tab 1 start a build for a device that already has a build in its history (or start it from Device detail; UI-SPEC unresolved E2 partial). Both tabs show `Build Status` toasts with the bodies `"Pulling repository"`, `"Building..."`, `"Completed"`: at most three per tab, no second `Completed`. If the build fails, each tab shows one red toast with the reason and nothing green after it (NOTIF-03, F-1, F-2).
3. Close tab 1, start another build from tab 2: tab 2 still receives its toasts (D-05).
4. From a test device (or an MQTT client with that device's credentials), send an actionable notification whose body is `<img src=x onerror=alert(1)><b>hi</b>`. Both tabs show the literal text, with no image, no bold and no alert. Answering in one tab collapses only that tab's buttons; answering in both sends two replies (accepted, UI-SPEC unresolved E1) (NOTIF-01).
5. If a second account is available, its console in another browser shows none of the toasts above (D-08, D-12).
6. Run the console-retest project skill against https://rtm.thinx.cloud/: served LogviewController carries thinxEscapeHtml, websocket target `wss://rtm.thinx.cloud/…`, no cookie or owner debug logging, the Devices page renders.

Backstop truth status: "the next normal thinx-staging push after the bypass runs legacy-off" has no bypass to follow. Pipeline 5659 is a normal push and is legacy-off; the first Phase 44 push should still be checked with `check-ci-gates.js pipeline --revision <sha> --expect legacy-off`.

## Decisions Made

- Skip-bypass accepted as the operator's choice: NOTIF-01 counts as live because the served Legacy file is byte-identical to the current console source, which contains the e43a94d escape.
- The Codacy PR #573 red status is not actionable (closed PR, frozen at 2e018d7f); the current head reports 0 new issues.

## Deviations from Plan

### Operator-directed

**1. [Operator choice] One-off legacy bypass pipeline not run (skip-bypass)**
- **Found during:** Task 2
- **Issue:** The plan (D-03, D-13) and roadmap Phase 43 success criterion 2 ask for NOTIF-01 to ship "through a one-off legacy console build" with the CI-05 bypass. The operator replied `skip-bypass`.
- **Effect:** Success criterion 2 is **not executed**. Task 3 verify 1 (`--pipeline-id ... --expect legacy-on`) and verify 2 (Last-Modified newer than baseline) were skipped; Task 1 verify 2 was re-run instead and passes. NOTIF-01 is nevertheless live: the served LogviewController (built 2026-10-12 14:57:11 GMT by pipeline 5653, the last legacy build before CI-05) is byte-identical to the gitlink source and carries `thinxEscapeHtml`. The `thinx/console:swarm` image was not refreshed from the current base image; CI-06 (Phase 48) re-enables legacy builds.
- **Files modified:** none

### Auto-fixed Issues

**2. [Rule 1 - Bug] Plan verify-1 grep regex rejected by BSD grep**
- **Found during:** Task 1 (pre-push scope check)
- **Issue:** The path whitelist `grep -vxE '|[^/]+\.md|...'` starts with an empty alternative, which macOS BSD grep rejects.
- **Fix:** Re-ran the scope check correctly without the leading empty alternative; result PASS. Re-confirmed in Task 3: 0 merge commits in `7cec687b..b1126b6c`, all 21 commits `G`, non-`.planning` paths = the 10 phase files + `README.md`.
- **Files modified:** none (command-line only; the plan file was not changed)

**3. [Rule 3 - Blocking] Local specs need placeholder CouchDB credentials**
- **Found during:** Task 1 preflight
- **Issue:** The helper-free jasmine run does not start without `COUCHDB_USER`/`COUCHDB_PASS` set.
- **Fix:** Ran the specs with placeholder values `COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy` (no real credential, no `.env` read).
- **Files modified:** none

---

**Total deviations:** 1 operator-directed (criterion 2 not executed), 2 auto-fixed (verification harness only).
**Impact on plan:** NOTIF-01..03 are live on production; only the literal "one-off legacy build" path of criterion 2 and the image refresh it would have brought are missing.

## Issues Encountered

None beyond the deviations above.

## Known Stubs

None (no source changes in this plan).

## Threat Flags

None. All Task 3 reads were unauthenticated (CircleCI public API, rtm.thinx.cloud static file, Codacy public API); the WebSocket probe sends no cookie or credential; no token was requested or handled; no ssh, no docker service command; ports 7442 and plain MQTT untouched.

## User Setup Required

None (the CircleCI token setup was only for the skipped bypass).

## Next Phase Readiness

- Phase 43 is ready for verification; the six D-16 checks above are pending human UAT.
- Phase 44's first thinx-staging push should be checked `--expect legacy-off` (backstop).
- Phase 48 CI-06 must re-enable the legacy build; it will also refresh `thinx/console:swarm`, which this phase did not.

---
*Phase: 43-notification-delivery*
*Completed: 2026-10-13*

## Self-Check: PASSED

- FOUND: 7cec687b, b1126b6c (pushed range ends), d92b82b6, 0247eb2d on HEAD; origin/thinx-staging = HEAD = b1126b6c
- FOUND: scripts/check-ws-multitab.js, lib/thinx/socket_upgrade.js, spec/jasmine/BuilderStatusFramesSpec.js, this SUMMARY
- No commits expected from this plan (deploy and evidence only); `git rev-list --count b1126b6c..HEAD` = 0 at write time
