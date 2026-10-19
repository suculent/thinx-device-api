---
phase: 40-transit-encrypted-deploy-keys-in-the-api
reviewed: 2026-10-19T10:16:16Z
depth: standard
iteration: 3
files_reviewed: 31
files_reviewed_list:
  - .circleci/config.yml
  - docker-compose.test.yml
  - docker-swarm.yml
  - lib/thinx/transit.js
  - lib/thinx/keyformat.js
  - lib/thinx/rsakey.js
  - lib/thinx/git.js
  - lib/thinx/builder.js
  - lib/thinx/github_link.js
  - lib/router.rsakey.js
  - thinx-core.js
  - scripts/openbao-dev.sh
  - spec/fixtures/fake-transit.js
  - spec/fixtures/mock-openbao.js
  - spec/jasmine/03-RsakeySpec.js
  - spec/jasmine/GitSpec.js
  - spec/jasmine/SecretsSweepSpec.js
  - spec/jasmine/TransitIntegrationSpec.js
  - spec/jasmine/TransitSpec.js
  - spec/jasmine/KeyFormatSpec.js
  - spec/jasmine/GitHubLinkSpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/node/DeployKeyNames.test.js
  - services/console/src/app/js/controllers/DeploykeyController.js
  - services/console/src/test/deploykey.cjs
  - services/console/vue/src/pages/Profile/Profile.vue
  - services/console/vue/src/pages/Rsakeys/Rsakeys.vue
  - services/console/vue/tests/unit/deploy-key-actions.cjs
  - services/console/vue/tests/unit/github-token-scopes.cjs
  - /Users/sychram/Repositories/thinx-swarm/tests/openbao-api-wiring.test.sh
  - /Users/sychram/Repositories/thinx-swarm/thinx.yml
findings:
  critical: 0
  warning: 0
  info: 13
  total: 13
status: clean
---

# Phase 40: Code Review Report (iteration 3)

**Reviewed:** 2026-10-19T10:16:16Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** clean (no critical or warning findings; 13 Info items remain)

## Narrative Findings (AI reviewer)

## Summary

This pass re-reviews commit `9fd2c640`, the fix for iteration 2's WR-01. It changes only `lib/thinx/git.js` and
`spec/jasmine/GitSpec.js`. Since iteration 1 (`748f8798`), the only files in scope that changed are `git.js`,
`keyformat.js`, `GitSpec.js`, `KeyFormatSpec.js` and `TransitIntegrationSpec.js`. The analysis of the other files
from earlier iterations still holds. I re-checked every carried Info finding against the current line numbers.
Commit `04a8d26b` (purge-unused-users) is out of scope and was not reviewed.

**WR-01 (iteration 2): fixed and correct.** I traced `cloneFailedPastKey` (`git.js:42-46`) against every value the
real `cloneHoldingLock` (`git.js:551-615`) can return:
- `ok: true` → false. Not counted, and the caller returns success anyway.
- `invalid_input`, `no_checkout`, `pull_failed`, `chmod_failed`, `metadata_failed` → true. The key got past
  authentication, or the input was bad for every key. The clone's own failure is the cause.
- `clone_failed` with `publickey_denied`, `repo_not_found_or_no_access` or `key_unusable` → false. This is the
  normal outcome for another repository's deploy key, so the first Transit reason is still reported. That fixes
  the silent case from iteration 2.
- `clone_failed` with `branch_not_found`, `https_auth_required`, `other` or `no_stderr` (for example a timeout
  kill) → true. The Transit reason is suppressed.
- A missing result or a throw → true. The legacy `catch` only sets the flag once `askpass` exists
  (`git.js:857`). `sshEnv` and `readSecret` never throw, so the flag is set only when the clone path itself
  threw. In the Transit path, the flag is set to true before the clone and overwritten by the result
  (`git.js:788-790`). An agent start or load failure leaves it false (see IN-08).

**No regression in the per-fetch loop.**
- WR-02 skip semantics are unchanged. `serviceDown` is still checked only in the Transit branch
  (`git.js:827-839`), so legacy keys after an outage are still tried (T8, all five reasons). `bad_ciphertext`
  and `server_error` still do not skip later keys (T10, T11).
- `keyUnavailable` is still the first Transit reason seen (`git.js:835`, guarded by `=== null`). T9 confirms that a
  Transit-only fetch still reports the outage with one decrypt.
- The legacy path is unchanged except for how the flag is derived. Success still calls `rememberKey` and returns
  before the flag is read.

**`cause` does not leak stderr.** `Git.failureCause` (`git.js:267-282`) returns only one of seven fixed codes,
`other` or `no_stderr`. `cause` is never built from stderr text. `fetchHoldingLock` reads it but does not return
it. The only log line that uses it is the existing `cause=` field.

**builder.js and sources.js are unaffected.** `builder.prefetchPublic` (`builder.js:701-707`) reads `.ok` and
`.reason`. `builder.prefetchPrivate` (`builder.js:740-743`) reads `.ok` and `.keyUnavailable` from
`fetchDetailed`, whose shape did not change. `sources.js:291-296` and `devices.js:81` use `.ok` and the boolean
`fetch()`. None of them logs or serialises the whole clone result.

