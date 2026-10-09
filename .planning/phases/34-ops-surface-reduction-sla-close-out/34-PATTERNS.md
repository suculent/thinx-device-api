# Phase 34: Ops Surface Reduction & SLA Close-out - Pattern Map

**Mapped:** 2026-10-09
**Files analyzed:** 14 (repo files + live-stage records)
**Analogs found:** 13 / 14

All edge mechanics copy the Phase 33 stage pattern: repo first in thinx-swarm → origin → micro `--ff-only` →
`node scripts/generate-traefik-mirror.js` + `check-traefik-mirror.js` (`MIRROR OK`) → 600-root pre-flight backup in
`/mnt/data/edge-rollback/` → dry-print sorted-set compare → ONE `docker service update` → gate → record. Never
`docker stack deploy` / `restart.sh` (AGENTS.md). `:7442` / plain MQTT untouched.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `~/Repositories/thinx-swarm/traefik.yml` (log WARN, accesslog JSON + drop RequestPath, `providers.swarm.endpoint`, remove docker.sock volume, new proxy service + `internal: true` network, `security-headers@file`, remove `security-headers.*` labels, `CONFIG:-3`) | config (static edge) | request-response / event (provider) | same file, Phase 33 Stage C/D edits (lines 94-147, 177-185) | exact |
| `~/Repositories/thinx-swarm/traefik/tls.toml` (WR-03 middleware, drop `curvePreferences`) | config (dynamic file provider) | transform | same file (lines 1-21) | exact |
| `docker-compose.traefik.yml` (this repo) | generated mirror | file-I/O | regenerated via `scripts/generate-traefik-mirror.js` | exact (never hand-edit) |
| `~/Repositories/thinx-swarm/thinx.yml` + `docker-swarm.yml` (D-17 `thinx-db-http`, D-16 ref removal, D-18 couch/influx auth) | config (stack labels) | request-response | `thinx-swarm/vault.yml` lines 43-45 (redirect-only http router) | exact |
| `~/Repositories/thinx-swarm/registry.yml` (D-17 `registry-http` redirect) | config | request-response | `vault.yml` lines 43-45 | exact |
| `~/Repositories/thinx-swarm/vault.yml` (D-20 re-pin) | config | — | `traefik.yml` line 6-7 (tag pin comment) | role-match |
| `~/Repositories/thinx-swarm/traefik.sh` / `README.md` (rotation line, socket-proxy, TLS options) | doc/script | — | README §TLS options; traefik.yml comment style | role-match |
| `.planning/runbooks/traefik-edge-hardening.md` (Stage records P34-A.., close `## Recorded for Phase 34`) | runbook | — | same file, `### Stage C record` (l.390-475), `### Stage D record` (l.477-552), `### Stage E record` (l.554-650), revert set (l.~800-843) | exact |
| `.planning/runbooks/swarm.md` (SLA recipe replace + socket-proxy ops) | runbook | — | same file l.43-62 (current SLA recipe) | exact |
| `.planning/runbooks/swarm-configs/traefik-edge.<stage>.{pre,post}.yml` (P34 captures) | evidence capture | file-I/O | `swarm-configs/traefik-edge.D.pre.yml` / `.E.post.yml` + `swarm-configs/README.md` rules | exact |
| `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-xx.md` | evidence capture | — | `traefik-edge-scan.2026-10-08.md` | exact |
| `scripts/traefik-edge-scan.sh` (optional: curve/PQ report line, HSTS-once already gated) | utility (laptop scan) | request-response | itself (l.49 HOSTS, l.64 HSTS_WANT, l.145 HSTS predicate) | exact |
| `AGENTS.md` (edge notes: proxy only, WARN, RequestPath drop) | doc | — | AGENTS.md `## Traefik dashboard/API access` (l.25-) | exact |
| socket-proxy service definition (image TBD by research/planner: DHI or `wollomatic/socket-proxy`) | service config | event/request-response (Docker API read-only) | none in repos (no socket-proxy, no `internal: true` overlay exists) | no analog |

## Pattern Assignments

### `thinx-swarm/traefik.yml` (static command / volumes / networks)

**Analog:** itself. Every changed flag gets a `# Phase 34 (EDGE-OPS-0x, D-xx): …` comment above it, the way
lines 94-111 / 139-147 carry Phase 31/33 comments. Targets:

```yaml
      - --providers.swarm            # l.94 — add endpoint after it; rewrite the l.88-93 comment ("No --providers.swarm.endpoint on purpose…")
      ...
      - --entrypoints.https.http.middlewares=security-headers@swarm   # l.111 → security-headers@file (D-15, same --args as config swap)
      ...
      - --accesslog                  # l.144 → + --accesslog.format=json, --accesslog.fields.names.RequestPath=drop
      - --log
      - --log.level=ERROR            # l.147 → WARN (Stage A)
```
```yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro   # l.84 — remove (D-09); proxy service mounts it instead
      - traefik-public-certificates:/certificates
```
```yaml
networks:                 # l.167-174 — add the dedicated overlay, e.g.
  traefik-public:
    external: true
  net:
    driver: overlay
    attachable: true      # model; new network must be internal: true and NOT attachable to traefik-public stacks
```
```yaml
configs:
  tls-config:
    name: tls-config-${CONFIG:-2}   # l.184 → 3
```
D-16 removes labels l.47-58 (`security-headers.*`) — but **keep l.64 `traefik-public.loadbalancer.server.port=8080`
(LOAD-BEARING comment l.60-63)** and the `https-redirect` / `error-pages-middleware` labels.
Image pin comment style (l.6-7): `# Phase 31 (EDGE-MIG-02, D-03): exact patch tag, never @sha256` — reuse for the proxy image.
Placement for the proxy: copy l.19-22 `node.labels.Traefik == true`.

### `thinx-swarm/traefik/tls.toml`

**Analog:** itself (l.1-21). Keep the header comment block style; remove l.13
`curvePreferences = ["X25519", "CurveP256"]`; keep `sniStrict = false` (l.12). Add an `[http.middlewares.security-headers.headers]`
table with the seven values currently on traefik.yml l.52-58 (browserXssFilter, contentTypeNosniff, forceSTSHeader,
frameDeny, stsIncludeSubdomains, stsPreload, stsSeconds = 31536000).

### Live stage commands (every Stage — record in traefik-edge-hardening.md)

**Analog:** Stage C record, traefik-edge-hardening.md ~l.436-444 (Args + config swap in ONE update):
```
ssh micro "umask 077; B=/mnt/data/edge-rollback/traefik-p33-preC-\$(date -u +%Y%m%dT%H%M%SZ).json; docker service inspect traefik_traefik > \$B && chmod 600 \$B; \
  jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Configs[0].ConfigName' \$B"
# expect: 600 root; 17 ; tls-config-1 — this file is the Stage C Args + config revert source, never leaves micro, never committed
ssh micro "jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + [\"--providers.file.filename=/traefik/tls.toml\"] | .[]' \$B | sed -E 's/acme.email=.*/acme.email=<masked>/' | sort"
# expect: 18 lines == the mirror's 18 `- --` lines sorted (e-mail masked both sides) — sorted-set compare
ssh micro "ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + [\"--providers.file.filename=/traefik/tls.toml\"] | map(@sh) | join(\" \")' \$B); \
  docker service update --detach --args \"\$ARGS\" --config-rm tls-config-1 --config-add source=tls-config-2,target=/traefik/tls.toml,mode=0444 traefik_traefik"
# expect: rc 0; ONE task restart; image unchanged; Version.Index advances; args=18; Configs -> tls-config-2; providers ["Swarm","File"]
```
- Stage A (log/accesslog): use jq `map(if . == "--log.level=ERROR" then "--log.level=WARN" else . end) + [...]` on the backup Args, same dry-print + fire form. Pure `--args` like Stage D (l.~506-510).
- Proxy stage: same form plus `--network-add <net> --mount-rm /var/run/docker.sock` in the one update (D-07/D-09).
- tls-config-3 stage: exactly the Stage C form (`--config-rm tls-config-2 --config-add source=tls-config-3,…`), config created FROM `/mnt/gluster/deployment/swarm/traefik/tls.toml`; readback form `docker config inspect --format '{{json .Spec.Data}}' | tr -d '"' | base64 -d | sha256sum` (l.~433).
- Label-only stages (D-16/D-17/D-18): copy the post-D ref removal (l.~511-514):
```
ssh micro "docker service update --detach --label-rm traefik.http.routers.thinx-console-https.middlewares thinx_console"
# expect each: rc 0; task id pre == post; ...; STS count still 1 on app/rtm
```
- Record table header `| Time (UTC) | Step | Observed |`, then "D-30 trigger evaluation: none fired", "Version.Index post-Stage-X", "Repo state == live state…" paragraph (l.~466-475).

**Gate recipe** (l.24-49): loopback API via `docker exec \$C wget -qO- http://127.0.0.1:8080/api/overview` and the
`select(.status!="enabled")` router filter (expect empty; P33 end state 29 routers). Image has wget + nc, no curl;
`nsenter -t \$P -n` fallback. Apply to every stage + D-10 proxy gate.

### D-19 ACME prune

**Analog:** Stage E record l.~594-612 — snapshot (umask 077, dir 700/files 600) → one remote command
`jq 'del(.le.Certificates[] | select(.domain.main == …))' > acme.json.new && jq -e '… length == N' && chmod 600 && mv && docker service update --detach --force traefik_traefik`; staged rollback `cp -p $SNAP/acme.json …`. Extend the select to the 7 retired names (+ verify 0 router refs first).

