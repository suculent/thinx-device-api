---
phase: 33-dashboard-lockdown-tls-hardening
plan: 03
subsystem: infra
tags: [traefik, edge, hardening, verification, scan, evidence, documentation, human-gate, nmap, sslscan, hsts, acme]

# Dependency graph
requires:
  - phase: 33-dashboard-lockdown-tls-hardening (plan 01)
    provides: loopback mgmt entrypoint + traefik-mgmt router, exposedbydefault=false, routers_post_A2 29-name baseline, scripts/traefik-edge-scan.sh + scan `## Before`, traefik-edge.E.pre.yml, the runbook skeleton
  - phase: 33-dashboard-lockdown-tls-hardening (plan 02)
    provides: 19-flag end state (file provider + tls-config-2 AEAD-only options, security-headers@swarm as the https entrypoint default, ACME proven via the influx TLS-ALPN reissue, acme.json 23 entries), Stage C/D/E records with Version.Index post-Stage-E 38379946
provides:
  - D-31 evidence bundle (15 read-only items, all green) recorded in the runbook `### Evidence bundle (33-03 Task 1)` and turned into `### Re-verify matrix (Phase 33)` (every signal before A1 vs after E, Verdict OK)
  - ROADMAP criterion 4 proven: `scripts/traefik-edge-scan.sh` `EDGE-SCAN OK` (0 FAIL lines, exit 0, 8080/8443 closed, :7442 open) committed as `## After (post-Stage-E, 2026-10-09T09:21:31Z)` + `## Reported, not gating (after)` in traefik-edge-scan.2026-10-08.md
  - `traefik-edge.E.post.yml` — redacted end-state capture (19 flags, traefik-mgmt + LOAD-BEARING labels, tls-config-2 sha, tls_toml verbatim, acme_json 23 with the new influx serial, `":8080 mgmt"` entrypoint, mgmt_api_inventory / hsts_matrix / ws_probe / external_scan / external_stack_labels sections); swarm-configs README step E + scan bullet
  - `### Live production state at hand-off (Phase 33)` with the ordered nine-step revert set (acme snapshot -> pre-D -> post-D labels -> pre-C (+ optional tls-config-1 recreate) -> pre-B -> D-08 labels -> A2 labels -> A1 -> repo reverts) and `## Recorded for Phase 34`
  - AGENTS.md Deployment bullet + `## Traefik dashboard/API access — ssh plane only (Phase 33)` (literal ssh form, docker exec wget gate, laptop socat bridge, never --api.insecure / stack deploy / restart.sh, tls-config-<N> rotation, runbook pointer, trailing-slash note)
  - thinx-swarm operator README (`f08f210`, `e29f19d` — origin/master == micro HEAD) + `docker-compose.traefik.yml` regenerated at 19 flags (MIRROR OK); fix-forward rows #2-#5 closed
  - Live: swarm config `tls-config-1` removed (recreate path documented); operator approval at the single blocking-human gate (D-31) — EDGE-API-01/02 and EDGE-TLS-01/02/03 close
affects: [phase-34 (D-05 real-client-IP / ipAllowList-rateLimit prerequisite, D-20 redirect gaps, D-16 sniStrict, X25519MLKEM768 curve note, retired ACME names, fotostim owner notification, log level / socket-proxy / SLA), verify-work (UAT of the Phase 33 evidence bundle)]

# Actuals (#2632) — same estimateTokens scale as the plan's estimate (chars/4 over the realized diff)
actuals:
  tokens: 24191
  tasks: 3
  commits: 3
plan_head_before: a4975fed40aefa33668009a947f17f18fa36db59
plan_head_after: b7be42987fa9e4ae9000826c1141b1eb3dc11a83

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase close-out = evidence bundle (read-only, every value recorded as word/number) -> external scan rerun captured next to its `## Before` -> redacted end-state capture -> re-verify matrix (baseline vs end state per signal) -> hand-off with the ORDERED revert set naming backup paths only -> one blocking-human browser gate as the LAST task"
    - "Operator-facing access recipes are written in three places that every future session reads (runbook, AGENTS.md, deploy-repo README) with the literal pre-approved ssh form; a gate finding (trailing slash) is fixed in all three in one commit"
    - "Loopback API URLs: `/dashboard/` with the trailing slash (api@internal answers 404 to `/dashboard`); `/` redirects 302"

