---
phase: 37-transformer-parity
verified: 2026-10-12T12:55:00Z
status: human_needed
score: 11/11 must-haves verified
covered_files:
  - ".planning/phases/37-transformer-parity/37-01-PLAN.md"
  - ".planning/phases/37-transformer-parity/37-01-SUMMARY.md"
  - ".planning/phases/37-transformer-parity/37-02-PLAN.md"
  - ".planning/phases/37-transformer-parity/37-02-SUMMARY.md"
  - "design/design_users.json"
  - "lib/thinx/owner.js"
  - "services/console/src/app/js/thinx-api.js"
  - "services/console/vue/cypress/integration/device-detail.spec.js"
  - "services/console/vue/src/pages/Devices/DeviceDetail.vue"
  - "services/console/vue/src/pages/Profile/Profile.vue"
  - "services/console/vue/src/pages/Transformers/TransformerEditor.vue"
  - "services/console/vue/src/pages/Transformers/Transformers.vue"
  - "services/console/vue/src/store/devices.js"
  - "services/console/vue/src/store/transformers.js"
  - "services/console/vue/tests/unit/milestone-v116.cjs"
covered_digest: "v3:sha256:a479cff8447d624c28b391bdbb3c6531dfebaad0597b4c031cabc05abfcb2406"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Acknowledge the four judgment-tier prohibitions of 37-02-PLAN.md (flagged: true): no push by the executor; no unsigned or hook-bypassing commit; no console file changed beyond DeviceDetail.vue, milestone-v116.cjs and device-detail.spec.js; no logic change to createTransformer, saveTransformers, loadDevice or transformerOptions"
    expected: "Non-authoritative verifier verdict: all four held. Evidence: console 5f0d73a/1f0626c/4cbf1da and parent 04455f8c are signature G; 38eb95b..4cbf1da touches exactly the three files; the DeviceDetail.vue script diff is two reworded comments only; origin/thinx-staging moved by push at 14:29:56/14:29:59 +0200, after the executor's last commit (14:27:55) and the plan's docs commit 0feea517 (orchestrator push)"
    why_human: "Judgment-tier prohibitions need explicit human resolution in interactive verify; the verifier's reading of git history is not authoritative"
---

# Phase 37: Transformer Parity Verification Report

