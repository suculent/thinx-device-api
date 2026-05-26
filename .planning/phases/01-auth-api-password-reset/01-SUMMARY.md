---
phase: 01-auth-api-password-reset
status: complete
verified: 2026-05-26
requirements:
  - AUTH-API-01
verification: Verified via live rtm UAT (2026-05-26) — curl probes + Vue console end-to-end round-trip (after a preexisting CouchDB account-state issue was restored as Deviation #2 in 01-02-SUMMARY)
deploys:
  - thinxcloud/api:latest sha256:0a0e6b32  # production at 2026-05-26 close-out
plans:
  - 01-01 (Wave 1, backend fixes) — complete (Summary at 01-01-SUMMARY.md)
  - 01-02 (Wave 2, regression spec + UAT) — complete (Summary at 01-02-SUMMARY.md)
---

# Phase 1 SUMMARY — AUTH API Password Reset (G8 / AUTH-API-01) — VERIFIED

## What shipped

- **`lib/router.js`** Bearer-null guard (commit `622aa014`) — class-fix for ALL routes: literal `Authorization: Bearer null` / `Bearer undefined` / `Bearer ` (empty) is now treated as no-token, and the request falls through to the cookie/no-auth path instead of stamping 403 at L132.
- **`lib/router.user.js`** `postPasswordReset` normalization in two phases (commits `db46790c` + `c67d9afd`) — production path always returns `200 + {success:true,response:"password_reset_request_accepted"}` regardless of registered/unregistered status. Test env preserves the legacy passthrough so the existing round-trip spec at `ZZ-AppSessionUserSpec.js:191-198` continues to chain through `reset_key`.
- **`spec/jasmine/ZZ-AppSessionUserSpec.js:170-180`** assertion update (folded into `db46790c`) — legacy alias no-data case now asserts 200 + envelope shape, not the old 401 + specific `email_not_found` string.
- **`spec/jasmine/ZZ-RouterPasswordResetSpec.js`** new regression spec (commit `3413166c`) — 7 tests explicitly covering the `Bearer null` trigger that the existing unauth-POST spec at `ZZ-AppSessionUserV2DeleteSpec.js:85-97` would not catch (it omits the header entirely).

All four changes are deployed live on `rtm.thinx.cloud` as image `thinxcloud/api:latest sha256:0a0e6b32`.

## Root cause

A two-fault interaction between the Vue console and the backend:

**Frontend half (services/console submodule, not changed in this phase):** The Vue console's API client at `services/console/vue/src/core/api.js:53-57` unconditionally sets `Authorization: 'Bearer ' + this.refreshToken` on every request, including the unauthenticated `/password/reset` call. When the user is logged out, `this.refreshToken === null`, so the literal string `"Bearer null"` is serialized into the header.

**Backend half (this phase's fix):** `lib/router.js:103` matched on header **presence**, not validity. The literal string `"null"` after the Bearer prefix passed the presence check, was dispatched to `app.login.verify`, failed JWT validation, and stamped `res.status(403).end()` at L132. Every Vue-console-initiated unauthenticated request to a public route hit this 403 path.

The legacy AngularJS console worked because it omitted the `Authorization` header entirely when logged out — the JWT branch never fired.

**Why this surfaced now:** The handler at `lib/router.user.js postPasswordReset` (L39-48) has been unchanged for ~12 months (last touch was `0514f6ea` on 2025-05-07, which modified `postChat` — not the reset path). The Vue console's `Bearer null` pattern is recent enough that the bug only became live with the Vue console rollout. The console's [Phase 11 Wave 2 / G9](../../REQUIREMENTS.md) for selection-prune shipped on 2026-05-26 in the same deploy unit.

**Fix philosophy (per CONTEXT.md D-02 smallest-change preference):** The backend guard is a class-fix that closes the entire bug class (Bearer-null on ANY route), not just `/password/reset`. The frontend half remains — the Vue console still sends `Bearer null` — but it's now harmless. A follow-up Vue-side cleanup (skip the header when refreshToken is null) is filed as a v1.x candidate.

## Reversion plan

If a regression surfaces in production after the deploy:

1. **Symptom A: `Bearer null` re-introduces 403.** Revert `622aa014` (`lib/router.js`). Single file, single hunk. `git revert 622aa014 && git push && ./restart.sh on the swarm`. JWT-success path and JWT-fail path (real malformed JWTs) are byte-preserved aside from one level of indentation — see static gates in `01-01-SUMMARY.md`.

2. **Symptom B: Password reset response shape breaks a frontend assumption.** Revert `c67d9afd` to restore the per-call passthrough (kept the `200` status code, lost the body normalization). Test env unaffected by the tightening, so the chai-http spec keeps passing. Revert `db46790c` if even the status normalization breaks something — that takes the API back to the pre-Phase-1 401-on-unregistered behavior (which would re-trigger Wave 1's `email_not_found` enumeration leak, but at least restore prior compatibility).

3. **Symptom C: A real-JWT-bearing route gets unexpectedly fallen-through.** The guard at `lib/router.js:103` explicitly whitelists `null`/`undefined`/empty falsy forms only. If a legitimate JWT is being misclassified as "Bearer null", that's a token-generation bug elsewhere (probably a refresh-token serialization issue), not a guard-too-wide bug. Capture the failing request payload and trace upstream. Worst case, revert `622aa014` and add an explicit deny-list instead.

4. **Symptom D: Audit-log surface changes.** The Wave 1 fix removed an `audit_log` write on the unregistered-email path. If audit logs unexpectedly drop signals for reset attempts on unregistered emails, restore via a small additive commit (log via `alog.log` regardless of registration outcome), not via reverting the no-enum fix.

5. **Worst case (full revert):** Revert all three code commits (`622aa014`, `db46790c`, `c67d9afd`) in one batch, push, redeploy. v1 GA ship is then blocked on this phase and we re-discuss.

## Verification matrix (post-deploy)

| Cell | Status | Evidence |
|---|---|---|
| curl `Bearer null` on rtm → 200 | ✓ | Probe 1 in `01-02-SUMMARY.md` |
| curl no-Auth + unregistered email → 200 + normalized body | ✓ | Probe 2 |
| curl `Bearer abc.def.ghi` (negative control) → 403 | ✓ | Probe 3 — guard didn't widen too much |
| Bodies identical between registered and unregistered (production) | ✓ | Probes 1 & 2 return the SAME body |
| Vue console "Forgot password?" round-trip end-to-end | ✓ | Live walk 2026-05-26 (after restoring `deleted:true` on test account — Deviation #2 in 01-02-SUMMARY) |
| Login with new password after reset | ✓ | Confirmed: works with both email/username and owner_id |
| chai-http v4 regression spec passes on `c67d9afd` (CI) | ✓ | CircleCI `main` workflow on `c67d9afd` was green |
| chai-http v4 lock honored (no v5 migration) | ✓ | `! grep -q "request.execute" spec/jasmine/ZZ-RouterPasswordResetSpec.js` confirmed by plan-checker |
| Atomic-commit-per-fix convention preserved | ✓ | `622aa014`, `db46790c` (paired with spec assertion update), `3413166c`, `c67d9afd` — each independently revertable |
| Submodule guard (no `services/console/`, `services/worker/`, `services/transformer/` writes from this phase) | ✓ | `git diff --stat 94d3399c..c67d9afd -- services/` returns nothing |

## Findings discovered during UAT (NOT regressions from this phase)

Five separate issues surfaced during the Vue console UAT walk. None are caused by Phase 1's fix — all preexisted today. Triaged below; all five are added to `REQUIREMENTS.md` v2/deferred for follow-up:

### A. Test user account had `deleted: true` (test artifact)

- **Symptom:** Login fails with 403 `user_account_deactivated` after a successful password reset.
- **Source:** `lib/router.auth.js:189-191` gates on `user_data.deleted === true`. Set by `lib/thinx/owner.js:660-682` `delete()` — the only path that sets the flag.
- **Likely origin:** User performed a Phase 9 G7 Vue console profile-delete UAT on or about 2026-05-24 (account `activation_date` is `2026-05-24T18:41:51.907Z`), which correctly triggered the `delete()` path. Account was never reactivated.
- **Resolution (2026-05-26):** Restored via direct CouchDB PUT — `_rev` 14 → 15, `deleted` true → false. Other fields preserved. See `01-02-SUMMARY.md` Deviation #2.
- **Follow-up:** Not a recurring bug. **However**, the absence of an account-reactivation flow is worth flagging — once a user is `deleted:true`, the only path back is direct DB mutation. Filed as `AUTH-REACTIVATE-01` in v2/deferred.

### B. Frontend JSON parse error (`SyntaxError: Unexpected identifier "object"`)

- **Symptom:** Both `login.js:173` (legacy console) and `password.js:87` (legacy console password-set page) log `SyntaxError: JSON Parse error: Unexpected identifier "object"` on the success branch of password-reset and password-set requests.
- **Source:** Frontend code is calling `JSON.parse(response.toString())` or equivalent on a value that's already a JavaScript object — coercing it to the literal string `"[object Object]"` and then failing the parse. Legacy AngularJS console code.
- **Caused by Phase 1?** **No.** The status code (200) and body (`{...}`) shape Wave 1 normalized to is structurally identical to the previous registered-email success response. The bug would have fired on any 200 + JSON response. Probably a long-standing legacy console bug that nobody noticed because the round-trip wasn't being walked.
- **Filed as `CONSOLE-LEGACY-JSON-PARSE` in v2/deferred.** Lives in the legacy AngularJS console codebase under `services/console/src/` (NOT the Vue console). Low priority because the legacy console is being deprecated.

### C. Reset email link points to `rtm.thinx.cloud/api/user/password/reset?...`

- **Symptom:** User clicks the link in the password-reset email and lands on the LEGACY AngularJS password-set page on `rtm.thinx.cloud`, not the Vue console's password-set route on `console.thinx.cloud`.
- **Source:** `lib/thinx/owner.js:147` builds the email link as `app_config.api_url + port + "/api/user/password/reset?owner=..."`. `app_config.api_url` is the API host (`rtm.thinx.cloud`), so the link points there. By design — the API endpoint validates the reset_key first, then presumably proceeds to a password-set page.
- **Caused by Phase 1?** **No.** Email link construction has been unchanged since long before this phase. The complication is that the Vue console's user expectation diverges from the legacy console (the legacy hosted the password-set HTML on `rtm.thinx.cloud`; the Vue console hosts its own equivalent route on `console.thinx.cloud`).
- **Filed as `AUTH-RESET-LINK-CONSOLE` in v2/deferred.** Fix is either (a) backend: change `app_config.api_url` → a new `app_config.console_url` for the email link, OR (b) backend: have the GET handler redirect from rtm → console after key validation. Requires coordination with the Vue console submodule's password-set route.

### D. ~~Login expects owner_id instead of email/username~~ (WITHDRAWN)

User confirmed at close-out walk that login accepts both `username/test_password` and `owner_id` credentials. Not actually a regression. Withdrawn from the v2 backlog.

### E. Legacy console profile page shows `john@doe.com` placeholder

- **Symptom:** Legacy AngularJS console at `rtm.thinx.cloud` profile page shows `john@doe.com` instead of the user's actual email.
- **Caused by Phase 1?** **No.** Legacy console UI bug, owned by `services/console/src/` (the AngularJS half), not the Vue console.
- **Triage:** **WON'T FIX in v1.** Legacy console is on the deprecation path; the Vue console is the v1.0 GA frontend. Documented for completeness only. Removed from v2/deferred candidates.

## Phase exit gates

- ✓ AUTH-API-01 closed end-to-end (curl + Vue UAT + login round-trip).
- ✓ Regression spec on `Bearer null` exists and will fail in CI if the guard regresses.
- ✓ No new npm dependencies added.
- ✓ chai-http v4 lock honored (AGENTS.md L82-92).
- ✓ No `mapGetters` shifts in `services/console` — phase doesn't touch frontend code at all.
- ✓ Atomic commit per fix.
- ✓ Root cause + reversion plan documented (this file).
- ✓ Verification matrix complete with concrete evidence.
- ✓ Out-of-scope items (SEC-PII-01, OPS-01, SEC-DEP-01) genuinely untouched by this phase's edits.
- ✓ All commits unsigned per session authorization; memory `unsigned-commits-260526` covers the policy.

## Next phase

**Phase 2 — PII Logging Scrub** (SEC-PII-01). Targets the 6 sites surfaced by `.planning/codebase/CONCERNS.md` in `lib/thinx/owner.js`: emails (L499), reset_keys (L451/L474/L583/L647), Mailgun token (L95), activation token (L228). All within a single file; small atomic edits.

Run `/gsd:plan-phase 2` when ready.

## Commits this phase

```
8008a03 docs(phase-01): seed CONTEXT.md from G8 pre-investigation
35f16a3 docs(phase-01): RESEARCH.md - G8 root cause located with HIGH confidence
94d3399 docs(phase-01): G8 password-reset plans - backend + regression spec + UAT
622aa01 fix(router): G8 - guard JWT branch against literal "Bearer null" / empty tokens
db46790 fix(auth): G8/AUTH-API-01 (b) - normalize password reset to 200 (no enumeration)
7b3b933 docs(phase-01/01-01): plan 01-01 summary
3413166 test(spec): G8 regression - Authorization: Bearer null + no-enum coverage
e3c9a11 docs(phase-01): Wave 2 checkpoint - Vue UAT pending on rtm
c67d9af fix(auth): G8/AUTH-API-01 (b) - fully normalize response body (no enum via body)
```

10 commits across the phase (CONTEXT/RESEARCH/PLAN/4 code commits/SUMMARY/CHECKPOINT/tightening fix).