key-files:
  created:
    - .planning/runbooks/swarm-configs/traefik-edge.E.post.yml
  modified:
    - .planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-08.md
    - .planning/runbooks/swarm-configs/README.md
    - .planning/runbooks/traefik-edge-hardening.md
    - .planning/runbooks/traefik-edge-fixforward.md
    - AGENTS.md
    - docker-compose.traefik.yml
    - ~/Repositories/thinx-swarm/README.md

key-decisions:
  - "33-03: tls-config-1 removed from the swarm only after all 15 bundle items and the external scan were green (09:31:45Z, no service update, same task k47479ipt1mb); the recreate path `git show 158f369:traefik/tls.toml | docker config create tls-config-1 -` is documented because no revert step needs the object"
  - "33-03: the overlay negative-reachability probe joins the errorpage_errorpage task netns (`--network container:<task>`), not `--network traefik-public` (not attachable on this swarm) — same question, same CLOSED answer; recorded as the standing recipe"
  - "33-03: the one ACME failure line in a 60-minute window belongs to the OLD task 36ssa5zcgpv0 (pre-prune start-time pass at 08:26:43Z, checkout.qooldata.com); the gate is the per-task-id scan on k47479ipt1mb since the Stage E fire -> 0"
  - "33-03: the thinx-swarm README is committed directly on master (plan-directed exception to the PR flow; the repo has no CI) and fast-forwarded on micro via the ssh push + ff-only recipe; the mirror is regenerated after every thinx-swarm commit so the CI staleness gate stays green"
  - "33-03: D-31 human gate approved; the dashboard bridge URL is documented with the trailing slash (`/dashboard/`) after the operator's first attempt at `/dashboard` returned 404 from api@internal"

patterns-established:
  - "Re-verify matrix row = `| Signal | Baseline (before A1) | End state (after E) | Verdict |` sourced from the Stage records and the E.pre/E.post captures, never re-measured from memory"
  - "Verify literals that depend on grep flavour / Go-template whitespace are run with `/usr/bin/grep` and `tr -s ' '` (deferred-items.md) — a literal miss is a quirk until the live value is re-read"