**Phase Goal:** TRANS-01 (create and edit transformers in Vue and persist them in profile.info.transformers without losing other profile fields) and TRANS-02 (select existing transformers and create-and-assign a transformer from Device detail), plus gap closure G-37-5 (device transformer list as checkboxes showing which are enabled; Manage Transformers as a filled orange button).
**Verified:** 2026-10-12T12:55:00Z
**Status:** human_needed (all 11 truths verified; the only open item is acknowledging the four flagged judgment-tier prohibitions, for which the verifier's evidence shows no violation)
**Re-verification:** No. The previous 37-VERIFICATION.md (2026-10-09) was a prose report with no frontmatter status and no `gaps:` block. Its evidence that is still accurate is kept in the "Prior evidence" section below.

ROADMAP Phase 37 has no Success Criteria list. The must-haves are the two requirement statements (TRANS-01, TRANS-02) plus the 37-02-PLAN.md `must_haves.truths` (G-37-5). 37-01-PLAN.md has no `must_haves` block.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TRANS-01: transformers can be created and edited in Vue and persist in `profile.info.transformers` | ✓ VERIFIED | `store/transformers.js` `saveTransformers` posts `{ info: { transformers } }` to `/profile`. `createItem` and `updateItem` re-fetch first, and `fetchItems` throws on a failed read without committing, so a write is never built from an empty list. `updateItem` refuses a blank alias, a non-string body or a vanished utid (35 CR-01, console 52bf1e5). Server: `owner.process_update` maps `body.info` to key `info`, and `users/edit` (`design/design_users.json:36`) merges `info` key by key. Unit: milestone-v116.cjs lines 188-252 (payload shape, fetch rejection does not clear, create keeps existing bodies and encodes UTF-8, refused updates write nothing, editor refuses to save after a failed load, Save disabled until loaded). Routes `transformers` and `transformer/:utid` exist. Live UAT tests 1 and 2: pass. |
| 2 | TRANS-01: no other profile field is lost, and profile saves do not drop transformers | ✓ VERIFIED | The transformer write sends only `info.transformers`, which the server merges per key. Vue `saveProfile` sends only first_name, last_name, mobile_phone, timezone_abbr (plus `timezone: null` when needed). `saveNotifications` sends only `notifications`. Legacy `submitProfile` no longer sends `transformers` (35 WR-04, console e53f2e9). Unit checks for all three payloads pass. Live UAT tests 3 and 6 (Legacy console still sees Vue transformers): pass. |
| 3 | TRANS-02: on Device detail, existing transformers can be selected, and the assignment persists on save | ✓ VERIFIED | `transformerOptions` maps `getTransformers()` to `{value: utid, text: alias \|\| utid}`. The checkbox group is bound to `editForm.transformers`, which `loadDevice` fills from `device.transformers`. `saveTransformers` sends `changes.transformers` via `devices/updateDevice`, which PUTs `/api/v2/device` with `changes: { udid, transformers }`. `editDevice` checks ownership and `device.edit` stores the field. Unit: the model callback with `['t1','t3']`, then the real `saveTransformers`, sends exactly `{ udid, changes: { transformers: ['t1','t3'] } }`. Live UAT tests 4 and 5: pass. |
| 4 | TRANS-02: create-and-assign from Device detail creates the transformer and assigns it without writing unsaved state | ✓ VERIFIED | `createTransformer` rejects blank and duplicate names, calls `transformers/createItem`, then assigns the stored `device.transformers` plus the new utid. After `loadDevice` it restores the unsaved checkbox state plus the new utid as pending (35 WR-02, console c372197). Only comments changed in 1f0626c. Unit WR-02 checks (lines 290-298: `['existing','new']` written, `['unsaved','new']` pending, a device with no stored list gets `['new']`) pass. Live UAT test 5: pass. |
| 5 | G-37-5: the Transformer Assignment card renders one stacked `b-form-checkbox-group` (data-cy `transformer-checkboxes`) on `editForm.transformers` / `transformerOptions`, checked exactly for assigned transformers | ✓ VERIFIED | DeviceDetail.vue lines 110-116. Whole-page render test (`renderDeviceDetail` with three transformers, device assigned `['t2']`): exactly 1 group, `stacked`, data-cy set, options deep-equal value/text pairs and `vm.transformerOptions`, `model.expression` is `editForm.transformers`, value identical to the vm array, `['t2']`. In-memory mutation probe (this run, source untouched): removing `v-model` fails with "checkbox group is bound with v-model". Live UAT test 5 re-test: pass. |
| 6 | The card has no native multi-select: no `b-form-select`/`select` and no `multiple` attribute | ✓ VERIFIED | `awk` over the card region finds 0 matches for `b-form-select\|multiple\|variant="link"`. Unit asserts 0 select vnodes and 0 `multiple` attrs. In-memory mutation probe restoring the old `b-form-select multiple` fails with "Transformer Assignment card renders exactly one checkbox group". |
| 7 | Ticking/unticking changes `editForm.transformers`, and Save Transformers sends that array | ✓ VERIFIED | Unit (truth 3 evidence). Cypress spec 'Should save the transformer assignment from the checkboxes (G-37-5)' asserts PUT body `{ changes: { udid: 'udid-z', transformers: [] } }`. The fixtures back it: `devices.json` udid-z `transformers: ["utid-1"]`, `profile.json` utid-1 alias passthrough, and `@updateDevice` is stubbed. The spec was checked statically here (`node --check`, ESLint). Its console CI run (`test_vue` → `yarn test`, every branch) was not inspected by this verifier. |
| 8 | With no profile transformers, the card shows "No transformers yet. Use Create & Assign to add one." (data-cy `transformers-empty`), and all three buttons still render | ✓ VERIFIED | DeviceDetail.vue line 117 (`v-else`). Unit `ePage` checks: no group, exactly one empty-state node with that text, and all three buttons present with Manage Transformers still `warning`. See WR-01 below for the case where the device still has orphaned assignments. |
| 9 | Manage Transformers is a filled orange button (variant warning, to `/app/transformers`, class `ml-2`, data-cy `manage-transformers`) | ✓ VERIFIED | DeviceDetail.vue line 121. The unit test asserts variant, `to`, data-cy and `ml-2`. The mutation probe back to `variant="link"` fails ("…filled orange (warning) button, not a link"). This run's production build compiles `.btn-warning{…background-color:#e49400…}`, which is rgb(228,148,0), as the Cypress spec expects. Live UAT test 5: "filled orange button that opens the Transformers page", pass. |
| 10 | The unit chain exits 0, the new checks bite, ESLint and the production build pass | ✓ VERIFIED | Run here: `LC_ALL=C npm --prefix services/console/vue run test:unit` rc=0 (coverage line includes "transformer assignment checkboxes"). Three in-memory mutations (v-model removed, link variant, old select) each rc=1. ESLint (`ESLINT_USE_FLAT_CONFIG=false`, no `--fix`) on the three G-37-5 files plus Transformers.vue, TransformerEditor.vue and store/transformers.js: rc=0. `vue-cli-service build --dest <scratchpad>`: "Build complete", and the bundle contains `transformer-checkboxes`. `git diff --check 38eb95b 4cbf1da` is clean. Console worktree clean afterwards. |
| 11 | Console changes are exactly the three files in signed commits on thinx-staging; the parent gitlink is bumped in one signed commit | ✓ VERIFIED | `git diff --stat 38eb95b 4cbf1da`: 3 files (+89/-12). 5f0d73a, 1f0626c, 4cbf1da are all `G`. Parent 04455f8c (`G`) bumps `services/console` to 4cbf1da. Pushed after plan completion: console origin/thinx-staging = 4cbf1da, parent origin/thinx-staging = 0feea517 with gitlink 4cbf1da. |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

Supporting checks run in this pass: the Legacy `services/console/src/test/deploykey.cjs` rc=0, and the parent `npm run test:node` reports 43 tests, 43 pass, 0 fail. These are milestone regression checks, not transformer evidence.

### Prohibitions (37-02-PLAN.md, judgment-tier, flagged)

| Prohibition | Verifier verdict (non-authoritative) | Evidence |
|---|---|---|
| MUST NOT push either repository (executor) | held | The remote-tracking reflogs show the push at 14:29:56 / 14:29:59 +0200, after 04455f8c (14:27:55) and the plan's completion docs commit 0feea517. That is the orchestrator push. |
| MUST NOT create unsigned / hook-bypassing commits | held | `%G?` = G for 5f0d73a, 1f0626c, 4cbf1da and 04455f8c |
| MUST NOT change console files beyond the three | held | The diff 38eb95b..4cbf1da names only DeviceDetail.vue, milestone-v116.cjs and device-detail.spec.js |
| MUST NOT change createTransformer/saveTransformers/loadDevice/transformerOptions logic | held | The DeviceDetail.vue script diff is the two reworded comments only |

These are routed to Human Verification, as the judgment-tier rule requires.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `services/console/vue/src/pages/Devices/DeviceDetail.vue` | Checkbox group, empty state, orange Manage Transformers | ✓ VERIFIED | Exists, substantive, wired (route `/app/device/:udid`; store getters/actions mapped) |
| `services/console/vue/tests/unit/milestone-v116.cjs` | `renderDeviceDetail(builds, dev, transformerItems)` + G-37-5 checks | ✓ VERIFIED | Runs in `test:unit`, which CircleCI `test_vue` runs |
| `services/console/vue/cypress/integration/device-detail.spec.js` | E2E checkbox, no select, orange button, save body | ✓ VERIFIED (static) | Parses and passes ESLint; its CI execution was not inspected here |
| `services/console` (parent gitlink) | Bumped to the G-37-5 console commit | ✓ VERIFIED | `HEAD:services/console` = 4cbf1da = console HEAD = origin. `verify.artifacts` reports "Not a file: path is a directory" for this entry; that is a tool limitation, so it was checked manually. |
| `services/console/vue/src/store/transformers.js` | Info-patch persistence, refresh before write (TRANS-01) | ✓ VERIFIED | Used by Transformers.vue, TransformerEditor.vue and DeviceDetail.vue |
| `services/console/vue/src/pages/Transformers/{Transformers,TransformerEditor}.vue` | Create/edit/delete UI (TRANS-01) | ✓ VERIFIED | Routed in `Routes.js` lines 101-108 |

### Key Link Verification

`gsd-tools verify.key-links` could not evaluate these links because the plan's `from:` fields are prose, not file paths ("Source file not found"). Each link was verified by hand.

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| checkbox group | `editForm.transformers` → `saveTransformers` → `devices/updateDevice` → PUT `/api/v2/device` | `v-model` | ✓ WIRED | Line 112 `v-model="editForm.transformers"`. `store/devices.js` `updateDevice` `$put('/device', {changes:{udid,...changes}})`. `router.device.js` `editDevice` → `withOwnedDevice` → `device.edit` |
| `transformerOptions` | one checkbox per transformer | `:options` | ✓ WIRED | Line 113. Options are `{value,text}` only, with no `html` key (T-37-01) |
| Manage Transformers button | `/app/transformers` | `to=` | ✓ WIRED | Line 121, route `transformers` → `TransformerManager` |
| `renderDeviceDetail` | full DeviceDetail template + `loadDevice` | `compileToFunctions` | ✓ WIRED | Reads DeviceDetail.vue from disk; the mutation probes confirm it tracks the real file |
| `transformers/saveTransformers` | `profile.info.transformers` | POST `/api/v2/profile` `{info:{transformers}}` → `owner.update` → `users/edit` merge | ✓ WIRED | `design_users.json:36` merges `info` per key |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| DeviceDetail checkbox options | `transformerOptions` | `transformers/getItems` ← `fetchItems` ← GET `/profile` `response.info.transformers` | Yes | ✓ FLOWING |
| DeviceDetail checked state | `editForm.transformers` | `loadDevice` ← `devices/getByUdid` ← `device.transformers` | Yes | ✓ FLOWING |
| Transformers list | `items` | `transformers/getItems` ← GET `/profile` | Yes | ✓ FLOWING |
| TransformerEditor form | `form.alias/body` | `getByUtid(utid)` after `fetchItems`, base64-decoded | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Vue unit chain, including the G-37-5, 35 CR-01/WR-02/WR-04 and TRANS-01 store checks | `LC_ALL=C npm --prefix services/console/vue run test:unit` | rc=0, coverage line includes "transformer assignment checkboxes" | ✓ PASS |
| Unit checks detect a lost v-model | `MUT=vmodel node -r <scratch preload> tests/unit/milestone-v116.cjs` (in-memory, source untouched) | rc=1, "checkbox group is bound with v-model" | ✓ PASS |
| Unit checks detect a link-variant button | `MUT=link …` | rc=1, "…filled orange (warning) button, not a link" | ✓ PASS |
| Unit checks detect a reverted multi-select | `MUT=select …` | rc=1, "…renders exactly one checkbox group" | ✓ PASS |
| Lint on the changed and transformer files | `eslint --ext .vue,.cjs,.js <6 files>` | rc=0 | ✓ PASS |
| Production build | `vue-cli-service build --dest <scratchpad>` | Build complete; `.btn-warning` background `#e49400` | ✓ PASS |
| Legacy deploy-key test | `node src/test/deploykey.cjs` | rc=0 | ✓ PASS |
| Parent node suite | `npm run test:node` | 43/43 pass | ✓ PASS |
| Cypress device-detail spec | console CI `test_vue` (`yarn test`) | not inspected by the verifier | ? SKIP (no local Cypress binary; the unit tests and live UAT cover the same behaviour) |

### Probe Execution

Not applicable. This phase declares no `scripts/*/tests/probe-*.sh` probes and is not a migration or tooling phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TRANS-01 | 37-01 | Create and edit transformers in Vue and persist them in profile.info.transformers without losing other profile fields | ✓ SATISFIED | Truths 1-2; live UAT tests 1, 2, 3, 6 |
| TRANS-02 | 37-01, 37-02 | Select existing transformers and create-and-assign a transformer from Device detail | ✓ SATISFIED | Truths 3-9; live UAT tests 4, 5 |

No orphaned requirements: REQUIREMENTS.md maps only TRANS-01 and TRANS-02 to Phase 37, and both are claimed by plan frontmatter. The REQUIREMENTS.md traceability rows still read "Implemented; locally verified". The orchestrator can update them to the live UAT result (6/6, 2026-10-12), matching phases 35/36.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all six transformer/G-37-5 files) | - | TBD/FIXME/XXX/TODO/HACK/placeholder text | none found | No debt markers |
| `DeviceDetail.vue` | 110-117, 284 | 37-REVIEW WR-01: an assigned utid missing from the profile list (deleted transformer, or a failed fetch) gets no checkbox, stays in `editForm.transformers` and is re-sent on Save. The empty-state line can show while the device still has assignments | ⚠️ Warning | Does not defeat TRANS-02 (see below). Same limitation as the pre-G-37-5 multi-select, recorded as Not-in-scope in 37-02-PLAN/SUMMARY |
| `DeviceDetail.vue` | 415 | IN-01: the assignment-failure message still says "Select it from the list" | ℹ️ Info | Copy only |
| `DeviceDetail.vue` | 431-441 | UI review: Save Transformers has no in-flight/disabled or dirty state (double click sends two PUTs; both are idempotent writes of the same array) | ℹ️ Info | UX polish |
| `Transformers.vue` / `DeviceDetail.vue` | 22, 43 / 158 | UI review: "Alias" vs "Name" wording | ℹ️ Info | Copy consistency |

