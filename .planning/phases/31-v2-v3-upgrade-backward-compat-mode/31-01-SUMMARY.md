---
phase: 31-v2-v3-upgrade-backward-compat-mode
plan: 01
subsystem: infra
tags: [traefik, edge, migration, v3, swarm, boot-and-discover, mirror, anti-drift]

# Dependency graph
requires:
  - phase: 30-v1-v2-syntax-migration-parity
    provides: "v2.11 baseline edge config (pilot token removed, 17 flags) + traefik-edge.A.pre.yml router inventory + generate/check-traefik-mirror anti-drift spine"
provides:
  - "Converted thinx-swarm/traefik.yml: --providers.swarm + swarm-namespace constraints/exposedbydefault(=true) + --core.defaultRuleSyntax=v2, image traefik:v3.7.14, own traefik.swarm.network label; entrypoints/ACME/log/api carried byte-identical (18 flags)"
  - "@docker->@swarm middleware refs (3 labels on thinx_api/thinx_console) + traefik.docker.network->traefik.swarm.network (6 labels) in the confirmed authoritative live source docker-swarm.yml; same renames mirrored into thinx-swarm/thinx.yml + landing/errorpage/downtime/swarmpit/vault.yml"
  - "Regenerated docker-compose.traefik.yml mirror (banner SHA = thinx-swarm 5e19c000; MIRROR OK files=1)"
  - "Runbook .planning/runbooks/traefik-v3-cutover.md: 16-service rename inventory, authoritative-source verdict, ordered surgical cutover mechanism (Stages A/B1/B2/C) with the post-B2 router gate, boot-and-discover record"
  - "Boot-and-discover proof: traefik:v3.7.14 parses the converted config (1/1 in 10 s); swarm provider discovers the complete router set (32 http routers, 29 enabled; the 3 disabled are exactly the live @docker refs Plan 03 B2 flips); 18/18 services enabled on traefik-public addresses; production acme.json untouched"
affects: [31-02, 31-03, 32, 33]

# Actuals (#2632) — same scale as the plan estimate (chars/4 over the realized diff)
actuals:
  tokens: 13300
  tasks: 3
  commits: 4
plan_head_before: 247c9236d585af846a10a41c02f3d80d942fc146
plan_head_after: 6fa445d3e1fcd82e8904b3585cf5e07878cd138a

# Tech tracking
tech-stack:
  added: ["traefik:v3.7.14 (committed image line; live only as a throwaway probe so far)"]
  patterns:
    - "Boot-and-discover tracer: throwaway swarm service with NO host ports, docker.sock:ro only, ACME storage at a throwaway path + LE staging CA, --api.insecure on the task only; assert via /api/http/routers status filter, then docker service rm"
    - "Pre-cutover bridge: carry BOTH traefik.docker.network and traefik.swarm.network across the hop (each version ignores the other's key) so the network label has a zero-length window"
    - "Rename edit lands in the confirmed live-matching source (docker-swarm.yml), is mirrored into the stale thinx-swarm twin so a future sync cannot re-introduce @docker"

key-files:
  created:
    - .planning/runbooks/traefik-v3-cutover.md
    - .planning/phases/31-v2-v3-upgrade-backward-compat-mode/deferred-items.md
  modified:
    - docker-swarm.yml                          # authoritative thinx-stack source: @swarm refs + swarm.network labels
    - docker-compose.traefik.yml                # regenerated mirror (banner SHA 5e19c000)
    - ~/Repositories/thinx-swarm/traefik.yml    # external repo (edge source of truth) — committed @5e19c000, UNPUSHED
    - ~/Repositories/thinx-swarm/{thinx,landing,errorpage,downtime,swarmpit,vault}.yml  # external, same commit

key-decisions:
  - "docker-swarm.yml is the confirmed authoritative committed thinx-stack source (0 traefik-label diff vs the gluster deploy copy and vs live Spec.Labels); thinx-swarm/thinx.yml is stale (no thinx-api-ws router, no security-headers refs) — renamed anyway, never stack-deploy from it until reconciled"
  - "Cutover mechanism: ordered surgical docker service update (Stage A bridge label on all 16 services; B1 traefik image+args hop; B2 @swarm refs on thinx_api/thinx_console; C remove docker.network labels) — NOT a stack deploy (would drop the live-only INFLUXDB_TOKEN mount, reset edge auth hashes, and cannot reach the 5 services with no source file)"
  - "Operator decision A (blocking-human checkpoint): the 'every router enabled' gate is deferred to Plan 03 post-B2 against the live v3 service; the 3 disabled routers in the probe are accepted as the tracer's falsification record; no production label touched, probe not re-run; the unqualified-ref zero-window bridge was not chosen"
  - "D-04 held: exposedbydefault stays true (moved into the swarm namespace only); no --providers.swarm.endpoint added; tls.toml/dashboard/ACME/log untouched"

