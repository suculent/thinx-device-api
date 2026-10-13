---
phase: 45-deploy-key-rename-row-actions
fixed_at: 2026-10-13T18:35:00Z
review_path: .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-REVIEW.md
iteration: 1
findings_in_scope: 18
fixed: 16
skipped: 2
status: partial
---

# Phase 45: Code Review Fix Report

**Fixed at:** 2026-10-13T18:35:00Z
**Source review:** `45-REVIEW.md` (1 critical, 2 warnings, 5 info), plus `45-UI-REVIEW.md` (findings 1-9) and
`45-SECURITY.md` auditor notes N-1..N-7
**Iteration:** 1
**Scope:** all (operator policy for this milestone: fix everything in the batch)

**Summary:**
- Findings in scope: 18 (REVIEW 8, UI review 9; the security notes map onto these, see the table at the end)
- Fixed: 16
- Skipped: 2 (UI finding 6, deferred to Phase 48 by the spec and not in this batch; UI finding 9, not consistent with other pages)

Commits: 7 in the parent (`thinx-staging`, unpushed), 10 in `services/console` (`thinx-staging`, unpushed). All signed
(`%G?` = `G`). The parent gitlink was **not** bumped (`services/console` shows as modified in the parent).

## Fixed Issues

### CR-01: Linking a GitHub account wrote the user's GitHub access token to the API log

**Files modified:** `lib/thinx/github.js`, `spec/jasmine/GitHubRequestLogSpec.js` (new)
**Commit:** parent `d04b82b9`
**Applied fix:** `addPublicKey` no longer logs its request options (`Authorization: Bearer <token>`).
`processPublicKeyRequest` no longer logs response headers or body chunks, and `validateAccessToken` no longer logs the
error body. Every call now logs only `[github] <METHOD> /user/keys <status>`, and a transport error is logged by its
`code`. A non-JSON answer no longer throws inside the `end` handler. I also checked `github_link.js` and
`router.github.js`: the link result never carries the token, and the router redacts tokens with `Util.redactToken`.
The new spec stubs `node:https` and uses a fake token. It covers 201, two 422s, 401, a non-JSON 502 and a transport
error, with bodies and headers that echo the token, and asserts that no console method printed the token, "bearer",
"authorization" or the key text.
**Operator note:** treat any GitHub token linked before this commit is deployed as exposed in `thinx_api` and Swarmpit
logs.
**Outside this scope:** `lib/thinx/oauth-github.js:157` logs `{query}` when the OAuth code is missing or shorter than
4 characters. That object holds the already-verified single-use `state` and the short code. It holds no token. I did
not change it.

### WR-01: GitHub linking pinned a damaged oldest key and reported GitHub's 422 as `key_pushed: true`

**Files modified:** `lib/thinx/github_link.js`, `lib/thinx/github.js`, `spec/jasmine/GitHubLinkSpec.js`,
`spec/jasmine/GitHubRequestLogSpec.js`
**Commit:** parent `7d867cbe`
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- `oldestKey` now also requires a non-empty `fingerprint`. A PEM `.pub` that list() cannot parse (`fingerprint: null`)
  is skipped. When every key is damaged, a new key is created and pushed.
- `processPublicKeyRequest` now answers `(pushed, {status, result})`. Only 201 counts as a push (`created`). A 422
  whose `errors[]` contains "key is already in use" gives `already_in_use`, read from the array (the old
  `errors.message` was always undefined). Every other answer is `rejected`, and a transport failure is `error`. No
  response body is passed on.
- GitHub answers "already in use" for a key on any account or repository. So `github_link` reports
  `key_pushed: true` for it only when the account's own `GET /user/keys` list, read during token validation (now
  `per_page=100`), contains the same `type base64` blob.
- Specs: W1-W4 in GitHubLinkSpec (damaged key skipped, all damaged leads to create, refused push, "in use" on and off
  this account) and the outcome cases in GitHubRequestLogSpec.

### WR-02: The phase's deploy-key safety tests did not run in CI

