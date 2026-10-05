---
phase: 25-session-bound-csrf-console-edge-headers
plan: 03
subsystem: auth
tags: [csrf, telemetry, redis, exemption, oauth, runbook, probe]
status: complete

requires:
  - phase: 25-01
    provides: "CSRF_MODE legacy|observe|signed, signed session-bound token, binding reason codes, pre-session priming, establishSession login rotation"
provides:
  - "Observe telemetry: every double-submit and binding failure bumps Redis hash csrf:obs:{YYYYMMDD UTC} field {mode}:{reason}:{METHOD} {route pattern}, 30-day expiry, fire-and-forget on app.redis_client"
  - "Lazy re-mint in ensureXsrfCookie (observe/signed) for persisted sessions whose XSRF-TOKEN does not bind; setBound clears the host-only duplicate"
  - "D-09 exemption: verifyCsrfToken returns next() first when request-local req.thx_auth is bearer or apikey; lib/router.js sets it only after verified Bearer (revocation passed or failed open) or API key"
  - "Google new-user callback no longer writes the session owner (login only through POST /login {token})"
  - "spec/jasmine/ZZ-CSRFEnforceSpec.js: CI enforce-mode flow against bootstrap.thx (9 cases)"
  - "scripts/csrf-live-probe.sh and scripts/csrf-obs-counters.js operator tools"
  - "Runbook section 'Phase 25: session-bound CSRF (CSRF_MODE)' and the Phase 25 Execution Annex"
affects: [25-04, 25-06, 25-08, 25-10]

actuals:
  tokens: 17450
  tasks: 3
  commits: 5
plan_head_before: 27e11b3dd0727e38b0ce78448ad8d52331364a61
plan_head_after: e04dc979b607076b3ab691b1049fb7799bd730d0

tech-stack:
  added: []
  patterns:
    - "Durable observe telemetry: HINCRBY + EXPIRE with callbacks on the node-redis legacy client, keyed by UTC day, field by mode/reason/method/route pattern; one warning per process on failure"
    - "Auth-verified exemption via a request-local flag (req.thx_auth), never the session and never header presence"
    - "Index-only commit of a single thinx.yml line (git hash-object -w + update-index --cacheinfo) next to unrelated uncommitted edits"

key-files:
  created:
    - spec/jasmine/ZZ-CSRFEnforceSpec.js
    - scripts/csrf-live-probe.sh
    - scripts/csrf-obs-counters.js
  modified:
    - lib/middleware/csrf.js
    - lib/router.js
    - lib/router.google.js
    - spec/jasmine/ZZ-CSRFSpec.js
    - spec/jasmine/CsrfSessionFlowSpec.js
    - .planning/runbooks/csp-csrf-hardening.md

key-decisions:
  - "Counter fields use req.route.path only when it is a string; array or regex route paths fall back to the query-less URL (verifyCsrfToken is always route middleware on string paths today)"
  - "The Google callback log lines keep the [NEW_SESSION] tag (lib/thinx/statistics.js parses [OID:…] lines) and now read userWrapper.owner"
  - "csrf-obs-counters.js silences console.* before requiring globals.js, so config paths and reconnect notices can never reach its output; output goes through process.stdout only"
  - "csrf-live-probe.sh redacts any response field that looks like a 24+ character hex value, on top of printing no cookie or token values"
  - "ZZ-CSRFEnforceSpec case 6 also reads Redis sess:{sid} and asserts it holds no thx_auth, proving the flag is request-local"

patterns-established:
  - "Probe output contract: key=value lines, {http_code}:{response} per POST, exit 2 on transport failure"

requirements-completed: [SEC-CSRF-02, SEC-CSRF-03, SEC-CSRF-05]

