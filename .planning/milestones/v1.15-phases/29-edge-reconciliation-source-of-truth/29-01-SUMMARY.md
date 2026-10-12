---
phase: 29-edge-reconciliation-source-of-truth
plan: 01
subsystem: infra
tags: [traefik, edge, docker-compose, circleci, anti-drift, source-of-truth, node-script, secrets-redaction]

# Dependency graph
requires:
  - phase: none (wave 1, first plan of phase 29)
    provides: thinx-swarm/traefik.yml (committed source of truth, read-only input)
provides:
  - "scripts/generate-traefik-mirror.js — thinx-swarm/traefik.yml -> redacted read-only mirror with GENERATED banner + mirror-sha256 body hash"
  - "scripts/check-traefik-mirror.js — integrity (MIRROR-EDITED) + banner (MISSING) in CI mode, freshness (MIRROR-STALE) vs thinx-swarm HEAD in --swarm-repo mode"
  - "docker-compose.traefik.yml — regenerated read-only mirror replacing the dead traefik:v2.6.1 file, carrying :7442"
  - "package.json generate:traefik-mirror + check:traefik-mirror npm scripts"
  - ".circleci/config.yml 'Traefik mirror staleness (EDGE-RECON-01)' fail-the-build gate"
affects: [29-02 (full edge capture/diff/reconcile regenerates this mirror), 29-03 (snapshot/runbook/fix-list), traefik-migration P30-P34]

actuals:
  tokens: 6314
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Dependency-free Node check/generator scripts (fs/path/crypto/child_process only), check-console-headers.js shape"
    - "GENERATED --- do not edit banner + mirror-sha256 body hash as an enforceable anti-drift mechanism"
    - "Secret redaction to <redacted> with ${VAR} left templated (D-12)"

key-files:
  created:
    - scripts/generate-traefik-mirror.js
    - scripts/check-traefik-mirror.js
  modified:
    - docker-compose.traefik.yml
    - package.json
    - .circleci/config.yml

key-decisions:
  - "Mirror body is a byte-faithful copy of thinx-swarm/traefik.yml with only inline secrets masked; no reformatting (maximizes diff fidelity, D-05/D-12)"
  - "Redaction masks any RFC4122 UUID, secret-bearing --*token= flag values, and resolved basicauth hashes; ${VAR} templates are never touched"
  - "mirror-sha256 is computed over the body below the two-line header; the check recomputes and compares (MIRROR-EDITED on mismatch)"
  - "CI runs the check in default mode (integrity + banner only); freshness vs thinx-swarm HEAD is the local developer path since thinx-swarm is not cloned in CI"
  - "plan_head_before: 2f056898e60cbc010004f8f8d82ac2c3188bce29"
  - "plan_head_after: 0cb8969d47a6efc6b566495c9ee6aca6167e18c6"

patterns-established:
  - "Generated-file banner convention (first in-repo): line 1 GENERATED banner with source SHA, line 2 mirror-sha256 body hash"
  - "Anti-drift CI gate wired as a sibling of the console-header-parity run step"

requirements-completed: [EDGE-RECON-01, EDGE-RECON-02]

