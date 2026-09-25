---
phase: 21-csp-wildcard-removal-anti-csrf-token
plan: 05
subsystem: infra
tags: [csrf, enforce-flip, runbook, swarm, stackhawk-removal]

# Dependency graph
requires:
  - phase: 21-csp-wildcard-removal-anti-csrf-token
    provides: 21-04 fail-open verification and its pre-flip gate
provides:
  - CSRF double-submit enforcement live on thinx_api (CSRF_ENFORCE=true), persisted in swarm thinx.yml
  - Operator runbook .planning/runbooks/csp-csrf-hardening.md, with flip, rollback and a filled Execution Annex
affects: [SEC-CSRF-01, SEC-CSP-01]

tech-stack:
  added: []
  removed: [StackHawk (stackhawk.yml)]
  patterns:
    - "Flip a swarm service flag with `docker service update --env-add … --no-resolve-image` so only the env changes, then persist it in the stack file with an index-only commit that leaves unrelated uncommitted edits alone"

key-files:
  created:
    - .planning/runbooks/csp-csrf-hardening.md
  modified:
    - .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx
    - .planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx
    - /mnt/gluster/deployment/swarm/thinx.yml (swarm repo, commit bc6d04a)
  deleted:
    - stackhawk.yml

key-decisions:
  - "Option A (CSRF_ENFORCE env var) over config.json: it is visible in `docker service inspect`, a typo cannot stop the API from booting, and rollback is one command"
  - "Flipped 2026-09-25 09:02Z on the operator's instruction, before the planned ~1-day log watch finished; ~25 min of clean logs covered three real logins"
  - "The HawkScan rescan was skipped: StackHawk is deprecated and its only integration point (stackhawk.yml) was removed"

requirements-completed: [SEC-CSRF-01, SEC-CSP-01]

duration: ~1h (flip + verification)
completed: 2026-09-25
---

# Phase 21 Plan 05: CSRF Enforce Flip Summary

**CSRF double-submit enforcement is live on `thinx_api`. A request without a matching `X-XSRF-TOKEN` now gets 403 `csrf_token_invalid`. Cold login on both consoles, the Vue password reset, the classic GitHub OAuth return and a warm Vue reload all still work.**

## Task 1 — runbook and flip

- **Runbook:** `.planning/runbooks/csp-csrf-hardening.md` (ab4f32ac) covers the live state, both switches, the pre-flip gate, the flip and rollback for each option, and the post-flip checks. The two stale nginx snapshots were refreshed from the live gluster config.
- **Flip:** `docker service update --env-add CSRF_ENFORCE=true --no-resolve-image thinx_api` ran at 09:02:03Z and converged at 09:02:24Z, on the same image digest.
- **Persisted:** swarm repo `thinx.yml` commit `bc6d04a`, one line only. The pre-edit copy is `/root/thinx.yml.bak-20260925`. Enforcement survived a later CI redeploy onto a new image (`ba445285…`).

## Task 2 — verification

| Check | Result |
|---|---|
| Login with no header (via rtm) | 403 `csrf_token_invalid` ✓ |
| Login with a primed token | `invalid_credentials` ✓ |
| Primed `session/token` via the console proxy | 401 `no_session` ✓ |
| Warm Vue reload (Kapture) | `session/token` 200; no 403 among the 17 API calls ✓ |
| Cold login, both consoles (operator) | OK ✓ |
| Vue password reset (operator) | OK ✓ |
| Classic GitHub OAuth on rtm (operator) | OK after a reload ✓ (see Issues) |
| HawkScan rescan | **Skipped.** StackHawk is deprecated and was removed (bb0ce4a7). |

## Issues encountered

- **The GitHub OAuth first attempt failed with 502/504 on static assets.** A CI auto-redeploy, triggered by a docs-only push to `thinx-staging`, was restarting `thinx_console` at that moment. After a reload the login landed on the dashboard. Not CSRF-related, but every push to `thinx-staging` restarts the consoles and the API, including docs-only pushes.
- **The pre-flip gate was not fully met.** The 2026-09-25T08:35:09Z `session/token` mismatch is still unexplained. Enforce mode writes no log line on rejection, so a user lockout would show up only as a client 403, in Rollbar or in user reports.
- **Rollback, if needed:** `docker service update --env-rm CSRF_ENFORCE --no-resolve-image thinx_api`, then revert `bc6d04a` in the swarm repo.

## Deviations

- The chrome-devtools isolated browser hung during the cold test. The operator ran the cold logins instead.
- The `must_haves` truths about a HawkScan rescan reporting 0 NEW 10055-4 / 20012 are not verified. The rescan was waived by the operator because the service is deprecated.
