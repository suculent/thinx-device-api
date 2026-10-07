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
| **A — pre-cutover bridge (safe under v2.11, may run before the window)** | `docker service update --label-add traefik.swarm.network=traefik-public <svc>` on all 16 traefik-enabled services, KEEPING `traefik.docker.network` | none: v2.11 ignores `traefik.swarm.*`; v3 ignores `traefik.docker.*`; carrying both bridges the network label with a zero-length window — **CORRECTION (31-03 live, 2026-10-07 22:05Z): the second half is FALSE.** The v3 swarm provider refuses any service carrying both `traefik.docker.*` and `traefik.swarm.*` labels (`ERR Skip container error="both Docker and Swarm labels are defined" providerName=swarm`) and discovers nothing from it. Under v2.11 the bridge is harmless (confirmed live 21:53-22:04Z), but Stage C MUST land in the same breath as B1/B2, or Stage A must not be done at all (rename in B2 instead). See "Live cutover record". |
| **B1 — the hop (maintenance window)** | `docker service update --image traefik:v3.7.14 --args '<17 converted flags>' --label-rm traefik.docker.network --label-add traefik.swarm.network=traefik-public traefik_traefik` | the only one-way step; every router with an unqualified ref is enabled immediately; `thinx-api-https`, `thinx-api-ws`, `thinx-console-https` are in error state until B2 lands (seconds) |
| **B2 — immediately after B1** | `docker service update --label-add traefik.http.routers.thinx-api-https.middlewares=sslheaders@swarm,security-headers@swarm --label-add traefik.http.routers.thinx-api-ws.middlewares=sslheaders@swarm thinx_api` then `docker service update --label-add traefik.http.routers.thinx-console-https.middlewares=security-headers@swarm thinx_console` | closes the B1 window; `--label-add` on an existing key overwrites the value |
| **Post-B2 gate (Plan 03 checklist item)** | re-run the router status filter from the boot-and-discover section against the **live** v3 service's `/api/http/routers` (the live service has no `--api.insecure`, so read it through the `admin-auth`-protected `traefik-public-https` router on `:443`, never by adding `--api.insecure` live): `jq -r '.[] \| select(.status!="enabled") \| .name + "  " + .status'` — **MUST print nothing**. This closes the 31-01 Task 3 "every router enabled" criterion deferred by operator decision A (2026-10-07). Any line printed = a dangling ref B2 missed -> fix with another `--label-add`, or roll back per 31-02. | none: read-only |
| **C — post-cutover cleanup (any time after B)** | `docker service update --label-rm traefik.docker.network <svc>` on the other 15 services | none: the label is unread by v3 — **CORRECTION (31-03 live): NOT "any time" and NOT "unread".** While a service carries both label keys the v3 swarm provider skips it entirely, so after B1 every bridged service is undiscovered (all web hosts 404) until C removes `traefik.docker.network`. C is part of the cutover, not cleanup: run it detached immediately after B2 (15 label-only updates took 4 s live; no task restarts). |

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
(parent `3e048a5`, the P30 end state). The command block stays at **17** flags — two removed
(`--providers.docker`, `--providers.docker.swarmmode`), two added (`--providers.swarm`,
`--core.defaultRuleSyntax=v2`); nothing else in the block moved (count corrected by 31-02 from the
mirror: `grep -c '^ *- --' docker-compose.traefik.yml` = 17; the earlier "18" was an off-by-one):

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
| args | 19 (17 converted + probe-only `--api.insecure=true` + probe-only `--certificatesresolvers.le.acme.caserver=<staging>`; count corrected by 31-02) |

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
  on production). **DEFERRED by operator decision A (2026-10-07, blocking-human checkpoint):** the
  3 disabled routers are accepted as the tracer's falsification record (the designed detection
  working as intended); no production label is touched and the probe is not re-run. The gate
  re-runs **after Plan 03 Stage B2** against the live v3 service — the `/api/http/routers` status
  filter MUST print nothing there (see the "Post-B2 gate" row in the cutover-mechanism table). The
  alternative zero-window bridge (unqualified refs, noted under "Cutover mechanism") was NOT chosen.
- ACME neutralized, production `acme.json` untouched, probe torn down: PASS.

---

## Pre-cutover rollback snapshot (31-02 Task 1, D-02 / T-31-03, 2026-10-07 20:38 UTC)

### Why this section exists

