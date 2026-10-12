---
phase: 36-build-log-access
verified: 2026-10-12T12:03:38Z
status: human_needed
score: 16/16 must-haves verified
covered_files:
  - ".planning/phases/36-build-log-access/36-01-PLAN.md"
  - ".planning/phases/36-build-log-access/36-01-SUMMARY.md"
  - ".planning/phases/36-build-log-access/36-02-PLAN.md"
  - ".planning/phases/36-build-log-access/36-02-SUMMARY.md"
  - "lib/router.logs.js"
  - "lib/thinx/buildlog.js"
  - "services/console/vue/cypress/integration/device-detail.spec.js"
  - "services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue"
  - "services/console/vue/src/components/Notifications/Notifications.vue"
  - "services/console/vue/src/pages/Devices/DeviceDetail.vue"
  - "services/console/vue/src/pages/History/History.vue"
  - "services/console/vue/src/pages/Visits/Visits.vue"
  - "services/console/vue/src/store/buildlog.js"
  - "services/console/vue/src/utils/buildLog.js"
  - "services/console/vue/tests/unit/milestone-v116.cjs"
covered_digest: "v3:sha256:f0116bc0b9bdcd0b64aead8b4b0518074b897fc94fa3258a3c889eedf705ddad"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: "none (2026-10-09 prose report, no frontmatter status; live/browser/CI gates were open)"
  previous_score: "n/a"
  gaps_closed:
    - "G-36-3 (UAT test 3): device Build History summary-only; inline 'Device Logs (last build)' card removed; full log only via the per-row button (console 6bf96eb, label 'View' since 38eb95b)"
    - "2026-10-09 unverified gates: browser/live acceptance (UAT 5/5 on rtm.thinx.cloud), publication (console and parent on origin/thinx-staging), CI (console CircleCI job 860 ran unit chain + Cypress on 5e5783a)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "WR-01 confirmed at console HEAD 38eb95b: the unit 'inert row' guard only inspects the <tr>. A tabindex + @click put on the Build ID <td> passes milestone-v116.cjs (rc=0, scratch-copy mutation). The production code is inert today; the regression guard is weaker than 36-02 truth 2 implies"
    category: other
    reason: "Test-strength gap, not a goal failure. Resolve by asserting that only build-open-log buttons carry listeners/tabindex anywhere in the Build History card (36-REVIEW.md WR-01 fix), and clicking every non-button cell in the e2e spec"
    evidence_status: "reproduced by verifier on scratch exports of 5e5783a and 38eb95b (cell-listener mutation, exit 0 both times)"
  - finding: "Dashboard 'Recent Builds' card (Visits.vue) still has no open-log control at 38eb95b (only its badge colour changed); only the navbar 'Recent Builds' dropdown (Notifications.vue) opens BuildLogDialog"
    category: other
    reason: "BUILD-01 wording is satisfied by the navbar 'Recent Builds' panel (that name predates phase 36, console 8aabbe3) and live UAT test 1 passed; two widgets with the same name behave differently (36-UI-REVIEW Pillar 2). See human_verification item 2"
    evidence_status: "code read: Visits.vue Recent Builds card has a Download button only"
  - finding: "Console CircleCI 'Test Vue console' is red on 5e5783a (job 860): 4 of 10 Cypress specs fail (devices, login, oauth-return, profile)"
    category: other
    reason: "Pre-existing and not phase-36 scope: job 859 on d4b1b41 (before 36-02) fails the same 4 specs with the same counts. Phase-36 specs are green: device-detail 8/8 (both G-36-3 tests pass), history 15/15, dashboard 8/8. The unit chain runs first in the same set -e step, so it also passed in CI. Job 861 (38eb95b) was still pending at verification time. Track separately so console CI can go green"
    evidence_status: "CircleCI v1.1 API step output for jobs 859 and 860; GitHub commit status for 38eb95b = pending"
