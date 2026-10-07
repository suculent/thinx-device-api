# Phase 31: v2→v3 Upgrade (backward-compat mode) - Context

**Gathered:** 2026-10-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade the running edge from the current **`traefik:v2.11.0`** to **current stable Traefik v3.x**
with the backward-compatibility switch **`core.defaultRuleSyntax: v2`**, following the official
three-phase rollout (prepare & test → migrate production → defer routing conversion). Delivers
**EDGE-MIG-02**, and re-verifies **EDGE-MIG-04** (plaintext `:7442` + plain MQTT survive the hop).

This phase operates on the Phase 29/30 reconciled truth: production and the committed `thinx-swarm`
source already run `traefik:v2.11` with native v2 syntax; the Pilot token is already removed (P30),
and device/MQTT traffic is published **directly**, not through Traefik (Traefik owns only `:80`/`:443`).

**The v3 cutover forces static-config changes the BC switch does NOT cover.** `core.defaultRuleSyntax: v2`
only rescues router *rule* syntax. The v3 binary removes `--providers.docker.swarmmode` (swarm becomes a
separate `providers.swarm` provider) and renames/removes several static flags — those are **forced** at
the v3 cutover and cannot be deferred to P32.

**Not in this phase:**
- Converting routing rules to **native v3 syntax** and removing the BC switch → **Phase 32** (EDGE-MIG-03).
- Dashboard/API lockdown, `exposedbydefault`→false, ACME email/perms/renewal, TLS min/HSTS → **Phase 33**
  (EDGE-API-*, EDGE-TLS-*).
- Log level, read-only socket-proxy, SLA close-out → **Phase 34** (EDGE-OPS-*).

</domain>

<decisions>
## Implementation Decisions

### Rollout — "prepare & test" with no staging edge
- **D-01:** Phase 1 of the official rollout is a **boot-and-discover test** of the converted v3
  config, not a parallel serving instance. Run `traefik:v3.x` with the converted static config +
  `core.defaultRuleSyntax: v2` against the real docker/swarm provider while owning **no host ports**
  (or alternate ports), and confirm (a) the static config parses under v3 and (b) the new
  `providers.swarm` discovers **every** expected router/service. Only then do the live `:80`/`:443`
  cutover in a maintenance window. Chosen to validate exactly what v3 breaks (the docker→swarm
  provider split) without the dual-ACME hazard of two Traefik instances writing one `acme.json`.
  — **Reversibility:** reversible — the test instance is throwaway; it never serves host traffic.
- **D-01a:** A **parallel v3 service on alternate ports with full E2E** was considered and rejected:
  two instances contend on the single `acme.json` named volume, which would need a separate or
  read-only ACME resolver to be safe — more risk/complexity than the boot-and-discover test buys.

### Rollback for the v3 hop (criterion 2: "demonstrated OR staged-ready")
- **D-02:** **Staged-ready, roll back only on regression.** P30 already proved the live
  rollback+restore machinery on the real Traefik service (D-06, 2026-10-07). For P31: capture a fresh
  **out-of-git 600 snapshot** of the working v2.11 edge immediately pre-cutover (resolved config +
  `acme.json`, dated, on `micro`), **document and dry-verify** the v3→v2.11 service-update/image-retag
  procedure, and keep it one command away during the window. Execute the rollback for real only if the
  v3 cutover shows a regression. Satisfies criterion 2 without a second maintenance window.
  — **Reversibility:** reversible — snapshot location/format is a local choice; rollback returns to
  the known-good v2.11 baseline.

### v3 image pin
- **D-03:** Pin to the **current stable Traefik v3.x release by its exact patch tag** (e.g.
  `traefik:v3.x.y` — researcher confirms the exact number at planning time), never `@sha256`, per the
  operator image-pin convention. Rationale: newest security/bug fixes, v3 is mature, and the BC switch
  covers routing. A conservative earlier v3 line was rejected — it would miss later fixes and likely
  force a second bump soon. — **Reversibility:** reversible — tag bump; rollback target is v2.11.0.

