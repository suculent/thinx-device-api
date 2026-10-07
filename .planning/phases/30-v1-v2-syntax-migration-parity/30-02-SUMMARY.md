---
phase: 30-v1-v2-syntax-migration-parity
plan: 02
subsystem: infra
tags: [traefik, edge, swarm, rollback, acme, pilot-token, mqtt, v2-syntax, maintenance-window]

# Dependency graph
requires:
  - phase: 30-v1-v2-syntax-migration-parity
    provides: "30-01 P30 end state live (pilot-token removed on v2.11); B.post.yml P30 snapshot; pre-P30 rollback backup on micro"
  - phase: 29-edge-reconciliation-source-of-truth
    provides: "out-of-git 600 rollback snapshot on micro (/mnt/data/edge-rollback/traefik-2026-10-06/); named-volume acme.json authority; ssh micro / # expect conventions"
provides:
  - "Criterion 4 (D-06) satisfied: a LIVE rollback+restore cycle demonstrated end-to-end on production traefik_traefik and returned to the P30 end state"
  - "Redacted, non-executable evidence record traefik-edge.B.rollback-demo.md (all five stages; pilot <redacted> at rollback, absent after re-apply)"
  - "swarm.md Phase-30 section documenting the pilot-token removal + rollback demo under the Phase-29 source-of-truth chain"
  - "Proven rollback mechanism: surgical single-flag delta via docker service update --args, pinned image digest unchanged, certs restored from snapshot acme.json with no ACME re-challenge"
affects: [31-v2-v3-upgrade, 32-v3-native-syntax, 33-dashboard-lockdown-tls, 34-edge-ops]

# Actuals (#2632)
actuals:
  tokens: 4061
  tasks: 3
  commits: 2
  plan_head_before: e25dbd24676a8f9f1e5bad1d0c516b8c7a3cd7b4
  plan_head_after: 0859d6f81d39680b3faed1c54768a53e82e44ce5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live Traefik rollback as a single-flag Args delta: docker service update --args keeping the current pinned image digest (no --image, no re-resolve), so the only live service-spec change is the toggled --pilot.token"
    - "Args-quoting proven on an isolated scaled-to-zero throwaway service with a FAKE token (printf %q + --args round-trip, backtick constraint intact) before touching the live service"
    - "Rollback secret never printed: pilot UUID read from the snapshot into a shell var, applied, then unset; captured Args always redacted via sed"

key-files:
  created:
    - .planning/runbooks/swarm-configs/traefik-edge.B.rollback-demo.md
  modified:
    - .planning/runbooks/swarm.md

key-decisions:
  - "Rollback executed via docker service update --args (surgical single-flag delta) rather than a stack-file redeploy, matching the 30-01 cutover discipline and avoiding the stale on-disk file's middleware drift"
  - "Kept the current pinned image digest on both hops (no --image passed) so docker never re-resolves traefik:v2.11; the only spec delta is the pilot flag"
  - "Restored the snapshot acme.json onto the named volume before the rollback restart to demonstrate no-ACME-re-challenge cert serving (content byte-size-identical to live, so a faithful no-op in substance)"
  - "Saved a belt-and-suspenders full-spec JSON backup out-of-git on micro before any mutation (traefik-p30-prerolldemo-<UTC>.json, 600 root), in addition to the standing Phase-29 snapshot"

requirements-completed: [EDGE-MIG-04, EDGE-MIG-01]

coverage:
  - id: D1
    description: "Live rollback restores the Phase-29 snapshot onto traefik_traefik; on the OLD config all routes serve over :443, HTTP->HTTPS redirect holds, TLS cert valid off the restored acme.json (no ACME re-challenge), and :7442 plaintext + plain MQTT accept connections"
    requirement: EDGE-MIG-04
    verification:
      - kind: integration
        ref: "ssh micro: rollback stage = 18 Args incl pilot, 1 running task; https {app,console,rtm,thinx.cloud}=200; http console/rtm/thinx=301; app.thinx.cloud:443 checkend 0 valid (LE YR2, notAfter 2026-12-28); :7442/:1883/:8883 OPEN"
        status: pass
    human_judgment: false
  - id: D2
    description: "After re-applying the P30 config the edge returns to the P30 end state: running Args carry no pilot flag, all six entrypoints incl :7442 present, exactly one running task, cert valid, :7442/MQTT intact"
    requirement: EDGE-MIG-01
    verification:
      - kind: integration
        ref: "ssh micro: final Args = 17, pilot count 0, thxp:7442 present, 1 running task, thinx_api :7442 + thinx_mosquitto :1883/:8883 published, app.thinx.cloud cert valid; matches traefik-edge.B.post.yml"
        status: pass
    human_judgment: false
  - id: D3
    description: "[EDGE concurrency] exactly one running traefik task per stage — the rollback->re-apply cycle leaves a single consistent edge state, no half-converged/duplicate tasks"
    requirement: EDGE-MIG-04
    verification:
      - kind: integration
        ref: "docker service ps --filter desired-state=running traefik_traefik -> exactly 1 at rollback stage and at P30 end state"
        status: pass
    human_judgment: false
  - id: D4
    description: "Operator confirmed the rollback demonstration and the restored healthy P30 end state (all four human-verify checks) at the blocking-human gate"
    requirement: EDGE-MIG-04
    verification:
      - kind: manual_procedural
        ref: "Task 2 blocking-human checkpoint — operator approved 2026-10-07 (rollback observed working; re-applied edge loads over HTTPS w/ redirect + clean console-retest; legacy :7442/plain-MQTT device flow; single running task, no pilot flag)"
        status: pass
    human_judgment: true
    rationale: "Production edge work inside the maintenance window + legacy device check-in/OTT/firmware over plaintext require a human at the live edge; automated gates assert service state, routes, cert and port reachability only"

