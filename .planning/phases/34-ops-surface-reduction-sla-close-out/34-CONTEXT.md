# Phase 34: Ops Surface Reduction & SLA Close-out - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Close v1.15 on the Traefik edge (`traefik_traefik` on micro, source of truth `thinx-swarm/traefik.yml`):

1. **EDGE-OPS-01** — production log level and access-log hygiene (no secrets in edge logs).
2. **EDGE-OPS-02** — Traefik reaches the Docker API only through a read-only socket-proxy; the raw
   `/var/run/docker.sock:ro` bind is gone.
3. **EDGE-OPS-03** — the 5-minute push → CI → Swarmpit SLA measured end-to-end through the migrated edge;
   swarm runbook updated.

Plus three groups of Phase 33 carry-overs the operator folded in (D-17..D-24): the `tls-config-3` bundle
(WR-03 HSTS into the file provider + Go-default curves), WR-04 + `:80` redirect gaps, and operator cleanup
(WR-02 credential rotation, retired-ACME prune, WR-05 vault.yml re-pin).

**Out of this phase:** real client IPs / host-mode publishing and any `ipAllowList` / `rateLimit` (deferred),
`sniStrict=true`, Swarmpit's own raw `docker.sock` mount, `:7442` / plain MQTT (never touched — AGENTS.md).

**Starting state differs from the requirement text:** EDGE-OPS-01 says "reduce from DEBUG"; the live flag is
already `--log.level=ERROR` (Phase 29–33 history). The requirement is satisfied by moving to WARN (D-01).

</domain>

<decisions>
## Implementation Decisions

### Log level & access log (EDGE-OPS-01)
- **D-01:** `--log.level=ERROR` → **`--log.level=WARN`**. WARN surfaces provider/label warnings (missing port,
  router conflicts) — needed to diagnose the D-07 socket-proxy cutover — without INFO reload noise.
- **D-02:** Access log is **kept**, switched to **JSON** (`--accesslog.format=json`) with
  **`RequestPath` dropped** (`--accesslog.fields.names.RequestPath=drop`; also drop any field that carries
  the query string, e.g. `RequestQuery`/`RequestAddr` variants, if the researcher finds one in v3.7.14).
  Header fields stay at the default `drop`. Reason: query strings carry secrets — `GET /device/firmware?ott=…`
  (`lib/router.deviceapi.js:16`), OAuth `?code=`, reset/activation keys — and Traefik cannot redact only
  the query. Retained fields (host, method, status, router, service, duration, size) are the debugging trail;
  path-level debugging moves to the API's own (already redacted) logs.
- **D-03:** Log change is **its own first stage** (Stage A, one `--args` update, ~4 s restart, own gate and
  one-command rollback), before the socket-proxy stage so WARN output is live during that cutover.
- **D-04:** Proof of "free of secrets" = **canary + grep**: after Stage A send a request with a unique fake
  `?ott=CANARY<rand>` (and a fake `Authorization: Bearer CANARY…` header) to a public host, then
  `docker service logs traefik_traefik --since …` must show **0** hits for the canary and 0 for
  `Authorization`/`Basic `/`Bearer `. Record counts only, never values.

### Socket-proxy (EDGE-OPS-02)
- **D-05:** Image = **researcher picks, DHI-first**: a `dhi.io` hardened socket-proxy if one exists (matches
  couchdb/influxdb/redis practice), else **`wollomatic/socket-proxy`** (Go, distroless, per-method regex
  allow-list). Pin **by tag** (never `@sha256`, P31 D-03 / influx precedent), grype-scan, record the choice
  and findings count.
- **D-06:** Placement & network: proxy runs on **micro** (`node.labels.Traefik==true`, same node as Traefik;
  both nodes are managers), on a **new dedicated `internal: true` overlay** (e.g. `traefik-socket`) attached
  ONLY to `traefik_traefik` and the proxy — never on `traefik-public` (the external fotostim/igraczech/syxra
  stacks share that network). Traefik gets `--providers.swarm.endpoint=tcp://<proxy>:2375`. Proxy mounts
  `/var/run/docker.sock` read-only itself.
- **D-07:** Deploy path = **repo-first + `docker service create`**: proxy service + network defined in
  thinx-swarm `traefik.yml` (mirrored by `scripts/generate-traefik-mirror.js` → `MIRROR OK`), then created live
  with `docker network create` + `docker service create` whose flags match the YAML. The Traefik cutover is
  **one** `docker service update --network-add … --mount-rm /var/run/docker.sock --args …`. Never
  `docker stack deploy` / `restart.sh` (live-only secret mounts).
