---
phase: 35-console-usability
fixed_at: 2026-10-12T11:15:00Z
review_path: .planning/phases/35-console-usability/35-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 35: Code Review Fix Report

**Fixed at:** 2026-10-12T11:15:00Z
**Source review:** .planning/phases/35-console-usability/35-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (CR-01, WR-01 to WR-07; Info findings out of scope)
- Fixed: 8
- Skipped: 0

All commits are in the `services/console` submodule on `thinx-staging` (signed, not pushed). The parent
gitlink has not been bumped. Paths below are relative to `services/console/`.

**Where it ran:** in the main checkout's `services/console` submodule, with no git worktree. A worktree
of the parent repo has neither an initialized submodule nor `node_modules`, and the orchestrator
directed commits there with `git -C services/console`. All verification numbers below come from that
tree and can be reproduced from it.

## Fixed Issues

### CR-01: The transformer editor stays saveable after a failed load, and Save blanks the transformer

**Files modified:** `vue/src/pages/Transformers/TransformerEditor.vue`, `vue/src/store/transformers.js`, `vue/tests/unit/milestone-v116.cjs`
**Commit:** 52bf1e5
**Status:** fixed: requires human verification (state handling)
**Applied fix:**
- The editor has a `loaded` flag, set only after the transformer is fetched and copied into the form.
- Save is disabled while `saving`, while not `loaded`, or while the alias is blank. `save()` also refuses those cases and shows a reason.
- `form.alias` falls back to `''`.
- `transformers/updateItem` returns `{success:false}` without writing in three cases: the alias is empty or whitespace, the body is not a string, or the `utid` is missing after the re-fetch ("Transformer not found.").
- New tests:
  - The store refuses empty, whitespace and null aliases, a missing body, and a deleted utid, with zero writes.
  - The editor refuses to save after a failed load.
  - The rendered Save button is disabled before load and with a blank alias, and enabled once loaded.
  - A save after a successful load writes once.
- Before the fix was applied, the new tests failed.

### WR-01: Clickable History rows take over Enter and Space from the buttons inside them

**Files modified:** `vue/src/pages/History/History.vue`, `vue/tests/unit/milestone-v116.cjs`
**Commit:** 7d39da4
**Status:** fixed: requires human verification (interaction behaviour)
**Applied fix:**
- The build `<tr>` no longer has `role="button"`, `tabindex`, `aria-label` or the Enter/Space handlers, so it keeps its table-row semantics.
- Row click stays as a mouse-only shortcut, `onBuildRowClick`. It ignores clicks on inner controls (`button, a, input, select, textarea, [role=button]`) and the click that ends a text selection. The row gets `cursor: pointer`.
- Keyboard and screen-reader users use the existing per-row "Open build log" button. It now carries `aria-label="Open build log <build_id>"` and `data-cy="build-open-log"`.
- Tests check that the row has no role, tabindex or keydown, and cover all three click cases.
- Not changed: DeviceDetail's build-history `<tr role="button">` (`DeviceDetail.vue:128`). The review lists it as a semantics-only issue: the row has no nested controls, and it is the only keyboard path to the log there.

### WR-02: "Create & Assign" also saves the user's unsaved transformer selection

**Files modified:** `vue/src/pages/Devices/DeviceDetail.vue`, `vue/tests/unit/milestone-v116.cjs`
**Commit:** c372197
**Status:** fixed: requires human verification (logic)
**Applied fix:**
- The assignment is now built from the stored `device.transformers` plus the new utid (deduplicated), not from the multi-select's `v-model`.
- After the reload, the user's unsaved selection plus the new transformer goes back into the select. It stays pending: the user can still save it or drop it.
- The existing test now uses a stored list that differs from the select. A second test covers a device with no stored transformers.

### WR-03: The new top "Environment" action silently discards an open environment draft

**Files modified:** `vue/src/pages/Devices/DeviceDetail.vue`, `vue/tests/unit/milestone-v116.cjs`
**Commit:** fe6c111
**Status:** fixed: requires human verification (state handling)
**Applied fix:**
- The Actions-card button now calls `openEnvironmentEditor()`. When the editor is closed, it loads the editor. When the editor is already open, it does not reload. In both cases it scrolls to and focuses `[data-cy=env-draft]` after `$nextTick`.
- `editEnvironment()` itself returns early while `envEditing || envLoading`, as a guard for any future caller.
- The tests check that an open draft is kept and not re-fetched, that a closed editor loads, and that focus happens in both cases.

### WR-04: Whole-`info` profile writes can now overwrite the transformer list

