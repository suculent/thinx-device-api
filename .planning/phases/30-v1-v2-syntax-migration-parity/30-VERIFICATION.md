---
phase: 30-v1-v2-syntax-migration-parity
verified: 2026-10-07T13:15:31Z
status: passed
score: 8/8 must-haves verified
covered_files:
  - ".planning/phases/30-v1-v2-syntax-migration-parity/30-01-PLAN.md"
  - ".planning/phases/30-v1-v2-syntax-migration-parity/30-01-SUMMARY.md"
  - ".planning/phases/30-v1-v2-syntax-migration-parity/30-02-PLAN.md"
  - ".planning/phases/30-v1-v2-syntax-migration-parity/30-02-SUMMARY.md"
  - ".planning/runbooks/swarm-configs/traefik-edge.B.post.yml"
  - ".planning/runbooks/swarm-configs/traefik-edge.B.pre.yml"
  - ".planning/runbooks/swarm-configs/traefik-edge.B.rollback-demo.md"
  - ".planning/runbooks/swarm.md"
  - ".planning/runbooks/traefik-edge-fixforward.md"
  - "docker-compose.traefik.yml"
covered_digest: "v3:sha256:f29313f9d744ad1f337ff1a6acd10237e2468f02983e47a7152e80e0a7cea8de"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 30: v1→v2 Syntax Migration (parity) Verification Report

**Phase Goal:** Migrate static flags + Docker labels to v2 syntax on a current v2.x image with identical routing; plaintext device paths preserved.
**Verified:** 2026-10-07T13:15:31Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | (SC1) Deploy source of truth uses v2 syntax only — `providers.docker`, `certificatesresolvers`, `http.routers`/`http.services` labels, `entrypoints.*.address=:` — and carries zero v1-era markers | ✓ VERIFIED | `docker-compose.traefik.yml`: all four v2 markers present; `grep -Ec 'defaultentrypoints\|Address::\|--docker=\|--acme='` = 0. thinx-swarm `traefik.yml` matches. |
| 2 | (SC2) Every existing route (app/landing/dev/console) serves identically over :443, HTTP→HTTPS redirect intact, ACME certs valid under the v2 `le` resolver | ✓ VERIFIED | Operator-approved blocking-human gates (30-01 Task 2, 30-02 Task 2, both 2026-10-07). Evidence record `traefik-edge.B.rollback-demo.md`: https {app,console,rtm,thinx.cloud}=200; console/rtm/landing HTTP=301; app.thinx.cloud cert valid (LE YR2, notAfter 2026-12-28). Live re-run not available to verifier; evidence-of-record per phase charter. |
| 3 | (SC3 / EDGE-MIG-04 backstop) Legacy `__DISABLE_HTTPS__` device flow (check-in → OTT redeem → firmware download) succeeds over :7442 + plain MQTT | ✓ VERIFIED | Backstop item; operator confirmed the end-to-end legacy device flow at both human-verify gates (30-01 D2, 30-02 D4, `human_judgment:true status:pass`). Snapshots confirm thinx_api publishes :7442, thinx_mosquitto publishes :1883/:8883. |
| 4 | (SC4) Rollback to the Phase-29 out-of-git snapshot is demonstrated on the live service and returned to the P30 end state | ✓ VERIFIED | `traefik-edge.B.rollback-demo.md` documents all five stages (pre-check → rollback → OLD-config verify → re-apply → re-verify); operator approved 30-02 gate. |
| 5 | (EDGE-MIG-01) Running traefik_traefik task's resolved Args no longer contain `--pilot.token`; all six entrypoints incl :7442 retained; exactly one flag removed | ✓ VERIFIED | `traefik-edge.B.post.yml` (17 args, 0 pilot, six entrypoints); `grep -v pilot` pre/post diff is byte-clean; operator-confirmed running-task state. |
| 6 | (EDGE-MIG-01 anti-drift) Mirror regenerated from pilot-removed thinx-swarm HEAD; banner SHA = HEAD; `check-traefik-mirror.js` green | ✓ VERIFIED | `check-traefik-mirror.js --swarm-repo` → `MIRROR OK files=1` (exit 0); banner `thinx-swarm@3e048a5…` == `git -C thinx-swarm rev-parse HEAD`. |
| 7 | (EDGE-MIG-04 / D-02) Direct-publish model preserved — :7442 by thinx_api, :1883/:8883 by thinx_mosquitto; Traefik publishes only :80/:443 | ✓ VERIFIED | Both snapshots record `published_ports: 80,443` for traefik and direct-publish map for thinx_api/thinx_mosquitto; thinx-swarm `traefik.yml` D-03 annotation documents the model. |
| 8 | (EDGE-MIG-04 concurrency) Rollback→re-apply cycle leaves exactly one running traefik task per stage | ✓ VERIFIED | Evidence record: 1 running task at rollback stage and at P30 end state (prior task Shutdown); operator confirmed single healthy task. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