**Files modified:** `Dockerfile.test`, `package.json`
**Commit:** parent `8e5b1b63`
**Applied fix:** CI does not run `test:node`, and the CI host has no `node_modules`. The suite needs `fs-extra`,
`node-forge` and the router middleware, so it cannot run in a host step next to the Console header parity step. It
now runs where the other image-bound node tests already run: `RUN node --test spec/node/DeployKeyNames.test.js` in
`Dockerfile.test`, after `COPY . .`. The test job builds that image (`docker compose up --build api`), so a failure
fails the build and the job. The suite is hermetic: it points `HOME` at a mkdtemp directory, sets
`ENVIRONMENT=development` (the repo's `spec/mnt/data/conf`) and needs no services. The private-key spy test already
handles root. The file is also in the root `test:node` script for local runs. `.circleci/config.yml` is unchanged, and
`node scripts/check-ci-gates.js compile` reports `CI-GATES COMPILE OK`.
**Not verified locally:** the Docker build itself. The suite was run on the host only (38/38).

### IN-01: The validator admitted U+061C, invisible-only names and lone surrogates (45-SECURITY N-1)

**Files modified:** `lib/thinx/rsakey.js`, `spec/node/DeployKeyNames.test.js`,
`services/console/vue/src/utils/keyNames.js`, `services/console/vue/tests/unit/deploy-key-actions.cjs`
**Commits:** parent `1717468c`, console `6558cab`
**Status:** fixed: requires human verification (validator semantics)
**Applied fix (server and client identical):**
- U+061C is refused as `bidi`.
- U+200B-U+200D, U+2060 and U+FEFF are refused anywhere in the name under a new reason, `invisible`. The Vue sentence
  is "The name contains an invisible character, such as a zero-width space."
- A name with no visible character is `empty`. Visible means not whitespace and not Default_Ignorable_Code_Point, so
  names made only of U+00AD, U+3164, U+FE0F or tag characters are empty.
- An unpaired surrogate is refused as `control_chars`. A valid pair passes.

New parent test: it loads the Vue `keyNames.js` and compares it with `RSAKey.validateKeyName` on every UTF-16 unit in
six positions, every surrogate pairing, the shared cases and the length bounds. It passes. It is skipped when the
submodule is absent.
**Trade-off to confirm:** following the batch instruction, ZWJ/ZWNJ are refused everywhere. Emoji ZWJ sequences
(for example U+1F469 U+200D U+1F4BB) and ZWNJ in Persian/Indic text are refused with the `invisible` sentence. If those should be allowed
between visible characters, only U+200C/U+200D need to move from the outright refusal to the invisible-only check.

### IN-02: Renaming a key to `thinx-<its timestamp>` succeeded but was never shown

**Files modified:** `lib/thinx/rsakey.js`, `lib/router.rsakey.js`, `spec/node/DeployKeyNames.test.js`,
`services/console/vue/src/utils/keyNames.js`, `services/console/vue/src/pages/Rsakeys/Rsakeys.vue`,
`services/console/vue/tests/unit/deploy-key-actions.cjs`, `services/console/vue/tests/unit/milestone-v116.cjs`
**Commits:** parent `2e1022e3`, console `a7cf868`
**Applied fix:** I chose to refuse the name. The list could not show it without adding new metadata, so refusing it
keeps the response, the list and the toast consistent.
- `rename()` refuses a key's own default comment with 400 `invalid_key_name`, reason `reserved`. The check runs after
  the owner-bound key check.
- `create()` refuses it once its timestamp is picked and releases the claimed name. The v1/v2 create routes now pass
  that reason through as 400.
- Another key's `thinx-<n>` stays an ordinary name and is listed as stored.
- Vue: `isReservedKeyName(name, filename)` plus the sentence "This name is reserved for the key's default label.
  Choose a different name." The rename dialog checks it before sending, with Save disabled.

### IN-03: A key that was gone or could not be renamed got "Try again." forever

**Files modified:** `services/console/vue/src/pages/Rsakeys/Rsakeys.vue`,
`services/console/vue/tests/unit/deploy-key-actions.cjs`, `services/console/vue/tests/unit/milestone-v116.cjs`
**Commit:** console `258c5c5`
**Applied fix:**
- Rename answered `key_not_found`: the dialog closes, the list reloads and the page shows "This deploy key no longer
  exists. The list has been refreshed."
- Rename answered `rename_failed`: the list reloads and the dialog shows "This deploy key cannot be renamed." The key
  still exists, so I did not use the "no longer exists" sentence here.
- Row or bulk delete answered `success:false` with an empty revoked list (the key was already removed): the list
  reloads, the gone keys leave the selection, and the same sentence is shown (plural for several keys).
- Other failures (no body, a thrown request) keep "Try again."

### IN-04: The "revoked meanwhile" check in `rename()` could never fire (45-SECURITY N-4)

**Files modified:** `lib/thinx/rsakey.js`, `spec/node/DeployKeyNames.test.js`
**Commit:** parent `cfe38324`
**Status:** fixed: requires human verification (concurrency logic)
**Applied fix:** `replacePublicKey` re-checks the key right before the final `renameSync`. The check is the owner
listing plus the `.pub` still existing: a directory listing and a stat, never an open of the private half (D-04). If
the key is gone, the temp file is removed and the answer is `key_not_found`. `rename()` checks once more after the
rename and removes the `.pub` it just wrote if the pair was revoked in between, so no non-empty orphan is left. Two new
tests play the other API process from inside rename's fs calls. The private-key spy test (N4) still records zero calls
on the private path. This also closes the gap behind accepted risk AR-45-02.

### IN-05: Stale comment on the list order after D-13

**Files modified:** `lib/thinx/rsakey.js`
**Commit:** parent `ae126879`
**Applied fix:** The comment now says the order serves the consoles only: github_link picks the oldest fingerprinted
key itself, and git.js never reads `list()`.

### UI-1 (UI review fix 1): Generate feedback line detached from its field

**Files modified:** `Rsakeys.vue`, `styles/_deploy-keys.scss`, `deploy-key-actions.cjs`
**Commit:** console `9b0ea53`
**Applied fix:** The form and its feedback line now share `div.key-create`, which carries the 16px below them. The
form has no bottom margin, so the line sits 4px under the field and the next block starts 16px below the pair.

### UI-2 (UI review fix 2): A server-refused name could be resubmitted unchanged

**Files modified:** `Rsakeys.vue`, `deploy-key-actions.cjs`
**Commit:** console `eaf9cc2`
**Applied fix:** Save name is disabled on `renameReason` (client or server reason), and Generate is also disabled on
`createServerReason`. Both handlers return early on these reasons too. Editing the name clears the reason through the
existing watchers. A request error ("Try again") can still be retried.

### UI-3 (UI review fix 3): Every reload blanked the table and dropped focus

**Files modified:** `Rsakeys.vue`, `deploy-key-actions.cjs`
**Commit:** console `c267340`
**Applied fix:** `loading` starts true and only the first load clears it. Later reloads keep the table and the toolbar
rendered and update the keyed rows in place. Each Rename button has a per-key ref, and the dialog's `@hidden` handler
focuses the renamed row's Rename button once the dialog has closed.

### UI-4: `.key-name-help` rendered at weight 300

**Commit:** console `53f7192`
**Applied fix:** Set `font-weight: 400` (the Label role), asserted on the compiled rule.

### UI-5: Created-key result modal (pre-existing)

**Commit:** console `29cdcfb`
**Applied fix:**
- The Copy key button uses `variant="default"` (#474D84, white text 7.89:1, the Phase 44 secondary) and adds the
  fa-copy glyph. It replaces the outline-secondary "Copy to clipboard" pill.
- The Close button uses `ok-variant="default"` instead of the blue primary.
- The title is "Deploy key — {name}".
- The textarea sits 8px above the button (`.key-result-text`) instead of `mb-2` (7px).

### UI-7: Two list fetches per delete

**Commit:** console `0fd8dab`
**Applied fix:** The store's `deleteItems` and `createItem` no longer dispatch `fetchItems`. `createItem` had the
same double fetch. The page's `loadData` is the one refresh, so each delete or generate now makes one GET.

### UI-8: No-op toolbar gap

**Commit:** console `6f8902b`
**Applied fix:** Removed `gap: 4px` from `.key-toolbar`. The label's 4px margin stays and is asserted.

## Skipped Issues

### UI-6: Both alerts use `.alert-danger` with text at 3.96:1

**File:** `services/console/vue/src/pages/Rsakeys/Rsakeys.vue:11-12`
**Reason:** This was not in this batch's instructions, and the UI-SPEC defers it to Phase 48. The fix is a theme-wide
alert colour change.
**Original issue:** The alert text measures 3.96:1, below 4.5:1.

### UI-9: Page title "Settings - Deploy Keys" uses a hyphen

**File:** `services/console/vue/src/pages/Rsakeys/Rsakeys.vue:4`
**Reason:** The change would not be consistent with the other pages. Every other page title uses the same
`<Section> - <span>` hyphen pattern (Apikeys, Repositories, Transformers, Enviros, Channels, Devices, DeviceDetail,
TransformerEditor). Changing only this page would make it inconsistent.
**Original issue:** The hyphen differs from the em dash in the new copy.

## Security audit notes (45-SECURITY.md)

| Note | Outcome |
|------|---------|
| N-1 (U+061C, invisible-only names, lone surrogates) | Fixed as IN-01 (parent `1717468c`, console `6558cab`) |
| N-2 (GitHub token in the API log) | Fixed as CR-01 (parent `d04b82b9`). Treat earlier linked tokens as exposed |
| N-3 (`verifyCsrfToken` fails open when `CSRF_ENFORCE` is unset) | No change. This is pre-existing config, production enforces it (live PATCH answers 403), and it is outside this batch |
| N-4 (revoked-meanwhile branch unreachable, orphan `.pub`) | Fixed as IN-04 (parent `cfe38324`). AR-45-02's orphan case is now cleaned up |
| N-5 (safety tests not in CI) | Fixed as WR-02 (parent `8e5b1b63`) |
| N-6 (damaged oldest key, 422 as success) | Fixed as WR-01 (parent `7d867cbe`) |
| N-7 (operator UAT 1-10 pending) | Not code. Still pending, and it should now also cover the reserved-name refusal, the in-place reload and focus return, and the result modal |

## Verification

All gates ran in the **main checkout** (`/Users/sychram/Repositories/thinx-api/thinx-device-api`, parent and
`services/console` on `thinx-staging`), not in an isolated worktree. A hand-rolled worktree would have had no
`node_modules` and no initialized console submodule, and the batch commits Vue changes through
`git -C services/console`. Everything that touches keys ran with `HOME` and `TMPDIR` in a scratch directory (no
leftovers, real `~/.ssh` untouched).

| Gate | Result |
|------|--------|
| `npm run -s test:deploykeys` | 38 tests, 38 pass (was 34) |
| `npm run -s test:node` | 104 tests, 104 pass |
| jasmine GitHubLinkSpec + GitHubRequestLogSpec + CsrfRouteInventorySpec + ZZ-CORSSpec | 118 specs, 0 failures |
| 03-RsakeySpec filtered `^RSA Key \((?!13\))` | Ran 17 of 18 specs, 0 failures |
| `npx eslint` on the 7 changed parent JS files | clean |
| `node scripts/check-ci-gates.js compile` | CI-GATES COMPILE OK (config.yml unchanged) |
| Vue `test:unit` | exit 0, 251 ok, 0 FAIL (was 244) |
| Vue `LC_ALL=C test:unit` | exit 0, 251 ok, 0 FAIL |
| Vue build (`NODE_OPTIONS=--openssl-legacy-provider`) | Build complete, 0 errors |
| `test:csp:dist` | PASS (3 lines) |
| `perf:spotter` | All performance budgets passed (app 752.40 KiB gzip, app-legacy 757.61 KiB gzip) |
| Legacy `services/console/src` | untouched |

---

_Fixed: 2026-10-13T18:35:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
