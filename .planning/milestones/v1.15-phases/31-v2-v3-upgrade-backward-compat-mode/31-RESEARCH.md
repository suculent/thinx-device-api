# Phase 31: v2→v3 Upgrade (backward-compat mode) - Research

**Researched:** 2026-10-07
**Domain:** Traefik edge proxy major-version upgrade (v2.11 → v3.x) on Docker Swarm, backward-compat routing mode
**Confidence:** HIGH (all forced deltas verified against the official v3 migration + reference docs and the live edge capture)

## Summary

The v3 cutover is **not** confined to `thinx-swarm/traefik.yml`. The `core.defaultRuleSyntax: v2`
backward-compat switch rescues only router *rule* syntax (the `` Host(`…`) `` expressions). The v3
binary makes two classes of **forced** change the BC switch does not cover:

1. **In `traefik.yml` (static config):** the Docker provider is split — `--providers.docker` +
   `--providers.docker.swarmmode` are replaced by a separate **`--providers.swarm`** provider; the
   provider sub-options (`constraints`, `exposedByDefault`) move into the `providers.swarm` namespace;
   and `--core.defaultRuleSyntax=v2` is added. This part is small and is exactly what CONTEXT.md D-04
   scopes.

2. **Edge-wide label blast radius (the headline risk):** moving from the `docker` provider to the
   `swarm` provider **renames the provider namespace from `@docker` to `@swarm`**. Every cross-stack
   middleware reference the live edge uses — `sslheaders@docker`, `security-headers@docker` — becomes
   a dangling reference under v3, which puts the referencing router into an error state. And the
   per-service network label `traefik.docker.network=traefik-public` is a `docker`-provider label the
   `swarm` provider does not read (it wants `traefik.swarm.network`). These labels live in the thinx
   **application** stack and the sibling landing/errorpage/swarmpit/downtime stacks, **not** in
   `traefik.yml`. They are **forced** by the provider split (not deferrable, not opportunistic
   cleanup) and must be coordinated with the `traefik.yml` edit or the app routers break at cutover.

Everything else round-trips cleanly: `acme.json` is byte-compatible between v2 and v3 (same acme-go
library) so the D-02 rollback is clean; `tls.toml` needs **no** forced change to boot v3; ACME
resolver flags are unchanged; all six entrypoints, `--api`, `--log`, `--accesslog` are unchanged.

**Primary recommendation:** Pin **`traefik:v3.7.14`**. Make the forced `traefik.yml` static delta
(swarm provider + `core.defaultRuleSyntax=v2`), and in the **same change** rename every live
`@docker` middleware reference to `@swarm` and every `traefik.docker.network` label to
`traefik.swarm.network` across the deployed stacks. Validate with a no-host-port boot-and-discover
instance (`--api.insecure` + `docker exec` → `/api/http/routers`) asserting **every** router is in
`enabled` state (not merely discovered) before the `:80`/`:443` maintenance-window cutover.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Phase 1 of the official rollout is a **boot-and-discover test** of the converted v3 config,
  not a parallel serving instance. Run `traefik:v3.x` with the converted static config +
  `core.defaultRuleSyntax: v2` against the real docker/swarm provider while owning **no host ports**
  (or alternate ports), and confirm (a) the static config parses under v3 and (b) the new
  `providers.swarm` discovers **every** expected router/service. Only then do the live `:80`/`:443`
  cutover in a maintenance window.
- **D-01a:** A parallel v3 service on alternate ports with full E2E was considered and **rejected**:
  two instances contend on the single `acme.json` named volume.
- **D-02:** **Staged-ready rollback, roll back only on regression.** Capture a fresh out-of-git 600
  snapshot of the working v2.11 edge immediately pre-cutover (resolved config + `acme.json`, dated, on
  `micro`); document and dry-verify the v3→v2.11 service-update/image-retag procedure; execute for real
  only on regression.
- **D-03:** Pin to the **current stable Traefik v3.x release by its exact patch tag**, never `@sha256`.
  Rollback target is `v2.11.0`.
- **D-04:** **Minimum-to-boot v3 + BC switch only.** Forced static changes only:
  `--providers.docker.swarmmode` → `providers.swarm`; removed/renamed v3 static flags; add
  `core.defaultRuleSyntax: v2`. **`exposedbydefault` stays `true`** — only moved into `providers.swarm`.
  All routing-rule conversion deferred to P32. No opportunistic cleanup of rows #3–#7.
- **D-05:** `:7442` (thxp, `thinx_api`) and plain MQTT/MQTTS (`:1883`/`:8883`, `thinx_mosquitto`) keep
  working through the cutover. **Direct-publish model unchanged** (Traefik owns only `:80`/`:443`).
  **No fix may close, redirect, or TLS-enforce these paths** (AGENTS.md operator decision 2026-10-04).

### Claude's Discretion
- Exact v3 patch number, the precise set of v3 static-flag renames/removals, and the boot-and-discover
  invocation mechanics (alt-port vs no-port, how to assert `providers.swarm` router/service discovery).