patterns-established:
  - "Probe-before-hop: every v3 static/provider change is proven on a no-host-port throwaway against the real swarm provider before the one-way live step"
  - "Rename inventory as a per-service table (networks count, provider-suffixed refs, network label, source file) is the artifact the cutover stages are derived from"

requirements-completed: [EDGE-MIG-02]

coverage:
  - id: D1
    description: "Converted traefik.yml static command: --providers.swarm, --core.defaultRuleSyntax=v2, providers.swarm.exposedbydefault=true, no --providers.docker* flag; all six entrypoint address lines incl. :7442/:1883/:8883/:1194 byte-identical; image traefik:v3.7.14"
    requirement: EDGE-MIG-02
    verification:
      - kind: automated
        ref: "grep -q -- '--providers.swarm' docker-compose.traefik.yml && grep -q -- '--core.defaultRuleSyntax=v2' docker-compose.traefik.yml && test \"$(grep -v '^#' docker-compose.traefik.yml | grep -c -- '--providers.docker')\" -eq 0"
        status: pass
      - kind: automated
        ref: "grep -q 'address=:7442' && 'address=:1883' && 'address=:8883' && 'address=:1194' docker-compose.traefik.yml"
        status: pass
    human_judgment: false
  - id: D2
    description: "@docker->@swarm middleware refs and traefik.docker.network->traefik.swarm.network labels renamed in the confirmed authoritative live source (docker-swarm.yml) and mirrored into thinx-swarm/thinx.yml + siblings; no secret/hash/key material committed"
    requirement: EDGE-MIG-02
    verification:
      - kind: automated
        ref: "test \"$(grep -v '^#' docker-swarm.yml | grep -c 'traefik.docker.network')\" -eq 0 -> 0; grep -c '@docker' docker-swarm.yml -> 0"
        status: pass
      - kind: automated
        ref: "grep -Ec '\\$apr1\\$|\\$2[aby]\\$|BEGIN |PRIVATE KEY' over runbook + docker-compose.traefik.yml + docker-swarm.yml -> 0 hits each"
        status: pass
    human_judgment: false
  - id: D3
    description: "Mirror regenerated from the new thinx-swarm HEAD and verified (anti-drift spine)"
    requirement: EDGE-MIG-02
    verification:
      - kind: automated
        ref: "node scripts/generate-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm && node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm -> MIRROR-GENERATED ok source=thinx-swarm@5e19c000…; MIRROR OK files=1 (exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Boot-and-discover: throwaway traefik_v3probe on traefik:v3.7.14 converges 1/1 with the converted config (static config parses) and the swarm provider discovers the complete expected router set (not empty, not a subset) with 0 service/middleware errors; multi-network services resolve to traefik-public addresses"
    requirement: EDGE-MIG-02
    verification:
      - kind: integration
        ref: "ssh micro docker service ls --filter name=traefik_v3probe -> 1/1 at t=10 s; Endpoint.Ports null; /api/overview routers 32 (errors 3), services 18 (errors 0), middlewares 9 (errors 0); the 3 errored routers == the 3 inventoried @docker labels — recorded in runbook §Boot-and-discover"
        status: pass
    human_judgment: false
  - id: D5
    description: "ACME neutralized on the probe (no shared cert volume mount, storage at /tmp/acme-test.json, LE staging CA); production acme.json never written; probe torn down; live v2.11 :80/:443 service untouched"
    requirement: EDGE-MIG-02
    verification:
      - kind: integration
        ref: "stat acme.json baseline 301146 1791377596 600 root == post-teardown; docker service rm traefik_v3probe -> 0 services/0 containers; traefik_traefik still v2.11, 17 args, task not restarted — recorded in runbook §Teardown"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every expected router enabled under v3 (full set, /api/http/routers status filter prints nothing)"
    requirement: EDGE-MIG-02
    verification: []
    human_judgment: true
    rationale: "Gate deferred to Plan 03 post-B2 by operator decision A; the 3 live @docker refs (thinx-api-https, thinx-api-ws, thinx-console-https) can only flip to @swarm at the hop — flipping them under v2.11 breaks the same three routers on production. Probe result 29/32 enabled with the 3 disabled exactly matching the inventory is the falsification record; the live filter MUST print nothing after Plan 03 Stage B2."

