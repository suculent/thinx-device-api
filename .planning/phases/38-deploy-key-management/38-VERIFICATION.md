---
phase: 38-deploy-key-management
verified: 2026-10-12T14:44:00Z
status: passed
score: 8/8 must-haves verified
covered_files: [".planning/phases/38-deploy-key-management/38-01-PLAN.md", ".planning/phases/38-deploy-key-management/38-01-SUMMARY.md", "lib/router.rsakey.js", "lib/thinx/rsakey.js", "services/console/src/app/js/controllers/DeploykeyController.js", "services/console/src/app/js/thinx-api.js", "services/console/src/app/views/deploykey.html", "services/console/src/test/deploykey.cjs", "services/console/vue/src/Routes.js", "services/console/vue/src/components/Sidebar/Sidebar.vue", "services/console/vue/src/pages/Rsakeys/Rsakeys.vue", "services/console/vue/src/store/rsakeys.js", "services/console/vue/tests/unit/milestone-v116.cjs", "spec/node/DeployKeyNames.test.js"]
covered_digest: "v3:sha256:13ec6815ff40ca5c29071a58bae58d8378c30b6ed9d1c3abca397d30ef0f5d33"
behavior_unverified: 0
overrides_applied: 0
coincidental_reliance_items:
  - truth: "Vue Deploy Keys list is sorted newest first by generation time"
    reason: incidental-ordering
    harden: "rsakeys/saveItems re-sorts by `date`, a whole-second Date.toString(). Keys created in the same second keep the backend's millisecond order only because Array.prototype.sort is stable and the API already sorted them (rsakey.js exportKeysForList, 38 WR-01). Sort the store by the millisecond timestamp in `filename` instead (create() now also returns `created`, but list() does not), and add a same-second case to milestone-v116.cjs."
---

# Phase 38: Deploy Key Management Verification Report

**Phase Goal:** KEY-01: name deploy keys before generation in Vue and Legacy, with names persisting across reload. KEY-02: the Vue page is labelled Deploy Keys, sorted by generation time, and shows/copies each public key. KEY-03: Legacy key-generation response handling, list refresh and error notification.
**Verified:** 2026-10-12T14:44:00Z
**Status:** passed
**Re-verification:** No. This replaces the 2026-10-09 prose report, which had no frontmatter status and listed live acceptance as pending. Its local evidence is kept below where it is still accurate.

ROADMAP Phase 38 has no Success Criteria and the plan has no `must_haves`, so the truths below come from the KEY-01..03 requirement text (REQUIREMENTS.md lines 13-15).

