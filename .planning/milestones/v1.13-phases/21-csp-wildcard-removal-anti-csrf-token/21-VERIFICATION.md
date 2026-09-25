---
phase: 21-csp-wildcard-removal-anti-csrf-token
verified: 2026-09-25T10:16:09Z
status: passed
score: 19/19 must-haves verified (includes 3 overrides)
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-01-PLAN.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-01-SUMMARY.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-02-PLAN.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-02-SUMMARY.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-03-PLAN.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-03-SUMMARY.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-04-PLAN.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-04-SUMMARY.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-05-PLAN.md
  - .planning/phases/21-csp-wildcard-removal-anti-csrf-token/21-05-SUMMARY.md
  - .planning/runbooks/console-csp-source-of-truth.md
  - .planning/runbooks/csp-csrf-hardening.md
  - .planning/runbooks/swarm-configs/console-default.conf.prod
  - .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx
  - .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx
  - conf/config-localhost.json
  - conf/config-sample.json
  - lib/middleware/cookie-policy.js
  - lib/middleware/cors.js
  - lib/middleware/csrf.js
  - lib/router.auth.js
  - lib/router.user.js
  - services/console/src/assets/thinx/auth.js
  - services/console/src/assets/thinx/csrf.js
  - services/console/src/assets/thinx/login.js
  - services/console/src/assets/thinx/password.js
  - services/console/src/auth.html
  - services/console/src/default.conf
  - services/console/src/gulpfile.js
  - services/console/src/index.html
  - services/console/src/password.html
  - services/console/vue/default.conf
  - services/console/vue/src/core/api.js
  - services/console/vue/src/pages/Login/Login.vue
  - services/console/vue/src/pages/OAuthReturn/OAuthReturn.vue
  - services/console/vue/src/pages/PasswordReset/PasswordReset.vue
  - services/console/vue/src/store/auth.js
  - services/console/vue/src/utils/cookies.js
  - spec/jasmine/CookiePolicySpec.js
  - spec/jasmine/ZZ-CSRFSpec.js
  - spec/mnt/data/conf/config.json
  - thinx-api-openapi.yaml
  - thinx-core.js
covered_digest: "v1:sha256:3c5f87ed65fbaa59563d31aba6e707e270a126310f40b205b3f51a691ed59973"
behavior_unverified: 0
overrides_applied: 3
overrides:
  - must_have: "HawkScan rescan of rtm.thinx.cloud reports 0 NEW CSP: Wildcard Directive (plugin 10055-4) paths"
    reason: "StackHawk deprecated and removed (bb0ce4a7). No scheme wildcard in any repo CSP source or in the live gluster-mounted CSP (verified 2026-09-25)."
    accepted_by: "operator (Matej Sychra)"
    accepted_at: "2026-09-25T10:19:23Z"
  - must_have: "HawkScan rescan reports 0 NEW Anti-CSRF Tokens (plugin 20012) paths"
    reason: "StackHawk deprecated and removed (bb0ce4a7). Enforcement live since 2026-09-25 09:02Z: header-less login 403 csrf_token_invalid; normal cold logins on both consoles verified by the operator; hidden _csrf fields on all classic POST forms."
    accepted_by: "operator (Matej Sychra)"
    accepted_at: "2026-09-25T10:19:23Z"
  - must_have: "The three CSP definitions are byte-for-byte equivalent modulo the host-token placeholder"
    reason: "Production serves one gluster bind-mounted file to both consoles (console-csp-source-of-truth.md), so the effective policy is identical on both hosts. The image configs are inert, differ only by production-only extra hosts or a stricter Vue policy, and carry no scheme wildcard. Alignment is tracked by that runbook's retirement path."
    accepted_by: "operator (Matej Sychra)"
    accepted_at: "2026-09-25T10:19:23Z"
