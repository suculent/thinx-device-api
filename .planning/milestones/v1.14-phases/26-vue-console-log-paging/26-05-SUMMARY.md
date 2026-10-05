---
phase: 26-vue-console-log-paging
plan: 05
subsystem: ui
status: complete
tags: [vue, console, ui, paging, vuex, a11y, node-test]

requires:
  - phase: 26-vue-console-log-paging
    provides: "plan 26-02 response contract: {success, response, paging:{limit, has_more, next_cursor}} on GET /api/v2/logs/{audit|build}?limit&cursor; flat build items are {date, udid} (Buildlog.toBuildListItem)"
provides:
  - "services/console/vue/src/store/logPaging.js: PAGE_SIZE (100), normPaging, pagedPath (URL-encodes the opaque cursor)"
  - "Api.parseResult keeps `paging` next to `response`; legacy {success, response} unchanged (D-19)"
  - "auditlog / buildlog stores: first page ?limit=100 with paging state (getPaging, savePaging); fetchAuditPage / fetchBuildPage resolve {ok, items, paging} or {ok:false}, never mutate state, never throw"
  - "History.vue: per-table paging footer (Load more, filter hint, no-match line, load error with retry, live region, aria-busy, focus handling) with the data-cy hooks plan 26-09 drives"
  - "tests/unit/log-paging-store.cjs: 18 plain-node checks through History -> store -> parseResult -> fake network, wired into npm run test:unit"
affects: [26-07 push 2 (submodule pointer bump and deploy), 26-09 Cypress harness repair and History/dashboard browser specs]

actuals:
  tokens: 11775
  tasks: 3
  commits: 6
commits_repo: "services/console (submodule, thinx-staging, unpushed); the parent repo has no code commits for this plan"
plan_head_before: c58dd091d6ce54b1c0cd94954e1902446230b3e8
plan_head_after: 1cc68972abdd90470dbddb143a69f4b96c98205c
parent_plan_head_before: 88fbe56938b6e623c77066aeed058367da1d0fb6

tech-stack:
  added: []
  patterns:
    - "Page-owning view: History copies the store's first page once and appends only the pages it requested itself; a background first-page refresh (Header, Notifications, DeviceDetail, dashboard) cannot reset or splice its tables"
    - "Store page actions return {ok, items, paging} | {ok:false} and never touch state, so the caller decides where rows go"
    - "Plain-node SFC harness: real Vue runtime + vuex + vue-template-compiler, ESM rewrite with named exports, real Api client with only request() faked, vnode walk over children and componentOptions.children, unhandled rejections recorded per test"

key-files:
  created:
    - services/console/vue/src/store/logPaging.js
    - services/console/vue/tests/unit/log-paging-store.cjs
  modified:
    - services/console/vue/src/core/api.js
    - services/console/vue/src/store/auditlog.js
    - services/console/vue/src/store/buildlog.js
    - services/console/vue/src/pages/History/History.vue
    - services/console/vue/package.json

key-decisions:
  - "Load more is a plain <button class=\"btn btn-outline-secondary btn-sm\">, not <b-button>: BButton's mergeData overwrites a caller's aria-disabled with null on real buttons, so the UI-SPEC's aria-disabled-not-disabled rule cannot be met with it"
  - "normalizeBuildItems falls back to item.udid and item.date, so flat {date, udid} build items keep their device and time (History date column, DeviceDetail per-device filter)"
  - "History.loadData uses Promise.allSettled + .finally: each table takes its first page independently, a rejected request leaves that table empty with no Load more, and Loading... always clears"
  - "History owns its rows and cursors (copy once, append own pages) rather than a store generation guard, which would still let a background refresh reset a paged table"
  - "The no-match line uses the body colour, not text-muted (UI-SPEC contrast rule); the two existing empty-state lines keep text-muted"
  - "Live-region copy uses 'entry' when a count is 1 (e.g. 'Loaded 1 more entry.'), matching the hint's singular rule"
  - "DeviceDetail (D-19): per-device build history now derives from the owner's newest 100 builds (time-sorted, both document shapes) instead of all flat builds of the last 30 days; no per-device Load more in this phase"

patterns-established:
  - "Paged log consumer contract: fetchX() = first page into the store (unchanged return of state.items); fetchXPage({cursor}) = side-effect-free next page"

requirements-completed: [LOG-03, LOG-04]

