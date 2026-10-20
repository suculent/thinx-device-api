---
phase: 45-deploy-key-rename-row-actions
plan: 01
subsystem: api
status: complete
tags: [api, rsakey, deploy-keys, csrf, cors, validation, fingerprint]
requires: []
provides:
  - "PATCH /api/v2/rsakey {filename, name}: session, owner, CSRF, exact filename; .pub-only atomic rename"
  - "RSAKey.validateKeyName(name) -> {ok} | {ok:false, reason} (empty, too_long, control_chars, line_separator, bidi)"
  - "RSAKey.fingerprint(pubkey) -> OpenSSH SHA256:<43 base64> over the decoded key blob, or null"
  - "400 {success:false, response:'invalid_key_name', reason} on PATCH, PUT /api/v2/rsakey and GET /api/user/rsakey/create"
  - "CORS Access-Control-Allow-Methods GET,PUT,POST,DELETE,PATCH,OPTIONS"
affects: [45-02, 45-03, 45-04, 45-05, vault-transit Phase 40]
tech-stack:
  added: []
  patterns:
    - "Numeric UTF-16 code-unit checks instead of control-character regexes (Codacy no-control-regex)"
    - "Atomic file replace: dot-prefixed temp in the same dir, wx + source mode, chmod, renameSync"
    - "Node test harness: HOME redirected to mkdtemp before any lib require; fake app records route handlers"
key-files:
  created: []
  modified:
    - lib/thinx/rsakey.js
    - lib/router.rsakey.js
    - lib/middleware/cors.js
    - spec/node/DeployKeyNames.test.js
    - spec/jasmine/ZZ-CORSSpec.js
    - spec/jasmine/03-RsakeySpec.js
    - spec/jasmine/CsrfRouteInventorySpec.js
decisions:
  - "Fingerprint requires a well-framed blob (whole length-prefixed fields, first = token 1), not only the type prefix, so a truncated blob gives null"
  - "rename() re-reads the entry through exportKeysForList; a key revoked between write and read answers key_not_found"
  - "Rename temp files: .<owner>-<ts>.pub.<12 hex>.tmp, removed on failure and by revokeAllForOwner (RENAME_TEMP pattern)"
metrics:
  duration: "~20 min"
  completed: 2026-10-13
  tasks: 2
  files: 7
estimate:
  tokens: 100000
  tasks: 2
actuals:
  tokens: 11400
  tasks: 2
  commits: 4
plan_head_before: 3ba49571a938531fbb1a4b4fa4cfd2f7d2ad6ac8
plan_head_after: 579e334fbbc56f2ebdb3f1e4125e6c810dfae81c
---

# Phase 45 Plan 01: Deploy-key rename API, shared name validator, OpenSSH fingerprints Summary

`PATCH /api/v2/rsakey` renames an owner's deploy key by rewriting only the `.pub` comment through a temp file and an
atomic rename. The private key is never touched, and a spy test proves it. One numeric `RSAKey.validateKeyName`
covers create, rename and both routers, and invalid names get HTTP 400 with a `reason`. `list()` fingerprints are now
the OpenSSH `SHA256:` value that `ssh-keygen -l` and GitHub show, and the display name follows the D-08 safe-comment
rule.

## Tasks

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 (tracer) | Rename through PATCH /api/v2/rsakey: validator, owner-bound route, .pub-only writer, CORS | c61ef62f (RED), f0b866c5 (GREEN) | rsakey.js, router.rsakey.js, cors.js, DeployKeyNames.test.js, ZZ-CORSSpec.js |
| 2 | OpenSSH SHA256 fingerprints, safe display names, one validator for create | abff541a (RED), 579e334f (GREEN) | rsakey.js, router.rsakey.js, DeployKeyNames.test.js, 03-RsakeySpec.js, CsrfRouteInventorySpec.js |

All four commits are signed (`git log -4 --format=%G?` prints `G` four times). Nothing pushed: `origin/thinx-staging..HEAD` = 10,
including earlier phase-45 docs commits. 45-05 ships.

## 38-REVIEW items closed (for 45-02's 38-REVIEW-DISPOSITION.md)

| Item | Fixed in | What |
| ---- | -------- | ---- |
| IN-01 (duplicated name predicate) | f0b866c5 adds `RSAKey.validateKeyName`; 579e334f makes it the only check in `create()` and `createRSAKey` | one validator for create, rename, PUT/GET create and PATCH |
| IN-02 (bidi, U+2028/U+2029, C1 accepted) | f0b866c5 (validator, rename), 579e334f (create paths) | reasons `control_chars` (C0, DEL, C1), `line_separator`, `bidi` |
| IN-03 (unsafe / PEM-fragment display names) | 579e334f | `RSAKey.storedName`: comment shown only on a single-line `ssh-` key that passes the validator and is not `thinx-<ts>` |

## TDD Gate Compliance

**Task 1 RED (c61ef62f):** `npm run -s test:deploykeys` gave 25 tests, 16 pass, **9 fail**. The failing tests were:
the validator table, the per-code-unit classification, the OpenSSH rename, the PEM rename, the refusals, the
private-key spy, the failed-write test, the temp-file removal on account deletion and the PATCH router harness. The
reasons were `RSAKey.validateKeyName`/`rename` not a function, "no file of the deleted owner remains", and
"PATCH /api/v2/rsakey is registered". ZZ-CORSSpec + CsrfRouteInventorySpec + GitHubLinkSpec: 92 specs, **1 failure**
(test 4, `expected 'GET,PUT,POST,DELETE,OPTIONS' to equal 'GET,PUT,POST,DELETE,PATCH,OPTIONS'`).

