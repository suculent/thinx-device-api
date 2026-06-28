# WebSocket Handshake Runbook

Operational runbook for WebSocket-related issues on `rtm.thinx.cloud`. Currently documents SEC-WS-01 (rtm handshake 404 — edge nginx routing gap). Plan 06-02 (SEC-COOKIE-01) appends a rollback section to this file.

---

## Symptom

The Vue console at `https://rtm.thinx.cloud/app` cannot establish a WebSocket connection. Browser DevTools shows the upgrade request to `wss://rtm.thinx.cloud/<owner>` (or `wss://rtm.thinx.cloud/<owner>/<timestamp>`) returning HTTP 404 instead of the expected 101 Switching Protocols.

Console-side debugging confirms the bundle is correct (per `AGENTS.md:44-55` — `services/console/src/gulpfile.js` derives the WS URL from `API_BASEURL`, and local rebuilds verify `wss://rtm.thinx.cloud/<owner>`). The 404 persists after deploying a corrected bundle.

---

## Root Cause

The rtm.thinx.cloud edge nginx config routes `/api/*` to the Express upstream (thinx-device-api) but does NOT have a `location` block matching the WebSocket endpoint shape `/<owner>` and `/<owner>/<timestamp>`. The request never reaches Express, so the Express `this.server.on('upgrade', ...)` handler at `thinx-core.js:459` is never invoked. The 404 is the bare nginx default response.

This is a reproducible edge-routing gap, NOT a bug in this repo's code. AGENTS.md originally guessed "Traefik" as the edge layer, but the response headers (`Server: nginx`, no helmet/CSP) show the actual edge is nginx-fronted.

---

## Reproduction

Captured 2026-06-02T21:10-21:11Z via `curl -sI`. The Express CSP/CORS header presence/absence distinguishes Express-reached vs nginx-only responses.

| Request | Response | Headers | Diagnosis |
|---------|----------|---------|-----------|
| `GET https://rtm.thinx.cloud/` | `HTTP/2 200` | static landing | nginx routes `/` to a static-content path |
| `GET https://rtm.thinx.cloud/api/v2/users` + WS upgrade | `HTTP/2 404` | helmet CORS + `default-src 'none'` + `access-control-allow-origin: https://rtm.thinx.cloud` | Express IS reached (CSP+CORS headers prove it); 404 because the GET verb isn't routed |
| `GET https://rtm.thinx.cloud/api/githook` | `HTTP/2 404` | helmet CORS | Express IS reached; 404 because GET on POST-only route |
| `GET https://rtm.thinx.cloud/test` (no upgrade) | `HTTP/2 404` | `server: nginx`, no helmet | Express NOT reached — bare nginx default 404 |
| `GET https://rtm.thinx.cloud/test` + WS upgrade headers | `HTTP/2 404` | `server: nginx` | Same — edge nginx returns 404 before forwarding |
| `GET https://rtm.thinx.cloud/test` + WS upgrade + HTTP/1.1 forced | `HTTP/1.1 404 Not Found` | `Server: nginx` | Not HTTP/2 specific — protocol fallback yields same edge 404 |
| `GET https://rtm.thinx.cloud/suculent` (real owner) + WS upgrade + Cookie | `HTTP/1.1 404 Not Found` | `Server: nginx` | The actual production WS endpoint shape — edge nginx returns 404 before app sees it |

Key distinction: rows 2-3 show helmet+CORS headers (Express reached); rows 4-7 show only `Server: nginx` with no helmet headers (Express NOT reached).

---

## Operator Action

Tagged: **deferred to edge-redesign** (per SEC-WS-01 requirement option (b), `REQUIREMENTS.md:27`).

The fix lives on the swarm host, NOT in this repo.

1. **SSH to the swarm host** (per `AGENTS.md:18`):

   ```bash
   ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020
   ```

2. **Inspect the current nginx config** (the `rtm.thinx.cloud` server block):

   ```bash
   nginx -T 2>&1 | grep -A 50 "server_name rtm.thinx.cloud"
   ```

   Identify the existing `location` blocks. Confirm that `location /api/` (or `location ~ ^/api/`) exists and that `location /` (or similar) handles the static landing. Confirm there is NO existing `location` block matching the WebSocket-endpoint shape `/<owner>(/<timestamp>)?`.