human_verification:
  - test: "Confirm the four judgment-tier prohibitions of 36-02-PLAN.md (all flagged: true) held. LLM-judge verdict (non-authoritative): all four held. (1) No executor push: console origin/thinx-staging moved d4b1b41 -> 5e5783a 'update by push' at 13:44:14 +0200 and parent -> 014afcc3 at 13:44:17, after the 36-02 commits (13:41:51 / 13:42:16) and the SUMMARY (11:42:26Z = 13:42:26 +0200), i.e. the orchestrator push. (2) Signed commits: e84ef46, 6bf96eb, 5e5783a and 92eca3b7 all report %G? = G; hook bypass cannot be proven absent from git, but every subject is commitlint-conformant. (3) Scope: the 36-02 console range d4b1b41..5e5783a names exactly DeviceDetail.vue, milestone-v116.cjs, device-detail.spec.js, and History/BuildLogDialog/store/buildlog.js/utils/buildLog.js were byte-identical there; whether `npm run eslint` was run is unobservable, but no other file changed. The later 38eb95b follow-up touches History/Visits/Notifications/utils on purpose and is outside the 36-02 executor scope. (4) Backend untouched: parent diff ddabcd82..014afcc3 over lib/ spec/ services/ names only services/console"
    expected: "Operator accepts the four verdicts (or names the one that did not hold)"
    why_human: "judgment-tier prohibitions are flagged by contract; an autonomous verifier verdict is non-authoritative and may not silently pass them"
  - test: "Decide whether BUILD-01's 'from Recent Builds' also requires the dashboard 'Recent Builds' card (Visits.vue) to open the full log, or whether the navbar 'Recent Builds' dropdown (the surface live UAT test 1 passed on) is sufficient"
    expected: "Either accept as is (navbar dropdown satisfies BUILD-01) or open a follow-up to add the View/build-open-log button + BuildLogDialog to the Visits.vue card"
    why_human: "Interpretation of requirement wording; the code satisfies the literal requirement through one of the two same-named widgets"
  - test: "After console 38eb95b rolls out (CircleCI job 861, then Swarmpit), check on rtm.thinx.cloud: History and Device Build History rows show an eye-icon 'View' button (a dash for a row with no build id); it opens the full-log dialog; TIMEOUT badges are amber (warning), not FAILED red; the History Log preview is readable on the dark theme"
    expected: "All four hold; device rows still do nothing when clicked"
    why_human: "Live UAT 5/5 ran on 5e5783a; the 38eb95b label/colour follow-up landed during this verification and has unit + static coverage only, with its CI run still pending"
---

# Phase 36: Build Log Access & Timeout Status Verification Report

**Phase Goal:** Build Log Access & Timeout Status. Deliver BUILD-01 (open the full build log from Recent Builds, History and Device Build History with loading, empty and error states) and BUILD-02 (explicit and expired running builds display as TIMEOUT while completed results are preserved), plus gap closure G-36-3 (operator direction 2026-10-12: "Remove inline logs from device build history"; Device Build History is summary-only, and the full log opens only through the per-row button).
**Verified:** 2026-10-12T12:03:38Z, against console HEAD `38eb95b` and parent HEAD `c1007f40` (gitlink `38eb95b`)
**Status:** human_needed (all 16 truths verified; 4 flagged judgment-tier prohibitions, 1 requirement-interpretation decision and 1 live look at the 38eb95b follow-up are routed to the operator)
**Re-verification:** Yes. It replaces the 2026-10-09 prose report, which had no frontmatter status and left browser, CI and publication open. All three are now closed.

**Moving target during this run.** Console commit `38eb95b` ("fix(vue): readable build log column, View button and TIMEOUT colour", signed G, pushed) and the parent bump `993cd8ac` (signed G, `chore(36)`) landed at 14:01:59 +0200, while this verification was in progress. The truths below were re-checked against `38eb95b`:
- unit chain re-run: rc=0;
- ESLint on the 7 touched files: clean;
- the spec still parses;
- the WR-01 probe was repeated.

`38eb95b` does three things:
- It renames the per-row button text "Open build log" to an eye icon plus "View". The aria-label is still `Open build log <id>`, which matches the operator's original "Open build log -> View" wording.
- It hides the button on rows with no `build_id` (closes 36-REVIEW IN-02 and 36-UI-REVIEW fix 3).
- It adds a shared `buildStatusVariant` helper (TIMEOUT→warning, RUNNING→info), which closes the 36-UI-REVIEW colour finding.

`BuildLogDialog.vue` and `store/buildlog.js` are unchanged by it.