- Snapshot file naming + exact `service update`/retag commands — follow the dated
  `swarm-configs/*.pre/*.post` convention and the P29/P30 rollback-snapshot pattern.
- Mirror regeneration sequencing — any edit to `thinx-swarm` flows through
  `generate-traefik-mirror.js` → `check-traefik-mirror.js` (must return `MIRROR OK`).

### Deferred Ideas (OUT OF SCOPE)
- Native v3 routing syntax + remove BC switch → **P32** (EDGE-MIG-03). BC switch stays on through P31.
- `exposedbydefault` → false → **P33**. Stays `true`, moved only into `providers.swarm`.
- Dashboard/API lockdown (port 8080, `--api.insecure`), ACME email/perms/renewal, TLS min + HSTS → **P33**.
- Log level, read-only socket-proxy, SLA close-out → **P34**.
- Full removal of vestigial entrypoints / dead `mosquitto-secure` router → later cleanup, annotate-only.
- Parallel v3 serving instance for full E2E pre-cutover → rejected for P31 (D-01a).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDGE-MIG-02 | Upgrade the edge from `traefik:v2.11.0` to current stable v3.x with `core.defaultRuleSyntax: v2`, following the official three-phase rollout, rollback-able | §Standard Stack (v3.7.14 pin), §Forced Static-Config Delta, §Three-Phase Rollout Mechanics, §Rollback Safety |
| EDGE-MIG-04 | Plaintext `:7442` + plain MQTT survive the hop | §Device Plaintext Paths — direct-publish model is untouched by the v3 static delta; re-verify at human-verify gate |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTPS/HTTP ingress + routing (`:80`/`:443`) | Edge (Traefik) | — | Traefik owns only these two host ports; all web routers live here |
| ACME cert issuance/renewal (`le` resolver) | Edge (Traefik) | Storage (named volume `acme.json`) | TLS-ALPN challenge on `:443`; storage is the single shared `acme.json` |
| Service discovery (swarm labels) | Edge (Traefik `swarm` provider) | Docker Swarm API (`docker.sock`) | v3 reads swarm-service deploy labels via `providers.swarm` |
| Legacy device plaintext `:7442` (thxp) | API / Backend (`thinx_api`, direct publish) | — | **Not** routed through Traefik; `thinx_api` publishes `*:7442->7442` directly |
| MQTT / MQTTS (`:1883`/`:8883`) | Messaging (`thinx_mosquitto`, direct publish) | — | **Not** routed through Traefik; `thinx_mosquitto` publishes directly |
| Cross-stack middleware (`security-headers`, `sslheaders`) | Edge (defined on traefik service labels) | App stacks reference them by `@provider` suffix | Provider-namespace rename (`@docker`→`@swarm`) is the blast radius |

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `traefik` (official image) | **`v3.7.14`** | Edge reverse proxy / ingress | Current stable v3 line; newest security + bug fixes; BC switch covers routing |

**Version verification** `[VERIFIED: github.com/traefik/traefik/releases]` — `v3.7.14` is the latest
stable (non-RC) release, published **2026-10-06**. The v3.7 line is current (not EOL); v3.6.25 is the
prior minor. Pin the **exact patch tag `traefik:v3.7.14`**, never `@sha256` (operator convention,
D-03; mirrors the InfluxDB pin-by-tag memory). Rollback target remains `traefik:v2.11.0`.
`[CITED: github.com/traefik/traefik/releases]`

> **Planning-time re-check:** v3.7.14 shipped the day before this research. The planner should re-run
> the release lookup at planning time; if a `v3.7.15+` patch has shipped, pin that (same v3.7 line).
> Treat a jump to a *new minor* (v3.8.x) as needing a fresh delta re-check, not an automatic bump.

### No new libraries, packages, or code dependencies
This is an ops/image-tag migration. No npm/pip/cargo packages are added. The only artifact edits are
YAML/TOML config in the external `thinx-swarm` repo plus the generated mirror in this repo.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `traefik:v3.7.14` | Docker Hub (official image `traefik`) | image line 5+ yrs; this tag 2026-10-06 | official image, >1B pulls | github.com/traefik/traefik | OK | Approved — official image, exact tag pin |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*(No ecosystem package manager is involved; the Docker image is the official Traefik image verified
against the upstream GitHub release list.)*

## Forced Static-Config Delta — `thinx-swarm/traefik.yml` (v2.11 → v3)

The current live static command (verified against both the committed `thinx-swarm/traefik.yml` and the
live capture `traefik-edge.A.pre.yml`) and its exact v3 form:

