---
phase: 45-deploy-key-rename-row-actions
plan: 05
subsystem: deploy
status: complete
tags: [deploy, api, console, vue, verification, uat]
requires: [45-01, 45-02, 45-03, 45-04]
provides:
  - "Production API serves PATCH /api/v2/rsakey (unauthenticated 403) and allows PATCH in the console CORS preflight"
  - "console.thinx.cloud serves the Phase 45 Deploy Keys page (bundle id c3f7855)"
  - "Legacy console on rtm.thinx.cloud byte-identical before and after (5 files, shasum -c OK)"
affects: [Phase 48 FIX-01 ledger, Phase 48 CI-06]
tech-stack:
  added: []
  patterns:
    - "Rollout watcher must wait for 401/403, not just 'not 404': the API answered 502 for ~1 min while its task restarted"
key-files:
  created: []
  modified:
    - services/console
decisions:
  - "No rebase needed: origin/thinx-staging was still cad3088d at push time (no other workstream had pushed)"
  - "SUMMARY and close-out docs stay local; they ride the next thinx-staging push (a docs-only push would start another rollout)"
metrics:
  duration: "11 min"
  completed: 2026-10-13
  tasks: 2
  files: 1
estimate:
  tokens: 45000
  tasks: 2
actuals:
  tokens: 3000
  tasks: 2
  commits: 1
plan_head_before: b4fff59abb3e2e55bf93e1f00ec86aae6cecfd4f
plan_head_after: c3f78558a1680e70ea1b371df4d9106d724be5d4
---

# Phase 45 Plan 05: Ship Deploy Key Rename & Row Actions Summary

Phase 45 is live. Console `thinx-staging` went out as `604258c..31ed738` (10 signed commits) and parent `thinx-staging` as `cad3088d..c3f78558` (21 signed commits ending in the gitlink bump). Push pipeline 5666 ran test, api-registry and vue-console-registry with no Snyk or console-classic job. Production now answers 403 to an unauthenticated PATCH /api/v2/rsakey, console.thinx.cloud serves bundle `c3f7855` with every Phase 45 marker, and the Legacy console is byte-identical.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | Ship console and parent to thinx-staging, prove the pipeline job list | c3f78558 (gitlink bump) | services/console |
| 2 | Prove deployed API, Vue bundle and untouched Legacy; queue operator UAT | none (read-only) | none |

## Task 1: Preflight (all before any push, D-16)

| Check | Result |
| ----- | ------ |
| `npm run -s test:deploykeys` | tests 34, pass 34, fail 0, skipped 0 |
| GitHubLinkSpec + CsrfRouteInventorySpec + ZZ-CORSSpec | 98 specs, 0 failures |
| 03-RsakeySpec filtered `^RSA Key \((?!13\))` | Ran 17 of 18 specs, 17 specs, 0 failures |
| `node --check` ZZ-RouterRSAKeySpec.js, ZZ-CSRFRouteGuardSpec.js | OK |
| `npx eslint` on the eleven parent paths | clean |
| `LC_ALL=C npm --prefix services/console/vue run test:unit` | exit 0, 244 `ok`, 0 FAIL |
| Vue production build (`--openssl-legacy-provider`) | Build complete |
| `test:csp:dist` | PASS (3 lines) |
| `perf:spotter` | All performance budgets passed (app-legacy 756.15 KiB gzip, app 750.81 KiB gzip) |
| `node scripts/check-ci-gates.js compile` | CI-GATES COMPILE OK |

## Task 1: Pre-deploy baselines (unauthenticated)

