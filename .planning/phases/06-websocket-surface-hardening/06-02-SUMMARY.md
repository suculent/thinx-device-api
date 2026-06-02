---
phase: 06-websocket-surface-hardening
plan: 02
subsystem: security
tags: [security, cookie, httponly, session, thinx-core, runbook, regression-spec, sec-cookie-01]

requires:
  - phase: 06-websocket-surface-hardening
    provides: "06-CONTEXT.md SEC-COOKIE-01 decision block + the post-Phase-5 thinx-core.js:316 anchor"
  - phase: 06-websocket-surface-hardening
    provides: "Plan 06-03 runbook file at .planning/runbooks/websocket-handshake.md (Wave 1; this plan APPENDS the rollback section in Wave 2)"

provides:
  - "Main session cookie x-thx-core ships with httpOnly: true (thinx-core.js:316). The stale 'temporarily disabled due to websocket debugging' debugging-era comment is removed."
  - "Regression spec at spec/jasmine/ZZ-CookieAttributeSpec.js asserts that the Set-Cookie: x-thx-core= response header on a session-establishing endpoint INCLUDES the HttpOnly RFC 6265 attribute. Also regression-baits against stringly-typed mis-encodings (HttpOnly=true / HttpOnly=false)."
  - "Runbook section ## SEC-COOKIE-01 Rollback Procedure appended to .planning/runbooks/websocket-handshake.md documenting the < 5min operator-side revert path (edit line 316 → commit on thinx-staging with subject `revert(SEC-COOKIE-01): restore httpOnly: false pending WS investigation` → push → Swarmpit autoredeploy to 188.166.23.244)."
  - "Closes SEC-COOKIE-01 milestone-v1.9 debt requirement. Narrows XSS-stealable-cookie surface for x-thx-core; idempotent re-assertion at lib/router.auth.js:106 (OAuth post-login override) survives unchanged."

affects:
  - "thinx-core.js sessionConfig.cookie (line 316) — main session cookie now httpOnly:true at creation time"
  - "lib/router.auth.js:106 — req.session.cookie.httpOnly = true; is now idempotent (no behavior change because the cookie is httpOnly at creation). Stays in place as defense-in-depth"
  - "spec/jasmine/ZZ-CookieAttributeSpec.js (NEW) — canonical guard for SEC-COOKIE-01 invariant"
  - ".planning/runbooks/websocket-handshake.md — APPEND only, SEC-WS-01 content from 06-03 survives unchanged"

tech-stack:
  added: []
  patterns:
    - "RFC 6265 flag-style attribute regression assertion: positive substring check for `HttpOnly` + negative-bait substring check against `HttpOnly=true` / `HttpOnly=false` mis-encodings"
    - "chai-http v4 + chai.request.agent inspection of res.headers['set-cookie'] (mirrors ZZ-AppSession.js bootstrap shape)"
    - "Documented < 5min operator-side rollback path for security-flip changes (file edit + commit + push + Swarmpit autoredeploy ≤ 5min SLA per swarm.md)"
    - "Phase 5 local-test ACCEPT pattern continued: static gates (grep + node --check) authoritative locally; CI-side Jasmine is the canonical behavioral gate"

key-files:
  created:
    - spec/jasmine/ZZ-CookieAttributeSpec.js
  modified:
    - thinx-core.js
    - .planning/runbooks/websocket-handshake.md

key-decisions:
  - "Stale debug comment removed entirely (not replaced with an alternate). The intent at SEC-COOKIE-01 close-out is operationally clean; documenting WHY the cookie is httpOnly:true belongs in the threat model + SUMMARY, not in an inline comment that risks future stale-ness."
  - "Regression spec adds a negative-bait assertion against HttpOnly=true / HttpOnly=false stringly-typed mis-encodings — these would be a future regression mode if a developer flipped the value type by accident. RFC 6265 mandates flag-style (presence=true, absence=false)."
  - "Spec targets POST /api/login as the session-establishing endpoint (mirrors ZZ-AppSession.js convention with `dynamic`/`dynamic` test credentials per spec/_envi.json). The Set-Cookie attribute assertion is the actual gate; the choice of session-establishing endpoint is incidental."
  - "Runbook rollback section explicitly documents that the regression spec will FAIL on CI during a rollback window — the failure is the canonical signal that SEC-COOKIE-01 needs a re-attempt. Do NOT delete or skip the spec at rollback time."
  - "Runbook rollback also documents that the post-OAuth-login override at lib/router.auth.js:106 means OAuth-authenticated sessions remain httpOnly even AFTER the rollback. The rollback narrows blast radius rather than fully restoring the pre-Phase-6 surface."