| # | v2.11 form (current) | v3 form (forced) | Forced / Deferrable | Source |
|---|----------------------|------------------|---------------------|--------|
| 1 | `--providers.docker` | **remove** (replaced by swarm provider) | FORCED | `[VERIFIED: thinx-swarm/traefik.yml:97]` `[CITED: doc.traefik.io/traefik/migrate/v2-to-v3-details/]` |
| 2 | `--providers.docker.swarmmode` | **remove** — v3 rejects it (fails to start) | FORCED | `[VERIFIED: thinx-swarm/traefik.yml:103]` `[CITED: v2-to-v3-details]` |
| 3 | `--providers.docker.constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)` | `--providers.swarm.constraints=Label(\`traefik.constraint-label\`, \`traefik-public\`)` | FORCED | `[VERIFIED: thinx-swarm/traefik.yml:99]` `[CITED: doc.traefik.io/traefik/.../providers/swarm/]` |
| 4 | `--providers.docker.exposedbydefault=true` | `--providers.swarm.exposedByDefault=true` (**stays `true`** per D-04/P33) | FORCED (rename only; value unchanged) | `[VERIFIED: thinx-swarm/traefik.yml:101]` `[CITED: providers/swarm reference]` |
| 5 | *(no provider enable flag besides docker)* | **add `--providers.swarm`** (enables the swarm provider) | FORCED | `[CITED: v2-to-v3-details]` |
| 6 | *(none)* | **add `--core.defaultRuleSyntax=v2`** (BC switch) | FORCED (the whole point of the hop) | `[CITED: doc.traefik.io/traefik/migrate/v2-to-v3/]` |
| 7 | `--entrypoints.{http,https,vpn,mqtt,mqtts,thxp}.address=:PORT` | **unchanged** — entrypoint address syntax identical in v3 | no change | `[VERIFIED: thinx-swarm/traefik.yml:105-123]` `[CITED: v2-to-v3-details]` |
| 8 | `--certificatesresolvers.le.acme.email=${EMAIL}` / `.storage=/certificates/acme.json` / `.tlschallenge=true` | **unchanged** — no ACME flag renames in v2→v3 | no change | `[VERIFIED: thinx-swarm/traefik.yml:125-129]` `[CITED: v2-to-v3-details — no ACME changes documented]` |
| 9 | `--accesslog` / `--log` / `--log.level=ERROR` | **unchanged** — valid in v3 (log-level policy is P34, out of scope) | no change | `[VERIFIED: thinx-swarm/traefik.yml:131-134]` `[CITED: v2-to-v3-details]` |
| 10 | `--api` | **unchanged** — still enables API/dashboard; `api@internal` router unchanged (dashboard lockdown is P33) | no change | `[VERIFIED: thinx-swarm/traefik.yml:136]` `[CITED: doc.traefik.io/traefik/.../api-dashboard/]` |

### `providers.swarm` option reference (defaults)
`[CITED: doc.traefik.io/traefik/v3.4/reference/install-configuration/providers/swarm/]`

| Option | Default | CLI flag | Needed here? |
|--------|---------|----------|--------------|
| `endpoint` | `unix:///var/run/docker.sock` | `--providers.swarm.endpoint` | **No** — `docker.sock` is already mounted; default is the socket. Do **not** add a `tcp://…:2377` endpoint (that caused "client version too old" / non-routing in community reports). |
| `exposedByDefault` | `true` | `--providers.swarm.exposedByDefault` | **Yes** — carry the existing `true` value (D-04) |
| `constraints` | `""` | `--providers.swarm.constraints` | **Yes** — carry the existing `Label(...)` constraint |
| `network` | `""` | `--providers.swarm.network` | set per-service via `traefik.swarm.network` label, not globally |
| `watch` | `true` | `--providers.swarm.watch` | default fine |
| `refreshSeconds` | `15s` | `--providers.swarm.refreshSeconds` | default fine |

> **CLI casing note:** Traefik CLI flags are case-insensitive, so `--providers.swarm.exposedbydefault=true`
> and `--providers.swarm.exposedByDefault=true` are equivalent. The docs use camelCase; match the repo's
> existing lowercase style for the mirror-diff to stay clean. `[ASSUMED]` (flag case-insensitivity is
> long-standing Traefik behavior but not re-verified against a v3.7 falsification run this session.)

### `core.defaultRuleSyntax` placement & scope
- **File form** (install/static config): `core:` → `defaultRuleSyntax: v2`.
  CLI form: `--core.defaultRuleSyntax=v2`. `[CITED: doc.traefik.io/traefik/migrate/v2-to-v3/ + v3.3 v2-to-v3-details]`
- The current edge is driven entirely by **CLI flags** in the `command:` block, so add the **CLI flag
  form** `--core.defaultRuleSyntax=v2` to keep the mirror generator/diff consistent with the existing
  style.
- It **only** affects router *rule* matcher syntax (`` Host(`…`) ``, `PathPrefix`, etc.) — it does
  **not** affect static flags or the provider split. `[CITED: migrate/v2-to-v3-details — "controls whether
  routers default to v2 or v3 rule matcher syntax"]` This is why the swarm-provider delta is forced
  independently of the BC switch.

### The traefik service's own network label
`traefik.docker.network=traefik-public` on the traefik service's deploy labels
`[VERIFIED: thinx-swarm/traefik.yml:27]` → **`traefik.swarm.network=traefik-public`** under the swarm
provider. `[CITED: v3.4 reference dynamic-configuration/swarm — "traefik.swarm.network"]`

## Edge-Wide Label Blast Radius (FORCED, extends beyond `traefik.yml`)

