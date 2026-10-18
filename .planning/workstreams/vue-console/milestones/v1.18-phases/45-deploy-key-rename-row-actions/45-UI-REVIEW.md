# Phase 45 — UI Review

**Audited:** 2026-10-13
**Baseline:** 45-UI-SPEC.md (approved 2026-10-13; UI-K01..UI-K15)
**Screenshots:** not captured (code-only audit by instruction: no production login, no local dev server). I fetched the unauthenticated live bundle `https://console.thinx.cloud/js/app.js` (3.18 MB) and grepped it. It contains the Phase 45 strings: `Rename deploy key`, `Keep current name`, `Delete selected`, `Deploy key renamed`, `Could not load deploy keys. Refresh to retry.`, the `bidi` sentence and `key-create-form`. So the audited source is the version that is deployed.
**Interaction captures:** off (workflow.ui_interaction_capture not set). All interaction findings below come from the code.

Surface: `services/console/vue/src/pages/Rsakeys/Rsakeys.vue`, `styles/_deploy-keys.scss` (imported in `theme.scss:26`), `utils/keyNames.js`, `components/IconButton/IconButton.vue`, `store/rsakeys.js` (`renameItem`, `deleteItems`), `styles/_platforms.scss` (`.icon-button`, `.actions-cell`).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Every contract string matches exactly, and none of the forbidden strings appear. The unchanged result modal still says `Copy to clipboard` and `Deploy Key — {name}`, which disagrees with the new `Copy key` / "deploy key" wording |
| 2. Visuals | 3/4 | Columns, the sr-only header and caption, per-group tbody, ellipsised name and the four-button row match UI-K01..K06. Every reload swaps the table for `Loading…` and removes the toolbar, so the page jumps after each rename or delete |
| 3. Color | 3/4 | Green is used only for the CTA and Save name, red only for the three Delete controls, and nothing is blue. `#FF8A8A` feedback and body-colour help match the spec. The result modal's `outline-secondary` button (under 2:1 per Phase 44) is still on the page |
| 4. Typography | 3/4 | No new sizes. Monospace is 12.25px/400. `.key-name-help` does not set a weight, so it renders at the body 300 instead of the declared Label weight of 400 |
| 5. Spacing | 3/4 | The 8/16/4 tokens are applied as declared. The create feedback line sits 20px below its field (form `margin-bottom:16px` + its own 4px) instead of the declared 4px, and it has 0px below it, so it touches the next block |
| 6. Experience Design | 3/4 | Confirm guards, `deletingIds`, the rename lock, load-failure isolation and pruning are all present. After a server `invalid_key_name`, `Save name` stays enabled, so the same rejected name can be PATCHed again. Delete success fetches the list twice |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **WARNING: the create-form feedback line is detached from its field** (`Rsakeys.vue:10`, `_deploy-keys.scss:48-54,71-76`). The spec declares a 4px gap between a name field and its feedback line (Spacing xs). Because `margin-bottom:16px` sits on `.key-create-form` and the `<p>` follows the form, the sentence renders 20px below the input. Its `margin: 4px 0 0` also zeroes the paragraph's bottom margin, so it sits directly on the alert or intro paragraph and reads as part of that text. Fix: move the 16px to whatever follows (for example, wrap the form and the feedback in a `div` with `margin-bottom:16px` and set the form margin to 0), or set `.key-create-form + .key-name-feedback { margin-top: -12px; margin-bottom: 16px; }`.
2. **WARNING: a rejected rename can be resubmitted unchanged** (`Rsakeys.vue:62`, `saveRename` at `:257-260`). `Save name` is disabled on `renameClientReason` only. After the server returns `invalid_key_name`, the sentence shows but the button is live, and Enter or a click sends the same refused name again. The same applies to the Generate button with `createServerReason` (`:8`). Fix: `:disabled="renaming || !!renameReason"` (and `!!createServerReason` on Generate). The `renameName`/`keyName` watchers already clear the server reason once the user edits.
3. **WARNING: every mutation blanks the table** (`Rsakeys.vue:14,19`, `loadData`). `loading = true` replaces the table with `Loading…` and hides the toolbar on each reload after rename, delete and generate. The page height collapses and the focus target (the row's Rename button the modal returns to) is destroyed, so keyboard focus drops to `body`. The spec put the flash out of scope, but the new rename flow makes the focus loss worse. Fix: use the `Loading…` swap only when `items` is empty (first load), and on later reloads keep the table rendered, refresh it in place, and move focus to the renamed row's Rename button.

Additional:
4. **WARNING:** `.key-name-help` (`_deploy-keys.scss:83-87`) has no `font-weight`, so it renders at the body 300 while the spec's Label role (feedback and help line) is 400. `.key-name-feedback` sets 400, so the two lines under the rename field have different weights. Add `font-weight: 400`.
5. **WARNING (pre-existing, kept by spec):** `rsakey-result-modal` (`Rsakeys.vue:46-52`) keeps `variant="outline-secondary"` (Phase 44 measured that pill text under 2:1), `class="mb-2"` (7px, off grid), and the copy `Copy to clipboard` / `Deploy Key — ` in title case, next to the new `Copy key` and lower-case `Rename deploy key`. Bring it into line in Phase 48.
6. **WARNING (pre-existing, deferred to Phase 48 by spec):** both alerts use `.alert-danger` with text at 3.96:1, which is below 4.5:1.
7. **Minor:** on success, `deleteItems` in `store/rsakeys.js:80` already dispatches `fetchItems`, and then `deleteRow`/`deleteSelected` call `loadData()`, which fetches again. That is two GETs per delete.
8. **Minor:** `.key-toolbar { gap: 4px }` has a single child, so the gap does nothing. The icon/text gap comes from `.key-toolbar__text { margin-left: 4px }`. This is harmless.
9. **Minor:** the page title `Settings - Deploy Keys` uses a hyphen where the rest of the console's new copy uses an em dash (`Deploy Key — …`). This is pre-existing.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- The row labels `Show key`/`Hide key`, `Copy key`, `Rename`, `Delete`/`Deleting…` (U+2026) match the Actions table (`Rsakeys.vue:31-34`). The bulk label strings in `bulkLabel` (`:77-80`) are exact.
- The confirm bodies, `Confirm Delete`, `Keep key`/`Keep keys`, the rename modal title, field label, help text, both footer buttons and the `Deploy key renamed` toast all match. The five error sentences match the Error state row (`:137,173,203,262,297`).
- `keyNames.js` MESSAGES and the generic fallback match the D-07 sentences word for word.
- Forbidden-string check: no `Cancel`, `>Save<`, `Delete (`, `text-muted`, visible `Select`, `Failed to …` or `Deploy keys could not be loaded`. The Generate `<b-form>` has no `mr-2`/`mb-2`/`ml-2`/`mb-3`.
- Deduction: the unchanged result modal's wording (finding 5) and the hyphenated title (finding 9).

### Pillar 2: Visuals (3/4)
- UI-K01: an sr-only Select header, an sr-only caption, `colspan="5"` on the empty and detail rows, and `.table-responsive` is kept.
- UI-K02: each key is a `tbody.key-group`, `table-striped` is dropped, and the stripe rule is scoped to `> tbody.key-group:nth-of-type(odd) > tr`. The extra empty-state `<tbody>` only renders when there are no groups, so it cannot shift the parity.
- UI-K03/K04: the ellipsis is on the inner block with `dir="auto"` + `unicode-bidi: isolate`, and the 160/240px limits use `media-breakpoint-up(md)`. The fingerprint is a span (not `<code>`) with an em-dash fallback.
- The focal point holds: the only green element on the page body is Generate, and red is the trash buttons plus the right-aligned bulk button on its own row.
- Deduction: the reload flash and focus loss (fix 3).

### Pillar 3: Color (3/4)
- Variant counts in the template: `success` ×2 (Generate, Save name), `danger` ×3 controls (row Delete, bulk, confirm OK) plus the alerts, `default` ×4 (Show, Copy, Rename, Keep current name). There is no `primary`, which matches the "accent: nothing" rule.
- `#FF8A8A` is used on `.key-name-feedback` only. `.key-name-help` and `.key-fingerprint` use `color: inherit` (body colour). The key text uses `$pre-bg`/`$pre-color`.
- Deductions: `outline-secondary` remains in the result modal, and the alert-danger contrast is deferred (findings 5 and 6).

### Pillar 4: Typography (3/4)
- The 14px/300 body, `.875rem`/400 monospace on the fingerprint and key text, and `.875rem`/400 on the feedback line all match. IconButton and the bulk button take the sm size. No new heading styles are added.
- Deduction: `.key-name-help` at weight 300 instead of 400 (finding 4).

### Pillar 5: Spacing (3/4)
- `.key-create-form` has gap 8 and margin-bottom 16, and the label, input and button have no margin utilities (UI-K15 met). `.key-toolbar` has margin-bottom 8. `.key-text` has padding 8. The row button gap comes from `.icon-button:not(:last-child)` (4px). There are no Bootstrap 5 `gap-N` classes.
- Deduction: the feedback line's 20px top and 0px bottom spacing (fix 1). Pre-existing `mb-2` in the result modal.

### Pillar 6: Experience Design (3/4)
- Delete: a `confirming` flag stops a double click from opening two dialogs. `deletingIds` disables all four buttons and the checkbox of a row in flight. A failed delete re-enables the row and sets the right message. Bulk delete skips ids already in flight and keeps the selection on failure.
- Rename: the modal opens prefilled, focused and selected (`onRenameShown`). An unchanged name closes it without a request. While a request is in flight, `@hide` is prevented and the field and both buttons are disabled. An `invalid_key_name` answer refocuses the field, and a failure keeps the modal open.
- Load: a failure clears items, selection and shown keys, sets only `loadFailed` and hides the table and toolbar. A success prunes `selectedIds`/`shownIds` (UI-K12/K13).
- Show/Copy are disabled when there is no pubkey. The copy fallback throws on an `execCommand` failure, so the error copy can actually appear.
- Deductions: a server-rejected name can be resubmitted (fix 2), the reload flash drops focus (fix 3), and each delete triggers a double fetch (finding 7).

Registry audit: not applicable (no `components.json`, no shadcn, spec Registry Safety = none).

---

## Files Audited
- `services/console/vue/src/pages/Rsakeys/Rsakeys.vue`
- `services/console/vue/src/styles/_deploy-keys.scss`
- `services/console/vue/src/styles/theme.scss` (import order)
- `services/console/vue/src/styles/_platforms.scss` (`.icon-button`, `.actions-cell`)
- `services/console/vue/src/utils/keyNames.js`
- `services/console/vue/src/components/IconButton/IconButton.vue`
- `services/console/vue/src/store/rsakeys.js`
- Live bundle `https://console.thinx.cloud/js/app.js` (unauthenticated GET, string grep only)
- `.planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-UI-SPEC.md`
