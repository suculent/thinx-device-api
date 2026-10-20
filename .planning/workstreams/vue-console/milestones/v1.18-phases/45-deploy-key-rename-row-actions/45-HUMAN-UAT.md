---
status: complete
phase: 45-deploy-key-rename-row-actions
source: [45-VERIFICATION.md, 45-05-SUMMARY.md]
started: 2026-10-13T15:50:12Z
updated: 2026-10-13T19:30:00Z
---

## Current Test

[testing complete]

## Context

Automated checks passed (see 45-VERIFICATION.md, 10/13, no gaps):
- Parent: `test:deploykeys` 34/34; GitHubLink + CsrfRouteInventory + ZZ-CORS 98 specs, 0 failures; filtered 03-RsakeySpec 17/17; both ZZ specs pass `node --check`.
- Console: `test:unit` exit 0, 244 ok, 0 FAIL.
- Server and client name validators agree on 331,082 inputs.
- A local rename of a real ssh-keygen key keeps the `ssh-keygen -lf` fingerprint and leaves the private file's bytes, mode, mtime and inode unchanged.
- `CI-GATES PIPELINE OK 5666` (legacy-off).
- Live: unauthenticated PATCH /api/v2/rsakey answers 403 on rtm and console, and the preflight allows PATCH for https://console.thinx.cloud.
- https://console.thinx.cloud/js/app.js serves build `c3f7855` with every Phase 45 marker. The five Legacy files on rtm match the pre-deploy baseline.

Items 1-10 are the operator checks from 45-05-SUMMARY "Pending end-of-phase UAT". Item 11 is the prohibitions review.
Items 6 and 7 carry the UI-SPEC backstop truths (E1 overflow, E6 long-text, E3 long-text), which presence checks cannot prove.

Log in at https://console.thinx.cloud and open Settings, Deploy Keys from the sidebar. Reloading a deep link still lands
on the dashboard until Phase 48. Use throwaway keys named "P45 UAT …" and delete them at the end.

## Tests

### 1. U1 (KEY-05, KEY-06): Deploy Keys layout at 1280x720
test: Open Deploy Keys at 1280x720.
expected: Each key row shows the checkbox, the name (ellipsised; hovering shows the full name), the generated date, a `SHA256:` fingerprint, and Show key, Copy key, Rename, Delete with their text, all on one line. The right-aligned "Delete selected" toolbar sits above the table. The Generate form is one row.
result: pass (operator "all pass", 2026-10-13, live build 3b578cb)

### 2. U2 (KEY-04): rename round trip
test: Generate "P45 UAT" and note its fingerprint. Press Rename, change the name to "P45 UAT renamed" and press Save name. Leave the page through the sidebar and come back (or reload and reopen Deploy Keys).
expected: The toast reads "Deploy key renamed". After coming back the new name shows, the fingerprint is unchanged, and Show key displays the same key text ending in the new name. Optional: `ssh-keygen -lf` of the copied key prints the same fingerprint.
result: pass (operator "all pass", 2026-10-13, live build 3b578cb)

### 3. U3 (KEY-04 SC1): hostile names in Rename and in Generate
test: Paste each of these, in Rename and in Generate: a name with a tab; a name with a direction override (in the DevTools console run `copy('a' + String.fromCharCode(0x202e) + 'b')`, then paste); a name with a line separator (`String.fromCharCode(0x2028)`); a 121-character name. Then clear the rename field.
expected: Each shows the sentence that names the problem and keeps Save name / Generate disabled. A cleared rename field shows "Enter a name for the key.".
result: pass (operator "all pass", 2026-10-13, live build 3b578cb)

### 4. U4 (KEY-05): Show, Copy and hover tips
test: Press Show key, then Hide key; press Copy key; hover each icon; narrow the window below 992 px.
expected: Show key opens the key text in a row below and Hide key closes it. Copy key copies the key and shows the toast "Copied to clipboard". Hovering an icon shows its text. Below 992 px only the icons show.
result: pass (operator "all pass", 2026-10-13, live build 3b578cb)