Roadmap Phase 36 has no `success_criteria` list. The must-haves are the two REQUIREMENTS.md requirements, split into observable truths, plus the seven `must_haves.truths` from 36-02-PLAN.md. 36-01-PLAN.md declares no must_haves.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | BUILD-01: the full build log opens from Recent Builds | ✓ VERIFIED | `Notifications.vue` (navbar panel titled "Recent Builds", mounted in `Header.vue:35`): each `b-list-group-item` is a `button` with `@click="openBuildLog(build)"` → `$refs.buildLogDialog.open(build)`. Added in 36-01 console 956a7a2. Live UAT test 1 passed. The dashboard card of the same name has no log control: see Advisory and human item 2 |
| 2 | BUILD-01: the full build log opens from History | ✓ VERIFIED | `History.vue` per-row `build-open-log` button (`v-if="item.build_id"`, `@click.stop="openBuildLog(item)"`) plus a guarded mouse row click (`onBuildRowClick`, skips inner controls and text selections). milestone-v116.cjs History checks pass at 38eb95b. CI job 860 history.spec.js 15/15. Live UAT test 2 passed (on 5e5783a) |
| 3 | BUILD-01: the full build log opens from Device Build History, only from the per-row button | ✓ VERIFIED | `DeviceDetail.vue` `b-button v-if="build.build_id" data-cy="build-open-log" :aria-label="'Open build log ' + build.build_id" @click="openBuildLog(build)"` → `openBuildLog` → `$refs.buildLogDialog.open`; `<BuildLogDialog ref="buildLogDialog" />` is present. Unit check: the second button opens exactly `vm.buildHistory[1]`. CI 860: "Should open the full build log only from the Open build log button (G-36-3)" ✓. Live UAT test 3 re-test passed |
| 4 | BUILD-01: the dialog has loading, empty and error states, and stale responses are dropped | ✓ VERIFIED | `BuildLogDialog.vue` (unchanged since 36-01): `role="status"` spinner "Loading build log…", a danger alert "Could not load this build log." with Retry, the empty text "No log output is available for this build yet.", and a `requestId` guard that is also bumped on `@hidden`. Unit tests: success → text and `loading=false`; `{success:false}` → error and `loading=false`; out-of-order responses → the newer text wins (this exercises the ordering invariant); `buildLogText({})===''` feeds the empty branch. Live UAT test 4 passed |
| 5 | BUILD-01: the dialog shows the full log, read owner-scoped, as text | ✓ VERIFIED | `store/buildlog.js` `fetchBuildDetail` → `GET /logs/build/<encodeURIComponent(id)>`, and returns `{success:false}` for an empty id. `router.logs.js:54-69` takes the owner from the session only and `fetchOwned` treats another owner's build as missing. `utils/buildLog.js` `buildLogText` decodes Buffer JSON (UTF-8), string and nested logs, rendered with `{{ }}` interpolation (no v-html). Unit tests decode 'Český log' and the nested and string shapes |
| 6 | BUILD-02: an explicit timeout shows as TIMEOUT | ✓ VERIFIED | `normalizeStatus` matches `/TIME[ -]?OUT|TIMED[ -]?OUT|ETIMEDOUT/` → 'TIMEOUT'. Unit: `normalizeStatus('timed out', NOW, NOW) === 'TIMEOUT'` |
| 7 | BUILD-02: a running build past the build timeout shows as TIMEOUT, and a fresh one stays RUNNING | ✓ VERIFIED | CREATED/BUILDING/RUNNING/STARTED/START at least 20 min after `started` → TIMEOUT, otherwise RUNNING; an invalid timestamp stays RUNNING. Unit: created at 21 min → TIMEOUT, started at 5 min → RUNNING, building with 'invalid' → RUNNING |
| 8 | BUILD-02: completed results are kept | ✓ VERIFIED | Unit: success at 21 min → OK, failed at 21 min → FAILED. The timeout rule applies only to the running-state set |
| 9 | BUILD-02: TIMEOUT appears in Recent Builds, History and Device Build History | ✓ VERIFIED | All four list surfaces (Notifications, Visits, History, DeviceDetail) read `buildlog/getItems`, which `fetchBuildLog` and `fetchBuildPage` fill only through `normalizeBuildItems` → `normalizeStatus`. Backend `Buildlog.toBuildListItem` (36-01, parent 58027c18) passes `build_id`, `state` and `start_time` for flat documents. Since 38eb95b, `buildStatusVariant` gives TIMEOUT its own warning colour on every surface; the unit check renders a TIMEOUT device badge as `warning`. Live UAT test 5 passed (on 5e5783a) |
| 10 | G-36-3: the device page has no last-build log card, no `pre` and no log text after `loadDevice()` | ✓ VERIFIED | The 6bf96eb diff removes the `card-device-logs` b-card, the `deviceLogs` data and its `loadDevice` assignment; a grep for `deviceLogs\|card-device-logs\|Device Logs` in `vue/src` finds nothing. Whole-page render test (`renderDeviceDetail`): no card, no `pre`, none of the three log strings. CI 860: "Should list builds without inline build logs (G-36-3)" ✓ |
| 11 | G-36-3: Build History rows are summary-only (date, build id, status) with no role, tabindex or click/keydown/keyup listener | ✓ VERIFIED | `<tr v-for="(build, i) in buildHistory" :key="i">` has nothing else. Read directly at 38eb95b, none of the cells (`td`, `code`, `b-badge`) has a listener or tabindex either. Unit row checks pass, and CI 860 checks that the row has no role or tabindex. Live UAT 3: "clicking the row itself does nothing". The guard is weaker than this truth: see Advisory WR-01 |
| 12 | G-36-3: each row with a build id has one explicit b-button (data-cy build-open-log, aria-label `Open build log <id>`), and it is the only path to the full log | ✓ VERIFIED | Unit at 38eb95b: 2 buttons, aria-labels `Open build log build-1/2`, visible text 'View' with one `la-eye` icon, function `on.click`; a row with no build id shows '—' and no button. The real `device.methods.openBuildLog` passes the same object to `open`. Nothing opens on page load (`opened` is empty). The visible label changed from 'Open build log' (36-02 truth text) to 'View' in 38eb95b, which follows the operator's "Open build log -> View" direction; the accessible name is unchanged |
| 13 | 36-02 left History.vue, BuildLogDialog.vue, store/buildlog.js and utils/buildLog.js unchanged, and the 35 WR-01 History checks still pass | ✓ VERIFIED | `git -C services/console diff --quiet d4b1b41 5e5783a -- vue/src/pages/History vue/src/components/BuildLogDialog vue/src/store/buildlog.js vue/src/utils/buildLog.js` exits 0. The later 38eb95b changes History.vue (badge colour, label, preview background) and utils/buildLog.js (adds `buildStatusVariant`) on purpose, and leaves the dialog and store alone. The History checks pass at 38eb95b |
| 14 | `LC_ALL=C npm --prefix services/console/vue run test:unit` exits 0, and the device checks are RED against the old page and catch the two mutations | ✓ VERIFIED | Verifier runs: rc=0 at 5e5783a and again at 38eb95b, and the coverage line includes "device build history without inline logs". RED reproduced on a scratch export of e84ef46 (new test with the d4b1b41 page): rc=1 `AssertionError: device page has no inline last-build log card` at :318. Mutation (a), a row `@click`: rc=1 "Build History row has no click listener". Mutation (b), the button's `@click` removed: rc=1 "Open build log button has a click handler" |
| 15 | The Cypress device-detail spec drops the inline-card expectation, covers the absent card, inert rows and button-only fetch, and runs in console CI | ✓ VERIFIED | The spec diff replaces the DEVI-11 logs test with two G-36-3 tests (card and `pre` absent, no role or tabindex, intercept `/api/v2/logs/build/build-1`, `@getBuildDetail.all` length 1). CircleCI job 860 (5e5783a): device-detail.spec.js 8/8, both G-36-3 tests ✓. At 38eb95b one assertion changes from the text 'Open build log' to 'View'; `node --check` and ESLint are clean. Job 861 was pending (see human item 3) |
| 16 | Console changes for 36-02 are exactly the three files, in signed conventional commits on thinx-staging, and the parent gitlink is bumped in one signed commit that stages only services/console | ✓ VERIFIED | `git diff --name-only d4b1b41 5e5783a` lists exactly the 3 files. e84ef46, 6bf96eb, 5e5783a and 92eca3b7 are all `%G?`=G, and `git show --name-only 92eca3b7` = `services/console`. The follow-up 38eb95b and parent 993cd8ac are also G, 993cd8ac stages only `services/console`, and parent `HEAD:services/console` = console `origin/thinx-staging` = 38eb95b |

