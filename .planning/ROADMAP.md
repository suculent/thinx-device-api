# Roadmap: THiNX Device API

**Last updated:** 2026-05-27 (v1.0 milestone shipped)

## Project Reference

- **Project context:** `.planning/PROJECT.md`
- **Milestones index:** `.planning/MILESTONES.md`
- **Sibling project:** `services/console/.planning/` — Vue console GSD workspace (frontend half of v1.0)

## Milestones

- ✅ **v1.0 — v1 GA Backend Closures** — Phases 1-4 (shipped 2026-05-27)

## Phases

<details>
<summary>✅ v1.0 v1 GA Backend Closures (Phases 1-4) — SHIPPED 2026-05-27</summary>

- [x] Phase 1: AUTH API — Password Reset (2/2 plans) — Verified 2026-05-26 (AUTH-API-01)
- [x] Phase 2: PII Logging Scrub (1/1 plan) — Verified 2026-05-26 (SEC-PII-01)
- [x] Phase 3: Swarm Auto-Pull (1/1 plan) — Verified 2026-05-26 (OPS-01)
- [x] Phase 4: Dependency Triage (4/4 plans) — Verified 2026-05-27 (SEC-DEP-01)

Full details: `.planning/milestones/v1.0-ROADMAP.md`
Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
Audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
Phase artifacts: `.planning/milestones/v1.0-phases/`

</details>

### 📋 Next Milestone (To Be Planned)

Run `/gsd:new-milestone` to plan v1.x — surfaced v1.x backlog candidates already filed during v1.0 (see `.planning/milestones/v1.0-REQUIREMENTS.md` § "v2 Requirements"):

- `REFACTOR-01..05` — backend hygiene (trust proxy, weak equality, WebSocket close handlers, callback→async/await, jshint/fs-finder devDep misclassification)
- `SEC-COOKIE-01`, `SEC-WS-01`, `SEC-DEP-02`, `SEC-PII-02` — security posture + console-side dep triage + historic CouchDB audit-log redaction
- `OPS-02`, `OPS-03` — stale swarm memberlist, malformed `<image>@` autoredeploy specs
- `AUTH-REACTIVATE-01`, `AUTH-RESET-LINK-CONSOLE` — auth/account lifecycle gaps surfaced in v1.0 UAT
- `CONSOLE-LEGACY-JSON-PARSE` — legacy AngularJS console (deprecation candidate)
- `TEST-CHAI-01` — chai-http v5 ESM migration (locked per AGENTS.md until forced)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. AUTH API — Password Reset | v1.0 | 2/2 | Verified | 2026-05-26 |
| 2. PII Logging Scrub | v1.0 | 1/1 | Verified | 2026-05-26 |
| 3. Swarm Auto-Pull | v1.0 | 1/1 | Verified | 2026-05-26 |
| 4. Dependency Triage | v1.0 | 4/4 | Verified | 2026-05-27 |

---
*v1.0 GA backend closures complete: 4/4 v1 requirements Verified (AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01). Companion `services/console` v1.0 frontend tracked in sibling project. Next: `/gsd:new-milestone` to define v1.x scope.*
