# Phase 30: v1→v2 Syntax Migration (parity) - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 30 closes out EDGE-MIG-01 and EDGE-MIG-04 against the **reconciled truth** from
Phase 29: production (and the committed `thinx-swarm` source of truth) **already runs
`traefik:v2.11` with native v2 syntax** — v2 entrypoints, `providers.docker`,
`certificatesresolvers`, and `http.routers`/`http.services` labels. The dead app-repo
`docker-compose.traefik.yml` was already replaced by the generated, banner-stamped mirror in
Phase 29.

So the ROADMAP "v1→v2 syntax hop" is largely **already true in production**. This phase therefore:
1. **Confirms parity** — asserts/verifies prod + committed config satisfy EDGE-MIG-01 (no v1-isms
   remain in the deploy source of truth).
2. **Resolves the P30-tagged warts** from the fix-forward list that the operator chose to action now.
3. **Demonstrates rollback** to the Phase 29 snapshot via a live rollback+restore cycle (criterion 4).
4. **Preserves the device plaintext paths** (EDGE-MIG-04): `:7442` + plain MQTT keep working for
   legacy `__DISABLE_HTTPS__` devices through every change.

**Not in this phase:** the v2→v3 hop (P31), native-v3 routing syntax (P32), dashboard/API lockdown
and TLS/ACME hardening (P33), ops hardening — log level, socket-proxy (P34).

</domain>

<decisions>
## Implementation Decisions

### Deliverable Scope
- **D-01:** P30 = parity confirmation + **live rollback demonstration** + resolve the P30-tagged
  warts (routing-model decision, Pilot-token removal). This phase **does** touch the live Traefik
  static config. — **Reversibility:** reversible — every change is covered by the Phase 29 rollback
  snapshot and the mirror regen is deterministic.

### Routing Model (EDGE-MIG-04)
- **D-02:** The device/MQTT ports stay **direct**, not routed through Traefik. `:7442` (thxp) stays
  published by `thinx_api`; `:1883` (mqtt) and `:8883` (mqtts) stay published by `thinx_mosquitto`;
  `:1194` (vpn) unchanged. Traefik continues to publish **only `:80`/`:443`**. EDGE-MIG-04 is
  satisfied by **preserving and verifying** the direct model, not by moving traffic. Chosen as the
  lowest-risk path for the hard `:7442`/plain-MQTT constraint; "identical routing" is trivially met.
  — **Reversibility:** reversible — status quo preserved; routing-through-Traefik remains a future
  option if a later phase wants it.
- **D-03:** The unpublished `thxp`/`mqtt`/`mqtts`/`vpn` entrypoints defined in Traefik's static
  command, plus the dead `mosquitto-secure` TCP router (which receives no host traffic today), are
  **annotated/commented in the committed Traefik config** to document that device/MQTT traffic is
  published directly — **kept as-is, no functional change** to the static command. Minimizes diff and
  keeps the mirror/check green. — **Reversibility:** reversible — comments only.

### Wart Timing
- **D-04:** **Remove `--pilot.token=<cleartext UUID>` in P30.** It is inert (Traefik Pilot
  discontinued) and v3 rejects it. Strip it from the committed `thinx-swarm` Traefik static command,
  redeploy on v2.11 (which tolerates its absence), and regenerate the mirror. De-risks the P31 v3
  cutover and removes the inert cleartext credential early. — **Reversibility:** reversible — the flag
  can be re-added; it does nothing either way.
- **D-05:** **Defer `--providers.docker.exposedbydefault=true` → `false` to P33** (EDGE-API-01/02).
  Keep `true` in P30. Flipping it requires auditing every Traefik-enabled stack
  (`thinx_api`/`console`/`vue` + `fotostim_landing-com`/`-cz`, `igraczech-com_web`, `syxra-cz_web`)
  to add explicit `traefik.enable=true` — that's exposure-tightening work, not parity work, and
  risks an unrelated stack silently losing its route during a parity phase.

### Rollback Demonstration (criterion 4)
- **D-06:** **Live rollback+restore cycle during the P30 deploy window.** After cutting over the
  pilot-token-removed config: roll the Traefik service back to the Phase 29 out-of-git snapshot,
  verify all app/landing/dev/console routes + HTTP→HTTPS redirect + ACME + `:7442`/plain-MQTT on the
  old config, then re-apply the new (P30) config and re-verify. Proves rollback end-to-end on the
  real service. Requires a maintenance window. — **Reversibility:** reversible — the cycle returns to
  the intended P30 end state.