D-02 is "staged-ready, roll back only on regression". The return path must be able to put the
**working v2.11 edge** back in one command, with **cert continuity**: a rollback that loses the live
`acme.json` forces 24 fresh ACME issuances and trips the Let's Encrypt duplicate-certificate rate
limit (RESEARCH Pitfall 3, T-31-03). So the cert store and the resolved service spec are captured
out-of-git on `micro` immediately before the hop, next to the P30 snapshot, and the redacted twin is
committed as `traefik-edge.C.pre.yml`. **No live service was mutated by this task** — every command
below is a read or a copy into `/mnt/data/edge-rollback/`.

### Precondition (read-only, 20:36 UTC)

```
ssh micro "docker service inspect traefik_traefik --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} args={{len .Spec.TaskTemplate.ContainerSpec.Args}}'"
# expect: traefik:v2.11@sha256:d57faa4f… args=17   (the Plan 03 cutover has NOT happened)
ssh micro "stat -c '%a %U' /mnt/data/edge-rollback/"
# expect: root-owned; P30 dir traefik-2026-10-06/ present beside it
```

Observed: `traefik:v2.11@sha256:d57faa4f…`, `args=17`, publishes `80 443`, task `traefik_traefik.1`
on `micro` Running 8 h (not restarted since the P30 cycle); `/mnt/data/edge-rollback/` `755 root`
holding `traefik-2026-10-06/` (`700 root`) and `traefik-p30-prerolldemo-20261007T125012Z.json`
(`600 root`); live `acme.json` `301146 1791377596 600 root` — size and mtime identical to the 31-01
teardown baseline, i.e. no ACME activity since. PASS.

### Capture (on `micro`, `umask 077`; real values never leave the host)

```
ssh micro "D=/mnt/data/edge-rollback/traefik-2026-10-07; mkdir -p \$D; chmod 700 \$D; \
  cp -a /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json \$D/acme.json; chmod 600 \$D/acme.json"
# expect: dir 700 root; acme.json 600 root, byte-identical to the live named-volume file
ssh micro "docker service inspect traefik_traefik > /mnt/data/edge-rollback/traefik-p31-precutover-<UTC>.json; chmod 600 …"
# expect: 600 root; full spec (Args, Labels, Mounts, Configs, Networks, Endpoint) — belt-and-suspenders restore source
ssh micro "{ …docker service inspect --format over Args / Endpoint.Ports / Spec.Labels / ContainerSpec.Env / Mounts / Configs / Networks / Placement; \
  docker config inspect tls-config-1 --format '{{json .Spec.Data}}' | tr -d '\"' | base64 -d; } > \$D/resolved-snapshot.yml; chmod 600 \$D/resolved-snapshot.yml"
# expect: 600 root; keys service/image/rollback_image_tag/resolved_command/resolved_published_ports/resolved_labels/resolved_env/resolved_mounts/resolved_configs/resolved_networks/resolved_placement/resolved_tls_toml
```

| Artifact (out-of-git on `micro`, referenced by path only) | Mode | Observed |
|---|---|---|
| `/mnt/data/edge-rollback/traefik-2026-10-07/` | `700 root` | newest `traefik-*/` dir (`ls -d … \| sort \| tail -1`) |
| `/mnt/data/edge-rollback/traefik-2026-10-07/acme.json` | `600 root` | `cmp` against the live named-volume file: **identical**; `jq '.le.Certificates \| length'` = **24** (matches `traefik-acme-inventory.2026-10-06.md`) |
| `/mnt/data/edge-rollback/traefik-2026-10-07/resolved-snapshot.yml` | `600 root` | 92 lines; `resolved_command` = **17** args (the v2.11 set), `resolved_labels` carries the real `admin-auth` hash (1 key), `resolved_env` empty, `resolved_tls_toml` = the `tls-config-1` body |
| `/mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json` | `600 root` | valid JSON; `.[0].Spec.TaskTemplate.ContainerSpec.Args` length **17**; image `traefik:v2.11@sha256:d57faa4f…` |

These files hold REAL resolved secrets (the ACME email, the `admin-auth` apr1 hash, raw `acme.json`
private keys). They are **never** committed and **never** scp'd into any repo (P29 D-12). The P30
snapshot `traefik-2026-10-06/` stays in place as the older fallback; the 2026-10-07 dir is the
Plan 31-02 rollback target because its `acme.json` is the newest confirmed-identical copy.

### Committed redacted twin — `swarm-configs/traefik-edge.C.pre.yml`