- **D-08:** Allow-list = **GET-only, provider minimum**: only the read endpoints the v3 swarm provider calls
  (version/info/_ping, services, tasks, networks, events, nodes if required — researcher verifies against
  v3.7.14 source/behaviour). All POST/PUT/DELETE and all other GETs (secrets, configs, containers, exec…)
  denied. Gate: a POST and a `GET /secrets` through the proxy are refused (403/405).
- **D-09:** The raw `/var/run/docker.sock:ro` bind is **removed in the same update** that sets the tcp
  endpoint. Rollback = one pre-written command (re-add mount, drop endpoint flag, `--network-rm`).
  — **Reversibility:** reversible — one `docker service update`.
- **D-10:** Auto-revert triggers for the proxy stage = **standard P32/P33 set** (any router not
  `status==enabled`; HTTPS matrix code differs from baseline; `rtm` WS upgrade probe fails) **plus**: any
  `providers.swarm` / `Cannot connect` / `permission denied` / `403` line at WARN+ in Traefik logs within 60 s,
  or a router count differing from the pre-stage inventory (P33 end state: 29). After passing, a **live
  provider test**: add a harmless label to one traefik-enabled service and confirm Traefik reloads through
  the proxy (then remove it).

### SLA close-out (EDGE-OPS-03)
- **D-11:** "Edge change" = a **normal `thinx_api` push routed through the edge**: a signed, non-empty
  evidence commit to `thinx-staging` (no `[skip ci]`) through the real CircleCI → private registry →
  Swarmpit autoredeploy pipeline. A thinx-swarm edge change has no CI and is not timed as an SLA.
- **D-12:** Clock = **`git push` → new build served via the edge**. Stop condition: `https://rtm.thinx.cloud`
  answers 200 through Traefik from the new task (version/digest marker — researcher finds the observable
  one), WS probe OK, router inventory all enabled. Record the three-leg split: CI build (push → registry
  `push_end`), `push_end` → task Running, task Running → served via Traefik. **Pass ≤ 300 s.**
- **D-13:** SLA run happens **last**, after all edge stages (final edge = WARN, JSON log, proxy, tls-config-3).
  One run; on a miss, re-run once before declaring a fail, and report which leg was slow.
- **D-14:** Documentation (all four):
  - `.planning/runbooks/swarm.md` — replace the `push_end → task Running` SLA recipe with the end-to-end gate
    (D-12) and the measured number;
  - socket-proxy ops section (failure mode: Traefik keeps its last config but stops seeing new/changed services;
    health check, restart, rollback to raw socket, where defined);
  - `AGENTS.md` edge notes: Traefik reads Docker only via the proxy (never re-add `docker.sock`), log WARN,
    access log drops `RequestPath`; update the Traefik section's flag count;
  - close the `## Recorded for Phase 34` list in `.planning/runbooks/traefik-edge-hardening.md` item by item
    (done / deferred with pointer).

### Folded P33 carry-overs
- **D-15:** **tls-config-3 bundle** (one config rotation, one restart, README §TLS options mechanics: bump
  `CONFIG` → `docker config create tls-config-3` from micro's ff-merged checkout →
  `--config-rm tls-config-2 --config-add source=tls-config-3,target=/traefik/tls.toml,mode=0444`):
  - **WR-03:** define `[http.middlewares.security-headers.headers]` (browserXssFilter, contentTypeNosniff,
    forceSTSHeader, frameDeny, stsIncludeSubdomains, stsPreload, stsSeconds = 31536000 — same values as today)
    in `traefik/tls.toml`; switch the entrypoint default to `security-headers@file` **in the same `--args`
    update** as the config swap;
  - **curves:** remove `curvePreferences` so the Go default (incl. X25519MLKEM768 PQ hybrid) returns;
  - **sniStrict stays `false`** (no evidence about no-SNI legacy clients; ingress NAT hides who they are).
- **D-16:** The **`security-headers@swarm` copy is retired**: remove its middleware labels from
  `traefik_traefik` and every per-router `@swarm` reference (grep thinx.yml/docker-swarm.yml **and** the live
  external stacks) after verifying the header is emitted **exactly once** on every HTTPS host. Order: config
  swap + `@file` default first, label removal after (label-only, no restart).
