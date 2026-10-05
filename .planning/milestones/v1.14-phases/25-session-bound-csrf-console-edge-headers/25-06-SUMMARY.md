---
phase: 25-session-bound-csrf-console-edge-headers
plan: 06
subsystem: ops
tags: [csrf, production, observe, telemetry, redeploy, operator-check]

requires:
  - phase: 25-04
    provides: production in CSRF_MODE=observe since 2026-09-29T17:06:30Z
provides:
  - Observe window evidence (24.0 h, 0 unexplained reasons from regular traffic)
  - D-05 end-of-observe result (0 external callers)
  - Forced thinx_api redeploy survival (key and Redis sessions survive)
  - Operator cold-login results on both consoles, with the Vue OAuth session_mismatch finding
affects: [25-08]

actuals:
  tasks: 3
  commits: 1
plan_head_before: 056d313d46df6813b2eb45e5f27ed87ad6ef3133

requirements-completed: [SEC-CSRF-02, SEC-CSRF-03, SEC-CSRF-06]

coverage:
  - id: T1
    description: "Observe window closed with evidence; D-05 re-run"
    requirement: SEC-CSRF-02
    status: pass
  - id: T2
    description: "Pre-session primed before a forced redeploy passes after it; 0 lost-session lines; 0 restarts"
    requirement: SEC-CSRF-06
    status: pass
  - id: T3
    description: "Both logged-in tabs survived; six cold logins worked (operator: checks-passed)"
    requirement: SEC-CSRF-03
    status: pass-with-finding
---

# 25-06 SUMMARY: observe review, forced redeploy, operator cold logins

**The 24 h observe window closed clean. A forced `thinx_api` redeploy kept a mid-flight pre-session valid. The operator confirmed both live tabs and all six cold logins. The cold logins found one thing that must be resolved before the 25-08 flip: each Vue Google or GitHub login reaches `POST /api/v2/login` and `POST /api/v2/session/token` with a destroyed pre-session (`session_mismatch`).**

## Task 1: observe window (2026-09-29T17:06:30Z → 2026-09-30T17:08Z, 24.0 h)

- `thinx_api`: `CSRF_ENFORCE=true`, `CSRF_MODE=observe`. It ran as one task the whole window, with 0 restarts and no reschedule.
- Counters: only the four probe counters from 25-04 (`OBS-TOTAL 4`). There is no `csrf:obs:20260930` key.
- Logs: 3 CSRF lines, all from the 17:06:59Z probe. 1 observe boot line, 0 CRITICAL.
- Classification: **0 unexplained.** One classic `POST /api/login` 403 logged no CSRF line, so it is not a CSRF rejection.
- D-05: **0 external callers.** All 12 `POST /api/user/create` hits fall on probe timestamps. There are 0 `POST /api/v2/user`.
- Caveat: real traffic during the window was light (one login per console), so the cold logins below are the main exercise.
- Operator answer: `check-now`.

## Task 2: forced redeploy (2026-10-01)

| Step | UTC | Result |
|---|---|---|
| Prime + baseline replay | 08:34:26Z | `200 email_required` |
| `docker service update --force --no-resolve-image thinx_api` | 08:34:27Z → 08:34:50Z | completed, new task Running, digest `bfe2a2fc73e3…` and `CSRF_` env unchanged |
| Replay of the same pre-session | 08:34:55Z | `200 email_required` |
| Logs since redeploy | | 0 lost-session lines on `POST /api/user/create`, boot line × 1, 0 CRITICAL |
| Restart check | 08:54Z | 0 restarts |

## Task 3: operator checks: `checks-passed`

- Both tabs that were logged in before the redeploy survived. rtm profile save and API key create/revoke both returned 200. The Vue profile save returned 200.
- Classic password, Google and GitHub logins each prime `GET /api/csrf-token` before `POST /api/login`. They logged 0 CSRF lines.
- Vue password login logged 0 CSRF lines.
- **Finding: Vue Google and GitHub logins.** These logged 4 pairs of `session_mismatch`, on `POST /api/v2/session/token` and `POST /api/v2/login`, at 08:38:14, 08:41:39, 08:41:56 and 08:42:02Z. Each pair comes right after an OAuth return.
  - **Cause:** `GET /api/oauth/{google,github}` destroys the session (`lib/router.google.js:190`, `lib/router.github.js:235`). The browser still holds `XSRF-TOKEN` and `x-thx-core`. `OAuthReturn.vue` calls `ensureCsrfToken()` without `force`, sees the existing cookie and skips the prime. Then it posts with a token bound to the destroyed session.
  - **Under `signed`:** each Vue OAuth login would first get a 403 `csrf_token_invalid`. `fetchWithCsrf` would then force a re-prime and retry once. That retry path has not been exercised in production.
  - **Classification:** formally this is "explained" (`session_mismatch` on login and `session/token` routes). But the cause is the OAuth hop, not an expired pre-session.

## Finding resolved (operator chose "fix it first")

- Console commit `5d3ab53`: `OAuthReturn.vue` and `App.vue`'s hydrate force the shared prime on `/oauth-return`.
  - Test: Cypress `oauth-return.spec.js`. It fails without the fix and passes with it.
  - The 13 other Cypress failures are present on the unchanged code too, with the same per-spec counts.
- Shipped in parent `72725c66` on 2026-10-01. CI green. All three services rolled by 09:51:15Z, still in observe mode.
- This deploy also shipped the 25-05 and 25-07 guards. In observe mode they only log.
- Operator Vue Google × 2 and GitHub × 2 (09:57–09:59Z): each OAuth return primes once before its POSTs. **0 CSRF lines since the rollout.**

## For 25-08

- The Vue OAuth finding is fixed. The flip still needs its own operator approval.
- The guards are already live, so the D-05 re-check before the guards becomes a check that the 23 D-11 paths log nothing unexplained under observe.
- The D-05 re-check before the guards must include the 23 D-11 paths.

## Deviations

- The Task 1 gather ran from a scheduled resume while the operator was away. One read-only Traefik timestamp query was denied by the auto-mode classifier. After auto mode was turned off, the Task 2/3 reads covered that same ground.
- Task 2 ran as a single script approved by the operator, `scratchpad/p25-task2.sh`, which is not committed.
