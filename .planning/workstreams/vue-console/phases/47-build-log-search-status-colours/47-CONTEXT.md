# Phase 47: Build Log Search & Status Colours - Context

**Gathered:** 2026-10-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Vue console only (`services/console/vue`). Requirements BUILD-03, POL-02, FIX-02, plus the Phase 35 items routed here
(IN-06, IN-07; recorded later in the Phase 48 FIX-01 ledger).

- **BUILD-03:** search inside the full build log shown by `BuildLogDialog`. Matches are highlighted and counted, and
  `<` / `>` step between them with auto-scroll. Log text that contains HTML stays inert.
- **POL-02:** one shared status-to-variant mapping on every build list (navbar Recent Builds, dashboard Recent Builds
  card, History, device Build History). The dashboard card can open the full log. Rows without a build id show no
  "Open build log" control and never request `/logs/build/<index>`.
- **FIX-02:** Phase 36 WR-01 and IN-01..IN-03 fixed (or deferred with a recorded reason).

Out of scope: the full-log payload size (AR-36-01, deferred), any parent API change, Legacy console changes.

**Already landed (console `38eb95b`, 2026-10-12):** `buildStatusVariant()` in `src/utils/buildLog.js`
(OK→success, TIMEOUT→warning, RUNNING→info, else→danger) is already used by History, DeviceDetail, Visits and
Notifications (with a clock glyph for TIMEOUT). History and DeviceDetail already hide "View" when there is no
`build_id`. For success criterion 2, Phase 47 only has to verify this and lock it with a test, not rebuild it.

</domain>

<decisions>
## Implementation Decisions

### Search behaviour (BUILD-03)
- **D-01:** Search runs live as the user types, debounced at about 200 ms. There is no separate submit step.
- **D-02:** Matching is plain text and case-insensitive. The term is escaped, and there is no regex support and no case
  toggle.
- **D-03:** In the search field, Enter goes to the next match and Shift+Enter to the previous one. Esc keeps the
  modal's default behaviour and closes the dialog.
- **D-04:** Stepping wraps: `>` on the last match goes to the first, and `<` on the first goes to the last. Each step
  scrolls the current match into view inside the log box.

### Highlighting & big logs
- **D-05:** Highlights are rendered by splitting the log text into plain and match segments and rendering them with
  `v-for`, with match segments in `<mark>`. Every segment is Vue text interpolation (`{{ }}`), never `v-html` or
  `innerHTML`, so log HTML stays inert by construction. The CSS Custom Highlight API was considered and rejected
  (browser support, testability).
- **D-06:** At most **1000** matches are highlighted and stepped through. When there are more, the count shows
  `1000+` (for example `3 / 1000+`), so the DOM stays bounded on multi-MB logs.
- **D-07:** Search starts at **3 characters** (operator choice). With a shorter term nothing is highlighted and the
  count stays empty.
- **D-08:** The current match has its own, stronger highlight colour (as in browser find), and the other matches get
  a softer one. Both colours are SCSS tokens and must stay readable on the dark log background
  (`.build-log-text` is `#1e1e1e` / `#ddd`).

### Search bar layout
- **D-09:** A sticky bar sits between the modal header and the log `<pre>`: search field, count, then the `<` and `>`
  buttons. It stays visible while the log scrolls inside its 70vh box. The step buttons reuse Phase 44 `IconButton`
  (icon, label as aria-label and hover tip).
- **D-10:** The count shows `3 / 17` (position and total), `No matches` when nothing is found, and `3 / 1000+` when
  capped. It is announced through `aria-live="polite"`.
- **D-11:** The search bar renders only when log text is shown. It is hidden during loading, error and the
  "No log output" empty state.
- **D-12:** The search term resets on every `open()`. Retry within the same open keeps the term.

### No-id rows & dashboard (POL-02, 35 IN-06/IN-07, 36 IN-02)
- **D-13:** The dashboard Recent Builds card (`pages/Visits/Visits.vue`) gets the same eye-icon "View" link button as
  History and Device Build History (`data-cy="build-open-log"`, descriptive `aria-label`), placed before Download in
  one actions cell, plus a `<BuildLogDialog ref>`. A row without a `build_id` shows `—` instead of both buttons.
- **D-14:** A navbar dropdown (`components/Notifications/Notifications.vue`) row without a `build_id` is a plain,
  non-clickable list item: no `button` prop, no click handler, not focusable, no request. Rows with an id stay buttons.
  This fixes 35 IN-06 along the way: `<h6>` and `<p>` inside the button become `<span>`s with classes, and the
  `'UNKNOWN'` status fallback becomes `—` to match the tables.
- **D-15:** `BuildLogDialog.open()` uses only `build.build_id`. There is no fallback to `build.id`, the list index set
  by `normalizeBuildItems`. An empty id never calls `buildlog/fetchBuildDetail` or `/logs/build/<x>`. `loading` is
  reset in the `@hidden` handler (35 IN-07).

### Review items (FIX-02)
- **D-16:** Phase 36 WR-01 is fixed as the review proposes. The unit test asserts that inside the Build History card
  only the `build-open-log` buttons carry listeners (`on` / `nativeOn`) and only they are focusable or have a role, so
  it fails if a click or keydown handler is added to any cell, `<code>` or badge. The e2e spec clicks every non-button
  cell, not just the first.
