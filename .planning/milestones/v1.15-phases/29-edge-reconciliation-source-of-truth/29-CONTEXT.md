# Phase 29: Edge Reconciliation & Source of Truth - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture exactly what Traefik edge config is **actually running in production on `micro`**, diff it
against the committed config, reconcile the committed config so it matches production
(**production wins**), document the authoritative deploy source, and save a rollback snapshot of
the working edge — all **before** any migration (Phases 30–34).

**No behavior changes this phase.** The edge keeps running exactly as it is; Phase 29 is purely
descriptive + archival. Any fix to a wart found here is deferred to the migration/hardening phases.

Delivers: EDGE-RECON-01 (capture + diff + single documented source of truth) and
EDGE-RECON-02 (live-vs-repo drift reconciled into the repo, or each divergence documented with
rationale).

</domain>

<decisions>
## Implementation Decisions

### Source of Truth (committed config)
- **D-01:** The live config on `micro` (entered via the remote `thx` alias → the swarm deploy
  folder) is the ultimate source of truth. The private **`thinx-swarm` repo** becomes the
  *committed* source of truth and is reconciled to match live this phase. — **Reversibility:** costly — reversing means re-reconciling against a different repo and rewiring the generator/CI check below.
- **D-02:** `thinx-device-api` keeps a **generated, read-only mirror** of the edge config (the
  user chose "both repos, documented link" — *not* retiring the app-repo copy). The mirror
  **replaces the dead `docker-compose.traefik.yml`**.
- **D-03:** The mirror carries a `GENERATED — do not edit, source: thinx-swarm@<sha>` banner, and
  a **make target / CI check fails if the mirror is stale** vs the recorded `thinx-swarm` SHA. This
  is the anti-drift mechanism — the whole reason this phase exists is to kill drift, so the second
  copy must be enforceable, not discipline-only. — **Reversibility:** costly — the generator + staleness check are new infra other phases will rely on.
