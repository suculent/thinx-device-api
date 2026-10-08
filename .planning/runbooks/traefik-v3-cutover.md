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
harmless in either direction, so the rollback never has to touch them — **CORRECTION (31-03 live,
2026-10-07 22:05Z): the last clause is FALSE.** The labels are harmless under v2.11 only; under v3 a
service carrying both `traefik.docker.*` and `traefik.swarm.*` is skipped outright (the Stage A/C rows
above). The rollback therefore MUST touch them, and in a fixed order: Rollback **Step 2** (the
combined `--label-rm traefik.swarm.network --label-add traefik.docker.network=traefik-public` flip on
the five multi-network services, run while v3 is still up) and the `--label-rm traefik.swarm.network`
folded into **Step 3**'s retag of `traefik_traefik`. Read "Re-hop precondition" under Regression
triggers before any second attempt at the hop from a rolled-back edge.

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

### Return path — ordered (acme.json FIRST, then the five-service network-label flip while v3 still runs, then the hop revert, then the app label revert, then verify)

Step order is load-bearing: **0 pre-check -> 1 `acme.json` restore -> 2 network-label flip on the five
multi-network services (v3 still running) -> 3 image retag + `--args` revert -> 4 app-stack `@docker`
label revert -> 5 verify.** Steps 2 and 4 were one prose bullet before the 31 review fix (WR-01);
Step 2 now runs BEFORE the retag so the restored v2.11 task never sees a multi-network service
without `traefik.docker.network`.

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
the file up at start, so the restore must land before Step 3 recreates the task.

**Step 2 — flip the network label on the five multi-network services BEFORE the retag (v3 still
running; reverses Stage C). MANDATORY — Stage C ran live (31-03, 2026-10-07 22:06:39Z), so these five
carry only `traefik.swarm.network` today.**
```
for s in thinx_api thinx_mosquitto thinx_couchdb thinx_influxdb swarmpit_app; do
  ssh micro "docker service update --detach --label-rm traefik.swarm.network \
    --label-add traefik.docker.network=traefik-public $s"
done
# expect: 5x rc 0; no task restarts (label-only — .Spec.Labels is outside TaskTemplate, task ids unchanged);
#         https app / console / rtm / thinx.cloud / swarmpit still 200 under v3 — the swarm provider auto-selects
#         traefik-public for all five without the label (31-01 probe + live "Backend URLs" row, all on 10.0.1.0/24)
ssh micro "docker service inspect <svc> --format '{{range \$k,\$v := .Spec.Labels}}{{\$k}}={{\$v}}{{\"\n\"}}{{end}}' | grep '\.network='"
# expect, for each of the five: exactly one line, traefik.docker.network=traefik-public (no traefik.swarm.network line)
```
- **Why before the retag:** v2.11's docker provider needs `traefik.docker.network` on a service attached
  to more than one overlay network to pick the `traefik-public` address. If the v2.11 task comes up
  first (the pre-WR-01 order), it chooses heuristically on these five and a `thinx_internal` /
  `swarmpit_net` pick yields 502 on `rtm` / `db` / `influx` / `swarmpit` until the label lands. Flipping
  first closes that window.
- **Why `--label-rm` + `--label-add` in ONE update:** v3's swarm provider skips any service carrying
  both key families (`ERR Skip container error="both Docker and Swarm labels are defined"` — the 31-03
  outage). A standalone `--label-add traefik.docker.network` under v3 would put five live services into
  exactly that dual-label state and drop them from routing. One atomic `.Spec.Labels` update never
  exposes it.
- **Why safe under v3 without `traefik.swarm.network`:** the 31-01 probe and the live post-cutover
  state proved the swarm provider auto-selects `traefik-public` for all five without the label. That
  heuristic depends on network ordering and is not contractual — do not linger; go straight on to Step 3.
- The eleven single-network services are **not** touched (they keep `traefik.swarm.network` only;
  v2.11 ignores it and auto-selection has one candidate).
- **Not dry-verified in this combined per-service form** (see the dry-verify table) — exercise it on a
  throwaway before relying on it.

**Step 3 — the ONE COMMAND: image retag + static `--args` revert (undoes Stage B1).**
```
ssh micro "docker service update \
  --image traefik:v2.11@sha256:d57faa4f71afd4e29e6204de6535816a6f9b18402b2e21c3b8411ae9884c3a8e \
  --args \"\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(@sh) | join(\" \")' \
            /mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json)\" \
  --label-rm traefik.swarm.network \
  --label-add traefik.docker.network=traefik-public \
  traefik_traefik"
# expect: converges to exactly 1 running task on micro; Image = the d57faa4f digest; Args = the 17-flag v2.11 set
#         (--providers.docker / .constraints / .exposedbydefault=true / .swarmmode — NO --providers.swarm, NO --core.*);
#         Spec.Labels: traefik.docker.network=traefik-public present, traefik.swarm.network ABSENT;
#         served cert valid off the restored acme.json; :80/:443 still the only published ports
```
- The `--args` string is rebuilt **on `micro`** from the full-spec backup: `jq … map(@sh)` single-
  quotes each element, which is exactly what `docker service update --args` (shlex) expects, so the
  backtick-bearing `--providers.docker.constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)`
  and the resolved `${EMAIL}` land verbatim without ever being typed or printed. (v2.11 does not know
  `--providers.swarm*` or `--core.defaultRuleSyntax`; both are gone from the restored set.)
- `--label-rm traefik.swarm.network --label-add traefik.docker.network=traefik-public` puts the v2
  docker-provider network key back on the traefik service and removes the swarm-provider key **in the
  same update — mandatory, not optional** (31 review fix, WR-02). v2.11 does not read `traefik.swarm.*`,
  so dropping it costs nothing now; leaving it would park `traefik_traefik` in the exact dual-label
  state that made v3 skip services after B1 (31-03 Deviation), waiting to bite any later re-hop. The
  pre-correction wording ("same bridge as Stage A, mirrored; optional later") is withdrawn. Dry-verify
  coverage: Run A exercised this `--label-rm`/`--label-add` pair on a throwaway, Run B the digest +
  `jq` rebuild; the two have not been exercised together in one command.
- Image: digest reference => no tag resolution, no pull. Do not add `--force`; the image/args delta
  already recreates the task.

**Step 4 — app-stack label revert (undoes Stage B2; label-only, no task restart).**
```
ssh micro "docker service update \
  --label-add traefik.http.routers.thinx-api-https.middlewares=sslheaders@docker,security-headers@docker \
  --label-add traefik.http.routers.thinx-api-ws.middlewares=sslheaders@docker thinx_api"
ssh micro "docker service update \
  --label-add traefik.http.routers.thinx-console-https.middlewares=security-headers@docker thinx_console"
# expect: both updates complete with no task restart (.Spec.Labels is outside TaskTemplate); under v2.11 the
#         docker provider re-resolves sslheaders@docker / security-headers@docker and the three routers serve again
```
- Network labels are **not** touched here. The Stage-C reversal (re-adding `traefik.docker.network` on
  the five multi-network services, which v2.11 needs to pick the `traefik-public` address) is
  **Step 2**, deliberately placed before the retag — do not repeat or defer it to this step. The eleven
  single-network services keep `traefik.swarm.network` only (v2.11 ignores it; one network candidate).

**Step 5 — verify the restored v2.11 edge (the P30 matrix, verbatim).**
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
Step 2 is still required if Stage C has run, Step 3 is the whole hop revert, Step 4 is moot); the
post-B2 router filter prints a router no further
`--label-add` fixes; the HTTPS matrix returns non-200 on app/console/rtm/landing or the redirect hosts
stop redirecting; the served cert fails `checkend 0`; the dashboard router (`admin-auth`) stops
answering. `:7442` / `:1883` / `:8883` are published directly by `thinx_api` / `thinx_mosquitto` and
cannot regress from the hop (D-05) — if they are closed, look at those services, not at traefik.

**Re-hop precondition (31 review fix, WR-02).** After a rollback, `traefik_traefik` (Step 3) and the
five multi-network services (Step 2) carry `traefik.docker.network` again, while the eleven
single-network services still carry only `traefik.swarm.network`. A second attempt at the hop must
fold Stage C into the same breath as B1: on every service that carries `traefik.docker.network` at
that moment, one combined `docker service update --detach --label-rm traefik.docker.network
--label-add traefik.swarm.network=traefik-public <svc>` (B1's own form already does this for
`traefik_traefik`), issued immediately after B1 — never as a separate later step, and never via the
Stage A dual-label bridge, because the v3 swarm provider skips any service carrying both key families
(31-03 Deviation). Walk all 16 traefik-enabled services and confirm the label state before B1 rather
than trusting this paragraph's count.

### Dry-verify record (isolated throwaways, FAKE values, 2026-10-07)

Two throwaway services, both `--replicas 0`, pinned to a non-existent node label
(`node.labels.gsd_never_schedule == true`), no published ports, no mounts, no overlay network,
`--no-resolve-image` (nothing pulled), labelled `gsd.purpose=rollback-dry-verify`; ACME email
`rollback-dryrun@example.invalid`. Tasks ever scheduled: **0** and **0**. Torn down the same minute.

