# Phase 46: Transformers & Environment Globals - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning
**Mode:** discuss-phase (default), all 4 areas discussed with the operator; every recommended answer accepted

<domain>
## Phase Boundary

Transformers and environment globals are managed with clear icon actions, a safe confirmed delete and in-place
editing, and no user change is silently lost.

In scope: TRANS-03, TRANS-04, ENV-01, POL-03, FIX-03 (Phase 37 IN-02, IN-03). Vue console
(`services/console/vue`): Transformers page, Transformer editor, Device Detail transformers card, Environment Globals
page, `cypress/integration/device-detail.spec.js` (IN-03 only). One small parent API fix (D-02, see deviations).

Out of scope: Legacy console changes; transformer storage format (stays the v1.16 `profile.info.transformers` patch,
data key `alias` unchanged); repairing the Cypress suite (Phase 48 CI-07); reading environment values back.

</domain>

<decisions>
## Implementation Decisions

### Environment edit (ENV-01)
- **D-01:** Edit overwrites with one `PUT /api/v2/env {key, value}`. `apienv.create` already replaces an existing key
  in a single write, so a failed edit leaves the old value untouched. This meets ENV-01's intent ("if the change fails
  the original variable is kept and the user sees an error") without a delete + recreate; the console never holds the
  old value, so a client-side restore is impossible. Record ENV-01's "delete + recreate" wording as superseded.
  — **Reversibility:** reversible
- **D-02:** Fix the prefix bug in `lib/thinx/apienv.js` `create` (and any sibling that matches keys with `indexOf`):
  only the exact key is replaced, so editing `WIFI` keeps `WIFI_SSID`. Parent API change, with a spec proving it.
  Deviation from the roadmap's "no parent API change expected", accepted by the operator. Legacy `/api/user/env/*`
  envelopes unchanged. — **Reversibility:** reversible
- **D-03:** The Edit dialog shows the key read-only (dialog title names it) and an empty value field with a note that
  the current value is never shown; Save is disabled while the value is empty or the request is pending.
- **D-04:** On failure the dialog stays open with a specific error, the list reloads, and the variable keeps its old
  value. Rows get an Edit icon button (Phase 44 `IconButton`); `Enviros.vue` needs a per-row actions column
  (custom table or a `List.vue` slot, as Phase 44 added `cell(<prop>)`).

### Transformer delete (TRANS-04, POL-03 warning)
- **D-05:** One typed-confirmation dialog serves both the bulk trash and the per-row trash: deleting any transformer
  requires typing `confirm`.
- **D-06:** The dialog names the transformers and says how many devices use them, counted from the device list's
  `transformers` field (e.g. "3 devices will stop applying them."); if the count cannot be loaded it shows the generic
  sentence "Devices using these transformers will stop applying them."
- **D-07:** The Delete button stays disabled until the field equals exactly `confirm` (trimmed, case-sensitive); Enter
  submits only when enabled; the field is cleared every time the dialog opens.
- **D-08:** Selection follows Phase 45 Deploy Keys: a Select checkbox column, "Delete selected (N)" trash in its own
  toolbar, one `saveTransformers` call with the filtered list, pending state and single-shot guard, selection pruned
  to transformers that still exist after reload.

### Unsaved transformer changes on Device Detail (POL-03, 37 IN-02)
- **D-09:** Dirty = the ticked set differs from `device.transformers` (compared as sets). Dirty shows an
  "Unsaved changes" note next to the card title and enables Save Transformers; Save is disabled when nothing changed.
- **D-10:** `beforeRouteLeave` on Device Detail warns on every route leave while dirty (Manage Transformers, sidebar,
  Back), reusing TransformerEditor's confirm "You have unsaved changes. Leave anyway?".
- **D-11:** While saving: the button reads "Saving…" with a spinner, it and the checkboxes are disabled; success shows
  "Transformers saved." and clears dirty; failure keeps the ticks and shows the error.
- **D-12:** No `beforeunload` prompt (route leaves only).

### Icons, naming, IN-03, environment delete
- **D-13:** Transformers row actions use `IconButton`: Edit = `fa fa-wrench` with an explicit white glyph rule
  (asserted in a test, TRANS-03 "white wrench"), Delete = `fa fa-trash` danger; label = aria-label = tooltip, text
  from lg up. "Add Transformer" gets `fa fa-plus`.
