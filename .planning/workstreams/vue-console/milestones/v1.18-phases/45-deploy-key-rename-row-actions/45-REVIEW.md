---
phase: 45-deploy-key-rename-row-actions
reviewed: 2026-10-13T15:51:42Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - lib/thinx/rsakey.js
  - lib/router.rsakey.js
  - lib/middleware/cors.js
  - lib/thinx/github_link.js
  - spec/node/DeployKeyNames.test.js
  - spec/jasmine/03-RsakeySpec.js
  - spec/jasmine/GitHubLinkSpec.js
  - spec/jasmine/CsrfRouteInventorySpec.js
  - spec/jasmine/ZZ-CORSSpec.js
  - spec/jasmine/ZZ-RouterRSAKeySpec.js
  - spec/jasmine/ZZ-CSRFRouteGuardSpec.js
  - services/console/vue/src/pages/Rsakeys/Rsakeys.vue
  - services/console/vue/src/store/rsakeys.js
  - services/console/vue/src/core/api.js
  - services/console/vue/src/utils/keyNames.js
  - services/console/vue/src/styles/_deploy-keys.scss
  - services/console/vue/src/styles/theme.scss
  - services/console/vue/tests/unit/deploy-key-actions.cjs
  - services/console/vue/tests/unit/milestone-v116.cjs
  - services/console/vue/package.json
findings:
  critical: 1
  warning: 2
  info: 5
  total: 8
status: issues_found
---

# Phase 45: Code Review Report

**Reviewed:** 2026-10-13T15:51:42Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Scope: the parent diff `git diff cad3088d..c3f78558 -- lib spec` (11 files) and the console diff
`git -C services/console diff 604258c..31ed738` (9 files), listed above. I also read the code these files call, but did
not review it: `lib/thinx/github.js` (`addPublicKey`, `processPublicKeyRequest`), `lib/thinx/git.js` (key order and
fetch), `lib/middleware/csrf.js`, `lib/router.js` (method gating), `vue/src/utils/cookies.js` (`fetchWithCsrf`),
`vue/src/components/IconButton/IconButton.vue`, and the Legacy `DeploykeyController.js` / `views/deploykey.html`.

I checked these probes against the source, in a scratch directory with `ENVIRONMENT=development` and a throwaway
`HOME`. The real `~/.ssh` was not touched.

Checks that pass:
- The rename route is owner-bound. `filename` must be exactly one of `getKeyPathsForOwner(owner)`. A foreign,
  traversing, `.pub` or claim-only name all get the same `key_not_found`. The private half is never opened.
- `replacePublicKey` creates its temp file with `wx` (O_EXCL, so it will not follow a planted symlink), keeps the mode,
  and removes the temp file on failure. `revokeAllForOwner` removes leftover temp files, and `KEY_FILENAME` never
  matches them.
- `PATCH /api/v2/rsakey` carries `csrf.verifyCsrfToken` and is in the inventory spec. CORS now allows PATCH. No other
  middleware keeps a method list that would skip PATCH. `api.js` passes a 400 `{success:false, response, reason}` body
  through unchanged, so the Vue reason sentences are reachable.
- `utils/keyNames.js` matches `RSAKey.validateKeyName` code unit for code unit.
- Rendering is safe. There is no `v-html`. The key name in the delete confirmation is passed to `msgBoxConfirm` as a
  string. `dir="auto"` and `unicode-bidi: isolate` keep a right-to-left name in its own cell.
- `LC_ALL=C node tests/unit/deploy-key-actions.cjs` passes.
- The Legacy console does not read `fingerprint`, so the D-01 format change does not affect it.

Main concerns:
- The GitHub link path this phase changed reaches `GitHub.addPublicKey`. That function logs the user's GitHub access
  token in an `Authorization` header (CR-01). The bug predates this phase.
- D-13's "oldest key" choice pins a damaged oldest key permanently. GitHub's 422 for it is then reported as
  `key_pushed: true` (WR-01).
- The owner-binding, private-key-untouched and temp-file tests exist only in `test:deploykeys`, which CI never runs
  (WR-02).

`45-UI-REVIEW.md` already covers these, and I confirmed each in the code, so they are not repeated as findings:
- Focus is lost and the table flashes `Loading…` after every mutation (`Rsakeys.vue:267`). This breaks UI-K07's "focus
  returns to the row's Rename button".
- A name the server refused can be resubmitted.
- Each delete fetches the list twice.

## Critical Issues

### CR-01: Linking a GitHub account writes the user's GitHub access token to the API log (pre-existing, on the path this phase changed)