### Static-config change scope at cutover
- **D-04:** **Minimum-to-boot v3 + BC switch only.** Make exactly the forced static changes:
  `--providers.docker.swarmmode` → the `providers.swarm` provider; any removed/renamed v3 static flags;
  add `core.defaultRuleSyntax: v2`. **`--providers.docker.exposedbydefault=true` stays `true`** — only
  moved into the `providers.swarm` namespace — honoring the P33 deferral (P30 D-05) of the
  exposure-tightening audit. **All routing-rule conversion is deferred to P32.** No opportunistic
  cleanup of other deferred warts (rows #3–#7 of the fix-forward list stay in P33/P34). Keeps the
  cutover diff small and the rollback reasoning clean. — **Reversibility:** reversible — every change
  rides the D-02 staged rollback.

### Device plaintext paths (EDGE-MIG-04 — hard constraint)
- **D-05:** `:7442` (thxp, published by `thinx_api`) and plain MQTT / MQTTS (`:1883`/`:8883`,
  published by `thinx_mosquitto`) keep working through the v3 cutover. The **direct-publish model is
  unchanged** (Traefik still owns only `:80`/`:443`); EDGE-MIG-04 is re-verified by preserving +
  checking the direct model, not by moving traffic. Verify the full legacy flow (device check-in →
  OTT redemption → firmware download) over `:7442` + plain MQTT at the human-verify gate, reusing the
  Phase 29/30 verify commands and the `console-retest` / device-MCP paths. **No fix in this phase may
  close, redirect, or TLS-enforce these paths** (AGENTS.md operator decision 2026-10-04).

### Claude's Discretion
- Exact v3 patch number, the precise set of v3 static-flag renames/removals, and the boot-and-discover
  invocation mechanics (alt-port vs no-port, how to assert `providers.swarm` router/service discovery)
  are research/planning concerns — verify every flag against the v3 "Configuration changes" reference.
- Snapshot file naming + exact `service update`/retag commands — follow the established dated
  `swarm-configs/*.pre/*.post` convention and the P29/P30 rollback-snapshot pattern.
- Mirror regeneration sequencing — any edit to `thinx-swarm` flows through
  `generate-traefik-mirror.js` → `check-traefik-mirror.js` (must return `MIRROR OK`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v2→v3 migration background (primary for this phase)
- `.planning/research/TRAEFIK-MIGRATION.md` §"Hop 2 — v2 → v3 (safety-net path)" — the BC switch
  (`core.defaultRuleSyntax: v2`), the official three-phase rollout, and the pointer to the v3
  "Configuration changes" deltas (Docker provider, ACME/certificatesresolvers, TLS options,
  dashboard/API, logging). **Note:** its v1→v2 framing describes the dead app-repo file — ignore that
  part; rely on the Phase 29 reconciled truth below.
- Official v3 migration guide: https://doc.traefik.io/traefik/migrate/v2-to-v3/ (verify each flag).

### Phase 29/30 reconciled truth & fix-forward (READ FIRST)
- `.planning/runbooks/swarm-configs/traefik-edge-diff.2026-10-06.md` — authoritative live↔repo diff,
  dispositions, the edge-map facts (direct-publish routing model; Traefik publishes only `:80`/`:443`).
- `.planning/runbooks/traefik-edge-fixforward.md` — the P30–P34 wart list + the **"Phase 30 resolutions
  (2026-10-07)"** block (Pilot token removed, routing stays direct, exposedbydefault deferred). Rows
  #3–#7 (dashboard/API, ACME, TLS/HSTS, log level, socket-proxy) stay in P33/P34 — out of P31 scope.
- `.planning/phases/30-v1-v2-syntax-migration-parity/30-CONTEXT.md` — P30 decisions this phase carries
  forward (D-02 direct ports, D-03 vestigial-entrypoint annotations, D-04 Pilot removed, D-06 live
  rollback already demonstrated).
- `.planning/phases/29-edge-reconciliation-source-of-truth/29-CONTEXT.md` — source-of-truth chain and
  secrets-handling rules (D-10/D-11/D-12).
- `.planning/runbooks/swarm.md` §"Traefik Edge Source of Truth (Phase 29 / EDGE-RECON-01)" — the
  one-way chain (thinx-swarm → generated mirror → CI check).

### Committed source of truth, mirror tooling & rollback baseline
- `~/Repositories/thinx-swarm/traefik.yml` + `~/Repositories/thinx-swarm/traefik/tls.toml` — the
  committed Traefik source of truth (**external repo** — edits land here; currently `traefik:v2.11.0`).
- `docker-compose.traefik.yml` (this repo) — the **generated, read-only mirror**; never hand-edit.
- `scripts/generate-traefik-mirror.js`, `scripts/check-traefik-mirror.js` — mirror generator + the
  CircleCI staleness gate (must stay green after the v3 edit).
- `services/traefik/update.sh` — confirms the authoritative named-volume `acme.json` path
  (`traefik_traefik-public-certificates`), relevant to the D-01 dual-ACME-avoidance reasoning and the
  D-02 snapshot.
- `.planning/runbooks/swarm-configs/traefik-acme-inventory.2026-10-06.md` — committed ACME inventory
  (no key material); the ACME resolver must keep working under v3.
- Out-of-git 600 rollback snapshot on `micro`: `/mnt/data/edge-rollback/traefik-2026-10-06/` (P30
  baseline); P31 captures a fresh pre-cutover snapshot alongside it.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — EDGE-MIG-02 (this phase), EDGE-MIG-04 (device-path preservation).
- `.planning/ROADMAP.md` → `### Phase 31` — goal + 3 success criteria.

### Operator constraints & deploy
- `AGENTS.md` §"Legacy plaintext device port — keep 7442" — the hard `:7442` + plain-MQTT constraint
  (operator decision 2026-10-04); `micro` access and the push → CI → Swarmpit deploy flow / 5-min SLA.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Anti-drift spine** (`scripts/generate-traefik-mirror.js` + `scripts/check-traefik-mirror.js`): the
  v3 static edits in `thinx-swarm` must flow through these; the CircleCI staleness gate enforces mirror
  freshness vs the recorded `thinx-swarm` SHA.
- **P29/P30 verify commands**: reuse the `:7442`/MQTT entrypoint checks, the no-secret-leak grep guards,
  and the `ssh micro "docker service inspect …"` live-config assertions for D-01 discovery validation
  and D-05 device-path re-verification.
- **P29/P30 dated rollback-snapshot pattern** (`swarm-configs/*.pre/*.post`, out-of-git 600 on `micro`):
  reuse for the D-02 pre-cutover v2.11 snapshot.

### Established Patterns
- **Source-of-truth chain:** committed `thinx-swarm` authoritative → `docker-compose.traefik.yml` mirror
  generated + banner-stamped → CI checks staleness. No edge change is "done" until the mirror regenerates
  and `check-traefik-mirror.js` returns `MIRROR OK`.
- **Secret hygiene (P29 D-12):** committed artifacts stay templated/redacted — no cleartext credentials,
  hashes, or key material. Verify this holds for any P31-committed file.
- **Deploy via swarm** `restart.sh` / `docker service update --force`; Traefik placement **floats** —
  always query the node (swarm-node memory). Respect the 5-minute push→CI→Swarmpit SLA.

### Integration Points
- Traefik static command lives in `~/Repositories/thinx-swarm/traefik.yml`; the `providers.docker`→
  `providers.swarm` split changes the flag namespace for provider options (incl. `exposedbydefault`,
  `constraints`, `network`).
- Device paths integrate **outside** Traefik and must not change: `thinx_api` publishes `:7442`;
  `thinx_mosquitto` publishes `:1883`/`:8883`.
- The vestigial `vpn`/`mqtt`/`mqtts`/`thxp` entrypoints + dead `mosquitto-secure` TCP router are
  annotated-only in the committed config (P30 D-03) — carry the annotations through the v3 edit.

</code_context>

<specifics>
## Specific Ideas

- D-01 boot-and-discover success = v3 starts without static-config parse errors AND `providers.swarm`
  lists every router/service that v2.11 currently serves (app, landing, dev, console, dashboard labels)
  — compared against the P29 full edge-routing map.
- D-02 rollback target is a fresh pre-cutover snapshot next to the P30 one on `micro`
  (`/mnt/data/edge-rollback/traefik-2026-10-06/`), 600 perms, out-of-git.
- The single `acme.json` named volume is the reason D-01 avoids a parallel serving instance.

</specifics>

<deferred>
## Deferred Ideas

- **Native v3 routing syntax + remove BC switch** — Phase 32 (EDGE-MIG-03). The BC switch
  (`core.defaultRuleSyntax: v2`) stays on through P31.
- **`exposedbydefault` → false** (per-stack `traefik.enable=true` audit) — Phase 33 (EDGE-API-01/02);
  stays `true` in P31, moved only into the `providers.swarm` namespace.
- **Dashboard/API lockdown (port 8080, `--api.insecure`), ACME email/perms/renewal, TLS min + HSTS** —
  Phase 33 (EDGE-API-* / EDGE-TLS-*).
- **Log level ERROR→INFO/WARN, raw `docker.sock`→read-only socket-proxy, SLA close-out** — Phase 34
  (EDGE-OPS-*).
- **Full removal of the vestigial entrypoints / dead `mosquitto-secure` router** — still annotate-only;
  a later cleanup, not P31.
- **Parallel v3 serving instance for full E2E pre-cutover** — considered and rejected for P31 (D-01a,
  dual-ACME hazard); remains an option if a future hop needs richer pre-cutover validation with a
  separate ACME resolver.

### Reviewed Todos (not folded)
- **Console notification delivery gaps** (`2026-10-03-console-notification-delivery-gaps.md`, score 0.6)
  — matched on generic keywords (routing/core/upgrade); it is about console notification delivery, not
  the Traefik edge. Not folded.
- **Transfer continuity leftovers** (`2026-10-03-transfer-continuity-leftovers.md`, score 0.6) — device
  transfer domain; matched on "what/mqtt". Unrelated to edge migration. Not folded.
- **MQTT device writes gated** (`2026-10-03-mqtt-device-writes-gated.md`, score 0.4) — about the
  `THINX_MQTT_DEVICE_WRITES` application gate, not the plaintext MQTT *transport* this phase preserves.
  Not folded.

</deferred>

---

*Phase: 31-v2-v3-upgrade-backward-compat-mode*
*Context gathered: 2026-10-07*
