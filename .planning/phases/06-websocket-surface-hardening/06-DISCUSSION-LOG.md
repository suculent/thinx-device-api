# Phase 6 Discussion Log

**Date:** 2026-06-02
**Mode:** auto (goal: "complete all phases. Discuss only when needed.")
**Phase:** 6 — WebSocket Surface Hardening

## Areas Discussed

Three gray areas surfaced during codebase scout. Two required user input; the third (REFACTOR-03 close-handler scope) was decided directly from code evidence.

### Area 1: SEC-COOKIE-01 httpOnly approach

**Why surfaced:**
Stale "temporarily disabled due to websocket debugging" comment on `thinx-core.js:316`, but the same file already uses `httpOnly: true` on the separate WS session cookie (line 438), and `router.auth.js:106` upgrades the cookie to httpOnly: true after OAuth login. The comment looks like leftover debugging — re-enabling httpOnly:true is the obvious security improvement.

Three options presented:
- A: Re-enable httpOnly: true at line 316
- B: Document why it must stay false
- C: Try httpOnly: true with documented rollback fallback

**User selected:** C — Try httpOnly: true with fallback path documented.

### Area 2: SEC-WS-01 rtm.thinx.cloud handshake 404

**Why surfaced:**
AGENTS.md documents the live 404 issue on rtm but speculates it's "likely Traefik". The requirement allows either reproducing+code-fixing OR documenting+runbook. Without live reproduction we'd be guessing.

Three options presented:
- A: Runbook only — document Traefik condition
- B: Code-side defensive logging + runbook
- C: Attempt rtm reproduction in this session

**User selected:** C — Reproduce against rtm.

**Reproduction outcome:** 7 curl probes captured at 2026-06-02T21:10–21:11Z proved:
- `/api/v2/users` returns 404 WITH helmet/CORS headers → Express IS reached (404 because GET on POST-only route)
- `/test` and `/suculent` (WS endpoint shape) return bare nginx 404, NO helmet headers → Express NOT reached
- Edge is nginx-fronted (header `server: nginx`), not Traefik as AGENTS.md speculated
- HTTP/1.1-forced fallback gives same result — not protocol-specific

**Root cause confirmed:** rtm.thinx.cloud edge nginx routes `/api/*` to Express but does NOT route `/<owner>` (WS endpoint shape) to the upstream. Fix is operator-side nginx config change, NOT in this repo.

Decision recorded in CONTEXT.md: runbook only (option A's outcome, but now backed by reproducible evidence — much stronger than a speculative document).

### Area 3: REFACTOR-03 close-handler scope (decided from code evidence, no user question)

**Code finding:** A `ws.on('close')` cleanup already exists at `thinx-core.js:597–599` (wss-level). The REAL gap is the RAW socket in the upgrade handler at lines 459–501: `socketMap.set(socketKey, socket)` at line 485 happens BEFORE `wss.handleUpgrade()`. If the upgrade fails mid-flight, the raw-socket entry leaks because the wss-level handler is only attached post-upgrade (line 597).

Decision: Add `socket.on('close')` on the raw socket immediately after line 485. This complements the existing wss-level handler — both together cover the full lifecycle.

No user question needed; this is a direct code-evidence-driven scope refinement of the literal requirement text.

## Areas NOT Discussed (decided by code evidence or already locked)

- **REFACTOR-03 scope:** Set above. The literal "close handler missing" requirement was refined into "raw-socket cleanup gap in the upgrade flow" based on the actual code state.
- **Cookie name (`x-thx-core` vs `x-thx-wscore`):** Already locked in the code — main session uses `x-thx-core`, WS uses `x-thx-wscore`. No change.

## Deferred Ideas Captured

- rtm.thinx.cloud nginx config change (out of repo; operator action)
- Reverse-proxy modernization (consolidate edge under one layer)
- Per-connection socketMap metrics (Prometheus/Influx instrumentation)
- WebSocket sub-protocol formalization

## Notes

Phase 6 produces TWO code commits + ONE runbook artifact:
- `refactor(REFACTOR-03)` — raw-socket close handler addition in upgrade flow
- `refactor(SEC-COOKIE-01)` — flip httpOnly:true at line 316, regression spec, runbook update for the fallback path
- `docs(06)` — `.planning/runbooks/websocket-handshake.md` with SEC-WS-01 reproduction + operator runbook