# Metrics
duration: "~18 min from the Task 1 commit (20:12Z) to close-out (~20:30Z), across two executor sessions, excluding the blocking-human checkpoint wait; ~27 min from begin-phase (20:03Z)"
completed: 2026-10-07
status: complete
---

# Phase 31 Plan 01: Traefik v3 config conversion + boot-and-discover tracer Summary

**Converted the edge static config to the Traefik v3 swarm provider with the `core.defaultRuleSyntax=v2` backward-compat switch, renamed every `@docker` middleware ref and `traefik.docker.network` label in the confirmed live source, regenerated the mirror (MIRROR OK), and proved the config off-line on a no-host-port `traefik:v3.7.14` probe: it boots in 10 s, discovers all 32 routers, and the only 3 disabled are exactly the live `@docker` labels the cutover flips — production `acme.json` and the live v2.11 edge untouched.**

## Performance

- **Duration:** ~18 min from the Task 1 commit (2026-10-07T20:12Z) to close-out (~20:30Z), across two executor sessions (the blocking-human checkpoint wait excluded); Task 1's live inspection preceded its commit, so ~27 min from begin-phase (20:03Z)
- **Started:** 2026-10-07T20:12Z (Task 1 commit, approximate)
- **Completed:** 2026-10-07T20:30Z
- **Tasks:** 3 (Task 1 auto, Task 2 auto, Task 3 tracer -> blocking-human decision checkpoint, operator selected A)
- **Files modified:** 11 (4 in-repo: 2 created + 2 modified; 7 external thinx-swarm files in one commit)

## Accomplishments

- **Task 1 — authoritative source + rename inventory.** Read-only `docker service inspect` across all 16 live traefik-enabled services (labels live in `.Spec.Labels`; none in `ContainerSpec.Labels`). The complete `@docker` set is 3 labels on 2 services (`thinx_api` `thinx-api-https`, `thinx-api-ws`; `thinx_console` `thinx-console-https`); `thinx_vue` carries no middleware live (RESEARCH/PATTERNS had assumed one). Five services sit on two overlays, so `traefik.swarm.network` is strictly required there. `docker-swarm.yml` has 0 traefik-label diff vs the gluster deploy copy and vs live; `thinx-swarm/thinx.yml` is stale. Cutover mechanism decided: ordered surgical `docker service update` (A/B1/B2/C), not a stack deploy.
- **Task 2 — forced v3 static delta + renames + mirror.** `thinx-swarm/traefik.yml` committed at `5e19c000` (17 -> 18 flags; constraints value byte-identical with backticks; `exposedbydefault` stays `true`; no `swarm.endpoint`; entrypoints/ACME/log/api unchanged; the duplicate `traefik-public-https.middlewares` key carried as-is). `docker-swarm.yml`: 3 refs -> `@swarm`, 6 network labels renamed. Siblings in thinx-swarm renamed (incl. the stale `thinx.yml`, retired chronograf, undeployed vault). Mirror regenerated: `MIRROR OK files=1`, banner SHA `5e19c000`.
- **Task 3 — boot-and-discover tracer.** `traefik_v3probe` (`traefik:v3.7.14`, `node.labels.Traefik==true`, `traefik-public`, no published ports, `docker.sock:ro` only, ACME at `/tmp/acme-test.json` + LE staging CA, `--api.insecure` on the task) converged 1/1 in 10 s. `/api/overview`: 32 http routers / 3 errors, 18 services / 0 errors, 9 middlewares / 0 errors. The 3 disabled routers carry the error `middleware "…@docker" does not exist` and are exactly the inventoried labels; every unqualified ref re-resolved to `@swarm`; all 18 services point at `10.0.1.x` (`traefik-public`) addresses, so the missing network label is harmless in this topology today (RESEARCH A3 graded). `mosquitto-secure` TCP router is undiscoverable under v2 and v3 alike (no `traefik.constraint-label`; P30 D-03 dead router). Torn down; `acme.json` size/mtime identical to baseline; live `traefik_traefik` not restarted.
- **Close-out (this session).** Operator decision A recorded in the runbook's gate verdict and as a new "Post-B2 gate" row in the cutover-mechanism table (the Plan 03 checklist item that closes the Task 3 criterion).

