# Phase 31: v2→v3 Upgrade (backward-compat mode) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-07
**Phase:** 31-v2-v3-upgrade-backward-compat-mode
**Areas discussed:** v3 validation approach, Rollback: live vs staged, v3 version pin, Static-change scope

---

## v3 Validation Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Boot-and-discover test, then live cutover | Run v3 with converted static config + BC switch against the real docker/swarm provider owning no/alt host ports; confirm config parses and providers.swarm discovers all routers/services, then live :80/:443 cutover in a window. Avoids dual-ACME hazard. | ✓ |
| Parallel v3 on alt ports, full E2E, then swap | Second Traefik v3 alongside v2.11 on alt ports, validate routing + TLS E2E before swapping. Two instances contend on the single acme.json → needs separate/read-only resolver. | |
| Straight live cutover, rollback as the net | Skip pre-boot validation; update image+config in the window, rely on staged rollback. Fastest, highest risk at cutover. | |

**User's choice:** Boot-and-discover test, then live cutover
**Notes:** Validates exactly what v3 breaks (docker→swarm provider split) without the single-acme.json dual-write hazard. → CONTEXT D-01 / D-01a.

---

## Rollback: live vs staged

| Option | Description | Selected |
|--------|-------------|----------|
| Staged-ready, roll back only if needed | Fresh out-of-git 600 snapshot of working v2.11 pre-cutover + documented/dry-verified v3→v2.11 procedure, one command away. Satisfies criterion 2 without a second window. | ✓ |
| Repeat a full live rollback+restore cycle | P30-style live demo again (cut to v3, roll back live, re-verify, re-apply). Highest assurance, extra window + ACME/route churn. | |

**User's choice:** Staged-ready, roll back only if needed
**Notes:** P30 already proved the live rollback machinery on the real service (2026-10-07). → CONTEXT D-02.

---

## v3 Version Pin

| Option | Description | Selected |
|--------|-------------|----------|
| Latest stable v3.x, exact patch tag | Pin current stable v3 release by exact patch tag (researcher confirms number). Newest fixes; v3 mature; BC switch covers routing. Matches tag-not-digest convention. | ✓ |
| Conservative earlier v3 line | Earlier/first v3 line, smaller breaking-change surface; misses later fixes, likely needs a second bump soon. | |

**User's choice:** Latest stable v3.x, exact patch tag
**Notes:** → CONTEXT D-03. Exact patch number deferred to researcher.

---

## Static-change Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimum-to-boot v3 + BC switch only | Only forced static changes: docker→providers.swarm split, removed/renamed flags, add core.defaultRuleSyntax: v2. exposedbydefault stays true (moved to swarm namespace, P33 deferral honored). All routing-rule conversion → P32. No opportunistic cleanup. | ✓ |
| Fold in low-risk cleanups too | Also action deferred warts opportunistically; fewer future windows but wider blast radius and muddier rollback baseline. | |

**User's choice:** Minimum-to-boot v3 + BC switch only
**Notes:** Keeps cutover diff and rollback reasoning tight; aligns with P29/P30 "no opportunistic fixes". → CONTEXT D-04.

---

## Claude's Discretion

- Exact v3 patch number and the precise set of v3 static-flag renames/removals (verify against v3 "Configuration changes").
- Boot-and-discover invocation mechanics (alt-port vs no-port; how to assert providers.swarm discovery).
- Snapshot naming + exact service-update/retag commands (follow dated swarm-configs convention + P29/P30 pattern).
- Mirror regeneration sequencing (generate → check must return MIRROR OK).

## Deferred Ideas

- Native v3 routing syntax + BC switch removal → Phase 32 (EDGE-MIG-03).
- exposedbydefault→false audit → Phase 33 (EDGE-API-01/02).
- Dashboard/API lockdown, ACME email/perms/renewal, TLS min + HSTS → Phase 33.
- Log level, read-only socket-proxy, SLA close-out → Phase 34.
- Full removal of vestigial entrypoints / dead mosquitto-secure router → later cleanup.
- Parallel v3 serving instance for richer pre-cutover E2E → rejected for P31 (dual-ACME); possible future with separate resolver.

### Reviewed todos (not folded): console-notification-delivery-gaps, transfer-continuity-leftovers, mqtt-device-writes-gated — all keyword collisions, none touch the Traefik edge.
