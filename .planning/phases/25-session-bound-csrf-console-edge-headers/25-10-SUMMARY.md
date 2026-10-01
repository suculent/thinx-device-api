---
phase: 25-session-bound-csrf-console-edge-headers
plan: 10
subsystem: ops
tags: [verification, closeout, csrf, headers]

requires:
  - phase: 25-08
    provides: CSRF_MODE=signed, guards proven
  - phase: 25-09
    provides: hardened and mirrored console headers, CI parity gate
provides:
  - Combined two-console verification under signed mode
  - Requirements SEC-CSRF-02..06 and SEC-CSP-03/04 marked Complete
affects: [26]

requirements-completed: [SEC-CSRF-02, SEC-CSRF-03, SEC-CSRF-04, SEC-CSRF-05, SEC-CSRF-06, SEC-CSP-03, SEC-CSP-04]
---

# 25-10 SUMMARY: Phase 25 verified end to end

## Task 1: automated sweep (2026-10-01 11:19–11:21Z): END-STATE-OK

- `csrf-live-probe.sh --guards`: every signed and guard expectation met.
- `LIVE-HEADERS OK` on both hosts.
- `HEADER-PARITY OK`: 4 files, and 5 with `--live` against a fresh copy of the gluster file.
- Env `CSRF_ENFORCE=true` and `CSRF_MODE=signed`. Running, 0 restarts. Swarm `thinx.yml` HEAD is signed. 0 CRITICAL since the flip.
- Rejections since the flip: the probes, plus 8 `no_cookie` lines from the **console repo's CircleCI Cypress job** (build 849). **0 real-user rejections.**
- D-05: 0 external callers.
- CircleCI for `72efe5cd`: every job succeeded.
- Annex commit `1f2a74ff`.

## Task 2: operator pass: all-passed (item 7 skipped)

- Items 1–5 passed: cold logins, classic public flows, classic dashboard mutations, Vue console, shared cookie jar.
- Item 6 (headers) was checked by the executor in chrome-devtools on both hosts. Each document has one CSP, `XPCDP: none`, Referrer-Policy and Permissions-Policy. Proxied API responses have one CSP.
- Item 7 (expired pre-session) was skipped. The server side of that path is covered by `ZZ-CSRFEnforceSpec` and the 25-06 forced-redeploy replay.

## Follow-ups (not done here)

1. **Console repo CI hits production.** Its "Test Vue console" job runs Cypress, including `login.spec.js`, with `VUE_APP_API_HOSTNAME=https://rtm.thinx.cloud`.
   - The job has failed on every build since at least 2026-09-25.
   - It sends real cross-site requests to the production API: builds 847, 848 and 849 match every unexplained CSRF line in this phase.
   - Fix: point it at stubs or a staging API.
   - The local suite also has 13 failing specs on the unchanged code.
2. **Duplicate security headers on proxied API responses.** helmet and nginx both send Referrer-Policy, XPCDP, X-Download-Options, X-Content-Type-Options, X-Frame-Options (`SAMEORIGIN, DENY`), X-XSS-Protection (`0, 1; mode=block`) and HSTS. Fix by adding `proxy_hide_header` for these, the same way D-19 handled the CSP, or by dropping them from helmet. Low impact on JSON.
3. **SEC-CSP-05.** `console.thinx.cloud` still serves the shared CSP with `'unsafe-eval'`. The Vue image already omits it, but the bind mount overrides the image.
4. Retire the legacy `CSRF_MODE` branch now that signed mode runs clean. This is the accepted debt of the 25-01 assumption-delta decision.
5. Tier 3 cookie-authenticated resource mutations (devices, sources, mesh, build, chat) need a follow-up requirement (D-21).
6. `/nginx_status` is publicly reachable on both console hosts.
7. The D-05 check depends on how long the Traefik task keeps its log, about 57 h or more.
8. The `ensureCsrfToken` single-flight prime ignores `force` when a non-forced prime is already in flight. That's harmless today, because both OAuth-return callers force.
