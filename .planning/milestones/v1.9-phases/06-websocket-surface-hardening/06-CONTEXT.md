# Phase 6 Context: WebSocket Surface Hardening

**Created:** 2026-06-02
**Milestone:** v1.9 — Backend Hygiene & Posture
**Requirements:** REFACTOR-03, SEC-WS-01, SEC-COOKIE-01

## Domain

Make the WebSocket lifecycle deterministic and the handshake surface defensible: close the resource-cleanup gap on raw-socket upgrade failures (REFACTOR-03), document the rtm.thinx.cloud handshake-404 root cause (SEC-WS-01 — now CONFIRMED reproducible as an edge/nginx routing gap), and resolve the `httpOnly: false` session-cookie debt left over from a stale debugging note (SEC-COOKIE-01).

In scope: code changes to `thinx-core.js` (cookie line + raw-socket close handler); a new runbook documenting the rtm handshake-404 edge condition with reproduction evidence; regression specs for the cookie attribute and the close-handler invocation.

Out of scope (deferred): the actual nginx/Traefik edge config change on `rtm.thinx.cloud` — that lives on the swarm host outside this codebase.

## Canonical Refs

Downstream agents (researcher, planner, executor) MUST read these before touching code:

- `.planning/ROADMAP.md` — Phase 6 success criteria (lines 47–57) and dependency on Phase 5
- `.planning/REQUIREMENTS.md` — REFACTOR-03 (line 16), SEC-WS-01 (line 26), SEC-COOKIE-01 (line 24)
- `.planning/PROJECT.md` — compatibility guardrail (no signature breaks on routes the Vue console relies on)
- `.planning/STATE.md` — current milestone state (Phase 5 just completed at commit `b0aef15b`)
- `.planning/phases/05-backend-hygiene-cheap-sweeps/05-CONTEXT.md` — Phase 5 ALSO touched `thinx-core.js` (trust-proxy dedup at line 421); Phase 6 work happens on top of that
- `AGENTS.md` (parent root) — § "Websocket Findings" (lines 44–55) — Vue console fix that left the server-side issue; deploy flow; SSH details to the swarm host
- `.planning/runbooks/` — existing runbooks; Phase 6 will add `websocket-handshake.md`
- `thinx-core.js` lines 310–325 (main session cookie config) — SEC-COOKIE-01 target
- `thinx-core.js` lines 428–445 (WS session cookie config) — already `httpOnly: true`, reference for SEC-COOKIE-01
- `thinx-core.js` lines 459–501 (WS upgrade handler) — REFACTOR-03 target (raw socket lifecycle)
- `thinx-core.js` lines 597–599 (existing `ws.on('close')` cleanup) — already cleans `socketMap` at the wss level
- `lib/router.auth.js` line 106 — `req.session.cookie.httpOnly = true` after OAuth login (proves the system already tolerates httpOnly post-login)

## Code Context

### REFACTOR-03 — WebSocket close handler gap
- **Existing wss-level cleanup (line 597–599):**
  ```js
  ws.on('close', () => {
    socketMap.delete(ws.socketKey);
  });
  ```
- **Gap (real, not the literal-requirement "missing close handler"):** In the upgrade handler at lines 459–501, the RAW socket is added to `socketMap.set(socketKey, socket)` at line 485 BEFORE `wss.handleUpgrade()` is called. If the upgrade fails between lines 485 and 491 (`wss.emit('connection', ...)`), the raw-socket map entry leaks because the wss-level `ws.on('close')` handler is only attached AFTER the upgrade succeeds (line 597, inside `initSocket(ws, ...)`).
- **Symptoms:** Stale `socketMap` entries for failed upgrades — same-`socketKey` duplicate-upgrade detection at line 463 stays "armed" even though there's no live connection. Memory leak grows monotonically.

### SEC-WS-01 — rtm.thinx.cloud handshake 404 (REPRODUCED in this session)
Root cause confirmed. Reproduction evidence captured 2026-06-02T21:10–21:11Z:

| Request | Response | Headers | Diagnosis |
|---------|----------|---------|-----------|
| `GET https://rtm.thinx.cloud/` | `HTTP/2 200` | static landing | nginx routes `/` to a static-content path |
| `GET https://rtm.thinx.cloud/api/v2/users` + WS upgrade | `HTTP/2 404` | helmet CORS + `default-src 'none'` + `access-control-allow-origin: https://rtm.thinx.cloud` | Express IS reached (CSP+CORS headers prove it); 404 because the GET verb isn't routed |
| `GET https://rtm.thinx.cloud/api/githook` | `HTTP/2 404` | helmet CORS | Express IS reached; 404 because GET on POST-only route |
| `GET https://rtm.thinx.cloud/test` (no upgrade) | `HTTP/2 404` | `server: nginx`, no helmet | Express NOT reached — bare nginx default 404 |
| `GET https://rtm.thinx.cloud/test` + WS upgrade headers | `HTTP/2 404` | `server: nginx` | Same — edge nginx returns 404 before forwarding |
| `GET https://rtm.thinx.cloud/test` + WS upgrade + HTTP/1.1 forced | `HTTP/1.1 404 Not Found` | `Server: nginx` | Not HTTP/2 specific — protocol fallback yields same edge 404 |
| `GET https://rtm.thinx.cloud/suculent` (real owner) + WS upgrade + Cookie | `HTTP/1.1 404 Not Found` | `Server: nginx` | The actual production WS endpoint shape — edge nginx returns 404 before app sees it |