**This is the single highest-risk finding.** The `docker`→`swarm` provider switch renames the provider
namespace: resources read by the swarm provider are suffixed `@swarm`, not `@docker`. Any
fully-qualified `@docker` reference becomes dangling, and any `traefik.docker.*` label is not read by
the swarm provider. These live in the **application and sibling stacks**, not in `traefik.yml`.

### Live `@docker` references that break (from the authoritative live capture)
`[VERIFIED: .planning/runbooks/swarm-configs/traefik-edge.A.pre.yml:117-130]`

| Live service | Routers | `@docker` middleware refs → must become `@swarm` |
|--------------|---------|---------------------------------------------------|
| `thinx_api` | `thinx-api-http`, `thinx-api-https`, `thinx-api-ws` | `sslheaders@docker`, `security-headers@docker` → `sslheaders@swarm`, `security-headers@swarm` |
| `thinx_console` | `thinx-console-http`, `thinx-console-https` | `security-headers@docker` → `security-headers@swarm` |
| `thinx_vue` | `thinx-vue-console-http`, `thinx-vue-console-https` | `security-headers@docker` → `security-headers@swarm` |

**Why forced, not deferrable:** a router referencing a non-existent middleware is placed in an **error
state** by Traefik and will not serve — this is an outage for `app.thinx.cloud` (thinx_api),
`rtm.thinx.cloud` (console) and `console.thinx.cloud` (vue), not a cosmetic warning. Specifically,
`sslheaders@docker` injects `X-Forwarded-Proto=https`, which per the SEC-PROXY-01 comment
`[VERIFIED: docker-swarm.yml:363-366]` is what lets the API mark session cookies `Secure` and preserves
the WebSocket upgrade; losing it is a functional regression. `[ASSUMED]` on the exact "router → error
state / 404" failure mode — Traefik's long-standing behavior, but the **boot-and-discover test is the
falsification**: it will show these routers non-`enabled` under v3 before any live cutover.

### `traefik.docker.network` labels that must become `traefik.swarm.network`
`[VERIFIED: grep over ~/Repositories/thinx-swarm 2026-10-07]` — every traefik-enabled stack carries it:

| File | Lines |
|------|-------|
| `thinx-swarm/traefik.yml` | 27 (traefik's own) |
| `thinx-swarm/thinx.yml` | 44, 100, 229, 296, 345, 413, 457 |
| `thinx-swarm/landing.yml` | 36 |
| `thinx-swarm/errorpage.yml` | 20 |
| `thinx-swarm/downtime.yml` | 20 |
| `thinx-swarm/swarmpit.yml` | 28 |
| `thinx-swarm/vault.yml` | 35 (vault **not deployed** — EDGE-02 empty edge; skip or carry harmlessly) |

Under the swarm provider the `traefik.docker.network` label is not read; Traefik falls back to
network auto-selection. For services attached to more than one overlay network this can select the
wrong network and 502 the backend. Treat the rename as **forced for correctness** on every live
traefik-enabled service and confirm reachability at boot-and-discover. `[ASSUMED]` that an unread
network label always mis-selects — it may work when `traefik-public` is the only shared network; the
boot-and-discover backend-reachability check is the arbiter.

### CRITICAL open question for the planner — which thinx stack file is live?
`thinx-swarm/restart.sh` / `thinx.sh` deploy **`./thinx.yml`** (thinx-swarm).
`[VERIFIED: ~/Repositories/thinx-swarm/restart.sh, thinx.sh]` **But** that file is **stale** relative
to production: it contains only `sslheaders@docker` at line 254 and lacks the `thinx-api-ws` router and
the `security-headers@docker` references that the **live capture** proves are running
`[VERIFIED: traefik-edge.A.pre.yml:117-130]`. The richer, live-matching definitions are in **this
repo's `docker-swarm.yml`** (`sslheaders@docker,security-headers@docker` at line 349,
`security-headers@docker` at 430, `thinx-api-ws` router at 371-379)
`[VERIFIED: docker-swarm.yml:349,371-379,430]`. **Before the v3 cutover the planner must confirm which
file is the authoritative live thinx-stack source and enumerate the complete `@docker` reference set in
THAT file** — otherwise a subset of routers silently breaks at cutover. This thinx-stack reconciliation
gap is adjacent to P31 (it is an app-stack, not an edge-static, concern) but the v3 provider split is
exactly what makes it load-bearing now.

## Device Plaintext Paths (EDGE-MIG-04 — hard constraint)

**The v3 static delta touches none of the device paths.** `[VERIFIED: traefik-edge.A.pre.yml:107-113]`:

- `:7442` (thxp) — entrypoint defined in traefik's command but **not host-published by traefik**;
  `thinx_api` publishes `*:7442->7442` **directly**. Preserved automatically; the `--entrypoints.thxp.address=:7442`
  line stays byte-identical (entrypoint syntax unchanged in v3).
- `:1883` (mqtt) / `:8883` (mqtts) — published **directly** by `thinx_mosquitto`; the `mosquitto-secure`
  TCP router on the `mqtts` entrypoint receives no host traffic through Traefik. Unchanged.
- `:1194` (vpn) — vestigial entrypoint, no router, not published. Unchanged.