Next letter in the `traefik-edge.*` series (A = P29 reconciliation, B = P30 pilot-token cutover, C =
P31 v3 hop). Structured exactly like `traefik-edge.B.pre.yml`: resolved command in live order, mounts,
configs, networks, deploy labels, `tls.toml` body, entrypoint map, direct-publish model. Every secret
is the literal `<redacted>`, `${EMAIL}` / `${USERNAME}` / `${DOMAIN}` / `${CONFIG}` stay templated.
Checked against the live inspect on `micro` (redaction applied on the host with `sed` before the
output was read): the 17 Args and the 27 `traefik.*` label keys/values are identical to
`traefik-edge.B.post.yml` — the P30 end state is still the live state, so `.C.pre` ≡ `.B.post` apart
from its header comments. Secret-marker scan over the committed file (apr1 / bcrypt hash prefixes,
PEM armor headers): **0** hits.

### Post-task no-side-effect check

```
ssh micro "docker service inspect traefik_traefik --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'; docker service ps traefik_traefik --filter desired-state=running --format '{{.Name}} {{.Node}} {{.CurrentState}}'"
# expect: traefik:v2.11@sha256:d57faa4f…; traefik_traefik.1 micro "Running 8 hours ago" (same task, not restarted)
```

Observed: image unchanged, `traefik_traefik.1 micro Running 8 hours ago` — the same task as before
the capture; the live edge was not updated, restarted or re-scheduled by Task 1.

---

## Rollback (v3 -> v2.11) — staged-ready, D-02 (31-02 Task 2, dry-verified 2026-10-07 20:42-20:45 UTC)

**Status: STAGED-READY, not executed.** Per D-02 this return path is executed for real **only if the
Plan 31-03 cutover shows a regression** (triggers below). Nothing in this section has touched the
live `traefik_traefik` service; the quoting and the command shapes were proven on isolated
scaled-to-zero throwaway services with FAKE values, exactly as P30 did before its live D-06 cycle.
Non-executable audit record — the `ssh micro "…"` lines carry the `# expect:` convention; on the
executor the `micro` alias is the operator endpoint from `~/.aliases`.

**Rollback target (what "v2.11" means here):** the known-good edge is the image that has been serving
production since Phase 29 — `traefik:v2.11@sha256:d57faa4f71afd4e29e6204de6535816a6f9b18402b2e21c3b8411ae9884c3a8e`
(image id `32c7339c302b…`, created 2026-04-29), the digest the committed `traefik:v2.11.0` line of
`thinx-swarm/traefik.yml` resolved to on `micro` and the one `traefik-edge.{A,B,C}.pre/post.yml` all
record. On `micro` that image is present **by digest only** (`docker image inspect` finds it; the
tag `traefik:v2.11.0` is not present locally, and neither is `traefik:v3.7.14` until Plan 03 pulls
it). The rollback therefore names the **digest form** so the recovery path needs **no registry pull**
and returns the exact binary that was running (P30 D-06 rolled back with this same reference). The
tag form `traefik:v2.11.0` is the committed-file spelling of the same target (D-03) — usable if
Docker Hub is reachable, but it would fetch and run a v2.11 build this edge has never run.

### Snapshot the rollback keys to (31-02 Task 1, out-of-git on `micro`, by path only)

| Input | Path |
|---|---|
| cert store (24 certs, byte-identical to live at capture) | `/mnt/data/edge-rollback/traefik-2026-10-07/acme.json` (600 root) |
| resolved v2.11 command / labels / env / tls.toml | `/mnt/data/edge-rollback/traefik-2026-10-07/resolved-snapshot.yml` (600 root) |
| full `docker service inspect traefik_traefik` (the `--args` source) | `/mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json` (600 root) |
| older fallback (P30) | `/mnt/data/edge-rollback/traefik-2026-10-06/` + `traefik-p30-prerolldemo-20261007T125012Z.json` |

### Return path — ordered (acme.json FIRST, then the hop revert, then the label revert)

**Step 0 — pre-check (read-only).**
```
ssh micro "stat -c '%a %U' /mnt/data/edge-rollback/traefik-2026-10-07/acme.json /mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json"
# expect: 600 root / 600 root
ssh micro "docker service inspect traefik_traefik --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} args={{len .Spec.TaskTemplate.ContainerSpec.Args}}'"
# expect (regressed state): traefik:v3.7.14… args=17 — confirms you are rolling back FROM the hop, not from v2.11
```