### `thinx.yml` / `docker-swarm.yml` / `registry.yml` (D-17)

**Analog:** `thinx-swarm/vault.yml` l.43-45:
```yaml
        - traefik.http.routers.vault-http.rule=Host(`vault.thinx.cloud`)
        - traefik.http.routers.vault-http.entrypoints=http
        - traefik.http.routers.vault-http.middlewares=https-redirect
```
Targets: `thinx.yml` l.135 and `docker-swarm.yml` l.187 `thinx-db-http.middlewares=couch-auth,https-redirect` → `https-redirect`
(https router l.141/l.193 keeps `couch-auth`); `registry.yml` add `registry-http.middlewares=https-redirect` after l.80.
`thinx-api-http` untouched. D-18: `couch-auth` (thinx.yml l.143) and `influx-auth` (l.491) read
`${USERNAME}:${HASHED_PASSWORD}` from `.env` — rotation changes `.env` on micro only, live via `--label-add`, values over stdin.

### `vault.yml` (D-20)

Change l.21 `image: vault:1.5.5` → maintained `hashicorp/vault:<x.y.z>` tag; update header comment l.3-6 (remains NOT DEPLOYED).

### `.planning/runbooks/swarm.md` (D-14 SLA)

**Analog:** l.43-62 (replace). Keep the fenced recipe + `# expect:` style; add the edge stop condition and three-leg table:
```bash
# 2. SLA start: the end_time of the CircleCI api-registry step "Push to private registry" (push_end) ...
ssh micro \
  "docker service ps thinx_api --no-trunc --filter desired-state=running --format '{{.ID}} {{.CurrentState}} {{.Image}}' | head -3"
# expect: new task ID, Running, the pushed digest, within 300 s of push_end
```
Then "observed SLA" history sentence (l.59-61) extended with the P34 number. Socket-proxy ops section: same
`##` + fenced `# expect:` structure as `## Traefik Edge Source of Truth` (l.115-).

### `AGENTS.md`

**Analog:** `## Traefik dashboard/API access — ssh plane only (Phase 33)` bullets (l.25-). Add bullets in the same
"Never …" voice: never re-add `docker.sock` to Traefik; log WARN; access log JSON with `RequestPath` dropped.

### `scripts/traefik-edge-scan.sh` (tracked)

Reuse as-is for HSTS-exactly-once (l.64 `HSTS_WANT`, l.145 predicate) after D-15/D-16. If a PQ curve report line is
added, follow the report-only line convention (header l.13-15) and keep exit codes 0/1/2 (l.27). Capture to
`swarm-configs/traefik-edge-scan.<date>.md`.

## Shared Patterns

- **Repo-first + mirror:** thinx-swarm commit → origin → micro ff-merge (dirty=0) → `node scripts/generate-traefik-mirror.js` → `node scripts/check-traefik-mirror.js` = `MIRROR OK files=1` → commit mirror here at N flags (Stage D record paragraph l.~496-500).
- **Backups:** `umask 077; B=/mnt/data/edge-rollback/traefik-p34-pre<X>-$(date -u +%Y%m%dT%H%M%SZ).json` — the revert source; never leaves micro.
- **Auto-revert triggers (D-10 / P33 D-30):** router not enabled, HTTPS matrix ≠ pre-row, WS 101/401 probe, bare-IP 301/200; P34 adds provider-error log grep and router count ≠ 29.
- **Keep-7442 regression:** harness `RESULT: PASS` ×2 (https + 7442) as in Stage C row (12).
- **Secret hygiene:** counts only, e-mail masked (`sed -E 's/acme.email=.*/acme.email=<masked>/'`), secrets via ssh stdin; `swarm-configs/README.md` capture rules.
- **Ordered revert set:** append P34 rollbacks newest-first in the l.~800-843 style (`(a) … # expect: …`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| socket-proxy service + `internal: true` overlay (in traefik.yml and live `docker service create`) | service config | Docker API read-only proxy | No socket-proxy or internal overlay exists in thinx-swarm; use upstream proxy README (allow-list syntax) and Traefik swarm-provider API calls. Placement/pin/comment style from traefik.yml l.6-7, l.19-22. |
| D-04 canary log grep, D-12 SLA timing | gate procedure | — | No prior canary/edge-served SLA recipe; build from Gate recipe + swarm.md l.43-62. |

## Metadata

**Analog search scope:** thinx-swarm/*.yml, traefik/, .planning/runbooks/, .planning/phases/33-*, scripts/, AGENTS.md
**Files scanned:** ~15
**Pattern extraction date:** 2026-10-09
