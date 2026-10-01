---
phase: 25-session-bound-csrf-console-edge-headers
verified: 2026-10-01T13:05:00Z
status: human_needed
score: 9/9 must-haves verified (5 roadmap SCs + 4 review-fix truths); debt-marker gate passes
covered_files:
  - .circleci/config.yml
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-01-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-01-SUMMARY.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-02-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-02-SUMMARY.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-03-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-03-SUMMARY.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-04-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-04-SUMMARY.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-05-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-05-SUMMARY.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-06-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-06-SUMMARY.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-07-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-07-SUMMARY.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-08-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-08-SUMMARY.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-09-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-09-SUMMARY.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-10-PLAN.md
  - .planning/phases/25-session-bound-csrf-console-edge-headers/25-10-SUMMARY.md
  - .planning/runbooks/swarm-configs/console-default.conf.prod
  - .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx
  - docker-swarm.yml
  - lib/middleware/csrf.js
  - lib/router.admin.js
  - lib/router.apikey.js
  - lib/router.auth.js
  - lib/router.env.js
  - lib/router.gdpr.js
  - lib/router.github.js
  - lib/router.google.js
  - lib/router.js
  - lib/router.profile.js
  - lib/router.rsakey.js
  - lib/router.transfer.js
  - lib/router.user.js
  - lib/thinx/bearer_owner.js
  - lib/thinx/establish_session.js
  - scripts/check-console-headers.js
  - scripts/console-live-headers.sh
  - scripts/csrf-live-probe.sh
  - scripts/csrf-obs-counters.js
  - services/console/src/app/js/thinx-api.js
  - services/console/src/default.conf
  - services/console/vue/default.conf
  - spec/jasmine/CsrfRouteInventorySpec.js
  - spec/jasmine/CsrfSessionFlowSpec.js
  - spec/jasmine/ZZ-CSRFEnforceSpec.js
  - spec/jasmine/ZZ-CSRFRouteGuardSpec.js
  - spec/jasmine/ZZ-CSRFSpec.js
  - spec/node/ConsoleHeaderParity.test.js
  - thinx-api-openapi.yaml
  - thinx-core.js
covered_digest: "v2:sha256:d52e8d112ce44016c59d704536392c7451b12c3c108094bc14aa3280e4f23abd"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "MUST NOT make the parity check pass by editing the canonical snapshot to match drift or by adding per-file exceptions, allowlists or skip flags (25-02 / 25-09 prohibition, SEC-CSP-04)"
    reason: "EVAL_OPTIONAL in scripts/check-console-headers.js allows exactly one token ('unsafe-eval' in script-src) to be missing from exactly one file (services/console/vue/default.conf), because the Vue image build asserts script-src has no 'unsafe-eval'. Covered by two node:test cases (the exception allows nothing else; it names only the Vue config). Production is unaffected: the gluster bind mount overrides the image file."
    accepted_by: "operator (recorded in 25-09-SUMMARY, 'Deviation, approved by the operator')"
    accepted_at: "2026-10-01T11:15:00Z"