**Step 1 — restore the cert store BEFORE the retag (Pitfall 3 / T-31-03).**
```
ssh micro "cp -a /mnt/data/edge-rollback/traefik-2026-10-07/acme.json \
  /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json"
# expect: 600 root, 301146 bytes; the restarted v2.11 task reads the restored store and serves every host
#         instantly — no ACME re-challenge, no Let's Encrypt duplicate-certificate rate limit
```
Why first: `acme.json` round-trips v2<->v3 in format (RESEARCH §Rollback Safety), but restore-from-
snapshot beats trusting v3's in-place writes. If v3 issued or renewed anything during the window
that issuance is discarded — one cert re-issued later under v2.11 is cheap; 24 re-issuances is the
rate limit. The volume is the authoritative store (`services/traefik/update.sh:37`); the task picks
the file up at start, so the restore must land before Step 2 recreates the task.

**Step 2 — the ONE COMMAND: image retag + static `--args` revert (undoes Stage B1).**
```
ssh micro "docker service update \
  --image traefik:v2.11@sha256:d57faa4f71afd4e29e6204de6535816a6f9b18402b2e21c3b8411ae9884c3a8e \
  --args \"\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(@sh) | join(\" \")' \
            /mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json)\" \
  --label-add traefik.docker.network=traefik-public \
  traefik_traefik"
# expect: converges to exactly 1 running task on micro; Image = the d57faa4f digest; Args = the 17-flag v2.11 set
#         (--providers.docker / .constraints / .exposedbydefault=true / .swarmmode — NO --providers.swarm, NO --core.*);
#         served cert valid off the restored acme.json; :80/:443 still the only published ports
```
- The `--args` string is rebuilt **on `micro`** from the full-spec backup: `jq … map(@sh)` single-
  quotes each element, which is exactly what `docker service update --args` (shlex) expects, so the
  backtick-bearing `--providers.docker.constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)`
  and the resolved `${EMAIL}` land verbatim without ever being typed or printed. (v2.11 does not know
  `--providers.swarm*` or `--core.defaultRuleSyntax`; both are gone from the restored set.)
- `--label-add traefik.docker.network=traefik-public` puts the v2 docker-provider network key back on
  the traefik service; `traefik.swarm.network` is left in place (v2.11 ignores it) so the label has a
  zero-length window — same bridge as Stage A, mirrored. Optional later: `--label-rm traefik.swarm.network`.
- Image: digest reference => no tag resolution, no pull. Do not add `--force`; the image/args delta
  already recreates the task.

**Step 3 — app-stack label revert (undoes Stage B2; label-only, no task restart).**
```
ssh micro "docker service update \
  --label-add traefik.http.routers.thinx-api-https.middlewares=sslheaders@docker,security-headers@docker \
  --label-add traefik.http.routers.thinx-api-ws.middlewares=sslheaders@docker thinx_api"
ssh micro "docker service update \
  --label-add traefik.http.routers.thinx-console-https.middlewares=security-headers@docker thinx_console"
# expect: both updates complete with no task restart (.Spec.Labels is outside TaskTemplate); under v2.11 the
#         docker provider re-resolves sslheaders@docker / security-headers@docker and the three routers serve again
```
- Stage A labels (`traefik.swarm.network` on all 16) are **not** touched — v2.11 ignores them.
- **Only if Stage C already ran** — **it HAS (31-03, 2026-10-07 22:06:39Z), so this step is now mandatory** (it removed `traefik.docker.network` from the other 15 services):
  re-add it on the five multi-network services, which the v2 docker provider needs to pick the
  `traefik-public` address — `docker service update --label-add traefik.docker.network=traefik-public <svc>`
  for `thinx_api`, `thinx_mosquitto`, `thinx_couchdb`, `thinx_influxdb`, `swarmpit_app` (Step 2
  touches only `traefik_traefik`, so this is the place). The eleven single-network services can
  stay without it (auto-selection has one candidate).

