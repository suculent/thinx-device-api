---
phase: 46-transformers-environment-globals
verified: 2026-10-13T22:44:57Z
status: human_needed
score: 15/19 must-haves verified
covered_files:
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-01-PLAN.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-01-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-02-PLAN.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-02-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-03-PLAN.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-03-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-04-PLAN.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-04-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-05-PLAN.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-05-SUMMARY.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-06-PLAN.md"
  - ".planning/workstreams/vue-console/phases/46-transformers-environment-globals/46-06-SUMMARY.md"
  - "lib/thinx/apienv.js"
  - "services/console/vue/cypress/integration/device-detail.spec.js"
  - "services/console/vue/package.json"
  - "services/console/vue/src/pages/Devices/DeviceDetail.vue"
  - "services/console/vue/src/pages/Enviros/Enviros.vue"
  - "services/console/vue/src/pages/Transformers/TransformerEditor.vue"
  - "services/console/vue/src/pages/Transformers/Transformers.vue"
  - "services/console/vue/src/store/devices.js"
  - "services/console/vue/src/store/enviros.js"
  - "services/console/vue/src/store/transformers.js"
  - "services/console/vue/src/styles/_platforms.scss"
  - "services/console/vue/src/styles/_settings-pages.scss"
  - "services/console/vue/src/styles/theme.scss"
  - "services/console/vue/src/utils/confirmLeave.js"
  - "services/console/vue/src/utils/transformerUsage.js"
  - "services/console/vue/tests/unit/milestone-v116.cjs"
  - "services/console/vue/tests/unit/transformers-enviros.cjs"
  - "spec/jasmine/ApienvExactKeySpec.js"
covered_digest: "v3:sha256:55b54c1ea1872f7908700eb76799765783d2a3980946b7e61c3b2e7d1159ba9f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 12/18
  gaps_closed:
    - "No user change is silently lost (phase goal clause; POL-03 dirty state on the Device Detail Transformer Assignment card) — CR-01, console 31bce2b"
    - "WR-05 (same root cause, recommended in the gap): a failed device re-read after a stored transformer write no longer shows the old list under 'Transformers saved.'"
    - "Live ship proof (previous truth 14, UNCERTAIN): independently re-checked with tokenless/unauthenticated read-only probes"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Operator UAT items 13-14 (46-06-SUMMARY.md): on production Device Detail tick a transformer, change and Save the Alias, then the Description, then the Environment; then type an Alias without saving, tick a transformer and press Save Transformers"
    expected: "After each alias/description/environment save the message shows ('Saved.' / 'Environment saved.'), the tick and the 'Unsaved changes' note stay, Save Transformers stays enabled and Manage Transformers opens the 'Unsaved Changes' dialog; after Save Transformers, 'Transformers saved.' shows in the card and the typed Alias is still in the field, unsaved"
    why_human: "Needs a logged-in operator on production. The code path is proven by unit checks K1-K6 and the verifier's scratch harness against the real page and the real devices store, but no browser run against the live API exists"
  - test: "Operator UAT items 1-12 from 46-05-SUMMARY.md (rollout, Transformers icons and Name copy, typed-confirm bulk and row delete with reload, Device Detail dirty note / leave guard / Saving state / failure, P46_WIFI and P46_WIFI_SSID exact-key edit, edit failure with blocked /api/v2/env, Add duplicate refusal and bulk delete, layout backstops, Phase 37 records, Legacy console environment page)"
    expected: "Every item behaves as described in 46-05-SUMMARY.md § Pending end-of-phase UAT"
    why_human: "Needs a logged-in operator on production; the D-02 exact-key fix has no unauthenticated signal and the verifier must not touch production"
  - test: "E1/E6 overflow at 375/768/1024/1280 px on Transformers and Environment Globals"
    expected: "Rows one line high, Actions one IconButton row, bulk toolbar one row, no page-level horizontal scrollbar"
    why_human: "backstop truth (insufficient_spec): layout cannot be inferred from source; needs a browser"
  - test: "E3 overflow: 30 transformers selected, typed-confirm dialog at a 768 px-high viewport"
    expected: "Names list scrolls inside a 160 px box; confirm field and Delete button stay visible; no horizontal scrollbar"
    why_human: "backstop truth (insufficient_spec); max-height: 160px is present in _settings-pages.scss but the rendered result needs a browser"
  - test: "E3 long-text: 200-character no-space transformer name and a right-to-left name in the delete dialog"
    expected: "Name wraps in question and list with no horizontal overflow; the RTL name does not reorder the sentence"
    why_human: "backstop truth (insufficient_spec)"
  - test: "E7 long-text: 120-character variable key and a 2000-character value in the Edit value dialog"
    expected: "Full key wraps in the title and the Key line; the long value saves with one PUT"
    why_human: "backstop truth (insufficient_spec)"
  - test: "unverified-prohibition — human review recommended: 46-06 judgment-tier prohibitions 3 and 4 (no ssh to production, no docker service commands, no pipeline rerun/re-trigger, no production login or credential use, no .env reads, no env dumps, no npm install/lint)"
    expected: "Operator confirms the executor session respected them"
    why_human: "Process prohibitions leave no artifact in the repository. Non-authoritative verifier verdict: no evidence of violation (origin/main unchanged at 14c08c1f; pipeline 5672 is the push pipeline with the expected three jobs; every outgoing commit is G-signed). Prohibitions 1 and 2 (scope) are verified from the diff: only DeviceDetail.vue <script> and two unit files changed, template byte-identical to a16307a, no store/package/Legacy change, WR-01..WR-04 and IN-01..IN-04 still open"
