# Phase 33: Dashboard Lockdown & TLS Hardening - Research

**Researched:** 2026-10-08
**Domain:** Traefik v3.7.14 edge hardening on Docker Swarm — loopback-only API/dashboard, file-provider TLS options (AEAD-only TLS 1.2 + 1.3), entrypoint-wide HSTS, `exposedByDefault=false`, ACME store hygiene + forced reissue, external scan evidence
**Confidence:** HIGH for every Traefik behaviour claim (read from the v3.7.14 source at tag `3bd7aa32`, the official v3 docs, and falsified this session on a local throwaway `traefik:v3.7.14` — including a local single-node swarm — and read-only against the live edge); HIGH for the live inventory (read over ssh 2026-10-08 17:45–20:00 UTC)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Dashboard / API lockdown (EDGE-API-01/02)
- **D-01:** The public dashboard router is **removed**: delete the `traefik-public-http` /
  `traefik-public-https` routers, the `admin-auth` basic-auth middleware, the `traefik-public`
  service (`loadbalancer.server.port=8080`, vestigial — `api@internal` ignores it) and the
  `error-pages-middleware` reference on the `traefik_traefik` service labels. No Traefik API or
  dashboard is reachable from the internet or from the overlay network afterwards. —
  **Reversibility:** reversible — labels only; the router can be re-added from the P32 `C.post.yml` capture.
- **D-02:** The API stays enabled (`--api`) and is served on a **loopback-bound management
  entrypoint inside the Traefik container** (e.g. `--entrypoints.mgmt.address=127.0.0.1:8080`) with a
  file-provider router on that entrypoint to `api@internal`, **no auth** — the only reachable
  path is `ssh micro` → `docker exec`/`nsenter` into the running Traefik task. Not reachable from the
  overlay, the host network namespace, or the internet. Research confirms (a) Traefik v3 accepts a
  loopback-bound entrypoint address, (b) how to issue HTTP requests inside the task (curl/wget
  availability in the `traefik:v3.7.14` image, or `nsenter -t <pid> -n curl` from the host). An
  unpublished `0.0.0.0:8080` overlay entrypoint was **rejected** (every service on `traefik-public`,
  including the three external stacks, could reach it).
- **D-03:** The **dashboard UI is kept** (`--api.dashboard` default) on that loopback entrypoint;
  the runbook documents an `ssh -L` port-forward into the task's loopback (socat/nsenter on `micro`)
  so a browser can open it. Verification gates use the JSON API (`/api/http/routers`,
  `/api/overview`) through the same path. The P32 D-12 pre-staged credential file is **no longer
  needed** — no auth on the loopback path, nothing to pre-stage.
- **D-04:** `thinx-swarm/traefik.sh` commits a cleartext admin password, the ACME e-mail and
  `DOMAIN` as literals. **Scrub it**: `EMAIL` (still needed) comes from the environment; `DOMAIN`,
  `USERNAME`, `HASHED_PASSWORD`/`PASSWORD` are **removed everywhere** (`traefik.yml` labels + `traefik.sh`)
  because nothing consumes them after D-01. Before removal, compare the committed password against
  the live `admin-auth` apr1 hash on `micro` (`openssl passwd -apr1 -salt …`) and **record MATCH/NO
  MATCH** in the summary (git history keeps the literal; the live middleware disappears with D-01, so
  rotation is moot). Secret hygiene P29 D-12 applies: no hashes/passwords in any committed artefact.
- **D-05:** The real-client-IP problem (swarm ingress NAT → `10.0.0.2`) is **deferred to Phase 34**
  as a recorded item: fix candidates are host-mode port publishing on `micro` (feasible — every
  routed hostname, external stacks included, resolves only to `188.166.23.244`, and the `Traefik`
  node label sits on `micro`) or PROXY protocol. Consequently **no `ipAllowList` and no `rateLimit`**
  middleware is added in this phase (both would key on `10.0.0.2`).
- **D-06:** Success criterion 1 is read as satisfied by "not externally reachable": the external scan
  must show 8080 closed and no public route answering `/dashboard/` or `/api/` on any hostname
  (`micro.thinx.cloud` returns the catch-all/404 path, not 401).

#### Exposure audit & label clean-up (EDGE-API-01 posture)
- **D-07:** `--providers.swarm.exposedbydefault=true` → **`false`** in this phase. Gate: the router
  inventory (via the D-02 API path) is identical before/after — every traefik-labelled service already
  carries `traefik.enable=true` (inventory 2026-10-08: downtime, errorpage, fotostim ×2, igraczech,
  landing, registry, swarmpit_app, syxra, thinx_api/console/couchdb/influxdb/mosquitto/vue, traefik).
  — **Reversibility:** reversible — one `--args` update.
- **D-08:** Label clean-up bundle, all **label-only `docker service update`** (no task restart),
  repo-first (P32 D-04):
  - dead Traefik v1 `traefik.frontend.headers.STSPreload/STSSeconds` on `thinx_console` and `thinx_vue`,
    `traefik.backend.*.noexpose` on transformer/worker (32-REVIEW IN-03 / 31-REVIEW IN-05);
  - `thinx_mosquitto`: delete the rule-less `mosquitto-secure` TCP router labels **and**
    `traefik.enable`/`traefik.swarm.network` (32-REVIEW IN-06); `ports: 1883/8883` untouched;
  - `vault.yml`: `traefik.docker.network` → `traefik.swarm.network` (32-REVIEW IN-02; vault stack file only);
  - `thinx-api-ws` rule: `Host(\`rtm.thinx.cloud\`)` → `Host(\`${THINX_HOSTNAME}\`)` (32-REVIEW IN-05),
    keep `HeaderRegexp(\`Upgrade\`, \`(?i)websocket\`)` and `priority=200`;
  - the vestigial `traefik-public` 8080 service label (part of D-01).
- **D-09:** The **external stacks** (`fotostim_landing-com/-cz`, `igraczech-com_web`, `syxra-cz_web`)
  are treated as part of this edge: their labels are updated live via `docker service update` where
  a decision requires it (they have no committed stack file — every change is recorded in the
  runbook with the exact command and the pre-change label dump). Edge-wide settings (TLS options,
  exposure flip, entrypoint HSTS) apply to them inevitably and their before/after state is in the
  scan evidence.
- **D-10:** Static-command changes are **one stage per concern**, each its own `--args` update (~4 s
  task restart, P31/P32 precedent), each with its own gate and one-command rollback: **Stage A**
  dashboard removal + loopback API entrypoint (+ file provider, see D-13 note) → **Stage B**
  `exposedbydefault=false` → **Stage C** TLS options → **Stage D** HSTS entrypoint middleware.
  Label-only clean-ups (D-08) run between stages. The planner may merge the file-provider flag into
  Stage A if the loopback API router needs it (the API router can only live in the file provider),
  in which case Stage C only changes the file contents (no restart; the file provider hot-reloads).

#### TLS options & ciphers (EDGE-TLS-01)
- **D-13:** TLS options are delivered by **loading the already-mounted file**:
  `--providers.file.filename=/traefik/tls.toml` (TLS options cannot be set via swarm labels). The
  `tls.toml` is rewritten as the **`default`** TLS option so it applies to every TLS router without
  per-router `tls.options` labels. The Phase 32 "16-flag" invariant becomes **18 flags** (file provider
  + D-17 entrypoint middleware) — update every artefact that asserts 16. — **Reversibility:**
  reversible — remove the flag; Traefik falls back to Go defaults.
- **D-14:** Cipher list (TLS 1.2 only; TLS 1.3 suites are fixed by Go): **ECDHE AEAD only** —
  `TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256`, `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`,
  `TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384`, `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384`,
  `TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305`, `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305`. All four CBC
  suites in the current file **and** the two CBC-SHA1 Go defaults disappear. `curvePreferences`
  (X25519, P-256) at researcher's discretion.
- **D-15:** `minVersion = "VersionTLS12"` (ESP8266 BearSSL is TLS 1.2-only; ESP32 mbedTLS gained 1.3 only
  in recent IDF; the HTTPS device path over `app`/`rtm` must keep working). TLS 1.3 remains offered
  and preferred by the server; no `maxVersion`.
- **D-16:** `sniStrict = false` (today's behaviour: no-SNI handshakes get the default cert and fall
  through to the catch-all pages, P32 D-06). Revisit in Phase 34 once the scan shows no no-SNI clients.

#### HSTS (EDGE-TLS-02)
- **D-17:** HSTS reaches every HTTPS host via the **`https` entrypoint default middleware**:
  `--entrypoints.https.http.middlewares=security-headers@swarm`. Every router on `:443`, present and
  future, external stacks included, receives `Strict-Transport-Security`, `nosniff` and
  `X-Frame-Options: DENY`. The existing per-router `security-headers@swarm` refs on `thinx-api-https`
  and `thinx-console-https` are removed as redundant (or kept — planner's call, but the header must
  not be emitted twice). — **Reversibility:** reversible — one `--args` update.
- **D-18:** Research must establish how the `headers` middleware behaves on the `thinx-api-ws` **101
  upgrade** (31/32-REVIEW flagged "security-headers applied to a 101 handshake"). **Pre-agreed
  fallback** if the handshake or console live updates suffer: drop the D-17 flag and **append
  `security-headers@swarm` per router** on every HTTPS router except `thinx-api-ws` (vue, db, influx,
  landing, swarmpit, registry, the three external stacks via D-09).
- **D-19:** Directives stay **`max-age=31536000; includeSubDomains; preload`** (documented max-age:
  one year). `thinx.cloud` is **NOT submitted** to the Chrome preload list — header only (submission is
  effectively irreversible for the whole domain and is a product decision).
- **D-20:** `:80`→`:443` redirect gaps (`thinx-api-http` has `https-redirect` commented out; registry
  http router has no middleware) are **recorded, not fixed** — not required by EDGE-TLS-02. HSTS is
  never sent on the `http` entrypoint.

#### ACME (EDGE-TLS-03)
- **D-21:** E-mail criterion is already met (live `--certificatesresolvers.le.acme.email` = real
  operator address, templated `${EMAIL}`); record the evidence; `EMAIL` keeps coming from the
  environment (D-04 scrub).
- **D-22:** "Renewal verified" = **log evidence + one forced reissue**: cite the 2026-09-29 renewal
  pass (Traefik logs / `acme.json` mtime, cert `notAfter` 2026-12-28) **and** prove the v3 resolver
  end-to-end: snapshot `acme.json` (600 root, `/mnt/data/edge-rollback/…`, out of git), delete the entry
  of **one low-value thinx host that still has a live router** (candidates: `influx.thinx.cloud`,
  `db.thinx.cloud` — NOT `test`/`vvv`, which have no router and would never be re-requested), watch
  Traefik reissue it via TLS-ALPN, confirm the new serial. Rollback = restore the snapshot. —
  **Reversibility:** reversible — snapshot restore.
- **D-23:** `_acme.json` and `__acme.json` (April 2023, 600 root, full private keys) are **copied into
  the 600-root out-of-git snapshot directory on `micro`, then deleted from the live volume**.
- **D-24:** `acme.json` pruning is limited to the **failing external entry** `checkout.qooldata.com`
  (+ SANs `checkout.fotostim.com/.cz`; expired 2025-07-06, `ERR Error renewing ACME certificate … 400`
  at every Traefik start). Snapshot first. Retired thinx names (chronograf, replica, ssl, vvv, test,
  ctf24, micro after D-01) **stay** in the store. If the fotostim stack still carries a router for
  that host, Traefik will re-request and fail again — record that and notify the stack owner
  (32 `deferred-items.md`).
- **D-25:** Challenge type stays TLS-ALPN (`tlschallenge=true`); storage path unchanged.

#### External scan & evidence (criterion 4)
- **D-26:** Scanner = **local `nmap` (`ssl-enum-ciphers`, port sweep incl. 8080) + `sslscan` + `curl -I`**,
  wrapped in a committed rerun script under `scripts/` (no third-party service; nothing logged publicly).
- **D-27:** Host set = **every hostname with a router on this edge**, thinx-owned and external:
  rtm, app, console, thinx.cloud (+www), swarmpit, registry, db, influx, www.fotostim.com/.cz, igraczech.com
  (+www), www.syxra.cz, plus `micro.thinx.cloud` (expected: no dashboard, catch-all). Retired ACME
  names are noted only.
- **D-28:** Pass bar = **requirements literal**: TLS < 1.2 refused and 1.3 offered on every host; the
  D-14 suite set and nothing else on 1.2; HSTS present on every HTTPS host; 8080 closed from outside;
  no public dashboard/API route; ACME email real + `acme.json` 600. (Stricter checks such as
  redirect-on-every-host are reported, not gating.)
- **D-29:** Evidence lives in a **dated, redacted runbook capture**
  `.planning/runbooks/swarm-configs/traefik-edge-scan.<date>.md` (before/after matrix) next to the ACME
  inventory, with the rerun script under `scripts/`; VERIFICATION.md links it.

#### Rollout, gates, documentation
- **D-30:** **Auto-revert triggers per static stage** (P32 D-10 style — executor reverts without
  waiting, then reports): any router not `status==enabled` in the API inventory; any host in the
  HTTPS matrix returning a code different from the pre-stage baseline; the `https://rtm.thinx.cloud/`
  WebSocket upgrade probe not 200; for Stage C additionally an `openssl s_client` handshake failure on
  TLS 1.2 or 1.3 for rtm/app/console. Revert = re-apply the previous `--args` (and, for Stage A, the
  previous labels).
- **D-31:** **One blocking human gate at the end** (P31/P32 precedent): the executor gathers the
  automated evidence — API inventory, HTTPS matrix incl. external hosts, cert serials, `:7442`/`:1883`/
  `:8883` OPEN, device-flow harness PASS over `http://rtm.thinx.cloud:7442` + `mqtt://thinx.cloud:1883`
  and over `https://app.thinx.cloud`, rtm WS probe 200, the D-26 scan — then ONE
  `checkpoint:human-verify` where the operator confirms the console (Devices page, live updates) in a
  browser. No per-stage human pause.
- **D-32:** Documentation lands in **three places**: the runbook (new section in
  `.planning/runbooks/traefik-v3-cutover.md` or a sibling `traefik-edge-hardening.md`: exact
  `ssh` + `docker exec`/`ssh -L` commands for the loopback API/dashboard, the 18-flag command, the
  `tls.toml` contents, the scan script), **`AGENTS.md`** (one pointer line + the new API access form), and
  **`README.md`** of the deploy repo `~/Repositories/thinx-swarm` (operator-facing: how to reach the
  dashboard now). Also update the swarm-configs capture (`D.post.yml` or successor per
  `swarm-configs/README.md`) and the Phase 32 "16-flag" references.

