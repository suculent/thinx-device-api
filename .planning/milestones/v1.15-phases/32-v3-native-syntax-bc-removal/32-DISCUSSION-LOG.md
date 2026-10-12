# Phase 32: v3 Native Syntax & BC Removal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-08
**Phase:** 32-v3-native-syntax-bc-removal
**Areas discussed:** Rollout sequencing, Catch-all rule form, BC switch end state, Verification gate

---

## Rollout sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Two-stage: per-router opt-in, then drop switch | `ruleSyntax=v3` + v3 rule in one label-only update per router, verify; then `--args` update without the switch, verify | ✓ |
| Single window: convert rules + drop switch together | One sequence; bad rule and restart overlap; rollback restores switch AND rules | |
| Rules first, switch later phase | Lowest risk now; EDGE-MIG-03 stays open | |

**User's choice:** Two-stage.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes: throwaway v3 probe without the switch | No-host-port probe + scaled-to-zero throwaway carrying the 4 rules (Phase 31 recipe) | ✓ |
| No: rely on per-router rollback | Apply live one at a time | |
| You decide | Planner chooses after research | |

**User's choice:** Probe first.

| Option | Description | Selected |
|--------|-------------|----------|
| Strip them | Remove the 4 `ruleSyntax=v3` overrides after Stage 2 | ✓ |
| Keep them as explicit markers | Leave as documentation | |

**User's choice:** Strip.

| Option | Description | Selected |
|--------|-------------|----------|
| Repo first, then live | Commit + push + micro ff, then identical live update | ✓ |
| Live first, then capture | Apply, verify, then commit what runs | |

**User's choice:** Repo first.

---

## Catch-all rule form

| Option | Description | Selected |
|--------|-------------|----------|
| HostRegexp(`^.+$`) | Closest semantic match, host-based | |
| PathPrefix(`/`) | Matches everything incl. hostless requests | ✓ |
| You decide | Research reproduces current behaviour | |

**User's choice:** PathPrefix(`/`).

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, serve the error page to bare-IP requests | Friendly page instead of bare 404 | ✓ |
| No: add a Host guard | Keep bare 404 for hostless requests | |

**User's choice:** Yes.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 1 and 2 unchanged | Explicit priorities as today | |
| Let research re-derive them | Re-check v3 priority semantics with the shorter rule | ✓ |

**User's choice:** Research re-derives.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep HeaderRegexp (?i) | Byte-for-byte current matching | ✓ |
| Switch to exact Header() | Simpler; mixed-case `WebSocket` would miss | |

**User's choice:** Keep HeaderRegexp (?i).

---

## BC switch end state

| Option | Description | Selected |
|--------|-------------|----------|
| Remove it outright | All 32 rules native v3; closes EDGE-MIG-03 as written | ✓ |
| Retain with documented rationale | Safety net until Phases 33/34 | |

**User's choice:** Remove outright.

| Option | Description | Selected |
|--------|-------------|----------|
| Any router not enabled, any web host non-200, or WS probe failure | Phase 31 trigger family; immediate `--args` revert | ✓ |
| Only a traefik crash-loop / failed convergence | Route-level regressions wait for the operator | |

**User's choice:** Full trigger family.

---

## Verification gate

| Option | Description | Selected |
|--------|-------------|----------|
| Same gate as Phase 31 | Automated evidence + one blocking-human console sign-off | ✓ |
| Automated only, no human gate | Close on green | |
| Human gate after each stage | Two pauses | |

**User's choice:** Same as Phase 31.

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-stage the root-only file before execution | `/root/.p32-traefik-admin` 600 root, verified + deleted by the executor | ✓ |
| Executor stops and asks when needed | Mid-run blocking-human checkpoint | |
| Skip the API gate; behavioural matrix only | Loses the "every router enabled" assertion | |

**User's choice:** Pre-stage.

---

## Claude's Discretion

- v3 regexp anchoring / `HeaderRegexp` semantics; whether v3 priorities need changes (research).
- Order of the four routers in Stage 1; probe mechanics; whether the final capture is `D.post.yml` or an updated `C.post.yml`.

## Deferred Ideas

- Dead v1 labels + missing vue `security-headers@swarm` (31-REVIEW IN-05) → Phase 33/34.
- `registry.thinx.cloud` backend scheme mismatch → Phase 33/34.
- SEC-CFG-04 secret attachments and `.env` fallback pruning.
