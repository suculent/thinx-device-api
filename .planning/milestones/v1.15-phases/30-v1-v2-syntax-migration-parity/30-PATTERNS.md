# Phase 30: v1→v2 Syntax Migration (parity) - Pattern Map

**Mapped:** 2026-10-07
**Files analyzed:** 7 (2 external-repo edits, 1 regenerated mirror, 4 committed docs/snapshots)
**Analogs found:** 7 / 7

> **Domain note:** This is an **infrastructure/edge-config** phase, not application code. There are
> no controllers/services/components. "Role" below is mapped to infra roles (edge-config, generated
> mirror, verification tooling, runbook doc, config snapshot). The deploy source of truth
> (`traefik.yml` + `traefik/tls.toml`) lives in the **external** `~/Repositories/thinx-swarm` repo;
> this repo carries only the generated mirror + committed docs. Every analog named here is
> git-tracked source in **this** repo (verified with `git ls-files`) — no gitignored capability
> mirror paths are emitted.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `~/Repositories/thinx-swarm/traefik.yml` (MODIFIED — external repo: strip `--pilot.token`, annotate vestigial entrypoints + dead `mosquitto-secure` router per D-03/D-04) | edge-config (Traefik static command) | config / transform | 29-02-PLAN.md Task 2 (reconcile edit of `thinx-swarm/traefik.yml`, warts-preserved discipline) | exact (same file, same edit class) |
| `docker-compose.traefik.yml` (MODIFIED — regenerated mirror after the pilot-token removal) | generated read-only mirror | transform (generate) | `scripts/generate-traefik-mirror.js` (the generator that produces it) | exact |
| `.planning/runbooks/traefik-edge-fixforward.md` (MODIFIED — mark wart #1 Pilot token + #8 routing-model resolved in P30) | runbook doc | transform (status update) | the file itself (P30 rows already defined); 29-03-PLAN.md Task 3 wrote it | exact |
| `.planning/runbooks/swarm.md` (MODIFIED — append P30 rollback-demo + pilot-token-removal note under the existing Phase-29 source-of-truth section) | runbook doc | event (deploy log) | `.planning/runbooks/swarm.md` §"Traefik Edge Source of Truth"; 29-03-PLAN.md Task 2 | exact |
| `.planning/runbooks/swarm-configs/traefik-edge.B.pre.yml` / `.B.post.yml` (NEW — pre/post snapshots around the P30 cutover + rollback-demo) | config snapshot | file-I/O (capture) | `.planning/runbooks/swarm-configs/traefik-edge.A.pre.yml` / `.A.post.yml` + `README.md` | exact (same snapshot family) |
| P30 verification (plan `<verify>` blocks + a rollback-demo verification doc, D-06) | verification tooling | request-response (live assert) | 29-02-PLAN.md / 29-03-PLAN.md `<automated>` blocks; `scripts/check-traefik-mirror.js` | role-match |

## Pattern Assignments

### `~/Repositories/thinx-swarm/traefik.yml` — strip `--pilot.token`, annotate vestigial entrypoints (edge-config, config/transform)

**Analog:** `.planning/phases/29-edge-reconciliation-source-of-truth/29-02-PLAN.md` Task 2 (lines 112-144) — the established discipline for editing the committed Traefik static command and re-flowing the mirror. **Inverse caveat:** 29-02 *preserved* the pilot token as a `documented` wart (zero cleanup); P30 (D-04) now *removes* it. Copy the edit/regenerate/verify choreography, not the preservation.

**Edit discipline to copy (29-02-PLAN.md lines 122-126):**
- Edit lands in `thinx-swarm` (committed SoT), never in the generated mirror. The mirror is regenerated, never hand-edited.
- D-03 annotation = comments only on the unpublished `thxp`/`mqtt`/`mqtts`/`vpn` entrypoints + the dead `mosquitto-secure` TCP router. No functional change to the static command → keeps the diff minimal and the mirror/check green.
- After any `thinx-swarm` edit: regenerate the mirror and prove the staleness check is green (see next file).

**Warts to KEEP (do NOT remove alongside the pilot token) — from the fix-forward table** (`.planning/runbooks/traefik-edge-fixforward.md` lines 13-22): `--providers.docker.exposedbydefault=true` (D-05, defer to P33), `--api` + port 8080 (P33), `--log.level=ERROR` (P34), `docker.sock:ro` (P34). Only wart #1 (pilot token) is actioned in P30.

**Secret-hygiene constraint (D-12, from 29-02 threat model line 185 + generator `redactSecrets`):** the pilot token is referenced **by name only** in any committed artifact; its resolved UUID value lives only in the out-of-git 600 snapshot on `micro`. The mirror's `redactSecrets()` already masks any residual UUID to `<redacted>` — but once the flag is gone there is nothing to mask.

---

### `docker-compose.traefik.yml` — regenerate the mirror (generated mirror, transform)

**Analog:** `scripts/generate-traefik-mirror.js` (the generator; dependency-free, node built-ins only).

**Regenerate + verify command pair** (29-02-PLAN.md line 132, verbatim pattern):
```bash
node scripts/generate-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"
node scripts/check-traefik-mirror.js    --swarm-repo "$HOME/Repositories/thinx-swarm"
# expect: MIRROR-GENERATED ok ... then MIRROR OK files=1 (exit 0)
```

**Banner / anti-drift contract** (`scripts/generate-traefik-mirror.js` lines 48-55, 92-97): the generator writes a two-line header — line 1 `# GENERATED — do not edit. source: thinx-swarm@<40-hex-sha> generated:<ISO-UTC> by scripts/generate-traefik-mirror.js`, line 2 `# mirror-sha256:<body-sha256>`. The new mirror will carry the **new** thinx-swarm HEAD SHA (the pilot-token-removal commit). `check-traefik-mirror.js` recomputes the body hash (`MIRROR-EDITED` guard, lines 99-106) and, in freshness mode, compares the banner SHA to live HEAD (`MIRROR-STALE` guard, lines 108-120).

**Redaction is automatic** (`scripts/generate-traefik-mirror.js` lines 67-76): `redactSecrets()` masks `--*token=<value>`, resolved basicauth hashes, and any RFC4122 UUID to `<redacted>` while leaving `${VAR}` templated. No manual redaction step needed.

---

### `.planning/runbooks/traefik-edge-fixforward.md` — mark P30 warts resolved (runbook doc, status update)

**Analog:** the file itself (`.planning/runbooks/traefik-edge-fixforward.md`). The P30-owned rows are already defined and tagged:
- **Row #1** (line 15): Pilot token — `**P30+**` "remove outright; Traefik v3 rejects the flag" → mark **done in P30** (D-04).
- **Row #8** (line 22): port-publishing / routing drift — `**P30** (routing-model review)` → mark **resolved: stays direct** per D-02 (thxp/mqtt/mqtts/vpn published directly by `thinx_api`/`thinx_mosquitto`, Traefik keeps only `:80`/`:443`).
- **Row #2** `exposedbydefault` — note **deferred to P33** per D-05 (do NOT mark done).

**Table-row format to copy** (lines 13-22): `| # | Wart (where it lives) | Preserved value | Target phase | Requirement |`. Keep the "pilot token referenced by name only" note (lines 30-31) intact.

---

### `.planning/runbooks/swarm.md` — append P30 rollback-demo note (runbook doc)

**Analog:** `.planning/runbooks/swarm.md` §"Traefik Edge Source of Truth (Phase 29 / EDGE-RECON-01)" (written by 29-03-PLAN.md Task 2). Follow its established conventions:

**Section-header convention** (29-03-PLAN.md line 117): `## <Topic> (Phase N / REQ-ID — <date>)` — e.g. `## Traefik Pilot-token removal + rollback demo (Phase 30 / EDGE-MIG-01 — 2026-10-07)`.

**Live-command convention** (29-03-PLAN.md lines 117, 121): fenced `ssh micro "…"` blocks with an inline `# expect:` line. The top-of-file SSH-alias framing (`ssh micro`, deploy path `/mnt/gluster/deployment/swarm/`) is already established — reuse it, do not re-introduce raw `ssh root@188.166.23.244 …`.

**Rollback target to name** (CONTEXT lines 102-104, 156-157): the out-of-git 600 snapshot `/mnt/data/edge-rollback/traefik-2026-10-06/` on `micro`.

---

### `traefik-edge.B.pre.yml` / `.B.post.yml` — pre/post cutover snapshots (config snapshot, file-I/O)

**Analog:** `.planning/runbooks/swarm-configs/traefik-edge.A.pre.yml` / `.A.post.yml` + `.planning/runbooks/swarm-configs/README.md`. Reuse the full capture recipe from 29-02-PLAN.md Task 1 (lines 86-109):

**Capture command shape** (29-02-PLAN.md line 95): over the `micro` SSH alias, `docker service inspect` the running traefik task for resolved `Args` (static flags — now **without** `--pilot.token`), published `Ports`, `Mounts`, `Configs`; `docker config inspect tls-config-<CONFIG>` for the live `tls.toml` body; per-stack `traefik.*` labels.

**Redaction rule** (README-driven, 29-02-PLAN.md line 95): secrets → literal `<redacted>`, `${VAR}` stays templated, otherwise bit-faithful so `diff` works. `.post` should match `.pre` **except** the removed pilot-token line (contrast with 29-03 where `.post` was byte-identical to `.pre`).

**Entrypoint-map assertion the snapshot MUST preserve** (D-02 / AGENTS.md hard constraint): all six entrypoints recorded — `:80`, `:443`, `:1194` vpn, `:1883` mqtt, `:8883` mqtts, `:7442` thxp — and the fact that Traefik publishes only `:80`/`:443` while `:7442` is published by `thinx_api` and `:1883`/`:8883` by `thinx_mosquitto` (edge-map facts, `traefik-edge-diff.2026-10-06.md` lines 64-70).

---

### P30 verification + rollback demo (D-06) — verification tooling (request-response, live assert)

**Analogs:** the `<automated>` verify blocks of 29-02-PLAN.md / 29-03-PLAN.md + `scripts/check-traefik-mirror.js`.

**Mirror-freshness gate** (29-02-PLAN.md line 132):
```bash
node scripts/check-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"  # expect MIRROR OK, exit 0
```

**Secret-leak grep guard** (29-02-PLAN.md lines 101, 160; 29-03-PLAN.md line 102) — assert the committed artifact carries no resolved secret. After pilot-token removal the token value must be absent everywhere committed:
```bash
test "$(grep -Ec '095c70c4|\$apr1\$|\$2[aby]\$|BEGIN' <committed-file>)" -eq 0
```

**Live-config assertion over SSH** (29-03-PLAN.md lines 96-99 pattern): `ssh micro "docker service inspect …"` / `stat -c '%a %U' …` with an expected-output `<fails_when>`. Use the same shape to assert the running traefik task no longer carries `--pilot.token` and still exposes all six entrypoints.

**`:7442` / plain-MQTT device-path checks** (29-02-PLAN.md lines 99-100; CONTEXT lines 77-78): grep the snapshot for `:7442|thxp`, `:1883|mqtt`, `:8883|mqtts`; extend the Phase-29 verify commands with the legacy device flow (check-in → OTT redeem → firmware download over `:7442` + plain MQTT) via the `console-retest` / device-MCP paths.

**Rollback-demo choreography (D-06)** — no direct analog; assemble from the pieces above:
1. Cut over the pilot-token-removed config (`docker service update --force` per the deploy-flow notes, swarm.md / AGENTS.md).
2. Roll the Traefik service back to `/mnt/data/edge-rollback/traefik-2026-10-06/` (the Phase-29 out-of-git 600 snapshot).
3. Verify app/landing/dev/console routes + HTTP→HTTPS redirect + ACME + `:7442`/plain-MQTT on the OLD config.
4. Re-apply the new (P30) config and re-verify — return to the intended P30 end state.

## Shared Patterns

### Source-of-truth chain (one-way) — applies to every edge edit
**Source:** `scripts/generate-traefik-mirror.js` (lines 2-33 header) + `.planning/runbooks/swarm.md` §Phase-29 source-of-truth section.
Chain: live on `micro` (`docker service inspect`, authoritative) → committed `thinx-swarm/traefik.yml` (edits land here) → generated `docker-compose.traefik.yml` mirror (never hand-edited) → `check-traefik-mirror.js` + the CircleCI gate enforce freshness. No edge change is "done" until the mirror is regenerated and `check-traefik-mirror.js` returns `MIRROR OK` (exit 0).

### CI staleness gate — already wired, must stay green
**Source:** `.circleci/config.yml` lines 678-680:
```yaml
    - run:
        name: Traefik mirror staleness (EDGE-RECON-01)
        command: node scripts/check-traefik-mirror.js
```
Runs in default/integrity mode (no `--swarm-repo` in CI). After the P30 regenerate, the committed mirror's body sha256 must match its banner (`MIRROR-EDITED` guard) or this step fails the build. Respect the 5-minute push→CI→Swarmpit SLA (CONTEXT line 147).

### Secret hygiene — applies to all committed P30 artifacts
**Source:** `scripts/generate-traefik-mirror.js` `redactSecrets()` (lines 67-76) + 29-02/29-03 grep gates.
Committed files stay templated/redacted: no resolved pilot-token UUID, no `$apr1$`/`$2[aby]$` hashes, no `-----BEGIN` key material, `${VAR}` left templated. The pilot token is named only as a (now-resolved) item; its value never enters git. Resolved values live only in the out-of-git 600 rollback snapshot on `micro`.

### ACME storage path authority
**Source:** `services/traefik/update.sh` line 37:
```bash
ACME=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json
```
The named-volume `acme.json` is the authoritative cert store (not the dead app-file's `/traefik/acme.json`). The D-06 rollback restores certs instantly from the 600 snapshot without re-triggering ACME challenges.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every P30 file maps to a Phase-29 analog. The only genuinely new choreography is the D-06 live rollback+restore cycle, which has no single prior analog but is assembled from the Phase-29 capture/verify/deploy pieces documented under "P30 verification + rollback demo" above. |

## Metadata

**Analog search scope:** `scripts/`, `services/traefik/`, `.circleci/`, `.planning/runbooks/`, `.planning/runbooks/swarm-configs/`, `.planning/phases/29-edge-reconciliation-source-of-truth/`
**Files scanned:** generate-traefik-mirror.js, check-traefik-mirror.js, update.sh, 29-02-PLAN.md, 29-03-PLAN.md, traefik-edge-fixforward.md, traefik-edge-diff.2026-10-06.md, .circleci/config.yml
**Tracked-source gate:** all 8 analog paths verified git-tracked via `git ls-files` (no gitignored capability-mirror paths emitted)
**Pattern extraction date:** 2026-10-07
</content>
</invoke>