gaps:
  - truth: "ROADMAP SC1: a HawkScan rescan of rtm.thinx.cloud reports 0 NEW 'CSP: Wildcard Directive' (plugin 10055-4) paths"
    status: failed
    reason: "The rescan was never run. The operator waived it because StackHawk is deprecated, and the integration was removed in bb0ce4a7 (stackhawk.yml deleted). The behaviour the criterion describes is otherwise evidenced (truth 2): none of the five CSP sources in the repo has an https:, wss: or * scheme wildcard, and the orchestrator reports the live header has none either. The criterion as written, a scanner result, cannot be met any more. This is a waiver to accept, not an implementation gap."
    artifacts:
      - path: "stackhawk.yml"
        issue: "Deleted in bb0ce4a7; the rescan procedure in csp-csrf-hardening.md is marked retired"
    missing:
      - "Either a recorded override accepting the waiver (see the suggested overrides in the report body), or a substitute scanner check against rtm.thinx.cloud for CSP scheme wildcards"
  - truth: "ROADMAP SC2: a HawkScan rescan reports 0 NEW 'Anti-CSRF Tokens' (plugin 20012) paths"
    status: failed
    reason: "Same waiver as SC1: no rescan was run. The underlying behaviour is evidenced (truth 4). The code rejects missing and forged tokens with 403 (ZZ-CSRFSpec 28/0, run here), and the orchestrator's live probes confirm it: header-less login returns 403 csrf_token_invalid with reason=no_cookie, a primed login returns invalid_credentials. The operator also confirmed normal login through both consoles. Hidden _csrf fields sit on all five classic POST forms, which is the static markup plugin 20012 inspects."
    artifacts:
      - path: "stackhawk.yml"
        issue: "Deleted in bb0ce4a7"
    missing:
      - "Either a recorded override accepting the waiver, or a substitute scanner check for plugin-20012-style form-token findings"
  - truth: "ROADMAP SC5: the three CSP definitions (nginx-edge pre/post snapshot, src/default.conf, vue/default.conf) are byte-for-byte equivalent modulo the host-token placeholder"
    status: failed
    reason: "They are not equivalent. pre.nginx, post.nginx and console-default.conf.prod are byte-identical to each other: they are the snapshot of the production gluster file. src/default.conf lacks https://d37gvrvc0wt4s1.cloudfront.net and https://cdnjs.cloudflare.com in default-src, script-src and style-src. vue/default.conf is much narrower: its script-src has no 'unsafe-eval' (deliberate), it lacks cdn.rollbar.com, app.thinx.cloud and the gravatar/github-avatar hosts in default-src, and it lacks wss://rtm and wss://console in connect-src. The rationale is documented in .planning/runbooks/console-csp-source-of-truth.md. Both console services bind-mount /mnt/gluster/deployment/swarm/console/default.conf read-only, so the image configs are inert in production and both hosts necessarily serve one identical CSP. That means the criterion's intent (the same effective policy whichever image serves a request) holds in production, but not the literal repo equivalence it states. Every divergence is a production-only extra host (unused by either console now) or a stricter image policy. None of them reintroduces a scheme wildcard."
    artifacts:
      - path: "services/console/src/default.conf"
        issue: "Missing cloudfront.net + cdnjs.cloudflare.com relative to production (neither console references them any more)"
      - path: "services/console/vue/default.conf"
        issue: "Deliberately narrower policy (no 'unsafe-eval'); several production hosts absent"
    missing:
      - "Either an override accepting the documented bind-mount divergence, or completion of the retirement path in console-csp-source-of-truth.md (align the image configs with production, then drop the bind mount)"
behavior_unverified_items:
  - truth: "Classic console register (POST /api/user/create), forgot-password (POST /api/user/password/reset) and reset-confirm (POST /api/user/password/set) succeed from a cold session under enforcement"
    test: "In a fresh incognito window, on https://rtm.thinx.cloud/, register a throwaway account, request a password reset, then open the emailed password.html link in another fresh incognito window and set a new password"
    expected: "No 403 csrf_token_invalid on any of the three POSTs. DevTools shows GET /api/csrf-token before each POST, and each POST carries a non-empty X-XSRF-TOKEN equal to the cookie. thinx_api logs show no 'CSRF token rejected' line for these routes."
    why_human: "All three routes are enforced since 09:02Z, and all three classic call sites were rewritten to Csrf.ajax in console 00eef2f (WR-05). Neither a committed test nor the operator's post-09:55Z browser checks (Vue login/OAuth/reset, classic login) exercised them. Presence and wiring are confirmed. Runtime behaviour on these three flows is not."