**Score:** 16/16 truths verified (0 present, behavior-unverified)

### Prohibitions (36-02-PLAN.md, judgment-tier, all `flagged: true`)

| # | Prohibition | LLM-judge verdict (non-authoritative) | Evidence |
|---|-------------|------------------------------------------|----------|
| P1 | The executor MUST NOT push either repo | held (flagged for human review) | The remote-tracking reflogs show "update by push" at 13:44:14/13:44:17 +0200. That is after the 36-02 commits and the SUMMARY completion (13:42:26 +0200), so it is the orchestrator's push |
| P2 | No unsigned commits and no hook bypass | held (flagged) | All four 36-02 commits are `G`. A hook bypass leaves no trace in git, but every subject is commitlint-conformant (≤74 chars, lowercase type) |
| P3 | No console file outside the three listed, and no `npm run eslint` | held (flagged) | The 36-02 range is exactly 3 files and History/BuildLogDialog/store/util are byte-identical in it. A `--fix` run would show up as further changed files, and none did. 38eb95b is a separate, deliberate follow-up |
| P4 | No backend change to the full-log endpoint | held (flagged) | `git diff --name-only ddabcd82 014afcc3 -- lib spec services` = `services/console` only. The 38eb95b / 993cd8ac follow-up touches no backend file either |

