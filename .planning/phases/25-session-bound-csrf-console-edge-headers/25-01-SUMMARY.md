---
phase: 25-session-bound-csrf-console-edge-headers
plan: 01
subsystem: auth
tags: [csrf, session, express-session, hmac, hkdf, login, session-fixation]

# Dependency graph
requires:
  - phase: 24
    provides: "CSRF_SECRET Docker secret mounted on thinx_api; readSecret() in lib/thinx/secrets.js"
provides:
  - "CSRF_MODE legacy|observe|signed in lib/middleware/csrf.js (legacy default, also for unset/unrecognised)"
  - "Module-scope CSRF key: CSRF_SECRET, else HKDF-SHA256(node-session.json secret, 'thinx-csrf', 'csrf-v1', 32), else none"
  - "Signed token {64 hex HMAC}.{32 hex nonce} bound to req.sessionID, length-prefixed MAC input"
  - "Binding reason codes missing / session_mismatch / stale / binding_mismatch (+ no_key)"
  - "15-minute pre-session written only by the priming GET (csrf_pre marker)"
  - "establishSession(req, res, csrf, owner, cb): regenerate, rotate, owner + markLogin"
  - "Password and token login regenerate the session and answer with a rotated XSRF-TOKEN; logout clears it"
  - "csrf.assertReady() at boot in thinx-core.js; process.exit(1) when observe/signed has no key"
  - "Local flow spec CsrfSessionFlowSpec.js (no Redis/CouchDB) and rewritten ZZ-CSRFSpec.js"
affects: [25-02, 25-03, 25-04, 25-05, 25-10, router.js Bearer bridge, router.user.js, console CSRF seams]

# Actuals (#2632) — chars/4 over the realized diff
actuals:
  tokens: 17624
  tasks: 2
  commits: 4
plan_head_before: 91d31721b4cff10796ff7ce39c2919769b73325e
plan_head_after: 129b2e16de437f5d339d3914c6f6acb4c55ab0ad

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-scope memoised key with a per-call mode read (three csrf factory instances share one key)"
    - "Pre-session only in the priming handler; the global middleware never creates session state in observe/signed"
    - "Login-only establishSession seam; Bearer bridge and session/token never regenerate"
    - "Local express + MemoryStore flow spec with manual cookie forwarding"

key-files:
  created:
    - lib/thinx/establish_session.js
    - spec/jasmine/CsrfSessionFlowSpec.js
  modified:
    - lib/middleware/csrf.js
    - lib/router.auth.js
    - thinx-core.js
    - spec/jasmine/ZZ-CSRFSpec.js

key-decisions:
  - "establishSession queues the rotated XSRF-TOKEN before writing owner/markLogin, so a mint failure leaves no owned session behind"
  - "Priming with no req.session (express-session store disconnected) answers 503 service_unavailable instead of throwing"
  - "Priming without a key answers 503 csrf_key_unavailable before any pre-session is written"
  - "Unrecognised non-empty CSRF_MODE logs one warning per process; unset or empty stays silent legacy"
  - "Binding check failures from a missing key surface as reason=no_key (unreachable once assertReady passed)"

patterns-established:
  - "Binding log line: CSRF binding <observed|rejected> reason=<code> mode=<mode> xsrf_cookies=<n> for <METHOD> <route>"
  - "Boot line: CSRF mode=<mode> key_source=<secret|hkdf|none> enforce=<bool>"

requirements-completed: [SEC-CSRF-02, SEC-CSRF-03]