coincidental_reliance_items:
  - truth: "No https:/wss: scheme wildcard in the production CSP (truth 2)"
    reason: undeclared-precondition
    harden: "Production CSP lives in /mnt/gluster/deployment/swarm/console/default.conf. csp-csrf-hardening.md records that the swarm repo has uncommitted edits to that exact file. Commit it in the swarm repo, or finish the retirement path so the image config (reviewed here) becomes authoritative. Until then the live CSP depends on an unversioned host file."
---

# Phase 21: CSP Wildcard Removal + Anti-CSRF Token — Verification Report

**Phase Goal:** Close the two deferred HawkScan Medium findings that live in the console/edge layer — CSP scheme-wildcards and the login-form anti-CSRF token — across both the legacy AngularJS console and the Vue console plus the swarm nginx edge, kept mutually consistent.
**Verified:** 2026-09-25T10:16:09Z
**Status:** gaps_found. **All three gaps are the waived HawkScan rescan (SC1, SC2) and the documented bind-mount CSP divergence (SC5). None is an implementation gap.**
**Re-verification:** No, initial verification.

## Bottom line for the orchestrator

The implementation achieves the phase goal:

- No CSP source has a scheme wildcard. Production serves a pinned host list on both console hosts.
- Double-submit CSRF is enforced in production on 8 cookie-session routes, with one server-side check shared by both consoles.
- Cold-session flows on both consoles pass under enforcement (operator-observed).

The only unmet items are exactly the two categories you named:

1. **SC1 / SC2:** the HawkScan rescan was waived (StackHawk deprecated; bb0ce4a7). The behaviour both criteria describe is evidenced independently (truths 2 and 4).
2. **SC5:** the repo's three CSP definitions are not byte-equivalent. The divergence and its rationale (a gluster bind mount makes the image configs inert) are documented in `console-csp-source-of-truth.md`. The intent, one effective policy whichever image serves a request, holds in production.

