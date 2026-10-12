# Traefik edge: live ↔ repo diff & dispositions — 2026-10-06

Phase 29 (EDGE-RECON-01 / EDGE-RECON-02). Authoritative left-hand side = the **running**
`traefik_traefik` task on `micro` (`docker service inspect`, D-08), captured in
`traefik-edge.A.pre.yml`. Right-hand sides = the two repo files:

- **R1** `~/Repositories/thinx-swarm/traefik.yml` + `traefik/tls.toml` — the committed source of truth (reconciliation target).
- **R2** `thinx-device-api/docker-compose.traefik.yml` — the dead app-repo file (now replaced by the generated mirror).

Disposition vocabulary: **reconciled** (live value written into thinx-swarm), **documented**
(cannot/should-not be reconciled — rationale given), **zero-diff** (already equal — no edit).
Semantically-equal orderings and env-var resolution are normalized before comparing (EDGE-02
ordering edge); a section present on one side and absent on the other is an explicit row, never
dropped (EDGE-02 empty edge).

## R1 — live ↔ thinx-swarm/traefik.yml + tls.toml

| # | Field / flag / label | Live (authoritative) | thinx-swarm (R1) | Disposition |
|---|---|---|---|---|
| 1 | traefik image | `traefik:v2.11` | `traefik:v2.11.0` | zero-diff (same minor; `v2.11` is the running tag, `v2.11.0` the pinned repo tag — semantically equal, no edit) |
| 2 | published host ports | `80:80`, `443:443` | `80:80`, `443:443` | zero-diff |
| 3 | static command (all flags) | 18 flags incl. all 6 entrypoints, acme, `--api`, `--pilot.token`, `--log.level=ERROR`, `exposedbydefault=true` | identical set & order | zero-diff (warts preserved, D-05) |
| 4 | `acme.email` | resolved `suculent@me.com` | `${EMAIL?Variable not set}` | zero-diff (env-var resolution; committed stays templated per D-10; resolved value only in 29-03 out-of-git snapshot) |
| 5 | docker config | `tls-config-1` → `/traefik/tls.toml` | `tls-config` name `tls-config-${CONFIG:-1}` | zero-diff (CONFIG=1) |
| 6 | mounts | `docker.sock:ro`, `traefik_traefik-public-certificates:/certificates` | `docker.sock:ro`, `traefik-public-certificates:/certificates` | zero-diff (swarm namespacing of volume name) |
| 7 | `tls.toml` body | minVersion TLS1.2, sniStrict, 11 cipher suites | identical | zero-diff (byte-identical) |
| 8 | **`security-headers` middleware** (7 header labels) | **present** on traefik service, referenced by thinx-console/api/vue as `security-headers@docker` | **ABSENT** | **reconciled** → added to thinx-swarm/traefik.yml (production wins; a redeploy from the pre-29 committed file would have dropped `security-headers@docker`) |
| 9 | admin-auth basicauth users | `${USERNAME}:<apr1/bcrypt hash>` | `${USERNAME}:${HASHED_PASSWORD}` | zero-diff (templated; hash redacted in snapshot) |
| 10 | traefik router host | `Host(micro.thinx.cloud)` | `Host(${DOMAIN})` | zero-diff (DOMAIN=micro.thinx.cloud) |

**Known warts — `documented`, deliberately NOT changed this phase (D-05/D-06), fed to the 29-03 fix-forward list:**

| Wart | Live & committed | Disposition | Target phase |
|---|---|---|---|
| `--pilot.token=<cleartext UUID>` | present in both | documented | P30 (remove; v3 rejects the flag) |
| `--providers.docker.exposedbydefault=true` | present in both | documented | P30/P33 |
| `--api` + dashboard (`api@internal`, lb port 8080) | present in both | documented | P33 (EDGE-API-01/02) |
| `--log.level=ERROR` | present in both | documented | P34 (EDGE-OPS-01, policy choice) |
| `/var/run/docker.sock:ro` raw bind | present in both | documented | P34 (EDGE-OPS-02 socket-proxy) |
| ACME email placeholder validity | templated | documented | P33 (EDGE-TLS-03) |
| duplicate `traefik-public-https.middlewares` label key (admin-auth then admin-auth,error-pages-middleware) | committed only (cosmetic, last-wins) | documented | cosmetic — no phase assigned |

## R2 — live ↔ dead `thinx-device-api/docker-compose.traefik.yml` (pre-29 blob)

| # | Field | Live | Dead R2 (pre-29) | Disposition |
|---|---|---|---|---|
| 1 | image | `traefik:v2.11` | `traefik:v2.6.1` | documented — superseded by the generated mirror (D-02); not reconciled |
| 2 | syntax | native v2 flags | v1 (`--defaultentrypoints`, `--entrypoints=Name:http Address::80 …`) | documented — dead file; cannot boot |
| 3 | `:7442` thxp / `:1194` / `:1883` / `:8883` | all defined | absent (only http/https) | documented — dead file never carried them |
| 4 | acme storage | `/certificates/acme.json` (named volume) | `/traefik/acme.json` | documented — concrete drift signal (`services/traefik/update.sh` confirms the named-volume path is authoritative) |

**R2 whole-file disposition: `documented` — superseded.** The dead `docker-compose.traefik.yml`
was replaced in 29-01 by the generated, banner-stamped read-only mirror; it is no longer a deploy
source. Its historical divergences are recorded here for the audit trail; none are reconciled.

## Phase-30 re-scope note (flag only — no action this phase)

`.planning/research/TRAEFIK-MIGRATION.md` frames P30 as a "v1→v2 syntax hop", but that analysis
describes the **dead R2 app-repo file**. Production (and the committed thinx-swarm file) is
**already `traefik:v2.11` with native v2 syntax**. So the P30 "v1→v2" hop is largely moot for
production and reduces to **retiring the dead app-repo file** (already done via the mirror) plus the
v2→v3 work. Re-scope P30 against this reconciled truth.

## Edge-map facts (not R1 drift, but required for P30 routing work)

- The traefik service publishes **only** `:80`/`:443`. The `:7442` (thxp), `:1883` (mqtt),
  `:8883` (mqtts) and `:1194` (vpn) entrypoints are **defined in traefik's command but not
  host-published by traefik**. `:7442` is published directly by `thinx_api` and `:1883`/`:8883` by
  `thinx_mosquitto`. The `mosquitto-secure` TCP router on the `mqtts` entrypoint therefore does not
  receive host traffic through traefik today. Flagged for P30 routing-model review.
- `vault`: **absent** — no vault service is deployed (EDGE-02 empty edge).
- Additional traefik-enabled stacks present beyond the named set: `fotostim_landing-com/-cz`,
  `igraczech-com_web`, `syxra-cz_web` (all plain http→https with the `le` resolver).

## Result

- thinx-swarm reconciled to equal live for the one real drift (`security-headers`); all warts
  preserved (EDGE-RECON-02 satisfied: reconciled **or** documented-with-rationale for every row).
- Mirror regenerated from the reconciled thinx-swarm SHA `eb94be5b…`;
  `node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm` → `MIRROR OK` (exit 0).