# Metrics
duration: ~30 min (incl. a Task-2 blocking-human operator-verify pause)
completed: 2026-10-07
status: complete
---

# Phase 30 Plan 02: Live rollback + restore cycle demonstration Summary

**Demonstrated the Phase-30 rollback end-to-end on the real `traefik_traefik` service — rolled the live edge back to the Phase-29 out-of-git snapshot (pilot flag temporarily re-introduced), verified the full edge on that OLD config, then re-applied the P30 pilot-token-removed end state and re-verified — with `:7442` plaintext + plain MQTT intact at every stage and the edge left healthy at the P30 end state.**

## Performance

- **Duration:** ~30 min (includes a Task-2 blocking-human pause while the operator verified the live edge)
- **Completed:** 2026-10-07
- **Tasks:** 3 (Task 1 auto — the live cycle; Task 2 blocking-human checkpoint — operator approved; Task 3 auto — runbook doc)
- **Files:** 1 created, 1 modified

## Accomplishments
- Ran the D-06 live rollback+restore cycle on production `traefik_traefik` within the open P30 maintenance window, as a surgical single-flag Args delta (`docker service update --args`, pinned image digest `d57faa4f…` unchanged throughout).
  - **Pre-check:** Phase-29 snapshot present (`acme.json` 600 root + `resolved-snapshot.yml`, dir 700). Live `acme.json` byte-size-identical to the snapshot (same certs).
  - **Rollback:** restored the snapshot `acme.json` onto the named volume, re-introduced `--pilot.token` (value read from the snapshot into a never-printed var) → 18 Args incl. pilot, `:7442` present, exactly 1 running task.
  - **OLD-config verify:** `https://{app,console,rtm,thinx.cloud}/` all 200; HTTP→HTTPS 301 on console/rtm/landing (app.thinx.cloud is the API host, answers HTTP 200 by design w/ HSTS); cert valid (LE `YR2`, notAfter 2026-12-28) off the restored acme.json with no ACME re-challenge; `:7442`/`:1883`/`:8883` OPEN.
  - **Re-apply P30:** rebuilt Args as rollback-minus-pilot (nothing else) → 17 Args, 0 pilot, `:7442` present, exactly 1 running task; matches `traefik-edge.B.post.yml`.
  - **P30 re-verify:** all plan `<verify>` gates green.