None of these has a recorded override. Suggested override entries are at the end. If they are accepted, the status becomes `human_needed`, because of one behaviour-unverified item: the classic register, forgot-password and reset-confirm flows under enforcement.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: HawkScan rescan shows 0 NEW plugin 10055-4 paths | ✗ FAILED (waived) | Rescan never run. Operator waiver relayed by the orchestrator. `stackhawk.yml` deleted in bb0ce4a7. Not marked passed on scanner evidence. |
| 2 | SC1 underlying: no `https:`/`wss:`/`*` scheme wildcard in `default-src`/`connect-src` (or any directive); explicit hosts pinned | ✓ VERIFIED (coincidental-reliance) | Parsed the CSP of all 5 sources (`src/default.conf`, `vue/default.conf`, `pre.nginx`, `post.nginx`, `console-default.conf.prod`): 0 scheme-wildcard tokens in any directive. Orchestrator fact: the live header on both console hosts comes from the gluster file (repo copy `console-default.conf.prod`), with no wildcards. API's own CSP (`lib/router.js:35-51`) is `'self'` + public_url only. |
| 3 | SC2: HawkScan rescan shows 0 NEW plugin 20012 paths | ✗ FAILED (waived) | As in truth 1. |
| 4 | SC2 underlying: login POST with no or forged token is rejected (4xx) on both console flows; a normal login through each console still succeeds | ✓ VERIFIED | `verifyCsrfToken` → `Util.failureResponse(res,403,"csrf_token_invalid")` (`csrf.js:130-131`). ZZ-CSRFSpec cases 3/4 (missing/forged → 403) pass (run here: 28 specs, 0 failures). Orchestrator live probes after the 09:55:35Z rollout: header-less login returns 403 `csrf_token_invalid`, logged `reason=no_cookie`; a primed login returns `invalid_credentials`. Operator approval (2026-09-25, cold incognito): Vue login and classic rtm login passed, with zero CSRF rejections in the logs. |
| 5 | SC3: both consoles load and work with no CSP-blocked resources, including Crisp `wss://client.relay.crisp.chat` | ✓ VERIFIED | Operator report (2026-09-24/25, relayed): browser consoles CSP-clean after the Rollbar fix (3e567027 added `cdn.rollbar.com`). The production policy allows `https://*.crisp.chat` and `wss://client.relay.crisp.chat` in connect-src, plus fonts, GA and Rollbar. app, rtm and console all return 200 (orchestrator probe). |
| 6 | SC4: identical token mechanism across both consoles, with one server-side validation scheme and no per-frontend fork | ✓ VERIFIED | A single factory, `lib/middleware/csrf.js`, is used by `router.auth.js:23` and `router.user.js:13`. Both consoles use cookie `XSRF-TOKEN` and header `X-XSRF-TOKEN`: classic in `src/assets/thinx/csrf.js`, Vue in `vue/src/utils/cookies.js`. Both prime via `GET /api/(v2/)csrf-token` → the same `issueCsrfToken`. |
| 7 | SC5: the three CSP definitions are byte-equivalent modulo placeholder | ✗ FAILED (documented divergence) | See the gap. pre/post/prod snapshot: identical. `src/default.conf` lacks cloudfront and cdnjs. `vue/default.conf` is deliberately narrower (no `'unsafe-eval'` and fewer hosts). Rationale: `console-csp-source-of-truth.md` (bind mount; image configs inert). |
| 8 | The protected cookie-session POST routes return 403 on missing or mismatched `X-XSRF-TOKEN` when enforced | ✓ VERIFIED | Mock-app route enumeration (run here): `/api/user/create`, `/api/user/password/{set,reset}` and `/api/v2/password/{reset,set}` have 2 handlers (csrf + business). Every other user route has 1. `router.auth.js:350,369,380` wire `/api/login`, `/api/v2/login` and `/api/v2/session/token`. That is 8 routes in total (session/token was added after 21-01). ZZ-CSRFSpec enforce cases pass. |
| 9 | Fail-open is the default (log and allow); enforcement can be flipped by env or config without a code change | ✓ VERIFIED | `isEnforced()` (`csrf.js:31-35`): `CSRF_ENFORCE==='true'`, else `debug.csrf_enforce===true`, else false. `csrf_enforce: false` is present in all 3 shipped configs. The fail-open spec case passes and logs a `reason=` code. |
| 10 | `GET /api/csrf-token` and `GET /api/v2/csrf-token` echo the token without minting a second one and are exempt from verification | ✓ VERIFIED | `router.auth.js:345,364`, not wrapped. `issueCsrfToken` only reads `req.cookies`/`res.locals` (`csrf.js:74-77`). Spec case 6 asserts exactly one `res.cookie` call. |
| 11 | X-Access-Token/JWT and device routes are unaffected; no token is minted for device, webhook or preflight traffic | ✓ VERIFIED | No `verifyCsrfToken` on any device or JWT route (enumeration + grep). `isNonBrowserRequest` skips OPTIONS, `Origin: device`, `/device/*` and githook (`csrf.js:41-46`); spec case 11 passes. Orchestrator live probe: `Origin: device` is not minted a token. |
| 12 | Classic console: hidden `_csrf` on login/register/forget/reset/gdpr forms; shared `csrf.js` on the 3 entry pages (before page script) primes and sets the header on every `$.ajax` | ✓ VERIFIED | `name="_csrf"`: index.html ×3, password.html ×1, auth.html ×1. `csrf.js` is included before the page script (`auth.html:173-174`, `index.html:261`, `password.html:98`). `$.ajaxSetup` beforeSend plus `window.__csrfReady = Csrf.prime()`. `login.js`/`password.js` now use `Csrf.ajax`, a retry wrapper (WR-05), which intentionally supersedes 21-02's "zero edits" constraint. The gulp prod bundle includes `csrf.js` (`gulpfile.js:231`). |
| 13 | Classic `auth.html?g=true` auto-login awaits the prime before `POST /login` | ✓ VERIFIED | `auth.js:159-161` gates `Auth.login()` on `window.__csrfReady.always(...)`. Operator: classic GitHub OAuth on rtm passed under enforcement (before the 09:55Z rollout; `auth.js` was unchanged by that rollout). |
| 14 | Vue console: every protected call sends `X-XSRF-TOKEN` from a single-flight prime. Login, PasswordReset and OAuthReturn prime on their own entry points, and OAuthReturn awaits before its POST | ✓ VERIFIED | `utils/cookies.js` `ensureCsrfToken` (module-level `primePromise`) and `fetchWithCsrf` (one retry on `csrf_token_invalid`). `core/api.js:51-55,93-95` send non-GET calls through `fetchWithCsrf`. `store/auth.js:79` hydrate awaits the shared prime. `OAuthReturn.vue:91-92,203` awaits; `Login.vue:162` and `PasswordReset.vue:202` join the shared prime. Operator (after 09:55Z, cold incognito): Vue login, Vue GitHub OAuth and Vue password reset all passed. |
| 15 | CSRF enforcement is ON in production on `thinx_api`, flipped only after 21-04's fail-open verification | ✓ VERIFIED | Orchestrator fact: `CSRF_ENFORCE=true` since 2026-09-25 09:02Z, persisted in swarm `thinx.yml` bc6d04a, and it survived the 09:55:35Z rollout of 47284faf. 21-04 checkpoint approved 2026-09-25 before the flip. Caveat: the runbook's one-day log-watch gate was cut short by operator decision (recorded in the runbook Gate status). |
| 16 | A true cold session can log in on both consoles, complete OAuth return on Vue and classic, and submit the Vue password reset under enforcement | ✓ VERIFIED | Operator approval relayed by the orchestrator: Vue login, Vue GitHub OAuth, Vue password reset and classic rtm login passed after 09:55Z, with zero CSRF rejections in the logs. Classic GitHub OAuth passed before that. The cookie is set with `Domain=.thinx.cloud` (live probe). |
| 17 | Classic register, forgot-password and reset-confirm succeed under enforcement | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wired: `login.js:78,204,348` and `password.js:92` use `Csrf.ajax`; the pages load `csrf.js`. Not exercised by any committed test or by the post-enforcement browser checks. See behavior_unverified_items. |
| 18 | A rollback procedure was documented before the flip | ✓ VERIFIED | `csp-csrf-hardening.md` (ab4f32ac, committed 08:47:32Z) has Rollback A/B, CSP rollback and a deep fallback. The flip ran at 09:02:03Z. |
| 19 | Both repos are pushed to thinx-staging, with CI green | ✓ VERIFIED | Parent HEAD 47284faf is 0/0 against `origin/thinx-staging`. Submodule gitlink 00eef2f is on `origin/thinx-staging`, and it contains every Phase 21 console commit (d41d4ba, 0f22e0e, cfdea8d, fdaf17c, d6d4208, 306c7f6, 0334b3c, ca5a818, 00eef2f). GitHub combined status for 47284faf is `success`: circleci test, api-registry, console-classic-registry, vue-console-registry, snyk and coveralls. |