- **D-17:** Phase 36 IN-03 is fixed in the Cypress spec now (`cypress/integration/device-detail.spec.js`): assert
  `@getBuildDetail.all` has length 0 after the cell clicks, then 1 after the button click. The Vue Cypress suite stays
  red until Phase 48 CI-07, so the e2e side is verified there. The unit tests are the gate in this phase.
- **D-18:** Phase 36 IN-01 is fixed: install the collecting `Vue.config.warnHandler` before `new Vue(...)` and restore
  it in a `finally`.

### Claude's Discretion
- The exact highlight colours and token names, the debounce value (around 200 ms), and the search field placeholder
  copy.
- How segments are computed (a pure helper in `utils/buildLog.js` is the natural place, and it can be unit-tested
  outside Vue).
- Whether the remaining Phase 36 UI-review nits in the touched files are taken (consistent `p-0` on the View button,
  `text-nowrap` instead of inline `white-space:nowrap`, a stronger Retry button variant), as long as they stay
  inside the touched files.
- Which test file the new unit tests go in (extend `tests/unit/milestone-v116.cjs`, or add a new
  `tests/unit/build-log-search.cjs` that follows the existing `.cjs` harness).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/workstreams/vue-console/ROADMAP.md` § Phase 47 — goal, success criteria 1–4; § Milestone Notes
  (shared building blocks, Phase 35 items routed to Phase 47, deploy path)
- `.planning/workstreams/vue-console/REQUIREMENTS.md` — BUILD-03, POL-02, FIX-02

### Review findings being closed
- `.planning/milestones/v1.16-phases/36-build-log-access/36-REVIEW.md` — WR-01, IN-01, IN-02, IN-03 (with proposed fixes)
- `.planning/milestones/v1.16-phases/36-build-log-access/36-REVIEW-DISPOSITION.md` — disposition ledger to update (all 4 `open` today)
- `.planning/milestones/v1.16-phases/36-build-log-access/36-UI-REVIEW.md` — status colour table, dashboard dead end, no-id button (Top 3 fixes)
- `.planning/milestones/v1.16-phases/35-console-usability/35-REVIEW.md` — IN-06 (list markup, RUNNING colour), IN-07 (dialog loading reset, `build.id` fallback)

### Project rules
- `AGENTS.md` — deploy flow (console `thinx-staging` → parent submodule bump → `thinx-staging`), local verification
- `.planning/workstreams/vue-console/STATE.md` — console `test:unit` is not run in CI, run it locally before each push; hard-reload before UAT

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/BuildLogDialog/BuildLogDialog.vue`: the dialog to extend (`open`, `load`, `requestId` stale guard, `<pre class="build-log-text" data-cy="full-build-log">`).
- `src/utils/buildLog.js`: `buildLogText()` (Buffer/nested record → text) and `buildStatusVariant()`, the shared status mapping. It is the natural home for a pure search/segment helper.
- `src/components/IconButton/IconButton.vue` (Phase 44): icon + label (aria-label, hover tip on the wrapper span), `inheritAttrs: false`. Use it for the `<` / `>` step buttons.
- `src/store/buildlog.js`: `normalizeBuildItems` (sets `id = String(index)` when there is no `build_id`, which is why D-15 drops the fallback) and `fetchBuildDetail`.

### Established Patterns
- Log text is rendered with interpolation only, never as HTML (comment in `utils/buildLog.js`).
- The per-row "View" button: `b-button size="sm" variant="link" data-cy="build-open-log"`, `la la-eye` icon, `v-if="build.build_id"`, and `<span class="text-muted">—</span>` otherwise (History.vue:130, DeviceDetail.vue:159).
- Unit tests are plain-node `.cjs` files in `vue/tests/unit/` (`milestone-v116.cjs` renders DeviceDetail and walks vnodes).

### Integration Points
- `src/pages/Visits/Visits.vue:75-100`: dashboard Recent Builds card (Download only today).
- `src/components/Notifications/Notifications.vue:11-30, 104-113`: navbar dropdown items (all rendered as buttons), status glyph and classes.
- `src/pages/History/History.vue` and `src/pages/Devices/DeviceDetail.vue`: already on `buildStatusVariant`; DeviceDetail Build History is the WR-01 target.
- `vue/cypress/integration/device-detail.spec.js:83-88`: WR-01 e2e and IN-03.

</code_context>

<specifics>
## Specific Ideas

- Behave like browser find (Ctrl+F): live, case-insensitive, Enter / Shift+Enter, wrap-around, `3 / 17`, a stronger colour for the current match.
- Layout as agreed:
  ```
  ┌ Build Log — 3f9a… ─────────────── × ┐
  │ [🔍 Search log…    ]  3 / 17  [<] [>] │
  │ ┌──────────────────────────────────┐ │
  │ │ ... log ... ▮match▮ ...          │ │
  │ └──────────────────────────────────┘ │
  │                              [Close] │
  └──────────────────────────────────────┘
  ```

</specifics>

<deferred>
## Deferred Ideas

- AR-36-01 full-log payload size (Buffer-JSON ~3.4x): stays deferred (STATE.md Deferred Items).
- A regex or case-sensitive search toggle: considered and not taken (D-02).

### Reviewed Todos (not folded)
- `2026-09-28-fix-worker-builder-service-polling-completion-detection`: worker area, keyword-only match.
- `2026-09-28-split-rollbar-server-and-client-tokens`: config area, keyword-only match.
- `2026-10-03-apikey-hash-credential-and-storage`: API area, keyword-only match.

</deferred>

---

*Phase: 47-build-log-search-status-colours*
*Context gathered: 2026-10-14*
