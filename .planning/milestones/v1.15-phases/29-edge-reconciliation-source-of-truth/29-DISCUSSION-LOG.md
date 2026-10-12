# Phase 29: Edge Reconciliation & Source of Truth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-06
**Phase:** 29-Edge Reconciliation & Source of Truth
**Areas discussed:** Committed source of truth, Reconciliation fidelity, Capture scope & authority, ACME / secrets handling

---

## Committed source of truth

### Q1 — Which repo holds the authoritative committed edge config?

| Option | Description | Selected |
|--------|-------------|----------|
| thinx-swarm is authoritative | Make the private deploy repo the SoT; retire the dead app-repo compose file with a stub/README. | |
| Pull into thinx-device-api | Make this repo the SoT (matches REQUIREMENTS naming); thinx-swarm becomes downstream/retired. | |
| Both, with documented link | Keep thinx-swarm as deploy source, mirror a read-only copy into thinx-device-api, document the one-way relationship. | ✓ |

**User's choice:** Both, with documented link.

### Q2 — How to keep the mirror from drifting again?

| Option | Description | Selected |
|--------|-------------|----------|
| Generated + staleness check | Banner `source: thinx-swarm@<sha>` + make/CI check fails if mirror is stale vs recorded SHA. | ✓ |
| Dated point-in-time snapshot | Explicitly dated snapshot, no enforcement, refreshed each milestone. | |
| Doc-only discipline | No copied config; swarm.md documents authority only. | |

**User's choice:** Generated + staleness check.
**Notes:** The "both repos" choice reintroduces exactly the drift this phase exists to kill, so the anti-drift mechanism was treated as the load-bearing sub-decision.

---

## Reconciliation fidelity

### Q1 — How faithfully do we mirror live when it differs from the committed config?

| Option | Description | Selected |
|--------|-------------|----------|
| Faithful, zero cleanup | Capture live exactly as-is, warts included; known-bad items → documented P30–P34 fix list; nothing changes this phase. | ✓ |
| Faithful + quarantine note | Same, but annotate each wart inline with the fixing phase. | |
| Reconcile + fix dead flags | Remove provably-dead items (e.g. pilot token) now. | |

**User's choice:** Faithful, zero cleanup.
**Notes:** Keeps the rollback baseline identical to current production — the safety purpose of Phase 29.

---

## Capture scope & authority

### Q1 — What is the authoritative capture?

| Option | Description | Selected |
|--------|-------------|----------|
| Running state is truth | `docker service inspect` of the running task is authoritative; on-disk/config/volume captured as cross-check, disagreements flagged as drift. | ✓ |
| On-disk thx files are truth | Deploy files are the source; running state only a cross-check. | |
| Both, no primary | Capture both, declare neither authoritative. | |

**User's choice:** Running state is truth.

### Q2 — How wide is the capture?

| Option | Description | Selected |
|--------|-------------|----------|
| Full edge routing map | Traefik service + all routed-stack `traefik.*` labels + every entrypoint + tls.toml + ACME inventory. | ✓ |
| Traefik service only | Just the reverse-proxy; per-stack labels captured later. | |
| Traefik + device-path stacks | Traefik + only the :7442/MQTT stacks; defer the rest. | |

**User's choice:** Full edge routing map.
**Notes:** Phase 30 migrates the same labels, so the complete map is needed now.

---

## ACME / secrets handling

### Q1 — How to capture ACME + rollback snapshot without committing secrets?

| Option | Description | Selected |
|--------|-------------|----------|
| Redacted git + raw on micro | Templated config + cert inventory in git; raw acme.json + resolved snapshot out-of-git on micro at 600. | ✓ |
| Encrypted bundle in git | Redacted config + age/git-crypt-encrypted raw secrets in the repo. | |
| Inventory only, no raw capture | Cert inventory + templated config only; no raw acme.json (LE re-issues on rollback). | |

**User's choice:** Redacted git + raw on micro.

### Q2 — How to handle inline secrets already committed in thinx-swarm?

| Option | Description | Selected |
|--------|-------------|----------|
| Redact in mirror, flag for removal | Generator strips inline secrets from the mirror; live deploy untouched this phase; each found secret → P30–P34 fix list (pilot token removed outright). | ✓ |
| Redact in mirror only | Mask in the mirror; take no position on later removal. | |
| Mirror verbatim | Copy thinx-swarm exactly, token included. | |

**User's choice:** Redact in mirror, flag for removal.
**Notes:** The live `thinx-swarm/traefik.yml` commits a cleartext `--pilot.token`; the generated mirror lands in a less-private repo, so masking is required.

---

## Claude's Discretion

- Exact SSH/capture commands on `micro`, snapshot file naming, and generator implementation
  language left to research + planning. Default: follow the existing `swarm-configs/*.pre/*.post`
  dated-snapshot convention.

## Deferred Ideas

- Full "fix in P30–P34" list recorded in CONTEXT.md `<deferred>`: remove dead `--pilot.token`;
  tighten `exposedbydefault=true`; dashboard/8080 lockdown (P33); real ACME email + `600` + renewal
  (P33); TLS min version + HSTS (P33); confirm log level vs EDGE-OPS-01 (P34); `docker.sock` →
  read-only socket-proxy (P34).
- **Re-scope P30**: production/thinx-swarm already run `traefik:v2.11.0` with native v2 syntax, so
  the planned "v1→v2 syntax" hop may reduce to retiring the dead app-repo file. Re-scope against the
  reconciled truth.

---

## Process note

`init.phase-op` / `roadmap get-phase` returned `found: false` for Phase 29 (and for the shipped
Phase 28) — a parser limitation with this project's `**Phase N:**`-under-`<details>` roadmap format,
not a missing phase. Phase 29 is real: STATE.md names it the current position and ROADMAP.md's
footer prescribes `/gsd-discuss-phase 29`. Phase metadata was derived manually from ROADMAP.md.
