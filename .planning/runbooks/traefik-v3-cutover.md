# Traefik edge — v2.11 -> v3 cutover (Phase 31 / EDGE-MIG-02, backward-compat mode)

**Started:** 2026-10-07 (Plan 31-01). Appended by Plans 31-02 (rollback snapshot) and 31-03 (live cutover).
**Scope:** the one-way image hop `traefik:v2.11` -> `traefik:v3.7.14` with the backward-compat switch
`core.defaultRuleSyntax=v2` (routing-rule syntax stays v2; native v3 rules are Phase 32).

**Redaction + non-executable (per `swarm-configs/README.md`).** This is an audit record, NOT a
script — do not execute it. Secrets are shown as `<redacted>`; `${VAR}` is kept templated. The
`admin-auth` / `couch-auth` / `influx-auth` basic-auth hashes, the resolved ACME email and the raw
`acme.json` key material are **never** written here (P29 D-12). The live commands below use the
`ssh micro "…"` form and the `# expect:` convention from `swarm.md`; on the executor host the `micro`
alias resolves to the operator's SSH endpoint from `~/.aliases`.

---

## Rename inventory + cutover-mechanism decision (31-01 Task 1, read-only audit, 2026-10-07)

### Why this section exists

The v3 binary splits the Docker provider: `--providers.docker` + `--providers.docker.swarmmode`
become a separate `--providers.swarm` provider, and every resource it discovers is namespaced
`@swarm` instead of `@docker`. Two classes of **app-stack** label therefore break at the hop,
independently of the `core.defaultRuleSyntax=v2` switch (which only rescues rule syntax):

1. fully-qualified middleware references `…@docker` become dangling -> the referencing router goes to
   an error state and stops serving (T-31-01, T-31-07);
2. `traefik.docker.network=<net>` is a docker-provider label the swarm provider does not read; it
   wants `traefik.swarm.network=<net>`. On a service attached to more than one overlay network the
   provider then picks a network on its own and can route to an unreachable IP (T-31-05).