**Conclusion:** The rtm.thinx.cloud edge nginx config only forwards `/api/*` paths to the Express upstream. The WebSocket endpoint shape `/<owner>` and `/<owner>/<timestamp>` (per AGENTS.md:52–53) is NOT routed at the edge. The Express app's WS upgrade handler at `thinx-core.js:459` is therefore never reached. **The bug is in the edge nginx config, NOT in this repo's code.**

This is reachable evidence: the absence of helmet/CSP/CORS headers in the `/test` and `/suculent` responses (versus their presence in `/api/v2/users`) proves Express was not reached. AGENTS.md guessed "Traefik" — the actual edge appears to be nginx-fronted (the `server: nginx` header is the giveaway). Either nginx is the only edge, or nginx fronts Traefik. Either way, the routing gap is at the edge.

### SEC-COOKIE-01 — httpOnly stale debugging note
- **Main session cookie (`thinx-core.js:310–323`):** `name: 'x-thx-core'`, `httpOnly: false` with comment "temporarily disabled due to websocket debugging" (line 316). Suspect — likely a leftover from older debugging.
- **Separate WS session cookie (`thinx-core.js:428–445`):** `name: 'x-thx-wscore'`, `httpOnly: true` (line 438). Proves the WS flow does NOT need `x-thx-core` to be readable from JS.
- **Post-OAuth-login override (`lib/router.auth.js:106`):** `req.session.cookie.httpOnly = true` — the OAuth login flow already upgrades the cookie to httpOnly:true post-hoc. So the initial `false` is contradicted by post-login behavior.
- **WS upgrade reads cookies server-side (`thinx-core.js:471` + `:621`):** `request.headers.cookie` — server-side header access, NOT `document.cookie`. So `httpOnly: true` does NOT prevent the WS upgrade from reading the session cookie.
- **Conclusion:** The "temporarily disabled" comment is almost certainly stale. Flipping to `httpOnly: true` is safe — the only flow that would break is one that reads `x-thx-core` from `document.cookie` in JS, and there's no evidence such a flow exists (the Vue console depends on `req.session` server-side, not on JS-side cookie reads).

## Decisions

### REFACTOR-03 — Add raw-socket close handler in the upgrade flow
- **Decision:** Add `socket.on('close', () => { socketMap.delete(socketKey); })` in the upgrade handler at `thinx-core.js:459–501`, immediately after `socketMap.set(socketKey, socket)` at line 485. This guarantees raw-socket map cleanup even when `wss.handleUpgrade()` fails or the client disconnects mid-upgrade.
- **Note:** The existing wss-level `ws.on('close')` at line 597 stays — it handles the post-upgrade lifecycle. Both handlers together cover the full lifecycle (raw socket → upgraded WS → close).
- **Validation:**
  - A new spec asserts the raw-socket close-handler is invoked when the upgrade is aborted mid-flight (simulate by `socket.destroy()` after `socketMap.set` but before `wss.handleUpgrade`).
  - Counter / map-size assertion: `socketMap.size` returns to 0 after a connection aborts.
  - No regression in existing MQTT/WebSocket round-trip specs (`ZZ-AppMessenger*`, `ZZ-MQTT*` — full names TBD in plan-phase).
  - Production smoke (post-merge): Vue console WS subscribe still round-trips on rtm AFTER the edge nginx fix lands.

### SEC-WS-01 — Document the edge-nginx routing gap with reproduction evidence
- **Decision:** Write a runbook at `.planning/runbooks/websocket-handshake.md` documenting the root cause (edge nginx does not route `/<owner>` paths to the Express upstream), the reproduction evidence captured in this session (the 7-row request/response table above), and the operator-side action (add an nginx `location` block matching `/<owner>(/<timestamp>)?` that proxies to the Express WebSocket upstream with `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "Upgrade"`).
- **Why NOT a code-side fix:** The reproduction proves the request never reaches Express. There is nothing to fix in this repo's code for SEC-WS-01 (REFACTOR-03 is a separate, real code gap that needs fixing on its own merits, but that's not the rtm 404 root cause). A code-side change would mask the actual issue and could create false hope.
- **Action items in the runbook:**
  1. **Root cause statement** — edge nginx route gap (with the 7-row reproduction table).
  2. **Operator action** — `nginx -T` on swarm host (`root@188.166.23.244 -p2020`) to confirm current rtm.thinx.cloud config. Add the missing `location ~ ^/[^/]+(/.*)?$` block (or however the route is best expressed without conflicting with `/api/*` / `/static/*`).
  3. **Tag:** "deferred to edge-redesign" per the requirement's option (b) — fix lives on the swarm host, not in this repo.
  4. **Post-fix verification:** re-run the same `curl -sI` probe and confirm `/suculent` now returns either 401 (Express rejection, no auth) or 101 (successful upgrade) — anything but a bare nginx 404.