**Code state verified:** parent `1dc24437` (thinx-staging; includes 58027c18, 666e5bf5, f3845d58 and **7c8fe41a**). 7c8fe41a landed at 14:42Z, while this verification was running, and fixes 38-REVIEW WR-03..06 and IN-05. Everything below was re-run against it. Console `ff6e809` (contains 956a7a2, 295c83a, c47cd21; on `origin/thinx-staging`).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Vue: a deploy key is named before it is generated (KEY-01) | ✓ VERIFIED | Rsakeys.vue: `Key name` input (`maxlength=120 required`) in the form; Generate is disabled while the name is blank. `create()` passes `keyName.trim()` to `rsakeys/createItem`, which PUTs `/rsakey` with body `{ name }`. router.rsakey.js reads `req.body.name` for PUT. milestone-v116.cjs:256 asserts the body is `{name:'Firmware'}`; :310-313 cover the success and failure paths. UAT test 1 passed live. |
| 2 | Legacy: a deploy key is named before it is generated (KEY-01) | ✓ VERIFIED | deploykey.html: `Key Name` input (`ng-model="deploykeyName"`, maxlength 120, required); Create is disabled while it is blank or a request is running. `createDeploykey()` sends the trimmed name; thinx-api.js `createDeploykey(name)` sends GET `/user/rsakey/create` with `data:{name}`; the router reads `req.query.name` for GET. src/test/deploykey.cjs asserts `sentName==='Firmware'` from the input `' Firmware '`. UAT test 5 passed live. |
| 3 | Names persist across reload (KEY-01) | ✓ VERIFIED | rsakey.js writes the name as the OpenSSH public-key comment (`toOpenSSH(publicKey, name \|\| "thinx-"+date)`), and `exportKeysForList` reads it back as `name`. Unnamed or old keys fall back to the date. Spot-check on 7c8fe41a: real RSA-4096 keygen through `create()` with the name `'  My Firmware Repo  '`, then `list()` from a fresh RSAKey instance, returned `My Firmware Repo`; the unnamed key got its date. The create response `filename` is now the bare `<owner>-<ts>`, not an absolute path. Filenames never contain the name. DeployKeyNames test 1 passes. UAT test 1 confirmed the name survives a page reload. |
| 4 | The Vue page and menu are labelled "Deploy Keys" (KEY-02) | ✓ VERIFIED | Rsakeys.vue h1 `Settings - Deploy Keys`; Sidebar.vue:53 `{ header: 'Deploy Keys', link: '/app/rsakeys' }`; Routes.js:96 `name: 'Deploy Keys'`. UAT test 2 passed live. |
| 5 | The Vue list is sorted newest first by generation time (KEY-02) | ✓ VERIFIED (coincidental-reliance) | The API sorts by the millisecond timestamp in the filename (rsakey.js `createdAt`, f3845d58). DeployKeyNames "within the same second" (WR-01) passes. The Vue store re-sorts by `date` (whole seconds) with a stable sort, so same-second ties keep the API order. That holds only incidentally; see coincidental_reliance_items. The milestone-v116.cjs saveItems test checks only distinct dates. UAT test 2 passed live, on the backend before f3845d58. |
| 6 | Vue shows and copies each public key (KEY-02) | ✓ VERIFIED | Each row has `Show key` (`showKey(item)` opens `rsakey-result-modal` with a readonly textarea of `item.pubkey`) and `Copy key` (`copyToClipboard(item.pubkey)`: navigator.clipboard, then an execCommand fallback, then an error message). After creation the new key is shown automatically. No unit test covers the clipboard. UAT test 2 confirmed live that the copied text is the full public key. |
| 7 | Legacy: generation responses are handled and the list refreshes (KEY-03) | ✓ VERIFIED | DeploykeyController: `dataType:"json"` plus a string-to-JSON guard; the key is read from `response.response \|\| response.status`; `deploykeyCreated = key.date \|\| key.name` (now a `Date.toString()` after WR-06, still a string); `$applyAsync()`; on success `deploykeyList()` emits `updateDeploykeys`. thinx-api.js `updateDeploykeys` handles string or object envelopes and ignores `success:false`. deploykey.cjs passes for parsed and string envelopes, with exactly one refresh and a digest. UAT test 5 confirmed live that the key appears without a manual refresh. |
| 8 | Legacy: a generation failure produces an error notification and re-enables Create (KEY-03) | ✓ VERIFIED (see WARNING) | `success:false`: `toastr.error("Error.")`, no refresh, `creatingDeploykey=false` (deploykey.cjs). HTTP failure (`.fail`, e.g. 400 `invalid_key_name`): a spot-check running the real controller source with a rejected deferred showed `toastr.error` called once, `creatingDeploykey=false` through `.always`, `xhrFailed` emitted and no refresh. **Silent path:** when the bound name is blank or undefined (Angular sets the model to undefined when maxlength/required fail), `createDeploykey()` logs `--creating deploy key--` and returns with no message. This matches the operator's observation in UAT test 6 after removing `maxlength`/`disabled` in DevTools. The unmodified UI cannot reach it: Create is disabled while `!deploykeyName.trim()`. The operator accepted it (legacy console is being deprecated). |