### Claude's Discretion (with this research's resolution)
- Exact loopback entrypoint name/port, the in-task HTTP client mechanics (curl/wget in the image vs
  `nsenter` from the host), and the `ssh -L` recipe — research decides with citations to
  `doc.traefik.io/traefik/` (entrypoints, file provider, API/dashboard).
  → **Resolved (§Q1):** entrypoint **`mgmt`**, address **`127.0.0.1:8080`**; gates via `docker exec <ctr> wget -qO- http://127.0.0.1:8080/api/…` (busybox `wget` is in the image; `curl` is not); browser via laptop `socat` → `ssh` → `docker exec -i <ctr> nc 127.0.0.1 8080` (tested against the live container's `:80`).
- Whether the file-provider flag rides in Stage A (needed for the API router) and Stage C becomes a
  hot-reloaded file edit — see D-10.
  → **Resolved (§Q2/§Q3):** it does **not** ride in Stage A. The API router must live in the **swarm labels of `traefik_traefik`** (the swarm provider drops a `traefik.enable=true` service that has no explicit service port — "port is missing" — and synthesises a phantom `Host(\`traefik-traefik\`)` router on every entrypoint for a service with a port but no routers; falsified on a local swarm, §Q1). The file provider carries **only** the `default` TLS option and is added in **Stage C together with the new config version** — swarm configs are immutable, so Stage C is a config swap + one restart, never a hot reload.
- `curvePreferences`, `alpnProtocols` and whether to add `preferServerCipherSuites` (no-op in
  modern Go) to `tls.toml`.
  → **Resolved (§Q2):** `curvePreferences = ["X25519", "CurveP256"]` **set**; `alpnProtocols` **omitted** (default `h2, http/1.1, acme-tls/1` — setting it without `acme-tls/1` would break TLS-ALPN renewals); `preferServerCipherSuites` **omitted** (Traefik logs "deprecated and ineffective", Go ignores it).
- Whether the redundant per-router `security-headers@swarm` refs are removed or kept under D-17, as
  long as headers are not duplicated.
  → **Resolved (§Q4):** proven idempotent (one `Strict-Transport-Security` even with the middleware twice in the chain). Recommend **removing** the two per-router refs in the post-Stage-D label bundle (clarity), repo-first; keeping them is safe.
- Which low-value routed host is used for the D-22 forced reissue.
  → **Resolved (§Q6):** **`influx.thinx.cloud`** (stats-only backend behind `influx-auth`; CouchDB on `db.thinx.cloud` is the primary datastore and the operator's recovery path).
- Capture naming (`traefik-edge.D.post.yml` vs update) per `swarm-configs/README.md`; order of the
  label-only clean-ups between stages.
  → **Resolved (§Q9):** new step pair **`traefik-edge.E.{pre,post}.yml`** (D is the immutable Phase 32 record); clean-up order in §Q3.

### Deferred Ideas (OUT OF SCOPE)
- **Management VPN on the swarm** (OpenVPN/WireGuard) for operator access — nothing runs today
  (the `:1194` `vpn` entrypoint is vestigial, no service, nothing listening). New capability → backlog /
  own phase.
- **Real client IPs at the edge** — swarm ingress NAT makes every client `10.0.0.2` for Traefik, the
  access log and `thinx_api`'s `X-Forwarded-For`; fix via host-mode publishing on `micro` (all routed
  DNS → `188.166.23.244`) or PROXY protocol; prerequisite for any IP allowlist / rate limit → **Phase 34**.
- **`:80`→`:443` redirect gaps** (`thinx-api-http`, registry http) and an entrypoint-level redirect → Phase 34 / later.
- **`sniStrict=true`** once the scan shows no no-SNI clients → Phase 34.
- **Pruning retired thinx ACME entries** (chronograf, replica, ssl, vvv, test, ctf24, micro) → later cleanup.
- **HSTS preload-list submission** for `thinx.cloud` → product decision, not scheduled.
- Log level, read-only socket-proxy, SLA close-out → Phase 34 (unchanged).
- Vestigial `vpn`/`mqtt`/`mqtts`/`thxp` entrypoints remain annotate-only (P30 D-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDGE-API-01 | Dashboard/API not reachable unauthenticated from outside — 8080 closed externally (or bound internal-only), `--api.insecure` disabled | §Q1 (loopback `mgmt` entrypoint binds `127.0.0.1` only — falsified locally; live 8080 `closed` in the nmap sweep; `--api.insecure` absent in the 16 live Args), §Q5 (`exposedByDefault=false`), §Q7 scan predicates |
| EDGE-API-02 | If kept, the dashboard is served via `api@internal` behind auth; otherwise disabled in production | §Q1: dashboard kept on the loopback-only entrypoint — the "auth" is the `ssh micro` + `docker exec` plane (D-02/D-03); no public router (D-01); `micro.thinx.cloud` falls to the catch-all |
| EDGE-TLS-01 | HTTPS enforces min TLS 1.2 (prefer 1.3) with a modern cipher set | §Q2 `tls.toml` (`default` option, 6 AEAD suites, X25519/P-256), falsified on the local throwaway (TLS 1.1 refused, CBC refused, 1.3 preferred); §Q7 nmap/sslscan predicates |
| EDGE-TLS-02 | HSTS sent on HTTPS responses at the edge (documented max-age) without affecting plaintext device paths | §Q4 entrypoint default middleware; 101 upgrade proven untouched; `:7442` is published by `thinx_api` outside Traefik (unchanged, §Q8 harness) |
| EDGE-TLS-03 | ACME uses a real operator email, `acme.json` is 600, issuance/renewal verified post-migration | §Q6: live email real (yes), `acme.json` `600 root`, 2026-09-29 renewal evidence, forced reissue procedure for `influx.thinx.cloud`, stale `_acme.json`/`__acme.json` handling, `checkout.qooldata.com` prune |
</phase_requirements>

## Summary

The live edge today (read 2026-10-08): `traefik_traefik` runs `traefik:v3.7.14` with **16 Args** (`docker service inspect … .Args` holds only flags, never the binary name — Phase 32's "args=17" was the 17-flag set with the BC switch, not a binary-name artefact), publishes only `:80/:443` (ingress), has `--api` without `--api.insecure`, and serves the dashboard at `Host(\`micro.thinx.cloud\`)` behind `admin-auth` (401). The mounted `tls-config-1` has never been loaded (no `--providers.file`), so TLS runs on Go defaults: TLS 1.2+1.3, five TLS 1.2 suites including two CBC-SHA1 (`ECDHE-RSA-AES128-SHA`, `ECDHE-RSA-AES256-SHA`), X25519MLKEM768 on 1.3. HSTS is present only on rtm/app/console. The ACME email is a real address, `acme.json` is `600 root` with 24 entries, and `_acme.json`/`__acme.json` (April 2023) sit beside it. 8080 and 8443 are `closed` from outside.

Three findings change the plan's shape, all falsified this session rather than assumed. **(1)** The v3 swarm provider **drops** any `traefik.enable=true` service that has no explicit `loadbalancer.server.port` label (`port is missing` → the whole container config, middlewares included, is skipped) and **synthesises** a `Host(\`<service>\`)` default router on *every* entrypoint for a service that has a port but no routers. So after D-01 the `traefik-public` port label is **load-bearing** (it keeps `https-redirect@swarm` / `security-headers@swarm` alive) and the `mgmt` router to `api@internal` must be declared in the **labels of `traefik_traefik`**, not in the file provider — otherwise a phantom `traefik-traefik@swarm` router appears on `http`, `https` and `mgmt`. The file provider therefore carries only TLS options. **(2)** Swarm configs are immutable, so "Stage C hot-reloads the file" is not available: Stage C is `--providers.file.filename` + `--config-rm tls-config-1 --config-add tls-config-2` in one update (one restart). **(3)** The `headers` middleware never touches a `101 Switching Protocols` response (Traefik's `ResponseModifier.WriteHeader` short-circuits 1xx; proven with a real WebSocket backend) and applying it twice yields one header — D-17 is safe, D-18's fallback is not needed. A fourth correction: D-08's `thinx-api-ws` rule must use **`${WEB_HOSTNAME}`** (= `rtm.thinx.cloud`), not `${THINX_HOSTNAME}` (= `app.thinx.cloud`) — the 32-REVIEW IN-05 suggestion would silently move the WS router to the wrong host.

End-state static command: **19 flags** (16 + `--entrypoints.mgmt.address=127.0.0.1:8080` + `--providers.file.filename=/traefik/tls.toml` + `--entrypoints.https.http.middlewares=security-headers@swarm`, with `exposedbydefault` flipped) — D-13's "18" omits the mgmt entrypoint. Stages: A1 args (+mgmt, 17) → A2 labels (router swap, no restart) → B args (flip, 17) → C args+config (+file, 18) → D args (+middleware, 19) → E ACME (snapshot, prune, `--force` restart, reissue `influx.thinx.cloud`).

**Primary recommendation:** Put the `mgmt` router in the `traefik_traefik` labels and keep the `traefik-public` port label; load `tls.toml` (TLS options only) in Stage C with a new `tls-config-2`; promote `security-headers@swarm` to the `https` entrypoint default (D-17) with no fallback; prove renewal on `influx.thinx.cloud` after a 600-root snapshot and a `--force` restart; gate everything on the loopback API via `docker exec … wget`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| API/dashboard reachability (loopback `mgmt` entrypoint, router to `api@internal`) | Edge proxy (Traefik static args + `traefik_traefik` labels) | Operator plane (`ssh micro` → `docker exec`/`nsenter`) | Only Traefik can bind the listener; the swarm provider owns router discovery; the ssh plane is the access control |
| Exposure posture (`exposedByDefault=false`, label clean-ups) | Edge proxy (swarm provider flag) | App stacks (labels on 16 services incl. 3 external) | Discovery policy is a provider setting; opt-in is per-service label |
| TLS version/cipher/curve policy | Edge proxy (file provider `tls.options.default`) | — | TLS options exist only in file/KV providers, never labels; `default` applies to every TLS router |
| HSTS / security headers | Edge proxy (`https` entrypoint default middleware) | App backends (nginx on console already sends STS) | Entrypoint default reaches every present/future router; backend copies are harmless duplicates set by `Set` |
| ACME issuance/renewal, store hygiene | Edge proxy (`le` resolver, `acme.json` in named volume on `micro`) | Host filesystem (`/mnt/data/edge-rollback`, 600 root) | Store is read once at start and rewritten whole on every save — edits need a restart |
| External scan evidence | Operator laptop (`nmap`, `sslscan`, `curl`) | Repo (`scripts/`, `swarm-configs/`) | D-26: no third-party scanner |
| Plaintext device paths `:7442`/`:1883`/`:8883` | `thinx_api` / `thinx_mosquitto` direct publish | — | Outside Traefik by construction (P30 D-02); re-verified by the harness only |

## Project Constraints (from AGENTS.md)

- **Keep 7442 and plain MQTT.** `:7442` plaintext HTTP and `:1883` plain MQTT are required for legacy `__DISABLE_HTTPS__` devices (operator decision 2026-10-04). Nothing here may close, redirect or TLS-enforce them. They are direct-published by `thinx_api`/`thinx_mosquitto`, not Traefik; HSTS is a browser directive on `:443` responses and cannot reach them. Re-verified by the D-31 harness.
- **micro ssh form:** call `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "…"` literally (pre-approved allow rules); swarm path `/mnt/gluster/deployment/swarm`; `docker exec` is node-local and Traefik is pinned to `micro` by `node.labels.Traefik == true` — still query placement.
- **Deploy flow:** app changes go `thinx-staging` → CircleCI → Swarmpit. Edge changes go **only** via `docker service update` (args/labels/configs) — never `docker stack deploy` / `restart.sh` (drops live-only secret mounts, resets auth hashes).
- **CI validation:** push to `thinx-staging` when source changes should be validated — but not while a stage touches `thinx_api` labels (Swarmpit rollout gives `thinx-api-ws` 0 servers mid-probe, P32 Pitfall 7). `docker-swarm.yml` label edits + the regenerated mirror are the CI-visible changes here; `scripts/check-traefik-mirror.js` (CI gate `Traefik mirror staleness (EDGE-RECON-01)`) must print `MIRROR OK`.
- **Builder/image version locks** (chai-http, Ubuntu 22.04 ceiling, mos from source, Temurin, newlib, HTTPS checkout) are untouched.
- **Secrets (P29 D-12):** no hashes, e-mail addresses or keys in any committed artefact; captures redacted on `micro` before being read off the host; the D-04 MATCH/NO MATCH result is a word, never a value.

## Standard Stack

### Core (no new software is installed in this phase)
| Component | Version | Purpose | Provenance |
|---|---|---|---|
| Traefik | `v3.7.14` (Go 1.26.8, Alpine 3.24.2, BusyBox 1.37.0 — `wget` + `nc` present, no `curl`/`socat`/`ss`) | the edge under change | `[VERIFIED: docker run traefik:v3.7.14 version; --entrypoint sh … which]` |
| Docker Engine on `micro` | 29.8.1 (Ubuntu 24.04.5) | `service update --args/--label-*/--config-*`, `exec`, `inspect` | `[VERIFIED: ssh micro 2026-10-08]` |
| `nsenter` (util-linux 2.39.3), `curl`, `wget`, `jq`, `openssl`, OpenBSD `nc`, `python3`, `ss` on `micro`; **no `socat`** | — | in-netns probes, apr1 check, acme.json edits | `[VERIFIED: ssh micro which …]` |
| Laptop: `nmap` 7.94, `sslscan` 2.2.2 (OpenSSL 3.6.3), `openssl`, `socat`, `nc`, `jq`, `curl`, Docker 29.8.2, Node 25.1 | — | D-26 scan, dashboard bridge, local falsification, mirror scripts | `[VERIFIED: which/--version 2026-10-08]` |
| Device-flow harness `/tmp/p31-device-flow/thinx-device-flow.mjs` (3010 B, 2026-10-07) + `~/Repositories/thinx-mcp-device` | — | D-31 device-path proof | `[VERIFIED: ls]` — exists only under `/tmp`; recreate per 31-03-SUMMARY D5 if cleaned |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| mgmt router in `traefik_traefik` labels | file-provider router (D-02 wording) | file router works (proven) but leaves the swarm provider to synthesise a phantom `Host(\`traefik-traefik\`)` router on every entrypoint (proven) — rejected, §Q1 |
| `docker exec <ctr> wget` for gates | `nsenter -t <pid> -n curl` from the host | both proven; `docker exec` needs no PID lookup and no host tool; `nsenter` is the fallback if the image ever loses `wget` |
| laptop `socat` + `ssh` + `docker exec -i nc` bridge for the browser | install `socat` on `micro` + `ssh -L` | the laptop bridge needs nothing installed on `micro`; proven end-to-end against the live container's `:80` |
| `--force` restart for the ACME reissue (Stage E) | piggy-back the acme.json edit on the Stage D restart | one restart fewer, but muddles attribution and the rollback; keep E separate |

**Installation:** none. **Package Legitimacy Audit:** not applicable — no npm/pip/cargo package is installed; the only artefacts are the already-running image and host tools.

## Q1 — Loopback-bound management entrypoint (D-02, D-03)

### Traefik accepts `127.0.0.1:8080` and binds loopback only
- The entrypoint `address` format is `[host]:port[/tcp|/udp]`; the listener is `listenConfig.Listen(ctx, "tcp", config.GetAddress())` — a plain Go `net.Listen` on the literal address. `[CITED: doc.traefik.io/traefik/reference/install-configuration/entrypoints/ — "Define the port, and optionally the hostname, on which to listen"; example address: "192.168.1.2:80"]` `[VERIFIED: pkg/server/server_entrypoint_tcp.go:512-535 buildListener]`
- Falsified locally (`traefik:v3.7.14`, no host ports): `/api/entrypoints` → `{"name":"mgmt","address":"127.0.0.1:8080"}`; inside the container `nc -z 127.0.0.1 8080` → OPEN, `nc -z 172.17.0.2 8080` (the container's own interface) → **CLOSED**. `[VERIFIED: local run 2026-10-08 17:55Z]`
- No `traefik` entrypoint is auto-created unless `api.insecure`, `ping`, `metrics.prometheus` or `rest.insecure` ask for it `[VERIFIED: pkg/config/static/static_config.go:306-322]` — so `--api.insecure` stays absent and nothing else listens on 8080. Name recommendation: **`mgmt`** (not `traefik`, to avoid confusion with the insecure built-in). Port **8080** (conventional; the external sweep already asserts it closed).

### `--api` enables the dashboard by default; `api@internal` needs only `--api`
- `--api` default false; `--api.dashboard` default **true** (`API.SetDefaults(): a.Dashboard = true`), `--api.insecure` default false. `[VERIFIED: traefik --help on the v3.7.14 binary; static_config.go:194-198]` The local run's static config log shows `"api":{"basePath":"/","dashboard":true}` with just `--api`. `[VERIFIED]`
- `api@internal` is served when `m.api != nil`, i.e. when the API is enabled; otherwise `"api is not enabled"`. `[VERIFIED: pkg/server/service/internalhandler.go:60-64]` `[CITED: doc.traefik.io/traefik/reference/install-configuration/api-dashboard/ — "a router attached to the service api@internal"]`
- On the mgmt entrypoint a `PathPrefix(\`/\`)` router is enough: `/` → `302 /dashboard/` → `200` (dashboard HTML), `/api/overview`, `/api/http/routers`, `/api/entrypoints` all answer. `[VERIFIED: local run]`

### Where the mgmt router must live — labels on `traefik_traefik`, NOT the file provider (correction to D-02/D-10)
The swarm provider processes every kept service as: `buildServiceConfiguration` (creates a default `Service` named after the swarm service when none is declared, then `addServer` → `getPort`) and then `BuildRouterConfiguration` (creates a default router with rule `Host(\`{{ normalize .Name }}\`)` when none is declared). `[VERIFIED: pkg/provider/docker/config.go:32-101 build; :110-140 buildServiceConfiguration; pkg/provider/configuration.go:78-121 BuildRouterConfiguration; pkg/provider/docker/shared.go:27 DefaultTemplateRule]` In swarm mode no container ports are known (`NetworkSettings.Ports` is never populated by `parseService`/`parseTasks`), so without an explicit `loadbalancer.server.port` label `addServer` fails with `port is missing` and the **whole container config is skipped** (`continue`). `[VERIFIED: config.go:254,280,313; pswarm.go:226-332]`

Falsified on a local single-node swarm (`docker swarm init`, three throwaway services, probe `traefik:v3.7.14` with `--providers.swarm --providers.swarm.exposedbydefault=false`, torn down afterwards) `[VERIFIED: local swarm run 2026-10-08 18:07Z]`:

| Throwaway labels | Result |
|---|---|
| `traefik.enable=true` + two middlewares, **no** service port, no router | `ERR service "p33-mwonly" error: port is missing` — service skipped, its middlewares **absent** from `/api/http/middlewares` |
| `traefik.enable=true` + middleware + `services.p33-vestigial.loadbalancer.server.port=8080`, no router | phantom router **`p33-mwport@swarm`** `Host(\`p33-mwport\`)` on **`["http","https","mgmt"]`** → service `p33-vestigial` (`http://10.0.1.6:8080`); middleware present |
| same + `routers.p33-mgmt.rule=PathPrefix(\`/\`)`, `.entrypoints=mgmt`, `.service=api@internal` | exactly one router `p33-mgmt@swarm` on `["mgmt"]` → `api@internal`; service `p33-keep` (unused); middleware present; **no phantom** |

Consequences for D-01/D-02:
1. **Keep `traefik.http.services.traefik-public.loadbalancer.server.port=8080`** on `traefik_traefik` — it is not vestigial, it is what keeps `https-redirect@swarm`, `security-headers@swarm` (10 + 2 router references, three of them on external stacks) and the traefik copy of `error-pages-middleware` in the configuration. Removing it (D-01 bullet 3) would take every `http` redirect router and both HSTS routers into `middleware … does not exist` → the D-30 "router not enabled" trigger fires edge-wide. (`api@internal` does ignore the service, as D-01 says; the provider does not.)
2. **Declare the mgmt router in labels** on `traefik_traefik` (three labels, §Code Examples). This replaces `traefik-public-http/https` one-for-one, so no default router is synthesised, and the router count goes 30 → **29**, middlewares 7 → **6** (`admin-auth` gone), services 18 → 18.
3. The file provider is then **not** needed for the API (`--providers.file` moves to Stage C with the TLS file). A file-provider router *also* works (proven locally) — if the planner insists on D-02's letter, add the label router anyway as the synthesis guard; the file router is then a harmless duplicate. Recommendation: labels only.
4. The live label `traefik-public-https.service=api@internal` already proves the swarm provider accepts `api@internal` in labels. `[VERIFIED: live label readback]`

### HTTP client inside the task
- Image `traefik:v3.7.14` = Alpine 3.24.2 + BusyBox 1.37.0: **`wget` and `nc` present; `curl`, `socat`, `ss` absent; `ip` present.** `[VERIFIED: docker run --rm --entrypoint sh traefik:v3.7.14 -c 'which …']` Same on the live task (`docker exec … command -v wget nc curl` → wget only, Alpine). `[VERIFIED: ssh micro 2026-10-08]`
- **Gate recipe (recommended):**
  ```bash
  ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "C=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1); docker exec \$C wget -qO- http://127.0.0.1:8080/api/overview | jq -c '{http: .http, providers: .providers}'"
  # expect (after Stage A2): {"http":{"routers":{"total":29,"warnings":0,"errors":0},"services":{"total":18,…},"middlewares":{"total":6,…}},"providers":["Swarm"]}  (+"File" after Stage C)
  ```
  (`wget -qO-` against `localhost:8080` is the exact idiom the Phase 31/32 probes used inside the throwaway. `[VERIFIED: runbook:269-273; 32-RESEARCH §Q2]`)
- **Host-side fallback:** `nsenter -t $(docker inspect -f '{{.State.Pid}}' $C) -n curl -s http://127.0.0.1:8080/api/overview` — runs the host's curl in the task's network namespace. Proven today against the live task: `nsenter -t <pid> -n ss -ltn` lists the container's listeners (`:80 :443 :1883 :8883 :7442 :1194` — note the vestigial entrypoints DO bind inside the container; only 80/443 are published), and `nsenter -t <pid> -n curl -H 'Host: rtm.thinx.cloud' http://127.0.0.1:80/` → `301`; `…:8080/api/overview` → curl rc 7 (nothing listens yet — the expected pre-Stage-A state). `[VERIFIED: ssh micro 2026-10-08 17:48Z]`

### Browser access to the dashboard (D-03) — laptop bridge, nothing installed on `micro`
`ssh -L` alone cannot reach a container's loopback (sshd connects from the host namespace). Two working forms:
```bash
# (1) recommended: laptop socat -> ssh -> docker exec -i <ctr> nc 127.0.0.1 8080 (busybox nc in the image)
C=$(ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1")
socat TCP-LISTEN:8080,bind=127.0.0.1,reuseaddr,fork EXEC:"ssh root@188.166.23.244 -i $HOME/.ssh/DOKey2 -p2020 docker exec -i $C nc 127.0.0.1 8080"
# then open http://127.0.0.1:8080/dashboard/ in the laptop browser; Ctrl-C the socat to close
# (2) same bridge via the host netns instead of docker exec:
socat TCP-LISTEN:8080,bind=127.0.0.1,reuseaddr,fork EXEC:"ssh root@188.166.23.244 -i $HOME/.ssh/DOKey2 -p2020 nsenter -t $(…pid…) -n nc -q0 127.0.0.1 8080"
```
Form (1) was exercised today against the live container's **`:80`** (harmless): `curl -H 'Host: rtm.thinx.cloud' http://127.0.0.1:18080/` → `301 https://rtm.thinx.cloud/`, a second connection → `200`. `[VERIFIED: 2026-10-08 19:59Z]` One `ssh` per browser connection; add `-o ControlMaster=auto -o ControlPath=~/.ssh/cm-%r@%h:%p -o ControlPersist=60` to the inner ssh to make the dashboard's parallel asset requests fast. `sshd` on `micro` allows TCP forwarding (`allowtcpforwarding yes`, `permitopen any`), so a plain `ssh -L` would also work **if** `socat` were installed on `micro` (it is not) — not needed.

## Q2 — File provider and `tls.toml` (D-13..D-16)

### `filename` vs `directory`, `watch`, swarm-config immutability
- `--providers.file.filename` and `--providers.file.directory` both exist on the binary (`--help`: `--providers.file.filename (Default: "")`, `--providers.file.directory`, `--providers.file.watch (Default: "true")`); they are mutually exclusive; docs recommend `directory` because of the mounted-file watch limitation. `[VERIFIED: traefik --help; pkg/provider/file/file.go:36-45]` `[CITED: doc.traefik.io/traefik/reference/install-configuration/providers/others/file/ — "The filename and directory options are mutually exclusive"; "It is recommended to use directory"; Limitations: mounted/bound files can break fsnotify]`
- With `filename`, Traefik watches the parent directory **and** the file (`watchItems = append(…, filepath.Dir(p.Filename), p.Filename)`). `[VERIFIED: file.go:81-85]` Local run: `add watcher on: /traefik/tls.toml`, no errors. `[VERIFIED]`
- **Watch is moot on swarm:** a Docker config is immutable ("configurations are immutable, so you can't change the file for an existing service … create a new config"); rotation is `docker service update --config-rm <old> --config-add source=<new>,target=<path>` and "the service update command redeploys the service" (= task restart). `[CITED: docs.docker.com/engine/swarm/configs/]` Live: `tls-config-1` (created ~6 months ago) mounted at `/traefik/tls.toml` mode `0444` (292). `[VERIFIED: docker service inspect …Configs; docker config ls]` So D-10's "Stage C only changes the file contents (no restart)" is **not available**; Stage C = new config `tls-config-2` + `--providers.file.filename` in one update, one restart.
- `filename` (locked by D-13) is fine: the only file at that path is the config; `directory=/traefik` would additionally load any future sibling mount. Keep **`--providers.file.filename=/traefik/tls.toml`**.
- One file may hold `[tls.options]` **and** `[http.*]` sections (the dynamic-configuration file format is one document) — proven locally with routers + middleware + TLS options in a single TOML. `[VERIFIED: local run]` Under the recommendation of §Q1 the committed file carries **TLS only**.

### Semantics the file must respect
- `tls.options.default` is special: used by every TLS router that names no option. `[CITED: tls-options page — "When no tls options are specified in a tls router, the default option is used"]` Entry-point `http.tls.options` is not needed (all HTTPS routers carry `tls=true` + `certresolver`, which replaces entrypoint TLS config anyway `[CITED: entrypoints page — "Defining a router tls section … replaces the entrypoint TLS configuration for that router"]`).
- `cipherSuites` names must be keys of Traefik's map, else `invalid CipherSuite: <name>` at build time; all six D-14 names are present verbatim (`TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305` and the `_SHA256` alias both map). `[VERIFIED: pkg/tls/cipher.go:10-40; pkg/tls/tlsmanager.go:500-512]` TLS 1.3 suites are not configurable (Go). `[CITED: tls-options page; pkg.go.dev/crypto/tls Config.CipherSuites]`
- `curvePreferences` accepts `X25519`/`x25519`, `CurveP256`/`secp256r1`, `CurveP384`, `CurveP521`, `X25519MLKEM768`, `SecP256r1MLKEM768`, `SecP384r1MLKEM1024`; unknown → `invalid CurveID in curvePreferences`. `[VERIFIED: pkg/tls/certificate.go:35-50; tlsmanager.go:514-526]` Go ignores the list order and picks by its own preference; setting the list explicitly **removes** the post-quantum hybrids (`X25519MLKEM768` is on the live edge today — sslscan shows `Group X25519MLKEM768` on TLS 1.3). `[CITED: pkg.go.dev/crypto/tls Config.CurvePreferences — "The order of the list is ignored"; "From Go 1.24, the default includes the X25519MLKEM768 hybrid"; "To disable them, set CurvePreferences explicitly"]` `[VERIFIED: sslscan rtm 2026-10-08]`
  → **Decision: `curvePreferences = ["X25519", "CurveP256"]`** per D-14's hint, which trades the PQ hybrid for an explicit, scannable policy (nmap then reports `secp256r1`/`ecdh_x25519`; `-curves P-384` is refused — falsified locally). If the operator prefers to keep X25519MLKEM768, **omit** `curvePreferences` instead (Go default = X25519MLKEM768, X25519, P-256, P-384, P-521 + the secp hybrids); both are D-14-compliant. Record which in the capture.
- `alpnProtocols` default is `["h2", "http/1.1", "acme-tls/1"]` and the TLS-ALPN challenge is dispatched from `clientHello.SupportedProtos` containing `acme-tls/1`. **Do not set it** — a list without `acme-tls/1` would silently break every renewal (D-25). `[VERIFIED: pkg/tls/tlsmanager.go:36,255; challenge_tls.go:124-160]` `[CITED: tls-options page — Default="h2, http/1.1, acme-tls/1"]`
- `preferServerCipherSuites`: Traefik logs `TLSOption "default" uses PreferServerCipherSuites option, but this option is deprecated and ineffective, please remove this option.`; Go: "PreferServerCipherSuites is a legacy field and has no effect … Deprecated". **Omit.** `[VERIFIED: tlsmanager.go:99-102; tls.go:52-53]` `[CITED: pkg.go.dev/crypto/tls]`
- `sniStrict = false` (D-16): today's `sniStrict = true` in the never-loaded file would have rejected no-SNI clients; keep false. `maxVersion` omitted (D-15; docs discourage disabling 1.3).

### Proposed `~/Repositories/thinx-swarm/traefik/tls.toml` (complete, TLS only)
```toml
# Phase 33 (EDGE-TLS-01, D-13..D-16): loaded by --providers.file.filename=/traefik/tls.toml
# as docker config tls-config-${CONFIG} (swarm configs are immutable: bump CONFIG and
# `docker service update --config-rm/--config-add` to change this file; one task restart).
# `default` applies to every TLS router (no per-router tls.options labels needed).
# TLS 1.3 suites are fixed by Go; alpnProtocols is left at its default (h2, http/1.1, acme-tls/1)
# because the TLS-ALPN resolver depends on acme-tls/1; preferServerCipherSuites is deprecated
# and ineffective in Go, so it is omitted.
[tls]
  [tls.options]
    [tls.options.default]
      minVersion = "VersionTLS12"
      sniStrict = false
      curvePreferences = ["X25519", "CurveP256"]
      cipherSuites = [
        "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
        "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
        "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
        "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
        "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305",
        "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305"
      ]
```
Falsified on the local throwaway with exactly this block (plus test routers) `[VERIFIED: 2026-10-08 17:55-17:58Z]`: no config error; `openssl s_client -tls1_1` → `no protocols available`; `-tls1_2` → `ECDHE-RSA-AES128-GCM-SHA256`; `-tls1_3` → `TLS_AES_128_GCM_SHA256`, `Server Temp Key: X25519`; `-tls1_2 -cipher ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES128-SHA` → `handshake failure` (CBC refused); `-curves P-384` → `handshake failure`; nmap `ssl-enum-ciphers` → TLSv1.2 exactly `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`, `…AES_256_GCM_SHA384`, `…CHACHA20_POLY1305_SHA256`, TLSv1.3 the three AKE suites, `least strength: A`.

**Scanner nuance (drives D-28 predicates):** every live certificate is **RSA 4096** (Traefik's resolver default `keyType = RSA4096` `[VERIFIED: pkg/provider/acme/provider.go:74; openssl x509 on rtm/influx/www.fotostim.com]`), so the three `ECDHE_ECDSA_*` suites in the list can never be negotiated or observed by a scanner. The observable TLS 1.2 set is exactly the three `ECDHE_RSA_*` AEAD suites; the ECDSA entries are future-proofing only. The pass predicate must be "observed ⊆ D-14 and == the three RSA AEAD suites", not "== all six".

## Q3 — Flag count, static command per stage, middleware reference syntax

### Reconciling the count
`docker service inspect traefik_traefik --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}' | jq length` → **16** today (`Version.Index 38379738`, image `traefik:v3.7.14`). `.Args` never contains the binary — Phase 32's `args=17` was the 17-flag command *with* `--core.defaultRuleSyntax=v2`, and `args=16` is the Phase 32 end state. `[VERIFIED: ssh micro 2026-10-08 17:45Z; traefik-edge.D.post.yml]`

### End state: 19 flags (D-13's "18" omits the mgmt entrypoint)
```
--providers.swarm
--providers.swarm.constraints=Label(`traefik.constraint-label`, `traefik-public`)
--providers.swarm.exposedbydefault=false                         # Stage B (value flip)
--entrypoints.http.address=:80
--entrypoints.https.address=:443
--entrypoints.https.http.middlewares=security-headers@swarm      # Stage D (new)
--entrypoints.vpn.address=:1194
--entrypoints.mqtt.address=:1883
--entrypoints.mqtts.address=:8883
--entrypoints.thxp.address=:7442
--entrypoints.mgmt.address=127.0.0.1:8080                        # Stage A1 (new)
--certificatesresolvers.le.acme.email=${EMAIL}
--certificatesresolvers.le.acme.storage=/certificates/acme.json
--certificatesresolvers.le.acme.tlschallenge=true
--providers.file.filename=/traefik/tls.toml                      # Stage C (new)
--accesslog
--log
--log.level=ERROR
--api
```
Flag spellings are case-insensitive on the CLI (`exposedbydefault`, `tlschallenge` already live in lowercase); `--help` prints `--entryPoints.<name>.http.middlewares`, `--providers.file.filename`, `--providers.swarm.exposedByDefault`. `[VERIFIED: traefik --help v3.7.14; live Args]` Placement of the new lines inside the committed `command:` block is free (nothing reads Args by index — P32 A5); the executor rebuilds Args from the 600-root `docker service inspect` backup with `jq map(@sh)` exactly as 32-02 Task 2 did. `[VERIFIED: runbook:1026-1118]`

### Per-stage `--args` (count after each)
| Stage | Change | Args | Restart | Also in the same update |
|---|---|---|---|---|
| **A1** | + `--entrypoints.mgmt.address=127.0.0.1:8080` | 17 | yes | — (an unused entrypoint: zero behaviour change; proves the bind via `nsenter … ss -ltn` showing `127.0.0.1:8080`) |
| **A2** | labels on `traefik_traefik`: `--label-rm` ×10 (`admin-auth`, `traefik-public-http` ×3, `traefik-public-https` ×6) + `--label-add` ×3 (`traefik-mgmt` router) in ONE update; **keep** `traefik-public` port label | 17 | **no** (label-only) | — |
| **B** | `exposedbydefault=true` → `false` | 17 | yes | — |
| **C** | + `--providers.file.filename=/traefik/tls.toml` | 18 | yes | `--config-rm tls-config-1 --config-add source=tls-config-2,target=/traefik/tls.toml,mode=0444` (same `docker service update`) |
| **D** | + `--entrypoints.https.http.middlewares=security-headers@swarm` | 19 | yes | — |
| **E** (ACME, §Q6) | none | 19 | `--force` | acme.json edited on the volume immediately before |

Four restarts (A1, B, C, D) + one `--force` (E); each ~15 s fire→Running (32 Stage 2 measured 15 s, of which ~13 s is the old task draining). `:7442/:1883/:8883` are unaffected throughout (direct publish). Revert per stage = the previous Args list (and for A2 the previous labels from the `E.pre.yml` capture / the 600-root inspect backup); for C additionally `--config-rm tls-config-2 --config-add source=tls-config-1,…`.

Why A1 before A2: a label router whose entrypoint does not exist yet is reported as an errored router — it would trip the D-30 "any router not enabled" trigger during the swap. With the entrypoint in place first, A2 is a pure label-only swap; the old dashboard router disappears and `traefik-mgmt@swarm` appears `enabled` in the same provider refresh (≤15 s).

### Entrypoint default middleware syntax
`http.middlewares` on an entrypoint = "Set the list of middlewares that are prepended by default to the list of middlewares of each router"; references must be fully qualified `<name>@<provider>`; the swarm provider namespaces as `@swarm` (the live routers already reference `security-headers@swarm`). `[CITED: entrypoints page]` `[VERIFIED: pkg/config/static/entrypoints.go:99 "Default middlewares for the routers linked to the entry point"; local run /api/entrypoints → `"http":{"middlewares":["sec@file"]}` and router chain `["sec@file","sec@file"]` when also set per router]` So **`--entrypoints.https.http.middlewares=security-headers@swarm`** is the exact flag.

### Label-clean-up ordering (D-08, between stages, all label-only, repo-first)
1. **After A2, before B:** `thinx_mosquitto` — `--label-rm traefik.tcp.routers.mosquitto-secure.entrypoints --label-rm traefik.tcp.services.mosquitto.loadbalancer.server.port --label-rm traefik.enable --label-rm traefik.swarm.network` (one update). Inventory unchanged (the service is pruned by the constraint today: no `traefik.constraint-label`). `[VERIFIED: live labels]`
2. **Before B (required by the "identical inventory" gate):** `downtime_downtime` and `errorpage_errorpage` carry the v2 key **`traefik.docker.network=traefik-public`** live while `downtime.yml:20` / `errorpage.yml:20` commit `traefik.swarm.network` — committed ≠ live (drift not in 32-REVIEW). Fix in ONE update per service: `--label-rm traefik.docker.network --label-add traefik.swarm.network=traefik-public` (never both keys at once — the v3 provider skips a service carrying both, P31 lesson). Both are single-network services, so routing is unaffected either way. `[VERIFIED: ssh micro label readback; thinx-swarm downtime.yml/errorpage.yml]`
3. **Any time (no Traefik effect):** `thinx_console`/`thinx_vue` `--label-rm traefik.frontend.headers.STSPreload --label-rm traefik.frontend.headers.STSSeconds`; `thinx_transformer`/`thinx_worker` `traefik.backend.*.noexpose` are **container** labels (`ContainerSpec.Labels`, from the compose `labels:` key, not `deploy.labels`) `[VERIFIED: docker service inspect … ContainerSpec.Labels]` — `--container-label-rm traefik.backend.transformer.noexpose` is a ContainerSpec change and **does restart those tasks** (acceptable: transformer/worker are not on the edge; or leave to the next image roll). `vault.yml:35` is file-only (no `vault` service is running; `vault.thinx.cloud` serves the default cert). `[VERIFIED: docker service ls --filter name=vault → empty]`
4. **`thinx-api-ws` rule (file-only, no live change):** the live rule is `Host(\`rtm.thinx.cloud\`)`; live `thinx-console-https.rule=Host(\`rtm.thinx.cloud\`)` is committed as `Host(\`${WEB_HOSTNAME}\`)`, while `thinx-api-https` (`${THINX_HOSTNAME}`) resolves to **`app.thinx.cloud`**. The D-08 text (`${THINX_HOSTNAME}`, from 32-REVIEW IN-05) would move the WS router to `app.thinx.cloud` and break `wss://rtm.thinx.cloud` — **use `${WEB_HOSTNAME}`** in `thinx.yml:307` / `docker-swarm.yml:379`. Resolved value unchanged → no `docker service update` needed. `[VERIFIED: live rules readback 2026-10-08]`
5. **After D is verified:** `thinx_api` `--label-add traefik.http.routers.thinx-api-https.middlewares=sslheaders@swarm`, `thinx_console` `--label-rm traefik.http.routers.thinx-console-https.middlewares` (removing the now-redundant `security-headers@swarm` refs; see §Q4 — optional).

## Q4 — HSTS / headers middleware on the WebSocket 101 (D-17, D-18)

### Source
- The headers middleware's secure part wraps the response writer in `middlewares.NewResponseModifier(writer, request, s.secure.ModifyResponseHeaders)`. `[VERIFIED: pkg/middlewares/headers/secure.go:49-52]`
- `ResponseModifier.WriteHeader`: **`if code >= 100 && code <= 199 { r.rw.WriteHeader(code); return }`** — informational responses bypass the modifier entirely; the modifier runs once (`r.modified`) for the final status, and `Hijack()` is passed through to the underlying writer. `[VERIFIED: pkg/middlewares/response_modifier.go:36-70,91-97]`
- The proxy is Go's `httputil.ReverseProxy` (`buildSingleHostProxy`), which for a `101` runs `modifyResponse` then `handleUpgradeResponse` (copy headers, write 101, hijack, bidirectional copy); FastProxy is opt-in (`experimental.fastProxy`, not set). `[VERIFIED: pkg/proxy/httputil/proxy.go:55-66; pkg/config/static/experimental.go:10]`
- `unrolled/secure`'s `ModifyResponseHeaders` uses `Header().Set` (idempotent); custom headers also use `Set`. `[VERIFIED: pkg/middlewares/headers/header.go:71-77]`

### Falsification (local throwaway, real WebSocket backend on the laptop)
Node backend answering `101 Switching Protocols` + `Sec-WebSocket-Accept` + `X-Backend: ws`; Traefik with `--entrypoints.web.http.middlewares=sec@file` (forceSTSHeader, STS 31536000 incl. preload, nosniff, frameDeny, xss) and a second router that **also** lists `sec@file` (chain `["sec@file","sec@file"]`). Raw `GET … Upgrade: websocket` through `nc` inside the container `[VERIFIED: 2026-10-08 18:00Z]`:

| Request | Response | `Strict-Transport-Security` count |
|---|---|---|
| upgrade, entrypoint default only | `HTTP/1.1 101 Switching Protocols`, `Upgrade: websocket`, `Sec-Websocket-Accept: …`, `X-Backend: ws` | **0** |
| upgrade, entrypoint default + per-router (double) | same 101 | **0** |
| plain `GET /double` (double chain) | `200`, STS + `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` | **1** |

So: the 101 handshake is **never modified** (no HSTS on it, nothing to break — the upgrade completes with the backend's own headers), and a doubled middleware yields **one** header. D-17's entrypoint default is safe for `thinx-api-ws`; D-18's fallback is **not needed**. (Browsers receive HSTS from the console's `200` page load anyway.)

### Live baseline for the D-30 probe
- `curl -sI https://rtm.thinx.cloud/` → `HTTP/2 200`, `strict-transport-security: max-age=31536000; includeSubDomains; preload` (from `security-headers@swarm` on `thinx-console-https`; the nginx backend sends the same value — a `Set` overwrite, one header). `[VERIFIED: 2026-10-08 17:50Z]`
- WS probe, `--http1.1`, `Upgrade: websocket`, **with** `Cookie: foo=bar` → `HTTP/1.1 401 Unauthorized` + `X-Forwarded-Proto: https` (API raw reject through `sslheaders@swarm`) — the Phase 32 gate value. **Without** a `Cookie` header → **`HTTP/1.1 101 Switching Protocols`** (`Connection: Upgrade`, `Sec-Websocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`, `Upgrade: websocket`, no STS). `[VERIFIED: curl -D - 2026-10-08 17:50Z]` The `thinx-api-ws` router carries only `sslheaders@swarm` live. `[VERIFIED: label readback]`
- D-30/D-31 say "WS probe 200": as 32-RESEARCH already reconciled, a `200` from the upgrade probe would mean the WS router is NOT matching. State the trigger as: **cookie-less probe → `101` with `Sec-Websocket-Accept`**, cookie probe → `401` + `X-Forwarded-Proto: https`; anything else (incl. 200/404/502) fires. After Stage D the 101 must still carry **no** STS (expected, proven) — record, do not gate on it.

### Decision
**D-17 as written** (`--entrypoints.https.http.middlewares=security-headers@swarm`), no fallback. Remove the two per-router refs afterwards for clarity (optional; idempotent either way). Every HTTPS host then gets STS — including `registry.thinx.cloud` (`400` from the backend, header still set by the outer modifier) and the basic-auth `401`s on db/influx (the entrypoint middleware wraps the router's own chain, so the auth middleware's 401 passes through the modifier).

## Q5 — `exposedByDefault=false` (D-07) and the label inventory

- Flag: `--providers.swarm.exposedByDefault` (struct field `ExposedByDefault`, default `true` set in `pswarm.go:39`); when false, "containers that do not have a traefik.enable=true label are excluded". `[VERIFIED: pkg/provider/docker/shared.go:30; pswarm.go:39; shared_labels.go:43,66]` `[CITED: swarm provider page]` The live flag is spelled `--providers.swarm.exposedbydefault=true` — keep the spelling, flip the value.
- All **16** traefik-labelled services carry `traefik.enable` (`=true`): `downtime_downtime`, `errorpage_errorpage`, `fotostim_landing-com`, `fotostim_landing-cz`, `igraczech-com_web`, `landing_landing`, `registry_registry`, `swarmpit_app`, `syxra-cz_web`, `thinx_api`, `thinx_console`, `thinx_couchdb`, `thinx_influxdb`, `thinx_mosquitto`, `thinx_vue`, `traefik_traefik`. `[VERIFIED: label-key dump 2026-10-08 17:47Z]` Falsified semantics locally with `exposedbydefault=false` + `traefik.enable=true` on the throwaways (discovered). → the flip changes **nothing** in the inventory (29 routers after A2).
- **D-08 live inventory (service → label keys):** `thinx_console`, `thinx_vue`: `traefik.frontend.headers.STSPreload`, `traefik.frontend.headers.STSSeconds`; `thinx_mosquitto`: `traefik.enable`, `traefik.swarm.network`, `traefik.tcp.routers.mosquitto-secure.entrypoints`, `traefik.tcp.services.mosquitto.loadbalancer.server.port` (no `traefik.constraint-label`, no rule); `thinx_transformer`/`thinx_worker`: container labels `traefik.backend.transformer.noexpose` / `traefik.backend.worker.noexpose`; `downtime_downtime`, `errorpage_errorpage`: **`traefik.docker.network`** (v2 key; not in D-08 — see §Q3 item 2); `vault`: no live service. No service carries both `traefik.docker.*` and `traefik.swarm.*`. `[VERIFIED: live readback]`
- Router count today **30**; services 18; middlewares 7 (`admin-auth`, `https-redirect`, `security-headers`, `error-pages-middleware`, `sslheaders`, `couch-auth`, `influx-auth`). `[VERIFIED: D.post.yml 15:12Z + label readback]`

## Q6 — ACME (D-21..D-25)

### Live evidence (2026-10-08)
- `--certificatesresolvers.le.acme.email=` resolves to a **real operator address: yes** (not `example.com`; `grep -c example.com` over the live Args → 0). `[VERIFIED: ssh micro]` — value never written here.
- Volume `/var/lib/docker/volumes/traefik_traefik-public-certificates/_data/`: `acme.json` **301121 B, mtime 1791470908 (2026-10-08 14:48Z, the Stage 2 start-time rewrite), 600 root**; `_acme.json` 177391 B 2023-04-25 600 root; `__acme.json` 202409 B 2023-04-29 600 root. 24 certificates; `influx.thinx.cloud` serial `05B91929242266AC45C0BD14E89A6C4F8247`, notAfter 2026-12-28 05:50:23. `[VERIFIED: stat/jq/openssl]`
- Traefik refuses a store that is not 0600 (`permissions %o … are too open, please use 600`) and writes it with `0o600` — EDGE-TLS-03's "600" is enforced by Traefik itself. `[VERIFIED: pkg/provider/acme/local_store_unix.go:30-33; local_store.go:172]`
- Logs since 48 h: exactly the known `ERR Error renewing ACME certificate: {checkout.qooldata.com [checkout.fotostim.com checkout.fotostim.cz]} … 400 … connection :: 217.11.249.139` at 14:48:34Z (start-time renewal pass). `checkout.qooldata.com` resolves to `217.11.249.139` — not this edge — so it can never validate. No fotostim router names it (rules are `www.fotostim.com || fotostim.com`, `www.fotostim.cz || fotostim.cz`), so after pruning it is **not** re-requested. `[VERIFIED: service logs; dig; rule readback]`
- Renewal evidence for D-22: all thinx certs show `notAfter 2026-12-28 05:49-05:51` = issued **2026-09-29 ~05:50Z** (90-day LE certs) — the renewal pass worked on the v2.11 edge; renewal timing is `renewPeriod 30 d, interval 24 h` for 90-day certs, checked at start and every 24 h. `[VERIFIED: acme inventory; provider.go:254-266,801-812]` `[CITED: acme page — "starts renewing them 30 days before their expiry"]`

### How the store behaves (drives the procedure)
- `LocalStore.get()` reads the file **once** (`if s.storedData == nil`) and keeps it in memory; every `SaveCertificates` writes the **whole** in-memory copy back with 0600. `[VERIFIED: local_store.go:91-150,80-90,151-178]` Therefore: Traefik does **not** notice an on-disk edit while running, and the next save (any issuance/renewal) overwrites the edit. An edit only takes effect after a **restart**, and must be followed by one promptly.
- On start, `Init()` loads account + certificates; `Provide()` runs `renewCertificates` immediately (and every 24 h) over **every stored cert, routers or not** (why vvv/test/chronograf keep renewing and why `checkout.qooldata.com` errors at every start), and `watchNewDomains` resolves a certificate for every router with `tls.certresolver=le` whose domain set is not in the store (`certExists`/`getUncheckedDomains`). `[VERIFIED: provider.go:171-266,479-600,905-966,1071-1085]`
- Dynamic-config domains of a router missing from the store get the **default certificate until the cert arrives** (TLS-ALPN typically 5–20 s). `[CITED: acme page]`

### Host choice for the forced reissue: `influx.thinx.cloud`
Both candidates have an `https` router with `tls.certresolver=le` and a single-name cert. `db.thinx.cloud` fronts CouchDB — the primary datastore and the operator's recovery/replication endpoint; `influx.thinx.cloud` fronts stats only (`influx-auth`, 401 to anonymous). Pick **influx**. `[VERIFIED: live rules; thinx.yml:486-494]`

### Procedure (Stage E, after Stage D is green) — stop nothing, one `--force` restart
```bash
# 1. snapshot (600 root, out of git) — acme.json + the two stale files
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "umask 077; S=/mnt/data/edge-rollback/traefik-p33-acme-\$(date -u +%Y%m%dT%H%M%SZ); mkdir -p \$S; V=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data; cp -p \$V/acme.json \$V/_acme.json \$V/__acme.json \$S/; chmod 700 \$S; chmod 600 \$S/*; ls -la \$S; echo SNAP=\$S"
# expect: three files, 600 root, dir 700; sizes 301121 / 177391 / 202409
# 2. D-23: delete the stale 2023 files from the live volume (Traefik never reads them)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "V=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data; rm -f \$V/_acme.json \$V/__acme.json; ls \$V"
# expect: acme.json only
# 3. D-24 + D-22: prune two entries into a temp copy, validate, swap atomically, restart immediately
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "umask 077; V=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data; jq 'del(.le.Certificates[] | select(.domain.main == \"checkout.qooldata.com\" or .domain.main == \"influx.thinx.cloud\"))' \$V/acme.json > \$V/acme.json.new && jq -e '.le.Certificates | length == 22' \$V/acme.json.new >/dev/null && jq -r '.le.Certificates[].domain.main' \$V/acme.json.new | grep -c -E '^(checkout.qooldata.com|influx.thinx.cloud)$'; chmod 600 \$V/acme.json.new && mv \$V/acme.json.new \$V/acme.json && stat -c '%s %a %U' \$V/acme.json && docker service update --detach --force traefik_traefik"
# expect: 0 (no pruned names left); <size> 600 root; rc 0; new task Running in ~15 s
# 4. watch the reissue (default cert first, LE cert within ~60 s)
for i in $(seq 1 12); do echo | openssl s_client -connect influx.thinx.cloud:443 -servername influx.thinx.cloud 2>/dev/null | openssl x509 -noout -serial -issuer -enddate; sleep 10; done
# expect: serial != 05B91929242266AC45C0BD14E89A6C4F8247, issuer Let's Encrypt, notAfter ≈ today + 90 d
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "V=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data; jq '.le.Certificates | length' \$V/acme.json; jq -r '.le.Certificates[].domain.main' \$V/acme.json | grep -c influx; stat -c '%s %a %U' \$V/acme.json; docker service logs traefik_traefik --since 5m 2>&1 | grep -ci 'Error renewing ACME'"
# expect: 23 ; 1 ; <size> 600 root ; 0  (the checkout.qooldata.com error is gone for good)
```
`--log.level=ERROR` hides the `Trying to challenge certificate for domain [influx.thinx.cloud]` DEBUG line — the proof is the new serial plus the store count (24 − 2 + 1 = 23). Keep the jq-edit-to-restart gap to seconds (a renewal save in between would overwrite the edit; none is due — nothing expires before 2026-11-22 and the only failing renewal never saves).

**Rollback:** `cp -p $SNAP/acme.json $V/acme.json && chmod 600 $V/acme.json && docker service update --detach --force traefik_traefik` (the old influx cert/key return; the LE duplicate-certificate limit is 5/week per name set — one extra issuance is far inside it). Restore `_acme.json`/`__acme.json` from `$SNAP` only if someone proves a consumer (none known; `services/traefik/update.sh` reads `acme.json` only `[VERIFIED: update.sh:44]`).

## Q7 — External scan (D-26..D-29)

- Tools: laptop `nmap 7.94`, `sslscan 2.2.2`, `curl`, `openssl 3.6.3`, `nc` — all present. `[VERIFIED: which]` Every D-27 host (and `www.thinx.cloud`, `fotostim.com`, `fotostim.cz`) resolves to **`188.166.23.244`** only; `igraczech.unitednewschannel.net` does not resolve (pre-existing); `checkout.qooldata.com` → `217.11.249.139` (not ours). `[VERIFIED: dig 2026-10-08]`
- **Baseline today:** port sweep `nmap -Pn -p 80,443,8080,8443 188.166.23.244` → `80 open, 443 open, 8080 closed, 8443 closed`; `http://188.166.23.244:8080/` → connection refused; `https://micro.thinx.cloud/dashboard/` and `/api/overview` → **401**; nmap `ssl-enum-ciphers` on rtm: TLSv1.2 `AES_128_CBC_SHA`, `AES_128_GCM_SHA256`, `AES_256_CBC_SHA`, `AES_256_GCM_SHA384`, `CHACHA20_POLY1305_SHA256` (all `ECDHE_RSA`), TLSv1.3 three AKE suites, warning "Key exchange (secp256r1) of lower strength than certificate key"; sslscan: SSLv2/3, TLS 1.0/1.1 disabled, 1.3 preferred with `X25519MLKEM768`, two CBC-SHA1 suites accepted; HSTS on rtm/app/console only; registry 400, db/influx/micro 401, others 200. `[VERIFIED: 2026-10-08]`
- **Rerun script:** `scripts/traefik-edge-scan.sh` (bash; `HOSTS=` list = D-27; `EDGE_IP=188.166.23.244`; writes a Markdown matrix to stdout; no secrets, no third-party calls). Capture: `.planning/runbooks/swarm-configs/traefik-edge-scan.<YYYY-MM-DD>.md` with a `before` (pre-Stage-A1) and `after` (post-Stage-E) section. Keep it self-contained so VERIFICATION.md can link one file.

### Command set and pass predicates (planner → `<automated>` / `<fails_when>`)
| Check (per host H unless noted) | Command | Pass predicate |
|---|---|---|
| 8080/8443 closed (once, per IP) | `nmap -Pn -p 80,443,8080,8443 188.166.23.244 \| grep -E '^(8080\|8443)/tcp'` | neither line contains `open` (both `closed` or `filtered`) |
| no public dashboard/API | `curl -s -o /dev/null -w '%{http_code}' https://micro.thinx.cloud/dashboard/` and `curl -s https://micro.thinx.cloud/api/overview \| jq -e .http` | code != `401` and != `200`-with-JSON (today 401); the `jq -e` exits non-zero (HTML catch-all, not Traefik JSON); repeat for every H in the set (`/api/overview` must never be JSON) |
| TLS < 1.2 refused | `nmap -Pn --script ssl-enum-ciphers -p 443 H` | output has **no** `SSLv3:`, `TLSv1.0:`, `TLSv1.1:` headings; and `sslscan --no-colour H \| grep -E '^TLSv1\.[01] '` → both `disabled` |
| TLS 1.3 offered | same nmap | a `TLSv1.3:` section with ≥1 `TLS_AKE_` line; `sslscan` shows `Preferred TLSv1.3` |
| D-14 suite set on 1.2 | `nmap … \| sed -n '/TLSv1.2:/,/TLSv1.3:/p' \| grep -oE 'TLS_[A-Z0-9_]+'` | sorted set **== {`TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`, `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384`, `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256`}** (RSA certs; nmap names ChaCha with the `_SHA256` suffix); any `_CBC_` line fails; `least strength: A` |
| HSTS on every HTTPS host | `curl -sSI -m 15 https://H/ \| grep -i '^strict-transport-security:'` | exactly one line, value `max-age=31536000; includeSubDomains; preload` (case-insensitive compare); hosts answering 400/401 count too |
| handshake sanity (D-30 Stage C trigger) | `echo \| openssl s_client -connect H:443 -servername H -tls1_2` and `-tls1_3` | both print `Verify return code: 0` and `Protocol : TLSv1.2`/`TLSv1.3`; `-tls1_1` prints `no protocols available` or an alert |
| cert validity | `echo \| openssl s_client … \| openssl x509 -noout -serial -checkend 0` | `Certificate will not expire`; influx serial changed after Stage E, all others unchanged |
| `:7442` untouched (reported) | `nc -z -w5 rtm.thinx.cloud 7442 && curl -s -o /dev/null -w '%{http_code}' http://rtm.thinx.cloud:7442/` | port open, same HTTP code as the before-capture |
| redirect posture (reported, not gating — D-20) | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://H/` | record only (`app` 200 and `registry` http are the known gaps) |
| no-SNI behaviour (reported — D-16) | `echo \| openssl s_client -connect 188.166.23.244:443 -noservername 2>/dev/null \| openssl x509 -noout -subject` | record the subject (default cert today) |

Run from the laptop only (micro sees `10.0.0.2` for everything and is inside the edge).

## Q8 — Verify-signal inventory (literal commands + `# expect:`)

`C` below is always `$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1)` on micro; the loopback API path replaces the Phase 32 `admin-auth` curl from **Stage A2 onwards**. Before A2 (baseline), read the inventory through the still-present public router with the P32 credential method, or simply from `docker service inspect` labels — the baseline needs router *names* and *status*, which the pre-A2 public API still gives (the P32 D-12 credential file was deleted; the operator re-stages it only if a credentialed baseline is wanted; otherwise take the 30-router list from `D.post.yml`, verified 15:12Z, as the baseline).

| Signal | Command | `# expect:` |
|---|---|---|
| Static args + index | `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service inspect traefik_traefik --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} args={{len .Spec.TaskTemplate.ContainerSpec.Args}} idx={{.Version.Index}} upd={{.UpdateStatus.State}}'"` | before: `traefik:v3.7.14 args=16 idx=38379738 upd=completed`; A1 17, B 17, C 18, D 19 (new idx each) |
| Specific flags present/absent | `ssh … "docker service inspect traefik_traefik --format '{{range .Spec.TaskTemplate.ContainerSpec.Args}}{{println .}}{{end}}' \| grep -c -E 'api.insecure\|providers.docker'"` and `… \| grep -E 'mgmt.address\|file.filename\|https.http.middlewares\|exposedbydefault'` | `0`; the expected lines per stage |
| mgmt bind inside the task (A1) | `ssh … "P=\$(docker inspect -f '{{.State.Pid}}' \$C); nsenter -t \$P -n ss -ltn \| grep 8080"` | exactly `LISTEN … 127.0.0.1:8080` (no `*:8080`) |
| mgmt router + API reachable (A2+) | `ssh … "docker exec \$C wget -qO- http://127.0.0.1:8080/api/http/routers \| jq -r '.[] \| select(.status!=\"enabled\") \| .name + \"  \" + .status + \"  \" + (.error\|tostring)'"` | prints **nothing** |
| Router inventory (names) | `ssh … "docker exec \$C wget -qO- http://127.0.0.1:8080/api/http/routers \| jq -r '.[].name' \| sort"` | after A2: 29 names = the 30 of `D.post.yml` − `traefik-public-http@swarm` − `traefik-public-https@swarm` + `traefik-mgmt@swarm`; **identical** across B, C, D, E; no `traefik-traefik@swarm` |
| Overview counts | `ssh … "docker exec \$C wget -qO- http://127.0.0.1:8080/api/overview \| jq -c '{r:.http.routers,s:.http.services,m:.http.middlewares,p:.providers}'"` | A2+: routers 29/0 err, services 18, middlewares 6; providers `["Swarm"]` until C, then `["Swarm","File"]` |
| mgmt router shape | `ssh … "docker exec \$C wget -qO- http://127.0.0.1:8080/api/http/routers/traefik-mgmt@swarm \| jq -c '{status,entryPoints,service,rule}'"` | `{"status":"enabled","entryPoints":["mgmt"],"service":"api@internal","rule":"PathPrefix(\`/\`)"}` |
| Dashboard on loopback | `ssh … "docker exec \$C wget -S -qO /dev/null http://127.0.0.1:8080/ 2>&1 \| grep -E 'HTTP/\|Location'; docker exec \$C wget -qO- http://127.0.0.1:8080/dashboard/ \| grep -c APIUrl"` | `302 Found` + `Location: /dashboard/`; `1` |
| Not reachable from the overlay | `ssh … "docker run --rm --network traefik-public alpine:3.20 sh -c 'nc -z -w2 traefik 8080 && echo OPEN \|\| echo CLOSED'"` (service alias `traefik` on `traefik-public`) | `CLOSED` |
| Not reachable from the host / internet | `ssh … "curl -s -o /dev/null -m 3 http://127.0.0.1:8080/api/overview; echo rc=\$?"`; laptop `curl -s -o /dev/null -m 5 http://188.166.23.244:8080/; echo rc=$?` | `rc=7` both |
| Public dashboard gone (A2+) | `curl -s -o /dev/null -w '%{http_code}\n' https://micro.thinx.cloud/dashboard/; curl -s https://micro.thinx.cloud/api/overview \| jq -e .http >/dev/null; echo jq=$?` | not `401`; `jq=1`-or-higher (today: 401 / 0) |
| Labels on traefik_traefik (A2) | `ssh … "docker service inspect traefik_traefik --format '{{range \$k,\$v := .Spec.Labels}}{{\$k}}{{println}}{{end}}' \| grep -E 'routers\|admin-auth\|services\.'"` | exactly `traefik.http.routers.traefik-mgmt.{entrypoints,rule,service}` + `traefik.http.services.traefik-public.loadbalancer.server.port`; no `traefik-public-http/https`, no `admin-auth` |
| Label-only = no task restart | `ssh … "docker service ps traefik_traefik --filter desired-state=running --format '{{.ID}} {{.CurrentState}}'"` before/after A2 and each D-08 update | same task id |
| Config mounted (C) | `ssh … "docker service inspect traefik_traefik --format '{{json .Spec.TaskTemplate.ContainerSpec.Configs}}' \| jq -c '.[] \| {n:.ConfigName,t:.File.Name,m:.File.Mode}'; docker exec \$C sha256sum /traefik/tls.toml"` | `{"n":"tls-config-2","t":"/traefik/tls.toml","m":292}`; sha256 == committed `traefik/tls.toml` |
| TLS options applied (C) | `for H in rtm.thinx.cloud app.thinx.cloud console.thinx.cloud; do echo \| openssl s_client -connect $H:443 -servername $H -tls1_2 -cipher ECDHE-RSA-AES128-SHA 2>&1 \| grep -c 'handshake failure'; done` | `1` ×3 (CBC refused); plus the §Q7 nmap set and the `-tls1_2`/`-tls1_3` success lines (D-30 Stage C trigger: any handshake failure on 1.2 or 1.3 for rtm/app/console) |
| Log scan after each restart | `ssh … "docker service logs traefik_traefik --since 3m 2>&1 \| grep -ci 'invalid CipherSuite\|invalid CurveID\|does not exist\|error while parsing\|port is missing'"` | `0` (the 13 transient `does not exist` lines on the *stopping* task seen in 32 Stage 2 are from the old task — filter by task id if they reappear) |
| HSTS matrix (D) | `for H in rtm.thinx.cloud app.thinx.cloud console.thinx.cloud thinx.cloud www.thinx.cloud swarmpit.thinx.cloud registry.thinx.cloud db.thinx.cloud influx.thinx.cloud www.fotostim.com www.fotostim.cz fotostim.com fotostim.cz igraczech.com www.igraczech.com www.syxra.cz micro.thinx.cloud; do printf '%-24s ' $H; curl -sSI -m 15 https://$H/ 2>/dev/null \| grep -ic '^strict-transport-security: max-age=31536000; includesubdomains; preload'; done` | `1` on every line (before D: 1 only on rtm/app/console) |
| HTTPS code matrix (D-30 trigger) | `for H in …same list…; do curl -sS -o /dev/null -m 15 -w "$H %{http_code}\n" https://$H/; done` | identical to the pre-stage baseline (today: rtm/app/console/thinx.cloud/www/swarmpit/fotostim ×4/igraczech ×2/syxra `200`, registry `400`, db/influx `401`, micro `401` → after A2 micro becomes the catch-all code — re-baseline after A2) |
| WS probe (D-30 trigger, both forms) | `K=dGhlIHNhbXBsZSBub25jZQ==; curl -s --http1.1 -D - -o /dev/null -m 10 -H 'Connection: upgrade' -H 'Upgrade: websocket' -H "Sec-WebSocket-Key: $K" -H 'Sec-WebSocket-Version: 13' https://rtm.thinx.cloud/ \| head -1; curl … -H 'Cookie: foo=bar' https://rtm.thinx.cloud/p33probe \| head -1` | `HTTP/1.1 101 Switching Protocols`; `HTTP/1.1 401 Unauthorized` (+ `X-Forwarded-Proto: https`); after D the 101 still has no STS line |
| Bare-IP catch-alls alive | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -m 15 http://188.166.23.244/; curl -sk -o /dev/null -w '%{http_code}\n' -m 15 https://188.166.23.244/` | `301 https://188.166.23.244/` ; `200` |
| Ports open (micro) + publishers | `ssh … "for p in 7442 1883 8883; do timeout 3 bash -c \"</dev/tcp/127.0.0.1/\$p\" && echo \$p OPEN \|\| echo \$p CLOSED; done; docker service inspect thinx_api traefik_traefik --format '{{.Spec.Name}} {{range .Endpoint.Ports}}{{.PublishedPort}}->{{.TargetPort}} {{end}}'"` | `7442 OPEN 1883 OPEN 8883 OPEN`; `thinx_api 7442->7442`; `traefik_traefik 80->80 443->443` |
| Device-flow harness (D-31) | `cd ~/Repositories/thinx-mcp-device && THINX_AUTO_UPDATE=false node /tmp/p31-device-flow/thinx-device-flow.mjs p33-7442 http://rtm.thinx.cloud 7442 thinx.cloud 1883` and `THINX_AUTO_UPDATE=false node /tmp/p31-device-flow/thinx-device-flow.mjs p33-https https://app.thinx.cloud` | `PASS` each (register → status → OTT 200 → firmware md5Match → MQTT connect + ACL → publish → recent → disconnect) `[VERIFIED: harness args /tmp/p31-device-flow/thinx-device-flow.mjs:7-11; 32-03 invocation]` |
| ACME (E) | §Q6 commands | 23 entries, influx serial new, 0 `Error renewing`, `acme.json` 600 root, `_acme.json`/`__acme.json` absent |
| D-04 hash compare (**before A2**) | `grep -E '^export HASHED_PASSWORD=' ~/Repositories/thinx-swarm/traefik.sh \| tail -1 \| cut -d= -f2- \| tr -d "'\"" \| ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'read -r H; L=$(docker service inspect traefik_traefik --format "{{index .Spec.Labels \"traefik.http.middlewares.admin-auth.basicauth.users\"}}"); [ "$H" = "${L#*:}" ] && echo HASH-LITERAL=MATCH \|\| echo HASH-LITERAL=NO-MATCH'` and `grep -E '^export PASSWORD=' ~/Repositories/thinx-swarm/traefik.sh \| cut -d= -f2- \| tr -d "'\"" \| ssh … 'read -r P; L=$(docker service inspect … admin-auth …); HASH=${L#*:}; SALT=$(printf "%s" "$HASH" \| cut -d\$ -f3); CALC=$(printf "%s" "$P" \| openssl passwd -apr1 -salt "$SALT" -stdin); [ "$CALC" = "$HASH" ] && echo PASSWORD=MATCH \|\| echo PASSWORD=NO-MATCH'` | two words only; values travel over ssh stdin, never argv, never printed (`-stdin` keeps them off `ps`; no `set -x`); `traefik.sh` carries two `HASHED_PASSWORD` exports — compare the last (effective) one and note if they differ |
| Repo == deployed | `cd ~/Repositories/thinx-swarm && git rev-parse HEAD; ssh … "git -C /mnt/gluster/deployment/swarm rev-parse HEAD"; cd ~/Repositories/thinx-api/thinx-device-api && node scripts/check-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"; grep -c '^ *- --' docker-compose.traefik.yml` | same SHA ×2 (+ mirror banner); `MIRROR OK files=1`; `19` at the end |
| Capture hygiene | the 31-03-PLAN secret-marker grep over `traefik-edge.E.*.yml` and the scan capture (`\$apr1\$`, `\$2[aby]\$`, `BEGIN .*PRIVATE KEY`, e-mail regex) | `0` each |

**D-30 auto-revert triggers as commands (per static stage):** (1) the status filter prints anything; (2) the HTTPS code matrix differs from the pre-stage baseline; (3) the cookie-less WS probe is not `101` or the cookie probe is not `401`; (4) Stage C only: any `handshake failure`/non-zero verify on `-tls1_2` or `-tls1_3` for rtm/app/console. Revert = `docker service update --detach --args "<previous Args via jq map(@sh) from the 600-root inspect backup>" traefik_traefik` (+ for C: `--config-rm tls-config-2 --config-add source=tls-config-1,target=/traefik/tls.toml,mode=0444`; for A2: `--label-add` the nine removed labels back from the backup / `--label-rm` the three mgmt labels).

## Q9 — Repo-first mechanics (D-04 scrub, D-32 docs)

### Files that change (exact locations, read this session)
| Stage | File | Edit |
|---|---|---|
| A1/A2 | `~/Repositories/thinx-swarm/traefik.yml:30-32` (`admin-auth`), `:57-80` (public routers, `error-pages-middleware` ref), `:82-86` (error-pages def — keep; IN-09 is out of scope), `:78` (`traefik-public` port — **keep**, add a "load-bearing" comment), `command:` block (+`mgmt` entrypoint line + comment) | labels + args per §Q3; add the three `traefik-mgmt` router labels |
| A | `~/Repositories/thinx-swarm/traefik.sh` | D-04: delete `export DOMAIN=…`, `USERNAME`, both `HASHED_PASSWORD`, `PASSWORD`, the `# This step will require the password` block; replace `export EMAIL=<literal>` with `: "${EMAIL:?set EMAIL in the environment}"` (the yml uses `${EMAIL?Variable not set}`); keep the network/node-label lines and the `stack deploy` line (bootstrap-only — add the AGENTS.md warning that live edge changes go via `service update`) |
| B | `traefik.yml` command: `exposedbydefault=true` → `false`, rewrite the P30 D-05 comment |
| C | `~/Repositories/thinx-swarm/traefik/tls.toml` (full rewrite, §Q2); `traefik.yml` `configs:` `name: tls-config-${CONFIG:-1}` → `${CONFIG:-2}`; command: + `--providers.file.filename=/traefik/tls.toml` |
| D | `traefik.yml` command: + `--entrypoints.https.http.middlewares=security-headers@swarm`; `thinx.yml:290,365` and `docker-swarm.yml:351,437` (optional ref removal) |
| D-08 | `thinx.yml:76-79` + `docker-swarm.yml:121-124` (mosquitto labels); `thinx.yml:369-370,419-420` + `docker-swarm.yml:441-442,491-492` (v1 STS); `thinx.yml:188,438` + `docker-swarm.yml:243,510` (`noexpose`); `thinx.yml:307` + `docker-swarm.yml:379` (`${WEB_HOSTNAME}` — see §Q3 item 4); `vault.yml:35` | label edits; `docker-swarm.yml` and `thinx.yml` traefik label sets are identical today (the one extra `traefik.swarm.network` string in `docker-swarm.yml` is a comment at line 370) `[VERIFIED: sorted grep diff]` |
| every thinx-swarm commit | `docker-compose.traefik.yml` (generated) | `node scripts/generate-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm" && node scripts/check-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"` → `MIRROR-GENERATED ok …`, `MIRROR OK files=1`; the generator masks `basicauth.users=…:<hash>` and UUIDs and keeps `${VAR}` templated `[VERIFIED: generate-traefik-mirror.js redactSecrets]`; **the check compares the banner SHA to thinx-swarm HEAD, so a `thinx.yml`-only or `tls.toml`-only commit also needs a regeneration** (P32 Pitfall 6) |
| D-32 | `.planning/runbooks/traefik-edge-hardening.md` (new sibling — the cutover runbook is already 1200+ lines), `AGENTS.md` (new section "Traefik dashboard/API access" with the `docker exec … wget` and socat recipes + "never `restart.sh`/`stack deploy` for edge changes" + the keep-7442 cross-reference), `~/Repositories/thinx-swarm/README.md` (currently **1 byte** — write the operator section), `swarm-configs/README.md` (add step `E`), `swarm-configs/traefik-edge.E.{pre,post}.yml`, `traefik-edge-scan.<date>.md`, `scripts/traefik-edge-scan.sh`, `ROADMAP.md`/`STATE.md`/`traefik-edge-fixforward.md` rows #2–#5 ("16-flag" → "19-flag" where they describe the current state; historical records stay) |

### micro checkout update (thinx-swarm has no stack-file CI; its `.circleci` builds only the downtime image)
micro checkout today: `158f369` == workstation `master` == mirror banner; no tracked modifications. `[VERIFIED: ssh micro git rev-parse/status]`
```bash
cd ~/Repositories/thinx-swarm && git push origin master
GIT_SSH_COMMAND="ssh -i ~/.ssh/DOKey2 -p2020" git push ssh://root@188.166.23.244/mnt/gluster/deployment/swarm master:refs/heads/p33-stageX
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "cd /mnt/gluster/deployment/swarm && git status --short | grep -v '^??' | wc -l; git merge --ff-only p33-stageX && git branch -d p33-stageX && git rev-parse HEAD"
# expect: 0 ; Fast-forward ; HEAD == workstation HEAD
```
Then the matching `docker service update`. For Stage C the new config is created **from the checkout on micro** so the deployed bytes are the committed bytes: `ssh … "docker config create tls-config-2 /mnt/gluster/deployment/swarm/traefik/tls.toml && docker config inspect tls-config-2 --format '{{.Spec.Data}}' | base64 -d | sha256sum"` → equals the committed file's sha256. `tls-config-1` is removed from the swarm only after Stage C's gate is green (`docker config rm tls-config-1`; it stays referenced by nothing).

### Capture persistence
New step pair **`traefik-edge.E.pre.yml`** (before A1; should differ from `D.post.yml` only in timestamps) and **`traefik-edge.E.post.yml`** (after E: 19-flag command, `traefik-mgmt` labels, `tls-config-2`, the mgmt-API inventory 29/18/6, the HSTS matrix, cert serials incl. the new influx serial, ACME 23 entries, the WS 101/401 pair, the bare-IP pair, direct-publish proof). Redacted on micro (`<redacted>` for any hash; `${EMAIL}`/`${CONFIG}` templated), secret-marker grep → 0. `D.post.yml` is the immutable Phase 32 record.

## Architecture Patterns

### System Architecture Diagram (request paths after Phase 33)
```
Internet ──:80──► traefik(http EP) ──► per-router https-redirect@swarm ──► 301
Internet ──:443─► traefik(https EP, TLS opts: default@file: TLS1.2+ AEAD, X25519/P-256)
                     │ entrypoint default: security-headers@swarm (STS/nosniff/frame-deny; skips 1xx)
                     ├─ Host(app)        ─► thinx-api-https  ─► thinx_api:7442 (overlay)
                     ├─ Host(rtm)&&Upgrade ► thinx-api-ws (p=200) ─► thinx_api:7442  (101 passes untouched)
                     ├─ Host(rtm)        ─► thinx-console-https ─► console:80
                     ├─ Host(… 14 more)  ─► landing/swarmpit/registry/db/influx/vue/external ×3
                     └─ PathPrefix(/) p=2/1 ─► downtime / error-router catch-alls (micro.thinx.cloud lands here)
Operator ──ssh micro──► docker exec <task> wget http://127.0.0.1:8080/api/…      (gates)
Operator ──laptop socat──► ssh ──► docker exec -i <task> nc 127.0.0.1:8080        (browser dashboard)
                     traefik(mgmt EP 127.0.0.1:8080, container netns only) ─► traefik-mgmt@swarm ─► api@internal
Devices ──:7442/:1883/:8883──► thinx_api / thinx_mosquitto (direct publish, NOT traefik)   [unchanged]
LE ──:443 acme-tls/1──► traefik TLS-ALPN challenge (default alpnProtocols) ─► acme.json (600, named volume on micro)
```

### Pattern 1: Ordered surgical `docker service update`, repo-first, one concern per restart
As P31/P32: commit → push origin → push + ff-merge on micro → mirror regenerated → live update → gate → capture. Label-only changes never restart; `--args`, `--config-*`, `--container-label-*` and `--force` do.

### Pattern 2: Loopback management plane
The API lives on an entrypoint only the task's own network namespace can reach; access rides the existing ssh + Docker plane. Gates are `docker exec … wget`; humans use the socat bridge.

### Pattern 3: Behavioural probe next to the status filter
Every gate pairs the status filter with the bare-IP pair, the WS 101/401 pair, the HTTPS matrix, and (from C) a TLS handshake triple — the filter alone is blind to a catch-all dying or a cipher misconfiguration that only shows on the wire.

### Anti-Patterns to Avoid
- Removing the `traefik-public` service port label (drops every shared middleware).
- Putting the mgmt router only in the file provider (phantom `traefik-traefik@swarm` router on every entrypoint).
- Loading the mounted `tls-config-1` as-is (`sniStrict=true` + CBC: a behaviour change and a cipher regression at once).
- Setting `alpnProtocols` without `acme-tls/1` (silently kills renewals).
- Editing `acme.json` without a restart within seconds (the running Traefik overwrites it on the next save and never sees the edit).
- `docker stack deploy` / `restart.sh` for any of this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| TLS policy | per-router `tls.options` labels | one `tls.options.default` in the file provider | labels cannot define options; `default` covers every present and future TLS router |
| HSTS everywhere | 14 per-router `middlewares` label edits (incl. 3 external stacks) | `--entrypoints.https.http.middlewares` | one flag, future routers included, proven idempotent with existing refs |
| In-task HTTP for gates | a sidecar/debug image | busybox `wget` already in the image (`nsenter` + host `curl` as fallback) | nothing to install, no new attack surface |
| Browser tunnel | installing socat/a proxy on micro | laptop `socat` + `ssh` + `docker exec -i nc` | nothing lands on the host; closes with the socat |
| Renewal proof | waiting for December | delete one routed host's entry + restart | 60-second end-to-end TLS-ALPN proof with a snapshot rollback |
| Scan | SSL Labs / third-party | `nmap ssl-enum-ciphers` + `sslscan` + `curl -I` script | D-26; deterministic, offline, repeatable |

## Runtime State Inventory (config-hardening phase — what lives outside git)

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `acme.json` (24 entries incl. the dead `checkout.qooldata.com` set and the retired thinx names), `_acme.json`, `__acme.json` in the named volume on micro | Stage E: snapshot, prune two entries, delete the two stale files (data edit + restart) |
| Live service config | 16 traefik-labelled services' labels (three external stacks have **no** committed file); `traefik_traefik` Args/labels/config mount; `downtime`/`errorpage` carry the v2 network key live | `docker service update` per §Q3; record external-stack commands + pre-change label dumps in the runbook (D-09) |
| OS-registered state | none — no systemd/cron references the dashboard host or the config name (`grep -r micro.thinx.cloud /etc/cron* /etc/systemd` not run — `[ASSUMED]` none; Phase 26 cron is CouchDB-only) | none |
| Secrets/env vars | `${EMAIL}` resolves from the deploy shell env on micro (the yml demands it); `USERNAME`/`HASHED_PASSWORD`/`DOMAIN` become unused after A2; the committed `traefik.sh` literals are scrubbed (git history keeps them — rotation moot, the middleware disappears) | D-04 compare before A2; nothing to rotate |
| Build artifacts | `docker config tls-config-1` (immutable object); `docker-compose.traefik.yml` mirror; `com.docker.stack.image` label still says `traefik:v2.11@sha256:…` (stale bookkeeping, cosmetic) | create `tls-config-2`, rm `-1` after C; regenerate the mirror per commit |

## Common Pitfalls

### Pitfall 1: The "vestigial" port label is load-bearing
**What goes wrong:** D-01 removes `traefik.http.services.traefik-public.loadbalancer.server.port=8080`; the swarm provider logs `service "traefik_traefik" error: port is missing` and skips the service — `https-redirect@swarm` and `security-headers@swarm` vanish, every `http` redirect router and both HSTS routers error.
**Why:** swarm mode knows no container ports; a `traefik.enable=true` service must declare one. `[VERIFIED: local swarm run + config.go]`
**How to avoid:** keep the label (comment it as load-bearing). **Warning sign:** `port is missing` in the log; 10+ routers disabled.

### Pitfall 2: Phantom default router after the public routers are removed
**What goes wrong:** with a service port but no router labels, the provider creates `traefik-traefik@swarm` `Host(\`traefik-traefik\`)` on **every** entrypoint (`http`, `https`, `mgmt`, …).
**How to avoid:** declare the `traefik-mgmt` router in the labels (A2 is a one-for-one swap). **Warning sign:** router count ≠ 29 after A2; a router named after the service.

### Pitfall 3: Mgmt router before the mgmt entrypoint
Labels referencing a non-existent entrypoint produce an errored router → D-30 fires. Order A1 (args) → A2 (labels).

### Pitfall 4: Stage C as a "hot reload"
Swarm configs are immutable; the file watcher never fires. Stage C is a config swap + restart (`--config-rm/--config-add` + `--providers.file.filename` in one update). Never add the file flag while `tls-config-1` is still the mounted file.

### Pitfall 5: `alpnProtocols` / `curvePreferences` side effects
Setting `alpnProtocols` without `acme-tls/1` breaks renewals silently (next failure in ~80 days). Setting `curvePreferences` drops X25519MLKEM768 — intended here, but record it; omit the key to keep the PQ hybrid.

### Pitfall 6: Scanning for all six D-14 suites
RSA 4096 certificates mean only the three `ECDHE_RSA_*` AEAD suites are ever observable; a predicate expecting the ECDSA names fails forever. nmap names ChaCha `…_CHACHA20_POLY1305_SHA256`.

### Pitfall 7: WS "200" wording
A 200 from the upgrade probe means the WS router is not matching. Gate on `101` (no cookie) / `401` (cookie); after D expect no STS on the 101 (1xx bypass).

### Pitfall 8: `${THINX_HOSTNAME}` in the WS rule
Resolves to `app.thinx.cloud`; the WS router must stay on `rtm.thinx.cloud` = `${WEB_HOSTNAME}`.

### Pitfall 9: Editing `acme.json` under a running Traefik
The store is read once and rewritten whole on every save; an edit without an immediate restart is lost — and a restart is required for the reissue anyway. Keep the edit→`--force` gap to seconds; snapshot first.

### Pitfall 10: Two-label bridge on downtime/errorpage
Fixing `traefik.docker.network` → `traefik.swarm.network` must be one update (`--label-rm` + `--label-add`); a service carrying both keys is skipped by the v3 provider (the catch-alls would disappear).

### Pitfall 11: `--container-label-rm` restarts tasks
`traefik.backend.*.noexpose` are ContainerSpec labels; removing them restarts transformer/worker (not edge-relevant, but not "label-only").

### Pitfall 12: Mirror stale after a non-`traefik.yml` commit
`check-traefik-mirror.js --swarm-repo` compares against thinx-swarm HEAD; regenerate after every thinx-swarm commit, including `tls.toml`/`thinx.yml`/`README.md`-only ones.

## Code Examples

### `traefik_traefik` label set after Stage A2 (committed `traefik.yml` `deploy.labels`)
```yaml
        - traefik.enable=true
        - traefik.swarm.network=traefik-public
        - traefik.constraint-label=traefik-public
        # LOAD-BEARING (Phase 33 research): the v3 swarm provider skips any traefik-enabled service
        # without an explicit service port ("port is missing") and would drop the shared middlewares
        # below. api@internal ignores this service; the provider does not. Keep it.
        - traefik.http.services.traefik-public.loadbalancer.server.port=8080
        # Phase 33 (EDGE-API-01/02, D-01..D-03): the public dashboard routers + admin-auth are gone.
        # The API/dashboard is reachable ONLY inside the task on the loopback `mgmt` entrypoint
        # (--entrypoints.mgmt.address=127.0.0.1:8080): ssh micro -> docker exec <task> wget http://127.0.0.1:8080/api/...
        # Declared here (not in the file provider) so the provider does not synthesise a default router.
        - traefik.http.routers.traefik-mgmt.rule=PathPrefix(`/`)
        - traefik.http.routers.traefik-mgmt.entrypoints=mgmt
        - traefik.http.routers.traefik-mgmt.service=api@internal
        - traefik.http.middlewares.https-redirect.redirectscheme.scheme=https
        - traefik.http.middlewares.https-redirect.redirectscheme.permanent=true
        - traefik.http.middlewares.security-headers.headers.browserxssfilter=true
        - traefik.http.middlewares.security-headers.headers.contenttypenosniff=true
        - traefik.http.middlewares.security-headers.headers.forcestsheader=true
        - traefik.http.middlewares.security-headers.headers.framedeny=true
        - traefik.http.middlewares.security-headers.headers.stsincludesubdomains=true
        - traefik.http.middlewares.security-headers.headers.stspreload=true
        - traefik.http.middlewares.security-headers.headers.stsseconds=31536000
        - "traefik.http.middlewares.error-pages-middleware.errors.status=400-599"
        - "traefik.http.middlewares.error-pages-middleware.errors.service=errorpage"
        - "traefik.http.middlewares.error-pages-middleware.errors.query=/{status}.html"
```

### Stage A2 live command (one update, label-only)
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach \
  --label-rm traefik.http.middlewares.admin-auth.basicauth.users \
  --label-rm traefik.http.routers.traefik-public-http.rule --label-rm traefik.http.routers.traefik-public-http.entrypoints --label-rm traefik.http.routers.traefik-public-http.middlewares \
  --label-rm traefik.http.routers.traefik-public-https.rule --label-rm traefik.http.routers.traefik-public-https.entrypoints --label-rm traefik.http.routers.traefik-public-https.tls \
  --label-rm traefik.http.routers.traefik-public-https.service --label-rm traefik.http.routers.traefik-public-https.tls.certresolver --label-rm traefik.http.routers.traefik-public-https.middlewares \
  --label-add 'traefik.http.routers.traefik-mgmt.rule=PathPrefix(\`/\`)' --label-add traefik.http.routers.traefik-mgmt.entrypoints=mgmt --label-add traefik.http.routers.traefik-mgmt.service=api@internal \
  traefik_traefik"
# expect: rc 0; same task id; within 15 s /api/http/routers (via docker exec wget) lists traefik-mgmt@swarm enabled and no traefik-public-*
```

### Stage C live command (args + config swap, one restart)
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "umask 077; B=/mnt/data/edge-rollback/traefik-p33-preC-\$(date -u +%Y%m%dT%H%M%SZ).json; docker service inspect traefik_traefik > \$B; chmod 600 \$B; \
  ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + [\"--providers.file.filename=/traefik/tls.toml\"] | map(@sh) | join(\" \")' \$B); \
  docker service update --detach --args \"\$ARGS\" --config-rm tls-config-1 --config-add source=tls-config-2,target=/traefik/tls.toml,mode=0444 traefik_traefik"
# expect: rc 0; args=18; Configs -> tls-config-2; providers ["Swarm","File"]; CBC refused on rtm/app/console
```
(Stage A1/B/D use the same `jq` shape: `+ ["--entrypoints.mgmt.address=127.0.0.1:8080"]`, `map(if . == "--providers.swarm.exposedbydefault=true" then "--providers.swarm.exposedbydefault=false" else . end)`, `+ ["--entrypoints.https.http.middlewares=security-headers@swarm"]`.)

### `tls.toml` — see §Q2 (complete file).

### Scan script skeleton (`scripts/traefik-edge-scan.sh`)
```bash
#!/usr/bin/env bash
# Phase 33 (D-26..D-29) external TLS/dashboard scan — laptop only, no third-party service.
set -u
EDGE_IP=188.166.23.244
HOSTS="rtm.thinx.cloud app.thinx.cloud console.thinx.cloud thinx.cloud www.thinx.cloud swarmpit.thinx.cloud registry.thinx.cloud db.thinx.cloud influx.thinx.cloud www.fotostim.com fotostim.com www.fotostim.cz fotostim.cz igraczech.com www.igraczech.com www.syxra.cz micro.thinx.cloud"
WANT12="TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256"
echo "## Port sweep $EDGE_IP"; nmap -Pn -p 80,443,8080,8443 "$EDGE_IP" | grep -E '^[0-9]+/tcp'
for H in $HOSTS; do
  echo "## $H"
  N=$(nmap -Pn --script ssl-enum-ciphers -p 443 "$H")
  echo "$N" | grep -qE 'SSLv3:|TLSv1\.0:|TLSv1\.1:' && echo "FAIL legacy-tls $H"
  echo "$N" | grep -q 'TLSv1.3:' || echo "FAIL no-tls13 $H"
  GOT=$(echo "$N" | sed -n '/TLSv1.2:/,/TLSv1.3:/p' | grep -oE 'TLS_[A-Z0-9_]+' | sort -u | tr '\n' ' ')
  [ "$(echo $GOT)" = "$(echo $WANT12 | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/ $//')" ] || echo "FAIL tls12-set $H got: $GOT"
  sslscan --no-colour "$H" | grep -E '^(SSLv|TLSv1\.[01]) ' | grep -v disabled && echo "FAIL sslscan-legacy $H"
  curl -sSI -m 15 "https://$H/" 2>/dev/null | grep -i '^strict-transport-security:' | grep -qi 'max-age=31536000; includesubdomains; preload' || echo "FAIL hsts $H"
  curl -s -m 15 "https://$H/api/overview" | jq -e .http >/dev/null 2>&1 && echo "FAIL api-exposed $H"
  printf 'https %s ' "$H"; curl -sS -o /dev/null -m 15 -w '%{http_code}\n' "https://$H/"
done
```
(Predicates per §Q7; the planner's `<fails_when>` is "any line starting with FAIL".)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `--api.insecure` / public dashboard behind basic-auth | `api@internal` on a loopback entrypoint, ssh plane only | this phase | no credential on the edge, no public route |
| Go default TLS suites (incl. two CBC-SHA1) | explicit `tls.options.default`, AEAD only | this phase (file loaded for the first time) | scan-clean TLS 1.2; 1.3 unchanged |
| per-router `security-headers@swarm` ×2 | entrypoint default on `https` | this phase | HSTS on 17 hosts incl. external stacks; 1xx untouched |
| `preferServerCipherSuites` | removed from Go (1.17) and ignored by Traefik | Go 1.17 / Traefik warns | omit |
| `PreferServerCipherSuites` / `CurvePreferences` order | Go chooses; order ignored; PQ hybrids default from Go 1.24/1.26 | Go 1.24+ | explicit `curvePreferences` disables MLKEM hybrids |

**Deprecated/outdated:** `traefik.frontend.*`/`traefik.backend.*` (v1 labels — dead), `traefik.docker.network` (v2 key — provider ignores under v3), `mosquitto-secure` TCP router (no rule, pruned).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | No cron/systemd unit on micro references `micro.thinx.cloud`/the dashboard or `tls-config-1` | Runtime State Inventory | a forgotten job starts failing silently; grep `/etc/cron*`, `/etc/systemd` on micro in Wave 0 |
| A2 | The `--force` restart of Stage E behaves like the `--args` restarts (~15 s, one task) | §Q6 | longer blip; same rollback |
| A3 | LE issues the influx reissue within ~60 s via TLS-ALPN through the swarm ingress (it did on 2026-09-29 for 24 names) | §Q6 | default cert on influx until it succeeds; rollback = snapshot |
| A4 | `docker exec -i … nc` keeps a browser session usable for the dashboard's parallel asset requests with ssh ControlMaster | §Q1 | slow dashboard; JSON gates unaffected (tested with sequential curl only) |
| A5 | `traefik.sh` is used only for first-time bootstrap (network/node label) and never run against the live edge | §Q9 | if someone runs it after the scrub, `EMAIL` must be exported first — the `:?` guard makes that loud |

## Open Questions

1. **D-02/D-10 wording vs. the provider finding (needs a user nod).** The locked text says "file-provider router to `api@internal`" and "the API router can only live in the file provider". Research shows the router **must** be in the `traefik_traefik` labels (or a phantom router appears) and that the port label must stay (contradicting D-01's "vestigial … removed"). Recommendation: amend D-01 (keep the port label) and D-02 (label router; file provider carries TLS only); alternatively keep the file router *and* add the label router. Both keep every security property of D-02 (loopback-only, no auth, ssh plane).
2. **`curvePreferences` set vs. omitted.** Setting `["X25519","CurveP256"]` (recommended, scannable) removes the X25519MLKEM768 hybrid the edge offers today; omitting keeps it. Operator preference — either satisfies D-14.
3. **`${WEB_HOSTNAME}` for the WS rule** (D-08 says `${THINX_HOSTNAME}`, which is `app`). Research is confident; confirm the env-var names in micro's deploy environment at execution (`grep -E '^(WEB_HOSTNAME|THINX_HOSTNAME)=' /mnt/gluster/deployment/swarm/.env` — do not print other variables).
4. **Baseline router inventory before A2** — through the still-present public router with a re-staged credential (P32 Q6 recipe), or accept the 15:12Z `D.post.yml` list (30 routers, all enabled) as the baseline. Recommendation: the latter plus a `docker service inspect`-label count; no credential staging.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| ssh to micro (`188.166.23.244:2020`, DOKey2) | everything live | ✓ | — | — |
| Docker Engine on micro | service updates, exec, config create | ✓ | 29.8.1 | — |
| `nsenter`, `curl`, `wget`, `jq`, `openssl`, `nc`, `python3`, `ss` on micro | probes, acme edit | ✓ | util-linux 2.39.3 | — |
| `socat` on micro | — | ✗ | — | not needed (laptop bridge) |
| `wget`, `nc` inside `traefik:v3.7.14` | gates, bridge | ✓ | BusyBox 1.37.0 | `nsenter -n curl` from the host |
| `nmap`, `sslscan`, `openssl`, `socat`, `curl`, `jq` on the laptop | D-26 scan, bridge | ✓ | 7.94 / 2.2.2 / 3.6.3 | — |
| Docker on the laptop | research only (done) | ✓ | 29.8.2 (swarm left inactive, throwaways removed) | — |
| `node` on the laptop | mirror scripts, harness | ✓ | v25.1.0 | — |
| Device-flow harness `/tmp/p31-device-flow/thinx-device-flow.mjs` + `~/Repositories/thinx-mcp-device` | D-31 | ✓ (3010 B, 2026-10-07) | — | recreate per 31-03-SUMMARY D5 |
| thinx-swarm micro checkout fast-forwardable | repo-first | ✓ (`158f369`, clean) | — | — |
| `/mnt/data/edge-rollback/` on micro | snapshots | ✓ (exists, prior P30–P32 files) | — | — |
| `alpine:3.20` on micro | overlay-reachability probe | ✓ (P32) | — | any image on micro |

**Missing dependencies with no fallback:** none. **Missing with fallback:** `socat` on micro (laptop bridge).

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json`; included because the orchestrator requested the verify inventory. No unit-test framework applies — the tests are the live/scan commands of §Q8/§Q7.

### Test Framework
| Property | Value |
|---|---|
| Framework | none (operational verification: ssh/docker exec/curl/openssl/nmap/sslscan) |
| Config file | `scripts/traefik-edge-scan.sh` (new, Wave 0) |
| Quick run command | status filter (loopback) + WS 101/401 pair + bare-IP pair + HTTPS code matrix (< 30 s) |
| Full suite command | §Q8 top to bottom + `scripts/traefik-edge-scan.sh` + harness ×2 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| EDGE-API-01 | 8080 closed externally; `--api.insecure` absent; mgmt bound to 127.0.0.1 | integration | nmap sweep (`8080 … closed`); Args grep → 0; `nsenter … ss -ltn` → `127.0.0.1:8080`; overlay `nc` → CLOSED | ❌ Wave 0 (scan script) |
| EDGE-API-02 | dashboard served via `api@internal` only on loopback; no public route | integration | `docker exec wget …/dashboard/` → 200; `micro.thinx.cloud/api/overview` not JSON; router inventory 29 with `traefik-mgmt@swarm` | n/a (live) |
| EDGE-TLS-01 | TLS ≥1.2, 1.3 preferred, AEAD-only 1.2 set | integration | nmap/sslscan predicates; openssl `-tls1_1` fail, CBC fail, 1.2/1.3 ok on rtm/app/console | ❌ Wave 0 |
| EDGE-TLS-02 | HSTS on every HTTPS host; `:7442` untouched; WS 101 untouched | integration | HSTS matrix 17/17; harness PASS over :7442; WS probe 101 (no STS) / 401 | harness ✓ |
| EDGE-TLS-03 | real email; acme.json 600; renewal proven | integration | `grep -c example.com` → 0; `stat` → `600 root`; influx serial changed, store 23, 0 renew errors | n/a |
| D-07 | inventory identical across the flip | integration | sorted router names before/after B → `diff` empty | n/a |
| D-31 | console renders, live updates over WS | manual (blocking-human) | `/console-retest` in the browser | — |

### Sampling Rate
- **Per task (each stage/update):** quick run.
- **Per stage end:** full suite minus the scan; scan after D and after E.
- **Phase gate:** full suite green, `E.post.yml` + scan capture committed with 0 secret markers, then the single human gate.

### Wave 0 Gaps
- [ ] `scripts/traefik-edge-scan.sh` (D-26) and the first `traefik-edge-scan.<date>.md` **before** capture.
- [ ] `traefik-edge.E.pre.yml` baseline capture + the 30-router baseline list.
- [ ] Confirm `WEB_HOSTNAME`/`THINX_HOSTNAME` values in micro's deploy env (Open Question 3) and the absence of cron/systemd references (A1).
- [ ] Verify the harness file still exists; recreate if `/tmp` was cleaned.

## Security Domain

### Applicable ASVS Categories (L1)
| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes (removal) | basic-auth on the dashboard is replaced by the ssh key plane (`DOKey2`, port 2020, root) — no credential remains on the edge |
| V3 Session Management | no | — |
| V4 Access Control | yes | mgmt entrypoint bound to `127.0.0.1` in the task netns; not on overlay/host/internet (proven); `exposedByDefault=false` makes exposure opt-in |
| V5 Input Validation | yes (config) | Traefik validates cipher/curve names at build time (`invalid CipherSuite`), label rules at discovery; gates assert parse before the next stage |
| V6 Cryptography | yes | TLS 1.2+ AEAD suites, X25519/P-256, TLS 1.3 (Go), LE RSA-4096 certs; apr1 compare via `openssl passwd -stdin` |
| V9 Communication | yes | HSTS 1 y + includeSubDomains + preload on every HTTPS host; plaintext `:7442` kept by operator decision (documented exception) |
| V14 Configuration | yes | repo-first, mirror gate, redacted captures, 600-root snapshots, no secrets in commits |

### Known Threat Patterns for this change
| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Dashboard/API reachable from the overlay (any of 16 services incl. 3 external stacks) or internet | Information disclosure / Elevation | loopback bind (proven); overlay `nc` probe + external sweep in every gate; no `--api.insecure` ever |
| Shared middlewares dropped by the provider (port label removed) → redirect/HSTS routers error | DoS | keep the port label; status filter + HTTPS matrix trigger an auto-revert |
| Phantom default router routing `Host: traefik-traefik` to Traefik's own :80 | Tampering / loop | explicit mgmt router in labels; inventory count gate |
| Cipher misconfiguration → handshake failures for devices (ESP8266 BearSSL TLS 1.2) | DoS | TLS 1.2 kept, AES-GCM/ChaCha20 both offered; D-30 Stage C handshake trigger; harness over HTTPS |
| TLS-ALPN broken by an `alpnProtocols` edit → silent renewal failure in ~80 days | DoS (future) | key omitted; Stage E proves issuance end-to-end |
| Private keys leaving micro (snapshots, captures) | Information disclosure | snapshots 600/700 root under `/mnt/data/edge-rollback`; captures redacted on micro; secret-marker grep 0 |
| Password/hash exposure during the D-04 compare | Information disclosure | stdin only, `-stdin`, no `set -x`, result is a word |
| `acme.json` edit lost or corrupted | Tampering | jq into a temp file, `jq -e` validation, `mv`, restart within seconds, snapshot restore |
| HSTS on a plaintext path | — | impossible: `:7442` is not a Traefik entrypoint; `http` entrypoint has no headers middleware |

## Sources

### Primary (HIGH confidence — official source at the live tag / live reads / falsification runs this session)
- `github.com/traefik/traefik` tag `v3.7.14` (`3bd7aa32`, Go 1.26.0 in go.mod, binary go1.26.8): `pkg/config/static/{static_config.go,entrypoints.go,experimental.go}`, `pkg/server/server_entrypoint_tcp.go`, `pkg/server/service/internalhandler.go`, `pkg/server/router/router.go`, `pkg/provider/file/file.go`, `pkg/provider/docker/{config.go,pswarm.go,shared.go,shared_labels.go}`, `pkg/provider/configuration.go`, `pkg/provider/acme/{provider.go,local_store.go,local_store_unix.go,challenge_tls.go}`, `pkg/tls/{tls.go,tlsmanager.go,cipher.go,certificate.go}`, `pkg/middlewares/headers/{headers.go,header.go,secure.go}`, `pkg/middlewares/response_modifier.go`, `pkg/proxy/httputil/proxy.go`.
- Local falsification (laptop Docker 29.8.2, 2026-10-08 17:55–18:08Z, all torn down): `traefik:v3.7.14` throwaway with mgmt loopback entrypoint + file provider (TLS options, routers, headers middleware) + Node WebSocket backend; TLS scan via an `alpine:3.20` sidecar (`openssl`, `nmap`); single-node swarm (`docker swarm init` → three labelled services → swarm-provider probe → `swarm leave --force`).
- Live edge (read-only ssh, 2026-10-08 17:45–20:00Z): `traefik_traefik` Args/ports/configs/mounts/labels, all 16 services' label keys and router rules, container labels on transformer/worker, ACME volume stat + entry list, service logs, host tools, `nsenter` + `docker exec` + socat-bridge probes against `:80`; laptop probes: HTTPS/HSTS matrix, WS 101/401, nmap sweep + `ssl-enum-ciphers`, sslscan, `dig`, cert key types/serials.
- Repo artefacts: `33-CONTEXT.md`, `32-RESEARCH.md`, `32-CONTEXT.md`, `32-REVIEW.md`, `traefik-v3-cutover.md` (§Mechanism, §Stage 2 record), `swarm-configs/README.md`, `traefik-edge.D.post.yml`, `traefik-acme-inventory.2026-10-06.md`, `traefik-edge-fixforward.md`, `~/Repositories/thinx-swarm/{traefik.yml,traefik/tls.toml,traefik.sh,thinx.yml,vault.yml,downtime.yml,errorpage.yml,README.md}`, `docker-swarm.yml`, `docker-compose.traefik.yml`, `scripts/{generate,check}-traefik-mirror.js`, `services/traefik/update.sh`, `/tmp/p31-device-flow/thinx-device-flow.mjs`, `31-03-SUMMARY.md`.

### Secondary (MEDIUM confidence — official documentation, `[CITED]`)
- https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/ — `address` format, `http.middlewares` (prepended, fully-qualified `@provider`), `http.tls.options` precedence.
- https://doc.traefik.io/traefik/reference/install-configuration/providers/others/file/ — `filename`/`directory` mutually exclusive, `watch` default true, mounted-file limitation.
- https://doc.traefik.io/traefik/reference/install-configuration/api-dashboard/ — `api`/`api.dashboard`/`api.insecure` defaults, `api@internal` router requirement, endpoint list, production warning.
- https://doc.traefik.io/traefik/reference/routing-configuration/http/tls/tls-options/ — `default` option, `minVersion`, `cipherSuites` (TLS 1.3 not configurable), `curvePreferences`, `sniStrict`, `alpnProtocols` default incl. `acme-tls/1`.
- https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/headers/ — STS options, `forceSTSHeader`, `Set` semantics.
- https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/ — `storage`, `tlsChallenge` (port 443), renewal 30 days before expiry, default cert until restart for new domains.
- https://doc.traefik.io/traefik/reference/install-configuration/providers/swarm/ — `exposedByDefault`, `constraints`.
- https://docs.docker.com/engine/swarm/configs/ — immutability, rotation via `--config-rm/--config-add`, redeploy, mode 0444.
- https://pkg.go.dev/crypto/tls (go1.27.2 page) — `PreferServerCipherSuites` deprecated/no effect, `CurvePreferences` order ignored + MLKEM defaults, `CipherSuites` TLS 1.3 not configurable, suite constant names.

### Tertiary (LOW confidence)
- none — no WebSearch-only claims were used.

## Metadata

**Confidence breakdown:**
- Loopback entrypoint / API / dashboard mechanics: HIGH — source + docs + local falsification + live `nsenter`/`docker exec`/bridge tests.
- Provider default-router/port behaviour (the D-01/D-02 correction): HIGH — source lines + local single-node-swarm falsification with three label shapes.
- TLS options file: HIGH — source maps + local throwaway scanned with openssl/nmap; scanner nuance from live cert key types.
- HSTS on 101: HIGH — source (1xx bypass) + real WebSocket backend test; idempotence proven.
- ACME store semantics and procedure: HIGH on behaviour (source); MEDIUM on timing of the LE reissue (A3).
- Live inventory / counts: HIGH — read today; re-read `args=16 idx=38379738`, the 30-router list and the label keys at execution start.

**Research date:** 2026-10-08
**Valid until:** 2026-11-07 for the Traefik findings (pinned tag); the live inventory is a snapshot — re-baseline before Stage A1.