**WR-01 weighed against TRANS-02.** TRANS-02 asks that *existing* transformers can be selected and that create-and-assign works. Both hold: every transformer in `profile.info.transformers` gets a checkbox that reflects and changes the assignment, and Save persists it. WR-01 affects only utids that have no transformer behind them. Those utids are inert on the server: `Device.transformerJobs` (lib/thinx/device.js:605-630) builds a job only for a utid that the owner profile defines, so a re-saved orphan never runs code. Utids are `crypto.randomUUID()`, so an orphan cannot be revived by a later create. No stored data is lost or overwritten. The old multi-select had the same blind spot, because it had no option for an orphan either. The G-37-5 empty-state line adds one new wrinkle: it can say "No transformers yet" while orphans remain, and when the cause is a failed fetch, `loadDevice` also shows "Some device details could not be loaded". Verdict: a warning-level follow-up, not a must-have failure. No later v1.16 phase covers it (Phase 38 is deploy keys). 37-REVIEW-DISPOSITION.md still lists WR-01 as `open`. **Developer decision requested:** set it to `deferred` with a reason, or schedule the review's `assignmentOptions` fix (show orphans as "(missing) <utid>" checkboxes and base the empty state on both lists). A natural companion is the UI review's point that deleting a transformer does not warn about the devices that use it.

