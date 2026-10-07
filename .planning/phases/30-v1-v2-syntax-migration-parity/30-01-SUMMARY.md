---
phase: 30-v1-v2-syntax-migration-parity
plan: 01
subsystem: infra
tags: [traefik, edge, swarm, v2-syntax, pilot-token, mqtt, acme, mirror, anti-drift]

# Dependency graph
requires:
  - phase: 29-edge-reconciliation-source-of-truth
    provides: "reconciled thinx-swarm source of truth, generate/check-traefik-mirror anti-drift spine, A.pre/A.post edge snapshots, out-of-git rollback baseline on micro"
provides:
  - "Inert --pilot.token flag removed live from the running traefik_traefik task on v2.11 (D-04)"
  - "Vestigial vpn/mqtt/mqtts/thxp entrypoints + dead mosquitto-secure router annotated in committed thinx-swarm (D-03)"
  - "Regenerated docker-compose.traefik.yml mirror (banner SHA = pilot-removed thinx-swarm HEAD 3e048a5; MIRROR OK)"
  - "Redacted pre/post edge snapshots (traefik-edge.B.pre/.post.yml) proving a clean single-flag change"
  - "EDGE-MIG-01 v2-syntax parity asserted in the deploy source of truth; P30 fix-forward resolutions recorded"
affects: [31-v2-v3-upgrade, 32-v3-native-syntax, 33-dashboard-lockdown-tls, 34-edge-ops, 30-02-rollback-demo]

# Actuals (#2632)
actuals:
  tokens: 5200
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live edge cutover via digest-pinned image + --resolve-image=never + reused live admin-auth hash, so the only service-spec delta is the removed flag"
    - "pre/post snapshots structured so grep -v 'pilot' diff is byte-clean (pre/post-specific wording confined to lines containing 'pilot')"

key-files:
  created:
    - .planning/runbooks/swarm-configs/traefik-edge.B.pre.yml
    - .planning/runbooks/swarm-configs/traefik-edge.B.post.yml
  modified:
    - ~/Repositories/thinx-swarm/traefik.yml   # external repo (source of truth) — committed @3e048a5
    - docker-compose.traefik.yml               # regenerated mirror
    - .planning/runbooks/traefik-edge-fixforward.md

key-decisions:
  - "D-04: removed the inert cleartext --pilot.token live on v2.11; referenced by flag name only, UUID never committed"
  - "D-02: device/MQTT stay direct (thinx_api :7442, thinx_mosquitto :1883/:8883); Traefik publishes only :80/:443"
  - "D-03: vestigial entrypoints + dead mosquitto-secure router annotated as comments only, no functional change"
  - "D-05: --providers.docker.exposedbydefault=true confirmed deferred to P33 (not changed in P30)"
  - "Cutover deployed the edited COMMITTED file (not the stale pre-Phase-29 on-disk file) with the image pinned to the running digest and the live admin-auth hash reused, so only --pilot.token changed on the live service"

patterns-established:
  - "Edit lands in thinx-swarm (committed SoT) -> mirror regenerated (never hand-edited) -> check-traefik-mirror green -> live deploy -> running-task verify"
  - "Secret hygiene: pilot token/UUID + apr1 hash never committed; snapshots redact to <redacted>; grep gates fail on any leak"

requirements-completed: [EDGE-MIG-01, EDGE-MIG-04]

coverage:
  - id: D1
    description: "Inert --pilot.token removed live from the running traefik_traefik task (v2.11); exactly one flag removed, all six entrypoints incl :7442 retained; mirror regenerated + check green"
    requirement: EDGE-MIG-01
    verification:
      - kind: integration
        ref: "ssh micro docker service inspect traefik_traefik .Spec...Args -> pilot count 0, thxp:7442 present"
        status: pass
      - kind: automated
        ref: "node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm -> MIRROR OK files=1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live edge healthy after cutover: all routes serve over :443 + HTTP->HTTPS redirect, console retest clean, and the legacy :7442 + plain-MQTT device flow (check-in -> OTT redeem -> firmware download) works"
    requirement: EDGE-MIG-04
    verification:
      - kind: manual_procedural
        ref: "operator human-verify gate (Task 2) — all four checks confirmed passed 2026-10-07"
        status: pass
    human_judgment: true
    rationale: "Legacy device check-in/OTT/firmware over plaintext + browser route/redirect/console UX require a human at the live edge; automated gates assert only that :7442/plain-MQTT remain published and reachable"
  - id: D3
    description: "EDGE-MIG-01 v2-syntax parity asserted in the deploy source of truth (4 v2 markers present, 0 v1 markers); P30 fix-forward resolutions recorded (#1 removed, #8 stays-direct, #2 deferred P33)"
    requirement: EDGE-MIG-01
    verification:
      - kind: automated
        ref: "grep gates: providers.docker + certificatesresolvers + http.routers/services + entrypoints.*.address=: present; defaultentrypoints|Address::|--docker=|--acme= count 0"
        status: pass
    human_judgment: false

