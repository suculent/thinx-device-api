# Requirements: THiNX Device API — v1.11 Backlog Drawdown

**Defined:** 2026-06-05
**Core Value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.

## v1.11 Requirements

Requirements for the v1.11 Backlog Drawdown milestone. Each maps to exactly one roadmap phase.

### Dependency Hygiene

- [ ] **REFACTOR-06**: All `fs-finder` call sites in `lib/` are replaced with `fs-extra` / native `fs.promises` equivalents, with behavior preserved and a behavior-locking spec per touched module. Touch surface: ~10 `finder.from()` / `finder.in()` / `finder.findFiles()` calls across `lib/thinx/builder.js`, `lib/thinx/deployment.js`, `lib/thinx/platform.js`, `lib/thinx/repository.js`, `lib/thinx/plugins/arduino/plugin.js`.
- [ ] **REFACTOR-07**: `fs-finder` is removed from `package.json` `dependencies` and no source reference to it remains (verified by `grep` clean + `npm ls fs-finder` resolving to nothing).

### Security / Dependencies

- [ ] **SEC-DEP-03**: The 5 outstanding default-branch Dependabot alerts (2 High / 3 Medium) are classified via the established closed-set taxonomy (blocker / deferred-stale / deferred-dev-only / deferred-vendored-asset), blockers remediated with surgical `package.json` `overrides`, and a post-change rescan confirms the runtime-tree (`npm audit --omit=dev`) high count is reduced.

### Operations

- [ ] **OPS-EXEC-03**: The pending influx stats fix (`9b6d931c`, quick-task `260605-inf`) is force-rolled to production, and a post-deploy check confirms the Vue dashboard check-in numbers read correctly and the `error parsing query: found BADSTRING` log spam is silenced.

## Future Requirements

Acknowledged and deferred — still standing candidates, not in the v1.11 roadmap. Kept deferred a 4th time at v1.11 start as a deliberate keep call (not auto-carry).

### Test Infrastructure

- **TEST-CHAI-01**: Migrate the Jasmine suite from chai-http v4 to v5 (ESM). Locked per `AGENTS.md:82-92`; trigger to reconsider is a Snyk/Dependabot CVE in superagent v3. Reassess at next milestone.

### Swarm Operations

- **OPS-02**: Clean up the stale swarm memberlist entry (`b356ad8e1d60`). Pure swarm-side OPS, orthogonal to this codebase's lifecycle.
- **OPS-03**: Repair the 4 stack services with malformed `<image>@` autoredeploy specs. Pure swarm-side OPS, orthogonal to this codebase's lifecycle.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| CONSOLE-LEGACY-JSON-PARSE | Documented root cause is a frontend double-parse (`JSON.parse` on an already-parsed object) at `services/console/src/login.js:173` + `password.js:87`. No parent-repo code angle exists; the legacy AngularJS console is being deprecated. Reclassified to the `services/console` submodule's GSD workspace at v1.11 start. |
| services/console frontend work | Owned by the console submodule's own GSD project (`services/console/.planning/`). |
| Multi-tenant revamp / v2 API features | Future major milestone, not v1.x. |
| Edge layer redesign (Traefik labels, nginx rewrites) | Out per standing project scope; only auth-path edge config may ever be touched. |
| chai-http v5 ESM migration in this milestone | Dependency lock per `AGENTS.md`; tracked as deferred TEST-CHAI-01, not v1.11 scope. |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REFACTOR-06 | Phase 15 | Pending |
| REFACTOR-07 | Phase 15 | Pending |
| SEC-DEP-03 | Phase 16 | Pending |
| OPS-EXEC-03 | Phase 17 | Pending |

**Coverage:**
- v1.11 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-05*
*Last updated: 2026-06-05 — traceability filled after roadmap creation (Phases 15–17)*