**Step 4 — verify the restored v2.11 edge (the P30 matrix, verbatim).**
```
ssh micro "docker service inspect traefik_traefik --format '{{len .Spec.TaskTemplate.ContainerSpec.Args}}'"            # expect: 17
ssh micro "docker service inspect traefik_traefik --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}' | grep -c 'providers.swarm'"   # expect: 0
ssh micro "docker service inspect traefik_traefik --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}' | grep -c 'thxp.address=:7442'" # expect: 1
ssh micro "docker service ps traefik_traefik --filter desired-state=running -q | wc -l"                                 # expect: 1
ssh micro "curl -sS -o /dev/null -w '%{http_code}' https://<host>/"            # app / console / rtm / thinx.cloud: 200
ssh micro "curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' http://<host>/"   # console / rtm / thinx.cloud: 301 -> https; app: 200 by design
ssh micro "echo | openssl s_client -connect app.thinx.cloud:443 -servername app.thinx.cloud | openssl x509 -noout -checkend 0"  # expect: valid
ssh micro "timeout 5 bash -c 'exec 3<>/dev/tcp/127.0.0.1/<port>'"            # :7442 / :1883 / :8883 expect OPEN (direct publish, unaffected either way)
ssh micro "stat -c '%s %a %U' /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json"  # expect: 301146 600 root
```
`mosquitto` caveat (carried): `--filter name=thinx_mosquitto`, the service filter is prefix-matched.

### Regression triggers (when Plan 03 executes this for real)

Any one of: the B1 task does not converge (v3 crash-loop / parse error — then Step 1 is still done,
Step 2 is the whole rollback, Step 3 is moot); the post-B2 router filter prints a router no further
`--label-add` fixes; the HTTPS matrix returns non-200 on app/console/rtm/landing or the redirect hosts
stop redirecting; the served cert fails `checkend 0`; the dashboard router (`admin-auth`) stops
answering. `:7442` / `:1883` / `:8883` are published directly by `thinx_api` / `thinx_mosquitto` and
cannot regress from the hop (D-05) — if they are closed, look at those services, not at traefik.

### Dry-verify record (isolated throwaways, FAKE values, 2026-10-07)

Two throwaway services, both `--replicas 0`, pinned to a non-existent node label
(`node.labels.gsd_never_schedule == true`), no published ports, no mounts, no overlay network,
`--no-resolve-image` (nothing pulled), labelled `gsd.purpose=rollback-dry-verify`; ACME email
`rollback-dryrun@example.invalid`. Tasks ever scheduled: **0** and **0**. Torn down the same minute.

| Check | Run A (literal 17-flag string, `--image traefik:v2.11.0`) | Run B (the Step 2 form: digest image + `jq … map(@sh)` from a fake-email copy of the backup) |
|---|---|---|
| throwaway pre-state | `traefik:v3.7.14`, 17 args (`--providers.swarm` first), `traefik.swarm.network` set, `traefik.docker.network` absent | same |
| post-rollback image | `traefik:v2.11.0` (tag, unresolved) | `traefik:v2.11@sha256:d57faa4f…` — equals the running digest: **yes** |
| post-rollback args | 17 | 17 |
| args vs the LIVE v2.11 Args (email masked both sides, `diff`) | **IDENTICAL 17/17** | **IDENTICAL 17/17** |
| backtick constraint arg (`Args[1]`) | `--providers.docker.constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)` intact | intact |
| fake email landed verbatim (`Args[10]`) | yes | yes |
| network labels after | `docker.network=traefik-public`, `swarm.network` removed (`--label-rm` variant) | `docker.network=traefik-public` added, `swarm.network` kept (bridge variant, the documented Step 2) |
| B2-revert labels (second throwaway `gsd_rbdry_app`) | `thinx-api-https=sslheaders@docker,security-headers@docker`; `thinx-api-ws=sslheaders@docker`; `thinx-console-https=security-headers@docker` — `--label-add` overwrote the `@swarm` values | — |
| `acme.json` restore mechanics | `cp -a` snapshot -> scratch 700 dir: **600 root 301146**, `cmp` vs live volume file **identical**; scratch removed | — |
| live `traefik_traefik` before/after (image, arg count, `Version.Index`) | `traefik:v2.11@sha256:d57faa4f… args=17 v=38379257` -> **identical** | **identical** (`v=38379257`) |
| live task / `acme.json` after | `traefik_traefik.1 micro Running 8 hours ago`; `301146 1791377596 600 root` | same |
| throwaways / containers left | 0 / 0 | 0 |

Run A also exercised the plan's literal `traefik:v2.11.0` retag target; Run B is the form the
operator executes (no pull, exact binary). Both prove the `--args` quoting round-trips through
shlex with the backticks and the resolved email intact — the only thing P30 found could go wrong.

### Secret hygiene (P29 D-12)

