---
phase: 25-session-bound-csrf-console-edge-headers
plan: 02
subsystem: console, csrf, edge-headers
tags: [console, classic, jquery, csrf-seam, nginx, parity, node-test]
status: complete

requires:
  - phase: 21
    provides: "XSRF-TOKEN cookie / X-XSRF-TOKEN header wire contract and assets/thinx/csrf.js public-page seam"
provides:
  - "Classic dashboard $.ajaxSetup beforeSend seam sending X-XSRF-TOKEN on API-bound calls (console submodule 3c906ff, thinx-staging, signed, unpushed)"
  - "scripts/check-console-headers.js: normalising console header parity checker (parse, normalise, compare, checkFiles, parseArgs)"
  - "spec/node/ConsoleHeaderParity.test.js (13 cases) and npm script check:headers"
affects: [25-04, 25-09, 25-10]

actuals:
  tokens: 9973
  tasks: 2
  commits: 1
  submodule_commits: 1
plan_head_before: 2d7ba9f64aa8783a56d5171900b71ba6d64b2b75
plan_head_after: 8f9be007c4cbe089b7475dc943eafd3974f42587

tech-stack:
  added: []
  patterns:
    - "Classic dashboard XSRF seam: second $.ajaxSetup with beforeSend, cookie read at send time, header only for urlBase or same-origin relative URLs"
    - "nginx-aware parity parse: quote-aware tokeniser, # comments only at token start, brace-depth block tree, proxy_hide_header resolved with nginx's own-level-else-inherited rule"

key-files:
  created:
    - services/console/src/test/xsrf-seam.cjs
    - scripts/check-console-headers.js
    - spec/node/ConsoleHeaderParity.test.js
  modified:
    - services/console/src/app/js/thinx-api.js
    - services/console/src/package.json
    - package.json

key-decisions:
  - "The seam also refuses protocol-relative URLs written with a backslash (/\\host), because browsers parse them as //host; the urlBase match requires urlBase itself or urlBase + '/' so a look-alike host cannot share the prefix"
  - "PROXY-CSP-NOT-HIDDEN follows nginx inheritance: a server-level proxy_hide_header Content-Security-Policy covers a proxy location unless that location sets its own proxy_hide_header (which drops the inherited one)"
  - "--canonical PATH swaps the canonical and keeps the default canonical snapshot as a compared file, which is how plan 25-09 step 4 uses it; --live is repeatable"
  - "Extra failure markers beyond the plan list, so a malformed file never passes silently: MALFORMED (add_header with more than 3 args or a non-always third arg), DUPLICATE-HEADER (non-CSP header repeated at server level), UNPARSEABLE (unterminated quote, unbalanced braces); usage errors exit 2"
  - "CSP DRIFT lines show only the directive/source parts that differ on each side, not the full 1.5 KB value"

patterns-established:
  - "Plain-node vm test for classic console scripts: load app/js/*.js with a Proxy stub jQuery and a fake document"

requirements-completed: [SEC-CSRF-05, SEC-CSRF-06, SEC-CSP-04]

coverage:
  - id: D1
    description: "Classic dashboard sends X-XSRF-TOKEN (decoded XSRF-TOKEN cookie, read at send time) on urlBase and relative calls, never to foreign or protocol-relative origins, with the contentType/withCredentials defaults intact"
    requirement: SEC-CSRF-05
    verification:
      - kind: unit
        ref: "services/console/src/test/xsrf-seam.cjs (npm run test:xsrf, 13 ok lines)"
        status: pass
      - kind: unit
        ref: "services/console/src/test/digest-guard.cjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Seam works in the real browser dashboard against the API once deployed (cold login, profile save, user delete under the new guards)"
    requirement: SEC-CSRF-06
    verification: []
    human_judgment: true
    rationale: "Not deployed by this plan; plan 25-04 ships the submodule commit and verifies live. The unit test proves the jQuery hook, not the deployed bundle."
  - id: D3
    description: "Parity checker normalises header sets and fails on drift and every structural hazard (location add_header, unhidden proxy CSP, duplicate CSP, empty value, no headers, missing file)"
    requirement: SEC-CSP-04
    verification:
      - kind: unit
        ref: "spec/node/ConsoleHeaderParity.test.js (13 tests)"
        status: pass
      - kind: other
        ref: "node scripts/check-console-headers.js on today's tree -> rc=1, HEADER-PARITY FAIL files=4 problems=26"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-09-29
---

# Phase 25 Plan 02: Classic Dashboard XSRF Seam + Console Header Parity Checker Summary

