---
phase: 46-transformers-environment-globals
verified: 2026-10-13T21:49:07Z
status: gaps_found
score: 12/18 must-haves verified
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
covered_digest: "v3:sha256:c69c260729a8f5c53f8521a89137540fc2cdaa3adf57fd4db90628a3f4f8c964"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "No user change is silently lost (phase goal clause; POL-03 dirty state on the Device Detail Transformer Assignment card)"
    status: failed
    reason: >-
      CR-01 confirmed. DeviceDetail.vue loadDevice() unconditionally rewrites editForm.alias,
      editForm.description and editForm.transformers from the store. saveField('alias'|'description')
      and saveEnvironment() await loadDevice() after a successful save, so unsaved transformer ticks
      revert to the stored list, transformersDirty turns false, the "Unsaved changes" note disappears
      and beforeRouteLeave stops prompting. No message tells the user. The reverse also holds:
      saveTransformers() -> loadDevice() overwrites typed but unsaved alias/description text.
      Reproduced with a scratch harness that runs the real DeviceDetail.vue methods against a fake
      store: ticks ["t1","t2"] dirty=true -> saveField('alias') -> ticks ["t1"] dirty=false message "Saved.";
      saveEnvironment gives the same result; saveTransformers resets alias "typed-not-saved" to "dev".
      The existing unit harness (transformers-enviros.cjs saveHarness) stubs loadDevice, so it never
      exercises this path. createTransformer is the only save that already restores the pending ticks.
    artifacts:
      - path: "services/console/vue/src/pages/Devices/DeviceDetail.vue"
        issue: "loadDevice() (:325-339) resets every editForm field; callers saveField (:340-350), saveEnvironment (:420-443) and saveTransformers (:487-513) do not preserve drafts they did not save"
      - path: "services/console/vue/tests/unit/transformers-enviros.cjs"
        issue: "saveHarness replaces loadDevice with a stub, so no test covers a cross-card save on a dirty card"
    missing:
      - "loadDevice must keep drafts the triggering save did not write: saveField keeps the ticks and the other text field, saveEnvironment keeps ticks, alias and description, saveTransformers keeps alias and description (46-REVIEW CR-01 fix sketch)"
      - "Unit check that runs the real loadDevice: tick, saveField('alias'), assert editForm.transformers and transformersDirty survive; and type alias, saveTransformers, assert the alias draft survives"
      - "Recommended in the same change (WR-05, same root cause): after a successful transformer write, apply the saved list to this.device before the reload, or reload through the throwing devices/loadDevices, so a success:false re-read cannot revert the ticks under 'Transformers saved.'"
      - "Set POL-03 back to pending in REQUIREMENTS.md until this gap is closed (it is marked Complete now)"
human_verification:
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
  - test: "Live ship proof (46-05 truths 5-8): pipeline 5671 legacy-off with no snyk job, console.thinx.cloud bundle 656bb9e with every Phase 46 marker, Legacy files byte-identical, unauthenticated env routes 401/403, port 7442 unchanged"
    expected: "Matches 46-05-SUMMARY.md coverage D2/D3"
    why_human: "Only the SUMMARY records these results; re-checking them needs production or CircleCI access the verifier was told not to use. Local refs agree: console origin/thinx-staging = gitlink = a16307a, parent origin/thinx-staging = 656bb9eb"
---

# Phase 46: Transformers & Environment Globals Verification Report

**Phase Goal:** Transformers and environment globals are managed with clear icon actions, a safe bulk delete and in-place editing, and no user change is silently lost.
**Verified:** 2026-10-13T21:49:07Z
**Status:** gaps_found
**Re-verification:** No (initial verification)

