# Phase 44 — UI Review

**Audited:** 2026-10-13
**Baseline:** 44-UI-SPEC.md (approved 2026-10-13; UI-D01..UI-D22)
**Screenshots:** not captured (code-only audit by instruction: no production login, no credentials, no local dev server). An unauthenticated fetch of `https://console.thinx.cloud/` did not return a CSS bundle that could be grepped, so the live CSS was not checked here. The live-bundle proof is the one in 44-03-SUMMARY.
**Interaction captures:** off (workflow.ui_interaction_capture not set). All interaction findings below come from the code.

Surface: `services/console/vue/src/pages/Devices/Devices.vue` (table and grid), `components/PlatformBullet`, `components/IconButton`, `components/List/List.vue`, `pages/Repositories/Repositories.vue`, `styles/_platforms.scss`, `fonts/icomoon/_icomoon.scss`, `utils/platforms.js`.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Every contract string is exact (`Building…`, `No build yet`, D-14 tip, both empty-state lines, `unknown`). The single-verb `Build`/`Edit`/`Revoke` labels were accepted at the checker stage. Pre-existing glyph-only view toggles have no accessible name |
| 2. Visuals | 3/4 | Tile, bullet and IconButton markup match UI-D03..D12 exactly. The warning glyphs are not focusable (accepted note), and the grid `Edit` uses `ml-auto` through `inheritAttrs:false` (it works, because class is not part of `$attrs`) |
| 3. Color | 3/4 | Palette, inset outline, warning colours and pill variants all match the contract, and nothing new is blue. The grid "last seen" line still uses `text-muted small`, which the spec measured at 3.14:1 |
| 4. Typography | 4/4 | The bullet is 12.25px/400/line-height 1 with no `.badge`. Labels come from the sm button. No new sizes or weights |
| 5. Spacing | 3/4 | 4/8/32/48 px tokens are applied exactly. The toolbar's `gap-2` is a Bootstrap 5 class that does nothing on BS 4.6, and the pills keep `mr-1` (3.5px, off the 4-pt grid) |
| 6. Experience Design | 3/4 | The build in-flight guard, the disabled states with tips, the filter fallback and the cause-specific empty copy are all present. Selection is not pruned by the new platform filter, so bulk actions can hit hidden devices. A failed load can leave `Loading...` up forever |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **WARNING: bulk actions act on devices the platform filter hides** (`Devices.vue` `toggleDevice`/`checkAll`, the `selectedUdids` state). Select devices, switch the platform pill, and `Revoke (N)` still counts and revokes the hidden ones. `checkAll` replaces the selection with only the filtered devices, which makes this inconsistent. Phase 44 makes the trap easier to hit because platform pills are now the main filter. Fix: either prune `selectedUdids` to `filteredItems` in a watcher on `activePlatform`/`searchText`, or list the hidden count in the confirm body (`Revoke N device(s), M not shown by the current filter?`).
2. **WARNING: a rejected load leaves the page on `Loading...` with no message** (`Devices.vue` `loadData`, near the end of the methods). `Promise.all(...).then(...)` has no `catch`/`finally`, so if `fetchItems` or `fetchEnviros` ever rejects, `loading` stays `true`. The spec marks list-load errors as unresolved and out of scope, but the failure mode is worse than the "previous list" the spec describes. Fix: `.catch(() => { this.error = 'Could not load devices.'; }).finally(() => { this.loading = false; })`.
3. **WARNING: the grid "last seen" line fails text contrast** (`Devices.vue` grid card, `<p class="mb-2 text-muted small">`). The spec itself measures `text-muted` at 3.14:1 on `#333867`, and at `small` size (12.25px/300) that is below 4.5:1. It also contradicts the spec's rule of moving empty-state text off `text-muted`. Fix: drop `text-muted` (body colour) or use a colour of 4.5:1 or more.

Additional:
4. **WARNING:** the toolbar `class="... gap-2"` is a Bootstrap 5 utility that does not exist in Bootstrap 4.6 / the theme SCSS (no match in `src/styles`). It is a dead class. The real spacing comes from `mr-1` (3.5px) on the toggles and pills, which is off the declared 4-pt scale. Fix: remove `gap-2`, and use `.mr-1` → a 4px rule if strict grid conformance is wanted.
5. **WARNING (pre-existing, out of scope):** the list/grid view toggles are glyph-only (`&#9776;`, `&#9635;`) with no `aria-label`/`title`, so screen readers get a symbol name. Now that every row action has an aria-label, these stand out. Add `aria-label="List view"` / `"Grid view"` and `aria-pressed`.
6. **WARNING (accepted in spec):** the API-key and `#e`/`#w` markers are `role="img"` with `title` and are not focusable, so keyboard-only sighted users cannot read the D-14 tip. Revisit in Phase 48 as the spec says.
7. **Minor:** platform sort compares base keys (`platformio` < `sigfox` < `unknown`), not display labels, while the pills sort by label. The visible order differs slightly (for example `MongooseOS` vs `Micropython`), but it matches UI-D20 literally.
8. **Minor:** the table checkbox ids use the row index (`'checkbox-' + index`) while the grid uses the udid. A re-sort reuses ids across different devices. This is harmless, because the labels are re-bound, but it is inconsistent.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- Every row action string matches the Actions table: `Building…` uses U+2026 (`buildAction`), plus `Not supported`, `No source`, `Build`, `View log`/`No build yet`, `Edit` and `Revoke`.
- The D-14 text is a single constant `API_KEY_TIP`, bound to both `aria-label` and `title`. `Device reported an error` / `a warning` are exact.
- The empty state switches on cause (`emptyMessage`): `No devices registered yet.` / `No devices match the current filter.`.
- Forbidden strings: no `Platform:`, `categoryColor`, `CATEGORY_COLORS`, `category-pill` or category colour names in `Devices.vue`. `unknown_platform` cannot render, because the bullet shows `PLATFORMS[key].label` only.
- `Build`/`Edit`/`Revoke` are bare verbs. The checker FLAG accepted them, and the row gives context. The glyph-only view toggles (finding 5) are the only unlabeled controls on the page.