3. **Add the missing `location` block** for the WebSocket endpoint shape, ORDERED AFTER the more-specific `/api/` and `/static/` blocks but BEFORE the catch-all `location /` block. The block must:
   - Match `/<owner>` and `/<owner>/<timestamp>` (path segments that do not start with `api` or `static`).
   - Proxy to the Express WebSocket upstream (the same upstream the existing `location /api/` block uses).
   - Set the `Upgrade` + `Connection` headers required by the WebSocket handshake.
   - Force `proxy_http_version 1.1` (WebSocket upgrade requires HTTP/1.1).
   - Set the `X-Forwarded-*` headers consistent with the rest of the `rtm.thinx.cloud` server block.

   Illustrative block (operator validates against the current upstream name and surrounding directives via `nginx -T` before committing):

   ```nginx
   location ~ ^/[^/]+(/.*)?$ {
       proxy_pass http://thinx-api-upstream;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "Upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

   The regex MUST be ordered AFTER `/api/` and `/static/` location blocks so the more-specific routes win. If nginx-on-this-host uses named-capture or different upstream-block conventions, adapt accordingly — the upstream name (`thinx-api-upstream`) is illustrative; use the actual upstream that backs `/api/`.

4. **Test the config without applying** (catches typos):

   ```bash
   nginx -t
   ```

   MUST return `nginx: configuration file ... test is successful` before proceeding.

5. **Reload nginx:**

   ```bash
   systemctl reload nginx
   ```

   (Or `nginx -s reload` if the host does not use systemd.)

---

## Execution Annex — SEC-WS-01 (OPS-EXEC-01)

**Executed:** 2026-06-05T10:30:20Z
**Operator:** MS
**Pre-fix probe:** `.planning/phases/13-sec-ws-01-edge-handshake-closure-ops-exec-01/probe-pre-fix.txt`
**Post-fix probe:** `.planning/phases/13-sec-ws-01-edge-handshake-closure-ops-exec-01/probe-post-fix.txt`
**Pre-fix server block:** `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx`
**Post-fix server block:** `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.post.nginx`

### nginx location block actually applied

```nginx
location ~* "^/[0-9a-f]{64}(/[^/]+)?$" {
    resolver 127.0.0.11 valid=1s;
    set $endpoint "api";
    proxy_pass http://$endpoint:7442;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host $server_name;
}
```

### Notes

**Fix already live — discrepancy branch.** Pre-fix probe footer reported `Bare-nginx-404 rows (4-7) detected: 0/4` (vs the runbook's expected pre-fix value of `4/4`). The SEC-WS-01 edge handshake fix was already applied out-of-band sometime between Phase 6 close (2026-06-02) and Phase 13 execution (2026-06-05). The operator session was therefore **snapshot-only** — no nginx edit applied, no `nginx -t`, no `systemctl reload nginx`. `pre.nginx` and `post.nginx` are byte-identical by design.

**Runbook premise correction.** The runbook assumed the nginx serving `rtm.thinx.cloud` ran on the swarm host directly. Reality discovered during operator capture: nginx runs **inside the `thinx_vue` Docker container** (image `registry.thinx.cloud:5000/thinx/console:vue`; container ID `e2aaae86b53c` on micro at capture time). Traefik routes `rtm.thinx.cloud` → container port 80; container nginx has `server_name localhost` which matches any Host header. The owner-shape location regex is `^/[0-9a-f]{64}(/[^/]+)?$` (64-hex owner pattern), not the simpler `^/[^/]+(/[0-9]+)?$` the runbook proposed — but the WS upgrade headers (`Upgrade`, `Connection "upgrade"`) and `proxy_http_version 1.1` are correctly in place, so the handshake path is functional. Capture recipe used: `docker exec -ti e2aaae86b53c nginx -T` (not `nginx -T` on the host).

**Vue console smoke test — partial.** Browser DevTools Network tab on `https://console.thinx.cloud/app` showed **no WebSocket subscribe attempts at all** after login (only HTTP traffic + a vue-router redirect error from `/login` → `/app/dashboard`). The server-side handshake path is provably ready (the snapshot shows the upgrade headers), but the Vue console isn't initiating WS connections from the dashboard route. This is **out-of-scope for SEC-WS-01 / OPS-EXEC-01** (which is exclusively about the server-side edge handshake closure) — file a follow-up against the Vue console repo for client-side WS subscribe diagnosis.