**File:** `lib/thinx/github.js:73-87` (reached from `lib/thinx/github_link.js:66-67, 83`)
**Issue:** `addPublicKey` builds `options.headers.Authorization = "Bearer " + token` and then runs
`console.log("[github] calling", options, body)`. Node prints the nested headers object in full, so every successful
`POST /api/v2/github/token` link writes a freshly validated, live GitHub token to stdout. The token can add SSH keys to
the account, and stdout is the `thinx_api` service log. That log can be read by anyone with Docker API access, and
Swarmpit shows service logs in its UI. The code dates from `9a5095af` and is not part of this diff. But this phase
rewrote the caller (`github_link.js` step 3), and every link that pushes a key goes through it.
Failure scenario: a user links GitHub in the console. `docker logs` on the API task then shows
`Authorization: 'Bearer gho_…'`. Anyone who can read service logs can add their own SSH key to that user's GitHub
account. Nothing redacts it: `console.log` is not overridden anywhere in `lib/`.
**Fix:** Never log the request options. Log only what is safe:
```js
console.log("[github] adding public key", { hostname: options.hostname, path: options.path, title: "THiNX Key" });
```
Remove the `console.log(d)` / `console.log('headers:', res.headers)` lines in `processPublicKeyRequest` (`:41-48`) too.
GitHub's error bodies there can echo request data.

## Warnings

### WR-01: GitHub linking now permanently selects a damaged oldest key, and GitHub's 422 for it is reported as `key_pushed: true`

**File:** `lib/thinx/github_link.js:19-35, 80-83`; `lib/thinx/github.js:53-55`
**Issue:** `oldestKey` only requires `pubkey` to be a non-empty string. `list()` keeps an unparseable PEM `.pub` "as
stored" (`rsakey.js:207-212`) and gives it `fingerprint: null`. The oldest keys are the PEM-era ones, which are the
ones most likely to be damaged (38-REVIEW IN-03 was about exactly that case). `processPublicKeyRequest` treats any 422
as success (`if (res.statusCode === 422) valid_state = true`), and GitHub answers 422 to an invalid key.
I checked this against the source. With `list = [{filename: owner-2000, pubkey: "ssh-rsa GOOD", fingerprint: "SHA256:x"},
{filename: owner-1000, pubkey: "-----BEGIN PUBLIC KEY-----\nGARBAGE", fingerprint: null}]`, `link()` pushed the PEM
garbage and not the good key.
Failure scenario: an owner has a damaged 2018 PEM key and a working 2026 key. They link GitHub. The PEM text is sent,
GitHub answers 422, and the API reports `{key_pushed: true}`. The account gets no key. Before this phase the owner
could recover by generating a new key, because the newest key was pushed. Now the oldest is pushed every time, so
generating keys never helps. The only way out is to find and delete the broken key, and nothing on the page marks it
(its fingerprint shows `—`).
**Fix:** Pick only keys `list()` could fingerprint, and stop counting a 422 as a push:
```js
if (!entry || typeof entry.pubkey !== "string" || entry.pubkey.length === 0 || !entry.fingerprint) continue;
```
In `processPublicKeyRequest`, report success only for 201 and for the "key is already in use" case. Read that from
`json_data.errors[0].message`, because `errors` is an array and the current `json_data.errors.message` is always
`undefined`.

### WR-02: The phase's security tests (owner binding, private key untouched, temp-file cleanup) are not run by CI

**File:** `package.json:37`, `.circleci/config.yml:810-830`, `spec/node/DeployKeyNames.test.js:374, 429, 458, 473`
**Issue:** CI runs `npm test` (jasmine) in the api container, plus a few named `node --test` files (`:688`, `:700`).
`test:deploykeys` is in neither, and `test:node` does not include `DeployKeyNames.test.js`. These tests exist only
there:
- "rename refuses foreign, traversing, absolute, .pub, unknown and claim-only names" (T-45-01/02)
- "rename never opens, reads, writes, chmods or removes the private key" (D-04, T-45-05, the vault-transit Phase 40
  safety contract)
- "a failed .pub replace … leaves no temp file" (T-45-06)
- "account deletion also removes the owner's leftover rename temp files"

The jasmine additions cover only the happy path, a bidi name and one unknown filename (`ZZ-RouterRSAKeySpec.js`,
`03-RsakeySpec.js (14)`).
Failure scenario: vault-transit Phase 40 rewrites private-key storage in `rsakey.js` (D-15). Suppose a refactor makes
`rename()` touch the private half, or makes it accept another owner's filename. CI goes green, and the SUMMARY's
"34 pass" was a manual run.
**Fix:** Add `spec/node/DeployKeyNames.test.js` to `test:node` and run it in CI next to `CiPipelineGates.test.js`. It
already isolates `HOME` and needs no services, so it can run on the host:
`node --test spec/node/DeployKeyNames.test.js`.

