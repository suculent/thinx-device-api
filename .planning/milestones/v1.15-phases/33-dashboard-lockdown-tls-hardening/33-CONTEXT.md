# Phase 33: Dashboard Lockdown & TLS Hardening - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the Traefik dashboard/API surface and enforce modern TLS on the live **`traefik:v3.7.14`** edge
(swarm provider, native v3 rules, 16-flag static command since Phase 32), then prove it with an external
scan. Delivers **EDGE-API-01, EDGE-API-02, EDGE-TLS-01, EDGE-TLS-02, EDGE-TLS-03**.

**Live baseline (verified 2026-10-08, from the laptop and on `micro`):**

| Item | Live state today | Gap this phase closes |
|---|---|---|
| Port 8080 | NOT host-published (Traefik publishes only `:80`/`:443`, ingress mode); `http://188.166.23.244:8080` refuses | none — record as evidence |
| `--api.insecure` | absent; `--api` only, dashboard via `api@internal` on `micro.thinx.cloud` behind `admin-auth` basic-auth → 401 | public router + basic-auth are **removed**; API becomes ssh-only (D-01..D-04) |
| ACME email | `${EMAIL}` resolves to the real operator address (not `admin@example.com`) | none — record as evidence |
| `acme.json` | `600 root` in named volume `traefik_traefik-public-certificates`; 24 certs, thinx hosts renewed 2026-09-29 → expire 2026-12-28 | renewal **proven**, stale 2023 key files and the failing external entry handled (D-22..D-25) |
| TLS versions | 1.0/1.1 refused, 1.2 + 1.3 served — but on **Go defaults**: the mounted `tls.toml` has never been loaded (no `--providers.file`, 32-REVIEW IN-01) | load TLS options via file provider with an AEAD-only list (D-13..D-16) |
| HSTS | `max-age=31536000; includeSubDomains; preload` on rtm/app/console only; **absent** on thinx.cloud, swarmpit, registry, vue, db, influx and the 3 external stacks | edge-wide via the `:443` entrypoint default middleware (D-17..D-20) |
| `exposedbydefault` | `true` (P30 D-05 deferred the flip here); all 16 traefik-labelled services already carry `traefik.enable=true` | flip to `false` + label clean-up bundle (D-07..D-10) |
| Client IPs | swarm ingress NAT: Traefik sees **every** client as `10.0.0.2` (2000/2000 access-log lines) | NOT fixed here — Phase 34 (deferred); it kills any IP allowlist / rate-limit idea in this phase |

**Hard constraints carried forward:** plaintext `:7442` and plain MQTT (`:1883`) are published directly by
`thinx_api`/`thinx_mosquitto`, not by Traefik — nothing in this phase may touch them (AGENTS.md
operator decision 2026-10-04); HSTS is a browser mechanism and Traefik serves no `:7442`, so criterion 2
"plaintext `:7442` unaffected" holds by construction and is re-verified by the device-flow harness.
Image stays `traefik:v3.7.14` (no bump). No `--api.insecure`, ever.

**Not in this phase:** log level, read-only socket-proxy, SLA close-out, real-client-IP fix (Phase 34);
VPN management access (new capability, backlog); HSTS preload-list submission; `:80`→`:443` redirect gaps
(recorded only, D-20).

</domain>

<decisions>
## Implementation Decisions

### Dashboard / API lockdown (EDGE-API-01/02)
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

### Exposure audit & label clean-up (EDGE-API-01 posture)
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

### TLS options & ciphers (EDGE-TLS-01)
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

### HSTS (EDGE-TLS-02)
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

### ACME (EDGE-TLS-03)
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

### External scan & evidence (criterion 4)
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

### Rollout, gates, documentation
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

### Claude's Discretion
- Exact loopback entrypoint name/port, the in-task HTTP client mechanics (curl/wget in the image vs
  `nsenter` from the host), and the `ssh -L` recipe — research decides with citations to
  `doc.traefik.io/traefik/` (entrypoints, file provider, API/dashboard).
- Whether the file-provider flag rides in Stage A (needed for the API router) and Stage C becomes a
  hot-reloaded file edit — see D-10.
- `curvePreferences`, `alpnProtocols` and whether to add `preferServerCipherSuites` (no-op in
  modern Go) to `tls.toml`.
- Whether the redundant per-router `security-headers@swarm` refs are removed or kept under D-17, as
  long as headers are not duplicated.
- Which low-value routed host is used for the D-22 forced reissue.
- Capture naming (`traefik-edge.D.post.yml` vs update) per `swarm-configs/README.md`; order of the
  label-only clean-ups between stages.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements, roadmap, wart list