**Rollback procedure remains valid.** The SEC-WS-01 Rollback Procedure section (below) describes how to revert a future SEC-WS-01 swarm-host edit using `rtm.thinx.cloud-server.pre.nginx` as the restore source. In this discrepancy branch the rollback procedure has no current edit to revert — it serves as the safety net for any future re-attempt or remediation.

---

## Verification

Re-run the same `curl -sI` probes from the Reproduction table. The success criterion is that `/suculent` (or any owner-shaped path) is NO LONGER a bare nginx 404. Acceptable post-fix responses:

- **`401 Unauthorized`** — Express reached, app rejected the upgrade (no valid `x-thx-core` session cookie). Response headers include helmet CSP + CORS — same shape as the `/api/v2/users` probe in row 2 of the reproduction table.
- **`101 Switching Protocols`** — Express reached, upgrade succeeded (valid session cookie present). This is the success path the Vue console exercises.

Either response confirms the edge-routing gap is closed. A continued `Server: nginx` 404 means the new `location` block did not match — debug with `nginx -T | grep -B2 -A10 "location"` and confirm the regex.

**Probe recipe** (run from any internet-connected workstation):

```bash
curl -sI \
  -H "Connection: upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Cookie: x-thx-core=test" \
  https://rtm.thinx.cloud/suculent
```

Compare the `Server:` header and the presence/absence of helmet `Content-Security-Policy:` and `Access-Control-Allow-Origin:` headers against the reproduction table.

**Post-fix Vue console smoke:** reload `https://rtm.thinx.cloud/app` in a fresh browser session, log in, open DevTools Network tab, filter on WS, confirm the WS subscribe handshake returns `101 Switching Protocols`.

---

## Reference