coverage:
  - id: D1
    description: "Api.parseResult keeps paging; legacy shape returns exactly {success, response}"
    requirement: LOG-03
    verification:
      - kind: unit
        ref: "services/console/vue/tests/unit/log-paging-store.cjs#parseResult keeps paging"
        status: pass
      - kind: unit
        ref: "services/console/vue/tests/unit/log-paging-store.cjs#parseResult legacy shape unchanged"
        status: pass
    human_judgment: false
  - id: D2
    description: "auditlog/buildlog first page ?limit=100 with paging; fetchAuditPage/fetchBuildPage URL-encode the cursor, normalize builds (nested and flat), never mutate state, report failure as {ok:false}"
    requirement: LOG-04
    verification:
      - kind: unit
        ref: "log-paging-store.cjs#auditlog first page requests /logs/audit?limit=100"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#auditlog fetchAuditPage does not mutate store items"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#auditlog fetchAuditPage reports failure"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#buildlog first page requests /logs/build?limit=100"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#buildlog pages are normalized"
        status: pass
    human_judgment: false
  - id: D3
    description: "History Load more per table: appends the next 100 with that table's cursor, disappears on the last page, tables page independently, background first-page refresh leaves paged tables alone"
    requirement: LOG-03
    verification:
      - kind: unit
        ref: "log-paging-store.cjs#History audit Load more appends the next page"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#History audit Load more hidden when has_more is false"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#History build Load more appends the next page"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#History tables page independently"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#History ignores a background first-page refresh"
        status: pass
    human_judgment: false
  - id: D4
    description: "UI-SPEC states: filter hint (singular/plural, toLocaleString, no requests on filter change), no-match line keeps Load more, empty states, load error with retry and colour rules, initial-load rejection clears Loading..., busy state (aria-disabled, aria-busy, one request), live region copy"
    requirement: LOG-03
    verification:
      - kind: unit
        ref: "log-paging-store.cjs#History filter hint singular and plural"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#History no-match line keeps Load more"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#History load error keeps rows and allows retry"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#History initial load clears loading on rejection"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#History busy state blocks a second request"
        status: pass
      - kind: unit
        ref: "log-paging-store.cjs#History live region announces appended entries"
        status: pass
    human_judgment: false
  - id: D5
    description: "Focus moves to the paging wrapper when the focused button disappears; 1,000+ row responsiveness; 360px footer wrap; dashboard cards still at most 10 rows with the paged stubs"
    requirement: LOG-03
    human_judgment: true
    rationale: "Needs a real DOM and browser (no document in plain node; backstop truths). Plan 26-09 runs the Cypress history and dashboard specs against this code."

duration: 10min
completed: 2026-10-01
---

# Phase 26 Plan 05: Vue History log paging Summary

**History pages the audit log and build history 100 at a time, with a separate Load more per table. Behind it: a `paging`-preserving `parseResult`, first-page stores for every other consumer, and side-effect-free page actions. All of it is proven through the real SFC, Vuex stores and API client in plain node (18 checks).**

## Performance

- **Duration:** about 10 min
- **Started:** 2026-10-01T15:16:40Z
- **Completed:** 2026-10-01T15:26Z
- **Tasks:** 3 (tracer + 2 expansion)
- **Files modified:** 7 (2 created, 5 modified), all in the `services/console` submodule

## Accomplishments

- `parseResult` now keeps `paging` (D-19). Without a `paging` key the result is still exactly `{success, response}`, so every other endpoint is unaffected.
- `auditlog` / `buildlog` request `?limit=100` and keep `paging` in state. `fetchAuditlog` / `fetchBuildLog` still return `state.items`, so the dashboard, Header, Notifications and DeviceDetail get the newest 100 with no call-site change (D-02, D-04).
- History has one paging footer per table, rendered outside the empty/table branches. Load more appends with that table's own cursor and disappears on the last page (D-01, D-03). The footer also carries the filter hint (D-05), the no-match line, the load error with retry, the live region, aria-busy and focus handling, all per 26-UI-SPEC.
- History keeps its own rows and cursors, so a first-page refresh from elsewhere never shrinks, resets or duplicates a table the user has paged.
- Fixed an existing bug in passing: a rejected first-page request used to leave "Loading..." on screen. It now always clears.

## Task Commits

All commits are in the `services/console` submodule on `thinx-staging`, GPG-signed (`%G?` = `G`), and not pushed. Each task ran RED then GREEN:

1. **Task 1 (tracer): audit Load more end to end**
   - RED `fd16b2a` test(vue): add failing History audit paging unit test (phase 26)
   - GREEN `7200f1b` feat(vue): add History audit Load more with paged API (phase 26)
2. **Task 2: build table, first-page contract**
   - RED `9a362ac` test(vue): add failing build paging and table independence checks (phase 26)
   - GREEN `fb5a307` feat(vue): add History build Load more and first-page stores (phase 26)
3. **Task 3: UI-SPEC states and a11y**
   - RED `04e712f` test(vue): add failing History paging state and a11y checks (phase 26)
   - GREEN `1cc6897` feat(vue): add History paging states and a11y (phase 26)

The parent repo has no code commits for this plan. Plan 26-07 owns the gitlink bump and both pushes.

## Files Created/Modified

- `services/console/vue/src/store/logPaging.js` (new): `PAGE_SIZE`, `normPaging`, `pagedPath`.
- `services/console/vue/src/core/api.js`: `parseResult` keeps `paging`.
- `services/console/vue/src/store/auditlog.js`: paging state, `getPaging`, `savePaging`, first page `?limit=100`, `fetchAuditPage`.
- `services/console/vue/src/store/buildlog.js`: the same for builds (`fetchBuildPage`), plus the flat-item udid/date fallback in `normalizeBuildItems`.
- `services/console/vue/src/pages/History/History.vue`: paging footers, hint, no-match line, error, live regions, aria-busy, focus, `loadData` with `allSettled` + `finally`, and scoped `.log-paging` styles.
- `services/console/vue/tests/unit/log-paging-store.cjs` (new): 18 checks.
- `services/console/vue/package.json`: `test:unit` now also runs `log-paging-store.cjs`.

## Verification

- `npm --prefix services/console/vue run -s test:unit`: all green (env-json, footer-hostnames, and the 18 log-paging checks). The plan's three gates printed `VUE-AUDIT-TRACER-GREEN`, `VUE-BUILD-PAGING-GREEN` and `VUE-STATES-GREEN`.
- Tracer feedback gate: interactive run, `end-of-phase`, automated-only `<verify>`. Re-ran green before expansion, so no checkpoint was needed.
- `git -C services/console diff origin/thinx-staging --stat -- vue/src/App.vue vue/src/store/auth.js` is empty.
- The acceptance grep for the four copy strings in History.vue returns 6 (at least 4 required).
- `eslint --no-fix` passed on every changed file.
- Local production build: `vue-cli-service build --dest /tmp/vue-build-26-05` succeeded. The bundle contains the new strings, and the compiled footer has no whitespace text nodes, so `.log-paging:empty` collapses an idle footer as the UI-SPEC intends.
- Not run, by design: Cypress (plan 26-09) and anything against the live API.

## DeviceDetail note (D-19)

DeviceDetail's per-device build history (`getBuildItems().filter(b => b.udid === udid)`) now comes from the owner's **newest 100 builds**, time-sorted and including both document shapes. Before, it came from all flat builds of the last 30 days. There is no per-device Load more in this phase. Research measured the largest owner at 113 builds, 12 of them flat, so nothing is lost in practice today. With the `normalizeBuildItems` fallback, flat builds now actually match a device's udid. Before, they normalized to an empty udid.

## Decisions Made

See `key-decisions` in the frontmatter. In short: History owns its pages; a plain `<button>` replaces `<b-button>` so `aria-disabled` can be set; flat build items keep udid and date; `allSettled` + `finally` on the initial load; body colour for the no-match line.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `<b-button>` cannot carry `aria-disabled`**
- **Found during:** Task 1 (design check of the Task 3 requirement)
- **Issue:** bootstrap-vue 2.21.2 `BButton` merges its own computed attrs after the caller's, and sets `'aria-disabled': null` on a real `<button>`. The UI-SPEC rule "aria-disabled, never the native disabled" therefore cannot be met.
- **Fix:** Load more is a plain `<button type="button" class="btn btn-outline-secondary btn-sm">`. It gets the same theme classes and the same `data-cy` / `aria-label`. The spinner is still `<b-spinner small>`.
- **Files modified:** History.vue
- **Commits:** 7200f1b, fb5a307, 1cc6897