The real ACME email and the `admin-auth` hash were read by `jq` on `micro` straight from the 600-root
backup into the `docker service update` argument vector and never printed; the dry-run used a
fake-email copy under `umask 077` in `/tmp`, deleted at teardown. This runbook carries templated
`${VAR}` forms and out-of-git paths only; the committed `traefik-edge.C.pre.yml` is the redacted
twin of the snapshot.

---

## Live cutover record (31-03 Task 2, 2026-10-07 21:53 - 22:11 UTC)

**Outcome: the production edge runs `traefik:v3.7.14` (swarm provider + `core.defaultRuleSyntax=v2`).
Route parity, cert continuity and the direct-publish device paths are asserted below. Rollback was NOT
needed and remains staged-ready (with Step 3's Stage-C clause now mandatory).** The hop cost a
**~2-minute web outage (22:04:50Z - 22:06:45Z)** that the mechanism table had not predicted — root
cause and correction under "Deviation". The legacy device/MQTT ports were unaffected throughout
(published directly by `thinx_api` / `thinx_mosquitto`, D-05).

Operator gate: Task 1 `checkpoint:decision` -> **proceed** (2026-10-07, blocking-human, orchestrator).
Executor: `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020` (= `micro`), one `docker service update` per
step, no `docker stack deploy`, no `restart.sh`. The dashboard `admin-auth` password was supplied by the
operator in `micro:/root/.p31-traefik-admin` (600 root), read into a shell variable on the host only,
verified against the live apr1 hash (`MATCH`, `/api/overview` 200 under v2.11 at 22:04Z) and the file
deleted at the end of the task. No secret value appears in any output, log or committed file (P29 D-12).

### Timeline (UTC, 2026-10-07)

| Time | Stage | Command / observation |
|---|---|---|
| 21:52 | v2.11 baseline matrix | https app/console/rtm/thinx.cloud/swarmpit **200**; http console/rtm/thinx.cloud/swarmpit/micro **301** -> https; http app **200** (by design); https micro **401** unauth (dashboard); cert Let's Encrypt `YR2`, Sep 29 -> Dec 28 2026; `:7442/:1883/:8883` OPEN |
| 21:53 | **A** | `--label-add traefik.swarm.network=traefik-public` on all 16 traefik-enabled services, `traefik.docker.network` kept; every task id unchanged; traefik still `v2.11@d57faa4f`, `Version.Index 38379296` |
| 21:57 | v2.11 device-flow baseline | harness over `http://rtm.thinx.cloud:7442` + `mqtt://thinx.cloud:1883` **PASS**; over `https://app.thinx.cloud` **PASS**; WS upgrade probe `https://rtm.thinx.cloud/` 200 (v2.11 tolerated the dual labels for 11 min — the bridge IS safe under v2) |
| 22:04:09 | pre-B1 re-check | image `d57faa4f`, 17 args, `Version.Index 38379296`, ports 80/443, task Running 9 h; `acme.json` `301146 1791377596 600 root`; snapshot files 600 root; `traefik:v3.7.14` present (`5a93040e…`); dry-printed rebuilt args **index-exact 17/17** vs `docker-compose.traefik.yml` (email masked), swarm x3 / docker x0 / BC x1 / thxp x1 |
| **22:04:47** | **B1** | `docker service update --detach --image traefik:v3.7.14 --args "$(jq … map(@sh) …)" --label-rm traefik.docker.network traefik_traefik` -> rc 0 (args rebuilt on micro from the 600-root backup, indexes 0-3 rewritten) |
| 22:04:50 | — | v2.11 task shut down (`accept tcp … use of closed network connection` for each entrypoint in its last log lines) |
| 22:04:51 | — | v3.7.14 task **Running** on micro (converged in ~4 s, no crash-loop); v3 rewrote `acme.json` once at start (22:04:53) |
| 22:04:52 | **B2a** | `--label-add thinx-api-https.middlewares=sslheaders@swarm,security-headers@swarm --label-add thinx-api-ws.middlewares=sslheaders@swarm thinx_api` -> converged, no task restart |
| 22:04:57 | **B2b** | `--label-add thinx-console-https.middlewares=security-headers@swarm thinx_console` -> converged. **B1 -> B2 window: 10 s** |
| 22:05:18 | gate attempt 1 | router filter printed nothing — but every `/api/*` path answered **`404 page not found`** (no router matched at all); log: `ERR Skip container error="both Docker and Swarm labels are defined" providerName=swarm` repeated for every bridged service (105 lines by 22:06) |
| 22:06:35 | regression confirmed | https app/console/rtm **404**. Decision: Stage C immediately (staged command set, label-only, no restarts) before considering rollback |
| 22:06:35-39 | **C** | `docker service update --detach --label-rm traefik.docker.network <svc>` on the 15 services still carrying it (downtime, errorpage, fotostim x2, igraczech, landing, registry, swarmpit_app, syxra, thinx_api/console/couchdb/influxdb/mosquitto/vue) — 4 s total |
| 22:06:48 | recovery | https app/console/rtm/thinx.cloud **200**; filter empty; provider still re-polling (routers 17 -> 30 by 22:07:57). **Web outage ≈ 1 min 55 s.** 0 skip errors after C |
| 22:07:57 | **post-B2 gate** | filter printed **nothing**; `/api/overview`: http routers **30 / 0 errors / 0 warnings**, services **18 / 0**, middlewares **7 / 0**, tcp 0, providers `["Swarm"]`; `thinx-api-https@swarm enabled sslheaders@swarm,security-headers@swarm`, `thinx-api-ws@swarm enabled sslheaders@swarm`, `thinx-console-https@swarm enabled security-headers@swarm`; `@docker` strings in `/api/rawdata`: **0** |
| 22:07:57 | re-verify matrix | identical to baseline — see table below |
| 22:08 | device flow post-cutover | over `:7442`+`:1883` **PASS**; over `https://app.thinx.cloud` **PASS** (register, OTT 200, firmware 380048 B md5Match, MQTT connected + both ACL topics granted, publish OK, disconnect); WS probe 200 |
| 22:09 | acme.json continuity | 24/24 certificate blobs and 24/24 key blobs identical to the 31-02 snapshot; sole structural delta `le.Account.KeyType` dropped (= the 25-byte size change); served serial unchanged |
| 22:09:51 | capture | `traefik-edge.C.post.yml` captured, redacted on micro |
| 22:10:50 | plan `<verify>` | V1-V6 PASS (see "Acceptance") |

**Deferred 31-01 Task 3 criterion CLOSED: post-B2 router filter printed nothing at 22:07:57Z** (first
clean read after Stage C; the 22:05:18Z read was vacuous — the API itself was unrouted).

Router count note: 30, not the probe's 32 — the probe ran `--api.insecure=true`, which adds
`api@internal` + `dashboard@internal` (and 2 internal middlewares: 7 vs 9). Services 18 = 18. The 30
names are exactly the probe's set minus those two.

### Re-verify matrix (22:07:57Z, live v3.7.14) vs v2.11 baseline (21:52Z)

| Check | v2.11 baseline | v3.7.14 live | Verdict |
|---|---|---|---|
| https app / console / rtm / thinx.cloud / swarmpit | 200 / 200 / 200 / 200 / 200 | 200 / 200 / 200 / 200 / 200 | identical |
| https micro (dashboard, unauth) | 401 | 401 | identical |
| http console / rtm / thinx.cloud / swarmpit / micro | 301 -> https://<host>/ | 301 -> https://<host>/ | identical |
| http app | 200 (by design) | 200 | identical |
| cert app.thinx.cloud | LE `YR2`, Sep 29 05:50:34 -> Dec 28 05:50:33 2026 | issuer `C=US, O=Let's Encrypt, CN=YR2`, **serial `051152D5A20BE36DEFA1B6FA83379CE42809`** = snapshot cert serial; `checkend 0` valid | no re-issuance |
| cert rtm.thinx.cloud | — | serial `0535CC0C71E39D9378E72893F3A2141267B0` = snapshot; Dec 28 05:49:53 2026 | no re-issuance |
| `:7442` / `:1883` / `:8883` TCP accept | OPEN | OPEN (also during the web outage: direct publish) | unaffected |
| `thinx_api` / `thinx_mosquitto` published ports | 7442 / 1883,1884,8883 | 7442->7442 / 1883->1883 1884->1884 8883->8883 | unchanged |
| `traefik_traefik` | `v2.11@d57faa4f`, 17 args, ports 80 443, `Version.Index 38379296` | `traefik:v3.7.14`, **17** args, ports **80/443 only**, `Version.Index 38379311`, 1 running task on micro | as designed |
| Args grep | docker x4, swarm x0 | `providers.swarm` x3, `providers.docker` **0**, `core.defaultRuleSyntax=v2` x1, `thxp.address=:7442` x1 | as designed |
| `acme.json` | `301146 1791377596 600 root` | `301121 1791410693 600 root` — v3 one-time rewrite, contents proven identical (above) | continuity |
| WS upgrade probe `https://rtm.thinx.cloud/` | 200 | 200 | identical |
| Stage C task ids (15 services) | — | pre-C == post-C for all 15 (label-only; e.g. `thinx_api 76cqo59s…`, `thinx_mosquitto siy2hyda…`) | no restarts |
| Backend URLs (`/api/http/services`) | probe: all `10.0.1.x` | all 15 backends on `traefik-public` `10.0.1.0/24` (`thinx-api -> 10.0.1.83:7442`) | T-31-10 OK |
| Label state | 16 `traefik.swarm.network`, 16 `traefik.docker.network`, 3 `@docker` refs | 16 / **0** / **0** | end state |

### Deviation

**[Rule 3 - Blocking] Stage C pulled forward into the cutover; ~2-minute web outage.** The mechanism
table (31-01) stated that v3 "ignores `traefik.docker.*`", so Stage A carried both network-label keys as
a zero-window bridge and Stage C was scheduled as "any time after B" cleanup. Live, Traefik v3's swarm
provider rejects a service that defines both `traefik.docker.*` and `traefik.swarm.*` labels (`Skip
container error="both Docker and Swarm labels are defined"`), so after B1 all 15 bridged services were
undiscovered: every web host answered `404 page not found` from 22:04:50Z (v2 task gone) until the
provider picked up Stage C (22:06:39-22:06:48Z). The traefik service itself was fine (B1 removed its
docker key) but its dashboard router was the only one left, which is why the 22:05:18Z filter read was
vacuous. Fix: Stage C executed immediately (detached, 15 label-only updates, 4 s, no task restarts) —
inside the staged command set, no mechanism change, so no Rule-4 stop; rollback was not needed. Both
mechanism-table rows carry a **CORRECTION** marker. Lesson for any future repeat (and for the P33/P34
edits): under v3, never let a traefik-enabled service carry both key families, even briefly.

Pre-existing, not caused by the hop: the one ACME log line after start is the renewal retry for the
long-expired external cert #15 (`checkout.qooldata.com`, DNS -> 217.11.249.139, inventory
`traefik-acme-inventory.2026-10-06.md`, P33 item). Single attempt, same failure as under v2.11; not a
re-challenge storm (24/24 certs unchanged). Stale bookkeeping label `com.docker.stack.image=traefik:v2.11@…`
remains on `traefik_traefik` (only a stack deploy rewrites it; cosmetic, noted in `C.post.yml`).