| Check | Run A (literal 17-flag string, `--image traefik:v2.11.0`) | Run B (the Step 3 form: digest image + `jq … map(@sh)` from a fake-email copy of the backup) |
|---|---|---|
| throwaway pre-state | `traefik:v3.7.14`, 17 args (`--providers.swarm` first), `traefik.swarm.network` set, `traefik.docker.network` absent | same |
| post-rollback image | `traefik:v2.11.0` (tag, unresolved) | `traefik:v2.11@sha256:d57faa4f…` — equals the running digest: **yes** |
| post-rollback args | 17 | 17 |
| args vs the LIVE v2.11 Args (email masked both sides, `diff`) | **IDENTICAL 17/17** | **IDENTICAL 17/17** |
| backtick constraint arg (`Args[1]`) | `--providers.docker.constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)` intact | intact |
| fake email landed verbatim (`Args[10]`) | yes | yes |
| network labels after | `docker.network=traefik-public`, `swarm.network` removed (`--label-rm` variant) | `docker.network=traefik-public` added, `swarm.network` kept (bridge variant — the Step 3 form as documented BEFORE the WR-02 correction; Step 3 now mandates the Run A `--label-rm` form, so the digest + `jq` + `--label-rm` combination is not covered by either run) |
| Step 2 five-service flip (`--label-rm traefik.swarm.network --label-add traefik.docker.network=traefik-public` in one update on `thinx_api` / `thinx_mosquitto` / `thinx_couchdb` / `thinx_influxdb` / `swarmpit_app`) | **NOT dry-verified** — the step was added by the 31 review fix (WR-01) after these runs. Run A only shows the same `--label-rm` / `--label-add` key pair landing in one update on a throwaway *traefik*; the per-app-service form and its live-v3 expectation (no task restart, hosts still 200) have not been exercised. **To be dry-verified on a throwaway (`--replicas 0`, pre-seeded with `traefik.swarm.network`) before use.** | — |
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
needed and remains staged-ready (with the Stage-C reversal now its own mandatory Step 2, run before the
retag).** The hop cost a
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
runbook §Rollback Steps 1 -> 2 -> 3 -> 4 -> 5 above. Step 2 (the combined `--label-rm
traefik.swarm.network --label-add traefik.docker.network=traefik-public` flip on `thinx_api
thinx_mosquitto thinx_couchdb thinx_influxdb swarmpit_app`) is mandatory and runs BEFORE the Step 3
retag, because Stage C has run and v3 skips any dual-labelled service; `traefik.swarm.network` may
stay only on the eleven single-network services (v2.11 ignores it — proven live 21:53-22:04Z).

---

## Native v3 rules + BC-switch removal (Phase 32 / EDGE-MIG-03, 2026-10-08)

**Scope:** convert the four live routers that still use v2-only matcher syntax to native v3 syntax
(Stage 1, per-router `ruleSyntax=v3` override, label-only), remove `--core.defaultRuleSyntax=v2` from
the live static command (Stage 2, `--args` 17 -> 16, one task restart), then strip the four overrides
(Stage 3, label-only). Repo first for every stage (D-04): thinx-swarm commit -> origin push -> micro
fast-forward -> mirror regenerated + this repo committed -> THEN the matching `docker service update`.
Decisions D-01..D-12 in `32-CONTEXT.md`; signal inventory in `32-RESEARCH.md` §Q3. Executor host form
`ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020` (= `micro`); the dashboard `admin-auth` password lives
only in `micro:/root/.p32-traefik-admin` (600 root, operator-staged per D-12), read into a host-side shell
variable, verified against the live apr1 hash and shredded at the end of Plan 32-03. No secret value
appears here (P29 D-12).

The four v2-only routers (live inventory re-read 2026-10-08 13:44Z through the credentialed API — exactly
4 of 30, assumption #2 of the plan held):

| Router (service) | v2 rule (live before Stage 1) | priority | ruleSyntax (API) | Stage 1 v3 rule |
|---|---|---|---|---|
| `thinx-api-ws` (`thinx_api`) | ``Host(`rtm.thinx.cloud`) && HeadersRegexp(`Upgrade`, `(?i)websocket`)`` | 200 | `v2` (inherited) | ``Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)`` |
| `downtime-http` (`downtime_downtime`) | ``HostRegexp(`{host:.+}`)`` | 2 | `v2` (inherited) | ``PathPrefix(`/`)`` |
| `downtime-https` (`downtime_downtime`) | ``HostRegexp(`{host:.+}`)`` | 2 | `v2` (inherited) | ``PathPrefix(`/`)`` |
| `error-router` (`errorpage_errorpage`) | ``HostRegexp(`{host:.+}`)`` | 1 | `v2` (inherited) | ``PathPrefix(`/`)`` |

Priorities stay 1 / 2 / 200 (D-07 research verdict: explicit priorities are used verbatim in v3; rule
length is only consulted when no priority is set).

### Baseline (32-01 Task 1, 2026-10-08 13:44-13:46 UTC)

Every later gate compares against this table (values observed, not assumed).