- `.planning/REQUIREMENTS.md` — EDGE-API-01/02, EDGE-TLS-01/02/03; out-of-scope table (`:7442` hard constraint).
- `.planning/ROADMAP.md` → `### Phase 33` — goal + 4 success criteria.
- `.planning/runbooks/traefik-edge-fixforward.md` — rows #2 (`exposedbydefault`), #3 (`--api`/8080), #4 (ACME email/perms/renewal), #5 (TLS min + HSTS) are this phase; #6/#7 stay P34.
- `.planning/research/TRAEFIK-MIGRATION.md` — "harden (dashboard, TLS, ops)" step; `--api` → `api@internal` guidance (now superseded by D-01/D-02: no public router at all).

### Prior-phase decisions carried forward
- `.planning/phases/32-v3-native-syntax-bc-removal/32-CONTEXT.md` — D-04 repo-first ordering, D-10 auto-revert triggers, D-11 verification gate, D-12 credential hygiene (no `--api.insecure`, ever); "16-flag" end state.
- `.planning/phases/32-v3-native-syntax-bc-removal/32-REVIEW.md` — **IN-01** (`tls.toml` never loaded → D-13), IN-02 (vault label), IN-03 (dead v1 STS labels), IN-04 (routers without `security-headers@swarm`), IN-05 (`${THINX_HOSTNAME}` in WS rule), IN-06 (mosquitto TCP router without rule) → D-08.
- `.planning/phases/32-v3-native-syntax-bc-removal/deferred-items.md` — `checkout.qooldata.com` renewal failure → D-24.
- `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-CONTEXT.md` — D-03 image pin (`v3.7.14`, never `@sha256`), D-04 `exposedbydefault` deferral, D-05 device paths.
- `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW.md` — IN-05 (dead v1 labels; "security-headers on a 101 handshake" concern → D-18).
- `.planning/phases/30-v1-v2-syntax-migration-parity/30-CONTEXT.md` — D-02 direct-publish routing model (`:7442`/`:1883`/`:8883` outside Traefik), D-05 `exposedbydefault` → P33.
- `.planning/phases/29-edge-reconciliation-source-of-truth/29-CONTEXT.md` — source-of-truth chain and secret-handling rules (D-10/D-11/D-12).

### Operational runbooks (command conventions to reuse verbatim)
- `.planning/runbooks/traefik-v3-cutover.md` — §Boot-and-discover (throwaway probe recipe), §Cutover mechanism (ordered surgical `docker service update`, `--args` restarts, no two-label bridge), §Rollback, §Live cutover record. Phase 33 appends its section here (or a sibling file, D-32).
- `.planning/runbooks/swarm-configs/README.md` — capture persistence rules (templated vars, no secrets).
- `.planning/runbooks/swarm-configs/traefik-edge.C.post.yml` — redacted live v3 edge capture (pre-Phase-32); the Phase 32 end-state capture is the "before" of this phase.
- `.planning/runbooks/swarm-configs/traefik-acme-inventory.2026-10-06.md` — 24-cert ACME inventory, expired `checkout.qooldata.com` note (D-24), authoritative `acme.json` path.
- `.planning/runbooks/swarm.md` §"Traefik Edge Source of Truth" — one-way chain thinx-swarm → generated mirror → CI check.

### Source of truth and deploy mechanics
- `~/Repositories/thinx-swarm/traefik.yml` + `~/Repositories/thinx-swarm/traefik/tls.toml` (sibling repo, master `158f369`) — the deployed Traefik static config and the TLS options file this phase rewrites; `~/Repositories/thinx-swarm/traefik.sh` — the launcher to scrub (D-04); `~/Repositories/thinx-swarm/{thinx.yml,vault.yml}` — label edits (D-08); `~/Repositories/thinx-swarm/README.md` — operator docs (D-32).
- `/mnt/gluster/deployment/swarm` on `micro` is a git checkout of thinx-swarm: update by `git push ssh://micro/… master:refs/heads/<tmp>` + `git merge --ff-only` there (micro cannot reach GitHub); thinx-swarm has NO CI.
- `docker-swarm.yml` (this repo) — authoritative thinx-stack labels; must stay identical to thinx-swarm `thinx.yml` (except the 3 SEC-CFG-04 api secret attachments).
- `docker-compose.traefik.yml` — **generated** mirror; `scripts/generate-traefik-mirror.js`, `scripts/check-traefik-mirror.js` (CI gate `Traefik mirror staleness`); must return `MIRROR OK` after every thinx-swarm commit.
- `services/traefik/update.sh` — confirms the named-volume `acme.json` path used by D-22/D-23.
- `AGENTS.md` — micro ssh form (`ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`), keep-7442 rule, no `restart.sh`/`stack deploy` for edge changes; receives the D-32 pointer.

### Upstream documentation (verify every flag)
- https://doc.traefik.io/traefik/ — v3 reference for `entryPoints` (address binding, `http.middlewares` default), `providers.file`, `tls.options` (`minVersion`, `cipherSuites`, `sniStrict`, `curvePreferences`), `api`/`dashboard` (`api@internal`, `insecure`), `headers` middleware (STS options, behaviour on upgrade responses).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **P31/P32 surgical-update machinery**: ordered `docker service update --args` on `traefik_traefik`
  (one ~4 s restart per stage), `--label-add/--label-rm` for label-only changes, `Version.Index`
  recording, redacted `.post.yml` captures, `# expect:` runbook convention.
