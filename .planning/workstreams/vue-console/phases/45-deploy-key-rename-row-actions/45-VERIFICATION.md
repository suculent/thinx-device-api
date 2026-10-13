---
phase: 45-deploy-key-rename-row-actions
verified: 2026-10-13T19:29:33Z
status: passed
score: 13/13 must-haves verified
covered_files:
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-01-PLAN.md
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-01-SUMMARY.md
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-02-PLAN.md
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-02-SUMMARY.md
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-03-PLAN.md
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-03-SUMMARY.md
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-04-PLAN.md
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-04-SUMMARY.md
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-05-PLAN.md
  - .planning/workstreams/vue-console/phases/45-deploy-key-rename-row-actions/45-05-SUMMARY.md
  - Dockerfile.test
  - lib/middleware/cors.js
  - lib/router.github.js
  - lib/router.rsakey.js
  - lib/thinx/git.js
  - lib/thinx/github.js
  - lib/thinx/github_link.js
  - lib/thinx/rsakey.js
  - package.json
  - services/console/vue/package.json
  - services/console/vue/src/core/api.js
  - services/console/vue/src/pages/Profile/Profile.vue
  - services/console/vue/src/pages/Rsakeys/Rsakeys.vue
  - services/console/vue/src/store/rsakeys.js
  - services/console/vue/src/styles/_deploy-keys.scss
  - services/console/vue/src/styles/theme.scss
  - services/console/vue/src/utils/keyNames.js
  - services/console/vue/tests/unit/deploy-key-actions.cjs
  - services/console/vue/tests/unit/github-token-scopes.cjs
  - services/console/vue/tests/unit/milestone-v116.cjs
  - spec/jasmine/03-RsakeySpec.js
  - spec/jasmine/CsrfRouteInventorySpec.js
  - spec/jasmine/GitFailureCauseSpec.js
  - spec/jasmine/GitHubLinkSpec.js
  - spec/jasmine/GitHubRequestLogSpec.js
  - spec/jasmine/ZZ-CORSSpec.js
  - spec/jasmine/ZZ-CSRFRouteGuardSpec.js
  - spec/jasmine/ZZ-RouterRSAKeySpec.js
  - spec/node/DeployKeyNames.test.js
covered_digest: "v3:sha256:e2dc4ade03f088e134b3256e548b49dba51b3dbe054b48ace0b97dd2c97fa117"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 10/13
  previous_verified: 2026-10-13T15:50:12Z
  reason: "Covered files changed after the first report: 45-REVIEW-FIX (16 fixes plus orchestrator follow-ups), GitHub fixes e2251f41 and 1ec8c3da (github.js, github_link.js, git.js), console a31c0e2 and 316c5f9 (Profile.vue)"
  gaps_closed:
    - "E1 overflow backstop: operator UAT 6 pass on live build 3b578cb (Rsakeys.vue, _deploy-keys.scss and theme.scss are unchanged from console efc8cd2 to 316c5f9)"
    - "E6 long-text backstop: operator UAT 6 pass, same build and same unchanged files"
    - "E3 long-text backstop: operator UAT 7 pass, same build and same unchanged files"
  gaps_remaining: []
  regressions: []
---

# Phase 45: Deploy Key Rename & Row Actions Verification Report

**Phase Goal:** A user can rename a deploy key without changing the key itself, and manages each key from compact icon actions with a confirmed, single-shot delete on a table that stays readable on small screens. The Phase 38 review items are closed.
**Verified:** 2026-10-13T19:29:33Z
**Status:** passed
**Re-verification:** Yes. The first report (15:50Z, human_needed, 10/13, no gaps) went stale when covered files changed. This report checks the current code: parent `thinx-staging` at e297c5d5 (code as of db85439a) and console 316c5f9.

## What changed since the first report