The 36-02 contract flags these, so they are listed under Human Verification and not silently passed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `services/console/vue/src/components/BuildLogDialog/BuildLogDialog.vue` | Shared full-log modal with loading, empty, error, retry and stale guard | ✓ VERIFIED | 43 lines, substantive. Used by Notifications, History and DeviceDetail |
| `services/console/vue/src/utils/buildLog.js` | Buffer, string and nested log → text; `buildStatusVariant` (38eb95b) | ✓ VERIFIED | Imported by BuildLogDialog and all four list surfaces, and unit-tested |
| `services/console/vue/src/store/buildlog.js` | `fetchBuildDetail`, `normalizeStatus` TIMEOUT rules, `normalizeBuildItems` | ✓ VERIFIED | Wired into all list surfaces through `buildlog/getItems` |
| `services/console/vue/src/components/Notifications/Notifications.vue` | Recent Builds entry point | ✓ VERIFIED | Button items open the dialog. Mounted in Header |
| `services/console/vue/src/pages/History/History.vue` | History entry point | ✓ VERIFIED | Per-row View button plus guarded row click |
| `services/console/vue/src/pages/Devices/DeviceDetail.vue` | Summary-only Build History with per-row button; `contains: data-cy="build-open-log"` | ✓ VERIFIED | Present. The inline card and `deviceLogs` are gone |
| `services/console/vue/tests/unit/milestone-v116.cjs` | `renderDeviceDetail` whole-page render | ✓ VERIFIED | Defined and used. 38eb95b adds checks for the button with no build id and for the TIMEOUT badge |
| `services/console/vue/cypress/integration/device-detail.spec.js` | Contains `build-open-log`; asserts no inline logs and button-only fetch | ✓ VERIFIED | Passes in CI 860; the 38eb95b one-line text change is checked statically |
| `services/console` (parent gitlink) | Bumped to the G-36-3 console commit | ✓ VERIFIED | 92eca3b7 → 5e5783a (pushed as 014afcc3), then 993cd8ac → 38eb95b |
| `lib/thinx/buildlog.js` `toBuildListItem` / `fetchOwned` | Additive list metadata (`build_id`, `state`, `start_time`) and owner-checked detail read | ✓ VERIFIED | Covered by the 36-01 BuildlogPagingSpec update (2026-10-09 run, see prior evidence) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| DeviceDetail.vue `build-open-log` button | `openBuildLog` → `$refs.buildLogDialog.open` → `buildlog/fetchBuildDetail` → `GET /api/v2/logs/build/:id` | `@click` on the button only | ✓ WIRED | Unit delegation check plus a real-method spy. The CI e2e test sees exactly one detail request |
| milestone-v116.cjs `renderDeviceDetail` | DeviceDetail.vue full template + `loadDevice()` + data/computed/methods | `compileToFunctions(sfc.template.content)` + `vue.runtime.common.js` | ✓ WIRED | RED against the old page proves it renders the real template |
| device-detail.spec.js | `GET /api/v2/logs/build/build-1` (`@getBuildDetail`) | click on `[data-cy=build-open-log]` | ✓ WIRED | Passes in CI 860 |
| Notifications.vue / History.vue | BuildLogDialog | `openBuildLog` → `$refs.buildLogDialog.open` | ✓ WIRED | grep plus the History unit checks |
| Backend list (`toBuildListItem`) | `normalizeStatus(state, start_time)` → `buildStatusVariant` | `fetchBuildLog` → `normalizeBuildItems` → badge `:variant` | ✓ WIRED | `state` and `start_time` are emitted for flat documents. Nested documents keep the latest log line, whose `state`/`start_time` the normalizer reads |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| BuildLogDialog | `text` | `buildlog/fetchBuildDetail` → owner-checked `Buildlog.fetchOwned` → `build.log` on GlusterFS | Yes (live UAT 1-4) | ✓ FLOWING |
| DeviceDetail Build History | `buildHistory` | `getBuildItems()` filtered by route udid, from `GET /api/v2/logs/build` | Yes | ✓ FLOWING |
| Status badges (all lists) | `item.status` | `normalizeStatus(state, started)` over API list items | Yes (live UAT 5) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Vue unit chain (6 files), 5e5783a and 38eb95b | `LC_ALL=C npm --prefix services/console/vue run test:unit` | rc=0 both times, "…device build history without inline logs…" | ✓ PASS |
| RED against the pre-fix page | scratch `git archive e84ef46` + `node tests/unit/milestone-v116.cjs` | rc=1, "device page has no inline last-build log card" | ✓ PASS |
| Mutation (a), row `@click` | scratch 5e5783a with `<tr … @click>` | rc=1, "Build History row has no click listener" | ✓ PASS |
| Mutation (b), button `@click` removed | scratch 5e5783a | rc=1, "Open build log button has a click handler" | ✓ PASS |
| WR-01 probe, cell `tabindex` + `@click` | scratch 5e5783a and 38eb95b | rc=0 (not caught) | ⚠️ guard gap (advisory) |
| ESLint on the 7 files touched by 36-02 and 38eb95b | `ESLINT_USE_FLAT_CONFIG=false eslint --ext .vue,.cjs,.js …` | clean | ✓ PASS |
| Cypress spec parses | `node --check device-detail.spec.js` | ok | ✓ PASS |
| Console CI on 5e5783a | CircleCI job 860 step output | device-detail 8/8, history 15/15, dashboard 8/8; job red from 4 pre-existing specs (also red in 859 on d4b1b41) | ✓ PASS for phase scope |
| Console CI on 38eb95b | GitHub commit status | job 861 pending | ? SKIP (human item 3) |