The direct-publish model is unchanged (Traefik still owns only `:80`/`:443`), so EDGE-MIG-04 is
re-verified by **preserving + checking** the direct model, not by moving traffic. **No P31 change may
close, redirect, or TLS-enforce these paths** (AGENTS.md operator decision 2026-10-04). Re-verify the
full legacy flow (device check-in → OTT redemption → firmware download over `:7442` + plain MQTT) at the
human-verify gate, reusing the P29/P30 verify commands and the `console-retest` / device-MCP paths.

> Vestigial-entrypoint annotations (P30 D-03, comments only) must be carried through the v3 edit
> unchanged. `[VERIFIED: thinx-swarm/traefik.yml:108-123]`

## ACME / certificatesresolvers under v3

- **No syntax change required to keep the `le` resolver working.** `--certificatesresolvers.le.acme.email`,
  `.acme.storage=/certificates/acme.json`, `.acme.tlschallenge=true` are all valid, unchanged, in v3.
  `[CITED: migrate/v2-to-v3-details — no ACME/certificatesresolvers changes documented]`
- Storage stays the single `acme.json` on the named volume `traefik_traefik-public-certificates`
  (`/certificates/acme.json` in-container; `/var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json`
  on `micro`). `[VERIFIED: services/traefik/update.sh:37; thinx-swarm/traefik.yml:127]`
- Email/perms/renewal **hardening is P33** — out of scope. The one stale/expired entry
  (`checkout.qooldata.com`, 2025-07-06) is a P33 finding, not touched here.
  `[VERIFIED: traefik-acme-inventory.2026-10-06.md:31,42-44]`

## TLS options (`traefik/tls.toml`)

- **No forced change to boot v3.** The `tls.options.default` block (`minVersion = "VersionTLS12"`,
  `sniStrict = true`, the 11 `cipherSuites`) is valid, unchanged, in v3. `[VERIFIED: ~/Repositories/thinx-swarm/traefik/tls.toml]`
  `[CITED: migrate/v2-to-v3-details]`
- The only TLS-area removal in v2→v3 is `tls.caOptional` on **providers** (not present in this config).
  `[CITED: migrate/v2-to-v3-details — "tls.caOptional ... removed"]`
- TLS min-version / HSTS **hardening is P33** — out of scope. Carry `tls.toml` byte-identical.

## Three-Phase Rollout Mechanics (official) + D-01 boot-and-discover

Official rollout: **(1) Prepare & test → (2) Migrate production → (3) Migrate routing.**
`[CITED: doc.traefik.io/traefik/migrate/v2-to-v3/]` Mapped to this edge:

### Phase 1 — Prepare & test = D-01 boot-and-discover (no host ports)
Goal: prove (a) the converted static config **parses** under v3 and (b) `providers.swarm` discovers
**every** router/service **in `enabled` state** (not just present) — this is what catches the
`@docker`→`@swarm` breakage before it hits production.

Concrete mechanism:
1. Deploy a **throwaway** v3.7.14 swarm service on the `traefik-public` + manager node, with:
   - the **converted** static command (swarm provider + `--core.defaultRuleSyntax=v2`),
   - **no published host ports** (own nothing — `:80`/`:443` stay with the live v2.11 service),
   - `--api.insecure=true` so the API is reachable inside the container on the `traefik` entrypoint
     (default **`:8080`**), `[CITED: api-dashboard — "--api.insecure ... on the entryPoint named traefik"]` `[ASSUMED: default port 8080]`
   - **ACME neutralized** to avoid the dual-`acme.json` hazard (D-01a): either do **not** mount the
     shared `traefik_traefik-public-certificates` volume, or point `--certificatesresolvers.le.acme.storage`
     at a throwaway path (e.g. `/tmp/acme-test.json`). With no `:443`, TLS-ALPN challenges cannot run
     anyway, but neutralizing storage guarantees the test never writes the production `acme.json`.
2. Assert discovery via the Traefik API from inside the task (no host port needed):
   ```bash
   # resolve the test task's container, then exec curl/wget against localhost:8080
   docker exec <test-task> wget -qO- http://localhost:8080/api/http/routers
   docker exec <test-task> wget -qO- http://localhost:8080/api/http/services
   docker exec <test-task> wget -qO- http://localhost:8080/api/rawdata   # errors + dependency state
   ```
   `[CITED: api-dashboard — /api/http/routers, /api/http/services, /api/rawdata]`
3. **Assert, don't eyeball:** every router in the live edge-routing map must appear with
   `"status":"enabled"` (routers in `"disabled"`/error state signal the `@docker` dangling-reference
   problem). Expected router set to compare against `[VERIFIED: traefik-edge.A.pre.yml:117-157]`:
   `thinx-api-http/https/ws`, `thinx-console-http/https`, `thinx-vue-console-http/https`,
   `landing-page-http/https`, `error-router`, `swarmpit-http/https`, `downtime-http/https`,
   `traefik-public-http/https`, plus `fotostim_landing-com/-cz`, `igraczech-com_web`, `syxra-cz_web`;
   TCP router `mosquitto-secure` on the `mqtts` entrypoint.
   Example gate:
   ```bash
   docker exec <test-task> wget -qO- http://localhost:8080/api/http/routers \
     | jq -r '.[] | select(.status!="enabled") | .name + "  " + .status'
   # MUST print nothing. Any line = a router v3 could not enable (likely an @docker ref) -> fix before cutover.
   ```