**Score:** 15/19 truths verified. 3 failed: the waived rescan (×2) and the documented divergence. 1 is present but behavior-unverified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/middleware/csrf.js` | ensureXsrfCookie / verifyCsrfToken / issueCsrfToken | ✓ VERIFIED | 146 lines, substantive, mounted in `thinx-core.js:351-353` before the routers |
| `lib/middleware/cookie-policy.js` | `cookieDomain()` that never throws (WR-02) | ✓ VERIFIED | Used by csrf.js and the thinx-core session cookie |
| `lib/middleware/cors.js` | `X-XSRF-TOKEN` in Allow-Headers | ✓ VERIFIED | `ALLOWED_HEADERS` line 25 |
| `spec/jasmine/ZZ-CSRFSpec.js` + `CookiePolicySpec.js` | Regression spec | ✓ VERIFIED | Run here: 28 specs, 0 failures |
| `services/console/src/assets/thinx/csrf.js` | Shared classic seam | ✓ VERIFIED | ajaxSetup, `__csrfReady`, Csrf.ajax retry |
| `services/console/src/assets/thinx/auth.js` | Awaited prime on auto-login | ✓ VERIFIED | Lines 159-161 |
| `services/console/src/{index,password,auth}.html` | Hidden `_csrf` + csrf.js include | ✓ VERIFIED | 3/1/1 fields |
| `services/console/vue/src/utils/cookies.js` | getCookie + single-flight prime + fetchWithCsrf | ✓ VERIFIED | |
| `services/console/vue/src/core/api.js` | Header seam | ✓ VERIFIED | |
| Vue `Login.vue` / `OAuthReturn.vue` / `PasswordReset.vue` | Per-page prime + header | ✓ VERIFIED | |
| `services/console/src/default.conf`, `vue/default.conf` | Pinned CSP, no wildcard | ✓ VERIFIED (inert in prod) | No wildcards. Not what production serves (bind mount). |
| `.planning/runbooks/swarm-configs/*` | Edge/prod CSP snapshots | ✓ VERIFIED | pre == post == prod body; no wildcards |
| `.planning/runbooks/csp-csrf-hardening.md` | Flip, rescan, rollback runbook containing `## Rollback` | ✓ VERIFIED | Rescan section marked retired |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `thinx-core.js` | `csrf.js` | `app.use(cookieParser()); app.use(csrf.ensureXsrfCookie)` before routers | ✓ WIRED | Lines 351-353 |
| `router.auth.js` | `csrf.js` | verifyCsrfToken on login ×2 + session/token; priming GETs | ✓ WIRED | Lines 345-380 |
| `router.user.js` | `csrf.js` | verifyCsrfToken on 5 account POSTs | ✓ WIRED | Mock-app enumeration |
| classic `csrf.js` | login.js / password.js / auth.js | `$.ajaxSetup` + `Csrf.ajax` | ✓ WIRED | Script order verified |
| Vue `core/api.js` | `store/auth.js` $api calls | `composeHeaders()` + `fetchWithCsrf` | ✓ WIRED | |
| Vue `OAuthReturn.vue` | XSRF cookie | awaited `ensureCsrfToken` in `created()` | ✓ WIRED | |
| Production console hosts | CSP | gluster bind mount (not image config) | ✓ WIRED (outside the repo) | Relayed by the orchestrator; documented in `console-csp-source-of-truth.md` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `issueCsrfToken` body `csrf_token` | token | `req.cookies['XSRF-TOKEN']` or `res.locals.xsrfToken` minted by `crypto.randomBytes(24)` | Yes | ✓ FLOWING |
| Vue `X-XSRF-TOKEN` header | resolved token | `ensureCsrfToken` → cookie or echoed body | Yes | ✓ FLOWING |
| Classic `X-XSRF-TOKEN` header | `Csrf.getCsrfCookie()` | `document.cookie` after prime | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CSRF middleware: fail-open / enforce / match / mint / no double-mint / domain / device skip | `ENVIRONMENT=development node node_modules/jasmine/bin/jasmine.js --config=<scratch: ZZ-CSRFSpec.js + CookiePolicySpec.js, helpers: []>` | 28 specs, 0 failures | ✓ PASS |
| Only the intended user routes carry CSRF middleware | mock-app `require('lib/router.user.js')(app)`, count handlers per route | 5 protected routes have 2 handlers; `/api/v2/user`, `/api/user/delete`, chat, stats and activate have 1 | ✓ PASS |
| `router.auth.js` wiring | same approach | Module needs a live DB at require time, so it was verified by source read (lines 345-380) | ? SKIP (source-verified) |
| No scheme wildcards across all CSP sources | python parse of each `add_header "Content-Security-Policy"` | 0 wildcard tokens in all 5 files | ✓ PASS |
| CI on the shipped commit | `gh api .../commits/47284faf/status` | `success` (all 10 contexts) | ✓ PASS |

Live-production behaviour (403 on a header-less request, the primed login path, cookie Domain, no token for `Origin: device`, host 200s) is taken from the orchestrator's post-09:55Z probes. I did not re-probe production.

### Probe Execution

Step 7c: skipped. The phase declares no `scripts/*/tests/probe-*.sh` probes, and none exist for it.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEC-CSP-01 | 21-03, 21-04, 21-05 | Drop the `https:` scheme wildcard, pin hosts, keep the three sources consistent, rescan clean | ◐ SATISFIED in behaviour, with 2 unmet literal acceptance clauses | No wildcards anywhere; the live CSP is pinned and identical on both hosts. The rescan was waived, and literal byte-equivalence of the repo sources does not hold (documented divergence). |
| SEC-CSRF-01 | 21-01, 21-02, 21-04, 21-05 | Anti-CSRF token on both console login forms, validated server-side, one scheme | ◐ SATISFIED in behaviour, with 1 unmet literal acceptance clause | Enforced 403 on missing or forged tokens, normal logins OK, one shared scheme. The rescan was waived. The requirement says "synchronizer token", while the implementation is double-submit, a locked decision in 21-CONTEXT. |

No orphaned requirements: REQUIREMENTS.md maps only SEC-CSP-01 and SEC-CSRF-01 to Phase 21, and both are claimed by plans.

**Doc drift:** REQUIREMENTS.md still shows SEC-CSRF-01 as `[ ]`, and its traceability row says "In Progress (21-04/21-05 pending)". Both plans are now done, so update this when the phase closes.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all phase-modified files) | — | TBD / FIXME / XXX | — | None found |
| `.planning/runbooks/csp-csrf-hardening.md` | 253 | Stale text: "Enforce mode writes **no** log line" | ℹ️ Info | Contradicts line 150 and the WR-01 fix (enforce mode now logs `CSRF token rejected reason=…`). It could mislead an operator during an incident. |
| `.planning/runbooks/console-csp-source-of-truth.md` | 68-76 | Stale "Latent risk": says `vue/default.conf` omits `app.thinx.cloud`/`wss://app.thinx.cloud` | ℹ️ Info | Fixed in console 60e1ef0; both are now in the Vue connect-src |
| `lib/router.user.js` | 147 | `POST /api/v2/user` (account create) has no CSRF check | ⚠️ Warning (accepted, documented) | Deliberate: 21-01 scoped it out, and 21-REVIEW-FIX WR-04 kept it open for machine clients. It is a bypass of the account-creation protection. It is documented in the runbook but is still a follow-up decision. |
| `lib/middleware/csrf.js` | — | Double-submit on `.thinx.cloud` has no same-site protection; session mutation routes are unguarded | ⚠️ Warning (deferred) | 21-REVIEW WR-06 deferred it as architectural; residual risk stated in REVIEW-FIX |
| `services/console/src/*.html` | — | Hidden `_csrf` fields are never read by the server | ℹ️ Info | They exist for scanner form detection (a stated design decision); IN-03 |
| Vue/classic retry and single-flight logic (CR-01/WR-05) | — | No committed automated test; the stubbed harnesses in REVIEW-FIX were scratch-only | ℹ️ Info | Covered in practice by the operator's post-09:55Z cold tests; the retry path itself has not been exercised live |