| Check | Observed |
|---|---|
| D-12 credential `stat -c '%a %U %s' /root/.p32-traefik-admin` | `600 root 8`; apr1 check on micro `HASH=MATCH`; `/api/overview` -> `overview=200` |
| live `traefik_traefik` | `traefik:v3.7.14 args=17 idx=38379311`; task `i7tpgo7vv0vj traefik_traefik.1 micro Running 16 hours ago` (the P31 task, never restarted) |
| `/api/overview` (credentialed) | http routers **30 / 0 errors**, services 18, middlewares 7, providers `["Swarm"]` |
| v2-only inventory filter (`HeadersRegexp\|\{host:`) | exactly 4: `thinx-api-ws@swarm`, `downtime-http@swarm`, `downtime-https@swarm`, `error-router@swarm` — all `enabled`, `syn=v2`, p=200/2/2/1 |
| HTTPS matrix (from micro) | app / console / rtm / thinx.cloud / swarmpit **200**; micro **401** (dashboard, unauth) |
| HTTPS externals (Host() values read live from the `fotostimcom/fotostimcz/igraczech/syxra-https@swarm` rules) | fotostim.com, www.fotostim.com, fotostim.cz, www.fotostim.cz, igraczech.com, www.igraczech.com, www.syxra.cz **200**; `igraczech.unitednewschannel.net` **does not resolve** (curl `000`, DNS) — pre-existing, record only |
| HTTP redirect matrix | app **200** (by design); console / rtm / thinx.cloud / swarmpit / micro and all 7 resolvable externals **301 -> https://<host>/** |
| bare-IP pair (workstation) | `http://188.166.23.244/` -> **`301 https://188.166.23.244/`**; `https://188.166.23.244/ -k` -> **`200`** (downtime page, `server: nginx`) |
| hostless `GET / HTTP/1.0` on :80 | **`HTTP/1.0 404 Not Found`** (Traefik's own; D-06 expects this to change after Stage 1 — record only) |
| WS upgrade probe `--http1.1`, `Upgrade: websocket`, `Cookie: foo=bar`, `https://rtm.thinx.cloud/p32probe` | **`HTTP/1.1 401 Unauthorized`** + **`X-Forwarded-Proto: https`**, no `Server: nginx` |
| same with `Upgrade: WebSocket` (mixed case) | **`HTTP/1.1 401 Unauthorized`** + `X-Forwarded-Proto: https` |
| cert serials (`openssl s_client … x509 -serial -checkend 0`) | app `051152D5A20BE36DEFA1B6FA83379CE42809`, rtm `0535CC0C71E39D9378E72893F3A2141267B0`, both `Certificate will not expire` (= P31 record) |
| running task ids (`--filter desired-state=running`) | `thinx_api.1 9nitjbo580v8 micro` (Running 2 h); `errorpage_errorpage.1 5d7aukf4evft micro` (Running 24 min); `downtime_downtime.1 vzyg90j8f878 core` (Running 25 s) — see note |
| ports on micro (`/dev/tcp`) | `7442 OPEN`, `1883 OPEN`, `8883 OPEN` |
| published ports | `thinx_api 7442->7442`; `thinx_mosquitto 1883->1883 1884->1884 8883->8883` |
| device-flow harness (`thinx-device-flow.mjs`) | `p32-base-7442` over `http://rtm.thinx.cloud:7442` + `mqtt://thinx.cloud:1883` **PASS**; `p32-base-https` over `https://app.thinx.cloud` **PASS** |
| `acme.json` stat | `301121 1791410693 600 root` (unchanged since the P31 one-time rewrite), 24 certs |
| `traefik-edge.D.pre.yml` | captured 13:46:31Z, redacted on micro; body identical to `C.post.yml` (17 flags incl. the switch) |

**Task-id note (not caused by this phase):** the operator's thinx-swarm commit `498afa7` ("harden(nginx):
pin downtime/errorpage to nginx:1.31.3-alpine") rebuilt both images and Swarmpit autoredeploy
(`swarmpit.service.deployment.autoredeploy=true`) rolled `errorpage_errorpage` at 13:20:56Z and
`downtime_downtime` at 13:45:31Z — the latter while the baseline was being read, which is why one
`docker service ps` read showed no running downtime task. Both services were 1/1 again within seconds.
The Stage 1 "task id pre == post" gate therefore re-reads the id immediately before each update.

### Boot-and-discover (32-01 Task 1, D-02 tracer, 2026-10-08 13:48-13:52 UTC)

Proves the four candidate v3 rules on an isolated throwaway BEFORE any live router is touched. Two
corrections to the locked wording were applied (RESEARCH §Q2): the rules service runs at **1 replica**
(a 0-replica service has 0 tasks -> 0 routers -> a vacuous "pass", Pitfall 3), and the throwaway is
isolated by `traefik.constraint-label=p32-probe` so the live edge never discovers its catch-all
(Pitfall 4). The probe's constraint also admits `traefik-public` so Run A observes the live v2 routers
read-only (RESEARCH Open Q1).

```
ssh micro "docker service create --name p32-rules --detach --replicas 1 \
  --constraint 'node.labels.Traefik == true' --network traefik-public --limit-memory 16M \
  --label gsd.phase=32 --label gsd.purpose=rule-probe \
  --label traefik.enable=true --label traefik.constraint-label=p32-probe --label traefik.swarm.network=traefik-public \
  --label traefik.http.services.p32.loadbalancer.server.port=80 \
  --label 'traefik.http.routers.p32-ws.rule=Host(\`rtm.thinx.cloud\`) && HeaderRegexp(\`Upgrade\`, \`(?i)websocket\`)' \
  --label traefik.http.routers.p32-ws.entrypoints=https --label traefik.http.routers.p32-ws.priority=200 \
  --label traefik.http.routers.p32-ws.service=p32 --label traefik.http.routers.p32-ws.tls=true \
  --label 'traefik.http.routers.p32-downtime-http.rule=PathPrefix(\`/\`)' \
  --label traefik.http.routers.p32-downtime-http.entrypoints=http --label traefik.http.routers.p32-downtime-http.priority=2 \
  --label 'traefik.http.routers.p32-downtime-https.rule=PathPrefix(\`/\`)' \
  --label traefik.http.routers.p32-downtime-https.entrypoints=https --label traefik.http.routers.p32-downtime-https.priority=2 \
  --label traefik.http.routers.p32-downtime-https.tls=true \
  --label 'traefik.http.routers.p32-error-router.rule=PathPrefix(\`/\`)' \
  --label traefik.http.routers.p32-error-router.entrypoints=http --label traefik.http.routers.p32-error-router.priority=1 \
  alpine:3.20 sleep 3600"
# expect: 1/1; Endpoint.Ports == []; NO ruleSyntax label (the probe's default is v3, so `enabled` proves native-v3 parsing)
ssh micro "EMAIL=\$(docker service inspect traefik_traefik --format '{{range .Spec.TaskTemplate.ContainerSpec.Args}}{{println .}}{{end}}' | grep acme.email= | cut -d= -f2); \
  docker service create --name traefik_p32probe --detach \
  --constraint 'node.labels.Traefik == true' --network traefik-public \
  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly \
  --limit-memory 256M --label gsd.phase=32 --label gsd.purpose=boot-and-discover-v3-native \
  traefik:v3.7.14 \
  --providers.swarm \
  '--providers.swarm.constraints=Label(\`traefik.constraint-label\`, \`p32-probe\`) || Label(\`traefik.constraint-label\`, \`traefik-public\`)' \
  --providers.swarm.exposedbydefault=true \
  --entrypoints.http.address=:80 --entrypoints.https.address=:443 --entrypoints.vpn.address=:1194 \
  --entrypoints.mqtt.address=:1883 --entrypoints.mqtts.address=:8883 --entrypoints.thxp.address=:7442 \
  --certificatesresolvers.le.acme.email=\$EMAIL \
  --certificatesresolvers.le.acme.storage=/tmp/acme-test.json \
  --certificatesresolvers.le.acme.tlschallenge=true \
  --certificatesresolvers.le.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory \
  --accesslog --log --log.level=ERROR --api --api.insecure=true; unset EMAIL"
# expect: 1/1 in ~10 s; Endpoint.Ports == []; the only mount is docker.sock:ro; 18 args; NO --core.defaultRuleSyntax=v2
```

| Pre-flight / convergence | Observed |
|---|---|
| `docker service create` x2 (13:48:37Z) | `p32-rules` id `as03i2mo…` rc 0; `traefik_p32probe` id `zn99k2cp…` rc 0 |
| convergence | both **1/1 within ~25 s** (`p32-rules.1 micro`, `traefik_p32probe.1 micro`) |
| probe facts | `ports=[]`, `args=18`, mounts `/var/run/docker.sock:ro=true` only; `p32-rules` `ports=[]`, `replicas=1` |
| `${EMAIL}` | read from the live Args into a shell variable on micro; never printed |

#### Discovery — the gate (Run A: native v3 default, no switch)

```
ssh micro "T=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_p32probe | head -1); \
  docker exec \$T wget -qO- http://localhost:8080/api/http/routers \
  | jq -r '.[] | select(.name|startswith(\"p32-\")) | .name + \"  \" + .status + \"  p=\" + (.priority|tostring) + \"  syn=\" + (.ruleSyntax // \"-\") + \"  \" + .rule'"
# expect: exactly 4 lines, every status == enabled, priorities 200/2/2/1, rules verbatim
ssh micro "T=\$(…); docker exec \$T wget -qO- http://localhost:8080/api/http/routers \
  | jq -r '.[] | select(.status!=\"enabled\") | .name + \"  \" + .status + \"  \" + (.error|tostring)'"
# expect: exactly thinx-api-ws@swarm disabled … unsupported function: HeadersRegexp (the live v2 rule, read-only)
```

Observed (Run A, 13:49Z):
```
p32-downtime-http@swarm   enabled  p=2    syn=-  PathPrefix(`/`)
p32-downtime-https@swarm  enabled  p=2    syn=-  PathPrefix(`/`)
p32-error-router@swarm    enabled  p=1    syn=-  PathPrefix(`/`)
p32-ws@swarm              enabled  p=200  syn=-  Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)
thinx-api-ws@swarm  disabled  ["error while parsing rule Host(`rtm.thinx.cloud`) && HeadersRegexp(`Upgrade`, `(?i)websocket`): parsing rule Host(`rtm.thinx.cloud`) && HeadersRegexp(`Upgrade`, `(?i)websocket`): unsupported function: HeadersRegexp"]
```

| Run A check | Observed |
|---|---|
| p32- routers | **4 / 4 enabled**, priorities 200 / 2 / 2 / 1, rules verbatim |
| `ruleSyntax` on the p32 routers | **field absent** (`-`) — under a v3 default the API does not echo the inherited value (`omitempty`); the v3 parse is proven by the matcher split below, and Run B shows the explicit value. (The plan expected the literal `v3`; recorded as observed.) |
| probe-seen live `thinx-api-ws@swarm` | **disabled**, error text exactly as RESEARCH A1 predicted: `error while parsing rule …: parsing rule …: unsupported function: HeadersRegexp` (also logged at ERR level at 13:48:42Z, visible under `--log.level=ERROR`) |
| probe-seen live `downtime-http@swarm` / `downtime-https@swarm` / `error-router@swarm` | **enabled** with the dead ``HostRegexp(`{host:.+}`)`` rule — the **silent-failure evidence** (RESEARCH §Q1): under native v3 the status filter cannot see an unconverted catch-all, hence the bare-IP behavioural probe in every later gate |
| probe `/api/overview` | routers 36 (30 live + 4 p32 + api/dashboard@internal), **errors 1** (= thinx-api-ws), services 19, middlewares 9 |
| LIVE `/api/overview` during the probe (credentialed) | **30 / 0**, `p32-` routers seen by the live edge: **0** — the constraint isolation held (T-32-01) |

#### Run B — Stage 1's exact live condition (v2 default + per-router `ruleSyntax=v3`)

```
ssh micro "ARGS=\$(docker service inspect traefik_p32probe --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}' \
  | jq -r '.[:3] + [\"--core.defaultRuleSyntax=v2\"] + .[3:] | map(@sh) | join(\" \")'); \
  docker service update --detach --args \"\$ARGS\" traefik_p32probe"
# expect: rc 0; the FULL 19-flag list (18 Run A flags + the switch at index 3) — `--args` replaces the whole list
ssh micro "docker service update --detach --label-add traefik.http.routers.p32-ws.ruleSyntax=v3 \
  --label-add traefik.http.routers.p32-downtime-http.ruleSyntax=v3 --label-add traefik.http.routers.p32-downtime-https.ruleSyntax=v3 \
  --label-add traefik.http.routers.p32-error-router.ruleSyntax=v3 p32-rules"
# expect: rc 0; probe 1/1 again with args=19; then the p32 filter -> 4 enabled, syn=v3 (explicit); thinx-api-ws@swarm enabled again
```

| Run B check (13:50:09Z) | Observed |
|---|---|
| `--args` update | rc 0; `n_args_to_apply=19`; update `completed` at t=18 s; probe `1/1` (`Running 6 seconds ago`); `probe_args=19`, `--core.defaultRuleSyntax=v2` count 1 |
| `--label-add` x4 on `p32-rules` | rc 0 |
| p32- routers | **4 / 4 enabled**, p=200/2/2/1, **`syn=v3` explicit**, rules verbatim |
| non-enabled filter | prints **nothing** |
| probe-seen live four | all **enabled**, `syn=v2` (v2 default restored; `thinx-api-ws@swarm` parses again) |
| probe `/api/overview` | routers 36, **errors 0** |
| LIVE `/api/overview` | **30 / 0** |

#### Teardown + no-side-effect checks

```
ssh micro "docker service rm traefik_p32probe p32-rules"
ssh micro "docker service ls --filter name=p32 --format '{{.Name}}'; docker service ls --filter name=traefik_p32probe --format '{{.Name}}'"   # expect: empty, empty
ssh micro "stat -c '%s %Y %a %U' /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json; \
  docker service inspect traefik_traefik --format '{{.Version.Index}} {{len .Spec.TaskTemplate.ContainerSpec.Args}}'"
# expect: 301121 1791410693 600 root (unchanged); 38379311 17 (live edge untouched)
```

| Check (13:52:01Z) | Observed |
|---|---|
| services after `rm` | `p32` filter **empty**, `traefik_p32probe` filter **empty**, `gsd.phase=32` containers **0** |
| production `acme.json` | `301121 1791410693 600 root` — unchanged (no mount, throwaway storage, staging CA) |
| live `traefik_traefik` | `traefik:v3.7.14 idx=38379311 args=17`, task `i7tpgo7vv0vj` still `Running 16 hours ago` (not restarted) |
| live `/api/overview` | 30 / 0 |
| bare-IP pair re-run | `301 https://188.166.23.244/` and `200` — = baseline |
| WS probe re-run (`websocket` / `WebSocket`) | `HTTP/1.1 401 Unauthorized` + `X-Forwarded-Proto: https` both — = baseline |

**Gate verdict (D-02 tracer):** the four native-v3 rules parse and report `enabled` under a Traefik v3.7.14
booted WITHOUT the switch (Run A) and under Stage 1's exact live condition — v2 default + per-router
`ruleSyntax=v3` (Run B). The live edge was never written and never discovered the throwaway. Stage 1 may
proceed.

### Mechanism (Phase 32)

Every live change is one `docker service update`; repo first (D-04) before each stage. No stack deploy,
no `restart.sh`, no `--api.insecure` on the live service.

| Stage | Command shape | Risk under the version running at that moment |
|---|---|---|
| **1 — native v3 rules (label-only, 3 updates, no restart)** | per service: `docker service update --detach --label-add '<router>.rule=<v3 rule>' --label-add <router>.ruleSyntax=v3 <svc>` — rule AND override in ONE update: `errorpage_errorpage` (error-router) -> `downtime_downtime` (downtime-http + downtime-https, four `--label-add` in one update) -> `thinx_api` (thinx-api-ws) | none while the live default is still v2: the override makes the v3 parser handle that router alone. Splitting rule and override across two updates opens a parse-error window (v2 rule + v3 parser = disabled router; v3 `HeaderRegexp` + v2 parser = disabled). Per-router rollback (while the switch is live) = `--label-add '<v2 rule>' --label-rm <router>.ruleSyntax <svc>` in ONE update |
| **2 — remove the BC switch (`--args`, 17 -> 16, ONE task restart ~4 s)** | `docker service update --detach --args "<16 flags via jq map(@sh) from the 600-root full-spec backup, index 3 deleted>" traefik_traefik` (Plan 32-02) | the only restart of the phase (web only; `:7442`/`:1883`/`:8883` are direct-published). Safe in both directions because Stage 1 already converted all four routers under explicit overrides: with the switch back, they still parse as v3 via the override. Gate = status filter + bare-IP 301/200 + WS 401 + HTTPS matrix vs baseline; revert = the same command with the 17-flag set |
| **3 — strip the four overrides (label-only, 3 updates, no restart)** | `docker service update --detach --label-rm <router>.ruleSyntax <svc>` per service (Plan 32-02) | functionally a no-op once the default is v3; required so the live spec equals the committed files (D-03/D-04). API `ruleSyntax` is then inherited (the field is omitted under a v3 default — observed in the 32-01 probe Run A) |

**Rules that still apply (31-03 lessons):** never let a traefik-enabled service carry both
`traefik.docker.*` and `traefik.swarm.*` labels, even briefly (the v3 swarm provider skips it) — every
label migration is single-step; never `docker stack deploy` / `restart.sh` for an edge change (drops the
live-only secret mounts, resets the edge auth hashes); the status filter alone is blind to a dead
``HostRegexp(`{host:.+}`)`` catch-all under native v3 — always pair it with the bare-IP probe; do not push
`thinx-staging` while a Stage touches `thinx_api` (Swarmpit rollout gives `thinx-api-ws` 0 servers mid-probe).

### Stage 1 record (32-01 Task 3, 2026-10-08 14:02-14:06 UTC)

**Outcome: all four live routers run their native v3 rules under per-router `ruleSyntax=v3` overrides; every
router enabled; no task restarted; `traefik_traefik` untouched (17 flags, `Version.Index 38379311`).**
Precondition re-read before the first update: micro checkout `17401bb` == workstation thinx-swarm HEAD
(Task 2 commit, origin/master too); live `args=17 idx=38379311`. Provider refresh is 15 s; each gate was
read 25 s after its update.

| Time (UTC) | Update | Command shape / rc | Task id pre == post | Readback (label / API) | Behavioural probe |
|---|---|---|---|---|---|
| 14:02:55 | **(1) errorpage_errorpage** — error-router | `--label-add 'error-router.rule=PathPrefix(\`/\`)' --label-add error-router.ruleSyntax=v3`; rc 0 | `5d7aukf4evft` == `5d7aukf4evft` (micro, Running 42 min) | label: rule ``PathPrefix(`/`)``, `ruleSyntax=v3`, priority 1; API: `error-router@swarm enabled p=1 syn=v3`, err null; status filter empty; routers 30 | bare-IP `301 https://188.166.23.244/` + `200`; hostless `GET / HTTP/1.0` -> **`HTTP/1.0 302 Found`** (was 404 — error-router now answers hostless requests, D-06) |
| 14:04:01 | **(2) downtime_downtime** — downtime-http + downtime-https in ONE update | 4x `--label-add` (both rules + both overrides); rc 0 | `vzyg90j8f878` == `vzyg90j8f878` (core, Running 18-19 min) | label: both rules ``PathPrefix(`/`)``, both `ruleSyntax=v3`, priorities 2/2; API: both `enabled p=2 syn=v3`, err null; status filter empty; routers 30 | bare-IP `301` + `200`; hostless -> **`HTTP/1.0 301 Moved Permanently`** (downtime-http at priority 2 now beats error-router — D-06, record only) |
| 14:04:53 | **(3) thinx_api** — thinx-api-ws | `--label-add 'thinx-api-ws.rule=Host(\`rtm.thinx.cloud\`) && HeaderRegexp(\`Upgrade\`, \`(?i)websocket\`)' --label-add thinx-api-ws.ruleSyntax=v3`; rc 0 | `9nitjbo580v8` == `9nitjbo580v8` (micro, Running 2 h) | label: v3 rule, `ruleSyntax=v3`, priority 200; API: `thinx-api-ws@swarm enabled p=200 syn=v3`, mw `sslheaders@swarm`, err null; status filter empty; overview 30 / 0 errors / 0 warnings, services 18 | WS `--http1.1` probe: `Upgrade: websocket` -> **`HTTP/1.1 401 Unauthorized` + `X-Forwarded-Proto: https`**; `Upgrade: WebSocket` -> **401** + `X-Forwarded-Proto: https`; no `Server: nginx` |

#### Stage 1 end check (14:05:36Z) vs the 13:44Z baseline

| Check | Baseline | After Stage 1 | Verdict |
|---|---|---|---|
| status filter `select(.status!="enabled")` | empty | **empty** | identical |
| `/api/overview` | 30 / 0 | **30 / 0 / 0 warnings**, services 18 | identical |
| the four routers (API) | `enabled syn=v2`, v2 rules | **`enabled syn=v3`** x4, v3 rules, p=200/2/2/1 | converted |
| live labels | 4 v2 rules, 0 `ruleSyntax` | 3x ``PathPrefix(`/`)`` + 1x `HeaderRegexp`, **4x `ruleSyntax=v3`**, 0 `HeadersRegexp`, 0 `{host:` | converted |
| HTTPS app / console / rtm / thinx.cloud / swarmpit / micro | 200 / 200 / 200 / 200 / 200 / 401 | 200 / 200 / 200 / 200 / 200 / 401 | identical |
| HTTPS externals (7 resolvable) | all 200; `igraczech.unitednewschannel.net` DNS-unresolvable | all 200; same name unresolvable | identical |
| HTTP redirects (console/rtm/thinx.cloud/swarmpit/micro + 7 externals) | 301 -> https://<host>/ | 301 -> https://<host>/ | identical |
| HTTP app | 200 | 200 | identical |
| bare-IP `http://188.166.23.244/` / `https://…/ -k` | `301 https://188.166.23.244/` / `200` | `301 https://188.166.23.244/` / `200` | catch-alls alive |
| hostless `GET / HTTP/1.0` on :80 | `HTTP/1.0 404 Not Found` (Traefik) | `HTTP/1.0 301 Moved Permanently` (downtime-http) | D-06 accepted change (record only) |
| WS probe `websocket` / `WebSocket` | 401 + `X-Forwarded-Proto: https` / 401 | 401 + `X-Forwarded-Proto: https` / 401 | identical (native v3 HeaderRegexp, case-insensitive) |
| `:7442` / `:1883` / `:8883` | OPEN | OPEN | unaffected (direct publish) |
| task ids thinx_api / downtime / errorpage | `9nitjbo580v8` / `vzyg90j8f878` / `5d7aukf4evft` | same / same / same | **no restarts** (label-only) |
| `traefik_traefik` | `traefik:v3.7.14 args=17 idx=38379311`, task `i7tpgo7vv0vj` | same, same task (Running 16 h) | untouched (Stage 2 is Plan 32-02) |
| `acme.json` | `301121 1791410693 600 root` | same | untouched |
| live log `error while parsing rule\|unsupported function` (5 min) | — | **0** | no parse errors |

Plan `<verify>` for Task 3: V1-V7 PASS as written. V8 (negated `Running N minutes ago` grep) does not
pass **as written** because `downtime_downtime` (23 min) and `errorpage_errorpage` (47 min) were
autoredeployed by Swarmpit at 13:45:31Z / 13:20:56Z after the operator's `498afa7` image rebuild —
before any Stage 1 update (see the Baseline task-id note); the per-update pre == post task ids above are
the evidence that Stage 1 restarted nothing. Recorded as a plan-command defect in 32-01-SUMMARY, not
rewritten.

Per-router rollback was staged and NOT needed. The repo state (thinx-swarm `17401bb`, this repo
`fa72db3a`, mirror MIRROR OK at 17 flags) equals the live label state; the live static command is still
the 17-flag set, so Plan 32-02 Stage 2 starts from here.

### Stage 2 — converted static command (32-02 Task 1, 2026-10-08 14:38-14:41 UTC)

Repo-first (D-04) for the switch removal (D-09). Committed in the edge source repo as
**`thinx-swarm@6c01b2650d6fa54ef4e86aa620645b2ec5f1fb5a`** (parent `17401bb`, the Stage 1 commit): the
`traefik.yml` command block drops from **17 to 16** flags — the single removed flag is the index-3
backward-compat rule-syntax switch; its two comment lines were REWRITTEN to a `# Phase 32 (EDGE-MIG-03,
D-09)` removal note that does not name the flag token (RESEARCH Pitfall 8 — the gates grep the token).
Nothing else in the block moved (`--providers.swarm` x3 incl. the backtick constraint and
`exposedbydefault=true`, all six entrypoints incl. `thxp=:7442` / `mqtt=:1883` / `mqtts=:8883`, the three
`le` ACME lines with `${EMAIL}` templated, accesslog / log / log.level / api). Index shift: the
`${EMAIL}` flag moves from index 10 to 9 — nothing reads the args by index (RESEARCH A5).

| # (live order) | 17-flag command (Stage 1 end state, `traefik-edge.D.pre.yml`) | 16-flag command (committed now) |
|---|---|---|
| 0-2 | `--providers.swarm`, `…constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)`, `…exposedbydefault=true` | **unchanged** |
| 3 | the v2 default-rule-syntax switch (BC, Phase 31 D-04) | **removed** |
| 4-9 (was 5-10) | six `--entrypoints.*.address` (`:80 :443 :1194 :1883 :8883 :7442`) | unchanged (indexes -1) |
| 10-12 (was 11-13) | three `--certificatesresolvers.le.acme.*` (`email=${EMAIL}`, storage, tlschallenge) | unchanged (indexes -1) |
| 13-15 (was 14-17) | `--accesslog`, `--log`, `--log.level=ERROR`, `--api` | unchanged (indexes -1) |

```
cd ~/Repositories/thinx-swarm && git push origin master                              # 17401bb..6c01b26  master -> master
GIT_SSH_COMMAND="ssh -i ~/.ssh/DOKey2 -p2020" git push ssh://root@188.166.23.244/mnt/gluster/deployment/swarm master:refs/heads/p32-stage2
ssh micro "cd /mnt/gluster/deployment/swarm && git status --short | grep -v '^??' | wc -l; git merge --ff-only p32-stage2 && git branch -d p32-stage2 && git rev-parse HEAD"
# expect: 0 ; Fast-forward 17401bb..6c01b26 ; 6c01b2650d6fa54ef4e86aa620645b2ec5f1fb5a (== workstation HEAD)
node scripts/generate-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm" && node scripts/check-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"
# expect: MIRROR-GENERATED ok source=thinx-swarm@6c01b265… -> docker-compose.traefik.yml ; MIRROR OK files=1
grep -c '^ *- --' docker-compose.traefik.yml                                           # expect: 16
grep -v '^ *#' docker-compose.traefik.yml | grep -c 'core.defaultRuleSyntax'           # expect: 0
```

| Check (14:41Z) | Observed |
|---|---|
| `traefik.yml` | 0 lines (commented or not) carry the switch token; `# Phase 32 (EDGE-MIG-03` comment at line 106; **16** `- --` lines; `--providers.swarm`, `exposedbydefault=true`, `vpn=:1194`, `mqtt=:1883`, `mqtts=:8883`, `thxp=:7442` present |
| origin / micro | `origin/master` = `6c01b26`; micro checkout `17401bb..6c01b26` Fast-forward, 0 tracked modifications, temp branch deleted, HEAD `6c01b2650d6f…` == workstation |
| mirror | `MIRROR OK files=1`; banner `source: thinx-swarm@6c01b2650d6fa54ef4e86aa620645b2ec5f1fb5a`, `mirror-sha256:3a5c0d70…`; **16** flags; 0 uncommented switch lines; 0 `--providers.docker`; the only body delta vs the Stage 1 mirror is the removed flag + its rewritten comment (`git diff`: 4 insertions, 5 deletions incl. the banner) |
| live `traefik_traefik` | **STILL `traefik:v3.7.14 args=17 idx=38379311`**, task `i7tpgo7vv0vj` — no live mutation in this task (the `--args` update is Task 2) |

### Stage 2 record (32-02 Task 2, 2026-10-08 14:43-14:51 UTC)

**Outcome: the live `traefik_traefik` runs the 16-flag static command WITHOUT the backward-compat switch
on `traefik:v3.7.14`; one task restart (fire 14:48:11Z -> new task Running 14:48:26Z); every router enabled
under the native v3 default; every behavioural probe and both matrices identical to the baseline; no D-10
trigger fired; the revert was staged and NOT used.**

Precondition re-read (14:42Z): four routers `enabled syn=v3` (API), status filter empty, `/api/overview`
30 / 0, `ruleSyntax=v3` labels 1 + 2 + 1 across thinx_api / downtime_downtime / errorpage_errorpage,
credential `600 root 8`, micro checkout `6c01b26` == workstation == origin/master (Task 1).

```
ssh micro "umask 077; B=/mnt/data/edge-rollback/traefik-p32-prestage2-\$(date -u +%Y%m%dT%H%M%SZ).json; docker service inspect traefik_traefik > \$B && chmod 600 \$B; \
  jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args[3]' \$B"
# expect: 17 ; the BC switch flag (index 3) — this file is the 17-flag revert source, 600 root, never leaves micro, never committed
ssh micro "jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | del(.[3]) | .[]' \$B | sed -E 's/acme.email=.*/acme.email=<masked>/'"
# expect: 16 lines, index-exact vs `grep '^ *- --' docker-compose.traefik.yml` (leading '- ' stripped, e-mail line masked to end of line on both sides)
ssh micro "ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | del(.[3]) | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: rc 0; ONE task restart; image unchanged; Version.Index advances; args=16; 0 switch lines in the live Args
```

| Time (UTC) | Step | Observed |
|---|---|---|
| 14:43:09 | pre-flight backup | `/mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json` — `600 root`, 16020 B; Args length **17**, `.[3]` = the BC switch; live `traefik:v3.7.14 args=17 idx=38379311`, task `i7tpgo7vv0vj` (micro, Running 17 h); `acme.json` `301121 1791410693 600 root` |
| 14:43 | dry-print + index-exact diff | rebuilt 16 flags printed masked (`<masked>` e-mail); diff vs the 16 mirror lines **16/16 identical** (first attempt false-mismatched on the e-mail line only because the `[^ ]+` mask stopped at the space inside `${EMAIL?Variable not set}`; masked to end of line on both sides -> empty diff); swarm x3 / docker x0 / BC x0 / thxp x1 |
| 14:46:38 | "pre" gate row | status filter **empty**; bare-IP `301 https://188.166.23.244/` + `200`; WS `--http1.1` `websocket` / `WebSocket` -> **401** + `X-Forwarded-Proto: https`, no nginx; hostless `HTTP/1.0 301`; HTTPS matrix (14 hosts) == baseline |
| **14:48:11.5** | **fire** | `docker service update --detach --args "<16 flags>" traefik_traefik` (args rebuilt on micro from the 14:43:09 backup, `n_args_to_apply=16`) -> **rc 0** |
| 14:48:11-24 | drain | `docker service ps --filter desired-state=running` **empty** for ~13 s while `i7tpgo7vv0vj` stopped; the OLD task logged 13 transient `ERR … middleware "https-redirect@swarm" / "security-headers@swarm" does not exist` lines at 14:48:23Z (a partial dynamic config delivered to the stopping task; none on the new task; not a rule-parse error) |
| 14:48:25 / **14:48:26** | new task | `yudql1hqdnd9` `traefik:v3.7.14` micro **Starting** -> **Running** (fire -> Running ≈ 15 s; 31-03 B1 was ~4 s — the difference is the old task's stop time, not the new task's boot); exactly **1** running task; no crash-loop |
| 14:48:28 | acme.json | rewritten once at start (mtime -> `1791470908`), **size unchanged `301121`**, `600 root` — same one-time rewrite as 31-03; served serials unchanged (below) |
| 14:48:31 | update status | `UpdateStatus.State=completed`; **`Version.Index` 38379311 -> 38379727 (updating) -> 38379738 (completed)** |
| 14:48:34 | new-task log | one `ERR Error renewing ACME certificate: {checkout.qooldata.com [checkout.fotostim.com checkout.fotostim.cz]} … invalid authorization … 400` — the start-time renewal pass for an EXTERNAL fotostim-stack certificate whose domain fails ACME authorization; unrelated to rule syntax, not a D-10 signal (recorded; backlog for the stack owner) |
| 14:48:57 | convergence (first credentialed read) | `/api/overview` **30 / 0 errors / 0 warnings**, services 18, middlewares 7 |
| 14:48:57 | **(1) status filter** | prints **nothing** — no trigger |
| 14:48:57 | four routers (API) | `downtime-http@swarm enabled p=2 syn=v3`, `downtime-https@swarm enabled p=2 syn=v3`, `error-router@swarm enabled p=1 syn=v3`, `thinx-api-ws@swarm enabled p=200 syn=v3` (explicit overrides still set — expected until Stage 3); `ruleSyntax` across all 30 routers: **26 absent (inherited v3 default), 4 explicit `v3`** — the 26 formerly `v2 (inherited)` routers now parse as v3 (plain `Host()` rules, as predicted) |
| 14:49 | **(2) HTTPS matrix** (from micro) | app / console / rtm / thinx.cloud / swarmpit **200**, micro **401**; fotostim.com, www.fotostim.com, fotostim.cz, www.fotostim.cz, igraczech.com, www.igraczech.com, www.syxra.cz **200**; `igraczech.unitednewschannel.net` `000` (DNS, pre-existing) — **== baseline line for line** — no trigger |
| 14:50:17 | **(3) WS probe** `--http1.1` | `Upgrade: websocket` -> **`HTTP/1.1 401 Unauthorized`** + **`X-Forwarded-Proto: https`**, no `Server: nginx`; `Upgrade: WebSocket` -> **401** + `X-Forwarded-Proto: https` — no trigger |
| 14:50:17 | **(4) bare-IP pair** | `http://188.166.23.244/` -> **`301 https://188.166.23.244/`**; `https://188.166.23.244/ -k` -> **`200`** — catch-alls alive under native v3 — no trigger; hostless `GET / HTTP/1.0` -> `HTTP/1.0 301 Moved Permanently` (= Stage 1 end state, D-06) |
| 14:50 | HTTP redirect matrix (from micro) | app **200**; console / rtm / thinx.cloud / swarmpit / micro + the 7 resolvable externals **301 -> https://<host>/** — == baseline |
| 14:50 | cert serials / validity | app `051152D5A20BE36DEFA1B6FA83379CE42809`, rtm `0535CC0C71E39D9378E72893F3A2141267B0` (= D.pre.yml / P31), both `Certificate will not expire` (`checkend 0`) |
| 14:50 | live log scan `error while parsing rule\|unsupported function` (30 min) | **0** |
| 14:50 | static args readback | `traefik:v3.7.14 args=16 idx=38379738 update=completed`; Args contain `--providers.swarm` (x3 incl. constraint + `exposedbydefault=true`), `thxp.address=:7442`, `mqtt.address=:1883`, `mqtts.address=:8883`; `--providers.docker` 0; switch 0 |
| 14:50 | device ports (EDGE-MIG-04 guard) | `7442 OPEN`, `1883 OPEN`, `8883 OPEN`; published `thinx_api 7442->7442`, `thinx_mosquitto 1883->1883 1884->1884 8883->8883`, `traefik 80->80 443->443` — unchanged |
| 14:50 | other services | `downtime_downtime.1 vzyg90j8f878` (core), `errorpage_errorpage.1 5d7aukf4evft` (micro) unchanged since Stage 1; **`thinx_api.1` is now `8v3ype7pftzh`** — Swarmpit autoredeployed `thinx_api` at 14:15:41Z (new image digest `15bab212…`, between Plan 32-01's Stage 1 and this plan — not caused by Phase 32); Stage 3 re-reads the id immediately before its update |

**D-10 trigger evaluation: none fired** ((1) filter empty, (2) HTTPS matrix == baseline, (3) WS 401 +
`X-Forwarded-Proto: https` both casings, (4) bare-IP 301 / 200). The 17-flag revert (`--args` from the
14:43:09 backup, switch back at index 3) was staged and **not executed**.

Version.Index post-Stage-2: 38379738

Repo state == live state after this task: thinx-swarm `6c01b26` (origin + micro), this repo `875c20c2`
(mirror MIRROR OK at 16 flags), live `traefik_traefik` 16 flags index-exact to the mirror. The four
`ruleSyntax=v3` overrides are still live and committed — Stage 3 (Task 3) strips them.

### Stage 3 record (32-02 Task 3, 2026-10-08 14:55-15:02 UTC)

**Outcome: zero `ruleSyntax` overrides live or in git; the four routers run their native v3 rules under the
inherited v3 default; nothing restarted; `traefik_traefik` untouched at `args=16 idx=38379738`; committed
files == micro's checkout == live spec (D-03, D-04). End state of Plan 32-02.**

Repo first (D-04): thinx-swarm **`158f36981c6f128dbc4b0dcd2f6d378124852e6f`** (parent `6c01b26`) deletes
exactly the four Stage 1 override lines (`errorpage.yml` 1, `downtime.yml` 2, `thinx.yml` 1); v3 rules,
priorities 1/2/2/200 and the Phase 32 comments untouched. Pushed to `origin/master`, pushed to micro as
`p32-stage3`, `git merge --ff-only` (`6c01b26..158f369`, 0 tracked modifications, temp branch deleted).
This repo: `docker-swarm.yml` minus its one `ruleSyntax` line (WS block byte-identical to `thinx.yml`),
mirror regenerated — `MIRROR OK files=1`, banner `source: thinx-swarm@158f369…`, still 16 flags, body
unchanged (Pitfall 6: the banner SHA tracks every thinx-swarm commit).

```
ssh micro "docker service update --detach --label-rm traefik.http.routers.error-router.ruleSyntax errorpage_errorpage"
ssh micro "docker service update --detach --label-rm traefik.http.routers.downtime-http.ruleSyntax --label-rm traefik.http.routers.downtime-https.ruleSyntax downtime_downtime"
ssh micro "docker service update --detach --label-rm traefik.http.routers.thinx-api-ws.ruleSyntax thinx_api"
# expect each: rc 0; task id pre == post (label-only); label readback = v3 rule + priority, NO ruleSyntax line
ssh micro "for s in thinx_api downtime_downtime errorpage_errorpage; do docker service inspect \$s --format '{{range \$k,\$v := .Spec.Labels}}{{\$k}}={{\$v}}{{println}}{{end}}'; done | grep -c ruleSyntax"
# expect: 0
```

| Time (UTC) | Update | rc | Task id pre == post | Label readback after |
|---|---|---|---|---|
| 15:00:26 | **(1) errorpage_errorpage** `--label-rm error-router.ruleSyntax` | 0 | `5d7aukf4evft` == `5d7aukf4evft` (micro, Running 2 h) | `error-router.rule=PathPrefix(\`/\`)`, `priority=1`, no `ruleSyntax` |
| 15:00:26 | **(2) downtime_downtime** `--label-rm downtime-http.ruleSyntax --label-rm downtime-https.ruleSyntax` (one update) | 0 | `vzyg90j8f878` == `vzyg90j8f878` (core, Running ~1 h) | both rules ``PathPrefix(`/`)``, priorities 2 / 2, no `ruleSyntax` |
| 15:00:26 | **(3) thinx_api** `--label-rm thinx-api-ws.ruleSyntax` | 0 | `8v3ype7pftzh` == `8v3ype7pftzh` (micro, Running 44 min — the 14:15:41Z Swarmpit autoredeploy predates this plan) | ``thinx-api-ws.rule=Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)``, `priority=200`, no `ruleSyntax` |

Live `ruleSyntax` label count across the three services after (3): **0**. No `thinx-staging` push during
the window (Pitfall 7).

#### Stage 3 end check (15:00:56Z - 15:01:28Z) vs the Stage 2 record / 13:44Z baseline

| Check | Expected | Observed | Verdict |
|---|---|---|---|
| provider convergence | the four routers stop reporting the explicit `v3` | at 15:00:56Z (first read, 30 s after the updates) `syn=-` on all four | converged |
| the four routers (API) | `enabled`, p=200/2/2/1, v3 rules | `downtime-http@swarm enabled p=2`, `downtime-https@swarm enabled p=2`, `error-router@swarm enabled p=1`, `thinx-api-ws@swarm enabled p=200`, rules verbatim, `ruleSyntax` **absent** | enabled under the inherited v3 default |
| `ruleSyntax` histogram over all 30 routers | field absent everywhere (v3 default, `omitempty` — 32-01 Run A finding) | **`{"-": 30}`** (Stage 2 read was 26 absent + 4 explicit `v3`) | no override anywhere |
| status filter `select(.status!="enabled")` | empty | **empty** | identical |
| `/api/overview` | 30 / 0 | **30 / 0 errors / 0 warnings**, services 18, middlewares 7 | identical |
| HTTPS matrix (14 hosts, from micro) | == baseline | app / console / rtm / thinx.cloud / swarmpit 200, micro 401, 7 externals 200, `igraczech.unitednewschannel.net` 000 (DNS) | identical |
| HTTP redirect matrix | == baseline | app 200; console / rtm / thinx.cloud / swarmpit / micro 301 -> https://<host>/ | identical |
| bare-IP `http://188.166.23.244/` / `https://…/ -k` | `301 https://188.166.23.244/` / `200` | **`301 https://188.166.23.244/`** / **`200`** | catch-alls alive without overrides |
| WS probe `--http1.1` `websocket` / `WebSocket` | 401 + `X-Forwarded-Proto: https`, no nginx | **401** + `X-Forwarded-Proto: https` / **401** + `X-Forwarded-Proto: https`, no `Server: nginx` | WS router matches natively without override |
| hostless `GET / HTTP/1.0` on :80 | `301` (Stage 1 end state, D-06) | `HTTP/1.0 301 Moved Permanently` | identical |
| cert serials / `checkend 0` | app `051152D5…`, rtm `0535CC0C…` | app `051152D5A20BE36DEFA1B6FA83379CE42809`, rtm `0535CC0C71E39D9378E72893F3A2141267B0`, both valid | identical |
| `traefik_traefik` | `traefik:v3.7.14 args=16 idx=38379738` (not re-updated) | **`traefik:v3.7.14 args=16 idx=38379738`**, task `yudql1hqdnd9` (Running 12 min = the Stage 2 restart) | untouched in Stage 3 |
| task ids thinx_api / downtime / errorpage | pre == post | `8v3ype7pftzh` / `vzyg90j8f878` / `5d7aukf4evft` — same as before each update | **no restarts** (label-only) |
| live log `error while parsing rule\|unsupported function` (5 min) | 0 | **0** | no parse errors |
| `:7442` / `:1883` / `:8883` | OPEN | OPEN / OPEN / OPEN | unaffected |

Plan `<verify>` for Task 3: V1-V4, V6 PASS as written. V5 (`grep '^enabled syn=v3$' … -eq 4`) does
**not** pass as written: under the v3 default the dashboard API omits the `ruleSyntax` field instead of
echoing `v3` (the `omitempty` behaviour recorded in the 32-01 Run A table and called out in Plan 32-02's
own task text) — the four lines read `enabled syn=-`; the v3 parse is proven by `enabled` + the behavioural
probes, and the override absence by the label readback (V4). V7's negated `Running N minutes ago` grep
matches `thinx_api` (45 min) because Swarmpit autoredeployed it at 14:15:41Z, before this plan started;
the per-update task ids above are the evidence that Stage 3 restarted nothing. Both recorded as
plan-command defects in 32-02-SUMMARY, not rewritten.

**Phase 32 live end state (hand-off to Plan 32-03):** `traefik_traefik` `traefik:v3.7.14`, 16 flags
(no backward-compat switch), `Version.Index 38379738`, task `yudql1hqdnd9`; the four converted routers
enabled with no `ruleSyntax` label; thinx-swarm `158f369` == origin/master == micro checkout; this repo
mirror `MIRROR OK` at 16 flags (banner `158f369`); `docker-swarm.yml` WS block == `thinx.yml`; 17-flag
revert source `micro:/mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json` (600 root,
out of git); dashboard credential `/root/.p32-traefik-admin` still in place for 32-03 (shredded there).

### Re-verify matrix (Phase 32, 2026-10-08 15:12-15:14 UTC) vs the Plan 01 baseline (13:44Z)

The full RESEARCH §Q3 suite, run top to bottom by Plan 32-03 Task 1 against the native-v3 end state
(`args=16`, 0 overrides) — every value observed, none assumed. The credentialed rows were read at
15:12:34Z with the D-12 credential (`HASH=MATCH`, dashboard host read from the live label), which was
shredded at 15:16:48Z after the capture (`ls` -> `No such file`). No live mutation other than the shred.

| Check | Baseline (32-01, 13:44Z) | End state (32-03, 15:12-15:14Z) | Verdict |
|---|---|---|---|
| router status filter `select(.status!="enabled")` | empty | **empty** | identical |
| `/api/overview` | 30 http routers / 0 errors / 0 warnings; services 18; middlewares 7; tcp 0; providers `["Swarm"]` | **30 / 0 / 0**; 18; 7; 0; `["Swarm"]` | identical |
| the four routers (API) | `enabled`, p=200/2/2/1, `syn=v2` (inherited), v2 rules | `thinx-api-ws@swarm enabled p=200`, `downtime-http@swarm enabled p=2`, `downtime-https@swarm enabled p=2`, `error-router@swarm enabled p=1`; rules ``Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)`` / ``PathPrefix(`/`)`` x3; `ruleSyntax` field **absent** (`syn=-`, inherited v3) | converted, enabled, no override |
| `ruleSyntax` histogram (30 routers) | — (v2 inherited everywhere) | **`{"-": 30}`** | no override anywhere |
| live `traefik_traefik` | `traefik:v3.7.14 args=17 idx=38379311`, task `i7tpgo7vv0vj` | **`traefik:v3.7.14 args=16 idx=38379738 update=completed`**, task `yudql1hqdnd9` (micro, Running 25 min), exactly **1** running task; `grep -c core.defaultRuleSyntax` over the live Args -> **0**; `PreviousSpec` = same image with 17 Args | switch removed; one restart in the phase (Stage 2) |
| label readback (thinx_api / downtime_downtime / errorpage_errorpage) | v2 rules, 0 `ruleSyntax` | v3 rules + priorities 200/2/2/1, **0 `ruleSyntax` lines**, 3 ``PathPrefix(`/`)`` + 1 `HeaderRegexp` | end state (D-03) |
| HTTPS matrix (from micro) | app/console/rtm/thinx.cloud/swarmpit 200; micro 401 | app/console/rtm/thinx.cloud/swarmpit **200**; micro **401** | identical |
| HTTPS externals (Host() values read live from the `fotostimcom/fotostimcz/igraczech/syxra-https@swarm` rules) | fotostim.com, www.fotostim.com, fotostim.cz, www.fotostim.cz, igraczech.com, www.igraczech.com, www.syxra.cz 200; `igraczech.unitednewschannel.net` 000 (DNS) | all seven **200**; `igraczech.unitednewschannel.net` **000** (DNS, pre-existing) | identical line for line |
| HTTP redirect matrix | app 200; console/rtm/thinx.cloud/swarmpit/micro + 7 externals 301 -> https://<host>/ | app **200**; every other host **301 -> https://<host>/** | identical |
| bare-IP pair (workstation) | `301 https://188.166.23.244/` / `200` (server nginx) | **`301 https://188.166.23.244/`** / **`200`** (`server: nginx`) | catch-alls alive under native v3 |
| hostless `GET / HTTP/1.0` on :80 (D-06, record only) | `HTTP/1.0 404 Not Found` (Traefik) | **`HTTP/1.0 301 Moved Permanently`** (downtime-http + https-redirect) | D-06 accepted change, as recorded since Stage 1 |
| WS probe `--http1.1`, `Upgrade: websocket`, `Cookie: foo=bar`, `/p32probe` | `HTTP/1.1 401` + `X-Forwarded-Proto: https`, no nginx | **`HTTP/1.1 401 Unauthorized`** + **`X-Forwarded-Proto: https`**, no `Server:` header | WS router matches natively |
| same with `Upgrade: WebSocket` | `401` + `X-Forwarded-Proto: https` | **`HTTP/1.1 401 Unauthorized`** + `X-Forwarded-Proto: https` | `(?i)` honoured (D-08) |
| cert serials / `checkend 0` | app `051152D5A20BE36DEFA1B6FA83379CE42809`, rtm `0535CC0C71E39D9378E72893F3A2141267B0` | app **`051152D5A20BE36DEFA1B6FA83379CE42809`** (YR2, notAfter Dec 28 05:50:33 2026), rtm **`0535CC0C71E39D9378E72893F3A2141267B0`** (YR2, Dec 28 05:49:53 2026), both `Certificate will not expire` | no re-issuance across the phase |
| `acme.json` | `301121 1791410693 600 root`, 24 certs | **`301121 1791470908 600 root`**, **24** certs — size unchanged, mtime = the Stage 2 one-time start rewrite | continuity |
| `tls-config-1` | sha256 `7e43d8f9…` == committed `tls.toml` | **`7e43d8f919317184…`** | zero drift |
| `:7442` / `:1883` / `:8883` TCP accept (micro) | OPEN x3 | **OPEN / OPEN / OPEN** | unaffected (EDGE-MIG-04) |
| published ports | `thinx_api 7442->7442`; `thinx_mosquitto 1883->1883 1884->1884 8883->8883`; traefik 80/443 | **`7442->7442`**; **`1883->1883 1884->1884 8883->8883`**; **`80->80 443->443`** only | direct-publish model untouched |
| device-flow harness (`/tmp/p31-device-flow/thinx-device-flow.mjs`) | `p32-base-7442` PASS; `p32-base-https` PASS | **`p32-7442` PASS** (15:13:16-25Z: register OK over `http://rtm.thinx.cloud:7442`, status, OTT 200, firmware 380048 B `md5Match`, MQTT `mqtt://thinx.cloud:1883` connected + both ACL grants, publish, recent, disconnect); **`p32-https` PASS** (15:13:25-29Z over `https://app.thinx.cloud`, same 8 steps) | EDGE-MIG-04 re-verified |
| live log scan `error while parsing rule\|unsupported function` (since the Stage 2 restart, `--since 2026-10-08T14:48:00Z`) | 0 | **0** | no parse errors |
| task ids thinx_api / downtime / errorpage | (Stage 3 pre == post) | `8v3ype7pftzh` (micro) / `vzyg90j8f878` (core) / `5d7aukf4evft` (micro) — unchanged since Stage 3 | no restarts since |
| repo == deployed | thinx-swarm `677e3a9` (start) | workstation HEAD == micro `/mnt/gluster/deployment/swarm` HEAD == `origin/master` == mirror banner == **`158f36981c6f128dbc4b0dcd2f6d378124852e6f`**; `check-traefik-mirror.js` -> **`MIRROR OK files=1`**; `traefik.yml` 16 / mirror **16** `- --` lines; `docker-swarm.yml` thinx-api-ws block diff vs `thinx.yml` **empty**; 0 uncommented `ruleSyntax` lines across the four files; 0 uncommented switch lines in `traefik.yml` / mirror | success criterion 3 |
| working trees | — | this repo: only the pre-existing ` M services/worker` submodule pointer; thinx-swarm: only the pre-existing ` M landing` submodule pointer — neither touched by Phase 32 (recorded, not reset) | no plan-generated dirt |
| `traefik-edge.D.post.yml` | — | captured 15:14:20Z, redacted on micro; 16 flags, no switch line, 4 v3 rules, `ruleSyntax labels: ABSENT`, both serials, 0 hash/key markers, 0 e-mail matches; `C.post.yml` / `D.pre.yml` unchanged | committed with this section |
| D-12 credential `/root/.p32-traefik-admin` | `600 root 8` | `600 root 8` at 15:12Z (`HASH=MATCH`, overview 200); **shredded 15:16:48Z**, `ls` -> `No such file` | gone |