Scope checked: parent `fc34df9b..HEAD` (`lib/thinx/apienv.js`, `spec/jasmine/ApienvExactKeySpec.js`, planning records) and console `316c5f9..a16307a` (16 Vue paths, nothing under Legacy `src/`).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Edit shows a white wrench, Delete a trash, Add Transformer a `+`; the field is called "Name" on every transformer surface | ✓ VERIFIED | `Transformers.vue` IconButtons `fa fa-wrench icon-white` / `fa fa-trash` (danger), Add `fa fa-plus` + text; `_platforms.scss:116` `.icon-button .icon-white { color: #FFFFFF }`; `theme.scss:27` imports `settings-pages`; no visible "Alias" in Transformers.vue, TransformerEditor.vue or the store message ("Transformer name is required."); unit tests pass |
| 2 | SC2: several ticked transformers are deleted by one trash after typing `confirm`; the dialog warns about devices using them; exactly the ticked ones go | ✓ VERIFIED | One `transformer-delete-modal` for row and bulk; `confirmMatches` = `trim() === 'confirm'`; `submitDelete` guards; `deleteItems` re-reads the profile, filters only the target utids, one `saveTransformers` POST; `countDevicesUsing`/`usageSentence` in `transformerUsage.js`; unit checks B* pass. Reload proof is UAT item 3 |
| 3 | SC3: Save Transformers has a pending state, unsaved ticks are marked dirty, Manage Transformers with unsaved changes warns | ✓ VERIFIED | `transformersDirty` (set compare), `role=status` note, `Saving…` spinner, single-shot `transformersSaving`, `beforeRouteLeave` → shared `confirmLeave(this)`; unit checks H*, I1-I5 pass. Holds on its own paths; see truth 6 for how other saves wipe it |
| 4 | SC4: each Environment Globals row has Edit; a failed edit keeps the old value and shows an error | ✓ VERIFIED (with warning) | `Enviros.vue` `enviro-edit` IconButton → `enviro-edit-modal`; `saveEdit` sends one `createItem({key, value})` (one PUT); failure keeps dialog + `Could not save the new value. <key> keeps its current value. Try again.` + `loadData()`. Warning WR-01: `apienv.create` calls back success before `redis.set` is acknowledged (accepted risk T-46-06 in 46-01), so a Redis write failure would show "Value saved" |
| 5 | SC5: Phase 37 IN-02 and IN-03 fixed or deferred with a reason | ✓ VERIFIED | `37-REVIEW-DISPOSITION.md`: IN-02 fixed (console dac2c5e, d526ff7), IN-03 fixed (console a16307a), `open: 0`; `device-detail.spec.js` names `$orange: #E49400 (src/styles/_variables.scss:47)` and asserts `Transformers saved.` inside the card |
| 6 | Goal clause: no user change is silently lost | ✗ FAILED | CR-01 reproduced (see Gaps). Saving alias, description or environment on Device Detail discards unsaved transformer ticks and clears the dirty note; saving transformers discards unsaved alias/description text. No warning or message |
| 7 | D-02/ENV-01 API: an overwrite replaces only the exact key (editing WIFI keeps WIFI_SSID, MY_WIFI, wifi); envelopes, routes and CSRF order unchanged | ✓ VERIFIED | `apienv.js` compares `Object.keys(obj)[0] === String(key)`, one `redis.set` of the whole array; `ApienvExactKeySpec` + `CsrfRouteInventorySpec`: 89 specs, 0 failures (run here); `lib/router.env.js` untouched; both parent commits signed (G) |
| 8 | Add Variable refuses a listed key and sends nothing, so Add never overwrites silently | ✓ VERIFIED | `Enviros.vue create()` checks `items.some(item => item.label === key)` → duplicate copy, no request; reloads first when the list is not loaded; unit checks pass |
| 9 | A transformer write that succeeded is never reported as failed because the re-read failed (Phase 35 IN-02) | ✓ VERIFIED | `store/transformers.js saveTransformers` returns `refreshed: false` on a failed re-read; pages reload once; recorded in ROADMAP Phase 48 "Closed in Phase 46" |
| 10 | Transformer names and variable keys render as text only | ✓ VERIFIED | No `v-html` in Transformers.vue, Enviros.vue or DeviceDetail.vue; delete confirm for variables is a plain string; `dir="auto"` on names |
| 11 | Load states and selection pruning (one non-dismissible load error, Loading… only first time, empty row, selection pruned on every load) | ✓ VERIFIED | `loadData`/`applyItems`/`showItems` in both pages; `loadDevices`/`loadItems` throw on failure; unit checks pass |
| 12 | `confirmLeave(vm)` is the one unsaved-changes confirm for Device Detail and TransformerEditor; true only for an explicit OK | ✓ VERIFIED | `utils/confirmLeave.js` resolves `answer === true`, rejection → false; both pages import it and refuse a second prompt with `leavePrompting` |
| 13 | Ship refs: console thinx-staging = gitlink; bump commit only changes `services/console` | ✓ VERIFIED | Local refs: console `origin/thinx-staging` = HEAD = parent gitlink = `a16307a`; parent `origin/thinx-staging` = `656bb9eb` (the bump); HEAD is 2 local docs commits ahead |
| 14 | Live ship proof: pipeline legacy-off, new bundle served, Legacy byte-identical, unauthenticated env surface unchanged | ? UNCERTAIN | Only 46-05-SUMMARY records it; not re-checked (production off-limits for this verification) |
| 15 | E1/E6 overflow (backstop) | ? insufficient_spec | Human verification |
| 16 | E3 overflow, 30 selected (backstop) | ? insufficient_spec | Human verification (`.typed-confirm__names { max-height: 160px }` present) |
| 17 | E3 long-text (backstop) | ? insufficient_spec | Human verification |
| 18 | E7 long-text (backstop) | ? insufficient_spec | Human verification |