### Human Verification Required

### 1. Acknowledge the 37-02 judgment-tier prohibitions

**Test:** Review the four flagged prohibitions in 37-02-PLAN.md (no executor push; signed commits only, no hook bypass; console scope limited to three files; no logic change to createTransformer/saveTransformers/loadDevice/transformerOptions) against the evidence in the Prohibitions table above.
**Expected:** All four held: signatures G, a three-file diff, comment-only script changes, and a push after plan completion.
**Why human:** Judgment-tier prohibitions need explicit human resolution. The verifier's verdict is non-authoritative.

The functional behaviour has already been accepted live: 37-UAT.md is 6/6 pass, and test 5 was re-run after the 37-02 rollout.

### Gaps Summary

There are no gaps. All 11 must-haves are verified against the code, the unit chain, mutation probes and the production build. TRANS-01 and TRANS-02 are satisfied, and G-37-5 is closed in code and in live UAT. The status is `human_needed` only because the four judgment-tier prohibitions are flagged; the evidence shows none was violated. Open follow-ups, none of them blocking: WR-01 (orphaned assignments and the empty-state wording) needs a disposition decision; IN-01 to IN-03 and the UI-review copy and UX items are polish; the console CI Cypress result for 4cbf1da was not inspected here.

## Prior evidence (2026-10-09 report, kept where still accurate)

- Vue complete unit suite including milestone-v116.cjs: pass. It exercises the real component/store functions, the profile transformer patch and create-and-assign. **Re-confirmed this run** with the later 35 review fixes and G-37-5 checks included.
- Legacy deploy-key controller test: pass. **Re-confirmed this run.**
- ESLint on changed Vue files and `git diff --check`: pass. **Re-confirmed for the G-37-5 and transformer files.**
- Vue production build: pass with the existing Sass/bundle-size warnings. The 2026-10-09 host needed a node-ipc preload workaround; **this run built without it.**
- Superseded "unverified gates": browser/live acceptance is now done (37-UAT.md 6/6, 2026-10-12). Publication is done (console thinx-staging 4cbf1da, parent thinx-staging 0feea517). The GitHub write-access blocker no longer applies.
- Not re-run here: the parent targeted Jasmine specs (BuildlogPagingSpec, OwnerPurgeSpec) and the full CouchDB/Redis integration suite. Neither covers transformer code.

---

_Verified: 2026-10-12T12:55:00Z_
_Verifier: Claude (gsd-verifier)_