### Claude's Discretion
- **Image tag:** Keep the Traefik image at the running/committed **`v2.11`** tag — no image bump in
  P30 (criterion 1's "current v2.x image" is met). A patch bump within v2.11.x is at the planner's
  discretion if there's a concrete reason, but is not required.
- Exact verification commands and sequencing for legacy device-path checks (check-in → OTT redeem →
  firmware download over `:7442` + plain MQTT) — reuse/extend the Phase 29 verify commands and the
  `console-retest` / device-MCP paths where applicable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 29 reconciled truth & P30 re-scope (READ FIRST)
- `.planning/runbooks/swarm-configs/traefik-edge-diff.2026-10-06.md` — the authoritative live↔repo
  diff, dispositions, the **Phase-30 re-scope note**, and the **edge-map facts** (direct-publish
  routing model; which ports Traefik does/does not publish). This supersedes the original migration
  framing.
- `.planning/runbooks/traefik-edge-fixforward.md` — the P30–P34 wart assignments (Pilot token #1,
  exposedbydefault #2, routing-model review #8 are the P30-relevant rows).
- `.planning/runbooks/swarm.md` §"Traefik Edge Source of Truth (Phase 29 / EDGE-RECON-01)" — the
  one-way source-of-truth chain (thinx-swarm → mirror → check).

### Live edge snapshots & ACME (rollback baseline)
- `.planning/runbooks/swarm-configs/traefik-edge.A.pre.yml` / `traefik-edge.A.post.yml` — redacted
  live edge snapshots captured in Phase 29.
- `.planning/runbooks/swarm-configs/traefik-acme-inventory.2026-10-06.md` — committed ACME resolver
  inventory (no key material).
- Out-of-git 600 rollback snapshot on `micro`: `/mnt/data/edge-rollback/traefik-2026-10-06/` — the
  rollback target for D-06.

### Committed source of truth & mirror tooling
- `~/Repositories/thinx-swarm/traefik.yml` + `~/Repositories/thinx-swarm/traefik/tls.toml` — the
  committed Traefik source of truth (reconciliation target; **external repo** — edits land here).
- `docker-compose.traefik.yml` (this repo) — the **generated, read-only mirror**; never hand-edit.
- `scripts/generate-traefik-mirror.js`, `scripts/check-traefik-mirror.js` — mirror generator + the
  CircleCI staleness gate (EDGE-RECON-01).
- `services/traefik/update.sh` — confirms the named-volume `acme.json` path is authoritative.

### Migration background (use with caution)
- `.planning/research/TRAEFIK-MIGRATION.md` — official v1→v2 / v2→v3 migration notes. **Caveat:** its
  "Hop 1 (v1→v2)" analysis describes the **dead app-repo file**, not production. For P30, rely on the
  diff doc's reconciled truth; use this mainly for the v2→v3 (P31+) background and the hard `:7442`
  preservation reminder.

### Operator constraints
- `AGENTS.md` §"Legacy plaintext device port — keep 7442" — the hard `:7442` + plain-MQTT
  preservation constraint (operator decision 2026-10-04); and the swarm access / deploy-flow notes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 29 anti-drift spine:** `scripts/generate-traefik-mirror.js` + `scripts/check-traefik-mirror.js`
  — any edge change in P30 flows through these (edit `thinx-swarm` → regen mirror → check). The
  CircleCI staleness gate already wired in Phase 29 enforces mirror freshness.
- **Phase 29 verify commands** (from `29-01`/`29-02`/`29-03` plans) — reuse the `:7442`/mqtt entrypoint
  grep checks, the no-secret-leak grep guards, and the `ssh micro "docker service inspect …"`
  live-config assertions as a basis for P30 verification.

### Established Patterns
- **Source-of-truth chain:** committed `thinx-swarm` is authoritative → `docker-compose.traefik.yml`
  mirror is generated and banner-stamped → CI checks staleness. No edge change is "done" until the
  mirror is regenerated and `check-traefik-mirror.js` returns `MIRROR OK` (exit 0).
- **Secret hygiene:** committed artifacts stay templated/redacted (no `095c70c4`, no `$apr1$`/`$2[aby]$`
  hashes, no `BEGIN` key material, Pilot token referenced by name only). Verify this holds for any
  P30-committed file.

### Integration Points
- Traefik runs as a swarm service on `micro` (placement **floats** — always query it, per swarm-node
  memory). Deploy via the swarm `restart.sh` / `docker service update --force` path; respect the
  5-minute push→CI→Swarmpit SLA.
- Device paths integrate **outside** Traefik: `thinx_api` publishes `:7442`; `thinx_mosquitto`
  publishes `:1883`/`:8883`. P30 must not change that wiring (D-02).

</code_context>

<specifics>
## Specific Ideas

- Rollback demo (D-06) targets the specific Phase 29 snapshot at
  `/mnt/data/edge-rollback/traefik-2026-10-06/` on `micro`, 600 perms, out-of-git.
- Pilot-token removal (D-04) is a single-flag deletion from the `thinx-swarm` static command — the
  smallest possible live change that still exercises the full deploy + rollback machinery.

</specifics>

<deferred>
## Deferred Ideas

- **Route device/MQTT ports through Traefik** — considered and rejected for P30 (D-02); remains a
  possible future phase if edge centralization is ever wanted (would need TLS passthrough / PROXY
  protocol analysis for mqtts and the `:7442` plaintext path).
- **`exposedbydefault` → false** — deferred to **P33** (EDGE-API-01/02), per D-05.
- **Remove dead vestigial entrypoints/router entirely** — P30 only annotates (D-03); full removal
  could ride along with the P31 v2→v3 cutover or a later cleanup.
- **Dashboard/API lockdown, ACME email/renewal fix, TLS min/HSTS** — P33 (EDGE-API / EDGE-TLS).
- **Log level, socket-proxy** — P34 (EDGE-OPS).

### Reviewed Todos (not folded)
- **Split Rollbar server and client tokens** (`2026-09-28-split-rollbar-server-and-client-tokens.md`,
  score 0.9) — matched only on generic keywords (config/docker/services); unrelated to the Traefik
  edge. Belongs to a config/secrets phase, not P30.
- **Fix worker builder service polling completion detection** (
  `2026-09-28-fix-worker-builder-service-polling-completion-detection.md`, score 0.6) — worker
  builder domain, unrelated to edge routing. Not folded.

</deferred>

---

*Phase: 30-v1-v2-syntax-migration-parity*
*Context gathered: 2026-10-06*
