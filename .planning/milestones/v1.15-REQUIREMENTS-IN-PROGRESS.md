# Requirements: THiNX Device API — v1.15 Traefik Hardening (Edge)

**Defined:** 2026-10-06
**Core Value:** The IoT device API stays available and trustworthy across release cycles; the push → CI → Swarmpit pipeline stays under a 5-minute SLA.

## v1 Requirements

Requirements for this milestone. Each maps to a roadmap phase. See `.planning/research/TRAEFIK-MIGRATION.md` for the migration path.

### Reconciliation

- [ ] **EDGE-RECON-01**: The live swarm-host Traefik config (static flags, dynamic rules, ACME storage) is captured and diffed against repo `docker-compose.traefik.yml` + `services/traefik/*`, establishing a single documented source of truth.
- [ ] **EDGE-RECON-02**: Live-vs-repo drift is reconciled into the repo so the committed config matches what is deployed — or each intentional divergence is documented with rationale.

### Migration

- [ ] **EDGE-MIG-01**: Traefik static config and Docker labels are migrated from v1 syntax to v2 syntax (entrypoints, `providers.docker`, `certificatesresolvers`, `http.routers`/`http.services` labels) on a current v2.x image, with every existing route serving identically.
- [x] **EDGE-MIG-02**: Traefik is upgraded from v2.x to current v3.x using the backward-compatibility switch (`core.defaultRuleSyntax: v2`) and the official three-phase rollout; each hop is independently rollback-able.
- [x] **EDGE-MIG-03**: Routing rules are converted to native v3 syntax and the BC switch is removed (or explicitly retained with documented rationale).
- [x] **EDGE-MIG-04**: The plaintext device entrypoint (`:7442`) and plain MQTT keep accepting legacy device check-in, OTT redemption, and firmware download after every migration hop (verified against a legacy `__DISABLE_HTTPS__` client path).

### Dashboard & API Lockdown

- [x] **EDGE-API-01**: The Traefik dashboard/API is not reachable unauthenticated from outside — port 8080 is closed externally (or bound internal-only) and `--api.insecure` is disabled.
- [x] **EDGE-API-02**: If the dashboard is kept, it is served via a secured router (`api@internal`) behind auth; otherwise it is disabled in production.

### TLS Hardening

- [x] **EDGE-TLS-01**: The HTTPS entrypoint enforces minimum TLS 1.2 (prefer 1.3) with a modern cipher-suite set.
- [x] **EDGE-TLS-02**: HSTS is sent on HTTPS responses at the edge (documented max-age) without affecting the plaintext device paths.
- [x] **EDGE-TLS-03**: ACME uses a real operator email (not the `admin@example.com` placeholder) and `acme.json` is stored `600`; certificate issuance/renewal is verified working post-migration.

### Ops Surface Reduction

- [ ] **EDGE-OPS-01**: Traefik log level is reduced from `DEBUG` to `INFO`/`WARN` in production (access logs retained if needed, free of secrets).
- [ ] **EDGE-OPS-02**: Traefik reaches the Docker API via a read-only socket-proxy rather than a raw `/var/run/docker.sock` mount.
- [ ] **EDGE-OPS-03**: The migrated edge preserves the 5-minute push → CI → Swarmpit deploy SLA, verified end-to-end.

## Future Requirements

Deferred, tracked but not in this roadmap.

- **EDGE-FUT-01**: Broader edge redesign (nginx rewrites, console edge consolidation) beyond Traefik.
- **EDGE-FUT-02**: mTLS / client-cert auth for device transport.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Replacing Traefik with another reverse proxy | Migration/hardening only; no proxy swap |
| TLS-enforcing or removing the plaintext device port `:7442` | Hard constraint — legacy devices require plaintext (operator decision 2026-10-04) |
| Mosquitto/MQTT broker hardening beyond keeping plaintext working | Separate concern from the HTTP edge |
| Console/CSP edge changes | Covered by v1.13; not re-opened here |

## Traceability

Filled during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EDGE-RECON-01 | Phase 29 | Pending |
| EDGE-RECON-02 | Phase 29 | Pending |
| EDGE-MIG-01 | Phase 30 | Pending |
| EDGE-MIG-04 | Phase 30 | Complete |
| EDGE-MIG-02 | Phase 31 | Complete |
| EDGE-MIG-03 | Phase 32 | Complete |
| EDGE-API-01 | Phase 33 | Complete |
| EDGE-API-02 | Phase 33 | Complete |
| EDGE-TLS-01 | Phase 33 | Complete |
| EDGE-TLS-02 | Phase 33 | Complete |
| EDGE-TLS-03 | Phase 33 | Complete |
| EDGE-OPS-01 | Phase 34 | Pending |
| EDGE-OPS-02 | Phase 34 | Pending |
| EDGE-OPS-03 | Phase 34 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-06*
*Last updated: 2026-10-06 after v1.15 milestone start*