coverage:
  - id: D1
    description: "Signed-mode priming creates one 15-minute pre-session and echoes a signed token equal to its single XSRF-TOKEN Set-Cookie"
    requirement: SEC-CSRF-02
    verification:
      - kind: integration
        ref: "spec/jasmine/CsrfSessionFlowSpec.js#cold prime creates one pre-session and a signed token bound to it (D-01, D-03)"
        status: pass
      - kind: unit
        ref: "spec/jasmine/ZZ-CSRFSpec.js#6s. priming creates the pre-session and echoes the minted value"
        status: pass
    human_judgment: false
  - id: D2
    description: "Only the priming GET writes a pre-session (D-02) in observe and signed"
    requirement: SEC-CSRF-02
    verification:
      - kind: integration
        ref: "spec/jasmine/CsrfSessionFlowSpec.js#a cookieless request to any other route writes no session and sets no cookie, in observe and signed (D-02)"
        status: pass
      - kind: unit
        ref: "spec/jasmine/ZZ-CSRFSpec.js#5s. a cookieless request gets no mint and no session write"
        status: pass
    human_judgment: false
  - id: D3
    description: "Password/token login regenerates the session, rotates XSRF-TOKEN, destroys the pre-login id; old and cross-session tokens are refused 403"
    requirement: SEC-CSRF-03
    verification:
      - kind: integration
        ref: "spec/jasmine/CsrfSessionFlowSpec.js#login regenerates the session and answers with a rotated token (D-03, SEC-CSRF-03)"
        status: pass
      - kind: integration
        ref: "spec/jasmine/CsrfSessionFlowSpec.js#the rotated pair passes a guarded route and the pre-login token is refused (D-03)"
        status: pass
      - kind: integration
        ref: "spec/jasmine/CsrfSessionFlowSpec.js#a token minted for session B is refused on session A (SC-1, planted sibling cookie)"
        status: pass
      - kind: integration
        ref: "spec/jasmine/CsrfSessionFlowSpec.js#two consecutive logins give distinct sessions and tokens, and the first token is refused on the second session"
        status: pass
      - kind: integration
        ref: "spec/jasmine/CsrfSessionFlowSpec.js#a regenerate store error answers 503 service_unavailable and never gives the old session an owner"
        status: pass
    human_judgment: false
  - id: D4
    description: "Logout clears XSRF-TOKEN with the mint's Domain and Path, with or without a session"
    requirement: SEC-CSRF-03
    verification:
      - kind: integration
        ref: "spec/jasmine/CsrfSessionFlowSpec.js#logout clears XSRF-TOKEN with the Domain and Path it was minted with, with or without a session (SEC-CSRF-03)"
        status: pass
      - kind: unit
        ref: "spec/jasmine/ZZ-CSRFSpec.js#12. rotate() is a no-op in legacy and clear() drops the cookie with the mint's Domain and Path"
        status: pass
    human_judgment: false
  - id: D5
    description: "Key resolved once per process (secret, hkdf, none), stable across resets; assertReady fails closed for observe/signed; thinx-core exits on it"
    requirement: SEC-CSRF-02
    verification:
      - kind: unit
        ref: "spec/jasmine/ZZ-CSRFSpec.js#falls back to HKDF of the session secret, identical across resets (the redeploy proxy)"
        status: pass
      - kind: unit
        ref: "spec/jasmine/ZZ-CSRFSpec.js#assertReady() throws csrf_key_unavailable for observe and signed without a key, not for legacy"
        status: pass
      - kind: other
        ref: "grep -c 'csrf.assertReady()' thinx-core.js == 1, process.exit(1) on its catch (FAIL-CLOSED-WIRED)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Legacy double-submit contract pinned under explicit, unset and unrecognised CSRF_MODE; token boundary and length-prefix precision cases"
    requirement: SEC-CSRF-02
    verification:
      - kind: unit
        ref: "spec/jasmine/ZZ-CSRFSpec.js (61 specs, 0 failures)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real production login flows (password, Google, GitHub) on both consoles under observe/signed"
    requirement: SEC-CSRF-03
    verification: []
    human_judgment: true
    rationale: "This plan proves the flow on a local express app only; the deployed cold-login and redeploy checks are the operator checkpoint in later phase-25 plans (D-07, SEC-CSRF-06)"

# Metrics
duration: 12min
completed: 2026-09-29
status: complete
---

# Phase 25 Plan 01: Session-Bound CSRF Token and Login Rotation Summary