# Metrics
duration: ~56 min (incl. a mid-Task-1 pause for an operator-cleared GPG passphrase gate)
completed: 2026-10-07
status: complete
---

# Phase 30 Plan 01: Pilot-token removal live cutover + v2-syntax parity Summary

**Removed the inert cleartext `--pilot.token` flag live from the running `traefik_traefik` task on v2.11 (one flag, nothing else), regenerated the anti-drift mirror, captured redacted pre/post edge snapshots, and confirmed EDGE-MIG-01 v2-syntax parity — with `:7442` plaintext + plain MQTT preserved throughout.**

## Performance

- **Duration:** ~56 min (includes a mid-Task-1 pause while the operator cleared a GPG passphrase gate out-of-band)
- **Started:** 2026-10-07T11:38Z (approx)
- **Completed:** 2026-10-07T12:34Z
- **Tasks:** 3 (Task 1 auto/tracer, Task 2 blocking-human checkpoint — operator approved, Task 3 auto)
- **Files modified:** 5 (1 external thinx-swarm + 4 in-repo), 2 created

## Accomplishments
- Edited the committed source of truth `thinx-swarm/traefik.yml`: stripped the inert `--pilot.token` flag (D-04) and annotated the vestigial `vpn/mqtt/mqtts/thxp` entrypoints + dead `mosquitto-secure` router (D-03, comments only). Committed signed in the external repo (`3e048a5`).
- Regenerated `docker-compose.traefik.yml` from the new thinx-swarm HEAD; `check-traefik-mirror.js --swarm-repo` returned `MIRROR OK files=1` (banner SHA = `3e048a5`).
- Performed the LIVE production cutover on `micro`: deployed the pilot-removed config so the running `traefik_traefik` task's resolved Args no longer contain `--pilot.token`. Exactly one flag removed; all six entrypoints incl. `--entrypoints.thxp.address=:7442` retained; image digest + admin-auth label unchanged; Traefik still publishes only :80/:443.
- Captured redacted, non-executable pre/post snapshots (`traefik-edge.B.pre.yml` / `.B.post.yml`) that differ only by the removed pilot line.
- Operator confirmed (Task 2 human-verify gate) the live edge healthy: routes over HTTPS + redirect, console retest, and the legacy `:7442` + plain-MQTT device flow (check-in → OTT redeem → firmware download).
- Asserted EDGE-MIG-01 v2-syntax parity (4 v2 markers, 0 v1 markers) and recorded the P30 fix-forward resolutions (#1 removed, #8 stays-direct, #2 deferred→P33).

## Task Commits

1. **Task 1: Pilot-token removal end-to-end (edit → mirror → check → live cutover → verify)** — thinx-swarm `3e048a5` (external, feat) + `500e259a` (feat: mirror + B snapshots)
2. **Task 2: Operator human-verify of the live edge** — no commit (blocking-human checkpoint; operator approved)
3. **Task 3: v2-syntax parity + P30 fix-forward resolutions** — `7bc332d2` (docs)

**Plan metadata:** finalization commit (docs: complete plan — SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `~/Repositories/thinx-swarm/traefik.yml` (external) — pilot flag removed + D-03 annotations (committed `3e048a5`)
- `docker-compose.traefik.yml` — regenerated read-only mirror (banner SHA `3e048a5`)
- `.planning/runbooks/swarm-configs/traefik-edge.B.pre.yml` — redacted PRE-cutover edge snapshot (pilot present, redacted)
- `.planning/runbooks/swarm-configs/traefik-edge.B.post.yml` — redacted POST-cutover edge snapshot (pilot gone)
- `.planning/runbooks/traefik-edge-fixforward.md` — Phase 30 resolutions section appended

## Decisions Made
- **Deployed the edited COMMITTED file, not the stale on-disk file.** The on-disk `/mnt/gluster/deployment/swarm/traefik.yml` was pre-Phase-29 (dated Mar 28) and differed from live by more than the pilot token — it lacked the reconciled `security-headers` ordering and carried an extra `traefik-public-https.middlewares=…,security-headers` line the live service does NOT have. Deploying it would have changed middleware wiring. Instead the cutover used the edited committed source (which matches live minus the pilot flag), with the image pinned to the exact running digest (`sha256:d57faa4f…`) + `--resolve-image=never` and the live admin-auth hash reused — so the ONLY live service-spec delta was the removed `--pilot.token`. The stale on-disk file was backed up to `traefik.yml.bak.20261007120354.pre-p30-pilot` and replaced with the faithful config (drift eliminated).
- Image left at v2.11 (committed SoT keeps the pinned `v2.11.0` tag per Phase-29 zero-diff equivalence; the deploy pinned the running digest to avoid any churn). No image bump (D-05 context).

## Deviations from Plan

### Notes / verify-command caveat

**1. [Doc note] The plan's Gate-7 mosquitto verify command is prefix-wrong**
- **Found during:** Task 1 verification
- **Issue:** `docker service ls --filter name=mosquitto -q` returns empty because Docker's service-name filter is prefix-matched and the service is named `thinx_mosquitto` — so the canned command produced `docker service inspect` with no argument.
- **Fix:** Verified the underlying fact directly with `docker service inspect thinx_mosquitto` — `:1883` and `:8883` confirmed published. Future runs should use `--filter name=thinx_mosquitto`.
- **Files modified:** none (verification-command correction only)
- **Verification:** mosquitto :1883 + :8883 OK (explicit-name inspect)

**2. [Implementation choice, not scope change] Cutover mechanism**
- Used the edited committed file + digest-pin + reused hash (see Decisions Made) rather than a minimal edit of the stale on-disk file. This was necessary to keep the live change to exactly the pilot flag and avoid the stale file's middleware drift. No scope creep; no other wart touched.

---

**Total deviations:** 0 code auto-fixes; 2 documented notes (1 verify-command caveat, 1 cutover-mechanism rationale).
**Impact on plan:** None on scope. All plan prohibitions honored (no other wart removed; :7442/plain-MQTT preserved; no secret committed; exposedbydefault left true).

## Issues Encountered
- **GPG signing gate (resolved).** On first attempt, `git commit` failed (`gpg: cannot open '/dev/tty'`) — the signing key's passphrase was not cached and `pinentry-mac` could not launch from the non-interactive executor context. Signing is mandatory here (`commit.gpgsign=true`; all prior commits signed `G`), so `--no-gpg-sign` was NOT used. Execution halted mid-Task-1 (edit staged, nothing live-changed) and returned a human-action checkpoint. The operator cached the passphrase (8h agent TTL); execution resumed cleanly at Task 1 step (b). All commits are signed `G`.

## User Setup Required
None - no external service configuration required beyond the operator-opened maintenance window (used and now closeable for this plan) and the GPG passphrase caching noted above.

## Next Phase Readiness
- Plan 30-02 (Wave 2) is unblocked: the D-06 live rollback+restore cycle to the Phase-29 snapshot (`micro:/mnt/data/edge-rollback/traefik-2026-10-06/`), with the P30 end-state config now live. The pre-P30 rollback backup `traefik.yml.bak.20261007120354.pre-p30-pilot` also exists in the deploy folder.
- Preserved warts (#2 exposedbydefault→P33, #3 --api→P33, #4 ACME→P33, #5 TLS/HSTS→P33, #6 log level→P34, #7 docker.sock→P34) remain for later phases per the fix-forward list.

## Self-Check: PASSED

- Files verified present: `30-01-SUMMARY.md`, `docker-compose.traefik.yml`, `traefik-edge.B.pre.yml`, `traefik-edge.B.post.yml`, `traefik-edge-fixforward.md`.
- Commits verified ancestors of HEAD: `500e259a` (Task 1 mirror+snapshots), `7bc332d2` (Task 3 fix-forward); external thinx-swarm `3e048a5` (Task 1 source edit).
- Live edge verified post-cutover: running task carries 0 pilot args, all six entrypoints incl `:7442`; Traefik publishes only :80/:443; thinx_api :7442 + thinx_mosquitto :1883/:8883 intact.

---
*Phase: 30-v1-v2-syntax-migration-parity*
*Completed: 2026-10-07*