re_verification:
  previous_status: gaps_found
  previous_score: "9/9 must-haves; 1 gate-level blocker (debt marker)"
  gaps_closed:
    - "Debt-marker gate: lib/router.js:127 FIXME now carries `(tracked: .planning/todos/pending/2026-10-01-bearer-verify-failure-status-401.md)`; the todo lists the line back with problem and fix (same convention the Phase 24 verifier accepted for f3831b57)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Production change discipline (25-04, 25-06, 25-08 prohibitions): confirm that no restart.sh or docker stack deploy ran, that main was not pushed, that CSRF_ENFORCE was never changed, and that only thinx_api was updated by command (the consoles only through CI images, except the forced console restarts that 25-09 allowed)"
    expected: "Matches the annex: only `docker service update --env-add CSRF_MODE=…` / `--force` on thinx_api, and the two 25-09 console forces"
    why_human: "Judgment-tier prohibition about operator-session conduct. Verifier verdict (non-authoritative): no contradiction. The annex records only single-service updates; docker-swarm.yml shows CSRF_ENFORCE=true; the thinx-staging pushes are recorded"
  - test: "Privacy of committed artifacts (25-04, 25-06, 25-08, 25-09, 25-10 prohibitions): confirm that no host, IP, key path, cookie, token, secret or operator account identifier went into commits, SUMMARYs, snapshots or the annex beyond the AGENTS.md manager endpoint"
    expected: "No sensitive values"
    why_human: "Judgment-tier. Verifier verdict (non-authoritative): pass. The phase diff contains only 188.166.23.244 (AGENTS.md) and 127.0.0.1, one placeholder e-mail (dynamic@example.com), and the token-shaped string is the OpenAPI example"
  - test: "Non-destructive testing (25-05, 25-08, 25-10 prohibitions): confirm that no real account or device was created, deleted, revoked or modified by specs, probes or the combined pass (except the throwaway account registered in the pass)"
    expected: "Probe bodies are {} or name a non-existent owner; specs use a non-matching owner; only the throwaway account was touched"
    why_human: "Judgment-tier. Verifier verdict (non-authoritative): no contradiction in the probe script design or the spec cases (T2/T3 use non-matching owners)"
  - test: "Gate discipline (25-06, 25-08, 25-10 prohibitions): confirm that the 24 h observe window was not shortened, that the WR-04 guard did not ship while an external POST /api/v2/user caller existed, and that the requirements were marked complete only after the operator answered all-passed"
    expected: "Observe 24.0 h; D-05 found 0 external callers at each check; REQUIREMENTS.md updated after all-passed"
    why_human: "Judgment-tier. Verifier verdict (non-authoritative): pass per the annex rows (observe window, the three D-05 rows, final combined pass)"
  - test: "Gluster edit method (25-09 prohibition): confirm that /mnt/gluster/deployment/swarm/console/default.conf was written in place (inode kept), with no sed -i, editor or git checkout, and no reliance on nginx -s reload"
    expected: "Same inode before and after; both consoles force-updated"
    why_human: "Judgment-tier, production host only. Verifier verdict (non-authoritative): pass per the annex ('In-place write, same inode, md5 cf25f548…', forces at 11:07:44Z and 11:07:55Z)"
---

# Phase 25: Session-Bound CSRF + Console Edge Headers Verification Report

**Phase Goal:** Both consoles use a CSRF token bound to the session, so a sibling subdomain can no longer plant one. Cookie-authenticated account mutations are covered too, and both console hosts serve one hardened header set that the image configs mirror. Nobody gets locked out along the way.
**Verified:** 2026-10-01T13:05:00Z
**Status:** human_needed. All five success criteria and all four review fixes are verified, and the debt-marker gate passes. What remains is the end-of-phase human sign-off on the flagged judgment-tier prohibitions (below).
**Re-verification:** Yes. The debt-marker gap from the 12:40Z run is closed.

Evidence rules used: code and local tests were checked directly. Production behaviour (cold logins, OAuth, forced redeploy, register/forgot/reset, live headers) comes from the operator-attested record in the SUMMARYs and in `.planning/runbooks/csp-csrf-hardening.md` → "Phase 25 Execution Annex", as instructed. No ssh, no production curl, no push.

**Why not `passed`:** the verifier contract never lets flagged judgment-tier prohibitions fold silently into `passed`. Each one needs an explicit human resolution, and Phase 24 used the same outcome for the same case. Every one of them has a non-authoritative "no contradiction" verdict here, so the sign-off should be quick.

## Re-verification (2026-10-01T13:05Z)