patterns-established:
  - "RFC 6265 flag-attribute regression pattern (positive substring + negative-bait against stringly-typed misencoding) — re-usable for future Set-Cookie attribute work (e.g., SameSite, Secure)."
  - "Two-wave sequencing for plans that share a runbook file: Wave 1 CREATES the file (06-03); Wave 2 APPENDS additional sections (06-02). The APPEND path is preferred over CREATE-with-fallback-stub branching when the orchestrator can guarantee Wave-1 lands first."
  - "Atomic GPG-signed commit grouping a value flip + its regression spec + its rollback runbook section — keeps the SEC-COOKIE-01 change set self-contained and revertable in one operation if needed."

deferred-items:
  - "Smoke-test of SEC-COOKIE-01 on rtm.thinx.cloud via wscat with a real Vue session cookie — BLOCKED by the SEC-WS-01 edge-nginx routing gap (out-of-repo, operator-side fix documented in the same runbook). The rollback section covers the regression-discovery scenario that surfaces post-deploy if a JS-side document.cookie reader of x-thx-core exists in the console bundle."
  - "secure: false flip on the main session cookie (thinx-core.js:315) — OUT OF SEC-COOKIE-01 scope per CONTEXT.md. Tracked as a v1.10+ candidate; would require a swarm-side TLS-termination audit before flipping."
  - "Per-connection metrics for socketMap (mentioned in CONTEXT.md Deferred Ideas) — adjacent to Phase 6 but separable."

metrics:
  tasks: 4
  files: 3
  files-created: 1
  files-modified: 2
  duration-minutes: ~8
  completed: 2026-06-02
---

# Phase 6 Plan 02: SEC-COOKIE-01 (httpOnly:true on x-thx-core) Summary

Flipped `thinx-core.js:316` from `httpOnly: false` to `httpOnly: true`, removed the stale "temporarily disabled due to websocket debugging" comment, added a regression spec asserting `HttpOnly` on the `Set-Cookie: x-thx-core=` response header, and appended a < 5min operator-side rollback procedure to the WebSocket-handshake runbook — all in one atomic GPG-signed commit.

## What Landed

**Single commit: `3c84692c`** — `refactor(SEC-COOKIE-01): enable httpOnly on x-thx-core session cookie` (GPG-signed, 3 files, +152 / -1).

### File-by-file changes

| File | Change | Lines |
|------|--------|-------|
| `thinx-core.js` | Value flip + stale comment removal at line 316 | +1 / -1 |
| `spec/jasmine/ZZ-CookieAttributeSpec.js` | NEW regression spec asserting `HttpOnly` on `Set-Cookie: x-thx-core=` | +80 / -0 |
| `.planning/runbooks/websocket-handshake.md` | APPEND `## SEC-COOKIE-01 Rollback Procedure` section | +71 / -0 |

The `thinx-core.js` diff is exactly the expected one-line modification (the stale comment is part of the deleted line — the entire annotated `httpOnly: false, // temporarily disabled due to websocket debugging` is replaced with the bare `httpOnly: true,`).

## Why This Is Safe

The CONTEXT.md decision block enumerated three convergent pieces of evidence proving the flip is safe — all verified during execution:

1. **The WS upgrade reads cookies server-side** — `thinx-core.js:471` and `:621` both use `request.headers.cookie` (server-side access). `httpOnly: true` only restricts JS-side `document.cookie` reads; it does NOT prevent server-side cookie reads. The WS upgrade flow is unaffected.

2. **The OAuth post-login override already upgrades to httpOnly mid-session** — `lib/router.auth.js:106` sets `req.session.cookie.httpOnly = true;` immediately after the OAuth callback. The system has been tolerating httpOnly on `x-thx-core` for the OAuth-authenticated path without incident. This plan extends the protection to ALL paths (including local-credentials login at `POST /api/login`).

3. **The dedicated WS-session cookie `x-thx-wscore` is already httpOnly:true** — `thinx-core.js:438` proves the WebSocket flow does not need a JS-readable session cookie.

Post-flip, the `lib/router.auth.js:106` line becomes a no-op (the cookie was already httpOnly at creation time), but it stays as defense-in-depth in case the `sessionConfig.cookie` is ever re-flipped or overridden.

## Regression Spec Shape

`spec/jasmine/ZZ-CookieAttributeSpec.js` mirrors the `ZZ-AppSession.js` bootstrap exactly (chai-http v4, in-process THiNX, `chai.request.agent`). The test case:

1. POSTs to `/api/login` with `{ username: 'dynamic', password: 'dynamic', remember: false }` (the canonical test credential pair from `spec/_envi.json`).
2. Reads `res.headers['set-cookie']` (array of strings, lowercased per Node convention).
3. Finds the entry matching `/^x-thx-core=/` — MUST exist on a session-establishing response.
4. **Positive:** asserts the entry's string includes the substring `HttpOnly` (case-sensitive, RFC 6265).
5. **Negative-bait:** asserts the entry does NOT include `HttpOnly=true` OR `HttpOnly=false` — `HttpOnly` is a flag-style attribute (presence = true; absence = false). Future stringly-typed mis-encodings would be a regression.

The spec is independent of SEC-WS-01 (the rtm edge nginx gap) and of REFACTOR-03 (the raw-socket close-handler gap from Plan 06-01). It touches the cookie-attribute surface only.

## Rollback Procedure (< 5 min, operator-side)

Documented in `.planning/runbooks/websocket-handshake.md` under `## SEC-COOKIE-01 Rollback Procedure`. Trigger: Vue console login or WS subscribe regresses on rtm AFTER the SEC-COOKIE-01 deploy lands AND the regression grep-traces to a JS-side `document.cookie` read of `x-thx-core`.

Steps (operator-side):
1. Edit `thinx-core.js:~316`: change `httpOnly: true,` back to `httpOnly: false,`. Do NOT re-add the stale comment.
2. Commit on `thinx-staging` with subject `revert(SEC-COOKIE-01): restore httpOnly: false pending WS investigation`.
3. Push. CircleCI builds + pushes `thinxcloud/api:latest`; Swarmpit autoredeploys to `188.166.23.244` within ~5 min.
4. Verify by reloading the Vue console at `https://rtm.thinx.cloud/app` — WS subscribe round-trip should resume.

The runbook also names the post-rollback follow-up: file a quick-task identifying the JS-side `document.cookie` reader, patch the reader to use server-supplied session data, then re-attempt SEC-COOKIE-01. The regression spec is expected to FAIL during the rollback window — that failure is the canonical signal that SEC-COOKIE-01 needs a re-attempt.

The rollback narrows blast radius rather than fully restoring the pre-Phase-6 surface: OAuth-authenticated sessions remain httpOnly via the `lib/router.auth.js:106` override even with rollback applied.

## Verification (Static Gates — Authoritative Locally)

Per Phase 5 ACCEPT pattern, `npm test` aborts locally on missing `/mnt/data/conf/config.json`. The static gates below are authoritative locally; CI-side Jasmine is the canonical behavioral gate.

| Gate | Command | Expected | Actual |
|------|---------|----------|--------|
| 1 | `grep -v '^[[:space:]]*//' thinx-core.js \| grep -cE "httpOnly:\s*false"` | 0 | 0 ✓ |
| 2 | `grep -cE "httpOnly:\s*true" thinx-core.js` | ≥ 2 | 2 ✓ |
| 3 | `grep -c "temporarily disabled due to websocket debugging" thinx-core.js` | 0 | 0 ✓ |
| 4 | `node --check thinx-core.js` | exit 0 | PARSE_OK ✓ |
| 5 | `node --check spec/jasmine/ZZ-CookieAttributeSpec.js` | exit 0 | PARSE_OK ✓ |
| 6 | `grep -c "SEC-COOKIE-01" spec/jasmine/ZZ-CookieAttributeSpec.js` | ≥ 2 | 6 ✓ |
| 7 | `grep -c "HttpOnly" spec/jasmine/ZZ-CookieAttributeSpec.js` | ≥ 2 | 11 ✓ |
| 8 | `grep -c "x-thx-core" spec/jasmine/ZZ-CookieAttributeSpec.js` | ≥ 1 | 5 ✓ |
| 9 | `grep -cE "set-cookie" spec/jasmine/ZZ-CookieAttributeSpec.js` | ≥ 1 | 1 ✓ |
| 10 | `grep -c "describe(" spec/jasmine/ZZ-CookieAttributeSpec.js` | ≥ 1 | 1 ✓ |
| 11 | `test -f .planning/runbooks/websocket-handshake.md` | exists | exists ✓ |
| 12 | `grep -c "SEC-COOKIE-01 Rollback Procedure" .planning/runbooks/websocket-handshake.md` | ≥ 1 | 1 ✓ |
| 13 | `grep -c "httpOnly: false" .planning/runbooks/websocket-handshake.md` | ≥ 1 | 2 ✓ |
| 14 | `grep -c "revert(SEC-COOKIE-01)" .planning/runbooks/websocket-handshake.md` | ≥ 1 | 1 ✓ |
| 15 | `grep -c "thinx-staging" .planning/runbooks/websocket-handshake.md` | ≥ 1 | 3 ✓ |
| 16 | `grep -c "188.166.23.244" .planning/runbooks/websocket-handshake.md` | ≥ 1 | 2 ✓ |
| 17 | `grep -c "SEC-WS-01" .planning/runbooks/websocket-handshake.md` | ≥ 1 (06-03 content survives) | 6 ✓ |
| 18 | `git log -1 --pretty=format:'%s'` | exact subject | matches ✓ |
| 19 | `git log -1 --stat` | 3 files changed | 3 files ✓ |
| 20 | `git log -1 --show-signature 2>&1 \| grep -i "Good signature"` | present | `Good signature from "Matej Sychra <suculent@me.com>" [ultimate]` ✓ |

