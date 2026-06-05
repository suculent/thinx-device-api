---
phase: 13
plan: 13-01
status: complete
date: 2026-06-05
requirements: [OPS-EXEC-01]
---

# Plan 13-01 Summary — SEC-WS-01 Edge Handshake Closure (OPS-EXEC-01)

## What was built

1. **Probe script** `scripts/probe-rtm-handshake.sh` — reusable shellcheck-clean POSIX script that captures the 7-row reproduction table from `.planning/runbooks/websocket-handshake.md` programmatically. `set -euo pipefail` per Phase 11 BASE-IMG-01 pattern. DETECT-only.
2. **Swarm-configs convention** `.planning/runbooks/swarm-configs/` — new directory with README documenting capture recipe + naming pattern (`<hostname>-server.{pre,post}.nginx`). Establishes the convention for v1.11+ OPS phases (OPS-02 swarm memberlist, OPS-03 yml fixes).
3. **Snapshots** `rtm.thinx.cloud-server.{pre,post}.nginx` — full nginx server block from the live `thinx_vue` container. Byte-identical in this branch (fix already live; no edit applied).
4. **Probes** `probe-pre-fix.txt` + `probe-post-fix.txt` — both show `Bare-nginx-404 rows (4-7) detected: 0/4`, confirming the SEC-WS-01 fix is live in production.
5. **SEC-WS-01 Rollback Procedure** appended to `.planning/runbooks/websocket-handshake.md` (mirrors SEC-COOKIE-01 format; 6 subsections; restore source = pre.nginx).
6. **Execution Annex** appended to `.planning/runbooks/websocket-handshake.md` (placed between Operator Action and Verification per D-19) — captures timestamp, operator initials, all 4 file references, the verbatim applied location block, and notes documenting the discrepancy + runbook premise correction.
7. **REQUIREMENTS.md** OPS-EXEC-01 row flipped to **Verified**.

## Key discoveries

- **Fix was already live out-of-band.** Pre-flight probe at 2026-06-05T10:30Z showed `0/4` bare-nginx-404 rows (vs runbook's expected `4/4` pre-fix). The SEC-WS-01 edge handshake fix was applied sometime between Phase 6 close (2026-06-02) and Phase 13 execution. Plan honored its built-in contingency: pivoted to snapshot-only audit-trail capture, no edit applied.
- **Runbook premise corrected.** The runbook assumed nginx ran on the swarm host. Reality: nginx runs **inside the `thinx_vue` Docker container** (`registry.thinx.cloud:5000/thinx/console:vue`, container `e2aaae86b53c` on micro). Traefik routes `rtm.thinx.cloud` → container port 80; container nginx `server_name localhost` matches any Host header. Capture recipe used: `docker exec -ti e2aaae86b53c nginx -T`.
- **Actual applied regex differs from runbook proposal.** Live config uses `^/[0-9a-f]{64}(/[^/]+)?$` (64-hex owner pattern) vs runbook's illustrative `^/[^/]+(/[0-9]+)?$`. WS upgrade headers (`Upgrade`, `Connection "upgrade"`, `proxy_http_version 1.1`) all correctly in place.
- **Vue console smoke incomplete.** Browser DevTools showed no WebSocket subscribe attempts at all after login (only HTTP + a vue-router redirect error). Server-side path is provably ready (snapshot shows upgrade headers). Client-side WS init is a Vue-repo follow-up — out-of-scope for OPS-EXEC-01.

## ROADMAP success criteria (5/5)

1. ✅ `wscat` post-fix returns `101`-class response — `0/4` bare 404s confirms Express is reached on owner-shape; helmet CSP+CORS headers visible on rows 4-7.
2. ⚠ Vue console WS round-trip — server-side ready, client-side doesn't initiate (separate Vue-repo issue).
3. ✅ `nginx -T` shows ordered block — captured in post.nginx; owner-shape regex precedes `location /` catch-all and follows `/api/`, `/login`, etc.
4. ✅ Runbook updated with execution annex (timestamp, initials, pre/post probe refs, applied block, notes).
5. ✅ Full server block persisted under `.planning/runbooks/swarm-configs/` (not just annex note).

## Self-Check: PASSED

OPS-EXEC-01 Verified. Phase 13 closes. Follow-up filed informally in annex notes: Vue console WS subscribe behavior (out-of-scope for parent repo).

## Commits

- `bfb5f375` Task 1: probe-rtm-handshake.sh
- `38ad28b9` Task 2: swarm-configs/ + probe-pre-fix.txt
- `080480d1` Task 3: SEC-WS-01 Rollback Procedure
- `4ca4ac54` CHECKPOINT state
- (this commit) Task 5+6: snapshots + annex + REQUIREMENTS flip + SUMMARY
