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

*Runbook initialized: 2026-06-02 (Phase 6 / SEC-WS-01 close-out — documentation-only, fix deferred to edge-redesign).*
