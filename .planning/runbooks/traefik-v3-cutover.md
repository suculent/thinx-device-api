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
