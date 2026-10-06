---
phase: 29-edge-reconciliation-source-of-truth
plan: 03
subsystem: infra
tags: [traefik, swarm, edge, acme, rollback, source-of-truth, runbook, docker]

requires:
  - phase: 29-02
    provides: traefik-edge.A.pre.yml + diff report + reconciled thinx-swarm + regenerated mirror
provides:
  - out-of-git pre-Phase-30 rollback baseline on micro (acme.json + resolved-snapshot.yml, mode 600)
  - committed redacted traefik-edge.A.post.yml (byte-identical to .pre — zero behavior change proof)
  - swarm.md "Traefik Edge Source of Truth" section (one-way chain + enforcement)
  - traefik-edge-fixforward.md (P30-P34 wart hand-off, requirement-mapped)
affects: [phase-30, phase-33, phase-34, traefik-migration]

actuals:
  tokens: 9000
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Out-of-git resolved rollback snapshot on the production host at mode 600 (dir 700, root) — secrets never enter git"

key-files:
  created:
    - .planning/runbooks/swarm-configs/traefik-edge.A.post.yml
    - .planning/runbooks/traefik-edge-fixforward.md
    - /mnt/data/edge-rollback/traefik-2026-10-06/   # OUT-OF-GIT on micro, mode 600
  modified:
    - .planning/runbooks/swarm.md

key-decisions:
  - "Resolved rollback snapshot assembled entirely on micro (docker inspect + docker config) so resolved secrets never left the host or entered git or orchestrator context."
  - ".post.yml is a verbatim copy of .pre.yml — Phase 29 changed no edge behavior (the only committed-repo change was reconciling the security-headers middleware into thinx-swarm, which already matched live)."

patterns-established:
  - "Out-of-git 600 rollback baseline on the production host as the Phase-30 restore source (certs restored without ACME re-challenge)"

requirements-completed: [EDGE-RECON-01, EDGE-RECON-02]

coverage:
  - id: D1
    description: "Pre-Phase-30 rollback baseline saved out-of-git on micro (raw acme.json + resolved-snapshot.yml, dir 700 / files 600 / root-owned); committed .post.yml byte-identical to .pre.yml"
    requirement: EDGE-RECON-01
    verification:
      - kind: automated
        ref: "ssh micro stat acme.json == '600 root'; ls dir has resolved-snapshot; diff -q .pre .post == identical; grep leak in .post == 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "One-way source-of-truth chain (live micro thx -> thinx-swarm -> generated mirror) documented in swarm.md, naming check-traefik-mirror.js + CI step as enforcement and the acme named-volume path"
    requirement: EDGE-RECON-01
    verification:
      - kind: automated
        ref: "grep gate: section header + thinx-swarm + check-traefik-mirror.js + docker-compose.traefik.yml all present"
        status: pass
    human_judgment: false
  - id: D3
    description: "traefik-edge-fixforward.md maps every preserved wart to its P30-P34 phase + requirement; pilot token named only (no value)"
    requirement: EDGE-RECON-02
    verification:
      - kind: automated
        ref: "grep gate: pilot/exposedbydefault/EDGE-API/EDGE-TLS/EDGE-OPS/docker.sock present; grep -c 095c70c4 == 0"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-06
status: complete
---

# Phase 29 Plan 03: Rollback Baseline, Source-of-Truth Docs & Fix-Forward Hand-off

**Saved the pre-Phase-30 rollback baseline out-of-git on micro (600), proved zero edge-behavior change with an identical .post snapshot, documented the one-way source-of-truth chain in swarm.md, and handed P30–P34 a requirement-mapped fix-forward list.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-10-06T19:58Z
- **Tasks:** 3
- **Files modified:** 3 committed (+ 1 out-of-git dir on micro)

## Accomplishments
- Wrote `/mnt/data/edge-rollback/traefik-2026-10-06/` on micro (dir 700, root): raw `acme.json` (24 certs, mode 600) + `resolved-snapshot.yml` (mode 600) carrying the resolved traefik command, labels, env values (DOMAIN/EMAIL/USERNAME/HASHED_PASSWORD/CONFIG) and tls.toml. Assembled entirely on-host; secrets never entered git or my context. This is the Phase-30 instant-cert-rollback source.
- Committed `traefik-edge.A.post.yml` — byte-identical to `.pre.yml` (zero behavior change proof, D-05).
- Added the "Traefik Edge Source of Truth" section to `swarm.md`: the one-way chain live(`micro` thx /mnt/gluster/deployment/swarm) → thinx-swarm → generated mirror, naming `check-traefik-mirror.js` + the CircleCI staleness step as enforcement, the acme named-volume path, and the out-of-git rollback location.
- Wrote `traefik-edge-fixforward.md`: 8 preserved warts mapped to P30–P34 + EDGE-API/EDGE-TLS/EDGE-OPS requirements, with the zero-cleanup boundary and the `:7442`/MQTT preservation constraint stated.

## Task Commits

1. **Task 1: out-of-git rollback snapshot + committed .post** — `a82a8beb` (feat)
2. **Task 2: swarm.md source-of-truth section** — `8aba7553` (docs)
3. **Task 3: traefik-edge-fixforward.md** — `8b894cb3` (docs)

## Files Created/Modified
- `/mnt/data/edge-rollback/traefik-2026-10-06/{acme.json,resolved-snapshot.yml}` — OUT-OF-GIT on micro, 600
- `.planning/runbooks/swarm-configs/traefik-edge.A.post.yml` — redacted post snapshot (== .pre)
- `.planning/runbooks/swarm.md` — source-of-truth section
- `.planning/runbooks/traefik-edge-fixforward.md` — P30–P34 wart list

## Decisions Made
- Build the resolved snapshot on micro (not by shipping values back) so resolved secrets stay out-of-git and out of orchestrator context.
- `.post == .pre` verbatim: the only committed-repo reconciliation (security-headers in thinx-swarm) matched live already, so live edge behavior is unchanged.

## Deviations from Plan
None - plan executed as written. (One operational retry: the first micro run aborted because `docker config inspect {{.Spec.Data}}` renders the byte array, not base64; switched to `{{json .Spec.Data}}` | base64 -d. The script is idempotent; the second run produced the correct 600-mode artifacts.)

## Issues Encountered
- `docker config inspect --format '{{.Spec.Data}}'` is not base64 (Go renders []byte as a decimal array). Fixed by using the JSON form, matching the Wave-2 capture method.

## User Setup Required
None remaining — the micro host/key were reachable and the out-of-git rollback write completed (operator pre-approved the production write).

## Next Phase Readiness
- Phase 30 has a safe, instant rollback baseline on micro and a requirement-mapped fix-forward list. Re-scope P30 against the reconciled truth (production already v2.11 native v2 syntax; the "v1→v2 hop" is largely moot — see the diff report's re-scope note).

---
*Phase: 29-edge-reconciliation-source-of-truth*
*Completed: 2026-10-06*