Note on live-edge truths (2, 3, 5, 7, 8): these assert runtime state on the production `micro`
edge that the verifier cannot re-execute. Per the phase charter they are verified on the
evidence-of-record basis — two operator-approved blocking-human gates plus the committed, redacted
snapshot/evidence artifacts, which are internally consistent with the locally re-run automated gates.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `~/Repositories/thinx-swarm/traefik.yml` | pilot flag removed + D-03 annotations; other warts kept | ✓ VERIFIED | HEAD `3e048a5`; only a D-04 comment mentions pilot (flag gone); `exposedbydefault=true` + six entrypoints intact (external repo, correctly off this branch). |
| `docker-compose.traefik.yml` | regenerated v2-syntax mirror, banner SHA = HEAD | ✓ VERIFIED | banner `3e048a5`; `MIRROR OK`; v2 markers present, v1 markers 0. |
| `traefik-edge.B.pre.yml` | redacted PRE snapshot (pilot present, redacted) | ✓ VERIFIED | non-executable, 0 secret hits, pilot line `<redacted>`. |
| `traefik-edge.B.post.yml` | redacted POST snapshot (pilot gone) | ✓ VERIFIED | non-executable, 0 secret hits; pre↔post diff clean except pilot line. |
| `traefik-edge.B.rollback-demo.md` | redacted 5-stage rollback evidence | ✓ VERIFIED | non-executable, 0 secret hits; documents rollback + re-apply. |
| `traefik-edge-fixforward.md` | P30 resolutions (#1 removed, #8 stays-direct, #2 →P33) | ✓ VERIFIED | `## Phase 30 resolutions` present; #1 RESOLVED/REMOVED, #8 stays-direct, #2 deferred→P33; 0 secret hits. |
| `swarm.md` | P30 pilot-removal + rollback-demo section | ✓ VERIFIED | header + rollback-demo ref + snapshot path + :7442 note present; 0 secret hits. |

### Key Link Verification

| From → To | Via | Status | Details |
| --------- | --- | ------ | ------- |
| thinx-swarm edit → mirror → check → CI gate | generate/check-traefik-mirror.js | ✓ WIRED | banner SHA == HEAD `3e048a5`; `MIRROR OK files=1` exit 0. |
| committed config → live traefik_traefik Args sans pilot | micro deploy + redeploy | ✓ WIRED | POST snapshot + evidence record: 0 pilot, `--entrypoints.thxp.address=:7442` present (operator-confirmed). |
| thinx_api :7442 + mosquitto :1883/:8883 → device paths | direct-publish (D-02) | ✓ WIRED | snapshots + operator legacy-device-flow gate. |
| snapshot acme.json → named volume → certs served no re-challenge | rollback restore | ✓ WIRED | evidence record stage 2/3; cert valid off restored store. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| EDGE-MIG-01 | 30-01, 30-02 | v1→v2 syntax parity on current v2.x image, routes serve identically | ✓ SATISFIED | v2/v1 marker gates, route parity (operator), rollback route re-verify. |
| EDGE-MIG-04 | 30-01, 30-02 | :7442 + plain MQTT keep legacy check-in/OTT/firmware after every hop | ✓ SATISFIED | direct-publish preserved, operator legacy-device-flow gate at both plans. |

Both declared requirement IDs accounted for. REQUIREMENTS.md still shows both as "Pending" in the
status table (tracking-table lag only — the phase completes them); no orphaned IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `docker-compose.traefik.yml` | 76/82 | Duplicate `traefik-public-https.middlewares` label (code-review WR-01, open) | ℹ️ Info | Docker label map is last-wins → `admin-auth,error-pages-middleware`; `admin-auth` is retained, so the auth chain is NOT dropped. Pre-existing dashboard-router (`api@internal`) config mirrored from live, not introduced by this phase (phase changed only the pilot flag + comments); belongs to the `--api` wart deferred to P33. Not a goal blocker. |
| `docker-compose.traefik.yml` | 100/118 | Comment-hygiene nits (IN-01/02/03: `(CHANGED)` vs `exposedbydefault=true`; misplaced certresolver comment; `1194/udp` comment vs TCP bind) + IN-04 unused `net` overlay | ℹ️ Info | Comment/declaration cosmetics only; no functional effect. Open review-info items, inherited from the thinx-swarm source of truth. |

No debt markers (TBD/FIXME/XXX) in any phase-modified file. No secret leaked in any committed
artifact (pilot UUID / apr1 / bcrypt / PEM grep = 0 across all six files).

### Human Verification Required

None outstanding. Both plans' blocking-human gates were executed and operator-approved during the
P30 maintenance window on 2026-10-07 (recorded in 30-01 coverage D2 and 30-02 coverage D4,
`human_judgment:true status:pass`). The live-edge and legacy-device-flow checks that require a human
were satisfied in-phase; the verifier raises no new human items.

### Gaps Summary

No gaps. All four ROADMAP success criteria and all eight consolidated must-have truths are verified:
v2-syntax parity is asserted in the deploy source of truth with zero v1 markers; the inert
`--pilot.token` was removed live on v2.11 as a clean single-flag delta with all six entrypoints
(incl. :7442) retained; the anti-drift mirror is regenerated and check-green with the banner SHA
pinned to the pilot-removed thinx-swarm HEAD; the :7442 plaintext + plain-MQTT direct-publish paths
are preserved and operator-confirmed end-to-end; and the live rollback to the Phase-29 snapshot was
demonstrated and returned to the P30 end state. Open code-review items are Info-level (one Warning,
WR-01, is a benign last-wins duplicate that keeps the auth chain) and all map to pre-existing warts
already deferred to P33/P34 — none block the Phase 30 goal.

---

_Verified: 2026-10-07T13:15:31Z_
_Verifier: Claude (gsd-verifier)_