| Change | Commits | Effect on the must-haves |
|--------|---------|--------------------------|
| Review fixes (45-REVIEW-FIX, 16 fixed, 2 skipped) | parent d04b82b9, 7d867cbe, 8e5b1b63, 1717468c, cfe38324, ae126879, 2e1022e3, 73cb38c3. Console 6558cab..efc8cd2 | CR-01: the GitHub token is no longer logged. WR-01: damaged keys are skipped and a 422 no longer counts as pushed. WR-02: `DeployKeyNames.test.js` runs in `Dockerfile.test`. IN-01: ALM, ZWSP/WJ/BOM and lone surrogates are refused; ZWNJ/ZWJ are allowed again (D-06 follow-up). IN-02: a key's own `thinx-<ts>` is refused as `reserved`. IN-04: the revoked-meanwhile check now works. UI fixes 1-5, 7 and 8 |
| GitHub token-scope diagnostics | parent e2251f41, console a31c0e2 | 403 from `GET /user/keys` now answers 403 `github_token_missing_scope`. Allow-listed `[github]` diagnostics. `[git] … cause=<code>` on clone failures. The Profile panel names the required scopes |
| **D-13 refinement** (debug record `github-token-private-repo.md`) | parent 1ec8c3da, console 316c5f9 | Linking now tries the usable keys **oldest first** and skips any key GitHub reports as "key is already in use" on another account or as a repository deploy key. When every key is taken, it creates a fresh key and pushes that. Any other refusal stops at once. The response gains the field `keys_in_use_elsewhere`. The choice is still deterministic and does not depend on list order, so SC4 still holds. D-13 as written ("pushes the oldest key") now means "the oldest key GitHub will accept for this account" |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1a: renaming a key changes only its name. After a reload the new name shows, and the public key material and fingerprint are unchanged | ✓ VERIFIED | `rsakey.rename` checks exact membership in `getKeyPathsForOwner`, reads only the `.pub`, writes a dot-temp file, re-checks the listing (IN-04) and `renameSync`s it over the `.pub`. Node tests "rename rewrites only the .pub comment…", "rename converts a PEM .pub…" and "list() fingerprints … kept across a rename" pass (38/38). 03-RsakeySpec (14) round trip passes. Live: operator UAT 2 pass on build 3b578cb. Since then the rename UI files have not changed |
| 2 | SC1b: names with control characters, bidi overrides or line/paragraph separators are refused on create and on rename, with a message that names the problem | ✓ VERIFIED | `RSAKey.validateKeyName` is the one server rule (create, rename, PATCH and both create routes → 400 `invalid_key_name` + `reason`). It now also refuses U+061C as `bidi`, U+200B/U+2060/U+FEFF as `invisible`, lone surrogates as `control_chars`, and invisible-only names as `empty`. `reserved` comes from rename/create. Node test "the Vue keyNames.js validator agrees with RSAKey.validateKeyName on every UTF-16 unit" passes, so server and client match. Vue sentences for `invisible` and `reserved` are in the live bundle. UAT 3 pass |
| 3 | SC2: each row has Show (eye), Copy (copy) and Delete (trash) IconButtons with text as aria-label and tip. Delete is outside the generate form, confirms, shows a pending state and cannot be double-submitted | ✓ VERIFIED | Rsakeys.vue: four IconButtons in `td.actions-cell`. `deleteRow`/`deleteSelected` are guarded by `confirming` + `deletingIds`. The bulk toolbar sits outside `b-form.key-create-form`. deploy-key-actions.cjs (A2-A4, C3 plus the review-fix cases) passes in `test:unit` (261 ok, 0 FAIL). UAT 1, 4 and 5 pass |
| 4 | SC3: on small screens the Name is truncated with a full-name tip, and Generated and Public Key do not wrap. A failed reload clears stale rows and shows one error | ✓ VERIFIED | `.key-name` max-width 160/240px + ellipsis + `title`. Nowrap cells. `loadData` failure clears items, selection and open keys and shows the single `keys-load-error` alert (UI-3 now keeps rows on a *successful* reload, which is unit-tested). Unit C4, C5, B8 pass. UAT 6 and 8 pass |
| 5 | SC4: GitHub linking pushes a deterministically chosen key that doesn't depend on list order. A revoke with duplicate filenames reports each key once. Every FIX-04 item is fixed or deferred with a reason | ✓ VERIFIED | `usableKeysOldestFirst` sorts by filename timestamp (stable) and keeps only keys with a pubkey and a fingerprint. GitHubLinkSpec G1-G5 (newest-first, reversed, shuffled, no pubkey, no usable key), W1-W4 (damaged key, refused push, in use on this account) and W5-W8 (D-13 refinement: in use elsewhere skipped, all taken → fresh key, other refusal stops, fresh key also refused) all pass (129 specs, 0 failures). `revokeUserKeys` iterates `new Set(...)`. Node D1/D2 and 03-RsakeySpec (04b) pass. `38-REVIEW-DISPOSITION.md` is unchanged since the first report |
| 6 | SC5: the Legacy console that production serves still lists, creates and revokes against the deployed API with unchanged endpoints and envelopes | ✓ VERIFIED | The routes are unchanged. The only envelope addition is `reason` next to `invalid_key_name`, including the new `reserved` value on create. Legacy does not call the GitHub token route (grep of `services/console/src`: no `github/token`, `key_pushed` or `github_token`), so the new 403 code and the `keys_in_use_elsewhere` field cannot reach it. `services/console/src` has no diff from 31ed738 to 316c5f9. I re-downloaded the 5 Legacy files from rtm: all 5 sha256 equal the 45-05 baseline. UAT 9 pass |
| 7 | Rename never opens, reads, writes, chmods or unlinks the private key file (D-04, vault-transit Phase 40) | ✓ VERIFIED | The IN-04 re-check (`keyStillListed`) is a `readdirSync` listing plus `existsSync(pub_path)`. It never touches the private path. The node spy test "rename never opens, reads, writes, chmods or removes the private key" passes, as do the two IN-04 revoke-race tests |
| 8 | PATCH /api/v2/rsakey is CSRF-guarded, session- and owner-bound, addresses the key by exact filename, and is allowed by CORS | ✓ VERIFIED | `app.patch("/api/v2/rsakey", csrf.verifyCsrfToken, …)`. Node router harness passes. CsrfRouteInventorySpec and ZZ-CORSSpec pass. Live (this run): PATCH answers 403 `csrf_token_invalid` on rtm and on console. The preflight from `https://console.thinx.cloud` answers 200 with `access-control-allow-methods: GET,PUT,POST,DELETE,PATCH,OPTIONS` and echoes the origin |
| 9 | list() fingerprints are OpenSSH `SHA256:`, match `ssh-keygen -lf`, and survive a rename | ✓ VERIFIED | Node tests "fingerprint equals ssh-keygen -lf…" and "list() fingerprints: GitHub vector…" pass. 03-RsakeySpec (15) passes |
| 10 | D-08 display rule (IN-03): a stored comment is shown only on a single-line `ssh-` key with a valid comment, never `thinx-<ts>`, damaged PEM, multi-line or bidi | ✓ VERIFIED | Node test "list() shows a stored comment only when…" passes. IN-02 also refuses `thinx-<own ts>` on rename and create ("rename and create refuse the key's own generated default name" passes), so the name a user saves is always the name they see |
| 11 | E1 overflow backstop (45-03): at 375/768/1024/1280 px rows stay one line, no page-level sideways scroll | ✓ VERIFIED (human-observed) | `verification: backstop`. Evidence is behaviour the operator observed: UAT 6 pass on live build 3b578cb (console efc8cd2). `git diff efc8cd2 316c5f9` on Rsakeys, utils, store, core and styles is empty, so that observation still applies |
| 12 | E6 long-text backstop (45-03): a 4096-bit key at 375 px wraps inside its row | ✓ VERIFIED (human-observed) | UAT 6 pass, same build, and the rendering files are unchanged since |
| 13 | E3 long-text backstop (45-04): a 120-character name ellipsises with a full tip, and its delete dialog wraps | ✓ VERIFIED (human-observed) | UAT 7 pass, same build, and the rendering files are unchanged since |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified). Truths 11-13 rest on operator observation recorded in 45-HUMAN-UAT.md. Presence checks alone did not count for them.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/thinx/rsakey.js` | validateKeyName (+IN-01), fingerprint, rename (.pub-only atomic, IN-04 re-check), D-08, `reserved` (IN-02), revoke de-dup | ✓ VERIFIED | Used by router.rsakey.js, github_link.js and router.github.js |
| `lib/router.rsakey.js` | PATCH route, 400 + reason on create (now including `reserved`) and rename | ✓ VERIFIED | `create` callback maps `invalid_key_name` + reason to 400 |
| `lib/middleware/cors.js` | PATCH in the allow-list | ✓ VERIFIED | Live header confirms |
| `lib/thinx/github_link.js` | Deterministic key choice (D-13 as refined) | ✓ VERIFIED | `usableKeysOldestFirst` → `tryKey` → `createAndPush`; wired from router.github.js `GitHubLink.link({GitHub, rsakey, user}, …)` |
| `lib/thinx/github.js` | No token in logs; push outcome `{status, result}` | ✓ VERIFIED | GitHubRequestLogSpec asserts that no console output contains the token, "bearer", "authorization" or the key text |
| `spec/node/DeployKeyNames.test.js` | Validator, parity, rename, spy, IN-02, IN-04, router harness | ✓ VERIFIED | 38/38. Also in `Dockerfile.test` (CI) and in root `test:node` |
| `spec/jasmine/03-RsakeySpec.js` | Round trip (14), GitHub vector (15), (04b) | ✓ VERIFIED | 17/17 in declared order (see Info about random order) |
| `spec/jasmine/ZZ-RouterRSAKeySpec.js`, `ZZ-CSRFRouteGuardSpec.js` | PATCH cases | ✓ VERIFIED (syntax) | `node --check` OK; the ZZ tier is CI-skipped |
| `services/console/vue/src/pages/Rsakeys/Rsakeys.vue` | Row actions, delete guards, rename modal, load error | ✓ VERIFIED | Unchanged since UAT build efc8cd2 |
| `services/console/vue/src/utils/keyNames.js` | Client mirror | ✓ VERIFIED | Per-code-unit parity test passes |
| `services/console/vue/src/core/api.js` / `store/rsakeys.js` | `$patch`, `renameItem` | ✓ VERIFIED | Non-GET → `fetchWithCsrf`. A 403 `github_token_missing_scope` is not a CSRF rejection (`isCsrfRejectedPayload` checks `csrf_token_invalid`) |
| `services/console/vue/src/pages/Profile/Profile.vue` | Scope guidance, skipped-key sentence | ✓ VERIFIED | github-token-scopes.cjs passes. No `v-html` |
| `services/console/vue/tests/unit/deploy-key-actions.cjs` | In the test:unit chain | ✓ VERIFIED | In the chain, all `ok` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| router PATCH /api/v2/rsakey | `rsakey.rename()` | `renameRSAKey` after session/owner/validator | WIRED |
| `rsakey.rename` | `<owner>-<ts>.pub` | dot-temp + `keyStillListed` re-check + `renameSync` | WIRED |
| `exportKeysForList` | `RSAKey.fingerprint` | `fingerprint` field | WIRED |
| Browser preflight | `cors.js ALLOWED_METHODS` | live header contains PATCH | WIRED |
| router.github.js POST /api/(v2/)github/token | `GitHubLink.link` → `rsakey.list` → `usableKeysOldestFirst` → `GitHub.addPublicKey` (→ `rsakey.create` when all are taken) | injected deps `{GitHub, rsakey, user}`; non-200 → `Util.failureResponse(res, status, code)` | WIRED |
| `deleteRSAKey` | `revokeUserKeys` `new Set(...)` | `rsakey.revoke` | WIRED |
| Rsakeys.vue | IconButton.vue | import + `<IconButton>` x4 | WIRED |
| Rsakeys.vue `deleteRow`/`deleteSelected` | store `deleteItems` → DELETE /rsakey; page `loadData` is the one refresh (UI-7) | `confirming` + `deletingIds` | WIRED |
| Rsakeys.vue `saveRename` | `renameItem` → `$patch` → `fetchWithCsrf` → PATCH /api/v2/rsakey | mapActions | WIRED |
| Profile.vue `linkGitHub` | `keys_in_use_elsewhere`, `github_token_missing_scope` | `result.response` | WIRED |
| theme.scss | _deploy-keys.scss | `@import 'deploy-keys'` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Rsakeys.vue table | `items` | store `fetchItems` → GET /api/v2/rsakey → `rsakey.list` → `.pub` files | Yes | ✓ FLOWING |
| Rename feedback | `renameServerReason` | PATCH 400 body `reason`, passed through `api.request` unchanged | Yes | ✓ FLOWING |
| Profile GitHub result | `key_pushed`, `created_key`, `keys_in_use_elsewhere` | `GitHubLink.link` finish(), driven by real `addPublicKey` outcomes | Yes | ✓ FLOWING |
| Live bundle | Phase 45 + follow-up strings | https://console.thinx.cloud/js/app.js (3,187,514 bytes, build id `db85439`) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks (this run; HOME and TMPDIR in the scratchpad)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Parent deploy-key node tests | `HOME=<scratch> TMPDIR=<scratch> npm run -s test:deploykeys` | tests 38, pass 38, fail 0. Scratch HOME stayed empty | ✓ PASS |
| GitHub link/log/cause + CSRF inventory + CORS | `ENVIRONMENT=development HOME=<scratch> COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null GitHubLinkSpec GitHubRequestLogSpec GitFailureCauseSpec CsrfRouteInventorySpec ZZ-CORSSpec` | 129 specs, 0 failures | ✓ PASS |
| 03-RsakeySpec filtered | `GIT_KEY_PASSPHRASE=p45dummy … npx jasmine --config=/dev/null --random=false 03-RsakeySpec.js --filter='^RSA Key \((?!13\))'` | Ran 17 of 18, 0 failures. The scratch dirs stayed empty | ✓ PASS |
| ZZ specs syntax | `node --check` x2 | OK | ✓ PASS |
| Console unit tests | `npm --prefix services/console/vue run test:unit` | rc 0, 261 `ok`, 0 FAIL (chain includes deploy-key-actions.cjs and github-token-scopes.cjs) | ✓ PASS |
| Live API (unauthenticated) | curl | PATCH /api/v2/rsakey 403 `csrf_token_invalid` on rtm and console. GET /api/v2/rsakey 401. /api/user/profile 401. PATCH preflight 200 with PATCH and the console origin | ✓ PASS |
| Live bundle markers | `grep -oF` on app.js | Present: `db85439`, "already registered on another GitHub account", `admin:public_key`, `github_token_missing_scope`, `rsakey-rename-modal`, "Deploy key renamed", the load-error sentence, the `reserved` sentence, the `invisible` sentence, `key-bulk-delete`, "Keep current name", the fingerprint tip. Absent: "Deploy keys could not be loaded", "Failed to delete deploy keys" | ✓ PASS |
| Legacy byte identity | 5 files from rtm, sha256 against the 45-05-SUMMARY baseline | 5/5 equal | ✓ PASS |
| Pipelines 5667 (3b578cbe), 5668 (b68af050), 5669 (db85439a) | `check-ci-gates.js pipeline --expect legacy-off` | `CI-GATES PIPELINE OK` ×3, as reported by the orchestrator (not re-queried here, per the no-pipelines rule). The live bundle id `db85439` is consistent with 5669 having deployed | ✓ PASS (orchestrator-attested) |
| thinx_api task started 2026-10-13T19:13:32Z, WS-MULTITAB OK 2/2 | ssh / probe | Orchestrator-attested (no ssh in this run) | ✓ PASS (orchestrator-attested) |

### Probe Execution

Step 7c does not apply. Phase 45 declares no `scripts/*/tests/probe-*.sh` probes. The live checks above are the phase's runnable verifications.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| KEY-04 | 45-01, 45-04, 45-05 | Rename; key material unchanged; name persists across reload | ✓ SATISFIED | Truths 1, 2, 7, 8, 9, 10. UAT 2, 3 |
| KEY-05 | 45-03 | Show/Copy/Delete icons with aria-label + tip; row Delete confirms | ✓ SATISFIED | Truth 3. UAT 1, 4, 5 |
| KEY-06 | 45-03 | Name truncated with tip; Generated/Public Key don't wrap | ✓ SATISFIED | Truths 4, 11-13. UAT 6, 7 |
| POL-04 | 45-03 | Delete out of the form, pending state, no double-submit; failed reload clears rows + one error | ✓ SATISFIED | Truths 3, 4. UAT 5, 8 |
| FIX-04 | 45-01, 45-02 | IN-01..IN-04, IN-06, IN-07 fixed or deferred with a reason | ✓ SATISFIED | Truth 5. The disposition file is unchanged. IN-07's key choice is now the refined D-13 |

No orphaned requirements: REQUIREMENTS.md maps only KEY-04..06, POL-04 and FIX-04 to Phase 45. CI-06 (Legacy rebuild) belongs to Phase 48.

### Human UAT (45-HUMAN-UAT.md, complete)

10 pass, 1 issue, 0 pending. U10 (GitHub linking, optional) is an issue: the operator's token lacked the SSH-key scope, then the oldest key was "already in use" elsewhere on GitHub. Neither cause is a Phase 45 regression: the D-13 key choice is covered by GitHubLinkSpec. The follow-up is the D-13 refinement above (1ec8c3da, W5-W8). The live re-link and the private repository add after that fix are still open in `.planning/debug/github-token-private-repo.md` (status `investigating`). That record also tracks the `per_page=100` limit of `onAccount`. U11 (prohibitions) pass. See the note on three prohibitions below.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (16 changed source/spec files) | - | TBD/FIXME/XXX | none | - |
| lib/thinx/git.js | 219 | `TODO` inside a comment that quotes an old log string | ℹ️ Info | Pre-existing; not a debt marker |
| Rsakeys.vue, Profile.vue | - | `v-html` | none | Names and messages are text bindings |
| lib/thinx/github.js | - | token/headers/body in logs | none | Only method, path, status and allow-listed codes (GitHubRequestLogSpec) |
| lib/thinx/rsakey.js | 462-466, 473-479 | Fails destructively on a transient listing error | ⚠️ Warning | See below |

**⚠️ Warning: the IN-04 post-rename check deletes the `.pub` of a live key when the directory listing fails.** `keyStillListed` returns `false` both for "the key is gone" and for "`readdirSync` threw" (`catch { return false; }`). The check after the `renameSync` treats `false` as "revoked meanwhile" and unlinks `pub_path`. I reproduced this in a scratch probe (mkdtemp key dir; the third `getKeyPathsForOwner` call throws `EMFILE`). Result: `rename → false key_not_found`, private file still present, `.pub` gone, and `list()` no longer shows the key. The user is told the key no longer exists. The private half stays on disk, is still used by git.js for builds, and the console can neither show it nor revoke it. A transient scandir failure in that window is required (rare, but the key directory is on GlusterFS). Suggested fix: unlink only after a listing that succeeded and no longer contains the filename (or whose private file is absent). Treat a failed listing as "unknown" and keep the `.pub`. This does not falsify a must-have (normal-path rename is proven, and the private file is never touched), so it is not a gap. It is a recommended follow-up.

ℹ️ Info (not blocking):
- 03-RsakeySpec is order-dependent. With jasmine's default random order (`--config=/dev/null` without `--random=false`) (01), (02), (04) and (04b) fail because they depend on (300) creating keys first. CI uses `spec/support/jasmine.json` with `"random": false`, so this order is enforced in CI. The first report's 17/17 run was in declared order too.
- The Legacy console shows a generic error for a refused name until CI-06 rebuilds it. Phase 35 IN-03..IN-05 are carried to Phase 48 FIX-01.
- The `fingerprint` field changed format to OpenSSH `SHA256:` (D-01). Nothing in Legacy or lib reads it; external API clients would see the new format.
- When every key is in use elsewhere, linking creates a new deploy key on each attempt (W6). A later link tries the older keys first and reaches the new one, so keys do not pile up on repeated links. They only pile up if GitHub keeps refusing the fresh key.
- UI-6 (alert contrast 3.96:1) is deferred to Phase 48. UI-9 was skipped as inconsistent with the other pages (45-REVIEW-FIX).

### Prohibitions (22 judgment-tier; operator accepted the verdicts in UAT 11)

The verdicts from the first report stand for everything the plans themselves did. Three plan-scoped prohibitions were later crossed by follow-up work the operator authorised. The plan executions did not cross them:

| Plan | Prohibition (short) | Verdict now | Evidence |
|------|--------------------|-------------|----------|
| 45-02 | GitHub link response shape `{ key_pushed, created_key }`, token handling and injected deps unchanged | Not violated by 45-02. **Later changed on purpose:** 1ec8c3da added the field `keys_in_use_elsewhere`, and e2251f41 added 403 `github_token_missing_scope`. Both came from the operator-requested debug session. The token is still never in the response, and the deps are still `{GitHub, rsakey, user}` | github_link.js, GitHubLinkSpec |
| 45-03, 45-04 | No change to the created-key result modal or the store's API calls | Not violated by 45-03/45-04. **Later changed** by review fixes UI-5 (29cdcfb, modal) and UI-7 (0fd8dab, the store no longer refetches after delete/generate), under the operator's "fix everything in the batch" policy (45-REVIEW-FIX). The operator's UAT 1-11 ran on a build that includes both | Console log |
| 45-05 | Console push limited to the nine Phase 45 Vue paths | True for the 45-05 push (c3f78558 → 31ed738). Later pushes also changed Profile.vue and added github-token-scopes.cjs (a31c0e2, 316c5f9, GitHub debug fixes). Legacy `services/console/src` is still untouched | `git diff 31ed738 316c5f9 -- src` empty |

All other verdicts are unchanged: private key untouched (re-proven with the IN-04 code), no v1 rename route, mkdtemp-only tests, no control-character regex, vault-transit STATE.md append-only, no raw HTML, origin/main unchanged (`14c08c1f`), and every commit signed (parent 570e627a..HEAD 19/19 `G`, console 31ed738..316c5f9 13/13 `G`).

### Human Verification Required

None outstanding. The 11 UAT items are resolved in 45-HUMAN-UAT.md (10 pass; U10's issue is outside Phase 45 and tracked in the debug record).

### Gaps Summary

No gaps. Every roadmap success criterion has code, wiring and passing behavioural tests on the current code. The three backstop truths rest on operator observation of a build whose rendering files are unchanged. Deployed evidence: PATCH 403 with PATCH in the CORS preflight, bundle `db85439` carrying every Phase 45 marker plus the follow-up copy, and Legacy byte-identical. D-13 is refined, not reversed: the key is still chosen oldest first and deterministically, and keys GitHub reports in use elsewhere are now skipped. One ⚠️ Warning is recorded for a follow-up: on a transient listing error, the IN-04 cleanup can delete the `.pub` of a key that still exists.

---

_Verified: 2026-10-13T19:29:33Z_
_Verifier: Claude (gsd-verifier)_
