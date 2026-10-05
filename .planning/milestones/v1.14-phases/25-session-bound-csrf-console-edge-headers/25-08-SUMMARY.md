---
phase: 25-session-bound-csrf-console-edge-headers
plan: 08
subsystem: ops
tags: [csrf, production, signed, guards]

requires:
  - phase: 25-06
    provides: observe evidence, forced-redeploy survival, operator checks-passed, Vue OAuth re-prime fix
provides:
  - thinx_api in CSRF_MODE=signed since 2026-10-01T10:51:19Z (persisted in swarm thinx.yml 45a337d, mirrored in docker-swarm.yml)
  - WR-04 and account-route guards live and proven under signed
affects: [25-09, 25-10]

requirements-completed: [SEC-CSRF-02, SEC-CSRF-04, SEC-CSRF-05]
---

# 25-08 SUMMARY: CSRF_MODE=signed live, guards proven

**Production enforces session-bound CSRF tokens.** Planted, stale and header-less tokens get 403. Every guarded account route refuses requests that carry only the cookie. Primed pairs pass. Nobody was locked out.

## Task 1: approval (`flip`)

- Telemetry since 25-06 is fully explained:
  - 8 × `session_mismatch`: the Vue OAuth logins before the fix.
  - 5 × `no_cookie` on `/session/token`: the executor's local Cypress `login.spec.js` runs. That spec calls the live API cross-site from `localhost:3000`, so the browser does not send the `SameSite=Lax` cookie. A spec that hits the live API should not run against production during a phase.
- D-05: 0 external callers.
- CouchDB: 658 accounts, 7 seen in the last 30 days, including the operator's three test accounts.
- Deviation: the guards were already pushed with the 25-06 fix, so the "flip-and-guard" choice shrank to the flip plus the `--guards` proof.

## Task 2: flip

- 10:50:51Z: `--env-add CSRF_MODE=signed`. The boot line `mode=signed key_source=secret enforce=true` appeared at 10:51:19Z. 0 CRITICAL, 0 restarts after 15 minutes.
- Probe `--guards` at 10:51:42–45Z: all signed expectations and all guard expectations met (runbook annex, "Signed flip" row).
- Watch to 11:06Z: only the probe's 8 lines. **0 real-user rejections.**
- Operator checks under signed: the pre-flip tab kept its session. Classic GitHub, Google and password logins and a profile save worked. Vue password, Google and GitHub logins each primed once and logged in on the first attempt.
- Persisted: swarm `45a337d` (`thinx.yml` only, index-only, 1 line) and parent `a1c76cd4` (`docker-swarm.yml` mirror).

## Task 3: guards

Live since 09:51Z (parent `72725c66`). The `--guards` probe above proves them under signed. CI `test` 15506, which includes the first CI run of `ZZ-CSRFRouteGuardSpec`, and `api-registry` 15507 both passed.

## Rollback

`docker service update --env-add CSRF_MODE=legacy --no-resolve-image thinx_api` (D-08). It has not been needed.