Verdict: every row identical to the baseline or at its designed end-state value; nothing to revert.

### Live production state at hand-off (Phase 32, for the Task 2 human-verify gate)

`traefik_traefik`: `traefik:v3.7.14` (image id `5a93040e…`, unchanged since P31), **16 args** (no
backward-compat switch, no placeholder), ports 80/443 only, 1 task `yudql1hqdnd9` on `micro` (Running since
14:48:26Z), `Version.Index 38379738`, `acme.json` `301121 1791470908 600 root` (24 certs, serials unchanged).
The four converted routers run native v3 rules with **no** `ruleSyntax` override: `thinx-api-ws`
``Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)`` p=200; `downtime-http` /
`downtime-https` ``PathPrefix(`/`)`` p=2; `error-router` ``PathPrefix(`/`)`` p=1. 30/30 routers enabled,
`ruleSyntax` absent everywhere. `:7442` / `:1883` / `:8883` OPEN and direct-published by `thinx_api` /
`thinx_mosquitto` (Traefik publishes only 80/443); device flow PASS over plaintext and HTTPS.

Repo state == live state: thinx-swarm `158f369` (origin/master == micro checkout == mirror banner), this
repo `875c20c2` / `5e58a669` / `80625887` / `ce8b699a` + this plan's commit, `docker-compose.traefik.yml`
`MIRROR OK` at 16 flags, `docker-swarm.yml` WS block == `thinx.yml`. **`thinx-staging` is NOT pushed:** the
local lead over `origin/thinx-staging` is the 11 Phase 32 commits (32-01 + 32-02) plus this one; the CI
mirror gate (`check-traefik-mirror.js`) passes locally, so the push is safe whenever the operator times it
(31-03 precedent — every push rolls `thinx_api` via Swarmpit, ~6 min). Dashboard credential shredded; a
credentialed re-check needs the operator to re-stage `/root/.p32-traefik-admin` (600 root) first — the
gate's failure path below needs **no** credential (behavioural probes + HTTPS matrix only).