**Score:** 8/8 truths verified (0 present but behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/thinx/rsakey.js` | name as the pubkey comment, newest-first list, exact-filename revoke, claim-safe create, list()-shaped create response | ✓ VERIFIED | Wired via router.rsakey.js. Consumers: git.js (`getKeyPathsForOwner`, readdir order, unaffected by the sort) and github_link.js (`list[0]`, newest key, see IN-07) |
| `lib/router.rsakey.js` | optional `name` from body (PUT) or query (GET), 400 `invalid_key_name`; 400 `invalid_filenames` (7c8fe41a) | ✓ VERIFIED | Routes `/api/v2/rsakey` PUT/GET/DELETE and v1 `/api/user/rsakey/{create,list,revoke}`; mutating routes CSRF-guarded |
| `services/console/vue/src/pages/Rsakeys/Rsakeys.vue` | name input, list, show/copy, delete confirmation, load error | ✓ VERIFIED | Routed at `/app/rsakeys`; data comes from the `rsakeys` store |
| `services/console/vue/src/store/rsakeys.js` | fetch (throws on failure), create with name, delete, sort | ✓ VERIFIED | `$api.$get/$put/$delete('/rsakey')` |
| `services/console/src/app/js/controllers/DeploykeyController.js` | named create, response handling, refresh, error toast, reset | ✓ VERIFIED | Bound by deploykey.html |
| `services/console/src/app/views/deploykey.html` | name field, disabled Create, name in the list | ✓ VERIFIED | Shows `{{deploykey.name}} — Created on {{deploykey.date}}`; search covers name |
| `services/console/src/app/js/thinx-api.js` | `createDeploykey(name)`, robust `updateDeploykeys` | ✓ VERIFIED | |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| Rsakeys.vue `create()` | `PUT /api/v2/rsakey` | `rsakeys/createItem` → `$api.$put('/rsakey', {name})` | WIRED |
| Rsakeys.vue `loadData()` | `GET /api/v2/rsakey` | `rsakeys/fetchItems` (throws on `!success`) → `saveItems` → `getItems` → `items` → table | WIRED |
| Rsakeys.vue `deleteSelected()` | `DELETE /api/v2/rsakey` | confirm → `deleteItems(filenames)` (array of strings, passes the new WR-05 guard), where filename = item id | WIRED |
| DeploykeyController `createDeploykey()` | `GET /api/user/rsakey/create?name=` | `Thinx.createDeploykey(name)` | WIRED |
| DeploykeyController success | `$root.deploykeys` | `deploykeyList()` → `$emit("updateDeploykeys")` → `updateDeploykeys` | WIRED |
| router `createRSAKey` | `RSAKey.create(owner, cb, name)` | name validated in the router and again in create | WIRED |
| `RSAKey.generate` | `.pub` comment → `exportKeysForList().name` | `toOpenSSH(publicKey, name)` / comment regex | WIRED (round-trip spot-check) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
|----------|------|--------|-----------|--------|
| Rsakeys.vue table | `items` | `GET /rsakey` → `exportKeysForList` reads `<ssh_keys>/<owner>-<ts>.pub` (skips an empty `.pub` that is still being written) | yes | ✓ FLOWING |
| deploykey.html list | `$root.deploykeys` | `GET /user/rsakey/list` → same | yes | ✓ FLOWING |
| Show-key modal | `createdPubkey` | `item.pubkey` or the create response `pubkey` | yes | ✓ FLOWING |

### Behavioral Spot-Checks (run by this verifier, against 7c8fe41a / console ff6e809)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend deploy-key behavior | `npm run -s test:deploykeys` | **13/13 pass**. Names persist; trimmed name returned; invalid names refused; exact-filename delete and owner isolation; same-ms claim (IN-08); failed generation releases the claim; same-second newest-first (WR-01); fs error does not crash (WR-02); create returns the list() shape (WR-06); failed private write leaves nothing listed and existing pair untouched (WR-03); empty `.pub` not listed (WR-03); GDPR removes lone claims, stale claims swept and fresh ones kept (WR-04); non-array filenames ignored (WR-05) | ✓ PASS |
| Real keygen name round-trip | scratch script: `RSAKey.create(owner, cb, '  My Firmware Repo  ')`, second unnamed create, `list()` from a fresh instance, in a temp dir | names `['<date>', 'My Firmware Repo']`, newest first; create `filename` is bare `<owner>-<ts>` (not absolute) | ✓ PASS |
| Vue unit suite | `LC_ALL=C npm --prefix services/console/vue run -s test:unit` | "v1.16 regression checks passed: … deploy keys …" | ✓ PASS |
| Legacy controller | `node services/console/src/test/deploykey.cjs` | parsed/string envelopes, name, refresh, digest, failure reset pass | ✓ PASS |
| Legacy HTTP-failure path | scratch vm script running DeploykeyController.js with a rejected deferred (status 400) | `toastr.error`=1, `creatingDeploykey=false`, `xhrFailed` emitted, `.msg-warning` text `[object Object]` (35 IN-04) | ✓ PASS |
| Legacy client-invalid path | same script, `deploykeyName=undefined` | 0 notifications (silent) | ℹ matches UAT 6 note; unreachable without DOM edits |
| Parent node suite | `npm run -s test:node` | 43 pass, 0 fail, 0 skipped | ✓ PASS |

### Probe Execution

Not applicable: no probes are declared, and this is not a migration/tooling phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| KEY-01 | 38-01 | Name deploy keys before generation in Vue and Legacy; preserve names across reload | ✓ SATISFIED | Truths 1-3 |
| KEY-02 | 38-01 | Label Vue keys Deploy Keys, sort by generation time, show/copy each public key | ✓ SATISFIED | Truths 4-6 |
| KEY-03 | 38-01 | Fix Legacy key-generation response handling, list refresh, and error notification | ✓ SATISFIED | Truths 7-8 (warning on generic/silent client paths) |

No orphaned requirements: REQUIREMENTS.md maps only KEY-01..03 to Phase 38, and 38-01-PLAN declares all three.

### Live Acceptance (38-UAT.md, status complete)

6/6 pass. Test 4 (failed list load shows an error) was confirmed live with DevTools request blocking. Test 6 passed by operator decision; see truth 8 and the warning below.

**Live run predates two backend commits.** UAT finished at 14:29Z. Backend f3845d58 (14:36Z, WR-01/02) and 7c8fe41a (14:42Z, WR-03..06: private-first write order, empty-`.pub` skip, stale-claim sweep in `list()`, 400 on bad `filenames`, new create-response shape) came after it. Both are on `origin/thinx-staging`. They are proven by the 13 node tests and the round-trip above, and their client-visible changes are compatible with both consoles: Legacy reads `key.date || key.name`, which is still a string; Vue uses `name`/`pubkey` only. Their rollout to production was not checked here (no ssh, per constraints). A quick live create/list/delete after the API redeploy is recommended but not required by the goal.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase-modified files) | - | TBD/FIXME/XXX | none | Debt-marker gate clean |
| services/console/src/app/js/thinx-api.js | 425, 652 | `TODO` | ℹ Info | 2022 lines (git blame 60a0de4), not phase changes |
| DeploykeyController.js | 31 | early `return` with no message when the name is blank/undefined | ⚠️ Warning | Silent only after DOM tampering; operator-accepted (UAT 6) |
| DeploykeyController.js | 44-46, 66 | `key.date` throws if both `response.response` and `response.status` are missing (then `.always` is skipped and Create stays disabled); `.msg-warning` shows `[object Object]`; generic "Error." for `invalid_key_name` | ℹ Info | 35-REVIEW IN-03 / IN-04, open |
| lib/thinx/rsakey.js | `list()` → `sweepStaleClaims` | a GET now deletes empty, private-less `.pub` claims older than 10 min | ℹ Info | Intended (WR-04) and tested; side effect on a read path, owner-scoped |
| lib/thinx/github_link.js | 53-55 | `list[0]` is now the newest key | ℹ Info | 38-REVIEW IN-07, open |

38-REVIEW WR-03, WR-04, WR-05 and WR-06 (and IN-05) were open when this verification started. Commit 7c8fe41a fixes them, and the tests above verify each one; they are no longer warnings here.

### Code Review / Security / UI Cross-check

- 38-REVIEW.md: 0 blockers, 6 warnings, 7 info. WR-01/02 are fixed in f3845d58 and WR-03..06 plus IN-05 in 7c8fe41a (disposition commit 1dc24437); all are test-verified. Remaining info items (IN-01..04, IN-06 partly, IN-07) do not affect KEY-01..03.
- 38-SECURITY.md: `threats_open: 0`, 16 threats, 6 accepted below the high threshold. AR-38-02 (absolute path in the create response) and AR-38-03 (non-array `filenames` → 500) are now mitigated in code by 7c8fe41a. The register predates that commit and still lists them as accepted.
- 38-UI-REVIEW.md: 18/24, advisory. Its top fixes (Delete inside the Generate form, stale rows plus a doubled message on a failed reload, no pending state on delete) are UX polish, not goal gaps.

### Prior Evidence Retained (2026-10-09 report, still accurate)

- Vue and Legacy source CSP checks, Legacy XSRF/digest/scope checks, ESLint on changed backend/Vue files, Vue production build and Legacy `build:test` passed then. Not re-run here; the console deploy-key source has changed since only in 295c83a and c47cd21, which the unit suite covers.
- Superseded: "4 deploy-key tests" is now 13; "42 pass, 1 skip" is now 43/43; the "pending publication / live acceptance" gates are resolved (console and parent commits are on `origin/thinx-staging`; UAT 6/6).

### Documentation Drift (Info)

- ROADMAP.md Phase 38 still says "Release CI and browser/live acceptance pending". REQUIREMENTS.md lists KEY-01..03 as "locally verified". 38-01-SUMMARY.md says `verification_status: locally_verified`. All three are stale now that UAT is complete.

### Human Verification Required

None outstanding. Live acceptance is already recorded in 38-UAT.md (6/6). Optional: one live create/list/delete after the API image with 7c8fe41a is rolled out.

### Gaps Summary

There are no blocking gaps. Every KEY-01..03 behavior is in the code, wired end to end, covered by tests run in this verification against the current HEAD (including 7c8fe41a), and confirmed in live UAT. One caveat on KEY-03's "error notification": server failures show only a generic "Error." toast (35 IN-04), and a blank or invalid name that reaches `createDeploykey()` is dropped silently. The silent case can only be reached by editing the DOM, and the operator accepted it. Both are recorded as warnings. Neither is a goal failure: the unmodified UI prevents the silent case, and every server-side failure path shows a notification and re-enables Create.

---

_Verified: 2026-10-12T14:44:00Z_
_Verifier: Claude (gsd-verifier)_