RESEARCH left one CRITICAL open question: which thinx-stack file is the authoritative live source
(`thinx-swarm/thinx.yml`, which `restart.sh` deploys, vs this repo's `docker-swarm.yml`). It is
resolved below from `docker service inspect` on the manager.

### Evidence — live inspect (read-only)

```
ssh micro "docker service inspect <svc> --format '{{json .Spec.TaskTemplate.Networks}}'"
ssh micro "docker service inspect <svc> --format '{{range \$k,\$v := .Spec.Labels}}{{\$k}}={{\$v}}{{\"\n\"}}{{end}}' | grep traefik"
# all traefik-enabled services: iterate `docker service ls -q`, keep those with Spec.Labels["traefik.enable"]=="true"
```

Notes on the inspect itself: every `traefik.*` label lives in **`.Spec.Labels`** (service-level
labels, what the swarm provider reads); `.Spec.TaskTemplate.ContainerSpec.Labels` carries no
`traefik.*` label on any service. Overlay networks on the swarm: `traefik-public` (`yw26fv3f…`),
`thinx_internal` (`sa2mmi89…`), `swarmpit_net` (`rpnspo1y…`), plus `ingress`. Traefik placement:
`node.labels.Traefik == true` -> only `micro` carries the label (`core` does not); live image
`traefik:v2.11@sha256:d57faa4f…`; Docker engine `29.8.1`. No `traefik:v3*` image is present on
`micro` yet.

### Rename inventory — every live traefik-enabled service (16)

| Live service | Overlay networks (count) | docker-provider middleware refs (router -> ref) | `@swarm` target | `traefik.docker.network` label | -> `traefik.swarm.network` target | Source file(s) carrying the label |
|---|---|---|---|---|---|---|
| `thinx_api` | `thinx_internal`, `traefik-public` (**2**) | `thinx-api-https` -> `sslheaders@docker,security-headers@docker`; `thinx-api-ws` -> `sslheaders@docker` | `sslheaders@swarm,security-headers@swarm`; `sslheaders@swarm` | yes | `traefik.swarm.network=traefik-public` (**required**, multi-network) | `docker-swarm.yml:338,349,376` (= gluster `thinx.yml:231,242,262`); `thinx-swarm/thinx.yml:229,254` (stale — carries only `sslheaders@docker` on `thinx-api-https`, no `thinx-api-ws` router, no `security-headers` ref) |
| `thinx_console` | `traefik-public` (1) | `thinx-console-https` -> `security-headers@docker` | `security-headers@swarm` | yes | `traefik.swarm.network=traefik-public` (harmless, single-network) | `docker-swarm.yml:419,430` (= gluster `thinx.yml:305,316`); `thinx-swarm/thinx.yml:296` (stale — no `security-headers` ref) |
| `thinx_vue` | `traefik-public` (1) | **none** — live `thinx-vue-console-https` carries NO `middlewares` label (RESEARCH/PATTERNS assumed `security-headers@docker` here; the live inspect and `docker-swarm.yml:477-480` agree there is none) | n/a | yes | `traefik.swarm.network=traefik-public` (harmless) | `docker-swarm.yml:470`; `thinx-swarm/thinx.yml:345` |
| `thinx_mosquitto` | `thinx_internal`, `traefik-public` (**2**) | none (TCP router `mosquitto-secure`, no middleware) | n/a | yes | `traefik.swarm.network=traefik-public` (**required**, multi-network; the router is dead-by-design — `:8883` is published directly — so a mis-pick is cosmetic, P30 D-03) | `docker-swarm.yml:124`; `thinx-swarm/thinx.yml:44` |
| `thinx_couchdb` | `thinx_internal`, `traefik-public` (**2**) | none — `thinx-db-http` -> `couch-auth,https-redirect`, `thinx-db-https` -> `couch-auth,error-pages-middleware` are **unqualified** (same-provider, carry over unchanged) | n/a | yes | `traefik.swarm.network=traefik-public` (**required**, multi-network) | `docker-swarm.yml:184`; `thinx-swarm/thinx.yml:100` |
| `thinx_influxdb` | `thinx_internal`, `traefik-public` (**2**) | none — `thinx-influx-http` -> `https-redirect`, `thinx-influx-https` -> `influx-auth,error-pages-middleware` (unqualified) | n/a | yes | `traefik.swarm.network=traefik-public` (**required**, multi-network) | `docker-swarm.yml:544`; `thinx-swarm/thinx.yml:413` |
| `traefik_traefik` | `traefik-public` (1) | none (defines `admin-auth`, `https-redirect`, `security-headers`, `error-pages-middleware`; routers `traefik-public-http/https` use unqualified refs) | n/a | yes | `traefik.swarm.network=traefik-public` (own label) | `thinx-swarm/traefik.yml:27` (mirror `docker-compose.traefik.yml`) |
| `landing_landing` | `traefik-public` (1) | none (`landing-page-http` -> `https-redirect`, unqualified) | n/a | yes | `traefik.swarm.network=traefik-public` (harmless) | `thinx-swarm/landing.yml:36` |
| `errorpage_errorpage` | `traefik-public` (1) | none (`error-router` -> `error-pages-middleware`, unqualified; the middleware is defined BOTH here and on `traefik_traefik` — pre-existing duplicate, not touched) | n/a | yes | `traefik.swarm.network=traefik-public` (harmless) | `thinx-swarm/errorpage.yml:20` |
| `downtime_downtime` | `traefik-public` (1) | none (`downtime-http` -> `https-redirect`) | n/a | yes | `traefik.swarm.network=traefik-public` (harmless) | `thinx-swarm/downtime.yml:20` |
| `swarmpit_app` | `swarmpit_net`, `traefik-public` (**2**) | none (`swarmpit-http` -> `https-redirect`) | n/a | yes | `traefik.swarm.network=traefik-public` (**required**, multi-network) | `thinx-swarm/swarmpit.yml:28` (= gluster `swarmpit.yml`, P28 D-17 drift 0) |
| `registry_registry` | `traefik-public` (1) | none (`registry-http/https`, no middleware) | n/a | yes | `traefik.swarm.network=traefik-public` (harmless) | gluster `registry.yml` only — **no source in either repo** |
| `fotostim_landing-com` | `traefik-public` (1) | none (`fotostimcom-http` -> `https-redirect`) | n/a | yes | harmless | external stack — no source in either repo |
| `fotostim_landing-cz` | `traefik-public` (1) | none (`fotostimcz-http` -> `https-redirect`) | n/a | yes | harmless | external stack — no source in either repo |
| `igraczech-com_web` | `traefik-public` (1) | none (`igraczech-http` -> `https-redirect`) | n/a | yes | harmless | external stack — no source in either repo |
| `syxra-cz_web` | `traefik-public` (1) | none (`syxra-http` -> `https-redirect`) | n/a | yes | harmless | external stack — no source in either repo |

Not deployed (carry the rename harmlessly in the committed file, nothing live to update):
`thinx-swarm/thinx.yml:457` (`chronograf`, retired in Phase 27), `thinx-swarm/vault.yml:35` (vault
absent live, EDGE-02 empty edge).

**Complete `@docker` reference set = 3 labels on 2 services:** `thinx_api` `thinx-api-https`
(`sslheaders@docker,security-headers@docker`), `thinx_api` `thinx-api-ws` (`sslheaders@docker`),
`thinx_console` `thinx-console-https` (`security-headers@docker`). Everything else on the edge uses
unqualified references, which re-resolve inside the swarm provider unchanged.

**Open Question 2 graded (network label):** five live traefik-enabled services sit on **two**
overlay networks (`thinx_api`, `thinx_mosquitto`, `thinx_couchdb`, `thinx_influxdb` on
`thinx_internal`+`traefik-public`; `swarmpit_app` on `swarmpit_net`+`traefik-public`). For those the
`traefik.swarm.network` label is **strictly required** — without it the v3 swarm provider chooses a
network itself and can hand Traefik a `thinx_internal`/`swarmpit_net` IP it cannot reach from
`traefik-public` (502). For the other eleven the label is read-but-redundant (single network). The
rename is applied everywhere; the boot-and-discover probe (Task 3) reports which network v3
auto-selects for `thinx_api` without the label, as the arbiter for RESEARCH assumption A3.

### Authoritative live thinx-stack source — resolved

| Candidate | Traefik-label parity with the live services | Verdict |
|---|---|---|
| `micro:/mnt/gluster/deployment/swarm/thinx.yml` (mtime 2026-10-04 18:21; the file `restart.sh` / `thinx.sh` actually deploy when run from the gluster dir) | `diff` against `docker-swarm.yml`: 148 differing lines, **0** of them containing `traefik` — the diff is the `docker-swarm.yml` comment header + its top-level `secrets:` declarations only. Carries `thinx-api-ws` (`:258-264`), `sslheaders@docker,security-headers@docker` (`:242`), `security-headers@docker` on console (`:316`), 7 `traefik.docker.network` labels — exactly the live label set. | **matches live** (deploy copy) |
| `docker-swarm.yml` (this repo) | Every `traefik.*` label equals the live `Spec.Labels` of `thinx_api`/`thinx_console`/`thinx_vue`/`thinx_mosquitto`/`thinx_couchdb`/`thinx_influxdb` (checked label-by-label above); it is the committed twin of the gluster deploy copy (reconciled 2026-09-18, header says so). | **confirmed authoritative committed source** |
| `~/Repositories/thinx-swarm/thinx.yml` (committed, HEAD `3e048a5`) | 292 differing lines vs `docker-swarm.yml`; lacks the `thinx-api-ws` router, lacks `security-headers@docker` on `thinx-api-https` and `thinx-console-https`, carries only `sslheaders@docker` (`:254`) plus a dead `Upgrade=$http_upgrade` header label; still declares `chronograf` and `couchdb:3`. | **stale** — not a deploy source today (the gluster copy is what gets deployed); renamed anyway so a future sync cannot re-introduce `@docker` |

Also checked: `micro:/mnt/gluster/deployment/swarm/traefik.yml` (mtime 2026-10-07 12:03, the P30
deploy copy) equals `thinx-swarm/traefik.yml@3e048a5` except for the image line (`traefik:v2.11@sha256:d57faa4f…`
digest pin vs `traefik:v2.11.0`), i.e. the committed edge source is current.

**Decision:** the rename edit lands in **`docker-swarm.yml`** (authoritative, live-matching) and is
mirrored into **`thinx-swarm/thinx.yml` + `landing.yml`/`errorpage.yml`/`downtime.yml`/`swarmpit.yml`
(+ `vault.yml` harmlessly)** for the `traefik.docker.network` labels and the one `@docker` ref the
stale file carries. The traefik service's own label and static command change in
`thinx-swarm/traefik.yml` (the edge source of truth) and flow into `docker-compose.traefik.yml`
through the generator. The staleness of `thinx-swarm/thinx.yml` relative to live (missing ws router,
missing `security-headers` refs) is a pre-existing thinx-stack reconciliation gap, NOT fixed in P31
(out of scope: edge-static phase) — recorded as a deferred item; until it is reconciled, **nobody may
`docker stack deploy` from the `thinx-swarm` checkout** (Pitfall 5).

### Cutover mechanism — decision: ordered surgical `docker service update`, NOT a stack deploy

Even though one file (`docker-swarm.yml` ≡ gluster `thinx.yml`) matches live for every traefik
label, an atomic `docker stack deploy -c thinx.yml thinx` is rejected as the cutover vehicle:

- it redeploys all thinx services (api, worker, transformer, couchdb, influxdb, mosquitto, redis, …)
  for a label-only change — storage-bearing services included;
- the gluster `thinx.yml` has no top-level `secrets:` block, so a stack deploy **drops the live-only
  `INFLUXDB_TOKEN` mount on `thinx_api`** (Phase 27 finding, STATE.md) and stats go dark;
- `restart.sh` re-derives `HASHED_PASSWORD` interactively (`openssl passwd -apr1`) and resets the
  couch/influx edge auth hash (STATE.md "stack deploy & CouchDB DHI" note);
- four external stacks (`fotostim_*`, `igraczech-com_web`, `syxra-cz_web`) and `registry_registry`
  have no stack file in either repo at all — only a per-service update can touch their labels.

Chosen mechanism, in order (**traefik first, then app labels** — P30 D-06 discipline; each step is one
`docker service update`, no task restart for label-only changes because `.Spec.Labels` is outside
`TaskTemplate`):

| Stage | Command shape | Risk under the version running at that moment |
|---|---|---|
| **A — pre-cutover bridge (safe under v2.11, may run before the window)** | `docker service update --label-add traefik.swarm.network=traefik-public <svc>` on all 16 traefik-enabled services, KEEPING `traefik.docker.network` | none: v2.11 ignores `traefik.swarm.*`; v3 ignores `traefik.docker.*`; carrying both bridges the network label with a zero-length window |
| **B1 — the hop (maintenance window)** | `docker service update --image traefik:v3.7.14 --args '<18 converted flags>' --label-rm traefik.docker.network --label-add traefik.swarm.network=traefik-public traefik_traefik` | the only one-way step; every router with an unqualified ref is enabled immediately; `thinx-api-https`, `thinx-api-ws`, `thinx-console-https` are in error state until B2 lands (seconds) |
| **B2 — immediately after B1** | `docker service update --label-add traefik.http.routers.thinx-api-https.middlewares=sslheaders@swarm,security-headers@swarm --label-add traefik.http.routers.thinx-api-ws.middlewares=sslheaders@swarm thinx_api` then `docker service update --label-add traefik.http.routers.thinx-console-https.middlewares=security-headers@swarm thinx_console` | closes the B1 window; `--label-add` on an existing key overwrites the value |
| **C — post-cutover cleanup (any time after B)** | `docker service update --label-rm traefik.docker.network <svc>` on the other 15 services | none: the label is unread by v3 |

Rollback (Plan 31-02 stages it; P30 D-06 machinery): revert B1 (`--image traefik:v2.11.0 --args '<17 v2 flags>'`,
`acme.json` restored from the fresh snapshot) and B2 (`--label-add …@docker`); Stage A/C labels are
harmless in either direction, so the rollback never has to touch them.

Note for Plan 03 (not chosen here, plan locks `@swarm`): unqualified refs (`sslheaders,security-headers`)
would resolve inside whichever provider discovers the router and would make B2 unnecessary; the
plan's must-haves pin the `@swarm` form, so the committed files carry `@swarm` and the B1->B2 window
is accepted and timed instead.

### Secret hygiene check (P29 D-12)

The inspect output contained three live basic-auth hashes (`admin-auth`, `couch-auth`,
`influx-auth`); none is reproduced in this runbook or any committed file. Only label KEYS and
`${VAR}` templates appear here.

---

## Converted config + mirror regeneration (31-01 Task 2, 2026-10-07)

### `thinx-swarm/traefik.yml` — the forced static delta (D-04, RESEARCH rows 1-6)

Committed in the external edge source repo as **`thinx-swarm@5e19c0003eec49faaead6e365d6e5f198db25772`**
(parent `3e048a5`, the P30 end state). The command block went from 17 to **18** flags; nothing else
in the block moved:

| # | v2.11 (P30 end state, `traefik-edge.B.post.yml`) | v3 (committed now) |
|---|---|---|
| 1 | `--providers.docker` | `--providers.swarm` |
| 2 | `--providers.docker.constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)` | `--providers.swarm.constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)` (value byte-identical, backticks kept) |
| 3 | `--providers.docker.exposedbydefault=true` | `--providers.swarm.exposedbydefault=true` (**stays `true`** — P33 deferral) |
| 4 | `--providers.docker.swarmmode` | `--core.defaultRuleSyntax=v2` (BC switch, CLI form; takes the slot of the removed flag) |
| 5-10 | six `--entrypoints.*.address` (incl. `thxp=:7442`, vestigial `vpn`/`mqtt`/`mqtts` + their P30 D-03 comments) | **unchanged** |
| 11-13 | three `--certificatesresolvers.le.acme.*` | **unchanged** |
| 14-17 | `--accesslog`, `--log`, `--log.level=ERROR`, `--api` | **unchanged** |

No `--providers.swarm.endpoint` was added (Pitfall 2 — the default `unix:///var/run/docker.sock`
is the existing `docker.sock:ro` mount). The image line is `traefik:v3.7.14` (D-03 exact tag, never
`@sha256`; the previous `traefik:v2.11.0` line is kept commented as the rollback target). The
service's own `traefik.docker.network=traefik-public` deploy label became
`traefik.swarm.network=traefik-public`. `tls.toml` untouched (no forced v3 change). `${EMAIL}`,
`${USERNAME}`, `${HASHED_PASSWORD}`, `${DOMAIN}`, `${CONFIG}` stay templated. The pre-existing
duplicate `traefik-public-https.middlewares` label key (`admin-auth` then
`admin-auth,error-pages-middleware`, last-wins) is carried unchanged.

### App-stack renames (same thinx-swarm commit + this repo)

| File | Change |
|---|---|
| `docker-swarm.yml` (this repo, authoritative) | `thinx-api-https.middlewares=sslheaders@swarm,security-headers@swarm`; `thinx-api-ws.middlewares=sslheaders@swarm`; `thinx-console-https.middlewares=security-headers@swarm`; `traefik.swarm.network=traefik-public` on mosquitto, couchdb, api, console, vue, influxdb (6 labels). `grep -v '^#' docker-swarm.yml \| grep -c traefik.docker.network` = **0**. |
| `thinx-swarm/thinx.yml` | `sslheaders@docker` -> `sslheaders@swarm` (`:254`); 7 network labels renamed (mosquitto, couchdb, api, console, vue, influxdb, chronograf-retired) |
| `thinx-swarm/landing.yml`, `errorpage.yml`, `downtime.yml`, `swarmpit.yml` | 1 network label each renamed |
| `thinx-swarm/vault.yml` | 1 network label renamed (carried harmlessly; vault is not deployed) |

No `--providers.docker*` flag, no `traefik.docker.network` label and no `@docker` reference
survives on a non-comment line in any committed file of either repo.

### Mirror regeneration (anti-drift spine)

```
node scripts/generate-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"
# MIRROR-GENERATED ok source=thinx-swarm@5e19c0003eec49faaead6e365d6e5f198db25772 -> docker-compose.traefik.yml
node scripts/check-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"
# MIRROR OK files=1   (exit 0)
```

New banner: `source: thinx-swarm@5e19c0003eec49faaead6e365d6e5f198db25772`,
`mirror-sha256:660e859ba13c0798e8c20981b9f00bcc69009be1e3fbe7c4e2437a4d3f3d863a`. The
entrypoint / ACME / log / api lines of the regenerated mirror are byte-identical to the previous
mirror (`diff` of those lines against `HEAD:docker-compose.traefik.yml` is empty). Secret-marker scan
(apr1 / bcrypt hash prefixes, PEM armor headers) over the mirror, `docker-swarm.yml` and this runbook:
**0** hits.

**Live state is untouched by Task 2:** the gluster deploy copies and the running services still
carry the v2 forms (`@docker`, `traefik.docker.network`, `traefik:v2.11`). The committed files are the
cutover target that Plan 31-03 applies per the staged mechanism above.

---

## Boot-and-discover (31-01 Task 3, D-01 tracer, 2026-10-07 ~20:20 UTC)

### Probe invocation (throwaway, no host ports, ACME neutralized — D-01a / T-31-02)

```
ssh micro "docker service create --name traefik_v3probe --detach \
  --constraint 'node.labels.Traefik == true' --network traefik-public \
  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly \
  --limit-memory 256M --label gsd.phase=31 --label gsd.purpose=boot-and-discover \
  traefik:v3.7.14 \
  --providers.swarm \
  '--providers.swarm.constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)' \
  --providers.swarm.exposedbydefault=true --core.defaultRuleSyntax=v2 \
  --entrypoints.http.address=:80 --entrypoints.https.address=:443 --entrypoints.vpn.address=:1194 \
  --entrypoints.mqtt.address=:1883 --entrypoints.mqtts.address=:8883 --entrypoints.thxp.address=:7442 \
  --certificatesresolvers.le.acme.email=\${EMAIL} \
  --certificatesresolvers.le.acme.storage=/tmp/acme-test.json \
  --certificatesresolvers.le.acme.tlschallenge=true \
  --certificatesresolvers.le.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory \
  --accesslog --log --log.level=ERROR --api --api.insecure=true"
# expect: converges to 1/1 (static config parsed); Endpoint.Ports == null; the only mount is docker.sock:ro
```

Differences from the committed command, all probe-only: `--api.insecure=true` (API on `:8080` inside
the task), ACME storage at the throwaway `/tmp/acme-test.json` (the shared
`traefik_traefik-public-certificates` volume is NOT mounted), and the Let's Encrypt **staging** CA so the
probe's inevitable, unanswerable TLS-ALPN challenges (no `:443` published) touch no production ACME
account or rate limit. `${EMAIL}` was read from the live service Args into a shell variable on `micro`
and never printed. The `tls.toml` config was not mounted (the static command does not load it — it
has no file provider; pre-existing, out of scope). The probe carries no `traefik.constraint-label`,
so neither the live v2.11 edge nor the probe itself discovers it.

| Pre-flight / convergence | Observed |
|---|---|
| production `acme.json` baseline (`stat -c '%s %Y %a %U'`) | `301146 1791377596 600 root` |
| live `traefik_traefik` | `traefik:v2.11@sha256:d57faa4f…`, 1 replica, 17 args, publishes `80 443` |
| `docker service create` | id `xhq81elykmdn…`, rc 0 |
| convergence | **`1/1` at t=10 s** (`Running 4 seconds ago`, node `micro`) — the v3 static config parsed, no crash-loop |
| `Endpoint.Ports` | `null` (no host port) |
| mounts | `[{bind /var/run/docker.sock -> /var/run/docker.sock ro}]` only |
| args | 19 (18 converted + `--api.insecure=true`) |

### Discovery — the gate

```
ssh micro "T=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_v3probe | head -1); \
  docker exec \$T wget -qO- http://localhost:8080/api/http/routers \
  | jq -r '.[] | select(.status!=\"enabled\") | .name + \"  \" + .status'"
# expect (post-cutover labels): nothing
```

**Observed (live labels still carry the v2 `@docker` refs — Task 2 changed committed files only):**
```
thinx-api-https@swarm  disabled
thinx-api-ws@swarm  disabled
thinx-console-https@swarm  disabled
```
`/api/overview`: HTTP routers total **32**, errors **3**, warnings 0; services **18**, errors 0;
middlewares **9**, errors 0; TCP routers **0**.

Full discovered-vs-expected comparison (`/api/http/routers`, `/api/tcp/routers`):

| Expected router (traefik-edge.A.pre.yml) | Discovered as | Status | Middlewares resolved | Error |
|---|---|---|---|---|
| thinx-api-http | `thinx-api-http@swarm` | **enabled** | — | |
| thinx-api-https | `thinx-api-https@swarm` | **disabled** | `sslheaders@docker,security-headers@docker` | `middleware "security-headers@docker" does not exist` |
| thinx-api-ws | `thinx-api-ws@swarm` | **disabled** | `sslheaders@docker` | `middleware "sslheaders@docker" does not exist` |
| thinx-console-http | `thinx-console-http@swarm` | **enabled** | `https-redirect@swarm` | |
| thinx-console-https | `thinx-console-https@swarm` | **disabled** | `security-headers@docker` | `middleware "security-headers@docker" does not exist` |
| thinx-vue-console-http / -https | both `@swarm` | **enabled** | `https-redirect@swarm` / — | |
| landing-page-http / -https | both `@swarm` | **enabled** | `https-redirect@swarm` / — | |
| error-router | `error-router@swarm` | **enabled** | `error-pages-middleware@swarm` | |
| swarmpit-http / -https | both `@swarm` | **enabled** | `https-redirect@swarm` / — | |
| downtime-http / -https | both `@swarm` | **enabled** | `https-redirect@swarm` / — | |
| traefik-public-http / -https | both `@swarm` | **enabled** | `https-redirect@swarm` / `admin-auth@swarm,error-pages-middleware@swarm` | |
| fotostimcom-http / -https (`fotostim_landing-com`) | both `@swarm` | **enabled** | | |
| fotostimcz-http / -https (`fotostim_landing-cz`) | both `@swarm` | **enabled** | | |
| igraczech-http / -https | both `@swarm` | **enabled** | | |
| syxra-http / -https | both `@swarm` | **enabled** | | |
| *(not in the A.pre list, discovered live)* registry-http / -https, thinx-db-http / -https (`couch-auth@swarm,…`), thinx-influx-http / -https (`influx-auth@swarm,…`) | all `@swarm` | **enabled** | unqualified refs re-resolved to `@swarm` | |
| api@internal, dashboard@internal | internal | enabled | | |
| TCP `mosquitto-secure` (mqtts) | **not discovered** | — | — | see note |

**Reading:** 29/32 routers enabled, every one of them with its middleware chain re-resolved inside
the swarm provider. The three disabled routers are **exactly** the three `@docker` labels Task 1
inventoried — no fourth dangling ref, no absent router, no error on any service or middleware. This
is the designed falsification (RESEARCH §Blast Radius): the swarm provider confirms the v2 provider
suffix is dead, and the error text names the three label values Plan 03 Stage B2 overwrites.
Everything the hop does NOT touch (unqualified refs, the four external stacks, registry, db/influx
basic-auth chains, the dashboard router) is proven enabled under v3.

**`mosquitto-secure` note (no regression):** `thinx_mosquitto` carries `traefik.enable=true` and the
TCP router/service labels but **no `traefik.constraint-label`** (confirmed by inspect) and no
`rule`; the provider constraint `Label(\`traefik.constraint-label\`, \`traefik-public\`)` filters it
out under v3 exactly as the identical v2 constraint does today. It was never a live Traefik router
(P30 D-03 "dead router"); the A.pre.yml row came from the service's labels, not from Traefik. `:8883`
stays published directly by `thinx_mosquitto` (D-05), unaffected.

### Services / network-label grading (Open Question 2, RESEARCH A3)

`/api/http/services` (all 18 **enabled**): `thinx-api@swarm -> http://10.0.1.83:7442`,
`thinx-console@swarm -> http://10.0.1.81:80`, `thinx-vue-console@swarm -> http://10.0.1.82:80`,
`thinx-db@swarm -> http://10.0.1.6:5985`, `thinx-influx@swarm -> http://10.0.1.67:8086`,
`swarmpit@swarm -> http://10.0.1.62:8080`, `registry@swarm -> http://10.0.1.22:5000`, landing /
errorpage / downtime / fotostim / igraczech / syxra on `10.0.1.x:80`, `traefik-public@swarm ->
http://10.0.1.86:8080`. `traefik-public` is `10.0.1.0/24`; `thinx_internal` is `10.0.2.0/24`
(`docker network inspect`). So for every multi-network service (`thinx_api`, `thinx_couchdb`,
`thinx_influxdb`, `swarmpit_app`) the v3 swarm provider **auto-selected the `traefik-public` address
even without `traefik.swarm.network`** — in this topology the missing label is harmless (A3 graded:
not a mis-pick today). The rename is still applied everywhere so the choice is explicit rather than
heuristic (the heuristic depends on network ordering, which is not contractual).

Backend reachability was not exercised from inside the probe: the executor's tool-permission
classifier denied the batch that `wget`'d the discovered `thinx-console`/`thinx-api` server URLs and
pulled `docker service logs` of the probe. The server URLs above sit on the probe's own overlay
(`traefik-public`), and the routers' `enabled` state plus the correct-subnet addresses are the
evidence recorded; the live HTTPS probes at the Plan 03 re-verify matrix are the definitive check.

### Teardown + no-side-effect checks

```
ssh micro "docker service rm traefik_v3probe"
ssh micro "docker service ls --filter name=traefik_v3probe --format '{{.Replicas}}'"   # expect: empty
ssh micro "stat -c '%s %Y %a %U' /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json"
# expect: 301146 1791377596 600 root (unchanged)
```

| Check | Observed |
|---|---|
| probe service after `rm` | **0** services, **0** containers |
| production `acme.json` | `301146 1791377596 600 root` — **byte-size and mtime identical to the baseline**; the probe never wrote it (no mount, throwaway storage, staging CA) |
| live `traefik_traefik` | still `traefik:v2.11@sha256:d57faa4f…`, 17 args, publishes `80 443`, task `traefik_traefik.1` on `micro` Running (7 h, not restarted) |
| live `:80`/`:443` service touched by Task 3 | **no** |

### Gate verdict for Plan 31-01

- v3.7.14 **boots** the converted config (1/1 in 10 s): PASS.
- Swarm provider discovers the **complete** router set (every A.pre router present except the
  never-discoverable `mosquitto-secure`, plus registry/db/influx): PASS.
- "Every router `enabled`": **3 predicted failures remain** — they are the live `@docker` labels,
  which can only be flipped at the cutover (flipping them under v2.11 breaks the same three routers
  on production). The gate therefore re-runs **after Plan 03 Stage B2** against the live v3 service
  (`/api/http/routers` filter must print nothing there), unless the operator chooses the zero-window
  bridge noted under "Cutover mechanism" (unqualified refs), which would let the probe pass before any
  cutover.
- ACME neutralized, production `acme.json` untouched, probe torn down: PASS.