### Probe Execution

No probes are declared in 36-01 or 36-02, and this is not a migration or tooling phase. Step 7c: not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BUILD-01 | 36-01, 36-02 | Open the full build log from Recent Builds, History and Device Build History with loading, empty and error states | ✓ SATISFIED | Truths 1-5 and 10-16. Live UAT 1-4. Dashboard-card interpretation: human item 2 |
| BUILD-02 | 36-01 | Display explicit and expired running builds as TIMEOUT while preserving completed results | ✓ SATISFIED | Truths 6-9. Live UAT 5 |

No orphans: REQUIREMENTS.md maps only BUILD-01 and BUILD-02 to phase 36, and both appear in plan frontmatter. The REQUIREMENTS.md traceability row still reads "Implemented; locally verified", which is out of date now that live UAT has passed 5/5. The orchestrator should update it.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all phase files) | n/a | TBD/FIXME/XXX/TODO/HACK | none found | none |
| `vue/tests/unit/milestone-v116.cjs` | row loop in the G-36-3 block | Inert-row guard checks only the `<tr>` (36-REVIEW WR-01, reproduced at 38eb95b) | ⚠️ Warning | A future cell-level trigger would pass the unit test, and the e2e test too unless it sits on the first cell |
| `vue/src/pages/Visits/Visits.vue` | Recent Builds card | The dashboard "Recent Builds" card has Download only, no open-log | ⚠️ Warning | Two "Recent Builds" widgets behave differently (human item 2) |
| `vue/cypress/integration/device-detail.spec.js` | `@getBuildDetail.all` | Length 1 can pass on the first retry (IN-03) | ℹ️ Info | The modal backdrop catches the regression anyway |
| Console CI `test_vue` | — | 4 pre-existing failing Cypress specs (devices, login, oauth-return, profile) | ⚠️ Warning (not phase-36 scope) | The console CI job stays red. The same failures occur in job 859 before 36-02 |

