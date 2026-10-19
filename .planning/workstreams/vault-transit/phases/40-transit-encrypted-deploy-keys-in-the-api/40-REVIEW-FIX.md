---
phase: 40-transit-encrypted-deploy-keys-in-the-api
fixed_at: 2026-10-19T10:12:04Z
review_path: .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 40: Code Review Fix Report

**Fixed at:** 2026-10-19T10:12:04Z
**Source review:** .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-REVIEW.md
**Iteration:** 2 (covers both iterations)

**Summary:**
- Findings in scope: 4 across both iterations (fix_scope critical_warning)
  - Iteration 1: CR-01, WR-01, WR-02 (fixed then, carried forward)
  - Iteration 2: WR-01 (the over-correction from 115a5740). The 12 Info findings are out of
    scope. IN-10 was handled with WR-01 because it covers the same specs.
- Fixed: 4
- Skipped: 0

## Fixed Issues

### Iteration 2, WR-01: The WR-01 fix hides an OpenBao outage behind any other key's failed clone

**Files modified:** `lib/thinx/git.js`, `spec/jasmine/GitSpec.js`
**Commit:** 9fd2c640
**Status:** fixed, requires human verification (logic change)
**Applied fix:** Followed the reviewer's first option.
- `cloneHoldingLock` now returns `cause` next to `reason` on a failed git command:
  `{ ok: false, repoPath: null, reason: <stage>, cause: Git.failureCause(stderr) }`. Only the fixed
  code is returned, never stderr. Callers that read `.ok` and `.reason` (`builder.js`, `sources.js`)
  are unaffected.
- New `KEY_REFUSED_CAUSES` = `publickey_denied`, `repo_not_found_or_no_access`, `key_unusable`. The
  new helper `cloneFailedPastKey(result)` returns true when a clone failed for a reason of its own,
  and false for a success or a clone-stage refusal. A refusal only counts in the `clone_failed`
  stage. A `pull_failed` runs on a checkout the key already opened, for example a submodule
  refused during the pull.
- `fetchHoldingLock` and `transitAttempt` use this flag (renamed from `attempted` to
  `failedPastKey`) in place of "a clone was started". The legacy path sets it from the clone result.
  The Transit agent callback starts it at true, which covers a throwing clone, and then sets it
  from the result. A throw from the legacy clone also counts, so both paths treat an unexplained
  exception the same way.
- Outcomes:
  - OpenBao is down, and a legacy key is refused with publickey denied or repo-not-found. The build
    still gets `keyUnavailable` (the builder logs "deploy key unavailable: key service unreachable").
  - A key authenticates, and the clone then fails for another reason, such as a missing branch.
    `keyUnavailable` is null, and the clone's own error stands.
- WR-02 skip semantics are unchanged (`serviceDown` handling untouched). `keyUnavailable` is still
  the first Transit reason seen.
- `https_auth_required`, `host_key_failed` and `network` are deliberately not in the refused set.
  An https URL never uses a deploy key, so its failure is the clone's own. Note that the existing
  classifier checks `repo_not_found_or_no_access` before `host_key_failed` and `network`, and ssh
  appends "Could not read from remote repository" to both. Over ssh, a host-key or connection
  failure is therefore classified as a refusal, and the Transit reason is still reported. That fits
  "did not get past authentication". `failureCause` itself was not changed, because
  GitFailureCauseSpec pins it.

Specs in `spec/jasmine/GitSpec.js`:
- A `cloneFailure(cause, stage)` helper builds the real return shape. T2, T2b, T2c, T2d, T2e, T2f,
  T2g and T3 use it (this addresses IN-10).
- (b2), new: the real `cloneRepository` against the file:// fixture. A missing repository gives
  `reason: "clone_failed", cause: "repo_not_found_or_no_access"`, and a missing branch gives
  `cause: "branch_not_found"`.
- T2b, rewritten: the Transit key is `unreachable`, and the legacy key fails with `branch_not_found`.
  Expects `keyUnavailable: null`.
- T2c, rewritten: the legacy key is refused with `repo_not_found_or_no_access`, then the Transit key
  is `sealed`. Expects `keyUnavailable: "sealed"`, one legacy attempt and 1 decrypt.
- T2d, new, one case per refused cause: the Transit key is `unreachable`, and the legacy key is
  refused. Expects `"unreachable"`.