**2. [Rule 1 - Bug] Flat build items normalized to an empty udid and date**
- **Found during:** Task 2
- **Issue:** The server's flat list item is `{date, udid}`, and `normalizeBuildItems` read neither field. Flat builds showed no date in History and never matched a device in DeviceDetail.
- **Fix:** Additive fallbacks `item.udid` and `item.date`. Nested docs are unchanged.
- **Files modified:** store/buildlog.js
- **Commit:** fb5a307

**3. [Rule 2 - Correctness] Initial load: one failed table no longer blanks the other**
- **Found during:** Task 3
- **Issue:** `Promise.all` plus `.finally` would clear "Loading..." but drop both tables when only one request rejects.
- **Fix:** `Promise.allSettled`, copying each table that succeeded, then `.finally(() => loading = false)`. `stats.js` already uses `allSettled`.
- **Commit:** 1cc6897

**4. Commit messages and count**
- commitlint (`subject-case`) rejects a subject that starts with "History". The plan's messages are kept, prefixed with "add".
- Each tdd task produced a RED `test(vue)` commit and a GREEN `feat(vue)` commit, so there are 6 commits instead of the planned 3.

**5. Extra unit checks**
- Two labels beyond the plan list: `History busy state blocks a second request` and `History live region announces appended entries`.
- The harness records unhandled promise rejections, so the initial-load test fails cleanly instead of crashing node.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 correctness) plus process notes. **Impact:** no scope creep; every fix serves a UI-SPEC or D-19 truth.

## TDD Gate Compliance

- Every task ran RED before GREEN in the submodule: `fd16b2a` before `7200f1b`, `9a362ac` before `fb5a307`, `04e712f` before `1cc6897`.
- Commit scope is `vue`, as the plan specifies, not `26-05`. The executor's `^test(26-05):` grep therefore finds nothing, even though both gates are present.
- RED evidence (recorded by hand, because `check tdd-red-evidence` parses TAP or Surefire output and this harness prints `ok   ` / `FAIL ` lines). Command: `node tests/unit/log-paging-store.cjs`, exit 1 each time.
  - Task 1:
    - `FAIL parseResult keeps paging`: actual `{"success":true,"response":[1]}`, expected `paging` present.
    - `FAIL auditlog first page requests /logs/audit?limit=100`: actual call `/logs/audit`.
    - `parseResult legacy shape unchanged` passed, as expected for a regression guard.
  - Task 2:
    - `FAIL buildlog first page requests /logs/build?limit=100`: actual call `/logs/build`.
    - `FAIL History ignores a background first-page refresh`: `buildPaging` absent.
  - Task 3:
    - `FAIL History initial load clears loading on rejection`: `loading:true`, one unhandled rejection, which reproduces the existing bug.
    - The hint, no-match, error, busy and live-region checks also failed on their assertions.
  - None of the failures came from a load or syntax error.

## Issues Encountered

- The permission classifier denied the compound command `rm -rf /tmp/vue-build-26-05; … git commit …`. The commit was re-run on its own. The local build output is still at `/tmp/vue-build-26-05`, outside the repo; it is safe to delete.

## Known Stubs

None. The only "placeholder" matches are the existing search inputs' `placeholder` attributes.

## Threat Flags

None. No new endpoint or trust boundary. T-26-24 is mitigated: the client never parses a cursor, it only URL-encodes it (`pagedPath`, tested with `c/+=` and `b/1`). T-26-25 is mitigated: History owns its arrays and cursors (`History ignores a background first-page refresh`).

## Next Phase Readiness

- Plan 26-09 can drive the hooks `audit|build-paging`, `-load-more`, `-filter-hint`, `-load-more-error` and `-paging-status`. The existing HIST-01..05 selectors and classes are unchanged. The only text change on an existing path: when filters exclude every loaded entry, the line is now "No loaded entries match these filters." instead of "No audit events." / "No build logs.". history.spec.js does not assert those strings.
- Plan 26-07 bumps the parent gitlink to `1cc6897` (or later) and pushes in Push 2.

## Self-Check: PASSED

- FOUND: services/console/vue/src/store/logPaging.js, vue/tests/unit/log-paging-store.cjs, vue/src/store/auditlog.js, vue/src/store/buildlog.js, vue/src/core/api.js, vue/src/pages/History/History.vue
- FOUND commits (submodule): fd16b2a, 7200f1b, 9a362ac, fb5a307, 04e712f, 1cc6897. All signed `G`, and `git -C services/console status --short` is empty.