**The classic AngularJS dashboard now echoes the XSRF-TOKEN cookie as X-XSRF-TOKEN on API-bound $.ajax calls (committed in the console submodule, not pushed), and a dependency-free nginx header parity checker exists that fails on today's real console drift.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-09-29T14:15:32Z
- **Completed:** 2026-09-29T14:22:30Z
- **Tasks:** 2
- **Files modified:** 6 (3 in the console submodule, 3 in the parent)

## Accomplishments

- D-18 seam in `services/console/src/app/js/thinx-api.js`: a second `$.ajaxSetup( { beforeSend } )` after the existing contentType/withCredentials block. The cookie is read with the same regex and `decodeURIComponent` as `assets/thinx/csrf.js getCsrfCookie`. The header is set only when `settings.url` is urlBase, starts with `urlBase + "/"`, or is a same-origin relative path. `//host` and `/\host` are excluded. Nothing else in the file changed; `beforeSend` occurs exactly once.
- `services/console/src/test/xsrf-seam.cjs` (`npm run test:xsrf`) loads the real file into a `vm` context with a Proxy stub jQuery. It checks 13 behaviours: header value, relative URL, gravatar, protocol-relative, backslash, a look-alike host, missing url, no cookie, rotation picked up at send time, first ajaxSetup order in both the prod and localhost builds, and a single beforeSend.
- `scripts/check-console-headers.js` implements D-16/D-19/D-20. It exports `parse`, `normalise`, `compare`, `checkFiles`, `parseArgs` and `DEFAULT_INPUTS`, and takes `--canonical` and a repeatable `--live`. It prints `HEADER-PARITY OK files=N` (exit 0) or `HEADER-PARITY FAIL files=N problems=M` (exit 1).
- `spec/node/ConsoleHeaderParity.test.js` has 13 `node:test` cases on inline fixtures and does not read the real configs. The npm script is `check:headers`. `.circleci/config.yml` is untouched (0 matches); CI wiring is plan 25-09.

## Today's drift (fail-first run, for plan 25-09 to remove)

`node scripts/check-console-headers.js` on 2026-09-29 exits 1 with `HEADER-PARITY FAIL files=4 problems=26`:

- **PROXY-CSP-NOT-HIDDEN (18):** every proxy location in every input, which is why the API response carries two CSPs.
  - `console-default.conf.prod`: 5 locations, `^/[0-9a-f]{64}…` L30, `^/login` L48, `^/logout` L59, `^/api/` L70, `^/device/` L81.
  - `services/console/src/default.conf`: 5 locations (L33, L51, L62, L73, L84).
  - `services/console/vue/default.conf`: 3 locations, `^/[0-9a-f]{64}…` L31, `^/api/` L49, `^/device/` L60.
  - `rtm.thinx.cloud-server.post.nginx`: 5 locations (L42, L60, L71, L82, L93).
- **DRIFT in `services/console/src/default.conf`:**
  - `x-permitted-cross-domain-policies: canonical=all other=none`
  - `referrer-policy: canonical=(absent) other=strict-origin-when-cross-origin`
  - `permissions-policy: canonical=(absent) other=camera=(), geolocation=(), microphone=()`
  - `content-security-policy`: the canonical has `https://cdnjs.cloudflare.com` and `https://d37gvrvc0wt4s1.cloudfront.net` in default-src, script-src and style-src, and the image does not.
- **DRIFT in `services/console/vue/default.conf`:**
  - The same XPCDP, Referrer-Policy and Permissions-Policy lines as the classic image.
  - `content-security-policy`: the image lacks these canonical sources:
    - connect-src: `wss://console.thinx.cloud`, `wss://rtm.thinx.cloud`
    - default-src: gravatar (2), `app.thinx.cloud`, `avatars.githubusercontent.com`, `cdn.rollbar.com`, `cdnjs`, CloudFront
    - script-src: `'unsafe-eval'`, `api`/`cdn.rollbar.com`, `app`/`console`/`rtm.thinx.cloud`, `cdnjs`, CloudFront
    - style-src: gravatar (2), `api.rollbar.com`, `app.thinx.cloud`, `avatars`, `cdnjs`, CloudFront, `www.google-analytics.com`
- `rtm.thinx.cloud-server.post.nginx` has no DRIFT: it matches the canonical header set.

Note for 25-09: the Vue CSP drift includes `'unsafe-eval'` in script-src. If the Vue image is mirrored to the canonical as D-16 requires, the Vue image gains unsafe-eval. The live Vue host already serves the gluster file, so this changes only the image default, not production behaviour.