### Human Verification Required

### 1. Classic register, forgot-password and reset-confirm under enforcement

**Test:** In a fresh incognito window on `https://rtm.thinx.cloud/`, register a throwaway account, then use "forgot password". Open the emailed `password.html` link in a new incognito window and set a password.
**Expected:** No 403 on `POST /api/user/create`, `/api/user/password/reset` or `/api/user/password/set`. Each is preceded by `GET /api/csrf-token` and carries `X-XSRF-TOKEN` equal to the cookie. `thinx_api` logs no `CSRF token rejected` line for them.
**Why human:** These routes are enforced in production, and their call sites were rewritten to `Csrf.ajax` in the final (09:55Z) rollout. No test and no post-enforcement browser check covered them.

### Suggested overrides (for the orchestrator or developer to accept or reject)

This looks intentional. To accept the deviations, add the following to this file's frontmatter:

```yaml
overrides:
  - must_have: "HawkScan rescan of rtm.thinx.cloud reports 0 NEW CSP: Wildcard Directive (plugin 10055-4) paths"
    reason: "StackHawk deprecated and removed (bb0ce4a7). No scheme wildcard in any repo CSP source or in the live gluster-mounted CSP (verified 2026-09-25)."
    accepted_by: "<operator>"
    accepted_at: "<ISO timestamp>"
  - must_have: "HawkScan rescan reports 0 NEW Anti-CSRF Tokens (plugin 20012) paths"
    reason: "StackHawk deprecated and removed (bb0ce4a7). Enforcement live since 2026-09-25 09:02Z: header-less login 403 csrf_token_invalid; normal cold logins on both consoles verified by the operator; hidden _csrf fields on all classic POST forms."
    accepted_by: "<operator>"
    accepted_at: "<ISO timestamp>"
  - must_have: "The three CSP definitions are byte-for-byte equivalent modulo the host-token placeholder"
    reason: "Production serves one gluster bind-mounted file to both consoles (console-csp-source-of-truth.md), so the effective policy is identical on both hosts. The image configs are inert, differ only by production-only extra hosts or a stricter Vue policy, and carry no scheme wildcard. Alignment is tracked by that runbook's retirement path."
    accepted_by: "<operator>"
    accepted_at: "<ISO timestamp>"
```

