# Phase 30: v1→v2 Syntax Migration (parity) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-06
**Phase:** 30-v1-v2-syntax-migration-parity
**Areas discussed:** P30 deliverable scope, MQTT/thxp routing model, Pilot-token + exposedbydefault, Rollback demo depth

---

## P30 Deliverable Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Parity + resolve P30 warts | Confirm parity, demonstrate rollback, AND action P30-tagged items (routing + Pilot-token/exposedbydefault). May touch live static config. | ✓ |
| Pure parity + rollback only | Verify EDGE-MIG-01, confirm dead file retired, demo rollback. Defer all warts. No live edge change. | |
| Parity + routing decision only | Parity + rollback + routing-model decision, defer Pilot-token/exposedbydefault. | |

**User's choice:** Parity + resolve P30 warts
**Notes:** Fullest reading of the fix-forward list; P30 will make a real live change (which later justified the live rollback-cycle choice).

---

## MQTT/thxp Routing Model

| Option | Description | Selected |
|--------|-------------|----------|
| Keep direct, document | Traefik stays :80/:443 only; device/MQTT ports remain direct via thinx_api/thinx_mosquitto. Annotate vestigial entrypoints. Lowest risk. | ✓ |
| Route through Traefik | Publish :7442/:1883/:8883 on Traefik + TCP routers. Bigger blast radius; risks plaintext paths. | |
| Decide after a spike | Defer the decision pending a breakage-mapping spike. | |

**User's choice:** Keep direct, document

**Follow-up — vestigial entrypoint handling:**

| Option | Description | Selected |
|--------|-------------|----------|
| Annotate, keep as-is | Comment the unpublished thxp/mqtt/mqtts/vpn entrypoints + dead mosquitto-secure router; no functional change. | ✓ |
| Remove dead definitions | Strip them so config carries only :80/:443; edits static command, needs full re-verification. | |

**Notes:** Direct model preserves the hard :7442/plain-MQTT constraint and makes "identical routing" trivially true. Annotate-only keeps the diff minimal.

---

## Pilot-token + exposedbydefault

**Pilot token:**

| Option | Description | Selected |
|--------|-------------|----------|
| Remove in P30 now | Strip --pilot.token, redeploy on v2.11, regen mirror. Removes inert cleartext credential; de-risks P31 v3 cutover. | ✓ |
| Defer to P31 (v2→v3) | Leave until the v3 hop where removal is mandatory. | |

**exposedbydefault:**

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to P33 | Keep true in P30; flip is exposure-tightening (EDGE-API-01/02), needs full label audit. | ✓ |
| Flip to false in P30 | Audit all stacks, add explicit traefik.enable=true, set false, re-verify. Larger blast radius. | |

**User's choice:** Remove Pilot token in P30; defer exposedbydefault to P33

**Notes:** Pilot token is inert on v2.11 but rejected by v3 — removing early is cheap and reversible. exposedbydefault flip touches unrelated edge stacks (fotostim/igraczech/syxra) so it stays out of a parity phase.

---

## Rollback Demo Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Live rollback+restore cycle | Cut over new config → roll back to P29 snapshot → verify routes + :7442/MQTT → re-apply new config. End-to-end proof; needs maintenance window. | ✓ |
| Documented dry-run + integrity check | Verify snapshot intact + validate restore procedure; only bounce prod if deploy fails. | |
| Staging rehearsal first | Rehearse on non-prod then dry-run prod. Most thorough, most setup. | |

**User's choice:** Live rollback+restore cycle
**Notes:** Since P30 makes a real live change (pilot-token removal), exercising rollback end-to-end on the real service gives the highest confidence for the subsequent v2→v3 hops.

---

## Claude's Discretion

- Keep the Traefik image at the running/committed `v2.11` tag — no image bump in P30 (satisfies criterion 1's "current v2.x image"). Patch-level bump within v2.11.x left to planner's discretion.
- Exact verification commands/sequencing for legacy device-path checks (check-in → OTT redeem → firmware download over :7442 + plain MQTT) — reuse/extend Phase 29 verify commands.

## Deferred Ideas

- Route device/MQTT ports through Traefik — rejected for P30; possible future phase.
- exposedbydefault → false — deferred to P33.
- Full removal of vestigial entrypoints/router — P30 annotates only; full removal could ride the P31 cutover.
- Dashboard/API lockdown, ACME email/renewal, TLS min/HSTS — P33.
- Log level, socket-proxy — P34.
- Reviewed-but-not-folded todos: Rollbar token split (score 0.9), worker-builder polling fix (score 0.6) — off-domain for the Traefik edge.