- **D-04:** The **one-way relationship** (live → thinx-swarm → generated mirror) is documented in
  `.planning/runbooks/swarm.md` (success criterion #3).

### Reconciliation Fidelity (production wins)
- **D-05:** Mirror live **faithfully, with zero cleanup**. Capture production exactly as-is,
  warts included (dead `--pilot.token`, `--providers.docker.exposedbydefault=true`, ACME email,
  `--log.level=ERROR`, `ro` raw `docker.sock` mount). **Nothing changes this phase.**
- **D-06:** Every known-bad / deferrable item goes on a documented **"fix in P30–P34" list** so the
  migration phases inherit it (see Deferred Ideas). No opportunistic fixes — any change would make
  the rollback baseline ≠ current production and weaken Phase 29's safety purpose.
- **D-07:** Any live-vs-repo difference that genuinely cannot be reconciled into the committed repo
  is **documented with rationale** (criterion #2), not silently dropped.

### Capture Authority & Scope
- **D-08:** **Running container state is authoritative.** `docker service inspect` /
  `docker inspect` of the running traefik task (resolved command, mounts, docker configs, labels)
  is the truth. On-disk `thx` deploy files + docker configs + the acme volume are captured too, and
  **any disagreement with running state is flagged as drift** (not silently reconciled to the file).
- **D-09:** **Full edge routing map** is captured, not just the traefik service: the traefik
  service (static flags, entrypoints, ACME, dashboard) **plus the `traefik.*` labels on every
  routed stack** (thinx, landing, errorpage, swarmpit, vault, downtime), **all entrypoints**
  (`:80` http, `:443` https, `:1194` vpn, `:1883` mqtt, `:8883` mqtts, `:7442` thxp), the
  `tls.toml` dynamic config, and an ACME certificate inventory. Phase 30 migrates those same labels,
  so the complete map is needed now.

### Secrets Handling
- **D-10:** **Git gets:** the committed config with env-var placeholders left *templated*
  (`${DOMAIN}`, `${EMAIL}`, `${USERNAME}`, `${HASHED_PASSWORD}`, `${CONFIG}`) + a cert **inventory**
  (domains, resolver, issuer, expiry — **no private keys**).
- **D-11:** **Out-of-git on `micro` at mode `600`:** the raw `acme.json` and the full *resolved*
  rollback snapshot (criteria #1 & #4). Rollback restores certs instantly instead of re-triggering
  ACME challenges. — **Reversibility:** reversible — snapshot location/format is a local choice.
- **D-12:** The generator **redacts/masks any inline secret** from the `thinx-device-api` mirror
  (mirror is for visibility, not deploy, and this repo is less private than `thinx-swarm`). The live
  deploy keeps such values untouched this phase (zero cleanup). Each found inline secret
  (starting with the cleartext `--pilot.token=095c70c4-…`) goes on the P30–P34 fix list — the pilot
  token to be **removed outright** (Traefik Pilot is discontinued), any others moved to
  env/docker-secrets.

### Claude's Discretion
- Exact capture commands / SSH mechanics on `micro`, snapshot file naming, and the generator
  implementation language are left to research + planning (technical details, not operator
  decisions). Default: follow the existing `.planning/runbooks/swarm-configs/*.pre/*.post` dated
  snapshot convention from the Phase 28 (Swarmpit) work.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Migration plan & scope
- `.planning/research/TRAEFIK-MIGRATION.md` — current-state analysis, v1→v2→v3 hop sequencing,
  and the explicit "reconcile first" boundary. **Note its "Current state" section describes the
  *dead app-repo file*, not the live config** — see Specific Ideas below.
- `.planning/ROADMAP.md` → `### v1.15 — Traefik Hardening (Edge)` / **Phase 29** — goal + 4 success
  criteria.
- `.planning/REQUIREMENTS.md` — EDGE-RECON-01, EDGE-RECON-02 (and the full EDGE-* set for P30–P34).

### Deploy source of truth (live)
- Live on `micro` — SSH alias `micro` = `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`
  (host/key/port live in `~/.aliases`, not the repo). On `micro`, the **`thx` alias** enters the
  swarm deploy folder (`/mnt/gluster/deployment/swarm/` per the runbook) = **ultimate source of
  truth**. `docker service inspect` of the running traefik task = **authoritative capture**.
- `~/Repositories/thinx-swarm/traefik.yml` — the real deploy config (`traefik:v2.11.0`, full v2
  syntax, entrypoints incl. `:7442`). Last commit **2025-05-12** → suspected drifted. This is the
  **reconciliation target** and the new committed source of truth.
- `~/Repositories/thinx-swarm/traefik/tls.toml` — dynamic TLS config (shipped as docker config
  `tls-config-${CONFIG}`).

### Repo artifacts & precedent (thinx-device-api)
- `docker-compose.traefik.yml` — **DEAD/stale** (v1 flags on a `v2.6.1` image, no `:7442`, cannot
  boot). To be **replaced by the generated mirror**.
- `services/traefik/update.sh` — cert-export helper; reveals the live ACME path is the **named
  volume** `traefik_traefik-public-certificates` (`…/_data/acme.json`), *not* the app-repo's
  `/traefik/acme.json` — a concrete drift signal.
- `.planning/runbooks/swarm.md` — swarm ops runbook; the source-of-truth note lands here
  (criterion #3). Deploy source `/mnt/gluster/deployment/swarm/`.
- `.planning/runbooks/swarm-configs/` (+ `README.md`) — dated `*.A.pre.yml` / `*.A.post.yml`
  snapshot precedent from Phase 28; follow it for the Phase 29 snapshot + pre-P30 rollback artifact.
- `AGENTS.md` — the `:7442` plaintext + plain-MQTT hard constraint (operator decision 2026-10-04),
  `micro` access, and the push → CI → Swarmpit deploy flow.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **swarm-configs snapshot pattern** (`.planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml`
  etc.): established dated pre/post snapshot convention — reuse for the Phase 29 edge snapshot and
  the pre-Phase-30 rollback artifact.
- **`services/traefik/update.sh`**: already knows the live ACME storage location (named volume) —
  useful for the cert-inventory capture and for proving the acme.json path during reconciliation.
- **`.planning/runbooks/swarm.md`**: existing runbook structure to extend with the SoT section.

### Established Patterns
- Deploy YAML uses **env-var interpolation** (`${DOMAIN}`, `${EMAIL}`, `${USERNAME}`,
  `${HASHED_PASSWORD}`, `${CONFIG}`) resolved at `docker stack deploy` time → the committed form
  stays templated; only the rollback snapshot records resolved values (out-of-git).
- **Docker configs** (`tls-config-${CONFIG}`) carry dynamic TLS config; **named volume**
  `traefik-public-certificates` carries `acme.json`.
- GSD **dated snapshot** convention under `swarm-configs/`.

### Integration Points
- New: a **generator** (thinx-swarm → thinx-device-api mirror) + a **make target / CI staleness
  check** comparing the mirror to the recorded `thinx-swarm` SHA.
- New: **out-of-git secrets store on `micro`** (600) for raw acme.json + resolved rollback snapshot.
- Extend `swarm.md` with the documented one-way source-of-truth chain.

</code_context>

<specifics>
## Specific Ideas

**The three sources disagree sharply — this is the core finding to preserve:**

| Source | State | Notes |
|---|---|---|
| `thinx-device-api/docker-compose.traefik.yml` | **Dead/stale** | v1 flags on a `v2.6.1` image, no `:7442` — cannot boot. |
| `thinx-swarm/traefik.yml` | `v2.11.0`, full v2 syntax, has `:7442`/MQTT/VPN entrypoints | Last touched **2025-05-12**; operator warns it is heavily drifted. |
| **Production on `micro`** | **Authoritative** | "production wins". |

**Important for Phase 30 (flag, do not act on it here):** the `TRAEFIK-MIGRATION.md` "two-hop
v1→v2→v3" framing is based on the *dead app-repo file*. The config that actually deploys
(`thinx-swarm`, and presumably live) is **already `traefik:v2.11.0` with native v2 syntax**. Once
reconciliation confirms live state, the P30 "v1→v2 syntax" hop may be largely moot for production
and reduce to retiring the dead app-repo file. Re-scope P30 against the reconciled truth.

</specifics>

<deferred>
## Deferred Ideas

**"Fix in P30–P34" list** (found during reconciliation, intentionally NOT changed this phase):

- **Remove `--pilot.token=095c70c4-…`** — Traefik Pilot is discontinued; inert but a committed
  cleartext credential. Removal + any rotation → P30+ (v3 will reject the flag anyway).
- **`--providers.docker.exposedbydefault=true`** — broad exposure posture; tighten → P33
  (dashboard/API lockdown) or P30 label pass.
- **Dashboard / `--api` + port 8080** — lock down behind `api@internal` + auth / disable in prod →
  **P33** (EDGE-API-01/02).
- **ACME email** — replace placeholder/validate real operator email; `acme.json` `600`; verify
  renewal → **P33** (EDGE-TLS-03).
- **TLS min version + HSTS** → **P33** (EDGE-TLS-01/02).
- **`--log.level=ERROR`** — EDGE-OPS-01 targets `INFO`/`WARN`; live is `ERROR`. Confirm desired
  level during → **P34** (note: ERROR is quieter than the target, so this is a policy choice, not a
  regression).
- **Raw `ro` `docker.sock` mount → read-only socket-proxy** → **P34** (EDGE-OPS-02).

**Re-scope P30** against reconciled truth (production already v2 syntax) — see Specific Ideas.

*(No todos were folded or reviewed — `todo.match-phase 29` returned 0 matches. Discussion stayed
within phase scope.)*

</deferred>

---

*Phase: 29-Edge Reconciliation & Source of Truth*
*Context gathered: 2026-10-06*