---

# Phase 46: Transformers & Environment Globals Verification Report

**Phase Goal:** Transformers and environment globals are managed with clear icon actions, a safe bulk delete and in-place editing, and no user change is silently lost.
**Verified:** 2026-10-13T22:44:57Z
**Status:** human_needed
**Re-verification:** Yes, after gap closure (plan 46-06: console `f418ce5` RED, `31bce2b` GREEN; parent `59ef5271`, `6d47a5fb`; pipeline 5672)

Scope checked this round: console `a16307a..31bce2b` (exactly `vue/src/pages/Devices/DeviceDetail.vue`, `vue/tests/unit/milestone-v116.cjs`, `vue/tests/unit/transformers-enviros.cjs`; both commits `G`), parent `656bb9eb..6d47a5fb` (outside `.planning/` only the `services/console` gitlink). The previously passing items were regression-checked.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Edit shows a white wrench, Delete a trash, Add Transformer a `+`; the field is called "Name" on every transformer surface | ✓ VERIFIED (regression) | `Transformers.vue:36` `fa fa-wrench icon-white`; unchanged since the initial verification (no console change outside DeviceDetail.vue and two unit files); unit suite green |
| 2 | SC2: bulk delete of ticked transformers after typing `confirm`, with the device-usage warning; exactly the ticked ones go | ✓ VERIFIED (regression) | `Transformers.vue:109` `confirmText.trim() === 'confirm'`; files untouched; B* checks pass |
| 3 | SC3: Save Transformers has a pending state, unsaved ticks are marked dirty, Manage Transformers with unsaved changes warns | ✓ VERIFIED | Unchanged H*/I* checks pass; and the dirty state now survives the other saves (truth 6) |
| 4 | SC4: each Environment Globals row has Edit; a failed edit keeps the old value and shows an error | ✓ VERIFIED (with warning WR-01, unchanged) | `Enviros.vue` untouched; `enviro-edit-modal` present; WR-01 still open (decision below) |
| 5 | SC5: Phase 37 IN-02 and IN-03 fixed or deferred with a reason | ✓ VERIFIED (regression) | `37-REVIEW-DISPOSITION.md` unchanged (`open: 0`) |
| 6 | Goal clause: no user change is silently lost (CR-01; POL-03 dirty state survives cross-card saves) | ✓ VERIFIED | `DeviceDetail.vue loadDevice()` (:330-349) decides `keepAlias` / `keepDescription` / `keepTransformers` against the device on screen and writes only the fields not kept; `saveField` (:350-364), `saveTransformers` (:501-530) and `createTransformer` (:483) first apply what they wrote to `Object.assign({}, this.device, …)`. Behavior-dependent, so backed by tests that run the real reload: K1 (alias + description saves keep ticks, note, enabled Save, leave-guard confirm and the other text draft), K2 (Save Transformers keeps typed alias/description), K3 (environment save keeps ticks and both text drafts), K5 (untouched fields follow the server; refused saves read nothing), K6 (Create & Assign). Verifier's own scratch harness against the real page **and the real devices store** with a fake `$api`: tick during an in-flight alias save kept, alias typed during the save kept, description save keeps alias draft and emptied ticks; the same harness fails 4/7 on the pre-fix page (sensitivity control) |
| 7 | D-02/ENV-01 API: an overwrite replaces only the exact key; envelopes, routes and CSRF order unchanged | ✓ VERIFIED (regression) | `apienv.js` compares `Object.keys(obj)[0] === stored_name` (`String(key)`); `ApienvExactKeySpec` + `CsrfRouteInventorySpec`: 89 specs, 0 failures (re-run here) |
| 8 | Add Variable refuses a listed key and sends nothing | ✓ VERIFIED (regression) | `Enviros.vue` untouched; unit checks pass |
| 9 | A transformer write that succeeded is never reported as failed because the re-read failed (Phase 35 IN-02) | ✓ VERIFIED (regression) | `store/transformers.js` untouched |
| 10 | Transformer names and variable keys render as text only | ✓ VERIFIED | No `v-html` in Transformers.vue, Enviros.vue or DeviceDetail.vue; DeviceDetail template byte-identical to `a16307a` |
| 11 | Load states and selection pruning | ✓ VERIFIED (regression) | Pages and stores untouched; unit checks pass |
| 12 | `confirmLeave(vm)` is the one unsaved-changes confirm | ✓ VERIFIED | `beforeRouteLeave` unchanged; K1 asserts one `confirmLeave` prompt with `LEAVE_MESSAGE`/`LEAVE_OPTIONS` after an alias save |
| 13 | Ship refs: console thinx-staging = gitlink; bump commit only changes `services/console` | ✓ VERIFIED | console HEAD = `origin/thinx-staging` = parent gitlink = `31bce2b`; parent `origin/thinx-staging` = `6d47a5fb`, `git show --name-only 6d47a5fb` = `services/console`; `origin/main` = `14c08c1f` (unchanged) |
| 14 | Live ship proof: pipeline legacy-off, new bundle served, Legacy byte-identical, unauthenticated env surface unchanged | ✓ VERIFIED (was UNCERTAIN) | Re-checked here, tokenless and unauthenticated: `check-ci-gates.js pipeline --revision 6d47a5fb… --expect legacy-off` → `CI-GATES PIPELINE OK 5672` (test, api-registry, vue-console-registry; no snyk/console-classic); `console.thinx.cloud/js/app.js` 3234786 bytes, `6d47a5f` ×2, all eight Phase 46 markers present, `devices/loadDevices` ×2, both replaced strings absent; seven Legacy files `shasum -c` OK against the 46-05 hashes; GET `/api/v2/env` 401 on both hosts, `/api/user/env/list` 401, `/api/user/profile` 401; `http://rtm.thinx.cloud:7442/` 200 |
| 15 | E1/E6 overflow (backstop) | ? insufficient_spec | Human verification |
| 16 | E3 overflow, 30 selected (backstop) | ? insufficient_spec | Human verification |
| 17 | E3 long-text (backstop) | ? insufficient_spec | Human verification |
| 18 | E7 long-text (backstop) | ? insufficient_spec | Human verification |
| 19 | WR-05: after a stored transformer write whose re-read fails, the card shows the saved list with no dirty note under `Transformers saved.`, the page error shows, and the old list cannot be written back; the Environment card keeps only the masked copy | ✓ VERIFIED | `mapActions` maps `loadDevices: 'devices/loadDevices'` (throws on `success:false`), the `fetchItems` mapping is gone; `loadDevice` keeps `before` when `results[0]` rejected. K4 (transformer, alias and masked-environment cases; Save asserted disabled). Scratch harness S3 drives the **real** store `loadDevices` with `$get` answering `success:false`: device and ticks show `t1,t2`, store still `t1`, not dirty, page error set, `Transformers saved.` |