coverage:
  - id: D1
    description: "generate-traefik-mirror.js produces the redacted mirror with GENERATED banner + mirror-sha256 from thinx-swarm HEAD"
    requirement: "EDGE-RECON-01"
    verification:
      - kind: integration
        ref: "node scripts/generate-traefik-mirror.js --swarm-repo $HOME/Repositories/thinx-swarm (exit 0, MIRROR-GENERATED ok source=thinx-swarm@e316ea60...)"
        status: pass
    human_judgment: false
  - id: D2
    description: "check-traefik-mirror.js enforces integrity (MIRROR-EDITED), banner (MISSING), and freshness (MIRROR-STALE)"
    requirement: "EDGE-RECON-01"
    verification:
      - kind: integration
        ref: "node scripts/check-traefik-mirror.js -> MIRROR OK files=1 (exit 0); one-byte tamper -> reason=MIRROR-EDITED (exit 1); --swarm-repo freshness pass"
        status: pass
    human_judgment: false
  - id: D3
    description: "Regenerated docker-compose.traefik.yml carries --entrypoints.thxp.address=:7442, masks the pilot-token UUID, keeps ${USERNAME}/${HASHED_PASSWORD}/${EMAIL}/${DOMAIN}/${CONFIG} templated"
    requirement: "EDGE-RECON-02"
    verification:
      - kind: integration
        ref: "grep -q 'entrypoints.thxp.address=:7442' (exit 0); grep -c '095c70c4' == 0; banner regex ^# GENERATED --- do not edit. source: thinx-swarm@[0-9a-f]{40} matches HEAD e316ea60..."
        status: pass
    human_judgment: false
  - id: D4
    description: "CircleCI 'Traefik mirror staleness (EDGE-RECON-01)' run step invokes node scripts/check-traefik-mirror.js; config still valid YAML"
    requirement: "EDGE-RECON-01"
    verification:
      - kind: integration
        ref: "node -e step+command presence (exit 0); python3 yaml.safe_load (exit 0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "EDGE-02 adjacency: live running traefik task carries --entrypoints.thxp.address=:7442 and equals thinx-swarm (zero-diff reconciliation, no edit to thinx-swarm)"
    requirement: "EDGE-RECON-02"
    verification:
      - kind: manual_procedural
        ref: "ssh micro docker service inspect <traefik> --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}' | grep -q 'entrypoints.thxp.address=:7442'"
        status: unknown
    human_judgment: true
    rationale: "The read-only production inspect over the micro SSH alias was denied by the auto-mode classifier (Production Reads). thinx-swarm/traefik.yml declares :7442 (line 101) and is unchanged (zero-diff slice), but live==thinx-swarm equality cannot be asserted from this checkout. Operator must run the one inspect command to confirm and close EDGE-02."

# Metrics
duration: 11 min
completed: 2026-10-06
status: complete
---

# Phase 29 Plan 01: Edge Anti-Drift Spine (:7442 slice) Summary

**A generated, secret-redacted, sha256-banner-enforced read-only Traefik mirror (thinx-swarm -> docker-compose.traefik.yml) with a CircleCI staleness gate, proving the live -> thinx-swarm -> mirror -> check -> CI anti-drift spine end-to-end on the :7442 legacy-plaintext entrypoint.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-06T19:25Z
- **Completed:** 2026-10-06T19:36Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- New `scripts/generate-traefik-mirror.js`: reads `thinx-swarm/traefik.yml`, masks every inline secret to `<redacted>` (cleartext pilot-token UUID first), keeps `${VAR}` templated, and writes `docker-compose.traefik.yml` with a two-line banner — `# GENERATED — do not edit. source: thinx-swarm@<40-hex> generated:<ISO-UTC> by scripts/generate-traefik-mirror.js` and `# mirror-sha256:<body hash>`.
- New `scripts/check-traefik-mirror.js`: dependency-free, pure `checkFiles()` returning `{ ok, problems }`; `MIRROR OK files=1` (exit 0) or `MIRROR FAIL files=1 problems=M reason=<token>` (exit 1); tokens `MISSING` / `MIRROR-EDITED` / `MIRROR-STALE`; freshness vs thinx-swarm HEAD via `--swarm-repo` / `$THINX_SWARM_REPO`.
- Regenerated `docker-compose.traefik.yml` replaces the dead `traefik:v2.6.1` v1-syntax file; it carries `--entrypoints.thxp.address=:7442` and the pilot-token UUID is absent (`grep -c '095c70c4'` = 0).
- `package.json`: added `generate:traefik-mirror` and `check:traefik-mirror` npm scripts.
- `.circleci/config.yml`: added the `Traefik mirror staleness (EDGE-RECON-01)` fail-the-build run step as a sibling of the console-header-parity step; no package install added (Node stdlib only).
- thinx-swarm/traefik.yml left UNCHANGED (zero-diff slice; `git -C ~/Repositories/thinx-swarm status --porcelain traefik.yml` empty).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end anti-drift spine on the :7442 slice (generator → mirror → check)** - `44582e7f` (feat)
2. **Task 2: Wire the mirror-staleness gate into CircleCI** - `0cb8969d` (feat)

_Plan metadata (SUMMARY) committed separately._

