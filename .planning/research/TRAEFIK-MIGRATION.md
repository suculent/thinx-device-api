# Traefik Migration Research — v1.15

**Sourced:** 2026-10-06 from the official guides
- https://doc.traefik.io/traefik/migrate/v1-to-v2/
- https://doc.traefik.io/traefik/migrate/v2-to-v3/

## Current state (this repo)

`docker-compose.traefik.yml` pins **`traefik:v2.6.1`** but drives it with **v1-syntax** static
flags and labels. The config is effectively a v1 config, so the modernization is a **two-hop
migration: v1 → v2 syntax, then v2 → v3** — not a single jump.

Observed v1-isms to migrate:
- `--defaultentrypoints=http,https`, `--entrypoints=Name:http Address::80 Redirect.EntryPoint:https`,
  `--entrypoints=Name:https Address::443 Compress:true TLS`
- `--docker`, `--docker.domain`, `--docker.exposedbydefault=false`
- `--acme=true` + `--acme.*` (storage, entryPoint, httpchallenge, onHostRule, email, caServer, domains)
- `--api` (insecure dashboard) + `8080:8080` published; basic-auth label commented out
- `--loglevel=DEBUG`
- labels: `traefik.port`, `traefik.backend`, `traefik.frontend.rule=Host:${DEV_HOSTNAME}`,
  `traefik.frontend.entryPoints=http,https`

## Hop 1 — v1 → v2 (structural)

| v1 | v2 |
|---|---|
| `frontends` / `backends` | `routers` / `services` / `middlewares` |
| `traefik.frontend.rule=Host:example.com` | `traefik.http.routers.<name>.rule=Host(\`example.com\`)` |
| `traefik.port` | `traefik.http.services.<name>.loadbalancer.server.port` |
| `traefik.backend` | `traefik.http.routers.<name>.service` |
| `--defaultentrypoints` / `--entrypoints=Name:http Address::80` | `--entrypoints.web.address=:80`, `--entrypoints.websecure.address=:443` |
| `--docker` | `--providers.docker` |
| `--acme.*` | `--certificatesresolvers.<name>.acme.*` |
| HTTP→HTTPS via entrypoint `Redirect.EntryPoint` | redirect middleware / `entrypoints.web.http.redirections.entryPoint.to=websecure` |
| `--api` (insecure) | `--api.dashboard=true` + secured router (`api@internal` + auth middleware), not `--api.insecure` |

Tooling: the official **`traefik-migration-tool`** (github.com/traefik/traefik-migration-tool)
converts static config and ACME storage; label conversion is manual.

## Hop 2 — v2 → v3 (safety-net path)

v3 keeps **minimal** breaking changes and ships a **backward-compatibility switch** so routing
need not be rewritten at cutover:

- Set `core.defaultRuleSyntax: v2` to keep v2 rule syntax working under the v3 binary.
- Official **three-phase rollout**:
  1. **Prepare & test** — update install/static config, enable the BC switch.
  2. **Migrate production** — progressive deploy with monitoring + rollback readiness.
  3. **Migrate routing** — convert rules to v3 syntax later, incrementally.
- Detailed option deltas (Docker provider, ACME/certificatesresolvers, TLS options, dashboard/API,
  logging) live in v3 "Configuration changes" — verify each flag against it during Hop 2.

## Implications for the roadmap

1. **Reconcile first** (confirmed scope boundary): the live edge is suspected to run from a
   gluster bind-mount on the swarm host, not this compose file. Establish source of truth before
   migrating, or the migration targets a file that isn't deployed.
2. Sequence: reconcile → **Hop 1 (v1→v2 syntax on v2.x)** → harden (dashboard, TLS, ops) →
   **Hop 2 (v2→v3 with BC switch)** → convert routing to v3 syntax.
3. The **plaintext device entrypoint (:7442) and plain MQTT must survive every hop** — add an
   explicit entrypoint for them and verify legacy check-in after each cutover.
4. Each hop must preserve the **5-minute push→CI→Swarmpit SLA** and be independently rollback-able.