**Tests.** I ran them locally from the main checkout (`ENVIRONMENT=development`, dummy CouchDB credentials, no
Redis). KeyFormatSpec, GitSpec, TransitSpec, SecretsSweepSpec, BuilderRemoteJobSpec and GitFailureCauseSpec gave
**245 specs, 0 failures**. The new specs exercise the real return shape:
- b2 runs a real `file://` clone. It returns `cause: repo_not_found_or_no_access` for a missing repository and
  `branch_not_found` for a missing branch.
- T2b to T2g stub `{ reason: "clone_failed" | "pull_failed", cause }`.

This resolves iteration 2's IN-10. I did not start the OpenBao dev server, so I did not re-run
TransitIntegrationSpec. Its pass comes from the fix report. Its assertions (E2/E3) expect `ok: true` and do not
depend on the changed flag.

One residual limit, already named in the fix report, is filed as IN-13. Over ssh, `failureCause` never returns
`host_key_failed` or `network` for a real git stderr. So these failures count as refusals in the WR-01 decision.
The effect is a less precise cause line in a double-fault case, not a wrong outcome.

## Info

### IN-01: Agent socket readiness is probed with `lstat`, which can succeed before `listen()` (carried over)

**File:** `lib/thinx/git.js:219-229,418-419`
**Issue:** `waitForSocket` returns as soon as the socket inode exists. `ssh-agent` creates the inode in `bind()`,
just before `listen()`. An `ssh-add` in that window gets `ECONNREFUSED`, and the key is skipped as
`agent_load_failed`. This is a rare flake.
**Fix:** Treat the socket as ready only after a successful `net.connect(sock)`, or retry `loadIntoAgent` once.

### IN-02: The decrypted key's raw response bytes are never zeroed (carried over)

**File:** `lib/thinx/transit.js:152,175-189`
**Issue:** `withAgent` zeroes the returned Buffer. The response `chunks` and the `Buffer.concat` result keep a
base64 copy of the private key until GC. The encrypt request body `data` is a string, which cannot be wiped.
**Fix:** Keep the concatenated Buffer in a variable, and `fill(0)` it and each chunk after `JSON.parse`. Document
that the JSON and string copies cannot be wiped.

### IN-03: `readKey` stringifies a legacy (possibly unencrypted) PEM before classifying it (carried over)

**File:** `lib/thinx/keyformat.js:72-73,80`
**Issue:** `buf.toString("utf8", …)` makes a copy of the whole file that cannot be wiped, before the `finally`
zeroes `buf`. For a pre-2022 unencrypted key, the fill therefore achieves nothing.
**Fix:** Classify on the Buffer with a bounded prefix check, and stringify only the Transit case.

### IN-04: An explicit `:443` in `BAO_ADDR` silently becomes port 8200 (carried over)

**File:** `lib/thinx/transit.js:139`
**Issue:** WHATWG `URL` drops the scheme's default port, so `Number(url.port || 8200)` maps `https://h:443` to 8200.
**Fix:** Default to 8200 only when the original string has no port, or document the constraint.

### IN-05: Every HTTP 400 on decrypt is `bad_ciphertext`, which the incident tracker ignores (carried over)

**File:** `lib/thinx/transit.js:211,316`
**Issue:** A missing or renamed transit key also returns a 400. So does ciphertext below
`min_decryption_version` after a Phase 41 rotation. Such a fleet-wide failure never raises the D-05 alert and
never short-circuits (WR-02). The WR-01 fix keeps it as the reported `keyUnavailable` when the other keys are
refused, so the build log at least names it.
**Fix:** Map key-level 400 messages (checked internally, never logged) to a reason that feeds `_fail`, or alert on
a `bad_ciphertext` rate.

### IN-06: `transportReason` has a dead branch (carried over)

**File:** `lib/thinx/transit.js:82-83`
**Issue:** Both branches return `"unreachable"`, so `UNREACHABLE_CODES` has no effect.
**Fix:** Drop the set, or return `server_error` for codes outside it.

### IN-07: The dev OpenBao is published on all interfaces with a fixed root token, and its state dir is predictable (carried over)

**File:** `docker-compose.test.yml:299-300`, `scripts/openbao-dev.sh:18-19,46-47`
**Issue:** `ports: - '8200'` binds `0.0.0.0:<random>` with the root token `thinx-ci-bao-root`. The state dir
`${TMPDIR:-/tmp}/thinx-openbao-dev` can be created in advance by another user on a shared Linux `/tmp`.
**Fix:** Use `'127.0.0.1::8200'`. Create the state dir with `mktemp -d`, or refuse one not owned by `$USER`.

### IN-08: A Transit key that decrypts but cannot be loaded leaves no reason in the build log (carried over)

**File:** `lib/thinx/git.js:797-804`, `lib/thinx/builder.js:1017-1019`
**Issue:** `agent_start_failed` and `agent_load_failed` reach only the API console. These attempts set neither
`unavailable` nor `failedPastKey`. Consider an owner whose Transit keys all decrypt but cannot be loaded, for
example because `ssh-agent` is missing from the image. Their build log still shows a bare `error`.
**Fix:** Return `agentFailure: e.code` from `transitAttempt`. When nothing else explains the failure, log a fixed
sentence such as "deploy key could not be loaded".