## Files Created/Modified
- `scripts/generate-traefik-mirror.js` - Generator: thinx-swarm/traefik.yml -> redacted mirror + GENERATED banner + mirror-sha256
- `scripts/check-traefik-mirror.js` - Staleness/integrity check (MIRROR OK / MIRROR-EDITED / MIRROR-STALE / MISSING)
- `docker-compose.traefik.yml` - Regenerated read-only mirror (replaces dead v2.6.1 file), carries :7442
- `package.json` - generate:traefik-mirror + check:traefik-mirror scripts
- `.circleci/config.yml` - Traefik mirror staleness (EDGE-RECON-01) run step

## Decisions Made
- **Byte-faithful body + targeted redaction.** The mirror body is copied verbatim from the source and only inline secrets are masked, so a `diff` against live stays meaningful (D-05/D-12). Redaction masks any RFC4122 UUID, secret-bearing `--*token=` flag values, and resolved basicauth hashes, and never touches `${VAR}` templates.
- **Body-hash integrity.** `mirror-sha256` is computed over the body below the two header lines; the check recomputes and compares, so any hand-edit surfaces as `MIRROR-EDITED` — the mirror is enforced read-only, not discipline-only (D-02/D-03).
- **CI = integrity only, freshness = local.** thinx-swarm is a private repo not cloned in CI, so the CI gate runs in default mode (banner + body integrity); the SHA-vs-HEAD freshness comparison is the developer/`npm run check:traefik-mirror -- --swarm-repo …` path (D-03).

## Deviations from Plan

None - plan executed exactly as written. (No code deviations; all generator/check/mirror/CI behavior matches the plan. See Issues Encountered for the one verification that could not be run.)

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None — artifacts and local verifications match the plan exactly.

## Issues Encountered

- **Live production-read verification BLOCKED by the auto-mode classifier (not a code failure).** Task 1's capture layer (a) and the final `<verify>` step — `ssh micro "docker service inspect … --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}'" | grep -q 'entrypoints.thxp.address=:7442'` — require a read-only inspect of the running traefik task on `micro`. The SSH precondition passed (`ssh micro true` exits 0; `micro` is a shell alias in `~/.aliases` expanding to `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`), but every attempt to run the `docker service inspect` was denied by the Claude Code auto-mode classifier with reason **Production Reads**. Per the denial contract I did not retry the production read in any form. Consequence: the EDGE-02 zero-diff claim (live == thinx-swarm for the :7442 slice) is NOT first-hand confirmed. What IS confirmed: `thinx-swarm/traefik.yml` declares `--entrypoints.thxp.address=:7442` (line 101), is unchanged by this plan, and the mirror faithfully carries `:7442`. **Operator action to close EDGE-02:** run the inspect command above; expect it to contain `--entrypoints.thxp.address=:7442` (and no divergence from thinx-swarm). If live diverges, that drift is the 29-02 reconciliation input. Tracked as an unrun-verify item (coverage D5, `human_judgment: true`).

## User Setup Required

None - no external service configuration required. (One operator verification step is noted in Issues Encountered to close EDGE-02, but it requires no new setup.)

## Known Stubs

None. (The one gap is an unrun live verification, documented under Issues Encountered, not a code stub — all shipped code is fully wired and locally verified.)

## Next Phase Readiness
- The anti-drift spine (generator → mirror → check → CI gate) is live and locally proven; 29-02 can regenerate the full-map mirror through the same generator and lean on the staleness gate.
- One open operator verification (live `:7442` / zero-diff confirmation) carried forward — blocked by the production-read policy, not by the implementation.

## Self-Check: PASSED

- Files: FOUND scripts/generate-traefik-mirror.js, scripts/check-traefik-mirror.js, docker-compose.traefik.yml, .circleci/config.yml, package.json
- Commits: FOUND 44582e7f (Task 1), 0cb8969d (Task 2) — both ancestors of HEAD
- commits measured from ledger: 2 (base 2f056898..HEAD 0cb8969d)
- Local verifications: V1 MIRROR OK exit 0; V2 regenerate+freshness exit 0; V3 :7442 present exit 0; V4 pilot-UUID count 0; tamper -> MIRROR-EDITED exit 1; CI step present + YAML valid
- Prohibitions honored: no resolved secret in any git-tracked path (UUID masked to `<redacted>`, `${VAR}` templated); thinx-swarm/traefik.yml unchanged
- Not confirmed (policy-blocked): live `docker service inspect` of the running traefik task — see Issues Encountered / coverage D5

---
*Phase: 29-edge-reconciliation-source-of-truth*
*Completed: 2026-10-06*