**HMAC-SHA256 XSRF token bound to the express-session id (key from CSRF_SECRET, else HKDF of the session secret, fail closed). The priming GET creates a 15-minute pre-session, password and token logins regenerate the session and rotate the token, and logout clears it. All of this sits behind a three-state CSRF_MODE whose default stays v1.13 legacy.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-29T13:59:37Z
- **Completed:** 2026-09-29T14:11:15Z
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `lib/middleware/csrf.js` now has `CSRF_MODE` legacy|observe|signed. Legacy is the default, including when the variable is unset or unrecognised. The key lives at module scope, and the token is a length-prefixed HMAC over `req.sessionID` and a nonce, compared with `timingSafeEqual`. Binding failures carry reason codes. In observe the failure is only logged; in signed it is rejected when `CSRF_ENFORCE` is on.
- Priming writes a `csrf_pre` pre-session with a 15-minute lifetime, and only when no session is persisted. The echo always equals the last `XSRF-TOKEN` Set-Cookie. In observe and signed, the global middleware no longer mints or touches the session.
- New `lib/thinx/establish_session.js`. Both `loginAction` and `performTokenLogin` regenerate the session before writing the owner, answer 503 `service_unavailable` on a store error, and send the rotated token in the login response. `logoutAction` clears `XSRF-TOKEN` with the same Domain and Path it was minted with.
- `thinx-core.js` calls `csrf.assertReady()` between the csrf factory and `ensureXsrfCookie`. In observe or signed, a missing key makes the process exit.
- Specs: new `CsrfSessionFlowSpec.js` (12 cases, local express + MemoryStore) and a rewritten `ZZ-CSRFSpec.js` (61 cases). The four-file local set runs 95 specs, 0 failures, and also passes in random order.

## Task Commits

1. **Task 1 (tracer): signed prime, pre-session, login regenerate + rotation, logout clear**
   - RED `d1809041` (test): flow spec + interface scaffolds, 12/12 failing on assertions, `RED_EVIDENCE_OK`
   - GREEN `3bc9bec9` (feat)
2. **Task 2: key hardening, fail-closed start, legacy contract, ZZ-CSRFSpec rewrite**
   - RED `7d9c9db8` (test): 20/61 failing (warning, assertReady, key none, override), `RED_EVIDENCE_OK`
   - GREEN `129b2e16` (feat)

No REFACTOR commits were needed.

## TDD Gate Compliance

Both tasks followed RED then GREEN. Each RED run was checked with `gsd-tools check tdd-red-evidence` using a TAP reporter wrapper and returned `RED_EVIDENCE_OK`. Task 1 targeted "login regenerates the session…" and Task 2 targeted "resolves to none with no CSRF_SECRET and no session secret".

## Tracer Feedback Gate

Task 1 is a tracer. The run was interactive, `human_verify_mode` was `end-of-phase`, and the verify block was automated only. I re-ran it: FLOW-SPEC-GREEN (12 specs, 0 failures) and LOGIN-SEAMS-WIRED (establish=2, clear=1). The tracer was verified end to end before expanding to Task 2. No checkpoint was synthesized.

## Files Created/Modified

- `lib/middleware/csrf.js`: mode, key, mint/check, binding reasons, pre-session priming, rotate, clear, assertReady, test seam
- `lib/thinx/establish_session.js` (new): login-only regenerate + rotate + owner/markLogin helper
- `lib/router.auth.js`: password and token login use establishSession; logout clears XSRF-TOKEN
- `thinx-core.js`: fail-closed `csrf.assertReady()` at boot
- `spec/jasmine/CsrfSessionFlowSpec.js` (new): local end-to-end flow spec
- `spec/jasmine/ZZ-CSRFSpec.js`: legacy contract ×3 modes, signed/observe twins, key, boundary, precision

## Decisions Made