### 5. U5 (KEY-05, POL-04): confirmed, single-shot delete
test: Press Delete on "P45 UAT renamed", then press Keep key. Press Delete again, double-click quickly, then confirm. For bulk: create two throwaway keys, select both, press "Delete selected (2)" and confirm.
expected: The "Confirm Delete" dialog names the key and focuses "Keep key"; Keep key deletes nothing. A fast double-click opens only one dialog. After confirming, the trash shows a spinner with "Deleting…" and then the row disappears. The bulk dialog offers "Keep keys", and confirming removes both keys.
result: pass (operator "all pass", 2026-10-13, live build 3b578cb)

### 6. U6 (KEY-06, backstops E1 overflow and E6 long-text): narrow viewports
test: Resize to 375, 768, 1024 and 1280 px wide. At 375 px, press Show key on a 4096-bit key.
expected: Rows stay one line. Generated and Public key never wrap, and Actions stay on one row. The page never scrolls sideways; any scroll is inside the table box. At 375 px the shown key wraps inside its row.
result: pass (operator "all pass", 2026-10-13, live build 3b578cb)

### 7. U7 (backstop E3 long-text): 120-character name
test: Rename a throwaway key to a 120-character name without spaces, then press Delete on it.
expected: The Name cell ellipsises the name and shows it in full as the hover tip. The Delete dialog wraps the name inside the dialog. Delete the key.
result: pass (operator "all pass", 2026-10-13, live build 3b578cb)

### 8. U8 (POL-04): failed reload
test: In DevTools Network, block the URL pattern `*api/v2/rsakey*`. Leave Deploy Keys and come back. Then unblock and come back again.
expected: While blocked: exactly one red alert, "Could not load deploy keys. Refresh to retry.", with no table and no stale rows. After unblocking: the list returns.
result: pass (operator "all pass", 2026-10-13, live build 3b578cb)

### 9. U9 (SC5): Legacy console unchanged
test: Open the Deploy Keys page of the Legacy console at https://rtm.thinx.cloud/. List the keys, create a named key, then revoke it. Then run the console-retest project skill against https://rtm.thinx.cloud/.
expected: The list loads and a renamed key shows its new name. Creating a named key works, and revoking it works. console-retest passes.
result: pass (operator; Claude: 5 Legacy files on rtm equal the 45-05 baseline after pipeline 5667)

### 10. U10 (FIX-04 IN-07, optional): GitHub linking
test: Optional, because it pushes a key to the GitHub account: re-link GitHub in the profile.
expected: The key GitHub lists under SSH keys has the fingerprint of your oldest deploy key. If you skip this, record "not exercised; covered by GitHubLinkSpec".
result: issue (operator): linking a GitHub token failed with "GitHub rejected this token". Log: GET /user/keys 403, the token lacks the SSH-key scope; THiNX key never reached GitHub, so the private repo suculent/thinx-autoflood could not be cloned (5 attempts, git status 128). Not a Phase 45 regression (D-13 key choice is covered by GitHubLinkSpec). Tracked in .planning/debug/github-token-private-repo.md; scope guidance, 403 github_token_missing_scope and allow-listed diagnostics shipped after UAT.

### 11. U11: prohibitions review (22 judgment-tier items, all flagged)
test: Read the Prohibitions table in 45-VERIFICATION.md (45-01 x6, 45-02 x4, 45-03 x4, 45-04 x3, 45-05 x5).
expected: The operator accepts the verifier's non-authoritative verdicts. Where the code or git history shows it, the verdict is "not violated": private key untouched, no v1 rename route, mkdtemp-only tests, no control-char regex, vault-transit STATE.md append-only, no raw HTML, console diff limited to the nine Vue paths, origin/main unchanged, all commits signed. For items the code cannot show (no ssh, no login, no `.env*` read, no env dump, no lint/install), the verdict rests on the SUMMARY attestation.
result: pass (operator "all pass", 2026-10-13, live build 3b578cb)

## Summary

total: 11
passed: 10
issues: 1
pending: 0
skipped: 0

## Gaps

[none so far]