### Pillar 2: Visuals (3/4)
- `PlatformBullet` renders exactly `<span class="platform-bullet platform-{key}">{label}</span>`, with no title or icon (UI-D03). Repositories uses it through the new `cell(platform)` scoped slot. The `List.vue` fallback keeps the old `{{ item[header.prop] }}` output (UI-D21).
- The device tile and symbol match UI-D09..D12: 48/40px in the grid, 32/24px `--sm` in the table, `require.context` limited to `b_medium_\d\d.png`, `01` fallback.
- `IconButton` puts `title` on the wrapper span so disabled buttons still show their tip. Its `aria-label` equals `label`, and the text span is `d-none d-lg-inline`. Focal hierarchy holds: neutral `default` actions, and only Revoke is red.
- Non-focusable status markers (finding 6) limit the tip to mouse users.

### Pillar 3: Color (3/4)
- `$platform-colors` matches the palette table exactly (9 rows, text colours as specified). `.platform-bullet, .device-icon` carry the 1px inset `rgba(255,255,255,.24)` (UI-D05).
- `.api-key-indicator #FFA500`, `.status-alert #FF6B6B` (lightened as UI-D13 requires) and `.status-warning #F0AD4E` are all present. Pills use `light`/`outline-light` instead of the old `outline-secondary`. No new `primary` usage: the accent stays on the active view toggle only.
- Deduction: the grid `text-muted small` last-seen line (fix 3) is below 4.5:1 by the spec's own measurement. The view toggles still use `outline-secondary` (pre-existing), and the spec measured that pill text under 2:1.

### Pillar 4: Typography (4/4)
- New text sits in the declared pair: body 14px/300, labels `.875rem`/400. `.platform-bullet` uses `font-size: .875rem; font-weight: 400; line-height: 1` and avoids the theme `.badge` (600).
- Glyphs are `font-size: 1rem` inside `.icon-button .btn > i`. The icomoon base rules (`line-height: 1`, normal weight/style) are ported verbatim. No `fa-fw`.
- The alias in the grid header is `<strong>` (inherited emphasis), as UI-D12 specifies.

### Pillar 5: Spacing (3/4)
- Declared tokens are applied exactly: `.icon-button:not(:last-child) { margin-right: 4px }`, `.icon-button__text { margin-left: 4px }`, 32px min button size, `.device-status > * + * { margin-left: 8px }`, cogs `margin-right: 8px`, `.device-card-heading > .device-icon { margin-right: 8px }`, bullet padding `4px 8px`.
- `.actions-cell { white-space: nowrap; width: 1% }` and `.table-responsive` wrap the table (UI-D16). `.firmware-cell` is ellipsised at 240px with a `title`.
- Deductions: the dead `gap-2` class, and `mr-1` (3.5px) between the filter pills, which are new in this phase, so the spec's "inherited exception" covers the toggles but not obviously the new pills. Inline `style="width:140px"` / `200px` on sort and search are pre-existing.

### Pillar 6: Experience Design (3/4)
- Build in-flight guard: `buildingUdids` is added before the await and removed in `finally`, and `buildDevice` re-checks `disabled`, so a double click sends one request (UI-D17). Success and failure messages are as before.
- Disabled states carry reasons (`No source`, `Not supported`, `No build yet`), and `openLastBuild` re-guards. Row Revoke keeps its confirmation.
- `activePlatform` falls back to `All` when a reload removes the selected platform. Pills are derived from the loaded items.
- Deductions: filter-hidden selections stay in bulk actions (fix 1), and `loadData` has no rejection path (fix 2). The table's "select all" checkbox selects only filtered rows while existing hidden selections are dropped silently. This is inconsistent with the per-row toggle behaviour.

---

## Registry Safety

Not applicable: no `components.json`, no shadcn, no third-party registry. The only new assets are `icomoon.woff`/`.ttf`, copied from the Legacy console in this repository.

---

## Files Audited
- services/console/vue/src/pages/Devices/Devices.vue
- services/console/vue/src/components/PlatformBullet/PlatformBullet.vue
- services/console/vue/src/components/IconButton/IconButton.vue
- services/console/vue/src/components/List/List.vue
- services/console/vue/src/pages/Repositories/Repositories.vue
- services/console/vue/src/styles/_platforms.scss
- services/console/vue/src/styles/theme.scss (imports)
- services/console/vue/src/fonts/icomoon/_icomoon.scss
- services/console/vue/src/utils/platforms.js
- .planning/workstreams/vue-console/phases/44-device-list-parity/44-UI-SPEC.md