| Previous finding | Check | Result |
|---|---|---|
| 🛑 Debt marker `lib/router.js:127` | `git diff lib/router.js`: comment-only change. The FIXME now reads `FIXME (tracked: .planning/todos/pending/2026-10-01-bearer-verify-failure-status-401.md)`. The todo exists, names `lib/router.js:127`, and states the problem and the fix (401 plus the spec updates, and a check of the Vue refresh path). `grep -E "TBD\|FIXME\|XXX"` over every covered file: the only other hit is `scripts/csrf-live-probe.sh:70` `mktemp …XXXXXX`, a temp-file template and not a debt marker | ✓ closed. The tracked-todo reference follows the convention the Phase 24 verifier accepted (f3831b57). The todo file is uncommitted for now; the orchestrator commits it with this report |
| ⚠️ 25-REVIEW-FIX.md stale, no annex row for the review-fix deploy | `git diff`: 25-REVIEW-FIX.md now records the deploy (parent `2a9569c1`, CI test 15516 / api-registry 15522, `thinx_api` `c42333a3bb0a` at 12:05Z, live re-check and operator browser checks). The annex has a new "Review-fix deploy" row with the same evidence | ✓ closed |
| ℹ️ OpenAPI `POST /user` note claimed the cookieless API-key exemption applies | All 14 shared notes now read "…API-key calls that carry no session cookie, except on the login, registration (`POST /user`) and password routes…", which matches `PUBLIC_SESSION_ROUTES` in csrf.js. The YAML parses | ✓ closed |
| ⚠️ WR-01 residual (`always` checked for the CSP only) | Unchanged, by decision | Still a warning; follow-up |
| ℹ️ IN-02 (`CSRF_SECRET` length and trim) | Unchanged, by decision | Still info; follow-up |