- `.planning/phases/06-websocket-surface-hardening/06-CONTEXT.md` — the SEC-WS-01 decision block + the canonical 7-row reproduction table (this runbook's evidence source).
- `.planning/phases/06-websocket-surface-hardening/06-03-PLAN.md` — the plan that produced this runbook.
- `.planning/REQUIREMENTS.md` SEC-WS-01 (line 27) — the requirement, with both option (a) "reproduce+fix here" and option (b) "document+defer-to-edge" paths. CONTEXT.md locks option (b).
- `AGENTS.md` § "Websocket Findings" (lines 44-55) — the original surfacing of the issue + the console-side fix (server-side gap remained).
- `.planning/runbooks/swarm.md` — adjacent runbook covering swarm autoredeploy recovery; this runbook follows the same format.

---

## SEC-COOKIE-01 Rollback Procedure

Operator-side rollback for the `httpOnly: true` flip on the main session cookie `x-thx-core` (per Plan 06-02 / `thinx-core.js:316`). SLA: < 5 min, end-to-end.

### When to roll back

If the Vue console login or WebSocket subscribe regresses on `rtm.thinx.cloud` after the SEC-COOKIE-01 deploy lands, AND the regression grep-traces to JS-side `document.cookie` reads of `x-thx-core`, roll back.

Otherwise the regression is likely the SEC-WS-01 edge-nginx routing gap (see the preceding section) — the rollback below is NOT the correct response for that failure mode. Confirm the SEC-WS-01 edge fix is in place before attributing a console regression to SEC-COOKIE-01.

Diagnosis check before rolling back:

```bash
# A successful login response should now carry HttpOnly on x-thx-core.
curl -sI -c /tmp/thx-cookies.txt -X POST https://rtm.thinx.cloud/api/login \
  -H "Content-Type: application/json" \
  --data '{"username":"...","password":"...","remember":false}' \
| grep -i "set-cookie: x-thx-core"
# Expect the response line to contain `HttpOnly`. If it does AND the console still
# fails on a JS-side cookie read, proceed with rollback.
```

### Rollback steps (< 5 min, operator-side)

1. **SSH to a developer workstation** with the `thinx-device-api` repo checked out (or use the GitHub web UI for a direct file edit on `thinx-staging`).

2. **Edit `thinx-core.js`.** Find the `sessionConfig.cookie` block at approximately line 316. Change:

   ```js
   httpOnly: true,
   ```

   back to:

   ```js
   httpOnly: false,
   ```

   Do NOT re-add the stale `// temporarily disabled due to websocket debugging` comment — keep the line bare. The intent at rollback time is operationally clean, not a re-introduction of the original debt note.

3. **Commit on `thinx-staging`** with the canonical rollback subject template:

   ```
   revert(SEC-COOKIE-01): restore httpOnly: false pending WS investigation
   ```

   Commit body MUST name (a) the observed regression symptom (e.g., "Vue console login succeeds but WS subscribe fails immediately with cookie-undefined console error"), and (b) link to the SEC-COOKIE-01 SUMMARY at `.planning/phases/06-websocket-surface-hardening/06-02-SUMMARY.md` for context.

4. **Push to `thinx-staging`.** CircleCI builds and pushes `thinxcloud/api:latest`; Swarmpit autoredeploy rolls the new image to the swarm host `188.166.23.244` within ~5 minutes (per the canonical autoredeploy SLA in `.planning/runbooks/swarm.md`).

5. **Verify the regression is resolved** by reloading the Vue console at `https://rtm.thinx.cloud/app` in a fresh browser session, logging in, and confirming the WS subscribe round-trip completes (DevTools Network tab, filter on WS, status `101 Switching Protocols`).

### Post-rollback follow-up

File a quick-task or v1.10 candidate documenting why `httpOnly: true` could not stand. Specifically capture:

- The exact JS-side `document.cookie` read that needed `x-thx-core` readable (file, line, call-site).
- Whether the read is in the Vue console bundle (`services/console/src/...`) or in a third-party library bundled into the console.
- A target patch that removes the JS-side dependency on `x-thx-core` (the cookie is for server-side session bookkeeping; the console should not need it on the JS side — that's the SEC-COOKIE-01 invariant).

Update this runbook section with the discovered root cause and the next-attempt plan (e.g., "patch the console at services/console/src/foo.js:N to use the server-supplied session-id from /api/me instead of reading document.cookie, then re-attempt SEC-COOKIE-01").

### Why this matters

The post-OAuth-login override at `lib/router.auth.js:106` (`req.session.cookie.httpOnly = true;`) upgrades the session cookie to httpOnly AFTER the OAuth callback fires. So even with this rollback applied, OAuth-authenticated sessions REMAIN httpOnly — only the local-credentials login flow would re-expose the cookie to JS. The rollback narrows blast radius rather than fully restoring the pre-Phase-6 surface.

The new regression spec at `spec/jasmine/ZZ-CookieAttributeSpec.js` will FAIL on CI after the rollback (it asserts `HttpOnly` is present). That failure is EXPECTED and acceptable during a rollback window — leave the spec in place as the canonical signal that SEC-COOKIE-01 needs a re-attempt. Do NOT delete or skip the spec.

---

## SEC-WS-01 Rollback Procedure

Operator-side rollback for the SEC-WS-01 edge nginx `location` block added on `rtm.thinx.cloud` (per Phase 13 / Plan 13-01 / OPS-EXEC-01). The fix is ADDITIVE — a new `location ~ ^/[^/]+(/[0-9]+)?$` (or owner-shape equivalent) block routes the previously-404'd WebSocket-upgrade path to the Express upstream. Rollback REMOVES that block, returning to the pre-fix surface where the edge nginx returns a bare 404 on owner-shaped paths. SLA: < 5 min, end-to-end.

### When to roll back

Three trigger conditions, in order of likelihood:

1. **`nginx -t` failed AFTER the edit** (config already rejected, reload did not happen). Restore is safety-cleanup, not recovery — but persisting the pre-fix snapshot back into the live config eliminates any partial-edit residue.
2. **`systemctl reload nginx` succeeded but the new `location` block intercepts an unintended route.** Example: a future `/health` endpoint that should not be proxied to Express, or a static-asset path-shape that now misroutes. The owner-shape regex `^/[^/]+(/[0-9]+)?$` is intentionally narrow but neighbor blocks may surface ordering issues.
3. **Vue console regresses on a flow that worked pre-fix.** Unlikely given the additive nature of the change (the route previously returned 404 — nothing relied on that surface), but documented for completeness.

If a console regression appears AFTER both SEC-WS-01 and SEC-COOKIE-01 are deployed and you can't immediately tell which one is at fault, use the diagnosis check below to attribute first, then pick the corresponding rollback section (this one for SEC-WS-01, the preceding section for SEC-COOKIE-01).

### Diagnosis check before rolling back

Re-run the canonical 7-row probe and compare against the captured pre-fix baseline:

```bash
./scripts/probe-rtm-handshake.sh > /tmp/probe-current.txt
diff -u .planning/phases/13-sec-ws-01-edge-handshake-closure-ops-exec-01/probe-pre-fix.txt /tmp/probe-current.txt
```

- **If the failure mode matches the pre-fix table** (bare `Server: nginx` 404 on rows 4-7 with NO helmet `Content-Security-Policy:` header) — the regression IS SEC-WS-01-class. Rollback is appropriate.
- **If the failure mode is different** (e.g., 500 errors WITH helmet headers — Express IS being reached but the app is failing internally) — DO NOT roll back this nginx edit. That is a different incident class; investigate the app layer or other infra surfaces.

This diagnosis check distinguishes "SEC-WS-01 caused this" from an unrelated regression and avoids rolling back a working fix in response to an unrelated symptom.

### Rollback recipe (< 5 min, operator-side)

1. **SSH to the swarm host** (verbatim per `AGENTS.md:18`):

   ```bash
   ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020
   ```

2. **Restore the pre-fix nginx server block from the persisted snapshot.** Locate the `rtm.thinx.cloud` server block in `/etc/nginx/sites-enabled/` (or wherever this swarm host's nginx layout places it — confirm via `nginx -T 2>&1 | grep -B2 'server_name rtm.thinx.cloud'`). Replace the current server block with the contents of `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx` (transferred to the swarm host via `scp` from a developer workstation or `git pull` of the `thinx-device-api` repo's `thinx-staging` branch).

   Per D-14, the restore source is the persisted `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.pre.nginx` snapshot — NOT a manual reconstruction. Manual reconstruction introduces drift; the persisted snapshot is bit-exact what was live before the SEC-WS-01 edit landed.

3. **Test the config without applying** (typo gate — same gate the original edit went through):

   ```bash
   nginx -t
   ```

   MUST return `nginx: configuration file ... test is successful` before proceeding to reload. If non-zero, ABORT — do not reload a broken config.

4. **Reload nginx:**

   ```bash
   systemctl reload nginx
   ```

   (Or `nginx -s reload` if the host does not use systemd.)

### Post-rollback verification

Re-run the probe from the operator workstation and confirm the output now matches the pre-fix baseline:

```bash
./scripts/probe-rtm-handshake.sh > /tmp/probe-post-rollback.txt
diff -u .planning/phases/13-sec-ws-01-edge-handshake-closure-ops-exec-01/probe-pre-fix.txt /tmp/probe-post-rollback.txt
```

The diff should be empty (or only differ in the timestamp banner). Per D-18, the trade-off is explicit: **we are RESTORING the broken state — that is the safety floor.** WebSocket subscribe will be broken again post-rollback (the Vue console handshake returns to a bare nginx 404 on the owner-shape path), BUT the swarm host is in a known-good config state that `nginx -t` accepted and `systemctl reload nginx` applied cleanly.

After confirming the rollback landed, file a quick-task or v1.x candidate documenting (a) which trigger condition prompted the rollback, (b) what neighbor-block interaction or unintended-intercept surfaced, and (c) a target re-attempt plan (typically a narrower regex or an explicit allow-list of owner paths instead of the broad `^/[^/]+(/[0-9]+)?$` shape).

### SLA

< 5 minutes end-to-end (SSH → restore the persisted `pre.nginx` over the live config → `nginx -t` → `systemctl reload nginx` → probe verification). Matches the SEC-COOKIE-01 rollback < 5 min SLA already documented in the preceding section.

### Why this matters

The SEC-WS-01 closure is an ADDITIVE nginx `location` block — it makes a previously-404'd path-shape route to Express. Rollback REMOVES that route, returning to the pre-fix surface. The post-rollback state is functionally equivalent to "Phase 6 SEC-WS-01 closed via runbook authorship; live fix deferred to edge-redesign" — exactly where the codebase was between Phase 6 close (2026-06-02) and the Phase 13 swarm-host edit.

The Phase 12 TEST-WS-01 in-process CI spec (`spec/jasmine/ZZ-WebSocketHandshakeRtmSpec.js`) continues to pass either way — that spec tests the in-process Express WebSocket upgrade handler at `thinx-core.js:466`, not the swarm-host nginx edge routing. The rollback does NOT affect CI signal; CI stays green regardless.

---

*Runbook initialized: 2026-06-02 (Phase 6 / SEC-WS-01 close-out — documentation-only, fix deferred to edge-redesign).*
*SEC-COOKIE-01 rollback section appended: 2026-06-02 (Phase 6 / Plan 06-02 close-out).*
*SEC-WS-01 rollback section appended: 2026-06-04 (Phase 13 / Plan 13-01 prep).*