- **D-17:** **WR-04 + `:80` redirect gaps** (label-only, repo-first in BOTH `docker-swarm.yml` and thinx-swarm
  `thinx.yml`, router-inventory gated): `thinx-db-http` middlewares → `https-redirect` only (no Basic challenge
  over plaintext; `couch-auth` stays on the https router); `registry-http` gets `https-redirect`.
  **`thinx-api-http` stays plaintext on purpose** (legacy `__DISABLE_HTTPS__` devices) — no entrypoint-level
  redirect.
- **D-18:** **WR-02 credential rotation** of the `couch-auth` / `influx-auth` basic-auth pair: operator
  supplies the new password; `openssl passwd -apr1` → `.env` on micro → `--label-add …basicauth.users=…`
  on `thinx_couchdb` (and influx if still routed), values over ssh stdin only, never printed or committed;
  one "credential rotated on <date>; historic literal dead" line in `traefik.sh`/README.
  **No git history rewrite.** Needs a `checkpoint:human-action` for the secret.
- **D-19:** **Prune the retired thinx ACME entries** (chronograf, replica, ssl, vvv, test, ctf24, micro + their
  `landing`/`www` SANs) via the P33 Stage E procedure (snapshot 600 root under `/mnt/data/edge-rollback/` →
  `jq del` → `chmod 600` → `mv` → `--force`, one remote command). Verify none has a router first (none should
  be re-requested). — **Reversibility:** reversible — snapshot restore.
- **D-20:** **WR-05 vault.yml: re-pin** `vault:1.5.5` to a maintained `hashicorp/vault` tag (tag pin); keep the
  file deploy-safe (b04f066). Repo-only — no live vault service exists, nothing deployed.

### Claude's Discretion
- Exact stage order between the folded items, as long as: Stage A (logs) is first, the proxy stage
  precedes the SLA run, the SLA run is last, and every static change is one `--args`/config update with its
  own gate + rollback (P33 D-10 pattern).
- Whether D-17 labels and D-16 label removal batch into one label-only pass.
- Proxy service/network names, proxy resource limits, healthcheck form.
- How to locate the "served new build" marker for D-12.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — EDGE-OPS-01/02/03; out-of-scope table (`:7442` hard constraint).
- `.planning/ROADMAP.md` → `### Phase 34` — goal + 3 success criteria.
- `.planning/runbooks/traefik-edge-fixforward.md` — rows #6/#7 (log level, socket) belong to this phase.

### Prior-phase decisions carried forward
- `.planning/phases/33-dashboard-lockdown-tls-hardening/33-CONTEXT.md` — D-02 loopback `mgmt` API path (gate
  access), D-10 one-stage-per-concern, D-13 file provider / tls.toml, D-17 HSTS entrypoint default, D-26..D-29
  scan + evidence, D-30 auto-revert triggers.
- `.planning/phases/33-dashboard-lockdown-tls-hardening/33-REVIEW.md` + `33-REVIEW-DISPOSITION.md` — WR-02..WR-05.
- `.planning/phases/32-v3-native-syntax-bc-removal/32-CONTEXT.md` — D-04 repo-first, D-10 revert style, D-12 credential hygiene.
- `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-CONTEXT.md` — D-03 image pin by tag, never `@sha256`.
- `.planning/phases/29-edge-reconciliation-source-of-truth/29-CONTEXT.md` — D-10..D-12 secret handling.

### Runbooks
- `.planning/runbooks/traefik-edge-hardening.md` — gate recipes, mechanism table, stage records, ordered revert
  set, **`## Recorded for Phase 34`** (the list D-14 closes; WR-02..WR-05 procedures quoted there).
- `.planning/runbooks/swarm.md` — SLA verification recipe (replaced by D-12), Traefik source-of-truth chain.
- `.planning/runbooks/swarmpit-upgrade.md` § Gate procedure — existing push-and-observe mechanics.
- `.planning/runbooks/traefik-v3-cutover.md` — §Boot-and-discover throwaway probe (validate new flags / tls.toml / proxy endpoint before live).
- `.planning/runbooks/swarm-configs/README.md` — capture rules (no secrets).

### Source of truth & deploy mechanics
- `~/Repositories/thinx-swarm/traefik.yml` — static command (`--log.level=ERROR`, `--accesslog`, `--providers.swarm`
  without endpoint, `docker.sock:ro` volume), `configs: tls-config-${CONFIG:-2}`.