**Ordered revert, should the operator reject the gate (order matters — after Stage 3 the v2 default alone
would disable `thinx-api-ws`, because `HeaderRegexp` is not a v2 matcher name; ``PathPrefix(`/`)`` parses
under both):**

```
# (a) FIRST re-add the four ruleSyntax=v3 overrides — label-only, no task restart, no credential needed
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-add traefik.http.routers.error-router.ruleSyntax=v3 errorpage_errorpage"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-add traefik.http.routers.downtime-http.ruleSyntax=v3 --label-add traefik.http.routers.downtime-https.ruleSyntax=v3 downtime_downtime"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-add traefik.http.routers.thinx-api-ws.ruleSyntax=v3 thinx_api"
# expect each: rc 0; task id pre == post; label readback shows the v3 rule + ruleSyntax=v3 (= the Stage 1 end state)
# (b) THEN re-add the switch with the 17-flag set from the pre-Stage-2 backup — ONE --args update, one ~15 s task restart (web only)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "B=/mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json; jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: 17 ; rc 0; new task Running within ~15 s; `docker service inspect traefik_traefik --format '{{len .Spec.TaskTemplate.ContainerSpec.Args}}'` -> 17; the switch at index 3
# (c) re-check without a credential: bare-IP pair, WS 401 x2, HTTPS matrix (and :7442/:1883/:8883 OPEN)
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -m 15 http://188.166.23.244/; curl -sk -o /dev/null -w '%{http_code}\n' -m 15 https://188.166.23.244/
# expect: 301 https://188.166.23.244/ ; 200
K=dGhlIHNhbXBsZSBub25jZQ==; for U in websocket WebSocket; do curl -s --http1.1 -D - -o /dev/null -m 10 -H "Connection: upgrade" -H "Upgrade: $U" -H "Sec-WebSocket-Key: $K" -H "Sec-WebSocket-Version: 13" -H "Cookie: foo=bar" https://rtm.thinx.cloud/p32probe | grep -iE '^HTTP/|^x-forwarded-proto'; done
# expect: HTTP/1.1 401 Unauthorized + X-Forwarded-Proto: https, twice
for H in app.thinx.cloud console.thinx.cloud rtm.thinx.cloud thinx.cloud swarmpit.thinx.cloud micro.thinx.cloud; do ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "curl -sS -o /dev/null -w '$H %{http_code}\n' https://$H/"; done
# expect: 200 x5, micro 401 (plus the 7 external hosts 200 as in the Baseline table)
# (d) repo revert in both repos (Stage 3 then Stage 2 commits), mirror regenerated, micro fast-forwarded
git -C ~/Repositories/thinx-swarm revert --no-edit 158f369 6c01b26 && git -C ~/Repositories/thinx-swarm push origin master
git -C ~/Repositories/thinx-swarm push ssh://root@188.166.23.244:2020/mnt/gluster/deployment/swarm master:refs/heads/p32-revert   # then on micro: git merge --ff-only p32-revert && git branch -d p32-revert
git revert --no-edit 80625887 875c20c2 && node scripts/generate-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm && node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm && git add docker-compose.traefik.yml && git commit -m "revert(32): mirror back to 17 flags"
# expect: MIRROR OK files=1 at 17 flags; thinx-swarm HEAD == micro HEAD; the live spec == the Stage 1 end state (v2 default + four ruleSyntax=v3 overrides + v3 rules)
```

After (a)-(d) the edge is at the Plan 32-01 Stage 1 end state (v2 default, v3 rules under explicit
overrides) — a fully verified intermediate state, not the Phase 31 start state. EDGE-MIG-03 then stays
open; it is not re-labelled "retained with rationale" without the operator's explicit decision.