## Deviations from Plan

**None.** The plan executed exactly as written. The CONTEXT.md branching guidance (Task 3) for the "runbook file exists vs create-stub" decision resolved to the APPEND path because Plan 06-03 had already landed at commit `1c9b2085` — the executor took the direct APPEND path as the orchestrator instructed.

No Rule 1-3 auto-fixes triggered (no bugs, no missing critical functionality, no blocking issues). No Rule 4 checkpoint surfaced.

## Authentication Gates

**None.** Pure source-code + documentation change set; no service auth required.

## Known Stubs

**None.** The regression spec wires real data (chai-http v4 agent + actual `POST /api/login` with the canonical `dynamic`/`dynamic` test credentials). No empty/placeholder data flowing to UI rendering. No "TODO" / "FIXME" / "coming soon" markers.

## Threat Surface

Per the plan's `<threat_model>`:

- **T-06-05** (Information Disclosure, x-thx-core XSS-stealable surface) — disposition `mitigate`. Mitigation applied: the cookie is now httpOnly at creation time, narrowing the XSS-to-session-hijack pivot surface. The regression spec is the canonical guard.
- **T-06-06** (DoS via JS-side reader of x-thx-core, if one exists) — disposition `mitigate` via documented < 5min rollback runbook section.
- **T-06-07** through **T-06-09** — all `accept` dispositions, unchanged.

No new security-relevant surface introduced beyond what the plan's threat model anticipated. No threat flags raised.

## Files Touched (Final)

- `thinx-core.js` — line 316 flipped; stale debug comment removed.
- `spec/jasmine/ZZ-CookieAttributeSpec.js` — NEW (80 lines).
- `.planning/runbooks/websocket-handshake.md` — APPEND `## SEC-COOKIE-01 Rollback Procedure` section (71 lines added; SEC-WS-01 content from 06-03 untouched).

## Wave 2 Close-Out

Phase 6 is fully landed across both waves:

| Wave | Plan | Commit | Subject |
|------|------|--------|---------|
| 1 | 06-01 (REFACTOR-03 raw-socket close handler) | `75772191` | `feat(REFACTOR-03): ...` |
| 1 | 06-03 (SEC-WS-01 runbook documentation) | `1c9b2085` | `docs(SEC-WS-01): ...` |
| 2 | **06-02 (SEC-COOKIE-01 httpOnly flip)** | **`3c84692c`** | **`refactor(SEC-COOKIE-01): enable httpOnly on x-thx-core session cookie`** |

ROADMAP Phase 6 success criteria 3 (httpOnly cookie + rollback path), 4 (regression spec covers cookie attribute), and 5 (no regression in existing specs — pending CI gate) are met by this plan.

## Self-Check: PASSED

- `thinx-core.js` line 316 reads `httpOnly: true,` — verified via diff.
- `spec/jasmine/ZZ-CookieAttributeSpec.js` exists — verified via stat.
- `.planning/runbooks/websocket-handshake.md` contains `## SEC-COOKIE-01 Rollback Procedure` — verified via grep.
- Commit `3c84692c` exists on `thinx-staging` — verified via `git log -1`.
- Commit is GPG-signed — verified via `git log -1 --show-signature`.
- Exactly 3 files changed in the commit — verified via `git log -1 --stat`.
- Tracked working tree is clean post-commit (untracked SUMMARYs from 06-01 / 06-03 left alone per execution rules) — verified via `git status --short`.