### IN-09: The FIFO specs hang the runner instead of failing if CR-01 regresses (carried over)

**File:** `spec/jasmine/KeyFormatSpec.js:98-105`, `spec/jasmine/GitSpec.js:634,784-791` (T4 `afifo`)
**Issue:** A blocking `openSync` on a FIFO freezes the whole jasmine process. A synchronous block means the
elapsed-time assertion never runs and jasmine's async timeout cannot fire. A regression would therefore show up as
a CI job stalled until CircleCI's no-output timeout, not as a named failure.
**Fix:** Run the check in a child process with a hard timeout, for example
`execFileSync(process.execPath, ["-e", "…readKey(FIFO)…"], { timeout: 3000 })`, and assert on its output.

### IN-10: `server_error` stays per-key even when it comes from the AppRole login (carried over, was IN-11)

**File:** `lib/thinx/git.js:26-29,838`, `lib/thinx/transit.js:236-246,57`
**Issue:** `transitAttempt` sees only the reason, not which request produced it. A 5xx or malformed reply from
`auth/approle/login`, or a 500 from a broken storage backend, is service-wide. Each Transit key still runs the full
retry cycle (`server_error` is in `RETRYABLE`). A backend that answers slowly with 5xx brings back the N-key
multiplication that WR-02 removed.
**Fix:** Tag `TransitError` with the failing op. Treat `server_error` from `login` as service-level in
`fetchHoldingLock`, and keep `server_error` from `decrypt` per-key.

### IN-11: The CR-01 FIFO freeze is still reachable through the `.pub` paths in `rsakey.js` (pre-existing, was IN-12)

**File:** `lib/thinx/rsakey.js:252` (`exportKeysForList`), `lib/thinx/rsakey.js:458` (`rename`), `lib/thinx/rsakey.js:656` (`generate`)
**Issue:** `readFileSync(<key>.pub)` in list and rename blocks the event loop on a FIFO `.pub`.
`writeFileSync(public_path, …)` runs after the awaited Transit encrypt. During that wait, the claimed empty `.pub`
can be swapped for a FIFO, and the write then blocks. A writer on the volume needs `thinx_worker`-level access,
and that access already means `docker.sock`.
**Fix:** In a follow-up, route these paths through a shared helper. The helper should open with `O_NONBLOCK`,
check the result with `fstat`, and reject anything that is not a regular file.

### IN-12: `cloneHoldingLock`'s contract comment omits `cause`, and two early returns leave it undefined (new)

**File:** `lib/thinx/git.js:531,554,575,613`
**Issue:** The doc comment still says "Resolves { ok, repoPath, reason }". The `invalid_input` and `no_checkout`
returns have no `cause`, and only the catch path sets it. `cloneFailedPastKey` checks `reason` before `cause`, so
the decision is correct today. A future caller that switches on `cause` alone would read `undefined` for those
two stages.
**Fix:** Document `cause` (a `Git.failureCause` code, or `null` when no git command failed). Return
`cause: null` from the two early returns and the success path.

### IN-13: Over ssh, `host_key_failed` and `network` are unreachable, so they count as key refusals in the WR-01 decision (pre-existing classifier, now load-bearing)

**File:** `lib/thinx/git.js:269-276` (pattern order), `lib/thinx/git.js:34,45` (`KEY_REFUSED_CAUSES`)
**Issue:** Over ssh, git appends "fatal: Could not read from remote repository." to every failure. The
`repo_not_found_or_no_access` pattern matches that line, and it is checked before `host_key_failed` and
`network`. I checked this locally against the current `failureCause`:
- `Host key verification failed.` plus the git trailer gives `repo_not_found_or_no_access`. The same line without
  the trailer gives `host_key_failed`.
- `ssh: Could not resolve hostname …` plus the trailer gives `repo_not_found_or_no_access`.
- `ssh: connect to host … Connection timed out` plus the trailer gives `repo_not_found_or_no_access`.

GitFailureCauseSpec only tests the bare lines (`:14,17`), so it does not catch this. There are two effects:
- A host-key change, which can signal a MITM, is logged on the API console as `cause=repo_not_found_or_no_access`,
  and that hides the signal.
- During an OpenBao outage, such a failure counts as a refusal, so the build log names the key service. That is
  still true in this double fault, so it is not a wrong outcome. The fix report notes this and accepts it.

**Fix:** Before matching `repo_not_found_or_no_access`, strip git's generic trailer (`fatal: Could not read from
remote repository.` and the "Please make sure…" paragraph). Alternatively, move `host_key_failed` and `network`
ahead of it. Add trailer-bearing cases to GitFailureCauseSpec. If you want those causes to stay "refusals" for
WR-01, add them to `KEY_REFUSED_CAUSES` explicitly instead of relying on misclassification.

---

_Reviewed: 2026-10-19T10:16:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