4. `traefik healthcheck` CLI is **not** usable as-is — it requires the `--ping` entrypoint, which this
   config does not enable; adding `--ping` is out of scope. Use the API assertion above instead.
   `[ASSUMED: healthcheck requires --ping]` (training knowledge; not re-verified this session — the API
   path is the recommendation regardless).

### Phase 2 — Migrate production (maintenance window)
`docker service update` the live `traefik_traefik` service to `traefik:v3.7.14` with the converted
static command (same change that fixed the `@docker`/network labels in the app stacks). Monitor
`/api/http/routers` + real HTTPS probes to each host. Keep the D-02 rollback one command away.

### Phase 3 — Migrate routing → **deferred to P32** (EDGE-MIG-03)
The BC switch stays on; rule conversion is out of P31 scope.

## Rollback Safety (D-02) — does v3→v2.11 round-trip?

**Yes — the rollback is clean.** `[CITED: community.traefik.io "Is acme.json from traefik v2 compatible
with v3?" + SSD Nodes v2→v3 migration guide]`

- **`acme.json` is format-compatible both directions.** v2 and v3 use the same acme-go library and the
  same JSON schema (`.le.Certificates[].{domain,certificate,key}` + `Account`), which is exactly the
  shape `services/traefik/update.sh` already parses `[VERIFIED: services/traefik/update.sh:52-54]`. v3
  does **not** rewrite `acme.json` into a format v2.11 cannot read — **this is the critical
  rollback-safety answer: no one-way migration, the file round-trips.**
  > `[ASSUMED]` qualifier: "no schema rewrite on v3 write-back" rests on the shared-library claim from
  > community + third-party sources, not an official v2→v3 statement and not a round-trip test this
  > session. The D-02 snapshot (below) makes this moot in practice — rollback restores the pre-cutover
  > `acme.json` rather than trusting v3's in-place writes.
- **Rollback mechanics** = exactly the P30-proven machinery (D-06, demonstrated 2026-10-07):
  1. Capture a fresh **out-of-git 600** pre-cutover snapshot on `micro` next to the P30 one
     (`/mnt/data/edge-rollback/traefik-2026-10-06/`): the resolved static config **and** a copy of
     `acme.json`. `[VERIFIED: 31-CONTEXT.md:184-186]`
  2. Rollback = `docker service update --image traefik:v2.11.0 traefik_traefik` **plus** reverting the
     static-command args to the captured v2.11 set (the swarm-provider flags must revert too, since
     v2.11 does not know `--providers.swarm`), and restoring `acme.json` from the snapshot if it was
     touched. The app-stack `@swarm` label reverts to `@docker` ride the same rollback.
  3. Because the rollback reverts **both** the image tag **and** the static/label edits together, the
     only non-trivial round-trip concern is `acme.json`, which the snapshot covers. **Losing `acme.json`
     triggers the Let's Encrypt duplicate-certificate rate limit** `[CITED: SSD Nodes migration guide]` —
     hence the mandatory snapshot before cutover.

## Runtime State Inventory

> This is a config/image migration touching a live swarm edge — runtime state matters.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Single `acme.json` on named volume `traefik_traefik-public-certificates` (24 certs, 1 expired) `[VERIFIED: traefik-acme-inventory.2026-10-06.md:11,46]` | **Snapshot before cutover** (D-02); format round-trips v2↔v3, no migration |
| Live service config | Running `traefik_traefik` swarm service static command + deploy labels (authoritative over on-disk) `[VERIFIED: traefik-edge.A.pre.yml]`; `providers.swarm` must rediscover all routers | Boot-and-discover assertion before cutover |
| Live service config | App-stack deploy labels carrying `@docker` refs + `traefik.docker.network` on `thinx_api`/`thinx_console`/`thinx_vue` + siblings — **live ≠ stale thinx-swarm/thinx.yml** | Confirm live thinx-stack source; rename `@docker`→`@swarm`, `traefik.docker.network`→`traefik.swarm.network` |
| OS-registered state | None — no Task Scheduler / cron / launchd registrations embed traefik version; swarm placement floats via `node.labels.Traefik==true` constraint `[VERIFIED: thinx-swarm/traefik.yml:21-22]` | None (query the node for placement; swarm-node memory) |
| Secrets / env vars | `${USERNAME}`/`${HASHED_PASSWORD}` (admin-auth), `${EMAIL}` (ACME), `${DOMAIN}`, `${CONFIG}` — all templated, unchanged by v3 `[VERIFIED: thinx-swarm/traefik.yml:38,125,59,164]` | None — keep templated (P29 D-12); no key material in committed artifacts |
| Build artifacts | Generated mirror `docker-compose.traefik.yml` + its `mirror-sha256` banner `[VERIFIED: docker-compose.traefik.yml:1-2]` | Regenerate via `generate-traefik-mirror.js`; `check-traefik-mirror.js` must return `MIRROR OK` |