**Task 1 GREEN (f0b866c5):** test:deploykeys 25/25 pass; jasmine trio 92 specs, 0 failures; `node --check`, the one-line
PATCH+CSRF grep and eslint all pass.

**Task 2 RED (abff541a):** test:deploykeys gave 30 tests, 25 pass, **5 fail**. The failing tests were F1 (fingerprint
vector), F2 (ssh-keygen; failed, not skipped), F3 (list fingerprints), D1 (display rule: key 1004 listed the raw comment `a` U+202E `b`
instead of the date) and K1 (the PUT with U+2028 reached `create`). 03-RsakeySpec filtered run: "Ran 16 of 17 specs",
16 specs, **2 failures** ((14), (15)). Inventory/CORS/GitHubLink: 93 specs, 0 failures. The new GUARDED row already
passed, because Task 1 registered the route.

**Task 2 GREEN (579e334f):** test:deploykeys 30/30 pass, 0 skipped (ssh-keygen at /usr/bin ran). 03-RsakeySpec:
"Ran 16 of 17 specs", 16 specs, 0 failures. Jasmine trio: 93 specs, 0 failures. The no-inline-predicate,
no-`sha256(pubkey)` and router-validator-count (>= 2) checks pass, rsakey.js has no control-character escape, and eslint
is clean on all seven files.

## Verification (final tree)

- `npm run -s test:deploykeys`: tests 30, pass 30, fail 0, skipped 0
- `ENVIRONMENT=development GIT_KEY_PASSPHRASE=p45dummy COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null --random=false --filter='^RSA Key \((?!13\))' spec/jasmine/03-RsakeySpec.js`: Ran 16 of 17 specs, 16 specs, 0 failures
- `COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null spec/jasmine/CsrfRouteInventorySpec.js spec/jasmine/ZZ-CORSSpec.js spec/jasmine/GitHubLinkSpec.js`: 93 specs, 0 failures
- `npx eslint` on the seven plan files: clean
- `git diff --name-only <merge-base> HEAD -- . ':!.planning'`: exactly the seven plan files; `git status --porcelain -- lib spec`: empty
- No leftover `thinx-home-*` temp directory after the node test run

## Contract as built (for 45-02 / 45-04 / 45-05 / vault-transit Phase 40)

- `PATCH /api/v2/rsakey`, JSON `{filename, name}`, registered as
  `app.patch("/api/v2/rsakey", csrf.verifyCsrfToken, …)`. The responses are: 401 (no session, empty body),
  400 `invalid_body` (missing, null, array or primitive body), 400 `owner_invalid`, 400 `invalid_filename` (not a
  non-empty string), 400 `{success:false, response:"invalid_key_name", reason}`, 404 `key_not_found` (foreign, unknown,
  traversing, absolute, `.pub`, claim-only or empty-`.pub` key), 500 `rename_failed` (an unparseable `.pub` or a failed
  write), and 200 `{success:true, response:{name, fingerprint, date, pubkey, filename}}`.
- `rsakey.rename(owner, filename, name, callback(success, response, reason))`. It reads only `<ssh_keys>/<filename>.pub`.
  It writes `.<filename>.pub.<12 hex>.tmp` with `wx` and the `.pub` mode, chmods it, then `renameSync` over the `.pub`.
  On failure it unlinks the temp file. The filename never changes.
- `create(owner, cb, name)` now calls back `(false, "invalid_key_name", reason)` for a bad name. Existing two-argument
  callbacks are unaffected.
- The fingerprint changed once for every listed key (D-01, accepted). Neither console displayed the old value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in own RED test] Private-key spy probe asserted an exact call list**
- **Found during:** Task 1 GREEN
- **Issue:** The sanity probe expected `['readFileSync']`. fs-extra's `readFileSync` also goes through the wrapped
  `fs.openSync`, so the probe recorded `['readFileSync', 'openSync']`. The real assertion, that a rename makes no
  call on the private path, was not affected.
- **Fix:** The probe now asserts that `readFileSync` is among the recorded calls. This change went into the GREEN commit
  and is noted in its message.
- **Files modified:** spec/node/DeployKeyNames.test.js
- **Commit:** f0b866c5

**2. [Rule 2 - Correctness] The fingerprint checks the whole blob framing, not only the type prefix**
- **Found during:** Task 2 RED design
- **Issue:** The plan only asks that the decoded blob begin with the length-prefixed type. A truncated blob such as
  `ssh-rsa <first 40 base64 chars>` would pass that check and get a fingerprint that `ssh-keygen` would refuse.
- **Fix:** `openSSHBlob` also requires that the blob is made of whole length-prefixed fields (at least two). F1 covers
  the truncated case and expects null. The GitHub vector and the ssh-keygen comparison still match.
- **Files modified:** lib/thinx/rsakey.js
- **Commit:** 579e334f

**3. [Scope addition, tests only] Extra test coverage beyond the behavior list**
- An exhaustive classification of every UTF-16 code unit between two letters (validator); an array body (400
  `invalid_body`) in R1; claim-only and empty-`.pub` filenames in N3; and K1's check that the name still comes from
  `req.query` for GET and from `req.body` otherwise. No production behavior was changed for these.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. The new PATCH endpoint, its trust boundary and the `.pub` writer are covered by T-45-01..T-45-10 in the
plan's threat register. CORS still echoes allowlisted origins only; only the method list grew.

## Notes for the orchestrator

- STATE.md and ROADMAP.md were not updated, as instructed for the parallel wave.
- `services/console` was not touched or staged.

## Self-Check: PASSED

- All seven modified files exist.
- Commits c61ef62f, f0b866c5, abff541a and 579e334f are ancestors of HEAD and signed (`G`).