**Score:** 12/18 truths verified (0 present, behavior-unverified; 1 failed; 5 routed to human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/thinx/apienv.js` | exact-key create | ✓ VERIFIED | `String(key)` strict compare, no `indexOf`, single `redis.set("env:"` |
| `spec/jasmine/ApienvExactKeySpec.js` | L1-L6, R1-R4 | ✓ VERIFIED | Non-ZZ name (runs in CI `test`), passes locally |
| `vue/src/pages/Transformers/Transformers.vue` | icons, selection, typed confirm, load states | ✓ VERIFIED | `transformer-delete-modal`, wired to `deleteItems`/`loadDevices` |
| `vue/src/utils/transformerUsage.js` | `countDevicesUsing`, `usageSentence` | ✓ VERIFIED | Imported and used by Transformers.vue |
| `vue/src/store/transformers.js` | `deleteItems`, `refreshed` flag | ✓ VERIFIED | |
| `vue/src/store/devices.js` | throwing `loadDevices` | ✓ VERIFIED | `fetchItems` still non-throwing (relevant to WR-05) |
| `vue/src/styles/_settings-pages.scss` | shared Phase 46 rules | ✓ VERIFIED | Imported in `theme.scss:27` after `deploy-keys` |
| `vue/src/pages/Enviros/Enviros.vue` | edit dialog, guarded bulk delete, add refusal | ✓ VERIFIED | `enviro-edit-modal`, `deletingKeys`, `confirming` guards |
| `vue/src/store/enviros.js` | throwing `loadItems` | ✓ VERIFIED | `refreshAfter` still refreshes through non-throwing `fetchItems` (WR-02) |
| `vue/src/utils/confirmLeave.js` | shared confirm | ✓ VERIFIED | |
| `vue/src/pages/Devices/DeviceDetail.vue` | dirty, leave guard, Saving…, in-card result | ⚠️ PARTIAL | Present and wired; the dirty state does not survive other saves (CR-01) |
| `vue/cypress/integration/device-detail.spec.js` | 37 IN-03 | ✓ VERIFIED | Runs with Phase 48 CI-07 |
| `37-REVIEW-DISPOSITION.md` | IN-02/IN-03 fixed, `open: 0` | ✓ VERIFIED | |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| router.env.js addEnvironmentVariable | apienv.create | owner from session | ✓ WIRED | Router unchanged; R1 spec exercises it |
| apienv.create | Redis `env:<owner>` | one `redis.set` | ✓ WIRED | L1 counts one write per create |
| Transformers.vue submitDelete | transformers/deleteItems → POST /profile | mapActions | ✓ WIRED | |
| Transformers.vue loadData | devices/loadDevices | `Promise.allSettled` | ✓ WIRED | |
| Enviros.vue saveEdit | enviros/createItem → PUT /env | mapActions | ✓ WIRED | |
| Enviros.vue deleteSelected | enviros/deleteItems → DELETE /env | guards | ✓ WIRED | |
| DeviceDetail / TransformerEditor beforeRouteLeave | confirmLeave | import | ✓ WIRED | |
| DeviceDetail saveTransformers | devices/updateDevice | `transformersSaving` guard | ✓ WIRED | Followed by the draft-resetting `loadDevice()` (CR-01) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Transformers.vue | `items`, `devices` | GET /profile, GET /device | Yes | ✓ FLOWING |
| Enviros.vue | `items` | GET /env (names only) | Yes | ✓ FLOWING |
| DeviceDetail.vue | `editForm.transformers` | store device list, reset on every `loadDevice()` | Yes, but overwrites user drafts | ⚠️ see CR-01 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Exact-key overwrite and envelopes | `ENVIRONMENT=development COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null spec/jasmine/ApienvExactKeySpec.js spec/jasmine/CsrfRouteInventorySpec.js` | 89 specs, 0 failures | ✓ PASS |
| Console unit chain (one run) | `npm run test:unit` in `services/console/vue` | exit 0, 318 `ok`, 0 `FAIL` | ✓ PASS |
| CR-01: tick, then Save alias | scratch harness running the real `loadDevice`/`saveField` from DeviceDetail.vue against a fake store | ticks `["t1","t2"]` dirty=true → `["t1"]` dirty=false, message "Saved." | ✗ FAIL (user change lost) |
| CR-01: tick, then Save environment | same harness, `saveEnvironment()` | ticks reverted, dirty=false | ✗ FAIL |
| CR-01 reverse: typed alias, then Save Transformers | same harness, `saveTransformers()` | alias "typed-not-saved" → "dev", description reset | ✗ FAIL |
| WR-05: transformer save OK, device re-read answers success:false | same harness | ticks `["t1"]`, server `["t1","t2"]`, dirty=false, "Transformers saved.", no page error | ⚠️ confirms WR-05 |

### Probe Execution

Not applicable: the phase declares no `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TRANS-03 | 46-02, 46-05 | White wrench Edit, trash Delete, `+` Add | ✓ SATISFIED | Truth 1 |
| TRANS-04 | 46-02, 46-05 | Bulk delete after typing `confirm` | ✓ SATISFIED | Truth 2 |
| ENV-01 | 46-01, 46-03, 46-05 | Edit value; failed edit keeps old value with an error (D-01 atomic overwrite) | ✓ SATISFIED (warning WR-01) | Truths 4, 7, 8 |
| POL-03 | 46-02, 46-04, 46-05 | Save Transformers pending and dirty states; Name everywhere; delete usage warning | ✗ BLOCKED (partial) | Pending state, Name copy and warning are in place. The dirty state is silently wiped by other Device Detail saves together with the user's ticks (CR-01). REQUIREMENTS.md marks it Complete |
| FIX-03 | 46-04, 46-05 | Phase 37 IN-02, IN-03 fixed or deferred | ✓ SATISFIED | Truth 5. 37 IN-02 is the navigation path, which is fixed; CR-01 is a different trigger |

No orphaned requirements: REQUIREMENTS.md maps exactly TRANS-03, TRANS-04, ENV-01, POL-03 and FIX-03 to Phase 46, and every plan's `requirements` list is a subset of them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `vue/src/pages/Devices/DeviceDetail.vue` | 325-339 | Reload resets every draft field (CR-01) | 🛑 Blocker | Silent loss of unsaved ticks / alias / description, which contradicts the phase goal |
| `vue/src/pages/Devices/DeviceDetail.vue` | 507-509 + `store/devices.js` 37-43 | Reload through the non-throwing `fetchItems` after a successful write (WR-05) | ⚠️ Warning | "Transformers saved." shown over the old assignment when the re-read answers `success:false`; a later tick + save could overwrite the saved change |
| `lib/thinx/apienv.js` | 26-47 | `redis.get` error unchecked; `redis.set` without callback; success reported before the write (WR-01) | ⚠️ Warning | SC4 edge: a Redis write failure shows "Value saved". Pre-existing; accepted as T-46-06 in 46-01 but not recorded as a verification override |
| `vue/src/store/enviros.js` | 5-13 | `refreshAfter` uses non-throwing `fetchItems` (WR-02) | ⚠️ Warning | After a write, an API-level list failure leaves a stale list on screen with no error |
| `vue/src/pages/Enviros/Enviros.vue` | 229 (Edit), 134 (Add) | Value is trimmed before sending (WR-03) | ⚠️ Warning (human decision) | Specified by UI-T22 and E7, but secrets with significant edge whitespace are changed without telling the user |
| `lib/thinx/apienv.js` | 101 | `for…in` over an unvalidated `names` (WR-04) | ℹ️ Info | Pre-existing; a string `names` deletes single-letter variables. The Vue console always sends an array |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` added in either range; no Legacy (`services/console/src`) change.

### Human Verification Required

These are recorded in frontmatter and still need the operator once the gap is closed:

1. **Operator UAT 1-12** (46-05-SUMMARY.md). Item 5 should also cover the CR-01 path once it is fixed: tick a transformer, edit and Save the alias, and confirm the tick and the "Unsaved changes" note are still there.
2. **E1/E6, E3 (two), E7 layout backstops**: browser checks at the listed widths and lengths.
3. **Live ship proof**: pipeline, bundle markers, unchanged Legacy files and the unauthenticated API surface, recorded only in 46-05-SUMMARY.

Decision requested:
- **WR-01 / SC4 edge**: either fix `apienv.create` (check the `get` error, acknowledge `set` before calling back) or accept it with an override:

```yaml
overrides:
  - must_have: "Each Environment Globals row has an Edit button that changes the value. If the recreate fails, the original variable is back in the list with its old value and the user sees an error."
    reason: "HTTP/API failures are handled; a Redis set failure after a successful get is the pre-existing T-46-06 accepted risk (46-01 threat model), out of D-02 scope"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

(No override is needed today because truth 4 is already counted as verified. This only makes the acceptance explicit.)
- **WR-03 trim**: keep the specified trim and say so in the help line, or send the raw value.

### Gaps Summary

One blocker, which is the phase goal's own clause. The transformer card gained a dirty state, a leave guard and a saving state, and each works on its own path; the 318 unit checks and the exact-key API spec pass. But `DeviceDetail.vue loadDevice()` copies the stored device into every `editForm` field, and three of the page's save paths call it after success. A user who ticks a transformer and then saves the alias (or the description, or the environment) loses the ticks. The dirty note and the leave guard go with them, so nothing tells the user. The same reload overwrites unsaved alias and description text when transformers are saved. I reproduced all three paths with the page's real methods. The unit suite misses them because its save harness replaces `loadDevice` with a stub.

This is review finding CR-01, and it is still open (46-REVIEW-DISPOSITION: open). The reload behaviour itself predates the phase. The phase goal ("no user change is silently lost") and POL-03's dirty state make it in scope: the dirty state the phase added can be erased with the user's change by another save on the same page. No later phase in the milestone covers it (Phase 48 POL-01 only touches Device Detail width), so it is not deferred.

WR-05 has the same root cause (the reload goes through the non-throwing `devices/fetchItems`). It is a warning, not a blocker, because the user's change is on the server and only the display is wrong. It should be fixed in the same `loadDevice` change. The other review warnings (WR-01..WR-04) are warnings or a human decision and do not block the goal.

Grouping for `/gsd-plan-phase --gaps`: one focused plan on `DeviceDetail.vue` `loadDevice` draft preservation (CR-01 + WR-05), a unit check that runs the real `loadDevice`, a console push and gitlink bump, and setting POL-03 back to pending until it ships.

---

_Verified: 2026-10-13T21:49:07Z_
_Verifier: Claude (gsd-verifier)_