**Nothing found in OS-registered state:** verified — traefik runs as a swarm service, no host-level
version registrations.

## Common Pitfalls

### Pitfall 1: Treating the BC switch as covering the whole migration
**What goes wrong:** assuming `core.defaultRuleSyntax: v2` makes v3 a drop-in.
**Why:** the BC switch only rescues router *rule* syntax; the provider split and the `@docker`→`@swarm`
namespace are orthogonal and forced.
**Avoid:** make the swarm-provider static delta **and** the `@docker`/network label renames in the same
change; validate with boot-and-discover.
**Warning signs:** routers present but `status != "enabled"` in `/api/http/routers`.

### Pitfall 2: Adding an explicit `tcp://…:2377` swarm endpoint
**What goes wrong:** copying the doc example `--providers.swarm.endpoint=tcp://127.0.0.1:2377` breaks
routing / ACME ("client version too old") on socket-mounted setups. `[CITED: community.traefik.io SOLVED threads]`
**Avoid:** omit `endpoint` entirely — the default `unix:///var/run/docker.sock` matches the existing
`docker.sock:ro` mount.

### Pitfall 3: Losing `acme.json` on rollback
**What goes wrong:** rollback without the pre-cutover `acme.json` → Let's Encrypt duplicate-cert rate
limit; some hosts fail to serve TLS. `[CITED: SSD Nodes migration guide]`
**Avoid:** the D-02 out-of-git 600 snapshot of `acme.json` is mandatory before cutover.

### Pitfall 4: Editing the generated mirror or forgetting to regenerate it
**What goes wrong:** hand-editing `docker-compose.traefik.yml`, or editing `thinx-swarm` without
regenerating → CI staleness gate fails.
**Avoid:** edit `thinx-swarm/traefik.yml` only; run `generate-traefik-mirror.js` then
`check-traefik-mirror.js` (expect `MIRROR OK`). `[VERIFIED: 31-CONTEXT.md:89-90,149-161]`

### Pitfall 5: Deploying the stale `thinx-swarm/thinx.yml`
**What goes wrong:** `restart.sh` deploys a thinx.yml that lacks live routers (`thinx-api-ws`) and refs
(`security-headers@docker`) — a plain redeploy during the window could itself drop live routing,
independent of v3.
**Avoid:** resolve the live-source question (above) before touching the thinx stack.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Asserting all routers discovered | A log-scraping regex | Traefik API `/api/http/routers` + `jq` status filter | Structured, exact, catches error-state routers the logs may not surface |
| Converting `acme.json` v2→v3 | A JSON migration script | Nothing — format is identical | No migration exists or is needed; a script would risk corrupting the single cert store |
| Cert export to MQTT/API | A new exporter | Existing `services/traefik/update.sh` | Already parses the stable acme.json schema |

## State of the Art

| Old (v2.11) | Current (v3.7.x) | When changed | Impact |
|-------------|------------------|--------------|--------|
| `--providers.docker` + `--providers.docker.swarmmode` | separate `--providers.swarm` provider | v3.0 | FORCED static change; `swarmmode` flag rejected by v3 |
| `traefik.docker.network` (swarm services) | `traefik.swarm.network` | v3.x (swarm provider) | FORCED label rename on every swarm service |
| `@docker` provider suffix (swarm resources) | `@swarm` | v3.0 | FORCED cross-stack reference rename |
| `IPWhiteList` middleware | `IPAllowList` | v3.0 | not used here — no action |
| `experimental.http3` | entrypoint HTTP/3 config | v3.0 | not used here — no action |
| headers `sslRedirect`/`sslHost`/`featurePolicy` etc. | removed | v3.0 | not used in `security-headers`/`sslheaders` — no action `[VERIFIED: thinx-swarm/traefik.yml:47-53; thinx.yml:255-258]` |

**Deprecated/outdated:** `--pilot.token` already removed in P30 (v3 would reject it)
`[VERIFIED: thinx-swarm/traefik.yml:137-139]`.

## Project Constraints (from AGENTS.md)

- **Keep `:7442` + plain MQTT working** — no close/redirect/TLS-enforce (operator decision 2026-10-04).
  Honored: direct-publish model untouched by the v3 static delta.
- **Deploy flow:** push `thinx-swarm` / parent repo to `thinx-staging` → CircleCI builds → Swarmpit
  rolls out. Respect the 5-minute push→CI→Swarmpit SLA.
- **`micro` access:** `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`; swarm path
  `/mnt/gluster/deployment/swarm`. Call the ssh form literally (micro-ssh-direct-form memory).
- **Traefik placement floats** — always query the node; `docker service ls` unreliable under load
  (swarm-node-topology memory).
- **Committed artifacts stay redacted/templated** (P29 D-12) — no cleartext creds/hashes/keys in any
  committed file, including this RESEARCH.md.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `--api.insecure` exposes the API on default port `:8080` | Rollout Mechanics | Low — boot-and-discover curl target port; discover actual via `docker exec … traefik --help` or logs if wrong |