- **D-14:** "Alias" becomes "Name" in all visible text on Transformers, TransformerEditor and Device Detail: labels,
  column header, duplicate/required errors and the store's validation message. The stored data key stays `alias`.
- **D-15:** Phase 37 IN-03 is fixed now in `cypress/integration/device-detail.spec.js`: comment the colour's source
  (`$orange`, `_variables.scss:47`) and assert "Transformers saved." after the save, adapted to the new Saving… state.
  It runs once Phase 48 CI-07 makes the suite green.
- **D-16:** Environment Globals bulk delete gets a plain confirm naming the variables, plus pending state and the
  Phase 45 single-shot guard (no typed word: variables are not attached to devices).

### Claude's Discretion
- Whether ENV row actions come from a `List.vue` slot or a page-local table.
- Exact copy of the edit note, errors and dialog text, following the Phase 44/45 copy rules (verb + noun buttons,
  no muted grey text).

</decisions>

<canonical_refs>
## Canonical References

- `.planning/workstreams/vue-console/ROADMAP.md` — Phase 46 goal and success criteria 1–5.
- `.planning/workstreams/vue-console/REQUIREMENTS.md` — TRANS-03 (:45), TRANS-04 (:46), ENV-01 (:50), FIX-03 (:60),
  POL-03 (:67).
- `.planning/milestones/v1.16-phases/37-transformer-parity/37-REVIEW.md` — IN-02 (:108), IN-03 (:118).
- `.planning/workstreams/vue-console/phases/44-device-list-parity/44-UI-SPEC.md` — IconButton, colours, copy rules.
- `.planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-UI-SPEC.md` — confirm/pending/bulk
  toolbar patterns (UI-K10/K11), single-shot guards.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/IconButton/IconButton.vue` (Phase 44); usages `Devices.vue:121-136`, `Rsakeys.vue:33-36`.
- `Rsakeys.vue` guards: `confirming` / `deletingIds` / `bulkDeleting` (:81), `isDeleting` (:157), single delete
  (:166-187), bulk `deleteSelected` (:189-225), bulk toolbar (:16-18). Test model: `tests/unit/deploy-key-actions.cjs`.
- `TransformerEditor.vue` `beforeRouteLeave` confirm (:63-73), unsaved alert (:12), Saving… label (:25-26).
- Font Awesome 4.7: `fa-wrench`, `fa-plus`, `fa-trash`. No typed-confirm dialog exists yet (new `b-modal`).

### Established Patterns
- `Transformers.vue`: Add (:11), table with Alias/Actions (:19-38), text Edit/Delete (:30-31), create modal
  `label="Alias"` (:41-46), delete via `msgBoxConfirm` (:96-104), duplicate error (:79).
- `store/transformers.js`: `fetchItems` GET `/profile` → `info.transformers`; `saveTransformers` POST `/profile`
  `{info:{transformers}}` (:37-43); `deleteItem` rewrites the array (:75-81); "Transformer alias is required." (:58).
- `DeviceDetail.vue`: checkbox group `editForm.transformers` (:108-121), Save (:119), Manage Transformers router link
  (:121), `saveTransformers()` (:439-450), no leave guard.
- `Enviros.vue`: generic `List` (:24-29), Add (:11), bulk Delete without confirm (:12-17), Add modal Key/Value
  (:32-39). `store/enviros.js`: GET `/env` (names only), PUT `/env {key,value}`, DELETE `/env {names}`.

### Integration Points
- API `lib/router.env.js` (`/api/v2/env` PUT/DELETE/GET :73-81; Legacy `/api/user/env/*` :90-98),
  `lib/thinx/apienv.js` `create` (:20-41, `indexOf(key)` prefix skip), `list` (:128-143, names only).
- `test:unit` chain in `vue/package.json:17`; `tests/unit/milestone-v116.cjs` covers the transformers store.

</code_context>

<specifics>
## Specific Ideas

- Deviation record: ENV-01 "delete + recreate" superseded by atomic overwrite (D-01); roadmap "no parent API change"
  superseded by the D-02 prefix fix.

</specifics>

<deferred>
## Deferred Ideas

- Pending todos matched by keyword only (API key residual exposure, notification delivery gaps, MQTT device writes):
  API-area items unrelated to this Vue phase, not folded.
- Showing environment values (would need an API read path and a secrets decision).

</deferred>