## Task Commits

1. **Task 1 (tracer): classic dashboard XSRF seam.** Console submodule commit `3c906ff` on `thinx-staging`, signed (`%G?` = G), 1 ahead of `origin/thinx-staging`, not pushed. Message: `fix(csrf): send X-XSRF-TOKEN from the classic dashboard (Phase 25 D-18)`. The parent gitlink is not committed: `git rev-parse HEAD:services/console` still prints `a5b02467…`, and the working tree shows ` M services/console` for plan 25-04 to commit.
2. **Task 2: console header parity checker.** Parent commit `8f9be007` (feat).

**Plan metadata:** see the docs(25-02) commit.

## TDD evidence

- **Task 1 RED:** before the seam, `node services/console/src/test/xsrf-seam.cjs` printed `FAIL thinx-api.js registers a $.ajaxSetup beforeSend` and exited 1. That is the target assertion; the file loaded cleanly. **GREEN:** 13 ok lines, and digest-guard still passes.
- **Task 2 RED:** a first run failed on `Cannot find module`, a load crash and therefore INVALID_RED, so an interface-only stub was added. Against the stub, all 13 tests failed on AssertionErrors. One vacuous pass in test 1 was closed with a positive-control assertion. **GREEN:** 13/13 pass.
- RED and GREEN were not committed separately. The plan requires a single signed submodule commit touching exactly the three seam files (its verify counts 3 files in HEAD), and this is a `type: execute` plan with one commit per task.

## Files Created/Modified

- `services/console/src/app/js/thinx-api.js`: D-18 beforeSend seam, 13 lines after the existing ajaxSetup block
- `services/console/src/test/xsrf-seam.cjs`: plain-node vm regression test for the seam
- `services/console/src/package.json`: `test:xsrf` script
- `scripts/check-console-headers.js`: parity checker and CLI
- `spec/node/ConsoleHeaderParity.test.js`: node:test spec
- `package.json`: `check:headers` script

## Decisions Made

See `key-decisions` in the frontmatter. In short: the seam's origin test is stricter than "starts with urlBase"; proxy_hide_header follows nginx's inheritance rule; `--canonical` keeps the default snapshot as a compared file; and there are extra fail-closed markers (MALFORMED, DUPLICATE-HEADER, UNPARSEABLE).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Stricter origin test in the seam**
- **Found during:** Task 1
- **Issue:** "starts with urlBase" would also match a look-alike host such as `https://rtm.thinx.cloud/api` + `x`. "Starts with / but not //" would let `/\evil.example`, which browsers normalise to `//evil.example`, receive the token (T-25-06).
- **Fix:** match urlBase exactly or `urlBase + "/"`, and reject `/\` as well as `//`. Tests were added for both cases.
- **Files modified:** services/console/src/app/js/thinx-api.js, services/console/src/test/xsrf-seam.cjs
- **Committed in:** console 3c906ff

**2. [Rule 2 - Missing critical] Fail-closed on malformed input**
- **Found during:** Task 2
- **Issue:** the plan's marker list has no failure for an unparseable file (unterminated quote, unbalanced braces), a malformed add_header, or a repeated non-CSP header. Any of these would otherwise be skipped or silently compared, the "silently passing" risk in T-25-07.
- **Fix:** added the UNPARSEABLE, MALFORMED and DUPLICATE-HEADER failure lines. Usage errors exit 2.
- **Files modified:** scripts/check-console-headers.js
- **Committed in:** 8f9be007

---

**Total deviations:** 2 auto-fixed (2 missing critical). **Impact:** both only tighten behaviour the plan specified. No scope creep, and no allowlist or skip flag.

## Issues Encountered

- A test fixture replaced `DENY` inside its existing double quotes, which produced the literal value `'DENY'`. The fixture was fixed; the implementation was correct.
- `eslint` flagged an unused catch binding. It was renamed to `_error`, and lint is now clean on both new parent files.

## User Setup Required

None.

## Next Phase Readiness

- Plan 25-04 can commit the `services/console` gitlink (currently a5b02467 → 3c906ff), push the console `thinx-staging` branch and deploy the seam before any new route guard.
- Plan 25-09 uses `node scripts/check-console-headers.js --canonical {new file}` and `--live {copy}`, and wires `node scripts/check-console-headers.js && node --test spec/node/ConsoleHeaderParity.test.js` into CI once the drift above is removed.

---
*Phase: 25-session-bound-csrf-console-edge-headers*
*Completed: 2026-09-29*

## Self-Check: PASSED