requirements-completed: [EDGE-API-01, EDGE-API-02, EDGE-TLS-01, EDGE-TLS-02, EDGE-TLS-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "D-31 evidence bundle at the end state: traefik:v3.7.14 args=19 idx=38379946 with the four Phase 33 flags, 0 api.insecure/providers.docker/example.com; mgmt bound 127.0.0.1:8080 only (overlay CLOSED, host rc=7, laptop rc=7); loopback API 29/0 == routers_post_A2, six middlewares (no ipAllowList/rateLimit), overview [29,0,18,6,[Swarm,File]], / -> 302 /dashboard/, APIUrl 1, no credential pre-staged; labels traefik-mgmt x3 + LOAD-BEARING port, 0 admin-auth/traefik-public-*; tls-config-2 sha bb0cba95… == committed; TLS triple + CBC/P-384 refused + nmap three AEAD suites; HSTS 17/17; HTTPS matrix == post-A2 baseline (micro 302 not 401); WS 101 (0 STS) / 401; bare-IP 301/200; 7442/1883/8883 OPEN + publishers; harness PASS x2; acme.json 291145 600 root, 23 entries, influx serial 05806B4C…, rtm/app unchanged, 0 ACME errors on the live task; repo == deployed; external stack labels == E.pre.yml"
    requirement: EDGE-API-01
    verification:
      - kind: integration
        ref: "traefik-edge-hardening.md ### Evidence bundle (33-03 Task 1, 2026-10-09 09:16–09:32 UTC) rows 1-15; 33-03-PLAN.md Task 1 <automated> blocks 4-9 (live)"
        status: pass
    human_judgment: false
  - id: D2
    description: "External scan (criterion 4, D-26..D-29): scripts/traefik-edge-scan.sh EDGE-SCAN OK, rc 0, 0 FAIL lines, port sweep 80/443 open, 8080/8443 closed, 7442 open; committed as `## After (post-Stage-E, 2026-10-09T09:21:31Z)` with the per-host matrix and `## Reported, not gating (after)` (D-20 redirects, D-16 no-SNI default cert, X25519MLKEM768 no longer offered, CBC now refused); 0 secret markers / 0 e-mails"
    requirement: EDGE-API-02
    verification:
      - kind: other
        ref: "33-03-PLAN.md Task 1 <automated> blocks 1-2 (capture greps + live rerun /tmp/p33-scan-verify.txt)"
        status: pass
    human_judgment: false
  - id: D3
    description: "traefik-edge.E.post.yml redacted end-state capture: 19 `- --` lines with mgmt.address=127.0.0.1:8080 / exposedbydefault=false / providers.file.filename=/traefik/tls.toml / https.http.middlewares=security-headers@swarm, tls-config-2, traefik-mgmt, LOAD-BEARING, certificates: 23, re_challenges_in_phase: 1, \":8080 mgmt\", sections mgmt_api_inventory / hsts_matrix / ws_probe / external_scan / external_stack_labels; 0 admin-auth / traefik-public-* tokens; 0 markers / 0 e-mails; D.post.yml + E.pre.yml untouched; swarm-configs README step `E` + scan bullet"
    requirement: EDGE-TLS-01
    verification:
      - kind: other
        ref: "33-03-PLAN.md Task 1 <automated> block 3 (E.post.yml token loop + immutability diff + README greps)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Runbook close-out: ### Re-verify matrix (Phase 33) with every §Q8 signal before/after, ### Live production state at hand-off (Phase 33) with the 19-flag command, labels, Version.Index post-Stage-E, task id and the ordered revert set naming traefik-p33-acme-/preD-/preC-/preB-/preA1- backups + the tls-config-1 recreate command, ## Recorded for Phase 34 (ipAllowList, rateLimit, thinx-api-http, sniStrict, X25519MLKEM768, retired ACME names, fotostim notification, tls-config-1 recreate, log level / socket-proxy / SLA); ### Human gate result (33-03 Task 3, D-31) recorded; 0 markers / 0 e-mails"
    requirement: EDGE-TLS-02
    verification:
      - kind: other
        ref: "33-03-PLAN.md Task 2 <automated> block 1 (runbook heading + token loop + hygiene greps)"
        status: pass
    human_judgment: false
  - id: D5
    description: "AGENTS.md: Deployment bullet `Edge (Traefik) changes: docker service update only …` and `## Traefik dashboard/API access — ssh plane only (Phase 33)` after the keep-7442 section (keep-7442 sentence byte-identical), with the literal ssh form, the docker exec wget gate, the socat bridge, `/dashboard/` trailing-slash note, never api.insecure, tls-config- rotation, runbook pointer; 0 hash markers"
    requirement: EDGE-API-02
    verification:
      - kind: other
        ref: "33-03-PLAN.md Task 2 <automated> block 2 (section order + token loop + keep-7442 sentence grep)"
        status: pass
    human_judgment: false
  - id: D6
    description: "thinx-swarm operator README (> 1 KB; docker service update, socat, 127.0.0.1:8080, tls-config-, EMAIL, ff-only, traefik-edge-hardening.md; trailing-slash note) committed on master f08f210 + e29f19d == origin/master == micro /mnt/gluster/deployment/swarm HEAD; docker-compose.traefik.yml regenerated (banner e29f19d, 19 flags, MIRROR OK files=1); fix-forward rows #2-#5 `done (Phase 33`, rows #6/#7 still P34"
    requirement: EDGE-TLS-03
    verification:
      - kind: other
        ref: "33-03-PLAN.md Task 2 <automated> blocks 3-4; this continuation: `node scripts/check-traefik-mirror.js` -> MIRROR OK files=1, 19 flags, micro `git rev-parse HEAD` == e29f19d"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-31 blocking-human gate: the operator confirms https://rtm.thinx.cloud/ (console) works over the hardened edge and accepts the evidence bundle and the recorded trade-offs; the Traefik dashboard via the laptop bridge renders at http://127.0.0.1:8080/dashboard/ (after the trailing-slash correction)"
    requirement: EDGE-TLS-01
    verification: []
    human_judgment: true
    rationale: "Browser rendering and live WebSocket updates are human-observable only; the operator typed 'approved' (relayed by the orchestrator 2026-10-09 ≈10:05Z) — recorded in the runbook `### Human gate result (33-03 Task 3, D-31)`"

# Metrics
duration: 56min
completed: 2026-10-09
status: complete
---

# Phase 33 Plan 03: Evidence, documentation and human gate Summary

**The hardened edge is proven and handed over: a 15-item read-only evidence bundle against the 19-flag end state is green on every item, the laptop scan prints `EDGE-SCAN OK` and is committed as `## After` next to the Plan 01 `## Before`, the redacted `traefik-edge.E.post.yml` capture, the re-verify matrix, the ordered nine-step revert set and the Phase 34 record are in the runbook, the ssh-plane-only dashboard/API access form is written in AGENTS.md and the thinx-swarm README (mirror regenerated, repo == deployed), `tls-config-1` is gone from the swarm, and the operator approved the single blocking-human gate — EDGE-API-01/02 and EDGE-TLS-01/02/03 close.**

## Performance

- **Duration:** ≈56 min wall clock (09:16Z → 10:12Z), of which ≈15 min was the blocking-human gate pause (≈09:50Z → ≈10:05Z)
- **Started:** 2026-10-09T09:16:00Z (Task 1 precondition re-read)
- **Completed:** 2026-10-09T10:12:00Z
- **Tasks:** 3 (Tasks 1–2 by the previous executor; Task 3 completion by this continuation agent)
- **Files modified:** 8 (7 in thinx-device-api incl. one new capture, 1 in thinx-swarm) + one live swarm object removed

## Accomplishments

- **D-31 evidence bundle, all green (Task 1, 09:16–09:32Z).** `traefik:v3.7.14 args=19 idx=38379946 upd=completed` with the four Phase 33 flags and 0 `api.insecure` / `providers.docker` / `example.com`; in-task `ss -ltn` lists exactly `127.0.0.1:8080` (overlay probe CLOSED, host and laptop `curl :8080` rc=7); loopback API `29/0` with sorted names == `routers_post_A2:`, overview `[29,0,18,6,["Swarm","File"]]`, middlewares exactly the six known names (D-05: no ipAllowList / rateLimit), `/` → 302 `/dashboard/`, `APIUrl` 1, no credential pre-staged (D-03); traefik_traefik labels = three `traefik-mgmt` keys + the LOAD-BEARING port key, 0 admin-auth / traefik-public-*; `tls-config-2` mode 292 with in-task sha == committed `bb0cba95…`; TLS 1.2 + 1.3 verify 0, TLS 1.1 refused, CBC `ECDHE-RSA-AES128-SHA` and P-384 refused on rtm/app/console, nmap TLS 1.2 set == the three ECDHE_RSA AEAD suites on all 17 hosts; HSTS exactly 1 on 17/17, 0 on plain HTTP; HTTPS matrix == the post-A2 baseline (micro `/dashboard/` 302, never 401 — D-06); WS `101` with 0 STS / cookie `401` + `X-Forwarded-Proto: https`; bare-IP `301` / `200`; `7442 OPEN 1883 OPEN 8883 OPEN` with publishers `thinx_api 7442->7442`, `traefik_traefik 80->80 443->443`, mosquitto 1883/1884/8883; device-flow harness `RESULT: PASS` over `http://rtm.thinx.cloud:7442` + `mqtt://thinx.cloud:1883` and over `https://app.thinx.cloud`; acme.json `291145 600 root`, 23 entries, influx 1 / qooldata 0, volume holds one file, influx serial `05806B4C8B028F41EC3ACCC00DF3C6A50B04` == Stage E record, rtm/app serials == E.pre.yml, 0 ACME failure lines on the live task since the Stage E fire; thinx-swarm `c03c529` == micro HEAD == mirror banner, `MIRROR OK files=1`, 19 flags, label parity diff empty; external stack labels identical to E.pre.yml (D-09).
- **ROADMAP criterion 4 proven (D-26..D-29).** `scripts/traefik-edge-scan.sh` 09:21:31Z → 09:23:28Z: **`EDGE-SCAN OK`**, rc 0, 0 `FAIL ` lines (Before: `EDGE-SCAN FAIL 32`); port sweep `80 open, 443 open, 8080 closed, 8443 closed`, `7442 open`, no-SNI `CN=TRAEFIK DEFAULT CERT`. Committed as `## After (post-Stage-E, 2026-10-09T09:21:31Z)` with the per-host matrix and `## Reported, not gating (after)` — D-20 redirect posture, D-16 no-SNI subject, X25519MLKEM768 no longer offered (`x25519`/`secp256r1` only), CBC now refused, 8080/8443 closed before and after (the lockdown changed the public ROUTE, never a port). Capture hygiene: 0 secret markers, 0 e-mail addresses.
- **End-state capture + README (D-29, D-32).** `traefik-edge.E.post.yml` written in the E.pre.yml section order (19 `- --` lines with trailing comments, `${EMAIL}` templated, `tls-config-2` + sha, labels incl. `LOAD-BEARING`, `tls_toml` verbatim, `acme_json` 23 / `re_challenges_in_phase: 1` / new influx serial / stale files absent, `":8080 mgmt"` loopback-only entrypoint, `direct_publish` + harness PASS ×2, `mgmt_api_inventory`, `hsts_matrix`, `ws_probe`, `external_scan`, `external_stack_labels`, `repo_state`); D.post.yml and E.pre.yml untouched; swarm-configs README names step `E` and the `traefik-edge-scan.<YYYY-MM-DD>.md` capture.
- **`tls-config-1` removed (the plan's one permitted live mutation, 09:31:45Z)** after every item above was green: `docker config rm tls-config-1` → 0 listed, `tls-config-2` still listed and mounted, `Version.Index 38379946` unchanged, same task `k47479ipt1mb` (a config object removal does not touch the service). Recreate path documented in the hand-off and the Phase 34 record.
- **D-32 documentation in three places (Task 2, 09:33–09:49Z).** Runbook: `### Re-verify matrix (Phase 33, …)` (one row per §Q8 signal: args 16 → 19, mgmt bind none → 127.0.0.1:8080, inventory 30 → 29, overview 30/18/7 → 29/18/6 + File, admin-auth gone, dashboard 401 → catch-all, tls-config-1 → tls-config-2, TLS 1.2 suites 5 incl. 2 CBC → 3 AEAD, curve X25519MLKEM768 → X25519, HSTS 3/17 → 17/17, ACME 24 → 23 with renewal errors 1 → 0, scan FAIL → OK, every Verdict OK), `### Live production state at hand-off (Phase 33, …)` (19-flag command, label set, `Version.Index post-Stage-E`, running task id, the ORDERED revert set (a)–(i) with exact commands and the pre-A1/B/C/D backups + `traefik-p33-acme-20261009T085846Z/` snapshot by name, (g) before (h) noted), `## Recorded for Phase 34` (D-05 real-client-IP as the prerequisite for any ipAllowList / rateLimit, operator allow-list candidates, D-20 redirect gaps, D-16 sniStrict flip mechanics, curve policy, retired ACME names, fotostim owner notification, tls-config-1 recreate, log level / socket-proxy / SLA, HSTS preload NOT submitted). AGENTS.md: Deployment bullet + `## Traefik dashboard/API access — ssh plane only (Phase 33)` directly after the keep-7442 section (unchanged), with the literal `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020` form, the docker exec `wget -qO- http://127.0.0.1:8080/api/overview` gate, the `socat TCP-LISTEN:8080,bind=127.0.0.1,…` bridge, never `--api.insecure` / publish 8080 / `docker stack deploy` / `restart.sh`, the `tls-config-<N>` rotation rule and the runbook pointer. thinx-swarm `README.md` (1 byte → operator README, `f08f210`: checkout model, edge changes via `docker service update`, dashboard/API recipes, tls.toml config rotation, `EMAIL` from the environment, mirror rule, runbook pointer) pushed to origin/master and fast-forwarded on micro; mirror regenerated (`MIRROR OK files=1`, 19 flags). `traefik-edge-fixforward.md` rows #2–#5 marked `done (Phase 33, 2026-10-09)`, rows #6/#7 still P34.
- **D-31 human gate approved (Task 3).** The operator confirmed `https://rtm.thinx.cloud/` works over the hardened edge and accepted the evidence bundle and the recorded trade-offs. Their first look at the Traefik dashboard through the laptop bridge returned 404 — root cause verified live by the orchestrator: `http://127.0.0.1:8080/dashboard` without the trailing slash is a 404 from `api@internal`, while `/dashboard/` is 200 and `/` is 302 → `/dashboard/`. With the slash the dashboard rendered. This continuation added the one-sentence note to the runbook bridge recipe, AGENTS.md and the thinx-swarm README (`e29f19d`, origin + micro, mirror regenerated) and recorded the gate result in the runbook (`### Human gate result (33-03 Task 3, D-31)`). No revert step was executed.

## Task Commits

Each task was committed atomically (thinx-device-api on `thinx-staging`, not pushed; thinx-swarm on `master`, pushed to origin and fast-forwarded on micro):

1. **Task 1: D-31 evidence bundle, scan `## After` (EDGE-SCAN OK), E.post.yml, README step E, tls-config-1 removed** — `afe9f844` docs(33-03): end-state capture E.post.yml, external scan After (EDGE-SCAN OK), README step E, evidence bundle
2. **Task 2: D-32 documentation — runbook matrix + hand-off + Phase 34 record, AGENTS.md section, thinx-swarm README (+ mirror), fix-forward rows #2–#5 closed**
   - thinx-swarm `f08f210` docs: operator README — edge changes via service update, Traefik dashboard/API access, tls.toml config rotation (Phase 33 D-32)
   - `61bf7bbd` docs(33-03): runbook re-verify matrix + hand-off + Phase 34 record; AGENTS.md dashboard/API access; fix-forward rows #2-#5 closed; mirror regenerated
3. **Task 3: human-verify (blocking-human) — approved; trailing-slash doc fix + gate record**
   - thinx-swarm `e29f19d` docs: dashboard bridge — trailing slash required (/dashboard -> 404 from api@internal, use /dashboard/)
   - `b7be4298` docs(33): dashboard bridge — trailing slash required (runbook + AGENTS.md + gate record + mirror regenerated at banner `e29f19d`)

**Plan metadata:** the final docs commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS). Measured: `git rev-list --count a4975fed..b7be4298` = 3 thinx-device-api commits; 2 thinx-swarm commits (`c03c529..e29f19d`).

## Files Created/Modified

- `.planning/runbooks/swarm-configs/traefik-edge.E.post.yml` — new redacted end-state capture (304 lines).
- `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-08.md` — `## After (post-Stage-E, 2026-10-09T09:21:31Z)` + per-host sections + `## Reported, not gating (after)` (+245 lines).
- `.planning/runbooks/swarm-configs/README.md` — step `E` in the traefik-edge per-step list; `traefik-edge-scan.<YYYY-MM-DD>.md` bullet.
- `.planning/runbooks/traefik-edge-hardening.md` — `### Evidence bundle (33-03 Task 1, …)`, `### Re-verify matrix (Phase 33, …)`, `### Live production state at hand-off (Phase 33, …)`, `### Human gate result (33-03 Task 3, D-31)`, `## Recorded for Phase 34`; trailing-slash sentence in the bridge recipe.
- `.planning/runbooks/traefik-edge-fixforward.md` — rows #2–#5 `done (Phase 33, 2026-10-09)`.
- `AGENTS.md` — Deployment bullet + `## Traefik dashboard/API access — ssh plane only (Phase 33)` (+ trailing-slash sentence); keep-7442 section byte-identical.
- `docker-compose.traefik.yml` — regenerated twice (banner `f08f210` → `e29f19d`, 19 flags, MIRROR OK).
- `~/Repositories/thinx-swarm/README.md` — operator README (+ trailing-slash sentence).
- Live (not files): docker config `tls-config-1` removed; workstation scratch `/tmp/p33-harness-7442.log`, `/tmp/p33-harness-https.log`, `/tmp/p33-scan-after.txt`, `/tmp/p33-scan-verify.txt` (not committed).

## Decisions Made

- `tls-config-1` removed only after the full bundle and the scan were green; recreate path documented since no revert step needs the object (dropping `--providers.file.filename` makes any mounted file inert).
- Overlay negative-reachability probe runs from the `errorpage_errorpage` task netns (the research recipe `--network traefik-public` is refused: network not attachable) — the standing recipe since Plan 01.
- The ACME failure-line gate is the per-task-id scan on the live task since the Stage E fire (0), not a wall-clock window — the one line in 60 minutes is the old task's pre-prune start-time pass.
- thinx-swarm README committed on `master` as the plan directs (no CI on that repo; micro is a git checkout updated by ssh push + `--ff-only`); mirror regenerated after each thinx-swarm commit.
- Dashboard bridge URL documented with the trailing slash in all three places after the gate finding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Overlay probe `docker run --network traefik-public` refused — probe run from a traefik-public peer's netns**
- **Found during:** Task 1 (bundle item 2, mgmt bind)
- **Issue:** `network traefik-public not manually attachable` on this swarm, so the plan's overlay recipe cannot run as written.
- **Fix:** `docker run --rm --network container:<errorpage_errorpage task> alpine:3.20 nc -z -w2 traefik 8080` → CLOSED, with the `:80` control → OPEN (same question, same answer; recipe established in Plan 01).
- **Files modified:** `.planning/runbooks/traefik-edge-hardening.md` (evidence bundle row 2)
- **Verification:** CLOSED with a positive control; host and laptop rc=7 agree.
- **Committed in:** `afe9f844`

**2. [Rule 1 - Bug] 60-minute ACME failure-line count was 1, not the plan's 0 — attributed to the old task**
- **Found during:** Task 1 (bundle item 13, ACME)
- **Issue:** The plan's "since 60 m → 0" window overlapped the pre-prune start-time pass of the OLD task `36ssa5zcgpv0` (08:26:43Z, `checkout.qooldata.com`, pruned in Stage E — D-24).
- **Fix:** The gate used is the per-task-id scan on the live task `k47479ipt1mb` since the Stage E fire → 0, with the attribution recorded verbatim in the bundle row.
- **Files modified:** `.planning/runbooks/traefik-edge-hardening.md`
- **Verification:** provider-error scan 0; influx served serial == Stage E record; `-checkend 0` ok ×4.
- **Committed in:** `afe9f844`

**3. [Rule 3 - Blocking] Verify literals run with `/usr/bin/grep` and `tr -s ' '` (deferred-items.md carry-over)**
- **Found during:** Tasks 1–2 (`<automated>` blocks; publishers line, WS rule grep)
- **Issue:** The laptop `grep` is a ugrep-wrapping shell function and the Go `{{range .Endpoint.Ports}}` template emits a trailing space, so two plan literals miss while the live values are correct (Phase 33 `deferred-items.md`, item 1).
- **Fix:** Blocks run with `grep` pinned to `/usr/bin/grep` and the publishers line read with `tr -s ' '`; no file or live state changed.
- **Files modified:** none (recorded in the evidence bundle row 11 and deferred-items.md)
- **Verification:** all `<automated>` blocks pass under the pinned grep.
- **Committed in:** n/a (procedural)

**4. [Plan-directed exception] thinx-swarm README committed directly on `master`**
- **Found during:** Task 2 (and Task 3's trailing-slash fix)
- **Issue:** The repo's normal flow is PR-based elsewhere; the plan directs a direct `master` commit + origin push + micro ff-merge (`refs/heads/p33-docs`, `--ff-only`).
- **Fix:** Followed the plan; micro checkout `git status` shows only the pre-existing untracked `*.bak.*` files (no tracked modification); mirror regenerated and `MIRROR OK files=1` after each commit.
- **Files modified:** `~/Repositories/thinx-swarm/README.md`, `docker-compose.traefik.yml`
- **Verification:** `origin/master` == laptop HEAD == micro HEAD (`e29f19d`); 19 flags in the mirror.
- **Committed in:** thinx-swarm `f08f210`, `e29f19d`; `61bf7bbd`, `b7be4298`

**5. [Rule 2 - Missing critical] Dashboard bridge URL documented with the trailing slash after the gate finding**
- **Found during:** Task 3 (operator's first bridge attempt → 404)
- **Issue:** `api@internal` answers 404 to `/dashboard` without the trailing slash; the recipes already wrote `/dashboard/` but did not warn, and a 404 at the gate looks like a broken bridge.
- **Fix:** One sentence (`/dashboard` → 404; use `/dashboard/` or open `http://127.0.0.1:8080/` which redirects) added to the runbook recipe, AGENTS.md and the thinx-swarm README; gate result recorded in the runbook.
- **Files modified:** `.planning/runbooks/traefik-edge-hardening.md`, `AGENTS.md`, `~/Repositories/thinx-swarm/README.md`, `docker-compose.traefik.yml`
- **Verification:** secret-marker greps 0 on all three; e-mail grep 0 on the runbook and README (AGENTS.md's single pre-existing regex hit is the `git@` GitHub ssh URL in the builder CI note, unchanged at HEAD); keep-7442 sentence present; `MIRROR OK files=1`.
- **Committed in:** thinx-swarm `e29f19d`; `b7be4298`

---

**Total deviations:** 5 (2 blocking, 1 bug, 1 missing-critical documentation, 1 plan-directed exception). No live state differs from the plan's must-haves; the only live mutation was the planned `docker config rm tls-config-1`.
**Impact on plan:** none on the delivered security properties; every item is recorded for the verifier.

## Issues Encountered

- **Checkpoint (human-verify, blocking-human) — Task 3:** paused ≈09:50Z → ≈10:05Z. The operator first reported the loopback dashboard bridge returning 404; the orchestrator verified live that `/dashboard` (no slash) is 404 from `api@internal` while `/dashboard/` is 200 and `/` is 302. With the slash the dashboard rendered and the operator typed "approved" (console at `https://rtm.thinx.cloud/` confirmed working). No revert step was executed.
- `services/worker` gitlink was already modified in the working tree before this plan and was never staged (same as Plans 01/02).
- micro's `/mnt/gluster/deployment/swarm` carries seven pre-existing untracked `*.bak.*` files from Phases 30–31; no tracked file is modified there.

## Authentication Gates

None — ssh to micro and both git remotes worked without prompts.

## User Setup Required

None - no external service configuration required. (Operator follow-ups carried in `## Recorded for Phase 34`: notify the fotostim stack owner about `checkout.qooldata.com`; the three allow-list candidate IPs for the Phase 34 `ipAllowList` design.)

## Next Phase Readiness

- Phase 33 complete: all four ROADMAP success criteria proven at the end state and accepted by the operator; EDGE-API-01, EDGE-API-02, EDGE-TLS-01, EDGE-TLS-02, EDGE-TLS-03 close (shared-ID gate satisfied — all three plan SUMMARYs exist).
- Live end state: `traefik:v3.7.14 args=19 idx=38379946`, task `k47479ipt1mb`, loopback-only mgmt, `tls-config-2` the only tls-config, acme.json 23 entries 600 root, HSTS 17/17, `EDGE-SCAN OK`; thinx-swarm `e29f19d` == origin/master == micro HEAD == mirror banner.
- Not pushed by this plan (by design): `thinx-staging` of thinx-device-api (`a4975fed..b7be4298` + the metadata commit). The operator pushes when ready.
- Phase 34 inputs are in `## Recorded for Phase 34` (D-05 real client IPs before any ipAllowList / rateLimit, D-20 redirect gaps, D-16 sniStrict, curve policy, retired ACME names, log level / socket-proxy / SLA).
- `/gsd-verify-work 33` can harvest the `human_judgment: false` deliverables from the plan `<automated>` blocks (run with `/usr/bin/grep`, see deferred-items.md) and D7 from the recorded gate.

---
*Phase: 33-dashboard-lockdown-tls-hardening*
*Completed: 2026-10-09*

## Self-Check: PASSED

- Created/modified files exist on disk (7 in thinx-device-api incl. this SUMMARY, 1 in thinx-swarm) — FOUND.
- Commits `afe9f844`, `61bf7bbd`, `b7be4298` are ancestors of HEAD on `thinx-staging` (`git rev-list --count a4975fed..b7be4298` = 3); thinx-swarm `f08f210`, `e29f19d` are ancestors of `master` (== origin/master == micro HEAD).
- 0 secret markers / 0 e-mail addresses in this SUMMARY.