| A2 | A router with a dangling middleware ref goes to error/non-`enabled` state (not silently served) | Blast Radius / Rollout | Low — boot-and-discover is the falsification; outcome (fix the ref) is identical either way |
| A3 | An unread `traefik.docker.network` label can mis-select the backend network on multi-network services | Blast Radius | Medium — may work if `traefik-public` is the only shared net; backend-reachability check at boot-and-discover decides; rename is safe regardless |
| A4 | v3 does not rewrite `acme.json` into a v2-incompatible format (round-trips) | Rollback Safety | Low — community/3rd-party sourced, not official; D-02 snapshot makes it moot (restore beats trust) |
| A5 | `traefik healthcheck` requires `--ping` (not enabled here) | Rollout Mechanics | Low — API assertion is the recommendation regardless |
| A6 | CLI flags are case-insensitive (`exposedbydefault` == `exposedByDefault`) | Static Delta | Low — match repo lowercase style; v3 would reject only a genuinely unknown flag |

## Open Questions (RESOLVED)

Both questions require live swarm access the researcher could not perform; both are resolved
**operationally inside the plan**, each ahead of the one-way `:80`/`:443` cutover. They are not
unresolved going into execution — they are deferred to the live step that can actually answer them.

1. **Which thinx-stack file is the authoritative live source?** `restart.sh` deploys stale
   `thinx-swarm/thinx.yml`; live matches this repo's `docker-swarm.yml`. The complete `@docker`
   reference set to rename depends on the answer.
   - Known: live has `sslheaders@docker` + `security-headers@docker` on thinx_api; `security-headers@docker`
     on console + vue; `thinx-api-ws` router. `[VERIFIED: traefik-edge.A.pre.yml:117-130]`
   - Unclear: whether the next `docker stack deploy` uses thinx-swarm/thinx.yml (stale) or docker-swarm.yml.
   - **RESOLVED (31-01 Task 1):** the plan runs `ssh micro "docker service inspect thinx_api thinx_console
     thinx_vue …"` to establish the authoritative live source and enumerate the full `@docker` rename
     inventory **before** the authoritative rename edit (Task 2). The rename set is whatever that live
     inspect shows.
2. **Is any live traefik-enabled service attached to >1 overlay network** (making the
   `traefik.docker.network`→`traefik.swarm.network` rename strictly required vs. harmless)?
   - **RESOLVED (31-01 Task 3):** graded at boot-and-discover via `docker service inspect <svc>
     --format '{{json .Spec.TaskTemplate.Networks}}'`; the rename is applied everywhere regardless
     (safe), and the per-router `status==enabled` gate falsifies any mis-selected backend network
     before the live cutover.

## Sources

### Primary (HIGH confidence)
- `doc.traefik.io/traefik/migrate/v2-to-v3/` — BC switch (`core.defaultRuleSyntax: v2`), three-phase rollout.
- `doc.traefik.io/traefik/migrate/v2-to-v3-details/` (+ v3.3 mirror) — provider split, removed options
  (`tls.caOptional`, `IPWhiteList`→`IPAllowList`, headers removals, `experimental.http3`), `--core.defaultRuleSyntax` forms.
- `doc.traefik.io/traefik/v3.4/reference/install-configuration/providers/swarm/` — swarm provider options + defaults.
- `doc.traefik.io/traefik/v3.4/reference/dynamic-configuration/swarm/` — `traefik.swarm.network`, `traefik.swarm.lbswarm`.
- `doc.traefik.io/traefik/.../api-dashboard/` — `/api/http/routers`, `/api/http/services`, `/api/rawdata`, `--api.insecure`.
- `github.com/traefik/traefik/releases` — v3.7.14 (2026-10-06) is current stable.
- In-repo verified: `thinx-swarm/traefik.yml`, `thinx-swarm/traefik/tls.toml`, `docker-compose.traefik.yml`,
  `docker-swarm.yml`, `services/traefik/update.sh`, `.planning/runbooks/swarm-configs/traefik-edge.A.pre.yml`,
  `traefik-acme-inventory.2026-10-06.md`, `restart.sh`/`thinx.sh`.

### Secondary (MEDIUM confidence)
- `community.traefik.io` — acme.json v2↔v3 compatibility; `tcp://…:2377` endpoint pitfall.
- SSD Nodes "Traefik v2 to v3 migration" — acme.json carry-over + rate-limit-on-loss warning.

## Metadata

**Confidence breakdown:**
- v3 image pin (v3.7.14): HIGH — verified against upstream release list, dated.
- Forced static delta + swarm provider options: HIGH — official reference + verified current config.
- `@docker`→`@swarm` blast radius: HIGH that it is forced; MEDIUM on exact live reference set (pending
  the live-source open question).
- acme.json rollback round-trip: MEDIUM (community/3rd-party), de-risked to HIGH operationally by the D-02 snapshot.
- Device paths / TLS / ACME "no forced change": HIGH — verified config + official "no changes documented".

**Research date:** 2026-10-07
**Valid until:** 2026-11-07 (stable; re-check the exact v3.7 patch tag at planning time)