**Files modified:** `vue/src/pages/Profile/Profile.vue`, `src/app/js/thinx-api.js`, `vue/cypress/integration/profile.spec.js`, `vue/tests/unit/milestone-v116.cjs`
**Commit:** e53f2e9
**Status:** fixed: requires human verification (write-contract change)
**Applied fix:**
- I checked the server merge before changing any client. `owner.update` → `apply_update` → `users/edit` merges `info` key by key (`design/design_users.json:36`), and has since 2022 (`0c1c13d2`).
- `saveProfile` now sends only `first_name`, `last_name`, `mobile_phone` and `timezone_abbr`. It adds `timezone: null` only when the loaded info has a non-null legacy `timezone`, because a merge cannot delete a key.
- `saveNotifications` sends only `{notifications}`.
- The legacy `submitProfile`, which runs on every info-note dismissal, no longer sends `transformers`. Legacy transformer edits still go through `submitProfileChanges(["transformers"])`.
- The stale Profile.vue comment ("backend writes the full info blob") is corrected.
- The Cypress PROF-03 spec asserted the old contract (a notifications save must include `first_name` and `email`). It now asserts that `info` has only the `notifications` key. PROF-01 asserts there is no `transformers` or `email` key.
- New unit tests cover both Vue payloads and the legacy function body.
- Still open: the legacy `submitProfile` still sends other session-old keys (`goals`, `security`, `tags`, names). That stale-snapshot risk predates this phase, and the review did not ask for it to be fixed.

### WR-05: A failed deploy-key list request shows "No deploy keys yet." with no error

**Files modified:** `vue/src/store/rsakeys.js`, `vue/src/pages/Rsakeys/Rsakeys.vue`, `vue/tests/unit/milestone-v116.cjs`
**Commit:** 295c83a
**Applied fix:**
- `rsakeys/fetchItems` now throws on `!result || !result.success`, like `transformers/fetchItems`, and commits `result.response || []`.
- `createItem` and `deleteItems` ignore a failed refresh, so a created or deleted key is not reported as a failure. The page reloads the list itself and reports any load error.
- The page sets `loadFailed`. While it is set, the empty row reads "Deploy keys could not be loaded. Reload the page to retry." instead of "No deploy keys yet."
- Tests cover the throw (with no commit), create succeeding when the refresh fails, and the page's failed-load state.

### WR-06: Deleting deploy keys has no confirmation

**Files modified:** `vue/src/pages/Rsakeys/Rsakeys.vue`, `vue/tests/unit/milestone-v116.cjs`
**Commit:** c47cd21
**Applied fix:**
- "Delete (n)" now opens `msgBoxConfirm` before anything is deleted.
- Wording, my choice: "Delete this deploy key? / Delete N deploy keys? This cannot be undone. Repositories that use it/them stop building until a new key is generated and added to the Git host."
- Settings: title "Confirm Delete", OK button "Delete" in the danger variant, `autoFocusButton: 'cancel'` (the conservative default), and a dialog rejection counts as cancel.
- Tests: Cancel deletes nothing and the message names the count. Confirm sends the selected filenames and clears the selection.

### WR-07: The header rename breaks a Cypress spec, and the new unit tests are not run in CI

**Files modified:** `vue/src/components/Header/Header.vue`, `vue/cypress/integration/profile.spec.js`, `.circleci/config.yml`
**Commit:** d4b1b41
**Applied fix:**
- The "My Profile" dropdown item has `data-cy="header-profile"`. bootstrap-vue puts the attribute on the `<a class="dropdown-item">`, so the selector targets the link itself.
- PROF-06 is renamed to "My Profile". It now selects by `data-cy` and asserts the label.
- CircleCI `test_vue` runs `LC_ALL=C yarn test:unit` and `LC_ALL=C node ../src/test/deploykey.cjs` after `yarn` and before `yarn build:perf`.
- Why I judged the CI change small and safe:
  - Both suites run in node only (no browser) on the modules `yarn` already installs.
  - `deploykey.cjs` needs only node built-ins.
  - The YAML parses, and the injected command is unchanged otherwise.
  - Locally, the whole `test:unit` chain exits 0 under `LC_ALL=C`, with and without `NODE_OPTIONS=--openssl-legacy-provider`.
  - `LC_ALL=C` matters: `log-paging-store.cjs` "History filter hint singular and plural" compares against `toLocaleString()`. It fails only under a cs-CZ locale and passes under C or an unset locale.
- `test_vue` only gates "Build and Publish Vue console" on the `thinx-console` branch. The `thinx-staging` deploy path through the parent repo is not affected.

## Verification

All checks ran in the main checkout (`services/console`), after all eight commits:

| Check | Result |
|---|---|
| `node vue/tests/unit/milestone-v116.cjs` | pass |
| `vue/tests/unit/apikey-created-dialog.cjs`, `env-json.cjs`, `footer-hostnames.cjs`, `table-row-contrast.cjs` | pass |
| `vue/tests/unit/log-paging-store.cjs` | only the known pre-existing locale failure, "History filter hint singular and plural" (cs-CZ). Passes under `LC_ALL=C` |
| `node src/test/deploykey.cjs` and the other `src/test/*.cjs` | pass |
| `node -c src/app/js/thinx-api.js` | ok |
| `npx vue-cli-service lint --no-fix` on every changed Vue/JS/spec file | no lint errors |
| `npx vue-cli-service build` | Build complete. The 3 warnings are the webpack asset/entrypoint size warnings, which were already there |
| Cypress | not run here (needs the dev server and a browser). PROF-01, PROF-03 and PROF-06 were edited and should be checked in CI or locally |

---

_Fixed: 2026-10-12T11:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
