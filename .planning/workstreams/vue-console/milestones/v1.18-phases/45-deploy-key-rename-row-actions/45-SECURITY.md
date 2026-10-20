---
phase: "45"
slug: "deploy-key-rename-row-actions"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-13"
---

# Phase 45 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser (console origin) → API `PATCH /api/v2/rsakey` | untrusted JSON body under a cookie session plus XSRF header, or a verified Bearer token; crosses origins (console.thinx.cloud → API) | `filename`, `name` |
| browser → API revoke (`DELETE /api/v2/rsakey`, `POST /api/user/rsakey/revoke`) | untrusted array through the CSRF-guarded client | `filenames` |
| API → key directory (`/mnt/data/ssh_keys` on GlusterFS) | the rename rewrites a `.pub` next to the private keys that vault-transit Phase 40 will encrypt | `.pub` text, temp file |
| API → browser (key list, rename result) | the name is user-entered; `pubkey`, `fingerprint` and `reason` come back from the API and are rendered | `name`, `pubkey`, `fingerprint`, `date`, `filename`, `reason` |
| API → GitHub (user account keys) | GitHub linking pushes one of the owner's public keys with the user's token | public key line |
| planning record → other workstream | vault-transit reads the D-15 note before Phase 40 | `vault-transit/STATE.md` bullet |
| local branches → origin `thinx-staging` | the console branch and the shared parent branch reach production through CircleCI and Swarmpit | signed commits, parent gitlink |
| CircleCI → private registry → swarm | pipeline 5666 built the API and Vue images that Swarmpit rolled out | images |
| executor / auditor → production, CircleCI, GitHub | unauthenticated GETs, OPTIONS preflights and credential-free `PATCH {}` only | status codes, CORS header lines, public bundle, Legacy files, job list, branch heads |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-45-01 | Tampering | rename `filename` (path traversal) | high | mitigate | `lib/thinx/rsakey.js:14` `KEY_FILENAME` = `^([0-9a-f]{64})-\d+(\.pub)?$`; `:167-174` `getKeyPathsForOwner` keeps only readdir names whose captured owner equals `owner` and that do not end in `.pub`; `rename` `:390` requires a string that `key_paths.includes()`, and only then `:391` builds `pub_path` from that member (temp path `:411` likewise, plus random hex). No untrusted string is joined into a path. N3 `spec/node/DeployKeyNames.test.js:374-398` feeds foreign, `../<mine>`, absolute, `<mine>.pub`, unknown, `5`, `null`, claim-only and pending names: each answers `key_not_found` and a byte snapshot of the directory is unchanged. Auditor re-run `test:deploykeys` 34/34 (CI does not run this file, see N-5) | closed |
| T-45-02 | Elevation of privilege | rename of another owner's key (IDOR) | high | mitigate | `lib/router.rsakey.js:42` owner = `sanitka.owner(req.session.owner)`; `body.owner` is never read, and `lib/router.js:184` limits body API-key auth to POST, so a PATCH carries a session or verified-Bearer owner only. `KEY_FILENAME` captures exactly 64 hex and must equal that owner. Foreign, unknown and traversing names all get 404 `key_not_found` (`router.rsakey.js:53`). The name is checked before membership (`:48-49`), so a bad name answers 400 whatever the filename. `rename_failed` (500) is only reachable after the owner's own membership check. Router harness `DeployKeyNames.test.js:537-546` (foreign → 404, the other owner's `.pub` byte-identical); `ZZ-RouterRSAKeySpec` "unknown filename" asserts the exact 404 body | closed |
| T-45-03 | Spoofing | cross-site PATCH (CSRF); CORS method list | high | mitigate | `router.rsakey.js:107` `app.patch("/api/v2/rsakey", csrf.verifyCsrfToken, …)`; `lib/middleware/csrf.js:423-477` is method-agnostic (double-submit plus session binding; exempt only for a verified Bearer, or a cookieless API key, which is POST-only); harness asserts `handlers[0].name === 'verifyCsrfToken'` (`DeployKeyNames.test.js:520-521`); `CsrfRouteInventorySpec.js:57` GUARDED row (auditor re-run Inventory + CORS + GitHubLink 98 specs / 0 failures); `ZZ-CSRFRouteGuardSpec.js:129` cookie-only refusal row and `:357` Bearer row. CORS: in `cad3088d..c3f78558` the only change to `lib/middleware/cors.js` is the `ALLOWED_METHODS` constant (`:24`). The origin logic (`:39-49`) and `lib/thinx/origins.js` are unchanged, and there is no method-override middleware. Live (auditor, no credentials): `PATCH {}` on rtm and console → 403 `{"success":false,"response":"csrf_token_invalid"}`; preflight with `Origin: https://console.thinx.cloud` → ACAO echoes console, methods `GET,PUT,POST,DELETE,PATCH,OPTIONS`; preflight with `Origin: https://evil.example` → 200 with no `Access-Control-*` header | closed |
| T-45-04 | Spoofing | hostile names (bidi override, U+2028/U+2029, C0/DEL/C1) | medium | mitigate | One validator, `rsakey.js:26-33` + `:135-145`: refuses C0 (< 0x20), DEL, C1 (0x80-0x9F) → `control_chars`; U+2028/U+2029 → `line_separator`; U+202A-202E, U+2066-2069, LRM U+200E, RLM U+200F → `bidi`; every code unit is scanned before trimming, then empty / > 120 checks. Called by `create` `:554`, `rename` `:382`, router create `router.rsakey.js:18` and router rename `:48`; refusals answer 400 `invalid_key_name` + `reason` (`:28-31`). D-08 `storedName` `rsakey.js:114-121` lists a stored comment only when it passes the validator on a single-line `ssh-` key, else the date. Exhaustive 0x0000-0xFFFF classification `DeployKeyNames.test.js:331-343`; D-08 table `:603-626`. See Auditor Note N-1 (U+061C) | closed |
| T-45-05 | Tampering | private key file during rename (vault-transit Phase 40) | high | mitigate | `rename` (`rsakey.js:381-405`) never builds the private path: it lists the directory (`:386`), reads `<filename>.pub` (`:394`), and `replacePublicKey` (`:410-425`) only stats the `.pub` and writes/chmods/renames/unlinks its own temp file; the re-read `exportKeysForList` reads `.pub` only (`:197`). N4 `DeployKeyNames.test.js:429-457` wraps 33 `fs` / `fs-extra` functions, locks the private file at mode 000 and asserts zero calls on its path and unchanged mode, mtime and bytes (spy self-test included). `03-RsakeySpec` (14) renames a real generated key and compares the private bytes (auditor re-run: Ran 17 of 18, 0 failures); N4 is not run in CI, see N-5 | closed |
| T-45-06 | Denial of service | partial `.pub` write breaks a key | medium | mitigate | `rsakey.js:411` dot-prefixed temp `.<filename>.pub.<12 hex>.tmp` in the same directory (same filesystem, so the rename is atomic); `:413` mode taken from the `.pub`; `:414` `wx` with that mode; `:415` chmod against the umask; `:416` `renameSync` over the `.pub`; `:418-423` the temp file is unlinked on failure (except EEXIST, not ours); `:259-265` `revokeAllForOwner` also removes `RENAME_TEMP` leftovers (`:18`). Key tokens are copied verbatim (`:164`), PEM through forge (`:154`). Tests `:345-361` (0640 kept, no temp left), `:362-373` (PEM, same key material), `:458-472` (EIO → `rename_failed`, snapshot unchanged), `:473-484` | closed |
| T-45-07 | Repudiation | one-time fingerprint change (D-01) | low | accept | See Accepted Risks Log AR-45-01. Auditor check of the rationale: at `604258c` the Vue store's fingerprint header is commented out and the page has no fingerprint column, and the Legacy `DeploykeyController.js` / `deploykey.html` contain no `fingerprint`. The new value is `SHA256:` over the blob (`rsakey.js:101-106`) and equals GitHub's published vector and `ssh-keygen -lf` (F1, F2 pass, not skipped) | closed |
| T-45-08 | Information disclosure | error replies and logs | low | mitigate | Router refusals are fixed codes (`router.rsakey.js:40`, `:43`, `:46`, `:53`, `:54`), and `reason` comes from the validator's closed set of five; no path, filename or name is echoed. `git diff cad3088d c3f78558 -- lib` adds no `console.` line | closed |
| T-45-09 | Information disclosure | test fixtures and the developer's `~/.ssh` | medium | mitigate | `DeployKeyNames.test.js:12-15` sets `HOME` to an `mkdtemp` directory before the first `lib/` require (`:17`); `:27-29` asserts `ssh_keys` is `TEST_HOME/.ssh` (`globals.js:296` resolves `$HOME/.ssh`); every fixture is `mkdtemp` + `rmSync`; `clearRouterKeys` (`:513-516`) only empties `TEST_HOME/.ssh`. `03-RsakeySpec` uses `mkdtemp` (`:16`, `:20`). The auditor ran both with `HOME` and `TMPDIR` in a scratch directory: no `thinx-home-*` or `rsakey-spec-*` left, and the real `~/.ssh` holds 0 files of the `a…`/`b…` fixture owners | closed |
| T-45-10 | Tampering | concurrent rename and revoke of the same key | low | accept | See Accepted Risks Log AR-45-02. Auditor check of the rationale: `getKeyPathsForOwner` excludes `.pub` names (`rsakey.js:170`), so a lone `.pub` is never listed, and `revokeAllForOwner` `:262-265` deletes it. See Auditor Note N-4 | closed |
| T-45-11 | Elevation of privilege | GitHub linking pushes a repository-specific key as the account-wide key | medium | mitigate | `lib/thinx/github_link.js:19-35` `oldestKey` picks the smallest filename timestamp among entries with a non-empty string `pubkey`; untimestamped entries go last and ties keep list order. `:81-83` pushes `oldest.pubkey`. The diff in range touches only this step; the token, collaborators and result shape are unchanged. `GitHubLinkSpec` G1-G5 (`:108-145`) in the auditor's 98/0 run. See Auditor Notes N-2 (pre-existing token log in `github.js`) and N-6 | closed |
| T-45-12 | Repudiation | revoke reports a key twice | low | mitigate | `rsakey.js:181` `for (const filename of new Set(revoked_filenames))`; the owner-membership check (`:182`) and the envelope are unchanged; D1 `DeployKeyNames.test.js:663-676`, D2 `:678-698` (v2 and v1 report `[f]`), `03-RsakeySpec` (04b) | closed |
| T-45-13 | Tampering | revoke with malformed `filenames` | low | mitigate | `router.rsakey.js:79` answers 400 `invalid_filenames` to a non-array or a non-string element; library guard `rsakey.js:178` kept; D2 sends `null`, `5`, `{}` to the v2 DELETE and the v1 POST: 400 each, nothing deleted | closed |
| T-45-14 | Information disclosure | ZZ rename specs and the dynamic CI user | low | mitigate | `ZZ-RouterRSAKeySpec.js` new cases reuse the existing dynamic `jwt` (`:73`); no `console.` line is added to either ZZ spec in range; the round trip creates `P45 router`, renames it and revokes exactly `[renamed.filename]`; the bidi and unknown-filename cases address only that key or an all-zero owner; the CSRF C2 PATCH uses `ZERO_OWNER + "-0"` | closed |
| T-45-15 | Tampering | edits to another workstream's STATE.md | low | mitigate | `git diff 3ba49571 HEAD --numstat -- .planning/workstreams/vault-transit/STATE.md` = 1 added, 0 removed; the only commit touching it is `ccf4800e` (signed) | closed |
| T-45-16 | Tampering | key name, pubkey and fingerprint rendering (stored XSS) | high | mitigate | `services/console/vue/src/pages/Rsakeys/Rsakeys.vue`: `v-html` 0, and no `innerHTML` / `domProps` in Rsakeys, IconButton, `store/rsakeys.js` or `utils/keyNames.js`. Name `:27` is `{{ item.name }}` with bound `:title`, fingerprint `:29` and key text `:38` are interpolations; both confirm messages are plain strings passed to `msgBoxConfirm` (`:163`, `:190`); modal titles are the text `title` prop. `dir="auto"` `:27` with `unicode-bidi: isolate` in `_deploy-keys.scss:10-16`. In-test raw-HTML gate `tests/unit/deploy-key-actions.cjs:1166`; B2 passes (auditor `test:unit` 244 ok / 0 FAIL) | closed |
| T-45-17 | Denial of service | accidental or double delete | high | mitigate | `deleteRow` `Rsakeys.vue:158-177` returns while `confirming` or the row is deleting, confirms by name with `autoFocusButton: 'cancel'` (`Keep key`), re-checks after the dialog and pushes the id into `deletingIds` before the request; `deleteSelected` `:180-211` uses the same guard plus `bulkDeleting`, and skips ids already in flight (`:182`, `:196`); every row control is `:disabled="isDeleting(item)"`. A2-A4 and C3 pass (one dialog, one request for two clicks) | closed |
| T-45-18 | Tampering | acting on stale rows after a failed reload | medium | mitigate | `loadData` `Rsakeys.vue:266-283`: on failure it empties `items`, `selectedIds` and `shownIds` and sets `loadFailed`; the table (`:20` `v-else-if="!loadFailed"`) and toolbar (`:14`) are hidden behind the single alert (`:12`). On success the selection and open keys are pruned to listed ids. C4, C5 pass | closed |
| T-45-19 | Information disclosure | public key text and clipboard | low | accept | See Accepted Risks Log AR-45-03 | closed |
| T-45-20 | Spoofing | cross-site rename (CSRF), client side | high | mitigate | `vue/src/core/api.js:145` `$patch` → `request('PATCH', …)`; `:100-102` every non-GET goes through `fetchWithCsrf` (`utils/cookies.js:104-107` sets `X-XSRF-TOKEN`); `store/rsakeys.js:75-77` `renameItem` uses `$patch`; K2 `deploy-key-actions.cjs:886-926` asserts the header on a PATCH with the real `cookies.js`. Server guard: T-45-03 | closed |
| T-45-21 | Tampering | client-side validation bypass | medium | mitigate | The server validates every name independently (router `:48` and `rsakey.rename` `:382`; T-45-04). The client mirror `vue/src/utils/keyNames.js` agrees with the server: the auditor compared the two exhaustively (every UTF-16 unit in four positions, plus non-strings and the length bounds) and found 0 differences. A server `invalid_key_name` reason is always shown (`Rsakeys.vue:257-260`, create `:119-139`); K7, G2 pass | closed |
| T-45-22 | Spoofing | bidi or separator characters in the dialog and the table | medium | mitigate | Refused before sending: `saveRename` `Rsakeys.vue:239`, Save disabled on `renameClientReason` (`:62`), Generate disabled on `createNameValid`; names render as text with `dir="auto"` + `unicode-bidi: isolate` (T-45-16); `keyNameMessage` maps a reason through an own-property lookup (`__proto__`, `constructor`, `toString` give the generic sentence, auditor-checked). K6, G1 pass | closed |
| T-45-23 | Denial of service | double-submitted rename | low | mitigate | `saveRename` `Rsakeys.vue:237-263` returns while `renaming`; the field, Keep current name and Save are disabled while pending (`:56`, `:61`, `:62`); `onRenameHide` `:227-229` prevents hide while renaming; an unchanged name closes without a request. K6, K8 pass | closed |
| T-45-24 | Information disclosure | rename error copy | low | accept | See Accepted Risks Log AR-45-04. Auditor check: the request error is the fixed `Could not rename the deploy key. Try again.` (`Rsakeys.vue:262`), and server reasons only select one of five fixed sentences | closed |
| T-45-25 | Tampering | shared parent `thinx-staging` branch | high | mitigate | Auditor re-check of `cad3088d..c3f78558`: 21 commits, all `%G?` = `G`, 0 merges, fast-forward (`cad3088d` is an ancestor). Outside `.planning/` it changes only `services/console` and the eleven Phase 45 paths (4 `lib/`, 7 `spec/`). The gitlink at `c3f78558` is `31ed7383`. No rebase was needed (origin was still `cad3088d`). Public GitHub API: parent `thinx-staging` = `c3f78558` (verified), `main` = `14c08c1f` (unchanged). The four later local commits `c3f78558..0106baa0` (`ad437882`, `1acfc0a8`, `570e627a`, `0106baa0`) are `.planning/`-only, signed and unpushed | closed |
| T-45-26 | Tampering | console `thinx-staging` branch | medium | mitigate | `604258c..31ed738`: 10 commits, all `G`, 0 merges, fast-forward; exactly the nine Phase 45 Vue paths; no Legacy `src/` path; public GitHub API: console `thinx-staging` = `31ed7383` (verified), console `main` = `a0e86707` | closed |
| T-45-27 | Denial of service | production API and Vue console after rollout | high | mitigate | The preflight is recorded in 45-05 SUMMARY before any push. The auditor re-ran `test:deploykeys` (34/34), `03-RsakeySpec` (17/0), Inventory + CORS + GitHubLink (98/0), console `test:unit` (244 ok / 0 FAIL) and `test:csp:dist` (PASS on the 17:33 dist, built after `31ed738`). `check-ci-gates.js pipeline --revision c3f78558 --expect legacy-off` → `CI-GATES PIPELINE OK 5666` (test, api-registry, vue-console-registry success; no snyk-* or console-classic-*). Live `console.thinx.cloud/js/app.js`: 3179608 bytes, id `c3f7855` ×2; `rsakey-rename-modal` 5, `Deploy key renamed`, `key-bulk-delete`, the bidi sentence, the fingerprint tip and the load error each 1; the three replaced strings 0. Legacy `main.js`, `LogviewController.js`, `DeploykeyController.js`, `deploykey.html` and `thinx-api.js` re-fetched: all five sha256 equal the pre-deploy baseline. Filenames never change, so `git.js` (`keyNamesForOwner`, filenames only) keeps finding keys. Rollback: revert `c3f78558` on thinx-staging | closed |
| T-45-28 | Repudiation | pushed commits | medium | mitigate | `%G?` = `G` on all 10 console commits, all 21 parent outgoing commits and the bump `c3f78558`; `commit.gpgsign=true` in both repos; GitHub reports both pushed heads `verified: true` | closed |
| T-45-29 | Information disclosure | verification probes and evidence | medium | mitigate | `scripts/check-ci-gates.js` has no `process.env`, `Circle-Token` or `Authorization` (count 0). A scan of 45-01..05 SUMMARY for JWT, Bearer, `Authorization:`, `Cookie:`, `Set-Cookie`, `XSRF-TOKEN=`, session ids, `Circle-Token`, `password=` and env-dump commands found only the dummy test values `p43dummy` / `p45dummy`. Evidence is status codes, CORS header lines, hashes, sizes and marker counts | closed |
| T-45-30 | Tampering | the credential-free PATCH probe | low | accept | See Accepted Risks Log AR-45-05. Auditor re-probe: 403 `csrf_token_invalid` on both hosts, refused before the handler | closed |
| T-45-SC | Tampering | npm/pip/cargo installs (45-01 … 45-05) | low | mitigate | Parent range `cad3088d..c3f78558` changes no `package*.json`, lock or shrinkwrap file; `rsakey.js` drops `require("sha256")` for node `crypto` (`:4`) and the dependency stays declared. Console `604258c..31ed738`: the `vue/package.json` diff is the one `test:unit` line (`&& node tests/unit/deploy-key-actions.cjs`); no lock file changed. The auditor ran npm scripts only, no install | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-45-01 | T-45-07 | The listed fingerprint changed once for every key, from a SHA-256 of the stored text to the OpenSSH `SHA256:` value. Neither console displayed the old value, and the new one matches GitHub and `ssh-keygen -l`, so users can check it against the Git host. | plan 45-01 threat register (D-01) | 2026-10-13 |
| AR-45-02 | T-45-10 | A rename that lands after a revoke of the same key can leave a lone non-empty `.pub`. It is never listed (no private half), it holds only public material, and `revokeAllForOwner` removes it on account deletion. | plan 45-01 threat register | 2026-10-13 |
| AR-45-03 | T-45-19 | Public keys are meant to be copied to Git hosts; the expanded text appears only on the owner's own page. | plan 45-03 threat register | 2026-10-13 |
| AR-45-04 | T-45-24 | Rename errors are fixed sentences; no server message, path or filename is echoed. | plan 45-04 threat register | 2026-10-13 |
| AR-45-05 | T-45-30 | The deploy verification sends one credential-free `PATCH {}`; without a session the CSRF layer (or the session check) refuses it before any file is touched, and it names no key. | plan 45-05 threat register | 2026-10-13 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. All five SUMMARYs have a `## Threat Flags` section that reads "None" and maps its surface to the register: the
PATCH route, its trust boundary and the `.pub` writer to T-45-01..T-45-10 (45-01), GitHub linking, revoke and the ZZ
specs to T-45-11..T-45-15 (45-02), rendering to T-45-16 (45-03), the `$patch` request to T-45-20 and the error copy to
T-45-24 (45-04), and the probes to T-45-29/T-45-30 (45-05). The auditor found no unmapped surface. The rename result
returns the owner's own list entry, which is the same shape `GET /api/v2/rsakey` already returns. The Legacy console
renders a renamed name through Angular interpolation (`deploykey.html:91` `{{deploykey.name}}`), as text.

---

## Auditor Notes (informational, not in the register)

The code review `45-REVIEW.md` (commit `0106baa0`) landed while this audit ran. Its findings are cross-referenced
here. None of them removes a declared mitigation from the code, so none reopens a threat.

- **N-1 (low, related to T-45-04/T-45-22; 45-REVIEW IN-01):** neither validator refuses U+061C ARABIC LETTER MARK.
  It is the third implicit directional mark next to LRM and RLM in UAX #9's list of bidi formatting characters. Invisible
  default-ignorable characters (U+200B-U+200D, U+2060, U+FEFF, U+00AD, U+180E) are also accepted, so a name made only
  of them is not `empty`, and a lone surrogate is stored as U+FFFD. Server and client behave identically
  (auditor-checked in node). Both are outside the declared scope (embeddings, overrides, isolates, LRM/RLM). ALM cannot
  override or embed, the Vue Name cell isolates the name, and Legacy (`deploykey.html:91`) and GitHub show it as text.
  Candidate for Phase 48 FIX-01: add `0x061C` to the `bidi` set in `rsakey.js:29` and `keyNames.js` together, and count
  a name with no visible character as `empty`.
- **N-2 (pre-existing, outside Phase 45, adjacent to T-45-11; 45-REVIEW CR-01):** `lib/thinx/github.js:87` runs
  `console.log("[github] calling", options, body)`, which prints `options.headers.Authorization` (`"Bearer " + token`,
  `:75`). The user's GitHub token therefore goes to the `thinx_api` log in plaintext every time GitHub linking pushes a
  key. The line dates from `9a5095af` (2023-01-16), and `github.js` is not in the Phase 45 range, so T-45-11's "token
  handling unchanged" holds. The leak is still real and should be fixed before the next push of this path. Log only the
  method and path, and treat tokens already in API or Swarmpit logs as exposed.
- **N-3 (pre-existing config, T-45-03):** `verifyCsrfToken` fails open when `CSRF_ENFORCE` is unset
  (`csrf.js:470-473`). Production enforces it: the live unauthenticated PATCH answers 403 `csrf_token_invalid`.
- **N-4 (supports AR-45-02; 45-REVIEW IN-04):** inside one API process, `rename()` runs synchronously from the
  directory read to the list re-read (`rsakey.js:381-405`, no `await`). A rename/revoke interleave therefore needs two
  API processes on the shared GlusterFS key volume. In that case the "revoked meanwhile" branch (`:403`) cannot detect
  it: the orphan `.pub` is reported as renamed and remains until account deletion. That is the accepted outcome.
- **N-5 (regression guard, T-45-01/02/05/06; 45-REVIEW WR-02):** the tests that prove owner binding, traversal refusal,
  the untouched private key and temp-file cleanup live only in `spec/node/DeployKeyNames.test.js` (`test:deploykeys`).
  Neither `test:node` (`package.json:36`) nor `.circleci/config.yml` runs it. The mitigations are present and the
  auditor's run passed 34/34, but a later change, such as vault-transit Phase 40 reworking private-key storage in this
  file, would not be caught by CI. Add the file to `test:node` or to the CI node-test step.
- **N-6 (availability, adjacent to T-45-11; 45-REVIEW WR-01):** `oldestKey` accepts any non-empty `pubkey`, including
  an unparseable PEM listed with `fingerprint: null`, and `github.js` counts GitHub's 422 as success. An owner whose
  oldest key is damaged would get `key_pushed: true` and no key on GitHub on every link. This is not an elevation (no
  wrong key reaches GitHub). The fix belongs with N-2: skip entries without a fingerprint.
- **N-7:** operator UAT checks 1-10 from 45-05 SUMMARY (layout, rename round trip, hostile names, delete flows, failed
  reload, Legacy console-retest, optional GitHub re-link) are still pending. They confirm the closed mitigations live but
  do not gate this register.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-13 | 31 | 31 | 0 | gsd-security-auditor (ASVS L1 grep-depth with L2 spot traces, block_on high, plan-time register from 45-01..05, T-45-SC counted once; re-ran `test:deploykeys` 34/34 with HOME/TMPDIR in a scratch dir, 03-RsakeySpec 17/0, Inventory + CORS + GitHubLink 98/0, console `test:unit` 244/0, `test:csp:dist` PASS; exhaustive client/server validator comparison (0 differences); pipeline 5666 read; live unauthenticated PATCH ×2, preflights from an allowlisted and a foreign origin, bundle markers, Legacy sha256 ×5; public GitHub branch heads; cross-checked against 45-REVIEW `0106baa0`; no token, no login, no ssh, no push, no install) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-13