Closed by 38eb95b during this run:
- 36-REVIEW IN-02 and 36-UI-REVIEW fix 3: no button on a row without a build id.
- 36-UI-REVIEW fix 1 and Pillar 3: TIMEOUT gets its own colour (warning) and RUNNING gets info.
- The History preview contrast issue.

Accepted risk carried: AR-36-01 (36-SECURITY.md). The full-log endpoint reads `build.log` synchronously and returns it as Buffer JSON, about 3.4x the log size, uncompressed. After G-36-3 it is reached only by an explicit button press. No later milestone phase covers it, so it is recorded as an accepted risk and not as a deferred gap.

### Human Verification Required

#### 1. Confirm the four flagged 36-02 prohibitions

**Test:** Review P1-P4 in the Prohibitions table above. The verifier's non-authoritative verdict is that all four held, and the git evidence is attached.
**Expected:** The operator accepts them, or names the prohibition that did not hold.
**Why human:** These are judgment-tier prohibitions flagged by the plan contract. An autonomous verdict cannot be authoritative, and they must not be passed silently.

#### 2. BUILD-01 "from Recent Builds": navbar dropdown only, or the dashboard card too?

**Test:** Decide whether the navbar "Recent Builds" dropdown, which opens the dialog and is the surface live UAT test 1 passed on, satisfies BUILD-01. The other option is that the dashboard "Recent Builds" card (Visits.vue, Download only) must also open the log.
**Expected:** Accept as is, or file a follow-up (add the View/`build-open-log` button and `<BuildLogDialog ref>` to the Visits card, as 36-UI-REVIEW fix 2 suggests).
**Why human:** This is about how to read the requirement. The literal requirement is met through one of two widgets with the same name.

#### 3. Live look at the 38eb95b follow-up

**Test:** After CircleCI job 861 and the Swarmpit rollout, open History and a device page on rtm.thinx.cloud.
**Expected:**
- The rows show an eye-icon "View" button, or a dash for a row with no build id, and the button opens the full-log dialog.
- TIMEOUT badges are amber and RUNNING badges are blue.
- The History Log preview is readable on the dark theme.
- Clicking a device row still does nothing.

**Why human:** Live UAT 5/5 ran on 5e5783a. The label and colour follow-up landed during this verification and has only unit and static coverage so far.

### Gaps Summary

No blocking gaps. All 16 must-have truths hold in the code at console HEAD `38eb95b` and in the verifier's own test runs: the unit chain is green at both 5e5783a and 38eb95b, RED is reproduced, and both mutations are caught. In console CI, both G-36-3 Cypress tests pass in job 860. Live UAT passed 5/5 on rtm.thinx.cloud, including the re-test of G-36-3.

Status is `human_needed` for three reasons only:
- The 36-02 contract flags four judgment-tier prohibitions. The evidence says they held, but an autonomous verdict cannot sign them off.
- The operator should say whether the dashboard Recent Builds card counts toward BUILD-01.
- The 38eb95b label and colour follow-up, which landed mid-run, has not been seen live yet.

Advisory follow-ups that do not block:
- Tighten the WR-01 inert-row guard. A cell-level handler is confirmed to pass today.
- Fix the 4 pre-existing failing console Cypress specs. They keep console CI red independently of this phase.

## Prior evidence (2026-10-09 report, still accurate)

- Vue complete unit suite including milestone-v116.cjs passed then, and passes now (re-run above). It checks full-log Buffer/string/array responses, modal request races and errors, and timeout/completed states.
- Parent targeted Jasmine (BuildlogPagingSpec + OwnerPurgeSpec): 26 specs, 0 failures, run without the integration bootstrap with stores mocked. It covers the 36-01 `toBuildListItem` metadata change. Not re-run here; the backend files are unchanged since 58027c18.
- ESLint on the changed backend and Vue files and `git diff --check`: pass. The Vue production build passed, with existing Sass/bundle-size warnings.
- Superseded "unverified gates" from that report: browser/live acceptance is now done (UAT 5/5, 2026-10-12). Publication is done (console and parent on origin/thinx-staging). CI is done (console job 860 ran the unit chain and Cypress). A full CouchDB/Redis/worker integration suite was not run locally then and was not run here.

---

_Verified: 2026-10-12T12:03:38Z_
_Verifier: Claude (gsd-verifier)_