**Score:** 15/19 truths verified (0 present, behavior-unverified; 0 failed; 4 backstop truths routed to human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vue/src/pages/Devices/DeviceDetail.vue` | draft-preserving `loadDevice`; saves apply writes to a device copy; throwing list loader | ✓ VERIFIED | Contains `loadDevices: 'devices/loadDevices'`, three `Object.assign({}, this.device, …)`; template byte-identical to `a16307a`; no new method, data or computed; no `beforeunload`; `saveEnvironment` does not copy the sent environment |
| `vue/tests/unit/transformers-enviros.cjs` | `draftHarness` + K1..K6 | ✓ VERIFIED | `function draftHarness` assigns `loadDevices`, `fetchItems`, `updateDevice`, `getByUdid` but never `loadDevice`; each K asserts `calls.list` to prove the real reload ran; substantive assertions (not smoke) |
| `vue/tests/unit/milestone-v116.cjs` | `loadDevices` stub in `renderDeviceDetail` | ✓ VERIFIED | `loadDevices: noop` added; v1.16 regression checks pass |
| `46-REVIEW-DISPOSITION.md` | CR-01/WR-05 fixed, `open: 8` | ✓ VERIFIED | Both rows `fixed (console 31bce2b)`; the other eight rows `open` |
| `services/console` gitlink | bumped to the fix | ✓ VERIFIED | `31bce2b`, signed bump `6d47a5fb` |
| Phase 46 artifacts from 46-01..46-05 | (see previous report) | ✓ VERIFIED (regression) | `git diff a16307a HEAD` touches none of them; parent `lib`/`spec` unchanged since 656bb9eb |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| DeviceDetail.vue `loadDevice` | store `devices/loadDevices` → GET /api/v2/device | mapActions, first `Promise.allSettled` entry | ✓ WIRED | Rejection keeps `before` and sets the page error; served bundle has `devices/loadDevices` ×2 |
| `saveField` / `saveTransformers` / `createTransformer` | `this.device` local copy | `Object.assign({}, this.device, …)` before `await this.loadDevice()` | ✓ WIRED | Store item never mutated in place (scratch S1 asserts `vm.device === state.items[0]` after a successful re-read) |
| parent thinx-staging HEAD | console thinx-staging HEAD | `chore(46): bump console to the device detail draft fix` | ✓ WIRED | `6d47a5fb` → `31bce2b` |
| Earlier links (router.env → apienv.create, Transformers/Enviros → stores, confirmLeave) | — | — | ✓ WIRED (regression) | Files untouched |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Transformers.vue | `items`, `devices` | GET /profile, GET /device | Yes | ✓ FLOWING |
| Enviros.vue | `items` | GET /env (names only) | Yes | ✓ FLOWING |
| DeviceDetail.vue | `editForm.transformers` / `alias` / `description` | store device list on reload, user drafts kept when they differ from the device on screen | Yes, drafts preserved | ✓ FLOWING (CR-01 closed) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Console unit chain (one run) | `LC_ALL=C npm run test:unit` in `services/console/vue` | rc 0, 324 `ok`, 0 `FAIL`; K1..K6 ok; v1.16 regression checks passed | ✓ PASS |
| Exact-key overwrite and envelopes | `npx jasmine … ApienvExactKeySpec.js CsrfRouteInventorySpec.js` | 89 specs, 0 failures | ✓ PASS |
| CR-01/WR-05 through the real page and real devices store | scratch `adv.cjs` (fake `$api`, real `DeviceDetail.vue` script and `store/devices.js`) | 7/7 ok (S0-S5) | ✓ PASS |
| Sensitivity control | same harness on the `a16307a` page | S1, S2, S3, S5 FAIL | ✓ harness detects the old bug |
| Template / Legacy scope | template diff vs `a16307a`; `git diff a16307a HEAD -- src` | identical; no Legacy change | ✓ PASS |
| Pipeline | `node scripts/check-ci-gates.js pipeline --revision 6d47a5fb… --expect legacy-off` (no token) | `CI-GATES PIPELINE OK 5672` | ✓ PASS |
| Live bundle, Legacy, API surface, port 7442 | unauthenticated GETs only | `6d47a5f` served with all markers; 7/7 Legacy OK; 401s as before; 7442 200 | ✓ PASS |

The credential-free PUT/POST probes of the plan were not repeated (read-only probes only); 46-06-SUMMARY records them as 403.

### Probe Execution

Not applicable: the phase declares no `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TRANS-03 | 46-02, 46-05 | White wrench Edit, trash Delete, `+` Add | ✓ SATISFIED | Truth 1 |
| TRANS-04 | 46-02, 46-05 | Bulk delete after typing `confirm` | ✓ SATISFIED | Truth 2 |
| ENV-01 | 46-01, 46-03, 46-05 | Edit value; failed edit keeps old value with an error (D-01 atomic overwrite) | ✓ SATISFIED (warning WR-01) | Truths 4, 7, 8 |
| POL-03 | 46-02, 46-04, 46-05, 46-06 | Save Transformers pending and dirty states; Name everywhere; delete usage warning | ✓ SATISFIED | Truths 3, 6, 19; CR-01 and WR-05 closed |
| FIX-03 | 46-04, 46-05 | Phase 37 IN-02, IN-03 fixed or deferred | ✓ SATISFIED | Truth 5 |

No orphaned requirements: REQUIREMENTS.md maps exactly these five IDs to Phase 46, and every plan's `requirements` list is a subset. REQUIREMENTS.md still shows TRANS-03, TRANS-04, ENV-01 and FIX-03 as `Gaps Found` (unchecked) and POL-03 as `Complete`; the orchestrator should restore the four after this re-verification.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `vue/src/pages/Devices/DeviceDetail.vue` | 330-349 | (was CR-01) reload resets every draft | — resolved | Fixed in `31bce2b` |
| `vue/src/pages/Devices/DeviceDetail.vue` | (was 507-509) | (was WR-05) reload via non-throwing `fetchItems` | — resolved | Fixed in `31bce2b` |
| `lib/thinx/apienv.js` | 26-47 | `redis.get` error unchecked; `redis.set` without callback (WR-01) | ⚠️ Warning (carried) | Unchanged; operator decision still open |
| `vue/src/store/enviros.js` | 5-13 | `refreshAfter` uses non-throwing `fetchItems` (WR-02) | ⚠️ Warning (carried) | Unchanged |
| `vue/src/pages/Enviros/Enviros.vue` | Edit/Add | Value trimmed before sending (WR-03) | ⚠️ Warning (carried, human decision) | Unchanged |
| `lib/thinx/apienv.js` | 101 | `for…in` over unvalidated `names` (WR-04) | ℹ️ Info (carried) | Unchanged |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` in the three files changed by 46-06. No new blocker; nothing new-scope to record as advisory.

### Advisory (New Scope, Unevidenced)

None.

### Human Verification Required

1. **CR-01 on production (46-06 UAT items 13-14)** — tick a transformer, save Alias, Description and Environment in turn; the tick, the "Unsaved changes" note, the enabled Save Transformers and the leave dialog stay. Then type an Alias without saving, tick, Save Transformers: "Transformers saved." and the typed Alias stays. Item 15 (WR-05) has no operator reproduction; K4 and scratch S3 cover it.
2. **46-05 UAT items 1-12** (46-05-SUMMARY.md), unchanged.
3. **Layout backstops** E1/E6, E3 (two), E7 in a browser at the listed widths and lengths.
4. **46-06 judgment-tier process prohibitions** (flagged, non-authoritative verdict: no evidence of violation).

Decisions still requested from the previous report (not blocking): WR-01 (fix `apienv.create` acknowledgement or accept T-46-06 with an override) and WR-03 (keep the specified trim and say so, or send the raw value).

### Gaps Summary

The one blocker from the initial verification is closed. `loadDevice()` now keeps every draft that differs from the device on screen, and each save first applies what it wrote to a copy of the device, so a save on one card no longer resets another card's unsaved alias, description or ticks. The list is re-read through the throwing `devices/loadDevices`, so a failed re-read after a stored write keeps the written values on screen with the page error (WR-05). Unit checks K1..K6 run the page's real reload, and an independent scratch harness that also runs the real devices store confirms the behaviour, including edits made while a save is in flight. The same harness fails on the pre-fix page. The change is limited to the `<script>` of one page plus two unit files, the template is byte-identical, and the fix is live: pipeline 5672 is green and legacy-off, `console.thinx.cloud` serves `6d47a5f`, Legacy is byte-identical and the unauthenticated surface and port 7442 are unchanged.

What remains is human: the operator's CR-01 run on production, the 46-05 UAT items, the four layout backstops and the flagged process prohibitions.

---

_Verified: 2026-10-13T22:44:57Z_
_Verifier: Claude (gsd-verifier)_