## Task Commits

1. **Task 1: Resolve the authoritative live thinx-stack source + rename inventory** — `60f76b4a` (docs) — runbook created; the commit also swept in the orchestrator's begin-phase `ROADMAP.md`/`STATE.md` edits and the untracked `31-01-PLAN.md`/`31-02-PLAN.md`
2. **Task 2: Forced v3 static delta + @docker->@swarm / network-label renames, mirror regenerated** — `1fe2b791` (feat) + external `thinx-swarm@5e19c000` (feat, local, unpushed)
3. **Task 3: Boot-and-discover tracer** — `a5c56133` (docs) — runbook §Boot-and-discover + `deferred-items.md`
4. **Task 3 close-out per operator decision A** — `6fa445d3` (docs) — deferred post-B2 gate recorded

**Plan metadata:** finalization commit (docs: complete plan — SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `.planning/runbooks/traefik-v3-cutover.md` (created) — rename inventory (16 services), authoritative-source verdict, cutover mechanism A/B1/B2/C + post-B2 gate, Task 2 conversion record, boot-and-discover record + teardown
- `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/deferred-items.md` (created) — 4 open items (stale thinx.yml, inert tls.toml, dead mosquitto-secure router, 5 services with no source file)
- `docker-swarm.yml` — `sslheaders@swarm,security-headers@swarm` / `sslheaders@swarm` / `security-headers@swarm`; 6x `traefik.swarm.network=traefik-public`
- `docker-compose.traefik.yml` — regenerated read-only mirror of the converted `traefik.yml`
- `~/Repositories/thinx-swarm/traefik.yml` + `thinx.yml`, `landing.yml`, `errorpage.yml`, `downtime.yml`, `swarmpit.yml`, `vault.yml` (external) — committed `5e19c000`, **not pushed**

## Decisions Made

- `docker-swarm.yml` is the authoritative committed thinx-stack source; `thinx-swarm/thinx.yml` is stale and must not be stack-deployed until reconciled (deferred item).
- Cutover via ordered surgical `docker service update` (Stage A bridge label on all 16; B1 traefik hop; B2 `@swarm` refs on `thinx_api`/`thinx_console`; C remove `docker.network` labels). A stack deploy was rejected: it would redeploy storage-bearing services, drop the live-only `INFLUXDB_TOKEN` mount, reset the edge auth hashes via `restart.sh`, and cannot reach the 5 services that have no stack file in either repo.
- The committed files pin the `@swarm` form (plan must-have); the B1->B2 seconds-long window is accepted and timed rather than avoided with unqualified refs.
- Operator decision A: "every router enabled" gate deferred to Plan 03 post-B2 (see Deviations).
- Probe hygiene: LE staging CA on the probe so unanswerable TLS-ALPN challenges never touch the production ACME account or rate limit.

## Deviations from Plan

**1. [Rule 4 - Operator decision] Task 3 "every router enabled" gate deferred to Plan 03 post-B2**
- **Found during:** Task 3 (boot-and-discover tracer)
- **Issue:** The acceptance criterion "the `/api/http/routers` status filter prints NOTHING" is unsatisfiable before the live cutover: the three live `@docker` middleware refs (`thinx-api-https`, `thinx-api-ws`, `thinx-console-https`) can only flip to `@swarm` at the hop — renaming them under the running v2.11 edge breaks the same three routers on production. The probe reads the live labels, not the committed files.
- **Fix:** Blocking-human decision checkpoint; operator selected option A (accept-deferred, no production change). The 29/32 result with the 3 disabled routers exactly matching the Task 1 inventory is recorded as the tracer's falsification record (the designed `@docker` dangling-ref detector working as intended). The gate re-runs after Plan 03 Stage B2 against the live v3 service, where it MUST print nothing — recorded in the runbook gate verdict and as the "Post-B2 gate" row of the cutover-mechanism table.
- **Verification:** 29/32 routers enabled; the 3 disabled == the inventoried `@docker` labels; 18/18 services and 9/9 middlewares with 0 errors; no fourth dangling ref, no absent router.
- **Files modified:** `.planning/runbooks/traefik-v3-cutover.md`
- **Commit:** `6fa445d3`

---

**Total deviations:** 1 (Rule 4, operator-decided)
**Impact on plan:** No scope change and no production change. The tracer proved everything it could prove before the hop (parse, full discovery, services, ACME isolation); the one criterion that structurally depends on the live cutover moves to Plan 03's checklist with the same command and a must-print-nothing verdict.

## Issues Encountered

- **Tool-permission denial (Task 3):** one read-only batch — `wget` of the discovered `thinx-console`/`thinx-api` server URLs from inside the probe plus `docker service logs traefik_v3probe` — was denied by the tool-permission classifier. Backend reachability was therefore graded from the `/api/http/services` server addresses (all on the probe's own `traefik-public` `10.0.1.0/24`) plus the routers' `enabled` state; the Plan 03 re-verify HTTPS matrix is the definitive check.
- **Begin-phase files swept into the Task 1 commit:** `60f76b4a` carries the orchestrator's `ROADMAP.md`/`STATE.md` begin-phase edits and the two untracked PLAN files alongside the runbook. Harmless (docs only), noted so the range `247c9236..HEAD` is read correctly.
- **Mirror regen is timestamp-noisy:** re-running `generate-traefik-mirror.js` for the close-out self-check rewrote only the `generated:` banner timestamp (same source SHA, same `mirror-sha256`); the working-tree change was restored, not committed.
- **`thinx_vue` assumption corrected:** RESEARCH/PATTERNS expected `security-headers@docker` on `thinx-vue-console-https`; live inspect and `docker-swarm.yml` agree there is no middleware there. Inventory records the fact; nothing to rename.
- **`mosquitto-secure` TCP router not discoverable** (0 TCP routers in the probe) — pre-existing P30 D-03 dead router, no regression; deferred item.
- **Live-state note:** Tasks 1-3 changed committed files and a throwaway service only; the gluster deploy copies and the running services still carry the v2 forms. Plan 03 applies them.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **thinx-swarm `5e19c000` is local and unpushed** (`master` ahead 3 / behind 1 of `origin/master`). Pushing — and reconciling the 1 remote commit first — is the operator's call; Plan 03 deploys the converted command from this commit (the mirror in this repo carries the same bytes).
- Plan 02 (pre-cutover snapshot + rollback dry-verify) can start: the v2.11 baseline is unchanged live (`traefik:v2.11@sha256:d57faa4f…`, 17 args, `acme.json` 301146 bytes, mode 600).
- Plan 03 inputs are in the runbook: the 18-flag converted args, the ordered A/B1/B2/C mechanism, the 3 B2 label values, and the post-B2 gate command. Stage A (bridge label) is safe to run under v2.11 ahead of the window.
- Open deferred items (phase `deferred-items.md`): stale `thinx-swarm/thinx.yml`, inert `tls.toml` (P33), dead `mosquitto-secure`, 5 services with no source file (rename live via `--label-*` only).

## Self-Check: PASSED

- Files: `.planning/runbooks/traefik-v3-cutover.md` FOUND; `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/deferred-items.md` FOUND; `docker-compose.traefik.yml` FOUND; `docker-swarm.yml` FOUND
- Commits reachable from HEAD: `60f76b4a`, `1fe2b791`, `a5c56133`, `6fa445d3` FOUND; `gsd_run check evaluation-scope --plan 31-01 --commits-only` resolved 3 plan-subject commits (before the close-out commit)
- Plan-level `<verification>` re-run locally (2026-10-07T20:27Z): generate + check -> `MIRROR OK files=1` (exit 0); `--providers.swarm` present, `--core.defaultRuleSyntax=v2` present, `--providers.docker` non-comment count 0; `:7442`/`:1883`/`:8883`/`:1194` entrypoints present; `traefik.docker.network` non-comment count in `docker-swarm.yml` 0; `@docker` count in `docker-swarm.yml` 0; apr1/bcrypt/PEM marker count 0 across runbook, mirror, `docker-swarm.yml`
- Boot-and-discover items requiring production access were not re-run (operator decision A: do not re-run the probe); results stand as recorded in the runbook
- Commits measured from the ledger: `git rev-list --count 247c9236..6fa445d3` = 4

---
*Phase: 31-v2-v3-upgrade-backward-compat-mode*
*Completed: 2026-10-07*