I did not apply these myself. The waiver came through the orchestrator, not directly from the developer, so the developer has to accept them.

### Gaps Summary

There is one root cause per group. Neither group is a code defect.

- **Group A: waived scanner evidence (SC1, SC2).** The acceptance mechanism, a HawkScan rescan, no longer exists. The behaviour each criterion describes has other evidence: repo-wide CSP parsing (run here), the CSRF unit specs (run here), the orchestrator's live probes and the operator's cold-browser approval. Close with an override, or with a substitute scanner run.
- **Group B: stale criterion versus deployment reality (SC5).** The criterion predates the discovery that production ignores the image configs. The repo's three definitions diverge, but the divergence is documented, carries no wildcard, and does not affect what production serves. Close with an override, or by finishing the retirement path in `console-csp-source-of-truth.md`.

Separately from the gaps, one behaviour-unverified item (the classic register and reset flows under enforcement) should be spot-checked in a browser. There are also two runbook text drifts and the REQUIREMENTS.md status row, all Info-level, to tidy up at phase close.

---

_Verified: 2026-09-25T10:16:09Z_
_Verifier: Claude (gsd-verifier)_

## Human verification result (2026-09-25)

The operator tested the classic register, forgot-password and reset-confirm flows on rtm.thinx.cloud in an incognito window, with enforcement on. All three passed.
A live watch on the thinx_api log from 10:19Z to the end of testing recorded no CSRF rejections or warnings.

One UX defect surfaced that has nothing to do with CSRF: after a successful password change the page did not redirect to login. It showed the success panel with a "Login Here" button, which is how it was originally written. Fixed in console a0e8670 with a 3s redirect to /.

_Re-fingerprinted 2026-09-25 by the orchestrator with `verification.fingerprint`, same `covered_files`. Three covered files changed after the verifier ran, none of them in the CSRF/CSP enforcement logic. `csp-csrf-hardening.md` and `console-csp-source-of-truth.md` got text updates for the verifier's two Info items: the enforce-mode log line, and the Vue `connect-src` gap closed by 60e1ef0. `password.js` got the post-success login redirect, console a0e8670._
