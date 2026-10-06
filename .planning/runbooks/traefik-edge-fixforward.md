# Traefik edge — fix-forward list (P30–P34)

Phase 29 (EDGE-RECON) captured and reconciled the live Traefik edge **with zero cleanup**
(D-05/D-06): every wart below was mirrored into the committed source of truth exactly as it runs in
production, so the Phase-30 rollback baseline equals current production. **Nothing in this list was
changed in Phase 29.** Each item is handed to the migration/hardening phases.

**Hard constraint for every fix below (AGENTS.md, operator decision 2026-10-04):** the `:7442`
plaintext device port and plain (non-TLS) MQTT must keep working — legacy `__DISABLE_HTTPS__`
devices check in, redeem OTT tokens and download firmware over them. No fix may close, redirect or
TLS-enforce those paths.

| # | Wart (where it lives) | Preserved value | Target phase | Requirement |
|---|---|---|---|---|
| 1 | Traefik **Pilot token** — `--pilot.token=<cleartext UUID>` (traefik static command) | committed cleartext credential, inert (Pilot discontinued) | **P30+** | — (remove outright; Traefik v3 rejects the flag) |
| 2 | `--providers.docker.exposedbydefault=true` (traefik static command) | broad exposure posture | **P30 label pass / P33** | EDGE-API (exposure tightening) |
| 3 | Dashboard **`--api`** + loadbalancer port **8080** (traefik command + `traefik-public` labels) | dashboard/API enabled in prod | **P33** | EDGE-API-01 / EDGE-API-02 |
| 4 | **ACME email** placeholder `${EMAIL}` (resolves to an operator address) + `acme.json` perms + renewal | templated; live resolves to a real address; one expired cert (`checkout.qooldata.com`, 2025-07-06) not renewing | **P33** | EDGE-TLS-03 |
| 5 | **TLS min version + HSTS** (`tls.toml` minVersion TLS1.2; `security-headers` HSTS labels) | TLS1.2 min, HSTS via `security-headers@docker` | **P33** | EDGE-TLS-01 / EDGE-TLS-02 |
| 6 | **`--log.level=ERROR`** (traefik static command) | ERROR (quieter than the INFO/WARN target — a policy choice, not a regression) | **P34** | EDGE-OPS-01 |
| 7 | Raw **`/var/run/docker.sock:ro`** bind mount (traefik service) | read-only docker socket exposed to traefik | **P34** | EDGE-OPS-02 (→ read-only socket-proxy) |
| 8 | **Port-publishing / routing drift** (29-02 finding): traefik publishes only `:80`/`:443`; the `:7442` (thxp), `:1883` (mqtt), `:8883` (mqtts), `:1194` (vpn) entrypoints are **defined in traefik's command but not host-published by traefik** — `:7442` is published directly by `thinx_api`, `:1883`/`:8883` by `thinx_mosquitto`. The `mosquitto-secure` TCP router on `mqtts` therefore does not receive host traffic through traefik today. | current routing model as-is | **P30** (routing-model review; owns deciding whether MQTT/MQTTS/thxp should route through traefik or stay direct) | EDGE-RECON follow-up → P30 scope |

## Notes

- **P30 re-scope:** `TRAEFIK-MIGRATION.md`'s "v1→v2 syntax hop" describes the dead app-repo file;
  production + committed `thinx-swarm` are already `traefik:v2.11` native v2 syntax. P30 reduces to
  retiring the dead app file (done via the mirror) + the v2→v3 work. Re-scope against the reconciled
  truth in `swarm-configs/traefik-edge-diff.2026-10-06.md`.
- The pilot token is referenced here **by name only** — its value is never written to any committed
  artifact (D-12). The resolved value lives only in the out-of-git 600 rollback snapshot on `micro`.
- Source rows: the `documented` dispositions in `swarm-configs/traefik-edge-diff.2026-10-06.md`.