- **Validation:** A regression spec/runbook entry documents the reproduction recipe. The Vue console handshake post-edge-fix returns `101 Switching Protocols` (per the requirement's success criterion).

### SEC-COOKIE-01 — Flip `httpOnly: true` with documented fallback path
- **Decision:** Change `thinx-core.js:316` to `httpOnly: true` (remove the stale "temporarily disabled due to websocket debugging" comment). Add a regression spec that asserts the `Set-Cookie: x-thx-core=...` response header DOES include `HttpOnly`.
- **Fallback path (if the Vue console WS subscribe regresses on rtm after deploy):** Revert the line back to `httpOnly: false` AND update the runbook to document the operational reason. The plan should include a clear rollback procedure in the SUMMARY.md so the operator can roll back in <5 min if needed.
- **Note:** A pre-deploy smoke from `wscat` + a real Vue session cookie won't help because the edge-nginx gap (SEC-WS-01) blocks all WS traffic to rtm regardless of cookie shape. The cookie change can only be smoke-tested AFTER SEC-WS-01's edge fix lands. So the SEC-COOKIE-01 deploy needs to land in either of two patterns: (a) sequence after the operator's nginx edge fix, OR (b) ship with the fallback-rollback documented in the runbook and accept a brief regression-watch window.
- **Validation:**
  - Regression spec: `Set-Cookie` header on `/api/auth/login` (or wherever the session is established) contains `HttpOnly`.
  - Vue console login + WebSocket subscribe round-trip works against a rtm WHERE the edge nginx routing gap has been fixed.
  - The existing OAuth flow's post-login `req.session.cookie.httpOnly = true` becomes idempotent (no behavior change because the cookie was already httpOnly at creation).

## Coordination

Phase 6 sequences AFTER Phase 5 per ROADMAP.md line 49 — Phase 5's REFACTOR-01 trust-proxy dedup is adjacent to the same `thinx-core.js` block. Phase 5 just landed on `thinx-staging` (8 commits ending `b0aef15b`); Phase 6 work happens on top of that. Phase 6 plans should:
- Read `thinx-core.js` AFTER Phase 5's edits (the line numbers above reflect the post-Phase-5 state).
- Be aware that line numbers shift again after Phase 6 edits (the SEC-COOKIE-01 edit is a one-character flip, but the REFACTOR-03 addition is ~3 lines).

The runbook artifact for SEC-WS-01 is the operator's input for an out-of-repo swarm-side nginx config change. Plan 06-NN-PLAN.md for SEC-WS-01 should produce ONLY the runbook (no code changes for that requirement).

## Deferred Ideas (captured, NOT in scope)

- **rtm.thinx.cloud nginx config change** — the actual fix for the SEC-WS-01 root cause. Lives on the swarm host (`/etc/nginx/...` or wherever the rtm edge config lives). Out of this repo. Operator-side action item from the runbook.
- **Reverse-proxy modernization** — long-term: consolidate edge config under a single layer (Traefik OR nginx, not both) with explicit WS routing. Big architectural item; v2+ candidate.
- **Per-connection metrics for socketMap** — instrument `socketMap.size` as a Prometheus/Influx metric so leaks surface in monitoring. Adjacent to Phase 6 but separable; can be a quick-task or v1.10 candidate.
- **WebSocket sub-protocol** — formalize a sub-protocol (e.g., `Sec-WebSocket-Protocol: thinx-v1`) so non-matching clients are rejected at handshake. Hardening item; deferred until traffic patterns stabilize.

## Open Questions for Researcher / Planner

- For the REFACTOR-03 regression spec: is there an existing Jasmine spec helper for simulating mid-upgrade socket aborts, or does the spec need to spin up a fresh WS server in-process? Planner should choose; the runtime test-environment limitation noted in Phase 5 SUMMARY files (no `/mnt/data/conf/config.json` locally) applies here too — CI is the canonical green-gate.
- For SEC-COOKIE-01: should the plan ship the `httpOnly: true` flip AND the fallback-rollback runbook in one commit, or split? Recommendation: one commit for the flip with the runbook update bundled (the fallback path is documentation, not code). Planner has final say.
- For SEC-WS-01 runbook location: under `.planning/runbooks/` (per Phase 9's note in ROADMAP.md about extending the runbook set), filename `websocket-handshake.md`. Confirm with planner.

## Constraints

- No signature break on any public route the legacy AngularJS / Vue console depends on
- All commits GPG-signed unless an explicit per-session unsigned authorization is granted
- Phase 6 sequences after Phase 5 — Phase 5's `thinx-core.js` edits are already committed; Phase 6 reads/edits the post-Phase-5 state
- The rtm.thinx.cloud edge nginx fix is OUT OF REPO — Phase 6 produces a runbook to drive that operator-side change, not the change itself
- Swarmpit autoredeploy ≤5min SLA still applies (REFACTOR-03 and SEC-COOKIE-01 changes go through the canonical CI + autoredeploy gate)