### Acceptance (plan Task 2 `<verify>`, run 22:10:50Z)

| # | Check | Result |
|---|---|---|
| V1 | live Args contain `--providers.swarm` and `--core.defaultRuleSyntax=v2` | PASS |
| V2 | no `--providers.docker` in live Args | PASS |
| V3 | `openssl … app.thinx.cloud:443 … -checkend 0` | PASS (`Certificate will not expire`) |
| V4 | https app/console/rtm/thinx.cloud all 200 | PASS |
| V5 | `:7442` / `:1883` / `:8883` accept TCP on micro | PASS |
| V6 | `thinx_api` publishes 7442; `thinx_mosquitto` publishes 1883/8883 | PASS |
| V7 | `traefik-edge.C.post.yml` committed, 0 hash/key markers | PASS (grep count 0 at commit) |
| — | exactly one running `traefik_traefik` task | PASS (1) |

### Live production state at hand-off (for the Task 3 human-verify gate)

`traefik_traefik`: `traefik:v3.7.14` (digest `e849695b…`), 17 args, ports 80/443 only, 1 task
`traefik_traefik.1` on `micro`, `Version.Index 38379311`, `acme.json` `301121 1791410693 600 root`
(24 certs). Snapshot/backups untouched on micro. **Rollback (if the operator sees a regression):**
runbook §Rollback Steps 1 -> 2 -> 3 above, Step 3 INCLUDING the five `--label-add
traefik.docker.network=traefik-public` re-adds (`thinx_api thinx_mosquitto thinx_couchdb thinx_influxdb
swarmpit_app`) because Stage C has run; `traefik.swarm.network` may stay (v2.11 ignores it — proven
live 21:53-22:04Z).