- Proved the `--args` quoting round-trips on an isolated scaled-to-zero throwaway service (with a FAKE token) before mutating the live service, so the backtick-bearing `--providers.docker.constraints=Label(...)` arg could not be mangled. Saved a belt-and-suspenders full-spec JSON backup out-of-git on `micro`.
- Wrote the redacted, non-executable evidence record `traefik-edge.B.rollback-demo.md` (all five stages; pilot `<redacted>` at rollback, absent after re-apply; both stages' route/redirect/cert/:7442/MQTT results) and appended the Phase-30 section to `swarm.md`.
- Operator confirmed the rollback demonstration and the restored healthy P30 end state (all four checks) at the blocking-human gate.

## Task Commits

1. **Task 1: Live rollback → verify OLD config → re-apply P30 → re-verify** — `c5da695e` (docs: redacted evidence record)
2. **Task 2: Operator human-verify of the cycle + restored P30 end state** — no commit (blocking-human checkpoint; operator approved)
3. **Task 3: Document P30 pilot-token removal + rollback demo in swarm.md** — `0859d6f8` (docs)

**Plan metadata:** finalization commit (docs: complete plan — SUMMARY + STATE + ROADMAP).

## Files Created/Modified
- `.planning/runbooks/swarm-configs/traefik-edge.B.rollback-demo.md` — NEW, redacted, non-executable evidence of the five-stage cycle.
- `.planning/runbooks/swarm.md` — appended `## Traefik Pilot-token removal + rollback demo (Phase 30 / EDGE-MIG-01 — 2026-10-07)`.

## Decisions Made
- **Rollback via `docker service update --args`, not a stack redeploy.** Mirrors the 30-01 cutover discipline (single-flag delta, pinned digest, hash reused) and avoids the stale on-disk file's known middleware drift. The pilot flag was re-introduced by reading its value from the snapshot into a shell var (never printed) and appending it via `printf %q` quoting.
- **Kept the current pinned image digest on both hops** (no `--image` passed) so docker never re-resolves `traefik:v2.11`; the only live spec delta on each hop is the toggled `--pilot.token`.
- **Restored the snapshot `acme.json` before the rollback restart** to demonstrate no-ACME-re-challenge cert serving; content was byte-size-identical to the live store, so a faithful no-op in substance.

## Deviations from Plan

### Notes / verify-command caveat

**1. [Doc note, carried from 30-01] The mosquitto service-name filter is prefix-wrong**
- **Found during:** Task 1 / Task 3 verification.
- **Issue:** `docker service ls --filter name=mosquitto -q` returns empty — Docker's service-name filter is prefix-matched and the service is `thinx_mosquitto`; the plan's canned Gate-4 command then ran `docker service inspect` with no argument.
- **Fix:** used `--filter name=thinx_mosquitto` (and `docker service inspect thinx_mosquitto` directly); `:1883`/`:8883` confirmed published. Carried the caveat into the evidence record and the swarm.md section.
- **Files modified:** none (verification-command correction only).

**2. [Observation, not a change] `app.thinx.cloud` answers HTTP 200, not a redirect**
- `app.thinx.cloud` is the API host (`thinx_api`) and serves plaintext HTTP 200 by design (HSTS header present) — a pre-existing baseline consistent with the keep-7442 plaintext-tolerant posture. HTTP→HTTPS redirect is verified on the console/rtm/landing hosts (301). Identical before and after the cycle; the rollback changed only the inert pilot flag.

---

**Total deviations:** 0 code auto-fixes; 2 documented notes (1 verify-command caveat, 1 baseline observation).
**Impact on plan:** None on scope. All prohibitions honored — `:7442`/plain-MQTT never closed/redirected/TLS-enforced; no snapshot/acme.json content copied into git (referenced by path only); the edge was NOT left on the rolled-back config (returned to the P30 end state); no opportunistic change re-introduced on re-apply.

## Issues Encountered
- Minor: `docker service create --resolve-image=never` is rejected (that flag is update-only); used `--no-resolve-image` on the throwaway test. No impact on the live service.
- GPG signing was cached and working throughout (operator-confirmed); both task commits are signed `G`. No `--no-gpg-sign` used.

## User Setup Required
None beyond the operator-opened maintenance window (used; the window may now be closed for Phase 30) and the GPG passphrase caching from 30-01.

## Next Phase Readiness
- Criterion 4 (rollback to the Phase-29 snapshot) is now demonstrated on the real service, completing the P30 scope (parity confirmation + pilot-token removal in 30-01; live rollback demo here). EDGE-MIG-01 + EDGE-MIG-04 re-verified on both the rolled-back and the re-applied config.
- The Phase-29 out-of-git snapshot (`micro:/mnt/data/edge-rollback/traefik-2026-10-06/`) remains the standing rollback target for the P31 v2→v3 hop; a pre-roll-demo full-spec backup also remains on `micro` (600 root).
- Deferred warts for later phases: `exposedbydefault`→P33, `--api`/8080→P33, ACME email/renewal + TLS min/HSTS→P33, `--log.level`→P34, `docker.sock:ro`→P34 (per `traefik-edge-fixforward.md`).

## Self-Check: PASSED

- Files verified present: `30-02-SUMMARY.md`, `traefik-edge.B.rollback-demo.md`, `swarm.md`.
- Commits verified ancestors of HEAD: `c5da695e` (Task 1 evidence record), `0859d6f8` (Task 3 swarm.md).
- Live edge verified post-cycle: running traefik task carries 0 pilot args, all six entrypoints incl `:7442`; exactly 1 running task; `thinx_api` :7442 + `thinx_mosquitto` :1883/:8883 published; app.thinx.cloud serves a valid non-expired cert.
- No resolved secret (pilot UUID / `admin-auth` hash / PEM / email) committed in the evidence record, swarm.md, or this SUMMARY (grep gate = 0).

---
*Phase: 30-v1-v2-syntax-migration-parity*
*Completed: 2026-10-07*