- `establishSession` queues the rotated token **before** writing `owner`/`markLogin`. The token needs only the new session id, and if the mint throws, no owned session is left behind. The "regenerate before owner/markLogin/maxAge" ordering still holds.
- If priming finds no `req.session` (express-session skips it when the Redis store is disconnected), it answers 503 `service_unavailable` rather than throwing a TypeError that becomes a 500.
- Priming checks for the key before writing the pre-session, so a key-less request never stores a tokenless session.
- An unrecognised non-empty `CSRF_MODE` warns once per process. Unset or empty is silent legacy.
- The factory's `isEnforced()` now delegates to the module-level `isEnforcedByEnvOrConfig()`, which `assertReady()` also uses for its boot line. Behaviour is identical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] 503 on priming without a session**
- **Found during:** Task 1 (issueCsrfToken observe/signed branch)
- **Issue:** When the store is disconnected, express-session calls `next()` without `req.session`. Writing `req.session.csrf_pre` would then throw, and the request would 500.
- **Fix:** Priming answers `Util.failureResponse(res, 503, "service_unavailable")` and logs a warning.
- **Files modified:** lib/middleware/csrf.js
- **Committed in:** 3bc9bec9

**2. [Rule 1 - Ordering] rotate() before owner/markLogin in establishSession**
- **Found during:** Task 1 (establish_session.js)
- **Issue:** The plan order was owner, markLogin, rotate. If rotate throws inside the regenerate callback, the exception is uncaught and the new session already holds an owner.
- **Fix:** rotate runs in a try/catch first. A failure calls back with the error before any owner is written.
- **Files modified:** lib/thinx/establish_session.js
- **Committed in:** 3bc9bec9

**3. [Rule 2 - Privacy] Boolean assertion for the key-none spec**
- **Found during:** Task 2 RED run
- **Issue:** `expect(resolveKey()).to.equal(null)` printed key bytes in its failure message.
- **Fix:** It is now a boolean assertion, so a failure cannot print the key.
- **Files modified:** spec/jasmine/ZZ-CSRFSpec.js
- **Committed in:** 7d9c9db8

---

**Total deviations:** 3 auto-fixed (2 missing critical/privacy, 1 ordering). **Impact:** all three are needed for correctness and log hygiene. No scope creep.

## Issues Encountered

- The parallel-login backstop case is tolerant by design. If the second request loads the session after the first one has destroyed it, it gets 403 `csrf_token_invalid` (`session_mismatch`) instead of a pair. The spec asserts that every 200 response carries a self-consistent pair, that at least one login succeeds, and that the pre-login session never gains an owner.
- Two new specs are in `spec/jasmine/` without a `ZZ-` prefix (`CsrfSessionFlowSpec.js`, plus the existing `CookiePolicySpec.js`). They need no services, so they run in the normal CI jasmine pass.

## Known Stubs

None. The RED scaffolds from `d1809041` (`establishSession` not_implemented, csrf no-op `rotate`/`clear`/`check`) were fully replaced in `3bc9bec9`.

## User Setup Required

None. Nothing is deployed or pushed in this plan. With `CSRF_MODE` unset, production behaviour stays legacy. The one legacy-mode changes are that logout now clears `XSRF-TOKEN` and priming echoes the freshly minted token first.

## Next Phase Readiness

- 25-02 and later can wire `req.thx_auth` exemptions into `verifyCsrfToken`, add the persisted-session re-mint in `ensureXsrfCookie` (25-03 hook comment in place), and build the CI enforce-mode spec against `bootstrap.thx`.
- Accepted debt (assumption-delta decision): the legacy branch (mint-if-absent random token) stays in csrf.js until signed has run clean in production. 25-10 records its retirement as a follow-up.

---
*Phase: 25-session-bound-csrf-console-edge-headers*
*Completed: 2026-09-29*

## Self-Check: PASSED

- All 6 key files present; commits d1809041, 3bc9bec9, 7d9c9db8, 129b2e16 found.
- Plan verification re-run: FLOW-SPEC-GREEN, LOGIN-SEAMS-WIRED, CSRF-SPECS-GREEN (95 specs, 0 failures), FAIL-CLOSED-WIRED; eslint clean; `git diff --quiet package.json package-lock.json` holds; spec output contains no signed/48-hex token, spec session id or key.