Legacy (`p45-legacy-baseline.sha256`, sizes match the planner's record):

```
819c133e9111a55fa7037df16b3f502c93f1816ce8064b756db3a9a8e31c7c16  p45-legacy-main.js
e556c292b478f4a65839d2166a0b5af142e8c767352e119b7f1a9c8f47dec59d  p45-legacy-LogviewController.js
a039777e2ca1180cf1406a43e4647ecf664b81392c096f9f6f2467473f40eeb1  p45-legacy-DeploykeyController.js
fa66a374d80a77735596f612acf13d77844afa488515a13d807151bb0badc37e  p45-legacy-deploykey.html
a1dc81747c119dd8e8b07b1b95a6f92a35cc46d3f3e249d1d719acfbd8871b69  p45-legacy-thinx-api.js
```
(main.js 28878, LogviewController.js 12538, DeploykeyController.js 4198, deploykey.html 8469, thinx-api.js 38894 bytes)

- Vue `/js/app.js` before: 3158288 bytes, build id `cad3088`; `rsakey-rename-modal` 0, `key-bulk-delete` 0,
  `Failed to delete deploy keys` 2 occurrences by `grep -o` (the plan expected 1; it is a dev-mode bundle and the
  string appears twice. The check that matters is that it goes to 0, and it did).
- PATCH /api/v2/rsakey: rtm 404, console 404. GET /api/v2/rsakey: rtm 401, console 401.
- Preflight (Origin console, ACRM PATCH): `HTTP/2 200`, `access-control-allow-methods: GET,PUT,POST,DELETE,OPTIONS`,
  `access-control-allow-origin: https://console.thinx.cloud`.
- `git ls-remote origin refs/heads/main`: `14c08c1fe3dfe23eaa9ef02d91b0e06e3da4c9cf` (unchanged after the push).

## Task 1: Range checks and pushes

**Verify 1 (console, before the push): rc=0.** 10 commits, all `G`; changed paths are exactly the nine Phase 45 Vue
paths; no `src/` (Legacy) change.

```
31ed738 G feat(vue): name the refused character on the deploy-key generate form (KEY-04, D-07)
34ed39d G test(vue): expect readable deploy-key name errors on the generate form (KEY-04, D-07)
3d7eb9b G feat(vue): rename a deploy key from its row (KEY-04, D-09, D-10)
686a113 G test(vue): add failing deploy-key rename checks (KEY-04)
5b1eb95 G feat(vue): deploy-key bulk toolbar, form spacing and one load error (POL-04, D-11, D-12)
c77f997 G test(vue): expect the deploy-key bulk toolbar, form spacing and load error (POL-04)
cd349fe G feat(vue): deploy-key show and copy icons, ellipsised names, fingerprint column (KEY-06)
36b0278 G test(vue): expect deploy-key icon actions and readable columns (KEY-05, KEY-06)
9cddd11 G feat(vue): deploy-key row delete icon with confirm and in-flight guard (KEY-05, D-11)
a90ca60 G test(vue): add failing deploy-key row delete checks (KEY-05, POL-04)
```

Console push: `604258c..31ed738  thinx-staging -> thinx-staging` (fast-forward).

Gitlink bump: `git add services/console` only, `git diff --cached --name-only` = `services/console`;
`c3f78558 G chore(45): bump console to deploy key rename and row actions (KEY-04..06, POL-04)`.

Sync: after `git fetch origin thinx-staging main`, origin/thinx-staging was still `cad3088d` and an ancestor of HEAD,
so no rebase was needed.

**Verify 2 (parent, before the push): rc=0.** 21 outgoing commits, all `G`, 0 merges. Outside `.planning/` the push
changes only `services/console` and the eleven Phase 45 paths; the gitlink equals console origin/thinx-staging
(`31ed7383`).

```
c3f78558 G chore(45): bump console to deploy key rename and row actions (KEY-04..06, POL-04)
b4fff59a G docs(45): 45-01..45-04 complete (rename API, row actions, rename dialog)
e26c52b3 G docs(45-02): complete GitHub key choice, revoke duplicates and FIX-04 record plan
ccf4800e G docs(45-02): vault-transit note and Phase 38 dispositions (D-15, FIX-04)
1d37e749 G test(45-02): PATCH /api/v2/rsakey in the router and CSRF guard specs (D-02)
38ff5180 G fix(45-02): revoke reports each requested deploy key once (D-14, IN-04)
d03458cf G test(45-02): cover revoke duplicates, router name selection and named keys (IN-04, IN-06)
52788676 G fix(45-02): GitHub linking pushes the oldest deploy key, not the newest (D-13, IN-07)
e9835cec G docs(45-03): complete deploy-key row actions, layout and load-error plan
9e1841e7 G test(45-02): expect GitHub linking to push the oldest deploy key (IN-07)
f20541b1 G docs(45-01): complete deploy-key rename API plan
579e334f G feat(45-01): OpenSSH SHA256 fingerprints, safe display names, one name validator (D-01, D-08)
abff541a G test(45-01): expect OpenSSH fingerprints, safe names, one validator (D-01, D-05..D-08)
f0b866c5 G feat(45-01): rename a deploy key through PATCH /api/v2/rsakey, .pub only (KEY-04, D-02..D-07)
c61ef62f G test(45-01): add failing deploy-key rename checks (KEY-04, D-02..D-07)
3ba49571 G docs(45): carry Phase 35 IN-03..IN-05 (Legacy) to Phase 48 FIX-01
9078ccbc G docs(45): create phase plan
15f80be1 G docs(45): UI-SPEC approved (7 PASS), alert-danger contrast tracked in Phase 48
1a41d98a G docs(45): revise UI contract for checker (button copy, form spacing)
a1dbac56 G docs(45): UI design contract
6ac08006 G docs(45): smart discuss context
```

Parent push: `cad3088d..c3f78558  thinx-staging -> thinx-staging` (fast-forward, 15:35:05Z). Never main, never force.

**Verify 3 (pipeline): rc=0.**

```
pipeline 5666 6d7c25e7-e627-4214-8901-1d467d84f825 branch=thinx-staging revision=c3f7855
main: vue-console-registry (success)
main: test (success)
main: api-registry (success)
CI-GATES PIPELINE OK 5666
```

**Verify 4 (after the push): rc=0.** Parent origin/thinx-staging = HEAD = `c3f78558`; console origin/thinx-staging =
console HEAD = parent gitlink = `31ed7383`. `git log -1 --format='%G? %s' -- services/console` prints
`G chore(45): bump console to deploy key rename and row actions (KEY-04..06, POL-04)`; origin main still `14c08c1f`.

## Task 2: Live proofs

Rollout (30 s polls): the bundle carried `c3f7855` at 15:41:49Z (about 6.7 min after the push). The API answered
**502** at 15:42:20Z and 15:42:27Z while its task restarted, then **403** at 15:42:57Z.

**Verify 1 (API): rc=0.**
- PATCH /api/v2/rsakey (empty JSON body, no credentials): rtm.thinx.cloud **403**, console.thinx.cloud **403** (was 404)
- GET /api/v2/rsakey: rtm 401, console 401; GET /api/user/rsakey/list: rtm 401
- Preflight: `HTTP/2 200`, `access-control-allow-methods: GET,PUT,POST,DELETE,PATCH,OPTIONS` (PATCH added),
  `access-control-allow-origin: https://console.thinx.cloud`

**Verify 2 (bundle): rc=0.** `/js/app.js`, 3179608 bytes, id `c3f7855` found (2 occurrences).
Present (count by `grep -o`): `rsakey-rename-modal` (5, was 0), `Rename deploy key` (1), `Deploy key renamed` (1),
`Keep current name` (1), `key-bulk-delete` (1, was 0), `Delete selected` (2), `deploy-key-group` (1),
`key-create-form` (2), `Could not load deploy keys. Refresh to retry.` (1),
`The name contains a hidden direction-override character.` (1), `SHA-256 fingerprint of the public key` (1).
Absent: `Deploy keys could not be loaded`, `Failed to delete deploy keys` (was 2), `Failed to generate deploy key`.

**Verify 3 (Legacy byte identity): rc=0.**
```
p45-legacy-main.js: OK
p45-legacy-LogviewController.js: OK
p45-legacy-DeploykeyController.js: OK
p45-legacy-deploykey.html: OK
p45-legacy-thinx-api.js: OK
```

## Pending end-of-phase UAT (operator, human checks 1-10, unchanged from the plan)

Operator, logged in to https://console.thinx.cloud (open Settings, Deploy Keys from the sidebar; reloading a deep link still lands on the dashboard until Phase 48). Use throwaway keys named "P45 UAT …" and delete them at the end:

1. At 1280x720 each key row shows the checkbox, the name (ellipsised, hover shows the full name), the generated date, a `SHA256:` fingerprint, and Show key, Copy key, Rename, Delete with their text on one line; the right-aligned "Delete selected" toolbar sits above the table and the Generate form is one row.
2. Rename round trip: generate "P45 UAT", note its fingerprint, press Rename, change the name to "P45 UAT renamed", press Save name: toast "Deploy key renamed". Leave the page through the sidebar and come back (or reload and reopen Deploy Keys): the new name shows, the fingerprint is unchanged, and Show key displays the same key text ending in the new name. Optional: `ssh-keygen -lf` of the copied key prints the same fingerprint.
3. Hostile names, in Rename and in Generate: paste a name with a tab, a name with a direction override (in the DevTools console run `copy('a' + String.fromCharCode(0x202e) + 'b')`, then paste), a name with a line separator (`String.fromCharCode(0x2028)`) and a 121-character name. Each shows the sentence that names the problem and keeps Save name / Generate disabled; clearing the rename field shows "Enter a name for the key.".
4. Show key opens the key text in a row below and Hide key closes it; Copy key copies (toast "Copied to clipboard"); hovering an icon shows its text; below 992 px only icons show.
5. Delete on "P45 UAT renamed": the "Confirm Delete" dialog names the key with "Keep key" focused; press Keep key and nothing is deleted. Press Delete again, double-click quickly: only one dialog opens; confirm: the trash shows a spinner with "Deleting…", then the row disappears. Bulk: create two throwaway keys, select both, "Delete selected (2)", the dialog offers "Keep keys"; confirm and both go.
6. Resize to 375, 768, 1024 and 1280 px wide: rows stay one line, Generated and Public key never wrap, Actions stay one row, the page never scrolls sideways (any scroll is inside the table box); at 375 px a shown 4096-bit key wraps inside its row (UI-SPEC backstops E1 overflow, E6 long-text).
7. Rename a throwaway key to a 120-character name without spaces: the Name cell ellipsises it with the full name as tip, and its Delete dialog wraps the name inside the dialog (backstop E3 long-text). Delete it.
8. Failed reload: in DevTools Network block the URL pattern `*api/v2/rsakey*`, leave Deploy Keys and come back: exactly one red alert "Could not load deploy keys. Refresh to retry." and no table or stale rows. Unblock and come back: the list returns.
9. Legacy console on https://rtm.thinx.cloud/ Deploy Keys page: the list loads (a renamed key shows its new name), creating a named key works, and revoking it works. Run the console-retest project skill against https://rtm.thinx.cloud/.
10. GitHub linking (optional, it pushes a key to the GitHub account): if you re-link GitHub in the profile, the key GitHub lists under SSH keys has the fingerprint of your oldest deploy key. Otherwise record "not exercised; covered by GitHubLinkSpec".

## Carried to Phase 48 (FIX-01 ledger)

Phase 35 review IN-03, IN-04 and IN-05 (Legacy deploy-key create handler, readable key-name errors in Legacy, Legacy
goal check) were not changed in Phase 45, because D-16 excludes Legacy changes. They are already listed under ROADMAP
Phase 48 "Carried from Phase 45" (commit 3ba49571). Until CI-06 re-enables the Legacy build, the Legacy console shows a
generic error for a refused name. It already receives the additive `reason` field (`invalid_key_name` + `reason`) that it
can use once that build is back.

## Deviations from Plan

None that changed the work. Two observations:

1. **Baseline count.** `Failed to delete deploy keys` was 2 in the pre-deploy bundle by `grep -o`, not the expected 1
   (the dev-mode bundle carries the string twice). The acceptance criterion is the drop to 0, and it was met.
2. **Transient 502.** The scratch rollout watcher stopped on "PATCH status other than 404" (the plan's wording) and saw a
   502 while the API task restarted. A follow-up poll waited for 401/403 (403 at 15:42:57Z) before the verify ran.
   The plan's "status other than 404" is too loose a rollout signal for the API. Wait for 401/403.

## Auth gates

None. Pushes used the existing git credentials; no production login, cookie or token in any probe.

## Known Stubs

None.

## Threat Flags

None. No new surface; probes were unauthenticated GETs, one OPTIONS preflight and credential-free PATCHes with `{}`.

## Self-Check: PASSED

- FOUND: c3f78558 (ancestor of HEAD, `G`); console 31ed738 = console origin/thinx-staging = parent gitlink
- Parent origin/thinx-staging = c3f78558; origin main = 14c08c1f (unchanged)