- `~/Repositories/thinx-swarm/traefik/tls.toml` — D-15 target; `~/Repositories/thinx-swarm/README.md` §TLS options.
- `~/Repositories/thinx-swarm/{thinx.yml,registry.yml,vault.yml,traefik.sh}` — D-17/D-18/D-20 edits.
- `/mnt/gluster/deployment/swarm` on micro = git checkout of thinx-swarm; update by ssh push + `--ff-only` (no GitHub access, no CI).
- `docker-swarm.yml` (this repo) — must stay identical to thinx-swarm `thinx.yml` labels (D-17).
- `docker-compose.traefik.yml` — generated mirror; `scripts/generate-traefik-mirror.js` / `scripts/check-traefik-mirror.js` → `MIRROR OK`.
- `scripts/traefik-edge-scan.sh` — external scan; rerun after D-15/D-16 for HSTS-once + curves evidence.
- `lib/router.deviceapi.js:16` — `?ott=` in the firmware URL (D-02 rationale).
- `AGENTS.md` — micro ssh form, keep-7442, Traefik dashboard/API section (D-14 update target).

### Upstream documentation (verify every flag)
- https://doc.traefik.io/traefik/ — v3 `log`, `accessLog` (`format`, `fields.names`, `fields.headers`), `providers.swarm.endpoint`, file-provider `http.middlewares`, `tls.options.curvePreferences`.
- Chosen socket-proxy's README (allow-list syntax) + Traefik's documented Docker API calls for the swarm provider.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- P31–P33 surgical-update machinery: ordered `docker service update --args`, `--label-add/--label-rm`,
  `--config-rm/--config-add`, `Version.Index` recording, 600-root backups on micro, `# expect:` convention.
- Router-inventory gate over the loopback mgmt API (`docker exec … wget -qO- http://127.0.0.1:8080/api/http/routers`).
- HTTPS matrix + WS probe from P33 D-30; `scripts/traefik-edge-scan.sh` (`EDGE-SCAN OK`).
- Device-flow harness (`thinx-mcp-device` / `mcp__thinx-device__*`) for the keep-7442 regression check.
- Stage E ACME procedure (snapshot → `jq del` → `chmod 600` → `mv` → `--force`) for D-19.
- Swarmpit push-and-observe recipe (swarm.md) as the base for D-12.

### Established Patterns
- Repo first in thinx-swarm, then exactly one live `docker service update` per concern; never `stack deploy`/`restart.sh` on the edge.
- Images pinned by tag (DHI preferred); grype scan recorded.
- Secrets over ssh stdin only, never printed, never committed; captures redacted.
- Every thinx-swarm commit followed by `MIRROR OK`.

### Integration Points
- `traefik_traefik` spec (args, mounts, networks, configs, labels) on micro.
- New proxy service + `internal` overlay on micro.
- `thinx_couchdb` / registry labels (D-17/D-18); external stacks only if they reference `security-headers@swarm` (D-16).
- CircleCI `thinx-staging` pipeline + Swarmpit autoredeploy (D-11/D-12).

</code_context>

<specifics>
## Specific Ideas

- Canary value pattern for D-04: `CANARY` + random suffix, both in a query string and an `Authorization` header.
- SLA evidence: one table with git push time, CI `push_end`, task Running, first served-via-edge 200, and the three deltas.

</specifics>

<deferred>
## Deferred Ideas

- **Real client IPs** (host-mode publishing of `:80/:443` on micro or PROXY protocol) and the **`ipAllowList`**
  on ops hosts with operator IPs `86.49.234.236`, `194.213.34.194`, `194.213.34.193` → own phase / backlog
  (operator chose not to fold, 2026-10-09). Rate limits likewise.
- **`sniStrict=true`** — stays deferred until evidence about no-SNI clients exists.
- **Entrypoint-level `:80`→`:443` redirect** — not done; `thinx-api-http` must stay plaintext for legacy devices.
- **Swarmpit's raw `docker.sock` mount** — outside EDGE-OPS-02 (Traefik only).
- **HSTS preload-list submission**, **management VPN** — product decisions, not scheduled.
- **git history rewrite** of the old basic-auth literal in thinx-swarm — rejected (rotation makes it dead).

### Reviewed Todos (not folded)
- `2026-10-03-apikey-hash-credential-and-storage.md` (0.7), `2026-10-03-transfer-accept-not-bound-to-recipient.md` (0.5),
  `2026-10-04-builder-cmd-sh-evals-repository-thinx-yml.md` (0.4), `2026-10-03-console-notification-delivery-gaps.md` (0.3)
  and the other keyword-only matches — application/builder-layer items unrelated to the Traefik edge; same
  disposition as Phases 30–33.

</deferred>

---

*Phase: 34-ops-surface-reduction-sla-close-out*
*Context gathered: 2026-10-09*