coverage:
  - id: D1
    description: "Observe telemetry: binding and double-submit failures log one reason-coded line and bump csrf:obs:{UTC date} {mode}:{reason}:{METHOD} {route pattern} with a 30-day EXPIRE; param routes store the pattern; a missing, failing or throwing redis client never throws"
    requirement: SEC-CSRF-02
    verification:
      - kind: unit
        ref: "spec/jasmine/ZZ-CSRFSpec.js#observe telemetry and lazy re-mint (25-03, D-06/D-17) t1-t6"
        status: pass
      - kind: other
        ref: "grep -c HINCRBY lib/middleware/csrf.js = 3, lower-case hincrby( = 0 (TELEMETRY-WIRED)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lazy re-mint of a bound token for persisted sessions with a stale, foreign or missing XSRF-TOKEN; host-only duplicate cleared; anonymous requests get no cookie and no session write"
    requirement: SEC-CSRF-02
    verification:
      - kind: unit
        ref: "spec/jasmine/ZZ-CSRFSpec.js#t7, t7-bound, t7-duplicate, t7-anon, t7-throw"
        status: pass
      - kind: integration
        ref: "spec/jasmine/CsrfSessionFlowSpec.js#a logged-in session carrying a pre-deploy 48-hex cookie gets a bound token on its next GET, and the new pair passes (25-03 lazy migration)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Only verified Bearer / API-key requests are exempt (req.thx_auth); header presence, other flag values and body owner_id/api_key pairs are checked; exemption holds in legacy and observe"
    requirement: SEC-CSRF-05
    verification:
      - kind: unit
        ref: "spec/jasmine/ZZ-CSRFSpec.js#verified-auth exemption through req.thx_auth (D-09, SEC-CSRF-05) x1-x6"
        status: pass
      - kind: other
        ref: "router.js bearer=2 apikey=1 regen=0; router.google.js google_write=0 (EXEMPTION-WIRED)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Enforce-mode flow against the real app in CI (prime, password and token login rotation, pre-login and stale token refused, Bearer exemption, Bearer bridge keeps the session id, logout clear)"
    requirement: SEC-CSRF-03
    verification: []
    human_judgment: true
    rationale: "ZZ-CSRFEnforceSpec needs Redis and CouchDB (bootstrap.thx); only syntax and structure were checked here (CI-SPEC-READY). Its real run is the CircleCI test job of the plan 25-04 push."
  - id: D5
    description: "Live probe prints the legacy baseline from production and never leaks a token"
    requirement: SEC-CSRF-02
    verification:
      - kind: other
        ref: "bash scripts/csrf-live-probe.sh against https://app.thinx.cloud/api at 2026-09-29T14:34:54Z (PROBE-LEGACY-BASELINE)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Runbook documents CSRF_MODE states, flip, one-command rollback, reason-code classification, telemetry reads, probe expectations, index-only thinx.yml commit and the Phase 25 annex"
    verification:
      - kind: other
        ref: "RUNBOOK-SECTION-OK grep gate over .planning/runbooks/csp-csrf-hardening.md"
        status: pass
    human_judgment: true
    rationale: "The grep gate proves the strings exist; whether the procedure is operable on micro is judged when 25-04/25-06 execute it."

duration: 12min
completed: 2026-09-29
---

# Phase 25 Plan 03: Observe Telemetry, Verified-Auth Exemption and Operator Tools Summary

**Every CSRF failure now logs one reason-coded line and bumps a 30-day Redis counter `csrf:obs:{UTC day}` / `{mode}:{reason}:{METHOD} {route pattern}`. Persisted sessions with pre-deploy tokens get a bound one lazily. Only a verified Bearer token or API key (request-local `req.thx_auth`) skips the check. The Google callback no longer writes the session. A CI enforce-mode spec, a production probe, a counter reader and the CSRF_MODE runbook are ready for the rollout plans.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-29T14:25:17Z
- **Completed:** 2026-09-29T14:37:30Z
- **Tasks:** 3
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments

- `lib/middleware/csrf.js`: `countFailure()` runs on both double-submit branches (fail-open and enforced; log strings unchanged) and on every binding failure (observed and rejected). It calls `HINCRBY` + `EXPIRE 2592000` with callbacks on `_app.redis_client`, wrapped in try/catch, and logs at most one `CSRF telemetry counter failed: {code}` line per process. Fields hold the mode, the reason, the method and the route pattern, never a token, session id or owner id.
- `ensureXsrfCookie` in observe/signed now re-mints a bound token when a persisted session's cookie does not bind (a 48-hex, foreign or missing token). `setBound` clears the host-only `XSRF-TOKEN` when the raw Cookie header carries more than one. Requests without a persisted session still get no cookie and no session write (D-02).
- The D-09 exemption is the first statement of `verifyCsrfToken`. `lib/router.js` sets `req.thx_auth = "bearer"` on the revocation fail-open path and the success path (never on 401/403), and `"apikey"` inside `if (vsuccess)`. The Bearer bridge carries a comment saying it never rotates the session id.
- `lib/router.google.js`: removed the session owner write and its log line from `processGoogleCallbackError`. The remaining `[OID:…]` lines read `userWrapper.owner`.
- `spec/jasmine/ZZ-CSRFEnforceSpec.js`: 9 ordered cases against `bootstrap.thx`. It sets and restores `CSRF_MODE=signed` / `CSRF_ENFORCE=true`, uses `chai.request(thx.app)` 12 times, and forwards cookies by hand.
- `scripts/csrf-live-probe.sh` and `scripts/csrf-obs-counters.js`, plus the runbook section and the empty Phase 25 Execution Annex.
- The local five-file set runs 122 specs with 0 failures (also in random order). eslint is clean on every touched JS file.

## Production legacy baseline (probe, 2026-09-29T14:34:54Z, `https://app.thinx.cloud/api`)

```
anon_set_cookie=1
prime_token_shape=legacy
pre_session_ttl_s=0
valid=200:email_required
planted=200:email_required
stale=200:email_required
header_less=403:csrf_token_invalid
rc=0
```

This matches the expected legacy baseline (PROBE-LEGACY-BASELINE). No line carries a cookie or token value. The five POSTs were `{}` bodies that `user/create` refuses before any write.

## Task Commits

1. **Task 1 (tracer): observe telemetry and lazy re-mint**
   - RED `fad0e509` (test): 10 failing specs, `RED_EVIDENCE_OK` (target t1)
   - GREEN `03d6b27f` (feat)
2. **Task 2: verified-auth exemption, Bearer bridge, Google callback**
   - RED `e25ce13e` (test): 3 failing specs (x1, x2, x6). x3–x5 pinned behaviour that already held, as regression guards. `RED_EVIDENCE_OK` (target x1)
   - GREEN `f003d23d` (feat)
3. **Task 3: CI enforce spec, probe, counter script, runbook:** `e04dc979` (feat)

No REFACTOR commits were needed.

## TDD Gate Compliance

Tasks 1 and 2 each have a `test(25-03)` commit before their `feat(25-03)` commit. Each RED record was written with the TAP reporter wrapper and checked with `gsd-tools check tdd-red-evidence`, which returned `RED_EVIDENCE_OK`. Task 3 is `type="auto"` without `tdd`.

## Tracer Feedback Gate

Task 1 is a tracer. The run was interactive (`auto_advance` false) and `human_verify_mode` was the default `end-of-phase`, and the verify block was automated only. I re-ran it before starting Task 2: CSRF-SPECS-GREEN (107 specs, 0 failures) and TELEMETRY-WIRED (HINCRBY=3, lowercase=0, using the corrected grep described under Deviations). No checkpoint was synthesized.

## Files Created/Modified

- `lib/middleware/csrf.js`: telemetry (`obsKey`, `telemetryFailed`, `countFailure`, `counterRoute`), lazy re-mint, duplicate clear, `req.thx_auth` exemption
- `lib/router.js`: `req.thx_auth` on the two verified Bearer paths and the verified API-key path; bridge comment
- `lib/router.google.js`: no session owner write in the Google new-user callback
- `spec/jasmine/ZZ-CSRFSpec.js`: 11 telemetry/re-mint specs and 6 exemption specs
- `spec/jasmine/CsrfSessionFlowSpec.js`: lazy-migration flow case
- `spec/jasmine/ZZ-CSRFEnforceSpec.js` (new): CI enforce-mode flow
- `scripts/csrf-live-probe.sh` (new): production probe
- `scripts/csrf-obs-counters.js` (new): read-only counter dump
- `.planning/runbooks/csp-csrf-hardening.md`: Phase 25 CSRF_MODE section and annex

## Decisions Made

See `key-decisions` in the frontmatter. In short:

- Counter routes use the string `req.route.path`, else the query-less URL.
- The Google logs keep the `[NEW_SESSION]` tag because statistics parsing depends on it.
- The counter script silences `console.*`.
- The probe redacts hex-looking response fields.
- The enforce spec asserts that no `thx_auth` reaches the stored session.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two verify commands can never print their marker when the code is correct**
- **Found during:** Task 1 (TELEMETRY-WIRED) and Task 2 (EXEMPTION-WIRED)
- **Issue:** `L=$(grep -c 'hincrby(' …)`, `R=$(… | grep -c 'session.regenerate')` and `G=$(… | grep -c 'session.owner =')` sit inside `&&` chains. `grep -c` exits 1 when the count is 0, and 0 is exactly the passing value, so the chain stops before the marker. Run as written, both returned rc=1 with no marker.
- **Fix:** I re-ran the identical commands with `|| true` on those zero-expected greps only. That gave TELEMETRY-WIRED (HINCRBY=3 lowercase=0) and EXEMPTION-WIRED (bearer=2 apikey=1 regen=0 google_write=0). To confirm the Google check is not vacuous, I checked that the awk range covers 14 lines and that it counts 1 `session.owner =` at the plan base. No code change was needed.
- **Files modified:** none (verification only)
- **Committed in:** n/a

**2. [Rule 2 - Privacy] The counter script's output cannot carry module log lines**
- **Found during:** Task 3
- **Issue:** Requiring `globals.js` inside the container logs `Configuration loaded from: <path>`, and its reconnect notices would mix into the count output the plan says must hold counts only.
- **Fix:** `console.*` is silenced up front, and results go through `process.stdout.write`. I checked this with a fake redis/globals pair whose `require` logs a host-like line: the output held only rows and `OBS-TOTAL`.
- **Files modified:** scripts/csrf-obs-counters.js
- **Committed in:** e04dc979

---

**Total deviations:** 2 (1 plan-verify defect worked around without code changes, 1 privacy hardening). **Impact:** none on scope. Plan checkers should fix the `grep -c` pattern in future verify blocks (`grep -c … || true`).

## Issues Encountered

- `ZZ-CSRFEnforceSpec.js` could not run locally: no Redis or CouchDB, and the CI config expects `/mnt/data/conf`. It passes `node --check`, CI-SPEC-READY (mode_refs=7, chai_requests=12) and eslint. As the plan intends, its real run is the CircleCI `test` job of the 25-04 push. I checked the CI path for it: `Dockerfile.test` copies `spec/mnt` to `/mnt`, so `csrf.js` finds the spec `node-session.json` secret and gets an HKDF key for signed mode. connect-redis 9 uses the `sess:` prefix that case 6 reads.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat register (T-25-08..11). The Redis hash is T-25-09, and the probe and counter scripts are operator-run tools that expose no new endpoint.

## User Setup Required

None. Nothing is pushed or deployed in this plan. With `CSRF_MODE` unset, production stays legacy. The two legacy-visible changes are that double-submit failures now also bump the `csrf:obs:*` counters (fields prefixed `legacy:`), and that verified Bearer and API-key requests skip the token check.

## Next Phase Readiness

- 25-04 pushes these commits. Its CircleCI `test` job is the first real run of `ZZ-CSRFEnforceSpec.js`. If `dynamic` cannot log in at that point in the CI order, switch to the credentials `ZZ-RouterAPIKeySpec.js` uses. The spec uses `dynamic`/`dynamic`, as `ZZ-RouterAPIKeySpec.js` and `ZZ-CookieAttributeSpec.js` do.
- 25-06 uses the runbook's classification rule, the counter script and the probe (observe expectations). 25-08 uses `--guards`. The Phase 25 Execution Annex is empty and ready.

---
*Phase: 25-session-bound-csrf-console-edge-headers*
*Completed: 2026-09-29*

## Self-Check: PASSED

- The 3 created files and the SUMMARY are on disk. Commits fad0e509, 03d6b27f, e25ce13e, f003d23d and e04dc979 are all found.
- Plan verification re-run: EXEMPTION-SPECS-GREEN (122 specs, 0 failures), PROBE-LEGACY-BASELINE, RUNBOOK-SECTION-OK and CI-SPEC-READY. TELEMETRY-WIRED and EXEMPTION-WIRED pass with the `grep -c … || true` correction (Deviation 1). `package.json` is unchanged.