## Info

### IN-01: The name validator still admits U+061C (ARABIC LETTER MARK), invisible-only names and lone surrogates

**File:** `lib/thinx/rsakey.js:26-33, 135-145`; `services/console/vue/src/utils/keyNames.js:13-20`
**Issue:** I ran each of these through the validator and `rename()`:
- `validateKeyName("a\u061Cb")` returns `{ok: true}`. U+061C is one of the 12 Unicode `Bidi_Control` characters, next
  to LRM/RLM. D-06 lists the other 11.
- `validateKeyName("\u200B\u2060")` returns `{ok: true}`. `trim()` does not remove zero-width characters, so a name
  made only of them is accepted. The row then shows a blank name, the checkbox is labelled `Select `, and the
  confirmation reads `Delete the deploy key ""?`.
- `rename(owner, f, "ab\uD800")` succeeds and stores `ab\uFFFD`, because a lone surrogate becomes U+FFFD in UTF-8.
  The response name is truthful, but it is not what was sent.

**Fix:** In both copies, add `c === 0x061C` to the `bidi` branch. Count a name as `empty` when it has no visible
character, for example by also stripping U+200B–U+200D, U+2060 and U+FEFF before the length check. Reject an unpaired
surrogate as `control_chars`.

### IN-02: Renaming a key to `thinx-<its timestamp>` succeeds but the name is never shown

**File:** `lib/thinx/rsakey.js:114-120`, `services/console/vue/src/pages/Rsakeys/Rsakeys.vue:237-258`
**Issue:** `storedName` hides a comment equal to `"thinx-" + timestamp`, which is the generated default. `rename()`
writes it anyway and answers success with `name` set to the date (verified: renaming `<owner>-1700000000000` to
`thinx-1700000000000` returns success with name `Tue Nov 14 2023 …`). The console shows "Deploy key renamed", and the
row keeps its date.
**Fix:** Have `rename()` (and `create()`) refuse that exact name with a reason, or have `storedName` show it whenever
the file was renamed. The first is simpler: `if (name.trim() === "thinx-" + timestamp) return callback(false, "invalid_key_name", "reserved")`,
plus a `reserved` sentence in `keyNames.js`.

### IN-03: A key that is gone, or that cannot be renamed, gets "Try again." forever and the list is never reloaded

**File:** `services/console/vue/src/pages/Rsakeys/Rsakeys.vue:173, 262`
**Issue:** These answers are final, but the page treats them as transient:
- Rename answers `404 key_not_found` when the key was deleted elsewhere, and `500 rename_failed` for a `.pub` that is
  neither PEM nor `ssh-`.
- Row delete of a key already deleted elsewhere gets `success: false`, because `revokeUserKeys` returns `[]` when the
  owner still has other keys.

Both show "Could not … Try again." and leave the stale row in place. Retrying can never succeed.
**Fix:** On `response === 'key_not_found'` (rename) or any delete failure, call `loadData()` so the stale row
disappears. Use distinct copy for `rename_failed` ("This key cannot be renamed.").

### IN-04: The "revoked meanwhile" check in `rename()` can never fire

**File:** `lib/thinx/rsakey.js:401-403`
**Issue:** `rename()` is fully synchronous, so no revoke in this process can run between `replacePublicKey` and
`exportKeysForList`. And `exportKeysForList([filename])` only reads the `.pub` that `renameSync` has just written.
Consider another API process sharing the gluster volume (`git.js:144-146` names that setup). If it revokes the pair
after the `key_paths` check, `renameSync` re-creates the `.pub` as a non-empty orphan. The check then still finds it
and returns success. `sweepStaleClaims` never removes that orphan, because it only removes empty ones.
**Fix:** Drop the branch, or make it meaningful by checking the private half after the replace and removing the `.pub`
you just wrote if the private half is gone:
`if (!fs.existsSync(this.ssh_keys + "/" + filename)) { try { fs.unlinkSync(pub_path); } catch {} return callback(false, "key_not_found"); }`.

### IN-05: Stale comment on list order after D-13

**File:** `lib/thinx/rsakey.js:226-229`
**Issue:** The comment says "git.js/github_link push the first key (38 WR-01)". Since this phase, `github_link` pushes
the oldest key whatever the order is. `git.js` uses `getKeyPathsForOwner` (directory order) plus the Redis last-good
key, and never reads `list()`. A later reader could "fix" the sort to change GitHub behaviour and break nothing that
the comment names.
**Fix:** Change the comment to say the order serves the consoles only: github_link chooses by timestamp itself
(D-13), and git.js does not use `list()`.

---

_Reviewed: 2026-10-13T15:51:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
