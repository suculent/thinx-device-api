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
| 2 | `--providers.docker.exposedbydefault=true` (traefik static command) | broad exposure posture | **P30 label pass / P33** — **done (Phase 33, 2026-10-09)** | EDGE-API (exposure tightening) |
| 3 | Dashboard **`--api`** + loadbalancer port **8080** (traefik command + `traefik-public` labels) | dashboard/API enabled in prod | **P33** — **done (Phase 33, 2026-10-09)** | EDGE-API-01 / EDGE-API-02 |
| 4 | **ACME email** placeholder `${EMAIL}` (resolves to an operator address) + `acme.json` perms + renewal | templated; live resolves to a real address; one expired cert (`checkout.qooldata.com`, 2025-07-06) not renewing | **P33** — **done (Phase 33, 2026-10-09)** | EDGE-TLS-03 |
| 5 | **TLS min version + HSTS** (`tls.toml` minVersion TLS1.2; `security-headers` HSTS labels) | TLS1.2 min, HSTS via `security-headers@docker` | **P33** — **done (Phase 33, 2026-10-09)** | EDGE-TLS-01 / EDGE-TLS-02 |
| 6 | **`--log.level=ERROR`** (traefik static command) | ERROR (quieter than the INFO/WARN target — a policy choice, not a regression) | **P34** — **done (Phase 34, 2026-10-09)**: `--log.level=WARN` + JSON access log with RequestPath / RequestLine / ClientUsername dropped (edge runbook `### P34 Stage A record`) | EDGE-OPS-01 |
| 7 | Raw **`/var/run/docker.sock:ro`** bind mount (traefik service) | read-only docker socket exposed to traefik | **P34** — **done (Phase 34, 2026-10-09)**: `traefik_socket-proxy` (GET-only, internal `traefik-socket` overlay) + `--providers.swarm.endpoint=tcp://socket-proxy:2375`, raw bind removed (`### P34 Stage B1 record`, `### P34 Stage B2 record`) | EDGE-OPS-02 (→ read-only socket-proxy) |
| 8 | **Port-publishing / routing drift** (29-02 finding): traefik publishes only `:80`/`:443`; the `:7442` (thxp), `:1883` (mqtt), `:8883` (mqtts), `:1194` (vpn) entrypoints are **defined in traefik's command but not host-published by traefik** — `:7442` is published directly by `thinx_api`, `:1883`/`:8883` by `thinx_mosquitto`. The `mosquitto-secure` TCP router on `mqtts` therefore does not receive host traffic through traefik today. | current routing model as-is | **P30** (routing-model review; owns deciding whether MQTT/MQTTS/thxp should route through traefik or stay direct) | EDGE-RECON follow-up → P30 scope |

## Notes

- **P30 re-scope:** `TRAEFIK-MIGRATION.md`'s "v1→v2 syntax hop" describes the dead app-repo file;
  production + committed `thinx-swarm` are already `traefik:v2.11` native v2 syntax. P30 reduces to
  retiring the dead app file (done via the mirror) + the v2→v3 work. Re-scope against the reconciled
  truth in `swarm-configs/traefik-edge-diff.2026-10-06.md`.
- The pilot token is referenced here **by name only** — its value is never written to any committed
  artifact (D-12). The resolved value lives only in the out-of-git 600 rollback snapshot on `micro`.
- Source rows: the `documented` dispositions in `swarm-configs/traefik-edge-diff.2026-10-06.md`.

## Phase 30 resolutions (2026-10-07)

Phase 30 (EDGE-MIG-01 / EDGE-MIG-04) confirmed v2-syntax parity in the deploy source of truth and
actioned exactly the P30-tagged rows. The committed deploy mirror (`docker-compose.traefik.yml`) and
its thinx-swarm source match all four v2-syntax markers (`providers.docker`, `certificatesresolvers`,
`http.routers`/`http.services`, `entrypoints.*.address=:`) and **zero** v1-era markers
(`defaultentrypoints`, `Address::`, top-level `--docker=`/`--acme=`).

- **Row #1 — Pilot token: RESOLVED / REMOVED in P30 on v2.11 (D-04).** The inert cleartext
  `--pilot.token` flag was stripped from the committed thinx-swarm static command and deployed live
  to the running `traefik_traefik` task (v2.11 tolerates its absence; v3 would reject it). Referenced
  **by flag name only** — the resolved UUID value was never written to any committed artifact and
  lives only in the out-of-git 600 rollback snapshot on `micro`. Exactly one flag removed; all six
  entrypoints (incl. `:7442`) and every other wart preserved.
- **Row #8 — Port-publishing / routing drift: RESOLVED, "stays direct" (D-02).** Decision: device and
  MQTT traffic remain published **directly**, not routed through Traefik — `:7442` (thxp) by
  `thinx_api`; `:1883`/`:8883` (mqtt/mqtts) by `thinx_mosquitto`; `:1194` (vpn) unrouted; Traefik keeps
  publishing only `:80`/`:443`. The vestigial `vpn`/`mqtt`/`mqtts`/`thxp` entrypoints and the dead
  `mosquitto-secure` TCP router are now **annotated in the committed thinx-swarm `traefik.yml`** (D-03,
  comments only, no functional change). EDGE-MIG-04 is satisfied by preserving + verifying the direct
  model, not by moving traffic.
- **Row #2 — `--providers.docker.exposedbydefault=true`: CONFIRMED DEFERRED to P33 (D-05).** Not
  changed in P30 — flipping it to `false` requires auditing every Traefik-enabled stack to add explicit
  `traefik.enable=true`, which is exposure-tightening work (EDGE-API), not parity work. Kept `true`.

Rows **#3 (`--api`/8080), #4 (ACME email/perms/renewal), #5 (TLS min + HSTS), #6 (`--log.level=ERROR`),
#7 (raw `docker.sock:ro`)** are UNTOUCHED and remain assigned to P33/P34 as above.

**Hard constraint restated:** the `:7442` plaintext device port and plain (non-TLS) MQTT must keep
working for legacy `__DISABLE_HTTPS__` devices — verified reachable through the P30 cutover (operator
confirmed the full check-in → OTT redeem → firmware download flow at the human-verify gate).

## Phase 34 resolutions (2026-10-09)

- **Row #6 — `--log.level=ERROR`: DONE.** Stage A (34-01) set `--log.level=WARN` and a JSON access log with
  `RequestPath`, `RequestLine` and `ClientUsername` dropped (query strings carry OTTs / OAuth codes; canary-proven).
- **Row #7 — raw `docker.sock:ro`: DONE.** Stage B1 (34-01) created the GET-only `traefik_socket-proxy` on the internal
  `traefik-socket` overlay; Stage B2 (34-02) moved Traefik to `tcp://socket-proxy:2375` and removed the socket bind in one
  update. Operations: `.planning/runbooks/swarm.md` § Traefik Docker API socket-proxy.
- The Phase 34 SLA close-out (EDGE-OPS-03) is **not** a fix-forward row and stays an open gap (`sla_verdict: OPEN-GAP`
  in the edge runbook).

**Hard constraint held:** `:7442` and plain MQTT stayed OPEN at every Phase 34 stage; device-flow harness PASS on both
paths at the end state (2026-10-09 16:53Z).