- T2e, new: `pull_failed` with `publickey_denied` counts as past the key. Expects null.
- T2f, new: a decrypted Transit key is refused through the agent, and the next key is
  `bad_ciphertext`. Expects `"bad_ciphertext"`, which covers the `transitAttempt` path.
- T2g, new: a decrypted Transit key misses the branch, and the next key is `bad_ciphertext`.
  Expects null.

Mutation check: with only `lib/thinx/git.js` reverted to `b4267e12`, GitSpec failed 6 of 66 specs
(b2, T2c, all three T2d cases, T2f). T2b, T2e and T2g guard the other direction and pass either way.

### Iteration 1, CR-01: `keyformat.readKey` blocks the API event loop forever on a FIFO in `ssh_keys`

**Files modified:** `lib/thinx/keyformat.js`, `spec/jasmine/KeyFormatSpec.js`, `spec/jasmine/GitSpec.js`
**Commit:** 6b2081e6
**Applied fix:** `readKey` opens with `O_RDONLY | O_NONBLOCK`, so a FIFO opens at once and the
existing `fstat` check rejects it as `not_regular`. Regular files are unaffected. KeyFormatSpec has
a `mkfifo` case, and GitSpec T4 has an `afifo` entry. The iteration-2 review confirmed the fix is
correct. IN-09 (the FIFO specs hang instead of failing on a regression) and IN-12 (the same class
of bug on the `.pub` paths in `rsakey.js`, which predates Phase 40) remain open as Info.

### Iteration 1, WR-01: "deploy key unavailable" is logged even when the build failed for another reason

**Files modified:** `lib/thinx/git.js`, `spec/jasmine/GitSpec.js`
**Commit:** 115a5740
**Status:** fixed, requires human verification (logic change). Superseded in part by iteration 2.
**Applied fix:** `fetchHoldingLock` tracked whether any key reached a clone, and returned
`keyUnavailable` only when none did. The iteration-2 review found that this over-corrects for
per-repository deploy keys. Commit 9fd2c640 (above) narrows "reached a clone" to "failed past
authentication".

### Iteration 1, WR-02: Each Transit key repeats the full login/retry cycle during an outage, under the checkout lock

**Files modified:** `lib/thinx/git.js`, `spec/jasmine/GitSpec.js`, `spec/jasmine/TransitIntegrationSpec.js`
**Commit:** b4267e12
**Status:** fixed, requires human verification (logic change)
**Applied fix:** `SERVICE_DOWN_REASONS` = unreachable, sealed, tls, not_configured, denied. After the
first Transit failure with one of these reasons, the rest of the same fetch skips Transit keys
without a request. Legacy keys are still tried. `bad_ciphertext` and `server_error` stay per-key.
Specs: GitSpec T8 to T11, TransitIntegrationSpec E2 and E3. The iteration-2 review confirmed the
fix is correct, with no regression in the key loop. Iteration 2 did not change this logic.

## Verification

Iteration 2 ran directly in the main checkout (`thinx-staging`, no worktree, per the orchestrator's
instruction). Every number below can be reproduced from that tree at 9fd2c640.

- Tier 1/2: re-read the diff, and `node -c` passed for `lib/thinx/git.js` and `spec/jasmine/GitSpec.js`.
- `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine --config=/dev/null
  --random=false spec/jasmine/KeyFormatSpec.js spec/jasmine/GitSpec.js spec/jasmine/TransitSpec.js
  spec/jasmine/SecretsSweepSpec.js spec/jasmine/BuilderRemoteJobSpec.js` gave **244 specs,
  0 failures**. That is 237 after iteration 1, plus 7 new specs: b2, three T2d cases, T2e, T2f and T2g.
- `node --test spec/node/*.test.js` gave **135 tests: 135 pass, 0 fail, 0 cancelled, 0 skipped,
  0 todo**. Iteration 1 reported 1 skipped. That skip depends on the environment, and no
  `spec/node` file was changed.
- `bash scripts/openbao-dev.sh run -- npx jasmine --config=/dev/null --random=false
  spec/jasmine/TransitIntegrationSpec.js`, run with the same env vars against the OpenBao dev
  server, gave **10 specs, 0 failures, none pending**. No `thinx-openbao-dev` containers were left
  running afterwards.
- GitSpec on its own gave 66 specs and 0 failures. With the pre-fix git.js it failed 6, as listed
  under the mutation check above.

---

_Fixed: 2026-10-19T10:12:04Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