- **Router-inventory gate**: `/api/http/routers | select(.status!="enabled")` — now issued from inside
  the Traefik task over the D-02 loopback entrypoint instead of through basic-auth.
- **Device-flow harness** (`thinx-device-flow.mjs` from `~/Repositories/thinx-mcp-device`, or the
  `mcp__thinx-device__*` tools): register → status → OTT → firmware download → plain MQTT publish, over
  `:7442`+`:1883` and over HTTPS — the D-31 gate input.
- **Boot-and-discover probe recipe** (runbook §Boot-and-discover): throwaway `traefik:v3.7.14` with no
  host ports — reuse to validate the new `tls.toml` + file-provider router parse before Stage A/C.
- **Mirror generator/checker**; the `{{range $k,$v := .Spec.Labels}}` label-dump idiom used for the
  2026-10-08 inventory; `nmap`/`sslscan` already installed on the operator laptop.
- Existing `security-headers` middleware labels on `traefik_traefik` (STS 31536000 / includeSubdomains /
  preload / nosniff / frame-deny) — the object D-17 promotes to entrypoint default.

### Established Patterns
- Repo first, then live (P32 D-04); never `docker stack deploy`/`restart.sh` for edge changes
  (drops live-only secret mounts, resets auth hashes).
- One `--args` update = one restart = one rollback command; label-only changes don't restart tasks.
- Secret hygiene P29 D-12: committed files templated/redacted; no hashes, e-mails-as-secrets, keys.
- Out-of-git 600-root snapshots under `/mnt/data/edge-rollback/` on `micro` before any `acme.json` edit.
- Traefik placement floats in principle but is pinned by `node.labels.Traefik==true` to `micro`; always
  query it. `docker exec` is node-local.

### Integration Points
- `traefik_traefik` static args (16 → 18 flags: `+providers.file.filename`, `+entrypoints.https.http.middlewares`,
  `+entrypoints.mgmt.address`; `exposedbydefault` value flipped) and its service labels (dashboard
  router/middleware/service removed).
- `tls-config` docker config (`tls-config-${CONFIG:-1}`) mounted at `/traefik/tls.toml` — swarm configs are
  immutable, so a new content needs a new config name/version (`CONFIG=2`) and a service update; the
  file-provider router for `api@internal` lives in the same file (or a second file in the mount).
- `thinx_api` labels (`thinx-api-ws` rule, `security-headers@swarm` ref), `thinx_console`, `thinx_vue`,
  `thinx_mosquitto`, `thinx_couchdb`, `thinx_influxdb` labels; external `fotostim_*`, `igraczech-com_web`,
  `syxra-cz_web` labels (live only); `vault_vault` label.
- ACME named volume `traefik_traefik-public-certificates` on `micro` (`acme.json`, stale `_acme.json`/`__acme.json`).
- CI: pushes to `thinx-staging` rebuild `thinx_api` (~6 min) but never change live labels; live labels
  change only via service updates. The mirror staleness gate must stay green.

</code_context>

<specifics>
## Specific Ideas

- "ssh tunnel only" — the operator already manages the swarm over `ssh root@188.166.23.244 -p2020`
  with `DOKey2`; the dashboard should ride that plane, not a public hostname. Keep the UI reachable
  for humans via port-forward, keep JSON for gates.
- Requirements-literal pass bar for the scan, but the stricter observations (redirect gaps, no-SNI
  behaviour, CBC tolerance) are reported so Phase 34 can pick them up.
- Verify the committed password against the live hash and record MATCH/NO MATCH — the operator wants
  to know whether the literal in `traefik.sh` was ever live, even though the middleware is going away.
- Everything that touches `acme.json` is preceded by a 600-root out-of-git snapshot, and only one
  low-value routed host is sacrificed for the renewal proof.

</specifics>

<deferred>
## Deferred Ideas

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

### Reviewed Todos (not folded)
- `2026-10-03-apikey-hash-credential-and-storage.md` (0.7), `2026-10-03-mqtt-device-writes-gated.md` (0.5),
  `2026-10-03-console-notification-delivery-gaps.md`, `2026-10-03-transfer-accept-not-bound-to-recipient.md`,
  `2026-10-04-multi-file-ota-update-multiple-broken.md` (0.3 each), `2026-10-03-transfer-continuity-leftovers.md` (0.2)
  — all matched on the keyword/area "api" only; application-layer items unrelated to the Traefik edge.
  Not folded (same disposition as Phases 30–32).

</deferred>

---

*Phase: 33-dashboard-lockdown-tls-hardening*
*Context gathered: 2026-10-08*