Regression check: the `lib/router.js` change is comment-only. The `thinx-api-openapi.yaml` changes are description text only (14 lines). No other source file changed since the 12:40Z run, so the earlier local test results stand.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| SC-1 | With `CSRF_MODE=signed` and enforcement on, cold login works on both consoles by password, Google and GitHub. The priming GET creates a short-lived pre-session and re-mints a stale token. A token for another session, or one planted from a sibling subdomain, gets 403 `csrf_token_invalid` | ✓ VERIFIED | Code: `lib/middleware/csrf.js` `issueCsrfToken` sets `csrf_pre` and `cookie.maxAge = 15 min` only when there is no persisted session (L346-353); stale or foreign tokens are re-minted via `setBound` (L355-358); `check()` uses a length-prefixed HMAC and `timingSafeEqual` (L123-145); `verifyBinding` returns 403 in signed+enforce (L483-511). Tests (local, passed): CsrfSessionFlowSpec cold prime, session-B token refused on session A, and fresh pre-session for an unknown x-thx-core. Production (annex "Signed flip" and "Final combined two-console pass"): `planted=403 stale=403 header_less=403`, `pre_session_ttl_s=900`; operator ran six cold logins under signed. Vue OAuth forced re-prime: `OAuthReturn.vue:93`, `App.vue:39` |
| SC-2 | Every interactive login changes the session id and sets a fresh `XSRF-TOKEN`; the Bearer bridge does not regenerate; logout clears the token; a forced redeploy causes no 403s and no logouts; `CSRF_MODE=legacy` restores v1.13 without touching `CSRF_ENFORCE` | ✓ VERIFIED | `establish_session.js` runs regenerate, then rotate, then writes the owner. It is called from `loginAction` (router.auth.js:331) and `performTokenLogin` (:75). Google and GitHub logins finish through `POST /login {token}`; there is no Google session write (router.google.js:163-167). The Bearer bridge (router.js:96-125) never regenerates. Logout calls `csrf.clear` (router.auth.js:280). The key is resolved once at module scope and never random. `assertReady` makes the process exit (thinx-core.js:355-360). `mode()` is separate from `CSRF_ENFORCE`. Tests: CsrfSessionFlowSpec login, logout, two-login and 503 cases; ZZ-CSRFSpec legacy pins and HKDF determinism. Production: annex forced-redeploy row and 25-09 (a signed pre-session survived the API redeploy) |
| SC-3 | `POST /api/v2/user` without a primed token → 403; OpenAPI documents priming; cookie-auth `DELETE /api/v2/user`, `POST /api/user/delete`, `/api/gdpr/revoke`, `/api/v2/profile` need the token; Bearer/API-key calls still pass without one | ✓ VERIFIED | Guards: router.user.js:150, :190, :231; router.gdpr.js:146, :173; router.profile.js:49, :63 (GETs unguarded), plus 23 D-11 routes. Exemption: Bearer always; API key only when cookieless and not on a public route (csrf.js:429-435). OpenAPI: the `/csrf-token` contract, `XsrfTokenHeader`, `CsrfTokenInvalid`, and the shared notes, now accurate. CsrfRouteInventorySpec passed. Production `--guards` probe: `v2user_unprimed=403`, `cookie_only_*=403`, `v2user_primed=200:email_required` |
| SC-4 | Under enforcement, the classic register, forgot-password and reset-confirm flows complete end to end | ✓ VERIFIED (operator-attested) | `assets/thinx/login.js` and `password.js` use `Csrf.ajax` (prime, header, one retry). Annex "Final combined two-console pass", item (2), under signed |
| SC-5 | Each console host returns exactly one CSP plus `Referrer-Policy`, `Permissions-Policy`, `X-Permitted-Cross-Domain-Policies: none`, from gluster `default.conf`; a normalising parity script confirms both image configs and the snapshots match | ✓ VERIFIED | Canonical snapshot: server-level XPCDP `none`, Referrer-Policy and Permissions-Policy with `always`; one CSP; `proxy_hide_header Content-Security-Policy` in all 5 proxy locations; no `add_header` inside a location. The mirrors match. `HEADER-PARITY OK files=4` (and 5 with `--live`); parity tests 16/16; CI step at .circleci/config.yml:675. The CSP value is byte-identical across the pre, post and canonical snapshots. Production: `LIVE-HEADERS OK`, 10/10 lines with `csp=1`. Override: EVAL_OPTIONAL |
| R-1 | 25-REVIEW CR-01 fixed (a body API key no longer exempts a cookie session or a public route) | ✓ VERIFIED | csrf.js:435 with `PUBLIC_SESSION_ROUTES` (L157-167); CsrfSessionFlowSpec CR-01 ×3; ZZ-CSRFSpec x2/x2b/x2c/x5/x6. Deployed per the annex "Review-fix deploy" row |
| R-2 | 25-REVIEW CR-02 fixed (the Bearer owner is never persisted into the cookie's session) | ✓ VERIFIED | `lib/thinx/bearer_owner.js` (outermost `res.end` wrapper restores `owner` and `impersonator_owner`), called at router.js:99; no other non-login owner writes; CsrfSessionFlowSpec CR-02 ×2 use the real module |
| R-3 | 25-REVIEW WR-01 fixed for the CSP | ✓ VERIFIED | CSP without `always` gives `CSP-NOT-ALWAYS`, `HEADER-PARITY FAIL`, exit 1 (reproduced). Residual: see the warnings |
| R-4 | 25-REVIEW WR-02 fixed (a planted `XSRF-TOKEN` cannot lock a user out in signed mode) | ✓ VERIFIED | csrf.js:458-461; WR-02 tests ×2 passed |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified). Debt-marker gate: pass.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/middleware/csrf.js` | Three-state CSRF_MODE, module-scope key, priming, rotate/clear, telemetry, thx_auth exemption | ✓ VERIFIED | Mounted at thinx-core.js:352-361; used by 10 routers |
| `lib/thinx/establish_session.js` | regenerate → rotate → owner/markLogin | ✓ VERIFIED | Called at both login sites |
| `lib/thinx/bearer_owner.js` | Request-local Bearer owner (CR-02) | ✓ VERIFIED | router.js:99 |
| `spec/jasmine/CsrfSessionFlowSpec.js`, `ZZ-CSRFSpec.js`, `CsrfRouteInventorySpec.js` | Local specs | ✓ VERIFIED | 186 specs, 0 failures (with CookiePolicySpec) |
| `spec/jasmine/ZZ-CSRFEnforceSpec.js`, `ZZ-CSRFRouteGuardSpec.js` | CI enforce/guard specs | ✓ EXISTS (CI-only) | Need Redis and CouchDB; CI test 15506/15511/15516 green per the annex |
| `thinx-api-openapi.yaml` | Priming contract, refs | ✓ VERIFIED | Parses; the notes are now consistent with the code |
| `scripts/check-console-headers.js` + `spec/node/ConsoleHeaderParity.test.js` | Parity gate | ✓ VERIFIED | OK; 16/16 |
| `.circleci/config.yml` | Parity CI step | ✓ VERIFIED | L675-676 |
| `services/console/src/app/js/thinx-api.js` | Classic XSRF seam | ✓ VERIFIED | `xsrf-seam.cjs` passes; submodule pointer `c58dd09` is on `origin/thinx-staging` |
| Image configs and snapshots | Header mirrors | ✓ VERIFIED | Parity OK |
| `docker-swarm.yml` | `CSRF_ENFORCE=true`, `CSRF_MODE=signed` | ✓ VERIFIED | L298-299 |
| Operator scripts (`csrf-live-probe.sh`, `console-live-headers.sh`, `csrf-obs-counters.js`) | Probes and counters | ✓ VERIFIED | Present; `bash -n` OK |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| router.auth.js login sites | establish_session.js | `establishSession(` | ✓ WIRED |
| thinx-core.js | csrf.assertReady | exits before `app.use(csrf.ensureXsrfCookie)` | ✓ WIRED |
| csrf.js resolveKey | secrets.readSecret | `readSecret("CSRF_SECRET")`, then HKDF | ✓ WIRED |
| router.js auth success paths | csrf.verifyCsrfToken | `req.thx_auth` (router.js is mounted first, thinx-core.js:380) | ✓ WIRED |
| router.js Bearer bridge | bearer_owner.js | `bindBearerOwner` | ✓ WIRED |
| 10 routers | csrf.verifyCsrfToken | route middleware (admin: before `requireAdmin`) | ✓ WIRED (38 registrations) |
| Classic `$.ajaxSetup` | API `X-XSRF-TOKEN` | cookie read at send time, API-bound only | ✓ WIRED |
| CircleCI test job | check-console-headers.js | "Console header parity (SEC-CSP-04)" | ✓ WIRED |

### Data-Flow Trace (Level 4)

The token flow was traced end to end: prime (`mint(req.sessionID)` → Set-Cookie + echo) → client header → `verifyCsrfToken` → `verifyBinding` → `check(token, req.sessionID)`. Login: `establishSession` → `regenerate` → `rotate` → Set-Cookie on the login response. ✓ FLOWING.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| CSRF middleware, flow, review fixes, inventory, cookie policy | helper-free jasmine config, `ENVIRONMENT=development` | 186 specs, 0 failures | ✓ PASS |
| Parity unit tests | `node --test spec/node/ConsoleHeaderParity.test.js` | 16/16 | ✓ PASS |
| Parity on repo inputs / `--live` copy | `node scripts/check-console-headers.js [--live]` | OK files=4 / files=5 | ✓ PASS |
| WR-01 reproduction (CSP) | `--live` copy without CSP `always` | `CSP-NOT-ALWAYS`, FAIL, exit 1 | ✓ PASS |
| XPCDP without `always` | `--live` copy | WARN, OK, exit 0 | ⚠️ warning (follow-up) |
| Classic seam | `node services/console/src/test/xsrf-seam.cjs` | all ok | ✓ PASS |
| OpenAPI parses (after the note edit) | `js-yaml load` | YAML OK | ✓ PASS |
| Debt-marker gate | `grep -E "TBD\|FIXME\|XXX"` over covered files | 1 FIXME, tracked; 1 `mktemp` template | ✓ PASS |

### Probe Execution

The phase's probes target production and were not re-run (read-only constraint). Their results come from the operator-attested annex rows: "Signed flip", "Gluster header edit", "Final automated sweep" and "Review-fix deploy". `bash -n` passes for both shell probes.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| SEC-CSRF-02 | 25-01, 03, 04, 06, 08, 10 | ✓ SATISFIED | SC-1, SC-2 |
| SEC-CSRF-03 | 25-01, 03, 06, 08, 10 | ✓ SATISFIED | SC-2 |
| SEC-CSRF-04 | 25-04, 05, 06, 07, 08, 10 | ✓ SATISFIED | SC-3 (`/api/v2/user` is in PUBLIC_SESSION_ROUTES, so it has no machine-client exemption) |
| SEC-CSRF-05 | 25-02, 03, 04, 05, 07, 08, 10 | ✓ SATISFIED | SC-3 |
| SEC-CSRF-06 | 25-02, 04, 06, 08, 10 | ✓ SATISFIED (operator-attested) | SC-1, SC-2, SC-4 |
| SEC-CSP-03 | 25-09, 10 | ✓ SATISFIED | SC-5 |
| SEC-CSP-04 | 25-02, 09, 10 | ✓ SATISFIED | SC-5 (one override) |

All seven IDs are claimed in plan frontmatter and marked Complete in REQUIREMENTS.md. None is orphaned.

### Prohibitions (must-NOT checks)

Test-tier prohibitions with wired enforcement (verified):
- No random key.
- No token, key or session id in logs.
- No shrink of a logged-in session.
- Only verified auth exempts.
- Capability links, OAuth and device API not guarded, Tier 3 not guarded (inventory exclusions).
- CSP value unchanged (identical md5 across the pre, post and canonical snapshots).
- CSRF_ENFORCE unchanged.

Judgment-tier prohibitions are flagged for human sign-off and grouped into the five `human_verification` items in the frontmatter. Each has a non-authoritative verifier verdict of "no contradiction found". The parity-exception prohibition was knowingly broken by EVAL_OPTIONAL; the operator approved it, and it is recorded as an override.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| lib/router.js | 127 | `FIXME (tracked: .planning/todos/pending/2026-10-01-bearer-verify-failure-status-401.md)` | ℹ️ Info (gate satisfied) | Formerly a blocker. The todo covers 403 → 401 on a failed JWT verify |
| scripts/csrf-live-probe.sh | 70 | `mktemp …XXXXXX` | ℹ️ Info | Temp-file template, not a debt marker |
| scripts/check-console-headers.js | ~338-419 | `always` mismatch on XPCDP, Referrer-Policy, Permissions-Policy and HSTS is only a WARN | ⚠️ Warning | Residual of WR-01. If a file drops `always` on these headers, 4xx/5xx responses lose them and CI stays green. Every file carries `always` today, and the live 404 check passed. Left as a follow-up by decision; it contradicts no success criterion |
| lib/middleware/csrf.js | 101-105 | `CSRF_SECRET` accepted at any length, env value not trimmed (IN-02) | ℹ️ Info | Follow-up; production uses the 64-hex Docker secret |
| .planning/ROADMAP.md | Phase 25 | "Plans: 6/10 plans executed"; 25-06/08/09/10 unchecked | ℹ️ Info | Bookkeeping |
| Proxied `/api/*` on console hosts | n/a | helmet and nginx both send several security headers | ℹ️ Info | SC-5 requires exactly one CSP, and that holds. 25-10 follow-up #2 |

### Human Verification Required

The browser and production checks that SC-1, SC-2, SC-4 and SC-5 need are covered by the operator-attested annex. What remains is the per-item human sign-off on the judgment-tier prohibitions:

1. **Production change discipline.** Confirm no restart.sh, stack deploy or push to main, CSRF_ENFORCE never changed, and only thinx_api updated by command (plus the two 25-09 console forces).
2. **Privacy of committed artifacts.** Confirm no hosts, IPs, cookies, tokens, secrets or operator identifiers beyond the AGENTS.md endpoint. Verifier scan: clean.
3. **Non-destructive testing.** Confirm no real account or device was modified by specs, probes or the combined pass (except the throwaway account).
4. **Gate discipline.** Confirm the 24 h observe window was kept, D-05 found 0 external callers before the WR-04 guard, and the requirements were marked complete only after `all-passed`.
5. **Gluster edit method.** Confirm the in-place write (same inode), no sed -i, editor or checkout, and both consoles force-updated.

25-10 item 7 (expired pre-session in a browser) was skipped. Its server half is covered by a passing local test, and no success criterion requires it.

### Gaps Summary

No gaps remain. The debt-marker blocker is closed by a tracked todo reference, the review-fix deploy is now recorded, and the OpenAPI exemption notes match the code. Phase 25's goal is achieved. Status is `human_needed` only because of the judgment-tier prohibition sign-off above.

Remaining non-blocking follow-ups:
1. Extend the parity `always` check to XPCDP, Referrer-Policy, Permissions-Policy and HSTS.
2. IN-02: `CSRF_SECRET` length and trim.
3. Update the ROADMAP Phase 25 checkboxes.
4. The 25-10 follow-ups (console CI hitting production, duplicate proxied headers, SEC-CSP-05, legacy branch retirement, Tier 3, `/nginx_status`).

---

_Verified: 2026-10-01T13:05:00Z (re-verification; initial run 12:40:00Z)_
_Verifier: Claude (gsd-verifier)_
